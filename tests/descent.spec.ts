import { test, expect, Page } from '@playwright/test';

const FLOORS = ['ARRIVAL', 'THE WORK', 'SPEED', 'PRICE', 'SUPPORT', 'DIRECTIONS', 'ASSEMBLY'];
const SETTLE = 900; // 700ms nav debounce plus the smooth scroll

/** Wait until the readout reports the given floor (1-based), or give up. */
async function waitForFloor(page: Page, n: number, tries = 12) {
  const want = `0${n} · ${FLOORS[n - 1]}`;
  for (let i = 0; i < tries; i++) {
    if ((await readout(page)) === want) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/**
 * Repeat a gesture until the floor changes. On desktop every floor is exactly
 * one screen so this takes one go; a floor taller than the screen (Floor 07, or
 * most floors on a phone) scrolls natively to its edge first, by design.
 */
async function gestureUntilChange(page: Page, fire: () => Promise<void>, max = 8) {
  const before = await readout(page);
  for (let i = 0; i < max; i++) {
    await fire();
    // The 700ms debounce sets the floor on how fast this can land; poll past it
    // rather than sleeping a flat interval per gesture.
    for (let waited = 0; waited < 1800; waited += 100) {
      await page.waitForTimeout(100);
      if (waited >= 700 && (await readout(page)) !== before) return i + 1;
    }
  }
  return 0;
}

/**
 * The project-level `reducedMotion` use-option does not reach the page in this
 * Playwright build — matchMedia still reported no-preference — so the reduced
 * project emulates it explicitly, where it is visible and verifiable.
 */
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'desktop-reduced') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          throw new Error('reduced-motion emulation did not reach the page');
        }
      });
    });
  }
});

async function ready(page: Page, hash = '') {
  await page.goto('/' + hash, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[data-floor]').length === 7);
  await page.waitForTimeout(700);
}

/** The nav readout, e.g. "03 · SPEED". */
function readout(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('span')]
      .filter((s) => /^\s*0\d\s·\s/.test(s.textContent || ''))[0]?.textContent?.trim());
}

/** Every rect that puts ink on the given floor: glyph boxes, not element boxes. */
async function inkRects(page: Page, floorIndex: number) {
  return page.evaluate((i) => {
    const sec = document.querySelectorAll('[data-floor]')[i] as HTMLElement;
    const out: { text: string; r: DOMRect }[] = [];
    sec.querySelectorAll('*').forEach((el) => {
      const tag = el.tagName;
      if (tag === 'CANVAS' || tag === 'IMG' || tag === 'SVG') return; // decorative art
      const label = (el.textContent || tag).trim().slice(0, 40);
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) {
        out.push({ text: label, r: el.getBoundingClientRect().toJSON() });
        return;
      }
      if (el.childElementCount !== 0 || !(el.textContent || '').trim()) return;
      const g = document.createRange();
      g.selectNodeContents(el);
      for (const r of Array.from(g.getClientRects())) out.push({ text: label, r: r.toJSON() });
    });
    return out.filter((o) => o.r.width >= 2 && o.r.height >= 2);
  }, floorIndex);
}

