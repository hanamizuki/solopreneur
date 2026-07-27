# Migration guide

Breaking renames in this marketplace's history. The plugin renames need an
uninstall + reinstall; the skill renames only need a plugin update, but the old
command names stop resolving.

- [Skill consolidation: `/plan-review`](#skill-consolidation-plan-review):
  `/tech-vetting` renamed, `/second-opinion` retired, both folded into one skill.
- [v0.5.x → v0.5.3](#v05x--v053): drop the `solo-` prefix on sub-plugins.
- [v0.3.0 → v0.5.x](#v030--v05x): rename the `solopreneur-*` family to
  `solopreneur` + `solo-*`, split out the designer agent, add `solo-marketer`
  and `solo-neo4j-dev`, drop `solopreneur-nextjs` and `solopreneur-python`.

---

## Skill consolidation: `/plan-review`

Lands in the first `solopreneur` release after `solopreneur--v0.5.35`. Affects
the core `solopreneur` plugin only — no other plugin changes, no reinstall.

### What changed

**`/tech-vetting` → `/plan-review`.** The pre-implementation vetting skill was
renamed and expanded. It now runs three stages over a spec, implementation plan,
or design doc: technical vetting against the latest official docs and platform
best practices (what `/tech-vetting` did), a leanness pass that lists what the
plan doesn't need, and an independent outside reviewer. A shared resolution
phase then walks you through every finding — adopt, skip, or discuss — and
writes the accepted ones back.

> **This is the skill's second rename.** It shipped as `/preflight`, became
> `/tech-vetting` in v0.5.x, and is now `/plan-review`. If you already updated
> scripts once for the `/preflight` cut, this is the same exercise. There is no
> alias — `/tech-vetting` no longer resolves.

**`/second-opinion` retired.** Its adversarial Codex review is now
`/plan-review`'s third stage, with the same 5 dimensions (completeness,
consistency, clarity, scope, feasibility), the same Codex-CLI-first / subagent-
fallback behaviour, and the same per-finding adjudication. Nothing was dropped.
`/second-opinion` no longer resolves.

Three skills claimed overlapping "review this plan / review this spec" triggers,
so which one answered was effectively a coin flip. That is why the consolidation
is a hard cut rather than an alias — leaving the old names live would leave the
collision live.

### What to run

```bash
claude plugin marketplace update solopreneur
claude plugin update solopreneur
```

Then update any custom script, cron job, or muscle memory:

| Before | After |
|---|---|
| `/tech-vetting` | `/plan-review` |
| `/second-opinion` | `/plan-review` (stage 3 is the old behaviour) |

**Automated / unattended callers should use `/plan-review internal`** — it runs
the first two stages and skips the external reviewer, which costs ~240K tokens
per run. `/autopilot` and `/todos-babysit` already pass it. Interactive
`/plan-review` runs all three stages and confirms the cost before stage 3.

---

## v0.5.x → v0.5.3

The `solo-` prefix on every sub-plugin was redundant since installs already
qualify with `@solopreneur` (e.g. `marketer@solopreneur`). The prefix is gone.
Installs and skill invocations are shorter.

### What changed

**Plugin renames:**

| Before | After |
|---|---|
| `solo-designer` | `designer` |
| `solo-marketer` | `marketer` |
| `solo-ios-dev` | `ios-dev` |
| `solo-android-dev` | `android-dev` |
| `solo-ai-engineer` | `ai-engineer` |
| `solo-neo4j-dev` | `neo4j-dev` |

The `solopreneur` core plugin name is unchanged.

**Skill invocation prefix renames:**

| Before | After |
|---|---|
| `solo-marketer:slide-design` | `marketer:slide-design` |
| `solo-designer:taste-soft` | `designer:taste-soft` |
| `solo-ios-dev:ios-patterns` | `ios-dev:ios-patterns` |
| `solo-android-dev:android-patterns` | `android-dev:android-patterns` |
| `solo-ai-engineer:langgraph` | `ai-engineer:langgraph` |
| `solo-neo4j-dev:neo4j-cypher` | `neo4j-dev:neo4j-cypher` |

Bare skill names (e.g. `slide-design`, `taste-soft`, `compose-ui`) are
unchanged.

### What to run

```bash
# 1. Uninstall every old solo-* plugin you have
claude plugin uninstall solo-designer
claude plugin uninstall solo-marketer
claude plugin uninstall solo-ios-dev
claude plugin uninstall solo-android-dev
claude plugin uninstall solo-ai-engineer
claude plugin uninstall solo-neo4j-dev

# 2. Pull the updated marketplace
claude plugin marketplace update solopreneur

# 3. Update the core plugin
claude plugin update solopreneur

# 4. Reinstall the renamed sub-plugins you need
claude plugin install marketer@solopreneur
claude plugin install designer@solopreneur
claude plugin install ios-dev@solopreneur
claude plugin install android-dev@solopreneur
claude plugin install ai-engineer@solopreneur
claude plugin install neo4j-dev@solopreneur
```

If you skip the uninstall step, the old `solo-*` plugins stay cached
alongside the new ones, and plugin-namespaced invocations
(`solo-marketer:slide-design`) silently keep working against the old cache.
Uninstall first to avoid masked behaviour.

---

## v0.3.0 → v0.5.x

Coming from `solopreneur-core--v0.3.0` (the last release before the rename)?
The plugin family was renamed and reorganised between v0.3.0 and the v0.5.x
line. The old `solopreneur-*` plugin names are gone.

> If you're already on the v0.5.x `solo-*` line, you only need the v0.5.x →
> v0.5.3 steps above.

### What changed

**Plugin renames:**

| Before (v0.3.0) | After (v0.5.x) |
|---|---|
| `solopreneur-core` | `solopreneur` |
| `solopreneur-designer` | `solo-designer` (now `designer`) |
| `solopreneur-ios` | `solo-ios-dev` (now `ios-dev`) |
| `solopreneur-android` | `solo-android-dev` (now `android-dev`) |
| `solopreneur-llm` | `solo-ai-engineer` (now `ai-engineer`) |

**Plugins removed:** `solopreneur-nextjs` and `solopreneur-python`. Both
shipped only an agent and no curated skills. The `nextjs-dev` and
`python-dev` specialist subagents are no longer dispatchable from
`/specialist-review`, `/tech-vetting`, `/todos-review`, or `/autopilot`. Use the
`general-purpose` subagent for those stacks until / unless we ship
replacement plugins.

**Plugins added:**

- **`designer`** splits the `designer` agent out of `solopreneur-core` and
  bundles 10 vendored design skills (the `taste-*` archetype family +
  `impeccable`).
- **`marketer`** bundles the marketing / brand / writing skills and a new
  `marketer` agent: `gtm`, `naming`, `humanly`, `x-writing`, `x-growth`,
  `linkedin-growth`, `slide-design`.
- **`neo4j-dev`** bundles the `neo4j-dev` agent and four vendored Neo4j
  skills.

**Agent rename inside `ai-engineer`:** `llm-dev` → `ai-engineer`. If you
dispatch this subagent from custom scripts, update the `subagent_type`.

**Skill rename inside `solopreneur`:** `/preflight` → `/tech-vetting`. The
pre-implementation plan-vetting skill was renamed to better describe what it
does (vet a plan against the latest official docs + platform best practices).
There is no alias — invoking `/preflight` no longer resolves. Update any
custom scripts, cron jobs, or muscle memory to `/tech-vetting`.

### What to run

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
claude plugin install marketer@solopreneur
claude plugin install designer@solopreneur
claude plugin install ios-dev@solopreneur
claude plugin install android-dev@solopreneur
claude plugin install ai-engineer@solopreneur
claude plugin install neo4j-dev@solopreneur
```

### Stand-alone `neo4j-dev.md` agent file

If you previously dropped a hand-rolled `neo4j-dev.md` into
`$CLAUDE_CONFIG_DIR/agents/`, delete it after installing `neo4j-dev`.
Otherwise both definitions exist and Claude Code's agent resolution between
two same-named agents is undefined.

```bash
rm "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agents/neo4j-dev.md"
```

The same applies to any local `~/Agents/...` checkout that contained a prior
copy of `neo4j-dev.md`.

### `/rebuild-skill-index`

After installing the new plugins, run `/rebuild-skill-index` once. The skill
now writes two new platform indexes:

- `$BASE/solopreneur/skill-index/marketer.md`
- `$BASE/solopreneur/skill-index/neo4j-dev.md`

`frontend-slides` and `revealjs` skills are now classified into the
**marketer** index instead of design.
