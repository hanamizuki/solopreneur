# Slide Backdrop System

A three-layer approach to giving slides atmosphere without overwhelming content. All three layers share the same stacking-context setup — compose them, skip layers per slide as needed.

> Example hex values in this reference (warm gold `#CD9D4F`, soft sky blue `#93B7DE`) come from the deck this system was developed in. Substitute your brand's primary / secondary accent tokens when reusing.

| Layer | Technique | Typical use |
|-------|-----------|-------------|
| 1 | Subtle grid texture on `body` | Every slide (always on) |
| 2 | Per-slide corner glow modifier (axis-colored) | Every slide, tinted by narrative axis |
| 3a | `.bg-art` scene illustration | 3–5 narrative pages only |
| 3b | `.character` cameo PNG | 3–6 emotional/pose pages |

## Prerequisite: stacking context

Both Layer 3a and 3b need negative `z-index` to sit behind in-flow content. Without `isolation: isolate`, negative z-indexes escape the slide and paint below the body background — elements disappear. Add this to the base `.slide` rule:

```css
.slide {
  position: relative;
  isolation: isolate;   /* scopes negative z-index children inside this slide */
  overflow: hidden;     /* clips decoration that extends past slide edges */
}
```

## Layer 1: Grid texture

60×60 grid, `rgba(<brand>, 0.025)` — barely visible, gives the black background some "material."

```css
body {
  background-color: var(--bg-primary);
  background-image:
    linear-gradient(rgba(205, 157, 79, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(205, 157, 79, 0.025) 1px, transparent 1px);
  background-size: 60px 60px;
}
```

**Paint the grid on `body`, not on `.slide`.** That way:
- The grid renders once; slides stay transparent over it
- Layer 2's radial gradients can compose over the grid without covering it
- No stacking-context fight

**Do NOT use `body::before` with `position: fixed`.** That pseudo paints at a sibling-level z-index to `.slide`, and non-positioned slide children end up underneath the grid. Painting the grid as part of `body`'s `background` property avoids the entire issue.

## Layer 2: Corner glow modifiers

Three modifier classes — apply one to each `<section class="slide">` based on its narrative axis. Colors shown here use the workspace's current tokens; substitute your brand's primary/secondary.

```css
.slide.glow-gold {
  background-image:
    radial-gradient(ellipse 70vw 70vh at 0% 0%,
      rgba(205, 157, 79, 0.22) 0%, transparent 55%);
}
.slide.glow-blue {
  background-image:
    radial-gradient(ellipse 70vw 70vh at 100% 100%,
      rgba(147, 183, 222, 0.18) 0%, transparent 55%);
}
.slide.glow-dual {
  background-image:
    radial-gradient(ellipse 70vw 70vh at 0% 0%,
      rgba(205, 157, 79, 0.22) 0%, transparent 55%),
    radial-gradient(ellipse 70vw 70vh at 100% 100%,
      rgba(147, 183, 222, 0.18) 0%, transparent 55%);
}
```

**Key decision: multi-background, NOT pseudo-elements.**

The natural-looking approach is `.slide::before` / `.slide::after` with `position: absolute` + `filter: blur(60px)` (an earlier prototype used child divs for this). It produces a more cinematic "blurred orb" look — but with pseudo-elements there is a stacking fight:

- Pseudos with `z-index: 0` paint ABOVE non-positioned in-flow children (stacking level 6 vs level 3 in the CSS spec). Glow covers content.
- Pseudos with `z-index: -1` inside a non-isolated `.slide` paint below body — invisible.
- Fixing both means wrapping every slide's content in a positioned `.slide-content` with `z-index: 1+`. That's a big structural change if content is currently direct children.

Multi-background radial-gradient sidesteps all of it: the gradients are part of the slide's own `background-image`, so in-flow children paint above naturally. Trade-off is slightly less cinematic falloff — tune with longer `transparent N%` stops (55–70%) to compensate.

**Axis mapping convention.** Assign modifier based on slide narrative:
- `.glow-gold` — community/COO/social axis pages
- `.glow-blue` — engineering/CTO axis pages
- `.glow-dual` — dual-axis pages (title, comparison, closing)

Typo/content-dense pages still need a modifier so backgrounds feel consistent across the deck; default to the axis that matches the page's topic.

## Layer 3a: Scene illustration (`.bg-art`)

Full-bleed decorative illustration emerging from one corner, faded on two axes so edges never feel hard.

```css
.bg-art {
  position: absolute;
  top: 0;
  right: 0;
  width: 60%;
  height: 100%;
  z-index: -2;
  pointer-events: none;
  background-image: url('assets/illustration.png');
  background-size: cover;
  background-position: center;
  opacity: 0.7;
  mask-image:
    linear-gradient(to left, rgba(0, 0, 0, 0.6) 0%, transparent 80%),
    linear-gradient(to top, transparent 0%, rgba(0, 0, 0, 0.4) 30%, rgba(0, 0, 0, 0.6) 100%);
  mask-composite: intersect;
  -webkit-mask-image:
    linear-gradient(to left, rgba(0, 0, 0, 0.6) 0%, transparent 80%),
    linear-gradient(to top, transparent 0%, rgba(0, 0, 0, 0.4) 30%, rgba(0, 0, 0, 0.6) 100%);
  -webkit-mask-composite: source-in;
}
```

```html
<section class="slide glow-dual">
  <span class="slide-number">01 / 17</span>
  <div class="bg-art"></div>
  <!-- rest of slide content as direct children -->
</section>
```

