# Step-Controlled Reveal System

A keyboard-driven reveal system for live presentations. Each press of space / → / click advances one step. Works with frontend-slides (single HTML) or adaptable to reveal.js.

## When to use

- **Live presentations** where the speaker paces content
- **Workshops / demos** with discussion checkpoints
- Any deck where a slide has multiple conceptual beats

Do **not** use for self-viewing decks (scroll-based is better there).

## Basic pattern

### CSS

```css
/* Default: hidden */
.reveal {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}
/* Revealed when .visible is added */
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### JS core

```js
(() => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const slideSteps = slides.map(s => Array.from(s.querySelectorAll('.reveal')));

  let slideIdx = 0;
  let stepIdx = 0;

  function showStep(i, s) {
    slideSteps[i].slice(0, s).forEach(el => el.classList.add('visible'));
    slideSteps[i].slice(s).forEach(el => el.classList.remove('visible'));
    // Hook for custom sync functions
    if (window.__syncCronDots) window.__syncCronDots();
    syncToggles(slides[i]);
  }

  function advance() {
    const steps = slideSteps[slideIdx];
    if (stepIdx < steps.length) {
      stepIdx++;
      showStep(slideIdx, stepIdx);
    } else if (slideIdx < slides.length - 1) {
      goSlide(slideIdx + 1);
    }
  }

  function reverse() { /* same, backwards */ }
  function goSlide(i, fullyRevealed = false) {
    slideIdx = Math.max(0, Math.min(slides.length - 1, i));
    stepIdx = fullyRevealed ? slideSteps[slideIdx].length : 0;
    slides[slideIdx].scrollIntoView({ behavior: 'smooth' });
    showStep(slideIdx, stepIdx);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if ((e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') && !e.shiftKey) {
      e.preventDefault(); advance();
    } else if ((e.key === ' ' && e.shiftKey) || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); reverse();
    } else if (e.key === 'Home') {
      e.preventDefault(); goSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault(); goSlide(slides.length - 1, true);
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, .step-counter')) return;
    advance();
  });

  showStep(0, 0);
})();
```

Use scroll-snap CSS on `html`:

```css
html { scroll-snap-type: y mandatory; scroll-behavior: smooth; }
.slide { scroll-snap-align: start; }
```

## Step counter UI

Small pill top-right showing `1 / 17 · space →`:

```html
<div class="step-counter" id="stepCounter">
  <span id="slidePos">1<span class="sep">/</span>17</span>
  <span class="hint">space → &nbsp;·&nbsp; ⇧ ←</span>
</div>
```

```css
.step-counter {
  position: fixed;
  bottom: 1.5vh; right: 2vw;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-micro);
  color: var(--text-muted);
  background: rgba(26, 20, 16, 0.7);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  backdrop-filter: blur(8px);
  z-index: 100;
  letter-spacing: 0.08em;
}
```

## Progress bar

Top-edge gradient bar showing overall progress:

```html
<div class="progress" id="progress"></div>
```

```css
.progress {
  position: fixed; top: 0; left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-warm));
  z-index: 100;
  transition: width 0.3s ease;
}
```

Update in `showStep()`:
```js
const totalUnits = slides.reduce((a, _, i) => a + slideSteps[i].length + 1, 0);
const doneUnits = slides.slice(0, slideIdx).reduce((a, _, i) => a + slideSteps[i].length + 1, 0) + stepIdx;
progressEl.style.width = ((doneUnits / totalUnits) * 100) + '%';
```

## Advanced: `data-toggle` markers

When a single step should trigger complex component state (not just opacity on one element), use invisible marker elements with `data-toggle`:

### HTML
```html
<div class="honeycomb" id="honeycomb">
  <!-- invisible reveal markers that drive component states -->
  <span class="reveal" data-toggle="show-hex"></span>
  <span class="reveal" data-toggle="show-paths"></span>
  <span class="reveal" data-toggle="show-owners"></span>

  <div class="hex">...</div>
  <div class="hex">...</div>
</div>
```

### CSS for markers
```css
.honeycomb [data-toggle] {
  position: absolute; width: 0; height: 0; opacity: 0;
}
```

### Sync function (called from `showStep`)

```js
function syncToggles(slide) {
  const map = {
    'show-hex':    ['.honeycomb', 'show-hex'],
    'show-paths':  ['.honeycomb', 'show-paths'],
    'show-owners': ['.hex',       'show-owner'],
  };
  Object.entries(map).forEach(([key, [target, cls]]) => {
    const marker = slide.querySelector(`[data-toggle="${key}"]`);
    if (!marker) return;
    const on = marker.classList.contains('visible');
    slide.querySelectorAll(target).forEach(el => el.classList.toggle(cls, on));
  });
}
```

Then CSS drives the actual animation off the parent class:
```css
.hex { opacity: 0; transition: opacity 0.5s; }
.honeycomb.show-hex .hex { opacity: 1; }
.honeycomb.show-hex .hex.h2 { transition-delay: 0.12s; }
```

## Advanced: SVG sync with legend

For charts where SVG dots should appear in sync with text legend items (e.g., a 24h clock where each cron category's dots fade in with its legend row):

### Tag each dot + legend with matching `data-cat`

```html
<div class="legend-item reveal" data-cat="firehose">...</div>
<circle class="cron-dot" data-cat="firehose" cx="..." cy="..." r="8"/>
```

### CSS
```css
.cron-dot { opacity: 0; transition: opacity 0.5s ease; }
.cron-dot.on { opacity: 0.92; }
```

### Global sync fn (exposed to main script)

```js
window.__syncCronDots = function() {
  const cats = new Set();
  document.querySelectorAll('.legend-item.visible').forEach(el => {
    if (el.dataset.cat) cats.add(el.dataset.cat);
  });
  document.querySelectorAll('.cron-dot').forEach(dot => {
    if (cats.has(dot.dataset.cat)) dot.classList.add('on');
    else dot.classList.remove('on');
  });
};
```

Call it from `showStep()`:
```js
if (window.__syncCronDots) window.__syncCronDots();
```

Pattern generalizes: any SVG decoration driven by legend-item visibility. Use category tags to link them.

## Screenshot verification

When iterating on reveal timing, avoid relying on `scrollIntoView` + CSS snap for headless screenshots — they race. Instead:

```js
// In headless test, force-apply visible class without depending on scroll
s.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
s.scrollIntoView({ behavior: 'instant', block: 'start' });
if (window.__syncCronDots) window.__syncCronDots();
```

## Pitfalls

- **Don't attach MutationObservers on `.reveal` elements to sync dependent state.** They race with the main controller and miss updates. Instead, expose a global sync function and call from `showStep`.
- **Don't use CSS `transform: scale()` on SVG `<circle>`.** Browsers handle SVG transforms inconsistently. Use `opacity` only for dot reveals.
- **Count your reveals** — if a slide has 8 reveal elements, users need 8 space presses to see everything. Plan narrative beats accordingly.
