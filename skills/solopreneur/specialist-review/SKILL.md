---
name: specialist-review
description: |
  Tech-stack-aware expert code review using specialized subagents. Detects which
  tech stacks are in the diff, then dispatches the matching specialist agents
  (ios-dev, android-dev, ai-engineer, neo4j-dev) to review against
  their skill-index best practices. Use when the user says "specialist review",
  "expert review", "stack review", or wants a multi-perspective code review
  with best practice verification. Also use after completing a significant
  implementation when thorough review is needed.
---

# Specialist Code Review

Dispatch specialized subagents to review code changes against their domain-specific
best practices (skill indices).

## Step 1: Determine Review Scope

Detect the review scope automatically, in this priority order:

1. **User specified a PR number or URL** → use that PR's diff
2. **Current branch has an open PR** → `gh pr diff`
3. **Current branch is not main/master** → `git diff main...HEAD`
4. **Uncommitted changes exist** → `git diff HEAD` (staged + unstaged; plain
   `git diff` misses anything already staged)
5. **None of the above** → ask the user what to review

Run these checks:
```bash
git branch --show-current
gh pr list --head $(git branch --show-current) --json number,url --jq '.[0]'
git status -s
```

Once scope is determined, get the full diff and save it to a variable for the subagents.

## Step 2: Identify Tech Stacks from Diff

Read the full diff and identify which tech stacks are involved based on file paths and content:

| Signal | Tech Stack | Subagent |
|--------|-----------|----------|
| `*.swift`, `*.xib`, `ios/`, SwiftUI/UIKit imports | iOS | `ios-dev` |
| `*.kt`, `*.kts`, `android/`, Compose/Room imports | Android | `android-dev` |
| LangChain/LangGraph/OpenAI/Anthropic imports | LLM/AI | `ai-engineer` |
| `*.cypher`, Neo4j driver imports, graph schema | Neo4j | `neo4j-dev` |
| `*.py`, FastAPI/Flask/Django imports | Python Backend | `general-purpose` |
| `*.ts`, `*.tsx`, `*.jsx`, React/Next.js imports | Web Frontend | `general-purpose` |
| `docs/gtm/`, `BRAND.md`, marketing copy | Marketing / Brand | `marketer` |
| `*.css`, `*.scss`, design system files | Design | `designer` |

List all detected stacks and which subagents will be dispatched. If only one stack
is detected, dispatch one agent. If multiple, dispatch them **in parallel**.

On Codex the last two rows never resolve to their agent — `marketer` and
`designer` publish no Codex package — and `general-purpose` has no Codex
equivalent. All three fall through the ladder in Step 2.25 to the built-in
`explorer`.

Also extract the key libraries/frameworks used in the diff (e.g., `jetpack compose`,
`swiftui`, `langgraph`, `react`, `room`, `fastapi`). These will be passed to subagents
for documentation lookup.

## Step 2.25: Pick a Reviewer for Each Stack

Each specialist agent ships as its own sub-plugin (`ios-dev`,
`android-dev`, `ai-engineer`, `neo4j-dev`). Users may have
only installed `solopreneur` (the core plugin), and on Codex none of the four
agents exist yet — only their knowledge skills are published.

