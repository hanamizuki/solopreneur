# feat(greenlight): adversarial finding verification via Workflow

## Requirements

Add an optional **adversarial verification gate** to the greenlight skill: after
review findings are consolidated (merged + deduped) and before they are handed to
a fix subagent, each finding is independently challenged by 3 skeptic subagents
running inside one Claude Code Workflow. Findings that a majority of skeptics
refute are dropped (recorded as pushed back, with the skeptics' reasoning); only
surviving findings reach the fix subagent. Purpose: cut false-positive fix
cycles — a wrongly "fixed" false positive costs a whole extra review round.

**Scope** — the gate applies at exactly the three points where a consolidated
findings list is handed to a fix subagent:

1. PR mode: between Phase 2a (consolidate reports) and Phase 2b (dispatch fix
   subagent).
2. Post-commit mode: between Phase 1 (`PHASE1_FINDINGS` consolidation) and
   Phase 2 (initial fix).
3. Post-commit mode Phase 3: after Step 3 (`MERGED_FINDINGS` merge/dedup) and
   before Step 4's evaluation — Step 4 then evaluates the *survivors*.

**Out of scope (must stay unchanged)**: Uncommitted mode; PR mode Phase 3
(external review threads — those carry GitHub thread resolve/reply obligations
and already go through `receiving-code-review` evaluation per thread).

**Behavior rules:**

- **Availability**: the gate runs ONLY when the Workflow tool is available in the
  current session (Claude Code v2.1.154+, paid plans — see API reference below).
  When unavailable, skip the gate entirely; behavior is exactly today's flow. The
  gate must never be a hard dependency of greenlight.
- **Verdict rule**: 3 skeptics per finding, each prompted to REFUTE the finding
  and to default to `refuted: true` when uncertain. A finding survives only if
  ≥ 2 of its 3 verdicts come back `refuted: false`. A `null` (failed/skipped)
  skeptic vote counts as refuted.
- **All-rejected round**: if every finding at a gate is rejected, do not dispatch
  the fix subagent for that findings batch. For scope point 1, skip Phase 2b and
  proceed to Phase 3. For point 2, follow the existing "PHASE1_FINDINGS is empty"
  path (skip Phase 2, go to Phase 3). For point 3, Step 4 sees zero survivors —
  treat it as a push-back exit (findings existed but were all rejected), not a
  clean pass.
- **Reporting**: gate-rejected findings count as "items pushed back" in every
  final report, and their reasoning must be carried into later rounds'
  "prior push-backs" context so repeat findings can push-back-exit.
- **Data flow**: findings and diff context go into the workflow via `args`:
  a `findings` array (`{id, file, line, issue, suggested_fix, source}`) plus a
  `diff_cmd` string (PR mode: `git diff main...HEAD`; post-commit: the resolved
  range command from the Range resolution table, e.g. `git log -p BASE..TIP`).
  Skeptic agents run `diff_cmd` themselves and read the actual files before
  voting — verdicts must cite concrete evidence.
- **Single definition**: define the gate ONCE in the new reference file.
  SKILL.md's three insertion points each get a short callout referencing it —
  do not paste the script or the rules three times.

**Constraints:**

- English only (open-source repo).
- Do not restructure or renumber existing SKILL.md sections; insert minimal
  callouts at the three points.
- The workflow script template must be valid plain JavaScript with the literal
  `export const meta` block; no filesystem/Node.js APIs; no `Date.now()` /
  `Math.random()` / argless `new Date()`; all inputs come via `args`.
- No new findings-count threshold or config knob: the gate is unconditional
  when the Workflow tool is available. Simpler, and one avoided fix round
  costs more than 3N skeptic agents.

## Workflow tool API (embedded reference — implement against this)

Official docs: https://code.claude.com/docs/en/workflows (requires Claude Code
v2.1.154+, paid plans). Detection: the orchestrating session checks whether a
`Workflow` tool is present in its available tools; if absent → fallback path.

- **Invocation**: `Workflow` tool call with `script` (inline string) and optional
  `args` (a real JSON value, exposed verbatim to the script as the global
  `args`).
- **Script format**: plain JavaScript, NOT TypeScript. MUST begin with
  `export const meta = { name, description, phases: [{ title }] }` as a pure
  literal (no variables, function calls, spreads, or template strings). The body
  runs inside an async wrapper: top-level `await` and top-level `return` are
  allowed, and the returned value becomes the workflow result.
