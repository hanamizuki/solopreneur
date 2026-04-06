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

### 2. Preflight Review
Invoke the /preflight skill with the Step 1 implementation plan as input.
/preflight will detect the tech stack, query official docs, and dispatch expert
subagents for best practice review.
If /preflight finds serious issues → adjust the plan and re-run /preflight.
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
- Poll CI: every 60 seconds `gh pr checks {PR_NUMBER}`, max 10 attempts
- All CI passes → invoke /merge-pr skill
- CI fails → read CI log, attempt one fix; if still failing → stop

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
