# Greenlight cross-host review contract

**Status:** Approved design; implementation pending

**Date:** 2026-08-10

**Scope:** Greenlight behavior shared by Claude Code and Codex, beginning with
pull-request mode

**Related:** [Codex skill portability](./2026-08-09-codex-skill-portability.md),
[Codex dual-publish](./2026-07-08-codex-dual-publish.md)

## Product goal

Codex Greenlight should provide the same user-facing review loop as the current
Claude Code skill:

- run host-native and installed internal reviewers;
- trigger a selected independent final gate;
- fix findings and ask the gate to review the new PR head;
- stop only when that gate returns a clean result for the current head;
- support GitHub reviewers, local CLI reviewers, fallback, unattended operation,
  and an explicit user-selected gate.

This is a compatibility port, not a redesign of GitHub review as a distributed
transaction system. The shared contract relies on one deliberately simple
execution rule: Greenlight is the only writer while a review is in flight.

## Support boundary

The current Claude implementation remains the behavioral baseline until the
shared engine passes its baseline scenarios. Codex support is not shipped merely
because this contract exists.

Codex V1 starts with unattended pull-request mode because Autopilot depends on
that path. Uncommitted and post-commit modes may follow after PR mode passes the
same host-independent outcomes.

The contract does not claim that every optional reviewer is installed, that
every GitHub bot exposes the same response shape, or that a reviewer reads every
line with perfect accuracy. It defines which evidence Greenlight accepts and
which PR snapshot that evidence belongs to.

## Reviewer roles

### Internal reviewers

Internal reviewers are advisors. They run before the final gate, identify
problems from focused perspectives, and may cause Greenlight to fix the target.
They cannot grant final pass.

Every normal run has a host-native minimum:

| Host | Required native internal review |
| --- | --- |
| Claude Code | Claude Simplify |
| Codex | Codex native review |

The bundled `specialist-review` also runs when its adapter is available. The
following integrations are optional dependencies, but an integration detected
as callable in the current session must be invoked rather than silently skipped:

| Logical reviewer | Purpose |
| --- | --- |
| Ponytail | Over-engineering, YAGNI, and dead-code review |
| Superpowers requesting-code-review | Correctness and test-gap review |
| gstack review | Trust-boundary, SQL, side-effect, and structural review |
| Claude Simplify on Codex | Optional peer simplicity review through the matching Claude profile |

Availability means that the capability can be resolved and invoked in the
current session. A directory or stale plugin cache alone is not availability.
An invocation failure remains visible in the result and is never rewritten as
"not installed."

Internal reviews are report-only against the real target. A capability that
normally edits must use an isolated disposable copy and return candidate changes
for the parent to assess. The parent remains the only writer of the actual PR.

### Final gate

The final gate is the one independent reviewer whose clean verdict may end the
loop. It runs after internal findings have been handled and after the reviewed
commit has been pushed.

Default host-aware ladders are:

| Host | Preferred gate | Local fallback |
| --- | --- | --- |
| Claude Code | Codex GitHub bot when available | Codex CLI |
| Codex | Cursor Bugbot when its recipe can prove clean | Claude CLI |

Users may explicitly select another registered gate or configure a different
fallback order. Antigravity CLI and verified GitHub reviewers may participate
when configured. A reviewer from the same provider family as the coordinating
host may contribute advisory findings but does not satisfy the independent final
gate.

A GitHub recipe is gate-capable only after its adapter has demonstrated both a
finding signal and a positive clean signal. Until Bugbot's clean signal is
calibrated on a real repository, Codex falls back to Claude CLI rather than
guessing that silence means clean.

Internal Claude Simplify and external Claude CLI review are separate recipes and
fresh invocations. The first has a narrow simplicity lens and no pass authority;
the second performs broad final review.

## Serialized review invariant

Greenlight processes one target generation at a time. A generation is identified
by the PR head commit SHA, called `H` below.

1. Greenlight finishes all intended edits, verification, commits, and pushes.
2. It reads the authoritative PR head and freezes that SHA as `H`.
3. It triggers exactly one selected final gate for `H`.
4. From trigger until verdict, Greenlight does not edit, commit, push, rebase,
   consolidate plans, or run any other target-changing action.
5. It waits for the selected gate's clean, findings, unavailable, quota, timeout,
   or invalid-result outcome.
6. Before accepting the outcome, it confirms that the authoritative PR head is
   still `H`.
