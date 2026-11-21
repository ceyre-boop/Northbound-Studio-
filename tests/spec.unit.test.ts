/* tests/spec.unit.test.ts — js/spec.js, and its copy in api/checkout.ts.
 *
 * bun:test. The codec must round-trip every answer, the mapping must produce
 * only the twelve names studio.html lists, and the server's private copy of
 * the decoder and the mapping must agree with the browser's on every input —
 * that agreement is the only thing that lets the two stay separate.
 *
 *   bun test tests/spec.unit.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as spec from '../js/spec.js';
import { BIZ, NOW, WANT, WORTH, ANSWERS, RUN, LOOKS, PACKAGES, OFFERINGS, blank, encode, decode, partsFor, build, isPicked, describe as words } from '../js/spec.js';
import { decodeSpec, specParts, specLines } from '../api/checkout.ts';

const KEYS = (list: { key: string }[]) => list.map((l) => l.key);

describe('the twelve names', () => {
  /* The homepage no longer lists the twelve; studio.html does, as the
     procession. Its headings are the names a build's parts are shown under,
     so they must stay the names this module uses, in this order. The twelfth
     is spelled out longer on the page ("AI intake and auto-responder"). */
  test('are the twelve studio.html lists, in its order', () => {
    const html = readFileSync(join(import.meta.dir, '..', 'studio.html'), 'utf8');
    const onPage = Array.from(html.matchAll(/<h3><a href="#offer-\d\d">([^<]+)<\/a><\/h3>/g)).map((m) => m[1]);
    expect(onPage.length).toBe(12);
    expect(onPage.slice(0, 11)).toEqual(OFFERINGS.slice(0, 11));
    expect(onPage[11].startsWith(OFFERINGS[11])).toBe(true);
  });

  test('there is one offer, it lists only real parts, and it carries no price', () => {
    expect(Object.keys(PACKAGES)).toEqual(['site']);
    expect(PACKAGES.site).toEqual({ key: 'site', code: 'c', name: 'The Northbound Site', includes: ['A custom site'] });
    for (const part of PACKAGES.site.includes) expect(OFFERINGS).toContain(part);
  });
});

describe('the old menu is gone', () => {
  test('nothing about tiers, prices or payback is exported any more', () => {
    for (const name of ['BEARING', 'recommend', 'payback', 'money']) expect(name in spec).toBe(false);
  });

  test('the module source carries no dollar figure and no old tier name', () => {
    const src = readFileSync(join(import.meta.dir, '..', 'js', 'spec.js'), 'utf8');
    expect(src).not.toMatch(/\$\s?\d/);
    expect(src).not.toMatch(/Beacon|Engine|Bearing|Cheap and Clean|founding/i);
  });

  test('the worth labels are plain numbers, the same brackets as before', () => {
    expect(WORTH).toEqual([
      { key: 'u200', code: '1', label: 'Under 200', low: 0, high: 200 },
      { key: '200-1k', code: '2', label: '200 to 1,000', low: 200, high: 1000 },
      { key: '1k-5k', code: '3', label: '1,000 to 5,000', low: 1000, high: 5000 },
      { key: '5k+', code: '4', label: 'More than 5,000', low: 5000, high: null },
    ]);
  });
});

