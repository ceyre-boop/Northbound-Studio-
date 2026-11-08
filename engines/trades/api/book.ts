/* api/book.ts — where the booking lands.
 *
 * One route for both paths. With JavaScript, index.html posts JSON with a
 * service key; without it, the plain form posts fields with free text. Either
 * way the price is derived HERE, from engine.config.json, never from anything
 * the browser sent. A service with something due creates a Stripe Checkout
 * Session and the customer pays on Stripe's page (api/webhook.ts emails you
 * when they have). A service with nothing due, free text, or a Stripe that
 * is not set up becomes a visit request: you get the email now and confirm
 * by phone. Nothing a customer types can make a booking vanish.
 *
 * Env: STRIPE_SECRET_KEY (payments; without it every booking is a request),
 *      RESEND_API_KEY and NOTIFY_TO (the emails), FROM (optional, a sender on
 *      a domain verified in Resend; the default only delivers to the Resend
 *      account owner, which is fine for testing and wrong for customers).
 */
import config from '../engine.config.json' with { type: 'json' };

type Service = { key: string; name: string; label: string; due: number; total: number; note?: string };
type Booking = {
  service: string; property: string; address: string; urgency: string; day: string; window: string;
  name: string; phone: string; email: string; notes: string; issue: string;
};
type Priced = { service: Service | null; due: number; total: number; extra: number; label: string };
type Sent = { ok: true; id: string } | { ok: false; error: string };

const FIELDS: (keyof Booking)[] = ['service', 'property', 'address', 'urgency', 'day', 'window', 'name', 'phone', 'email', 'notes', 'issue'];
const LIMITS: Record<keyof Booking, number> = { service: 40, property: 40, address: 200, urgency: 20, day: 80, window: 40, name: 120, phone: 40, email: 200, notes: 500, issue: 1000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRIPE_URL = 'https://api.stripe.com/v1/checkout/sessions';
const RESEND_URL = 'https://api.resend.com/emails';

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/* The arithmetic, in one place: the service's own numbers, plus the
   after-hours fee when the visit is wanted today and something is due. */
export function priceFor(serviceKey: string, urgency: string): Priced {
  const service = (config.services as Service[]).find((s) => s.key === serviceKey) ?? null;
  if (!service) return { service: null, due: 0, total: 0, extra: 0, label: 'Visit request' };
  const extra = urgency === 'today' && service.due > 0 && config.afterHours ? config.afterHours.cents : 0;
  return { service, due: service.due + extra, total: service.total ? service.total + extra : 0, extra, label: service.label };
}

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '';
}

async function readBooking(request: Request): Promise<{ b: Booking; honeypot: boolean } | null> {
  const type = request.headers.get('content-type') ?? '';
  let raw: Record<string, unknown>;
  try {
    if (type.includes('application/json')) raw = (await request.json()) as Record<string, unknown>;
    else { const form = await request.formData(); raw = Object.fromEntries(form.entries()); }
  } catch { return null; }
  const b = {} as Booking;
  for (const f of FIELDS) b[f] = clean(raw[f], LIMITS[f]);
  return { b, honeypot: clean(raw.nb_hp, 10) !== '' };
}

function validate(b: Booking): string | null {
  if (!b.name) return 'Please tell us your name.';
  if (b.phone.replace(/\D/g, '').length < 7) return 'Please give us a phone number we can call.';
  if (b.email && !EMAIL_RE.test(b.email)) return 'Please check your email address.';
  return null;
}

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

function answer(request: Request, url: string, status = 303): Response {
  return wantsJson(request) ? Response.json({ ok: true, url }) : new Response(null, { status, headers: { Location: url } });
}

