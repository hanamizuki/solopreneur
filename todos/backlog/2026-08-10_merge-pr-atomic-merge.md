# merge-pr: make the merge atomic and stop mutating after review

**Created:** 2026-08-10
**Source:** `/plan-review` of the cross-host contract (PR #157)
**Applies to:** `plugins/solopreneur/skills/merge-pr/SKILL.md`

Two independent defects, both live today. Either can be fixed without the other.

## 1. The head check before merge is TOCTOU

`merge-pr/SKILL.md:613-622` reads the head, compares it to `$HEAD_SHA`, and then
runs `gh pr merge` as a separate call. A push landing between the two merges a
commit CI never cleared — the exact failure the check exists to prevent, and its
own comment says so.

`gh` supports the precondition natively:

```bash
gh pr merge "$PR_NUMBER" --squash --delete-branch --match-head-commit "$HEAD_SHA"
```

`gh pr merge --help` documents it as "Commit SHA that the pull request head must
match to allow merge". Replace the read-then-merge pair with the flag. Keeping
the early read is fine if a friendlier error message is wanted, but it is no
longer what enforces the invariant.

## 2. merge-pr commits twice after Greenlight, then only re-gates CI

- `merge-pr/SKILL.md:454` — commits and pushes the plan consolidation
- `merge-pr/SKILL.md:480` — commits and pushes the move to `done/`
- `merge-pr/SKILL.md:486` — Step 4, the CI gate, runs after both

Each commit creates a new head after Greenlight approved the old one, so the
review that authorized the merge no longer describes what is being merged. CI is
re-gated for the new head; the review is not.

Options, cheapest first:

1. Move both commits to before Greenlight runs.
2. Perform them after the merge.
3. Re-run Greenlight for the new head.

The first removes the problem instead of detecting it, and is the smallest
change.
