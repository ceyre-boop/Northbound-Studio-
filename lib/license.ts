/* lib/license.ts — Northbound's licence keys, kept in Stripe.
 *
 * The Northbound launcher (the Mac app a client runs, ~/northbound/agents/desktop/hub/license.cjs) asks
 * api/license.ts about its key at start-up and every few hours, and unlocks only what the answer allows. This file
 * is everything behind that answer.
 *
 * WHERE KEYS LIVE. In Stripe, on the customer: metadata nb_license (the key), nb_apps ("all" or a comma list of
 * launcher slugs), nb_business, nb_kind = "automations". A key bought through a payment link (api/license-admin.ts
 * `sell`) is made by api/stripe-webhook.ts when the checkout completes, and its subscription is tagged with the same
 * nb_license. No new service, no new database: decision 48 named an off-the-shelf licensing service, and Stripe,
 * which already takes the money, is that service.
 *
 * WHAT A KEY UNLOCKS, decided from Stripe on every check (decide() below):
 *   - Colin switched it off (nb_license_status = revoked)            -> revoked, everything locks;
 *   - its subscription is active or trialing                           -> active;
 *   - past_due or unpaid, owing for 14 days or less (DECISIONS #27)   -> past_due: still on, with "update your card";
 *   - owing for more than 14 days, or the subscription has ended      -> revoked;
 *   - a key with no subscription (a trial or a comp, `issue`)         -> active until nb_license_until, if any.
 * The answer is signed with Northbound's Ed25519 key (NB_LICENSE_SIGNING_KEY, a 32-byte seed in base64url, only in
 * Vercel's environment and Colin's ~/northbound/.env). The app carries only the public key, so an answer can't be
 * edited to unlock more and a fake server can't hand one out. A signed answer counts offline for VALID_DAYS.
 */
import { createPrivateKey, createPublicKey, randomBytes, sign, timingSafeEqual } from 'node:crypto';

export const KEY_RE = /^NB(-[0-9A-HJKMNP-TV-Z]{5}){4}$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
/** The launcher's catalogue (desktop/hub/catalog.cjs), by slug. */
export const APPS = [
  'lead-catcher', 'appointment-reminders', 'invoice-chaser', 'quote-builder', 'data-entry', 'owner-dashboard',
  'ai-receptionist', 'inbox-autopilot', 'outreach-autopilot', 'post-everywhere',
] as const;
export const VALID_DAYS = 3;
export const PAUSE_AFTER_DAYS = 14;
export const PLAN_URL = 'https://northbound-dev.com/account.html';
const DAY = 86_400_000;

export type Status = 'active' | 'past_due' | 'revoked' | 'unknown';
export type Payload = { v: 1; key: string; status: Status; apps: string[]; business: string; checked_at: string; valid_until: string; reason?: string };
export type Customer = { id: string; name?: string | null; email?: string | null; deleted?: boolean; metadata: Record<string, string> };
export type Invoice = { status?: string; created?: number; status_transitions?: { finalized_at?: number | null } };
export type Subscription = { id: string; status: string; metadata?: Record<string, string>; latest_invoice?: Invoice | string | null };

/* ---- keys ----------------------------------------------------------------------------------------------------- */

export function newKey(): string {
  let s = '';
  for (const b of randomBytes(20)) s += ALPHABET[b & 31]; // 256 is a multiple of 32: every letter equally likely, 100 bits
  return `NB-${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}-${s.slice(15, 20)}`;
}
export const normaliseKey = (raw: unknown): string => String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');

/** "all", or known launcher slugs; null when anything in it is unknown. */
export function parseApps(raw: unknown): string[] | null {
  const list = String(raw ?? '').split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return null;
  if (list.includes('all')) return ['all'];
  if (list.some((a) => !(APPS as readonly string[]).includes(a))) return null;
  return [...new Set(list)];
}

