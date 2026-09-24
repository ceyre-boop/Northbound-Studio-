/* api/stripe-webhook.ts — where Stripe reports a completed payment.
 *
 * Checkout Sessions are created in api/checkout.ts, which redirects the
 * visitor to Stripe's hosted page. Nothing is emailed there: the order only
 * becomes real when Stripe tells us the deposit was paid, which is this
 * endpoint. It verifies the Stripe-Signature header with
 * STRIPE_WEBHOOK_SECRET (WebCrypto HMAC-SHA256, no SDK — the project ships
 * with no install step), and on checkout.session.completed sends the two
 * Resend emails: the studio notification (the order, marked PAID) and the
 * customer confirmation (the deposit is paid, the build starts). Anything
 * else — wrong signature, unknown event, email failure — is logged and
 * answered honestly, so Stripe retries what it should and ignores the rest.
 *
 * Register the endpoint in the Stripe dashboard (or via the API):
 *   https://northbound-dev.com/api/stripe-webhook
 *   events: checkout.session.completed
 *
 * Env: STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, QUOTE_TO, QUOTE_FROM (optional).
 */

const PHONE = '470-573-8908';
const RESEND_URL = 'https://api.resend.com/emails';
const FALLBACK_FROM = 'Northbound Studio <quotes@northbound-dev.com>';

type Sent = { ok: true; id: string } | { ok: false; error: string };
type Meta = Record<string, string>;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
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
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // no replays older than five minutes
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

function notification(md: Meta, sessionId: string): string {
  const lines = [
    `Name:      ${md.nb_name ?? ''}`,
    `Business:  ${md.nb_business ?? ''}`,
    `Phone:     ${md.nb_phone ?? ''}`,
    `Email:     ${md.nb_email ?? ''}`,
    '',
    'Order (PAID via Stripe):',
    `  ${md.nb_item ?? ''}`,
  ];
  if (md.nb_monthly) {
    for (const m of md.nb_monthly.split(' | ')) lines.push(`  ${m}`);
  }
  lines.push('', `Deposit paid: ${money(Number(md.nb_due ?? '0'))}`);
  const balance = Number(md.nb_balance ?? '0');
  if (balance) lines.push(`On delivery: ${money(balance)} (the balance — collect before handoff)`);
  if (md.nb_spec) lines.push('', 'Their build:', ...md.nb_spec.split(' | ').map((l) => `  ${l}`));
  if (md.nb_founding === '1') {
    lines.push(
      '',
      md.nb_review
        ? `Founding client — review posted under "${md.nb_review}". Look it up on Google before finalising; nothing has checked it.`
        : 'Founding client — but no review name came through. Check this one by hand before finalising.',
    );
  }
  lines.push('', `Stripe session: ${sessionId}`);
  return lines.join('\n');
}

function confirmation(md: Meta): string {
  const first = (md.nb_name ?? '').split(/\s+/)[0] || 'there';
  const due = money(Number(md.nb_due ?? '0'));
  const balance = Number(md.nb_balance ?? '0');
  const lines = [
    `Hi ${first},`,
    '',
    `Your deposit of ${due} is paid — thank you. Your order:`,
    `  ${md.nb_item ?? ''}`,
  ];
  if (md.nb_monthly) {
    for (const m of md.nb_monthly.split(' | ')) lines.push(`  ${m}`);
  }
  if (balance) lines.push('', `The remaining ${money(balance)} is due on delivery.`);
  if (md.nb_founding === '1') {
    lines.push(
      '',
      md.nb_review
        ? `You're taking founding pricing, and you told us your Google review is posted under "${md.nb_review}". We look that up ourselves before finalising — there's nothing automatic about it.`
        : "You're taking founding pricing as one of our early clients. We'll be in touch about your Google review before finalising.",
    );
  }
  lines.push(
    '',
    "The build starts now — we'll be in touch to kick things off.",
    '',
    `If it can't wait, call ${PHONE}.`,
    '',
    'Northbound Studio',
    'Grand Ledge, Michigan',
  );
  return lines.join('\n');
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return Response.json({ ok: false }, { status: 503 });
  }
  const payload = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';
  if (!(await validSignature(secret, sig, payload))) {
    console.error('[stripe-webhook] bad signature; ignored');
    return Response.json({ ok: false }, { status: 400 });
  }
  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (event.type !== 'checkout.session.completed') {
    return Response.json({ ok: true, ignored: event.type ?? 'unknown' });
  }
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const md = (obj.metadata ?? {}) as Meta;
  const sessionId = typeof obj.id === 'string' ? obj.id : '';
  const paid = Number(obj.amount_total ?? 0);
  if (md.nb_due && String(paid) !== md.nb_due) {
    console.error('[stripe-webhook] amount mismatch', { expected: md.nb_due, paid, session: sessionId });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.QUOTE_TO;
  const from = process.env.QUOTE_FROM || FALLBACK_FROM;
  if (!resendKey || !to) {
    console.error('[stripe-webhook] RESEND_API_KEY or QUOTE_TO is not set; paid order not emailed', { session: sessionId, email: md.nb_email });
    return Response.json({ ok: false }, { status: 503 });
  }

  const studio = await send(resendKey, {
    from,
    to: [to],
    reply_to: md.nb_email,
    subject: `Paid order: ${md.nb_item ?? 'Northbound'} — ${md.nb_business ?? ''}`.slice(0, 180),
    text: notification(md, sessionId),
  });
  if (!studio.ok) {
    /* Non-2xx makes Stripe retry the event; a retry after the emails went
       out could double-send, but a lost paid order is worse than a
       duplicate. */
    console.error('[stripe-webhook] studio notification failed; Stripe will retry', studio.error, { session: sessionId });
    return Response.json({ ok: false }, { status: 502 });
  }
  if (md.nb_email) {
    const customer = await send(resendKey, {
      from,
      to: [md.nb_email],
      reply_to: to,
      subject: 'Your deposit is paid — Northbound Studio',
      text: confirmation(md),
    });
    if (customer.ok) {
      console.log('[stripe-webhook] paid order emailed', { notification: studio.id, confirmation: customer.id, session: sessionId });
    } else {
      console.error('[stripe-webhook] customer confirmation failed (studio was notified)', customer.error, { session: sessionId });
    }
  }
  return Response.json({ ok: true });
}
