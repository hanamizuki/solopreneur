# Codex Autopilot dependency closure

**Status:** Accepted for Codex exec, TUI, and App

**Surfaces:** Codex exec, TUI, and App

**Support level:** Degraded

**Skills:** `plan-review`, `merge-pr`

## Outcome

Autopilot Codex V1 needs two internal dependencies beyond Greenlight. This
slice publishes only the contracts Autopilot's run-now, single-PR engine will
call:

- `plan-review internal` performs pre-implementation technical and lean review
  without external-model review, adjudication, or write-back.
- `merge-pr` uses a mutation-free merge-only profile after Greenlight. It gates
  the exact head through CI and uses GitHub's atomic head precondition.

The canonical skill bodies remain shared with Claude Code. Host routing is
selected through `CODEX_THREAD_ID`; Claude's existing full flows remain the
default when it is unset.

## Plan Review Codex profile

Codex accepts only the whole-token `internal` mode. A full attended invocation
fails closed with the required Verdict line before reviewer dispatch or writes.
The internal path runs document resolution, technical vetting, the lean check,
and findings merge through R2. Stage 3, user adjudication, and write-back are
not available.

For each detected platform, reviewer selection is:

1. an available matching custom agent;
2. the built-in Codex `explorer`;
3. evidence-backed inline vetting when spawning is unavailable or rejected at
   the current thread depth.

Named reviewers use a clean-context fork (`fork_turns="none"`), which Codex
requires when selecting an agent type. The selected path is reported. A
narrated dispatch that did not create a child is not accepted. Context7 remains
optional; Codex may use web search against primary official documentation for
the same bounded API checks.

A completed `internal` review includes a severity-derived `Verdict`, Stage 1
and Stage 2 findings, and `findings only — nothing written`. A no-plan exit
emits its fail-closed Verdict and stops before those stages.

## Merge PR Codex profile

Codex skips stale-worktree cleanup and all plan consolidation. It performs no
commit or push before the merge gate, so invoking it after a clean Greenlight
result cannot replace the reviewed head with housekeeping changes.

The remaining flow is:

1. Resolve the current branch and its open PR.
2. On a linked worktree, refuse tracked modifications.
3. Pin the PR head SHA and read every Checks API page plus legacy commit status.
4. Refuse failed or still-pending CI; preserve the explicit no-CI flag path.
5. Reconfirm the head and call `gh pr merge --squash` with
   `--match-head-commit <gated-sha>`.
6. Verify GitHub reports `MERGED`, then attempt remote-branch deletion.

The current worktree and local branch are retained. Remote cleanup failure is
reported separately and never changes a verified merge into a false failure.
This profile does not itself run Greenlight; the future Autopilot engine owns
the order Greenlight → CI → merge-pr.

## Limitations

- Full attended Plan Review remains Claude-only.
- Codex Plan Review may use a generic explorer or inline vetting instead of a
  platform-specific reviewer.
- Live acceptance exercised the built-in explorer path. Custom-agent and
  depth-limited inline fallbacks remain for Autopilot V1 acceptance.
- Codex Merge PR omits plan-state consolidation and stale-worktree cleanup.
- The cleanliness and CI-parser semantics remain aligned with Claude Code:
  Step 2 checks tracked changes only and only in linked worktrees, while Step 4
  assumes its declared `jq` requirement and the expected GitHub JSON shape.
  Hardening either shared behavior is outside this parity slice.
- The merge profile requires a POSIX shell plus `git`, `gh`, `jq`,
  GitHub authentication, and GitHub network access.
- This slice does not publish Autopilot, multi-PR waves, or scheduling.

Current Codex releases expose subagent activity in the desktop App, CLI, and
IDE and provide built-in `explorer` and `worker` agents; the profile follows
that documented surface rather than Claude-specific Agent or Workflow tools.

## Acceptance

### A1 Registry and publication

Accepted. Regeneration produced no drift outside the intended files.
`./scripts/validate-plugin-packages.sh` passed the registry validator, local install
smoke, 45 Python tests, and 68 bootstrap tests; the official plugin validator
and both skill validators also passed. The publication fixture exposes its
canary plus exactly Greenlight, Plan Review, and Merge PR. The generated
production plugin exposes exactly those three skills; Autopilot remains absent.

### A2 Codex exec Plan Review internal

Accepted on Codex CLI 0.147.0. Root thread
`019ff175-295b-7680-9f0a-10cd3987d6b9` loaded the candidate skill and created
exactly one real `explorer` child,
`019ff175-b0c6-7622-b1ad-16e271ca2aec`, with `fork_turns="none"`. The run
returned a Verdict, Stage 1, Stage 2, skipped Stage 3, and ended with
`findings only — nothing written`. The before/after byte manifest was
identical.

### A3 Codex TUI Plan Review internal

Accepted in real interactive TUI thread
`019ff17a-bce3-7391-b885-e771d26a7194`. It returned the required Verdict and
Stage 1/Stage 2 report, skipped Stage 3, and left the before/after byte manifest
unchanged.

### A4 Codex App Plan Review internal

Accepted through the App protocol. Thread
`019ff17b-ff86-7ef1-aa07-ffb3ff82d35d`, turn
`019ff17c-28c0-7b91-8f86-0baebcb547d5`, received the candidate skill as an App
`skill` input item, returned the required sections, and left the before/after
byte manifest unchanged.

### A5 Merge fail-closed boundaries

Accepted by `scripts/tests/test_codex_autopilot_dependencies.py`, which extracts
and executes the actual Bash fences from the canonical skill. Missing PR,
tracked changes in a linked worktree, failed CI under the expected GitHub JSON
shape, and moved-head scenarios all stop without invoking `gh pr merge` or
deleting the remote branch.

### A6 Atomic live merge

Accepted through two complementary checks. The executable contract test runs
the exact candidate Step 5 fence and proves that it calls
`gh pr merge 42 --squash --match-head-commit old-sha`, verifies `MERGED`, and
only then deletes the remote branch. Separately, the user-authorized live merge
of PR #171 ran the same GitHub primitive against gated head
`422847e29d7e30a29af5cfa965ac09fbaac85a47`; GitHub reported `MERGED` at
2026-08-11T15:05:17Z with merge commit
`afa94c3c1dea31b6aa524313f4dfed58724141ec`. The two intended PR commits were
the only branch commits, the current worktree and local branch remained, and
the remote branch was deleted only after the merged-state check. The live
merge was an operator action, not represented as a candidate-agent invocation.

## Autopilot handoff

All dependency gates are accepted, so Autopilot Codex V1 may begin. Its PR
worker will reuse the existing lifecycle and substitute Codex-native dispatch
plus explicit worktree ownership; the dependency contracts in this document
require no Workflow or Cron emulation.
