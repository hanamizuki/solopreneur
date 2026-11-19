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
import io
import ipaddress
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
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import server  # noqa: E402  (sibling module: the store, also shipped over SSH)

SKILL_DIR = os.path.dirname(HERE)
PAGE_TEMPLATE = os.path.join(SKILL_DIR, "assets", "page.html")
STRINGS_FILE = os.path.join(SKILL_DIR, "assets", "strings.json")
SERVER_SOURCE = os.path.join(HERE, "server.py")
CONFIG_NAME = ".solopreneur.json"
GLOBAL_CONFIG = os.path.join("~", ".config", "solopreneur", "config.json")
DEFAULT_ROOT = os.path.join("docs", "solopreneur", "sign-offs")
LANGS = ("en", "zh-Hant")
PROVIDERS = ("local", "static", "server")
BLOCK_KEYS = ("root", "lang", "ttlDays", "replyTo", "defaultTarget", "targets")
TARGET_KEYS = ("provider", "host", "url", "dir")
SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]
# Runs on the host: read "<length>\n<server.py source>", execute it, and leave the
# request tar that follows on stdin for its `store` command.
# No single quotes inside, so shlex.quote() yields one plain '…' word for any login shell.
REMOTE_LOADER = 'import sys;b=sys.stdin.buffer;exec(compile(b.read(int(b.readline())),"sign-offs-server","exec"))'

WARN_IMAGE = 1536 * 1024
UI_HEADROOM = 64 * 1024  # the wrapped UI adds about 15 KB to index.html; the store counts the staged page
JUNK = {".DS_Store", "Thumbs.db"}
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic")
REF_FILES = (".html", ".htm", ".css")
EXTERNAL_SCHEMES = ("http:", "https:", "data:", "mailto:", "tel:", "blob:", "about:", "javascript:")
ATTR_RE = re.compile(r"""(?i)\b(?:src|href|poster|data-src)\s*=\s*(?:"([^"]*)"|'([^']*)')""")
SRCSET_RE = re.compile(r"""(?i)\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')""")
CSS_URL_RE = re.compile(r"""url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)""")
FULL_DOC_RE = re.compile(rb"<\s*(?:!doctype|html|head|body)\b", re.I)
ITEM_RE = re.compile(r"""(?i)\bdata-item\s*=\s*(?:"([^"]*)"|'([^']*)')""")
TOKEN_RE = re.compile(r"\{\{(\w+)\}\}")
CONTENT_META_RE = re.compile(rb"""<meta\s+name=["']signoff-content["'][^>]*>\s*""", re.I)


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
    reply_to = block.get("replyTo")
    if reply_to is not None and not isinstance(reply_to, str):
        raise bad("replyTo", "must be text")
    root = block.get("root")
    if root is not None and (not isinstance(root, str) or not root):
        raise bad("root", "must be a non-empty path")
    targets = block.get("targets", {})
    if not isinstance(targets, dict):
        raise bad("targets", "must be an object")
    name = target_name or block.get("defaultTarget")
    if name is None:
        name, target = None, {"provider": "local"}
    elif name not in targets:
        where = "--target %s" % name if target_name else "signoffs.defaultTarget %r" % name
        raise PublishError("%s: no such target (have: %s)" % (where, ", ".join(sorted(targets)) or "none"),
                           "add it under signoffs.targets in %s" % (path or "a .solopreneur.json"))
    else:
        target = targets[name]
        if not isinstance(target, dict):
            raise bad("targets.%s" % name, "must be an object")
        warnings += ["%s: signoffs.targets.%s.%s is not a known setting and is ignored" % (path, name, k)
                     for k in target if k not in TARGET_KEYS]

    provider = target.get("provider")
    if provider not in PROVIDERS:
        raise bad("targets.%s.provider" % name, "must be one of: %s" % ", ".join(PROVIDERS))
    for key in ("host", "url", "dir"):
        if key in target and (not isinstance(target[key], str) or not target[key]):
            raise bad("targets.%s.%s" % (name, key), "must be a non-empty string")
    # A repository can ship its own .solopreneur.json: a host such as
    # "-oProxyCommand=…" would otherwise reach ssh as an option and run a command.
    if "host" in target and (target["host"].startswith("-") or re.search(r"\s", target["host"])):
        raise bad("targets.%s.host" % name, "must be an SSH destination such as me@box")
    settings = {"configPath": path, "target": name, "provider": provider, "lang": lang, "ttlDays": ttl,
                "replyTo": reply_to if reply_to is not None else load_strings(lang)["defaultReplyTo"]}

    if provider == "local":
        if "host" in target or "url" in target or "dir" in target:
            raise bad("targets.%s" % name, "takes no host, url or dir: a local target writes to signoffs.root")
        directory = local_root(path, root, cwd)
        settings.update(host=None, local=True, dir=directory, url=pathlib.Path(directory).as_uri() + "/")
    else:
        url = target.get("url")
        if not url or not url.startswith(("http://", "https://")):
            raise bad("targets.%s.url" % name, "must be the http(s) address the pages are served at")
        directory = target.get("dir", server.DEFAULT_DIR if provider == "server" else None)
        if directory is None:
            raise bad("targets.%s.dir" % name, "is required: the folder the web server serves")
        if not (os.path.isabs(directory) or directory.startswith("~/")):
            raise bad("targets.%s.dir" % name, "must be an absolute path or start with ~/ (expanded on the host)")
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
    names = {name.lower()}
    resolved = _run(["ssh", "-G", "--", host], timeout=5) or ""
    for line in resolved.splitlines():
        key, _, value = line.partition(" ")
        if key == "hostname" and value:
            names.add(value.strip().lower())
        elif key == "user" and value and not user:
            user = value.strip()
    if user and user != getpass.getuser():
        return False
    mine = _local_names()
    for n in names:
        try:
            ipaddress.ip_address(n)
        except ValueError:
            if n in mine:  # whole names only: build.home is not build.office
                return True
        if _is_local_address(n):
            return True
    return False


