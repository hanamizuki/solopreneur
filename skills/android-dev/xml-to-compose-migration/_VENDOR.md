# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/new-silvermoon/awesome-android-agent-skills
- **Source path**: `.github/skills/migration/xml-to-compose-migration`
- **Pinned commit**: 82900eacc8dbe13de93c6310af27b9df4b2bd2f6
- **Synced at**: 2026-08-16T03:31:49Z
- **License**: see `../../vendor/LICENSES/awesome-android-agent-skills-LICENSE` (source repo: `src/android-dev/vendor/LICENSES/awesome-android-agent-skills-LICENSE`)

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter `name:` is
normalized to the folder name; bundled-script paths are rewritten to
`"${CLAUDE_SKILL_DIR}/"`; argument tokens (`$0`-`$9`) in a
`SKILL.md` that takes no arguments are escaped as `\$0`-`\$9`, so
Claude Code does not substitute them into the body at load time; and
`disable-model-invocation` is injected when the manifest asks for it. See
`src/android-dev/scripts/sync-vendored.sh` for the exact transformations and
the reasons.

To update: edit `src/android-dev/vendor/manifest.json` if needed, then
re-run `./src/android-dev/scripts/sync-vendored.sh`.
