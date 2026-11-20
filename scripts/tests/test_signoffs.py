"""CI suite for the sign-offs skill: page checks, the injected UI, settings
resolution, the store behind all three providers, and the HTTP server.

Everything runs against temporary directories and loopback HTTP servers. The SSH
transport is exercised by running the exact remote command through a local
shell instead of ssh, so the shipped-source loader is covered without a server.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import email.message
import functools
import hashlib
import io
import json
import os
import plistlib
import re
import socket
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

SKILL = Path(__file__).resolve().parents[2] / "skills" / "solopreneur" / "sign-offs"
sys.path.insert(0, str(SKILL / "scripts"))
import server  # noqa: E402
import signoff  # noqa: E402

EN = server.load_strings("en")  # check_content takes the reply's markers from the page's language

GIT_ENV = {
    "GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "test@example.com",
}


def git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, env={**os.environ, **GIT_ENV})


def quiet(handler):
    return type("Quiet" + handler.__name__, (handler,), {"log_message": lambda *a, **k: None})


class QuickServer(ThreadingHTTPServer):
    # Skip the reverse DNS lookup of the stock server_bind (server.Server does the same).
    server_bind = server.Server.server_bind


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, value):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(value, f)


def write_text(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def read_text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


@contextlib.contextmanager
def http_dir(directory, handler=SimpleHTTPRequestHandler):
    """A plain static web server over `directory`, standing in for a user's portal."""
    httpd = QuickServer(("127.0.0.1", 0), functools.partial(quiet(handler), directory=directory))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield "http://127.0.0.1:%d/" % httpd.server_address[1]
    finally:
        httpd.shutdown()
        httpd.server_close()


@contextlib.contextmanager
def signoffs_server(directory, lang="en"):
    """The bundled server, as `serve` runs it."""
    httpd = server.Server(("127.0.0.1", 0), functools.partial(
        quiet(server.Handler), root=directory, lang=lang, strings=server.load_strings(lang), days=7))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield "http://127.0.0.1:%d/" % httpd.server_address[1]
    finally:
        httpd.shutdown()
        httpd.server_close()


