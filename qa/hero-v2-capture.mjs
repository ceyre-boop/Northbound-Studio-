/* Capture the hero at 100% zoom for review. Not a test — no assertions, just
 * the frame a person needs to look at. Pass a base URL; PERF_HEADERS carries
 * auth for a protected preview.
 *   bun qa/hero-v2-capture.mjs https://<preview>
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8099';
const headers = (() => { try { return JSON.parse(process.env.PERF_HEADERS || '{}'); } catch { return {}; } })();
const out = 'qa/hero-v2';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const [name, vp] of [
  ['desktop-1440x900', { width: 1440, height: 900 }],
  ['desktop-1280x800', { width: 1280, height: 800 }],
  ['mobile-390x844', { width: 390, height: 844 }]
]) {
  const ctx = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,           // 100% zoom, no retina doubling
    extraHTTPHeaders: headers
  });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.NB_REVEAL?.done);
  // Let the curtain settle into its resting state before the shutter.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
  await ctx.close();
}
await browser.close();
