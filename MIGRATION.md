# Migration guide

- [v0.5.0 → v0.5.1](#v050--v051) — marketplace rename (`solopreneur-*` → `solopreneur` / `solo-*`), `solo-marketer` and `solo-neo4j-dev` added, `solopreneur-nextjs` and `solopreneur-python` removed, `llm-dev` agent renamed to `ai-engineer`
- [v0.4.x → v0.5.0](#v04x--v050) — designer agent split out of `solopreneur-core`
- [v0.2.x → v0.3.0](#v02x--v030) — monolithic plugin split into six sub-plugins

---

## v0.5.0 → v0.5.1

This release reorganises the marketplace. The changes are entirely about
naming, scope, and packaging — no in-house skill content is removed. Pre-1.0
versioning is conservative (patch bumps), but the plugin renames make this a
**hard breaking change** at the Claude Code dependency-resolver level: the
old plugin names disappear, so existing installs must be uninstalled and
re-installed under their new names.

### What changed

**Plugin renames** (the path stays the same; only the marketplace `name` is
new):

| Before | After |
|---|---|
| `solopreneur-core` | `solopreneur` |
| `solopreneur-designer` | `solo-designer` |
| `solopreneur-ios` | `solo-ios-dev` |
| `solopreneur-android` | `solo-android-dev` |
| `solopreneur-llm` | `solo-ai-engineer` |

**Plugins removed**: `solopreneur-nextjs`, `solopreneur-python`. Both shipped
only an agent and no curated skills; the `nextjs-dev` and `python-dev`
specialist subagents are no longer dispatchable from `/specialist-review`,
`/preflight`, `/todos-review`, or `/autopilot`. Use the `general-purpose`
subagent for those stacks until / unless we ship replacement plugins.

**Plugins added**:

- **`solo-marketer`** — bundles the marketing / brand / writing skills that
  used to live in `solopreneur-core`: `gtm`, `naming`, `humanly`, `x-writing`,
  `x-growth`, `linkedin-growth`, `slide-design`. Adds a new `marketer` agent.
- **`solo-neo4j-dev`** — bundles the `neo4j-dev` agent and four vendored
  Neo4j skills (`neo4j-cypher`, `neo4j-cypher-guide`, `neo4j-migration`,
  `neo4j-cli-tools`).

**Agent rename inside `solo-ai-engineer`**: `llm-dev` → `ai-engineer`. If
you dispatch this subagent from custom scripts, update the `subagent_type`.

**Skill prefix renames**. Plugin-bundled skills are now invoked under the
new plugin namespace:

| Before | After |
|---|---|
| `solopreneur-core:slide-design` | `solo-marketer:slide-design` |
| `solopreneur-core:gtm` | `solo-marketer:gtm` |
| `solopreneur-core:naming` | `solo-marketer:naming` |
| `solopreneur-core:humanly` | `solo-marketer:humanly` |
| `solopreneur-core:x-writing` | `solo-marketer:x-writing` |
| `solopreneur-core:x-growth` | `solo-marketer:x-growth` |
| `solopreneur-core:linkedin-growth` | `solo-marketer:linkedin-growth` |
| `solopreneur-core:<other>` | `solopreneur:<other>` |
| `solopreneur-designer:<name>` | `solo-designer:<name>` |
| `solopreneur-ios:<name>` | `solo-ios-dev:<name>` |
| `solopreneur-android:<name>` | `solo-android-dev:<name>` |
| `solopreneur-llm:<name>` | `solo-ai-engineer:<name>` |

The bare skill names (e.g. `slide-design`, `taste-soft`, `compose-ui`) are
unchanged — only the plugin prefix changed.

### TL;DR — what to run

```bash
# 1. Uninstall every old solopreneur-* plugin you have
claude plugin uninstall solopreneur-core
claude plugin uninstall solopreneur-designer
claude plugin uninstall solopreneur-ios
claude plugin uninstall solopreneur-android
claude plugin uninstall solopreneur-llm
claude plugin uninstall solopreneur-nextjs   # if installed
claude plugin uninstall solopreneur-python   # if installed

# 2. Pull the updated marketplace
claude plugin marketplace update solopreneur

# 3. Install the renamed core plugin (required by every other plugin)
claude plugin install solopreneur@solopreneur

# 4. Install the new and renamed sub-plugins you need
claude plugin install solo-marketer@solopreneur        # GTM / naming / writing / slides
claude plugin install solo-designer@solopreneur        # auto-pulls solopreneur
claude plugin install solo-ios-dev@solopreneur         # auto-pulls solopreneur
claude plugin install solo-android-dev@solopreneur     # auto-pulls solopreneur
claude plugin install solo-ai-engineer@solopreneur     # auto-pulls solopreneur
claude plugin install solo-neo4j-dev@solopreneur       # auto-pulls solopreneur
```

If you skip the uninstall step, the old `solopreneur-*` plugins stay cached
alongside the new ones. Skills like `/preflight` will still resolve, but
plugin-namespaced invocations (`solopreneur-core:slide-design`) silently
keep working against the old cache, masking the move and producing
inconsistent behaviour. Uninstall first.

### Stand-alone `neo4j-dev.md` agent file

If you previously dropped a hand-rolled `neo4j-dev.md` into
`$CLAUDE_CONFIG_DIR/agents/`, delete it after installing
`solo-neo4j-dev` — otherwise both definitions will exist and Claude Code's
agent resolution between two same-named agents is undefined. The
plugin-bundled version is now the canonical one.

```bash
rm "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agents/neo4j-dev.md"
```

The same applies to any local `~/Agents/...` checkout that contained a
prior copy of `neo4j-dev.md`.

### `/rebuild-skill-index`

After installing the new plugins, run `/rebuild-skill-index` once. The skill
now writes two new platform indexes:

- `$BASE/solopreneur/skill-index/marketer.md`
- `$BASE/solopreneur/skill-index/neo4j-dev.md`

…and `frontend-slides` / `revealjs` skills are now classified into the
**marketer** index instead of design.

---

## v0.4.x → v0.5.0

`solopreneur-core` v0.5.0 **removes the `designer` agent**. The agent has
moved into a new `solopreneur-designer` sub-plugin, which also bundles 10
vendored design skills (the `taste-*` archetype family + `impeccable`).

This is a breaking change for anyone who invoked `solopreneur-core:designer`
or used the `designer` agent. Run:

```bash
# 1. Pull the updated marketplace
claude plugin marketplace update solopreneur

# 2. Update core (designer will disappear from this plugin)
claude plugin update solopreneur-core

# 3. Install the new designer plugin (auto-pulls core >=0.5.0)
claude plugin install solopreneur-designer@solopreneur
```

After install, designer is callable as before via the `Agent` tool. The
10 newly-bundled design skills are invokable as
`solopreneur-designer:<name>` (e.g. `solopreneur-designer:taste-soft`,
`solopreneur-designer:impeccable`).

If you previously hand-installed `taste-*` or `impeccable` under
`$CLAUDE_CONFIG_DIR/skills/`, you can delete those copies — the plugin
ships pinned-version vendored copies with `_VENDOR.md` traceability sidecars.

Run `/rebuild-skill-index` to refresh extended skill indexes (the skill now
looks for `designer.md` inside `solopreneur-designer`, not `solopreneur-core`).

---

## v0.2.x → v0.3.0

v0.3.0 splits the monolithic `solopreneur` plugin into **six focused
sub-plugins** so you only pay the context cost of the stacks you actually
build in. This is a breaking change — the old `solopreneur` plugin is gone
and the marketplace ships six new plugin names instead. (Per semver, 0.x
minor bumps may be breaking; a proper 1.0.0 will come once the API
stabilizes.)

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

| Before (v0.2.x) | After (v0.3.0) |
|---|---|
| `solopreneur` (22 skills + 7 agents in one bundle) | `solopreneur-core`, `solopreneur-ios`, `solopreneur-android`, `solopreneur-nextjs`, `solopreneur-python`, `solopreneur-llm` |

- **`solopreneur-core`** contains the 20 general skills and the `designer`
  agent. Every user should install this.
- Each **stack plugin** contains one specialist agent (and, for iOS and
  Android, its associated patterns skill). Install only the stacks you
  actually build.
- Stack plugins declare `dependencies: [{ name: "solopreneur-core",
  version: ">=0.3.0" }]`, so `claude plugin install solopreneur-ios@solopreneur`
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

```text
<plugin-name>--v<version>
```

Examples: `solopreneur-core--v0.3.0`, `solopreneur-ios--v0.3.0`. The old
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
