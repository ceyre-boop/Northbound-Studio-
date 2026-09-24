/* Screenshot the founding claim and the selectable twelve for review. Not a
 * test — no assertions, just the frames a person has to look at, at 390×844
 * and 1280×800:
 *
 *   quote-claim        the review link and name field on the homepage form
 *   checkout-claim     the same block at checkout, Bearing ticked
 *   panels-unselected  the twelve, nothing picked
 *   panels-three       three picked, the sticky Continue up
 *   continue           the viewport at the sticky Continue
 *   checkout-picked    checkout carrying those three
 *
 *   bun qa/offer-flow-capture.mjs http://localhost:8211
 *   bun qa/offer-flow-capture.mjs http://localhost:8211 --claim   # brief 1 only
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8211';
const claimOnly = process.argv.includes('--claim');
const out = 'qa/offer-flow';
mkdirSync(out, { recursive: true });

const PICK = ['A custom site', 'Booking flow', 'AI intake'];

const browser = await chromium.launch();
for (const [tag, vp] of [['mobile-390', { width: 390, height: 844 }], ['desktop-1280', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const shot = async (name, opts = {}) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, ...opts });
    console.log(`${out}/${tag}-${name}.png`);
  };
  /* Brief 1: the claim on the quote form, Engine picked, name empty. */
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.locator('#f-package').selectOption('engine');
  {
    const b = await page.locator('#founding-claim').evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.top + window.scrollY, h: r.height }; });
    await shot('quote-claim', { fullPage: true, clip: { x: 0, y: b.y - 120, width: vp.width, height: b.h + 240 } });
  }

  /* Brief 1: the claim at checkout with Bearing ticked. */
  await page.goto(`${base}/checkout.html`, { waitUntil: 'networkidle' });
  await page.locator('input[name="bearing"]').check();
  {
    const b = await page.locator('#founding-claim').evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.top + window.scrollY, h: r.height }; });
    await shot('checkout-claim', { fullPage: true, clip: { x: 0, y: b.y - 200, width: vp.width, height: b.h + 320 } });
  }

  if (!claimOnly) {
    /* Brief 2: the twelve, unselected. */
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const list = page.locator('#offerings');
    await list.scrollIntoViewIfNeeded();
    {
      const b = await list.evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.top + window.scrollY, h: r.height }; });
      await shot('panels-unselected', { fullPage: true, clip: { x: 0, y: b.y, width: vp.width, height: b.h } });
    }
    for (const name of PICK) await page.locator(`.offer[data-part="${name}"]`).click();
    await page.waitForTimeout(400);
    {
      const b = await list.evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.top + window.scrollY, h: r.height }; });
      await shot('panels-three', { fullPage: true, clip: { x: 0, y: b.y, width: vp.width, height: b.h } });
    }
    // The viewport as a visitor sees it, Continue fixed bottom-left.
    await page.locator('.offer[data-part="AI intake"]').scrollIntoViewIfNeeded();
    await shot('continue');
    // The foot of the page: Continue must not cover the footer's phone link.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await shot('continue-footer');

    await page.locator('#pick-continue').click();
    await page.waitForURL(/checkout\.html/);
    await page.waitForLoadState('networkidle');
    await shot('checkout-picked', { fullPage: true });
  }
  await ctx.close();
}
await browser.close();
