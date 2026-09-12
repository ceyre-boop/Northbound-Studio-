/* solution.js — Act III, "the offer dissolving into the machine behind it".
 *
 * Typography advected through a real-time fluid field. The headline is
 * rasterized once (js/gl/typeraster.js) into a coverage mask, then carried
 * as the dye field of a Stam-style semi-Lagrangian solver
 * (js/gl/fluid-shaders.js): advect velocity, splat cursor/scroll forces,
 * solve pressure with Jacobi iteration, subtract its gradient, advect the
 * dye, composite. Six fixed passes plus K Jacobi iterations, gated by
 * ctx.tier per the Stage/cast contract:
 *
 *   tier 3: 256x256 grid, K=20, every frame.
 *   tier 2: 128x128 grid, K=10, every OTHER frame — the pressure field is
 *           temporally coherent, so the Jacobi loop is skipped on odd frames
 *           and the previous solve is reused as gradient-subtract's input
 *           (and as the next solve's initial guess). Everything else in the
 *           pipeline still runs every frame.
 *   tier 1: no solver at all. An analytically evaluated curl-noise field —
 *           divergence-free by construction — substitutes for it. A
 *           degraded 64x64/K=4 solve reads as a bug; a different-but-
 *           coherent technique reads as intentional. See fluid-shaders.js.
 *
 * The prices and package lists are never touched — they are plain DOM at
 * every tier and every mode. The only element this act ever treats is the
 * <h2>, and only in full mode, and only after init() has actually succeeded.
 */

import { rasterize, upload } from '../gl/typeraster.js';
import * as F from '../gl/fluid-shaders.js';

var MANIFEST = {
  id: 'solution',
  label: 'Solution',
  window: [0.55, 0.82],
  cost: 5,
  fboBudget: 9,
  requires: [],
  preload: 0.14
};

var GRID = { 3: 256, 2: 128, 1: 0 };
var DYE_RES = { 3: 512, 2: 256, 1: 0 };
var ATLAS = { 3: [2048, 512], 2: [1024, 256], 1: [1024, 256] };
var JACOBI_K = { 3: 20, 2: 10, 1: 0 };

var AURORA = [0.3098, 0.8471, 0.7686]; // #4FD8C4, the same accent northlight uses

var S = null; // module-scope: exactly one 'solution' act is ever live at once

// --- small CPU helpers -----------------------------------------------------

function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  var t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function pickFmt(caps) {
  if (caps.renderHalfFloat && caps.linearHalfFloat) return 'half';
  if (caps.renderFloat && caps.linearFloat) return 'float';
  return null; // byte fallback: ctx.target() always gives LINEAR RGBA8 here
}

function locs(gl, prog, names) {
  var o = {};
  for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(prog, names[i]);
  return o;
}

/** Measures the live heading rect against the viewport, in normalized,
 *  y-up screen space (matching v_uv) — no per-breakpoint constants, and it
 *  tracks the section as it moves through an ordinary (non-sticky) scroll. */
function measureMask() {
  var el = S.headingEl;
  var vw = window.innerWidth, vh = window.innerHeight;
  if (!el || !vw || !vh) return { origin: [0.22, 0.55], size: [0.56, 0.16] };
  var r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { origin: [0.22, 0.55], size: [0.56, 0.16] };
  var nx0 = r.left / vw, nx1 = (r.left + r.width) / vw;
  var domTop = r.top / vh, domBottom = (r.top + r.height) / vh;
  var w = Math.max(1e-4, nx1 - nx0);
  var h = Math.max(1e-4, domBottom - domTop);
  var y = 1 - domBottom;

  /* Keep the band on screen. The mask follows the heading, which is right on a
     wide viewport where the heading sits in view for the whole act. On a phone
     the packages stack, the section grows to several screens, and the heading
     sails off the top while the act is still on stage — so the type was being
     drawn hundreds of pixels above the window and the canvas went empty for
     most of Act III. Clamping pins the band to the nearest edge instead of
     letting it leave: the type keeps dissolving above the prices, which is
     what the act is about, rather than disappearing. */
  var margin = 0.04;
  y = Math.max(margin, Math.min(1 - h - margin, y));
  var x = Math.max(0, Math.min(1 - w, nx0));

  return { origin: [x, y], size: [w, h] };
}

