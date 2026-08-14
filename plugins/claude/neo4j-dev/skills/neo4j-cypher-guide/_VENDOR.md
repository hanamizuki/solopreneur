# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/tomasonjo/blogs
- **Source path**: `claude-skills/neo4j-cypher-guide/neo4j-cypher-guide`
- **Pinned commit**: 11fd30bdf48c3d7d1f008276d2592a1a007e1c4f
- **Synced at**: 2026-08-14T04:13:09Z
- **License**: (none — upstream has no LICENSE file as of sync)

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter `name:` is
normalized to the folder name; bundled-script paths are rewritten to
`"${CLAUDE_SKILL_DIR}/"`; argument tokens (`$0`-`$9`) in a
`SKILL.md` that takes no arguments are escaped as `\$0`-`\$9`, so
Claude Code does not substitute them into the body at load time; and
`disable-model-invocation` is injected when the manifest asks for it. See
`src/neo4j-dev/scripts/sync-vendored.sh` for the exact transformations and
the reasons.

To update: edit `src/neo4j-dev/vendor/manifest.json` if needed, then
re-run `./src/neo4j-dev/scripts/sync-vendored.sh`.
