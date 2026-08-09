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
| Target fingerprint | The target mode, canonical target selector, base object, head object, working-tree diff digest, recursive submodule manifest, and mutation generation reviewed by a result |
| Clean | An explicit, recipe-validated zero-finding verdict for the exact current target; silence and process success are not clean |

The working-tree digest is not merely a hash of ordinary `git diff` output. It
deterministically covers the index delta, unstaged tracked-file delta, and every
non-ignored untracked entry's relative path, entry type, executable-mode
semantics, and bytes. A symbolic link contributes its link target rather than
the target file's contents. An unreadable entry or unsupported special-file
type fails fingerprint creation instead of being omitted. This makes an
untracked source file part of the reviewed target while keeping ignored build
artifacts outside the contract.

V1 rejects dirty submodules instead of trying to hash their nested working-tree
contents. Every tracked submodule must be initialized and recursively readable,
its checked-out commit must equal the containing repository's gitlink object,
and its own index, tracked worktree, and non-ignored untracked set must be clean.
The fingerprint records a deterministic recursive identity manifest of
canonical root-relative ancestry and path, common containing gitlink object,
equal checked-out commit object, and clean-state marker. Snapshot
materialization is runner evidence, not part of this transport-neutral target
identity. Any mismatch, nested change, unreadable state, missing object, or
unsupported submodule layout fails fingerprint creation and dispatches zero
reviewers.

V1 also rejects every gitlink addition, deletion, mode change, or object change
between a selector's base and head trees. For `--uncommitted`, the `HEAD` tree,
index, and worktree gitlinks must all be identical. This deliberately leaves
submodule upgrades unsupported until each recipe proves that it can observe and
review both nested commit trees. A committed selector must make every common
gitlink object recursively readable; a missing base-side or head-side object is
ineligible even when the local checkout looks clean.

Each target mode also declares the bytes its invocation can observe. GitHub bot,
`--base`, and `--commit` modes accept only a clean working tree, so their
captured working-tree digest must represent no staged, unstaged, or non-ignored
untracked change. The `--uncommitted` mode reviews exactly those three working-
tree classes, but it does not absorb dirty submodule contents in V1. A dirty
committed-mode target or any target with a dirty, uninitialized, or
unverifiable submodule is ineligible and dispatches no reviewer; a recipe may
not bind a verdict to bytes its invocation did not see.

The parent recomputes the complete fingerprint, including the recursive
submodule manifest, at dispatch and reviewer completion; an external gate also
recomputes it during the final closing sweep. A nested byte change that leaves
the parent gitlink and generic dirty marker unchanged therefore makes
fingerprint creation fail rather than preserving an earlier clean verdict. The
event becomes stale with accepted evidence set to null under its phase policy;
when the reviewer caused the change, the stricter mutation invariant halts the
run.

The canonical target selector is reviewer-neutral: it identifies a PR range,
post-commit range, single commit, or working tree without naming a provider
command. A recipe's invocation adapter translates that selector into bot or CLI
syntax and is recorded on the review event, not in the fingerprint. Fallback
may change the invocation adapter but must preserve the canonical selector and
every fingerprint field.

A PR selector additionally binds repository identity, PR number, authoritative
lifecycle state, and published base and head objects. The lifecycle state must
remain `OPEN`; `CLOSED` or `MERGED` is stale even when both objects are
unchanged. Draft status and mergeability are separate merge-readiness concerns,
not review-byte identity. The parent engine resolves this tuple through its own
GitHub control-plane connection; reviewer output cannot supply or override it.

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
complete. The bundled specialist is required to be dispatched when available;
its unavailable or execution-failed outcome follows the visible incomplete-
advisor policy below. The explicit `external` mode remains the only user-
requested bypass of internal review.

Required entries are created before availability discovery and remain in the
frozen roster even when their capability is missing. A missing host-native
reviewer halts; a missing bundled specialist is recorded as `unavailable` and
follows the non-host-native incomplete-review policy. Neither case may be
silently omitted or rewritten as a smaller successful roster.

Every internal recipe declares a mutation policy. `claude-simplify` uses
`isolated_candidate` because Claude's bundled `/simplify` may apply changes; it
runs against a frozen source plus an independent disposable candidate workspace
and returns findings or candidate changes without mutating the Greenlight
target. All other initial internal recipes use `report_only`. Every internal
adapter must prove that the target fingerprint is unchanged before its result
is accepted.

Every candidate change returned by Simplify is normalized into an evidenced
finding with the same fix, explicit-rejection, and adjudication requirements as
any other internal finding. A raw candidate patch cannot remain outside the
disposition ledger while the run proceeds to normal pass.

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

Once availability is resolved, Greenlight must invoke every frozen-roster entry
whose status is `available`. A required unavailable entry remains visible as
`not_started` under the policy above; it is not a dispatch failure. An invocation
error remains an explicit `execution_failed` outcome; it cannot be rewritten as
not installed or silently skipped. Failure of the required host-native reviewer
halts the run because the minimum internal guarantee was not met. Failure of
another internal advisor is surfaced as an incomplete-review flag and does not,
by itself, replace the final gate's authority. Any finding already produced
remains actionable even if that reviewer later fails.

