# Preview skill — margin comments + mobile comment creation

Date: 2026-05-17
Scope: `plugins/solopreneur/skills/preview/` — `assets/comment-overlay.js`,
`assets/template.html` (CSS), `SKILL.md` (the "what the user sees" section).

## Problem

Two issues with the current comment overlay:

1. **Desktop layout.** Comments render in a fixed 320px right-docked
   panel — a single scrolling list with a `Comments` header and a footer
   toolbar. The user wants margin-style annotations instead: each card
   floats in the right gutter near the text it annotates (Medium /
   Substack / Google-Docs margin notes), not collected in a separate
   panel.
2. **Mobile cannot create comments at all.** Comment creation is bound
   only to `mouseup` (`comment-overlay.js:310`). Touch text-selection
   never fires `mouseup` (it fires `selectionchange` / `touchend`, and
   the OS selection callout covers the area), so the `+ comment` button
   never appears on phones. Viewing comments works (bottom sheet);
   creating them does not.

## Confirmed decisions

- **Change scope:** visual relayout + visual detail only. No reply
  threads. Data model unchanged: `{ id, anchor, quote, comment, ts }`.
- **Card identity:** relative timestamp only (`now` / `5m ago` /
  `3h ago` / dated for older). No name, no avatar.
- **Collision strategy:** sequential top-to-bottom stacking in marker
  order; align to marker Y when free, push below the previous card +
  gap on overlap (cascading). No click-to-anchor reflow.
- **Mobile creation:** selection → a stable fixed-position `+ comment`
  button (not anchored to the selection). Precise text range preserved,
  consistent with desktop.
- **Platform split:** only desktop (≥1024px) layout changes. Mobile
  (<1024px) keeps the existing bottom-sheet *viewing* path; only its
  *creation* trigger is added.

## Design

### A. Desktop margin layer (replaces the docked panel)

- Remove the visible panel chrome: no white panel background, border,
  `Comments` title, scrolling list container, or footer bar.
- Introduce a transparent **margin layer** occupying a fixed-width right
  gutter. `main.doc` keeps a `margin-right` reserve so prose never sits
  under the cards, but there is no panel surface.
- Each card is `position: absolute`, `top` = its marker's Y in
  **document coordinates** (`rect.top + window.scrollY`). Cards scroll
  with the page naturally (absolute in document flow, not `fixed`), so
  plain scrolling needs no recompute.
- **Layout algorithm** (`layoutCards()`): order comments by marker Y
  (reuse `orderedComments()`); walk top→bottom; place each card at
  `max(markerY, previousCardBottom + GAP)`. Detached comments (no
  marker) stack after all anchored cards at the bottom of the column,
  keeping the existing `detached` label.
- **Empty-page improvement:** reserve the gutter only when ≥1 comment
  exists. Today desktop shifts prose left even with zero comments; a
  first-draft preview should render full-width until the first comment.

### B. Card content

Per card, top to bottom: quote snippet (kept — useful context in the
margin) → relative timestamp derived from `ts` → comment body →
Edit / Delete actions. No name, no avatar.

`relativeTime(ts)`: `< 60s` → `now`; `< 60m` → `Nm ago`; `< 24h` →
`Nh ago`; `< 7d` → `Nd ago`; else locale short date. Pure function of
`ts`; recomputed on each render (no live ticking).

### C. Controls relocation

The Export button and the Clean / Show-edits toggle currently live in
the panel footer. With no panel, route them to the existing
`.cmt-float-cluster` (bottom-right) on **desktop too** (it is
mobile-only today). Edit / Delete remain per-card.

### D. Interactions (unchanged behavior)

- Click a marker → scroll the page so the marker is visible, flash its
  card.
- Click a card → scroll to its marker, flash it.
- Hover affordance on cards retained.

### E. Recompute hooks

`layoutCards()` runs everywhere `renderPanel()` is called today
(add / edit / delete, `alpine:initialized`, the 600ms safety net), plus:

- `window` `resize` (already partially wired for the breakpoint).
- `window` `load` (late web-font / image reflow shifts marker Y).
- A debounced `ResizeObserver` on `document.body` for post-load reflow.

Pure page scroll does **not** trigger recompute (document-coordinate
absolute positioning moves cards with content).

### F. Mobile comment creation (additive)

- Add a debounced `selectionchange` listener (mobile only). On a
  non-empty selection inside the doc, capture `pendingText` /
  `pendingRange` exactly as the desktop `mouseup` path does.
- Show the `+ comment` button at a **stable fixed position** (bottom
  center, above the float cluster) rather than next to the selection —
  avoids fighting the OS selection callout and selection handles.
- The button uses `pointerdown` / `mousedown` + `preventDefault()` so
  tapping it does not collapse the selection (iOS Safari clears the
  selection on tap outside it; capturing the range on `selectionchange`
  beforehand plus preventDefault on press keeps it usable).
- On activate → open the existing `openModal()` with the captured range.
  Creation, anchoring, storage, and the bottom-sheet viewing path are
  otherwise unchanged.

### G. SKILL.md update

Rewrite the "The comment overlay (what the user sees)" section: replace
the "Desktop (≥1024px): docked panel" description with the margin-note
behavior (cards in the right gutter near their text, sequential
stacking, relative timestamp, no name/avatar, controls in a floating
bottom-right cluster). Note that mobile now supports creating comments
via selection + a fixed `+ comment` button, and keeps the bottom sheet
for viewing.

## Out of scope / unchanged

- Reply threads, author identity, avatars.
- Comment data model, `localStorage` keys, anchor/re-anchor logic.
- Exported markdown format.
- Diff / clean toggle semantics.
- Mobile bottom-sheet *viewing* UI.

## Risk

Concentrated in the desktop `layoutCards()` positioning and the mobile
`selectionchange` + selection-preservation behavior across iOS Safari /
Android Chrome. Everything else is presentation-only.

## Estimated change size

~150–200 lines net across `comment-overlay.js`, `template.html` CSS, and
`SKILL.md`. Skill/docs change — no plugin version bump (repo release
policy).
