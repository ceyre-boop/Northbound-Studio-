import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
const OUT = process.argv[2];
const URL = process.argv[3] || 'http://localhost:8099/';
mkdirSync(OUT, { recursive: true });

const VP = { width: 1280, height: 800 };
const b = await chromium.launch();

async function page(rec) {
  const ctx = await b.newContext(rec
    ? { viewport: VP, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: VP } }
    : { viewport: VP, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(URL + '?motion=full', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.NB_STAGE?.ok, { timeout: 20000 });
  await p.evaluate(() => {
    const w = window.NB_STAGE.debug().windows.offerings;
    const h = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, h * (w[0] + 0.2 * (w[1] - w[0])));
  });
  await p.waitForFunction(() => !!window.__NB_WALL, { timeout: 20000 });
  await p.waitForTimeout(1500);
  return { ctx, p };
}

function docYFor(i) {
  return (w, h) => h * (w[0] + ((i + 2.5) / 16) * (w[1] - w[0]));
}
async function scrollToPanel(p, i, ms) {
  await p.evaluate(async ({ idx, dur }) => {
    const w = window.NB_STAGE.debug().windows.offerings;
    const h = document.documentElement.scrollHeight - innerHeight;
    const target = h * (w[0] + ((idx + 2.5) / 16) * (w[1] - w[0]));
    const from = window.scrollY, t0 = performance.now();
    await new Promise(res => {
      function step() {
        const k = Math.min(1, (performance.now() - t0) / dur);
        window.scrollTo(0, from + (target - from) * k);
        k < 1 ? requestAnimationFrame(step) : res();
      }
      step();
    });
  }, { idx: i, dur: ms });
}

// --- stills ---------------------------------------------------------------
{
  const { ctx, p } = await page(false);
  for (const i of [3, 5, 7]) {
    await scrollToPanel(p, i, 400); await p.waitForTimeout(2200);
    await p.screenshot({ path: `${OUT}/panel-${String(i + 1).padStart(2, '0')}.png` });
  }
  await ctx.close();
  console.log('stills written');
}

// --- recording 1: slow scroll through 03-07 -------------------------------
{
  const { ctx, p } = await page(true);
  await scrollToPanel(p, 2, 300); await p.waitForTimeout(1200);
  await scrollToPanel(p, 6, 8200);
  await p.waitForTimeout(800);
  await ctx.close();
  const vids = readdirSync(OUT).filter(f => f.endsWith('.webm'));
  renameSync(`${OUT}/${vids[0]}`, `${OUT}/scroll-03-to-07.webm`);
  console.log('scroll recording written');
}

// --- recording 2: drag/throw + click-through ------------------------------
{
  const { ctx, p } = await page(true);
  await scrollToPanel(p, 4, 300); await p.waitForTimeout(1400);
  const box = await p.evaluate(() => {
    const S = window.__NB_WALL;
    const q = S.panels.reduce((a, c) => Math.abs(c.t) < Math.abs(a.t) ? c : a);
    return { x: Math.round(q.cx), y: Math.round(q.cy) };
  });
  await p.mouse.move(box.x, box.y); await p.waitForTimeout(500);
  await p.mouse.down();
  for (let k = 1; k <= 10; k++) { await p.mouse.move(box.x + k * 16, box.y + k * 5); await p.waitForTimeout(14); }
  await p.mouse.up();
  await p.waitForTimeout(2600);
  await p.mouse.move(box.x, box.y); await p.waitForTimeout(300);
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(3200);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1200);
  await ctx.close();
  const vids = readdirSync(OUT).filter(f => f.endsWith('.webm') && !f.startsWith('scroll-'));
  renameSync(`${OUT}/${vids[0]}`, `${OUT}/throw-and-open.webm`);
  console.log('interaction recording written');
}

await b.close();
