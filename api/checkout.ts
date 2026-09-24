/* api/checkout.ts — where the checkout form lands.
 *
 * There is no Stripe integration yet. This endpoint captures the order
 * honestly: it prices it server-side, tells the studio, and tells the
 * customer exactly what is true — we have the order, here is what it costs,
 * a secure payment link follows within one business hour, and nothing has
 * been charged. When Stripe is connected, this becomes the handler that
 * creates a Stripe Checkout Session and redirects there; order capture (this
 * file, mostly unchanged) becomes its fallback for when Stripe itself is
 * unreachable. Until then, do not add a Stripe SDK or stub a payment call —
 * there is nothing to fake here, only an order to record and an honest email
 * to send.
 *
 * Modelled closely on api/quote.ts: same Resend REST usage, same honeypot
 * (nb_hp_7), same JSON-vs-form response split, same env vars.
 *
 * 1. The notification to the studio. This one has to arrive: if it does not,
 *    the order is lost, so a failure here is a failure of the submit and the
 *    visitor is told to phone instead. Reply-To is the customer, so
 *    answering it answers them.
 * 2. The confirmation to the customer. Attempted only after the studio
 *    already has the order, and if it fails the submit still succeeds — a
 *    bounced confirmation must never cost us the order.
 *
 * Both are sent from northbound-dev.com, which is verified in Resend.
 *
 * The form posts here natively, with no JavaScript needed — checkout.html's
 * script only updates the displayed running total, never the price actually
 * charged. The Accept header tells a fetch apart from a native post: fetch
 * gets JSON, a native post gets a redirect to /order-received.html (or a
 * page with the phone number on it), so a refresh never re-sends the order.
 *
 * FOUNDING OFFER (first 15 founding clients only). Beacon and Engine are not
 * yet buyable directly from checkout.html — that CTA still sends people to
 * the quote form — but their founding deposit amounts live in PRICES below
 * so this table stays the single source of truth for every founding number
 * on the site, and so a direct POST (e.g. once a future buy button exists)
 * prices correctly from day one. Bearing is buyable here today, as an
 * add-on to Cheap and Clean, and moves from a flat $600/mo to two founding
 * terms: bearing_12 ($300/mo, locked for all twelve months) and
 * bearing_mtm ($300 the first month, then $600/mo after). Whichever
 * founding item is in the order (beacon, engine, or either Bearing term),
 * the visitor must also have ticked the founding agreement checkbox
 * (founding_agree) — early client, Google review once the profile is live —
 * or the order is refused with a message saying so.
 *
 * THE GUIDED BUILD. build.html sends its "Reserve my build" here with the
 * package key in `buy` and the build's answers in `spec`, a short code from
 * js/spec.js. The code is descriptive only: it decides nothing about price
 * (PRICES below does), it just lets both emails say what the customer put
 * together, part by part, in words. The decoder and the answers-to-parts
 * mapping are copied here rather than imported from js/spec.js — a browser
 * module is not something to bundle into a serverless function on trust —
 * and tests/checkout.unit.test.ts proves the two copies agree.
 *
 * Beacon and Engine are a 50% deposit now and the balance on delivery, and
 * the emails say both numbers: "$875.00 now, $875.00 on delivery". 50% up
 * front, always. No deposit, no work.
 *
 * Env: RESEND_API_KEY, QUOTE_TO (the studio inbox), QUOTE_FROM (optional
 * override, "Name <address>" on a Resend-verified domain).
 */

const PHONE = '470-573-8908';
const RESEND_URL = 'https://api.resend.com/emails';
const FALLBACK_FROM = 'Northbound Studio <quotes@northbound-dev.com>';

/* Generous, but bounded: nothing on this form needs more, and an unbounded
   field is an invitation to paste a novel into someone's inbox. */
const LIMITS = {
  buy: 40,
  name: 120,
  business: 160,
  phone: 40,
  email: 200,
  spec: 120,
} as const;

