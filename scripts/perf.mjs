#!/usr/bin/env bun
/**
 * Layer 5 performance harness — the standalone runner.
 *
 * This is the source of truth for every gate. `tests/perf.spec.ts` imports
 * the measurement functions below and wraps them in Playwright assertions so
 * the same numbers show up in the normal test run; this file is what you
 * invoke directly between merges, with no test runner in the way.
 *
 *   bun scripts/perf.mjs [url]
 *
 * Defaults to https://northbound-dev.com/. Exits non-zero on any gate
 * failure, so it can gate a merge in CI or a pre-deploy hook.
 *
 * Real CDP throttling only — never Lighthouse's simulated numbers. Every
 * network/CPU condition below is applied through the DevTools protocol
 * against a live Chromium instance.
 */

import { chromium } from '@playwright/test';

// --- gates -------------------------------------------------------------

/* A protected Vercel preview needs the caller's short-lived OIDC token on
   every navigation, so each context below merges in whatever PERF_HEADERS
   carries. Empty in the normal case, which leaves the harness unchanged. */
const EXTRA_HEADERS = (() => {
  try { return JSON.parse(process.env.PERF_HEADERS || '{}'); }
  catch { return {}; }
})();

function ctxOpts(opts = {}) {
  const headers = { ...EXTRA_HEADERS, ...(opts.extraHTTPHeaders || {}) };
  return Object.keys(headers).length ? { ...opts, extraHTTPHeaders: headers } : opts;
}

export const GATES = {
  lcp4g: { label: 'LCP — regular 4G (9 Mbps / 85ms RTT), 4x CPU', threshold: 1200, unit: 'ms' },
  lcpSlow4g: { label: 'LCP — slow 4G (1.6 Mbps / 150ms RTT), 4x CPU', threshold: 1200, unit: 'ms' },
  cls: { label: 'CLS — accumulated to idle + 2s', threshold: 0, unit: '' },
  fpsMedian: { label: 'FPS — median at 4x CPU, 390x844', threshold: 60, unit: 'fps', floor: true },
  fpsMin: { label: 'FPS — minimum at 4x CPU, 390x844', threshold: 55, unit: 'fps', floor: true },
  jsBytes: { label: 'JS bytes gzipped over the wire', threshold: 400 * 1024, unit: 'B' },
  overflow: { label: 'Overflow sweep — 6 viewports, no floor breach', threshold: 0, unit: 'breaches' },
  fallbackWebgl: { label: 'Fallback — WebGL disabled', threshold: 0, unit: 'issues' },
  fallbackTouch: { label: 'Fallback — touch-only, no mouse', threshold: 0, unit: 'issues' },
  fallbackReducedMotion: { label: 'Fallback — prefers-reduced-motion: reduce', threshold: 0, unit: 'issues' },
};

// Network profiles per Chrome DevTools Protocol Network.emulateNetworkConditions.
// Throughput is bytes/sec; the spec gives download in Mbps.
const NET = {
  regular4g: { downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (9 * 1024 * 1024) / 16, latency: 85 },
  slow4g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (1.6 * 1024 * 1024) / 16, latency: 150 },
};

const CPU_RATE = 4;

const OVERFLOW_VIEWPORTS = [
  { width: 1076, height: 494 },
  { width: 768, height: 500 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1440, height: 700 },
  { width: 1512, height: 982 },
];

const FLOOR_INK_SELECTOR = 'img, canvas, h1, h2, p';

// --- helpers -------------------------------------------------------------

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Inject the LCP + layout-shift observers before any page script runs. */
async function installObservers(page) {
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, clsSources: [] };
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__perf.lcp = last.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) { /* not supported */ }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          window.__perf.cls += entry.value;
          for (const s of entry.sources || []) {
            if (s.node) {
              const el = s.node;
              const snippet = el.outerHTML ? el.outerHTML.slice(0, 120) : String(el);
              window.__perf.clsSources.push(snippet);
            }
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* not supported */ }
  });
}

