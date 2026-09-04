/* Screenshots every floor at both review sizes into qa/pass1/.
 * Run with the site served locally:  bun qa/pass1/capture.mjs [baseUrl] */
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8099';
const sizes = [
  { w: 1280, h: 800, tag: '1280x800' },
  { w: 390, h: 844, tag: '390x844' },
];

const b = await chromium.launch();
for (const s of sizes) {
  const page = await b.newPage({ viewport: { width: s.w, height: s.h } });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  for (let i = 1; i <= 7; i++) {
    await page.evaluate(async (n) => {
      const sec = document.querySelectorAll('[data-floor]')[n - 1];
      window.scrollTo({ top: window.scrollY + sec.getBoundingClientRect().top, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 500));
    }, i);
    await page.waitForTimeout(500);
    const path = `qa/pass1/floor-${i}-${s.tag}.png`;
    await page.screenshot({ path });
    console.log('wrote', path);
  }
  await page.close();
}
await b.close();
