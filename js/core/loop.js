/* ============================================================
   core/loop.js — ONE shared requestAnimationFrame loop.
   - Single rAF for the whole site (starfield, logo, cursor).
   - Pauses when the tab is hidden (no runaway loops / battery drain).
   - FPS governor: emits a quality tier (2=high, 1=med, 0=low) that
     renderers read to scale their own cost down on weak hardware.
   ============================================================ */

const subscribers = new Set();

let running = false;
let rafId = 0;
let last = 0;

/* FPS sampling → quality tier. */
let frames = 0;
let acc = 0;
let _fps = 60;
let _tier = 2; // start optimistic, degrade if needed
const tierListeners = new Set();

function setTier(t) {
  if (t === _tier) return;
  _tier = t;
  for (const fn of tierListeners) {
    try {
      fn(_tier);
    } catch (e) {
      /* a listener must never break the loop */
    }
  }
}

function frame(now) {
  if (!running) return;
  // Delta in seconds, clamped so a background-tab catch-up can't
  // produce a huge dt that flings physics to NaN/Infinity.
  let dt = (now - last) / 1000;
  if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;
  last = now;

  // FPS sample once per ~second.
  acc += dt;
  frames++;
  if (acc >= 1) {
    _fps = frames / acc;
    frames = 0;
    acc = 0;
    if (_fps < 32) setTier(0);
    else if (_fps < 48) setTier(1);
    else if (_fps > 56 && _tier < 2) setTier(_tier + 1); // recover slowly
  }

  for (const sub of subscribers) {
    try {
      sub(dt, now);
    } catch (e) {
      // A throwing renderer is removed, not allowed to kill the loop.
      console.warn("[northbound] render subscriber threw — removed.", e);
      subscribers.delete(sub);
    }
  }

  rafId = requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  last = performance.now();
  rafId = requestAnimationFrame(frame);
}

function stop() {
  running = false;
  cancelAnimationFrame(rafId);
}

/* Pause/resume with tab visibility. */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  else if (subscribers.size) start();
});

/* Public API */
export const loop = {
  /* Add a render callback (dt, now). Returns an unsubscribe fn. */
  add(fn) {
    subscribers.add(fn);
    if (!document.hidden) start();
    return () => loop.remove(fn);
  },
  remove(fn) {
    subscribers.delete(fn);
    if (!subscribers.size) stop();
  },
  onTier(fn) {
    tierListeners.add(fn);
    return () => tierListeners.delete(fn);
  },
  get tier() {
    return _tier;
  },
  get fps() {
    return _fps;
  },
};
