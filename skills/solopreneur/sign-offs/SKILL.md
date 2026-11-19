---
name: sign-offs
description: Publish a temporary review page when a decision needs the reader to look at screenshots, compare designs, or rule on several items one by one. Each item gets approve / revise / reject (or custom) buttons and a note, and the page builds one structured reply the reader pastes back. Pages expire after 7 days by default. Publishes to a local folder until configured, to a folder an existing web server serves, or to the bundled server behind Tailscale Serve or any reverse proxy. Use for e2e test results, screenshot comparisons, copy or design sign-off, and batches of trade-offs. A choice that fits in plain text needs no page, and documents meant to last belong in preview.
---

# sign-offs

One page per decision batch. You write only the content; the publisher wraps it
in the shared review UI, publishes it wherever the user's setup allows, reads
every file back, and only then prints the link. The reader opens it (phone or
desktop), taps one choice per item, adds notes, and copies a single reply back
to you.

| Situation | Use |
|---|---|
| The reader must see screenshots, compare screens, or rule item by item | **this skill** |
| Two to four options that plain text explains | ask in the conversation, no page |
| A proposal, plan or document meant to last | `preview` |

## Skill directory

Start every Bash call that runs a script with these lines (shell state does not
carry over between calls):

```bash
SOLO_SKILL_DIR='${CLAUDE_SKILL_DIR}'
[ -d "$SOLO_SKILL_DIR" ] || SOLO_SKILL_DIR="<absolute path of the directory holding this SKILL.md>"
SIGNOFF="$SOLO_SKILL_DIR/scripts/signoff.py"
```

`${CLAUDE_SKILL_DIR}` is a load-time token, not an environment variable: Claude
Code replaces it before you read this, other harnesses leave it as is. It is
single-quoted so an unreplaced token stays inert; then substitute the absolute
path of this skill's directory, which your harness states. Run the scripts from
the project directory: settings are looked up from the current directory.

## First use: check the setup

```bash
python3 "$SIGNOFF" config
```

`"configPath": null` means nothing is configured: pages go to
`docs/solopreneur/sign-offs/` in the main working tree and open over `file://`,
on this machine only. That is fine when the reader sits at this computer. When
they need the page elsewhere (a phone, another machine), look before asking:

1. The user's instruction files (`CLAUDE.md`, `AGENTS.md`) for a portal, web
   server, or hosting notes.
2. `tailscale status` and `tailscale serve status` (on macOS the CLI may only be
   at `/Applications/Tailscale.app/Contents/MacOS/Tailscale`): which machine the
   phone can reach, and whether port 443 is already served there.
3. Listening web servers (`lsof -nP -iTCP -sTCP:LISTEN` on macOS,
   `ss -ltnp` on Linux) that already serve a folder over https.
4. SSH destinations the user already uses for that machine.

Offer the options you found, each with what it needs (see Providers), and
recommend `local` when nothing fits or the user is unsure. Save the choice in a
`signoffs` block of `.solopreneur.json`, merged into the file if it exists (keep
its other top-level keys and `"schemaVersion": 2`). Usually that is the user-level
file, `~/.config/solopreneur/config.json`: host names and URLs are personal and
stay out of commits. The nearest `signoffs` block is used whole — blocks never
merge — so a project's own block (`<repo>/.solopreneur.json`) replaces the
user-level one there, targets included; add one only when that project needs
settings of its own.

Never start services, change Tailscale, or open ports without the user's
explicit go-ahead. Full key reference: `../../shared/config.md` relative to this
skill inside an installed package (canonical source:
`src/solopreneur/shared/config.md`), "The `signoffs` block".

## Write the page

```bash
W="$(mktemp -d)/page" && mkdir -p "$W/shots" && echo "$W"
```

Use the printed path in later calls: `$W` is gone by the next Bash call.

`$W/index.html` holds **content only** — no `<html>`, `<head>` or `<body>`;
the publisher adds the header, buttons, reply builder and styles:

```html
<p>What this page decides and how to judge it. The reader has not seen our conversation.</p>

<section data-item="1">
  <h2>1. Reconnect prompt</h2>
  <p>What to look at, and what good looks like.</p>
  <div class="shots">
    <figure><a href="shots/1-ios.jpg"><img src="shots/1-ios.jpg" alt="iOS" loading="lazy"></a><figcaption>iOS</figcaption></figure>
  </div>
</section>

<section data-item="2" data-choices="Open a ticket|Fold into existing|Drop">
  <h2>2. Leftover bug</h2>
</section>
```

- Each item is a `<section data-item="id">`; ids are short and unique on the
  page (they lead each reply line). Default choices are approve / revise /
  reject; `data-choices="A|B|C"` sets a single-choice list of your own.
- Images live inside `$W`, referenced by relative paths and wrapped in
  `<a href>` so they open full size. Shrink screenshots first (macOS:
  `sips -Z 1600 -s format jpeg -s formatOptions 80 in.png --out "$W/shots/1-ios.jpg"`).
- `.shots` (an image grid) and plain tables are already styled; a `<style>`
  element in the content works for anything else.
- No secrets, passwords or personal data: anyone who can open the target's
  `url` can read the page, and the `static` and `server` index lists every page
  that has not expired.
- A page with its own complete UI can go out with `--raw`, untouched. Its reply must still
  start with `sign-off <id> r<revision>`, read from `meta.json` over http(s) or
  from `window.SIGNOFF_META` (loaded by `<script src="meta.js">`) under `file://`.

## Publish

```bash
python3 "$SIGNOFF" publish "$W" --slug e2e-sync --title "Cloud Sync e2e, round 2" --dry-run
python3 "$SIGNOFF" publish "$W" --slug e2e-sync --title "Cloud Sync e2e, round 2"
```

