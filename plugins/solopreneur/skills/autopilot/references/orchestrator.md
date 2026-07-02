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

**Before dispatching, resolve each PR's file list and verify parallel safety.**
Every executable PR needs a create/modify path list:
- If the PR has a `files` field in plan.yaml → use it directly.
- If not → derive it by reading the spec's "Files to Create/Modify" section
  (today's method).

How the overlap check runs depends on the dispatch branch (below):
- **Workflow mode (Step 2a)**: pass every PR's file list in `args.prs[].files`.
  The wave-workflow script runs the pairwise overlap check itself and refuses
  the whole wave before dispatching anything if any two PRs share a path — no
  manual check here.
- **Fallback mode (Step 2b)**: check manually — for each pair of parallel PRs,
  if paths overlap, don't parallelize; run them in separate sequential waves.

**Step 2: Dispatch PR subagents**

First, for every executable PR, assemble its prompt — this prep is identical in
both branches:

1. Read `subagent` type and `spec` filename from plan.yaml
2. Read the full content of `{PLAN_DIR}/{spec_file}`
3. Read `references/pr-subagent-template.md` for the prompt template
4. Assemble prompt: standard prefix + spec content + standard suffix

Then branch on **Workflow tool availability** — check whether a `Workflow` tool
is present in this session's available tools.

#### Step 2a: Workflow tool is available (preferred)

Dispatch the whole wave through ONE Workflow call:

1. Read `references/wave-workflow.md` for the script + args contract.
2. Build `args`: `prs` is one entry per executable PR —
   `{ id, branch, title, subagent, prompt, files }`, where `prompt` is the
   assembled prompt from above, `subagent` is the plan's subagent type, and
   `files` is the PR's resolved file list (above). Set `max_retries: 2`.
3. Update state.json: every dispatched PR status → `implementing`.
4. Invoke the `Workflow` tool with the wave-workflow script and `args`. The
   script runs the file-overlap check, dispatches every PR via `parallel()`
   with a per-PR retry loop (up to `max_retries` extra attempts), enforces
   `RESULT_SCHEMA` on each subagent's output, and returns `{ results: [...] }`.
5. If the workflow instead returns `{ error: "file-overlap", pairs: [...] }`,
   no agent ran — split the overlapping PRs into separate sequential waves (or
   fall back to Step 2b for this wave), then retry.
6. Otherwise proceed to Step 3 with the returned `results`.

The per-PR retry loop and the overlap check are handled inside the script; the
orchestrator does not manually wait on or re-dispatch individual PRs here.

> **Workflow scripts have NO filesystem or git access.** The wave-workflow
> script only spawns agents and shapes their results — it cannot touch
> `state.json` or run `git`. So `state.json` writes (Step 2a.3 before the call,
> Step 3 after) and the between-wave `git pull origin main --ff-only` remain the
> orchestrator's responsibility. Crash recovery therefore stays at **wave
> granularity**: `state.json` is the sole progress source, so a crash mid-wave
> resumes by re-running the whole wave from the last persisted state. (A wave
> re-run may re-dispatch a PR that already opened; Phase 0 worktree cleanup and
> the subagent's branch-rename step mitigate this, but full idempotency is a
> future improvement.)

#### Step 2b: Workflow tool is unavailable (fallback — today's flow)

For each executable PR:

5. Dispatch Agent (subagent_type from plan, **use `isolation: "worktree"`** for isolation)
6. Update state.json: PR status → `implementing`

**Important**: When using `isolation: "worktree"`, the worktree branch name is auto-generated
(`worktree-agent-xxx`). The subagent's first step is `git branch -m {BRANCH}` to rename it
to the correct branch name (see pr-subagent-template.md).

**Wait for all subagents to complete.**

**Step 3: Process results**

The wave was dispatched by either Step 2a (Workflow) or Step 2b (fallback
Agent) — process results accordingly.

#### Workflow mode (dispatched via Step 2a)

Consume the `results` array returned by the Workflow call. For each
`{ pr_id, status, github_number, review_summary, error, attempts }`:

- **`status == "success"`** → update state.json: status → `merged`, fill in
  `number` (from `github_number`) and `review_summary`.
- **any other `status`** (`failed` / `blocked`, or a null-synthesized failure)
  → this is FINAL for the wave — the script already retried up to `max_retries`.
  Update state.json: status → `blocked`, `retry_count` → `max(attempts - 1, 0)`,
  fill in `error`, and fill in `number` from `github_number` (non-null when the
  PR was opened before it got stuck — don't drop it). Do NOT re-queue to
  `pending` (in-script retries are exhausted). Blocked PRs won't be retried, but
  PRs that don't depend on them can continue.

After applying every result, run `git pull origin main --ff-only` **once** to
absorb all merges from this wave, then return to Step 1.

#### Fallback mode (dispatched via Step 2b)

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
