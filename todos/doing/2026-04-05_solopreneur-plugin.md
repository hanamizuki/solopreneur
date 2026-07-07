# Solopreneur Plugin Plan

A Claude Code plugin packaging skills and agents for solopreneurs — ship, review, debug, and market your product with AI.

## Plugin Metadata

- Name: `solopreneur`
- Version: `0.1.0`
- License: MIT
- Repo: `https://github.com/hanamizuki/solopreneur`

## Directory Structure

```
solopreneur/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── agent-skill-index/        # Internal skill — not user-invocable
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── ios.md            # iOS skill routing table
│   │       ├── android.md        # Android skill routing table
│   │       ├── web.md            # Web/Next.js skill routing table
│   │       ├── python.md         # Python skill routing table
│   │       └── llm.md            # LLM/LangGraph skill routing table
│   ├── post-mortem/              # ✅ Done (fixed stray Chinese char L102)
│   ├── preflight/                # ✅ Done (fallback logic added, context7 optional)
│   ├── second-opinion/           # ✅ Done (translated from adversarial-review, Codex fallback added)
│   ├── autopilot/                # ✅ Done (translated from auto-pilot-setup, 4 files incl. references/)
│   ├── greenlight/               # ✅ Done (translated from auto-review, config → solopreneur.json)
│   ├── browser-extension/
│   ├── contribute/
│   ├── contribute-triage/
│   ├── video-to-web/
│   ├── merge-pr/
│   ├── worktree-handoff/          # ✅ Done (translated from open-worktree, generalized config copy)
│   ├── session-retro/            # ✅ Done (ported, English triggers, disable-model-invocation removed)
│   ├── specialist-review/         # ✅ Done (translated from review-experts, plugin skill index path added)
│   ├── review-todos/
│   ├── pr-test-plan/
│   ├── ios-best-practices/       # Renamed from legacy ios-patterns-hana
│   ├── android-best-practices/   # Renamed from legacy android-patterns-hana
│   ├── meta-reviewer/
│   ├── x-reviewer/
│   ├── pencil-design/            # Requires Pencil MCP (noted in description)
│   ├── app-demo-video/           # Renamed from remotion-app-video
│   ├── phone-mockup-video/       # Renamed from remotion-phone-mockup
│   ├── supabase-ops/
│   └── openclaw-skill-creator/
├── agents/
│   ├── ios-dev.md
│   ├── android-dev.md
│   ├── web-dev.md
│   ├── nextjs-dev.md
│   ├── python-dev.md
│   └── llm-dev.md
└── LICENSE                       # MIT
```

## Rename Mapping

| # | Source (`~/.claude/skills/`) | Plugin name |
|---|----------------------------|-------------|
| 1 | `adversarial-review` | `second-opinion` |
| 2 | `auto-pilot-setup` | `autopilot` |
| 3 | `auto-review` | `greenlight` |
| 4 | `build-browser-extension` | `browser-extension` |
| 5 | `contrib-create` | `contribute` |
| 6 | `contrib-triage` | `contribute-triage` |
| 7 | `convert-video-for-web` | `video-to-web` |
| 8 | `merge-pr` | `merge-pr` |
| 9 | `open-worktree` | `worktree-handoff` |
| 10 | `post-mortem` | `post-mortem` |
| 11 | `preflight` | `preflight` |
| 12 | `session-retro` | `session-retro` |
| 13 | `review-experts` | `specialist-review` |
| 14 | `review-todo` | `review-todos` |
| 15 | `update-pr-test-plan` | `pr-test-plan` |
| 16 | legacy `ios-patterns-hana` | `ios-best-practices` |
| 17 | legacy `android-patterns-hana` | `android-best-practices` |
| 18 | `meta-content-reviewer` | `meta-reviewer` |
| 19 | `x-content-reviewer` | `x-reviewer` |
| 20 | `pencil-design` | `pencil-design` |
| 21 | `remotion-app-video` | `app-demo-video` |
| 22 | `remotion-phone-mockup` | `phone-mockup-video` |
| 23 | `supabase-ops` | `supabase-ops` |
| 24 | `openclaw-skill-creator` | `openclaw-skill-creator` |

## Key Design Decisions

### Skill Index Architecture

Each agent has a platform-specific skill index file stored under one internal skill:

```
skills/agent-skill-index/
├── SKILL.md
└── references/
    ├── ios.md
    ├── android.md
    ├── web.md
    ├── python.md
    └── llm.md
```

**Tested limitation**: Agent `skills:` frontmatter cannot resolve plugin-internal
skills. `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_ROOT}` are not available in
agent `.md` files.

**Solution**: Agents use Glob with explicit path to find their index file at runtime:

