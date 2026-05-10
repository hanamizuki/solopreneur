# Autopilot Single-PR Mode

**Status:** Design draft
**Date:** 2026-05-09
**Affected plugins:** `solopreneur`
**Affected skills:** `autopilot` (SKILL.md only — no changes to `references/orchestrator.md` or `references/pr-subagent-template.md`)

## Problem

`/autopilot` today is multi-PR only. The closing line of `SKILL.md` says:

> If the task only needs 1 PR (no splitting needed), suggest the user
> implement directly without this skill.

This pushes single-PR work back to the user, who then has to manually orchestrate the same lifecycle that `/autopilot` already automates: open a worktree, run `/preflight`, implement, push, create PR, run `/greenlight`, wait for CI, run `/merge-pr`. The full automation chain exists; the skill just refuses to expose it for the small-scope case.

The user wants `/autopilot` to handle single-PR tasks too, with the **same end-to-end flow** (preflight → worktree → implement → PR → greenlight → CI → merge), minus the parts that only matter for multiple PRs (dependency graph, parallel safety, batch execution loop, multi-entry state).

## Goals

- Single-PR tasks can run through `/autopilot` without dummy-splitting into 1 fake PR.
- The full automation flow still runs — preflight, isolated worktree, greenlight, CI gate, `/merge-pr`. None of these are skipped.
- Multi-PR flow is unchanged.
- `references/orchestrator.md` and `references/pr-subagent-template.md` do **not** need to be modified.
- Single-PR mode kicks in organically during planning — no new commands, flags, or sibling skills.

## Non-goals

- Adding a "run now" option to multi-PR mode. The user did not ask for it; CronCreate scheduling has real value when N subagents run in parallel for an unknown duration.
- Recovery for the single-PR + run-now path. If the session dies mid-execution, the user re-runs `/autopilot`. If they want crash recovery, they pick the schedule path.
- Creating new dependency-skill checks. Step 0's existing verification of `/preflight`, `/greenlight`, `/merge-pr` is sufficient — single-PR mode reuses the same `pr-subagent-template.md`, which calls all three.

## Detection: how single-PR mode is triggered

Step 2 of `/autopilot` already proposes a PR splitting strategy. Detection is the natural output of that step — there is no heuristic to specify here. Claude reads the todo, applies the same splitting principles already documented in Step 2 (non-overlapping files, import dependencies, tests with implementation), and proposes the resulting PR list. The list happens to have length 1 when the scope is contained:

- If the proposed split is **1 PR** → branch into single-PR sub-flow.
- If the proposed split is **≥2 PRs** → continue the current multi-PR flow.

The user can flip between branches at any time — if Step 2 lands on 1 PR but the user pushes back ("split it into 2"), the flow goes back to multi-PR planning. The reverse is also true.

No new flag, argument, or sibling skill. One skill, two internal branches.

## Flow changes (per-step)

### Step 0 — Verify dependency skills

Unchanged. Single-PR mode reuses `pr-subagent-template.md`, which already invokes `/preflight`, `/greenlight`, and `/merge-pr`.

### Step 1 — Understand the task

Unchanged.

### Step 2 — Plan PR(s)

When the natural split is 1 PR, output a single PR descriptor instead of a dependency graph:

```
PR
  title:    feat(scope): <summary>
  branch:   feature/<short-name>
  files:
    - path/a.py (new)
    - path/b.py (modified)
  subagent: ai-engineer
  type:     code   # code | docs

Reason: scope is contained to a single module / single purpose, no split needed.
```

What is **dropped** in single-PR mode:
- Dependency graph rendering (only one node).
- Parallel safety check (no parallelism).
- Batch loop planning (single execution).

### Step 3 — Write artifacts

Output location is `docs/loops/<YYYY-MM-DD>_<short-name>/` — same convention as multi-PR.

| Mode | Files written |
|---|---|
| Single-PR + run now | `pr1-<short>.md` only |
| Single-PR + schedule | `plan.yaml` (1 PR entry) + `state.json` + `pr1-<short>.md` |
| Multi-PR | `plan.yaml` + `state.json` + `pr1-*.md`, `pr2-*.md`, … (unchanged) |

**Spec naming**: single-PR uses `pr1-<short>.md` rather than `spec.md`. Reasons:
- Aligns with multi-PR naming — `schemas.md` needs no exception.
- If the user pivots mid-flow ("actually let's add a PR2"), the existing file doesn't need to be renamed.
- `plan.yaml`'s `spec:` field uses the same value regardless of mode.

**Spec format**: identical to the existing template in `references/schemas.md` — Requirements / Files to Read / Files to Create-or-Modify / Acceptance Criteria / Notes.