test.describe('the descent', () => {
  test('the wheel advances exactly one floor per gesture, 01 to 07', async ({ page }) => {
    await ready(page);
    expect(await readout(page)).toBe('01 · ' + FLOORS[0]);
    const oneScreen = await page.evaluate(() =>
      [...document.querySelectorAll('[data-floor]')].slice(0, 6)
        .every((s) => s.getBoundingClientRect().height <= window.innerHeight + 8));

    for (let i = 1; i < FLOORS.length; i++) {
      const gestures = await gestureUntilChange(page, () => page.mouse.wheel(0, 400));
      expect(gestures, `wheel should reach floor ${i + 1}`).toBeGreaterThan(0);
      // Where a floor really is one screen, it must cost exactly one gesture.
      if (oneScreen && i < 6) expect(gestures).toBe(1);
      expect(await readout(page)).toBe(`0${i + 1} · ${FLOORS[i]}`);
    }
    // And it stops at the bottom rather than wrapping.
    expect(await gestureUntilChange(page, () => page.mouse.wheel(0, 400), 3)).toBe(0);
  });

  test('the keyboard advances floors and Space walks down', async ({ page }) => {
    await ready(page);
    for (const key of ['ArrowDown', 'PageDown', 'Space']) {
      const moved = await gestureUntilChange(page, () => page.keyboard.press(key));
      expect(moved, `${key} should advance the floor`).toBeGreaterThan(0);
    }
    expect(await readout(page)).toBe('04 · PRICE');
    expect(await gestureUntilChange(page, () => page.keyboard.press('ArrowUp'))).toBeGreaterThan(0);
    expect(await readout(page)).toBe('03 · SPEED');
  });

  test('the nav arrows walk both ways and never wrap', async ({ page }) => {
    await ready(page);

    // At Floor 01 the back arrow is spent: dimmed, disabled, inert.
    const prev = page.locator('[data-nav="prev"]');
    const next = page.locator('[data-nav="next"]');
    await expect(prev).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toHaveAttribute('aria-disabled', 'false');
    expect(await prev.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
    await prev.click({ force: true }).catch(() => {});
    await page.waitForTimeout(SETTLE);
    expect(await readout(page)).toBe('01 · ARRIVAL');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    for (let i = 2; i <= 7; i++) {
      await next.click();
      expect(await waitForFloor(page, i), `arrow should reach floor ${i}`).toBe(true);
    }
    expect(await readout(page)).toBe('07 · ASSEMBLY');

    // And at Floor 07 the forward arrow is spent in the same way.
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(prev).toHaveAttribute('aria-disabled', 'false');
    await page.waitForTimeout(SETTLE); // let the last smooth scroll settle
    const y = await page.evaluate(() => window.scrollY);
    await next.click({ force: true }).catch(() => {});
    await page.waitForTimeout(SETTLE);
    expect(await readout(page)).toBe('07 · ASSEMBLY');
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(4);
  });

  test('every floor has a URL and the URL tracks the floor', async ({ page }) => {
    await ready(page, '#floor-5');
    expect(await readout(page)).toBe('05 · SUPPORT');

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(SETTLE);
    expect(new URL(page.url()).hash).toBe('#floor-6');

    await page.evaluate(() => { location.hash = '#floor-2'; });
    await page.waitForTimeout(SETTLE);
    expect(await readout(page)).toBe('02 · THE WORK');
  });

  test('BUDDY never covers a word, on any floor', async ({ page }) => {
    await ready(page);
    for (let i = 0; i < FLOORS.length; i++) {
      await page.evaluate(async (idx) => {
        const s = document.querySelectorAll('[data-floor]')[idx];
        window.scrollTo({ top: window.scrollY + s.getBoundingClientRect().top, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 500));
      }, i);
      await page.waitForTimeout(400);

      const dock = await page.evaluate(() => {
        const d = document.querySelector('[data-buddy-dock]');
        return d ? d.getBoundingClientRect().toJSON() : null;
      });
      if (!dock) continue; // Floor 07 stands the floating dock down entirely

      const pad = 4;
      for (const { text, r } of await inkRects(page, i)) {
        const hit = r.right > dock.left + pad && r.left < dock.right - pad &&
                    r.bottom > dock.top + pad && r.top < dock.bottom - pad;
        expect(hit, `BUDDY covers "${text}" on floor ${i + 1}`).toBe(false);
      }
    }
  });
});

test.describe('floor 02, the work', () => {
  test('three cards, and no iframe loads until asked', async ({ page }) => {
    await ready(page, '#floor-2');
    await expect(page.locator('.nb-case')).toHaveCount(3);
    await expect(page.locator('#floor-2 iframe')).toHaveCount(0);

    await page.locator('#case-atlas').hover();
    await page.waitForTimeout(600);
    await expect(page.locator('#case-atlas iframe')).toHaveCount(1);
    await expect(page.locator('#case-atlas iframe')).toHaveAttribute('loading', 'lazy');
    // Waking one card must not wake the others.
    await expect(page.locator('#floor-2 iframe')).toHaveCount(1);
  });

  test('each demo route actually serves a page', async ({ page, request }) => {
    await ready(page, '#floor-2');
    const urls = await page.locator('.nb-case a.nb-open').evaluateAll(
      (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
    expect(urls).toHaveLength(3);
    for (const u of urls) expect((await request.get(u!)).status()).toBe(200);
  });

  test('the hover tilt stays inside 6 degrees, and stands down for reduced motion', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'tilt is a pointer affordance');
    await ready(page, '#floor-2');
    const card = page.locator('#case-halo');
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // Just inside the rounded corner — the corner point itself is outside the
    // 18px radius and reads as a mouseleave.
    await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.06);
    await page.waitForTimeout(250);
    const t = await card.evaluate((e) => (e as HTMLElement).style.transform);

    if (info.project.name === 'desktop-reduced') {
      expect(t).toBe('');
      return;
    }
    const degrees = [...t.matchAll(/(-?\d+(?:\.\d+)?)deg/g)].map((m) => Math.abs(parseFloat(m[1])));
    expect(degrees.length).toBeGreaterThan(0);
    for (const d of degrees) expect(d).toBeLessThanOrEqual(6.001);
  });
});

