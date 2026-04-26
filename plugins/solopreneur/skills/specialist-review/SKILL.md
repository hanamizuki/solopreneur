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
4. **Uncommitted changes exist** → `git diff` (staged + unstaged)
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

Also extract the key libraries/frameworks used in the diff (e.g., `jetpack compose`,
`swiftui`, `langgraph`, `react`, `room`, `fastapi`). These will be passed to subagents
for documentation lookup.

## Step 2.25: Check Specialist Agent Availability

Each specialist agent ships as its own sub-plugin (`ios-dev`,
`android-dev`, `ai-engineer`, `neo4j-dev`). Users may have
only installed `solopreneur` (the core plugin).

For each agent you plan to dispatch in Step 3, attempt the Agent dispatch
directly. Handle the result:

- **Success** → proceed as normal.
- **Unknown-subagent-type error** (i.e., Claude Code reports the subagent
  type doesn't exist) → still perform the review for that stack, but do it
  **inline** using generic expertise. Prefix that stack's section in the
  final report with the template below, substituting `<agent>` with the
  specific agent name (e.g. `ios-dev`) and `<plugin>` with the matching
  marketplace plugin name (`ios-dev`, `android-dev`,
  `ai-engineer`, `neo4j-dev`):

  > ⚠️ `<agent>` not installed — review done with generic expertise. Install
  > `<plugin>` for deeper, skill-index-backed review.

- **Any other Agent error** (crash, timeout, tool failure) → surface to the
  user; do not silently fall back.

Do **not** pre-check via Glob on the plugin cache path — the cache layout
depends on the local marketplace name the user chose, and the dispatch
error is the authoritative signal.

## Step 2.5: Check context7 Availability

Check if `mcp__context7__resolve-library-id` tool is available (via ToolSearch or by
checking deferred tools list).

- **Available**: Note this for Step 3. Each subagent will query context7 for the
  technologies it's reviewing.
- **Not available**: Display a one-line notice:
  > context7 MCP not installed. With context7, review subagents can automatically
  > query the latest official docs for improved review quality.

  Then proceed normally without context7 steps.

## Step 3: Dispatch Subagents

For each detected tech stack, spawn a subagent **in parallel** with this prompt template.

If context7 is **available** (from Step 2.5), include the `[CONTEXT7 BLOCK]` below.
If **not available**, omit it entirely.

```
You are an expert reviewer. Do NOT modify any files. Only analyze and report.

## Task

1. Your subagent system prompt (`agents/<platform>-dev.md`) lists curated
   skills and points to the extended skill index. Follow those instructions
   to discover relevant skills for your domain.

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

4. Scan the curated list and extended index for TWO categories of relevant skills:
   a. **Technology-specific skills**: skills matching the APIs/frameworks used
   b. **Cross-cutting skills**: performance, architecture, patterns, guidelines
      skills that apply regardless of specific API (e.g., compose performance
      audit, architecture patterns, accessibility, project conventions)

5. For each relevant skill (both categories), read its SKILL.md using the
   resolved path from the curated section or extended index.

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

#### Skills Checked
| Skill | Aspect | Status | Finding |
|-------|--------|--------|---------|
| skill-name | what was checked | check/warning | details |

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

[paste each subagent's report, grouped by platform]

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
- The subagent prompt includes the full diff so it can reference specific lines
- If the diff is very large (>500 lines), mention this to the user and suggest
  focusing on specific files
