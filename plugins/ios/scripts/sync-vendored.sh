#!/usr/bin/env bash
# Maintainer script for vendoring third-party skills into this plugin.
# (Same script is shipped verbatim in plugins/{android,ios,designer}/scripts/.)
#
# Reads skills/_vendored/manifest.json, sparse-clones each source repo at the
# pinned (or latest) revision, copies each `from` skill folder to skills/<to>/,
# fetches the LICENSE, and updates `rev` + `synced_at` in the manifest.
#
# Usage:
#   ./scripts/sync-vendored.sh           # sync to latest commit on each source's branch
#   ./scripts/sync-vendored.sh --pinned  # re-sync to revs already pinned in manifest (reproducible)
#
# Requires: git, jq

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$PLUGIN_DIR/skills/_vendored/manifest.json"
LICENSES_DIR="$PLUGIN_DIR/skills/_vendored/LICENSES"
SKILLS_DIR="$PLUGIN_DIR/skills"
TMP_ROOT="$(mktemp -d -t solopreneur-vendor-sync.XXXXXX)"

trap 'rm -rf "$TMP_ROOT"' EXIT

PINNED=0
if [[ "${1:-}" == "--pinned" ]]; then
  PINNED=1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi

mkdir -p "$LICENSES_DIR"

source_count=$(jq '.sources | length' "$MANIFEST")
echo "Manifest: $MANIFEST"
echo "Sources: $source_count"
echo ""

# Build updated manifest in-memory and write at end.
updated_manifest="$(cat "$MANIFEST")"

for i in $(seq 0 $((source_count - 1))); do
  src=$(jq ".sources[$i]" "$MANIFEST")
  name=$(echo "$src" | jq -r '.name')
  repo=$(echo "$src" | jq -r '.repo')
  branch=$(echo "$src" | jq -r '.branch')
  pinned_rev=$(echo "$src" | jq -r '.rev // empty')
  license_path=$(echo "$src" | jq -r '.license_path // empty')
  license_file=$(echo "$src" | jq -r '.license_file // empty')
  skills_count=$(echo "$src" | jq '.skills | length')

  echo "==> [$name] $repo"

  clone_dir="$TMP_ROOT/$name"
  git clone --depth=1 --filter=blob:none --no-checkout --branch "$branch" \
    "$repo" "$clone_dir" >/dev/null 2>&1
  (
    cd "$clone_dir"
    git sparse-checkout init --cone >/dev/null

    # Collect all `from` paths to sparse-checkout, plus license path if set
    sparse_paths=()
    while IFS= read -r p; do sparse_paths+=("$p"); done < <(echo "$src" | jq -r '.skills[].from')
    if [[ -n "$license_path" ]]; then
      sparse_paths+=("$license_path")
    fi
    git sparse-checkout set "${sparse_paths[@]}" >/dev/null

    if [[ "$PINNED" -eq 1 && -n "$pinned_rev" ]]; then
      git fetch --depth=1 origin "$pinned_rev" >/dev/null 2>&1
      git checkout "$pinned_rev" >/dev/null 2>&1
    else
      git checkout "$branch" >/dev/null 2>&1
    fi
  )

  # Resolve actual SHA after checkout
  rev=$(git -C "$clone_dir" rev-parse HEAD)
  echo "    rev: $rev"

  # Copy LICENSE if specified in manifest
  if [[ -z "$license_path" ]]; then
    echo "    license: (none specified in manifest — upstream has no LICENSE file)"
  elif [[ -f "$clone_dir/$license_path" ]]; then
    cp "$clone_dir/$license_path" "$LICENSES_DIR/$(basename "$license_file")"
    echo "    license: $license_file"
  else
    echo "    warning: license file not found at $license_path" >&2
  fi

  # Copy each skill
  for j in $(seq 0 $((skills_count - 1))); do
    from=$(echo "$src" | jq -r ".skills[$j].from")
    to=$(echo "$src" | jq -r ".skills[$j].to")
    src_path="$clone_dir/$from"
    dst_path="$SKILLS_DIR/$to"

    if [[ ! -d "$src_path" ]]; then
      echo "    error: source path missing: $from" >&2
      exit 1
    fi
    if [[ ! -f "$src_path/SKILL.md" ]]; then
      echo "    error: SKILL.md missing in $from" >&2
      exit 1
    fi

    rm -rf "$dst_path"
    cp -R "$src_path" "$dst_path"

    # Normalize frontmatter `name:` to match the folder name `to`. Upstream
    # often pre-prefixes with `android-`, but inside the solopreneur-android
    # plugin namespace that's redundant — callers invoke as
    # `solopreneur-android:<to>`. Folder name and frontmatter name must match
    # for Claude Code to resolve the skill.
    if [[ -f "$dst_path/SKILL.md" ]]; then
      # macOS sed needs `-i ''`; use a portable temp-file approach instead.
      awk -v target="$to" '
        BEGIN { in_fm = 0; fm_done = 0; replaced = 0 }
        /^---$/ {
          if (!in_fm && !fm_done) { in_fm = 1; print; next }
          if (in_fm) { in_fm = 0; fm_done = 1; print; next }
        }
        in_fm && /^name:[[:space:]]/ && !replaced {
          print "name: " target
          replaced = 1
          next
        }
        { print }
      ' "$dst_path/SKILL.md" > "$dst_path/SKILL.md.tmp" && \
        mv "$dst_path/SKILL.md.tmp" "$dst_path/SKILL.md"
    fi

    # Drop a small _VENDOR.md sidecar so the source is traceable from the skill folder.
    if [[ -n "$license_file" ]]; then
      license_line="see \`../_vendored/LICENSES/$(basename "$license_file")\`"
    else
      license_line="(none — upstream has no LICENSE file as of sync)"
    fi
    cat > "$dst_path/_VENDOR.md" <<EOF
# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next \`scripts/sync-vendored.sh\` run.

- **Source repo**: $repo
- **Source path**: \`$from\`
- **Pinned commit**: $rev
- **Synced at**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- **License**: $license_line

To update: edit \`skills/_vendored/manifest.json\` if needed, then re-run this
plugin's \`./scripts/sync-vendored.sh\`.
EOF

    echo "    skill: $from -> skills/$to/"
  done

  # Update this source's rev + synced_at in the manifest JSON
  updated_manifest=$(echo "$updated_manifest" | jq \
    --arg rev "$rev" \
    --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --argjson i "$i" \
    '.sources[$i].rev = $rev | .sources[$i].synced_at = $ts')

  echo ""
done

echo "$updated_manifest" > "$MANIFEST"
echo "Manifest updated."
echo ""
echo "Review changes:"
echo "  git -C $PLUGIN_DIR status"
echo "  git -C $PLUGIN_DIR diff --stat skills/"
