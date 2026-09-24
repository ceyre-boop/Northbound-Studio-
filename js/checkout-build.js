/* js/checkout-build.js — checkout.html, when it arrives from build.html.
 *
 * build.html's "Reserve my build" links here as checkout.html?buy=<package>
 * &s=<code>. This reads both and does four things:
 *
 *   1. Switches the order to the package they chose. Cheap and Clean is the
 *      page's no-JavaScript default; Beacon and Engine are the founding 50%
 *      deposit now and the balance on delivery, in those words.
 *   2. Shows the build they assembled, part by part, with a link back.
 *   3. Pre-ticks Bearing if they asked us to keep it running.
 *   4. Carries the code in the hidden `spec` field, so api/checkout.ts can
 *      describe the build in both emails.
 *
 * The amounts written here are for display. The form posts only the package
 * key, the add-ons and the code; api/checkout.ts prices from its own table.
 */
import { PACKAGES, decode, encode, build, describe, isPicked, money } from './spec.js';

const params = new URLSearchParams(location.search);
const buyKey = params.get('buy');
const code = params.get('s') || '';
const a = code ? decode(code) : null;
const pkg = buyKey && PACKAGES[buyKey] ? PACKAGES[buyKey] : null;

const $ = (sel) => document.querySelector(sel);
const form = $('#order');
if (!form) throw new Error('checkout-build: no order form');

const INCLUDES = {
  beacon: ['A custom site, up to five pages', 'Brand identity', 'Local SEO', 'Hosted free, forever'],
  engine: ['Everything in Beacon', 'Booking and quote flows, payments, lead capture', 'Automated follow-up, reminders, review requests', 'Owner dashboard', 'Hosted free, forever'],
};

if (pkg && pkg.key !== 'clean') {
  document.title = `Checkout — ${pkg.name} — Northbound Studio`;
  $('h1').textContent = pkg.name;
  $('.line h2').textContent = pkg.name;
  $('.line .amt').innerHTML = `${money(pkg.deposit)} <span>now</span>`;
  $('.desc').textContent = `${pkg.tag} Founding price ${money(pkg.price)}, standard ${money(pkg.standard)}: ${money(pkg.deposit)} now, ${money(pkg.price - pkg.deposit)} on delivery. 50% up front, always. No deposit, no work.`;
  $('.includes').innerHTML = INCLUDES[pkg.key].map((t) => `<li>${t}</li>`).join('');
  form.querySelector('input[name="buy"]').value = pkg.key;
  form.setAttribute('data-today', String(pkg.deposit));
  form.setAttribute('data-balance', String(pkg.price - pkg.deposit));

  // Changes and support at $49/mo is Cheap and Clean's add-on: a build with a
  // human already behind it does not need to buy a human reply.
  const care = form.querySelector('input[name="care"]');
  if (care) { care.checked = false; care.closest('.addon').hidden = true; }

  // Bearing's copy says "built for Engine sites; available here if you want
  // it" — for Beacon and Engine that hedge is wrong, so say it straight.
  const bearingDesc = form.querySelector('[data-bearing-toggle]').closest('.addon').querySelector('.d');
  if (bearingDesc) bearingDesc.textContent = 'The full care plan: hosting, monitoring, backups, unlimited small edits, your automations kept running, and a monthly report on where the calls came from. Not charged today; the first monthly charge is next month. One of the first 15 founding clients only — pick a term below.';

  // The founding claim is needed for the package itself now, not only for
  // Bearing.
  const note = document.getElementById('founding-note');
  if (note) note.textContent = `Needed for ${pkg.name} at the founding price, and for Bearing. Founding pricing is confirmed once we can see the review — we check it ourselves before finalising, there's no automatic check.`;

  const reassure = form.querySelector('.reassure');
  if (reassure) reassure.textContent = `No card details are entered on this site. We'll email a secure payment link for the ${money(pkg.deposit)} deposit within one business hour — nothing is charged until you pay it. The remaining ${money(pkg.price - pkg.deposit)} is due on delivery.`;
}

if (a) {
  // The code records the package actually being bought, so the order emails
  // can say when it differs from what the answers pointed at.
  const bought = { ...a, pkg: pkg ? pkg.key : a.pkg };
  const b = build(bought);
  $('#spec').value = encode(bought);
  $('#build-parts').innerHTML = b.included.map((p) => `<li>${p}</li>`).join('');
  // Picked parts the package does not cover are still their picks, so they
  // are named here rather than dropped on the way to the order.
  const extra = $('#build-extra');
  if (extra) {
    extra.hidden = b.extra.length === 0;
    if (b.extra.length) extra.textContent = `Not in ${b.pkg.name}: ${b.extra.join(', ')} — ask us and we'll quote ${b.extra.length === 1 ? 'it' : 'them'} on ${b.extra.length === 1 ? 'its' : 'their'} own.`;
  }
  const back = $('.back');
  if (isPicked(a)) {
    // From the twelve on the homepage: there are no answers to recap, and
    // "change it" means the panels, not the questions.
    $('#build-answers').textContent = `Picked from the twelve on the homepage: ${b.parts.join(', ')}.`;
    $('#build-change').href = '/#offerings';
    if (back) { back.href = '/#offerings'; back.textContent = '← Back to the twelve'; }
  } else {
    const d = describe(a);
    $('#build-answers').textContent = [
      d.business, `today: ${d.now}`, `wants more: ${d.want}`, `one customer is worth ${d.worth}`,
      `nine at night: ${d.answers}`, `running it: ${d.run}`, `look: ${d.look}`,
    ].join(' · ');
    const backHref = `build.html?s=${encodeURIComponent(encode(a))}`;
    $('#build-change').href = backHref;
    if (back) { back.href = backHref; back.textContent = '← Back to your build'; }
  }
  $('#build-card').hidden = false;

  if (b.bearing) {
    const toggle = form.querySelector('[data-bearing-toggle]');
    if (toggle) toggle.checked = true;
  }
}

// Let the inline total script re-read the amounts and the add-ons.
form.dispatchEvent(new Event('change'));