// --- program build -----------------------------------------------------

/** Tier 1 runs no solver at all (see fluid-shaders.js), so it only ever
 *  needs the curl program — compiling the other seven on a low-end device,
 *  the one place startup cost matters most, would be pure waste. */
function buildPrograms(ctx, tier) {
  var gl = ctx.gl;
  var p = {};

  p.curl = { prog: ctx.program(F.VERT, F.FRAG_CURL, 'curl') };
  p.curl.u = locs(gl, p.curl.prog, [
    'u_mask', 'u_maskOrigin', 'u_maskSize', 'u_aspect',
    'u_time', 'u_strength', 'u_progress', 'u_color', 'u_alpha'
  ]);

  if (tier === 1) return p;

  p.splat = { prog: ctx.program(F.VERT, F.FRAG_SPLAT, 'splat') };
  p.splat.u = locs(gl, p.splat.prog, ['u_vel', 'u_aspect', 'u_point', 'u_dir', 'u_radius']);

  p.advectVel = { prog: ctx.program(F.VERT, F.FRAG_ADVECT_VEL, 'advectVel') };
  p.advectVel.u = locs(gl, p.advectVel.prog, ['u_vel', 'u_texel', 'u_dt', 'u_dissipation']);

  p.divergence = { prog: ctx.program(F.VERT, F.FRAG_DIVERGENCE, 'divergence') };
  p.divergence.u = locs(gl, p.divergence.prog, ['u_vel', 'u_texel']);

  p.jacobi = { prog: ctx.program(F.VERT, F.FRAG_JACOBI, 'jacobi') };
  p.jacobi.u = locs(gl, p.jacobi.prog, ['u_pressure', 'u_divergence', 'u_texel']);

  p.gradient = { prog: ctx.program(F.VERT, F.FRAG_GRADIENT, 'gradient') };
  p.gradient.u = locs(gl, p.gradient.prog, ['u_pressure', 'u_vel', 'u_texel']);

  p.advectDye = { prog: ctx.program(F.VERT, F.FRAG_ADVECT_DYE, 'advectDye') };
  p.advectDye.u = locs(gl, p.advectDye.prog, [
    'u_dye', 'u_vel', 'u_mask', 'u_texel', 'u_maskOrigin', 'u_maskSize',
    'u_dt', 'u_dissipation', 'u_inject'
  ]);

  p.composite = { prog: ctx.program(F.VERT, F.FRAG_COMPOSITE, 'composite') };
  p.composite.u = locs(gl, p.composite.prog, ['u_dye', 'u_color', 'u_alpha']);

  return p;
}

/** Fixed sampler->unit bindings, set once per program so draw() never calls
 *  gl.uniform1i in the hot loop — only gl.activeTexture/bindTexture do. */
function bindSamplerUnits(ctx) {
  var gl = ctx.gl, p = S.prog;
  function set(entry, name, unit) { if (entry && entry.u[name]) { gl.useProgram(entry.prog); gl.uniform1i(entry.u[name], unit); } }
  set(p.curl, 'u_mask', 0);
  set(p.splat, 'u_vel', 0);
  set(p.advectVel, 'u_vel', 0);
  set(p.divergence, 'u_vel', 0);
  set(p.jacobi, 'u_pressure', 0); set(p.jacobi, 'u_divergence', 1);
  set(p.gradient, 'u_pressure', 0); set(p.gradient, 'u_vel', 1);
  set(p.advectDye, 'u_dye', 0); set(p.advectDye, 'u_vel', 1); set(p.advectDye, 'u_mask', 2);
  set(p.composite, 'u_dye', 0);
  gl.useProgram(null);
}

