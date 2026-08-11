# Codex Dual-Publish Pilot Findings

**Status:** The Codex 0.144.3 result is retained as historical evidence but no
longer defines the current platform limit. Codex 0.147.0 can create real custom-
agent children, and the pilot's one open harness question is now closed: the
interactive application spawns them, and so does `codex exec` on this version.
Final-byte acceptance SHA
`c8bae2710051da659afad879c226e202ad3368d4` passed complete local-path and fresh
git-ref matrices. PR #155 was squash-merged as `fc943a9` on 2026-08-09 without
changing the accepted runtime bytes. The slice is not yet included in a tagged
plugin release and does not certify marketer domain-skill parity.

**Original pilot:** 2026-07-15, Codex CLI 0.144.3, Claude Code 2.1.210
**Current calibration:** 2026-08-09, Codex CLI 0.147.0, `gpt-5.6-sol`

## Executive result

The original pilot proved installation, cache preservation, agent discovery,
and inline skill routing, but every headless prompt completed without a child
thread. That justified closing PR 112 and pausing at the marketer gate.

The current CLI has a different multi-agent surface. `multi_agent` is stable and
enabled; Sol uses V2, and calibration proved that the platform can create real
custom-agent children. The pre-redesign natural headless calibration did not
prove the redesigned router: its router-body sentinel was not observed, the
first named call used full-history inheritance and was rejected, generic
retries followed, and the run was stopped incomplete. The local-path and fresh
git-ref matrices at `954fc64` then replaced that initial calibration and
demonstrated the terminal-completion shortcut. A subsequent router wording
change means those runs are calibration rather than final-byte merge acceptance.
The new final bytes subsequently passed complete local-path and fresh per-case
git-ref acceptance. This accepts agent distribution and routing only; it does
not establish skill parity or complete content quality.

## Original 0.144.3 evidence

The isolated matrix crossed explicit and natural prompts with default and Ultra
reasoning. Each run loaded `using-marketer`, selected relevant marketing skills,
and produced a useful inline result. None created a receiver thread. Waiting on
an empty receiver and model narration were correctly rejected as delegation
evidence.

That result was scoped to `codex exec`; the original pilot did not automate the
interactive application. The conclusion should have remained version- and
harness-specific rather than a permanent statement that Codex cannot delegate.
The 2026-08-11 reproduction below measured both harnesses on one version and
found the limit was version-scoped, not harness-scoped.

The reusable facts from that run were:

- Local marketplace installation preserved the plugin's `agents/` directory in
  its exact-version cache snapshot.
- `codex plugin list --json` exposed the installed marketplace, plugin,
  version, and enabled state.
- A bootstrapped TOML with the required fields was discoverable as a custom
  agent.
- Claude Code loaded the Markdown agent and ignored a same-basename TOML
  sibling.
- A router skill could orient inline work even when spawning was unavailable.

## Why the closed implementation must not be restored

The closed PR 112 commit remains recoverable for audit, but its bootstrap and
agent prompt have correctness problems independent of delegation support:

- The bootstrap used Bash associative arrays. macOS system Bash 3.2 rejects
  them, then the multi-block skill could still report a successful no-op.
- Its cache fallback scanned leftovers when installed-plugin JSON was
  unavailable. A stale snapshot is not evidence that a plugin is active.
- Marker matching was not a complete identity contract, destination symlinks
  were unsafe, and direct copies were not atomic.
- The implementation was split across shell blocks whose variables survived
  only if an agent happened to execute them in one process.
- The marketer TOML copied a long Claude prompt verbatim, including Claude tool
  names, Claude paths, broad discovery behavior, and duplicated skill metadata.
- The old router did not account for V2's rejection of a full-history fork
  combined with a custom `agent_type`.

The correct response is a clean adapter and reconciler with independent tests,
not a revert of the revert.

## Codex 0.147.0 calibration evidence

### Tool surface

Local feature inspection reports `multi_agent` as stable and enabled. The
bundled model metadata assigns multi-agent V2 to `gpt-5.6-sol` and Terra. V2's
default history fork is full conversation history, but a custom agent-type
override is rejected with that default. The router contract therefore requires
one named-agent call with both `agent_type="marketer"` and
`fork_turns="none"` set explicitly.

