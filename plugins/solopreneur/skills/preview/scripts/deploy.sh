#!/usr/bin/env bash
# preview skill: deploy a directory to Vercel and print the URL.
#
# Usage:  deploy.sh [--bucket default|keep|public] [--print-project] <dir>
# Output: a single line — the deployment URL on stdout.
#         All progress / errors go to stderr.
#
# Strategy:
# - Always runs preflight first (vercel CLI + auth check).
# - The Vercel project name resolves in this order:
#     1. $PREVIEW_PROJECT (if set) — used verbatim, highest priority.
#     2. --bucket keep|public -> the configured project for that bucket
#        (solopreneur.json: default.preview.projects.<bucket>). Fail closed:
#        if the bucket has no configured project, exit with an error — an
#        explicit bucket must never silently fall back (a public-bucket
#        fallback would deploy to the wrong project AND skip protection).
#     3. The configured default bucket (default.preview.projects.default).
#     4. Legacy derivation: basename of the proposal dir's enclosing git
#        repo (or the dir's parent outside a repo) + "-preview", sanitized.
#   Config is read directly at default.preview.* in
#   $CLAUDE_CONFIG_DIR/solopreneur.json, falling back to
#   ~/.claude/solopreneur.json. The per-repo cascade deliberately does NOT
#   apply: repos[<rk>].preview.path would shadow these user-global keys.
# - Re-linking: a dir that deployed before carries .vercel/project.json and
#   normally keeps using that project. When the caller names a project
#   explicitly ($PREVIEW_PROJECT, or --bucket with a configured project),
#   the dir is re-linked — explicit intent beats the cache. The configured
#   default bucket does NOT force a re-link, so a dir promoted to the keep
#   bucket keeps iterating there on later flag-less deploys.
# - After a successful deploy, if default.preview.autoProtect is not
#   "false" and the target bucket is not "public", the project's
#   ssoProtection is enabled via the Vercel API so preview URLs are not
#   world-readable (safe by default; prints a notice). Requires jq +
#   readable CLI auth token; degrades to a warning, never blocks the
#   deploy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- parse args ---
BUCKET="default"
PRINT_PROJECT=false
DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bucket)
      BUCKET="${2:?deploy.sh: --bucket requires a value: default|keep|public}"
      shift 2 ;;
    --print-project)
      PRINT_PROJECT=true
      shift ;;
    -*)
      echo "deploy.sh: unknown flag: $1" >&2
      exit 1 ;;
    *)
      DIR="$1"
      shift ;;
  esac
done
DIR="${DIR:?usage: deploy.sh [--bucket default|keep|public] [--print-project] <dir>}"
case "$BUCKET" in
  default|keep|public) ;;
  *) echo "deploy.sh: invalid --bucket '$BUCKET' (expected default|keep|public)" >&2; exit 1 ;;
esac

# --- read user-global preview config (NOT the per-repo cascade) ---
# Returns empty when unset, file missing, or jq unavailable.
read_preview_global() {
  local key="$1"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local fallback="$HOME/.claude/solopreneur.json"
  local out f
  command -v jq >/dev/null 2>&1 || return 0
  for f in "$primary" "$fallback"; do
    if [ -f "$f" ]; then
      out=$(jq -r ".default.preview.${key} // empty" "$f" 2>/dev/null || true)
      if [ -n "$out" ]; then printf '%s' "$out"; return 0; fi
    fi
    # primary 與 fallback 同檔時只讀一次
    if [ "$primary" = "$fallback" ]; then break; fi
  done
  return 0
}

# --- derive the Vercel project name ---
FORCE_RELINK=false
if [ -n "${PREVIEW_PROJECT:-}" ]; then
  # $PREVIEW_PROJECT wins verbatim — NOT sanitized, so an explicit project
  # name or a real Vercel project ID (prj_...) passes through untouched.
  PROJECT_NAME="$PREVIEW_PROJECT"
  FORCE_RELINK=true
else
  PROJECT_NAME=""
  if [ "$BUCKET" != "default" ]; then
    PROJECT_NAME="$(read_preview_global "projects.${BUCKET}")"
    if [ -z "$PROJECT_NAME" ]; then
      # Fail closed: an explicit bucket must resolve to its configured
      # project. A silent fallback would deploy to the wrong project — and
      # for --bucket public, skip ssoProtection on it too.
      echo "deploy.sh: error — --bucket $BUCKET requested but default.preview.projects.${BUCKET} is not configured (solopreneur.json)" >&2
      exit 1
    fi
    FORCE_RELINK=true
  fi
  if [ -z "$PROJECT_NAME" ]; then
    PROJECT_NAME="$(read_preview_global "projects.default")"
  fi
  if [ -z "$PROJECT_NAME" ]; then
    if base_dir=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null) && [ -n "$base_dir" ]; then
      raw_name="$(basename "$base_dir")"
    else
      raw_name="$(basename "$(dirname "$DIR")")"
    fi
    # Sanitize the *derived* name to a Vercel-legal project name: lowercase,
    # only [a-z0-9-], collapse repeated '-', no leading/trailing '-',
    # max 100 chars. Never empty — fall back to "cc-preview".
    PROJECT_NAME="$(printf '%s' "${raw_name}-preview" \
      | tr '[:upper:]' '[:lower:]' \
      | sed -e 's/[^a-z0-9-]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-*//' -e 's/-*$//' \
      | cut -c1-100 \
      | sed -e 's/-*$//')"
    if [ -z "$PROJECT_NAME" ]; then
      PROJECT_NAME="cc-preview"
    fi
  fi
