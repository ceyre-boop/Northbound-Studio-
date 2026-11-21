/* templates.html — the two concept builds as source for sale.
 *
 * The page prints no price (Plans/DECISIONS.md #21): the buyer sees it on the
 * payment page a Buy button opens. While no url is set the page asks for an email instead of
 * selling, and both forms post to the quote endpoint with only name and
 * email required. The demo links go to the two builds the site already
 * proxies. Same chrome rules as the homepage: no sideways scroll, no errors.
 */
import { test, expect } from '@playwright/test';
import { TEMPLATES } from '../js/config.js';

test.describe('templates — the page and the table agree', () => {
  test('no price is printed, and config carries none', async ({ page }) => {
    await page.goto('/templates.html');
    for (const key of ['atlas', 'vector', 'engine', 'both']) {
      await expect(page.locator(`[data-tpl="${key}"] .tpl-price`)).not.toContainText('$');
      expect((TEMPLATES as Record<string, object>)[key]).not.toHaveProperty('price');
    }
    await expect(page.locator('[data-buy="atlas"]')).toHaveText('Buy Atlas');
  });

  test('with no shop url, the page asks for an email and sells nothing', async ({ page }) => {
    test.skip(Boolean(TEMPLATES.atlas.url || TEMPLATES.vector.url || TEMPLATES.both.url || TEMPLATES.engine.url), 'a url is set: the Buy buttons are live');
    await page.goto('/templates.html');
    // The engine's demo link shows only when a demo url is set, and then goes there.
    const demo = page.locator('[data-demo="engine"]');
    if (TEMPLATES.engine.demo) await expect(demo).toHaveAttribute('href', TEMPLATES.engine.demo);
    else await expect(demo).toBeHidden(); // no demo url, no dead link
    await page.goto('/templates.html');
    for (const key of ['atlas', 'vector', 'engine']) {
      const box = page.locator(`[data-tpl="${key}"]`);
      await expect(box.locator('.tpl-wait')).toBeVisible();
      await expect(box.locator('.tpl-wait')).toHaveAttribute('action', '/api/quote');
      await expect(box.locator('.tpl-wait input[name="name"]')).toHaveAttribute('required', '');
      await expect(box.locator('.tpl-wait input[name="email"]')).toHaveAttribute('required', '');
      await expect(box.locator('.tpl-wait input[name="need"]')).toHaveValue(/^Template: /);
      await expect(box.locator('[data-buy]')).toBeHidden();
    }
    await expect(page.locator('[data-tpl="both"] [data-buy]')).toBeHidden();
    expect(await page.locator('a[href*="checkout.html"]').count()).toBe(0);
  });

  test('a url in config turns the form into a Buy button', async ({ page }) => {
    // Pretend the shop exists: serve a config with a url for Atlas only.
    await page.route('**/js/config.js', async (route) => {
      const body = (await (await route.fetch()).text()).replace("atlas: { name: 'Atlas', url: '' }", "atlas: { name: 'Atlas', url: 'https://example.com/l/atlas' }");
      await route.fulfill({ body, contentType: 'text/javascript' });
    });
    await page.goto('/templates.html');
    const box = page.locator('[data-tpl="atlas"]');
    await expect(box.locator('[data-buy]')).toBeVisible();
    await expect(box.locator('[data-buy]')).toHaveAttribute('href', 'https://example.com/l/atlas');
    await expect(box.locator('.tpl-wait')).toBeHidden();
    // Vector, with no url, is unchanged.
    await expect(page.locator('[data-tpl="vector"] .tpl-wait')).toBeVisible();
  });

  test('both demos are linked, and the homepage points here', async ({ page }) => {
    await page.goto('/templates.html');
    await expect(page.locator('#atlas a.tpl-demo')).toHaveAttribute('href', '/demos/atlas');
    await expect(page.locator('#vector a.tpl-demo')).toHaveAttribute('href', '/demos/vector/');
    await page.goto('/');
    await expect(page.locator('.site-nav a[href="templates.html"]')).toHaveCount(1);
    await expect(page.locator('footer a[href="templates.html"]')).toHaveCount(1);
  });

  test('no horizontal scroll at 390 or 1280, zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/templates.html');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
});
