---
name: mvp
description: |
  Meta-orchestrator for building a brand-new app, product, or MVP from
  scratch. Drives the full flow: brainstorming → template lookup →
  planning → plan execution. Use INSTEAD OF superpowers:brainstorming
  when the user is starting a new product — this skill calls
  brainstorming internally, then chains in template discovery, plan
  writing, and execution. Triggers: "/mvp", "我要做 app", "想做產品",
  "想做一個 app", "做個 MVP", "build a product", "build an app from
  scratch", "MVP from scratch", "start a new app", "new product".
---

# MVP Orchestrator

Drives the full new-app / new-product flow. This skill is orchestration
only — it does NOT reimplement brainstorming or planning. It chains the
right skills in the right order and inserts a template lookup between
brainstorming and plan writing.

## Flow

```
0. Verify dependencies          (superpowers + ≥1 *-app-templates)
1. superpowers:brainstorming    (clarify needs + classify platform)
2. Template lookup              (find matching *-app-templates skill)
3. superpowers:writing-plans    (template as architectural baseline)
4. superpowers:executing-plans  (execute with review checkpoints)
```

## Step 0: Verify dependencies

**Required** (check via the available-skills list in the system-reminder):
- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:executing-plans`

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
- Key features and constraints

Confirm the platform list explicitly with the user before continuing —
Step 2 iterates over it.

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

## Step 3: Writing the plan

Invoke `superpowers:writing-plans` via the Skill tool. Pass the Step 2
records as context in the invocation prompt — `writing-plans` has no
formal baseline parameter, so list each platform's template name and
baseline path inline so the plan-writer can reference them.

If templates were found:
- Open the plan with each matched template's architectural baseline.
- Reference the baseline path the template skill returned (one section
  per platform when multiple templates apply).
- Layer app-specific requirements on top (persistence, custom UI, etc.).
- Note divergence points: "we deviate from the template at X because Y".

If no templates were found:
- Write a freeform plan from the brainstorm output.
- State explicitly that no template was reused, so future readers know.

## Step 4: Execute the plan

Before handing off, **stop and get explicit user approval** of the
finalized plan. Do not assume the Step 3 draft is approved.

Once approved, hand off to `superpowers:executing-plans` with the plan
file path as input. That skill executes the plan with built-in review
checkpoints. This skill's job ends here.

Heavier orchestration (PR splitting, worktree dispatch, automated
review loops, merge) is intentionally **not** part of this flow — if
the user later wants that for the same plan, they can invoke
`solopreneur:autopilot` separately.

## Notes

- **Don't skip steps.** Even if the user seems impatient,
  brainstorming → template lookup → plan is the value proposition.
  Short-circuit to execution only if the user explicitly opts out of
  a phase.
