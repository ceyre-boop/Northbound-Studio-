/* js/home/world.js — the building.
 *
 * The homepage is a cross-section of one building, and scrolling is the
 * camera going down it. Each floor of the page (the hero, the twelve, the
 * prices, the form) is a room with its own set and its own light, and the
 * concrete slab between two rooms sits exactly on the seam between two
 * sections of the page, so the cut from floor to floor is physical: the slab
 * crosses the screen where one section ends and the next begins.
 *
 *   Floor 1  the studio      Buddy at his desk, typing (the hero's scene);
 *                            the real Buddy, brand/3d/buddy.glb, rigged in
 *                            js/home/buddy-model.js
 *   Floor 2  the workshop    a pegboard with twelve slots that light as parts
 *                            are picked; Buddy's workbench
 *   Floor 3  the showroom    three plinths under spotlights, behind the prices
 *   Floor 4  the drafting    a drafting table and a lamp, beside the form
 *
 * The page's own content (type, cards, the form) stays in the DOM on top; the
 * world is one fixed canvas behind everything, locked to the layout: the
 * camera's height is computed from the scroll position so a point in the
 * world stays glued to the same point of the page, 1:1, except while the hero
 * is pinned (Buddy's walk-off), when the building holds still with it.
 *
 * Only on desktop floors with WebGL2 and motion (the head sets home3d-ok);
 * any failure hands the page back to its flat self through __nb3dGiveUp.
 * Test hooks: ?scrub=0..1 (Buddy's progress), ?clock=0, ?gov=off.
 * window.NB_HOME3D = { ready, progress, stats }.
 */
import * as T from '/js/vendor/three/three-home.min.js';
import { loadBuddy } from './buddy-model.js';

const q = new URLSearchParams(location.search);
const SCRUB = q.has('scrub') ? Math.min(1, Math.max(0, parseFloat(q.get('scrub')) || 0)) : null;
const FROZEN_CLOCK = q.get('clock') === '0';
const NO_GOVERNOR = q.get('gov') === 'off';

const root = document.documentElement;
const pin = document.querySelector('.hero-pin');
const stick = document.querySelector('.hero-stick');
const FLOORS = ['.hero', '#offerings', '#packages', '#quote'].map((s) => document.querySelector(s));
let resolveReady;
const api = window.NB_HOME3D = { ready: new Promise((r) => (resolveReady = r)), progress: 0, stats: { frames: 0, dpr: 0, fallback: false } };
if (!pin || !stick || FLOORS.some((f) => !f)) throw new Error('world: missing floors');
// Render-on-demand state (see frame()); declared first because the page's
// pick observer can mark the scene dirty before the loop starts.
let dirty = true, lastY = -1;

// --- renderer ---------------------------------------------------------------
const canvas = document.createElement('canvas');
canvas.id = 'nb-world';
canvas.setAttribute('aria-hidden', 'true');
document.body.insertBefore(canvas, document.body.firstChild);
const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new T.Scene();
scene.background = new T.Color(0xf4f8f6);
const FOV = 30, D = 12;                       // camera distance to the z=0 plane
const camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);

const hemi = new T.HemisphereLight(0xffffff, 0xdfe9e5, 2.3);
scene.add(hemi);
scene.add(new T.AmbientLight(0xffffff, 0.45));
const key = new T.DirectionalLight(0xfffaf0, 1.6);
key.position.set(4, 6, 8);
scene.add(key);
scene.add(key.target);
// A soft fill from the camera's side: the back walls face the viewer, and
// without it they read grey instead of white.
const fill = new T.DirectionalLight(0xffffff, 1.3);
scene.add(fill);
scene.add(fill.target);

