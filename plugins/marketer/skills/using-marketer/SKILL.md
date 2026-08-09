---
name: using-marketer
description: |
  First routing gate for marketing work. Use before any marketing domain skill
  for an explicit request for marketer, when work spans multiple concerns or
  deliverables, needs project-wide brand/GTM synthesis, or no single marketing
  skill covers it. If marketer is known unavailable, stay inline with no agent
  call. When this gate selects delegation, Codex V2 must delegate exactly once
  with agent_type="marketer" and fork_turns="none". Never retry as a generic or
  full-history agent.
---

# Route Marketing Work

If the current agent is `marketer`, complete the request inline and never
delegate, even when the request explicitly asks for `marketer`. This guard
overrides every routing rule below and prevents recursive delegation in both
Claude Code and Codex.

Decide the route before reading or invoking any marketing domain skill.
Use only the installed skills' names and descriptions for this decision.

Route the request once, in this order:

- An explicit request to stay inline: stay inline.
- An explicit request for `marketer`: delegate.
- One installed marketing skill fully covers every concern and deliverable: use
  that skill inline, even when its workflow has multiple steps or outputs.
- Otherwise: delegate to `marketer`.

After choosing the route, follow exactly one of these mutually exclusive
branches:

1. If the route is inline, make zero agent calls and execute the selected skill
   or skills inline.
2. If the route is delegation and `marketer` is known unavailable, make zero
   agent calls and continue inline with the smallest applicable skill set.
3. If the route is delegation and `marketer` is available, make exactly one
   named-agent call:

   - In Codex, call `spawn_agent` once with `agent_type="marketer"` and
     `fork_turns="none"`. Set both fields explicitly; do not omit either field
     or use any other value.
   - In Claude Code, call `Agent` once with `subagent_type="marketer"`.

Never spawn a generic agent, split the brief across agents, or retry with
another agent type. Send only a self-contained objective, deliverables,
language, constraints, and relevant evidence or paths. Wait for that child and
integrate its result without repeating the work.

If the exact named-agent call in branch 3 is rejected or fails, make no further
spawn or delegation calls. Continue inline with the smallest applicable skill
set.
