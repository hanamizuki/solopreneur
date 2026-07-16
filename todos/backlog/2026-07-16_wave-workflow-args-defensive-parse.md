# wave-workflow.md: add defensive args parse to the script template

The Workflow tool's `args` sometimes arrives in the script as a JSON **string**
instead of an object (harness stringifies a layer). The template at
`plugins/solopreneur/skills/autopilot/references/wave-workflow.md:185` reads
`args.prs` directly, so every orchestrator that copies the template verbatim
crashes with `undefined is not an object (evaluating 'prs.length')` — 0 agents
dispatched, fails in milliseconds.

This has been hit **five times** across sessions (2026-07-09 → 2026-07-16).
Memory-based reminders ("add the guard when copying") have demonstrably failed;
the durable fix is in the template source.

## Fix

Replace in the fenced `js` block (and the matching prose if any):

```js
const prs = args.prs;
const maxRetries = args.max_retries ?? 2;
```

with:

```js
// args may arrive as a JSON string (harness stringifies a layer) — accept both
const input = typeof args === "string" ? JSON.parse(args) : args;
const prs = input.prs;
const maxRetries = input.max_retries ?? 2;
```

## Acceptance

- Template script parses whether `args` is an object or a JSON string
- No other `args.` reads remain in the template (grep `args.` in the js block)
- CHANGELOG entry + plugin version bump per repo release conventions
