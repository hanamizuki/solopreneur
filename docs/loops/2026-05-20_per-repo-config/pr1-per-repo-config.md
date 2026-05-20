# refactor: per-repo config layering for solopreneur skills

## Requirements

Refactor the solopreneur skill config from a single flat schema (top-level
feature keys) to a layered `{ default, repos }` shape with per-repo override
support.

**New JSON shape**
```jsonc
{
  "default": {
    "greenlight": { "fallback_order": ["codex-bot", "gemini"] },
    "plans":      { "dir": "docs/plans" }
    // anything else that should apply to all repos lacking an override
  },
  "repos": {
    "github.com/owner/repo-a": { /* feature keys overriding default for this repo */ },
    "github.com/owner/repo-b": { /* … */ }
  }
}
```

**Lookup order (highest to lowest precedence)**
1. `.repos[<repo-key>].<feature>` in primary file (`$CLAUDE_CONFIG_DIR/solopreneur.json`)
2. `.default.<feature>` in primary file
3. `.repos[<repo-key>].<feature>` in fallback file (`$HOME/.claude/solopreneur.json`)
4. `.default.<feature>` in fallback file
5. **Legacy fallback**: top-level `.<feature>` in either file (so unmigrated configs keep working)

First non-null hit wins. Do NOT merge across layers — whichever layer answers
returns its whole subtree.

**`<repo-key>` derivation** (move out of preview into shared)
- `git remote get-url origin` → strip scheme, trailing `.git`, any `git@host:`
  prefix → normalized `host/owner/repo`
- If no `origin` remote → absolute path of `git rev-parse --show-toplevel`
- If not in a git repo → `$PWD`

**Write API**
- Keep `write_solopreneur_config <key> <expr>` (writes to `.default[<key>]` in
  primary file). Backwards-compatible API surface for callers writing
  user-global preferences.
- Add `write_solopreneur_repo_config <key> <expr>` (writes to
  `.repos[<repo-key>][<key>]` in primary file). For per-repo state.
- Both helpers must not clobber sibling keys: read existing primary, jq-merge,
  atomic write via `mktemp` + `mv`.

**Constraints**
- DO NOT auto-migrate the user's existing `solopreneur.json`. Read-side legacy
  fallback handles unmigrated configs. Provide a manual migration example in
  `_shared/config.md` docs.
- Keep all 6 inlined helper blocks across skills byte-identical to the source
  block in `_shared/config.md`. This is the established convention.
- `EnterPlanMode` is not in the ai-engineer agent's tool list — plan in your
  head (or via internal scratchpad), don't call the formal tool.

## Files to Read

- `plugins/solopreneur/skills/_shared/config.md` — current helper definitions,
  full file. This is what you'll rewrite.
- `plugins/solopreneur/skills/preview/SKILL.md` — search for "repo-key", the
  preview-skill-local logic for normalizing origin URL; this gets lifted into
  `_shared/config.md` as `solopreneur_repo_key`. Also see
  `write_solopreneur_config preview` callsite.
- `plugins/solopreneur/skills/todos-cleanup/SKILL.md` — see
  `write_solopreneur_config todos` callsite. This caller must switch to the
  new per-repo helper.
- `plugins/solopreneur/skills/greenlight/SKILL.md` — see `read_solopreneur_config
  greenlight` and `write_solopreneur_config greenlight` callsites. No caller
  change needed (these are user-global preferences); only the inlined helper
  block should sync.
- `plugins/solopreneur/skills/merge-pr/SKILL.md` — see `read_solopreneur_config
  todos` / `plans` callsites. No caller change, only inlined block sync.
- `plugins/solopreneur/skills/worktree-handoff/SKILL.md` — same as merge-pr.
- `plugins/solopreneur/skills/todos-babysit/SKILL.md` — reads `todos` and
  `discord`. No caller change, only inlined block sync.
- `plugins/solopreneur/skills/todos-review/SKILL.md` — references the helpers
  via prose ("see /todos-cleanup Config Discovery for the full setup"), no
  inlined block. Skim and update any wording that becomes incorrect.
