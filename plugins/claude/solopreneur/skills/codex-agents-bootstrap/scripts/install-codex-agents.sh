#!/usr/bin/env bash
# Reconcile custom agents shipped by the official solopreneur marketplace into
# the active Codex user's agents directory. The script intentionally relies on
# `codex plugin list --json` instead of scanning cache leftovers: an old cache
# snapshot is not proof that its plugin is still installed or enabled.

set -eo pipefail
umask 077

MARKER_PREFIX="# solopreneur-managed-agent v2"
OFFICIAL_MARKETPLACE="solopreneur"

installed=()
updated=()
unchanged=()
skipped=()
skipped_bases=()
inactive=()
orphaned=()
source_paths=()
source_plugins=()
source_agents=()
source_bases=()
source_enabled=()
source_conflicts=()
active_source_keys=()
pending_temp=""
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)" || exit 1
TOML_READER="$SCRIPT_DIR/read-codex-agent-name.py"

cleanup() {
  if [ -n "$pending_temp" ] && [ -e "$pending_temp" ]; then
    rm -f "$pending_temp"
  fi
}
trap cleanup EXIT HUP INT TERM

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: /bin/bash install-codex-agents.sh

Install or refresh managed solopreneur-family agents under
${CODEX_HOME:-$HOME/.codex}/agents. Orphans are reported but never deleted.
EOF
}

print_list() {
  label="$1"
  shift
  printf '%-11s' "$label:"
  if [ "$#" -eq 0 ]; then
    printf ' none\n'
    return
  fi

  separator=""
  for value in "$@"; do
    printf '%s%s' "$separator" "$value"
    separator=", "
  done
  printf '\n'
}

report() {
  print_list "Installed" "${installed[@]}"
  print_list "Updated" "${updated[@]}"
  print_list "Unchanged" "${unchanged[@]}"
  print_list "Skipped" "${skipped[@]}"
  print_list "Inactive" "${inactive[@]}"
  print_list "Orphaned" "${orphaned[@]}"
}

contains() {
  wanted="$1"
  shift
  for candidate in "$@"; do
    [ "$candidate" = "$wanted" ] && return 0
  done
  return 1
}

record_skip() {
  skip_base="$1"
  skip_reason="$2"
  contains "$skip_base" "${skipped_bases[@]}" && return
  skipped_bases+=("$skip_base")
  skipped+=("$skip_base ($skip_reason)")
}

is_family_agent_plugin() {
  case "$1" in
    designer|marketer|ios-dev|android-dev|ai-engineer|neo4j-dev) return 0 ;;
    *) return 1 ;;
  esac
}

is_expected_pair() {
  case "$1:$2" in
    designer:designer|marketer:marketer|ios-dev:ios-dev|android-dev:android-dev|ai-engineer:ai-engineer|neo4j-dev:neo4j-dev) return 0 ;;
    *) return 1 ;;
  esac
}

safe_component() {
  case "$1" in
    ""|.|..|*/*|*\\*) return 1 ;;
  esac
  if printf '%s' "$1" | LC_ALL=C grep -q '[[:cntrl:]]'; then
    return 1
  fi
  return 0
}

first_line() {
  line=""
  IFS= read -r line < "$1" || true
  printf '%s\n' "$line"
}

agent_name() {
  python3 -B "$TOML_READER" "$1" "$2"
}

file_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

# Return the marker's canonical plugin:agent key only when every ownership
# signal agrees. Callers must treat failure as suspicious, never removable.
managed_destination_key() {
  ownership_path="$1"
  ownership_base="${ownership_path##*/}"
  [ ! -L "$ownership_path" ] || return 1
  [ -f "$ownership_path" ] || return 1
  ownership_marker="$(first_line "$ownership_path")"
  ownership_key="$(printf '%s\n' "$ownership_marker" | sed -nE "s/^${MARKER_PREFIX} plugin=([a-z0-9-]+) agent=([a-z0-9_-]+)$/\\1:\\2/p")"
  [ -n "$ownership_key" ] || return 1
  ownership_plugin="${ownership_key%%:*}"
  ownership_agent="${ownership_key#*:}"
  is_expected_pair "$ownership_plugin" "$ownership_agent" || return 1
  [ "$ownership_base" = "$ownership_agent.toml" ] || return 1
  ownership_toml_name="$(agent_name identity "$ownership_path" 2>/dev/null)" || return 1
  [ "$ownership_toml_name" = "$ownership_agent" ] || return 1
  printf '%s\n' "$ownership_key"
}

