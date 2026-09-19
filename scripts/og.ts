#!/usr/bin/env bun
/**
 * Renders brand/og.svg to brand/og.png at exactly 1200x630.
 *
 * The social card is an SVG so it can be hand-edited as markup, but Open
 * Graph consumers (Slack, iMessage, Twitter/X, Facebook) do not reliably
 * fetch SVGs for og:image, so a PNG is what actually ships in the meta tags.
 * This script is how that PNG gets regenerated whenever brand/og.svg changes
 * — never hand-export it from a design tool, run this.
 *
 *   bun scripts/og.ts
 *
 * It loads the SVG in a real browser (Playwright/Chromium) with the site's
 * own fonts declared via @font-face, waits for those fonts to actually load,
 * and screenshots the page at the card's exact pixel size with no device
 * scaling — so brand/og.png is a 1:1 raster of what ships in the markup.
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = join(ROOT, 'brand', 'og.svg');
const OUT_PATH = join(ROOT, 'brand', 'og.png');
const FONTS_DIR = join(ROOT, 'fonts');

const WIDTH = 1200;
const HEIGHT = 630;

function fontFaceCss(): string {
  const toDataUrl = (file: string) => {
    const buf = readFileSync(join(FONTS_DIR, file));
    return `data:font/woff2;base64,${buf.toString('base64')}`;
  };
  return `
    @font-face {
      font-family: 'Syne';
      src: url('${toDataUrl('syne.woff2')}') format('woff2');
      font-weight: 400 800; font-style: normal;
    }
    @font-face {
      font-family: 'Instrument Sans';
      src: url('${toDataUrl('instrument-sans.woff2')}') format('woff2');
      font-weight: 400 700; font-style: normal;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('${toDataUrl('jetbrains-mono.woff2')}') format('woff2');
      font-weight: 400 600; font-style: normal;
    }
  `;
}

async function main() {
  const svg = readFileSync(SVG_PATH, 'utf8');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${fontFaceCss()}
  html, body { margin: 0; padding: 0; background: #0b0a0c; }
  svg { display: block; }
</style>
</head>
<body>
${svg}
</body>
</html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 } as any);
  await page.setContent(html, { waitUntil: 'load' });
  // Fonts declared via @font-face are not guaranteed to be loaded at
  // 'load' — wait for the FontFaceSet to actually finish, or the card
  // ships with fallback system fonts baked into a static image forever.
  await page.evaluate(() => (document as any).fonts.ready);
  await page.waitForTimeout(50);

  await page.screenshot({ path: OUT_PATH, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  await browser.close();

  console.log(`Wrote ${OUT_PATH} (${WIDTH}x${HEIGHT})`);
}

main().catch((err) => {
  console.error('og.ts failed:', err);
  process.exit(1);
});
