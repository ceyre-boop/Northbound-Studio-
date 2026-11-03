# Northbound: sell ready-made products, re-theme to Buddy's blue/graphite

## Context
Colin builds with VS Code / Antigravity / Claude Code. The site currently sells custom
agency work (Beacon $3,500, Engine $8,500, Bearing $600/mo) in teal + amber, and nowhere
says "buy something I've already made." Goal: the site sells packaged, ready-made products
(buy one thing, get it), and its palette matches Buddy (navy `#2434A9`, graphite `#2E2F34`,
near-black, violet glow `#A18CFF`).

Constraints that survive: the README honesty rule (no invented results, clients, scarcity),
no CDN / no new fonts, readable without JS, `studio.html` proof block intact. Do NOT write
"built with Claude Code" as a hero claim; say it once, plainly, in the how-it's-made line.

## Decisions already made
- First shelf: Atlas (roofer site), Vector (coffee-shop store), booking/follow-up/dashboard kit.
- Work on `dev`, Vercel preview, merge to `main` only on Colin's chat confirmation (two-branch rule).

## Finding that changes scope
There are two homepages. `index.html` is `/` (white, green `#0E6F5C`, Buddy video, live
prices). `studio.html` is the dark WebGL four-act page the README and perf tests treat as
the site. Both get the new message and palette; `index.html` is the bigger job (light to dark,
about 71 hex values). Recommend ending with ONE canonical homepage (`/` = dark stage) and
`index.html` content folded in, but only after steps 1-3 land.

## Steps (ship in this order, each is independently deployable to dev)
1. **Offer copy.** `js/content.js` (arrival, drift, packages, pricingNote) + hardcoded
   `<h1>`/title/meta/og in `studio.html` and `index.html`. New line: you buy a finished
   product, it is yours, here is what is in the box. Replace Beacon/Engine/Bearing cards
   with three product cards (Atlas, Vector, Booking kit). Each card states what it is and
   links to its real demo; concept work stays labelled as concept. Keep Bearing as optional
   upkeep. `js/offerings/content.js` (12 offerings) re-tagged to products.
2. **Palette tokens.** `css/stage.css` `:root`: swap aurora `#4FD8C4` to Buddy blue/violet,
   signal `#E0A05C` to a cool glow, ink to blue-black/graphite. `index.html` and `build.html`
   `:root` get the same tokens (they carry their own palettes). Update `theme-color` meta.
3. **Shader/GL colors** (duplicated, not read from CSS): `js/gl/offering-loops.js`,
   `offering-material.js`, `drift-shaders.js`, `northlight-shaders.js`, `js/acts/solution.js`
   (`AURORA`), `typeraster.js`, plus `css/act-*.css`, `hero-stencil.css`, `mascot.css`,
   `hero-tag.css`. Consolidate into one exported palette constant so this is the last time.
4. **Buddy.** Use only the real Buddy (`brand/3d/buddy.glb`, stills, wave/point video).
   Retire the teal/gold tagger and orange `brand/buddy.svg` from visible placements. No new
   Buddy lore, not presented as an AI that replies to leads.
5. **Checkout is product-shaped, not deposit-shaped.** `api/checkout.ts` (PRICES, BUYABLE),
   `api/quote.ts`, `api/stripe-webhook.ts`, `checkout.html`, `account.html`, `js/spec.js`
   and `build.html` all assume 50% deposit + balance on delivery. Products need full price
   and a delivery step. Ship steps 1-4 with "Get this product" going to the existing quote
   form, then convert checkout as a separate pass.
6. **Tests.** Update the pins that assert old packages: `tests/checkout.unit.test.ts`,
   `spec.unit.test.ts`, `build.spec.ts`, `home.spec.ts` (price card titles; already 2
   failing), `polish.spec.ts`, `question.spec.ts`, `motion.spec.ts`. Any edit to `js/`,
   `css/` or `studio.html` means rerun `bun run perf:emit` and commit it after the code commit.

## Needs Colin's input before step 1 ships
Product prices and exactly what is in each box. I will not invent them.

## Verification
- `bun run test` (fast lane), then frame-timing specs serially (`acts`, `stage`, `motion`, `offerings`, `perf`, `reveal`).
- `bun run perf:emit` and `tests/budget.spec.ts` pass; `fallbackWebgl` gate not regressed.
- Open the dev preview in Chrome (full motion via `?motion=full`; Reduce Motion is on locally) on `/` and `/studio.html`: screenshot hero, packages, offerings helix; console and network clean.
- Mobile pass via Playwright device emulation (Chrome extension fakes resize).
- Grep for leftover `4FD8C4`, `E0A05C`, `0E6F5C`, "Beacon", "Engine" outside intentional places.
