/* hero-dna-v1 — "We build the machine." and the margin notes.
 *
 * The page never says it sweats the details; it leaves numbered notes in its
 * own margins, each pointing at a decision that is really in this file. The
 * tests below pin the one rule that matters: a note must be true of the page
 * it sits on. Where a note describes something, the test checks the thing.
 */
import { test, expect } from '@playwright/test';

test.describe('the headline', () => {
  test('is "We build the machine." broken by hand after "We build"', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero h1')).toHaveText(/^We build\s*the machine\.$/);
    const lines = await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector('.hero h1')!);
      return new Set(Array.from(r.getClientRects(), (x) => Math.round(x.top))).size;
    });
    expect(lines, 'N°01 says the break is set by hand: exactly two lines').toBe(2);
  });

  test('the lit Dashboard card never sits on the headline, at any desktop width', async ({ page }) => {
    for (const width of [1160, 1240, 1280, 1380, 1439, 1440, 1512, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/?motion=full');
      const r = await page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('.hero h1')!);
        const db = document.querySelector('.hs-db')!;
        if (getComputedStyle(db).display === 'none') return { hit: false, clip: 0 };
        const b = db.getBoundingClientRect();
        const hit = Array.from(range.getClientRects()).some((l) => l.right > b.left && l.left < b.right && l.bottom > b.top && l.top < b.bottom);
        return { hit, clip: b.right - innerWidth };
      });
      expect(r.hit, `the Dashboard card covers the headline at ${width}px`).toBe(false);
      expect(r.clip, `the Dashboard card runs off the screen at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('the margin notes', () => {
  test('number themselves in order, top to bottom, with no gaps', async ({ page }) => {
    await page.goto('/');
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.mnote'))
        .filter((n) => getComputedStyle(n).display !== 'none')
        .map((n) => (n as HTMLElement).getBoundingClientRect().top + scrollY));
    const sorted = [...labels].sort((a, b) => a - b);
    expect(labels).toEqual(sorted);
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  test('N°02 is true: the scene behind the hero drifts on more than one clock', async ({ page }, info) => {
    test.skip(info.project.name === 'desktop-reduced', 'N°02 is hidden under reduced motion, where nothing drifts');
    await page.goto('/');
    const periods = await page.evaluate(() => new Set(
      Array.from(document.querySelectorAll('.hs > *'))
        .map((e) => getComputedStyle(e).animationDuration)
        .filter((d) => d && d !== "0s")).size);
    expect(periods, 'fewer distinct drift periods than the note implies').toBeGreaterThanOrEqual(5);
  });

  test('the motion notes are gone under reduced motion, rather than wrong', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + (process.env.NB_PORT ?? 8099) + '/');
    for (const n of await page.locator('.mnote-motion').all()) await expect(n).toBeHidden();
    await expect(page.locator('.mnote-h1')).toBeVisible();
    await ctx.close();
  });

  test('with motion, a note writes in once it reaches the screen', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + (process.env.NB_PORT ?? 8099) + '/');
    await expect(page.locator('.mnote-h1')).toHaveClass(/is-in/);
    const below = page.locator('.founding-caption + .mnote');
    await expect(below).not.toHaveClass(/is-in/);
    await below.scrollIntoViewIfNeeded();
    await expect(below).toHaveClass(/is-in/);
    await ctx.close();
  });

  test('the veil note is true: checkout links close the page in twelve strips', async ({ page }) => {
    await page.goto('/');
    const cells = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--nb-veil-cells').trim());
    expect(cells).toBe('12');
    expect(await page.locator('.offer').count()).toBe(12);
  });
});
