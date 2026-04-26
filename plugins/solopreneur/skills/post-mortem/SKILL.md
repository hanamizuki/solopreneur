---
name: post-mortem
description: |
  Trace when a bug was introduced, find the root cause commit, understand why
  it happened, and produce a structured post-mortem report. Use when the user
  says "post-mortem", "trace this bug", "when was this regression introduced",
  "find the root cause commit", "what commit broke this", or when they describe
  a crash/bug that appeared in a specific version. Works with any git repository.
---

# Post-mortem Investigation

Given a bug description, trace through git history to find when it was introduced,
identify the root cause, and produce a structured report.

## Core Principles

**Code is truth — user-provided clues are just search starting points.**

Users typically only know the symptoms, suspect a feature, or recall a related PR.
These are valuable leads but cannot be taken at face value. Your job is to verify
against actual git diffs, not follow assumptions blindly.

**The fix commit is the most reliable root cause guide.**

If a fix commit exists (merged or on another branch), find it first. The person who
fixed it usually understood the problem — what they changed and what they wrote in
the commit message often directly reveals what broke and why. Then trace backward
to find when the broken code was introduced.

## Phase 1: Gather Information

Collect from the user:
- **Bad version**: commit hash, tag, version number, or branch
- **Symptoms**: when it crashes, error messages, affected features
- **Fix info (optional)**: if the user knows the fix branch or commit, this is the golden lead — prioritize it
- **Search hints (optional)**: suspected features, files, keywords — treat as starting points, not final answers

**Good version does not need to come from the user** — it's usually the previous
release / tag / stable commit. Derive it from git log yourself.

## Phase 2: Establish Timeline

```bash
# Resolve version / tag / branch to a definite commit hash
git rev-parse <bad_version>

# Find the previous good version (last release commit)
git log --oneline --format="%h %ad %s" --date=short <bad_commit>~20..<bad_commit>

# List all commits between the two versions (to understand scope of changes)
git log --oneline --format="%h %ad %s" --date=short <good_commit>..<bad_commit> --reverse
```

## Phase 3: Find the Fix Commit First

**Before searching for the introduction, find the fix.** The fix commit's diff and
message are the most reliable root cause guide — they directly show what was
replaced and why.

```bash
# Search for fix commits after the bad version
git log --oneline --grep="fix\|hotfix\|patch\|revert" <bad>..HEAD

# If the user mentioned a fix branch, look at it directly
git log --oneline <fix_branch> --not main | head -10
git show <fix_commit_hash>
```

When reading the fix commit, focus on:
- **Which files and functions were changed** — this is where the problem lives
- **Commit message** — often directly describes the root cause
- **Before/after diff** — shows what the broken version looked like

With this information, proceed to Phase 4 to find when the broken code was introduced.

## Phase 4: Trace the Introduction

Now that you know "what code is the problem", find "when this code first appeared":

```bash
# Trace change history of the specific file
git log --oneline -- path/to/file

# View a specific commit's changes to that file
git show <commit_hash> -- path/to/file

# Compare good and bad versions to confirm when the problematic code appeared
git diff <good_commit>..<bad_commit> -- path/to/file
```

### Watch for "Latent Bug" Patterns

Sometimes the root cause was planted in the "good version" but didn't trigger on its
own — it only manifested when a later change increased call frequency, data volume,
or altered timing.

In this case:
- Commits in the version window (good → bad) are the "trigger", not the root cause
- The real root cause lies before the good version

Criterion: if the "suspicious commit" you found in the version window cannot
logically explain the crash mechanism, widen your search to earlier commits.

```bash
# Expand to earlier history
git log --oneline <good_commit>~30..<bad_commit> -- path/to/file
```

When this happens, the report should explain both:
1. Which commit introduced the architectural flaw (true root cause)
2. Which later commit became the trigger (the straw that broke the camel's back)

## Phase 5: If No Fix Commit Exists

If the bug hasn't been fixed yet, fall back to keyword search:

```bash
# Search for suspicious commits by symptom keywords
git log --oneline --grep="<feature_keyword>" <good>..<bad>

# Diff suspicious commits directly
git show <commit_hash> -- path/to/file

# Use pickaxe to search for additions/removals of specific strings
git log -S "suspicious_function_name" <good>..<bad>
```

After finding a suspicious change, ask yourself: **"Can this change logically cause
the symptoms the user described?"** You need a clear logical explanation, not gut
feeling. If you can't explain it, keep looking.

## Phase 6: Produce the Report

Output a markdown report in the following format. Adapt headings and wording to fit
the actual situation — don't copy the template verbatim.

---

```markdown
## Post-mortem: [one-line bug description]

### Root Cause (TL;DR)

[1-2 sentences: what change caused the bug and why. Get straight to the point.]

### Timeline

| Date | Commit | Event |
|------|--------|-------|
| YYYY-MM-DD HH:MM | `xxxxxxx` | Bug introduced — [commit title] |
| YYYY-MM-DD HH:MM | `xxxxxxx` | [Affected version] released (exposure begins) |
| YYYY-MM-DD HH:MM | `xxxxxxx` | Bug fixed — [commit title] |
| YYYY-MM-DD HH:MM | `xxxxxxx` | [Fix version] released (exposure ends) |

**Exposure window**: X hours / X days

### The Change That Introduced the Bug

[Explain the original intent of the PR / commit]

```
// Bad: this code caused the issue
<problematic code snippet>
```

[Explain why this code causes the crash / bug]

### The Fix

[Explain the fix approach]

```
// Fixed
<fixed code snippet or description of fix direction>
```

### Root Cause Analysis

[Explain why this bug appeared at this time — not just "what code", but "why it
wasn't caught"]

### Prevention Measures

- [ ] [Specific action item]
- [ ] [Another action item]

[Each action item should be specific and trackable. Don't write vague things like
"add more tests" — write something like "add integration test for
HealthKitManager.requestAuthorization verifying typesToRead excludes correlation
types".]
```

---

After outputting the report, ask the user if they want to save it:

> Save this report to a file? Suggested path: `docs/post-mortem/YYYY-MM-DD-[short-bug-description].md`

If the user agrees, save to the corresponding path.
