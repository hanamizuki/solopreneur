# refactor(solopreneur): consolidate spec/plan review into /plan-review

## Requirements

Rename `tech-vetting` to `plan-review`, expand it into a three-stage skill with a
shared resolution phase, retire `second-opinion`, and update every reference.

**The authoritative design is `todos/backlog/2026-07-27_plan-review-consolidation.md`.
Read it first — it carries the full rationale, the exact line-level change inventory,
and the decisions that were already litigated (including two explicitly rejected
alternatives). Do not re-open those decisions.**

Structural contract for the new `plan-review/SKILL.md`:

1. **Three stages, none of which write files.** Stage 1 technical vetting (existing
   `tech-vetting` content: stack detection → context7 → platform expert subagent),
   Stage 2 lean check (new — ponytail tag system applied to a plan), Stage 3 outside
   opinion (from `second-opinion`: Codex Path A, subagent Path B fallback).
2. **A shared resolution phase after all three stages**: collect findings → user
   adjudicates each one (adopt / skip / discuss) → write back to the plan. All three
   stages read the *original* plan; nothing is written until resolution.
3. **Two modes**, dispatched by unordered keyword token (no `mode=` prefix, matching
   `greenlight`'s existing `external` / `unattended` / `size=` handling):
   - `/plan-review [<file>]` — all three stages, then resolution
   - `/plan-review [<file>] internal` — stages 1+2 only, **report findings only, no
     adjudication, no write-back**
4. **`<file>` is optional.** When absent, take the plan from conversation context —
   this preserves `tech-vetting/SKILL.md:21-25`'s three input sources. This is a hard
   requirement: both machine callers pass an unsaved in-conversation plan.
5. **Cost confirmation before Stage 3** — print a one-line confirmation (~240K tokens)
   before invoking the external reviewer.
6. Stage 3's external reviewer must keep the existing no-write constraints
   (`second-opinion/SKILL.md:92`, `:134`) and run read-only.

Stage 2's specification (tags, location format, net-effect handling, boundary, and the
stage-1 collision rule) is fully defined in the design doc's 〈段 2 規格〉 section —
follow it exactly rather than inventing one.

Constraints:

- Use `git mv` for the directory rename so history is preserved.
- The `description` frontmatter must state all three accepted document types (spec /
  implementation plan / design doc) and must not reclaim the generic triggers that
  caused the collision this PR exists to fix.
- `todos-review/SKILL.md` gets a **description change only** — do not touch its flow,
  config discovery, or step structure.
- This repo is open source: all skill content, comments, commit messages, and PR
  text in English.
- Do not bump any `plugin.json` version — versioning is `/release`'s job
  (`CLAUDE.md` "What does NOT bump").

## Files to Read

- `todos/backlog/2026-07-27_plan-review-consolidation.md` (the design — read first)
- `plugins/solopreneur/skills/tech-vetting/SKILL.md` (stage 1 source)
- `plugins/solopreneur/skills/second-opinion/SKILL.md` (stage 3 + resolution source)
- `plugins/solopreneur/skills/greenlight/SKILL.md` lines 44-48, 810-823 (keyword token
  parsing precedent), line 337 (the stage-1/stage-2 collision rule to reuse)
- `plugins/solopreneur/skills/todos-review/SKILL.md` (boundary to draw)
- `/Users/Hana/Agents/claude/builder/plugins/marketplaces/ponytail/skills/ponytail-review/SKILL.md`
  (tag definitions to reuse verbatim — do not redefine them)
- `MIGRATION.md` (format of prior rename entries)
- `scripts/validate-codex.sh` (what CI checks)

## Files to Create/Modify

