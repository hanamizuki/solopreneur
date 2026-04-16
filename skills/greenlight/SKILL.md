---
name: greenlight
description: |
  Automated PR review loop that keeps running until the PR is clean. Triggers
  external reviewers (Codex bot, Codex CLI, Gemini), processes feedback, fixes
  issues, and re-triggers — repeating until no new suggestions remain.
  Supports `/greenlight external` to skip internal review and go straight to
  external reviewers, and `/greenlight external gemini` to specify a starting
  reviewer. Use when the user says "greenlight", "run reviews until clean",
  "get this PR approved", or wants automated review cycling on an open PR.

  Also auto-detects uncommitted mode: when on main branch with uncommitted
  changes and no PR, runs Codex CLI `--uncommitted` review loop only, fixes
  in-place without committing, until codex reports clean.
---

# Greenlight

Automated review loop. Two modes:

- **PR mode** (default, for open PRs on feature branches) — three phases:
  ```
  Phase 1: Internal Review (4 subagents review in parallel, report-only)
  Phase 2: Consolidate + Fix (merge reports → fix via /receiving-code-review → commit + push)
  Phase 3: External Review Loop (Codex/Gemini/CodeRabbit cycle until clean)
  ```
- **Uncommitted mode** (auto-detected when on `main` + uncommitted changes + no PR):
  Codex CLI `--uncommitted` loop only. Fixes in-place, does NOT commit.

### Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `external` | Skip Phase 1 + 2 (internal review), jump to Phase 3 | `/greenlight external` |
| `codex bot` / `codex cli` / `gemini` | Specify starting reviewer (combinable with `external`) | `/greenlight external gemini` |

**Parsing rules:** Extract `external` keyword from args (case-insensitive); the remainder
is the reviewer specification. If no `external`, run the full three-phase flow.

Arguments are ignored in **Uncommitted mode** — the only flow is codex CLI loop.

## Pre-flight Checks

### Step 1: Mode detection

Determine whether to run **PR mode** or **Uncommitted mode** based on current repo state:

```bash
CURRENT_BRANCH=$(git branch --show-current)
HAS_UNCOMMITTED=$(git status --porcelain | grep -q . && echo yes || echo no)
# Probe PR existence for current branch (stderr suppressed; no PR → non-zero exit)
if gh pr view --json number,state >/tmp/gl-pr.json 2>/dev/null; then
  PR_EXISTS=yes
  PR_STATE=$(jq -r .state /tmp/gl-pr.json)
else
  PR_EXISTS=no
  PR_STATE=none
fi
echo "BRANCH=$CURRENT_BRANCH UNCOMMITTED=$HAS_UNCOMMITTED PR=$PR_EXISTS/$PR_STATE"
```

**Mode table:**

| Branch | Uncommitted | PR (open) | MODE | Action |
|---|---|---|---|---|
| `main` | yes | no | **uncommitted** | Enter Uncommitted mode (skip all phases below) |
| `main` | yes | yes (open) | **ask** | Unusual — ask user: "On main with uncommitted + open PR. Run uncommitted mode on working tree, or abort?" |
| `main` | no | — | **stop** | Nothing to review on main; tell user |
| feature / worktree | — | yes (open) | **pr** | Continue with Pre-flight Step 2 below (default flow) |
| feature / worktree | yes | no | **ask** | Ambiguous — ask user: "On feature branch with uncommitted and no PR yet. (A) Commit and push first to create PR, then review (B) Run uncommitted mode on working tree (C) Abort" |
| feature / worktree | no | no | **stop** | No PR + no changes; tell user to commit or create PR first |

