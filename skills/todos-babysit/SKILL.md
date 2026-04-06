---
name: todos-babysit
description: |
  Periodic backlog scanner that cross-references todos with GitHub PR status,
  runs /todos-review on unhandled items, and notifies via Discord (if configured)
  or terminal output. When the user approves an item, auto-implements in a worktree
  and runs the full review loop. Designed for /loop periodic execution.
  Use when the user says "babysit todos", "sweep backlog", "scan todos",
  "watch backlog", "what todos can I work on", or sets up a periodic loop
  (e.g., `/loop 30m /todos-babysit`).
---

# Babysit Todos

Periodic scanner for the backlog directory. Cross-references with GitHub PR status,
reviews unhandled todos, notifies the user, and auto-implements on approval.

## Config Discovery

Resolve todo directory paths and optional Discord config:

1. **Check plugin config:**
   ```bash
   jq -r '.todos // empty' ~/.claude/solopreneur.json 2>/dev/null
   jq -r '.discord // empty' ~/.claude/solopreneur.json 2>/dev/null
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
   TOKEN_PATH=$(jq -r '.discord.token_path // empty' ~/.claude/solopreneur.json 2>/dev/null)
   if [ -n "$TOKEN_PATH" ] && [ -f "$TOKEN_PATH" ]; then
     source "$TOKEN_PATH"
   fi

   DISCORD_AVAILABLE=${DISCORD_BOT_TOKEN:+true}
   ```
   - **Token found** + `discord.channel_id` and `discord.guild_id` in config → use Discord
   - **Token found** but no channel/guild config → Discord available but not configured,
     ask user for channel ID on first run, save to config
   - **No token** → fallback to terminal output (all notifications print inline)

   Discord config format in `~/.claude/solopreneur.json`:
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

## Main Flow

### Phase 1: Pull & Scan

1. `git pull --rebase` to get latest
2. List all `.md` files in `$BACKLOG`
3. Fetch PR status:
   ```bash
   gh pr list --state open --json number,title,headRefName,url
   gh pr list --state closed --json number,title,headRefName,url,mergedAt --limit 20
   ```
   Filter closed PRs to last 2 days only (compare `mergedAt`).

### Phase 2: Status Comparison

For each todo file:

1. **Extract keywords**: From filename — strip date prefix (`2026-03-15-`) and
   type prefix (`feature-request-` / `bug-`).
2. **Match PRs**: Search keywords against PR titles and branch names.
3. **Classify**:
   - `merged` — has a merged PR → clean up worktree/branch, suggest moving to `$DONE`
   - `in_progress` — has an open PR → maintain worktree (Phase 2.5)
   - `needs_review` — no matching PR → run review
   - `unchanged` — previously reviewed with no status change → skip

   **Detecting `unchanged`:**
   - Discord mode: check if the todo's thread exists and has no user reply after the last bot message
   - Terminal mode: skip detection (always re-present in terminal)

### Phase 2.5: Worktree Maintenance

#### For `in_progress` todos (open PR):

1. Check for existing worktree:
   ```bash
   git worktree list | grep {branch-name}
   ```
2. **Has worktree** → rebase from main:
   ```bash
   cd .worktrees/{slug} && git fetch origin main && git rebase origin/main
   ```
3. **No worktree** → create one:
   ```bash
   git worktree add .worktrees/{slug} {branch-name}
   ```
4. **Conflict handling:**
   - Simple (< 3 files, clear resolution) → auto-resolve
   - Complex → notify user with conflict file list, wait for instructions
5. Push after successful rebase: `git push --force-with-lease`

#### For `merged` todos:

1. Clean up worktree if it exists:
   ```bash
   git worktree remove .worktrees/{slug} --force
   ```
2. Delete local branch:
   ```bash
   git branch -d {branch-name}
   ```
3. Notify user, suggest moving to `$DONE`

### Phase 3: Review

For each `needs_review` todo, invoke `/todos-review {file-path}`.

Extract from results: Destructiveness, Value, Effort, completion %, recommendation.

If many `needs_review` items (>10), prioritize:
1. High value + low destructiveness
2. Bug-type items
3. Remaining by date

### Phase 4: Notify

#### Discord mode

**Find existing threads:**
```bash
TOKEN="$DISCORD_BOT_TOKEN"
CHANNEL_ID=$(jq -r '.discord.channel_id' ~/.claude/solopreneur.json)
GUILD_ID=$(jq -r '.discord.guild_id' ~/.claude/solopreneur.json)

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

**Digest (main channel):**
```
📊 **Backlog Scan** ({YYYY-MM-DD HH:MM})

Scanned {N} todos
✅ Completed (merged PR): {n}
🔄 In progress (open PR): {n}
🆕 New reviews: {n}
⏸️ Unchanged: {n}

{list items suggested for moving to done/}
```

#### Terminal mode

Print the same information inline. After all reviews, prompt for each item:
```
--- {todo title} ---
[review summary table]
Recommendation: {summary}

Action? (go / later / done / skip)
```

### Phase 5: Process User Responses

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

### Step 2: Preflight

Invoke `/preflight` to verify the plan against platform best practices.
Report preflight results to the user — wait for confirmation before proceeding.

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

- **No auto-implementation**: All implementation requires user approval (`go`)
- **Worktree isolation**: Each todo works in an isolated worktree for parallel development
- **No auto-move on merge**: Merged todos are suggested for `$DONE` but not auto-moved
- **Auto-cleanup**: Merged PR worktrees and local branches are cleaned up automatically
- **Noise avoidance**: Previously reviewed, unchanged todos are not re-notified
- **Conflict escalation**: Simple conflicts auto-resolved, complex ones escalated to user
- **Preflight gate**: Implementation plan must pass preflight; wait for user confirmation
