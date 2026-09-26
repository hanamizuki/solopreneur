# Vendored Skill

This skill is vendored from a third-party source. **Do not edit in place** —
edits will be overwritten on the next `scripts/sync-vendored.sh` run.

- **Source repo**: https://github.com/alirezarezvani/claude-skills
- **Source path**: `engineering-team/skills/senior-prompt-engineer`
- **Pinned commit**: 19392f7a08264ed00486a251f5b2098321771f94
- **Synced at**: 2026-09-26T13:39:40Z
- **License**: see `../../vendor/LICENSES/claude-skills-LICENSE` (source repo: `src/ai-engineer/vendor/LICENSES/claude-skills-LICENSE`)

**Not a byte-for-byte mirror.** The sync mechanically rewrites the copied
files so they work as part of a plugin: the frontmatter `name:` is
normalized to the folder name; bundled-script paths are rewritten to
`"${CLAUDE_SKILL_DIR}/"`; argument tokens (`$0`-`$9`) in a
`SKILL.md` that takes no arguments are escaped as `\$0`-`\$9`, so
Claude Code does not substitute them into the body at load time; and
`disable-model-invocation` is injected when the manifest asks for it. See
`src/ai-engineer/scripts/sync-vendored.sh` for the exact transformations and
the reasons.

To update: edit `src/ai-engineer/vendor/manifest.json` if needed, then
re-run `./src/ai-engineer/scripts/sync-vendored.sh`.
