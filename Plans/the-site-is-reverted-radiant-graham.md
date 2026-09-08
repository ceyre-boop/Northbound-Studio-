# TASK 1 — THE HERO (branch `hero-v2`)

## Context

`main` was force-reset to `6cf0a1b` to escape a redesign pass that had layered a
template-flavoured build over the site. The reset was correct, but it also
removed good primitives written during that pass — they survive on
`broken-main-20260907`, `redesign`, and the agent worktrees, and this task pulls
back the four that are worth keeping.

The site today is the pre-layer "descent" build: a spiral canvas background, a
`FLOOR 01 · ARRIVAL` eyebrow, a `Scroll ↓` prompt, and HUD corner brackets
around the hero art. This task replaces the hero's visual centre with one
signature GPU moment and retires the floor-conceit furniture.

The reference bar is already measured in this repo — activetheory.net at
**LCP 0.20s / CLS 0.000 / 708 KB JS**, against northbound-dev.com at
**0.52s (4G) / 1.14s (slow 4G) / CLS 0.000 / 150 KB**.

### Decisions taken during planning

- **The spiral is deleted outright.** The new shader becomes the sitewide
  background layer, fading down past the hero. Whole-page change, deliberate.
- **Only the HudFrame corner brackets count as "the HUD block."** Floor readout,
  waveform, progress bar and nav arrows stay.
- **The affordability probe is re-scoped.** The salvaged `canAffordField()`
  returns `false` for `(pointer: coarse)` — every phone — and originally meant
  "render nothing." The brief forbids falling back to the gradient, so its
  verdict now selects the *cheapest tier of the same design*, not *off*.

## Standing rules adopted this task

1. Never commit to `main`. Branch off `main`, ship a preview URL, merge is yours.
2. No browser automation. Lighthouse CLI + Playwright only.
3. One section per task.
4. A 10-line design intent before code, for the record, not for approval.
5. Any library over 60 KB gzipped stops the task and gets reported.

**Rule 3 needs translating.** There are no per-section files: `index.html` is
1035 lines holding all markup, all page CSS, and the whole component class
inline. "Scope" means *named line anchors plus new `js/` modules*.

**Rule 2 has one gap.** Lighthouse cannot measure sustained FPS under CPU
throttle, so it cannot verify "60fps at 4× CPU" at all. The plan restores
`scripts/perf.mjs` (real CDP throttling, already written and gate-complete)
alongside Lighthouse. Both are headless CLI runs — rule 2 holds.

**Rule 5 does not bind.** Raw WebGL1, zero libraries. Total new code ≈ 29 KB
raw / ≈ 9 KB gzipped.

## Design intent (10 lines) — NORTHLIGHT

1. The studio is *Northbound*, the site is *The Descent*, the accent is `#00F0FF`.
   The image is **an aurora curtain seen from inside it**.
2. Vertical filaments of cyan light hanging in a dark shaft, that the visitor
   falls through as they descend the seven floors.
3. It restates the spiral's metaphor as a material: the spiral was a drawn
   object *on* the page; Northlight is the volume the page is *inside*.
4. At rest it is barely nameable — depth in peripheral vision, nothing that
   competes with the headline.
5. Two verbs only. The cursor bends it like a lens. Fast scroll smears it into
   vertical streaks — motion blur out an elevator window.
6. Every reactive term is a displacement of the domain, never an added sprite.
7. Tech: raw WebGL1, one fullscreen triangle, one draw call, custom GLSL,
   no FBO, no ping-pong, no second pass, **zero libraries**.
8. Two hard luminance guards: a global `LUMA_CAP = 0.16` and a soft elliptical
   well tracking the measured text box. Legibility is a shader constant.
9. Degradation drops curtain sheets, colour-separation evals and raster scale —
   the same image, softer. No gradient path exists in the code.
10. Headline enters as a split-character reveal on the global rAF clock; both
    CTAs get the magnetic spring; Buddy stays docked as today.

## The shader

`js/gl/northlight-shaders.js` (sources as JS strings with a `%DEFINES%`
placeholder, matching the `atomizer-shaders.js` convention) + `js/northlight.js`
(the host).

Canvas is created in JS and appended to `document.body` —
`position:fixed; inset:0; z-index:1; pointer-events:none; aria-hidden` — the
slot the spiral vacates. Appending to `body` rather than the wrapper keeps it
out of every `[data-floor]` subtree, which is what stops `perf.mjs`'s overflow
sweep (`img, canvas, h1, h2, p`) from ever seeing it.

| Uniform | Source |
|---|---|
| `u_res`, `u_time` | drawing buffer, accumulated `dt` |
| `u_cursor`, `u_cursorSpeed` | `NB_MOTION.cursor` (smoothed, already clamped) |
| `u_energy` | scroll velocity, **asymmetric** smoothing — attack `dt*9`, release `dt*2.5` |
| `u_page`, `u_scroll`, `u_floor` | hero fade, document parallax, per-floor seed |
| `u_safe` | measured text box, `vec4(cx,cy,rx,ry)` |
| `u_luma` | constant `0.16` |

