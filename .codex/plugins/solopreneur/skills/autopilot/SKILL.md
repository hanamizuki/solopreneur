---
name: autopilot
description: |
  PR orchestration planner. Reads a task file, discusses PR splitting strategy
  with the user, produces plan + spec files, and either dispatches a worktree
  subagent in the current session (single PR, run now) or schedules execution
  via cron (multi-PR, or single-PR scheduled). Use when the user wants a task
  implemented, reviewed, and merged automatically — whether the scope fits in
  one PR or needs to be split. Triggers: "autopilot", "orchestrate", "batch
  implement", "split into PRs and run", or when the user provides a todo/spec
  and wants unattended PR execution.
---

# Autopilot

## Host profile

Before any other action, check whether `CODEX_THREAD_ID` is set and keep that
host profile for the whole run:

- **Claude Code:** the existing single-PR, multi-PR, run-now, and scheduled
  contracts below remain unchanged.
- **Codex V1:** only a single PR executed now from an up-to-date `main` branch
  is supported. If the natural plan needs multiple PRs, the caller is not on
  `main`, or the user asks to schedule the run, stop before writing artifacts,
  creating a worktree or PR, or spawning a child. Explain that stacked PRs,
  multi-PR waves, and scheduling are not shipped on Codex yet. Never emulate
  Claude's Workflow, Agent isolation, or Cron tools.

Planning phase for automated PR orchestration. Reads a task file, discusses splitting
strategy with the user, produces plan + spec files, and then either schedules execution
or dispatches inline (single-PR, run now).

This skill handles **planning** plus the **single-PR + run-now** dispatch. The
**scheduled** path (single-PR or multi-PR) hands off to the Orchestrator prompt
triggered via cron (see `references/orchestrator.md`).

## Flow Overview

```text
User provides todo file
  ↓
Step 0: Verify dependency skills are available
Step 1: Understand the task
Step 2: Plan PR(s) — natural split is 1 PR (single-PR branch) or N PRs (multi-PR branch)
Step 3: Write artifacts (varies by mode — see Step 3 table)
Step 4: User confirmation (single-PR adds a run-now / schedule choice)
Step 5: Execute
         ├─ Single-PR + run now  → inline-dispatch a worktree subagent in this session
         ├─ Single-PR + schedule → CronCreate → orchestrator (loop with N=1)
         └─ Multi-PR             → CronCreate → orchestrator
```

## Step 0: Verify Dependency Skills

Before proceeding, confirm that the execution-phase skills are available.

**Co-packaged in `solopreneur`** (always present alongside this skill —
no runtime check needed):
- `/greenlight` — Automated PR review loop
- `/plan-review` — Pre-implementation plan review (called by PR subagent
  after planning, in `internal` mode)

**External dependency** (must be verified at runtime):
- `/merge-pr` — PR merge workflow

Verification: check if `/merge-pr` appears in the current available skills
list (system-reminder). If it's missing, stop and tell the user what needs
to be installed.

On Codex, all three dependencies are part of the filtered publication. Verify
that `/greenlight`, `/plan-review`, and `/merge-pr` all appear in the current
available-skills list; if any is absent, stop before side effects and report the
missing skill. Do not substitute an unpublished sibling skill.

## Step 1: Understand the Task

**Input**: File path provided by the user (typically in `todos/backlog/` or `todos/doing/`)

1. Read the todo file
2. Read related codebase context (architecture docs, specs, existing code)
3. Summarize in one paragraph: "What this task does, which modules are affected,
   what the expected output is"
4. Confirm understanding is correct before proceeding to Step 2

If the todo lacks specificity (missing technical details, no clear acceptance criteria),
work with the user to fill in gaps before continuing.

## Step 2: Plan PR(s)

Based on the task content, propose a PR splitting strategy. The same principles
apply whether the result is 1 PR or N PRs:

1. **Splitting principles**:
   - Each PR should touch non-overlapping files where possible (enables parallelism)
   - Import dependencies require sequential ordering
   - Tests go in the same PR as their implementation
   - Documentation updates go in the final PR

2. **The resulting PR count branches the rest of the flow**:
   - Natural split is **1 PR** → single-PR sub-flow (descriptor below; no
     dependency graph, no parallel-safety check, no batch loop)
   - Natural split is **≥2 PRs** → multi-PR sub-flow (full dependency graph
     + parallel-safety validation)

The user can flip between branches at any time. If the natural split is 1 PR
but the user pushes back ("split it into 2"), restart Step 2 in multi-PR mode.
The reverse is also true.

### Single-PR descriptor (split = 1 PR)

