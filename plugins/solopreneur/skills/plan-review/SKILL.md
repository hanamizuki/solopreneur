---
name: plan-review
description: |
  Vet a spec, implementation plan, or design doc before implementation starts.
  Three stages — technical vetting against the latest official docs and platform
  best practices, a leanness pass that cuts what the plan does not need, and an
  independent outside opinion from a separate model with no conversation context
  — then one shared phase where the user adjudicates every finding and accepted
  ones are written back. Use when the user says "plan review", "plan-review",
  "vet the plan", "challenge this plan", "adversarial review", "best practice
  review", or "sanity check this approach" before writing code. Add the
  `internal` token to skip the external reviewer. Works best with context7 MCP
  and Codex CLI; degrades gracefully without either.
---

# Plan Review

Vet a spec, implementation plan, or design doc before any code is written.
Three stages produce findings; one resolution phase decides what happens to them.

| Stage | Question it answers | Run by `internal`? |
|---|---|---|
| 1. Technical vetting | Does the approach match current official docs and platform best practices? | yes |
| 2. Lean check | What in this plan does not need to exist? | yes |
| 3. Outside opinion | What does a reviewer with zero conversation context see? | **no** |
| Resolution | Which findings do we act on, and write them back | **findings reported only** |

**Every stage reads the original document, and no stage writes anything.**
Findings stay informational until the user approves them one by one in
resolution — that is the only phase that touches the plan.

## Arguments

| Argument | Description | Example |
|---|---|---|
| `<file>` | **Optional.** Path to the document under review | `/plan-review todos/backlog/foo.md` |
| `internal` | Stages 1 + 2 only. No external reviewer, no adjudication, no write-back — findings are reported as-is | `/plan-review internal` |

**Parsing rules** (same shape as the argument parsing in `../greenlight/SKILL.md`):

- Arguments are whitespace-delimited tokens, **unordered**.
- `internal` matches a **whole** token, case-insensitively — never a substring,
  so a path that happens to contain the word does not enable the mode.
- No `mode=` prefix: the bare keyword is the whole contract.
- Everything left after the keyword is stripped is the file path. An empty
  remainder means no file, which is legal — see Step 0.

`internal` is what unattended callers pass. `/autopilot`'s PR subagent and
`/todos-babysit` both run it on every item, where stage 3's per-run cost would
repeat once per PR. **No mode skips stage 2** — it runs inline, costs nothing
beyond this session, and an unattended run is exactly where nobody is watching
for an over-built plan.

## Step 0: Get the document

- A file path was given → read it.
- No path, but the plan is already in the conversation → use that. **This is a
  normal path, not a degraded one**: both machine callers hand over a plan that
  was just written in conversation and never saved to disk.
- Neither → ask: "Please give me the plan file path, or paste the plan here."

Note whether the document has a file path. No path means there is nothing to
write back to, so resolution reports the accepted findings to the caller instead.

---

## Stage 1: Technical vetting

Does the plan follow the latest official docs and platform best practices?

### 1a. Detect the tech stack

Match keywords in the document to subagents and context7 query targets:

| Keywords | Platform | Subagent | context7 Query Targets |
|----------|----------|----------|----------------------|
| Swift, SwiftUI, @Observable, SwiftData, iOS | iOS | `ios-dev` | SwiftUI, Swift concurrency, relevant Apple frameworks |
| Kotlin, Compose, Room, ViewModel, Android | Android | `android-dev` | Jetpack Compose, Kotlin Coroutines, relevant Jetpack libraries |
| LangGraph, prompt, agent, tool calling, streaming, RAG, embedding, chain, node, state graph, LLM | Backend (LLM) | `ai-engineer` | LangGraph, LangChain |
| Cypher, Neo4j, graph schema, neo4j driver | Graph DB | `neo4j-dev` | Neo4j, Cypher |
| React, Next.js, TypeScript, TSX | Web | `general-purpose` | React, Next.js |
| FastAPI, Python, Pydantic, CRUD, REST API | Backend (general) | `general-purpose` | FastAPI, Pydantic |
| GTM, naming, brand, copywriting, social growth, X/LinkedIn | Marketing | `marketer` | brand voice, GTM strategy |
| UI, UX, design system, CSS, Figma, design tokens | Design | `designer` | design systems, accessibility |

Multiple platforms → run 1b + 1c for each.

