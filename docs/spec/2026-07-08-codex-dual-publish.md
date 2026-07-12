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
build step at install time). One generator script owns the three
Codex-install surfaces (plugin manifests, marketplace file, agent
copies); CI re-runs it and fails on any diff, mirroring the existing
`validate-vendored` drift-check pattern. `docs/skills-catalog.md` keeps
its own script and staleness check (decision 8) and stays out of the
Codex gate — it is documentation, not an installability surface.

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
- Descriptions copy verbatim; the "install `solopreneur` first" guidance
  (decision 2) lives in the README install section and each `using-*`
  skill body, not in manifest metadata.

## Codex marketplace shape

Generated `.agents/plugins/marketplace.json` lists all seven plugins with
`./plugins/<name>` sources, mirroring `.claude-plugin/marketplace.json`
entries (name, description, license, source). Each entry additionally
carries the fields the Codex marketplace contract asks for ("Always
include `policy.installation`, `policy.authentication`, and `category`"):
a uniform `policy` of `AVAILABLE` / `ON_INSTALL`, and `category` reused
from the plugin's overlay `interface.category` (single source, no
duplication). The CLI installs entries without these fields; directory-
style consumers may enforce the documented contract. Local development
installs from the working tree via this file; end users add the GitHub
repo, optionally pinned `@<plugin>--v<version>`.

Pinning caveat: a marketplace ref freezes the **whole repo snapshot** at
that commit, so pinning one plugin's tag also freezes the other six at
whatever version `main` carried then. README documents this: pin the tag
of the plugin you are installing; mixed-version pinning requires separate
marketplace adds.

## Directory moves

`skills/_vendored` (five plugins) and `skills/_shared` (solopreneur) are
metadata/helper directories that Codex's validator rejects as skills.

- `plugins/<n>/skills/_vendored/` → `plugins/<n>/vendor/`
- `plugins/solopreneur/skills/_shared/` → `plugins/solopreneur/shared/`

One PR updates, atomically: `plugins/solopreneur/scripts/sync-vendored.sh`,
`.github/workflows/sync-vendored.yml`,
`.github/workflows/validate-vendored.yml`, five `agents/*.md` references,
and seven `_shared/config.md` references. The same PR re-runs
`sync-vendored.sh --pinned` so `_VENDOR.md` sidecars (which embed
`../_vendored/` paths) regenerate immediately — CI's drift check excludes
`_VENDOR.md`, so deferring to "the next sync" would leave stale paths in
the repo indefinitely. This PR lands **after** the `$N`-escape todo —
both touch `sync-vendored.sh`.

## Agents and delegation

### TOML conversion

Each `plugins/<n>/agents/<n>.md` gains a sibling `<n>.toml`:

