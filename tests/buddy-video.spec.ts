/* buddy-video-v1 — Buddy on the homepage: the keyed wave in the hero, and the
 * pointing clip at the founding prices.
 *
 * One test per acceptance line. He is decoration with almost no JavaScript
 * behind him (a play() on load, an IntersectionObserver for the one below the
 * fold), so every case here is about what the markup and CSS alone guarantee:
 * phones get the small stills and fetch not one video byte, reduced motion
 * gets stills that do not move, nothing shifts when he arrives, nothing is
 * ever under him, and the page is complete with scripts off.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const ANY_VIDEO = /brand\/buddy-(wave|point)\.(mp4|webm)/;
const HERO_VIDEO = /brand\/buddy-wave\.(mp4|webm)/;
const POINT_VIDEO = /brand\/buddy-point\.(mp4|webm)/;

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

function recordRequests(page: Page, pattern: RegExp) {
  const seen: string[] = [];
  page.on('request', (r) => { if (pattern.test(r.url())) seen.push(r.url()); });
  return seen;
}
async function overlaps(a: Locator, b: Locator) {
  const [x, y] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  if (!x || !y) return false;
  return !(y.x + y.width <= x.x || y.x >= x.x + x.width || y.y + y.height <= x.y || y.y >= x.y + x.height);
}
const animationName = (l: Locator) => l.evaluate((el) => getComputedStyle(el).animationName);
const currentSrc = (l: Locator) => l.evaluate((el: HTMLImageElement | HTMLVideoElement) => el.currentSrc);

test.describe('Buddy in the hero', () => {
  test('phones: the salute still beside the copy, rocking, and not one video byte', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const fetched = recordRequests(page, ANY_VIDEO);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const fig = page.locator('.buddy');
    await expect(fig).toBeVisible();
    const still = page.locator('.buddy .buddy-still img');
    expect(await currentSrc(still)).toMatch(/buddy-salute-sm\.webp$/);
    await expect(still).toHaveAttribute('alt', 'Buddy waving hello');
    expect(await animationName(still)).toBe('buddy-rock');
    // Small: he greets, he does not dominate the headline.
    const fb = (await fig.boundingBox())!;
    expect(fb.width).toBeLessThanOrEqual(160);
    expect(fb.height).toBeLessThanOrEqual(170);
    for (const sel of ['h1', '.sub', '.byline', '.actions']) {
      expect(await overlaps(fig, page.locator(sel)), `${sel} sits under Buddy`).toBe(false);
    }
    // No <source> matched either video, so neither chose one, and nothing was fetched.
    expect(await currentSrc(page.locator('.buddy video'))).toBe('');
    expect(await currentSrc(page.locator('.buddy-point video'))).toBe('');
    expect(fetched, `Buddy video bytes fetched on a phone: ${fetched.join(', ')}`).toEqual([]);
    await ctx.close();
  });

  test('desktop: present and playing above 640px, beside the copy, not over it', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    const fig = page.locator('.buddy');
    await expect(fig).toBeVisible();
    const video = page.locator('.buddy video');
    await expect.poll(() => currentSrc(video)).toMatch(HERO_VIDEO);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 2), { timeout: 10_000 }).toBe(true);
    // Once he is showing frames the still underneath has been handed off.
    await expect(page.locator('.buddy .buddy-art')).toHaveClass(/is-playing/);
    for (const sel of ['h1', '.sub', '.byline', '.actions']) {
      expect(await overlaps(fig, page.locator(sel)), `${sel} sits under Buddy`).toBe(false);
    }
    await ctx.close();
  });

  test('under prefers-reduced-motion the poster shows and the video does not play', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const fetched = recordRequests(page, ANY_VIDEO);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await expect(page.locator('.buddy')).toBeVisible();
    const state = await page.locator('.buddy video').evaluate((v: HTMLVideoElement) => ({ src: v.currentSrc, paused: v.paused, ready: v.readyState }));
    expect(state.src).toBe('');
    expect(state.paused).toBe(true);
    expect(fetched, 'a video source was fetched under reduced motion').toEqual([]);
    // The still is the poster here, and it stays: no fade runs under "reduce".
    const still = page.locator('.buddy .buddy-still img');
    expect(await currentSrc(still)).toMatch(/buddy-wave-poster\.webp$/);
    await page.waitForTimeout(1500);
    expect(await still.evaluate((i) => getComputedStyle(i).opacity)).toBe('1');
    await ctx.close();
  });

  test('phones under prefers-reduced-motion: the stills, and they do not move', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const fetched = recordRequests(page, ANY_VIDEO);
    await page.goto('/', { waitUntil: 'networkidle' });
    const hero = page.locator('.buddy .buddy-still img');
    expect(await currentSrc(hero)).toMatch(/buddy-salute-sm\.webp$/);
    expect(await animationName(hero)).toBe('none');
    await page.locator('.founding-buddy').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const point = page.locator('.buddy-point .buddy-still img');
    expect(await currentSrc(point)).toMatch(/buddy-thinking-sm\.webp$/);
    expect(await animationName(point)).toBe('none');
    expect(await point.evaluate((i) => i.getAnimations().length)).toBe(0);
    expect(fetched).toEqual([]);
    await ctx.close();
  });
});

test.describe('Buddy at the founding prices', () => {
  test('desktop: waits below the fold, then points on scroll — up into the founding cards', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const fetched = recordRequests(page, POINT_VIDEO);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Lazy: nothing for him has moved over the wire while he is off screen.
    expect(fetched, 'the pointing clip was fetched before it was in view').toEqual([]);
    const video = page.locator('.buddy-point video');
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

    await page.locator('.founding-buddy').scrollIntoViewIfNeeded();
    await expect.poll(() => currentSrc(video)).toMatch(POINT_VIDEO);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 2), { timeout: 10_000 }).toBe(true);
    await expect(page.locator('.buddy-point .buddy-art')).toHaveClass(/is-playing/);
    expect(fetched.length).toBeGreaterThan(0);

    // Geometry: he stands below the price row, left of the founding cards,
    // and the render points up and to his left — so the point lands in
    // Beacon / Engine, not off into space. The caption sits beside him.
    const fig = (await page.locator('.buddy-point').boundingBox())!;
    const grid = (await page.locator('.pkg-grid').boundingBox())!;
    const beacon = (await page.locator('.pkg').filter({ has: page.locator('h3', { hasText: /^Beacon$/ }) }).boundingBox())!;
    const caption = page.locator('.founding-caption');
    expect(fig.y).toBeGreaterThanOrEqual(grid.y + grid.height - 1);
    expect(fig.x + fig.width / 2).toBeLessThan(beacon.x + beacon.width);
    expect((await caption.boundingBox())!.x).toBeGreaterThan(fig.x + fig.width - 1);
    expect(await overlaps(page.locator('.buddy-point'), caption)).toBe(false);
    await ctx.close();
  });

  test('desktop under reduced motion: the pointing poster, no clip, no fetch', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const fetched = recordRequests(page, POINT_VIDEO);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.locator('.founding-buddy').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    expect(await currentSrc(page.locator('.buddy-point .buddy-still img'))).toMatch(/buddy-point-poster\.webp$/);
    expect(await currentSrc(page.locator('.buddy-point video'))).toBe('');
    expect(fetched).toEqual([]);
    await ctx.close();
  });

  test('phones: the thinking still, one shrug on arrival, then rest; nothing under him', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const fetched = recordRequests(page, ANY_VIDEO);
    await page.goto('/', { waitUntil: 'networkidle' });
    const fig = page.locator('.buddy-point');
    await expect(fig).not.toHaveClass(/is-seen/);
    await page.locator('.founding-buddy').scrollIntoViewIfNeeded();
    await expect(fig).toHaveClass(/is-seen/);
    const still = page.locator('.buddy-point .buddy-still img');
    expect(await currentSrc(still)).toMatch(/buddy-thinking-sm\.webp$/);
    expect(await animationName(still)).toBe('buddy-shrug');
    // Plays once: after it has run, no animation is live on him.
    await expect.poll(() => still.evaluate((i) => i.getAnimations().length), { timeout: 5_000 }).toBe(0);
    const fb = (await fig.boundingBox())!;
    expect(fb.height).toBeLessThanOrEqual(160);
    expect(await overlaps(fig, page.locator('.founding-caption'))).toBe(false);
    for (const card of await page.locator('.pkg').all()) expect(await overlaps(fig, card)).toBe(false);
    expect(await overlaps(fig, page.locator('.keeping'))).toBe(false);
    expect(fetched).toEqual([]);
    await ctx.close();
  });
});

test.describe('Buddy, either of him', () => {
  test('arrival shifts nothing: no layout-shift source inside either figure', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as any).__buddyCLS = { total: 0, buddy: 0 };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any[]) {
          if (e.hadRecentInput) continue;
          (window as any).__buddyCLS.total += e.value;
          for (const s of e.sources || []) {
            const node = s.node as Element | null;
            if (node && node.closest && (node.closest('.buddy') || node.closest('.founding-buddy'))) (window as any).__buddyCLS.buddy += e.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.locator('.founding-buddy').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    const cls = await page.evaluate(() => (window as any).__buddyCLS);
    expect(cls.buddy).toBe(0);
    // The reserved boxes mean each figure is the same size before and after it has frames.
    for (const sel of ['.buddy video', '.buddy-point video']) {
      const box = await page.locator(sel).evaluate((v: HTMLVideoElement) => {
        const r = v.getBoundingClientRect();
        return { ratio: r.width / r.height, attrRatio: v.width / v.height };
      });
      expect(Math.abs(box.ratio - box.attrRatio), sel).toBeLessThan(0.01);
    }
    await ctx.close();
  });

  test('zero console errors with both of him on the page, top to bottom', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.locator('.founding-buddy').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    expect(errors).toEqual([]);
  });

  test('the page is still complete with JavaScript disabled', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: DESKTOP });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    // Buddy is the still, twice: nothing starts either clip, and neither still is faded.
    await expect(page.locator('.buddy')).toBeVisible();
    await expect(page.locator('.buddy .buddy-still img').first()).toHaveAttribute('width', '522');
    await page.locator('.founding-buddy').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(await page.locator('.buddy .buddy-still img').first().evaluate((i) => getComputedStyle(i).opacity)).toBe('1');
    const point = page.locator('.buddy-point .buddy-still img');
    await expect(point).toBeVisible();
    expect(await currentSrc(point)).toMatch(/buddy-point-poster\.webp$/);
    expect(await point.evaluate((i) => getComputedStyle(i).opacity)).toBe('1');
    await expect(page.locator('header a[href="tel:+14705738908"]').first()).toBeVisible();
    await expect(page.locator('form.quote-form button[type="submit"]')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toContain('$600');
    expect(body).toContain('$3,500');
    expect(body).toContain('$8,500');
    await ctx.close();
  });
});
