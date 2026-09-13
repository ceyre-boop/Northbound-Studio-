# The Offerings Procession — twelve things we sell, one at a time

Branch `offerings-v1`. Preview only; Colin merges.

## Context

The site currently argues that the engineering is real and shows two concept
builds as evidence. What it never does is say what you can actually buy. The
packages section lists twenty-odd bullet points across three price tiers, and a
bullet point is not a thing anyone wants.

So: twelve offerings, each one a living object. "Do you want fries with that"
for web development — the visitor sees every add-on as something moving,
touches it, and clicks through to learn what it does for them.

The camera does not move. Scroll advances the panels along a helical path: each
one enters from the lower right, spirals up through the centre foreground where
it is largest and the loop inside is the main event on screen, then recedes to
the upper left and fades. Panels overlap and occlude. There is always one
arriving and one leaving, and you can rest between them. Native scroll
momentum is untouched — no scroll-jacking, no snap points.

**Nothing has been built yet.** The camera revision arrived during planning, so
it is folded into the design rather than replacing working code.

### What this replaces

The current `[data-act="work"]` section becomes `[data-act="offerings"]` and
the procession owns it alone. Per Colin's call, the two concept builds and the
measured-proof panel are **relocated, not deleted** — they move into the
closing `#contact` section in a more compact form. Nothing that was true about
this site stops being on it.

### Three requirements from the first brief that the helix supersedes

State them plainly rather than quietly dropping them:

| Original | Now | Why |
|---|---|---|
| Panels soft-repel to avoid overlap | **Cut.** Depth-sorted overlap | Panels are on a rail at fixed spacing, and occlusion is the point of the depth. |
| A flick throws a panel and it settles wherever | **Displacement from the rail** | Order is fixed 01–12 and the procession is continuous. A throw now lurches the panel off its slot, wobbles, and springs home. Same liquid feel, no broken sequence. |
| Rolling 3-tiles-per-frame loop refresh | **Distance-based throttle** | Only the two or three panels nearest centre run at full rate; further ones step down, offscreen ones stop. This is how twelve live loops get paid for. |

---

## The twelve offerings

Content is truth-checked the same way the rest of the site is. Package mapping
is derived from `js/content.js`, not invented.

| # | Offering | Package | The loop |
|---|---|---|---|
| 01 | Custom site | Beacon | A grid assembling itself from scattered rule-lines |
| 02 | Brand identity | Beacon | Three marks resolving out of noise into one lockup |
| 03 | Booking flow | Engine | Time slots locking into a grid, one turning solid |
| 04 | Quote flow | Engine | A figure converging from a wide range to a single number |
| 05 | Payments | Engine | A value pulse travelling and resolving |
| 06 | Lead capture | Engine | Drifting motes caught and held by a soft field |
| 07 | Automated follow-up | Engine · kept running by Bearing | A signal chasing a thread until it lands |
| 08 | Reminders | Engine · kept running by Bearing | A slow orbit crossing a threshold and flaring |
| 09 | Review requests | Engine · kept running by Bearing | A star figure completing itself, stroke by stroke |
| 10 | Owner dashboard | Engine · kept live by Bearing | Metrics settling into bars, then breathing |
| 11 | Local SEO | Beacon | A pin pulling attention inward from the edges |
| 12 | AI intake / auto-responder | **Add-on — quoted per job** | A question folding into an answer and unfolding again |

**12 carries no price.** The launch plan has no AI tier, and the old site's
"$500 AI add-ons" was never performed at that price. It is labelled an add-on
and quoted per job rather than given an invented number.

Bearing appears as a *maintenance* line on the four offerings it actually keeps
running. That is the retainer thesis stated where it is true, not bolted on.

---

## The helix

One act-local progress value `s` (0–1) from the Stage drives everything. Each
panel gets its own path parameter:

```
t_i = (s * SPAN - i) / REACH        // t = -1 arriving, 0 dead centre, +1 gone
```

Position, from `t`:

```
along-axis screen offset   x = -Ax * t          // enters right, leaves left
                           y =  Ay * t          // enters low,   leaves high
depth                      z =  Znear + Kz * t*t   // nearest at centre
orbital radius             r =  Rmax * |t|         // collapses to zero at centre
orbital angle              phi = phi0 + t * PHI    // ~3/4 turn across the path
offset                    += (r*cos(phi), r*sin(phi))
panel yaw / roll           yaw = -t*YAW, roll = t*ROLL   // angled in, square at centre, tilted out
scale                      S = F / z               // perspective, largest at centre
```

The orbital radius collapsing to zero at `t = 0` is what makes the panel *land*
in the centre rather than merely pass through it. Yaw and roll crossing zero at
the same moment is what makes it square up.

**Pacing: 0.62 viewport of scroll per panel step. Section height 1000svh.**

