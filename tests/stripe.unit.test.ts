/* tests/stripe.unit.test.ts — the Stripe half, unit-tested directly.
 *
 * Companion to tests/checkout.unit.test.ts, same shape: bun:test, no server,
 * no browser, global.fetch mocked so neither Stripe nor Resend is really
 * called. Two things are proved here, and both are about money:
 *
 *   1. api/checkout.ts routes to Stripe only when BOTH keys are set, sends
 *      the deposit Stripe should collect (never a price from the form), and
 *      falls back to email capture — order intact — if Stripe refuses.
 *   2. api/stripe-webhook.ts believes only Stripe. A forged or replayed
 *      signature emails nobody; a genuine checkout.session.completed emails
 *      the studio and the customer with the amount that was actually paid.
 *
 * The signature here is built the way Stripe builds it (HMAC-SHA256 over
 * "t.payload"), so these tests exercise the real verification path rather
 * than a bypass. Run: bun test tests/stripe.unit.test.ts
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { POST as checkoutPOST } from '../api/checkout.ts';
import { POST as webhookPOST } from '../api/stripe-webhook.ts';
import { GOOGLE_REVIEW_URL } from '../api/checkout.ts';

const SECRET = 'whsec_test_secret';
const STRIPE_URL = 'https://stripe.example/session';

/* ---------- the shared fetch double ---------- */

type Call = { url: string; body: string };
let calls: Call[] = [];
let emails: Record<string, unknown>[] = [];
let stripeRefuses = false;

function isStripe(url: string): boolean {
  return url.includes('stripe.com');
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.QUOTE_TO = 'studio@example.com';
  calls = [];
  emails = [];
  stripeRefuses = false;
  // @ts-expect-error — test double, not the real fetch signature
  global.fetch = mock(async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    if (isStripe(url)) {
      if (stripeRefuses) {
        return { ok: false, status: 402, json: async () => ({ error: { message: 'card_declined' } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ id: 'cs_test_1', url: STRIPE_URL }) } as Response;
    }
    emails.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ id: `email_${emails.length}` }) } as Response;
  });
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.QUOTE_TO;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

/* ---------- checkout: the road to Stripe ---------- */

function order(fields: Record<string, string>): Promise<Response> {
  const form = new FormData();
  const base = {
    name: 'Jamie Rivera',
    business: 'Rivera Roofing',
    phone: '5551234567',
    email: 'jamie@example.com',
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) form.set(k, v);
  return checkoutPOST(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      body: form,
      headers: { accept: 'application/json' },
    }),
  );
}

function stripeCall(): Record<string, string> {
  const call = calls.find((c) => isStripe(c.url));
  if (!call) throw new Error('nothing was sent to Stripe');
  return Object.fromEntries(new URLSearchParams(call.body));
}