/** One LCP measurement under a given CDP network profile + 4x CPU. */
async function measureLcpOnce(browser, netProfile) {
  const context = await browser.newContext(ctxOpts());
  const page = await context.newPage();
  await installObservers(page);
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', { offline: false, ...netProfile });
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });

  await page.goto(GLOBAL.url, { waitUntil: 'load', timeout: 60_000 });
  // LCP finalises on the first user input or when the page goes hidden;
  // absent either, give the observer a beat past load to catch a late
  // largest element (e.g. a hero image behind a slow connection).
  await page.waitForTimeout(1000);
  const lcp = await page.evaluate(() => window.__perf.lcp);
  await context.close();
  return lcp;
}

export async function measureLCP(browser, url, profileKey) {
  GLOBAL.url = url;
  const samples = [];
  for (let i = 0; i < 3; i++) samples.push(await measureLcpOnce(browser, NET[profileKey]));
  return { median: median(samples), samples };
}

export async function measureCLS(browser, url) {
  const context = await browser.newContext(ctxOpts());
  const page = await context.newPage();
  await installObservers(page);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => ({ cls: window.__perf.cls, sources: window.__perf.clsSources }));
  await context.close();
  return result;
}

export async function measureFPS(browser, url) {
  const context = await browser.newContext(ctxOpts({ viewport: { width: 390, height: 844 } }));
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => window.NB_MOTION && typeof window.NB_MOTION.fps === 'number', { timeout: 15_000 }).catch(() => {});

  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    const fps = await page.evaluate(() => (window.NB_MOTION ? window.NB_MOTION.fps : 0));
    samples.push(fps);
  }
  await context.close();
  return { median: median(samples), min: Math.min(...samples), samples };
}

export async function measureJSBytes(browser, url) {
  const context = await browser.newContext(ctxOpts({ extraHTTPHeaders: { 'Accept-Encoding': 'gzip' } }));
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');

  const meta = new Map(); // requestId -> { isJs }
  let total = 0;
  const byUrl = [];

  client.on('Network.responseReceived', (e) => {
    const ct = (e.response.headers['content-type'] || e.response.headers['Content-Type'] || '');
    meta.set(e.requestId, { isJs: /javascript/i.test(ct), url: e.response.url });
  });
  client.on('Network.loadingFinished', (e) => {
    const m = meta.get(e.requestId);
    if (m && m.isJs) {
      total += e.encodedDataLength;
      byUrl.push({ url: m.url, bytes: e.encodedDataLength });
    }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(500);
  await context.close();
  return { total, byUrl };
}

/** Assert no img/canvas/h1/h2/p inside [data-floor] escapes its section's bottom. */
async function sweepOverflowAt(page) {
  return page.evaluate((sel) => {
    const breaches = [];
    document.querySelectorAll('[data-floor]').forEach((sec, i) => {
      const secBottom = sec.getBoundingClientRect().bottom;
      sec.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height === 0 && r.width === 0) return; // not laid out / display:none
        if (r.bottom > secBottom + 0.5) {
          breaches.push({
            floor: i + 1,
            tag: el.tagName,
            overflowPx: Math.round(r.bottom - secBottom),
            snippet: (el.outerHTML || '').slice(0, 100),
          });
        }
      });
    });
    return breaches;
  }, FLOOR_INK_SELECTOR);
}

export async function sweepOverflow(browser, url, viewports = OVERFLOW_VIEWPORTS) {
  const context = await browser.newContext(ctxOpts());
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  const breaches = [];
  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(150); // let responsive layout settle
    const found = await sweepOverflowAt(page);
    for (const b of found) breaches.push({ ...b, viewport: `${vp.width}x${vp.height}` });
  }
  await context.close();
  return breaches;
}

