# True North — rebuilding northbound-dev.com as the portfolio piece

## Context

`northbound-dev.com` currently serves "The Descent" — a seven-floor scroll exported
from a Claude Design canvas, mounted through a 271KB React design-system bundle
(`_ds/`), a 69KB runtime (`support.js`), and vendored React. Its hero says *"Sites
that sell while you sleep."* Nothing on the page was earned; it is a claim wearing a
scroll animation. Underneath it sits a genuinely good raw-WebGL foundation
(`js/gl/*`, `js/motion.js`) that the marketing layer is smothering, plus five dead
files from an abandoned Three.js build.

Colin's instruction: *"this is too performative, not enough hours of work… every
department of developers at Active Theory has their own tasks that come together to
tell a story. I am starting over with the truth of Northbound."*

So: **the engineering becomes the portfolio.** One scroll, four acts, each act a
bespoke WebGL system written by hand against a shared stage — no Three.js, no GSAP,
no library theater. The proof published on the page is the *measured frame budget*,
emitted by the perf harness into a committed artifact and read at runtime. Never a
number anyone typed.

The story the acts carry is the one in the Northbound Launch Plan: a two-person
studio that sells the machine behind the website, priced Beacon / Engine / Bearing,
with the retainer as the real business.

### The truth ledger — what the new site may and may not say

Every claim must survive the repo's own standing rule, which has already killed one
case study:

> "Do not put a result, a metric or a client name here that did not happen — a
> fabricated 'booked 34 jobs' is the one claim that cannot be defended. There is no
> panel until there is something behind it." — `js/site-config.js`

| Claim | Status | Ruling |
|---|---|---|
| Ridgeline Roofing (Atlas) — Astro, real `/api/book` endpoint | Built, deployed, `nb-atlas.vercel.app` → 200 | Show it. Labelled a concept build for an invented business. |
| Marrow Coffee (Vector) — Astro, real Stripe checkout + webhook | Built, deployed, `nb-vector.vercel.app` → 200 | Show it. Same label. |
| Halo | One static placeholder file, no JS behind it | **Cut entirely.** It already had a fabricated tech claim pulled once. |
| Paying clients | None confirmed anywhere in repo or notes | No client section. No testimonials. No logos. |
| "48 hrs first live build" | Aspiration adopted 2026-09-03, never performed | Cut. |
| "2–3 projects per month" | Capacity intent | Allowed, phrased as a rule, never as a record. |
| `SPOTS_LEFT: 2` | Hand-set config value | Cut. Manufactured scarcity is the performative tell. |
| Frame budget / LCP / CLS | Measurable today by `scripts/perf.mjs` | **This is the proof.** Machine-generated only. |
| BUDDY the mascot | Design-export leftover | Cut. A cartoon guide contradicts the thesis. |

Pricing ships as the launch plan states it: **Beacon $3,500 · Engine $8,500 ·
Bearing $600/mo**, 50% up front, Bearing in every proposal, published price a floor
and not a ceiling.

---

## The four acts

One scroll. One canvas. Each act is a hand-written WebGL system that carries one
beat of the story, and each one is *about* the thing it renders.

| Act | System | What it says |
|---|---|---|
| **I — Northlight** | Aurora curtain. Fullscreen triangle, one draw call, no FBOs. *Exists* — refit to the Stage. | The studio's name, and a horizon. |
| **II — Drift** | GPU particle field, ~100k points, positions advanced on the GPU. | Forty businesses in a local market. Most of them dark. |
| **III — Solution** | Typography advected through a real-time fluid sim. | The offer dissolving into the machine behind it — Beacon, Engine, Bearing. |
| **IV — The Work** | Noise-threshold dissolve resolving into two live concept builds. | The only two things that are real. Open either one. |

Act IV ends on the measured numbers and one contact line. Nothing else.

---

## Architecture

### The Stage contract — built first, frozen, then everything binds to it

Everything hangs off one module, `js/stage/stage.js`, exposing `window.NB_STAGE`.
It owns **one** `<canvas id="nb-stage">` fixed behind the DOM, **one** WebGL context,
and **one** rAF loop hooked into the existing `window.NB_MOTION` registry — never a
second loop, because two loops means two frame budgets and no way to reason about
either. It also owns the scroll-progress bus and the quality tier from
`js/gl/afford.js`.

