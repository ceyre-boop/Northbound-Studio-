/* api/price.ts — proves the server can read the price it charges.
 *
 * GET returns the same public numbers as /data/price.json, but read the way
 * api/checkout.ts reads them (lib/price.ts, from inside a function). If the
 * file ever fails to ship with the functions, this answers 503 and checkout
 * would too, so a deploy can be checked without placing an order.
 */
import { offer } from '../lib/price.js';

export async function GET(): Promise<Response> {
  try {
    const p = offer();
    return Response.json({ ok: true, week: p.week, setup: p.setupCents / 100, deposit: p.depositCents / 100, balance: p.balanceCents / 100, care_monthly: p.careCents / 100 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[price] config unreadable', err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 503 });
  }
}