# ---------- page checks ----------

def _refs(text, is_css):
    found = []
    if not is_css:
        for m in ATTR_RE.finditer(text):
            found.append(m.group(1) if m.group(1) is not None else m.group(2))
        for m in SRCSET_RE.finditer(text):
            value = m.group(1) if m.group(1) is not None else m.group(2)
            found.extend(part.strip().split()[0] for part in value.split(",") if part.strip())
    for m in CSS_URL_RE.finditer(text):
        found.append(next(g for g in m.groups() if g is not None))
    return [r.strip() for r in found]


def check_ref(ref, from_rel, files):
    """An error message for one reference, or None when it is fine."""
    if not ref or ref.startswith("#") or ref.startswith("//"):
        return None
    low = ref.lower()
    if low.startswith("file:"):
        return "%s links a local file %s: readers cannot open it; copy the file into the page folder and use a relative path" % (from_rel, ref)
    if low.startswith(EXTERNAL_SCHEMES) or re.match(r"^[a-z][a-z0-9+.-]*:", low):
        return None
    if ref.startswith("/"):
        return "%s uses a root-absolute path %s: on the published site it points elsewhere; use a relative path" % (from_rel, ref)
    path = urllib.parse.unquote(re.split(r"[?#]", ref, maxsplit=1)[0])
    if not path:
        return None
    target = os.path.normpath(os.path.join(os.path.dirname(from_rel), path)).replace(os.sep, "/")
    if target == ".." or target.startswith("../"):
        return "%s links %s outside the page folder: move the file into the folder" % (from_rel, ref)
    if path.endswith("/"):
        target = (target + "/index.html").lstrip("./")
    if target not in files:
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

    total = 0
    for rel, full in sorted(files.items()):
        size = os.path.getsize(full)
        total += size
        if rel.lower().endswith(IMAGE_EXT) and size > WARN_IMAGE:
            warnings.append("%s is %.1f MB and will load slowly on a phone; shrink it first (for example "
                            "`sips -Z 1600 -s format jpeg -s formatOptions 80 in.png --out out.jpg` on macOS)" % (rel, size / 1048576))
        if rel.lower().endswith(REF_FILES):
            with open(full, encoding="utf-8", errors="replace") as f:
                text = f.read()
            for ref in _refs(text, rel.lower().endswith(".css")):
                err = check_ref(ref, rel, files)
                if err:
                    errors.append(err)
            if "/Users/" in text or "/home/" in text or "file://" in text:
                warnings.append("%s mentions a local path (/Users/, /home/ or file://) that readers cannot open; ignore this if it is only prose" % rel)
    if total > server.MAX_PAYLOAD - UI_HEADROOM:
        errors.append("the page is %.1f MB, over the %d MB limit: compress the screenshots" % (total / 1048576, server.MAX_PAYLOAD >> 20))
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
    ids = [(m.group(1) if m.group(1) is not None else m.group(2)).strip() for m in ITEM_RE.finditer(text)]
    if any(not i for i in ids):
        raise PublishError("a <section data-item> has an empty id", "give every item a short unique id, such as 1, 2, A3")
    dups = sorted({i for i in ids if ids.count(i) > 1})
    if dups:
        raise PublishError("item ids repeat: %s" % ", ".join(dups), "replies name items by id, so each id must be unique")


# ---------- building the page ----------

def load_strings(lang):
    with open(STRINGS_FILE, encoding="utf-8") as f:
        return json.load(f)[lang]


def wrap_page(content, lang, title, strings):
    """The content inside the shared review UI (assets/page.html)."""
    with open(PAGE_TEMPLATE, encoding="utf-8") as f:
        template = f.read()

    def fill(m):
        name = m.group(1)
        if name == "content":
            return m.group(0)
        if name == "strings":
            return server.script_json(strings)
        if name == "lang":
            return lang
        if name == "title":
            return html.escape(title)
        return html.escape(strings[name])

    parts = TOKEN_RE.sub(fill, template).split("{{content}}")
    if len(parts) != 2:
        raise RuntimeError("page.html must contain exactly one content token")
    return (parts[0] + content.decode("utf-8") + parts[1]).encode("utf-8")


