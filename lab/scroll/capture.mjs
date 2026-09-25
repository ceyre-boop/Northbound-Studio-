/* lab/scroll/capture.mjs — record each candidate as the page is scrolled.
 *
 *   bun lab/scroll/capture.mjs http://localhost:8361
 *   bun lab/scroll/capture.mjs http://localhost:8361 03    # just one
 *
 * Each candidate is a stylesheet (and for 05, a small script) injected into
 * the real homepage, so what gets recorded is the actual hero becoming the
 * actual twelve becoming the actual prices — not a mock of it.
 *
 * Unlike the click transitions in lab/transitions, nothing here runs on a
 * clock: every candidate is scroll-driven, so its speed is the visitor's
 * scroll speed. The recording scrolls the page the way a person reading it
 * would — a steady wheel down to the quote form, a pause, and a faster
 * scroll back to the top, because the way back up is half of what has to
 * look deliberate — at 1280x800 and again at 390x844, one file each.
 *
 * Two things carried over from lab/transitions/capture.mjs: the init script
 * runs before the document is parsed, so documentElement can be null and
 * the injection waits for it; and nothing here transforms <body>, because a
 * transformed body becomes the containing block for fixed children and the
 * Continue button would be stuck inside the page. None of the candidates
 * carry a data URI, but if one ever does, single-quote it — a double quote
 * inside the injected stylesheet ends the declaration silently.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const base = process.argv[2] || 'http://localhost:8361';
const only = process.argv[3];
const DIR = 'lab/scroll';
const OUT = join(DIR, 'video');
const RAW = join(OUT, 'raw');

const CANDIDATES = [
  { id: '01', slug: 'descent', label: 'the machine comes down as the cards' },
  { id: '02', slug: 'deck', label: 'gathered into a deck, dealt back out' },
  { id: '03', slug: 'wires', label: 'the wiring runs on and draws the next section' },
  { id: '04', slug: 'floor', label: 'the sections are floors, each slides over the last' },
  { id: '05', slug: 'type', label: 'the words fall and set themselves as the next heading' },
];

const WIDTHS = [
  ['1280', { width: 1280, height: 800 }],
  ['390', { width: 390, height: 844 }],
];

mkdirSync(RAW, { recursive: true });

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error}`);
}

/* A steady wheel from the current position to y, at about pxPerSecond. */
async function wheel(page, y, pxPerSecond) {
  const step = Math.round(pxPerSecond / 30);
  let at = await page.evaluate(() => scrollY);
  const dir = y > at ? 1 : -1;
  while ((y - at) * dir > 0) {
    await page.mouse.wheel(0, Math.min(step, Math.abs(y - at)) * dir);
    await page.waitForTimeout(33);
    at = await page.evaluate(() => scrollY);
  }
}

const browser = await chromium.launch();

for (const c of CANDIDATES) {
  if (only && only !== c.id && only !== c.slug) continue;
  const cssPath = join(DIR, `${c.id}-${c.slug}.css`);
  const jsPath = join(DIR, `${c.id}-${c.slug}.js`);
  const cssText = readFileSync(cssPath, 'utf8');
  const jsText = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';

  for (const [wname, vp] of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
      recordVideo: { dir: RAW, size: vp },
    });
    await ctx.addInitScript(({ cssText, jsText }) => {
      const inject = () => {
        const root = document.documentElement;
        const style = document.createElement('style');
        style.textContent = cssText;
        root.appendChild(style);
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
    await page.waitForTimeout(900);

    const end = await page.evaluate(() => document.querySelector('#quote').getBoundingClientRect().top + scrollY - 40);
    await wheel(page, end, vp.width < 640 ? 700 : 560);   // reading pace
    await page.waitForTimeout(900);
    await wheel(page, 0, vp.width < 640 ? 1500 : 1200);    // back up, brisker
    await page.waitForTimeout(700);

    await ctx.close();                                     // the webm is only written on close
    const webm = readdirSync(RAW).filter((f) => f.endsWith('.webm')).map((f) => join(RAW, f)).sort().pop();
    const staged = join(RAW, `${c.id}-${c.slug}-${wname}.webm`);
    renameSync(webm, staged);
    const out = join(OUT, `scroll-${c.id}-${c.slug}-${wname}.mp4`);
    ffmpeg(['-i', staged, '-vf', 'fps=60', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', out]);
    rmSync(staged);
    console.log(`${out}   ${c.label}`);
  }
}

await browser.close();
