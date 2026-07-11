#!/usr/bin/env bash
# Maintainer script for vendoring third-party skills into a sub-plugin.
#
# Canonical location: plugins/solopreneur/scripts/sync-vendored.sh.
# Sub-plugins reach it via relative symlinks at plugins/<plugin>/scripts/sync-vendored.sh
# so PLUGIN_DIR resolves to the calling plugin's root, not solopreneur's.
#
# Reads <plugin>/skills/_vendored/manifest.json, sparse-clones each source repo
# at the pinned (or latest) revision, copies each `from` skill folder to
# skills/<to>/, fetches the LICENSE if specified, and updates `rev` +
# `synced_at` in the manifest.
#
# Two mechanical body rewrites are applied to the copied files, both idempotent
# so a re-sync reproduces byte-identical output (validate-vendored.yml re-runs
# this script with --pinned and fails on drift): the bundled-script path rewrite
# to ${CLAUDE_SKILL_DIR} (all *.md), and the bare-`$N` escape (SKILL.md only).
# See the comments at each step for why.
#
# Usage (from the sub-plugin's directory):
#   ./scripts/sync-vendored.sh           # sync to latest commit on each source's branch
#   ./scripts/sync-vendored.sh --pinned  # re-sync to revs already pinned in manifest (reproducible)
#
# Optional manifest fields per source:
#   disable_model_invocation: true  # inject `disable-model-invocation: true` into each synced SKILL.md
#
# Requires: git, jq

set -euo pipefail