Symmetric smoothing on `u_energy` is what makes scroll-reactive shaders feel
laggy; the asymmetry is the reason a flick reads as a flick.

Fragment order: fall through the curtain (`q.y += u_scroll*0.85`); bend the
domain toward the cursor by `1/(1+dot(dc,dc)*9)`; compress `q.y` by
`mix(1.0,0.42,u_energy)` so filaments stretch into streaks; add the curtain's
own lateral hang; accumulate `LAYERS` sheets of fbm filaments at increasing
depth; tint; grain; clamp.

The `env` term does real design work — it places peak luminance in a band
*below and behind* the headline, so the composition's brightest mass is never
coincident with its densest text.

Chromatic aberration uses the proven `js/field.js` technique: evaluate the same
brightness function 2–3× at a quadratic-in-`p` offset, never multiple passes.

### Degradation ladder — same curtain, fewer sheets

`LAYERS` / `CHROMA` / `OCTAVES` are `#define`s prepended at `buildProgram()`
time. **Tier is compile-time, decided once per session** — a mid-session
recompile stalls the GL pipeline and is visible.

| knob | high | mid | low | probe-fail |
|---|---|---|---|---|
| `LAYERS` | 3 | 2 | 1 | 1 |
| `CHROMA` | 3 | 2 | 1 | 1 |
| `OCTAVES` | 3 | 2 | 2 | 2 |
| raster × dpr | 1.0 | 0.75 | 0.60 | 0.50 |
| grain | on | on | off | off |
| cursor lens | full | full | off | off |
| draw cadence | 1 | 1 | 1 | every 2nd frame |

Tier from `NB_GL.deviceTier()` verbatim, including its documented
`innerWidth`-not-`min(w,h)` fix. Runtime adaptation on top: field.js's
`SLOW_FRAME_MS 22 / SLOW_STREAK 30 / MIN_SCALE 0.5`, plus an `NB_MOTION.fps`
ladder. **Layers are never dropped at runtime** — that would visibly change the
composition mid-session.

Only two things stand the canvas down entirely: `NB_MOTION.reduced` (render one
static frame at `t=0`, redraw on resize, never enter the loop) and a failed
`getContext('webgl')`. That second case is the single exception to "never the
gradient" — the `z-index:0` radial div at `:170` stays in the DOM precisely so
`perf.mjs`'s `fallbackWebgl` gate lands on today's background, not flat black.

### Fading past the hero

`presence = mix(1.0, 0.26, smoothstep(0.15,1.0,u_page))`, and the luma ceiling
tightens to `0.088` alongside it. The floor is deliberately not zero: removing
the spiral takes away the only depth cue floors 02–07 have, and dead-flat
`#060608` below the fold would be a visible downgrade.

## Files

### Salvaged verbatim

| Destination | Source |
|---|---|
| `js/motion.js` | `git show redesign:js/motion.js` (167 lines, self-driving) |
| `js/interact.js` | `git show worktree-agent-a39635ce8e8f36126:js/interact.js` (222) |
| `js/gl/gl-core.js` | `git show redesign:js/gl/gl-core.js` (82) |
| `scripts/perf.mjs`, `tests/perf.spec.ts` | `git show worktree-agent-a5a8c337312b68c73:` (364 + 103) |
| `js/gl/afford.js` | `canAffordField()` + `safe()` hand-lifted from `broken-main-20260907:index.html:577` |

### New

`js/gl/northlight-shaders.js`, `js/northlight.js`, `js/reveal.js`,
`tests/hero.spec.ts`.

`js/hero.js`, `js/helix.js`, `js/app.js`, `js/cursor.js`, `js/animations.js`,
`js/form.js`, `js/templates.js` are all dead — `index.html` loads only
`site-config.js`, `motion.js`, `support.js`. Leave them; do not reuse the
`js/hero.js` filename.

### `index.html` edits — every anchor

| Line(s) | Action |
|---|---|
| `46`, `92` | delete boot-shell eyebrow CSS rule and element |
| `169` | delete spiral `<canvas ref="{{ spineRef }}">` |
| `170`, `171` | **keep** — WebGL-off floor colour, sitewide grain |
| `230` | delete `FLOOR 01 · ARRIVAL` Eyebrow |
| `237-240` | delete the **whole wrapper div**, not just children, so no empty 34px-margin box remains |
| `243` / `248` | replace `HudFrame` with `<div style="position:relative; min-width:0; width:100%">` — verified zero-layout-change |
| `474` | `[this.spine, this.logo, this.wave]` → `[this.logo, this.wave]` |
| `543` | delete `this.drawSpine(t);` |
| `559-563` | delete `driveMotion`'s `this.cue` branch |
| `661-716` | delete `drawSpine()` |
| `965`, `990` | delete `spineRef`, `bracketOpacity` |
| `30-32` | replace script tags (below) |
| `526-531` | `NB_REVEAL.arm()` before `boot.classList.add('gone')` |
| `231-236` | add refs + CTA wrapper spans; **text unchanged** |

