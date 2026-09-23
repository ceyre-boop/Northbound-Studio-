# buddy-alive-v1 — Buddy as a character, in the canvas

> **Target changed 2026-09-23: the homepage, not studio.html.** Colin: "when am
> I gonna see buddy on the main page." So he is built on `index.html`, the plain
> page now live at northbound-dev.com, and becomes the one lavish thing on an
> otherwise quiet page — which is what the brief described all along.
>
> What that costs, stated plainly: the homepage today has **zero `<script>`
> tags** and that is why it is bulletproof. Buddy adds a canvas, a WebGL
> context and a render loop to it. The mitigations are non-negotiable: he is
> **desktop-only** (suppressed under 640px, so every phone visitor gets exactly
> the page that is live now), he **loads after first paint** so LCP is
> untouched, and the page must still read, sell and submit completely with
> JavaScript off. The panel hooks the brief names do not exist here; his
> reactions come from the page's own events instead — the package cards and the
> Buy button.

## Context

Buddy reads as a pasted image because he *is* one: three raster photographs of
a render (`buddy-thinking-sm` / `salute-sm` / `awesome-320w`), cross-faded in
DOM over the canvas, with a 5.2s CSS bob and a 24-step whole-body lean. A
photograph cannot breathe, cannot lag an antenna, cannot turn its head, and
can never be occluded by a panel it passes, because it is a sibling *over* the
canvas, not a thing *in* the scene.

You chose real 3D in the canvas, so he stops being a picture and becomes
geometry the scene lights and the panels can pass in front of.

Three findings from the code that shape this:

- **There is no wave.** `git grep -i wave` returns nothing. "Salute" is one
  static frame held 900ms. The wave gets built, not reused.
- **His art is already failing a gate.** Slow-4G LCP measured **1248ms against
  a 1200ms limit** (`data/perf-budget.json`), and `js/hero-tag.js`'s own
  comments record dropping a 1200w frame because it cost 132KB of hero
  bandwidth. `brand/buddy-spray-900w.webp` is **334KB** and still in a live
  srcset. This task must leave the page lighter, not heavier.
- **`contain: layout` on his container is load-bearing.** An overflowing
  descendant changes `documentElement.scrollHeight`, which the Stage divides by
  for page progress — one uncontained Buddy silently rescales every act's
  scroll window (`css/mascot.css:53-58`, `css/stage.css:530-533`).

## Step 0 — finish and ship the homepage swap (this is blocking)

`home-swap-v1` is committed and rebased but unverified, because plan mode
stopped its builder mid-run and two Playwright runs collided on one server.

1. Kill the stray runs (PIDs 53113, 29208, 29204, 30136, 30116 and their eight
   headless Chromes), free :8099, then one clean `bunx playwright test`.
2. The manual walk: home → Buy it now → checkout → both add-ons (**$1,249.00**)
   → Place order → order-received, screenshotted at 390 and 1280 and looked at.
3. Unit-test `api/checkout.ts` pricing and honeypot against a mocked `fetch`.
4. Merge, `bun run ship`, confirm live: plain page at `/`, WebGL site at
   `/studio.html`, perf section still true (it now measures studio.html).

Then branch `buddy-alive-v1` from the shipped `main`.

## The medium, precisely

**Procedural geometry, hand-written, no model file and no loader** — Buddy
assembled from primitives (head, visor, torso, hips, upper/fore arms, hands,
legs, antenna) as indexed meshes built at init, in the offerings act's own
canvas. Not a sculpted `.glb`: a rigged model plus a glTF loader and skinning
is hundreds of KB and a multi-day build, on a page whose load gate is already
red, in a task budgeted at +30KB. Procedural costs a few KB, is riggable to the
joint, and every part of the rig interface stays identical if you later want a
sculpted mesh dropped in behind it. That swap is a later push, not this one.

He will read as a stylised, faceted version of the blue robot rather than the
photoreal render. That is the honest trade and it is worth naming before I build.

## The work

**In the scene.** New `js/offerings/buddy3d.js`, drawn from
`js/acts/offerings.js`'s `draw()` — interleaved into the wall's back-to-front
panel order at his own depth, so a panel in front of him **occludes him** and
one behind does not. Parallax falls out of the same depth: he moves at his own
rate against the backdrop. A projected contact shadow onto the backdrop plane
replaces `css/mascot.css`'s faked gradient ellipse.

**Lit by the scene, not by a filter.** He samples the same cursor-driven point
light the glass uses (`js/gl/offering-material.js:215-217`,
`toLight = normalize(vec3(u_cursorPx - v_worldPos, 140.0))`), the same Fresnel
rim and the same ambient, so his light and the panels' light are one light.

**Alive at rest.** A small transform hierarchy driven by `js/springs.js`
presets: breathing on the torso, weight shifts through the hips, the antenna
lagging the head by a beat, and a head that turns toward the cursor through a
spring with a hard clamp — he looks, he never locks on. The wave is built as a
rig animation and fired on a **random 12–25s interval**, suppressed while the
tab is hidden, while scrolling, and immediately after any other Buddy motion.
The four hooks (`onPanelHover/Focus/Open/Throw`) get small acknowledgements —
a glance, a shoulder turn, a brace on throw — never a performance. Note the
hooks carry only an index; richer reactions read `__NB_WALL` state, which the
act already passes to `update()`.

**Lighter than we found it.** The DOM mascot and its three `<img>` go away with
`js/offerings/mascot.js` and most of `css/mascot.css`. The 334KB
`buddy-spray-900w` srcset entry goes, along with the orphan rasters
(`buddy-awesome-sm`, `-720w`, `buddy-awesome.webp`, `brand/buddy-tagger.svg`,
~108KB). The geometry loads at idle after first paint, so it is never on the
LCP path. Target: slow-4G LCP back **under 1200ms**, which also clears the gate
that is red today.

**Discipline.** Nothing else on the page gains motion. Desktop only: suppressed
under 640px, which also fixes today's asymmetry (the hero Buddy is suppressed;
the offerings mascot is merely shrunk). The stage contract holds — `update()`
stays CPU-only with zero `gl.*`, `draw()` restores GL state exactly and passes
`?strict=1`, and there is still exactly one rAF on the page.

## Verification

- `bun run test` green apart from the known staleness failure until ship.
- New `tests/buddy.spec.ts`: idle never settles to a fixed transform; head turn
  stays inside its clamp; the wave fires on a random interval and is suppressed
  while hidden and while scrolling; each hook produces a distinct response; a
  panel passing in front actually occludes him (pixel probe); absent under
  640px; reduced motion composes a still frame; CLS stays 0; `?strict=1` clean.
- `PERF_URL=<preview>/studio.html bun scripts/perf.mjs` before and after, with
  the gates table in the report — slow-4G LCP must come back under 1200ms.
- **A 15-second recording** of Buddy at rest, cursor moving nearby, one wave
  firing — converted to mp4 — plus the preview URL.

## Guardrails

- +30KB gzipped JS for the whole task; the page must end lighter overall.
- 60fps at 4× CPU, CLS exactly 0, no sideways scroll at 390px, reduced motion
  composes a still.
- Not in this push: the large set-piece animation.

## Also open

- `salvage-v1` (support exchange) — built, tested, previewed, unmerged.
- Stripe terms unaccepted, so checkout captures orders rather than charging.
