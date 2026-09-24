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
import { OFFERINGS, PACKAGES, blank, decode, encode, isPicked, recommend } from './spec.js';

/* The panels ship inert — tabindex="-1", no aria-pressed — so that with this
   module absent they are readable content rather than twelve focusable
   controls that do nothing. Turning them into toggles is this module's job,
   and it starts by saying so. */
const list = document.getElementById('offerings-list');
const go = document.getElementById('pick-continue');
const count = document.getElementById('pick-count');
if (list && go) {
  const buttons = Array.from(list.querySelectorAll('.offer[data-part]'));
  const buyLinks = Array.from(document.querySelectorAll('a[href^="checkout.html?buy="]'));
  for (const b of buyLinks) b.dataset.buyHref = b.getAttribute('href');
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
      const pkg = recommend(parts);
      const code = encode({ ...blank(), parts, pkg });
      go.href = `checkout.html?buy=${pkg}&s=${encodeURIComponent(code)}`;
      /* The Cheap and Clean card's own "Buy it now" goes straight to
         checkout. Leaving it bare meant picking three parts and then buying
         from the card silently dropped all three. It keeps its own package;
         it just carries the picks with it. */
      for (const b of buyLinks) b.href = `${b.dataset.buyHref}&s=${encodeURIComponent(code)}`;
      go.setAttribute('aria-label', `Continue to checkout with ${parts.length} ${parts.length === 1 ? 'part' : 'parts'} — ${PACKAGES[pkg].name}`);
      if (count) count.textContent = String(parts.length);
    }
    if (!on) for (const b of buyLinks) b.href = b.dataset.buyHref;
    go.hidden = !on;
    document.body.classList.toggle('has-pick', on);
  };

  list.addEventListener('click', (e) => {
    const b = e.target.closest('.offer[data-part]');
    if (!b || !list.contains(b)) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    sync();
  });

  /* Stand down over the founding terms. Fixed to the bottom-left it sat on
     that paragraph at 390px — the one place on the page where the reader is
     being asked to agree to something. */
  const terms = document.getElementById('founding');
  if (terms && 'IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => go.classList.toggle('is-away', entry.isIntersecting),
      { threshold: 0 },
    ).observe(terms);
  }

  list.classList.add('is-live');
  sync();
}
