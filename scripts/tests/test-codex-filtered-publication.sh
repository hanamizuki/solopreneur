#!/usr/bin/env bash
# Hermetic non-empty publication fixture. It exercises the real generator and
# pinned Codex CLI without changing the repository or the caller's Codex home.

set -euo pipefail
trap 'echo "error: filtered-publication fixture failed at line $LINENO" >&2' ERR

REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
FIXTURE_ROOT="$(mktemp -d -t codex-filter-repo.XXXXXX)"
FILTER_HOME="$(mktemp -d -t codex-filter-home.XXXXXX)"
SYMMETRIC_CODEX_HOME="$(mktemp -d -t codex-symmetric-home.XXXXXX)"
SYMMETRIC_CLAUDE_HOME="$(mktemp -d -t claude-symmetric-home.XXXXXX)"
trap 'rm -rf "$FIXTURE_ROOT" "$FILTER_HOME" "$SYMMETRIC_CODEX_HOME" "$SYMMETRIC_CLAUDE_HOME"' EXIT

cp -R \
  "$REPO_ROOT/skills" \
  "$REPO_ROOT/src" \
  "$REPO_ROOT/scripts" \
  "$REPO_ROOT/.claude-plugin" \
  "$REPO_ROOT/docs" \
  "$FIXTURE_ROOT/"
cp "$REPO_ROOT/skills-compatibility.json" "$FIXTURE_ROOT/"

canary_dir="$FIXTURE_ROOT/skills/solopreneur/filter-canary"
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
      sharedContract: "skills/solopreneur/filter-canary/SKILL.md",
      platformResources: ["skills/solopreneur/filter-canary/SKILL.md"],
      acceptance: {
        "claude-code": ["skills/solopreneur/filter-canary/SKILL.md"],
        "codex-exec": ["skills/solopreneur/filter-canary/SKILL.md"],
        "codex-tui": ["skills/solopreneur/filter-canary/SKILL.md"],
        "codex-app": ["skills/solopreneur/filter-canary/SKILL.md"]
      },
      dependencies: []
    }
' "$registry" > "$registry_next"
mv "$registry_next" "$registry"

"$FIXTURE_ROOT/scripts/generate-plugin-packages.sh" >/dev/null

jq -e '
  [.plugins[] | {name, path: .source.path}]
  == [{name: "solopreneur", path: "./.codex/plugins/solopreneur"}]
' "$FIXTURE_ROOT/.agents/plugins/marketplace.json" >/dev/null

generated_skills="$(
  find "$FIXTURE_ROOT/.codex/plugins/solopreneur/skills" \
    -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
)"
[[ "$generated_skills" == $'autopilot\nfilter-canary\ngreenlight\nmerge-pr\nplan-review' ]]
[[ -f "$FIXTURE_ROOT/.codex/plugins/solopreneur/skills/autopilot/SKILL.md" ]]

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
[[ "$cached_skills" == $'autopilot\nfilter-canary\ngreenlight\nmerge-pr\nplan-review' ]]
[[ -f "$FILTER_HOME/plugins/cache/$cache_relative/skills/autopilot/SKILL.md" ]]

# Exercise the one-time marketplace cutover branch without changing the real
# repository. Mixed layouts are forbidden by the generator; all entries move
# together and the compatibility copies disappear together.
marketplace="$FIXTURE_ROOT/.claude-plugin/marketplace.json"
marketplace_next="$marketplace.next"
jq '.plugins |= map(.source = ("./plugins/claude/" + .name))' \
  "$marketplace" > "$marketplace_next"
mv "$marketplace_next" "$marketplace"
"$FIXTURE_ROOT/scripts/generate-plugin-packages.sh" >/dev/null

[[ ! -d "$FIXTURE_ROOT/.codex/plugins" ]]
[[ ! -d "$FIXTURE_ROOT/plugins/solopreneur" ]]
[[ -f "$FIXTURE_ROOT/plugins/claude/solopreneur/.claude-plugin/plugin.json" ]]
[[ -f "$FIXTURE_ROOT/plugins/codex/solopreneur/.codex-plugin/plugin.json" ]]
jq -e '
  [.plugins[] | {name, path: .source.path}]
  == [{name: "solopreneur", path: "./plugins/codex/solopreneur"}]
' "$FIXTURE_ROOT/.agents/plugins/marketplace.json" >/dev/null

