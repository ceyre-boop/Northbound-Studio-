/* northlight.js — the host for the hero's aurora curtain.
 *
 * One fullscreen triangle, one WebGL1 program, one draw call per frame. No
 * framebuffers, no ping-pong, no second pass. That matters for the gate we
 * are actually held to: perf.mjs throttles the CPU 4x, and one draw plus a
 * dozen uniform uploads is a rounding error there. The whole CPU budget stays
 * in NB_MOTION's spring integrator, which is already paid for.
 *
 * The canvas is appended to <body>, not to the page wrapper, so it sits
 * outside every [data-floor] subtree. That is deliberate: perf.mjs sweeps
 * 'img, canvas, h1, h2, p' inside [data-floor] looking for elements that
 * breach their section, and a fullscreen fixed canvas would trip it forever.
 *
 * There is no "off" state short of a missing WebGL context. Failing the
 * affordability probe buys the cheapest tier of the same curtain, never a
 * different background.
 */
(function () {
  'use strict';

  var TIERS = {
    high:      { LAYERS: 3, CHROMA: 3, OCTAVES: 3, GRAIN: 1, LENS: 1, raster: 1.00, cadence: 1 },
    mid:       { LAYERS: 2, CHROMA: 2, OCTAVES: 2, GRAIN: 1, LENS: 1, raster: 0.75, cadence: 1 },
    low:       { LAYERS: 1, CHROMA: 1, OCTAVES: 2, GRAIN: 0, LENS: 0, raster: 0.60, cadence: 1 },
    threadbare:{ LAYERS: 1, CHROMA: 1, OCTAVES: 2, GRAIN: 0, LENS: 0, raster: 0.50, cadence: 2 }
  };

  // field.js's adaptive rule, unchanged: a sustained streak of long frames
  // halves the raster scale once, then re-measures.
  var SLOW_FRAME_MS = 22, SLOW_STREAK = 30, MIN_SCALE = 0.5;

  var LUMA_CAP = 0.16;

  var NL = {
    ok: false,
    tier: null,
    LUMA_CAP: LUMA_CAP,
    init: init,
    destroy: destroy,
    setScroll: setScroll,
    setFloor: setFloor,
    setSafeRect: setSafeRect
  };

  var gl, canvas, prog, buf, unsub = null;
  var cfg = null, scale = 1, dpr = 1;
  var U = {};
  var time = 0, energy = 0, scrollProg = 0, page = 0, floorF = 0;
  var prevScrollY = 0, slowStreak = 0, frameParity = 0;
  var safe = [0.0, 0.15, 0.55, 0.30];

  function pickTier() {
    var base = (window.NB_GL && window.NB_GL.deviceTier) ? window.NB_GL.deviceTier() : 'mid';
    var afford = window.NB_AFFORD ? window.NB_AFFORD.canAfford() : true;
    // The probe is a budget, not a veto. A machine that fails it drops to the
    // cheapest rung of the same ladder; it never loses the design.
    if (!afford && base !== 'low') return 'low';
    if (!afford && base === 'low') return 'threadbare';
    return base;
  }

  function defines(c) {
    return [
      '#define LAYERS ' + c.LAYERS,
      '#define CHROMA ' + c.CHROMA,
      '#define OCTAVES ' + c.OCTAVES,
      '#define GRAIN ' + c.GRAIN,
      '#define CURSOR_LENS ' + c.LENS,
      ''
    ].join('\n');
  }

  function resize() {
    if (!canvas) return;
    var w = Math.max(1, Math.round(window.innerWidth * dpr * scale));
    var h = Math.max(1, Math.round(window.innerHeight * dpr * scale));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  function init(opts) {
    opts = opts || {};
    if (NL.ok) return;

    canvas = document.createElement('canvas');
    canvas.id = 'nb-northlight';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed; inset:0; width:100%; height:100%; z-index:1; pointer-events:none';

    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false })
      || canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false });

    // The one case the design genuinely cannot survive. The z-index:0 radial
    // gradient stays in the DOM precisely so this path lands on a painted
    // background rather than flat black, and perf.mjs gates on it rendering
    // clean with zero console errors.
    if (!gl) { canvas = null; NL.ok = false; return; }

    NL.tier = opts.tier || pickTier();
    cfg = TIERS[NL.tier] || TIERS.mid;
    scale = cfg.raster;
    dpr = (window.NB_GL && window.NB_GL.dprForViewport) ? window.NB_GL.dprForViewport() : 1;

    var S = window.NB_NORTHLIGHT_SHADERS;
    prog = window.NB_GL.buildProgram(
      gl, S.VERT, S.FRAG.replace('%DEFINES%', defines(cfg)), 'northlight');
    gl.useProgram(prog);

    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // One oversized triangle covers the viewport with no seam down the middle.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    ['u_res', 'u_time', 'u_cursor', 'u_cursorSpeed', 'u_energy',
     'u_page', 'u_scroll', 'u_floor', 'u_safe', 'u_luma'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    document.body.appendChild(canvas);
    dpr = (window.NB_GL && window.NB_GL.dprForViewport) ? window.NB_GL.dprForViewport() : 1;
    resize();
    window.addEventListener('resize', onResize, { passive: true });

    NL.ok = true;
    prevScrollY = window.scrollY;

    var M = window.NB_MOTION;
    // Reduced motion gets exactly one frame at rest — same curtain, frozen.
    // Never enter the loop, so there is nothing running to report.
    if (!M || M.reduced) { draw(0); return; }
    unsub = M.onFrame(frame);
  }

  function onResize() {
    dpr = (window.NB_GL && window.NB_GL.dprForViewport) ? window.NB_GL.dprForViewport() : 1;
    resize();
    var M = window.NB_MOTION;
    if (!M || M.reduced) draw(0);
  }

  function frame(dt) {
    if (!NL.ok) return;
    var t0 = performance.now();

    time += dt;

    // Scroll velocity, smoothed asymmetrically: a flick spikes instantly and
    // bleeds off over ~400ms. Symmetric smoothing is exactly what makes
    // scroll-reactive shaders feel laggy.
    var y = window.scrollY;
    var v = Math.min(1, Math.abs(y - prevScrollY) / dt / (window.innerHeight * 3));
    prevScrollY = y;
    var rate = v > energy ? dt * 9 : dt * 2.5;
    energy += (v - energy) * Math.min(1, rate);

    page = Math.min(1, y / Math.max(1, window.innerHeight));

    if (cfg.cadence > 1 && (++frameParity % cfg.cadence)) return;
    draw(time);

    var ms = performance.now() - t0;
    if (ms > SLOW_FRAME_MS) {
      if (++slowStreak >= SLOW_STREAK && scale > MIN_SCALE) {
        // Raster scale only. Layers are never dropped at runtime — that would
        // visibly restate the composition mid-session.
        scale = Math.max(MIN_SCALE, scale * 0.5);
        slowStreak = 0;
        resize();
      }
    } else { slowStreak = 0; }
  }

  function draw(t) {
    if (!gl || !prog) return;
    var M = window.NB_MOTION;
    var cx = 0.5, cy = 0.5, cs = 0;
    if (M && cfg.LENS) { cx = M.cursor.sx; cy = 1 - M.cursor.sy; cs = M.cursor.speed; }

    gl.useProgram(prog);
    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    gl.uniform1f(U.u_time, t);
    gl.uniform2f(U.u_cursor, cx, cy);
    gl.uniform1f(U.u_cursorSpeed, cs);
    gl.uniform1f(U.u_energy, energy);
    gl.uniform1f(U.u_page, page);
    gl.uniform1f(U.u_scroll, scrollProg);
    gl.uniform1f(U.u_floor, floorF);
    gl.uniform4f(U.u_safe, safe[0], safe[1], safe[2], safe[3]);
    gl.uniform1f(U.u_luma, LUMA_CAP);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function setScroll(p) { scrollProg = p || 0; }
  function setFloor(f) { floorF = f || 0; }

  /* Measured on resize, on floor change, and once after mount — never per
     frame. A getBoundingClientRect() inside the rAF loop is a forced
     synchronous layout and would cost more than the shader does. */
  function setSafeRect() {
    var els = [], i;
    for (i = 0; i < arguments.length; i++) if (arguments[i]) els.push(arguments[i]);
    if (!els.length) return;
    var l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (i = 0; i < els.length; i++) {
      var q = els[i].getBoundingClientRect();
      if (!q.width && !q.height) continue;
      l = Math.min(l, q.left); r = Math.max(r, q.right);
      t = Math.min(t, q.top);  b = Math.max(b, q.bottom);
    }
    if (!isFinite(l)) return;
    var W = window.innerWidth, H = window.innerHeight, aspect = W / H;
    // Into the shader's p-space: centred, y-up, x scaled by aspect.
    safe = [
      ((l + r) / 2 / W - 0.5) * aspect,
      (0.5 - (t + b) / 2 / H),
      Math.max(0.02, (r - l) / W * aspect * 0.5),
      Math.max(0.02, (b - t) / H * 0.5)
    ];
  }

  function destroy() {
    if (unsub) { unsub(); unsub = null; }
    window.removeEventListener('resize', onResize);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null; gl = null; prog = null; NL.ok = false;
  }

  window.NB_NORTHLIGHT = NL;
})();
