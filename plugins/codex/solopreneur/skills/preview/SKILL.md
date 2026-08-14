---
name: preview
description: Create a self-contained local HTML preview of any proposal, plan, idea, doc, brief, or spec; only use the private Vercel Preview Library or an isolated Share deployment when the user explicitly asks for Vercel, online deployment, cross-device access, or external sharing. Use WHENEVER the user wants something visualized, made into a webpage, made interactive, shared for human review, or asks for charts / diagrams / calculators they can click through. ALWAYS use this skill for - make a preview / give me a preview / turn this into a webpage / visualize this / make it interactive / do a review / share for review / make a calculator page / make me a chart / make me a diagram / render this as HTML / make this reviewable / build a quick page / interactive proposal. Preferred over a markdown wall of text for human review.
---

# preview

## Delivery mode gate

This is the first action. Decide the delivery mode **before** reading Preview
Library config, running Vercel preflight/setup, creating files, using the
network, or making any other state change:

- Choose `vercel` only when the user explicitly asks for **Vercel**, an
  **online deployment**, **cross-device access**, or **external sharing**.
- Choose `local` for everything else. `local` is the default; a request such as
  "give me a link" still means a clickable local-file link.

Run the side-effect-free resolver from this skill directory with no argument
for `local`, or with `--vercel` only for the explicit remote intent above:

```bash
node scripts/resolve-delivery.mjs [--vercel]
```

Follow only the workflow it prints. On a Codex host (`CODEX_THREAD_ID` set),
`--vercel` fails closed before any network or state change. Stop immediately,
repeat the resolver's Codex Phase 1 local-only limitation, and do not substitute
a local artifact for the explicitly requested deployment. Claude Code may
continue through the existing Vercel workflow.

Turn any proposal / plan / idea into interactive HTML and hand the user a link
they can open. Local delivery is one standalone file. Explicit remote delivery
publishes the existing private Library; an external one-off link uses Share
(same Vercel project, Preview environment only — never promotes Library
production).

## Outcome the user is looking for

A link they can open and try. Not a markdown wall and not a screenshot. Local
delivery returns an absolute-path Markdown link. Explicit Vercel delivery
returns the existing Library or Share URL.

## Local workflow

This workflow is available on Claude Code and Codex and is the default.

1. **Choose one output file.** A user-specified path wins. For temporary work
   with no path, use `~/Desktop/<safe-slug>.html`, where the slug is lowercase
   ASCII `[a-z0-9-]`, repeated hyphens are collapsed, and an empty result falls
   back to `preview`. For other no-path work, prefer an existing directory
   clearly tied to the source; if none is evidenced, use the same Desktop
   fallback. Resolve the final path to an absolute path.
2. **Refuse silent overwrite.** Unless the user explicitly asked to update or
   replace that exact file, atomically reserve the target after the delivery
   mode is decided:

   ```bash
   node scripts/reserve-local-output.mjs "$ABSOLUTE_TARGET"
   ```

   Use only the absolute path it prints. An existing target is preserved and
   receives a collision-free sibling such as `<safe-slug>-2.html`.
3. **Write exactly one self-contained HTML file.** Write into the reserved file
   (or the explicitly approved replacement). Put all CSS in `<style>` and
   all necessary JavaScript in inline `<script>` blocks. Use inline SVG or data
   URIs for required images. The file must render directly under `file://`
   without a server, build step, external stylesheet/script/module, CDN,
   runtime fetch, or relative asset. Omit JavaScript when HTML/CSS is enough.
   `assets/template.html` is a Library-oriented visual reference only: its CDN
   and `comment-overlay.js` references must not appear in a local artifact.
4. **Keep local delivery isolated.** Do not create `preview.json`, read or write
   `.solopreneur.json` / `solopreneur.json`, run `config-resolve.mjs`,
   `setup.mjs`, `preflight.sh`, or any deploy script, create `.vercel`, or make
   Vercel/network calls. The output HTML is the only delivery artifact.
5. **Verify and hand off.** Confirm the file exists, contains its required
   inline CSS/JS, and has no runtime asset dependency. Return a clickable
   absolute-path Markdown link such as `[Open preview](/absolute/path/file.html)`.
   Run `open` only when the user explicitly asks to open it.