if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
fi

command -v codex >/dev/null 2>&1 || die "codex CLI is required"
command -v jq >/dev/null 2>&1 || die "jq is required"
if ! command -v python3 >/dev/null 2>&1 \
   || ! python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 9))'; then
  die "python3 >= 3.9 is required"
fi
[ ! -L "$TOML_READER" ] || die "TOML validator is a symlink: $TOML_READER"
[ -f "$TOML_READER" ] || die "TOML validator is missing: $TOML_READER"

if [ -n "${CODEX_HOME:-}" ]; then
  CODEX_ROOT="$CODEX_HOME"
elif [ -n "${HOME:-}" ]; then
  CODEX_ROOT="$HOME/.codex"
else
  die "CODEX_HOME and HOME are both unset"
fi

case "$CODEX_ROOT" in
  /) die "refusing to use / as CODEX_HOME" ;;
  /*) ;;
  *) die "CODEX_HOME must be an absolute path: $CODEX_ROOT" ;;
esac

AGENTS_DIR="$CODEX_ROOT/agents"
CACHE_PARENT="$CODEX_ROOT/plugins"
CACHE_DIR="$CODEX_ROOT/plugins/cache"

listing="$(codex plugin list --json)" || die "codex plugin list --json failed"

# Validate only the solopreneur-family entries. Other installed marketplaces
# are outside this reconciler's authority and must not make it guess at their
# cache layout.
if ! printf '%s' "$listing" | jq -e '
  (.installed | type == "array") and
  ([.installed[]
    | select(.marketplaceName == "solopreneur")
    | select(.name as $name
      | ["designer", "marketer", "ios-dev", "android-dev", "ai-engineer", "neo4j-dev"]
      | index($name))]
    | all(.[];
        (.name | type == "string") and
        (.marketplaceName | type == "string") and
        (.version | type == "string") and
        (.enabled | type == "boolean")))
' >/dev/null; then
  die "codex plugin list --json returned an unsupported schema"
fi

while IFS="$(printf '\t')" read -r marketplace plugin version enabled; do
  [ -n "$plugin" ] || continue
  is_family_agent_plugin "$plugin" || continue
  [ "$marketplace" = "$OFFICIAL_MARKETPLACE" ] || continue

  safe_component "$marketplace" || die "unsafe marketplace component: $marketplace"
  safe_component "$plugin" || die "unsafe plugin component: $plugin"
  safe_component "$version" || die "unsafe version component for $plugin: $version"

  # Only the repository's marketplace is allowed to manage these identities.
  # A third-party marketplace cannot opt into overwriting a managed agent by
  # copying the marker text.
  marketplace_dir="$CACHE_DIR/$marketplace"
  plugin_cache_dir="$marketplace_dir/$plugin"
  version_dir="$plugin_cache_dir/$version"
  for directory in "$CODEX_ROOT" "$CACHE_PARENT" "$CACHE_DIR" "$marketplace_dir" "$plugin_cache_dir" "$version_dir"; do
    [ ! -L "$directory" ] || die "cache path is a symlink: $directory"
    [ -d "$directory" ] || die "installed plugin cache is missing: $directory"
  done

  # A regular source file can still resolve outside the installed snapshot
  # when an intermediate `agents/` component is a symlink. Validate that
  # component explicitly before expanding its TOML glob.
  agents_source_dir="$version_dir/agents"
  [ ! -L "$agents_source_dir" ] \
    || die "managed agents directory is a symlink: $agents_source_dir"
  if [ -e "$agents_source_dir" ] && [ ! -d "$agents_source_dir" ]; then
    die "managed agents path is not a directory: $agents_source_dir"
  fi

  for source in "$agents_source_dir"/*.toml; do
    [ -e "$source" ] || [ -L "$source" ] || continue
    [ ! -L "$source" ] || die "managed source is a symlink: $source"
    [ -f "$source" ] || die "managed source is not a regular file: $source"

    marker="$(first_line "$source")"
    case "$marker" in
      "$MARKER_PREFIX"*) ;;
      *) die "managed source is missing its exact marker: $source" ;;
    esac

    agent="$(agent_name source "$source")" || die "managed source is not valid agent TOML: $source"
    base="${source##*/}"
    expected_marker="$MARKER_PREFIX plugin=$plugin agent=$agent"

    [ "$marker" = "$expected_marker" ] || die "managed marker does not match plugin/name: $source"
    [ "$base" = "$agent.toml" ] || die "agent name does not match filename: $source"
    is_expected_pair "$plugin" "$agent" || die "unexpected managed plugin/agent pair: $plugin/$agent"

    contains "$base" "${source_bases[@]}" && die "duplicate managed agent filename: $base"
    contains "$agent" "${source_agents[@]}" && die "duplicate managed agent identity: $agent"

    source_paths+=("$source")
    source_plugins+=("$plugin")
    source_agents+=("$agent")
    source_bases+=("$base")
    source_enabled+=("$enabled")
    # Disabled sources remain validated and reported as inactive, but they are
    # not active ownership claims. A previously installed managed destination
    # therefore also appears as orphaned for manual config-layer review. That
    # label never proves the file is unused or authorizes its removal.
    if [ "$enabled" = "true" ]; then
      active_source_keys+=("$plugin:$agent")
    fi
  done
