import { test, expect, Page } from '@playwright/test';

/**
 * CSS scroll-snap runs on the compositor. Headless Chromium does not run it at
 * all — a programmatic scroll to a mid-floor offset is left exactly where it
 * lands — so these assertions only mean anything in real headed Chrome, which
 * is what the `snap-chrome` project provides.
 *
 * The JS wheel and touch handlers this replaced handed off between native
 * scroll and a smooth-snap animation at a 48px edge threshold, and trackpad
 * inertia kept firing mid-animation, so the two fought on any floor taller
 * than the window.
 */

const FLOOR_H = 800; // every floor 01-06 is exactly one screen at this viewport

async function ready(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[data-floor]').length === 7);
  await page.waitForTimeout(900);
}

const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

test('the snap engine is actually wired to the document scroller', async ({ page }) => {
  await ready(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType))
    .toBe('y mandatory');
  // Regression guard: overflow-x:hidden on the page wrapper computes overflow-y
  // to auto, which makes it the sections' scroll container and silently
  // swallows the snap-type set on <html>.
  const wrapper = await page.evaluate(() => {
    const sec = document.querySelector('[data-floor]') as HTMLElement;
    let el = sec.parentElement;
    while (el && el !== document.documentElement) {
      const o = getComputedStyle(el);
      if (o.overflowY !== 'visible' && o.overflowY !== 'clip') return el.tagName + '.' + o.overflowY;
      el = el.parentElement;
    }
    return null;
  });
  expect(wrapper, 'a scroll container between the sections and <html> would break snapping').toBeNull();
});

test('a mid-floor scroll is pulled onto the nearest floor', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.scrollTo(0, 1150));
  await page.waitForTimeout(1200);
  expect(await y(page)).toBe(FLOOR_H); // 1150 sits inside floor 2, snaps to its top
});

test('one wheel gesture lands on exactly one floor, 01 to 07, with no wrap', async ({ page }) => {
  await ready(page);
  expect(await y(page)).toBe(0);

  for (let floor = 2; floor <= 7; floor++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(900);
    expect(await y(page), `wheel should land square on floor ${floor}`)
      .toBe(FLOOR_H * (floor - 1));
  }

  // Floor 07 is taller than the window on purpose: it scrolls within itself
  // rather than wrapping to the top.
  const bottom = await page.evaluate(() =>
    document.documentElement.scrollHeight - window.innerHeight);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(700); }
  const end = await y(page);
  expect(end).toBeGreaterThanOrEqual(FLOOR_H * 6);
  expect(end).toBeLessThanOrEqual(bottom + 2); // subpixel rounding on the document height

  // ...and back up to the very top, again square on each floor.
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(700); }
  expect(await y(page)).toBe(0);
});

test('the floor readout and URL keep up with snapped scrolling', async ({ page }) => {
  await ready(page);
  for (let floor = 2; floor <= 6; floor++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(900);
    const readout = await page.evaluate(() =>
      [...document.querySelectorAll('span')]
        .filter((s) => /^\s*0\d\s·\s/.test(s.textContent || ''))[0]?.textContent);
    expect(readout?.startsWith('0' + floor)).toBe(true);
    expect(new URL(page.url()).hash).toBe('#floor-' + floor);
  }
});
