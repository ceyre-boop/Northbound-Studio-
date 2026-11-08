# templates-v1 — the realistic options, made real

## Context

Outside research put four income lines in front of the studio: sell the
studio's own builds as templates; a micro-SaaS for local service businesses;
affiliate content; vending machines. Its own bottom line: none is passive,
none fixes the money picture this quarter, and distribution, not building, is
the work. Vending is parked (the capital is the car fund). This plan turns the
other three into decisions, and the first one into a page.

## What the repo already had

The two concept builds under `demos/` are finished, deployed products:

- **Atlas** (Ridgeline Roofing): an Astro 5 trades site built around booking
  the call. Six pages, a storm banner, a sticky call bar, and a booking route
  (`src/pages/api/book.ts`) that logs the lead before it forwards it.
- **Vector** (Marrow Coffee): an Astro 5 shop with Stripe Checkout. Server-side
  pricing from the catalogue, a cart that survives a refresh, a webhook that
  verifies each paid order.

Both keep all content in one JSON file, both run on Vercel's free tier, both
carry a "fictional business" bar on every page. That is a template product
with the honesty built in. The five "looks" the guided build shows are
thumbnails of templates in a separate outreach repo that this session could
not reach; they can join the shop later.

## Decisions

1. **Templates first.** Sell Atlas and Vector as source. Launch prices (the
   studio's to change, in `js/config.js`): $79 each, $129 both.
2. **Delivery through a shop that already does delivery.** A Gumroad product
   (no monthly fee) or a Stripe Payment Link, with the zip attached. The
   studio's own Stripe checkout could sell these too, but automated delivery
   of a private file is a few hundred lines and a new way to fail; not worth
   it before the first ten sales.
3. **Micro-SaaS waits on the templates.** The research's own gate: if the
   templates cannot find ten buyers from the studio's own network, the
   distribution problem is real and a subscription tool would hit it harder.
   The lane, when it comes, is local service businesses (the Atlas buyer),
   never TikTok agencies.
4. **Affiliate content: no.** It pays after a year of weekly publishing and
   fits nothing else the studio does.

## What this change ships

- `templates.html`: the product page, in the dream system. Every line about a
  template is a claim about a file in `demos/`. While no shop url is set, each
  build has a "tell me when it's out" form (name and email, through
  `api/quote.ts`, into the studio inbox) instead of a Buy button. Setting
  `TEMPLATES.<name>.url` in `js/config.js` swaps the form for the button.
- `templates/README.md` and `templates/LICENSE.md`: the buyer's thirty-minute
  setup (the five things to change: the fiction bar, the base path, the
  noindex header, the environment variables, the content file) and a licence
  in plain words (one business, yours to keep, not yours to resell).
- `scripts/templates.ts`: builds `dist/templates/nb-atlas.zip` and
  `nb-vector.zip` from the demos, with the README, the licence and a stamp
  naming the commit. `dist/` is ignored by git and by the deploy.
- Homepage: a "Templates" link in the nav and the footer, and a quiet fourth
  row under Packages.
- `tests/templates.spec.ts`.

## What only Colin can do

- [ ] Create the shop product (Gumroad or a Stripe Payment Link), upload the
      zips from `bun scripts/templates.ts`, paste each url into
      `TEMPLATES.*.url` in `js/config.js`, and set the prices he wants.
- [ ] Decide whether the five looks from the outreach repo join the shop.
- [ ] Drive the first sales from his own network before expecting marketplace
      discovery: the research is explicit that a large share of listings
      never sell once.
- [ ] Count to ten. Ten buyers opens the micro-SaaS question; fewer answers it.

## Addendum: the engine (2026-11-05)

The templates sell the front. The thing that actually makes money while
nobody is watching is the flow behind it, so the first engine is built and
listed: `engines/trades`, a booking-and-deposit flow for a trade business. One HTML page, one config file, two Vercel functions, no
dependencies. Six screens, the price derived on the server from the config,
a Stripe Checkout Session for what is due, a webhook that emails both sides
when it is paid, and a request path (no payment) for estimates, for a Stripe
that is not set up, and for visitors without JavaScript. Nothing a customer
does can lose a booking.

Colin's call (2026-11-05): the engine is for any trade business, not one
vertical. The code never knew a trade; the config does. So the folder is
`engines/trades`, the shipped config is the heating-and-cooling demo, and
`examples/` carries the same file for plumbing, electrical and roofing. The
services, the property types, the urgency options and the windows are all
data. The price is $2,000, also his call, the same day.

Listed on templates.html as the third product at $2,000, with
the same honest form until a shop url is set, and
a demo link that appears only when `TEMPLATES.engine.demo` is set.
`scripts/templates.ts` packages it as `nb-engine-trades.zip`.

What only Colin can do, added to the list above:

- [x] Deploy `engines/trades` as its own Vercel project (nb-engine-trades-demo,
      2026-11-05) and set `TEMPLATES.engine.demo` to it (2026-11-07).
- [ ] Finish the Stripe test on it: a test booking reached the server and
      Stripe refused the session (the booking fell back to a request, as
      designed). Check the key is a full test secret key, not a restricted
      one, book with the test card, and confirm both emails arrive.
- [x] Set the price in `TEMPLATES.engine.price`. $2,000, 2026-11-05.
