# Build 00: Remove prices site-wide

Read first: `Plans/pricing-engine.md`, `Plans/agent-team.md`, `Plans/the-line.md`

**Goal:** no price appears anywhere on northbound-dev.com except checkout. Checkout charges this week's price from one config file, which the pricing engine will write later.

1. **Price config.** Create `data/price.json`: `{ "week": "<YYYY-Www>", "setup": 500, "care_monthly": 49, "deposit_ratio": 0.5 }`. This is the single source of truth. `api/checkout.ts` computes the Stripe amount server-side from it (deposit = setup × deposit_ratio). Never trust a price sent from the browser.
2. **Remove prices site-wide.** Remove every price from `index.html` (including #packages), `build.html`, and any other public page, JS or data file. Every price call-to-action becomes "Start your site" → checkout. Keep the 7-day promise and the "$100 off if late" guarantee wording. `checkout.html` shows the price, read from `data/price.json`, not hardcoded.
3. **Retire the old packages.** `checkout.ts`, `quote.ts` and `account.ts` still carry old tiers ($875, $1,750/$3,500, $4,250/$8,500, $300/mo, $600/mo, and others). The menu is now one offer: the site at `price.json`'s setup price, a 50% deposit, plus care_monthly. Remove the old tiers. Keep the `quote.ts` and `stripe-webhook.ts` emails working, with prices pulled from the config.
4. **Log every quote for the engine.** When a checkout session is created and when a payment completes, append a record (week, setup price, session id, outcome) somewhere the pricing engine can read later. Pick a simple store and document it in `Plans/pricing-engine.md`.
5. **Tests.** Update the unit and Playwright tests that assert old prices. Add a test that fails if a "$" price appears on any public page except `checkout.html`. Run the full suite, including the headed snap project.
6. **Ship.** Commit on a branch, merge to main when green, then `bun run ship` to production. No approval is needed: Site Builder owns all Northbound code except the brand (logo, Buddy's design, core look). Verify on the live site that no price shows outside checkout, and that a test checkout reaches Stripe with the deposit from `price.json`.

**Rules:** no secrets in code; don't touch `demos/`; no fabricated claims.
