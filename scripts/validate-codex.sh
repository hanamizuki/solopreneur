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
# Both gates run to completion and report every failure before exiting, so one
# broken plugin does not mask another.
#
# Usage (from anywhere):
#   ./scripts/validate-codex.sh
#
# Requires: jq, codex (>= 0.144.x; no login needed — plugin installs from a
# local marketplace are pure file operations under CODEX_HOME)

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
if [[ ! -f "$CODEX_MARKETPLACE" ]]; then
  echo "error: $CODEX_MARKETPLACE not found — run ./scripts/generate-codex-manifests.sh first" >&2
  exit 1
fi

fail=0

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

if [[ "$fail" -ne 0 ]]; then
  echo "validate-codex: FAILED" >&2
  exit 1
fi
echo "validate-codex: all gates passed"
