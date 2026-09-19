# motion-polish-v1 — scroll feel, entrances, hover weight

## Context

The site is live and correct after polish-v1. It still feels cheap in motion:
native scroll, opacity fades, flat hovers, and a page that just appears. This
pass adds the motion layer (Lenis scroll, spring entrances, weighted hovers, a
page entry) with no new sections and no new WebGL acts. Budget: **+40 KB gzipped
JS maximum**, measured before and after.

What exploration found, which shapes the plan:
- **polish-v1 is not shipped yet.** Its last test run and the review were still
  running when plan mode started. It goes out first (step 0), and
  motion-polish-v1 branches from the shipped `main`.
- **Item 2 is mostly true already.** `js/stage/stage.js` imports acts II–IV
  lazily at a 1.2-screen scroll margin (`WARM_SCREENS`), draws only live acts,
  and tears down cold ones. Only Northlight is eager. I measure before touching
  anything and report what is actually compiling before first paint.
- **Two things you referenced don't exist on this lineage.** The sticky "Get a
  quote" button and the package CTAs were in sellable-v1 only. I port both (markup
  plus the prefill/submit parts of sellable-v1's `js/quote.js`) because items 4d/4e
  depend on them. They're UI elements, not new sections. Say so if you want them
  left out.
- **The magnetic CTAs** are in history, not on main: `js/interact.js` at `1bc3cb1`
  (8.6 KB raw). I port them onto the current `NB_MOTION` spring API.
- `js/motion.js` already owns the page's single rAF loop and the spring
  integrator (k, d, fixed 120 Hz sub-steps; no mass yet). The existing reveal is
  an IntersectionObserver plus CSS opacity transitions (`stage.css:186-211`,
  driven from `js/panels.js`). It gets replaced.

## Step 0 — ship polish-v1 (already requested)

Wait for the final test run and the review. Fix any blocker. Merge `polish-v1` →
`main`, push, `bun run ship`. Then confirm on **northbound-dev.com** (headless
Chrome, not the preview) that the perf section renders real numbers and both
JSON codeCommits match. Report that before starting motion work.

## Step 1 — baseline (before any motion code)

`git checkout -b motion-polish-v1` from shipped `main`. Extend `scripts/perf.mjs`
with two **reported** metrics (not gates) and commit them alone first, so before
and after use the same harness:
- **TTI**: FCP, then the start of the first 5 s window with no long task, at 4×
  CPU, 390×844, regular 4G (PerformanceObserver `longtask` plus `paint`).
- **Long tasks during a full-page scroll**: count and total ms while a scripted
  wheel scroll runs from hero to contact at 4× CPU.
- Also log **which WebGL programs compile before first paint** (init script
  wraps `gl.linkProgram`, timestamped against FCP).
Run it against the local gzip server and save the table as the "before" numbers.

## Step 2 — one spring config

`js/springs.js` is the only place numbers live. It holds a few named presets,
each with `{ stiffness, damping, mass }`: `settle` (entrances), `lift` (cards),
`press`, `magnet`, `ui` (labels, sticky, form states).
- `js/motion.js`: the integrator gains mass (`a = f / m`). `spring()` takes a
  preset name instead of raw k/d. Existing callers are migrated to presets.
- CSS gets the same springs. At boot, each preset is sampled into a CSS
  `linear()` easing plus its settle duration and set as `--spring-<name>` /
  `--spring-<name>-ms` on `:root`. CSS transitions (underlines, labels) then run
  the same physics with no per-frame JS. Fallback is a `cubic-bezier`.
- The offerings rail's drag and throw physics is a simulation with its own model
  and stays as is. Every other DOM spring comes from this file.

## Step 3 — scroll feel (Lenis)

- `bun add lenis`, vendor `node_modules/lenis/dist/lenis.mjs` →
  `js/vendor/lenis.mjs` (no build step, no CDN). About 4–5 KB gzipped.
- `js/scroll.js` (module) constructs Lenis with `autoRaf: false`, `smoothWheel`,
  lerp-weighted inertia, **no snap**, and `syncTouch: false` so phones keep
  native touch scroll (no scroll-jacking).
- One loop: `motion.js` gets a pre-frame hook, and Lenis's `raf(now)` runs there
  before the stage and springs read `scrollY` in the same frame. No second rAF.
- `prefers-reduced-motion`: Lenis is never constructed.
- Keyboard scrolling stays native. Anchor links go through `lenis.scrollTo`,
  then focus moves to the target, so the skip link still lands focus. Remove
  `html { scroll-behavior: smooth }` while Lenis runs (the two conflict).
- `.offer-pin` (sticky) and the stage's scroll windows keep working because
  Lenis still scrolls the real window.

## Step 4 — load cost

Measure first, then act on what the data shows:
- The warm trigger for acts II–IV becomes an **IntersectionObserver per act
  section, `rootMargin` one viewport**, replacing the scroll-progress margin for
  import and compile. Scroll windows still decide live and draw.
