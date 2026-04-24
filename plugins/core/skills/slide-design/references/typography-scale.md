# Typography Scale for Projected Presentations

Projected slides need larger type than web UI. This scale is optimized for a 20-ft screen viewed from up to 30 ft away.

## The 8-token scale

Add to `:root`:

```css
:root {
  /* Typography — projection-optimized */
  --fs-display:  clamp(3.5rem, 6vw, 6rem);        /* 56–96px · hero words (CTO/COO, title 1) */
  --fs-h1:       clamp(2.5rem, 4vw, 3.5rem);      /* 40–56px · slide titles */
  --fs-h2:       clamp(1.75rem, 2.5vw, 2.4rem);   /* 28–38px · sub titles, pull quotes */
  --fs-body-xl:  clamp(1.4rem, 1.8vw, 1.7rem);    /* 22–27px · emphasized body */
  --fs-body-lg:  clamp(1.2rem, 1.5vw, 1.45rem);   /* 19–23px · main body (FLOOR for prose) */
  --fs-body-md:  clamp(1.05rem, 1.3vw, 1.2rem);   /* 17–19px · secondary body (FLOOR for readable) */
  --fs-label:    clamp(0.95rem, 1.05vw, 1.1rem);  /* 15–18px · eyebrows, mono tags, metadata */
  --fs-micro:    clamp(0.75rem, 0.85vw, 0.9rem);  /* 12–14px · decoration only (page nums, progress) */
}
```

## Core rules

1. **Any text the audience must read ≥ `--fs-body-md` (17px).** No exceptions for "it's just a label".
2. **Prose defaults to `--fs-body-lg`.** Step down to `--fs-body-md` only for supporting detail.
3. **`--fs-micro` is for decoration only.** Slide numbers, step counters, progress bars. Never for content.
4. **Hero moments use `--fs-display`.** Reserve for 1–3 moments per deck — overuse kills the impact.

## Common mapping

| Element | Token |
|---------|-------|
| Title slide big heading | `--fs-display` |
| Standard slide title (`<h2>`) | `--fs-h1` |
| Section divider heading | `--fs-h2` |
| Pull quote main text | `--fs-h2` |
| Table cell body | `--fs-body-xl` or `--fs-body-lg` |
| Table header | `--fs-h2` |
| Subtitle / sub | `--fs-body-xl` |
| Card body description | `--fs-body-md` |
| Eyebrow (PART 1 · ...) | `--fs-label` with `letter-spacing: 0.2em; text-transform: uppercase;` |
| Monospace slash command pill | `--fs-body-xl` or `--fs-label` |
| Slide number top-right | `--fs-micro` |
| Step counter | `--fs-micro` |

## Applying the scale

After defining tokens, replace ad-hoc `font-size: clamp(...)` with token vars:

```css
/* Before */
.slide-title h2 { font-size: clamp(1.8rem, 3.5vw, 3rem); }

/* After */
.slide-title h2 { font-size: var(--fs-h1); }
```

Do a grep for `font-size:` after first pass and normalize every hit that's not using a var.

## Audit checklist

Before shipping, verify on a laptop at arm's length (Chinese text, 13" screen, ~500 mm distance):

- [ ] All body prose > 18px visually (`--fs-body-lg` or larger)
- [ ] Every eyebrow/label > 15px (`--fs-label` or larger)
- [ ] Hero moments clearly dominate (display ≥ 2× the body size)
- [ ] Slide numbers dimmed (opacity or `--fs-micro`) so they don't compete

If the laptop preview feels too small at arm's length, **it will be unreadable in the last row of the room**.

## Language notes

**Chinese (CJK)** renders slightly larger than Latin at the same font size due to glyph density. The tokens work for both, but if a slide mixes CJK + English heavily, err toward the upper bound.

**Do not** use different tokens per language — consistency across locales is more important than per-character optimization.

## Why not a smaller scale?

Standard web UI tokens peak around 16–24px for body. That works because browsers are 1–2 ft from the face. Projected slides are 10–30 ft away. Scale up 1.5–2× baseline.
