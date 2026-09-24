/* js/build.js — the guided build on build.html.
 *
 * Eight screens, one question each, driven by a fixed script. The page ships
 * step 1 and the preview phone in its HTML; this module re-renders that same
 * step 1 (identical markup, so nothing painted moves), binds the buttons,
 * and takes it from there. Everything a visitor answers is kept in
 * localStorage as they go and packed into a short code by js/spec.js so a
 * link can restore it anywhere.
 *
 * Buddy hosts: one line per step, in the studio's plain voice, and a pose
 * swap with the mood. His lines never carry a number we cannot back.
 *
 * Nothing here prices anything. The spec sheet shows the founding prices the
 * site already publishes and does arithmetic on the bracket the customer
 * chose; checkout.html carries the package key and the code to
 * api/checkout.ts, which prices only from its own table.
 */
import { BIZ, NOW, WANT, WORTH, ANSWERS, RUN, LOOKS, PACKAGES, BEARING, blank, build, encode, decode, link, describe, money } from './spec.js';

const KEY = 'nb-build-v1';
const TOTAL = 8;
const PHONE = '470-573-8908';

/* What the preview phone says for each kind of business. Mock copy for a
   mock, and labelled as an example inside the frame. */
const VOCAB = {
  trades: { hero: 'Repairs and installs, done right the first time.', sub: 'Serving your town and the surrounding area.', services: ['Repairs', 'Installs', 'Emergency call-outs'] },
  food: { hero: 'Fresh, local, and open tonight.', sub: "Today's menu, the hours, and a table when you want one.", services: ['Menu', 'Order ahead', 'Book a table'] },
  salon: { hero: 'Your next appointment, booked in a minute.', sub: 'Pick a time that suits you. No phone call needed.', services: ['Services', 'Prices', 'Book online'] },
  shop: { hero: 'In stock and ready today.', sub: 'What we have, where we are, and when we are open.', services: ['Shop', 'Order for pickup', 'Visit us'] },
  pro: { hero: 'Straight answers and a clear price.', sub: 'Tell us the situation and book a time to talk it through.', services: ['Services', 'Book a consultation', 'About'] },
  other: { hero: 'Local, reliable, done right.', sub: 'Serving your town and the surrounding area.', services: ['Services', 'Contact', 'About'] },
};

/* The one-line description of each part, as index.html writes it. */
const PART_COPY = {
  'A custom site': 'Built for your business rather than adapted from someone else\'s, so it says what you do in the first five seconds.',
  'Brand identity': 'A logo, a typeface and a colour that work on a van, a business card and a phone screen without being redrawn each time.',
  'Booking flow': 'Customers pick a time themselves, at eleven at night, without anyone answering a phone.',
  'Quote flow': 'People tell you what the job is before you drive out to look at it, so you quote the ones worth quoting.',
  'Payments': 'Deposits land before the work starts, which is the rule that prevents most of the ways small projects go wrong.',
  'Lead capture': 'The people who almost called you leave a name instead of leaving.',
  'Automated follow-up': 'Every enquiry gets an answer within a minute, including the ones that arrive while you are on a roof.',
  'Reminders': 'Fewer no-shows, because the appointment reminds them and not you.',
  'Review requests': 'The review gets asked for at the one moment the customer is happiest, every time, without you remembering.',
  'Owner dashboard': 'One screen that says where the calls came from and what they were worth, so you stop guessing which advert works.',
  'Local SEO': 'You turn up when someone two towns over searches for what you do.',
  'AI intake': 'Enquiries get read, sorted and answered in your voice before you have opened the laptop.',
};

/* Buddy's script. `ask` is said when the step opens, `react` after an
   answer (keyed by answer, `_` for "not sure yet", `*` for any). */