- `plugins/solopreneur/skills/tech-vetting/` → `plugins/solopreneur/skills/plan-review/` — `git mv`, then rewrite `SKILL.md`
- `plugins/solopreneur/skills/second-opinion/` — delete the directory
- `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md` — lines 56-61, switch to `/plan-review internal`
- `plugins/solopreneur/skills/todos-babysit/SKILL.md` — lines 477-481 (call site) and 478, 481, 552 (headings / wording)
- `plugins/solopreneur/skills/autopilot/SKILL.md` — lines 47, 357 (skill list, lifecycle), 273, 281 ("Tech Vetting" in output templates)
- `plugins/solopreneur/skills/autopilot/references/schemas.md` — line 189
- `plugins/solopreneur/skills/todos-review/SKILL.md` — lines 4-8, description only: drop the generic spec trigger, state the boundary (todos-review = "should we build it", plan-review = "is this the right way to build it")
- `plugins/solopreneur/skills/rebuild-skill-index/SKILL.md` — line 22
- `plugins/solopreneur/skills/session-retro/SKILL.md` — line 166
- `README.md` — line 54 (delete the `/second-opinion` row), 55 (rename), 93, 95, 236-237, 305-307
- `MIGRATION.md` — add two entries: the rename, and the retirement
- `todos/backlog/2026-04-29_auto-workflow-plugin-split.md` — lines 10, 31-32
- `todos/backlog/2026-07-07_codex-dual-publish.md` — line 95

Do **not** modify `todos/done/**` or `CHANGELOG.md` — those are historical records.

## Acceptance Criteria

- [ ] `test -d plugins/solopreneur/skills/plan-review && test ! -d plugins/solopreneur/skills/tech-vetting`
- [ ] `test ! -d plugins/solopreneur/skills/second-opinion`
- [ ] `git log --follow --oneline plugins/solopreneur/skills/plan-review/SKILL.md | wc -l` returns > 1 (history survived the rename)
- [ ] `grep -q '^name: plan-review$' plugins/solopreneur/skills/plan-review/SKILL.md`
- [ ] No stale references outside archives: `grep -rn "tech-vetting\|second-opinion" --include="*.md" --include="*.json" . | grep -v "^./todos/done/" | grep -v "^./CHANGELOG.md" | grep -v "^./MIGRATION.md" | grep -v "^./docs/loops/" | grep -v "^./todos/backlog/2026-07-27_plan-review-consolidation.md"` returns no results
- [ ] `bash scripts/validate-codex.sh` exits 0
- [ ] `plan-review/SKILL.md` documents the `internal` token and states that `internal` produces findings only — no adjudication, no write-back
- [ ] `plan-review/SKILL.md` states that the file argument is optional and that the plan may come from conversation context
- [ ] `plan-review/SKILL.md` contains a cost-confirmation step before stage 3
- [ ] `plan-review/SKILL.md` reuses ponytail's five tags (`delete:`, `stdlib:`, `native:`, `yagni:`, `shrink:`) rather than defining new ones
- [ ] `MIGRATION.md` documents both the rename and the retirement
- [ ] No `plugin.json` file is modified: `git diff --name-only main | grep -c 'plugin.json'` returns 0

## Notes

- **You will be editing the very template you were dispatched from.**
  `pr-subagent-template.md` is one of the files this PR changes. Your own instructions
  were already loaded into context — editing the file on disk does not alter your
  running instructions. Complete your lifecycle as originally instructed.
- **`/tech-vetting` still works while you run.** Skills load from the installed plugin
  cache (`.../plugins/cache/solopreneur/solopreneur/0.5.35/`), not from this working
  tree. Renaming the source directory here does not remove the skill from your session.
  Invoke it under its current name when your lifecycle calls for it.
- The rename is atomic by design — this is why it is one PR and not several. A partial
  state where the directory is renamed but references still point at the old name is a
  broken commit.
- `second-opinion` has no machine callers (verified: all six repo references are docs
  or historical records), so retiring it breaks no automated path.
- No backward-compatible alias for the old names. The previous rename
  (`/preflight` → `/tech-vetting`) was a hard cut; `MIGRATION.md` carries the burden.
