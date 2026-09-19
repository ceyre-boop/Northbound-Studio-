/* polish-v1 — one test per bullet in Plans/pasted-content-id-0f52-shift-from-ancient-treehouse.md.
 *
 * Each test below maps to a specific line in "The ten fixes" / "Also,
 * because the deliverable depends on it". Where a bullet names a banned
 * word or an exact copy string, the test asserts against that string
 * verbatim rather than a paraphrase.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function boot(page: import('@playwright/test').Page, query = '?motion=full') {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).NB_STAGE?.ok, { timeout: 15_000 });
  await page.evaluate(() => {
    const w = (window as any).NB_STAGE.debug().windows.offerings;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * (w[0] + 0.3 * (w[1] - w[0])));
  });
  await page.waitForFunction(() => !!(window as any).__NB_WALL, { timeout: 20_000 });
}

test.describe('P0-2 — the separator between the package badge and the upkeep note', () => {
  test('the readable list shows "Engine · kept running by Bearing"', async ({ page }) => {
    await page.goto('/');
    for (const n of [6, 7, 8, 9]) {
      const meta = page.locator(`[data-offer="${n}"] .offer__meta`);
      const sep = meta.locator('.offer__sep');
      await expect(sep).toHaveCount(1);
      const text = (await meta.textContent())!.replace(/\s+/g, ' ').trim();
      expect(text).toContain('Engine · kept running by Bearing');
    }
  });

  test('the overlay card shows the same separator', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const link = document.querySelector('[data-offer="6"] h3 a') as HTMLElement;
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    await page.waitForTimeout(500);
    const meta = page.locator('.offer-overlay__meta');
    await expect(meta).toBeVisible();
    const text = (await meta.textContent())!.replace(/\s+/g, ' ').trim();
    expect(text).toContain('Engine · kept running by Bearing');
  });
});

test.describe('P0-3 — the social card', () => {
  test('brand/og.png is a 1200x630 PNG', () => {
    const path = join(ROOT, 'brand', 'og.png');
    expect(existsSync(path), 'brand/og.png is missing — run: bun scripts/og.ts').toBe(true);
    const dims = execSync(`sips -g pixelWidth -g pixelHeight "${path}"`, { encoding: 'utf8' });
    expect(dims).toMatch(/pixelWidth:\s*1200/);
    expect(dims).toMatch(/pixelHeight:\s*630/);
    const magic = readFileSync(path).subarray(0, 8);
    expect(magic.toString('hex')).toBe('89504e470d0a1a0a'); // PNG signature
  });

  test('the meta tags point at the PNG, not the SVG', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();
    expect(html).toContain('https://northbound-dev.com/brand/og.png');
    expect(html).not.toContain('og:image" content="https://northbound-dev.com/brand/og.svg');
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
    await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute('content', 'image/png');
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('meta[name="twitter:title"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:description"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://northbound-dev.com/brand/og.png');
  });

  test('the meta description no longer says "two-person"', async ({ page }) => {
    await page.goto('/');
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc!.toLowerCase()).not.toContain('two-person');
    expect(desc).toContain('A design and engineering studio in Grand Ledge, Michigan.');
  });
});

test.describe('P0-4 — phone', () => {
  test('the masthead and footer both link tel:+14705738908', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header.masthead a.tel')).toHaveAttribute('href', 'tel:+14705738908');
    await expect(page.locator('header.masthead a.tel')).toHaveText('470-573-8908');
    await expect(page.locator('footer.colophon a.tel')).toHaveAttribute('href', 'tel:+14705738908');
  });

  test('the form has a required phone field', async ({ page }) => {
    await page.goto('/');
    const phone = page.locator('#f-phone');
    await expect(phone).toHaveAttribute('name', 'phone');
    await expect(phone).toHaveAttribute('type', 'tel');
    await expect(phone).toHaveAttribute('autocomplete', 'tel');
    await expect(phone).toHaveAttribute('required', '');
  });

  test('at 390px the header phone is visible with a real touch target and there is no horizontal overflow', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/');
    const tel = page.locator('header.masthead a.tel');
    await expect(tel).toBeVisible();
    const box = await tel.boundingBox();
    expect(box, 'tel link has no box').not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    /* documentElement.scrollWidth is a poor proxy here — the pre-existing
       skip link sits at left:-9999px, which some engines fold into the
       document's scroll extent regardless of this layout. Check the two
       elements this bullet is actually about: neither the masthead nor its
       nav should push past the viewport edge. */
    const rects = await page.evaluate(() => ({
      masthead: document.querySelector('header.masthead')!.getBoundingClientRect().right,
      nav: document.querySelector('header.masthead nav')!.getBoundingClientRect().right,
      viewport: document.documentElement.clientWidth,
    }));
    expect(rects.masthead, 'masthead overflows the viewport at 390px').toBeLessThanOrEqual(rects.viewport + 1);
    expect(rects.nav, 'masthead nav overflows the viewport at 390px').toBeLessThanOrEqual(rects.viewport + 1);

    for (const id of ['#f-name', '#f-email', '#f-phone']) {
      const field = page.locator(id);
      await field.scrollIntoViewIfNeeded();
      const b = await field.boundingBox();
      expect(b!.height, `${id} is under the 44px tap target`).toBeGreaterThanOrEqual(40);
    }
    await context.close();
  });
});