// --- materials ----------------------------------------------------------------
const std = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...o });
const MAT = {
  // A white architectural model: light walls, light concrete, one thin mint
  // line where the building is cut.
  wall: std(0xe6f6f0),
  wallWarm: std(0xf7f5f0),
  wallShow: std(0xf1f6f4),
  wallDraft: std(0xf2f5f7),
  floor: std(0xebf1ee, { roughness: 0.6 }),
  slab: std(0xe3eae7, { roughness: 0.9 }),
  slabFace: std(0xcfd8d4, { roughness: 0.95 }),
  edge: new T.MeshBasicMaterial({ color: 0x6fe3ce, toneMapped: false }),
  wood: std(0xd9cdb8, { roughness: 0.7 }),
  graphite: std(0x4a4f57, { roughness: 0.6, metalness: 0.2 }),
  metal: std(0x9aa1a8, { roughness: 0.35, metalness: 0.6 }),
  plinth: std(0xf7faf9, { roughness: 0.5 }),
  slotOff: std(0xffffff, { roughness: 0.6 }),
  board: std(0xdfe7e4, { roughness: 0.85 }),
  slotOn: new T.MeshBasicMaterial({ color: 0x6fe3ce, toneMapped: false }),
  beam: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, side: T.DoubleSide }),
  lampGlow: new T.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }),
};
// Materials every rebuild reuses; everything else a room makes is its own and
// is disposed with it.
const SHARED = new Set(Object.values(MAT));
const box = (w, h, d, m, x = 0, y = 0, z = 0, parent) => {
  const b = new T.Mesh(new T.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  (parent || scene).add(b);
  return b;
};
function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
// A vertical fade, dark at the bottom edge, for the soft shading in the room's corners.
const shadeTex = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, 'rgba(40,70,62,0.35)'); grd.addColorStop(1, 'rgba(40,70,62,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 128);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
})();
const pool = (w, d, color, opacity, parent) => {
  const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ map: glowTexture(color, 'rgba(0,0,0,0)'), transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  parent.add(m);
  return m;
};

// --- the building ---------------------------------------------------------------
// Rebuilt on every layout change: each room's height is its section's height.
const building = new T.Group();
scene.add(building);
const BACK = -3.4, SLAB = 0.34;
let rooms = [];
const slots = [];
const plinths = [];

function clearBuilding() {
  building.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !SHARED.has(o.material)) { if (o.material.map && o.material.map !== shadeTex) o.material.map.dispose(); o.material.dispose(); }
  });
  building.clear();
  rooms = []; slots.length = 0; plinths.length = 0;
}

// World x, at depth z, of the middle of the page's left margin (beside the
// 1000px content column), or null when the margin is too narrow to show
// anything in it: set dressing that would only peek from behind a card is
// better left out.
function leftMarginX(z) {
  const margin = (W - Math.min(W, 1000)) / 2;
  if (margin < 150) return null;
  return ((margin / 2 - W / 2) / ppu) * ((D - z) / D);
}

