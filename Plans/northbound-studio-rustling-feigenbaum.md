# northbound-dev.com — the redesign

## Context

The last two passes failed the brief, and the diagnosis in the critique is
correct: they added telemetry, brackets and a background field **on top of** the
original template. Instruments on a dashboard skin. The reason they could only
ever do that is structural, and it is the thing this plan fixes first.

**The site is not hand-built. It is rendered by a template runtime.** `support.js`
is a React-based design-compiler that renders `<x-dc>` markup through 68
`x-import` instances, 16 `sc-if`/`sc-for` directives and 87 `{{ }}` bindings,
drawing every visible element from nine components in `_ds_bundle.js`:

> Bubble · Button · Card · Eyebrow · HudFrame · Input · Select · Stat · TemplateCard

Those components **are** the artifacts marked non-negotiable for deletion.
`Card` is the three stacked boxes. `HudFrame` is the corner brackets. `Eyebrow`
is `FLOOR 01 · ARRIVAL`. `Stat` is the `$1,500` box. You cannot delete the
template artifacts and keep the template. Every previous pass worked *around*
this runtime, which is precisely why every previous pass could only decorate.

It also costs **146.8 KB gzipped of the current 165 KB — 89% of the budget**:

| | gzipped |
|---|---|
| react-dom | 42.4 KB |
| `_ds_bundle.js` | 81.3 KB |
| `support.js` | 18.9 KB |
| react | 4.2 KB |
| **runtime total** | **146.8 KB** |

### The decision that unblocks all six briefs

**The DC runtime, React and the design system are removed. The descent is
rebuilt as hand-authored HTML, CSS and ES modules.** This is not scope creep —
it is the enabling move, and it resolves four separate blockers at once:

1. It frees ~147 KB, so a GPGPU particle hero fits inside a 250 KB budget with
   room to spare rather than fighting for scraps.
2. It **structurally fixes the double-LCP failure**. Today the shell paints the
   hero, then React mounts and paints a *second* hero as a fresh, larger LCP
   candidate at ~2300ms. Brief 2 requires "the app owns the hero, the shell does
   not paint a second one" — that is only possible without a client-side
   re-render of the hero.
3. It removes the `{{ }}` streaming artifacts, one of which was shipping a
   literal `{{ c.url }}` to the network as a 404 on every page load.
4. It deletes the nine components that are the template.

Nothing of value is lost: every per-frame system already bypasses React and
writes straight to nodes, because a `setState` per frame re-rendered the whole
site at 60fps.

---

## What is deleted, and what survives

**Deleted from production:** the floor/elevator conceit entirely — readouts,
labels, `data-floor`, the `«` `»` floor nav, `FLOOR 0n · …` eyebrows; the spiral
(`drawSpine`); the three stacked boxes as a layout; the HUD block unless the
Identity Director rules it part of the new system; the DC runtime and `_ds`.

**Survives, untouched in substance:** the copy voice; the three concept builds
(Ridgeline Roofing, Marrow Coffee, Lumen Interiors); the contact form and all
four of its options; the 48h / $1,500 / text-us promises; Buddy — redesigned.

**Scope note:** the three demo *sites* under `demos/` are out of scope. Brief 4
redesigns how they are **showcased** on the descent. Atlas is at perf 100 and
its measured LCP is published on the site; it is not touched.

**Buddy is redesigned as a procedural entity, not a re-rendered robot.** There is
still no image-generation credential, so a new photographic Buddy is not
available. Identity owns his new form as vector/GLSL — which is the better answer
anyway and removes the dependency permanently.

---

## The studio

Six specialists, each with the brief verbatim, the full codebase, and final say
in their discipline. The harness caps concurrency at 4, and Identity blocks
everyone, so they stage:

**Wave 1 — Identity Director (alone, blocking).** New logo and wordmark from
scratch, a type system chosen on purpose, a colour system beyond "dark plus one
accent", Buddy's new form. Ships `css/tokens.css`, SVG logo, favicon, OG image,
type scale. Everything downstream inherits from this file. Nobody else starts.

**Wave 2 — Signature Moment, Motion Director, Integration.** The hero atomizer
(GPGPU or instanced points, custom GLSL, cursor- and scroll-velocity driven,
**and the LCP element**); scroll choreography, section transitions, split-text
entrances, the virtual scroll already merged but never wired, cursor presence,
Buddy's behaviour; and the gate.

**Wave 3 — Work Showcase, Narrative Layout.** Full-bleed shader-driven case
exploration with in-place live preview; speed/price/support composed as one
continuous cinematic argument with real asymmetry and negative space, owning the
contact finale.

**Ownership is by file.** `index.html` is rebuilt once, by me, from each
specialist's modules — six agents editing one document is a merge failure, and
that is what "integration lead" means here.

---

## Gates — unchanged except one

CLS 0 · 60fps at 4× CPU · **JS < 250 KB gzipped** · LCP < 1.2s on 4G.

The affordability probe may reduce particle count and resolution. **It may not
fall back to the old template** — every device gets the new design. No-WebGL
renders the same composition without the GPU, never the previous hero.

`scripts/perf.mjs` and `tests/perf.spec.ts` already implement every one of these
against real CDP throttling; they are the gate and they stay.

---

## Verification

- `bun scripts/perf.mjs <url>` after every merge; a specialist whose work breaks
  a gate is reverted, and the number is reported rather than rounded.
- **The existing suites must be rewritten, not deleted.** `tests/descent.spec.ts`
  (39 lines) and `tests/snap.spec.ts` (7 lines) assert the floor conceit that is
  being removed; they are rewritten against the new composition and must cover
  the contact form actually submitting and every surviving promise being present.
- Overflow sweep at six viewports including 1076×494 and 768×500 — the sizes that
  caught a hero escaping its section by 633px.
- `prefers-reduced-motion`, no-WebGL and touch-only all render the new design.
- Studio reference pass at 100% zoom against activetheory.net, resn.co.nz,
  lusion.co and unseen.co before building — all four verified reachable.

## Reporting

Leading with images: one screenshot per section at 100% zoom, a ~10s recording
of the hero and one transition, and before/after FPS, LCP and bundle size.
