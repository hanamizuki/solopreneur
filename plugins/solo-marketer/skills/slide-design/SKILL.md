---
name: slide-design
description: "Create brand-aware presentations using frontend-slides or reveal.js. Use when the user wants to make a presentation, slides, deck, or slideshow. Triggers: 做簡報、建 slides、presentation、投影片、做投影片、slide design、簡報設計。Always use this skill instead of frontend-slides or revealjs directly — it adds a brand setup step that saves time on color/asset iteration."
---

# Slide Design

Create presentations with brand colors, typography, and assets baked in from the start, instead of picking a generic style and then replacing everything later.

This skill wraps two engines. It adds a brand setup phase before handing off to the engine's own workflow.

## Phase 0: Brand Setup

Before touching any engine, gather brand context. Ask these in a single AskUserQuestion call:

**Question 1 — Brand Colors** (header: "Brand"):
How do you want to set定品牌色？
- "I have a design system file" — give me the path, I'll extract colors
- "I'll give you hex codes" — primary + secondary + background
- "No brand, use a preset" — fall through to the engine's default style picker

**Question 2 — Assets** (header: "Assets"):
Do you have character images or background art?
- "Yes" — give me the folder path, I'll scan for usable images
- "No" — skip, use CSS-only visuals

**Question 3 — Engine** (header: "Engine"):
Which engine do you want to use?
- "frontend-slides (Recommended)" — single HTML file, zero dependencies, animation-rich, scroll-based
- "reveal.js" — arrow-key navigation, fragment animations, speaker notes, vertical slide stacks, Chart.js

### Processing Brand Input

