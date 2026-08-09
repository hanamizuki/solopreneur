# Greenlight Cross-Host Reviewer Contract

**Status:** Approved design; runtime implementation and live evidence pending

**Date:** 2026-08-10

**Scope:** Greenlight reviewer discovery, internal coverage, final-gate selection,
fallback, evidence, and pass semantics on Claude Code and Codex

**Related specs:** [Codex skill portability](./2026-08-09-codex-skill-portability.md),
[Codex dual-publish](./2026-07-08-codex-dual-publish.md)

This specification is the authority for Greenlight reviewer roles and
cross-host pass semantics. It supersedes conflicting reviewer-roster, default-
gate, and S-size behavior in the older
[reviewer-flexibility backlog](../../todos/backlog/2026-07-30_greenlight-reviewer-flexibility.md).
That implementation remains the current runtime baseline until this contract's
engine, registry, and acceptance evidence land.

## Current support boundary

This document approves a target contract; it does not claim that the current
Greenlight runtime already implements it. The current runtime remains Claude-
oriented: S skips internal review, an internal integration may be skipped after
an invocation error, and an unconfigured PR run selects the first gate resolved
from current reviewer activity plus an authenticated Codex CLI. Only a repo with
no known reviewer and no available CLI seeds Codex bot. S narrows to the gate
already selected by that resolver, while documented user config explicitly
recommends the Codex bot then Codex CLI ladder. Bugbot has no verified clean
handshake, and there is no Claude CLI gate recipe or host-aware Codex engine.
Existing tests cover that older registry and state machinery, not this cross-
host contract.

No Codex Greenlight support status changes through this documentation-only
work. Every runtime capability below remains pending until its deterministic
and live acceptance cases pass on the exact implementation bytes.

## Terms

| Term | Meaning |
| --- | --- |
| Host | The harness coordinating Greenlight: Claude Code or Codex |
| Internal reviewer | A pre-gate advisor with one review lens. It finds issues and informs fixes but cannot grant final pass |
| External reviewer | A GitHub bot or separate CLI reviewer collected after internal findings and mutations have settled |
| Final gate | The one selected external reviewer outside the active host's implementation group whose explicit clean result may authorize a Greenlight pass |
| Objective verifier | Tests, lint, type checks, or required CI. It proves executable checks are green but cannot substitute for reviewer clean |
| Target fingerprint | The base object, head object, working-tree diff digest, and mutation generation reviewed by a result |
| Clean | An explicit, recipe-validated zero-finding verdict for the exact current target; silence and process success are not clean |

Internal and external describe authority and timing, not the model vendor. The
same vendor may appear twice under different recipes. For example, a Codex-host
run may use a narrow Claude Simplify internal pass and later start a fresh,
broad Claude CLI final review. The internal result still cannot grant pass,
and it cannot be reused as final-gate evidence.

## Internal reviewer roster

### Stable logical recipes

Greenlight uses stable logical recipe identifiers rather than embedding
platform invocation syntax in policy.

| Recipe | Review lens | Source | Gate authority |
| --- | --- | --- | --- |
| `claude-simplify` | Reuse, quality, efficiency, and unnecessary complexity | Claude Code bundled Simplify capability | Never |
| `codex-native-review` | Broad correctness review from a fresh Codex review context | Codex native review capability | Never |
| `specialist-review` | Stack-specific correctness and platform conventions | Bundled solopreneur skill | Never |
| `superpowers-review` | Correctness, requirement coverage, and test gaps | Superpowers `requesting-code-review` capability | Never |
| `gstack-review` | Trust boundaries, SQL, side effects, and structural risk | gstack review capability | Never |
| `ponytail-review` | YAGNI, dead code, and over-engineering | Ponytail review capability | Never |

The logical identifier `gstack-review` avoids the `/review` collision. Claude
Code 2.1.223 and later use `/review` as an alias for the bundled
`/code-review`; the gstack adapter must therefore resolve the actual gstack
capability instead of relying on the unqualified token.

### Host matrix