- **`agent(prompt, opts?) → Promise<any>`**: spawns one subagent. `opts`:
  `label` (display string), `phase` (progress group title), `schema` (JSON
  Schema — the return value is the validated object; the runtime forces
  structured output and retries on mismatch), `isolation: 'worktree'`,
  `agentType` (same strings as the Agent tool's `subagent_type`). Returns
  `null` if the agent is skipped or dies on a terminal error — ALWAYS handle
  null.
- **`parallel(thunks)`**: `Array<() => Promise>` run concurrently; a BARRIER —
  resolves when all settle; a throwing thunk yields `null` in the result array
  (the call itself never rejects).
- **`phase(title)` / `log(msg)`**: progress grouping / narration.
- **Caps**: concurrent agents = min(16, CPU cores − 2); excess calls queue
  automatically. Hard cap 1000 agents per run.
- **Constraints**: the script has NO filesystem or Node.js API access (the
  spawned agents have their normal full tools); `Date.now()`, `Math.random()`,
  and argless `new Date()` THROW. Helper `function` / arrow declarations in the
  body are fine.

## Files to Read

- `plugins/solopreneur/skills/greenlight/SKILL.md` — the full current flow; find
  the three insertion points (Phase 2a→2b; Post-commit Phase 1→Phase 2;
  Post-commit Phase 3 Step 3→Step 4).
- `plugins/solopreneur/skills/autopilot/references/orchestrator.md` — only as a
  house-style reference for "reference file defines a template, skill references
  it" (do not modify).

## Files to Create/Modify

- `plugins/solopreneur/skills/greenlight/references/adversarial-verify.md` —
  NEW. Contains: the workflow script template (one fenced ```js block), the
  `VERDICT_SCHEMA` (`{refuted: boolean, reasoning: string}`, both required),
  the args contract (`findings` array + `diff_cmd`), the verdict rule, the
  skeptic prompt requirements (refute framing, default-refute-if-uncertain,
  must run `diff_cmd` and cite evidence), and how callers map results back
  (survivors → fix subagent input; rejected → push-back records with
  reasoning).
- `plugins/solopreneur/skills/greenlight/SKILL.md` — add one "Verification
  gate" subsection (what it is, availability check, fallback = skip) plus three
  short insertion callouts at the scope points above.

## Acceptance Criteria

- [ ] Script syntax check passes. Recipe: extract the single fenced ```js block
      from `adversarial-verify.md`; replace the leading `export const meta` with
      `const meta` (the runtime strips the export before wrapping); wrap the
      whole result in `async function __wf() { ... }`; save as `/tmp/gl-av.js`;
      `node --check /tmp/gl-av.js` exits 0. Example shape:
      `{ echo 'async function __wf(){'; cat body.js; echo '}'; } > /tmp/gl-av.js`
- [ ] The script begins with a literal `export const meta` block whose `phases`
      declares a single Verify phase; the body is: outer `parallel` over
      `args.findings`, inner `parallel` of 3 refuter `agent()` calls per finding
      (each with `schema: VERDICT_SCHEMA`), null-safe vote counting, and a
      `return { confirmed: [...], rejected: [...] }` where rejected entries
      carry the skeptics' reasoning.
- [ ] `grep -c "adversarial-verify" plugins/solopreneur/skills/greenlight/SKILL.md`
      returns ≥ 3 (the three insertion points reference the gate).
- [ ] The gate subsection in SKILL.md explicitly states the fallback: Workflow
      tool unavailable → skip the gate, flow unchanged.
- [ ] The verdict rule (3 skeptics, survive on ≥2 `refuted: false`, null vote
      counts as refuted, default-refute-if-uncertain) is documented in
      `adversarial-verify.md`.
- [ ] `git diff` shows NO changes inside the Uncommitted Mode section or the
      PR-mode Phase 3 section of SKILL.md (callouts live in Phase 2 and the two
      post-commit spots only).
- [ ] All new text is in English.

## Notes

- The script returns data only; it cannot write files or call GitHub. All
  side effects (dispatching the fix subagent, resolving threads, reports) stay
  with the orchestrating agent, which consumes the returned
  `confirmed` / `rejected` lists.
- Keep the script small — this is a prompt-engineering deliverable, not a
  library. One phase, two nested parallels, one helper at most.
- Cost sanity is fine by design: N findings → 3N agents; the concurrency cap
  queues the excess. No threshold logic.