Output a single PR descriptor instead of a graph:

```text
PR
  title:    feat(scope): <summary>
  branch:   feature/<short-name>
  files:
    - path/a.py (new)
    - path/b.py (modified)
  subagent: ai-engineer
  type:     code   # code | docs
  size:     m      # optional — S/M/L review hint for /greenlight (upward-only); omit to auto-classify

Reason: scope is contained to a single module / single purpose, no split needed.
```

`subagent` accepts the same values as multi-PR (see the multi-PR list below:
`ios-dev / android-dev / ai-engineer / neo4j-dev / marketer / designer`).

What is **dropped** in single-PR mode: dependency graph rendering, parallel
safety check, batch loop planning. Proceed to Step 3.

### Multi-PR descriptor (split ≥ 2 PRs)

For each PR, list:
   - Short title
   - Files to create/modify (paths)
   - Dependencies on other PRs
   - Required subagent type (ios-dev / android-dev / ai-engineer / neo4j-dev / marketer / designer)
   - Optional review size (`s` / `m` / `l`) — the S/M/L hint passed to `/greenlight`; omit to let it auto-classify from the diff

**Validate the dependency graph**:
   - For PRs declared parallel: confirm file paths don't overlap
   - For dependent PRs: confirm the dependency actually creates the required modules
   - Check for circular dependencies

**Present the dependency graph** for user confirmation:
```text
PR1 (models) ──→ PR3 (router, depends on PR1)
PR2 (worker) ──→ PR4 (docs, depends on all)
     ↑
Can run parallel with PR1
```

Proceed to Step 3 after user confirms.

## Step 3: Write Artifacts

**When to write — read this first:**

- **Multi-PR**: write artifacts now, then proceed to Step 4.
- **Single-PR (either run now or schedule)**: do **not** write any artifacts in
  this step. Defer all writes until after the user confirms execution mode in
  Step 4. This avoids leaving half-written `plan.yaml` / `state.json` / spec
  files on disk if the user cancels at the confirmation gate.

Output location is `docs/loops/<YYYY-MM-DD>_<short-name>/` — same convention regardless
of mode. What gets written depends on mode:

| Mode | Files written |
|---|---|
| Single-PR + run now | `pr1-<short>.md` only |
| Single-PR + schedule | `plan.yaml` (1 PR entry) + `state.json` + `pr1-<short>.md` |
| Multi-PR | `plan.yaml` + `state.json` + `pr1-<short>.md`, `pr2-<short>.md`, … |

On Codex run-now, hold the approved spec content in memory at this point. Step
5 creates and verifies the explicit worktree first, then writes the one spec
file inside that worktree. Do not write it in the caller's checkout: an
uncommitted parent-only file is invisible to a git worktree and would be left
behind after the PR lifecycle.

