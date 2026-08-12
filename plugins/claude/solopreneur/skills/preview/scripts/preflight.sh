#!/usr/bin/env bash
# preview skill: preflight check.
# Verifies Vercel CLI is installed and logged in. Run before any deploy.
# Exits non-zero with clear install/login instructions if anything is missing.
#
# Sourced by deploy.sh on every run, so deploy never proceeds with a broken env.
# Can also be invoked directly: `bash preflight.sh` for an explicit check.

set -euo pipefail

err()  { printf "✗ %s\n" "$*" >&2; }
ok()   { printf "✓ %s\n" "$*" >&2; }
info() { printf "  %s\n" "$*" >&2; }

# 1. vercel CLI present?
if ! command -v vercel >/dev/null 2>&1; then
  err "vercel CLI not found in PATH"
  info ""
  info "Install one of these ways (you must run this yourself — needs sudo / network):"
  info "  npm i -g vercel"
  info "  # or: brew install vercel-cli"
  info ""
  info "Then re-run the deploy."
  exit 1
fi

# 2. logged in?
# macOS: ~/Library/Application Support/com.vercel.cli/auth.json
# Linux: ~/.local/share/com.vercel.cli/auth.json
AUTH_MAC="$HOME/Library/Application Support/com.vercel.cli/auth.json"
AUTH_LIN="$HOME/.local/share/com.vercel.cli/auth.json"
if [ ! -f "$AUTH_MAC" ] && [ ! -f "$AUTH_LIN" ]; then
  err "not logged in to Vercel"
  info ""
  info "Run interactively in your terminal (opens a browser):"
  info "  vercel login"
  info ""
  info "Use the same email as your Vercel account. Then re-run the deploy."
  exit 1
fi

# 3. quick sanity — whoami works (token still valid)?
if ! vercel whoami >/dev/null 2>&1; then
  err "Vercel auth file exists but 'vercel whoami' failed (token expired / revoked?)"
  info ""
  info "Re-authenticate:"
  info "  vercel logout && vercel login"
  exit 1
fi

ok "vercel CLI ready ($(vercel --version 2>/dev/null | head -1)) · user: $(vercel whoami 2>/dev/null)"