**No platform matches → stage 1 produces no findings and the review moves on.**
A pure architecture spec with no platform keywords has nothing for a platform
expert to check; that is the expected outcome, not an error. Stages 2 and 3
still run.

### 1b. Query official docs via context7

Look up the **specific APIs or frameworks the document actually names**.

1. `mcp__context7__resolve-library-id` to find library IDs (e.g. "SwiftUI", "Jetpack Compose")
2. `mcp__context7__query-docs` for the specific API usage in the plan (e.g. "SwiftData relationship cascade delete", "Compose LazyColumn performance")
3. At most 2–3 critical API points per platform — don't over-query

**Skip context7 when:** the MCP tools are unavailable in this environment, the
document holds only high-level architecture decisions with no specific API
usage, or the APIs involved are fundamental knowledge. Skipping context7 skips
the doc lookup only — 1c still runs.

### 1c. Dispatch expert subagents

Dispatch the subagents for the detected platforms **in parallel**. If a
platform-specific subagent type is unavailable in this environment, fall back to
`general-purpose` with the same prompt — less specialized, still useful.

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
[paste 1b results, or omit if nothing was queried]

Check the skill index for relevant best practices first, then provide your analysis.
Return analysis only — no code.
```

Keep the results as stage 1 findings. Do not act on them yet.

---

## Stage 2: Lean check

What in this plan does not need to exist? Stage 1 asks whether the approach is
*correct*; this stage asks whether it is *necessary*. The plan's best outcome is
getting shorter.

**Format:** `<location>: <tag> <what>. <replacement>.`
Location is the plan's line number (`L42`) or its section heading
(`§ Migration`) — a markdown document is addressable either way.

**Tags** — the five from ponytail's review vocabulary. Use these; don't invent more:

- `delete:` dead scope, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same outcome, less plan. Show the shorter form.

**Net effect:** the plan describes code that does not exist yet, so `net: -N
lines` is not measurable. Close with the **structural** net instead —
`net: -1 pattern, -1 skill` or `net: -2 files, -1 dependency`.

If there is nothing to cut, say `Lean already.` and move on.

**Boundary:** over-engineering and unnecessary complexity only. Correctness,
security, and feasibility belong to stages 1 and 3 — route them there rather
than restating them here. A single smoke test or self-check is the lean minimum,
not bloat; never flag it for deletion.

**When stage 2 contradicts stage 1** (stage 1 says add a guard, stage 2 says cut
it), apply the existing contradiction rule from `../greenlight/SKILL.md`
(Findings-contradiction handling, row ①): **carry neither into the plan, and
flag the pair** — no-action is the only disposition that negates neither side.
Present both to the user in resolution as one linked item.

---

## Stage 3: Outside opinion

**Skipped entirely when `internal` was passed** — jump to Resolution.

An independent reviewer reads the document fresh with no conversation context.
Primary method is Codex CLI (`codex exec`): a different model with zero shared
context, the most independent read available. Fallback is a subagent — same
model family, but a clean context window still buys an outside perspective.

### 3a. Confirm the cost

Print one line and wait for the user:

> Stage 3 sends the plan to an external reviewer — roughly 240K tokens. Continue,
> or run `internal` to stop after stages 1–2?

This skill triggers on ordinary "vet this plan" requests, so without the
confirmation a routine review could spend 240K tokens the user never asked for.
Unattended callers pass `internal` and never reach this prompt.

### 3b. Identify related files

Scan the document for referenced paths (source files, configs, scripts) so the
reviewer can cross-validate its claims. Collect up to 10 — focus on files the
plan makes specific claims about ("this module reads X", "we'll delete Y",
"Z already handles this"), not every path it mentions.

### 3c. Check reviewer availability

```bash
codex login status 2>&1
```

Available → **Path A**. Not installed or not authenticated → **Path B**.

### Path A: Codex review

Run read-only — the reviewer must not be able to edit the plan it is reviewing:

```bash
cat <<'PROMPT' | timeout 300 codex exec --sandbox read-only - 2>&1
Please perform an adversarial review of this plan: {plan_path}

Also read these related files to cross-validate the plan's assumptions:
{related_files_list}

Challenge the plan across these five dimensions. For each dimension, list specific
findings with file and line number evidence:

1. **Completeness** — Are there missing edge cases, affected files not listed,
   or scenarios not considered?
2. **Consistency** — Are there internal contradictions? Does the plan match
   the actual code and documentation?
