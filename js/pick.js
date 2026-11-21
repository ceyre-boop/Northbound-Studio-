/* js/pick.js — the twelve panels on index.html, as an order.
 *
 * Each panel is a toggle button in the HTML already (aria-pressed, Enter and
 * Space for free). This module flips the state on click, keeps a Continue
 * button up while anything is picked, and points that button at checkout
 * with the picks themselves in ?s= as spec.js's version-2 code, so
 * checkout.html and api/checkout.ts describe exactly what was clicked. There
 * is one offer; parts beyond the site are quoted separately, and checkout
 * says so.
 *
 * The count on the button is decoration; its accessible name says the
 * number in words. With this module absent the panels read as they always
 * did and nothing on the page depends on them.
 */
import { OFFERINGS, blank, decode, encode, isPicked } from './spec.js';

/* The panels ship inert — tabindex="-1", no aria-pressed — so that with this
   module absent they are readable content rather than twelve focusable
   controls that do nothing. Turning them into toggles is this module's job,
   and it starts by saying so. */
const list = document.getElementById('offerings-list');
const go = document.getElementById('pick-continue');
const count = document.getElementById('pick-count');
if (list && go) {
  const buttons = Array.from(list.querySelectorAll('.offer[data-part]'));
  /* Any other "Start your site" link on the page carries the picks too, so
     picking three parts and then using a different button does not silently
     drop them. The Continue button itself is excluded: it is rewritten
     below from the picks, not from its own stale value. */
  const startLinks = Array.from(document.querySelectorAll('a[href="checkout.html"]')).filter((l) => l !== go);
  for (const b of buttons) {
    b.removeAttribute('tabindex');
    b.setAttribute('aria-pressed', 'false');
  }

  /* Coming back from checkout: /?s=<code>#offerings restores what was
     picked, so "Change it" lands on the twelve as they left them. */
  const restore = new URLSearchParams(location.search).get('s');
  if (restore) {
    const a = decode(restore);
    if (a && isPicked(a)) {
      for (const b of buttons) {
        if (a.parts.includes(b.dataset.part)) b.setAttribute('aria-pressed', 'true');
      }
    }
  }

  const picked = () => OFFERINGS.filter((name) => buttons.some((b) => b.dataset.part === name && b.getAttribute('aria-pressed') === 'true'));

  const sync = () => {
    const parts = picked();
    const on = parts.length > 0;
    if (on) {
      const code = encode({ ...blank(), parts });
      const href = `checkout.html?s=${encodeURIComponent(code)}`;
      go.href = href;
      for (const l of startLinks) l.href = href;
      go.setAttribute('aria-label', `Start your site with ${parts.length} ${parts.length === 1 ? 'part' : 'parts'} picked`);
      if (count) count.textContent = String(parts.length);
    }
    if (!on) for (const l of startLinks) l.href = 'checkout.html';
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
