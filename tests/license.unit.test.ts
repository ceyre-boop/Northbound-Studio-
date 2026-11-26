/* tests/license.unit.test.ts — the license server (lib/license.ts, api/license.ts, api/license-admin.ts and the
 * automations branch of api/stripe-webhook.ts), end to end against a fake Stripe and a fake Resend.
 *
 * bun:test. global.fetch is mocked: nothing reaches Stripe or Resend, and each test reads the fake's state.
 * What these pin:
 *   - an answer is signed so the launcher's license.cjs check (Ed25519 over the base64url string) accepts it,
 *     and an edited answer fails;
 *   - what a key unlocks follows Stripe: active, past_due for 14 days, then paused; ended; switched off by hand;
 *     trials that run out;
 *   - paying a payment link makes one key, saves it on the customer and subscription, emails it once;
 *   - website orders through the same webhook are untouched;
 *   - admin calls need the token.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { resetLimits } from '../lib/guard.ts';
import { createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { POST as licensePOST } from '../api/license.ts';
import { POST as adminPOST } from '../api/license-admin.ts';
import { POST as webhookPOST } from '../api/stripe-webhook.ts';
import { KEY_RE, PAUSE_AFTER_DAYS, decide, newKey, parseApps, publicKeyOf, type Customer } from '../lib/license.ts';

const SEED = randomBytes(32).toString('base64url');
const ADMIN = 'a'.repeat(40);
const WHSEC = 'whsec_test_secret';
const DAY = 86_400_000;

/* ---- a small fake Stripe ---- */
type Obj = Record<string, any>;
let customers: Obj[] = [], subs: Obj[] = [], prices: Obj[] = [], links: Obj[] = [], portalConfs: Obj[] = [], emails: Obj[] = [];
let portalDefaultMissing = false;
let n = 0;
const id = (p: string) => `${p}_${++n}`;

function setForm(target: Obj, form: URLSearchParams) {
  for (const [k, v] of form) {
    const m = k.match(/^metadata\[(.+)\]$/);
    if (m) { target.metadata ??= {}; if (v === '') delete target.metadata[m[1]]; else target.metadata[m[1]] = v; }
    else if (!k.includes('[')) target[k] = v;
  }
}
function formObj(form: URLSearchParams): Obj { const o: Obj = {}; for (const [k, v] of form) o[k] = v; return o; }

async function fakeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  if (url.host === 'api.resend.com') { const b = JSON.parse(String(init.body)); emails.push(b); return Response.json({ id: id('em') }); }
  if (url.host !== 'api.stripe.com') throw new Error(`unexpected fetch ${url}`);
  const path = url.pathname.replace('/v1/', '');
  const form = new URLSearchParams(String(init.body ?? ''));
  const post = (init.method ?? 'GET') === 'POST';
  const ok = (o: unknown) => Response.json(o);
  if (path === 'customers/search') {
    const q = url.searchParams.get('query')!;
    const m = q.match(/^metadata\['(\w+)'\]:'([^']*)'$/)!;
    let data = customers.filter((c) => c.metadata?.[m[1]] === m[2]);
    if (url.searchParams.getAll('expand[]').includes('data.subscriptions')) data = data.map((c) => ({ ...c, subscriptions: { data: subs.filter((s) => s.customer === c.id && s.status !== 'canceled') } }));
    return ok({ data });
  }
  if (path === 'customers' && post) { const c: Obj = { id: id('cus'), metadata: {} }; setForm(c, form); customers.push(c); return ok(c); }
  let m = path.match(/^customers\/(.+)$/);
  if (m) { const c = customers.find((x) => x.id === m![1]); if (!c) return Response.json({ error: { code: 'resource_missing' } }, { status: 404 }); if (post) setForm(c, form); return ok(c); }
  if (path === 'subscriptions') {
    const data = subs.filter((s) => s.customer === url.searchParams.get('customer'));
    return ok({ data: data.map((s) => ({ ...s, latest_invoice: s.invoice ?? null })) });
  }
  m = path.match(/^subscriptions\/(.+)$/);
  if (m) { const s = subs.find((x) => x.id === m![1])!; if (post) setForm(s, form); return ok(s); }
  if (path === 'prices') { const p = { id: id('price'), ...formObj(form) }; prices.push(p); return ok(p); }
  if (path === 'payment_links') { const l = { id: id('plink'), url: `https://buy.stripe.com/${n}`, livemode: true, ...formObj(form) }; links.push(l); return ok(l); }
  if (path === 'billing_portal/sessions') {
    if (portalDefaultMissing && !form.get('configuration')) return Response.json({ error: { type: 'invalid_request_error' } }, { status: 400 });
    return ok({ url: `https://billing.stripe.com/p/session/${form.get('customer')}` });
  }
  if (path === 'billing_portal/configurations') {
    if (post) { const c: Obj = { id: id('bpc'), metadata: {} }; setForm(c, form); portalConfs.push(c); return ok(c); }
    return ok({ data: portalConfs });
  }
  throw new Error(`fake Stripe has no ${path}`);
}

