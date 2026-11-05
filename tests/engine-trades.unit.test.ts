/* tests/engine-trades.unit.test.ts — the booking engine's money path, unit-tested.
 *
 * bun:test, no server, no browser; global.fetch is mocked so neither Stripe
 * nor Resend is called. Proves the things that are about money:
 *   1. the price comes from engine.config.json, never from the request;
 *   2. something due + a Stripe key = a Checkout Session for exactly that
 *      amount; nothing due, or no key, or Stripe refusing = a request email,
 *      booking intact;
 *   3. the webhook believes only Stripe: a forged signature emails nobody,
 *      a genuine completed session emails the owner and the customer.
 * Run: bun test tests/engine-trades.unit.test.ts
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import config from '../engines/trades/engine.config.json';
import { POST as book, priceFor } from '../engines/trades/api/book.ts';
import { POST as webhook } from '../engines/trades/api/webhook.ts';

type Call = { url: string; body: string };
let calls: Call[] = [];
let stripeRefuses = false;
const STRIPE_PAGE = 'https://checkout.stripe.example/cs_test_1';
const SECRET = 'whsec_engine_test';

const stripeCalls = () => calls.filter((c) => c.url.includes('stripe.com'));
const emails = () => calls.filter((c) => c.url.includes('resend.com')).map((c) => JSON.parse(c.body) as Record<string, string>);

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test';
  process.env.NOTIFY_TO = 'owner@example.com';
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  calls = [];
  stripeRefuses = false;
  // @ts-expect-error test double
  global.fetch = mock(async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    if (url.includes('stripe.com')) {
      if (stripeRefuses) return { ok: false, status: 402, json: async () => ({ error: { message: 'card_declined' } }) } as Response;
      return { ok: true, status: 200, json: async () => ({ id: 'cs_test_1', url: STRIPE_PAGE }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ id: `email_${calls.length}` }) } as Response;
  });
});
afterEach(() => { for (const k of ['RESEND_API_KEY', 'NOTIFY_TO', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) delete process.env[k]; });

function booking(over: Record<string, string> = {}) {
  return { service: 'ac-repair', property: 'House', address: '12 Example St', urgency: 'week', day: 'Tuesday', window: 'Morning, 8–12', name: 'Pat Lee', phone: '5550100', email: 'pat@example.com', notes: '', ...over };
}
function post(body: Record<string, string>, json = true): Promise<Response> {
  return book(new Request('https://book.example.com/api/book', {
    method: 'POST',
    headers: json ? { 'content-type': 'application/json', accept: 'application/json' } : { 'content-type': 'application/x-www-form-urlencoded' },
    body: json ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  }));
}
function stripeParam(body: string, key: string): string | null {
  return new URLSearchParams(body).get(key);
}

/* The checks every config must pass: the shipped one and each example. */
function checkConfig(c: typeof config) {
  expect(c.business.name.length).toBeGreaterThan(2);
  expect(c.business.phoneHref).toMatch(/^tel:\+?\d+$/);
  expect(c.business.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  expect(Number.isInteger(c.afterHours.cents) && c.afterHours.cents >= 0).toBe(true);
  const keys = new Set<string>();
  for (const s of c.services) {
    expect(s.key).toMatch(/^[a-z0-9-]+$/);
    expect(keys.has(s.key)).toBe(false); keys.add(s.key);
    expect(s.name.length).toBeGreaterThan(2);
    expect(s.label.length).toBeGreaterThan(2);
    expect(Number.isInteger(s.due) && s.due >= 0).toBe(true);
    expect(Number.isInteger(s.total) && s.total >= 0).toBe(true);
    if (s.total) expect(s.total).toBeGreaterThanOrEqual(s.due);
  }
  expect(c.services.some((s) => s.due === 0)).toBe(true);  // one request-only job
  expect(c.services.some((s) => s.due > 0)).toBe(true);    // one paid one
  expect(c.property.length).toBeGreaterThan(0);
  expect(c.windows.length).toBeGreaterThan(0);
  expect(c.urgency.some((u) => u.key === 'today')).toBe(true); // the after-hours fee is tied to this key
  expect(new Set(c.urgency.map((u) => u.key)).size).toBe(c.urgency.length);
}

describe('the config', () => {
  test('every service has a key, a name, a label, and numbers that make sense', () => checkConfig(config));
});

describe('the example configs', () => {
  const dir = new URL('../engines/trades/examples/', import.meta.url);
  const names = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as typeof config;
  test('one per trade, and the heating one is the shipped config, byte for byte in meaning', () => {
    expect(names).toEqual(['electrical.json', 'hvac.json', 'plumbing.json', 'roofing.json']);
    expect(read('hvac.json')).toEqual(config);
  });
  for (const name of names) test(`${name} passes the same checks as the shipped config`, () => checkConfig(read(name)));
  test('the examples are different businesses, not the demo renamed', () => {
    const n = new Set(names.map((x) => read(x).business.name));
    expect(n.size).toBe(names.length);
  });
});

describe('the price', () => {
  test('comes from the config, with the after-hours fee only for today and only when something is due', () => {
    const ac = config.services.find((s) => s.key === 'ac-repair')!;
    expect(priceFor('ac-repair', 'week').due).toBe(ac.due);
    expect(priceFor('ac-repair', 'today').due).toBe(ac.due + config.afterHours.cents);
    expect(priceFor('install', 'today').due).toBe(0);
    expect(priceFor('nonsense', 'today').service).toBeNull();
  });
  test('a duct cleaning shows the balance after the deposit', () => {
    const p = priceFor('duct-cleaning', 'week');
    expect(p.due).toBe(10000);
    expect(p.total).toBe(29900);
  });
});

describe('booking with something due', () => {
  test('creates a Stripe session for the config price, carrying the booking in metadata', async () => {
    const res = await post(booking({ urgency: 'today' }));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe(STRIPE_PAGE);
    expect(stripeCalls().length).toBe(1);
    const body = stripeCalls()[0].body;
    expect(stripeParam(body, 'line_items[0][price_data][unit_amount]')).toBe(String(8900 + config.afterHours.cents));
    expect(stripeParam(body, 'metadata[e_name]')).toBe('Pat Lee');
    expect(stripeParam(body, 'metadata[e_service]')).toBe('AC not cooling');
    expect(stripeParam(body, 'success_url')).toBe('https://book.example.com/booked.html?session_id={CHECKOUT_SESSION_ID}');
    expect(emails().length).toBe(0); // nothing is emailed until Stripe says paid
  });
  test('ignores any price the browser sends', async () => {
    await post(booking({ due: '1', total: '1', price: '1' } as Record<string, string>));
    expect(stripeParam(stripeCalls()[0].body, 'line_items[0][price_data][unit_amount]')).toBe('8900');
  });
  test('without a Stripe key it becomes a request and the owner is told to take payment by phone', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await post(booking());
    expect((await res.json()).url).toMatch(/requested\.html$/);
    expect(stripeCalls().length).toBe(0);
    expect(emails()[0].to[0]).toBe('owner@example.com');
    expect(emails()[0].text).toContain('$89.00');
    expect(emails()[1].to[0]).toBe('pat@example.com');
  });
  test('when Stripe refuses, the booking is kept as a request, not lost', async () => {
    stripeRefuses = true;
    const res = await post(booking());
    expect((await res.json()).url).toMatch(/requested\.html\?pay=later$/);
    expect(emails()[0].text).toContain('PAYMENT DID NOT START');
  });
});

