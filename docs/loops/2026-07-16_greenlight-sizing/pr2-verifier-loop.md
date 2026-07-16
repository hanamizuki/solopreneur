# feat(greenlight): objective verifier inner loop with anti-gaming guard

## Requirements

- Add a `verify` feature key to the solopreneur config system:
  - Read via the existing `read_solopreneur_config verify` cascade helper.
  - Value: a **single shell command string** — the repo's fast, deterministic
    verify entry point (lint / typecheck / fast-unit). Explicitly NOT a
    per-size command matrix. E2E and security suites never run locally
    (CI-only) — flakiness inside a bounded retry loop produces false halts.
  - Document the key in plugins/solopreneur/shared/config.md with a sample.
- In greenlight, wrap every fix dispatch in an **inner verify loop**. Applies
  to all three fix paths: Phase 2b (internal consolidation fix), Phase 3
  (external review loop fix), and post-commit mode Step 5. Uncommitted mode is
  explicitly exempt — leave that section untouched.
  - Sequence per fix round: subagent edits → run the verify command against
    the working tree (**before commit** — applies in every mode, including
    post-commit) → pass → commit + push (existing flow). Fail → feed back a
    **truncated** log (the final failing assertion / first error plus tail;
    cap the size, mirroring the existing AGY_MAX_DIFF_BYTES guard precedent in
    the same file) and let the same fix subagent retry — up to **3** verify
    attempts total. Third failure → halt (below), do not commit or push.
  - The inner loop lives INSIDE the fix subagent's instructions (edit →
    verify → iterate → only then commit); on final failure the subagent
    returns a structured halt result instead of committing.
- **Anti-gaming guard**: if the current round's findings do not reference test
  files or the verify command's definition, but the fix diff touches test
  files or the verify definition → do not commit; halt/flag with the reason.
  (At size S — introduced by a later PR — there are no internal reviewers, so
  this guard is the only defense against fix-to-pass gaming. It must land in
  this PR, not the escalation PR.)
- No `verify` key configured → skip the inner loop and add a prominent
  final-report line: "no objective verifier configured for this loop"
  (flag-style).
- **Minimal halt/flag primitive** (full taxonomy arrives in a later PR):
  - halt: stop the loop; write a payload file (last round's findings + full
    verify log + attempted-fix summary + suggested next step) under
    `docs/loops/<run>/halts/` when running inside an autopilot run dir, else
    fallback `docs/loops/<date>_greenlight-<branch>/halts/`; reference the
    path in the final report; unattended semantics = report blocked / non-zero.
  - flag: continue the loop, but record the event in a dedicated, prominent
    "Flags" section of the final report.
- Document the worst-case work bound where the inner loop is introduced: one
  short paragraph making the multiplication explicit — inner ×3 nested inside
  the existing outer rounds (PR mode 10 / post-commit 5), on top of autopilot's
  own Step 3 self-fix ×3 and wave retry ×2.

## Files to Read

- plugins/solopreneur/skills/greenlight/SKILL.md — fix dispatch points:
  Phase 2b (~line 876–892), Phase 3 fix dispatch (~line 1360–1380),
  post-commit Step 5 (~line 744–750); uncommitted mode (~line 400–475, leave
  untouched); AGY_MAX_DIFF_BYTES guard (~line 668) as the truncation precedent
- plugins/solopreneur/shared/config.md — cascade helper + existing feature-key
  documentation pattern to follow
- todos/doing/2026-07-16_greenlight-autopilot-sizing-loop-engineering.md —
  section "2. Verifier 與 stopping criterion 角色分離" (canonical design — every
  bullet under 二輪 review 補強 is in-scope for this PR) and section 4's halt
  payload location
- plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md —
  Step 3 self-fix ×3 (the precedent the inner max mirrors)

## Files to Create/Modify

- plugins/solopreneur/skills/greenlight/SKILL.md — inner verify loop at all
  three fix paths; anti-gaming guard; no-verifier flag line; minimal halt
  payload + "Flags" report section; work-bound paragraph
- plugins/solopreneur/shared/config.md — `verify` feature key documentation +
  sample config value

## Acceptance Criteria

- [ ] `grep -n "read_solopreneur_config verify" plugins/solopreneur/skills/greenlight/SKILL.md`
      returns at least one hit
- [ ] `grep -n "verify" plugins/solopreneur/shared/config.md` shows the
      feature key documented with a sample value
- [ ] All three fix paths (Phase 2b, Phase 3 fix dispatch, post-commit Step 5)
      reference the inner verify loop; the Uncommitted Mode section contains
      no verify / inner-loop references (checklist inspection)
- [ ] Every path specifies verify runs against the working tree BEFORE commit
- [ ] `grep -n -i "anti-gaming\|touches test" plugins/solopreneur/skills/greenlight/SKILL.md`
      returns a hit (guard present)
- [ ] `grep -n "halts/" plugins/solopreneur/skills/greenlight/SKILL.md`
      returns hits for both the run-dir path and the standalone fallback path
- [ ] Inner attempts capped at 3 and the log-truncation rule (last assertion /
      first error + tail; full log only in halt payload) is stated
- [ ] The worst-case work-bound paragraph exists

## Notes

- Role separation is the core of this PR: the verifier (objective, runs code)
  gates whether a fix may push; reviewer-clean (subjective) gates whether the
  loop may stop. Do not conflate them, and do not position codex/agy as
  verifiers — they read diffs statically.
- This repo's product is markdown skill instructions: write precise English
  prose matching surrounding style. Do not bump any plugin.json version.
- The /greenlight skill YOU invoke during this task runs from the installed
  plugin cache, not this repo's working tree — editing greenlight here does
  not affect your own in-flight review loop.
