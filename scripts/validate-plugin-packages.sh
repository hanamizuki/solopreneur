#!/usr/bin/env bash
# Validates the generated Claude and Codex packages.
# (§ Validation). Two of the spec's three gates live here; the third — drift —
# is the CI workflow re-running generate-plugin-packages.sh and failing on any
# diff (validate-plugin-packages.yml), so it needs git context this script does not.
#
#   Gate: registry/publication — every canonical skill is classified, every
#   required fail-closed guard is early, and the generated Codex roots contain
#   exactly the registry-included skills.
#
#   Gate: structure — every first-level directory under skills/<plugin>/ must
#   contain a SKILL.md. This keeps canonical discovery deterministic before the
#   filtered publication copy is assembled.
#
#   Gate: install smoke — add the working tree to fresh Claude and Codex homes,
#   then install every plugin each marketplace publishes.
#
# The deterministic agent gates run before the install smoke: TOML sources are
# parsed independently of plugin installation, and the bootstrap fixture suite
# exercises conflicts and failures without touching the caller's Codex home.
# The install smoke then executes the cached bootstrap script for a real
# cache-to-user-agent round trip.
#
# Usage (from anywhere):
#   ./scripts/validate-plugin-packages.sh
#
# Requires: jq, node >= 20, python3 >= 3.9, Claude Code, and Codex (no login
# needed; local marketplace installs only write to throwaway config homes).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_MARKETPLACE="$REPO_ROOT/.agents/plugins/marketplace.json"
CLAUDE_MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
CODEX_PACKAGE_ROOT="$REPO_ROOT/plugins/codex"
CLAUDE_PACKAGE_ROOT="$REPO_ROOT/plugins/claude"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi
if ! command -v codex >/dev/null 2>&1; then
  echo "error: codex CLI is required (npm install -g @openai/codex)" >&2
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "error: Claude Code is required (npm install -g @anthropic-ai/claude-code)" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 \
   || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  echo "error: Node.js >= 20 is required" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1 \
   || ! python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 9))'; then
  echo "error: python3 >= 3.9 is required" >&2
  exit 1
fi
if [[ ! -f "$CODEX_MARKETPLACE" ]]; then
  echo "error: $CODEX_MARKETPLACE not found — run ./scripts/generate-plugin-packages.sh first" >&2
  exit 1
fi

fail=0

# --- Gate: registry ----------------------------------------------------------
echo "==> registry: classification, support evidence, and host guards"
if ! env PYTHONDONTWRITEBYTECODE=1 \
  python3 "$REPO_ROOT/scripts/validate-skills-compatibility.py" "$REPO_ROOT"; then
  fail=1
fi

# --- Gate: custom-agent validator fixtures ----------------------------------
echo "==> agents: hermetic validator fixtures"
if ! env PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s "$REPO_ROOT/scripts/tests" -p 'test_*.py' -v; then
  fail=1
fi

# --- Gate: custom-agent sources ---------------------------------------------
echo "==> agents: TOML schema, identity, sibling, and vocabulary"
if ! env PYTHONDONTWRITEBYTECODE=1 \
  python3 "$REPO_ROOT/scripts/validate-codex-agents.py" "$REPO_ROOT"; then
  fail=1
fi

