/* Northbound — boot.
 *
 * The page is hand-authored HTML now; this fills it from js/content.js and
 * brings up each layer. Every step is independently guarded: a layer that
 * fails to load costs its behaviour and nothing else. Markup is already
 * correct and legible before any of this runs, which is what keeps CLS at 0.
 */
import { CONTENT } from './content.js';

const safe = (name, fn) => { try { fn(); } catch (e) { console.error('boot:' + name, e); } };
const dig = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/* ---- content ---------------------------------------------------------- */
safe('text', () => {
  document.querySelectorAll('[data-js]').forEach((el) => {
    const v = dig(CONTENT, el.getAttribute('data-js'));
    if (typeof v === 'string') el.textContent = v;
  });
});

safe('chat', () => {
  const host = document.querySelector('[data-js-chat]');
  if (!host) return;
  CONTENT.support.exchange.forEach((m, i) => {
    const p = document.createElement('p');
    p.className = 'chat__bubble chat__bubble--' + (m.from === 'you' ? 'you' : 'buddy');
    p.setAttribute('data-reveal', 'rise');
    p.setAttribute('data-reveal-delay', String(i * 90));
    p.textContent = m.text;
    host.appendChild(p);
  });
});

safe('options', () => {
  const host = document.querySelector('[data-js-options]');
  if (!host) return;
  CONTENT.contact.options.forEach((label, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'option';
    wrap.innerHTML =
      '<input class="option__input" type="radio" name="project-type" id="opt-' + i + '">' +
      '<label class="option__label" for="opt-' + i + '"></label>';
    wrap.querySelector('input').value = label;
    wrap.querySelector('label').textContent = label;
    host.appendChild(wrap);
  });
});

safe('submit-label', () => {
  const b = document.getElementById('project-submit');
  if (b) b.textContent = CONTENT.contact.submit;
});

// Scarcity line comes from js/site-config.js so it stays a one-line edit.
safe('spots', () => {
  const el = document.querySelector('[data-spots-line]');
  if (!el) return;
  const n = (window.NB_CONFIG || {}).SPOTS_LEFT;
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  el.textContent = (typeof n === 'number' && n >= 0 && n <= 9 && n === Math.floor(n))
    ? words[n] + (n === 1 ? ' spot' : ' spots') + ' left this month.'
    : 'Taking 2–3 projects a month.';
});

/* ---- layers ----------------------------------------------------------- */
function bringUp() {
  safe('hero', () => {
    const host = document.getElementById('hero-host');
    if (host && window.NB_HERO) window.NB_HERO.init({ host });
  });

  safe('showcase', () => {
    const host = document.getElementById('showcase-host');
    if (host && window.NB_SHOWCASE) window.NB_SHOWCASE.init({ host });
  });

  safe('choreo', () => {
    window.NB_CHOREO && window.NB_CHOREO.init({ root: document });
  });

  safe('buddy', () => {
    const root = document.getElementById('buddy-host');
    if (root && window.NB_BUDDY) window.NB_BUDDY.init({ root, lines: CONTENT.buddy });
  });

  safe('interact', () => {
    window.NB_INTERACT && window.NB_INTERACT.init({ magnetic: '.finale__submit, .showcase__open' });
  });

  // Scroll position feeds the hero's disintegration energy.
  safe('hero-scroll', () => {
    if (!window.NB_MOTION || !window.NB_HERO) return;
    window.NB_MOTION.onFrame(() => {
      const span = document.documentElement.scrollHeight - window.innerHeight;
      window.NB_HERO.setScroll && window.NB_HERO.setScroll(span > 0 ? window.scrollY / span : 0);
    });
  });
}

/* ---- reveal safety net ------------------------------------------------
 * The motion layer hides [data-reveal] elements with an inline clip-path and
 * opens them on an IntersectionObserver. If that trigger does not fire — a
 * transformed scroll container, a mis-set rootMargin, a module that failed to
 * load — the content stays clipped to nothing and the page silently loses
 * whole sections. Content must never be invisible because an enhancement
 * failed, so anything still clipped after it has had time to be seen gets
 * released. Motion is additive; legibility is not negotiable.
 */
safe('reveal-net', () => {
  const CLIPPED = /inset\(.*100%|circle\(0/;
  const check = () => {
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const onScreen = r.top < innerHeight && r.bottom > 0 && r.width > 0;
      if (!onScreen) return;
      const seen = Number(el.dataset.revealSeen || 0);
      if (!seen) { el.dataset.revealSeen = String(performance.now()); return; }
      if (performance.now() - seen < 900) return;
      const clip = getComputedStyle(el).clipPath;
      if (CLIPPED.test(clip)) {
        el.style.clipPath = 'none';
        el.style.transform = 'none';
        el.dataset.revealReleased = '1';
      }
    });
  };
  setInterval(check, 300);
  addEventListener('load', check);
});

/* ---- the form --------------------------------------------------------- */
safe('form', () => {
  const form = document.getElementById('project-form');
  const status = document.getElementById('project-status');
  const btn = document.getElementById('project-submit');
  if (!form || !status || !btn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    status.textContent = '';
    status.dataset.state = '';

    const data = Object.fromEntries(new FormData(form));
    data.demo = 'northbound-dev.com';
    data._subject = 'Northbound — new project enquiry';

    try {
      const endpoint = (window.NB_CONFIG || {}).FORM_ENDPOINT;
      if (!endpoint) throw new Error('no-endpoint');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('upstream ' + res.status);
      form.hidden = true;
      status.dataset.state = 'ok';
      status.textContent = CONTENT.contact.success;
      window.NB_BUDDY && window.NB_BUDDY.setMood('success');
    } catch (err) {
      // Never a fake success. The endpoint has been dead before and a form that
      // lies about delivering a lead is worse than one that admits it cannot.
      status.dataset.state = 'err';
      status.textContent = "That didn't send. Email hello@northbound-dev.com and we'll pick it up.";
      btn.disabled = false;
      btn.textContent = original;
      console.error('form', err);
    }
  });
});

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bringUp, { once: true });
else bringUp();
