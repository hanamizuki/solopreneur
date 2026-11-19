#!/usr/bin/env python3
"""sign-offs store and HTTP server.

One self-contained file, used three ways:

- signoff.py imports it to write pages on this machine;
- signoff.py ships its source over SSH (`python3 -c <loader>`) to write pages on
  another machine, so the code that writes a store is always the publisher's
  own version and no copy on the host can drift from it;
- `install` copies it, with strings.json, into a stable directory and writes a
  launchd (macOS) or systemd user (Linux) unit that runs `serve`.

Store layout, the same for every provider:

  <dir>/<id>/        one page: the published files + meta.json + meta.js
  <dir>/index.html   static and local providers: rewritten on every write
  <dir>/.incoming/   upload staging; never served, cleared after a day (except a
                     previous revision an update could not put back)
  <dir>/.lock        serializes writes (fcntl)

Commands:

  store    stdin: a tar holding request.json (plus payload/ for new and update).
           Applies new / update / rm under the lock, deletes expired pages,
           rewrites index.html when the request carries index strings, and
           prints one JSON line.
  serve    HTTP on a loopback address only; put Tailscale Serve or a reverse
           proxy in front for https. Every response is `Cache-Control:
           no-store`, expired pages answer 410, the index is rendered per
           request, and expired pages are deleted every hour.
  install  copy this file + strings.json into --dir and write the service
           unit. Prints the commands that start the service instead of
           running them: the port may still belong to another service.

Python standard library only, 3.9 syntax, macOS and Linux (fcntl). Never touch
`__file__` at module level: the shipped copy runs under `python3 -c`, where it
is not defined.
"""
import argparse
import datetime as dt
import fcntl
import functools
import hashlib
import html
import io
import json
import os
import plistlib
import re
import secrets
import shlex
import shutil
import socket
import socketserver
import string
import sys
import tarfile
import tempfile
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_DIR = "~/.local/share/solopreneur/sign-offs"
DEFAULT_PORT = 8791
# \Z, not $: $ also matches before a final newline, and "abc\n" would name a folder nothing finds again.
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\Z")
SLUG_MAX = 12  # id = slug + "-xyz": at most 16 characters, so a link fits one line in a phone terminal
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{3}\Z")
CONTENT_ID_RE = re.compile(r"^[a-f0-9]{16,64}\Z")
RESERVED = ("meta.json", "meta.js")
SOURCE_KEYS = ("machine", "config", "tmux", "repo")
INDEX_KEYS = ("indexTitle", "indexSubtitle", "indexEmpty", "indexRow", "sep")
TTL_DEFAULT, TTL_MAX = 7, 365
TITLE_MAX, REPLY_TO_MAX, SOURCE_MAX = 120, 200, 80  # characters, after runs of whitespace become one space
MAX_REQUEST = 40 * 1024 * 1024   # whole tar, request.json included
MAX_PAYLOAD = 30 * 1024 * 1024   # page files together
INCOMING_MAX_AGE = 86400         # seconds before an upload leftover is cleared
PRUNE_INTERVAL = 3600            # seconds between `serve` sweeps (expired pages already answer 410)
GENERATOR = '<meta name="generator" content="solopreneur sign-offs">'
LOOPBACK = ("127.0.0.1", "::1", "localhost")
BIND = "127.0.0.1"  # loopback only: https comes from Tailscale Serve or a reverse proxy
# The store's own entries. Through a link, the upload sweep would delete and the index
# rewrite would overwrite files outside the store, and a local root can sit in a
# cloned repository that commits such a link.
OWN_ENTRIES = (".incoming", ".lock", ".index.html.tmp")
TEXT_TYPES = ("text/", "application/javascript", "application/json", "image/svg+xml")
LAUNCHD_LABEL = "solopreneur.sign-offs"
SYSTEMD_UNIT = "solopreneur-sign-offs.service"


class StoreError(Exception):
    def __init__(self, message, hint=""):
        super().__init__(message)
        self.hint = hint


# ---------- small helpers ----------

