/* api/license-admin.ts — Colin's (and Buddy's) controls for license keys. Not for the public: every call needs
 * "Authorization: Bearer <NB_LICENSE_ADMIN_TOKEN>", which lives only in Vercel's environment and ~/northbound/.env.
 * scripts/license.ts is the command line for it.
 *
 *   sell     {business, apps, monthly, email?}  a Stripe payment link for a monthly plan; paying it makes the key
 *                                               (api/stripe-webhook.ts) and emails it to the customer
 *   issue    {business, apps, email?, days?}    a key with no payment: a trial (days) or a comp (no days)
 *   revoke   {key, reason?}                     switch a key off now (billing is left alone: cancel in Stripe)
 *   restore  {key}                              undo a revoke
 *   extend   {key, days}                        a trial or comp key runs `days` more from today
 *   show     {key}                              what the key unlocks right now, its customer and its Macs
 *   list     {}                                 every automations customer and their key
 *
 * Prices are Colin's: `monthly` is whatever he agreed with the client (DECISIONS #24: $100–$300 a month per
 * automation). Nothing here sends an email except a payment the customer makes themselves.
 */
import { APPS, KEY_RE, check, decide, findCustomer, newKey, normaliseKey, parseApps, sameSecret, stripe, StripeError, type Customer, type Subscription } from '../lib/license.js';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const DAY = 86_400_000;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = Record<string, unknown>;

async function keyed(b: Body): Promise<{ key: string; c: Customer } | Response> {
  const key = normaliseKey(b.key);
  if (!KEY_RE.test(key)) return json({ error: 'key must look like NB-XXXXX-XXXXX-XXXXX-XXXXX' }, 400);
  const c = await findCustomer(key);
  if (!c) return json({ error: `no customer holds ${key} (a key made in the last minute may not be searchable yet)` }, 404);
  return { key, c };
}

async function show(key: string) {
  const { payload, customer, subs } = await check(key);
  return {
    key, status: payload.status, apps: payload.apps, business: payload.business, reason: payload.reason ?? '',
    customer: customer?.id ?? null, email: customer?.email ?? '',
    until: customer?.metadata.nb_license_until ?? '', switched_off: customer?.metadata.nb_license_status === 'revoked',
    subscriptions: subs.map((s) => ({ id: s.id, status: s.status })),
    macs: String(customer?.metadata.nb_devices ?? '').split(',').filter(Boolean).length,
  };
}

