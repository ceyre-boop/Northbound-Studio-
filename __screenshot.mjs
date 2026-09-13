import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type()==='error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: '+e.message));
await page.goto('http://localhost:8099/?motion=full', { waitUntil: 'networkidle', timeout: 60000 });

await page.evaluate(async () => {
  const el = document.querySelector('[data-act="offerings"]');
  const top = el.getBoundingClientRect().top + window.scrollY;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    window.scrollTo(0, top + (i/steps) * el.offsetHeight * 0.5);
    await new Promise(r => setTimeout(r, 40));
  }
});
await page.waitForTimeout(1500);
const centre = await page.evaluate(() => window.__NB_WALL ? window.__NB_WALL.centre : null);
console.log('centre', centre, 'errors', errors.length, errors.slice(0,10));
await page.screenshot({ path: '/private/tmp/claude-501/-Users-taboost-Northbound-Studio--1/de5d80d9-3868-4158-9110-1c8c184a370e/scratchpad/hero.png' });

// Nudge further to move an offering to |t|~1.5 (an arriving/departing panel)
await page.evaluate(async () => {
  window.scrollBy(0, 320);
  await new Promise(r => setTimeout(r, 1200));
});
await page.screenshot({ path: '/private/tmp/claude-501/-Users-taboost-Northbound-Studio--1/de5d80d9-3868-4158-9110-1c8c184a370e/scratchpad/mid.png' });
const centre2 = await page.evaluate(() => window.__NB_WALL ? window.__NB_WALL.centre : null);
console.log('centre2', centre2);

await browser.close();
