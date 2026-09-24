/* api/quote.ts — where the quote form lands.
 *
 * Two emails, in a fixed order, and the order is the whole design.
 *
 * 1. The notification to the studio. This one has to arrive: if it does not,
 *    the enquiry is lost, so a failure here is a failure of the submit and the
 *    visitor is told to phone instead. Reply-To is the visitor, so answering
 *    it answers them.
 * 2. The auto-reply to the visitor. This one is a courtesy. It is attempted
 *    only after the studio already has the enquiry, and if it fails the submit
 *    still succeeds — a bounced "thanks" must never cost us the customer.
 *
 * Both are sent from northbound-dev.com, which is verified in Resend (DKIM on
 * resend._domainkey, SPF on the send subdomain). Sending from Resend's shared
 * onboarding address instead only ever reaches the account owner, so a from
 * address off that domain would silently turn this into a test harness.
 *
 * The form posts here natively, with no JavaScript, and js/quote.js posts the
 * same form with fetch. The Accept header tells the two apart: fetch gets
 * JSON, a native post gets a redirect to /thanks.html (or a page with the
 * phone number on it), so a refresh never re-sends the enquiry.
 *
 * Zero dependencies on purpose: the site has no install step, and one POST to
 * Resend's REST API does not justify adding one.
 *
 * FOUNDING OFFER (first 15 founding clients only). The "Which package"
 * field on index.html's quote form posts `package`: '', 'clean', 'beacon',
 * 'engine' or 'bearing'. Beacon, Engine and Bearing are founding-priced —
 * when one of those is chosen, the visitor must also have claimed it by
 * filling in review_name, the name their Google review is posted under
 * (non-empty after trimming), or the enquiry is refused, same as
 * api/checkout.ts. Nothing verifies the review: Colin looks it up himself
 * before finalising the quote, and both emails say so. Cheap and Clean and
 * "Not sure yet" never require it.
 *
 * Env: RESEND_API_KEY, QUOTE_TO (the studio inbox), QUOTE_FROM (optional
 * override, "Name <address>" on a Resend-verified domain).
 */

import { GOOGLE_REVIEW_URL } from './checkout';

const PHONE = '470-573-8908';
const RESEND_URL = 'https://api.resend.com/emails';
const FALLBACK_FROM = 'Northbound Studio <quotes@northbound-dev.com>';

/* Generous, but bounded: nothing on this form needs more, and an unbounded
   field is an invitation to paste a novel into someone's inbox. */
const LIMITS = {
  name: 120,
  business: 160,
  phone: 40,
  email: 200,
  need: 2000,
  message: 5000,
  offerings: 400,
  package: 20,
  review_name: 120,
} as const;

type Field = keyof typeof LIMITS;
type Quote = Record<Field, string>;
type Sent = { ok: true; id: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The founding-priced packages a quote can carry, and what to call each one
   in an email a person reads. Kept in one place so the notification, the
   auto-reply and the validation below can never say three different things
   about the same package. */
const FOUNDING_PACKAGES: Record<string, string> = {
  beacon: 'Beacon — founding price $1,750 (standard $3,500)',
  engine: 'Engine — founding price $4,250 (standard $8,500)',
  bearing: 'Bearing — founding price $300/mo',
};

function read(form: FormData, key: Field): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, LIMITS[key]) : '';
}

