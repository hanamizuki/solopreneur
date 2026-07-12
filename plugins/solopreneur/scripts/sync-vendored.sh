#!/usr/bin/env bash
# Maintainer script for vendoring third-party skills into a sub-plugin.
#
# Canonical location: plugins/solopreneur/scripts/sync-vendored.sh.
# Sub-plugins reach it via relative symlinks at plugins/<plugin>/scripts/sync-vendored.sh
# so PLUGIN_DIR resolves to the calling plugin's root, not solopreneur's.
#
# Reads <plugin>/vendor/manifest.json, sparse-clones each source repo
# at the pinned (or latest) revision, copies each `from` skill folder to
# skills/<to>/, fetches the LICENSE if specified, and updates `rev` +
# `synced_at` in the manifest.
#
# The copied files are not a byte-for-byte mirror of upstream — see the numbered
# rewrite steps below for what is changed and why. Every step is deterministic, so
# a re-sync at the same pinned rev reproduces identical bytes; validate-vendored.yml
# depends on that (it re-runs this script with --pinned and fails on any drift).
#
# Usage (from the sub-plugin's directory):
#   ./scripts/sync-vendored.sh           # sync to latest commit on each source's branch
#   ./scripts/sync-vendored.sh --pinned  # re-sync to revs already pinned in manifest (reproducible)
#
# Optional manifest fields per source:
#   disable_model_invocation: true  # inject `disable-model-invocation: true` into each synced SKILL.md
#
# Requires: git, jq, perl (perl ships with macOS and is Essential on Debian/Ubuntu,
# so unlike jq it needs no install; the argument-token escape below needs its
# lookbehind, which POSIX sed and awk do not have)

set -euo pipefail

# Resolve PLUGIN_DIR via $0 (works for both direct execution and symlink
# invocation — $0 is the path actually used to invoke the script).
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$PLUGIN_DIR/vendor/manifest.json"
LICENSES_DIR="$PLUGIN_DIR/vendor/LICENSES"
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

