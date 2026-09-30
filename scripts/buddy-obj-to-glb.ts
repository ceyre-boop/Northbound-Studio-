#!/usr/bin/env bun
/**
 * scripts/buddy-obj-to-glb.ts — turn Buddy's OBJ into the GLB the homepage loads.
 *
 *   bun scripts/buddy-obj-to-glb.ts [brand-src/buddy/animationsss.obj]
 *   bunx --bun @gltf-transform/cli@4 meshopt brand-src/buddy/buddy.raw.glb brand/3d/buddy.glb
 *
 * The OBJ (from Colin's Buddy tool) is one pose of a rigid-part robot: 158
 * named parts, a ball at every joint, plus his desk, chair, keyboard, monitor
 * and mug. An OBJ carries no animation, so this does the rigging groundwork
 * and js/home/buddy-model.js animates it:
 *
 *   - every part is assigned to the joint that carries it (JOINTS below), and
 *     parts are merged per joint and material, 158 meshes into about 40 draws;
 *   - each joint's pivot is the centre of its ball (shoulder_ball_L, …), and
 *     the pivots, Buddy's height and the rest pose's bone directions go into
 *     the scene's extras, so the runtime needs nothing but the file;
 *   - the MTL wasn't delivered, so materials are set here by name in Buddy's
 *     own palette (navy armour, graphite, the lilac glow).
 *
 * Source art stays in brand-src/ (never deployed); only brand/3d/buddy.glb ships.
 */
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SRC = process.argv[2] || join(ROOT, 'brand-src/buddy/animationsss.obj');
const OUT = join(ROOT, 'brand-src/buddy/buddy.raw.glb');

// Which joint carries each part (first match wins). Props keep their own groups.
const JOINTS: [RegExp, string][] = [
  [/^(pelvis|codpiece|codpiece_ridge|rear_plate)$/, 'pelvis'],
  [/^(waist|abdomen)$/, 'waist'],
  [/^(chest_|center_shield|core_ring|core$|keystone|backpack|collar_glow_|flank_|vent_)/, 'chest'],
  [/^neck_core$/, 'neck'],
  [/^(helmet|crest|faceplate|screen$|eye_|chin|ear_|antenna_)/, 'head'],
  [/^(pauldron_\w+|shoulder_ball|upperarm|bicep_plate)_([LR])$/, 'shoulder_$S'],
  [/^(elbow_ball|elbow_guard|forearm|forearm_glow|forearm_bolt|forearm_inner|cuff)_([LR])$/, 'elbow_$S'],
  [/^(wrist_ball|palm)_([LR])$|^(finger|thumb)_([LR])/, 'wrist_$S'],
  [/^(hip_ball|thigh_core|tasset|hip_plate|hip_glow)_([LR])$/, 'hip_$S'],
  [/^(knee_ball|kneecap|shin_core|shin_outer|shin_glow|shin_inner|shin_front)_([LR])$/, 'knee_$S'],
  [/^(ankle_ball|foot|toe)_([LR])$/, 'ankle_$S'],
  [/^desk_/, 'prop_desk'],
  [/^(keyboard|key_row_)/, 'prop_keyboard'],
  [/^(monitor_base|monitor_stand|monitor)$/, 'prop_monitor'],
  [/^monitor_screen$/, 'prop_screen'],
  [/^mug$/, 'prop_mug'],
  [/^chair_/, 'prop_chair'],
];
function jointOf(name: string): string {
  for (const [re, j] of JOINTS) {
    if (!re.test(name)) continue;
    const side = name.match(/_([LR])(\d|_|$)/)?.[1] ?? '';
    return j.replace('$S', side);
  }
  throw new Error(`no joint for part "${name}"`);
}

