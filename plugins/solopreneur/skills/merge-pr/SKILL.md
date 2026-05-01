---
name: merge-pr
description: |
  Merge an open PR for the current branch. Handles pre-merge cleanup of
  worktree-specific files, consolidates the branch's plan file (renaming
  the latest Handoff Context section to Final Progress and moving the file
  to done/ in state-machine mode), merges via GitHub CLI, and reports status.
  Also cleans up stale merged-but-not-removed worktrees from prior sessions
  on every run.
  Use when the user says "merge", "merge PR", "merge this", or wants to
  land the current branch.
---

# Merge PR

## Core Design: Why the Current Session's Own Worktree Cannot Be Deleted

When a Claude Code session starts, it locks a primary working directory. After
each Bash tool call completes, the harness resets CWD back to that path. If the
current session's worktree is deleted mid-session (e.g. via `git worktree
remove`), the next Bash call fails its `cd` before any command runs — the
entire session becomes non-functional.

Solution: **leave your own worktree for the next session to clean up.** Every
`/merge-pr` run scans all worktrees and removes stale merged ones, *except* the
current session's own worktree. This caps the long-term residue at 1 leftover
worktree, which gets cleaned on the next `/merge-pr` run from any other session.

---

## Flow

### Step 0: Scan and clean up stale worktrees from prior sessions (always runs)

Regardless of whether there is a new PR to merge, start by cleaning up any
worktrees left over from previous sessions whose branches have already been
merged. Skip only the current session's own worktree.

```bash
CURRENT_WORKTREE=$(git rev-parse --show-toplevel)
MAIN_REPO=$(dirname "$(git rev-parse --git-common-dir)")

# List all worktrees with their branch names, excluding current and main repo
git worktree list --porcelain | awk '
  /^worktree /{path=substr($0, index($0,$2))}
  /^branch refs\/heads\//{
    br=$2; sub(/^refs\/heads\//, "", br)
    print path "\t" br
  }
' | while IFS=$'\t' read -r wt br; do
  [ "$wt" = "$CURRENT_WORKTREE" ] && continue   # Never delete own worktree (would break session CWD)
  [ "$wt" = "$MAIN_REPO" ] && continue          # Never delete main repo
  [[ "$br" = "main" || "$br" = "master" ]] && continue

  # Only remove if the branch has a merged PR
  PR_NUM=$(gh pr list --state merged --head "$br" --json number --jq '.[0].number' 2>/dev/null)
  if [ -n "$PR_NUM" ]; then
    echo "Cleaning up stale worktree: $wt (branch: $br, PR #$PR_NUM merged)"
    git worktree remove --force "$wt" 2>/dev/null || true
    git branch -D "$br" 2>/dev/null || true
    git push origin --delete "$br" 2>/dev/null || true
  fi
done

# Prune stale entries in the worktree registry (directories deleted manually)
git worktree prune -v

echo "=== Step 0 complete ==="
git worktree list
```

### Step 1: Confirm the current PR to merge

Determine the branch name from the current working context. If there is no open
PR for this branch (e.g. the user only wanted stale-worktree cleanup), stop
after Step 0.

```bash
BRANCH=$(git branch --show-current)
PR_NUMBER=$(gh pr view --json number --jq '.number' 2>/dev/null)

if [ -z "$PR_NUMBER" ]; then
  echo "No open PR for the current branch — cleanup only, not merging."
  exit 0
fi

echo "Ready to merge: branch=$BRANCH, PR=#$PR_NUMBER"
```

### Step 2: Pre-merge worktree cleanup (only runs in a worktree)

Remove legacy per-worktree files that must not land in main, then refuse to
proceed if any uncommitted changes remain after cleanup.

```bash
IS_WORKTREE=$([ "$(git rev-parse --git-common-dir)" != "$(git rev-parse --git-dir)" ] && echo yes || echo no)

if [ "$IS_WORKTREE" = "yes" ]; then
  # Legacy cleanup (kept for one release — remove next minor bump)
  git rm docs/CONTEXT.md 2>/dev/null || true
  git rm -r docs/superpowers/ 2>/dev/null || true
  git diff --cached --quiet || {
    git commit -m "chore: remove legacy worktree-specific files before merge"
    git push
  }

  # Refusal: the new flow commits everything intentionally, so anything
  # uncommitted at this point is unintentional and must be surfaced.
  if ! git diff --quiet HEAD; then
    echo "Worktree has uncommitted changes after legacy cleanup — refusing to merge."
    echo "Commit or stash first, then re-run /merge-pr."
    exit 1
  fi
fi
```

### Step 3: Consolidate the plan file for this branch

Resolve the plan file associated with the current branch, rename the latest
Handoff Context section to Final Progress, delete older same-branch Handoff
Context sections, update the status line, optionally move the file to done/,
and commit each change.

#### Step 3a: Resolve plan file path

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

BACKLOG=$(echo "$TODOS_CONFIG" | jq -r '.backlog // empty')
DOING=$(echo "$TODOS_CONFIG"  | jq -r '.doing  // empty')
DONE_DIR=$(echo "$TODOS_CONFIG" | jq -r '.done  // empty')
PLANS_DIR=$(echo "$PLANS_CONFIG" | jq -r '.dir // empty')
PLANS_DIR="${PLANS_DIR:-docs/solopreneur/plans}"

BRANCH=$(git branch --show-current)
```

