# Implement the Codex Greenlight port (W1-W5)

**Created:** 2026-08-10
**Spec:** [Codex Greenlight port](../../docs/spec/2026-08-10-codex-greenlight-port.md)
— the Implementation plan (W1-W5) and Acceptance (A1-A4) sections are the
authoritative work definition; this todo is the dispatch pointer.

## Scope

All five work items from the spec, measured and settled on 2026-08-10:

- **W1** — move the config helpers from the five SKILL.md bodies into
  `plugins/solopreneur/shared/config.sh`; rewrite
  `shared/tests/config-helpers.test.mjs`; clear remaining `\$N` (awk sites),
  `CLAUDE_SKILL_DIR` fallback wording, `reviewer-state.mjs` home detection.
- **W2** — `claude-cli` gate recipe (registry row, trigger command,
  availability probe, `[P*]` parsing unchanged).
- **W3** — host-aware gate independence (`family` column, host-family
  detection via `CODEX_THREAD_ID`, gate filter, host-conditional S-size
  default).
- **W4** — fix-step host-conditional wording + S/M-only V1 size bound
  (L-size halts on Codex hosts).
- **W5** — degraded-status documentation pointers.

## Suggested PR split

- **PR A: W1** — self-contained, guarded by the rewritten tests.
  Acceptance: spec A1 (determinism canary) + `grep -rE '\\\$[0-9@*{]'
  plugins/solopreneur/skills/*/SKILL.md` returns nothing + tests pass.
- **PR B: W2+W3+W4+W5** — all remaining edits concentrate in
  `greenlight/SKILL.md` + `reviewer-state.mjs`. Acceptance: spec A3
  (Claude baseline unchanged) + A4 (no same-family gate in `RESOLVED`).

Spec A2 (end-to-end seeded-finding run on a Codex host) was a post-merge
manual acceptance because it needed live reviewer loops and did not belong in
PR CI. It subsequently passed; the outcome below links to the evidence.

## Constraints

- One skill body — no forked copies (spec Goal section).
- `config.sh` carries bare `$1`/`$2`; SKILL.md bodies must not regain any
  escaped `\$N`.
- Claude Code behavior must not change (A3): same gate selection, same
  reports, drift test replaced not deleted.
- Do not touch vendored plugins.

## Outcome — done 2026-08-10

Both PRs landed via `/autopilot`
(plan: `docs/loops/2026-08-10_codex-greenlight-w1-w5/`).

| PR | Scope | Result |
|---|---|---|
| [#161](https://github.com/hanamizuki/solopreneur/pull/161) | W1 — `shared/config.sh` extraction | merged `a9b4dc8`; 2 review rounds, 2 fixed, 1 pushed back |
| [#162](https://github.com/hanamizuki/solopreneur/pull/162) | W2-W5 — `claude-cli` recipe, `family` column, host-aware gate, S/M bound, degraded docs | merged `e7613a0`; 10 review rounds, 20 fixed, 2 pushed back |

Verified independently after each merge, not taken from the subagents' reports:

- `grep -rE '\\\$[0-9@*{]' plugins/solopreneur/skills/*/SKILL.md` returns
  nothing — W1's measurable bar.
- `shared` suite 17 pass; `greenlight` suite **112 pass** (89 before this work,
  91 after W1), zero failures, no test deleted.
- Every registry recipe declares a `family`; `claude-cli` is
  `local-cli` / `anthropic`.
- **A4 behaviorally**: on a Codex host (`CODEX_THREAD_ID` set) with only
  openai-family candidates, `resolve` returns `gate: null` +
  `needsPrompt: true` and a warning naming the host-family reason; an explicit
  `--gate codex-cli` is refused the same way. On a Claude host the baseline is
  unchanged (still gates `codex-bot`) — **A3 holds**.
- With no `fallback_order` configured, a Codex host gates on `claude-cli`, and
  codex-family reviewers still run as non-gate reviewers — the V1 shape works
  end to end at the resolver level.

### PR #162 did NOT end on a clean pass — read this before trusting its review trail

The `success` the dispatched subagent reported is not a converged review. Round
10 is the L-profile cap, and the loop spent it:

```
16:31:06Z  push 8b2aeb1c        round 9's fix
16:31:22Z  @codex review        round 10 — the last one the budget allows
16:34:59Z  Codex returns 1 P2   on reviewer-state.mjs (a clean Codex pass is a 👍 reaction, not a comment)
16:37:03Z  push fed9e07         the fix for that P2
16:40:11Z  MERGED at fed9e07    no reviewer ever saw this commit
```

`unresolved=0` across all 14 threads is misleading: the last thread closed
because the finding was *fixed*, not because a round came back clean. Per
greenlight's own escalation taxonomy the budget-exhausted state is
`invariant-violation` and the orchestrator should have marked this blocked
rather than recording a merge.

This run also demonstrates, live and on the very PR that ports the skill, both
defects the spec parks in "Not in V1": review evidence bound to a stale SHA
([head-binding](./2026-08-10_greenlight-head-binding.md) — the verdict covers
`8b2aeb1c`, the merge is `fed9e07`) and the missing atomic merge precondition
([merge-pr](./2026-08-10_merge-pr-atomic-merge.md)).

`fed9e07` itself is small — 20 lines in `resolve()` plus 11 lines of test,
widening `authorized` so an explicit `--gate` counts as authorization when
classifying a halt. CI was green and the 112-test suite passes, and the A4
invariant still holds under direct behavioural probing (an explicit
`--gate codex-cli` on a Codex host is still refused). It is unreviewed, not
known-bad — but it is unreviewed.

**A2 subsequently passed.** The second end-to-end run on a real Codex host
completed the seeded-finding → fix pushed → re-review → clean terminal path;
the evidence is recorded in the Greenlight port spec. Publication of Greenlight
on Codex remains gated on
[the publication-safety todo](../backlog/2026-08-10_codex-publication-safety.md), whose
§2 now records the pre-decided `degraded` entry.
