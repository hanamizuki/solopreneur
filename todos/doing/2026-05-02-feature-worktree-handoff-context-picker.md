<!--
Plan-Branch: feature/worktree-handoff-context-picker
-->

## Handoff Context (2026-05-02, branch: feature/worktree-handoff-context-picker)

### Problem Background
`worktree-handoff` Step 5 was listing all plan files and asking the user to pick one every time. The user wants the skill to first detect context from the current conversation, find relevant plans automatically, and only prompt when there are multiple matches.

### Root Cause
Step 5 had no context-matching logic — it always listed all files unconditionally.

### Items to Fix / Implement
- [x] Rewrite Step 5 in `plugins/solopreneur/skills/worktree-handoff/SKILL.md`
  - Extract 3–5 key terms from current conversation context
  - Score plan files by terms matching filename (×2) and first 20 lines of content
  - 0 matches → skip prompt, create new file
  - 1 match → auto-select, print `→ Matched plan: <filename>`
  - 2+ matches → show only candidates, ask user to pick or 'new'

### Key Files
| path | description |
|------|-------------|
| `plugins/solopreneur/skills/worktree-handoff/SKILL.md` | The skill file — Step 5 was rewritten |

### Current Progress
Step 5 rewritten in main. Worktree opened to build PR and run greenlight.
