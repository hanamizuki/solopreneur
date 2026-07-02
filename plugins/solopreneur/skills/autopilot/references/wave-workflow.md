# Wave Dispatch Workflow

Script template for dispatching **one wave** of PR subagents through a single
Claude Code [Workflow](https://code.claude.com/docs/en/workflows) call
(requires Claude Code v2.1.154+, paid plans). The orchestrator uses this only
when a `Workflow` tool is present in its session; otherwise it falls back to
per-PR `Agent` dispatch (see `orchestrator.md` Step 2b).

Moving the deterministic parts into one script call removes the orchestrator's
hand-tracked retry bookkeeping: the per-PR retry loop, the parallel-safety
file-overlap check, and schema validation of each subagent's result all run
inside the script. Everything that needs filesystem or git state stays in the
orchestrator session — see "What stays in the orchestrator" below.

## Args contract

The orchestrator passes `args` as a real JSON value, exposed verbatim to the
script as the global `args`:

```json
{
  "prs": [
    {
      "id": "pr1",
      "branch": "feature/xxx-pr1",
      "title": "feat(scope): description",
      "subagent": "ai-engineer",
      "prompt": "<fully assembled per-PR prompt>",
      "files": ["path/a.py", "path/b.py"]
    }
  ],
  "max_retries": 2
}
```

| Field | Meaning |
|-------|---------|
| `prs[].id` | Canonical plan id (used for labels and result keying). |
| `prs[].branch` | Target branch name (the subagent renames its worktree to this). |
| `prs[].title` | PR title (already baked into `prompt`; carried for the label). |
| `prs[].subagent` | Same string the Agent tool takes as `subagent_type`. |
| `prs[].prompt` | The **fully assembled** prompt: Standard Prefix + spec + Standard Suffix, exactly as the orchestrator assembles it today (see `pr-subagent-template.md`). |
| `prs[].files` | Repo-relative create/modify paths for the overlap check. From plan.yaml `prs[].files`, or derived from the spec's "Files to Create/Modify" section when absent. |
| `max_retries` | Extra attempts per PR beyond the first (default 2 → up to 3 total). |

## Script behavior, in order

1. **(a) Pairwise file-overlap check** across `args.prs`. If any two PRs share a
   repo-relative path, return `{ error: "file-overlap", pairs: [...] }`
   **without dispatching any agent**. The orchestrator then runs the
   overlapping PRs in separate sequential waves.
2. **(b) Dispatch all PRs via `parallel()`**, each through a per-PR retry helper
   that calls `agent(pr.prompt, { isolation: 'worktree', agentType: pr.subagent,
   schema: RESULT_SCHEMA, label: pr.id + ':' + pr.branch, phase: 'Implement' })`.
3. **(c)** The retry helper re-dispatches on a `null` return (agent died or was
   skipped) or any non-`success` result, up to `max_retries` extra attempts,
   then finalizes. It keeps the last non-null result so a final-attempt null
   cannot erase a richer earlier one.
4. **(d) Return** `{ results: [{ pr_id, status, github_number, review_summary,
   error, attempts }] }`.

The return is **dual-shaped**: `{ error, pairs }` when the overlap check
refuses the wave (no agent ran), or `{ results }` otherwise. The orchestrator
branches on whether `error` is present.

## RESULT_SCHEMA

Each subagent's result is validated against this JSON Schema (the runtime forces
structured output and retries the agent on a mismatch). It mirrors the Result
JSON in `pr-subagent-template.md` **exactly** — the two are duplicated on
purpose (the script has no filesystem access and cannot read that file), so
**keep them in sync** when either changes:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "pr_id": { "type": "string" },
    "status": { "type": "string", "enum": ["success", "failed", "blocked"] },
    "github_number": { "type": ["number", "null"] },
    "review_summary": {
      "type": ["object", "null"],
      "properties": {
        "rounds": { "type": "number" },
        "fixed": { "type": "number" },
        "pushed_back": { "type": "number" }
      }
    },
    "error": { "type": ["string", "null"] }
  },
  "required": ["pr_id", "status", "github_number", "review_summary", "error"]
}
```

## Result mapping (workflow result → state.json)

The orchestrator consumes each element of `results` and writes state.json
(Step 3). `attempts` is 1 for a first-try success, up to `max_retries + 1` when
retries are exhausted.

| Workflow result field | Maps to state.json | Notes |
|-----------------------|--------------------|-------|
| `status == "success"` | PR status → `merged` | Merged path (the subagent ran `/merge-pr`). |
| `status != "success"` | PR status → `blocked` | **Final** for the wave — in-script retries already happened; do NOT re-queue to `pending`. |
| `github_number` | `number` | May be non-null even for a blocked PR (it was opened, then stuck). |
| `review_summary` | `review_summary` | Object or null. |
| `error` | `error` | Failure reason string. |
| `attempts` | `retry_count` = `max(attempts - 1, 0)` | Clamped; the outer null guard reports `attempts: 0` in the rare thunk-throw case. |

## What stays in the orchestrator

The script has **no filesystem, git, or Node.js API access** — it only spawns
agents and shapes their results. So the orchestrator session still owns, around
each Workflow call:

- **state.json writes** — set every dispatched PR to `implementing` before the
  call, then apply the returned `results` after. state.json is the sole source
  of progress recovery.
- **`git pull origin main --ff-only`** once per wave, after applying results, to
  absorb the merges from this wave.
- **Worktree cleanup** — leftover worktrees from failed/retried attempts are
  handled by Phase 0 cleanup on the next run; the script adds no cleanup logic.

Because state.json is written only between waves, crash recovery is at **wave
granularity**: a crash mid-wave resumes by re-running the whole wave from the
last persisted state.

## The script

Exactly one fenced `js` block. It is plain JavaScript, begins with a pure
`export const meta` literal, and runs inside the Workflow runtime's async
wrapper (top-level `await` and `return` are allowed). It uses no `Date.now()`,
`Math.random()`, `new Date()`, filesystem, or Node.js APIs.

```js
export const meta = {
  name: "autopilot-wave",
  description: "Dispatch one wave of PR subagents with per-PR retry and schema-validated results.",
  phases: [{ title: "Implement" }]
};

