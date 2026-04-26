---
name: todos-review
description: |
  Deep-review a single todo or spec file to evaluate problem clarity, solution
  quality, and implementation priority. Dispatches platform-specific expert agents
  for best-practice checks. Use when the user says "review this todo",
  "review todo", "evaluate this spec", provides a todo file path, or wants a
  go/no-go recommendation before implementing a backlog item.
---

# Todos Review

Review a todo or spec file to evaluate problem clarity, solution quality, and
implementation priority. Prevents over-engineering, catches missing cross-platform
work, and surfaces better alternatives before any code is written.

## Config Discovery

Resolve todo directory paths using the same config discovery as other todos-* skills:

1. Check `~/.claude/solopreneur.json` for `todos` key
2. If absent, scan project for todo directories, confirm with user, save to config

See `/todos-cleanup` for the full discovery flow — use the same logic and config format.

## Input

The todo file path comes from:
1. The command argument: `/todos-review todos/backlog/foo.md`
2. The current conversation context (user may have just pasted the path)
3. If unclear, ask the user for the file path

## Review Process

Run these steps in order. Steps 3–5 can be parallelized.

### Step 1: Read the Todo

Read the full todo file. Extract:
- **Core problem**: What user pain or technical debt is this solving?
- **Proposed solution**: What changes are being proposed?
- **Current state described**: What does the todo say about the current code?

### Step 2: Verify Current State (Explore Agent)

Spawn an Explore subagent to read the relevant source files mentioned in the todo:
- Is the current state described in the todo accurate, or has the code changed?
- Has any part of this todo already been implemented? Assess completion as a percentage
- Are there existing patterns the proposed solution might be ignoring?
- Note where implementation diverges from the spec

Report discrepancies between the todo description and actual code.

### Step 2.5: Short-Circuit for Completed Todos

If Step 2 reveals the todo is **>80% implemented**, skip Steps 3–6 and jump to
"Output: Completion Review". A full architectural review is wasted effort on code
that's already written — the user needs a gap analysis, not a design critique.

### Step 3: Detect Tech Stack and Route to Expert Agent

Infer the tech stack from the codebase:

| Detected files | Platform | Subagent |
|---|---|---|
| `.xcodeproj` / `.swift` | iOS/SwiftUI | `ios-dev` |
| `build.gradle` / `.kt` | Android/Kotlin | `android-dev` |
| LangGraph / agent workflow | LLM/AI Agent | `ai-engineer` |
| `*.cypher` / Neo4j driver | Neo4j | `neo4j-dev` |
| `package.json` / `.tsx` / `.jsx` | Web / Next.js | `general-purpose` |
| `pyproject.toml` / FastAPI | Python | `general-purpose` |
| `docs/gtm/` / `BRAND.md` / marketing copy | Marketing | `marketer` |
| `*.css` / `*.scss` / design system files | Design | `designer` |

Cross-platform todo (e.g., iOS + Android) → spawn **two experts** in parallel.
If no platform detected → skip expert review.

**Agent availability:** each stack agent lives in its own sub-plugin
(`ios-dev`, `android-dev`, `ai-engineer`, `neo4j-dev`).
When dispatching in Step 4:

- **Success** → proceed as normal.
- **Unknown-subagent-type error** → do the review inline with generic
  expertise and prepend the stack's output with the template below,
  substituting `<agent>` with the specific agent name (e.g. `ios-dev`) and
  `<plugin>` with the matching marketplace plugin name (`ios-dev`,
  `android-dev`, `ai-engineer`, `neo4j-dev`):

  > ⚠️ `<agent>` not installed — review done with generic expertise. Install
  > `<plugin>` for deeper, skill-index-backed review.

- **Any other Agent error** → surface to the user; do not silently fall back.

### Step 4: Best Practice Check (Expert Subagent)

Spawn the matched subagent(s). Each agent already has access to its platform's
skill index — no reference files needed. Prompt:

```
You are an expert reviewer, not an implementer. Do not write code or modify files.

Review the proposed solution in this todo against platform best practices:
1. Does the approach follow best practices for this platform? If not, what should change?
2. Are there existing codebase patterns the solution should follow? (search to verify)
3. Are there potential pitfalls or easily-missed implementation details?

Todo content:
[paste full todo]

Relevant files:
[list file paths mentioned in the todo]

Consult your skill index for relevant best practices, then provide analysis.
Report only — no code.
```