// Buddy's palette, written as the sRGB colours you'd pick (buddy-awesome.webp:
// deep navy armour, graphite, the lilac glow) and converted to the linear
// values glTF stores. Emissive for everything that glows.
const hex = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((c) => { const v = c / 255; return +(v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).toFixed(4); });
const MATERIALS: Record<string, { color: number[]; metal?: number; rough?: number; emissive?: number[] }> = {
  armor_blue: { color: hex(0x2433a8), metal: 0.35, rough: 0.36 },
  armor_grey: { color: hex(0x4a4b55), metal: 0.4, rough: 0.45 },
  joint_dark: { color: hex(0x25262c), metal: 0.5, rough: 0.5 },
  core_light: { color: hex(0xb3a4ff), emissive: hex(0xb3a4ff) },
  glow_strip: { color: hex(0x9f8cff), emissive: hex(0x9f8cff) },
  face_screen: { color: hex(0x15161f), metal: 0.2, rough: 0.18 },
  eye_light: { color: hex(0xd2c8ff), emissive: hex(0xd2c8ff) },
  signal_amber: { color: hex(0xffb547), emissive: hex(0xffb547) },
  desk_top: { color: hex(0xf2f5f4), rough: 0.5 },
  desk_frame: { color: hex(0x3d4148), metal: 0.5, rough: 0.4 },
  monitor_code: { color: hex(0x9ff0e1), emissive: hex(0x9ff0e1) },
  chair_fabric: { color: hex(0x2e3136), rough: 0.9 },
};

// --- parse ---------------------------------------------------------------------
const text = await Bun.file(SRC).text();
const P: number[][] = [], N: number[][] = [];
type Part = { name: string; mat: string; tris: number[][] };   // tri = [vIdx, nIdx] x3 flattened
const parts: Part[] = [];
let part: Part | null = null, mat = '';
for (const raw of text.split('\n')) {
  const line = raw.trim();
  if (line.startsWith('v ')) { const a = line.split(/\s+/); P.push([+a[1], +a[2], +a[3]]); }
  else if (line.startsWith('vn ')) { const a = line.split(/\s+/); N.push([+a[1], +a[2], +a[3]]); }
  else if (line.startsWith('o ')) { part = { name: line.slice(2).trim(), mat, tris: [] }; parts.push(part); }
  else if (line.startsWith('usemtl ')) { mat = line.slice(7).trim(); if (part) part.mat = mat; }
  else if (line.startsWith('f ') && part) {
    const idx = line.slice(2).trim().split(/\s+/).map((t) => {
      const [v, , n] = t.split('/');
      const vi = parseInt(v), ni = n ? parseInt(n) : NaN;
      return [vi > 0 ? vi - 1 : P.length + vi, Number.isNaN(ni) ? -1 : ni > 0 ? ni - 1 : N.length + ni];
    });
    for (let k = 1; k + 1 < idx.length; k++) part.tris.push([...idx[0], ...idx[k], ...idx[k + 1]]);   // fan
  }
}

// --- joints: pivots from the balls --------------------------------------------------
const bbox = (names: string[]) => {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of parts.filter((q) => names.includes(q.name))) for (const t of p.tris) for (const vi of [t[0], t[2], t[4]]) {
    const v = P[vi];
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], v[a]); hi[a] = Math.max(hi[a], v[a]); }
  }
  return { lo, hi, c: lo.map((l, a) => +((l + hi[a]) / 2).toFixed(5)) };
};
const pivots: Record<string, number[]> = {
  pelvis: bbox(['pelvis']).c,
  waist: bbox(['waist']).c,
  chest: (() => { const b = bbox(['abdomen']); return [0, +b.hi[1].toFixed(5), b.c[2]]; })(),
  neck: bbox(['neck_core']).c,
  head: (() => { const b = bbox(['neck_core']); return [0, +b.hi[1].toFixed(5), b.c[2]]; })(),
};
for (const s of ['L', 'R']) {
  pivots['shoulder_' + s] = bbox(['shoulder_ball_' + s]).c;
  pivots['elbow_' + s] = bbox(['elbow_ball_' + s]).c;
  pivots['wrist_' + s] = bbox(['wrist_ball_' + s]).c;
  pivots['hip_' + s] = bbox(['hip_ball_' + s]).c;
  pivots['knee_' + s] = bbox(['knee_ball_' + s]).c;
  pivots['ankle_' + s] = bbox(['ankle_ball_' + s]).c;
}
// Where the hand and foot "end" in the rest pose: the tip the IK aims.
const handTip = (s: string) => bbox(['palm_' + s]).c;
const footTip = (s: string) => { const b = bbox(['foot_' + s]); return [b.c[0], 0, b.c[2]]; };
const robot = parts.filter((p) => !jointOf(p.name).startsWith('prop_')).map((p) => p.name);
const height = +bbox(robot).hi[1].toFixed(4);