const STEPS = [
  {
    key: 'biz', name: 'Your business', title: 'What kind of business?', list: BIZ, pose: 'thinking', reactPose: 'salute',
    ask: 'Start with what you do. Everything after this is in your words, not ours.',
    react: {
      trades: "Good. For a trade, the site has one job: make the phone ring, and catch the calls you can't take.",
      food: 'Good. For food and drink, the site is about tonight — the menu, the hours, the order.',
      salon: 'Good. For a salon or a gym, the whole site is the booking button.',
      shop: "Good. For a shop, it's what's in stock, where you are, and when you're open.",
      pro: 'Good. For professional services, it\'s trust first — a clear price and a way to book a conversation.',
      other: "Fine. We'll keep the words general and get specific when we talk.",
      _: "That's fine. We'll keep the words general for now.",
    },
  },
  {
    key: 'now', name: 'Today', title: 'When someone wants to buy from you today, what happens?', list: NOW, pose: 'thinking', reactPose: 'thinking',
    ask: 'No wrong answer. This is the part the machine replaces, so it helps to be honest about it.',
    react: {
      call: "Calls are the best kind of enquiry. The cost is the ones that ring while you're working.",
      dm: "Messages get buried under everything else. We'd bring them into one place that answers back.",
      hope: "That's the honest answer, and it's fixable. Being findable is the first job.",
      site: "A site that just sits there is a brochure. We'd give it a job to do.",
      _: "Fair enough. We'll work it out on the first call.",
    },
  },
  {
    key: 'want', name: 'More of', title: 'What do you want more of?', list: WANT, multi: true, pose: 'thinking', reactPose: 'awesome',
    ask: 'Pick everything that\'s true. Each one becomes a part of the build.',
    react: { '*': "Good. Watch the phone — that's the button your customers will tap.", _: "No problem. We'll start with being reachable and add from there." },
  },
  {
    key: 'worth', name: 'Worth', title: "What's one new customer worth to you?", list: WORTH, pose: 'thinking', reactPose: 'salute',
    ask: "Rough is fine. This is how we work out whether the build pays for itself. No price until you've answered.",
    react: { '*': "Thanks. That's the number we price against — you'll see the arithmetic, not a pitch.", _: "That's fine. We'll show the price plain and do the arithmetic together later." },
  },
  {
    key: 'answers', name: 'Nights', title: 'Who answers when someone asks at nine at night?', list: ANSWERS, pose: 'thinking', reactPose: 'salute',
    ask: "Be honest. Enquiries don't keep business hours.",
    react: {
      me: "Then you're the machine right now. The build takes the night shift so you don't have to.",
      family: "That works until it doesn't. We'd put something in front of them that answers first, so they only step in when it matters.",
      nobody: "That's the one that costs you. An enquiry that waits overnight usually doesn't wait.",
      _: "Fair. If nobody's sure, the answer is probably nobody. We'll plan for that.",
    },
    reactPoseFor: { nobody: 'thinking' },
  },
  {
    key: 'run', name: 'Running it', title: 'Do you want to run it, or should we keep it running?', list: RUN, pose: 'thinking', reactPose: 'salute',
    ask: `Either is fine. Running it yourself costs nothing. Keeping it running is Bearing: ${money(BEARING.price)} a month as a founding client, ${money(BEARING.standard)} standard.`,
    hint: 'Bearing is hosting, monitoring, backups, unlimited small edits, the automations kept running, and a monthly report on calls and bookings.',
    react: {
      me: "Then it's yours. Hosting stays free either way, and you can add Bearing later from your account.",
      you: 'Then we watch it, fix it, keep the automations running and report back every month.',
      _: 'No rush. You can add it at checkout or any time after.',
    },
  },
  {
    key: 'look', name: 'The look', title: 'Pick the look.', list: LOOKS, looks: true, pose: 'awesome', reactPose: 'salute',
    ask: 'Five real designs, shown with our own content. Yours goes in. Pick the one that feels like your business.',
    react: { '*': "Good choice. That's everything decided — Next puts it all on one sheet.", _: "Fine — we'll show you all five with your name on them before anything's built." },
  },
  { key: 'sheet', name: 'Your build', pose: 'awesome', ask: "Here's the whole thing, priced from the same table we charge from. Nothing is charged until you pay the link we send." },
];

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const el = {
  panel: $('#panel'),
  say: $('#say'),
  stepLabel: $('#step-label'),
  stepName: $('#step-name'),
  bar: $('#bar-fill'),
  phone: $('#phone'),
  toast: $('#toast'),
  toastWhere: $('#toast-where'),
  poses: Array.from(document.querySelectorAll('.buddy-img img')),
};

let A = blank();
let step = 1;
let fromLink = false;

/* ---- persistence -------------------------------------------------------- */

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ a: A, step, at: Date.now() })); } catch { /* private mode: the flow still works, it just does not remember */ }
}
function saved() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.a || typeof s.step !== 'number') return null;
    return { a: { ...blank(), ...s.a, want: Array.isArray(s.a.want) ? s.a.want : [] }, step: Math.min(TOTAL, Math.max(1, s.step)) };
  } catch { return null; }
}
function forget() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

/* ---- Buddy --------------------------------------------------------------- */

