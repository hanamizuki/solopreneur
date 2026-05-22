# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/wshobson/agents
- **Source path**: `plugins/ui-design/skills/mobile-android-design`
- **Pinned commit**: 4bb47e9eeb4e8564642eb23384ec8f7bf1855417
- **Synced at**: 2026-05-22T05:36:21Z
- **License**: see `../_vendored/LICENSES/wshobson-agents-LICENSE`

**Path rewrite**: during sync, bundled-script paths under the skill folder
(`.claude/skills/<to>/`, and `.claude/skills/<upstream-name>/` if the
manifest renames the folder) are mechanically rewritten to
`"${CLAUDE_SKILL_DIR}/"` (quoted so a skill-dir path containing spaces
doesn't word-split the resulting command) so the skill resolves correctly
when installed as a plugin. The vendored body therefore differs from
upstream verbatim by exactly that substitution — see
`scripts/sync-vendored.sh` for the transformation.

To update: edit `skills/_vendored/manifest.json` if needed, then re-run this
plugin's `./scripts/sync-vendored.sh`.
