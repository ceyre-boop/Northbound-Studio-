/* js/checkout-build.js — checkout.html, when it arrives with a build.
 *
 * build.html's "Start your site" links here as checkout.html?s=<code>, and so
 * does the picker on the twelve. This reads the code and does two things:
 *
 *   1. Shows what they told us — the parts, anything that is quoted
 *      separately, and their answers — with a link back to change it.
 *   2. Carries the code in the hidden `spec` field, so api/checkout.ts can
 *      describe the build in both emails.
 *
 * There is one offer, so there is nothing to switch and nothing to price
 * here: checkout.html shows the price itself, from the server. Every element
 * is optional — a checkout page without the build card still works.
 */
import { decode, encode, build, describe, isPicked } from './spec.js';

const code = new URLSearchParams(location.search).get('s') || '';
const a = code ? decode(code) : null;
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (a) {
  const b = build(a);
  const packed = encode(a);

  const spec = $('#spec');
  if (spec) spec.value = packed;

  const parts = $('#build-parts');
  if (parts) parts.innerHTML = b.parts.map((p) => `<li>${esc(p)}</li>`).join('');

  /* Parts beyond the site are still their picks, so they are named here
     rather than dropped on the way to the order. */
  const extra = $('#build-extra');
  if (extra) {
    extra.hidden = b.extra.length === 0;
    extra.textContent = b.extra.length ? `Quoted separately: ${b.extra.join(', ')}.` : '';
  }

  const answers = $('#build-answers');
  const change = $('#build-change');
  const back = $('.back');
  if (isPicked(a)) {
    /* From the twelve: there are no answers to recap, and "change it" means
       the panels, not the questions. Carry the picks home too, or "change
       it" would mean "start again". */
    if (answers) answers.textContent = `Picked from the twelve: ${b.parts.length ? b.parts.join(', ') : 'nothing yet'}.`;
    const home = `/?s=${encodeURIComponent(packed)}#offerings`;
    if (change) change.href = home;
    if (back) { back.href = home; back.textContent = '← Back to the twelve'; }
  } else {
    const d = describe(a);
    if (answers) {
      answers.textContent = [
        d.business, `today: ${d.now}`, `wants more: ${d.want}`, `one customer is worth (in dollars): ${d.worth}`,
        `nine at night: ${d.answers}`, `running it: ${d.run}`, `look: ${d.look}`,
      ].join(' · ');
    }
    const backHref = `build.html?s=${encodeURIComponent(packed)}`;
    if (change) change.href = backHref;
    if (back) { back.href = backHref; back.textContent = '← Back to your build'; }
  }

  const card = $('#build-card');
  if (card) card.hidden = false;
}
