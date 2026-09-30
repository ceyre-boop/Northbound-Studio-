/* The loader's "412 / 858 KB" is only honest if the manifest's sizes are the
   files' real sizes. This fails the moment one drifts; the fix is always
   `bun scripts/boot-manifest.ts`. */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifest, FILES } from '../scripts/boot-manifest.ts';

const ROOT = join(import.meta.dir, '..');

test('data/boot-manifest.json matches the files on disk, byte for byte', () => {
  const written = JSON.parse(readFileSync(join(ROOT, 'data/boot-manifest.json'), 'utf8'));
  expect(written).toEqual(manifest());
});

test('it lists the scene the loader imports', () => {
  expect(FILES).toContain('/js/home/world.js');
  expect(FILES).toContain('/js/vendor/three/three-home.min.js');
});
