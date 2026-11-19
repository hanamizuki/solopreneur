#!/usr/bin/env python3
"""sign-offs publisher: wrap a review page in the shared UI, publish it to the
configured target, and read every file back before printing the link.

  signoff.py publish <dir-or-html> --slug <slug> --title <title> [--reply-to TEXT] [--target NAME] [--raw] [--dry-run]
  signoff.py publish <dir-or-html> --update <id> [--title TEXT] [--reply-to TEXT] [--target NAME] [--raw]
  signoff.py rm <id> [--target NAME]
  signoff.py config [--target NAME]      print the resolved settings as JSON

Settings come from the `signoffs` block of `.solopreneur.json`, looked up from
the current directory (shared/config.md, "The `signoffs` block"). With no block
anywhere, pages go to docs/solopreneur/sign-offs/ in the main working tree.

Every write goes through server.py's `store`: in this process when the target
lives on this machine, or by shipping server.py's source over SSH and running
it under the host's python3 when it does not.

Exit codes: 0 done; 2 a check or the publish failed (the message says what to
fix); 3 published, but the read-back did not match: do not hand out the link.

Python standard library only, 3.9 syntax. macOS and Linux.
"""
import argparse
import getpass
import hashlib
import html
import html.parser
import http.client
import io
import json
import os
import pathlib
import re
import secrets
import shlex
import shutil
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import server  # noqa: E402  (sibling module: the store, also shipped over SSH)

SKILL_DIR = os.path.dirname(HERE)
PAGE_TEMPLATE = os.path.join(SKILL_DIR, "assets", "page.html")
SERVER_SOURCE = os.path.join(HERE, "server.py")
CONFIG_NAME = ".solopreneur.json"
GLOBAL_CONFIG = os.path.join("~", ".config", "solopreneur", "config.json")
DEFAULT_ROOT = os.path.join("docs", "solopreneur", "sign-offs")
LANGS = ("en", "zh-Hant")
PROVIDERS = ("local", "static", "server")
BLOCK_KEYS = ("root", "lang", "ttlDays", "replyTo", "defaultTarget", "targets")
TARGET_KEYS = ("provider", "host", "url", "dir")
# The store needs no agent, X11 or port forwarding: never hand them to a host that a
# repository's own config may have chosen.
SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
               "-o", "ForwardAgent=no", "-o", "ForwardX11=no", "-o", "ClearAllForwardings=yes"]
# A repository can ship its own .solopreneur.json: a host such as "-oProxyCommand=…"
# would reach ssh as an option, and shell syntax would reach any ProxyCommand that
# expands %h. Plain destinations only.
HOST_RE = re.compile(r"^[A-Za-z0-9_.@:][A-Za-z0-9_.@:-]*$")
# Runs on the host: read "<length>\n<server.py source>", execute it, and leave the
# request tar that follows on stdin for its `store` command.
# No single quotes inside, so shlex.quote() yields one plain '…' word for any login shell.
REMOTE_LOADER = 'import sys;b=sys.stdin.buffer;exec(compile(b.read(int(b.readline())),"sign-offs-server","exec"))'

WARN_IMAGE = 1536 * 1024
UI_HEADROOM = 64 * 1024  # the wrapped UI adds about 15 KB to index.html; the store counts the staged page
JUNK = {".DS_Store", "Thumbs.db"}
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic")
REF_FILES = (".html", ".htm", ".css")
REF_ATTRS = ("src", "href", "poster", "data-src")
# url(…) in any case (CSS names are case-insensitive), and @import "…", whose bare
# string is a URL too; @import url(…) is already a url().
CSS_URL_RE = re.compile(r"""url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|@import\s*(?:"([^"]*)"|'([^']*)')""", re.I)
FULL_DOC_RE = re.compile(rb"<\s*(?:!doctype|html|head|body)\b", re.I)
TOKEN_RE = re.compile(r"\{\{(\w+)\}\}")


class PublishError(Exception):
    def __init__(self, message, hint="", code=2):
        super().__init__(message)
        self.hint = hint
        self.code = code


