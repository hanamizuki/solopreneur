#!/usr/bin/env bash
# Maintainer script generating the Codex install surfaces from the Claude
# sources of truth. Spec: docs/spec/2026-07-08-codex-dual-publish.md.
#
# Owns exactly three generated surfaces (all committed — installers read the
# repo, there is no build step at install time):
#
#   1. .codex/plugins/<n>/ — a filtered install root for each plugin with at
#      least one registry-included Codex skill. Skill directories are copied
#      byte-for-byte from the canonical tree; a declared shared config.sh is
#      overlaid at the already-supported flattened-layout path. Agent TOMLs are
#      also copied because the install snapshot is the bootstrap skill's only
#      readable source. Canonical plugin roots are never installation roots
#      because Codex's default skills/ discovery would expose every unsupported
#      sibling skill.
#   2. .agents/plugins/marketplace.json — contains only plugins that have a
#      filtered install root, and points at ./.codex/plugins/<name>. Entries
#      carry the documented installation/authentication policy and the overlay
#      category. The marketplace can therefore grow one plugin at a time.
#   3. .codex/agents/*.toml — copies of published
#      plugins/<name>/agents/*.toml so Codex picks the agents up natively for
#      in-repo development. If no published plugin has an agent source, the
#      generator leaves no empty output directory behind.
#
# Everything here is deterministic: same inputs, same bytes out. CI re-runs
# this script and fails on any diff (validate-codex.yml), mirroring the
# validate-vendored drift-check pattern. Codex intentionally does NOT get
# the Claude manifests' `dependencies` field — on Codex, dependencies are
# documentation-only (spec decision 2).
#
# Usage (from anywhere):
#   ./scripts/generate-codex-manifests.sh
#
# Requires: jq, python3 >= 3.9 (TOML parsing uses the bundled Tomli 2.4.1)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAYS="$REPO_ROOT/scripts/codex-manifest-overlays.json"
CLAUDE_MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
CODEX_MARKETPLACE="$REPO_ROOT/.agents/plugins/marketplace.json"
COMPATIBILITY_REGISTRY="$REPO_ROOT/skills-compatibility.json"
CODEX_PLUGIN_ROOT="$REPO_ROOT/.codex/plugins"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1 \
   || ! python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 9))'; then
  echo "error: python3 >= 3.9 is required" >&2
  exit 1
fi

for f in "$OVERLAYS" "$CLAUDE_MARKETPLACE" "$COMPATIBILITY_REGISTRY"; do
  if [[ ! -f "$f" ]]; then
    echo "error: input not found: $f" >&2
    exit 1
  fi
done

# Registry validation is also the publication authorization boundary. Run it
# before deriving any output or deleting an old generated tree.
PYTHONDONTWRITEBYTECODE=1 python3 \
  "$REPO_ROOT/scripts/validate-skills-compatibility.py" "$REPO_ROOT"

# The published plugin set is whatever the Claude marketplace lists — a
# plugins/ directory absent from it is unpublished and gets no Codex surface.
plugins=()
while IFS= read -r name; do plugins+=("$name"); done \
  < <(jq -r '.plugins[].name' "$CLAUDE_MARKETPLACE")

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

# A duplicated name would slip through the set-like 1:1 check below and
# generate a marketplace with two entries resolving the same plugin name —
# silently ambiguous on install. Refuse loudly.
dupes=$(jq -r '[.plugins[].name] | group_by(.) | map(select(length > 1) | .[0]) | .[]' "$CLAUDE_MARKETPLACE")
if [[ -n "$dupes" ]]; then
  echo "error: duplicate plugin names in .claude-plugin/marketplace.json:" >&2
  printf '%s\n' "$dupes" | sed 's/^/       /' >&2
  exit 1
fi

