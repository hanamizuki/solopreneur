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

[Working Directory] You are in an automatically created git worktree (via isolation: "worktree").
First step: rename the branch to the correct name:
  git branch -m {BRANCH}
  git branch --show-current
Confirm the output is "{BRANCH}". If it doesn't match, stop immediately and report an error.

Safety rules:
- All operations happen in the current directory — do not cd to other repos
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
Enter Plan Mode (EnterPlanMode). Based on the spec above:
- Read all reference files listed in the spec's "Files to Read" section
- Plan the concrete implementation (files to create, function signatures, import paths)
- Verify: source files referenced in the spec exist, import paths are correct
- Verification passes → exit Plan Mode (ExitPlanMode)
- Verification fails → stop and report what's missing

### 2. Tech Vetting
Invoke the /tech-vetting skill with the Step 1 implementation plan as input.
/tech-vetting will detect the tech stack, query official docs, and dispatch expert
subagents for best practice review.
If /tech-vetting finds serious issues → adjust the plan and re-run /tech-vetting.
If only suggestions → note them and keep them in mind during implementation.

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
- gh pr create --title "{TITLE}" --body "Auto-created by Autopilot.\n\nSpec: {PLAN_DIR}/{SPEC_FILE}"

### 5. Auto Review
Invoke the /greenlight skill to run the automated code review loop.
If the review loop exceeds 3 rounds with unresolved issues, stop and report.

### 6. CI Check + Merge
After the final push (greenlight may have pushed fix commits in Step 5),
capture the exact commit CI must pass for — the pushed head SHA:

    PUSHED_SHA=$(git rev-parse HEAD)

Poll CI pinned to that SHA, every 60 seconds, max 10 attempts. No result is
trusted until it reflects `PUSHED_SHA` — a just-pushed commit whose CI has not
registered yet must never inherit an earlier commit's green:
- Confirm the PR head has caught up first: `gh pr view {PR_NUMBER} --json
  headRefOid --jq '.headRefOid'` must equal `PUSHED_SHA`. Until it does, keep
  polling (do not read checks against a stale head SHA).
- Then read `gh pr checks {PR_NUMBER}`. **"No checks reported yet" for
  `PUSHED_SHA` is treated as pending — keep polling, never as success.**
  Absence of checks is never a pass.
- All checks green for `PUSHED_SHA` → invoke /merge-pr skill (which
  re-verifies the same head-SHA gate before merging).
- Any check failed → read CI log, attempt one fix; if still failing → stop
- Still pending after 10 attempts → stop; do not merge

### 7. Cleanup
- Worktree is automatically cleaned up by the isolation mechanism (branch deleted after merge)
- If manual cleanup needed: `git worktree list` to confirm, then `git worktree remove`

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
```

---

## Variable Reference

| Variable | Source | Example |
|----------|--------|---------|
| `{REPO_ROOT}` | Current git repo root | `/Users/dev/my-project` |
| `{WORKTREE_PATH}` | `{REPO_ROOT}/../{repo-name}-{pr_id}` | `/Users/dev/my-project-pr2` |
| `{BRANCH}` | plan.yaml `prs[].branch` | `feature/mining-pr2` |
| `{TITLE}` | plan.yaml `prs[].title` | `feat(core): mining collector` |
| `{PR_ID}` | plan.yaml `prs[].id` | `pr2` |
| `{PLAN_DIR}` | Plan directory path | `docs/loops/2026-03-29_mining` |
| `{SPEC_FILE}` | plan.yaml `prs[].spec` | `pr2-collector.md` |
| `{PR_NUMBER}` | Obtained after PR creation | `81` |
