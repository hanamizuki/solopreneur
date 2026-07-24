# feat(preview): legacy config migrator + CI test gate

Follows PR #134 (`7536540`), which added `config-resolve.mjs`,
`config.schema.json` and 39 tests. This PR builds directly on those and matches
their conventions.

## Requirements

Two deliverables. The migrator is the main one; the CI workflow closes a hole
that PR #134 left open.

**Scope discipline** — no `setup.mjs`, `build-library.mjs`,
`deploy-library.mjs`, `deploy-share.mjs`, and no Vercel or network logic. This
PR is network-free.

### Deliverable 1 — `config-migrate.mjs` (legacy → v2 migration proposal)

The migrator only ever produces a **proposal** plus, on explicit opt-in, a
single new file. It must never mutate the legacy config.

Legacy shapes it must recognize and report:

- `default.preview.projects.{default,keep,public}` and `default.preview.autoProtect`
- `repos.<git-remote>.preview.path` (per-repo path override)
- the older **flat** `preview.paths.<repo-key>` shape — this one matters: 4 of 5
  real-world configs still use it, so a migrator that ignores it misses most
  actual state

Which files it scans (this is the *generic public plugin* migrator, so keep it
narrow):

- primary `${CLAUDE_CONFIG_DIR:-~/.claude}/solopreneur.json`
- fallback `~/.claude/solopreneur.json`
- plus a repeatable `--legacy-config <path>` flag for anything else

No hardcoded user-specific inventory of config files. Scanning more than the two
default locations requires the explicit flag.

Behavior:

- **Default mode is a dry run.** Print the detected legacy values, the candidate
  target projects, the exact path the new `.solopreneur.json` would be written
  to, and a full diff of the proposed file. Write nothing.
- Target selection must be **explicit, never guessed**: the caller passes
  `--target-project <name>`. Without it, list the candidates found and exit
  non-zero explaining that a choice is required. Do not infer intent from the
  `default` / `keep` / `public` bucket names.
- `autoProtect: true` (or absent, since it defaults to true) maps to
  `visibility: "private"`. `autoProtect: false` must surface as an explicit
  warning that the migrated target will still be `private` — never silently
  produce a `public` target.
- `--write` performs the migration: first a **timestamped backup** of each
  legacy file it read, then the new v2 `.solopreneur.json` via an **atomic
  temp-file + rename**. The legacy `solopreneur.json` is **read-only and left
  byte-identical** — rollback depends on it being untouched, and a test asserts
  the bytes.
- The generated config must validate against `shared/config.schema.json` and
  resolve cleanly through `config-resolve.mjs`. Both asserted in tests.
- Refusing to migrate must be a clean no-op: nothing written, exit code
  reflects the refusal.

### Deliverable 2 — CI test gate

PR #134's 39 tests ran in no CI job — no workflow in this repo installed Node,
so they were a local-only gate and a future edit could land with them red.

- `.github/workflows/validate-preview-tests.yml` runs the preview skill's
  `node --test` suite on pull requests and pushes to `main`.
- Triggered on `plugins/solopreneur/skills/preview/**`,
  `plugins/solopreneur/shared/**`, and the workflow file itself.
- Node pinned via `actions/setup-node`.
- Follows the four existing workflows (permissions block,
  `defaults.run.shell: bash`, SHA-pinned actions with a version comment,
  job-level concurrency, `::error::` annotations on failure).

## Acceptance Criteria

- [x] `cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs`
      exits 0 with 68 tests — PR #134's 39 plus 29 new
- [x] Migrator cases cover, each distinctly: the three-bucket legacy shape; a
      single-project legacy config; the flat `preview.paths.<repo-key>` shape;
      `autoProtect: true`→`private`; `autoProtect: false` warning and still
      `private`; missing `--target-project` exiting non-zero with candidates
      listed; dry run writing nothing; `--write` producing a timestamped backup;
      `--write` using an atomic rename; the legacy file's bytes being identical
      before and after `--write`; a refused migration being a clean no-op;
      `--legacy-config` accepting repeated paths
- [x] A test asserts the generated config validates against `config.schema.json`
      and resolves via `config-resolve.mjs` (`mode` is `v2`, `root`/`target`
      match the proposal), and proves the check is not vacuous by deleting a
      schema-required key and asserting rejection
- [x] The new workflow is triggered by this PR's own paths and its `node --test`
      step passes in CI
- [x] `grep -rniE 'hana|~/Agents|mojo-apps' plugins/solopreneur/skills/preview/scripts/config-migrate.mjs .github/workflows/validate-preview-tests.yml`
      returns no matches (exit 1)
- [x] `git diff --stat` shows no modification to `deploy.sh`, `preflight.sh`,
      `SKILL.md`, `comment-overlay.js`, `config-resolve.mjs`,
      `config.schema.json`, or any `plugin.json`

## Notes