/* ---- signing (the launcher's license.cjs verifies exactly this) ------------------------------------------------- */

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
function privateKey(seed: string) {
  const raw = Buffer.from(String(seed ?? ''), 'base64url');
  if (raw.length !== 32) throw new Error('NB_LICENSE_SIGNING_KEY must be a 32-byte seed in base64url');
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, raw]), format: 'der', type: 'pkcs8' });
}
/** The public key the launcher is built with (app.json licensePublicKey): the raw 32 bytes in base64url. */
export function publicKeyOf(seed: string): string {
  const spki = createPublicKey(privateKey(seed)).export({ format: 'der', type: 'spki' }) as Buffer;
  return spki.subarray(SPKI_ED25519.length).toString('base64url');
}
export function signLicense(p: Payload, seed: string): { license: string; sig: string } {
  const license = Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
  return { license, sig: sign(null, Buffer.from(license, 'utf8'), privateKey(seed)).toString('base64url') };
}
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ---- the decision ---------------------------------------------------------------------------------------------- */

const RANK: Record<string, number> = { active: 4, trialing: 4, past_due: 3, unpaid: 3, incomplete: 2, paused: 1, canceled: 0, incomplete_expired: 0 };
const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Detroit' });

/** What a key unlocks right now. `subs` are the customer's subscriptions tagged with this key; `unpaidSince` is
    when the oldest unpaid invoice on them was finalised (ms), if any. */
export function decide(o: { key: string; customer: Customer | null; subs: Subscription[]; unpaidSince?: number | null; now: number }): Payload {
  const base = { v: 1 as const, key: o.key, checked_at: iso(o.now), valid_until: iso(o.now + VALID_DAYS * DAY) };
  const c = o.customer;
  if (!c || c.deleted || c.metadata?.nb_license !== o.key) {
    return { ...base, status: 'unknown', apps: [], business: '', reason: 'That license key isn’t recognised. If you just paid, give it a minute and try again; otherwise check the key or contact Northbound Studio.' };
  }
  const md = c.metadata;
  const business = String(md.nb_business || c.name || '').slice(0, 120);
  const apps = parseApps(md.nb_apps) ?? [];
  const off = (reason?: string): Payload => ({ ...base, status: 'revoked', apps: [], business, ...(reason ? { reason } : {}) });
  if (md.nb_license_status === 'revoked') return off(md.nb_license_reason || undefined);

  const subs = [...o.subs].sort((a, b) => (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0));
  const best = subs[0];
  if (best) {
    const rank = RANK[best.status] ?? 0;
    if (rank === 4) return { ...base, status: 'active', apps, business };
    if (rank === 3) {
      const since = o.unpaidSince ?? o.now;
      const pauseAt = since + PAUSE_AFTER_DAYS * DAY;
      if (o.now >= pauseAt) return off('Your Northbound payment is more than 14 days overdue, so your automations are paused. Update your card under Manage my plan to turn them back on.');
      return { ...base, status: 'past_due', apps, business, valid_until: iso(Math.min(o.now + VALID_DAYS * DAY, pauseAt)) };
    }
    if (rank === 2) return off('Your first Northbound payment hasn’t gone through yet. Once it does, your automations switch on.');
    return off(); // canceled, paused or expired: the app's own "isn't active" message
  }

  // No subscription: a trial or a comp Colin issued by hand.
  if (md.nb_license_status !== 'active') return off();
  const until = Date.parse(md.nb_license_until ?? '');
  if (Number.isFinite(until)) {
    if (until <= o.now) return off(`This license key ran out on ${day(until)}. Contact Northbound Studio to keep your automations on.`);
    return { ...base, status: 'active', apps, business, valid_until: iso(Math.min(o.now + VALID_DAYS * DAY, until)) };
  }
  return { ...base, status: 'active', apps, business };
}

/* ---- Stripe ---------------------------------------------------------------------------------------------------- */

export class StripeError extends Error { constructor(msg: string, public status: number, public code: string) { super(msg); } }

/** Stripe's REST API with the site's key. Its error text can quote part of a key, so only the code is passed on. */
export async function stripe(path: string, body?: Record<string, string>): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError('STRIPE_SECRET_KEY is not set', 503, 'not_configured');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? new URLSearchParams(body).toString() : undefined,
    signal: AbortSignal.timeout(9000),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const code = String(data?.error?.code || data?.error?.type || 'error');
    throw new StripeError(`Stripe ${res.status}: ${code}${data?.error?.param ? ` (${data.error.param})` : ''}`, res.status, code);
  }
  return data;
}