function refuse(request: Request, status: number, error: string): Response {
  return wantsJson(request)
    ? Response.json({ ok: false, error }, { status })
    : new Response(`<!doctype html><meta charset="utf-8"><title>Please try again</title><p style="font:16px system-ui;max-width:40em;margin:3em auto">${error} <a href="javascript:history.back()">Go back</a>.</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function describe(b: Booking, p: Priced): string[] {
  const urgency = (config.urgency as { key: string; label: string }[]).find((u) => u.key === b.urgency)?.label ?? b.urgency;
  return [
    `Name:     ${b.name}`,
    `Phone:    ${b.phone}`,
    b.email ? `Email:    ${b.email}` : '',
    `Address:  ${[b.property, b.address].filter(Boolean).join(' · ')}`,
    `Job:      ${p.service ? `${p.service.name} (${p.label})` : b.issue || 'not specified'}`,
    `When:     ${[urgency, b.day, b.window].filter(Boolean).join(' · ')}`,
    b.notes ? `Notes:    ${b.notes}` : '',
  ].filter(Boolean);
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

export function sender(): string {
  return process.env.FROM || `${config.business.name} <onboarding@resend.dev>`;
}

/* The request path: an email to you now, and one to them if they left an address. */
async function emailRequest(b: Booking, p: Priced, why: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO;
  if (!key || !to) { console.error('[book] RESEND_API_KEY or NOTIFY_TO not set; request not delivered', { name: b.name, phone: b.phone }); return; }
  const lines = describe(b, p);
  const owner = await send(key, {
    from: sender(), to: [to], reply_to: b.email || undefined,
    subject: `Visit request: ${b.name} — ${p.service ? p.service.name : 'see below'}`,
    text: [`${why}`, '', ...lines, '', 'Confirm the time by phone.'].join('\n'),
  });
  if (!owner.ok) console.error('[book] owner email failed', owner.error, { name: b.name, phone: b.phone });
  if (b.email) {
    const customer = await send(key, {
      from: sender(), to: [b.email],
      subject: `We got your request — ${config.business.name}`,
      text: [`Hi ${b.name.split(' ')[0]},`, '', `Thanks. We have your request and we'll call ${b.phone} to confirm the time.`, '', ...lines, '', `${config.business.name} · ${config.business.phone}`].join('\n'),
    });
    if (!customer.ok) console.error('[book] customer email failed', customer.error);
  }
}

function stripeForm(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function createSession(key: string, b: Booking, p: Priced, origin: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const params: Record<string, string> = {
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(p.due),
    'line_items[0][price_data][product_data][name]': `${config.business.name} — ${p.label}`.slice(0, 200),
    'line_items[0][quantity]': '1',
    success_url: `${origin}/booked.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
    'payment_intent_data[description]': `${p.label} — ${b.name}`.slice(0, 200),
    'metadata[e_service]': p.service ? p.service.name : '',
    'metadata[e_label]': p.label,
    'metadata[e_name]': b.name,
    'metadata[e_phone]': b.phone,
    'metadata[e_email]': b.email,
    'metadata[e_where]': [b.property, b.address].filter(Boolean).join(' · ').slice(0, 500),
    'metadata[e_when]': [b.urgency, b.day, b.window].filter(Boolean).join(' · ').slice(0, 500),
    'metadata[e_notes]': b.notes.slice(0, 500),
    'metadata[e_due]': String(p.due),
    'metadata[e_total]': String(p.total),
  };
  if (b.email) params.customer_email = b.email;
  try {
    const res = await fetch(STRIPE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: stripeForm(params),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
    if (res.ok && data.url) return { ok: true, url: data.url };
    return { ok: false, error: data.error?.message ?? `Stripe answered ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function POST(request: Request): Promise<Response> {
  const read = await readBooking(request);
  if (!read) return refuse(request, 400, 'The form arrived empty.');
  const { b, honeypot } = read;
  const origin = new URL(request.url).origin;
  if (honeypot) return answer(request, `${origin}/requested.html`); // a bot filled the hidden field: say yes, do nothing
  const bad = validate(b);
  if (bad) return refuse(request, 422, bad);

  const p = priceFor(b.service, b.urgency);
  const key = process.env.STRIPE_SECRET_KEY;

  if (p.due > 0 && key) {
    const session = await createSession(key, b, p, origin);
    if (session.ok) {
      console.log('[book] stripe session created', { name: b.name, service: b.service, due: p.due });
      return answer(request, session.url);
    }
    console.error('[book] stripe refused; keeping the booking as a request', session.error, { name: b.name });
    await emailRequest(b, p, `PAYMENT DID NOT START (${session.error}). Take the ${money(p.due)} by phone.`);
    return answer(request, `${origin}/requested.html?pay=later`);
  }

  await emailRequest(b, p, p.due > 0 ? `Stripe is not set up yet, so this ${money(p.due)} booking came through as a request. Take payment by phone.` : 'New visit request.');
  return answer(request, `${origin}/requested.html`);
}
