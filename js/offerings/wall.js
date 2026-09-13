/* wall.js — GRAPHICS for the Offerings Procession. Twelve lattices of
 * vertices become twelve panes of glass.
 *
 * Reads state.verts and state.order and nothing else about the helix — the
 * transform is already baked into state.verts by PHYSICS (see contract.js).
 * Never writes to state.verts, never sorts state.order.
 *
 * The draw sequence is frozen by the brief and followed exactly:
 *   1. backdrop target: gradient + sparse particles, ctx.restore()
 *   2. composite the backdrop to the default framebuffer, premultiplied
 *   3. bufferSubData the dirty vertex range (or full bufferData if
 *      state.vertsReallocated)
 *   4. state.order, back to front: per-panel uniforms, bind atlas, drawElements
 *   5. grain, fullscreen — skipped entirely at tier 1
 *   6. restore the Stage's GL baseline
 *
 * ONE ctx.target() (the backdrop). Motion owns the atlas; the act's
 * fboBudget of 3 leaves a spare neither module needs.
 */
import * as M from '../gl/offering-material.js';

var PARTICLE_COUNT = { 3: 28, 2: 18, 1: 8 };
var BACKDROP_DIV = { 3: 2, 2: 2, 1: 4 }; // half res, quarter at tier 1

function hash2(a, b) {
  var x = a * 12.9898 + b * 78.233;
  var s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

function locs(gl, prog, names) {
  var o = {};
  for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(prog, names[i]);
  return o;
}

function backdropSize(ctx) {
  var div = BACKDROP_DIV[ctx.tier] || BACKDROP_DIV[1];
  return {
    w: Math.max(2, Math.round((ctx.width || 1) * (ctx.dpr || 1) / div)),
    h: Math.max(2, Math.round((ctx.height || 1) * (ctx.dpr || 1) / div))
  };
}

/* Builds the panel-local UV attribute data and the Uint16 index buffer for
 * the current state.lattice. Physics owns state.panels[i].vertStart and
 * publishes idxStart/idxCount per panel; GRAPHICS honours those offsets
 * rather than recomputing them — this only fills in the CONTENT of the
 * index buffer (a standard row-major grid triangulation) and the parametric
 * uv for each lattice cell, both of which are a pure function of the
 * lattice size and are identical panel to panel. */
function buildLatticeBuffers(state) {
  var L = state.lattice;
  var quadsPerSide = Math.max(1, L - 1);
  var indicesPerPanel = quadsPerSide * quadsPerSide * 6;
  var totalVerts = state.verts.length / 4;
  var uv = new Float32Array(totalVerts * 2);

  var idxTotal = 0;
  var i;
  for (i = 0; i < state.panels.length; i++) {
    var pnl = state.panels[i];
    idxTotal = Math.max(idxTotal, pnl.idxStart + pnl.idxCount);
  }
  var idx = new Uint16Array(Math.max(idxTotal, state.panels.length * indicesPerPanel));

  for (i = 0; i < state.panels.length; i++) {
    var panel = state.panels[i];
    var vs = panel.vertStart;
    var j, k2;
    for (j = 0; j < L; j++) {
      for (k2 = 0; k2 < L; k2++) {
        var vi = vs + j * L + k2;
        uv[vi * 2] = k2 / (L - 1 || 1);
        uv[vi * 2 + 1] = j / (L - 1 || 1);
      }
    }

    var idxBase = panel.idxStart;
    var n = 0;
    for (j = 0; j < quadsPerSide; j++) {
      for (k2 = 0; k2 < quadsPerSide; k2++) {
        var a = vs + j * L + k2;
        var b = vs + j * L + k2 + 1;
        var c = vs + (j + 1) * L + k2;
        var d = vs + (j + 1) * L + k2 + 1;
        idx[idxBase + n++] = a; idx[idxBase + n++] = c; idx[idxBase + n++] = b;
        idx[idxBase + n++] = b; idx[idxBase + n++] = c; idx[idxBase + n++] = d;
      }
    }
  }

  return { uv: uv, idx: idx };
}

function rebuildLatticeBuffers(gl, glass, state) {
  var built = buildLatticeBuffers(state);
  gl.bindBuffer(gl.ARRAY_BUFFER, glass.uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, built.uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glass.ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, built.idx, gl.STATIC_DRAW);
  glass.lattice = state.lattice;
}

function buildParticles(ctx, glass) {
  var n = PARTICLE_COUNT[ctx.tier] || PARTICLE_COUNT[1];
  var data = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    data[i * 3 + 0] = hash2(i, 1.7);
    data[i * 3 + 1] = hash2(i, 5.3);
    data[i * 3 + 2] = i / n;
  }
  var gl = ctx.gl;
  glass.particleBuf = ctx.buffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glass.particleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  glass.particleCount = n;
}