- `docs/solopreneur/plans/2026-05-20-refactor-per-repo-config.md` — full
  handoff context including non-obvious decision points (e.g. why
  todos-cleanup's write must be per-repo, not global).
- `CLAUDE.md` (repo root) — for the new "Config layering" section's tone and
  format. Keep it short.

## Files to Create/Modify

- `plugins/solopreneur/skills/_shared/config.md` — **rewrite**. Define
  `solopreneur_repo_key`, `read_solopreneur_config` (with three-layer lookup
  including legacy fallback), `write_solopreneur_config` (writes
  `default.<key>`), `write_solopreneur_repo_config` (writes
  `repos[<repo-key>].<key>`). Update prose to describe the new schema,
  cascade order, when to use global vs repo write, and include a small
  migration example for the user's existing top-level config.

- `plugins/solopreneur/skills/greenlight/SKILL.md` — replace the inlined
  helper block with the new version. Caller code unchanged.

- `plugins/solopreneur/skills/merge-pr/SKILL.md` — replace the inlined helper
  block. Caller unchanged.

- `plugins/solopreneur/skills/preview/SKILL.md` — replace the inlined helper
  block. Switch `write_solopreneur_config preview "$MERGED"` to
  `write_solopreneur_repo_config preview '{ "path": "<chosen>" }'` (single
  path per repo now lives at `repos[<repo-key>].preview.path`). Replace the
  preview-local repo-key normalization with calls to the shared
  `solopreneur_repo_key`. Update surrounding prose so the schema doc matches
  the new shape (`repos[<repo-key>].preview.path` instead of
  `preview.paths.<repo-key>`). For **read-side backward compat**, the legacy
  `preview.paths.<repo-key>` lookup in older config files should still be
  honored by `read_solopreneur_config preview` via the legacy-fallback
  layer.

- `plugins/solopreneur/skills/todos-babysit/SKILL.md` — replace inlined block.
  Caller unchanged.

- `plugins/solopreneur/skills/todos-cleanup/SKILL.md` — replace inlined block.
  Switch `write_solopreneur_config todos '{...}'` to
  `write_solopreneur_repo_config todos '{...}'`. Rationale: the skill discovers
  paths via `find . -maxdepth 3` and saves them as repo-relative; saving these
  relative paths to a global key is semantically broken. Per-repo write
  anchors them to a specific repo.

- `plugins/solopreneur/skills/worktree-handoff/SKILL.md` — replace inlined
  block. Caller unchanged.

- `plugins/solopreneur/skills/todos-review/SKILL.md` — skim for wording
  that became stale. Most likely no change needed.

- `CLAUDE.md` (repo root) — add a short "Config layering" section near the
  top, describing the four-precedence cascade with one example.

## Acceptance Criteria

- [ ] Standalone helper test (write a short bash script under `/tmp/`,
  source the new helper block, verify all of these in one run):
  - `repos[<key>].<feature>` lookup returns the per-repo value when present
  - falls through to `default.<feature>` when per-repo absent
  - falls through to legacy top-level `<feature>` when both absent
  - returns empty when no layer has the key
  - `write_solopreneur_config <key> <expr>` lands under `.default[<key>]`
  - `write_solopreneur_repo_config <key> <expr>` lands under `.repos[<key>][<feature>]`
  - both writes preserve unrelated sibling keys (atomic merge)
  - `solopreneur_repo_key` normalizes `https://github.com/x/y.git`,
    `git@github.com:x/y.git`, and a `no-origin` git repo correctly

- [ ] Backward-compatibility smoke test against the user's *actual* current
  config (READ ONLY, do not write):
  - `read_solopreneur_config greenlight` → returns same value as before this
    refactor (currently `{ "fallback_order": [...] }` at top level)
  - `read_solopreneur_config todos` → returns same value (currently a top-level
    `{ "backlog": "...", ... }`)
  - `read_solopreneur_config preview` → returns same value (currently
    `{ "paths": { ... } }`)
  Use `jq -e .` to validate JSON before comparison; record the expected
  values before the refactor commits so the comparison is deterministic.

- [ ] All 6 inlined helper blocks across the listed skills must be
  byte-identical to the source block in `_shared/config.md`. Verify with
  `diff <(sed -n '/^# --- solopreneur config helpers/,/^# --- end solopreneur config helpers/p' <source>) <(sed -n '/^# --- solopreneur config helpers/,/^# --- end solopreneur config helpers/p' <skill>)`.

- [ ] The PR passes `/greenlight` (internal review + Gemini/Codex external
  review until clean).

## Notes

- This refactor sits inside the `solopreneur` plugin and is reviewed by
  Phase 1 + Phase 3 reviewers in `/greenlight`. The reviewers will likely
  pick at: regex correctness in URL normalization (`.git` suffix only at end,
  not anywhere; `git@host:` only at start), jq invocations not clobbering
  siblings, the legacy-fallback edge case where `default` is present but
  empty (`null` vs `{}` semantics).

- The user's actual `~/.claude/solopreneur.json` currently uses the old flat
  schema. Do not write a migrated version — leave migration to the user
  (legacy fallback covers them).

- The 6 inlined helper blocks duplicate code by design (this plugin ships
  via the marketplace; skills must be self-contained at install time).
  Don't try to factor them out — sync them instead.

- `_shared/config.md` is the source of truth; copy its helper block
  verbatim into the 6 SKILL.md files using the `# --- solopreneur config
  helpers (inlined from _shared/config.md) ---` / `# --- end solopreneur
  config helpers ---` markers as the boundary.

- The branch `refactor/per-repo-config` already exists with a handoff plan
  file committed at `docs/solopreneur/plans/2026-05-20-refactor-per-repo-config.md`.
  Continue working on that branch — do NOT rename it.

- The handoff plan file lists "Items to Fix / Implement" — mark them off as
  you proceed for traceability, but don't be precious about exact wording.
  The spec (this file) is authoritative.

- PR title: `refactor: per-repo config layering for solopreneur skills`
- PR body should reference `docs/loops/2026-05-20_per-repo-config/pr1-per-repo-config.md`
  as the spec.
