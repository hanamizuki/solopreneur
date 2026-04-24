# Autopilot Orchestrator

Execution logic triggered by CronCreate. This document serves as the CronCreate prompt
template — the `/autopilot` skill's Step 5 fills in the plan path before use.

## CronCreate Prompt Template

Below is the complete CronCreate prompt. `{PLAN_DIR}` is replaced by the setup skill
with the actual path.

---

You are the Autopilot Orchestrator. Execute a multi-PR orchestration plan automatically.

**Plan directory**: `{PLAN_DIR}`

Read `{PLAN_DIR}/plan.yaml` and `{PLAN_DIR}/state.json`, then follow the flow below.

### Phase 0: Startup

1. Read plan.yaml (PR definitions + dependency graph)
2. Read state.json (current progress)
3. `git fetch origin && git pull origin main --ff-only` (ensure main is up to date)
4. Clean up leftover worktrees: `git worktree list` → remove any not belonging to active PRs
5. Update state.json: `status` → `in_progress`, `started_at` → now

### Phase 1: Execution Loop

Repeat the following steps until all PRs are merged or blocked:

**Step 1: Find the next batch of executable PRs**

From state.json, find PRs with `status == "pending"` whose `depends_on` are all `"merged"`.

- Executable PRs found → proceed to Step 2
- No executable PRs but `pending` PRs remain → blocked by a failed PR, mark as `skipped`
- All PRs are `merged` or `blocked`/`skipped` → proceed to Phase 2

**Before dispatching, verify parallel safety**: for each pair of parallel PRs, confirm
file paths don't overlap:
- Read each spec's "Files to Create/Modify" section
- If paths overlap → don't parallelize, run sequentially instead

**Step 2: Dispatch PR subagents in parallel**

For each executable PR:

1. Read `subagent` type and `spec` filename from plan.yaml
2. Read the full content of `{PLAN_DIR}/{spec_file}`
3. Read `references/pr-subagent-template.md` for the prompt template
4. Assemble prompt: standard prefix + spec content + standard suffix
5. Dispatch Agent (subagent_type from plan, **use `isolation: "worktree"`** for isolation)
6. Update state.json: PR status → `implementing`

**Important**: When using `isolation: "worktree"`, the worktree branch name is auto-generated
(`worktree-agent-xxx`). The subagent's first step is `git branch -m {BRANCH}` to rename it
to the correct branch name (see pr-subagent-template.md).

**Wait for all subagents to complete.**

**Step 3: Process results**

For each completed subagent:

- **Reports success**:
  - Update state.json: status → `merged`, fill in `number` and `review_summary`
  - `git pull origin main --ff-only` (absorb the just-merged changes)

- **Reports failure**:
  - `retry_count < 2` → update state.json: status → `pending`, retry_count += 1, return to Step 1
  - `retry_count >= 2` → update state.json: status → `blocked`, fill in `error`
  - Blocked PRs won't be retried, but PRs that don't depend on them can continue

**Return to Step 1.**

### Phase 2: Wrap-up

1. Update state.json: `status` → `done` (or `blocked` if any PR is blocked), `completed_at` → now

2. Output completion report:
   ```
   Autopilot Completion Report
   ═══════════════════════════
   Plan: {plan.name}
   Status: {done/blocked}

   PR Results:
   ✅ #81 feat(core): models — 2 rounds, fixed 1, pushed back 0
   ✅ #82 feat(core): worker — 3 rounds, fixed 3, pushed back 1
   ❌ #83 feat(core): router — blocked: test_auth_required keeps failing
   ⏭️ #84 docs — skipped (depends on #83)
   ```

3. If plan.yaml has `source_todo`, update the todo file's progress

### Failure Handling

| Failure Type | Resolution |
|-------------|------------|
| Worktree branch name mismatch | subagent renames on entry via git branch -m; if rename fails → blocked |
| Test failure (within subagent) | subagent self-fixes up to 3 times |
| Test failure (after retries) | blocked |
| PR creation failure | retry once |
| Review loop exceeds 3 rounds | subagent escalates, marks blocked |
| CI failure | read CI log, dispatch fix subagent |
| Merge conflict | auto rebase + force push |
| GitHub API unavailable | wait 60s and retry, blocked after 2 attempts |

### state.json Write Rules

- Write immediately on every PR status change (overwrite entire file using Write tool)
- Ensure JSON format is valid (don't use Edit tool)
- This is the Orchestrator's sole source for progress recovery

---

## Important Notes

- This prompt runs in a new CronCreate session with no context from the previous session
- All information is read from plan.yaml + state.json + spec files
- The Orchestrator does not write code directly — it only manages scheduling and state tracking
- PR subagents have full responsibility for implementation + review + merge
- Session-only CronCreate: if the session is interrupted, the user can paste this prompt manually to resume (state.json remembers progress)
