# solopreneur

A Claude Code plugin for solo developers — ship, review, debug, and think through problems with AI.

## Install

This plugin is not yet on a public marketplace. To install from GitHub directly:

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

### Development Workflow

Skills listed in the order you'd use them during a typical development cycle:

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **second-opinion** | `/second-opinion` | Independent adversarial review of plans and specs using Codex CLI as a second pair of eyes |
| **preflight** | `/preflight` | Reviews a technical plan against platform-specific best practices before you start coding |
| **worktree-handoff** | `/worktree-handoff` | Creates an isolated git worktree with full context so the next session picks up seamlessly |
| **autopilot** | `/autopilot` | Splits a large feature into multiple PRs and orchestrates unattended implementation |
| **specialist-review** | `/specialist-review` | Multi-perspective code review using specialized subagents matched to your tech stack |
| **greenlight** | `/greenlight` | Automated PR review loop — triggers external reviewers, fixes issues, re-triggers until clean |

### Debugging & Retrospective

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **post-mortem** | `/post-mortem` | Traces a bug through git history, finds the root cause commit, produces a structured report |
| **session-retro** | `/session-retro` | Reviews the current conversation for mistakes, traces root causes, proposes process improvements |

### Thinking

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **perspective** | `/perspective` | Switch between six thinker perspectives (Musk, Feynman, Munger, Naval, Jobs, Taleb) to analyze problems |

## Agents

Platform-specific development agents used by skills like `preflight` and `specialist-review`:

- `ios-dev` — iOS/macOS SwiftUI
- `android-dev` — Android/Kotlin Compose
- `web-dev` — React/frontend
- `nextjs-dev` — Next.js/React
- `python-dev` — Python/FastAPI
- `llm-dev` — LLM/LangGraph

## License

MIT
