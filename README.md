# solopreneur

**solopreneur** is a family of Claude Code plugins that gives solo founders
the workflows of a full engineering org: plan review, code review loops,
automated PR cycles, marketing, design, and platform-specific experts. Install
à la carte.

## What's in the box

| Plugin | What you get |
|---|---|
| [`solopreneur`](./plugins/solopreneur) | 16 in-house skills (review, pipelines, thinking partners, automation) |
| [`marketer`](./plugins/marketer) | `marketer` agent + 7 in-house skills (GTM, naming, writing, X/LinkedIn growth, slide design) |
| [`designer`](./plugins/designer) | `designer` agent + 10 vendored design skills (`taste-*` family + `impeccable`) |
| [`ios-dev`](./plugins/ios-dev) | `ios-dev` agent + `ios-patterns` + `ios-app-templates` (reference apps) + 23 vendored skills (`asc-*` + `iphone-apps`) |
| [`android-dev`](./plugins/android-dev) | `android-dev` agent + `android-patterns` + 39 vendored skills (Compose + `gplay-*` + Android official) |
| [`ai-engineer`](./plugins/ai-engineer) | `ai-engineer` agent + `langgraph` + `ai-app-templates` + 1 vendored skill (`senior-prompt-engineer`) |
| [`neo4j-dev`](./plugins/neo4j-dev) | `neo4j-dev` agent + 4 vendored Neo4j skills |

Installing any sub-plugin auto-pulls `solopreneur`. Requires Claude Code
**≥ v2.1.110** for plugin dependency resolution.

> Migrating from a previous version? See [MIGRATION.md](./MIGRATION.md).

## Install

Add this repo as a marketplace source once, then install the pieces you need:

```bash
# Add the marketplace
claude plugin marketplace add hanamizuki/solopreneur

# Everyone: install the core plugin
claude plugin install solopreneur@solopreneur

# Then install whichever roles apply
claude plugin install marketer@solopreneur
claude plugin install designer@solopreneur
claude plugin install ios-dev@solopreneur
claude plugin install android-dev@solopreneur
claude plugin install ai-engineer@solopreneur
claude plugin install neo4j-dev@solopreneur
```

To update later:

```bash
claude plugin marketplace update solopreneur
claude plugin update solopreneur        # and any other installed plugins
```

### Quick-start by role

| If you build / do… | Install |
|---|---|
| Run a one-person engineering org on auto-pilot | `solopreneur` alone |
| GTM / brand / writing / slides | `solopreneur` + `marketer` |
| Pure design / UI / UX work | `solopreneur` + `designer` |
| iOS / macOS SwiftUI apps | `solopreneur` + `ios-dev` |
| Android / Kotlin apps | `solopreneur` + `android-dev` |
| LangGraph / AI agents / LLM apps | `solopreneur` + `ai-engineer` |
| Neo4j / graph database work | `solopreneur` + `neo4j-dev` |

## Plugins

Each plugin section below describes the bundled skills (in-house and vendored)
plus its **Requirements**: external CLIs, plugins, MCPs, or GitHub apps the
plugin's skills and agent integrate with. Hard requirements are called out
explicitly; everything else is recommended and degrades gracefully if absent.

### `solopreneur` (core)

The foundation. Every other plugin depends on this one. No agent, just 16
skills that wrap the lifecycle around your work.

#### Your Virtual Product Team

| Skill | What it does |
|---|---|
| `/mvp` | **PM.** Drives the full new-product flow end-to-end: brainstorming → template lookup (auto-discovers `*-app-templates` in installed plugins) → plan → execution. Use when starting from scratch |
| `/second-opinion` | **Advisor.** Challenges your plan across 5 dimensions (completeness, consistency, clarity, scope, feasibility) using an independent reviewer |
| `/tech-vetting` | **Tech Lead.** Vets your technical plan against the latest official docs and platform-specific best practices before you write a single line of code |
| `/worktree-handoff` | **Coworker.** Creates an isolated git worktree with a CONTEXT.md so the next session picks up exactly where you left off |
| `/handoff` | **Scribe.** Packages the current session into a self-contained markdown context doc, printed inline so you can copy and paste it into any other agent (Codex, ChatGPT, a fresh Claude session, an agent on another machine). No worktree, no file save |
| `/preview` | **Presenter.** Turns any proposal / plan / idea into an interactive HTML page, deploys it to Vercel for a shareable URL, with an in-page comment overlay so reviewers can highlight text and leave in-context feedback you can act on directly |
| `/specialist-review` | **Code Reviewer.** Detects your tech stack, dispatches matching expert agents, and reviews against best-practice skill indices |
| `/post-mortem` | **SRE.** Traces a bug through git history, finds the root cause commit, produces a structured post-mortem report |
| `/session-retro` | **Coach.** Reviews the current conversation for mistakes, traces root causes, proposes durable process improvements |
| `/perspective` | **Thinking Partner.** Switch between thinker perspectives (Musk, Feynman, Munger, Naval, Jobs, Taleb, …) to analyze problems from a different angle |

