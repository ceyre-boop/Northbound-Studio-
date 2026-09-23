/* The published number is the whole thesis of this site, so it gets the
 * strictest test in the suite.
 *
 * The claim being defended: every performance figure printed on this page was
 * measured by scripts/perf.mjs and none of it was typed by a human. That is
 * easy to say and easy to quietly stop being true — someone tunes a shader,
 * the page gets slower, and yesterday's flattering number sits there looking
 * authoritative. These tests make the claim mechanically enforced instead of
 * culturally enforced.
 *
 * When the drift test fails, the fix is `bun scripts/perf.mjs --emit` and
 * commit the new artifact. It is never to edit the number.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = join(ROOT, 'data', 'perf-budget.json');

function artifact() {
  if (!existsSync(ARTIFACT)) return null;
  return JSON.parse(readFileSync(ARTIFACT, 'utf8'));
}

test.describe('the published measurement', () => {

  test('the artifact exists and is the schema the page reads', () => {
    const a = artifact();
    expect(a, 'data/perf-budget.json is missing — run: bun scripts/perf.mjs --emit <url>').not.toBeNull();
    expect(a.schema).toBe(1);
    expect(a.published.frameMs).toMatch(/^\d+(\.\d+)? ms$/);
    expect(a.frame.samples).toBeGreaterThan(60);
    expect(a.commit).toBeTruthy();
  });

  test('the measurement was taken from a commit that is actually in this history', () => {
    const a = artifact();
    test.skip(!a || a.commit === 'unknown', 'no artifact or no commit recorded');
    let inHistory = true;
    try {
      execSync(`git merge-base --is-ancestor ${a.commit} HEAD`, { cwd: ROOT, stdio: 'ignore' });
    } catch {
      inHistory = false;
    }
    expect(inHistory, `artifact was measured at ${a.commit}, which is not an ancestor of HEAD`).toBe(true);
  });

  test('the measurement is newer than the newest change to the rendering code', () => {
    const a = artifact();
    test.skip(!a, 'no artifact');
    const newest = execSync('git log -1 --format=%cI -- js/ css/ studio.html', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!newest) return;
    expect(
      new Date(a.measuredAt).getTime(),
      `js/, css/ or studio.html changed at ${newest}, after the measurement at ${a.measuredAt}. Re-run: bun scripts/perf.mjs --emit`
    ).toBeGreaterThan(new Date(newest).getTime());
  });

  /* The lint that makes "never hand-typed" true rather than conventional. If
     a literal millisecond figure ever appears as markup inside the proof
     block, someone has started writing the number by hand and this whole
     mechanism is decorative. */
  test('no millisecond figure is hard-coded in the proof block', () => {
    const html = readFileSync(join(ROOT, 'studio.html'), 'utf8');
    const block = html.slice(html.indexOf('data-budget-root'), html.indexOf('</section>', html.indexOf('data-budget-root')));
    expect(block.length, 'could not find the proof block in studio.html').toBeGreaterThan(100);
    const stripped = block.replace(/<[^>]+>/g, ' ');
    expect(stripped, 'a literal "N ms" is written into the markup — it must come from the artifact').not.toMatch(/\d+(\.\d+)?\s*ms/);
  });

  test('every rendered figure equals the artifact exactly', async ({ page }) => {
    const a = artifact();
    test.skip(!a, 'no artifact');

    /* The artifact on disk predates codeCommit (it is written by the next
       `bun scripts/perf.mjs --emit`). Route both JSONs to a consistent pair
       so the render path — the thing this test actually exercises — still
       runs against real markup rather than skipping outright. */
    const rendered = a.codeCommit ? a : { ...a, codeCommit: 'testcommit' };
    if (!a.codeCommit) {
      await page.route('**/data/perf-budget.json', (route) => route.fulfill({ json: rendered }));
    }
    await page.route('**/data/release.json', (route) => route.fulfill({ json: { codeCommit: rendered.codeCommit } }));

    await page.goto('/studio.html');
    await expect(page.locator('[data-budget-root]')).toHaveAttribute('data-proof', 'measured', { timeout: 10_000 });
    await expect(page.locator('[data-budget-root]')).toBeVisible();

    const nodes = await page.locator('[data-budget]').all();
    expect(nodes.length).toBeGreaterThan(3);

    for (const node of nodes) {
      const path = await node.getAttribute('data-budget');
      const expected = path!.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), rendered);
      if (expected === undefined || expected === null) continue;
      const text = (await node.textContent())!.trim();
      if (path === 'measuredAt') {
        expect(await node.getAttribute('datetime')).toBe(expected);
        continue;
      }
      expect(text, `[data-budget="${path}"] renders "${text}" but the artifact says "${expected}"`).toBe(String(expected));
    }
  });

  test('the panel stays hidden when release.json is missing', async ({ page }) => {
    const a = artifact();
    test.skip(!a, 'no artifact');
    await page.route('**/data/release.json', (route) => route.fulfill({ status: 404, body: 'not found' }));
    const warnings: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'warning') warnings.push(msg.text()); });
    await page.goto('/studio.html');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-budget-root]')).toBeHidden();
    expect(warnings.some((w) => w.includes('[proof]'))).toBe(true);
  });

  test('the panel stays hidden when the codeCommit does not match', async ({ page }) => {
    const a = artifact();
    test.skip(!a, 'no artifact');
    const rendered = { ...a, codeCommit: 'aaaaaaa' };
    await page.route('**/data/perf-budget.json', (route) => route.fulfill({ json: rendered }));
    await page.route('**/data/release.json', (route) => route.fulfill({ json: { codeCommit: 'bbbbbbb' } }));
    await page.goto('/studio.html');
    await page.waitForTimeout(500);
    await expect(page.locator('[data-budget-root]')).toBeHidden();
  });

  test('the panel stays hidden with JavaScript off', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/studio.html');
    await expect(page.locator('[data-budget-root]')).toBeHidden();
    await context.close();
  });

  test('no em dash appears inside the proof block in the served HTML', async ({ request }) => {
    const res = await request.get('/studio.html');
    const html = await res.text();
    const start = html.indexOf('<div class="proof"');
    expect(start, 'could not find the proof block in the served HTML').toBeGreaterThan(-1);
    const end = html.indexOf('<h2 id="contact-h"', start);
    const block = html.slice(start, end);
    /* The &mdash; entity was the placeholder character sitting inside every
       [data-budget] span and the "Not measured..." caption — those are what
       this bullet removes. Prose elsewhere in the block (the methodology
       paragraph) legitimately uses an em dash as punctuation and is not what
       this test is about, so check the placeholder spans specifically. */
    expect(block).not.toMatch(/&mdash;/);
    const placeholderText = block.match(/data-budget="[^"]*">([^<]*)</g) || [];
    for (const p of placeholderText) {
      expect(p).not.toContain('—');
    }
  });

  test('per-act costs are present and sum to no more than the frame', () => {
    const a = artifact();
    test.skip(!a, 'no artifact');
    const acts = Object.values<any>(a.acts);
    expect(acts.length, 'no act reported a cost — the harness never scrolled the page').toBeGreaterThan(0);
    for (const act of acts) {
      expect(act.p95Ms).toBeGreaterThanOrEqual(act.p50Ms);
    }
    const sum = acts.reduce((n, act) => n + act.p50Ms, 0);
    expect(sum, 'acts claim more time than the whole frame took').toBeLessThanOrEqual(a.frame.p50Ms * 1.05 + 0.5);
  });

  /* The gate that makes the claim load-bearing. Everything above it is
     hygiene; this one re-measures reality and compares. It needs a deployed
     URL and takes about a minute, so it runs when PERF_URL is set — in CI
     before a merge, and by hand before a deploy. */
  test('the published number still matches a fresh measurement', async () => {
    const url = process.env.PERF_URL;
    test.skip(!url, 'set PERF_URL to re-measure against a deployed build');
    test.setTimeout(180_000);

    const a = artifact();
    expect(a).not.toBeNull();

    const { chromium } = await import('@playwright/test');
    const { measureFrameBudget } = await import('../scripts/perf.mjs');
    const browser = await chromium.launch();
    let fresh;
    try { fresh = await measureFrameBudget(browser, url!); } finally { await browser.close(); }

    const drift = Math.abs(fresh.frame.p50Ms - a.frame.p50Ms) / a.frame.p50Ms;
    expect(
      drift,
      `published ${a.frame.p50Ms}ms, measured ${fresh.frame.p50Ms.toFixed(2)}ms — ` +
      `${(drift * 100).toFixed(0)}% drift. Re-run: bun scripts/perf.mjs --emit ${url}`
    ).toBeLessThan(0.15);
  });
});
