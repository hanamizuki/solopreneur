---
name: todos-babysit
description: |
  Periodic scanner for backlog and in-progress todos. Cross-references with GitHub
  PR status, reviews unhandled items, maintains worktrees, and notifies via Discord
  (if configured) or terminal output. Presents a confirmation checkpoint before
  executing actions. When the user approves an item, auto-implements in a worktree
  and runs the full review loop. Designed for /loop periodic execution.
  Use when the user says "babysit todos", "sweep backlog", "scan todos",
  "watch backlog", "what todos can I work on", or sets up a periodic loop
  (e.g., `/loop 24h /todos-babysit`).
---

# Babysit Todos

Periodic scanner for backlog and in-progress todos. Cross-references with GitHub
PR status, reviews unhandled items, notifies the user, and auto-implements on approval.

## Config Discovery

Resolve todo directory paths and optional Discord config. Define the config helpers first:

```bash
# --- solopreneur config helpers (inlined from _shared/config.md) ---
# Compute the canonical repo identity used as the key under `.repos` in
# solopreneur.json. Falls back to git toplevel path, then $PWD.
solopreneur_repo_key() {
  local url root
  url=$(git remote get-url origin 2>/dev/null || true)
  if [ -n "$url" ]; then
    # Strip protocol schemes (https/http/ssh/git) and user prefixes (git@)
    # in either order — origin URLs come in many shapes:
    #   https://github.com/owner/repo.git
    #   http://github.com/owner/repo.git
    #   ssh://git@github.com/owner/repo.git
    #   git://github.com/owner/repo.git
    #   git@github.com:owner/repo.git
    url="${url#https://}"; url="${url#http://}"
    url="${url#ssh://}";   url="${url#git://}"
    url="${url#git@}"
    url="${url%.git}"
    # Replace the first `:` with `/` — the scp-style `git@host:owner/repo`
    # form. Bash `${var/pattern/replacement}` parses the second `/` as the
    # delimiter; the chars after it (`/` here) are the replacement, so this
    # produces a single slash, not double. (Tested.)
    url="${url/://}"
    printf '%s\n' "$url"
    return
  fi
  root=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$root" ]; then
    printf '%s\n' "$root"
    return
  fi
  printf '%s\n' "$PWD"
}

# Read a feature subtree from solopreneur.json with the 5-layer cascade:
# 1. primary .repos[<repo-key>].<feature>
# 2. primary .default.<feature>
# 3. fallback .repos[<repo-key>].<feature>
# 4. fallback .default.<feature>
# 5. legacy top-level .<feature> (primary then fallback)
# First non-null wins. Each layer is checked inline (no nested helper
# function — bash function declarations are global, even nested ones, and
# would pollute the user's shell namespace).
read_solopreneur_config() {
  local key="\$1"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local fallback="$HOME/.claude/solopreneur.json"
  local repo_key; repo_key=$(solopreneur_repo_key)
  local out

  # Layer 1: primary .repos[<repo-key>].<feature>
  if [ -f "$primary" ]; then
    out=$(jq -r --arg rk "$repo_key" --arg fk "$key" '.repos[$rk][$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
    # Layer 2: primary .default.<feature>
    out=$(jq -r --arg fk "$key" '.default[$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi

  # Layers 3 + 4: fallback file, only if different from primary
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    out=$(jq -r --arg rk "$repo_key" --arg fk "$key" '.repos[$rk][$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
    out=$(jq -r --arg fk "$key" '.default[$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi

  # Layer 5: legacy top-level — primary then fallback
  if [ -f "$primary" ]; then
    out=$(jq -r --arg fk "$key" '.[$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    out=$(jq -r --arg fk "$key" '.[$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi
}

# Write a feature subtree to .default.<key> in the primary file.
# Sibling keys are preserved (atomic read-modify-write).
# Usage: write_solopreneur_config greenlight '{fallback_order:["codex-bot","gemini"]}'
write_solopreneur_config() {
  local key="\$1"
  local value_expr="\$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local tmp existing
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  existing=$(cat "$primary" 2>/dev/null); [ -z "$existing" ] && existing='{}'
  printf '%s\n' "$existing" \
    | jq --arg fk "$key" --argjson v "$(jq -n "$value_expr")" \
        '.default = ((.default // {}) | .[$fk] = $v)' \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}

# Write a feature subtree to .repos[<repo-key>].<key> in the primary file.
# Sibling repos AND sibling features within the same repo are preserved.
# Usage: write_solopreneur_repo_config preview '{path:"docs/preview"}'
write_solopreneur_repo_config() {
  local key="\$1"
  local value_expr="\$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local repo_key; repo_key=$(solopreneur_repo_key)
  local tmp existing
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  existing=$(cat "$primary" 2>/dev/null); [ -z "$existing" ] && existing='{}'
  printf '%s\n' "$existing" \
    | jq --arg rk "$repo_key" --arg fk "$key" --argjson v "$(jq -n "$value_expr")" \
        '.repos = ((.repos // {}) | .[$rk] = ((.[$rk] // {}) | .[$fk] = $v))' \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}
# --- end solopreneur config helpers ---
```

