/* js/home/job3d.js — Buddy takes the job.
 *
 * On the last floor ("Tell us what the job is."), in the space under the lede,
 * Buddy walks in from the left as the floor scrolls into view, turns to his
 * desk, sits and starts typing: the visitor tells us the job and he is
 * already at work on it. Scrolling back up plays it backwards: he stands and
 * walks away. It is the hero's old walk-off run in reverse.
 *
 * The hero is untouched. This module is imported only when the head set
 * html.home3d-ok (WebGL2 on real hardware, motion allowed, desktop floors) and
 * only once #quote is near the screen, so its bytes never compete with the
 * first paint. Anything that fails removes the stage and the page is main's.
 *
 * Test hooks: ?scrub=0..1 freezes the arrival (1 = seated), ?clock=0 freezes
 * the typing clock, ?gov=off turns the frame governor off.
 * window.NB_HOME3D = { ready, progress, stats }.
 */
import * as T from '/js/vendor/three/three-home.min.js';
import { loadBuddy } from './buddy-model.js';

const q = new URLSearchParams(location.search);
const SCRUB = q.has('scrub') ? Math.min(1, Math.max(0, parseFloat(q.get('scrub')) || 0)) : null;
const FROZEN_CLOCK = q.get('clock') === '0';
const NO_GOVERNOR = q.get('gov') === 'off';

const root = document.documentElement;
const floor = document.querySelector('#quote');
const stageEl = document.querySelector('#quote .job-stage');
let resolveReady;
const api = window.NB_HOME3D = { ready: new Promise((r) => (resolveReady = r)), progress: 0, stats: { frames: 0, dpr: 0, fallback: false } };
if (!floor || !stageEl) throw new Error('job3d: missing #quote .job-stage');

// --- scene ------------------------------------------------------------------
// The canvas bleeds out of the stage to the left edge of the screen, so he
// walks in from the page's edge, not from the column's.
const canvas = document.createElement('canvas');
canvas.className = 'job-3d';
canvas.setAttribute('aria-hidden', 'true');
stageEl.appendChild(canvas);

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

// Buddy is Colin's model (brand/3d/buddy.glb, rigged in js/home/buddy-model.js),
// with his desk, keyboard, monitor, mug and chair.
let buddy = null;
const station = new T.Group();
const world = new T.Group();
scene.add(world);
world.add(station);

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(14,40,36,0.28)'); grd.addColorStop(1, 'rgba(14,40,36,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
}
const shadowMat = new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
const deskShadow = new T.Mesh(new T.PlaneGeometry(2.4, 1.8), shadowMat);
deskShadow.rotation.x = -Math.PI / 2; deskShadow.position.set(0, 0.002, 0.35);
station.add(deskShadow);
const walkShadow = new T.Mesh(new T.PlaneGeometry(1, 1), shadowMat.clone());
walkShadow.rotation.x = -Math.PI / 2; walkShadow.position.y = 0.003;
world.add(walkShadow);

// Seated, he faces his desk turned three-quarters toward the viewer; walking
// in, he faces right (toward the desk and the form beside it).
const SEAT_YAW = 1.2;
const WALK_YAW = Math.PI / 2;
station.rotation.y = SEAT_YAW;

