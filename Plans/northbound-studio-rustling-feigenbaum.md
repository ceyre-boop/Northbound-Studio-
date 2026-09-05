# Pass 2 — the three concept builds

## Context

Pass 1 gave Floor 02 a portfolio rail with live previews, but the three things it
previews are holding pages. Until they are real, Floor 02 is a frame around
nothing and the whole site's central claim — "here is what we build" — is
unevidenced. Pass 2 builds the three demos the rail points at.

They are the portfolio, so the bar is not "a demo": each must be a site a real
owner of that trade would pay $1,500–$2,500 for, and the difference from a
template has to land on a stranger's phone in five seconds.

### The constraint that reshapes everything

The site is a single static GitHub Pages repo with **no build step** — the
workflow uploads the repo as-is. The brief needs three things Pages cannot do:

- **Vector's Stripe Checkout session and webhook endpoint** need a server.
- **`/demos/atlas/studio` behind basic auth** needs request-time middleware.
- **Keeping the `/demos/*` paths** needs a proxy in front; Pages can only
  redirect, which would change the URL in the address bar.

**Decision: move northbound-dev.com to Vercel.** Vercel CLI is already
authenticated (`ceyre-boop`, team `taboost`). Four projects — the descent plus
one per demo — with rewrites on the main project so `/demos/*` proxies to the
framework project behind it. The paths in the brief survive exactly, and each
demo gets the runtime its stack actually needs.

**The domain does not change.** `northbound-dev.com` stays the address, keeps its
HTTPS, and stays yours at Squarespace — Vercel serves custom domains, so the only
thing that moves is which records the domain points at. Nothing about the URL a
visitor types is different, and the cutover is staged so the site is never down:
Pages keeps serving until the Vercel copy is verified on a `*.vercel.app` URL,
and the old records go straight back if anything is wrong.

Today: apex `northbound-dev.com` → `185.199.108-111.153` (Pages),
`www` → `ceyre-boop.github.io`, nameservers at Squarespace.

---

## Architecture

| Vercel project | Serves | Stack | Output |
|---|---|---|---|
| `nb-descent` | `/` — the existing descent, unchanged | static, no build | repo root |
| `nb-atlas` | `/demos/atlas/*` | Astro + Sanity | static + 2 server routes |
| `nb-vector` | `/demos/vector/*` | Astro + Stripe | hybrid (SSR endpoints) |
| `nb-halo` | `/demos/halo/*` | Next.js + R3F | static + form route |

`vercel.json` on `nb-descent` rewrites `/demos/<name>/:p*` to the matching
project. Each demo sets its framework's base path (`base: '/demos/atlas'` in
Astro, `basePath: '/demos/halo'` in Next) so its own links and assets resolve
identically whether reached directly or through the proxy.

Demo sources live in this repo under `demos/<name>/` (replacing today's holding
pages), each its own workspace with its own `package.json`. The committed
static holding pages are deleted once the real build is deployed.

---

## Stage 0 — Vercel migration (before any demo work)

1. `.vercelignore` for `node_modules/`, `tests/`, `Plans/`, `playwright.config.ts`.
   `vendor/` must ship — the descent loads React from it.
2. Create `nb-descent`, deploy the repo root as a static project, and verify the
   descent on its `*.vercel.app` URL: snap navigation in headed Chrome,
   Lighthouse mobile still 93, `vendor/` React resolving.
3. Only once that passes, repoint DNS at Squarespace — apex A → Vercel,
   `www` CNAME → `cname.vercel-dns.com` — using the **`configure-site` skill**,
   which already knows that panel. The live site stays on Pages until this step,
   so there is no window where northbound-dev.com is down.
4. After the cutover verifies, disable `.github/workflows/deploy-pages.yml` so
   two pipelines are not fighting over one domain.

**Rollback:** restore the four A records and the `www` CNAME; Pages is still
serving from `main` untouched.

---

