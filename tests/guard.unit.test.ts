/* tests/guard.unit.test.ts — "for i in 1..10000: POST /api/quote" gets nowhere (lib/guard.ts).
 *
 * bun:test, fetch mocked: no email leaves. What these pin:
 *   - a visitor's own text never goes into an email sent to the address they typed (no spam relay on our domain);
 *   - one IP can't post a form more than a few times, and one address gets at most one courtesy email a day;
 *   - the license endpoint refuses floods and key guessing before it asks Stripe anything;
 *   - the admin endpoint locks out an IP that keeps getting the token wrong.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { resetLimits, safeFirstName } from '../lib/guard.ts';
import { POST as quotePOST } from '../api/quote.ts';
import { POST as accountPOST } from '../api/account.ts';
import { POST as checkoutPOST } from '../api/checkout.ts';
import { POST as licensePOST } from '../api/license.ts';
import { POST as adminPOST } from '../api/license-admin.ts';

let sent: { to: string[]; subject: string; text: string }[] = [];
let stripeCalls = 0;
let quiet: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  resetLimits();
  sent = []; stripeCalls = 0;
  Object.assign(process.env, { RESEND_API_KEY: 'test-key', QUOTE_TO: 'studio@example.com', NB_LICENSE_SIGNING_KEY: Buffer.alloc(32, 7).toString('base64url'), NB_LICENSE_ADMIN_TOKEN: 'z'.repeat(40), STRIPE_SECRET_KEY: 'sk_test_fake' });
  delete process.env.STRIPE_WEBHOOK_SECRET; // checkout falls back to email capture, which is the path under test
  // @ts-expect-error test double
  global.fetch = mock(async (url: string, init: { body: string }) => {
    if (String(url).includes('api.stripe.com')) { stripeCalls++; return Response.json({ data: [] }); }
    sent.push(JSON.parse(init.body));
    return Response.json({ id: `email_${sent.length}` });
  });
  quiet = [spyOn(console, 'log').mockImplementation(() => {}), spyOn(console, 'warn').mockImplementation(() => {}), spyOn(console, 'error').mockImplementation(() => {})];
});
afterEach(() => { for (const q of quiet) q.mockRestore(); });

const SPAM = 'URGENT: your account is locked, sign in at http://evil.example/login';
function form(path: string, fields: Record<string, string>, ip = '203.0.113.9') {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return new Request(`https://northbound-dev.com${path}`, { method: 'POST', body: f, headers: { accept: 'application/json', 'x-real-ip': ip } });
}
const quote = (fields: Record<string, string> = {}, ip?: string) => quotePOST(form('/api/quote', { name: 'Dana Booth', business: 'Booth Plumbing', phone: '810-555-0100', email: 'victim@example.com', need: SPAM, message: SPAM, ...fields }, ip));
const toVisitor = () => sent.filter((e) => e.to[0] !== 'studio@example.com');

describe('no spam relay on our domain', () => {
  test('the quote auto-reply carries none of the visitor’s text', async () => {
    expect((await quote()).status).toBe(200);
    expect(toVisitor()).toHaveLength(1);
    expect(toVisitor()[0].text).not.toContain('evil.example');
    expect(toVisitor()[0].text).toStartWith('Hi Dana,');
    expect(sent.find((e) => e.to[0] === 'studio@example.com')!.text).toContain('evil.example'); // the studio still sees it all
  });
  test('a name that is really a message becomes "there"', async () => {
    expect(safeFirstName('Dana Booth')).toBe('Dana');
    expect(safeFirstName("O'Neil")).toBe("O'Neil");
    expect(safeFirstName('José')).toBe('José');
    for (const n of ['http://evil.example', 'Win$$$', '123', '', 'a'.repeat(40)]) expect(safeFirstName(n)).toBe('there');
    await quote({ name: 'http://evil.example/login now' });
    expect(toVisitor()[0].text).toStartWith('Hi there,');
  });
  test('the account confirmation doesn’t echo the note either', async () => {
    const r = await accountPOST(form('/api/account', { name: 'Dana', business: 'Booth', email: 'victim@example.com', phone: '810-555-0100', message: SPAM }));
    expect(r.status).toBe(200);
    expect(toVisitor()[0].text).not.toContain('evil.example');
  });
  test('nor the checkout confirmation', async () => {
    const r = await checkoutPOST(form('/api/checkout', { name: 'Dana', business: SPAM, email: 'victim@example.com', phone: '810-555-0100', why_not: SPAM, benefit: SPAM, why_us: SPAM }));
    expect([200, 303]).toContain(r.status);
    for (const e of toVisitor()) expect(e.text).not.toContain('evil.example');
  });
});

describe('a script can’t send 10,000', () => {
  test('one IP: five posts in ten minutes, then refused before anything is emailed', async () => {
    for (let i = 0; i < 5; i++) expect((await quote({ email: `person${i}@example.com` })).status).toBe(200);
    const before = sent.length;
    const r = await quote({ email: 'person6@example.com' });
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/call/i);
    expect(sent.length).toBe(before);
    expect((await quote({ email: 'other@example.com' }, '198.51.100.4')).status).toBe(200); // someone else is fine
  });
  test('one address gets one courtesy email a day, however many IPs post it', async () => {
    for (let i = 0; i < 4; i++) await quote({}, `192.0.2.${i + 1}`);
    expect(toVisitor()).toHaveLength(1);
    expect(sent.filter((e) => e.to[0] === 'studio@example.com')).toHaveLength(4); // enquiries still reach the studio
  });
});

describe('the license endpoints', () => {
  const lic = (body: unknown, ip = '203.0.113.20') => licensePOST(new Request('https://northbound-dev.com/api/license', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body) }));
  const guess = () => `NB-${Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]).join('')).join('-')}`;
  test('ten wrong keys from one IP, then it stops asking Stripe', async () => {
    for (let i = 0; i < 10; i++) expect((await lic({ key: guess() })).status).toBe(200); // signed "unknown"
    const calls = stripeCalls;
    expect((await lic({ key: guess() })).status).toBe(429);
    expect(stripeCalls).toBe(calls);
    expect((await lic({ key: guess() }, '198.51.100.30')).status).toBe(200);
  });
  test('the admin endpoint locks out an IP after ten wrong tokens, even if the eleventh is right', async () => {
    const admin = (token: string) => adminPOST(new Request('https://northbound-dev.com/api/license-admin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-real-ip': '203.0.113.40' }, body: JSON.stringify({ action: 'list' }) }));
    for (let i = 0; i < 10; i++) expect((await admin('y'.repeat(40))).status).toBe(401);
    expect((await admin('z'.repeat(40))).status).toBe(429);
  });
});
