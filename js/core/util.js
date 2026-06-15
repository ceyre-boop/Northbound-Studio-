/* ============================================================
   core/util.js — math, easing, noise, environment flags
   Zero dependencies. Pure functions. No side effects on import.
   ============================================================ */

/* ---------- Environment ---------- */
export const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

export const isTouch = window.matchMedia(
  "(hover: none), (pointer: coarse)"
).matches;

export const isCoarseOrSmall = isTouch || window.innerWidth < 640;

/* DPR capped at 2 — past this, cost outweighs visible gain. */
export const DPR = Math.min(window.devicePixelRatio || 1, 2);

/* ---------- Math ---------- */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const map = (v, a, b, c, d) => c + ((v - a) * (d - c)) / (b - a || 1);
export const TAU = Math.PI * 2;

/* Guard against NaN/Infinity reaching a canvas or shader — the exact
   class of bug that killed the previous build. Returns `fallback`
   (default 0) for any non-finite input. */
export const safe = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/* ---------- Easings ---------- */
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/* ---------- Seeded value noise (deterministic, no deps) ---------- */
/* Small, fast 2D value noise — enough for organic drift on the CPU
   side. The GPU nebula uses its own GLSL fbm. */
function hash2(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
export function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash2(xi, yi);
  const tr = hash2(xi + 1, yi);
  const bl = hash2(xi, yi + 1);
  const br = hash2(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v); // 0..1
}

/* ---------- Misc ---------- */
export const rand = (a = 1, b) =>
  b === undefined ? Math.random() * a : a + Math.random() * (b - a);

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* Run `fn` inside try/catch so one feature can never take down the page.
   Returns the result, or null on throw (logged, never re-thrown). */
export function guard(name, fn) {
  try {
    return fn();
  } catch (err) {
    console.warn(`[northbound] "${name}" failed to init — skipped.`, err);
    return null;
  }
}