describe('checkout routes to Stripe only when it can be honoured end to end', () => {
  test('with neither key set, nothing reaches Stripe and the order is emailed', async () => {
    const res = await order({ buy: 'clean' });
    expect(res.status).toBe(200);
    expect(calls.some((c) => isStripe(c.url))).toBe(false);
    expect(emails.length).toBe(2);
  });

  test('with only the secret key set, still no Stripe — an unverifiable payment is worse than none', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const res = await order({ buy: 'clean' });
    expect(res.status).toBe(200);
    expect(calls.some((c) => isStripe(c.url))).toBe(false);
    expect(emails.length).toBe(2);
  });

  test('with both keys set, the visitor is sent to Stripe and no order email is sent yet', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const res = await order({ buy: 'clean' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: STRIPE_URL });
    expect(emails.length).toBe(0);
  });

  test('Cheap and Clean charges $600.00, from the server table', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await order({ buy: 'clean' });
    const sent = stripeCall();
    expect(sent['line_items[0][price_data][unit_amount]']).toBe('60000');
    expect(sent['metadata[nb_due]']).toBe('60000');
    expect(sent.mode).toBe('payment');
  });

  test('a price posted in the form cannot change what Stripe collects', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await order({ buy: 'clean', cents: '1', unit_amount: '1', price: '1' });
    expect(stripeCall()['line_items[0][price_data][unit_amount]']).toBe('60000');
  });

  test('Beacon collects the 50% founding deposit and records the balance', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await order({ buy: 'beacon', review_name: 'Jamie R.' });
    const sent = stripeCall();
    expect(sent['line_items[0][price_data][unit_amount]']).toBe('87500');
    expect(sent['metadata[nb_balance]']).toBe('87500');
    expect(sent['metadata[nb_founding]']).toBe('1');
    expect(sent['metadata[nb_review]']).toBe('Jamie R.');
  });

  test('the order survives Stripe refusing: it falls back to email capture', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    stripeRefuses = true;
    const res = await order({ buy: 'clean' });
    expect(res.status).toBe(200);
    expect(emails.length).toBe(2);
    expect(emails[0].text as string).toContain('Due today: $600.00');
  });

  test('everything the webhook will need is carried in metadata', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await order({ buy: 'clean', bearing: '1', bearing_term: '12', review_name: 'Jamie R.' });
    const sent = stripeCall();
    expect(sent['metadata[nb_name]']).toBe('Jamie Rivera');
    expect(sent['metadata[nb_business]']).toBe('Rivera Roofing');
    expect(sent['metadata[nb_email]']).toBe('jamie@example.com');
    expect(sent['metadata[nb_phone]']).toBe('5551234567');
    expect(sent['metadata[nb_monthly]']).toContain('$300.00/mo');
    expect(sent.customer_email).toBe('jamie@example.com');
    expect(sent.success_url).toContain('/order-paid.html');
  });

  test('a founding order is gated on the review only while there is a profile to review', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const res = await order({ buy: 'beacon' }); // no review_name
    if (GOOGLE_REVIEW_URL === '') {
      expect(res.status).toBe(200);           // nothing to ask for, so nothing is withheld
      expect(stripeCall()['metadata[nb_founding]']).toBe('1');
    } else {
      expect(res.status).toBe(422);
      expect(calls.length).toBe(0);
    }
  });
});

/* ---------- the webhook: believe only Stripe ---------- */