function problem(q: Quote): string | null {
  if (!q.name) return 'Please tell us your name.';
  if (q.phone.replace(/\D/g, '').length < 7) return 'Please leave a phone number we can call.';
  if (!EMAIL_RE.test(q.email)) return 'Please check your email address.';
  if (q.package in FOUNDING_PACKAGES && !q.review_name) {
    return "Founding pricing needs the name your Google review is posted under — leave the review first, then tell us the name it shows. We check it ourselves before finalising the quote.";
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

function notification(q: Quote, page: string): string {
  const foundingLabel = q.package ? FOUNDING_PACKAGES[q.package] : undefined;
  return [
    `Name:      ${q.name}`,
    `Business:  ${q.business || '—'}`,
    `Phone:     ${q.phone}`,
    `Email:     ${q.email}`,
    `Package:   ${foundingLabel ?? (q.package === 'clean' ? 'Cheap and Clean — $600' : 'Not sure yet')}`,
    '',
    'What they need:',
    q.need || '—',
    '',
    'Message:',
    q.message || '—',
    '',
    `Added on the rail: ${q.offerings || 'nothing'}`,
    ...(foundingLabel ? [`Founding review: posted under "${q.review_name}" — look it up on Google before finalising the quote; nothing has checked it.`] : []),
    `Sent from: ${page || 'unknown'}`,
  ].join('\n');
}

function autoReply(q: Quote): string {
  const first = q.name.split(/\s+/)[0];
  const sent = [q.need, q.message].filter(Boolean).join('\n\n');
  const foundingLabel = q.package ? FOUNDING_PACKAGES[q.package] : undefined;
  return [
    `Hi ${first},`,
    '',
    "Thanks for getting in touch. We have your request and we'll get back to you within one business day.",
    '',
    ...(foundingLabel
      ? [
          `You asked about ${foundingLabel}.`,
          `You told us your Google review is posted under "${q.review_name}". Founding pricing is confirmed once we can see that review — we check it ourselves before finalising the quote, there's nothing automatic about it. If it isn't up yet, this is the place to leave it: ${GOOGLE_REVIEW_URL}`,
          '',
        ]
      : []),
    ...(sent ? ['What you sent us:', sent, ''] : []),
    `If it can't wait, call ${PHONE}.`,
    '',
    'Northbound Studio',
    'Grand Ledge, Michigan',
  ].join('\n');
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

/* The no-JS failure page. Deliberately plain: it only has to get a phone
   number in front of someone whose enquiry did not go through. */
function failurePage(message: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>That didn't send — Northbound Studio</title>
<style>body{margin:0;padding:48px 20px;background:#05090C;color:#E8EFF2;font:18px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:34rem;margin:0 auto}a{color:#4FD8C4}</style></head>
<body><main><h1>That didn't send.</h1><p>${message}</p>
<p>Call <a href="tel:+14705738908">${PHONE}</a> and we'll take it over the phone.</p>
<p><a href="/#contact">Back to the form</a></p></main></body></html>`;
  return new Response(html, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function done(request: Request): Response {
  return wantsJson(request)
    ? Response.json({ ok: true })
    : new Response(null, { status: 303, headers: { Location: '/thanks.html' } });
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
     finds. Answer exactly as a success would, so there is nothing to learn.
     The name is deliberately meaningless: a field called anything like
     "company" gets autofilled from a saved browser profile, and a real
     customer's enquiry would vanish here. The warn is the paper trail for
     the day that happens anyway. */
  const trap = form.get('nb_hp_7');
  if (typeof trap === 'string' && trap.trim() !== '') {
    console.warn('[quote] honeypot hit; not delivered', {
      name: form.get('name'),
      phone: form.get('phone'),
      email: form.get('email'),
    });
    return done(request);
  }

  const q = Object.fromEntries(
    (Object.keys(LIMITS) as Field[]).map((k) => [k, read(form, k)]),
  ) as Quote;

  const bad = problem(q);
  if (bad) return failed(request, 422, bad);

  const key = process.env.RESEND_API_KEY;
  const to = process.env.QUOTE_TO;
  const from = process.env.QUOTE_FROM || FALLBACK_FROM;
  if (!key || !to) {
    console.error('[quote] RESEND_API_KEY or QUOTE_TO is not set; enquiry not delivered', { name: q.name, phone: q.phone });
    return failed(request, 503, 'Our inbox is not connected right now.');
  }

  const firstNeed = q.need.split('\n')[0];
  const studio = await send(key, {
    from,
    to: [to],
    reply_to: q.email,
    subject: `Quote request: ${q.business || q.name}${firstNeed ? ` — ${firstNeed}` : ''}`.slice(0, 180),
    text: notification(q, request.headers.get('referer') ?? ''),
  });
  if (!studio.ok) {
    console.error('[quote] notification failed; enquiry not delivered', studio.error, { name: q.name, phone: q.phone });
    return failed(request, 502, 'Something went wrong on our side.');
  }

  const courtesy = await send(key, {
    from,
    to: [q.email],
    reply_to: to,
    subject: 'We got your request — Northbound Studio',
    text: autoReply(q),
  });
  if (courtesy.ok) {
    console.log('[quote] delivered', { notification: studio.id, autoReply: courtesy.id });
  } else {
    console.error('[quote] auto-reply failed (enquiry was delivered)', courtesy.error, { notification: studio.id });
  }

  return done(request);
}
