# fix(ci): sync-vendored Self-validate must compare pinned vs non-pinned, not vs HEAD

## Problem (root cause, evidence-based)

`.github/workflows/sync-vendored.yml` ("Sync vendored skills") fails on every
push to `main` for all matrix plugins. The failing step is **"Self-validate
pinned manifest reproduces synced files"** (`exit 1`, `::error::Pinned
re-sync drifted…`). It is gated on `steps.diff.outputs.changed == 'true'`, so
it only runs when an upstream rev actually moved.

Step order in the workflow:

1. `Run sync-vendored.sh` (non-pinned) — checks out each upstream branch
   HEAD, writes the **new upstream content** into `skills/`, updates manifest
   `rev` to the new HEAD. Working tree now holds new content, **uncommitted
   and unstaged — never snapshotted**.
2. `Detect changes`, `Build PR body` — read-only.
3. `Self-validate` — runs `./scripts/sync-vendored.sh --pinned`, then
   `git diff --exit-code -- 'skills/' ':!skills/_vendored/manifest.json'
   ':!skills/**/_VENDOR.md'`.

There is **no `git add` / `commit` / `stash` / snapshot between step 1 and
step 3**. So step 3's `git diff` baseline is HEAD, while the working tree
already contains step 1's new upstream content. Whenever upstream content
actually changed — which is the precondition for reaching this step — that
`git diff` is non-empty by construction → `exit 1` → the `Create or update
sync PR` step never runs. Net effect: a content-changing vendored sync PR
can never be opened, and every push to `main` shows the whole matrix red.

The step's *intent* is to verify that a `--pinned` re-sync **reproduces the
files the non-pinned sync just produced** (manifest and synced files are
mutually consistent). It was mis-implemented as "synced `skills/` are
byte-identical to the last commit", which is false any time upstream drifts.

## Fix

Stage the non-pinned sync output into the git index (`git add -A`)
immediately **before** the `--pinned` re-sync. `git diff` with no
`--cached` and no commit argument compares **working tree vs index**, so
after the pinned re-sync overwrites the working tree, the existing
`git diff --exit-code` measures exactly pinned-result-vs-non-pinned-result —
the invariant the step actually wants — instead of non-pinned-vs-HEAD.

The existing `git diff --exit-code -- 'skills/'
':!skills/_vendored/manifest.json' ':!skills/**/_VENDOR.md'` is unchanged:
the path excludes still ignore the cosmetic `synced_at` timestamp churn in
`manifest.json` / `_VENDOR.md`; with the index now holding the non-pinned
snapshot, the diff is empty in the normal case and non-zero only when a
`--pinned` re-sync genuinely diverges from the non-pinned sync.

No other step, the `strategy.matrix`, `validate-vendored.yml`, or
`plugins/solopreneur/scripts/sync-vendored.sh` is modified. This is the
minimal correct fix.

## Files Modified

- `.github/workflows/sync-vendored.yml` — added `git add -A` (with an
  explanatory comment) before the `--pinned` re-sync in the `Self-validate
  pinned manifest reproduces synced files` step; rewrote that step's inline
  comment block to describe the pinned-vs-non-pinned invariant and why
  staging is required.

## Notes

- `git add -A` runs from the step's `working-directory:
  plugins/<plugin>` but git stages repo-wide; that is fine on the ephemeral
  runner. The subsequent `git diff` pathspecs remain relative to that cwd
  (`skills/` → `plugins/<plugin>/skills/`) and behave identically whether
  the baseline is HEAD or the index.
- Staging early does not harm the later `peter-evans/create-pull-request`
  step — it re-derives and commits the changeset itself; a pre-staged index
  is a state it handles normally.
- This is a `.github/workflows/` infra fix. Per repo `CLAUDE.md`, root-level
  infra/docs changes do not bump any plugin version and do not go through
  `/release`.