If `MODE=uncommitted`, skip Steps 2-5 below and Argument Parsing; jump directly to **[Uncommitted Mode](#uncommitted-mode)**.

### Step 2: PR mode pre-flight (MODE=pr only)

1. PR info already recorded in Step 1 (`/tmp/gl-pr.json`). Confirm state is `OPEN`; if not, stop.

2. Confirm working directory is clean:
   ```bash
   git status --porcelain
   ```
   If uncommitted changes exist, ask the user whether to commit first.

3. Record the PR number and repo owner/name (from `gh repo view --json owner,name`).

4. Read reviewer fallback config:
   ```bash
   jq -r '.greenlight // empty' ~/.claude/solopreneur.json 2>/dev/null || echo "NO_CONFIG"
   ```
   If config exists, read `fallback_order` from the `greenlight` key.
   If absent (`NO_CONFIG`), use default: codex-bot as starting reviewer, ask user on failure.

### Step 3: Codex CLI availability (both modes)

```bash
command -v codex &>/dev/null && echo "CODEX_INSTALLED=true" || echo "CODEX_INSTALLED=false"
codex login status 2>/dev/null && echo "CODEX_AUTH=true" || echo "CODEX_AUTH=false"
```

- **PR mode**: Best-effort hint. Used later by Argument Parsing to gate `codex cli` reviewer selection.
- **Uncommitted mode**: Required. If `CODEX_INSTALLED=false` or `CODEX_AUTH=false`, stop with install instructions:
  - Not installed → `npm install -g @openai/codex`
  - Not authenticated → `codex login`

---

## Argument Parsing

> **⏭️ Skip this section entirely if `MODE=uncommitted`** — jump to [Uncommitted Mode](#uncommitted-mode).

```
# Parse external mode and reviewer from args
# e.g.: "/greenlight external gemini" → external_only=true, reviewer="gemini"
# e.g.: "/greenlight codex cli"       → external_only=false, reviewer="codex cli"
# e.g.: "/greenlight external"        → external_only=true, reviewer="codex bot" (default)

raw_args = args ?? ""
external_only = raw_args contains "external" (case-insensitive)
reviewer_args = raw_args with "external" removed (trimmed)
current_reviewer = reviewer_args non-empty ? reviewer_args : "codex bot"

# Codex CLI availability gate: if user specified codex cli but CLI unavailable, fall back
if current_reviewer == "codex cli" and pre-flight detected CLI not installed or not authenticated:
  → notify user:
    - not installed: "Codex CLI not installed, switching to Codex GitHub bot. To install: npm install -g @openai/codex && codex login"
    - not authenticated: "Codex CLI not authenticated, switching to Codex GitHub bot. Run: !codex login"
  → current_reviewer = "codex bot"
```

**If `external_only == true`, skip Phase 1 and Phase 2, jump directly to Phase 3.**

---

## Uncommitted Mode

> **Only runs when `MODE=uncommitted` from Pre-flight Step 1.** PR mode skips this section entirely.

Codex CLI `--uncommitted` review loop. Fixes in-place, does NOT commit. User reviews and commits manually afterwards.

### Loop

```
round = 0
LOOP (max 10 rounds):
  round += 1

  1. Verify still on main with uncommitted changes:
     ```bash
     git branch --show-current  # must be main
     git status --porcelain     # must be non-empty
     ```
     If either changed (e.g., user switched branch or committed mid-loop) → stop and tell user.

  2. Run codex CLI:
     ```bash
     codex review --uncommitted -c 'model_reasoning_effort="high"' --enable web_search_cached 2>&1
     ```
     Capture full stdout/stderr. Timeout: 5 min.

  3. Parse output:
     - No `[P*]` tags (only summary paragraphs like "looks good" / "no issues") → **clean pass, exit loop**
     - Has `[P*]` tags → extract findings (file, line, priority, description, suggested fix)
     - Stderr contains "usage limit" / "rate limit" / non-zero exit → stop, tell user codex CLI unavailable, preserve working tree

  4. Dispatch fix subagent — see Step 4 below.

  5. After subagent returns, verify working tree still has uncommitted changes (subagent might have accidentally committed).
     If working tree is clean but commits were added → stop and tell user (violates no-commit invariant).

  6. Back to step 1 (next round). Pass prior-round findings to next subagent for push-back awareness.

End: max 10 rounds reached → stop and report to user.
```

### Step 4: Fix subagent (per round)

Dispatch subagent with these explicit instructions. Use `Agent` tool, `general-purpose` type.

```
Agent(
  description: "Fix codex uncommitted review findings (round N)",
  prompt: <see below>
)
```

**Prompt must contain:**

1. **Context**: "You are in uncommitted mode. All changes live in the working tree on the `main` branch. Your job is to address codex review findings by editing files directly."

2. **Findings list** (full stdout from codex, or parsed list with file + line + priority + description + suggested fix).

3. **Prior push-backs** (if round > 1): list of findings from earlier rounds that were pushed back with reasoning. Subagent should reconsider before pushing back again.

4. **Evaluation framework**: "Invoke `superpowers:receiving-code-review` skill first to load the review-receiving mindset. If unavailable, evaluate each finding: fix genuine issues, push back on false positives with solid technical reasoning."

5. **Hard constraints**:
   - **Do NOT run `git commit`, `git push`, `git add && commit`, or any commit operation.**
   - **Do NOT create branches, worktrees, or PRs.**
   - Edit source files directly. Leave all changes uncommitted.
   - If you want to push back on a finding, write reasoning in your final report — do not add code comments explaining the push-back (keeps the diff clean).

6. **Return format**: report what was fixed (file + line + fix summary) and what was pushed back (finding + reasoning).

### Exit Conditions

1. **Clean pass**: codex stdout has no `[P*]` tags → report rounds run, items fixed, items pushed back.
2. **Push-back exit**: all findings this round were already pushed back in prior rounds with the same reasoning → report and exit.
3. **Max 10 rounds**: stop and report last round's findings; let user decide.
4. **Aborted invariants**: branch changed / commits appeared / codex CLI unavailable → stop with specific reason.

### Final report (on any exit)

```
Uncommitted review loop complete.
- Exit reason: <clean pass / push-back / max rounds / aborted>
- Rounds run: <N>
- Items fixed: <M>
- Items pushed back: <K>
- Working tree: has uncommitted changes (run `git diff` to review, then commit manually)
```

**Do not offer to commit or push.** User's CLAUDE.md rule on product repo main branch: wait for explicit user instruction.

---

## Phase 1: Internal Review

> **⏭️ Skip entirely if `MODE=uncommitted`.**
> **⏭️ If `external_only == true`, skip this phase — go to [Phase 3](#phase-3-external-review-loop).**

**Dispatch 4 subagents in parallel (`run_in_background: true`), each running a review skill. All report-only — no code changes.**

| Subagent | Skill | Source | Focus |
|----------|-------|--------|-------|
| 1 | `/simplify` | Anthropic official | Check simplicity, reuse, quality, efficiency — **report issues and specific fix suggestions only, do not modify files** |
| 2 | `superpowers:requesting-code-review` | superpowers plugin | Self-check checklist — **report only items that fail, with specific fix suggestions** |
| 3 | `/review` | gstack | SQL safety, trust boundaries, conditional side effects, structural issues — **report findings and specific fix suggestions only** |
| 4 | `/specialist-review` | included | Tech-stack expert review — **report findings and specific fix suggestions only** |

**All skills are optional.** If any subagent fails (skill not found, invocation error, or subagent error), log which skill was unavailable and why, skip that subagent, and continue waiting for others.

- At least 1 subagent succeeds → proceed to Phase 2 (using completed reports)
- All fail → notify user "Phase 1: all internal reviewers unavailable", skip Phase 1 + 2, proceed to Phase 3

**Each subagent prompt must include:**
- PR diff (via `git diff main...HEAD`)
- Explicit instruction: "report-only mode, do not modify any files"
- Required format: each suggestion includes **file path, line number, issue description, specific fix suggestion (with proposed code)**

Wait for all successful subagents to report, then proceed to Phase 2.

---

## Phase 2: Consolidate + Fix

> **⏭️ Skip entirely if `MODE=uncommitted`.**
> **⏭️ If `external_only == true`, skip this phase — go to [Phase 3](#phase-3-external-review-loop).**

### 2a. Consolidate reports

After receiving all successful reports:
1. **Merge and deduplicate**: same suggestion for the same file and line → keep only one
2. **Group by file**: list all suggestions organized by file
3. **Escalate ambiguity**: if suggestions contradict each other, or the orchestrator can't determine whether to fix, ask the user

### 2b. Dispatch fix subagent

Hand the consolidated suggestion list to a subagent. The prompt must include:
- Full content of all suggestions (file, line, issue description, proposed fix)
- Instruction: "Use the `superpowers:receiving-code-review` skill framework to evaluate each suggestion"
- Instruction: "False positives require solid technical reasoning to push back"
- Instruction: "After fixes, commit + push"
- Commit message format: `fix: internal review fixes — <summary>`

```
Agent(
  description: "Process internal review feedback",
  prompt: "Here are the consolidated suggestions from 4 internal reviewers:\n\n<SUGGESTIONS>\n\nInvoke the superpowers:receiving-code-review skill first, use its framework to evaluate each one, fix items worth fixing, then commit + push."
)
```

### 2c. Confirm push succeeded, then proceed to Phase 3.

---

## Phase 3: External Review Loop

> **⏭️ Skip entirely if `MODE=uncommitted`.**

### Step 0: Read existing PR feedback

Before triggering any reviewer, fetch all existing review feedback on the PR:

```bash
gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviews(first:50){
        nodes{ author{ login } state body }
      }
      reviewThreads(first:100){
        nodes{
          isResolved
          comments(first:5){
            nodes{ author{ login } body path line }
          }
        }
      }
    }
  }
}' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER
```

Summarize results:
- Each reviewer's (human or bot) review status and suggestion count
- Number and source of unresolved threads

If there are unresolved threads:
  → Notify user: "PR has N unresolved review suggestions (from XXX)"
  → Ask: "Process this existing feedback first?"
    - Yes → jump directly to Step 3 to process these threads
    - No → continue triggering new review

If no unresolved threads:
  → Continue to main loop Step 1

### Reviewer Configuration

Three active reviewers supported, plus passive reviewers (e.g., CodeRabbit) that auto-trigger on push:

| Reviewer | Trigger | Bot login / detection | Response time | Dependency |
|---|---|---|---|---|
| Codex GitHub bot | PR comment `@codex review` | `chatgpt-codex-connector[bot]` | 3-10 min | Repo must have Codex GitHub App enabled |
| Codex CLI | Local `codex review --base main` | Read stdout directly | 1-3 min | Must be installed + authenticated (see CLI gate) |
| Gemini | PR comment `/gemini review` | `gemini-code-assist[bot]` | 1-3 min | Repo must have Gemini Code Assist enabled |

### Codex CLI Availability Gate

Pre-flight detected Codex CLI **installed and authenticated** → available (best-effort hint, may still fail at runtime).
Otherwise → unavailable. Don't list Codex CLI when asking user for fallback options.

**Argument override for starting reviewer:** User can specify starting reviewer at invocation:
- `codex bot` or no argument → start with Codex GitHub bot (default)
- `codex cli` → start with Codex CLI (must pass CLI gate; if fails, notify user and switch to codex bot)
- `gemini` → start with Gemini

### Fallback Logic

**With config (`~/.claude/solopreneur.json` has `greenlight` key):**
Follow `fallback_order` array sequentially. Each reviewer failure auto-switches to next, notifying user.
If all reviewers in array fail, stop and ask user.
Once user selects a reviewer, maintain it for the rest of this review cycle — no per-round reset.

**Without config (first use or unconfigured):**
1. Use `current_reviewer` (default codex-bot, or user-specified) to trigger review
2. If it fails (quota, no response, CLI unavailable, etc.), **stop and ask user**:

   "{reviewer} couldn't complete review (reason: {reason}). Which reviewer to continue with?"
   - A) Codex CLI — requires local codex installation (omit if CLI failed gate)
   - B) Gemini Code Assist — requires repo enablement
   - C) Skip, don't trigger another reviewer

3. After user picks, ask: "Use this order going forward? ({full order used so far})"
   - A) Yes, remember this
   - B) No, ask each time

