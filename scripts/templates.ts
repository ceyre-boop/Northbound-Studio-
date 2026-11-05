/* scripts/templates.ts — package the two concept builds as the templates
 * templates.html sells.
 *
 *   bun scripts/templates.ts            → dist/templates/nb-atlas.zip, nb-vector.zip, nb-engine-hvac.zip
 *
 * Each zip is the demo's source (demos/<name>, minus node_modules, .vercel,
 * dist and .astro), plus the buyer's README and LICENSE from templates/, plus
 * NORTHBOUND.txt naming the template and the commit it was built from. The
 * buyer gets exactly what runs on the site, and the README tells them the
 * five things to change (the fiction bar, the base path, the noindex header,
 * the environment variables, the content file).
 *
 * dist/ is ignored by git and by the deploy: the zips are what you upload to
 * the shop (Gumroad, or wherever TEMPLATES.*.url in js/config.js points).
 * Needs `zip` on the PATH.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = join(import.meta.dir, '..');
const OUT = join(ROOT, 'dist', 'templates');
const NAMES = ['atlas', 'vector', 'engine-hvac'] as const;
/* The two templates live under demos/; the engine under engines/. */
const SRC: Record<(typeof NAMES)[number], string> = { atlas: 'demos/atlas', vector: 'demos/vector', 'engine-hvac': 'engines/hvac' };
const SKIP = /(^|\/)(node_modules|\.vercel|dist|\.astro)(\/|$)/;

const sha = (await $`git -C ${ROOT} rev-parse --short HEAD`.text()).trim();
const today = new Date().toISOString().slice(0, 10);

mkdirSync(OUT, { recursive: true });
for (const name of NAMES) {
  const src = join(ROOT, SRC[name]);
  if (!existsSync(join(src, 'package.json'))) throw new Error(`${src} is not a template`);
  const stage = join(OUT, `nb-${name}`);
  rmSync(stage, { recursive: true, force: true });
  cpSync(src, stage, { recursive: true, filter: (p) => !SKIP.test(p.slice(src.length)) });
  // The engine carries its own README; the templates share one.
  if (!existsSync(join(stage, 'README.md'))) copyFileSync(join(ROOT, 'templates', 'README.md'), join(stage, 'README.md'));
  if (!existsSync(join(stage, 'LICENSE.md'))) copyFileSync(join(ROOT, 'templates', 'LICENSE.md'), join(stage, 'LICENSE.md'));
  writeFileSync(join(stage, 'NORTHBOUND.txt'), `Northbound template: ${name}\nBuilt from commit ${sha} on ${today}\nREADME.md says how to make it yours. LICENSE.md says what you may do with it.\n`);
  const zip = join(OUT, `nb-${name}.zip`);
  rmSync(zip, { force: true });
  await $`cd ${OUT} && zip -qr ${`nb-${name}.zip`} ${`nb-${name}`}`;
  rmSync(stage, { recursive: true, force: true });
  const size = (await $`stat -c %s ${zip}`.text()).trim();
  console.log(`${zip}  ${(Number(size) / 1024).toFixed(0)} KB  (from ${sha})`);
}
