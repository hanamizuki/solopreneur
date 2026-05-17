# pr1 — feat(release): add outward CHANGELOG.md (every-release public note)

Autopilot spec artifact for the PR that introduces the repo-root,
user-facing `CHANGELOG.md`. Scope is intentionally narrow: this PR ships
only the tracked, user-facing artifacts — the `CHANGELOG.md` itself plus
the pointers that reference it (`CLAUDE.md` release-rule carve-out, a
one-line `README.md` pointer). The `/release` skill that maintains the
changelog lives at `.claude/skills/release/SKILL.md`, which is gitignored
maintainer-personal tooling wired up separately, out of version control,
and is deliberately out of scope here. The first `## 2026-05-17` section
doubles as the format exemplar future releases imitate.