function makeRoom(i, top, bottom, width) {
  const g = new T.Group();
  building.add(g);
  const h = top - bottom, floorY = bottom + SLAB / 2, ceilY = top - SLAB / 2, cx = 0, w = width;
  const walls = [MAT.wall, MAT.wallWarm, MAT.wallShow, MAT.wallDraft][i];
  // Back wall, floor and the slab under this room (its front face is the seam).
  box(w, ceilY - floorY, 0.1, walls, cx, (floorY + ceilY) / 2, BACK - 0.05, g);
  box(w, 0.02, -BACK, MAT.floor, cx, floorY, BACK / 2, g);
  // The slab runs from the back wall to the z=0 plane, the plane the camera
  // is locked to the page at, so its cut face and the mint line on it sit
  // on the seam between two sections exactly, at every scroll position.
  box(w, SLAB, -BACK, MAT.slab, cx, bottom, BACK / 2, g);
  box(w, SLAB, 0.002, MAT.slabFace, cx, bottom, 0.001, g);
  box(w, 0.016, 0.002, MAT.edge, cx, bottom, 0.003, g);   // the lit edge of the cut, on the seam
  const shade = (y, flip) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, 0.9), new T.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    m.position.set(cx, y, BACK + 0.01);
    if (flip) m.rotation.z = Math.PI;
    g.add(m);
  };
  shade(floorY + 0.45, false);
  shade(ceilY - 0.45, true);
  const room = { group: g, top, bottom, floorY, ceilY };

  if (i === 0) {
    // The studio: a tall window of daylight on the right half of the back
    // wall, where the headline reads; Buddy's desk comes in separately.
    const win = new T.Mesh(new T.PlaneGeometry(w * 0.34, (ceilY - floorY) * 0.62), new T.MeshBasicMaterial({ map: glowTexture('rgba(255,255,255,0.95)', 'rgba(232,247,242,0)'), transparent: true, depthWrite: false }));
    win.position.set(w * 0.22, floorY + (ceilY - floorY) * 0.55, BACK + 0.02);
    g.add(win);
    pool(w * 0.5, 3, 'rgba(111,227,206,0.28)', 1, g).position.set(-w * 0.22, floorY + 0.012, -0.6);
  }
  if (i === 1) {
    // The workshop: a pegboard of twelve slots at the left margin, beside
    // the grid of twelve cards, and a workbench under it. A slot lights when
    // its part is picked on the page.
    const px = leftMarginX(BACK + 0.4);
    if (px !== null) {
    box(1.5, 2.1, 0.06, MAT.board, px, floorY + 1.9, BACK + 0.05, g);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const s = box(0.3, 0.3, 0.05, MAT.slotOff, px - 0.42 + c * 0.42, floorY + 2.72 - r * 0.46, BACK + 0.11, g);
      slots.push(s);
    }
    box(1.9, 0.08, 0.8, MAT.wood, px, floorY + 0.92, BACK + 0.55, g);
    for (const dx of [-0.85, 0.85]) box(0.06, 0.9, 0.7, MAT.metal, px + dx, floorY + 0.45, BACK + 0.55, g);
    pool(3, 2.4, 'rgba(255,214,160,0.35)', 1, g).position.set(px, floorY + 0.012, BACK + 1.2);
    }
  }
  if (i === 2) {
    // The showroom: three plinths behind the three price cards, each under a
    // beam of light from the ceiling. The plinth for the package that covers
    // the visitor's picks glows.
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * Math.min(w * 0.23, 4.2);
      const p = box(1.3, 1.1, 1.3, MAT.plinth, x, floorY + 0.55, BACK + 1.2, g);
      const beam = new T.Mesh(new T.CylinderGeometry(0.35, 1.2, ceilY - floorY - 1.1, 24, 1, true), MAT.beam.clone());
      beam.position.set(x, floorY + 1.1 + (ceilY - floorY - 1.1) / 2, BACK + 1.2);
      g.add(beam);
      const spot = pool(2.2, 2.2, 'rgba(255,255,255,0.9)', 0.55, g);
      spot.position.set(x, floorY + 1.105, BACK + 1.2);
      plinths.push({ p, beam, spot });
    }
  }
  if (i === 3) {
    // The drafting room: a drafting table and a lamp at the left margin,
    // beside the form, in a pool of warm light.
    const dx = leftMarginX(BACK + 1.1);
    if (dx === null) return room;
    const top3 = box(1.7, 0.05, 1.1, MAT.wood, dx, floorY + 1.05, BACK + 1.1, g);
    top3.rotation.x = -0.22;
    for (const ox of [-0.75, 0.75]) box(0.05, 1.0, 0.05, MAT.graphite, dx + ox, floorY + 0.5, BACK + 1.1, g);
    box(0.04, 0.9, 0.04, MAT.graphite, dx + 0.95, floorY + 1.5, BACK + 0.8, g);
    box(0.28, 0.12, 0.28, MAT.graphite, dx + 0.8, floorY + 1.95, BACK + 0.9, g);
    box(0.2, 0.02, 0.2, MAT.lampGlow, dx + 0.8, floorY + 1.885, BACK + 0.9, g);
    pool(2.8, 2.2, 'rgba(255,220,170,0.45)', 1, g).position.set(dx + 0.3, floorY + 0.012, BACK + 1.2);
  }
  return room;
}

// --- Buddy and his desk, in the studio ----------------------------------------
// Loaded in boot() (brand/3d/buddy.glb); the building can draw without him.
let buddy = null;
const station = new T.Group();               // his desk, keyboard, monitor, mug and chair
const actor = new T.Group();                 // desk + Buddy, placed in the studio each layout
actor.add(station);
scene.add(actor);
const screenLight = new T.PointLight(0x7de8d4, 0, 2.2, 1.6);
scene.add(screenLight);
const SEAT_YAW = 1.2, WALK_YAW = -Math.PI / 2;
station.rotation.y = SEAT_YAW;