Colin chose the cinematic option, shown as "about ten screens". My arithmetic
under that option was wrong: it counted twelve steps and forgot the five more
the lead-in and lead-out need, so 0.85/panel is really 13.6 screens, not ten.
The span is `step x (11 + 5)` because panel 0 must travel from `t = -2.5` and
panel 11 must reach `t = +2.5`. At 0.62 the section is 9.9 screens — the
number he actually picked — and arrival-to-centre is 1.24 viewports, still
slower than brisk. Centre-to-centre is ~500px, about one trackpad swipe per
offering.

**Hero scale: the centre panel is 52% of viewport height, 4:5 portrait**, with a
corner radius that scales with the panel. Portrait because the loops are
abstract and read better with vertical room, and because it survives the
narrow-radius vertical spiral on a phone. Our proportion, not anyone else's.

**Idle life.** When scroll stops the procession settles but does not freeze: a
slow drift along the path continues at a fraction of a panel per minute, and
each panel breathes on its own phase. The centre panel keeps its loop at full
rate; the idle drift does not wake the stopped tiles.

---

## Architecture

Four departments build in parallel against interfaces frozen before any of
them starts. No two departments open the same file. The centre-panel index and
per-panel depth flow out of PHYSICS and into both MOTION and GRAPHICS, so the
three never need to talk to each other.

```js
/* PHYSICS — js/offerings/procession.js. CPU only. Not one gl.* call.
 *   create(count) -> Procession
 *   .layout(w, h, tier)            rebuild rail constants for this viewport
 *   .step(dt, s, pointer)          s = act progress 0..1; integrate springs
 *   .panels                        [{ i, t, x, y, z, yaw, roll, scale, verts }]
 *   .order                         Int8Array, back-to-front draw order
 *   .centre                        index of the panel nearest t=0
 *   .depthOf(i)                    |t|, 0 at centre — drives loop throttle AND blur
 *   .hit(px, py) -> index | -1
 *   .grab(i, px, py) / .drag(px, py) / .release(vx, vy)
 *   verts are panel-local, in the panel's own unit square, already displaced
 *   by the spring lattice. GRAPHICS applies the transform.
 */

/* MOTION — js/offerings/atlas.js + js/gl/offering-loops.js
 *   createAtlas(ctx, tier) -> Atlas
 *   .tex                           the loop texture (array on WebGL2, atlas on 1)
 *   .render(dt, depths, centre)    refreshes tiles on the distance schedule
 *   .uvFor(i) -> [u0, v0, u1, v1]  where panel i's loop lives
 *   .dispose()
 *   Every loop is seamless in u_t and takes one u_intensity uniform.
 */

/* GRAPHICS — js/offerings/wall.js + js/gl/offering-material.js
 *   createWall(ctx, tier) -> Wall
 *   .resize(w, h, dpr)
 *   .upload(procession)            one bufferSubData for all twelve lattices
 *   .draw(alpha, atlas, light)     depth-ordered, back to front, no depth test
 *   .dispose()
 */
```

**Loop throttle by distance** — the whole reason twelve live loops are
affordable:

| Band | \|t\| | Refresh |
|---|---|---|
| hero | ≤ 0.5 | every frame |
| near | 0.5–1.5 | every 2nd frame |
| far | 1.5–2.5 | every 6th frame |
| prefetch | 2.5–2.9 | once, on entry |
| stopped | > 2.9 | never |

Average 3.3 tiles a frame, capped by a *fragment* budget rather than a tile
count so the cap means the same thing at every tier.

**Loop phase comes from per-panel visible time, not global time.** A tile
stopped for six seconds would otherwise resume six seconds further through its
loop and visibly jump on the frame it re-enters — every time it comes round.
Counting only the frames where a tile was actually refreshed makes the jump
impossible, and ties a loop's phase to how long the visitor really looked at
it, which is the better idea anyway.

**Recede-blur — the blur and the chromatic fringe are the same effect, so it
is free.** Both of my first two ideas were wrong and are recorded here so
nobody re-proposes them. `texture2D`'s LOD-bias parameter is vertex-shader-only
in GLSL ES 1.00, so the WebGL1 path would need an extension the Stage does not
probe for. And `generateMipmap` rebuilds the *whole* atlas pyramid every call —
1.64 Mpix at tier 3, three or four calls a frame, five times the cost of the
wall itself.

What ships instead: the glass already takes three atlas samples for chromatic
fringe. Spread those three radially by `fringe + blur * z` and clamp each tap
to the tile rect. Zero extra taps, two extra ALU, bleed impossible by
construction. It is also what thick glass actually does — dispersion and
defocus are one phenomenon.

**Glass.** No scene colour target — the wall draws over whatever the earlier
acts left. Refraction is faked by offsetting the loop sample along the surface
normal derived from the spring lattice, which is both cheaper than a scene
target and more legible, because what refracts is the panel's own content.

**Mascot.** A mount point `#nb-mascot-mount` inside the section and a settable
hook object, built now, filled by the Character department later:

```js
window.NB_OFFERINGS = { onPanelHover, onPanelFocus, onPanelOpen, onPanelThrow, mount }
```

