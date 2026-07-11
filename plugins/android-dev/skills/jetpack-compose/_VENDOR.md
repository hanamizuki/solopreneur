# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/TheBushidoCollective/han
- **Source path**: `plugins/specialized/android/skills/jetpack-compose`
- **Pinned commit**: 3fc9880ee2be4b1275359bed910dbd1674134448
- **Synced at**: 2026-07-11T18:57:07Z
- **License**: see `../_vendored/LICENSES/han-LICENSE`

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter `name:` is
normalized to the folder name; bundled-script paths are rewritten to
`"${CLAUDE_SKILL_DIR}/"`; argument tokens (`$0`-`$9`,
`$ARGUMENTS`) in `SKILL.md` are escaped as `\$…` so Claude Code does
not substitute them into the body at load time; and
`disable-model-invocation` is injected when the manifest asks for it. See
`scripts/sync-vendored.sh` for the exact transformations and the reasons.

To update: edit `skills/_vendored/manifest.json` if needed, then re-run this
plugin's `./scripts/sync-vendored.sh`.
