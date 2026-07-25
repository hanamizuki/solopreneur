# docs(preview): rewrite SKILL.md for Library v2 workflow

`plugins/solopreneur/skills/preview/SKILL.md` still documents the legacy
three-bucket / flat `docs/preview/<date>-<slug>/` + `deploy.sh` flow. Plugin
scripts already implement Library v2 (path-scoped `.solopreneur.json`,
`active/`/`archive/`, `deploy-library.mjs`, `deploy-share.mjs`). Agents that
follow SKILL.md alone will ship the wrong layout.

Rewrite the skill so the **default path is Library v2**, with legacy as an
escape hatch. Do not change scripts in this PR.

## Requirements

### Default workflow (must be what agents follow first)

1. **Preflight** — keep existing Vercel preflight guidance (still valid).
2. **Resolve config** — from content path / cwd, nearest `.solopreneur.json`
   with a `preview` block (see `scripts/config-resolve.mjs` / `shared/config.md`).
   If none: guide first-run via `scripts/setup.mjs` (one private target) — never
   invent Hana project names (`hana-previews`, `mojo-apps-preview`) in the skill
   body.
3. **Create / update content**
   - New work → `active/<id>/` with `index.html` + `preview.json`.
   - Same work continues → **same `id`**, same directory, bump `revision` by
     exactly 1 and refresh `updatedAt` / `lastUpdatedBy` when content or display
     metadata actually changes. Unchanged re-publish and Share do not bump.
   - `id`: lowercase slug `[a-z0-9-]+`, unique across included collections.
   - Update routing: explicit id / URL / Share or archive request → `sourceRef`
     → ask if ambiguous. Title similarity alone never auto-merges.
   - Duplicate guard: same id or same `sourceRef` = update candidate; fork only
     when user says so.
4. **Publish Library** — after content is ready:
   `node scripts/deploy-library.mjs --from <path-under-root>`
   Report stable URL + immutable URL from the tool output. Do not use
   `deploy.sh --bucket keep` for Library content.
5. **Share (external)** — user pastes Share request JSON from the page (or asks
   to share an id). Parse schemaVersion / kind / previewId / revision /
   contentHash / url / access. Run `deploy-share.mjs` with the request; never
   `--prod` / promote; hash mismatch must fail closed.
6. **Archive / restore** — user may paste:

```text
## library archive request
library: …
exported: …

archive（active → archive）：
- <id> — <title>
restore（archive → active）：
- <id> — <title>
```

   Agent: for each id, `mv` between `active/` and `archive/` under the resolved
   root (keep id), then **one** `deploy-library.mjs` republish. Do not delete
   unless the user explicitly asks item-by-item.
7. **Active-length hint** — when publishing and active count is **≥ 15** (or
   items look clearly stale), mention once that the user can open the sidebar
   Manage mode to multi-select archive; **never block** publish.
8. **Comments / revision diff** — keep the existing comment-overlay +
   `<del>`/`<ins>` revision workflow; note comments are per-preview-id on the
   Library origin and **not** guaranteed across deployments.

### Legacy (secondary, clearly labeled)

- `scripts/deploy.sh` arbitrary-directory contract remains for living-spec /
  slides / migration rollback.
- Three-bucket `default` / `keep` / `public` in legacy `solopreneur.json` is
  migration-window only — **not** the default for new `/preview` work when a v2
  Library config resolves.
- Do not delete legacy sections wholesale if still accurate; demote them under
  a clear "Legacy / escape hatch" heading so agents do not pick them first.

### Provenance

When writing `preview.json`, set `provenance.createdBy` / `lastUpdatedBy` with
`agent` + `platform` from the session identity; `sessionTitle` only when known.
Never invent session titles or raw session ids into deployed output (builder
redacts; still do not put secrets in HTML).

### Public plugin hygiene

- Example project names: placeholders only (`my-private-previews`).
- No hardcoded `hana-*`, `~/Agents`, or `mojo-apps` defaults in the skill.

### Out of scope

- No script / asset / test changes in this PR (SKILL.md only).
- No mvp skill (separate PR).
- No Phase 5 standalone migration guide file.

## Files to Read

- `plugins/solopreneur/skills/preview/SKILL.md` (full rewrite target)
- `plugins/solopreneur/shared/config.md` (v2 resolution, setup, deploy, share,
  archive-request if documented after pr1 — if not merged yet, use architecture
  todo for archive request format)
- `plugins/solopreneur/skills/preview/scripts/deploy-library.mjs` (CLI surface /
  flags only — skim header + usage)
- `plugins/solopreneur/skills/preview/scripts/deploy-share.mjs` (CLI surface)
- `plugins/solopreneur/skills/preview/scripts/setup.mjs` (first-run)
- `plugins/solopreneur/skills/preview/scripts/preview-schema.json` (required fields)
- Architecture todo: manage/archive request + Library rules

## Files to Create/Modify

- `plugins/solopreneur/skills/preview/SKILL.md` — only file in this PR

## Acceptance Criteria

- [ ] `git diff --name-only` for the PR contains **only**
      `plugins/solopreneur/skills/preview/SKILL.md`
- [ ] `rg -n "deploy-library|active/<id>|preview\\.json|library archive request|deploy-share" plugins/solopreneur/skills/preview/SKILL.md`
      hits the new default workflow
- [ ] `rg -n "hana-previews|mojo-apps-preview|~/Agents" plugins/solopreneur/skills/preview/SKILL.md`
      has **zero** matches (no Hana hardcoded defaults)
- [ ] First non-frontmatter heading path presents Library v2 **before** any
      three-bucket promote narrative (structural: legacy under its own section)
- [ ] Document active ≥ 15 archive hint (wording may vary; number 15 present)
- [ ] Document Share request as JSON with `kind: preview-share-request` (or
      equivalent field list matching `preview-shell.js` / deploy-share)
- [ ] Document archive request heading `## library archive request` and mv +
      single republish behavior
- [ ] Keep comment / diff-revision guidance for reviewers (still accurate)

## Notes

- SKILL.md is agent-facing English (match existing skill language).
- Prefer concise steps agents can follow over long architecture essays —
  link/point to `shared/config.md` for deep reference instead of duplicating
  the whole file.
- Frontmatter `name` / `description` should mention Library + Share if the
  description still sounds per-page-only; keep description useful for skill
  routing.
