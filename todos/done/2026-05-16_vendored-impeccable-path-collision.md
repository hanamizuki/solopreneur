# Vendored impeccable — hardcoded `.claude/skills/` path collision with user-installed copy

`impeccable` (vendored into the `designer` plugin) hardcodes
`.claude/skills/impeccable/scripts/...` paths in its `SKILL.md` body and
ships a `pin.mjs` that scans every harness dir. When a user has *also*
installed upstream impeccable standalone (official install is
`npx impeccable` → `.claude/skills/impeccable/`, or `~/.claude/skills/impeccable/`),
the two collide. This is a **pre-existing structural property of vendoring
this particular skill** — it exists identically on the old rev `25e6c82`
and was not introduced by the rev `4af581e2` sync (PR #31, merged
2026-05-16). The merge decision was orthogonal and is done; this todo
tracks the collision independently.

## The three collision points

1. **Skill-list duplication (cosmetic).** Standalone install surfaces as
   `impeccable` (no namespace); vendored surfaces as `designer:impeccable`.
   The `description:` frontmatter is byte-identical between the two, so the
   skill router sees two near-identical entries. Not a hard error, but the
   user sees/can invoke both.

2. **Hardcoded body-path cross-execution (the real bug).**
   `sync-vendored.sh` only rewrites the `name:` frontmatter field
   (`plugins/solopreneur/scripts/sync-vendored.sh` ~L137-152 awk), not the
   `SKILL.md` body. So vendored `SKILL.md` keeps upstream's literal
   `node .claude/skills/impeccable/scripts/load-context.mjs` and
   `pin.mjs`. Consequences when `designer:impeccable` runs that command:
   - User has **no** standalone install → path doesn't exist, command
     fails unless the agent improvises a path.
   - User **has** standalone upstream → command silently executes the
     *user's* copy (possibly a different rev than the vendored 3.1.1),
     sharing the same project `.impeccable/` state dir. Worst case: you
     think you're running vendored 3.1.1, you're not.

3. **`pin.mjs` last-writer-wins.** `pin`/`unpin` writes shortcut skills
   into every harness dir (`scripts/pin.mjs` ~L23-66:
   `.claude .cursor .gemini .codex .agents`). Standalone + vendored both
   pinning the same command overwrite the same
   `.claude/skills/<command>/SKILL.md`.

## Scope

Evaluate and pick a fix for the body-path hardcoding (point 2 is the only
functional bug; 1 and 3 follow from it). Candidate approaches to weigh:

- **Sync-time body rewrite.** Extend `sync-vendored.sh` to rewrite
  `.claude/skills/<to>/` → the plugin-relative skill path in the `SKILL.md`
  body (and any `reference/*.md` that hardcode it). Must stay idempotent
  and survive upstream re-sync. Check all vendored skills, not just
  impeccable, for the same pattern before generalizing.
- **Skill rename to avoid name collision** (addresses point 1, not 2).
- **Document the conflict** and tell users not to dual-install (cheapest,
  weakest).

Determine the blast radius first: grep every vendored skill's `SKILL.md` +
`reference/` for hardcoded `.claude/skills/` / `.codex/` / harness-dir
literals — impeccable may not be the only one.

## Deliverables

1. Blast-radius audit: which vendored skills hardcode harness-dir paths in
   non-frontmatter content.
2. Chosen fix + implementation (most likely a `sync-vendored.sh` body
   rewrite step), with a regression check that re-sync stays idempotent.
3. Verify `pin.mjs` behavior under the chosen fix (does the rewritten path
   still let pin work, or does pin need neutralizing in the vendored copy?).

## Out of scope

- The impeccable rev `4af581e2` content itself — already merged (PR #31),
  judged on its own merits.
- Versioning/release — vendored changes don't bump; goes through `/release`
  per repo `CLAUDE.md`.

## Status

Merged 2026-05-17 (PR #35). Branch: `fix/vendored-impeccable-paths`.

<!--
Plan-Branch: fix/vendored-impeccable-paths
-->

## Final Progress (merged 2026-05-17, branch: fix/vendored-impeccable-paths)

### Problem Background

See top of file for the full collision write-up. Focus of this branch: fix
collision point 2 (hardcoded `.claude/skills/impeccable/scripts/...` paths in
the vendored `SKILL.md` body + `reference/*.md`, causing silent
cross-execution against the user's standalone install if any).

Collision points 1 (cosmetic name dup) and 3 (`pin.mjs` last-writer-wins) are
out of scope for this PR — they are design conflicts, not path bugs, and need
separate decisions.

### Root Cause

`plugins/solopreneur/scripts/sync-vendored.sh` ~L137-152 rewrites only the
`name:` frontmatter field of each vendored `SKILL.md`. The body is copied
verbatim, so upstream impeccable's literal
`node .claude/skills/impeccable/scripts/*.mjs` invocations leak through into
the vendored copy. Vendored skill physically lives in the plugin install
dir (not under user cwd), so `.claude/skills/impeccable/...` resolves to
the *user's* standalone install if one exists, or fails otherwise.

### Items to Fix / Implement

- [x] Blast-radius audit: confirmed impeccable is the only vendored skill
      with this pattern (21 hits in `SKILL.md` + 5 `reference/*.md`; all 6
      taste-* skills and the other dev-plugin vendored skills are clean).
- [x] Identified the correct Claude Code variable for skill-bundled paths:
      `${CLAUDE_SKILL_DIR}` — documented to resolve correctly across
      personal / project / plugin installation levels (more skill-specific
      than `${CLAUDE_PLUGIN_ROOT}` which is per-plugin not per-skill).
- [ ] Add a body-rewrite pass to `sync-vendored.sh` alongside the existing
      frontmatter awk. For each skill in the manifest, rewrite the literal
      string `.claude/skills/<to>/` → `${CLAUDE_SKILL_DIR}/` in `SKILL.md`
      and every `reference/*.md` (and any other body file we end up
      including). Iterate the manifest entries so the rule generalizes for
      future vendored skills with the same upstream-layout assumption.
- [ ] Run `cd plugins/designer && ./scripts/sync-vendored.sh --pinned` and
      verify: (a) the 21 known impeccable paths are all rewritten, (b) no
      other unintended diff, (c) a second `--pinned` run produces zero diff
      (idempotency check).
- [ ] Commit + push, open PR.

### Key Files

| path | description |
|------|-------------|
| `plugins/solopreneur/scripts/sync-vendored.sh` | engine; add rewrite pass next to the L137-152 `name:` frontmatter awk |
| `plugins/designer/skills/_vendored/manifest.json` | source-of-truth for the `<to>` slug used by the rewrite rule |
| `plugins/designer/skills/impeccable/SKILL.md` | L34, L166 — get rewritten |
| `plugins/designer/skills/impeccable/reference/{live,polish,document,teach,critique}.md` | 19 more hits — get rewritten |
| `plugins/designer/skills/impeccable/scripts/pin.mjs` | NOT changed in this PR; pin's dual-install conflict is a separate decision |

### Out of scope (explicit)

- Skill name collision (point 1) — would change `description:` frontmatter
  or rename, not addressed here.
- `pin.mjs` last-writer-wins (point 3) — pin's design assumes standalone
  install; vendored use is a separate UX question.
- Version bump — vendored changes don't bump per repo `CLAUDE.md`; goes
  through `/release` when shipped.

### Current Progress

Audit done. Worktree + branch created. Implementation pending.
