/* js/engine.js — the booking flow. Six screens, one question each, driven by
 * engine.config.json. The price shown on the last screen is for the
 * customer's information; api/book.ts re-derives it from the same config
 * before anything is charged. Answers are kept in localStorage so a refresh
 * does not lose them.
 */
const KEY = 'nb-engine-v1';
const TOTAL = 6;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

let cfg = null;
let step = 1;
let A = blank();

function blank() {
  return { service: null, property: null, address: '', urgency: null, day: '', window: null, name: '', phone: '', email: '', notes: '' };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ a: A, step })); } catch { /* private mode: still works, just forgets */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.a && typeof s.step === 'number') { A = { ...blank(), ...s.a }; step = Math.min(TOTAL, Math.max(1, s.step)); }
  } catch { /* ignore */ }
}

function service() { return cfg.services.find((s) => s.key === A.service) || null; }

/* The same arithmetic api/book.ts does, for the screen only. */
function price() {
  const s = service();
  if (!s) return null;
  const extra = A.urgency === 'today' && s.due > 0 && cfg.afterHours ? cfg.afterHours.cents : 0;
  return { due: s.due + extra, total: s.total ? s.total + extra : 0, extra, label: s.label, note: s.note };
}

const STEPS = [
  { name: "What's going on", valid: () => !!A.service },
  { name: 'Where', valid: () => !!A.property && A.address.trim().length > 3 },
  { name: 'How soon', valid: () => !!A.urgency },
  { name: 'When', valid: () => !!A.window },
  { name: 'Who', valid: () => A.name.trim().length > 1 && A.phone.replace(/\D/g, '').length >= 7 && (!A.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(A.email)) },
  { name: 'Confirm', valid: () => true },
];

function opts(list, picked, render) {
  return `<ul class="opts" role="group">${list.map((o) => {
    const v = typeof o === 'string' ? o : o.key;
    const on = picked === v;
    return `<li><button type="button" class="opt" data-value="${esc(v)}" aria-pressed="${on}">${render(o)}</button></li>`;
  }).join('')}</ul>`;
}

function field(id, label, name, type, value, extra = '') {
  return `<p class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></p>`;
}

function screen() {
  switch (step) {
    case 1:
      return `<h1 class="q">What's going on?</h1><p class="hint">Pick the closest one. We'll sort out the details on the day.</p>
        ${opts(cfg.services, A.service, (s) => `<span><b>${esc(s.name)}</b><small>${esc(s.blurb)}</small></span>`)}`;
    case 2:
      return `<h1 class="q">Where are we coming?</h1><p class="hint">${esc(cfg.business.area)}.</p>
        ${opts(cfg.property, A.property, (p) => `<span><b>${esc(p)}</b></span>`)}
        ${field('f-address', 'Address', 'address', 'text', A.address, 'autocomplete="street-address" required')}`;
    case 3:
      return `<h1 class="q">How soon?</h1>
        ${opts(cfg.urgency, A.urgency, (u) => `<span><b>${esc(u.label)}</b>${u.note ? `<small>${esc(u.note)}</small>` : ''}</span>`)}`;
    case 4:
      return `<h1 class="q">When works?</h1><p class="hint">${esc(cfg.business.hours)}.</p>
        ${field('f-day', 'Which day', 'day', 'text', A.day, 'placeholder="e.g. Tuesday, or the 14th"')}
        <p class="hint" style="margin-top:14px">Time of day</p>
        ${opts(cfg.windows, A.window, (w) => `<span><b>${esc(w)}</b></span>`)}`;
    case 5:
      return `<h1 class="q">Who should we ask for?</h1>
        ${field('f-name', 'Your name', 'name', 'text', A.name, 'autocomplete="name" required')}
        ${field('f-phone', 'Phone', 'phone', 'tel', A.phone, 'autocomplete="tel" inputmode="tel" required')}
        ${field('f-email', 'Email <span>(for the confirmation)</span>', 'email', 'email', A.email, 'autocomplete="email"')}
        <p class="field"><label for="f-notes">Anything we should know <span>(optional)</span></label><textarea id="f-notes" name="notes">${esc(A.notes)}</textarea></p>`;
    case 6: {
      const s = service(); const p = price();
      const urg = cfg.urgency.find((u) => u.key === A.urgency);
      const pay = p.due > 0;
      return `<h1 class="q">${pay ? 'Hold your spot.' : 'Request your visit.'}</h1>
        <div class="card">
          <h2>Your visit</h2>
          <div class="row"><b>${esc(s.name)}</b><span class="v">${esc(p.label)}</span></div>
          <div class="row"><b>Where</b><span class="v">${esc(A.property)} · ${esc(A.address)}</span></div>
          <div class="row"><b>When</b><span class="v">${esc(urg ? urg.label : '')}${A.day ? ` · ${esc(A.day)}` : ''} · ${esc(A.window)}</span></div>
          <div class="row"><b>Who</b><span class="v">${esc(A.name)} · ${esc(A.phone)}${A.email ? ` · ${esc(A.email)}` : ''}</span></div>
          ${A.notes ? `<div class="row"><b>Notes</b><span class="v">${esc(A.notes)}</span></div>` : ''}
        </div>
        <div class="card">
          ${pay ? `<p class="total">Due now: <span class="amt" id="due">${money(p.due)}</span></p>
            ${p.total > p.due ? `<p class="note">Total ${money(p.total)}; the balance is due when we're done.</p>` : ''}
            ${p.extra ? `<p class="note">Includes ${esc(cfg.afterHours.label).toLowerCase()}, ${money(p.extra)}.</p>` : ''}
            <p class="note">${esc(p.note)}</p><p class="note">${esc(cfg.copy.depositNote)}</p>`
          : `<p class="total"><span class="amt" id="due">Nothing to pay now</span></p><p class="note">${esc(p.note)}</p>`}
        </div>
        <div class="nav">
          <button type="button" class="btn btn-quiet" data-nav="back">← Back</button>
          <button type="button" class="btn btn-primary" id="go">${pay ? `Pay ${money(p.due)} and hold my spot` : 'Request my visit'}</button>
        </div>
        <p class="status" id="status" aria-live="polite"></p>
        <p class="note">${pay ? 'The card page is Stripe\'s; no card details touch this site.' : 'We confirm the time by phone.'} Or call <a href="${esc(cfg.business.phoneHref)}">${esc(cfg.business.phone)}</a>.</p>`;
    }
  }
}

