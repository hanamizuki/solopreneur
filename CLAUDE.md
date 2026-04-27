# solopreneur

This repo ships **seven sub-plugins** from a single marketplace:

| Plugin | Path | Depends on |
|---|---|---|
| `solopreneur` | `plugins/solopreneur/` | — |
| `designer` | `plugins/designer/` | `solopreneur` |
| `marketer` | `plugins/marketer/` | `solopreneur` |
| `ios-dev` | `plugins/ios-dev/` | `solopreneur` |
| `android-dev` | `plugins/android-dev/` | `solopreneur` |
| `ai-engineer` | `plugins/ai-engineer/` | `solopreneur` |
| `neo4j-dev` | `plugins/neo4j-dev/` | `solopreneur` |

Each plugin's directory name matches its marketplace `name` 1:1. The
`Depends on` column shows the marketplace `name` declared in
`plugins/<dir>/.claude-plugin/plugin.json` `dependencies`.

## Versioning & release

**Regular commits don't bump versions.** Land work on `main` (direct or via
PR/merge) without touching `plugin.json` versions. The marketplace's
published versions are governed by git tags, not commit count — accumulate
several commits, then release them together.

**Releases happen through the `/release` skill.** When work has reached a
shippable point, run `/release` (defined at `.claude/skills/release/SKILL.md`).
The skill:

1. Detects which sub-plugins changed since their last `<plugin>--v*` tag.
2. Asks per plugin for `patch` / `minor` / `skip`.
3. Bumps `plugin.json` versions in one `chore(release): ...` commit.
4. Creates double-dash annotated tags (`<plugin-name>--v<version>`).
5. Pushes commit + tags atomically with `git push --follow-tags`.

Atomic push is mandatory — if the bump commit lands on `origin/main` before
its matching tags, users installing in the gap hit `no-matching-tag` errors
from Claude Code's plugin resolver.

### Bump levels

- **patch** — bug fix, docs, refactor, internal restructure, new skill,
  new agent. The default for almost everything.
- **minor** — only when the user explicitly marks the release as a
  milestone (e.g. an API surface they plan to start promoting). Pre-1.0
  minor may be breaking.
- **`1.0.0` is reserved** for the first stable, promotable cut of a plugin.
  Don't reach 1.0 by accumulation — only when the user says it's ready.

### Tag format

```
<plugin-name>--v<version>
```

Example: `android-dev--v0.4.4`. The double-dash is required — Claude Code's
plugin resolver parses it. Plugin directory names match marketplace names
1:1, so either reference works, but stick to the marketplace name for
consistency with installer commands.

### What does NOT bump

- **Regular commits** — even if they change `plugins/<name>/`. Bumping is
  a release action, not a push action. The version stays at the last tag
  until the next `/release`.
- **Docs-only changes at the repo root** (`README.md`, `MIGRATION.md`,
  `CLAUDE.md`, `LICENSE`, `.claude/`).

### `marketplace.json` changes

If `.claude-plugin/marketplace.json` changes in a way that affects a plugin
entry (`name` / `source` / `description` / `license`), `/release` treats
that as a user-visible change for the affected plugin and prompts for a
bump alongside the directory's own changes.
