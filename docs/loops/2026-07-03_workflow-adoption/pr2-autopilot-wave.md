# feat(autopilot): dispatch waves via Workflow with schema-validated results

## Requirements

Teach the autopilot orchestrator to dispatch each wave of PR subagents through
ONE Claude Code Workflow call when the Workflow tool is available, instead of N
separate Agent-tool dispatches with hand-tracked retries. Everything the script
can make deterministic moves into the script: the per-PR retry loop, the
parallel-safety file-overlap check, and schema validation of each PR subagent's
result JSON. Everything requiring filesystem or git state stays in the
orchestrator session: `state.json` writes, `git pull` between waves, worktree
cleanup.

1. **New reference `wave-workflow.md`** — the wave-dispatch script template.
   - args contract:
     `{ prs: [{id, branch, title, subagent, prompt, files}], max_retries: 2 }`.
     `prompt` is the fully assembled per-PR prompt (Standard Prefix + spec +
     Standard Suffix, exactly as assembled today); `files` is that PR's
     create/modify path list; `subagent` is the same string the orchestrator
     would pass to the Agent tool as `subagent_type`.
   - Script behavior, in order:
     (a) pairwise file-overlap check across `args.prs` — on any overlap, return
     `{error: "file-overlap", pairs: [...]}` WITHOUT dispatching any agent;
     (b) dispatch all PRs via `parallel()`, each through a retry helper that
     calls `agent(pr.prompt, {isolation: 'worktree', agentType: pr.subagent,
     schema: RESULT_SCHEMA, label: pr.id + ':' + pr.branch, phase: 'Implement'})`;
     (c) the retry helper re-dispatches on a `null` return or a non-`success`
     result, up to `args.max_retries` extra attempts, then finalizes;
     (d) return `{results: [{pr_id, status, github_number, review_summary,
     error, attempts}]}`.
   - `RESULT_SCHEMA`: a JSON Schema matching pr-subagent-template.md's Result
     JSON exactly — `pr_id` (string), `status` (enum `success|failed|blocked`),
     `github_number` (number or null), `review_summary` (object with `rounds`,
     `fixed`, `pushed_back`, or null), `error` (string or null).

2. **`orchestrator.md` Phase 1 Step 2** — branch on Workflow availability.
   - **Available** → assemble per-PR prompts exactly as today (existing steps
     1–4 unchanged), then dispatch the whole batch via one Workflow call using
     the wave-workflow template; skip the manual per-PR dispatch/wait. Step 3
     consumes the returned `results`: `success` maps to the existing merged
     path; a non-`success` result is FINAL for the wave (in-script retries
     already happened) — map to `blocked` with `retry_count` = attempts − 1
     and `error` filled. The manual "back to pending, retry_count += 1" re-queue
     does not apply to workflow-dispatched waves.
   - **Unavailable** → today's per-PR Agent dispatch, kept verbatim as the
     fallback branch (do not delete the existing instructions; nest them under
     the fallback).
   - **Parallel-safety**: when every PR in the wave has `files` in plan.yaml,
     the in-script overlap check replaces the manual spec-reading check; if any
     PR lacks `files`, derive its list from the spec's "Files to Create/Modify"
     section (today's method) and pass the derived list in args.
   - Add an explicit note: workflow scripts have NO filesystem access —
     `state.json` writes and `git pull` remain orchestrator responsibilities
     between waves, so crash recovery stays at wave granularity via
     `state.json`.

3. **`pr-subagent-template.md`** — in the "Report Results" section only: add
   the `RESULT_SCHEMA` (as a JSON Schema block) and a dual-mode note: under
   Workflow dispatch the result is enforced as structured output (the final
   output MUST be exactly the result object, no surrounding prose); under
   legacy Agent dispatch, print the same JSON as today. No other section
   changes; the Standard Prefix/Suffix contract (branch rename step, safety
   rules, lifecycle steps 1–8) stays identical.

4. **`schemas.md`** — document a new OPTIONAL `prs[].files` field: repo-relative
   paths the PR will create/modify; used for the mechanical overlap check;
   when absent, the orchestrator falls back to reading the spec's "Files to
   Create/Modify" section. Add a row to the field-reference table (Required:
   ❌).

5. **autopilot `SKILL.md`** —
   - plan.yaml example in Step 3: add `files:` to one PR entry with a one-line
     comment marking it optional.
   - Step 5 "Single-PR + run now": add a Workflow branch — when the Workflow
     tool is available, dispatch the single assembled prompt via the same
     wave-workflow template (`prs` of length 1; the overlap check trivially
     passes) to get a schema-validated result; otherwise the existing
     Agent-tool path, unchanged.

**Constraints:**

- English only (open-source repo).
- The fallback is mandatory everywhere: with the Workflow tool unavailable,
  behavior must be exactly today's flow.