3. **Clarity** — Are there vague or ambiguous descriptions? Could an implementer
   start working immediately after reading this?
4. **Scope** — Is there over-engineering or scope creep? Is there a simpler way
   to achieve the same goal?
5. **Feasibility** — Is it technically feasible? Are there unverified assumptions?
   Do the dependencies it relies on actually exist?

Tag each finding with severity:
- RED_CIRCLE Critical — will cause implementation failure if not fixed
- YELLOW_CIRCLE Important — worth fixing but not fatal
- GREEN_CIRCLE Suggestion — nice to have but optional

End with an overall verdict:
- CHECK_MARK Ready to implement
- WARNING Needs revision (list blockers)
- CROSS_MARK Needs rethink (fundamental issues)

Do not modify any files. Review only.
PROMPT
```

When the document has no file path, inline its full text in place of
`{plan_path}` and say so in the prompt. If the output is very long, save it to a
temp file and read the key sections.

### Path B: Subagent review

Dispatch a `general-purpose` subagent with isolation for the same review:

```
You are an independent adversarial reviewer. You have NO context from the parent
conversation — review the files from scratch.

Read this plan file: {plan_path}

Also read these related files to cross-validate: {related_files_list}

Challenge the plan across 5 dimensions:
1. Completeness — missing edge cases, unmentioned affected files, unconsidered scenarios
2. Consistency — internal contradictions, mismatches with actual code/docs
3. Clarity — vague descriptions, ambiguity that would block an implementer
4. Scope — over-engineering, scope creep, simpler alternatives
5. Feasibility — unverified assumptions, missing dependencies, technical blockers

For each finding, cite the specific file and line. Tag severity:
- Critical (blocks implementation)
- Important (should fix)
- Suggestion (optional improvement)

End with a verdict: Ready / Needs revision / Needs rethink.

Do NOT modify any files. Analysis only.
```

---

## Resolution

### R1. Merge the findings (both modes)

Collect every stage into one list, each item labelled with the stage it came
from. Order: critical → important → suggestion, with stage 1's blockers ahead of
stage 2's cuts at equal severity.

Where the external reviewer and your own analysis reached the same finding
independently, note the cross-model consensus — it strengthens the signal, but
the user still decides.

### R2. Flag contradictions (both modes)

Present contradicting findings as one linked item with both sides intact, per
the stage-2 rule above. Never silently pick a side.

### R3. Adjudicate — full mode only

Walk the list with the user: **adopt / skip / discuss** for each finding.
Findings stay informational until the user approves them individually.

### R4. Write back — full mode only

Update the document with the adopted findings only. This is the first and only
write in the whole skill. If there is no file path (the plan came from
conversation), return the adopted findings to the caller and let them revise the
plan.

### `internal` mode ends at R2

Report the merged list and stop. **No adjudication, no write-back** — the caller
(autopilot's PR subagent, todos-babysit) decides what to do with the findings and
adjusts its own plan.

---

## Output format

```
## Plan Review: [document name or one-line summary]

### Stage 1 — Technical vetting
[Stack detected, or "no platform detected". Per platform: what holds ✅,
what's wrong ⚠️, suggested adjustment 🔧. Omit if there are no findings.]

### Stage 2 — Lean check
[One line per finding in tag format, then the structural net. Or "Lean already."]

### Stage 3 — Outside opinion
[Findings by severity + verdict. Omit the whole section in `internal` mode.]

### Contradictions
[Linked pairs, both sides intact. Omit if none.]

### Resolution
[Full mode: the adopt / skip / discuss walkthrough and what was written back.
`internal` mode: "findings only — nothing written".]
```

## Notes

- **Don't overlap with `/todos-review`**: that skill asks "should we build this
  at all" (product decision, priority, readiness); this one asks "is this the
  right way to build it" (technical). A backlog item that has not been green-lit
  yet goes to `/todos-review` first.
- **Don't over-query context7**: only look up APIs the document actually uses.
- **Brevity first**: don't belabor what is fine — findings and adjustments only.
- **Not for code diffs.** This skill reviews plans and specs. For code review use
  `/specialist-review` or `/greenlight`.
- Stage 3 costs ~240K tokens per run — that is what the 3a confirmation protects.
  If `codex exec` fails or times out, report the error and offer to retry with
  fewer related files, or switch to Path B.
