/* scripts/looks-thumbs.ts — the five look thumbnails for build.html.
 *
 * build.html's "Pick the look" step shows five real screenshots of the five
 * spec-kit templates, not five coloured rectangles. The templates live in the
 * outreach repo (~/northbound-outreach/templates/looks/0X-*.html), and this
 * renders each one with the studio's own lead record — the reference set the
 * NorthboundSpec skill describes — then screenshots the top of the page at
 * phone width and writes a webp into brand/looks/.
 *
 * Shown with our own content on purpose: a made-up business name in a
 * thumbnail would be a client that did not happen. The label under the
 * picker says so.
 *
 *   bun scripts/looks-thumbs.ts
 *   NB_OUTREACH=/path/to/northbound-outreach bun scripts/looks-thumbs.ts
 *
 * Needs cwebp (brew install webp). Re-run whenever a template changes.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUTREACH = process.env.NB_OUTREACH ?? join(homedir(), 'northbound-outreach');
const OUT = join(import.meta.dir, '..', 'brand', 'looks');

const LOOKS = ['01-clean', '02-dark', '03-editorial', '04-photo', '05-industrial'] as const;

// Phone-shaped, like the preview beside the questions: the top 700px of a
// 390px-wide page, at 1.5x so it stays crisp inside a ~200px-wide card.
const VIEWPORT = { width: 390, height: 700 };

const { renderLead } = await import(join(OUTREACH, 'src', 'lib.ts'));
const lead = JSON.parse(readFileSync(join(OUTREACH, 'data', 'self.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();

for (const look of LOOKS) {
  const html = renderLead(readFileSync(join(OUTREACH, 'templates', 'looks', `${look}.html`), 'utf8'), lead);
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = join(OUT, `${look}.png`);
  const webp = join(OUT, `${look}.webp`);
  await page.screenshot({ path: png, clip: { x: 0, y: 0, ...VIEWPORT } });
  const cwebp = Bun.spawnSync(['cwebp', '-quiet', '-q', '72', '-m', '6', png, '-o', webp]);
  if (cwebp.exitCode !== 0) throw new Error(`cwebp failed for ${look}: ${cwebp.stderr.toString()}`);
  unlinkSync(png);
  console.log(`${webp} — ${Bun.file(webp).size} bytes`);
}

await browser.close();
