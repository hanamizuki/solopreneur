# Codex Autopilot V1

**Status:** Accepted for Codex exec, TUI, and App

**Date:** 2026-08-12

**Related specs:** [Codex skill portability](./2026-08-09-codex-skill-portability.md),
[Codex Greenlight](./2026-08-10-codex-greenlight-port.md), and
[Autopilot dependency closure](./2026-08-11-codex-autopilot-dependencies.md)

## Outcome

The canonical Autopilot skill is published to Codex with one degraded but
complete execution profile: plan and run one pull request immediately. The
same child owns plan review, implementation, tests, pull-request creation,
Greenlight, exact-head CI, and Merge PR. The parent owns explicit worktree
creation, independent merge verification, cleanup, and the final report.

Claude Code keeps its existing single-PR, multi-PR, Workflow, Agent isolation,
and Cron behavior. Host selection happens before task reads or side effects.

## Supported contract

Codex V1 accepts only a natural single-PR plan followed by run-now. A multi-PR
plan or scheduling request stops before artifacts, worktrees, pull requests,
or children exist. It does not emulate Claude-specific control-plane tools.

The parent requires a clean attached `main` branch whose local head exactly
matches `origin/main`. The main-only boundary preserves Greenlight's existing
shared `main...HEAD` PR contract; stacked PRs stop before side effects instead
of being mis-sized. The parent also rejects unsafe or symlinked spec paths,
colliding local branches, branches on the single push target, and worktree paths.
It verifies the remote base without updating local refs, then atomically reserves
one sibling path and local branch at the captured base commit. Cleanup is limited
to those reservations if checkout itself fails. The parent validates the worktree's absolute root, branch,
cleanliness, and physical spec destination before writing the approved spec.

The parent selects the requested custom specialist only when that exact agent
type is callable. Otherwise it sends the same self-contained brief to Codex's
built-in worker. The child receives no conversation fork and no implicit
isolation; every repository operation is assigned to the parent's absolute
worktree path.

The child replaces Claude Plan Mode with an inline implementation plan, runs
Plan Review in internal mode, implements and tests the spec, creates a pull
request against the captured base, runs Greenlight unattended, pins CI to the
final pushed head, and invokes Merge PR. It emits only the existing result
object. The parent rejects malformed output and independently binds the
reported pull request's `headRefOid` to the exact child worktree head, then
confirms its head name, base, merged state, merge commit, and remote-base
ancestry before cleanup. It independently verifies remote-branch deletion on
the same push target with an exact-head lease and
reports exact cleanup debt without rewriting a verified merge as failure.

Failures retain the child worktree, local branch, and pull request for manual
recovery. A verified merge remains successful if later local cleanup fails;
the report carries the exact recovery action instead of rewriting remote truth.

## Dependency closure

The filtered Codex publication includes Autopilot with explicit dependencies
on Greenlight, Plan Review, and Merge PR. The profile therefore inherits their
documented requirements: repository read/write access, Bash, git, GitHub CLI,
jq, GitHub network access, and the Claude CLI gate used by Greenlight.

## Limitations

- Codex multi-PR waves and scheduling are not included.
- There is one child attempt; V1 does not emulate Workflow retries.
- Custom specialists are optional and are not required for successful use.
- A dirty, detached, non-main, unpushed, ahead, or behind base checkout is
  rejected. Stacked pull requests require a future shared Greenlight base-range
  contract and are outside Codex V1.
- Failure recovery is manual because run-now has no resumable state file.
- Greenlight and Merge PR retain the degraded contracts documented in their
  own specs.

## Acceptance

### A1 Static and hermetic contract

Accepted on Codex CLI 0.147.0. The repository test extracts and executes the
canonical preflight against a temporary repository with a bare remote, and
asserts the publication closure, worker fallback, single-child contract,
explicit base, worktree ownership, partial-checkout cleanup, symlink refusal,
PR-head binding, retained failure state, and parent remote cleanup boundary.
The filtered-publication fixture installed Autopilot plus its three
dependencies and no unsupported sibling skills. `validate-plugin-packages.sh` passed 46
Python tests, 68 bootstrap tests, registry and agent validation, generated-root
drift checks, local install smoke, and the filtered publication fixture. The
official plugin and both canonical/generated Autopilot skill validators also
passed, and the generated skill is byte-identical to its canonical source.

### A2 Live single-PR lifecycle

Accepted on Codex CLI 0.147.0. Fresh `codex exec` root thread
`019ff212-c4f6-7f71-b810-651a250ba571` created exactly one depth-1 child,
`019ff216-3a0c-7fe3-a17f-25828339bb80`, with `fork_turns="none"`. The requested
`ai-engineer` type was unavailable, so the run exercised the built-in `worker`
fallback. Plan Review internal ran inline because the documentation-only plan
matched no platform specialist and returned `Ready to implement` before the
one-line implementation.

The child opened PR #174 from `main` at head
`76907f2840ecbcfd7c1b27bfdfaabccfff80f0e9`. Its executable exact-transform,
two-file scope, and diff checks passed. Greenlight completed one round with an
independent Claude CLI gate, a clean Codex CLI review, a successful CodeRabbit
check, a Codex bot handshake, zero fixes, four evidence-backed push-backs, and
zero unresolved threads. Exact-head CI remained bound to that head. Merge PR
re-read both GitHub check surfaces and squash-merged with the atomic head
precondition as `1b0dd7f900b40a4d8a591e0cf0b73c48899379e3`.

The parent treated the child's structured success as provisional, independently
verified the pull-request identity and merged state, proved the merge commit was
on `origin/main`, and re-ran the exact-transform and two-file scope checks against
the merge commit. It then removed the explicit worktree and local branch,
confirmed the remote branch was absent, fast-forwarded the clean caller checkout,
and emitted the final report.

The first candidate run, PR #173, deliberately targeted the candidate feature
branch. Plan Review and implementation passed, but Greenlight correctly halted
before review because its shared `main...HEAD` range included the entire stacked
feature and classified it as L, which is outside the Codex Greenlight profile.
The blocked run retained its recovery state; the parent then closed the PR and
removed only its exact worktree and branches. Autopilot now rejects non-main
bases before artifacts or worktrees exist rather than attempting that known
unsupported composition.

### A3 Surface contract

Accepted for the declared degraded surface. Current Codex documentation exposes
subagents in the desktop App, CLI, and IDE, with built-in worker and explorer
roles. Codex App automatic worktrees are App-specific, so this profile relies on
ordinary git worktrees created and verified by the parent instead of claiming
automatic child isolation. The same `CODEX_THREAD_ID` profile, callable subagent
contract, filtered plugin bytes, and required capabilities are published on
Codex exec, TUI, and App. The dependency spec separately accepted Plan Review
internal in real exec, TUI, and App sessions. The end-to-end pull-request run in
A2 is exec evidence; no separate TUI or App lifecycle run is claimed.

Official references:

- <https://developers.openai.com/codex/agent-configuration/subagents>
- <https://learn.chatgpt.com/codex/environments/git-worktrees>
