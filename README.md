# solopreneur

Building alone doesn't mean building without a team. **solopreneur** gives solo
founders the workflows of a full engineering org — plan review, code review
loops, automated PR cycles, marketing, design, and platform-specific experts —
as a family of Claude Code plugins you install à la carte.

## The seven plugins

| Plugin | What you get | Depends on |
|---|---|---|
| [`solopreneur`](./plugins/solopreneur) | 14 skills (review, pipelines, thinking partners, automation) | — |
| [`solo-designer`](./plugins/solo-designer) | `designer` agent + 10 vendored design skills (`taste-*` family + `impeccable`) | `solopreneur` |
| [`solo-marketer`](./plugins/solo-marketer) | `marketer` agent + 7 skills (GTM, naming, writing, X/LinkedIn growth, slide design) | `solopreneur` |
| [`solo-ios-dev`](./plugins/solo-ios-dev) | `ios-dev` agent + `ios-patterns` + 23 vendored skills (`iphone-apps` + `asc-*`) | `solopreneur` |
| [`solo-android-dev`](./plugins/solo-android-dev) | `android-dev` agent + `android-patterns` + 39 vendored skills (Compose + `gplay-*` + official) | `solopreneur` |
| [`solo-ai-engineer`](./plugins/solo-ai-engineer) | `ai-engineer` agent + `langgraph` skill (LangGraph v1.0 deployment-first patterns; loaded only when LangGraph is detected) | `solopreneur` |
| [`solo-neo4j-dev`](./plugins/solo-neo4j-dev) | `neo4j-dev` agent + 4 vendored Neo4j skills (cypher, cypher-guide, migration, cli-tools) | `solopreneur` |

Installing any sub-plugin auto-pulls `solopreneur`. Requires Claude Code
**≥ v2.1.110** for plugin dependency resolution.

> **Migrating from a previous version?** See [MIGRATION.md](./MIGRATION.md) —
> the `solopreneur-*` plugin family was renamed to `solopreneur` /  `solo-*` in
> v0.5.1; the `solopreneur-nextjs` and `solopreneur-python` plugins were
> removed; `solo-marketer` and `solo-neo4j-dev` were added.

## Install

Add this repo as a marketplace source once, then install the pieces you need:

```bash
# Add the marketplace
claude plugin marketplace add hanamizuki/solopreneur

# Everyone: install the core plugin
claude plugin install solopreneur@solopreneur

# Then install whichever roles apply
claude plugin install solo-marketer@solopreneur        # GTM / naming / writing / slides
claude plugin install solo-designer@solopreneur        # auto-pulls solopreneur
claude plugin install solo-ios-dev@solopreneur         # auto-pulls solopreneur
claude plugin install solo-android-dev@solopreneur     # auto-pulls solopreneur
claude plugin install solo-ai-engineer@solopreneur     # auto-pulls solopreneur
claude plugin install solo-neo4j-dev@solopreneur       # auto-pulls solopreneur
```

To update later:

```bash
claude plugin marketplace update solopreneur
claude plugin update solopreneur        # and any other installed plugins
```

### Quick-start by role

| If you build / do… | Install |
|---|---|
| iOS / macOS SwiftUI apps | `solopreneur` + `solo-ios-dev` |
| Android / Kotlin apps | `solopreneur` + `solo-android-dev` |
| LangGraph / AI agents / LLM apps | `solopreneur` + `solo-ai-engineer` |
| Neo4j / graph database work | `solopreneur` + `solo-neo4j-dev` |
| Pure design / UI / UX work | `solopreneur` + `solo-designer` |
| GTM / brand / writing / launch | `solopreneur` + `solo-marketer` |
| Nothing but want the review and automation loops | `solopreneur` alone |

## What's in `solopreneur` (core)

### Your Virtual Product Team

