# Handoff: add a "background music with fade" recipe to marketer:slide-design

> Untracked note. Apply the change in THIS repo (solopreneur), then delete this file.
> Written 2026-05-26 after building background music into Hana's custom decks.

## Why
While adding fade-in/out background music to Hana's hand-built decks, the pattern turned out
to be a generally useful presentation technique worth surfacing in the generic `/slide-design`
skill. The deck-framework-specific version already lives in the **`hana-slides`** skill
(`~/Agents/skills/hana/hana-slides/references/overlays-and-media.md`, section 3). This handoff
is only about adding an **engine-level recipe** to `marketer:slide-design` so it's discoverable
when building *any* frontend-slides or reveal.js deck.

## Where
`plugins/marketer/skills/slide-design/SKILL.md` (this repo). slide-design wraps two engines
(frontend-slides = single-HTML scroll-based; reveal.js = fragment/slide-event based), so the
recipe needs an implementation per engine — the trigger mechanism differs.

Add a short "Background music (optional)" subsection under the engine handoff area, or as a
`references/background-music.md` if SKILL.md is getting long. Keep it brief; link, don't bloat.

## Recipe to add

**Principle (engine-agnostic):** one shared `Audio` element on `document`, faded with a
requestAnimationFrame ramp using **smoothstep** easing (linear volume ramps sound like they
jump at the end — loudness perception is non-linear). Keep target volume ~0.25–0.35 so it sits
*under* the speaker's voice. The audio element must NOT be tied to a slide's DOM visibility, or
the fade-out gets cut the instant you advance.

**frontend-slides (scroll/IntersectionObserver model)** — tag a section and let an IO drive it.
This is the exact pattern verified in Hana's decks (`data-bgm="assets/x.mp3" data-bgm-vol="0.3"`):

```js
(function initSlideBgm(){
  const bgmSlides = Array.from(document.querySelectorAll('section[data-bgm]'));
  if (!bgmSlides.length) return;
  const audio = new Audio(); audio.preload = 'auto'; audio.loop = true;
  let rafId = null, current = null;
  const smoothstep = (x) => x * x * (3 - 2 * x);
  function fadeTo(target, dur, onDone){
    cancelAnimationFrame(rafId); const from = audio.volume, t0 = performance.now();
    (function step(now){ const k = Math.min(1,(now-t0)/dur);
      audio.volume = from + (target-from)*smoothstep(k);
      if (k<1) rafId = requestAnimationFrame(step); else if (onDone) onDone();
    })(t0);
  }
  function enter(s){ const src=s.dataset.bgm, vol=parseFloat(s.dataset.bgmVol||'0.3');
    if (audio.dataset.src!==src){audio.src=src;audio.dataset.src=src;}
    current=s; audio.volume=0; audio.play().then(()=>fadeTo(vol,2200)).catch(()=>{}); }
  function leave(s){ if(current!==s) return; current=null;
    fadeTo(0,1600,()=>{audio.pause();audio.currentTime=0;}); }
  new IntersectionObserver((es)=>es.forEach((en)=>en.isIntersecting?enter(en.target):leave(en.target)),
    {threshold:0.5}).observe; bgmSlides.forEach((s)=>new IntersectionObserver((es)=>es.forEach((en)=>en.isIntersecting?enter(en.target):leave(en.target)),{threshold:0.5}).observe(s));
})();
```
(Clean the observer wiring when you paste — one shared IO observing all `bgmSlides` is fine.)

**reveal.js variant** — there's no scroll/IO; use slide events instead:
```js
Reveal.on('slidechanged', (e) => {
  const vol = parseFloat(e.currentSlide.dataset.bgmVol || '0');
  const src = e.currentSlide.dataset.bgm;
  if (src) { /* enter: set src if changed, fade in to vol */ }
  else     { /* leave: fade out + pause */ }
});
```
Same `fadeTo`/smoothstep helper; just the enter/leave trigger comes from `slidechanged`
(and `Reveal.on('ready')` for the first slide) instead of an IntersectionObserver.

## Must-include caveats (these bite people)
- **Autoplay:** audio with sound needs user activation. Mid-deck the page already has it from
  prior key presses, so `play()` works; the `.catch()` covers a cold deep-link. (Muted media
  autoplays anywhere, but muted defeats the point for music.)
- **Venue PA:** the laptop's audio output must be routed to the room PA or the audience hears
  nothing. AV/cabling check, unrelated to code — tell the presenter every time.
- **Sourcing/rights:** Pixabay (free, no attribution) but it blocks automated download — user
  clicks Download themselves. YouTube Audio Library is safest if the talk is uploaded. Musopen
  for public-domain *recordings* (compositions being PD isn't enough — recordings are
  copyrighted). Copyrighted film themes are fine live but risk Content-ID muting if posted.

## After applying
- Bump the marketer plugin version (slide-design lives in the solopreneur marketplace package).
- Run `/sync-skills-all` so `~/Agents/skills/_all/` picks up the change for the other agents.
- Cross-link: in slide-design's recipe, note that the deck-framework-specific `data-bgm`
  implementation + a CDP verification harness live in the `hana-slides` skill.
