#!/usr/bin/env bash
# preview skill: deploy a directory to Vercel and print the URL.
#
# Usage:  deploy.sh <dir>
# Output: a single line — the deployment URL on stdout.
#         All progress / errors go to stderr.
#
# Strategy:
# - Always runs preflight first (vercel CLI + auth check). Fails fast with
#   clear install/login instructions if anything is missing.
# - The Vercel project name is derived from the working context so all
#   previews for the same repo/workspace land in one tidy project:
#     * $PREVIEW_PROJECT (if set) is used verbatim — the agent SHOULD set
#       this to "<workspace-or-agent-name>-preview" when it knows its
#       identity (e.g. PREVIEW_PROJECT=mojo-preview).
#     * Otherwise the basename of the proposal dir's enclosing git repo
#       (or, outside a repo, the proposal dir's parent) plus a "-preview"
#       suffix, sanitized to a Vercel-legal project name.
#   Each deploy still creates a new immutable preview URL like:
#     <project>-<hash>-<scope>.vercel.app
# - First time in a given dir, `vercel link` writes .vercel/project.json
#   so subsequent deploys from the same dir skip the link step.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="${1:?usage: deploy.sh <dir>}"

# --- derive the Vercel project name ---
# $PREVIEW_PROJECT wins verbatim. Otherwise base it on the proposal dir's
# enclosing repo (basename of git toplevel), or the proposal dir's parent
# when not in a git repo, with a "-preview" suffix.
if [ -n "${PREVIEW_PROJECT:-}" ]; then
  PROJECT_NAME="$PREVIEW_PROJECT"
else
  if base_dir=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null) && [ -n "$base_dir" ]; then
    raw_name="$(basename "$base_dir")"
  else
    raw_name="$(basename "$(dirname "$DIR")")"
  fi
  PROJECT_NAME="${raw_name}-preview"
fi

# Sanitize to a Vercel-legal project name: lowercase, only [a-z0-9-],
# collapse repeated '-', no leading/trailing '-', never contains '---',
# max 100 chars. Never empty — fall back to "cc-preview".
PROJECT_NAME="$(printf '%s' "$PROJECT_NAME" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -e 's/[^a-z0-9-]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-*//' -e 's/-*$//' \
  | cut -c1-100 \
  | sed -e 's/-*$//')"
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME="cc-preview"
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

# --- link to shared project on first deploy from this dir ---
if [ ! -f .vercel/project.json ]; then
  echo "linking to project: $PROJECT_NAME" >&2
  vercel link --project "$PROJECT_NAME" --yes >&2
fi

# --- deploy (preview, not production) ---
RAW=$(vercel deploy --yes 2>&1) || {
  echo "$RAW" >&2
  echo "deploy.sh: vercel deploy failed" >&2
  exit 1
}

# extract the .vercel.app URL
URL=$(printf "%s\n" "$RAW" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)
if [ -z "$URL" ]; then
  echo "$RAW" >&2
  echo "deploy.sh: could not find deployment URL in vercel output" >&2
  exit 1
fi

# progress to stderr, URL to stdout
echo "deployed: $URL" >&2
printf "%s\n" "$URL"