def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def parse_time(value):
    if not isinstance(value, str):
        return None
    try:
        t = dt.datetime.fromisoformat(value)
    except ValueError:
        return None
    return t if t.tzinfo else None


def iso(t):
    # The store host's own time zone, so meta.json reads naturally on that machine.
    return t.astimezone().isoformat(timespec="seconds")


def short_time(value):
    t = parse_time(value)
    return t.astimezone().strftime("%m/%d %H:%M") if t else "?"


def incoming_dir(root):
    return os.path.join(root, ".incoming")


def inside(path, base):
    """True when the real location of `path` is below `base` (and not `base` itself)."""
    real, real_base = os.path.realpath(path), os.path.realpath(base)
    return real != real_base and real.startswith(real_base + os.sep)


def load_meta(page_dir):
    try:
        with open(os.path.join(page_dir, "meta.json"), encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict) or parse_time(meta.get("expiresAt")) is None:
        return None
    return meta


def page_meta(root, name):
    """meta.json of <root>/<name> when it is a page this store wrote, else None.

    Only such a directory is ever served, replaced or deleted. A store may be a
    folder an existing web server already serves, and ordinary names such as
    `my-app` match ID_RE, so the name alone proves nothing."""
    d = os.path.join(root, name)
    if not ID_RE.match(name) or os.path.islink(d) or not os.path.isdir(d):
        return None
    meta = load_meta(d)
    return meta if meta is not None and meta.get("id") == name else None


def check_own_entries(root):
    for name in OWN_ENTRIES:
        p = os.path.join(root, name)
        if os.path.islink(p):
            raise StoreError("%s is a symlink" % p, "remove it; sign-offs keeps its own files there")


def is_expired(meta, at=None):
    return (at or utcnow()) >= parse_time(meta["expiresAt"])


def script_json(value):
    """JSON that is safe inside a <script> element or a .js file."""
    return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Lock:
    """The one write lock of a store: store and prune hold it while they change pages."""

    def __init__(self, root):
        self.path = os.path.join(root, ".lock")
        self.f = None

    def __enter__(self):
        self.f = open(self.path, "a")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


# ---------- expiry ----------

def _prune_locked(root, at):
    removed = []
    for name in sorted(os.listdir(root)):
        meta = page_meta(root, name)
        d = os.path.join(root, name)
        if meta is not None and is_expired(meta, at) and inside(d, root):
            shutil.rmtree(d)
            removed.append(d)
    incoming = incoming_dir(root)
    if os.path.isdir(incoming):
        for name in sorted(os.listdir(incoming)):
            p = os.path.join(incoming, name)
            if not name.startswith("rx-") or os.path.islink(p) or not os.path.isdir(p):
                continue  # store() stages in rx-* folders (mkdtemp); anything else is not this store's to delete
            try:
                if at.timestamp() - os.lstat(p).st_mtime < INCOMING_MAX_AGE:
                    continue
            except FileNotFoundError:
                continue  # an upload just removed itself: store() stages outside the lock
            if os.path.isdir(os.path.join(p, "previous")):
                continue  # an update that could not put its previous revision back: the only copy, moved back by hand
            if inside(p, incoming):
                shutil.rmtree(p)
            removed.append(p)
    return removed


def prune(root, at=None, log=None):
    """Delete expired pages and day-old upload leftovers. Returns the removed paths."""
    os.makedirs(root, exist_ok=True)
    check_own_entries(root)
    with Lock(root):
        removed = _prune_locked(root, at or utcnow())
    for p in removed:
        (log or print)("pruned " + p)
    return removed


# ---------- pages the store renders itself ----------

