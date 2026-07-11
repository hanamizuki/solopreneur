# Running the Benchmark

Run this after changing anything under `references/`. It is the only check that
tells you whether an edit to the catalog actually changed behavior.

## Before you start

```bash
python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py --check
```

Structural check only — numbering, summary lines, stale generated files. It says
nothing about whether the skill still *works*. That is what the cases are for.

## Procedure

1. Pick the cases you touched. Changed the zh catalog → run all `NEW-*` plus
   every `FID-*` and `OVER-*`. Changed only `taiwan-localization.md` → `TW-*`
   plus `FID-03`, `FID-04`. **Never skip `FID-*` and `OVER-*`**: they are the
   cases that catch a change making the skill actively harmful rather than merely
   incomplete.

2. Run each case in a **fresh subagent** — one case per agent, no shared context.
   A single agent running all 25 in one session will pattern-match on the earlier
   cases and score better than the skill deserves.

   Prompt per case:

   > Apply the humanly skill in rewrite mode to the text below.
   > Context profile: `<profile>`.
   > Return the four sections the skill specifies.
   >
   > `<input text>`

3. Score against the case's expectation:

   | Group | Pass |
   |---|---|
   | `NEW-*` | the pattern appears in *Issues found*, and the rewrite applies the fix |
   | `TW-*` | the localization is applied (or correctly withheld, for TW-03/04/05) |
   | `FID-*` | the protected string appears **verbatim** in the rewritten version |
   | `OVER-*` | the rewrite introduced no hook, aphorism, staccato run, or invented memory |

4. Record results in `results-<version>.md` next to this file: one line per case,
   pass/fail, and for failures the actual output plus a one-line diagnosis.

## Reading the results

- **Any `FID-*` or `OVER-*` failure blocks the change.** These are correctness,
  not quality. A skill that rewrites a price or invents the author's past is
  worse than no skill.
- **`NEW-*` / `TW-*` below ~80%** means the pattern is described but not
  operational. Usually the fix is a sharper 識別信號 line in the catalog entry, or
  a word-table row — not a longer explanation.
- A case that fails the same way twice is a catalog bug. Fix the source file, do
  not tune the prompt.

## Adding cases

Add one whenever you fix a real miss. A case earns its place by having failed
once. Number it in its group, keep the input under three sentences, and state the
expectation as something checkable — "must flag #44" or "`EARLY500` survives
verbatim", never "sounds more natural".
