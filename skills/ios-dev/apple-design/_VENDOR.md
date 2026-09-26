# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/emilkowalski/skills
- **Source path**: `skills/apple-design`
- **Pinned commit**: d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128
- **Synced at**: 2026-09-26T13:39:46Z
- **License**: see `../../vendor/LICENSES/emilkowalski-skills-LICENSE` (source repo: `src/ios-dev/vendor/LICENSES/emilkowalski-skills-LICENSE`)

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter `name:` is
normalized to the folder name; bundled-script paths are rewritten to
`"${CLAUDE_SKILL_DIR}/"`; argument tokens (`$0`-`$9`) in a
`SKILL.md` that takes no arguments are escaped as `\$0`-`\$9`, so
Claude Code does not substitute them into the body at load time; and
`disable-model-invocation` is injected when the manifest asks for it. See
`src/ios-dev/scripts/sync-vendored.sh` for the exact transformations and
the reasons.

To update: edit `src/ios-dev/vendor/manifest.json` if needed, then
re-run `./src/ios-dev/scripts/sync-vendored.sh`.
