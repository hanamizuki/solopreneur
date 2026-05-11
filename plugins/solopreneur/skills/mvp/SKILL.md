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
**get to first demo fast.** Quality, tests, edge cases, accessibility,
i18n, and refactor passes are deferred — if the user wants those later
they invoke `solopreneur:autopilot` on the same plan.

This skill is orchestration only — it does NOT reimplement brainstorming
or planning. It chains the right skills in the right order, inserts a
template lookup between brainstorming and plan writing, and runs
execution with a single implementer subagent under the MVP charter
(rather than via `superpowers:executing-plans` /
`superpowers:subagent-driven-development`, which both enforce TDD
discipline that kills demo velocity).

## Flow

```
0. Verify dependencies        (superpowers + ≥1 *-app-templates)
1. superpowers:brainstorming  (clarify needs + classify platform)
2. Template lookup            (find matching *-app-templates skill)
3. superpowers:writing-plans  (MVP-flavored, demo-velocity plan)
4. MVP execute                (single implementer subagent, commit per step)
```

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
- The **core demo action** — the single thing the user wants to be able
  to show someone at the end ("take a photo and see what Vision detected")
- Key features and constraints (separated from "nice-to-haves")

Confirm the platform list and the core demo action explicitly with the
user before continuing — Step 2 iterates over platforms, Step 4 stops
when the core demo action works.

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

## Step 3: Writing the plan (MVP-flavored)

Invoke `superpowers:writing-plans` via the Skill tool. Pass the Step 2
records (per-platform template name + baseline path) as context in the
invocation prompt — `writing-plans` has no formal baseline parameter,
so list them inline.

**Also pass this MVP charter to writing-plans** verbatim so the plan it
produces is demo-flavored, not production-flavored:

> Write a demo-velocity plan, not a production plan. Each task = a
> visible slice the user can see in the app / simulator. **Skip these
> categories entirely** — they're for a later hardening pass, not MVP:
> - Test tasks (no unit / integration / UI tests in the plan)
> - Error-handling tasks (edge cases → `// TODO` comments in code,
>   not plan tasks)
> - Loading / empty / error state tasks
> - Accessibility / i18n tasks
> - Performance / refactor / cleanup tasks
>
> Acceptance criteria for the whole plan: **"user can demo the core
> action end-to-end"**, not "all tests pass". Templates already encode
> baseline architecture — don't re-derive what the template provides;
> reference it.

If templates were found:
- Open the plan with each matched template's architectural baseline.
- Reference the baseline path the template skill returned (one section
  per platform when multiple templates apply).
- Layer only the MVP-specific user-visible requirements on top.

If no templates were found:
- Write a freeform MVP plan from the brainstorm output.
- State explicitly that no template was reused and that the plan is
  MVP-flavored (so a future hardening pass knows what's missing).

## Step 4: MVP execute

Before executing, **stop and get explicit user approval** of the
finalized plan. Do not assume the Step 3 draft is approved.

Once approved, **dispatch a single implementer subagent** via the Agent
tool (`general-purpose` type). Do NOT delegate to
`superpowers:executing-plans` or `superpowers:subagent-driven-development`
— both enforce TDD discipline and per-task two-stage review, which is
the right default for production work but kills MVP velocity.

The subagent prompt must include:

1. The full plan text (extracted from the plan file — don't make the
   subagent re-read it).
2. The Step 2 template records (template name + baseline path per
   platform).
3. The **MVP charter** below, verbatim.
4. Concrete handoff details: working directory (worktree path),
   target branch, plan file path for cross-reference.

### MVP charter (include verbatim in the subagent prompt)

You are building an MVP demo, not a production app. Optimize for
**time-to-first-demo**, not for code quality or completeness.

**Hard rules:**
- **No TDD.** Do not write tests. After each step, run the app /
  simulator manually and check the happy path works. That is the
  verification.
- **Edge cases → `// TODO`.** Inline `// TODO: handle X` comments where
  edge cases would normally branch. Do not implement them now.
- **Loading / empty / error states → stub or skip.** Simplest possible
  fallback; no spinners, no skeletons, no retry logic.
- **No refactor passes, no cleanup commits.** Ship the first working
  version of each slice.
- **Trust the template.** Copy the template's reference files as-is;
  only customize where the plan explicitly calls for it.
- **Ambiguity → simplest path.** Don't pause to ask unless genuinely
  blocked (missing key, broken toolchain, plan step is incoherent).

**Commit policy: one commit per plan step.**
- After each step's implementation works (manual verify in the
  app / simulator), commit and push immediately.
- Commit message format: `feat(mvp): <step name> — <one-line outcome>`.
- Each step becomes an independently revertable slice.

**Stopping condition:**
The user can run the app / simulator and demo the **core demo action**
captured in Step 1 end-to-end. Stop there. Do not continue polishing,
hardening, or adding nice-to-haves.

**Final report:**
List each commit (SHA + step name) and append a short "TODO for
hardening" section enumerating the `// TODO` comments left in code —
this becomes the input for a later `solopreneur:autopilot` pass if the
user decides to harden.

## Notes

- **MVP ≠ production.** This skill's value is the explicit "demo only"
  charter that lets the implementer skip all the things that slow a
  TDD build. If the user wants a production-grade build, they should
  invoke `superpowers:writing-plans` + `superpowers:subagent-driven-development`
  directly, or run `solopreneur:autopilot` on the MVP plan once the
  demo works.
- **Don't skip steps.** Even if the user seems impatient,
  brainstorming → template lookup → MVP plan is the value proposition.
  Short-circuit to execution only if the user explicitly opts out of a
  phase.
- **Hardening is a separate pass.** When the user later wants tests,
  edge cases, a11y, etc., they re-invoke against the same plan file
  with autopilot or the standard superpowers flow. MVP execute leaves
  the plan and the `// TODO` markers as the handoff surface.
