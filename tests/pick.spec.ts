/* tests/pick.spec.ts — the four things an adversarial review found wrong with
 * the twelve selectable panels, each pinned so it cannot come back.
 *
 * Companion to the panel tests already in home.spec.ts, which cover the
 * happy path (toggle, Continue appears, the code reaches checkout). These
 * cover what happens around the edges of it: with JavaScript off, on the way
 * back from checkout, and past the one other link on the page that goes
 * straight to checkout.
 */
import { test, expect } from '@playwright/test';

const PICKS = ['A custom site', 'Booking flow', 'Reminders'];

function panel(page, name: string) {
  return page.locator(`.offer[data-part="${name}"]`);
}

test.describe('the twelve, with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the panels are readable content, not twelve dead controls', async ({ page }) => {
    await page.goto('/');
    const panels = page.locator('.offer[data-part]');
    await expect(panels).toHaveCount(12);

    /* Inert on purpose: not in the tab order, and not announced as toggle
       buttons that do nothing. The text still reads. */
    for (const p of await panels.all()) {
      await expect(p).toHaveAttribute('tabindex', '-1');
      expect(await p.getAttribute('aria-pressed')).toBeNull();
    }
    await expect(panel(page, 'Reminders')).toContainText('Fewer no-shows');
    await expect(page.locator('#offerings-list')).not.toHaveClass(/is-live/);
    await expect(page.locator('#pick-continue')).toBeHidden();
  });
});

test.describe('the twelve, live', () => {
  test('the panels become real toggles when the module runs', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#offerings-list')).toHaveClass(/is-live/);
    const first = panel(page, 'A custom site');
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(await first.getAttribute('tabindex')).toBeNull();
  });

  test('picks survive the round trip back from checkout', async ({ page }) => {
    await page.goto('/');
    for (const name of PICKS) await panel(page, name).click();

    const href = await page.locator('#pick-continue').getAttribute('href');
    expect(href).toContain('s=');
    await page.goto(href!.replace(/^/, '/'));

    /* checkout.html's "Change it" is the way back, and it has to carry the
       picks or "change" means "start again". */
    const back = page.locator('#build-change');
    const home = await back.getAttribute('href');
    expect(home).toContain('s=');
    expect(home).toContain('#offerings');

    await page.goto(home!);
    for (const name of PICKS) {
      await expect(panel(page, name)).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(panel(page, 'Local SEO')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#pick-continue')).toBeVisible();
  });

  test('"Buy it now" carries the picks rather than dropping them', async ({ page }) => {
    await page.goto('/');
    const buy = page.locator('.pkg a[href^="checkout.html?buy=clean"]').first();
    expect(await buy.getAttribute('href')).toBe('checkout.html?buy=clean');

    for (const name of PICKS) await panel(page, name).click();
    const withPicks = await buy.getAttribute('href');
    expect(withPicks).toContain('buy=clean'); // the card keeps its own package
    expect(withPicks).toContain('s=');

    // Unpicking everything puts it back exactly as it was.
    for (const name of PICKS) await panel(page, name).click();
    expect(await buy.getAttribute('href')).toBe('checkout.html?buy=clean');
  });

  test('one ride-along part alone does not propose a package without it', async ({ page }) => {
    await page.goto('/');
    await panel(page, 'Reminders').click();
    const href = await page.locator('#pick-continue').getAttribute('href');
    /* It used to say buy=beacon — $1,750 for a package containing none of
       what was clicked. */
    expect(href).toContain('buy=clean');
  });
});
