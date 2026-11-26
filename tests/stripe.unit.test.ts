/* tests/stripe.unit.test.ts — the Stripe path, end to end without Stripe.
 *
 * bun:test. global.fetch is mocked, so no session is created and no email is
 * sent; each test inspects the requests that would have gone out.
 *
 * What these pin:
 *   - the Checkout Session is created for the deposit computed from
 *     data/price.json (setup x deposit_ratio), never for a posted amount;
 *   - the session's metadata records the week and the setup price, which is
 *     the pricing engine's quote log, and a [quote-log] line is written when
 *     the session is created and again when it is paid;
 *   - the webhook verifies Stripe's signature and writes its emails from the
 *     metadata, so a client quoted last week's price is confirmed at last
 *     week's price even after data/price.json has moved.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { resetLimits } from '../lib/guard.ts';
import { createHmac } from 'node:crypto';
import { POST as checkoutPOST } from '../api/checkout.ts';
import { POST as webhookPOST } from '../api/stripe-webhook.ts';
import { offer, money } from '../lib/price.ts';

const P = offer();
const SECRET = 'whsec_test_secret';

type Call = { url: string; headers: Record<string, string>; body: string };
let calls: Call[] = [];
let stripeAnswer: () => Response;
let logs: string[] = [];
let logSpy: ReturnType<typeof spyOn>;
let errSpy: ReturnType<typeof spyOn>;

function order(over: Record<string, string> = {}): Request {
  const form = new FormData();
  const fields = { buy: 'site', name: 'Jamie Rivera', business: 'Rivera Roofing', phone: '5551234567', email: 'jamie@example.com', ...over };
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request('http://localhost/api/checkout', { method: 'POST', body: form, headers: { accept: 'application/json', referer: 'https://northbound-dev.com/checkout.html' } });
}

const stripeParams = () => Object.fromEntries(new URLSearchParams(calls.find((c) => c.url.includes('stripe.com'))!.body));
const emails = () => calls.filter((c) => c.url.includes('resend.com')).map((c) => JSON.parse(c.body) as { to: string[]; subject: string; text: string });
const quoteLogs = () => logs.filter((l) => l.startsWith('[quote-log] ')).map((l) => JSON.parse(l.slice('[quote-log] '.length)));

beforeEach(() => {
  resetLimits();
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.QUOTE_TO = 'studio@example.com';
  calls = [];
  logs = [];
  stripeAnswer = () => Response.json({ id: 'cs_test_abc123', url: 'https://checkout.stripe.com/c/pay/cs_test_abc123' });
  logSpy = spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
  errSpy = spyOn(console, 'error').mockImplementation(() => {});
  // @ts-expect-error — test double, not the real fetch signature
  global.fetch = mock(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url: String(url), headers: init.headers, body: init.body });
    return String(url).includes('stripe.com') ? stripeAnswer() : Response.json({ id: `email_${calls.length}` });
  });
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'QUOTE_TO']) delete process.env[k];
});

describe('creating the Checkout Session', () => {
  test('charges the deposit from data/price.json and sends the visitor to Stripe', async () => {
    const res = await checkoutPOST(order());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_abc123' });
    const p = stripeParams();
    expect(p.mode).toBe('payment');
    expect(p['line_items[0][price_data][currency]']).toBe('usd');
    expect(p['line_items[0][price_data][unit_amount]']).toBe(String(P.depositCents));
    expect(p['line_items[0][price_data][product_data][name]']).toBe('Northbound Studio — The Northbound Site (deposit)');
    expect(p['line_items[0][quantity]']).toBe('1');
    expect(p.customer_email).toBe('jamie@example.com');
    expect(p.allow_promotion_codes).toBe('true');
    expect(p.success_url).toBe('https://northbound-dev.com/order-paid.html?session_id={CHECKOUT_SESSION_ID}');
    expect(p.cancel_url).toBe('https://northbound-dev.com/checkout.html');
    expect(calls[0].headers.Authorization).toBe('Bearer sk_test_unit');
    // No email until the money has arrived.
    expect(emails()).toHaveLength(0);
  });

  test('the metadata is the quote record: week, setup price, deposit, balance, care', async () => {
    await checkoutPOST(order());
    const p = stripeParams();
    expect(p['metadata[nb_week]']).toBe(P.week);
    expect(p['metadata[nb_setup]']).toBe(String(P.setupCents));
    expect(p['metadata[nb_due]']).toBe(String(P.depositCents));
    expect(p['metadata[nb_balance]']).toBe(String(P.balanceCents));
    expect(p['metadata[nb_care]']).toBe(String(P.careCents));
    expect(Number(p['metadata[nb_due]']) + Number(p['metadata[nb_balance]'])).toBe(P.setupCents);
    expect(p['metadata[nb_item]']).toBe(`The Northbound Site — ${money(P.setupCents)}`);
    expect(p['metadata[nb_monthly]']).toBe(`Care plan — ${money(P.careCents)}/mo, starting the day the site goes live`);
    expect(p['metadata[nb_business]']).toBe('Rivera Roofing');
    expect(Object.keys(p).some((k) => /founding|review/.test(k))).toBe(false);
  });

  test('a posted amount is never the amount charged', async () => {
    await checkoutPOST(order({ amount: '1', unit_amount: '100', setup: '1', deposit: '1', nb_due: '100', 'line_items[0][price_data][unit_amount]': '100' }));
    expect(stripeParams()['line_items[0][price_data][unit_amount]']).toBe(String(P.depositCents));
  });

  test('a quote_created line is logged with the week, the price and the session', async () => {
    await checkoutPOST(order());
    const [q] = quoteLogs();
    expect(q).toMatchObject({ event: 'quote_created', week: P.week, setup: P.setupCents / 100, session: 'cs_test_abc123', outcome: 'open', business: 'Rivera Roofing' });
    expect(q.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('a native post is redirected to Stripe', async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ buy: 'site', name: 'Jamie Rivera', business: 'Rivera Roofing', phone: '5551234567', email: 'jamie@example.com' })) form.set(k, v);
    const res = await checkoutPOST(new Request('http://localhost/api/checkout', { method: 'POST', body: form }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://checkout.stripe.com/c/pay/cs_test_abc123');
  });

  test('an emoji cut at the metadata limit does not break the request', async () => {
    const res = await checkoutPOST(order({ why_not: 'a'.repeat(499) + '🙂🙂' }));
    expect(res.status).toBe(200);
    expect(Array.from(stripeParams()['metadata[nb_why_not]']).length).toBe(500);
  });

  test('when Stripe refuses, the order falls back to the email capture and no quote is logged', async () => {
    stripeAnswer = () => Response.json({ error: { message: 'Invalid API Key' } }, { status: 401 });
    const res = await checkoutPOST(order());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(emails()).toHaveLength(2);
    expect(emails()[1].text).toContain('Nothing has been charged yet.');
    expect(quoteLogs()).toHaveLength(0);
  });

  test('half-configured Stripe is treated as none', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await checkoutPOST(order());
    expect(calls.some((c) => c.url.includes('stripe.com'))).toBe(false);
    expect(emails()).toHaveLength(2);
  });
});

function signed(payload: string, opts: { secret?: string; at?: number } = {}): Request {
  const t = opts.at ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', opts.secret ?? SECRET).update(`${t}.${payload}`).digest('hex');
  return new Request('http://localhost/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${v1}` } });
}

function completed(metadata: Record<string, string>, amount: number): string {
  return JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_abc123', amount_total: amount, metadata } } });
}

const META = {
  nb_name: 'Jamie Rivera', nb_business: 'Rivera Roofing', nb_phone: '5551234567', nb_email: 'jamie@example.com',
  nb_item: 'The Northbound Site — $750.00', nb_due: '37500', nb_balance: '37500',
  nb_monthly: 'Care plan — $49.00/mo, starting the day the site goes live',
  nb_week: '2026-W40', nb_setup: '75000', nb_care: '4900',
};

describe('the webhook', () => {
  test('a paid session sends both emails, with the amounts the session was quoted at', async () => {
    // Deliberately not this week's price: the metadata is what was promised.
    const res = await webhookPOST(signed(completed(META, 37500)));
    expect(res.status).toBe(200);
    const [studio, customer] = emails();
    expect(studio.to).toEqual(['studio@example.com']);
    expect(studio.subject).toBe('Paid order: The Northbound Site — $750.00 — Rivera Roofing');
    expect(studio.text).toContain('Order (PAID via Stripe):');
    expect(studio.text).toContain('Deposit paid: $375.00');
    expect(studio.text).toContain('At launch: $375.00 (the balance)');
    expect(studio.text).toContain('Price week: 2026-W40');
    expect(studio.text).toContain('Stripe session: cs_test_abc123');
    expect(customer.to).toEqual(['jamie@example.com']);
    expect(customer.text).toContain('Your deposit of $375.00 is paid');
    expect(customer.text).toContain('The remaining $375.00 is due at launch.');
    expect(customer.text).toContain('Care plan — $49.00/mo, starting the day the site goes live');
    expect(customer.text).toContain('The 7-day clock starts the moment we have all of it.');
    for (const e of emails()) expect(e.text).not.toMatch(/founding|Bearing|Beacon|Google review/i);
  });

  test('a quote_paid line is logged against the quoted week and price', async () => {
    await webhookPOST(signed(completed(META, 37500)));
    expect(quoteLogs()).toEqual([expect.objectContaining({ event: 'quote_paid', week: '2026-W40', setup: 750, session: 'cs_test_abc123', outcome: 'yes', business: 'Rivera Roofing' })]);
  });

  test('a paid amount that differs from the quoted deposit is flagged', async () => {
    await webhookPOST(signed(completed(META, 100)));
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('amount mismatch'))).toBe(true);
  });

  test('a wrong signature, a stale one, and a missing one are all refused', async () => {
    const payload = completed(META, 37500);
    expect((await webhookPOST(signed(payload, { secret: 'whsec_wrong' }))).status).toBe(400);
    expect((await webhookPOST(signed(payload, { at: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(400);
    expect((await webhookPOST(new Request('http://localhost/api/stripe-webhook', { method: 'POST', body: payload }))).status).toBe(400);
    expect(emails()).toHaveLength(0);
    expect(quoteLogs()).toHaveLength(0);
  });

  test('other events are acknowledged and ignored', async () => {
    const res = await webhookPOST(signed(JSON.stringify({ type: 'payment_intent.created', data: { object: {} } })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: 'payment_intent.created' });
    expect(emails()).toHaveLength(0);
  });

  test('if the studio email fails, Stripe is asked to retry', async () => {
    // @ts-expect-error — test double
    global.fetch = mock(async () => Response.json({ message: 'down' }, { status: 500 }));
    expect((await webhookPOST(signed(completed(META, 37500)))).status).toBe(502);
  });

  test('without the webhook secret nothing is trusted', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await webhookPOST(signed(completed(META, 37500)))).status).toBe(503);
  });
});

describe('checkout to webhook, joined up', () => {
  test('the metadata checkout writes is exactly what the webhook reads back', async () => {
    await checkoutPOST(order());
    const p = stripeParams();
    const metadata = Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v]));
    calls = [];
    const res = await webhookPOST(signed(completed(metadata, P.depositCents)));
    expect(res.status).toBe(200);
    const [, customer] = emails();
    expect(customer.text).toContain(`Your deposit of ${money(P.depositCents)} is paid`);
    expect(customer.text).toContain(`The remaining ${money(P.balanceCents)} is due at launch.`);
    expect(quoteLogs().map((q) => q.event)).toEqual(['quote_created', 'quote_paid']);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('amount mismatch'))).toBe(false);
  });
});