const actions: Record<string, (b: Body) => Promise<Response>> = {
  async sell(b) {
    const business = text(b.business, 120), apps = parseApps(b.apps), monthly = Number(b.monthly);
    if (!business) return json({ error: 'business is required' }, 400);
    if (!apps) return json({ error: `apps must be "all" or a comma list of: ${APPS.join(', ')}` }, 400);
    if (!Number.isInteger(monthly) || monthly < 1 || monthly > 5000) return json({ error: 'monthly is the plan price in whole dollars a month' }, 400);
    const appsText = apps.join(',');
    const tags = { nb_kind: 'automations', nb_apps: appsText, nb_business: business };
    const price = await stripe('prices', {
      currency: 'usd', unit_amount: String(monthly * 100), 'recurring[interval]': 'month',
      'product_data[name]': `Northbound automations: ${business}`.slice(0, 120),
      ...Object.fromEntries(Object.entries(tags).map(([k, v]) => [`metadata[${k}]`, v])),
    });
    const link = await stripe('payment_links', {
      'line_items[0][price]': price.id, 'line_items[0][quantity]': '1',
      ...Object.fromEntries(Object.entries(tags).flatMap(([k, v]) => [[`metadata[${k}]`, v], [`subscription_data[metadata][${k}]`, v]])),
      'restrictions[completed_sessions][limit]': '1',
      'after_completion[type]': 'hosted_confirmation',
      'after_completion[hosted_confirmation][custom_message]': 'Thank you! Your Northbound license key is on its way to your email. Open the Northbound app and paste it in.',
    });
    console.log('[license-admin] payment link made', { business, apps: appsText, monthly });
    return json({ url: link.url, payment_link: link.id, livemode: !!link.livemode, business, apps, monthly });
  },

  async issue(b) {
    const business = text(b.business, 120), apps = parseApps(b.apps), email = text(b.email, 200);
    const days = b.days === undefined || b.days === null || b.days === '' ? null : Number(b.days);
    if (!business) return json({ error: 'business is required' }, 400);
    if (!apps) return json({ error: `apps must be "all" or a comma list of: ${APPS.join(', ')}` }, 400);
    if (email && !EMAIL_RE.test(email)) return json({ error: 'that email doesn’t look right' }, 400);
    if (days !== null && (!Number.isFinite(days) || days <= 0 || days > 366)) return json({ error: 'days must be between 1 and 366 (leave it out for a key that never runs out)' }, 400);
    const key = newKey();
    const until = days === null ? '' : new Date(Date.now() + days * DAY).toISOString();
    const c = await stripe('customers', {
      name: business, ...(email ? { email } : {}),
      'metadata[nb_kind]': 'automations', 'metadata[nb_license]': key, 'metadata[nb_apps]': apps.join(','), 'metadata[nb_business]': business,
      'metadata[nb_license_status]': 'active', ...(until ? { 'metadata[nb_license_until]': until } : {}),
    });
    console.log('[license-admin] key issued by hand', { customer: c.id, days });
    return json({ key, customer: c.id, business, apps, until: until || 'never' });
  },

  async revoke(b) {
    const k = await keyed(b); if (k instanceof Response) return k;
    await stripe(`customers/${encodeURIComponent(k.c.id)}`, { 'metadata[nb_license_status]': 'revoked', 'metadata[nb_license_reason]': text(b.reason, 400) });
    return json({ ...(await show(k.key)), note: 'Switched off. The app locks at its next check (within a few hours, or when it reopens). Billing is untouched: cancel the subscription in Stripe if they should stop paying too.' });
  },

  async restore(b) {
    const k = await keyed(b); if (k instanceof Response) return k;
    const { subs } = await check(k.key);
    await stripe(`customers/${encodeURIComponent(k.c.id)}`, { 'metadata[nb_license_status]': subs.length ? '' : 'active', 'metadata[nb_license_reason]': '' });
    return json(await show(k.key));
  },

  async extend(b) {
    const k = await keyed(b); if (k instanceof Response) return k;
    const days = Number(b.days);
    if (!Number.isFinite(days) || days <= 0 || days > 366) return json({ error: 'days must be between 1 and 366' }, 400);
    await stripe(`customers/${encodeURIComponent(k.c.id)}`, { 'metadata[nb_license_until]': new Date(Date.now() + days * DAY).toISOString() });
    return json(await show(k.key));
  },

  async show(b) {
    const k = await keyed(b); if (k instanceof Response) return k;
    return json(await show(k.key));
  },

  async list() {
    const q = encodeURIComponent(`metadata['nb_kind']:'automations'`);
    const r = await stripe(`customers/search?query=${q}&limit=100&expand[]=data.subscriptions`);
    const now = Date.now();
    const rows = ((r.data ?? []) as (Customer & { subscriptions?: { data?: Subscription[] } })[]).map((c) => {
      const key = c.metadata.nb_license ?? '';
      const subs = (c.subscriptions?.data ?? []).filter((s) => s.metadata?.nb_license === key);
      const p = decide({ key, customer: c, subs, now });
      return { key, business: p.business, email: c.email ?? '', status: p.status, apps: p.apps, until: c.metadata.nb_license_until ?? '', customer: c.id };
    });
    return json({ count: rows.length, licenses: rows });
  },
};

export async function POST(request: Request): Promise<Response> {
  const token = process.env.NB_LICENSE_ADMIN_TOKEN;
  if (!token || token.length < 32 || !process.env.STRIPE_SECRET_KEY) return json({ error: 'license admin isn’t set up' }, 503);
  const auth = request.headers.get('authorization') ?? '';
  if (!sameSecret(auth, `Bearer ${token}`)) return json({ error: 'unauthorised' }, 401);
  let b: Body;
  try { b = (await request.json()) as Body; } catch { return json({ error: 'send JSON' }, 400); }
  const run = actions[String(b?.action ?? '')];
  if (!run) return json({ error: `action must be one of: ${Object.keys(actions).join(', ')}` }, 400);
  try {
    return await run(b);
  } catch (e) {
    console.error('[license-admin]', b.action, e instanceof Error ? e.message : e);
    return json({ error: e instanceof StripeError ? e.message : 'something went wrong' }, e instanceof StripeError && e.status < 500 ? 400 : 502);
  }
}
