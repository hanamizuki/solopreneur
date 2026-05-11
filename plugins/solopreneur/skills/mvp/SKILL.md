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

```
0. Verify dependencies        (superpowers + ≥1 *-app-templates)
1. superpowers:brainstorming  (clarify needs + classify platform)
2. Template lookup            (find matching *-app-templates skill)
3. superpowers:writing-plans  (MVP-flavored plan, demo-velocity)
4. Execute the plan (MVP)     (single implementer subagent, commit per step)
```

## MVP Charter

The single source of truth for the demo-velocity tradeoffs. Step 3 passes
the **Plan-writing rules** to `superpowers:writing-plans`; Step 4 passes
the **Execution rules** and **BLOCKED handling** to the implementer
subagent. Keep both copies in sync by referencing this section, not by
restating.

### Plan-writing rules (consumed by Step 3)

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

### Execution rules (consumed by Step 4)

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

**Commit policy: one commit per plan step.**
- After each step's implementation works (manual verify), commit and
  push. Each step is an independently revertable slice.
- Commit message: `feat(mvp): <step name> — <one-line outcome>`.
- **Before the first commit, verify `git branch --show-current` is not
  `main` / `master` and matches the target branch passed in handoff.
  Abort if mismatch — never push to a branch you didn't start on.**

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
  becomes the stopping condition for Step 4.
- Key features and constraints (separated from "nice-to-haves")

**Confirm explicitly with the user before continuing:**
"This is MVP mode — demo-only, no tests, no hardening. Edge cases get
TODO markers. If you want production-grade, abort here and run the
standard superpowers flow or `solopreneur:autopilot` instead."

Proceed only on explicit confirmation.

## Step 2: Template lookup

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

**Recovery paths**: if the template skill errors, hits a tool
restriction, or the user aborts mid-selection, record "no template" for
that platform and proceed. Do not silently retry.

## Step 3: Writing the plan (MVP-flavored, demo-velocity)

Invoke `superpowers:writing-plans` via the Skill tool. Pass the Step 2
records (per-platform template name + baseline path) as context in the
invocation prompt — `writing-plans` has no formal baseline parameter,
so list them inline.

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

## Step 4: Execute the plan (MVP mode)

Before executing, **stop and get explicit user approval** of the
finalized plan. Do not assume the Step 3 draft is approved.

Once approved, dispatch a single implementer subagent via the **Agent
tool** with:
- `subagent_type: general-purpose`
- `isolation: "worktree"` if not already running inside a feature-branch
  worktree (creates a temporary isolated worktree, matching
  `solopreneur:autopilot`'s pattern). If already in a worktree, omit
  isolation.
- `prompt`: assemble in this order
  1. The full plan text, extracted from the plan file. **Embedded text
     is authoritative for this run** — if the file changes mid-flight,
     a new dispatch is required, not a re-read.
  2. The Step 2 template records (template name + baseline path per
     platform).
  3. The **MVP Charter Execution rules** (verbatim from the top section).
  4. The **MVP Charter BLOCKED handling** (verbatim).
  5. Handoff details: working directory (worktree path), target branch,
     plan file path for cross-reference.

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

- **Don't skip steps.** Brainstorming → template lookup → MVP plan is
  the value proposition. Short-circuit to execution only if the user
  explicitly opts out of a phase.
- **Hardening is a separate pass.** When the user later wants tests,
  edge cases, a11y, etc., they re-invoke against the same plan file —
  `solopreneur:autopilot` for the heavy pipeline, or the standard
  superpowers flow for a manual pass. MVP execute leaves the plan and
  the `TODO:` markers as the handoff surface.