Build the list of plan roots — union of `$BACKLOG`, `$DOING`, `$DONE_DIR`, and
`$PLANS_DIR` (whichever are set and exist on disk).

**Resolution order (first match wins):**

1. **Plan-Branch marker (primary):** search for `*.md` files containing
   `Plan-Branch: <exact branch>` in any plan root.

   ```bash
   PLAN_FILE=""
   for root in "$BACKLOG" "$DOING" "$DONE_DIR" "$PLANS_DIR"; do
     [ -z "$root" ] && continue
     [ -d "$root" ] || continue
     match=$(grep -lE "^Plan-Branch: ${BRANCH}$" "$root"/*.md 2>/dev/null | head -1)
     if [ -n "$match" ]; then
       PLAN_FILE="$match"
       break
     fi
   done
   ```

2. **Commit-history grep (fallback):** only if `PLAN_FILE` is still empty.
   Find the most recent commit matching the handoff pattern and extract its
   `.md` file path.

   ```bash
   if [ -z "$PLAN_FILE" ]; then
     HANDOFF_SHA=$(git log --pretty=format:'%H %s' main..HEAD \
       | grep -F "docs(handoff): context for ${BRANCH}" | head -1 | awk '{print $1}')
     if [ -n "$HANDOFF_SHA" ]; then
       PLAN_FILE=$(git show --name-only --format='' "$HANDOFF_SHA" \
         | grep -E '\.md$' \
         | head -1)
     fi
   fi
   ```

3. **No match → skip consolidation.** Not every branch has a plan file.
   Step 3 still succeeds; consolidation is simply not performed.

#### Step 3b: Rule-based consolidation

Only runs if `PLAN_FILE` is set and the file exists on disk.

**Changes to make in `PLAN_FILE`:**

1. Find all `## Handoff Context (<date>, branch: <BRANCH>)` sections
   (matched by branch name in the heading):

   ```bash
   grep -n "^## Handoff Context (.*branch: ${BRANCH})" "$PLAN_FILE"
   ```

2. **Rename the latest matching section** to
   `## Final Progress (merged <MERGE_DATE>, branch: <BRANCH>)` where
   `<MERGE_DATE>` = `$(date +%Y-%m-%d)`. Do NOT modify any `[ ]` or `[x]`
   checkboxes inside the section.

3. **Delete older same-branch Handoff Context sections** (all but the latest).
   "Older" means earlier in the file. Sections from other branches are left
   untouched.

4. **Update the top-of-file status line** if present: find a line matching
   `Status: <something>` in the first 20 lines and replace it with
   `Status: merged <MERGE_DATE>`.

**Implementation — use Python to process the file** (sed is too fragile for
multi-line section deletion). The key invariant: never touch `[ ]` or `[x]`
checkboxes.

Write the following script to a temp file and run it:

```python
import re, sys, os
from datetime import date

def consolidate(path, branch):
    merge_date = date.today().isoformat()
    with open(path) as f:
        content = f.read()

    lines = content.split('\n')

    # 1. Update status line in first 20 lines
    for i in range(min(20, len(lines))):
        if re.match(r'^Status:', lines[i]):
            lines[i] = f'Status: merged {merge_date}'
            break

    content = '\n'.join(lines)

    # 2. Find all Handoff Context sections for this branch
    pattern = rf'^## Handoff Context \([^)]*branch: {re.escape(branch)}\)'
    matches = [(m.start(), m.group()) for m in re.finditer(pattern, content, re.MULTILINE)]

    if not matches:
        print(f'No Handoff Context sections found for branch {branch}')
        return content

    # 3. Rename the latest (last in file) to Final Progress
    latest_start, latest_heading = matches[-1]
    new_heading = f'## Final Progress (merged {merge_date}, branch: {branch})'
    content = content[:latest_start] + new_heading + content[latest_start + len(latest_heading):]

    # 4. Delete older same-branch Handoff Context sections (all except latest)
    # After rename, re-find remaining old headings (indices may have shifted)
    for old_start, old_heading in reversed(matches[:-1]):
        # Find the section extent: from heading to just before the next ## heading
        section_start = old_start
        after = content[section_start + len(old_heading):]
        next_h2 = re.search(r'\n## ', after)
        if next_h2:
            section_end = section_start + len(old_heading) + next_h2.start()
        else:
            section_end = len(content)
        # Delete the old section (trim leading newlines from what follows)
        rest = content[section_end:].lstrip('\n')
        content = content[:section_start] + rest

    return content

if __name__ == '__main__':
    path = sys.argv[1]
    branch = sys.argv[2]
    result = consolidate(path, branch)
    with open(path, 'w') as f:
        f.write(result)
    print('Consolidation complete')
```

Run as:

