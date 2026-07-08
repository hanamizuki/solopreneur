# Codex Dual-Publish

**Status:** Approved design (10 decisions resolved 2026-07-08)
**Date:** 2026-07-08
**Affected plugins:** all seven (`solopreneur`, `designer`, `marketer`, `ios-dev`, `android-dev`, `ai-engineer`, `neo4j-dev`)
**Research trail:** `todos/backlog/2026-07-07_codex-dual-publish.md`

## Problem

This repo ships seven Claude Code plugins from one marketplace. Codex
(codex-cli 0.142.5+) has its own native plugin system — plugins,
marketplaces, skills, and subagents — with formats close enough to share
content but different enough to need adapters. Users who work in Codex
cannot install any of this today.

The goal is dual publishing from the same repository: one source of truth
for skill content, with per-platform manifests and adapters, so a user on
either harness installs the same capabilities.

## Goals

- Any of the seven plugins is installable in Codex via
  `codex plugin marketplace add <owner>/<repo>[@ref]` +
  `codex plugin add <plugin>@<marketplace>`.
- Skill content is edited once and served to both platforms unchanged.
- Platform manifests cannot drift: everything derivable is generated, and
  CI fails on divergence.
- Claude Code behavior is unchanged throughout the migration.

## Non-goals

- No `solopreneur-suite` bundle plugin (decision 1).
- No dependency enforcement on Codex — documentation only (decision 2).
- No package/build artifacts for local testing (decision 6).
- No relocation of skills out of `plugins/<name>/skills/` (decision 8).
- No per-platform CHANGELOG or tag namespace (decision 7).

## Verified platform facts

As of codex-cli 0.142.5 (verified 2026-07-07/08 against official docs and
local dry runs):

- Codex plugins can ship **skills, apps, and MCP servers only** — not
  custom agents.
- Codex marketplaces resolve `owner/repo[@ref]` git sources and local
  paths; installs are snapshots, updated via `codex plugin marketplace`
  upgrade.
- Codex subagents are TOML files (`~/.codex/agents/` personal,
  `.codex/agents/` project) with `name`, `description`,
  `developer_instructions`, plus optional `model`, `sandbox_mode`,
  `mcp_servers`, `skills.config`. Built-ins: `default`, `worker`,
  `explorer`.
- Codex **never delegates to a subagent proactively** — it spawns agents
  only when explicitly asked. Skills, however, load into initial context
  (budget: 2% of context window or 8,000 characters) and trigger from
  their descriptions.
- Claude Code plugin skills always load into the main session; there is
  no mechanism to scope a skill to a subagent. Agent `description`
  frontmatter is Claude's proactive-routing signal.
- Codex treats every directory under a plugin's `skills/` as a skill and
  rejects directories without `SKILL.md` (currently `_vendored`,
  `_shared`).

## Decisions (normative)

1. **Structure** — mirror the seven sub-plugins on Codex; `marketer`
   pilots first.