/** The customer holding this key (the key is checked against KEY_RE first, so it can't break out of the query). */
export async function findCustomer(key: string): Promise<Customer | null> {
  if (!KEY_RE.test(key)) return null;
  const q = encodeURIComponent(`metadata['nb_license']:'${key}'`);
  const r = await stripe(`customers/search?query=${q}&limit=3`);
  return ((r.data ?? []) as Customer[]).find((c) => !c.deleted && c.metadata?.nb_license === key) ?? null;
}

/** The customer's subscriptions for this key, and since when they've owed money. */
export async function subscriptionsFor(customer: Customer, key: string): Promise<{ subs: Subscription[]; unpaidSince: number | null }> {
  const r = await stripe(`subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=30&expand[]=data.latest_invoice`);
  const subs = ((r.data ?? []) as Subscription[]).filter((s) => s.metadata?.nb_license === key);
  const owing = subs
    .filter((s) => s.status === 'past_due' || s.status === 'unpaid')
    .map((s) => s.latest_invoice)
    .filter((i): i is Invoice => !!i && typeof i === 'object' && i.status === 'open')
    .map((i) => 1000 * Number(i.status_transitions?.finalized_at ?? i.created ?? 0))
    .filter((t) => t > 0);
  return { subs, unpaidSince: owing.length ? Math.min(...owing) : null };
}

/** Remember which Macs use a key (the last 10), so a shared key shows up in `show`. Never blocks the answer. */
export async function noteDevice(c: Customer, device: string): Promise<void> {
  if (!/^[A-Za-z0-9-]{8,40}$/.test(device)) return;
  const list = String(c.metadata.nb_devices ?? '').split(',').filter(Boolean);
  if (list.includes(device)) return;
  try { await stripe(`customers/${encodeURIComponent(c.id)}`, { 'metadata[nb_devices]': [...list, device].slice(-10).join(',') }); }
  catch (e) { console.error('[license] could not note the device', e instanceof Error ? e.message : e); }
}

/** The whole check behind api/license.ts. */
export async function check(key: string, device = '', now = Date.now()) {
  const customer = await findCustomer(key);
  const { subs, unpaidSince } = customer ? await subscriptionsFor(customer, key) : { subs: [], unpaidSince: null };
  if (customer && device) await noteDevice(customer, device);
  return { payload: decide({ key, customer, subs, unpaidSince, now }), customer, subs };
}

/** A Stripe billing-portal link for the key's customer (update the card, cancel), on a portal set up for Northbound. */
export async function portalUrl(customerId: string): Promise<string> {
  const body = { customer: customerId, return_url: PLAN_URL };
  try {
    return (await stripe('billing_portal/sessions', body)).url;
  } catch (e) {
    if (!(e instanceof StripeError) || e.status !== 400) throw e;
    // No default portal in live mode yet: use (or make once) Northbound's own configuration.
    const list = await stripe('billing_portal/configurations?active=true&limit=20');
    let conf = ((list.data ?? []) as { id: string; metadata?: Record<string, string> }[]).find((x) => x.metadata?.nb === 'license');
    if (!conf) {
      conf = await stripe('billing_portal/configurations', {
        'business_profile[headline]': 'Northbound Studio: your automations plan',
        default_return_url: PLAN_URL,
        'features[payment_method_update][enabled]': 'true',
        'features[invoice_history][enabled]': 'true',
        'features[subscription_cancel][enabled]': 'true',
        'features[subscription_cancel][mode]': 'at_period_end',
        'metadata[nb]': 'license',
      });
    }
    return (await stripe('billing_portal/sessions', { ...body, configuration: conf!.id })).url;
  }
}

/* ---- email (Resend, the same way the rest of the site sends) ----------------------------------------------------- */

