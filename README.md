# solopreneur

Building alone doesn't mean building without a team. **solopreneur** gives solo
founders the workflows of a full engineering org — plan review, code review
loops, automated PR cycles, GTM, writing, and platform-specific experts — as a
family of Claude Code plugins you install à la carte.

## The six plugins

| Plugin | What you get | Depends on |
|---|---|---|
| [`solopreneur-core`](./plugins/core) | 20 skills (review, pipelines, GTM, writing, thinking) + `designer` agent | — |
| [`solopreneur-ios`](./plugins/ios) | `ios-dev` agent + `ios-patterns` skill | `solopreneur-core` |
| [`solopreneur-android`](./plugins/android) | `android-dev` agent + `android-patterns` skill | `solopreneur-core` |
| [`solopreneur-nextjs`](./plugins/nextjs) | `nextjs-dev` agent (covers React/Next.js/frontend broadly) | `solopreneur-core` |
| [`solopreneur-python`](./plugins/python) | `python-dev` agent (FastAPI, Pydantic, LangGraph) | `solopreneur-core` |
| [`solopreneur-llm`](./plugins/llm) | `llm-dev` agent (LangGraph, agent workflows, tool calling) | `solopreneur-core` |

Installing any stack plugin auto-pulls `solopreneur-core`. Requires Claude Code
**≥ v2.1.110** for plugin dependency resolution.

> **Migrating from v0.2.x?** See [MIGRATION.md](./MIGRATION.md) — the monolithic
> `solopreneur` plugin is gone; you now install one core plugin plus whichever
> stacks you use.

## Install

Add this repo as a marketplace source once, then install the pieces you need:

```bash
# Add the marketplace
claude plugin marketplace add hanamizuki/solopreneur

# Everyone: install core
claude plugin install solopreneur-core@solopreneur

# Then install whichever stacks apply
claude plugin install solopreneur-ios@solopreneur      # auto-pulls core
claude plugin install solopreneur-android@solopreneur
claude plugin install solopreneur-nextjs@solopreneur
claude plugin install solopreneur-python@solopreneur
claude plugin install solopreneur-llm@solopreneur
```

To update later:

```bash
claude plugin marketplace update solopreneur
claude plugin update solopreneur-core        # and any other installed plugins
```

### Quick-start by stack

| If you build… | Install |
|---|---|
| iOS / macOS SwiftUI apps | `solopreneur-core` + `solopreneur-ios` |
| Android / Kotlin apps | `solopreneur-core` + `solopreneur-android` |
| Next.js / React web apps | `solopreneur-core` + `solopreneur-nextjs` |
| FastAPI / Python services | `solopreneur-core` + `solopreneur-python` |
| LangGraph / AI agents | `solopreneur-core` + `solopreneur-llm` |
| Nothing but want the GTM / writing / review loops | `solopreneur-core` alone |

## What's in `solopreneur-core`

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

### Your Virtual GTM Team

| Skill | What it does |
|-------|--------------|
| `/gtm` | **Strategist.** Generates a complete Go-To-Market strategy — analyzes the codebase, interviews you across multiple sessions, and produces 4 strategy docs (brand, market landscape, messaging, channel playbook). Supports weekly incremental updates |
| `/naming` | **Brand Namer.** Generates product or company names through structured brief, multi-model candidate generation, and two-layer evaluation — supports greenfield and rebrand modes. Grounded in Lexicon / Interbrand / Siegel+Gale methodology plus processing fluency, sound symbolism, and iconicity research. Auto-reuses `docs/gtm/` if present |
| `/humanly` | **Editor.** Removes AI writing patterns from text — 36 pattern categories, 3-tier word tables, severity-based audit (P0/P1/P2), with English and Traditional Chinese support |
| `/x-writing` | **Writing Coach.** X/Twitter writing coach — helps with single tweets, threads, and long-form posts. Generates hooks, suggests topics, reviews drafts, and explains craft principles grounded in Aesthetic Writing, RARE hooks, and the algorithmic reality of X |
| `/x-growth` | **X Growth Consultant.** Diagnoses X/Twitter profiles, co-creates personalized 12-week growth plans — covers algorithm mechanics, content strategy, engagement tactics, monetization, and Dream 100 outreach. Integrates with GTM docs |
| `/linkedin-growth` | **LinkedIn Growth Consultant.** Diagnoses LinkedIn profiles, co-creates personalized 90-day growth plans — covers algorithm mechanics, content pillars, engagement engine, audience strategy, and KPI tracking. Integrates with GTM docs |
| `/slide-design` | **Presentation Designer.** Wraps `frontend-slides` or `revealjs` with a brand setup phase — bakes brand colors, typography, and assets in from slide 1. Includes projection-optimized typography scale, Phosphor SVG icon sprite, layered backdrop system, keyboard-driven reveal patterns, 13 reusable layout components, and AI-slop review via `/humanly` (English + Chinese) |

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
| `/rebuild-skill-index` | Generates per-platform extended indexes of every relevant skill installed on this machine. Feeds `ios-dev` and `designer` extended discovery. Run after installing/removing platform skills. |

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

