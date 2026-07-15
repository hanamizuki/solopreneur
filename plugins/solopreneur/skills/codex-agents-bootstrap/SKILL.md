---
name: codex-agents-bootstrap
description: |
  Install the agents shipped by solopreneur-family plugins into your Codex
  user agents directory. Codex plugins cannot register subagents at install
  time, so each plugin ships its agent as a TOML file under `agents/` and this
  skill copies those files into `${CODEX_HOME:-$HOME/.codex}/agents/`, where
  Codex loads user agents. Run after installing or updating any
  solopreneur-family plugin (marketer, designer, ios-dev, android-dev,
  ai-engineer, neo4j-dev). Use when the user says "bootstrap codex agents",
  "install codex agents", "set up the agents", or right after a plugin add.
  On Claude Code this is unnecessary — Claude loads each plugin's agent
  markdown directly and ignores the sibling TOML.
---

# Codex Agents Bootstrap

Codex loads a plugin's skills, MCP servers, and hooks at install time, but it
does not register subagents from plugins. The solopreneur-family plugins each
ship their agent twice: `agents/<name>.md` (which Claude Code loads) and
`agents/<name>.toml` (the Codex form). This skill copies every managed
`<name>.toml` out of the installed-plugin cache into your Codex user agents
directory so Codex can spawn them.

Each managed TOML carries the marker line `solopreneur-managed-agent` near the
top. The skill uses that marker two ways: it only copies files that carry it
(so it never touches an unrelated plugin's agents), and it refuses to
overwrite a same-named file in your agents directory that does **not** carry
it (so a hand-authored agent of the same name is never clobbered).

## Step 1: Resolve paths and enumerate managed agent TOMLs

Run this in a shell. It discovers installed plugins via `codex plugin list`
and falls back to scanning the plugin cache directly when JSON or `jq` is
unavailable.

```bash
CODEX_ROOT="${CODEX_HOME:-$HOME/.codex}"
AGENTS_DIR="$CODEX_ROOT/agents"
CACHE_DIR="$CODEX_ROOT/plugins/cache"
MARKER="solopreneur-managed-agent"
mkdir -p "$AGENTS_DIR"

# Preferred: ask Codex which plugins are installed (precise versions).
# Each installed entry gives marketplaceName/name/version, and the plugin's
# files live at $CACHE_DIR/<marketplaceName>/<name>/<version>/.
srcs=()
if command -v jq >/dev/null 2>&1 \
   && listing=$(codex plugin list --json 2>/dev/null) && [ -n "$listing" ]; then
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    for t in "$CACHE_DIR/$rel"/agents/*.toml; do
      [ -e "$t" ] && srcs+=("$t")
    done
  done < <(printf '%s' "$listing" \
             | jq -r '.installed[]? | "\(.marketplaceName)/\(.name)/\(.version)"')
else
  # Fallback: scan the cache (marketplace/plugin/version/agents/*.toml).
  for t in "$CACHE_DIR"/*/*/*/agents/*.toml; do
    [ -e "$t" ] && srcs+=("$t")
  done
fi
```

## Step 2: Copy the managed TOMLs, guarding hand-authored files

```bash
installed=(); updated=(); skipped=(); declare -A managed_names=()

for src in "${srcs[@]}"; do
  grep -q "$MARKER" "$src" || continue          # only our managed agents
  base="$(basename "$src")"
  managed_names["$base"]=1
  dest="$AGENTS_DIR/$base"
  if [ -f "$dest" ] && ! grep -q "$MARKER" "$dest"; then
    skipped+=("$base")                           # hand-authored — never clobber
  elif [ -f "$dest" ]; then
    cp "$src" "$dest"; updated+=("$base")
  else
    cp "$src" "$dest"; installed+=("$base")
  fi
done
```

## Step 3: Detect orphans

A managed TOML left in your agents directory whose plugin is no longer
installed is an orphan (you uninstalled the plugin but its agent lingers).

```bash
orphans=()
for dest in "$AGENTS_DIR"/*.toml; do
  [ -e "$dest" ] || continue
  grep -q "$MARKER" "$dest" || continue          # only ones we manage
  base="$(basename "$dest")"
  [ -n "${managed_names[$base]:-}" ] || orphans+=("$base")
done
```

## Step 4: Report

```bash
printf 'Installed: %s\n' "${installed[*]:-none}"
printf 'Updated:   %s\n' "${updated[*]:-none}"
printf 'Skipped (hand-authored, same name): %s\n' "${skipped[*]:-none}"
printf 'Orphaned (plugin removed):          %s\n' "${orphans[*]:-none}"
```

- Report every orphan to the user. **Delete an orphan only after the user
  confirms** — never remove a file in their agents directory unprompted.
- Codex reads user agents at session start, so tell the user to start a fresh
  Codex session for newly installed agents to become spawnable.
- If nothing was installed or updated, say so plainly (the agents are likely
  already current).
