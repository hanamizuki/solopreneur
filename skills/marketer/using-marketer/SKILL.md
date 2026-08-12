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
language, constraints, and relevant evidence or paths.

In Codex, after an accepted spawn, treat that child as the selected execution
path and wait for its result before answering. The outer liveness budget is 15
wait cycles. Each cycle calls `wait_agent` once with `timeout_ms=60000`, and
every wait call counts even when a mailbox update wakes it early. The maximum
wait is therefore 15 minutes and may be shorter after progress updates. If the
wake injects the exact canonical child's completed final result, integrate it
immediately and stop polling. Otherwise, inspect the spawned canonical path
with `list_agents`. A polling timeout, progress-only message, or other wake
without a completed result before the cycle budget is exhausted is not a child
failure. If the canonical path is absent from `list_agents`, treat it as
`not_found`. While the child is `pending_init` or `running` and cycles remain,
wait again: do not call
`send_message`, `followup_task`, or `interrupt_agent`; do not spawn, retry,
begin the delegated work inline, or deliver a final answer.

If the fifteenth non-completing cycle reports the child still `pending_init` or
`running`, call `interrupt_agent` exactly once, mark the delegation failed, make
no further agent calls, and continue inline with the smallest applicable skill
set. Never claim that this budget fallback completed the delegation; it cannot
satisfy live delegation acceptance.

Integrate only a `completed` child result. If the exact named-agent call is
rejected, the canonical path is absent, or the tool reports the child as
`errored` or `shutdown`, make no further agent calls and continue inline with
the smallest applicable skill set. Explicit user cancellation or replacement
may interrupt a running child before the budget; then follow the new user intent
without continuing the original delegated work inline or claiming that
delegation completed. If the child becomes `interrupted` without either of
those parent-initiated reasons, make no further agent calls, surface delegation
failure, and do not continue the original work inline or claim success.
