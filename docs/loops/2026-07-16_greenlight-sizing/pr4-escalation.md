# feat(greenlight): escalation taxonomy + autopilot spec quality gate

## Requirements

- Unify greenlight's scattered escalation rules under a three-level taxonomy —
  **halt / flag / note** — replacing today's ad-hoc phrasing at these sites:
  - fix >20 lines (~line 1428) → flag
  - contradictory suggestions "ask the user" (~line 865) → replaced by the
    contradiction table below (unattended); attended keeps asking
  - external fallback exhausted (~line 1092) → halt, class transient-dependency
  - post-commit invariant violations (~line 322–355) → halt, class
    invariant-violation
  - PRESERVE unchanged: Phase 1 all-fail still skips to Phase 3 (~line 844) —
    it must NOT become a halt.
  - Level definitions: halt = stop + payload + report (unattended: blocked /
    non-zero); flag = continue, record in the report's prominent Flags
    section for post-hoc human review; note = normal stats.
- Extend the halt payload (introduced by the verifier PR) with a
  **`reason_class`** field: `transient-dependency` (e.g. all external
  reviewers down — retryable) | `invariant-violation` (hard stop, do not
  retry) | `authority-boundary` (refuse — human must intervene, e.g. a fix
  needs to touch a dangerous path outside the size authorization). Document
  the retry semantics of each class.
- **Attended projection**: the taxonomy is unattended-first, but greenlight is
  also run manually. Attended mode: halt → ask the user and let them decide
  (not a hard exit); flag → surface inline during the run; note → stats.
  Existing "ask the user" behaviors must map onto this projection with no
  regression.
- **Findings-contradiction handling table** (canonical: todo §4 矛盾處置表 —
  all five types, decided 2026-07-16):
  1. Same-round opposite fixes for the same code → apply neither; record both
     as pushed-back(contradiction) + **flag**.
  2. Cross-round flip-flop (a new finding would revert a previously accepted
     fix) → maintain a per-loop accepted-fixes journal, include it in the fix
     subagent's prompt; mutually-exclusive new finding → do not execute,
     pushed-back(flip-flop) + **flag**. Conservative side = the already
     accepted fix (no thrashing).
  3. Finding conflicts with the spec / size authorization → the spec wins:
     pushed-back(out-of-contract) + **note**; if the reviewer's reasoning is
     correctness-grade (implies the spec itself is wrong) → escalate to
     **flag**; if the fix would touch a dangerous path → **halt**
     (authority-boundary). Standalone runs without a spec: this type
     degenerates to type 1.
  4. Reviewer P1 vs fix-subagent false-positive push-back → **flag**
     (pre-existing decision; include in the table for completeness).
  5. Style-only contradictions → no action + **note** (never flag — keep the
     Flags section signal-dense, correctness-flavored only).
- Reconcile the autopilot orchestrator failure table with per-size rounds:
  "Review loop exceeds 3 rounds → blocked" (orchestrator.md ~line 218)
  conflicts with greenlight's per-size max rounds (3/5/10). The orchestrator
  defers to greenlight's own stopping and instead consumes the halt payload's
  `reason_class`: transient-dependency → the existing wait-and-retry path;
  invariant-violation / authority-boundary → blocked.
- **autopilot spec quality gate** (todo §5): in autopilot planning (SKILL.md
  Step 3, spec writing), require every acceptance criterion to be an
  executable command or a verifiable assertion; reject vague criteria
  ("works correctly") at planning time. `type: docs` PRs are exempt, BUT the
  exemption is cross-checked against the mechanical S whitelist from the
  sizing PR: if the PR's touched paths fall outside the pure-prose whitelist,
  the self-declared `docs` type is overridden (or at minimum flagged). Keep
  the gate a lightweight checklist prompt — no extra subagent; the real
  enforcement remains the verifier loop.
- Harden the writing principle in references/schemas.md ("acceptance criteria
  must be verifiable", ~line 181) into a pointer to the enforced gate.

## Files to Read

- plugins/solopreneur/skills/greenlight/SKILL.md — every escalation site
  listed above; the minimal halt/flag primitive and Flags section from the
  verifier PR; the sizing gates from the sizing PR
- todos/doing/2026-07-16_greenlight-autopilot-sizing-loop-engineering.md —
  sections 4 and 5 (canonical: two-question rubric, three levels,
  reason_class, attended projection, 矛盾處置表, spec gate)
- plugins/solopreneur/skills/autopilot/references/orchestrator.md — failure
  table (~line 211–221)
- plugins/solopreneur/skills/autopilot/references/schemas.md — writing
  principles (~line 178–184); plugins/solopreneur/skills/autopilot/SKILL.md —
  Step 3

## Files to Create/Modify

- plugins/solopreneur/skills/greenlight/SKILL.md — taxonomy section (levels +
  two-question rubric); reason_class in the halt payload; attended
  projection; contradiction table; rewire the scattered rules onto the levels
- plugins/solopreneur/skills/autopilot/references/orchestrator.md — failure
  table consumes reason_class instead of its own 3-round bound
- plugins/solopreneur/skills/autopilot/references/schemas.md — writing
  principle points at the enforced gate
- plugins/solopreneur/skills/autopilot/SKILL.md — Step 3 spec quality gate
  (with the type:docs cross-check)

## Acceptance Criteria

- [ ] `grep -n "reason_class" plugins/solopreneur/skills/greenlight/SKILL.md`
      returns hits and all three classes are enumerated with retry semantics
- [ ] `grep -n -i "flip-flop\|contradiction" plugins/solopreneur/skills/greenlight/SKILL.md`
      returns hits; the table covers all five decided types with their
      dispositions
- [ ] An attended-vs-unattended projection of the three levels is present
- [ ] orchestrator.md's failure table no longer contains "exceeds 3 rounds";
      it references greenlight's halt reason_class for retry-vs-blocked
- [ ] `grep -n -i "executable\|verifiable" plugins/solopreneur/skills/autopilot/SKILL.md`
      shows the Step 3 gate, including the type:docs whitelist cross-check
- [ ] Phase 1 all-fail behavior is unchanged (still skips to Phase 3 —
      checklist inspection)

## Notes

- The taxonomy mostly re-labels existing behavior; the only behavior changes
  are the ones the todo explicitly decided (contradictions no longer ask the
  user in unattended runs; orchestrator round-bound deference).
- Flags-section signal density is a design goal: style noise goes to note.
- This repo's product is markdown skill instructions: write precise English
  prose matching surrounding style. Do not bump any plugin.json version.
- The /greenlight and /merge-pr skills YOU invoke during this task run from
  the installed plugin cache, not this repo's working tree.
