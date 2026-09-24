/* tests/checkout.unit.test.ts — api/checkout.ts pricing, unit-tested directly.
 *
 * bun:test, not Playwright: no server, no browser. global.fetch is mocked so
 * POST() never makes a real Resend call; each test inspects what it *would*
 * have sent (the request body handed to fetch) rather than a rendered page.
 * Run explicitly — `bun test tests/checkout.unit.test.ts` — because the repo's
 * Playwright specs also match *.spec.ts and bun's own test runner cannot run
 * those. Mirrors api/quote.ts's own honeypot/JSON/validation conventions.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GOOGLE_REVIEW_URL, POST } from '../api/checkout.ts';
import { GOOGLE_REVIEW_URL as BROWSER_REVIEW_URL } from '../js/config.js';

const ENV_KEY = 'RESEND_API_KEY';
const ENV_TO = 'QUOTE_TO';

function baseFields(): Record<string, string> {
  return {
    name: 'Jamie Rivera',
    business: 'Rivera Roofing',
    phone: '5551234567',
    email: 'jamie@example.com',
  };
}

function post(fields: Record<string, string>, opts: { json?: boolean } = {}): Promise<Response> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const headers: Record<string, string> = {};
  if (opts.json !== false) headers['accept'] = 'application/json';
  const request = new Request('http://localhost/api/checkout', {
    method: 'POST',
    body: form,
    headers,
  });
  return POST(request);
}

let sentEmails: Record<string, unknown>[] = [];

beforeEach(() => {
  process.env[ENV_KEY] = 'test-key';
  process.env[ENV_TO] = 'studio@example.com';
  sentEmails = [];
  // @ts-expect-error — test double, not the real fetch signature
  global.fetch = mock(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    sentEmails.push(body);
    return {
      ok: true,
      json: async () => ({ id: `email_${sentEmails.length}` }),
    } as Response;
  });
});

afterEach(() => {
  delete process.env[ENV_KEY];
  delete process.env[ENV_TO];
});

describe('founding Beacon and Engine amounts', () => {
  test('Beacon: 50% deposit of the founding price ($875.00 of $1,750)', async () => {
    const res = await post({ ...baseFields(), buy: 'beacon', review_name: 'Jamie R.' });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('$875.00 once');
    expect(notif).toContain('Due today: $875.00');
    expect(notif).toContain('founding price $1,750');
    expect(notif).toContain('standard $3,500');
  });

  test('Engine: 50% deposit of the founding price ($2,125.00 of $4,250)', async () => {
    const res = await post({ ...baseFields(), buy: 'engine', review_name: 'Jamie R.' });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('$2,125.00 once');
    expect(notif).toContain('Due today: $2,125.00');
    expect(notif).toContain('founding price $4,250');
    expect(notif).toContain('standard $8,500');
  });

  test('the review name is carried into both emails, with the manual check said plainly', async () => {
    await post({ ...baseFields(), buy: 'beacon', review_name: '  Jamie R.  ' });
    const notif = sentEmails[0].text as string;
    const conf = sentEmails[1].text as string;
    expect(notif).toContain('Founding review: posted under "Jamie R."');
    expect(notif).toContain('look it up on Google before finalising');
    expect(conf).toContain('posted under "Jamie R."');
    expect(conf).toContain('we check it ourselves before finalising');
    expect(conf).toContain(GOOGLE_REVIEW_URL);
    for (const text of [notif, conf]) {
      expect(text).not.toMatch(/isn't live|nothing to review|verified automatically/i);
    }
  });

  test('Cheap and Clean alone says nothing about a review', async () => {
    await post({ ...baseFields(), buy: 'clean' });
    for (const email of sentEmails) expect(email.text as string).not.toContain('Founding review');
  });
});

/* One URL, written in four places on purpose (the pages need a plain href
   for JavaScript-off), and this is what stops them drifting apart. */
