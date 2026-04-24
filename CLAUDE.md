# solopreneur

This repo ships **six sub-plugins** from a single marketplace:

| Plugin | Path | Depends on |
|---|---|---|
| `solopreneur-core` | `plugins/core/` | — |
| `solopreneur-ios` | `plugins/ios/` | `solopreneur-core` |
| `solopreneur-android` | `plugins/android/` | `solopreneur-core` |
| `solopreneur-nextjs` | `plugins/nextjs/` | `solopreneur-core` |
| `solopreneur-python` | `plugins/python/` | `solopreneur-core` |
| `solopreneur-llm` | `plugins/llm/` | `solopreneur-core` |

Each sub-plugin has its **own** `.claude-plugin/plugin.json` and its own
version. `.claude-plugin/marketplace.json` at the repo root lists all six.

## Release rule

Before pushing to `main`, for every sub-plugin whose files changed in the
current set of commits:

1. **Bump the version** in `plugins/<name>/.claude-plugin/plugin.json`
   - bug fix / docs / refactor → patch (`1.0.0` → `1.0.1`)
   - new skill / agent / user-visible behavior → minor (`1.0.0` → `1.1.0`)
   - breaking change → major (`1.x` → `2.0.0`)
2. **Tag the commit** for each bumped plugin with Claude Code's official
   double-dash tag format:

   ```bash
   git tag -a <plugin-name>--v<version> -m "<plugin-name> v<version>: <summary>"
   ```

   Example:

   ```bash
   git tag -a solopreneur-ios--v1.1.0 -m "solopreneur-ios v1.1.0: add XYZ"
   ```

   The double-dash is required — Claude Code uses it to resolve plugin
   versions from git tags.
3. **Push the commit and all new tags together**:

   ```bash
   git push --follow-tags
   ```

### Quick scan for which plugins changed

```bash
git diff --name-only <base>..HEAD | awk -F/ '/^plugins\// { print $2 }' | sort -u
```

Bump + tag only those plugins. If several plugins change together, each
still gets its own bump and its own `<name>--v<version>` tag on the same
merge commit.

### Exceptions

- A pure `chore(<plugin>): bump version to X` commit (no other changes in
  that plugin) doesn't need a further bump on the next push.
- Docs-only changes at the repo root (`README.md`, `MIGRATION.md`,
  `CLAUDE.md`, `LICENSE`) don't touch any sub-plugin's version.
