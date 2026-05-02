---
name: worktree-handoff
description: |
  Create a git worktree for a task and record handoff context into a plan file
  that is committed to the branch. Discovers existing plan files in the user's
  configured todos or plans directory, appends a dated Handoff Context section,
  and commits everything before printing the next-session pickup message.
  Use when the user says "open worktree", "worktree handoff", "create a worktree",
  "start a new branch for this", or wants to hand off a task to a fresh session
  with full context preserved.
---

# Worktree Handoff

Create an isolated workspace for a new or in-progress task, and record the complete
task context into a plan file that gets committed to the branch. The next session reads
the plan file to pick up without re-explanation.

## Flow

### Step 1: Resolve Mode and Paths

Inline the cascade config helpers, then determine the operating mode:

```bash
# --- solopreneur config helpers (inlined from _shared/config.md) ---
read_solopreneur_config() {
  local key="$1"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local fallback="$HOME/.claude/solopreneur.json"
  if [ -f "$primary" ] && jq -e "has(\"$key\")" "$primary" >/dev/null 2>&1; then
    jq -r ".${key} // empty" "$primary"
    return
  fi
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    jq -r ".${key} // empty" "$fallback"
  fi
}
# --- end solopreneur config helpers ---

TODOS_CONFIG=$(read_solopreneur_config todos)
PLANS_CONFIG=$(read_solopreneur_config plans)

BACKLOG=$(echo "${TODOS_CONFIG:-{}}" | jq -r '.backlog // empty')
DOING=$(echo "${TODOS_CONFIG:-{}}" | jq -r '.doing  // empty')
PLANS_DIR=$(echo "${PLANS_CONFIG:-{}}" | jq -r '.dir // empty')
PLANS_DIR="${PLANS_DIR:-docs/solopreneur/plans}"  # default
MODE=$([ -n "$BACKLOG" ] && [ -n "$DOING" ] && echo "state-machine" || echo "flat")
```

**Mode decision:**
- **State-machine mode**: `$BACKLOG` and `$DOING` are both non-empty
- **Flat mode**: otherwise — uses `$PLANS_DIR`

### Step 2: Decide Worktree Name and Branch

Name based on task type and description:

| Task Type | Branch Prefix | Example |
|-----------|--------------|---------|
| Bug fix | `fix/` | `fix/sleep-calculation` |
| New feature | `feature/` | `feature/health-connect-edit` |
| Refactor | `refactor/` | `refactor/sleep-sessionizer` |
| Research | `research/` | `research/healthkit-sources` |

Worktree directory name = branch name slug (strip prefix, use `-` separators).

### Step 3: Create Worktree

**Always place worktrees under `.worktrees/`:**

```bash
git worktree add .worktrees/<slug> -b <branch-name>
```

**Prohibited:** operating on main, placing worktrees outside `.worktrees/`.

### Step 4: Copy Environment Config Files (gitignored secrets/config)

Worktrees are separate directories — gitignored files don't carry over automatically.
Check `.gitignore` for config/secret patterns, find matching files in the main repo,
copy them to the same relative paths in the worktree. Never copy build artifacts.

```bash
MAIN_REPO="$(git worktree list | head -1 | awk '{print $1}')"
WORKTREE=".worktrees/<slug>"

# Find gitignored config files that exist in the main repo
# Common patterns: .env, *.xcconfig, local.properties, secrets.json
# Copy any that are relevant to this project to the worktree's corresponding paths
```

### Step 5: Discover Candidate Plan Files + Context-Aware Picker

**Collect all plan files:**

```bash
# State-machine mode: collect from backlog + doing
if [ "$MODE" = "state-machine" ]; then
  ALL_FILES=$(find "$BACKLOG" "$DOING" -maxdepth 1 -name "*.md" 2>/dev/null)
else
  mkdir -p "$PLANS_DIR"
  ALL_FILES=$(find "$PLANS_DIR" -maxdepth 1 -name "*.md" 2>/dev/null)
fi
```

**Context matching — before prompting the user:**