Self-assess content ambiguity before writing: ask which deliverable only for
two or more separable topics, a bare "preview" after a wide discussion, or
multiple plausible artifacts. Otherwise state what you are previewing in one
line and proceed.

## Vercel workflow (Claude Code)

Deep reference (schema, setup, deploy internals): `../../shared/config.md`, relative to this skill inside an installed package (canonical source: `src/solopreneur/shared/config.md`).
relative to this skill (repo path `plugins/solopreneur/shared/config.md`).

This is the existing Library v2 path. Enter it only after the delivery resolver
prints `vercel`. Legacy three-bucket / `deploy.sh` is an escape hatch only (see
below).

### 1. Preflight FIRST

**Always run `bash scripts/preflight.sh` before drafting HTML.** It checks Vercel CLI + auth.

- **Pass:** one short line (`vercel CLI ready, proceeding…`) and continue.
- **Fail:** do not dump stderr and stop. Ask whether to set up Vercel now (`npm i -g vercel` / `vercel login`), view HTML locally only, or cancel. Re-run preflight until pass or the user chooses local-only / cancel.

### 2. Resolve Library config

Config is **path-scoped**, not git-remote-scoped. From the content path (or cwd when creating new work), walk up for the nearest **`.solopreneur.json`** that contains a `preview` block. Full resolution order and rules: `config-resolve.mjs` / `shared/config.md`.

```bash
# Inspect what the tools will use (anchor at the content path or cwd)
node scripts/config-resolve.mjs --from "$CONTENT_OR_CWD"   # see script --help for flags
```

- Relative `root` is resolved against the **config file's directory**, not git root.
- Nested `.solopreneur.json` fully replaces a parent `preview` block (no deep merge).
- **Never hardcode** project names like personal fleet projects in this skill. Examples use placeholders only (`my-private-previews`).

**No v2 config found:** run first-run setup — **do not invent projects**.

```bash
node scripts/setup.mjs
# optional: --project my-private-previews --team <teamId>
```

Setup proposes **one private target**, creates dirs only after confirm, and fail-closes if protection cannot be verified. It never auto-creates three Hana buckets.

Legacy `solopreneur.json` cascade (flat paths / buckets) still works for migration; prefer migrating with `config-migrate.mjs` when the user is ready. Do not silently rewrite their legacy file.

### 3. Decide content + create / update item

**Self-assess ambiguity** before writing (same as before): only ask which deliverable if ≥2 separable topics, bare "preview" after a wide discussion, or multiple candidate artifacts. Otherwise one-line what you are previewing and proceed.

#### Layout (v2)

```text
<root>/                    # preview.root from resolved config
├── active/<id>/
│   ├── index.html
│   ├── preview.json
│   └── …assets (relative only)
└── archive/<id>/
    └── …
```

- **New work** → `active/<id>/` with `index.html` + `preview.json`.
- **Same work continues** → **same `id`**, same directory. When content or display metadata actually changes: `revision` += 1, refresh `updatedAt` and `provenance.lastUpdatedBy`. Unchanged re-publish and Share do **not** bump revision.
- `id`: lowercase slug `[a-z0-9-]+`, unique across all included collections.
- Collection is the **directory** (`active` vs `archive`); do not duplicate status in metadata.

#### Update routing / duplicate guard

Prefer, in order: preview id from URL / Share or archive request → caller-given id → `sourceRef` in metadata. Title similarity alone never auto-merges. Same id or same `sourceRef` → treat as update candidate. Fork only when the user says so.

#### `preview.json` (required fields)

Write a sidecar in the Library source tree only — **never deploy raw `preview.json`**; the builder projects an allowlist into `directory.json`:

```json
{
  "schemaVersion": 1,
  "id": "2026-07-25-short-slug",
  "title": "Human title",
  "createdAt": "2026-07-25T10:00:00+08:00",
  "updatedAt": "2026-07-25T12:00:00+08:00",
  "revision": 1,
  "entry": "index.html",
  "provenance": {
    "createdBy": { "agent": "Builder Claude", "platform": "claude", "sessionTitle": "optional" },
    "lastUpdatedBy": { "agent": "Builder Claude", "platform": "claude", "sessionTitle": "optional" }
  }
}
```