describe('GOOGLE_REVIEW_URL', () => {
  const ROOT = join(import.meta.dir, '..');
  test('the server and the browser hold the same string', () => {
    expect(GOOGLE_REVIEW_URL).toBe(BROWSER_REVIEW_URL);
    expect(GOOGLE_REVIEW_URL).toBe('https://www.google.com/maps/search/?api=1&query=NorthBound+website+designer+Swartz+Creek+MI');
  });

  for (const page of ['index.html', 'checkout.html', 'build.html']) {
    test(`${page}'s "Leave your Google review" link is that URL, in a new tab`, () => {
      const html = readFileSync(join(ROOT, page), 'utf8');
      const links = Array.from(html.matchAll(/<a\s+([^>]*)>Leave your Google review<\/a>/g)).map((m) => m[1]);
      expect(links.length).toBe(1);
      const href = links[0].match(/href="([^"]+)"/)![1].replace(/&amp;/g, '&');
      expect(href).toBe(GOOGLE_REVIEW_URL);
      expect(links[0]).toContain('target="_blank"');
      expect(links[0]).toContain('rel="noopener"');
      expect(html).toContain('name="review_name"');
      expect(html).not.toMatch(/isn't live yet|nothing to review today/);
    });
  }
});

describe('Bearing — both founding term variants', () => {
  test('12-month commitment: $300/mo, locked for all twelve months', async () => {
    const res = await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: '12',
      review_name: 'Jamie R.',
    });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('12-month commitment');
    expect(notif).toContain('$300.00/mo');
    expect(notif).toContain('Then: $300.00/mo, starting next month');
    expect(notif).not.toContain('$600.00/mo');
  });

  test('month-to-month: $300 the first month, then $600/mo after', async () => {
    const res = await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: 'mtm',
      review_name: 'Jamie R.',
    });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('month-to-month');
    expect(notif).toContain('$300.00/mo (then $600/mo after)');
  });

  test('due today never includes the monthly Bearing charge', async () => {
    await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: '12',
      review_name: 'Jamie R.',
    });
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Due today: $600.00');
  });
});

