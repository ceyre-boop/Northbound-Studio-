/* api/checkout.ts — where the checkout form lands.
 *
 * ONE OFFER. The menu is a single item: The Northbound Site, at this week's
 * setup price, half now and half at launch, with the care plan starting the
 * day the site goes live. There are no tiers, no add-ons and no founding
 * prices here any more.
 *
 * THE PRICE comes from data/price.json through lib/price.ts and from nowhere
 * else. The pricing engine (Plans/pricing-engine.md) rewrites that file each
 * week. Nothing a visitor posts decides what they pay: this endpoint never
 * reads an amount from the form.
 *
 * Stripe is connected. A validated order becomes a Stripe Checkout Session
 * for the deposit and the visitor pays on Stripe's hosted page; card details
 * never touch this site. The order emails are NOT sent here; they go out
 * from api/stripe-webhook.ts when Stripe reports the payment completed. If
 * Stripe is not fully configured (both STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET set), or Stripe can't be reached, the order falls
 * back to the email capture below, honestly labelled: a secure payment link
 * follows within one business hour, and nothing has been charged. Raw fetch,
 * no SDK: the project ships with no install step.
 *
 * THE QUOTE LOG. Every session created here is a price quote the pricing
 * engine learns from. The week and the setup price ride in the session's
 * metadata (nb_week, nb_setup), so Stripe holds the durable record: a
 * session that completes is a yes, one that expires is a no. A [quote-log]
 * line is also written to the function log. See Plans/pricing-engine.md.
 *
 * THE GUIDED BUILD. build.html and the homepage send the visitor's answers
 * in `spec`, a short code from js/spec.js. It is descriptive only: it lets
 * both emails say what the customer told us, in words. The decoder is copied
 * here rather than imported from js/spec.js, and tests/spec.unit.test.ts
 * proves the two copies agree.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, QUOTE_TO
 * (the studio inbox), QUOTE_FROM (optional, "Name <address>" on a
 * Resend-verified domain).
 */

import { offer, money, logQuote, OFFER_NAME, CARE_NAME, type Offer } from '../lib/price.js';
import { clientIp, courtesyAllowed, formLimited, safeFirstName } from '../lib/guard.js';

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
  /* 500 each, the same as Stripe's metadata cap, so what the buyer can type
     is exactly what reaches the studio on either path. */
  why_not: 500,
  benefit: 500,
  why_us: 500,
} as const;

type Field = keyof typeof LIMITS;
type Order = Record<Field, string>;
type Sent = { ok: true; id: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* What `buy` may say. Empty and 'site' are the offer; 'clean' is what the
   page posted before the menu became one item, kept so a cached copy of the
   old page still orders the same thing. The retired tiers are refused rather
   than quietly sold as something else. */
const BUYABLE = ['', 'site', 'clean'] as const;

/* Characters with no width: zero-width space and friends, the bidi marks,
   the word joiner, the BOM. String.trim() does not remove them. */
const INVISIBLE = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF]/gu;

/* Cut by code point, never inside one. String.slice counts UTF-16 units,
   so a cut through an emoji left half a surrogate pair, encodeURIComponent
   threw on it building the Stripe request, and the order fell back to email
   capture: the buyer never reached payment. */
function clip(v: string, n: number): string {
  const cps = Array.from(v);
  return cps.length <= n ? v : cps.slice(0, n).join('');
}

function read(form: FormData, key: Field): string {
  const v = form.get(key);
  return typeof v === 'string' ? clip(v.replace(INVISIBLE, '').trim(), LIMITS[key]) : '';
}

