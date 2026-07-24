# feat(preview): library builder — scan, hash, sanitized staging

Follows PR #134 (`config-resolve.mjs`, `config.schema.json`), PR #135
(`config-migrate.mjs`), PR #136 (`vercel-protect.mjs`), and PR #137
(`setup.mjs`). First PR of Phase 2 — the builder. It adds `build-library.mjs`
and its `preview.json` sidecar schema: turn a resolved target's collections into
a deployable staging tree. It is the scanner + staging producer + schema + tests
+ docs only. It does NOT do chrome injection (sidebar / provenance footer / Share
UI), does NOT deploy, and does not modify `deploy.sh`, `config-resolve.mjs`,
`config-migrate.mjs`, `vercel-protect.mjs`, `setup.mjs`, `config.schema.json`, or
`comment-overlay.js`.

## Requirements

Implement `build-library.mjs`: scan the resolved target's `include` collections
(v1: `active`, `archive`), validate each item's `preview.json`, compute a content
hash per item, project an allowlist of metadata into `directory.json`, and copy
each item's files into `/p/<id>/` — never leaking raw source metadata into the
deployment.

### `preview.json` schema (new — `preview-schema.json`)

A per-item sidecar at `<collection>/<id>/preview.json`, a DIFFERENT file from
`.solopreneur.json`. Draft 2020-12, interpreted by a small in-module validator
(the same discipline `config-resolve.mjs` uses over `config.schema.json`; the
interpreter here adds `pattern`, `integer` and `minimum`, and audits its own
schema at load time).

- Required: `schemaVersion` (const 1), `id`, `title`, `createdAt`, `updatedAt`,
  `revision` (integer ≥ 1).
