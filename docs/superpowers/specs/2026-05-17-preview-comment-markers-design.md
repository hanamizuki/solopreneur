# preview skill: conditional scope step + Google Docs-style comment markers

Date: 2026-05-17
Status: design (implementation contract)
Affected skill: `plugins/solopreneur/skills/preview/`

## Problem

The `preview` skill ships an in-page comment overlay. Two gaps:

1. **No scope confirmation.** "做個 preview" after a wide-ranging session
   leaves the agent guessing which deliverable to render. It silently picks
   one and may preview the wrong thing.
2. **Comments leave no visible trace.** The current overlay is
   highlight -> `+ comment` -> modal -> toast. After submitting, the
   highlighted text looks identical to everything else. The reviewer cannot
   see what they have already commented on, cannot revisit a comment in
   context, and cannot edit or delete a single comment short of nuking all
   of them. This is unlike every tool the reviewer already knows (Google
   Docs, Notion, GitHub PR review), so it fails the "act like the thing it
   resembles" test.

## Feature A: conditional scope-confirmation step

A new **Step 2.5 "Define what goes in"** sits between Step 2 (where the
proposal lives) and Step 3 (write `index.html`). SKILL.md only, no code.

The agent self-assesses ambiguity. It asks the user **only if** any hold:

- the session discussed >=2 separable topics/deliverables and the preview
  request did not name which;
- the request is a bare "做個 preview" after a wide-ranging discussion with
  no single clear target;
- multiple candidate artifacts exist (plan + pricing model + roadmap, etc).

Behavior:

- **Clear** -> state in one line what is being previewed, proceed, no
  question. (Most cases: the user just asked for a preview of the thing
  they were just discussing.)
- **Ambiguous** -> `AskUserQuestion` with `multiSelect`, listing the
  session's candidate pieces. The selected set is the Step 3 content
  contract.

Rationale: a question every time is friction; a question never is the
status quo bug. The trigger conditions are deliberately narrow so the
common case stays zero-friction.

## Feature B: Google Docs-style comment markers

### Constraints (hard)

- Pure client-side. `localStorage` only. No backend, no build step, no new
  external dependency. Single static page, single review session.
- A revision is a new URL/page. Markers do NOT need to survive across
  revisions. They only need to survive **reload within one review session**
  and **Alpine.js re-render** on the same page.

### Why TextQuoteSelector (not offsets, not DOM paths)

The page loads Alpine.js. Alpine can re-render subtrees, which destroys any
node reference or `nth-child` path captured at comment-create time.
Character offsets into `body.textContent` break the moment a `<del>`/`<ins>`
diff toggle hides/shows content. A W3C-style **TextQuoteSelector**
(`{exact, prefix, suffix}`) anchors to the *text itself* plus a window of
surrounding text for disambiguation. It re-locates the range by content on
every load, so it survives Alpine re-render and diff toggling. This is the
single most important design decision and the reason offsets/XPath were
rejected.

### Anchoring algorithm

On comment create:

- Capture the selection Range.
- `exact` = selected string.
- `prefix` = up to ~32 chars of text content immediately before the range.
- `suffix` = up to ~32 chars immediately after.
- Persist `anchor: {exact, prefix, suffix}` plus a stable `id`.

On load (and after Alpine settles), for each comment:

- Concatenate the document's text-node content into one string while
  recording node boundaries.
- Find the unique occurrence of `prefix + exact + suffix`. If `prefix`/
  `suffix` empty (range at document edge) fall back to unique `exact`.
- Convert the matched character span back to a DOM Range.
- Wrap the range in `<mark class="cmt-mark" data-cmt-id="<id>">`. Because a
  range can span multiple text nodes and `Range.surroundContents()` throws
  on ranges that partially intersect a node, wrapping is done **per
  intersected text node** (split the node at range boundaries, wrap each
  fully-covered text node). This keeps `<del>`/`<ins>` structure intact
  because the wrap never crosses element boundaries destructively.

Graceful degrade: if a comment cannot be uniquely re-anchored (text edited
away, ambiguous, or v1 data with no `anchor`), it still renders in the panel
as a **detached** card. Clicking a detached card does not scroll. A comment
is **never** dropped or allowed to crash the page.

### Data model

`comments[]` entry:

```json
{
  id:      string,   // crypto.randomUUID() || Date.now()+"-"+rand
  quote:   string,   // === anchor.exact, kept for byte-identical export
  comment: string,
  ts:      string,   // ISO
  anchor:  { exact: string, prefix: string, suffix: string }
}
```

`STORAGE_KEY` bumps to `preview_comments_v2`. v1 entries (no `anchor`) load
as detached cards: not crashed, not discarded.

`buildMarkdown()` output is **byte-for-byte unchanged**: still
`## comments on: <title>`, URL, `exported: <iso>`, blank, then per comment
`### comment N` / `> quote` lines / blank / comment / blank. `quote` stays
equal to `exact` precisely so this holds.

### UI: desktop (>=1024px)

- Fixed right panel ~320px. Page content gets a right margin so the panel
  never overlaps prose.
- Panel lists cards ordered by each marker's vertical document position
  (detached cards grouped, after anchored ones).
- Card = quote snippet + comment text + `編輯` / `刪` actions.
- Click `<mark>` -> panel scrolls to + flashes the paired card. Click a card
  -> page scrolls to + flashes the marker. Paired by shared `data-cmt-id`.
- `編輯` -> inline `<textarea>` in the card; save writes back.
  `刪` -> confirm, then unwrap the `<mark>` (restore original text), remove
  entry + card.
- The existing export button and diff/clean toggle move into a sticky bar
  inside the panel so the 320px panel never hides them.

### UI: mobile (<1024px)

- No docked panel. Tap a `<mark>` -> bottom sheet with that one comment +
  edit/delete. A floating "comments (N)" button opens a full-list sheet.
- Sheet has a scrim, an explicit close control, body-scroll lock with
  scroll restore, and caps height with internal scroll. Tapping a second
  marker swaps sheet content rather than stacking sheets.
- Reuses the existing modal visual vocabulary (radius, shadow, ink/accent
  colors) already in `comment-overlay.js`.

### Coexistence

- `<mark>` markers coexist with `<del>`/`<ins>` diff markup. Per-text-node
  wrapping does not restructure the diff tree, so the diff/clean toggle
  still works on a page containing both.
- On create, the `<mark>` + panel card appear immediately (no reload). The
  old transient "comment added" toast is removed: the marker is now the
  visible confirmation. An `aria-live` status announces the addition for
  screen readers (replacing the toast's role).

### Accessibility

- `<mark>` becomes interactive: `tabindex="0"`, `role="button"`,
  `aria-label` (comment preview), Enter/Space activation.
- Marker edge strengthened on active/flash (`#fde68a` + border) so the
  signal is not color-only against the near-white page background.
- Inline edit moves focus into the textarea and returns focus to the card
  on save/cancel; Esc cancels, Cmd/Ctrl+Enter saves (matches the existing
  modal contract).
- Flash respects `prefers-reduced-motion`.

## Non-goals

- No cross-revision marker persistence (a revision is a new URL).
- No multi-user / threaded comments.
- No automated browser test harness (none exists for this skill; acceptance
  is static checks + a documented manual trace).
- No bundler/framework/npm dependency. Single-file vanilla JS stays.
