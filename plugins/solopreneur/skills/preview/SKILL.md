---
name: preview
description: Create an interactive HTML preview of any proposal, plan, idea, doc, brief, or spec, deploy it to Vercel for an instant shareable URL, and embed an in-page comment overlay so the user can highlight text + annotate + one-click export feedback markdown back to the agent. Use this skill WHENEVER the user wants something visualized, made into a webpage, made interactive, shared for human review, or asks for charts / diagrams / calculators they can click through and try out. ALWAYS use this skill when the user says any of - make a preview / give me a preview / turn this into a webpage / visualize this / make it interactive / do a review / share for review / make a calculator page / make me a chart / make a diagram / render this as HTML / turn this idea into a webpage / make this reviewable / build a quick page / interactive proposal. This is the preferred way to share any work-in-progress thinking with a human, because it is faster for them to grok and respond to than a markdown wall of text.
---

# preview

Turn any proposal / plan / idea into an interactive HTML page, deploy it to Vercel, and hand the user a URL. The page comes with a built-in comment overlay so the user can highlight text, leave notes, and export the feedback as markdown for the next iteration.

## Outcome the user is looking for

A link they can open in their browser, read or play with, and respond to with concrete in-context comments. Not a wall of markdown. Not a static screenshot. Something they can **try**.

## Workflow

### 1. Preflight FIRST, before writing anything

**Always run `bash scripts/preflight.sh` before drafting the HTML.** No exceptions. Doing it early saves you from writing a great proposal and then discovering you can't ship it. Preflight verifies the Vercel CLI is installed, the user is logged in, and the token still works.

**If preflight passes:** Say one short line (`vercel CLI ready, proceeding…`) and move to step 2. Don't dwell.

**If preflight fails:** Do NOT silently surface the script's error and stop. The user pinged you to make a preview; they want a path forward, not a punt. Instead:

1. Read the preflight stderr — it tells you exactly what's missing (CLI absent / not logged in / token expired) and which command fixes it.
2. **Use AskUserQuestion** to ask the user whether to set up Vercel now. Frame it concretely:
   - *Question*: "Vercel CLI isn't installed (or not logged in / token expired) — set it up now? You'll need to run a line or two in your terminal."
   - Options: `Set up now` / `Just view HTML locally, deploy later` / `Cancel`
3. If they pick "Set up now" → print the exact commands they need (`npm i -g vercel` and/or `vercel login`), wait for them to confirm they're done, then re-run preflight. Loop until it passes.
4. If they pick "Just view locally" → resolve the proposal path exactly as in step 2 (config-backed, same probe + persistence), write the HTML there, `open` the local file in their browser. They can deploy later when they have time to install.
5. If they pick "Cancel" → stop cleanly; don't write files they didn't ask for.

`deploy.sh` also runs preflight on every invocation as a safety net — you can't accidentally skip it.

### 2. Decide where the proposal lives, then create the dir

The proposal shouldn't live somewhere arbitrary — it should sit alongside the work the user is already doing. The resolved parent path is **persisted per repo** in the solopreneur config so subsequent runs in the same repo skip the probe and the question entirely.

Inline the cascade config helpers (copied verbatim from `_shared/config.md`) at the top of this step's bash work:

```bash
# --- solopreneur config helpers (inlined from _shared/config.md) ---
# Compute the canonical repo identity used as the key under `.repos` in
# solopreneur.json. Falls back to git toplevel path, then $PWD.
solopreneur_repo_key() {
  local url root
  url=$(git remote get-url origin 2>/dev/null || true)
  if [ -n "$url" ]; then
    # Strip protocol schemes (https/http/ssh/git) and user prefixes (git@)
    # in either order — origin URLs come in many shapes:
    #   https://github.com/owner/repo.git
    #   http://github.com/owner/repo.git
    #   ssh://git@github.com/owner/repo.git
    #   git://github.com/owner/repo.git
    #   git@github.com:owner/repo.git
    url="${url#https://}"; url="${url#http://}"
    url="${url#ssh://}";   url="${url#git://}"
    url="${url#git@}"
    url="${url%.git}"
    # Replace the first `:` with `/` — the scp-style `git@host:owner/repo`
    # form. Bash `${var/pattern/replacement}` parses the second `/` as the
    # delimiter; the chars after it (`/` here) are the replacement, so this
    # produces a single slash, not double. (Tested.)
    url="${url/://}"
    printf '%s\n' "$url"
    return
  fi
  root=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$root" ]; then
    printf '%s\n' "$root"
    return
  fi
  printf '%s\n' "$PWD"
}

# Read a feature subtree from solopreneur.json with the 5-layer cascade:
# 1. primary .repos[<repo-key>].<feature>
# 2. primary .default.<feature>
# 3. fallback .repos[<repo-key>].<feature>
# 4. fallback .default.<feature>
# 5. legacy top-level .<feature> (primary then fallback)
# First non-null wins. Each layer is checked inline (no nested helper
# function — bash function declarations are global, even nested ones, and
# would pollute the user's shell namespace).
read_solopreneur_config() {
  local key="$1"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local fallback="$HOME/.claude/solopreneur.json"
  local repo_key; repo_key=$(solopreneur_repo_key)
  local out

  # Layer 1: primary .repos[<repo-key>].<feature>
  if [ -f "$primary" ]; then
    out=$(jq -r --arg rk "$repo_key" --arg fk "$key" '.repos[$rk][$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
    # Layer 2: primary .default.<feature>
    out=$(jq -r --arg fk "$key" '.default[$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi

  # Layers 3 + 4: fallback file, only if different from primary
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    out=$(jq -r --arg rk "$repo_key" --arg fk "$key" '.repos[$rk][$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
    out=$(jq -r --arg fk "$key" '.default[$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi

  # Layer 5: legacy top-level — primary then fallback
  if [ -f "$primary" ]; then
    out=$(jq -r --arg fk "$key" '.[$fk] | values' "$primary" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    out=$(jq -r --arg fk "$key" '.[$fk] | values' "$fallback" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s\n' "$out"; return; fi
  fi
}

# Write a feature subtree to .default.<key> in the primary file.
# Sibling keys are preserved (atomic read-modify-write).
# Usage: write_solopreneur_config greenlight '{fallback_order:["codex-bot","gemini"]}'
write_solopreneur_config() {
  local key="$1"
  local value_expr="$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local tmp existing
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  existing=$(cat "$primary" 2>/dev/null); [ -z "$existing" ] && existing='{}'
  printf '%s\n' "$existing" \
    | jq --arg fk "$key" --argjson v "$(jq -n "$value_expr")" \
        '.default = ((.default // {}) | .[$fk] = $v)' \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}

# Write a feature subtree to .repos[<repo-key>].<key> in the primary file.
# Sibling repos AND sibling features within the same repo are preserved.
# Usage: write_solopreneur_repo_config preview '{path:"docs/preview"}'
write_solopreneur_repo_config() {
  local key="$1"
  local value_expr="$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local repo_key; repo_key=$(solopreneur_repo_key)
  local tmp existing
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  existing=$(cat "$primary" 2>/dev/null); [ -z "$existing" ] && existing='{}'
  printf '%s\n' "$existing" \
    | jq --arg rk "$repo_key" --arg fk "$key" --argjson v "$(jq -n "$value_expr")" \
        '.repos = ((.repos // {}) | .[$rk] = ((.[$rk] // {}) | .[$fk] = $v))' \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}
# --- end solopreneur config helpers ---
```

**Config schema** — layered `preview` config in `solopreneur.json`:

```jsonc
// new layered schema
{ "repos": { "<repo-key>": { "preview": { "path": "<path>" } } } }
```

- `<repo-key>` is computed by the shared `solopreneur_repo_key` helper
  inlined above (`host/owner/repo` from the origin URL, or git toplevel
  path, or `$PWD`).
- `<path>`: stored **relative to the repo root** when the chosen path is
  inside a git repo; absolute otherwise.
- Legacy reads: configs written by older versions of this skill kept the
  per-repo paths at `preview.paths.<repo-key>` (a single shared `preview`
  subtree). `read_solopreneur_config preview` will still return that older
  subtree via the legacy fallback layer — handle both shapes when reading
  (see step 2 below).