const FALLBACK_FROM = 'Northbound Studio <quotes@northbound-dev.com>';
export async function email(msg: { to: string; subject: string; text: string; reply_to?: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.QUOTE_FROM || FALLBACK_FROM, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.reply_to ? { reply_to: msg.reply_to } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return res.ok && data.id ? { ok: true, id: data.id } : { ok: false, error: `${res.status} ${data.message ?? 'no message'}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const appList = (apps: string[]) => (apps.includes('all') ? 'every Northbound automation' : apps.join(', '));

export function keyEmail(o: { name: string; key: string; apps: string[] }): string {
  const first = o.name.split(/\s+/)[0] || 'there';
  const download = process.env.NB_APP_DOWNLOAD_URL;
  return [
    `Hi ${first},`,
    '',
    'Thank you, your Northbound plan is on. Here is your license key:',
    '',
    `    ${o.key}`,
    '',
    `It unlocks ${appList(o.apps)}.`,
    '',
    download
      ? `To start: download the Northbound app (${download}), open it, and paste the key in. Your automations switch on straight away.`
      : 'To start: open the Northbound app and paste the key in. If you don’t have the app yet, Colin will send it to you and help you set it up today.',
    '',
    'Keep this email: the key is how the app knows your plan. To update your card or cancel, open the app and choose Manage my plan.',
    '',
    'Questions? Just reply to this email.',
    '',
    'Northbound Studio',
    'Grand Ledge, Michigan',
  ].join('\n');
}

/* ---- a paid checkout makes the key (called by api/stripe-webhook.ts) ------------------------------------------- */

/** checkout.session.completed for a session whose metadata says nb_kind=automations. Idempotent: a retried event
    keeps the key already made and doesn't email twice. Returns the HTTP status for Stripe. */
export async function issueFromCheckout(session: Record<string, any>): Promise<{ status: number; key?: string }> {
  const md = (session.metadata ?? {}) as Record<string, string>;
  const sessionId = String(session.id ?? '');
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!customerId) {
    console.error('[license] automations checkout without a customer; no key made', { session: sessionId });
    return { status: 200 };
  }
  const customer = (await stripe(`customers/${encodeURIComponent(customerId)}`)) as Customer;
  if (customer.metadata?.nb_key_sent === sessionId) return { status: 200, key: customer.metadata.nb_license }; // a retry: done already
  const key = KEY_RE.test(customer.metadata?.nb_license ?? '') ? customer.metadata.nb_license : newKey();
  const apps = parseApps(md.nb_apps) ?? ['all'];
  const to = String(session.customer_details?.email || customer.email || md.nb_email || '');
  const name = String(session.customer_details?.name || customer.name || '');
  const business = String(md.nb_business || name || to).slice(0, 120);
  const tags = { 'metadata[nb_kind]': 'automations', 'metadata[nb_license]': key, 'metadata[nb_apps]': apps.join(','), 'metadata[nb_business]': business };
  await stripe(`customers/${encodeURIComponent(customerId)}`, tags);
  if (subId) await stripe(`subscriptions/${encodeURIComponent(subId)}`, tags);

  const studioTo = process.env.QUOTE_TO;
  if (!process.env.RESEND_API_KEY || !studioTo) {
    console.error('[license] key made but RESEND_API_KEY or QUOTE_TO is not set; nothing emailed', { session: sessionId, customer: customerId });
    return { status: 503, key };
  }
  const studio = await email({
    to: studioTo,
    reply_to: to || undefined,
    subject: `New automations plan: ${business}`.slice(0, 180),
    text: [`Business:  ${business}`, `Email:     ${to}`, `Unlocks:   ${appList(apps)}`, `Key:       ${key}`, '', `Stripe customer: ${customerId}`, `Subscription:    ${subId ?? '(none)'}`, `Session:         ${sessionId}`, '', 'The key was emailed to the customer.'].join('\n'),
  });
  if (!studio.ok) {
    console.error('[license] studio email failed; Stripe will retry', studio.error, { session: sessionId });
    return { status: 502, key };
  }
  if (to) {
    const sent = await email({ to, reply_to: studioTo, subject: 'Your Northbound license key', text: keyEmail({ name, key, apps }) });
    if (!sent.ok) {
      console.error('[license] key email to the customer failed (the studio has the key)', sent.error, { session: sessionId });
      return { status: 200, key };
    }
  }
  await stripe(`customers/${encodeURIComponent(customerId)}`, { 'metadata[nb_key_sent]': sessionId }).catch(() => {});
  console.log('[license] key issued', { session: sessionId, customer: customerId });
  return { status: 200, key };
}