async function sign(payload: string, opts: { secret?: string; t?: number } = {}): Promise<string> {
  const secret = opts.secret ?? SECRET;
  const t = opts.t ?? Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${hex}`;
}

function completed(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_9',
        amount_total: 87500,
        metadata: {
          nb_name: 'Jamie Rivera',
          nb_business: 'Rivera Roofing',
          nb_phone: '5551234567',
          nb_email: 'jamie@example.com',
          nb_item: 'Beacon — 50% deposit (founding price $1,750, standard $3,500) — $875.00',
          nb_due: '87500',
          nb_balance: '87500',
          nb_monthly: '',
          nb_founding: '1',
          nb_review: 'Jamie R.',
          nb_spec: '',
        },
        ...overrides,
      },
    },
  });
}

function hook(payload: string, signature: string): Promise<Response> {
  return webhookPOST(
    new Request('http://localhost/api/stripe-webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    }),
  );
}

describe('the webhook believes only Stripe', () => {
  test('no signing secret configured: 503, and nobody is emailed', async () => {
    const payload = completed();
    const res = await hook(payload, await sign(payload));
    expect(res.status).toBe(503);
    expect(emails.length).toBe(0);
  });

  test('a forged signature is refused', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = completed();
    const res = await hook(payload, await sign(payload, { secret: 'whsec_wrong' }));
    expect(res.status).toBe(400);
    expect(emails.length).toBe(0);
  });

  test('a missing signature header is refused', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const res = await hook(completed(), '');
    expect(res.status).toBe(400);
    expect(emails.length).toBe(0);
  });

  test('a replay older than five minutes is refused', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = completed();
    const stale = Math.floor(Date.now() / 1000) - 600;
    const res = await hook(payload, await sign(payload, { t: stale }));
    expect(res.status).toBe(400);
    expect(emails.length).toBe(0);
  });

  test('a body altered after signing is refused', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = completed();
    const signature = await sign(payload);
    const tampered = payload.replace('"amount_total":87500', '"amount_total":1');
    const res = await hook(tampered, signature);
    expect(res.status).toBe(400);
    expect(emails.length).toBe(0);
  });

  test('an event we do not handle is acknowledged and ignored', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = JSON.stringify({ type: 'payment_intent.created', data: { object: {} } });
    const res = await hook(payload, await sign(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: 'payment_intent.created' });
    expect(emails.length).toBe(0);
  });

  test('a genuine paid deposit emails the studio and the customer', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = completed();
    const res = await hook(payload, await sign(payload));
    expect(res.status).toBe(200);
    expect(emails.length).toBe(2);

    const studio = emails[0];
    expect(studio.to).toEqual(['studio@example.com']);
    expect(studio.subject as string).toContain('Paid order');
    const notif = studio.text as string;
    expect(notif).toContain('Order (PAID via Stripe)');
    expect(notif).toContain('Deposit paid: $875.00');
    expect(notif).toContain('On delivery: $875.00');
    expect(notif).toContain('cs_test_9');
    expect(notif).toContain('Founding client — review posted under "Jamie R."');
    expect(notif).toContain('nothing has checked it');

    const customer = emails[1];
    expect(customer.to).toEqual(['jamie@example.com']);
    const conf = customer.text as string;
    expect(conf).toContain('Your deposit of $875.00 is paid');
    expect(conf).toContain('The remaining $875.00 is due on delivery');
    expect(conf).toContain('your Google review is posted under "Jamie R."');
    expect(conf).toContain('nothing automatic about it');
    expect(conf).not.toMatch(/isn't yet|nothing to review today/);
  });

  test('a paid-in-full order mentions no balance', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_clean',
          amount_total: 60000,
          metadata: {
            nb_name: 'Sam Doyle',
            nb_business: 'Doyle Electric',
            nb_email: 'sam@example.com',
            nb_item: 'Cheap and Clean — $600.00',
            nb_due: '60000',
            nb_balance: '0',
            nb_founding: '0',
          },
        },
      },
    });
    const res = await hook(payload, await sign(payload));
    expect(res.status).toBe(200);
    const notif = emails[0].text as string;
    expect(notif).toContain('Deposit paid: $600.00');
    expect(notif).not.toContain('On delivery');
    expect(emails[1].text as string).not.toContain('due on delivery');
  });

  test('a paid order with no studio inbox configured is not swallowed', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    delete process.env.QUOTE_TO;
    const payload = completed();
    const res = await hook(payload, await sign(payload));
    expect(res.status).toBe(503); // non-2xx: Stripe retries rather than losing it
    expect(emails.length).toBe(0);
  });

  test('if the studio notification fails, Stripe is told to retry', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    // @ts-expect-error — test double
    global.fetch = mock(async () => ({ ok: false, status: 500, json: async () => ({ message: 'down' }) }) as Response);
    const payload = completed();
    const res = await hook(payload, await sign(payload));
    expect(res.status).toBe(502);
  });

  test('the guided-build spec reaches the studio with the paid order', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_spec',
          amount_total: 60000,
          metadata: {
            nb_name: 'Sam Doyle',
            nb_business: 'Doyle Electric',
            nb_email: 'sam@example.com',
            nb_item: 'Cheap and Clean — $600.00',
            nb_due: '60000',
            nb_balance: '0',
            nb_founding: '0',
            nb_spec: 'Trade: electrician | Wants: booked jobs | Look: clean',
          },
        },
      },
    });
    await hook(payload, await sign(payload));
    const notif = emails[0].text as string;
    expect(notif).toContain('Their build:');
    expect(notif).toContain('Trade: electrician');
    expect(notif).toContain('Look: clean');
  });
});
