/* question-checkout-v1 — "How important is it to you?", asked quietly.
 *
 * Three answers under the headline. The answer writes nothing: it fills the
 * chip, re-points the primary button to the package that answer implies,
 * and lights the machine behind the hero as far as the answer goes. With no
 * JavaScript the answers are links that still lead somewhere real.
 */
import { test, expect } from '@playwright/test';

const ANSWERS = [
  { level: 1, chip: 'Worth a look', cta: 'Start with Cheap and Clean', href: '#packages' },
  { level: 2, chip: 'It matters', cta: 'Get a quote for Beacon', href: 'build.html' },
  { level: 3, chip: "It's everything", cta: 'Build the whole machine', href: 'build.html' },
];

test.describe('the question in the hero', () => {
  test('sits under the headline with three answers, each a 44px tap target', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero .q-ask')).toHaveText('How important is it to you?');
    for (const a of ANSWERS) {
      const chip = page.locator(`.q-chip[data-level="${a.level}"]`);
      await expect(chip).toHaveText(a.chip);
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  for (const a of ANSWERS) {
    test(`"${a.chip}" re-points the button and lights level ${a.level}, and writes no reply`, async ({ page }) => {
      await page.goto('/?motion=full');
      await page.locator(`.q-chip[data-level="${a.level}"]`).click();
      await expect(page).toHaveURL(/\/\?motion=full$/);
      await expect(page.locator('.hero')).toHaveAttribute('data-level', String(a.level));
      await expect(page.locator(`.q-chip[data-level="${a.level}"]`)).toHaveAttribute('aria-checked', 'true');
      const cta = page.locator('.hero a.btn-primary');
      await expect(cta).toHaveText(a.cta);
      await expect(cta).toHaveAttribute('href', a.href);
      await expect(page.locator('.q-reply, .q-reply-head')).toHaveCount(0);
    });
  }

  test('the machine lights only as far as the answer goes', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'the full scene is desktop-only');
    await page.setViewportSize({ width: 1512, height: 797 });
    await page.goto('/?motion=full');
    const op = (sel: string) => page.locator(sel).evaluate((e) => +getComputedStyle(e).opacity);
    await page.locator('.q-chip[data-level="1"]').click();
    await expect.poll(() => op('.hs-web')).toBe(1);
    await expect.poll(() => op('.hs-db')).toBeLessThan(0.5);
    await page.locator('.q-chip[data-level="3"]').click();
    await expect.poll(() => op('.hs-db'), { timeout: 4000 }).toBe(1);
  });

  test('a radio group: arrows move and choose, one tab stop', async ({ page }) => {
    await page.goto('/?motion=full');
    await expect(page.locator('.q-answers')).toHaveAttribute('role', 'radiogroup');
    await expect(page.locator('.q-chip[tabindex="0"]')).toHaveCount(1);
    await page.locator('.q-chip[data-level="1"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.q-chip[data-level="2"]')).toBeFocused();
    await expect(page.locator('.hero')).toHaveAttribute('data-level', '2');
  });

  test('with JavaScript off the answers are links that go somewhere real', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + (process.env.NB_PORT ?? 8099) + '/');
    await expect(page.locator('.q-chip[data-level="1"]')).toHaveAttribute('href', '#packages');
    await page.locator('.q-chip[data-level="3"]').click();
    await expect(page).toHaveURL(/build\.html$/);
    await ctx.close();
  });
});
