/* reveal — the loading veil and Buddy's return.
 *
 * Colin's direction: on a slow connection the page used to assemble itself in
 * public — fonts swapping under the headline, images popping — and every one
 * of those frames reads as jank. So first paint shows a quiet veil, not a
 * half-loaded hero; and Buddy, who used to play his tag sequence once and
 * vanish (which read as broken rather than authored), now comes back and
 * takes up an idle post in the hero.
 */
import { test, expect } from '@playwright/test';

test.describe('reveal — veil and buddy return', () => {
  test('desktop: veil shows, lifts on its own, buddy tags then returns', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'veil theater is a desktop full-motion concern');
    // Record the order: the sneak must never start behind the veil.
    await page.addInitScript(() => {
      (window as any).__nbOrder = [];
      window.addEventListener('nb:revealed', () => (window as any).__nbOrder.push('revealed'));
      new MutationObserver((muts) => {
        for (const m of muts) {
          const t = m.target as Element;
          if (t.classList && t.classList.contains('nb-hero-tag')) {
            (window as any).__nbOrder.push('stage:' + t.getAttribute('data-stage'));
          }
        }
      }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-stage'] });
    });
    await page.goto('/studio.html');

    // The veil is the first paint, and it lifts without interaction.
    const veil = page.locator('#nb-veil');
    await expect(veil).toBeVisible({ timeout: 5000 });
    await expect(veil).toHaveCount(0, { timeout: 15000 });

    // Hero is readable, navigation is up, the phone is reachable.
    await expect(page.locator('#arrival-h')).toBeVisible();
    await expect(page.locator('header nav, nav[aria-label]')).toBeVisible();
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();

    // The tag sequence plays, then he comes back and takes the idle post.
    const buddy = page.locator('.nb-hero-buddy.is-in');
    await expect(buddy).toHaveCount(1, { timeout: 30000 });
    await expect(buddy).toHaveAttribute('data-pose', 'thinking');
    // He is decoration: hidden from AT, never intercepts a tap.
    await expect(buddy).toHaveAttribute('aria-hidden', 'true');
    const pe = await buddy.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pe).toBe('none');

    // The sneak waited for the curtain: revealed before stage:sneak.
    const order: string[] = await page.evaluate(() => (window as any).__nbOrder);
    expect(order).toContain('revealed');
    expect(order).toContain('stage:sneak');
    expect(order.indexOf('revealed')).toBeLessThan(order.indexOf('stage:sneak'));
  });

  test('mobile: no buddy anywhere, veil still lifts, pitch stays readable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'the 640px suppression is a mobile concern');
    await page.goto('/studio.html');
    await expect(page.locator('#nb-veil')).toHaveCount(0, { timeout: 15000 });
    // Suppressed under 640px: not the sequence, not the idle post, not even
    // the fetch for his art — he covered the pitch text on phones.
    await expect(page.locator('.nb-hero-tag')).toHaveCount(0);
    await expect(page.locator('.nb-hero-buddy')).toHaveCount(0);
    await expect(page.locator('#arrival-h')).toBeVisible();
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
  });

  test('reduced motion: no veil theater, static hero frame', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-reduced', 'reduced motion has its own project');
    await page.goto('/studio.html');
    // No veil at all — content as fast as possible.
    await expect(page.locator('#nb-veil')).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator('#arrival-h')).toBeVisible();
    // The canonical still frame, and no idle-return sequence.
    await expect(page.locator('.nb-hero-tag[data-stage="still"]')).toHaveCount(1);
    await expect(page.locator('.nb-hero-buddy')).toHaveCount(0);
  });
});
