# solopreneur

Building alone doesn't mean building without a team. This Claude Code plugin gives solo founders the workflows of a full engineering org — plan review, code review, automated PR cycles, multi-platform expertise, and even a thinking partner — in one install.

## Install

Not yet on a public marketplace. Install from GitHub:

```bash
# Add this repo as a marketplace source
claude plugin marketplace add hanamizuki/solopreneur

# Install the plugin
claude plugin install solopreneur
```

To update later:

```bash
claude plugin marketplace update solopreneur
claude plugin update solopreneur
```

## Skills

### Your Virtual Product Team

| Role | Skill | What it does |
|------|-------|--------------|
| **Advisor** | `/second-opinion` | Challenges your plan across 5 dimensions (completeness, consistency, clarity, scope, feasibility) using an independent reviewer |
| **Tech Lead** | `/preflight` | Reviews your technical plan against platform-specific best practices before you write a single line of code |
| **Coworker** | `/worktree-handoff` | Creates an isolated git worktree with a CONTEXT.md so the next session picks up exactly where you left off |
| **Code Reviewer** | `/specialist-review` | Detects your tech stack, dispatches matching expert agents, and reviews against best-practice skill indices |
| **SRE** | `/post-mortem` | Traces a bug through git history, finds the root cause commit, produces a structured post-mortem report |
| **Coach** | `/session-retro` | Reviews the current conversation for mistakes, traces root causes, proposes durable process improvements |
| **Thinking Partner** | `/perspective` | Switch between 6 thinker perspectives (Musk, Feynman, Munger, Naval, Jobs, Taleb) to analyze problems from a different angle |

### Your Virtual GTM Team

| Role | Skill | What it does |
|------|-------|--------------|
| **Strategist** | `/gtm` | Generates a complete Go-To-Market strategy — analyzes the codebase, interviews you across multiple sessions, and produces 4 strategy docs (brand, market landscape, messaging, channel playbook). Supports weekly incremental updates |
| **Editor** | `/humanly` | Removes AI writing patterns from text — 36 pattern categories, 3-tier word tables, severity-based audit (P0/P1/P2), with English and Traditional Chinese support |
| **X Growth Consultant** | `/x-growth` | Diagnoses X/Twitter profiles, co-creates personalized 12-week growth plans — covers algorithm mechanics, content strategy, engagement tactics, monetization, and Dream 100 outreach. Integrates with GTM docs |
| **LinkedIn Growth Consultant** | `/linkedin-growth` | Diagnoses LinkedIn profiles, co-creates personalized 90-day growth plans — covers algorithm mechanics, content pillars, engagement engine, audience strategy, and KPI tracking. Integrates with GTM docs |

### Backlog Management

| Role | Skill | What it does |
|------|-------|--------------|
| **Backlog Reviewer** | `/todos-review` | Deep-reviews a single todo/spec for feasibility, best practices, and priority — dispatches platform-specific expert agents and outputs a readiness rating |
| **Backlog Janitor** | `/todos-cleanup` | Batch-scans backlog, matches against git history, moves completed/partial items to done/ or doing/ |

### Automation Pipelines

Start them and walk away — they loop until the job is done.

| Pipeline | Skill | What it does |
|----------|-------|--------------|
| **Auto Build** | `/autopilot` | Splits a large feature into multiple PRs and orchestrates unattended implementation, review, and merge — supports scheduling for off-hours execution |
| **Code Review Loop** | `/greenlight` | Triggers external reviewers (Codex, Gemini, CodeRabbit), fixes issues, re-triggers — loops until the PR is clean |
| **Backlog Monitor** | `/todos-babysit` | Scans backlog and in-progress todos, cross-references PR status, reviews new items, and maintains worktrees. **Interactive mode**: presents a confirmation checkpoint before acting. **Loop mode** (`/loop 24h /todos-babysit`): auto-executes safe operations and auto-implements bug fixes that pass the readiness gate — notifies only for items that need human judgment |

### How Skills Work Together

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

## Agents

Platform-specific development experts used by `/preflight`, `/specialist-review`, and `/todos-review`. Each agent's system prompt embeds a hand-curated list of recommended skills, plus instructions to consult an auto-generated extended index of every relevant skill installed on the machine.

| Agent | Platform | Curated + Extended Index |
|-------|----------|--------------------------|
| `ios-dev` | iOS/macOS SwiftUI | Curated list of ~20 user + Axiom skills; extended index at `~/.claude/solopreneur/skill-index/ios.md` (rebuild with `/rebuild-skill-index`) |
| `android-dev` | Android/Kotlin | Curated list (extended index coming in a later release) |
| `web-dev` | React/frontend | Curated list (extended index coming in a later release) |
| `nextjs-dev` | Next.js/React | Same as web-dev, specialized for Next.js projects |
| `python-dev` | Python/FastAPI | Curated list (extended index coming in a later release) |
| `llm-dev` | LLM/LangGraph | Curated list (extended index coming in a later release) |

## Ecosystem

This plugin integrates with tools across the Claude Code ecosystem. All integrations are optional and degrade gracefully — the plugin works with just `git` and `gh`.

### External Code Reviewers

`/greenlight` orchestrates these reviewers with automatic fallback:

| Reviewer | How it works | Setup |
|----------|-------------|-------|
| [Codex GitHub Bot](https://github.com/apps/chatgpt-codex-connector) | Triggers via `@codex review` PR comment | Enable Codex GitHub App on your repo |
| [Codex CLI](https://github.com/openai/codex) | Runs `codex review` locally | `npm i -g @openai/codex && codex login` |
| [Gemini Code Assist](https://github.com/apps/gemini-code-assist) | Triggers via `/gemini review` PR comment | Enable Gemini Code Assist on your repo |
| [CodeRabbit](https://coderabbit.ai) | Auto-triggers on push (passive) | Enable CodeRabbit on your repo |

### MCP Servers

| Server | Used by | Purpose |
|--------|---------|---------|
| [context7](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/context7) | `/preflight`, `/specialist-review` | Fetches current official docs for APIs and frameworks |

### Claude Code Built-in Skills

`/greenlight` uses this built-in skill during internal review:

- `/simplify` — code quality, reuse, efficiency

### Skills from Other Sources

| Source | Skills used | Used by |
|--------|------------|---------|
| [superpowers](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/superpowers) (plugin) | `requesting-code-review`, `receiving-code-review` | `/greenlight`, `/specialist-review` |
| [gstack](https://github.com/gstack-dev/gstack) (user-level skill) | `/review` — SQL safety, trust boundaries, structural issues | `/greenlight` |

### Third-Party Skill Libraries

The `ios-dev` agent's curated list and extended index pull from these sources. Install them for deeper platform expertise:

| Source | Platform | Skills |
|--------|----------|--------|
| [Axiom](https://github.com/CharlesWiltgen/Axiom) | iOS/macOS | 100+ skills covering SwiftUI, SwiftData, concurrency, networking, testing, App Store, camera, system integration, AI, graphics |
| User-level skills (`~/.claude/skills/`) | iOS (v1) | Your own project-specific patterns and conventions — auto-classified into the iOS extended index by `/rebuild-skill-index` (other platforms TBD) |

### CLI Tools

| Tool | Required? | Used by |
|------|-----------|---------|
| `git` | Required | All skills |
| `gh` (GitHub CLI) | Required | `/greenlight`, `/autopilot`, `/post-mortem` |
| `jq` | Required | `/greenlight` |
| `codex` (Codex CLI) | Optional | `/greenlight`, `/second-opinion` |

## License

MIT
