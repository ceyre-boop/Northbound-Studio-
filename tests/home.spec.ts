/* The new homepage — the plain, no-WebGL page that now lives at "/".
 *
 * One spec per acceptance line from the home-swap-v1 brief. Where a bullet
 * names an exact price or phone number, the test asserts against that
 * string verbatim rather than a paraphrase.
 */
import { test, expect } from '@playwright/test';

test.describe('homepage — pricing', () => {
  test('the three prices are present: $600, $3,500, $8,500', async ({ page }) => {
    await page.goto('/');
    const body = await page.locator('body').innerText();
    expect(body).toContain('$600');
    expect(body).toContain('$3,500');
    expect(body).toContain('$8,500');
  });

  test('Bearing is not one of the three price cards, but is reachable', async ({ page }) => {
    await page.goto('/');
    const cardTitles = await page.locator('.pkg h3').allInnerTexts();
    expect(cardTitles).toEqual(['Cheap and Clean', 'Beacon', 'Engine']);
    expect(cardTitles).not.toContain('Bearing');

    // The "Keeping it running" block still names it and links to an account.
    const keeping = page.locator('#bearing');
    await expect(keeping).toContainText('Keeping it running');
    await expect(keeping).toContainText('Bearing');
    await expect(keeping.locator('a[href="account.html"]')).toHaveCount(1);
  });
});

test.describe('homepage — chrome', () => {
  test('header and footer both carry the tappable phone number', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header a[href="tel:+14705738908"]').first()).toBeVisible();
    await expect(page.locator('footer a[href="tel:+14705738908"]').first()).toBeVisible();
  });

  test('"Buy it now" goes to checkout.html', async ({ page }) => {
    await page.goto('/');
    const buy = page.locator('a', { hasText: 'Buy it now' });
    await expect(buy).toHaveAttribute('href', /checkout\.html/);
  });

  test('no horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/');
    expect(errors).toEqual([]);
  });

  test('the page works fully with JavaScript disabled', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('a', { hasText: 'Buy it now' })).toBeVisible();
    const cardTitles = await page.locator('.pkg h3').allInnerTexts();
    expect(cardTitles).toEqual(['Cheap and Clean', 'Beacon', 'Engine']);
    await ctx.close();
  });
});

test.describe('checkout — add-ons and total', () => {
  test('shows both add-ons and a total that updates as each is ticked', async ({ page }) => {
    await page.goto('/checkout.html');
    const care = page.locator('input[name="care"]');
    const bearing = page.locator('input[name="bearing"]');
    await expect(care).toHaveCount(1);
    await expect(bearing).toHaveCount(1);

    await expect(page.locator('#total')).toHaveText('$600.00');

    await care.check();
    await expect(page.locator('#total')).toHaveText('$649.00');

    await bearing.check();
    await expect(page.locator('#total')).toHaveText('$1,249.00');

    await care.uncheck();
    await expect(page.locator('#total')).toHaveText('$1,200.00');
  });

  test('still posts with JavaScript disabled', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/checkout.html');
    const form = page.locator('form#order');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/api/checkout');
    await expect(form.locator('input[name="buy"]')).toHaveValue('clean');
    await expect(form.locator('input[name="care"]')).toHaveCount(1);
    await expect(form.locator('input[name="bearing"]')).toHaveCount(1);
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await ctx.close();
  });
});
