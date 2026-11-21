/* js/spec.js — what a guided build is, and how it travels.
 *
 * One module, three jobs:
 *
 *   1. The vocabulary. Every question on build.html, every answer it accepts,
 *      and the one-character code each answer travels as.
 *   2. The codec. A build is seven answers plus an optional business name,
 *      packed into a short string so a link can carry it between devices
 *      with no database behind it:  1tc33ny5c.Rivera%20Roofing
 *      A version-2 code carries parts picked straight off the homepage
 *      instead of answers — a 12-bit mask of the twelve, then the offer
 *      character: 2005c (see encode/decode). The answers all read "not sure
 *      yet", because nobody asked them anything.
 *   3. The mapping. Answers select parts (named exactly as the twelve
 *      offerings on studio.html). There is one offer, The Northbound Site; it
 *      covers the site itself, and every other part is quoted separately.
 *
 * Nothing here is a price. No price is shown anywhere but checkout.html,
 * which reads it from the server. api/checkout.ts keeps its own copy of the
 * decoder and the mapping (tests/spec.unit.test.ts proves the two agree)
 * rather than importing a browser module into a serverless function.
 */

export const VERSION = '1';

/* The homepage's picked-parts code. Same `s=` parameter, same decoder, next
   version: '2' + a three-character base-36 mask of the twelve + the offer
   character. Five characters, no name. */
export const PARTS_VERSION = '2';

/* '_' is "not sure yet", offered on every question. It is a real answer,
   never a validation failure. */
export const UNSURE = '_';

export const BIZ = [
  { key: 'trades', code: 't', label: 'Trades & home services', unit: 'job' },
  { key: 'food', code: 'f', label: 'Food & drink', unit: 'order' },
  { key: 'salon', code: 's', label: 'Salon, spa or fitness', unit: 'client' },
  { key: 'shop', code: 'r', label: 'Shop or store', unit: 'customer' },
  { key: 'pro', code: 'p', label: 'Professional services', unit: 'client' },
  { key: 'other', code: 'o', label: 'Something else', unit: 'customer' },
];

export const NOW = [
  { key: 'call', code: 'c', label: 'They call me' },
  { key: 'dm', code: 'm', label: 'They message me on Facebook or Instagram' },
  { key: 'hope', code: 'h', label: 'Nothing — I hope they find me' },
  { key: 'site', code: 's', label: "I have a site but it doesn't do anything" },
];

/* Multi-select, carried as a bitmask in one base-36 character. */
export const WANT = [
  { key: 'jobs', bit: 1, label: 'Booked jobs', cta: 'Book a time' },
  { key: 'quotes', bit: 2, label: 'Quote requests', cta: 'Get a quote' },
  { key: 'orders', bit: 4, label: 'Orders', cta: 'Order now' },
  { key: 'walkins', bit: 8, label: 'People walking in', cta: 'Find us' },
  { key: 'found', bit: 16, label: 'Being found at all', cta: 'Call us' },
];

/* How much one new customer is worth, in dollars. The labels carry no dollar
   sign — the question says "in dollars" — so nothing on the page reads as a
   price. */
export const WORTH = [
  { key: 'u200', code: '1', label: 'Under 200', low: 0, high: 200 },
  { key: '200-1k', code: '2', label: '200 to 1,000', low: 200, high: 1000 },
  { key: '1k-5k', code: '3', label: '1,000 to 5,000', low: 1000, high: 5000 },
  { key: '5k+', code: '4', label: 'More than 5,000', low: 5000, high: null },
];

export const ANSWERS = [
  { key: 'me', code: 'm', label: 'Me, always' },
  { key: 'family', code: 'f', label: 'My partner or family' },
  { key: 'nobody', code: 'n', label: 'Nobody — it waits until morning' },
];

export const RUN = [
  { key: 'me', code: 'm', label: "I'll run it myself" },
  { key: 'you', code: 'y', label: 'Keep it running for me' },
];