```js
/**
 * Every act implements exactly this. No act creates a context, a rAF, or a
 * resize listener of its own.
 *
 * @typedef {Object} Act
 * @property {string}  id          Unique, kebab-case. Used for GL label prefixes.
 * @property {[number,number]} window  Scroll range [enter, exit] in page progress 0..1.
 * @property {1|2|3}   cost        Cost tier. Stage refuses to run two cost-3 acts at once.
 * @property {boolean} needsFBO    Declared up front so Stage can budget texture memory.
 *
 * @property {(ctx: StageCtx) => void}                 init     Allocate GL resources. Called on first entry into the hysteresis band.
 * @property {(w:number, h:number, dpr:number) => void} resize  Backing-store size already applied to the canvas.
 * @property {(dt:number, p:number, fade:number) => void} update dt seconds (clamped), p = 0..1 progress *within this act's window*, fade = 0..1 cross-fade weight.
 * @property {() => void}                              draw     Issue draw calls. Blend state is set by Stage; leave it as you found it.
 * @property {() => void}                              dispose  Free every buffer, texture and program. Called on exit from the hysteresis band.
 */

/**
 * @typedef {Object} StageCtx
 * @property {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @property {boolean} isWebGL2
 * @property {1|2|3}   tier        From afford.js. 3 = full, 1 = cheapest. Never 0 — acts degrade, never disable.
 * @property {boolean} reduced     prefers-reduced-motion. Acts must render a still, composed frame, not nothing.
 * @property {{float:boolean, halfFloat:boolean, instanced:boolean, transformFeedback:boolean}} caps
 * @property {(vert:string, frag:string, label:string) => WebGLProgram} program   Wraps NB_GL.buildProgram, tracked for dispose.
 * @property {(w:number,h:number,fmt:string) => {fbo,tex}} target  Tracked FBO allocation.
 */

window.NB_STAGE.register(act);  // idempotent; order of registration is irrelevant
```

**Compositing.** Acts draw directly to the default framebuffer in scroll order,
with an overlap band between adjacent windows where both run and each multiplies its
output by `fade`. At most two acts are ever live. This is chosen over a shared
offscreen FBO with a compositor pass because the compositor costs a fullscreen blit
and a float target on every frame for a cross-fade that two `fade` uniforms buy for
free — and because Act IV needs DOM iframes composited *above* the canvas, which an
offscreen pipeline makes harder, not easier. Acts that need an FBO internally (only
Act III does) declare `needsFBO` and allocate their own through `ctx.target`.

**Resource lifecycle.** `init` fires when scroll first enters `[enter − 0.15,
exit + 0.15]`; `dispose` fires on leaving `[enter − 0.4, exit + 0.4]`. The asymmetric
hysteresis band is what stops a user scrubbing across a boundary from thrashing
allocation. Programs and targets obtained through `ctx.program` / `ctx.target` are
tracked, so a leaked resource is a test failure, not a mystery.

### Act II — Drift, honestly tiered

| Path | Condition | Count |
|---|---|---|
| WebGL2 transform feedback | `isWebGL2` | 100k |
| WebGL1 ping-pong float texture | `OES_texture_float` + `WEBGL_color_buffer_float` | 65k |
| Stateless procedural | neither | 20k, animated in the vertex shader from a static seeded buffer — no state, no feedback, still deliberate |

The third path is the one that matters. It is what a five-year-old Android gets, and
it has to look composed rather than broken.

### Act III — Solution, the risk act

Type is rasterised with canvas2d `fillText` into a texture — the fonts are already
self-hosted woff2, and this needs no MSDF tooling and therefore no build step. That
texture is the dye field advected by a semi-Lagrangian fluid solver.

| Tier | Grid | Jacobi iterations | Verdict |
|---|---|---|---|
| 3 — desktop | 128² | 20 | comfortable inside 16.7ms |
| 2 — mid mobile | 64² | 8 | tight; measured, not assumed |
| 1 — low | advection only, no pressure projection | — | reads as a dissolve, not a broken fluid |
| reduced-motion | no sim | — | type crisp, composed, still |

**This act does not ship until `fpsMin` holds on a throttled 390×844 run.** If the
64²/8 tier cannot hold 55fps, Act III degrades to tier 1 on mobile permanently and
that is stated in the plan rather than discovered in production.

### Measured proof — the number nobody types

`scripts/perf.mjs` already measures exactly what the page should publish, under real
CDP throttling rather than Lighthouse's simulation, with these gates:

| Gate | Threshold |
|---|---|
| LCP, regular 4G (9 Mbps / 85ms) @ 4× CPU | ≤ 1200ms |
| LCP, slow 4G (1.6 Mbps / 150ms) @ 4× CPU | ≤ 1200ms |
| CLS to idle + 2s | 0 |
| FPS median @ 4× CPU, 390×844 | ≥ 60 |
| FPS minimum @ 4× CPU, 390×844 | ≥ 55 |
| JS bytes gzipped over the wire | ≤ 400KB |
| Fallback sweeps — no WebGL / touch-only / reduced-motion | 0 issues |

The harness gains a `--emit` flag writing `proof.json` at the repo root:

```json
{ "measuredAt": "2026-09-12T21:40:00Z", "commit": "088c6d2", "url": "https://northbound-dev.com/",
  "gates": { "fpsMedian": { "value": 60, "threshold": 60, "unit": "fps" }, "…": {} } }
```

`js/proof.js` fetches it and renders the figures into Act IV. `tests/proof.spec.ts`
re-measures and **fails if a published value drifts from the measured one, or if
`measuredAt` predates the newest commit touching `js/`** — so a stale boast cannot
survive a merge. This is the whole thesis in one test.

---

## The departments — how the parallel build runs

