# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/pbakaus/impeccable
- **Source path**: `.claude/skills/impeccable`
- **Pinned commit**: 7b646bafd60b9dd9828ce5c4c1a25691702c9e92
- **Synced at**: 2026-08-15T02:12:19Z
- **License**: see `../../vendor/LICENSES/impeccable-LICENSE` (source repo: `src/designer/vendor/LICENSES/impeccable-LICENSE`)

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter `name:` is
normalized to the folder name; bundled-script paths are rewritten to
`"${CLAUDE_SKILL_DIR}/"`; argument tokens (`$0`-`$9`) in a
`SKILL.md` that takes no arguments are escaped as `\$0`-`\$9`, so
Claude Code does not substitute them into the body at load time; and
`disable-model-invocation` is injected when the manifest asks for it. See
`src/designer/scripts/sync-vendored.sh` for the exact transformations and
the reasons.

To update: edit `src/designer/vendor/manifest.json` if needed, then
re-run `./src/designer/scripts/sync-vendored.sh`.
