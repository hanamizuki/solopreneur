#!/usr/bin/env bash
# Maintainer script generating the Codex install surfaces from the Claude
# sources of truth. Spec: docs/spec/2026-07-08-codex-dual-publish.md.
#
# Owns exactly three generated surfaces (all committed — installers read the
# repo, there is no build step at install time):
#
#   1. plugins/<n>/.codex-plugin/plugin.json  — one per plugin listed in
#      .claude-plugin/marketplace.json. `name` / `version` / `description` /
#      `license` copy verbatim from plugins/<n>/.claude-plugin/plugin.json
#      (version lockstep across platforms is structural, not procedural);
#      `"hooks": {}` guards against Codex loading Claude-format hook files;
#      Codex-only fields (`interface`, and anything else Codex may grow)
#      come from the plugin's entry in scripts/codex-manifest-overlays.json.
#   2. .agents/plugins/marketplace.json — mirrors .claude-plugin/
#      marketplace.json entries (name, description, license, source); the
#      `./plugins/<name>` sources make the working tree installable as a
#      local Codex marketplace. Each entry also carries the fields the
#      Codex marketplace contract asks for ("Always include
#      policy.installation, policy.authentication, and category"): a
#      uniform policy, and category taken from the plugin's overlay
#      interface — the CLI installs entries without them, but directory-
#      style consumers may enforce the documented contract.
#   3. .codex/agents/*.toml — copies of plugins/*/agents/*.toml so Codex
#      picks the agents up natively for in-repo development. No TOMLs exist
#      until rollout PR 5a, so this step is a no-op that produces no
#      directory today.
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
# Requires: jq

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAYS="$REPO_ROOT/scripts/codex-manifest-overlays.json"
CLAUDE_MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
CODEX_MARKETPLACE="$REPO_ROOT/.agents/plugins/marketplace.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi

for f in "$OVERLAYS" "$CLAUDE_MARKETPLACE"; do
  if [[ ! -f "$f" ]]; then
    echo "error: input not found: $f" >&2
    exit 1
  fi
done

# The published plugin set is whatever the Claude marketplace lists — a
# plugins/ directory absent from it is unpublished and gets no Codex surface.
plugins=()
while IFS= read -r name; do plugins+=("$name"); done \
  < <(jq -r '.plugins[].name' "$CLAUDE_MARKETPLACE")

# A duplicated name would slip through the set-like 1:1 check below and
# generate a marketplace with two entries resolving the same plugin name —
# silently ambiguous on install. Refuse loudly.
dupes=$(jq -r '[.plugins[].name] | group_by(.) | map(select(length > 1) | .[0]) | .[]' "$CLAUDE_MARKETPLACE")
if [[ -n "$dupes" ]]; then
  echo "error: duplicate plugin names in .claude-plugin/marketplace.json:" >&2
  echo "$dupes" | sed 's/^/       /' >&2
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
  echo "$overlay_mismatch" | sed 's/^/       /' >&2
  exit 1
fi

# Overlays own Codex-only fields, nothing else. The merge below is
# right-biased (`+ $overlay`), so a reserved key in an overlay entry would
# silently replace the value copied from the Claude manifest — breaking
# version lockstep or the hooks guard while the drift check stays green.
# Refuse loudly instead.
reserved=$(jq -r '
  to_entries[]
  | .key as $plugin
  | .value
  | keys[]
  | select(. as $k | ["name", "version", "description", "license", "hooks"] | index($k))
  | "\($plugin): \(.)"' "$OVERLAYS")
if [[ -n "$reserved" ]]; then
  echo "error: scripts/codex-manifest-overlays.json sets fields owned by the Claude manifest:" >&2
  echo "$reserved" | sed 's/^/       /' >&2
  exit 1
fi

# The marketplace entries below take their `category` from the overlay's
# interface, so every overlay entry must carry one — a null category would
# generate a marketplace that violates the documented contract.
no_category=$(jq -r 'to_entries[] | select(.value.interface.category == null) | .key' "$OVERLAYS")
if [[ -n "$no_category" ]]; then
  echo "error: overlay entries missing interface.category:" >&2
  echo "$no_category" | sed 's/^/       /' >&2
  exit 1
fi

# --- Surface 1: per-plugin .codex-plugin/plugin.json ------------------------
# Removed first, then rebuilt from the current marketplace list, so a plugin
# dropped from the marketplace loses its manifest (the deletion shows up as
# drift). Skipping the removal would leave the stale file committed and the
# drift check green — the same rebuild-from-scratch reasoning as surface 3.
rm -rf "$REPO_ROOT"/plugins/*/.codex-plugin
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

  mkdir -p "$REPO_ROOT/plugins/$name/.codex-plugin"
  jq --argjson overlay "$(jq --arg n "$name" '.[$n]' "$OVERLAYS")" \
    '{name, version, description, license, hooks: {}} + $overlay' \
    "$claude_manifest" > "$REPO_ROOT/plugins/$name/.codex-plugin/plugin.json"
  echo "generated: plugins/$name/.codex-plugin/plugin.json"
done

# --- Surface 2: .agents/plugins/marketplace.json -----------------------------
# policy is uniform: every plugin is plainly installable and has nothing to
# authenticate beyond install time (no MCP servers shipped today). category
# reuses the overlay's interface.category rather than duplicating it.
mkdir -p "$(dirname "$CODEX_MARKETPLACE")"
jq --slurpfile ovl "$OVERLAYS" '{
  name,
  plugins: [.plugins[] | {
    name, description, license, source,
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
for toml in "$REPO_ROOT"/plugins/*/agents/*.toml; do
  [[ -e "$toml" ]] || continue # glob matched nothing
  dst="$REPO_ROOT/.codex/agents/$(basename "$toml")"
  if [[ -e "$dst" ]]; then
    echo "error: two plugins ship an agent TOML named $(basename "$toml") — rename one" >&2
    exit 1
  fi
  mkdir -p "$REPO_ROOT/.codex/agents"
  cp "$toml" "$dst"
  copied=$((copied + 1))
  echo "generated: .codex/agents/$(basename "$toml")"
done
if [[ "$copied" -eq 0 ]]; then
  # No agent TOMLs in the repo yet (they arrive in rollout PR 5a); leave no
  # empty directory behind.
  rmdir "$REPO_ROOT/.codex" 2>/dev/null || true
  echo "no agent TOMLs found — .codex/agents/ not generated"
fi
