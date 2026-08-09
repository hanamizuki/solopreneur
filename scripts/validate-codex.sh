#!/usr/bin/env bash
# Validates the Codex install surfaces. Spec: docs/spec/2026-07-08-codex-dual-publish.md
# (§ Validation). Two of the spec's three gates live here; the third — drift —
# is the CI workflow re-running generate-codex-manifests.sh and failing on any
# diff (validate-codex.yml), so it needs git context this script does not.
#
#   Gate: structure — every first-level directory under plugins/*/skills/ must
#   contain a SKILL.md. Codex 0.142.5 rejected offending plugins at install
#   time; 0.144.1 installs them silently, so this bash check is the only thing
#   standing between a stray helper directory and a broken skill listing.
#
#   Gate: install smoke — add the working tree as a local Codex marketplace
#   under a throwaway CODEX_HOME (never the caller's), then `codex plugin add`
#   every plugin listed in the generated marketplace file. Codex parses and
#   validates each .codex-plugin/plugin.json at plugin-add time (verified: a
#   malformed manifest fails the add; marketplace add alone validates nothing).
#
# The deterministic agent gates run before the install smoke: TOML sources are
# parsed independently of plugin installation, and the bootstrap fixture suite
# exercises conflicts and failures without touching the caller's Codex home.
# The install smoke then executes the cached bootstrap script for a real
# cache-to-user-agent round trip.
#
# Usage (from anywhere):
#   ./scripts/validate-codex.sh
#
# Requires: jq, node >= 20, python3 >= 3.9, codex 0.147.x (no login needed —
# plugin installs from a local marketplace are pure file operations under
# CODEX_HOME)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODEX_MARKETPLACE="$REPO_ROOT/.agents/plugins/marketplace.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi
if ! command -v codex >/dev/null 2>&1; then
  echo "error: codex CLI is required (npm install -g @openai/codex)" >&2
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
  echo "error: $CODEX_MARKETPLACE not found — run ./scripts/generate-codex-manifests.sh first" >&2
  exit 1
fi

fail=0

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
bootstrap_tests=("$REPO_ROOT"/plugins/solopreneur/skills/codex-agents-bootstrap/tests/*.test.mjs)
if ! node --test "${bootstrap_tests[@]}"; then
  fail=1
fi

# --- Gate: structure ---------------------------------------------------------
echo "==> structure: every plugins/*/skills/<dir> has a SKILL.md"
while IFS= read -r -d '' d; do
  if [[ ! -f "$d/SKILL.md" ]]; then
    echo "error: $d has no SKILL.md — Codex treats every directory under skills/ as a skill" >&2
    fail=1
  fi
done < <(find "$REPO_ROOT"/plugins/*/skills -mindepth 1 -maxdepth 1 -type d -print0)

# --- Gate: install smoke ------------------------------------------------------
SMOKE_HOME="$(mktemp -d -t solopreneur-codex-smoke.XXXXXX)"
trap 'rm -rf "$SMOKE_HOME"' EXIT

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

# --- Gate: installed-cache bootstrap integration ----------------------------
echo "==> bootstrap integration: installed cache to user agents"
listing="$(CODEX_HOME="$SMOKE_HOME" codex plugin list --json)"
solopreneur_rel="$(printf '%s' "$listing" | jq -er '
  .installed[]
  | select(.name == "solopreneur" and .marketplaceName == "solopreneur")
  | "\(.marketplaceName)/\(.name)/\(.version)"
')"
marketer_rel="$(printf '%s' "$listing" | jq -er '
  .installed[]
  | select(.name == "marketer" and .marketplaceName == "solopreneur")
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

if [[ "$fail" -ne 0 ]]; then
  echo "validate-codex: FAILED" >&2
  exit 1
fi
echo "validate-codex: all gates passed"
