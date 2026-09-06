# northbound-dev.com — the Active Theory build

## Context

The generic pass is done and it shows. The site is competent and fast, and it
reads like a document. It needs to read like a real-time graphics application,
because the studio's whole claim is that it can build what other people cannot.

The bar is activetheory.net. I measured it rather than assuming it:

| | activetheory.net | northbound-dev.com today |
|---|---|---|
| LCP | 0.20s | 0.52s (4G) / 1.14s (slow 4G) |
| CLS | 0.000 | 0.000 |
| JS | **708 KB** (936 KB total, 18 requests) | 150 KB gzipped |
| canvases on landing | **0** | 2 |

Two things fall out of that, and both shape this plan.

**The reference does not keep the budget the brief imposes.** Active Theory ship
nearly 3× the 250 KB cap and still land LCP at 0.20s, because bytes loaded after
first paint cost nothing on the metrics a user feels. **Decision: the byte cap
moves to 400 KB gzipped — still well under the reference — and the gates that
stay hard are the ones that are felt: LCP < 1.2s, CLS 0, 60fps at 4× CPU.**

**Their landing page has no canvas at all.** Their craft is not "put a shader on
it" — it is orchestration, restraint and timing. A specialist told to bolt on
GPU effects will produce something louder than the reference and worse. That is
written into every layer spec below as an explicit failure mode.

---

## What already exists, and must not be rebuilt

Three of the five layers already have their core module, written this session:

- `js/motion.js` — spring integrator (semi-implicit Euler, fixed 120Hz
  sub-stepping so feel is frame-rate independent), a registry, cursor position
  and velocity published as `--cx/--cy/--cv`, `onFrame` subscribers, live FPS.
  **This is the only render loop.** No specialist may start a second one.
- `js/scroll.js` — virtual scroll. JS owns scroll completely rather than handing
  off to native, which is the specific bug that broke the earlier attempt:
  trackpad inertia kept firing during a JS animation and the two fought. Snapping
  retargets the same spring rather than starting a second animation, so momentum
  is pulled toward a floor edge instead of stopped dead.
- `js/hud.js` + `css/hud.css` — live telemetry block, 8px scale, corner brackets,
  hairline dividers, tabular numerals. Box is sized from CSS before any value is
  written, so it cannot shift.
- `js/field.js` — **designed, not yet written.** Plan mode caught that specialist
  mid-flight, so it produced a design instead of the file: one fullscreen
  triangle, uniforms `u_res/u_time/u_cursor/u_scroll/u_floor`, a log-radial depth
  grid converging on a cursor-driven vanishing point, two-octave value-noise
  drift, chromatic aberration as a quadratic-in-`p` offset costing three
  evaluations of one shared brightness function rather than three passes, and an
  explicit luminance cap so it can never fight text contrast. Layer 1 implements
  exactly that design rather than starting over.

Also already true and worth protecting: the descent's hero is pre-rendered into
the boot shell, fonts are self-hosted with metric fallbacks, and every floor
carries `overflow:hidden` after a hero image escaped its section and painted 633px
of robot over Floor 02's headline at 1076×494.

---

## Two corrections to the execution shape

**Branch off the tip, not `main`.** `main` is 8 commits behind — it has neither the
Pass 2 demos nor Phase 0/1. Branching specialists off it would silently revert
both. First action is to fast-forward `main` to include `pass2-demos` and
`pass3-motion`, so "off main" means what it should.

**Five specialists cannot run at once.** The harness caps concurrent subagents at
4. That is not a problem, because the merge order 5 → 2 → 1 → 3 → 4 is a genuine
dependency chain: Layer 2 needs the frame loop Layer 5 protects, Layer 1 needs
Layer 2's scroll signal, Layers 3 and 4 need both. Specialists are staged in that
order, two to three in flight at a time.

**Ownership is by file, not just by branch.** `index.html` is 1035 lines and is
the entire site — five branches editing it is a merge failure waiting to happen.
Each specialist owns its own module files outright; **integration into
`index.html` is done once, by me, per merge.** Branches stay trivially mergeable.

---

## The layers