### Pre-redesign calibration runs

These runs measured the V2 tool surface and cannot satisfy the rebuilt router's
live gate. A plugin path appearing in a rollout is not proof that the router
body loaded; only the unique body sentinel can establish that fact.

| Harness and prompt | Router-body evidence | Observed result | Acceptance meaning |
| --- | --- | --- | --- |
| `codex exec`, explicit marketer request | not a natural body-routing test | linked marketer child completed | platform capability only; rerun R02 |
| `codex exec`, natural cross-concern request | body sentinel not observed; path match is insufficient | first marketer call used full-history inheritance and was rejected; three generic retries followed; run stopped incomplete | failed calibration; rerun R07 |
| Interactive TUI calibration | redesigned body sentinel not established | earlier child-lifecycle observation only | platform capability only; not a live-gate result |

The explicit calibration's linked parent and child rollouts remain evidence that
Codex can create a custom marketer child. They do not establish that the current
catalog and router body cause correct natural dispatch.

### V2 observability

`codex exec --json` does not currently serialize every V2 subagent activity
event. The persisted parent rollout contains a started activity with a child
thread ID, while the child rollout contains the parent linkage and role. A
valid live gate therefore joins parent and child rollouts and also checks that
the child completed a final response. An empty wait, a narrated handoff, or a V1
event shape alone is insufficient.

### Pre-lifecycle-fix local matrix

The isolated local consumer-path matrix passed on 2026-08-09 with Codex CLI
0.147.0, `gpt-5.6-sol`, Ultra reasoning, and multi-agent V2. R02 and R07 ran
through `codex exec`; R08 and R09 ran through the interactive TUI. In every
required case, the verifier observed the router body's unique sentinel before
the routing action, exactly one `spawn_agent` call with
`agent_type="marketer"` and `fork_turns="none"`, exactly one persisted direct
marketer child, no nested spawn or generic replacement, and the child result
before the parent's first final answer and task completion.

R09 emitted one progress delivery and one final delivery from the same child.
The last delivery contained the complete persisted child final; there was no
second child or retry. R08 had a post-acceptance diagnostic turn, which the
verifier excluded by ending the acceptance scope at the first persisted task
completion. That diagnostic was not used as delegation evidence.

The optional R11 known-unavailable diagnostic also passed from a fresh consumer
home without a managed marketer agent: the router body was observed, no agent
call or child rollout occurred, and the parent completed the minimal inline
fallback. This diagnostic strengthens the failure-boundary evidence but does
not replace any required live case.

The local marketplace snapshot installed both required plugins, the bootstrap
reported an initial install followed by an unchanged second run, and the cached
source, managed user agent, and generated project agent were byte-identical.
Claude Code 2.1.226 continued to load the Markdown marketer definition while
ignoring the same-basename TOML sibling. At that checkpoint, the git-ref
R02/R07/R08/R09 matrix had not run, so the result was not by itself merge
acceptance.

This matrix covered the router before its running-child lifecycle contract was
made explicit. It remains useful calibration, but its bytes are no longer the
candidate bytes and therefore had to be repeated.

### First git-ref attempt and lifecycle finding

The published-ref install resolved the reviewed commit, reproduced the
byte-identical bootstrap, and passed R02 and R07. R08 spawned one correct
marketer child, but the coordinator treated repeated bounded polling timeouts as
a reason to send a follow-up and then interrupt the child while its status was
still running. The child had no terminal error before interruption. The prior
local R08 had needed slightly longer to complete than this coordinator allowed,
so elapsed time did not establish a stuck child. The run correctly failed the
child-final gate.

R09 from that attempt is neither a pass nor a product failure: the maintainer
harness exited after the child completed but before the root parent recorded
its own final and task completion. The corrected TUI control pins the unique root
rollout and exits only after that root records both events.