function say(text, pose) {
  el.say.textContent = text;
  if (pose) el.poses.forEach((img) => img.classList.toggle('is-on', img.dataset.pose === pose));
}

function reactTo(def, value) {
  const line = def.react[value] ?? def.react['*'] ?? def.ask;
  const pose = (def.reactPoseFor && def.reactPoseFor[value]) || def.reactPose || def.pose;
  say(line, pose);
}

/* ---- the phone ------------------------------------------------------------ */

function paint() {
  const b = build(A);
  const v = VOCAB[A.biz] || VOCAB.other;
  const ph = el.phone;
  $('[data-p="brand"]', ph).textContent = A.name || 'Your business';
  $('[data-p="hero"]', ph).textContent = v.hero;
  $('[data-p="sub"]', ph).textContent = v.sub;
  const cta = WANT.find((w) => A.want.includes(w.key));
  $('[data-p="cta"]', ph).textContent = cta ? cta.cta : 'Call us';
  $('[data-p="night"]', ph).hidden = !b.parts.includes('Automated follow-up');
  $('[data-p="services"]', ph).innerHTML = v.services.map((s) => `<li>${esc(s)}</li>`).join('');
  ph.dataset.look = A.look || '';
}

/* ---- rendering ------------------------------------------------------------ */

function progress() {
  const def = STEPS[step - 1];
  el.stepLabel.textContent = `Step ${step} of ${TOTAL}`;
  el.stepName.textContent = def.name;
  el.bar.style.width = `${(step / TOTAL) * 100}%`;
}

function optionHtml(def, o) {
  const value = o.key;
  const pressed = def.multi ? A.want.includes(value) : A[def.key] === value;
  return `<button type="button" class="opt" data-value="${value}"${def.multi ? ' data-multi=""' : ''} aria-pressed="${pressed}">${esc(o.label)}</button>`;
}

function questionHtml(def) {
  const unsurePressed = def.multi ? (A.want.length === 0 && A.wantUnsure === true) : A[def.key] === '_';
  let opts;
  if (def.looks) {
    opts = `<div class="looks" role="group" aria-label="${esc(def.title)}">${def.list.map((o) =>
      `<button type="button" class="look" data-value="${o.key}" aria-pressed="${A.look === o.key}"><img src="brand/looks/${o.file}.webp" alt="The ${o.label} look, shown with our own content" width="585" height="1050" loading="lazy" decoding="async"><span>${esc(o.label)}</span></button>`,
    ).join('')}</div>
    <p class="looks-note">Shown with our own content, so nothing here is made up. Yours goes in.</p>
    <div class="opts" style="margin-top:12px"><button type="button" class="opt opt-unsure" data-value="_" aria-pressed="${A.look === '_'}">Not sure yet — show me all five with my name on them</button></div>`;
  } else {
    opts = `<div class="opts" role="group" aria-label="${esc(def.title)}">${def.list.map((o) => optionHtml(def, o)).join('')}<button type="button" class="opt opt-unsure" data-value="_" aria-pressed="${unsurePressed}">Not sure yet</button></div>`;
  }
  const hint = def.hint ? `<p class="hint">${esc(def.hint)}</p>` : '';
  const name = def.key === 'biz'
    ? `<p class="field"><label for="biz-name">Your business name <span>(optional — it goes on the preview)</span></label><input id="biz-name" name="business" type="text" autocomplete="organization" maxlength="60"${A.name ? ` value="${esc(A.name)}"` : ''}></p>`
    : '';
  return `<h1 class="q" id="q" tabindex="-1">${esc(def.title)}</h1>${hint}${opts}${name}
    <div class="nav">
      <button type="button" class="btn btn-quiet" data-nav="back"${step === 1 ? ' disabled' : ''}>← Back</button>
      <button type="button" class="btn btn-primary" data-nav="next"${answered(def) ? '' : ' disabled'}>Next →</button>
    </div>`;
}

function answered(def) {
  if (def.multi) return A.want.length > 0 || A.wantUnsure === true;
  return A[def.key] !== null && A[def.key] !== undefined;
}

function partsHtml(names) {
  return `<ol class="parts">${names.map((n) => {
    const i = Object.keys(PART_COPY).indexOf(n) + 1;
    return `<li><span class="n">${String(i).padStart(2, '0')}</span><span><span class="t">${esc(n)}</span><span class="d">${esc(PART_COPY[n])}</span></span></li>`;
  }).join('')}</ol>`;
}

