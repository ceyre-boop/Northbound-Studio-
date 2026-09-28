/* question-checkout-v1 — "Before you pay, pause." on checkout.
 *
 * Three optional questions before the payment step. The answers reach the
 * studio (tests/checkout.unit.test.ts and tests/stripe.unit.test.ts cover
 * the emails); this covers the page: the block is there for every package,
 * nothing in it is required, and its closing line survives the script that
 * rewrites the payment reassurance for Beacon and Engine.
 */
import { test, expect } from '@playwright/test';

const PROMISE = 'We read every word of this before we start your build';

for (const buy of ['clean', 'beacon', 'engine']) {
  test(`checkout?buy=${buy}: the pause block is there, optional, and keeps its own words`, async ({ page }) => {
    await page.goto(`/checkout.html?buy=${buy}`);
    const pause = page.locator('#order .pause');
    await expect(pause.locator('h2')).toHaveText('Before you pay, pause.');
    for (const name of ['why_not', 'benefit', 'why_us']) {
      const f = pause.locator(`textarea[name="${name}"]`);
      await expect(f).toBeVisible();
      expect(await f.evaluate((el: HTMLTextAreaElement) => el.required)).toBe(false);
      const id = await f.getAttribute('id');
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
    await expect(pause.locator('.pause-note')).toContainText(PROMISE);
    await expect(page.locator('#order .reassure:not(.pause-note)')).toContainText('No card details are entered on this site');
  });
}

test('no sideways scroll on a phone with the pause block', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/checkout.html?buy=engine');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