PAGE_CSS = """
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6e6e73;--line:#d2d2d7;--card:#f5f5f7;--accent:#0a66ff}
@media (prefers-color-scheme: dark){:root{--bg:#111;--fg:#f2f2f2;--muted:#a1a1a6;--line:#3a3a3c;--card:#1c1c1e;--accent:#4c8dff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif}
main{max-width:720px;margin:0 auto;padding:20px 16px 48px}h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--muted);font-size:14px;margin:0 0 20px}ul{list-style:none;padding:0;margin:0}
li{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 12px;background:var(--card)}
li a{font-size:17px;font-weight:600;color:var(--accent);text-decoration:none}
.meta{color:var(--muted);font-size:13px;margin-top:4px}.empty{color:var(--muted)}
"""


def fill(template, **values):
    """HTML-escaped `template` with each {name} replaced by its HTML-escaped value."""
    return re.sub(r"\{(\w+)\}", lambda m: html.escape(str(values[m.group(1)])) if m.group(1) in values else m.group(0),
                  html.escape(template))


def html_page(lang, title, body, generator=False):
    return ("<!doctype html><html lang=\"%s\"><head><meta charset=\"utf-8\">%s"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            "<title>%s</title><style>%s</style></head><body><main>%s</main></body></html>"
            % (html.escape(lang), GENERATOR if generator else "", html.escape(title), PAGE_CSS, body)).encode("utf-8")


def render_index(root, lang, strings, days, link_suffix, at=None, generator=False):
    """The list of pages that have not expired, newest first. Links are relative,
    so the same markup works at a site root, under a sub-path, and over file://."""
    names = os.listdir(root) if os.path.isdir(root) else []
    metas = [m for m in (page_meta(root, n) for n in names) if m is not None and not is_expired(m, at)]
    metas.sort(key=lambda m: m.get("updatedAt", ""), reverse=True)
    rows = []
    for m in metas:
        src = m.get("source") if isinstance(m.get("source"), dict) else {}
        where = strings["sep"].join(str(x) for x in (src.get("machine"), src.get("config"), src.get("tmux")) if x)
        line = fill(strings["indexRow"], revision=m.get("revision", "?"),
                    updated=short_time(m.get("updatedAt")), expires=short_time(m.get("expiresAt")))
        rows.append("<li><a href=\"%s/%s\">%s</a><div class=\"meta\">%s%s</div></li>" % (
            html.escape(m["id"]), link_suffix, html.escape(m.get("title") or m["id"]), line,
            html.escape(strings["sep"] + where) if where else ""))
    body = "<h1>%s</h1><p class=\"sub\">%s</p>" % (html.escape(strings["indexTitle"]), fill(strings["indexSubtitle"], days=days))
    body += ("<ul>%s</ul>" % "".join(rows)) if rows else "<p class=\"empty\">%s</p>" % html.escape(strings["indexEmpty"])
    return html_page(lang, strings["indexTitle"], body, generator)


def render_expired(meta, lang, strings):
    body = "<h1>%s</h1><p class=\"sub\">%s</p><p><a href=\"../\">%s</a></p>" % (
        html.escape(strings["expiredHeading"]),
        fill(strings["expiredBody"], title=meta.get("title") or meta.get("id", ""),
             revision=meta.get("revision", "?"), when=short_time(meta.get("expiresAt"))),
        html.escape(strings["expiredLink"]))
    return html_page(lang, strings["expiredTitle"], body)


# ---------- store ----------

