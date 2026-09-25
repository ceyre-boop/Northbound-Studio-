/* js/config.js — the one place the site's outside addresses live.
 *
 * GOOGLE_REVIEW_URL is where "Leave your Google review" goes, on the quote
 * form and at checkout. The pages carry it as a plain href so the link works
 * with JavaScript off; api/checkout.ts keeps the same constant for the
 * emails (api/quote.ts imports it from there). tests/checkout.unit.test.ts
 * asserts that this file, the server's copy and every href on the pages are
 * the same string, so the four cannot drift apart unnoticed.
 */
export const GOOGLE_REVIEW_URL = 'https://www.google.com/maps/search/?api=1&query=Northbound+Studio+470-573-8908';