**Untouched:** headline, subhead, both CTA labels, Buddy image and dock, floor
readout, waveform, progress bar, nav arrows, floors 2–7, contact form.

Script tags, all `defer`, order load-bearing, all ahead of `support.js`:
`site-config → motion → gl/gl-core → gl/afford → gl/northlight-shaders →
northlight → interact → reveal → support`. **Add no new `<link rel=preload>`** —
the list at `:22-29` was tuned to win LCP and new entries would compete.

## The three findings that reshape the work

**1. The salvaged `motion.js` would fake the gate.** Its handshake is
`if (arguments.length && now !== undefined && !selfRaf) externallyDriven = true`
— but `selfRaf` is non-zero the whole time the self-loop runs, so an external
caller can never latch it. Dropped in as-is, `index.html:541` calls `M.step()`
*and* the internal loop calls `rawStep()`: every spring integrates twice and
`M.fps` reports ~120. That is the exact value `perf.mjs` reads, so
`fpsMedian >= 60` would **pass fraudulently**. Fix: add `M.claim()` (sets
`externallyDriven`, stops the internal loop), call it in `componentDidMount`
before the first `requestAnimationFrame`, call `M.start()` on unmount. Self-drive
is kept deliberately — it covers the pre-mount window and the 2500ms failsafe
path where the component never mounts.

**2. DS `Button` sets its own `transform`.** `_ds_bundle.js:18-80` — a bare React
element with inline `transform: var(--lift)` on hover and a `transform`
transition. A per-frame spring write to that node gets clobbered on re-render.
Fix: `interact.js` never touches the DS node; it transforms a wrapper
`<span data-nb-cta>`, and the DS node gets
`ctaFlat = { transform:'none', transition:'box-shadow .25s, background .25s, border-color .25s, color .25s' }`
— the `style` prop spreads last, so this reliably wins. Spring owns transform,
DS owns colour.

**3. Selector scope is load-bearing.** Do **not** reuse broken-main's
`magnetic: '.nb-open, a[href^="#floor"]'` — it matches the header Work/Contact
links and `.nb-case` children, which the descent tilt test asserts on. Scope to
`#floor-1 [data-nb-cta]`. `[data-nav]` is excluded on purpose: those arrows carry
React-managed styles and the disabled one is `pointer-events:none`, so a
magnetic lean on a dead arrow would look broken.

## The CLS contract

The boot shell at `:86-105` is the LCP element and exists so nothing shifts on
hydration. `cls` gates at **exactly 0**.

- Both shells lose the eyebrow, so their rects still coincide. Removing the
  eyebrow and cue shortens the left column ~90px, but `#floor-1` is
  `min-height:100vh` with `align-items:center` and the column was well under
  800px — **section height is unchanged**, the column just re-centres.
- The reveal must not alter the h1's layout box. `arm()` caches the rect, splits,
  re-measures **in the same frame**, and if width or height moved >0.5px it
  immediately unwraps and falls back to a three-span, one-per-line reveal —
  kerning-identical by construction. Syne is a display face with
  `letter-spacing:-0.03em`, so this is a real risk, enforced in code not assumed.
- `arm()` runs inside the existing boot-retire rAF **before** `.gone` is added,
  so the split and its parked start-state happen behind an opaque cover.
- Any cosmetic tweak to the hero glow must be mirrored byte-for-byte in the boot
  shell (`:64-66`, `:100`) or the pairing breaks.

## Reveal mechanism

The boot shell's h1 is **never** split — it must paint on frame one with zero JS.

`js/reveal.js` subscribes once via `NB_MOTION.onFrame`. Characters become
`display:inline-block; white-space:pre` spans; the two `<br>`s are left alone so
**line breaking stays authored, never computed** — that removes the largest class
of split-text reflow bug. The h1 carries `aria-label` with `aria-hidden` spans so
screen readers still read one sentence.

40+ springs would be wasteful: instead one master progress spring drives a
per-character `smoothstep` window, mirroring the staggered `globalKick` in the
atomizer. Stagger is `lineIndex*0.06 + i*0.018 + hash(i)*0.010` — a deterministic
index hash, **not `Math.random()`**, so the reveal is reproducible in tests.
Opacity and Y only, `rise = 0.42em`. One gesture, 34 times, offset in time,
≤520ms including settle.