def _run(cmd, cwd=None, timeout=10):
    try:
        r = subprocess.run(cmd, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def _git(cwd, *args):
    return _run(["git", *args], cwd=cwd)


def _too_long(text, limit):
    """Measured the way the store measures: runs of whitespace count as one space."""
    return len(" ".join(text.split())) > limit


# ---------- settings ----------

def _read_config(path):
    """The parsed JSON object, or None when nothing is there. A file that is there
    but unusable stops the lookup: stepping over it would silently resolve
    against a farther config."""
    try:
        st = os.stat(path)
    except FileNotFoundError:
        if os.path.lexists(path):
            raise PublishError("config is a broken symlink: %s" % path, "fix or remove it")
        return None
    except NotADirectoryError:
        return None
    except OSError as e:
        raise PublishError("cannot read config: %s (%s)" % (path, e))
    if not stat.S_ISREG(st.st_mode):
        raise PublishError("config is not a regular file: %s" % path)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except ValueError as e:
        raise PublishError("malformed JSON in config: %s (%s)" % (path, e))
    except OSError as e:
        raise PublishError("cannot read config: %s (%s)" % (path, e))
    if not isinstance(data, dict):
        raise PublishError("invalid config: %s: the top level must be an object" % path)
    return data


def find_config(cwd):
    """(path, parsed file) of the config whose `signoffs` block applies, or (None, None).

    $SOLOPRENEUR_CONFIG names the one file to use; otherwise the nearest ancestor
    .solopreneur.json that has a `signoffs` block (files configuring only other
    features are stepped over), then ~/.config/solopreneur/config.json."""
    explicit = os.environ.get("SOLOPRENEUR_CONFIG")
    if explicit:
        path = os.path.abspath(explicit)
        data = _read_config(path)
        if data is None:
            raise PublishError("$SOLOPRENEUR_CONFIG does not exist: %s" % path)
        return (path, data) if "signoffs" in data else (None, None)
    d = os.path.realpath(cwd)
    while True:
        path = os.path.join(d, CONFIG_NAME)
        data = _read_config(path)
        if data is not None and "signoffs" in data:
            return path, data
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    path = os.path.expanduser(GLOBAL_CONFIG)
    data = _read_config(path)
    if data is not None and "signoffs" in data:
        return path, data
    return None, None


def to_main_worktree(path):
    """The same location inside the main working tree when `path` lies in a linked
    worktree, so local pages outlive `git worktree remove`. Unchanged otherwise."""
    probe = path
    while not os.path.isdir(probe):
        parent = os.path.dirname(probe)
        if parent == probe:
            return path
        probe = parent
    out = _git(probe, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel")
    lines = (out or "").splitlines()
    if len(lines) < 2:
        return path
    common, top = lines[0], os.path.realpath(lines[1])
    # Only `<main>/.git` has a working tree as its parent; a submodule's common dir
    # is `.git/modules/<name>` and a bare repository has no working tree at all.
    if os.path.basename(common) != ".git":
        return path
    main = os.path.realpath(os.path.dirname(common))
    physical = os.path.join(os.path.realpath(probe), os.path.relpath(path, probe))
    rel = os.path.relpath(physical, top)
    if top == main or rel == ".." or rel.startswith(".." + os.sep):
        return path
    return os.path.normpath(os.path.join(main, rel))


def local_root(config_path, root, cwd):
    if root is None:
        base = _git(cwd, "rev-parse", "--show-toplevel") or os.path.realpath(cwd)
        return to_main_worktree(os.path.join(base, DEFAULT_ROOT))
    if os.path.isabs(root):
        return os.path.normpath(root)
    # Relative to the config file that declared it, as preview's root is.
    return to_main_worktree(os.path.normpath(os.path.join(os.path.dirname(config_path), root)))


def resolve(cwd, target_name=None):
    """Everything a publish needs, from the config or the built-in defaults."""
    path, data = find_config(cwd)
    block, warnings = {}, []

    def bad(field, why):
        return PublishError("invalid config: %s: signoffs%s %s" % (path, "." + field if field else "", why),
                            "fix the signoffs block")

    if data is not None:
        if data.get("schemaVersion") != 2:
            raise PublishError("invalid config: %s: schemaVersion must be 2" % path)
        block = data["signoffs"]
        if not isinstance(block, dict):
            raise bad("", "must be an object")
        warnings += ["%s: signoffs.%s is not a known setting and is ignored" % (path, k) for k in block if k not in BLOCK_KEYS]
    lang = block.get("lang", "en")
    if lang not in LANGS:
        raise bad("lang", "must be one of: %s" % ", ".join(LANGS))
    ttl = block.get("ttlDays", server.TTL_DEFAULT)
    if isinstance(ttl, bool) or not isinstance(ttl, int) or not 1 <= ttl <= server.TTL_MAX:
        raise bad("ttlDays", "must be a whole number from 1 to %d" % server.TTL_MAX)
    # A key that is present must hold a valid value: null is not "use the default"
    # (the schema types every key, so preview would refuse the same file).
    reply_to = block.get("replyTo")
    if "replyTo" in block and (not isinstance(reply_to, str) or _too_long(reply_to, server.REPLY_TO_MAX)):
        raise bad("replyTo", "must be text of at most %d characters" % server.REPLY_TO_MAX)
    root = block.get("root")
    if "root" in block and (not isinstance(root, str) or not root):
        raise bad("root", "must be a non-empty path")
    targets = block.get("targets", {})
    if not isinstance(targets, dict):
        raise bad("targets", "must be an object")
    # Every target, not only the one in use: preview validates the whole file
    # against the schema, so a value let through here would break preview there,
    # and a broken target must not wait for the day --target picks it.
    for tname, t in targets.items():
        if not isinstance(t, dict):
            raise bad("targets.%s" % tname, "must be an object")
        warnings += ["%s: signoffs.targets.%s.%s is not a known setting and is ignored" % (path, tname, k)
                     for k in t if k not in TARGET_KEYS]
        if t.get("provider") not in PROVIDERS:
            raise bad("targets.%s.provider" % tname, "must be one of: %s" % ", ".join(PROVIDERS))
        for key in ("host", "url", "dir"):
            if key in t and (not isinstance(t[key], str) or not t[key]):
                raise bad("targets.%s.%s" % (tname, key), "must be a non-empty string")
        if "host" in t and not HOST_RE.match(t["host"]):
            raise bad("targets.%s.host" % tname, "must be an SSH destination such as me@box")
        if t["provider"] == "local":
            if "host" in t or "url" in t or "dir" in t:
                raise bad("targets.%s" % tname, "takes no host, url or dir: a local target writes to signoffs.root")
            continue
        url = t.get("url") or ""
        try:
            url_host = urllib.parse.urlsplit(url).hostname
        except ValueError:  # an unbalanced [ in the host, for one
            url_host = None
        # Page ids are appended to url as text: a ?query or #fragment (even an empty one) would swallow them.
        if not url.startswith(("http://", "https://")) or not url_host or "?" in url or "#" in url:
            raise bad("targets.%s.url" % tname, "must be the http(s) address the pages are served at, without ?query or #fragment")
        if t["provider"] == "static" and "dir" not in t:
            raise bad("targets.%s.dir" % tname, "is required: the folder the web server serves")
        if "dir" in t and not (os.path.isabs(t["dir"]) or t["dir"].startswith("~/")):
            raise bad("targets.%s.dir" % tname, "must be an absolute path or start with ~/ (expanded on the host)")
    default = block.get("defaultTarget")
    if "defaultTarget" in block and (not isinstance(default, str) or not default):
        raise bad("defaultTarget", "must be the name of a target")
    name = target_name or default
    if name is None:
        target = {"provider": "local"}
    elif name not in targets:
        where = "--target %s" % name if target_name else "signoffs.defaultTarget %r" % name
        raise PublishError("%s: no such target (have: %s)" % (where, ", ".join(sorted(targets)) or "none"),
                           "add it under signoffs.targets in %s" % (path or "a .solopreneur.json"))
    else:
        target = targets[name]

    provider = target["provider"]
    settings = {"configPath": path, "target": name, "provider": provider, "lang": lang, "ttlDays": ttl,
                "replyTo": reply_to if reply_to is not None else server.load_strings(lang)["defaultReplyTo"]}

    if provider == "local":
        directory = local_root(path, root, cwd)
        settings.update(host=None, local=True, dir=directory, url=pathlib.Path(directory).as_uri() + "/")
    else:
        url = target["url"]
        directory = target.get("dir", server.DEFAULT_DIR)  # a static target always names one (checked above)
        host = target.get("host")
        local = is_local_host(host)
        if local:
            directory = os.path.abspath(os.path.expanduser(directory))
        if url.startswith("http://") and (urllib.parse.urlsplit(url).hostname or "") not in server.LOOPBACK:
            warnings.append("%s is plain http: browsers only allow the copy button over https, so the reader "
                            "will have to copy the reply by hand" % url)
        settings.update(host=host, local=local, dir=directory, url=url if url.endswith("/") else url + "/")
    settings["warnings"] = warnings
    return settings


# ---------- is the target host this machine? ----------

def _local_names():
    names = {"localhost"}
    names.add(socket.gethostname().lower())
    if sys.platform == "darwin":
        local = _run(["scutil", "--get", "LocalHostName"])
        if local:
            names.add(local.lower())
    return names


def _is_local_address(name):
    """True when `name` resolves to an address assigned to this machine: binding
    to an address only succeeds for this machine's own (Tailscale's included)."""
    try:
        infos = socket.getaddrinfo(name, None, proto=socket.IPPROTO_UDP)
    except (OSError, UnicodeError):
        return False
    for family, _type, _proto, _canon, addr in infos:
        try:
            with socket.socket(family, socket.SOCK_DGRAM) as s:
                s.bind((addr[0], 0))
            return True
        except OSError:
            continue
    return False


def is_local_host(host):
    """Whether an SSH destination is this machine, so one config shared by several
    machines writes locally on the store host instead of SSHing to itself.

    A wrong "yes" cannot hand out a broken link: the read-back then fails (exit 3)."""
    if not host or host == "local":
        return True
    user, _, name = host.rpartition("@")
    if user and user != getpass.getuser():
        return False
    hostname = None
    resolved = _run(["ssh", "-G", "--", host], timeout=5) or ""
    for line in resolved.splitlines():
        key, _, value = line.partition(" ")
        value = value.strip()
        if key == "hostname" and value:
            hostname = value.lower()
        elif key == "user" and value and not user:
            user = value
        elif (key == "port" and value != "22") or (key in ("proxyjump", "proxycommand") and value.lower() != "none"):
            return False  # reached through another port or a jump host: a VM or a tunnel, whatever the name
    if user and user != getpass.getuser():
        return False
    # ssh connects to the HostName it resolved, so an alias named after this machine can
    # still lead elsewhere: the alias itself counts only when ssh could not resolve it.
    name = hostname or name.lower()
    # Whole names only (build.home is not build.office), or an address this machine holds.
    return name in _local_names() or _is_local_address(name)


# ---------- page checks ----------

def _srcset_urls(value):
    """The candidate URLs of a srcset, split as the HTML spec does: a URL runs to the
    next whitespace and may hold commas (`a,b.png`, a data: URL). Commas ending it,
    or else the first comma after its descriptors, start the next candidate."""
    urls, pos, end = [], 0, len(value)
    while True:
        while pos < end and value[pos] in " \t\n\f\r,":
            pos += 1
        if pos == end:
            return urls
        start = pos
        while pos < end and value[pos] not in " \t\n\f\r":
            pos += 1
        url = value[start:pos]
        if url.endswith(","):
            url = url.rstrip(",")
        else:
            pos = value.find(",", pos)  # past the descriptors
            if pos < 0:
                pos = end
        urls.append(url)


class _Tags(html.parser.HTMLParser):
    """Attribute values as a browser reads them (quoted or not, character references
    decoded), from start and self-closing tags only: comments and the text of
    <script> and <style> hold no tags. Also the CSS a page carries: <style>
    elements and style attributes, never its prose, where "URL(s)" is just a word."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.items, self.css = [], [], []
        self._in_style = False

    def handle_starttag(self, tag, attrs):  # self-closing tags arrive here too
        if tag == "style":
            self._in_style = True
        for name, value in attrs:
            if name == "data-item":
                self.items.append((tag, value or ""))  # a bare data-item is an empty id
            elif value and name in REF_ATTRS:
                self.refs.append(value)
            elif value and name == "srcset":
                self.refs.extend(_srcset_urls(value))
            elif value and name == "style":
                self.css.append(value)

    def handle_endtag(self, tag):
        if tag == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_style:
            self.css.append(data)

    def error(self, message):  # Python 3.9 reports here; 3.10-3.12 raise AssertionError themselves
        raise AssertionError(message)


def _tags(text):
    p = _Tags()
    try:
        p.feed(text)
        p.close()
    except AssertionError as e:  # Python 3.9-3.12 give up on a malformed "<![…"; later ones read it as a comment
        raise PublishError("cannot parse the HTML: %s" % e, "fix or remove that markup")
    return p


def _refs(text, is_css):
    if is_css:
        found, css = [], [text]
    else:
        tags = _tags(text)
        found, css = tags.refs, tags.css
    found += [next(g for g in m.groups() if g is not None) for chunk in css for m in CSS_URL_RE.finditer(chunk)]
    return [r.strip() for r in found]


def check_ref(ref, from_rel, files):
    """An error message for one reference, or None when it is fine."""
    if not ref or ref.startswith("#") or ref.startswith("//"):
        return None
    low = ref.lower()
    if low.startswith("file:"):
        return "%s links a local file %s: readers cannot open it; copy the file into the page folder and use a relative path" % (from_rel, ref)
    if re.match(r"[a-z][a-z0-9+.-]*:", low):  # http:, data:, mailto: and every other scheme
        return None
    if ref.startswith("/"):
        return "%s uses a root-absolute path %s: on the published site it points elsewhere; use a relative path" % (from_rel, ref)
    path = urllib.parse.unquote(re.split(r"[?#]", ref, maxsplit=1)[0])
    if not path:
        return None
    target = os.path.normpath(os.path.join(os.path.dirname(from_rel), path)).replace(os.sep, "/")
    if target == ".." or target.startswith("../"):
        return "%s links %s outside the page folder: move the file into the folder" % (from_rel, ref)
    if path.endswith("/"):  # every provider: the same page may go out as a local one
        return ("%s links the folder %s: name the file (%sindex.html); over file:// a folder opens as a listing"
                % (from_rel, ref, path))
    if target not in files and target not in server.RESERVED:  # meta.json and meta.js are written at publish time
        return "%s links %s, which is not in the page folder (looked for %s)" % (from_rel, ref, target)
    return None


def collect(src):
    """({relative path: absolute path}, warnings) for a page folder or one html file."""
    src = os.path.abspath(os.path.expanduser(src))
    files, warnings, errors = {}, [], []
    if os.path.islink(src):
        raise PublishError("%s is a symlink" % src, "pass the real file or folder")
    if os.path.isfile(src):
        if not src.lower().endswith((".html", ".htm")):
            raise PublishError("a single file must be .html: %s" % src)
        files["index.html"] = src
    elif os.path.isdir(src):
        for dirpath, dirnames, names in os.walk(src, followlinks=False):
            for d in list(dirnames):
                full = os.path.join(dirpath, d)
                rel = os.path.relpath(full, src).replace(os.sep, "/")
                if os.path.islink(full):
                    errors.append("folder %s is a symlink: use a real folder" % rel)
                    dirnames.remove(d)
                elif d.startswith("."):
                    errors.append("folder %s starts with a dot: dot paths are never published; rename or remove it" % rel)
                    dirnames.remove(d)
            for n in names:
                full = os.path.join(dirpath, n)
                rel = os.path.relpath(full, src).replace(os.sep, "/")
                if n in JUNK:
                    continue
                if os.path.islink(full):
                    errors.append("%s is a symlink: use a real file" % rel)
                elif not os.path.isfile(full):  # a named pipe, socket or device: reading a pipe blocks forever
                    errors.append("%s is not a regular file: use a real file" % rel)
                elif n.startswith("."):
                    errors.append("%s starts with a dot: dot files are never published; rename or remove it" % rel)
                elif rel in server.RESERVED:
                    errors.append("%s is written at publish time: rename yours" % rel)
                else:
                    files[rel] = full
        if "index.html" not in files:
            errors.append("the folder has no index.html")
    else:
        raise PublishError("not found: %s" % src)

    # Sizes first: a page over the cap is refused before any of its files is opened.
    sizes = {rel: os.path.getsize(full) for rel, full in files.items()}
    total = sum(sizes.values())
    over = total > server.MAX_PAYLOAD - UI_HEADROOM
    if over:
        errors.append("the page is %.1f MB, over the %d MB limit: compress the screenshots" % (total / 1048576, server.MAX_PAYLOAD >> 20))
    for rel, full in sorted(files.items()):
        size = sizes[rel]
        if rel.lower().endswith(IMAGE_EXT) and size > WARN_IMAGE:
            warnings.append("%s is %.1f MB and will load slowly on a phone; shrink it first (for example "
                            "`sips -Z 1600 -s format jpeg -s formatOptions 80 in.png --out out.jpg` on macOS)" % (rel, size / 1048576))
        if rel.lower().endswith(REF_FILES) and not over:
            with open(full, encoding="utf-8", errors="replace") as f:
                text = f.read()
            for ref in _refs(text, rel.lower().endswith(".css")):
                err = check_ref(ref, rel, files)
                if err:
                    errors.append(err)
            if "/Users/" in text or "/home/" in text or "file://" in text:
                warnings.append("%s mentions a local path (/Users/, /home/ or file://) that readers cannot open; ignore this if it is only prose" % rel)
    if errors:
        raise PublishError("the page did not pass its checks:\n  - " + "\n  - ".join(dict.fromkeys(errors)), "fix these and publish again")
    return files, warnings


def check_content(index, raw):
    """A content page is a fragment; the publisher supplies the document around it."""
    if raw:
        return
    if FULL_DOC_RE.search(index):
        raise PublishError("index.html is a whole HTML document",
                           "write only the content (an intro and <section data-item> blocks); the review controls, "
                           "header and styles are added at publish time. For a page with its own UI, pass --raw")
    try:
        text = index.decode("utf-8")
    except UnicodeDecodeError:
        raise PublishError("index.html is not UTF-8")
    items = _tags(text).items
    others = sorted({tag for tag, _ in items} - {"section"})
    if others:
        # The page builds controls for section[data-item] only: any other element would drop out of the reply.
        raise PublishError("data-item is only read on <section> elements, not on <%s>" % ">, <".join(others),
                           'wrap each item in <section data-item="id">')
    ids = [value.strip() for _, value in items]
    if any(not i for i in ids):
        raise PublishError("a <section data-item> has an empty id", "give every item a short unique id, such as 1, 2, A3")
    spaced = [i for i in ids if len(i.split()) > 1]  # a reply line starts with the id: it must end at the first space
    if spaced:
        raise PublishError("item ids cannot contain spaces: %s" % ", ".join(json.dumps(i, ensure_ascii=False) for i in spaced),
                           "use short ids such as 1, 2, A3")
    dups = sorted({i for i in ids if ids.count(i) > 1})
    if dups:
        raise PublishError("item ids repeat: %s" % ", ".join(dups), "replies name items by id, so each id must be unique")


# ---------- building the page ----------

def wrap_page(content, lang, title, strings, content_id):
    """The content inside the shared review UI (assets/page.html). One pass, so
    tokens written inside the content or the title stay as written. The content
    id lands in <meta name="signoff-content">, which the page compares with
    meta.json's contentId: a reload during an update must not pair the old
    questions with the new revision."""
    with open(PAGE_TEMPLATE, encoding="utf-8") as f:
        template = f.read()
    values = {"content": content.decode("utf-8"), "strings": server.script_json(strings), "lang": lang,
              "title": html.escape(title), "contentId": content_id}
    return TOKEN_RE.sub(lambda m: values[m.group(1)] if m.group(1) in values else html.escape(strings[m.group(1)]),
                        template).encode("utf-8")


# ---------- sending and reading back ----------

def detect_source():
    """Who published, recorded in meta.json (the index shows machine, config and
    tmux): never typed by the model, so clipped to what the store accepts."""
    src = {}
    name = _run(["scutil", "--get", "LocalHostName"]) if sys.platform == "darwin" else None
    src["machine"] = (name or socket.gethostname().split(".")[0]).lower()
    cfg = os.environ.get("CLAUDE_CONFIG_DIR") or os.environ.get("CODEX_HOME")
    if cfg:
        src["config"] = os.path.basename(cfg.rstrip("/"))
    pane = os.environ.get("TMUX_PANE")
    if os.environ.get("TMUX") and pane:
        tm = _run(["tmux", "display-message", "-p", "-t", pane, "#S:#W"])
        if tm:
            src["tmux"] = tm
    top = _git(os.getcwd(), "rev-parse", "--show-toplevel")
    if top:
        src["repo"] = os.path.basename(top)
    return {k: " ".join(v.split())[:server.SOURCE_MAX] for k, v in src.items() if v}


def build_request(files, request):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:") as tf:
        data = json.dumps(request, ensure_ascii=False).encode("utf-8")
        ti = tarfile.TarInfo("request.json")
        ti.size = len(data)
        tf.addfile(ti, io.BytesIO(data))
        for rel in sorted(files):
            tf.add(files[rel], arcname="payload/" + rel, recursive=False)
    return buf.getvalue()


def ssh_argv(host, command):
    """The command that runs `command` on `host` (tests swap this for a local shell)."""
    return ["ssh"] + SSH_OPTIONS + ["--", host, command]


def remote_store(host, directory, data):
    with open(SERVER_SOURCE, "rb") as f:
        code = f.read()
    # -I: neither the login directory nor PYTHONPATH can shadow a standard module there.
    command = "python3 -I -c %s store --dir %s" % (shlex.quote(REMOTE_LOADER), shlex.quote(directory))
    try:
        r = subprocess.run(ssh_argv(host, command), input=b"%d\n" % len(code) + code + data,
                           capture_output=True, timeout=180)
    except subprocess.TimeoutExpired:
        raise PublishError("%s did not answer within 3 minutes" % host, "check the network and publish again")
    except FileNotFoundError:
        raise PublishError("ssh is not installed on this machine")
    stderr = r.stderr.decode(errors="replace").strip()
    if r.returncode == 255:
        raise PublishError("cannot reach %s over SSH: %s" % (host, stderr[-300:]),
                           "make sure `ssh %s` works here without a password prompt" % host)
    lines = r.stdout.decode(errors="replace").strip().splitlines()
    try:
        return json.loads(lines[-1])
    except (IndexError, ValueError):
        raise PublishError("unreadable answer from %s (exit %d): %s" % (host, r.returncode, (stderr or "")[-500:]),
                           "the host needs python3 (3.9 or newer) on the PATH of a non-interactive SSH session")


def call_store(settings, request, files=None):
    data = build_request(files or {}, request)
    if settings["local"]:
        result = server.handle_store(settings["dir"], data)
    else:
        result = remote_store(settings["host"], settings["dir"], data)
    if not result.get("ok"):
        raise PublishError("the store refused the request: %s" % result.get("error"), result.get("hint", ""))
    if result.get("warning"):
        print("⚠️ " + result["warning"], file=sys.stderr)
    return result


def fetch(url, tries=3):
    """(body, the address it came from in the end: redirects are followed)."""
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Cache-Control": "no-cache"}), timeout=20) as r:
                return r.read(), r.geturl()
        except (OSError, http.client.HTTPException) as e:  # URLError is an OSError; a cut response is neither
            last = e
            if i + 1 < tries:
                time.sleep(1 + i)
    raise PublishError("cannot read back %s: %s" % (url, last),
                       "check that the target's url serves its dir (for the server provider: the service is "
                       "running and https points at it); do not hand out the link", code=3)


def read_back(settings, result, content_id):
    """Fetch every published file from the reader's address and compare checksums,
    then the link itself: for static and server it is the folder address <id>/,
    which a web server without directory indexes refuses while serving <id>/index.html,
    and which one that strips trailing slashes redirects to <id>."""
    base = settings["url"] + result["id"] + "/"
    for rel, digest in sorted(result["files"].items()):
        url = base + "/".join(urllib.parse.quote(p) for p in rel.split("/"))
        if hashlib.sha256(fetch(url)[0]).hexdigest() != digest:
            raise PublishError("read-back mismatch: %s differs from what was sent" % rel,
                               "a cache may be serving an old copy; do not hand out the link, publish again", code=3)
    link = page_url(settings, result["id"])
    hint = "the web server must answer %s with the page's index.html (a directory index); do not hand out the link" % link
    try:
        page, final = fetch(link)
    except PublishError as e:
        raise PublishError(str(e), hint, code=3)
    # Another scheme or host (http upgraded to https) is fine; another path is not: the
    # page loads meta.json and its images relative to the address it ends up at.
    if urllib.parse.urlsplit(final).path != urllib.parse.urlsplit(link).path:
        raise PublishError("read-back mismatch: %s redirects to %s" % (link, final),
                           "the web server must serve %s without redirecting it to another path; "
                           "do not hand out the link" % link, code=3)
    if hashlib.sha256(page).hexdigest() != result["files"]["index.html"]:
        raise PublishError("read-back mismatch: %s is not the page just published" % link, hint, code=3)
    try:
        meta = json.loads(fetch(base + "meta.json")[0].decode("utf-8"))
    except ValueError:
        meta = None
    if not isinstance(meta, dict):
        raise PublishError("read-back found no readable meta.json at %s" % base,
                           "do not hand out the link; check what the url serves, then publish again", code=3)
    if meta.get("revision") != result["revision"] or meta.get("contentId") != content_id:
        raise PublishError("read-back found revision %r, not the %r just published" % (meta.get("revision"), result["revision"]),
                           "someone may have updated the page at the same moment; publish again", code=3)
    return meta


def page_url(settings, page_id):
    # file:// has no directory index: name the file.
    return settings["url"] + page_id + ("/index.html" if settings["provider"] == "local" else "/")


def index_request(settings, strings):
    """What static and local stores need to rewrite index.html; the server renders its own."""
    if settings["provider"] == "server":
        return None
    return {"lang": settings["lang"], "days": settings["ttlDays"],
            "strings": {k: strings[k] for k in server.INDEX_KEYS}}


def _signoffs_entry(directory, name):
    """Whether <directory>/<name> is something sign-offs keeps in its folder."""
    if name == ".gitignore" or name in JUNK or name in server.OWN_ENTRIES:
        return True
    if name == "index.html":
        try:
            server._guard_index(directory)  # raises for an index.html sign-offs did not write
        except (server.StoreError, OSError):
            return False
        return True
    return server.page_meta(directory, name) is not None


def prepare_local_root(directory):
    """Create the local folder with `*` as its .gitignore's last rule, so screenshots never get committed.
    Refuses a folder that is not dedicated to sign-offs (a .gitignore of `*` at a
    repository root would hide every new file)."""
    real = os.path.realpath(directory)
    if real in (os.path.realpath(os.path.expanduser("~")), os.path.realpath(os.sep)) or (
            os.path.isdir(directory) and os.path.realpath(_git(directory, "rev-parse", "--show-toplevel") or "/nonexistent") == real):
        raise PublishError("%s cannot hold sign-off pages: use a folder dedicated to them" % directory,
                           "set signoffs.root to a subfolder such as docs/solopreneur/sign-offs")
    os.makedirs(directory, exist_ok=True)
    ignore = os.path.join(directory, ".gitignore")
    if os.path.islink(ignore):
        # Appending through a link could hide every new file of the repository it points into.
        raise PublishError("%s is a symlink" % ignore, "replace it with a regular file holding the line *")
    try:
        with open(ignore, encoding="utf-8") as f:
            rules = f.read()
    except FileNotFoundError:
        rules = None
    # Git applies the last matching rule, so only a final `*` ignores everything: `*`
    # then `!*.png` brings the screenshots back. As git reads it: a comment starts at
    # the first column, trailing spaces (not tabs) are dropped, leading ones are part
    # of the pattern.
    effective = [r.rstrip(" ") for r in (rules or "").splitlines() if r.strip() and not r.startswith("#")]
    if effective[-1:] != ["*"]:
        # About to claim the folder: `*` would hide every new file in it from git,
        # and would stay behind even when the store then refuses the publish. Only
        # when everything in it is sign-offs' own: other tools name files .lock too.
        others = sorted(n for n in os.listdir(directory) if not _signoffs_entry(directory, n))
        if others:
            raise PublishError("%s already holds other files (%s): it cannot be the sign-offs folder"
                               % (directory, ", ".join(others[:3])),
                               "set signoffs.root to a folder of its own, such as docs/solopreneur/sign-offs")
        with open(ignore, "a", encoding="utf-8") as f:
            f.write(("" if not rules or rules.endswith("\n") else "\n") + "*\n")


# ---------- commands ----------

def cmd_publish(args):
    if not args.src.strip():
        raise PublishError("no page folder given", "pass the folder that holds index.html (is a shell variable empty?)")
    if bool(args.slug) == bool(args.update):
        raise PublishError("pass either --slug (a new page) or --update <id> (a new revision)")
    if args.slug and (not server.SLUG_RE.match(args.slug) or len(args.slug) > server.SLUG_MAX):
        raise PublishError("malformed slug: %r" % args.slug,
                           "lowercase letters, digits and single hyphens, at most %d characters, e.g. e2e-sync" % server.SLUG_MAX)
    if args.update and not server.ID_RE.match(args.update):
        raise PublishError("malformed id: %r" % args.update, "use the id printed when the page was published, e.g. e2e-sync-k3f")
    if args.slug and not (args.title or "").strip():
        raise PublishError("a new page needs --title", "it heads the page and the index; write it for the reader")
    if args.title and _too_long(args.title, server.TITLE_MAX):
        raise PublishError("--title is longer than %d characters" % server.TITLE_MAX, "shorten it; the page holds the detail")
    if args.reply_to and _too_long(args.reply_to, server.REPLY_TO_MAX):
        raise PublishError("--reply-to is longer than %d characters" % server.REPLY_TO_MAX)
    settings = resolve(os.getcwd(), args.target)
    strings = server.load_strings(settings["lang"])
    files, warnings = collect(args.src)
    with open(files["index.html"], "rb") as f:
        index = f.read()
    check_content(index, args.raw)
    for w in settings["warnings"] + warnings:
        print("⚠️ " + w, file=sys.stderr)
    if args.dry_run:
        print("Checks passed, nothing published: %d file(s) for the %s target" % (len(files), settings["provider"]))
        for rel in sorted(files):
            print("  " + rel)
        return 0
    if settings["provider"] == "local":
        prepare_local_root(settings["dir"])
    content_id = secrets.token_hex(8)
    # --raw goes out untouched: the page brings its own UI and protocol.
    page = index if args.raw else wrap_page(index, settings["lang"], args.title or strings["defaultTitle"], strings, content_id)
    workdir = tempfile.mkdtemp(prefix="signoff-publish-")
    try:
        staged = os.path.join(workdir, "index.html")
        with open(staged, "wb") as f:
            f.write(page)
        files = dict(files, **{"index.html": staged})
        request = {
            "mode": "update" if args.update else "new",
            "title": args.title or "",
            "replyTo": args.reply_to or ("" if args.update else settings["replyTo"]),
            # A static portal may be public: do not publish machine, tmux and repo names there.
            "source": {} if settings["provider"] == "static" else detect_source(),
            "contentId": content_id,
            "ttlDays": settings["ttlDays"],
            "files": {rel: server.sha256_file(full) for rel, full in files.items()},
            "index": index_request(settings, strings),
        }
        request["slug" if args.slug else "id"] = args.slug or args.update
        result = call_store(settings, request, files)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    meta = read_back(settings, result, content_id)
    print("✅ Published revision %d: %s" % (result["revision"], page_url(settings, result["id"])))
    print("Expires: %s (%d days after this publish; every update restarts the clock)"
          % (meta["expiresAt"][:16].replace("T", " "), settings["ttlDays"]))
    print("Reply to: %s" % (meta.get("replyTo") or "-"))
    print("Update: publish the same folder again with --update %s%s"
          % (result["id"], " --target " + shlex.quote(args.target) if args.target else ""))
    return 0


def cmd_rm(args):
    if not server.ID_RE.match(args.id):
        raise PublishError("malformed id: %r" % args.id)
    settings = resolve(os.getcwd(), args.target)
    call_store(settings, {"mode": "rm", "id": args.id, "index": index_request(settings, server.load_strings(settings["lang"]))})
    print("Removed %s" % args.id)
    return 0


def cmd_config(args):
    print(json.dumps(resolve(os.getcwd(), args.target), ensure_ascii=False, indent=2))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Publish temporary review pages (sign-offs).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    pp = sub.add_parser("publish", help="publish a new page or a new revision")
    pp.add_argument("src", help="page folder (holding index.html) or a single .html file")
    pp.add_argument("--slug", help="new page: lowercase letters, digits and hyphens, at most 12 characters")
    pp.add_argument("--update", metavar="ID", help="new revision of the page with this id")
    pp.add_argument("--title", help="page title (required for a new page)")
    pp.add_argument("--reply-to", help="where the reader pastes the reply (default: signoffs.replyTo)")
    pp.add_argument("--target", help="a target from signoffs.targets (default: signoffs.defaultTarget)")
    pp.add_argument("--raw", action="store_true", help="publish a full custom page as is, without the shared UI")
    pp.add_argument("--dry-run", action="store_true", help="run the checks only")
    rp = sub.add_parser("rm", help="remove a page")
    rp.add_argument("id")
    rp.add_argument("--target")
    cp = sub.add_parser("config", help="print the resolved settings")
    cp.add_argument("--target")
    args = ap.parse_args(argv)
    try:
        return {"publish": cmd_publish, "rm": cmd_rm, "config": cmd_config}[args.cmd](args)
    except PublishError as e:
        print("❌ " + str(e), file=sys.stderr)
        if e.hint:
            print("→ " + e.hint, file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