// --- layout: stand him in the stage -----------------------------------------------
let W = 0, H = 0, enterX = -6, bleed = 0;
function screenToGround(px, py) {
  const ndc = new T.Vector3((px / W) * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  const t = -camera.position.y / dir.y;
  return camera.position.clone().addScaledVector(dir, t);
}
function layout() {
  const r = stageEl.getBoundingClientRect();
  const b = Math.max(0, Math.round(r.left)), w = Math.round(r.width) + b, h = Math.round(r.height);
  if (w === W && h === H && b === bleed) return;
  W = w; H = h; bleed = b;
  canvas.style.left = -bleed + 'px';
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const dpr = lowered ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  api.stats.dpr = dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // A standing Buddy is about 78% of the stage's height.
  const fov = T.MathUtils.degToRad(camera.fov);
  const dist = (buddy ? buddy.HEIGHT : 2.26) / (0.78 * 2 * Math.tan(fov / 2));
  camera.position.set(0, 1.35, dist);
  camera.lookAt(0, 1.0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // The desk stands in the middle of the stage (not of the bleed), on the
  // stage's floor line.
  const at = screenToGround(bleed + (W - bleed) * 0.46, H * 0.95);
  world.position.set(at.x, 0, at.z);
  // He enters from beyond the left edge of the screen.
  const edge = screenToGround(-W * 0.18, H * 0.95);
  enterX = edge.x - at.x;
  api.stats.enterX = +enterX.toFixed(2);
}

// --- choreography ------------------------------------------------------------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (u) => u * u * (3 - 2 * u);

// Arrival progress follows his stage, not the floor: 0 as the stage's top
// comes up over the bottom of the screen, 1 once the whole stage is in view
// with a little to spare (the page ends soon after, and he must be seated by
// the bottom), so the walk-in happens where it can be seen.
function progressTarget() {
  if (SCRUB !== null) return SCRUB;
  const r = stageEl.getBoundingClientRect(), vh = window.innerHeight;
  return clamp01((vh - r.top) / (r.height + vh * 0.1));
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
function stage(dt) {
  if (!FROZEN_CLOCK) clock += dt;
  follow(dt);
  api.progress = p;
  if (!buddy) return;

  // The walk-off, backwards. In arrival terms:
  //  0 .. .54   he walks in from the left, feet locked to the ground
  //  .52 .. .66 he turns from walking to face his desk
  //  .66 .. .94 he sits; the chair rolls in under him
  //  .94 .. 1   typing, on his own clock
  const away = 1 - p;
  const rise = ease(seg(away, 0.06, 0.34));
  const turn = ease(seg(away, 0.34, 0.48));
  const go = seg(away, 0.46, 1);
  const walking = ease(seg(away, 0.44, 0.52));
  const distance = go * Math.abs(enterX);
  // Step phase counts the ground he has covered walking in, so his legs
  // cycle forward as he moves right (distance left to go would moonwalk him).
  const covered = Math.abs(enterX) - distance;
  buddy.pose({ t: clock, sit: 1 - rise, walk: walking, phase: (covered / buddy.STRIDE) * Math.PI * 2 });
  buddy.object.rotation.y = T.MathUtils.lerp(SEAT_YAW, WALK_YAW, turn);
  const back = rise * 0.42;
  buddy.object.position.set(Math.sin(SEAT_YAW) * -back - distance, 0, Math.cos(SEAT_YAW) * -back);
  // The chair rolls back as he stands (props are turned -90°: local -X is behind him).
  buddy.chair.position.set(-rise * 0.62, 0, rise * 0.22);
  walkShadow.position.set(buddy.object.position.x, 0.003, buddy.object.position.z);
  walkShadow.material.opacity = 1 - clamp01((go - 0.9) / 0.1);

  // The screen wakes as he sits down to it.
  const typing = 1 - rise;
  const flicker = 0.9 + Math.sin(clock * 7.3) * 0.05 + Math.sin(clock * 19.1) * 0.03;
  const lvl = (0.35 + 0.65 * typing) * flicker;
  if (buddy.screenGlow) buddy.screenGlow.emissive.setRGB(0.62 * lvl, 0.94 * lvl, 0.88 * lvl);
  if (buddy.screen) screenLight.position.copy(buddy.screen.getWorldPosition(new T.Vector3()));
  screenLight.intensity = 2.4 * typing * flicker;
}

// --- loop, visibility, governor, the way out -------------------------------------
let visible = false, running = false, last = 0, dead = false, lowered = false;
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
// Draw only while the stage (or the screen just below it) is in view.
const io = new IntersectionObserver((e) => { visible = e.some((x) => x.isIntersecting); visible ? start() : stop(); }, { rootMargin: '0px 0px 20% 0px' });
io.observe(stageEl);

function fail(why) {
  if (dead) return;
  dead = true;
  console.warn('[job3d] handing the floor back to the flat page:', why);
  stop();
  io.disconnect();
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

// A steady 30fps (Energy Saver, Low Power Mode) is fine; a slow median or
// frames that keep dropping are not. First resolution goes, then the stage.
function govern() {
  if (NO_GOVERNOR || SCRUB !== null || frameMs.length < 90) return;
  const sorted = [...frameMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)], p90 = sorted[Math.floor(sorted.length * 0.9)];
  if (median <= 45 && p90 <= median * 2.2) return;
  frameMs.length = 0;
  if (!lowered) { lowered = true; renderer.setPixelRatio(1); api.stats.dpr = 1; return; }
  fail('frame rate');
}

async function boot() {
  const loader = new T.GLTFLoader();
  loader.setMeshoptDecoder(T.MeshoptDecoder);
  buddy = await loadBuddy(T, loader);
  station.add(buddy.props);
  world.add(buddy.object);
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