done < <(printf '%s' "$listing" | jq -r '
  .installed
  | sort_by(.marketplaceName, .name, .version)
  | .[]
  | [.marketplaceName, .name, .version, (.enabled | tostring)]
  | @tsv
')

if [ -L "$AGENTS_DIR" ]; then
  die "agents directory is a symlink: $AGENTS_DIR"
fi
if [ -e "$AGENTS_DIR" ] && [ ! -d "$AGENTS_DIR" ]; then
  die "agents path is not a directory: $AGENTS_DIR"
fi

# Resolve every enabled source's user-layer identity conflicts before creating
# the agents directory or committing any copy. This preserves the reconciler's
# all-sources preflight guarantee when more managed agents are added later.
for ((index = 0; index < ${#source_paths[@]}; index++)); do
  agent="${source_agents[$index]}"
  base="${source_bases[$index]}"
  enabled="${source_enabled[$index]}"
  destination="$AGENTS_DIR/$base"
  conflict=""
  if [ "$enabled" = "true" ]; then
    conflict="$(python3 -B "$TOML_READER" conflict \
      "$agent" "$AGENTS_DIR" "$destination" "$CODEX_ROOT/config.toml")" \
      || die "cannot validate existing agent identity set"
  fi
  source_conflicts+=("$conflict")
done

# Creating the directory happens only after every source has passed preflight.
# With no current sources and no existing directory, there is nothing to do.
if [ "${#source_paths[@]}" -gt 0 ] && [ ! -d "$AGENTS_DIR" ]; then
  mkdir -p "$AGENTS_DIR" || die "cannot create agents directory: $AGENTS_DIR"
fi

for ((index = 0; index < ${#source_paths[@]}; index++)); do
  source="${source_paths[$index]}"
  plugin="${source_plugins[$index]}"
  agent="${source_agents[$index]}"
  base="${source_bases[$index]}"
  enabled="${source_enabled[$index]}"
  conflict="${source_conflicts[$index]}"
  destination="$AGENTS_DIR/$base"
  expected_marker="$MARKER_PREFIX plugin=$plugin agent=$agent"

  if [ "$enabled" != "true" ]; then
    inactive+=("$base")
    continue
  fi

  if [ -n "$conflict" ]; then
    record_skip "$base" "$conflict"
    continue
  fi
  if [ -L "$destination" ]; then
    record_skip "$base" "destination is a symlink"
    continue
  fi
  if [ -e "$destination" ] && [ ! -f "$destination" ]; then
    record_skip "$base" "destination is not a regular file"
    continue
  fi
  if [ -f "$destination" ]; then
    if [ "$(first_line "$destination")" != "$expected_marker" ]; then
      record_skip "$base" "destination is not managed by this plugin"
      continue
    fi
    if ! destination_agent="$(agent_name identity "$destination" 2>/dev/null)"; then
      record_skip "$base" "managed marker has invalid TOML identity; ownership not proven"
      continue
    fi
    if [ "$destination_agent" != "$agent" ]; then
      record_skip "$base" "managed marker identity does not match $agent; ownership not proven"
      continue
    fi
    if cmp -s "$source" "$destination" && [ "$(file_mode "$destination")" = "600" ]; then
      unchanged+=("$base")
      continue
    fi
  fi

  action="Installed"
  [ -f "$destination" ] && action="Updated"
  pending_temp="$(mktemp "$AGENTS_DIR/.${base}.tmp.XXXXXX")" || {
    report
    die "cannot create a temporary file for $base"
  }
  if ! cp "$source" "$pending_temp" || ! chmod 600 "$pending_temp" || ! cmp -s "$source" "$pending_temp"; then
    report
    die "failed to stage a verified copy of $base"
  fi
  if ! staged_agent="$(agent_name source "$pending_temp" 2>/dev/null)"; then
    report
    die "staged agent identity changed while staging $base"
  fi
  staged_marker="$(first_line "$pending_temp")"
  if [ "$staged_marker" != "$expected_marker" ] || [ "$staged_agent" != "$agent" ]; then
    report
    die "staged agent identity changed while staging $base"
  fi

  # Re-run the same user-layer collision scan immediately before destination
  # ownership checks. This detects ordinary changes made while the verified
  # copy was staged; it is an immediate recheck, not a claim of full atomicity
  # across independent Codex config writers.
  if ! conflict="$(python3 -B "$TOML_READER" conflict \
    "$agent" "$AGENTS_DIR" "$destination" "$CODEX_ROOT/config.toml")"; then
    report
    die "user agent identity set changed while staging $base"
  fi
  if [ -n "$conflict" ]; then
    report
    die "user agent identity set changed while staging $base"
  fi

  # Re-check ownership immediately before the atomic rename. This closes the
  # ordinary race where another process replaces the destination after the
  # first guard but before commit.
  if [ -L "$destination" ] || { [ -e "$destination" ] && [ ! -f "$destination" ]; }; then
    report
    die "destination changed while staging $base"
  fi
  if [ -f "$destination" ]; then
    if [ "$(first_line "$destination")" != "$expected_marker" ]; then
      report
      die "destination ownership changed while staging $base"
    fi
    if ! destination_agent="$(agent_name identity "$destination" 2>/dev/null)" \
       || [ "$destination_agent" != "$agent" ]; then
      report
      die "destination identity changed while staging $base"
    fi
  fi
  if ! mv -f "$pending_temp" "$destination"; then
    report
    die "failed to atomically install $base"
  fi
  pending_temp=""

  if [ "$action" = "Installed" ]; then
    installed+=("$base")
  else
    updated+=("$base")
  fi
done

if [ -d "$AGENTS_DIR" ]; then
  for destination in "$AGENTS_DIR"/*.toml; do
    [ -e "$destination" ] || [ -L "$destination" ] || continue
    if [ -L "$destination" ]; then
      record_skip "${destination##*/}" "suspicious agent symlink; ownership not proven"
      continue
    fi
    if [ ! -f "$destination" ]; then
      record_skip "${destination##*/}" "suspicious non-regular agent path; ownership not proven"
      continue
    fi
    marker="$(first_line "$destination")"
    case "$marker" in
      "$MARKER_PREFIX"*) ;;
      *) continue ;;
    esac

    if ! marker_fields="$(managed_destination_key "$destination")"; then
      record_skip "${destination##*/}" "suspicious managed marker; ownership not proven"
      continue
    fi
    contains "$marker_fields" "${active_source_keys[@]}" \
      || orphaned+=("${destination##*/}")
  done
fi

report
