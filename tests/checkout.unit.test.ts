/* tests/checkout.unit.test.ts — the one offer, priced from data/price.json.
 *
 * bun:test, not Playwright: no server, no browser. global.fetch is mocked so
 * POST() never makes a real Resend or Stripe call; each test inspects what it
 * *would* have sent. Run with `bun run test:unit`.
 *
 * What these pin (Plans/builds/00-remove-prices.md):
 *   - every amount is computed from data/price.json, and nothing a browser
 *     posts can change it;
 *   - the retired tiers are refused, not quietly sold as something else;
 *   - the quote and account emails take their numbers from the same file,
 *     and the customer-facing quote reply states no price at all.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POST, decodeSpec, specLines, specParts } from '../api/checkout.ts';
import { POST as quotePOST } from '../api/quote.ts';
import { POST as accountPOST } from '../api/account.ts';
import { offer, offerFrom, validate, money } from '../lib/price.ts';

const ROOT = join(import.meta.dir, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'data/price.json'), 'utf8'));
const P = offer();

function baseFields(): Record<string, string> {
  return { buy: 'site', name: 'Jamie Rivera', business: 'Rivera Roofing', phone: '5551234567', email: 'jamie@example.com' };
}

function request(path: string, fields: Record<string, string>, json = true): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request(`http://localhost${path}`, { method: 'POST', body: form, headers: json ? { accept: 'application/json' } : {} });
}
const post = (fields: Record<string, string>, json = true) => POST(request('/api/checkout', fields, json));

let sent: { to: string[]; subject: string; text: string; reply_to?: string }[] = [];

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.QUOTE_TO = 'studio@example.com';
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  sent = [];
  // @ts-expect-error — test double, not the real fetch signature
  global.fetch = mock(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ id: `email_${sent.length}` }) } as Response;
  });
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.QUOTE_TO;
});

describe('data/price.json is the single source of truth', () => {
  test('the file holds the four fields and nothing below the floor', () => {
    expect(Object.keys(CONFIG).sort()).toEqual(['care_monthly', 'deposit_ratio', 'setup', 'week']);
    expect(CONFIG.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(CONFIG.setup).toBeGreaterThanOrEqual(300);
    expect(CONFIG.care_monthly).toBe(49);
    expect(CONFIG.deposit_ratio).toBe(0.5);
  });

  test('the deposit is setup x deposit_ratio, and deposit + balance is always the setup price', () => {
    for (const setup of [300, 500, 750, 1000, 333]) {
      for (const ratio of [0.5, 0.25, 1 / 3, 1]) {
        const o = offerFrom({ week: '2026-W47', setup, care_monthly: 49, deposit_ratio: ratio });
        expect(o.setupCents).toBe(setup * 100);
        expect(o.depositCents).toBe(Math.round(setup * 100 * ratio));
        expect(o.depositCents + o.balanceCents).toBe(o.setupCents);
        expect(Number.isInteger(o.depositCents)).toBe(true);
      }
    }
    expect(offerFrom({ week: '2026-W47', setup: 500, care_monthly: 49, deposit_ratio: 0.5 })).toEqual({ week: '2026-W47', setupCents: 50000, depositCents: 25000, balanceCents: 25000, careCents: 4900 });
    expect(offerFrom({ week: '2026-W48', setup: 750, care_monthly: 49, deposit_ratio: 0.5 }).depositCents).toBe(37500);
    expect(offerFrom({ week: '2026-W49', setup: 300, care_monthly: 49, deposit_ratio: 0.5 }).depositCents).toBe(15000);
  });

  test('a broken or out-of-range config is refused rather than charged', () => {
    const good = { week: '2026-W47', setup: 500, care_monthly: 49, deposit_ratio: 0.5 };
    expect(() => validate(good)).not.toThrow();
    for (const bad of [
      null, {}, { ...good, setup: 299 }, { ...good, setup: '500' }, { ...good, setup: NaN }, { ...good, setup: 0 },
      { ...good, deposit_ratio: 0 }, { ...good, deposit_ratio: 1.5 }, { ...good, care_monthly: 0 }, { ...good, week: 'this week' }, { ...good, week: undefined },
    ]) expect(() => validate(bad)).toThrow();
  });

  test('no api file carries a price of its own', () => {
    for (const f of ['api/checkout.ts', 'api/quote.ts', 'api/account.ts', 'api/stripe-webhook.ts', 'lib/price.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      // Booleans, so a failure names the file instead of printing all of it.
      expect(/\$\d/.test(src), `${f} has a dollar figure`).toBe(false);
      expect(/\b(50000|25000|4900|87500|212500|30000)\b/.test(src), `${f} has a hardcoded amount in cents`).toBe(false);
      expect(/Beacon|Bearing|Cheap and Clean|FOUNDING|review_name/.test(src), `${f} still names a retired tier`).toBe(false);
    }
  });
});

describe('POST /api/checkout — the email path (Stripe not configured)', () => {
  test('a valid order sends two emails with the amounts from the config', async () => {
    const res = await post(baseFields());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(2);
    const [studio, customer] = sent;
    expect(studio.to).toEqual(['studio@example.com']);
    expect(studio.reply_to).toBe('jamie@example.com');
    expect(studio.subject).toBe('Order: The Northbound Site — Rivera Roofing');
    expect(studio.text).toContain(`The Northbound Site — ${money(P.setupCents)}`);
    expect(studio.text).toContain(`Care plan — ${money(P.careCents)}/mo, starting the day the site goes live`);
    expect(studio.text).toContain(`Due today: ${money(P.depositCents)}`);
    expect(studio.text).toContain(`At launch: ${money(P.balanceCents)} (the balance)`);
    expect(studio.text).toContain(`Price week: ${P.week}`);
    expect(customer.to).toEqual(['jamie@example.com']);
    expect(customer.text).toContain(`Due today: ${money(P.depositCents)}`);
    expect(customer.text).toContain('Nothing has been charged yet.');
    for (const e of sent) expect(e.text).not.toMatch(/founding|Bearing|Beacon|Google review/i);
  });

  test('an amount posted from the browser changes nothing', async () => {
    await post({ ...baseFields(), setup: '1', price: '1', amount: '1', deposit: '1', care: '1', care_monthly: '1', nb_due: '100', unit_amount: '100' });
    expect(sent[0].text).toContain(`Due today: ${money(P.depositCents)}`);
    expect(sent[0].text).toContain(`The Northbound Site — ${money(P.setupCents)}`);
    expect(sent[0].text).not.toContain('$1.00');
  });

  test('the retired tiers are refused, and nothing is sent', async () => {
    for (const buy of ['beacon', 'engine', 'bearing', 'bearing_12', 'anything']) {
      const res = await post({ ...baseFields(), buy });
      expect(res.status, buy).toBe(422);
      expect((await res.json()).error).toBe("We don't recognise what you're buying.");
    }
    expect(sent).toHaveLength(0);
  });

  test('a cached copy of the old page (buy=clean, or no buy at all) still orders the site', async () => {
    for (const buy of ['clean', '']) {
      sent = [];
      const res = await post({ ...baseFields(), buy });
      expect(res.status).toBe(200);
      expect(sent[0].text).toContain('The Northbound Site');
    }
  });

  test('each required field is asked for by name', async () => {
    const cases: [Record<string, string>, string][] = [
      [{ name: '' }, 'Please tell us your name.'],
      [{ business: '' }, 'Please tell us your business name.'],
      [{ phone: '12' }, 'Please leave a phone number we can call.'],
      [{ email: 'not-an-email' }, 'Please check your email address.'],
    ];
    for (const [over, message] of cases) {
      const res = await post({ ...baseFields(), ...over });
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe(message);
    }
    expect(sent).toHaveLength(0);
  });

  test('the honeypot answers like a success and delivers nothing', async () => {
    const res = await post({ ...baseFields(), nb_hp_7: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  test('a native post is redirected, so a refresh never re-sends the order', async () => {
    const res = await post(baseFields(), false);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/order-received.html');
  });

  test('a failed studio notification fails the submit; a failed confirmation does not', async () => {
    let call = 0;
    // @ts-expect-error — test double
    global.fetch = mock(async () => ({ ok: false, status: 500, json: async () => ({ message: 'down' }) }) as Response);
    expect((await post(baseFields())).status).toBe(502);
    // @ts-expect-error — test double
    global.fetch = mock(async () => (++call === 1 ? { ok: true, json: async () => ({ id: 'a' }) } : { ok: false, status: 500, json: async () => ({}) }) as Response);
    expect((await post(baseFields())).status).toBe(200);
  });

  test('with no inbox configured the visitor is told, not thanked', async () => {
    delete process.env.QUOTE_TO;
    expect((await post(baseFields())).status).toBe(503);
  });

  test('the optional "pause" answers reach the studio, and empty ones add nothing', async () => {
    await post({ ...baseFields(), why_not: 'I already have a Facebook page', benefit: 'More calls\non weekends' });
    expect(sent[0].text).toContain('In their words:');
    expect(sent[0].text).toContain('  Reasons they might not need us: I already have a Facebook page');
    expect(sent[0].text).toContain('  What it should bring them: More calls\n    on weekends');
    sent = [];
    await post(baseFields());
    expect(sent[0].text).not.toContain('In their words:');
  });
});

describe('the guided build code, in words', () => {
  test('answers are repeated in the email, and parts beyond the site are named as separate quotes', async () => {
    await post({ ...baseFields(), spec: '1tc33ny5e.Rivera%20Roofing' });
    expect(sent[0].text).toContain('Their answers (from build.html):');
    expect(sent[0].text).toContain('Business:   Rivera Roofing — Trades & home services');
    expect(sent[0].text).toContain('Worth:      1,000 to 5,000 dollars per customer');
    expect(sent[0].text).toContain('To quote separately: Booking flow');
    expect(sent[0].text).not.toContain('$1,000');
  });

  test('every package character decodes to the one site, including the retired ones', () => {
    for (const c of ['c', 'b', 'e']) expect(decodeSpec(`1tc33ny5${c}`)?.pkg).toBe('site');
    expect(decodeSpec('2005e')?.pkg).toBe('site');
    expect(decodeSpec('2005e')?.parts).toEqual(['A custom site', 'Booking flow']);
    expect(specLines(decodeSpec('2005e')!).join('\n')).toContain('To quote separately: Booking flow');
  });

  test('a code that is not one is ignored, never an error', async () => {
    for (const spec of ['', 'x', '1', '9tc33ny5e', '2zzzze', '1tc33ny5e.%E0%A4%A']) {
      sent = [];
      const res = await post({ ...baseFields(), spec });
      expect(res.status, spec).toBe(200);
    }
    expect(decodeSpec('nonsense')).toBeNull();
    expect(specParts(decodeSpec('1________')!)).toEqual(['A custom site']);
  });
});

describe('POST /api/quote', () => {
  const quote = (fields: Record<string, string>) => quotePOST(request('/api/quote', fields));
  const q = () => ({ name: 'Sam Ortiz', business: 'Ortiz Plumbing', phone: '5175550100', email: 'sam@example.com', need: 'Following up on quotes takes my whole Friday' });

  test('the visitor is never told a price; the studio is told this week\'s', async () => {
    const res = await quote({ ...q(), package: 'site' });
    expect(res.status).toBe(200);
    const [studio, reply] = sent;
    expect(studio.text).toContain('Asking about: The Northbound Site');
    expect(studio.text).toContain(`The Northbound Site: ${money(P.setupCents)} (${money(P.depositCents)} now, ${money(P.balanceCents)} at launch) + Care plan ${money(P.careCents)}/mo. Week ${P.week}.`);
    expect(reply.to).toEqual(['sam@example.com']);
    expect(reply.text).not.toMatch(/\$\d/);
    expect(reply.text).toContain('Following up on quotes takes my whole Friday');
  });

  test('an automation enquiry needs no package and no review name', async () => {
    const res = await quote(q());
    expect(res.status).toBe(200);
    expect(sent[0].text).toContain('Asking about: Not said (an automation, or not sure yet)');
    expect(sent[0].subject).toContain('Ortiz Plumbing');
  });

  test('the old package values no longer gate the form or reach the email as tiers', async () => {
    for (const pkg of ['beacon', 'engine', 'bearing']) {
      sent = [];
      const res = await quote({ ...q(), package: pkg });
      expect(res.status, pkg).toBe(200);
      for (const e of sent) expect(e.text).not.toMatch(/Beacon|Engine —|Bearing|founding/);
    }
  });
});

describe('POST /api/account', () => {
  const account = (fields: Record<string, string>) => accountPOST(request('/api/account', fields));
  const a = () => ({ name: 'Sam Ortiz', business: 'Ortiz Plumbing', phone: '5175550100', email: 'sam@example.com' });

  test('adding the care plan names the price from the config, in the emails only', async () => {
    const res = await account({ ...a(), want_care: '1' });
    expect(res.status).toBe(200);
    expect(sent[0].text).toContain(`Wants:     Care plan (${money(P.careCents)}/mo)`);
    expect(sent[1].text).toContain(`Care plan (${money(P.careCents)}/mo)`);
    expect(sent[1].text).toContain('Nothing has been charged.');
  });

  test('Bearing is not a thing you can ask for any more', async () => {
    const res = await account({ ...a(), want_bearing: '1', term: 'bearing_12' });
    expect(res.status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  test('dropping a plan carries no price', async () => {
    await account({ ...a(), want_cancel: '1' });
    expect(sent[0].text).toContain('Wants:     Drop a plan');
    expect(sent[0].text).not.toMatch(/\$\d/);
  });
});
