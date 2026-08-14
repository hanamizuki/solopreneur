# Preview Local Library

**Status:** Design approved and implemented 2026-08-14; A1, A2, A4 passed.
A3 (Codex exec) and A5 (Codex App) re-runs are deliberately deferred — the
user scoped this round's Codex evidence to the TUI, the surface they
actually drive.

**Date:** 2026-08-14

**Supersedes:** the *Local contract* and two-mode delivery gate of
[Preview local-first delivery](./2026-08-12-preview-local-first.md). That
spec's single-file contract is retained here unchanged as the **ephemeral**
mode; its Codex fail-closed rule and its resolved-before-side-effects gate
carry over to the three-mode gate below. Its A1–A5 evidence remains valid
for the behaviors it recorded.

## Outcome

Preview delivers into a browsable local Library by default. A preview lands
in the existing content root (`active/<id>/`), and a local build produces
`<root>/library/` — a tree that opens directly under `file://` with the same
catalog sidebar, comment overlay, and provenance footer as the deployed
Library. Vercel stops being the default and becomes a publish action over
the same content root: one content tree, two renderings.

The single self-contained HTML dropped on the Desktop remains available as
the **ephemeral** mode for explicitly temporary work.

## Decisions (adjudicated 2026-08-14)

| Question | Decision |
| --- | --- |
| Content root | Reuse the existing `.solopreneur.json` path-scoped resolution; the local build lands at `<root>/library/`. No new config key. |
| Existing entries | Included automatically — the local build runs the same scan over the same resolved collections and include set as the remote target. |
| Build output in git | `<root>/library/` is gitignored; each machine rebuilds its own. Canonical content (`active|archive/<id>/` + `preview.json`) stays committed as before. |
| Default routing | No explicit signal → Library. Ephemeral only on an explicit temporary intent or a user-specified output path. |
| Ephemeral landing spot | Desktop, unchanged from the prior local contract. A user-specified path always wins. |
| Local comments | Browser `localStorage`, per-machine and per-browser, no sync backend. Keys are already namespaced per preview id by the builder-injected script attribute. |

## Delivery mode contract

Delivery mode is resolved before content files, Preview config, Vercel
preflight, setup, or network access. The side-effect-free resolver returns
one of three modes:

| User intent | Mode |
| --- | --- |
| Explicit Vercel / online deployment / cross-device access / external sharing | `vercel` |
| Explicit temporary intent ("quick look", "throwaway", "just drop it on my Desktop") or a user-specified output path | `ephemeral` |
| Any other request, including "give me a link" | `library` (default) |

Misrouting costs are asymmetric: a real deliverable routed to ephemeral is
lost after the look; a throwaway routed to the Library is one extra catalog
row that cleanup removes. Ambiguity therefore resolves to `library`.

On any host carrying `CODEX_THREAD_ID`, `vercel` mode still fails closed
before side effects, with the same limitation message and no local
fallback. `library` and `ephemeral` are pure local file operations and are
supported on every surface.

## Library mode contract

**Item creation is identical to the remote workflow.** New work goes to
`active/<id>/` with `index.html` + `preview.json`; the id, revision,
update-routing, and duplicate-guard rules of the existing Library v2
contract apply unchanged. Content root, collections, and include set come
from the existing config resolution — the same resolved values the Vercel
target uses.

**The local build is the same builder in a local mode.** It runs the same
scan, validation, metadata projection, and chrome injection as the deploy
staging build, with these differences:

- The staging tree is assembled off to the side and only then replaces
  `<root>/library/`. Every failure mode that can produce a partial tree —
  scan, validation, copy, injection — happens before the replacement, so a
  failed build leaves the previous `library/` untouched and no reader ever
  sees a half-written one. The replacement itself is two renames — the
  previous tree is moved aside to `library.bak`, the new one is renamed onto
  `library`, and only then is the backup deleted — so a reader sees either
  the old tree or the new one, never a partially deleted one, and a failed
  rename restores the previous tree. It is still not transactional: a
  process killed between the two renames leaves `library` absent with the
  previous tree at `library.bak`. That is the accepted ceiling — `library/`
  is derived, gitignored, and rebuilt by one command, while the canonical
  items it renders are never touched. This replacement is the only write the
  build makes inside the content tree.
- All injected references are relative. Item pages reference the staged
  shared assets and the catalog data relative to their own location, and
  every catalog link targets an explicit `index.html` — `file://` has no
  default-document behavior and no root-relative paths.