A non-host-native advisor ending in `execution_failed`, or in `timed_out` after
confirmed cancellation, does not by itself prevent a normal pass. The terminal
artifact retains an `incomplete-review` flag and identifies every incomplete
advisor; all partial findings still require disposition. This is distinct from
a degraded or manual result, which applies when the final-gate guarantee itself
is missing or manually overridden. This incomplete-review path covers a trusted
adapter that fails after valid preflight. It never covers a local CLI process
that started without valid isolation or whose completed event lacks consistent
mutation-policy and protection evidence; that is an invariant violation and
terminally halts.

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
session. If no matched peer exists, the adapter records availability without
starting a review process, so no review event can claim a selected profile.
The runner also fixes the intended execution-context kind, execution host,
selected profile identity, and mapping provenance before dispatch. An unknown
or contradictory value dispatches zero times. If the process starts and the
runner-observed actual context differs from that preflight record, the run has
crossed a credential boundary and terminally halts.

Every review event uses a discriminated execution context. `peer_cli` records
the execution host, selected peer-profile identity, and mapping provenance;
the coordinating host's own active-profile field is not a substitute.
`host_native` records the active host profile and host-capability provenance.
`github_app` records the App or bot identity, installation and repository
provenance, and an explicit not-applicable profile field. Missing, contradictory,
or wrong-kind context rejects the event rather than borrowing another kind's
identity fields. A roster entry that was never invoked uses `not_started` with
its unavailable reason and discovery provenance and null execution fields; that
context is never valid for a completed review event.

Execution context and transport are separate axes. Every invoked review event
declares `host_tool`, `local_cli`, or `github_app`; a `not_started` roster entry
marks transport not applicable. All `local_cli` events require the same
immutable-snapshot, default-deny, policy-scoped write, credential-scrub, and
egress protections below whether the recipe is internal or external and whether
its execution context is `peer_cli` or `host_native`. `host_tool` covers any in-
harness internal capability—native, bundled, or optional—whose complete
lifecycle and tool policy the parent controls, whose provider provenance remains
separately recorded, and whose parent can enforce the declared mutation policy
and exclude remote-control side effects. A capability that launches an
uncontrolled subprocess must use the isolated `local_cli` transport or remain
unavailable. Only `github_app` has no local filesystem surface.

## External reviewers and final gates

### Unified external candidate registry

GitHub reviewers and local CLIs share one registry and normalized evidence
schema, while retaining recipe-specific triggers and parsers. Initial named
candidates include Codex bot, Claude Code Review, Cursor Bugbot, Gemini Code
Assist, CodeRabbit, Greptile, Codex CLI, Claude CLI, and Antigravity CLI.
Unknown GitHub bots may contribute non-blocking advisory findings after identity
detection, but cannot become a final gate or block normal pass. Blocking
evidence additionally requires a verified GitHub App identity and repository
provenance under a registered recipe.

A recipe records its vendor or implementation group, transport, supported hosts,
supported target modes, each mode's invocation adapter and byte scope, trigger,
availability probe, response channels, completion handshake, finding parser,
clean rule, target-binding rule, blocking authority, a finite positive deadline,
timeout and termination rule, finite positive maximum retry count, a closing-
evidence kind, and whether it is eligible to gate a given host. A registered
remote `github_app` recipe with verified blocking authority additionally defines
a finite positive closing window plus event-cursor, authority-cutoff, and final-
watermark rules. A synchronous `local_cli` recipe defines a zero closing window
and marks remote cursor and watermark fields not applicable. An unverified
advisory channel uses best-effort closing evidence, marks those fields not
applicable, and cannot gate or extend a closing sweep. These recipe values are
the single timing source used by both engines. Gate
independence is implementation-level: a Codex-host reviewer in the OpenAI group
cannot gate Codex, and a Claude-host reviewer in the Anthropic group cannot gate
Claude. This contract does not claim that a vendor's undisclosed foundation-
model mix is independently verifiable.

Gate support is promoted per recipe and target mode. A clean live result for a
PR range does not certify a single commit or an uncommitted working tree, even
when those modes share a transport and parser. Adding a mode expands the
recipe's declared support only after that exact invocation path passes paired
clean and seeded-finding live fixtures.

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

An external attempt times out only at its recipe deadline. A local process must
then be cancelled and its termination confirmed before retry or fallback; if it
cannot be stopped, the run halts as an invariant violation. A remote bot recipe
defines its own bounded observation and retry handshake. Timeout fixes that
attempt's authority cutoff at the deadline; a later-observed event whose source
cursor falls on or before that cutoff remains eligible for the finite closing
sweep, while a post-cutoff event is advisory for this run. No engine may invent
an extra retry, extend a deadline, or begin fallback before the recipe's
termination rule is satisfied.

