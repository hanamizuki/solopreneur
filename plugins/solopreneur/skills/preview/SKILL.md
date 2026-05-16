---
name: preview
description: Create an interactive HTML preview of any proposal, plan, idea, doc, brief, or spec, deploy it to Vercel for an instant shareable URL, and embed an in-page comment overlay so the user can highlight text + annotate + one-click export feedback markdown back to the agent. Use this skill WHENEVER the user wants something visualized, made into a webpage, made interactive, shared for human review, or asks for charts / diagrams / calculators they can click through and try out. ALWAYS use this skill when the user says any of - 做個 preview / 給我 preview / 做成網頁 / 視覺化 / 可互動 / 做個 review / share for review / 做個試算的頁面 / 做圖表給我看 / 做 diagram / 用 HTML 呈現 / 把這個 idea 變成網頁 / make this reviewable / build a quick page / interactive proposal. This is the preferred way to share any work-in-progress thinking with a human, because it is faster for them to grok and respond to than a markdown wall of text.
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
   - *Question*: "Vercel CLI 沒裝（or 沒登入 / token 過期）— 要現在設定嗎？這需要你在 terminal 跑一兩行指令。"
   - Options: `現在設定` / `先看 HTML local 就好，之後再 deploy` / `取消`
3. If they pick "現在設定" → print the exact commands they need (`npm i -g vercel` and/or `vercel login`), wait for them to confirm they're done, then re-run preflight. Loop until it passes.
4. If they pick "先看 local" → resolve the proposal path exactly as in step 2 (config-backed, same probe + persistence), write the HTML there, `open` the local file in their browser. They can deploy later when they have time to install.
5. If they pick "取消" → stop cleanly; don't write files they didn't ask for.

`deploy.sh` also runs preflight on every invocation as a safety net — you can't accidentally skip it.

### 2. Decide where the proposal lives, then create the dir

The proposal shouldn't live somewhere arbitrary — it should sit alongside the work the user is already doing. The resolved parent path is **persisted per repo** in the solopreneur config so subsequent runs in the same repo skip the probe and the question entirely.

Inline the cascade config helpers (copied verbatim from `_shared/config.md`) at the top of this step's bash work:

```bash
# --- solopreneur config helpers (inlined from _shared/config.md) ---
read_solopreneur_config() {
  local key="$1"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local fallback="$HOME/.claude/solopreneur.json"
  if [ -f "$primary" ] && jq -e "has(\"$key\")" "$primary" >/dev/null 2>&1; then
    jq -r ".${key} // empty" "$primary"
    return
  fi
  if [ "$primary" != "$fallback" ] && [ -f "$fallback" ]; then
    jq -r ".${key} // empty" "$fallback"
  fi
}

write_solopreneur_config() {
  local key="$1"
  local value_expr="$2"
  local primary="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/solopreneur.json"
  local tmp
  mkdir -p "$(dirname "$primary")"
  tmp=$(mktemp "${primary}.XXXXXX")
  local existing
  existing=$(cat "$primary" 2>/dev/null || echo '{}')
  printf '%s\n' "$existing" \
    | jq --argjson v "$(jq -n "$value_expr")" ".${key} = \$v" \
    > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$primary"
}
# --- end solopreneur config helpers ---
```

**Config schema** — a top-level `preview` key in `solopreneur.json`:

```json
{ "preview": { "paths": { "<repo-key>": "<path>" } } }
```

- `<repo-key>`: `git remote get-url origin` normalized — strip the scheme,
  any trailing `.git`, and any `git@host:` prefix, yielding
  `host/owner/repo`. If there is no `origin` remote, use the absolute git
  toplevel path. If not in a git repo, use `$PWD`.
- `<path>`: stored **relative to the repo root** when the chosen path is
  inside a git repo; absolute otherwise.

**Resolution flow:**

1. **Compute `<repo-key>`** per the rules above.
2. **Read the stored path**: `read_solopreneur_config preview` and inspect
   `.paths["<repo-key>"]`. If it is present and non-empty, resolve it
   (relative → joined onto the git toplevel; absolute → used as-is) and use
   that path. **Skip the probe and the question entirely** — go straight to
   the per-proposal dir.
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
   - *Question*: "要把 preview 放在 `<suggested-path>` 嗎？"
   - Options: `確認並記住` / `改別的路徑` / `每次都問（不記住）`