The current router gives the accepted child fifteen counted `wait_agent`
cycles with 60-second timeouts; early mailbox wake-ups still count. An exact
canonical terminal completion delivered by a wake is integrated immediately
and stops polling without `list_agents`. Only a timeout, progress-only message,
or unknown non-terminal wake requires a canonical status check. A missing path
is treated as not found. The parent forbids send, follow-up, interrupt,
duplicate work, or a final answer while the child is pending or running and
cycles remain. Exhausting the budget may interrupt a still-running child once,
but that is a delegation failure and cannot pass the live gate. A rejected
spawn, missing path, or tool-reported errored or shutdown child may enter the
zero-additional-agent inline fallback. An unexpected interrupted state surfaces
failure without inline completion.

### `954fc64` local calibration

The complete corrected local consumer-path matrix passed on 2026-08-09. R02
and R07 passed through `codex exec`; R08 and R09 passed through the interactive
TUI. Each case made exactly one `spawn_agent` call with
`agent_type="marketer"` and `fork_turns="none"`, created one direct marketer
child, created no nested or generic replacement child, delivered the complete
child final, and recorded one root-parent final answer and task completion.

The corrected coordinator used seven polling cycles for R08 and eight for R09.
It made no parent `send_message`, `followup_task`, or `interrupt_agent` call
before either child completed. The local marketplace install also reproduced
the source router and agent bytes in the installed snapshot and managed agent,
and the bootstrap reported `Installed` followed by `Unchanged`.

This result remains calibration for agent distribution and delegation on the
tested local surfaces; it does not certify marketer skill parity or complete
content quality. The router wording changed afterward, so the complete local
matrix was required to rerun on the new final bytes; that result is recorded
below.

### `954fc64` git-ref calibration

The fresh published-ref matrix passed at SHA `954fc64`. Every case used
a separate clean install that resolved that exact SHA, reproduced the source
router and agent bytes in the installed snapshot and managed agent, and
reported bootstrap `Installed` followed by `Unchanged`. R02 and R07 passed
through `codex exec`; R08 and R09 passed through the interactive TUI.

Each case made exactly one `spawn_agent` call with
`agent_type="marketer"` and `fork_turns="none"`, created exactly one direct
marketer child, and created no nested child, generic replacement, or extra root.
The complete child final was delivered, followed by the unique root parent's
final answer and task completion. Parent `send_message`, `followup_task`, and
`interrupt_agent` counts were all zero before the recorded completion.

R02 used one wait/list cycle, R07 used three, and R09 used eight. R08 used six
waits and five list checks: its sixth wait delivered the exact terminal
completion, so the coordinator correctly accepted it without another list
check. A list check is required after a timeout, progress-only, or unknown wake,
not after an exact terminal completion. The required non-sensitive result
anchors were present on the covered cases. These checks demonstrate the
distribution, routing, lifecycle, final-delivery, and recorded-anchor behavior
of `954fc64` only; they do not certify marketer skill parity or complete content
quality.

The subsequent blocker ruling changed the router wording to make the observed
shortcut normative: terminal completion integrates and stops directly, while
only timeout, progress-only, or unknown non-terminal wakes proceed to
`list_agents`. The router-byte change therefore required fresh local-path and
git-ref R02/R07/R08/R09 matrices before merge acceptance.

### Final-byte authenticated acceptance

The final-byte acceptance SHA,
`c8bae2710051da659afad879c226e202ad3368d4`, passed the complete local-path and
fresh per-case git-ref matrices. R02 and R07 passed through `codex exec`; R08
and R09 passed through the interactive TUI. Each
isolated case installed the final bytes, and both installation paths reproduced
byte-identical source, installed, and managed agent files. Bootstrap reported
`Installed` followed by `Unchanged`.

For every case, the hardened verifier recorded exactly one `spawn_agent` call
with `agent_type="marketer"` and `fork_turns="none"`, exactly one direct
marketer child, no nested or generic child and no extra root, the complete child
final, the unique root parent's final answer and task completion, the required
non-sensitive result anchors, and zero parent `send_message`, `followup_task`,
or `interrupt_agent` calls before completion.