Once the primary returns a finding, the run is sticky to that primary. The
finding must be resolved or adjudicated. A target-changing fix requires the
same primary to review the new target. Greenlight must never switch to a
fallback merely to obtain an easier clean verdict. Only after that mandatory
same-primary re-review attempt may an availability-class failure use the
configured fallback. That transition records its reason, and the fallback must
review the exact post-fix target from scratch. A valid new or materially changed
finding from the re-review keeps the primary sticky; it cannot fall back. If
every eligible gate is unavailable, the run halts with a dependency reason and
never promotes a host-native self-review to final pass.

Adjudication changes only a finding's disposition; it never turns a findings
verdict into clean and never creates a target generation. If adjudication
leaves the target unchanged, the run ends immediately as `manual_non_pass` with
reason `adjudicated_gate_disagreement` and null accepted-gate evidence. If
other fixes create a new generation, the same-primary re-review still runs. A
repeat of only an exactly matched adjudicated finding ends without fallback or
another round. A false-positive recurrence uses `acknowledged_duplicate` and
the same `adjudicated_gate_disagreement` reason. An accepted-risk recurrence
uses `accepted_risk_recurrence` and reason
`accepted_risk_gate_disagreement`; it retains the finding and accepted-risk
disposition, remains non-clean, and cannot be relabeled as a false positive.
Only an explicit clean after target-changing fixes, or in a separately
initiated run, restores the normal-pass path. When a recurrence accompanies a
new or materially changed finding, only the latter remains actionable and
sticky; choosing to fix an accepted risk also returns it to the action queue.

The evidence ledger preserves every raw occurrence and records separate,
machine-readable discriminators: recipe, parser/version, normalized claim,
rule identity, severity, canonical location, canonical affected scope, and
affected-scope digest. Every field is present; a genuinely inapplicable value
is explicit `null`, never omitted or inferred from raw prose. The canonical
finding key derives from that complete tuple. An exact adjudicated recurrence
must reference the earlier adjudication and match every discriminator byte for
byte. A missing field or any difference is a new finding. Suppression removes
an exact false-positive duplicate only from the fixer/adjudication queue; it
does not remove the evidence, create clean, or authorize pass. An exact
accepted-risk recurrence receives its distinct terminal disposition rather
than `acknowledged_duplicate`; it likewise cannot create clean or pass.

### Finite closing sweep

After a candidate final gate returns clean, the parent engine starts one closing
sweep over every registered selected or collected remote attempt with verified
blocking authority. Unverified advisory channels receive only a best-effort
final sample and never extend the sweep. A normally completed remote attempt
sets its authority cutoff and closing deadline to completion plus its recipe
closing window. A timed-out remote attempt keeps the timeout cutoff and uses
timeout plus that same window as its closing deadline.

Closing evidence is discriminated rather than padded with invented fields. A
verified remote attempt records its trigger cursor, authority cutoff, positive
closing window and deadline, and final server cursor or watermark. The engine
waits only until every such attempt reaches its finite closing deadline, then
performs one final query through the parent control plane. A synchronous local
CLI attempt records a zero window, sets completion equal to its cutoff and
closing deadline, marks remote cursor and watermark fields not applicable, and
closes when the process completes. An unverified advisory attempt records
`best_effort` with remote cutoff, deadline, and final-watermark fields not
applicable; a sample failure cannot block pass or extend the sweep.

A verified blocking finding whose source cursor is at or before its remote
attempt's authority cutoff prevents pass even if it was observed after fallback
began. An event after the cutoff, or first observable only after the recorded
closing deadline, remains visible as post-run advisory evidence but cannot
retroactively change this run's result. For a verified remote attempt, failure
to obtain the final cursor, complete the query, or revalidate the target halts;
it never extends the window indefinitely or treats silence as clean.

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
engine independently rechecks every fingerprint field: mode, canonical
selector, base, head, working-tree digest, recursive submodule identity
manifest, and mutation generation. The normalized envelope records them all,
including an explicit empty manifest when the target has no submodule; a
missing or mismatched field is stale. The engine must settle and publish the
new target before asking the recipe to review again.

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

## Local CLI isolation and evidence

This section applies to every `local_cli` subprocess, including peer internal
reviewers such as `claude-simplify`, not only external final gates. A CLI process
exit code of zero means the invocation completed; it does not mean its review
succeeded. Every local CLI review must return recipe-specific structured
evidence bound to the complete requested target fingerprint. An external CLI
gate additionally returns a structured verdict and survives paired clean and
seeded-bug acceptance fixtures.

Every local CLI recipe declares `report_only` or `isolated_candidate` mutation
policy. `report_only` is mandatory for external gates and is the default for
internal reviewers. `isolated_candidate` is allowed only for an internal recipe
whose contract returns candidate changes, initially `claude-simplify`; it never
authorizes a write to the Greenlight target.

Both policies materialize a frozen source snapshot that is byte-identical to
the complete target fingerprint and preserves the Git topology needed by the
selected mode without sharing a writable inode with the source checkout. Under
`report_only`, the reviewer process tree runs with that snapshot read-only. Its
only writable paths are fresh adapter-owned cache and temporary directories
whose resolved locations cannot reach a repository, credential source, or one
another through links.

