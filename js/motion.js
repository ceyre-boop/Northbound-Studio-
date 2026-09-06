/* Northbound — motion physics.
 *
 * One integrator, one registry, one place that writes to the DOM. There is
 * already a rAF loop in index.html driving the canvases; this hooks into it
 * rather than starting a second one, because two loops means two frame budgets
 * and no way to reason about either.
 *
 * Nothing here writes through setState. A setState per frame re-renders the
 * whole descent at 60fps, which is why the Floor 02 tilt and the speed bars
 * already write straight to nodes. Everything below follows that.
 */
(function () {
  'use strict';

  var reducedQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: function () {} };

  var M = {
    reduced: reducedQuery.matches,
    cursor: { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, vx: 0, vy: 0, speed: 0, active: false },
    fps: 0
  };

  reducedQuery.addEventListener && reducedQuery.addEventListener('change', function (e) {
    M.reduced = e.matches;
    // Settle everything immediately rather than springing to a halt.
    springs.forEach(function (s) { s.value = s.target; s.v = 0; });
  });

  // --- springs -------------------------------------------------------------
  // Semi-implicit Euler, sub-stepped at a fixed 120Hz. A variable timestep
  // makes stiffness frame-rate dependent, which is how spring systems end up
  // feeling different on a 60Hz phone and a 120Hz laptop.
  var springs = new Map();
  var FIXED = 1 / 120;

  function get(key, k, d) {
    var s = springs.get(key);
    if (!s) { s = { value: 0, target: 0, v: 0, k: k, d: d }; springs.set(key, s); }
    return s;
  }

  /** Set a spring's target and read its current value. */
  function spring(key, target, stiffness, damping) {
    var s = get(key, stiffness || 170, damping || 22);
    s.k = stiffness || s.k;
    s.d = damping || s.d;
    s.target = target;
    if (M.reduced) { s.value = target; s.v = 0; }
    return s.value;
  }

  function valueOf(key) { var s = springs.get(key); return s ? s.value : 0; }

  function integrate(s, dt) {
    var n = Math.min(6, Math.max(1, Math.ceil(dt / FIXED)));
    var h = dt / n;
    for (var i = 0; i < n; i++) {
      var f = -s.k * (s.value - s.target) - s.d * s.v;
      s.v += f * h;
      s.value += s.v * h;
    }
    // Park it once it stops mattering, so idle springs cost nothing.
    if (Math.abs(s.v) < 0.0004 && Math.abs(s.value - s.target) < 0.0004) {
      s.value = s.target; s.v = 0;
    }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // --- cursor --------------------------------------------------------------
  // Published as CSS custom properties once per frame. Writing them per event
  // is what makes cursor-reactive sites stutter: pointermove can fire far more
  // often than the compositor can use.
  var rawX = 0.5, rawY = 0.5, lastX = 0.5, lastY = 0.5;

  function onPointer(e) {
    rawX = e.clientX / window.innerWidth;
    rawY = e.clientY / window.innerHeight;
    M.cursor.active = true;
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  window.addEventListener('pointerleave', function () { M.cursor.active = false; }, { passive: true });

  // --- per-frame subscribers ----------------------------------------------
  var subs = [];
  function onFrame(fn) { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }

  var fpsAcc = 0, fpsFrames = 0;

  /** Called once per rAF from the descent's existing tick. */
  function step(dt, now) {
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;              // a backgrounded tab must not explode the springs

    var c = M.cursor;
    var smoothing = M.reduced ? 1 : 1 - Math.pow(0.0015, dt);
    c.sx = lerp(c.sx, rawX, smoothing);
    c.sy = lerp(c.sy, rawY, smoothing);
    c.vx = (c.sx - lastX) / dt;
    c.vy = (c.sy - lastY) / dt;
    c.speed = Math.min(1, Math.hypot(c.vx, c.vy) * 0.35);
    lastX = c.sx; lastY = c.sy;
    c.x = rawX; c.y = rawY;

    var root = document.documentElement;
    root.style.setProperty('--cx', c.sx.toFixed(4));
    root.style.setProperty('--cy', c.sy.toFixed(4));
    root.style.setProperty('--cv', c.speed.toFixed(4));

    springs.forEach(function (s) { if (s.value !== s.target || s.v !== 0) integrate(s, dt); });

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { M.fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }

    for (var i = 0; i < subs.length; i++) {
      try { subs[i](dt, now); } catch (e) { subs.splice(i, 1); i--; console.error('motion sub', e); }
    }
  }

  M.spring = spring;
  M.valueOf = valueOf;
  M.lerp = lerp;
  M.step = step;
  M.onFrame = onFrame;
  M.springs = springs;
  window.NB_MOTION = M;
})();