1. **Check plugin config:**
   ```bash
   read_solopreneur_config todos
   read_solopreneur_config discord
   ```

2. **If no `todos` config** — run the same directory discovery as `/todos-cleanup`:
   scan project for todo directories, confirm with user, save to config.

3. **Discord availability** — auto-detect, no user prompt needed:
   ```bash
   # Check for Discord bot token
   if [ -f ~/.claude/channels/discord/.env ]; then
     source ~/.claude/channels/discord/.env
   fi

   # Also check plugin config for custom token path
   DISCORD_CFG=$(read_solopreneur_config discord)
   TOKEN_PATH=$(echo "${DISCORD_CFG:-{}}" | jq -r '.token_path // empty')
   if [ -n "$TOKEN_PATH" ] && [ -f "$TOKEN_PATH" ]; then
     source "$TOKEN_PATH"
   fi

   DISCORD_AVAILABLE=${DISCORD_BOT_TOKEN:+true}
   ```
   - **Token found** + `discord.channel_id` and `discord.guild_id` in config → use Discord
   - **Token found** but no channel/guild config → Discord available but not configured,
     ask user for channel ID on first run, save to config
   - **No token** → fallback to terminal output (all notifications print inline)

   Discord config format in `${CLAUDE_CONFIG_DIR:-~/.claude}/solopreneur.json`:
   ```json
   {
     "discord": {
       "channel_id": "123456789",
       "guild_id": "987654321",
       "token_path": "~/.claude/channels/discord/.env"
     }
   }
   ```

## Notification Layer

All notifications go through a consistent interface. The skill decides the backend
based on config discovery:

| Action | Discord mode | Terminal mode |
|--------|-------------|---------------|
| Create thread | Create Discord thread | Print `--- [todo title] ---` header |
| Post to thread | Send message to thread | Print under the header |
| Post digest | Send to main channel | Print summary block |
| Check user reply | Fetch thread messages | Use AskUserQuestion tool |

In terminal mode, after presenting all reviews, prompt the user for each item:
```
[todo-title]: go / later / done / skip?
```

## Operating Modes

Babysit runs in one of two modes, detected automatically:

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Interactive** | User invokes directly (`/todos-babysit`) | Show confirmation checkpoint, wait for user decisions |
| **Auto** | Running inside `/loop` | Execute safe operations automatically, only notify for risky actions |

**Auto mode safety principle:** only take actions that are safe to do without human
judgment. Anything that requires a judgment call → notify and stop.

| Action | Interactive | Auto |
|--------|------------|------|
| Housekeeping (worktree rebase, merged cleanup) | Confirm first | Auto-execute |
| Move merged → done | Confirm first | Auto-execute |
| Move stale doing items | Ask user | Notify only |
| Review new backlog items | Execute | Execute |
| Implement (readiness=Auto) | Ask user "go?" | Auto-implement |
| Implement (readiness=Needs Discussion) | Ask user | Notify only |
| /greenlight fails to resolve | Ask user | Stop, leave PR, notify |

## Main Flow

### Phase 1: Pull & Scan

1. `git pull --rebase` to get latest
2. List all `.md` files in **both `$BACKLOG` and `$DOING`**
3. Tag each item with its source directory (`backlog` or `doing`)
4. Fetch PR status:
   ```bash
   gh pr list --state open --json number,title,headRefName,url
   gh pr list --state closed --json number,title,headRefName,url,mergedAt --limit 20
   ```
   Filter closed PRs to last 2 days only (compare `mergedAt`).

### Phase 2: Status Comparison

For each todo file, extract keywords from the filename (strip date prefix
`2026-03-15-` and type prefix `feature-request-` / `bug-`), then match against
PR titles and branch names.

**Classification rules differ by source directory:**

#### $BACKLOG items

| Status | Condition | Proposed Action |
|--------|-----------|-----------------|
| `merged` | Has a merged PR | Move to `$DONE` + cleanup worktree/branch |
| `in_progress` | Has an open PR | Move to `$DOING` + maintain worktree |
| `needs_review` | No matching PR | Run `/todos-review` |
| `unchanged` | Previously reviewed, no status change | Skip |

**Detecting `unchanged`:**
- Discord mode: todo's thread exists and has no user reply after the last bot message
- Terminal mode: skip detection (always re-present)

#### $DOING items