function bindQuadAttrib(ctx) {
  var gl = ctx.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

function drawTri(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* Pass 1: backdrop target — gradient, then a sparse additive particle
 * scatter, same idea as the hero's field at a much smaller count. Private
 * target, so blend state can move freely here as long as it is put back to
 * the Stage baseline before ctx.restore(). */
function drawBackdrop(ctx, glass) {
  var gl = ctx.gl, bd = glass.backdrop;
  gl.bindFramebuffer(gl.FRAMEBUFFER, bd.fbo);
  gl.viewport(0, 0, bd.width, bd.height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(glass.progGrad.prog);
  bindQuadAttrib(ctx);
  gl.uniform1f(glass.progGrad.u.u_time, glass.time);
  drawTri(gl);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.blendEquation(gl.FUNC_ADD);
  gl.useProgram(glass.progPart.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, glass.particleBuf);
  if (glass.locHome >= 0) { gl.enableVertexAttribArray(glass.locHome); gl.vertexAttribPointer(glass.locHome, 2, gl.FLOAT, false, 12, 0); }
  if (glass.locSeed >= 0) { gl.enableVertexAttribArray(glass.locSeed); gl.vertexAttribPointer(glass.locSeed, 1, gl.FLOAT, false, 12, 8); }
  gl.uniform1f(glass.progPart.u.u_time, glass.time);
  gl.uniform1f(glass.progPart.u.u_pointScale, Math.max(1, 3.0 * (ctx.dpr || 1)));
  gl.drawArrays(gl.POINTS, 0, glass.particleCount);
  if (glass.locHome >= 0) gl.disableVertexAttribArray(glass.locHome);
  if (glass.locSeed >= 0) gl.disableVertexAttribArray(glass.locSeed);

  /* Restore the baseline blend before ctx.restore() — the header is explicit
     that switching blend modes for particles requires putting them back. */
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.blendEquation(gl.FUNC_ADD);

  ctx.restore();
}

/* Pass 2: composite the backdrop onto the default framebuffer with the
 * Stage's own premultiplied blend, so the previous act still shows through
 * where the backdrop is transparent — this is what keeps the cross-fade
 * band honest. */
function compositeBackdrop(ctx, glass, alpha) {
  var gl = ctx.gl;
  gl.useProgram(glass.progComp.prog);
  bindQuadAttrib(ctx);
  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + 1);
  gl.bindTexture(gl.TEXTURE_2D, glass.backdrop.tex);
  gl.uniform1f(glass.progComp.u.u_alpha, alpha);
  drawTri(gl);
}

function drawPanels(ctx, glass, state, atlasTex, tileRectOf, alpha) {
  var gl = ctx.gl;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.blendEquation(gl.FUNC_ADD);
  gl.useProgram(glass.progPanel.prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, glass.vbo);
  gl.enableVertexAttribArray(0); // a_pos, pinned by the Stage
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(glass.locNormal);
  gl.vertexAttribPointer(glass.locNormal, 2, gl.FLOAT, false, 16, 8);

  gl.bindBuffer(gl.ARRAY_BUFFER, glass.uvBuf);
  gl.enableVertexAttribArray(glass.locUv);
  gl.vertexAttribPointer(glass.locUv, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glass.ibo);

  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + 1);
  gl.bindTexture(gl.TEXTURE_2D, glass.backdrop.tex);

  var u = glass.progPanel.u;
  gl.uniform2f(u.u_viewport, ctx.width || 1, ctx.height || 1);
  gl.uniform2f(u.u_canvasPx, (ctx.width || 1) * (ctx.dpr || 1), (ctx.height || 1) * (ctx.dpr || 1));

  var m = window.NB_MOTION;
  var cursorPx = m
    ? [m.cursor.sx * (ctx.width || 1), m.cursor.sy * (ctx.height || 1)]
    : [(ctx.width || 1) * 0.5, (ctx.height || 1) * 0.5];
  gl.uniform2f(u.u_cursorPx, cursorPx[0], cursorPx[1]);

  for (var k = 0; k < state.order.length; k++) {
    var i = state.order[k];
    var panel = state.panels[i];
    var tile = tileRectOf(i);
    gl.uniform2f(u.u_tileMin, tile.u0, tile.v0);
    gl.uniform2f(u.u_tileMax, tile.u1, tile.v1);
    gl.uniform2f(u.u_panelSize, panel.w, panel.h);
    gl.uniform1f(u.u_z, panel.z);
    gl.uniform1f(u.u_intensity, panel.intensity);
    gl.uniform1f(u.u_alpha, panel.alpha * alpha);
    gl.drawElements(gl.TRIANGLES, panel.idxCount, gl.UNSIGNED_SHORT, panel.idxStart * 2);
  }

  gl.disableVertexAttribArray(glass.locNormal);
  gl.disableVertexAttribArray(glass.locUv);
}

/* Skipped entirely at tier 1: the brief is explicit that at 390px/DPR1 this
 * is a single noisy pixel row and does not read — not worth the program,
 * let alone the draw call. See offering-material.js for why alpha is 0. */
function drawGrain(ctx, glass, alpha) {
  var gl = ctx.gl;
  gl.useProgram(glass.progGrain.prog);
  bindQuadAttrib(ctx);
  gl.uniform2f(glass.progGrain.u.u_res, (ctx.width || 1) * (ctx.dpr || 1), (ctx.height || 1) * (ctx.dpr || 1));
  gl.uniform1f(glass.progGrain.u.u_time, glass.time);
  gl.uniform1f(glass.progGrain.u.u_alpha, alpha);
  drawTri(gl);
}

function restoreBaseline(ctx) {
  var gl = ctx.gl;
  ctx.restore();
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.blendEquation(gl.FUNC_ADD);
  gl.colorMask(true, true, true, true);
  gl.depthMask(false);
  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase);
}