# Resolve PLUGIN_DIR via $0 (works for both direct execution and symlink
# invocation — $0 is the path actually used to invoke the script).
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

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: manifest not found at $MANIFEST" >&2
  echo "       This script needs a manifest at <plugin>/skills/_vendored/manifest.json." >&2
  echo "       If you ran it from plugins/solopreneur/scripts/ directly, switch to a sub-plugin" >&2
  echo "       (e.g. plugins/android-dev, plugins/ios-dev, plugins/designer) and run from there:" >&2
  echo "         cd plugins/android-dev && ./scripts/sync-vendored.sh" >&2
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
    # often pre-prefixes with `android-` (or `neo4j-` etc.), but inside a
    # plugin namespace that's redundant — callers invoke as
    # `android-dev:<to>` / `neo4j-dev:<to>`. Folder name and
    # frontmatter name must match for Claude Code to resolve the skill.
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

    # Inject disable-model-invocation: true if the source has the flag enabled.
    # Idempotent — only inserts if not already present.
    disable_mi=$(echo "$src" | jq -r '.disable_model_invocation // false')
    if [[ "$disable_mi" == "true" && -f "$dst_path/SKILL.md" ]]; then
      if ! grep -q "^disable-model-invocation:" "$dst_path/SKILL.md"; then
        # Insert after the `name:` line inside the frontmatter.
        awk '
          BEGIN { in_fm = 0; fm_done = 0; injected = 0 }
          /^---$/ {
            if (!in_fm && !fm_done) { in_fm = 1; print; next }
            if (in_fm) { in_fm = 0; fm_done = 1; print; next }
          }
          in_fm && /^name:[[:space:]]/ && !injected {
            print
            print "disable-model-invocation: true"
            injected = 1
            next
          }
          { print }
        ' "$dst_path/SKILL.md" > "$dst_path/SKILL.md.tmp" && \
          mv "$dst_path/SKILL.md.tmp" "$dst_path/SKILL.md"
      fi
    fi

    # Body-path rewrite: upstream skills (notably impeccable) hardcode their
    # standalone-install path `.claude/skills/<name>/scripts/...` inside
    # SKILL.md and reference/*.md. In vendored form the skill lives in the
    # plugin install dir, not under the user's cwd, so the bare path either
    # fails or silently executes the user's standalone copy (collision).
    # Rewrite to `${CLAUDE_SKILL_DIR}/`, which Claude Code resolves to the
    # actual skill directory across personal / project / plugin levels.
    # Idempotent — the same upstream pattern gets rewritten on every re-sync.
    #
    # We limit `find` to `*.md` because markdown is the only doc surface
    # upstream skills use today. If a future skill bundles `.txt` / `.mdx` /
    # other doc files that also reference `.claude/skills/<name>/`, extend
    # the filter (e.g. `\( -name '*.md' -o -name '*.mdx' \)`).
    #
    # Use process substitution (not `find ... | while`) so the loop runs in
    # the parent shell and `set -e` propagates awk/mv failures out of the
    # script instead of being swallowed by the subshell.
    rewrite_pass() {
      local needle="$1"
      while IFS= read -r -d '' f; do
        # Skip files that don't contain the literal needle — avoids
        # rewriting (and mtime-touching) files that have nothing to change.
        grep -q -F "$needle" "$f" || continue
        # awk's `print` ensures a trailing newline. If upstream lacks one,
        # the rewritten file gains one byte — accepted: the vendored body
        # is already an intentional substitution (see _VENDOR.md), not a
        # byte-for-byte mirror, and `grep -F` confines us to files with a
        # command-invocation line, which conventionally end in newline.
        # Emit `"${CLAUDE_SKILL_DIR}/"` quoted: if CLAUDE_SKILL_DIR contains
        # spaces (possible on macOS user homes), an unquoted expansion would
        # word-split the resulting `node ${CLAUDE_SKILL_DIR}/scripts/foo.mjs`
        # into multiple argv segments and break the command. The quoted form
        # concatenates safely with the following unquoted `scripts/...`.
        awk -v needle="$needle" -v repl='"${CLAUDE_SKILL_DIR}/"' '
          {
            out = ""
            s = $0
            while ((idx = index(s, needle)) > 0) {
              out = out substr(s, 1, idx - 1) repl
              s = substr(s, idx + length(needle))
            }
            print out s
          }
        ' "$f" > "$f.tmp" || { echo "    error: rewrite failed for $f" >&2; rm -f "$f.tmp"; exit 1; }
        mv "$f.tmp" "$f" || { echo "    error: mv failed for $f" >&2; exit 1; }
      done < <(find "$dst_path" -type f -name '*.md' -print0)
    }

    rewrite_pass ".claude/skills/$to/"

    # If the manifest renames the skill folder (basename of `from` differs
    # from `to`), upstream body text still references the old name. Do a
    # second pass with the upstream basename so those references also get
    # rewritten to ${CLAUDE_SKILL_DIR}/.
    from_basename="$(basename "$from")"
    if [[ "$from_basename" != "$to" ]]; then
      rewrite_pass ".claude/skills/$from_basename/"
    fi

    # Bare-`$N` escape: rewrite `$0`-`$9` to `\$0`-`\$9` in the SKILL.md body.
    #
    # Claude Code substitutes `$N` (shorthand for `$ARGUMENTS[N]`) into a
    # SKILL.md on every load — model-invoked as well as slash-invoked — and a
    # no-arg load collapses each `$N` to the empty string. Upstream skills use
    # bare `$N` as a literal: bash positional params (`local UDID="$1"`), a
    # Swift regex capture group (`with: "$1"`), dollar amounts (`$150k`,
    # `$9.99`). Unescaped, the shipped skill teaches broken code — `local
    # UDID="$1"` renders as `local UDID=""`. One backslash is the documented
    # escape; the substitution consumes it and the reader sees `$N` again. The
    # repo's native (non-vendored) skills got the same fix by hand in #87, which
    # this reproduces mechanically for skills we don't own.
    #
    # SKILL.md only. Sibling references/*.md are pulled in with the Read tool at
    # runtime, which returns raw bytes and never substitutes, so escaping them
    # would only plant a stray backslash in text the model is meant to copy.
    #
    # Idempotent, which is what keeps the drift check green: a `$` preceded by an
    # ODD number of backslashes is already escaped and passes through untouched,
    # so re-running the sync over an escaped file is a no-op rather than a
    # double-escape. Counting the whole run — rather than testing only the single
    # character before the `$` — is what makes `\\$1` come out right: there the
    # two backslashes escape each other, leaving the `$` bare and still in need
    # of escaping. No such sequence exists upstream today; the run count is here
    # so this rewriter cannot be quietly wrong the day one shows up.
    #
    # The scan consumes only up to and including the `$` and leaves the digit in
    # `rest`, so that digit becomes the "preceding char" for the next match and
    # adjacent tokens (`$1$2`) both get escaped — the bug a single `sed -E` pass
    # with a consuming left-context group would have. Truncating there never
    # splits a backslash run either: `rest` restarts at the digit, so any run
    # preceding a later `$` lies wholly inside it.
    #
    # The grep guard mirrors rewrite_pass: files with no `$<digit>` at all are
    # left byte-for-byte as upstream wrote them (no rewrite, no mtime churn).
    if [[ -f "$dst_path/SKILL.md" ]] && grep -q '\$[0-9]' "$dst_path/SKILL.md"; then
      awk '
        {
          out = ""
          rest = $0
          while (match(rest, /\$[0-9]/)) {
            pos = RSTART
            slashes = 0
            p = pos - 1
            while (p >= 1 && substr(rest, p, 1) == "\\") {
              slashes++
              p--
            }
            if (slashes % 2 == 1) {
              out = out substr(rest, 1, pos)
            } else {
              out = out substr(rest, 1, pos - 1) "\\$"
            }
            rest = substr(rest, pos + 1)
          }
          print out rest
        }
      ' "$dst_path/SKILL.md" > "$dst_path/SKILL.md.tmp" \
        || { echo "    error: \$N escape failed for $dst_path/SKILL.md" >&2; rm -f "$dst_path/SKILL.md.tmp"; exit 1; }
      mv "$dst_path/SKILL.md.tmp" "$dst_path/SKILL.md" \
        || { echo "    error: mv failed for $dst_path/SKILL.md" >&2; exit 1; }
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

The vendored body differs from upstream verbatim by exactly the two
mechanical substitutions below — see \`scripts/sync-vendored.sh\` for the
transformations.

**Path rewrite** (all \`*.md\`): bundled-script paths under the skill folder
(\`.claude/skills/<to>/\`, and \`.claude/skills/<upstream-name>/\` if the
manifest renames the folder) are rewritten to \`"\${CLAUDE_SKILL_DIR}/"\`
(quoted so a skill-dir path containing spaces doesn't word-split the
resulting command) so the skill resolves correctly when installed as a
plugin.

**\`\$N\` escape** (\`SKILL.md\` only): bare \`\$0\`-\`\$9\` are escaped to
\`\\\$0\`-\`\\\$9\`. Claude Code substitutes \`\$N\` (shorthand for
\`\$ARGUMENTS[N]\`) into a SKILL.md on every load, collapsing it to the empty
string when no args are passed — so an unescaped literal (a bash positional
param, a regex capture group, a dollar amount) would reach the reader
corrupted. The backslash is consumed by that substitution, so the rendered
skill shows \`\$N\` as upstream wrote it.

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