Each specialist receives its layer spec verbatim, the codebase, the existing
utilities above, and the rule that **copy, structure and conversion flow are
untouchable**. Definition of done is "indistinguishable in craft from an Active
Theory production site" — and because that is not self-checkable, each layer also
carries concrete acceptance criteria.

### Layer 5 — Performance & grace *(merges first, gates everything after)*
Owns `tests/perf.spec.ts` and the measurement harness. Establishes the before
numbers, then re-runs after every subsequent merge and holds the veto.
**Accepts when:** LCP < 1.2s on real 4G throttling, CLS 0, 60fps sustained at 4×
CPU on 390×844, JS ≤ 400 KB gzipped, and clean fallbacks proven for no-WebGL,
touch-only, and `prefers-reduced-motion`.

### Layer 2 — Inertial motion *(`js/scroll.js`, `js/motion.js`)*
Finish and harden what exists: velocity-driven skew on scroll, magnetic CTAs that
pull toward the cursor within a radius, spring hover/press with real overshoot on
every interactive element. Remove the last CSS transitions except the boot-shell
failsafe.
**Accepts when:** no `transition:` or `@keyframes` remains on any interactive
element; every motion is spring-driven and frame-rate independent; a 120Hz display
and a 60Hz phone produce the same settle time.

### Layer 1 — GPU visual depth *(`js/field.js`, shaders)*
Full-viewport fragment shader field, cursor-lit, scroll-parallaxed, with film
grain and chromatic aberration under the perceptual threshold. Case-card posters
displace on hover via shader rather than opacity.
**Explicit failure mode:** anything that reads as "an effect" is a fail. The
reference ships no canvas on its landing page; restraint is the craft.
**Accepts when:** it survives Layer 5's budget, degrades to the existing CSS
gradient with no WebGL, renders one static frame under reduced motion, and a
viewer cannot name the effect without being told it is there.

### Layer 3 — Technical precision *(`css/hud.css`, `js/hud.js`)*
Strict 8px grid at every breakpoint, sub-pixel typography, tabular numerals
everywhere, corner brackets, crosshairs, hairline dividers with monospace
metadata. Every readout live: `STATUS` from `spotsLine()`, `LOADED` from real
navigation timing, `RENDER` from measured FPS, `FLOOR` from scroll position.
**Accepts when:** a spacing audit at 390/768/1280/1512 finds no off-grid value,
and no readout anywhere on the site is hardcoded.

### Layer 4 — Reactive state
Cursor shifts the field's light source; hovering a case card nudges its
neighbours and changes BUDDY's expression; floor arrival settles with overshoot
and ticks the readout; form states animate through the same springs. Optional
spatial audio behind the existing toggle, default off.
**Accepts when:** one action visibly moves at least three independent elements,
and the whole system still passes Layer 5.

---

## Verification, at every merge

- Lighthouse mobile ×3 on the deployed URL, median recorded — perf ≥ 95, CLS 0.
- Real 4G and slow-4G throttling with 4× CPU for LCP; FPS sampled in-page.
- `prefers-reduced-motion`: all motion off, layout identical.
- The Pass 1 suite stays green — `tests/descent.spec.ts` and `tests/snap.spec.ts`,
  the latter in real headed Chrome because headless does not run the snap engine.
  **Note:** Layer 2 replaces CSS snap with virtual scroll, so `snap.spec.ts` must
  be rewritten against the new transport, not deleted.
- Viewport sweep for overflow at 1076×494 and 768×500 — the sizes that caught the
  hero bug — plus the standard four.
- A specialist's work that breaks Layer 5 is reverted, and the number is reported
  rather than rounded.

## Reporting back

Per layer: what shipped, before/after FPS, LCP and bundle size, screenshots of
the hero and one case card at 100% zoom, and anything cut for budget with the
reason.

## Out of scope

Copy, structure, conversion flow. The three demos under `demos/` — Atlas is at
perf 100 and its measured LCP is published on Floor 02. Vector's Stripe wiring,
still waiting on an `sk_test_` key.

## Known gap this plan does not close

There is no image-generation credential configured, so photographic assets are
still drawn SVG/CSS placeholders on Atlas and Vector. Layer 1 makes the descent
itself procedural, which is the right answer for a studio site — but a roofing
company's site with no photograph of a roof stays a weak sell, and that is a
decision waiting on you, not a task waiting on me.
