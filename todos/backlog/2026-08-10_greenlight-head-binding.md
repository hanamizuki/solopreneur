# Greenlight: bind review evidence to a frozen head SHA

**Created:** 2026-08-10
**Source:** `/plan-review` of the cross-host contract (PR #157)
**Applies to:** `plugins/solopreneur/skills/greenlight/SKILL.md` (both hosts —
fixing it in the shared body fixes it for Codex too)

## Problem

`/greenlight` accepts a reviewer's clean verdict without checking which commit
that verdict is about. `grep 'head\.sha\|headRefOid'` over the skill returns
nothing: the loop's round boundaries are comment IDs and timestamps, never a
commit. A verdict that arrives late, describing a commit two pushes ago, can end
the loop.

## Shape of the fix

Add one frozen value, `H`, to the per-round cursor set that already exists
(`ROUND_TRIGGER_ID`, `GATE_TRIGGER_ID`, `GATE_REVIEW_FLOOR`, `GATE_TRIGGER_TIME`
— `SKILL.md:2058-2075`): read the authoritative PR head after the round's push,
freeze it, and re-read it before accepting any clean verdict. This is a small
delta on top of machinery that already works, not a new engine.

## Evidence shapes

Each channel binds differently. Getting this wrong is the whole risk. All
verified live against `hanamizuki/solopreneur`.

- **Findings via formal review** — the review object's `commit_id` is
  authoritative, and it is a universal GitHub field rather than a Codex-bot
  feature (CodeRabbit's reviews carry it too).

- **Findings via inline comments** — do NOT use `commit_id`. GitHub re-anchors a
  review comment's `commit_id` to the current head for as long as the comment
  stays positionable. On PR #150 (head `92defe62`), two comments from different
  rounds both reported `commit_id=92defe62` while their `original_commit_id`
  values were `048e7973` and `2893e06a`. Use `original_commit_id`, or
  `pullRequestReview.commit.oid`. The existing GraphQL query
  (`SKILL.md:2198-2212`) selects no commit field at all, so one has to be added.

- **Clean via issue comment** — Codex bot's clean verdict is a plain issue
  comment with no formal review object, so no `commit_id` exists for it. Its
  only commit binding is the abbreviated prose label in the body
  (`**Reviewed commit:** ` followed by a 10-character SHA, verified on PR #155
  and #156). Either parse it as a prefix or bind through the head re-read alone
  — but do not assume the machine-readable path covers the clean case, because
  it does not.

- **Clean via reaction** — the thumbs-up lands on the pull request, not on the
  trigger comment (`SKILL.md:2296` already reads the right endpoint). A reaction
  is unique per `(user, content, subject)`, so there is at most one codex
  thumbs-up per PR ever, and it carries no commit and no trigger reference. It
  cannot bind to a round at all. Demote it to a corroborating signal; never
  sufficient on its own.

## Rules to preserve

- **Clean authority binds to `H`; finding collection stays wide.** Rejecting a
  finding because it names an older SHA discards real feedback and inverts the
  deliberate asymmetry at `SKILL.md:2242-2247` ("Over-collecting here is safe (a
  duplicate finding is pushed back once); under-collecting silently loses review
  feedback").

- **A local CLI gate reviews local `HEAD`, not the PR head.** `codex review
  --base main` runs against the current checkout. If a push silently failed, the
  CLI reviews a snapshot that is not `H` while a remote-vs-remote head check
  still passes. Assert `git rev-parse HEAD` equals the PR head before running a
  local CLI gate.

- **A clean verdict on `H` is not cumulative for every reviewer.** CodeRabbit's
  default trigger is incremental — `reviewer-registry.mjs:53` records that `full
  review` is what re-reviews from scratch — so its clean means "nothing new since
  last time", not "the PR through `H` is clean". Either require gate recipes to
  use their full-review trigger, or record review scope per recipe.

## Open

Should the base OID be frozen alongside the head? A base branch that advances,
or a PR whose base is re-pointed, changes the effective diff without changing
`H`. Cheap to add; unclear whether it earns its keep at V1.