| Host | Required roster | Additional reviewers when available |
| --- | --- | --- |
| Claude Code | `claude-simplify`, bundled `specialist-review` | `superpowers-review`, `gstack-review`, `ponytail-review` |
| Codex | `codex-native-review`, bundled `specialist-review` | `claude-simplify` when a matching Claude profile is available, `superpowers-review`, `gstack-review`, `ponytail-review` |

Every normal Greenlight run includes its required roster. S, M, and L control
effort, skeptic adjudication, and round ceilings; they do not silently remove a
reviewer that entered the roster. The host-native recipe is required to
complete. The bundled specialist is required to be dispatched, while its
execution failure follows the visible incomplete-advisor policy below. The
explicit `external` mode remains the only user-requested bypass of internal
review.

Claude's bundled `/simplify` may apply changes. The `claude-simplify` adapter
must therefore run against an isolated disposable target and return findings or
candidate changes without mutating the Greenlight target. Codex native review
is likewise report-only. Every internal adapter must prove that the target
fingerprint is unchanged before its result is accepted.

### Availability and provenance

The engine freezes the internal roster before dispatch, then captures one
`internal_target` fingerprint immediately before starting any reviewer. Every
internal adapter receives and must return that exact fingerprint. A mismatched
generation, or any target mutation before all internal results are collected,
rejects the internal phase as an invariant violation; the engine cannot combine
reviewer A from generation N with reviewer B from generation N+1. A provider is
available only when the active session can invoke the exact registered
capability with accepted provenance. A cache directory, cloned repository, or
same-named user skill is not sufficient evidence.

The registry stores three distinct values: the logical recipe, the expected
provider provenance, and the host-specific invocation token returned by
current-session discovery. It must not assume that a plugin-qualified catalog
identity, an unqualified skill name, and an interactive slash or at-sign token
are interchangeable. The adapter resolves the actual token for the pinned host
version, then proves that it belongs to the expected Superpowers, Ponytail, or
gstack provider. A same-named standalone skill cannot silently impersonate a
registered provider. Disabled providers and stale caches are absent, not
available. L03 freezes the real discovery artifacts for both hosts.

Once a reviewer is in the frozen roster, Greenlight must invoke it. An
invocation error remains an explicit `execution_failed` outcome; it cannot be
rewritten as not installed or silently skipped. Failure of the required host-
native reviewer halts the run because the minimum internal guarantee was not
met. Failure of another internal advisor is surfaced as an incomplete-review
flag and does not, by itself, replace the final gate's authority. Any finding
already produced remains actionable even if that reviewer later fails.

A non-host-native advisor ending in `execution_failed`, or in `timed_out` after
confirmed cancellation, does not by itself prevent a normal pass. The terminal
artifact retains an `incomplete-review` flag and identifies every incomplete
advisor; all partial findings still require disposition. This is distinct from
a degraded or manual result, which applies when the final-gate guarantee itself
is missing or manually overridden.

Every internal recipe declares a finite positive deadline measured from one
shared dispatch epoch, so the whole phase is bounded. At the deadline the
engine cancels that adapter and verifies termination. A host-native timeout
halts before external review. A non-host-native timeout may follow the
incomplete-review path only after termination is confirmed; failure to stop the
adapter is an invariant violation and halts. Late results are ignored, while
any partial finding received before cancellation remains actionable.

When one host calls the other host's CLI, profile selection must be explicit.
The adapter maps the active profile only when its identity is known and an
equivalent target profile is configured. It must not guess a default home,
silently use unrelated credentials, or fall through to a different user's
session.

## External reviewers and final gates

### Unified external candidate registry

GitHub reviewers and local CLIs share one registry and normalized evidence
schema, while retaining recipe-specific triggers and parsers. Initial named
candidates include Codex bot, Claude Code Review, Cursor Bugbot, Gemini Code
Assist, CodeRabbit, Greptile, Codex CLI, Claude CLI, and Antigravity CLI.
Unknown GitHub bots may contribute advisory findings after identity detection,
but cannot become a final gate without a verified recipe.

A recipe records its vendor or implementation group, supported hosts, trigger,
availability probe, response channels, completion handshake, finding parser,
clean rule, target-binding rule, and whether it is eligible to gate a given
host. Gate independence is implementation-level: a Codex-host reviewer in the
OpenAI group cannot gate Codex, and a Claude-host reviewer in the Anthropic
group cannot gate Claude. This contract does not claim that a vendor's
undisclosed foundation-model mix is independently verifiable.