export const LOOKS = [
  { key: 'clean', code: '1', label: 'Clean', file: '01-clean' },
  { key: 'dark', code: '2', label: 'Dark', file: '02-dark' },
  { key: 'editorial', code: '3', label: 'Editorial', file: '03-editorial' },
  { key: 'photo', code: '4', label: 'Photo', file: '04-photo' },
  { key: 'industrial', code: '5', label: 'Industrial', file: '05-industrial' },
];

/* The twelve, spelled as studio.html lists them. AI intake is never
   selected by an answer: it is quoted separately, per job. */
export const OFFERINGS = [
  'A custom site',
  'Brand identity',
  'Booking flow',
  'Quote flow',
  'Payments',
  'Lead capture',
  'Automated follow-up',
  'Reminders',
  'Review requests',
  'Owner dashboard',
  'Local SEO',
  'AI intake',
];

/* One offer. The old three-tier menu is retired; its codes ('b', 'e') still
   decode, to this, so a link someone saved earlier still opens. */
export const PACKAGES = {
  site: { key: 'site', code: 'c', name: 'The Northbound Site', includes: ['A custom site'] },
};

const OLD_PACKAGE_CODES = ['c', 'b', 'e'];
const pkgFor = (c) => (OLD_PACKAGE_CODES.includes(c) ? 'site' : null);

/** @typedef {{ biz: string|null, now: string|null, want: string[], wantUnsure: boolean, worth: string|null, answers: string|null, run: string|null, look: string|null, pkg: string|null, name: string, parts: string[]|null }} Answers */

/** @returns {Answers} */
export function blank() {
  return { biz: null, now: null, want: [], wantUnsure: false, worth: null, answers: null, run: null, look: null, pkg: null, name: '', parts: null };
}

const byKey = (list, key) => list.find((o) => o.key === key) || null;
const byCode = (list, code) => list.find((o) => o.code === code) || null;
/* An explicit "not sure yet" survives the round trip as '_'; an unanswered
   question comes back as null. Both read as "Not sure yet" in words. */
const keyFor = (list, code) => (code === UNSURE ? UNSURE : byCode(list, code)?.key ?? null);

/* ---- the mapping ------------------------------------------------------ */

/** Which of the twelve parts these answers call for, in the site's order.
    Parts picked by hand on the homepage (a.parts) are exactly the parts —
    nothing is inferred, nothing is added. */
export function partsFor(a) {
  if (Array.isArray(a.parts)) return OFFERINGS.filter((o) => a.parts.includes(o));
  const set = new Set(['A custom site']);
  const add = (...names) => names.forEach((n) => set.add(n));

  if (a.now === 'hope') add('Local SEO');
  if (a.now === 'site') add('Lead capture');
  if (a.now === 'dm') add('Lead capture', 'Automated follow-up');

  if (a.want.includes('jobs')) add('Booking flow', 'Reminders');
  if (a.want.includes('quotes')) add('Quote flow');
  if (a.want.includes('orders')) add('Payments');
  if (a.want.includes('walkins')) add('Local SEO');
  if (a.want.includes('found')) add('Local SEO', 'Brand identity');

  if (a.worth === '200-1k') add('Review requests');
  if (a.worth === '1k-5k') add('Payments', 'Review requests');
  if (a.worth === '5k+') add('Payments', 'Review requests', 'Owner dashboard');

  if (a.answers === 'family') add('Automated follow-up');
  if (a.answers === 'nobody') add('Automated follow-up', 'Lead capture');

  return OFFERINGS.filter((o) => set.has(o));
}

/** Everything the summary needs, from a set of answers: the parts, the one
    offer, which parts it covers, and which are quoted separately. */
export function build(a) {
  const parts = partsFor(a);
  const pkg = PACKAGES.site;
  const included = parts.filter((p) => pkg.includes.includes(p));
  const extra = parts.filter((p) => !pkg.includes.includes(p));
  return { parts, pkg, included, extra };
}

