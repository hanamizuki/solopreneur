---
name: mvp
description: |
  Meta-orchestrator for going from a product idea to a demo-able MVP fast.
  Drives the full flow: brainstorming → template lookup → MVP-flavored
  plan → single-subagent execution. Optimized for **time-to-first-demo**,
  not production quality — no TDD, no per-task review loops, no
  hardening. Use INSTEAD OF superpowers:brainstorming when the user is
  starting a new product from scratch — this skill calls brainstorming
  internally, then chains in template discovery, plan writing, and
  execution. Triggers: "/mvp", "我要做 app", "想做產品",
  "想做一個 app", "做個 MVP", "build a product", "build an app from
  scratch", "MVP from scratch", "start a new app", "new product".
---

# MVP Orchestrator

Drives the full new-app / new-product flow with one explicit charter:
**get to first demo fast.** Tests, edge cases, accessibility, i18n, and
refactor passes are deferred — if the user wants those later they invoke
`solopreneur:autopilot` on the same plan.

This skill is orchestration only — it does NOT reimplement brainstorming
or planning. It chains the right skills in the right order, inserts a
template lookup between brainstorming and plan writing, and runs
execution with a single implementer subagent under the MVP Charter
(rather than via `superpowers:executing-plans` /
`superpowers:subagent-driven-development`, which both enforce TDD
discipline that kills demo velocity).

## Flow

```text
0. Verify dependencies        (superpowers + ≥1 *-app-templates)
1. superpowers:brainstorming  (clarify needs + classify platform)
2. PRD visual confirmation    (render spec via /preview, user-gated)
3. Template lookup            (find matching *-app-templates; PRD↔template decision)
4. superpowers:writing-plans  (MVP-flavored plan, demo-velocity)
5. Execute the plan (MVP)     (single implementer subagent, commit per step)
```

## MVP Charter

The single source of truth for the demo-velocity tradeoffs. Step 4 passes
the **Plan-writing rules** to `superpowers:writing-plans`; Step 5 passes
the **Execution rules** and **BLOCKED handling** to the implementer
subagent. Keep both copies in sync by referencing this section, not by
restating.

> PRD visual confirmation (Step 2) is a user gate of the same nature as
> Step 1's. Both the markdown spec (source of truth) and the confirmed
> PRD are handed to `writing-plans` (Step 4). The Execution rules
> (Step 5) are unchanged — the PRD is pre-execution direction
> confirmation; it does not alter the demo-velocity execution discipline.

### Plan-writing rules (consumed by Step 4)

- Each task = a visible slice the user can see in the app / simulator.
- **Skip these categories entirely** — they're for a later hardening
  pass, not MVP:
  - Test tasks (no unit / integration / UI tests in the plan)
  - Error-handling tasks (edge cases → `TODO` comments in code, not
    plan tasks)
  - Loading / empty / error state tasks
  - Accessibility / i18n tasks
  - Performance / refactor / cleanup tasks
- Acceptance criteria for the whole plan: **"user can demo the core
  action end-to-end"**, not "all tests pass".
- Templates already encode baseline architecture — don't re-derive
  what the template provides; reference it.

### Execution rules (consumed by Step 5)

- **No TDD.** Don't write tests. After each step, run the app /
  simulator manually and check the happy path works — that is the
  verification.
- **Edge cases → `TODO` comments**, in the language's native syntax:
  `// TODO: handle X` for Swift / Kotlin / JS / TS; `# TODO: handle X`
  for Python / Ruby / shell / YAML. Final-report grep uses `TODO:` so
  both forms surface.
- **Loading / empty / error states → stub or skip.** Simplest possible
  fallback; no spinners, no skeletons, no retry logic.
- **No refactor passes, no cleanup commits.** Ship the first working
  version of each slice.
- **Trust the template.** Copy reference files as-is; only customize
  where the plan explicitly calls for it.
- **Ambiguity → simplest path forward.** Don't pause to ask unless
  genuinely BLOCKED (see below).
- **Stay within the worktree path** passed in handoff. Don't modify
  files outside it (no `~/.claude/`, sibling repos, global config).

**First action when dispatched into a fresh worktree** (created by
`isolation: "worktree"`): the auto-created branch is `worktree-agent-xxx`,
not the target branch. Rename it before doing anything else:

```
git branch -m {TARGET_BRANCH}
git branch --show-current  # confirm output equals {TARGET_BRANCH}
```

If the rename fails or the verification doesn't match, stop immediately
and report (this is BLOCKED — see handling below). Same pattern as
`solopreneur:autopilot`'s `pr-subagent-template.md`.