// --- merge per (joint, material) -------------------------------------------------------
type Batch = { key: string; joint: string; mat: string; pos: number[]; nrm: number[] };
const batches = new Map<string, Batch>();
for (const p of parts) {
  const joint = jointOf(p.name), key = `${joint}|${p.mat}`;
  if (!MATERIALS[p.mat]) throw new Error(`no material for "${p.mat}" (part ${p.name})`);
  let b = batches.get(key);
  if (!b) batches.set(key, (b = { key, joint, mat: p.mat, pos: [], nrm: [] }));
  for (const t of p.tris) for (let k = 0; k < 6; k += 2) {
    b.pos.push(...P[t[k]]);
    const n = t[k + 1] >= 0 ? N[t[k + 1]] : [0, 1, 0];
    b.nrm.push(...n);
  }
}

// --- write GLB (non-indexed; gltf-transform welds and compresses afterwards) ------------
const matNames = Object.keys(MATERIALS);
const bin: Buffer[] = [];
let offset = 0;
const bufferViews: any[] = [], accessors: any[] = [], meshes: any[] = [], nodes: any[] = [];
function addFloat(arr: number[], withBounds: boolean) {
  const f = new Float32Array(arr), buf = Buffer.from(f.buffer);
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target: 34962 });
  bin.push(buf); offset += buf.length;
  const acc: any = { bufferView: bufferViews.length - 1, componentType: 5126, count: arr.length / 3, type: 'VEC3' };
  if (withBounds) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < arr.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], arr[i + a]); hi[a] = Math.max(hi[a], arr[i + a]); }
    acc.min = lo; acc.max = hi;
  }
  accessors.push(acc);
  return accessors.length - 1;
}
for (const b of batches.values()) {
  const posAcc = addFloat(b.pos, true), nrmAcc = addFloat(b.nrm, false);
  meshes.push({ name: b.key, primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, material: matNames.indexOf(b.mat) }] });
  nodes.push({ name: b.key, mesh: meshes.length - 1, extras: { joint: b.joint } });
}
const materials = matNames.map((name) => {
  const m = MATERIALS[name];
  const out: any = { name, pbrMetallicRoughness: { baseColorFactor: [...m.color, 1], metallicFactor: m.metal ?? 0, roughnessFactor: m.rough ?? 0.6 } };
  if (m.emissive) out.emissiveFactor = m.emissive;
  return out;
});
const gltf = {
  asset: { version: '2.0', generator: 'northbound scripts/buddy-obj-to-glb.ts' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i), extras: { buddy: { height, pivots, handTip: { L: handTip('L'), R: handTip('R') }, footTip: { L: footTip('L'), R: footTip('R') }, source: 'brand-src/buddy/animationsss.obj' } } }],
  nodes, meshes, materials, accessors, bufferViews,
  buffers: [{ byteLength: offset }],
};
const pad = (b: Buffer, fill: number) => { const r = (4 - (b.length % 4)) % 4; return r ? Buffer.concat([b, Buffer.alloc(r, fill)]) : b; };
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20), data = pad(Buffer.concat(bin), 0);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + data.length, 8);
const ch = (b: Buffer, type: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, b]); };
await Bun.write(OUT, Buffer.concat([header, ch(json, 0x4e4f534a), ch(data, 0x004e4942)]));
console.log(`wrote ${OUT}: ${parts.length} parts -> ${batches.size} meshes, height ${height} m, ${(offset / 1024).toFixed(0)} KB raw`);
