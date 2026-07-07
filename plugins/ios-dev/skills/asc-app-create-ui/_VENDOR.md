# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/rudrankriyam/app-store-connect-cli-skills
- **Source path**: `skills/asc-app-create-ui`
- **Pinned commit**: 9f9dd2bfc10ba7a1c52d89d076919061e955fa76
- **Synced at**: 2026-07-07T15:42:20Z
- **License**: see `../_vendored/LICENSES/app-store-connect-cli-skills-LICENSE`

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
