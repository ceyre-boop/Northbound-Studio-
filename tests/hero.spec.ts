import { test, expect, Page } from '@playwright/test';

/**
 * Hero v2 — the Northlight curtain, the split-character reveal, and the
 * magnetic CTAs.
 *
 * The assertions that matter most here are the boring ones. The copy must
 * survive verbatim, the boot shell and the mounted hero must land the headline
 * on the same pixel, and NB_MOTION must be stepped by exactly one driver —
 * that last one guards a bug that fails *upward*, inflating the very FPS number
 * scripts/perf.mjs trusts.
 */

const HEAD = 'Sites that sell\nwhile you\nsleep.';
const SUB =
  'Design and development for small businesses that want to stand out online. ' +
  'Live in 48 hours. From $1,500. Text us when something breaks.';

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'desktop-reduced') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
});

async function ready(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[data-floor]').length === 7);
  await page.waitForFunction(() => (window as any).NB_REVEAL !== undefined);
  await page.evaluate(() => (window as any).NB_REVEAL.done);
}

test.describe('hero copy survives the rebuild', () => {
  test('headline, subhead and both CTA labels are unchanged', async ({ page }) => {
    await ready(page);
    expect(await page.locator('#floor-1 h1').innerText()).toBe(HEAD);
    expect(await page.locator('#floor-1 p').first().innerText()).toBe(SUB);

    const ctas = await page.locator('#floor-1 [data-nb-cta]').allInnerTexts();
    expect(ctas.map((s) => s.trim())).toEqual(['Start a project', 'See the work ↓']);
  });

  test('the floor conceit and the HUD brackets are gone', async ({ page }) => {
    await ready(page);
    const hero = await page.locator('#floor-1').innerText();
    expect(hero).not.toContain('FLOOR 01');
    expect(hero).not.toContain('ARRIVAL');
    expect(hero).not.toContain('Scroll');

    // The spiral canvas was fixed and full-viewport, inside the page wrapper.
    // Northlight replaced it and hangs off <body>, so no canvas belongs in the
    // hero at all. (Floor 07 has its own, which predates this work.)
    expect(await page.locator('#floor-1 canvas').count()).toBe(0);
    expect(await page.evaluate(() =>
      !!document.getElementById('nb-northlight')?.parentElement?.matches('body'))).toBe(true);
  });
});

test.describe('the boot shell still hands over without moving anything', () => {
  test('the headline lands on the same pixel before and after mount', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' });

    // Measured while the shell is still up and covering the page — and after
    // the webfonts have settled, because the fallback face is narrower and a
    // mid-swap sample measures a headline that is about to reflow.
    const before = await page.waitForFunction(async () => {
      await (document as any).fonts.ready;
      const h = document.querySelector('#nb-boot h1') as HTMLElement | null;
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    }).then((h) => h.jsonValue() as any);

    await page.waitForFunction(() => document.querySelectorAll('[data-floor]').length === 7);
    await page.waitForFunction(() => (window as any).NB_REVEAL !== undefined);
    await page.evaluate(() => (window as any).NB_REVEAL.done);

    const after = await page.locator('#floor-1 h1').boundingBox();
    expect(after).not.toBeNull();
    // 1px, not 0: subpixel layout differs between a fixed overlay and a
    // grid child. Anything larger is a real shift and shows up as CLS.
    expect(Math.abs(after!.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after!.y - before.y)).toBeLessThan(1);
    expect(Math.abs(after!.width - before.w)).toBeLessThan(1);
    expect(Math.abs(after!.height - before.h)).toBeLessThan(1);
  });
});

test.describe('the split-character reveal', () => {
  test('runs, then removes every trace of itself', async ({ page }) => {
    test.skip(test.info().project.name === 'desktop-reduced', 'covered by its own test');
    await page.goto('/', { waitUntil: 'networkidle' });

    // The spans exist mid-reveal...
    const sawSplit = await page.waitForFunction(
      () => document.querySelectorAll('#floor-1 h1 .nb-ch').length > 0,
      undefined, { timeout: 4000 }
    ).then(() => true).catch(() => false);
    expect(sawSplit).toBe(true);

    // ...and none survive it. Unwrapping restores canonical kerning and keeps
    // inkRects()/measureBuddy() seeing 3 line boxes rather than 34 glyph boxes.
    await page.evaluate(() => (window as any).NB_REVEAL.done);
    expect(await page.locator('#floor-1 h1 .nb-ch').count()).toBe(0);
    expect(await page.locator('#floor-1 h1').innerText()).toBe(HEAD);
    expect(await page.evaluate(() =>
      document.querySelector('#floor-1 h1')!.querySelectorAll('br').length)).toBe(2);
  });

  test('does not touch the DOM at all under reduced motion', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-reduced', 'reduced-motion project only');
    await ready(page);
    expect(await page.locator('#floor-1 h1 .nb-ch').count()).toBe(0);
    expect(await page.evaluate(() =>
      getComputedStyle(document.querySelector('#floor-1 h1')!).opacity)).toBe('1');
  });
});

