import { test, expect, chromium, Browser } from '@playwright/test';

// `scripts/perf.mjs` is an ESM module; the test file itself is transformed to
// CommonJS by Playwright's loader, and `require()` cannot load an .mjs file,
// so it is pulled in with a dynamic import in beforeAll rather than a static
// top-level import.
type PerfModule = typeof import('../scripts/perf.mjs');
let perf: PerfModule;

/**
 * Layer 5 — Performance & Grace.
 *
 * These gates drive their own browser via CDP (real network + CPU
 * throttling, never Lighthouse's simulated numbers) rather than the
 * `page` fixture, so they need exactly one project to run in, not four.
 * `scripts/perf.mjs` is the single source of truth for the measurements;
 * this file just turns them into assertions with the numbers printed
 * alongside their thresholds.
 *
 * Target: process.env.PERF_URL, else the live deploy. Never localhost by
 * default — the harness exists to gate what actually ships.
 */

const URL = process.env.PERF_URL || 'https://northbound-dev.com/studio.html';

test.describe('layer 5 — performance & grace', () => {
  // Every gate must report, even if an earlier one fails — this is a status
  // table, not a fail-fast pipeline. Playwright's serial mode skips the rest
  // of a describe block after one failure, so this deliberately stays out of
  // serial mode; the top-level config already runs everything with one
  // worker, so ordering and isolation are unaffected.
  let browser: Browser;

  test.beforeAll(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'perf gates drive their own browser; run once, not per project');
    perf = await import('../scripts/perf.mjs');
    browser = await chromium.launch();
  });

  test.afterAll(async () => {
    if (browser) await browser.close();
  });

  test('LCP holds under 1.2s on regular 4G at 4x CPU (real throttling, median of 3)', async () => {
    const { median, samples } = await perf.measureLCP(browser, URL, 'regular4g');
    console.log(`LCP regular 4G: median ${median.toFixed(0)}ms, samples ${samples.map((n) => n.toFixed(0)).join(', ')}ms`);
    expect(median, `median LCP ${median.toFixed(0)}ms must be under ${perf.GATES.lcp4g.threshold}ms`).toBeLessThan(perf.GATES.lcp4g.threshold);
  });

  test('LCP holds under 1.2s on slow 4G at 4x CPU (real throttling, median of 3)', async () => {
    const { median, samples } = await perf.measureLCP(browser, URL, 'slow4g');
    console.log(`LCP slow 4G: median ${median.toFixed(0)}ms, samples ${samples.map((n) => n.toFixed(0)).join(', ')}ms`);
    expect(median, `median LCP ${median.toFixed(0)}ms must be under ${perf.GATES.lcpSlow4g.threshold}ms`).toBeLessThan(perf.GATES.lcpSlow4g.threshold);
  });

  test('CLS is zero, accumulated to network-idle + 2s', async () => {
    const { cls, sources } = await perf.measureCLS(browser, URL);
    console.log(`CLS: ${cls}`, sources.length ? `offenders: ${sources.join(' | ')}` : '');
    expect(cls, sources.length ? `offending elements: ${sources.join(' | ')}` : 'no layout shift').toBe(0);
  });

  test('FPS holds at 4x CPU on 390x844 (6 samples over 3.6s)', async () => {
    const { median, min, samples } = await perf.measureFPS(browser, URL);
    console.log(`FPS: median ${median}, min ${min}, samples ${samples.join(', ')}`);
    expect(median, `median fps ${median} must be >= ${perf.GATES.fpsMedian.threshold}`).toBeGreaterThanOrEqual(perf.GATES.fpsMedian.threshold);
    expect(min, `minimum fps ${min} must be >= ${perf.GATES.fpsMin.threshold}`).toBeGreaterThanOrEqual(perf.GATES.fpsMin.threshold);
  });

  test('total JS is under 400KB gzipped over the wire', async () => {
    const { total, byUrl } = await perf.measureJSBytes(browser, URL);
    console.log(`JS bytes gzipped: ${(total / 1024).toFixed(1)}KB across ${byUrl.length} response(s)`);
    expect(total, `${(total / 1024).toFixed(1)}KB must be under ${(perf.GATES.jsBytes.threshold / 1024).toFixed(0)}KB`).toBeLessThanOrEqual(perf.GATES.jsBytes.threshold);
  });

  test('no img/canvas/h1/h2/p escapes its floor, across 6 viewports', async () => {
    const breaches = await perf.sweepOverflow(browser, URL);
    if (breaches.length) {
      console.log('overflow breaches:', breaches);
    }
    expect(breaches, breaches.map((b) => `floor ${b.floor} @ ${b.viewport}: ${b.tag} overflows by ${b.overflowPx}px (${b.snippet})`).join('\n')).toEqual([]);
  });

  test('fallback: WebGL disabled still renders clean with no overflow', async () => {
    const r = await perf.checkFallback(browser, URL, 'webgl');
    expect(r.navError).toBeNull();
    expect(r.consoleErrors, r.consoleErrors.join('\n')).toEqual([]);
    expect(r.breaches, JSON.stringify(r.breaches)).toEqual([]);
  });

  test('fallback: touch-only, no mouse, still renders clean with no overflow', async () => {
    const r = await perf.checkFallback(browser, URL, 'touch');
    expect(r.navError).toBeNull();
    expect(r.consoleErrors, r.consoleErrors.join('\n')).toEqual([]);
    expect(r.breaches, JSON.stringify(r.breaches)).toEqual([]);
  });

  test('fallback: prefers-reduced-motion still renders clean with no overflow', async () => {
    const r = await perf.checkFallback(browser, URL, 'reduced-motion');
    expect(r.navError).toBeNull();
    expect(r.consoleErrors, r.consoleErrors.join('\n')).toEqual([]);
    expect(r.breaches, JSON.stringify(r.breaches)).toEqual([]);
  });
});
