# PR Subagent Prompt Template

The Orchestrator uses this structure to assemble each PR subagent's prompt.
`{VARIABLES}` are replaced by the Orchestrator with actual values.

## Prompt Structure

```
{Standard Prefix}

{Spec Content}

{Standard Suffix}
```

---

## Standard Prefix

```
You are responsible for a PR's complete lifecycle: Plan → Implement → Test → PR → Review → Merge.

[Working Directory] Branch on the host before touching the repository:

- Claude Code (`CODEX_THREAD_ID` is unset): you are in an automatically created
  git worktree (via isolation: "worktree"). First rename its branch, then verify it:
    git branch -m {BRANCH}
    git branch --show-current
  The output must be "{BRANCH}".
- Codex (`CODEX_THREAD_ID` is set): the parent already created the worktree at
  the exact absolute path `{WORKTREE_PATH}` on `{BRANCH}` from `{BASE_SHA}`.
  Do not create, rename, remove, or switch a worktree or branch. Every repository
  file operation and shell command must use `{WORKTREE_PATH}` as its working
  directory. First verify that `git rev-parse --show-toplevel` resolves to that
  exact path, `git branch --show-current` is `{BRANCH}`, `git rev-parse HEAD` is
  `{BASE_SHA}`, and `git status --porcelain --untracked-files=all` has exactly
  this one entry:
  `?? {PLAN_DIR}/{SPEC_FILE}`. A mismatch is a blocked result.

Safety rules:
- All repository operations stay in the assigned worktree — do not cd to other repos
- Do not git checkout other branches
- Before every commit, run git diff --stat to confirm modified files are within expected scope
```

---

## Middle Section: Spec Content

Paste the full spec file content (read and injected by the Orchestrator).

---

## Standard Suffix

