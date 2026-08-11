# Solopreneur config helpers — the canonical implementation.
#
# Source this file; never execute it. It defines five functions and runs
# nothing:
#
#   solopreneur_repo_key           canonical repo identity (the `.repos` key)
#   solopreneur_config_home        the home this session WRITES to
#   read_solopreneur_config        the five-layer read cascade
#   write_solopreneur_config       write to .default.<key>
#   write_solopreneur_repo_config  write to .repos[<repo-key>].<key>
#
# Why a real `.sh` file rather than shell inlined into the SKILL.md bodies that
# use it: Claude Code substitutes bare `$N` in a skill body on every load and
# consumes the backslash of `\$N`, while Codex substitutes nothing and passes
# the escape through untouched. Those two requirements are mutually exclusive
# at the body level — the same text cannot bind `$1` correctly under both — so
# the positional-parameter shell lives here instead, where no harness rewrites
# it. The bodies carry a one-line `source` of this file (see shared/config.md).
#
# Requires: bash 3.2 (the version macOS ships) and jq.
# Documentation — schema, cascade order, write API, edge cases: shared/config.md

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
  local key="$1"
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
  local key="$1"
  local value_expr="$2"
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
  local key="$1"
  local value_expr="$2"
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