def doctype_end(page):
    """Offset just past a leading doctype (after a BOM, whitespace and comments), or None.
    A linear scan: a regex for "any number of comments" backtracks exponentially."""
    i, n = (3 if page.startswith(b"\xef\xbb\xbf") else 0), len(page)
    while True:
        while i < n and page[i:i + 1].isspace():
            i += 1
        if not page.startswith(b"<!--", i):
            break
        j = page.find(b"-->", i + 4)
        if j < 0:
            return None
        i = j + 3
    if page[i:i + 9].lower() != b"<!doctype":
        return None
    j = page.find(b">", i)
    return j + 1 if j >= 0 else None


def inject_content_id(page, content_id):
    """Put <meta name="signoff-content"> first in <head>. The page compares it with
    meta.json's contentId and refuses review when they differ (a reload during an
    update can pair old questions with the new revision). Replaces an old tag."""
    page = CONTENT_META_RE.sub(b"", page)
    tag = ('<meta name="signoff-content" content="%s">' % content_id).encode()
    for pattern in (rb"<head\b[^>]*>", rb"<html\b[^>]*>"):
        m = re.search(pattern, page, re.I)
        if m:
            return page[:m.end()] + tag + page[m.end():]
    # A page without <html> and <head>: after the doctype, or the browser falls into quirks mode.
    end = doctype_end(page)
    if end is not None:
        return page[:end] + tag + page[end:]
    return tag + page


# ---------- sending and reading back ----------

def detect_source():
    """Who published, recorded in meta.json and shown on the index: never typed by the model."""
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
    return src


def build_request(files, request):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:") as tf:
        data = json.dumps(request, ensure_ascii=False).encode("utf-8")
        ti = tarfile.TarInfo("request.json")
        ti.size = len(data)
        ti.mtime = int(time.time())
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
    command = "python3 -c %s store --dir %s" % (shlex.quote(REMOTE_LOADER), shlex.quote(directory))
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
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Cache-Control": "no-cache"}), timeout=20) as r:
                return r.read()
        except (urllib.error.URLError, OSError) as e:
            last = e
            if i + 1 < tries:
                time.sleep(1 + i)
    raise PublishError("cannot read back %s: %s" % (url, last),
                       "check that the target's url serves its dir (for the server provider: the service is "
                       "running and https points at it); do not hand out the link", code=3)


def read_back(settings, result, content_id):
    """Fetch every published file from the reader's address and compare checksums."""
    base = settings["url"] + result["id"] + "/"
    for rel, digest in sorted(result["files"].items()):
        url = base + "/".join(urllib.parse.quote(p) for p in rel.split("/"))
        if hashlib.sha256(fetch(url)).hexdigest() != digest:
            raise PublishError("read-back mismatch: %s differs from what was sent" % rel,
                               "a cache may be serving an old copy; do not hand out the link, publish again", code=3)
    try:
        meta = json.loads(fetch(base + "meta.json").decode("utf-8"))
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


def prepare_local_root(directory):
    """Create the local folder with a `*` .gitignore, so screenshots never get committed.
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
    if rules is None or "*" not in rules.splitlines():
        with open(ignore, "a", encoding="utf-8") as f:
            f.write(("" if not rules or rules.endswith("\n") else "\n") + "*\n")


# ---------- commands ----------

def cmd_publish(args):
    if bool(args.slug) == bool(args.update):
        raise PublishError("pass either --slug (a new page) or --update <id> (a new revision)")
    if args.slug and (not server.SLUG_RE.match(args.slug) or len(args.slug) > server.SLUG_MAX):
        raise PublishError("malformed slug: %r" % args.slug,
                           "lowercase letters, digits and single hyphens, at most %d characters, e.g. e2e-sync" % server.SLUG_MAX)
    if args.update and not server.ID_RE.match(args.update):
        raise PublishError("malformed id: %r" % args.update, "use the id printed when the page was published, e.g. e2e-sync-k3f")
    if args.slug and not (args.title or "").strip():
        raise PublishError("a new page needs --title", "it heads the page and the index; write it for the reader")
    settings = resolve(os.getcwd(), args.target)
    strings = load_strings(settings["lang"])
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
    page = index if args.raw else wrap_page(index, settings["lang"], args.title or strings["defaultTitle"], strings)
    workdir = tempfile.mkdtemp(prefix="signoff-publish-")
    try:
        staged = os.path.join(workdir, "index.html")
        with open(staged, "wb") as f:
            f.write(inject_content_id(page, content_id))
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
    print("Update: publish the same folder again with --update %s" % result["id"])
    return 0


def cmd_rm(args):
    if not server.ID_RE.match(args.id):
        raise PublishError("malformed id: %r" % args.id)
    settings = resolve(os.getcwd(), args.target)
    call_store(settings, {"mode": "rm", "id": args.id, "index": index_request(settings, load_strings(settings["lang"]))})
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