- Required: `id`, `title`, `createdAt`, `updatedAt`, `revision`, and provenance parties' `agent` + `platform`.
- `sessionTitle` only when known — **never invent**.
- Optional: `project` (label only), `sourceRef` (workspace-relative stable ref, not absolute paths), `tags`.
- `entry` v1 must be `index.html`.
- Schema: `scripts/preview-schema.json`.

### 4. Write HTML

Start from `assets/template.html` (placeholders `{{TITLE}}` / `{{DATE}}` / `{{LEAD_PARAGRAPH}}` / `{{AUTHOR_OR_CONTEXT}}`).

**Library build injects** shared `comment-overlay.js` and `preview-shell.js` at publish time. You may still reference `./comment-overlay.js` in the template for local `file://` review; the builder rewrites to the shared asset. Prefer not treating per-item overlay copies as the durable happy path.

**Contract (v1 static):** single `index.html`, relative assets only. No root-relative `/assets/...`, no SPA history fallback, no entry outside the item dir. Read `references/libs.md` before Alpine / Chart.js / Mermaid.

**Form follows content** (calculator, doc, charts, etc.) — same guidance as before.

**Full-bleed slides:** wrap in `<main class="doc">`, set `body.cmt-full-bleed` when needed (see template comments).

### 5. Publish the Library

After content is ready (and preferably committed when the content root is git-backed):

```bash
node scripts/deploy-library.mjs --from "$PATH_UNDER_ROOT"
# machine-readable:
node scripts/deploy-library.mjs --json --from "$PATH_UNDER_ROOT"
```

- Full snapshot of included collections → stable protected entry.
- Report **stable URL** + **immutable URL** + resolved project from the tool output.
- **Do not** use `deploy.sh --bucket keep` for Library content (pollutes Library production history).
- Empty library publish is refused (would wipe the catalog).
- Private targets fail closed on protection (anonymous entry must not be 200).

**Active-length hint:** if Active has **≥ 15** items (or many look clearly stale), mention once that the user can open the sidebar **Manage mode**, multi-select, and copy archive instructions — **never block** publish.

### 6. Share (external, optional)

The page **Share…** control only builds a copyable JSON request (no token, no deploy). Example:

```json
{
  "schemaVersion": 1,
  "kind": "preview-share-request",
  "previewId": "<id>",
  "revision": 4,
  "contentHash": "sha256:<hash>",
  "url": "<current library item URL>",
  "access": "project-members"
}
```

`access`: `project-members` (default) or `anyone-with-link`.

When the user pastes a request (or asks to share an id):

```bash
# request on stdin, or --request <file>
node scripts/deploy-share.mjs --from "$PATH_UNDER_ROOT" --request - <<'EOF'
{ ...share request JSON... }
EOF
```

- Validates id / revision / contentHash against the Library item — **mismatch fail-closed** (no silent wrong version).
- Same Vercel project; **never** `--prod` / promote; Library production unchanged.
- Artifact is root `/` for that item only (no catalog / other `/p/` / raw `preview.json`).
- List / revoke: `deploy-share.mjs --list` / `--revoke` (see script usage; shareable-link secret may be required to revoke).

### 7. Archive / restore (from Manage mode)

Sidebar **Manage mode** copies a structured block (agent contract):

```text
## library archive request
library: <label>
exported: <ISO timestamp>

archive（active → archive）：
- <id> — <title>
restore（archive → active）：
- <id> — <title>

（給 agent：對每個 id 做 mv <root>/<from>/<id> <root>/<to>/<id>，全部完成後重新發布 library。）
```

When the user pastes this:

1. For each archive id: `mv <root>/active/<id> <root>/archive/<id>` (keep id).
2. For each restore id: reverse.
3. **One** `deploy-library.mjs` republish after all moves.
4. Do **not** delete unless the user confirms item-by-item (delete is out of the Manage UI).

### 8. Feedback loop (comments + visible diffs)

Keep the existing comment + revision workflow:

1. User highlights, comments, exports markdown (`## comments on: …`).
2. On each revision round: flatten prior `<del>` / `<ins>`, apply new changes as visible diff, refresh a top `revision-log` callout, republish Library (same id, revision +1 when content changed).
3. Comments are per-preview-id on the Library origin (`preview_comments_v3:<id>`). **Not** guaranteed across deployments or Share origins — export if they matter.

