# Preview overlay compatibility — for slide decks

When a deck built with `/slide-design` is deployed via `/preview` for
in-page comment review, the deck must do four things so the overlay JS
and CSS work end-to-end.

The cleanest path: **start from `/preview`'s `template.html`** (which
already ships the overlay CSS — `.cmt-margin-layer`, `.cmt-card`,
`mark.cmt-mark`, `.cmt-float-cluster`, `.cmt-sheet`, etc.), set
`<body class="cmt-full-bleed">`, and add the four deck-specific
overrides below. This is what `/preview` SKILL.md step 2 recommends.

The full overlay CSS lives between the `OVERLAY-CSS:BEGIN` and
`OVERLAY-CSS:END` marker comments in
`plugins/solopreneur/skills/preview/assets/template.html`. Keep this
reference in sync if those rules ever change materially.

---

## The four required pieces

### 1. `<main class="doc">` wrapper

`comment-overlay.js` gates selection capture with:

```js
const doc = document.querySelector("main.doc");
```

(see `comment-overlay.js` → `selectionInDoc()`)

Slides as direct children of `<body>` never match → the "+ comment"
button never appears, and no text is selectable for annotation.

```html
<body class="cmt-full-bleed">
  <main class="doc">
    <section class="slide">...</section>
    <section class="slide">...</section>
    <!-- etc. -->
  </main>
  <script src="./comment-overlay.js"></script>
</body>
```

### 2. `<body class="cmt-full-bleed">` opt-in

The default `/preview` layout assumes a 768px centered prose column.
When comments exist, the gutter is reserved by adding `margin-right:
332px` to `main.doc`. That works for narrow prose but breaks viewport-
wide slides — `100vw` slides keep filling the viewport and overflow
under the reserved gutter.

`template.html` has an opt-in mode for this case:

```css
body.cmt-full-bleed main.doc { max-width: none; padding: 0; }
body.cmt-has-margin.cmt-full-bleed main.doc {
  margin-right: 0;
  margin-left: 0;
  width: calc(100% - 332px);
}
```

Setting `<body class="cmt-full-bleed">` switches the gutter reserve
from `margin-right` to `width: calc(...)`, so the doc actually shrinks
and slides inside follow that shrinkage — provided you use rule (4)
below.

### 3. `scroll-snap-type: y proximity` (not `mandatory`)

Mandatory snap traps the reader at slide boundaries and prevents
scrolling past the last slide. The comment overlay places margin cards
at document Y of their corresponding marker; cards anchored near or
past the natural end of the last slide become unreachable.

```css
html {
  scroll-snap-type: y proximity;
  scroll-behavior: smooth;
}
.slide {
  scroll-snap-align: start;
}
```

`proximity` gives the snap feel without the trap.

### 4. `.slide { width: 100% }` (not `100vw`)

In full-bleed mode `main.doc` reserves the gutter via `width:
calc(100% - 332px)` (rule 2). Slides that use `width: 100vw` ignore
that reserve and overflow under the gutter. Slides that use `width:
100%` correctly inherit the shrunk doc width.

```css
.slide {
  width: 100%;       /* not 100vw */
  min-height: 100vh; /* viewport height is fine, just not width */
  /* ... */
}
```

If you also need a hero / full-bleed background INSIDE a slide, use a
nested `position: absolute; inset: 0` layer rather than another `100vw`
sibling.

---

## Quick sanity checklist before deploying

- [ ] `<main class="doc">` wraps every slide
- [ ] `<body class="cmt-full-bleed">` is set
- [ ] `html { scroll-snap-type: y proximity }` (not mandatory)
- [ ] `.slide { width: 100% }` (no `100vw` widths anywhere)
- [ ] `./comment-overlay.js` copied into the deploy dir alongside `index.html`
- [ ] At a real `/preview` URL: select text → "+ comment" button appears, comment renders in right gutter, scrolling past last slide reveals low-anchored cards, export modal copies cleanly

---

## When the deck is built from scratch (no template.html base)

If the deck bypasses `template.html` entirely (e.g. ships its own
`<style>` block), it also needs to inline the overlay CSS so cards,
markers, the float cluster, and the mobile sheet render correctly.

Source of truth: copy the block between the `OVERLAY-CSS:BEGIN` and
`OVERLAY-CSS:END` marker comments in
`plugins/solopreneur/skills/preview/assets/template.html` verbatim into
the deck's `<style>`, then layer the four deck-specific rules above on
top.

The overlay CSS block covers:

- `mark.cmt-mark` (yellow highlight + hover + flash animation)
- `.cmt-margin-layer` + `body.cmt-has-margin` rules (right-gutter positioning + reserve)
- `body.cmt-full-bleed` opt-in for full-bleed decks
- `.cmt-card` shared visuals + desktop-margin geometry + mobile-sheet reset
- `.cmt-float-cluster` (bottom-right buttons)
- `.cmt-sheet-scrim` + `.cmt-sheet` (mobile sheet)
- `@media (max-width: 1023px)` teardown

Future improvement (TODO): extract this block into a standalone
`assets/overlay.css` in the `/preview` skill so consumers don't have to
copy from `template.html`. Not done yet because `template.html` is
where the placeholder substitution happens and the CSS is tightly
coupled to the template's inlined `:root` variables.
