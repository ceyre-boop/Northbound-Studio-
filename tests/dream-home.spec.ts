/* The dream homepage, and the road from it to the questions.
 *
 * The rebuild pointed every call-to-action straight at checkout.html, so a
 * visitor went from "book a call" to a payment form with nothing asked in
 * between. The guided build at build.html is the discovery; these specs pin
 * the homepage to it, and pin the two things found while putting it back:
 * the wordmark drawn in a cream that vanished on the cream page, and the
 * desktop hero as one screen rather than a wide frame with a robot in it.
 */
import { test, expect } from '@playwright/test';

test.describe('homepage — every door leads to the questions', () => {
  test('no call-to-action goes straight to checkout', async ({ page }) => {
    await page.goto('/');
    const ctas = page.locator('header a.btn, main a.btn, .program-status a');
    const n = await ctas.count();
    expect(n).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < n; i++) await expect(ctas.nth(i)).toHaveAttribute('href', 'build.html');
    expect(await page.locator('a[href*="checkout.html"]').count()).toBe(0);
  });

  test('the hero says what the button does', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero-cta a')).toHaveText('Start your build');
    await expect(page.locator('.hero-note')).toContainText('Eight quick questions');
  });

  test('clicking the hero button lands on step 1 of 8', async ({ page }) => {
    await page.goto('/');
    await page.locator('.hero-cta a').click();
    await expect(page).toHaveURL(/build\.html$/);
    await expect(page.locator('#step-label')).toHaveText('Step 1 of 8');
    await expect(page.locator('#q')).toHaveText('What kind of business?');
  });

  test('the wordmark is the espresso one, so it shows on cream', async ({ page }) => {
    await page.goto('/');
    const marks = page.locator('img[alt="Northbound Studio"]');
    expect(await marks.count()).toBe(2);
    for (let i = 0; i < 2; i++) await expect(marks.nth(i)).toHaveAttribute('src', 'brand/wordmark-espresso.svg');
  });

  test('no horizontal scroll at 390 or 1280', async ({ page }) => {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('zero console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/');
    expect(errors).toEqual([]);
  });
});

test.describe('homepage — the whole view on a desktop', () => {
  test.skip(({ viewport }) => !viewport || viewport.width < 761, 'desktop only');

  test('the hero is one screen: words left, Buddy right, square', async ({ page }) => {
    await page.goto('/');
    const words = await page.locator('.hero-content').boundingBox();
    const buddy = await page.locator('.hero-media').boundingBox();
    expect(words && buddy).toBeTruthy();
    expect(words!.x + words!.width).toBeLessThanOrEqual(buddy!.x + 1);
    expect(Math.abs(buddy!.width - buddy!.height)).toBeLessThanOrEqual(2);
    const hero = await page.locator('.hero').boundingBox();
    const vh = page.viewportSize()!.height;
    expect(hero!.height).toBeGreaterThanOrEqual(vh - 100);
  });
});

test.describe('homepage — Buddy, and the small things that move', () => {
  test('Buddy waves on arrival, and the pause control stops and restarts him', async ({ page }) => {
    await page.goto('/');
    const video = page.locator('.hero-video');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
    const pause = page.locator('[data-hero-pause]');
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  });

  test('the hairline reads 0 at the top and 1 at the bottom', async ({ page }) => {
    await page.goto('/');
    const progress = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--progress')) || 0);
    expect(await progress()).toBe(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(progress).toBeGreaterThan(0.99);
    await expect(page.locator('.scroll-line')).toBeVisible();
  });
});

test.describe('the questions and the counter wear the same clothes', () => {
  for (const path of ['/build.html', '/checkout.html']) {
    test(`${path}: dream tokens, espresso wordmark, email instead of a phone number`, async ({ page }) => {
      await page.goto(path);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe('rgb(247, 246, 242)');
      await expect(page.locator('header img[alt="Northbound Studio"]')).toHaveAttribute('src', 'brand/wordmark-espresso.svg');
      expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
      await expect(page.locator('header a[href^="mailto:"]')).toHaveCount(1);
    });
  }
});