- Verify that an off-screen act does zero per-frame work (no draw, no uniform
  writes, no FBO ping-pong). Anything that still ticks gets gated.
- Report TTI before and after, and which programs compile before first paint.

## Step 5 — entrances (`js/entrance.js`, replaces the panels.js reveal)

- **Scroll-linked:** each block's progress is how far its top has entered the
  viewport (about a third of a screen from 0 to 1). It **latches at its
  maximum**, so scroll-back never re-triggers. The latched value is the spring
  target, using the `settle` preset.
- **Headings:** split into words, each wrapped in a line mask. Words rise out of
  the mask with a small upward overshoot, staggered along one shared delay curve
  expressed in scroll distance, not time. Screen readers still read one heading.
- **Body copy** follows a beat behind its heading on the same curve.
- **Package cards, rules, and the no-GL offer list** stagger along the same
  curve, never all at once. Each gets its own overshoot from the preset's
  natural response, not hand-tuned numbers. The GL rail keeps its own procession.
- **Nothing fades:** transforms and masks only, no opacity-only reveals.
- **CLS stays 0:** only elements off-screen at setup are primed, as today.
  Anything visible at first paint is left untouched.

## Step 6 — hover and UI motion (`js/interact.js`, ported and extended)

- **Package cards:** a lift spring; a light that follows the cursor across the
  card face (`--mx/--my` smoothed through a spring, drawn as a radial gradient);
  and the border brightens with cursor **proximity** before the pointer enters
  (`--near` from `NB_MOTION.cursor` against the card rects, computed only while
  the cards are on screen).
- **Nav and inline links:** the underline draws from whichever side the pointer
  entered (`transform-origin` set on `pointerenter`), timed with the `ui`
  spring's `linear()`.
- **Magnetic spring** on `.btn`, the package CTAs, the sticky CTA and the form
  submit.
- **Form:** labels move on focus with the `ui` spring. Submit goes through fetch
  (JS path; the no-JS native post still works). Error and success states animate
  through the same springs: invalid fields get a spring nudge plus an inline
  message, and success replaces the form with a settling confirmation.
- **Sticky "Get a quote"** (ported): scales and settles whenever scroll direction
  flips. Hidden while `#contact` is on screen.
- **Touch:** every hover effect has a press equivalent (`pointerdown` press
  spring; the card light sits at the touch point while pressed). Nothing is
  hover-only.

## Step 7 — page entry

- Headline and Northlight resolve together over about 600 ms. **The text paints
  first, fully visible and in place (LCP unaffected).** The entry animates only
  a small settle (transform and letter-spacing) after first paint, with no masks
  on the hero. Northlight ramps its existing `u_alpha` from about 0.35 to 1 over
  the same spring. Everything below follows on the stagger curve.
- **Desktop keeps Buddy.** The tag sequence already *is* the headline's entry
  there (he paints it on), so on desktop the settle applies to Northlight, the
  lede and the CTAs, and Buddy's paint stays the headline's entrance. On phones
  (no Buddy) the headline gets the 600 ms settle.
- Reduced motion: no entry. Everything is final at first paint.

## Guardrails

- Gates unchanged: CLS 0, 60 fps at 4× CPU, no sideways scroll at 390 px, all
  three fallbacks clean, Buddy suppressed under 640 px.
- Budget: JS gzipped delta ≤ 40 KB (`jsBytes` from perf.mjs, before vs after).
  Anything that costs more than it adds gets cut, and I'll list what was cut.
- `js/motion.js` stays the single rAF. Springs sleep when settled: no per-frame
  writes for anything at rest.

## Tests

Existing suites stay green. New `tests/motion.spec.ts`:
- Exactly one rAF chain; Lenis absent under reduced motion.
- Anchor, skip link and keyboard scroll still work.
- Entrances latch, with no re-trigger on scroll-back.
- No opacity-only reveals.
- The hero headline is visible at first paint.
- Every hover has a press equivalent.
- Springs only come from the preset names in `js/springs.js`: a grep guard for
  raw stiffness or damping literals outside it.
- The sticky CTA and package CTAs prefill the form.
- The 390 px overflow check.

## Ship and deliver

- Builder implements in steps 1→7 with a commit per step; a reviewer checks the
  diff. Push the branch, `vercel deploy` → **preview URL** (you merge).
- **Before/after perf table:** LCP ×2, CLS, fps median/min, **TTI**, **long
  tasks during full-page scroll**, programs compiled before first paint, and JS
  gzipped bytes with the delta. Same harness, same machine, `main` vs branch.
- **10-second recording:** Playwright `recordVideo` at 1280×800 with
  `?motion=full`, a real wheel-driven scroll from hero to contact (so Lenis
  inertia shows), converted to mp4 with ffmpeg. Plus a 390 px still.