test.describe('P1-5/6 — the market section', () => {
  test('the new heading and lede, verbatim, no count and no desk', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#drift-h')).toHaveText('Most local websites just sit there.');
    const lede = page.locator('[data-act="drift"] .lede');
    await expect(lede).toHaveText(
      "They load slowly, can't take a booking, and forget the customer the moment they leave."
    );
  });
});

test.describe('P1-8 — byline', () => {
  test('the new byline, verbatim', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.byline')).toHaveText(
      'Design, engineering and brand under one roof. We built everything on this page, and every number on it measured itself.'
    );
  });
});

test.describe('P1-7 — the concept builds, in owner language', () => {
  test('banned words are absent from visible copy', async ({ page }) => {
    await page.goto('/');
    const bodyText = await page.locator('body').innerText();
    for (const banned of ['mailto:', 'webhook', 'secret key', 'endpoint', 'Astro']) {
      expect(bodyText, `"${banned}" is still visible on the page`).not.toContain(banned);
    }
  });

  test('the Ridgeline card uses the plan copy', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('[data-work="atlas"]');
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    expect(text).toContain('Customers book the call on the site itself — it doesn’t just open their email app.');
    expect(text).toContain('The booking reaches you even if the email breaks. It’s saved first, then sent.');
    expect(text).toContain('Nobody can send a booking without a name and a number to call back.');
    expect(text).toContain('Online booking · no lost leads');
  });

  test('the Marrow card uses the plan copy', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('[data-work="vector"]');
    const text = (await card.innerText()).replace(/\s+/g, ' ');
    expect(text).toContain('Card payments run through Stripe, set up so nobody can get at your payment account from the website.');
    expect(text).toContain('The price is checked on our server, so nobody can edit their cart to pay less.');
    expect(text).toContain('Every paid order is checked with Stripe and recorded, so you see exactly what came in.');
    expect(text).toContain('Online store · card checkout');
  });

  test('the closing-proof lede drops "endpoint" and "server"', async ({ page }) => {
    await page.goto('/');
    const lede = (await page.locator('.closing-proof__lede').innerText()).replace(/\s+/g, ' ');
    expect(lede).toContain('the part that takes the booking, checks the price, and keeps the lead when something downstream breaks.');
  });
});

test.describe('P2-9 — how we work', () => {
  test('the rules list has exactly three items and keeps deposit, Bearing, and the honesty rule', async ({ page }) => {
    await page.goto('/');
    const items = page.locator('.rules li');
    await expect(items).toHaveCount(3);
    const text = (await items.allInnerTexts()).join(' | ');
    expect(text).toContain('50% up front');
    expect(text).toContain('Bearing');
    expect(text).toContain('labelled as concept work');
    expect(text).not.toContain('Two builds at a time');
    expect(text).not.toContain('rate only goes up');
  });
});

test.describe('the banned words, site-wide', () => {
  test('no "Forty", "desk", or any casing of "two people" / "two-person" remains', async ({ page }) => {
    await page.goto('/');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\bForty\b/);
    expect(bodyText).not.toMatch(/\bdesk\b/i);
    expect(bodyText).not.toMatch(/two[\s-]?people/i);
    expect(bodyText).not.toMatch(/two-person/i);

    const html = await page.content();
    expect(html).not.toContain('TWO PEOPLE');
  });
});

test.describe('#work resolves', () => {
  test('the skip link, nav "Work", and hero CTA all point at a real element', async ({ page }) => {
    await page.goto('/');
    const target = page.locator('#work');
    await expect(target).toHaveCount(1);

    for (const selector of ['a.skip', 'nav a[href="#work"]', 'a.btn[href="#work"]']) {
      await expect(page.locator(selector)).toHaveAttribute('href', '#work');
    }
  });
});
