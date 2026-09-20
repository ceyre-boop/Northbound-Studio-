/* Salvage — the rescued card morph, re-expressed on js/springs.js presets.
 *
 * The morph feature itself (the card-becomes-overlay transform, the
 * flying-to-basket ghost, the basket chip arrival) was already landed on
 * main at eb9a984 by an earlier pass — these tests exist because it had
 * never had its own coverage, and because this pass changed its timings
 * to come from js/springs.js rather than hand-picked cubic-bezier literals.
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

/* Matches tests/offerings.spec.ts's own boot(): the overlay (and Card.init())
 * only exist once the offerings act has actually initialised, which happens
 * as the Stage scrolls it into its active window — not merely at page load. */
async function boot(page, query = '?motion=full') {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).NB_STAGE?.ok, { timeout: 15_000 });
  await page.evaluate(() => {
    const w = (window as any).NB_STAGE.debug().windows.offerings;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * (w[0] + 0.3 * (w[1] - w[0])));
  });
  await page.waitForFunction(() => !!(window as any).__NB_WALL, { timeout: 20_000 });
  await page.waitForFunction(() => !!document.querySelector('.offer-overlay__panel'), { timeout: 20_000 });
}

test.describe('the rescued card morph', () => {
  test('opening an offer card morphs the overlay open, in place, with no page shift', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.reducedMotion === 'reduce', 'covered separately by the reduced-motion test below');
    await boot(page);

    const item = page.locator('[data-offer="2"]');
    await item.scrollIntoViewIfNeeded();

    // Captured only once our own scrollIntoViewIfNeeded is settled — the
    // gate below is on what OPENING the overlay does to the page, not on
    // getting the card on screen in the first place.
    const before = await page.evaluate(() => ({
      scrollY: window.scrollY,
      height: document.documentElement.scrollHeight
    }));

    await page.evaluate(() => document.querySelector<HTMLElement>('[data-offer="2"] h3 a')!.click());

    // Mid-morph: the panel has been told where the card is and the open
    // state has just landed — the custom properties card.js writes before
    // [data-open] must be real numbers, not the unset default.
    const midFlight = await page.evaluate(() => {
      const panel = document.querySelector('.offer-overlay__panel') as HTMLElement;
      return {
        scale: panel.style.getPropertyValue('--card-scale'),
        ox: panel.style.getPropertyValue('--card-ox'),
        open: document.querySelector('.offer-overlay')!.getAttribute('data-open')
      };
    });
    expect(Number(midFlight.scale), 'no real --card-scale was written before the panel opened').toBeGreaterThan(0);
    expect(midFlight.ox, '--card-ox was never set').not.toBe('');
    expect(midFlight.open).toBe('true');

    // After the spring settles, the overlay is open and readable.
    await page.waitForTimeout(700);
    await expect(page.locator('.offer-overlay')).toHaveAttribute('data-open', 'true');
    await expect(page.locator('.offer-overlay__panel')).toBeVisible();

    const after = await page.evaluate(() => ({
      scrollY: window.scrollY,
      height: document.documentElement.scrollHeight
    }));
    expect(after.scrollY, 'opening the overlay scrolled the page').toBe(before.scrollY);
    expect(after.height, 'opening the overlay changed document height — the CLS gate is exactly 0').toBe(before.height);
  });

  test('closing the overlay returns focus to the card and finishes hidden, not mid-flight', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.reducedMotion === 'reduce', 'covered separately by the reduced-motion test below');
    await boot(page);

    const item = page.locator('[data-offer="2"]');
    await item.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-offer="2"] h3 a')!.click());
    await page.waitForTimeout(400);
    await expect(page.locator('.offer-overlay')).toHaveAttribute('data-open', 'true');

    await page.keyboard.press('Escape');
    // CLOSE_MS is 300ms in js/offerings/card.js — wait comfortably past it.
    await page.waitForTimeout(600);

    await expect(page.locator('.offer-overlay')).not.toHaveAttribute('data-open', 'true');
    const state = await page.evaluate(() => {
      const overlay = document.querySelector('.offer-overlay') as HTMLElement;
      return { hidden: overlay.hidden, focused: document.activeElement === document.querySelector('[data-offer="2"] h3 a') };
    });
    expect(state.hidden, 'the overlay never finished hiding after it closed').toBe(true);
    expect(state.focused, 'focus did not return to the card that opened it').toBe(true);
  });

  test('adding an offering flies a ghost chip toward the basket', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.reducedMotion === 'reduce', 'the ghost is skipped outright under reduced motion — see the next test');
    await boot(page);

    const btn = page.locator('[data-offer="2"] .offer__addbtn');
    await btn.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-offer="2"] .offer__addbtn')!.click());

    // The ghost is created synchronously in flyToBasket() and removed on
    // transitionend or a 700ms safety timer — caught here mid-flight.
    const ghost = page.locator('.basket-ghost[data-fly]');
    await expect(ghost).toHaveCount(1);

    await expect(page.locator('[data-basket-list] li')).toHaveCount(1);

    // It cleans up after itself.
    await page.waitForTimeout(900);
    await expect(page.locator('.basket-ghost')).toHaveCount(0);
  });

  test('reduced motion skips the morph and the ghost outright', async ({ page }) => {
    // ?still=1 is the same determinism flag reduced()/STILL checks in both
    // js/panels.js and js/offerings/card.js — equivalent to prefers-reduced-motion.
    await boot(page, '?still=1');

    const item = page.locator('[data-offer="2"]');
    await item.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-offer="2"] h3 a')!.click());

    const state = await page.evaluate(() => {
      const panel = document.querySelector('.offer-overlay__panel') as HTMLElement;
      return {
        open: document.querySelector('.offer-overlay')!.getAttribute('data-open'),
        scale: panel.style.getPropertyValue('--card-scale'),
        transitionDuration: getComputedStyle(panel).transitionDuration
      };
    });
    expect(state.open, 'reduced motion must still open the overlay, just without the morph').toBe('true');
    expect(state.scale, 'the reduced-motion branch must never write --card-scale — there is no morph to position').toBe('');

    const btn = page.locator('[data-offer="3"] .offer__addbtn');
    await btn.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-offer="3"] .offer__addbtn')!.click());
    await page.waitForTimeout(50);
    await expect(page.locator('.basket-ghost'), 'a ghost flew under reduced motion').toHaveCount(0);
  });

  test('CLS stays at 0 across opening, adding, and closing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.reducedMotion === 'reduce', 'reduced motion never animates in the first place');
    await boot(page);

    const item = page.locator('[data-offer="2"]');
    await item.scrollIntoViewIfNeeded();

    // Observer attached only once our own scrollIntoViewIfNeeded has
    // settled, and not `buffered` — the gate is on what the morph/ghost/close
    // sequence itself does, not on getting the card on screen beforehand.
    await page.evaluate(() => {
      (window as any).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) (window as any).__cls += entry.value;
        }
      }).observe({ type: 'layout-shift' });
    });

    await page.evaluate(() => document.querySelector<HTMLElement>('[data-offer="2"] h3 a')!.click());
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelector<HTMLElement>('.offer-overlay__add')?.click());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    const cls = await page.evaluate(() => (window as any).__cls);
    expect(cls, `the morph/ghost/close sequence accumulated ${cls} of layout shift`).toBe(0);
  });
});