# Overlay entries and marketplace entries must match 1:1 in both directions:
# a plugin without an overlay would silently ship without its Codex-only
# metadata, and a stale overlay entry means the overlay no longer describes
# the marketplace. Refuse loudly instead of guessing either way.
overlay_mismatch=$(jq -r --argjson names "$(jq '[.plugins[].name]' "$CLAUDE_MARKETPLACE")" '
  (($names - keys) | map("missing overlay entry: " + .)),
  ((keys - $names) | map("stale overlay entry (not in marketplace): " + .))
  | .[]' "$OVERLAYS")
if [[ -n "$overlay_mismatch" ]]; then
  echo "error: scripts/codex-manifest-overlays.json out of sync with .claude-plugin/marketplace.json:" >&2
  printf '%s\n' "$overlay_mismatch" | sed 's/^/       /' >&2
  exit 1
fi

# Overlays own Codex-only fields, nothing else. The merge below is
# right-biased (`+ $overlay`), so a reserved key in an overlay entry would
# silently replace the value copied from the Claude manifest — breaking
# version lockstep or the generated `author` publisher metadata while the drift
# check stays green.
# Refuse loudly instead.
reserved=$(jq -r '
  to_entries[]
  | .key as $plugin
  | .value
  | keys[]
  | select(. as $k | ["name", "version", "description", "license", "author", "skills"] | index($k))
  | "\($plugin): \(.)"' "$OVERLAYS")
if [[ -n "$reserved" ]]; then
  echo "error: scripts/codex-manifest-overlays.json sets fields owned by the Claude manifest:" >&2
  printf '%s\n' "$reserved" | sed 's/^/       /' >&2
  exit 1
fi

# The marketplace entries below take their `category` from the overlay's
# interface, so every overlay entry must carry one — a null category would
# generate a marketplace that violates the documented contract.
no_category=$(jq -r 'to_entries[] | select(.value.interface.category == null) | .key' "$OVERLAYS")
if [[ -n "$no_category" ]]; then
  echo "error: overlay entries missing interface.category:" >&2
  printf '%s\n' "$no_category" | sed 's/^/       /' >&2
  exit 1
fi

# Validate every remaining input BEFORE the destructive rebuilds below, so a
# bad source fails the run while the committed artifacts are still intact —
# a mid-loop failure after an rm would leave a half-rebuilt working tree.
for name in "${plugins[@]}"; do
  claude_manifest="$REPO_ROOT/plugins/$name/.claude-plugin/plugin.json"
  if [[ ! -f "$claude_manifest" ]]; then
    echo "error: $claude_manifest not found (marketplace lists '$name')" >&2
    exit 1
  fi

  # All four copied fields are load-bearing on Codex; a null would generate
  # a manifest that installs with broken metadata, so refuse instead.
  if ! jq -e '.name and .version and .description and .license' "$claude_manifest" >/dev/null; then
    echo "error: $claude_manifest is missing one of name/version/description/license" >&2
    exit 1
  fi
done

if ! jq -e '.owner.name | strings | length > 0' "$CLAUDE_MARKETPLACE" >/dev/null; then
  echo "error: .claude-plugin/marketplace.json owner.name is required for Codex manifests" >&2
  exit 1
fi

# Same pre-flight for surface 3. Plugin installation does not parse custom
# agents, so validate their TOML schema, managed identity, vocabulary, sibling
# Claude agent, and cross-plugin uniqueness before rebuilding any output.
PYTHONDONTWRITEBYTECODE=1 python3 \
  "$REPO_ROOT/scripts/validate-codex-agents.py" "$REPO_ROOT"

# --- Surface 1: filtered Codex plugin roots ---------------------------------
# Legacy manifests in canonical plugin roots are removed: even a custom
# manifest `skills` path supplements Codex's default skills/ discovery, so that
# layout cannot enforce publication filtering. The generated root contains no
# canonical sibling skills for Codex to fall back to.
rm -rf "$REPO_ROOT"/plugins/*/.codex-plugin
rm -rf "$CODEX_PLUGIN_ROOT"
for name in "${codex_plugins[@]+"${codex_plugins[@]}"}"; do
  claude_manifest="$REPO_ROOT/plugins/$name/.claude-plugin/plugin.json"
  output_root="$CODEX_PLUGIN_ROOT/$name"
  mkdir -p "$output_root/.codex-plugin" "$output_root/skills"

  while IFS= read -r skill; do
    source_skill="$REPO_ROOT/plugins/$name/skills/$skill"
    output_skill="$output_root/skills/$skill"
    cp -R "$source_skill" "$output_skill"

    # Core skills already resolve this flattened publication seam as their
    # fallback when ../../shared/config.sh is outside the plugin snapshot.
    if jq -e \
      --arg skill_id "$name:$skill" \
      --arg resource "plugins/$name/shared/config.sh" '
        (.skills[$skill_id].platformResources // []) | index($resource) != null
      ' "$COMPATIBILITY_REGISTRY" >/dev/null; then
      mkdir -p "$output_skill/scripts"
      cp "$REPO_ROOT/plugins/$name/shared/config.sh" "$output_skill/scripts/config.sh"
    fi
    echo "generated: .codex/plugins/$name/skills/$skill"
  done < <(jq -r --arg prefix "$name:" '
    .skills
    | to_entries[]
    | select(.key | startswith($prefix))
    | select(.value.publication.codex == "include")
    | (.key | split(":")[1])
  ' "$COMPATIBILITY_REGISTRY")

  for toml in "$REPO_ROOT/plugins/$name"/agents/*.toml; do
    [[ -e "$toml" ]] || continue
    mkdir -p "$output_root/agents"
    cp "$toml" "$output_root/agents/$(basename "$toml")"
  done

  jq \
    --argjson owner "$(jq '.owner' "$CLAUDE_MARKETPLACE")" \
    --argjson overlay "$(jq --arg n "$name" '.[$n]' "$OVERLAYS")" '
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
    ' "$claude_manifest" > "$output_root/.codex-plugin/plugin.json"
  echo "generated: .codex/plugins/$name/.codex-plugin/plugin.json"
done

# --- Surface 2: .agents/plugins/marketplace.json -----------------------------
# Only a plugin with an included skill gets an entry. Policy is uniform: every
# listed plugin is plainly installable and has nothing to authenticate beyond
# install time (no MCP servers shipped today).
mkdir -p "$(dirname "$CODEX_MARKETPLACE")"
jq --slurpfile ovl "$OVERLAYS" --argjson published "$published_names" '{
  name,
  interface: {displayName: "Solopreneur"},
  plugins: [.plugins[]
    | select(.name as $name | $published | index($name))
    | {
    name,
    source: {source: "local", path: ("./.codex/plugins/" + .name)},
    policy: {installation: "AVAILABLE", authentication: "ON_INSTALL"},
    category: $ovl[0][.name].interface.category
  }]
}' "$CLAUDE_MARKETPLACE" > "$CODEX_MARKETPLACE"
echo "generated: .agents/plugins/marketplace.json"

# --- Surface 3: .codex/agents/*.toml -----------------------------------------
# Rebuilt from scratch each run so a deleted source TOML also disappears from
# the generated copy. The directory is generator-owned (see the spec's file
# ownership map) — do not hand-edit it.
rm -rf "$REPO_ROOT/.codex/agents"
copied=0
for name in "${plugins[@]}"; do
  for toml in "$REPO_ROOT/plugins/$name"/agents/*.toml; do
    [[ -e "$toml" ]] || continue # published plugin has no Codex agent
    mkdir -p "$REPO_ROOT/.codex/agents"
    cp "$toml" "$REPO_ROOT/.codex/agents/$(basename "$toml")"
    copied=$((copied + 1))
    echo "generated: .codex/agents/$(basename "$toml")"
  done
done
if [[ "$copied" -eq 0 ]]; then
  # Preserve absence deterministically instead of committing an empty
  # generator-owned directory.
  rmdir "$REPO_ROOT/.codex" 2>/dev/null || true
  echo "no agent TOMLs found — .codex/agents/ not generated"
fi