The dry run only checks: missing files, `file://` and root-absolute links,
links leaving the folder, symlinks, dot files, the 30 MB cap, heavy images,
duplicate item ids, `data-item` outside a `<section>`, and the title length (120
characters). The slug is lowercase letters, digits and hyphens, at most
12 characters; the page id adds a random suffix (`e2e-sync-k3f`).

| Exit | Meaning |
|---|---|
| 0 | Published and read back: hand out the printed link |
| 2 | A check or the publish failed: fix what the `→` line says |
| 3 | Published, but the read-back did not match: **do not hand out the link**; publish again |

Write the link out in full (not as a Markdown link), and say in the message
itself what the reader is deciding: the page holds the detail, not the question.
`--reply-to "…"` overrides where the page tells the reader to paste the reply
(default: `signoffs.replyTo`).

## Read the reply

```
sign-off e2e-sync-k3f r2
1 Approve
2 Revise — rename the button to "Reconnect"
A2 Fold into existing
4 no choice — only left a note
Pending: 4, 5
Overall: …
```

- Line 1: page id and revision. When it is not the latest revision, tell the
  reader they reviewed an older version and send the current link.
- One line per decided item: id, choice, then ` — note` when there is one. An
  item with only a note says `no choice`.
- `Pending:` lists undecided ids; everything after `Overall:` is the overall
  comment and may span lines.
- With `"lang": "zh-Hant"` the keywords are `未選`, `未批：` and `整體：`, and ids
  are joined with `、`. The reader may also just answer in their own words.

## Update or remove

```bash
python3 "$SIGNOFF" publish "$W" --update e2e-sync-k3f   # same URL, revision +1, expiry restarts
python3 "$SIGNOFF" rm e2e-sync-k3f                      # take a page down at once
```

Edit the same folder and publish with `--update`; tell the reader "updated to
revision N". The reply's first line shows which revision they saw.

## Providers

| Provider | For | Needs |
|---|---|---|
| `local` (default) | the reader is at this computer | nothing |
| `static` | the user already serves a folder as a website | a folder used only for sign-offs, served at `url` (https, so the copy button works) where only the readers can reach it (a tailnet, or behind a login); for a remote `host`, SSH and `python3` 3.9+ there |
| `server` | the user wants a dedicated service, e.g. behind Tailscale Serve | the bundled server installed on `host`, reachable only by the readers (Tailscale Serve, or a proxy with a login) |

```jsonc
// ~/.config/solopreneur/config.json
{
  "schemaVersion": 2,
  "signoffs": {
    "lang": "en",
    "defaultTarget": "home",
    "targets": {
      "home":   { "provider": "server", "host": "me@box", "url": "https://box.example.ts.net/" },
      "portal": { "provider": "static", "host": "me@web", "dir": "/srv/www/sign-offs", "url": "https://portal.example/sign-offs/" }
    }
  }
}
```

**Remote hosts.** For a `host` other than this machine, every publish connects
with `ssh -o BatchMode=yes` and runs the store code it brings along under the
host's `python3`, so publishing never waits for an update on the host. A config
shared by several machines can name the store host itself: there the publisher
recognizes its own name or address and writes locally.

**Installing the server.** On the machine that will serve the pages, after the
user agrees:

```bash
python3 "$SOLO_SKILL_DIR/scripts/server.py" install --port 8791 --lang en --ttl-days 7
```

- It copies `server.py` and `strings.json` to `~/.local/share/solopreneur/sign-offs/`
  (`--dir` to change; then set the target's `dir` to match) and writes a
  launchd agent (macOS) or a systemd user unit (Linux). Pass the same `lang`
  and `ttlDays` as the config: they set the language and wording of the index
  and expired pages.
- It **prints** the commands that start the service and the
  `tailscale serve --bg --https=443 http://127.0.0.1:<port>` line instead of
  running them. Show them to the user and run them only with their go-ahead;
  if the port is taken, whatever holds it has to stop first.
- The server binds to 127.0.0.1 only; https comes from Tailscale Serve or any
  reverse proxy (a sub-path works too). On Linux, `loginctl enable-linger "$USER"`
  keeps it running after logout; a macOS launch agent runs while the user is
  logged in to the desktop.
- On a host without this plugin, copy `scripts/server.py` and
  `assets/strings.json` there and run `python3 server.py install …` beside them.
  Re-run install after a plugin update to update the running server.

## Errors

| Message | What to do |
|---|---|
| `the page did not pass its checks` | Fix each listed file |
| `index.html is a whole HTML document` | Keep only the content, or publish with `--raw` |
| `cannot reach <host> over SSH` | This machine cannot publish there: fix SSH (key, known host) or publish from one that can |
| `unreadable answer from <host>` | The host needs `python3` 3.9+ on the PATH of a non-interactive SSH session |
| `… was not written by sign-offs` | `dir` points at a real site: give sign-offs a folder of its own |
| `cannot read back …` / `read-back mismatch` (exit 3) | Do not hand out the link. Check that the service runs and `url` reaches it (or that the web server serves `dir`), then publish again |
| `<id> has expired` | Publish a new page with `--slug` |

## Limits

- A page stops accepting review at its expiry on every provider. The server
  answers 410 and deletes it within the hour; `local` and `static` delete
  expired pages on the next publish. To keep a page, move it into `preview`.
- Choices are saved in the reader's browser; another browser starts empty.
- The copy button needs https (or `file://` on this machine); over plain http
  the reader copies the selected text by hand.
- `local` links open only on this machine. macOS and Linux only.