- **The test command is a known trap.** `node --test tests/` does NOT work on
  Node ≥ 22.6: positional arguments became glob patterns, so a bare directory
  matches itself and the run fails without executing any test. Use
  `node --test tests/*.test.mjs` (or bare `node --test`).
- `plugins/designer/skills/impeccable/` is vendored and is NOT house style. The
  precedent is `deploy.sh` and the merged `config-resolve.mjs`.
- Node built-ins only. No new dependencies, no `package.json`.
- Open-source repo: all code comments and documentation in **English**.
- No `plugin.json` version bumps — that is the `/release` skill's job.
- `PREVIEW_PROJECT` remains the highest-priority override for the legacy
  per-page flow. The migrator neither reads nor changes it.
- The v2 `.solopreneur.json` and the legacy `solopreneur.json` coexist
  permanently during migration. Never merged, never read-modify-written.

## Corrections to this spec

**"Pin a Node version" was widened to a two-entry matrix.** Both `.mjs` headers
declare a floor of Node 20. A single job on a current LTS never exercises that
floor, so a Node-20 break would ship green while the header kept claiming
support. The workflow runs `['20', '24']` — the declared floor and the current
Active LTS — with the matrix leg in the concurrency group (without it the two
legs share a group and cancel each other, silently untesting one version). Both
verified passing locally before the workflow was written, alongside Node 26.

**The `--legacy-config` files could not come from the resolver.** The spec's
"reuse `config-resolve.mjs` rather than re-implementing resolution" holds for
resolution, but not for reading legacy files: `resolveConfig` reports the legacy
layers *only when no v2 config wins*, so a user with a
`~/.config/solopreneur/config.json` would have made the legacy files invisible
to the migrator. The migrator therefore reads all legacy files itself and uses
the resolver for the two things only it can answer — "is a v2 config already in
force here?" and "does the file I am about to install resolve?".

## Implementation decisions

**Two legacy cascades, deliberately not unified.** `projects.<bucket>` and
`autoProtect` are read the way `deploy.sh:read_preview_config` reads them —
*file-major*: `repos[<rk>]` then `default` **within** each file, before moving to
the next file. The preview path is read the way `read_solopreneur_config preview`
reads it — *subtree-major*: the whole `preview` subtree from the first layer that
has one, then `.path` else `.paths[<rk>]` **from that one subtree**. Answering
either question with the other's order picks a different winner and would
migrate a setting the user never set. Both are registered in
`shared/config.md`'s hand-maintained list of legacy-layout consumers, because
neither of that file's greps can find a copy written in JavaScript.

**Subtree shadowing is preserved, not repaired.** When the winning subtree has no
path but a lower layer does, the migrator reports "no configured path" and
defaults the root. The legacy reader does not see that lower layer either, so
un-shadowing it here would move the previews to a directory the legacy flow never
used. The report names the layer that stopped the search.

**The default root is `docs/preview`.** Not an invention: it is SKILL.md's
documented last-resort default for an unconfigured repo. Because `resolveV2`
tolerates a root that does not exist yet, a defaulted root would otherwise
validate silently into an empty Library — so the report flags when the directory
is absent.

**The candidate list is advisory, not a whitelist.** The first implementation
refused a `--target-project` outside the candidates (except when there were
none). Review showed that cannot be right: the list is a union across every repo
the file mentions, so an unrelated repo's project would have been the only
"valid" choice for a repo that has only a `preview.paths` entry, while a
deliberately fresh project — the obvious reason to migrate — was refused. A name
outside the list is now noted in the report instead, and the known names are
still printed beside it so a typo stays visible.

**Cross-layer order beats explicit-file priority for the path lookup.** A named
`--legacy-config` outranks a default location *within* each cascade layer, but
the layer order itself (every file's `repos`/`default` subtree before any file's
flat top-level `preview`) is preserved from `read_solopreneur_config`.
Re-ordering it for named files would make the migrator answer differently from
the reader it is migrating from. The report names the winning layer and file, and
says when that layer carries no path, so the outcome is visible rather than
silent.

**A failed `--write` rolls back everything it created.** Validation runs before
any backup, and the backups already taken are removed if a later backup or the
rename fails. Both matter for the same reason: the backup stamp is
second-granularity and the copy is `COPYFILE_EXCL`, so a stray backup makes the
corrected retry fail on EEXIST complaining about backups instead of the problem
the user actually has to fix.

**The preview root is checked up front, in the dry run too.** The config lands at
the repo root and the resolver finds it by walking up from a content item, so a
root outside the repository — an absolute path elsewhere, or one escaping via
`..` — would leave a file no walk-up ever reaches: a "wrote it" that resolves to
nothing. That is refused rather than placed by a second guessed rule. A root that
exists as a regular file is refused for the same visibility reason — the dry run
is the review surface, and it must not show a proposal that only fails after
`--write`. A missing root is fine; a fresh setup creates it later.