For a target with submodules, the local runner separately records recursive
materialization proof that the snapshot contains only the exact commit trees in
the identity manifest and excludes ignored submodule artifacts. A `github_app`
event retains the identity manifest but marks local materialization evidence
not applicable. Missing or contradictory required materialization evidence is
a runner-owned invariant failure under the rules below.

Under `isolated_candidate`, the engine additionally creates a fully independent
writable candidate workspace from the frozen source. The candidate workspace
may not share an inode, mutable Git control state, or writable object store with
the source snapshot or real checkout; its Git metadata is independent and read-
only while its candidate worktree files are writable. The only added write
scope is that candidate worktree. Required credentials and peer-profile inputs
remain read-only, and any provider state that must be mutable is copied into the
bounded adapter-owned cache area.

The subprocess also receives a clean control-plane environment. It gets only
the selected model provider's authentication and required egress; GitHub and
Git tokens, credential helpers, askpass programs, SSH agents and keys, keychain
access, cloud control-plane credentials, and write-capable hooks, plugins, MCP
servers, or connectors are absent. Child-process network egress is denied by
default and allowlisted only for the model provider endpoints required by the
recipe. The parent engine keeps its GitHub credentials and performs all
authoritative PR queries outside the reviewer sandbox. If credential scrubbing
or egress isolation cannot be proved at preflight, no process starts: an
external recipe is unavailable for gating and an internal recipe records its
unavailable roster outcome. Once a process has started, missing or contradictory
completion evidence for those protections is an invariant violation and
terminally halts; it cannot become fallback or incomplete-review.

The frozen source snapshot and original checkout are mechanically read-only,
and the original is otherwise unreachable when the host can omit it from the
sandbox. The source snapshot may not share a mutable Git worktree control
directory, index, refs, or writable object store with the real checkout; copied
control state is read-only, and a shared object store is allowed only through an
enforced read-only mount. Absolute paths, parent traversal, symbolic-link
escapes, hard-link aliases, shared Git metadata, and child processes remain
subject to the same deny policy. Under `isolated_candidate`, writes inside the
declared candidate worktree are allowed, while every path escape or Git-control
write remains denied. When mutation-policy, inode, Git-state, or sandbox
isolation is unavailable at preflight, the adapter dispatches zero times under
the same phase-specific unavailable policy. If a launched process cannot return
consistent evidence for that isolation, the run terminally halts. The adapter
verifies source and candidate identity and
captures the real target fingerprint before and after the call, but equal
endpoint fingerprints alone are not proof of immutability. Free-form output,
malformed schema, stale evidence, authentication failure, timeout, or any
successful target mutation is not clean. Denied-write telemetry may be retained
when a host exposes it, but observability of every rejected system call is not
the safety boundary.

Runner-owned safety evidence and reviewer-owned result evidence have different
failure semantics. The runner envelope includes transport, execution-context
kind, execution host, selected profile identity and mapping provenance for a
peer CLI, active profile plus capability/provider provenance for a host tool,
declared mutation policy, isolation, credential, egress, allowed-write boundary,
workspace destruction, and applicable engine-owned closing evidence. Missing or
contradictory runner evidence after dispatch is an invariant violation and
terminally halts. A timeout or missing, malformed, or stale reviewer payload—
including verdict, findings, or a reviewer-echoed target—does not erase an
intact runner envelope. After required termination, it follows the internal
incomplete or external invalid-result fallback policy and can never be treated
as clean.

For any PR-mode local CLI review, the parent engine verifies before dispatch
that the frozen source and local target match the selector's published
repository, PR, `OPEN` lifecycle, base, and head tuple, then queries that tuple
again at this review's completion. An external gate event verifies it a third
time at the final closing sweep; an internal event does not participate in that
external sweep. An internal result remains advisory evidence bound to its frozen
generation, so a later legitimate fix and published tuple do not retroactively
invalidate it. A concurrent advance, close, merge, or base change during the
review itself makes that event stale under its phase policy. A remote side
effect attributable to the reviewer is a reviewer mutation and terminally halts
even if the local fingerprint is unchanged.

Every local CLI reviewer is report-only with respect to the real Greenlight
target. A write inside a declared `isolated_candidate` worktree is normalized
into a candidate diff against the frozen source, then that workspace is
destroyed; it is not a target mutation. Any write outside that scope, or a write
whose origin cannot be distinguished from the reviewer, is an invariant
violation rather than an ordinary new generation: cancel the reviewer, preserve
evidence, and halt without retry or fallback. A forbidden write that restores
the original bytes before exit is still a violation; mechanical isolation must
prevent it rather than relying on a matching after-call digest. Rollback is
permitted only when the engine can
restore the exact pre-review fingerprint without overwriting an unrelated
concurrent change; even a successful rollback still requires a new human-
initiated run. Only the normal fixer may apply an adjudicated candidate diff to
the real target and create the next legitimate generation.

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
2. Every reviewer in the frozen internal roster was attempted or retained with
   an explicit unavailable outcome, and every actionable internal finding,
   including every normalized candidate change, was fixed, explicitly rejected,
   or adjudicated with evidence. A non-host-native unavailable outcome, failure,
   or confirmed-cancelled timeout remains in the result as `incomplete-review`
   but does not by itself block normal pass.
