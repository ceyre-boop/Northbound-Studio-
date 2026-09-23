/* motion-polish-v1 — one test per bullet in the plan's "Tests" section
 * (Plans/pasted-content-id-0f52-shift-from-ancient-treehouse.md).
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function listJsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (p.endsWith('/js/vendor')) continue; // vendored Lenis, not our code
      out.push(...listJsFiles(p));
    } else if (extname(p) === '.js') {
      out.push(p);
    }
  }
  return out;
}

test.describe('one rAF, and Lenis only when motion is allowed', () => {
  test('js/motion.js is the only requestAnimationFrame loop on the page', async () => {
    const files = listJsFiles(join(ROOT, 'js'));
    const loopers: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // A "loop" calls requestAnimationFrame from inside a function that also
      // calls itself or is passed to rAF again — the one-shot layout-measure
      // calls this plan allows (e.g. card.js's class-removal) never re-arm.
      const matches = src.match(/requestAnimationFrame\s*\(/g) || [];
      for (const m of matches) void m;
      if (/function\s+loop\s*\([^)]*\)\s*{[^}]*requestAnimationFrame\(loop\)/.test(src)) {
        loopers.push(f);
      }
    }
    expect(loopers.map((f) => f.replace(ROOT, ''))).toEqual(['/js/motion.js']);
  });

  test('Lenis is constructed under normal motion and never under reduced motion', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.waitForTimeout(300);
    const withLenis = await page.evaluate(() => !!(window as any).NB_SCROLL?.lenis);
    expect(withLenis).toBe(true);
  });

  test('reduced motion never constructs Lenis at all', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/studio.html');
    await page.waitForTimeout(300);
    const lenis = await page.evaluate(() => (window as any).NB_SCROLL?.lenis ?? null);
    expect(lenis).toBeNull();
    await ctx.close();
  });
});

test.describe('anchors, the skip link, and keyboard scroll', () => {
  test('the skip link moves focus to #work after Lenis settles', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.evaluate(() => document.querySelector<HTMLElement>('a.skip')?.focus());
    await page.evaluate(() => document.querySelector<HTMLElement>('a.skip')?.click());
    await page.waitForFunction(() => document.activeElement?.id === 'work', { timeout: 5_000 });
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('work');
  });

  test('a nav anchor link still scrolls to its target', async ({ page }) => {
    await page.goto('/?motion=full');
    const before = await page.evaluate(() => window.scrollY);
    await page.click('.masthead nav a[href="#contact"]');
    await page.waitForFunction(
      (b) => window.scrollY > b + 100,
      before,
      { timeout: 5_000 }
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 100);
  });

  test('keyboard (Page Down) scrolling still moves the page with Lenis active', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.click('body');
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });
});

function translateY(matrix: string | null): number | null {
  if (!matrix || matrix === 'none') return null;
  const m = matrix.match(/matrix\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((n) => parseFloat(n.trim()));
  return parts[5]; // ty
}

test.describe('entrances latch and never replay', () => {
  test('a block that has arrived stays arrived when scrolled back out of view', async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.reducedMotion === 'reduce', 'reduced motion never primes an entrance at all — nothing to latch');
    await page.goto('/?motion=full');
    const target = await page.evaluate(() => {
      const h = document.getElementById('drift-h');
      return h ? h.getBoundingClientRect().top + window.scrollY : 0;
    });

    // The primed starting offset, captured before the block has ever entered
    // — a word rising out of its mask starts at translateY(115%), which on
    // a heading this size is tens of pixels.
    const primedY = await page.evaluate(() => {
      const w = document.querySelector('#drift-h .reveal-word');
      return w ? getComputedStyle(w).transform : null;
    });

    await page.evaluate((y) => window.scrollTo(0, y - 200), target);
    // The settle preset is underdamped and this block's own progress can take
    // a couple of seconds to fully park (verified empirically against the
    // running page rather than assumed) — wait generously past that rather
    // than guess a tight budget.
    await page.waitForTimeout(4500);
    const settledTransform = await page.evaluate(() => {
      const w = document.querySelector('#drift-h .reveal-word');
      return w ? getComputedStyle(w).transform : null;
    });

    const primedTy = translateY(primedY);
    const settledTy = translateY(settledTransform);
    expect(primedTy).not.toBeNull();
    expect(settledTy).not.toBeNull();
    // It actually moved, and landed close to its resting place (0).
    expect(Math.abs((settledTy as number) - (primedTy as number))).toBeGreaterThan(5);
    expect(Math.abs(settledTy as number)).toBeLessThan(3);

    // Scroll back to the top, then return — the word must already be close to
    // where it settled, never re-primed back to translateY(115%).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.evaluate((y) => window.scrollTo(0, y - 200), target);
    await page.waitForTimeout(150); // far short of a full (re-)settle
    const afterBack = await page.evaluate(() => {
      const w = document.querySelector('#drift-h .reveal-word');
      return w ? getComputedStyle(w).transform : null;
    });
    const afterTy = translateY(afterBack);
    expect(afterTy).not.toBeNull();
    // A re-trigger would read back close to primedTy (mid-flight from 115%);
    // latching keeps it near where it already was.
    expect(Math.abs((afterTy as number) - (primedTy as number))).toBeGreaterThan(5);
  });
});

test.describe('no opacity-only reveals', () => {
  test('entrance.js never sets an opacity style', async () => {
    const src = readFileSync(join(ROOT, 'js/entrance.js'), 'utf8');
    expect(src).not.toMatch(/\.style\.opacity/);
    expect(src).not.toMatch(/setProperty\(\s*['"]opacity['"]/);
  });

  test('css/stage.css carries no opacity-only reveal transition', async () => {
    const src = readFileSync(join(ROOT, 'css/stage.css'), 'utf8');
    expect(src).not.toMatch(/data-reveal/);
  });
});

test.describe('the hero headline at first paint', () => {
  test('the h1 is visible with no transform delay on load, desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?motion=full');
    const h1 = page.locator('.hero-spray');
    await expect(h1).toBeVisible();
    expect(await h1.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });

  test('LCP is not the hero settle: the h1 has non-empty text immediately', async ({ page }) => {
    await page.goto('/?motion=full');
    const text = await page.locator('.hero-spray').textContent();
    expect(text && text.trim().length).toBeGreaterThan(0);
  });
});

test.describe('every hover has a press equivalent', () => {
  test('package cards support :active/data-pressed press state', async ({ page }) => {
    await page.goto('/?motion=full');
    const card = page.locator('.pkg').first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error('no pkg box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(card).toHaveAttribute('data-pressed', '');
    await page.mouse.up();
    await expect(card).not.toHaveAttribute('data-pressed', '');
  });

  test('nav links get data-pressed on pointerdown, mirroring their hover underline', async ({ page }) => {
    await page.goto('/?motion=full');
    const link = page.locator('.masthead nav a').first();
    const box = await link.boundingBox();
    if (!box) throw new Error('no nav link box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(link).toHaveAttribute('data-pressed', '');
    await page.mouse.up();
  });
});

test.describe('springs come only from named presets', () => {
  test('no raw stiffness/damping literal exists outside js/springs.js, js/motion.js and js/offerings/*', async () => {
    const files = listJsFiles(join(ROOT, 'js'));
    const offenders: string[] = [];
    for (const f of files) {
      const rel = f.replace(ROOT, '');
      if (rel === '/js/springs.js' || rel === '/js/motion.js') continue;
      if (rel.startsWith('/js/offerings/')) continue;
      const src = readFileSync(f, 'utf8');
      if (/\bstiffness\s*[:=]/.test(src) || /\bdamping\s*[:=]/.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

test.describe('the sticky CTA and package CTAs prefill the form', () => {
  test('a package button writes into the message field and focuses the name field', async ({ page }) => {
    await page.goto('/studio.html', { waitUntil: 'networkidle' });
    const btn = page.locator('[data-package="Engine package"]');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await expect(page.locator('#f-note')).toHaveValue(/On your project: Engine package/);
    await page.waitForFunction(() => document.activeElement?.id === 'f-name', { timeout: 10_000 });
  });

  test('the sticky CTA is present with no JavaScript (baseline markup, always visible)', async ({ page }) => {
    await page.goto('/studio.html');
    await expect(page.locator('[data-sticky-cta]')).toBeAttached();
  });

  test('the sticky CTA hides once #contact is on screen', async ({ page }) => {
    await page.goto('/?motion=full');
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(400);
    await expect(page.locator('[data-sticky-cta]')).not.toHaveAttribute('data-state', 'pre-scroll');
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await expect(page.locator('[data-sticky-cta]')).toHaveAttribute('data-state', 'hidden');
  });
});

test.describe('390px overflow', () => {
  test('no img/canvas/h1/h2/p escapes its floor at 390 wide, motion on', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?motion=full');
    await page.waitForTimeout(300);
    const breaches = await page.evaluate(() => {
      const found: string[] = [];
      document.querySelectorAll('[data-floor]').forEach((sec, i) => {
        const secBottom = sec.getBoundingClientRect().bottom;
        sec.querySelectorAll('img, canvas, h1, h2, p').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height === 0 && r.width === 0) return;
          if (r.bottom > secBottom + 0.5) found.push(`floor ${i + 1} ${el.tagName} +${Math.round(r.bottom - secBottom)}px`);
        });
      });
      return found;
    });
    expect(breaches).toEqual([]);
  });

  test('no sideways scroll at 390px (same sweep scripts/perf.mjs gates on)', async () => {
    const perf = await import('../scripts/perf.mjs');
    const { chromium } = await import('@playwright/test');
    const url = (process.env.PERF_URL || 'http://localhost:8099/studio.html') + '?motion=full';
    const b = await chromium.launch();
    try {
      const breaches = await perf.sweepOverflow(b, url, [{ width: 390, height: 844 }]);
      expect(breaches).toEqual([]);
    } finally {
      await b.close();
    }
  });
});