Sonnet subagents, four at a time (concurrency is capped at 4 and spawn depth at 1 in
`settings.json`, so no department spawns its own tree). Each department owns files no
other department may open. `index.html`, `js/motion.js` and `js/stage/stage.js` are
the shared surfaces, so they are never held by two departments at once.

**Wave 0 — serial, main thread. Nothing starts until this lands.**
Strip the repo, write the Stage, write the content truth file, write the shell.

- Delete: `js/app.js`, `js/animations.js`, `js/cursor.js`, `js/form.js`, `js/helix.js`,
  `js/templates.js`, `css/style.css`, `_ds/`, `vendor/`, `support.js`, `demos/halo/`,
  `.nojekyll`, `.github/workflows/deploy-pages.yml.retired`, and the orphaned
  `node_modules/{@dimforge,@tweenjs,fflate,meshoptimizer}`.
- Write `js/stage/stage.js` against the contract above, and freeze it.
- Write `js/content.js` — replaces `site-config.js`, carries the launch-plan copy and
  the truth-rule comment, minus `SPOTS_LEFT` and minus Halo.
- Write the `index.html` shell: semantic content, no framework, canvas behind it.
- Rewrite `README.md`, which still describes the Three.js build from two designs ago.

**Wave 1 — four in parallel**

| Dept | Owns | Task |
|---|---|---|
| **Northlight** | `js/acts/northlight.js`, `js/gl/northlight-shaders.js` | Refit the existing curtain to the Act interface. Smallest job; it also proves the contract before the others are deep in. |
| **Drift** | `js/acts/drift.js`, `js/gl/drift-shaders.js` | Act II, all three tiers, honest counts. |
| **Solution** | `js/acts/solution.js`, `js/gl/fluid-shaders.js`, `js/gl/type-atlas.js` | Act III. Highest risk — reports its measured frame cost back as a deliverable. |
| **Editorial** | `index.html` body, `css/northbound.css` | The DOM layer: copy from the launch plan, type scale, grid, the no-JS reading experience. |

**Wave 2 — four in parallel**

| Dept | Owns | Task |
|---|---|---|
| **Work** | `js/acts/work.js`, `js/panels.js`, `js/gl/wipe.js` | Act IV. Dissolve into the two live concept builds; panels open to iframes. |
| **Proof** | `scripts/perf.mjs`, `js/proof.js`, `proof.json`, `tests/proof.spec.ts` | The measured-number pipeline and the drift test. |
| **QA** | `tests/*.spec.ts` (excluding `proof.spec.ts`) | A spec per act, plus the snap-chrome headed run that scroll-snap needs. |
| **Fallback** | `css/fallback.css`, a11y audit, `index.html` `<noscript>` | Reduced-motion, no-WebGL, no-JS, contrast, focus order. Runs after Editorial so `index.html` is never contended. |

**Wave 3 — main thread.** Integrate, run the harness against a preview deploy, gate,
then `reviewer` on the full diff before it goes to `main`.

### Reduced motion is the default, not the edge case

Colin's Mac has Reduce Motion on system-wide, so the reduced-motion path is the
experience he will see every time he opens the site locally. It is a first-class
deliverable in every act, not a fallback bolted on at the end — every act renders a
still, *composed* frame under `ctx.reduced`, never an empty one. A `?motion=full`
query parameter forces the animated path for review.

---

## Verification

Nothing here is "looks done." The pass/fail signals, in order:

1. `bun scripts/perf.mjs https://<preview>.vercel.app/` — every gate in the table
   above passes, non-zero exit on any failure. This is the gate that matters.
2. `bunx playwright test` — all four projects (`snap-chrome` headed, `desktop`,
   `mobile`, `desktop-reduced`). Includes a spec per act and the proof-drift test.
3. `bun scripts/perf.mjs --emit` then confirm `proof.json` values match what Act IV
   renders in the browser.
4. Reduced-motion sweep by hand: load with Reduce Motion on (the default locally) and
   confirm all four acts render composed still frames and every link is reachable.
5. No-JS and no-WebGL sweeps: full copy readable, both concept builds reachable.
6. Visual confirmation in real Chrome via the Claude-in-Chrome extension — the
   `interceptor` CLI is not installed on this machine.
7. `rg -n "48 hrs|SPOTS_LEFT|Halo|sell while you sleep" .` returns nothing outside
   this plan file.

## Open risks

| Risk | Mitigation |
|---|---|
| Act III cannot hold 55fps on throttled mobile | Tier down to advection-only on mobile and say so. The act is built to degrade by design, and the decision is made on a measurement, not a hope. |
| Four agents diverge from the Stage contract | The contract is written and frozen in Wave 0 before any department starts, and Northlight — the smallest refit — validates it first. |
| Stripping `_ds/` breaks layout wholesale | It is a full rewrite of the DOM layer, not a removal from the existing one. The old tree stays on `v3-truenorth` until the new one passes its gates. |
| GL resource leaks across act transitions | All allocation goes through tracked `ctx.program` / `ctx.target`; a QA spec scrubs the full scroll ten times and asserts flat texture-memory. |
| The site gets beautiful and says nothing true | The truth ledger is the acceptance list. Verification step 7 is a grep. |