function bindTex(ctx, unit, tex) {
  ctx.gl.activeTexture(ctx.gl.TEXTURE0 + ctx.texUnitBase + unit);
  ctx.gl.bindTexture(ctx.gl.TEXTURE_2D, tex);
}

function drawQuad(ctx) {
  ctx.gl.drawArrays(ctx.gl.TRIANGLES, 0, 3);
}

function setupAttrib(ctx) {
  var gl = ctx.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

// --- allocation --------------------------------------------------------

function allocate(ctx) {
  var fmt = pickFmt(ctx.caps);
  if (!fmt) ctx.warn('no linearly-filterable float/half-float target; falling back to RGBA8 (reduced fluid quality)');
  S.fmt = fmt;
  var g = S.grid;
  S.vel = ctx.pingPong(g, g, fmt);
  S.pressure = ctx.pingPong(g, g, fmt);
  S.div = ctx.target(g, g, fmt);
  var d = S.dyeRes;
  S.dye = ctx.pingPong(d, d, fmt);
}

/** Takes `inst` explicitly (rather than reading the module-scope S) so a
 *  resize()-triggered re-rasterize that is still in flight when dispose()
 *  runs writes into the instance it was measured for, or not at all —
 *  never into whatever S has become by the time fonts.ready resolves. */
async function rasterizeAtlas(ctx, inst) {
  var atlas = ATLAS[inst.tier] || ATLAS[1];
  var text = (inst.headingEl && inst.headingEl.textContent || 'Three ways in.').trim();
  var fontPx = Math.round(atlas[1] * 0.5);
  var family = '700 ' + fontPx + 'px Syne';
  var font = family + ', sans-serif';
  var dpr = ctx.dpr;

  var result = await rasterize({
    text: text,
    width: atlas[0],
    height: atlas[1],
    dpr: dpr,
    font: font,
    family: family,
    padX: atlas[0] * 0.03,
    baseline: atlas[1] * 0.66
  });

  if (S !== inst) return; // superseded by a dispose()/init() while we awaited
  upload(ctx.gl, ctx.isWebGL2, inst.maskTex, result);
  inst.maskDpr = dpr;
}

// --- the six-plus-K pass pipeline --------------------------------------

/** Runs the whole pipeline once (advect vel -> splat -> divergence ->
 *  K jacobi -> gradient subtract -> advect dye) and leaves the result in
 *  S.dye.read, ready for a composite pass. Shared by draw() and drawStill().
 */
function step(ctx, dt, kCount, opts) {
  var gl = ctx.gl, p = S.prog, g = S.grid;
  var texel = [1 / g, 1 / g];

  // 1. advect velocity
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.vel.write.fbo);
  gl.viewport(0, 0, g, g);
  gl.useProgram(p.advectVel.prog);
  bindTex(ctx, 0, S.vel.read.tex);
  gl.uniform2f(p.advectVel.u.u_texel, texel[0], texel[1]);
  gl.uniform1f(p.advectVel.u.u_dt, dt);
  gl.uniform1f(p.advectVel.u.u_dissipation, opts.velDissipation);
  drawQuad(ctx);
  S.vel.swap();

  // 2. splat forces: cursor drag + a scroll-driven updraft at the glyphs
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.vel.write.fbo);
  gl.viewport(0, 0, g, g);
  gl.useProgram(p.splat.prog);
  bindTex(ctx, 0, S.vel.read.tex);
  gl.uniform1f(p.splat.u.u_aspect, S.aspect);
  gl.uniform2f(p.splat.u.u_point, opts.cursor[0], opts.cursor[1]);
  gl.uniform2f(p.splat.u.u_dir, opts.cursorForce[0], opts.cursorForce[1]);
  gl.uniform1f(p.splat.u.u_radius, 0.02);
  drawQuad(ctx);
  S.vel.swap();

  gl.bindFramebuffer(gl.FRAMEBUFFER, S.vel.write.fbo);
  gl.viewport(0, 0, g, g);
  gl.useProgram(p.splat.prog);
  bindTex(ctx, 0, S.vel.read.tex);
  gl.uniform1f(p.splat.u.u_aspect, S.aspect);
  gl.uniform2f(p.splat.u.u_point, opts.maskCenter[0], opts.maskCenter[1]);
  gl.uniform2f(p.splat.u.u_dir, opts.updraft[0], opts.updraft[1]);
  gl.uniform1f(p.splat.u.u_radius, 0.08);
  drawQuad(ctx);
  S.vel.swap();

  if (kCount > 0) {
    // 3. divergence
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.div.fbo);
    gl.viewport(0, 0, g, g);
    gl.useProgram(p.divergence.prog);
    bindTex(ctx, 0, S.vel.read.tex);
    gl.uniform2f(p.divergence.u.u_texel, texel[0], texel[1]);
    drawQuad(ctx);

    // 4. K jacobi pressure iterations (u_pressure is the only uniform that
    // changes between iterations; everything else is set once, outside).
    gl.useProgram(p.jacobi.prog);
    bindTex(ctx, 1, S.div.tex);
    gl.uniform2f(p.jacobi.u.u_texel, texel[0], texel[1]);
    for (var i = 0; i < kCount; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.pressure.write.fbo);
      gl.viewport(0, 0, g, g);
      bindTex(ctx, 0, S.pressure.read.tex);
      drawQuad(ctx);
      S.pressure.swap();
    }
  }

  // 5. gradient subtract
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.vel.write.fbo);
  gl.viewport(0, 0, g, g);
  gl.useProgram(p.gradient.prog);
  bindTex(ctx, 0, S.pressure.read.tex);
  bindTex(ctx, 1, S.vel.read.tex);
  gl.uniform2f(p.gradient.u.u_texel, texel[0], texel[1]);
  drawQuad(ctx);
  S.vel.swap();

  // 6. advect dye (the type mask is injected here, fading out as progress
  // climbs). The dye buffer is deliberately a higher resolution than the
  // velocity grid for crisper glyphs at rest — u_texel here is still the
  // VELOCITY grid's texel size, because that is the unit convention the
  // splat/advect-velocity passes defined the field in, not the dye's own.
  var dg = S.dyeRes;
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.dye.write.fbo);
  gl.viewport(0, 0, dg, dg);
  gl.useProgram(p.advectDye.prog);
  bindTex(ctx, 0, S.dye.read.tex);
  bindTex(ctx, 1, S.vel.read.tex);
  bindTex(ctx, 2, S.maskTex);
  gl.uniform2f(p.advectDye.u.u_texel, texel[0], texel[1]);
  gl.uniform2f(p.advectDye.u.u_maskOrigin, opts.maskOrigin[0], opts.maskOrigin[1]);
  gl.uniform2f(p.advectDye.u.u_maskSize, opts.maskSize[0], opts.maskSize[1]);
  gl.uniform1f(p.advectDye.u.u_dt, dt);
  gl.uniform1f(p.advectDye.u.u_dissipation, opts.dyeDissipation);
  gl.uniform1f(p.advectDye.u.u_inject, opts.inject);
  drawQuad(ctx);
  S.dye.swap();
}