See "The comment overlay" below for UX detail.

---

## Legacy / escape hatch

Use only when there is **no** v2 Library config, or for living-spec / slides / explicit migration rollback.

### `deploy.sh` (arbitrary directory)

```bash
scripts/deploy.sh <path-to-dir>
# optional: PREVIEW_PROJECT=... or --bucket default|keep|public
```

Prints one URL to stdout. Buckets (`default` / `keep` / `public`) live in legacy `solopreneur.json`. **Not** the default for new `/preview` work when a Library config resolves.

- **default (scratch)** — disposable URLs.
- **keep** — long-lived per-page project; do not use against a Library production project.
- **public** — external readers; re-read for secrets before deploy; skips SSO.

Path probing + `solopreneur.json` helpers for legacy flat `docs/preview/<date>-<slug>/` dirs remain valid for this escape hatch only. Prefer `active/<id>/` whenever v2 applies.

---

## The Library comment overlay (what the user sees)

Margin-style annotations (Google Docs / Medium-like):

- Highlight → `+ comment` → note → yellow marker + gutter card; stored in `localStorage` for the review session.
- Desktop: margin cards; Mobile: bottom sheet + list FAB.
- `export comments` → markdown with quotes + context.
- On pages with `<del>` / `<ins>`: `Clean` / `Show edits` toggle (defaults to showing edits).
- Detached comments (anchor text gone) still listed, not silently dropped.
- Write failures (quota / blocked storage) must surface visibly with export escape hatch.

Agent revision rules:

1. Flatten previous round (`delete` old `<del>`, unwrap old `<ins>`).
2. Apply this round as `<del>` / `<ins>` only — never silent replace.
3. Rewrite the top `revision-log` callout for this round only.
4. Redeploy via Library publish (or legacy deploy only if still on escape hatch).

---

## What not to do

- **Don't** enter the Vercel workflow without explicit Vercel / online /
  cross-device / external-share intent; "give me a link" remains local.
- **Don't** read Library config, run preflight/setup/deploy, create
  `preview.json`, or use the network in local mode.
- **Don't** put CDN or relative runtime dependencies in a local artifact.
- **Don't** silently overwrite a local HTML file or run `open` without an
  explicit request.
- **Don't** teach three-bucket promote as the default when v2 config exists.
- **Don't** invent Hana project names or absolute machine paths in config examples.
- **Don't** bump revision on no-op republish or Share-only deploys.
- **Don't** share a hash-mismatched revision (fail closed).
- **Don't** delete Library items from the Manage UI path without explicit per-item confirm.
- **Don't** write multi-file React apps for this skill — single `index.html` + assets.
- **Don't** let diff markup accumulate across rounds.
- **Don't** put secrets in preview HTML or comments (Library is SSO-walled but not a vault).

---

## Files in this skill

| Path | Role |
|------|------|
| `scripts/resolve-delivery.mjs` | Side-effect-free local / Vercel gate |
| `scripts/reserve-local-output.mjs` | Atomic no-overwrite local path reservation |
| `scripts/preflight.sh` | Vercel CLI + auth |
| `scripts/config-resolve.mjs` | Path-scoped v2 + legacy resolve |
| `scripts/config-migrate.mjs` | Legacy → v2 proposal + write |
| `scripts/setup.mjs` | First-run private target |
| `scripts/build-library.mjs` | Scan collections → staging |
| `scripts/deploy-library.mjs` | Staged Library publish |
| `scripts/deploy-share.mjs` | Single-item Share Preview |
| `scripts/deploy.sh` | Legacy arbitrary-dir deploy |
| `scripts/preview-schema.json` | `preview.json` schema |
| `scripts/resolve-provenance.mjs` | Provenance display shape |
| `assets/template.html` | HTML starter |
| `assets/comment-overlay.js` | Comments + diff toggle |
| `assets/preview-shell.js` | Sidebar, Manage, Share, footer |
| `assets/library-index.html` | Library home template |
| `references/libs.md` | Alpine / Chart.js / Mermaid recipes |
