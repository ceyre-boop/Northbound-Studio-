/* api/license.ts — the Northbound launcher asks here what its license key unlocks.
 *
 *   POST {"key":"NB-XXXXX-XXXXX-XXXXX-XXXXX","device":"<the Mac's random id>"}
 *     200 {"license":"<base64url JSON>","sig":"<Ed25519 signature>"}  (see lib/license.ts for what it says and why)
 *   POST {"key":…,"device":…,"action":"portal"}
 *     200 {"url":"https://billing.stripe.com/…"}  the customer's own Stripe billing page: update the card, cancel
 *
 * A key nobody holds gets a signed "unknown", not an error, so the app can say so plainly. Keys are 100 random
 * bits, so guessing one isn't a practical attack. Nothing here changes what a key unlocks; that's Stripe's
 * subscription status and api/license-admin.ts.
 *
 * Env: NB_LICENSE_SIGNING_KEY, STRIPE_SECRET_KEY.
 */
import { KEY_RE, check, findCustomer, normaliseKey, portalUrl, signLicense } from '../lib/license.js';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  const seed = process.env.NB_LICENSE_SIGNING_KEY;
  if (!seed || !process.env.STRIPE_SECRET_KEY) {
    console.error('[license] NB_LICENSE_SIGNING_KEY or STRIPE_SECRET_KEY is not set');
    return json({ error: 'The license server isn’t set up yet.' }, 503);
  }
  let body: { key?: unknown; device?: unknown; action?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const key = normaliseKey(body?.key);
  if (!KEY_RE.test(key)) return json({ error: 'License keys look like NB-XXXXX-XXXXX-XXXXX-XXXXX.' }, 400);
  const device = typeof body.device === 'string' ? body.device.slice(0, 40) : '';
  try {
    if (body.action === 'portal') {
      const c = await findCustomer(key);
      if (!c) return json({ error: 'That license key isn’t recognised.' }, 404);
      return json({ url: await portalUrl(c.id) });
    }
    const { payload } = await check(key, device);
    console.log('[license] checked', { status: payload.status, device: device.slice(0, 8) });
    return json(signLicense(payload, seed));
  } catch (e) {
    console.error('[license] check failed', e instanceof Error ? e.message : e);
    return json({ error: 'The license server couldn’t check that key right now. Try again in a minute.' }, 502);
  }
}

export function GET(): Response {
  return json({ error: 'POST a license key.' }, 405);
}
