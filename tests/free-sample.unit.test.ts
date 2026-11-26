// bun test tests/free-sample.unit.test.ts
// The free-sample page (free.html) posts package=sample with only a business and an email.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const sent: any[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  sent.length = 0;
  process.env.RESEND_API_KEY = 're_test'; process.env.QUOTE_TO = 'studio@example.test';
  globalThis.fetch = (async (_u: any, init: any) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'e_1' }), { status: 200 }); }) as any;
});
afterEach(() => { globalThis.fetch = realFetch; });
const mod: any = await import('../api/quote.ts');
const handler = mod.default?.fetch ?? mod.POST ?? mod.default;
const post = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields);
  return handler(new Request('https://northbound-dev.com/api/quote', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', referer: 'https://northbound-dev.com/free' }, body }));
};

test('a free sample needs only the business and an email, and tells the studio which sample', async () => {
  const r = await post({ package: 'sample', business: 'Ridge Roofing', email: 'owner@ridge.test', need: 'FREE SAMPLE requested: Lead Catcher.', sample: 'lead-catcher' });
  expect(r.status).toBeLessThan(400);
  expect(sent[0].text).toContain('A FREE SAMPLE');
  expect(sent[0].text).toContain('Lead Catcher');
  expect(sent[1].text).toContain('free sample');
  expect(sent[1].text).not.toMatch(/\$\d/);
});

test('a free sample without an email, or without a business, is refused; the normal form still needs a phone', async () => {
  expect((await post({ package: 'sample', business: 'Ridge Roofing', email: 'nope' })).status).toBeGreaterThanOrEqual(400);
  expect((await post({ package: 'sample', business: '', email: 'a@b.test' })).status).toBeGreaterThanOrEqual(400);
  expect((await post({ package: '', name: 'Sam', email: 'a@b.test', need: 'x' })).status).toBeGreaterThanOrEqual(400);
  expect(sent.length).toBe(0);
});

test('the page offers every automation, posts to the quote route as a sample, and /free reaches it', () => {
  const html = readFileSync('free.html', 'utf8');
  for (const id of ['lead-catcher', 'ai-receptionist', 'appointment-reminders', 'invoice-chaser', 'quote-builder', 'inbox-autopilot', 'post-everywhere', 'owner-dashboard', 'data-entry']) expect(html).toContain(`'${id}'`);
  expect(html).toContain('action="/api/quote"');
  expect(html).toContain('name="package" value="sample"');
  expect(html).not.toMatch(/\$\d/);
  expect(readFileSync('vercel.json', 'utf8')).toContain('"source": "/free"');
});
