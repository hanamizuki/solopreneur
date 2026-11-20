# sign-offs as a solopreneur skill, and configurable publish targets for preview

> **Status (2026-11-20):** Phase 1 (sign-offs) shipped in #207. Phase 2 =
> preview publish targets, not started (separate plan before work starts).

## Why

The maintainer's private `sign-offs` skill (not in this repo) publishes
temporary review pages: the agent writes one page per decision batch, the human
opens a short https link on their phone, taps a choice per item (approve /
revise / reject, or custom choices), adds notes, and copies one structured
reply back to the agent. In its first 4 days it published 49 pages (72
revisions). It is tied to one machine: pages live on a home server reached over
SSH and are served through Tailscale Serve.

Goal: ship it as `solopreneur:sign-offs` so anyone can use it, publishing to
wherever *their* setup allows, while the maintainer's own install keeps
behaving exactly as it does today (same URL, same UI text, same reply format).

## Decisions (maintainer, 2026-11-19)

1. **Two skills, not one.** `sign-offs` = temporary per-item review (choices,
   reply format, revisions, expiry, an index page). `preview` = free-form HTML
   for reading, its Library in its own folder. They are not merged.
2. **Publish location comes from the user's setup, never hard-coded.** Vercel
   and Tailscale are options, not defaults. On first use with no config, the
   agent inspects the user's environment, proposes options, and saves the
   choice; if nothing fits, it falls back to a local folder.
3. **Local fallback follows the existing doc-path convention:**
   `docs/solopreneur/sign-offs/` (like `plans.dir` defaulting to
   `docs/solopreneur/plans`), overridable in config.
4. **The maintainer's install must keep today's behaviour** (see Migration).

## Phase 1 design

### Config

A new `signoffs` block in `.solopreneur.json` (the v2 path-scoped file), with
the same resolution order preview uses: `$SOLOPRENEUR_CONFIG` → nearest
ancestor `.solopreneur.json` that contains a `signoffs` block →
`~/.config/solopreneur/config.json` → built-in defaults (local provider).
Update `src/solopreneur/shared/config.schema.json` and `config.md`.

```jsonc
"signoffs": {
  "root": "./docs/solopreneur/sign-offs", // local provider folder, relative to this file
  "lang": "en",                           // en (default) | zh-Hant
  "ttlDays": 7,
  "replyTo": "…",                         // optional; per-lang default otherwise
  "defaultTarget": "home",
  "targets": {
    "home":   { "provider": "server", "host": "me@box", "url": "https://box.tailnet.ts.net/" },
    "portal": { "provider": "static", "host": "me@web", "dir": "/srv/www/sign-offs", "url": "https://portal.example/sign-offs/" }
  }
}
```

`host` is any SSH destination, or omitted / `local` for this machine. When the
config is shared across machines, the publisher must detect that it is running
on `host` and write locally instead of SSHing to itself.

### Providers

| Provider | For | Behaviour |
|---|---|---|
| `local` (default) | no portal, no config | Writes `<root>/<id>/`. Resolve a relative root against the **main** working tree (`git rev-parse --git-common-dir`), so a page published from a worktree survives worktree cleanup. Drop a `.gitignore` (`*`) in the folder so screenshots never get committed. Regenerate `index.html` and prune expired pages on every publish. Returns a `file://` URL. |
| `static` | user already serves a folder as a website (a "portal") | Copies the page to `<dir>/<id>/` locally or over SSH; regenerates the index and prunes expired pages on every publish. URL = `url` + id. |
| `server` | user wants the full service (the maintainer's setup) | The bundled server (today's `server.py`, generalized): `Cache-Control: no-store`, 410 after expiry, hourly prune, id/revision assigned under a lock, index built per request. Fronted by Tailscale Serve or any reverse proxy. An `install` subcommand copies the server to a stable path on the host and writes a launchd (macOS) or systemd user (Linux) unit; it **prints** the `tailscale serve` command instead of running it. |

Kept for every provider: pre-publish checks (missing files, `file://`,
root-absolute paths, paths leaving the page folder, symlinks, dotfiles, 30 MB
cap, image weight warnings), per-file sha256 read-back before printing a link
(exit 3 = published but unverified, do not hand out the link), `--update <id>`
(same URL, revision +1, expiry restarts), `rm`, `--dry-run`. Python stdlib only,
3.9 syntax.

Out of scope this phase: a Vercel provider (later: one more provider, reusing
preview's share code).

### Pages: inject the review UI at publish time

The agent writes content only (`<section data-item>` blocks, optional
`data-choices`); the publisher wraps it with the header, controls, script and
styles from one source inside the plugin. Evidence: 5 of the 49 published
pages still carry the pre-fix script from an older copy of the template —
copying freezes the version. `--raw` publishes a fully custom page untouched
(it must still emit the reply protocol and read `meta.json`).

The page itself blocks review when its content id does not match `meta.json`
(stale after an update) and when `expiresAt` has passed — the only expiry
guard for `local` and `static`, which have no server to answer 410.

### Language

UI strings in a small dictionary: `en` (default) and `zh-Hant`, the latter
copied verbatim from today's template. The first reply line stays
`sign-off <id> r<revision>`; the other reply keywords follow `lang`.

### First run without config (discovery)

SKILL.md tells the agent to look before asking: the user's instruction files
(CLAUDE.md / AGENTS.md) for a portal or hosting notes; `tailscale status` and
`tailscale serve status`; local listening web ports; `vercel whoami`; an
existing `preview` block. Then offer the options it found, write the choice to
`.solopreneur.json` (project or user level, user's choice), and use `local`
when nothing fits or the user is unsure. Never change system state (services,
Tailscale) without the user's confirmation.

### Remove maintainer-specific content

Machine lists, the private SSH resolver, private workspace paths, agent-gateway
notes, the decision-card format and Discord link syntax. Those stay in the
maintainer's own instructions; the publisher prints neutral output (URL,
expiry, update command).

## What the maintainer's cutover needs from phase 1

The cutover itself happens after this ships and is tracked outside this repo.
The plugin must support it without special cases:

- A `server` target on a remote host reached over SSH, with one shared config
  read by several machines (the store host writes locally, the others SSH in).
- `install` on an existing port, so the public URL stays the same.
- `zh-Hant` strings identical to today's template, and a configurable
  `replyTo` default.
- A config block in a parent directory reaching repos that have their own
  `.solopreneur.json` without a `signoffs` block (walk-up per block).

## Phase 2: preview publish targets (plan separately)

- Add a `static` provider: copy the built Library (`<root>/library/`) to a
  portal folder, locally or over SSH. Vercel becomes one provider among others.
- Same first-run discovery as sign-offs.
- Delivery-gate wording: "online / cross-device" means the configured default
  target, not Vercel; `preflight.sh` checks the selected provider.
- Share (anyone-with-link) remains a Vercel-only capability.

## Tests and acceptance (phase 1)

- Port both existing self-tests into CI-run tests: checks, injection, protocol
  version, all three providers (static and server against temp dirs and a local
  HTTP server), expiry and pruning, the language dictionary.
- Register the skill in `skills-compatibility.json`; update README,
  `config.md`, the schema. No version bump (ship via `/release`).
- Accepted when the maintainer publishes from a second machine with the plugin version,
  opens it on a phone, and the reply matches today's format.

## Not doing (phase 1)

Vercel provider for sign-offs; a "submit" button that writes the reply back
(waits for the 2026-11-29 two-week review); UI changes beyond injection;
OpenClaw / Hermes gateway publishing.
