# Pricing Engine

Agreed with Colin on 2026-11-21. This replaces the fixed price ladder in `the-line.md`.

**Goal:** find what Northbound is actually worth to the market, the way the market decides it, by having Buddy test real prices on real quotes and learn from the yeses and noes.

## What it maximizes
**Lifetime value per quote** = chance they say yes × (setup price + $49/mo × expected months they stay).

So a cheaper yes that keeps paying for a year can beat a single expensive yes.

## The test
- **Website setup prices tested:** $300 · $500 · $750. The $49/mo care plan stays fixed for now.
- **One price per week.** Everyone Buddy quotes that week gets the same price. The price can change every Monday.
- **No prices anywhere on the site.** The client first sees the price at checkout, which shows this week's price. Buddy quotes the same price if someone asks first. Nothing is in cold emails either, so a yes or no is really about the price.

## How it picks each week (Thompson sampling)
1. For each price, keep a count of yeses and noes.
2. Every Monday, simulate each price's likely close rate from its record, then compute its expected lifetime value per quote.
3. Use the price that comes out highest. Prices with less data get picked sometimes too, so the model keeps exploring.
4. Expected months a client stays starts at a guess of 12 and switches to real churn data as clients cancel or stay.

## What counts as yes and no
- **Yes:** deposit paid within 14 days of the quote.
- **No:** a clear no, or 14 days of silence after the quote.
- Only quotes sent to people who said they were interested count. Cold-email non-replies are not price data.

## Reputation: why the price should rise over time
Every quote is logged with a reputation snapshot: sites launched, number of reviews and average rating, and months in business.

- **Old results fade:** outcomes lose half their weight every 8 weeks. Noes from back when Northbound had zero clients stop holding the price down.
- **Move up:** when the top price ($750) wins 3 weeks in a row, add a new price $250 higher and drop the lowest price.
- **Never drop below $300.**

## Rules
- **A quoted price is locked for 14 days.** A client's price never changes mid-deal.
- **Existing clients keep their price,** including their $49/mo.
- Buddy never says it's a test, and never quotes two different prices to the same person.

## Data
- One log of every quote: week, price, lead, business type, outcome, and the reputation snapshot.

### Where the quote log lives (built in Build 00)
- **The price the site charges:** `data/price.json` (`week`, `setup`, `care_monthly`, `deposit_ratio`). The engine rewrites this one file each Monday and ships it. `lib/price.ts` is the only code that reads it; `api/checkout.ts` charges `setup × deposit_ratio` from it, and `checkout.html` fetches the same file to show it. It refuses a setup price under $300.
- **The record of every quote: Stripe.** Each Checkout Session is one quote. `api/checkout.ts` writes the week and setup price into the session's metadata (`nb_week`, `nb_setup` in cents, plus `nb_due`, `nb_balance`, `nb_care`, `nb_business`). The outcome is the session's own status: `complete` = yes, `expired` or still open after 14 days = no. Stripe keeps these, so nothing is lost while the Mac is off, and there is no database to run.
- **How the engine reads it:** list Checkout Sessions from the Stripe API and read the metadata. The Mac worker (Build 01) also copies each one into a plain file, `~/northbound/pricing/quotes.jsonl`, one line per event, so the dashboard can read it without calling Stripe.
- **Trail in the logs:** the site also prints one `[quote-log] {json}` line to the Vercel function log when a session is created (`quote_created`, outcome `open`) and when it is paid (`quote_paid`, outcome `yes`).
- **Quotes Buddy gives by email** (someone asks the price before checkout) are not in Stripe. Buddy appends those to the same `quotes.jsonl` when that part is built.
- The dashboard shows each price's yes/no count, its estimated lifetime value per quote, and this week's price.

## Be honest about early data
With zero clients, the first 20–30 quotes are mostly noise. The model will lean on its exploring until there are real results. That's expected; don't read the early numbers as the answer.

## Next to test (later)
Automations are priced at $100–$300/mo depending on how niche they are, and go into the same engine once the website test has data.

## Changes this needs elsewhere
- Remove every price from every page of the site except checkout. Checkout reads this week's price from the engine.
- Remove the price from the cold email and DM templates, including the Gmail draft.
