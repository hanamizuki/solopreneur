# solopreneur

This repo ships **seven sub-plugins** from a single marketplace:

| Plugin | Path | Depends on |
|---|---|---|
| `solopreneur` | `plugins/solopreneur/` | — |
| `solo-designer` | `plugins/solo-designer/` | `solopreneur` |
| `solo-marketer` | `plugins/solo-marketer/` | `solopreneur` |
| `solo-ios-dev` | `plugins/solo-ios-dev/` | `solopreneur` |
| `solo-android-dev` | `plugins/solo-android-dev/` | `solopreneur` |
| `solo-ai-engineer` | `plugins/solo-ai-engineer/` | `solopreneur` |
| `solo-neo4j-dev` | `plugins/solo-neo4j-dev/` | `solopreneur` |

Each plugin's directory name matches its marketplace `name` 1:1. The
`Depends on` column shows the marketplace `name` declared in
`plugins/<dir>/.claude-plugin/plugin.json` `dependencies`.

## Release rule

Before pushing to `main`, for every sub-plugin whose files changed in the
current set of commits:

1. **Bump the version** in `plugins/<dir>/.claude-plugin/plugin.json`
   - Default to **patch** for everything: bug fix, docs, refactor, new
     skill, new agent, internal restructure. Always the smallest bump.
   - Bump **minor** only when the user explicitly says so — typically when
     the change is a milestone they want to mark (e.g. an API surface they
     plan to start promoting).
   - **`1.0.0` is reserved** for the first stable, promotable cut of a
     plugin. Don't reach 1.0 by accumulation — only when the user says it's
     ready.
2. **Tag the commit** for each bumped plugin with Claude Code's official
   double-dash tag format:

   ```bash
   git tag -a <plugin-name>--v<version> -m "<plugin-name> v<version>: <summary>"
   ```

   Example:

   ```bash
   git tag -a solo-android-dev--v0.4.4 -m "solo-android-dev v0.4.4: add XYZ"
   ```

   The double-dash is required — Claude Code uses it to resolve plugin
   versions from git tags. The directory name now matches the marketplace
   `name`, so either reference works — but stick to the marketplace `name`
   for consistency with installer commands.
3. **Push the commit and all new tags together** — this MUST be atomic, so
   that the merge commit does not appear on `origin/main` before the
   matching `<plugin>--v<version>` tags:

   ```bash
   git push --follow-tags
   ```

   If you push the commit alone (`git push`) and then the tags later,
   users installing in the gap will hit `no-matching-tag` errors from
   Claude Code's dependency resolver.

### Quick scan for which plugins changed

```bash
git diff --name-only <base>..HEAD | awk -F/ '/^plugins\// { print $2 }' | sort -u
```

This prints directory names which now match the marketplace `name` 1:1
(e.g. `solopreneur`, `solo-android-dev`). Bump + tag only the plugins that
changed. If several plugins change together, each still gets its own bump
and its own `<name>--v<version>` tag on the same merge commit.

### `marketplace.json` changes also bump

If `.claude-plugin/marketplace.json` changed in a way that affects a plugin
entry (name / source / description / license), that counts as a user-visible
change for every affected sub-plugin — bump their versions too. The scan
command above doesn't catch this; check `marketplace.json` separately.

### Exceptions

- A pure `chore(<plugin>): bump version to X` commit (no other changes in
  that plugin) doesn't need a further bump on the next push.
- Docs-only changes at the repo root (`README.md`, `MIGRATION.md`,
  `CLAUDE.md`, `LICENSE`) don't touch any sub-plugin's version.