// JSON Schema each PR subagent's Result JSON is validated against. Mirrors the
// Result JSON block in pr-subagent-template.md exactly — the two MUST stay in
// sync (the script cannot read that file: no filesystem access). The runtime
// forces structured output and retries the agent on a schema mismatch, so a
// non-null return here is always a well-formed result object.
const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pr_id: { type: "string" },
    status: { type: "string", enum: ["success", "failed", "blocked"] },
    github_number: { type: ["number", "null"] },
    // ponytail: nested object left open (no additionalProperties / required) so
    // a subagent may enrich it (e.g. a `reviewer` key, per schemas.md) without
    // tripping validation.
    review_summary: {
      type: ["object", "null"],
      properties: {
        rounds: { type: "number" },
        fixed: { type: "number" },
        pushed_back: { type: "number" }
      }
    },
    error: { type: ["string", "null"] }
  },
  required: ["pr_id", "status", "github_number", "review_summary", "error"]
};

const prs = args.prs;
// max_retries is part of the contract, but default it so a missing value can
// never silently collapse the retry loop to zero attempts.
const maxRetries = args.max_retries ?? 2;

// (a) Pairwise file-overlap check. Two PRs that write the same repo-relative
// path cannot run in parallel safely, so we refuse the whole wave before any
// agent spawns and let the orchestrator fall back to sequential handling. A PR
// with no `files` contributes an empty list (never overlaps). The guarantee is
// only as strong as the declared `files`: an agent that edits an undeclared
// path can still collide at merge time.
function sharedFiles(a, b) {
  const setB = new Set(b.files || []);
  return (a.files || []).filter(function (f) { return setB.has(f); });
}