- The catalog is loaded without any runtime fetch. The build emits the
  directory as a classic-script asset that sets a global the shell reads;
  `fetch` of `directory.json` remains the deployed-origin path. Browsers
  block `fetch`/XHR under `file://` but load classic script subresources.
- The build ensures the content root's committed `.gitignore` covers the
  build output and its two swap siblings (`library/`, `library.tmp/`,
  `library.bak/`), idempotently. Without those rules the untracked build
  output would make the root dirty and trip the deploy fetch-guard.

**The rendered pages keep the full Library UX.** Sidebar catalog with
active/archive grouping, Manage-mode instruction export, provenance footer,
comment overlay with markdown export, and diff/clean toggle all function
under `file://`. Comments and sidebar state persist to `localStorage`; under
`file://` all pages share one origin, which is safe because comment and
diff-toggle keys are already namespaced per preview id. Storage-write
failures surface visibly with the existing export escape hatch.

**Handoff.** After creating or updating an item, the workflow rebuilds the
local library and returns a clickable absolute `file://` Markdown link to
the item's built page (with the library home available one level up). The
browser is opened only on an explicit user request.

**No resolvable config.** When config resolution finds no v2 config
(`none` or `legacy`), library mode is unavailable; the workflow falls back
to ephemeral delivery and says so in one line. Creating a new content root
remains an explicit setup action; the v1 config schema still requires a
Vercel target, so a purely local root is out of scope for this iteration.

## Ephemeral mode contract

The prior spec's local contract, renamed, and narrowed to explicit
temporary intent or a user-specified path:

- One self-contained HTML file; inline CSS/JS, inline SVG or data-URI
  images; renders under `file://` with no server, CDN, module, runtime
  fetch, or relative asset.
- Desktop default with the safe-slug rule; atomic collision-free
  reservation before writing; explicitly approved replacements bypass
  reservation.
- No `preview.json`, no config read or write, no Library resolution, no
  build, no network. It does not appear in any catalog.
- No comment overlay or shell chrome. Returns an absolute-path Markdown
  link; opens a browser only on explicit request.

Promotion is not a feature: moving an ephemeral file into `active/<id>/`
with a `preview.json` and rebuilding is an ordinary file operation an agent
performs on request.

## Vercel mode contract

Unchanged. Explicit remote intent enters the existing Library v2 publish
path (preflight first, then staged deploy) or Share for external one-offs.
Publishing renders the same content root that the local library renders;
neither rendering mutates the other. The legacy escape hatch is unchanged.

## Support and limitations

| Surface | Status | Supported subset | Limitation |
| --- | --- | --- | --- |
| Claude Code | Full | Library, ephemeral, Vercel publish, Share | Vercel keeps its existing CLI, auth, and config gates |
| Codex exec / TUI / App | Degraded | Library and ephemeral | Explicit Vercel fails closed before side effects; opening results stays an explicit user action |

All surfaces require Node 20+ and write access to the content root (library
mode) or the chosen output path (ephemeral mode). Library mode additionally
requires a resolvable v2 config.

## Acceptance

Same evidence standard as the prior spec: claimed support must be proven on
the loaded contract, with hashes and unchanged-sentinel checks, not
inherited from plugin loadability.

### A1 Contract and regression suite

Accepted on 2026-08-14. The complete Preview Node suite passed 488 of 490
tests with two host-filesystem skips and no failures, including the new
coverage: three-mode resolver (default `library`, explicit `ephemeral`,
Codex `vercel` fail-closed, flag exclusivity); relative chrome and
catalog-global ordering on built entry pages; `assets/directory.js`
equivalence with `directory.json` under script-context escaping; gitignore
guard idempotence over existing content; swap-not-merge rebuilds; a failed
rebuild leaving the previous `library/` and no `library.tmp` behind;
identical entry pages and catalog rows across repeat builds; shell boot
consuming `window.__previewDirectory` with zero `fetch` calls; and the
sidebar href contract (`../<id>/index.html` under `file:`, `/p/<id>/`
otherwise). The compatibility validator passed (103 skills, Codex
included=8), the registry pytest suite passed 48 of 48, the
codex-filtered-publication fixture passed, and every
`validate-plugin-packages.sh` gate passed.

