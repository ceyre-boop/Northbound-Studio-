/* Capture the hero with the machine running behind it, for review against
 * the reference render. Not a test — no assertions, just the frames a person
 * needs to look at: 1280 and 390 with motion on, and 1280 under reduced
 * motion, which must be a composed still. Pass a base URL.
 *   bun qa/hero-machine-capture.mjs http://localhost:8099
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8099';
const out = 'qa/hero-machine';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const [name, vp, reducedMotion] of [
  ['desktop-1280x800', { width: 1280, height: 800 }, 'no-preference'],
  ['mobile-390x844', { width: 390, height: 844 }, 'no-preference'],
  ['desktop-1280x800-reduced', { width: 1280, height: 800 }, 'reduce']
]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // A beat, so the still is the hero as it settles rather than mid-fade.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
  await ctx.close();
}
await browser.close();