#### Backlog Management

| Skill | What it does |
|---|---|
| `/todos-review` | **Backlog Reviewer.** Deep-reviews a single todo/spec for feasibility, best practices, and priority. Dispatches platform-specific expert agents and outputs a readiness rating |
| `/todos-cleanup` | **Backlog Janitor.** Batch-scans backlog, matches against git history, moves completed/partial items to done/ or doing/ |

#### Automation Pipelines

Start them and walk away. They loop until the job is done.

| Skill | What it does |
|---|---|
| `/autopilot` | **Auto Build.** Splits a large feature into multiple PRs and orchestrates unattended implementation, review, and merge. Supports scheduling for off-hours execution |
| `/greenlight` | **Code Review Loop.** Triggers external reviewers (Codex, Gemini, CodeRabbit), fixes issues, re-triggers. Loops until the PR is clean |
| `/todos-babysit` | **Backlog Monitor.** Scans backlog and in-progress todos, cross-references PR status, reviews new items, and maintains worktrees. **Interactive mode**: presents a confirmation checkpoint before acting. **Loop mode** (`/loop 24h /todos-babysit`): auto-executes safe operations and auto-implements bug fixes that pass the readiness gate. Notifies only for items that need human judgment |

#### Skill-index plumbing

| Skill | What it does |
|---|---|
| `/rebuild-skill-index` | Generates per-platform extended indexes of every relevant skill installed on this machine. Feeds the `ios-dev`, `android-dev`, `designer`, `marketer`, and `neo4j-dev` agents' extended discovery. Run after installing/removing platform skills. |

#### How core skills work together

```
Idea
 │
 ├─ /mvp ────────────── Brand-new product? Start here. Brainstorm → template → plan → execute
 │
 ├─ /second-opinion ── Challenge the spec
 ├─ /tech-vetting ──── Verify the technical approach
 │
 ├─ /worktree-handoff ─ Isolate the work
 ├─ /autopilot ──────── Split into PRs, auto-implement
 │   │
 │   ├─ /specialist-review ── Expert code review per PR
 │   └─ /greenlight ────────── External review loop per PR
 │
 ├─ /preview ───────── Make it human-reviewable, collect in-context feedback
 │
 ├─ /post-mortem ───── Trace the root cause when something breaks
 ├─ /session-retro ─── Capture lessons from this session
 │
 └─ Backlog
     ├─ /todos-review ──── Review a single todo before implementing
     ├─ /todos-cleanup ─── Batch-triage: match todos against git history
     └─ /todos-babysit ─── Periodic loop: review → notify → implement on approval
```

#### Requirements