function compositeToScreen(ctx, alpha) {
  var gl = ctx.gl, p = S.prog.composite;
  ctx.restore();
  gl.useProgram(p.prog);
  bindTex(ctx, 0, S.dye.read.tex);
  gl.uniform3f(p.u.u_color, AURORA[0], AURORA[1], AURORA[2]);
  gl.uniform1f(p.u.u_alpha, alpha);
  drawQuad(ctx);
}

function curlToScreen(ctx, alpha) {
  var gl = ctx.gl, p = S.prog.curl;
  ctx.restore();
  gl.useProgram(p.prog);
  bindTex(ctx, 0, S.maskTex);
  gl.uniform2f(p.u.u_maskOrigin, S.maskOrigin[0], S.maskOrigin[1]);
  gl.uniform2f(p.u.u_maskSize, S.maskSize[0], S.maskSize[1]);
  gl.uniform1f(p.u.u_aspect, S.aspect);
  gl.uniform1f(p.u.u_time, S.time);
  gl.uniform1f(p.u.u_strength, 0.10 + 1.35 * S.p);
  gl.uniform1f(p.u.u_progress, S.p);
  gl.uniform3f(p.u.u_color, AURORA[0], AURORA[1], AURORA[2]);
  gl.uniform1f(p.u.u_alpha, alpha);
  drawQuad(ctx);
}