- `id` is a lowercase slug `^[a-z0-9-]+$` — it becomes the `/p/<id>/` route and a
  staging path segment, so `/`, `\`, `.`, `..`, uppercase and URL-encoding are all
  rejected. The directory name must equal the id.
- Optional: `project`, `sourceRef`, `entry` (const `index.html`; any other value
  is an explicit error), `tags` (string array), `supersededBy`, `provenance`
  (validated as an object and passed through — provenance RESOLUTION is a later
  change, not this one).
- `supersededBy`, if present: names another existing item, only on an Archive
  item, no cycles (a self-reference is the shortest cycle).

### Scanner + build flow

1. The CLI resolves config through `config-resolve.mjs`; the core `buildLibrary`
   takes the resolved `root` / `collections` / `include` as input (so tests
   exercise it without config files).
2. Validate each `preview.json` (schema + slug + dirname===id + entry value);
   a duplicate id across ANY two included collections aborts naming BOTH files
   plus a "give one a different id" hint; the entry file must exist;
   `supersededBy` target / placement / cycle.
3. Compute a `sha256` `contentHash` per item over a CANONICAL payload = the item's
   source files (posix relpath + sha256, sorted, NFC-normalized) EXCLUDING
   metadata/runtime files, plus the intrinsic display metadata — computed from the
   scan fingerprint BEFORE any chrome injection, so the same revision hashes
   identically as a Library page or a Share snapshot. `collection` is NOT hashed
   (archiving is a plain move, and a Share snapshot has no collection). It is a
   derived value, never written back into `preview.json`.
4. Project the allowlist into `directory.json`, sorted `updatedAt` DESC then `id`
   ASC. Per item: `id`, `title`, `createdAt`, `updatedAt`, `revision`, `project`,
   `tags`, `collection`, validated `supersededBy`, `contentHash`; plus a
   document-level `generatedAt` and (when the root is in a git repo) `source.commit`.
   `sourceRef`, provenance, raw session ids, transcript paths and absolute local
   paths are never emitted — the projection PICKS named keys, never spreads.
5. Copy each item's files into `/p/<id>/` (collection is not in the route, so
   archiving is a plain `mv` that does not break links). `preview.json` is not
   copied.

### Hardening (crown-jewel correctness rules)

- **Filesystem containment**: every item directory and every file is realpath'd
  and asserted inside the preview root / item dir; a symlink escaping its preview
  dir is rejected, a directory-symlink cycle is rejected, and a device / socket /
  FIFO is rejected (only regular files and directories are content).
- **Exclusions (one predicate)**: every dotfile and dotdir is excluded — `.vercel/`
  with its `project.json`, `.git/`, `.env*`, `.DS_Store`, and any accidental
  `.netrc` / `.git-credentials` / `.npmrc` — plus the non-hidden `preview.json`
  and the per-page `comment-overlay.js`. One case-insensitive predicate feeds the
  scan, the fingerprint, the hash and the copy, so they cannot drift.
- **Torn-snapshot guard**: a single scan takes a per-file content fingerprint up
  front; after copying, every staged file is re-hashed and compared, and a file
  that was rewritten OR removed mid-copy aborts the build rather than publish a
  torn snapshot. Matching only the file list would miss "same filename, rewritten
  content", so the content itself is fingerprinted.
- **HTML escaping**: `directory.json` is always produced via `JSON.stringify`,
  never string concatenation. (No metadata is written into HTML this PR — the
  entry is copied verbatim; the library index and chrome injection are a later
  change and must escape then.)
- **Injection seam (prepare, don't inject)**: `findInjectionPoint` locates the
  LAST `</body>` (case-insensitive) with an EOF fallback, exported and tested; the
  `injectEntry` seam defaults to verbatim copy, runs AFTER the torn-snapshot guard
  (so the guard validates the verbatim copy), and is where the later change adds
  `preview-shell.js` + a rewritten `comment-overlay.js` tag.
- **Framework assets single source**: shared assets are the plugin's
  `skills/preview/assets/`; the content tree never holds shared components — the
  per-page `comment-overlay.js` is excluded here so the later change can point at
  the shared staging asset.
- **Size report**: file count + total bytes per collection, warned past 200 files
  / 50 MB.
- **Staging in mktemp**: the tree is assembled in a system temp dir; a failed
  build removes it, and a successful one is left for the deploy step to consume.

### Constraints

- Node built-ins only; no new deps; no `package.json`. Node floor 20 (CI 20 + 24).
- Open-source repo: comments and docs in English.
- No Hana-specific values in the new files.
- No `plugin.json` version bump.

## Acceptance Criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 — 216 tests (161 baseline + 55 new).
- [x] **Sorting**: `updatedAt` DESC then `id` ASC, proven with a shared-`updatedAt`
      tie-break fixture.
- [x] **Duplicate id** across active+archive errors and names BOTH paths.
- [x] **Slug guard**: rejects `../x`, `a/b`, uppercase, url-encoded, `foo\n`;
      accepts `2026-07-24-foo`.
- [x] **Realpath containment**: a symlink escaping a preview dir is rejected; a
      FIFO is rejected; a contained symlink is followed; a directory cycle aborts.
- [x] **contentHash** stable for identical content, computed before chrome (two
      builds → same hash; a trailing chrome placeholder does not change it).
- [x] **directory.json** contains ONLY allowlisted fields — `sourceRef`, raw
      session id, transcript path, provenance, absolute paths never appear.
- [x] **preview.json** NOT present under staging `/p/<id>/`.
- [x] **Excluded files** (`.vercel/`, `.git/`, `.env*`, `.DS_Store`, per-page
      `comment-overlay.js`, and any dotfile) are not copied and do not change the hash.
- [x] **Injection point**: correct for last-`</body>`, multiple-`</body>` (LAST),
      missing-`</body>` (EOF), mixed-case — tested; no chrome injected.
- [x] **Torn-snapshot**: a fixture mutating (and one removing) a file between scan
      and copy aborts.
- [x] **entry** must be `index.html`; other values error; a missing entry errors.
- [x] `grep -rniE 'hana|~/Agents|mojo-apps'` over the new `.mjs`/schema/test files
      returns no matches.
- [x] `git diff --stat` shows no change to `deploy.sh`, `config-resolve.mjs`,
      `config-migrate.mjs`, `vercel-protect.mjs`, `setup.mjs`, `config.schema.json`,
      `comment-overlay.js`, or any `plugin.json`.

## Implementation decisions

**Core takes resolved fields; the CLI resolves.** `buildLibrary({root, collections,
include, ...})` is a pure function of its inputs and the filesystem under `root`,
so the correctness tests run in-process with no config files and no env juggling.
The CLI calls `resolveConfig` and passes the resolved fields in; a handful of
spawn tests prove that wiring.

**Three injected seams.** `gitCommit` (source-commit lookup) keeps the git call
deterministic and hermetic in tests; `injectEntry` is the real chrome seam a
later change replaces (default verbatim); `hooks.afterFingerprint` is a test seam
that mutates a source file between the scan and the copy to exercise the
torn-snapshot guard — the only hermetic way to simulate the background auto-sync
race.

**`preview-schema.json` interpreted, not hand-checked.** The contract lives in one
machine-checkable file; a small interpreter reads it (auditing its own keywords at
load time), so the schema and the validator cannot drift. Cross-item rules
(duplicate id, `supersededBy` placement/cycle, entry-exists, containment) are
inherently code, not schema, and live in the scanner.

**Directory name must equal the id.** An item lives at `<collection>/<id>/`, so the
directory IS the id. Enforcing it keeps the route predictable from the source
location and catches a dir renamed without updating the id before it deploys under
a surprising route.

**Adopted from independent review:** exclude every dotfile (one rule closes
accidental `.netrc`/`.git-credentials` leakage without a growing denylist);
NFC-normalize relpaths so non-ASCII filenames hash identically on macOS/Linux;
convert a mid-copy ENOENT into a clean torn-snapshot abort rather than a raw crash.

## Notes

- **No in-repo caller yet.** `build-library.mjs` is run by a human or the deploy
  step (a later change); `SKILL.md` is unchanged (it documents no v2 build path
  today).
- **Verbatim copy leaves a dangling `comment-overlay.js` script.** The entry is
  copied byte-for-byte and the per-page `comment-overlay.js` is excluded, so the
  copied page references a script that is not there yet. That is by design — the
  later chrome change rewrites the tag to the shared staging asset. This PR does
  not deploy, so nothing 404s in the meantime.
- **Sort is lexical.** `updatedAt` DESC is a string sort — deterministic across
  machines (the stated guarantee), and chronological when timestamps share a
  format. The schema does not force UTC because the documented item format carries
  offsets; the `id` ASC tie-break gives a total order regardless.
- **Staging handoff.** On success the staging tree is left in `os.tmpdir()` and its
  path is printed; the deploy step owns consuming and removing it. On any failure
  the builder removes its own partial tree.
- **Test command trap.** `node --test tests/` runs zero tests on Node ≥ 22.6; the
  suite is run as `node --test tests/*.test.mjs`, and CI guards it with
  `shopt -s failglob`.
