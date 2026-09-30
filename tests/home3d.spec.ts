/* Buddy takes the job (dev): Colin's Buddy model on the last floor, under
 * "Tell us what the job is." He walks in from the left as the floor scrolls
 * into view, sits at his desk and types; scrolling back plays it backwards.
 * The hero is main's, untouched.
 *
 * Pinned down: who gets him and who gets main's floor; that nothing of his
 * loads until the floor is near; that scroll drives the arrival; that the
 * floors stay one screen; and that any failure takes the stage away cleanly.
 * Frame rate is not gated (headless renders WebGL in software). Run serially.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

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
const toTheJob = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
const live = (page: Page) => page.waitForFunction(() => (window as any).NB_HOME3D?.stats?.frames > 2, null, { timeout: 30_000 });
const BUDDY_FILES = /three-home|job3d|buddy-model|buddy\.glb/;

test.describe('who gets Buddy', () => {
  test('desktop with motion: nothing of his loads at the top; at the last floor he is there', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    const fetched: string[] = [];
    page.on('request', (r) => { if (BUDDY_FILES.test(r.url())) fetched.push(r.url()); });
    await page.goto(BASE + '/?clock=0&gov=off', { waitUntil: 'networkidle' });
    expect(fetched, 'his files loaded before the last floor was near').toEqual([]);
    // The hero is main's: the still Buddy is there and there is no canvas in it.
    await expect(page.locator('.hero .buddy')).toBeVisible();
    await expect(page.locator('.hero canvas')).toHaveCount(0);
    await toTheJob(page);
    await live(page);
    await expect(page.locator('#quote .job-stage canvas.job-3d')).toHaveCount(1);
    await expect(page.locator('html')).toHaveClass(/home3d-live/);
  });

  for (const [why, url, opts] of [
    ['?gl=off', '/?gl=off', {}],
    ['reduced motion', '/', { reducedMotion: 'reduce' as const }],
    ['a phone', '/', { viewport: { width: 390, height: 844 } }],
  ] as const) {
    test(`${why}: no stage, nothing of his fetched, the floor is main's`, async ({ browser }) => {
      const page = await visit(browser, opts as any);
      const fetched: string[] = [];
      page.on('request', (r) => { if (BUDDY_FILES.test(r.url())) fetched.push(r.url()); });
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await toTheJob(page);
      await page.waitForTimeout(800);
      await expect(page.locator('#quote .job-stage')).toBeHidden();
      expect(fetched).toEqual([]);
    });
  }
});

test.describe('the arrival', () => {
  test('scroll drives it: away at the start, seated at the bottom of the page, and back again', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.goto(BASE + '/?clock=0&gov=off');
    await toTheJob(page);
    await live(page);
    await expect.poll(() => page.evaluate(() => (window as any).NB_HOME3D.progress), { timeout: 10_000 }).toBeGreaterThan(0.98);
    // Back up until the stage's top is just below the fold: he is walking away.
    await page.evaluate(() => {
      const top = document.querySelector('.job-stage')!.getBoundingClientRect().top + scrollY;
      window.scrollTo(0, top - innerHeight + 40);
    });
    await expect.poll(() => page.evaluate(() => (window as any).NB_HOME3D.progress), { timeout: 10_000 }).toBeLessThan(0.15);
  });

  test('the floors stay one screen and the form stays on top', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.goto(BASE + '/?clock=0&gov=off');
    await toTheJob(page);
    await live(page);
    const r = await page.evaluate(() => ['.hero', '#offerings', '#packages', '#quote'].map((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().height)));
    for (const h of r) expect(h).toBe(716);
    const onTop = await page.evaluate(() => {
      const b = document.querySelector('#quote button[type="submit"]')!.getBoundingClientRect();
      return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)!.closest('button[type="submit"]') !== null;
    });
    expect(onTop, 'Send it is covered (it must sit above the canvas)').toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test('no layout shift at load (outside the header)', async ({ browser }, info) => {
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
    await page.goto(BASE + '/?clock=0&gov=off', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => (window as any).__cls)).toBe(0);
  });
});

test.describe('the way out', () => {
  test('if his model fails to load, the stage goes and the floor is main\'s', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.route('**/brand/3d/buddy.glb', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.goto(BASE + '/');
    await toTheJob(page);
    await expect(page.locator('html')).not.toHaveClass(/home3d-ok/, { timeout: 15_000 });
    await expect(page.locator('#quote .job-stage')).toBeHidden();
  });

  test('a lost GPU context takes the stage away', async ({ browser }, info) => {
    test.skip(desktopOnly(info.project.name), 'desktop only');
    const page = await visit(browser);
    await page.goto(BASE + '/?clock=0&gov=off');
    await toTheJob(page);
    await live(page);
    await page.evaluate(() => (document.querySelector('canvas.job-3d') as HTMLCanvasElement).dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await expect(page.locator('html')).not.toHaveClass(/home3d-ok/);
    await expect(page.locator('canvas.job-3d')).toHaveCount(0);
    await expect(page.locator('#quote .job-stage')).toBeHidden();
  });
});
