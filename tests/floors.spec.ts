/* floors-v1 — on a desktop screen each floor is exactly one screen.
 *
 * The hero fills it in green, edge to edge, and every floor below was cut
 * down until it fits. If copy grows and a floor spills past the screen, this
 * is the test that says so, by name and by how many pixels.
 */
import { test, expect } from '@playwright/test';

const FLOORS = ['.hero', '#offerings', '#packages', '#quote'];

for (const [width, height] of [[1512, 797], [1440, 900], [1920, 1080]] as const) {
  test(`at ${width}x${height} every floor is one screen tall`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one viewport sweep is enough');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const r = await page.evaluate((sels) => {
      const head = document.querySelector('.site-header')!.getBoundingClientRect().height;
      return sels.map((s) => ({ s, h: Math.round(document.querySelector(s)!.getBoundingClientRect().height), screen: Math.round(innerHeight - head) }));
    }, FLOORS);
    for (const f of r) expect(f.h, `${f.s} is ${f.h - f.screen}px taller than one screen`).toBe(f.screen);
  });
}

test('the hero is green to its bottom edge, with no white band under it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop floors only');
  await page.setViewportSize({ width: 1512, height: 797 });
  await page.goto('/');
  const bottom = await page.evaluate(() => Math.round(document.querySelector('.hero')!.getBoundingClientRect().bottom));
  expect(bottom).toBe(797);
});