```
After completing implementation, execute these steps in order:

### 1. Plan Mode (pre-implementation planning)
On Claude Code, enter Plan Mode (`EnterPlanMode`). On Codex, those tools do not
exist: write the same concrete implementation plan inline and do not emulate
Plan Mode. Based on the spec above:
- Read all reference files listed in the spec's "Files to Read" section
- Plan the concrete implementation (files to create, function signatures, import paths)
- Verify: source files referenced in the spec exist, import paths are correct
- Verification passes → on Claude Code, exit Plan Mode (`ExitPlanMode`); on
  Codex, continue with the inline plan
- Verification fails → stop and report what's missing

### 2. Plan Review
Invoke the /plan-review skill with the Step 1 implementation plan as input, in
`internal` mode: `/plan-review internal`. Internal mode runs the technical
vetting stage (stack detection, official docs, expert subagents) and the lean
check (what the plan does not need), skips the external reviewer, and reports
findings without writing anything back — you adjust the plan yourself.
Branch on the Verdict line it emits:
- `Ready to implement` → note the Important/Suggestion items, keep them in mind
  during implementation, and continue to Step 3.
- `Needs revision` / `Needs rethink` (any Critical finding) → adjust the plan and
  re-run `/plan-review internal` once, re-dispatching **every platform the edits
  touch**, not just the ones that reported. Fixing an iOS blocker by changing a
  shared API can break Android, and you cannot know a platform is still clean
  without re-running its reviewer.
- **Still not `Ready to implement` after that one re-run → stop.** Do not start
  Step 3. Report the outstanding Critical findings and halt with
  `status: "blocked"`. Implementing a plan whose blockers survived two reviews is
  exactly what this gate exists to prevent.

### 3. Implement + Test
- Implement code according to the plan
- Run tests (test commands from spec acceptance criteria)
- Tests fail → self-fix, up to 3 attempts
- Still failing after 3 attempts → stop and report the error

### 4. Commit + Push + Create PR
- git diff --stat to confirm scope
- git add relevant files
- git commit -m "{TITLE}"
- git push -u origin {BRANCH}
- Claude Code: `gh pr create --title "{TITLE}" --body "Auto-created by Autopilot.\n\nSpec: {PLAN_DIR}/{SPEC_FILE}"`
- Codex: `gh pr create --base "{BASE_BRANCH}" --head "{BRANCH}" --title "{TITLE}" --body "Auto-created by Autopilot.\n\nSpec: {PLAN_DIR}/{SPEC_FILE}"`
- Resolve `{PR_NUMBER}` from the created PR before Step 5. If the created PR's
  head/base do not match `{BRANCH}` and the intended base, stop without review
  or merge.

### 5. Auto Review
Invoke the /greenlight skill to run the automated code review loop, **always with the
`unattended` token** — a dispatched run has no human to answer a reviewer-selection
prompt, and `unattended` is what makes greenlight pick a defensible default gate and
keep going instead of blocking on input.

When the plan set a size for this PR, also pass `size={SIZE}` so review weight matches
the planned risk; greenlight still recomputes the size from the real diff and takes the
upward max, so the token never under-reviews. When the plan recorded a reviewer
selection, pass `select={SELECT}` and `gate={GATE}` too. For example:

    /greenlight unattended size=m select=coderabbit,codex-bot gate=codex-bot

With no selection tokens, greenlight resolves reviewers from the per-repo config and
uses the first available `fallback_order` entry as the gate. A stale token — a reviewer
marked unresponsive since planning — degrades with a warning and never fails the run.

Greenlight caps itself at its per-size max rounds (S 3 / M 5 / L 10); let it run to
that cap rather than imposing a separate lower cap here, which would negate the size
profile. If it stops with unresolved issues still open, report and halt.

### 6. CI Check + Merge
After the final push (greenlight may have pushed fix commits in Step 5),
capture the exact commit CI must pass for — the pushed head SHA:

    PUSHED_SHA=$(git rev-parse HEAD)

Poll CI pinned to that SHA, every 60 seconds, max 10 attempts. No result is
trusted until it reflects `PUSHED_SHA` — a just-pushed commit whose CI has not
registered yet must never inherit an earlier commit's green:
- Confirm the PR head has caught up first:
  `gh pr view {PR_NUMBER} --json headRefOid --jq '.headRefOid'` must equal
  `PUSHED_SHA`. Until it does, keep polling (do not read checks against a stale
  head SHA).
- Then read `gh pr checks {PR_NUMBER}`. **"No checks reported yet" for
  `PUSHED_SHA` is treated as pending — keep polling, never as success.**
  Absence of checks is never a pass.
- All checks green for `PUSHED_SHA` → invoke /merge-pr skill (which
  re-verifies the same head-SHA gate before merging).
- Any check failed → read CI log, attempt one fix. After pushing the fix,
  re-capture `PUSHED_SHA=$(git rev-parse HEAD)` and restart this gate from the
  headRefOid check — the new commit needs its own CI and must never inherit the
  old SHA's result. If still failing → stop
- Still pending after 10 attempts → stop; do not merge.
- A repo with **zero CI configured** is indistinguishable from "checks not
  registered yet" at this poll, so autopilot deliberately keeps treating it as
  pending and stops rather than auto-merging with no signal — an unattended run
  must not merge blind. To land a genuinely CI-less repo, run `/merge-pr`
  directly; its gate merges with an explicit `merged with no CI signal` flag.

### 7. Cleanup
- Claude Code: the isolation mechanism cleans the worktree and deletes the
  branch after merge; if manual cleanup is needed, inspect `git worktree list`
  before removing anything.
- Codex: do not remove the worktree or local branch. The parent owns cleanup and
  performs it only after independently verifying the merge. Leave the assigned
  worktree clean and report its exact path.

### 8. Report Results
Output the following JSON result (the Orchestrator will parse this):

Result JSON:
{
  "pr_id": "{PR_ID}",
  "status": "success | failed | blocked",
  "github_number": <PR number or null>,
  "review_summary": {
    "rounds": <number of review rounds>,
    "fixed": <number of items fixed>,
    "pushed_back": <number of items pushed back>
  },
  "error": <failure reason string, null on success>
}

This result is validated against RESULT_SCHEMA (JSON Schema — kept identical to
the copy in references/wave-workflow.md; if you change one, change both):
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "pr_id": { "type": "string" },
    "status": { "type": "string", "enum": ["success", "failed", "blocked"] },
    "github_number": { "type": ["integer", "null"], "minimum": 1 },
    "review_summary": {
      "type": ["object", "null"],
      "required": ["rounds", "fixed", "pushed_back"],
      "properties": {
        "rounds": { "type": "integer", "minimum": 0 },
        "fixed": { "type": "integer", "minimum": 0 },
        "pushed_back": { "type": "integer", "minimum": 0 }
      }
    },
    "error": { "type": ["string", "null"] }
  },
  "required": ["pr_id", "status", "github_number", "review_summary", "error"]
}

How you emit the result depends on how you were dispatched:
- Workflow dispatch (spawned inside an autopilot wave-workflow): the result is
  enforced as structured output against RESULT_SCHEMA. Your FINAL output MUST be
  exactly the result object — no surrounding prose, no markdown, no code fence.
- Legacy Agent dispatch (spawned directly via the Agent tool): print the same
  JSON as today (the Result JSON block above), exactly as prior versions did.
- Codex `spawn_agent` dispatch: FINAL output MUST be exactly the result object —
  no surrounding prose, markdown, or code fence. `success` means `/merge-pr`
  verified `MERGED`; the parent still independently verifies before cleanup.
```

---

## Variable Reference

| Variable | Source | Example |
|----------|--------|---------|
| `{REPO_ROOT}` | Current git repo root | `/Users/dev/my-project` |
| `{WORKTREE_PATH}` | `{REPO_ROOT}/../{repo-name}-{pr_id}` | `/Users/dev/my-project-pr2` |
| `{BASE_BRANCH}` | Captured caller branch; Codex uses it as the explicit PR base | `main` |
| `{BASE_SHA}` | Captured caller HEAD before worktree creation | `8e13c2a...` |
| `{BRANCH}` | plan.yaml `prs[].branch` | `feature/mining-pr2` |
| `{TITLE}` | plan.yaml `prs[].title` | `feat(core): mining collector` |
| `{PR_ID}` | plan.yaml `prs[].id` | `pr2` |
| `{PLAN_DIR}` | Plan directory path | `docs/loops/2026-03-29_mining` |
| `{SPEC_FILE}` | plan.yaml `prs[].spec` | `pr2-collector.md` |
| `{SIZE}` | plan.yaml `prs[].size` (`s`/`m`/`l`); **omit the `size=` token entirely when unset** | `m` |
| `{SELECT}` | plan.yaml `prs[].select`; **omit the `select=` token entirely when unset** | `coderabbit,codex-bot` |
| `{GATE}` | plan.yaml `prs[].gate`; **omit the `gate=` token entirely when unset** | `codex-bot` |
| `{PR_NUMBER}` | Obtained after PR creation | `81` |
