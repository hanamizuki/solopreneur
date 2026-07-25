# feat(preview): library sidebar manage mode + supersededBy groups

Close the Phase 2 gap left after Library chrome shipped: the sidebar can list
Active/Archive and build Share requests, but has no **manage mode** for
batch archive/restore instructions, and does not group `supersededBy` archive
rows under their canonical item.

Source architecture (normative):
`/Users/Hana/Agents/tasks/doing/2026-07-23_preview-library-architecture.md`
— Sidebar 行為 (manage block + archive request text) and revision identity
(`supersededBy` / 舊副本 group).

## Requirements

### 1. Manage section (sidebar only)

At the bottom of the Shadow DOM sidebar body (below Active + Archive sections):

1. A short **one-line** explanation (English UI, consistent with existing chrome):
   Active = in progress · Archive = kept for reference · archiving does not change the URL.
2. A **Manage mode** toggle (button or switch). When **off** (default): rows
   look as they do today (plain links). When **on**:
   - Each Active row shows a checkbox (checked = request **archive**).
   - Each Archive row shows a checkbox (checked = request **restore** to active).
   - Rows that are earlier copies under a supersededBy group still get checkboxes
     (they are real archive items).
3. A **Copy instructions** button (enabled only when ≥1 checkbox is checked).
   Clicking it copies a structured text block (same copy pattern as Share /
   comment export — `navigator.clipboard` with `execCommand("copy")` fallback
   already used by `copyText` in this file).
4. The page remains **read-only**: no filesystem, no Vercel API, no delete UI.
   Destructive delete stays conversation-layer only.

### 2. Archive request text contract (exact shape)

Pure helper(s) must build this format (agents parse it; do not invent a new schema):

```text
## library archive request
library: <libraryLabel>
exported: <ISO-8601 timestamp>

archive（active → archive）：
- <id> — <title>
restore（archive → active）：
- <id> — <title>

（給 agent：對每個 id 做 mv <root>/<from>/<id> <root>/<to>/<id>，全部完成後重新發布 library。）
```

Rules:

- `libraryLabel`: prefer a stable label from shell data if present (e.g. config
  path or content root if the builder already injects one); otherwise use the
  deployment origin host or the literal `library` — document the choice in a
  short code comment. Do **not** invent absolute local paths the browser cannot
  know.
- Omit an empty section's bullet list but keep the section header with a single
  line `- (none)` **or** omit the section entirely when empty — pick one and
  unit-test it; prefer **omit empty sections entirely** so agents don't get noise.
- Titles fall back to `id` when title missing.
- Export timestamp is `new Date().toISOString()` at copy time (DOM path); pure
  helper accepts `exported` as an argument for tests.

Export pure helpers via the existing CommonJS `module.exports` guard (same as
`buildShareRequest` / `groupDirectory`).

### 3. supersededBy grouping (sidebar + library index)

`directory.json` already projects `supersededBy` on archived items (builder
validates). UI must:

- Treat archive items with `supersededBy: "<canonicalId>"` as **earlier copies**
  of that canonical id (canonical may be active or archive).
- Under the Archive section (and on the library index Archive list):
  - List **canonical** archive rows as normal top-level rows (items without
    `supersededBy`, plus items that are targets of others even if they themselves
    have no supersededBy).
  - Nest earlier copies under their canonical row in a collapsed-by-default group
    labeled **Earlier copies** (English, match existing chrome language).
  - If a copy points at a missing id, still show it as a normal archive row
    (do not drop it).
- Active section: **do not** nest by supersededBy (field is archive-only in schema).
- Sorting: keep `updatedAt` DESC, `id` ASC within each list (top-level and within
  a group). Prefer pure helper `groupArchiveWithSuperseded(items)` (or extend
  `groupDirectory`) so unit tests cover the graph without DOM.

### 4. Docs

Update `plugins/solopreneur/shared/config.md` **Library chrome** /
`preview-shell.js` subsection only: mention Manage mode, the archive-request
copy contract (point at the text shape, not a novel schema), and Earlier copies
grouping. Do not rewrite unrelated sections.

### 5. Out of scope

- No changes to `build-library.mjs`, deploy scripts, SKILL.md, or mvp.
- No delete UI, no auto-mv, no backend.
- No redesign of Share / provenance / docked sidebar layout (keep existing
  expand/collapse + push/overlay behavior).

## Files to Read

- `plugins/solopreneur/skills/preview/assets/preview-shell.js` (extend; match
  Shadow DOM, `copyText`, export guard, section markup patterns)
- `plugins/solopreneur/skills/preview/assets/library-index.html` (Archive list
  rendering — apply same supersededBy grouping)
- `plugins/solopreneur/skills/preview/tests/preview-shell.test.mjs` (extend pure
  helper tests)
- `plugins/solopreneur/shared/config.md` (Library chrome section only)
- Architecture notes for the request format (source todo path above)

## Files to Create/Modify

- `plugins/solopreneur/skills/preview/assets/preview-shell.js` — manage UI + pure helpers
- `plugins/solopreneur/skills/preview/assets/library-index.html` — Earlier copies groups
- `plugins/solopreneur/skills/preview/tests/preview-shell.test.mjs` — unit tests
- `plugins/solopreneur/shared/config.md` — chrome docs only

## Acceptance Criteria

- [ ] `cd plugins/solopreneur/skills/preview && node --test tests/preview-shell.test.mjs` exits 0
- [ ] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs` exits 0 (full suite still green)
- [ ] `rg -n "library archive request|buildArchiveRequest|Manage mode|Earlier copies" plugins/solopreneur/skills/preview/assets/preview-shell.js` finds manage helpers and UI strings
- [ ] Unit test: `buildArchiveRequest` (or equivalent) with two archive + one restore selections produces a string that includes `## library archive request`, both selected ids, and omits unselected ids
- [ ] Unit test: archive items with `supersededBy` nest under the canonical id; a dangling `supersededBy` still appears as a top-level archive row
- [ ] `rg -n "Earlier copies|supersededBy" plugins/solopreneur/skills/preview/assets/library-index.html` shows grouping logic on the index
- [ ] `rg -n "Manage mode|archive request|Earlier copies" plugins/solopreneur/shared/config.md` updates the Library chrome section
- [ ] No deploy script or `build-library.mjs` changes (`git diff --stat` must not list them)

## Notes

- Match existing English UI chrome (Share…, Active, Archive, unrecorded).
- Chinese appears only inside the archive-request **agent contract** block as
  specified (section headers `archive（active → archive）：` etc.) — that string
  is a parse contract for agents, not sidebar chrome.
- Keep accessibility baseline: buttons have labels; checkboxes associated with
  row titles; manage toggle `aria-pressed` or equivalent.
- Prefer small pure functions + thin DOM wiring (same style as Share helpers).
