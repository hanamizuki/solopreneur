# PDF Export

How to export a frontend-slides HTML deck to a landscape 16:9 PDF without breaking the backdrop system.

## The one-shot recipe

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=10000 \
  --window-size=1920,1080 \
  --print-to-pdf=out.pdf \
  "file:///absolute/path/to/index.html?show"
```

- `?show` reveals every `.reveal` element on every slide (without it, only the first beat of each slide renders).
- `--virtual-time-budget=10000` gives web fonts and images 10s to load before the snapshot.
- `--window-size=1920,1080` sets the viewport the page is laid out in. Combine with the `@page` rule below so PDF pages match.

## Required print CSS

Add this to the deck's `<style>` block. It forces one slide per page, landscape, and works around Chrome's print-pipeline bugs.

```css
/* Print to PDF: 16:9 landscape pages, one slide per page */
@page { size: 1920px 1080px; margin: 0; }
@media print {
  html, body { scroll-snap-type: none; }
  .slide {
    width: 1920px;
    height: 1080px;
    min-height: 1080px;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
  }
  .slide:last-child { page-break-after: auto; break-after: auto; }

  /* Chrome print-to-pdf mis-renders CSS mask-image with multi-layer
     mask-composite — it paints the bg-art bounding box as a solid black
     rectangle. Drop the mask and fake the horizontal + vertical falloff
     with a solid gradient overlay painted as ::after. */
  .bg-art {
    mask-image: none !important;
    -webkit-mask-image: none !important;
    opacity: 0.6;
  }
  .bg-art::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to right, var(--bg-primary) 0%, rgba(13, 13, 13, 0.4) 40%, transparent 80%),
      linear-gradient(to top, transparent 0%, rgba(13, 13, 13, 0.3) 70%, rgba(13, 13, 13, 0.5) 100%);
    pointer-events: none;
  }
}
```

The `@media print` block is invisible on screen — the deck still looks normal in a browser.

## Why the mask override exists

`.bg-art` (see [backdrop-system.md](backdrop-system.md)) uses two `linear-gradient` mask layers composited with `mask-composite: intersect` to produce the corner-wedge falloff. Chrome's print-to-pdf renderer handles single-layer masks fine but mis-composites multi-layer intersect masks — the result in the PDF is a hard-edged rectangular black block where the soft image should be.

The workaround:
1. Disable the mask entirely in print.
2. Let the full rectangular `.bg-art` image show at `opacity: 0.6` (dims it so the right side doesn't feel harsh).
3. Paint a solid gradient overlay via `::after` to recreate the left-edge fade into `--bg-primary` and the vertical top-to-bottom darkening.

The overlay uses actual background-color fills (no mask), so it survives the print pipeline.

## Troubleshooting

**PDF is portrait, not landscape.** Chrome ignores `--window-size` orientation for print — the `@page { size: 1920px 1080px }` rule is what sets landscape. Verify the print CSS block is present and not inside an un-loaded stylesheet.

**PDF only shows one beat per slide.** Missing `?show` in the URL. Without it, the deck's step-controlled reveal only paints the first beat of each slide.

**Page count doesn't match slide count** (e.g. 20 pages for 18 slides). A slide's content is overflowing one page. Check for elements taller than 1080px — usually long lists or oversized images. Add `overflow: hidden` to the offending slide variant in the print block, or reduce content.

**Sampling the PDF without opening Preview.** Pull any page to PNG for verification:
```bash
pdftoppm -png -r 72 -f 5 -l 5 out.pdf /tmp/page   # page 5 only
```
`sips` on macOS only extracts page 1; use `pdftoppm` (poppler, `brew install poppler`) for arbitrary pages.

## When to use this

- Speaker wants a PDF handout/archive after a talk.
- Deck needs to be embedded in a doc site or sent over chat.
- Projector setup is unreliable and the PDF is a fallback.

Skip if the deck will only ever be presented live from a browser — the overhead of testing the PDF output isn't worth it.
