---
name: handoff
description: |
  Generate a self-contained handoff context document for the current work,
  printed inline as markdown so the user can copy it and paste into any other
  agent — a fresh Claude Code session, Codex, ChatGPT, or an agent on another
  machine. Use when the user says /handoff, "write context for the next
  session", "package this for handoff", "hand off to another agent", or wants
  to capture the current session's state in a portable form. Output is
  print-only — no file is written, no worktree created (use worktree-handoff
  if a git worktree is needed).
---

# Handoff

Package the current session into a portable, self-contained markdown document
so a fresh agent — in a new Claude Code session, Codex, ChatGPT, or running on
another machine — can pick up the work without asking the user clarifying
questions.

The document is printed inline. The user copies it and pastes it wherever the
next session lives. Do not save to disk.

## When this is the right tool

Use it when the user is about to switch sessions, run something on a different
machine, or hand off to a teammate's agent, and the new agent needs to know
**what's done, what's next, what NOT to relitigate, and what dead ends to skip**.

Not the right tool when:
- The user wants a git worktree created — use `worktree-handoff` instead.
- The user wants a recap of what just happened. Handoff is forward-looking;
  a recap is retrospective.

## Flow

### 1. Decide whether the next step is clear

The most load-bearing field in the document is **Next step**. Three cases:

| Case | What to do |
|------|-----------|
| User stated the next step explicitly | Use it. Elaborate with concrete commands and absolute paths. |
| The conversation clearly implies it (e.g. just finished phase A, plan defines phase B) | Propose it; mark it as your inference so the user can correct. |
| Unclear, or multiple plausible directions | **Ask one focused question first**, before generating the doc. Don't guess. |

When asking, present the realistic forks ("Will the next session (a) just
analyse the existing results, or (b) run the next iteration end-to-end? Each
needs different scope and different env."), not open-ended ("What's next?").

### 2. Gather context

Run the gathering commands in parallel. Collect liberally; filter aggressively
in step 3 — only ship what's relevant to *continuing*.

**Environment**
- `pwd`
- `git rev-parse --show-toplevel`
- `git branch --show-current`
- `git status -s`
- `git log --oneline -10`
- Background processes / dev servers / tunnels started in this session

**From conversation history**
- Files modified (Edit / Write tool calls) — path + what changed + why
- Files read for context that the new agent will also need to read — path + what's in them
- Significant Bash commands — and which the new agent should re-run vs. treat as already done
- Decisions the user committed to — design choices, accepted trade-offs
- **Approaches tried and ruled out** with the reason — saves the new agent from repeating mistakes
- Open questions or things blocked on user input
- Env vars or credentials referenced — by **name only**, never the value

### 3. Print the document

Use the structure below. Omit any section that has nothing meaningful — a
missing section is better than a padded one.

```markdown
# <Concrete task title> — Handoff Context

> For a fresh agent in a new session continuing this work. Read top-down —
> this is intended to be self-contained.

## Goal
<1–3 sentences. What to accomplish and why.>

## Current state
<Where the work stands right now. What infrastructure / data / branches are in place.>

## Next step
<One concrete action. Include exact command, absolute file path, and the
decision the user already made about it.>

## Decisions already made (do not relitigate)
- <decision> — <one-line reason>

## Tried and ruled out
- <approach> — <why it didn't work, so the new agent doesn't repeat it>

## Open questions / awaiting user
- <question> — <why it matters / what it blocks>

## Environment
- **CWD**: `<absolute path>`
- **Repo**: `<owner>/<repo>` @ `<branch>` (last commit: `<sha7> <subject>`)
- **Uncommitted changes**: <none / brief summary>
- **Recent commits** (newest first):
  - `<sha7>` <subject>
- **Env / credentials**: <names only — e.g. `OPENROUTER_API_KEY` is in `<repo>/langgraph/.env`>
- **Running services / background processes**: <only if relevant to continuation>

## Relevant files
- `<absolute path>` — [modified] <what was changed>
- `<absolute path>` — [reference] <what's in it, why the new agent will need it>

## References
- `<doc / README / URL / related skill>` — <why it matters>
```

### 4. Stop

The printed document is the entire response. Do not add a preamble before
it (no "Here's the handoff doc"), a closing line after it (no "ready, copy
it"), a summary, or any commentary. The user already knows what to do with
the output — extra text just gets in their way when they copy.

The only exception is step 1: if the next step is unclear, ask the focused
question first and wait. After the answer, generate the doc and stop.

## Quality bar

The output must pass these checks. Revise before printing if any fails.

1. **Self-contained.** A new agent can take the first action without asking
   the user a clarifying question to start.
2. **Concrete next step.** One specific action with an exact command or file
   path. Not "review the plan", not "continue where we left off".
3. **Absolute paths everywhere.** Every file reference is fully qualified.
   Every command is copy-pasteable as-is.
4. **No conversation jargon.** Don't write "as we discussed", "the issue from
   earlier", "the change I just made". Restate the actual content.
5. **No padded sections.** A 3-line "Decisions" section of real content beats
   a 10-line one of restated obvious things. Empty section → delete it.
6. **Verifiable.** Every non-trivial claim ("the bug is in TSV parsing")
   should be backed by a file path or command listed in the doc.
7. **No secret values.** Env var names only. Never paste keys, tokens, or
   passwords.
8. **Document is the entire response.** No text before the markdown block,
   no text after it. No "Here it is", no "ready to copy", no summary.

## Anti-patterns

- **Vague goal**: "Continue the eval work" → instead: "Run round 5 of the
  LangGraph health-analysis eval, including the 31 OpenRouter models added on
  2026-04-26."
- **Naked path drops**: "Look at `run_batch.py`" → instead: "`langgraph/eval/scripts/run_batch.py` —
  change `MODELS = [...]` and `THROTTLE_SECONDS` (12 for `:free` models,
  0.5 for paid)."
- **Implicit "same as before"**: "Use the same approach as last time" →
  instead: restate the approach in 1–2 lines.
- **War story**: long recap of what was tried during this session, with no
  forward signal.
- **Hidden assumptions**: assuming the new agent shares your terminal env,
  has the same skills installed, knows your file layout — state it.
- **Pasting secret values** in env / credentials section. Names only.

## Example flow

User: `/handoff`

1. Check the conversation for an explicit next step. If clear, skip to step 3.
2. If unclear, ask one focused question — e.g. *"Will the next session
   (a) only run the speed prescreen for the new models, or (b) the full
   round 5 including 100-case scoring? Different scope and env requirements."*
   Wait for the answer.
3. Run gathering commands in parallel:
   ```
   pwd
   git -C <cwd> rev-parse --show-toplevel
   git -C <cwd> branch --show-current
   git -C <cwd> status -s
   git -C <cwd> log --oneline -10
   ```
4. Walk back through the conversation, extracting modified files, decisions,
   dead ends, env requirements.
5. Compose the markdown using the template, filling only the meaningful
   sections.
6. Print it. Nothing else — no preamble, no closing line, no commentary.