**Spec naming**: always `pr1-<short>.md`, `pr2-<short>.md`, … — the same convention
regardless of mode. Single-PR uses `pr1-<short>.md` (not `spec.md`) so that
`references/schemas.md` needs no exception, and a mid-flow pivot ("actually let's
add a PR2") doesn't require renaming the existing file.

Example tree (multi-PR):

```text
docs/loops/2026-03-29_mining-queries/
  ├── plan.yaml
  ├── state.json
  ├── pr1-models.md
  ├── pr2-worker.md
  └── pr3-router.md
```

### plan.yaml

Read `references/schemas.md` for the full plan.yaml schema. In single-PR + schedule
mode, `prs:` legitimately has one entry — no special handling needed. Key fields:

```yaml
name: "Short name"
source_todo: "todos/doing/xxx.md"
prs:
  - id: pr1
    branch: feature/xxx-pr1
    title: "feat(scope): description"
    type: code          # code | docs
    size: m             # optional — S/M/L review hint for /greenlight (upward-only); omit to auto-classify
    subagent: ai-engineer
    depends_on: []
    spec: pr1-models.md
    files:              # optional — used for the wave overlap check; omit to derive from spec
      - path/to/new_file.py
      - path/to/existing_file.py
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

### Spec quality gate (acceptance criteria)

Step 3 is where a fuzzy goal gets compiled into a loop contract, so gate the
acceptance criteria **before writing the spec**. This is a lightweight checklist
prompt — **no subagent**; the real enforcement is greenlight's verifier loop (see
`../greenlight/SKILL.md` "Inner verify loop"). Run it inline:

- **Every acceptance criterion must be an executable command or a verifiable
  assertion.** An executable command is something a shell can run and pass/fail on
  (`cd x && uv run pytest tests/test_x.py`, `grep -n "reason_class" file.md`); a
  verifiable assertion names an observable state or behavior ("stops within 60s of the
  shutdown event"). **Reject vague criteria** — "works correctly", "handles errors
  properly", "the UI looks right" have no verifier — and rewrite them into a command or
  an observable condition before proceeding.
- **`type: docs` PRs are exempt** (prose criteria are checklist assertions a reviewer
  judges, not runnable commands), **BUT cross-check the exemption against the mechanical
  S whitelist** from greenlight's sizing cascade
  (`../greenlight/SKILL.md` → "Mechanical cascade"): the pure-prose whitelist is
  `docs/**` (excluding `docs/loops/**`), `todos/**`, the repo-root `README.md`,
  `LICENSE`, `.gitignore`. If any path in the PR's `files` list falls **outside** that
  whitelist, the self-declared `type: docs` is not trustworthy — **override it to
  `code` (or at minimum flag it)** and apply the gate in full. A `SKILL.md` edit is not
  docs. This closes the gaming path where a mislabeled `docs` type buys both this
  exemption and the sizing PR's S light-review.

### state.json

Initial state (multi-PR or single-PR + schedule; **not** written for single-PR
+ run now, since there is no orchestrator loop to resume):

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

### Multi-PR

Present the final plan for user confirmation. Plan review is not run here — each
PR subagent runs `/plan-review internal` at execution time (Step 5):

```text
Plan: 4 PRs
  PR1 (models) + PR2 (worker) → parallel
  PR3 (router) → waits for PR1
  PR4 (docs) → waits for all

Plan review: runs per PR at execution time (`/plan-review internal`)

Schedule for automatic execution? Tell me when you'd like it to run.
```

### Single-PR

Present the plan summary, then directly ask「要現在跑嗎？」：

```text
Plan: 1 PR
  feat(scope): <summary>  (subagent: ai-engineer, branch: feature/<short-name>)
  Files: path/a.py, path/b.py
  Spec target: docs/loops/<YYYY-MM-DD>_<short-name>/pr1-<short>.md

要現在跑嗎？（約 10-30 分鐘，session 會被佔用；不跑的話可以排程）
```

After the user picks, write the artifacts per Step 3's table, then proceed to
Step 5. The Codex run-now exception above writes its spec during Step 5, after
the explicit worktree passes validation.

## Step 5: Execute

| Mode | Path |
|---|---|
| Single-PR + run now | New inline-dispatch path (below) |
| Single-PR + schedule | Existing CronCreate → orchestrator path. Orchestrator reads `plan.yaml` with N=1 and degenerates to a single iteration of the execution loop. |
| Multi-PR | Existing CronCreate → orchestrator path. |

### Single-PR + run now (inline dispatch)

#### Claude Code

1. Read `references/pr-subagent-template.md` (template is unchanged).
2. Read the spec just written (`pr1-<short>.md`).
3. Resolve dispatch-time template variables:
   - `{BRANCH}`    = `feature/<short-name>`
   - `{TITLE}`     = `feat(scope): <summary>`
   - `{PR_ID}`     = `pr1`
   - `{PLAN_DIR}`  = `docs/loops/<YYYY-MM-DD>_<short-name>`
   - `{SPEC_FILE}` = `pr1-<short>.md`
   - `{SIZE}`      = the PR's `size` (`s`/`m`/`l`) when the descriptor set one — Step 5
     of the suffix passes it to `/greenlight` as `size={SIZE}`. When unset, drop the
     `size={SIZE}` clause so no token is passed (greenlight then auto-classifies).
   - `{SELECT}`    = the PR's `select` — the planned reviewer selection as a
     comma-separated recipe list. Step 5 passes it as `select={SELECT}`. When the
     descriptor set none, drop the `select={SELECT}` clause entirely.
   - `{GATE}`      = the PR's `gate` — the recipe whose clean pass ends the review
     loop, passed as `gate={GATE}`. Drop the clause when unset, exactly as with
     `{SIZE}`.

   Fill `{SELECT}` / `{GATE}` only from a preference the user actually stated while
   planning. Autopilot does **not** resolve reviewers itself: greenlight owns that
   decision, degrades a stale id with a warning at run time, and falls back to the
   repo's `fallback_order` when neither token is passed.

   Leave `{PR_NUMBER}`, `{REPO_ROOT}`, `{WORKTREE_PATH}` as `{...}` literals — the
   subagent fills them in at runtime.
4. Assemble the final prompt by concatenating, in order: the inner contents of
   the `Standard Prefix` fenced code block, the spec content from step 2, and
   the inner contents of the `Standard Suffix` fenced code block (do not
   include the `## Standard Prefix` / `## Standard Suffix` markdown headers
   or the surrounding triple-backtick fences). Substitute the variables from
   step 3 into the result.
5. Dispatch — branch on **Workflow tool availability** (check whether a
   `Workflow` tool is present in this session's available tools):

   **Workflow tool available**: dispatch via the wave-workflow template
   (`references/wave-workflow.md`) as a single-PR batch:
   - `args.prs` = one entry: `{ id: "pr1", branch, title, subagent, prompt, files }`,
     where `prompt` is the assembled prompt and `files` is this PR's create/modify
     list from the Step 2 descriptor. With one PR the overlap check trivially passes.
   - `args.max_retries` = 2.
   - Invoke the `Workflow` tool with the wave-workflow script and these args. The
     call is **async** (see orchestrator.md Step 2a): it returns a launcher
     response (`{ status, taskId, error? }`); if `error` is set the script failed
     its syntax check — fall back to the Agent path. Otherwise wait for the
     matching `task_notification` completion event and read the workflow result
     from its `output_file`.
   - `results[0]` from that payload is this PR's result: the schema-validated
     agent output plus an `attempts` count (in-script retries already handled).

   **Workflow tool unavailable** (fallback — unchanged): dispatch the Agent tool:
   - `subagent_type` = `<subagent declared in Step 2>`
   - `isolation`     = `"worktree"`
   - `prompt`        = the assembled prompt
6. Get the result JSON: `results[0]` from the workflow (Workflow branch), or the
   subagent's returned result JSON (Agent branch).
7. Print a completion report inline (see "Completion Report" below).

The full lifecycle still runs: Plan Mode → `/plan-review internal` → implement + test →
commit + push + `gh pr create` → `/greenlight` → CI poll → `/merge-pr` →
cleanup → result JSON. All defined by the unchanged `pr-subagent-template.md`.

**Failure / interruption (run-now mode)**: there is no `state.json` to resume
from. If the session crashes mid-execution, manual cleanup is required: run
`git worktree list` and `gh pr list` to see what was left behind, then either
finish or close it before re-running `/autopilot` for a fresh attempt. If the
user wants crash recovery, they should pick "schedule" instead.

#### Codex V1

Codex owns the worktree in the parent thread; the child owns only the files and
PR lifecycle inside it. Run these steps only after the user confirmed the
single-PR plan and chose run-now.

1. Set `BRANCH`, `TITLE`, `PR_ID=pr1`, `PLAN_DIR`, and `SPEC_FILE` from the
   approved descriptor. Before writing the spec or spawning a child, execute
   this preflight as one Bash block. Any failure stops with no PR; the block
   removes only a worktree it created itself.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)" || exit 1
BASE_BRANCH="$(git branch --show-current)"
BASE_SHA="$(git rev-parse HEAD)" || exit 1

if [[ -z "$BASE_BRANCH" || -n "$(git status --porcelain)" ]]; then
  echo "Autopilot requires a clean, attached base branch; stopping before side effects."
  exit 1
fi
if [[ "$BASE_BRANCH" != main ]]; then
  echo "Codex Autopilot V1 requires main because Greenlight evaluates main...HEAD; stacked PRs are not supported."
  exit 1
fi
if [[ "$PLAN_DIR" != docs/loops/* || "$PLAN_DIR" == *..* \
   || "$SPEC_FILE" != pr1-*.md || "$SPEC_FILE" == */* ]]; then
  echo "Autopilot generated an unsafe spec path; stopping."
  exit 1