**The double mask + `intersect` is the key.** A single horizontal mask gives a hard top-to-bottom band. The intersect:

- Horizontal mask: right side 0.6 opacity, fading to transparent at 80% leftward → only right half visible
- Vertical mask: top transparent, 0.4 at 30%, 0.6 at bottom → only middle-to-bottom visible
- Intersect → only the **right-bottom quadrant** shows, with soft blurred edges on both interior sides

Result: an illustration that looks like it's bleeding in from the corner, no sharp crop line anywhere.

**Webkit prefix is still required** in Safari / iOS as of 2026. Keep both the standard and `-webkit-` versions.

**Print-to-PDF caveat.** Chrome's print pipeline mis-composites these two mask layers and paints the `.bg-art` bounding box as a solid black rectangle in the exported PDF. If the deck will ever be exported, add the `@media print` override from [pdf-export.md](pdf-export.md) — it disables the mask in print and recreates the falloff with a gradient overlay that survives the print renderer.

**When to use:** scene-setting pages only — title, opening vision, closing. 3–5 total across a 15–20 slide deck. More and it loses the "special moment" feel.

## Layer 3b: Character cameos (`.character`)

Transparent-background PNG of a character/mascot positioned at a slide corner. Use `.character` as the base class; brand-specific variants (e.g. `.mojo-char` with a branded drop-shadow color) can extend it.

```css
.character {
  position: absolute;
  z-index: -1;
  pointer-events: none;
  max-height: min(45vh, 350px);
  object-fit: contain;
  filter: drop-shadow(0 0 30px rgba(205, 157, 79, 0.15));  /* brand-color glow */
}
.character.right  { right: 4vw;  bottom: 6vh; }
.character.left   { left: 4vw;   bottom: 6vh; }
.character.center { left: 50%; transform: translateX(-50%); bottom: 3vh; }
.character.small  { max-height: min(30vh, 220px); }
.character.tiny   { max-height: min(20vh, 150px); }
```

```html
<img src="assets/pose-name.png" class="character right small reveal" alt="character">
```

**Pose strategy.** Assign poses based on the slide's emotion, reuse poses as identity anchors:
- Narrative beat (intro, transition) → neutral/guiding pose
- Celebration (main reveal, closing) → triumphant pose
- Process/system role (e.g. "this character is the COO") → repeat the same pose across 2–3 slides where that identity is referenced → audience reads it as consistent casting
- Teaching/tip pages → pointing/explaining pose

**Size variants.** Default is big (45vh) — use sparingly, usually only closing slide. `.small` (30vh) for normal decoration. `.tiny` (20vh) when the slide already has significant content.

**z-index: -1 intentionally.** Characters paint BEHIND in-flow content so if the character's bounding box overlaps a text block, text always wins. Combined with corner positioning, this prevents visual collisions without needing per-slide position tuning.

**Drop-shadow separation.** `filter: drop-shadow` with a brand-tinted glow gives the character a soft halo — separates it from the backdrop grid/glows without adding a hard outline.

**QR collision note.** If a closing slide has a centered QR code AND a character set to `.center`, they'll stack. Either move character to `.right` / `.left`, or accept that character will appear behind QR (z-index -1 means QR always reads cleanly).

## Decision matrix: which layers per slide

| Slide type | Layer 1 grid | Layer 2 glow | Layer 3a bg-art | Layer 3b character |
|-----------|:------------:|:------------:|:---------------:|:------------------:|
| Title / opening | ✓ | dual | optional | optional |
| Hook / emotional beat | ✓ | axis | optional | optional |
| Vision / "big idea" reveal | ✓ | dual | ✓ | ✓ |
| Axis comparison (CTO vs COO style) | ✓ | dual | — | optional |
| Single-axis content (any page tied to one narrative axis) | ✓ | axis | — | — |
| Info-dense (honeycomb, clock, pipeline, grid, loop) | ✓ | axis | **never** | **never** |
| Tips / advisory pages | ✓ | axis | — | optional tiny |
| Closing / thanks | ✓ | dual | ✓ | ✓ |

**Rule of thumb:** if a slide already has a central illustration / diagram that fills >50% of the slide, skip 3a AND 3b entirely. Layers 1 + 2 are always safe because they compose at the background layer.

## Historical notes

- **Why `mask-composite: intersect` over `add`** — `add` unions the two masks (either mask alone is enough to show pixels), which gives a larger visible area but with a soft diagonal gradient that looks like a smear. `intersect` requires BOTH masks to be opaque, producing the clean "corner wedge" look.
- **Why the `body` grid fix was necessary** — an earlier attempt used `body::before { position: fixed; z-index: 0 }` for the grid. Slides with `position: relative` (no z-index) form no stacking context, so their children painted in the default stacking order. The positioned `body::before` with z-index 0 landed at stacking level 6, ABOVE the slides' in-flow children (level 3). Content rendered under a veil of grid lines. Painting the grid as a `background-image` on `body` removed the positioned layer entirely and fixed it.
- **Why gradients instead of blurred orbs** — tried `.slide::before` / `.slide::after` with `filter: blur(60px)` first. Two dead ends: (a) z-index 0 pseudos paint above non-positioned in-flow children (content gets covered); (b) z-index -1 pseudos leak out of non-isolated slides. Migrating to `isolation: isolate` + `z-index: -1` on pseudos works but requires every slide's content to NOT share the same stacking level. Multi-background radial-gradient has none of these problems because it's part of the background-image layer, not a separate positioned element.
