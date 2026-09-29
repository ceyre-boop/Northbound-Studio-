#!/usr/bin/env bun
/**
 * scripts/boot-manifest.ts — write data/boot-manifest.json.
 *
 *   bun scripts/boot-manifest.ts
 *
 * The homepage loader counts real bytes against this list: every file the
 * hero scene needs, with its size on disk. Streamed responses report bytes
 * after decompression, which is exactly the size on disk, so the count ends
 * on the total. tests/boot-manifest.unit.test.ts fails if a listed file's
 * size drifts from what is written here, so run this after changing any of
 * them (or adding Buddy's GLB to FILES).
 */
import { join } from 'node:path';
import { statSync } from 'node:fs';

export const FILES = [
  '/js/vendor/three/three-home.min.js',
  '/js/home/hero3d.js',
  '/js/home/buddy-rig.js',
];

const ROOT = join(import.meta.dir, '..');
export function manifest() {
  return { files: FILES.map((path) => ({ path, bytes: statSync(join(ROOT, path)).size })) };
}

if (import.meta.main) {
  const m = manifest();
  await Bun.write(join(ROOT, 'data/boot-manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const kb = m.files.reduce((n, f) => n + f.bytes, 0) / 1024;
  console.log(`wrote data/boot-manifest.json: ${m.files.length} files, ${kb.toFixed(0)} KB`);
}