fi
git check-ref-format --branch "$BRANCH" >/dev/null || exit 1
git fetch --quiet origin "$BASE_BRANCH" || exit 1
REMOTE_BASE_SHA="$(git rev-parse --verify "refs/remotes/origin/$BASE_BRANCH^{commit}")" || exit 1
if [[ "$BASE_SHA" != "$REMOTE_BASE_SHA" ]]; then
  echo "Local $BASE_BRANCH is not exactly origin/$BASE_BRANCH; sync it before Autopilot."
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Local branch already exists: $BRANCH"
  exit 1
fi
if git ls-remote --exit-code --heads origin "refs/heads/$BRANCH" >/dev/null 2>&1; then
  echo "Remote branch already exists: $BRANCH"
  exit 1
else
  REMOTE_PROBE=$?
  if [[ "$REMOTE_PROBE" -ne 2 ]]; then
    echo "Could not verify that remote branch $BRANCH is absent."
    exit 1
  fi
fi

WORKTREE_PATH="$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT")-autopilot-$PR_ID"
if [[ -e "$WORKTREE_PATH" ]]; then
  echo "Worktree path already exists: $WORKTREE_PATH"
  exit 1
fi
git worktree add "$WORKTREE_PATH" -b "$BRANCH" "$BASE_SHA" || exit 1
ACTUAL_ROOT="$(git -C "$WORKTREE_PATH" rev-parse --show-toplevel)"
if [[ "$(cd "$ACTUAL_ROOT" && pwd -P)" != "$(cd "$WORKTREE_PATH" && pwd -P)" \
   || "$(git -C "$WORKTREE_PATH" branch --show-current)" != "$BRANCH" \
   || -n "$(git -C "$WORKTREE_PATH" status --porcelain)" ]]; then
  git worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true
  echo "Explicit worktree validation failed; stopping."
  exit 1
