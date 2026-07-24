# feat(preview): library chrome — sidebar, provenance footer, per-ID comments, index

The capstone of Phase 2. It builds the browser-facing chrome for the preview
Library and WIRES it into the builder's prepared injection seam, so
`build-library.mjs` now produces a fully navigable Library (a home page plus
per-item pages with a sidebar and footer), not just a bare staging tree.

Follows the merged Phase 1 config work and Phase 2 builder + provenance resolver
(`build-library.mjs`, `resolve-provenance.mjs`). It is assets + the build-library
wiring that applies them + the comment-overlay change + tests + docs. It does NOT
implement any deploy step, and modifies none of `config-resolve.mjs`,
`config-migrate.mjs`, `vercel-protect.mjs`, `setup.mjs`, `resolve-provenance.mjs`,
`config.schema.json`, or any `plugin.json`. `build-library.mjs` is changed only to
apply its own injection seam, copy the shared assets, and generate the index — its
scanner / hash / sanitizer are untouched.

## Requirements

### `preview-shell.js` (new shared asset)

Injected into every item entry page, using **Shadow DOM** for full style
isolation (it must not leak styles into, or inherit from, the preview content).

- A top-left fixed directory icon that opens a **sidebar**.
- Sidebar: `active` and `archive` sections; within each, items sorted `updatedAt`
  DESC; **Archive collapsed by default**; the current page is marked
  `v<revision> · updated <local date/time>` and `aria-current`.
- All item links target the SAME deployment's `/p/<id>/` (never cross-deployment).
- A **provenance footer** consuming the exact shape `resolve-provenance.mjs`
  returns — `{ producedBy }` (one line) or `{ createdBy, lastUpdatedBy }` (two
  lines) — and "unrecorded" when absent. Times render in the viewer's local
  timezone via `Intl.DateTimeFormat`, full ISO in a `title` tooltip.
- A **Share request** block: a Share button that expands an access selector
  (`project-members` default / `anyone-with-link`) and a read-only, copyable JSON
  request carrying schemaVersion, preview id, revision, contentHash, the current
  URL, and access. It does NOT deploy and holds no token — copy-to-clipboard only.

### `comment-overlay.js` (modified)

- **Per-ID storage key** `preview_comments_v3:<previewId>` (and `DIFF_CLEAN_KEY`
  namespaced the same way), so previews on one Library origin no longer share one
  comment blob. The id is a trusted value the builder stamps as a
  `data-preview-id` attribute, read via `document.currentScript`.
- The global v2 key (`preview_comments_v2`) is **never auto-adopted** (it predates
  per-ID and cannot be attributed); a manual import path is offered instead.
- **Write failures are surfaced**, not swallowed: a failing `setItem` shows a
  visible banner with an export escape hatch instead of a false success.
- A **double-load guard** makes a second include a no-op.

### `library-index.html` (new template)

The Library home page: renders the catalog from `directory.json` (active +
archive, archive collapsed by default via a native `<details>`, `updatedAt` DESC,
links to `/p/<id>/`). It shares the same directory data as the sidebar.

### Wiring into `build-library.mjs`

- Copy the shared assets from the plugin's `skills/preview/assets/` into
  `<staging>/assets/` — the content tree never holds shared components.
- Per entry (`chromeInject`, passed by the CLI; the default seam stays verbatim):
  rewrite an existing `<script src="./comment-overlay.js">` tag to the shared
  staging asset (never add a second tag), stamp the trusted preview id, and inject
  the preview-shell data island + script at the `findInjectionPoint` seam.
- Generate `index.html` from `library-index.html` + `directory.json`.
- All injected metadata is embedded via a JSON island escaped with `<` → `<`
  (`jsonIsland`), never string-concatenated.

## Acceptance Criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 — 297 tests (262 baseline: 260 pass + 2 skipped; + 35 new).
- [x] Injection: a built entry contains exactly ONE overlay `<script>` (existing
      tag rewritten to `/assets/comment-overlay.js` + `data-preview-id`, not
      duplicated) and preview-shell at the seam; a fixture with an existing
      `./comment-overlay.js` tag proves the rewrite (no second tag).
- [x] Comment key is `preview_comments_v3:<id>`; two ids do not collide
      (key-derivation unit test).
- [x] Overlay write failure is surfaced — a throwing `setItem` makes `tryPersist`
      return false (a visible error + export hatch), not a silent success.
- [x] Overlay double-load guard: a second init is a no-op.
- [x] The v2 legacy key is NOT auto-adopted by any preview (`loadComments` reads
      only the v3 key).
- [x] Provenance footer renders `producedBy` (collapsed) vs `createdBy` /
      `lastUpdatedBy` (distinct) correctly, and "unrecorded" when absent.
- [x] Library index + sidebar are generated from `directory.json`; archive
      collapsed by default; links target `/p/<id>/`.
- [x] Shared assets are copied from the plugin `assets/` into staging.
- [x] `grep -rniE 'hana|~/Agents|mojo-apps'` over the new/modified assets + shell
      test returns no matches.
- [x] `git diff --stat` shows no change to the protected files or any
      `plugin.json`.

## Implementation decisions

**Injection seam, default stays verbatim.** `buildLibrary`'s `injectEntry` default
remains `identityInject`, so the seam-isolation tests and any verbatim caller keep
working; the CLI passes the real `chromeInject`. Asset-copy and index-generation
are library-level assembly (independent of per-entry chrome), so they run on every
build — a verbatim build still yields a navigable home page + sidebar assets.

**Trusted id via `data-preview-id` + `document.currentScript`.** The overlay reads
its per-preview id from its own script tag's data attribute during the classic
script's synchronous execution — no ordering dance, no global set by another
script. The id is a validated slug (`^[a-z0-9-]+$`), inert in an attribute.

**Shell data island; sidebar fetches `/directory.json`.** The builder injects only
the CURRENT item's metadata + resolved provenance as a `type="application/json"`
island (escaped, never concatenated). The full catalog for the sidebar is fetched
at runtime from the deployment's `/directory.json` — the same file the index is
generated from — so it is a single source, not duplicated into every page, and the
builder's flow (directory projected after the copy loop) is unchanged.

**Shadow DOM with `:host { all: initial }`.** Inheritable properties (font, color)
cross a shadow boundary via the host, so the shell resets them and declares its own
fonts/colors, giving true two-way isolation regardless of the preview's CSS.

**Dual-target assets.** `preview-shell.js` and `comment-overlay.js` run as browser
classic scripts AND export their pure, DOM-free helpers through a CommonJS guard
(`if (typeof module !== 'undefined' …)`), so `node:test` unit-tests them jsdom-free
via a default import. There is no package.json in the tree, so Node treats the
`.js` as CommonJS.

**Native collapse for the index Archive.** `library-index.html` uses a `<details>`
without `open` for the archive section — collapsed by default with no JS toggle.

## Vetting note

An expert web-platform review confirmed the load-bearing assumptions:
`document.currentScript` is reliably the executing element during a classic
script's synchronous run (null in later callbacks, so it is read synchronously);
`position: fixed` resolves against the viewport from inside a shadow root when the
host has no transformed ancestor; escaping `<` fully neutralizes `</script>` /
`<!--` / `<script` breakout in both a JSON island and an inline script; ESM
default-import of a CJS module yields `module.exports`; `setItem` throws
synchronously on quota / blocked storage; and `Intl.DateTimeFormat` with no explicit
timezone is stable on Node 20 and evergreen browsers for a zone-qualified instant.
