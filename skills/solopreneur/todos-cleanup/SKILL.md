---
name: todos-cleanup
description: |
  Batch cleanup of backlog todos — checks which items are already completed or
  partially done by searching git history, then moves them to done/ or doing/.
  Use when the user says "cleanup todos", "triage backlog", "clean up backlog",
  "check todos status", or wants to classify backlog items based on actual
  implementation status.
---

# Todos Cleanup

Scan the backlog directory and classify each item by checking git history for
related commits. Present findings for user confirmation, then move files.

## Config Discovery

Before scanning, resolve the todo directory paths. Source the config helpers first:

```bash
# --- solopreneur config helpers (sourced from shared/config.sh) ---
# One real shell file, so no harness rewrites the helpers on the way to the
# shell. Claude Code replaces the ${CLAUDE_SKILL_DIR} token below when it loads
# this body; Codex does not. It is SINGLE-quoted on purpose — it is a load-time
# token, not an environment variable, and letting the shell expand the name
# would source whatever an inherited value happened to point at. Unreplaced, it
# is not a directory, so substitute the absolute path of the directory holding
# THIS SKILL.md — every harness states that path to the model.
SOLO_SKILL_DIR='${CLAUDE_SKILL_DIR}'
[ -d "$SOLO_SKILL_DIR" ] || SOLO_SKILL_DIR="<absolute path of the directory holding this SKILL.md>"
SOLO_CONFIG_SH="$SOLO_SKILL_DIR/../../shared/config.sh"
# Two installed layouts, one contract. Inside the plugin the helpers sit at ../../shared/;
# a skill republished on its own — any flattened skills directory — carries them
# at scripts/config.sh instead, because shared/ is a sibling of skills/ and does
# not travel with a per-skill copy. Try both, then STOP. Sourcing a file that is
# not there does not halt the shell: every helper stays undefined, every config
# read returns empty, and the 2026-08-11 A2 run showed where that leads — the
# model "rescued" it with a repo-relative path, which resolves only when the
# repo under review happens to be this plugin's own source repo.
# Canonical authoring keeps non-skill source under src/.
[ -f "$SOLO_CONFIG_SH" ] || SOLO_CONFIG_SH="$SOLO_SKILL_DIR/../../../src/solopreneur/shared/config.sh"
[ -f "$SOLO_CONFIG_SH" ] || SOLO_CONFIG_SH="$SOLO_SKILL_DIR/scripts/config.sh"
[ -f "$SOLO_CONFIG_SH" ] || { echo "HALT: solopreneur config helpers not found under $SOLO_SKILL_DIR — stop here, do not improvise a path"; exit 1; }
source "$SOLO_CONFIG_SH"
# --- end solopreneur config helpers ---
```

1. **Check plugin config:**
   ```bash
   read_solopreneur_config todos
   ```
   If the `todos` key exists, use its `backlog`, `done`, `doing`, `later` values.

2. **If no config — scan the project:**
   Search for directories that look like todo/task storage:
   ```bash
   # Common patterns
   find . -maxdepth 3 -type d \( -name "todos" -o -name "todo" -o -name "TODO" \
     -o -name "backlog" -o -name "tasks" -o -name ".todos" \) 2>/dev/null
   ```
   For each candidate, count `.md` files inside. Present findings:
   ```
   Found potential todo directories:
     a) todos/backlog/ (12 .md files)
     b) tasks/ (5 .md files)
   Which is your backlog directory? (or enter a custom path)
   ```

3. **Save to config** after user confirms. Discovered paths are
   repo-relative (`todos/backlog` etc.), so the per-repo write helper
   anchors them to this repo's entry:
   ```bash
   write_solopreneur_repo_config todos '{
     "backlog": "todos/backlog",
     "done": "todos/done",
     "doing": "todos/doing",
     "later": "todos/later"
   }'
   ```
   Substitute user-confirmed paths into the JSON. Each repo gets its own
   entry — running this skill in a different repo will not clobber this
   one's setting.

Use the resolved paths for all subsequent steps. Variables below:
- `$BACKLOG` — backlog directory (e.g., `todos/backlog`)
- `$DONE` — done directory (e.g., `todos/done`)
- `$DOING` — doing directory (e.g., `todos/doing`)

## Classification Rules

| Status | Criteria | Action |
|--------|----------|--------|
| **DONE** | Found commits that fully implement the todo's requirements | Move to `$DONE` |
| **PARTIAL** | Some related commits exist, but not all requirements met | Move to `$DOING` |
| **OPEN** | No related commits found | Stay in `$BACKLOG` |

## Workflow

### Step 1: Gather file list

List all `.md` files in `$BACKLOG`. If empty, tell the user and stop.

### Step 2: Spawn sonnet subagent for analysis

Spawn a single **sonnet** subagent (`model: "sonnet"`) with this prompt:

```
Read each todo file in {$BACKLOG} and determine its implementation status
by searching git history. For each file:

1. Read the file to understand what the task requires
2. Extract 3-5 search keywords from the title and content
3. Run `git log --oneline --all --grep="keyword"` for each keyword
4. If commits are found, read the commit messages to judge completeness
5. Classify as DONE / PARTIAL / OPEN

Files to check:
[list of file paths]

Report a markdown table:
| File | Status | Evidence |
|------|--------|----------|
| filename.md | DONE/PARTIAL/OPEN | commit hash + message, or "no related commits" |

Be conservative — only mark DONE if the commits clearly cover the full scope
described in the todo. If unsure, mark PARTIAL.
```

### Step 3: Present results and confirm

Show the subagent's table to the user. Ask for confirmation before moving files.
The user may override individual classifications.

### Step 4: Move files

After confirmation:
- DONE items → `$DONE`
- PARTIAL items → `$DOING`
- OPEN items → no action

Create target directories if they don't exist.

Report the final state:
```
todos/
├── backlog/   (N files remaining)
├── doing/     (N files)
├── done/      (N files)
└── later/     (N files)
```

## Important

- Never delete todo files — only move them
- Always confirm with user before moving
- The subagent does research only — it must not modify or delete any files
