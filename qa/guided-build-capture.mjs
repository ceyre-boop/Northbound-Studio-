/* Walk the guided build and screenshot every step for review. Not a test —
 * no assertions, just the frames a person has to look at: each of the eight
 * screens, the spec sheet, the spec sheet restored from its link, and the
 * checkout it hands off to, at 390×844 and 1280×800.
 *
 *   bun qa/guided-build-capture.mjs http://localhost:8201
 *   bun qa/guided-build-capture.mjs http://localhost:8201 --video   # also records
 *
 * With --video, a 390-wide and a 1280-wide webm land in qa/guided-build/video/;
 * ffmpeg turns one into guided-build.mp4 (see the report for the command).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8201';
const video = process.argv.includes('--video');
const out = 'qa/guided-build';
mkdirSync(out, { recursive: true });

/* A roofer: trades, they call, wants booked jobs and quotes, a job is worth
   $1,000–$5,000, nobody answers at night, keep it running, industrial look. */
const PATH = [
  { value: 'trades', name: 'Rivera Roofing' },
  { value: 'call' },
  { value: ['jobs', 'quotes'] },
  { value: '1k-5k' },
  { value: 'nobody' },
  { value: 'you' },
  { value: 'industrial' },
];

const browser = await chromium.launch();
for (const [tag, vp] of [['mobile-390', { width: 390, height: 844 }], ['desktop-1280', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: `${out}/video`, size: vp } } : {}),
  });
  const page = await ctx.newPage();
  const shot = async (name, full = true) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(video ? 900 : 150);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: full });
    console.log(`${out}/${tag}-${name}.png`);
  };

  await page.goto(`${base}/build.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  for (let i = 0; i < PATH.length; i++) {
    const step = PATH[i];
    await shot(`step${i + 1}-ask`);
    const values = Array.isArray(step.value) ? step.value : [step.value];
    for (const v of values) {
      await page.locator(`#panel [data-value="${v}"]`).click();
      await page.waitForTimeout(video ? 700 : 60);
    }
    if (step.name) {
      await page.fill('#biz-name', step.name);
      await page.waitForTimeout(video ? 500 : 60);
    }
    await shot(`step${i + 1}-answered`);
    await page.locator('#panel [data-nav="next"]').click();
    await page.waitForTimeout(video ? 500 : 60);
  }
  await shot('step8-sheet');
  // Reserve → checkout, with the spec carried through.
  const link = await page.locator('#link-field').inputValue();
  await page.locator('#reserve').click();
  await page.waitForLoadState('networkidle');
  await shot('checkout');
  // The restored-from-link state, in a fresh context.
  await page.evaluate(() => localStorage.clear());
  await page.goto(link, { waitUntil: 'networkidle' });
  await shot('restored-from-link');
  await ctx.close();
}
await browser.close();
