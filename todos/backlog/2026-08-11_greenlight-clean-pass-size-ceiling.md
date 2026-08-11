# Greenlight's clean pass has a diff-size ceiling

**Created:** 2026-08-11
**Found by:** the A2 run 2 measurement —
[Codex Greenlight port](../../docs/spec/2026-08-10-codex-greenlight-port.md),
Acceptance → A2 run 2 (`2150588`). That section holds the full evidence; this
todo exists so the finding is decided deliberately rather than rediscovered
mid-loop.

**Not Codex-specific.** Both halves live in host-independent parts of the
skill, so every Greenlight run on every host is subject to this.

## The finding

Two shipped behaviors compose into a bound nobody chose:

1. The `claude-cli` recipe's `triggerText` *solicits* `[P1]`/`[P2]`/`[P3]`
   output — it has to, because the shipped loop parses `[P*]` tags and a CLI
   reviewer emits no structured verdict of its own.
2. Step 2b makes any new finding — a `[P3]` nit included — outrank `clean`.

A reviewer asked for nits will find something to say about anything
substantial, including work that has already passed review. Measured by
running the registry's own `triggerText` verbatim, one shot each, diff on
stdin:

| Diff handed to the gate | Verdict |
| --- | --- |
| A one-line typo fix in a comment | `No findings.` |
| A correct 6-line fixture (A2 run 2's, corrected) | `No findings.` |
| A correct 4-line docblock | 2 × `[P3]` |
| A correct 8-line docblock | 2 × `[P3]` |
| A correct ~46-line new export with its tests | 1 × `[P2]`, 2 × `[P3]` |
| `0077805` — merged, and already reviewed | `[P2]` + `[P3]` |

So **Exit Condition 1 is reachable at roughly six lines and not far beyond**,
and it is not deterministic at the boundary: correct docblocks of 4 and 8
lines drew nits where 6 drew none.

## Why it matters

A real M-size PR will terminate through push-back exit or the round cap, not
through a clean pass. That is not wrong — the loop is behaving as specified —
but it means Exit Condition 1 describes a state most real work cannot reach,
and every operator reading "runs until the PR is clean" is being told
something the loop cannot deliver at their diff size.

It also completes A2 run 1's diagnosis: that fixture's *corrected* state was a
~30-line new module, which by this measure would not have gone clean even
without the cross-round flip-flop that was blamed at the time.

## The two levers

Neither should move on the strength of one measurement.

1. **The recipe's prompt** — it solicits nits by construction. Asking only for
   `[P1]`/`[P2]` would raise the ceiling, at the cost of losing the nit signal
   that a human reviewer might want.
2. **Step 2b's precedence** — a `P3`-only round could classify as `clean`
   rather than as a new finding.

## What to do first

Measure on real PRs before touching either. The open question is not whether
the ceiling exists — that is measured — but whether it costs anything in
practice: if loops that hit the round cap were going to be adjudicated by a
human anyway, the ceiling is cosmetic. Sample a handful of real S/M/L runs
and count how many terminate at Exit Condition 1 versus push-back versus cap.

## Caveats on the measurement

- One run, one fixture, one sampling of a non-deterministic reviewer.
- CodeRabbit never contributed: "Review rate limited" in round 1, "Already
  reviewed" in round 2. The clean pass was decided by three reviewers, not
  four.
