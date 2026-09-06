# Pass 3 — Active Theory–tier motion, inside a hard performance budget

## Context

The descent reads as a competent scroll site. It should read as a studio that can
build things other people cannot — because that claim is the product. Pass 3 buys
that with motion physics, shader depth and HUD precision, and changes no copy, no
structure and no conversion flow.

The constraint that shapes everything: **two of the three hard budgets are already
missed today, before any of this work.** Median of three Lighthouse mobile runs
against `northbound-dev.com`:

| | today | target |
|---|---|---|
| Performance | 96 | ≥ 95 |
| **LCP** | **2.57s** | **< 1.2s** |
| **CLS** | **0.027** | **0** |
| TBT | 59ms | — |
| JS (gzipped) | 148.2 KB | < 250 KB |

The cause is architectural, not incidental: the descent is entirely client-rendered,
so nothing paints until React (46KB) + `support.js` (19KB) + `_ds_bundle.js` (81KB)
have parsed and run. Every phase below *spends* budget. None of them earn any back.
So Phase 0 comes first — otherwise Phase 1 ships already in violation and, by the
brief's own rule, would have to be reverted the moment it lands.

Byte headroom is 101.8 KB. The plan spends roughly 55 KB of it.

---

## What is already here, and gets reused rather than rebuilt

Pass 1 left most of the machinery this brief asks for:

- **A global rAF loop already exists** (`index.html`, `this.tick`) driving
  `drawSpine` / `drawLogo` / `drawWave` / `drawSpeed` / `measureBuddy`, with a
  fault guard that disables a faulting measurement rather than killing the loop.
  Phase 1 adds the spring integrator to this loop; it does not build a second one.
- **Live readouts exist**: `loadSeconds()` (real navigation timing), `spotsLine()`
  (from `js/site-config.js`), `floorReadout`. Phase 3's HUD wires to these — no
  new sources, nothing hardcoded.
- **A boot shell exists** (`#nb-boot`) painting the brand before React. Phase 0
  grows it into a real pre-rendered hero instead of replacing it.
- **The motion surface is small**: 10 `transition:` declarations and 2 `@keyframes`
  in the whole file. Phase 1's audit is an afternoon, not a rewrite.
- Direct-to-node writes are the established pattern here (the Floor 02 tilt, the
  speed bars) precisely because a `setState` per frame re-renders the descent at
  60fps. All spring output follows it.

---

## Three places the brief collides with what is on the ground

These are handled as described below, not silently reinterpreted:

1. **"Smooth scroll with inertia between floors"** reopens a bug you diagnosed
   yourself. Pass 1 removed the JS wheel handler *because* it handed off between
   native scroll and a snap animation, and trackpad inertia kept firing mid-flight
   so the two fought. CSS `scroll-snap` replaced it and is what makes the descent
   land square on every floor today.
   **Approach:** keep CSS snap as the transport. Get the elevator feel from Phase 4
   instead — a spring settle/overshoot applied to the floor's *content transform*
   on arrival, which is the part that reads as physical, without JS re-taking the
   scroll. If it genuinely is not enough, that is a deliberate second conversation.

2. **"Displacement/ripple shader on case-card previews"** cannot be done as
   written. Those previews are live `<iframe>`s; their pixels are not readable
   into a WebGL texture at any origin.
   **Approach:** the shader runs on the card's **poster** — a ripple on hover that
   dissolves into the iframe once it loads. Identical to the eye, possible in fact.

3. **"Remove every transition on interactive elements"** must spare one: the
   `#nb-boot` fade. It is the failsafe that stops a failed boot leaving a
   full-screen shell over the page.

---

## Phase 0 — earn the budget back

The prerequisite. No visible motion change; the numbers move instead.

- **Pre-render Floor 01.** The hero's markup is static — headline, lede, both CTAs,
  trust strip — but today it exists only inside the DC template and cannot paint
  until the whole runtime boots. Emit it as real HTML inside `#nb-boot` so it is
  the LCP element and paints on the first frame. The React render then mounts
  *over* identical markup, so the swap is invisible and shifts nothing.
- **Kill the 0.027 CLS.** Reserve the boot shell's exact box, and give the fonts a
  `size-adjust` fallback so the swap does not reflow the headline.
- Defer `_ds_bundle.js` behind the hero paint; it is 81KB of components none of
  which the first screen needs.

