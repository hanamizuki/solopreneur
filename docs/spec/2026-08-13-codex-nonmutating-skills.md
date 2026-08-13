# Codex non-mutating skill slice

**Status:** Accepted for Codex exec, TUI, and App

**Surfaces:** Codex exec, TUI, and App

**Support level:** Degraded

**Skills:** `handoff`, `perspective`, `post-mortem`

## Outcome

The four published Codex skills are all engine work: they open worktrees, drive
reviewers, and merge pull requests. This slice publishes the first skills that
change nothing outside the transcript. Each one reads state and produces a
document; none creates a branch, a worktree, a commit, a PR, or a remote
mutation.

That property is what makes them publishable now. The fail-closed publication
boundary exists because an unaccepted side-effecting workflow must not become a
callable capability. These three have no side effect to gate — the only thing
acceptance has to establish is that the document contract holds on Codex.

The canonical skill bodies stay shared with Claude Code. Only `handoff` has a
host seam, selected through `CODEX_THREAD_ID`; `perspective` and `post-mortem`
run the same instructions on both hosts.

## Handoff Codex profile

`handoff` prints a self-contained context document and also writes it to
`/tmp/handoff/<YYYY-MM-DD>_<slug>.md`. Two Claude Code primitives appear in that
last step, and both have a Codex answer:

| Claude Code | Codex |
|---|---|
| `Write` tool | shell heredoc |
| `SendUserFile` delivery | absolute path printed on its own line |

The file write is best-effort on Codex, and this is a measured constraint rather
than a defensive guess. Under the Codex seatbelt sandbox on macOS:

```text
read-only        /tmp → denied (Operation not permitted)
workspace-write  /tmp → writable
```

So a `handoff` run under a read-only sandbox cannot produce the file. The
printed document is the deliverable and is unaffected, so a denied write is
reported, not escalated into a failed run. The Codex profile prints
`file not written: <reason>` in place of the path, and never reports a file as
delivered — there is no `SendUserFile` on Codex to deliver it with.

## Perspective Codex profile

`perspective` presents a ten-entry menu, reads the matching file from the
skill's own `references/`, and then role-plays. Nothing in that flow is
Claude-specific, so the Codex profile is the canonical body unchanged.

The one surface-level difference is turn structure, not host capability.
`codex exec` completes a single non-interactive turn, so nobody is there to
answer the menu. The perspective has to be named in the initial prompt. The TUI
and App are conversational and take the menu as written.

## Post-mortem Codex profile

`post-mortem` is git archaeology: `git rev-parse`, `git log`, `git show`,
`git diff`, and pickaxe searches, followed by a markdown report. Every command
reads. The optional save at the end asks first and only then writes under
`docs/post-mortem/`, which requires a writable workspace — under a read-only
sandbox the report still prints and the save is refused rather than silently
skipped.

As with `perspective`, `codex exec` cannot conduct the Phase 1 interview or ask
the save question within one turn; the bug description has to arrive in the
initial prompt, and an exec run stops at the printed report.

## Limitations

- `handoff` cannot deliver the file on Codex. It prints the path, or reports
  that the write was denied.
- `handoff` file writes require a workspace-write (or wider) sandbox. Under a
  read-only sandbox the document is printed and no file is produced.
- `perspective` and `post-mortem` need their input in the initial prompt on
  `codex-exec`; their interactive prompts (the perspective menu, the save
  question) only work on the conversational surfaces.
- `post-mortem`'s optional save writes inside the repository, so it inherits
  the active sandbox's workspace-write boundary.
- These three skills carry no Codex-side automation of their own. They do not
  gain agents, scheduling, or retry behaviour on any surface.
- This slice publishes no additional side-effecting workflow. `mvp`, `preview`,
  `todos-babysit`, and `worktree-handoff` keep their early host guards.

## Acceptance

Every behavioural run below used Codex CLI 0.147.0 against a throwaway
`CODEX_HOME` holding only this candidate marketplace, so the skill bytes under
test were the generated package rather than the published release.

### A1 Registry and publication

Accepted. The registry validator reports 106 classified skills with
`Codex included=7`. Regeneration produced no drift outside the intended files,
and `./scripts/validate-plugin-packages.sh` passed every gate: 46 Python tests,
the agent validator, package structure, the publication fixture, and fresh
install smoke into both a throwaway `CLAUDE_CONFIG_DIR` and a throwaway
`CODEX_HOME`.

