/* The offerings procession.
 *
 * Most of these exist because something was silently false and no assertion
 * would have caught it. The panels-overlap test in particular: the section
 * booted clean, threw nothing, held its frame budget and passed every gate
 * while only ever drawing one panel at a time, because the neighbours were
 * hundreds of pixels past the viewport edge. It looked like a slideshow and
 * every number said it was fine.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test.describe.configure({ timeout: 180_000 });

/** Scroll so that panel `i` is at the centre of the procession. */
async function toPanel(page, i: number) {
  await page.evaluate((idx) => {
    const w = (window as any).NB_STAGE.debug().windows.offerings;
    const local = (idx + 2.5) / 16;
    const doc = w[0] + local * (w[1] - w[0]);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * doc);
  }, i);
  await page.waitForTimeout(1100);
}

async function boot(page, query = '?motion=full') {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).NB_STAGE?.ok, { timeout: 15_000 });
  await page.evaluate(() => {
    const w = (window as any).NB_STAGE.debug().windows.offerings;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * (w[0] + 0.3 * (w[1] - w[0])));
  });
  await page.waitForFunction(() => !!(window as any).__NB_WALL, { timeout: 20_000 });
}

test.describe('the procession', () => {

  test('all twelve offerings are in the document with JavaScript off', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    expect(await page.locator('[data-offer]').count()).toBe(12);
    /* Every one readable, not just present. */
    for (const sel of ['Booking flow', 'Owner dashboard', 'AI intake']) {
      await expect(page.getByText(sel, { exact: false }).first()).toBeVisible();
    }
    /* Offering 12 must never acquire a price. The launch plan has no AI tier. */
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).toContain('quoted per job');
    expect(body, 'an invented price appeared on the add-on').not.toMatch(/\$\s?500/);
    await ctx.close();
  });

  test('the panels actually overlap — neighbours are on screen, not past the edge', async ({ page }) => {
    await boot(page);
    await toPanel(page, 5);

    const geo = await page.evaluate(() => {
      const S = (window as any).__NB_WALL;
      const near = S.panels.filter((p: any) => Math.abs(p.t) > 0.5 && Math.abs(p.t) < 1.6);
      return {
        vw: window.innerWidth,
        hero: S.panels.find((p: any) => Math.abs(p.t) < 0.2),
        near: near.map((p: any) => ({ t: p.t, cx: p.cx, cy: p.cy, w: p.w, h: p.h }))
      };
    });

    expect(geo.near.length, 'no neighbour is within a step of centre').toBeGreaterThan(0);
    for (const n of geo.near) {
      const onScreen = n.cx + n.w / 2 > 0 && n.cx - n.w / 2 < geo.vw;
      expect(
        onScreen,
        `the panel at t=${n.t.toFixed(2)} is centred at x=${Math.round(n.cx)} on a ${geo.vw}px screen — it is not on it`
      ).toBe(true);

      /* Overlapping, not merely visible: its box must intersect the hero's. */
      const gap = Math.abs(n.cx - geo.hero.cx) - (n.w + geo.hero.w) / 2;
      expect(gap, `the panel at t=${n.t.toFixed(2)} clears the hero by ${Math.round(gap)}px instead of overlapping it`).toBeLessThan(0);
    }
  });

  test('the hero is the main event, not a thumbnail', async ({ page }) => {
    await boot(page);
    await toPanel(page, 6);
    const hero = await page.evaluate(() => {
      const S = (window as any).__NB_WALL;
      const p = S.panels.reduce((a: any, b: any) => (Math.abs(b.t) < Math.abs(a.t) ? b : a));
      return { h: p.h, w: p.w, vh: window.innerHeight, t: p.t };
    });
    expect(Math.abs(hero.t)).toBeLessThan(0.2);
    expect(hero.h / hero.vh, 'the centre panel is under half the viewport height').toBeGreaterThan(0.5);
  });

  test('the centre index advances with scroll and reverses on the way back', async ({ page }) => {
    await boot(page);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      await toPanel(page, i);
      seen.push(await page.evaluate(() => (window as any).__NB_WALL.centre));
    }
    expect(seen[0]).toBe(0);
    expect(seen[11]).toBe(11);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `centre went ${seen[i - 1]} -> ${seen[i]}`).toBeGreaterThanOrEqual(seen[i - 1]);
    }
    await toPanel(page, 2);
    expect(await page.evaluate(() => (window as any).__NB_WALL.centre)).toBe(2);
  });

  test('a flick displaces a panel and it returns to the rail', async ({ page }) => {
    await boot(page);
    await toPanel(page, 4);

    const box = await page.evaluate(() => {
      const S = (window as any).__NB_WALL;
      const p = S.panels.reduce((a: any, b: any) => (Math.abs(b.t) < Math.abs(a.t) ? b : a));
      return { x: p.cx, y: p.cy, i: p.index };
    });

    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(box.x + k * 22, box.y + k * 6);
    await page.mouse.up();

    const moved = await page.evaluate((i) => {
      const p = (window as any).__NB_WALL.panels[i];
      return { cx: p.cx, cy: p.cy };
    }, box.i);
    expect(Math.hypot(moved.cx - box.x, moved.cy - box.y), 'the flick moved nothing').toBeGreaterThan(4);

    await page.waitForTimeout(2600);
    const rested = await page.evaluate((i) => {
      const p = (window as any).__NB_WALL.panels[i];
      return { cx: p.cx, cy: p.cy };
    }, box.i);
    expect(
      Math.hypot(rested.cx - box.x, rested.cy - box.y),
      'the panel never came back to its slot — a throw must be a displacement from the rail, not free flight'
    ).toBeLessThan(6);
  });

  test('opening a panel adds it to the project without moving the page', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => document.documentElement.scrollHeight);

    await page.evaluate(() => {
      document.querySelector<HTMLElement>('[data-offer="2"] .offer__addbtn')!.click();
    });
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      field: (document.querySelector('[data-basket-field]') as HTMLInputElement).value,
      chips: document.querySelectorAll('[data-basket-list] li').length
    }));

    expect(after.chips).toBe(1);
    expect(after.field).toContain('booking');
    expect(after.height, 'adding to the project changed the page height — the CLS gate is exactly 0').toBe(before);
  });

  test('the section pays for itself: under 60KB of gzipped JavaScript', () => {
    const files = [
      'js/acts/offerings.js',
      'js/offerings/contract.js', 'js/offerings/content.js', 'js/offerings/procession.js',
      'js/offerings/atlas.js', 'js/offerings/wall.js', 'js/offerings/card.js',
      'js/gl/offering-loops.js', 'js/gl/offering-material.js'
    ];
    let total = 0;
    const rows: string[] = [];
    for (const f of files) {
      const path = join(ROOT, f);
      expect(existsSync(path), `${f} is missing`).toBe(true);
      const n = Number(execSync(`gzip -c "${path}" | wc -c`, { encoding: 'utf8' }).trim());
      rows.push(`${String(n).padStart(6)}  ${f}`);
      total += n;
    }
    expect(total, `the section is ${total} bytes gzipped:\n${rows.join('\n')}`).toBeLessThanOrEqual(60 * 1024);
  });

  test('the reserved height in CSS matches the one the helix assumes', () => {
    const contract = readFileSync(join(ROOT, 'js/offerings/contract.js'), 'utf8');
    const css = readFileSync(join(ROOT, 'css/stage.css'), 'utf8');
    const step = Number(/export const STEP = ([\d.]+)/.exec(contract)![1]);
    const band = Number(/export const BAND = ([\d.]+)/.exec(contract)![1]);
    const count = Number(/export const COUNT = (\d+)/.exec(contract)![1]);
    const declared = Number(/export const SECTION_SVH = (\d+)/.exec(contract)![1]);
    const cssHeight = Number(/#offerings\s*\{[^}]*min-height:\s*(\d+)svh/.exec(css)![1]);

    const needed = Math.ceil(step * (count - 1 + 2 * band) * 100);
    expect(declared, `the helix needs ${needed}svh of scroll but declares ${declared}`).toBeGreaterThanOrEqual(needed);
    expect(cssHeight, 'css/stage.css and contract.js disagree about the section height').toBe(declared);
  });
});
