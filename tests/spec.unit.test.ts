/* tests/spec.unit.test.ts — js/spec.js, and its copy in api/checkout.ts.
 *
 * bun:test. The codec must round-trip every answer, the mapping must produce
 * only the twelve names index.html uses, and the server's private copy of
 * the decoder and the mapping must agree with the browser's on every input —
 * that agreement is the only thing that lets the two stay separate.
 *
 *   bun test tests/spec.unit.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIZ, NOW, WANT, WORTH, ANSWERS, RUN, LOOKS, PACKAGES, OFFERINGS, blank, encode, decode, partsFor, recommend, build, payback, isPicked, describe as words } from '../js/spec.js';
import { decodeSpec, specParts, specRecommend } from '../api/checkout.ts';

const KEYS = (list: { key: string }[]) => list.map((l) => l.key);

describe('the twelve names', () => {
  test('are spelled exactly as index.html spells them, in its order', () => {
    const html = readFileSync(join(import.meta.dir, '..', 'index.html'), 'utf8');
    const onPage = Array.from(html.matchAll(/<span class="t"[^>]*>([^<]+)<\/span>/g)).map((m) => m[1]);
    expect(onPage).toEqual(OFFERINGS);
    // And each panel's data-part — what js/pick.js actually sends — is that same name.
    const dataParts = Array.from(html.matchAll(/class="offer" data-part="([^"]+)"/g)).map((m) => m[1]);
    expect(dataParts).toEqual(OFFERINGS);
  });

  test('every package lists only real parts, and AI intake is never in one', () => {
    for (const p of Object.values(PACKAGES)) {
      for (const part of p.includes) expect(OFFERINGS).toContain(part);
      expect(p.includes).not.toContain('AI intake');
    }
  });
});

describe('the codec', () => {
  test('a full build survives the round trip, name included', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs', 'quotes'], worth: '1k-5k', answers: 'nobody', run: 'you', look: 'industrial', pkg: 'engine', name: 'Rivera Roofing' };
    const code = encode(a);
    expect(code).toBe('1tc33ny5e.Rivera%20Roofing');
    expect(decode(code)).toEqual({ ...a, wantUnsure: false });
  });

  test('"not sure yet" everywhere survives as "not sure yet"', () => {
    const a = { ...blank(), biz: '_', now: '_', want: [], wantUnsure: true, worth: '_', answers: '_', run: '_', look: '_', pkg: null, name: '' };
    const code = encode(a);
    expect(code).toBe('1__0_____');
    expect(decode(code)).toEqual(a);
  });

  test('unanswered comes back as "not sure yet" — the honest reading on a restored link', () => {
    expect(decode(encode(blank()))).toEqual({ ...blank(), biz: '_', now: '_', wantUnsure: true, worth: '_', answers: '_', run: '_', look: '_' });
  });

  test('refuses anything it cannot read', () => {
    expect(decode('')).toBeNull();
    expect(decode('garbage')).toBeNull();
    expect(decode('2tc33ny5e')).toBeNull();
    expect(decode('1tc33ny5')).toBeNull();
    expect(decode(null as unknown as string)).toBeNull();
  });

  test('a name is capped at 60 characters and cannot smuggle markup through unescaped', () => {
    const a = { ...blank(), name: 'x'.repeat(200) };
    expect(decode(encode(a))!.name.length).toBe(60);
    const b = { ...blank(), name: '<b>Bad</b>' };
    expect(decode(encode(b))!.name).toBe('<b>Bad</b>');
    expect(encode(b)).not.toContain('<');
  });
});

/* The homepage's picks: the version-2 code carries the parts themselves. */
describe('the picked-parts code', () => {
  test('three picks pack as a five-character code and come back exactly, in the site\'s order', () => {
    const a = { ...blank(), parts: ['AI intake', 'A custom site', 'Booking flow'], pkg: 'engine' };
    const code = encode(a);
    expect(code).toBe('21l1e');   // bits 0, 2 and 11 → 2053 → "1l1" in base 36, then Engine's 'e'
    const back = decode(code)!;
    expect(isPicked(back)).toBe(true);
    expect(back.parts).toEqual(['A custom site', 'Booking flow', 'AI intake']);
    expect(back.pkg).toBe('engine');
    expect(back.biz).toBe('_');
    expect(back.wantUnsure).toBe(true);
  });

  test('every one of the 4096 subsets survives the round trip', () => {
    for (let mask = 0; mask < 1 << 12; mask++) {
      const parts = OFFERINGS.filter((_, i) => mask & (1 << i));
      const back = decode(encode({ ...blank(), parts, pkg: null }))!;
      expect(back.parts).toEqual(parts);
      expect(back.pkg).toBeNull();
    }
  });

  test('picked parts are the parts — nothing inferred, nothing added, and the package follows the same rule as the guided build', () => {
    expect(partsFor({ ...blank(), parts: ['Reminders'] })).toEqual(['Reminders']);
    expect(partsFor({ ...blank(), parts: [] })).toEqual([]);
    const b = build({ ...blank(), parts: ['A custom site', 'Booking flow', 'AI intake'], pkg: 'engine' });
    expect(b.parts).toEqual(['A custom site', 'Booking flow', 'AI intake']);
    expect(b.recommended).toBe('engine');
    expect(b.included).toEqual(['A custom site', 'Booking flow']);
    expect(b.extra).toEqual(['AI intake']);
    expect(b.bearing).toBe(false);
    expect(b.payback).toBeNull();
    expect(recommend(['A custom site'])).toBe('clean');
    expect(recommend(['A custom site', 'Brand identity'])).toBe('beacon');
  });

  test('refuses a version-2 code it cannot read', () => {
    expect(decode('2')).toBeNull();
    expect(decode('2005')).toBeNull();
    expect(decode('2zzze')).toBeNull();      // 46655 is more than twelve bits
    expect(decode('2-05e')).toBeNull();
    expect(decode('2005e.Rivera')).not.toBeNull(); // a stray name is ignored, not fatal
    expect(decode('2005e.Rivera')!.name).toBe('');
  });
});