type Field = keyof typeof LIMITS;
type Order = Record<Field, string>;
type Sent = { ok: true; id: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The server-side price table. Nothing a visitor can edit decides what they
   pay — checkout.html's running total is a convenience only, and this table
   is what the order is actually priced from. All amounts in cents.

   `founding: true` marks an item that only exists at the founding-client
   price. Ordering one of these requires founding_agree to be checked (see
   problem() below), and the emails say so in words a person can read. */
const PRICES = {
  clean: { label: 'Cheap and Clean', cents: 60000, cadence: 'once' },
  beacon: { label: 'Beacon — 50% deposit (founding price $1,750, standard $3,500)', cents: 87500, balance: 87500, cadence: 'deposit', founding: true },
  engine: { label: 'Engine — 50% deposit (founding price $4,250, standard $8,500)', cents: 212500, balance: 212500, cadence: 'deposit', founding: true },
  care: { label: 'Changes and support', cents: 4900, cadence: '/mo' },
  bearing_12: { label: 'Bearing — 12-month commitment (founding price)', cents: 30000, cadence: '/mo for 12 months', founding: true },
  bearing_mtm: { label: 'Bearing — month-to-month (founding price)', cents: 30000, cadence: '/mo, first month', note: 'then $600/mo after', founding: true },
} as const;

const BEARING_TERMS = { '12': 'bearing_12', mtm: 'bearing_mtm' } as const;

/* What can be posted as the primary `buy` item. care and the two bearing
   terms are add-ons, priced from the same table, but never a `buy` value on
   their own. */
const BUYABLE = ['clean', 'beacon', 'engine'] as const;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function read(form: FormData, key: Field): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, LIMITS[key]) : '';
}

function checked(form: FormData, key: string): boolean {
  const v = form.get(key);
  return typeof v === 'string' && v.trim() !== '' && v.trim() !== '0' && v.trim().toLowerCase() !== 'false';
}

function isFounding(key: keyof typeof PRICES): boolean {
  return (PRICES[key] as { founding?: boolean }).founding === true;
}

function problem(
  o: Order,
  buy: keyof typeof PRICES | null,
  bearingChecked: boolean,
  bearingKey: keyof typeof PRICES | null,
  foundingAgree: boolean,
): string | null {
  if (!buy) return "We don't recognise what you're buying.";
  if (!o.name) return 'Please tell us your name.';
  if (!o.business) return 'Please tell us your business name.';
  if (o.phone.replace(/\D/g, '').length < 7) return 'Please leave a phone number we can call.';
  if (!EMAIL_RE.test(o.email)) return 'Please check your email address.';
  if (bearingChecked && !bearingKey) return "Please choose a Bearing term — 12-month commitment or month-to-month.";
  const takingFounding = isFounding(buy) || bearingKey !== null;
  if (takingFounding && !foundingAgree) {
    return "Founding pricing needs the agreement checked — that you're happy to be an early client and to leave a Google review once our Google profile is live.";
  }
  return null;
}