// --- layout: lock the world to the page ------------------------------------------
let W = 0, H = 0, ppu = 1, travel = 0, docTops = [], exitX = -6, actorScale = 1;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function pinTravel() { return Math.max(0, pin.offsetHeight - stick.offsetHeight); }
function docTop(el) { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }
function layout(force) {
  const w = window.innerWidth, h = window.innerHeight;
  if (!force && w === W && h === H) return;
  W = w; H = h;
  const dpr = lowered ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  api.stats.dpr = dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  ppu = H / (2 * D * Math.tan(T.MathUtils.degToRad(FOV) / 2));
  travel = pinTravel();
  // Each floor's top and bottom in "page pixels with the pin taken out": the
  // hero's floor starts under the header, and everything after the pin moves
  // up by the pin's travel, because the building holds still while pinned.
  const head = document.querySelector('.site-header').offsetHeight;
  docTops = FLOORS.map((el, i) => {
    const t = i === 0 ? head : docTop(el) - travel;
    return { top: t, bottom: t + el.offsetHeight };
  });
  clearBuilding();
  const width = (W / ppu) * ((D - BACK) / D) + 2;   // wide enough to fill the frame at the back wall
  docTops.forEach((f, i) => rooms.push(makeRoom(i, -f.top / ppu, -f.bottom / ppu, width)));
  // A ceiling over the studio so the top of the building is closed.
  box(width, SLAB, -BACK, MAT.slab, 0, rooms[0].top, BACK / 2, building);
  placeActor();
  syncSlots();
  dirty = true;
}

// Buddy and his desk stand in the studio under the hero's left column, where
// the poster Buddy stood, at the depth where he reads at about 46% of the
// floor's height.
function placeActor() {
  const room = rooms[0];
  const heroH = docTops[0].bottom - docTops[0].top;
  const z = 0.2;
  const k = (D - z) / D;                                    // world units per page unit at depth z, relative to z=0
  actorScale = (heroH * 0.5 / ppu) * k / (buddy ? buddy.HEIGHT : 2.26);
  actor.scale.setScalar(actorScale);
  const hero = FLOORS[0], cs = getComputedStyle(hero);
  const buddyW = parseFloat(cs.getPropertyValue('--buddy-w')) || W * 0.3;
  const gutter = parseFloat(getComputedStyle(root).getPropertyValue('--gutter')) || 32;
  const cxPx = Math.max(0, (W - 1080) / 2) + gutter + buddyW / 2 - buddyW * 0.16;
  actor.position.set(((cxPx - W / 2) / ppu) * k, room.floorY, z);
  // How far left he walks, in his own scaled units, to clear the frame.
  const leftEdge = ((-W * 0.14 - W / 2) / ppu) * k;
  exitX = (leftEdge - actor.position.x) / actorScale;
  api.stats.exitX = +exitX.toFixed(2);
}