describe('booking with nothing due', () => {
  test('an estimate goes straight to email, no Stripe', async () => {
    const res = await post(booking({ service: 'install' }));
    expect((await res.json()).url).toMatch(/requested\.html$/);
    expect(stripeCalls().length).toBe(0);
    expect(emails()[0].subject).toContain('New system or replacement');
  });
  test('the plain form (no JavaScript) is a request with free text, and redirects', async () => {
    const res = await post({ name: 'Sam', phone: '5550199', issue: 'furnace is clicking', day: 'Friday' }, false);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://book.example.com/requested.html');
    expect(stripeCalls().length).toBe(0);
    expect(emails()[0].text).toContain('furnace is clicking');
  });
  test('the honeypot swallows bots: says yes, sends nothing', async () => {
    await post({ ...booking(), nb_hp: 'spam' });
    expect(calls.length).toBe(0);
  });
  test('a missing phone is refused with a reason', async () => {
    const res = await post(booking({ phone: '' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('phone');
    expect(calls.length).toBe(0);
  });
});

/* The signature exactly as Stripe builds it: HMAC-SHA256 over "t.payload". */
async function sign(secret: string, payload: string, t = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  return `t=${t},v1=${Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
function completed(md: Record<string, string>, amount: number) {
  return JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', amount_total: amount, payment_status: 'paid', metadata: md } } });
}
const META = { e_name: 'Pat Lee', e_phone: '5550100', e_email: 'pat@example.com', e_where: 'House · 12 Example St', e_service: 'Duct cleaning', e_label: 'Duct cleaning, whole house', e_when: 'week · Tuesday · Morning, 8–12', e_notes: '', e_due: '10000', e_total: '29900' };

describe('the webhook', () => {
  test('a forged signature emails nobody', async () => {
    const payload = completed(META, 10000);
    const res = await webhook(new Request('https://book.example.com/api/webhook', { method: 'POST', headers: { 'stripe-signature': await sign('wrong', payload) }, body: payload }));
    expect(res.status).toBe(400);
    expect(emails().length).toBe(0);
  });
  test('a genuine paid session emails the owner the amount paid and the balance, and the customer a confirmation', async () => {
    const payload = completed(META, 10000);
    const res = await webhook(new Request('https://book.example.com/api/webhook', { method: 'POST', headers: { 'stripe-signature': await sign(SECRET, payload) }, body: payload }));
    expect(res.status).toBe(200);
    const [owner, customer] = emails();
    expect(owner.to[0]).toBe('owner@example.com');
    expect(owner.subject).toContain('PAID');
    expect(owner.text).toContain('$100.00');
    expect(owner.text).toContain('$199.00');
    expect(customer.to[0]).toBe('pat@example.com');
    expect(customer.text).toContain('Your spot is held');
  });
  test('other events are acknowledged and ignored', async () => {
    const payload = JSON.stringify({ type: 'payment_intent.created', data: { object: {} } });
    const res = await webhook(new Request('https://book.example.com/api/webhook', { method: 'POST', headers: { 'stripe-signature': await sign(SECRET, payload) }, body: payload }));
    expect(res.status).toBe(200);
    expect(emails().length).toBe(0);
  });
});