const overlapPairs = [];
for (let i = 0; i < prs.length; i++) {
  for (let j = i + 1; j < prs.length; j++) {
    const shared = sharedFiles(prs[i], prs[j]);
    if (shared.length > 0) {
      overlapPairs.push({ a: prs[i].id, b: prs[j].id, files: shared });
    }
  }
}
if (overlapPairs.length > 0) {
  return { error: "file-overlap", pairs: overlapPairs };
}

// (b + c) Per-PR retry helper. One attempt == one agent() spawn in a fresh
// worktree. A null return (agent died or was skipped) or any non-success status
// counts as a failed attempt and triggers a re-dispatch, up to maxRetries EXTRA
// attempts (maxRetries + 1 total). The loop lives per PR so one PR's retries
// never block a sibling. `pr_id` is always the canonical plan id (never the
// model-reported one, which could drift); only outcome fields come from the
// agent. We keep the last NON-null result so a final-attempt null cannot erase
// a richer earlier result (e.g. a PR that was opened, then blocked in review).
async function runPr(pr) {
  let attempts = 0;
  let last = null;
  while (attempts <= maxRetries) {
    attempts++;
    const r = await agent(pr.prompt, {
      isolation: "worktree",
      agentType: pr.subagent,
      schema: RESULT_SCHEMA,
      label: pr.id + ":" + pr.branch,
      phase: "Implement"
    });
    if (r !== null) {
      last = r;
    }
    if (r && r.status === "success") {
      break;
    }
  }
  if (last === null) {
    // Every attempt died at the runtime level — synthesize a failed result so
    // the orchestrator still gets a row for this PR.
    return {
      pr_id: pr.id,
      status: "failed",
      github_number: null,
      review_summary: null,
      error: "agent returned null (died or skipped) on all attempts",
      attempts: attempts
    };
  }
  return {
    pr_id: pr.id,
    status: last.status,
    github_number: last.github_number,
    review_summary: last.review_summary,
    error: last.error,
    attempts: attempts
  };
}

// (b) Dispatch every PR concurrently. parallel() is a barrier: it resolves only
// once all PRs settle, so the orchestrator processes the whole wave together —
// writing state.json once and pulling main once. parallel() preserves input
// order, so results[i] lines up with prs[i]; the null guard below relies on it.
const results = await parallel(prs.map(function (pr) {
  return function () { return runPr(pr); };
}));

// (d) Shape the wave result. parallel() yields null for a thunk that threw;
// runPr does not throw, but guard anyway to honor the "always handle null" rule.
return {
  results: results.map(function (r, i) {
    if (r === null) {
      return {
        pr_id: prs[i].id,
        status: "failed",
        github_number: null,
        review_summary: null,
        error: "wave thunk threw before returning a result",
        attempts: 0
      };
    }
    return r;
  })
};
```

## Notes and known limits

- **Retry policy is intentional**: a `failed`/`blocked` result is retried the
  same as a `null` one (per the args contract). A deterministic failure (e.g. a
  test that cannot pass) will simply exhaust `max_retries` and finalize as
  blocked. The sandbox forbids `Date.now()` / `Math.random()`, so retries are
  back-to-back with no backoff.
- **Hung agents block the barrier**: `parallel()` resolves only when every PR
  settles, so a stuck agent stalls the wave. This relies on the Workflow
  runtime's own per-agent lifecycle; the script adds no timeout.
- **Overlap is declaration-bound**: the check only compares declared `files`.
  Two agents that both touch an undeclared path can still conflict at merge.
- **No cross-wave scheduling** (future improvement): waves stay
  orchestrator-driven — the script dispatches one barrier'd wave and returns.
  Pipeline-style "PR3 starts the moment PR1 merges" and budget integration are
  explicitly out of scope here.