async function send(key: string, email: Record<string, unknown>): Promise<Sent> {
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && data.id) return { ok: true, id: data.id };
    return { ok: false, error: `${res.status} ${data.message ?? 'no message'}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type LineItem = { label: string; cents: number; note?: string };

type Summary = {
  once: LineItem[];
  monthly: LineItem[];
  dueToday: number;
  balance: number;
  monthlyTotal: number;
};

function summarize(buy: keyof typeof PRICES, care: boolean, bearingKey: keyof typeof PRICES | null): Summary {
  const once: LineItem[] = [{ label: PRICES[buy].label, cents: PRICES[buy].cents }];
  const balance = (PRICES[buy] as { balance?: number }).balance ?? 0;
  const monthly: LineItem[] = [];
  if (care) monthly.push({ label: PRICES.care.label, cents: PRICES.care.cents });
  if (bearingKey) {
    const b = PRICES[bearingKey] as { label: string; cents: number; note?: string };
    monthly.push({ label: b.label, cents: b.cents, note: b.note });
  }
  const dueToday = once.reduce((n, l) => n + l.cents, 0);
  const monthlyTotal = monthly.reduce((n, l) => n + l.cents, 0);
  return { once, monthly, dueToday, balance, monthlyTotal };
}

/* The deposit and the balance, in one line a person reads: "$875.00 now,
   $875.00 on delivery". Cheap and Clean is the whole price, so just "now". */
function depositLine(summary: Summary): string {
  return summary.balance
    ? `${money(summary.dueToday)} now, ${money(summary.balance)} on delivery — 50% up front, always. No deposit, no work.`
    : `${money(summary.dueToday)} now, in full.`;
}

function monthlyLine(l: LineItem): string {
  return `  ${l.label} — ${money(l.cents)}/mo${l.note ? ` (${l.note})` : ''}`;
}

function notification(o: Order, summary: Summary, foundingTaken: boolean, foundingAgree: boolean, page: string, spec: Spec | null): string {
  const lines = [
    `Name:      ${o.name}`,
    `Business:  ${o.business}`,
    `Phone:     ${o.phone}`,
    `Email:     ${o.email}`,
    '',
    'Order:',
    ...summary.once.map((l) => `  ${l.label} — ${money(l.cents)} once`),
    ...summary.monthly.map(monthlyLine),
    '',
    `Due today: ${money(summary.dueToday)}`,
  ];
  if (summary.balance) lines.push(`On delivery: ${money(summary.balance)} (the balance)`);
  lines.push(`Payment: ${depositLine(summary)}`);
  if (summary.monthlyTotal) lines.push(`Then: ${money(summary.monthlyTotal)}/mo, starting next month`);
  if (spec) lines.push('', ...specLines(spec));
  if (foundingTaken) {
    lines.push('', `Founding agreement: ${foundingAgree ? 'confirmed — early client + Google review once the profile is live' : 'MISSING'}`);
  }
  lines.push('', `Sent from: ${page || 'unknown'}`);
  return lines.join('\n');
}

function confirmation(o: Order, summary: Summary, foundingTaken: boolean, spec: Spec | null): string {
  const first = o.name.split(/\s+/)[0];
  const lines = [
    `Hi ${first},`,
    '',
    "We have your order for:",
    ...summary.once.map((l) => `  ${l.label} — ${money(l.cents)} once`),
    ...summary.monthly.map(monthlyLine),
    '',
    `Due today: ${money(summary.dueToday)}`,
  ];
  if (summary.balance) lines.push(`On delivery: ${money(summary.balance)} (the balance)`);
  lines.push(`Payment: ${depositLine(summary)}`);
  if (summary.monthlyTotal) lines.push(`Then: ${money(summary.monthlyTotal)}/mo, starting next month.`);
  if (spec) lines.push('', ...specLines(spec));
  if (foundingTaken) {
    lines.push(
      '',
      "As one of our founding clients, you've agreed to be an early client and to leave a Google review once our Google Business Profile is live — it isn't yet, so there's nothing to review today.",
    );
  }
  lines.push(
    '',
    "Nothing has been charged yet. We'll email a secure payment link within one business hour — once that's paid, we start the build.",
    '',
    `If it can't wait, call ${PHONE}.`,
    '',
    'Northbound Studio',
    'Grand Ledge, Michigan',
  );
  return lines.join('\n');
}

/* ---- the guided build's code, decoded into words ---------------------------
 *
 * A copy of js/spec.js's vocabulary, decoder and mapping. Same codes, same
 * labels, same rules; tests/checkout.unit.test.ts asserts they agree. The
 * twelve part names are spelled exactly as index.html spells them. */

type Spec = {
  name: string;
  biz: string | null;
  now: string | null;
  want: string[];
  worth: string | null;
  answers: string | null;
  run: string | null;
  look: string | null;
  pkg: string | null;
};