let realFetch: typeof fetch;
let quiet: ReturnType<typeof spyOn>[] = [];
beforeEach(() => {
  resetLimits();
  customers = []; subs = []; prices = []; links = []; portalConfs = []; emails = []; portalDefaultMissing = false;
  realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch as typeof fetch;
  Object.assign(process.env, { NB_LICENSE_SIGNING_KEY: SEED, NB_LICENSE_ADMIN_TOKEN: ADMIN, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: WHSEC, RESEND_API_KEY: 're_fake', QUOTE_TO: 'studio@example.com' });
  quiet = [spyOn(console, 'log').mockImplementation(() => {}), spyOn(console, 'error').mockImplementation(() => {})];
});
afterEach(() => { globalThis.fetch = realFetch; for (const s of quiet) s.mockRestore(); });

/* ---- helpers ---- */
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
/** Exactly the launcher's check (desktop/hub/license.cjs readSigned). */
function launcherReads(signed: { license: string; sig: string }) {
  const pub = createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(publicKeyOf(SEED), 'base64url')]), format: 'der', type: 'spki' });
  if (!verify(null, Buffer.from(signed.license, 'utf8'), pub, Buffer.from(signed.sig, 'base64url'))) return null;
  return JSON.parse(Buffer.from(signed.license, 'base64url').toString('utf8'));
}
const ask = (body: unknown) => licensePOST(new Request('https://northbound-dev.com/api/license', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const admin = (body: unknown, token = ADMIN) => adminPOST(new Request('https://northbound-dev.com/api/license-admin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
function hook(event: unknown) {
  const payload = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', WHSEC).update(`${t}.${payload}`).digest('hex');
  return webhookPOST(new Request('https://northbound-dev.com/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}` }, body: payload }));
}
const cust = (key: string, md: Record<string, string> = {}): Customer => ({ id: 'cus_x', metadata: { nb_license: key, nb_apps: 'all', nb_business: 'Booth Plumbing', ...md } });

describe('keys', () => {
  test('new keys have the launcher’s shape and never repeat', () => {
    const keys = new Set(Array.from({ length: 500 }, newKey));
    expect(keys.size).toBe(500);
    for (const k of keys) expect(k).toMatch(KEY_RE);
  });
  test('apps are "all" or known slugs only', () => {
    expect(parseApps('all')).toEqual(['all']);
    expect(parseApps('lead-catcher, quote-builder,lead-catcher')).toEqual(['lead-catcher', 'quote-builder']);
    expect(parseApps('lead-catcher,mystery')).toBeNull();
    expect(parseApps('')).toBeNull();
  });
});

describe('what a key unlocks (decide)', () => {
  const now = Date.parse('2026-11-26T20:00:00Z');
  const k = 'NB-ABCDE-FGHJK-MNPQR-STVWX';
  test('no such customer: unknown, with a "just paid?" hint', () => {
    const p = decide({ key: k, customer: null, subs: [], now });
    expect(p.status).toBe('unknown');
    expect(p.reason).toMatch(/give it a minute/);
  });
  test('active or trialing subscription: active, its apps, valid three days offline', () => {
    for (const status of ['active', 'trialing']) {
      const p = decide({ key: k, customer: cust(k, { nb_apps: 'lead-catcher' }), subs: [{ id: 's', status }], now });
      expect(p).toMatchObject({ status: 'active', apps: ['lead-catcher'], business: 'Booth Plumbing' });
      expect(Date.parse(p.valid_until) - now).toBe(3 * DAY);
    }
  });
  test('owing: still on for 14 days (and offline only up to day 14), then paused', () => {
    const since = now - 10 * DAY;
    const p = decide({ key: k, customer: cust(k), subs: [{ id: 's', status: 'past_due' }], unpaidSince: since, now });
    expect(p.status).toBe('past_due');
    expect(p.apps).toEqual(['all']);
    expect(Date.parse(p.valid_until)).toBe(Math.min(now + 3 * DAY, since + PAUSE_AFTER_DAYS * DAY));
    const late = decide({ key: k, customer: cust(k), subs: [{ id: 's', status: 'unpaid' }], unpaidSince: now - 15 * DAY, now });
    expect(late.status).toBe('revoked');
    expect(late.reason).toMatch(/14 days overdue/);
  });
  test('ended subscription, or switched off by hand: revoked; the best of several subscriptions wins', () => {
    expect(decide({ key: k, customer: cust(k), subs: [{ id: 's', status: 'canceled' }], now }).status).toBe('revoked');
    expect(decide({ key: k, customer: cust(k), subs: [{ id: 'a', status: 'canceled' }, { id: 'b', status: 'active' }], now }).status).toBe('active');
    const off = decide({ key: k, customer: cust(k, { nb_license_status: 'revoked', nb_license_reason: 'Paused while we sort your account.' }), subs: [{ id: 's', status: 'active' }], now });
    expect(off).toMatchObject({ status: 'revoked', apps: [], reason: 'Paused while we sort your account.' });
  });
  test('a hand-issued key: on while active, until its date; a trial that ran out says when', () => {
    expect(decide({ key: k, customer: cust(k, { nb_license_status: 'active' }), subs: [], now }).status).toBe('active');
    const trial = decide({ key: k, customer: cust(k, { nb_license_status: 'active', nb_license_until: new Date(now + DAY).toISOString() }), subs: [], now });
    expect(trial.status).toBe('active');
    expect(Date.parse(trial.valid_until)).toBe(now + DAY);
    const done = decide({ key: k, customer: cust(k, { nb_license_status: 'active', nb_license_until: new Date(now - DAY).toISOString() }), subs: [], now });
    expect(done.status).toBe('revoked');
    expect(done.reason).toMatch(/ran out on November 25, 2026/);
    expect(decide({ key: k, customer: cust(k), subs: [], now }).status).toBe('revoked'); // no subscription and never switched on
  });
});

describe('api/license', () => {
  test('a signed answer the launcher accepts; an edited one fails', async () => {
    const r = await (await admin({ action: 'issue', business: 'Booth Plumbing', apps: 'lead-catcher,quote-builder', days: 2 })).json();
    const res = await ask({ key: r.key.toLowerCase(), device: 'f3b8c1d2-1111-4222-8333-944455556666' });
    expect(res.status).toBe(200);
    const signed = await res.json();
    const p = launcherReads(signed);
    expect(p).toMatchObject({ v: 1, key: r.key, status: 'active', apps: ['lead-catcher', 'quote-builder'], business: 'Booth Plumbing' });
    const forged = { ...signed, license: Buffer.from(JSON.stringify({ ...p, apps: ['all'] })).toString('base64url') };
    expect(launcherReads(forged)).toBeNull();
    expect(customers[0].metadata.nb_devices).toBe('f3b8c1d2-1111-4222-8333-944455556666'); // the Mac is remembered
  });
  test('an unknown key gets a signed "unknown"; a malformed one is refused; no setup is a 503', async () => {
    const p = launcherReads(await (await ask({ key: 'NB-ABCDE-FGHJK-MNPQR-STVWX' })).json());
    expect(p.status).toBe('unknown');
    expect((await ask({ key: 'hello' })).status).toBe(400);
    delete process.env.NB_LICENSE_SIGNING_KEY;
    expect((await ask({ key: 'NB-ABCDE-FGHJK-MNPQR-STVWX' })).status).toBe(503);
  });
  test('Manage my plan: a Stripe billing link, making Northbound’s portal settings once when there are none', async () => {
    const { key } = await (await admin({ action: 'issue', business: 'Booth Plumbing', apps: 'all' })).json();
    portalDefaultMissing = true;
    const a = await (await ask({ key, action: 'portal' })).json();
    expect(a.url).toStartWith('https://billing.stripe.com/');
    await ask({ key, action: 'portal' });
    expect(portalConfs).toHaveLength(1);
    expect(portalConfs[0].metadata).toEqual({ nb: 'license' });
    expect((await ask({ key: 'NB-ABCDE-FGHJK-MNPQR-STVWX', action: 'portal' })).status).toBe(404);
  });
});

describe('paying a payment link makes the key', () => {
  async function sellAndPay() {
    const sold = await (await admin({ action: 'sell', business: 'Booth Plumbing & Heating', apps: 'lead-catcher,invoice-chaser', monthly: 250 })).json();
    expect(sold.url).toStartWith('https://buy.stripe.com/');
    const link = links.at(-1)!;
    expect(link['subscription_data[metadata][nb_kind]']).toBe('automations');
    expect(link['restrictions[completed_sessions][limit]']).toBe('1');
    expect(prices.at(-1)).toMatchObject({ unit_amount: '25000', 'recurring[interval]': 'month' });
    // What Stripe does when it's paid: a customer and a subscription, then checkout.session.completed with the link's metadata.
    const c = { id: id('cus'), email: 'owner@booth.example', name: 'Dana Booth', metadata: {} as Record<string, string> };
    customers.push(c);
    const s = { id: id('sub'), customer: c.id, status: 'active', metadata: { nb_kind: 'automations', nb_apps: 'lead-catcher,invoice-chaser', nb_business: 'Booth Plumbing & Heating' } as Record<string, string> };
    subs.push(s);
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'subscription', customer: c.id, subscription: s.id, customer_details: { email: c.email, name: c.name }, metadata: { nb_kind: 'automations', nb_apps: 'lead-catcher,invoice-chaser', nb_business: 'Booth Plumbing & Heating' } } } };
    return { c, s, event };
  }
  test('one key, on the customer and the subscription, emailed to them and the studio; a retry sends nothing new', async () => {
    const { c, s, event } = await sellAndPay();
    const res = await hook(event);
    expect(res.status).toBe(200);
    const key = c.metadata.nb_license;
    expect(key).toMatch(KEY_RE);
    expect(s.metadata.nb_license).toBe(key);
    expect(emails.map((e) => e.to[0])).toEqual(['studio@example.com', 'owner@booth.example']);
    expect(emails[1].text).toContain(key);
    expect(emails[1].text).toContain('lead-catcher, invoice-chaser');
    expect(emails[1].text).toStartWith('Hi Dana,');
    expect((await hook(event)).status).toBe(200);
    expect(emails).toHaveLength(2);
    expect(c.metadata.nb_license).toBe(key);
    // and the app now gets an active answer for exactly those automations
    const p = launcherReads(await (await ask({ key })).json());
    expect(p).toMatchObject({ status: 'active', apps: ['lead-catcher', 'invoice-chaser'] });
    // they stop paying: past due, then the subscription ends
    s.status = 'past_due'; (s as any).invoice = { status: 'open', created: Math.floor(Date.now() / 1000) - 3 * 86400 };
    expect(launcherReads(await (await ask({ key })).json()).status).toBe('past_due');
    s.status = 'canceled';
    expect(launcherReads(await (await ask({ key })).json()).status).toBe('revoked');
  });
  test('a website order through the same webhook is not touched by any of this', async () => {
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_site', amount_total: 25000, metadata: { nb_name: 'Sam', nb_email: 'sam@example.com', nb_item: 'Website', nb_due: '25000' } } } };
    expect((await hook(event)).status).toBe(200);
    expect(customers).toHaveLength(0);
    expect(emails[0].subject).toMatch(/^Paid order/);
  });
});

describe('api/license-admin', () => {
  test('needs the token', async () => {
    expect((await admin({ action: 'list' }, 'b'.repeat(40))).status).toBe(401);
    expect((await admin({ action: 'list' }, '')).status).toBe(401);
    expect((await admin({ action: 'nope' })).status).toBe(400);
  });
  test('revoke switches a key off, restore turns it back on, extend moves a trial, list shows it', async () => {
    const { key } = await (await admin({ action: 'issue', business: 'Rivers Edge Landscaping', apps: 'all', days: 2 })).json();
    expect((await (await admin({ action: 'revoke', key, reason: 'Testing the switch.' })).json()).status).toBe('revoked');
    expect(launcherReads(await (await ask({ key })).json())).toMatchObject({ status: 'revoked', reason: 'Testing the switch.' });
    expect((await (await admin({ action: 'restore', key })).json()).status).toBe('active');
    const ext = await (await admin({ action: 'extend', key, days: 30 })).json();
    expect(Date.parse(ext.until) - Date.now()).toBeGreaterThan(29 * DAY);
    const list = await (await admin({ action: 'list' })).json();
    expect(list.licenses).toEqual([expect.objectContaining({ key, business: 'Rivers Edge Landscaping', status: 'active' })]);
  });
  test('bad input is refused before Stripe is asked', async () => {
    expect((await admin({ action: 'sell', business: 'X', apps: 'everything', monthly: 100 })).status).toBe(400);
    expect((await admin({ action: 'sell', business: 'X', apps: 'all', monthly: 99.5 })).status).toBe(400);
    expect((await admin({ action: 'issue', business: '', apps: 'all' })).status).toBe(400);
    expect(prices).toHaveLength(0);
    expect(customers).toHaveLength(0);
  });
});
