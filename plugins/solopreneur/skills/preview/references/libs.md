# Stack reference for preview skill

Four libraries are bundled via CDN. Use whichever fit the content — don't force-include unused ones.

## Tailwind CSS (always loaded)

```html
<script src="https://cdn.tailwindcss.com"></script>
```

- Use Tailwind classes directly in `class="…"`. The template provides a base typography style (`.doc h1…`); Tailwind utilities layer on top.
- CDN build is JIT but **does not support `@apply`**, custom `tailwind.config` works inline via `tailwind.config = {…}` before the script tag if needed.
- For colours, prefer neutral palette: `text-gray-900 / 600 / 400`, `bg-gray-50 / 100`. Use one accent colour sparingly (e.g. `text-emerald-600` for positive deltas).

## Alpine.js — small reactive state (always loaded)

```html
<script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

Why Alpine instead of vanilla JS: gives you reactive UI in HTML attributes without a build step. Use it whenever the page has interactive state.

### Basic recipe

```html
<div x-data="{ count: 0, name: '' }">
  <input x-model="name" placeholder="Your name" class="border rounded px-2 py-1">
  <p>Hello <span x-text="name || 'stranger'"></span></p>

  <button @click="count++" class="px-3 py-1 bg-gray-800 text-white rounded">+1</button>
  <span x-text="count"></span>

  <p x-show="count > 5">You really like this button.</p>
</div>
```

### Calculator pattern

```html
<div x-data="{ users: 100, price: 29, get revenue() { return this.users * this.price } }"
     class="space-y-2 p-4 border rounded">
  <label class="block">Users
    <input type="number" x-model.number="users" class="border rounded px-2 py-1 w-24">
  </label>
  <label class="block">Price/mo ($)
    <input type="number" x-model.number="price" class="border rounded px-2 py-1 w-24">
  </label>
  <p class="text-lg font-semibold">MRR: $<span x-text="revenue.toLocaleString()"></span></p>
</div>
```

### Tabs / sections

```html
<div x-data="{ tab: 'plan' }">
  <div class="flex gap-2 border-b">
    <button @click="tab='plan'" :class="tab==='plan' ? 'font-semibold border-b-2 border-gray-900' : 'text-gray-500'">Plan</button>
    <button @click="tab='risk'" :class="tab==='risk' ? 'font-semibold border-b-2 border-gray-900' : 'text-gray-500'">Risks</button>
  </div>
  <div x-show="tab==='plan'">Plan content…</div>
  <div x-show="tab==='risk'">Risk content…</div>
</div>
```

## Chart.js — bar / line / pie / etc.

Opt-in. Uncomment the CDN line in `template.html`:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
```

### Recipe

```html
<canvas id="chart-revenue" height="180"></canvas>
<script>
new Chart(document.getElementById('chart-revenue'), {
  type: 'bar',
  data: {
    labels: ['Q1','Q2','Q3','Q4'],
    datasets: [{
      label: 'Revenue (k$)',
      data: [12, 19, 23, 31],
      backgroundColor: '#1f2937',
      borderRadius: 4
    }]
  },
  options: {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, grid: { color: '#e5e7eb' } }, x: { grid: { display: false } } }
  }
});
</script>
```

Keep the palette neutral: one dark fill (`#1f2937`) for the primary series, lighter greys for comparisons. Avoid Chart.js default colourful rainbows.

## Mermaid — flowcharts / sequence / gantt

Opt-in. Uncomment in `template.html`:

```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
</script>
```

### Flowchart

```html
<div class="mermaid">
flowchart LR
  A[Idea] --> B{Validate?}
  B -- yes --> C[Build]
  B -- no  --> D[Drop]
  C --> E[Ship]
</div>
```

### Sequence

```html
<div class="mermaid">
sequenceDiagram
  participant U as User
  participant S as Server
  U->>S: request
  S-->>U: response
</div>
```

### Gantt (timeline)

```html
<div class="mermaid">
gantt
  title  Roadmap
  dateFormat  YYYY-MM-DD
  section Phase 1
  Research      :a1, 2026-05-20, 7d
  Prototype     :a2, after a1, 14d
  section Phase 2
  User testing  :b1, after a2, 10d
</div>
```

## Conventions to follow

- **One CDN load order**: Tailwind first, Alpine `defer`, Chart.js / Mermaid after. The template already gets this right.
- **`x-cloak`** to hide Alpine markup until parsed: add `<style>[x-cloak]{display:none}</style>` and `x-cloak` attribute on flickery elements if you see flash-of-raw-template.
- **Don't mix React / Vue** — Alpine is the only state lib. Loading more competes for the DOM.
- **Inline scripts must run after the elements they touch** — put `<script>new Chart(…)</script>` *after* the `<canvas>`, not in `<head>`.
- **Currency / number formatting**: use `(n).toLocaleString()` inline rather than dragging in a lib.
