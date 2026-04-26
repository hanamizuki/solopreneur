# solopreneur

Building alone doesn't mean building without a team. **solopreneur** gives solo
founders the workflows of a full engineering org — plan review, code review
loops, automated PR cycles, marketing, design, and platform-specific experts —
as a family of Claude Code plugins you install à la carte.

## What's in the box

| Plugin | What you get |
|---|---|
| [`solopreneur`](./plugins/solopreneur) | 14 in-house skills (review, pipelines, thinking partners, automation) |
| [`solo-marketer`](./plugins/solo-marketer) | `marketer` agent + 7 in-house skills (GTM, naming, writing, X/LinkedIn growth, slide design) |
| [`solo-designer`](./plugins/solo-designer) | `designer` agent + 10 vendored design skills (`taste-*` family + `impeccable`) |
| [`solo-ios-dev`](./plugins/solo-ios-dev) | `ios-dev` agent + `ios-patterns` + 23 vendored skills (`asc-*` + `iphone-apps`) |
| [`solo-android-dev`](./plugins/solo-android-dev) | `android-dev` agent + `android-patterns` + 39 vendored skills (Compose + `gplay-*` + Android official) |
| [`solo-ai-engineer`](./plugins/solo-ai-engineer) | `ai-engineer` agent + `langgraph` + 3 vendored skills (LLM / prompt engineering) |
| [`solo-neo4j-dev`](./plugins/solo-neo4j-dev) | `neo4j-dev` agent + 4 vendored Neo4j skills |

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
claude plugin install solo-marketer@solopreneur
claude plugin install solo-designer@solopreneur
claude plugin install solo-ios-dev@solopreneur
claude plugin install solo-android-dev@solopreneur
claude plugin install solo-ai-engineer@solopreneur
claude plugin install solo-neo4j-dev@solopreneur
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
| GTM / brand / writing / slides | `solopreneur` + `solo-marketer` |
| Pure design / UI / UX work | `solopreneur` + `solo-designer` |
| iOS / macOS SwiftUI apps | `solopreneur` + `solo-ios-dev` |
| Android / Kotlin apps | `solopreneur` + `solo-android-dev` |
| LangGraph / AI agents / LLM apps | `solopreneur` + `solo-ai-engineer` |
| Neo4j / graph database work | `solopreneur` + `solo-neo4j-dev` |

## Plugins

Each plugin section below describes the bundled skills (in-house and vendored)
plus its **Requirements** — external CLIs, plugins, MCPs, or GitHub apps the
plugin's skills and agent integrate with. Hard requirements are called out
explicitly; everything else is recommended and degrades gracefully if absent.

### `solopreneur` (core)

The foundation. Every other plugin depends on this one. No agent — just 14
skills that wrap the lifecycle around your work.

#### Your Virtual Product Team

| Skill | What it does |
|---|---|
| `/second-opinion` | **Advisor.** Challenges your plan across 5 dimensions (completeness, consistency, clarity, scope, feasibility) using an independent reviewer |
| `/preflight` | **Tech Lead.** Reviews your technical plan against platform-specific best practices before you write a single line of code |
| `/worktree-handoff` | **Coworker.** Creates an isolated git worktree with a CONTEXT.md so the next session picks up exactly where you left off |
| `/handoff` | **Scribe.** Packages the current session into a self-contained markdown context doc, printed inline so you can copy and paste it into any other agent (Codex, ChatGPT, a fresh Claude session, an agent on another machine). No worktree, no file save |
| `/specialist-review` | **Code Reviewer.** Detects your tech stack, dispatches matching expert agents, and reviews against best-practice skill indices |
| `/post-mortem` | **SRE.** Traces a bug through git history, finds the root cause commit, produces a structured post-mortem report |
| `/session-retro` | **Coach.** Reviews the current conversation for mistakes, traces root causes, proposes durable process improvements |
| `/perspective` | **Thinking Partner.** Switch between thinker perspectives (Musk, Feynman, Munger, Naval, Jobs, Taleb, …) to analyze problems from a different angle |

#### Backlog Management

| Skill | What it does |
|---|---|
| `/todos-review` | **Backlog Reviewer.** Deep-reviews a single todo/spec for feasibility, best practices, and priority — dispatches platform-specific expert agents and outputs a readiness rating |
| `/todos-cleanup` | **Backlog Janitor.** Batch-scans backlog, matches against git history, moves completed/partial items to done/ or doing/ |

#### Automation Pipelines

Start them and walk away — they loop until the job is done.

