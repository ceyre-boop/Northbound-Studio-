/* lab/transitions/capture.mjs — record each candidate transition as an mp4.
 *
 *   bun lab/transitions/capture.mjs http://localhost:8340
 *   bun lab/transitions/capture.mjs http://localhost:8340 03    # just one
 *
 * Each candidate is a stylesheet (and sometimes a module) injected into the
 * real site, so what gets recorded is the actual homepage becoming the
 * actual checkout — not a mock of it.
 *
 * The recording runs the transition at quarter speed and ffmpeg puts it back
 * to 1x afterwards. Playwright records at about 25fps; a 500ms transition is
 * a dozen frames, which is not enough to judge motion by. Slowing the
 * animation and speeding the file up turns that into roughly 100fps of real
 * detail. Each file then shows the transition twice: once at full speed, the
 * way a customer sees it, then once at quarter speed, the way you judge it.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const base = process.argv[2] || 'http://localhost:8340';
const only = process.argv[3];
const OUT = 'lab/transitions/video';
const RAW = join(OUT, 'raw');
const SLOW = 0.25;           // animation playback rate while recording
const VP = { width: 1280, height: 800 };

const CANDIDATES = [
  { id: '01', slug: 'morph', label: 'the card becomes the page' },
  { id: '02', slug: 'flood', label: 'ink from the pixel they pressed' },
  { id: '03', slug: 'slats', label: 'twelve bands snap shut' },
  { id: '04', slug: 'blueprint', label: 'drafting grid, wireframe, fill' },
  { id: '05', slug: 'dissolve', label: 'the page comes apart into grain' },
];

mkdirSync(RAW, { recursive: true });

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error}`);
}

const browser = await chromium.launch();

for (const c of CANDIDATES) {
  if (only && only !== c.id && only !== c.slug) continue;

  const css = `${c.id}-${c.slug}.css`;
  const js = `${c.id}-${c.slug}.js`;
  const hasJs = existsSync(join('lab/transitions', js));

  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir: RAW, size: VP },
  });

  /* Injected into every document in this context — the homepage on the way
     out and the checkout on the way in, which is what a cross-document view
     transition needs.

     Inline, not a <link>: the incoming document decides whether it is
     opting into the transition before a linked stylesheet has finished
     fetching, and a document that has not seen @view-transition by then
     just navigates. That is a real constraint for shipping too — the
     winner's CSS belongs in the <style> block each page already has, not
     in a separate file. */
  await ctx.addInitScript(
    ({ cssText, jsText, rate }) => {
      const root = document.documentElement;
      const style = document.createElement('style');
      style.textContent = cssText;
      root.appendChild(style);
      if (jsText) {
        const s = document.createElement('script');
        s.textContent = jsText;
        root.appendChild(s);
      }

      /* Slow every view-transition animation down so the recording has
         frames to spare. ffmpeg puts the speed back afterwards. */
      const slow = () => {
        for (const a of document.getAnimations()) {
          try {
            if (a.effect?.pseudoElement?.includes('view-transition')) a.updatePlaybackRate(rate);
          } catch {}
        }
      };
      addEventListener('pagereveal', (e) => {
        if (e.viewTransition) e.viewTransition.ready.then(slow).catch(() => {});
      });
      addEventListener('pageswap', (e) => {
        if (e.viewTransition) e.viewTransition.ready.then(slow).catch(() => {});
      });
    },
    {
      cssText: readFileSync(join('lab/transitions', css), 'utf8'),
      jsText: hasJs ? readFileSync(join('lab/transitions', js), 'utf8') : null,
      rate: SLOW,
    },
  );

  const page = await ctx.newPage();
  await page.goto(`${base}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  // Sit on the price cards for a beat, so the file opens on the "before".
  await page.locator('#packages').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  const buy = page.locator('.pkg a[href^="checkout.html?buy=clean"]').first();
  await buy.hover();
  await page.waitForTimeout(400);
  await buy.click();

  await page.waitForURL(/checkout\.html/, { timeout: 15000 });
  await page.waitForTimeout(4200);   // the transition, at quarter speed
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1400);   // and a beat on the "after"

  await ctx.close();                 // the webm is only written on close

  const webm = readdirSync(RAW).filter((f) => f.endsWith('.webm')).map((f) => join(RAW, f)).sort().pop();
  const staged = join(RAW, `${c.id}-${c.slug}.webm`);
  renameSync(webm, staged);

  /* Full speed, then the same thing at quarter speed, in one file. */
  const fast = join(RAW, `${c.id}-fast.mp4`);
  const slow = join(RAW, `${c.id}-slow.mp4`);
  const common = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-an'];
  ffmpeg(['-i', staged, '-vf', `setpts=${SLOW}*PTS,fps=60`, ...common, fast]);
  ffmpeg(['-i', staged, '-vf', 'fps=60', ...common, slow]);
  ffmpeg(['-i', fast, '-i', slow, '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', ...common,
    join(OUT, `transition-${c.id}-${c.slug}.mp4`)]);
  rmSync(fast); rmSync(slow);

  console.log(`${OUT}/transition-${c.id}-${c.slug}.mp4   ${c.label}`);
}

await browser.close();