3. The selected final gate returned an explicit, schema-valid clean verdict for
   the current target fingerprint.
4. The finite closing sweep completed every kind-specific requirement, including
   every required remote deadline and final cursor, and no selected or collected
   reviewer with verified blocking authority has an unresolved finding at or
   before its authority cutoff. Unverified and post-cutoff advisory findings
   remain visible but non-blocking.
5. No commit, working-tree mutation, consolidation step, CI repair, or PR
   published-tuple or lifecycle change occurred after the accepted final-gate
   result and before the closing sweep completed.
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
| Target | Target mode, canonical target selector, base object, head object, working-tree diff digest, recursive submodule identity manifest (canonical ancestry/path, selector-common containing gitlink object, equal checked-out commit object, clean-state marker), mutation generation, and repository/PR identity plus authoritative lifecycle state and published base/head for PR mode |
| Internal roster | Recipe, required flag, availability and provenance, transport, mutation policy, discriminated execution or `not_started` context, reviewed target fingerprint, deadline, invocation and cancellation status, incomplete flag, normalized findings and candidate changes, disposition, evidence reference. Every invoked `local_cli` entry additionally requires frozen-source identity, recursive submodule materialization proof when applicable, inode and Git-state isolation, default-deny protection, provider-only credentials and egress, and credential-scrub evidence. `report_only` marks candidate-workspace fields not applicable. Every `isolated_candidate` entry regardless of transport requires frozen-source identity, recursive submodule materialization proof when applicable, candidate-workspace identity, independent inode and Git-state evidence, the declared allowed-write boundary, normalized candidate diff against the frozen source, and destruction evidence. A `host_tool` entry may not fabricate CLI-specific process-sandbox or credential fields; `host_tool + report_only` may mark snapshot fields not applicable, while `host_tool + isolated_candidate` must supply the shared frozen-source, materialization, and candidate-boundary evidence |
| External events | Common fields: recipe, implementation group, transport, target mode and recipe invocation adapter, blocking authority and provenance, discriminated execution context, trigger, attempt deadline and retry index, timeout and termination status, closing-evidence kind, late-event disposition, start and completion evidence, reviewed target, verdict, raw findings, and per finding the parser/version, normalized claim, rule identity, severity, canonical location, canonical affected scope, affected-scope digest, derived canonical key, duplicate or recurrence reference, adjudication reference, queue disposition, plus fallback reason. Every finding discriminator is present with explicit `null` when inapplicable. A verified remote kind requires trigger cursor, authority cutoff, positive closing window and deadline, and final server cursor or watermark. A synchronous-local kind requires zero closing window, completion equal to cutoff and deadline, and not-applicable remote cursor and watermark fields. A best-effort-advisory kind marks remote cursor, cutoff, deadline, and watermark not applicable and can neither gate nor extend closing. Every `local_cli` transport requires `report_only` mutation policy plus immutable-snapshot identity, recursive submodule materialization proof when applicable, inode and Git-state isolation, write-protection evidence, provider-only credentials and egress evidence, and credential-scrub results regardless of execution context; optional denied-write diagnostics are separate. A PR-mode event requires parent-observed dispatch, completion, and closing-sweep published tuples containing repository/PR identity, `OPEN` lifecycle, base, and head. A `github_app` transport retains the target's submodule identity manifest, marks mutation-policy, local-snapshot, submodule-materialization, and CLI-isolation fields not applicable, and must not fabricate them |
| Objective verification | Commands or required checks, exact target, completion and outcome |
| Terminal result | Pass, halt, failure, degraded/manual outcome, reason class, accepted gate evidence |

Parsers and test oracles consume this normalized artifact, not conversational
wording. Raw reviewer content remains available for human inspection, but no
engine infers clean by searching prose for the absence of findings.

## Acceptance matrix