const SPEC_VERSION = '1';
const SPEC_UNSURE = '_';
const SPEC_BIZ: Record<string, string> = { t: 'Trades & home services', f: 'Food & drink', s: 'Salon, spa or fitness', r: 'Shop or store', p: 'Professional services', o: 'Something else' };
const SPEC_BIZ_KEY: Record<string, string> = { t: 'trades', f: 'food', s: 'salon', r: 'shop', p: 'pro', o: 'other' };
const SPEC_NOW: Record<string, string> = { c: 'They call me', m: 'They message me on Facebook or Instagram', h: 'Nothing — I hope they find me', s: "I have a site but it doesn't do anything" };
const SPEC_NOW_KEY: Record<string, string> = { c: 'call', m: 'dm', h: 'hope', s: 'site' };
const SPEC_WANT: { key: string; bit: number; label: string }[] = [
  { key: 'jobs', bit: 1, label: 'Booked jobs' },
  { key: 'quotes', bit: 2, label: 'Quote requests' },
  { key: 'orders', bit: 4, label: 'Orders' },
  { key: 'walkins', bit: 8, label: 'People walking in' },
  { key: 'found', bit: 16, label: 'Being found at all' },
];
const SPEC_WORTH: Record<string, string> = { '1': 'Under $200', '2': '$200–$1,000', '3': '$1,000–$5,000', '4': 'More than $5,000' };
const SPEC_WORTH_KEY: Record<string, string> = { '1': 'u200', '2': '200-1k', '3': '1k-5k', '4': '5k+' };
const SPEC_ANSWERS: Record<string, string> = { m: 'Me, always', f: 'My partner or family', n: 'Nobody — it waits until morning' };
const SPEC_ANSWERS_KEY: Record<string, string> = { m: 'me', f: 'family', n: 'nobody' };
const SPEC_RUN: Record<string, string> = { m: "I'll run it myself", y: 'Keep it running for me' };
const SPEC_RUN_KEY: Record<string, string> = { m: 'me', y: 'you' };
const SPEC_LOOK: Record<string, string> = { '1': 'Clean', '2': 'Dark', '3': 'Editorial', '4': 'Photo', '5': 'Industrial' };
const SPEC_PKG_KEY: Record<string, string> = { c: 'clean', b: 'beacon', e: 'engine' };