**Resolution flow:**

1. **Compute the repo key**: `REPO_KEY=$(solopreneur_repo_key)`.
2. **Read the stored path**: try the new shape first (per-repo, single
   `path`), then fall back to the legacy shape (single `preview` subtree
   with a `paths` map):
   ```bash
   STORED=$(read_solopreneur_config preview)
   # New shape: when stored under repos[<rk>].preview, the cascade returned
   # `{ "path": "..." }` directly. Legacy shape returns `{ "paths": {...} }`.
   if [ -n "$STORED" ]; then
     PATH_VAL=$(printf '%s' "$STORED" | jq -r '.path // empty')
     if [ -z "$PATH_VAL" ]; then
       PATH_VAL=$(printf '%s' "$STORED" | jq -r --arg k "$REPO_KEY" '.paths[$k] // empty')
     fi
   fi
   ```
   If `PATH_VAL` is non-empty, resolve it (relative → joined onto the git
   toplevel; absolute → used as-is) and use that path. **Skip the probe and
   the question entirely** — go straight to the per-proposal dir.
3. **If absent, probe for a *suggested* path** (this is only a suggestion;
   the user confirms in step 4):
   - `git_root = $(git rev-parse --show-toplevel 2>/dev/null)`
   - If inside a repo:
     - A. Read that repo's `AGENTS.md` / `CLAUDE.md` / `README`. If they
       explicitly say where proposals / RFCs / design docs / specs live
       (e.g. "RFCs go in `docs/rfc/`", "specs in `specs/`", "todos in
       `todos/{triage,…}`"), use that. Match the spirit, not the keyword —
       a repo that organises thinking docs under `notes/` wants this skill
       to use `notes/`.
     - B. Otherwise look at the actual directory layout. If
       `docs/proposals/`, `docs/rfcs/`, `proposals/`, `design-docs/`, or
       similar already exists, sit inside it.
     - C. Otherwise default to `<git_root>/docs/preview/`.
     - **Fork-safety check**: if the repo has an `upstream` remote
       (`git remote -v | grep -i upstream`), this is probably a fork of an
       open-source project. Don't suggest dropping personal proposals into
       someone else's repo history — suggest the no-git fallback below
       instead and tell the user why.
   - If **not** in a git repo: if the cwd is inside a recognizable agent
     workspace (a directory tree with an `AGENTS.md` / `CLAUDE.md` at or
     above the cwd), suggest a workspace-relative `docs/preview/`. Final
     fallback: `~/.claude/previews/`.
4. **Confirm with `AskUserQuestion`** — present the suggested path:
   - *Question*: "Put the preview in `<suggested-path>`?"
   - Options: `Confirm and remember` / `Use a different path` / `Ask every time (don't remember)`
5. On **`Confirm and remember`** (or **`Use a different path`** after the user supplies a path):
   persist the chosen path under this repo's entry. The per-repo write
   helper handles the `repos[<repo-key>].preview` nesting; sibling repos
   are preserved automatically:

   ```bash
   write_solopreneur_repo_config preview "$(jq -n --arg p "$CHOSEN_PATH" '{path: $p}')"
   ```
   `$CHOSEN_PATH` is relative to repo root if inside a git repo, absolute
   otherwise.
6. On **`Ask every time (don't remember)`**: do **not** persist; use the suggested path
   for this run only.

The final proposal path is `<parent>/<YYYY-MM-DD>-<short-slug>/`. Each proposal lives in its own dir so its URL stays immutable. Don't reuse a dir across unrelated proposals; redeploying the same dir to iterate on the same proposal is fine (gives you a new URL each time, old ones remain).

**If the path lands inside a repo:**

1. The proposal HTML enters git history alongside the user's work — useful for review trail and cross-machine access. Good. Just commit it as a normal repo doc, no special handling.
2. `comment-overlay.js` is copied from this skill into every proposal dir. It would be wasteful to commit identical copies of it into every proposal and let stale versions linger. Append this line to the repo's `.gitignore` if not already there:
   ```
   **/comment-overlay.js
   ```
   Tell the user you did this (one short line) so they don't see a phantom diff.

### 2.5 Define what goes in

Before writing the HTML, know exactly which deliverable the preview is
**for**. A preview of the wrong artifact wastes the whole round.

**Self-assess ambiguity first — don't ask reflexively.** Ask the user
**only if** any of these hold:

- the session discussed **≥2 separable topics / deliverables** and the
  preview request didn't name which one;
- the request is a bare "make a preview" arriving after a
  **wide-ranging discussion** with no single clear target;
- **multiple candidate artifacts** plausibly exist (e.g. a plan *and* a
  pricing model *and* a roadmap).

**If it's clear** (the common case — the user just asked to preview the
thing you were both just working on): state in **one line** what you're
about to preview ("Previewing the Q3 pricing proposal — the 3-tier table +
the calculator.") and proceed. No question.

**If it's ambiguous:** use `AskUserQuestion` with **multiSelect**, listing
the session's candidate pieces as options (one option per separable
artifact, plus the natural combinations if they belong together). The
selected set becomes the **content contract** for Step 3 — build exactly
that, nothing the user didn't pick. Don't editorialize the list; surface
what was actually discussed.

