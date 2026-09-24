/* js/pick.js — the twelve panels on index.html, as an order.
 *
 * Each panel is a toggle button in the HTML already (aria-pressed, Enter and
 * Space for free). This module flips the state on click, keeps a Continue
 * button up while anything is picked, and points that button at the
 * existing checkout: the package the picks add up to (spec.js's recommend,
 * the same rule the guided build uses) in ?buy=, and the picks themselves
 * in ?s= as spec.js's version-2 code, so checkout.html and api/checkout.ts
 * describe exactly what was clicked. Nothing new is invented on the way —
 * the same param, the same decoder on both sides, the same order emails.
 *
 * The count on the button is decoration; its accessible name says the
 * number in words. With this module absent the panels read as they always
 * did and nothing on the page depends on them.
 */
import { OFFERINGS, PACKAGES, blank, encode, recommend } from './spec.js';

const list = document.getElementById('offerings-list');
const go = document.getElementById('pick-continue');
const count = document.getElementById('pick-count');
if (list && go) {
  const buttons = Array.from(list.querySelectorAll('.offer[data-part]'));

  const picked = () => OFFERINGS.filter((name) => buttons.some((b) => b.dataset.part === name && b.getAttribute('aria-pressed') === 'true'));

  const sync = () => {
    const parts = picked();
    const on = parts.length > 0;
    if (on) {
      const pkg = recommend(parts);
      const code = encode({ ...blank(), parts, pkg });
      go.href = `checkout.html?buy=${pkg}&s=${encodeURIComponent(code)}`;
      go.setAttribute('aria-label', `Continue to checkout with ${parts.length} ${parts.length === 1 ? 'part' : 'parts'} — ${PACKAGES[pkg].name}`);
      if (count) count.textContent = String(parts.length);
    }
    go.hidden = !on;
    document.body.classList.toggle('has-pick', on);
  };

  list.addEventListener('click', (e) => {
    const b = e.target.closest('.offer[data-part]');
    if (!b || !list.contains(b)) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    sync();
  });

  list.classList.add('is-live');
  sync();
}