function problem(o: Order): string | null {
  if (!(BUYABLE as readonly string[]).includes(o.buy)) return "We don't recognise what you're buying.";
  if (!o.name) return 'Please tell us your name.';
  if (!o.business) return 'Please tell us your business name.';
  if (o.phone.replace(/\D/g, '').length < 7) return 'Please leave a phone number we can call.';
  if (!EMAIL_RE.test(o.email)) return 'Please check your email address.';
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

/* The order in words a person reads. One place, so the two emails and the
   Stripe metadata can never describe the same order three ways. */
export function orderLines(p: Offer): string[] {
  return [
    `  ${OFFER_NAME} — ${money(p.setupCents)}`,
    `  ${CARE_NAME} — ${money(p.careCents)}/mo, starting the day the site goes live`,
  ];
}

export function paymentLine(p: Offer): string {
  return p.balanceCents
    ? `${money(p.depositCents)} now, ${money(p.balanceCents)} at launch.`
    : `${money(p.depositCents)} now, in full.`;
}

/* "Before you pay, pause." — one last, optional word from the buyer before
   they commit. Nothing here is required; three empty fields produce no
   section at all. Multi-line answers keep their line breaks. */
function pauseLines(o: Order): string[] {
  const items: [string, string][] = [
    ['Reasons they might not need us', o.why_not],
    ['What it should bring them', o.benefit],
    ['Why Northbound', o.why_us],
  ];
  const present = items.filter(([, v]) => v);
  if (!present.length) return [];
  const lines = ['In their words:'];
  for (const [label, value] of present) {
    const [first, ...rest] = value.split('\n');
    lines.push(`  ${label}: ${first}`);
    for (const cont of rest) lines.push(`    ${cont}`);
  }
  return lines;
}

function notification(o: Order, p: Offer, page: string, spec: Spec | null): string {
  const lines = [
    `Name:      ${o.name}`,
    `Business:  ${o.business}`,
    `Phone:     ${o.phone}`,
    `Email:     ${o.email}`,
    '',
    'Order:',
    ...orderLines(p),
    '',
    `Due today: ${money(p.depositCents)}`,
    `At launch: ${money(p.balanceCents)} (the balance)`,
    `Payment: ${paymentLine(p)}`,
    `Price week: ${p.week}`,
  ];
  if (spec) lines.push('', ...specLines(spec));
  const pause = pauseLines(o);
  if (pause.length) lines.push('', ...pause);
  lines.push('', `Sent from: ${page || 'unknown'}`);
  return lines.join('\n');
}

function confirmation(o: Order, p: Offer, spec: Spec | null): string {
  // Only fixed text and the checked first name: this goes to an address a stranger typed (lib/guard.ts).
  void spec;
  const lines = [
    `Hi ${safeFirstName(o.name)},`,
    '',
    'We have your order for:',
    ...orderLines(p),
    '',
    `Due today: ${money(p.depositCents)}`,
    `At launch: ${money(p.balanceCents)} (the balance)`,
  ];
  lines.push(
    '',
    "Nothing has been charged yet. We'll email a secure payment link within one business hour. Once that's paid, we get started.",
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
 * labels, same rules; tests/spec.unit.test.ts asserts they agree. The twelve
 * part names are spelled exactly as the site spells them. */

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
  /* Parts picked by hand on the homepage (the version-2 code); null when
     the build came from answers on build.html. */
  parts: string[] | null;
};

const SPEC_VERSION = '1';
const SPEC_PARTS_VERSION = '2';
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
const SPEC_WORTH: Record<string, string> = { '1': 'Under 200', '2': '200 to 1,000', '3': '1,000 to 5,000', '4': 'More than 5,000' };
const SPEC_WORTH_KEY: Record<string, string> = { '1': 'u200', '2': '200-1k', '3': '1k-5k', '4': '5k+' };
const SPEC_ANSWERS: Record<string, string> = { m: 'Me, always', f: 'My partner or family', n: 'Nobody — it waits until morning' };
const SPEC_ANSWERS_KEY: Record<string, string> = { m: 'me', f: 'family', n: 'nobody' };
const SPEC_RUN: Record<string, string> = { m: "I'll run it myself", y: 'Keep it running for me' };
const SPEC_RUN_KEY: Record<string, string> = { m: 'me', y: 'you' };
const SPEC_LOOK: Record<string, string> = { '1': 'Clean', '2': 'Dark', '3': 'Editorial', '4': 'Photo', '5': 'Industrial' };
/* One offer now. The codes the two retired tiers used still decode, to the
   same site, so a link someone saved last month does not break. */
const SPEC_PKG_KEY: Record<string, string> = { c: 'site', b: 'site', e: 'site' };

const SPEC_OFFERINGS = ['A custom site', 'Brand identity', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests', 'Owner dashboard', 'Local SEO', 'AI intake'];
const SPEC_INCLUDED = ['A custom site'];

function keyFor(map: Record<string, string>, c: string): string | null {
  return c === SPEC_UNSURE ? SPEC_UNSURE : map[c] ?? null;
}

export function decodeSpec(s: string): Spec | null {
  if (!s) return null;
  const dot = s.indexOf('.');
  const code = dot === -1 ? s : s.slice(0, dot);
  if (code[0] === SPEC_PARTS_VERSION) {
    if (code.length !== 5 || !/^[0-9a-z]{3}$/.test(code.slice(1, 4))) return null;
    const picked = parseInt(code.slice(1, 4), 36);
    if (picked >= 1 << SPEC_OFFERINGS.length) return null;
    return {
      name: '',
      biz: SPEC_UNSURE, now: SPEC_UNSURE, want: [], worth: SPEC_UNSURE, answers: SPEC_UNSURE, run: SPEC_UNSURE, look: SPEC_UNSURE,
      pkg: SPEC_PKG_KEY[code[4]] ?? null,
      parts: SPEC_OFFERINGS.filter((_, i) => picked & (1 << i)),
    };
  }
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
    parts: null,
  };
}

export function specParts(a: Spec): string[] {
  if (Array.isArray(a.parts)) return SPEC_OFFERINGS.filter((o) => a.parts!.includes(o));
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

/* What the visitor told us, in words. The site covers "A custom site"; any
   other part they picked is something to quote separately, and the email
   says so rather than implying it is in the order. */
export function specLines(a: Spec): string[] {
  const label = (map: Record<string, string>, keyMap: Record<string, string>, key: string | null) => {
    const code = Object.keys(keyMap).find((c) => keyMap[c] === key);
    return code ? map[code] : 'Not sure yet';
  };
  const parts = specParts(a);
  const extra = parts.filter((p) => !SPEC_INCLUDED.includes(p));
  if (a.parts) {
    const lines = [
      'What they picked on the site:',
      `  Picked:     ${parts.length ? parts.join(', ') : 'nothing'}`,
    ];
    if (extra.length) lines.push(`  To quote separately: ${extra.join(', ')}`);
    return lines;
  }
  const lines = [
    'Their answers (from build.html):',
    `  Business:   ${[a.name, label(SPEC_BIZ, SPEC_BIZ_KEY, a.biz)].filter(Boolean).join(' — ')}`,
    `  Today:      ${label(SPEC_NOW, SPEC_NOW_KEY, a.now)}`,
    `  Wants more: ${a.want.length ? a.want.map((k) => SPEC_WANT.find((w) => w.key === k)?.label).join(', ') : 'Not sure yet'}`,
    `  Worth:      ${label(SPEC_WORTH, SPEC_WORTH_KEY, a.worth)} dollars per customer`,
    `  Nights:     ${label(SPEC_ANSWERS, SPEC_ANSWERS_KEY, a.answers)}`,
    `  Running it: ${label(SPEC_RUN, SPEC_RUN_KEY, a.run)}`,
    `  Look:       ${a.look && SPEC_LOOK[a.look] ? SPEC_LOOK[a.look] : 'Not sure yet'}`,
  ];
  if (extra.length) lines.push(`  To quote separately: ${extra.join(', ')}`);
  return lines;
}

/* ---- Stripe ---------------------------------------------------------------
 *
 * Raw REST, no SDK: POST /v1/checkout/sessions with the secret key as a
 * bearer token, form-encoded the way Stripe expects. The amount charged is
 * the deposit, computed from data/price.json, never from the client.
 * Everything the webhook needs for the order emails rides in metadata
 * (values capped at 500 chars, Stripe's limit), including the price week and
 * the setup price the pricing engine reads back.
 */

const STRIPE_SESSIONS_URL = 'https://api.stripe.com/v1/checkout/sessions';
const SITE = 'https://northbound-dev.com';

type SessionResult = { ok: true; url: string; id: string } | { ok: false; error: string };

function stripeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function createCheckoutSession(key: string, o: Order, p: Offer, specText: string, referer: string): Promise<SessionResult> {
  const params: Record<string, string> = {
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(p.depositCents),
    'line_items[0][price_data][product_data][name]': `Northbound Studio — ${OFFER_NAME} (deposit)`,
    'line_items[0][quantity]': '1',
    customer_email: o.email,
    /* Stripe shows its own "add promotion code" box. A code can only lower
       what Stripe charges; the quoted price in the metadata does not move. */
    allow_promotion_codes: 'true',
    success_url: `${SITE}/order-paid.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: referer.startsWith(SITE) ? referer : `${SITE}/checkout.html`,
    /* No payment_intent_data here. A 100%-off promotion code makes the order
       free, a free order has no PaymentIntent, and Stripe then rejects the
       code as "invalid" if the session carries PaymentIntent settings. The
       business name is in the metadata instead. */
    'metadata[nb_name]': o.name,
    'metadata[nb_business]': o.business,
    'metadata[nb_phone]': o.phone,
    'metadata[nb_email]': o.email,
    'metadata[nb_item]': `${OFFER_NAME} — ${money(p.setupCents)}`,
    'metadata[nb_due]': String(p.depositCents),
    'metadata[nb_balance]': String(p.balanceCents),
    'metadata[nb_monthly]': `${CARE_NAME} — ${money(p.careCents)}/mo, starting the day the site goes live`,
    /* The pricing engine's record: which week's price this quote was. */
    'metadata[nb_week]': p.week,
    'metadata[nb_setup]': String(p.setupCents),
    'metadata[nb_care]': String(p.careCents),
    'metadata[nb_spec]': specText.slice(0, 500),
  };
  /* Optional, so omitted entirely when empty rather than shipping a blank
     Stripe metadata value. */
  if (o.why_not) params['metadata[nb_why_not]'] = clip(o.why_not, 500);
  if (o.benefit) params['metadata[nb_benefit]'] = clip(o.benefit, 500);
  if (o.why_us) params['metadata[nb_why_us]'] = clip(o.why_us, 500);
  try {
    const res = await fetch(STRIPE_SESSIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: stripeForm(params),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; id?: string; error?: { message?: string } };
    if (res.ok && data.url) return { ok: true, url: data.url, id: data.id ?? '' };
    return { ok: false, error: data.error?.message ?? `Stripe returned ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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

  /* Limits (lib/guard.ts): a person sends one form; a script sending hundreds is refused here, before
     anything is emailed or created. */
  if (formLimited(request, 'checkout')) {
    console.warn('[checkout] rate limited', { ip: clientIp(request) });
    return failed(request, 429, `That's a lot of requests in a short time, so this one wasn't sent. Please call ${PHONE}.`);
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

  const bad = problem(o);
  if (bad) return failed(request, 422, bad);

  /* The price, read fresh for every order. If the file cannot be read there
     is no number to charge, and guessing one is worse than refusing. */
  let p: Offer;
  try {
    p = offer();
  } catch (err) {
    console.error('[checkout] price config unreadable; order refused', err instanceof Error ? err.message : err, { name: o.name, phone: o.phone });
    return failed(request, 503, 'Our checkout is not ready right now.');
  }

  const spec = decodeSpec(o.spec);

  /* Stripe, when fully configured: the validated order becomes a Checkout
     Session and the visitor pays the deposit on Stripe's hosted page. Both
     keys must be set; a half-configured Stripe is worse than none. */
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeKey && webhookSecret) {
    const specText = spec ? specLines(spec).join(' | ') : '';
    const referer = request.headers.get('referer') ?? '';
    const session = await createCheckoutSession(stripeKey, o, p, specText, referer);
    if (session.ok) {
      logQuote({ event: 'quote_created', week: p.week, setup: p.setupCents / 100, session: session.id, outcome: 'open', business: o.business });
      return wantsJson(request)
        ? Response.json({ ok: true, url: session.url })
        : new Response(null, { status: 303, headers: { Location: session.url } });
    }
    /* Stripe itself unreachable or refused: fall through to the email
       capture below, which promises a payment link — and then one really
       does follow, sent by hand from the Stripe dashboard. */
    console.error('[checkout] stripe session failed; falling back to email capture', session.error, { name: o.name });
  }

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
    subject: `Order: ${OFFER_NAME} — ${o.business}`.slice(0, 180),
    text: notification(o, p, request.headers.get('referer') ?? '', spec),
  });
  if (!studio.ok) {
    console.error('[checkout] notification failed; order not delivered', studio.error, { name: o.name, phone: o.phone });
    return failed(request, 502, 'Something went wrong on our side.');
  }

  if (!courtesyAllowed(o.email)) {
    console.warn('[checkout] delivered; confirmation skipped (this address already had one today, or the hourly ceiling)', { notification: studio.id });
    return done(request);
  }
  const courtesy = await send(key, {
    from,
    to: [o.email],
    reply_to: to,
    subject: 'Your order — Northbound Studio',
    text: confirmation(o, p, spec),
  });
  if (courtesy.ok) {
    console.log('[checkout] delivered', { notification: studio.id, confirmation: courtesy.id });
  } else {
    console.error('[checkout] confirmation failed (order was delivered)', courtesy.error, { notification: studio.id });
  }

  return done(request);
}