describe('refusals', () => {
  test('refuses founding pricing without the review name — Beacon', async () => {
    const res = await post({ ...baseFields(), buy: 'beacon' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/name your Google review is posted under/i);
    expect(sentEmails.length).toBe(0);
  });

  test('refuses founding pricing without the review name — Bearing', async () => {
    const res = await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: '12',
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/name your Google review is posted under/i);
    expect(sentEmails.length).toBe(0);
  });

  test('a review name that is only whitespace is absent, and the old checkbox no longer counts', async () => {
    const blank = await post({ ...baseFields(), buy: 'engine', review_name: '   ' });
    expect(blank.status).toBe(422);
    const checkbox = await post({ ...baseFields(), buy: 'engine', founding_agree: 'yes' });
    expect(checkbox.status).toBe(422);
    expect(sentEmails.length).toBe(0);
  });

  test('Cheap and Clean alone never requires the review name', async () => {
    const res = await post({ ...baseFields(), buy: 'clean' });
    expect(res.status).toBe(200);
  });

  test('refuses a Bearing checkbox with no recognised term', async () => {
    const res = await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: 'quarterly',
      review_name: 'Jamie R.',
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/term/i);
  });

  test('refuses a buy value that is not in the price table', async () => {
    const res = await post({ ...baseFields(), buy: 'platinum' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/don't recognise/i);
  });

  test('refuses posting an add-on key directly as `buy` — bearing_12 is not a buyable item', async () => {
    const res = await post({ ...baseFields(), buy: 'bearing_12' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(sentEmails.length).toBe(0);
  });
});

describe('honeypot', () => {
  test('a filled honeypot is answered like a success and nothing is sent', async () => {
    const res = await post({ ...baseFields(), buy: 'clean', nb_hp_7: 'I am a bot' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(sentEmails.length).toBe(0);
  });
});

/* The guided build's `spec` field: descriptive only, never priced. */
describe('the guided build, carried in `spec`', () => {
  const ROOFER = '1tc33ny5e.Rivera%20Roofing';

  test('Engine: both emails say $2,125 now and $2,125 on delivery, in those words', async () => {
    const res = await post({ ...baseFields(), buy: 'engine', review_name: 'Jamie R.', spec: ROOFER });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    const conf = sentEmails[1].text as string;
    for (const text of [notif, conf]) {
      expect(text).toContain('Due today: $2,125.00');
      expect(text).toContain('On delivery: $2,125.00 (the balance)');
      expect(text).toContain('$2,125.00 now, $2,125.00 on delivery — 50% up front, always. No deposit, no work.');
    }
  });

  test('Beacon: $875 now, $875 on delivery', async () => {
    await post({ ...baseFields(), buy: 'beacon', review_name: 'Jamie R.' });
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Due today: $875.00');
    expect(notif).toContain('On delivery: $875.00 (the balance)');
    expect(notif).toContain('$875.00 now, $875.00 on delivery');
  });

  test('Cheap and Clean is the whole price now, with no balance line', async () => {
    await post({ ...baseFields(), buy: 'clean' });
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Payment: $600.00 now, in full.');
    expect(notif).not.toContain('On delivery');
  });

  test('the build is described, part by part, in both emails', async () => {
    await post({ ...baseFields(), buy: 'engine', review_name: 'Jamie R.', spec: ROOFER });
    for (const email of sentEmails) {
      const text = email.text as string;
      expect(text).toContain('Their build (from build.html):');
      expect(text).toContain('Business:   Rivera Roofing — Trades & home services');
      expect(text).toContain('Today:      They call me');
      expect(text).toContain('Wants more: Booked jobs, Quote requests');
      expect(text).toContain('Worth:      $1,000–$5,000 per customer');
      expect(text).toContain('Nights:     Nobody — it waits until morning');
      expect(text).toContain('Running it: Keep it running for me');
      expect(text).toContain('Look:       Industrial');
      expect(text).toContain('Parts:      A custom site, Booking flow, Quote flow, Payments, Lead capture, Automated follow-up, Reminders, Review requests');
    }
  });

  test('a package the answers did not point at is noted, with what falls out', async () => {
    // Same roofer, but they chose Beacon on the sheet (code ends in b).
    await post({ ...baseFields(), buy: 'beacon', review_name: 'Jamie R.', spec: '1tc33ny5b.Rivera%20Roofing' });
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Parts:      A custom site');
    expect(notif).toContain('Not in package: Booking flow, Quote flow, Payments, Lead capture, Automated follow-up, Reminders, Review requests');
    expect(notif).toContain('(Their answers pointed at engine; they chose beacon.)');
  });

  test('the spec never changes the price: an Engine code on a Cheap and Clean order is still $600', async () => {
    const res = await post({ ...baseFields(), buy: 'clean', spec: ROOFER });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Due today: $600.00');
    expect(notif).not.toContain('$2,125');
    expect(notif).toContain('Their build (from build.html):');
  });

  test('Bearing chosen in the build is recorded, not charged today', async () => {
    await post({ ...baseFields(), buy: 'engine', review_name: 'Jamie R.', bearing: '1', bearing_term: '12', spec: ROOFER });
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Due today: $2,125.00');
    expect(notif).toContain('Bearing — 12-month commitment (founding price) — $300.00/mo');
    expect(notif).toContain('Then: $300.00/mo, starting next month');
  });

  test('a spec that cannot be read is ignored, and the order still goes through', async () => {
    const res = await post({ ...baseFields(), buy: 'clean', spec: 'not-a-code' });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).not.toContain('Their build');
  });

  test('a spec is capped, so nobody can post a novel into the inbox', async () => {
    const res = await post({ ...baseFields(), buy: 'clean', spec: '1tc33ny5e.' + 'A'.repeat(5000) });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Their build (from build.html):');
    expect(notif.length).toBeLessThan(2000);
  });
});
