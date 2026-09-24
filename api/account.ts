/* api/account.ts — plan changes from account.html.
 *
 * index.html and order-received.html both tell a client they can add or drop
 * a plan "any time from your account". That promise was 404ing; this is the
 * half that makes it true.
 *
 * There is no login and no billing portal here, because there is nothing
 * real to log into yet: payments are not connected, so no Stripe customer
 * exists to look anyone up against. A sign-in screen would be a lie told in
 * UI. So this endpoint does the honest version — it takes the request,
 * matches it to a person by the email they ordered with, tells the studio,
 * and tells the client exactly what happens next. When Stripe is wired,
 * account.html gains a real billing-portal door and this stays as the
 * fallback for everything a portal cannot do (drop me a section, change my
 * hours, my photos are wrong).
 *
 * Same shape as api/checkout.ts and api/quote.ts on purpose: Resend REST,
 * the nb_hp_7 honeypot, JSON for fetch and a 303 for a native post, and the
 * studio notification is the one that must land — if it fails, the visitor
 * is told to phone rather than being thanked for nothing.
 *
 * Env: RESEND_API_KEY, QUOTE_TO (the studio inbox), QUOTE_FROM (optional).
 */

const PHONE = '470-573-8908';
const RESEND_URL = 'https://api.resend.com/emails';
const FALLBACK_FROM = 'Northbound Studio <quotes@northbound-dev.com>';

const LIMITS = {
  name: 120,
  business: 160,
  email: 200,
  phone: 40,
  message: 5000,
  term: 40,
} as const;

/* The only plan changes this page offers, and what each costs. Prices live
   here, never in the posted form: account.html shows them, this decides
   them. They mirror api/checkout.ts's table — if one moves, move both. */
const PLANS = {
  want_care: { label: 'Changes and support', price: '$49/mo' },
  want_bearing: { label: 'Bearing (founding)', price: '$300/mo' },
  want_cancel: { label: 'Drop a plan', price: 'no charge' },
} as const;

const TERMS: Record<string, string> = {
  bearing_12: '12-month commitment — $300/mo for all twelve months',
  bearing_mtm: 'month-to-month — $300 the first month, then $600/mo after',
};

type Field = keyof typeof LIMITS;
type Request_ = Record<Field, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function read(form: FormData, key: Field): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, LIMITS[key]) : '';
}

function chosen(form: FormData): string[] {
  return (Object.keys(PLANS) as (keyof typeof PLANS)[])
    .filter((k) => form.get(k) === '1')
    .map((k) => `${PLANS[k].label} (${PLANS[k].price})`);
}

function problem(r: Request_, picks: string[]): string | null {
  if (!r.name) return 'Please tell us your name.';
  if (!r.business) return 'Please tell us the business name.';
  if (!EMAIL_RE.test(r.email)) return 'Please check your email address.';
  if (r.phone.replace(/\D/g, '').length < 7) return 'Please leave a phone number we can call.';
  if (!picks.length && !r.message) return 'Tick what you want to change, or tell us in the box.';
  if (r.term && !(r.term in TERMS)) return 'That Bearing term is not one we offer.';
  return null;
}

async function send(key: string, email: Record<string, unknown>) {
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && data.id) return { ok: true as const, id: data.id };
    return { ok: false as const, error: `${res.status} ${data.message ?? 'no message'}` };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

function notification(r: Request_, picks: string[]): string {
  return [
    `Name:      ${r.name}`,
    `Business:  ${r.business}`,
    `Email:     ${r.email}`,
    `Phone:     ${r.phone}`,
    '',
    `Wants:     ${picks.length ? picks.join(', ') : '(nothing ticked — see message)'}`,
    r.term ? `Term:      ${TERMS[r.term]}` : '',
    '',
    'Message:',
    r.message || '—',
  ].filter(Boolean).join('\n');
}

function confirmation(r: Request_, picks: string[]): string {
  const first = r.name.split(/\s+/)[0];
  return [
    `Hi ${first},`,
    '',
    'We have your request:',
    picks.length ? picks.map((p) => `  · ${p}`).join('\n') : '  · (see your note below)',
    r.term ? `  · ${TERMS[r.term]}` : '',
    r.message ? `\nYou wrote:\n${r.message}` : '',
    '',
    "Nothing has been charged. If the change costs anything we'll email a secure payment link first, and it only starts once you pay it. If you asked to drop a plan, we'll confirm the date it stops.",
    '',
    'Your site stays live either way.',
    '',
    `If it can't wait, call ${PHONE}.`,
    '',
    'Northbound Studio',
    'Grand Ledge, Michigan',
  ].filter(Boolean).join('\n');
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

function failurePage(message: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>That didn't send — Northbound Studio</title>
<style>body{margin:0;padding:48px 20px;background:#F4F8F6;color:#0E1512;font:18px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:34rem;margin:0 auto}a{color:#0E6F5C}</style></head>
<body><main><h1>That didn't send.</h1><p>${message}</p>
<p>Call or text <a href="tel:+14705738908">${PHONE}</a> and we'll sort it in a minute.</p>
<p><a href="/account.html">Back to your account</a></p></main></body></html>`;
  return new Response(html, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function done(request: Request): Response {
  return wantsJson(request)
    ? Response.json({ ok: true })
    : new Response(null, { status: 303, headers: { Location: '/account-received.html' } });
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

  const trap = form.get('nb_hp_7');
  if (typeof trap === 'string' && trap.trim() !== '') {
    console.warn('[account] honeypot hit; not delivered', { name: form.get('name'), email: form.get('email') });
    return done(request);
  }

  const r = Object.fromEntries(
    (Object.keys(LIMITS) as Field[]).map((k) => [k, read(form, k)]),
  ) as Request_;
  const picks = chosen(form);

  const bad = problem(r, picks);
  if (bad) return failed(request, 422, bad);

  const key = process.env.RESEND_API_KEY;
  const to = process.env.QUOTE_TO;
  const from = process.env.QUOTE_FROM || FALLBACK_FROM;
  if (!key || !to) {
    console.error('[account] RESEND_API_KEY or QUOTE_TO is not set; request not delivered', { email: r.email });
    return failed(request, 503, 'Our inbox is not connected right now.');
  }

  const studio = await send(key, {
    from,
    to: [to],
    reply_to: r.email,
    subject: `Account: ${picks[0] ?? 'change request'} — ${r.business}`.slice(0, 180),
    text: notification(r, picks),
  });
  if (!studio.ok) {
    console.error('[account] notification failed; request not delivered', studio.error, { email: r.email });
    return failed(request, 502, 'Something went wrong on our side.');
  }

  const courtesy = await send(key, {
    from,
    to: [r.email],
    reply_to: to,
    subject: 'We have your request — Northbound Studio',
    text: confirmation(r, picks),
  });
  if (!courtesy.ok) {
    console.error('[account] confirmation failed (request was delivered)', courtesy.error, { notification: studio.id });
  }

  return done(request);
}
