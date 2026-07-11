# Running the Benchmark

Run this after changing anything under `references/`. `build-prewrite.py --check`
tells you the files are *structurally* intact; only the cases tell you the skill
still *behaves*.

## What to run

- **`FID-*` and `OVER-*` — always. Never skip them.** They are the cases that
  catch a change making the skill *actively harmful* (rewriting a price, inventing
  the author's past) rather than merely incomplete. They are pass/fail.
- **`NEW-*`** — when the pattern catalog changed.
- **`TW-*`** — when anything on the zh side changed (`patterns-zh.md`,
  `word-table-zh.md`, `taiwan-localization.md`).

## Procedure

Run each case in a **fresh subagent** — one case per agent, no shared context. One
agent running all 27 in a single session will pattern-match on the earlier cases
and score better than the skill deserves.

Prompt per case:

> Apply the humanly skill in rewrite mode to the text below.
> Context profile: `<profile>`.
> Return the four sections the skill specifies.
>
> `<input text>`

Score against the case's expectation:

| Group | Pass |
|---|---|
| `NEW-*` | the pattern appears in *Issues found*, the rewrite applies the fix, **and** the rewrite invents nothing |
| `TW-*` | the localization is applied — or correctly withheld, for TW-03/04/05 |
| `FID-*` | the protected string appears **verbatim** in the rewritten version |
| `OVER-*` | the rewrite introduced no hook, aphorism, staccato run, invented fact, or invented source |

## Reading the results

- **Any `FID-*` or `OVER-*` failure blocks the change.** These are correctness, not
  quality. A skill that rewrites a price or invents the author's past is worse than
  no skill.
- **A `NEW-*` / `TW-*` miss** usually means the pattern is described but not
  operational. The fix is a sharper 識別信號 line or a word-table row — not a longer
  explanation.
- **A case that fails the same way twice is a catalog bug.** Fix the source file;
  do not tune the prompt.

Record the run wherever the change is being reviewed (PR body is fine). If a run
turns up a failure worth keeping around, add it as a case — a case earns its place
by having failed once.

## Adding cases

Keep the input under three sentences. Make the input **novel** — never reuse a
catalog entry's own `改寫前`, or the agent grades itself with the answer key open.
State the expectation as something checkable ("must flag #44", "`EARLY500` survives
verbatim", "output contains no number absent from the input"), never "sounds more
natural".
