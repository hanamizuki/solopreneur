# feat(mvp): add PRD visual confirmation step between brainstorm and template lookup

## Requirements

Insert a new **PRD visual confirmation** step into the `/mvp` orchestrator
skill, between the existing Brainstorming step and the Template lookup step,
then renumber the rest of the flow and update all cross-references. Also
create the approved design document.

This is **prose / skill-doc editing only** — no code, no logic, no tests.
Fidelity of the documented procedure is what matters. Reproduce the
"Approved Design" section below faithfully into the SKILL.md.

### Step-number mapping (apply consistently everywhere)

| Old | New | Section |
|---|---|---|
| Step 0 | Step 0 | Verify dependencies (unchanged) |
| Step 1 | Step 1 | Brainstorming (unchanged; still captures core demo action) |
| — | **Step 2 (NEW)** | PRD visual confirmation |
| Step 2 | Step 3 | Template lookup (+ new divergence sub-step) |
| Step 3 | Step 4 | Writing the plan (+ PRD passed as input) |
| Step 4 | Step 5 | Execute (+ deferred PRD/spec → git) |
| Step 4a / 4b | Step 5a / 5b | Execute sub-steps |

Charter cross-reference renumbering:
- "Step 3 passes the **Plan-writing rules**" → "Step 4 passes the **Plan-writing rules**"
- "Step 4 passes the **Execution rules**" → "Step 5 passes the **Execution rules**"
- "### Plan-writing rules (consumed by Step 3)" → "(consumed by Step 4)"
- "### Execution rules (consumed by Step 4)" → "(consumed by Step 5)"
- Step 4 (Writing plan) "Pass the Step 2 records" → "Pass the Step 3 records"
- Step 5 (Execute) 5b "The Step 2 template records" → "The Step 3 template records"
- Any "captured in Step 1" / "core demo action ... Step 1" → **unchanged** (stays Step 1)

## Files to Read

- `plugins/solopreneur/skills/mvp/SKILL.md` — the file being edited; understand
  its current structure (Flow block, MVP Charter with Plan-writing rules /
  Execution rules / BLOCKED handling / Stopping condition, Steps 0–4, Notes).
- `plugins/solopreneur/skills/preview/SKILL.md` — understand `/preview`'s
  in-repo commit + `.gitignore` behavior the new Step 2 must override.

## Files to Create/Modify

- `plugins/solopreneur/skills/mvp/SKILL.md` — modify per "Approved Design" below.
- `docs/superpowers/specs/2026-05-17-mvp-prd-phase-design.md` — **create**;
  contains the "Approved Design" section below verbatim (the brainstorming
  design artifact, produced inside this PR so it never touches `main`).

## Approved Design

### A. Flow block (`## Flow`) — replace with

```text
0. Verify dependencies        (superpowers + ≥1 *-app-templates)
1. superpowers:brainstorming  (clarify needs + classify platform)
2. PRD visual confirmation    (render spec via /preview, user-gated)
3. Template lookup            (find matching *-app-templates; PRD↔template decision)
4. superpowers:writing-plans  (MVP-flavored plan, demo-velocity)
5. Execute the plan (MVP)     (single implementer subagent, commit per step)
```

### B. New section, inserted between `## Step 1: Brainstorming` and the
(now renumbered) `## Step 3: Template lookup`:

```markdown
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
```

### C. Step 3 (Template lookup) — append this decision sub-step to the
per-platform loop (after the existing match / no-match / partial-match
handling, before "Recovery paths"):

```markdown
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
```

### D. Step 4 (Writing the plan) — extend the inputs passed to
`writing-plans`. Add a sentence to the existing "pass the records" guidance:

> Also pass the confirmed PRD (its path, and that it is the visual
> rendering of the spec) alongside the markdown spec and the per-platform
> template records.

### E. Step 5 (Execute) — add this subsection before the existing 5b
dispatch / commit-policy content:

```markdown
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
```

### F. MVP Charter — add a short note (near the Charter intro, after the
existing "single source of truth" paragraph):

> PRD visual confirmation (Step 2) is a user gate of the same nature as
> Step 1's. Both the markdown spec (source of truth) and the confirmed
> PRD are handed to `writing-plans` (Step 4). The Execution rules
> (Step 5) are unchanged — the PRD is pre-execution direction
> confirmation; it does not alter the demo-velocity execution discipline.

Then apply the Charter cross-reference renumbering from the mapping table
above (Step 3→4 for Plan-writing rules, Step 4→5 for Execution rules, and
the "(consumed by Step N)" headings).

### G. Notes section — update the "Don't skip steps" line

Change `Brainstorming → template lookup → MVP plan` to
`Brainstorming → PRD → template lookup → MVP plan`.

## Acceptance Criteria

- [ ] `## Step 2: PRD visual confirmation` exists between Step 1 and the
      renumbered Step 3, with all 5 numbered actions + Inputs +
      Carry-forward as specified in section B.
- [ ] `## Flow` block matches section A exactly (6 lines, 0–5).
- [ ] Old "Step 2: Template lookup" is now `## Step 3: Template lookup`
      and contains the new divergence decision sub-step (section C).
- [ ] Old "Step 3: Writing the plan" is now `## Step 4` and passes the
      PRD as input (section D).
- [ ] Old "Step 4: Execute" is now `## Step 5`, with `5a` / `5b`
      sub-steps renamed and the new `### 5a-bis` subsection (section E).
- [ ] MVP Charter contains the new gate note (section F) and the
      Plan-writing rules / Execution rules cross-refs are renumbered
      (Step 4 / Step 5; "consumed by Step 4" / "consumed by Step 5").
- [ ] Notes "Don't skip steps" line includes PRD (section G).
- [ ] `grep -nE 'Step [0-9]' plugins/solopreneur/skills/mvp/SKILL.md`
      shows no stale/contradictory step numbers — every reference
      consistent with the mapping table; "captured in Step 1" (core demo
      action / stopping condition) still says Step 1.
- [ ] `docs/superpowers/specs/2026-05-17-mvp-prd-phase-design.md` exists
      and contains the full "Approved Design" (sections A–G) in English.
- [ ] No changes to any file other than the two listed.

## Notes

- Repo is an open-source plugin marketplace (has `LICENSE`) → SKILL.md
  content, the design doc, commit message, and PR text are all **English**.
- This is documentation-only; there are no test commands. Verification is
  the `grep` consistency check + manual read against the acceptance
  criteria.
- Do not "improve" unrelated parts of the SKILL.md. Scope is exactly the
  PRD-step insertion + renumber + the two listed files.
- The renumbering is the highest-risk part. After editing, grep every
  `Step [0-9]` occurrence and reconcile each against the mapping table —
  a missed cross-reference is the most likely defect.
