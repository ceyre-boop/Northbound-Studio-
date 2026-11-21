/* No price anywhere on the site except checkout.
 *
 * Plans/DECISIONS.md #21 and Plans/pricing-engine.md: the price changes week
 * to week, and a visitor first sees it at checkout. A number printed on any
 * other page would both go stale and spoil the test the engine is running.
 *
 * Two checks, because a price can hide in two places:
 *   1. The files. Every public page, script and data file is read off disk
 *      and searched for a dollar figure. This catches a price that is in the
 *      source but not on screen (a comment a visitor can view, a hidden
 *      element, a string a script prints later).
 *   2. The rendered pages, after their scripts have run. This catches a
 *      price a script assembles at runtime.
 *
 * The one figure allowed is the guarantee: "$100 off" if a launch is late.
 * That is a promise, not a price, and the brief keeps its wording.
 *
 * checkout.html is the exception by design, and the last test proves the
 * exception is real: its amounts come from data/price.json, not from the
 * file.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DOLLARS = /\$\s?\d[\d,]*(?:\.\d+)?/g;
const ALLOWED = (m: string, context: string) => m === '$100' && /\$100 off/.test(context);

/* Everything a visitor's browser can be served and that we wrote. Not
   demos/, engines/ or templates/ (products with their own example data),
   not vendored libraries, not checkout.html. */
function publicFiles(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(ROOT)) if (f.endsWith('.html') && f !== 'checkout.html') out.push(f);
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${f}`;
      if (rel === 'js/vendor') continue;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(js|css|json)$/.test(f) && rel !== 'data/price.json') out.push(rel);
    }
  };
  for (const dir of ['js', 'css', 'data']) walk(dir);
  return out.sort();
}

function pricesIn(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(DOLLARS)) {
    const at = m.index ?? 0;
    const context = text.slice(Math.max(0, at - 40), at + 40);
    if (!ALLOWED(m[0], context)) found.push(`${m[0]}  …${context.replace(/\s+/g, ' ')}…`);
  }
  return found;
}

const PAGES = ['/', '/studio.html', '/build.html', '/templates.html', '/account.html', '/account-received.html', '/order-paid.html', '/order-received.html', '/thanks.html'];

test.describe('no price anywhere but checkout', () => {
  test('no public file carries a dollar price', () => {
    const files = publicFiles();
    expect(files).toContain('index.html');
    expect(files).toContain('js/config.js');
    expect(files).not.toContain('checkout.html');
    const hits: string[] = [];
    for (const f of files) for (const p of pricesIn(readFileSync(join(ROOT, f), 'utf8'))) hits.push(`${f}: ${p}`);
    expect(hits, hits.join('\n')).toEqual([]);
  });

  for (const path of PAGES) {
    test(`${path} shows no price once its scripts have run`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      const text = await page.evaluate(() => document.documentElement.outerHTML);
      const hits = pricesIn(text);
      expect(hits, hits.join('\n')).toEqual([]);
    });
  }

  test('the old tier names are gone from every page', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const body = await page.locator('body').innerText();
      for (const gone of ['Beacon', 'Bearing', 'Cheap and Clean', 'founding price', 'Founding price']) expect(body, `${path}: ${gone}`).not.toContain(gone);
    }
  });

  test('checkout shows the price, and it comes from data/price.json, not from the page', async ({ page }) => {
    const source = readFileSync(join(ROOT, 'checkout.html'), 'utf8');
    expect(pricesIn(source), 'checkout.html must not hardcode a price').toEqual([]);

    const real = JSON.parse(readFileSync(join(ROOT, 'data/price.json'), 'utf8'));
    await page.goto('/checkout.html');
    const money = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    await expect(page.locator('[data-price="setup"]')).toHaveText(money(real.setup));
    await expect(page.locator('#total')).toHaveText(money(real.setup * real.deposit_ratio));
    await expect(page.locator('#balance')).toHaveText(money(real.setup - real.setup * real.deposit_ratio));
    await expect(page.locator('#monthly')).toHaveText(money(real.care_monthly));

    // Change the file's answer and the page follows: nothing is baked in.
    await page.route('**/data/price.json', (route) => route.fulfill({ json: { week: '2026-W48', setup: 750, care_monthly: 49, deposit_ratio: 0.5 } }));
    await page.reload();
    await expect(page.locator('[data-price="setup"]')).toHaveText('$750.00');
    await expect(page.locator('#total')).toHaveText('$375.00');
    await expect(page.locator('#balance')).toHaveText('$375.00');
  });

  test('checkout posts no amount: the form has no price field to tamper with', async ({ page }) => {
    await page.goto('/checkout.html');
    const names = await page.locator('#order [name]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name));
    expect(names.sort()).toEqual(['benefit', 'business', 'buy', 'email', 'name', 'nb_hp_7', 'phone', 'spec', 'why_not', 'why_us']);
    await expect(page.locator('#order [name="buy"]')).toHaveValue('site');
  });

  test('with JavaScript off checkout shows no stale number, and still posts', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/checkout.html');
    await expect(page.locator('#total')).toHaveText('Shown on the next step');
    await expect(page.locator('#order')).toHaveAttribute('action', '/api/checkout');
    await ctx.close();
  });
});