2. **Dependencies** — documentation only ("install `solopreneur` first
   for skill-index and workflow base"); existing soft-dependency and
   graceful degradation stay as-is.
3. **Non-skill directories** — `skills/_vendored` → `vendor/`,
   `skills/_shared` → `shared/` (plugin root), sequenced after the
   `$N`-escape backlog todo.
4. **Agents** — convert all six agents to Codex TOML *and* add one
   router skill per plugin. TOML source lives next to the markdown
   agent; a bootstrap skill installs TOMLs for plugin users.
5. **Vocabulary** — hybrid: rewrite ~20 native files platform-neutral;
   leave ~13 vendored files untouched behind a per-harness mapping
   reference; resolve config paths in the shared config helper.
6. **Local dev** — install via the repo's Codex marketplace file
   directly; no package artifacts.
7. **Release** — one version per plugin across both manifests, bumped in
   the same `/release` commit; Codex manifests are generated; tags stay
   `<plugin>--v<version>`; single CHANGELOG.
8. **Skill layout** — skills stay in `plugins/<name>/skills/`; a
   generated `docs/skills-catalog.md` provides the cross-plugin
   overview.
9. **Router skill shape** — router + usage guide with advisory
   delegation; no embedded skill list.
10. **Router skill naming** — `using-<plugin>` (e.g.
    `ios-dev:using-ios-dev`), one per plugin.

## File ownership

| Path | Platform | Maintained |
| --- | --- | --- |
| `plugins/<n>/skills/**` (incl. `using-<n>`) | both | by hand |
| `plugins/<n>/agents/<n>.md` | Claude | by hand |
| `plugins/<n>/agents/<n>.toml` | Codex (source of truth) | by hand |
| `plugins/<n>/.claude-plugin/plugin.json` | Claude (version source of truth) | by hand |
| `plugins/<n>/.codex-plugin/plugin.json` | Codex | **generated** |
| `scripts/codex-manifest-overlays.json` | Codex (interface metadata) | by hand |
| `.claude-plugin/marketplace.json` | Claude | by hand |
| `.agents/plugins/marketplace.json` | Codex | **generated** |
| `.codex/agents/*.toml` | Codex in-repo dev | **generated** (copies of agent TOMLs) |
| `plugins/<n>/vendor/` | repo-internal vendoring metadata | generated by sync |
| `plugins/solopreneur/shared/` | both (helper docs, harness map) | by hand |
| `docs/skills-catalog.md` | docs | **generated** |

Generated files are committed (installers read the repo, there is no
build step at install time). One generator script owns all four generated
surfaces; CI re-runs it and fails on any diff, mirroring the existing
`validate-vendored` drift-check pattern.

## Codex manifest shape

Generated `plugins/<n>/.codex-plugin/plugin.json`:

```json
{
  "name": "ios-dev",
  "version": "0.4.6",
  "description": "<copied from .claude-plugin/plugin.json>",
  "license": "MIT",
  "hooks": {},
  "interface": {
    "displayName": "iOS Dev",
    "category": "development",
    "capabilities": ["skills"]
  }
}
```

- `name`, `version`, `description`, `license` copy verbatim from the
  Claude manifest — version lockstep is structural, not procedural.
- `interface` (and any other Codex-only field) comes from the plugin's
  entry in `scripts/codex-manifest-overlays.json`.
- `"hooks": {}` is a guard against Codex loading Claude-format hook
  files (superpowers precedent). Our plugins ship no hooks today; the
  guard is cheap insurance.

## Codex marketplace shape

Generated `.agents/plugins/marketplace.json` lists all seven plugins with
`./plugins/<name>` sources, mirroring `.claude-plugin/marketplace.json`
entries (name, description, source). Local development installs from the
working tree via this file; end users add the GitHub repo (optionally
pinned `@<plugin>--v<version>`).

## Directory moves

`skills/_vendored` (five plugins) and `skills/_shared` (solopreneur) are
metadata/helper directories that Codex's validator rejects as skills.

- `plugins/<n>/skills/_vendored/` → `plugins/<n>/vendor/`
- `plugins/solopreneur/skills/_shared/` → `plugins/solopreneur/shared/`

One PR updates, atomically: `plugins/solopreneur/scripts/sync-vendored.sh`,
`.github/workflows/sync-vendored.yml`,
`.github/workflows/validate-vendored.yml`, five `agents/*.md` references,
and seven `_shared/config.md` references. `_VENDOR.md` markers regenerate
on the next sync. This PR lands **after** the `$N`-escape todo — both
touch `sync-vendored.sh`.

## Agents and delegation

### TOML conversion

Each `plugins/<n>/agents/<n>.md` gains a sibling `<n>.toml`:

| Markdown agent | Codex TOML |
| --- | --- |
| `name` frontmatter | `name` |
| `description` frontmatter | `description` |
| body (system prompt) | `developer_instructions` |
| `tools` allowlist | *(not portable — omit; Codex uses `sandbox_mode`)* |
| `model` | `model` (only when explicitly pinned) |

Claude Code documents `agents/` as containing markdown files, so a
`.toml` sibling should be inert there — **verify at implementation** that
Claude's loader ignores it.

The Extended Discovery block (skill-index reads) stays in the shared
wording produced by the vocabulary pass; the config-path resolution comes
from the shared helper (see Vocabulary).

### Distribution

- **In-repo dev:** the generator copies agent TOMLs into
  `.codex/agents/`, which Codex reads natively for this repository.
- **Plugin users:** Codex plugins cannot ship agents, so `solopreneur`
  ships a bootstrap skill that copies the agent TOMLs of every installed
  plugin from the plugin cache into `~/.codex/agents/`. Requiring
  `solopreneur` for this matches decision 2's documented soft dependency.

### Router skills

One `using-<plugin>` skill per plugin, platform-neutral wording:

```markdown
---
name: using-ios-dev
description: Use when any iOS/macOS/SwiftUI/App Store work comes up —
  routes substantial work to the ios-dev agent and orients quick lookups.
---
For implementation, debugging, or multi-step iOS work: dispatch the
`ios-dev` agent (it carries skill-index discovery and platform best
practices). For a quick reference lookup, invoke the matching
`ios-dev:*` skill directly.
```

- Advisory, not mandatory: substantial work delegates, quick lookups run
  inline.
- No embedded skill list — the skill-index mechanism owns enumeration.
- On Codex this skill *creates* proactive delegation (agents alone never
  trigger); on Claude it aligns with existing `description` routing.

## Vocabulary policy

- **Native files (~20):** rewrite Claude-specific phrasing into actions.
  `use the Skill tool with X` → `invoke the X skill`; `use the Agent
  tool with subagent_type Y` → `dispatch the Y agent`; direct
  `AskUserQuestion`/`TodoWrite` mentions → plain-language actions
  ("ask the user to choose", "track progress").
- **Vendored files (~13):** untouched (sync would clobber edits). A
  per-harness mapping reference at
  `plugins/solopreneur/shared/harness-map.md` translates Claude
  vocabulary for Codex (`Skill tool` ⇒ read and follow that SKILL.md;
  `Agent tool` ⇒ spawn the corresponding agent; `CLAUDE_CONFIG_DIR` ⇒
  `$CODEX_HOME`). The bootstrap and `using-*` skills point to it.
- **Config paths:** `shared/config.md` helper resolves the config root
  per harness (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}` on Claude,
  `$CODEX_HOME` on Codex); the skill-index path in agents and
  `rebuild-skill-index` resolves the same way.

## Dependency audit matrix

Maintained as a table in this spec's companion doc once filled (migration
task). Columns:

| plugin | marketplace deps | cross-plugin refs | agents | MCP/apps | external CLIs | env vars | sandbox/network |

Seed rows verified so far: all six non-base plugins declare a
marketplace dependency on `solopreneur` whose only runtime coupling is an
optional read of the skill-index artifact (five agents; `ai-engineer` has
none); `sync-vendored.sh` coupling is repo-dev only and irrelevant to
installs.

## Validation

Three gates, wired into CI and runnable locally:

1. **Drift check** — re-run the generator; fail on diff in
   `.codex-plugin/plugin.json` ×7, `.agents/plugins/marketplace.json`,
   `.codex/agents/`, `docs/skills-catalog.md`.
2. **Structure check** — every directory under `plugins/*/skills/`
   contains a `SKILL.md` (holds after the directory moves).
3. **Install smoke** — add the working tree as a local Codex marketplace
   and `codex plugin add marketer@<marketplace>`; exact commands pinned
   during implementation.

## Versioning and release

- `/release` gains one step: run the generator inside the bump commit so
  both manifests carry the new version atomically.
- Tags remain `<plugin>--v<version>` (double-dash, Claude resolver
  format). Codex users pin the same tags via `@ref`; no new namespace.
- Single `CHANGELOG.md`; platform-specific notes are line items within
  an entry.

## Rollout

| # | PR | Contents |
| --- | --- | --- |
| 1 | Spec | this document |
| 2 | `$N` escape | existing backlog todo (prerequisite for 3) |
| 3 | Directory moves | `vendor/` + `shared/` + coupled script/CI/reference updates |
| 4 | Generator | manifests ×7, marketplace file, validation script, catalog |
| 5 | Agents | 6 TOMLs, `.codex/agents/` copies, bootstrap skill, 7 `using-*` skills |
| 6 | Vocabulary | native rewrites + `harness-map.md` |
| 7 | Release + docs | `/release` generator step, README install docs (`@tag` pinning) |

**Pilot gate (after PR 5):** install `marketer` via local marketplace and
via git `@ref`; confirm `using-marketer` actually causes Codex to spawn
the marketer agent — skill-triggered spawning is the one mechanism the
official docs do not guarantee. If it fails, decisions 4/9 fall back to
router skills carrying inline guidance instead of delegation, and the
spec gets amended before PR 6.

## Assumptions to verify at implementation

- Claude Code's agent loader ignores non-markdown files in `agents/`.
- Codex's validator accepts the generated manifest shape for all seven
  plugins, not just `marketer` (only `marketer` was dry-run tested).
- Skill-triggered agent spawning works on Codex (pilot gate above).