function render() {
  const def = STEPS[step - 1];
  $('#step-label').textContent = `Step ${step} of ${TOTAL}`;
  $('#step-name').textContent = def.name;
  $('#bar').style.width = `${(step / TOTAL) * 100}%`;
  const panel = $('#panel');
  panel.innerHTML = screen() + (step < TOTAL ? `<div class="nav">
      <button type="button" class="btn btn-quiet" data-nav="back"${step === 1 ? ' disabled' : ''}>← Back</button>
      <button type="button" class="btn btn-primary" data-nav="next"${def.valid() ? '' : ' disabled'}>Next →</button>
    </div>` : '');
  window.scrollTo({ top: 0 });
}

function go(to) {
  step = Math.min(TOTAL, Math.max(1, to));
  save();
  render();
}

function refreshNext() {
  const n = $('#panel [data-nav="next"]');
  if (n) n.disabled = !STEPS[step - 1].valid();
}

/* ---- events ---- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.nav === 'next') { if (STEPS[step - 1].valid()) go(step + 1); return; }
  if (t.dataset.nav === 'back') { go(step - 1); return; }
  if (t.classList.contains('opt')) {
    const v = t.dataset.value;
    if (step === 1) A.service = v;
    else if (step === 2) A.property = v;
    else if (step === 3) A.urgency = v;
    else if (step === 4) A.window = v;
    save();
    t.closest('.opts').querySelectorAll('.opt').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
    refreshNext();
    return;
  }
  if (t.id === 'go') submit(t);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.name) return;
  if (el.name in A) A[el.name] = el.value.slice(0, el.name === 'notes' ? 500 : 160);
  save();
  refreshNext();
});

async function submit(btn) {
  const status = $('#status');
  btn.disabled = true;
  status.className = 'status';
  status.textContent = 'One moment…';
  try {
    const res = await fetch('api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(A),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.url) { location.href = data.url; return; }
    throw new Error(data.error || `That didn't go through (${res.status}).`);
  } catch (err) {
    status.className = 'status err';
    status.textContent = `${err.message || "That didn't go through."} Please call ${cfg.business.phone} and we'll book it by phone.`;
    btn.disabled = false;
  }
}

/* ---- boot ---- */
(async function boot() {
  try {
    cfg = await (await fetch('engine.config.json', { cache: 'no-cache' })).json();
  } catch {
    // The plain form stays if the config cannot be read.
    document.documentElement.classList.remove('js');
    return;
  }
  document.documentElement.style.setProperty('--accent', cfg.business.accent || '#1F4E79');
  document.title = `Book a visit — ${cfg.business.name}`;
  $('#brand').textContent = cfg.business.name;
  const call = $('#call'); call.href = cfg.business.phoneHref; call.textContent = cfg.business.phone;
  $('#plain-h1').textContent = cfg.copy.headline;
  $('#plain-sub').textContent = cfg.copy.sub;
  $('#foot-line').textContent = `${cfg.business.name} · ${cfg.business.area} · ${cfg.business.license}`;
  $('#foot-hours').textContent = cfg.business.hours;
  window.NB_ENGINE = { get answers() { return A; }, get step() { return step; }, get config() { return cfg; } };
  load();
  $('#flow').hidden = false;
  render();
})();