describe('the mapping', () => {
  test('the roofer path is an Engine with Bearing', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs', 'quotes'], worth: '1k-5k', answers: 'nobody', run: 'you', look: 'industrial' };
    const b = build(a);
    expect(b.parts).toEqual(['A custom site', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests']);
    expect(b.recommended).toBe('engine');
    expect(b.extra).toEqual([]);
    expect(b.bearing).toBe(true);
    expect(b.balance).toBe(2125);
    expect(b.payback).toBe('At $1,000–$5,000 a job, this build is between 1 and 5 new jobs.');
  });

  test('a café that just wants to be found is a Beacon, with the one leftover named', () => {
    const a = { ...blank(), biz: 'food', now: 'hope', want: ['found'], worth: '200-1k', answers: 'me', run: 'me', look: 'editorial' };
    const b = build(a);
    expect(b.recommended).toBe('beacon');
    expect(b.included).toEqual(['A custom site', 'Brand identity', 'Local SEO']);
    expect(b.extra).toEqual(['Review requests']);
    expect(b.bearing).toBe(false);
    expect(b.balance).toBe(875);
  });

  test('nothing but a site is Cheap and Clean, the whole price now', () => {
    const a = { ...blank(), biz: 'shop', now: 'call', want: [], worth: 'u200', answers: 'me', run: 'me', look: 'dark' };
    const b = build(a);
    expect(b.recommended).toBe('clean');
    expect(b.parts).toEqual(['A custom site']);
    expect(b.balance).toBe(0);
  });

  test('one ride-along part alone is not an Engine; two are', () => {
    expect(recommend(['A custom site', 'Review requests'])).toBe('beacon');
    expect(recommend(['A custom site', 'Review requests', 'Reminders'])).toBe('engine');
    expect(recommend(['A custom site', 'Lead capture'])).toBe('engine');
    expect(recommend(['A custom site', 'Local SEO'])).toBe('beacon');
    expect(recommend(['A custom site'])).toBe('clean');
  });

  test('the customer\'s override wins, and the sheet knows what it drops', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs'], worth: '1k-5k', answers: 'nobody', run: 'me', pkg: 'clean' };
    const b = build(a);
    expect(b.recommended).toBe('engine');
    expect(b.pkg.key).toBe('clean');
    expect(b.included).toEqual(['A custom site']);
    expect(b.extra).toContain('Booking flow');
  });
});