**Gate:** LCP < 1.2s, CLS 0, perf ≥ 95. If pre-rendering cannot get under 1.2s,
say so with the number rather than proceeding into a budget that cannot hold.

## Phase 1 — motion physics

- A `spring(current, target, velocity, stiffness, damping)` integrator and a
  `lerp`, both stepped by the **existing** `tick` with a fixed timestep so
  behaviour does not change with frame rate.
- Registry of animated properties written straight to nodes each frame. Nav,
  cards, Buddy, form, floor content all read from it.
- Replace the 10 transitions and 2 keyframes (except `#nb-boot`). Hover and press
  on cards and CTAs get real overshoot — springs, not ease-out.
- Cursor: global x/y + velocity published as `--cx`, `--cy`, `--cv` on `:root`
  (written once per frame, not per event) and held for Phase 2's uniform. Cards,
  borders and Buddy's tilt react to proximity.
- Floor readout and progress derive from scroll position, which they already do.

**Cost:** ~0 KB. **Gate:** 60fps at 4× CPU throttle; reduced-motion path identical.

## Phase 2 — shader depth

- Full-viewport OGL background: dark grid/noise responding to cursor and scroll.
  **Loaded after the hero paints**, so it cannot touch LCP. Pauses on
  `visibilitychange`. No WebGL → the existing CSS radial gradient stays, which is
  already the fallback the page ships.
- Film grain + very light chromatic aberration as a post pass **on the canvas
  only** — texture, not effect.
- Ripple on the case-card poster (see collision 2 above).
- **Floor 03 becomes a real instrument**: needle/bar driven by the same
  `loadSeconds()` the count-up already uses, against the 3.8s agency bar.

**Cost:** ~20 KB (OGL, tree-shaken). **Gate:** the LCP element must not change.

## Phase 3 — HUD precision

- Put the layout on an 8px grid; audit spacing at 390 / 768 / 1280 / 1512.
- Monospace HUD under the wordmark: `STATUS` ← `spotsLine()`, `LOADED` ←
  `loadSeconds()`, `RENDER` ← FPS measured in the tick, `FLOOR` ← current floor.
  All four are live values that already exist. Nothing fake.
- Corner brackets on cards, crosshair near interactive elements, hairline dividers
  with metadata tags per floor.
- Tighter display tracking, `font-variant-numeric: tabular-nums` on every readout,
  optical alignment on the hero.

**Cost:** ~0 KB. **Watch:** the HUD is new text in the header — it must not become
the LCP element or reintroduce shift.

## Phase 4 — reactive state

- Hovering a case card shifts the background light source, nudges its neighbours,
  and changes Buddy's expression — all through the Phase 1 registry.
- Floor arrival: spring settle/overshoot on the floor content, readout ticks,
  optional audio cue behind the **existing** sound toggle, default off.
- Form success/error animate through the same spring system.

**Cost:** GSAP + ScrollTrigger (~35 KB) **only if** the hand-rolled springs prove
insufficient for the orchestration. Prefer shipping without it.

---

## Files

Almost all of this is `index.html` — the descent is one file plus `js/site-config.js`
and the `_ds` bundle. New: `js/motion.js` (spring integrator, registry, cursor) and
`js/field.js` (OGL background), both deferred. `js/site-config.js` gains nothing;
it stays the operator's file.

The three demos under `demos/` are out of scope and must not regress — Atlas is at
perf 100 and its numbers are published on Floor 02.

## Verification, after every phase

- Lighthouse mobile ×3 on the **deployed** URL, median recorded: perf ≥ 95, CLS 0,
  LCP < 1.2s. A phase that breaks the budget gets reverted, and the number is
  reported either way rather than rounded.
- FPS sampled in-page at 4× CPU throttle on a 390×844 viewport; 60fps sustained.
- `prefers-reduced-motion`: all motion off, layout byte-identical. The Pass 1
  suite (`tests/descent.spec.ts`, `tests/snap.spec.ts`) must stay green — snap
  assertions run in real headed Chrome because headless does not run the snap
  engine at all.
- Real iPhone Safari and low-end Android Chrome pass before a phase is called done.

## Out of scope

Copy, structure, conversion flow. The demos. Vector's Stripe wiring, which is
still waiting on a `sk_test_` key.