// --- the page talks to the world ---------------------------------------------------
const PARTS = ['A custom site', 'Brand identity', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests', 'Owner dashboard', 'Local SEO', 'AI intake'];
const HAS = {
  0: ['A custom site'],
  1: ['A custom site', 'Brand identity', 'Local SEO'],
  2: ['A custom site', 'Brand identity', 'Local SEO', 'Booking flow', 'Quote flow', 'Payments', 'Lead capture', 'Automated follow-up', 'Reminders', 'Review requests', 'Owner dashboard'],
};
let picked = [], pickObserver = null;
function syncSlots() {
  slots.forEach((s, i) => { s.material = picked.includes(PARTS[i]) ? MAT.slotOn : MAT.slotOff; });
  dirty = true;
  // The smallest package that covers every pick gets the light; none picked,
  // all three stand equal.
  let fit = -1;
  if (picked.length) for (let k = 0; k < 3 && fit < 0; k++) if (picked.every((p) => HAS[k].includes(p))) fit = k;
  if (picked.length && fit < 0) fit = 2;
  plinths.forEach((pl, k) => {
    const on = fit === k, dim = fit >= 0 && !on;
    pl.beam.material.opacity = on ? 0.26 : dim ? 0.05 : 0.12;
    pl.spot.material.opacity = on ? 0.9 : dim ? 0.2 : 0.55;
  });
}
const list = document.getElementById('offerings-list');
if (list) {
  const read = () => { picked = [...list.querySelectorAll('.offer[aria-pressed="true"]')].map((b) => b.getAttribute('data-part')); syncSlots(); };
  pickObserver = new MutationObserver(read);
  pickObserver.observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  read();
}

// --- choreography --------------------------------------------------------------------
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (u) => u * u * (3 - 2 * u);
function progressTarget() {
  if (SCRUB !== null) return SCRUB;
  return travel > 0 ? clamp01(window.scrollY / travel) : 0;
}
let p = progressTarget(), v = 0;
function follow(dt) {
  const target = progressTarget();
  if (SCRUB !== null) { p = target; v = 0; return; }
  const w = 9;
  const f = 1 + 2 * dt * w + 1.48 * (dt * w) * (dt * w) + 0.235 * Math.pow(dt * w, 3);
  const change = p - target, temp = (v + w * change) * dt;
  v = (v - w * temp) / f;
  p = target + (change + temp) / f;
}

let clock = 0;
const tmp = new T.Vector3();
function stage(dt) {
  if (!FROZEN_CLOCK) clock += dt;
  follow(dt);
  api.progress = p;

  // The camera: glued to the page, holding still while the hero is pinned.
  const eff = window.scrollY - Math.min(window.scrollY, travel);
  const camY = -(eff + H / 2) / ppu;
  camera.position.set(0, camY, D);
  // Each floor has its own light, and it changes as the camera passes the
  // slab: daylight in the studio, warm in the workshop, gallery-cool in the
  // showroom, lamplight in the drafting room.
  light(camY);
  key.position.set(4, camY + 6, 8);
  key.target.position.set(0, camY, 0);
  fill.position.set(0, camY + 1, D);
  fill.target.position.set(0, camY, BACK);

  if (!buddy) return;
  // Buddy's walk-off, driven by the pin: typing, then he rises (.06-.34),
  // turns (.34-.48) and walks out of frame left (.46-1), feet locked.
  const rise = ease(seg(p, 0.06, 0.34));
  const turn = ease(seg(p, 0.34, 0.48));
  const go = seg(p, 0.46, 1);
  const walkIn = ease(seg(p, 0.44, 0.52));
  const distance = go * Math.abs(exitX);
  buddy.pose({ t: clock, sit: 1 - rise, walk: walkIn, phase: (distance / buddy.STRIDE) * Math.PI * 2 });
  buddy.object.rotation.y = T.MathUtils.lerp(SEAT_YAW, WALK_YAW, turn);
  const back = rise * 0.42;
  buddy.object.position.set(Math.sin(SEAT_YAW) * -back - distance, 0, Math.cos(SEAT_YAW) * -back);
  // The chair rolls back from the desk as he rises (props are turned -90°,
  // so their local -X is "behind Buddy").
  buddy.chair.position.set(-rise * 0.62, 0, rise * 0.22);
  const typing = 1 - rise;
  const flicker = 0.9 + Math.sin(clock * 7.3) * 0.05 + Math.sin(clock * 19.1) * 0.03;
  const lvl = (0.35 + 0.65 * typing) * flicker;
  if (buddy.screenGlow) buddy.screenGlow.emissive.setRGB(0.62 * lvl, 0.94 * lvl, 0.88 * lvl);
  if (buddy.screen) screenLight.position.copy(buddy.screen.getWorldPosition(tmp));
  screenLight.intensity = 2.4 * typing * flicker * actorScale;
  screenLight.distance = 2.2 * actorScale;
}

const MOOD = [
  { sky: new T.Color(0xf1fffa), key: new T.Color(0xffffff), exposure: 1.12 },
  { sky: new T.Color(0xfff3e4), key: new T.Color(0xffe9cf), exposure: 1.1 },
  { sky: new T.Color(0xf1f5ff), key: new T.Color(0xf4f7ff), exposure: 1.06 },
  { sky: new T.Color(0xfff0dc), key: new T.Color(0xffe2bd), exposure: 1.08 },
];
function light(camY) {
  if (!rooms.length) return;
  const mid = rooms.map((r) => (r.top + r.bottom) / 2);
  let i = 0;
  while (i < mid.length - 1 && camY < mid[i + 1]) i++;
  const j = Math.min(i + 1, mid.length - 1);
  const u = i === j ? 0 : clamp01((mid[i] - camY) / (mid[i] - mid[j]));
  const e = u * u * (3 - 2 * u);
  hemi.color.copy(MOOD[i].sky).lerp(MOOD[j].sky, e);
  key.color.copy(MOOD[i].key).lerp(MOOD[j].key, e);
  renderer.toneMappingExposure = MOOD[i].exposure + (MOOD[j].exposure - MOOD[i].exposure) * e;
}

// --- loop, visibility, governor, the way out --------------------------------------------
let running = false, last = 0, dead = false, lowered = false;
const frameMs = [];
function frame(now) {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  if (last) { frameMs.push(now - last); if (frameMs.length > 90) frameMs.shift(); }
  last = now;
  layout(false);
  stage(dt);
  // Draw only when something on screen can have changed: the page moved, a
  // pick or a layout changed, Buddy is still easing to the scroll, or the
  // studio (where he types on his own clock) is in view. Reading a floor
  // with nothing moving costs a rAF tick, not a full-screen frame.
  const y = window.scrollY, studio = y < docTops[0].bottom + travel;
  if (dirty || y !== lastY || Math.abs(v) > 1e-4 || studio || SCRUB !== null) {
    renderer.render(scene, camera);
    api.stats.frames++;
    dirty = false;
    lastY = y;
  } else frameMs.length = 0;   // idle frames say nothing about the device
  govern();
}
function start() { if (running || dead || document.hidden) return; running = true; last = 0; renderer.setAnimationLoop(frame); }
function stop() { if (!running) return; running = false; renderer.setAnimationLoop(null); }
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

// Judged against the device's own frame interval: a steady 30fps (Energy
// Saver, Low Power Mode) is fine; a slow median or frames that keep dropping
// are not. First resolution goes down; then the page goes flat.
function govern() {
  if (NO_GOVERNOR || SCRUB !== null || frameMs.length < 90) return;
  const sorted = [...frameMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)], p90 = sorted[Math.floor(sorted.length * 0.9)];
  if (median <= 45 && p90 <= median * 2.2) return;
  frameMs.length = 0;
  if (!lowered) { lowered = true; renderer.setPixelRatio(1); api.stats.dpr = 1; return; }
  fail('frame rate');
}
function fail(why) {
  if (dead) return;
  dead = true;
  console.warn('[world] handing the page back to its flat self:', why);
  stop();
  bodyObserver.disconnect();
  if (pickObserver) pickObserver.disconnect();
  api.stats.fallback = true;
  try { renderer.forceContextLoss(); renderer.dispose(); } catch (e) {}
  canvas.remove();
  if (root.__nb3dGiveUp) root.__nb3dGiveUp(); else root.classList.remove('home3d-ok', 'home3d-live');
  resolveReady();
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('context lost'); });
const floorsMq = matchMedia('(min-width: 960px) and (min-height: 640px)');
floorsMq.addEventListener('change', () => { if (!floorsMq.matches) fail('left the desktop floors'); });
const calm = matchMedia('(prefers-reduced-motion: reduce)');
if (!/[?&]motion=full\b/.test(location.search)) calm.addEventListener('change', () => { if (calm.matches) fail('reduced motion switched on'); });
// Layout can change without a resize (fonts, the question's answer): re-lock.
const bodyObserver = new ResizeObserver(() => { if (!dead) layout(true); });
bodyObserver.observe(document.body);

async function boot() {
  const loader = new T.GLTFLoader();
  loader.setMeshoptDecoder(T.MeshoptDecoder);
  buddy = await loadBuddy(T, loader);
  station.add(buddy.props);
  actor.add(buddy.object);
  layout(true);
  stage(1 / 60);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  if (dead) return;
  root.classList.add('home3d-live');
  start();
  resolveReady();
}
boot().catch((err) => fail(err));