def _clean_text(value, limit, field, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise StoreError(field + " must be text")
    value = " ".join(value.split())
    if required and not value:
        raise StoreError(field + " cannot be empty")
    if len(value) > limit:
        raise StoreError("%s is too long (limit %d characters)" % (field, limit))
    return value


def _page_id(value):
    if not isinstance(value, str) or not ID_RE.match(value):
        raise StoreError("malformed page id: %r" % (value,))
    return value


def _extract(data, work):
    """Unpack the request tar safely: regular files only, named request.json or
    under payload/, with no `..` and no dot-named segment. Returns request.json."""
    try:
        tf = tarfile.open(fileobj=io.BytesIO(data), mode="r:")
    except tarfile.TarError as e:
        raise StoreError("not a valid tar: %s" % e)
    request_bytes = None
    total = 0
    payload_root = os.path.join(work, "payload")
    with tf:
        for m in tf.getmembers():
            name = m.name.rstrip("/")
            parts = name.split("/")
            if any(p in ("", ".", "..") or p.startswith(".") for p in parts):
                raise StoreError("rejected file name: %r" % m.name, "a page cannot hold files or folders whose names start with a dot")
            if m.isdir():
                if parts[0] != "payload":
                    raise StoreError("rejected directory: %r" % m.name)
                continue
            if not m.isfile():
                raise StoreError("rejected link or special file: %r" % m.name, "replace links with real files and publish again")
            if name == "request.json":
                if m.size > 256 * 1024:
                    raise StoreError("request.json is too large")
                request_bytes = tf.extractfile(m).read()
                continue
            if parts[0] != "payload" or len(parts) < 2:
                raise StoreError("rejected file name: %r" % m.name)
            # In any letter case: on a case-insensitive volume (the macOS default) the meta.json
            # written below would overwrite a META.JSON, found out only after the swap.
            if len(parts) == 2 and parts[1].casefold() in RESERVED:
                raise StoreError("%s is a reserved name" % parts[1], "remove it from the page folder; it is written at publish time")
            total += m.size
            if total > MAX_PAYLOAD:
                raise StoreError("the page files exceed %d MB together" % (MAX_PAYLOAD >> 20), "compress the screenshots and publish again")
            dest = os.path.join(payload_root, *parts[1:])
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with tf.extractfile(m) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)
    if request_bytes is None:
        raise StoreError("request.json is missing")
    try:
        req = json.loads(request_bytes.decode("utf-8"))
    except ValueError as e:
        raise StoreError("request.json is not valid JSON: %s" % e)
    if not isinstance(req, dict):
        raise StoreError("request.json must be an object")
    return req


def _verify_payload(payload_root, files):
    if not isinstance(files, dict) or not files:
        raise StoreError("request.json lists no files")
    found = {}
    if os.path.isdir(payload_root):
        for dirpath, _dirs, names in os.walk(payload_root):
            for n in names:
                full = os.path.join(dirpath, n)
                found[os.path.relpath(full, payload_root).replace(os.sep, "/")] = full
    if set(found) != set(files):
        missing = sorted(set(files) - set(found))
        extra = sorted(set(found) - set(files))
        raise StoreError("the file list does not match (missing %s; extra %s)" % (missing[:5], extra[:5]),
                         "the transfer may have been cut short; publish again")
    for rel, digest in files.items():
        if sha256_file(found[rel]) != digest:
            raise StoreError("%s does not match its checksum" % rel, "the transfer may be damaged; publish again")
    if "index.html" not in files:
        raise StoreError("the page has no index.html")


def _index_request(value):
    """Index strings sent by static and local publishes; None for the server provider."""
    if value is None:
        return None
    ok = (isinstance(value, dict) and isinstance(value.get("lang"), str) and isinstance(value.get("days"), int)
          and isinstance(value.get("strings"), dict)
          and all(isinstance(value["strings"].get(k), str) for k in INDEX_KEYS))
    if not ok:
        raise StoreError("malformed index request")
    return value


def _guard_index(root):
    """Never overwrite an index.html this store did not write: `dir` may point at a real site."""
    p = os.path.join(root, "index.html")
    try:
        with open(p, "rb") as f:
            head = f.read(4096)
    except FileNotFoundError:
        return
    if GENERATOR.encode() not in head:
        raise StoreError("%s already exists and was not written by sign-offs" % p,
                         "point this target's dir at a folder used only for sign-offs")


def _after_write(root, index, at):
    """Prune, then rewrite index.html for static/local. The page itself is already
    live, so a failure here is reported as a warning rather than an error."""
    try:
        _prune_locked(root, at)
        if index:
            tmp = os.path.join(root, ".index.html.tmp")
            with open(tmp, "wb") as f:
                f.write(render_index(root, index["lang"], index["strings"], index["days"], "index.html", at, generator=True))
            os.replace(tmp, os.path.join(root, "index.html"))
    except OSError as e:
        return "the page is live, but cleaning up or rewriting index.html failed: %s" % e
    return None


