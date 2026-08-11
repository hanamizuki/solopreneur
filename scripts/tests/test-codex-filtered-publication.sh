#!/usr/bin/env bash
# Hermetic non-empty publication fixture. It exercises the real generator and
# pinned Codex CLI without changing the repository or the caller's Codex home.

set -euo pipefail
trap 'echo "error: filtered-publication fixture failed at line $LINENO" >&2' ERR

REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
FIXTURE_ROOT="$(mktemp -d -t codex-filter-repo.XXXXXX)"
FILTER_HOME="$(mktemp -d -t codex-filter-home.XXXXXX)"
trap 'rm -rf "$FIXTURE_ROOT" "$FILTER_HOME"' EXIT

cp -R \
  "$REPO_ROOT/plugins" \
  "$REPO_ROOT/scripts" \
  "$REPO_ROOT/.claude-plugin" \
  "$REPO_ROOT/docs" \
  "$FIXTURE_ROOT/"
cp "$REPO_ROOT/skills-compatibility.json" "$FIXTURE_ROOT/"

canary_dir="$FIXTURE_ROOT/plugins/solopreneur/skills/filter-canary"
mkdir -p "$canary_dir"
cat > "$canary_dir/SKILL.md" <<'EOF'
---
name: filter-canary
description: Hermetic canary for filtered Codex publication.
---

# Filter Canary
EOF

registry="$FIXTURE_ROOT/skills-compatibility.json"
registry_next="$registry.next"
jq '
  .sourceShapes.shared += ["solopreneur:filter-canary"]
  | .sourceShapes.shared |= sort
  | .skills["solopreneur:filter-canary"] = {
      support: {
        "claude-code": "full",
        "codex-exec": "full",
        "codex-tui": "full",
        "codex-app": "full"
      },
      publication: {codex: "include"},
      sharedContract: "plugins/solopreneur/skills/filter-canary/SKILL.md",
      platformResources: ["plugins/solopreneur/skills/filter-canary/SKILL.md"],
      acceptance: {
        "claude-code": ["plugins/solopreneur/skills/filter-canary/SKILL.md"],
        "codex-exec": ["plugins/solopreneur/skills/filter-canary/SKILL.md"],
        "codex-tui": ["plugins/solopreneur/skills/filter-canary/SKILL.md"],
        "codex-app": ["plugins/solopreneur/skills/filter-canary/SKILL.md"]
      },
      dependencies: []
    }
' "$registry" > "$registry_next"
mv "$registry_next" "$registry"

"$FIXTURE_ROOT/scripts/generate-codex-manifests.sh" >/dev/null

jq -e '
  [.plugins[] | {name, path: .source.path}]
  == [{name: "solopreneur", path: "./.codex/plugins/solopreneur"}]
' "$FIXTURE_ROOT/.agents/plugins/marketplace.json" >/dev/null

generated_skills="$(
  find "$FIXTURE_ROOT/.codex/plugins/solopreneur/skills" \
    -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
)"
[[ "$generated_skills" == "filter-canary" ]]
[[ ! -e "$FIXTURE_ROOT/.codex/plugins/solopreneur/skills/autopilot" ]]

CODEX_HOME="$FILTER_HOME" codex plugin marketplace add "$FIXTURE_ROOT" >/dev/null
CODEX_HOME="$FILTER_HOME" codex plugin add solopreneur@solopreneur >/dev/null
listing="$(CODEX_HOME="$FILTER_HOME" codex plugin list --json)"
cache_relative="$(printf '%s' "$listing" | jq -er '
  .installed[]
  | select(.name == "solopreneur" and .marketplaceName == "solopreneur")
  | "\(.marketplaceName)/\(.name)/\(.version)"
')"
cached_skills="$(
  find "$FILTER_HOME/plugins/cache/$cache_relative/skills" \
    -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
)"
[[ "$cached_skills" == "filter-canary" ]]
[[ ! -e "$FILTER_HOME/plugins/cache/$cache_relative/skills/autopilot" ]]

echo "filtered-publication fixture: included canary only"
