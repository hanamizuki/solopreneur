---
name: shared/config
description: |
  Shared cascade config helper for solopreneur skills. Defines the four shell
  functions (solopreneur_repo_key, read_solopreneur_config,
  write_solopreneur_config, write_solopreneur_repo_config) that read from and
  write to solopreneur.json with per-repo override support.

  This file is NOT a skill — it is a reference document. Skills that need
  config access must inline these function definitions verbatim at the top of
  their bash blocks.
---

# Solopreneur Config Cascade Helper

All solopreneur skills that read or write `solopreneur.json` must use these
helpers instead of hardcoding paths or recomputing repo identity. Inline the
helper block verbatim at the top of each bash section that touches config.

## Schema

Solopreneur config has two top-level sections:

```jsonc
{
  "default": {
    // settings that apply to every repo lacking an override
    "greenlight": { "fallback_order": ["codex-bot", "codex-cli"] },
    "plans":      { "dir": "docs/plans" },
    "verify":     { "cmd": "make verify" }
  },
  "repos": {
    // per-repo overrides, keyed by normalized repo identity
    "github.com/owner/repo-a": {
      "todos": { "backlog": "todos/backlog", "doing": "todos/doing", ... }
    },
    "github.com/owner/repo-b": {
      "plans":  { "dir": "docs/proposals" },
      "verify": { "cmd": "cargo clippy -- -D warnings && cargo test --lib" }
    }
  }
}
```

A repo key (`github.com/owner/repo` style) is computed from the working repo's
`origin` remote — see `solopreneur_repo_key` below.

## The `verify` feature key