describe('the codec', () => {
  test('a full build survives the round trip, name included', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs', 'quotes'], worth: '1k-5k', answers: 'nobody', run: 'you', look: 'industrial', pkg: 'site', name: 'Rivera Roofing' };
    const code = encode(a);
    expect(code).toBe('1tc33ny5c.Rivera%20Roofing');
    expect(decode(code)).toEqual({ ...a, wantUnsure: false });
  });

  test('the offer character is always written, whatever pkg says', () => {
    for (const pkg of [null, 'site', 'engine', 'nonsense']) {
      expect(encode({ ...blank(), pkg })).toBe('1__0____c');
      expect(encode({ ...blank(), parts: ['A custom site'], pkg })).toBe('2001c');
    }
  });

  test('links saved under the old menu still open, as the one offer', () => {
    for (const ch of ['c', 'b', 'e']) {
      expect(decode('1tc33ny5' + ch)!.pkg).toBe('site');
      expect(decode('2005' + ch)!.pkg).toBe('site');
      expect(decodeSpec('1tc33ny5' + ch)!.pkg).toBe('site');
      expect(decodeSpec('2005' + ch)!.pkg).toBe('site');
    }
    // A code written before any package was chosen has no offer to name.
    expect(decode('1tc33ny5_')!.pkg).toBeNull();
    expect(decodeSpec('1tc33ny5_')!.pkg).toBeNull();
  });

  test('"not sure yet" everywhere survives as "not sure yet"', () => {
    const a = { ...blank(), biz: '_', now: '_', want: [], wantUnsure: true, worth: '_', answers: '_', run: '_', look: '_', pkg: 'site', name: '' };
    const code = encode(a);
    expect(code).toBe('1__0____c');
    expect(decode(code)).toEqual(a);
  });

  test('unanswered comes back as "not sure yet" — the honest reading on a restored link', () => {
    expect(decode(encode(blank()))).toEqual({ ...blank(), biz: '_', now: '_', wantUnsure: true, worth: '_', answers: '_', run: '_', look: '_', pkg: 'site' });
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
    const a = { ...blank(), parts: ['AI intake', 'A custom site', 'Booking flow'] };
    const code = encode(a);
    expect(code).toBe('21l1c');   // bits 0, 2 and 11 → 2053 → "1l1" in base 36, then the offer's 'c'
    const back = decode(code)!;
    expect(isPicked(back)).toBe(true);
    expect(back.parts).toEqual(['A custom site', 'Booking flow', 'AI intake']);
    expect(back.pkg).toBe('site');
    expect(back.biz).toBe('_');
    expect(back.wantUnsure).toBe(true);
  });

  test('every one of the 4096 subsets survives the round trip', () => {
    for (let mask = 0; mask < 1 << 12; mask++) {
      const parts = OFFERINGS.filter((_, i) => mask & (1 << i));
      const back = decode(encode({ ...blank(), parts, pkg: null }))!;
      expect(back.parts).toEqual(parts);
      expect(back.pkg).toBe('site');
    }
  });

  test('picked parts are the parts — nothing inferred, nothing added; the site covers the site and the rest is quoted separately', () => {
    expect(partsFor({ ...blank(), parts: ['Reminders'] })).toEqual(['Reminders']);
    expect(partsFor({ ...blank(), parts: [] })).toEqual([]);
    const b = build({ ...blank(), parts: ['A custom site', 'Booking flow', 'AI intake'] });
    expect(Object.keys(b).sort()).toEqual(['extra', 'included', 'parts', 'pkg']);
    expect(b.parts).toEqual(['A custom site', 'Booking flow', 'AI intake']);
    expect(b.pkg).toBe(PACKAGES.site);
    expect(b.included).toEqual(['A custom site']);
    expect(b.extra).toEqual(['Booking flow', 'AI intake']);
    // Picking only something beyond the site includes nothing and drops nothing.
    const lone = build({ ...blank(), parts: ['Reminders'] });
    expect(lone.included).toEqual([]);
    expect(lone.extra).toEqual(['Reminders']);
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
  test('the roofer path: the site, and seven parts to quote separately', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs', 'quotes'], worth: '1k-5k', answers: 'nobody', run: 'you', look: 'industrial' };
    const b = build(a);
    expect(b.parts).toEqual(['A custom site', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests']);
    expect(b.pkg.key).toBe('site');
    expect(b.included).toEqual(['A custom site']);
    expect(b.extra).toEqual(['Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests']);
  });

  test('a café that just wants to be found: the site, with the leftovers named', () => {
    const a = { ...blank(), biz: 'food', now: 'hope', want: ['found'], worth: '200-1k', answers: 'me', run: 'me', look: 'editorial' };
    const b = build(a);
    expect(b.included).toEqual(['A custom site']);
    expect(b.extra).toEqual(['Brand identity', 'Review requests', 'Local SEO']);
  });

  test('nothing but a site is just the site', () => {
    const a = { ...blank(), biz: 'shop', now: 'call', want: [], worth: 'u200', answers: 'me', run: 'me', look: 'dark' };
    const b = build(a);
    expect(b.parts).toEqual(['A custom site']);
    expect(b.extra).toEqual([]);
  });

  test('a stale package key on the answers changes nothing', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs'], worth: '1k-5k', answers: 'nobody', run: 'me' };
    for (const pkg of ['clean', 'beacon', 'engine', null]) expect(build({ ...a, pkg })).toEqual(build(a));
  });
});

describe('the server copy agrees with the browser', () => {
  const pick = <T>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];
  // A small deterministic generator, so a failure names a reproducible seed.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  test('decode and parts match on 500 generated builds', () => {
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
        pkg: pick([...Object.keys(PACKAGES), 'engine', null], r),
        name: pick(['', 'Rivera Roofing', 'Ledge Coffee & Co.', 'Ünïcode Ltd'], r),
      };
      const code = encode(a);
      const browser = decode(code)!;
      const server = decodeSpec(code)!;
      expect(server).not.toBeNull();
      // The server's look is the code digit; the browser's is the key. Compare in words.
      expect({ ...server, look: undefined }).toEqual({ ...browser, wantUnsure: undefined, look: undefined });
      expect(specParts(server)).toEqual(partsFor(browser));
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
        }
    }
  });

  test('the answers in words match the labels the browser shows, and the server says the same', () => {
    const a = { ...blank(), biz: 'trades', now: 'call', want: ['jobs', 'quotes'], worth: '1k-5k', answers: 'nobody', run: 'you', look: 'industrial', name: 'Rivera Roofing' };
    const d = words(a);
    expect(d.business).toBe('Rivera Roofing — Trades & home services');
    expect(d.want).toBe('Booked jobs, Quote requests');
    expect(d.worth).toBe('1,000 to 5,000');
    expect(d.look).toBe('Industrial');

    const lines = specLines(decodeSpec(encode(a))!).join('\n');
    for (const said of [d.business, d.now, d.want, d.worth, d.answers, d.run, d.look]) expect(lines).toContain(said);
    // What the site does not cover is named on both sides, in the same order.
    expect(lines).toContain(`To quote separately: ${build(a).extra.join(', ')}`);
  });

  test('every label the browser can show is the label the server writes', () => {
    for (const [list, key] of [[BIZ, 'biz'], [NOW, 'now'], [WORTH, 'worth'], [ANSWERS, 'answers'], [RUN, 'run'], [LOOKS, 'look']] as const) {
      for (const o of list) {
        const a = { ...blank(), [key]: o.key };
        expect(specLines(decodeSpec(encode(a))!).join('\n')).toContain(o.label);
      }
    }
  });

  test('neither side writes a dollar figure or an old tier name', () => {
    const a = { ...blank(), biz: 'trades', now: 'dm', want: ['jobs', 'quotes', 'orders', 'walkins', 'found'], worth: '5k+', answers: 'nobody', run: 'you', look: 'dark', name: 'Rivera Roofing' };
    const browser = JSON.stringify([words(a), build(a)]);
    const server = specLines(decodeSpec(encode(a))!).join('\n');
    for (const text of [browser, server]) {
      expect(text).not.toMatch(/\$\s?\d/);
      expect(text).not.toMatch(/Beacon|Engine|Bearing|Cheap and Clean|founding/i);
    }
  });
});