function uploadVerts(ctx, glass, state) {
  var gl = ctx.gl;
  if (state.vertsReallocated || glass.lattice !== state.lattice) {
    rebuildLatticeBuffers(gl, glass, state);
    gl.bindBuffer(gl.ARRAY_BUFFER, glass.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, state.verts, gl.DYNAMIC_DRAW);
    state.vertsReallocated = false;
    return;
  }
  if (state.dirtyEnd > state.dirtyStart) {
    gl.bindBuffer(gl.ARRAY_BUFFER, glass.vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      state.dirtyStart * 16,
      state.verts.subarray(state.dirtyStart * 4, state.dirtyEnd * 4)
    );
  }
}

// --- exports ---------------------------------------------------------------

export function create(ctx, state) {
  var gl = ctx.gl;

  var progPanel = ctx.program(M.PANEL_VERT, M.PANEL_FRAG, 'panel');
  var progGrad = ctx.program(M.QUAD_VERT, M.GRADIENT_FRAG, 'gradient');
  var progPart = ctx.program(M.PARTICLE_VERT, M.PARTICLE_FRAG, 'particle');
  var progComp = ctx.program(M.QUAD_VERT, M.COMPOSITE_FRAG, 'composite');
  var progGrain = ctx.tier > 1 ? ctx.program(M.QUAD_VERT, M.GRAIN_FRAG, 'grain') : null;

  var glass = {
    ctx: ctx,
    progPanel: { prog: progPanel, u: locs(gl, progPanel, [
      'u_viewport', 'u_canvasPx', 'u_tileMin', 'u_tileMax', 'u_panelSize',
      'u_z', 'u_intensity', 'u_alpha', 'u_cursorPx', 'u_atlas', 'u_backdrop'
    ]) },
    progGrad: { prog: progGrad, u: locs(gl, progGrad, ['u_time']) },
    progPart: { prog: progPart, u: locs(gl, progPart, ['u_time', 'u_pointScale']) },
    progComp: { prog: progComp, u: locs(gl, progComp, ['u_tex', 'u_alpha']) },
    progGrain: progGrain ? { prog: progGrain, u: locs(gl, progGrain, ['u_res', 'u_time', 'u_alpha']) } : null,

    locNormal: gl.getAttribLocation(progPanel, 'a_normal'),
    locUv: gl.getAttribLocation(progPanel, 'a_uv'),
    locHome: gl.getAttribLocation(progPart, 'a_home'),
    locSeed: gl.getAttribLocation(progPart, 'a_seed'),

    vbo: ctx.buffer(),
    uvBuf: ctx.buffer(),
    ibo: ctx.buffer(),
    lattice: -1,

    particleBuf: null,
    particleCount: 0,

    backdrop: null,
    backdropInternal: ctx.isWebGL2 ? gl.RGBA8 : gl.RGBA,

    time: 0,
    tier: ctx.tier
  };

  /* Fixed sampler->unit bindings, set once so draw() only ever calls
     activeTexture/bindTexture in the hot loop. Units are full indices
     (texUnitBase-relative), matching the activeTexture calls at draw time —
     not the bare 0/1/2 a same-slot-0 act could get away with. */
  gl.useProgram(progPanel);
  if (glass.progPanel.u.u_atlas) gl.uniform1i(glass.progPanel.u.u_atlas, ctx.texUnitBase);
  if (glass.progPanel.u.u_backdrop) gl.uniform1i(glass.progPanel.u.u_backdrop, ctx.texUnitBase + 1);
  gl.useProgram(progComp);
  if (glass.progComp.u.u_tex) gl.uniform1i(glass.progComp.u.u_tex, ctx.texUnitBase + 1);
  gl.useProgram(null);

  rebuildLatticeBuffers(gl, glass, state);
  gl.bindBuffer(gl.ARRAY_BUFFER, glass.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, state.verts, gl.DYNAMIC_DRAW);

  var size = backdropSize(ctx);
  glass.backdrop = ctx.target(size.w, size.h);

  buildParticles(ctx, glass);

  return glass;
}