// --- the act -------------------------------------------------------------

export default {
  manifest: MANIFEST,

  async init(ctx) {
    /* A Navier-Stokes solver needs signed velocity and signed pressure. The
       RGBA8 fallback cannot hold a negative number, so on hardware with no
       linearly-filterable float or half-float target every negative value
       clips to zero: flow in one direction only, and a pressure field that
       never pushes back. That does not read as a cheaper fluid, it reads as a
       bug — and the rule this act was built on is that a degraded solver looks
       broken while a different technique looks intentional. So drop to the
       curl-noise field, which is divergence-free by construction and wants no
       float target at all. */
    var tier = ctx.tier;
    if (tier > 1 && !pickFmt(ctx.caps)) {
      ctx.warn('no signed float target available; running the curl field rather than a solver with its negatives clipped');
      tier = 1;
    }

    S = {
      tier: tier,
      grid: GRID[tier] || 128,
      dyeRes: DYE_RES[tier] || 256,
      fmt: null,
      time: 0,
      p: 0,
      lastP: 0,
      frameParity: 0,
      aspect: (ctx.width || 1) / Math.max(1, ctx.height || 1),
      maskOrigin: [0.22, 0.55],
      maskSize: [0.56, 0.16],
      maskDpr: 0,
      headingEl: ctx.root ? ctx.root.querySelector('h2') : null,
      prog: null,
      maskTex: ctx.texture(),
      vel: null, pressure: null, div: null, dye: null
    };

    S.ctx = ctx;
    S.prog = buildPrograms(ctx, S.tier);
    bindSamplerUnits(ctx);

    if (S.tier > 1) allocate(ctx);

    await rasterizeAtlas(ctx, S);

    if (ctx.mode === 'full' && S.headingEl) {
      S.headingEl.classList.add('solution-heading--gl');
    }
  },

  resize(w, h, dpr) {
    if (!S) return;
    S.aspect = w / Math.max(1, h);
    if (dpr !== S.maskDpr && S.ctx) {
      // resize() isn't async in the contract; fire-and-forget the
      // re-rasterize rather than block it. rasterizeAtlas() itself checks
      // whether S still points at this instance before touching GL.
      var ctx = S.ctx, inst = S;
      rasterizeAtlas(ctx, inst).catch(function (e) { ctx.warn('re-rasterize failed: ' + e.message); });
    }
  },

  update(dt, p, ctx) {
    if (!S) return;
    S.time += dt;
    S.dt = dt;
    var lastP = S.lastP;
    S.lastP = p;
    S.p = p;

    var m = window.NB_MOTION;
    var cursor = m ? [m.cursor.sx, 1 - m.cursor.sy] : [0.5, 0.5];
    var cvx = m ? m.cursor.vx : 0, cvy = m ? -m.cursor.vy : 0;
    var speed = m ? m.cursor.speed : 0;

    var mask = measureMask();
    S.maskOrigin = mask.origin;
    S.maskSize = mask.size;

    var scrollDelta = p - lastP;
    var scrollVel = dt > 0 ? clamp01(Math.abs(scrollDelta) / dt / 3) : 0;

    S.inject = 1 - smoothstep(0, 0.55, p);
    S.cursor = cursor;
    S.cursorForce = [clamp01(speed) * cvx * 0.35, clamp01(speed) * cvy * 0.35];
    S.maskCenter = [mask.origin[0] + mask.size[0] * 0.5, mask.origin[1] + mask.size[1] * 0.5];
    // A gentle, ever-present updraft that grows with progress — the offer is
    // taken by the flow as the visitor scrolls, not just when they wiggle
    // the cursor — plus a punch on fast scroll.
    S.updraft = [0, 0.012 + 0.05 * p + 0.10 * scrollVel * Math.sign(scrollDelta || 1)];
  },

  draw(alpha, ctx) {
    if (!S) return;

    setupAttrib(ctx);

    if (S.tier === 1) {
      curlToScreen(ctx, alpha);
      ctx.gl.activeTexture(ctx.gl.TEXTURE0 + ctx.texUnitBase);
      return;
    }

    var K = JACOBI_K[S.tier] || 0;
    if (ctx.share < 1) K = Math.max(4, Math.floor(K / 2));

    var runJacobi = true;
    if (S.tier === 2) {
      S.frameParity ^= 1;
      runJacobi = S.frameParity === 0; // half-rate: reuse the previous solve
    }

    var opts = {
      cursor: S.cursor, cursorForce: S.cursorForce,
      maskCenter: S.maskCenter, updraft: S.updraft,
      maskOrigin: S.maskOrigin, maskSize: S.maskSize,
      inject: S.inject,
      velDissipation: 0.985,
      dyeDissipation: 0.982
    };

    step(ctx, Math.max(0, Math.min(0.033, S.dt || 1 / 60)), runJacobi ? K : 0, opts);
    compositeToScreen(ctx, alpha);

    ctx.gl.activeTexture(ctx.gl.TEXTURE0 + ctx.texUnitBase);
  },

  drawStill(ctx) {
    if (!S) return;
    S.p = 0.35;
    var mask = measureMask();
    S.maskOrigin = mask.origin;
    S.maskSize = mask.size;
    S.maskCenter = [mask.origin[0] + mask.size[0] * 0.5, mask.origin[1] + mask.size[1] * 0.5];

    setupAttrib(ctx);

    if (S.tier === 1) {
      S.time = 1.8;
      curlToScreen(ctx, 0.55);
      ctx.gl.activeTexture(ctx.gl.TEXTURE0 + ctx.texUnitBase);
      return;
    }

    var K = JACOBI_K[S.tier] || 0;
    var opts = {
      cursor: [0.5, 0.5], cursorForce: [0, 0],
      maskCenter: S.maskCenter, updraft: [0, 0.03],
      maskOrigin: S.maskOrigin, maskSize: S.maskSize,
      inject: 1 - smoothstep(0, 0.55, S.p),
      velDissipation: 0.985,
      dyeDissipation: 0.982
    };

    // A one-shot call: build up a settled mid-dissolve swirl over a handful
    // of synthetic sub-steps rather than a single frame's worth of flow.
    for (var i = 0; i < 18; i++) {
      S.time += 1 / 24;
      step(ctx, 1 / 24, K, opts);
    }

    compositeToScreen(ctx, 0.38);
    ctx.gl.activeTexture(ctx.gl.TEXTURE0 + ctx.texUnitBase);
  },

  fallback(ctx) {
    // No GL. data-act-state="static" is already set by the Stage; the
    // section's real, always-present DOM (heading, prices, package lists)
    // carries the page. css/act-solution.css supplies the quiet ground.
  },

  dispose() {
    // Every GL object here came from ctx.program/ctx.target/ctx.texture,
    // which the Stage pools and reclaims itself. Nothing to gl.delete*.
    if (S && S.headingEl) S.headingEl.classList.remove('solution-heading--gl');
    S = null;
  },

  stats() {
    if (!S) return null;
    return { grid: S.grid, dye: S.dyeRes, tier: S.tier };
  }
};