# --- Gate: bootstrap fixtures ------------------------------------------------
echo "==> bootstrap: hermetic reconciliation fixtures"
bootstrap_tests=("$REPO_ROOT"/skills/solopreneur/codex-agents-bootstrap/tests/*.test.mjs)
if ! node --test "${bootstrap_tests[@]}"; then
  fail=1
fi

# --- Gate: structure ---------------------------------------------------------
echo "==> structure: every skills/<plugin>/<skill> has a SKILL.md"
while IFS= read -r -d '' d; do
  if [[ ! -f "$d/SKILL.md" ]]; then
    echo "error: $d has no SKILL.md — Codex treats every directory under skills/ as a skill" >&2
    fail=1
  fi
done < <(find "$REPO_ROOT"/skills/* -mindepth 1 -maxdepth 1 -type d -print0)

if find "$REPO_ROOT/src" -mindepth 2 -maxdepth 2 -type d -name skills -print -quit \
  | grep -q .; then
  echo "error: src/<plugin>/skills is forbidden; skills/ is the only source" >&2
  fail=1
fi

echo "==> Claude packages: every canonical skill is published byte-for-byte"
while IFS= read -r plugin; do
  if ! cmp -s "$REPO_ROOT/src/$plugin/plugin.json" \
    "$CLAUDE_PACKAGE_ROOT/$plugin/.claude-plugin/plugin.json"; then
    echo "error: Claude package '$plugin' manifest differs from canonical source" >&2
    fail=1
  fi
  if ! diff -qr "$REPO_ROOT/skills/$plugin" "$CLAUDE_PACKAGE_ROOT/$plugin/skills"; then
    echo "error: Claude package '$plugin' does not match its canonical skills" >&2
    fail=1
  fi
  while IFS= read -r -d '' component; do
    if ! diff -qr "$component" "$CLAUDE_PACKAGE_ROOT/$plugin/$(basename "$component")"; then
      echo "error: Claude package '$plugin' component differs: $(basename "$component")" >&2
      fail=1
    fi
  done < <(find "$REPO_ROOT/src/$plugin" -mindepth 1 -maxdepth 1 \
    ! -name plugin.json -print0)
done < <(jq -r '.plugins[].name' "$CLAUDE_MARKETPLACE")

# A vendored sidecar's license pointer is only useful if it resolves where the
# file is actually read — inside an installed package, which has no src/ tree.
# Checked against the generated packages, not the source tree, for that reason.
echo "==> vendored sidecars: license pointers resolve inside the package"
while IFS= read -r -d '' sidecar; do
  # shellcheck disable=SC2016  # the grep patterns below are literals, not expressions
  while IFS= read -r pointer; do
    [[ -n "$pointer" ]] || continue
    if [[ ! -e "$(dirname "$sidecar")/$pointer" ]]; then
      echo "error: ${sidecar#"$REPO_ROOT/"} license pointer does not resolve: $pointer" >&2
      fail=1
    fi
  done < <(grep -o '`\.\./\.\./vendor/LICENSES/[^`]*`' "$sidecar" | tr -d '`')
  if ! grep -q '`\.\./\.\./vendor/LICENSES/' "$sidecar" \
     && grep -q 'vendor/LICENSES/' "$sidecar"; then
    echo "error: ${sidecar#"$REPO_ROOT/"} names a license but no package-relative pointer" >&2
    fail=1
  fi
done < <(find "$CLAUDE_PACKAGE_ROOT" -type f -name _VENDOR.md -print0)

# A Codex package carries only the skills the registry includes plus the seams it
# declares in platformResources — no shared/ and no src/, so the first two
# candidates in the config-helper resolution block cannot resolve there and the
# third, scripts/config.sh, only exists when the skill declared the seam. A skill
# that sources the helpers without declaring them therefore ships a package that
# HALTs on first use. That is a registry mistake, but it is invisible in the
# registry: only the built artifact shows it, so check the artifact.
echo "==> Codex packages: config-helper consumers can resolve a helper"
while IFS= read -r -d '' skill_md; do
  grep -q 'SOLO_CONFIG_SH' "$skill_md" || continue
  skill_dir="$(dirname "$skill_md")"
  resolved=0
  for candidate in ../../shared/config.sh ../../../src/*/shared/config.sh scripts/config.sh; do
    [[ -f "$skill_dir/$candidate" ]] && resolved=1
  done
  if [[ "$resolved" -eq 0 ]]; then
    echo "error: ${skill_md#"$REPO_ROOT/"} sources the config helpers but its package ships none" >&2
    echo "       add src/<plugin>/shared/config.sh to its platformResources" >&2
    fail=1
  fi
done < <(find "$CODEX_PACKAGE_ROOT" -type f -name SKILL.md -print0 2>/dev/null)

# --- Gate: filtered publication ---------------------------------------------
echo "==> publication: generated roots match registry includes"
expected="$(jq -r '
  .skills
  | to_entries[]
  | select(.value.publication.codex == "include")
  | .key
' "$REPO_ROOT/skills-compatibility.json" | sort)"
actual=""
if [[ -d "$CODEX_PACKAGE_ROOT" ]]; then
  while IFS= read -r -d '' skill_md; do
    relative="${skill_md#"$CODEX_PACKAGE_ROOT/"}"
    plugin="${relative%%/*}"
    skill="${relative#*/skills/}"
    skill="${skill%/SKILL.md}"
    actual+="${plugin}:${skill}"$'\n'
  done < <(find "$CODEX_PACKAGE_ROOT" \
    -mindepth 4 -maxdepth 4 -type f -name SKILL.md -print0)
  actual="$(printf '%s' "$actual" | sed '/^$/d' | sort)"
fi
if [[ "$actual" != "$expected" ]]; then
  echo "error: generated Codex skill set does not match skills-compatibility.json" >&2
  printf 'expected:\n%s\nactual:\n%s\n' "$expected" "$actual" >&2
  fail=1
fi

canonical_manifest="$(find "$REPO_ROOT/src" \
  -type d \( -name .codex-plugin -o -name .claude-plugin \) -print -quit)"
if [[ -n "$canonical_manifest" ]]; then
  echo "error: canonical src roots must not carry platform manifest directories" >&2
  fail=1
fi

if jq -e 'all(.plugins[]; .source == ("./plugins/" + .name))' \
  "$CLAUDE_MARKETPLACE" >/dev/null; then
  expected_prefix='./.codex/plugins/'
  install_root="$REPO_ROOT/.codex/plugins"
  while IFS= read -r plugin; do
    if ! diff -qr "$CLAUDE_PACKAGE_ROOT/$plugin" "$REPO_ROOT/plugins/$plugin"; then
      echo "error: legacy Claude bridge '$plugin' differs from its package" >&2
      fail=1
    fi
  done < <(jq -r '.plugins[].name' "$CLAUDE_MARKETPLACE")
  if ! diff -qr "$CODEX_PACKAGE_ROOT" "$REPO_ROOT/.codex/plugins"; then
    echo "error: legacy Codex bridge differs from symmetric packages" >&2
    fail=1
  fi
else
  expected_prefix='./plugins/codex/'
  install_root="$CODEX_PACKAGE_ROOT"
  # Post-cutover the compatibility trees must be gone, and that has to be checked
  # rather than assumed. The generator only deletes them from its symmetric
  # branch, so retiring that branch before a regeneration has actually removed
  # them strands committed, still-installable copies — and every other gate here
  # reads the symmetric roots, so nothing else would notice.
  while IFS= read -r plugin; do
    if [[ -e "$REPO_ROOT/plugins/$plugin" ]]; then
      echo "error: symmetric layout still carries the legacy bridge plugins/$plugin" >&2
      echo "       regenerate before retiring the generator's legacy branch" >&2
      fail=1
    fi
  done < <(jq -r '.plugins[].name' "$CLAUDE_MARKETPLACE")
  if [[ -e "$REPO_ROOT/.codex/plugins" ]]; then
    echo "error: symmetric layout still carries the legacy bridge .codex/plugins" >&2
    fail=1
  fi
fi

while IFS= read -r plugin; do
  source_path="$(jq -r --arg plugin "$plugin" '
    .plugins[] | select(.name == $plugin) | .source.path
  ' "$CODEX_MARKETPLACE")"
  expected_path="$expected_prefix$plugin"
  manifest="$install_root/$plugin/.codex-plugin/plugin.json"
  if [[ "$source_path" != "$expected_path" || ! -f "$manifest" ]]; then
    echo "error: marketplace entry '$plugin' does not resolve to its generated root" >&2
    fail=1
  elif [[ "$(jq -r '.skills // empty' "$manifest")" != "./skills/" ]]; then
    echo "error: $manifest must declare ./skills/" >&2
    fail=1
  fi
done < <(jq -r '.plugins[].name' "$CODEX_MARKETPLACE")

# --- Gate: install smoke ------------------------------------------------------
SMOKE_HOME="$(mktemp -d -t solopreneur-codex-smoke.XXXXXX)"
CLAUDE_SMOKE_HOME="$(mktemp -d -t solopreneur-claude-smoke.XXXXXX)"
trap 'rm -rf "$SMOKE_HOME" "$CLAUDE_SMOKE_HOME"' EXIT

marketplace_name="$(jq -r '.name' "$CODEX_MARKETPLACE")"
echo "==> install smoke: local marketplace '$marketplace_name' in throwaway CODEX_HOME"
if ! CODEX_HOME="$SMOKE_HOME" codex plugin marketplace add "$REPO_ROOT"; then
  echo "error: codex plugin marketplace add failed for $REPO_ROOT" >&2
  exit 1
fi

while IFS= read -r plugin; do
  if CODEX_HOME="$SMOKE_HOME" codex plugin add "$plugin@$marketplace_name"; then
    echo "ok: $plugin"
  else
    echo "error: codex plugin add failed for $plugin" >&2
    fail=1
  fi
done < <(jq -r '.plugins[].name' "$CODEX_MARKETPLACE")

claude_marketplace_name="$(jq -r '.name' "$CLAUDE_MARKETPLACE")"
echo "==> Claude install smoke: all plugins in throwaway CLAUDE_CONFIG_DIR"
if ! CLAUDE_CONFIG_DIR="$CLAUDE_SMOKE_HOME" \
  claude plugin marketplace add "$REPO_ROOT"; then
  echo "error: Claude marketplace add failed for $REPO_ROOT" >&2
  exit 1
fi
while IFS= read -r plugin; do
  if CLAUDE_CONFIG_DIR="$CLAUDE_SMOKE_HOME" \
    claude plugin install "$plugin@$claude_marketplace_name" --scope user; then
    echo "ok: $plugin"
  else
    echo "error: Claude plugin install failed for $plugin" >&2
    fail=1
  fi
done < <(jq -r '.plugins[].name' "$CLAUDE_MARKETPLACE")

# Keep the non-empty publication path covered independently of production
# registry entries with a hermetic canary and a real Codex install.
echo "==> publication fixture: non-empty generated install"
if ! /bin/bash "$REPO_ROOT/scripts/tests/test-codex-filtered-publication.sh" "$REPO_ROOT"; then
  fail=1
fi

# --- Gate: installed-cache bootstrap integration ----------------------------
echo "==> bootstrap integration: installed cache to user agents"
listing="$(CODEX_HOME="$SMOKE_HOME" codex plugin list --json)"
if printf '%s' "$listing" | jq -e --arg marketplace "$marketplace_name" '
  [.installed[] | select(.marketplaceName == $marketplace) | .name] as $names
  | ($names | index("solopreneur")) != null
  and ($names | index("marketer")) != null
' >/dev/null; then
  solopreneur_rel="$(printf '%s' "$listing" | jq -er --arg marketplace "$marketplace_name" '
  .installed[]
  | select(.name == "solopreneur" and .marketplaceName == $marketplace)
  | "\(.marketplaceName)/\(.name)/\(.version)"
')"
  marketer_rel="$(printf '%s' "$listing" | jq -er --arg marketplace "$marketplace_name" '
  .installed[]
  | select(.name == "marketer" and .marketplaceName == $marketplace)
  | "\(.marketplaceName)/\(.name)/\(.version)"
')"
  bootstrap_script="$SMOKE_HOME/plugins/cache/$solopreneur_rel/skills/codex-agents-bootstrap/scripts/install-codex-agents.sh"
  marketer_source="$SMOKE_HOME/plugins/cache/$marketer_rel/agents/marketer.toml"
  marketer_destination="$SMOKE_HOME/agents/marketer.toml"

  if [[ ! -f "$bootstrap_script" || ! -f "$marketer_source" ]]; then
    echo "error: installed plugin cache did not preserve the bootstrap script and marketer agent" >&2
    fail=1
  else
    if bootstrap_output="$(HOME="$SMOKE_HOME/home" CODEX_HOME="$SMOKE_HOME" /bin/bash "$bootstrap_script")"; then
      printf '%s\n' "$bootstrap_output"
      if ! grep -Eq '^Installed:[[:space:]]+marketer\.toml$' <<<"$bootstrap_output" \
         || ! cmp -s "$marketer_source" "$marketer_destination"; then
        echo "error: bootstrap did not install a byte-identical marketer.toml" >&2
        fail=1
      fi
    else
      echo "error: cached bootstrap script failed" >&2
      fail=1
    fi

    if second_output="$(HOME="$SMOKE_HOME/home" CODEX_HOME="$SMOKE_HOME" /bin/bash "$bootstrap_script")"; then
      printf '%s\n' "$second_output"
      if ! grep -Eq '^Unchanged:[[:space:]]+marketer\.toml$' <<<"$second_output"; then
        echo "error: second bootstrap run was not idempotent" >&2
        fail=1
      fi
    else
      echo "error: second cached bootstrap run failed" >&2
      fail=1
    fi
  fi
else
  echo "skipped: bootstrap and marketer are not both in the filtered marketplace"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "validate-plugin-packages: FAILED" >&2
  exit 1
fi
echo "validate-plugin-packages: all gates passed"
