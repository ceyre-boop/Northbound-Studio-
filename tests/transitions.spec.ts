/* Floor transitions (dev): three seams, each with a movie option (Buddy
 * carries it) and a commercial option (the interface shows what it does).
 * The choice is data-t1/t2/t3 on <html>; motion is scroll-driven and needs
 * html.nb-motion. These tests pin what the options promise: the defaults,
 * the URL override, the preview-only switcher, the coverage strip agreeing
 * with js/spec.js, the floors still one screen, and nothing animating when
 * motion is off.
 */
import { test, expect } from '@playwright/test';

const desktopOnly = (name: string) => name !== 'desktop';

test.describe('the choice', () => {
  test('defaults to movie, commercial, movie', async ({ page }) => {
    await page.goto('/');
    const t = await page.evaluate(() => ['t1', 't2', 't3'].map((k) => document.documentElement.getAttribute('data-' + k)));
    expect(t).toEqual(['movie', 'ad', 'movie']);
  });

  test('the URL overrides it, and nonsense is ignored', async ({ page }) => {
    await page.goto('/?t1=ad&t2=movie&t3=off');
    let t = await page.evaluate(() => ['t1', 't2', 't3'].map((k) => document.documentElement.getAttribute('data-' + k)));
    expect(t).toEqual(['ad', 'movie', 'off']);
    await page.goto('/?t1=<script>&t2=');
    t = await page.evaluate(() => ['t1', 't2'].map((k) => document.documentElement.getAttribute('data-' + k)));
    expect(t).toEqual(['movie', 'ad']);
  });
});

test.describe('the preview switcher', () => {
  test('is absent on a normal host, present with ?lab=1, absent with ?lab=0', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tx-lab')).toHaveCount(0);
    await page.goto('/?lab=0');
    await expect(page.locator('.tx-lab')).toHaveCount(0);
    await page.goto('/?lab=1');
    await expect(page.locator('.tx-lab')).toHaveCount(1);
  });

  test('a choice changes the page and is written into the link', async ({ page }) => {
    await page.goto('/?lab=1');
    await page.locator('.tx-head').click();
    const row = page.locator('.tx-row').nth(1);
    await row.getByRole('radio', { name: 'Movie' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-t2', 'movie');
    await expect(page).toHaveURL(/[?&]t2=movie/);
    await expect(row.locator('.tx-desc')).toContainText('Buddy weighs it up');
    await expect(row.getByRole('radio', { name: 'Movie' })).toHaveAttribute('aria-checked', 'true');
  });

  test('no sideways scroll on a phone with it open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?lab=1');
    await page.locator('.tx-head').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('02 -> 03 commercial: what each package covers', () => {
  test('the strips agree with js/spec.js, part for part', async ({ page }) => {
    await page.goto('/?t2=ad');
    const r = await page.evaluate(async () => {
      const spec = await import('/js/spec.js');
      return ['clean', 'beacon', 'engine'].map((k) => {
        const lit = Array.from(document.querySelectorAll(`.covers[data-pkg="${k}"] li.on`), (li) => li.getAttribute('data-part'));
        return { k, lit, want: spec.OFFERINGS.filter((o: string) => spec.PACKAGES[k].includes.includes(o)) };
      });
    });
    for (const x of r) expect(x.lit, `${x.k} strip`).toEqual(x.want);
    await expect(page.locator('.covers[data-pkg="engine"] li.addon')).toHaveAttribute('data-part', 'AI intake');
  });

  test('picks above are ringed, and each card says how many it covers', async ({ page }) => {
    await page.goto('/?t2=ad');
    await page.locator('.offer[data-part="Brand identity"]').click();
    await page.locator('.offer[data-part="Booking flow"]').click();
    await expect(page.locator('.covers[data-pkg="engine"] .covers-note')).toHaveText('Covers all 2 parts you picked.');
    await expect(page.locator('.covers[data-pkg="beacon"] .covers-note')).toHaveText('Covers 1 of the 2 parts you picked.');
    await expect(page.locator('.covers[data-pkg="clean"] .covers-note')).toHaveText('Covers 0 of the 2 parts you picked.');
    await expect(page.locator('.covers[data-pkg="engine"] li.picked')).toHaveCount(2);
    await expect(page.locator('.covers[data-pkg="engine"]')).toHaveClass(/covers-all/);
  });

  test('hidden when that seam is not the commercial', async ({ page }) => {
    await page.goto('/?t2=movie');
    await expect(page.locator('.covers').first()).toBeHidden();
  });
});

test.describe('the floors still fit', () => {
  for (const q of ['?t2=ad&t3=movie', '?t2=movie&t3=ad', '?t1=off&t2=off&t3=off']) {
    test(`every floor is one screen at 1512x797 with ${q}`, async ({ page }, info) => {
      test.skip(desktopOnly(info.project.name), 'desktop floors only');
      await page.setViewportSize({ width: 1512, height: 797 });
      await page.goto('/' + q);
      const r = await page.evaluate(() => ['.hero', '#offerings', '#packages', '#quote'].map((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().height)));
      for (const h of r) expect(h).toBe(716);
    });
  }

  test('Buddy stands on the two floors only in the movie options', async ({ page }, info) => {
    test.skip(desktopOnly(info.project.name), 'Buddy guides are desktop-only');
    await page.setViewportSize({ width: 1512, height: 797 });
    await page.goto('/?t2=movie&t3=movie');
    await expect(page.locator('.guide-think')).toBeVisible();
    await expect(page.locator('.guide-ready')).toBeVisible();
    await page.goto('/?t2=ad&t3=ad');
    await expect(page.locator('.guide-think')).toBeHidden();
    await expect(page.locator('.guide-ready')).toBeHidden();
  });
});

test.describe('motion', () => {
  test('runs on scroll timelines when motion is allowed', async ({ page }, info) => {
    test.skip(desktopOnly(info.project.name), 'one engine check is enough');
    await page.goto('/?motion=full&t1=movie');
    const r = await page.evaluate(() => {
      const iris = document.querySelector('.hero-iris')!;
      const a = iris.getAnimations()[0] as any;
      return { shown: getComputedStyle(iris).display, timeline: a && a.timeline && a.timeline.constructor.name };
    });
    expect(r.shown).toBe('block');
    expect(r.timeline).toBe('ViewTimeline');
  });

  test('under reduced motion nothing animates and nothing is hidden', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + (process.env.NB_PORT ?? 8099) + '/?t1=movie&t2=ad&t3=ad');
    const r = await page.evaluate(() => ({
      iris: getComputedStyle(document.querySelector('.hero-iris')!).display,
      running: ['.offer', '.pkg', '.quote-form > p', '.covers li'].reduce((n, s) => n + Array.from(document.querySelectorAll(s)).reduce((m, e) => m + e.getAnimations().length, 0), 0),
      offersVisible: Array.from(document.querySelectorAll('.offer')).every((e) => getComputedStyle(e).opacity === '1'),
    }));
    expect(r.iris).toBe('none');
    expect(r.running).toBe(0);
    expect(r.offersVisible).toBe(true);
    await ctx.close();
  });

  test('the honeypot stays off-screen when the form rules itself in', async ({ page }) => {
    await page.goto('/?motion=full&t3=ad');
    const box = await page.locator('.quote-form .hp').boundingBox();
    expect(box === null || box.x < -1000).toBe(true);
  });
});