**Write ordering**: in single-PR mode, write the spec only **after** the user picks "run now" or "schedule" in Step 4. This avoids leaving half-written `plan.yaml`/`state.json` artifacts on disk if the user cancels at the confirmation gate.

### Step 4 — User confirmation

Multi-PR confirmation is unchanged.

Single-PR confirmation reads:

```
Plan: 1 PR
  feat(scope): <summary>  (subagent: ai-engineer, branch: feature/<short-name>)
  Files: path/a.py, path/b.py
  Spec: docs/loops/<YYYY-MM-DD>_<short-name>/pr1-<short>.md

Execution mode?
  (1) Run now — dispatch a worktree subagent in the current session and wait
      for it to finish. Approximately 10-30 minutes; the session is occupied
      while it runs.
  (2) Schedule — hand off to CronCreate at a specified time. Session-independent.
```

The 10-30 minute estimate is intentional. The user should know that "run now" blocks the session.

### Step 5 — Execute

| Mode | Path |
|---|---|
| Single-PR + run now | **New** inline-dispatch path (see below) |
| Single-PR + schedule | Existing CronCreate → orchestrator path. Orchestrator reads `plan.yaml` with N=1 and degenerates to a single iteration of the execution loop. **No changes to `orchestrator.md`.** |
| Multi-PR | Unchanged |

#### New: single-PR + run now (inline dispatch)

```
1. Read references/pr-subagent-template.md (unchanged template).
2. Read pr1-<short>.md (the spec just written).
3. Assemble the prompt: standard prefix + spec content + standard suffix.
4. Resolve template variables:
     {BRANCH}    = feature/<short-name>
     {TITLE}     = feat(scope): <summary>
     {PR_ID}     = pr1
     {PLAN_DIR}  = docs/loops/<YYYY-MM-DD>_<short-name>
     {SPEC_FILE} = pr1-<short>.md
5. Dispatch the Agent tool:
     subagent_type = <subagent declared in Step 2>
     isolation     = "worktree"
     prompt        = the assembled prompt
6. Wait for the subagent's result JSON.
7. Print a completion report inline (see "Completion report" below).
```

Worktree branch renaming is handled inside the subagent prompt (the standard prefix in `pr-subagent-template.md` issues `git branch -m {BRANCH}`). This is identical to multi-PR mode.

**The full lifecycle still runs**: Plan Mode → `/preflight` → implement + test → commit + push + `gh pr create` → `/greenlight` → CI poll → `/merge-pr` → cleanup → result JSON. All defined by the unchanged `pr-subagent-template.md`.

## Failure / interruption matrix

| Scenario | Multi-PR / Single-PR + schedule | Single-PR + run now |
|---|---|---|
| Subagent self-recovery (test fail ×3, review loop) | Defined in `pr-subagent-template.md` | Same |
| Session crash mid-execution | `state.json` persists; orchestrator resumes via re-trigger | **No `state.json`. Manual cleanup required**: check `git worktree list` and the GitHub PR list, finish or close whatever the subagent left behind, then re-run `/autopilot` for a fresh attempt. |
| Subagent reports `blocked` | Orchestrator marks blocked, continues other PRs | Inline error report, end |

The "no recovery" tradeoff for run-now mode is intentional. If the user wanted recovery, they would have picked schedule.

## Completion report (single-PR + run now)

On success:

```
Autopilot Single-PR done
═════════════════════════
✅ #91 feat(scope): <summary> — 2 rounds, fixed 1, pushed back 0
   merged into main
   spec: docs/loops/<YYYY-MM-DD>_<short-name>/pr1-<short>.md
```

On block:

```
❌ blocked: feat(scope): <summary>
   reason: <error from subagent>
   spec: docs/loops/<YYYY-MM-DD>_<short-name>/pr1-<short>.md
   recovery: fix manually and resume, or re-run /autopilot
```

## Files affected

- `plugins/solopreneur/skills/autopilot/SKILL.md` — main edits.
  - Remove the closing line about implementing directly without the skill.
  - Step 2: add the 1-PR branch (descriptor format, what to drop).
  - Step 3: artifact table by mode, spec naming convention, write-ordering rule.
  - Step 4: single-PR confirmation block with run-now / schedule choice.
  - Step 5: inline-dispatch path for run-now; reference the existing CronCreate path for schedule.
- `plugins/solopreneur/skills/autopilot/references/orchestrator.md` — **no change**.
- `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md` — **no change**.
- `plugins/solopreneur/skills/autopilot/references/schemas.md` — minor: note that `prs[]` may have length 1 in single-PR scheduled mode (it already supports this; just make it explicit).

## Versioning

Per `CLAUDE.md`'s release rules, this change does not bump versions on commit. When the next `/release` runs, the `solopreneur` plugin's accumulated changes (including this one) get a `patch` bump unless the user explicitly marks it a milestone.