| Skill | What it does |
|-------|--------------|
| `/second-opinion` | **Advisor.** Challenges your plan across 5 dimensions (completeness, consistency, clarity, scope, feasibility) using an independent reviewer |
| `/preflight` | **Tech Lead.** Reviews your technical plan against platform-specific best practices before you write a single line of code |
| `/worktree-handoff` | **Coworker.** Creates an isolated git worktree with a CONTEXT.md so the next session picks up exactly where you left off |
| `/handoff` | **Scribe.** Packages the current session into a self-contained markdown context doc, printed inline so you can copy and paste it into any other agent (Codex, ChatGPT, a fresh Claude session, an agent on another machine). No worktree, no file save |
| `/specialist-review` | **Code Reviewer.** Detects your tech stack, dispatches matching expert agents, and reviews against best-practice skill indices |
| `/post-mortem` | **SRE.** Traces a bug through git history, finds the root cause commit, produces a structured post-mortem report |
| `/session-retro` | **Coach.** Reviews the current conversation for mistakes, traces root causes, proposes durable process improvements |
| `/perspective` | **Thinking Partner.** Switch between thinker perspectives (Musk, Feynman, Munger, Naval, Jobs, Taleb, …) to analyze problems from a different angle |

### Backlog Management

| Skill | What it does |
|-------|--------------|
| `/todos-review` | **Backlog Reviewer.** Deep-reviews a single todo/spec for feasibility, best practices, and priority — dispatches platform-specific expert agents and outputs a readiness rating |
| `/todos-cleanup` | **Backlog Janitor.** Batch-scans backlog, matches against git history, moves completed/partial items to done/ or doing/ |

### Automation Pipelines

Start them and walk away — they loop until the job is done.

| Skill | What it does |
|-------|--------------|
| `/autopilot` | **Auto Build.** Splits a large feature into multiple PRs and orchestrates unattended implementation, review, and merge — supports scheduling for off-hours execution |
| `/greenlight` | **Code Review Loop.** Triggers external reviewers (Codex, Gemini, CodeRabbit), fixes issues, re-triggers — loops until the PR is clean |
| `/todos-babysit` | **Backlog Monitor.** Scans backlog and in-progress todos, cross-references PR status, reviews new items, and maintains worktrees. **Interactive mode**: presents a confirmation checkpoint before acting. **Loop mode** (`/loop 24h /todos-babysit`): auto-executes safe operations and auto-implements bug fixes that pass the readiness gate — notifies only for items that need human judgment |

### Skill-index plumbing

| Skill | What it does |
|-------|--------------|
| `/rebuild-skill-index` | Generates per-platform extended indexes of every relevant skill installed on this machine. Feeds the `ios-dev`, `android-dev`, `designer`, `marketer`, and `neo4j-dev` agents' extended discovery. Run after installing/removing platform skills. |

### How core skills work together

```
Idea
 │
 ├─ /second-opinion ── Challenge the spec
 ├─ /preflight ─────── Verify the technical approach
 │
 ├─ /worktree-handoff ─ Isolate the work
 ├─ /autopilot ──────── Split into PRs, auto-implement
 │   │
 │   ├─ /specialist-review ── Expert code review per PR
 │   └─ /greenlight ────────── External review loop per PR
 │
 ├─ /post-mortem ───── Something broke? Trace the root cause
 ├─ /session-retro ─── What did we learn?
 │
 └─ Backlog
     ├─ /todos-review ──── Review a single todo before implementing
     ├─ /todos-cleanup ─── Batch-triage: match todos against git history
     └─ /todos-babysit ─── Periodic loop: review → notify → implement on approval
```

## What's in `solo-marketer`

| Skill | What it does |
|-------|--------------|
| `/gtm` | **Strategist.** Generates a complete Go-To-Market strategy — analyzes the codebase, interviews you across multiple sessions, and produces 4 strategy docs (brand, market landscape, messaging, channel playbook). Supports weekly incremental updates |
| `/naming` | **Brand Namer.** Generates product or company names through structured brief, multi-model candidate generation, and two-layer evaluation — supports greenfield and rebrand modes. Grounded in Lexicon / Interbrand / Siegel+Gale methodology plus processing fluency, sound symbolism, and iconicity research. Auto-reuses `docs/gtm/` if present |
| `/humanly` | **Editor.** Removes AI writing patterns from text — 36 pattern categories, 3-tier word tables, severity-based audit (P0/P1/P2), with English and Traditional Chinese support |
| `/x-writing` | **Writing Coach.** X/Twitter writing coach — helps with single tweets, threads, and long-form posts. Generates hooks, suggests topics, reviews drafts, and explains craft principles grounded in Aesthetic Writing, RARE hooks, and the algorithmic reality of X |
| `/x-growth` | **X Growth Consultant.** Diagnoses X/Twitter profiles, co-creates personalized 12-week growth plans — covers algorithm mechanics, content strategy, engagement tactics, monetization, and Dream 100 outreach. Integrates with GTM docs |
| `/linkedin-growth` | **LinkedIn Growth Consultant.** Diagnoses LinkedIn profiles, co-creates personalized 90-day growth plans — covers algorithm mechanics, content pillars, engagement engine, audience strategy, and KPI tracking. Integrates with GTM docs |
| `/slide-design` | **Presentation Designer.** Wraps `frontend-slides` or `revealjs` with a brand setup phase — bakes brand colors, typography, and assets in from slide 1. Includes projection-optimized typography scale, Phosphor SVG icon sprite, layered backdrop system, keyboard-driven reveal patterns, 13 reusable layout components, and AI-slop review via `/humanly` (English + Chinese) |

