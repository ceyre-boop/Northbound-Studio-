/* buddy-video-v1 — Buddy's keyed wave in the homepage hero.
 *
 * One test per acceptance line. He is decoration with no JavaScript behind
 * him, so every case here is about what the markup and CSS alone guarantee:
 * absent and unfetched on phones, still under reduced motion, no layout shift
 * when he arrives, and a page that is still complete with scripts off.
 */
import { test, expect } from '@playwright/test';

const BUDDY = /brand\/buddy-wave/;

test.describe('Buddy in the hero', () => {
  test('is absent and unfetched below 640px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const fetched: string[] = [];
    page.on('request', (r) => { if (BUDDY.test(r.url())) fetched.push(r.url()); });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await expect(page.locator('.buddy')).toBeHidden();
    expect(await page.locator('.buddy').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    // No source matched, so the element never chose one; the still fell
    // through to its inline data-URI fallback.
    expect(await page.locator('.buddy video').evaluate((v: HTMLVideoElement) => v.currentSrc)).toBe('');
    expect(await page.locator('.buddy-still img').evaluate((i: HTMLImageElement) => i.currentSrc)).toMatch(/^data:/);
    expect(fetched, `Buddy bytes fetched on a phone: ${fetched.join(', ')}`).toEqual([]);
    await ctx.close();
  });

  test('is present and playing above 640px, beside the copy, not over it', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });
    const fig = page.locator('.buddy');
    await expect(fig).toBeVisible();
    const video = page.locator('.buddy video');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(BUDDY);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 2), { timeout: 10_000 }).toBe(true);
    // Once he is showing frames the still underneath has been handed off.
    await expect(page.locator('.buddy-art')).toHaveClass(/is-playing/);

    const fb = await fig.boundingBox();
    for (const sel of ['h1', '.sub', '.byline', '.actions']) {
      const b = await page.locator(sel).boundingBox();
      const overlap = !(b!.x + b!.width <= fb!.x || b!.x >= fb!.x + fb!.width || b!.y + b!.height <= fb!.y || b!.y >= fb!.y + fb!.height);
      expect(overlap, `${sel} sits under Buddy`).toBe(false);
    }
    await ctx.close();
  });

  test('under prefers-reduced-motion the poster shows and the video does not play', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const fetched: string[] = [];
    page.on('request', (r) => { if (/buddy-wave\.(mp4|webm)/.test(r.url())) fetched.push(r.url()); });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await expect(page.locator('.buddy')).toBeVisible();
    const state = await page.locator('.buddy video').evaluate((v: HTMLVideoElement) => ({ src: v.currentSrc, paused: v.paused, ready: v.readyState }));
    expect(state.src).toBe('');
    expect(state.paused).toBe(true);
    expect(fetched, 'a video source was fetched under reduced motion').toEqual([]);
    // The still is the poster here, and it stays: no fade runs under "reduce".
    const still = page.locator('.buddy-still img');
    expect(await still.evaluate((i: HTMLImageElement) => i.currentSrc)).toMatch(/buddy-wave-poster\.webp$/);
    await page.waitForTimeout(1500);
    expect(await still.evaluate((i) => getComputedStyle(i).opacity)).toBe('1');
    await ctx.close();
  });

  test('his arrival shifts nothing: no layout-shift source inside the figure', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as any).__buddyCLS = { total: 0, buddy: 0 };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any[]) {
          if (e.hadRecentInput) continue;
          (window as any).__buddyCLS.total += e.value;
          for (const s of e.sources || []) {
            const node = s.node as Element | null;
            if (node && node.closest && node.closest('.buddy')) (window as any).__buddyCLS.buddy += e.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const cls = await page.evaluate(() => (window as any).__buddyCLS);
    expect(cls.buddy).toBe(0);
    // The reserved box means the figure's size is the same before and after the video has frames.
    const box = await page.locator('.buddy video').evaluate((v: HTMLVideoElement) => {
      const r = v.getBoundingClientRect();
      return { ratio: r.width / r.height, attrRatio: v.width / v.height };
    });
    expect(Math.abs(box.ratio - box.attrRatio)).toBeLessThan(0.01);
    await ctx.close();
  });

  test('zero console errors with him on the page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test('the page is still complete with JavaScript disabled', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    // Buddy is the still: nothing starts him, and the still is not faded.
    await expect(page.locator('.buddy')).toBeVisible();
    await expect(page.locator('.buddy-still img')).toHaveAttribute('width', '522');
    await page.waitForTimeout(800);
    expect(await page.locator('.buddy-still img').evaluate((i) => getComputedStyle(i).opacity)).toBe('1');
    await expect(page.locator('header a[href="tel:+14705738908"]').first()).toBeVisible();
    await expect(page.locator('form.quote-form button[type="submit"]')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toContain('$600');
    expect(body).toContain('$3,500');
    expect(body).toContain('$8,500');
    await ctx.close();
  });
});