## Rules applied to all three demos

Shared, and enforced by the Playwright suite rather than by memory:

- **The fiction bar.** A persistent top bar on every demo page:
  `CONCEPT BUILD BY NORTHBOUND STUDIO · <BUSINESS> IS A FICTIONAL BUSINESS ·
  [Build yours →]` linking to `/#floor-7`. The only Northbound branding on the
  page, and the only place that uses `_ds` tokens — each demo otherwise gets its
  own palette and type so the three read as three studios' work.
- **No fabricated credibility.** No reviews, testimonials, ratings, "as seen in",
  client logos or results. Phones are `555`, address is
  `123 Example St, Grand Ledge, MI`, email is `hello@northbound-dev.com`.
  Same rule Pass 1 wrote into `js/site-config.js` — it now covers the demos too.
- **Forms actually submit.** Each demo posts to its own server route, which
  forwards to the existing Formspree endpoint (`xpwzgvkn`, already in
  `index.html`) with a `demo` field so submissions are tagged. Server-side keeps
  the endpoint out of the client. Real success state, no fake spinner.
  *Note: Formspree's free tier caps monthly submissions — worth watching once
  three demos share it.*
- **`noindex`** on every demo page; `/demos` reachable, not ranked.
- **Mobile first at 390×844**, desktop the enhancement.
- **Accessibility floor:** keyboard-navigable, visible focus, `prefers-reduced-motion`
  honoured, AA contrast, alt text on every image.
- **Images** generated royalty-free, served AVIF/WebP with explicit dimensions
  through Astro's/Next's image pipeline.
- **Performance measured, then published.** Ship, run Lighthouse mobile ×3 on the
  deployed URL, take the **median** LCP, and only then write it into the Floor 02
  tech line. Never the other way round.

---

## Stage 1 — Atlas → Ridgeline Roofing (Astro + Sanity)

Warm, high-contrast, photographic: charcoal + safety orange + off-white, heavy
grotesk display, humanist body. Should feel like a company with trucks.

**Pages:** Home · Services (replacement, repair, storm damage, gutters,
inspections) · Service area · About · Book a call · Financing (explainer only,
no figure that reads as an offer).

**Home, in order:** full-bleed hero ("Roof problems don't wait. Neither do we.")
with *Book a free inspection* and a tap-to-call `555` button, over a
fiction-safe trust strip · dismissible storm banner shown only on `?storm=1`,
so the client can see a seasonal switch · 5-card services grid · "Inspect →
Quote on the spot → Fixed price, no surprises" · static SVG county map, no live
embed · booking form · footer with hours and `LIC# 0000000`.

**Booking form:** name, phone, address, issue chips (Leak / Storm / Replacement /
Not sure), preferred time (Morning / Afternoon / ASAP). Three fields above the
fold at 390px. Success state: *"Got it. We'll text you within the hour to confirm."*

**The thing that sells it:** the sticky mobile bottom bar — Call and Book —
appearing once the hero scrolls out.

**Sanity:** schemas for services, service-area towns, hours, the storm banner and
the trust strip. Studio at `/demos/atlas/studio`, gated by Astro middleware doing
HTTP Basic auth against a Vercel env var. **The build never depends on a live CMS
call** — it fetches at build time and falls back to a committed `content.json`,
which is also what makes Atlas shippable before Sanity credentials exist.

**Verify:** booking form submits on iOS Safari; tap-to-call opens the dialer;
Lighthouse mobile perf **≥ 95**; LCP < 1.0s; CLS < 0.05; no third-party scripts.

---

## Stage 2 — Vector → Marrow Coffee (Astro + Stripe)

**Blocked until Stripe test keys exist** (`sk_test_…` / `pk_test_…` in Vercel env).
Everything else can be built against them.

Editorial and quiet: bone, espresso, one muted sage accent; serif display,
generous whitespace, product shots on plain backgrounds. Like a printed menu.