const SPEC_OFFERINGS = ['A custom site', 'Brand identity', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests', 'Owner dashboard', 'Local SEO', 'AI intake'];
const SPEC_INCLUDES: Record<string, string[]> = {
  clean: ['A custom site'],
  beacon: ['A custom site', 'Brand identity', 'Local SEO'],
  engine: ['A custom site', 'Brand identity', 'Local SEO', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests', 'Owner dashboard'],
};
const SPEC_CORE = ['Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up'];
const SPEC_ENGINE_ONLY = [...SPEC_CORE, 'Reminders', 'Review requests', 'Owner dashboard'];
const SPEC_BEACON_PARTS = ['Brand identity', 'Local SEO'];

function keyFor(map: Record<string, string>, c: string): string | null {
  return c === SPEC_UNSURE ? SPEC_UNSURE : map[c] ?? null;
}

export function decodeSpec(s: string): Spec | null {
  if (!s) return null;
  const dot = s.indexOf('.');
  const code = dot === -1 ? s : s.slice(0, dot);
  if (code.length !== 9 || code[0] !== SPEC_VERSION) return null;
  const mask = parseInt(code[3], 36);
  let name = '';
  if (dot !== -1) {
    try { name = decodeURIComponent(s.slice(dot + 1)).trim().slice(0, 60); } catch { name = ''; }
  }
  return {
    name,
    biz: keyFor(SPEC_BIZ_KEY, code[1]),
    now: keyFor(SPEC_NOW_KEY, code[2]),
    want: Number.isNaN(mask) ? [] : SPEC_WANT.filter((w) => mask & w.bit).map((w) => w.key),
    worth: keyFor(SPEC_WORTH_KEY, code[4]),
    answers: keyFor(SPEC_ANSWERS_KEY, code[5]),
    run: keyFor(SPEC_RUN_KEY, code[6]),
    look: code[7] === SPEC_UNSURE ? SPEC_UNSURE : SPEC_LOOK[code[7]] ? code[7] : null,
    pkg: SPEC_PKG_KEY[code[8]] ?? null,
  };
}

export function specParts(a: Spec): string[] {
  const set = new Set<string>(['A custom site']);
  const add = (...names: string[]) => names.forEach((n) => set.add(n));
  if (a.now === 'hope') add('Local SEO');
  if (a.now === 'site') add('Lead capture');
  if (a.now === 'dm') add('Lead capture', 'Automated follow-up');
  if (a.want.includes('jobs')) add('Booking flow', 'Reminders');
  if (a.want.includes('quotes')) add('Quote flow');
  if (a.want.includes('orders')) add('Payments');
  if (a.want.includes('walkins')) add('Local SEO');
  if (a.want.includes('found')) add('Local SEO', 'Brand identity');
  if (a.worth === '200-1k') add('Review requests');
  if (a.worth === '1k-5k') add('Payments', 'Review requests');
  if (a.worth === '5k+') add('Payments', 'Review requests', 'Owner dashboard');
  if (a.answers === 'family') add('Automated follow-up');
  if (a.answers === 'nobody') add('Automated follow-up', 'Lead capture');
  return SPEC_OFFERINGS.filter((o) => set.has(o));
}

export function specRecommend(parts: string[]): string {
  const engineParts = parts.filter((p) => SPEC_ENGINE_ONLY.includes(p));
  if (engineParts.some((p) => SPEC_CORE.includes(p)) || engineParts.length >= 2) return 'engine';
  if (engineParts.length || parts.some((p) => SPEC_BEACON_PARTS.includes(p))) return 'beacon';
  return 'clean';
}

function specLines(a: Spec): string[] {
  const label = (map: Record<string, string>, keyMap: Record<string, string>, key: string | null) => {
    const code = Object.keys(keyMap).find((c) => keyMap[c] === key);
    return code ? map[code] : 'Not sure yet';
  };
  const parts = specParts(a);
  const recommended = specRecommend(parts);
  const pkg = a.pkg ?? recommended;
  const included = parts.filter((p) => SPEC_INCLUDES[pkg]?.includes(p));
  const extra = parts.filter((p) => !SPEC_INCLUDES[pkg]?.includes(p));
  const lines = [
    'Their build (from build.html):',
    `  Business:   ${[a.name, label(SPEC_BIZ, SPEC_BIZ_KEY, a.biz)].filter(Boolean).join(' — ')}`,
    `  Today:      ${label(SPEC_NOW, SPEC_NOW_KEY, a.now)}`,
    `  Wants more: ${a.want.length ? a.want.map((k) => SPEC_WANT.find((w) => w.key === k)?.label).join(', ') : 'Not sure yet'}`,
    `  Worth:      ${label(SPEC_WORTH, SPEC_WORTH_KEY, a.worth)} per customer`,
    `  Nights:     ${label(SPEC_ANSWERS, SPEC_ANSWERS_KEY, a.answers)}`,
    `  Running it: ${label(SPEC_RUN, SPEC_RUN_KEY, a.run)}`,
    `  Look:       ${a.look && SPEC_LOOK[a.look] ? SPEC_LOOK[a.look] : 'Not sure yet'}`,
    `  Parts:      ${included.join(', ')}`,
  ];
  if (extra.length) lines.push(`  Not in package: ${extra.join(', ')}`);
  if (pkg !== recommended) lines.push(`  (Their answers pointed at ${recommended}; they chose ${pkg}.)`);
  return lines;
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

/* The no-JS failure page. Deliberately plain: it only has to get a phone
   number in front of someone whose order did not go through. */
function failurePage(message: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>That didn't send — Northbound Studio</title>
<style>body{margin:0;padding:48px 20px;background:#05090C;color:#E8EFF2;font:18px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:34rem;margin:0 auto}a{color:#4FD8C4}</style></head>
<body><main><h1>That didn't send.</h1><p>${message}</p>
<p>Call <a href="tel:+14705738908">${PHONE}</a> and we'll take your order over the phone.</p>
<p><a href="/checkout.html">Back to checkout</a></p></main></body></html>`;
  return new Response(html, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function done(request: Request): Response {
  return wantsJson(request)
    ? Response.json({ ok: true })
    : new Response(null, { status: 303, headers: { Location: '/order-received.html' } });
}

function failed(request: Request, status: number, message: string): Response {
  return wantsJson(request) ? Response.json({ ok: false, error: message }, { status }) : failurePage(message);
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failed(request, 400, 'The form arrived empty.');
  }

  /* The honeypot. A person never sees this field; a bot fills every field it
     finds. Answer exactly as a success would, so there is nothing to learn. */
  const trap = form.get('nb_hp_7');
  if (typeof trap === 'string' && trap.trim() !== '') {
    console.warn('[checkout] honeypot hit; not delivered', {
      name: form.get('name'),
      phone: form.get('phone'),
      email: form.get('email'),
    });
    return done(request);
  }

  const o = Object.fromEntries(
    (Object.keys(LIMITS) as Field[]).map((k) => [k, read(form, k)]),
  ) as Order;

  const buy = (BUYABLE as readonly string[]).includes(o.buy) ? (o.buy as (typeof BUYABLE)[number]) : null;

  const care = checked(form, 'care');
  const bearingChecked = checked(form, 'bearing');
  const bearingTermRaw = form.get('bearing_term');
  const bearingTerm = typeof bearingTermRaw === 'string' ? bearingTermRaw.trim() : '';
  const bearingKey = bearingChecked ? (BEARING_TERMS as Record<string, keyof typeof PRICES>)[bearingTerm] ?? null : null;
  const foundingAgree = checked(form, 'founding_agree');

  const bad = problem(o, buy, bearingChecked, bearingKey, foundingAgree);
  if (bad) return failed(request, 422, bad);

  const summary = summarize(buy!, care, bearingKey);
  const foundingTaken = isFounding(buy!) || bearingKey !== null;
  const spec = decodeSpec(o.spec);

  const key = process.env.RESEND_API_KEY;
  const to = process.env.QUOTE_TO;
  const from = process.env.QUOTE_FROM || FALLBACK_FROM;
  if (!key || !to) {
    console.error('[checkout] RESEND_API_KEY or QUOTE_TO is not set; order not delivered', { name: o.name, phone: o.phone });
    return failed(request, 503, 'Our inbox is not connected right now.');
  }

  const studio = await send(key, {
    from,
    to: [to],
    reply_to: o.email,
    subject: `Order: ${PRICES[buy!].label} — ${o.business}`.slice(0, 180),
    text: notification(o, summary, foundingTaken, foundingAgree, request.headers.get('referer') ?? '', spec),
  });
  if (!studio.ok) {
    console.error('[checkout] notification failed; order not delivered', studio.error, { name: o.name, phone: o.phone });
    return failed(request, 502, 'Something went wrong on our side.');
  }

  const courtesy = await send(key, {
    from,
    to: [o.email],
    reply_to: to,
    subject: 'Your order — Northbound Studio',
    text: confirmation(o, summary, foundingTaken, spec),
  });
  if (courtesy.ok) {
    console.log('[checkout] delivered', { notification: studio.id, confirmation: courtesy.id });
  } else {
    console.error('[checkout] confirmation failed (order was delivered)', courtesy.error, { notification: studio.id });
  }

  return done(request);
}