function sheetHtml() {
  const b = build(A);
  const p = b.pkg;
  const d = describe(A);
  const url = link(A, location.origin);
  const checkoutHref = `checkout.html?buy=${p.key}&s=${encodeURIComponent(encode(A))}`;
  const pkgOpts = Object.values(PACKAGES).map((k) =>
    `<li><button type="button" class="pkg-opt" data-pkg="${k.key}" aria-pressed="${k.key === p.key}"><b>${esc(k.name)}</b><small>${money(k.price)}${k.standard ? ` founding` : ''}</small>${k.key === b.recommended ? '<em>Our pick from your answers</em>' : ''}</button></li>`,
  ).join('');

  const bearingHtml = b.bearing ? `
    <div class="card">
      <h2>Keeping it running</h2>
      <p class="price" style="font-size:24px">${money(BEARING.price)}<span style="font-size:14px;font-family:var(--body);color:var(--ink-soft)">/mo</span> <span class="was">${money(BEARING.standard)}/mo</span></p>
      <p class="price-note">Bearing · founding price</p>
      <p class="extra">Hosting, monitoring, backups, unlimited small edits, the automations kept running, and a monthly report on calls and bookings. Not charged today: your first monthly charge is next month. You pick the term at checkout — 12 months locked at ${money(BEARING.price)}/mo, or month-to-month at ${money(BEARING.price)} the first month and ${money(BEARING.standard)}/mo after.</p>
    </div>` : '';

  const payback = b.payback
    ? `<p class="payback">${esc(b.payback)}</p><p class="payback-note">Your bracket, divided into the price. No conversion rate, no promise about how many will come.${b.bearing ? ' Bearing is monthly and not in this arithmetic.' : ''}</p>`
    : `<p class="payback">Tell us what one customer is worth and we'll do the arithmetic here.</p><p class="payback-note">You said not sure yet — that's fine. The price stands on its own.</p>`;

  const deposit = p.deposit === p.price
    ? `<li><strong>${money(p.price)} in full</strong> — it's the whole price, and it's due before the build starts.</li>`
    : `<li><strong>${money(p.deposit)} now, ${money(b.balance)} on delivery.</strong> 50% up front, always. No deposit, no work.</li>`;

  return `<div class="sheet">
    <h1 class="q" id="q" tabindex="-1">Your build${A.name ? ` for ${esc(A.name)}` : ''}</h1>
    <p class="lede">${fromLink ? 'Restored from your link. Change anything, or reserve it.' : 'Built from your answers. Change the package if you disagree with us.'}</p>

    <ul class="pkgs">${pkgOpts}</ul>

    <div class="card">
      <h2>${esc(p.name)}</h2>
      <p class="price">${money(p.price)}${p.standard ? `<span class="was">${money(p.standard)}</span>` : ''}</p>
      ${p.standard ? '<p class="price-note">Founding price · first 15 founding clients</p>' : ''}
      <p class="extra" style="margin-top:6px">${esc(p.tag)}</p>
    </div>

    <div class="card">
      <h2>What you're getting</h2>
      ${partsHtml(b.included)}
      ${b.extra.length ? `<p class="extra"><strong>Not in ${esc(p.name)}:</strong> ${b.extra.map(esc).join(', ')}. Your answers called for ${b.extra.length === 1 ? 'it' : 'these'}; ${b.recommended !== p.key ? `${esc(PACKAGES[b.recommended].name)} includes ${b.extra.length === 1 ? 'it' : 'them'}, or ask us to quote ${b.extra.length === 1 ? 'it' : 'them'} on ${b.extra.length === 1 ? 'its' : 'their'} own.` : 'ask us and we\'ll quote it.'}</p>` : ''}
      ${p.key === 'engine' && A.answers === 'nobody' ? '<p class="extra"><strong>Worth asking about:</strong> AI intake — enquiries read, sorted and answered in your voice. An add-on to Engine, quoted per job.</p>' : ''}
      ${p.key === 'clean' ? `<p class="extra">One page, one of the five looks${A.look && A.look !== '_' ? ` (you picked ${esc(d.look)})` : ''}, your phone number tappable and a form that reaches you. Hosted free, forever. Changes and a human reply are $49/mo, added at checkout or later.</p>` : ''}
    </div>

    ${bearingHtml}

    <div class="card">
      <h2>Does it pay for itself?</h2>
      ${payback}
    </div>

    <div class="card">
      <h2>What happens next</h2>
      <ol class="next-steps">
        ${deposit}
        <li><strong>Nothing is charged today.</strong> Reserve it and we email a secure payment link within one business hour. Once that's paid, the build starts.</li>
        <li><strong>First you get the homepage</strong> in your look, with your words on it, to approve before anything else is built.</li>
        <li><strong>We don't publish a turnaround we haven't measured.</strong> You get the date on the first call, and it's the date.</li>
      </ol>
    </div>

    <div class="card">
      <h2>Your answers</h2>
      <ul class="answers-list">
        <li><b>Business:</b> ${esc(d.business)}</li>
        <li><b>Today:</b> ${esc(d.now)}</li>
        <li><b>Wants more:</b> ${esc(d.want)}</li>
        <li><b>One customer is worth:</b> ${esc(d.worth)}</li>
        <li><b>Nine at night:</b> ${esc(d.answers)}</li>
        <li><b>Running it:</b> ${esc(d.run)}</li>
        <li><b>Look:</b> ${esc(d.look)}</li>
      </ul>
    </div>

    <div class="actions">
      <a class="btn btn-primary" id="reserve" href="${esc(checkoutHref)}">Reserve my build — ${money(p.deposit)} now</a>
      <div class="actions-row">
        <button type="button" class="btn btn-secondary" id="email-toggle" aria-expanded="false" aria-controls="email-form">Email me this build</button>
        <button type="button" class="btn btn-quiet" id="copy-link">Copy the link</button>
      </div>
      <p class="reassure">No card details are entered on this site. Reserving sends us the order; a secure payment link follows within one business hour, and nothing is charged until you pay it. Or call <a href="tel:+14705738908">${PHONE}</a>.</p>
      <form class="email-form" id="email-form" hidden>
        <p class="status">We'll email you this link, and a person here sees the build. Nothing else happens until you say so.</p>
        <p class="field"><label for="e-name">Your name</label><input id="e-name" name="name" type="text" autocomplete="name" required></p>
        <p class="field"><label for="e-email">Email</label><input id="e-email" name="email" type="email" autocomplete="email" required></p>
        <p class="field"><label for="e-phone">Phone</label><input id="e-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required></p>
        <p class="hp" aria-hidden="true"><label for="e-hp7">Leave this empty</label><input id="e-hp7" name="nb_hp_7" type="text" autocomplete="new-password" tabindex="-1"></p>
        <button type="submit" class="btn btn-primary">Send it to me</button>
        <p class="status" id="email-status" aria-live="polite"></p>
      </form>
      <div class="link-box"><input type="text" readonly value="${esc(url)}" id="link-field" aria-label="The link that restores this build"></div>
    </div>

    <div class="nav">
      <button type="button" class="btn btn-quiet" data-nav="back">← Back</button>
    </div>
    <p class="start-over"><button type="button" data-nav="fresh">Start over</button></p>
  </div>`;
}

