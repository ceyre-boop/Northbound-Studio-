/* The dream homepage, and the road from it to the questions.
 *
 * The rebuild pointed every call-to-action straight at checkout.html, so a
 * visitor went from "book a call" to a payment form with nothing asked in
 * between. The guided build at build.html is the discovery; these specs pin
 * the homepage to it, and pin the two things found while putting it back:
 * the wordmark drawn in a cream that vanished on the cream page, and Buddy
 * paused by the reduced-motion setting on the one machine he is built on.
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

  test('the wordmark is drawn in a colour that shows on the page', async ({ page }) => {
    // The ground has changed colour before (cream, then smoky grey) and the
    // wordmark once vanished into it. Whatever the palette, the mark's fill
    // must contrast with the body behind it.
    await page.goto('/');
    const marks = page.locator('img[alt="Northbound Studio"]');
    expect(await marks.count()).toBe(2);
    const src = await marks.first().getAttribute('src');
    const svg = await (await page.request.get(src!)).text();
    const fill = (svg.match(/fill="(?:var\([^,]+,\s*)?(#[0-9a-fA-F]{6})/) || [])[1];
    expect(fill, 'the wordmark has a hex fill').toBeTruthy();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    const bgLum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    expect(Math.abs(lum(fill!) - bgLum), `wordmark ${fill} on ${bg}`).toBeGreaterThan(0.4);
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

test.describe('homepage — Buddy', () => {
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

  test('the mp4 is offered first, so Safari never commits to the VP9 WebM it cannot reliably decode', async ({ page }) => {
    await page.goto('/');
    const types = await page.locator('.hero-video source').evaluateAll((els) => els.map((s) => (s as HTMLSourceElement).type));
    expect(types[0]).toBe('video/mp4');
    expect(types).toContain('video/webm');
  });
});

test.describe('the questions, the counter and the landing pages wear the same clothes', () => {
  for (const path of ['/build.html', '/checkout.html', '/account.html', '/account-received.html', '/order-paid.html', '/order-received.html']) {
    test(`${path}: the homepage's ground and wordmark, email instead of a phone number`, async ({ page }) => {
      await page.goto('/');
      const homeBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const homeMark = await page.locator('header img[alt="Northbound Studio"]').getAttribute('src');
      await page.goto(path);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe(homeBg);
      await expect(page.locator('header img[alt="Northbound Studio"]')).toHaveAttribute('src', homeMark!);
      expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
      await expect(page.locator('header a[href^="mailto:"]')).toHaveCount(1);
    });
  }
  test('/thanks.html: the homepage\'s ground, no phone number', async ({ page }) => {
    await page.goto('/');
    const homeBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.goto('/thanks.html');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(homeBg);
    expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(1);
  });
});
