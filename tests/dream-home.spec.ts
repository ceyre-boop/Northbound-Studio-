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
import { START_SITE_HREF, START_SITE_FALLBACK } from '../js/config.js';

test.describe('homepage — every door is the one door', () => {
  // Plans/the-line.md §2: one item, no custom quotes. Every call-to-action on
  // the homepage is the same door: the Stripe Payment Link for the deposit,
  // or, while that constant is empty, the mailto the HTML already carries.
  test('every call-to-action carries the one href, and none goes to checkout or the old guided build', async ({ page }) => {
    await page.goto('/');
    const ctas = page.locator('header a.btn, main a.btn, .program-status a');
    const n = await ctas.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) await expect(ctas.nth(i)).toHaveAttribute('href', START_SITE_HREF);
    expect(await page.locator('a[href*="checkout.html"]').count()).toBe(0);
    expect(await page.locator('a[href*="build.html"]').count()).toBe(0);
  });

  test('with JavaScript off the doors are the mailto, with the subject line', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    for (const a of await page.locator('[data-start-site]').all()) await expect(a).toHaveAttribute('href', START_SITE_FALLBACK);
    await ctx.close();
  });

  test('the hero says what the button does', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero-cta a')).toHaveText('Start your site');
    await expect(page.locator('.hero-note')).toContainText('$250 to start, $250 at launch');
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

test.describe('the offer — Plans/the-line.md §2, word for word', () => {
  test('one card, one price, one button; the care plan beside it; nothing from the old menu', async ({ page }) => {
    await page.goto('/');
    const offer = page.locator('#packages');
    await expect(offer.locator('.offer-card--site .offer-name')).toHaveText('The Northbound Site');
    await expect(offer.locator('.offer-card--site .offer-price')).toContainText('$500');
    await expect(offer.locator('.offer-card--site .offer-price')).toContainText('Live in 7 days, or $100 off');
    await expect(offer.locator('.offer-card--site .offer-terms')).toHaveText('$250 to start, $250 at launch.');
    await expect(offer.locator('.offer-card--site .offer-list li')).toHaveText([
      'Up to 5 pages',
      'Fast and phone-ready',
      'Your domain connected, or help buying one',
      'Contact form and click-to-call',
      'One round of edits before launch',
    ]);
    await expect(offer.locator('.offer-card--care .offer-price')).toContainText('$49');
    await expect(offer.locator('.offer-card--care .offer-list li')).toHaveText([
      'Hosting, security, updates',
      'Small edits, up to 30 minutes a month',
      "Cancel anytime with 30 days' notice. Your words and photos stay yours.",
    ]);
    await expect(offer.locator('.offer-later')).toContainText('Online stores, booking systems, logo design, extra pages.');
    await expect(offer.locator('a.btn')).toHaveCount(1);
    await expect(offer.locator('a.btn')).toHaveText('Start your site');
    await expect(offer.locator('a.btn')).toHaveAttribute('href', START_SITE_HREF);

    const body = await page.locator('body').innerText();
    for (const gone of ['Beacon', 'Bearing', 'Engine', 'Cheap and Clean', '$3,500', '$8,500', '$600', '$79']) expect(body, gone).not.toContain(gone);
  });

  test('the care plan sits beside the site on desktop and under it on a phone, without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto('/');
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    let site = await box('.offer-card--site'); let care = await box('.offer-card--care');
    expect(care.x).toBeGreaterThan(site.x + site.width - 1);
    await page.setViewportSize({ width: 390, height: 844 });
    site = await box('.offer-card--site'); care = await box('.offer-card--care');
    expect(care.y).toBeGreaterThan(site.y + site.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