function render({ focus = false } = {}) {
  const def = STEPS[step - 1];
  progress();
  el.panel.innerHTML = def.key === 'sheet' ? sheetHtml() : questionHtml(def);
  paint();
  if (focus) {
    const q = $('#q', el.panel);
    if (q) q.focus({ preventScroll: true });
    // Bring the question to the top of the screen (on a phone the preview
    // sits above it), without a smooth scroll that reduced motion would hate.
    el.panel.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (window.innerWidth > 860) window.scrollTo(0, 0);
  }
}

/* ---- events -------------------------------------------------------------- */

function pick(value) {
  const def = STEPS[step - 1];
  if (def.multi) {
    if (value === '_') { A.want = []; A.wantUnsure = true; }
    else {
      A.wantUnsure = false;
      A.want = A.want.includes(value) ? A.want.filter((k) => k !== value) : [...A.want, value];
    }
  } else {
    A[def.key] = value;
  }
  save();
  const btns = el.panel.querySelectorAll('[data-value]');
  btns.forEach((b) => {
    const v = b.dataset.value;
    const on = def.multi ? (v === '_' ? A.wantUnsure === true && A.want.length === 0 : A.want.includes(v)) : A[def.key] === v;
    b.setAttribute('aria-pressed', String(on));
  });
  $('[data-nav="next"]', el.panel).disabled = !answered(def);
  const reactKey = def.multi ? (A.want.length ? '*' : '_') : value;
  reactTo(def, reactKey);
  paint();
}

function go(to, focus = true) {
  step = Math.min(TOTAL, Math.max(1, to));
  save();
  render({ focus });
  const def = STEPS[step - 1];
  // Coming back to an answered step, Buddy repeats his reaction rather than
  // asking again; opening a fresh one, he asks.
  if (def.key !== 'sheet' && answered(def)) {
    const v = def.multi ? (A.want.length ? '*' : '_') : A[def.key];
    reactTo(def, v);
  } else {
    say(def.ask, def.pose);
  }
}