## Stack plugins — the platform experts

Each stack plugin is a focused subagent that `/preflight`, `/specialist-review`,
and `/todos-review` dispatch when they detect that stack in your diff. Each
agent's system prompt embeds a hand-curated skill list plus instructions to
consult an auto-generated extended index of every platform-relevant skill
installed on the machine.

- **`solo-ios-dev`** → `ios-dev` agent. Uses Axiom (200+ skills) plus a
  curated list of iOS-specific skills. Ships with the `ios-patterns` skill
  (SwiftUI conventions: i18n, date parsing, Previews, state management, sheet
  & navigation, list spacing, expandable animation, keyboard Done button).
  Extended index at `<config>/solopreneur/skill-index/ios.md`, rebuild with
  `/rebuild-skill-index`.

- **`solo-android-dev`** → `android-dev` agent. Curated list drawn from
  `android/skills` and `gplay-cli-skills`. Ships with the `android-patterns`
  skill (Jetpack Compose patterns: `@Preview` setup, Scaffold + bottom nav,
  ModalBottomSheet nested scroll, ripple clipping, SwipeToDismissBox
  transparency, locale-aware date formatting including MIUI quirks).

- **`solo-ai-engineer`** → `ai-engineer` agent. LangGraph (StateGraph,
  prebuilt agents, Supervisor/Swarm), LangChain, streaming patterns, tool
  calling, structured output. Ships the `langgraph` skill —
  deployment-first v1.0 patterns (`agent.py` with `app = ...compile()`,
  `langgraph.json` config, prefer `create_react_agent`, Supervisor / Swarm
  multi-agent shapes). Skill has `disable-model-invocation: true` so it
  only loads when this agent invokes it on a project that actually uses
  LangGraph.

- **`solo-neo4j-dev`** → `neo4j-dev` agent. Modern Cypher (QPP, CALL
  subqueries), graph data modelling, schema design, Neo4j drivers, query
  plan tuning. Ships 4 vendored skills: `neo4j-cypher` (4.x/5.x → 2025.x
  upgrade), `neo4j-cypher-guide` (modern read query patterns),
  `neo4j-migration` (driver upgrades across .NET / Go / Java / JS / Python),
  `neo4j-cli-tools` (`neo4j-admin`, `cypher-shell`, `aura-cli`, MCP server
  setup).

- **`solo-designer`** → `designer` agent. UI/UX design work that spans
  web, iOS, and Android. Ships with 10 vendored design skills (the `taste-*`
  archetype family + `impeccable`).

- **`solo-marketer`** → `marketer` agent. Brand, GTM, content, and writing
  work. Ships 7 in-house skills (see "What's in `solo-marketer`" above).

## Auto-Integrations

Solopreneur's agents and skills auto-discover tools from other installed plugins
and skill libraries. Install what matches your work — no config, `/preflight`,
`/specialist-review`, and `/greenlight` will pick them up.

### Any Stack

