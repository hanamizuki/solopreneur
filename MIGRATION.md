# Migrating from v0.2.x to v1.0.0

v1.0.0 splits the monolithic `solopreneur` plugin into **six focused
sub-plugins** so you only pay the context cost of the stacks you actually
build in. This is a breaking change — the old `solopreneur` plugin is gone
and the marketplace ships six new plugin names instead.

## TL;DR — what to run

```bash
# 1. Uninstall the old monolithic plugin
claude plugin uninstall solopreneur
```

> If you skip the uninstall step, the old monolithic plugin stays cached
> alongside the new sub-plugins. Skills with the same name (`/preflight`,
> `/greenlight`, `/specialist-review`, etc.) will exist in both — resolution
> is undefined and you may see duplicated or inconsistent behavior until you
> actually uninstall `solopreneur`.

```bash
# 2. Pull the updated marketplace (it now lists the new plugins)
claude plugin marketplace update solopreneur

# 3. Install the core plugin (required by every stack plugin)
claude plugin install solopreneur-core@solopreneur

# 4. Install whichever stack plugins apply to your work
claude plugin install solopreneur-ios@solopreneur        # auto-pulls core
claude plugin install solopreneur-android@solopreneur    # auto-pulls core
claude plugin install solopreneur-nextjs@solopreneur     # auto-pulls core
claude plugin install solopreneur-python@solopreneur     # auto-pulls core
claude plugin install solopreneur-llm@solopreneur        # auto-pulls core
```

Requires Claude Code **≥ v2.1.110** (for `dependencies`-driven auto-install).

## What changed

### 1. One plugin → six plugins

| Before (v0.2.x) | After (v1.0.0) |
|---|---|
| `solopreneur` (22 skills + 7 agents in one bundle) | `solopreneur-core`, `solopreneur-ios`, `solopreneur-android`, `solopreneur-nextjs`, `solopreneur-python`, `solopreneur-llm` |

- **`solopreneur-core`** contains the 20 general skills and the `designer`
  agent. Every user should install this.
- Each **stack plugin** contains one specialist agent (and, for iOS and
  Android, its associated patterns skill). Install only the stacks you
  actually build.
- Stack plugins declare `dependencies: [{ name: "solopreneur-core",
  version: ">=1.0.0" }]`, so `claude plugin install solopreneur-ios@solopreneur`
  automatically installs `solopreneur-core` too.

### 2. `web-dev` agent is removed

The `web-dev` agent is dropped; `nextjs-dev` now covers the general
React/frontend role. If you have custom prompts or scripts that reference
`web-dev`, switch them to `nextjs-dev`. Skills inside this repo that used
to dispatch `web-dev` (`/specialist-review`, `/autopilot`, `/preflight`,
`/todos-review`) have already been updated.

### 3. `ios-patterns` and `android-patterns` skills moved

Because only users on that stack need them, these skills now ship **inside
the stack plugin**, not the core bundle.

Their Skill-tool invocation prefix changed accordingly:

| Before | After |
|---|---|
| `solopreneur:ios-patterns` | `solopreneur-ios:ios-patterns` |
| `solopreneur:android-patterns` | `solopreneur-android:android-patterns` |

If you have custom agents or scripts that invoke these skills by the old
namespaced name, update the prefix.

### 4. Tag format

Git tags for releases now use Claude Code's official double-dash format:

```
<plugin-name>--v<version>
```

Examples: `solopreneur-core--v1.0.0`, `solopreneur-ios--v1.0.0`. The old
single-`v`-prefix tags (`v0.2.1`) only applied to the monolithic plugin and
aren't used anymore.

## If a skill says an agent isn't installed

`/specialist-review` and `/todos-review` still run for any stack detected in
the diff — but if you haven't installed the matching stack plugin, the
review for that stack is done inline with generic expertise instead of the
skill-index-backed specialist. The report will prefix a warning like:

> ⚠️ `ios-dev` not installed — review done with generic expertise. Install
> `solopreneur-ios` for deeper, skill-index-backed review.

Install the referenced plugin to upgrade the review quality.

`/preflight` behaves similarly but falls back to the `general-purpose`
subagent **silently** (no warning blockquote). If your preflight feels
lighter than usual after migrating, install the relevant stack plugin to
restore skill-index-backed review.

## Verifying the migration

After installing, list what's active:

```bash
claude plugin list
```

You should see one entry per sub-plugin you installed (e.g.
`solopreneur-core`, `solopreneur-ios`). Slash commands under core
(`/preflight`, `/greenlight`, `/autopilot`, …) should resolve. Stack agents
(`ios-dev`, `android-dev`, …) should be available to the `Agent` tool.

Run `/rebuild-skill-index` to regenerate per-config extended indexes — the
skill now resolves each agent from its own sub-plugin cache.