test.describe('floor 03, the speed proof', () => {
  test('counts up real navigation timing against the agency bar', async ({ page }) => {
    await ready(page);
    const line = () => page.locator('#floor-3').innerText();
    expect(await line()).toContain('0.00s'); // idle until the visitor arrives

    await page.evaluate(() => { location.hash = '#floor-3'; });
    await page.waitForTimeout(2000);
    const text = await line();
    const nums = (text.match(/(\d+\.\d\d)s/g) || []).map((n) => parseFloat(n));
    expect(nums.length).toBeGreaterThanOrEqual(2);
    expect(nums[0]).toBeGreaterThan(0);          // the page's real load time
    expect(nums[0]).toBeLessThan(nums[1]);       // ...beating the agency bar
    expect(nums[1]).toBeCloseTo(3.8, 1);
    expect(text).toContain('on your connection');
  });

  test('falls back to the static copy when the timing API says nothing', async ({ page }) => {
    await page.addInitScript(() => { performance.getEntriesByType = () => []; });
    await ready(page, '#floor-3');
    const text = await page.locator('#floor-3').innerText();
    expect(text).not.toContain('loaded in');
    expect(text).toContain('Most agencies quote six weeks');
  });
});

test.describe('floor 07, the ask', () => {
  test('the scarcity line is config-driven and the submit label is set', async ({ page }) => {
    await ready(page, '#floor-7');
    const text = await page.locator('#floor-7').innerText();
    expect(text).toContain('Two spots left this month.');
    expect(text).toContain('BUDDY, our intake assistant, replies within the hour.');
    await expect(page.locator('#floor-7 button')).toHaveText('Send project details');
  });

  test('a null SPOTS_LEFT renders the evergreen line', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'NB_CONFIG', {
        configurable: true,
        set(v) { v.SPOTS_LEFT = null; this._v = v; },
        get() { return this._v; },
      });
    });
    await ready(page, '#floor-7');
    const text = await page.locator('#floor-7').innerText();
    expect(text).toContain('Taking 2–3 projects a month.');
    expect(text).not.toContain('spots left');
  });

  test('typing in the form does not fire floor navigation', async ({ page }) => {
    await ready(page, '#floor-7');
    const before = await readout(page);
    await page.locator('#floor-7 input').first().fill('Jordan');
    await page.locator('#floor-7 input').first().press('ArrowDown');
    await page.waitForTimeout(SETTLE);
    expect(await readout(page)).toBe(before);
    await expect(page.locator('#floor-7 input').first()).toHaveValue('Jordan');
  });
});