For each stack detected in Step 2, take the first rung that works. This is the
ladder [`plan-review`](../plan-review/SKILL.md#host-profiles) already uses;
don't invent another one.

1. **The matching specialist agent** — dispatch it directly.
2. **A generic reviewer subagent** — `general-purpose` on Claude Code, the
   built-in `explorer` on Codex. The `general-purpose` rows of the Step 2 table
   start here.
3. **Inline** — when spawning is unavailable or rejected at the current
   subagent depth, review that stack yourself in this thread.

Rungs 2 and 3 are degradations, and that stack's section opens with the matching
banner, substituting `<plugin>` with the agent / plugin name for that stack (the
agent and plugin share the same name).

Rung 2:

> ⚠️ Specialist agent `<plugin>` unavailable. Reviewed by a generic reviewer
> against the installed `<plugin>` skills.

Rung 3:

> ⚠️ Specialist agent `<plugin>` unavailable and no subagent could be spawned.
> Reviewed inline with generic expertise.

The rung-2 banner is written by the reviewer itself — it is in the Step 3 output
format — so keep it when you paste the report in. The rung-3 banner is yours to
write, since nobody else was there to write it.

Report the rung you actually used, and **never narrate a dispatch that did not
happen**. Any other dispatch error (crash, timeout, tool failure) → surface it
to the user; do not silently fall back.

Do **not** pre-check the plugin cache path to decide the rung — the cache
layout depends on the local marketplace name the user chose, and the dispatch
error is the authoritative signal.

## Step 2.5: Check context7 Availability

Check whether this session exposes the context7 MCP tools — `resolve-library-id`
and `query-docs`. Enumerate tools however this host does it; each host prefixes
MCP tool names its own way (`mcp__context7__resolve-library-id` on Claude Code).
A call that fails because the tool does not exist counts as unavailable.

- **Available**: Note this for Step 3. Each subagent will query context7 for the
  technologies it's reviewing.
- **Not available**: Display a one-line notice:
  > context7 MCP not installed. With context7, review subagents can automatically
  > query the latest official docs for improved review quality.

  Then proceed normally without context7 steps.

## Step 3: Dispatch Subagents

For each detected tech stack, spawn the reviewer Step 2.25 picked, **in
parallel**, with this prompt template.

On Codex that is one `spawn_agent` call per stack. `fork_turns="none"` is
required — a named agent inheriting full parent history is rejected, and a
reviewer that inherits your framing is not an independent read. Set
`agent_type="explorer"` for its analysis-shaped persona, but do not mistake it
for a boundary: a child spawned with it records `agent_role: explorer` and still
writes files. The role selects an instruction set, not a permission profile —
`spawn_agent` takes no sandbox argument and the child inherits the parent's
tools. So the "do NOT modify any files" line below is an instruction; the only
enforcement available is starting the session itself with
`--sandbox read-only`.

If context7 is **available** (from Step 2.5), include the `[CONTEXT7 BLOCK]` below.
If **not available**, omit it entirely.

```
You are an expert reviewer. Do NOT modify any files. Only analyze and report.

## Task

1. Discover the skills for your domain:
   - **If you have a specialist system prompt** (`agents/<platform>-dev.md`): it
     lists curated skills and points to the extended skill index. Follow it.
   - **If you don't** (you are a generic reviewer): resolve the plugin's
     *enabled* install, then pick the 3-5 skills whose names match the diff.
     Ask the host which install is active instead of guessing — on Codex,
     `codex plugin list --json` reports `marketplaceName` and `version` per
     enabled plugin, giving one exact path:
     `"${CODEX_HOME:-$HOME/.codex}"/plugins/cache/<marketplaceName>/<plugin>/<version>/skills/`.
     With no such listing, glob `.../plugins/cache/*/<plugin>/*/skills/*/` and
     take the highest semver: both the marketplace name and the version are
     the user's, several versions of one plugin do coexist in a cache, and
     reviewing against a stale copy is worse than finding nothing. Nothing
     there means the plugin is not installed — say so and review with your
     own expertise.
   Report the absolute path of every SKILL.md you actually read.

2. From the diff below, identify which specific technologies and APIs are used
   (e.g., "Jetpack Compose remember", "LazyColumn key", "SwiftData @Model",
   "React useEffect")

[CONTEXT7 BLOCK — include only when context7 is available]
3. Query official documentation for the key technologies found in step 2:
   - For each major library/framework (e.g., "jetpack compose", "swiftui",
     "langgraph", "react"):
     a. Call `mcp__context7__resolve-library-id` with the library name to get its ID
     b. Call `mcp__context7__query-docs` with the resolved ID and a topic relevant
        to what the diff touches (e.g., if diff uses LazyColumn → query
        "LazyColumn performance best practices")
   - Focus on 2-3 most important libraries, not every dependency
   - Use the retrieved documentation as an additional reference when reviewing
[END CONTEXT7 BLOCK]

4. Scan whatever step 1 gave you — the curated list plus extended index, or the
   plugin cache listing — for TWO categories of relevant skills:
   a. **Technology-specific skills**: skills matching the APIs/frameworks used
   b. **Cross-cutting skills**: performance, architecture, patterns, guidelines
      skills that apply regardless of specific API (e.g., compose performance
      audit, architecture patterns, accessibility, project conventions)

5. For each relevant skill (both categories), read its SKILL.md using the path
   step 1 resolved.

6. Review the diff against each relevant skill's best practices AND context7
   documentation (if queried). For each skill checked, report:
   - Skill name
   - What was checked
   - Conformance: check or warning
   - Specific findings with file:line references

7. Also check for general issues not covered by skills:
   - Security concerns
   - Error handling gaps
   - Performance anti-patterns
   - Naming/style inconsistencies within the diff

## Diff to Review

{paste the full diff here}

## Output Format

### Tech Stack: [platform name]

[If you are not this platform's specialist agent — you had no specialist system
prompt and discovered skills from the plugin cache — open the section with this
line, substituting `<plugin>`. It is the only signal the reader gets that the
named specialist did not run:
> ⚠️ Specialist agent `<plugin>` unavailable. Reviewed by a generic reviewer
> against the installed `<plugin>` skills.

If that discovery turned up nothing — the plugin is not installed — open with
this instead. Do not claim skills you never read:
> ⚠️ Specialist agent `<plugin>` unavailable and no installed `<plugin>` skills
> found. Reviewed with generic expertise.]

#### Skills Checked
| Skill | Aspect | Status | Finding |
|-------|--------|--------|---------|
| skill-name | what was checked | check/warning | details |

Skills read: one absolute SKILL.md path per line.

#### context7 Documentation Consulted
| Library | Topic Queried | Key Insight |
|---------|--------------|-------------|
| library-name | what was queried | relevant finding from docs |

(Omit this table if context7 was not used)

#### General Findings
- [any issues not covered by skills]

#### Summary
[1-2 sentence overall assessment with taste rating]
```

## Step 4: Aggregate and Report

Wait for all subagents to complete, then compile a unified report:

```markdown
## Specialist Review: [branch name or PR title]

### Scope
[what was reviewed: PR #N / branch diff / uncommitted changes]

### Reviews

[per stack: the Step 2.25 degradation banner whenever rung 2 or 3 ran, then that
stack's report pasted verbatim — keep its Skills Checked table and its Skills
read paths; that list is how the user tells a real skill-backed review from a
plausible one. Saying "a generic reviewer ran" in prose is not the banner]

### Cross-Cutting Concerns
[issues that span multiple platforms, if any]

### Verdict
[overall assessment: ready to merge / needs fixes / needs discussion]
[list any blocking issues vs nice-to-haves]
```

## Notes

- If a skill index doesn't exist for a detected stack, the subagent should use
  its built-in expertise instead
- Each subagent should read at most 3-5 most relevant skills (not the entire index)
- On Codex, discovery is the installed plugin cache only — the extended skill
  index (`/rebuild-skill-index`) is a Claude Code path and is not ported
- The subagent prompt includes the full diff so it can reference specific lines
- If the diff is very large (>500 lines), mention this to the user and suggest
  focusing on specific files
