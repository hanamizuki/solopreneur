---
name: _shared/config
description: |
  Shared cascade config helper for solopreneur skills. Defines read_solopreneur_config
  and write_solopreneur_config shell functions that read from $CLAUDE_CONFIG_DIR/solopreneur.json
  with fallback to ~/.claude/solopreneur.json.

  This file is NOT a skill — it is a reference document. Skills that need config access
  must inline these function definitions verbatim at the top of their bash blocks.
---

# Solopreneur Config Cascade Helper

All solopreneur skills that read or write `solopreneur.json` must use these helpers
instead of hardcoding `~/.claude/solopreneur.json`. Inline both function definitions
verbatim at the top of each bash block that touches config.

## Why cascade?

Users with multiple Claude Code configs (`CLAUDE_CONFIG_DIR=...`) need per-config
overrides. The cascade reads the per-config primary first; if the requested key is
absent, it falls back to `~/.claude/solopreneur.json` as the shared baseline.
Existing single-config setups see no behavior change — the fallback covers them.

## Read helper

Reads a single top-level key from `solopreneur.json` using per-key cascade:
primary file wins for any key it has; absent keys fall back to `~/.claude`.

```bash
# Reads a top-level key from solopreneur.json with cascade.
# Usage: read_solopreneur_config <key>   # e.g. read_solopreneur_config todos
read_solopreneur_config() {
  local key="$1"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local fallback="$HOME/.claude/solopreneur.json"

  # Primary exists AND has the key set → use primary
  if [ -f "$primary" ] && jq -e "has(\"$key\")" "$primary" >/dev/null 2>&1; then
    jq -r ".${key} // empty" "$primary"
    return
  fi
  # Otherwise fall back to ~/.claude
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    jq -r ".${key} // empty" "$fallback"
  fi
}
```

**Key semantics:**

- Cascade is **per-key**, not per-file. A primary file that only sets `.greenlight`
  still falls back to `~/.claude` for `.todos`. Users override exactly what they want.
- No deep merge. Whichever file wins for a key returns its full subtree as-is.
- `CLAUDE_CONFIG_DIR` is inherited from the parent session's environment (same
  mechanism as `rebuild-skill-index/SKILL.md:30`). The `:-$HOME/.claude` fallback
  keeps the helper safe if the variable is unset.

## Write helper

Writes a top-level key to the primary config only. Re-reads before merging so
concurrent sessions writing different keys don't clobber each other.

```bash
# Writes a top-level key to the primary solopreneur.json.
# Usage: write_solopreneur_config <key> <jq_expression_producing_value>
# Example: write_solopreneur_config todos '{backlog:"todos/backlog",doing:"todos/doing"}'
write_solopreneur_config() {
  local key="$1"
  local value_expr="$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local tmp

  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")

  # Re-read primary at write time (defends against races between concurrent
  # sessions writing different keys). jq -n evaluates value_expr with no input,
  # which correctly handles object literals, strings, and arrays alike.
  local existing
  existing=$(cat "$primary" 2>/dev/null || echo '{}')
  printf '%s\n' "$existing" \
    | jq --argjson v "$(jq -n "$value_expr")" ".${key} = \$v" \
    > "$tmp" || { rm -f "$tmp"; return 1; }

  # Atomic publish: rename is atomic on POSIX filesystems.
  mv "$tmp" "$primary"
}
```

**Key semantics:**

- Always writes to primary (`$CLAUDE_CONFIG_DIR/solopreneur.json`). The shared
  `~/.claude/solopreneur.json` baseline is **never modified by writes** — it
  remains the fallback for all keys the primary does not override.
- `jq -n "$value_expr"` evaluates an arbitrary jq expression with no input,
  which supports object literals (`{a:1,b:2}`), strings, arrays, etc.
- Atomic `mv` means concurrent readers never see a half-written file.
- Creates the primary file (and parent directory) if it does not exist yet.

## Usage in skills

Skills are LLM-interpreted markdown — there is no runtime `source` or `import`
mechanism. Each skill that reads or writes config must copy both function bodies
verbatim into a bash block near the top of its config-access section, like this:

Skills that only read config may inline only `read_solopreneur_config` and omit `write_solopreneur_config` — the write helper is only needed by skills that persist discovered config.

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

write_solopreneur_config() {
  local key="$1"
  local value_expr="$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local tmp
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  local existing
  existing=$(cat "$primary" 2>/dev/null || echo '{}')
  printf '%s\n' "$existing" \
    | jq --argjson v "$(jq -n "$value_expr")" ".${key} = \$v" \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}
# --- end solopreneur config helpers ---
```

When the helper changes, all consuming skills must be re-synced manually from
this file (grep for `# --- solopreneur config helpers` to find all sites).