describe('the payback line', () => {
  test('is arithmetic on the bracket, phrased in their unit', () => {
    expect(payback(PACKAGES.engine, 'u200', 'job')).toBe('At under $200 a job, this build is at least 22 new jobs.');
    expect(payback(PACKAGES.clean, 'u200', 'customer')).toBe('At under $200 a customer, this build is at least 4 new customers.');
    expect(payback(PACKAGES.beacon, '200-1k', 'order')).toBe('At $200–$1,000 an order, this build is between 2 and 9 new orders.');
    expect(payback(PACKAGES.clean, '1k-5k', 'job')).toBe('One $1,000–$5,000 job covers this build.');
    expect(payback(PACKAGES.engine, '5k+', 'client')).toBe('One client worth $5,000 or more covers this build.');
    expect(payback(PACKAGES.engine, '_', 'job')).toBeNull();
    expect(payback(PACKAGES.engine, null, 'job')).toBeNull();
  });
});

describe('the server copy agrees with the browser', () => {
  const pick = <T>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];
  // A small deterministic generator, so a failure names a reproducible seed.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  test('decode, parts and recommendation match on 500 generated builds', () => {
    const r = lcg(7);
    for (let i = 0; i < 500; i++) {
      const a = {
        ...blank(),
        biz: pick([...KEYS(BIZ), '_', null], r),
        now: pick([...KEYS(NOW), '_', null], r),
        want: KEYS(WANT).filter(() => r() < 0.4),
        worth: pick([...KEYS(WORTH), '_', null], r),
        answers: pick([...KEYS(ANSWERS), '_', null], r),
        run: pick([...KEYS(RUN), '_', null], r),
        look: pick([...KEYS(LOOKS), '_', null], r),
        pkg: pick([...Object.keys(PACKAGES), null], r),
        name: pick(['', 'Rivera Roofing', 'Ledge Coffee & Co.', 'Ünïcode Ltd'], r),
      };
      const code = encode(a);
      const browser = decode(code)!;
      const server = decodeSpec(code)!;
      expect(server).not.toBeNull();
      // The server's look is the code digit; the browser's is the key. Compare in words.
      expect({ ...server, look: undefined }).toEqual({ ...browser, wantUnsure: undefined, look: undefined });
      expect(specParts(server)).toEqual(partsFor(browser));
      expect(specRecommend(specParts(server))).toEqual(recommend(partsFor(browser)));
    }
  });

  test('decode and parts match on every picked-parts code', () => {
    for (let mask = 0; mask < 1 << 12; mask++) {
      const parts = OFFERINGS.filter((_, i) => mask & (1 << i));
      for (const pkg of [...Object.keys(PACKAGES), null]) {
        const code = encode({ ...blank(), parts, pkg });
        const browser = decode(code)!;
        const server = decodeSpec(code)!;
        expect(server).not.toBeNull();
        expect({ ...server, look: undefined }).toEqual({ ...browser, wantUnsure: undefined, look: undefined });
        expect(specParts(server)).toEqual(partsFor(browser));
        expect(specRecommend(specParts(server))).toEqual(recommend(partsFor(browser)));
      }
    }
  });

  test('the answers in words match the labels the browser shows', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs', 'quotes'], worth: '1k-5k', answers: 'nobody', run: 'you', look: 'industrial', name: 'Rivera Roofing' };
    const d = words(a);
    expect(d.business).toBe('Rivera Roofing — Trades & home services');
    expect(d.want).toBe('Booked jobs, Quote requests');
    expect(d.look).toBe('Industrial');
  });
});