### Host defaults

| Host | Primary final gate | Fallback final gate |
| --- | --- | --- |
| Claude Code | Codex GitHub bot | Codex CLI |
| Codex | Cursor Bugbot | Claude CLI |

This is the target ladder after eligibility filtering, not a claim that every
listed primary is gateable today. Before Bugbot passes its paid live
calibration, the Codex resolver excludes it and proceeds directly to Claude
CLI. After calibration, Bugbot becomes the primary and Claude CLI its fallback.

The arrow is an availability fallback, not a requirement to collect two clean
results. A primary may fall back only when there is no unresolved finding from
that primary and it is absent, unavailable, over quota, has a recipe-scoped
authentication failure, timed out without a valid completion signal, produced
invalid evidence, or cannot produce current-target evidence after a bounded
retry. A result that became stale during a concurrent mutation is first
discarded and retried with the same primary; it is not an immediate reason to
shop for a fallback.

A recipe-scoped authentication failure is an availability failure only when
the selected reviewer cannot use its explicitly matched credentials. It may
never cause fallback to a default home, unrelated profile, or different user's
credentials. Authentication failure in the GitHub or control plane that makes
the target or evidence unverifiable halts the run instead of trying another
reviewer under an untrusted state.

Once the primary returns a finding, the run is sticky to that primary. The
finding must be resolved or adjudicated, and the same primary reviews the new
target. Greenlight must never switch to a fallback merely to obtain an easier
clean verdict. Only after the fix and mandatory same-primary re-review attempt
may an availability-class failure use the configured fallback. That transition
records its reason, and the fallback must review the exact post-fix target from
scratch. A valid finding from the re-review keeps the primary sticky; it cannot
fall back. If every eligible gate is unavailable, the run halts with a
dependency reason and never promotes a host-native self-review to final pass.

Users may select a registered gate or a host-specific fallback order. A
selected recipe must still have a verified completion contract, cover the
current target, and belong to a gate-eligible implementation group. A same-host
or unverified reviewer may be collected as advisory evidence but cannot produce
a normal Greenlight pass. Antigravity remains an explicit selection rather than
an automatic default.

Legacy global `fallback_order` configuration maps only to the Claude-host
profile, whose historical default it described. Codex must use its host-
specific defaults unless a Codex-specific override exists; it must not inherit
the Claude ladder and let Codex review Codex as the final authority.

### GitHub bot evidence

GitHub bot silence is never clean. A gateable bot needs a verified identity,
an explicit start and completion boundary, a recipe-specific positive
zero-finding signal, complete finding collection, and proof that the result
covers the exact trigger-time base and head. Bot recipes may gate only a clean-
working-tree, committed PR target. At trigger time the engine captures the full
target fingerprint. At completion the bot proves its base and head while the
engine independently rechecks the base, head, working-tree digest, and mutation
generation. The normalized envelope records all four; a missing or mismatched
field is stale. The engine must settle and publish the new target before asking
the recipe to review again.

Bugbot is the target Codex-host primary, but it is not gateable yet. Cursor's
public documentation describes automatic PR review and manual triggers but
does not publish a stable machine-readable clean handshake or bot identity for
this repository. A paid, opt-in live calibration must prove both a clean PR and
a seeded-bug PR before `bugbot` may set `can_gate` for Codex. Until then the
resolver treats it as unavailable and selects Claude CLI.

The existing Codex bot recipe has verified identity and reaction handshake,
and the repository has observed clean and finding responses. The new engine
still must pass a paired clean and seeded-bug live fixture that proves exact-
head completion and the normalized parser before promoting that recipe under
this stricter contract. Historical success cannot substitute for target-bound
acceptance evidence.

Claude Code Review is a valid registry candidate, not a default. Anthropic
documents an exact-head check run and a machine-readable severity summary, but
the GitHub service is a paid Team or Enterprise research preview and is not
currently configured for this repository. It may gate Codex only after repo-
specific availability and evidence validation; it remains same-host advisory
coverage on Claude Code.

### CLI evidence