| ID | Tier | Scenario | Required oracle |
| --- | --- | --- | --- |
| D01 | Deterministic | Empty optional catalog on each host; missing, execution-failed, and fake-clock stalled internal recipes | Claude and Codex include their host-native recipe plus bundled specialist even when discovery fails; neither internal recipe can gate. Missing, failed, or timed-out host-native review halts before external dispatch unless explicit `external` mode is active. A missing specialist, non-host-native failure, or confirmed-cancelled timeout remains in the roster and may continue only with `incomplete-review`; unconfirmed cancellation halts; every partial finding and candidate change remains actionable |
| D02 | Deterministic | None, one, two, and all optional integrations available; matching, missing, unknown, and mismatched peer profiles; same token with wrong provenance, same-named standalone skill, disabled provider, stale cache; injected mixed-generation internal evidence | Exact available set enters the frozen roster and every entry is scheduled once against the same captured `internal_target`, independent of S, M, or L. Every in-harness specialist or optional capability records `host_tool`, its provider provenance, execution context, and mutation policy; any separately launched reviewer records `local_cli` and its required isolation. Wrong or missing transport rejects the event. Provenance mismatch, disabled provider, and stale-cache-only inputs have stable unavailable reasons, never resolve to the registered recipe, and dispatch zero times. A mismatched fingerprint or mutation before collection completes rejects the phase; cross-host recipes appear only for an explicitly matched peer profile, and no invocation falls back to a default home or unrelated credentials |
| L03 | Authenticated live | Install and invoke Superpowers, gstack, and Ponytail on each supported host | Current-session discovery and invocation artifacts prove available-to-must-run; each event records the actual `host_tool` or `local_cli` transport, provider provenance, execution context, and mutation policy, and a local CLI path supplies its full isolation evidence. A failed invocation remains failed, not absent, while missing or wrong-kind transport rejects the event |
| L04 | Authenticated live | Claude Simplify against a seeded simplification target, directly on Claude and through an explicitly matched Codex peer profile | Every candidate change is normalized into an evidenced finding with a disposition; recipe cannot gate. Both paths declare `isolated_candidate`, bind the frozen source and any recursively materialized submodule trees to the exact target manifest, successfully write a seeded simplification only inside an independent candidate worktree, normalize its final diff against the frozen source, destroy the workspace, and leave the frozen source and real target unchanged locally and remotely. Direct execution records `host_tool` transport, valid `host_native` context, active profile plus capability/provider provenance, frozen-source identity, applicable recursive submodule materialization, equivalent candidate-boundary enforcement, and no remote-control side effect. The peer invocation records `local_cli` transport, valid `peer_cli` context, execution host, selected profile and mapping provenance, plus frozen-source identity, applicable recursive submodule materialization, candidate identity and destruction, process-tree default-deny outside the candidate worktree, provider-only credential and egress, credential-scrub, local-path/Git-state, and fake-control-plane probes. Candidate-worktree writes are accepted; source, real-target, path-escape, Git-control, and remote writes are denied. Unknown or mismatched preflight context dispatches zero times; missing or contradictory runner-observed context, host-tool frozen-source identity, or required materialization evidence after start terminally halts. Other malformed reviewer payload follows its phase policy, and a no-peer control makes no Claude call or review event |
| L05 | Authenticated live | Codex native review against a seeded correctness bug | Structured findings cover the exact target; no mutation occurs; recipe cannot gate |
| D06 | Deterministic | Host-aware external defaults before and after Bugbot calibration; requested mode is supported or unsupported by an otherwise eligible recipe | Claude resolves Codex bot then Codex CLI; Codex resolves directly to Claude CLI while Bugbot is unverified, then resolves calibrated Bugbot followed by Claude CLI after P11 passes; Antigravity appears only by explicit selection. Resolution filters by declared target mode and the presence of that recipe's invocation adapter before gate eligibility, so a PR-only recipe cannot receive post-commit or uncommitted work |
| D07 | Deterministic | Primary absent, quota-limited, timed out, malformed, recipe-authentication-failed, invalid, or repeatedly stale after bounded retry; separately, control-plane auth failure | Recipe-scoped availability outcomes select the next eligible configured candidate with the same current target and record the exact fallback reason without credential shopping. Attempt deadline, termination rule, retry ceiling, authority cutoff, and closing window come from the recipe; the engine never exceeds them or starts fallback before required termination confirmation. One stale result retries the primary first; all candidates unavailable produces halt. Control-plane auth failure halts immediately; neither path can become clean |
| D08 | Deterministic | Primary returns findings while fallback is available; a false positive or accepted risk is adjudicated with unchanged target and is optionally repeated; after unrelated fixes create a new target, re-review returns only an exact false-positive recurrence, only an exact accepted-risk recurrence, either recurrence plus a new finding, a finding with one changed discriminator, explicit clean, or an availability failure; gate returns clean while another selected or collected reviewer returns a finding before or after its authority cutoff; separately, an unverified bot emits an advisory finding | No fallback occurs before the finding is resolved and the same primary is retried after a target-changing fix. Unchanged-target adjudication and exact-only recurrence end immediately as `manual_non_pass`, `clean=false`, and null accepted-gate evidence. False positive uses `acknowledged_duplicate` plus `adjudicated_gate_disagreement` and is suppressed only from the action queue; accepted risk uses `accepted_risk_recurrence` plus `accepted_risk_gate_disagreement`, remains visibly accepted risk, and cannot masquerade as false positive or clean. Matching requires byte equality across recipe, parser/version, normalized claim, rule identity, severity, canonical location, canonical affected scope, affected-scope digest, and adjudication reference; every field is present or explicit `null`. A missing or changed discriminator, changed relevant bytes, or any additional finding is new and sticky, while an exact recurrence beside it does not re-enter the action queue unless the user elects to fix the accepted risk. Explicit same-primary clean alone restores the normal-pass path. Timeout, quota, unavailable, recipe-scoped authentication failure, invalid, or repeatedly stale evidence after a target-changing resolution may use fallback with a recorded reason against the exact new target. A verified blocking finding at or before its cutoff outranks gate clean even when observed during the finite sweep; a post-cutoff or unverified advisory remains visible but cannot block or satisfy pass |
| D09 | Deterministic | Internal advisors review generation G0 and a legitimate fixer creates and publishes G1 before the external gate; a bot or committed CLI target starts with an unclean worktree, or a bot head is unpublished; a selector adds, removes, changes mode, or changes the object of a gitlink, or its base-side object is missing; a tracked submodule is uninitialized, unreadable, checked out at a different commit, or has staged, unstaged, non-ignored untracked, or recursively nested changes; after a clean recursive dispatch, nested bytes change before completion or closing while the parent gitlink and generic dirty marker stay unchanged; preflight reports unavailable isolation or unknown/mismatched execution context; separately, an already-invoked event—including `host_tool + isolated_candidate`—omits or contradicts runner-owned transport, actual execution context, profile/provenance, frozen-source identity, required recursive materialization, applicable external closing, mutation-policy, protection, candidate-boundary, or destruction evidence; separately, a safely isolated reviewer times out or omits or malforms reviewer-owned verdict, findings, target echo, or context echo; a local CLI inherits fake GitHub, Git-helper, askpass, SSH-agent, keychain, connector, or cloud credentials and probes `git push`, PR mutation, direct API, and SSH paths; separately, PR published base/head advances or its lifecycle becomes `CLOSED` or `MERGED` with unchanged base/head during a review or external closing sweep; separately, report-only and isolated-candidate sandboxes probe frozen source, real target, candidate worktree, path escapes, and Git state | Internal evidence remains advisory and bound to G0 while the final gate and its closing sweep validate G1; the legitimate G0-to-G1 transition after internal completion does not stale or halt on the older internal tuple. An ineligible bot, `--base`, or `--commit` target dispatches zero times, leaves accepted gate evidence null, and cannot pass. Every selector-range gitlink change and every dirty, uninitialized, unreadable, commit-mismatched, or recursively unverifiable submodule fails fingerprint creation in every target mode—including `--uncommitted`—before dispatch; the accepted evidence remains null. A clean unchanged recursive control records equal common gitlink and checkout objects, completes dispatch, review, completion validation, and external closing with the same manifest, and materializes the exact commit trees without ignored artifacts for local snapshots and every isolated candidate source. A nested change after dispatch fails the completion or closing recomputation, makes the event stale, and leaves accepted evidence null even when the parent gitlink and generic dirty marker are unchanged; reviewer-originated mutation still terminally halts. Static isolation or execution-context mismatch at preflight also dispatches zero times: an internal recipe records `not_started` and unavailable under its roster policy, while an external recipe may use availability fallback. Once a process starts, missing or contradictory runner-owned safety, actual-context, or required host-tool frozen-source/materialization evidence terminally halts with no retry, fallback, or incomplete-review path. With that envelope intact, a timeout or invalid reviewer-owned result or echo follows the existing internal incomplete or external fallback policy after confirmed termination and remains non-clean. A write wholly inside a declared isolated-candidate worktree succeeds and appears only in its normalized candidate diff; the workspace is then destroyed without changing generation. The CLI receives none of the injected control-plane authority and produces zero remote calls or side effects. A published-tuple or lifecycle transition during the event's own authority window is stale and follows its phase policy. Every report-only write and every isolated-candidate write outside the candidate worktree is mechanically denied and leaves frozen source and real target unchanged; any successful out-of-scope reviewer write or remote side effect terminally halts |
| D10 | Deterministic | Bot or CLI produces no completion evidence before its recipe deadline; a timed-out remote primary emits a finding on each side of its authority cutoff | Stubbed silence becomes timeout at the same configured boundary on both engines. Required cancellation or observation termination is recorded, retry count never exceeds the recipe ceiling, and only then may the allowed fallback or halt path run. The engine waits no longer than the maximum finite remote closing deadline, obtains the final cursor for verified remote evidence, closes synchronous local evidence at confirmed process completion with remote cursor fields not applicable, blocks on a valid pre-cutoff remote finding, retains a post-cutoff event as non-blocking advisory, and halts when required final polling or cursor acquisition fails; silence never becomes clean |
| P11 | Paid opt-in live | Bugbot reviews one clean PR and one seeded-bug PR | Before trigger the worktree is clean and the parent-observed PR lifecycle is `OPEN` with captured head equal to the published PR head. Verified identity, `github_app` transport and execution context, completion channel, target-mode and canonical-selector binding, event-level invocation adapter, trigger-time lifecycle/base/head binding, recursive submodule identity manifest (explicitly empty when absent), positive zero-finding signal, finding parser, and finite cursor/cutoff/closing-window mechanics all work through the same recipe; the engine-captured digest, manifest, and generation remain unchanged through closing |
| L12 | Authenticated live | For every target mode declared by the Claude CLI recipe, review a paired clean and seeded-bug target through an explicitly matched peer profile | Each declared invocation path independently records `local_cli` transport, its recipe invocation adapter, valid `peer_cli` context, execution host, selected profile and mapping provenance, synchronous-local closing evidence with zero window and not-applicable remote cursors, then produces a schema-valid verdict containing the matching mode, canonical selector, base, head, worktree digest, recursive submodule identity manifest (explicitly empty when absent), and generation. The real adapter proves byte-identical snapshot and recursive submodule materialization, process-tree write-deny, provider-only credentials and egress, and absence of GitHub/Git/SSH/cloud authority. Sandbox and fake-control-plane probes produce no local or remote mutation. PR mode records matching parent-observed `OPEN` lifecycle and published base/head tuples at dispatch, completion, and closing, while a concurrent-advance fixture rejects stale evidence; deterministic D09 separately covers unchanged-object close and merge transitions. Unknown or mismatched context at preflight makes no call; missing or contradictory runner-observed context after start terminally halts. Other malformed reviewer output follows D07–D10; clean and findings parse through the same recipe; process success alone is insufficient; and a no-peer control makes no Claude call or review event. Initial Codex Greenlight V1 may declare PR mode only; post-commit or uncommitted support requires its own paired live evidence |
| L13 | Authenticated live | Codex CLI final gate reviews paired clean and seeded-bug targets through four distinct existing Greenlight invocation paths: PR against a base branch or ref with `--base`, a post-commit range against a base object with `--base`, one post-commit object with `--commit`, and the working tree with `--uncommitted`, all through an explicitly matched peer profile | Every call site independently records `local_cli` transport, its recipe invocation adapter, `peer_cli` execution context, execution host, selected profile identity and mapping provenance, and synchronous-local closing evidence with zero window and not-applicable remote cursors, then emits a normalized verdict containing the matching mode, canonical selector, base, head, worktree digest, recursive submodule identity manifest (explicitly empty when absent), and generation. The real adapter proves byte-identical snapshot and recursive submodule materialization, process-tree write-deny, provider-only credentials and egress, and absence of GitHub/Git/SSH/cloud authority. Sandbox and fake-control-plane probes produce no local or remote mutation. The PR path records matching parent-observed `OPEN` lifecycle and published base/head tuples at dispatch, completion, and closing, while a concurrent-advance fixture rejects stale evidence; deterministic D09 separately covers unchanged-object close and merge transitions. PR, range, and single-commit fixtures prove dirty-worktree no-dispatch, and each path has separate clean and seeded-bug evidence. A PR fixture cannot certify the post-commit-range path; if the installed CLI does not accept a base object, that mode remains unsupported. Unknown or mismatched context at preflight makes no call; missing or contradictory runner-observed context after start terminally halts. Other malformed reviewer output follows D07–D10; a no-peer control makes no Codex call or review event, L05 cannot substitute |
| L14 | Authenticated GitHub live | Codex bot reviews one clean PR and one seeded-bug PR | Before trigger the worktree is clean and the parent-observed PR lifecycle is `OPEN` with captured head equal to the published PR head. Verified bot identity, `github_app` transport and execution context, and start handshake lead to recipe-specific completion, complete findings, positive zero-finding evidence, full target-mode, canonical-selector, lifecycle/base/head, recursive submodule identity manifest (explicitly empty when absent), event-level invocation adapter, and finite cursor/cutoff/closing-window binding; the engine-captured digest, manifest, and generation remain unchanged through closing, while silence or any stale fingerprint field fails |
| D15 | Deterministic | Equivalent normalized transcript on both engines, plus wrong-kind and missing-field closing-evidence transcripts | Host default recipes and transport syntax may differ; normalized logical recipe identifiers and discriminated result schema do not drift, action sequence, invalidation, terminal state, and reason schema remain conformant, and both engines reject the same invalid closing-evidence combinations |

