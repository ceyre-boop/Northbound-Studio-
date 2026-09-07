import { test, expect, Page } from '@playwright/test';

/**
 * The descent's floor/elevator conceit is deleted, so tests/descent.spec.ts and
 * tests/snap.spec.ts went with it — they asserted floor readouts, `«`/`»` floor
 * nav and CSS scroll-snap, none of which exist. This is their replacement,
 * written against the rebuilt composition.
 *
 * The rule these encode: the site must be legible and complete with every
 * enhancement switched off. Motion, GPU and the virtual scroll are additive.
 */

const SECTIONS = ['hero', 'work', 'argument', 'contact'];

async function ready(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}

/** Visible means: has a box, is not hidden, and is not clipped to nothing. */
async function visibleText(page: Page, selector: string) {
  return page.$$eval(selector, (els) =>
    els.filter((el) => {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
        && !/inset\(.*100%|circle\(0/.test(s.clipPath);
    }).map((el) => (el.textContent || '').trim()));
}

test.describe('the rebuilt site', () => {
  test('the template is gone', async ({ page }) => {
    await ready(page);
    const html = await page.content();
    for (const artifact of ['x-import', 'sc-if', 'sc-for', '{{', 'data-floor', 'FLOOR 0', '_ds_bundle', 'support.js']) {
      expect(html, `template artifact "${artifact}" is still in the page`).not.toContain(artifact);
    }
  });

  test('every section is present and in order', async ({ page }) => {
    await ready(page);
    const found = await page.$$eval('[data-section]', (els) =>
      els.map((e) => e.getAttribute('data-section')));
    expect(found).toEqual(SECTIONS);
  });

  test('the promises that sell the studio are on the page', async ({ page }) => {
    await ready(page);
    const text = (await page.textContent('body')) || '';
    for (const promise of ['48', '1,500', 'Text us']) {
      expect(text, `the "${promise}" promise is missing`).toContain(promise);
    }
    // The old build shipped a Buddy line promising "two weeks" while every
    // other surface promised 48 hours. It must never come back.
    expect(text.toLowerCase()).not.toContain('two weeks');
  });

  test('the contact form offers all four options and can be filled', async ({ page }) => {
    await ready(page);
    const opts = await page.$$eval('.option__label', (els) => els.map((e) => (e.textContent || '').trim()));
    expect(opts).toEqual([
      'A new marketing site', 'An online store',
      'A rebuild of what I have', 'Something with motion or 3D',
    ]);
    await page.locator('#opt-1').check();
    await expect(page.locator('#opt-1')).toBeChecked();
    await page.locator('#contact-email').fill('someone@example.com');
    await expect(page.locator('#project-submit')).toHaveText(/send project details/i);
  });

  test('a failed send says so instead of faking success', async ({ page }) => {
    await ready(page);
    // FORM_ENDPOINT is null until a live endpoint is configured; the finale must
    // admit that rather than showing a success state for a lead nobody received.
    await page.locator('#contact-email').fill('someone@example.com');
    await page.locator('#project-submit').click();
    await expect(page.locator('#project-status')).toHaveAttribute('data-state', 'err', { timeout: 5000 });
    await expect(page.locator('#project-form')).toBeVisible();
  });

  test('content survives every enhancement being switched off', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // With no JS at all the page must still be black, laid out, and readable.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');
    const sections = await page.$$eval('[data-section]', (e) => e.length);
    expect(sections).toBe(SECTIONS.length);
    await ctx.close();
  });

  test('reduced motion reveals everything immediately', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const clipped = await page.$$eval('[data-reveal]', (els) =>
      els.filter((el) => /inset\(.*100%|circle\(0/.test(getComputedStyle(el).clipPath)).length);
    expect(clipped, 'reduced motion must not leave content clipped').toBe(0);
    await ctx.close();
  });

  test('nothing overflows its section at any viewport', async ({ browser }) => {
    for (const [w, h] of [[1076, 494], [768, 500], [390, 844], [1280, 800], [1440, 700], [1512, 982]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `horizontal overflow at ${w}x${h}`).toBeLessThanOrEqual(0);
      await ctx.close();
    }
  });
});
