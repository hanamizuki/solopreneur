# Background Music with Fade

Optional ambient music for a **live-speaker** deck — a soft bed under the
presenter's voice that fades in when a tagged slide appears and fades out when
it leaves. Skip it for self-browsing or PDF decks.

The deck-framework-specific `data-bgm` implementation (plus a CDP verification
harness for testing fades headlessly) lives in the **`hana-slides`** skill. This
file is the engine-level recipe for *any* frontend-slides or reveal.js deck.

## Principle (engine-agnostic)

- **One shared `Audio` element** on `document` — never tie it to a slide's DOM
  visibility, or the fade-out gets cut the instant you advance.
- **Fade with a `requestAnimationFrame` ramp using smoothstep easing.** Linear
  volume ramps sound like they jump at the end — loudness perception is
  non-linear, so ease the curve.
- **Keep target volume ~0.25–0.35** so the music sits *under* the speaker's
  voice, not over it.

The shared helper both engines use:

```js
const smoothstep = (x) => x * x * (3 - 2 * x);
let rafId = null;
function fadeTo(audio, target, dur, onDone) {
  cancelAnimationFrame(rafId);
  const from = audio.volume, t0 = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    audio.volume = from + (target - from) * smoothstep(k);
    if (k < 1) rafId = requestAnimationFrame(step);
    else if (onDone) onDone();
  })(t0);
}
```

## frontend-slides (scroll / IntersectionObserver)

Tag a section with `data-bgm` (and optional `data-bgm-vol`), then let one shared
IntersectionObserver drive enter/leave:

```js
(function initSlideBgm() {
  const bgmSlides = Array.from(document.querySelectorAll('section[data-bgm]'));
  if (!bgmSlides.length) return;

  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = true;
  let current = null;

  function enter(s) {
    const src = s.dataset.bgm;
    const vol = parseFloat(s.dataset.bgmVol || '0.3');
    if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
    current = s;
    audio.volume = 0;
    audio.play().then(() => fadeTo(audio, vol, 2200)).catch(() => {});
  }
  function leave(s) {
    if (current !== s) return;
    current = null;
    fadeTo(audio, 0, 1600, () => { audio.pause(); audio.currentTime = 0; });
  }

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting ? enter(e.target) : leave(e.target)),
    { threshold: 0.5 }
  );
  bgmSlides.forEach((s) => io.observe(s));
})();
```

(`fadeTo` / `smoothstep` from the Principle section above.)

## reveal.js (slide events)

reveal.js has no scroll model, so trigger enter/leave from `slidechanged`
(and `ready` for the first slide) instead of an IntersectionObserver. Reuse the
same shared `audio` element and `fadeTo` helper:

```js
const audio = new Audio();
audio.preload = 'auto';
audio.loop = true;

function applyBgm(slide) {
  const src = slide?.dataset.bgm;
  if (src) {
    const vol = parseFloat(slide.dataset.bgmVol || '0.3');
    if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
    audio.volume = 0;
    audio.play().then(() => fadeTo(audio, vol, 2200)).catch(() => {});
  } else {
    fadeTo(audio, 0, 1600, () => { audio.pause(); audio.currentTime = 0; });
  }
}

Reveal.on('ready', (e) => applyBgm(e.currentSlide));
Reveal.on('slidechanged', (e) => applyBgm(e.currentSlide));
```

## Caveats (these bite people)

- **Autoplay policy.** Audio with sound needs prior user activation. Mid-deck the
  page already has it from earlier key presses, so `play()` works — the
  `.catch()` only covers a cold deep-link straight onto a music slide. (Muted
  media autoplays anywhere, but muting defeats the point for music.)
- **Venue PA.** The laptop's audio output must be routed to the room's PA or the
  audience hears nothing. This is an AV/cabling check, unrelated to the code —
  remind the presenter every time.
- **Sourcing / rights.** Pixabay is free with no attribution but blocks automated
  download — the user clicks Download themselves. YouTube Audio Library is safest
  if the talk will be uploaded. Musopen serves public-domain *recordings* (a
  composition being public domain is not enough — the recording is separately
  copyrighted). Copyrighted film themes are fine to play live but risk Content-ID
  muting if the recording is posted afterward.