A CLI process exit code of zero means the invocation completed; it does not
mean the diff is clean. Every CLI gate must return a recipe-specific structured
verdict, bind it to the complete requested target fingerprint, and survive
clean and seeded-bug acceptance fixtures. The adapter captures the fingerprint
before and after the call and rejects any mismatch. Free-form output, malformed
schema, a stale target, unexpected mutation, authentication failure, or timeout
is not clean.

External CLI reviewers are report-only. A reviewer-originated write, or a write
whose origin cannot be distinguished from the reviewer, is an invariant
violation rather than an ordinary new generation: cancel the reviewer, preserve
evidence, and halt without retry or fallback. Rollback is permitted only when
the engine can restore the exact pre-review fingerprint without overwriting an
unrelated concurrent change; even a successful rollback still requires a new
human-initiated run. Candidate changes made by `claude-simplify` inside its
disposable target are not target mutations; only the normal fixer may apply an
adjudicated candidate to create the next legitimate generation.

Claude Code has no top-level `claude review` command. Its local review surface
is the bundled `/code-review` command, with `/review` as an alias, and a non-
interactive `claude -p` invocation waits for that review. The documented
terminal result remains prose even
when the outer process uses JSON output. Implementation must first test whether
`/code-review` can reliably satisfy a requested JSON schema. If it cannot, the
`claude-cli` recipe uses one dedicated read-only review prompt with the same
schema; it must not run a prose review and a second model call that merely
reinterprets the answer. It must not use `/code-review --fix` or `--comment`.

`claude-simplify` and `claude-cli` are distinct fresh sessions with distinct
prompts and evidence. Likewise, `codex-native-review` and `codex-cli` are
distinct recipes even though they share an implementation provider.

## Pass contract

Greenlight returns a normal pass only when all of the following are true:

1. The required host-native internal reviewer completed against the frozen
   internal-review target without mutating it, unless the user explicitly
   selected `external` mode.
2. Every reviewer in the frozen internal roster was attempted, and every
   actionable internal finding was fixed or explicitly adjudicated with
   evidence. A non-host-native failure or confirmed-cancelled timeout remains in
   the result as `incomplete-review` but does not by itself block normal pass.
3. The selected final gate returned an explicit, schema-valid clean verdict for
   the current target fingerprint.
4. No selected or collected reviewer has an unresolved new finding, including
   a late finding discovered by the closing sweep.
5. No commit, working-tree mutation, consolidation step, or CI repair occurred
   after the accepted final-gate result.
6. The result preserves objective-verifier state separately from reviewer
   state. Autopilot may call the result merge-ready only when required checks or
   CI are also green for the exact final head.

Any mutation increments the target generation and invalidates every earlier
clean result. A reviewer clean for an old head, a different base, or an old
working-tree digest is stale even when the branch name is unchanged.

Internal advisor evidence remains attached to the generation it reviewed after
its findings are fixed. It is not a clean result and is not reused as final-gate
evidence. The selected final gate must review the post-fix target; the engine
does not rerun every internal advisor after each mutation unless a later policy
explicitly adds that cost.

Host-native failure or timeout, unconfirmed internal cancellation, reviewer-
originated mutation, control-plane authentication failure, exhausted gate
candidates, maximum rounds, unknown host identity, and no eligible gate are
terminal non-pass outcomes. An individual external recipe's timeout, quota,
invalid output, or recipe-scoped authentication failure first follows the
fallback contract; a confirmed-cancelled non-host-native timeout follows the
incomplete-review contract. An attended user may adjudicate findings or
override workflow continuation, yet stopping without an eligible exact-target
clean result must be reported as degraded or manually accepted rather than
relabeled as Greenlight clean.

## Normalized evidence

The shared result records these facts independent of engine implementation:

| Evidence group | Required fields |
| --- | --- |
| Host | Harness, surface, version, active profile identity, implementation group |
| Target | Base object, head object, working-tree diff digest, mutation generation |
| Internal roster | Recipe, required flag, availability and provenance, reviewed target fingerprint, deadline, invocation and cancellation status, incomplete flag, findings, disposition, evidence reference |
| External events | Recipe, implementation group, trigger, start and completion evidence, reviewed target, verdict, findings, fallback reason |
| Objective verification | Commands or required checks, exact target, completion and outcome |
| Terminal result | Pass, halt, failure, degraded/manual outcome, reason class, accepted gate evidence |

