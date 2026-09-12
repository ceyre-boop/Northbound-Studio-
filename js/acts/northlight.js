/* js/acts/northlight.js — Act I, the aurora curtain, refit into the Stage.
 *
 * This is a refit of js/northlight.js, not a rewrite: the shader
 * (js/gl/northlight-shaders.js), the tier table, the safe-rect measurement
 * and the asymmetric scroll-velocity smoothing all carry over unchanged in
 * substance. What is gone is everything the Stage now owns — this module
 * never creates a canvas, never calls getContext, never calls
 * requestAnimationFrame, and never adds its own resize listener. It gets a
 * program via ctx.program(), draws on ctx.quad, and is driven entirely by
 * init/resize/update/draw/drawStill/fallback/dispose/stats.
 *
 * One thing does NOT survive the move: the old file's adaptive raster
 * scaler, which re-rendered into a smaller backing-store canvas under a
 * sustained slow-frame streak. That required owning the canvas's pixel
 * size, which this act no longer does — one canvas, one backing-store
 * resolution, shared by up to two live acts. It also required ping-pong
 * framebuffers to reproject, and this act's manifest carries fboBudget: 0.
 * The tier table below is the one remaining lever, chosen once from
 * ctx.tier at init() — consistent with the shader file's own comment that a
 * mid-session recompile is a visible stall. See the report back to the
 * integration lead for this trade-off in full.
 */
import { VERT, FRAG } from '../gl/northlight-shaders.js';

/* Same three rungs the old file shipped, minus the two GPU-affordability
   rungs (`low` cut further to `threadbare`) that existed only because the
   pre-Stage page had no separate notion of tier vs. reduced motion. The
   Stage's tier is already a budget, never a mode switch (see stage.js's
   header), so tier 1 here is what the old file called `low`. */
var TIERS = {
  3: { LAYERS: 3, CHROMA: 3, OCTAVES: 3, GRAIN: 1, LENS: 1 },
  2: { LAYERS: 2, CHROMA: 2, OCTAVES: 2, GRAIN: 1, LENS: 1 },
  1: { LAYERS: 1, CHROMA: 1, OCTAVES: 2, GRAIN: 0, LENS: 0 }
};

var LUMA_CAP = 0.16;

/* The still frame's phase. Not 0 — at t=0 every octave's sin() terms line
   up at their own origin and the filaments read as a touch too regular.
   This value was picked by eye off the live curtain: the layers have
   drifted out of phase with each other by here, which is the whole point
   of stacking OCTAVES sheets at different rates, and the composition sits
   with its densest mass low and behind where the h1 will be. This is the
   frame nearly every visitor to this build sees, so it is composed, not
   defaulted. */
var STILL_TIME = 34.5;

var gl = null, prog = null, aPosLoc = -1, U = {}, cfg = null, root = null;
var time = 0, energy = 0, localP = 0, prevScrollY = 0;
var safe = [0.0, 0.15, 0.55, 0.30];

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

/* Measured on init and on resize only — never per frame. A
   getBoundingClientRect() inside draw()/update() would be a forced
   synchronous layout, and update() is CPU-only by contract anyway. */
function measureSafe(rootEl) {
  if (!rootEl) return;
  var sel = ['h1', '.lede', '.byline', '.cta-row', '.eyebrow'];
  var els = [];
  for (var i = 0; i < sel.length; i++) {
    var e = rootEl.querySelector(sel[i]);
    if (e) els.push(e);
  }
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

/* Shared by draw() and drawStill() so the two paths cannot drift apart —
   the still frame is a real frame of this shader, not a second recipe. */
function submit(ctx, alpha, t, cx, cy, cs, e, page, scroll) {
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quad);
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

  gl.uniform2f(U.u_res, ctx.width * ctx.dpr, ctx.height * ctx.dpr);
  gl.uniform1f(U.u_time, t);
  gl.uniform2f(U.u_cursor, cx, cy);
  gl.uniform1f(U.u_cursorSpeed, cs);
  gl.uniform1f(U.u_energy, e);
  gl.uniform1f(U.u_page, page);
  gl.uniform1f(U.u_scroll, scroll);
  gl.uniform1f(U.u_floor, 0);
  gl.uniform4f(U.u_safe, safe[0], safe[1], safe[2], safe[3]);
  gl.uniform1f(U.u_luma, LUMA_CAP);
  gl.uniform1f(U.u_alpha, alpha);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Restore vertex-attrib state: ctx.quad is shared, and the next act to
  // bind it should not inherit an attrib array pointed at our layout.
  gl.disableVertexAttribArray(aPosLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

var act = {
  manifest: {
    id: 'northlight',
    label: 'Northlight',
    window: [0.00, 0.27],
    cost: 2,
    fboBudget: 0,
    requires: [],
    preload: 0.00
  },

  init: function (ctx) {
    gl = ctx.gl;
    root = ctx.root;

    var t = TIERS[ctx.tier] ? ctx.tier : 3;
    cfg = TIERS[t];

    prog = ctx.program(VERT, FRAG.replace('%DEFINES%', defines(cfg)), 'curtain');
    aPosLoc = gl.getAttribLocation(prog, 'a_pos');

    U = {};
    ['u_res', 'u_time', 'u_cursor', 'u_cursorSpeed', 'u_energy',
     'u_page', 'u_scroll', 'u_floor', 'u_safe', 'u_luma', 'u_alpha'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    time = 0; energy = 0; localP = 0;
    prevScrollY = window.scrollY || 0;
    measureSafe(root);
  },

  resize: function () {
    // No ctx here by contract; the root was cached at init().
    measureSafe(root);
  },

  update: function (dt, p, ctx) {
    time += dt;
    localP = p;

    // Asymmetric smoothing, unchanged from the old file: a flick spikes
    // instantly and bleeds off over ~400ms. Symmetric smoothing is exactly
    // what makes scroll-reactive shaders feel laggy.
    var y = window.scrollY;
    var denom = Math.max(1, window.innerHeight * 3);
    var v = dt > 0 ? Math.min(1, Math.abs(y - prevScrollY) / dt / denom) : 0;
    prevScrollY = y;
    var rate = v > energy ? dt * 9 : dt * 2.5;
    energy += (v - energy) * Math.min(1, rate);
  },

  draw: function (alpha, ctx) {
    if (!prog) return;
    var M = window.NB_MOTION;
    var cx = 0.5, cy = 0.5, cs = 0;
    if (M && cfg.LENS) { cx = M.cursor.sx; cy = 1 - M.cursor.sy; cs = M.cursor.speed; }
    submit(ctx, alpha, time, cx, cy, cs, energy, localP, localP);
  },

  drawStill: function (ctx) {
    if (!prog) return;
    submit(ctx, 1, STILL_TIME, 0.5, 0.5, 0, 0, 0, 0);
  },

  fallback: function (ctx) {
    // No GL here. The Stage has already put data-act-state="static" on the
    // section root; css/act-northlight.css carries the rest.
    if (ctx && ctx.root) ctx.root.setAttribute('data-act-state', 'static');
  },

  dispose: function () {
    // ctx.program()'s program is pooled and deleted by the Stage's teardown.
    // Only our own references need clearing so init() can run clean again.
    gl = null; prog = null; aPosLoc = -1; U = {}; cfg = null; root = null;
    time = 0; energy = 0; localP = 0; prevScrollY = 0;
  },

  stats: function () {
    return cfg ? { layers: cfg.LAYERS, octaves: cfg.OCTAVES } : {};
  }
};

export default act;