test.describe('Northlight', () => {
  test('renders, and picks a tier appropriate to the viewport', async ({ page }, info) => {
    await ready(page);
    const nl = await page.evaluate(() => {
      const n = (window as any).NB_NORTHLIGHT;
      const c = document.getElementById('nb-northlight');
      const cs = c ? getComputedStyle(c) : null;
      return {
        ok: n?.ok, tier: n?.tier, cap: n?.LUMA_CAP,
        parentIsBody: c?.parentElement === document.body,
        position: cs?.position, pointerEvents: cs?.pointerEvents, z: cs?.zIndex
      };
    });

    expect(nl.ok).toBe(true);
    expect(['high', 'mid', 'low', 'threadbare']).toContain(nl.tier);
    expect(nl.parentIsBody).toBe(true);
    expect(nl.position).toBe('fixed');
    expect(nl.pointerEvents).toBe('none');
    // Behind the content column, which sits at z-index 10.
    expect(Number(nl.z)).toBeLessThan(10);

    // The luminance ceiling is a contract, not a tuning value.
    expect(nl.cap).toBeLessThanOrEqual(0.16);

    if (info.project.name === 'mobile') expect(['low', 'threadbare']).toContain(nl.tier);
  });

  test('degrades to the same design, never to a gradient, when WebGL is gone', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: any[]) {
        if (/webgl/i.test(type)) return null;
        return (orig as any).call(this, type, ...rest);
      } as any;
    });
    await ready(page);

    expect(await page.evaluate(() => (window as any).NB_NORTHLIGHT.ok)).toBe(false);
    expect(errors).toEqual([]);
    // No stray dead canvas left in the document...
    expect(await page.locator('#nb-northlight').count()).toBe(0);
    // ...and the painted floor the page falls back to is still there, so this
    // path lands on a background rather than flat black.
    expect(await page.evaluate(() =>
      [...document.querySelectorAll('div')].some((d) =>
        getComputedStyle(d).zIndex === '0' &&
        getComputedStyle(d).backgroundImage.includes('radial-gradient')))).toBe(true);
    // The hero copy is untouched by any of it.
    expect(await page.locator('#floor-1 h1').innerText()).toBe(HEAD);
  });
});

test.describe('the magnetic CTAs', () => {
  test('lean toward the cursor, and never chase it', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'fine pointer only');
    await ready(page);

    const cta = page.locator('#floor-1 [data-nb-cta]').first();
    const box = (await cta.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(350);

    const t = await cta.evaluate((el) => (el as HTMLElement).style.transform);
    const m = t.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/);
    expect(m, `expected a spring transform, got "${t}"`).not.toBeNull();
    const pull = Math.hypot(parseFloat(m![1]), parseFloat(m![2]));
    // MAGNET_MAX_PULL is 16 and it is a hard cap: the button leans, it does
    // not follow the cursor around.
    expect(pull).toBeLessThanOrEqual(16.001);
  });

  test('are inert under reduced motion', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-reduced', 'reduced-motion project only');
    await ready(page);
    const cta = page.locator('#floor-1 [data-nb-cta]').first();
    const box = (await cta.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(350);
    expect(await cta.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
  });
});

test.describe('one driver steps the springs', () => {
  test('NB_MOTION.fps reports a real frame rate, not a doubled one', async ({ page }) => {
    await ready(page);
    await page.waitForTimeout(2000);
    const fps = await page.evaluate(() => (window as any).NB_MOTION.fps);
    // Before the claim() fix both the component's rAF and motion.js's own loop
    // stepped every spring each frame, and this read ~120 — which is exactly
    // the value the perf harness gates on.
    expect(fps).toBeGreaterThan(40);
    // The bound only has to be tight enough to catch a doubled integrator;
    // headless Chrome is not vsync-locked, so it runs a little over 60.
    expect(fps).toBeLessThan(100);
  });
});

test.describe('the hero still fills exactly one screen', () => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`floor 1 is exactly one viewport tall at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await ready(page);
      const h = await page.evaluate(() =>
        (document.getElementById('floor-1') as HTMLElement).offsetHeight);
      // snap.spec.ts hard-codes FLOOR_H = 800 on the assumption that every
      // floor is exactly one screen. Removing the eyebrow and the scroll cue
      // shortened the column, not the section; this proves it stayed that way.
      expect(Math.abs(h - vp.height)).toBeLessThanOrEqual(1);
    });
  }

  test('a viewport too short for the content still never shrinks the floor', async ({ page }) => {
    // 1076x494 is the shortest viewport in perf.mjs's overflow sweep. The
    // @media (max-height:780px) rule trims the padding but the column still
    // outgrows the screen, and the floor scrolls natively — that predates this
    // work. What must hold is that the floor is never shorter than the screen.
    await page.setViewportSize({ width: 1076, height: 494 });
    await ready(page);
    const h = await page.evaluate(() =>
      (document.getElementById('floor-1') as HTMLElement).offsetHeight);
    expect(h).toBeGreaterThanOrEqual(494);
  });
});