If already in a worktree (orchestrator didn't pass `isolation: "worktree"`),
skip the rename — assume the caller put you on the right branch.

**Commit policy: one commit per plan step.**
- After each step's implementation works (manual verify), commit and
  push. Each step is an independently revertible slice.
- Commit message: `feat(mvp): <step name>: <one-line outcome>`.
- **Before the first commit, re-verify `git branch --show-current`
  equals `{TARGET_BRANCH}` and is not `main` / `master`. Abort if
  mismatch — never push to a branch you didn't start on.**
- **First push of the run**: use `git push -u origin {TARGET_BRANCH}`
  to set upstream. Path A always needs this (fresh branch, no
  tracking). Path B may already track origin — try plain `git push`
  first; if it fails with "has no upstream branch", fall back to
  `git push -u origin {TARGET_BRANCH}`.
- Subsequent pushes: plain `git push`.

### BLOCKED handling

A step is BLOCKED only when an action genuinely cannot proceed: missing
credential, broken toolchain, plan step incoherent against current
state, external service unreachable. Ambiguity that admits a "simplest
path" is **not** BLOCKED.

- **Subagent on BLOCKED**: commit any working partial slice first, then
  return a structured report listing (a) last completed commit SHA,
  (b) the blocking step, (c) what's needed to unblock. Do not attempt
  workarounds that diverge from the plan.
- **Orchestrator on BLOCKED return**: surface the report to the user,
  do not re-dispatch automatically. User decides whether to resume,
  amend the plan, or abort.

### Stopping condition

The user can run the app / simulator and demo the **core demo action**
captured in Step 1 end-to-end. Stop there. No polishing, no hardening,
no nice-to-haves.

---

## Step 0: Verify dependencies

**Required** (check via the available-skills list in the system-reminder):
- `superpowers:brainstorming`
- `superpowers:writing-plans`

**Expected (≥1)**: any skill matching `*-app-templates`
(e.g. `ios-dev:ios-app-templates`, `ai-engineer:ai-app-templates`).

Missing required skill → stop and tell the user what to install.
No `*-app-templates` → continue with a warning that the plan will be
freeform (no template baseline).

## Step 1: Brainstorming

Invoke `superpowers:brainstorming` via the Skill tool. Follow it fully
— do not short-circuit.

When brainstorming exits, capture:
- One-paragraph product description
- **Platforms** as a list (iOS / Android / web / AI backend) —
  usually one, sometimes multiple (e.g. iOS app + AI backend)
- The **core demo action** — the single thing the user wants to show
  someone at the end ("take a photo and see what Vision detected"). This
  becomes the stopping condition for Step 5.
- Key features and constraints (separated from "nice-to-haves")

**Confirm explicitly with the user before continuing:**
"This is MVP mode — demo-only, no tests, no hardening. Edge cases get
TODO markers. If you want production-grade, abort here and run the
standard superpowers flow or `solopreneur:autopilot` instead."

Proceed only on explicit confirmation.

## Step 2: PRD visual confirmation

Brainstorming produced a committed markdown spec — the **source of truth**.
This step renders it as an interactive visual PRD so the user confirms
UI/UX, data shape, flow, and business logic *before* any template or plan
work. For a single-implementer, no-review-loop MVP run, a wrong direction
caught here is far cheaper than one caught after execution. This is a
deliberate velocity tradeoff: the PRD round is heavier than plain
brainstorming, but it de-risks the unsupervised execution that follows.

**Inputs**: the brainstorming markdown spec (source of truth) plus the
Step 1 captures (product description, platforms, core demo action,
features vs nice-to-haves).

1. Invoke `superpowers:preview` via the Skill tool. Pass the markdown spec
   as the source content **and** explicit PRD rendering instructions: do
   not render a markdown wall — present it the most graspable way, and it
   MUST cover these four (form follows content otherwise):
   - **UI/UX** — wireframe / mockup of the core screens, especially the
     core demo action flow (use `/preview`'s `mock-*` / `mockup` recipes).
   - **Data structure** — conceptual entity / relationship + key data
     flow as a Mermaid diagram. **Conceptual level only — no schema DDL,
     no file layout.** Keeping it conceptual is what keeps the PRD
     template-agnostic (see Step 3's divergence handling).
   - **Flow diagram** — user flow / business-logic flow as Mermaid.
   - **Business logic** — the rules in skimmable form (tables / callouts).
2. **Override `/preview`'s in-repo commit behavior for this run.** At this
   point `/mvp` is on the product repo's `main` (no feature branch yet —
   Step 5 creates it). Committing to product `main` is forbidden. Instruct
   `/preview`: do **not** commit the proposal, do **not** modify
   `.gitignore`. Generate + deploy (or local fallback) only. The PRD dir
   physically lands at `/preview`'s resolved in-repo path
   (e.g. `docs/preview/<date>-<slug>/`) but stays uncommitted in the
   working tree. Record that path — Step 5 commits it onto the feature
   branch.
3. Iterate using `/preview`'s native comment-overlay + revision loop until
   the user is satisfied.
4. **PRD-complete gate.** Explicitly ask: "PRD discussion complete?
   Confirming moves to template lookup." Mirror Step 1's confirmation
   gate — proceed only on explicit confirmation.
5. **Reconcile the markdown spec.** Visual iteration almost always changes
   requirements; fold those changes back into the brainstorming markdown
   spec so it stays the source of truth. It remains uncommitted on `main`;
   Step 5 commits it alongside the PRD.

**Carry-forward**: the PRD dir path and the (updated, still-uncommitted)
markdown spec path, both consumed by Step 5.

## Step 3: Template lookup

Discovery is **convention-based**, not hardcoded: for each platform
captured in Step 1, look for `<plugin>:<platform>-app-templates` in the
available-skills list. Examples:

| Platform                | Template skill                      | Status   |
|-------------------------|-------------------------------------|----------|
| iOS app                 | `ios-dev:ios-app-templates`         | shipping |
| AI backend / LLM API    | `ai-engineer:ai-app-templates`      | shipping |
| Android app             | `android-dev:android-app-templates` | planned  |
| Web app                 | `web-dev:web-app-templates`         | planned  |

Iterate over the platform list:

1. Look up the matching `*-app-templates` skill in the available-skills
   list. Not installed → warn user, mark this platform as no-template,
   continue to the next platform.
2. Invoke the template skill via the Skill tool. The template skill
   browses its catalog and returns a candidate (or none).
3. Present the candidate to the user:
   - **Match** → record template name + the baseline path the template
     skill returned (don't assume a specific layout — the template skill
     owns its file structure).
   - **No match** → continue without a template for this platform.
   - **Partial match** → discuss with the user whether to adapt the
     template or go freeform.

**PRD ↔ template divergence (decision sub-step).** When a candidate
template's technical approach diverges from the confirmed PRD (e.g. the
PRD specifies an external OpenAI API but the template uses an on-device
Foundation Model):

- **Product / UX / business logic**: the PRD always wins. A template must
  never silently reshape the product; if it can't conform, that part goes
  freeform.
- **Technical approach / data structure / provider**: the PRD is the
  default. But if the template offers a materially faster path with a
  different approach, surface the divergence explicitly and ask the user:
  (a) adapt the PRD to the template's approach to gain template velocity,
  or (b) keep the PRD's approach and hand-build that part freeform. The
  user decides consciously. If they pick (a), fold the change back into
  the markdown spec and note it in the PRD.

**Recovery paths**: if the template skill errors, hits a tool
restriction, or the user aborts mid-selection, record "no template" for
that platform and proceed. Do not silently retry.

## Step 4: Writing the plan (MVP-flavored, demo-velocity)

Invoke `superpowers:writing-plans` via the Skill tool. Pass the Step 3
records (per-platform template name + baseline path) as context in the
invocation prompt — `writing-plans` has no formal baseline parameter,
so list them inline. Also pass the confirmed PRD (its path, and that it
is the visual rendering of the spec) alongside the markdown spec and the
per-platform template records.

**Also pass the MVP Charter's Plan-writing rules** (see top section)
verbatim to `writing-plans` so the plan it produces is demo-flavored,
not production-flavored.

If templates were found:
- Open the plan with each matched template's architectural baseline.
- Reference the baseline path the template skill returned (one section
  per platform when multiple templates apply).
- Layer only the MVP-specific user-visible requirements on top.

If no templates were found:
- Write a freeform MVP plan from the brainstorm output.
- State explicitly that no template was reused and that the plan is
  MVP-flavored (so a future hardening pass knows what's missing).

## Step 5: Execute the plan (MVP mode)

Before executing, **stop and get explicit user approval** of the
finalized plan. Do not assume the Step 4 draft is approved.

### 5a. Decide target branch + isolation

This is the orchestrator's responsibility — get it wrong and the
subagent self-aborts on the branch rename. Two paths:

**Path A: orchestrator is on `main` (no feature branch yet)**
- Derive a new, unique feature branch name from the product
  (e.g. `feature/mvp-photo-analyze`). Confirm it doesn't exist
  **locally or on origin** — both checks matter, because a stale remote
  branch with the same name would block `git push -u` later:
  ```
  git fetch origin
  git rev-parse --verify <name>                  # must fail (no local)
  git ls-remote --exit-code origin refs/heads/<name>  # must fail (no remote)
  ```
  If either succeeds, pick a different name (e.g. append a short suffix).
- Pass that name as `{TARGET_BRANCH}` and use `isolation: "worktree"`
  so the Agent tool creates a fresh worktree on an auto-generated
  branch; the subagent renames it to `{TARGET_BRANCH}` as its first
  action (see Charter).

**Path B: orchestrator is already on a feature-branch worktree**
- Use the current branch as `{TARGET_BRANCH}`. The branch already
  exists and may already be checked out here — that's fine because
  the subagent runs in the **same** worktree (no isolation, no
  rename).
- Dispatch **without** `isolation`. The Charter's "First action when
  dispatched into a fresh worktree" block is skipped.

Never pass an existing branch as `{TARGET_BRANCH}` together with
`isolation: "worktree"` — the rename would fail (branch already
exists, possibly checked out elsewhere).

### 5a-bis. Bring the deferred PRD + spec into git

The PRD dir and the updated markdown spec sit uncommitted in the `main`
working tree (Step 2 deferred their commit). They must land on
`{TARGET_BRANCH}`:

- **Path A** (`isolation: "worktree"`, fresh worktree on an auto branch):
  the PRD/spec files were created in the *original* `main` checkout, not
  the new worktree. After resolving `{TARGET_BRANCH}` in 5a and before
  dispatch, the orchestrator copies the PRD dir + updated markdown spec
  into the worktree path. The implementer's first commit is a dedicated
  `docs(mvp): PRD + spec` commit that includes them **and** the
  `**/comment-overlay.js` line `/preview` normally appends to
  `.gitignore` (deferred from Step 2).
- **Path B** (same worktree, no isolation): the PRD/spec are already in
  this worktree; commit them on the feature branch as the first commit,
  same `.gitignore` line included.

### 5b. Dispatch

Dispatch a single implementer subagent via the **Agent tool**:

- `subagent_type: general-purpose` by default. Single-platform MVPs MAY
  use a stack-specific type (`ios-dev`, `ai-engineer`, etc.) if the
  user prefers that agent's tool surface — but the MVP Charter still
  applies and overrides the agent's normal TDD posture. Multi-platform
  MVPs stay on `general-purpose` to avoid agent-per-step churn.
- `isolation: "worktree"` only in **Path A** above. Omit in Path B.
- `prompt`: assemble in this order
  1. The full plan text, extracted from the plan file. **Embedded text
     is authoritative for this run** — if the file changes mid-flight,
     a new dispatch is required, not a re-read.
  2. The Step 3 template records (template name + baseline path per
     platform).
  3. The **MVP Charter Execution rules** (verbatim from the top section).
  4. The **MVP Charter BLOCKED handling** (verbatim).
  5. Handoff details: `{TARGET_BRANCH}` (resolved in 5a) and
     instructions to resolve `{WORKTREE_PATH}` via
     `git rev-parse --show-toplevel` from the subagent's own cwd at
     runtime. Pass the plan file path for cross-reference too.

Do NOT delegate to `superpowers:executing-plans` or
`superpowers:subagent-driven-development` — both enforce TDD discipline
and per-task two-stage review, which is the right default for
production work but kills MVP velocity.

**Recovery**: if the subagent returns BLOCKED (see Charter), surface its
report to the user; do not re-dispatch automatically.

**Final report from this skill:**
List each commit (SHA + step name) and append a "TODO for hardening"
section — a snapshot of `TODO:` markers left in code at end-of-run. This
becomes the input for a later `solopreneur:autopilot` pass if the user
decides to harden. Re-grep before the hardening pass starts; the
snapshot will go stale once any commits land.

## Notes

- **Don't skip steps.** Brainstorming → PRD → template lookup → MVP plan
  is the value proposition. Short-circuit to execution only if the user
  explicitly opts out of a phase.
- **Hardening is a separate pass.** When the user later wants tests,
  edge cases, a11y, etc., they re-invoke against the same plan file —
  `solopreneur:autopilot` for the heavy pipeline, or the standard
  superpowers flow for a manual pass. MVP execute leaves the plan and
  the `TODO:` markers as the handoff surface.
