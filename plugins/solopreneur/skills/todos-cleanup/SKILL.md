---
name: todos-cleanup
description: |
  Batch cleanup of backlog todos — checks which items are already completed or
  partially done by searching git history, then moves them to done/ or doing/.
  Use when the user says "cleanup todos", "triage backlog", "clean up backlog",
  "check todos status", or wants to classify backlog items based on actual
  implementation status.
---

# Todos Cleanup

Scan the backlog directory and classify each item by checking git history for
related commits. Present findings for user confirmation, then move files.

## Config Discovery

Before scanning, resolve the todo directory paths. Define the config helpers first:

```bash
# --- solopreneur config helpers (inlined from shared/config.md) ---
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

# The config home this session WRITES to: the one owned by the harness that is
# actually running. Codex exports CODEX_THREAD_ID on every session, while
# CODEX_HOME exists only when the user sets one — so the thread ID identifies
# the harness and CODEX_HOME merely relocates its home. Anything that is not
# Codex expands to the historical Claude expression character for character,
# so existing installs behave exactly as before.
solopreneur_config_home() {
  if [ -n "${CODEX_THREAD_ID:-}" ]; then
    printf '%s\n' "${CODEX_HOME:-$HOME/.codex}"
  else
    printf '%s\n' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
  fi
}

# Read a feature subtree from solopreneur.json with the 5-layer cascade:
# 1. this session's config home .repos[<repo-key>].<feature>
# 2. this session's config home .default.<feature>
# 3. the next config home       .repos[<repo-key>].<feature>
# 4. the next config home       .default.<feature>
# 5. legacy top-level .<feature>, visiting the homes in that same order
# First non-null wins. Reads visit every harness's home rather than detecting
# one: a machine with a single harness has a single real file, and a machine
# with both gets a deterministic order instead of a guess. Duplicates are
# dropped, so the common case still touches exactly one file.
read_solopreneur_config() {
  local key="\$1"
  local repo_key; repo_key=$(solopreneur_repo_key)
  local h f out seen=""
  local files=()
  for h in "$(solopreneur_config_home)" "$HOME/.claude" "${CODEX_HOME:-$HOME/.codex}"; do
    f="$h/solopreneur.json"
    case "$seen" in *"|$f|"*) continue ;; esac
    seen="$seen|$f|"
    [ -f "$f" ] && files+=("$f")
  done
  # Guard the expansions below: "${files[@]}" on an empty array is an error
  # under `set -u` in the bash 3.2 that ships with macOS.
  # `return 0`, never a bare `return`: "no value configured" is a normal answer,
  # and a non-zero status here would abort any caller running under `set -e`.
  [ ${#files[@]} -gt 0 ] || return 0

  # Layers 1-4: current schema, each file in order.
  for f in "${files[@]}"; do
    out=$(jq -r --arg rk "$repo_key" --arg fk "$key" '.repos[$rk][$fk] | values' "$f" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
    out=$(jq -r --arg fk "$key" '.default[$fk] | values' "$f" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  done

  # Layer 5: legacy top-level, same file order.
  for f in "${files[@]}"; do
    out=$(jq -r --arg fk "$key" '.[$fk] | values' "$f" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  done
  return 0
}

# Write a feature subtree to .default.<key> in the primary file.
# Sibling keys are preserved (atomic read-modify-write).
# Usage: write_solopreneur_config greenlight '{fallback_order:["codex-bot","codex-cli"]}'
write_solopreneur_config() {
  local key="\$1"
  local value_expr="\$2"
  local primary="$(solopreneur_config_home)/solopreneur.json"
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
  local primary="$(solopreneur_config_home)/solopreneur.json"
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
   ```
   If the `todos` key exists, use its `backlog`, `done`, `doing`, `later` values.

2. **If no config — scan the project:**
   Search for directories that look like todo/task storage:
   ```bash
   # Common patterns
   find . -maxdepth 3 -type d \( -name "todos" -o -name "todo" -o -name "TODO" \
     -o -name "backlog" -o -name "tasks" -o -name ".todos" \) 2>/dev/null
   ```
   For each candidate, count `.md` files inside. Present findings:
   ```
   Found potential todo directories:
     a) todos/backlog/ (12 .md files)
     b) tasks/ (5 .md files)
   Which is your backlog directory? (or enter a custom path)
   ```

3. **Save to config** after user confirms. Discovered paths are
   repo-relative (`todos/backlog` etc.), so the per-repo write helper
   anchors them to this repo's entry:
   ```bash
   write_solopreneur_repo_config todos '{
     "backlog": "todos/backlog",
     "done": "todos/done",
     "doing": "todos/doing",
     "later": "todos/later"
   }'
   ```
   Substitute user-confirmed paths into the JSON. Each repo gets its own
   entry — running this skill in a different repo will not clobber this
   one's setting.

Use the resolved paths for all subsequent steps. Variables below:
- `$BACKLOG` — backlog directory (e.g., `todos/backlog`)
- `$DONE` — done directory (e.g., `todos/done`)
- `$DOING` — doing directory (e.g., `todos/doing`)

## Classification Rules

| Status | Criteria | Action |
|--------|----------|--------|
| **DONE** | Found commits that fully implement the todo's requirements | Move to `$DONE` |
| **PARTIAL** | Some related commits exist, but not all requirements met | Move to `$DOING` |
| **OPEN** | No related commits found | Stay in `$BACKLOG` |

## Workflow

### Step 1: Gather file list

List all `.md` files in `$BACKLOG`. If empty, tell the user and stop.

### Step 2: Spawn sonnet subagent for analysis

Spawn a single **sonnet** subagent (`model: "sonnet"`) with this prompt:

```
Read each todo file in {$BACKLOG} and determine its implementation status
by searching git history. For each file:

1. Read the file to understand what the task requires
2. Extract 3-5 search keywords from the title and content
3. Run `git log --oneline --all --grep="keyword"` for each keyword
4. If commits are found, read the commit messages to judge completeness
5. Classify as DONE / PARTIAL / OPEN

Files to check:
[list of file paths]

Report a markdown table:
| File | Status | Evidence |
|------|--------|----------|
| filename.md | DONE/PARTIAL/OPEN | commit hash + message, or "no related commits" |

Be conservative — only mark DONE if the commits clearly cover the full scope
described in the todo. If unsure, mark PARTIAL.
```

### Step 3: Present results and confirm

Show the subagent's table to the user. Ask for confirmation before moving files.
The user may override individual classifications.

### Step 4: Move files

After confirmation:
- DONE items → `$DONE`
- PARTIAL items → `$DOING`
- OPEN items → no action

Create target directories if they don't exist.

Report the final state:
```
todos/
├── backlog/   (N files remaining)
├── doing/     (N files)
├── done/      (N files)
└── later/     (N files)
```

## Important

- Never delete todo files — only move them
- Always confirm with user before moving
- The subagent does research only — it must not modify or delete any files