**Pages:** Home · Shop · Product · Cart (right-hand drawer, not a page) ·
Stripe hosted Checkout · Order confirmed · Visit · Our roasting.

**Commerce:** 6 products (beans $16–22, a mug, a gift card) with 12oz/2lb and
whole-bean/ground variants. Cart is a nanostore persisted to `localStorage`.
Checkout hands off to **Stripe Checkout in test mode**; the drawer carries the
honesty label that doubles as an invitation — *"Demo store — use card
4242 4242 4242 4242."* Pickup vs shipping toggle changes the Stripe shipping
options. The confirmation page reads the session, shows the summary and says
*"This was a demo — nothing was charged."* A logged webhook endpoint proves
there is a backend rather than a form-to-email. Footer: *"Built with: Astro,
Stripe. That's it."*

**Verify:** a full test-mode purchase on mobile; refresh mid-cart and the cart
survives; Lighthouse mobile perf **≥ 90** with Stripe loaded.

---

## Stage 3 — Halo → Lumen Interiors (Next.js + R3F)

Near-black, warm white type, one gold hairline. Light display serif, wide
tracking. Everything earns its motion; nothing bounces.

**Pages:** Home (one long scroll) · Projects · Project detail ×3 · Studio · Enquire.

**Home scroll:** R3F room whose materials swap oak → walnut → stone on scroll,
camera drifting on pointer, over *"Rooms that photograph like they feel."* ·
three scroll-pinned project reveals with caption drawers · a horizontal strip of
8 PBR material spheres that tilt on hover/tap · a three-step process with a
hairline that draws in · the enquiry form (name, email, project-type chips,
budget bands topped with "Not sure yet", message).

**Constraints that are the actual work:** `prefers-reduced-motion` renders one
static frame and turns pinned sections into ordinary ones. Mobile caps at 30fps
with lower geometry and no post-processing. **No WebGL → poster image; the page
must never be blank.** The R3F bundle loads below the fold and the hero LCP is a
poster, never the canvas.

**Verify:** 60fps desktop, no jank on an iPhone 12-class device, zero animation
on the reduced-motion path, Lighthouse mobile perf **≥ 80** — and that number
gets published as measured, since it is the trade Halo buyers accept.

---

## Wire-back (after each demo ships, not held for the last)

- Floor 02 card: eyebrow `CONCEPT BUILD`, one line of *what it does*, the
  **measured** median LCP, `Open site ↗`. Copy lives in `js/site-config.js`.
- Floor 06 "See it built ↗" already cross-links; point it at the real demo.
- Floor 07: choosing a direction pre-fills *"I'm interested in something like
  [Atlas]"* — extends the existing `picked` state in `index.html`.
- `/demos` added to the sitemap, `noindex` on the demos themselves.

---

## Verification

Per demo, before its PR merges: `bunx playwright test` green (the existing
40-test suite plus a new `tests/demos.spec.ts` asserting each demo's primary
form submits, the fiction bar is present and links to `/#floor-7`, and every
demo page carries `noindex`); Lighthouse mobile ×3 on the **deployed** URL with
the median recorded in the PR; a headed-Chrome pass on a real device viewport.

The Pass 1 snap suite must stay green in headed Chrome throughout — the descent
is now served by Vercel rather than Pages, and `tests/snap.spec.ts` is what
proves the move did not break it.

---

## What I need from you, and when

1. **Nothing to start.** Stage 0 and all of Atlas can be built and shipped
   against the committed content fallback.
2. **Before Sanity goes live on Atlas:** a Sanity project (I can create it via
   CLI under your login) plus a read token, and a password for the Studio route.
3. **Before Vector:** Stripe **test-mode** keys. Test mode only — no live key
   should ever reach this repo.

## Out of scope

The R3F/cable/BUDDY rewrite on the main site is still Pass 3. No changes to the
descent beyond the Floor 02/06/07 wire-back above.