`verify` names the repo's fast, deterministic verify entry point — the single
command greenlight's inner verify loop runs against the working tree after each
fix and before committing (see `skills/greenlight/SKILL.md`, "Inner verify
loop"). Store the command inside a one-field object rather than as a bare
string, following the scalar-wrapper guidance under "Edge case" below: the
object also lets a per-repo entry override-to-disable a global default (a
non-null object wins the cascade; an empty `cmd` then means "skip").

```jsonc
{
  "default": {
    "verify": { "cmd": "make verify" }   // lint + typecheck + fast unit tests
  },
  "repos": {
    // per-repo override; empty cmd disables verify for this repo despite the default
    "github.com/owner/rust-svc": { "verify": { "cmd": "cargo clippy -- -D warnings && cargo test --lib" } },
    "github.com/owner/no-ci":    { "verify": { "cmd": "" } }
  }
}
```

Read it with the cascade helper and pull the command string out (tolerate an
unset key — jq gets empty stdin and must not abort the block):

```bash
VERIFY_CMD=$(read_solopreneur_config verify | jq -r '.cmd // empty' 2>/dev/null)
[ -z "$VERIFY_CMD" ] && echo "NO_VERIFIER" || echo "VERIFY_CMD=$VERIFY_CMD"
```

Keep the command **fast and deterministic** — lint, typecheck, and fast unit
tests only. E2E and security suites belong in CI, never in this command: they
are slow and flaky, and flakiness inside greenlight's bounded retry loop
produces false halts. It is intentionally a **single** command, not a per-size
matrix — the layer that would differ most across sizes (E2E) is exactly the
layer excluded here. A repo with no `verify` configured makes greenlight skip
the inner loop and flag the run as having no objective verifier.

## Lookup order (read)

`read_solopreneur_config <feature>` walks five layers, first non-null wins.
Each layer returns the **whole subtree** for `<feature>` (no merging across
layers):

| # | File                                                  | Path                                |
|---|-------------------------------------------------------|-------------------------------------|
| 1 | primary (`$CLAUDE_CONFIG_DIR/solopreneur.json`)       | `.repos[<repo-key>].<feature>`      |
| 2 | primary                                               | `.default.<feature>`                |
| 3 | fallback (`$HOME/.claude/solopreneur.json`) if differs| `.repos[<repo-key>].<feature>`      |
| 4 | fallback                                              | `.default.<feature>`                |
| 5 | primary, then fallback (legacy fallback)              | `.<feature>` at top level           |

Layer 5 keeps **pre-refactor configs working unchanged** — users do not need
to migrate their JSON. New writes always use the new shape, but reads honor
the old shape if that's all the file has.

`CLAUDE_CONFIG_DIR` is inherited from the parent session (see
`rebuild-skill-index/SKILL.md:30`); `:-$HOME/.claude` makes the helper safe
when the variable is unset.

## Write API

Two writers; both write to the primary file only (fallback is never touched).

- **`write_solopreneur_config <key> <jq_expr>`** — writes to
  `.default.<key>` in primary. Use for user-global preferences (e.g.
  `greenlight.fallback_order`).
- **`write_solopreneur_repo_config <key> <jq_expr>`** — writes to
  `.repos[<repo-key>].<key>` in primary. Use for repo-specific state (e.g.
  `preview.path`, `todos`).

Both helpers preserve sibling keys (atomic read-modify-write via `mktemp` +
`mv`) and create the file + parent directory if missing.

## Edge case: null vs false vs empty string

The cascade uses `| values` (jq's `select(. != null)`) to fall through on
`null` and missing keys, while preserving `false`, `0`, `""`, and empty
objects/arrays at the layer that owns them. That means a per-repo entry
storing `false` (e.g. to explicitly disable a feature for that repo) wins
over the default's truthy value — matching the documented "first non-null
wins" semantics literally.

Shell-side, the helper returns the stringified value via `jq -r`. An empty
string value would be shell-empty after capture and would erroneously fall
through; in practice feature values are objects so this case doesn't
arise in current config schema. Future bool/string features should be
stored under non-empty object wrappers (`{ "enabled": false }`) rather
than as bare scalars to dodge that one ambiguity.

## Repo identity (`solopreneur_repo_key`)

The repo key is derived from the working directory at call time:

1. `git remote get-url origin` → strip scheme (`https://`, `http://`),
   strip trailing `.git`, strip `git@host:` prefix → normalized
   `host/owner/repo`.
2. No `origin` remote → absolute path of `git rev-parse --show-toplevel`.
3. Not in a git repo → `$PWD`.

The bash parameter expansion `${var/://}` only replaces the *first* `:` — so
inputs like `git@github.com:owner/repo` correctly produce
`github.com/owner/repo` even if the path contains additional colons.

## Migration

The legacy fallback layer means **no automatic migration is needed**. Old
configs like:

```jsonc
{
  "greenlight": { "fallback_order": ["codex-bot", "codex-cli"] },
  "todos":      { "backlog": "/abs/path/backlog", ... },
  "preview":    { "paths": { "github.com/owner/repo": "docs/preview" } }
}
```

…keep working as-is via layer 5.

If you want to move into the new shape (e.g. so a per-repo override can sit
above a default), hand-edit the JSON like this:

```jsonc
{
  "default": {
    "greenlight": { "fallback_order": ["codex-bot", "codex-cli"] }
  },
  "repos": {
    "github.com/owner/mojo-apps":  { "todos":  { "backlog": "todos/backlog", ... } },
    "github.com/owner/some-repo":  { "preview": { "path": "docs/preview" } }
  }
}
```

The `preview` skill's old `preview.paths.<repo-key>` subtree migrates to
`repos[<repo-key>].preview.path` (note: singular `path`, plus the value is
the path string directly, not wrapped in another object).

## Helper block (copy verbatim into skills)

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
# Usage: write_solopreneur_config greenlight '{fallback_order:["codex-bot","codex-cli"]}'
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

Skills that only read may omit the two write helpers and `solopreneur_repo_key`
is still required because `read_solopreneur_config` calls it. The cleanest
rule is: inline the **whole block** verbatim. The helper is small and
duplication keeps each skill self-contained at install time (the marketplace
ships each skill as a closed unit; there is no runtime `source` mechanism).

When this file changes, all consuming skills must re-sync. Find the
marker-tagged verbatim copies with:

```bash
grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/
```

One consumer carries a bespoke derivative WITHOUT the marker —
`preview/scripts/deploy.sh`'s `_preview_repo_key`, which re-copies only the
repo-key URL normalization (it anchors at `$DIR` instead of cwd, so it cannot
inline the block verbatim). The marker grep above misses it. List every
normalization copy that lacks the marker (currently just deploy.sh) with
`-F` fixed-string match — a BRE pattern silently matches nothing on BSD grep:

```bash
grep -rlF 'url="${url#git@}"' plugins/solopreneur/skills/ | while read -r f; do grep -LF '# --- solopreneur config helpers' "$f"; done
```