- Script: plain JavaScript, literal `export const meta`, no filesystem/Node.js
  APIs, no `Date.now()` / `Math.random()` / argless `new Date()`. Helper
  function declarations in the body are fine.
- Keep orchestrator recovery semantics: `state.json` remains the sole progress
  source; state it explicitly.
- Do NOT add budget integration or cross-wave DAG scheduling (pipeline-style
  "PR3 starts the moment PR1 merges") in this PR — waves stay
  orchestrator-driven. Note it as a possible future improvement at most.

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
  structured output and retries on mismatch), `isolation: 'worktree'` (fresh
  git worktree, auto-removed if unchanged), `agentType` (same strings as the
  Agent tool's `subagent_type`). Returns `null` if the agent is skipped or dies
  on a terminal error — ALWAYS handle null.
- **`parallel(thunks)`**: `Array<() => Promise>` run concurrently; a BARRIER —
  resolves when all settle; a throwing thunk yields `null` in the result array
  (the call itself never rejects).
- **`pipeline(items, ...stages)`**: staged per-item flow without inter-stage
  barriers. Not needed for this PR (the wave is a deliberate barrier).
- **`phase(title)` / `log(msg)`**: progress grouping / narration.
- **Caps**: concurrent agents = min(16, CPU cores − 2); excess calls queue
  automatically. Hard cap 1000 agents per run.
- **Constraints**: the script has NO filesystem or Node.js API access (the
  spawned agents have their normal full tools); `Date.now()`, `Math.random()`,
  and argless `new Date()` THROW — pass timestamps/ids via `args`.

## Files to Read

- `plugins/solopreneur/skills/autopilot/SKILL.md`
- `plugins/solopreneur/skills/autopilot/references/orchestrator.md`
- `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md`
- `plugins/solopreneur/skills/autopilot/references/schemas.md`

## Files to Create/Modify

- `plugins/solopreneur/skills/autopilot/references/wave-workflow.md` — NEW:
  script template + args contract + RESULT_SCHEMA + result-mapping table
  (workflow result → state.json fields).
- `plugins/solopreneur/skills/autopilot/references/orchestrator.md` — Step 2
  availability branch + Step 3 result mapping + no-filesystem note.
- `plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md` —
  RESULT_SCHEMA + dual-mode note in "Report Results" only.
- `plugins/solopreneur/skills/autopilot/references/schemas.md` — optional
  `prs[].files` field.
- `plugins/solopreneur/skills/autopilot/SKILL.md` — plan.yaml example +
  single-PR run-now Workflow branch.

## Acceptance Criteria

- [ ] Script syntax check passes. Recipe: extract the single fenced ```js block
      from `wave-workflow.md`; replace the leading `export const meta` with
      `const meta`; wrap the whole result in `async function __wf() { ... }`;
      save as `/tmp/ap-wave.js`; `node --check /tmp/ap-wave.js` exits 0.
      Example shape:
      `{ echo 'async function __wf(){'; cat body.js; echo '}'; } > /tmp/ap-wave.js`
- [ ] `wave-workflow.md` documents the args contract and contains
      `RESULT_SCHEMA` with the exact fields/enums listed in Requirements §1.
- [ ] `orchestrator.md` Step 2 contains both branches — grep finds a
      "Workflow tool is available" path and an explicit fallback path
      preserving the current per-PR Agent dispatch.
- [ ] `orchestrator.md` contains the no-filesystem note (state.json + git pull
      stay in the orchestrator between waves).
- [ ] `schemas.md` field-reference table has a `prs[].files` row marked
      optional, with the fallback-to-spec behavior described.
- [ ] `pr-subagent-template.md`'s "Report Results" section contains a JSON
      Schema and the dual-mode note; `git diff` for that file is confined to
      the "Report Results" section.
- [ ] autopilot `SKILL.md` Step 5 single-PR run-now has both branches
      (Workflow available / Agent-tool fallback).
- [ ] All new text is in English.

## Notes

- The retry loop lives per-PR INSIDE the script (a helper function wrapping
  `agent()`), so one PR's retry never blocks a sibling PR. `parallel()` is
  still the right outer shape: the wave is a barrier by design — the
  orchestrator processes all results together, writes state.json once, and
  pulls main once.
- `agent()` returning `null` means the runtime-level agent died or was
  skipped — treat it exactly like a failed attempt in the retry helper.
- Each retry attempt gets a fresh auto-created worktree via
  `isolation: 'worktree'`; leftover worktrees from failed attempts are handled
  by the orchestrator's existing Phase 0 cleanup — no new cleanup logic in the
  script.
- The current in-flight orchestrator run that executes THIS plan uses the old
  flow; nothing here needs to be fed back into it.