CODEX_HOME="$SYMMETRIC_CODEX_HOME" codex plugin marketplace add "$FIXTURE_ROOT" >/dev/null
CODEX_HOME="$SYMMETRIC_CODEX_HOME" codex plugin add solopreneur@solopreneur >/dev/null
CLAUDE_CONFIG_DIR="$SYMMETRIC_CLAUDE_HOME" claude plugin marketplace add "$FIXTURE_ROOT" >/dev/null
CLAUDE_CONFIG_DIR="$SYMMETRIC_CLAUDE_HOME" \
  claude plugin install solopreneur@solopreneur --scope user >/dev/null

before_manifest="$(cksum < "$FIXTURE_ROOT/plugins/claude/solopreneur/.claude-plugin/plugin.json")"
jq '.plugins += [{name: "../escape", source: "./plugins/claude/../escape"}]' \
  "$marketplace" > "$marketplace_next"
mv "$marketplace_next" "$marketplace"
if "$FIXTURE_ROOT/scripts/generate-plugin-packages.sh" >/dev/null 2>&1; then
  echo "error: generator accepted an unsafe plugin name" >&2
  exit 1
fi
[[ "$(cksum < "$FIXTURE_ROOT/plugins/claude/solopreneur/.claude-plugin/plugin.json")" == "$before_manifest" ]]

jq 'del(.plugins[-1])' "$marketplace" > "$marketplace_next"
mv "$marketplace_next" "$marketplace"
ln -s missing-resource "$canary_dir/broken-resource"
if "$FIXTURE_ROOT/scripts/generate-plugin-packages.sh" >/dev/null 2>&1; then
  echo "error: generator accepted a dangling canonical symlink" >&2
  exit 1
fi
[[ "$(cksum < "$FIXTURE_ROOT/plugins/claude/solopreneur/.claude-plugin/plugin.json")" == "$before_manifest" ]]

rm "$canary_dir/broken-resource"
transaction_before="$(
  cksum < "$FIXTURE_ROOT/plugins/claude/solopreneur/.claude-plugin/plugin.json"
  cksum < "$FIXTURE_ROOT/plugins/codex/solopreneur/.codex-plugin/plugin.json"
  cksum < "$FIXTURE_ROOT/.agents/plugins/marketplace.json"
)"
fake_bin="$FIXTURE_ROOT/fake-bin"
mkdir -p "$fake_bin"
cat > "$fake_bin/mv" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == */.plugin-packages.*/plugins/codex \
     && "${2:-}" == "$FAIL_TARGET" ]]; then
  exit 71
fi
exec "$REAL_MV" "$@"
EOF
chmod +x "$fake_bin/mv"
source_manifest="$FIXTURE_ROOT/src/solopreneur/plugin.json"
source_backup="$FIXTURE_ROOT/solopreneur-plugin.json.backup"
cp "$source_manifest" "$source_backup"
jq '.description += " staged-failure-canary"' \
  "$source_manifest" > "$source_manifest.next"
mv "$source_manifest.next" "$source_manifest"
if PATH="$fake_bin:$PATH" REAL_MV="$(command -v mv)" \
   FAIL_TARGET="$FIXTURE_ROOT/plugins/codex" \
   "$FIXTURE_ROOT/scripts/generate-plugin-packages.sh" >/dev/null 2>&1; then
  echo "error: generator ignored an injected output-commit failure" >&2
  exit 1
fi
cp "$source_backup" "$source_manifest"
transaction_after="$(
  cksum < "$FIXTURE_ROOT/plugins/claude/solopreneur/.claude-plugin/plugin.json"
  cksum < "$FIXTURE_ROOT/plugins/codex/solopreneur/.codex-plugin/plugin.json"
  cksum < "$FIXTURE_ROOT/.agents/plugins/marketplace.json"
)"
[[ "$transaction_after" == "$transaction_before" ]]
[[ -z "$(find "$FIXTURE_ROOT" -mindepth 1 -maxdepth 1 \
  -type d -name '.plugin-packages.*' -print -quit)" ]]

jq '(.skills[] | .publication.codex) = "exclude"' \
  "$registry" > "$registry_next"
mv "$registry_next" "$registry"
"$FIXTURE_ROOT/scripts/generate-plugin-packages.sh" >/dev/null
[[ -d "$FIXTURE_ROOT/plugins/codex" ]]
[[ -z "$(find "$FIXTURE_ROOT/plugins/codex" -mindepth 1 -print -quit)" ]]
jq -e '.plugins == []' "$FIXTURE_ROOT/.agents/plugins/marketplace.json" >/dev/null

echo "filtered-publication fixture: legacy and symmetric installs passed"