/* Size-dependent target only. Reallocates the backdrop's OWN texture storage
 * directly (gl.texImage2D on the object ctx.target() already gave us)
 * rather than calling ctx.target() again — a second call here would count
 * twice against the act's fboBudget of 3 on every resize, which is not what
 * the budget means. */
export function resize(glass, width, height, dpr) {
  if (!glass || !glass.backdrop) return;
  var ctx = glass.ctx;
  ctx.width = width; ctx.height = height; ctx.dpr = dpr;
  var size = backdropSize(ctx);
  if (glass.backdrop.width === size.w && glass.backdrop.height === size.h) return;
  var gl = ctx.gl;
  gl.bindTexture(gl.TEXTURE_2D, glass.backdrop.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, glass.backdropInternal, size.w, size.h, 0, gl.RGBA, glass.backdrop.type, null);
  glass.backdrop.width = size.w;
  glass.backdrop.height = size.h;
}

export function draw(glass, state, atlasTex, tileRectOf, alpha, ctx) {
  if (!glass) return;
  glass.time += ctx.lastDt || (1 / 60);
  glass.tier = ctx.tier;

  drawBackdrop(ctx, glass);
  compositeBackdrop(ctx, glass, alpha);
  uploadVerts(ctx, glass, state);
  drawPanels(ctx, glass, state, atlasTex, tileRectOf, alpha);
  if (ctx.tier > 1 && glass.progGrain) drawGrain(ctx, glass, alpha);
  restoreBaseline(ctx);
}

/* Reduced motion: one composed frame. Always a full bufferData rather than
 * tracking a dirty range — this runs once (or once per resize/settle), so
 * the dirty-range optimisation that matters for a 60fps loop buys nothing
 * here and a stale dirty range from before the act went still would be
 * actively wrong. */
export function drawStill(glass, state, atlasTex, tileRectOf, ctx) {
  if (!glass) return;
  var gl = ctx.gl;

  if (state.vertsReallocated || glass.lattice !== state.lattice) {
    rebuildLatticeBuffers(gl, glass, state);
    state.vertsReallocated = false;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, glass.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, state.verts, gl.DYNAMIC_DRAW);

  drawBackdrop(ctx, glass);
  compositeBackdrop(ctx, glass, 1);
  drawPanels(ctx, glass, state, atlasTex, tileRectOf, 1);
  if (ctx.tier > 1 && glass.progGrain) drawGrain(ctx, glass, 1);
  restoreBaseline(ctx);
}

export function dispose(glass) {
  /* Every GL object here came from ctx.program/ctx.buffer/ctx.target, which
     the Stage pools and reclaims itself — nothing to gl.delete* by hand, and
     that also makes this safe to call on a lost context. */
}
