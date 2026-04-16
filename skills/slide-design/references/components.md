# Presentation CSS Components

Reusable CSS patterns extracted from real presentations. Copy and adapt as needed.

All components use CSS custom properties so they automatically match the brand palette. The variable names below follow the frontend-slides convention; adjust for reveal.js as needed.

## Table of Contents

1. [Skill Card](#skill-card)
2. [Flow Steps](#flow-steps)
3. [Swimlane](#swimlane)
4. [Background Art](#background-art)
5. [HITL Bar](#hitl-bar)
6. [Lifecycle Nodes](#lifecycle-nodes)
7. [Full-Bleed Diagonal Split](#full-bleed-diagonal-split)
8. [3-2 Honeycomb](#3-2-honeycomb)
9. [24-Hour Circular Clock](#24-hour-circular-clock)
10. [Modes × Phases Grid](#modes--phases-grid)
11. [Closed-Loop Diagram](#closed-loop-diagram)
12. [QR Panel (Persistent Sidebar)](#qr-panel-persistent-sidebar)
13. [Skill Card with Command Pill](#skill-card-with-command-pill)

---

## Skill Card

A game-card style element for showing a named capability. Has a title, description, and tools list.

**When to use:** Showing tools, skills, or capabilities with their supporting details.

**Two sizes:**
- Standard: side-by-side in a flex row (2-4 per row)
- Wide: full-width with a step number on the left (for sequential flows)

### CSS

```css
/* Standard skill card */
.skill-cards { display: flex; flex-wrap: wrap; gap: clamp(0.6rem, 1.2vw, 1rem); justify-content: center; }

.skill-card {
  width: clamp(140px, 22vw, 240px);
  background: linear-gradient(145deg, rgba(24,24,24,0.95), rgba(13,13,13,0.95));
  border: 1px solid rgba(var(--accent-rgb), 0.25);
  border-radius: 12px;
  padding: clamp(0.6rem, 1.2vh, 1rem) clamp(0.6rem, 1vw, 1rem);
  text-align: left;
  position: relative; overflow: hidden;
}

/* Top shine effect */
.skill-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.5), transparent);
}

.skill-card .sc-header { display: flex; align-items: center; gap: 0.4em; }
.skill-card .sc-icon { font-size: clamp(1.3rem, 2.2vw, 1.8rem); }
.skill-card .sc-name { font-weight: 600; font-size: clamp(1rem, 1.7vw, 1.4rem); }
.skill-card .sc-desc { font-size: clamp(0.8rem, 1.3vw, 1.1rem); color: var(--text-secondary); line-height: 1.5; }
.skill-card .sc-tools { font-size: clamp(0.7rem, 1.1vw, 0.95rem); color: var(--text-dim); }
.skill-card .sc-tools span { color: var(--accent); font-weight: 600; }

/* Wide variant (for flow steps) */
.skill-card.wide {
  width: 100%; max-width: min(85vw, 700px);
  display: flex; align-items: flex-start; gap: clamp(0.6rem, 1.2vw, 1.2rem);
}
.skill-card.wide .sc-step {
  font-weight: 700; font-size: clamp(1.2rem, 2vw, 1.8rem);
  color: var(--accent); min-width: clamp(28px, 4vw, 40px);
}

/* Blue variant (for alternating colors) */
.skill-card.blue { border-color: rgba(var(--accent2-rgb), 0.25); }
.skill-card.blue::before { background: linear-gradient(90deg, transparent, rgba(var(--accent2-rgb), 0.5), transparent); }
.skill-card.blue .sc-tools span { color: var(--accent2); }
```

### HTML (standard)

```html
<div class="skill-cards">
  <div class="skill-card">
    <div class="sc-header"><span class="sc-icon">🔍</span><span class="sc-name">Skill Name</span></div>
    <div class="sc-desc">What this skill does</div>
    <div class="sc-tools"><span>tool-1</span> <span>tool-2</span></div>
  </div>
</div>
```

### HTML (wide, with step number)

```html
<div class="skill-card wide">
  <div class="sc-step">01</div>
  <div class="sc-body">
    <div class="sc-name">Step Name</div>
    <div class="sc-desc">Description</div>
    <div class="sc-tools"><span>tool</span></div>
  </div>
</div>
```

---

## Flow Steps

Sequential process cards with step numbers. Built on the wide skill card.

**When to use:** Showing a pipeline or multi-step process (e.g., Scout → Curator → Publish).

### CSS (reveal.js version)

```css
.flow-step {
  display: flex; align-items: flex-start; gap: 16px;
  background: linear-gradient(145deg, rgba(24,24,24,0.95), rgba(13,13,13,0.95));
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: var(--box-radius, 10px);
  padding: 14px 20px; margin-bottom: 10px;
}
.flow-step .step-num {
  font-weight: 700; font-size: 24pt;
  color: var(--primary-color); min-width: 36px;
}
.flow-step h3 { font-size: 18pt; margin: 0 0 4px; }
.flow-step p { font-size: 14pt; margin: 2px 0; }
.flow-step .tools { font-size: 12pt; margin-top: 6px; }
.flow-step .tools span { color: var(--primary-color); font-weight: 600; }
```

---

## Swimlane

Two-party collaboration layout. Left and right columns represent two actors, center column shows shared stages.

**When to use:** Showing parallel work between two people/systems (e.g., developer vs AI agent).

### CSS

```css
.swimlane {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0; align-items: stretch;
}

.swimlane .lane-cell {
  padding: 12px 16px;
  border: 1px solid rgba(var(--accent-rgb), 0.12);
  border-radius: 8px; margin: 4px;
}
.swimlane .lane-cell.blue {
  border-color: rgba(var(--accent2-rgb), 0.12);
}

.swimlane .lane-label {
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-card);
  border: 1px solid rgba(var(--accent-rgb), 0.3);
  border-radius: 8px; padding: 6px 12px; z-index: 1;
}

/* Vertical line connecting center labels */
.swimlane .lane-line {
  position: absolute; top: 0; bottom: 0; width: 1px; left: 50%;
  background: linear-gradient(to bottom, rgba(var(--accent-rgb), 0.15), rgba(var(--accent2-rgb), 0.15));
}
```

### HTML

```html
<div class="swimlane">
  <!-- Header -->
  <p class="text-center">⚡ Person A</p>
  <p></p>
  <p class="text-center">🐾 Person B</p>

  <!-- Row 1 -->
  <div class="lane-cell"><p><strong>What A does</strong></p></div>
  <div style="display: flex; align-items: center; justify-content: center; position: relative;">
    <div class="lane-line"></div>
    <div class="lane-label"><h3>Stage Name</h3></div>
  </div>
  <div class="lane-cell blue"><p><strong>What B does</strong></p></div>

  <!-- More rows... -->
</div>
```

---

## Background Art

Overlay an image (illustration, photo) in the corner of a slide with a gradient fade to the background color.

**When to use:** Adding atmosphere without overwhelming the content. Best on title slides, vision slides, and closing slides.

> For the full layered backdrop system (grid texture + corner glows + double-mask `.bg-art` + character cameos), see [backdrop-system.md](backdrop-system.md). The version below is the minimal single-mask variant — reach for the full system when the deck has multiple narrative modes (axis-specific pages, scene pages, info-dense pages) that should read as consistent layers.

### CSS

```css
.bg-art {
  position: absolute; top: 0; right: 0;
  width: 60%; height: 100%;
  background-image: url('path-to-image.png');
  background-size: cover; background-position: center;
  pointer-events: none; z-index: 0;
  opacity: 0.5; /* Adjust: 0.3 subtle, 0.7 prominent */
  mask-image: linear-gradient(to left, rgba(0,0,0,0.5) 0%, transparent 75%);
  -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,0.5) 0%, transparent 75%);
}
```

### HTML

```html
<section class="slide">
  <div class="bg-art"></div>
  <!-- Content goes here (z-index above bg-art) -->
</section>
```

**Tips:**
- For dark backgrounds, opacity 0.3-0.7 works well
- For light backgrounds, lower to 0.1-0.3
- Adjust the mask gradient direction for different corner placement
- For softer, corner-wedge fades on both axes, upgrade to the double-mask `mask-composite: intersect` version documented in [backdrop-system.md](backdrop-system.md)

---

## HITL Bar

A divider line indicating a human-in-the-loop checkpoint between automated steps.

**When to use:** Between automated pipeline steps where human review is required.

### CSS

```css
.hitl-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 20px;
  color: var(--accent); font-weight: 600;
}
.hitl-bar .line {
  flex: 1; height: 1px;
  background: rgba(var(--accent-rgb), 0.25);
}
```

### HTML

```html
<div class="hitl-bar">
  <div class="line"></div>
  🧑 Human-in-the-loop：description of the checkpoint
  <div class="line"></div>
</div>
```

---

## Lifecycle Nodes

Horizontal chain of stages connected by arrows. Each node is a circle with an emoji and a label.

**When to use:** Showing a cyclical or sequential lifecycle (e.g., 開發 → 上架 → 推廣 → 客服 → 迭代).

### CSS

```css
.lifecycle {
  display: flex; align-items: center;
  justify-content: center; gap: 8px;
}
.lifecycle .node { text-align: center; min-width: 90px; }
.lifecycle .node .circle {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 8px; font-size: 22pt;
}
.lifecycle .node .circle.gold {
  background: rgba(var(--accent-rgb), 0.15);
  border: 2px solid var(--accent);
}
.lifecycle .node .circle.blue {
  background: rgba(var(--accent2-rgb), 0.15);
  border: 2px solid var(--accent2);
}
.lifecycle .node .circle.glow {
  box-shadow: 0 0 15px rgba(var(--accent-rgb), 0.3);
}
.lifecycle .arrow {
  color: var(--accent); opacity: 0.5; font-size: 18pt;
}
```

### HTML

```html
<div class="lifecycle">
  <div class="node">
    <div class="circle gold">⚙️</div>
    <h3>Stage 1</h3>
    <p>Description</p>
  </div>
  <p class="arrow">→</p>
  <div class="node">
    <div class="circle blue">🚀</div>
    <h3>Stage 2</h3>
    <p>Description</p>
  </div>
  <!-- More nodes... -->
</div>
```

---

## Full-Bleed Diagonal Split

Two edge-to-edge images separated by a diagonal seam. Great for **before/after** or **conceptual contrast** slides.

**When to use:** When the slide's message is a direct comparison and each side deserves a dominant visual. Overlay text cards on top for captions.

### CSS

```css
.slide-split { padding: 0; position: relative; overflow: hidden; }
.split-bg { position: absolute; inset: 0; z-index: 0; }
.split-half { position: absolute; inset: 0; overflow: hidden; }
.split-half img { width: 100%; height: 100%; object-fit: cover; }

/* Diagonal seam — left side 0–65% top, 35% bottom */
.split-half.left  { clip-path: polygon(0 0, 65% 0, 35% 100%, 0 100%); }
.split-half.right { clip-path: polygon(65% 0, 100% 0, 100% 100%, 35% 100%); }

/* Apply desaturation to the "before" side */
.split-half.left img { filter: saturate(0.5) brightness(0.7) contrast(0.95); }

/* The seam line itself */
.split-seam {
  position: absolute; top: -5%; bottom: -5%; left: 50%;
  width: 3px;
  background: linear-gradient(180deg, transparent, var(--accent-primary) 50%, transparent);
  transform: translateX(-50%) skewX(-20deg);
  box-shadow: 0 0 40px var(--accent-primary);
}

/* Vignette for text readability */
.split-bg::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 20% 80%, rgba(0,0,0,0.55), transparent 50%),
              radial-gradient(ellipse at 80% 20%, rgba(0,0,0,0.55), transparent 50%);
  z-index: 2;
}

/* Content overlays */
.split-content { position: relative; z-index: 3; padding: 6vh 6vw; }
```

### HTML

```html
<section class="slide slide-split">
  <div class="split-bg">
    <div class="split-half left"><img src="before.png" alt=""></div>
    <div class="split-half right"><img src="after.png" alt=""></div>
    <div class="split-seam"></div>
  </div>
  <div class="split-content">
    <h2>Title</h2>
    <!-- Overlay caption cards with backdrop-filter: blur() -->
  </div>
</section>
```

### Pitfalls

- **Mirror the "after" image if the subject faces the wrong way.** Use `transform: scaleX(-1)` on the img, but only when composition demands it (original image generation with explicit framing is better).
- **Reveal animation:** animate `clip-path` of the "after" half to slide in from the right over the "before" half. See `references/reveal-system.md`.

---

## 3-2 Honeycomb

Five hexagonal cells, 3 on top row and 2 offset on bottom. Visualizes a 5-stage cycle with room for per-stage metadata inside each cell.

**When to use:** 3–7 stages of a lifecycle where each needs ~30 characters of text. Better than horizontal lists when stages are discrete and memorable.

### CSS

```css
.honeycomb {
  position: relative;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  aspect-ratio: 1000 / 500;  /* critical: matches hex math below */
}
.hex {
  position: absolute;
  width: 22%;
  aspect-ratio: 1 / 1.155;   /* hex proportion */
  background: var(--bg-secondary);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 5%;
  text-align: center;
}

/* Hex positions — offsets tuned to prevent overlap */
.hex.h1 { left: 4%;  top: 0%; }
.hex.h2 { left: 21%; top: 52%; }
.hex.h3 { left: 39%; top: 0%; }
.hex.h4 { left: 56%; top: 52%; }
.hex.h5 { left: 74%; top: 0%; }
```

### Offset math (critical!)

Common mistake: hexes overlap vertically because the container aspect ratio is too wide, making `hex_height_%` exceed 50%.

- `hex_width_%` = 22 (of container width)
- `hex_height_in_px` = hex_width_px × 1.155
- `hex_height_%` (of container height) = 22 × 1.155 / `container_aspect_ratio`

For hex height to stay ≤ 52% (fits bottom row starting at `top: 52%`), container aspect must be ≥ ~2.0. The formula: **set container aspect ratio = 1000 / 500 (2:1) when hex width = 22%**. Wider container → hexes too tall → vertical overlap.

### Connection arrows (SVG)

For the zigzag path h1 → h2 → h3 → h4 → h5:

```html
<svg viewBox="0 0 1000 562" preserveAspectRatio="none">
  <!-- Center points: h1(150,162) h2(320,452) h3(500,162) h4(670,452) h5(850,162) -->
  <path d="M 150 162 L 320 452" stroke="..." stroke-dasharray="5 7" fill="none"/>
  <path d="M 320 452 L 500 162" stroke="..." stroke-dasharray="5 7" fill="none"/>
  <!-- ...etc -->
</svg>
```

Lines pass under hexes via z-index (SVG `z-index:1`, hex `z-index:2`). Only the segments BETWEEN hexes are visible.

### Central badge (for "continuous cycle" label)

Place a small pill in the middle gap between the two hex rows:

```css
.cycle-badge {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: rgba(13,13,13,0.85);
  border: 1px solid rgba(var(--accent-primary-rgb), 0.4);
  backdrop-filter: blur(8px);
  z-index: 3;
}
```

---

## 24-Hour Circular Clock

Radial layout for temporal data — cron schedules, daily routines, time-distributed events. Powerful for conveying density and diurnal patterns.

**When to use:** Data spread across a 24h cycle with distinct categories (different dot colors = different types). Impactful for "look how much is happening" narratives.

### SVG structure

```html
<svg class="clock-svg" viewBox="0 0 600 600">
  <!-- Concentric guide rings -->
  <circle cx="300" cy="300" r="260" fill="none" stroke="rgba(242,242,242,0.08)"/>
  <circle cx="300" cy="300" r="200" fill="none" stroke="rgba(242,242,242,0.05)"/>

  <!-- 24 hour tick marks -->
  <g id="hour-ticks"><!-- generated by JS --></g>

  <!-- Hour labels at 0/6/12/18 -->
  <text x="300" y="32" text-anchor="middle" font-family="JetBrains Mono">00</text>
  <text x="300" y="588" text-anchor="middle" font-family="JetBrains Mono">12</text>
  <text x="580" y="306" text-anchor="middle" font-family="JetBrains Mono">06</text>
  <text x="20" y="306" text-anchor="middle" font-family="JetBrains Mono">18</text>

  <!-- Center label -->
  <text x="300" y="285" text-anchor="middle" font-size="40" font-weight="900">24h</text>

  <!-- Category dots (generated by JS) -->
  <g id="cron-dots"></g>
</svg>
```

### JS generation

```js
const cx = 300, cy = 300;
// Map (hour, minute) to angle. 0 at top, clockwise.
const angleOf = (h, m = 0) => ((h + m / 60) / 24) * 2 * Math.PI - Math.PI / 2;

// Hour ticks
for (let h = 0; h < 24; h++) {
  const a = angleOf(h);
  const major = h % 6 === 0;
  // ...create <line> from r=258 to r=270
}

// Dots per category (place at different radii for legibility)
const crons = [
  { cat: 'firehose', color: '#CD9D4F', r: 258, times: [[8,0], [19,0]] },
  { cat: 'news',     color: '#E8B97A', r: 258, times: [[8,15], [12,15], [16,15], [20,15]] },
  // ...
];

crons.forEach(c => {
  c.times.forEach(([h, m]) => {
    const a = angleOf(h, m);
    const x = cx + Math.cos(a) * c.r;
    const y = cy + Math.sin(a) * c.r;
    // Create <circle r=8 fill=c.color> at (x,y) with data-cat=c.cat
  });
});
```

### Sync with legend

Each dot and legend row share a `data-cat` attribute. A global sync function toggles dot visibility based on which legend items have `.visible` — see `references/reveal-system.md`.

### Legend pattern

```html
<div class="clock-legend">
  <div class="legend-item reveal" data-cat="firehose">
    <span class="swatch" style="background: #CD9D4F"></span>
    <div>
      <div class="name">Firehose</div>
      <div class="count">2×/day · 抓熱點</div>
    </div>
  </div>
  <!-- More categories... -->
</div>
```

Legend swatch width should match on-screen dot size (legend 14px + dot `r=7-8` → visually equal). Both scale together.

---

## Modes × Phases Grid

Tabular layout showing which stages (columns) each mode (row) uses. Bullet-cell indicates "on", dashed empty cell indicates "off".

**When to use:** When a process has parallel variants (e.g. monthly/weekly/quick runs) that all share the same phase names but differ in which phases they include.

### CSS

```css
.phase-strip {
  display: grid;
  grid-template-columns: 140px repeat(9, 1fr);  /* label col + N phase cols */
  gap: 0.4rem;
  max-width: 1400px;
  margin: 2vh auto;
}
.phase-spacer {}  /* empty first col matches label col width of table below */

.phase-cell {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.9rem 0.5rem;
  text-align: center;
}
.phase-cell .num  { font-family: monospace; color: var(--text-muted); font-size: var(--fs-label); }
.phase-cell .name { font-weight: 700; font-size: var(--fs-body-md); }

/* HITL / gate marker on top-right */
.phase-cell.has-hitl::after {
  content: "🛑";
  position: absolute;
  top: -10px; right: -6px;
  font-size: 1rem;
}

.modes-table {
  max-width: 1400px;
  margin: 1.5vh auto 0;
  display: grid;
  grid-template-columns: 140px repeat(9, 1fr);  /* MUST match phase-strip */
  gap: 0.4rem;
  align-items: center;
}
.mode-label { font-weight: 700; font-size: var(--fs-body-lg); }
.mode-label .sub {
  display: block;
  font-size: var(--fs-label);
  color: var(--text-muted);
  font-family: monospace;
}
.mode-cell {
  height: 38px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.mode-cell.on  { background: rgba(var(--accent-primary-rgb), 0.25); border: 1px solid rgba(var(--accent-primary-rgb), 0.5); }
.mode-cell.on::before  { content: "●"; color: var(--accent-primary); }
.mode-cell.off { background: rgba(255,255,255,0.02); border: 1px dashed var(--border); }
.mode-cell.off::before { content: "—"; color: var(--text-muted); opacity: 0.3; }
```

### Alignment gotcha

**Both grids must use identical `grid-template-columns`.** If the phase strip has no label column, the mode row's cells will be off by one. Fix by adding a `phase-spacer` empty div as the first child of `.phase-strip`.

### HTML

```html
<div class="phase-strip">
  <div class="phase-spacer"></div>                            <!-- aligns to label col -->
  <div class="phase-cell has-hitl"><div class="num">01</div><div class="name">分析</div></div>
  <!-- ...9 phase cells -->
</div>

<div class="modes-table">
  <div class="mode-label">月度<span class="sub">monthly</span></div>
  <div class="mode-cell on"></div>
  <div class="mode-cell on"></div>
  <!-- ...9 cells -->

  <div class="mode-label">週度<span class="sub">weekly</span></div>
  <div class="mode-cell off"></div>
  <!-- etc. -->
</div>
```

---

## Closed-Loop Diagram

Nodes in a clockwise circular arrangement connected by dashed arrows. For showing a cyclical process (feedback → product → feedback).

**When to use:** When the point is "this is a cycle" — the visual should loop back to where it started. Works better than a linear pipeline for iteration stories.

### CSS

```css
.loop-wrap {
  position: relative;
  max-width: 1150px;
  margin: 0 auto;
  width: 100%;
  aspect-ratio: 1200 / 560;
}
.loop-wrap svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
  overflow: visible;
}
.loop-node {
  position: absolute;
  transform: translate(-50%, -50%);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 0.9rem 1.1rem;
  min-width: 180px;
  text-align: center;
  z-index: 2;
}

/* Clockwise positions around an invisible circle */
.loop-node.n-user   { left: 50%; top: 8%; }   /* 12 o'clock */
.loop-node.n-a      { left: 18%; top: 30%; } /* upper left */
.loop-node.n-b      { left: 18%; top: 58%; } /* lower left */
.loop-node.n-c      { left: 38%; top: 85%; } /* bottom left */
.loop-node.n-d      { left: 62%; top: 85%; } /* bottom right */
.loop-node.n-e      { left: 82%; top: 58%; } /* lower right */
.loop-node.n-f      { left: 82%; top: 30%; } /* upper right */
```

### SVG arrows

Arrows between clockwise neighbors. Use dashed strokes + arrowhead marker:

```html
<svg viewBox="0 0 1200 620" preserveAspectRatio="none">
  <defs>
    <marker id="loop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--accent-primary)"/>
    </marker>
  </defs>
  <!-- Curved arc between adjacent node centers -->
  <path d="M 540 70 Q 380 100 280 170"
        fill="none"
        stroke="var(--accent-primary)" stroke-width="2.5"
        stroke-dasharray="6 4" opacity="0.55"
        marker-end="url(#loop-arrow)"/>
  <!-- ...one per arc -->
</svg>
```

### Pitfalls

- Computing node coordinates in viewBox space requires matching the aspect ratio of `.loop-wrap` to the viewBox (here `1200 / 620 ≈ 1.94`; wrap aspect = `1200 / 560 ≈ 2.14`). Small mismatch OK, large mismatch stretches arrows.
- The final "loop back" arrow must go from the last node to the first — easy to forget.
- Use Q-curves (quadratic bezier) for short arcs, C-curves for wider sweeps.

---

## QR Panel (Persistent Sidebar)

Right-side column with QR code + label. Stays visible across multiple slides in a section so the audience always has time to scan.

**When to use:** When you have one or more slides promoting a downloadable / external resource. Putting the QR on every slide of that section is better than a single "go here" slide at the end.

### CSS

```css
.slide-with-qr {
  display: grid;
  grid-template-columns: 1fr 260px;
  grid-template-rows: auto 1fr;
  gap: 3vw 4vw;
  padding: 4vh 5vw;
}
.slide-with-qr .main-head  { grid-column: 1 / -1; }
.slide-with-qr .main-body  { grid-column: 1; grid-row: 2; }
.slide-with-qr .qr-panel   { grid-column: 2; grid-row: 2; align-self: start; }

.qr-panel {
  background: rgba(37, 37, 37, 0.5);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 1.3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.7rem;
}
.qr-panel .qr-img {
  width: 100%; max-width: 220px;
  aspect-ratio: 1;
  background: #F2F2F2;   /* white backing for QR contrast */
  padding: 10px;
  border-radius: 12px;
}
.qr-panel .qr-img img { width: 100%; height: 100%; display: block; }
.qr-panel .qr-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-label);
  color: var(--accent-secondary);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.qr-panel .qr-desc { font-size: var(--fs-body-md); font-weight: 700; }
.qr-panel .qr-url  { font-family: monospace; font-size: 0.75rem; color: var(--text-muted); word-break: break-all; }
```

### Generating QRs

Use `qrencode` CLI:

```bash
brew install qrencode
qrencode -o assets/qr.png -s 20 -m 2 "https://example.com"
```

- `-s 20` → 20px per dot (large enough for 3m scan distance)
- `-m 2` → 2-dot margin (prevents scanner edge issues)

**Generate at fixed pixel size, not % — QR pixels must be square and sharp. Scaling via CSS is fine because the image is already oversized.**

### Don'ts

- **Don't put QR in reveal sequence.** Users scan early; if QR only appears at step 4, they miss it.
- **Don't use a transparent QR.** Scanners need white background for contrast.
- **Don't shrink below 180×180 display px.** Smaller = harder to scan from the back row.

---

## Skill Card with Command Pill

Card for showing a named capability (slash command, CLI tool, skill). Features a monospace "pill" badge in terminal purple to mimic CLI appearance.

**When to use:** Showing 2–4 related tools/skills where each has a `/command` name the audience might want to try.

### CSS

```css
.skill-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.skill-card .sc-role {
  font-family: monospace;
  font-size: var(--fs-label);
  color: var(--accent-secondary);
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
/* The pill — mimics Claude Code / CLI command badges */
.skill-card .sc-cmd {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-body-xl);
  font-weight: 600;
  color: #c4b5fd;                              /* terminal purple */
  background: rgba(139, 123, 217, 0.14);
  border: 1px solid rgba(139, 123, 217, 0.22);
  padding: 4px 14px;
  border-radius: 999px;
  align-self: flex-start;
}
.skill-card .sc-title { font-size: var(--fs-h2); font-weight: 800; }
.skill-card .sc-desc  { font-size: var(--fs-body-md); color: var(--text-muted); line-height: 1.55; }
.skill-card .sc-tags  { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: auto; }
.skill-card .sc-tag   { font-family: monospace; font-size: 0.75rem; padding: 2px 9px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-muted); }
.skill-card.wide      { grid-column: 1 / -1; }  /* full-width card option */
```

### HTML

```html
<div class="skill-grid">
  <div class="skill-card">
    <div class="sc-role">顧問</div>
    <div class="sc-cmd">/second-opinion</div>
    <div class="sc-title">第二雙眼</div>
    <div class="sc-desc">用 Codex CLI 當獨立審查者，從 5 個維度壓測計畫。</div>
    <div class="sc-tags">
      <span class="sc-tag">完整性</span>
      <span class="sc-tag">一致性</span>
      <span class="sc-tag">清晰度</span>
    </div>
  </div>
  <!-- More cards -->
</div>
```

### Grid

```css
.skill-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  align-content: start;
}
```

Use `.skill-card.wide { grid-column: 1 / -1; }` to let a single card span both columns when it needs more room.

---

## 14. Equal-Width Pipeline with Arrows

Horizontal pipeline where N steps stay visually equal-width even when their labels have very different lengths (e.g. "Email / launchd" vs "Triage / 查 Supabase / 筆記 / Codebase").

**Problem with flex**: `display: flex` lets each node size to its content — the one with the longest `.sub` text stretches wider, and the pipeline looks crooked.

**Fix: CSS grid with alternating `1fr auto` columns** — one `1fr` per node, one `auto` per arrow.

### HTML

```html
<div class="pipeline">
  <div class="node"><span class="icon">...</span><span class="lbl">Email</span><span class="sub">launchd / hourly</span></div>
  <span class="arrow">→</span>
  <div class="node"><span class="icon">...</span><span class="lbl">Triage</span><span class="sub">查 Supabase / 筆記 / Codebase</span></div>
  <span class="arrow">→</span>
  <div class="node"><span class="icon">...</span><span class="lbl">Draft</span><span class="sub">humanly + review</span></div>
  <span class="arrow">→</span>
  <div class="node hitl"><span class="icon">...</span><span class="lbl">Reviewer</span><span class="sub">審核後放行</span></div>
  <span class="arrow">→</span>
  <div class="node"><span class="icon">...</span><span class="lbl">Send</span><span class="sub">Gmail draft</span></div>
</div>
```

### CSS

```css
.pipeline {
  display: grid;
  /* 5 nodes + 4 arrows — one fr per node, auto per arrow */
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 14px;
}
.pipeline .node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0.4rem;
  min-width: 0;        /* allow text to shrink inside grid column */
}
.pipeline .node .sub {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.15rem;
  text-align: center;
  line-height: 1.3;
  /* CRITICAL: do NOT set white-space: nowrap here — it defeats the grid by forcing columns to widen */
}
.pipeline .arrow {
  color: var(--text-muted);
  opacity: 0.6;
}
```

### Common pitfall

When migrating from `display: flex` to grid, **remove `white-space: nowrap`** on any descendant text. Nowrap tells the grid column to accommodate the full line width, defeating the equal `1fr` sizing.

If some subs need to stay on one line (e.g. `launchd / hourly`) while others wrap (e.g. `查 Supabase / 筆記 / Codebase`), let the grid decide — wrapping only happens in columns that need it.

### When to use

- Process with 3–6 named steps that should read as a row
- Step labels + descriptions vary in length
- Want arrows between steps, not just spacing

For variable-width stages where the content itself implies the size, use the **Flow Steps** component instead.