Parsers and test oracles consume this normalized artifact, not conversational
wording. Raw reviewer content remains available for human inspection, but no
engine infers clean by searching prose for the absence of findings.

## Acceptance matrix

| ID | Tier | Scenario | Required oracle |
| --- | --- | --- | --- |
| D01 | Deterministic | Empty optional catalog on each host; missing, execution-failed, and fake-clock stalled internal recipes | Claude and Codex include their host-native recipe plus bundled specialist; neither internal recipe can gate; missing, failed, or timed-out host-native review halts before external dispatch unless explicit `external` mode is active. A non-host-native failure or confirmed-cancelled timeout may continue with `incomplete-review`; unconfirmed cancellation halts; every partial finding remains actionable |
| D02 | Deterministic | None, one, two, and all optional integrations available; matching, missing, unknown, and mismatched peer profiles; same token with wrong provenance, same-named standalone skill, disabled provider, stale cache; injected mixed-generation internal evidence | Exact available set enters the frozen roster and every entry is scheduled once against the same captured `internal_target`, independent of S, M, or L. Provenance mismatch, disabled provider, and stale-cache-only inputs have stable unavailable reasons, never resolve to the registered recipe, and dispatch zero times. A mismatched fingerprint or mutation before collection completes rejects the phase; cross-host recipes appear only for an explicitly matched peer profile, and no invocation falls back to a default home or unrelated credentials |
| L03 | Authenticated live | Install and invoke Superpowers, gstack, and Ponytail on each supported host | Current-session discovery and invocation artifacts prove available-to-must-run; a failed invocation remains failed, not absent |
| L04 | Authenticated live | Claude Simplify against a seeded simplification target, directly on Claude and through an explicitly matched Codex peer profile | Findings or candidate changes are captured from an isolated target; the real target fingerprint is unchanged; recipe cannot gate; the peer invocation records the selected profile and a no-peer control makes no Claude call |
| L05 | Authenticated live | Codex native review against a seeded correctness bug | Structured findings cover the exact target; no mutation occurs; recipe cannot gate |
| D06 | Deterministic | Host-aware external defaults before and after Bugbot calibration | Claude resolves Codex bot then Codex CLI; Codex resolves directly to Claude CLI while Bugbot is unverified, then resolves calibrated Bugbot followed by Claude CLI after P11 passes; Antigravity appears only by explicit selection |
| D07 | Deterministic | Primary absent, quota-limited, timed out, malformed, recipe-authentication-failed, invalid, or repeatedly stale after bounded retry; separately, control-plane auth failure | Recipe-scoped availability outcomes select the next eligible configured candidate with the same current target and record the exact fallback reason without credential shopping; one stale result retries the primary first; all candidates unavailable produces halt. Control-plane auth failure halts immediately; neither path can become clean |
| D08 | Deterministic | Primary returns findings while fallback is available; post-fix mandatory primary re-review returns a valid finding or an availability failure; separately, gate returns clean while another selected, collected, or late reviewer returns a finding | No fallback occurs before the finding is resolved and the same primary is retried; another valid finding remains sticky, while timeout, quota, unavailable, recipe-scoped authentication failure, invalid, or repeatedly stale evidence may use the fallback with a recorded reason against the exact new target; any collected finding outranks gate clean |
| D09 | Deterministic | Internal advisors review generation G0 and a legitimate fixer creates G1; a bot target starts with an unclean worktree or unpublished head; bot and CLI evidence each omit or mismatch one target-fingerprint field; separately, clean evidence is followed by head, base, worktree, or generation mutation; separately, a reviewer writes the target | Internal evidence remains advisory and bound to G0 while the final gate must review G1. An ineligible bot target dispatches zero times, leaves accepted gate evidence null, and cannot pass. Any missing or mismatched base, head, digest, or generation likewise leaves accepted gate evidence null. Ordinary mutation invalidates old clean evidence; reviewer-originated or unattributable mutation cancels the reviewer and terminally halts, and that generation can never be legitimized by a later clean result |
| D10 | Deterministic | Bot or CLI produces no completion evidence before its deadline | Stubbed silence becomes timeout and follows the allowed fallback or halt path; silence never becomes clean |
| P11 | Paid opt-in live | Bugbot reviews one clean PR and one seeded-bug PR | Before trigger the worktree is clean and captured head equals the published PR head. Verified identity, completion channel, trigger-time base-and-head binding, positive zero-finding signal, and finding parser all work through the same recipe; engine-captured digest and generation remain unchanged through completion |
| L12 | Authenticated live | Claude CLI reviews one clean target and one seeded-bug target through an explicitly matched peer profile | The real CLI emits a schema-valid verdict containing the matching base, head, worktree digest, and generation; clean and findings parse through the same recipe, process success alone is insufficient, and a no-peer control makes no Claude call; deterministic transport failures remain in D07–D10 |
| L13 | Authenticated live | Codex CLI final gate reviews one clean target and one seeded-bug target through an explicitly matched peer profile | The real external recipe records the selected profile and emits a normalized verdict containing the matching base, head, worktree digest, and generation; it distinguishes clean from process success, captures seeded findings, and never mutates the target; a no-peer control makes no Codex call, L05 internal evidence cannot substitute, and deterministic transport failures remain in D07–D10 |
| L14 | Authenticated GitHub live | Codex bot reviews one clean PR and one seeded-bug PR | Before trigger the worktree is clean and captured head equals the published PR head. Verified bot identity and start handshake lead to recipe-specific completion, complete findings, positive zero-finding evidence, and trigger-time base-and-head binding; the engine-captured digest and generation remain unchanged through completion, while silence or any stale fingerprint field fails |
| D15 | Deterministic | Equivalent normalized transcript on both engines | Host default recipes and transport syntax may differ; normalized logical recipe identifiers and result schema do not drift, and action sequence, invalidation, terminal state, and reason schema remain conformant |

