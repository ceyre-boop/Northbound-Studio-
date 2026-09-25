/* lab/scroll/shots.mjs — the same five frames of every candidate, and the
 * layout-shift score of the whole scroll, at 1280x800 and 390x844.
 *
 *   bun lab/scroll/shots.mjs http://localhost:8361        # every candidate
 *   bun lab/scroll/shots.mjs http://localhost:8361 03     # just one
 *   bun lab/scroll/shots.mjs http://localhost:8361 base   # the page as it is
 *
 * Not a test. The frames are for a person to look at: the hero, the seam
 * between the hero and the twelve caught half-way, the twelve, the seam
 * between the twelve and the three prices caught half-way, and the prices.
 * The two seams are captured twice — once arriving from above, once from
 * below — because a scroll transition has to look deliberate in both
 * directions and the way back up is where these things usually fall apart.
 *
 * The page is scrolled with wheel events in steps, not jumped, so anything
 * that keys off IntersectionObserver fires the way it would for a person.
 * A PerformanceObserver on layout-shift runs from before the first paint to
 * the last frame, and its total is printed per width. The bar is zero: a
 * scroll transition that reserves or releases space as it goes is not a
 * transition, it is a layout bug with easing.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] || 'http://localhost:8361';
const only = process.argv[3];
const DIR = 'lab/scroll';
const OUT = join(DIR, 'shots');
mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  { id: 'base', slug: 'baseline' },
  { id: '01', slug: 'descent' },
  { id: '02', slug: 'deck' },
  { id: '03', slug: 'wires' },
  { id: '04', slug: 'floor' },
  { id: '05', slug: 'type' },
];

const WIDTHS = [
  ['1280x800', { width: 1280, height: 800 }],
  ['390x844', { width: 390, height: 844 }],
];

function candidateFiles(c) {
  if (c.id === 'base') return { cssText: '', jsText: '' };
  const css = join(DIR, `${c.id}-${c.slug}.css`);
  const js = join(DIR, `${c.id}-${c.slug}.js`);
  return {
    cssText: existsSync(css) ? readFileSync(css, 'utf8') : '',
    jsText: existsSync(js) ? readFileSync(js, 'utf8') : '',
  };
}

/* Wheel the page to a document y in steps of about a third of a screen,
   settling briefly between, so the browser paints the frames in between. */
async function wheelTo(page, y) {
  const cur = await page.evaluate(() => scrollY);
  const vh = page.viewportSize().height;
  let at = cur;
  const dir = y > cur ? 1 : -1;
  while (Math.abs(y - at) > 1) {
    const step = Math.min(Math.abs(y - at), vh / 3) * dir;
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(40);
    at = await page.evaluate(() => scrollY);
    if (Math.abs(step) < 1) break;
  }
  // The last step lands it exactly, wheel deltas being quantised.
  await page.evaluate((yy) => scrollTo(0, yy), y);
  await page.waitForTimeout(350);
}

const browser = await chromium.launch();

for (const c of CANDIDATES) {
  if (only ? only !== c.id && only !== c.slug : c.id === 'base') continue;
  const { cssText, jsText } = candidateFiles(c);

  for (const [wname, vp] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: 'no-preference' });

    await ctx.addInitScript(({ cssText, jsText }) => {
      /* Layout shift is buffered from the first paint, before any candidate
         has a chance to move anything. */
      window.__cls = 0;
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__cls += e.value;
          window.__shifts.push({ v: e.value, t: Math.round(e.startTime), y: Math.round(scrollY) });
        }
      }).observe({ type: 'layout-shift', buffered: true });

      const inject = () => {
        const root = document.documentElement;
        if (cssText) {
          const style = document.createElement('style');
          style.textContent = cssText;
          root.appendChild(style);
        }
        if (jsText) {
          const sc = document.createElement('script');
          sc.textContent = jsText;
          root.appendChild(sc);
        }
      };
      if (document.documentElement) inject();
      else new MutationObserver((_, obs) => { if (document.documentElement) { obs.disconnect(); inject(); } }).observe(document, { childList: true });
    }, { cssText, jsText });

    const page = await ctx.newPage();
    await page.goto(`${base}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);

    const geo = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect().top + scrollY;
      return { off: r('#offerings'), pkg: r('#packages'), quote: r('#quote'), vh: innerHeight };
    });
    /* The seams are caught with the boundary at the middle of the screen —
       the point where the departing section is half gone and the arriving
       one half here. */
    const frames = [
      ['1-hero', 0],
      ['2-seam-a-early', geo.off - geo.vh * 0.75],
      ['2-seam-a-down', geo.off - geo.vh / 2],
      ['2-seam-a-late', geo.off - geo.vh * 0.2],
      ['3-twelve', geo.off - 72],
      ['4-seam-b-early', geo.pkg - geo.vh * 0.75],
      ['4-seam-b-down', geo.pkg - geo.vh / 2],
      ['4-seam-b-late', geo.pkg - geo.vh * 0.2],
      ['5-prices', geo.pkg - 72],
      ['6-quote', geo.quote - 72],
      ['4-seam-b-up', geo.pkg - geo.vh / 2],
      ['2-seam-a-up', geo.off - geo.vh / 2],
      ['1-hero-back', 0],
    ];
    for (const [name, y] of frames) {
      await wheelTo(page, Math.max(0, Math.round(y)));
      await page.screenshot({ path: join(OUT, `${c.id}-${wname}-${name}.png`) });
    }

    const cls = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
    console.log(`${c.id}-${c.slug}  ${wname}  CLS ${cls.cls.toFixed(4)}${cls.shifts.length ? '  ' + JSON.stringify(cls.shifts.slice(0, 6)) : ''}`);
    await ctx.close();
  }
}

await browser.close();
