<!--
Plan-Branch: feature/autopilot-single-pr-mode
-->

## Final Progress (merged 2026-05-10, branch: feature/autopilot-single-pr-mode)

### Problem Background
`/autopilot` is multi-PR only today. The closing line of `plugins/solopreneur/skills/autopilot/SKILL.md` (line 211) says:

> If the task only needs 1 PR (no splitting needed), suggest the user implement directly without this skill.

This pushes single-PR work back to the user, who then has to manually orchestrate the same lifecycle that `/autopilot` already automates: open a worktree, run `/preflight`, implement, push, create PR, run `/greenlight`, wait for CI, run `/merge-pr`. The user wants `/autopilot` to handle single-PR tasks too — same end-to-end flow, minus the parts that only matter for multiple PRs (dependency graph, parallel safety, batch execution loop, multi-entry state).

### Root Cause
SKILL.md is structured around the multi-PR shape: Step 2 always wants a dependency graph, Step 3 always writes `plan.yaml` + `state.json`, Step 5 always schedules via CronCreate. Single-PR is treated as an out-of-band "go do it yourself" case rather than a first-class branch.

### Items to Fix / Implement

Brainstorming + spec already done. Spec lives at `docs/spec/2026-05-09-autopilot-single-pr-mode.md` (read it first — has the full design including detection, artifact rules, inline-dispatch flow, completion report format, failure matrix).

Implementation lives entirely in `plugins/solopreneur/skills/autopilot/SKILL.md`:

- [ ] Step 2: add the 1-PR branch — descriptor format (title / branch / files / subagent / type), drop dependency graph / parallel safety / batch loop. Allow flipping back to multi-PR if user pushes back.
- [ ] Step 3: artifact table by mode. Single-PR + run-now writes only `pr1-<short>.md`. Single-PR + schedule writes `plan.yaml` (1 entry) + `state.json` + `pr1-<short>.md`. Multi-PR unchanged. Spec naming uses `pr1-<short>.md` regardless of mode.
- [ ] Step 4: single-PR confirmation block with run-now / schedule choice. Include the "10-30 minutes, session occupied" notice for run-now.
- [ ] Step 5: inline-dispatch path for run-now (read `pr-subagent-template.md`, assemble prompt with spec content, dispatch Agent + `isolation:"worktree"`, wait, print completion report). Schedule path unchanged.
- [ ] Remove the closing line on SKILL.md:211.
- [ ] Step 3 write-ordering rule: in single-PR mode, write the spec only **after** the user picks run-now or schedule (avoids half-written `plan.yaml`/`state.json` if user cancels).
- [ ] `references/schemas.md`: tiny note that `prs[]` may legitimately have length 1 in single-PR scheduled mode.

What does **not** change:
- `references/orchestrator.md` — handles N=1 by degenerating to single-iteration loop.
- `references/pr-subagent-template.md` — already covers Plan Mode → preflight → implement → PR → greenlight → CI → merge-pr → cleanup → result JSON. The "full flow runs" guarantee depends entirely on this template, so leave it alone.

### Key Files

| path | description |
|------|-------------|
| `docs/spec/2026-05-09-autopilot-single-pr-mode.md` | Full design spec — read this first |
| `plugins/solopreneur/skills/autopilot/SKILL.md` | Main edit target (Steps 2/3/4/5 + remove line 211) |
| `plugins/solopreneur/skills/autopilot/references/orchestrator.md` | Reference only — DO NOT modify |
| `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md` | Reference only — DO NOT modify |
| `plugins/solopreneur/skills/autopilot/references/schemas.md` | Tiny note on `prs[]` length=1 case |

### Current Progress
Brainstorming complete. Spec written and self-reviewed (two fixes applied: detection-trigger explicitness, session-crash recovery honesty). Spec was committed alongside this handoff plan as the first commit on this branch. Implementation has not started.

Next session: read the spec, then write the implementation plan via `superpowers:writing-plans` (or skip directly to implementation if spec is clear enough).