| Source | Type | Used by | Purpose |
|--------|------|---------|---------|
| [superpowers](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/superpowers) | Plugin | `/greenlight`, `/specialist-review` | `requesting-code-review`, `receiving-code-review` |
| [gstack](https://github.com/gstack-dev/gstack) | User skill | `/greenlight` | `/review` — SQL safety, trust boundaries, structural issues |
| [context7](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/context7) | MCP | `/preflight`, `/specialist-review` | Current official docs for APIs and frameworks |
| [Codex GitHub Bot](https://github.com/apps/chatgpt-codex-connector) | GitHub App | `/greenlight` | External PR reviewer (`@codex review`) |
| [Codex CLI](https://github.com/openai/codex) | CLI | `/greenlight`, `/second-opinion` | External reviewer, local |
| [Gemini Code Assist](https://github.com/apps/gemini-code-assist) | GitHub App | `/greenlight` | External PR reviewer (`/gemini review`) |
| [CodeRabbit](https://coderabbit.ai) | GitHub App | `/greenlight` | External PR reviewer (auto-triggered) |

### Android / Kotlin

| Source | Type | Used by | Purpose |
|--------|------|---------|---------|
| [android/skills](https://github.com/android/skills) | Skills | `android-dev` agent | AI-optimized modular instructions covering Jetpack Compose, navigation, Play Billing, performance, and more — grounded in official developer.android.com best practices |
| [gplay-cli-skills](https://github.com/tamtom/gplay-cli-skills) | Skills | `android-dev` agent | Google Play Console CLI workflows — build, signing, release flows, metadata, IAP, testing tracks, rollout, reviews, vitals |

### iOS / macOS

| Source | Type | Used by | Purpose |
|--------|------|---------|---------|
| [Axiom](https://github.com/CharlesWiltgen/Axiom) | Plugin | `ios-dev` agent | 200+ skills covering SwiftUI, SwiftData, concurrency, testing, App Store, camera, AI, graphics |
| [app-store-connect-cli-skills](https://github.com/rudrankriyam/app-store-connect-cli-skills) | Skills | `ios-dev` agent | App Store Connect CLI — TestFlight, releases, metadata |
| [iphone-apps](https://github.com/glittercowboy/taches-cc-resources/tree/main/skills/expertise/iphone-apps) | Skill | `ios-dev` agent | Full iPhone app workflow (build, debug, test, ship — CLI-only) |

User-level skills in `<config>/skills/` are auto-classified into the iOS
extended index by `/rebuild-skill-index`.

### Design / UI

| Source | Type | Status | Used by | Purpose |
|--------|------|--------|---------|---------|
| [impeccable](https://github.com/pbakaus/impeccable) | Skill | **Vendored** in `solo-designer` | `designer` agent | Polish / critique / redesign frontend interfaces |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) | Skills | **Vendored** in `solo-designer` (9 skills) | `designer` agent | `taste-*` archetype family (soft / brutalist / minimalist / redesign / stitch / output / gpt / image-to-code) — overrides default LLM design biases |
| [frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design) | Plugin | Recommended install | `designer` agent | Creative, polished frontend code generation that avoids generic AI aesthetics |
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Plugin | Recommended install | `designer` agent | UI/UX intelligence library — styles, palettes, font pairings, product types, UX guidelines, chart types across 10 stacks |

User-level skills and the above plugins are auto-classified into the design
extended index by `/rebuild-skill-index`.

### Marketer / Presentations

| Source | Type | Used by | Purpose |
|--------|------|---------|---------|
| [frontend-slides](https://github.com/zarazhangrui/frontend-slides) | Plugin | `marketer` agent, `/slide-design` | Single-HTML, animation-rich slide engine (recommended) |
| [revealjs-skill](https://github.com/ryanbbrown/revealjs-skill) | Plugin | `marketer` agent, `/slide-design` | Reveal.js scaffolding — fragments, vertical stacks, speaker notes, Chart.js (wraps [reveal.js](https://github.com/hakimel/reveal.js)) |

User-level skills and the above plugins are auto-classified into the marketer
extended index by `/rebuild-skill-index`.

### Neo4j

| Source | Type | Status | Used by | Purpose |
|--------|------|--------|---------|---------|
| [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills) | Skills | **Vendored** in `solo-neo4j-dev` (3 skills) | `neo4j-dev` agent | `neo4j-cypher` (4.x/5.x → 2025.x), `neo4j-migration` (driver upgrade), `neo4j-cli-tools` |
| [tomasonjo/blogs](https://github.com/tomasonjo/blogs/tree/master/claude-skills/neo4j-cypher-guide) | Skill | **Vendored** in `solo-neo4j-dev` (1 skill) | `neo4j-dev` agent | `neo4j-cypher-guide` — modern Cypher read patterns (QPP, CALL subqueries, sorting) |

## CLI Tools

| Tool | Required? | Used by |
|------|-----------|---------|
| `git` | Required | All skills |
| `gh` (GitHub CLI) | Required | `/greenlight`, `/autopilot`, `/post-mortem` |
| `jq` | Required | `/greenlight`, `scripts/sync-vendored.sh` |
| `codex` (Codex CLI) | Optional | `/greenlight`, `/second-opinion` |

## License

MIT