| Skill | What it does |
|---|---|
| `/autopilot` | **Auto Build.** Splits a large feature into multiple PRs and orchestrates unattended implementation, review, and merge — supports scheduling for off-hours execution |
| `/greenlight` | **Code Review Loop.** Triggers external reviewers (Codex, Gemini, CodeRabbit), fixes issues, re-triggers — loops until the PR is clean |
| `/todos-babysit` | **Backlog Monitor.** Scans backlog and in-progress todos, cross-references PR status, reviews new items, and maintains worktrees. **Interactive mode**: presents a confirmation checkpoint before acting. **Loop mode** (`/loop 24h /todos-babysit`): auto-executes safe operations and auto-implements bug fixes that pass the readiness gate — notifies only for items that need human judgment |

#### Skill-index plumbing

| Skill | What it does |
|---|---|
| `/rebuild-skill-index` | Generates per-platform extended indexes of every relevant skill installed on this machine. Feeds the `ios-dev`, `android-dev`, `designer`, `marketer`, and `neo4j-dev` agents' extended discovery. Run after installing/removing platform skills. |

#### How core skills work together

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

#### Requirements

| Component | Type | Required? | Used by |
|---|---|---|---|
| `git` | CLI | **Required** | Every skill |
| `gh` (GitHub CLI) | CLI | **Required** | `/greenlight`, `/autopilot`, `/post-mortem`, `/todos-babysit` |
| `jq` | CLI | **Required** | `/greenlight`, `scripts/sync-vendored.sh` |
| [Codex CLI](https://github.com/openai/codex) | CLI | **Required for `/greenlight` uncommitted mode** | Also: `/second-opinion` (primary review path), `/greenlight` PR mode (one of the reviewer options), `/naming` (multi-model candidate generation) |
| [superpowers](https://github.com/obra/superpowers) | Plugin | Strongly recommended | `/greenlight`, `/specialist-review` use `superpowers:requesting-code-review` and `receiving-code-review` for review framework. Graceful fallback if absent |
| [context7](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/context7) | MCP | Strongly recommended | `/preflight`, `/specialist-review`, **and every stack agent** (ios-dev, android-dev, ai-engineer, neo4j-dev, designer) call context7 for current official docs. Graceful skip if absent |
| [gstack](https://github.com/garrytan/gstack) `/review` | User skill | Recommended | `/greenlight` internal review phase — SQL safety, trust boundaries, structural issues |
| [Codex GitHub bot](https://github.com/apps/chatgpt-codex-connector) | GitHub App | Recommended | `/greenlight` PR mode default reviewer (`@codex review`) |
| [Gemini Code Assist](https://github.com/apps/gemini-code-assist) | GitHub App | Optional | `/greenlight` PR mode alternative reviewer (`/gemini review`) |
| [CodeRabbit](https://coderabbit.ai) | GitHub App | Optional | `/greenlight` passive reviewer (auto-triggered on push) |

---

### `solo-marketer`

Brand, GTM, content, and writing work. Ships the `marketer` agent plus 7
in-house skills.

| Skill | What it does |
|---|---|
| `/gtm` | **Strategist.** Generates a complete Go-To-Market strategy — analyzes the codebase, interviews you across multiple sessions, and produces 4 strategy docs (brand, market landscape, messaging, channel playbook). Supports weekly incremental updates |
| `/naming` | **Brand Namer.** Generates product or company names through structured brief, multi-model candidate generation (Claude + optional Codex / Gemini), and two-layer evaluation — supports greenfield and rebrand modes. Grounded in Lexicon / Interbrand / Siegel+Gale methodology plus processing fluency, sound symbolism, and iconicity research. Auto-reuses `docs/gtm/` if present |
| `/humanly` | **Editor.** Removes AI writing patterns from text — 36 pattern categories, 3-tier word tables, severity-based audit (P0/P1/P2), with English and Traditional Chinese support |
| `/x-writing` | **Writing Coach.** X/Twitter writing coach — helps with single tweets, threads, and long-form posts. Generates hooks, suggests topics, reviews drafts, and explains craft principles grounded in Aesthetic Writing, RARE hooks, and the algorithmic reality of X |
| `/x-growth` | **X Growth Consultant.** Diagnoses X/Twitter profiles, co-creates personalized 12-week growth plans — covers algorithm mechanics, content strategy, engagement tactics, monetization, and Dream 100 outreach. Integrates with GTM docs |
| `/linkedin-growth` | **LinkedIn Growth Consultant.** Diagnoses LinkedIn profiles, co-creates personalized 90-day growth plans — covers algorithm mechanics, content pillars, engagement engine, audience strategy, and KPI tracking. Integrates with GTM docs |
| `/slide-design` | **Presentation Designer.** Wraps `frontend-slides` or `revealjs` with a brand setup phase — bakes brand colors, typography, and assets in from slide 1. Includes projection-optimized typography scale, Phosphor SVG icon sprite, layered backdrop system, keyboard-driven reveal patterns, 13 reusable layout components, and AI-slop review via `/humanly` (English + Chinese) |

#### Requirements

- **[frontend-slides](https://github.com/zarazhangrui/frontend-slides)** plugin — single-HTML, animation-rich slide engine. Used by `/slide-design` (recommended).
- **[revealjs-skill](https://github.com/ryanbbrown/revealjs-skill)** plugin — reveal.js scaffolding (fragments, vertical stacks, speaker notes, Chart.js). Alternative engine for `/slide-design`. Wraps the underlying [reveal.js](https://github.com/hakimel/reveal.js) library.
- **Gemini CLI** — optional. Used by `/naming` for parallel multi-model candidate generation. Without it, `/naming` runs Claude + (optional) Codex CLI only.

---

### `solo-designer`

The `designer` agent for UI/UX work that spans web, iOS, and Android. Ships
10 vendored design skills.

#### Bundled skills

- **`impeccable`** — vendored from [pbakaus/impeccable](https://github.com/pbakaus/impeccable). Polish / critique / redesign frontend interfaces.
- **`taste-skill` + 8 archetype skills** (`taste-soft`, `taste-brutalist`, `taste-minimalist`, `taste-redesign`, `taste-stitch`, `taste-output`, `taste-gpt`, `taste-image-to-code`) — vendored from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill). The `taste-*` archetype family overrides default LLM design biases.

#### Requirements

- **[frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design)** plugin — creative, polished frontend code generation that avoids generic AI aesthetics. Auto-classified into the design extended index by `/rebuild-skill-index`.
- **[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)** plugin — UI/UX intelligence library: 50+ styles, 161 color palettes, font pairings, product types, UX guidelines, chart types across 10 stacks. Auto-classified.
- **[Pencil MCP](https://www.pencil.dev/downloads)** — optional. If `mcp__pencil__*` tools are available, the `designer` agent prefers them for `.pen` design file access (layout, variables, guidelines, export).

---

### `solo-ios-dev`

The `ios-dev` agent (SwiftUI / SwiftData / concurrency / testing / App Store)
plus the in-house `ios-patterns` skill and 23 vendored skills covering App
Store Connect CLI workflows and full iPhone app build/debug/ship.

#### Bundled skills

- **`ios-patterns`** (in-house) — SwiftUI conventions: i18n, date parsing, Previews, state management, sheet & navigation, list spacing, expandable animation, keyboard Done button.
- **`asc-cli` skills** (22) — vendored from [rudrankriyam/app-store-connect-cli-skills](https://github.com/rudrankriyam/app-store-connect-cli-skills). End-to-end App Store Connect workflows: TestFlight, releases, metadata, IAP, signing, screenshots, crash triage, ASO audit, RevenueCat catalog sync, notarization, submission health, …
- **`iphone-apps`** — vendored from [glittercowboy/taches-cc-resources](https://github.com/glittercowboy/taches-cc-resources/tree/main/skills/expertise/iphone-apps). CLI-only iPhone app workflow (build, debug, test, ship).

#### Requirements

- **`asc` CLI** — **required** by every `asc-*` skill. Without it, those 22 skills won't run. Install from [rorkai/App-Store-Connect-CLI](https://github.com/rorkai/App-Store-Connect-CLI).
- **[Axiom](https://github.com/CharlesWiltgen/Axiom)** plugin — 200+ skills covering SwiftUI, SwiftData, concurrency, testing, App Store, camera, AI, graphics. After install, run `/rebuild-skill-index` once and the iOS-relevant skills appear in the `ios-dev` agent's extended index. Install: `claude plugin marketplace add CharlesWiltgen/Axiom` then `claude plugin install axiom@axiom-marketplace`.

---

### `solo-android-dev`

The `android-dev` agent (Jetpack Compose / Kotlin / Play Console / build /
performance) plus the in-house `android-patterns` skill and 39 vendored skills
from 5 different upstream repos.

#### Bundled skills

- **`android-patterns`** (in-house) — Jetpack Compose patterns: `@Preview` setup (LocalInspectionMode, Vico charts), Scaffold + bottom nav + status bar insets, ModalBottomSheet nested-scroll jitter, ripple clipping on rounded corners, SwipeToDismissBox transparency, locale-aware date formatting (MIUI quirks).
- **`gplay` skills** (18) — vendored from [tamtom/gplay-cli-skills](https://github.com/tamtom/gplay-cli-skills). Google Play Console CLI workflows: build, signing, release flows, metadata, IAP, testing tracks, rollout, reviews, vitals.
- **13 Compose / architecture skills** (`compose-ui`, `compose-navigation`, `compose-performance-audit`, `architecture`, `viewmodel`, `data-layer`, `coroutines`, `kotlin-concurrency-expert`, `gradle-build-performance`, `gradle-logic`, `accessibility`, `testing`, `xml-to-compose-migration`) — vendored from [new-silvermoon/awesome-android-agent-skills](https://github.com/new-silvermoon/awesome-android-agent-skills).
- **`jetpack-compose`** — vendored from [TheBushidoCollective/han](https://github.com/TheBushidoCollective/han/tree/main/plugins/specialized/android/skills/jetpack-compose).
- **`mobile-android-design`** — vendored from [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/ui-design/skills/mobile-android-design).
- **6 official Android skills** (`agp-9-upgrade`, `migrate-xml-views-to-jetpack-compose`, `navigation-3`, `r8-analyzer`, `play-billing-library-version-upgrade`, `edge-to-edge`) — vendored from [android/skills](https://github.com/android/skills) (Apache-2.0).

#### Requirements

- **`gplay` CLI** — **required** by every `gplay-*` skill. Without it, those 18 skills won't run. Install from [tamtom/play-console-cli](https://github.com/tamtom/play-console-cli).

---

### `solo-ai-engineer`

The `ai-engineer` agent for LangGraph / LangChain / streaming / tool calling /
structured output, plus the in-house `langgraph` skill and 3 vendored skills.

#### Bundled skills

- **`langgraph`** (in-house) — deployment-first v1.0 patterns (`agent.py` with `app = ...compile()`, `langgraph.json` config, prefer `create_react_agent`).
- **`ai-engineering`** — vendored from [openclaw/skills](https://github.com/openclaw/skills/tree/main/skills/bullkis1/ai-engineer) (originally authored by `bullkis1`, namespaced as `ai-engineer` in the source repo). Production AI fundamentals: LLM provider selection, vector DB selection, full RAG pipeline, evals, drift detection.
- **`senior-prompt-engineer`** — vendored from [openclaw/skills](https://github.com/openclaw/skills/tree/main/skills/alirezarezvani/senior-prompt-engineer) (originally authored by `alirezarezvani`). Advanced prompt patterns + LLM eval frameworks + agent orchestration.
- **`prompt-architect`** — vendored from [openclaw/skills](https://github.com/openclaw/skills/tree/main/skills/abdullah4ai/prompt-architect) (originally authored by `abdullah4ai`). Single-prompt design discipline: ingest → clarify → structure → ship.

> Note: [openclaw/skills](https://github.com/openclaw/skills) is a community
> aggregator hosting skills from many authors. The three skills above each
> ship from a different upstream contributor, vendored together via that
> aggregator with each one's source path preserved in `_VENDOR.md`.

(No external requirements.)

---

### `solo-neo4j-dev`

The `neo4j-dev` agent for modern Cypher (QPP, CALL subqueries), graph data
modelling, schema design, drivers, and query plan tuning. Ships 4 vendored
skills.

#### Bundled skills

- **`neo4j-cypher`** — vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). 4.x/5.x → 2025.x upgrade. Covers removed/deprecated syntax and modern replacements.
- **`neo4j-cypher-guide`** — vendored from [tomasonjo/blogs](https://github.com/tomasonjo/blogs/tree/master/claude-skills/neo4j-cypher-guide). Modern Cypher read patterns (QPP, CALL subqueries, sorting).
- **`neo4j-migration`** — vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). Driver upgrade across .NET / Go / Java / JS / Python.
- **`neo4j-cli-tools`** — vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). `neo4j-admin`, `cypher-shell`, `aura-cli`, MCP server setup.

#### Requirements

- **`neo4j-admin`**, **`cypher-shell`**, **`aura-cli`** — Neo4j first-party CLIs. Install per the `neo4j-cli-tools` skill's guidance, depending on which workflow (admin / query / cloud) applies.

## License

MIT
