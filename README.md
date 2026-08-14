# solopreneur

**solopreneur** is a family of Claude Code and Codex plugins that gives solo founders
the workflows of a full engineering org: plan review, code review loops,
automated PR cycles, marketing, design, and platform-specific experts. Install
à la carte.

## Quick Start

Claude Code:

```bash
claude plugin marketplace add hanamizuki/solopreneur
claude plugin install solopreneur@solopreneur
```

Codex:

```bash
codex plugin marketplace add hanamizuki/solopreneur --ref main
codex plugin add solopreneur@solopreneur
```

Claude Code can also install the role plugins (`marketer`, `designer`,
`ios-dev`, `android-dev`, `ai-engineer`, `neo4j-dev`). Codex currently ships
the verified core subset only. See the [full install guide](#install).

## What's in the box

| Plugin | What you get |
|---|---|
| [`solopreneur`](#solopreneur-core) | 17 in-house skills (15 product workflows + merge and Codex-agent plumbing) |
| [`marketer`](#marketer) | `marketer` agent + 8 in-house skills (7 marketing workflows + agent router) |
| [`designer`](#designer) | `designer` agent + 10 vendored design skills (`taste-*` family + `impeccable`) |
| [`ios-dev`](#ios-dev) | `ios-dev` agent + `ios-patterns` + `ios-app-templates` (reference apps) + 24 vendored skills (`apple-design` + `asc-*` + `iphone-apps`) |
| [`android-dev`](#android-dev) | `android-dev` agent + `android-patterns` + 35 vendored skills (Compose + `gplay-*` + Android official) |
| [`ai-engineer`](#ai-engineer) | `ai-engineer` agent + `ai-app-templates` + 1 vendored skill (`senior-prompt-engineer`) |
| [`neo4j-dev`](#neo4j-dev) | `neo4j-dev` agent + 4 vendored Neo4j skills |

On Claude Code, installing any sub-plugin auto-pulls `solopreneur`. Requires Claude Code
**≥ v2.1.110** for plugin dependency resolution.

Codex currently publishes the compatible core subset: `autopilot`,
`greenlight`, `handoff`, `merge-pr`, `perspective`, `plan-review`, and
`post-mortem`. Unsupported skills stay out of the Codex package instead of
appearing and failing later.

Codex V1 is intentionally a smaller, fail-closed surface:

| Invoke on Codex | Supported V1 contract |
|---|---|
| `$solopreneur:autopilot` | One natural PR, run now, from a clean and up-to-date `main`. No multi-PR waves or scheduling. |
| `$solopreneur:greenlight external` | Open PRs sized S or M, with an authenticated Claude CLI as the independent final gate. No uncommitted, post-commit, or L-size runs. |
| `$solopreneur:handoff` | Document printed inline, plus a best-effort `/tmp` file. A read-only sandbox blocks the file; the printed document is the deliverable. |
| `$solopreneur:merge-pr` | Merge-only flow with exact-head checks; no pre-merge plan or worktree mutation. |
| `$solopreneur:perspective` | Same ten perspectives. Name the one you want up front in `codex exec` — the menu needs a conversational surface. |
| `$solopreneur:plan-review internal` | Technical and lean findings only; no outside review, adjudication, or write-back. |
| `$solopreneur:post-mortem` | Same git archaeology and report. In `codex exec`, put the bug description in the prompt; the run stops at the printed report. |

The skill descriptions below document the full Claude Code surface. Use the
contracts above when running the seven published skills on Codex.

> Migrating from a previous version? See [MIGRATION.md](./MIGRATION.md).
> For per-release, per-plugin notes, see [CHANGELOG.md](./CHANGELOG.md).

### Repository layout

- [`skills/`](./skills/) is the single source for all 106 skills, grouped by
  plugin so each skill is directly browsable.
- [`src/`](./src/) holds manifests, agents, shared helpers, vendor metadata,
  and maintainer scripts.
- `plugins/claude/` and `plugins/codex/` are generated install packages. Do
  not edit them directly.

## Plugins

Each plugin section describes the bundled skills (in-house and vendored)
plus its **Requirements**: external CLIs, plugins, MCPs, or GitHub apps the
plugin's skills and agent integrate with. Hard requirements are called out
explicitly; everything else is recommended and degrades gracefully if absent.

### `solopreneur` (core)

The foundation. Every other plugin depends on this one. No agent, just 17
skills: 15 product workflows plus merge and Codex-agent plumbing.

#### Your Virtual Product Team

| Skill | What it does |
|---|---|
| [`/mvp`](./skills/solopreneur/mvp/SKILL.md) | **PM.** Drives the full new-product flow end-to-end: brainstorming → PRD visual confirmation → template lookup (auto-discovers `*-app-templates` in installed plugins) → plan → execution. Use when starting from scratch |
| [`/plan-review`](./skills/solopreneur/plan-review/SKILL.md) | **Tech Lead.** Vets a spec, plan, or design doc in three stages — latest official docs + platform best practices, a leanness pass that cuts what the plan doesn't need, and an independent outside reviewer challenging it across 5 dimensions — then walks you through every finding. `internal` runs the first two stages only and reports findings without adjudication or write-back |
| [`/worktree-handoff`](./skills/solopreneur/worktree-handoff/SKILL.md) | **Coworker.** Creates an isolated git worktree with a CONTEXT.md so the next session picks up exactly where you left off |
| [`/handoff`](./skills/solopreneur/handoff/SKILL.md) | **Scribe.** Packages the current session into a self-contained markdown context doc, printed inline so you can copy and paste it into any other agent (Codex, ChatGPT, a fresh Claude session, an agent on another machine). Also saved under `/tmp/handoff/`. No worktree |
| [`/preview`](./skills/solopreneur/preview/SKILL.md) | **Presenter.** Turns any proposal / plan / idea into one self-contained local HTML file by default. Explicit Vercel, online, cross-device, or external-sharing requests use the private **Library** (path-scoped config, catalog sidebar, provenance footer, in-page comments) and isolated **Share** workflows on Claude Code; Codex Phase 1 is local-only |
| [`/specialist-review`](./skills/solopreneur/specialist-review/SKILL.md) | **Code Reviewer.** Detects your tech stack, dispatches matching expert agents, and reviews against best-practice skill indices |
| [`/post-mortem`](./skills/solopreneur/post-mortem/SKILL.md) | **SRE.** Traces a bug through git history, finds the root cause commit, produces a structured post-mortem report |
| [`/session-retro`](./skills/solopreneur/session-retro/SKILL.md) | **Coach.** Reviews the current conversation for mistakes, traces root causes, proposes durable process improvements |
| [`/perspective`](./skills/solopreneur/perspective/SKILL.md) | **Thinking Partner.** Switch between thinker perspectives (Musk, Feynman, Munger, Naval, Jobs, Taleb, …) to analyze problems from a different angle |

#### Backlog Management

This repo dogfoods the backlog workflow with public task files under
[`todos/`](./todos/README.md).

| Skill | What it does |
|---|---|
| [`/todos-review`](./skills/solopreneur/todos-review/SKILL.md) | **Backlog Reviewer.** Deep-reviews a single todo/backlog item for feasibility and priority — is it worth building? Dispatches platform-specific expert agents and outputs a readiness rating. Specs and implementation plans go to `/plan-review` |
| [`/todos-cleanup`](./skills/solopreneur/todos-cleanup/SKILL.md) | **Backlog Janitor.** Batch-scans backlog, matches against git history, moves completed/partial items to done/ or doing/ |

#### Automation Pipelines

Start them and walk away. They loop until the job is done.

| Skill | What it does |
|---|---|
| [`/autopilot`](./skills/solopreneur/autopilot/SKILL.md) | **Auto Build.** Splits a large feature into multiple PRs and orchestrates unattended implementation, review, and merge. Supports scheduling for off-hours execution |
| [`/greenlight`](./skills/solopreneur/greenlight/SKILL.md) | **Code Review Loop.** Triggers external reviewers (Codex bot + CLI, the Gemini bot when active on the repo, CodeRabbit), fixes issues, re-triggers. Review depth scales with PR risk (S/M/L sizing). Loops until the PR is clean |
| [`/todos-babysit`](./skills/solopreneur/todos-babysit/SKILL.md) | **Backlog Monitor.** Scans backlog and in-progress todos, cross-references PR status, reviews new items, and maintains worktrees. **Interactive mode**: presents a confirmation checkpoint before acting. **Loop mode** (`/loop 24h /todos-babysit`): auto-executes safe operations and auto-implements bug fixes that pass the readiness gate. Notifies only for items that need human judgment |
| [`/merge-pr`](./skills/solopreneur/merge-pr/SKILL.md) | **Merge Gate.** Verifies reviews, checks, branch state, and mergeability before merging the current pull request and cleaning up its worktree |

#### Discovery and platform plumbing

| Skill | What it does |
|---|---|
| [`/rebuild-skill-index`](./skills/solopreneur/rebuild-skill-index/SKILL.md) | Generates per-platform extended indexes of every relevant skill installed on this machine. Feeds the `ios-dev`, `android-dev`, `designer`, `marketer`, and `neo4j-dev` agents' extended discovery. Run after installing/removing platform skills. |
| [`codex-agents-bootstrap`](./skills/solopreneur/codex-agents-bootstrap/SKILL.md) | Installs or refreshes managed solopreneur-family custom agents for Codex, while preserving hand-authored agents and reporting inactive or orphaned managed copies without deleting them. |

#### Requirements

- **`git`**, **`gh`** (GitHub CLI), **`jq`**: required CLIs. Used across `/greenlight`, `/autopilot`, `/post-mortem`, `/todos-babysit`, and `scripts/sync-vendored.sh`; `jq` is also required by `codex-agents-bootstrap`.
- **[Codex CLI](https://github.com/openai/codex)**: **required** for `codex-agents-bootstrap` and `/greenlight` uncommitted mode (the only path on `main` with uncommitted changes). Also used by `/plan-review` (stage 3, the external reviewer), `/greenlight` PR mode (one reviewer option), and `/naming` (multi-model candidate generation). The custom-agent bootstrap and delegation pilot is validated against Codex CLI 0.147.0.
- **Python 3.9+**: **required by** `codex-agents-bootstrap` to validate agent TOML before installation. Its fixed Tomli 2.4.1 parser is bundled, so no `pip` install or network access is required. Other workflows may also invoke `python3`, but do not establish this bootstrap-specific minimum version.
- **Node.js 20+**: **required by** `/preview` to resolve delivery mode and reserve a collision-safe local output path before writing HTML.
- **[superpowers](https://github.com/obra/superpowers)** plugin: strongly recommended. `/greenlight` and `/specialist-review` use `superpowers:requesting-code-review` and `receiving-code-review` for the review framework. Graceful fallback if absent.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** plugin: optional. `/greenlight` uses `ponytail:ponytail-review` for over-engineering, dead-code, YAGNI, and simplification findings. The current runtime skips it when unavailable.
- **[context7](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/context7)** MCP: strongly recommended. Used by `/plan-review`, `/specialist-review`, and every stack agent (ios-dev, android-dev, ai-engineer, neo4j-dev, designer) for current official docs. Graceful skip if absent.
- **[gstack review](https://github.com/garrytan/gstack/tree/main/review)**: optional. `/greenlight` uses it when the current session can resolve the real gstack review capability; a similarly named bundled command is not treated as gstack without matching provenance.
- **[Codex GitHub bot](https://github.com/apps/chatgpt-codex-connector)**: optional. It is the preferred GitHub final gate for Claude-hosted `/greenlight` PR runs, with Codex CLI as the local fallback.
- **[Cursor Bugbot](https://docs.cursor.com/bugbot)**: optional, and not currently usable as a final gate — the registry holds no verified login for it, and a reviewer with no login cannot close a round. It can still be triggered as an additional reviewer.
- **[Claude CLI](https://code.claude.com/docs/en/headless)**: optional on Claude Code and required on Codex for Greenlight's independent final gate. Cross-host calls use the Claude profile matching the active Codex config and never guess another profile.
- **[Gemini Code Assist](https://github.com/apps/gemini-code-assist)**: optional. `/greenlight` PR-mode reviewer (`/gemini review`), offered only when activity detection finds it acting on the repo. Consumer Code Assist stopped GitHub code review on 2026-07-17; **enterprise is unaffected**. For post-commit review, `/greenlight` uses the Antigravity CLI (`agy`) as its Gemini-family reviewer.
- **[CodeRabbit](https://coderabbit.ai)**: optional. `/greenlight` can trigger it with `@coderabbitai review` and also collects its automatic PR review activity.
- **[Vercel CLI](https://vercel.com/docs/cli)**: optional. `/preview` needs it only when a Claude Code user explicitly requests Vercel, online, cross-device, or external-sharing delivery. Local delivery is the default, needs no Preview config or deployment tooling, and opens the browser only when explicitly requested.

---

### `marketer`

Brand, GTM, content, and writing work. Ships the `marketer` agent plus 8
in-house skills: 7 domain workflows and one agent router.

| Skill | What it does |
|---|---|
| [`/gtm`](./skills/marketer/gtm/SKILL.md) | **Strategist.** Generates a complete Go-To-Market strategy. Analyzes the codebase, interviews you across multiple sessions, and produces 4 strategy docs (brand, market landscape, messaging, channel playbook). Supports weekly incremental updates |
| [`/naming`](./skills/marketer/naming/SKILL.md) | **Brand Namer.** Generates product or company names through structured brief, multi-model candidate generation (Claude + optional Codex / Gemini), and two-layer evaluation. Supports greenfield and rebrand modes. Grounded in Lexicon / Interbrand / Siegel+Gale methodology plus processing fluency, sound symbolism, and iconicity research. Auto-reuses `docs/gtm/` if present |
| [`/humanly`](./skills/marketer/humanly/SKILL.md) | **Editor.** Removes AI writing patterns from text with English and Traditional Chinese pattern catalogs, generated prewrite briefs, 3-tier word tables, and severity-based rewrite/review audits. A fidelity layer keeps prices, quotes, names and commitments verbatim and forbids inventing facts or the author's memories; a Taiwan localization layer catches mainland vocabulary and half-width punctuation |
| [`/x-writing`](./skills/marketer/x-writing/SKILL.md) | **Writing Coach.** X/Twitter writing coach for single tweets, threads, and long-form posts. Generates hooks, suggests topics, reviews drafts, and explains craft principles grounded in Aesthetic Writing, RARE hooks, and the algorithmic reality of X |
| [`/x-growth`](./skills/marketer/x-growth/SKILL.md) | **X Growth Consultant.** Diagnoses X/Twitter profiles, co-creates personalized 12-week growth plans. Covers algorithm mechanics, content strategy, engagement tactics, monetization, and Dream 100 outreach. Integrates with GTM docs |
| [`/linkedin-growth`](./skills/marketer/linkedin-growth/SKILL.md) | **LinkedIn Growth Consultant.** Diagnoses LinkedIn profiles, co-creates personalized 90-day growth plans. Covers algorithm mechanics, content pillars, engagement engine, audience strategy, and KPI tracking. Integrates with GTM docs |
| [`/slide-design`](./skills/marketer/slide-design/SKILL.md) | **Presentation Designer.** Wraps `frontend-slides` or `revealjs` with a brand setup phase. Bakes brand colors, typography, and assets in from slide 1. Includes projection-optimized typography scale, Phosphor SVG icon sprite, layered backdrop system, keyboard-driven reveal patterns, fade-in/out background music, 13 reusable layout components, and AI-slop review via `/humanly` (English + Chinese) |
| [`using-marketer`](./skills/marketer/using-marketer/SKILL.md) | Routes explicit marketer requests and cross-concern marketing work to the `marketer` agent when available, with a bounded inline fallback. |

#### Requirements

- **[frontend-slides](https://github.com/zarazhangrui/frontend-slides)** plugin: single-HTML, animation-rich slide engine. Used by `/slide-design` (recommended).
- **[revealjs-skill](https://github.com/ryanbbrown/revealjs-skill)** plugin: reveal.js scaffolding (fragments, vertical stacks, speaker notes, Chart.js). Alternative engine for `/slide-design`. Wraps the underlying [reveal.js](https://github.com/hakimel/reveal.js) library.
- **Gemini CLI**: optional. Used by `/naming` for parallel multi-model candidate generation. Without it, `/naming` runs Claude + (optional) Codex CLI only.

---

### `designer`

The `designer` agent for UI/UX work that spans web, iOS, and Android. Ships
10 vendored design skills.

#### Bundled skills

- [**`impeccable`**](./skills/designer/impeccable/SKILL.md): vendored from [pbakaus/impeccable](https://github.com/pbakaus/impeccable). Polish / critique / redesign frontend interfaces.
- [**`taste-skill`**](./skills/designer/taste-skill/SKILL.md) + 8 archetype skills ([`taste-soft`](./skills/designer/taste-soft/SKILL.md), [`taste-brutalist`](./skills/designer/taste-brutalist/SKILL.md), [`taste-minimalist`](./skills/designer/taste-minimalist/SKILL.md), [`taste-redesign`](./skills/designer/taste-redesign/SKILL.md), [`taste-stitch`](./skills/designer/taste-stitch/SKILL.md), [`taste-output`](./skills/designer/taste-output/SKILL.md), [`taste-gpt`](./skills/designer/taste-gpt/SKILL.md), [`taste-image-to-code`](./skills/designer/taste-image-to-code/SKILL.md)): vendored from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill). The `taste-*` archetype family overrides default LLM design biases.

#### Requirements

- **[frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design)** plugin: creative, polished frontend code generation that avoids generic AI aesthetics. Auto-classified into the design extended index by `/rebuild-skill-index`.
- **[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)** plugin: UI/UX intelligence library: 50+ styles, 161 color palettes, font pairings, product types, UX guidelines, chart types across 10 stacks. Auto-classified.
- **[Pencil MCP](https://www.pencil.dev/downloads)**: optional. If `mcp__pencil__*` tools are available, the `designer` agent prefers them for `.pen` design file access (layout, variables, guidelines, export).

---

### `ios-dev`

The `ios-dev` agent (SwiftUI / SwiftData / concurrency / testing / App Store)
plus the in-house `ios-patterns` skill and 24 vendored skills covering Apple
design principles, App Store Connect CLI workflows, and full iPhone app
build/debug/ship.

#### Bundled skills

- [**`ios-patterns`**](./skills/ios-dev/ios-patterns/SKILL.md) (in-house): SwiftUI conventions: i18n, date parsing, Previews, state management, sheet & navigation, list spacing, expandable animation, keyboard Done button.
- [**`ios-app-templates`**](./skills/ios-dev/ios-app-templates/SKILL.md) (in-house): reference implementations for common app categories (currently `photo-analysis-app` and `portfolio-tracker`).
- **`asc-cli` skills** (22): vendored from [rudrankriyam/app-store-connect-cli-skills](https://github.com/rudrankriyam/app-store-connect-cli-skills). End-to-end App Store Connect workflows: TestFlight, releases, metadata, IAP, signing, screenshots, crash triage, ASO audit, RevenueCat catalog sync, notarization, submission health. ([`asc-app-create-ui`](./skills/ios-dev/asc-app-create-ui/SKILL.md), [`asc-aso-audit`](./skills/ios-dev/asc-aso-audit/SKILL.md), [`asc-build-lifecycle`](./skills/ios-dev/asc-build-lifecycle/SKILL.md), [`asc-cli-usage`](./skills/ios-dev/asc-cli-usage/SKILL.md), [`asc-crash-triage`](./skills/ios-dev/asc-crash-triage/SKILL.md), [`asc-id-resolver`](./skills/ios-dev/asc-id-resolver/SKILL.md), [`asc-localize-metadata`](./skills/ios-dev/asc-localize-metadata/SKILL.md), [`asc-metadata-sync`](./skills/ios-dev/asc-metadata-sync/SKILL.md), [`asc-notarization`](./skills/ios-dev/asc-notarization/SKILL.md), [`asc-ppp-pricing`](./skills/ios-dev/asc-ppp-pricing/SKILL.md), [`asc-release-flow`](./skills/ios-dev/asc-release-flow/SKILL.md), [`asc-revenuecat-catalog-sync`](./skills/ios-dev/asc-revenuecat-catalog-sync/SKILL.md), [`asc-screenshot-resize`](./skills/ios-dev/asc-screenshot-resize/SKILL.md), [`asc-shots-pipeline`](./skills/ios-dev/asc-shots-pipeline/SKILL.md), [`asc-signing-setup`](./skills/ios-dev/asc-signing-setup/SKILL.md), [`asc-submission-health`](./skills/ios-dev/asc-submission-health/SKILL.md), [`asc-subscription-localization`](./skills/ios-dev/asc-subscription-localization/SKILL.md), [`asc-testflight-orchestration`](./skills/ios-dev/asc-testflight-orchestration/SKILL.md), [`asc-wall-submit`](./skills/ios-dev/asc-wall-submit/SKILL.md), [`asc-whats-new-writer`](./skills/ios-dev/asc-whats-new-writer/SKILL.md), [`asc-workflow`](./skills/ios-dev/asc-workflow/SKILL.md), [`asc-xcode-build`](./skills/ios-dev/asc-xcode-build/SKILL.md))
- [**`apple-design`**](./skills/ios-dev/apple-design/SKILL.md): vendored from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/main/skills/apple-design). Apple's fluid interface design principles translated for the web — spring animations, gesture-driven UI, momentum projection, translucent materials, typography, reduced-motion.
- [**`iphone-apps`**](./skills/ios-dev/iphone-apps/SKILL.md): vendored from [glittercowboy/taches-cc-resources](https://github.com/glittercowboy/taches-cc-resources/tree/main/skills/expertise/iphone-apps). CLI-only iPhone app workflow (build, debug, test, ship).

#### Requirements

- **`asc` CLI**: **required** by every `asc-*` skill. Without it, those 22 skills won't run. Install from [rorkai/App-Store-Connect-CLI](https://github.com/rorkai/App-Store-Connect-CLI).
- **[Axiom](https://github.com/CharlesWiltgen/Axiom)** plugin: 200+ skills covering SwiftUI, SwiftData, concurrency, testing, App Store, camera, AI, graphics. After install, run `/rebuild-skill-index` once and the iOS-relevant skills appear in the `ios-dev` agent's extended index. Install: `claude plugin marketplace add CharlesWiltgen/Axiom` then `claude plugin install axiom@axiom-marketplace`.

---

### `android-dev`

The `android-dev` agent (Jetpack Compose / Kotlin / Play Console / build /
performance) plus the in-house `android-patterns` skill and 37 vendored skills
from 5 different upstream repos.

#### Bundled skills

- [**`android-patterns`**](./skills/android-dev/android-patterns/SKILL.md) (in-house): Jetpack Compose patterns: `@Preview` setup (LocalInspectionMode, Vico charts), Scaffold + bottom nav + status bar insets, ModalBottomSheet nested-scroll jitter, ripple clipping on rounded corners, SwipeToDismissBox transparency, locale-aware date formatting (MIUI quirks).
- **`gplay` skills** (16): vendored from [tamtom/gplay-cli-skills](https://github.com/tamtom/gplay-cli-skills). Google Play Console CLI workflows: build, release flows, metadata, IAP, testing tracks, rollout, reviews, vitals. ([`gplay-cli-usage`](./skills/android-dev/gplay-cli-usage/SKILL.md), [`gplay-gradle-build`](./skills/android-dev/gplay-gradle-build/SKILL.md), [`gplay-iap-setup`](./skills/android-dev/gplay-iap-setup/SKILL.md), [`gplay-metadata-sync`](./skills/android-dev/gplay-metadata-sync/SKILL.md), [`gplay-migrate-fastlane`](./skills/android-dev/gplay-migrate-fastlane/SKILL.md), [`gplay-ppp-pricing`](./skills/android-dev/gplay-ppp-pricing/SKILL.md), [`gplay-purchase-verification`](./skills/android-dev/gplay-purchase-verification/SKILL.md), [`gplay-release-flow`](./skills/android-dev/gplay-release-flow/SKILL.md), [`gplay-reports-download`](./skills/android-dev/gplay-reports-download/SKILL.md), [`gplay-review-management`](./skills/android-dev/gplay-review-management/SKILL.md), [`gplay-rollout-management`](./skills/android-dev/gplay-rollout-management/SKILL.md), [`gplay-screenshot-automation`](./skills/android-dev/gplay-screenshot-automation/SKILL.md), [`gplay-submission-checks`](./skills/android-dev/gplay-submission-checks/SKILL.md), [`gplay-testers-orchestration`](./skills/android-dev/gplay-testers-orchestration/SKILL.md), [`gplay-user-management`](./skills/android-dev/gplay-user-management/SKILL.md), [`gplay-vitals-monitoring`](./skills/android-dev/gplay-vitals-monitoring/SKILL.md))
- **11 Compose / architecture skills**: vendored from [new-silvermoon/awesome-android-agent-skills](https://github.com/new-silvermoon/awesome-android-agent-skills). ([`compose-ui`](./skills/android-dev/compose-ui/SKILL.md), [`compose-performance-audit`](./skills/android-dev/compose-performance-audit/SKILL.md), [`architecture`](./skills/android-dev/architecture/SKILL.md), [`viewmodel`](./skills/android-dev/viewmodel/SKILL.md), [`data-layer`](./skills/android-dev/data-layer/SKILL.md), [`coroutines`](./skills/android-dev/coroutines/SKILL.md), [`kotlin-concurrency-expert`](./skills/android-dev/kotlin-concurrency-expert/SKILL.md), [`gradle-build-performance`](./skills/android-dev/gradle-build-performance/SKILL.md), [`accessibility`](./skills/android-dev/accessibility/SKILL.md), [`testing`](./skills/android-dev/testing/SKILL.md), [`xml-to-compose-migration`](./skills/android-dev/xml-to-compose-migration/SKILL.md))
- [**`jetpack-compose`**](./skills/android-dev/jetpack-compose/SKILL.md): vendored from [TheBushidoCollective/han](https://github.com/TheBushidoCollective/han/tree/main/plugins/specialized/android/skills/jetpack-compose).
- [**`mobile-android-design`**](./skills/android-dev/mobile-android-design/SKILL.md): vendored from [wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/ui-design/skills/mobile-android-design).
- **6 official Android skills**: vendored from [android/skills](https://github.com/android/skills) (Apache-2.0). ([`agp-9-upgrade`](./skills/android-dev/agp-9-upgrade/SKILL.md), [`migrate-xml-views-to-jetpack-compose`](./skills/android-dev/migrate-xml-views-to-jetpack-compose/SKILL.md), [`navigation-3`](./skills/android-dev/navigation-3/SKILL.md), [`r8-analyzer`](./skills/android-dev/r8-analyzer/SKILL.md), [`play-billing-library-version-upgrade`](./skills/android-dev/play-billing-library-version-upgrade/SKILL.md), [`edge-to-edge`](./skills/android-dev/edge-to-edge/SKILL.md))

#### Requirements

- **`gplay` CLI**: **required** by every `gplay-*` skill. Without it, those 16 skills won't run. Install from [tamtom/play-console-cli](https://github.com/tamtom/play-console-cli).

---

### `ai-engineer`

The `ai-engineer` agent for LangGraph / LangChain / streaming / tool calling /
structured output, plus 2 in-house skills and 1 vendored skill.

#### Bundled skills

- [**`ai-app-templates`**](./skills/ai-engineer/ai-app-templates/SKILL.md) (in-house): reference implementations for common AI backend shapes (currently `simple-llm-api`: minimal FastAPI service with one `POST /chat` endpoint, provider chosen at scaffold time — Anthropic / Gemini / OpenRouter).
- [**`senior-prompt-engineer`**](./skills/ai-engineer/senior-prompt-engineer/SKILL.md): vendored from [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team/skills/senior-prompt-engineer). Advanced prompt patterns + LLM eval frameworks + agent orchestration.

(No external requirements.)

---

### `neo4j-dev`

The `neo4j-dev` agent for modern Cypher (QPP, CALL subqueries), graph data
modelling, schema design, drivers, and query plan tuning. Ships 4 vendored
skills.

#### Bundled skills

- [**`neo4j-cypher`**](./skills/neo4j-dev/neo4j-cypher/SKILL.md): vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). 4.x/5.x → 2025.x upgrade. Covers removed/deprecated syntax and modern replacements.
- [**`neo4j-cypher-guide`**](./skills/neo4j-dev/neo4j-cypher-guide/SKILL.md): vendored from [tomasonjo/blogs](https://github.com/tomasonjo/blogs/tree/master/claude-skills/neo4j-cypher-guide). Modern Cypher read patterns (QPP, CALL subqueries, sorting).
- [**`neo4j-migration`**](./skills/neo4j-dev/neo4j-migration/SKILL.md): vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). Driver upgrade across .NET / Go / Java / JS / Python.
- [**`neo4j-cli-tools`**](./skills/neo4j-dev/neo4j-cli-tools/SKILL.md): vendored from [neo4j-contrib/neo4j-skills](https://github.com/neo4j-contrib/neo4j-skills). `neo4j-admin`, `cypher-shell`, `aura-cli`, MCP server setup.

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
 ├─ /plan-review ────── Vet the spec: official docs · leanness · outside reviewer
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
 │       triggers: Codex bot · Gemini bot (when active) · CodeRabbit
 │
 ├─ /preview ──────────── Create local HTML; deploy only when explicit
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

`/greenlight` triggers external reviewers (Codex bot, the Gemini bot when active
on the repo, CodeRabbit), fixes every finding, re-triggers. Repeats until no new
suggestions remain. Also works in uncommitted mode on `main` for quick pre-commit
cleanup, and in post-commit mode where it adds the Antigravity CLI (`agy`) as a
Gemini-family reviewer alongside Codex.

### Brand & GTM strategy

`/gtm` analyzes your codebase and interviews you to produce 4 strategy docs.
Follow up with `/naming` for product names, `/x-writing` and `/linkedin-growth`
for content strategy, and `/slide-design` for investor or launch decks.

### Backlog on auto-pilot

Run `/loop 24h /todos-babysit`. It scans your backlog, auto-implements bug
fixes that pass the readiness gate, and notifies you only for items that
need human judgment.

### Vet the plan before building

`/plan-review` runs three stages over a spec, plan, or design doc: it checks the
approach against the latest official docs, hunts what the plan doesn't need, and
sends it to an independent reviewer that challenges it across 5 dimensions. Then
it walks you through the findings one by one. Add `internal` to run the first two
stages only and get the findings reported back without adjudication or write-back.

## Install

### Claude Code

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

To update later, then start a new session:

```bash
# Refresh the marketplace catalog
claude plugin marketplace update solopreneur

# Update core
claude plugin update solopreneur@solopreneur

# Repeat for every installed role, for example:
claude plugin update marketer@solopreneur
```

### Codex

Codex publishes the core plugin only:

```bash
codex plugin marketplace add hanamizuki/solopreneur --ref main
codex plugin add solopreneur@solopreneur
```

To refresh the marketplace and installed plugin later, then start a new session:

```bash
codex plugin marketplace upgrade solopreneur
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