/** WebGL-disabled, touch-only, and reduced-motion fallback proofs. */
export async function checkFallback(browser, url, kind) {
  const contextOpts = kind === 'touch' ? { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } } : {};
  const context = await browser.newContext(ctxOpts(contextOpts));
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  if (kind === 'webgl') {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return orig.call(this, type, ...rest);
      };
    });
  }
  if (kind === 'reduced-motion') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  } catch (e) {
    navError = String(e);
  }
  await page.waitForTimeout(500);

  const breaches = navError ? [] : (await sweepOverflowAt(page)).map((b) => ({ ...b, viewport: 'default' }));
  await context.close();
  return { navError, consoleErrors, breaches };
}

// --- runner --------------------------------------------------------------

const GLOBAL = { url: '' };

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export async function run(url) {
  const browser = await chromium.launch();
  const results = {};
  const rows = [];

  try {
    const lcp4g = await measureLCP(browser, url, 'regular4g');
    results.lcp4g = lcp4g.median;
    rows.push(row('lcp4g', lcp4g.median, `${GATES.lcp4g.threshold}ms`, `${lcp4g.median.toFixed(0)}ms (samples: ${lcp4g.samples.map((n) => n.toFixed(0)).join(', ')})`));

    const lcpSlow4g = await measureLCP(browser, url, 'slow4g');
    results.lcpSlow4g = lcpSlow4g.median;
    rows.push(row('lcpSlow4g', lcpSlow4g.median, `${GATES.lcpSlow4g.threshold}ms`, `${lcpSlow4g.median.toFixed(0)}ms (samples: ${lcpSlow4g.samples.map((n) => n.toFixed(0)).join(', ')})`));

    const cls = await measureCLS(browser, url);
    results.cls = cls.cls;
    rows.push(row('cls', cls.cls, `${GATES.cls.threshold}`, `${cls.cls.toFixed(4)}${cls.cls > 0 ? ` — offenders: ${cls.sources.slice(0, 3).join(' | ')}` : ''}`));

    const fps = await measureFPS(browser, url);
    results.fpsMedian = fps.median;
    results.fpsMin = fps.min;
    rows.push(row('fpsMedian', fps.median, `>= ${GATES.fpsMedian.threshold}`, `${fps.median.toFixed(0)}fps (samples: ${fps.samples.map((n) => n.toFixed(0)).join(', ')})`));
    rows.push(row('fpsMin', fps.min, `>= ${GATES.fpsMin.threshold}`, `${fps.min.toFixed(0)}fps`));

    const js = await measureJSBytes(browser, url);
    results.jsBytes = js.total;
    rows.push(row('jsBytes', js.total, fmt(GATES.jsBytes.threshold), fmt(js.total)));

    const overflow = await sweepOverflow(browser, url);
    results.overflow = overflow.length;
    rows.push(row('overflow', overflow.length, '0 breaches', overflow.length === 0 ? '0 breaches' : overflow.map((b) => `floor ${b.floor} @ ${b.viewport}: ${b.tag} overflows by ${b.overflowPx}px`).join(' | ')));

    const webgl = await checkFallback(browser, url, 'webgl');
    results.fallbackWebgl = webgl.navError ? 1 : webgl.consoleErrors.length + webgl.breaches.length;
    rows.push(row('fallbackWebgl', results.fallbackWebgl, '0 issues', describeFallback(webgl)));

    const touch = await checkFallback(browser, url, 'touch');
    results.fallbackTouch = touch.navError ? 1 : touch.consoleErrors.length + touch.breaches.length;
    rows.push(row('fallbackTouch', results.fallbackTouch, '0 issues', describeFallback(touch)));

    const reduced = await checkFallback(browser, url, 'reduced-motion');
    results.fallbackReducedMotion = reduced.navError ? 1 : reduced.consoleErrors.length + reduced.breaches.length;
    rows.push(row('fallbackReducedMotion', results.fallbackReducedMotion, '0 issues', describeFallback(reduced)));
  } finally {
    await browser.close();
  }

  return { results, rows };
}

