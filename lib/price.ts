/* lib/price.ts — the one place a price comes from.
 *
 * data/price.json is the single source of truth. The pricing engine
 * (Plans/pricing-engine.md) rewrites that file each Monday; nothing else in
 * the repo carries a price. Every server path that charges, quotes or emails
 * a number reads it through offer() below, and checkout.html fetches the same
 * file to show it. A price posted from a browser is never read.
 *
 * Read with fs rather than imported, so the same lines work under bun test
 * and on Vercel. On Vercel the functions are compiled to CommonJS (the
 * deploy does not ship package.json, so there is no "type": "module"), which
 * is why nothing here uses import.meta: the first deploy that did crashed
 * every function at load. The file is found from the working directory,
 * which is the repo root in tests and /var/task on Vercel, where
 * vercel.json's includeFiles puts data/price.json next to the code.
 * GET /api/price proves the read on any deploy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PriceConfig = { week: string; setup: number; care_monthly: number; deposit_ratio: number };

export type Offer = {
  week: string;
  /** Everything in cents. */
  setupCents: number;
  depositCents: number;
  balanceCents: number;
  careCents: number;
};

export const OFFER_NAME = 'The Northbound Site';
export const CARE_NAME = 'Care plan';

declare const __dirname: string | undefined;

function candidates(): string[] {
  const out = [join(process.cwd(), 'data', 'price.json')];
  if (typeof __dirname === 'string') out.push(join(__dirname, '..', 'data', 'price.json'));
  return out;
}

/** Throws if the file is missing or not a sane price. A checkout that cannot
    read its price must fail loudly, never charge a guess. */
export function validate(raw: unknown): PriceConfig {
  const c = raw as Partial<PriceConfig> | null;
  const ok =
    !!c &&
    typeof c.week === 'string' && /^\d{4}-W\d{2}$/.test(c.week) &&
    Number.isFinite(c.setup) && (c.setup as number) >= 300 && (c.setup as number) <= 20000 &&
    Number.isFinite(c.care_monthly) && (c.care_monthly as number) > 0 && (c.care_monthly as number) <= 1000 &&
    Number.isFinite(c.deposit_ratio) && (c.deposit_ratio as number) > 0 && (c.deposit_ratio as number) <= 1;
  if (!ok) throw new Error('data/price.json is missing a field or holds a value out of range');
  return c as PriceConfig;
}

export function readPrice(): PriceConfig {
  let last: unknown = null;
  for (const path of candidates()) {
    try {
      return validate(JSON.parse(readFileSync(path, 'utf8')));
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error('data/price.json could not be read');
}

/** The offer in cents. The deposit is setup x deposit_ratio, rounded to the
    cent; the balance is whatever is left, so the two always add up. */
export function offerFrom(c: PriceConfig): Offer {
  const setupCents = Math.round(c.setup * 100);
  const depositCents = Math.round(setupCents * c.deposit_ratio);
  return {
    week: c.week,
    setupCents,
    depositCents,
    balanceCents: setupCents - depositCents,
    careCents: Math.round(c.care_monthly * 100),
  };
}

export function offer(): Offer {
  return offerFrom(readPrice());
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** One structured line per quote event, for the pricing engine. Stripe keeps
    the durable copy (the same fields ride in the Checkout Session's
    metadata); this line is the searchable trail in the function logs. */
export function logQuote(record: { event: 'quote_created' | 'quote_paid'; week: string; setup: number; session: string; outcome: 'open' | 'yes'; business?: string }): void {
  console.log(`[quote-log] ${JSON.stringify({ ...record, at: new Date().toISOString() })}`);
}