Deterministic cases run on every contract or engine change without network
access. Authenticated live cases run before support promotion and on a periodic
compatibility gate against pinned host versions. Bugbot calibration is paid and
creates real pull requests, so it requires explicit opt-in and sanitized saved
evidence. Every live fixture uses an isolated profile and target and records the
implementation SHA and CLI versions without storing credentials or raw private
content.

## Rollout

1. Add host, phase, provenance, implementation-group, evidence, and gate-
   eligibility metadata to the reviewer registry without changing runtime
   defaults.
2. Add internal capability discovery, frozen rosters, report-only adapters, and
   deterministic cases D01 and D02.
3. Introduce host-specific external defaults and migrate legacy configuration;
   land deterministic fallback, anti-shopping, stale-target, and silence cases.
4. Add structured Claude CLI and Codex CLI gate adapters and pass L12 and L13
   before either can gate under the new contract.
5. Calibrate Bugbot through P11 and the Codex bot through L14. Until Bugbot
   passes, Codex resolves directly to Claude CLI.
6. Split the Claude and Codex Greenlight engines under the shared state and
   evidence contract, then pass D15 and the authenticated internal cases.
7. Promote Codex Greenlight PR mode only after the portability publication
   gates and every claimed-surface acceptance case pass.

## Non-goals

- Installing every optional reviewer automatically on either host.
- Treating an optional integration as absent after an invocation failure.
- Requiring two external clean verdicts by default.
- Letting a same-host internal review satisfy final-gate independence.
- Parsing arbitrary reviewer prose as a clean protocol.
- Claiming Bugbot, Claude CLI, or Codex Greenlight support before live evidence
  exists.

## References

- [Claude Code commands and bundled Simplify](https://code.claude.com/docs/en/commands)
- [Claude Code local code review](https://code.claude.com/docs/en/code-review#review-a-diff-locally)
- [Claude Code headless mode](https://code.claude.com/docs/en/headless)
- [Cursor Bugbot](https://docs.cursor.com/bugbot)
- [OpenAI Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [Ponytail](https://github.com/DietrichGebert/ponytail)
- [Superpowers](https://github.com/obra/superpowers)
- [gstack](https://github.com/garrytan/gstack)