/* --- the published number -------------------------------------------------
 *
 * GATES.fpsMedian reads window.NB_MOTION.fps, which counts rAF callbacks. rAF
 * keeps firing at 60Hz while the GPU queue grows, right up until it collapses
 * to 30 — so it is blind to exactly the failure a four-act WebGL page
 * produces. This repo has already shipped one perf gate that passed
 * fraudulently (see the claim() comment in js/motion.js), and shipping four
 * GPU-bound acts behind a CPU-cadence gate would invite the same class of
 * failure a second time.
 *
 * So the number this site publishes is frame SPAN in milliseconds, measured
 * two ways that are reported separately because they are not the same thing:
 *
 *   frame.*  real frame-to-frame interval from rAF timestamps. This includes
 *            style, layout, paint and compositing — everything the browser
 *            does, not only what our code asks for.
 *   acts.*   the Stage's own bracket around each act's update()+draw(). This
 *            is COMMAND SUBMISSION, not GPU execution: EXT_disjoint_timer_query
 *            is unavailable on most targets, so nothing here claims to measure
 *            what the GPU actually spent. The page's caption says so too.
 *
 * The page renders `published`, which the harness pre-formats, so the page
 * does no arithmetic and cannot print a number that was not measured.
 */
export async function measureFrameBudget(browser, url) {
  const context = await browser.newContext(ctxOpts({ viewport: { width: 390, height: 844 } }));
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', { offline: false, ...NET.regular4g });
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });

  /* motion=full: the machine this runs on may have Reduce Motion set, and a
     still frame costs nothing — measuring it would publish a number that
     describes no visitor's experience. */
  const target = url + (url.includes('?') ? '&' : '?') + 'motion=full';
  await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => window.NB_STAGE && window.NB_STAGE.ok, { timeout: 15_000 }).catch(() => {});

  /* Scroll the whole page so every act loads, initialises and runs. A budget
     measured only at the top of the document describes one act out of four. */
  const spans = await page.evaluate(async () => {
    const deltas = [];
    let last = 0;
    let stop = false;
    const tick = (t) => {
      if (last) deltas.push(t - last);
      last = t;
      if (!stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const height = document.documentElement.scrollHeight - window.innerHeight;
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      window.scrollTo(0, (height * i) / steps);
      await new Promise((r) => setTimeout(r, 55));
    }
    stop = true;
    await new Promise((r) => setTimeout(r, 100));
    return { deltas, budget: window.NB_STAGE ? window.NB_STAGE.budget() : null };
  });

  const device = await page.evaluate(() => {
    const d = window.NB_STAGE ? window.NB_STAGE.debug() : {};
    const c = document.createElement('canvas').getContext('webgl');
    const dbg = c && c.getExtension('WEBGL_debug_renderer_info');
    return {
      tier: d.tier ?? null,
      mode: d.mode ?? null,
      glVersion: d.caps ? d.caps.version : null,
      dpr: window.devicePixelRatio,
      renderer: dbg && c ? c.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'
    };
  });

  await context.close();

  const sorted = spans.deltas.slice().sort((a, b) => a - b);
  const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0);
  return {
    frame: { p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), samples: sorted.length },
    acts: spans.budget ? spans.budget.acts : {},
    device
  };
}

export function toArtifact(url, budget, gateRows, commit) {
  const round = (n) => Math.round(n * 100) / 100;
  const frameMs = round(budget.frame.p50Ms);
  const BUDGET_MS = 16.7;
  const acts = {};
  for (const [id, v] of Object.entries(budget.acts || {})) {
    acts[id] = { label: v.label, p50Ms: round(v.p50), p95Ms: round(v.p95) };
  }
  return {
    schema: 1,
    measuredAt: new Date().toISOString(),
    commit,
    url,
    harness: {
      cpuThrottleRate: CPU_RATE,
      network: 'regular4g',
      viewport: '390x844',
      note: 'Per-act figures are command submission time, not GPU execution.'
    },
    device: budget.device,
    frame: {
      p50Ms: frameMs,
      p95Ms: round(budget.frame.p95Ms),
      p99Ms: round(budget.frame.p99Ms),
      samples: budget.frame.samples
    },
    acts,
    published: {
      frameMs: frameMs.toFixed(1) + ' ms',
      budgetMs: BUDGET_MS.toFixed(1) + ' ms',
      headroomPct: Math.max(0, Math.round(((BUDGET_MS - frameMs) / BUDGET_MS) * 100)) + '%',
      caption: `median frame, ${CPU_RATE}x CPU throttle, 390x844, regular 4G`
    },
    gates: (gateRows || []).map((r) => ({ key: r.key, label: r.label, detail: r.detail, pass: r.pass }))
  };
}

