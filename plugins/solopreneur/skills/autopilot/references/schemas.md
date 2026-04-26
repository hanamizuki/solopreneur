# Plan + State Schemas

## plan.yaml

```yaml
# Orchestration plan: defines PR list, dependencies, subagent types
name: "Phase 4 Mining Queries"        # Plan name
source_todo: "todos/doing/xxx.md"     # Source todo file path
created_at: "2026-03-29"              # Creation date

prs:
  - id: pr1                           # Unique identifier (used in depends_on references)
    branch: feature/mining-pr1        # Git branch name
    title: "feat(core): models"       # PR title (for gh pr create)
    type: code                        # code | docs (affects review depth)
    subagent: ai-engineer              # Implementation subagent type
    depends_on: []                    # List of dependent PR ids (empty = no dependencies)
    spec: pr1-models.md              # Spec filename (in same directory)

  - id: pr2
    branch: feature/mining-pr2
    title: "feat(core): router"
    type: code
    subagent: ai-engineer
    depends_on: [pr1]                 # Depends on pr1; must wait for pr1 to merge first
    spec: pr2-router.md

  - id: pr3
    branch: feature/mining-pr3
    title: "docs: update spec"
    type: docs                        # docs-type PRs get lighter review
    subagent: ai-engineer
    depends_on: [pr1, pr2]            # Depends on all
    spec: pr3-docs.md
```

### Field Reference

| Field | Required | Description |
|-------|:--------:|-------------|
| `name` | ✅ | Plan name, used in logs and reports |
| `source_todo` | ❌ | Source todo path for traceability |
| `created_at` | ✅ | Creation date |
| `prs[].id` | ✅ | Unique ID, used for dependency references and state.json keys |
| `prs[].branch` | ✅ | Git branch name, also used to match GitHub PRs |
| `prs[].title` | ✅ | PR title |
| `prs[].type` | ✅ | `code` or `docs` |
| `prs[].subagent` | ✅ | Implementation subagent type |
| `prs[].depends_on` | ✅ | List of dependent PR ids; empty array = no dependencies |
| `prs[].spec` | ✅ | Spec filename (relative to plan directory) |

### Subagent Type Reference

| Type | Use Case |
|------|----------|
| `ai-engineer` | LLM pipelines, prompt engineering, agent workflows, LangGraph |
| `ios-dev` | SwiftUI, iOS/macOS |
| `android-dev` | Kotlin, Jetpack Compose |
| `neo4j-dev` | Neo4j schema, Cypher queries, graph DB driver work |
| `marketer` | GTM strategy, naming, content writing, social growth |
| `designer` | UI/UX design, design systems, visual review |
| `general-purpose` | Fallback when no specific type applies |

---

## state.json

```json
{
  "status": "pending",
  "plan_dir": "docs/loops/2026-03-29_mining-queries",
  "started_at": null,
  "completed_at": null,
  "prs": {
    "pr1": {
      "number": null,
      "status": "pending",
      "worktree": null,
      "error": null,
      "retry_count": 0,
      "review_summary": null
    },
    "pr2": {
      "number": null,
      "status": "pending",
      "worktree": null,
      "error": null,
      "retry_count": 0,
      "review_summary": null
    }
  }
}
```

### Top-level Status

| Status | Description |
|--------|-------------|
| `pending` | Not yet started |
| `in_progress` | Currently executing |
| `done` | All PRs merged |
| `blocked` | Some PRs couldn't complete, execution stopped |

### PR Status

| Status | Description |
|--------|-------------|
| `pending` | Not yet started |
| `implementing` | Subagent is working on implementation |
| `review` | PR created, under review |
| `merged` | Successfully merged |
| `blocked` | Failed and retries exhausted |
| `skipped` | Skipped because a dependency is blocked |

### PR Field Reference

| Field | Description |
|-------|-------------|
| `number` | GitHub PR number (filled after creation) |
| `status` | Current status |
| `worktree` | Worktree path (has value during implementation, null after cleanup) |
| `error` | Failure reason (null on success) |
| `retry_count` | Number of retries so far (max 2) |
| `review_summary` | Review result summary (filled after merge) |

### review_summary Format

```json
{
  "rounds": 2,
  "fixed": 3,
  "pushed_back": 1,
  "reviewer": "codex"
}
```

---

## Spec File Format

One .md file per PR, placed in the same directory as the plan.

```markdown
# PR Title

## Requirements
- Functional description (describe what to do, not how)
- Constraints (don't use XXX, must be sync, backward compatibility needed, etc.)

## Files to Read
- path/to/file1.py (explain why — understand existing structure)
- path/to/file2.py (reference what pattern)

## Files to Create/Modify
- path/to/new_file.py — new, what it's for
- path/to/existing.py — what to modify

## Acceptance Criteria
- [ ] Test command: `cd xxx && uv run pytest tests/test_xxx.py -v`
- [ ] Specific verifiable condition (observable behavior or state)
- [ ] Specific verifiable condition

## Notes
- Technical decision reminders (if any)
- Known pitfalls (if any)
```

### Writing Principles

1. **Describe intent, not implementation**: "Create a maintenance loop that runs once on startup, then repeats every N hours" — not 50 lines of pseudo code
2. **Acceptance criteria must be verifiable**: "Stops within 60 seconds after shutdown event is set" — not "can stop correctly"
3. **List files to read**: so the subagent knows which parts of the codebase are relevant
4. **List file paths**: so preflight can verify paths exist and don't overlap
