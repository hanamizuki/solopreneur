# Adversarial finding verification (Workflow gate)

Single source of truth for greenlight's optional **verification gate**. SKILL.md's
three insertion points reference this file; the gate is defined here ONCE.

## What it does

After review findings are consolidated (merged + deduped) and before they reach a
fix subagent, each finding is independently challenged by 3 skeptic subagents
running inside one Claude Code [Workflow](https://code.claude.com/docs/en/workflows).
A finding survives only if a majority of skeptics fail to refute it. Survivors go
to the fix subagent; refuted findings are dropped and recorded as pushed back with
the skeptics' reasoning.

Purpose: cut false-positive fix cycles. A wrongly "fixed" false positive costs a
whole extra review round; 3 skeptic agents per finding is cheaper. The rule is
deliberately biased toward dropping: a dropped true finding just reappears next
review round, whereas a kept false positive wastes a full fix cycle.

## Availability

Runs ONLY when the `Workflow` tool is present in the orchestrating session (Claude
Code v2.1.154+, paid plans). If absent, the caller **skips the gate entirely** and
hands every consolidated finding straight to the fix subagent — behavior identical
to the pre-gate flow. The gate is never a hard dependency of greenlight.

## Args contract

The caller invokes the `Workflow` tool with the script below plus an `args` object
(a real JSON value, exposed verbatim to the script as the global `args`):

- `findings` — array of consolidated findings, each an object
  `{ id, file, line, issue, suggested_fix, source }`. `id` is any stable
  per-finding string the caller assigns (e.g. `"f1"`, `"f2"`); `source` names the
  reviewer that raised it (e.g. `"codex-cli"`, `"simplify"`).
- `diff_cmd` — the exact shell command a skeptic runs to see the change under
  review. PR mode: `git diff main...HEAD`. Post-commit mode: the resolved range
  command from SKILL.md's Range resolution table (e.g. `git show <TIP>` for a
  single commit, or `git log -p <BASE>..<TIP>` for a range).

The script reads only from the global `args` — no filesystem or Node.js APIs.

## Verdict rule

- **3 skeptics per finding**, each prompted to REFUTE the finding.
- Each skeptic **defaults to `refuted: true`** when uncertain or unable to find
  concrete evidence the issue is real — but only after actually reading the code.
- A finding **survives** only if **≥ 2 of its 3 verdicts** come back
  `refuted: false` (i.e. at least two skeptics concede it is a genuine issue).
- A `null` verdict (agent skipped or died) counts as **refuted** — it is falsy, so
  it is never tallied as a survive vote.
- If a finding's whole `challenge` fails, it counts as **rejected** (fail safe —
  never forward an unverified finding to the fix subagent).

The vote threshold itself is a neutral majority (odd count, no ties); the drop-bias
lives entirely in each skeptic's default-refute prior. Recall is therefore governed
by per-skeptic accuracy, not the vote rule — which is why the prompt forces
evidence-grounded verdicts (below) rather than reflexive refutation.

## Skeptic prompt requirements

Each skeptic agent MUST:

1. **Refute framing** — treat the finding as a false positive unless the code
   proves otherwise, but the skepticism must be grounded, never reflexive.
2. **Run `args.diff_cmd` itself** to see the actual change.
3. **Read the actual file(s)** the finding names — surrounding code, not just the
   cited line.
4. **Cite concrete evidence** in `reasoning`: quote the code, name `file:line`,
   describe what the diff does. A `refuted: false` vote requires quoting the exact
   lines that prove the issue is real.
5. **Default to `refuted: true` when uncertain** — but only after running the diff
   and reading the files, never as a reflex from the finding text alone.
6. Judge the described **problem**, not the finding's wording (don't drop a real
   bug over an off-by-a-few line number).
7. **Not edit any files** — return a verdict only.

## VERDICT_SCHEMA

Each skeptic returns an object validated against a JSON Schema with two required
fields: `reasoning` (string — the evidence) and `refuted` (boolean — `true` = false
positive, `false` = genuine issue). `reasoning` is declared **before** `refuted` on
purpose: structured output is generated in property order, so reasoning-first forces
the model to reason before committing to a verdict (reason-then-conclude) instead of
rationalizing a verdict after the fact. The schema is defined inline in the script
and passed as `schema:` to every `agent()` call, so the runtime forces structured
output and retries on mismatch.

## Result mapping (caller)

The script returns `{ confirmed, rejected }`:

- `confirmed` — array of survivor findings (the same objects from `args.findings`).
  **These are the fix subagent's input**, replacing the pre-gate findings list.
- `rejected` — array of `{ finding, reasons }`, where `reasons` is the refuting
  skeptics' `reasoning` strings. **Record each as an item pushed back**, and carry
  its reasoning into later rounds' "prior push-backs" context so a repeat finding
  can push-back-exit.

If `confirmed` is empty (every finding rejected), do NOT dispatch the fix subagent
for this batch — see each caller's callout in SKILL.md for the exact exit path.

