#!/usr/bin/env bash
# Build the committed Claude and Codex plugin packages from skills/ and src/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
CODEX_MARKETPLACE="$REPO_ROOT/.agents/plugins/marketplace.json"
COMPATIBILITY_REGISTRY="$REPO_ROOT/skills-compatibility.json"
OVERLAYS="$REPO_ROOT/scripts/codex-manifest-overlays.json"
SOURCE_ROOT="$REPO_ROOT/src"
SKILLS_ROOT="$REPO_ROOT/skills"
CLAUDE_PACKAGE_ROOT="$REPO_ROOT/plugins/claude"
CODEX_PACKAGE_ROOT="$REPO_ROOT/plugins/codex"
STAGING_ROOT=""
COMMITTING=0
OUTPUT_STAGED=()
OUTPUT_TARGETS=()
OUTPUT_BACKUPS=()
OUTPUT_BACKED_UP=()
OUTPUT_ACTIVATED=()

cleanup() {
  local i target backup
  local rollback_failed=0
  if [[ "$COMMITTING" -eq 1 ]]; then
    for ((i=${#OUTPUT_TARGETS[@]} - 1; i >= 0; i--)); do
      target="${OUTPUT_TARGETS[$i]}"
      if [[ "${OUTPUT_ACTIVATED[$i]:-0}" -eq 1 ]] \
         && ! rm -rf "$target"; then
        echo "error: failed to remove partial output during rollback: $target" >&2
        rollback_failed=1
      fi
    done
    for ((i=${#OUTPUT_TARGETS[@]} - 1; i >= 0; i--)); do
      target="${OUTPUT_TARGETS[$i]}"
      backup="${OUTPUT_BACKUPS[$i]:-}"
      if [[ "${OUTPUT_BACKED_UP[$i]:-0}" -eq 1 \
            && ( -e "$backup" || -L "$backup" ) ]] \
         && ! mv "$backup" "$target"; then
        echo "error: failed to restore output during rollback: $target" >&2
        rollback_failed=1
      fi
    done
  fi
  if [[ "$rollback_failed" -eq 1 ]]; then
    echo "error: rollback data retained at $STAGING_ROOT" >&2
    return
  fi
  [[ -z "$STAGING_ROOT" ]] || rm -rf "$STAGING_ROOT"
}
trap cleanup EXIT

for command in jq python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "error: $command is required" >&2
    exit 1
  fi
done
if ! python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 9))'; then
  echo "error: python3 >= 3.9 is required" >&2
  exit 1
fi

validate_symlinks() {
  python3 - "$REPO_ROOT" "$@" <<'PY'
import pathlib
import sys

repo = pathlib.Path(sys.argv[1]).resolve(strict=True)
for root_arg in sys.argv[2:]:
    root = pathlib.Path(root_arg)
    for path in root.rglob("*"):
        if not path.is_symlink():
            continue
        try:
            target = path.resolve(strict=True)
            target.relative_to(repo)
        except (FileNotFoundError, RuntimeError, ValueError):
            print(f"error: unsafe or dangling symlink: {path}", file=sys.stderr)
            raise SystemExit(1)
PY
}
for file in "$CLAUDE_MARKETPLACE" "$COMPATIBILITY_REGISTRY" "$OVERLAYS"; do
  if [[ ! -f "$file" ]]; then
    echo "error: input not found: $file" >&2
    exit 1
  fi
done

# This validator is the publication authorization boundary. It runs before
# any generated tree is removed.
PYTHONDONTWRITEBYTECODE=1 python3 \
  "$REPO_ROOT/scripts/validate-skills-compatibility.py" "$REPO_ROOT"

plugins=()
while IFS= read -r name; do plugins+=("$name"); done \
  < <(jq -r '.plugins[].name' "$CLAUDE_MARKETPLACE")
if [[ "${#plugins[@]}" -eq 0 ]]; then
  echo "error: Claude marketplace must list at least one plugin" >&2
  exit 1
fi
for name in "${plugins[@]}"; do
  if [[ ! "$name" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] \
     || [[ "$name" == claude || "$name" == codex ]]; then
    echo "error: unsafe or reserved plugin name: $name" >&2
    exit 1
  fi
done

# A duplicated name would slip through the set-like 1:1 checks below and
# generate a marketplace with two entries resolving the same plugin name —
# silently ambiguous on install. Refuse loudly.
dupes=$(jq -r '[.plugins[].name] | group_by(.) | map(select(length > 1) | .[0]) | .[]' \
  "$CLAUDE_MARKETPLACE")
if [[ -n "$dupes" ]]; then
  echo "error: duplicate plugin names in .claude-plugin/marketplace.json:" >&2
  printf '%s\n' "$dupes" | sed 's/^/       /' >&2
  exit 1
fi

if ! jq -e 'all(.plugins[]; .source == ("./plugins/claude/" + .name))' \
  "$CLAUDE_MARKETPLACE" >/dev/null; then
  echo "error: marketplace sources must use symmetric Claude package paths" >&2
  exit 1
fi

published_names=$(jq '[
  .skills
  | to_entries[]
  | select(.value.publication.codex == "include")
  | (.key | split(":")[0])
] | unique' "$COMPATIBILITY_REGISTRY")
codex_plugins=()
while IFS= read -r name; do codex_plugins+=("$name"); done \
  < <(printf '%s' "$published_names" | jq -r '.[]')

for name in "${codex_plugins[@]+"${codex_plugins[@]}"}"; do
  if ! jq -e --arg name "$name" 'any(.plugins[]; .name == $name)' \
    "$CLAUDE_MARKETPLACE" >/dev/null; then
    echo "error: registry publishes '$name', but Claude marketplace does not list it" >&2
    exit 1
  fi
done

overlay_mismatch=$(jq -r --argjson names "$(jq '[.plugins[].name]' "$CLAUDE_MARKETPLACE")" '
  (($names - keys) | map("missing overlay entry: " + .)),
  ((keys - $names) | map("stale overlay entry: " + .))
  | .[]' "$OVERLAYS")
if [[ -n "$overlay_mismatch" ]]; then
  echo "error: codex manifest overlays do not match the marketplace:" >&2
  printf '%s\n' "$overlay_mismatch" | sed 's/^/       /' >&2
  exit 1
fi

# Overlays own Codex-only fields, nothing else. The merge below is right-biased
# (`+ $overlay`), so a reserved key in an overlay entry would silently replace
# the value copied from the Claude manifest — breaking version lockstep or the
# generated `author` publisher metadata while the drift check stays green.
# Refuse loudly instead.
reserved=$(jq -r '
  to_entries[]
  | .key as $plugin
  | .value | keys[]
  | select(. as $key | ["name", "version", "description", "license", "author", "skills"] | index($key))
  | "\($plugin): \(.)"' "$OVERLAYS")
if [[ -n "$reserved" ]]; then
  echo "error: Codex overlays set manifest-owned fields:" >&2
  printf '%s\n' "$reserved" | sed 's/^/       /' >&2
  exit 1
fi
if ! jq -e 'all(to_entries[]; .value.interface.category | strings | length > 0)' \
  "$OVERLAYS" >/dev/null; then
  echo "error: every Codex overlay needs interface.category" >&2
  exit 1
fi
if ! jq -e '.owner.name | strings | length > 0' "$CLAUDE_MARKETPLACE" >/dev/null; then
  echo "error: Claude marketplace owner.name is required" >&2
  exit 1
fi

for name in "${plugins[@]}"; do
  manifest="$SOURCE_ROOT/$name/plugin.json"
  if [[ ! -f "$manifest" || ! -d "$SKILLS_ROOT/$name" ]]; then
    echo "error: canonical source missing for plugin '$name'" >&2
    exit 1
  fi
  if ! jq -e --arg name "$name" '
    .name == $name and .version and .description and .license
  ' "$manifest" >/dev/null; then
    echo "error: invalid canonical manifest: $manifest" >&2
    exit 1
  fi
  # These names collide with directories the package layout creates, so a source
  # tree carrying one would nest the generated skills instead of replacing them.
  for reserved_entry in skills .claude-plugin .codex-plugin; do
    if [[ -e "$SOURCE_ROOT/$name/$reserved_entry" ]]; then
      echo "error: src/$name/$reserved_entry is reserved for generated output" >&2
      exit 1
    fi
  done
done

# The reverse direction of the check above, and the only thing that makes the
# canonical roots and the marketplace 1:1. Every list this script and the
# validators iterate is derived from .claude-plugin/marketplace.json, so a plugin
# added under skills/ and src/ but never listed there is not "unpublished with a
# warning" — it is invisible: nothing generates it, nothing looks for it, and
# every gate passes because none of them ever asks. Measured on a fixture tree:
# generator exit 0, no output naming it, validate-plugin-packages.sh green.
# Fail closed instead, before anything is generated.
for root in "$SKILLS_ROOT" "$SOURCE_ROOT"; do
  for entry in "$root"/*/; do
    [[ -d "$entry" ]] || continue
    canonical="$(basename "$entry")"
    for name in "${plugins[@]}"; do
      [[ "$canonical" == "$name" ]] && continue 2
    done
    echo "error: canonical root ${root#"$REPO_ROOT/"}/$canonical is not listed in" >&2
    echo "       .claude-plugin/marketplace.json — add the entry or remove the root" >&2
    exit 1
  done
done

validate_symlinks "$SKILLS_ROOT" "$SOURCE_ROOT"

PYTHONDONTWRITEBYTECODE=1 python3 \
  "$REPO_ROOT/scripts/validate-codex-agents.py" "$REPO_ROOT"

# Build every output before replacing a live package. A bad source tree or a
# failed copy therefore leaves the previously generated publication intact.
STAGING_ROOT="$(mktemp -d "$REPO_ROOT/.plugin-packages.XXXXXX")"
STAGED_CLAUDE_PACKAGE_ROOT="$STAGING_ROOT/plugins/claude"
STAGED_CODEX_PACKAGE_ROOT="$STAGING_ROOT/plugins/codex"
STAGED_CODEX_AGENTS="$STAGING_ROOT/.codex/agents"
STAGED_CODEX_MARKETPLACE="$STAGING_ROOT/.agents/plugins/marketplace.json"
mkdir -p "$STAGED_CLAUDE_PACKAGE_ROOT" "$STAGED_CODEX_PACKAGE_ROOT"

# Claude packages contain every canonical skill and all non-skill source.
for name in "${plugins[@]}"; do
  output="$STAGED_CLAUDE_PACKAGE_ROOT/$name"
  mkdir -p "$output/.claude-plugin"
  cp "$SOURCE_ROOT/$name/plugin.json" "$output/.claude-plugin/plugin.json"
  while IFS= read -r -d '' component; do
    cp -R "$component" "$output/"
  done < <(find "$SOURCE_ROOT/$name" -mindepth 1 -maxdepth 1 \
    ! -name plugin.json -print0)
  cp -R "$SKILLS_ROOT/$name" "$output/skills"
  echo "generated: plugins/claude/$name"
done

# Codex packages contain only registry-included skills plus declared seams.
for name in "${codex_plugins[@]+"${codex_plugins[@]}"}"; do
  manifest="$SOURCE_ROOT/$name/plugin.json"
  output="$STAGED_CODEX_PACKAGE_ROOT/$name"
  mkdir -p "$output/.codex-plugin" "$output/skills"

  while IFS= read -r skill; do
    cp -R "$SKILLS_ROOT/$name/$skill" "$output/skills/$skill"
    if jq -e \
      --arg skill_id "$name:$skill" \
      --arg resource "src/$name/shared/config.sh" '
        (.skills[$skill_id].platformResources // []) | index($resource) != null
      ' "$COMPATIBILITY_REGISTRY" >/dev/null; then
      mkdir -p "$output/skills/$skill/scripts"
      cp "$SOURCE_ROOT/$name/shared/config.sh" "$output/skills/$skill/scripts/config.sh"
    fi
  done < <(jq -r --arg prefix "$name:" '
    .skills
    | to_entries[]
    | select(.key | startswith($prefix))
    | select(.value.publication.codex == "include")
    | (.key | split(":")[1])
  ' "$COMPATIBILITY_REGISTRY")

  # Second declared seam: a skill that lists the shared preview config schema
  # gets it at the PACKAGE level (shared/config.schema.json), because that is
  # where config-resolve.mjs walks to from scripts/ (../../../shared/).
  if jq -e \
    --arg prefix "$name:" \
    --arg resource "src/$name/shared/config.schema.json" '
      [.skills | to_entries[]
       | select(.key | startswith($prefix))
       | select(.value.publication.codex == "include")
       | .value.platformResources // []]
      | flatten | index($resource) != null
    ' "$COMPATIBILITY_REGISTRY" >/dev/null; then
    mkdir -p "$output/shared"
    cp "$SOURCE_ROOT/$name/shared/config.schema.json" "$output/shared/config.schema.json"
  fi

  for toml in "$SOURCE_ROOT/$name"/agents/*.toml; do
    [[ -e "$toml" ]] || continue
    mkdir -p "$output/agents"
    cp "$toml" "$output/agents/$(basename "$toml")"
  done

  jq \
    --argjson owner "$(jq '.owner' "$CLAUDE_MARKETPLACE")" \
    --argjson overlay "$(jq --arg name "$name" '.[$name]' "$OVERLAYS")" '
      . as $manifest
      | {
          name,
          version,
          description,
          license,
          author: $owner,
          skills: "./skills/",
          interface: ({
            displayName: ($overlay.interface.displayName // $manifest.name),
            shortDescription: $manifest.description,
            longDescription: $manifest.description,
            developerName: $owner.name,
            category: $overlay.interface.category,
            capabilities: $overlay.interface.capabilities,
            defaultPrompt: ["Help me use \($overlay.interface.displayName // $manifest.name)."]
          } + $overlay.interface)
        }
        + ($overlay | del(.interface))
    ' "$manifest" > "$output/.codex-plugin/plugin.json"
  echo "generated: plugins/codex/$name"
done

mkdir -p "$(dirname "$STAGED_CODEX_MARKETPLACE")"
jq --slurpfile overlays "$OVERLAYS" \
  --argjson published "$published_names" \
  --arg prefix './plugins/codex/' '{
    name,
    interface: {displayName: "Solopreneur"},
    plugins: [.plugins[]
      | select(.name as $name | $published | index($name))
      | {
          name,
          source: {source: "local", path: ($prefix + .name)},
          policy: {installation: "AVAILABLE", authentication: "ON_INSTALL"},
          category: $overlays[0][.name].interface.category
        }
    ]
  }' "$CLAUDE_MARKETPLACE" > "$STAGED_CODEX_MARKETPLACE"

# Project-local agent TOMLs make repository development match installed
# packages. Plugin installation itself does not register custom agents.
copied=0
for name in "${plugins[@]}"; do
  for toml in "$SOURCE_ROOT/$name"/agents/*.toml; do
    [[ -e "$toml" ]] || continue
    mkdir -p "$STAGED_CODEX_AGENTS"
    cp "$toml" "$STAGED_CODEX_AGENTS/$(basename "$toml")"
    copied=$((copied + 1))
  done
done

validate_symlinks "$STAGING_ROOT"

queue_output() {
  OUTPUT_STAGED+=("$1")
  OUTPUT_TARGETS+=("$2")
}

commit_outputs() {
  local count="${#OUTPUT_TARGETS[@]}"
  local i staged target backup

  mkdir -p "$STAGING_ROOT/backups"
  COMMITTING=1
  for ((i=0; i<count; i++)); do
    target="${OUTPUT_TARGETS[$i]}"
    backup="$STAGING_ROOT/backups/$i"
    OUTPUT_BACKUPS[i]="$backup"
    if [[ -e "$target" || -L "$target" ]]; then
      OUTPUT_BACKED_UP[i]=1
      mv "$target" "$backup"
    fi
  done
  for ((i=0; i<count; i++)); do
    staged="${OUTPUT_STAGED[$i]}"
    target="${OUTPUT_TARGETS[$i]}"
    [[ -n "$staged" ]] || continue
    mkdir -p "$(dirname "$target")"
    OUTPUT_ACTIVATED[i]=1
    mv "$staged" "$target"
  done
  COMMITTING=0
  rm -rf "$STAGING_ROOT/backups"
}

queue_output "$STAGED_CLAUDE_PACKAGE_ROOT" "$CLAUDE_PACKAGE_ROOT"
queue_output "$STAGED_CODEX_PACKAGE_ROOT" "$CODEX_PACKAGE_ROOT"
if [[ "$copied" -gt 0 ]]; then
  queue_output "$STAGED_CODEX_AGENTS" "$REPO_ROOT/.codex/agents"
else
  queue_output "" "$REPO_ROOT/.codex/agents"
fi
queue_output "$STAGED_CODEX_MARKETPLACE" "$CODEX_MARKETPLACE"

commit_outputs
echo "generated: .agents/plugins/marketplace.json (symmetric layout)"
