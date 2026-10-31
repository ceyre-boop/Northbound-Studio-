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