7. A finding unlocks mutation. Greenlight fixes it, verifies the change, creates
   and pushes a new head `H2`, then starts a new review generation from step 2.
8. A clean result may pass only if its evidence belongs to `H` and the PR head is
   still `H`.

The head commit contains all earlier commits in the PR branch. A review attached
to `H` therefore represents the cumulative PR state through `H`; Greenlight does
not require separate clean verdicts for each ancestor commit.

Any unexpected head change while the gate is running invalidates the generation.
Greenlight discards its verdict and reviews the new head from the beginning. It
does not attempt to reconcile concurrent writers inside the same run.

## Evidence binding

### GitHub formal reviews and inline findings

For a formal GitHub review, the review object's commit ID must equal `H`.
Finding-bearing inline comments and the parent formal review are collected only
from the current trigger window. Evidence attached solely to an earlier head
cannot close the current generation.

Codex Bot currently includes the reviewed commit in its formal review. Greenlight
uses that machine-readable commit ID rather than parsing the prose label.

### GitHub clean reactions and comments

Some bots signal clean by reacting to the exact trigger comment rather than by
creating a formal review. Greenlight accepts that shape when all of the following
are true:

- the reaction or clean comment belongs to the selected gate;
- it belongs to the trigger created for this generation;
- it appeared after that trigger;
- the PR head was `H` at trigger time and remains `H` at acceptance time;
- no current-generation finding has been collected.

Silence, an unrelated reaction, an old comment, and a response to an earlier
trigger are not clean.

### Local CLI reviews

A CLI adapter receives the exact review target and returns a structured result
containing an explicit clean or findings verdict. Process exit zero and free-form
prose alone are not clean.

Claude CLI review uses the Claude profile whose config name matches the active
Codex profile. Codex CLI review uses the matching Codex profile on Claude Code.
The adapter never guesses another profile or silently falls back to a default
home.

CLI final review is read-only. The parent checks that the target head remains
unchanged when the process finishes. Authentication failure, quota, timeout,
malformed output, or target mismatch is a non-clean outcome.

## Findings, fixes, and fallback

All internal findings are consolidated before the final gate. A final-gate
finding remains attached to its reviewed head and becomes actionable only after
the gate has finished returning that result.

After a valid finding:

- the parent evaluates and fixes accepted findings;
- the repository's objective verification command runs before push;
- the fix is committed as a new head;
- the selected gate reviews that new head again.

Greenlight does not switch reviewers merely because the selected gate found a
problem. That would be reviewer shopping. Fallback is available only when the
current gate cannot supply a usable verdict because it is unavailable, out of
quota, timed out, or returned invalid evidence.

Only one gate is authoritative at a time. Greenlight ends the previous wait
before triggering a fallback, keeps the target frozen, and binds the fallback to
the same `H`. A late result observed before terminal pass is still reported and
any concrete finding blocks pass. Greenlight does not wait forever for a gate
that has already timed out.

If every eligible gate is exhausted, an unattended run returns a structured
non-pass result. It never converts exhaustion or silence into clean.

## Pass contract

Greenlight returns normal pass only when all of the following are true:

1. The required host-native internal review completed successfully.
2. Every optional internal capability detected as available was attempted and
   its outcome was recorded.
3. The selected independent final gate produced an explicit clean result.
4. That result is bound to the frozen head `H` by the applicable evidence rule.
5. No collected current-generation finding remains unresolved.
6. The authoritative PR head still equals `H`.
7. Objective verification and required CI are green for `H`.
8. No mutation occurs after the accepted review.

If CI repair, conflict resolution, plan consolidation, or any other action
creates a new commit after Greenlight, the old pass is invalid. The caller must
run Greenlight and CI again for the new head before merge.

A push-back decision, round limit, unavailable gate, invalid result, or unresolved
finding may stop the loop, but it is a non-pass terminal result and cannot
authorize unattended merge.

## Automatic non-gate reviewers

Greenlight may collect findings from automatic GitHub reviewers in addition to
the selected gate. It records channel cursors before triggering the gate and
performs a final collection sweep before pass. A finding observed during that
bounded generation prevents clean classification.

The selected gate determines when the generation's wait ends. Greenlight does
not wait indefinitely for every optional automatic reviewer. Findings that
arrive after the final sweep are reported on the PR and handled by a later run;
this is an accepted compatibility limitation, not a promise of complete
distributed-event capture.