**If design system file is provided:**
1. Read the file
2. Extract color tokens — look for hex codes, RGB values, or CSS custom properties
3. Map to presentation variables:
   - Darkest background color → `--bg-primary` / `--background-color`
   - Primary accent (often the brand's signature color) → `--accent` / `--primary-color`
   - Secondary accent → `--accent-secondary` / `--secondary-color`
   - Text colors (light for dark themes, dark for light themes)
4. Confirm with the user: "I found these brand colors: [show swatches]. Look right?"

**If the design system describes colors in prose only (no hex codes):**
- Ask the user to provide hex values directly
- OR sample from provided reference images (read images, pick from dominant tones)

**If assets folder is provided:**
1. Scan for image files (png, jpg, svg, webp)
2. View each image using the Read tool (Claude is multimodal)
3. Categorize: logo, character, background art, screenshot, other
4. Suggest placement: "I found [N] usable images. Here's how I'd use them: [list]"
5. Confirm with the user

**SVG logo tinting trick**

If you have a black / single-color SVG logo and want to match the brand primary color, use a CSS filter chain (no SVG editing needed):

```css
.brand-mark {
  filter: brightness(0) saturate(100%) invert(77%) sepia(15%) saturate(1250%) hue-rotate(357deg) brightness(92%) contrast(87%);
  /* This chain tints black to ~#CD9D4F (warm gold). */
}
```

Use [codepen.io/sosuke/pen/Pjoqqp](https://codepen.io/sosuke/pen/Pjoqqp) or `hex-to-css-filter` to generate a chain for any target color.

## Phase 0.5: Typography Scale

Apply a projection-optimized typography scale before writing any slide-specific CSS. See [references/typography-scale.md](references/typography-scale.md).

Key rules:
- **Any text the audience must read ≥ 17px.** Use `--fs-body-md` as the floor for readable content.
- **`--fs-micro` is for decoration only** (slide numbers, step counters). Never for content.
- **Define all 8 tokens in `:root`** so slides can reference them consistently.

After brand colors + typography tokens are in place, move to Phase 1.

## Phase 1: Hand Off to Engine

After brand + typography setup, invoke the appropriate skill:

- **frontend-slides**: Use the `frontend-slides` skill, but skip its Phase 2 (style discovery) — you already have the brand colors. Jump straight to Phase 3 (generation) with the brand palette pre-applied. For atmosphere (corner glows, scene illustrations, character cameos), apply the layered backdrop system — see [references/backdrop-system.md](references/backdrop-system.md).
- **reveal.js**: Use the `revealjs` skill. Generate the scaffold, then customize `styles.css` with the brand colors before filling in content. Use Google Fonts or Fontshare instead of system fonts.

In both cases, pass through all brand colors, typography tokens, and asset paths so the engine uses them from the start.

## Phase 1.5: Icon System (Replace Emoji)

If the deck uses emoji as functional pictograms (pipeline icons, status markers, stage glyphs), replace them with vector icons from an inline SVG sprite. Emoji render fuzzy on projectors and differ per OS. See [references/icon-system.md](references/icon-system.md).

Three things matter:
- **Default `.icon-svg { width: 1em; height: 1em }`** — browsers render `<svg>` without size at 300×150px; this one rule prevents every icon from exploding
- **Phosphor Icons via CDN** — `cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/assets/regular/<name>.svg`
- **Sprite pattern** — one `<symbol>` per icon inside a top-of-body hidden `<svg>`, referenced via `<use href="#icon-name">`

Skip this phase if emoji only appear in casual speaker notes or decoration that won't project.

## Phase 2: Live Presentation Features (Optional)

If the deck is for a **live speaker** (not self-browsing), add a step-controlled reveal system so the speaker paces content with space / arrow keys. See [references/reveal-system.md](references/reveal-system.md).

Covers:
- Keyboard-driven advance/reverse
- Per-slide `.reveal` elements revealed one at a time
- `data-toggle` markers for complex multi-element states (honeycomb builds, etc.)
- Global sync functions for SVG decorations tied to legend visibility
- Step counter UI + progress bar
- Headless screenshot pitfalls

Skip this phase if the deck is:
- Embedded in a webpage for self-browsing
- Being exported to PDF
- Simple bullet slides without multi-beat per slide

## Phase 3: Content Review (Chinese / CJK)

After writing all slide text, run:

```
/humanly review slide content in [path]
```

See [references/chinese-guidelines.md](references/chinese-guidelines.md) for slide-specific Chinese AI-slop patterns that `/humanly` will flag, plus prewrite guidance to avoid them. Key pitfalls:

- `——` em-dash overuse (especially `X —— Y` reveal structure)
- `不是 X，是 Y` negation parallelism repeated across slides
- 金句 / 對仗 taglines on closing lines
- Rule of three inflation
- 其實 / 才是 softener words

Apply all P1 findings from humanly. P2 is judgment call.

## CSS Components Library

These are reusable components built for presentations. They're optional — use them when the content calls for it. See [references/components.md](references/components.md) for the full CSS and HTML.

### Basic components

| Component | When to use |
|-----------|-------------|
| **Skill Card** | Showing a named capability with description + tools used |
| **Flow Steps** | Sequential process (01 → 02 → 03) with descriptions |
| **Swimlane** | Two-party collaboration (left vs right, shared stages in center) |
| **Background Art** | Overlaying an image in the corner with gradient fade to background |
| **HITL Bar** | Human-in-the-loop divider between automated steps |
| **Lifecycle Nodes** | Horizontal chain of stages with arrows (circles + labels) |

### Advanced layouts

| Component | When to use |
|-----------|-------------|
| **Full-Bleed Diagonal Split** | Before/after or conceptual contrast with two edge-to-edge images |
| **3-2 Honeycomb** | 5-stage cycle with per-stage metadata (includes offset math to prevent overlap) |
| **24-Hour Circular Clock** | Temporal data like cron schedules, daily routines, time-distributed events |
| **Modes × Phases Grid** | Process with parallel variants sharing the same phase names |
| **Closed-Loop Diagram** | Cyclical process where the visual should loop back |
| **QR Panel (Persistent Sidebar)** | Downloadable resources promoted across multiple slides |
| **Skill Card with Command Pill** | `/slash-command` style tools with terminal-purple monospace badges |
| **Equal-Width Pipeline** | Horizontal pipeline where N steps stay visually equal-width even with uneven label lengths (grid `1fr auto 1fr auto...`) |

When generating a presentation, scan the content outline and suggest which components would work well. Don't force components where simple bullet points or text would be clearer.

## Utility: PDF Export

When the user wants to export the deck to PDF (handout, archive, chat attachment), use the headless Chrome recipe in [references/pdf-export.md](references/pdf-export.md). Needs a one-time `@media print` block in the deck's CSS — it forces 1920×1080 landscape pages and works around Chrome's print-pipeline bug that renders the `.bg-art` layered mask as black rectangles.

## Utility: QR Code Generation

For decks with "scan to download" CTAs:

```bash
brew install qrencode
qrencode -o assets/qr.png -s 20 -m 2 "https://example.com"
```

- `-s 20` — 20px per dot (large enough for 3m scan distance)
- `-m 2` — 2-dot margin (prevents scanner edge issues)
- QR background must be white (`#F2F2F2` or `#FFFFFF`) for scanner contrast — don't make transparent.

## Reference Files

| File | Purpose |
|------|---------|
| [references/typography-scale.md](references/typography-scale.md) | 8-token projection-optimized scale + application rules |
| [references/icon-system.md](references/icon-system.md) | Phosphor sprite pattern + `1em` default size + descendant-selector pitfalls |
| [references/backdrop-system.md](references/backdrop-system.md) | Layered slide atmosphere — body grid + corner glow modifiers + `.bg-art` scene layer + `.character` cameos |
| [references/reveal-system.md](references/reveal-system.md) | Step-controlled reveal + `data-toggle` + SVG sync patterns |
| [references/chinese-guidelines.md](references/chinese-guidelines.md) | Chinese AI-slop avoidance + `/humanly` integration |
| [references/components.md](references/components.md) | CSS / HTML for 13 reusable layout components |
| [references/pdf-export.md](references/pdf-export.md) | Headless Chrome recipe + `@media print` block for landscape 16:9 PDF export (with `.bg-art` mask workaround) |