5. On **`確認並記住`** (or **`改別的路徑`** after the user supplies a path):
   re-read the existing `preview` subtree, set
   `.paths["<repo-key>"]` to the chosen `<path>` (relative to repo root if
   inside a git repo, absolute otherwise) **without clobbering other repos'
   entries**, and persist:

   ```bash
   EXISTING_PREVIEW=$(read_solopreneur_config preview)
   [ -z "$EXISTING_PREVIEW" ] && EXISTING_PREVIEW='{}'
   MERGED=$(printf '%s' "$EXISTING_PREVIEW" \
     | jq --arg k "$REPO_KEY" --arg p "$CHOSEN_PATH" \
         '.paths = ((.paths // {}) | .[$k] = $p)')
   write_solopreneur_config preview "$MERGED"
   ```
6. On **`每次都問（不記住）`**: do **not** persist; use the suggested path
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
- the request is a bare "做個 preview" / "make a preview" arriving after a
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

If the user chose "先看 local" at preflight, skip deploy entirely:
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
   `乾淨版` / `顯示修改` button (added by `comment-overlay.js`); the page
   **defaults to showing the diff** on load. You don't need to do anything
   for this — just produce correct `<del>` / `<ins>` markup and the toggle
   + CSS gate handle the rest.

Then redeploy. Each redeploy is a new URL — share the new one. The
`revision-log` callout (not a free-floating note) is where you summarize
what changed.

## The comment overlay (what the user sees)

The overlay behaves like the comment feature the reviewer already knows
from Google Docs / Notion / a GitHub PR review: a comment leaves a
**visible mark** on the text and lives in a side panel they can revisit,
edit, and delete — not a fire-and-forget toast.

- They highlight any text on the page → a small `+ comment` button appears
- They click it → a modal asks for their note
- They submit → the highlighted text gets a persistent yellow **marker**
  (`<mark class="cmt-mark">`) and a card appears in the comment panel
  **immediately, with no reload**. The marker *is* the confirmation —
  there is no transient "comment added" toast. The comment is saved in
  `localStorage` (survives reload during the review session) and is
  re-anchored to the same text on every reload by its surrounding context,
  so it survives Alpine re-renders and the diff/clean toggle.
- **Desktop (≥1024px):** a fixed comment panel docks on the right. Page
  content is shifted left so the panel never covers it. Cards are ordered
  by where their marker sits in the document. Clicking a marker scrolls the
  panel to its card and flashes it; clicking a card scrolls the page to its
  marker and flashes it. Each card has `編輯` (inline edit) and `刪`
  (delete — removes the marker and restores the original text). The export
  button and the `乾淨版` / `顯示修改` toggle live in a sticky bar inside
  the panel.
- **Mobile (<1024px):** no docked panel. Tapping a marker opens a bottom
  sheet with just that comment (edit / delete). A floating `comments (N)`
  button opens a full-list bottom sheet.
- If a comment's anchor text can no longer be found on the page (it was
  edited away, or it's older data with no anchor), the comment is **not
  lost** — it still shows in the panel marked *detached*; it just can't
  scroll to a marker.
- A floating `export comments (N)` button shows the count. Clicking it
  opens an export modal with the full markdown in an editable textarea,
  plus three buttons: Copy / Close / Clear. Nothing auto-clears — the user
  can reopen, recopy, or edit-before-copy as needed. The exported markdown
  format is unchanged: `## comments on: <title>`, the URL,
  `exported: <iso>`, then `### comment N` / `> quote` / blank / comment /
  blank blocks.
- On a revised page (one that contains `<del>` / `<ins>` diff markup) a
  `乾淨版` / `顯示修改` toggle appears. It toggles between the GitHub-diff
  view (removed text struck through, added text highlighted) and a clean
  rendered view. **The page defaults to the diff view** so the reader
  immediately sees how their feedback was applied. The choice persists in
  `localStorage` for the review session. Markers coexist with diff markup —
  the toggle still works on a page that has both. On a first-draft page (no
  diff markup yet) this toggle is hidden.

Their workflow is: open URL, skim, highlight problem spots while reading
(each becomes a visible marker + panel card they can revisit and edit),
click export, edit if needed, click Copy, paste back. On a revision they
land on the diff, see exactly what changed, and can flip to `乾淨版` to
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