Extract 3–5 key terms from the current conversation (task name, feature area, keywords
from the user's description). Then score each plan file:

1. Search file **names** (basename) for the key terms
2. Search file **content** (title headings, `Plan-Branch:` lines, first 20 lines) for the key terms

```bash
# ILLUSTRATIVE ONLY — substitute actual key terms extracted from the current
# conversation before running. Do NOT execute this block with these hardcoded terms.
TERMS="<term1>\|<term2>\|<term3>"  # replace with actual key terms
CANDIDATES=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  score=$(head -20 "$f" | grep -i -c "$TERMS" 2>/dev/null || echo 0)
  name_score=$(basename "$f" | grep -i -c "$TERMS" 2>/dev/null || echo 0)
  total=$((score + name_score * 2))
  [ "$total" -gt 0 ] && CANDIDATES="$CANDIDATES\n$total $f"
done <<< "$ALL_FILES"
CANDIDATES=$(printf '%b' "$CANDIDATES" | sort -rn)
MATCH_COUNT=$([ -n "$CANDIDATES" ] && printf '%b' "$CANDIDATES" | grep -c . || echo 0)
```

**Match count** = number of files with a score greater than zero (i.e., at least one key term found in the filename or first 20 lines of content).

**Decision based on match count:**

- **0 matches** — if `$ALL_FILES` is non-empty, briefly tell the user: "No matching plans found for this task — creating a new plan file. (Reply with a filename to use an existing plan instead.)" Then proceed to Step 6 to create a new file.
- **1 match** — use it automatically, no prompt. Print: `→ Matched plan: <filename>` so the user knows what was selected.
- **2+ matches** — show only the matching candidates (not all files) with index numbers, then ask:

  > "Found N matching plans. Which one does this worktree belong to? Enter a number to reuse it, or 'new' to create a fresh plan file."

  In state-machine mode, note the source directory in parentheses (Backlog / Doing) next to each filename.

**If no plan files exist at all**, skip all of the above and proceed directly to creating a new file.

**Recording the source:** When a file is selected, set `PLAN_SOURCE=backlog` or
`PLAN_SOURCE=doing` based on which directory it came from. Step 6 checks
`$PLAN_SOURCE` to decide whether to run `git mv` (only when `PLAN_SOURCE=backlog`).

### Step 6: Prepare the Plan File

#### If user picked 'new' (or no plans exist)

Create a new file:
- State-machine mode: `<doing>/<YYYY-MM-DD>-<branch-slug>.md`
- Flat mode: `<plans-dir>/<YYYY-MM-DD>-<branch-slug>.md`

Where `<branch-slug>` = branch name with `/` replaced by `-`
(e.g., `fix/sleep-calculation` → `fix-sleep-calculation`).
Date from `$(date +%Y-%m-%d)`.

New file content:
```markdown
<!--
Plan-Branch: <branch-name>
-->

## Handoff Context (<YYYY-MM-DD>, branch: <branch-name>)

### Problem Background
<why is this being done — user reports, screenshots, logs>

### Root Cause
<known technical issues, with file paths + line numbers>

### Items to Fix / Implement
- [ ] <item with expected approach>

### Key Files
| path | description |
|------|-------------|

### Current Progress
Not started.
```

Fill in the five sections based on context from the current conversation.

#### If user picked an existing file

1. **Move from backlog to doing (state-machine mode only):**
   If the selected file is in `$BACKLOG`, move it:
   ```bash
   git mv "$BACKLOG/<filename>" "$DOING/<filename>"
   PLAN_FILE="$DOING/<filename>"
   ```
   In flat mode, skip this step — the file stays in place.

2. **Ensure the `Plan-Branch:` marker block exists at the top of the file.**
   If the file already starts with an HTML comment block containing at least one
   `Plan-Branch:` line, check whether `Plan-Branch: <branch-name>` is already
   present. If it is absent, append the line inside the existing comment block:
   ```bash
   python3 -c "
import sys
branch, path = sys.argv[1], sys.argv[2]
with open(path) as f: content = f.read()
idx = content.find('\n-->')
if idx != -1:
    content = content[:idx+1] + 'Plan-Branch: ' + branch + '\n' + content[idx+1:]
with open(path, 'w') as f: f.write(content)
" "<branch-name>" "$PLAN_FILE"
   ```
   If no comment block exists at the top (legacy file), prepend one:
   ```markdown
   <!--
   Plan-Branch: <branch-name>
   -->
   ```

3. **Append the handoff section at the end of the file:**
   ```markdown

   ## Handoff Context (<YYYY-MM-DD>, branch: <branch-name>)

   ### Problem Background
   <why is this being done — user reports, screenshots, logs>

   ### Root Cause
   <known technical issues, with file paths + line numbers>

   ### Items to Fix / Implement
   - [ ] <item with expected approach>

   ### Key Files
   | path | description |
   |------|-------------|

   ### Current Progress
   <not started / steps done so far>
   ```

   Fill in the five sections based on context from the current conversation.
   Be specific: include file names, line numbers, error messages, actual numbers.
   Include root cause analysis already done so the next session doesn't debug from
   scratch. If the conversation had screenshots or user-reported bug details,
   include everything.

### Step 7: Commit and Push

```bash
git add <plan-file-path>
# Also stage the git mv result if the file moved from backlog to doing
git commit -m "docs(handoff): context for <branch-name>"
git push -u origin <branch-name>
```

Single commit. Push immediately so the doc is visible to the next session and to
PR reviewers.

### Step 8: Output the Next-Session Pickup Message

Print this so the user can paste it into a new session:

```text
cd /absolute/path/to/repo/.worktrees/<slug>

Plan file: <relative/path/to/plan.md>
Read the plan file for the full context — branch <branch-name> is tracked under
the `Plan-Branch:` marker, and the latest `## Handoff Context` section captures
the current state.
Branch: <branch-name>, <one-line task description>.
```

Use an absolute path in the `cd` command (from `git worktree list`). The plan file
path should be relative to the repo root.

## Example

User says: "Open a worktree to fix the sleep calculation — the issue is duplicate
sources from HealthKit"

```bash
git worktree add .worktrees/fix-sleep-calculation -b fix/sleep-calculation
```

Plan file discovery: user picks existing `2026-04-10-sleep-tracking.md` from
backlog (state-machine mode). File is `git mv`'d to doing, `Plan-Branch:
fix/sleep-calculation` is added to the marker block, and the Handoff Context
section is appended with the HealthKit duplicate-source root cause detail.

Commit: `docs(handoff): context for fix/sleep-calculation`

Output for user:
```text
cd /path/to/project/.worktrees/fix-sleep-calculation

Plan file: docs/solopreneur/plans/doing/2026-04-10-sleep-tracking.md
Read the plan file for the full context — branch fix/sleep-calculation is tracked
under the `Plan-Branch:` marker, and the latest `## Handoff Context` section
captures the current state.
Branch: fix/sleep-calculation, deduplicate HealthKit multi-source sleep samples
so displayed sleep time matches Apple Health's value.
```