```
1. Glob `**/solopreneur/*/skills/agent-skill-index/references/{platform}.md`
   with path `~/.claude/plugins/cache`
2. Fallback: try `~/.claude/skills/{platform}-skill-index.md` (legacy local path)
3. If neither found: use context7 for documentation lookup directly
```

This was verified working — Glob can search `~/.claude/plugins/cache` and find
files inside installed plugins despite the version/hash in the path.

### Graceful Degradation for External Dependencies

Skill indexes may reference skills from external plugins (e.g., Axiom). The approach:

- Index files mark external skills as "Optional" with the plugin name
- Agents try to read each referenced SKILL.md
- If the file doesn't exist (plugin not installed) → skip and use context7 as fallback
- Never error out because a skill is missing

### Agent Limitations in Plugins (tested)

- `skills:` frontmatter does NOT resolve to plugin-internal skills
- `mcpServers` is NOT supported for plugin agents (security restriction).
  Workaround: agents check if context7 tools are available at runtime;
  if not, skip doc lookup. Users who have context7 installed globally get
  the full experience automatically.
- `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PLUGIN_ROOT}` do NOT work in agent `.md` files
- Glob with explicit path to `~/.claude/plugins/cache` DOES work

### Namespace

Plugin skills are invoked as `/solopreneur:skill-name`. No way to avoid the namespace prefix for plugin skills (this is a Claude Code design constraint).

Local workaround: TBD (symlinks, or accept the namespace).

### User Configuration (future — batch 2)

Skills like `check-ec2` and `ec2-cicd` need user-specific values (server IP, SSH key path). These will use `plugin.json`'s `userConfig` field:

```json
{
  "userConfig": {
    "ec2_host": { "description": "EC2 server IP", "sensitive": false },
    "ssh_key_path": { "description": "Path to SSH key", "sensitive": true }
  }
}
```

Values accessed via `$CLAUDE_PLUGIN_OPTION_<key>` environment variables in Bash commands.

## Porting Checklist (per skill)

Each skill being ported needs:

1. [ ] Content converted to English (open source)
2. [ ] Personal info removed (IPs, key paths, personal names)
3. [ ] Chinese-only trigger words removed from description (keep English triggers)
4. [ ] Name updated if needed (per rename table)
5. [ ] Dependencies noted in description (e.g., "Requires Pencil MCP")
6. [ ] Fix broken YAML frontmatter if present (known issues: `build-browser-extension`, `remotion-app-video`)
7. [ ] Update skills that reference custom subagents to include fallback logic (preferred subagent → general-purpose)
8. [ ] Tested via `claude --plugin-dir`

## Implementation Progress

### Phase 1 — Dogfooding Release (6 skills + 6 agents)

Goal: maintainers can install the plugin, delete local copies of these skills, and use plugin versions.

**Sub-phase A — Foundation (✅ complete 2026-04-05)**
- [x] post-mortem: fixed stray Chinese char on L102
- [x] preflight: added subagent fallback logic, made context7 optional
- [x] session-retro: ported from source, English triggers, removed `disable-model-invocation`
- [x] second-opinion: translated from adversarial-review, added Codex CLI fallback (Path B subagent)
- [x] Verified: `claude --plugin-dir` loads all 4 skills, manual invocation works
- [x] Verified: `disable-model-invocation: true` makes plugin skills completely invisible (not just hidden from auto-list) — removed from session-retro
- [x] Verified: cross-skill invocation works with bare names in plugins; local skills take priority over plugin skills when names collide
- [x] Added `cc-solo` shell alias for dev

**Sub-phase B — Agents + skill index (pending)**
- [ ] Build agent-skill-index (ios/android/web/python/llm)
- [ ] Port 6 agents (translate + Glob discovery + context7 fallback)
- [ ] Test agent dispatch via plugin

**Sub-phase C — Heavy skills (✅ complete 2026-04-06)**
- [x] Port greenlight (461 lines translated from auto-review, config unified to ~/.claude/solopreneur.json)
- [x] Port autopilot (603 lines translated from auto-pilot-setup, 4 files incl. references/)
- [x] Updated all cross-references: auto-review → greenlight, auto-pilot → autopilot
- [ ] End-to-end dogfooding test (pending — user to test in next session)

### Batch 1 — Full Release (24 skills + 6 agents)

Skills listed above. All agents converted to English with skill index fallback.

## Batch 2 — Future

- `check-ec2` — needs userConfig for server IP / SSH key
- `ec2-cicd` — same
- `deploy-to-device` — needs review for generality
- `check-traces` — generalize to support multiple tracing tools
- `comet-debug` — specific browser dependency
- `sync-design-tokens` — needs review
- `langgraph` — merged into llm-dev agent as reference

## Pre-release TODOs

- [ ] Write README.md (installation, usage, skill list)
- [ ] Write CHANGELOG.md

## Resolved Questions

1. **Namespace**: Accept `/solopreneur:` prefix. Dev workaround: `cc-solo` alias.
2. **`openclaw-skill-creator`**: Keep in batch 1 but note in description that it's a Claude Code skill for writing OpenClaw skills (not an OpenClaw-specific tool). Move to batch 2 if scope is too large.
3. **`disable-model-invocation` in plugins**: Unlike local skills, this flag makes plugin skills completely inaccessible (not just hidden from auto-list). Don't use it for user-invocable plugin skills.
4. **Cross-skill invocation**: Bare names (e.g., `/auto-review`) resolve correctly within plugins. Local skills take priority when names collide — safe for incremental migration.

## Open Questions

1. Repo URL is now resolved: `https://github.com/hanamizuki/solopreneur`