Deterministic cases run on every contract or engine change without network
access. Authenticated live cases run before support promotion and on a periodic
compatibility gate against pinned host versions. Bugbot calibration is paid and
creates real pull requests, so it requires explicit opt-in and sanitized saved
evidence. Every live fixture uses an isolated profile and target and records the
implementation SHA and CLI versions without storing credentials or raw private
content.

## Rollout

1. Add host, phase, provenance, implementation-group, target-mode and invocation-
   adapter, timing, evidence, and gate-eligibility metadata to the reviewer
   registry without changing runtime defaults.
2. Add internal capability discovery, frozen rosters, mutation-policy metadata,
   host-native report-only and isolated-candidate adapters, and deterministic
   cases D01 and D02. Peer local-CLI internal adapters remain unavailable until
   the shared isolation runner in step 4 is complete.
3. Introduce host-specific, mode-aware external defaults and migrate legacy
   configuration; land deterministic fallback, anti-shopping, unsupported-mode,
   stale-target, and silence cases.
4. Add the shared report-only and isolated-candidate local-CLI runner, immutable
   frozen-source enforcement, provider-only credential and egress isolation,
   parent-owned PR tuple validation, and structured Claude CLI and Codex CLI
   gate adapters; then pass L04, L12, and L13 before the corresponding peer or
   gate adapter becomes available under the new contract.
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
