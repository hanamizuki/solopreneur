# Icon System for Slides

Replace emoji with vector icons for crisp projection rendering and consistent style. Emoji on projectors look fuzzy, render differently per OS, and break brand coherence. An inline SVG sprite solves all three.

## When to use

- The slide deck has emoji that'll be projected
- You want consistent line-weight and style across all pictograms
- You need to tint icons to match brand colors

For single decorative emoji in casual slides, keep them.

## Source library: Phosphor Icons

Phosphor is the default recommendation — free, clean, huge catalog, and available as raw SVG via CDN.

- **Browser**: [phosphoricons.com](https://phosphoricons.com) — search + copy
- **CDN pattern**: `https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular/<name>.svg`
- **Styles available**: `regular` (default, outline), `bold`, `fill`, `duotone`, `light`, `thin`
- **Note**: The CDN only serves `regular/`, `bold/`, `fill/`, `light/`, `thin/` — **duotone is NOT on the CDN**. If you need duotone, download from the Phosphor GitHub release assets instead.

For monochrome slide decks, `regular` style + `currentColor` tinting is almost always the right pick.

## Implementation pattern: inline SVG sprite

A single `<svg>` at the top of `<body>` holds every icon as a `<symbol>`. Usage sites reference them with `<use href="#icon-name">`. One payload, infinite reuse, no extra HTTP requests.

### Sprite scaffold

```html
<body>
  <!-- Icon sprite — keep at top of body, display:none so it doesn't take space -->
  <svg id="icon-sprite" xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
    <defs>
      <symbol id="icon-envelope" viewBox="0 0 256 256">
        <path d="M224,48H32A8,8,0,0,0,24,56V192..."/>
      </symbol>
      <symbol id="icon-magnifying-glass" viewBox="0 0 256 256">
        <path d="..."/>
      </symbol>
      <!-- add more -->
    </defs>
  </svg>

  <!-- usage anywhere -->
  <svg class="icon-svg"><use href="#icon-envelope"/></svg>
</body>
```

### CRITICAL: default the icon size to 1em

Browsers render `<svg>` without explicit `width`/`height` at **300×150px** by default. If you just drop `<use>` tags in, every icon blows up to hundreds of pixels.

Fix this once, globally:

```css
.icon-svg {
  display: inline-block;
  vertical-align: -0.15em;
  width: 1em;     /* sizes to parent font-size — same behavior as emoji */
  height: 1em;
  flex-shrink: 0; /* survive flex container shrinking */
}
.icon-svg use {
  color: currentColor;
  fill: currentColor;
}
```

Now icons inherit from their parent's `font-size`, exactly like emoji did. A 1.6rem parent gives a ~25px icon; a `--fs-label` parent gives a ~16px icon. No per-usage sizing needed.

For the few cases where you want a bigger glyph (hero illustration, large label):

```css
.axis-head .glyph .icon-svg { width: 2rem; height: 2rem; }
/* or just raise parent font-size */
.glyph { font-size: 2rem; }  /* .icon-svg inherits as 1em = 2rem */
```

## Pitfalls

### 1. Greedy descendant selectors catch icon SVGs

This is the #1 way things break. If the deck has a component like this:

```css
.loop-wrap svg {       /* intended for background arrow svg */
  position: absolute;
  width: 100%;
  height: 100%;
}
```

Then *every* svg inside `.loop-wrap` — including icon svgs inside nodes — gets stretched to 100% of the container. Icons balloon back to full-container size.

**Fix**: scope to direct child with `>`:

```css
.loop-wrap > svg { position: absolute; width: 100%; height: 100%; }
.honeycomb > svg { ... }
```

**How to detect**: if one slide has giant icons after applying the `.icon-svg { width: 1em }` rule, open devtools, inspect the svg's computed style, and look for `width: 100%` / `height: 100%` coming from a parent-scoped rule. Grep the stylesheet for `<container-name> svg {` (no `>`).

### 2. CSS `content:` can't render HTML or SVG

Tempting to do this:

```css
.phase-cell.has-hitl::after {
  content: "<svg><use href='#icon-stop'/></svg>";  /* ❌ renders as text */
}
```

The browser shows the literal string. `content:` accepts:
- Plain text strings
- `url(...)` to an image (including `data:image/svg+xml;...`)
- Counters, attr values

**Fixes**, pick one:
- **CSS-only marker**: use a border circle, pseudo-element with background color, or Unicode symbol that doesn't need a custom SVG
- **Inline HTML**: drop the `<svg>` directly into markup instead of `::after`
- **Data URI**: `content: url("data:image/svg+xml;utf8,<svg ...>...</svg>")` — escape `#` as `%23`, quotes carefully. Works but ugly.

Prefer inline HTML. It's testable, inspectable, and can use the sprite.

### 3. Symbol not found renders as 300×150 blank

If `<use href="#icon-xyz"/>` references an id that doesn't exist in the sprite, the svg still takes its default 300×150 size but draws nothing — creating a huge invisible blank that pushes layout around.

**Fix**: when adding new icons, double-check the id matches. A quick audit:

```bash
# In the HTML file, every href should match a defined symbol id
grep -oE 'href="#icon-[^"]+"' index.html | sort -u
grep -oE 'symbol id="icon-[^"]+"' index.html | sort -u
# Diff the two — anything only in the first list is missing from sprite
```

## Workflow: replace emoji with Phosphor icons

### Step 1 — audit what emoji are in use

```bash
# List all emoji (matches most of U+1F300–U+1FAFF plus common punctuation-style symbols)
rg '[\x{1F300}-\x{1FAFF}]|[✅⏹↻⇧✏🛑]' index.html
```

Sort the hits by context: decorative (keep), functional/repeated (replace), textual (keep — e.g. "≥2 weeks" is math, not an icon).

### Step 2 — pick Phosphor equivalents

| Emoji | Phosphor name | Symbol id |
|-------|--------------|-----------|
| 📧 | `envelope` | `icon-envelope` |
| 🔍 | `magnifying-glass` | `icon-magnifying-glass` |
| ✏️ | `pencil-simple` | `icon-pencil-simple` |
| 👤 | `user` / `person` | `icon-user` |
| 📮 | `mailbox` | `icon-mailbox` |
| 📅 | `calendar` | `icon-calendar` |
| 🎤 | `microphone` | `icon-microphone` |
| 🛑 | `stop-circle` | `icon-stop-circle` |
| 🚀 | `rocket` | `icon-rocket` |
| ↻ | `arrow-clockwise` | `icon-arrow-clockwise` |
| ⇧ | `arrow-up` | `icon-arrow-up` |
| ✅ | `check-circle` | `icon-check-circle` |
| 💡 | `lightbulb` | `icon-lightbulb` |
| 👍 | `thumbs-up` | `icon-thumbs-up` |
| 💬 | `chat-circle` | `icon-chat` |

Use `id="icon-<phosphor-name>"` for consistency. Don't rename.

### Step 3 — fetch SVG paths

```bash
for name in envelope magnifying-glass pencil-simple user mailbox; do
  curl -s "https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular/${name}.svg" \
    -o "/tmp/phosphor-${name}.svg"
done
```

Each file is a full `<svg xmlns="..." viewBox="0 0 256 256"><path .../></svg>`. Extract the inner `<path>` (or `<g>`) content — that's what goes inside the `<symbol>`.

### Step 4 — add symbols to sprite

Append to the sprite's `<defs>`:

```html
<symbol id="icon-envelope" viewBox="0 0 256 256">
  <path d="M224,48H32..."/>
</symbol>
```

Keep `viewBox="0 0 256 256"` — that's Phosphor's standard and lets `width: 1em; height: 1em` work uniformly.

### Step 5 — replace in markup

```html
<!-- before -->
<span class="icon">📧</span>

<!-- after -->
<span class="icon"><svg class="icon-svg"><use href="#icon-envelope"/></svg></span>
```

Keep the wrapping `<span>` if it already controls font-size — that's what sizes the icon via 1em.

### Step 6 — verify

Screenshot every slide. Watch for:
- Icons that look much bigger than their neighboring text → pitfall 1 (descendant selector catching)
- Blank regions where an icon should be → pitfall 3 (symbol id mismatch)
- Literal text like `<svg>` visible → pitfall 2 (CSS content:)

## Tinting icons to brand color

Since paths use `fill="currentColor"` via `.icon-svg use { fill: currentColor }`, any `color:` on the parent tints the icon:

```css
.eyebrow       { color: var(--accent-secondary); }  /* icon inside eyebrow inherits this color */
.brand-label   { color: var(--accent-primary); }
```

No filter chains needed. This is the big win over PNG or emoji.

## Why not icon fonts?

- Icon fonts ship a whole font file (heavy)
- They're prone to FOUT on first load
- Not every icon has a glyph in every font
- Harder to tint to CSS variable colors

Inline SVG sprite is strictly better for decks.

## Why not one-file-per-icon with `<img src>`?

- N HTTP requests instead of 1
- Can't tint via `currentColor` (need CSS filter hacks)
- Harder to manage in a single-file deck

Sprite wins.