The script returns data only; all side effects (dispatching the fix subagent,
committing, resolving threads, reporting) stay with the orchestrating agent.

> Skeptics use the session's default agent (single provider). Routing each skeptic
> to a different model (reusing greenlight's Codex/Gemini/Claude reviewers) would
> decorrelate errors, but is deferred — hardcoded model ids risk `agent()` returning
> `null` (silently counted as refuted, eroding recall). Keep it identical for now.

## Workflow script

```js
export const meta = {
  name: "adversarial-verify",
  description: "Challenge each consolidated review finding with 3 skeptics; drop findings a majority refute.",
  phases: [{ title: "Verify findings" }]
};

// Each skeptic returns an object matching this JSON Schema; both fields required.
// reasoning is declared FIRST so the model reasons before committing to a verdict
// (reason-then-conclude) — structured output is generated in property order, and a
// verdict-first schema would degrade reasoning into post-hoc rationalization.
const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    reasoning: {
      type: "string",
      description: "Concrete evidence from the diff and the actual files: quote the code, name file:line, say what the change does. Written BEFORE the verdict."
    },
    refuted: {
      type: "boolean",
      description: "true if this finding is a false positive (not worth fixing); false only if concrete quoted evidence proves it is a genuine issue."
    }
  },
  required: ["reasoning", "refuted"],
  additionalProperties: false
};

const SKEPTICS = 3;            // refuters per finding
const MIN_KEEP_TO_SURVIVE = 2; // survive iff >= 2 verdicts come back refuted:false

// Challenge one finding with SKEPTICS refuters running in parallel.
async function challenge(finding) {
  const prompt = [
    "You are a skeptical senior engineer. Your job is to REFUTE the code review finding below:",
    "treat it as a FALSE POSITIVE unless the code proves otherwise. Your skepticism must be",
    "GROUNDED in the actual code, never reflexive.",
    "",
    "Finding:",
    "  id: " + finding.id,
    "  file: " + finding.file,
    "  line: " + finding.line,
    "  issue: " + finding.issue,
    "  suggested_fix: " + finding.suggested_fix,
    "  source: " + finding.source,
    "",
    "Mandatory procedure — do ALL of it before voting:",
    "  1. Run this exact command to see the change under review: " + args.diff_cmd,
    "  2. Open and read the actual file(s) named above: the surrounding code, not just the cited line.",
    "  3. Decide whether the described problem is genuinely real in this code.",
    "",
    "Verdict rules:",
    "  - Vote refuted:false ONLY if, after reading the code, you found concrete evidence the issue is",
    "    real and the fix is warranted, and quote those exact lines in your reasoning.",
    "  - Otherwise vote refuted:true. Default to refuted:true when uncertain or when you cannot find",
    "    concrete evidence the issue is real, but only AFTER running the diff and reading the files,",
    "    never as a reflex from the finding text alone.",
    "  - Judge the described PROBLEM, not the finding's wording: do not refute a real bug just because",
    "    the line number is off by a few or a field is imperfect.",
    "  - reasoning MUST cite concrete evidence (quoted code + file:line). Do NOT edit any files."
  ].join("\n");

  const verdicts = await parallel(
    Array.from({ length: SKEPTICS }, (_, i) => () =>
      agent(prompt, {
        label: "refute " + finding.id + " #" + (i + 1),
        phase: "Verify findings",
        schema: VERDICT_SCHEMA,
        agentType: "general-purpose"
      })
    )
  );

  // Null-safe tally: a null verdict (agent skipped or died) is falsy, so it is not
  // counted as a keep — i.e. it counts as refuted, per the verdict rule.
  const keep = verdicts.filter(v => v && v.refuted === false).length;
  const nulls = verdicts.filter(v => !v).length;
  return { survived: keep >= MIN_KEEP_TO_SURVIVE, verdicts: verdicts, nulls: nulls };
}

phase("Verify findings");
log("Challenging " + args.findings.length + " finding(s), " + SKEPTICS + " skeptics each.");

// Outer parallel: one challenge() per finding. parallel is a barrier and never
// rejects; a throwing thunk yields null in the result array (handled below).
const results = await parallel(args.findings.map(f => () => challenge(f)));

const confirmed = [];
const rejected = [];
let nullVotes = 0;
results.forEach((r, i) => {
  const finding = args.findings[i];
  if (r) nullVotes += r.nulls;
  if (r && r.survived) {
    confirmed.push(finding);
  } else {
    // r === null means the whole challenge failed → fail safe: reject, so an
    // unverified finding is never forwarded to the fix subagent.
    const reasons = r
      ? r.verdicts.filter(v => v && v.refuted === true).map(v => v.reasoning)
      : ["verification workflow failed for this finding"];
    rejected.push({ finding: finding, reasons: reasons });
  }
});

// null votes stack with the default-refute bias and can silently erode recall, so
// surface the count: a flaky run is then visible rather than quietly dropping findings.
log("Confirmed " + confirmed.length + ", rejected " + rejected.length + ", null skeptic votes " + nullVotes + ".");
return { confirmed: confirmed, rejected: rejected };
```