**Skip condition:** If the todo is trivially simple (< 10 lines of change, no
architectural decisions), skip expert review to save time.

### Step 5: Check Dependencies and Spec Conflicts

- Search `$BACKLOG` and `$DOING` for related open todos that might block or be blocked
- Search `docs/spec/` for specs this todo might contradict
- Check `$DONE` to see if a similar feature was attempted before

### Step 6: Structured Evaluation

Evaluate across these dimensions:

**A. Problem Clarity** — Is the problem clearly defined? Real user pain or hypothetical?

**B. Solution Simplicity** — Is this the simplest path? Could fewer moving parts work?
Could a product/UX change eliminate the need for code?

**C. The "Don't Do It" Option** — Explicitly consider not implementing. What's the
cost of doing nothing?

**D. Cross-Platform Consistency** — If iOS or Android is involved, does the todo
account for both platforms?

**E. Destructiveness** — Low / Medium / High
- Low: UI-only changes, no data structure changes
- Medium: Logic changes, new fields with defaults
- High: Breaking data changes, migration required, removes functionality

**F. Value** — Low / Medium / High
- Who benefits? How many users? Is it blocking other work?

**G. Effort** — S / M / L
- S: < 1 day (~50 lines, one platform)
- M: 1–3 days (both platforms, moderate logic)
- L: > 3 days (migration, multi-screen, new data model)

### Step 7: Output

Choose the output format based on Step 2's findings.

#### Output: Completion Review (>80% implemented)

```markdown
## Todo Review: [filename] — Mostly Implemented

### Completion Status
| Item | Status | Notes |
|------|--------|-------|
| ... | Done/Partial/Missing | ... |

### Spec vs Implementation Gaps
[Differences between todo description and actual code — may be bugs or outdated spec]

### Remaining Work
[Checklist of incomplete items, prioritized]

### Recommendation
[Move to done / convert to checklist / update spec to match implementation]
```

#### Output: Full Review (<80% implemented)

```markdown
## Todo Review: [filename]

### Core Problem
One sentence describing what this todo is really solving.

### Current State Check
[Is the todo's description of current code accurate? What's changed?]

### Solution Assessment
[Is the approach simplest? Are there better alternatives? Is "don't do it" viable?]

### Cross-Platform Consistency
[If applicable: are both iOS/Android covered?]

### Dependencies / Conflicts
[Blocked by other todos? Contradicts existing specs?]

### Ratings
| Dimension | Rating |
|-----------|--------|
| Destructiveness | Low/Medium/High + explanation |
| Value | Low/Medium/High + explanation |
| Effort | S/M/L + explanation |
| Readiness | Auto / Needs Discussion + explanation |

**Readiness criteria** — mark `Auto` only when **all** conditions are met:
1. Todo is a bug fix (not a new feature, refactor, or exploratory task)
2. Effort = S
3. Destructiveness = Low
4. Has clear acceptance criteria (how to verify the fix)
5. Mentions specific files or code paths
6. Solution has no ambiguity (only one reasonable interpretation)

If any condition fails, mark `Needs Discussion` and state which conditions failed.

### Implementation Benefits
[List only applicable items:]
- Bug fix: [what user-visible issue is resolved]
- UX improvement: [what experience improves]
- Performance: [what gets faster]
- Stability / test coverage: [what regressions are prevented]
- Cross-platform parity: [iOS/Android alignment]
- Tech debt cleanup: [what code smell is removed]

### Recommendation
[Do / don't do / modify approach — with the simplest implementation path]
```

## Key Principles

- **Prefer deletion over addition.** If a todo adds logic for an edge case, first
  ask whether the edge case can be eliminated.
- **Flag stale todos.** If the code has changed and the todo's premise is outdated,
  call it out immediately.
- **One problem, one todo.** If a todo solves 3 things, note it should be split.
- **Don't rubber-stamp.** The purpose is to catch mistakes before implementation.
  Be direct about problems.
