# Northbound Studio — northbound-dev.com

A two-person studio in Grand Ledge, Michigan. This repo is the studio's site,
and the site is the portfolio piece: four hand-written WebGL systems on one
canvas, sharing one render loop, with no framework and no build step.

The argument the page makes is that the engineering is real. So the page has to
be able to prove it, and the proof is not a claim — it is a number the site
measures about itself.

## The rule this repo is built around

> Do not put a result, a metric or a client name here that did not happen. A
> fabricated "booked 34 jobs" is the one claim that cannot be defended. There is
> no panel until there is something behind it.
>
> — `js/content.js`

It has teeth. It has already killed a case study that advertised
"Next.js · React Three Fiber" over a static placeholder with no JavaScript in
it, and rewritten a support-chat mockup nobody could point to an incident for.
Three things were cut from the previous version of this site under it and must
not come back without something real behind them: a "48 hrs first live build"
claim that was an intention and never a performance, a hand-set `SPOTS_LEFT`
integer dressed up as scarcity, and the Halo case study.

Every number on the page is either a price the studio sets, or a figure written
by `scripts/perf.mjs` into `data/perf-budget.json` and read at runtime. There is
no third category, and `tests/budget.spec.ts` enforces it.

## Architecture

```
index.html            the site. Readable, linkable and submittable with no JS
                      and no WebGL. FROZEN during parallel builds.
css/stage.css         tokens, type, layout, the four act containers
css/act-*.css         one per act, one owner each

js/motion.js          the ONLY requestAnimationFrame on the page, plus the
                      spring integrator. Frozen, read-only.
js/gl/gl-core.js      raw WebGL boilerplate. Frozen, read-only.
js/gl/afford.js       device budget (NOT motion preference — see below)
js/stage/stage.js     one canvas, one context, one loop, four acts.
                      Its header comment is the act contract.
js/stage/cast.js      the four acts, their scroll windows and budgets
js/acts/*.js          one act each, ES modules, lazily imported
js/content.js         everything the site says
js/proof.js           reads data/perf-budget.json into the page

scripts/perf.mjs      the measurement harness and the only thing that may
                      write data/perf-budget.json
```

### Tier and mode are orthogonal

`tier` (1–3) is how much GPU budget the machine has. `mode` (`full` / `reduced`)
is whether the visitor wants motion. Collapsing these into one flag is a bug
this repo shipped once: `afford.js` used to answer "cannot afford" whenever
Reduce Motion was set, and since the machine this site is built on has Reduce
Motion on system-wide, every local session resolved to the cheapest tier and
nobody working here ever saw the full-quality path.

**Reduced motion is the default local experience, so it is a first-class
deliverable.** Every act composes one still, art-directed frame under
`drawStill()` — never a blank canvas. Use `?motion=full` to see the animated
path locally.

### Useful query parameters

| | |
|---|---|
| `?motion=full` | force the animated path (needed on any machine with Reduce Motion on) |
| `?motion=off` | force the still path |
| `?tier=1` `?tier=2` `?tier=3` | force a quality tier |
| `?strict=1` | Stage snapshots GL state around every act's `draw()` and throws, by act name, on anything left dirty |

## Running it

```sh
bun run serve        # static server on :8099 — there is no build step
bun run test         # Playwright: desktop, mobile, desktop-reduced, snap-chrome
bun run perf         # the gates, against the live site
bun run perf:emit    # re-measure and rewrite data/perf-budget.json
```

`data/perf-budget.json` is generated, committed, and never edited by hand. If
`tests/budget.spec.ts` fails on drift, the fix is to re-run `perf:emit` and
commit the result — regenerating the truth, not editing the claim.

## Deploy

Vercel, static, `outputDirectory: "."`, no install and no build. `CNAME` holds
`northbound-dev.com`. The two concept builds under `/demos/` are separate Vercel
projects proxied in by the rewrites in `vercel.json`; their sources live here but
are excluded from the deployed bundle by `.vercelignore`.
