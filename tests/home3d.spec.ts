/* Buddy at work (dev): the loader and the 3D hero on index.html.
 *
 * What these pin down: who gets the scene and who gets the still; that the
 * loader counts real bytes against data/boot-manifest.json, gives way on its
 * own and never comes back in the same session; that the scroll drives the
 * choreography and the pin lets go; and that the page underneath is exactly
 * the page (floors one screen, no layout shift, the copy on top).
 * Frame rate is deliberately not gated here: headless Chromium renders WebGL
 * in software. That budget belongs to scripts/perf.mjs on a real device.
 */
import { test, expect, type Browser } from '@playwright/test';

const BASE = 'http://localhost:' + (process.env.NB_PORT ?? 8099);
const DESK = { width: 1512, height: 797 };
const desktopOnly = (name: string) => name !== 'desktop';

/* A fresh first-time visitor: no nb_boot cookie, motion allowed. */
async function firstVisit(browser: Browser, opts: Parameters<Browser['newContext']>[0] = {}) {
  // An explicit empty storage state: the project's shared one carries the
  // returning-visitor cookie, and newContext() inherits it otherwise.
  const ctx = await browser.newContext({ viewport: DESK, reducedMotion: 'no-preference', storageState: { cookies: [], origins: [] }, ...opts });
  return { ctx, page: await ctx.newPage() };
}

test.describe('who gets the scene', () => {
  test('desktop with motion: the scene runs and the still steps aside', async ({ page }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    await page.setViewportSize(DESK);
    await page.goto('/?clock=0&gov=off');
    await page.waitForFunction(() => (window as any).NB_HOME3D?.stats?.frames > 2, null, { timeout: 20_000 });
    await expect(page.locator('html')).toHaveClass(/home3d-live/);
    await expect(page.locator('.hero canvas.hero-3d')).toHaveCount(1);
    expect(await page.locator('.hero .buddy').evaluate((e) => getComputedStyle(e).visibility)).toBe('hidden');
  });

  for (const [why, url, opts] of [
    ['?gl=off', '/?gl=off', {}],
    ['reduced motion', '/', { reducedMotion: 'reduce' as const }],
    ['a phone', '/', { viewport: { width: 390, height: 844 } }],
  ] as const) {
    test(`${why}: no scene, no loader, no three.js fetched, the still is the hero`, async ({ browser }) => {
      const { ctx, page } = await firstVisit(browser, opts as any);
      const fetched: string[] = [];
      page.on('request', (r) => { if (/three-home|hero3d|boot-manifest/.test(r.url())) fetched.push(r.url()); });
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await expect(page.locator('#nb-boot')).toHaveCount(0);
      await expect(page.locator('canvas.hero-3d')).toHaveCount(0);
      expect(fetched).toEqual([]);
      await expect(page.locator('.hero .buddy')).toBeVisible();
      await ctx.close();
    });
  }
});

test.describe('the loader', () => {
  test('counts real bytes against the manifest, types the line, folds away, and not again this session', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const { ctx, page } = await firstVisit(browser);
    const manifest = await (await fetch(BASE + '/data/boot-manifest.json')).json();
    const totalKb = Math.round(manifest.files.reduce((n: number, f: any) => n + f.bytes, 0) / 1024);
    await page.goto(BASE + '/');
    await expect(page.locator('#nb-boot')).toHaveCount(1);
    await expect(page.locator('#nb-boot .nbb-of')).toHaveText(`/ ${totalKb.toLocaleString('en-US')} KB`);
    await expect(page.locator('#nb-boot .nbb-kb')).toHaveText(String(totalKb), { timeout: 10_000 });
    await expect(page.locator('#nb-boot .nbb-typed')).toHaveText('deploy(better_customers());', { timeout: 5_000 });
    await expect(page.locator('#nb-boot')).toHaveCount(0, { timeout: 8_000 });
    await expect(page.locator('html')).not.toHaveClass(/nb-boot/);
    await page.reload();
    await expect(page.locator('#nb-boot')).toHaveCount(0);
    await ctx.close();
  });

  test('gives way by the cap even if the scene never arrives', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const { ctx, page } = await firstVisit(browser);
    await page.route('**/js/vendor/three/three-home.min.js', () => { /* never answers */ });
    const t0 = Date.now();
    await page.goto(BASE + '/');
    await expect(page.locator('#nb-boot')).toHaveCount(1);
    await expect(page.locator('#nb-boot')).toHaveCount(0, { timeout: 6_000 });
    expect(Date.now() - t0).toBeLessThan(5_500);
    await expect(page.locator('.hero h1')).toBeVisible();
    // And the scene that never came doesn't leave a dead pin behind.
    await expect(page.locator('html')).not.toHaveClass(/home3d-ok/, { timeout: 6_000 });
    const pinned = await page.evaluate(() => (document.querySelector('.hero-pin') as HTMLElement).offsetHeight - (document.querySelector('.hero-stick') as HTMLElement).offsetHeight);
    expect(pinned).toBe(0);
    await ctx.close();
  });

  test('the page under the loader is inert: no tabbing into it, nothing clickable', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const { ctx, page } = await firstVisit(browser);
    await page.route('**/js/vendor/three/three-home.min.js', () => { /* hold the loader up */ });
    await page.goto(BASE + '/');
    await expect(page.locator('#nb-boot')).toHaveCount(1);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    const inPage = await page.evaluate(() => { const a = document.activeElement; return !!a && a !== document.body && !a.closest('#nb-boot'); });
    expect(inPage, 'focus reached a control hidden under the loader').toBe(false);
    await ctx.close();
  });

  test('a scene file that fails gives the page back its still hero, unpinned', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const { ctx, page } = await firstVisit(browser);
    await page.route('**/js/home/buddy-rig.js', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.goto(BASE + '/');
    await expect(page.locator('#nb-boot')).toHaveCount(0, { timeout: 8_000 });
    await expect(page.locator('html')).not.toHaveClass(/home3d-ok/, { timeout: 6_000 });
    await expect(page.locator('.hero .buddy')).toBeVisible();
    await ctx.close();
  });

  test('with JavaScript off there is no loader and the page reads', async ({ browser }) => {
    const { ctx, page } = await firstVisit(browser, { javaScriptEnabled: false });
    await page.goto(BASE + '/');
    await expect(page.locator('#nb-boot')).toHaveCount(0);
    await expect(page.locator('.hero h1')).toBeVisible();
    await ctx.close();
  });
});