The publication fixture asserts the generated Codex tree is exactly its canary
plus `autopilot`, `greenlight`, `handoff`, `merge-pr`, `perspective`,
`plan-review`, and `post-mortem`. The throwaway Codex install exposed exactly
those seven production skills, and the App protocol resolved
`solopreneur:handoff` and `solopreneur:perspective` to SKILL.md paths inside
the installed plugin cache — not the canonical tree.

### A2 Codex exec

Accepted. `handoff` was run twice against the final skill bytes, once per
sandbox mode, because the sandbox is the only thing that changes its outcome.

Thread `019ffa78-7bd6-73e2-8452-a5ec855f826b` ran under `workspace-write`,
which Codex reported as `workspace-write [workdir, /tmp, $TMPDIR]`. It printed
the document, wrote
`/tmp/handoff/2026-08-13_validate-codex-nonmutating-skill-slice.md`, and ended
with that absolute path on its own line. Thread
`019ffa84-eff1-72a3-a06e-e1fb507b2b1e` ran the same prompt under `read-only`.
It printed the same document and ended with
`file not written: mkdir /tmp/handoff was denied with "Operation not permitted"
by the read-only sandbox`; `/tmp/handoff` was never created. Neither run
claimed a file delivery.

Earlier threads `019ff946-ffba-7591-9ec7-dc01b3213c79` and
`019ff952-0e72-7ae3-b77c-e65a81f0c9c7` established the same two outcomes and
additionally showed the run reading `CODEX_THREAD_ID` before branching. Those
two predate one wording change: the Codex branch originally named a shell
heredoc as the write mechanism, and was widened to any host file-write
mechanism after the TUI run below used `apply_patch` instead. Every run in this
section conforms to the widened wording.

`perspective` ran as thread `019ff953-f30a-79d2-9971-382a68c31721` with the
choice named in the prompt, returning the first-activation disclaimer, the
in-character answer, and the required footer. `post-mortem` ran as thread
`019ff953-f30a-7513-ae2c-11a8b9ee891d`, produced the full report from real git
history, and printed the save question; the single exec turn ended there and
the worktree was unchanged.

### A3 Codex TUI

Accepted in two real interactive threads driven through tmux.

Thread `019ffa16-1641-7dc3-b5f2-500070fd2466` invoked `perspective` with no
choice. It presented the ten-entry menu and waited — the behaviour `codex exec`
cannot produce. Answering `3` read `munger.md` from the installed plugin cache
and returned the disclaimer, the in-character reply, and the footer.

Thread `019ffa53-6d78-72a2-8d37-aafa048c58c5` invoked `handoff` with no stated
next step. It exercised the step 1 branch: it asked one focused question with
two concrete forks and stopped, instead of guessing. After the answer it
printed the document, wrote
`/tmp/handoff/2026-08-13_codex-non-mutating-skill-slice.md`, and printed that
path as its final line. A second turn in the same thread ran `post-mortem`,
produced the report, and asked the save question; declining it wrote nothing
and did not create `docs/post-mortem/`.

This surface also emitted a Codex warning that skill descriptions were
shortened to fit the skills context budget. Nothing in this slice depends on
full description text, but the warning confirms the catalog-size question is
live once more plugins are installed together.

### A4 Codex App

Accepted through the App protocol, each skill delivered as a `skill` input item
pointing at the installed plugin cache.

`handoff` ran as thread `019ffa71-f4e0-7bc3-90a4-8f03065b2530`, turn
`019ffa71-f609-7241-90b8-be4052fcdcaf`, under `workspace-write`. It printed the
document, wrote `/tmp/handoff/2026-08-13_codex-non-mutating-skill-slice.md`,
and ended with the absolute path. `perspective` ran as thread
`019ffa73-e3dc-7613-90e6-976d2635869d`, turn
`019ffa73-e579-7522-97f3-6574b25d6b04`, and `post-mortem` as thread
`019ffa73-e3dc-70a1-9cf1-f8a6e374b56d`, turn
`019ffa73-e579-76d2-8942-935f1643ecb8`; both ran `read-only` and left the
worktree unchanged.