## Caller responsibilities

Greenlight owns mutation while its review generation is active. Callers such as
Autopilot and `merge-pr` must respect the same boundary:

- do not start a second implementation or fixer while Greenlight is waiting;
- do not consolidate or move plan files after final review unless Greenlight is
  rerun for the resulting head;
- after a CI fix, rerun Greenlight before accepting CI and merging;
- re-check the authoritative PR head immediately before merge.

Autopilot V1 therefore uses the order: implement and verify, publish, Greenlight,
CI, then merge. Any mutation after either Greenlight or CI restarts both gates
for the new head.

## Normalized result

Both host engines emit the same logical result shape. It records:

- host and mode;
- target repository, PR, base, and frozen head SHA;
- internal roster, availability, invocation, findings, and failures;
- selected gate, trigger identity, fallback reason when applicable, and provider;
- review evidence kind and reviewed commit SHA when the provider supplies one;
- normalized findings and their disposition;
- objective verification and CI status for the frozen head;
- terminal state: pass, findings, blocked, exhausted, invalid, or failed;
- final authoritative PR head and whether it still matches the reviewed head.

Provider-specific raw evidence remains linked for diagnosis, but callers make
decisions from the normalized result.

## Acceptance scenarios

The implementation must demonstrate these outcomes through the serialized
single-writer contract:

1. Claude runs Simplify; Codex runs native Codex review; neither native review
   can grant final pass.
2. Ponytail, Superpowers, gstack, and bundled specialist capabilities are invoked
   when available and skipped only when genuinely unavailable.
3. Claude selects Codex Bot or Codex CLI; Codex selects calibrated Bugbot or
   Claude CLI; explicit user selection overrides the default ladder.
4. A formal GitHub review for `H` is accepted, while the same result attached to
   an older SHA is rejected.
5. A clean reaction on the current trigger passes only while the PR head remains
   `H`; a head change invalidates it.
6. A finding on `H` is fixed into `H2`, and no old verdict can pass `H2` before a
   new review.
7. A gate timeout may advance to the next configured gate without changing `H`;
   a gate finding may not trigger reviewer shopping.
8. Claude CLI and Codex CLI each distinguish clean, findings, authentication
   failure, timeout, malformed output, and stale target.
9. A CI fix or merge-preparation commit after clean invalidates that clean and
   requires Greenlight plus CI on the new head.
10. An unattended run with no eligible final gate returns non-pass and does not
    merge.

Live acceptance uses a clean fixture and a seeded finding fixture for each
promoted external adapter. GitHub adapters additionally prove their actual clean
signal and commit-binding behavior on a real pull request.

## Rollout

1. Preserve and automate baseline scenarios for the current Claude engine.
2. Extend the reviewer registry with host, role, provider family, availability,
   invocation, clean-signal, and reviewed-head metadata.
3. Add the Codex native internal-review adapter and current-session optional
   capability discovery.
4. Add the Claude CLI final-review adapter and calibrate Bugbot's real clean and
   finding signals. Keep Claude CLI as fallback until that succeeds.
5. Add Codex unattended PR mode using the shared serialized contract and
   normalized result.
6. Fix shared caller ordering so every post-review mutation reruns Greenlight
   and CI.
7. Add Autopilot run-now, single-PR V1.
8. Port Greenlight's remaining modes, then Autopilot waves and scheduling.

## Deferred hardening

Future shared hardening may improve concurrent-writer detection, multi-gate
parallelism, crash-resume journals, GitHub App permission analysis, and stronger
late-event collection. Those improvements apply to both Claude Code and Codex.
They are not prerequisites for behavioral parity and must not block the V1 port.

## Non-goals

- Do not remove GitHub bots or reduce them to advisory-only when their recipe has
  a verified clean signal.
- Do not require GitHub bots to expose identical APIs.
- Do not maintain separate complete Greenlight bodies for Claude Code and Codex.
- Do not claim perfect review coverage from any model.
- Do not solve arbitrary concurrent repository mutation inside Greenlight V1.
- Do not let deferred hardening displace Greenlight or Autopilot implementation.

## References

- [GitHub pull request reviews API](https://docs.github.com/en/rest/pulls/reviews)
- [OpenAI Codex](https://developers.openai.com/codex/)
- [Cursor Bugbot](https://docs.cursor.com/bugbot)
- [Claude Code headless mode](https://code.claude.com/docs/en/headless)