| Markdown agent | Codex TOML |
| --- | --- |
| `name` frontmatter | `name` |
| `description` frontmatter | `description` |
| body (system prompt) | `developer_instructions` |
| `tools` allowlist | *(not portable — omit; Codex uses `sandbox_mode`)* |
| `model` | *(not portable — all six agents pin `opus`, which is not a Codex model slug; omit so agents inherit the parent session, with per-agent overrides in the overlay if ever needed)* |

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
  ships a bootstrap skill that installs agent TOMLs into
  `~/.codex/agents/`. Requiring `solopreneur` for this matches
  decision 2's documented soft dependency. Mechanics to pin in PR 5a:
  discover installed plugins via `codex plugin list` (fall back to
  enumerating the plugin cache directory — the exact path is
  undocumented and must be confirmed on a real install); copy each
  plugin's `agents/*.toml`; only overwrite files carrying the
  generator's marker comment, never hand-edited ones; report what was
  installed, skipped, or orphaned (plugin uninstalled but TOML still
  present).

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
- **Config paths:** extend the `shared/config.md` helper to resolve the
  config root per harness (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}` on
  Claude, `$CODEX_HOME` on Codex). Today this resolution exists nowhere
  else — `rebuild-skill-index` and every agent's Extended Discovery
  block hardcode the Claude path — so the vocabulary PR updates those
  callsites to go through the helper's resolution.
- **Inventory:** the native/vendored split (~20/~13 files) comes from
  `grep -rlE 'Skill tool|Agent tool|subagent_type|CLAUDE_CONFIG_DIR|AskUserQuestion|TodoWrite' plugins --include='*.md'`;
  re-run it at implementation time rather than trusting the counts.

## Dependency audit matrix

Every claim below is grep-verified against the tree (audited 2026-07-12).

| plugin | marketplace deps | cross-plugin refs | agents | MCP/apps | external CLIs | env vars | sandbox/network |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `solopreneur` | none | none (base the others reference) | none | context7 (optional) | `gh`, `git`, `codex`, `gemini` (review loops); `vercel`, `jq` (preview); `python3` (worktree-handoff, merge-pr); `jq`, `perl` (sync-vendored, maintainer-only); `curl` | `CLAUDE_CONFIG_DIR`, `CLAUDE_SKILL_DIR`; `DISCORD_*` (todos-babysit); Vercel org/project ids (preview) | high: GitHub API, Vercel deploys, Discord API, reviewer CLIs |
| `designer` | `solopreneur >=0.5.1` | skill-index read (agent); sync-vendored symlink | `designer` | Pencil, Stitch, context7 (all optional) | `node`/`npm` (impeccable; puppeteer only for URL scans); `codex`/`claude`/`gemini` (optional live-edit) | `CLAUDE_CONFIG_DIR`, `CLAUDE_SKILL_DIR`, `CLAUDE_PROJECT_DIR`, `IMPECCABLE_CONTEXT_DIR`, `PORT` | mostly local; network only for optional MCPs and URL scans |
| `marketer` | `solopreneur >=0.5.1` | skill-index read (agent); no sync-vendored symlink (all skills in-house) | `marketer` | chrome-devtools (one option in linkedin-growth) | `codex`/`gemini` (naming, optional); `python3` (humanly regen, maintainer-only); `qrencode` (optional); `curl` (CDN icons) | `CLAUDE_CONFIG_DIR`, `CODEX_GIT_FLAG` | low: local content generation; optional reviewer CLIs and CDN fetches |
| `ios-dev` | `solopreneur >=0.5.1` | skill-index read (agent); sync-vendored symlink | `ios-dev` | context7 (optional); RevenueCat MCP (required by asc-revenuecat-catalog-sync); browser automation (required by asc-app-create-ui); astro (optional) | `asc` (all asc-* skills); `xcodebuild`/`xcrun`/`swift`; `python3`/`pip` (asc-shots-pipeline, asc-screenshot-resize, asc-notarization); brew extras (xcodegen, swiftlint, fastlane, imagemagick, …); `curl` | `CLAUDE_CONFIG_DIR`, `CLAUDE_SKILL_DIR`; ASC credential placeholders (`ISSUER_ID`, `KEY_ID`, signing secrets) | high at release: App Store Connect API, TestFlight uploads, notarization; builds stay local |
| `android-dev` | `solopreneur >=0.5.1` | skill-index read (agent); sync-vendored symlink | `android-dev` | context7 (optional) | `gplay` (all gplay-* skills); `gradle`/`gradlew`; `adb`; `jq` | `CLAUDE_CONFIG_DIR`, `CLAUDE_SKILL_DIR`; Play credential placeholders (`EDIT_ID`, `PACKAGE`, `BUCKET_ID`, …) | high at release: Play Console API, GCS report downloads; builds and devices stay local |
| `ai-engineer` | `solopreneur >=0.5.1` | no skill-index read (the one agent without Extended Discovery); sync-vendored symlink | `ai-engineer` | context7 (optional) | `python3`/`pytest` (skill scripts) | `CLAUDE_SKILL_DIR` | low: local Python; LLM API keys belong to the built app, not the plugin |
| `neo4j-dev` | `solopreneur >=0.5.1` | skill-index read (agent); sync-vendored symlink | `neo4j-dev` | context7, Neo4j MCP (both optional) | `cypher-shell`, `aura-cli`, `neo4j-admin`, `npx`, `python3` (cli-tools helpers, cypher schema guardrail), `curl` | `CLAUDE_CONFIG_DIR`, `CLAUDE_SKILL_DIR`; `NEO4J_PASSWORD`, Aura `CLIENT_ID`/`CLIENT_SECRET`/`INSTANCE_ID` | network to the database: bolt, Query API v2 over HTTPS, Aura API |

Reading notes:

- The two five-of-six couplings have different members: the skill-index
  read covers every agent except `ai-engineer`'s, while the
  `sync-vendored.sh` symlink covers every plugin except `marketer`. The
  symlink is repo-maintainer machinery, irrelevant to installs on either
  platform.
- Credential-looking env vars (`ISSUER_ID`, `EDIT_ID`, `NEO4J_PASSWORD`,
  …) are placeholders inside documented CLI commands, not values any
  skill reads at load time — they record what the external CLI needs.
- context7 is optional everywhere it appears (explicit graceful
  degradation). The only hard MCP requirements are per-skill:
  `asc-revenuecat-catalog-sync` (RevenueCat MCP) and `asc-app-create-ui`
  (browser automation).

## Validation

Three gates, wired into CI and runnable locally:

1. **Drift check** — re-run the generator; fail on diff in
   `.codex-plugin/plugin.json` ×7, `.agents/plugins/marketplace.json`,
   `.codex/agents/`.
2. **Structure check** — every directory under `plugins/*/skills/`
   contains a `SKILL.md` (holds after the directory moves).
3. **Install smoke** — run with an isolated, throwaway `CODEX_HOME` so
   CI and local runs never pollute a real config or cache: add the
   working tree as a local Codex marketplace, then
   `codex plugin add marketer@<marketplace>`; exact commands pinned
   during implementation. PR 4's hard gate: all seven generated
   manifests pass the Codex validator, not just `marketer`.

## Versioning and release

- `/release` gains one step: run the generator inside the bump commit so
  both manifests carry the new version atomically. The skill's staging
  list currently adds only `plugins/*/.claude-plugin/plugin.json` and
  `CHANGELOG.md`; it must also stage the generated surfaces
  (`plugins/*/.codex-plugin/plugin.json`,
  `.agents/plugins/marketplace.json`, `.codex/agents/`).
- Tags remain `<plugin>--v<version>` (double-dash, Claude resolver
  format). Codex users pin the same tags via `@ref`; no new namespace.
- Single `CHANGELOG.md`; platform-specific notes are line items within
  an entry.

## Rollout

| # | PR | Contents |
| --- | --- | --- |
| 1 | Spec | this document |
| 2 | `$N` escape | existing backlog todo (prerequisite for 3) |
| 3 | Directory moves | `vendor/` + `shared/` + coupled script/CI/reference updates + same-PR sync re-run |
| 4 | Generator | manifests ×7 (hard gate: all seven pass the validator), marketplace file, validation script, dependency matrix fill |
| 5a | Marketer vertical slice | marketer agent TOML + `.codex/agents/` copy, bootstrap skill, `using-marketer`; **pilot gate runs here** |
| 5b | Remaining agents | 5 remaining TOMLs + 6 remaining `using-*` skills (`using-solopreneur` orients workflow skills — no agent to dispatch) |
| 6 | Vocabulary | native rewrites + `harness-map.md` + helper path resolution |
| 7 | Release + docs | `/release` generator step + staging list, README install docs (`@tag` pinning caveat) |

The skills catalog (decision 8) is platform-independent and can land any
time outside this sequence.

**Pilot gate (inside PR 5a, before 5b starts):** install `marketer` via
local marketplace and via git `@ref`; confirm `using-marketer` actually
causes Codex to spawn the marketer agent — skill-triggered spawning is
the one mechanism the official docs do not guarantee. Before adding the
TOML, verify with a throwaway fixture that Claude Code's loader ignores
non-markdown files in `agents/`. If spawning fails, decisions 4/9 fall
back to router skills carrying inline guidance instead of delegation,
and the spec gets amended before 5b.

## Assumptions to verify at implementation

- Claude Code's agent loader ignores non-markdown files in `agents/`
  (fixture-tested at the start of PR 5a).
- Codex's validator accepts the generated manifest shape for all seven
  plugins, not just `marketer` (hard gate in PR 4).
- Skill-triggered agent spawning works on Codex (pilot gate in PR 5a).
- The Codex plugin cache location and a scriptable way to enumerate
  installed plugins exist (`codex plugin list` is the candidate;
  confirmed against a real install in PR 5a before the bootstrap skill
  is finalized).
