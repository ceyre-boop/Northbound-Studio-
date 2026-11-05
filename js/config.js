/* js/config.js — the one place the site's outside addresses live.
 *
 * GOOGLE_REVIEW_URL is the Google Business Profile's own "Ask for reviews"
 * short link, which opens the review box for OUR profile. That specificity
 * matters more than it sounds: there is a second Northbound Studio — a
 * marketing agency in Grandville, same name, same state, same trade — so any
 * link built out of a name search was a coin flip between us and them. A
 * g.page/r/ link cannot resolve to anyone else.
 *
 * Empty turns the whole founding-review flow off: no link, no field, and
 * neither server requires a review name. The pages carry the URL as a plain
 * href so the link still works with JavaScript off; api/checkout.ts keeps the
 * same constant for the emails and api/quote.ts imports it from there.
 * tests/checkout.unit.test.ts holds every copy to this one.
 */
export const GOOGLE_REVIEW_URL = 'https://g.page/r/CRFQRq5WLg6HECE/review';

/* THE TEMPLATES. The two concept builds under demos/ (Atlas, the trades site;
 * Vector, the small shop) sold as source. templates.html prints these prices
 * as plain text and tests/templates.spec.ts keeps the page and this table
 * equal. `url` is where "Buy" goes (a Gumroad product page, or a Stripe
 * Payment Link); while it is empty the page shows the honest alternative, a
 * "tell me when it's out" form that lands in the studio inbox through
 * api/quote.ts. Prices are the studio's to set; these are the launch prices.
 */
export const TEMPLATES = {
  atlas: { name: 'Atlas', price: 79, url: '' },
  vector: { name: 'Vector', price: 79, url: '' },
  both: { name: 'Both', price: 129, url: '' },
  /* The engine: a booking-and-deposit flow, sold as source like the two
     templates. `demo` is the live demo's url; empty hides the demo link. */
  engine: { name: 'The booking engine', price: 2000, url: '', demo: '' }, // $2,000: Colin's call, 2026-11-05
};
