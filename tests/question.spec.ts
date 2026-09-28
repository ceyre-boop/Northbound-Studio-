/* hero-question-v1 — the hero asks "How important is this to you?"
 *
 * Three answers, each one a package. The answer writes a reply (what we
 * build, what we need from you), swaps the primary button, and lights the
 * machine behind the hero as far as the answer goes. With no JavaScript the
 * chips are plain links and still lead somewhere real.
 */
import { test, expect } from '@playwright/test';

const ANSWERS = [
  { level: 1, chip: 'Worth a look', head: 'Then start small, and start now.', cta: 'See Cheap and Clean', href: '#packages' },
  { level: 2, chip: 'It matters', head: 'Then it should look like you mean it.', cta: 'Get a quote for Beacon', href: 'build.html' },
  { level: 3, chip: "It's everything", head: 'Then we build the whole machine.', cta: 'Build your machine', href: 'build.html' },
];

test.describe('the question in the hero', () => {
  test('the headline is the question, and the answers are in the first paint', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero h1')).toHaveText('How important is this to you?');
    await expect(page.locator('.hero .q-chip')).toHaveCount(3);
    for (const a of ANSWERS) {
      const chip = page.locator(`.q-chip[data-level="${a.level}"]`);
      await expect(chip).toHaveText(a.chip);
      const box = await chip.boundingBox();
      expect(box!.height, `${a.chip} is under a 44px tap target`).toBeGreaterThanOrEqual(44);
    }
  });

  for (const a of ANSWERS) {
    test(`answering "${a.chip}" writes the reply, swaps the button and lights level ${a.level}`, async ({ page }) => {
      await page.goto('/?motion=full');
      await page.locator(`.q-chip[data-level="${a.level}"]`).click();
      await expect(page).toHaveURL(/\/\?motion=full$/);          // intercepted, not followed
      await expect(page.locator('.hero')).toHaveAttribute('data-level', String(a.level));
      await expect(page.locator(`.q-chip[data-level="${a.level}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.q-reply-head')).toHaveText(a.head);
      await expect(page.locator('.q-spec dt')).toHaveText(['What we build', 'What we need from you']);
      await expect(page.locator('.q-close')).toHaveText('You bring that. We bring the rest.');
      const cta = page.locator('.hero a.btn-primary');
      await expect(cta).toHaveText(a.cta);
      await expect(cta).toHaveAttribute('href', a.href);
      await expect(page.locator('.q-reply-in')).toBeVisible();
    });
  }

  test('changing the answer replaces the reply rather than stacking a second one', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.locator('.q-chip[data-level="3"]').click();
    await page.locator('.q-chip[data-level="1"]').click();
    await expect(page.locator('.q-reply-head')).toHaveText(ANSWERS[0].head);
    await expect(page.locator('.q-reply-head')).toHaveCount(1);
    await expect(page.locator('.q-chip[aria-pressed="true"]')).toHaveCount(1);
  });

  test('the lit machine never sits on the headline at 1512 wide', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 800 });
    await page.goto('/?motion=full');
    await page.locator('.q-chip[data-level="3"]').click();
    const gap = await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector('.hero h1')!);
      const right = Math.max(...Array.from(r.getClientRects(), (x) => x.right));
      return document.querySelector('.hs-db')!.getBoundingClientRect().left - right;
    });
    expect(gap, 'the Dashboard card overlaps the headline').toBeGreaterThan(0);
  });

  test('with JavaScript off the answers are links that go somewhere real', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + (process.env.NB_PORT ?? 8099) + '/');
    await expect(page.locator('.q-chip[data-level="1"]')).toHaveAttribute('href', '#packages');
    await expect(page.locator('.q-chip[data-level="3"]')).toHaveAttribute('href', 'build.html');
    await page.locator('.q-chip[data-level="3"]').click();
    await expect(page).toHaveURL(/build\.html$/);
    await ctx.close();
  });

  test('no sideways scroll with the longest reply open', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.locator('.q-chip[data-level="3"]').click();
    await page.waitForTimeout(900);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