if ! command -v perl >/dev/null 2>&1; then
  echo "error: perl is required (the argument-token escape needs a regex lookbehind)" >&2
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: manifest not found at $MANIFEST" >&2
  echo "       This script needs a manifest at <plugin>/vendor/manifest.json." >&2
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

    # Argument-token escape: `$0`-`$9` -> `\$0`-`\$9` in a SKILL.md that takes no
    # arguments.
    #
    # Claude Code substitutes argument tokens into a SKILL.md body at load time —
    # model-invoked as well as slash-invoked — and a skill loaded with no arguments
    # has each token replaced by the empty string. Upstream writes these as
    # literals: bash positional params (`local UDID="$1"`), a Swift regex capture
    # group (`with: "$1"`), dollar amounts (`$150k`, `$9.99`). Unescaped, the
    # vendored skill ships teaching broken code — `local UDID="$1"` renders as
    # `local UDID=""`. A single backslash is the documented escape; the
    # substitution consumes it and the reader sees the token as upstream wrote it.
    #
    # The repo's own native skills got this fix by hand in #87. Vendored skills
    # can't be hand-edited — validate-vendored.yml re-runs this script and fails on
    # drift, and the next sync would clobber the edit — so the sync has to produce
    # the escape itself.
    #
    # The rule, verbatim from https://code.claude.com/docs/en/skills :
    #   "Only a single backslash directly before the token escapes it. A doubled
    #    backslash such as `\\$1` leaves both backslashes in place, and `$1` still
    #    expands to the argument value."
    #
    # So the backslash run already sitting in front of a token decides everything:
    #
    #   run 0   `$1`      token is substituted        -> escape it (add one)
    #   run 1   `\$1`     renders as `$1`             -> leave alone; upstream is
    #                                                    already shipping the exact
    #                                                    bytes we would have written
    #   run >=2 `\\$1`    every backslash survives
    #                     AND `$1` still expands      -> UNREPRESENTABLE, refuse
    #
    # A run of two or more cannot be fixed by adding backslashes: protecting the
    # `$` requires its preceding backslash to have nothing before it, so a longer
    # run only plants another stray backslash and the token expands anyway. Refuse
    # rather than guess — nothing upstream trips it today (0 of 77 vendored
    # SKILL.md), and if something ever does, a maintainer is standing right here
    # and a loud failure beats a quiet corruption.
    #
    # SKILL.md only. Sibling references/*.md are pulled in with the Read tool at
    # runtime, which returns raw bytes and never substitutes, so escaping them
    # would only plant a stray backslash in text the model is meant to copy.
    if grep -qE '\\\\\$[0-9]' "$dst_path/SKILL.md"; then
      echo "    error: upstream $to/SKILL.md has two or more backslashes before an" >&2
      echo "           argument token. Claude Code cannot render that text — see the" >&2
      echo "           argument-token comment in scripts/sync-vendored.sh. Fix by hand." >&2
      exit 1
    fi

    # Escaping only makes sense for a skill that never takes arguments. In one that
    # does, `$N` is a placeholder, not a literal, and escaping it would sever the
    # skill from its own input — a silent break, and the drift check would stay
    # green right through it, because CI only asks whether the sync reproduces the
    # committed bytes, never whether those bytes still work.
    #
    # A skill advertises arguments in two ways: `argument-hint` / `arguments` in
    # the frontmatter, or `$ARGUMENTS` in the body (which needs no declaration).
    # Either way its tokens are load-bearing, so leave the whole file alone. Note
    # this is also why `$ARGUMENTS` itself is never escaped: in a third-party skill
    # body it is far likelier to be a deliberate placeholder than a literal, and a
    # literal `$ARGUMENTS` is not a thing these skills write.
    #
    # Nothing upstream is in this position today — 0 of 77 declare `arguments:` or
    # reference `$ARGUMENTS`, and `designer/impeccable`, the only one with an
    # `argument-hint`, uses no token at all. The check is here because this pass is
    # what introduces the hazard: before it, no rewrite could break a vendored
    # skill; after it, one silently could.
    takes_args=0
    if awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm' "$dst_path/SKILL.md" \
         | grep -qE '^(arguments|argument-hint):'; then
      takes_args=1
    elif grep -q '\$ARGUMENTS' "$dst_path/SKILL.md"; then
      takes_args=1
    fi

    # `(?<!\\)\$(?=[0-9])` is the mirror image of the regex the loader itself uses
    # to FIND escapes — `(?<!\\)\\\$(?=\d|ARGUMENTS)` — so we insert exactly what it
    # looks for, and only where it is missing. Both assertions are zero-width: the
    # `$` is the whole match, so nothing between two adjacent tokens is consumed and
    # `$1$2` escapes both. (A `sed` left-context group, having no lookbehind, would
    # eat the boundary and miss the second.)
    #
    # What keeps the drift check green is determinism, not idempotency: `rm -rf` +
    # `cp -R` above re-copies pristine upstream on every run, so this pass never
    # sees its own output. Same pinned input, same bytes out.
    #
    # The grep guard mirrors rewrite_pass: a file with no token at all is not
    # rewritten at all, so it stays byte-for-byte as upstream wrote it.
    if [[ "$takes_args" -eq 1 ]]; then
      if grep -qE '\$[0-9]' "$dst_path/SKILL.md"; then
        echo "    note: $to takes arguments — \$N left unescaped (placeholders, not literals)"
      fi
    elif grep -qE '\$[0-9]' "$dst_path/SKILL.md"; then
      perl -pe 's/(?<!\\)\$(?=[0-9])/\\\$/g' "$dst_path/SKILL.md" > "$dst_path/SKILL.md.tmp" \
        || { echo "    error: token escape failed for $dst_path/SKILL.md" >&2; rm -f "$dst_path/SKILL.md.tmp"; exit 1; }
      mv "$dst_path/SKILL.md.tmp" "$dst_path/SKILL.md" \
        || { echo "    error: mv failed for $dst_path/SKILL.md" >&2; rm -f "$dst_path/SKILL.md.tmp"; exit 1; }
    fi

    # Drop a small _VENDOR.md sidecar so the source is traceable from the skill folder.
    if [[ -n "$license_file" ]]; then
      license_line="see \`../../vendor/LICENSES/$(basename "$license_file")\`"
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

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter \`name:\` is
normalized to the folder name; bundled-script paths are rewritten to
\`"\${CLAUDE_SKILL_DIR}/"\`; argument tokens (\`\$0\`-\`\$9\`) in a
\`SKILL.md\` that takes no arguments are escaped as \`\\\$0\`-\`\\\$9\`, so
Claude Code does not substitute them into the body at load time; and
\`disable-model-invocation\` is injected when the manifest asks for it. See
\`scripts/sync-vendored.sh\` for the exact transformations and the reasons.

To update: edit \`vendor/manifest.json\` if needed, then re-run this
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
