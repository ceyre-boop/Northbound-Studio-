/* js/home/hero3d.js — Buddy at work, in the hero.
 *
 * He sits at his desk typing on his own clock. When the visitor scrolls, the
 * hero holds still (the pin is .hero-pin/.hero-stick in index.html) and the
 * scroll drives him: he stops typing, stands, pushes the chair back, turns to
 * face us, and walks out of frame to the left. Then the pin lets go and the
 * page carries on to the twelve.
 *
 * Only the scene is new; the hero's mint wash, its machine and its type are
 * the page's own and stay exactly where they are. This module is imported
 * only when the head script set html.home3d-ok (WebGL2, motion allowed,
 * desktop floors, a device with the memory for it); everywhere else the still
 * poster is the hero, unchanged.
 *
 * Choreography is a function of one number, progress p in 0..1 across the
 * pin, smoothed by a critically damped spring so wheel steps don't read as
 * steps. Test hooks: ?scrub=0..1 freezes p, ?clock=0 freezes the typing
 * clock, ?gov=off turns the frame governor off (tests: headless Chromium
 * renders WebGL in software). window.NB_HOME3D exposes { ready, progress, stats }.
 */
import * as T from '/js/vendor/three/three-home.min.js';
import { makeGrayboxBuddy, makeStation } from './buddy-rig.js';

const q = new URLSearchParams(location.search);
const SCRUB = q.has('scrub') ? Math.min(1, Math.max(0, parseFloat(q.get('scrub')) || 0)) : null;
const FROZEN_CLOCK = q.get('clock') === '0';
const NO_GOVERNOR = q.get('gov') === 'off';

const hero = document.querySelector('.hero');
const pin = document.querySelector('.hero-pin');
const root = document.documentElement;
let resolveReady;
const api = window.NB_HOME3D = { ready: new Promise((r) => (resolveReady = r)), progress: 0, stats: { frames: 0, dpr: 0, fallback: false } };

if (!hero || !pin) throw new Error('hero3d: missing .hero or .hero-pin');

// --- scene ------------------------------------------------------------------
const canvas = document.createElement('canvas');
canvas.className = 'hero-3d';
canvas.setAttribute('aria-hidden', 'true');
hero.insertBefore(canvas, hero.firstChild);

// The default GPU, not 'high-performance': on a dual-GPU laptop a hero
// animation isn't worth waking the discrete card.
const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(26, 1, 0.1, 60);

scene.add(new T.HemisphereLight(0xf4fffc, 0xa8c7c0, 2.1));
scene.add(new T.AmbientLight(0xffffff, 0.35));
const key = new T.DirectionalLight(0xfffaf2, 2.4);
key.position.set(2.5, 4, 3.5);
scene.add(key);
const rim = new T.DirectionalLight(0xbfeee4, 1.1);
rim.position.set(-3, 2.5, -3);
scene.add(rim);
const screenLight = new T.PointLight(0x7de8d4, 0, 2.2, 1.6);   // the monitor lighting his visor
scene.add(screenLight);

const buddy = makeGrayboxBuddy(T);
const station = makeStation(T);
const world = new T.Group();          // placed on the hero's floor rings on every resize
scene.add(world);
world.add(station.object);
world.add(buddy.object);

// A soft contact shadow under the desk and one that walks with him.
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(14,40,36,0.32)'); grd.addColorStop(1, 'rgba(14,40,36,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
}
const shadowTex = shadowTexture();
const shadowMat = new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const deskShadow = new T.Mesh(new T.PlaneGeometry(2.2, 1.6), shadowMat);
deskShadow.rotation.x = -Math.PI / 2; deskShadow.position.y = 0.002;
station.object.add(deskShadow);
deskShadow.position.z = 0.35;
const walkShadow = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), shadowMat.clone());
walkShadow.rotation.x = -Math.PI / 2; walkShadow.position.y = 0.003;
world.add(walkShadow);