This step adds zero friction to the normal "preview what we just did" path
and only interrupts when the target genuinely isn't determinable.

### 3. Write `index.html`

Start from `assets/template.html` (copy it in, replace the `{{TITLE}}` / `{{DATE}}` / `{{LEAD_PARAGRAPH}}` / `{{AUTHOR_OR_CONTEXT}}` placeholders, then build the body).

**Also copy `assets/comment-overlay.js` into the same directory** — the template references it as `./comment-overlay.js`. Without this file the page works but has no comment functionality, defeating the point.

The template already loads Tailwind + Alpine.js. To use Chart.js or Mermaid, uncomment the relevant `<script>` tag at the top of `template.html`.

**For viewport-wide slide decks** (e.g. content built with `/slide-design`): wrap all slides in `<main class="doc">…</main>` (the overlay JS gates selection capture on this selector — slides as direct children of `<body>` never trigger the "+ comment" button), then set `<body class="cmt-full-bleed">`. The template ships an opt-in mode that switches the gutter reserve from `margin-right: 332px` to `width: calc(100% - 332px)` on `main.doc`, so full-bleed slides don't overflow under the reserved gutter once comments exist. Pair with `scroll-snap-type: y proximity` (not `mandatory`) and `.slide { width: 100% }` (not `100vw`). The narrow-column default still applies to every prose page that doesn't set this class — no risk to existing previews.

**Read `references/libs.md` before writing interactive components.** It has the working recipes for Alpine state, Chart.js neutral palette, and Mermaid diagrams — not knowing them means you'll fall back to plain HTML and lose the value of this skill.

**Form follows content.** Don't impose a fixed template structure (calculator vs. dashboard vs. doc). Read the proposal and let the shape emerge:

- A pricing decision → comparison table + a small calculator the reader can plug numbers into
- A technical plan → sectioned doc + Mermaid flowchart + risk callouts
- A KPI / roadmap proposal → Chart.js bars/lines + Mermaid gantt
- A product idea → narrative paragraphs + a tabbed "what-if" exploration

Use callouts (`<div class="callout">…</div>`) sparingly for things you want the reader's eye to land on. Use tables for comparisons. Use Alpine for anything where the reader benefits from changing an input and seeing what shifts.

### 4. Deploy (or open locally as fallback)

If preflight passed:
```
scripts/deploy.sh <path-to-proposal-dir>
```
The script prints the URL to stdout (progress goes to stderr). Show that URL to the user prominently — that's the deliverable.

