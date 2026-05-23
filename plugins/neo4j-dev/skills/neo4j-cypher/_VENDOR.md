# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/neo4j-contrib/neo4j-skills
- **Source path**: `neo4j-cypher-skill`
- **Pinned commit**: 3afa4c97c6ad66df5e3ad3874917e434421d6a5e
- **Synced at**: 2026-05-22T05:36:18Z
- **License**: see `../_vendored/LICENSES/neo4j-skills-LICENSE`

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