def _new_id(root, slug):
    alphabet = string.ascii_lowercase + string.digits
    for _ in range(50):
        cand = "%s-%s" % (slug, "".join(secrets.choice(alphabet) for _ in range(3)))
        if not os.path.lexists(os.path.join(root, cand)):
            return cand
    raise StoreError("could not find a free id", "try another slug")


def store(root, data, at=None):
    """Apply one request (new / update / rm) to the store at `root`. Returns a dict;
    raises StoreError when the request is refused."""
    if len(data) > MAX_REQUEST:
        raise StoreError("the request is larger than %d MB" % (MAX_REQUEST >> 20))
    check_own_entries(root)
    os.makedirs(incoming_dir(root), exist_ok=True)
    work = tempfile.mkdtemp(prefix="rx-", dir=incoming_dir(root))
    keep_work = False
    try:
        req = _extract(data, work)
        mode = req.get("mode")
        if mode not in ("new", "update", "rm"):
            raise StoreError("mode must be new, update or rm")
        index = _index_request(req.get("index"))

        if mode == "rm":
            page_id = _page_id(req.get("id"))
            with Lock(root):
                now = at or utcnow()
                if index:
                    _guard_index(root)
                if page_meta(root, page_id) is None:
                    raise StoreError("no page %s" % page_id, "check the id; the page may have expired or been removed")
                shutil.rmtree(os.path.join(root, page_id))
                warning = _after_write(root, index, now)
            return {"ok": True, "id": page_id, "removed": True, "warning": warning}

        title = _clean_text(req.get("title"), TITLE_MAX, "title", required=(mode == "new"))
        reply_to = _clean_text(req.get("replyTo"), REPLY_TO_MAX, "replyTo")
        source = req.get("source") or {}
        if not isinstance(source, dict):
            raise StoreError("source must be an object")
        source = {k: _clean_text(v, SOURCE_MAX, "source." + k) for k, v in source.items() if k in SOURCE_KEYS and v}
        content_id = req.get("contentId") or ""
        if content_id and (not isinstance(content_id, str) or not CONTENT_ID_RE.match(content_id)):
            raise StoreError("malformed contentId")
        ttl = req.get("ttlDays", TTL_DEFAULT)
        if isinstance(ttl, bool) or not isinstance(ttl, int) or not 1 <= ttl <= TTL_MAX:
            raise StoreError("ttlDays must be a whole number from 1 to %d" % TTL_MAX)
        payload = os.path.join(work, "payload")
        _verify_payload(payload, req.get("files"))

        with Lock(root):
            # Read the clock only now: a publish that waited for the lock past a
            # page's expiry must not update that page.
            at = at or utcnow()
            if index:
                _guard_index(root)
            if mode == "new":
                slug = req.get("slug")
                if not isinstance(slug, str) or not SLUG_RE.match(slug) or len(slug) > SLUG_MAX:
                    raise StoreError("malformed slug: %r" % (slug,),
                                     "lowercase letters, digits and single hyphens, at most %d characters" % SLUG_MAX)
                page_id = _new_id(root, slug)
                revision, created = 1, iso(at)
            else:
                page_id = _page_id(req.get("id"))
                old = page_meta(root, page_id)
                if old is None:
                    raise StoreError("no page %s" % page_id, "check the id, or publish a new page with --slug")
                if is_expired(old, at):
                    raise StoreError("%s has expired" % page_id, "an expired page cannot be updated; publish a new one with --slug")
                revision = int(old.get("revision", 0)) + 1
                created = old.get("createdAt") or iso(at)
                title = title or old.get("title", "")
                reply_to = reply_to or old.get("replyTo", "")
            meta = {
                "id": page_id,
                "title": title,
                "revision": revision,
                "createdAt": created,
                "updatedAt": iso(at),
                "expiresAt": iso(at + dt.timedelta(days=ttl)),
                "replyTo": reply_to,
                "source": source,
            }
            if content_id:
                meta["contentId"] = content_id  # the page compares it with its own <meta name="signoff-content">
            with open(os.path.join(payload, "meta.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=1)
            # Browsers refuse fetch() on file:// pages, but still run a classic <script src>.
            with open(os.path.join(payload, "meta.js"), "w", encoding="utf-8") as f:
                f.write("window.SIGNOFF_META = %s;\n" % script_json(meta))
            target = os.path.join(root, page_id)
            aside = None
            if os.path.exists(target):
                # A directory cannot be renamed over a non-empty one: move the old one aside first.
                aside = os.path.join(work, "previous")
                os.rename(target, aside)
            try:
                os.rename(payload, target)
            except OSError as e:
                if aside is not None:
                    try:
                        os.rename(aside, target)  # a failed update must not take the working link down
                    except OSError as e2:
                        keep_work = True  # `aside` is now the previous revision's only copy
                        raise StoreError("could not swap in the new revision (%s) nor put the previous one back (%s): "
                                         "it is kept in %s" % (e, e2, aside),
                                         "move %s back to %s by hand, then publish again" % (aside, target))
                raise StoreError("could not swap in the new revision: %s" % e,
                                 "the previous revision is still in place; check free disk space and publish again")
            warning = _after_write(root, index, at)
        # meta: what meta.json now holds, which the publisher's read-back must find whole.
        return {"ok": True, "id": page_id, "revision": revision, "meta": meta,
                "files": req["files"], "warning": warning}
    finally:
        if not keep_work:
            shutil.rmtree(work, ignore_errors=True)


def handle_store(root, data, at=None):
    """`store` with every failure turned into the JSON shape the publisher reads."""
    try:
        return store(os.path.abspath(os.path.expanduser(root)), data, at)
    except StoreError as e:
        return {"ok": False, "error": str(e), "hint": e.hint}
    except tarfile.TarError as e:  # a request cut short in transit fails while it is read, not when it is opened
        return {"ok": False, "error": "the request is damaged: %s" % e, "hint": "the transfer may have been cut short; publish again"}
    except OSError as e:
        return {"ok": False, "error": "%s" % e, "hint": "check that the folder exists, is writable, and has free space"}


# ---------- serve ----------

class Handler(SimpleHTTPRequestHandler):
    server_version = "sign-offs"
    sys_version = ""

    def __init__(self, *args, root=None, lang="en", strings=None, days=TTL_DEFAULT, **kwargs):
        self.root, self.lang, self.strings, self.days = root, lang, strings, days
        super().__init__(*args, directory=root, **kwargs)

    def end_headers(self):
        # no-store, not no-cache: extracted files keep old mtimes, so a 304 could hand back the previous revision.
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def guess_type(self, path):
        ctype = super().guess_type(path)
        if ctype.startswith(TEXT_TYPES) and "charset" not in ctype:
            ctype += "; charset=utf-8"  # pages without <meta charset> stay readable on phones
        return ctype

    def do_GET(self):
        self._route(head=False)

    def do_HEAD(self):
        self._route(head=True)

    def _send(self, code, body, head, location=None):
        self.send_response(code)
        if location:
            self.send_header("Location", location)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _route(self, head):
        raw = urllib.parse.urlsplit(self.path).path
        try:
            path = urllib.parse.unquote(raw, errors="strict")
        except UnicodeDecodeError:
            return self.send_error(404)
        parts = [p for p in path.split("/") if p]
        if not parts or parts == ["index.html"]:
            return self._send(200, render_index(self.root, self.lang, self.strings, self.days, ""), head)
        if any(p.startswith(".") for p in parts):
            return self.send_error(404)
        meta = page_meta(self.root, parts[0])
        if meta is None:
            return self.send_error(404)
        if is_expired(meta):
            return self._send(410, render_expired(meta, self.lang, self.strings), head)
        if len(parts) == 1 and not raw.endswith("/"):
            # Relative, unlike the stock directory redirect: it stays right behind
            # a proxy that mounts this server under a sub-path.
            return self._send(301, b"", head, location=parts[0] + "/")
        return super().do_HEAD() if head else super().do_GET()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def translate_path(self, path):
        p = super().translate_path(path)
        checked = [p]
        if os.path.isdir(p):
            # The stock handler then opens the folder's index.html (or index.htm) by
            # itself, following a link there: those must stay inside the store too.
            checked += [c for c in (os.path.join(p, "index.html"), os.path.join(p, "index.htm")) if os.path.lexists(c)]
        if not all(inside(c, self.root) for c in checked):
            return os.path.join(self.root, ".does-not-exist")  # symlink escapes and the like → 404
        return p


class Server(ThreadingHTTPServer):
    # socketserver queues only 5 pending connections by default. A browser behind an
    # HTTP/2 proxy (Tailscale Serve) asks for every image at once and the proxy opens
    # a dozen connections; the overflow is reset and shows up as broken images (502).
    # 128 is macOS's kern.ipc.somaxconn ceiling.
    request_queue_size = 128

    def server_bind(self):
        # The stock server_bind resolves the bind address back to a host name, a
        # reverse DNS query measured stalling for 35 s; server_name is never used here.
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


def prune_loop(root, interval):
    while True:
        try:
            prune(root)
        except Exception as e:  # a failed sweep must not stop the server; it lands in the service log
            print("prune failed: %r" % (e,), file=sys.stderr, flush=True)
        time.sleep(interval)


def strings_path():
    """strings.json beside this file (an installed copy) or in ../assets (inside the skill)."""
    here = os.path.dirname(os.path.realpath(__file__))
    for p in (os.path.join(here, "strings.json"), os.path.join(here, "..", "assets", "strings.json")):
        if os.path.isfile(p):
            return p
    raise StoreError("strings.json not found next to %s" % here, "re-run install")


def load_strings(lang):
    with open(strings_path(), encoding="utf-8") as f:
        table = json.load(f)
    if lang not in table:
        raise StoreError("unknown lang %r (have: %s)" % (lang, ", ".join(sorted(table))))
    return table[lang]


def cmd_serve(args):
    root = os.path.abspath(os.path.expanduser(args.dir))
    os.makedirs(root, exist_ok=True)
    strings = load_strings(args.lang)
    threading.Thread(target=prune_loop, args=(root, PRUNE_INTERVAL), daemon=True).start()
    httpd = Server((BIND, args.port), functools.partial(Handler, root=root, lang=args.lang, strings=strings, days=args.ttl_days))
    print("sign-offs serving %s on http://%s:%d/" % (root, BIND, args.port), flush=True)
    httpd.serve_forever()
    return 0


# ---------- install ----------

def _systemd_arg(arg):
    # systemd expands % specifiers and $VARIABLES in ExecStart; double them to keep them literal.
    arg = arg.replace("%", "%%").replace("$", "$$")
    if re.search(r"[\s\"'\\]", arg):
        arg = '"%s"' % arg.replace("\\", "\\\\").replace('"', '\\"')
    return arg


def _port_in_use(port):
    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex((BIND, port)) == 0


def cmd_install(args):
    root = os.path.abspath(os.path.expanduser(args.dir))
    os.makedirs(root, exist_ok=True)
    load_strings(args.lang)  # fail before writing anything when the language is unknown
    for src, name in ((os.path.realpath(__file__), "server.py"), (strings_path(), "strings.json")):
        dest = os.path.join(root, name)
        if not (os.path.exists(dest) and os.path.samefile(src, dest)):
            shutil.copyfile(src, dest)
    python = sys.executable
    if sys.platform == "darwin" and python.startswith(("/Applications/Xcode", "/Library/Developer/CommandLineTools/")):
        # /usr/bin/python3 is a shim that re-executes the developer tools' copy and
        # reports that path; keep the shim, which survives Xcode moves and updates.
        python = "/usr/bin/python3"
    argv = [python, os.path.join(root, "server.py"), "serve", "--dir", root, "--port", str(args.port),
            "--lang", args.lang, "--ttl-days", str(args.ttl_days)]
    log = os.path.join(root, "server.log")
    home = os.path.expanduser("~")
    if sys.platform == "darwin":
        unit = os.path.join(home, "Library", "LaunchAgents", LAUNCHD_LABEL + ".plist")
        os.makedirs(os.path.dirname(unit), exist_ok=True)
        with open(unit, "wb") as f:
            plistlib.dump({"Label": LAUNCHD_LABEL, "ProgramArguments": argv, "RunAtLoad": True, "KeepAlive": True,
                           "WorkingDirectory": root, "StandardOutPath": log, "StandardErrorPath": log}, f)
        start = ["launchctl bootout gui/$(id -u)/%s 2>/dev/null || true" % LAUNCHD_LABEL,
                 "launchctl bootstrap gui/$(id -u) %s" % shlex.quote(unit)]
        note = "A LaunchAgent runs while someone is logged in to this Mac's desktop; on a headless Mac, turn on automatic login."
    elif sys.platform.startswith("linux"):
        unit = os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.join(home, ".config"), "systemd", "user", SYSTEMD_UNIT)
        os.makedirs(os.path.dirname(unit), exist_ok=True)
        with open(unit, "w", encoding="utf-8") as f:
            f.write("[Unit]\nDescription=sign-offs review pages\n\n[Service]\nExecStart=%s\n"
                    "Restart=on-failure\n\n[Install]\nWantedBy=default.target\n"
                    % " ".join(_systemd_arg(a) for a in argv))
        # restart, not enable --now: after a re-install the running service must pick up the new copy.
        start = ["systemctl --user daemon-reload", "systemctl --user enable %s" % SYSTEMD_UNIT,
                 "systemctl --user restart %s" % SYSTEMD_UNIT]
        note = 'Run `loginctl enable-linger "$USER"` once, or the service stops when you log out and does not start at boot.'
    else:
        raise StoreError("install supports macOS (launchd) and Linux (systemd), not %s" % sys.platform)
    print("Installed the sign-offs server in %s" % root)
    print("Service unit: %s" % unit)
    print("Start it (nothing has been started yet):")
    for line in start:
        print("  " + line)
    print(note)
    if _port_in_use(args.port):
        print("⚠️ %s:%d is already in use: unless that is this service from an earlier install (the commands above "
              "restart it), stop whatever listens there first." % (BIND, args.port))
    print("Then serve it over https at the root of a host name, for example:")
    print("  tailscale serve --bg --https=443 http://127.0.0.1:%d" % args.port)
    print("or point any reverse proxy at http://127.0.0.1:%d (a sub-path works too)." % args.port)
    target = {"provider": "server", "host": "<this machine as an SSH destination>", "url": "https://<host name>/"}
    if root != os.path.abspath(os.path.expanduser(DEFAULT_DIR)):
        target["dir"] = root
    print("Config target: %s" % json.dumps(target))
    return 0


# ---------- CLI ----------

def main(argv=None):
    ap = argparse.ArgumentParser(description="sign-offs store and server")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("store", help="apply one publish request read from stdin")
    sp.add_argument("--dir", required=True)
    for name in ("serve", "install"):
        p = sub.add_parser(name)
        p.add_argument("--dir", default=DEFAULT_DIR)
        p.add_argument("--port", type=int, default=DEFAULT_PORT)
        p.add_argument("--lang", default="en", help="language of the index and expired pages")
        p.add_argument("--ttl-days", type=int, default=TTL_DEFAULT, help="lifetime quoted on the index page")
    args = ap.parse_args(argv)
    if args.cmd == "store":
        result = handle_store(args.dir, sys.stdin.buffer.read(MAX_REQUEST + 1))
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result.get("ok") else 2
    try:
        return {"serve": cmd_serve, "install": cmd_install}[args.cmd](args)
    except StoreError as e:
        print("❌ " + str(e), file=sys.stderr)
        if e.hint:
            print("→ " + e.hint, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
