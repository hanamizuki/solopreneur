# Codex Greenlight Phase 1

**Status:** Accepted on Codex exec — 2026-08-15. TUI and App not run; see Limitations.

**Date:** 2026-08-15

**Source shape:** `native_engines`

**Surfaces:** Codex exec (verified), Codex TUI and Codex App (inherited, unverified)

**Support level:** Degraded (unchanged)

**Skills:** `greenlight`

## Outcome

Greenlight's Phase 1 now runs on Codex. It previously did not, for a reason
that had stopped being true: the skill said Phase 1 and Phase 2 "need subagents
the host does not have". Codex creates real child threads, and
[Codex Specialist Review](./2026-08-14-codex-specialist-review.md) published
`/specialist-review` — row 4 of the Phase 1 reviewer table — with three-surface
evidence.

No new mechanism was added. Phase 1's degradation rule was already host-neutral:
every reviewer is optional, one success proceeds to Phase 2, total failure skips
to Phase 3. At M size Codex resolves exactly one of the two selected rows
(`ponytail:ponytail-review` is a third-party plugin), which that rule already
covers. The change removes a blanket skip.

## What changed

- **Host-support profile.** PR mode runs Phase 1 with whichever reviewers exist.
  `external` still skips Phase 1 + 2 when that is the caller's intent.
- **Mode-guard prose.** The skip applies only when every selected reviewer is
  unavailable, or when `external` was passed.
- **Phase 1 dispatch seam.** `run_in_background` is a Claude Code parameter, so
  Codex runs the selected reviewer skills however that host runs work — in
  thread, or one `spawn_agent` child per reviewer. The review reaches a child
  thread either way, because `/specialist-review` spawns its own per-stack
  reviewers.
- **Registry.** `dependencies` declares `solopreneur:specialist-review` — same
  plugin, already included, which is what the validator requires.

## Acceptance environment

Two environment facts cost a run each to learn, and neither is a property of the
change:

- **A read-only sandbox cannot host this acceptance.** Codex's read-only sandbox
  blocks network access, so `gh` cannot reach api.github.com and pre-flight halts
  before resolving the PR. Unlike `/specialist-review`, which only reads a local
  diff, greenlight needs GitHub.
- **A throwaway `HOME` cannot host it either.** On a Codex host greenlight's
  independent gate is `claude-cli`, probed with `claude auth status` — installed
  and authenticated are deliberately different questions. An unauthenticated
  probe halts the run with `reason_class: authority-boundary` before any review.
  The accepted runs therefore used the real `HOME` for `gh` and `claude`
  credentials, with `CODEX_HOME` still thrown away so the plugin under test was
  the generated package. No user skill shadows `greenlight` or
  `specialist-review`, so the real `HOME` does not change which file was measured.

The fixture was a disposable PR carrying a 29-line Python test file — Python so
the `*.py` row of the stack table resolves and `/specialist-review` has a stack
to dispatch for, disposable so the run's Phase 2 commits land somewhere that gets
deleted. `size=m` was passed because size is upward-only and a 29-line diff
computes as S, which skips Phase 1 by design.

## Acceptance

### A1 Registry and generation

`validate-skills-compatibility.py` accepts the new dependency; the packaged
`greenlight/SKILL.md` installed by `codex plugin add` is byte-identical to
canonical in both runs below; `validate-plugin-packages.sh` and the 48-test
suite pass.

### A2 Codex exec Phase 1 dispatch

Root thread `01a0016d-d0ed-7272-bf59-8337933776e8` resolved PR #192, computed
size M, confirmed the authenticated `claude-cli` gate, and created child
`01a0016e-fc15-7640-86e2-494dbefe69c0`. The child's rollout carries
`parent_thread_id` back to the root, `depth: 1`, `agent_path:
/root/phase1_specialist`, and `agent_role: explorer` — the first run on record
where the model set `agent_type` without being ordered to. It returned a
report; the root then recorded "Phase 1 is clean" and moved to Phase 3.

An earlier run on the same fixture (root `01a0015a-df33-7313-8929-9609ca99bee2`)
carried Phase 1 through the whole loop: Phase 2 committed and pushed two fixes,
CodeRabbit feedback was processed and resolved, and the run reached round 3
before being stopped. Phase 1 working is what this spec claims; that run is
recorded because it shows the phases downstream of it still compose.

### A3 The absent reviewer is reported

This is the criterion the first run **failed**, and the reason there are two
runs. Searching the first run's own output — agent messages, tool calls,
reasoning, excluding the echoed skill body — for `ponytail` returned **zero
hits**. The flow did not break, but the missing reviewer vanished silently,
which is the failure mode this port exists to prevent.

The wording caused it. The Codex seam said to run "each available reviewer
skill", so the model filtered before dispatching; a row that is never attempted
never fails, and the log-which-skill-was-unavailable rule is written against
failures. Both halves were corrected: the shared rule now states that a row you
never attempt counts as unavailable and gets the same line, and the seam states
that skipping the attempt does not skip the report.

The second run, on the corrected body, reports it twice — once as intent and
once as outcome:

> On Codex, the available M reviewer is `solopreneur:specialist-review`; […] the
> unavailable Ponytail row will be recorded as skipped.

> Phase 1 status: specialist ran successfully; `ponytail:ponytail-review` is
> unavailable in this Codex installation, so it is skipped per the M-profile rule.

## Limitations

- **Only Codex exec was run.** TUI and App inherit the change without their own
  evidence. The change is prose in the shared body with no per-surface
  mechanism, and both surfaces already carry Phase 3 evidence from
  `2026-08-10-codex-greenlight-port.md`, but Phase 1 on those two surfaces is
  unverified and this spec does not claim otherwise.
- **Size L still halts at pre-flight on Codex.** L wants all five Phase 1
  reviewers; three are Claude-only or third-party.
- **Phase 1 on Codex is one reviewer deep.** Rows 1–3 and 5 are `/simplify`,
  `superpowers:requesting-code-review`, gstack `/review`, and
  `ponytail:ponytail-review` — none published for Codex by this repo. An M-size
  Codex Phase 1 is `/specialist-review` alone, and its depth depends on which
  specialist knowledge plugins the user installed.
- **A Python diff reaches no knowledge skills.** The stack table routes `*.py`
  to a generic reviewer, and no Python knowledge plugin exists, so the fixture's
  Phase 1 report opened with the no-matching-skills banner. That is correct
  behaviour, not a gap — but it means this acceptance proves dispatch, while
  reading the knowledge base is proved by
  [Codex Specialist Review](./2026-08-14-codex-specialist-review.md) A2.

## References

- [Codex Specialist Review](./2026-08-14-codex-specialist-review.md) — milestone A
- [Codex Greenlight port](./2026-08-10-codex-greenlight-port.md) — the original degraded surface
- `todos/backlog/2026-08-14_codex-specialist-review-phase2.md` — milestones A and B
