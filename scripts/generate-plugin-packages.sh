#!/usr/bin/env bash
# Build the committed Claude and Codex plugin packages from skills/ and src/.
# The marketplaces select either the temporary legacy bridge or the symmetric
# package paths; mixed layouts are rejected.

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
LEGACY_CODEX_ROOT="$REPO_ROOT/.codex/plugins"

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

dupes=$(jq -r '[.plugins[].name] | group_by(.) | map(select(length > 1) | .[0]) | .[]' \
  "$CLAUDE_MARKETPLACE")
if [[ -n "$dupes" ]]; then
  echo "error: duplicate plugin names in .claude-plugin/marketplace.json:" >&2
  printf '%s\n' "$dupes" | sed 's/^/       /' >&2
  exit 1
fi

if jq -e 'all(.plugins[]; .source == ("./plugins/" + .name))' \
  "$CLAUDE_MARKETPLACE" >/dev/null; then
  layout=legacy
elif jq -e 'all(.plugins[]; .source == ("./plugins/claude/" + .name))' \
  "$CLAUDE_MARKETPLACE" >/dev/null; then
  layout=symmetric
else
  echo "error: marketplace sources must all use legacy or symmetric package paths" >&2
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
done

PYTHONDONTWRITEBYTECODE=1 python3 \
  "$REPO_ROOT/scripts/validate-codex-agents.py" "$REPO_ROOT"

# Claude packages contain every canonical skill and all non-skill source.
rm -rf "$CLAUDE_PACKAGE_ROOT" "$CODEX_PACKAGE_ROOT"
for name in "${plugins[@]}"; do
  output="$CLAUDE_PACKAGE_ROOT/$name"
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
  output="$CODEX_PACKAGE_ROOT/$name"
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

# The legacy copies keep tagged marketplace installs valid until the first
# release switches both marketplaces to the symmetric paths atomically.
for name in "${plugins[@]}"; do rm -rf "$REPO_ROOT/plugins/$name"; done
rm -rf "$LEGACY_CODEX_ROOT"
if [[ "$layout" == legacy ]]; then
  for name in "${plugins[@]}"; do
    cp -R "$CLAUDE_PACKAGE_ROOT/$name" "$REPO_ROOT/plugins/$name"
  done
  for name in "${codex_plugins[@]+"${codex_plugins[@]}"}"; do
    mkdir -p "$LEGACY_CODEX_ROOT"
    cp -R "$CODEX_PACKAGE_ROOT/$name" "$LEGACY_CODEX_ROOT/$name"
  done
  codex_prefix='./.codex/plugins/'
else
  codex_prefix='./plugins/codex/'
fi

mkdir -p "$(dirname "$CODEX_MARKETPLACE")"
jq --slurpfile overlays "$OVERLAYS" \
  --argjson published "$published_names" \
  --arg prefix "$codex_prefix" '{
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
  }' "$CLAUDE_MARKETPLACE" > "$CODEX_MARKETPLACE"
echo "generated: .agents/plugins/marketplace.json ($layout layout)"

# Project-local agent TOMLs make repository development match installed
# packages. Plugin installation itself does not register custom agents.
rm -rf "$REPO_ROOT/.codex/agents"
copied=0
for name in "${plugins[@]}"; do
  for toml in "$SOURCE_ROOT/$name"/agents/*.toml; do
    [[ -e "$toml" ]] || continue
    mkdir -p "$REPO_ROOT/.codex/agents"
    cp "$toml" "$REPO_ROOT/.codex/agents/$(basename "$toml")"
    copied=$((copied + 1))
  done
done
if [[ "$copied" -eq 0 ]]; then
  rmdir "$REPO_ROOT/.codex" 2>/dev/null || true
fi