The local wait/list counts were R02 1/0, R07 4/3, R08 9/8, and R09 11/10. The
git-ref counts were R02 1/0, R07 2/1, R08 12/11, and R09 6/5. Each last wait
delivered terminal completion directly; every earlier non-terminal wake was
followed by a list check, and all cases completed within the fifteen-cycle
budget. This satisfies the authenticated agent-distribution, routing,
lifecycle, final-delivery, and recorded-anchor gate. It does not certify
marketer skill parity or complete content quality. PR #155 was squash-merged to
`main` as `fc943a9`; a tagged plugin release remains pending.

### 2026-08-11 independent interactive-TUI reproduction

An independent reproduction settled the harness question the original pilot left
open. It used Codex CLI 0.147.0, `gpt-5.6-sol`, max reasoning, and multi-agent
V2, from a fresh isolated `HOME` and `CODEX_HOME` seeded only with a copied
credential and an empty project outside this repository. Both plugins were
installed through the local marketplace consumer path, and the bootstrapped
managed agent matched the source `marketer.toml` byte for byte.

Three runs were judged only from persisted rollouts. Model narration was
ignored.

| Run | Harness | Root thread | Child thread | Child role and depth | waits/lists |
| --- | --- | --- | --- | --- | --- |
| R02 explicit | interactive TUI | `019fee53-ddb7` | `019fee54-77e5` | `marketer`, depth 1 | 1/0 |
| R07 natural | interactive TUI | `019fee56-1987` | `019fee56-dda4` | `marketer`, depth 1 | 4/3 |
| R02 explicit | `codex exec` | `019fee58-85c3` | `019fee58-e0cc` | `marketer`, depth 1 | 2/1 |

Every root recorded exactly one `spawn_agent` call with `agent_type="marketer"`
and `fork_turns="none"`. Each child rollout carries its own subagent spawn
record naming that root as `parent_thread_id`, and root and child each recorded
a task completion. No generic, nested, or replacement child appeared, and no run
made a `send_message`, `followup_task`, or `interrupt_agent` call.

The interactive application therefore creates real subagent threads from the
router skill, and on this version so does `codex exec`. Neither harness inherits
the other's evidence for anything else.

This reproduction carried no router-body sentinel, so it does not replace the
final-byte live gate above. It is still stronger than a narration check: the
exact `agent_type` and `fork_turns` pair it observed is prescribed only by the
router, is not V2's default fork, and was accepted on the first call in every
run.

## Rebuilt PR 5a contract

### Agent adapter

The Codex marketer adapter is intentionally short. It retains the specialist
role, evidence discipline, relevant project-context rules, non-fabrication
guard, requested language and format, and usable-output expectation. It removes
Claude-specific tools and paths, avoids broad skill preload, accepts a
self-contained brief, and forbids nested delegation. Its tool-schema description
also states the exact `agent_type="marketer"` and `fork_turns="none"` contract.

The source carries an exact first-line ownership marker. TOML name, filename,
marker, plugin identity, and Markdown sibling must agree. The generated project
copy is byte-identical.

### Router

The router catalog identifies itself as the first marketing routing gate,
covers explicit marketer requests, and states the exact Codex V2 call plus the
generic/full-history no-retry rule. The router's first body rule keeps an
already-active marketer inline and forbids another delegation on both harnesses.
Otherwise it delegates explicit marketer
requests and cross-concern synthesis. Multiple deliverables delegate only when
no single installed skill fully covers all of them; a single skill's multiple
steps or outputs remain inline. It makes that routing decision before reading or
invoking a marketing domain skill. Execution then follows exactly one of three
mutually exclusive branches: an inline route makes zero agent calls and runs the
selected skills inline; a delegation route with a known-unavailable marketer
makes zero agent calls and uses the minimal inline fallback; and a delegation
route with an available marketer makes exactly one named-agent call. On V2 that
call uses `agent_type="marketer"` and `fork_turns="none"`; Claude Code uses one
named `Agent` call for `marketer`. The router never substitutes generic agents,
splits the request across agents, or retries with another type. It sends only
the self-contained brief. A rejected call, missing canonical child path, or
tool-reported errored or shutdown child permits no further delegation and uses
the minimal inline fallback. After an accepted spawn, the child owns the work
for at most fifteen `wait_agent` cycles. An exact terminal-completion wake is
integrated immediately and ends polling without a list check. Only a timeout,
progress-only message, or unknown non-terminal wake requires `list_agents` to
check the canonical child. A child still pending or running after all fifteen
cycles is interrupted once before the same fallback, but that path fails live
delegation acceptance. An unexpected interrupted state surfaces failure without
inline completion or a success claim.

