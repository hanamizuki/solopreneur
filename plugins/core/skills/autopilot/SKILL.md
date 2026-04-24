---
name: autopilot
description: |
  Multi-PR orchestration planner. Reads a task file, discusses PR splitting
  strategy with the user, produces plan + spec files, and schedules automatic
  execution. Use when the user wants to break a large feature into multiple PRs
  and have them implemented, reviewed, and merged automatically. Triggers:
  "autopilot", "orchestrate", "batch implement", "split into PRs and run",
  or when the user provides a todo/spec and wants unattended multi-PR execution.
---

# Autopilot

Planning phase for multi-PR automated orchestration. Reads a task file, discusses
splitting strategy with the user, produces plan + spec files, and schedules execution.

This skill only handles **planning + scheduling**. Actual execution is handled by
the Orchestrator prompt triggered via schedule (see `references/orchestrator.md`).

## Flow Overview

```
User provides todo file
  ↓
Step 0: Verify dependency skills are available
Step 1: Understand the task
Step 2: Split into PRs + build dependency graph
Step 3: Write plan.yaml + spec files
Step 4: User confirmation
Step 5: Schedule (CronCreate)
```

## Step 0: Verify Dependency Skills

Before proceeding, confirm that Phase 2 skills are available and invocable.

**Required skills** (all must be present):
- `/greenlight` — Automated PR review loop
- `/merge-pr` — PR merge workflow
- `/preflight` — Pre-implementation best practice review (called by PR subagent after planning)

Verification: check if each skill appears in the current available skills list
(system-reminder). If any required skill is missing, stop and tell the user
what needs to be installed.

## Step 1: Understand the Task

**Input**: File path provided by the user (typically in `todos/backlog/` or `todos/doing/`)

1. Read the todo file
2. Read related codebase context (architecture docs, specs, existing code)
3. Summarize in one paragraph: "What this task does, which modules are affected,
   what the expected output is"
4. Confirm understanding is correct before proceeding to Step 2

If the todo lacks specificity (missing technical details, no clear acceptance criteria),
work with the user to fill in gaps before continuing.

## Step 2: Split into PRs + Build Dependency Graph

Based on the task content, propose a PR splitting strategy:

1. **Splitting principles**:
   - Each PR should touch non-overlapping files where possible (enables parallelism)
   - Import dependencies require sequential ordering
   - Tests go in the same PR as their implementation
   - Documentation updates go in the final PR

2. **For each PR, list**:
   - Short title
   - Files to create/modify (paths)
   - Dependencies on other PRs
   - Required subagent type (python-dev / nextjs-dev / ios-dev / android-dev / llm-dev)

3. **Validate the dependency graph**:
   - For PRs declared parallel: confirm file paths don't overlap
   - For dependent PRs: confirm the dependency actually creates the required modules
   - Check for circular dependencies

4. **Present the dependency graph** for user confirmation:
   ```
   PR1 (models) ──→ PR3 (router, depends on PR1)
   PR2 (worker) ──→ PR4 (docs, depends on all)
        ↑
   Can run parallel with PR1
   ```

Proceed to Step 3 after user confirms.

## Step 3: Write plan.yaml + Spec Files

Create files under `docs/loops/<today>_<short-name>/`:

```
docs/loops/2026-03-29_mining-queries/
  ├── plan.yaml
  ├── state.json
  ├── pr1-models.md
  ├── pr2-worker.md
  └── pr3-router.md
```

### plan.yaml

Read `references/schemas.md` for the full plan.yaml schema. Key fields:

```yaml
name: "Short name"
source_todo: "todos/doing/xxx.md"
prs:
  - id: pr1
    branch: feature/xxx-pr1
    title: "feat(scope): description"
    type: code          # code | docs
    subagent: python-dev
    depends_on: []
    spec: pr1-models.md
```

### Spec Files

One .md file per PR. Format:

```markdown
# PR Title

## Requirements
- What to do (functional description, not pseudo code)
- Constraints (e.g., no dependency on FooService, all methods sync)

## Files to Read
- path/to/reference1.py (understand existing structure)
- path/to/reference2.py (reference this pattern)

## Files to Create/Modify
- path/to/new_file.py — description
- path/to/existing_file.py — what to modify

## Acceptance Criteria
- [ ] Test command: `cd xxx && uv run pytest tests/test_xxx.py -v`
- [ ] Specific verifiable condition 1
- [ ] Specific verifiable condition 2

## Notes
- Technical decision reminders (if any)
- Known pitfalls (if any)
```

Specs describe **what to do + how to verify completion**, not pseudo code.
Let the implementation subagent decide how to write the code.

### state.json

Initial state:

```json
{
  "status": "pending",
  "plan_dir": "docs/loops/2026-03-29_mining-queries",
  "prs": {
    "pr1": { "number": null, "status": "pending", "worktree": null },
    "pr2": { "number": null, "status": "pending", "worktree": null }
  }
}
```

## Step 4: User Confirmation

Present the final plan + preflight results for user confirmation:

```
Plan: 4 PRs
  PR1 (models) + PR2 (worker) → parallel
  PR3 (router) → waits for PR1
  PR4 (docs) → waits for all

Preflight: all passed ✅

Schedule for automatic execution? Tell me when you'd like it to run.
```

## Step 5: Schedule

1. Ask the user for the desired execution time
2. Read `references/orchestrator.md` for the CronCreate prompt template
3. Fill the plan path into the template
4. Create a one-time schedule with CronCreate

```python
CronCreate(
  cron="<user-specified time>",
  recurring=False,
  prompt="<orchestrator.md template, with plan_dir path filled in>"
)
```

5. Remind the user:
   - The schedule is session-only — Claude Code must remain open
   - If the session is interrupted, the orchestrator prompt can be pasted manually to resume (state.json tracks progress)
   - No manual intervention needed during execution (unless blocked)

## Important Notes

- This skill is interactive — each step requires user confirmation before proceeding
- Todos have typically already been through eng-review; no need to re-evaluate architecture direction, only confirm the PR split is reasonable
- Spec file quality directly determines execution success rate — better to spend extra time writing clearly
- If the task only needs 1 PR (no splitting needed), suggest the user implement directly without this skill