4. If user picks A, merge into `~/.claude/solopreneur.json`:
   ```bash
   # Read existing config or start fresh
   EXISTING=$(cat ~/.claude/solopreneur.json 2>/dev/null || echo '{}')
   echo "$EXISTING" | jq --argjson gl '{
     "fallback_order": ["codex-bot", "gemini"],
     "created_at": "TIMESTAMP"
   }' '.greenlight = $gl' > ~/.claude/solopreneur.json
   ```
   (`fallback_order` = user's actual ordering, `TIMESTAMP` in ISO 8601)

**Codex CLI special handling:** Codex CLI doesn't poll GitHub API — reads stdout directly. Execute:
```bash
codex review --base main 2>&1
```
Output format: review comments with `[P1]`, `[P2]`, `[P3]` tags and file paths. Parse stdout for feedback, then process through the same Step 3 flow as GitHub bot feedback.

In the steps below, `REVIEWER_CMD` = the trigger command, `BOT_LOGIN` = current active reviewer's GitHub login.

### Bot Login Definitions

**Define these variables at flow start — all subsequent steps reference them. Adding or removing reviewer bots only requires changes here.**

```bash
# Active reviewer bots (in fallback order)
CODEX_BOT="chatgpt-codex-connector[bot]"
GEMINI_BOT="gemini-code-assist[bot]"

# Passive reviewer bots (auto-trigger on push, no manual trigger needed)
CODERABBIT_BOT="coderabbitai[bot]"

# All known reviewer bots (JSON array for jq IN() usage)
REVIEWER_BOTS='["chatgpt-codex-connector[bot]","gemini-code-assist[bot]","coderabbitai[bot]"]'

# Current active reviewer (updated on fallback switch)
BOT_LOGIN="$CODEX_BOT"  # default: start with Codex bot
```

### Feedback Detection Strategy

> **Core principle: use unresolved review threads + comment ID comparison. Never use timestamp filtering.**
>
> Bot feedback arrives through two channels:
> | Channel | Example | Detection |
> |---------|---------|-----------|
> | **Inline feedback** (review threads) | P1 suggestions, code-level comments | `isResolved == false` (GraphQL) |
> | **Summary messages** (issue comments) | "Didn't find any major issues", quota warnings | `comment.id > TRIGGER_COMMENT_ID` |
>
> All threads are resolved after each round → unresolved = 0 at next round start.
> GitHub issue comment IDs are globally monotonically increasing — `id > TRIGGER_COMMENT_ID`
> reliably identifies "replies after trigger".

### Pre-loop Check

Check for **unresolved review threads** (possibly left over from previous rounds):

```bash
UNRESOLVED=$(gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewThreads(first:100){
        nodes{ isResolved }
      }
    }
  }
}' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved==false)] | length')
```

- `UNRESOLVED == 0` → start from Step 1 (first round)
- `UNRESOLVED > 0` → **initialize `current_reviewer` first (same rules as main loop)**, then jump to Step 3

### Main Loop

```
# ── Initialization (after pre-flight, before entering loop) ──
# Argument parsing (see above): external_only and current_reviewer are set
# current_reviewer = reviewer_args non-empty ? reviewer_args : "codex bot"

round = 0
LOOP (max 10 rounds):
  round += 1
  1. Trigger review with current_reviewer (record TRIGGER_COMMENT_ID)
  2. Poll for feedback (unresolved threads + issue comment ID comparison)
     - No suggestions → end (clean pass)
     - Quota exhausted → follow Fallback Logic (config or ask user), back to 1 (doesn't count as new round)
     - Has suggestions → enter Step 3
  3. Process feedback:
     - Get all unresolved threads
     - Evaluate each suggestion (fix or push back)
     - If all pushed back and all are repeats from prior rounds → end (push-back exit)
     - If fixes made → commit + push → resolve threads
                     → maintain current reviewer → back to 1
```

#### Step 1: Trigger Reviewer

**Determine flow based on `current_reviewer`:**

| current_reviewer | Trigger method |
|---|---|
| `"codex bot"` | → Flow A (GitHub bot, command `@codex review`) |
| `"codex cli"` | → Flow B (local CLI) |
| `"gemini"` | → Flow A (GitHub bot, command `/gemini review`) |

**Flow B — Codex CLI mode**: Execute locally, wait for result directly (no polling needed).

> WARNING: **Do not `cd`**: Execute in the current working directory. Never change directories.
> In worktree workflows, the current directory is already the feature branch; any `cd`
> (including to repo root) would make Codex run on main, resulting in empty diffs
> or reviewing the wrong changes.
> Pre-check: `git branch --show-current` should show the feature branch, not `main`.

```bash
# Verify correct directory first
git branch --show-current  # confirm not on main
# Execute review
codex review --base main 2>&1
```

**Flow A — GitHub bot mode** (Codex bot / Gemini): Comment on PR to trigger review, record the trigger comment's ID.

```bash
# Trigger and get comment URL (contains comment ID)
COMMENT_URL=$(gh pr comment <PR_NUMBER> --body "REVIEWER_CMD")
TRIGGER_COMMENT_ID=$(echo "$COMMENT_URL" | sed 's/.*-//')  # macOS-compatible, extract from issuecomment-{id}
```

> **`TRIGGER_COMMENT_ID` is the sole filter for subsequent polling.** GitHub issue comment IDs
> are globally monotonically increasing — bot reply IDs are always > trigger ID. No timestamps needed.

**Confirm trigger succeeded (Codex bot only):** Codex bot adds a 👀 emoji reaction upon receiving the trigger. Wait 30 seconds after triggering and check for the reaction:

```bash
sleep 30
EYES_COUNT=$(gh api repos/{owner}/{repo}/issues/comments/{TRIGGER_COMMENT_ID}/reactions \
  --jq '[.[] | select(.content == "eyes")] | length')
```

- **Has 👀 reaction** → trigger succeeded, proceed to Step 2
- **No 👀 reaction** → wait another 30 seconds and recheck
- **Still no 👀 on second check** → trigger failed, re-comment `@codex review` (max 2 retries)
- **2 retries still fail** → follow Fallback Logic above (config or ask user)

This step is important: `@codex review` comments sometimes don't trigger the bot. No 👀 means the bot didn't receive it — must re-trigger.

#### Step 2: Wait for Feedback

**Codex CLI mode** — Wait for stdout to complete (typically 1-3 min, set timeout 5 min). If stderr contains "usage limit" or exit code is non-zero → follow Fallback Logic (config or ask user).

Parse stdout:
- No `[P*]` tags, only summary paragraphs → no suggestions, review loop ends
- Has `[P*]` tags → extract all suggestions, enter Step 3

**GitHub bot mode** — Each poll checks two things:

```bash
# [A] Unresolved review thread count (detect inline feedback)
UNRESOLVED=$(gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewThreads(first:100){
        nodes{ isResolved }
      }
    }
  }
}' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved==false)] | length')

# [B] Current active reviewer's issue comment with ID > TRIGGER_COMMENT_ID (detect summary)
# Only check $BOT_LOGIN (current active reviewer) to avoid false positives from other bots
# Note: gh api --jq doesn't support --arg, must pipe to jq CLI
BOT_COMMENT_BODY=$(gh api repos/{owner}/{repo}/issues/{pr}/comments --paginate | \
  jq -r --arg bot "$BOT_LOGIN" --argjson tid "$TRIGGER_COMMENT_ID" \
     '[.[] | select((.user.login == $bot) and .id > $tid)] | last | .body // empty')
```

The two checks determine the next action:

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | `BOT_COMMENT_BODY` contains "quota exceeded"/"rate limit"/"usage limit"/"too many requests" | Switch reviewer immediately |
| 2 | `BOT_COMMENT_BODY` contains "Didn't find"/"no issues"/"looks good"/"LGTM" | **Clean pass → end loop** |
| 3 | `UNRESOLVED > 0` | Has inline feedback → **enter Step 3 immediately** |
| 4 | None of the above | Continue waiting |

> WARNING: **Priority order matters**: check issue comments first (clean pass or quota), then
> unresolved threads. The bot may post a summary before inline comments — checking summary
> first correctly identifies clean passes.

> WARNING: **When matching quota or clean pass, print the first 3 lines of `BOT_COMMENT_BODY`
> for manual verification.** Bot boilerplate text may contain keywords like "limit" causing
> false positives. Be especially vigilant if it matches on the first poll.

> WARNING: **When `UNRESOLVED > 0` is detected, enter Step 3 immediately — don't wait for
> more threads.** Bots may send inline comments in batches, but waiting is unnecessary —
> the next review round will naturally catch any that were missed. Waiting only wastes time
> and violates the "process feedback when available" principle.

**Polling cadence (Codex GitHub bot, after 👀 confirmed):**

Poll every 1 minute, max 20 times (20 minutes total):
- Got response → enter Step 3 or end
- 20 polls with no response → follow Fallback Logic (config or ask user)

**Polling cadence (Gemini):**
1. **First wait 3 minutes** (`sleep 180`) then check
2. No response → wait **2 more minutes** (`sleep 120`) then check (2nd try)
3. Still no response → wait **2 more minutes** (`sleep 120`) then check (3rd try)
4. Three checks with no response (7 minutes total) → stop and tell user all reviewers are unresponsive

#### Step 3: Process Feedback (via Subagent)

Processing review feedback involves extensive file reading and fixing. To avoid bloating
the main conversation context, **this must be delegated to a subagent**.

**3a. Get full content of all unresolved threads:**

```bash
gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewThreads(first:100){
        nodes{
          id
          isResolved
          comments(first:5){
            nodes{
              databaseId
              author{ login }
              path
              body
              line
            }
          }
        }
      }
    }
  }
}' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved==false) | {
    threadId: .id,
    comments: [.comments.nodes[] | {databaseId, author: .author.login, path, line, body}]
  }]'
```

> No timestamp filtering needed. Since all threads are resolved at each round's end,
> unresolved threads here are exactly the feedback to process this round.

**3b. Process feedback:**

1. **Invoke `receiving-code-review` skill first** (via `Skill` tool) to load the processing mindset.
   If the skill is not available, proceed without it — evaluate each suggestion using your own
   judgment on whether it's a genuine issue or a false positive.
2. Check whether any suggestions were already pushed back in previous rounds. If so, reconsider. If still deciding to push back, consider whether to add a code comment or note in CONTEXT.md so the reviewer understands the reasoning. If the same issue has been raised multiple times, it can be ignored.
3. **Dispatch subagent** (via `Agent` tool) to handle all unresolved threads. Prompt must include:
   - Full content of all unresolved threads (body, path, line, **thread id**)
   - Instruction: "Use the `superpowers:receiving-code-review` skill framework to evaluate each suggestion. If the skill is not available, evaluate each suggestion on its own merits — fix genuine issues, push back on false positives with solid technical reasoning."
   - Instruction: "False positives require solid technical reasoning to push back"
   - Instruction: "After fixes, commit + push"
   - Commit message format: `fix: code review fixes — <summary>`
   - If packaged files (e.g., `.skill`) are involved, remind to re-package

   ```
   Agent(
     description: "Process PR code review feedback",
     prompt: "Here are the unresolved review threads for PR #<NUMBER>:\n\n<THREADS>\n\nUse the receiving-code-review skill framework to evaluate each one, fix items worth fixing, then commit + push.",
     mode: "auto"
   )
   ```

**3c. Resolve all processed threads:**

After subagent completes, the main conversation resolves all threads processed this round:

```bash
for THREAD_ID in <all unresolved thread IDs>; do
  gh api graphql -f query='
    mutation($id:ID!){
      resolveReviewThread(input:{threadId:$id}){
        thread{ id isResolved }
      }
    }' -f id="$THREAD_ID"
done
```

**Resolve all processed threads** (both fixed and pushed-back). After confirming push succeeded,
**maintain current reviewer** (no per-round reset), immediately return to Step 1 to trigger the
next review round. No need to wait for CodeRabbit — it's a passive reviewer that auto-triggers
on push; its unresolved threads will be naturally detected during the next Step 2 poll.

### Exit Conditions

After each Step 3 fix-and-push, **must return to Step 1 for another round** until one of
these conditions is met:

### 1. No new suggestions (clean pass)
- GitHub bot mode: Step 2 detects bot summary with "Didn't find" or similar positive message, and unresolved threads = 0
- Codex CLI mode: stdout has no `[P*]` tags, only summary paragraphs

### 2. Only repeated/low-value suggestions (push-back exit)
- All suggestions this round were already pushed back in previous rounds (same file + same topic)
- Or all suggestions this round were evaluated as not worth fixing (with solid technical reasoning)
- Stop fixing — end the loop

### 3. Maximum round protection
- Max **10 rounds**. If exceeded, stop and notify user, let them decide whether to continue

### On exit:
1. Notify user: "Review loop complete" + exit reason + last round's reviewer feedback
2. Report: total rounds run, items fixed, items pushed back, which reviewer was used
3. Ask user whether to merge the PR

### Important Notes

- Between review rounds, **don't rush to fix** — use the `receiving-code-review` framework to evaluate each suggestion first
- If the same issue is raised for two consecutive rounds, re-evaluate before deciding to push back
- If fix volume is large (>20 lines), discuss with user before implementing
- Use `sleep` for polling, not busy-wait, to avoid resource waste
- Reviewer switches stop to ask the user (when no config), or auto-switch per config order with notification