fi
```

2. Write the approved spec to exactly
   `$WORKTREE_PATH/$PLAN_DIR/$SPEC_FILE`, then require
   `git -C "$WORKTREE_PATH" status --porcelain --untracked-files=all` to equal
   exactly `?? $PLAN_DIR/$SPEC_FILE`. If the write or check fails, remove this
   newly created worktree and branch as in the preflight and stop. Do not create
   `plan.yaml` or `state.json`.
3. Read `references/pr-subagent-template.md` and assemble the prompt from its
   Standard Prefix, the full spec content, and Standard Suffix. Apply the same
   `{SIZE}`, `{SELECT}`, and `{GATE}` rules as the Claude path, and substitute
   `{REPO_ROOT}`, `{WORKTREE_PATH}`, `{BASE_BRANCH}`, `{BASE_SHA}`, `{BRANCH}`,
   `{TITLE}`, `{PR_ID}`, `{PLAN_DIR}`, and `{SPEC_FILE}` with their concrete
   values. Leave only `{PR_NUMBER}` for the child to resolve after PR creation.
4. Inspect the callable `spawn_agent` agent types. Use the descriptor's custom
   specialist only when that exact type is available; otherwise use the
   built-in `worker`. Spawn exactly one child with `fork_turns="none"`, a unique
   task name, and the assembled self-contained prompt. Do not request automatic
   isolation: the absolute worktree already exists and the prompt assigns that
   directory as the child's only file ownership.
5. Wait for the child, giving the user a brief update at least once per minute.
   Its final answer must be one JSON object matching the template's result
   schema. Reject missing fields, extra fields, invalid types, or surrounding
   prose. A `failed` or `blocked` result, invalid output, interruption, or tool
   failure retains the worktree, local branch, and any PR for recovery and
   reports their exact paths/identifiers; never dispatch a replacement child.
6. A child-reported `success` is provisional. Poll `gh pr view` for at most five
   10-second attempts and require all of: the reported PR is `MERGED`, its head
   is `BRANCH`, its base is `BASE_BRANCH`, and `mergeCommit.oid` is non-null.
   Fetch the base and require the merge commit to be an ancestor of
   `origin/$BASE_BRANCH`. If any check fails, retain recovery state and report
   failure instead of cleaning up.
7. After verified merge, remove the child worktree without `--force`, delete
   only the verified local child branch, and fast-forward the still-clean caller
   checkout to `origin/$BASE_BRANCH`. Cleanup or fast-forward failure is a
   warning attached to the verified success, with an exact recovery command; it
   must never turn a verified GitHub merge into a false failure. Print the
   completion report below using the validated child result.

The Codex lifecycle is: inline implementation plan → `/plan-review internal` →
implement + test → commit + push + PR → `/greenlight unattended` → exact-head
CI → `/merge-pr` → parent-verified merge and cleanup → structured report.
There are no Codex retries, waves, schedules, Workflow calls, or implicit
worktrees in V1.

### Single-PR + schedule and Multi-PR (CronCreate path)

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

### Completion Report (single-PR + run now)

On success:

```text
Autopilot Single-PR done
═════════════════════════
✅ #91 feat(scope): <summary> — 2 rounds, fixed 1, pushed back 0
   merged into main
   spec: docs/loops/<YYYY-MM-DD>_<short-name>/pr1-<short>.md
```

On block:

```text
❌ blocked: feat(scope): <summary>
   reason: <error from subagent>
   spec: docs/loops/<YYYY-MM-DD>_<short-name>/pr1-<short>.md
   recovery: fix manually and resume, or re-run /autopilot
```

## Important Notes

- This skill is interactive — each step requires user confirmation before proceeding
- Todos have typically already been through eng-review; no need to re-evaluate architecture direction, only confirm the PR split is reasonable
- Spec file quality directly determines execution success rate — better to spend extra time writing clearly
