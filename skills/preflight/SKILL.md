---
name: preflight
description: |
  Pre-implementation best practice review. Analyzes a technical plan against
  platform-specific best practices before coding begins. Use when the user says
  "preflight", "review the plan", "best practice review", "sanity check this
  approach", or wants to verify a technical plan is sound before implementation.
  Requires context7 MCP server for documentation lookups.
---

# Preflight: Plan Review

Pre-implementation technical plan review. Verify whether the approach follows best
practices and surface potential issues before any code is written.

## Step 1: Get the Plan

**Determine where the plan comes from:**

- If the user provides a file path (e.g., `todos/backlog/xxx.md`, `docs/spec/xxx.md`) → read it
- If the plan was already mentioned in conversation → extract from conversation context
- If unclear → ask: "Please provide the plan file path, or paste the plan content here"

## Step 2: Detect Tech Stack

Identify keywords in the plan and map to subagents and context7 query targets:

| Keywords | Platform | Subagent | context7 Query Targets |
|----------|----------|----------|----------------------|
| Swift, SwiftUI, @Observable, SwiftData, iOS | iOS | `ios-dev` | SwiftUI, Swift concurrency, relevant Apple frameworks |
| Kotlin, Compose, Room, ViewModel, Android | Android | `android-dev` | Jetpack Compose, Kotlin Coroutines, relevant Jetpack libraries |
| React, Next.js, TypeScript, TSX | Web | `nextjs-dev` / `web-dev` | React, Next.js |
| FastAPI, Python, Pydantic, CRUD, REST API | Backend (general) | `python-dev` | FastAPI, Pydantic |
| LangGraph, prompt, agent, tool calling, streaming, RAG, embedding, chain, node, state graph, LLM | Backend (LLM) | `llm-dev` | LangGraph, LangChain |

If multiple platforms are involved → run Step 3 + Step 4 for each.

## Step 3: Query Official Docs via context7

Based on **specific APIs or frameworks mentioned** in the plan, query official documentation.

**Query flow:**
1. Use `mcp__context7__resolve-library-id` to find library IDs (e.g., "SwiftUI", "Jetpack Compose")
2. Use `mcp__context7__query-docs` to look up specific API usage from the plan (e.g., "SwiftData relationship cascade delete", "Compose LazyColumn performance")
3. Query at most 2-3 critical API points per platform — don't over-query

**Skip context7 when:**
- The plan only contains high-level architecture decisions without specific API usage
- The APIs involved are fundamental knowledge that doesn't need doc lookup

## Step 4: Dispatch Subagents for Best Practice Review

Based on detected platforms, dispatch corresponding subagents **in parallel**.

**Subagent prompt template:**

```
You are an expert reviewer, not an implementer. Do not write code or modify any files.

Review the following technical plan and answer three questions:
1. Does the approach follow best practices for this platform? If not, point out
   what's wrong and suggest alternatives.
2. Are there existing codebase patterns to reference? (Search relevant files to confirm)
3. Are there potential pitfalls or common mistakes during implementation?

Plan content:
[paste full plan]

Official docs summary (context7 results):
[paste Step 3 results, or omit if nothing was queried]

Check the skill index for relevant best practices first, then provide your analysis.
Return analysis only — no code.
```

## Step 5: Synthesize Output

Combine subagent results and output in the following format:

---

## Plan Review: [plan name or one-line summary]

### Tech Stack Detected
[List detected platforms and corresponding subagents]

### Best Practice Analysis
[One section per platform, listing: what's good ✅, what's problematic ⚠️, suggested adjustments 🔧]

### Potential Pitfalls
[List implementation details that are easy to miss. Omit this section if there are none.]

### Recommended Adjustments
[If adjustments are needed, give a specific direction for each, described in one sentence]

### Conclusion
[One paragraph: is the approach viable overall? Does it need changes before implementation?]

---

## Important Notes

- **Don't overlap with task review**: task review handles "is this worth doing / is the direction right" — this skill only handles "is the technical approach correct"
- **Don't over-query context7**: only look up APIs that the plan actually uses
- **Brevity first**: don't belabor things that are fine — focus on problems and adjustments