- **`git`**, **`gh`** (GitHub CLI), **`jq`**: required CLIs. Used across `/greenlight`, `/autopilot`, `/post-mortem`, `/todos-babysit`, and `scripts/sync-vendored.sh`.
- **[Codex CLI](https://github.com/openai/codex)**: **required** for `/greenlight` uncommitted mode (the only path on `main` with uncommitted changes). Also used by `/second-opinion` (primary review path), `/greenlight` PR mode (one reviewer option), and `/naming` (multi-model candidate generation).
- **[superpowers](https://github.com/obra/superpowers)** plugin: strongly recommended. `/greenlight` and `/specialist-review` use `superpowers:requesting-code-review` and `receiving-code-review` for the review framework. Graceful fallback if absent.
- **[context7](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/context7)** MCP: strongly recommended. Used by `/tech-vetting`, `/specialist-review`, and every stack agent (ios-dev, android-dev, ai-engineer, neo4j-dev, designer) for current official docs. Graceful skip if absent.
- **[`gstack /review`](https://github.com/garrytan/gstack/tree/main/review)**: recommended. Powers the `/greenlight` internal review phase (SQL safety, trust boundaries, structural issues).
- **[Codex GitHub bot](https://github.com/apps/chatgpt-codex-connector)**: recommended. `/greenlight` PR mode default reviewer (`@codex review`).
- **[Gemini Code Assist](https://github.com/apps/gemini-code-assist)**: optional. `/greenlight` PR mode alternative reviewer (`/gemini review`).
- **[CodeRabbit](https://coderabbit.ai)**: optional. `/greenlight` passive reviewer (auto-triggered on push).
- **[Vercel CLI](https://vercel.com/docs/cli)**: optional. `/preview` deploys previews to a shareable URL when present, and gracefully degrades to a local `open` of the HTML when absent.

---

### `marketer`

Brand, GTM, content, and writing work. Ships the `marketer` agent plus 7
in-house skills.

| Skill | What it does |
|---|---|
| `/gtm` | **Strategist.** Generates a complete Go-To-Market strategy. Analyzes the codebase, interviews you across multiple sessions, and produces 4 strategy docs (brand, market landscape, messaging, channel playbook). Supports weekly incremental updates |
| `/naming` | **Brand Namer.** Generates product or company names through structured brief, multi-model candidate generation (Claude + optional Codex / Gemini), and two-layer evaluation. Supports greenfield and rebrand modes. Grounded in Lexicon / Interbrand / Siegel+Gale methodology plus processing fluency, sound symbolism, and iconicity research. Auto-reuses `docs/gtm/` if present |
| `/humanly` | **Editor.** Removes AI writing patterns from text: 36 pattern categories, 3-tier word tables, severity-based audit (P0/P1/P2), with English and Traditional Chinese support |
| `/x-writing` | **Writing Coach.** X/Twitter writing coach for single tweets, threads, and long-form posts. Generates hooks, suggests topics, reviews drafts, and explains craft principles grounded in Aesthetic Writing, RARE hooks, and the algorithmic reality of X |
| `/x-growth` | **X Growth Consultant.** Diagnoses X/Twitter profiles, co-creates personalized 12-week growth plans. Covers algorithm mechanics, content strategy, engagement tactics, monetization, and Dream 100 outreach. Integrates with GTM docs |
| `/linkedin-growth` | **LinkedIn Growth Consultant.** Diagnoses LinkedIn profiles, co-creates personalized 90-day growth plans. Covers algorithm mechanics, content pillars, engagement engine, audience strategy, and KPI tracking. Integrates with GTM docs |
| `/slide-design` | **Presentation Designer.** Wraps `frontend-slides` or `revealjs` with a brand setup phase. Bakes brand colors, typography, and assets in from slide 1. Includes projection-optimized typography scale, Phosphor SVG icon sprite, layered backdrop system, keyboard-driven reveal patterns, 13 reusable layout components, and AI-slop review via `/humanly` (English + Chinese) |

#### Requirements

- **[frontend-slides](https://github.com/zarazhangrui/frontend-slides)** plugin: single-HTML, animation-rich slide engine. Used by `/slide-design` (recommended).
- **[revealjs-skill](https://github.com/ryanbbrown/revealjs-skill)** plugin: reveal.js scaffolding (fragments, vertical stacks, speaker notes, Chart.js). Alternative engine for `/slide-design`. Wraps the underlying [reveal.js](https://github.com/hakimel/reveal.js) library.
- **Gemini CLI**: optional. Used by `/naming` for parallel multi-model candidate generation. Without it, `/naming` runs Claude + (optional) Codex CLI only.

---

### `designer`

The `designer` agent for UI/UX work that spans web, iOS, and Android. Ships
10 vendored design skills.

#### Bundled skills

- **`impeccable`**: vendored from [pbakaus/impeccable](https://github.com/pbakaus/impeccable). Polish / critique / redesign frontend interfaces.
- **`taste-skill` + 8 archetype skills** (`taste-soft`, `taste-brutalist`, `taste-minimalist`, `taste-redesign`, `taste-stitch`, `taste-output`, `taste-gpt`, `taste-image-to-code`): vendored from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill). The `taste-*` archetype family overrides default LLM design biases.

#### Requirements

- **[frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design)** plugin: creative, polished frontend code generation that avoids generic AI aesthetics. Auto-classified into the design extended index by `/rebuild-skill-index`.
- **[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)** plugin: UI/UX intelligence library: 50+ styles, 161 color palettes, font pairings, product types, UX guidelines, chart types across 10 stacks. Auto-classified.
- **[Pencil MCP](https://www.pencil.dev/downloads)**: optional. If `mcp__pencil__*` tools are available, the `designer` agent prefers them for `.pen` design file access (layout, variables, guidelines, export).

---

### `ios-dev`

The `ios-dev` agent (SwiftUI / SwiftData / concurrency / testing / App Store)
plus the in-house `ios-patterns` skill and 23 vendored skills covering App
Store Connect CLI workflows and full iPhone app build/debug/ship.

#### Bundled skills

- **`ios-patterns`** (in-house): SwiftUI conventions: i18n, date parsing, Previews, state management, sheet & navigation, list spacing, expandable animation, keyboard Done button.
- **`ios-app-templates`** (in-house): reference implementations for common app categories (currently `photo-analysis-app`).
- **`asc-cli` skills** (22): vendored from [rudrankriyam/app-store-connect-cli-skills](https://github.com/rudrankriyam/app-store-connect-cli-skills). End-to-end App Store Connect workflows: TestFlight, releases, metadata, IAP, signing, screenshots, crash triage, ASO audit, RevenueCat catalog sync, notarization, submission health, …
- **`iphone-apps`**: vendored from [glittercowboy/taches-cc-resources](https://github.com/glittercowboy/taches-cc-resources/tree/main/skills/expertise/iphone-apps). CLI-only iPhone app workflow (build, debug, test, ship).

#### Requirements

- **`asc` CLI**: **required** by every `asc-*` skill. Without it, those 22 skills won't run. Install from [rorkai/App-Store-Connect-CLI](https://github.com/rorkai/App-Store-Connect-CLI).
- **[Axiom](https://github.com/CharlesWiltgen/Axiom)** plugin: 200+ skills covering SwiftUI, SwiftData, concurrency, testing, App Store, camera, AI, graphics. After install, run `/rebuild-skill-index` once and the iOS-relevant skills appear in the `ios-dev` agent's extended index. Install: `claude plugin marketplace add CharlesWiltgen/Axiom` then `claude plugin install axiom@axiom-marketplace`.

---

### `android-dev`

The `android-dev` agent (Jetpack Compose / Kotlin / Play Console / build /
performance) plus the in-house `android-patterns` skill and 39 vendored skills
from 5 different upstream repos.

#### Bundled skills

- **`android-patterns`** (in-house): Jetpack Compose patterns: `@Preview` setup (LocalInspectionMode, Vico charts), Scaffold + bottom nav + status bar insets, ModalBottomSheet nested-scroll jitter, ripple clipping on rounded corners, SwipeToDismissBox transparency, locale-aware date formatting (MIUI quirks).
- **`gplay` skills** (18): vendored from [tamtom/gplay-cli-skills](https://github.com/tamtom/gplay-cli-skills). Google Play Console CLI workflows: build, signing, release flows, metadata, IAP, testing tracks, rollout, reviews, vitals.
- **13 Compose / architecture skills** (`compose-ui`, `compose-navigation`, `compose-performance-audit`, `architecture`, `viewmodel`, `data-layer`, `coroutines`, `kotlin-concurrency-expert`, `gradle-build-performance`, `gradle-logic`, `accessibility`, `testing`, `xml-to-compose-migration`): vendored from [new-silvermoon/awesome-android-agent-skills](https://github.com/new-silvermoon/awesome-android-agent-skills).
- **`jetpack-compose`**: vendored from [TheBushidoCollective/han](https://github.com/TheBushidoCollective/han/tree/main/plugins/specialized/android/skills/jetpack-compose).
- **`mobile-android-design`**: vendored from [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/ui-design/skills/mobile-android-design).
- **6 official Android skills** (`agp-9-upgrade`, `migrate-xml-views-to-jetpack-compose`, `navigation-3`, `r8-analyzer`, `play-billing-library-version-upgrade`, `edge-to-edge`): vendored from [android/skills](https://github.com/android/skills) (Apache-2.0).

#### Requirements

- **`gplay` CLI**: **required** by every `gplay-*` skill. Without it, those 18 skills won't run. Install from [tamtom/play-console-cli](https://github.com/tamtom/play-console-cli).

---

### `ai-engineer`

The `ai-engineer` agent for LangGraph / LangChain / streaming / tool calling /
structured output, plus 2 in-house skills and 1 vendored skill.

#### Bundled skills

- **`langgraph`** (in-house): deployment-first v1.0 patterns (`agent.py` with `app = ...compile()`, `langgraph.json` config, prefer `create_react_agent`).
- **`ai-app-templates`** (in-house): reference implementations for common AI backend shapes (currently `simple-llm-api`: minimal FastAPI service with one `POST /chat` endpoint, provider chosen at scaffold time — Anthropic / Gemini / OpenRouter).
- **`senior-prompt-engineer`**: vendored from [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/senior-prompt-engineer). Advanced prompt patterns + LLM eval frameworks + agent orchestration.

(No external requirements.)

---

### `neo4j-dev`

The `neo4j-dev` agent for modern Cypher (QPP, CALL subqueries), graph data
modelling, schema design, drivers, and query plan tuning. Ships 4 vendored
skills.

#### Bundled skills

- **`neo4j-cypher`**: vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). 4.x/5.x → 2025.x upgrade. Covers removed/deprecated syntax and modern replacements.
- **`neo4j-cypher-guide`**: vendored from [tomasonjo/blogs](https://github.com/tomasonjo/blogs/tree/master/claude-skills/neo4j-cypher-guide). Modern Cypher read patterns (QPP, CALL subqueries, sorting).
- **`neo4j-migration`**: vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). Driver upgrade across .NET / Go / Java / JS / Python.
- **`neo4j-cli-tools`**: vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). `neo4j-admin`, `cypher-shell`, `aura-cli`, MCP server setup.

#### Requirements

- **`neo4j-admin`**, **`cypher-shell`**, **`aura-cli`**: Neo4j first-party CLIs. Install per the `neo4j-cli-tools` skill's guidance, depending on which workflow (admin / query / cloud) applies.

## License

MIT