### Bootstrap

One Bash 3.2-compatible script owns reconciliation. It relies exclusively on
the active installed-plugin JSON and exact cache version, accepts only known
identities from the official marketplace, validates all sources before writing,
and rejects malformed, markerless, or symlinked cache sources. Managed updates
use a mode-0600 byte-verified temporary file, reparse its marker and identity,
immediately rerun the user-layer identity scan, recheck destination ownership,
and atomically rename. A collision or unsafe path detected during that staging
recheck aborts without committing the temporary copy; this narrows the ordinary
race window without claiming atomic coordination with other config writers.
Hand-authored conflicts in base config declarations or recursively discovered
user agent files are skipped, including hidden paths. The scanner trims
file-declared names, mirrors base config `config_file` identity precedence, and
fails closed without following any symlink or non-regular path. This protects
base user-layer candidates; higher-precedence profile, project, command-line,
and managed layers remain outside its scope. Disabled agents are reported
inactive; retained managed copies from disabled or uninstalled plugins are
reported as orphans only when marker, root identity, filename, and canonical
pair all agree. This proves ownership only: `Orphaned` means no active
solopreneur source claim and remains a manual-review candidate, not proof the
file is unused or removable across higher-precedence config layers. Suspicious
combinations are skipped, and removal requires a separate config-layer audit
plus explicit user approval.

## Acceptance layers

| Layer | Evidence | Merge policy |
| --- | --- | --- |
| Agent source | TOML parse, required fields, identity, sibling, vocabulary | required CI |
| Router contract | versioned 12-case expectation fixture and static action-language checks | required CI; not live evidence |
| Bootstrap fixtures | Bash 3.2/modern Bash install, update, no-op, collision, symlink, failure, orphan cases | required CI on macOS and Linux |
| Install integration | all seven plugins install; cached bootstrap produces byte-identical agent; second run unchanged | required CI |
| Local live delegation | full R02 explicit plus R07/R08/R09 natural matrix creates linked marketer children | final-byte authenticated matrix passed at `c8bae27` |
| Git-ref live delegation | fresh published-ref install repeats the full R02/R07/R08/R09 matrix | first attempt failed; `954fc64` calibration passed; final-byte authenticated matrix passed at `c8bae27` |
| Claude compatibility | same-basename TOML remains inert | maintainer fixture |

Authenticated live acceptance is intentionally outside public CI. It requires a
real token and consumes model quota. The harness uses isolated user, Codex, and
project homes, copies only the selected authentication file, and removes the
fixture afterward. R06 remains in the static expectation fixture but is not one
of the selected live prompts. R11 and R12 define failure boundaries and may be
run as optional diagnostics; they are expectations-only and cannot replace any
of the four required cases in either installation matrix.

## Isolation requirements

Overriding only `CODEX_HOME` is insufficient on a development machine with
global merged skills. Every live run must isolate both `HOME` and `CODEX_HOME`,
use an empty project outside this repository, and install through the consumer
path. Running the prompt from the source worktree would let the generated
project TOML hide a failed bootstrap.

The authentication source must be selected from the active named configuration,
never guessed. Model and reasoning settings must be explicit so a clean fixture
does not silently inherit unrelated defaults. Cleanup must include the copied
token and persisted session rollouts.

## Remaining compatibility work

The marketer agent and router do not make every marketer skill portable. The
current inventory still includes Claude-specific execution assumptions in
`naming`, interaction and multimodal vocabulary in `slide-design`, and a Claude
configuration path in `linkedin-growth`. These belong to the later vocabulary
and workflow gate.

The current product priority is Greenlight and Autopilot in the `solopreneur`
core. Marketer domain-skill seams and the remaining five agent adapters and six
routers are deferred until the core workflow V1 is complete. When that track
resumes, each plugin still needs the same platform-language audit and live
routing sample. The large-plugin skill-context budget also remains a
measurement question; it is not answered by the isolated marketer slice.
