# fix(merge-pr): gate merges on CI checks pinned to head SHA

## Requirements

- In the merge-pr skill, add a CI gate immediately before the merge command
  (currently `gh pr merge $PR_NUMBER --squash --delete-branch 2>&1 || true`,
  around SKILL.md line 489):
  1. Resolve the PR's current head SHA (`gh pr view $PR_NUMBER --json headRefOid`).
  2. Read check status **for that exact SHA** (e.g. `gh api
     repos/{owner}/{repo}/commits/{sha}/check-runs`, or `gh pr checks`
     cross-validated against the head SHA). Checks reported for an older
     commit must never count — a just-pushed commit whose CI has not
     registered yet must not inherit the previous commit's green.
  3. Outcome semantics (all four must be documented in the skill):
     - all checks for the head SHA green → proceed to merge
     - any check pending, or no checks reported yet → **not green**: poll
       every 60s up to 10 attempts (mirrors the autopilot Step 6 precedent);
       still not green → abort with a clear "CI still pending — not merging"
       report. Never treat absence of checks as success.
     - any check failed → abort, list the failing check names
     - repo has zero CI checks configured at all → proceed with the merge but
       add a prominent report line "merged with no CI signal" (flag-style)
  4. Remove `|| true` from the merge command: a failed merge (e.g. rejected by
     branch protection) must surface as an explicit failure with gh's error
     output, not be swallowed as success.
- In autopilot's pr-subagent-template Step 6 (CI poll): fix the same stale-SHA
  race — after the final push, capture the pushed head SHA and only trust
  `gh pr checks` output once it reflects that SHA; treat "no checks reported
  yet" as pending (keep polling), never as success.
- Keep each file's existing structure, heading style, and tone; update any
  flow-summary lines that enumerate merge steps so the docs stay coherent.

## Files to Read

- plugins/solopreneur/skills/merge-pr/SKILL.md (current merge flow; the merge
  command around line 489)
- plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md
  (Step 6 CI poll — both the 60s×10 precedent to mirror and the stale-SHA fix
  target)
- todos/doing/2026-07-16_greenlight-autopilot-sizing-loop-engineering.md —
  section "3. 與 CI 三層分工" (canonical design rationale: the three merge-gate
  correctness details)

## Files to Create/Modify

- plugins/solopreneur/skills/merge-pr/SKILL.md — CI gate step before merge;
  remove `|| true` from the merge command
- plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md —
  Step 6: pin head SHA, pending/absent ≠ green

## Acceptance Criteria

- [ ] `grep -n "headRefOid" plugins/solopreneur/skills/merge-pr/SKILL.md`
      returns at least one hit (SHA pinning present)
- [ ] `grep -n "gh pr merge" plugins/solopreneur/skills/merge-pr/SKILL.md`
      shows the merge command no longer ends with `|| true`
- [ ] merge-pr SKILL.md documents all four outcomes: green→merge,
      pending/absent→poll then abort, failed→abort with names,
      zero-checks-repo→merge + "merged with no CI signal" flag line
- [ ] `grep -n -i "head SHA\|headRefOid" plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md`
      returns a hit inside Step 6
- [ ] Step 6 explicitly states "no checks reported yet" is treated as pending,
      not success

## Notes

- Design rationale (todo §3): a gate that lies (passes on a stale green) is
  worse than no gate — downstream then trusts a false signal. Spend the
  correctness budget on the SHA race.
- Do NOT add CI waiting to greenlight itself — the review loop deliberately
  does not wait on CI (todo §3). This PR only touches merge-time gating.
- This repo's product is markdown skill instructions: "implementation" means
  precise, executable English prose in the skill files, matching surrounding
  style. Do not bump any plugin.json version (releases are a separate flow).
- The /greenlight and /merge-pr skills YOU invoke during this task run from
  the installed plugin cache, not from this repo's working tree — editing
  these files does not affect your own in-flight machinery.
