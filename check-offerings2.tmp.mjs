import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
});

async function scrollToCentre(target) {
  // binary-ish scan: step through scroll range until __NB_WALL.centre === target
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  let found = false;
  for (let y = 0; y <= height; y += Math.max(10, Math.round(height / 400))) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(20);
    const centre = await page.evaluate(() => window.__NB_WALL ? window.__NB_WALL.centre : -1);
    if (centre === target) { found = true; break; }
  }
  await page.waitForTimeout(600);
  return found;
}

async function run(tier, shot) {
  errors.length = 0;
  await page.goto(`http://localhost:8099/index.html?motion=full&strict=1&tier=${tier}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((height * i) / steps));
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(400);

  const budget = await page.evaluate(() => window.NB_STAGE ? window.NB_STAGE.budget() : null);
  console.log(`--- tier ${tier} ---`);
  console.log('errors:', errors.length, errors.slice(0, 10));
  console.log('offerings stats:', budget && budget.acts && budget.acts.offerings);

  if (shot) {
    const found = await scrollToCentre(5);
    console.log('centre==5 found:', found);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/offerings-tier${tier}-centre5.png` });
  }
}

await run(3, true);
await run(1, false);

await browser.close();
