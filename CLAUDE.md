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

## Release rule

Before pushing to `main`, for every sub-plugin whose files changed in the
current set of commits:

1. **Bump the version** in `plugins/<name>/.claude-plugin/plugin.json`
   - bug fix / docs / refactor → patch (`0.3.0` → `0.3.1`)
   - new skill / agent / user-visible behavior → minor (`0.3.0` → `0.4.0`)
   - pre-1.0, minor bumps may be breaking; 1.0 is reserved for the first
     stable API cut
2. **Tag the commit** for each bumped plugin with Claude Code's official
   double-dash tag format:

   ```bash
   git tag -a <plugin-name>--v<version> -m "<plugin-name> v<version>: <summary>"
   ```

   Example:

   ```bash
   git tag -a solopreneur-ios--v0.4.0 -m "solopreneur-ios v0.4.0: add XYZ"
   ```

   The double-dash is required — Claude Code uses it to resolve plugin
   versions from git tags.
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

Bump + tag only those plugins. If several plugins change together, each
still gets its own bump and its own `<name>--v<version>` tag on the same
merge commit.

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