test.describe('the walk-off', () => {
  test('when the scene gives up mid-pin, the pin goes and the visitor lands at the top', async ({ page }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    await page.setViewportSize(DESK);
    await page.goto('/?clock=0&gov=off');
    await page.waitForFunction(() => (window as any).NB_HOME3D?.stats?.frames > 2, null, { timeout: 20_000 });
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.evaluate(() => { const c = document.querySelector('canvas.hero-3d') as HTMLCanvasElement; c.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); });
    await expect(page.locator('html')).not.toHaveClass(/home3d-ok/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('canvas.hero-3d')).toHaveCount(0);
    await expect(page.locator('.hero .buddy')).toBeVisible();
  });

  test('scroll drives it: seated at the top, gone at the end of the pin, then the pin lets go', async ({ page }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    await page.setViewportSize(DESK);
    await page.goto('/?clock=0&gov=off');
    await page.waitForFunction(() => (window as any).NB_HOME3D?.stats?.frames > 2, null, { timeout: 20_000 });
    const travel = await page.evaluate(() => (document.querySelector('.hero-pin') as HTMLElement).offsetHeight - (document.querySelector('.hero-stick') as HTMLElement).offsetHeight);
    expect(travel).toBeGreaterThan(500);
    await page.evaluate((y) => window.scrollTo(0, y), travel);
    await expect.poll(() => page.evaluate(() => (window as any).NB_HOME3D.progress), { timeout: 5_000 }).toBeGreaterThan(0.98);
    // Still pinned at the end of the travel: the hero is at the top of the screen.
    expect(await page.evaluate(() => Math.round(document.querySelector('.hero-stick')!.getBoundingClientRect().top))).toBe(0);
    // One screen further and it has let go.
    await page.evaluate((y) => window.scrollTo(0, y + 400), travel);
    expect(await page.evaluate(() => document.querySelector('.hero-stick')!.getBoundingClientRect().top)).toBeLessThan(-300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => (window as any).NB_HOME3D.progress), { timeout: 5_000 }).toBeLessThan(0.02);
  });

  test('the page underneath is the page: floors one screen, the copy above the canvas', async ({ page }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    await page.setViewportSize(DESK);
    await page.goto('/?clock=0&gov=off');
    await page.waitForFunction(() => (window as any).NB_HOME3D?.stats?.frames > 2, null, { timeout: 20_000 });
    const r = await page.evaluate(() => ['.hero', '#offerings', '#packages', '#quote'].map((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().height)));
    for (const h of r) expect(h).toBe(716);
    const onTop = await page.evaluate(() => {
      const b = document.querySelector('.hero .btn-primary')!.getBoundingClientRect();
      return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)!.closest('.btn-primary') !== null;
    });
    expect(onTop, 'the canvas sits over the primary button').toBe(true);
  });

  test('no layout shift while the scene arrives (outside the header)', async ({ page }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    await page.setViewportSize(DESK);
    await page.addInitScript(() => {
      (window as any).__cls = 0;
      // The header's phone pill shifts a hair on font swap with or without the
      // scene (home.spec.ts excludes it the same way); anything else counts.
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as any[]) {
          if (e.hadRecentInput) continue;
          if (e.sources.every((s: any) => s.node && s.node.closest && s.node.closest('.site-header'))) continue;
          (window as any).__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/?clock=0&gov=off');
    await page.waitForFunction(() => (window as any).NB_HOME3D?.stats?.frames > 5, null, { timeout: 20_000 });
    expect(await page.evaluate(() => (window as any).__cls)).toBe(0);
  });
});
