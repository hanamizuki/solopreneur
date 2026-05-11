---
name: mvp
description: |
  Meta-orchestrator for building a brand-new app, product, or MVP from
  scratch. Drives the full flow: brainstorming → template lookup →
  planning → autopilot. Use INSTEAD OF superpowers:brainstorming when
  the user is starting a new product — this skill calls brainstorming
  internally, then chains in template discovery, plan writing, and
  autopilot dispatch. Triggers: "/mvp", "我要做 app", "想做產品",
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
1. Verify dependencies        (superpowers + ≥1 *-app-templates)
2. superpowers:brainstorming  (clarify needs + classify platform)
3. Template lookup            (find matching *-app-templates skill)
4. superpowers:writing-plans  (template as architectural baseline)
5. solopreneur:autopilot      (execute the plan)
```

Use TaskCreate to track the five steps as separate tasks. Mark each
step complete only after its delegated skill has actually finished.

## Step 0: Verify dependencies

Scan the available-skills list (system-reminder) for:

**Required:**
- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `solopreneur:autopilot` (co-packaged with this skill)

**Expected (at least one):**
- Any skill matching `*-app-templates` — e.g.
  `ios-dev:ios-app-templates`, `ai-engineer:ai-app-templates`

If any required skill is missing → stop and tell the user which plugin
to install.

If no `*-app-templates` is available → continue, but warn the user that
the plan will be freeform (no template baseline). Offer to install a
relevant platform plugin first.

## Step 1: Brainstorming

Invoke `superpowers:brainstorming` via the Skill tool. Follow it fully
— do not short-circuit.

When brainstorming exits, capture:
- One-paragraph product description
- **Platform classification** (iOS / Android / web / AI backend / multi)
- Key features and constraints

Platform classification is what drives Step 2 — confirm it explicitly
with the user before continuing.

## Step 2: Template lookup

Map the platform classification to a template skill **by naming
convention**, not a hardcoded list:

| Platform                | Template skill                       |
|-------------------------|--------------------------------------|
| iOS app                 | `ios-dev:ios-app-templates`          |
| AI backend / LLM API    | `ai-engineer:ai-app-templates`       |
| Android app             | `android-dev:android-app-templates`  |
| Web app                 | `web-dev:web-app-templates`          |

As new platforms add a `*-app-templates` skill, this step picks them up
with no skill change here — discovery is convention-based.

For the matched platform:

1. Confirm the template skill exists in the available-skills list.
   - Not installed → warn user, continue without template.
2. Invoke the template skill via the Skill tool.
3. The template skill browses its catalog and returns a candidate.
4. Present the candidate to the user:
   - **Match**: record template name + path to `references/<template>/`
   - **No match**: continue without template (freeform plan)
   - **Partial match**: discuss with the user whether to adapt the
     template or go freeform

A multi-platform product (e.g. iOS app + AI backend) should consult
**both** template skills. Record both baselines for Step 3.

## Step 3: Writing the plan

Invoke `superpowers:writing-plans` via the Skill tool.

If templates were found:
- Open the plan with the template's architectural baseline
- Reference template files explicitly (`references/<template>/Sources/`)
- Layer app-specific requirements on top (persistence, custom UI, etc.)
- Note divergence points: "we deviate from the template at X because Y"

If no templates were found:
- Write a freeform plan from the brainstorm output
- Note this explicitly so future readers know no template was reused

## Step 4: Autopilot

When the plan is complete and the user has approved it, hand off to
`solopreneur:autopilot` with the plan file path as input.

Autopilot handles PR splitting, worktree dispatch, review loop, and
merge. This skill's job ends here.

## Notes

- **Orchestration only.** This skill does not write plan content,
  template content, or code. All substance comes from delegated skills.
- **Template discovery is convention-based.** Adding a new platform
  template just requires creating a `<plugin>:<platform>-app-templates`
  skill — MVP picks it up via the naming pattern.
- **Don't skip steps.** Even if the user seems impatient, brainstorming
  → template lookup → plan is the value proposition. Short-circuit to
  autopilot only if the user explicitly opts out of a phase.
