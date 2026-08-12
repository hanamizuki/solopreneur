# solopreneur

This repo ships **seven sub-plugins** from a single marketplace:

| Plugin | Skills | Non-skill source | Depends on |
|---|---|---|---|
| `solopreneur` | `skills/solopreneur/` | `src/solopreneur/` | — |
| `designer` | `skills/designer/` | `src/designer/` | `solopreneur` |
| `marketer` | `skills/marketer/` | `src/marketer/` | `solopreneur` |
| `ios-dev` | `skills/ios-dev/` | `src/ios-dev/` | `solopreneur` |
| `android-dev` | `skills/android-dev/` | `src/android-dev/` | `solopreneur` |
| `ai-engineer` | `skills/ai-engineer/` | `src/ai-engineer/` | `solopreneur` |
| `neo4j-dev` | `skills/neo4j-dev/` | `src/neo4j-dev/` | `solopreneur` |

Each directory name matches its marketplace `name` 1:1. The `Depends on`
column comes from `src/<name>/plugin.json`.

`skills/` and `src/` are the only hand-maintained plugin sources. Run
`scripts/generate-plugin-packages.sh` after changing either root. It rebuilds
the committed install packages at `plugins/claude/<name>/` and the
registry-filtered `plugins/codex/<name>/`; never edit those outputs directly.
Until the first release after this migration, generated compatibility copies
remain at `plugins/<name>/` and `.codex/plugins/<name>/` so existing tags and
marketplace paths continue to install without a version gap.

## Config layering

The `solopreneur` plugin's user config (`solopreneur.json`) supports
per-repo overrides over a shared default. Skills read via
`read_solopreneur_config <feature>` which walks five layers, first
non-null wins:

1. primary `repos[<repo-key>].<feature>` — per-repo override
2. primary `default.<feature>` — user-global default
3. fallback `repos[<repo-key>].<feature>` — shared per-repo (rare)
4. fallback `default.<feature>` — shared default
5. legacy top-level `<feature>` — old flat-schema compatibility

`<repo-key>` is normalized from `git remote get-url origin`
(`host/owner/repo`); the helper falls back to the git toplevel path or
`$PWD` when no origin exists. Writes go through one of two helpers —
`write_solopreneur_config` lands at `default.<key>`,
`write_solopreneur_repo_config` lands at `repos[<repo-key>].<key>`.

Existing configs on the old flat schema (`{ "todos": {...} }` at the
top level) keep working via layer 5; migration is optional. The helpers
are implemented once in `src/solopreneur/shared/config.sh`, which
skills `source`; see `src/solopreneur/shared/config.md` for the
cascade documentation and a sample migrated config.

There is a **second, separate config file**: `.solopreneur.json` (leading
dot), used by the preview Library. It is keyed by **filesystem path**
rather than by git remote, is read by
`skills/solopreneur/preview/scripts/config-resolve.mjs` rather
than by the shell helpers, and is validated against
`src/solopreneur/shared/config.schema.json`. The two files coexist
and neither reader touches the other's file — same `config.md` covers
both.

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
3. Bumps `src/<name>/plugin.json`, regenerates packages, and commits them with
   the changelog in one `chore(release): ...` commit.
4. Creates double-dash annotated tags (`<plugin-name>--v<version>`).
5. Updates `CHANGELOG.md` at the repo root with an outward, per-plugin
   note for the release (what installing/updating that plugin gets the
   user — not a commit-log restatement).
6. Pushes commit + tags atomically with `git push --follow-tags`.

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

- **Regular commits** — even if they change `skills/<name>/` or `src/<name>/`. Bumping is
  a release action, not a push action. The version stays at the last tag
  until the next `/release`.
- **Docs-only changes at the repo root** (`README.md`, `MIGRATION.md`,
  `CLAUDE.md`, `LICENSE`, `.claude/`).
- **`CHANGELOG.md`** — it is a release *output* written by `/release` to
  describe a release, not an input that triggers one. Like the other
  root docs above, changing it never bumps a plugin.

### `marketplace.json` changes

If `.claude-plugin/marketplace.json` changes in a way that affects a plugin
entry (`name` / `source` / `description` / `license`), `/release` treats
that as a user-visible change for the affected plugin and prompts for a
bump alongside the directory's own changes.