| Status | Condition | Proposed Action |
|--------|-----------|-----------------|
| `merged` | PR merged | Move to `$DONE` + cleanup worktree/branch |
| `in_progress` | PR still open | Maintain worktree (rebase + push) |
| `stale` | No matching PR found | Flag — ask user what to do |

Key difference: `$DOING` items never get `needs_review` (they're already approved
for work). A doing item with no PR is `stale` — possible causes: PR closed without
merge, item manually moved, or branch deleted.

### Phase 3: Confirmation Checkpoint

After classification, present a summary table. Behavior depends on operating mode.

**Summary table (same for both modes):**
```
📊 **Scan Results** ({YYYY-MM-DD HH:MM})

### Backlog ({N} items)
| Todo | Status | PR | Proposed Action |
|------|--------|----|-----------------|
| add-export.md | needs_review | — | Review |
| fix-sync.md | in_progress | #42 | Move to doing + maintain worktree |
| update-ui.md | merged | #38 | Move to done + cleanup |

### Doing ({N} items)
| Todo | Status | PR | Proposed Action |
|------|--------|----|-----------------|
| auth-flow.md | in_progress | #45 | Maintain worktree (rebase) |
| dark-mode.md | merged | #40 | Move to done + cleanup |
| old-feature.md | stale | — | ⚠️ No PR found |
```

**Interactive mode:**
Post/print the table, then wait for user confirmation:
- `yes` / `go` → proceed with all proposed actions
- Override specific items (e.g., "skip add-export, move old-feature to done")
- `stop` → abort the scan
- Stale items: user picks per item (move to backlog / done / keep)

**Auto mode:**
Post/print the table as a notification (no wait). Then auto-proceed with safe
actions only:
- `merged` → auto-move to `$DONE` + cleanup
- `in_progress` → auto-maintain worktree
- `needs_review` → auto-review
- `stale` → **notify only**, do not move (requires human judgment)

### Phase 4: Housekeeping

Execute non-review actions confirmed in Phase 3:

1. **Merged items** (both backlog and doing):
   - Clean up worktree if it exists:
     ```bash
     git worktree remove .worktrees/{slug} --force
     ```
   - Delete local branch:
     ```bash
     git branch -d {branch-name}
     ```
   - Move todo file to `$DONE`

2. **In-progress backlog items** → move to `$DOING`

3. **In-progress items** (both sources) — maintain worktrees:
   - Check for existing worktree:
     ```bash
     git worktree list | grep {branch-name}
     ```
   - **Has worktree** → rebase from main:
     ```bash
     cd .worktrees/{slug} && git fetch origin main && git rebase origin/main
     ```
   - **No worktree** → create one:
     ```bash
     git worktree add .worktrees/{slug} {branch-name}
     ```
   - **Conflict handling:**
     - Simple (< 3 files, clear resolution) → auto-resolve
     - Complex → notify user with conflict file list, wait for instructions
   - Push after successful rebase: `git push --force-with-lease`

4. **Stale items** → execute per user's instruction from Phase 3

Commit all file moves:
```bash
git add -A todos/
git commit -m "chore: babysit — move completed/stale todos"
git push
```

### Phase 5: Review

For each `needs_review` backlog todo, invoke `/todos-review {file-path}`.

Extract from results: Destructiveness, Value, Effort, completion %, recommendation,
and **Readiness** (`Auto` or `Needs Discussion`).

If many `needs_review` items (>10), prioritize:
1. High value + low destructiveness
2. Bug-type items
3. Remaining by date

### Phase 6: Readiness Gate

After review, classify each reviewed todo by readiness:

| Readiness | Criteria (all must be true) | Interactive | Auto |
|-----------|---------------------------|-------------|------|
| `Auto` | Bug fix + Effort=S + Destructiveness=Low + clear spec + no ambiguity | Ask user "go?" | Auto-implement |
| `Needs Discussion` | Any criterion fails | Ask user how to proceed | Notify only |

**Auto mode implementation flow:**
For `Auto`-ready items, proceed directly to the Implementation Flow (below).
If `/greenlight` fails to resolve all issues → **stop**, leave the PR open,
and notify the user. Do not retry or force-merge.

**Interactive mode:**
Present the readiness assessment alongside the review results. User decides
whether to `go` for each item regardless of readiness rating.

### Phase 7: Notify

#### Discord mode

**Find existing threads:**
```bash
TOKEN="$DISCORD_BOT_TOKEN"
DISCORD_CFG=$(read_solopreneur_config discord)
CHANNEL_ID=$(echo "${DISCORD_CFG:-{}}" | jq -r '.channel_id // empty')
GUILD_ID=$(echo "${DISCORD_CFG:-{}}" | jq -r '.guild_id // empty')

# Active threads
curl -s "https://discord.com/api/v10/guilds/$GUILD_ID/threads/active" \
  -H "Authorization: Bot $TOKEN" | \
  jq -r ".threads[] | select(.parent_id==\"$CHANNEL_ID\") | \"\(.id)\t\(.name)\""

# Archived threads
curl -s "https://discord.com/api/v10/channels/$CHANNEL_ID/threads/archived/public" \
  -H "Authorization: Bot $TOKEN" | \
  jq -r '.threads[] | "\(.id)\t\(.name)"'
```

