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
import { POST } from '../api/checkout.ts';

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
    const res = await post({ ...baseFields(), buy: 'beacon', founding_agree: 'yes' });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('$875.00 once');
    expect(notif).toContain('Due today: $875.00');
    expect(notif).toContain('founding price $1,750');
    expect(notif).toContain('standard $3,500');
  });

  test('Engine: 50% deposit of the founding price ($2,125.00 of $4,250)', async () => {
    const res = await post({ ...baseFields(), buy: 'engine', founding_agree: 'yes' });
    expect(res.status).toBe(200);
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('$2,125.00 once');
    expect(notif).toContain('Due today: $2,125.00');
    expect(notif).toContain('founding price $4,250');
    expect(notif).toContain('standard $8,500');
  });

  test('the founding agreement is recorded in the notification email', async () => {
    await post({ ...baseFields(), buy: 'beacon', founding_agree: 'yes' });
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Founding agreement: confirmed');
  });
});

describe('Bearing — both founding term variants', () => {
  test('12-month commitment: $300/mo, locked for all twelve months', async () => {
    const res = await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: '12',
      founding_agree: 'yes',
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
      founding_agree: 'yes',
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
      founding_agree: 'yes',
    });
    const notif = sentEmails[0].text as string;
    expect(notif).toContain('Due today: $600.00');
  });
});

describe('refusals', () => {
  test('refuses founding pricing without the agreement checkbox — Beacon', async () => {
    const res = await post({ ...baseFields(), buy: 'beacon' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/early client/i);
    expect(sentEmails.length).toBe(0);
  });

  test('refuses founding pricing without the agreement checkbox — Bearing', async () => {
    const res = await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: '12',
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/early client/i);
    expect(sentEmails.length).toBe(0);
  });

  test('Cheap and Clean alone never requires the founding agreement', async () => {
    const res = await post({ ...baseFields(), buy: 'clean' });
    expect(res.status).toBe(200);
  });

  test('refuses a Bearing checkbox with no recognised term', async () => {
    const res = await post({
      ...baseFields(),
      buy: 'clean',
      bearing: '1',
      bearing_term: 'quarterly',
      founding_agree: 'yes',
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
