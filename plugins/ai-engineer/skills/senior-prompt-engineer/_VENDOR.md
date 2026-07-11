# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/alirezarezvani/claude-skills
- **Source path**: `engineering-team/skills/senior-prompt-engineer`
- **Pinned commit**: 4a3c05b69e64f4925f7fc65c88890f614f79caf0
- **Synced at**: 2026-07-11T17:24:43Z
- **License**: see `../_vendored/LICENSES/claude-skills-LICENSE`

The vendored body differs from upstream verbatim by exactly the two
mechanical substitutions below — see `scripts/sync-vendored.sh` for the
transformations.

**Path rewrite** (all `*.md`): bundled-script paths under the skill folder
(`.claude/skills/<to>/`, and `.claude/skills/<upstream-name>/` if the
manifest renames the folder) are rewritten to `"${CLAUDE_SKILL_DIR}/"`
(quoted so a skill-dir path containing spaces doesn't word-split the
resulting command) so the skill resolves correctly when installed as a
plugin.

**`$N` escape** (`SKILL.md` only): bare `$0`-`$9` are escaped to
`\$0`-`\$9`. Claude Code substitutes `$N` (shorthand for
`$ARGUMENTS[N]`) into a SKILL.md on every load, collapsing it to the empty
string when no args are passed — so an unescaped literal (a bash positional
param, a regex capture group, a dollar amount) would reach the reader
corrupted. The backslash is consumed by that substitution, so the rendered
skill shows `$N` as upstream wrote it.

To update: edit `skills/_vendored/manifest.json` if needed, then re-run this
plugin's `./scripts/sync-vendored.sh`.