Match threads by keyword overlap with todo title. Create new threads only for
unmatched todos.

**Thread content (new review):**
```
📋 **{todo title}**

| Dimension | Rating |
|-----------|--------|
| Destructiveness | {Low/Medium/High} |
| Value | {Low/Medium/High} |
| Effort | {S/M/L} |
| Completion | {N}% |
| Readiness | {Auto / Needs Discussion} |

**Recommendation**: {summary from todos-review}

---
Reply: `go` — implement / `later` — defer / `done` — mark complete
```

**Status update (existing thread, state changed):**
```
🔄 Status update: found matching PR #{number} ({open/merged})
{PR URL}
```

Skip notification if thread exists and no status change (avoid noise).

**Digest (main channel, after all phases complete):**
```
📊 **Babysit Report** ({YYYY-MM-DD HH:MM})

Scanned: {N} backlog + {M} doing
✅ Completed (merged PR): {n} — moved to done
🔄 In progress (open PR): {n} — worktrees maintained
🆕 New reviews: {n}
⚠️ Stale (doing, no PR): {n}
⏸️ Unchanged: {n}
```

#### Terminal mode

Print the same information inline. After all reviews, prompt for each item:
```
--- {todo title} ---
[review summary table]
Recommendation: {summary}

Action? (go / later / done / skip)
```

### Phase 8: Process User Responses

| User reply | Action |
|-----------|--------|
| `go` / `do it` | Trigger implementation flow (below) |
| `later` / `skip` | Move todo to `$LATER`, confirm |
| `done` | Move todo to `$DONE`, confirm |
| Other text | Treat as discussion, no auto-action |

After moving files:
```bash
git add -A todos/
git commit -m "chore: move {filename} to {done|later}/"
git push
```

## Implementation Flow

When user approves a todo with `go`:

### Step 1: Plan

Based on review results and todo content, create an implementation plan.

### Step 2: Tech Vetting

Invoke `/tech-vetting` to verify the plan against platform best practices.
Report Tech Vetting results to the user — wait for confirmation before proceeding.

### Step 3: Create Worktree & Implement

**Check for existing worktree/PR:**

```bash
# Check open PRs
gh pr list --state open --json headRefName,number | \
  jq '.[] | select(.headRefName | contains("{slug}"))'

# Check existing worktrees
git worktree list | grep {slug}
```

| State | Action |
|-------|--------|
| Has open PR + worktree | Enter worktree, rebase, continue |
| Has open PR + no worktree | Create worktree checking out the PR branch |
| No PR | Create new branch + worktree |

```bash
# Create worktree
git worktree add .worktrees/{slug} -b feature/{slug}
```

Enter the worktree using `EnterWorktree`, implement the feature, then:
```bash
git add -A && git commit -m "feat: {description}"
git push -u origin feature/{slug}
gh pr create --title "{short description}" --body "Implements {todo filename}"
```

### Step 4: Review Loop

Invoke `/greenlight` on the PR. This runs the full review pipeline:
- Phase 1: Internal review (`/simplify`, `/specialist-review`, `/review`, code review skills)
- Phase 2: Consolidate and fix
- Phase 3: External reviewer loop (Codex/Gemini/CodeRabbit)

### Step 5: Wrap Up

After `/greenlight` completes:
1. `ExitWorktree` to return to main repo
2. Move todo: `$BACKLOG` → `$DOING`
3. Notify user with final status:
   ```
   ✅ Implementation complete!
   PR: {url}
   Review: {passed/pending}
   Next: awaiting merge
   ```

## Important Notes

- **Two operating modes**: Interactive (confirm before acting) vs Auto (safe actions only)
- **Readiness gate**: Only bug fixes with S effort, low destructiveness, and clear spec
  can be auto-implemented — everything else requires human approval
- **Auto mode fail-safe**: If `/greenlight` can't resolve issues, stop and leave the PR
  for the user — never force-merge or retry indefinitely
- **Worktree isolation**: Each todo works in an isolated worktree for parallel development
- **Scans both directories**: `$BACKLOG` for new items, `$DOING` for PR tracking and cleanup
- **Auto-cleanup**: Merged PR worktrees and local branches are cleaned up
- **Noise avoidance**: Previously reviewed, unchanged todos are not re-notified
- **Conflict escalation**: Simple conflicts auto-resolved, complex ones escalated to user
- **Tech Vetting gate**: Implementation plan must pass tech-vetting; in interactive mode wait
  for user confirmation