## Stack plugins — the platform experts

Each stack plugin is a focused subagent that `/preflight`, `/specialist-review`,
and `/todos-review` dispatch when they detect that stack in your diff. Each
agent's system prompt embeds a hand-curated skill list plus instructions to
consult an auto-generated extended index of every platform-relevant skill
installed on the machine.

- **`solopreneur-ios`** → `ios-dev` agent. Uses Axiom (200+ skills) plus a
  curated list of iOS-specific skills. Ships with the `ios-patterns` skill
  (SwiftUI conventions: i18n, date parsing, Previews, state management, sheet
  & navigation, list spacing, expandable animation, keyboard Done button).
  Extended index at `<config>/solopreneur/skill-index/ios.md`, rebuild with
  `/rebuild-skill-index`.

- **`solopreneur-android`** → `android-dev` agent. Curated list drawn from
  `android/skills` and `gplay-cli-skills`. Ships with the `android-patterns`
  skill (Jetpack Compose patterns: `@Preview` setup, Scaffold + bottom nav,
  ModalBottomSheet nested scroll, ripple clipping, SwipeToDismissBox
  transparency, locale-aware date formatting including MIUI quirks).

- **`solopreneur-nextjs`** → `nextjs-dev` agent. Covers React, Next.js App
  Router, TypeScript, and general frontend patterns (single agent absorbs the
  previous `web-dev` role — see MIGRATION.md if you're coming from v0.2.x).

- **`solopreneur-python`** → `python-dev` agent. FastAPI + Pydantic, LangGraph,
  Neo4j, async/await, pytest.

- **`solopreneur-llm`** → `llm-dev` agent. LangGraph (StateGraph, prebuilt
  agents, Supervisor/Swarm), LangChain, streaming patterns, tool calling.

The `designer` agent ships in `solopreneur-core` because design work spans
web, iOS, and Android.

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

| Source | Type | Used by | Purpose |
|--------|------|---------|---------|
| [impeccable](https://github.com/pbakaus/impeccable) | Skill | `designer` agent | `teach-impeccable` — one-time interview that writes persistent project design guidelines |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) | Skills | `designer` agent | `taste-*` archetype family (soft / brutalist / minimalist / redesign / stitch / output) — overrides default LLM design biases |
| [frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design) | Plugin | `designer` agent | Creative, polished frontend code generation that avoids generic AI aesthetics |
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Plugin | `designer` agent | UI/UX intelligence library — styles, palettes, font pairings, product types, UX guidelines, chart types across 10 stacks |

User-level skills and the above plugins are auto-classified into the design
extended index by `/rebuild-skill-index`.

### Presentations

| Source | Type | Used by | Purpose |
|--------|------|---------|---------|
| [frontend-slides](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-slides) | Plugin | `/slide-design` | Single-HTML, animation-rich slide engine (recommended) |
| [revealjs](https://github.com/anthropics/claude-code/tree/main/plugins/revealjs) | Plugin | `/slide-design` | Reveal.js-based slides — fragments, vertical stacks, speaker notes, Chart.js |

## CLI Tools

| Tool | Required? | Used by |
|------|-----------|---------|
| `git` | Required | All skills |
| `gh` (GitHub CLI) | Required | `/greenlight`, `/autopilot`, `/post-mortem` |
| `jq` | Required | `/greenlight` |
| `codex` (Codex CLI) | Optional | `/greenlight`, `/second-opinion` |

## License

MIT
