/* Buddy at work (dev): Colin's Buddy model in the hero, typing at his desk,
 * standing and walking off as the visitor scrolls.
 *
 * Pinned down here: who gets the 3D Buddy and who keeps the still; that the
 * scroll drives the walk-off and the pin lets go; that any failure hands the
 * hero back unpinned; and that the page underneath is exactly the page.
 * Frame rate is not gated: headless Chromium renders WebGL in software. Run
 * this spec serially (it is WebGL, like acts/stage/motion).
 */
import { test, expect, type Browser, type BrowserContext } from '@playwright/test';

const BASE = 'http://localhost:' + (process.env.NB_PORT ?? 8099);
const DESK = { width: 1512, height: 797 };
const desktopOnly = (name: string) => name !== 'desktop';
test.describe.configure({ timeout: 60_000 });

/* A clean context: no nb_gl=off cookie (the project default), motion on. */
const open: BrowserContext[] = [];
test.afterEach(async () => { while (open.length) await open.pop()!.close(); });
async function visit(browser: Browser, opts: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ viewport: DESK, reducedMotion: 'no-preference', storageState: { cookies: [], origins: [] }, ...opts });
  open.push(ctx);
  return ctx.newPage();
}
const live = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => (window as any).NB_HOME3D?.stats?.frames > 2, null, { timeout: 30_000 });

test.describe('who gets Buddy in 3D', () => {
  test('desktop with motion: his model runs, the still steps aside', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    const glb: string[] = [];
    page.on('response', (r) => { if (/brand\/3d\/buddy\.glb/.test(r.url())) glb.push(String(r.status())); });
    await page.goto(BASE + '/?clock=0&gov=off');
    await live(page);
    expect(glb).toContain('200');
    await expect(page.locator('html')).toHaveClass(/home3d-live/);
    await expect(page.locator('.hero canvas.hero-3d')).toHaveCount(1);
    expect(await page.locator('.hero .buddy').evaluate((e) => getComputedStyle(e).visibility)).toBe('hidden');
  });

  for (const [why, url, opts] of [
    ['?gl=off', '/?gl=off', {}],
    ['reduced motion', '/', { reducedMotion: 'reduce' as const }],
    ['a phone', '/', { viewport: { width: 390, height: 844 } }],
  ] as const) {
    test(`${why}: no 3D, nothing extra fetched, the still is the hero`, async ({ browser }) => {
      const page = await visit(browser, opts as any);
      const fetched: string[] = [];
      page.on('request', (r) => { if (/three-home|hero3d|buddy-model|buddy\.glb/.test(r.url())) fetched.push(r.url()); });
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await expect(page.locator('canvas.hero-3d')).toHaveCount(0);
      expect(fetched).toEqual([]);
      await expect(page.locator('.hero .buddy')).toBeVisible();
    });
  }
});

test.describe('the walk-off', () => {
  test('scroll drives it: seated at the top, gone at the end of the pin, then the pin lets go', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.goto(BASE + '/?clock=0&gov=off');
    await live(page);
    const travel = await page.evaluate(() => (document.querySelector('.hero-pin') as HTMLElement).offsetHeight - (document.querySelector('.hero-stick') as HTMLElement).offsetHeight);
    expect(travel).toBeGreaterThan(500);
    await page.evaluate((y) => window.scrollTo(0, y), travel);
    await expect.poll(() => page.evaluate(() => (window as any).NB_HOME3D.progress), { timeout: 10_000 }).toBeGreaterThan(0.98);
    expect(await page.evaluate(() => Math.round(document.querySelector('.hero-stick')!.getBoundingClientRect().top))).toBe(0);
    await page.evaluate((y) => window.scrollTo(0, y + 400), travel);
    expect(await page.evaluate(() => document.querySelector('.hero-stick')!.getBoundingClientRect().top)).toBeLessThan(-300);
  });

  test('the page underneath is the page: floors one screen, the copy above the canvas', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.goto(BASE + '/?clock=0&gov=off');
    await live(page);
    const r = await page.evaluate(() => ['.hero', '#offerings', '#packages', '#quote'].map((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().height)));
    for (const h of r) expect(h).toBe(716);
    const onTop = await page.evaluate(() => {
      const b = document.querySelector('.hero .btn-primary')!.getBoundingClientRect();
      return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)!.closest('.btn-primary') !== null;
    });
    expect(onTop, 'the primary button is covered (it must sit above the canvas)').toBe(true);
  });

  test('no layout shift while he arrives (outside the header)', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.addInitScript(() => {
      (window as any).__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as any[]) {
          if (e.hadRecentInput) continue;
          if (e.sources.every((s: any) => s.node && s.node.closest && s.node.closest('.site-header'))) continue;
          (window as any).__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(BASE + '/?clock=0&gov=off');
    await live(page);
    expect(await page.evaluate(() => (window as any).__cls)).toBe(0);
  });
});

test.describe('the way out', () => {
  test('if his model fails to load, the still hero comes back, unpinned', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.route('**/brand/3d/buddy.glb', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.goto(BASE + '/');
    await expect(page.locator('html')).not.toHaveClass(/home3d-ok/, { timeout: 15_000 });
    await expect(page.locator('.hero .buddy')).toBeVisible();
    expect(await page.evaluate(() => (document.querySelector('.hero-pin') as HTMLElement).offsetHeight - (document.querySelector('.hero-stick') as HTMLElement).offsetHeight)).toBe(0);
  });

  test('a lost GPU context mid-pin: the pin goes and the visitor lands at the top', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.goto(BASE + '/?clock=0&gov=off');
    await live(page);
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.evaluate(() => (document.querySelector('canvas.hero-3d') as HTMLCanvasElement).dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await expect(page.locator('html')).not.toHaveClass(/home3d-ok/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('canvas.hero-3d')).toHaveCount(0);
    await expect(page.locator('.hero .buddy')).toBeVisible();
  });
});
