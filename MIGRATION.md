# Migration guide

Coming from a previously-installed `solopreneur` marketplace? The plugin
family was renamed and reorganised between the last `solopreneur-core--v0.3.0`
release and the current `solopreneur--v0.5.x` line. The old plugin names are
gone; you need to uninstall and reinstall under the new names.

## What changed

### Plugin renames

Paths are unchanged; only the marketplace `name` is new.

| Before | After |
|---|---|
| `solopreneur-core` | `solopreneur` |
| `solopreneur-designer` | `solo-designer` |
| `solopreneur-ios` | `solo-ios-dev` |
| `solopreneur-android` | `solo-android-dev` |
| `solopreneur-llm` | `solo-ai-engineer` |

### Plugins removed

`solopreneur-nextjs` and `solopreneur-python` are gone. Both shipped only an
agent and no curated skills. The `nextjs-dev` and `python-dev` specialist
subagents are no longer dispatchable from `/specialist-review`, `/preflight`,
`/todos-review`, or `/autopilot`. Use the `general-purpose` subagent for those
stacks until / unless we ship replacement plugins.

### Plugins added

- **`solo-designer`** splits the `designer` agent out of `solopreneur-core`
  and bundles 10 vendored design skills (the `taste-*` archetype family +
  `impeccable`).
- **`solo-marketer`** bundles the marketing / brand / writing skills and a
  new `marketer` agent: `gtm`, `naming`, `humanly`, `x-writing`, `x-growth`,
  `linkedin-growth`, `slide-design`.
- **`solo-neo4j-dev`** bundles the `neo4j-dev` agent and four vendored Neo4j
  skills.

### Agent rename inside `solo-ai-engineer`

`llm-dev` → `ai-engineer`. If you dispatch this subagent from custom scripts,
update the `subagent_type`.

### Skill prefix renames

Plugin-bundled skills are now invoked under the new plugin namespace. The
bare skill names (e.g. `slide-design`, `taste-soft`, `compose-ui`) are
unchanged; only the plugin prefix changed.

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

## What to run

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
claude plugin install solo-marketer@solopreneur
claude plugin install solo-designer@solopreneur
claude plugin install solo-ios-dev@solopreneur
claude plugin install solo-android-dev@solopreneur
claude plugin install solo-ai-engineer@solopreneur
claude plugin install solo-neo4j-dev@solopreneur
```

If you skip the uninstall step, the old `solopreneur-*` plugins stay cached
alongside the new ones, and plugin-namespaced invocations
(`solopreneur-core:slide-design`) silently keep working against the old
cache. Uninstall first to avoid masked behaviour.

## Stand-alone `neo4j-dev.md` agent file

If you previously dropped a hand-rolled `neo4j-dev.md` into
`$CLAUDE_CONFIG_DIR/agents/`, delete it after installing `solo-neo4j-dev`.
Otherwise both definitions exist and Claude Code's agent resolution between
two same-named agents is undefined.

```bash
rm "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agents/neo4j-dev.md"
```

The same applies to any local `~/Agents/...` checkout that contained a prior
copy of `neo4j-dev.md`.

## `/rebuild-skill-index`

After installing the new plugins, run `/rebuild-skill-index` once. The skill
now writes two new platform indexes:

- `$BASE/solopreneur/skill-index/marketer.md`
- `$BASE/solopreneur/skill-index/neo4j-dev.md`

`frontend-slides` and `revealjs` skills are now classified into the
**marketer** index instead of design.