fi

if [ "$PRINT_PROJECT" = "true" ]; then
  printf 'bucket=%s project=%s relink=%s\n' "$BUCKET" "$PROJECT_NAME" "$FORCE_RELINK"
  exit 0
fi

# --- preflight (CLI installed, logged in, token valid) ---
bash "$SCRIPT_DIR/preflight.sh"

# --- sanity check the target dir ---
if [ ! -d "$DIR" ]; then
  echo "deploy.sh: directory not found: $DIR" >&2
  exit 1
fi
if [ -z "$(find "$DIR" -maxdepth 1 -type f -name '*.html' -print -quit)" ]; then
  echo "deploy.sh: warning — no .html file in $DIR" >&2
fi

cd "$DIR"

# --- link to the resolved project ---
if [ "$FORCE_RELINK" = "true" ] && [ -f .vercel/project.json ]; then
  echo "re-linking to explicitly requested project: $PROJECT_NAME" >&2
  rm -rf .vercel
fi
if [ ! -f .vercel/project.json ]; then
  echo "linking to project: $PROJECT_NAME" >&2
  vercel link --project "$PROJECT_NAME" --yes >&2
fi

# --- deploy (preview, not production) ---
RAW=$(vercel deploy --yes 2>&1) || {
  echo "$RAW" >&2
  echo "deploy.sh: vercel deploy failed" >&2
  if [ -f .vercel/project.json ]; then
    echo "hint: if the linked project was deleted, run 'rm -rf .vercel' in the proposal dir and retry" >&2
  fi
  exit 1
}

# extract the .vercel.app URL
URL=$(printf "%s\n" "$RAW" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)
if [ -z "$URL" ]; then
  echo "$RAW" >&2
  echo "deploy.sh: could not find deployment URL in vercel output" >&2
  exit 1
fi

# --- auto-protect: make sure the project is not world-readable ---
AUTO_PROTECT="$(read_preview_global "autoProtect")"
AUTO_PROTECT="${AUTO_PROTECT:-true}"   # safe by default
if [ "$AUTO_PROTECT" != "false" ] && [ "$BUCKET" != "public" ]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "deploy.sh: warning — jq not found, skipping ssoProtection check; URL may be world-readable" >&2
  else
    AUTH_MAC="$HOME/Library/Application Support/com.vercel.cli/auth.json"
    AUTH_LIN="$HOME/.local/share/com.vercel.cli/auth.json"
    AUTH_FILE=""
    [ -f "$AUTH_MAC" ] && AUTH_FILE="$AUTH_MAC"
    [ -z "$AUTH_FILE" ] && [ -f "$AUTH_LIN" ] && AUTH_FILE="$AUTH_LIN"
    TOKEN=""
    [ -n "$AUTH_FILE" ] && TOKEN=$(jq -r '.token // empty' "$AUTH_FILE" 2>/dev/null || true)
    PROJ_ID=$(jq -r '.projectId // empty' .vercel/project.json 2>/dev/null || true)
    ORG_ID=$(jq -r '.orgId // empty' .vercel/project.json 2>/dev/null || true)
    if [ -n "$TOKEN" ] && [ -n "$PROJ_ID" ]; then
      QS=""
      case "$ORG_ID" in team_*) QS="?teamId=$ORG_ID" ;; esac
      CURRENT=$(curl -s "https://api.vercel.com/v9/projects/${PROJ_ID}${QS}" \
        -H "Authorization: Bearer $TOKEN" \
        | jq -r '.ssoProtection.deploymentType // "none"' || echo "none")
      if [ "$CURRENT" = "none" ]; then
        RESULT=$(curl -s -X PATCH "https://api.vercel.com/v9/projects/${PROJ_ID}${QS}" \
          -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
          -d '{"ssoProtection":{"deploymentType":"all_except_custom_domains"}}' \
          | jq -r '.ssoProtection.deploymentType // "FAILED"' || echo "FAILED")
        if [ "$RESULT" = "all_except_custom_domains" ]; then
          echo "locked: ssoProtection enabled on '$PROJECT_NAME' — only logged-in Vercel members can view" >&2
          echo "        to share publicly use --bucket public, or set default.preview.autoProtect=false" >&2
        else
          echo "deploy.sh: warning — could not enable ssoProtection on '$PROJECT_NAME'; URL may be world-readable" >&2
        fi
      fi
    else
      echo "deploy.sh: warning — Vercel token or project id unavailable, skipping ssoProtection" >&2
    fi
  fi
fi

# progress to stderr, URL to stdout
echo "deployed: $URL" >&2
printf "%s\n" "$URL"