**Cleanup is part of the mechanism.** On completion: unsubscribe, strip
`will-change`, and **unwrap the spans back to the original text nodes**. This
restores canonical kerning and means `descent.spec.ts`'s `inkRects()` and the
in-page `measureBuddy()` see three line rects, not 34 glyph rects. Resolve
`NB_REVEAL.done` so tests await it deterministically rather than racing a timeout.

Deep-link past floor 1 → skip the split entirely. `NB_MOTION.reduced` → do not
split at all; zero DOM mutation.

## Verification

```bash
# baseline first — every later number needs a before
node scripts/perf.mjs https://northbound-dev.com/

bunx playwright test --project=desktop --project=mobile --project=desktop-reduced
bunx playwright test --project=snap-chrome          # headed real Chrome, must not be skipped
node scripts/perf.mjs https://<preview>.vercel.app
bunx lighthouse https://<preview>.vercel.app --preset=perf --form-factor=mobile \
  --screenEmulation.mobile --output=json --output-path=./lh-1.json --quiet   # ×3, median
```

Gates: LCP < 1200 ms at 4G **and** slow 4G (both 4× CPU), CLS exactly 0, FPS
median ≥ 60 / min ≥ 55 at 4× CPU 390×844, JS ≤ 400 KB gzipped, 0 overflow
breaches across 6 viewports, 0 issues on each fallback run (WebGL disabled,
touch-only, reduced-motion). Expected JS delta ≈ **+9 KB gzipped**.

### Existing tests

`snap.spec.ts` hard-codes `FLOOR_H = 800`. Section height is unchanged per the
CLS contract, so it should pass untouched — **verify, don't assume**, including
at 1076×494 where the `@media (max-height:780px)` rule at `:143-148` kicks in.

`descent.spec.ts` should survive: its tilt test asserts `.nb-case` transforms are
`''` under reduced motion, which holds only because the magnetic selector is
scoped away from `.nb-case`. Nothing asserts on the eyebrow, cue, brackets or
spiral. Tests should await `NB_REVEAL.done` rather than rely on the existing
≥700ms margin.

### New `tests/hero.spec.ts`

Copy verbatim (headline, subhead, both CTA labels) · removals absent · **boot/mount
rect equality within 1px** (the assertion that catches a kerning regression) ·
reveal present then fully unwrapped · zero `.nb-ch` under reduced motion ·
`NB_NORTHLIGHT.ok` and tier correctness · WebGL-disabled path clean with zero
console errors · magnet displacement ≤ 16.001px (the "leans, never chases"
contract) · **`45 <= NB_MOTION.fps <= 75` after 2s** (catches the double-step
bug) · mean luminance from a clipped screenshot buffer below the cap, computed in
Node — a real pixel assertion without introducing snapshot baselines ·
`#floor-1.offsetHeight === innerHeight` at three viewports.

## Order of operations

0. `git switch -c hero-v2` off `6cf0a1b`.
1. Land `perf.mjs` + `perf.spec.ts`. Run against production, **record the
   baseline table**. Commit.
2. Swap `motion.js`, add `claim()`, wire mount/unmount, add the fps assertion.
   Commit. *No visual change — this is the load-bearing correctness step.*
3. Deletions only. Commit. **Preview #1** — the quiet hero should already look
   intentional before any shader sits behind it.
4. Northlight: shaders, host, tier ladder, probe, fallbacks, tick wiring. Tune
   at 100% zoom side-by-side with activetheory.net. Commit. **Preview #2.**
5. `interact.js` + CTA wrapper spans. Commit.
6. `reveal.js` + `arm()`. Commit.
7. Full sweep, all four projects, perf gates, manual real-phone check.
8. Report gate table, JS delta, preview URL, screenshot. **Do not merge.**

## Risks

1. **The double-step bug fails silently upward** — it inflates the very metric
   that gates the work. Step 2, proven by assertion.
2. **Kerning shift from the split** is the only real CLS threat. Measure-and-revert,
   split behind the opaque shell, unwrap on completion, 1px rect test.
3. **4× CPU throttling does not throttle the GPU.** A green harness does not prove
   a budget Android renders this. The runtime ladder is the real safety net;
   a manual check on a real mid-range phone before merge is required.
4. **Fixed fullscreen canvas + `scroll-snap-type: y mandatory`** — a newly
   promoted compositor layer can perturb snapping. `snap-chrome` is the only
   guard and only works headed.
5. **`u_safe` must be measured on resize/floor-change/mount, never per frame** —
   a `getBoundingClientRect()` in the rAF loop is a forced synchronous layout
   that would cost more than the shader.
6. **Floors 02–07 lose their only depth cue** with the spiral gone. The 0.26
   presence floor is the mitigation and needs a human design pass on the
   preview, not just a green test.
7. Stacking order after HudFrame removal — verify the hero scrim at `:228` still
   composites above the canvas and below the copy.