```bash
TMPSCRIPT=$(mktemp /tmp/consolidate_XXXXXX.py)
cat > "$TMPSCRIPT" << 'PYEOF'
import re, sys, os
from datetime import date

def consolidate(path, branch):
    merge_date = date.today().isoformat()
    with open(path) as f:
        content = f.read()

    lines = content.split('\n')

    # 1. Update status line in first 20 lines
    for i in range(min(20, len(lines))):
        if re.match(r'^Status:', lines[i]):
            lines[i] = f'Status: merged {merge_date}'
            break

    content = '\n'.join(lines)

    # 2. Find all Handoff Context sections for this branch
    pattern = rf'^## Handoff Context \([^)]*branch: {re.escape(branch)}\)'
    matches = [(m.start(), m.group()) for m in re.finditer(pattern, content, re.MULTILINE)]

    if not matches:
        print(f'No Handoff Context sections found for branch {branch}')
        return content

    # 3. Rename the latest (last in file) to Final Progress
    # Safe: matches are sorted ascending by position; latest_start is always the highest
    # offset, so the rename does not affect byte offsets of earlier (old) headings.
    latest_start, latest_heading = matches[-1]
    new_heading = f'## Final Progress (merged {merge_date}, branch: {branch})'
    content = content[:latest_start] + new_heading + content[latest_start + len(latest_heading):]

    # 4. Delete older same-branch Handoff Context sections (all except latest)
    # Iterate in reverse so higher-offset deletions don't shift lower-offset positions.
    for old_start, old_heading in reversed(matches[:-1]):
        section_start = old_start
        after = content[section_start + len(old_heading):]
        next_h2 = re.search(r'\n## ', after)
        if next_h2:
            section_end = section_start + len(old_heading) + next_h2.start()
        else:
            section_end = len(content)
        rest = content[section_end:].lstrip('\n')
        content = content[:section_start] + rest

    return content

if __name__ == '__main__':
    path = sys.argv[1]
    branch = sys.argv[2]
    result = consolidate(path, branch)
    with open(path, 'w') as f:
        f.write(result)
    print('Consolidation complete')
PYEOF
python3 "$TMPSCRIPT" "$PLAN_FILE" "$BRANCH"
rm -f "$TMPSCRIPT"
```

#### Step 3c: Commit consolidation

Only run if consolidation actually changed the file.

```bash
git add "$PLAN_FILE"
git diff --cached --quiet || {
  git commit -m "docs: consolidate plan progress before merging PR #${PR_NUMBER}"
  git push
}
```

#### Step 3d: Move file (state-machine mode only)

State-machine mode = both `$DOING` and `$DONE_DIR` are set. Only move the file
if it currently lives in `$DOING`. Filename is preserved — same date prefix,
no re-dating.

```bash
if [ -n "$DOING" ] && [ -n "$DONE_DIR" ]; then
  if [[ "$PLAN_FILE" == "$DOING"/* ]]; then
    FILENAME=$(basename "$PLAN_FILE")
    mkdir -p "$DONE_DIR"
    git mv "$PLAN_FILE" "$DONE_DIR/$FILENAME"
  fi
fi
```

#### Step 3e: Commit the move (state-machine only)

```bash
if [ -n "$DOING" ] && [ -n "$DONE_DIR" ] && [[ "$PLAN_FILE" == "$DOING"/* ]]; then
  FILENAME=$(basename "$PLAN_FILE")
  git commit -m "chore: move $FILENAME to done/"
  git push
fi
```

### Step 4: Merge the PR

```bash
gh pr merge $PR_NUMBER --squash --delete-branch 2>&1 || true

# Verify the merge succeeded
STATE=$(gh pr view $PR_NUMBER --json state --jq '.state')
echo "PR state: $STATE"
[ "$STATE" = "MERGED" ] || { echo "Merge failed — stopping."; exit 1; }
```

Note: `--delete-branch` deletes the remote branch. The local branch deletion
will fail because the worktree is still checked out — this is expected. Step 0
of the *next* `/merge-pr` run (from any other session) will clean it up.

### Step 5: Report status

```
PR #<N> merged to main (commit <sha>)

Current worktree retained (will be cleaned automatically when /merge-pr runs
from another session):
  worktree: <path>
  branch:   <branch>

To clean up immediately, run /merge-pr from the main repo or another worktree session.
```

---

## Notes

### Worktree behaviour

- `docs/CONTEXT.md` and `docs/superpowers/` are legacy per-worktree files;
  Step 2 removes them before merge (kept for one release, to be dropped next
  minor bump).
- **Never delete the current session's own worktree** — it would make the
  session CWD unreachable and disable all further Bash calls.
- Other sessions' worktrees are safe to remove (Step 0 does this).
- `git worktree remove --force` with `--force` avoids stalling if the
  directory has already been deleted manually.
- `|| true` provides error tolerance for non-fatal cleanup operations.

### General

- Only process the PR for the current conversation's branch; never merge
  unrelated PRs.
- If the branch has only a local checkout with no remote PR, ask the user
  how to proceed.
- Stop and report on merge failure; do not continue.
