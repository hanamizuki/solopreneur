---
name: second-opinion
description: |
  Get an independent adversarial review of plans, specs, and design docs using
  Codex CLI as a second pair of eyes. Codex reads the document and related files
  fresh — no conversation context — then challenges it across 5 dimensions:
  Completeness, Consistency, Clarity, Scope, Feasibility. Use when the user says
  "second opinion", "challenge this plan", "adversarial review", "review this spec",
  or any request to get an independent outside perspective on a plan or spec.
  Works best with Codex CLI installed; falls back to a subagent-based review without it.
---

# Second Opinion

Use an independent reviewer to challenge plans, specs, and design docs. The reviewer
reads the files fresh with no conversation context, providing an unbiased critique.

**Primary method:** Codex CLI (`codex exec`) — a completely separate model with zero
shared context, giving the most independent review possible.

**Fallback:** If Codex CLI is not installed, dispatch a general-purpose subagent instead.
The subagent shares the same model family but starts with a clean context window,
still providing a useful outside perspective.

## Step 1: Identify the target

Ask the user which file to review if not obvious from context. Typical targets:
- `todos/doing/*.md` (active plans)
- `docs/spec/*.md` (specs)
- Design docs, refactor plans, architecture proposals

## Step 2: Identify related files

Scan the plan for file references (paths to source files, configs, scripts, etc.).
These give the reviewer context to cross-validate claims in the plan.

Collect up to 10 most relevant paths. Don't include every reference — focus on files
the plan makes specific claims about (e.g., "this module reads X", "we'll delete Y",
"Z already handles this").

## Step 3: Check Codex availability

```bash
codex login status 2>&1
```

- If codex is available → proceed with **Path A (Codex review)**
- If codex is not installed or not authenticated → proceed with **Path B (Subagent review)**

## Path A: Codex Review

### Build the codex prompt

Construct a prompt that includes:
1. The plan file path
2. Related file paths for cross-validation
3. The 5-dimension adversarial framework

Template:

```
cat <<'PROMPT' | codex exec -
Please perform an adversarial review of this plan: {plan_path}

Also read these related files to cross-validate the plan's assumptions:
{related_files_list}

Challenge the plan across these five dimensions. For each dimension, list specific
findings with file and line number evidence:

1. **Completeness** — Are there missing edge cases, affected files not listed,
   or scenarios not considered?
2. **Consistency** — Are there internal contradictions? Does the plan match
   the actual code and documentation?
3. **Clarity** — Are there vague or ambiguous descriptions? Could an implementer
   start working immediately after reading this?
4. **Scope** — Is there over-engineering or scope creep? Is there a simpler way
   to achieve the same goal?
5. **Feasibility** — Is it technically feasible? Are there unverified assumptions?
   Do the dependencies it relies on actually exist?

Tag each finding with severity:
- RED_CIRCLE Critical — will cause implementation failure if not fixed
- YELLOW_CIRCLE Important — worth fixing but not fatal
- GREEN_CIRCLE Suggestion — nice to have but optional

End with an overall verdict:
- CHECK_MARK Ready to implement
- WARNING Needs revision (list blockers)
- CROSS_MARK Needs rethink (fundamental issues)

Do not modify any files. Review only.
PROMPT
```

### Run codex

```bash
cat <<'PROMPT' | timeout 300 codex exec - 2>&1
{constructed_prompt}
PROMPT
```

If codex output is very long, save to a temp file and read the key sections.

## Path B: Subagent Review (Codex not available)

Dispatch a `general-purpose` subagent with isolation to perform the same review.

**Subagent prompt:**

```
You are an independent adversarial reviewer. You have NO context from the parent
conversation — review the files from scratch.

Read this plan file: {plan_path}

Also read these related files to cross-validate: {related_files_list}

Challenge the plan across 5 dimensions:
1. Completeness — missing edge cases, unmentioned affected files, unconsidered scenarios
2. Consistency — internal contradictions, mismatches with actual code/docs
3. Clarity — vague descriptions, ambiguity that would block an implementer
4. Scope — over-engineering, scope creep, simpler alternatives
5. Feasibility — unverified assumptions, missing dependencies, technical blockers

For each finding, cite the specific file and line. Tag severity:
- Critical (blocks implementation)
- Important (should fix)
- Suggestion (optional improvement)

End with a verdict: Ready / Needs revision / Needs rethink.

Do NOT modify any files. Analysis only.
```

## Step 5: Present findings

Reviewer findings are **informational until the user explicitly approves each one**.

Present findings grouped by severity:
1. Critical findings first
2. Important findings
3. Suggestions

For each finding, ask the user: adopt, skip, or discuss?

If the reviewer and your own analysis agree on a finding, note the cross-model
consensus — it strengthens the signal, but the user still decides.

## Step 6: Update the plan

After the user decides on each finding, update the plan file to incorporate
accepted changes.

## Notes

- Codex uses ~240K tokens per run. Use judiciously, not on trivial changes.
- If codex exec fails or times out, report the error and offer to retry with a
  simpler prompt (fewer related files), or switch to Path B.
- Don't run this on code diffs — this skill is specifically for plans and specs.
  For code review, use dedicated review tools.