def get(url, follow=False):
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(url, timeout=10) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        with e:
            return e.code, e.headers, e.read()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Base(unittest.TestCase):
    """A temporary HOME, an empty working directory, and no inherited config."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="signoffs-test-")
        self.addCleanup(self._tmp.cleanup)
        self.tmp = os.path.realpath(self._tmp.name)
        # The walk-up runs to `/`: a config above TMPDIR would change every default
        # below. Name the cause instead of failing as if the resolver were wrong.
        for d in Path(self.tmp).parents:
            self.assertFalse((d / ".solopreneur.json").exists(), "TMPDIR sits under a configured scope: %s" % d)
        self.home = self.mkdir("home")
        self.cwd = self.mkdir("work")
        env = {k: v for k, v in os.environ.items() if k not in ("SOLOPRENEUR_CONFIG", "XDG_CONFIG_HOME")}
        env["HOME"] = self.home
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        old = os.getcwd()
        os.chdir(self.cwd)
        self.addCleanup(os.chdir, old)

    def mkdir(self, *parts):
        path = os.path.join(self.tmp, *parts)
        os.makedirs(path, exist_ok=True)
        return path

    def page(self, name, html="<p>Pick one.</p><section data-item=\"1\"><h2>One</h2></section>", extra=None):
        d = self.mkdir("pages", name)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(html)
        for rel, data in (extra or {}).items():
            os.makedirs(os.path.dirname(os.path.join(d, rel)), exist_ok=True)
            with open(os.path.join(d, rel), "wb") as f:
                f.write(data)
        return d

    def config(self, directory, block, **extra):
        path = os.path.join(directory, ".solopreneur.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(dict({"schemaVersion": 2, "signoffs": block}, **extra), f)
        return path

    def user_config(self, block, **extra):
        """~/.config/solopreneur/config.json under the test HOME: the only place targets are read."""
        path = os.path.join(self.mkdir("home", ".config", "solopreneur"), "config.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(dict({"schemaVersion": 2, "signoffs": block}, **extra), f)
        return path

    def cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = signoff.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def publish(self, *argv):
        code, out, err = self.cli("publish", *argv)
        self.assertEqual(code, 0, out + err)
        page_id = re.search(r"--update (\S+)", out).group(1)
        return page_id, out, err

    def expect_error(self, needle, fn, *args):
        with self.assertRaises(signoff.PublishError) as ctx:
            fn(*args)
        self.assertIn(needle, str(ctx.exception) + " " + ctx.exception.hint)


class PageChecks(Base):
    def test_a_good_page_passes_and_junk_is_skipped(self):
        d = self.page("good", '<link href="s.css" rel="stylesheet"><img src="shots/a.png" srcset="shots/a.png 1x, shots/a.png 2x">'
                              '<a href="#x">x</a><a href="https://example.com/">e</a><img src="data:image/png;base64,AA==">'
                              '<a href="shots/a.png?v=2#top">q</a>',
                      {"shots/a.png": b"png", "s.css": b"@import \"ok.css\";body{background:url('shots/a.png')}",
                       "ok.css": b"", ".DS_Store": b"junk"})
        files, _ = signoff.collect(d)
        self.assertEqual(sorted(files), ["index.html", "ok.css", "s.css", "shots/a.png"])

    def test_srcset_urls_may_hold_commas(self):
        # A srcset candidate's URL runs to the next whitespace, commas included (the HTML spec).
        shots = {"shots/a,b.png": b"png", "shots/c.png": b"png"}
        for name, srcset in (("comma", "shots/a,b.png 1x, shots/c.png 2x"),
                             ("data", "data:image/png;base64,AAAA 1x, shots/c.png 2x"),
                             ("bare", "shots/c.png, shots/a,b.png 2x")):  # a comma ending a URL ends the candidate
            with self.subTest(name):
                signoff.collect(self.page(name, '<img srcset="%s">' % srcset, shots))

    def test_broken_references_and_unsafe_files_are_refused(self):
        cases = [
            ("missing", '<img src="shots/none.png">', None, "not in the page folder"),
            ("srcset", '<img srcset="shots/a.png 1x, shots/none.png 2x">', {"shots/a.png": b"png"}, "links shots/none.png"),
            ("unquoted", "<img src=missing.png>", None, "not in the page folder"),
            ("absolute", '<img src="/x.png">', None, "root-absolute"),
            ("fileurl", '<img src="file:///tmp/x.png">', None, "local file"),
            ("outside", '<img src="../good/a.png">', None, "outside the page folder"),
            ("css", "<style>i{background:url(nope.png)}</style>", None, "not in the page folder"),
            # CSS names are case-insensitive, and @import takes a bare string as well as url()
            ("cssupper", "<p>x</p>", {"s.css": b"i{background:URL(missing.png)}"}, "missing.png, which is not in the page folder"),
            ("cssimport", "<p>x</p>", {"s.css": b'@import "missing.css";'}, "missing.css, which is not in the page folder"),
            ("styleimport", "<style>@import 'missing.css';</style>", None, "missing.css, which is not in the page folder"),
            ("dot", "<p>x</p>", {".env": b"x"}, "starts with a dot"),
            ("metajson", "<p>x</p>", {"meta.json": b"{}"}, "written at publish time"),
            ("metajs", "<p>x</p>", {"meta.js": b""}, "written at publish time"),
            # A case-insensitive volume (the macOS default) holds one of meta.js and Meta.js: the same file.
            ("metajscase", "<p>x</p>", {"Meta.js": b""}, "written at publish time"),
            # over file:// a folder address opens as a listing, not as its index.html
            ("folder", '<a href="details/">d</a>', {"details/index.html": b"<p>d</p>"}, "links the folder details/"),
        ]
        for name, html, extra, needle in cases:
            with self.subTest(name):
                self.expect_error(needle, signoff.collect, self.page(name, html, extra))
        d = self.page("link")
        os.symlink("/etc/hosts", os.path.join(d, "hosts.txt"))
        self.expect_error("symlink", signoff.collect, d)
        d = self.page("fifo")
        os.mkfifo(os.path.join(d, "pipe"))  # reading or hashing it would block forever
        self.expect_error("not a regular file", signoff.collect, d)

    def test_a_page_over_the_cap_is_refused_before_it_is_read(self):
        d = self.page("big", "<p>%s</p>" % ("x" * 2048))
        with mock.patch.object(server, "MAX_PAYLOAD", signoff.UI_HEADROOM + 1024), \
                mock.patch.object(signoff, "_refs") as refs, \
                mock.patch.object(signoff, "open", create=True, side_effect=AssertionError("opened a file")) as opened:
            self.expect_error("MB limit: compress the screenshots", signoff.collect, d)
        refs.assert_not_called()
        opened.assert_not_called()

    def test_only_a_wrapped_page_needs_room_for_the_ui(self):
        # A --raw page goes out as it is: the whole cap is its own.
        d = self.page("between", "<p>%s</p>" % ("x" * 2048))
        with mock.patch.object(server, "MAX_PAYLOAD", signoff.UI_HEADROOM + 1024):
            code, out, err = self.cli("publish", d, "--slug", "cap", "--title", "Cap", "--raw", "--dry-run")
            self.assertEqual(code, 0, out + err)
            code, _, err = self.cli("publish", d, "--slug", "cap", "--title", "Cap", "--dry-run")
        self.assertEqual(code, 2)
        self.assertIn("MB limit", err)

    def test_a_raw_page_may_load_the_files_written_at_publish_time(self):
        d = self.page("raw", '<!doctype html><script src="meta.js"></script><a href="meta.json">m</a>')
        self.assertEqual(list(signoff.collect(d)[0]), ["index.html"])

    def test_a_base_href_may_not_move_where_links_resolve(self):
        # <base> is no link: every relative URL resolves against it, meta.json included,
        # while the read-back checks the page's own folder.
        d = self.page("base", '<!doctype html><base href="./"><script src="meta.js"></script>')
        self.assertEqual(list(signoff.collect(d, True)[0]), ["index.html"])
        for name, href in (("abs", "https://x/"), ("sub", "sub/")):
            with self.subTest(href):
                self.expect_error('<base href="%s"> changes where relative links resolve: remove it' % href,
                                  signoff.collect, self.page("base-" + name, '<base href="%s"><p>x</p>' % href))

    def test_css_is_read_from_style_elements_and_attributes_not_prose(self):
        d = self.page("prose", "<p>Check the URL(s) and the url(x) helper.</p>")
        self.assertEqual(list(signoff.collect(d)[0]), ["index.html"])
        self.expect_error("not in the page folder", signoff.collect,
                          self.page("attr", '<div style="background:url(missing.png)">x</div>'))

    def test_css_comments_hold_no_references(self):
        # A commented-out rule is never requested, in a stylesheet, a <style> or a style attribute.
        d = self.page("commented", '<style>/* i{background:url(old.png)} */</style><p style="/* background:url(old.png) */">x</p>',
                      {"s.css": b"/* i{background:url(old.png)}\n@import 'gone.css'; */ i{color:red}"})
        self.assertEqual(sorted(signoff.collect(d)[0]), ["index.html", "s.css"])
        # Each comment ends at its own */: the rule between two comments is still read.
        self.expect_error("old.png, which is not in the page folder", signoff.collect,
                          self.page("live", "<p>x</p>", {"s.css": b"/* a */ i{background:url(old.png)} /* b */"}))

    def test_a_single_html_file_becomes_index_html(self):
        path = os.path.join(self.tmp, "one.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write("<p>one</p>")
        self.assertEqual(list(signoff.collect(path)[0]), ["index.html"])

    def test_content_must_be_a_fragment_unless_raw(self):
        for doc in (b"<!doctype html><html><body><p>x</p></body></html>", b"<!DOCTYPE html><p>x</p>", b"<p>x</p><BODY>"):
            with self.subTest(doc):
                self.expect_error("--raw", signoff.check_content, doc, False, EN)
                signoff.check_content(doc, True, EN)
        signoff.check_content(b"<section data-item='1'>x</section>", False, EN)
        # Read from the parsed markup: a comment or a script may name the tags.
        signoff.check_content(b"<!-- the <body> is added for us --><section data-item='1'>x</section>", False, EN)
        signoff.check_content(b'<script>var s = "<body>";</script><section data-item="1">x</section>', False, EN)

    def test_item_ids_must_be_present_unique_and_without_spaces(self):
        self.expect_error("repeat: 1", signoff.check_content, b'<section data-item="1"></section><section data-item=" 1 "></section>', False, EN)
        self.expect_error("repeat", signoff.check_content, b"<section data-item=1></section><section data-item=1></section>", False, EN)
        self.expect_error("empty id", signoff.check_content, b'<section data-item=""></section>', False, EN)
        # A reply line starts with the id: "A 1 Approve" could not say where the id ends.
        self.expect_error('cannot contain spaces: "A 1"', signoff.check_content, b'<section data-item="A 1"></section>', False, EN)
        # The page builds controls for sections only: a div item would silently drop out of the reply.
        self.expect_error("not on <div>", signoff.check_content, b'<section data-item="1"></section><div data-item="2"></div>', False, EN)

    def test_ids_are_trimmed_as_the_page_trims_them(self):
        # The page uses JavaScript trim(), which also removes U+FEFF.
        self.expect_error("repeat: 1", signoff.check_content,
                          '<section data-item="\ufeff1"></section><section data-item="1"></section>'.encode(), False, server.load_strings("en"))

    def test_ids_and_choice_labels_cannot_read_as_reply_markers(self):
        # "Overall: Approve" reads as the overall comment, and "1 No choice — x" as a note left without a choice.
        cases = [("en", '<section data-item="Overall:"></section>', '"Overall:"'),
                 ("en", '<section data-item="pending:1"></section>', '"pending:1"'),
                 ("en", '<section data-item="Sign-Off"></section>', '"Sign-Off"'),
                 ("en", '<section data-item="1" data-choices="Approve|No  choice"></section>', '"No choice"'),
                 ("zh-Hant", '<section data-item="整體："></section>', '"整體："'),
                 ("zh-Hant", '<section data-item="未批：1"></section>', '"未批：1"'),
                 ("zh-Hant", '<section data-item="1" data-choices="通過|未選"></section>', '"未選"')]
        for lang, page, needle in cases:
            with self.subTest(page):
                self.expect_error(needle, signoff.check_content, page.encode(), False, server.load_strings(lang))
        # The markers are the page language's own.
        signoff.check_content('<section data-item="整體：" data-choices="未選|No choice yet"></section>'.encode(), False, EN)

    def test_a_choice_label_cannot_hold_the_note_separator(self):
        # "1 Approve — with changes" would read as the choice Approve with the note "with changes".
        for choices in ("Approve|Approve — with changes", "Approve|Approve\n  —  with changes",  # folded onto one line by the page
                        "—|Approve"):  # "1 — — note": the label sits between the id's space and the note's
            with self.subTest(choices):
                self.expect_error("plain hyphen", signoff.check_content,
                                  ('<section data-item="1" data-choices="%s"></section>' % choices).encode(), False, EN)
        signoff.check_content('<section data-item="1" data-choices="Approve - with changes|Approve—fast"></section>'.encode(), False, EN)

    def test_unparsable_markup_is_reported_not_raised(self):
        # Python 3.9-3.12 stop at an unknown "<![" keyword; 3.13 and later read it as a comment.
        for check in (lambda: signoff.collect(self.page("decl", "<![foo]><p>x</p>")),
                      lambda: signoff.check_content(b"<![foo]><section data-item='1'></section>", False, EN)):
            try:
                check()
            except signoff.PublishError:
                pass


class PageBuilding(Base):
    def test_the_wrapper_fills_every_token_in_both_languages(self):
        for lang in signoff.LANGS:
            with self.subTest(lang):
                strings = server.load_strings(lang)
                page = signoff.wrap_page(b"<section data-item='1'>BODY</section>", lang, 'A <b> & "t"', strings, "abc").decode()
                self.assertNotIn("{{", page)
                self.assertIn('<meta name="signoff-content" content="abc">', page)
                self.assertEqual(page.count("BODY"), 1)
                self.assertIn('<html lang="%s">' % lang, page)
                self.assertIn("<title>A &lt;b&gt; &amp; &quot;t&quot;</title>", page)
                self.assertIn(strings["generate"], page)
                embedded = re.search(r"var S = (\{.*?\});\n", page).group(1)
                self.assertEqual(json.loads(embedded), strings)

    def test_tokens_inside_the_content_and_title_stay_as_written(self):
        page = signoff.wrap_page(b"<p>{{title}} {{content}}</p>", "en", "x {{content}}", server.load_strings("en"), "abc").decode()
        self.assertIn("<p>{{title}} {{content}}</p>", page)
        self.assertIn("<title>x {{content}}</title>", page)

    def test_strings_cannot_close_the_script_element(self):
        self.assertNotIn("</script>", server.script_json({"x": "</script><script>alert(1)</script>"}))


class Dictionary(unittest.TestCase):
    def test_both_languages_carry_the_same_keys(self):
        table = json.loads((SKILL / "assets" / "strings.json").read_text(encoding="utf-8"))
        self.assertEqual(sorted(table), sorted(signoff.LANGS))
        self.assertEqual(set(table["en"]), set(table["zh-Hant"]))
        self.assertTrue(set(server.INDEX_KEYS) <= set(table["en"]))

    def test_zh_hant_keeps_the_original_wording(self):
        zh = server.load_strings("zh-Hant")
        self.assertEqual(zh["choices"], ["通過", "要改", "不行"])
        self.assertEqual(zh["generate"], "產生回覆並複製")
        self.assertEqual((zh["pending"], zh["overall"], zh["notChosen"], zh["listSep"]), ("未批：", "整體：", "未選", "、"))
        self.assertEqual(zh["stale"], "這頁剛改版了，畫面還是舊的：重新整理後再批，回覆才會對到最新版。")
        self.assertEqual(zh["indexSubtitle"].replace("{days}", "7"), "每張頁面從最後一次更新起放 7 天，到期自動刪除。")


    def test_the_python_settings_match_the_schema(self):
        # signoff.py validates its block by hand; preview validates the same block with the schema.
        defs = json.loads((SKILL.parents[2] / "src" / "solopreneur" / "shared" / "config.schema.json").read_text(encoding="utf-8"))["$defs"]
        block, target = defs["signoffs"]["properties"], defs["signoffsTarget"]["properties"]
        self.assertEqual(set(signoff.BLOCK_KEYS), set(block))
        self.assertEqual(set(signoff.TARGET_KEYS), set(target))
        self.assertEqual(signoff.LANGS, tuple(block["lang"]["enum"]))
        self.assertEqual(signoff.PROVIDERS, tuple(target["provider"]["enum"]))
        self.assertEqual((block["ttlDays"]["minimum"], block["ttlDays"]["maximum"]), (1, server.TTL_MAX))


class Settings(Base):
    def test_defaults_without_any_config(self):
        repo = self.mkdir("repo")
        git(repo, "init", "-q")
        os.chdir(self.mkdir("repo", "sub"))
        s = signoff.resolve(os.getcwd())
        self.assertEqual((s["provider"], s["lang"], s["ttlDays"], s["userConfig"], s["projectConfig"]), ("local", "en", 7, None, None))
        self.assertEqual(s["dir"], os.path.join(repo, "docs", "solopreneur", "sign-offs"))
        self.assertTrue(s["url"].startswith("file://"))

    def test_walk_up_skips_files_without_a_signoffs_block(self):
        outer = self.config(self.tmp, {"lang": "zh-Hant"})
        mid = self.mkdir("work", "mid")
        with open(os.path.join(mid, ".solopreneur.json"), "w") as f:
            json.dump({"schemaVersion": 2, "preview": {"root": "."}}, f)
        s = signoff.resolve(self.mkdir("work", "mid", "deeper"))
        self.assertEqual((s["projectConfig"], s["lang"]), (outer, "zh-Hant"))

    def test_settings_come_key_by_key_from_the_nearest_project_file_then_the_user_config(self):
        self.config(self.tmp, {"replyTo": "farther"})  # only the nearest project file counts
        near = self.config(self.cwd, {"ttlDays": 5})
        user = self.user_config({"lang": "zh-Hant", "ttlDays": 3, "defaultTarget": "t",
                                 "targets": {"t": {"provider": "static", "url": "https://x/", "dir": "/srv"}}})
        s = signoff.resolve(self.cwd)
        self.assertEqual((s["projectConfig"], s["userConfig"]), (near, user))
        self.assertEqual((s["lang"], s["ttlDays"], s["provider"], s["target"]), ("zh-Hant", 5, "static", "t"))
        self.assertNotEqual(s["replyTo"], "farther")

    def test_the_user_level_file_is_the_last_layer(self):
        self.user_config({"ttlDays": 2})
        self.assertEqual(signoff.resolve(self.cwd)["ttlDays"], 2)

    def test_a_project_file_cannot_say_where_pages_go(self):
        # A cloned repository's own file must not send pages to a host the user never chose.
        target = {"provider": "server", "host": "me@elsewhere", "url": "https://elsewhere.example/"}
        for block in ({"defaultTarget": "t", "targets": {"t": target}}, {"targets": {}}, {"defaultTarget": "t"}):
            with self.subTest(block):
                path = self.config(self.cwd, block)
                code, out, err = self.cli("config")
                self.assertEqual(code, 2, out + err)
                self.assertIn(path, err)
                self.assertIn("cannot be set in a project's .solopreneur.json", err)
                self.assertIn("move them to ~/.config/solopreneur/config.json", err)
        # The same block in the user config is what it is for.
        os.remove(os.path.join(self.cwd, ".solopreneur.json"))
        self.user_config({"defaultTarget": "t", "targets": {"t": target}})
        self.assertEqual(signoff.resolve(self.cwd)["target"], "t")

    def test_an_explicit_config_never_falls_through(self):
        self.config(self.cwd, {"ttlDays": 5})
        explicit = self.config(self.mkdir("elsewhere"), {"ttlDays": 9})
        with mock.patch.dict(os.environ, {"SOLOPRENEUR_CONFIG": explicit}):
            self.assertEqual(signoff.resolve(self.cwd)["ttlDays"], 9)
        # The file the user names is a user config: it may say where pages go.
        named = self.config(self.mkdir("named"), {"defaultTarget": "t", "targets": {"t": {"provider": "local"}}})
        with mock.patch.dict(os.environ, {"SOLOPRENEUR_CONFIG": named}):
            self.assertEqual(signoff.resolve(self.cwd)["target"], "t")
        other = os.path.join(self.tmp, "preview-only.json")
        with open(other, "w") as f:
            json.dump({"schemaVersion": 2, "preview": {}}, f)
        with mock.patch.dict(os.environ, {"SOLOPRENEUR_CONFIG": other}):
            self.assertEqual(signoff.resolve(self.cwd)["ttlDays"], 7)  # built-in default, not the ancestor's 5
        with mock.patch.dict(os.environ, {"SOLOPRENEUR_CONFIG": os.path.join(self.tmp, "nope.json")}):
            self.expect_error("does not exist", signoff.resolve, self.cwd)

    def test_broken_files_stop_the_walk(self):
        self.config(self.tmp, {"ttlDays": 5})
        path = os.path.join(self.cwd, ".solopreneur.json")
        for body, needle in (("{oops", "malformed JSON"), ("[]", "top level")):
            with self.subTest(needle):
                with open(path, "w") as f:
                    f.write(body)
                self.expect_error(needle, signoff.resolve, self.cwd)
        os.remove(path)
        os.symlink(os.path.join(self.cwd, "missing.json"), path)
        self.expect_error("broken symlink", signoff.resolve, self.cwd)

    def test_invalid_values_are_reported_with_the_file(self):
        cases = [
            ({"lang": "fr"}, "signoffs.lang"),
            ({"ttlDays": "7"}, "signoffs.ttlDays"),
            ({"ttlDays": 0}, "signoffs.ttlDays"),
            ({"ttlDays": True}, "signoffs.ttlDays"),
            ({"ttlDays": 7.5}, "signoffs.ttlDays"),
            ({"defaultTarget": "nope"}, "no such target"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "static", "url": "https://x/"}}}, "dir"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "static", "url": "ftp://x/", "dir": "/srv"}}}, "url"),
            # the page id is appended to url as text: it needs a host, and no query or fragment
            ({"defaultTarget": "p", "targets": {"p": {"provider": "static", "url": "https://x/r?team=a", "dir": "/srv"}}}, "targets.p.url"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "static", "url": "https://x/r#top", "dir": "/srv"}}}, "targets.p.url"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "static", "url": "https:///nohost", "dir": "/srv"}}}, "targets.p.url"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "static", "url": "https://x:abc/r/", "dir": "/srv"}}}, "targets.p.url"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "static", "url": "https://x/", "dir": "srv"}}}, "absolute"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "vercel"}}}, "provider"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "local", "url": "https://x/"}}}, "signoffs.root"),
            # a repository's own config must not smuggle ssh options in through the host
            ({"defaultTarget": "p", "targets": {"p": {"provider": "server", "url": "https://x/", "host": "-oProxyCommand=touch pwned"}}}, "SSH destination"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "server", "url": "https://x/", "host": "me@box extra"}}}, "SSH destination"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "server", "url": "https://x/", "host": "box;touch pwned"}}}, "SSH destination"),
            ({"defaultTarget": "p", "targets": {"p": {"provider": "server", "url": "https://x/", "host": "box\n"}}}, "SSH destination"),
            # every target, not only the one in use: preview validates the whole file
            ({"targets": {"old": {"provider": "vercel"}}}, "targets.old.provider"),
            ({"targets": {"old": {"provider": "static", "url": "https://x/"}}}, "targets.old.dir"),
            ({"targets": {"old": {"provider": "server", "url": "https://x/r?a"}}}, "targets.old.url"),
            ({"defaultTarget": ["p"], "targets": {"p": {"provider": "local"}}}, "defaultTarget"),
            ({"replyTo": "x" * 201}, "signoffs.replyTo"),
            # null is a value, not "use the default": the schema types every key, so preview would refuse it too
            ({"root": None}, "signoffs.root"),
            ({"replyTo": None}, "signoffs.replyTo"),
            ({"defaultTarget": None}, "signoffs.defaultTarget"),
            ({"lang": None}, "signoffs.lang"),
            ({"ttlDays": None}, "signoffs.ttlDays"),
            ({"targets": None}, "signoffs.targets"),
        ]
        project = os.path.join(self.cwd, ".solopreneur.json")
        user = os.path.join(self.home, ".config", "solopreneur", "config.json")
        for block, needle in cases:
            for where in (["user"] if set(block) & set(signoff.USER_ONLY_KEYS) else ["project", "user"]):
                with self.subTest(block=block, where=where):
                    for leftover in (project, user):
                        if os.path.exists(leftover):
                            os.remove(leftover)
                    path = self.config(self.cwd, block) if where == "project" else self.user_config(block)
                    self.expect_error(needle, signoff.resolve, self.cwd)
                    self.expect_error(path, signoff.resolve, self.cwd)
        os.remove(user)
        with open(project, "w") as f:
            json.dump({"schemaVersion": 1, "signoffs": {}}, f)
        self.expect_error("schemaVersion", signoff.resolve, self.cwd)

    def test_a_whole_number_written_with_a_decimal_point_is_accepted(self):
        # JSON 7.0 is an integer to the schema and to preview; json.load reads it as a float.
        self.config(self.cwd, {"ttlDays": 7.0})
        ttl = signoff.resolve(self.cwd)["ttlDays"]
        self.assertEqual((ttl, type(ttl)), (7, int))  # the store takes whole numbers only

    def test_unknown_keys_and_plain_http_only_warn(self):
        self.user_config({"ttlDay": 3, "defaultTarget": "p",
                          "targets": {"p": {"provider": "static", "url": "http://portal.example/so", "dir": "/srv/so"}}})
        s = signoff.resolve(self.cwd)
        self.assertEqual(s["url"], "http://portal.example/so/")
        self.assertTrue(any("ttlDay" in w for w in s["warnings"]))
        self.assertTrue(any("copy button" in w for w in s["warnings"]))

    def test_a_relative_root_resolves_against_the_config_file(self):
        path = self.config(self.mkdir("proj"), {"root": "./review"})
        s = signoff.resolve(self.mkdir("proj", "a", "b"))
        self.assertEqual(s["dir"], os.path.join(os.path.dirname(path), "review"))

    def test_a_linked_worktree_publishes_into_the_main_working_tree(self):
        main = self.mkdir("main")
        git(main, "init", "-q")
        git(main, "commit", "-q", "--allow-empty", "-m", "init")
        linked = os.path.join(self.tmp, "linked")
        git(main, "worktree", "add", "-q", linked)
        self.assertEqual(signoff.resolve(linked)["dir"], os.path.join(main, "docs", "solopreneur", "sign-offs"))
        self.config(linked, {"root": "./review"})  # a committed config exists in every worktree
        self.assertEqual(signoff.resolve(linked)["dir"], os.path.join(main, "review"))

    def test_a_submodule_keeps_its_own_working_tree(self):
        sub = self.mkdir("subsrc")
        git(sub, "init", "-q")
        git(sub, "commit", "-q", "--allow-empty", "-m", "s")
        main = self.mkdir("super")
        git(main, "init", "-q")
        git(main, "commit", "-q", "--allow-empty", "-m", "m")
        git(main, "-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "mod")
        mod = os.path.join(main, "mod")
        self.assertEqual(signoff.resolve(mod)["dir"], os.path.join(mod, "docs", "solopreneur", "sign-offs"))


class HostDetection(unittest.TestCase):
    def test_this_machine(self):
        for host in (None, "", "local", "localhost", "127.0.0.1", socket.gethostname()):
            with self.subTest(host):
                self.assertTrue(signoff.is_local_host(host))

    def test_other_machines_and_other_users(self):
        self.assertFalse(signoff.is_local_host("203.0.113.7"))  # TEST-NET-3, never assigned locally
        self.assertFalse(signoff.is_local_host("someone-else-entirely@localhost"))

    def test_a_shared_first_label_is_not_enough(self):
        with mock.patch.object(signoff, "_local_names", return_value={"localhost", "build.office"}), \
                mock.patch.object(signoff, "_is_local_address", return_value=False):
            self.assertFalse(signoff.is_local_host("build.home"))
            self.assertTrue(signoff.is_local_host("build.office"))

    def test_a_forwarded_port_or_a_jump_host_is_another_machine(self):
        # A VM or a tunnel answers on this machine's own address, yet it is another machine.
        for resolved, local in (("hostname 127.0.0.1\nport 22\n", True),
                                ("hostname 127.0.0.1\nport 60022\n", False),
                                ("hostname 127.0.0.1\nport 22\nproxyjump gate\n", False),
                                ("hostname 127.0.0.1\nport 22\nproxycommand none\n", True)):
            with self.subTest(resolved), \
                    mock.patch.object(signoff, "_run", lambda cmd, cwd=None, timeout=10, out=resolved: out if cmd[0] == "ssh" else None):
                self.assertEqual(signoff.is_local_host("vm"), local)

    def test_ssh_s_host_name_decides_not_the_alias(self):
        # An alias named after this machine whose HostName is another machine connects there.
        with mock.patch.object(signoff, "_local_names", return_value={"localhost", "alias"}), \
                mock.patch.object(signoff, "_is_local_address", return_value=False):
            with mock.patch.object(signoff, "_run", lambda cmd, cwd=None, timeout=10: "hostname elsewhere.example\nport 22\n"):
                self.assertFalse(signoff.is_local_host("alias"))
            with mock.patch.object(signoff, "_run", lambda cmd, cwd=None, timeout=10: None):  # no ssh: the alias is all there is
                self.assertTrue(signoff.is_local_host("alias"))

    def test_ssh_options_end_before_the_host(self):
        argv = signoff.ssh_argv("me@box", "true")
        self.assertEqual(argv[-3:], ["--", "me@box", "true"])


class Providers(Base):
    """Publish, update, expire and remove through the CLI, for every provider."""

    def target_config(self, provider, **target):
        self.user_config({"defaultTarget": "t", "targets": {"t": dict(provider=provider, **target)}})

    def test_local_publish_update_and_remove(self):
        root = os.path.join(self.cwd, "docs", "solopreneur", "sign-offs")
        src = self.page("p", extra={"shots/a.png": b"png"})
        page_id, out, _ = self.publish(src, "--slug", "demo", "--title", "Demo")
        self.assertIn("file://", out)
        self.assertIn("/%s/index.html" % page_id, out)
        page = os.path.join(root, page_id)
        meta = read_json(os.path.join(page, "meta.json"))
        self.assertEqual((meta["revision"], meta["title"]), (1, "Demo"))
        js = read_text(os.path.join(page, "meta.js"))
        self.assertEqual(json.loads(js[len("window.SIGNOFF_META = "):-2]), meta)
        self.assertEqual(read_text(os.path.join(root, ".gitignore")), "*\n")
        index = read_text(os.path.join(root, "index.html"))
        self.assertIn(server.GENERATOR, index)
        self.assertIn('href="%s/index.html"' % page_id, index)
        html = read_text(os.path.join(page, "index.html"))
        self.assertIn('<meta name="signoff-content" content="%s">' % meta["contentId"], html)
        self.assertIn('<script src="meta.js"></script>', html)

        time.sleep(1.1)  # updatedAt has one-second resolution
        _, out, _ = self.publish(src, "--update", page_id)
        meta2 = read_json(os.path.join(page, "meta.json"))
        self.assertEqual((meta2["revision"], meta2["title"], meta2["createdAt"]), (2, "Demo", meta["createdAt"]))
        self.assertGreater(meta2["expiresAt"], meta["expiresAt"])
        self.assertNotEqual(meta2["contentId"], meta["contentId"])

        code, _, _ = self.cli("rm", page_id)
        self.assertEqual(code, 0)
        self.assertFalse(os.path.exists(page))
        self.assertNotIn(page_id, read_text(os.path.join(root, "index.html")))

    def test_hard_linked_files_go_out_as_regular_files(self):
        # tarfile.add() records a second name of the same file as a link member, which the store refuses.
        src = self.page("p", extra={"shots/a.png": b"png"})
        os.link(os.path.join(src, "shots", "a.png"), os.path.join(src, "shots", "b.png"))
        page_id, _, _ = self.publish(src, "--slug", "hl", "--title", "Linked")
        shots = os.path.join(self.cwd, "docs", "solopreneur", "sign-offs", page_id, "shots")
        self.assertEqual([read_text(os.path.join(shots, n)) for n in ("a.png", "b.png")], ["png", "png"])

    def test_expiry_prunes_only_pages_this_store_wrote(self):
        root = os.path.join(self.cwd, "docs", "solopreneur", "sign-offs")
        old_id, _, _ = self.publish(self.page("old"), "--slug", "old", "--title", "Old")
        meta_path = os.path.join(root, old_id, "meta.json")
        meta = read_json(meta_path)
        meta["expiresAt"] = server.iso(server.utcnow() - dt.timedelta(minutes=1))
        write_json(meta_path, meta)
        code, _, err = self.cli("publish", self.page("old2"), "--update", old_id)
        self.assertEqual(code, 2)
        self.assertIn("expired", err)
        os.makedirs(os.path.join(root, "my-app"))           # an ordinary folder whose name matches the id pattern
        os.makedirs(os.path.join(root, "foo-abc"))
        write_text(os.path.join(root, "foo-abc", "meta.json"), "{broken")
        stale = os.path.join(root, ".incoming", "rx-stale")
        os.makedirs(stale)
        os.utime(stale, (time.time() - 2 * 86400,) * 2)
        new_id, _, _ = self.publish(self.page("new"), "--slug", "new", "--title", "New")
        self.assertFalse(os.path.exists(os.path.join(root, old_id)))
        self.assertFalse(os.path.exists(stale))
        self.assertTrue(os.path.isdir(os.path.join(root, "my-app")))
        self.assertTrue(os.path.isdir(os.path.join(root, "foo-abc")))
        index = read_text(os.path.join(root, "index.html"))
        self.assertIn(new_id, index)
        self.assertNotIn(old_id, index)

    def test_static_publishes_to_a_served_folder(self):
        portal = self.mkdir("portal")
        with http_dir(portal) as url:
            self.target_config("static", url=url, dir=portal)
            page_id, out, _ = self.publish(self.page("p", extra={"a.png": b"png"}), "--slug", "st", "--title", "Static",
                                           "--target", "t")
            self.assertIn("%s%s/" % (url, page_id), out)
            self.assertIn("--update %s --target t\n" % page_id, out)  # the update must reach the same target
            meta = json.loads(get(url + page_id + "/meta.json")[2])
            self.assertEqual(meta["source"], {})  # a portal may be public: no machine or repo names
            self.assertIn(page_id.encode(), get(url)[2])

    def test_the_update_command_keeps_raw(self):
        # Without --raw, the update would be checked as a content fragment and refused.
        page_id, out, _ = self.publish(self.page("raw", "<!doctype html><p>own UI</p>"), "--slug", "raw", "--title", "Raw", "--raw")
        self.assertIn("--update %s --raw\n" % page_id, out)

    def test_static_refuses_an_index_it_did_not_write(self):
        portal = self.mkdir("site")
        write_text(os.path.join(portal, "index.html"), "<h1>my real site</h1>")
        self.target_config("static", url="http://127.0.0.1:9/", dir=portal)
        code, _, err = self.cli("publish", self.page("p"), "--slug", "st", "--title", "Static")
        self.assertEqual(code, 2)
        self.assertIn("not written by sign-offs", err)
        self.assertEqual(read_text(os.path.join(portal, "index.html")), "<h1>my real site</h1>")

    def test_server_publishes_and_serves_the_index(self):
        store = self.mkdir("store")
        with signoffs_server(store) as url:
            self.target_config("server", url=url, dir=store)
            page_id, out, _ = self.publish(self.page("p"), "--slug", "sv", "--title", "Served")
            self.assertIn("%s%s/" % (url, page_id), out)
            # Published through defaultTarget: the update names it, or a changed default would look elsewhere.
            self.assertIn("--update %s --target t\n" % page_id, out)
            self.assertFalse(os.path.exists(os.path.join(store, "index.html")))  # rendered per request instead
            status, _, body = get(url)
            self.assertEqual(status, 200)
            self.assertIn(page_id.encode(), body)
            self.assertIn(b"machine", json.dumps(json.loads(get(url + page_id + "/meta.json")[2])["source"]).encode())

    def test_a_remote_host_receives_the_shipped_store(self):
        store = self.mkdir("remote-store")
        with signoffs_server(store) as url, \
                mock.patch.object(signoff, "ssh_argv", lambda host, command: ["sh", "-c", command]):
            self.target_config("server", url=url, dir=store, host="someone-else-entirely@remote.invalid")
            page_id, _, _ = self.publish(self.page("p", extra={"shots/a b.png": b"png"}), "--slug", "rm", "--title", "Remote")
            self.assertTrue(os.path.isfile(os.path.join(store, page_id, "shots", "a b.png")))
            code, out, _ = self.cli("rm", page_id)
            self.assertEqual(code, 0, out)
            self.assertFalse(os.path.exists(os.path.join(store, page_id)))

    def test_an_unverifiable_publish_exits_3(self):
        store, elsewhere = self.mkdir("store"), self.mkdir("elsewhere")
        with http_dir(elsewhere) as url:
            self.target_config("static", url=url, dir=store)
            code, _, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
        self.assertEqual(code, 3)
        self.assertIn("do not hand out the link", err)
        # The page is stored all the same: another --slug publish would leave it behind as a second page.
        [page_id] = [n for n in os.listdir(store) if server.page_meta(store, n)]
        self.assertIn("--update %s --target t," % page_id, err)  # the default target, named
        self.assertIn("signoff.py rm %s --target t`" % page_id, err)

    def test_a_link_the_web_server_refuses_exits_3(self):
        # Every file reads back, but the printed link is a folder address and this
        # web server has directory indexes turned off.
        class NoIndex(SimpleHTTPRequestHandler):
            def do_GET(self):
                if self.path.endswith("/"):
                    return self.send_error(403)
                return super().do_GET()

        store = self.mkdir("store")
        with http_dir(store, NoIndex) as url:
            self.target_config("static", url=url, dir=store)
            code, out, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
        self.assertEqual(code, 3)
        self.assertNotIn("Published", out)
        self.assertIn("do not hand out the link", err)

    def test_a_link_redirected_to_another_path_exits_3(self):
        # A host that strips trailing slashes serves the same index.html at <id>, but
        # the browser then resolves meta.json and the images against the parent folder.
        class NoTrailingSlash(SimpleHTTPRequestHandler):
            def do_GET(self):
                if self.path != "/" and self.path.endswith("/"):
                    self.send_response(301)
                    self.send_header("Location", self.path.rstrip("/"))
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if os.path.isdir(self.translate_path(self.path)):
                    self.path += "/index.html"
                super().do_GET()

        store = self.mkdir("store")
        with http_dir(store, NoTrailingSlash) as url:
            self.target_config("static", url=url, dir=store)
            code, out, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
        self.assertEqual(code, 3, out + err)
        self.assertNotIn("Published", out)
        self.assertIn("redirects to", err)

    def test_files_are_read_back_from_where_the_link_lands(self):
        # A proxy may send the link to another host on the same path: the page then
        # loads meta.json and its images from there, so the read-back follows it.
        seen = []

        class OtherHost(SimpleHTTPRequestHandler):
            def do_GET(self):
                host = self.headers["Host"].split(":")[0]
                seen.append((host, self.path))
                if host == "127.0.0.1" and self.path.endswith("/") and self.path != "/":
                    self.send_response(301)
                    self.send_header("Location", "http://localhost:%d%s" % (self.server.server_address[1], self.path))
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                super().do_GET()

        store = self.mkdir("store")
        with http_dir(store, OtherHost) as url:
            self.target_config("static", url=url, dir=store)
            page_id, _, _ = self.publish(self.page("p", extra={"a.png": b"png"}), "--slug", "x", "--title", "X")
        folder = "/%s/" % page_id
        self.assertEqual(seen, [("127.0.0.1", folder), ("localhost", folder), ("localhost", folder + "a.png"),
                                ("localhost", folder + "index.html"), ("localhost", folder + "meta.json")])

    def test_an_unreadable_meta_json_exits_3(self):
        store = self.mkdir("store")

        class Garbled(SimpleHTTPRequestHandler):
            def do_GET(self):
                if self.path.endswith("/meta.json"):
                    body = b"<html>a login page</html>"
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                super().do_GET()

        httpd = QuickServer(("127.0.0.1", 0), functools.partial(quiet(Garbled), directory=store))
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            self.target_config("static", url="http://127.0.0.1:%d/" % httpd.server_address[1], dir=store)
            code, _, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
        finally:
            httpd.shutdown()
            httpd.server_close()
        self.assertEqual(code, 3)
        self.assertIn("no readable meta.json", err)

    def test_a_meta_json_served_from_another_origin_exits_3(self):
        # The page reads meta.json with fetch(), which a browser refuses across origins.
        class OtherOrigin(SimpleHTTPRequestHandler):
            def do_GET(self):
                if self.headers["Host"].split(":")[0] == "127.0.0.1" and self.path.endswith("/meta.json"):
                    self.send_response(301)
                    self.send_header("Location", "http://localhost:%d%s" % (self.server.server_address[1], self.path))
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                super().do_GET()

        store = self.mkdir("store")
        with http_dir(store, OtherOrigin) as url:
            self.target_config("static", url=url, dir=store)
            code, out, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
        self.assertEqual(code, 3, out + err)
        self.assertNotIn("Published", out)
        self.assertIn("own origin", err)

    def test_a_local_meta_js_that_disagrees_with_meta_json_exits_3(self):
        # A file:// page reads meta.js, not meta.json.
        real = signoff.call_store

        def stale_meta_js(settings, request, files=None):
            result = real(settings, request, files)
            page = os.path.join(settings["dir"], result["id"])
            meta = dict(read_json(os.path.join(page, "meta.json")), revision=0)
            write_text(os.path.join(page, "meta.js"), "window.SIGNOFF_META = %s;\n" % server.script_json(meta))
            return result

        with mock.patch.object(signoff, "call_store", stale_meta_js):
            code, out, err = self.cli("publish", self.page("p"), "--slug", "js", "--title", "JS")
        self.assertEqual(code, 3, out + err)
        self.assertNotIn("Published", out)
        self.assertIn("meta.js", err)

    def test_a_meta_json_altered_on_the_way_exits_3(self):
        # Revision and content id still match, but without expiresAt the page refuses
        # review: meta.json must be the whole metadata the store wrote.
        class NoExpiry(SimpleHTTPRequestHandler):
            def do_GET(self):
                if not self.path.endswith("/meta.json"):
                    return super().do_GET()
                meta = read_json(self.translate_path(self.path))
                del meta["expiresAt"]
                body = json.dumps(meta).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        store = self.mkdir("store")
        with http_dir(store, NoExpiry) as url:
            self.target_config("static", url=url, dir=store)
            code, out, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
        self.assertEqual((code, out), (3, ""), err)
        self.assertIn("expiresAt", err)

    def test_a_link_that_would_not_open_as_a_page_exits_3(self):
        # The bytes match, but a browser shows text/plain as source and saves an attachment.
        class PlainText(SimpleHTTPRequestHandler):
            def guess_type(self, path):
                return "text/plain" if path.endswith(".html") else super().guess_type(path)

        class Download(SimpleHTTPRequestHandler):
            def end_headers(self):
                if self.path.endswith("/"):
                    self.send_header("Content-Disposition", "attachment")
                super().end_headers()

        for handler in (PlainText, Download):
            with self.subTest(handler.__name__):
                store = self.mkdir("store-" + handler.__name__)
                with http_dir(store, handler) as url:
                    self.target_config("static", url=url, dir=store)
                    code, out, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
                self.assertEqual(code, 3, out + err)
                self.assertNotIn("Published", out)
                self.assertIn("text/html, inline", err)

    def test_a_policy_that_breaks_the_wrapped_page_exits_3(self):
        # The review UI is one inline <script> that fetches meta.json: under script-src 'self'
        # the page never leaves "Loading…", and without the fetch it has no id or revision.
        class Policy(SimpleHTTPRequestHandler):
            policy = None

            def end_headers(self):
                self.send_header("Content-Security-Policy", self.policy)
                super().end_headers()

        cases = (("script-src 'self'", "script-src must allow 'unsafe-inline'"),
                 ("script-src 'self' 'unsafe-inline'", None),
                 ("script-src 'unsafe-inline'; connect-src 'none'", "connect-src must allow 'self'"),
                 ("default-src 'self' 'unsafe-inline'", None),
                 ("connect-src https://other.example", "connect-src must allow 'self'"),
                 # Without allow-same-origin the origin is opaque: fetch('meta.json') and localStorage fail.
                 ("sandbox allow-scripts", "sandbox must include allow-scripts and allow-same-origin"),
                 ("script-src 'unsafe-inline'; sandbox allow-scripts allow-same-origin", None),
                 # The page assigns plain strings to innerHTML, which Trusted Types make throw.
                 ("script-src 'unsafe-inline'; require-trusted-types-for 'script'",
                  "require-trusted-types-for must not list 'script'"))
        for i, (policy, hint) in enumerate(cases):
            with self.subTest(policy):
                Policy.policy = policy
                store = self.mkdir("store-%d" % i)
                with http_dir(store, Policy) as url:
                    self.target_config("static", url=url, dir=store)
                    code, out, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
                self.assertEqual(code, 3 if hint else 0, out + err)
                if hint:
                    self.assertNotIn("Published", out)
                    self.assertIn(hint, err)

    def test_which_policies_break_the_wrapped_page(self):
        # CSP3, and every policy must allow the page. The inline script: script-src-elem, else
        # script-src, else default-src decides, and a nonce, a hash or 'strict-dynamic' makes
        # browsers ignore 'unsafe-inline'. fetch('meta.json'): connect-src, else default-src.
        # A sandbox needs allow-scripts and allow-same-origin, and Trusted Types must not be
        # required for scripts. Each case names the directive the hint says to change.
        cases = [([], None),
                 (["img-src 'self'"], None),  # scripts and fetches unrestricted
                 (["default-src 'self'"], "default-src"),
                 (["Default-Src 'self' 'UNSAFE-INLINE'"], None),
                 (["script-src-elem 'self'; script-src 'unsafe-inline'"], "script-src-elem"),
                 (["script-src 'unsafe-inline' 'nonce-abc'"], "script-src"),
                 (["script-src 'unsafe-inline' 'sha256-abc='"], "script-src"),
                 (["script-src 'unsafe-inline' 'strict-dynamic'"], "script-src"),
                 (["script-src 'unsafe-inline'; script-src 'none'"], None),  # a repeated directive is ignored
                 (["script-src 'unsafe-inline'", "default-src 'none'"], "default-src"),  # two headers
                 (["script-src 'unsafe-inline', default-src 'none'"], "default-src"),  # two policies in one header
                 (["default-src 'unsafe-inline'"], "default-src"),  # the fetch falls back to it too
                 (["connect-src 'none'"], "connect-src"),
                 (["connect-src"], "connect-src"),  # an empty list allows nothing
                 (["connect-src https://other.example *.box.example"], "connect-src"),  # *. covers subdomains only
                 (["connect-src 'none' 'self'"], None),  # 'none' beside other sources is ignored
                 (["connect-src *"], None),
                 (["connect-src https:"], None),
                 (["connect-src http:"], None),  # a browser upgrades http: to https:
                 (["connect-src wss:"], "connect-src"),  # Chrome lets no ws: or wss: cover a fetch
                 (["connect-src ws:"], "connect-src"),
                 (["connect-src HTTPS://Box.Example:443/x-abc/"], None),
                 (["connect-src https://*.example"], None),
                 (["sandbox"], "sandbox"),
                 (["sandbox allow-scripts"], "sandbox"),
                 (["sandbox allow-same-origin"], "sandbox"),
                 (["SANDBOX Allow-Scripts allow-forms Allow-Same-Origin"], None),
                 (["require-trusted-types-for 'script'"], "require-trusted-types-for")]
        for values, directive in cases:
            with self.subTest(values):
                headers = email.message.Message()
                for value in values:
                    headers["Content-Security-Policy"] = value
                headers["Content-Security-Policy-Report-Only"] = (  # reports, never blocks
                    "script-src 'none'; sandbox; require-trusted-types-for 'script'")
                found = signoff._blocking_policy(headers, "https://box.example/x-abc/")
                self.assertEqual(found and found[2].split()[0], directive)
        # An http page: only http: covers the fetch.
        for source, directive in (("http:", None), ("ws:", "connect-src")):
            with self.subTest("http page", source=source):
                headers = email.message.Message()
                headers["Content-Security-Policy"] = "connect-src " + source
                found = signoff._blocking_policy(headers, "http://box.example/x-abc/")
                self.assertEqual(found and found[2].split()[0], directive)

    def test_an_existing_gitignore_still_ignores_the_pages(self):
        root = self.mkdir("work", "docs", "solopreneur", "sign-offs")
        write_text(os.path.join(root, ".gitignore"), "# mine")
        self.publish(self.page("p"), "--slug", "gi", "--title", "Ignore")
        self.assertEqual(read_text(os.path.join(root, ".gitignore")), "# mine\n*\n")
        self.publish(self.page("p"), "--slug", "gi", "--title", "Ignore")
        self.assertEqual(read_text(os.path.join(root, ".gitignore")), "# mine\n*\n")
        # git applies the last matching rule: a `*` followed by exceptions ignores nothing they name
        write_text(os.path.join(root, ".gitignore"), "*\n!*/\n!*.png\n")
        self.publish(self.page("p"), "--slug", "gi", "--title", "Ignore")
        self.assertEqual(read_text(os.path.join(root, ".gitignore")), "*\n!*/\n!*.png\n*\n")
        # git drops trailing spaces only: `*` and a tab matches just names ending in a tab
        write_text(os.path.join(root, ".gitignore"), "*\t\n")
        self.publish(self.page("p"), "--slug", "gi", "--title", "Ignore")
        self.assertEqual(read_text(os.path.join(root, ".gitignore")), "*\t\n*\n")

    def test_a_symlinked_gitignore_is_refused(self):
        root = self.mkdir("work", "docs", "solopreneur", "sign-offs")
        write_text(os.path.join(self.cwd, ".gitignore"), "node_modules\n")
        os.symlink(os.path.join(self.cwd, ".gitignore"), os.path.join(root, ".gitignore"))
        code, _, err = self.cli("publish", self.page("p"), "--slug", "gi", "--title", "Ignore")
        self.assertEqual(code, 2)
        self.assertIn("symlink", err)
        self.assertEqual(read_text(os.path.join(self.cwd, ".gitignore")), "node_modules\n")

    def test_dry_run_publishes_nothing(self):
        code, out, _ = self.cli("publish", self.page("p"), "--slug", "dry", "--title", "Dry", "--dry-run")
        self.assertEqual(code, 0)
        self.assertIn("nothing published", out)
        self.assertFalse(os.path.exists(os.path.join(self.cwd, "docs")))

    def test_limits_and_a_missing_folder_fail_before_anything_is_written(self):
        for argv, needle in ((["", "--slug", "x", "--title", "X"], "no page folder"),
                             # $ would match before the newline: the page would land in a folder nothing finds again
                             ([self.page("p"), "--slug", "abc\n", "--title", "X"], "malformed slug"),
                             ([self.page("p"), "--slug", "x", "--title", "t" * 121], "longer than 120"),
                             ([self.page("p"), "--slug", "x", "--title", "X", "--reply-to", "r" * 201], "longer than 200")):
            with self.subTest(needle):
                code, _, err = self.cli("publish", *argv)
                self.assertEqual(code, 2)
                self.assertIn(needle, err)
        self.assertFalse(os.path.exists(os.path.join(self.cwd, "docs")))

    def test_a_folder_holding_other_files_is_not_claimed(self):
        # .lock is a generic name: another tool's lock does not make the folder a sign-offs folder
        for root, names, foreign in (("docs", ["spec.md"], "spec.md"), ("locked", [".lock", "notes.txt"], "notes.txt")):
            with self.subTest(root):
                self.config(self.cwd, {"root": root})
                for name in names:
                    write_text(os.path.join(self.mkdir("work", root), name), "")
                code, _, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
                self.assertEqual(code, 2)
                self.assertIn("already holds other files (%s)" % foreign, err)
                self.assertFalse(os.path.exists(os.path.join(self.cwd, root, ".gitignore")))

    def test_a_repository_root_is_never_the_local_folder(self):
        git(self.cwd, "init", "-q")
        self.config(self.cwd, {"root": "."})
        code, _, err = self.cli("publish", self.page("p"), "--slug", "x", "--title", "X")
        self.assertEqual(code, 2)
        self.assertIn("dedicated", err)
        self.assertFalse(os.path.exists(os.path.join(self.cwd, ".gitignore")))


def make_request(contents, **req):
    """A store request tar. contents: {relative path: bytes}; req lands in request.json."""
    req.setdefault("files", {k: hashlib.sha256(v).hexdigest() for k, v in contents.items()})
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:") as tf:
        def add(name, data):
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            tf.addfile(ti, io.BytesIO(data))
        add("request.json", json.dumps(req).encode())
        for k, v in contents.items():
            add("payload/" + k, v)
    return buf.getvalue()


def odd_tar(name, symlink=False):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:") as tf:
        ti = tarfile.TarInfo(name)
        if symlink:
            ti.type, ti.linkname = tarfile.SYMTYPE, "/etc/hosts"
            tf.addfile(ti)
        else:
            ti.size = 1
            tf.addfile(ti, io.BytesIO(b"x"))
    return buf.getvalue()


class Store(Base):
    PAGE = {"index.html": b"<h1>t</h1><img src='a.png'>", "a.png": b"png"}

    def setUp(self):
        super().setUp()
        self.root = self.mkdir("store")
        self.id = server.store(self.root, make_request(self.PAGE, mode="new", slug="e2e", title="T"))["id"]

    def refused(self, needle, data):
        with self.assertRaises(server.StoreError) as ctx:
            server.store(self.root, data)
        self.assertIn(needle, str(ctx.exception))

    def test_malformed_requests_are_refused(self):
        self.refused("rejected file name", odd_tar("payload/../x"))
        self.refused("rejected file name", make_request({"index.html": b"x", ".env": b"x"}, mode="new", slug="a", title="t"))
        self.refused("link", odd_tar("payload/index.html", symlink=True))
        self.refused("reserved", make_request({"index.html": b"x", "meta.js": b""}, mode="new", slug="a", title="t"))
        # In any case: on a case-insensitive volume the generated meta.json would overwrite it, found out after the swap.
        self.refused("reserved", make_request(dict(self.PAGE, **{"META.JSON": b"{}"}), mode="update", id=self.id))
        self.refused("checksum", make_request({"index.html": b"x"}, mode="new", slug="a", title="t", files={"index.html": "0" * 64}))
        self.refused("no index.html", make_request({"a.html": b"x"}, mode="new", slug="a", title="t"))
        self.refused("slug", make_request(self.PAGE, mode="new", slug="Bad_Slug", title="t"))
        self.refused("slug", make_request(self.PAGE, mode="new", slug="abc\n", title="t"))
        self.refused("no page", make_request(self.PAGE, mode="update", id="nope-abc"))
        self.refused("contentId", make_request(self.PAGE, mode="update", id=self.id, contentId="NOT-HEX"))
        self.refused("contentId", make_request(self.PAGE, mode="update", id=self.id, contentId="a" * 16 + "\n"))
        self.refused("malformed page id", make_request({}, mode="rm", id=self.id + "\n"))
        self.refused("ttlDays", make_request(self.PAGE, mode="update", id=self.id, ttlDays=0))
        self.refused("malformed page id", make_request({}, mode="rm", id="../store"))
        self.assertEqual(os.listdir(server.incoming_dir(self.root)), [])

    def test_symlinked_bookkeeping_entries_are_refused(self):
        for name in server.OWN_ENTRIES:
            with self.subTest(name):
                root, victim = self.mkdir("linked" + name), self.mkdir("victim" + name)
                os.symlink(victim, os.path.join(root, name))
                self.assertRaises(server.StoreError, server.store, root, make_request(self.PAGE, mode="new", slug="x", title="t"))
                self.assertRaises(server.StoreError, server.prune, root)
                self.assertEqual(os.listdir(victim), [])

    def test_a_request_cut_short_is_reported_not_raised(self):
        data = make_request({"index.html": b"<p>x</p>", "a.png": b"p" * 5000}, mode="new", slug="cut", title="t")
        result = server.handle_store(self.root, data[:-3000])
        self.assertFalse(result["ok"])
        self.assertIn("damaged", result["error"])  # read errors surface mid-file, past tarfile.open

    def test_long_source_details_are_clipped_not_refused(self):
        with mock.patch.dict(os.environ, {"TMUX": "/tmp/t", "TMUX_PANE": "%1"}), \
                mock.patch.object(signoff, "_run", lambda cmd, cwd=None, timeout=10: "w" * 100 if cmd[0] == "tmux" else None):
            src = signoff.detect_source()
        self.assertEqual(src["tmux"], "w" * server.SOURCE_MAX)
        server.store(self.root, make_request(self.PAGE, mode="new", slug="src", title="t", source=src))

    def test_a_failed_swap_keeps_the_previous_revision(self):
        real = os.rename

        def failing(src, dst):
            if os.path.basename(src) == "payload":
                raise OSError(28, "No space left on device")
            return real(src, dst)

        with mock.patch("os.rename", failing):
            self.refused("could not swap", make_request(self.PAGE, mode="update", id=self.id))
        self.assertEqual(server.load_meta(os.path.join(self.root, self.id))["revision"], 1)

    def test_a_failed_restore_keeps_the_previous_revision_where_the_error_says(self):
        real, calls = os.rename, []

        def failing(src, dst):
            calls.append(src)
            if len(calls) > 1:  # moving the old revision aside works; the swap and the restore do not
                raise OSError(5, "Input/output error")
            return real(src, dst)

        with mock.patch.object(server.os, "rename", failing), self.assertRaises(server.StoreError) as ctx:
            server.store(self.root, make_request(self.PAGE, mode="update", id=self.id))
        self.assertEqual(len(calls), 3)
        [work] = os.listdir(server.incoming_dir(self.root))
        kept = os.path.join(server.incoming_dir(self.root), work, "previous")
        self.assertIn(kept, str(ctx.exception))
        self.assertEqual(server.load_meta(kept)["revision"], 1)
        # The day-old upload sweep leaves it too: it is the only copy until moved back by hand.
        server.prune(self.root, at=server.utcnow() + dt.timedelta(days=2), log=lambda *_: None)
        self.assertEqual(server.load_meta(kept)["revision"], 1)

    def test_concurrent_updates_get_distinct_revisions(self):
        data = make_request(self.PAGE, mode="update", id=self.id)
        procs = [subprocess.Popen([sys.executable, str(SKILL / "scripts" / "server.py"), "store", "--dir", self.root],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE) for _ in range(2)]
        results = []

        def run(proc):
            results.append(json.loads(proc.communicate(data)[0].decode()))

        # One thread per process: communicate() in turn would hand the second its
        # request only after the first had exited, and the lock would never be contended.
        threads = [threading.Thread(target=run, args=(p,)) for p in procs]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(sorted(r.get("revision") for r in results), [2, 3], results)

    def test_the_sweep_removes_only_its_own_upload_leftovers(self):
        incoming = server.incoming_dir(self.root)
        mine, other = os.path.join(incoming, "rx-old"), os.path.join(incoming, "other.txt")
        notes = os.path.join(incoming, "rx-notes.txt")  # store() stages in folders only: a file is never its own
        os.makedirs(mine)
        write_text(other, "x")
        write_text(notes, "x")
        for p in (mine, other, notes):
            os.utime(p, (time.time() - 2 * 86400,) * 2)
        self.assertEqual(server.prune(self.root, log=lambda *_: None), [mine])
        self.assertTrue(os.path.isfile(other))
        self.assertTrue(os.path.isfile(notes))

    def test_ttl_sets_the_expiry(self):
        server.store(self.root, make_request(self.PAGE, mode="update", id=self.id, ttlDays=2))
        meta = server.load_meta(os.path.join(self.root, self.id))
        lifetime = server.parse_time(meta["expiresAt"]) - server.parse_time(meta["updatedAt"])
        self.assertEqual(lifetime, dt.timedelta(days=2))


class Serving(Base):
    def setUp(self):
        super().setUp()
        self.root = self.mkdir("store")
        self.id = server.store(self.root, make_request(
            {"index.html": b"<h1>t</h1>", "a.png": b"png"}, mode="new", slug="srv", title="T"))["id"]

    def test_responses(self):
        os.makedirs(os.path.join(self.root, self.id, "sub"))
        write_text(os.path.join(self.root, self.id, ".hidden"), "x")
        os.symlink("/etc/hosts", os.path.join(self.root, self.id, "leak.txt"))
        os.makedirs(os.path.join(self.root, "my-app"))
        with signoffs_server(self.root) as url:
            status, headers, body = get(url + self.id + "/")
            self.assertEqual(status, 200)
            self.assertEqual(headers.get("Cache-Control"), "no-store")
            self.assertIn("charset=utf-8", headers.get("Content-Type"))
            status, headers, _ = get(url + self.id)
            self.assertEqual((status, headers.get("Location")), (301, self.id + "/"))  # relative: sub-path safe
            self.assertEqual(json.loads(get(url + self.id + "/meta.json")[2])["revision"], 1)
            self.assertEqual(get(url + self.id + "/meta.js")[0], 200)
            for path in (self.id + "/sub/", self.id + "/.hidden", ".incoming/", ".lock", self.id + "/leak.txt", "my-app/", "nope-abc/"):
                with self.subTest(path):
                    self.assertEqual(get(url + path)[0], 404)
            index = get(url)[2]
            self.assertIn(('href="%s/"' % self.id).encode(), index)

    def test_a_folder_address_never_opens_a_linked_index_outside_the_store(self):
        # For <id>/ the stock handler opens index.html by itself, after translate_path.
        outside = os.path.join(self.tmp, "outside.html")
        write_text(outside, "OUTSIDE-THE-STORE")
        index = os.path.join(self.root, self.id, "index.html")
        os.remove(index)
        os.symlink(outside, index)
        with signoffs_server(self.root) as url:
            for path in (self.id + "/", self.id + "/index.html"):
                with self.subTest(path):
                    status, _, body = get(url + path)
                    self.assertEqual(status, 404)
                    self.assertNotIn(b"OUTSIDE-THE-STORE", body)

    def test_an_expired_page_answers_410_and_leaves_the_index(self):
        meta_path = os.path.join(self.root, self.id, "meta.json")
        meta = read_json(meta_path)
        meta["expiresAt"] = server.iso(server.utcnow() - dt.timedelta(minutes=1))
        write_json(meta_path, meta)
        os.makedirs(os.path.join(self.root, self.id, "shots"))
        write_text(os.path.join(self.root, self.id, "shots", "a.png"), "png")
        with signoffs_server(self.root, lang="zh-Hant") as url:
            status, _, body = get(url + self.id + "/")
            self.assertEqual(status, 410)
            self.assertIn("這張批閱頁已過期".encode(), body)
            # The link back to the index is relative to the requested address, at any depth.
            for path, home in ((self.id + "/", "../"), (self.id + "/shots/a.png", "../../"), (self.id, "./")):
                with self.subTest(path):
                    status, _, body = get(url + path)
                    self.assertEqual(status, 410)
                    self.assertIn(('href="%s"' % home).encode(), body)
            self.assertNotIn(self.id.encode(), get(url)[2])
        self.assertEqual(server.prune(self.root, log=lambda *_: None), [os.path.join(self.root, self.id)])

    def test_a_burst_of_connections_is_queued_not_reset(self):
        # A proxy opens a dozen connections at once for a page of images. Connect all
        # of them before the server accepts any: the default backlog of 5 resets the rest.
        httpd = server.Server(("127.0.0.1", 0), functools.partial(
            quiet(server.Handler), root=self.root, lang="en", strings=server.load_strings("en"), days=7))
        socks = [socket.create_connection(httpd.server_address, timeout=5) for _ in range(40)]
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        codes = []
        try:
            for s in socks:
                with s:
                    s.sendall(("GET /%s/a.png HTTP/1.0\r\nHost: x\r\n\r\n" % self.id).encode())
                    response = b""
                    while True:  # read to the end, so the server never writes into a closed socket
                        chunk = s.recv(65536)
                        if not chunk:
                            break
                        response += chunk
                    codes.append(response.split(b" ")[1])
        finally:
            httpd.shutdown()
            httpd.server_close()
        self.assertEqual(codes.count(b"200"), 40)


class Install(Base):
    def test_install_writes_the_unit_and_only_prints_how_to_start_it(self):
        target = os.path.join(self.tmp, "installed")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = server.main(["install", "--dir", target, "--port", "65531", "--lang", "zh-Hant", "--ttl-days", "7"])
        self.assertEqual(code, 0)
        self.assertTrue(os.path.isfile(os.path.join(target, "server.py")))
        self.assertTrue(os.path.isfile(os.path.join(target, "strings.json")))
        text = out.getvalue()
        self.assertIn("tailscale serve --bg --https=443 http://127.0.0.1:65531", text)
        expected = ["serve", "--dir", target, "--port", "65531", "--lang", "zh-Hant", "--ttl-days", "7"]
        if sys.platform == "darwin":
            plist = os.path.join(self.home, "Library", "LaunchAgents", server.LAUNCHD_LABEL + ".plist")
            with open(plist, "rb") as f:
                args = plistlib.load(f)["ProgramArguments"]
            self.assertEqual(args[1:], [os.path.join(target, "server.py")] + expected)
            self.assertIn("launchctl bootstrap", text)
        else:
            unit = read_text(os.path.join(self.home, ".config", "systemd", "user", server.SYSTEMD_UNIT))
            self.assertIn(" ".join(expected), unit)
            self.assertNotIn("WorkingDirectory", unit)  # not parsed like ExecStart, and not needed
            self.assertIn("enable-linger", text)
            self.assertIn("systemctl --user restart", text)  # a re-install must replace the running copy

    def test_systemd_arguments_stay_literal(self):
        self.assertEqual(server._systemd_arg("/a b/%h$HOME"), '"/a b/%%h$$HOME"')
        self.assertEqual(server._systemd_arg("/plain"), "/plain")


if __name__ == "__main__":
    unittest.main()
