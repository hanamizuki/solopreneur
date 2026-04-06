---
name: worktree-handoff
description: |
  Create a git worktree for a task and write a CONTEXT.md that captures the full
  problem context, so the next session can pick up without re-explanation. Use when
  the user says "open worktree", "worktree handoff", "create a worktree", "start
  a new branch for this", or wants to hand off a task to a fresh session with full
  context preserved.
---

# Worktree Handoff

Create an isolated workspace for a new or in-progress task, and write the complete
task context into the new worktree so the next session doesn't need to start from scratch.

## Flow

### 1. Decide Worktree Name and Branch

Name based on task type and description:

| Task Type | Branch Prefix | Example |
|-----------|--------------|---------|
| Bug fix | `fix/` | `fix/sleep-calculation` |
| New feature | `feature/` | `feature/health-connect-edit` |
| Refactor | `refactor/` | `refactor/sleep-sessionizer` |
| Research | `research/` | `research/healthkit-sources` |

Worktree directory name = branch name slug (strip prefix, use `-` separators).

### 2. Create Worktree

**Always place worktrees under `.worktrees/`:**

```bash
git worktree add .worktrees/<slug> -b <branch-name>
```

**Prohibited:**
- Operating on main
- Placing worktrees outside `.worktrees/`

### 3. Copy Environment Config Files (gitignored secrets/config)

Worktrees are separate directories — files excluded by `.gitignore` don't carry over
automatically. **After creating the worktree, check for and copy relevant config files:**

```bash
# Get the main repo root
MAIN_REPO="$(git worktree list | head -1 | awk '{print $1}')"
WORKTREE=".worktrees/<slug>"

# Find gitignored config files that exist in the main repo
# Common patterns: .env, *.xcconfig, local.properties, secrets.json
# Copy any that are relevant to this project
```

**Detection strategy:**
1. Check `.gitignore` for patterns that match config/secret files
2. Find files matching those patterns in the main repo
3. Copy them to the corresponding paths in the worktree

**Principle:** Only copy gitignored environment config files. Never copy build artifacts or caches.

### 4. Write docs/CONTEXT.md

Write the complete task context into `docs/CONTEXT.md` in the new worktree.
This file is the next session's sole knowledge source.

**CONTEXT.md structure:**

```markdown
# Context: <branch-name>

## Problem Background
[Why is this being done? User reports? Screenshots? Logs?]

## Root Cause
[Known technical issues, include file paths + line numbers]

## Items to Fix / Implement
[Checklist, with expected approach for each item]

## Key Files
[Table: file path | description]

## Current Progress
[Not started / which steps are already done]
```

**Writing principles:**
- Be specific, not vague — include file names, line numbers, error messages, actual numbers
- Include the root cause analysis already done — don't make the next session debug from scratch
- If the conversation had screenshot descriptions or user-reported bug details, include everything

If `docs/CONTEXT.md` already exists (from another task on main), **overwrite** its entire
content with the current task's context.

### 5. Output Instructions for the User

Output this message so the user can paste it into a new session:

```
cd /path/to/repo/.worktrees/<slug>

Read `docs/CONTEXT.md` first — it contains the full context for <one-line task description>.
Branch: `<branch-name>`, <one sentence describing the core problem or goal>.
```

## Example

User says: "Open a worktree to fix the sleep calculation — the issue is duplicate sources from HealthKit"

```bash
git worktree add .worktrees/fix-sleep-calculation -b fix/sleep-calculation
```

CONTEXT.md content: full problem background, root cause (HealthKit not deduplicating),
key files list, suggested fix direction.

Output for user:
```
cd /path/to/project/.worktrees/fix-sleep-calculation

Read `docs/CONTEXT.md` first — it contains the full context for the sleep calculation fix.
Branch: `fix/sleep-calculation`, the issue is that HealthKit multi-source sleep samples
aren't being deduplicated, causing displayed sleep time to exceed Apple Health's value.
```
