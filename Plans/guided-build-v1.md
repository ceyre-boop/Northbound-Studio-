# guided-build-v1 — the page that closes

## Context

The homepage ends in a blank "what you need" textarea. That asks a contractor
to do the discovery himself: to imagine what a booking flow is, decide whether
he wants automations, and write it down. Colin's read, and it's right: no
emotional investment, no urgency, nothing saved and ready to order.

This replaces the asking with a guided build — a scripted Socratic flow that
takes someone from "I dunno, a website?" to a specific, priced, saved spec and
a payment, with a visual they can watch assemble while they answer. They arrive
at the paywall already knowing exactly what they're buying.

Scripted, not an LLM: Colin asked for "our script of pre set questions", and a
fixed tree keeps the sales line on-message, answers instantly, costs nothing
per visitor and cannot hallucinate a promise we'd have to honour.

## Where it lives

New `build.html` at `/build.html`, its own page so the homepage stays
script-free and instant. Every "Get a quote" CTA on `index.html` points there.
The plain form stays on the homepage at `#quote` as the no-JavaScript path, and
`build.html` ships that same form in its HTML, with JS replacing it — never a
blank page.

## The flow — one question per screen, and the order IS the sales logic

1. **What kind of business?** trades & home services · food & drink · salon,
   spa or fitness · shop or store · professional services · something else.
   Sets the vocabulary and the preview for everything after.
2. **When someone wants to buy from you today, what happens?** they call me ·
   they message me on Facebook or Instagram · nothing, I hope they find me ·
   I have a site but it doesn't do anything.
3. **What do you want more of?** booked jobs · quote requests · orders · people
   walking in · being found at all. Multi-select, minimum one.
4. **What's one new customer worth to you?** under $200 · $200–$1,000 ·
   $1,000–$5,000 · more than $5,000. **Asked before any price appears**, so the
   price later reads as arithmetic rather than a number.
5. **Who answers when someone asks at nine at night?** me, always · my partner
   or family · nobody, it waits until morning.
6. **Do you want to run it, or should we keep it running?** — the Bearing
   question, in the words Colin uses for it.
7. **Pick the look** — five real thumbnails rendered from the existing spec-kit
   templates (`~/northbound-outreach/templates/looks/0*.html`), generated with
   Playwright into `brand/looks/`. This is the touch-and-feel moment.
8. **Your build** — the spec sheet below.

Keyboard accessible, back and forward, progress indicator, `aria-live` per
step, generous tap targets, honest "not sure yet" everywhere, reduced-motion
respected.

## Buddy hosts it

His existing stills (`buddy-thinking-sm.webp`, `buddy-salute-sm.webp`,
`buddy-awesome-320w.webp`) beside the questions, one short line per step in the
studio's plain voice, pose swapping with the mood. Example, after "nobody, it
waits until morning": *"That's the one that costs you. An enquiry that waits
overnight usually doesn't wait."* Never cutesy, never a statistic we can't back.

## The visual aid — a phone that builds itself

Beside the questions, a phone frame assembling live as they answer: their
business name in the header, a hero line in their trade's language, a tappable
Book-a-time / Get-a-quote / Order button the moment they pick it in step 3, a
Text-us bar if nobody answers at night, and their chosen look's palette and
type applied at step 7. CSS and DOM, no iframes. Anything resembling a review
or a rating is labelled "example".

## The spec sheet — the close

- **What you're getting:** the parts, named exactly as the twelve offerings are
  named on the live site, selected by their answers.
- **The package** it adds up to — Cheap and Clean $600 · Beacon $1,750 founding
  · Engine $4,250 founding — with the standard price struck through, plus
  Bearing $300/mo and its two terms if they chose "keep it running".
- **The payback line in their own number:** "One $1,000–$5,000 job covers this
  build." Their bracket, phrased as their number, with no invented conversion
  rate or revenue claim.
- **What happens next:** 50% upfront, what they get first, when.
- **Reserve my build** (carries the spec into `checkout.html`) and **Email me
  this build**.

## Saved and ready to order

- `localStorage` as they go; on return, "your build is waiting" with resume or
  start over.
- The spec also encodes into a compact URL, so "Email me this build" produces a
  link that restores it exactly on any device — no database.
- `checkout.html` and `api/checkout.ts` accept the spec: a hidden encoded
  field, pricing still **only** from the server table, and a readable build
  summary in both the studio notification and the customer confirmation.
- **No countdown, no spots-remaining, no deadline.** The only scarcity remains
  the fixed "first 15 founding clients".

## Constraints

- Vanilla JS modules, no dependencies, no build step, page JS under ~25KB gz.
- Excellent at 390px — the preview may move above or below the question there.
- CLS 0, LCP unaffected (flow JS loads after first paint), works with JS off.
- No new fonts, no CDN; only the generated look thumbnails and Buddy's stills.

## Verification

- Walk the whole flow with Playwright at 390×844 and 1280×800, screenshot
  **every step** plus the spec sheet and the restored-from-link state, look at
  all of them, fix what's ugly, twice.
- Full run-through recorded as `guided-build.mp4`.
- `tests/build.spec.ts`: every step advances and goes back; multi-select
  minimum; the spec sheet is correct for three named answer paths; localStorage
  restore; URL restore; Reserve carries the spec into checkout; no-JS shows the
  plain form; no horizontal scroll at 390px; CLS 0; zero console errors.
- Checkout additions unit-tested with a mocked `fetch`, as
  `tests/checkout.unit.test.ts` already does.
- Built by a Fable builder (this is sales-copy and visual judgement work),
  reviewed by me before merge, then shipped with `bun run ship`.

## Open items, numbered as requested

1. Buddy in the hero — built and tested on `buddy-video-v1`, waiting on a word.
2. Stripe terms + `vercel integration add stripe` — until then checkout
   captures orders instead of charging.
3. Atera removal — needs sudo in Terminal.
4. Bearing month-to-month doubling in month two — a pricing decision.
5. Founding Engine $4,250 equalling the standard Engine deposit — same.
6. `salvage-v1` — support exchange, previewed, unmerged.
7. `sellable-v1` — the full conversion rebuild, parked.
8. Unshipped inventory: hero atomizer, glass work panels, full-bleed showcase,
   Buddy-as-narrator.
9. A clean full test-suite run — never completed; the machine was pegged.
10. Active Theory references for the flagship look.
