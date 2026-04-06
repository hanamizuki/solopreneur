---
name: session-retro
description: |
  Session retrospective — reviews the current conversation to find mistakes,
  trace root causes, and propose process improvements. Use when the user says
  "session retro", "retrospective", "retro", or "review this session" at the end
  of a work session. Also useful mid-session after a correction to immediately
  analyze what went wrong.
---

# Session Retro

A session retrospective that turns conversation mistakes into durable process improvements,
and successful patterns into reusable skills.

## Why this matters

Without retro, the same mistakes repeat across sessions — Claude gets corrected, apologizes,
and forgets by next conversation. Retro breaks this cycle by tracing errors to their source
(a skill, CLAUDE.md, memory, or tool behavior) and proposing concrete fixes that persist.

## Process

```
1. Scan conversation for correction signals
2. Classify: errors found → Path A | smooth session → Path B
3. For each finding: analyze → attribute → propose action
4. Present report with action proposals
5. Ask user which actions to execute
6. Ask user if they want to save the report
```

### Step 1: Scan for Correction Signals

Search the conversation for moments where the user corrected or redirected Claude's behavior.

**Correction signal patterns** (not exhaustive — use judgment):
- Direct corrections: "wrong", "no", "that's not right", "incorrect"
- Redirections: "shouldn't it be...", "why did you use X instead of Y", "you missed..."
- Repeated instructions: user restating something they already said
- Frustration cues: "wrong again", "still failing", "I already said..."
- Questions challenging behavior: "why", "which process did you follow", "the skill says..."
- Explicit review requests: "review the session log", "trace what happened..."

Also scan for **silent corrections** — places where the user quietly fixed something
Claude should have done (e.g., user manually ran a command Claude skipped).

### Step 2: Classify the Session

- **Errors found** → Path A (analyze each error)
- **No errors found** → Path B (extract successful patterns)
- **Mixed** → Do both Path A and Path B

### Path A: Error Analysis

For each correction found, build a root cause analysis:

#### 2a. What happened?

State factually: what did Claude do, and what should it have done?
No defensiveness, no hedging. Just the facts.

#### 2b. Trace the source

Identify which document or mechanism should have guided the correct behavior:

| Source type | How to check |
|---|---|
| **Skill** | Was a skill invoked? Read the skill — does it clearly cover this case? |
| **CLAUDE.md** | Does project or global CLAUDE.md have instructions for this? |
| **Memory** | Is there a relevant memory file that should have applied? |
| **Tool behavior** | Was a tool used incorrectly, or was the wrong tool chosen? |
| **No source** | No existing document covers this case |

Read the actual source file to verify — don't rely on memory of what it says.

#### 2c. Attribute the cause

Determine which category the error falls into:

1. **Source is unclear** — The document exists but is ambiguous or poorly structured,
   making it easy to misinterpret. (Example: a default rule buried in an "override" subsection)

2. **Source is missing** — No document covers this scenario. Claude had to improvise
   and guessed wrong.

3. **Execution drift** — The document is clear, but Claude didn't follow it.
   This happens when instructions are long or when shortcuts seem reasonable in context.

4. **One-off mistake** — A simple slip (wrong file path, typo, etc.) with no systemic cause.

#### 2d. Propose action

Based on the attribution:

| Attribution | Proposed action |
|---|---|
| Source unclear | **Update the source** — rewrite the ambiguous section with clearer structure |
| Source missing | **Create source** — new skill, memory, or CLAUDE.md section |
| Execution drift | **Save feedback memory** — a concise rule that catches attention on future reads |
| One-off mistake | **No action needed** — note it but don't over-engineer a fix |

For each action, specify:
- Which file to modify (exact path)
- What to change (before/after or description)
- Why this fix prevents recurrence

### Path B: Success Pattern Extraction

When the session went smoothly, look for patterns worth preserving:

1. **Multi-step workflows** that succeeded — could they become a skill?
2. **Novel tool combinations** — a sequence of tools that solved a problem efficiently
3. **Decisions that avoided problems** — defensive choices that paid off
4. **Reusable subagent prompts** — agent dispatches that returned good results

For each pattern, assess:
- **Frequency**: Will this come up again? (one-off → skip; recurring → extract)
- **Complexity**: Is it complex enough that a skill adds value? (trivial → skip)
- **Brittleness**: Would the pattern break without the skill guiding it? (fragile → extract)

Only propose extraction for patterns scoring high on at least 2 of 3 criteria.

## Report Format

Present the report directly in conversation (not as a file):

```markdown
# Retro: YYYY-MM-DD

## Findings

### 1. [Short title of error or pattern]
- **What happened**: [factual description]
- **Root cause**: [source file path + specific section, or "no source"]
- **Attribution**: source unclear / source missing / execution drift / one-off
- **Proposed action**: [action type] — [brief description]
- **Details**: [what specifically to change]

### 2. [Next finding...]
...

## Summary
- Errors: N (action needed: N, no action: N)
- Successful patterns: N (worth extracting: N)

## Proposed Actions
1. [Action type] [target file] — [one-line description]
2. ...
```

## After Presenting the Report

1. **Ask which actions to execute.** List the proposed actions with numbers.
   The user may approve all, some, or none. Only execute approved actions.

2. **Execute approved actions.** For each:
   - Read the target file before modifying
   - Make the change
   - Show a brief summary of what changed

3. **Ask if user wants to save the report.**
   If yes, save to `docs/retro/YYYY-MM-DD.md` (create the directory if needed).
   If no, the report lives only in conversation history.

## Edge Cases

- **Very short session** (< 5 exchanges): Tell the user there's not enough context
  for a meaningful retro. Offer to note any specific concern instead.

- **User was wrong, not Claude**: If investigation reveals the user's correction was
  based on a misunderstanding, say so respectfully with evidence. Don't create
  process fixes for non-problems.

- **Multiple errors with same root cause**: Group them under one finding.
  One fix should address all instances.

- **Sensitive corrections**: If the user's correction was about tone or communication
  style (not technical), save as a feedback memory rather than a skill update.