**Physical paths, not lexical, everywhere the resolver uses them.** The root
containment check physicalizes the root before judging it in-repo — realpathing
the deepest existing ancestor and re-appending the missing tail — so an in-repo
symlink that physically escapes the tree, *and* a not-yet-created root under such
a symlinked ancestor, are both refused rather than written as an undiscoverable
config. The resolver realpaths content, so a lexical check would disagree with it
exactly there. Legacy sources are deduped by physical file identity too: a
symlinked `CLAUDE_CONFIG_DIR` aliasing `~/.claude` would otherwise back the one
file up twice onto the same `.backup-<stamp>` path, and the second
`COPYFILE_EXCL` would fail EEXIST and roll the whole migration back.

**A v2 config nearer the content than the repo root is refused.** The migrated
config lands at the repo root, but the resolver finds the *nearest* config
walking up from content — so a pre-existing `.solopreneur.json` with a preview
block between the root and the repo root would shadow it. Resolving from the root
before writing reports what already wins there; a nested hit (strictly below the
destination) means the migration would be inert, so it refuses. Configs at or
above the destination are the shadow check's job, and the user-global
`~/.config/solopreneur/config.json` is explicitly excluded from that positional
check — it is a lower layer a repo-local file overrides no matter where the repo
sits, even directly under `~/.config/solopreneur/`.

**Legacy files are classified before reading, and every config-derived string in
the report is quoted.** A FIFO or a device symlink at a config path would block
`readFileSync` forever, so the file is `stat`-checked first, exactly as the
resolver does. And the report is the human's decision surface: project names, the
repo key, the preview path AND the `projects` bucket key are all user-controlled
and all quoted through one `show()` helper, so a newline in any of them cannot
forge a line that looks like the script's own statement of fact.

**The shadow refusal is positional, not layer-based.** Refusing on any
`mode === "v2"` would block a legitimate repo-local migration for anyone with a
user-global `~/.config/solopreneur/config.json`, which is a *lower* layer that a
repo-local file is supposed to win over. The check is instead "would the new file
shadow a config at or above the destination?".

**Same-directory temp is load-bearing twice.** It puts the temp on the same
filesystem, so the rename cannot fail with EXDEV; and the resolver resolves a
relative `root` against the directory of the file it reads, so validating the
temp there gives exactly the answer the installed file will give. Moving temps to
`os.tmpdir()` would silently break both. Cleanup is in a `finally`, so a rejected
config, an ENOSPC mid-write and an EACCES on the rename all leave nothing behind.

**No fsync.** `rename` is atomic with respect to other processes, which is the
property that matters. Power-loss durability is not the threat model when the
legacy config is untouched by contract and the recovery is "run it again".

**The destination check is a guard, not a lock.** `lstat` then `rename` is a
TOCTOU window. `linkSync` would close it, but the acceptance criteria call for an
atomic *rename* specifically, and a single-user CLI does not need the stronger
primitive. The comment says so rather than overclaiming.

**Atomicity is asserted, not claimed.** One test preloads a CJS `--require` spy
that wraps `fs.renameSync` and logs its arguments, then asserts a rename landed
on the destination from a source in the same directory. An implementation that
wrote straight to the destination logs nothing and fails. Verified working on
both Node 20 and Node 26 — the preload runs before the ESM main is linked, so the
builtin's ESM facade is built from the already-wrapped object. It is paired with
an implementation-agnostic outcome test: a legacy path pointing at a regular file
makes validation reject the config, and the run must leave no config and no temp
behind.

**Git hermeticity in fixtures.** Every fixture `git init`s the directory it
migrates, so the repo key is the toplevel path regardless of where TMPDIR lives;
`GIT_CONFIG_NOSYSTEM` shuts out `/etc/gitconfig` (where a `url.*.insteadOf` would
rewrite the origin the key is derived from) and `GIT_CEILING_DIRECTORIES` stops
any walk-up at the temp root, so a TMPDIR inside a checkout cannot lend a fixture
its repo.

## Review outcomes

Findings raised by the pre-implementation reviewers that were **declined**,
recorded so they are not re-litigated:

- **Replace `renameSync` with `linkSync` to close the TOCTOU window.** Directly
  against the acceptance criterion naming an atomic rename; the window is
  irrelevant for a single-user CLI. Documented instead of hidden.
- **Drop the `--require` rename spy as an undocumented internal.** The concern
  was that it was only verified on Node 26; it was then verified on Node 20 too,
  and the acceptance criteria require a distinct atomic-rename case. The
  reviewer's stronger outcome test was added *alongside* it, not instead.
- **Drop `invokedDirectly()` since the migrator is CLI-only.** Kept: it matches
  the file next door and keeps the module importable without side effects.
- **Export `legacyPreviewValues` / `readJsonIfPresent` from
  `config-resolve.mjs`** to avoid duplication. Out of scope — the acceptance
  criteria forbid modifying that file. The duplicate is registered in
  `config.md` instead, which is the mechanism that file already prescribes.
- **Drop the backup step, since the legacy file is never mutated anyway.**
  Required by the spec, and it covers the case the guarantee does not: the user
  deleting the legacy file later.