function fresh() {
  forget();
  A = blank();
  fromLink = false;
  el.toast.hidden = true;
  go(1);
}

el.panel.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t || !el.panel.contains(t)) return;
  if (t.dataset.value !== undefined) { pick(t.dataset.value); return; }
  if (t.dataset.pkg) {
    A.pkg = t.dataset.pkg;
    save();
    render();
    return;
  }
  if (t.dataset.nav === 'next') { go(step + 1); return; }
  if (t.dataset.nav === 'back') { go(step - 1); return; }
  if (t.dataset.nav === 'fresh') { fresh(); return; }
  if (t.id === 'email-toggle') {
    const f = $('#email-form', el.panel);
    f.hidden = !f.hidden;
    t.setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) $('#e-name', f).focus();
    return;
  }
  if (t.id === 'copy-link') {
    const url = $('#link-field', el.panel).value;
    const done = () => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy the link'; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => $('#link-field', el.panel).select());
    else $('#link-field', el.panel).select();
  }
});

el.panel.addEventListener('input', (e) => {
  if (e.target.id === 'biz-name') {
    A.name = e.target.value.trim().slice(0, 60);
    save();
    paint();
  }
});

/* "Email me this build" posts to the quote endpoint the homepage already
   uses: the studio gets the build as a lead, the customer gets the auto-reply
   with the link in it. No package key is sent, so no founding agreement is
   demanded for what is only a saved link. */
el.panel.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id !== 'email-form') return;
  e.preventDefault();
  const status = $('#email-status', form);
  const btn = $('button[type="submit"]', form);
  const b = build(A);
  const d = describe(A);
  const fd = new FormData(form);
  fd.set('business', A.name || '');
  fd.set('package', '');
  fd.set('need', [
    `Guided build: ${b.pkg.name} — ${money(b.pkg.price)}${b.pkg.standard ? ' founding' : ''}${b.bearing ? ` + Bearing ${money(BEARING.price)}/mo founding` : ''}`,
    `Parts: ${b.included.join(', ')}${b.extra.length ? ` (not in package: ${b.extra.join(', ')})` : ''}`,
    `Business: ${d.business} · Today: ${d.now} · Wants: ${d.want} · Worth: ${d.worth} · Nights: ${d.answers} · Running it: ${d.run} · Look: ${d.look}`,
  ].join('\n'));
  fd.set('message', `Your build link — it brings this back on any device:\n${link(A, location.origin)}`);
  btn.disabled = true;
  status.className = 'status';
  status.textContent = 'Sending…';
  try {
    const res = await fetch('/api/quote', { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      status.textContent = `Sent to ${fd.get('email')}. The link in that email brings this build back on any device.`;
      form.querySelectorAll('input, button').forEach((i) => { i.disabled = true; });
    } else {
      throw new Error(data.error || `That didn't send (${res.status}).`);
    }
  } catch (err) {
    status.className = 'status err';
    status.textContent = `${err.message || "That didn't send."} Copy the link instead, or call ${PHONE}.`;
    btn.disabled = false;
  }
});

el.toast.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toast]');
  if (!t) return;
  el.toast.hidden = true;
  if (t.dataset.toast === 'fresh') { fresh(); return; }
  const s = saved();
  if (s) { A = s.a; go(s.step); }
});

/* Answering on step 1 while the toast is up means "start over"; the toast
   would only get in the way of the Next button at 390px. */
el.panel.addEventListener('click', () => { if (!el.toast.hidden) el.toast.hidden = true; }, true);

/* ---- boot ---------------------------------------------------------------- */

(function boot() {
  window.NB_BUILD = { get answers() { return A; }, get step() { return step; } };
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('s') ? decode(params.get('s')) : null;
  if (fromUrl) {
    A = fromUrl;
    fromLink = true;
    step = TOTAL;
    save();
    history.replaceState(null, '', location.pathname);
    render();
    say(STEPS[TOTAL - 1].ask, 'awesome');
    return;
  }
  // Same step 1 the HTML shipped; this render only binds it to state.
  render();
  const s = saved();
  if (s && (s.step > 1 || s.a.biz !== null || s.a.name)) {
    el.toastWhere.textContent = s.step === TOTAL ? 'Your spec sheet is ready.' : `You got to step ${s.step} of ${TOTAL}.`;
    el.toast.hidden = false;
  }
})();