// Where he sits, facing his desk: turned three-quarters toward the viewer so
// the screen's light falls on his visor.
const SEAT_YAW = 1.2;
const WALK_YAW = -Math.PI / 2;
station.object.rotation.y = SEAT_YAW;

// --- layout: stand the scene on the hero's floor rings -----------------------
let W = 0, H = 0, exitX = -6;
function screenToGround(px, py) {
  const ndc = new T.Vector3((px / W) * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  const t = -camera.position.y / dir.y;
  return camera.position.clone().addScaledVector(dir, t);
}
function layout() {
  const r = hero.getBoundingClientRect();
  if (Math.round(r.width) === W && Math.round(r.height) === H) return;
  W = Math.round(r.width); H = Math.round(r.height);
  const dpr = lowered ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  api.stats.dpr = dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // Distance so a standing Buddy is about 46% of the hero's height: the
  // whole station has to live inside the poster's column, clear of the copy.
  const fov = T.MathUtils.degToRad(camera.fov);
  const dist = 1.85 / (0.46 * 2 * Math.tan(fov / 2));
  camera.position.set(0, 1.35, dist);
  camera.lookAt(0, 0.92, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // The floor glow and rings are centred under the poster Buddy's column
  // (.hs-fl in index.html); anchor the scene there, a little above the
  // hero's bottom edge.
  const cs = getComputedStyle(hero);
  const buddyW = parseFloat(cs.getPropertyValue('--buddy-w')) || W * 0.3;
  const gutter = parseFloat(getComputedStyle(root).getPropertyValue('--gutter')) || 32;
  const cx = Math.max(0, (W - 1080) / 2) + gutter + buddyW / 2;
  const at = screenToGround(cx - buddyW * 0.16, H * 0.9);
  world.position.set(at.x, 0, at.z);
  // How far left he must walk to be fully out of frame, in world units.
  const edge = screenToGround(-W * 0.14, H * 0.9);
  exitX = edge.x - at.x;
  api.stats.exitX = +exitX.toFixed(2); api.stats.anchor = [+at.x.toFixed(2), +at.z.toFixed(2)];
}

// --- choreography ------------------------------------------------------------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (u) => u * u * (3 - 2 * u);

function progressTarget() {
  if (SCRUB !== null) return SCRUB;
  const r = pin.getBoundingClientRect();
  const travel = pin.offsetHeight - document.querySelector('.hero-stick').offsetHeight;
  return travel > 0 ? clamp01(-r.top / travel) : 0;
}

// Critically damped follow: fast enough to feel attached to the wheel,
// soft enough that a mouse wheel's discrete steps come out as one motion.
let p = progressTarget(), v = 0;
function follow(dt) {
  const target = progressTarget();
  if (SCRUB !== null) { p = target; v = 0; return; }
  const w = 9;
  const f = 1 + 2 * dt * w + 1.48 * (dt * w) * (dt * w) + 0.235 * Math.pow(dt * w, 3);
  const change = p - target;
  const temp = (v + w * change) * dt;
  v = (v - w * temp) / f;
  p = target + (change + temp) / f;
}

let clock = 0;
function stage(dt) {
  if (!FROZEN_CLOCK) clock += dt;
  follow(dt);
  api.progress = p;

  // 0 .. .06   typing, untouched: a nudge of the wheel doesn't stand him up
  // .06 .. .34  hands off the keys, he rises, the chair rolls back
  // .34 .. .46  he turns from the desk to face us, then to his left
  // .46 .. 1    he walks out of frame, feet locked to the ground
  const rise = ease(seg(p, 0.06, 0.34));
  const turn = ease(seg(p, 0.34, 0.48));
  const go = seg(p, 0.46, 1);
  const walkIn = ease(seg(p, 0.44, 0.52));

  const distance = go * Math.abs(exitX);
  const phase = (distance / buddy.STRIDE) * Math.PI * 2;
  buddy.pose({ t: clock, sit: 1 - rise, walk: walkIn, phase });

  // Seated he is in the chair, which sits in the station's frame; standing
  // he steps back and clear of it, then walks.
  const yaw = T.MathUtils.lerp(SEAT_YAW, WALK_YAW, turn);
  buddy.object.rotation.y = yaw;
  const back = rise * 0.42;
  const sx = Math.sin(SEAT_YAW) * -back, sz = Math.cos(SEAT_YAW) * -back;
  buddy.object.position.set(sx - distance, 0, sz);
  station.chair.position.z = -rise * 0.62;
  station.chair.position.x = rise * 0.28;
  walkShadow.position.set(buddy.object.position.x, 0.003, buddy.object.position.z);
  walkShadow.material.opacity = 1 - clamp01((go - 0.9) / 0.1);

  // The screen breathes while he types and dims once he has left it.
  const typing = 1 - rise;
  const flicker = 0.9 + Math.sin(clock * 7.3) * 0.05 + Math.sin(clock * 19.1) * 0.03;
  station.screenGlow.color.setRGB(0.62 * (0.35 + 0.65 * typing) * flicker, 0.94 * (0.35 + 0.65 * typing) * flicker, 0.88 * (0.35 + 0.65 * typing) * flicker);
  const sp = station.screen.getWorldPosition(new T.Vector3());
  screenLight.position.copy(sp);
  screenLight.intensity = 2.4 * typing * flicker;
}

// --- loop, visibility, governor ---------------------------------------------
let visible = false, running = false, last = 0, dead = false;
const frameMs = [];
function frame(now) {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  if (last) { frameMs.push(now - last); if (frameMs.length > 90) frameMs.shift(); }
  last = now;
  layout();
  stage(dt);
  renderer.render(scene, camera);
  api.stats.frames++;
  govern();
}
function start() { if (running || dead || !visible) return; running = true; last = 0; renderer.setAnimationLoop(frame); }
function stop() { if (!running) return; running = false; renderer.setAnimationLoop(null); }
const io = new IntersectionObserver((e) => {
  visible = e.some((x) => x.isIntersecting);
  visible ? start() : stop();
});
io.observe(hero);

/* The one way out from here: stop drawing for good, release the GPU context,
   and hand the page back to the still (the head script's __nb3dGiveUp also
   removes the pin and keeps the visitor's place). */
function fail(why) {
  if (dead) return;
  dead = true;
  console.warn('[hero3d] handing the hero back to the still:', why);
  stop();
  io.disconnect();
  api.stats.fallback = true;
  try { renderer.forceContextLoss(); renderer.dispose(); } catch (e) {}
  canvas.remove();
  if (root.__nb3dGiveUp) root.__nb3dGiveUp();
  else root.classList.remove('home3d-ok', 'home3d-live');
  resolveReady();
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('context lost'); });
// The conditions the head checked can change under a running page.
const floors = matchMedia('(min-width: 960px) and (min-height: 640px)');
const calm = matchMedia('(prefers-reduced-motion: reduce)');
floors.addEventListener('change', () => { if (!floors.matches) fail('left the desktop floors'); });
if (!/[?&]motion=full\b/.test(location.search)) calm.addEventListener('change', () => { if (calm.matches) fail('reduced motion switched on'); });

// Judged against this device's own frame interval, not a fixed number: a
// laptop in Energy Saver or Low Power Mode runs a steady 30fps, and that is
// fine. What isn't fine is a slow median (under ~22fps) or frames that keep
// dropping (the 90th percentile far past the median). First drop resolution;
// if it still can't keep up, hand the hero back to the still.
let lowered = false;
function govern() {
  if (NO_GOVERNOR || SCRUB !== null || frameMs.length < 90) return;
  const sorted = [...frameMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  if (median <= 45 && p90 <= median * 2.2) return;
  frameMs.length = 0;
  if (!lowered) { lowered = true; renderer.setPixelRatio(1); api.stats.dpr = 1; return; }
  fail('frame rate');
}

// --- go ----------------------------------------------------------------------
async function boot() {
  layout();
  stage(1 / 60);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  if (dead) return;
  root.classList.add('home3d-live');
  start();
  resolveReady();
}
boot().catch((err) => fail(err));