function describeFallback(r) {
  if (r.navError) return `navigation failed: ${r.navError}`;
  const parts = [];
  if (r.consoleErrors.length) parts.push(`console errors: ${r.consoleErrors.slice(0, 2).join(' / ')}`);
  if (r.breaches.length) parts.push(`overflow: ${r.breaches.map((b) => `floor ${b.floor} ${b.tag} +${b.overflowPx}px`).join(', ')}`);
  return parts.length ? parts.join('; ') : 'renders clean, no console error, no overflow';
}

function row(key, value, thresholdLabel, detail) {
  const gate = GATES[key];
  const pass = gate.floor ? value >= gate.threshold : value <= gate.threshold;
  return { key, label: gate.label, thresholdLabel, detail, pass };
}

function printTable(rows) {
  const colLabel = Math.max(...rows.map((r) => r.label.length), 'GATE'.length);
  const colThresh = Math.max(...rows.map((r) => r.thresholdLabel.length), 'THRESHOLD'.length);
  const header = `${'STATUS'.padEnd(6)}  ${'GATE'.padEnd(colLabel)}  ${'THRESHOLD'.padEnd(colThresh)}  MEASURED`;
  console.log(header);
  console.log('-'.repeat(header.length + 20));
  for (const r of rows) {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`${status.padEnd(6)}  ${r.label.padEnd(colLabel)}  ${r.thresholdLabel.padEnd(colThresh)}  ${r.detail}`);
  }
}

const ARTIFACT_PATH = new URL('../data/perf-budget.json', import.meta.url);

async function main() {
  const args = process.argv.slice(2);
  const emit = args.includes('--emit');
  const url = args.find((a) => !a.startsWith('--')) || 'https://northbound-dev.com/';

  console.log(`Layer 5 perf harness — ${url}\n`);
  const { rows } = await run(url);
  printTable(rows);
  const failed = rows.filter((r) => !r.pass);

  if (emit) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { execSync } = await import('node:child_process');
    console.log('\nMeasuring frame budget (this scrolls the whole page so every act runs)...');
    const browser = await chromium.launch();
    let budget;
    try { budget = await measureFrameBudget(browser, url); } finally { await browser.close(); }

    let commit = 'unknown';
    try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}

    const artifact = toArtifact(url, budget, rows, commit);
    mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
    writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2) + '\n');

    console.log(`\nWrote data/perf-budget.json`);
    console.log(`  frame p50      ${artifact.published.frameMs}  (${artifact.published.headroomPct} headroom)`);
    console.log(`  frame p95      ${artifact.frame.p95Ms} ms over ${artifact.frame.samples} frames`);
    for (const [id, a] of Object.entries(artifact.acts)) {
      console.log(`  ${String(id).padEnd(14)} p50 ${a.p50Ms} ms · p95 ${a.p95Ms} ms`);
    }
    console.log('\nThis file is the ONLY place the published number comes from.');
    console.log('Commit it. Never edit it by hand — re-run this to change it.');
  }

  console.log('');
  if (failed.length) {
    console.log(`FAIL — ${failed.length} of ${rows.length} gate(s) failed.`);
    process.exit(1);
  }
  console.log(`PASS — all ${rows.length} gates.`);
  process.exit(0);
}

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error('perf harness crashed:', err);
    process.exit(1);
  });
}
