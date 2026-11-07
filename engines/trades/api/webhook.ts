/* api/webhook.ts — where Stripe reports a paid deposit.
 *
 * The booking only becomes real when Stripe says the deposit was paid, which
 * is this endpoint. It verifies the Stripe-Signature header with
 * STRIPE_WEBHOOK_SECRET (HMAC-SHA256, no SDK), and on
 * checkout.session.completed sends two emails: yours (the booking, marked
 * PAID) and the customer's confirmation. A bad signature emails nobody.
 *
 * Register it in the Stripe dashboard:
 *   https://<your-site>/api/webhook   event: checkout.session.completed
 *
 * Env: STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, NOTIFY_TO, FROM (optional).
 */
import config from '../engine.config.json' with { type: 'json' };
import { money, sender } from './book.js';

type Meta = Record<string, string>;
type Sent = { ok: true; id: string } | { ok: false; error: string };
const RESEND_URL = 'https://api.resend.com/emails';

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

/* Stripe's signature: header "t=...,v1=...", signed payload "t.raw-body". */
async function validSignature(secret: string, header: string, payload: string): Promise<boolean> {
  const fields: Record<string, string> = {};
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i !== -1) fields[part.slice(0, i)] = part.slice(i + 1);
  }
  const t = fields['t'] ?? '';
  const v1 = fields['v1'] ?? '';
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

function lines(md: Meta): string[] {
  return [
    `Name:     ${md.e_name ?? ''}`,
    `Phone:    ${md.e_phone ?? ''}`,
    md.e_email ? `Email:    ${md.e_email}` : '',
    `Address:  ${md.e_where ?? ''}`,
    `Job:      ${md.e_service ?? ''} (${md.e_label ?? ''})`,
    `When:     ${md.e_when ?? ''}`,
    md.e_notes ? `Notes:    ${md.e_notes}` : '',
  ].filter(Boolean);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO;
  if (!secret) { console.error('[webhook] STRIPE_WEBHOOK_SECRET not set'); return new Response('not configured', { status: 500 }); }

  const payload = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';
  if (!(await validSignature(secret, sig, payload))) {
    console.error('[webhook] bad signature');
    return new Response('bad signature', { status: 400 });
  }

  let event: { type?: string; data?: { object?: { id?: string; metadata?: Meta; amount_total?: number; payment_status?: string } } };
  try { event = JSON.parse(payload); } catch { return new Response('bad json', { status: 400 }); }
  if (event.type !== 'checkout.session.completed') return Response.json({ received: true, ignored: event.type });

  const s = event.data?.object ?? {};
  const md = s.metadata ?? {};
  const paid = typeof s.amount_total === 'number' ? s.amount_total : Number(md.e_due ?? '0');
  const total = Number(md.e_total ?? '0');
  const body = lines(md);

  if (!key || !to) { console.error('[webhook] RESEND_API_KEY or NOTIFY_TO not set; paid booking not emailed', { session: s.id }); return new Response('email not configured', { status: 500 }); }

  const owner = await send(key, {
    from: sender(), to: [to], reply_to: md.e_email || undefined,
    subject: `PAID booking: ${md.e_name ?? ''} — ${md.e_service ?? ''} (${money(paid)})`,
    text: ['Deposit paid via Stripe.', '', ...body, '', `Paid now:  ${money(paid)}`, total > paid ? `Balance:   ${money(total - paid)} when the job is done` : '', `Stripe:    ${s.id ?? ''}`].filter(Boolean).join('\n'),
  });
  if (!owner.ok) { console.error('[webhook] owner email failed', owner.error, { session: s.id }); return new Response('owner email failed', { status: 500 }); }

  if (md.e_email) {
    const customer = await send(key, {
      from: sender(), to: [md.e_email],
      subject: `Your visit is booked — ${config.business.name}`,
      text: [`Hi ${(md.e_name ?? '').split(' ')[0]},`, '', `Your spot is held. We have your ${money(paid)}${total > paid ? `; the balance of ${money(total - paid)} is due when we're done` : ''}.`, '', ...body, '', `We'll call ${md.e_phone ?? ''} to confirm the time.`, '', `${config.business.name} · ${config.business.phone}`].join('\n'),
    });
    if (!customer.ok) console.error('[webhook] customer email failed', customer.error, { session: s.id });
  }
  return Response.json({ received: true });
}