`onPanelFocus` fires with the centre index as the procession advances.

**Click to open.** The centre panel is the default target. It glides to dead
centre, expands, keeps its loop at full intensity, and a card slides in beside
it: name, one sentence about what it does for the owner, which package includes
it, and **Add to my project** — which appends the offering to a visible chip
list above the contact form and to a hidden `offerings` field, then leaves the
visitor where they were. No page navigation. Escape and the close button return
it to the procession and restore focus.

---

## Departments

### Two things that would have failed CI

**Shader compilation cannot happen in `init()`.** Twelve loop programs plus
glass, backdrop and grain is ~15 LLVM-JIT compiles on the software rasteriser
CI runs on — plausibly a 300–600ms stall in one frame. `measureFPS` takes the
*minimum* of six half-second samples, so one stall fails the gate outright, and
the Stage catches throws but not stalls. So: `init()` compiles the vertex
shader, the glass and the backdrop only, and primes all twelve tiles with a
static gradient. `render()` compiles **at most one loop program per frame**
until all twelve exist. Twelve frames to full fidelity, a whole screen of
scroll ahead of being seen.

**The published frame number will drift past its own gate.** The wall takes the
frame from 8.3ms to roughly 10.6ms — a 28% move against a 15% drift gate — and
`index.html` hardcodes a proof-table row keyed to `acts.work`, which stops
existing. The DOM, the CSS, the act, the cast entry, the renamed row and a
fresh `--emit` all land in **one commit**. Split across two, the tree is red in
between no matter what order they go in.

**Wave 0 — me, serial. Nothing starts until this lands.**
The frozen interfaces above as real files; `js/acts/offerings.js` (the act
shell that wires the three together and owns the Stage contract);
`js/offerings/content.js` (the twelve offerings, their copy, their package
mapping); the `index.html` section with all twelve as real markup; the
relocation of the concept builds and proof panel into `#contact`; the
`acts.work` → `acts.offerings` rename in the proof table and `cast.js`.

| Dept | Owns | Task |
|---|---|---|
| **Motion** | `js/gl/offering-loops.js`, `js/offerings/atlas.js` | Twelve seamless GLSL loops, the texture array / atlas, the distance schedule |
| **Physics** | `js/offerings/procession.js` | The helix, the spring lattice, drag and flick as rail displacement, depth order, centre index |
| **Graphics** | `js/gl/offering-material.js`, `js/offerings/wall.js` | Mesh generation, index buffer, per-frame upload, glass, recede-blur, fringe, grain, cursor light, particles |
| **Card** | `js/offerings/card.js`, `css/act-offerings.css` | Open/close, the card, Add to my project, focus management, the no-JS and no-WebGL presentation |

Deleted at the end: `js/acts/work.js`, `css/act-work.css`. `js/panels.js`
survives — it moves to binding the relocated concept-build cards in `#contact`.

---

## Gates

| Gate | Threshold | Where |
|---|---|---|
| FPS median @ 4× CPU, 390×844 | ≥ 60 | `scripts/perf.mjs` |
| FPS minimum | ≥ 55 | same |
| CLS to idle + 2s | exactly 0 | same |
| LCP, slow 4G @ 4× CPU | ≤ 1200ms | same |
| **JS added by this section** | **≤ 60KB gzipped** | new assertion in `tests/offerings.spec.ts` |
| Offerings act p95 submission | ≤ 9ms | `tests/acts.spec.ts` |
| No GL state left dirty at any seam | 0 | `?strict=1`, `tests/stage.spec.ts` |
| No-JS / no-WebGL / reduced-motion | 0 console errors, 0 overflow | `checkFallback` |

Today's whole page is 60,093 bytes of gzipped JS, so the budget for this one
section is the size of the entire existing site. It should come in near a third
of that; the gate exists to catch twelve shaders quietly becoming thirty.

## Verification

1. `bun run serve` then `?motion=full&strict=1` — scroll the full procession and
   confirm the Stage throws on nobody.
2. `bunx playwright test` — all three projects, plus the new offerings spec:
   twelve panels present in the DOM with JS off, centre index advances
   monotonically with scroll, a flick returns the panel to its slot, the card
   opens and Add to my project lands a chip in the contact form.
3. `bun scripts/perf.mjs https://<preview>.vercel.app/` — every gate above.
4. Reduced motion by hand (the default on this machine): the procession renders
   a composed still, the card still opens, every offering still reachable.
5. Phone-width pass with Playwright device emulation, per
   [[mobile-checks-need-playwright]]: vertical spiral, narrower radius, no
   horizontal overflow, no tap target under 44px.
6. `rg -n "\$500|48 hrs|spots left"` returns nothing — no invented price rides
   in on offering 12.

## Deliverables

Preview URL · ten lines of intent per department · the gates table with real
measured numbers · a screenshot at 100% zoom · a ten-second recording of a slow
scroll through panels 03–07, and a second of the drag-and-throw plus one
click-through from the original brief.