Generation was deterministic and left no drift: the canonical Preview tree,
the generated Claude tree, and the generated Codex tree compare
byte-for-byte. All three `SKILL.md` copies have SHA-256
`f0c10f014b91e15f95cbf8d6f401d3f1b4b03bef84f92e2dc85d6c88e6db0119`, the
resolver copies
`de6b62df6abc262a1fc82d82e0add78be03ab666a06b7b1db1938d281cc646ac`, and the
builder copies
`d20c4e5f65428f9c220507b449ec400c57e1f49b2ecf8ceb9f41670f5801762e`. The
Codex package now carries `shared/config.schema.json` byte-identical to the
canonical source
(`b50d5889b0364e144aedafb406b5e474a5424adff54d70d11d0322cb76de8d7e`), and a
live run of the generated Codex tree resolved a fixture config, built a
local library with relative chrome and the catalog global, and appended the
ignore rules; the generated resolver printed `library` / `ephemeral` and
failed `--vercel` closed (exit 2) under `CODEX_THREAD_ID`.

### A2 Claude Code

Accepted on 2026-08-14, on the real fleet content root rather than a
fixture. The canonical builder ran `--local` against the production root
(51 items across active and archive, 5.43 MB, no validation failure) on
two machines independently — Crystal, and Feathers via a worktree of this
branch — each producing its own `<root>/library/`. On Feathers the user
opened the built tree in a real browser over `file://` and verified the
sidebar catalog (active/archive grouping, cross-item navigation,
current-item marking) and comment persistence across a reload
(per-id `localStorage`). After the build, `git status` over the content
root is clean: the appended ignore rules are committed and the generated
`library/` is untracked-ignored.

Scope note: this run verified the built tree and the `file://` UX on real
data; a skill-driven end-to-end pass (new item authored under
`active/<id>/`, then built and linked in one /preview invocation) was not
separately staged — its constituent steps are covered by A1 and by the
item corpus above, and the first production /preview use will exercise it.

### A4 Codex TUI

Accepted on 2026-08-14 with Codex CLI 0.147.0 through real PTY-backed
interactive TUI sessions (private tmux socket), against an isolated `HOME`,
`CODEX_HOME`, and project, installed through the local marketplace consumer
path. The installed Preview tree compares byte-for-byte with the canonical
one; its `SKILL.md`, resolver, and builder carry the A1 hashes, and the
package ships `shared/config.schema.json`
(`b50d5889b0364e144aedafb406b5e474a5424adff54d70d11d0322cb76de8d7e`).

Library thread `019fffb4-5c07-7ad0-8c2e-1f66df93f72b` received a prompt
naming no delivery mode. It read the cached skill, ran the resolver first —
which printed `library` — resolved the fixture config, created
`active/2026-08-14-a4-tui-check/` with `index.html`
(`7c8cc431ec5c1120d5c0bf6a9a2328c594e29331ae31478b945bd4fc85059d77`) and a
`preview.json`, then ran `build-library.mjs --local --json`. The built entry
page (`fd65bbf2fcbd3e7c4b8f42e1e147eecbfc6294e651d015f15bb44edd4faedaf1`)
carries only relative chrome (`../../assets/directory.js`,
`../../assets/preview-shell.js`), and the final answer was the absolute
`file://` link into the built library. The pre-existing seed item, the
config, and a sentinel file retained their baseline hashes, and no browser
was opened.

Explicit-Vercel thread `019fffb6-d0ff-7663-8562-6dc39bff44a2` made exactly
two tool calls: reading the skill and running the resolver with `--vercel`.
It returned the Phase 1 limitation without a local fallback. The sentinel
and config kept their hashes, the library tree kept its exact file count,
and no `.vercel` directory, preflight, network, or deployment action
occurred.

### A3 Codex exec / A5 Codex App (deferred)

Not re-run for this contract. Both surfaces load the same generated package
and the same resolver that A1 and A4 exercised, but that is inference, not
evidence — support for them rests on the prior spec's A3/A5 runs against
the superseded single-file contract. Re-run in the prior spec's format
before claiming either surface for the library contract.

## Migration notes

- One commit per content root adds `library/` to the committed
  `.gitignore` (fleet root and the mojo root).
- Existing `active/` and `archive/` entries appear in the first local build
  automatically; no migration step.
- After landing, the fleet-level preview conventions documentation must be
  rewritten: local library is the default delivery, Vercel is opt-in
  publish, tinyurl shortening applies only to Vercel URLs.

## References

- [Preview local-first delivery](./2026-08-12-preview-local-first.md)
- [Codex skill portability](./2026-08-09-codex-skill-portability.md)