/* ---- the codec -------------------------------------------------------- */

/** Pack answers into a short string. Never throws; unknown values become '_'.
    Picked parts pack as the version-2 code instead: the mask, then the offer.
    The last character is always the one offer's code. */
export function encode(a) {
  if (Array.isArray(a.parts)) {
    const mask = OFFERINGS.reduce((n, o, i) => (a.parts.includes(o) ? n | (1 << i) : n), 0);
    return PARTS_VERSION + mask.toString(36).padStart(3, '0') + PACKAGES.site.code;
  }
  const c = (list, key) => byKey(list, key)?.code || UNSURE;
  const mask = a.want.reduce((n, k) => n | (byKey(WANT, k)?.bit || 0), 0);
  const look = byKey(LOOKS, a.look)?.code || UNSURE;
  const code = VERSION + c(BIZ, a.biz) + c(NOW, a.now) + mask.toString(36) + c(WORTH, a.worth) + c(ANSWERS, a.answers) + c(RUN, a.run) + look + PACKAGES.site.code;
  const name = String(a.name || '').trim().slice(0, 60);
  return name ? `${code}.${encodeURIComponent(name)}` : code;
}

/** Unpack a string from encode(). Returns null for anything it can't read.
    A question that was never answered and one answered "not sure yet" both
    come back as '_': on a restored link there is no difference worth keeping. */
export function decode(s) {
  if (typeof s !== 'string') return null;
  const dot = s.indexOf('.');
  const code = dot === -1 ? s : s.slice(0, dot);
  if (code[0] === PARTS_VERSION) {
    if (code.length !== 5 || !/^[0-9a-z]{3}$/.test(code.slice(1, 4))) return null;
    const mask = parseInt(code.slice(1, 4), 36);
    if (mask >= 1 << OFFERINGS.length) return null;
    const a = blank();
    a.biz = UNSURE; a.now = UNSURE; a.wantUnsure = true; a.worth = UNSURE; a.answers = UNSURE; a.run = UNSURE; a.look = UNSURE;
    a.parts = OFFERINGS.filter((o, i) => mask & (1 << i));
    a.pkg = pkgFor(code[4]);
    return a;
  }
  if (code.length !== 9 || code[0] !== VERSION) return null;
  const a = blank();
  a.biz = keyFor(BIZ, code[1]);
  a.now = keyFor(NOW, code[2]);
  const mask = parseInt(code[3], 36);
  a.want = Number.isNaN(mask) ? [] : WANT.filter((w) => mask & w.bit).map((w) => w.key);
  a.wantUnsure = a.want.length === 0;
  a.worth = keyFor(WORTH, code[4]);
  a.answers = keyFor(ANSWERS, code[5]);
  a.run = keyFor(RUN, code[6]);
  a.look = keyFor(LOOKS, code[7]);
  a.pkg = pkgFor(code[8]);
  if (dot !== -1) {
    try { a.name = decodeURIComponent(s.slice(dot + 1)).trim().slice(0, 60); } catch { a.name = ''; }
  }
  return a;
}

/** The link that restores a build anywhere. */
export function link(a, origin) {
  return `${origin || ''}/build.html?s=${encodeURIComponent(encode(a))}`;
}

/* ---- words ------------------------------------------------------------ */

/** Picked on the homepage rather than answered on build.html. */
export function isPicked(a) {
  return Array.isArray(a.parts);
}

/** The answers in plain words, for the summary and the emails. */
export function describe(a) {
  const label = (list, key) => byKey(list, key)?.label || 'Not sure yet';
  return {
    business: [a.name, label(BIZ, a.biz)].filter(Boolean).join(' — '),
    now: label(NOW, a.now),
    want: a.want.length ? a.want.map((k) => label(WANT, k)).join(', ') : 'Not sure yet',
    worth: label(WORTH, a.worth),
    answers: label(ANSWERS, a.answers),
    run: label(RUN, a.run),
    look: label(LOOKS, a.look),
  };
}
