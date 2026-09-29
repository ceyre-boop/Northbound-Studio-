#!/usr/bin/env bun
/**
 * scripts/vendor-three.ts — rebuild js/vendor/three/three-home.min.js.
 *
 *   bun scripts/vendor-three.ts
 *
 * The npm package stopped shipping minified builds, and the unminified core
 * is over a megabyte. This bundles only what js/vendor/three/entry.js names,
 * tree-shaken and minified, into one ES module the homepage imports as-is.
 * Run it after changing entry.js or bumping `three` in package.json, and
 * commit the output: the deployed site never runs a build.
 */
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const out = await Bun.build({
  entrypoints: [join(ROOT, 'js/vendor/three/entry.js')],
  format: 'esm',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
});
if (!out.success) {
  for (const log of out.logs) console.error(log);
  process.exit(1);
}
const version = (await Bun.file(join(ROOT, 'node_modules/three/package.json')).json()).version;
const code = `/* three.js r${version.split('.')[1]} (MIT), homepage slice — built by scripts/vendor-three.ts */\n` + (await out.outputs[0].text());
const dest = join(ROOT, 'js/vendor/three/three-home.min.js');
await Bun.write(dest, code);
const gz = Bun.gzipSync(new TextEncoder().encode(code)).length;
console.log(`wrote ${dest}: ${(code.length / 1024).toFixed(0)} KB, ${(gz / 1024).toFixed(0)} KB gzipped`);