The Vercel project name is derived per working context (basename of the proposal dir's enclosing repo + `-preview`, sanitized to a Vercel-legal name), so every preview for the same repo lands in one tidy project. Each deploy produces a unique immutable URL. When you know your workspace / agent identity, you MAY set `PREVIEW_PROJECT=<workspace-or-agent-name>-preview` (e.g. `PREVIEW_PROJECT=mojo-preview`) before invoking `deploy.sh` — it is then used verbatim.

If the user chose "Just view locally" at preflight, skip deploy entirely:
```
open <path-to-proposal-dir>/index.html
```
The comment overlay works the same way over `file://` — they can still highlight + comment + export. Only the share-via-URL part is missing, which is fine if it's just self-review.

### 5. Wait for feedback (revise diff-style, never silently replace)

When the user comes back with pasted comment markdown (it looks like
`## comments on: …` followed by `### comment 1` blocks with `> quoted text`
and the user's note), revise the HTML **as a visible diff**, not a silent
rewrite. The reader should see exactly how their feedback was applied — like
a GitHub PR. Do this every revision round:

1. **Flatten the previous round first (per-round reset).** Before applying
   this round's edits, remove the prior round's diff markup so the page
   represents the last-reviewed accepted state with no diff:
   - Delete every existing `<del>…</del>` node entirely (that text was
     rejected last round — it's gone now).
   - Unwrap every `<ins>…</ins>` (keep the inner text, drop the tags — that
     text was accepted last round, it's now just normal content).
   The diff always means "changes since your last review", never a
   cumulative pile-up across rounds.
2. **Apply this round's changes as diff.** For each change driven by a
   comment: wrap the removed text in `<del>…</del>` (leave it in place,
   struck through — do not delete it) and the new/changed text in
   `<ins>…</ins>`. Reordering counts: `<del>` the old position, `<ins>` the
   new one.
3. **Refresh the revision changelog at the top.** Maintain a single
   `<div class="callout revision-log">…</div>` near the top of `<main>`
   (just after the lead paragraph). Each round, rewrite it with a heading
   like `revision N — changes from review` and a short list of what changed
   this round and which comment each item addresses. Replace it wholesale
   each round (it describes only the current round, matching the per-round
   diff).
4. **Never silently replace content on a revision.** Every post-feedback
   content change goes through the `<del>` / `<ins>` mechanism. Do not edit
   text in place without wrapping it — the reader must be able to see
   exactly what moved.
5. **The reader can toggle to a clean view.** The comment overlay shows a
   `Clean` / `Show edits` button (added by `comment-overlay.js`); the page
   **defaults to showing the diff** on load. You don't need to do anything
   for this — just produce correct `<del>` / `<ins>` markup and the toggle
   + CSS gate handle the rest.

Then redeploy. Each redeploy is a new URL — share the new one. The
`revision-log` callout (not a free-floating note) is where you summarize
what changed.

## The comment overlay (what the user sees)

The overlay behaves like margin annotations the reviewer already knows
from Google Docs / Medium / Substack: a comment leaves a **visible mark**
on the text and a card sits in the right gutter next to the text it
annotates — revisitable, editable, deletable, not a fire-and-forget
toast.

- They highlight any text on the page → a `+ comment` button appears
- They tap/click it → a modal asks for their note
- They submit → the highlighted text gets a persistent yellow **marker**
  (`<mark class="cmt-mark">`) and a card appears in the margin
  **immediately, with no reload**. The marker *is* the confirmation —
  there is no transient "comment added" toast. The comment is saved in
  `localStorage` (survives reload during the review session) and is
  re-anchored to the same text on every reload by its surrounding context,
  so it survives Alpine re-renders and the diff/clean toggle.
- **Desktop (≥1024px):** comments render as **margin notes** in a
  transparent right gutter — each card floats near the text it annotates,
  not collected in a separate panel. There is no panel chrome (no border,
  no `Comments` title, no scrolling list, no footer bar). Cards stack
  top→bottom in marker order; when two markers are close the lower card is
  pushed down so cards never overlap (cascading). The reading column only
  reserves the gutter once at least one comment exists — a zero-comment
  first draft renders **full-width**. Each card shows, top to bottom: the
  quoted snippet, a **relative timestamp** (`now` / `5m ago` / `3h ago` /
  dated for older), the comment body, and `Edit` / `Delete`. No name, no
  avatar. Clicking a marker scrolls the page to it and flashes its card;
  clicking a card scrolls the page to its marker and flashes it. Plain
  scrolling moves the cards with the text (no recompute). The `export`
  button and the `Clean` / `Show edits` toggle live in a floating
  bottom-right cluster.
- **Mobile (<1024px):** comment **creation now works** — selecting text
  arms a fixed `+ comment` button parked at bottom-center (above the
  cluster, not next to the selection, so it doesn't fight the OS selection
  callout). Tapping it opens the same modal. Viewing is unchanged: tapping
  a marker opens a bottom sheet with that one comment (edit / delete), and
  a floating `comments (N)` button opens a full-list bottom sheet.
- If a comment's anchor text can no longer be found on the page (it was
  edited away, or it's older data with no anchor), the comment is **not
  lost** — it still shows as a card marked *detached*, stacked after the
  anchored cards at the bottom of the gutter; it just can't scroll to a
  marker.
- A floating `export comments (N)` button shows the count. Clicking it
  opens an export modal with the full markdown in an editable textarea,
  plus three buttons: Copy / Close / Clear. Nothing auto-clears — the user
  can reopen, recopy, or edit-before-copy as needed. The exported markdown
  format: `## comments on: <title>`, the URL, `exported: <iso>`, then
  `### comment N` / `> quote` / blank / comment / blank blocks. The
  `> quote` includes the surrounding context (~32 chars on each side)
  captured at selection time, with the actually-selected span wrapped in
  bold (`**`) and outer `…` marking that the context was truncated by
  the window — this lets you locate which occurrence the reader meant
  when the selected text repeats on the page. Older v1 comments (no
  captured anchor) fall back to the bare quote.
- On a revised page (one that contains `<del>` / `<ins>` diff markup) a
  `Clean` / `Show edits` toggle appears. It toggles between the GitHub-diff
  view (removed text struck through, added text highlighted) and a clean
  rendered view. **The page defaults to the diff view** so the reader
  immediately sees how their feedback was applied. The choice persists in
  `localStorage` for the review session. Markers coexist with diff markup —
  the toggle still works on a page that has both. On a first-draft page (no
  diff markup yet) this toggle is hidden.

Their workflow is: open URL, skim, highlight problem spots while reading
(each becomes a visible marker + panel card they can revisit and edit),
click export, edit if needed, click Copy, paste back. On a revision they
land on the diff, see exactly what changed, and can flip to `Clean` to
read the clean result. Yours is to act on each `> quote` + comment pair.

## What not to do

- **Don't deploy without copying `comment-overlay.js`** alongside `index.html` — the page works but the comment feature silently dies.
- **Don't write a multi-file React project** — single `index.html` + the `comment-overlay.js` sidekick is the whole stack. If a proposal genuinely needs React + shadcn level complexity, fall back to a heavier multi-file builder skill if one is available and deploy its built HTML bundle via `deploy.sh`.
- **Don't pre-decide the layout before reading the content.** A "proposal" that's really a numbers-driven recommendation needs charts, not paragraphs; a "doc" that's really a flow needs a diagram, not prose.
- **Don't reuse `index.html` across unrelated proposals** — every preview should have its own immutable URL for the user to revisit.
- **Don't let diff markup accumulate across rounds.** Always flatten the previous round (delete old `<del>`, unwrap old `<ins>`) before applying the new one — otherwise after a few iterations the page is an unreadable pile of strikethroughs and the diff stops meaning "changes since your last review".
- **Don't silently replace content when revising after feedback.** Every post-feedback content change goes through `<del>` / `<ins>` so the reader can see exactly what moved. Editing text in place without the diff markup defeats the point of the revision view.

## Files in this skill

- `scripts/preflight.sh` — verifies Vercel CLI + auth (auto-invoked by deploy.sh; can be run standalone)
- `scripts/deploy.sh` — deploy a directory, print URL (runs preflight first)
- `assets/template.html` — base template with typography + CDN libs
- `assets/comment-overlay.js` — comment functionality + the diff/clean revision toggle (must be copied alongside `index.html`)
- `references/libs.md` — Alpine / Chart.js / Mermaid recipes — **read before writing interactive UI**
