# solopreneur

**solopreneur** is a family of Claude Code plugins that gives solo founders
the workflows of a full engineering org: plan review, code review loops,
automated PR cycles, marketing, design, and platform-specific experts. Install
à la carte.

## Quick Start

```bash
claude plugin marketplace add hanamizuki/solopreneur
claude plugin install solopreneur@solopreneur
```

Then add whichever roles you need (`marketer`, `designer`, `ios-dev`,
`android-dev`, `ai-engineer`, `neo4j-dev`). See the [full install guide](#install)
for details and role-based recommendations.

## What's in the box

| Plugin | What you get |
|---|---|
| [`solopreneur`](#solopreneur-core) | 16 in-house skills (review, pipelines, thinking partners, automation) |
| [`marketer`](#marketer) | `marketer` agent + 7 in-house skills (GTM, naming, writing, X/LinkedIn growth, slide design) |
| [`designer`](#designer) | `designer` agent + 10 vendored design skills (`taste-*` family + `impeccable`) |
| [`ios-dev`](#ios-dev) | `ios-dev` agent + `ios-patterns` + `ios-app-templates` (reference apps) + 23 vendored skills (`asc-*` + `iphone-apps`) |
| [`android-dev`](#android-dev) | `android-dev` agent + `android-patterns` + 39 vendored skills (Compose + `gplay-*` + Android official) |
| [`ai-engineer`](#ai-engineer) | `ai-engineer` agent + `langgraph` + `ai-app-templates` + 1 vendored skill (`senior-prompt-engineer`) |
| [`neo4j-dev`](#neo4j-dev) | `neo4j-dev` agent + 4 vendored Neo4j skills |

Installing any sub-plugin auto-pulls `solopreneur`. Requires Claude Code
**≥ v2.1.110** for plugin dependency resolution.

> Migrating from a previous version? See [MIGRATION.md](./MIGRATION.md).
> For per-release, per-plugin notes, see [CHANGELOG.md](./CHANGELOG.md).

## Plugins

Each plugin section describes the bundled skills (in-house and vendored)
plus its **Requirements**: external CLIs, plugins, MCPs, or GitHub apps the
plugin's skills and agent integrate with. Hard requirements are called out
explicitly; everything else is recommended and degrades gracefully if absent.

### `solopreneur` (core)

The foundation. Every other plugin depends on this one. No agent, just 16
skills that wrap the lifecycle around your work.

#### Your Virtual Product Team

| Skill | What it does |
|---|---|
| [`/mvp`](./plugins/solopreneur/skills/mvp/SKILL.md) | **PM.** Drives the full new-product flow end-to-end: brainstorming → PRD visual confirmation → template lookup (auto-discovers `*-app-templates` in installed plugins) → plan → execution. Use when starting from scratch |
| [`/second-opinion`](./plugins/solopreneur/skills/second-opinion/SKILL.md) | **Advisor.** Challenges your plan across 5 dimensions (completeness, consistency, clarity, scope, feasibility) using an independent reviewer |
| [`/tech-vetting`](./plugins/solopreneur/skills/tech-vetting/SKILL.md) | **Tech Lead.** Vets your technical plan against the latest official docs and platform-specific best practices before you write a single line of code |
| [`/worktree-handoff`](./plugins/solopreneur/skills/worktree-handoff/SKILL.md) | **Coworker.** Creates an isolated git worktree with a CONTEXT.md so the next session picks up exactly where you left off |
| [`/handoff`](./plugins/solopreneur/skills/handoff/SKILL.md) | **Scribe.** Packages the current session into a self-contained markdown context doc, printed inline so you can copy and paste it into any other agent (Codex, ChatGPT, a fresh Claude session, an agent on another machine). No worktree, no file save |
| [`/preview`](./plugins/solopreneur/skills/preview/SKILL.md) | **Presenter.** Turns any proposal / plan / idea into an interactive HTML page, deploys it to Vercel for a shareable URL, with an in-page comment overlay so reviewers can highlight text and leave in-context feedback you can act on directly |
| [`/specialist-review`](./plugins/solopreneur/skills/specialist-review/SKILL.md) | **Code Reviewer.** Detects your tech stack, dispatches matching expert agents, and reviews against best-practice skill indices |
| [`/post-mortem`](./plugins/solopreneur/skills/post-mortem/SKILL.md) | **SRE.** Traces a bug through git history, finds the root cause commit, produces a structured post-mortem report |
| [`/session-retro`](./plugins/solopreneur/skills/session-retro/SKILL.md) | **Coach.** Reviews the current conversation for mistakes, traces root causes, proposes durable process improvements |
| [`/perspective`](./plugins/solopreneur/skills/perspective/SKILL.md) | **Thinking Partner.** Switch between thinker perspectives (Musk, Feynman, Munger, Naval, Jobs, Taleb, …) to analyze problems from a different angle |

#### Backlog Management

This repo dogfoods the backlog workflow with public task files under
[`todos/`](./todos/README.md).

| Skill | What it does |
|---|---|
| [`/todos-review`](./plugins/solopreneur/skills/todos-review/SKILL.md) | **Backlog Reviewer.** Deep-reviews a single todo/spec for feasibility, best practices, and priority. Dispatches platform-specific expert agents and outputs a readiness rating |
| [`/todos-cleanup`](./plugins/solopreneur/skills/todos-cleanup/SKILL.md) | **Backlog Janitor.** Batch-scans backlog, matches against git history, moves completed/partial items to done/ or doing/ |

#### Automation Pipelines

Start them and walk away. They loop until the job is done.

| Skill | What it does |
|---|---|
| [`/autopilot`](./plugins/solopreneur/skills/autopilot/SKILL.md) | **Auto Build.** Splits a large feature into multiple PRs and orchestrates unattended implementation, review, and merge. Supports scheduling for off-hours execution |
| [`/greenlight`](./plugins/solopreneur/skills/greenlight/SKILL.md) | **Code Review Loop.** Triggers external reviewers (Codex, Gemini, CodeRabbit), fixes issues, re-triggers. Loops until the PR is clean |
| [`/todos-babysit`](./plugins/solopreneur/skills/todos-babysit/SKILL.md) | **Backlog Monitor.** Scans backlog and in-progress todos, cross-references PR status, reviews new items, and maintains worktrees. **Interactive mode**: presents a confirmation checkpoint before acting. **Loop mode** (`/loop 24h /todos-babysit`): auto-executes safe operations and auto-implements bug fixes that pass the readiness gate. Notifies only for items that need human judgment |

#### Skill-index plumbing

| Skill | What it does |
|---|---|
| [`/rebuild-skill-index`](./plugins/solopreneur/skills/rebuild-skill-index/SKILL.md) | Generates per-platform extended indexes of every relevant skill installed on this machine. Feeds the `ios-dev`, `android-dev`, `designer`, `marketer`, and `neo4j-dev` agents' extended discovery. Run after installing/removing platform skills. |

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
| [`/gtm`](./plugins/marketer/skills/gtm/SKILL.md) | **Strategist.** Generates a complete Go-To-Market strategy. Analyzes the codebase, interviews you across multiple sessions, and produces 4 strategy docs (brand, market landscape, messaging, channel playbook). Supports weekly incremental updates |
| [`/naming`](./plugins/marketer/skills/naming/SKILL.md) | **Brand Namer.** Generates product or company names through structured brief, multi-model candidate generation (Claude + optional Codex / Gemini), and two-layer evaluation. Supports greenfield and rebrand modes. Grounded in Lexicon / Interbrand / Siegel+Gale methodology plus processing fluency, sound symbolism, and iconicity research. Auto-reuses `docs/gtm/` if present |
| [`/humanly`](./plugins/marketer/skills/humanly/SKILL.md) | **Editor.** Removes AI writing patterns from text with English and Traditional Chinese pattern catalogs, generated prewrite briefs, 3-tier word tables, and severity-based rewrite/review audits |
| [`/x-writing`](./plugins/marketer/skills/x-writing/SKILL.md) | **Writing Coach.** X/Twitter writing coach for single tweets, threads, and long-form posts. Generates hooks, suggests topics, reviews drafts, and explains craft principles grounded in Aesthetic Writing, RARE hooks, and the algorithmic reality of X |
| [`/x-growth`](./plugins/marketer/skills/x-growth/SKILL.md) | **X Growth Consultant.** Diagnoses X/Twitter profiles, co-creates personalized 12-week growth plans. Covers algorithm mechanics, content strategy, engagement tactics, monetization, and Dream 100 outreach. Integrates with GTM docs |
| [`/linkedin-growth`](./plugins/marketer/skills/linkedin-growth/SKILL.md) | **LinkedIn Growth Consultant.** Diagnoses LinkedIn profiles, co-creates personalized 90-day growth plans. Covers algorithm mechanics, content pillars, engagement engine, audience strategy, and KPI tracking. Integrates with GTM docs |
| [`/slide-design`](./plugins/marketer/skills/slide-design/SKILL.md) | **Presentation Designer.** Wraps `frontend-slides` or `revealjs` with a brand setup phase. Bakes brand colors, typography, and assets in from slide 1. Includes projection-optimized typography scale, Phosphor SVG icon sprite, layered backdrop system, keyboard-driven reveal patterns, fade-in/out background music, 13 reusable layout components, and AI-slop review via `/humanly` (English + Chinese) |

#### Requirements

- **[frontend-slides](https://github.com/zarazhangrui/frontend-slides)** plugin: single-HTML, animation-rich slide engine. Used by `/slide-design` (recommended).
- **[revealjs-skill](https://github.com/ryanbbrown/revealjs-skill)** plugin: reveal.js scaffolding (fragments, vertical stacks, speaker notes, Chart.js). Alternative engine for `/slide-design`. Wraps the underlying [reveal.js](https://github.com/hakimel/reveal.js) library.
- **Gemini CLI**: optional. Used by `/naming` for parallel multi-model candidate generation. Without it, `/naming` runs Claude + (optional) Codex CLI only.

---

### `designer`

The `designer` agent for UI/UX work that spans web, iOS, and Android. Ships
10 vendored design skills.

#### Bundled skills

- [**`impeccable`**](./plugins/designer/skills/impeccable/SKILL.md): vendored from [pbakaus/impeccable](https://github.com/pbakaus/impeccable). Polish / critique / redesign frontend interfaces.
- [**`taste-skill`**](./plugins/designer/skills/taste-skill/SKILL.md) + 8 archetype skills ([`taste-soft`](./plugins/designer/skills/taste-soft/SKILL.md), [`taste-brutalist`](./plugins/designer/skills/taste-brutalist/SKILL.md), [`taste-minimalist`](./plugins/designer/skills/taste-minimalist/SKILL.md), [`taste-redesign`](./plugins/designer/skills/taste-redesign/SKILL.md), [`taste-stitch`](./plugins/designer/skills/taste-stitch/SKILL.md), [`taste-output`](./plugins/designer/skills/taste-output/SKILL.md), [`taste-gpt`](./plugins/designer/skills/taste-gpt/SKILL.md), [`taste-image-to-code`](./plugins/designer/skills/taste-image-to-code/SKILL.md)): vendored from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill). The `taste-*` archetype family overrides default LLM design biases.

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

- [**`ios-patterns`**](./plugins/ios-dev/skills/ios-patterns/SKILL.md) (in-house): SwiftUI conventions: i18n, date parsing, Previews, state management, sheet & navigation, list spacing, expandable animation, keyboard Done button.
- [**`ios-app-templates`**](./plugins/ios-dev/skills/ios-app-templates/SKILL.md) (in-house): reference implementations for common app categories (currently `photo-analysis-app` and `portfolio-tracker`).
- **`asc-cli` skills** (22): vendored from [rudrankriyam/app-store-connect-cli-skills](https://github.com/rudrankriyam/app-store-connect-cli-skills). End-to-end App Store Connect workflows: TestFlight, releases, metadata, IAP, signing, screenshots, crash triage, ASO audit, RevenueCat catalog sync, notarization, submission health. ([`asc-app-create-ui`](./plugins/ios-dev/skills/asc-app-create-ui/SKILL.md), [`asc-aso-audit`](./plugins/ios-dev/skills/asc-aso-audit/SKILL.md), [`asc-build-lifecycle`](./plugins/ios-dev/skills/asc-build-lifecycle/SKILL.md), [`asc-cli-usage`](./plugins/ios-dev/skills/asc-cli-usage/SKILL.md), [`asc-crash-triage`](./plugins/ios-dev/skills/asc-crash-triage/SKILL.md), [`asc-id-resolver`](./plugins/ios-dev/skills/asc-id-resolver/SKILL.md), [`asc-localize-metadata`](./plugins/ios-dev/skills/asc-localize-metadata/SKILL.md), [`asc-metadata-sync`](./plugins/ios-dev/skills/asc-metadata-sync/SKILL.md), [`asc-notarization`](./plugins/ios-dev/skills/asc-notarization/SKILL.md), [`asc-ppp-pricing`](./plugins/ios-dev/skills/asc-ppp-pricing/SKILL.md), [`asc-release-flow`](./plugins/ios-dev/skills/asc-release-flow/SKILL.md), [`asc-revenuecat-catalog-sync`](./plugins/ios-dev/skills/asc-revenuecat-catalog-sync/SKILL.md), [`asc-screenshot-resize`](./plugins/ios-dev/skills/asc-screenshot-resize/SKILL.md), [`asc-shots-pipeline`](./plugins/ios-dev/skills/asc-shots-pipeline/SKILL.md), [`asc-signing-setup`](./plugins/ios-dev/skills/asc-signing-setup/SKILL.md), [`asc-submission-health`](./plugins/ios-dev/skills/asc-submission-health/SKILL.md), [`asc-subscription-localization`](./plugins/ios-dev/skills/asc-subscription-localization/SKILL.md), [`asc-testflight-orchestration`](./plugins/ios-dev/skills/asc-testflight-orchestration/SKILL.md), [`asc-wall-submit`](./plugins/ios-dev/skills/asc-wall-submit/SKILL.md), [`asc-whats-new-writer`](./plugins/ios-dev/skills/asc-whats-new-writer/SKILL.md), [`asc-workflow`](./plugins/ios-dev/skills/asc-workflow/SKILL.md), [`asc-xcode-build`](./plugins/ios-dev/skills/asc-xcode-build/SKILL.md))
- [**`iphone-apps`**](./plugins/ios-dev/skills/iphone-apps/SKILL.md): vendored from [glittercowboy/taches-cc-resources](https://github.com/glittercowboy/taches-cc-resources/tree/main/skills/expertise/iphone-apps). CLI-only iPhone app workflow (build, debug, test, ship).

#### Requirements

- **`asc` CLI**: **required** by every `asc-*` skill. Without it, those 22 skills won't run. Install from [rorkai/App-Store-Connect-CLI](https://github.com/rorkai/App-Store-Connect-CLI).
- **[Axiom](https://github.com/CharlesWiltgen/Axiom)** plugin: 200+ skills covering SwiftUI, SwiftData, concurrency, testing, App Store, camera, AI, graphics. After install, run `/rebuild-skill-index` once and the iOS-relevant skills appear in the `ios-dev` agent's extended index. Install: `claude plugin marketplace add CharlesWiltgen/Axiom` then `claude plugin install axiom@axiom-marketplace`.

---

### `android-dev`

The `android-dev` agent (Jetpack Compose / Kotlin / Play Console / build /
performance) plus the in-house `android-patterns` skill and 39 vendored skills
from 5 different upstream repos.

#### Bundled skills

- [**`android-patterns`**](./plugins/android-dev/skills/android-patterns/SKILL.md) (in-house): Jetpack Compose patterns: `@Preview` setup (LocalInspectionMode, Vico charts), Scaffold + bottom nav + status bar insets, ModalBottomSheet nested-scroll jitter, ripple clipping on rounded corners, SwipeToDismissBox transparency, locale-aware date formatting (MIUI quirks).
- **`gplay` skills** (18): vendored from [tamtom/gplay-cli-skills](https://github.com/tamtom/gplay-cli-skills). Google Play Console CLI workflows: build, signing, release flows, metadata, IAP, testing tracks, rollout, reviews, vitals. ([`gplay-cli-usage`](./plugins/android-dev/skills/gplay-cli-usage/SKILL.md), [`gplay-gradle-build`](./plugins/android-dev/skills/gplay-gradle-build/SKILL.md), [`gplay-iap-setup`](./plugins/android-dev/skills/gplay-iap-setup/SKILL.md), [`gplay-metadata-sync`](./plugins/android-dev/skills/gplay-metadata-sync/SKILL.md), [`gplay-migrate-fastlane`](./plugins/android-dev/skills/gplay-migrate-fastlane/SKILL.md), [`gplay-ppp-pricing`](./plugins/android-dev/skills/gplay-ppp-pricing/SKILL.md), [`gplay-purchase-verification`](./plugins/android-dev/skills/gplay-purchase-verification/SKILL.md), [`gplay-release-flow`](./plugins/android-dev/skills/gplay-release-flow/SKILL.md), [`gplay-reports-download`](./plugins/android-dev/skills/gplay-reports-download/SKILL.md), [`gplay-review-management`](./plugins/android-dev/skills/gplay-review-management/SKILL.md), [`gplay-rollout-management`](./plugins/android-dev/skills/gplay-rollout-management/SKILL.md), [`gplay-screenshot-automation`](./plugins/android-dev/skills/gplay-screenshot-automation/SKILL.md), [`gplay-signing-setup`](./plugins/android-dev/skills/gplay-signing-setup/SKILL.md), [`gplay-submission-checks`](./plugins/android-dev/skills/gplay-submission-checks/SKILL.md), [`gplay-subscription-localization`](./plugins/android-dev/skills/gplay-subscription-localization/SKILL.md), [`gplay-testers-orchestration`](./plugins/android-dev/skills/gplay-testers-orchestration/SKILL.md), [`gplay-user-management`](./plugins/android-dev/skills/gplay-user-management/SKILL.md), [`gplay-vitals-monitoring`](./plugins/android-dev/skills/gplay-vitals-monitoring/SKILL.md))
- **13 Compose / architecture skills**: vendored from [new-silvermoon/awesome-android-agent-skills](https://github.com/new-silvermoon/awesome-android-agent-skills). ([`compose-ui`](./plugins/android-dev/skills/compose-ui/SKILL.md), [`compose-navigation`](./plugins/android-dev/skills/compose-navigation/SKILL.md), [`compose-performance-audit`](./plugins/android-dev/skills/compose-performance-audit/SKILL.md), [`architecture`](./plugins/android-dev/skills/architecture/SKILL.md), [`viewmodel`](./plugins/android-dev/skills/viewmodel/SKILL.md), [`data-layer`](./plugins/android-dev/skills/data-layer/SKILL.md), [`coroutines`](./plugins/android-dev/skills/coroutines/SKILL.md), [`kotlin-concurrency-expert`](./plugins/android-dev/skills/kotlin-concurrency-expert/SKILL.md), [`gradle-build-performance`](./plugins/android-dev/skills/gradle-build-performance/SKILL.md), [`gradle-logic`](./plugins/android-dev/skills/gradle-logic/SKILL.md), [`accessibility`](./plugins/android-dev/skills/accessibility/SKILL.md), [`testing`](./plugins/android-dev/skills/testing/SKILL.md), [`xml-to-compose-migration`](./plugins/android-dev/skills/xml-to-compose-migration/SKILL.md))
- [**`jetpack-compose`**](./plugins/android-dev/skills/jetpack-compose/SKILL.md): vendored from [TheBushidoCollective/han](https://github.com/TheBushidoCollective/han/tree/main/plugins/specialized/android/skills/jetpack-compose).
- [**`mobile-android-design`**](./plugins/android-dev/skills/mobile-android-design/SKILL.md): vendored from [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/ui-design/skills/mobile-android-design).
- **6 official Android skills**: vendored from [android/skills](https://github.com/android/skills) (Apache-2.0). ([`agp-9-upgrade`](./plugins/android-dev/skills/agp-9-upgrade/SKILL.md), [`migrate-xml-views-to-jetpack-compose`](./plugins/android-dev/skills/migrate-xml-views-to-jetpack-compose/SKILL.md), [`navigation-3`](./plugins/android-dev/skills/navigation-3/SKILL.md), [`r8-analyzer`](./plugins/android-dev/skills/r8-analyzer/SKILL.md), [`play-billing-library-version-upgrade`](./plugins/android-dev/skills/play-billing-library-version-upgrade/SKILL.md), [`edge-to-edge`](./plugins/android-dev/skills/edge-to-edge/SKILL.md))

#### Requirements

- **`gplay` CLI**: **required** by every `gplay-*` skill. Without it, those 18 skills won't run. Install from [tamtom/play-console-cli](https://github.com/tamtom/play-console-cli).

---

### `ai-engineer`

The `ai-engineer` agent for LangGraph / LangChain / streaming / tool calling /
structured output, plus 2 in-house skills and 1 vendored skill.

#### Bundled skills

- [**`langgraph`**](./plugins/ai-engineer/skills/langgraph/SKILL.md) (in-house): deployment-first v1.0 patterns (`agent.py` with `app = ...compile()`, `langgraph.json` config, prefer `create_react_agent`).
- [**`ai-app-templates`**](./plugins/ai-engineer/skills/ai-app-templates/SKILL.md) (in-house): reference implementations for common AI backend shapes (currently `simple-llm-api`: minimal FastAPI service with one `POST /chat` endpoint, provider chosen at scaffold time — Anthropic / Gemini / OpenRouter).
- [**`senior-prompt-engineer`**](./plugins/ai-engineer/skills/senior-prompt-engineer/SKILL.md): vendored from [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/senior-prompt-engineer). Advanced prompt patterns + LLM eval frameworks + agent orchestration.

(No external requirements.)

---

### `neo4j-dev`

The `neo4j-dev` agent for modern Cypher (QPP, CALL subqueries), graph data
modelling, schema design, drivers, and query plan tuning. Ships 4 vendored
skills.

#### Bundled skills

- [**`neo4j-cypher`**](./plugins/neo4j-dev/skills/neo4j-cypher/SKILL.md): vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). 4.x/5.x → 2025.x upgrade. Covers removed/deprecated syntax and modern replacements.
- [**`neo4j-cypher-guide`**](./plugins/neo4j-dev/skills/neo4j-cypher-guide/SKILL.md): vendored from [tomasonjo/blogs](https://github.com/tomasonjo/blogs/tree/master/claude-skills/neo4j-cypher-guide). Modern Cypher read patterns (QPP, CALL subqueries, sorting).
- [**`neo4j-migration`**](./plugins/neo4j-dev/skills/neo4j-migration/SKILL.md): vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). Driver upgrade across .NET / Go / Java / JS / Python.
- [**`neo4j-cli-tools`**](./plugins/neo4j-dev/skills/neo4j-cli-tools/SKILL.md): vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). `neo4j-admin`, `cypher-shell`, `aura-cli`, MCP server setup.

#### Requirements

- **`neo4j-admin`**, **`cypher-shell`**, **`aura-cli`**: Neo4j first-party CLIs. Install per the `neo4j-cli-tools` skill's guidance, depending on which workflow (admin / query / cloud) applies.

---

## How it works

solopreneur wraps the full development lifecycle — from idea to shipped code —
with skills that plan, build, review, and iterate. Six specialist agents
(`ios-dev`, `android-dev`, `ai-engineer`, `designer`, `marketer`, `neo4j-dev`)
are dispatched automatically by pipeline skills or invoked manually when you
need domain expertise.

```
Idea
 │
 ├─ /mvp ────────────── Brainstorm → PRD → template → plan → execute
 │                       dispatches: ios-dev · android-dev · ai-engineer
 │
 ├─ /second-opinion ─── Challenge the spec (independent reviewer)
 ├─ /tech-vetting ───── Verify against latest official docs
 │
 ├─ /worktree-handoff ─ Isolate the work in a git worktree
 ├─ /autopilot ──────── Split into PRs, auto-implement, review, merge
 │   │                   dispatches: ios-dev · android-dev · ai-engineer
 │   │                               designer · marketer
 │   │
 │   ├─ /specialist-review ── Expert review per tech stack
 │   │   dispatches: ios-dev · android-dev · neo4j-dev · designer · marketer
 │   │
 │   └─ /greenlight ────────── External review loop
 │       triggers: Codex bot · Gemini Code Assist · CodeRabbit
 │
 ├─ /preview ──────────── Deploy interactive HTML for human review
 │
 ├─ /post-mortem ──────── Trace the root cause when something breaks
 ├─ /session-retro ────── Capture lessons from this session
 │
 └─ Backlog
     ├─ /todos-review ──── Deep-review before implementing
     ├─ /todos-cleanup ─── Batch-triage against git history
     └─ /todos-babysit ─── Periodic: review → implement → merge
```

Agents can also be called directly — ask the `designer` to critique a UI,
the `marketer` to draft copy, or the `ios-dev` to review SwiftUI patterns.

## Use Cases

### Full auto-pilot development

Give `/autopilot` a spec. It splits the work into PRs, dispatches the right
agents to implement each one, runs `/greenlight` review loops until clean,
and merges. You come back to merged code.

### Build an app from zero

`/mvp` walks you through brainstorming, PRD, template selection (discovers
`ios-app-templates`, `ai-app-templates`, etc. from installed plugins), plan,
and implementation. Dispatches `ios-dev` or `android-dev` for platform work.

### Call the designer to polish a page

Ask the `designer` agent to critique or redesign a frontend page. It uses
`impeccable` for interface polish and the `taste-*` family to override
generic AI aesthetics with a specific design archetype. Works across web,
iOS, and Android.

### Review code until it's clean

`/greenlight` triggers external reviewers (Codex bot, Gemini, CodeRabbit),
fixes every finding, re-triggers. Repeats until no new suggestions remain.
Also works in uncommitted mode on `main` for quick pre-commit cleanup.

### Brand & GTM strategy

`/gtm` analyzes your codebase and interviews you to produce 4 strategy docs.
Follow up with `/naming` for product names, `/x-writing` and `/linkedin-growth`
for content strategy, and `/slide-design` for investor or launch decks.

### Backlog on auto-pilot

Run `/loop 24h /todos-babysit`. It scans your backlog, auto-implements bug
fixes that pass the readiness gate, and notifies you only for items that
need human judgment.

### Get a second opinion before building

`/second-opinion` challenges your plan across 5 dimensions. `/tech-vetting`
verifies the technical approach against latest official docs. Run both before
writing code to catch issues early.

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

## License

MIT
