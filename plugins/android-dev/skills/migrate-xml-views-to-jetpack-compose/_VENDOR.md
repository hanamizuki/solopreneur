# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/android/skills
- **Source path**: `jetpack-compose/migration/migrate-xml-views-to-jetpack-compose`
- **Pinned commit**: 47e1dff74a5cde5d0128c5d15e74e000323135ea
- **Synced at**: 2026-07-15T10:32:23Z
- **License**: see `../../vendor/LICENSES/android-skills-LICENSE.txt`

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter `name:` is
normalized to the folder name; bundled-script paths are rewritten to
`"${CLAUDE_SKILL_DIR}/"`; argument tokens (`$0`-`$9`) in a
`SKILL.md` that takes no arguments are escaped as `\$0`-`\$9`, so
Claude Code does not substitute them into the body at load time; and
`disable-model-invocation` is injected when the manifest asks for it. See
`scripts/sync-vendored.sh` for the exact transformations and the reasons.

To update: edit `vendor/manifest.json` if needed, then re-run this
plugin's `./scripts/sync-vendored.sh`.
