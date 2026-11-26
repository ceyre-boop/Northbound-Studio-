/* lib/guard.ts — limits on the public endpoints, so a script can't run up a bill or use our domain to spam.
 *
 * The failure this exists for: `for i in 1..10000: POST /api/quote` with someone else's email address. Before
 * this, each one sent a Northbound-signed email to that address (with the attacker's text in it) and another to
 * the studio inbox: a spam cannon on a DKIM-verified domain, and Resend suspends accounts for that.
 *
 * What it does:
 *   - per client IP: a few form posts per window (a person sends one form, maybe two);
 *   - per recipient: at most one courtesy email a day to the same address;
 *   - per instance: a ceiling on courtesy emails an hour, whatever the source.
 * Counters live in the function instance's memory. Vercel reuses warm instances, so this stops a single script
 * cold, but a spread-out attack can reach several instances. The Vercel Firewall rate-limit rules in
 * Plans/security.md are the layer that holds across instances; these stay as the floor.
 *
 * The client IP is Vercel's own x-real-ip (Vercel sets it and a client can't), else the first x-forwarded-for.
 */
const hits = new Map<string, number[]>();
const MAX_KEYS = 20_000;

export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** True (and nothing counted) when `id` has used `max` in the last `windowMs`; otherwise counts one use. */
export function overLimit(bucket: string, id: string, max: number, windowMs: number, now = Date.now()): boolean {
  const key = `${bucket}\u0000${id.toLowerCase()}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return true; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) for (const k of [...hits.keys()].slice(0, MAX_KEYS / 4)) hits.delete(k); // oldest first
  return false;
}

/** How many uses `id` has in the window, without counting one. */
export function usesIn(bucket: string, id: string, windowMs: number, now = Date.now()): number {
  return (hits.get(`${bucket}\u0000${id.toLowerCase()}`) ?? []).filter((t) => now - t < windowMs).length;
}

/** For tests. */
export function resetLimits(): void { hits.clear(); }

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** A public form post (quote, account, checkout): 5 per 10 minutes and 20 a day per IP. */
export function formLimited(request: Request, form: string): boolean {
  const ip = clientIp(request);
  return overLimit(`${form}:10m`, ip, 5, 10 * MIN) || overLimit(`${form}:day`, ip, 20, DAY);
}

/** May we send a courtesy email to this address now? One a day per address, 60 an hour per instance. */
export function courtesyAllowed(email: string): boolean {
  if (overLimit('courtesy:to', email.trim(), 1, DAY)) return false;
  return !overLimit('courtesy:all', 'all', 60, HOUR);
}

/** A first name that is safe to put in an email we send to an address a stranger typed: letters only, short.
    Anything else (a URL, a sentence, digits) becomes "there", so the email can't carry someone else's message. */
export function safeFirstName(name: string): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}][\p{L}'’-]{0,29}$/u.test(first) ? first : 'there';
}
