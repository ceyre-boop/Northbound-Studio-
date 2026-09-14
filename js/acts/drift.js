/* drift.js — Act II. "Most of them are dark."
 *
 * Forty local businesses, most of them dark. A field of points of light in a
 * large, cold, mostly-empty space: a handful lit and twinkling, the rest dim,
 * the cursor disturbing it slightly, scroll shearing it. Not a celebration —
 * a market, honestly framed.
 *
 * Three completely independent techniques, chosen once at init() from
 * ctx.caps and never branched on again:
 *
 *   A  WebGL2 transform feedback  (ctx.caps.version === 2)
 *   C  WebGL1 RGBA8 fixed-point ping-pong + vertex texture fetch
 *      (ctx.caps.version === 1 && ctx.caps.vertexTextureUnits >= 1)
 *   D  Analytic, stateless, CPU-free simulation — position as a pure
 *      function of (home, seed, time, cursor, scroll)
 *      (ctx.caps.vertexTextureUnits === 0)
 *
 * update() only advances small CPU-side scalars (elapsed time, a
 * self-measured scroll velocity, the smoothed cursor) — no gl.* calls.
 * draw() does all the GL work and restores the Stage's additive-blend
 * departure before returning, per the strict-mode contract in stage.js.
 */
import { DRIFT_SHADERS } from '../gl/drift-shaders.js';
import { sampleForm, packFormTexture } from '../gl/formsampler.js';

var COUNTS = { 3: 131072, 2: 65536, 1: 16384 };
var COUNT_D = 8192;
var SETTLE_FRAMES = 240;
var SETTLE_DT = 1 / 60;

/* --- the lenticular: three frames the field resolves into as the visitor
 * scrolls this act's own window, scattering back to loose drift between each
 * one. See js/gl/formsampler.js for how an SVG becomes a weighted point
 * cloud, and drift-shaders.js for how each of the three GL paths pulls
 * toward it. This is the entire cross-department vocabulary for that
 * feature — nothing else in this file or drift-shaders.js should need to
 * know how a frame's points were produced.
 *
 * Root-absolute like every other dynamically-imported path on this page
 * (see cast.js's comment on why): this module itself is loaded via
 * import() from stage.js, so a relative fetch would resolve against
 * whatever loaded it, not against the document.
 */
var FORM_URLS = [
  '/brand/form-1-front.svg',   // "the website is the front of it"
  '/brand/form-2-machine.svg', // "the part behind it"
  '/brand/form-3-pays.svg'     // "the part that pays for itself"
];
var FORM_DOMAIN = 1.2; // must match Path C's sim domain in drift-shaders.js
var FORM_RASTER = 256; // px square the SVG is sampled at — plenty for a silhouette
/* Three holds across this act's own 0..1 progress, each a full stop, each
 * separated by a stretch where the target weight is exactly 0 — the field
 * is given back to plain drift entirely, not cross-faded, so the picture
 * visibly comes apart before the next one assembles. */
var FORM_CENTERS = [0.20, 0.50, 0.80];
/* HOLD_HALF*2 + FALL*2 per frame must stay under the 0.30 spacing between
 * centres, with room left over — that spare distance IS the true weight-0
 * scatter window between pictures. At 0.07/0.055 each frame reaches out
 * 0.125, so two neighbours' reach sums to 0.25 against a 0.30 gap: a real
 * ~0.05 span where every path sees weight 0 and the image is fully
 * dispersed, not just cross-fading into the next one. */
var FORM_HOLD_HALF = 0.07; // full weight within this distance of a centre
var FORM_FALL = 0.055;     // additional easing distance out to weight 0
/* Reduced motion composes ONE still frame — the boldest silhouette, the
 * shopfront, which reads clearest at the lowest particle counts of the
 * three (see the report in the task notes: the coin arc in frame 3 and the
 * gear teeth in frame 2 are the ones that suffer first as points thin out). */
var FORM_REDUCED_FRAME = 0;

function easeOutQuad(t) { return t * (2 - t); }

/** p is this act's own 0..1 progress. Returns { frame, weight } — which of
 *  the three sampled clouds is the current pull target, and how strongly
 *  (0 = pure drift, 1 = fully resolved). Only ever one frame is "current":
 *  between holds every path is told weight 0, and which frame index carries
 *  that zero is irrelevant to the visuals, only to which buffer a caller
 *  would upload next. */
function computeForm(p) {
  var bestI = 0, bestW = 0;
  for (var i = 0; i < FORM_CENTERS.length; i++) {
    var d = Math.abs(p - FORM_CENTERS[i]);
    var w;
    if (d <= FORM_HOLD_HALF) w = 1;
    else if (d <= FORM_HOLD_HALF + FORM_FALL) {
      var t = (d - FORM_HOLD_HALF) / FORM_FALL;
      w = 1 - easeOutQuad(t);
    } else w = 0;
    if (w > bestW) { bestW = w; bestI = i; }
  }
  return { frame: bestI, weight: bestW };
}

function mat4Ortho(aspect) {
  // Simple symmetric ortho-ish projection: x,y in roughly [-1.4,1.4] visible,
  // z gently affects nothing but is carried for the depth cue in Path A/C.
  var sx = 1 / Math.max(aspect, 1e-4);
  return new Float32Array([
    sx, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function makeState() {
  return {
    path: null,         // 'A' | 'C' | 'D'
    time: 0,
    lastP: 0,
    scrollV: 0,          // self-measured, smoothed scroll velocity 0..1
    cursor: { x: 0, y: 0 },
    w: 0, h: 0, dpr: 1, aspect: 1,

    // Path A
    a: null,
    // Path C
    c: null,
    // Path D
    d: null,

    count: 0,
    settled: false,

    // the lenticular
    forms: null,        // [Float32Array, Float32Array, Float32Array] or null if load failed
    formsReady: false,
    formFrame: 0,
    formWeight: 0,
    formUploaded: -1    // frame index currently resident in the GPU-side target buffer/texture
  };
}

var S = makeState();

// ---------------------------------------------------------------------
// helpers shared by all three paths
// ---------------------------------------------------------------------

function countForTier(tier) {
  return COUNTS[tier] || COUNTS[1];
}

// ---------------------------------------------------------------------
// Path A — WebGL2 transform feedback
// ---------------------------------------------------------------------

var A_STRIDE = 32; // vec3 pos + vec3 vel + life + seed, all float32

function aBuildSeedData(n) {
  var data = new Float32Array(n * 8);
  for (var i = 0; i < n; i++) {
    var o = i * 8;
    var seed = i / n;
    // home-ish starting position; exact home is recomputed on GPU each frame
    var hx = (hash2(seed, 1.7) - 0.5) * 1.6;
    var hy = (hash2(seed, 5.3) - 0.5) * 1.6;
    var hz = (hash2(seed, 9.1) - 0.5) * 1.6;
    data[o + 0] = hx; data[o + 1] = hy; data[o + 2] = hz;
    data[o + 3] = 0; data[o + 4] = 0; data[o + 5] = 0;
    data[o + 6] = 0.6 + hash2(seed, 3.3) * 0.4; // life
    data[o + 7] = seed;                          // seed
  }
  return data;
}

// small CPU-side hash mirroring the GLSL hash(), only used to seed initial
// buffer contents deterministically — never called from update()/draw().
function hash2(a, b) {
  var x = a * 12.9898 + b * 78.233;
  var s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

function aBuildProgramWithVaryings(gl, ctx, vert, frag, varyings, label) {
  var vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vert); gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    var lv = gl.getShaderInfoLog(vs); gl.deleteShader(vs);
    throw new Error('drift ' + label + ' vert: ' + lv);
  }
  var fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, frag); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    var lf = gl.getShaderInfoLog(fs); gl.deleteShader(fs); gl.deleteShader(vs);
    throw new Error('drift ' + label + ' frag: ' + lf);
  }
  var p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.transformFeedbackVaryings(p, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    var lp = gl.getProgramInfoLog(p);
    gl.deleteProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
    throw new Error('drift ' + label + ' link: ' + lp);
  }
  // shaders may be deleted after a successful link
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function aSetupAttribs(gl, prog, includeVelocity) {
  var stride = A_STRIDE;
  var locPos = gl.getAttribLocation(prog, 'a_position');
  var locVel = includeVelocity ? gl.getAttribLocation(prog, 'a_velocity') : -1;
  var locLife = gl.getAttribLocation(prog, 'a_life');
  var locSeed = gl.getAttribLocation(prog, 'a_seed');
  if (locPos >= 0) { gl.enableVertexAttribArray(locPos); gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, stride, 0); }
  if (locVel >= 0) { gl.enableVertexAttribArray(locVel); gl.vertexAttribPointer(locVel, 3, gl.FLOAT, false, stride, 12); }
  if (locLife >= 0) { gl.enableVertexAttribArray(locLife); gl.vertexAttribPointer(locLife, 1, gl.FLOAT, false, stride, 24); }
  if (locSeed >= 0) { gl.enableVertexAttribArray(locSeed); gl.vertexAttribPointer(locSeed, 1, gl.FLOAT, false, stride, 28); }
}

function aBindTargetAttrib(gl, prog, buf) {
  var loc = gl.getAttribLocation(prog, 'a_target');
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 8, 0);
}

function aInit(ctx, n) {
  var gl = ctx.gl;
  var A = {
    n: n,
    gl: gl, // kept only so dispose() can free the raw (non-ctx-pooled) objects below
    updateProg: aBuildProgramWithVaryings(gl, ctx, DRIFT_SHADERS.A.UPDATE_VERT, DRIFT_SHADERS.A.UPDATE_FRAG, DRIFT_SHADERS.A.UPDATE_VARYINGS, 'a-update'),
    renderProg: ctx.program(DRIFT_SHADERS.A.RENDER_VERT, DRIFT_SHADERS.A.RENDER_FRAG, 'a-render'),
    bufA: ctx.buffer(),
    bufB: ctx.buffer(),
    // The lenticular target: one vec2 per particle, whichever frame is
    // CURRENTLY active. Static from the transform feedback's point of view —
    // it is never written by the GPU, only replaced wholesale (bufferSubData)
    // by drift.js when the active frame changes, which is a handful of times
    // across the whole scroll, never per frame.
    targetBuf: ctx.buffer(),
    vaoUpdateFromA: ctx.vao(),
    vaoUpdateFromB: ctx.vao(),
    vaoRenderA: ctx.vao(),
    vaoRenderB: ctx.vao(),
    tfToB: gl.createTransformFeedback(),
    tfToA: gl.createTransformFeedback(),
    readIsA: true
  };

  var data = aBuildSeedData(n);
  gl.bindBuffer(gl.ARRAY_BUFFER, A.bufA);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
  gl.bindBuffer(gl.ARRAY_BUFFER, A.bufB);
  gl.bufferData(gl.ARRAY_BUFFER, n * A_STRIDE, gl.DYNAMIC_COPY);
  gl.bindBuffer(gl.ARRAY_BUFFER, A.targetBuf);
  gl.bufferData(gl.ARRAY_BUFFER, n * 8, gl.DYNAMIC_DRAW); // zero-filled until a form loads
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  if (A.vaoUpdateFromA) {
    gl.bindVertexArray(A.vaoUpdateFromA);
    gl.bindBuffer(gl.ARRAY_BUFFER, A.bufA);
    aSetupAttribs(gl, A.updateProg, true);
    aBindTargetAttrib(gl, A.updateProg, A.targetBuf);
  }
  if (A.vaoUpdateFromB) {
    gl.bindVertexArray(A.vaoUpdateFromB);
    gl.bindBuffer(gl.ARRAY_BUFFER, A.bufB);
    aSetupAttribs(gl, A.updateProg, true);
    aBindTargetAttrib(gl, A.updateProg, A.targetBuf);
  }
  if (A.vaoRenderA) {
    gl.bindVertexArray(A.vaoRenderA);
    gl.bindBuffer(gl.ARRAY_BUFFER, A.bufA);
    aSetupAttribs(gl, A.renderProg, false);
  }
  if (A.vaoRenderB) {
    gl.bindVertexArray(A.vaoRenderB);
    gl.bindBuffer(gl.ARRAY_BUFFER, A.bufB);
    aSetupAttribs(gl, A.renderProg, false);
  }
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, A.tfToB);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, A.bufB);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, A.tfToA);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, A.bufA);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

  A.uUpdate = {
    dt: gl.getUniformLocation(A.updateProg, 'u_dt'),
    time: gl.getUniformLocation(A.updateProg, 'u_time'),
    cursor: gl.getUniformLocation(A.updateProg, 'u_cursor'),
    energy: gl.getUniformLocation(A.updateProg, 'u_energy'),
    formWeight: gl.getUniformLocation(A.updateProg, 'u_formWeight')
  };
  A.uRender = {
    proj: gl.getUniformLocation(A.renderProg, 'u_proj'),
    dpr: gl.getUniformLocation(A.renderProg, 'u_dpr'),
    pointScale: gl.getUniformLocation(A.renderProg, 'u_pointScale'),
    maxPoint: gl.getUniformLocation(A.renderProg, 'u_maxPoint'),
    formWeight: gl.getUniformLocation(A.renderProg, 'u_formWeight')
  };
  return A;
}

function aRunUpdate(ctx, A, dt) {
  var gl = ctx.gl;
  var fromA = A.readIsA;
  gl.useProgram(A.updateProg);
  gl.uniform1f(A.uUpdate.dt, dt);
  gl.uniform1f(A.uUpdate.time, S.time);
  gl.uniform2f(A.uUpdate.cursor, S.cursor.x, S.cursor.y);
  gl.uniform1f(A.uUpdate.energy, S.scrollV);
  gl.uniform1f(A.uUpdate.formWeight, S.formWeight);

  gl.bindVertexArray(fromA ? A.vaoUpdateFromA : A.vaoUpdateFromB);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, fromA ? A.tfToB : A.tfToA);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, A.n);
  gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  gl.bindVertexArray(null);

  A.readIsA = !fromA;
}

function aDraw(ctx, A, alpha, pointScale) {
  var gl = ctx.gl;
  gl.useProgram(A.renderProg);
  gl.uniformMatrix4fv(A.uRender.proj, false, mat4Ortho(S.aspect));
  gl.uniform1f(A.uRender.dpr, S.dpr);
  gl.uniform1f(A.uRender.pointScale, pointScale);
  gl.uniform1f(A.uRender.maxPoint, ctx.caps.maxPointSize);
  /* The same weight that pulls the particles onto the target turns their
     lights on — see INK_LIFT in js/gl/drift-shaders.js. */
  gl.uniform1f(A.uRender.formWeight, S.formWeight);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  var count = Math.round(A.n * ctx.share);
  gl.bindVertexArray(A.readIsA ? A.vaoRenderA : A.vaoRenderB);
  gl.drawArrays(gl.POINTS, 0, count);
  gl.bindVertexArray(null);

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

// ---------------------------------------------------------------------
// Path C — WebGL1 RGBA8 fixed-point ping-pong
// ---------------------------------------------------------------------

function cTexSize(n, maxSize) {
  var w = Math.min(maxSize, Math.max(1, Math.ceil(Math.sqrt(n))));
  var h = Math.min(maxSize, Math.max(1, Math.ceil(n / w)));
  return { w: w, h: h };
}

function cForceNearest(gl, target) {
  gl.bindTexture(gl.TEXTURE_2D, target.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function cInit(ctx, n) {
  var gl = ctx.gl;
  var size = cTexSize(n, ctx.caps.maxTextureSize);
  var w = size.w, h = size.h;
  var texN = w * h;

  var posPP = ctx.pingPong(w, h);
  var zlPP = ctx.pingPong(w, h);
  var velPP = ctx.pingPong(w, h);
  [posPP.read, posPP.write, zlPP.read, zlPP.write, velPP.read, velPP.write].forEach(function (t) {
    cForceNearest(gl, t);
  });

  var quadProg = function (frag, label) { return ctx.program(DRIFT_SHADERS.C.QUAD_VERT, frag, label); };
  var C = {
    n: texN, w: w, h: h,
    posPP: posPP, zlPP: zlPP, velPP: velPP,
    posProg: quadProg(DRIFT_SHADERS.C.POS_FRAG, 'c-pos'),
    zlProg: quadProg(DRIFT_SHADERS.C.ZL_FRAG, 'c-zl'),
    velProg: quadProg(DRIFT_SHADERS.C.VEL_FRAG, 'c-vel'),
    renderProg: ctx.program(DRIFT_SHADERS.C.RENDER_VERT, DRIFT_SHADERS.C.RENDER_FRAG, 'c-render'),
    uvBuf: ctx.buffer(),
    // The lenticular target: a plain (non-framebuffer) texture, one texel
    // per particle in the same w*h grid as pos/zl/vel, packed exactly like
    // posTex. Costs one texture object, not an FBO — the act's fboBudget of
    // 6 is already fully spent by the three ping-pong pairs above, so this
    // must never go through ctx.target()/ctx.pingPong().
    targetTex: { tex: ctx.texture() }
  };

  // Seed the pos/zl/vel textures with an initial state: life<=0 everywhere
  // so the first simulation pass respawns every particle at its home.
  var initPos = new Uint8Array(w * h * 4);
  var initZl = new Uint8Array(w * h * 4); // life (b channel) starts at 0
  var initVel = new Uint8Array(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    initVel[i * 4 + 0] = 128; initVel[i * 4 + 1] = 128; initVel[i * 4 + 2] = 128; initVel[i * 4 + 3] = 255;
  }
  function seedTex(target, data) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  seedTex(posPP.read, initPos); seedTex(posPP.write, initPos);
  seedTex(zlPP.read, initZl); seedTex(zlPP.write, initZl);
  seedTex(velPP.read, initVel); seedTex(velPP.write, initVel);
  seedTex(C.targetTex, new Uint8Array(w * h * 4)); // zero-filled until a form loads
  cForceNearest(gl, C.targetTex);

  // static a_uv VBO: texel centres, one per particle, row-major
  var uv = new Float32Array(texN * 2);
  for (var yy = 0; yy < h; yy++) {
    for (var xx = 0; xx < w; xx++) {
      var idx = yy * w + xx;
      uv[idx * 2 + 0] = (xx + 0.5) / w;
      uv[idx * 2 + 1] = (yy + 0.5) / h;
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, C.uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  C.uSim = {
    pos: { dt: gl.getUniformLocation(C.posProg, 'u_dt'), time: gl.getUniformLocation(C.posProg, 'u_time'),
           posTex: gl.getUniformLocation(C.posProg, 'u_posTex'), zlTex: gl.getUniformLocation(C.posProg, 'u_zlTex'),
           velTex: gl.getUniformLocation(C.posProg, 'u_velTex'),
           targetTex: gl.getUniformLocation(C.posProg, 'u_targetTex'), formWeight: gl.getUniformLocation(C.posProg, 'u_formWeight') },
    zl: { dt: gl.getUniformLocation(C.zlProg, 'u_dt'), time: gl.getUniformLocation(C.zlProg, 'u_time'),
          posTex: gl.getUniformLocation(C.zlProg, 'u_posTex'), zlTex: gl.getUniformLocation(C.zlProg, 'u_zlTex'),
          velTex: gl.getUniformLocation(C.zlProg, 'u_velTex'),
          targetTex: gl.getUniformLocation(C.zlProg, 'u_targetTex'), formWeight: gl.getUniformLocation(C.zlProg, 'u_formWeight') },
    vel: { dt: gl.getUniformLocation(C.velProg, 'u_dt'), time: gl.getUniformLocation(C.velProg, 'u_time'),
           cursor: gl.getUniformLocation(C.velProg, 'u_cursor'), energy: gl.getUniformLocation(C.velProg, 'u_energy'),
           posTex: gl.getUniformLocation(C.velProg, 'u_posTex'), zlTex: gl.getUniformLocation(C.velProg, 'u_zlTex'),
           velTex: gl.getUniformLocation(C.velProg, 'u_velTex'),
           targetTex: gl.getUniformLocation(C.velProg, 'u_targetTex'), formWeight: gl.getUniformLocation(C.velProg, 'u_formWeight') }
  };
  C.uRender = {
    posTex: gl.getUniformLocation(C.renderProg, 'u_posTex'),
    zlTex: gl.getUniformLocation(C.renderProg, 'u_zlTex'),
    proj: gl.getUniformLocation(C.renderProg, 'u_proj'),
    dpr: gl.getUniformLocation(C.renderProg, 'u_dpr'),
    pointScale: gl.getUniformLocation(C.renderProg, 'u_pointScale'),
    maxPoint: gl.getUniformLocation(C.renderProg, 'u_maxPoint'),
    formWeight: gl.getUniformLocation(C.renderProg, 'u_formWeight')
  };
  C.aUvLoc = { pos: -1 }; // resolved lazily per-program below
  C.aQuadLoc = {
    pos: gl.getAttribLocation(C.posProg, 'a_pos'),
    zl: gl.getAttribLocation(C.zlProg, 'a_pos'),
    vel: gl.getAttribLocation(C.velProg, 'a_pos')
  };
  C.aUvLocRender = gl.getAttribLocation(C.renderProg, 'a_uv');
  return C;
}

/* pos/zl/vel/target is exactly the four texture units a slot owns
 * (texUnitBase .. texUnitBase+3) — see the BASELINE comment atop stage.js.
 * The lenticular target rides the one unit that was previously spare. */
var TEX_UNITS = { pos: 0, zl: 1, vel: 2, target: 3 };

function cBindQuad(gl, ctx, loc) {
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quad);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

function cRunPass(ctx, C, prog, uniforms, loc, dt, target, extra) {
  var gl = ctx.gl;
  gl.useProgram(prog);
  cBindQuad(gl, ctx, loc);
  gl.uniform1i(uniforms.posTex, TEX_UNITS.pos);
  gl.uniform1i(uniforms.zlTex, TEX_UNITS.zl);
  gl.uniform1i(uniforms.velTex, TEX_UNITS.vel);
  if (uniforms.dt) gl.uniform1f(uniforms.dt, dt);
  if (uniforms.time) gl.uniform1f(uniforms.time, S.time);
  if (uniforms.formWeight) gl.uniform1f(uniforms.formWeight, S.formWeight);
  if (extra) extra();

  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + TEX_UNITS.pos);
  gl.bindTexture(gl.TEXTURE_2D, C.posPP.read.tex);
  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + TEX_UNITS.zl);
  gl.bindTexture(gl.TEXTURE_2D, C.zlPP.read.tex);
  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + TEX_UNITS.vel);
  gl.bindTexture(gl.TEXTURE_2D, C.velPP.read.tex);
  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + TEX_UNITS.target);
  gl.bindTexture(gl.TEXTURE_2D, C.targetTex.tex);
  gl.uniform1i(uniforms.posTex, ctx.texUnitBase + TEX_UNITS.pos);
  gl.uniform1i(uniforms.zlTex, ctx.texUnitBase + TEX_UNITS.zl);
  gl.uniform1i(uniforms.velTex, ctx.texUnitBase + TEX_UNITS.vel);
  if (uniforms.targetTex) gl.uniform1i(uniforms.targetTex, ctx.texUnitBase + TEX_UNITS.target);

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.width, target.height);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function cRunUpdate(ctx, C, dt) {
  var gl = ctx.gl;
  cRunPass(ctx, C, C.posProg, C.uSim.pos, C.aQuadLoc.pos, dt, C.posPP.write);
  cRunPass(ctx, C, C.zlProg, C.uSim.zl, C.aQuadLoc.zl, dt, C.zlPP.write);
  cRunPass(ctx, C, C.velProg, C.uSim.vel, C.aQuadLoc.vel, dt, C.velPP.write, function () {
    gl.uniform2f(C.uSim.vel.cursor, S.cursor.x, S.cursor.y);
    gl.uniform1f(C.uSim.vel.energy, S.scrollV);
  });
  C.posPP.swap(); C.zlPP.swap(); C.velPP.swap();
  ctx.restore();
}

function cDraw(ctx, C, alpha, pointScale) {
  var gl = ctx.gl;
  gl.useProgram(C.renderProg);

  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + TEX_UNITS.pos);
  gl.bindTexture(gl.TEXTURE_2D, C.posPP.read.tex);
  gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase + TEX_UNITS.zl);
  gl.bindTexture(gl.TEXTURE_2D, C.zlPP.read.tex);
  gl.uniform1i(C.uRender.posTex, ctx.texUnitBase + TEX_UNITS.pos);
  gl.uniform1i(C.uRender.zlTex, ctx.texUnitBase + TEX_UNITS.zl);
  gl.uniformMatrix4fv(C.uRender.proj, false, mat4Ortho(S.aspect));
  gl.uniform1f(C.uRender.dpr, S.dpr);
  gl.uniform1f(C.uRender.pointScale, pointScale);
  gl.uniform1f(C.uRender.maxPoint, ctx.caps.maxPointSize);
  gl.uniform1f(C.uRender.formWeight, S.formWeight);

  gl.bindBuffer(gl.ARRAY_BUFFER, C.uvBuf);
  gl.enableVertexAttribArray(C.aUvLocRender);
  gl.vertexAttribPointer(C.aUvLocRender, 2, gl.FLOAT, false, 0, 0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  var count = Math.round(C.n * ctx.share);
  gl.drawArrays(gl.POINTS, 0, count);

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

// ---------------------------------------------------------------------
// Path D — analytic, stateless
// ---------------------------------------------------------------------

function dInit(ctx, n) {
  var gl = ctx.gl;
  var D = {
    n: n,
    prog: ctx.program(DRIFT_SHADERS.D.VERT, DRIFT_SHADERS.D.FRAG, 'd'),
    homeBuf: ctx.buffer(),
    seedBuf: ctx.buffer(),
    // The lenticular target, same convention as Path A: one vec2 per
    // particle, whichever frame is CURRENTLY active, replaced wholesale on
    // the rare frame a hold transitions rather than every draw call.
    targetBuf: ctx.buffer()
  };
  var homes = new Float32Array(n * 3);
  var seeds = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var seed = i / n;
    homes[i * 3 + 0] = (hash2(seed, 1.7) - 0.5) * 1.6;
    homes[i * 3 + 1] = (hash2(seed, 5.3) - 0.5) * 1.6;
    homes[i * 3 + 2] = (hash2(seed, 9.1) - 0.5) * 1.6;
    seeds[i] = seed;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, D.homeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, homes, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, D.seedBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, D.targetBuf);
  gl.bufferData(gl.ARRAY_BUFFER, n * 8, gl.DYNAMIC_DRAW); // zero-filled until a form loads
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  D.aHome = gl.getAttribLocation(D.prog, 'a_home');
  D.aSeed = gl.getAttribLocation(D.prog, 'a_seed');
  D.aTarget = gl.getAttribLocation(D.prog, 'a_target');
  D.u = {
    proj: gl.getUniformLocation(D.prog, 'u_proj'),
    time: gl.getUniformLocation(D.prog, 'u_time'),
    cursor: gl.getUniformLocation(D.prog, 'u_cursor'),
    energy: gl.getUniformLocation(D.prog, 'u_energy'),
    scroll: gl.getUniformLocation(D.prog, 'u_scroll'),
    formWeight: gl.getUniformLocation(D.prog, 'u_formWeight'),
    dpr: gl.getUniformLocation(D.prog, 'u_dpr'),
    pointScale: gl.getUniformLocation(D.prog, 'u_pointScale'),
    maxPoint: gl.getUniformLocation(D.prog, 'u_maxPoint')
  };
  return D;
}

function dDraw(ctx, D, alpha, pointScale, pOfAct) {
  var gl = ctx.gl;
  gl.useProgram(D.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, D.homeBuf);
  gl.enableVertexAttribArray(D.aHome);
  gl.vertexAttribPointer(D.aHome, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, D.seedBuf);
  gl.enableVertexAttribArray(D.aSeed);
  gl.vertexAttribPointer(D.aSeed, 1, gl.FLOAT, false, 0, 0);
  if (D.aTarget >= 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, D.targetBuf);
    gl.enableVertexAttribArray(D.aTarget);
    gl.vertexAttribPointer(D.aTarget, 2, gl.FLOAT, false, 0, 0);
  }

  gl.uniformMatrix4fv(D.u.proj, false, mat4Ortho(S.aspect));
  gl.uniform1f(D.u.time, S.time);
  gl.uniform2f(D.u.cursor, S.cursor.x, S.cursor.y);
  gl.uniform1f(D.u.energy, S.scrollV);
  gl.uniform1f(D.u.scroll, pOfAct);
  gl.uniform1f(D.u.formWeight, S.formWeight);
  gl.uniform1f(D.u.dpr, S.dpr);
  gl.uniform1f(D.u.pointScale, pointScale);
  gl.uniform1f(D.u.maxPoint, ctx.caps.maxPointSize);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  var count = Math.round(D.n * ctx.share);
  gl.drawArrays(gl.POINTS, 0, count);

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

// ---------------------------------------------------------------------
// point size policy — the thing that actually controls overdraw
// ---------------------------------------------------------------------

/* How much bigger a dot gets while a lenticular frame is held.
 *
 * A picture made of points only reads once the points are close enough to
 * close the gaps between them, and the lower the tier the fewer points there
 * are to spend on the same silhouette — tier 1 draws a frame with an eighth
 * of tier 3's cloud. So the gain runs the other way from the tier: the
 * sparsest field gets the largest dots. Keyed to the drift field's own dot
 * size, so at weight 0 nothing changes and the ambience is untouched. */
var INK_POINT_GAIN = { 1: 3.2, 2: 1.2, 3: 0.5 };

function pointScaleFor(ctx) {
  // Multiplied by dpr (and, for Path D, by per-vertex depth) in-shader.
  // Clamped again against ctx.caps.maxPointSize there too.
  var base = ctx.tier <= 1 ? 1.5 : 3.0;
  var gain = INK_POINT_GAIN[ctx.tier] || INK_POINT_GAIN[1];
  return base * (1 + gain * S.formWeight);
}

// ---------------------------------------------------------------------
// the act
// ---------------------------------------------------------------------

var manifest = {
  id: 'drift',
  label: 'Drift',
  window: [0.27, 0.55],
  cost: 4,
  fboBudget: 6,
  requires: [],
  preload: 0.14
};

function pickPath(ctx) {
  if (ctx.caps.version === 2 && ctx.caps.transformFeedback) return 'A';
  if (ctx.caps.version === 1 && ctx.caps.vertexTextureUnits >= 1) return 'C';
  return 'D';
}

function allocate(ctx) {
  S.path = pickPath(ctx);
  S.dpr = ctx.dpr; S.w = ctx.width; S.h = ctx.height;
  S.aspect = S.w / Math.max(S.h, 1);
  S.time = 0; S.lastP = 0; S.scrollV = 0; S.cursor.x = 0; S.cursor.y = 0;
  S.settled = false;
  // GPU-side target storage is fresh every allocate() (new buffers/textures
  // on a lost-context recovery too), so any previously-uploaded frame index
  // is stale and must never be trusted to skip a re-upload.
  S.formUploaded = -1;

  if (S.path === 'A') {
    S.count = countForTier(ctx.tier);
    S.a = aInit(ctx, S.count);
  } else if (S.path === 'C') {
    var wanted = countForTier(ctx.tier);
    S.c = cInit(ctx, wanted);
    S.count = S.c.n;
  } else {
    S.count = COUNT_D;
    S.d = dInit(ctx, S.count);
  }
}

/* Sample the three lenticular frames once, at the count this path actually
 * carries (S.count already accounts for tier and, on Path C, the padded
 * texture grid). Off the critical path — awaited from init(), never from
 * update()/draw(). A load failure degrades to a plain drift field rather
 * than failing the whole act: ctx.warn(), not a thrown rejection. */
/* Wait for the page to land before fetching the lenticular's three frames.
 *
 * They are cheap files, but init() runs at this act's PRELOAD margin, which
 * on a slow connection is while the hero is still painting — so three SVG
 * fetches plus this module and its shaders were queued behind nothing and in
 * front of everything, and the slow-4G LCP measurement went to 1208ms
 * against a 1200ms gate. Measured: form-3-pays.svg finishing at 3878ms on a
 * 1.6Mbps link, ahead of assets the first screen actually needs.
 *
 * Nothing depends on this resolving. formsReady stays false until the frames
 * arrive and the act draws a plain drift field in the meantime, which is the
 * same graceful path a failed fetch already took. The act's own window does
 * not open until several screens down; on a connection slow enough for this
 * to matter, the visitor cannot have got there yet. */
function afterLoad() {
  return new Promise(function (resolve) {
    var go = function () {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(resolve, { timeout: 3000 });
      else setTimeout(resolve, 500);
    };
    if (typeof document === 'undefined' || document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  });
}

async function loadForms(ctx) {
  try {
    await afterLoad();
    var samples = [];
    for (var i = 0; i < FORM_URLS.length; i++) {
      samples.push(await sampleForm(FORM_URLS[i], S.count, FORM_RASTER));
    }
    S.forms = samples;
    S.formsReady = true;
  } catch (e) {
    ctx.warn('lenticular frames failed to load (' + (e && e.message) + '); field stays a plain drift');
    S.forms = null;
    S.formsReady = false;
  }
}

/* Where the picture sits, and how big it is.
 *
 * The sampler returns a square cloud centred on the origin in the sim's own
 * coordinates, and two viewport facts have to be applied on top of it.
 *
 * SIZE. mat4Ortho divides x by the aspect ratio, which is exactly what keeps
 * a square cloud square — but it also means the picture's width is governed
 * by the viewport's HEIGHT. On a landscape screen that is fine. On a phone
 * it is not: at 390x844 the untouched cloud is about 726px across inside a
 * 390px window, so most of every frame falls off both edges and what is left
 * reads as scattered dust rather than a shopfront. So a portrait viewport
 * scales the whole cloud down until it fits the narrow axis with a margin.
 *
 * PLACE. This act's copy lives in the left column on a wide screen, and a
 * full-height silhouette drawn straight through it makes both harder to
 * read. On landscape the cloud slides into the right-hand half, where it
 * overlaps only the ragged ends of the lines — the poster reading, with the
 * paragraph still a paragraph. On a phone the copy is full-bleed and there
 * is no clear half to move to, so it stays centred and reads as a ground
 * behind the text, which at that width it can afford to be.
 *
 * A shift of N in NDC costs N*aspect in target space, hence the multiply. */
var FORM_REACH = 0.86; // the sampler's own half-extent; see sampleForm's scale

function formFit() {
  // 0.9 = leave a tenth of the narrow axis as margin on each side.
  var fit = (0.9 * S.aspect) / FORM_REACH;
  return fit < 1 ? fit : 1;
}

function formShiftX() {
  if (S.aspect < 1.15) return 0;
  return 0.30 * S.aspect;
}

/* Scratch for the placed copy — allocated once per form size, never per
 * upload, and never touched off the upload path. */
var formScratch = null;

function placedForm(pts) {
  var dx = formShiftX();
  var k = formFit();
  if (dx === 0 && k === 1) return pts;
  if (!formScratch || formScratch.length !== pts.length) formScratch = new Float32Array(pts.length);
  for (var i = 0; i < pts.length; i += 2) {
    formScratch[i] = pts[i] * k + dx;
    formScratch[i + 1] = pts[i + 1] * k;
  }
  return formScratch;
}

/* Uploads S.forms[S.formFrame] to whichever path-specific GPU storage is
 * current, but only when the active frame actually changed — a handful of
 * times across the whole scroll, never per frame. All gl.* calls, so this
 * may only ever be called from init() (pre-settle) or draw(). */
function uploadActiveForm(ctx) {
  if (!S.formsReady || S.formUploaded === S.formFrame) return;
  var gl = ctx.gl;
  var pts = placedForm(S.forms[S.formFrame]);
  if (S.path === 'A') {
    gl.bindBuffer(gl.ARRAY_BUFFER, S.a.targetBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pts);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  } else if (S.path === 'C') {
    var packed = packFormTexture(pts, S.c.w, S.c.h, FORM_DOMAIN);
    gl.bindTexture(gl.TEXTURE_2D, S.c.targetTex.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S.c.w, S.c.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed);
    gl.bindTexture(gl.TEXTURE_2D, null);
  } else if (S.path === 'D') {
    gl.bindBuffer(gl.ARRAY_BUFFER, S.d.targetBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pts);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  S.formUploaded = S.formFrame;
}

function runSettle(ctx) {
  // Compose the field's settled state in one CPU-cheap burst rather than
  // drawing an empty or freshly-spawned field on the one frame most visitors
  // to this build actually see (Reduce Motion is on system-wide here).
  if (S.path === 'A') {
    for (var i = 0; i < SETTLE_FRAMES; i++) aRunUpdate(ctx, S.a, SETTLE_DT);
  } else if (S.path === 'C') {
    for (var j = 0; j < SETTLE_FRAMES; j++) cRunUpdate(ctx, S.c, SETTLE_DT);
  }
  // Path D has no state to settle — it is a pure function of time, and a
  // fixed still time (below) is enough to compose it deliberately.
  S.time = SETTLE_FRAMES * SETTLE_DT;
  S.settled = true;
}

export default {
  manifest: manifest,

  init: async function (ctx) {
    allocate(ctx);
    await loadForms(ctx);

    if (ctx.reduced) {
      // Reduced motion composes ONE frame, settled and still: no assembling,
      // no scattering. Pin the strongest of the three permanently rather
      // than reproducing the scroll-driven hold/scatter cycle at any p.
      S.formFrame = FORM_REDUCED_FRAME;
      S.formWeight = S.formsReady ? 1 : 0;
    } else {
      S.formFrame = 0;
      S.formWeight = 0;
    }
    uploadActiveForm(ctx);
    runSettle(ctx);
  },

  resize: function (w, h, dpr) {
    var was = formShiftX() + formFit();
    S.w = w; S.h = h; S.dpr = dpr;
    S.aspect = w / Math.max(h, 1);
    /* Placement is baked into the uploaded points, so any resize that changes
       it has to re-upload them. Cheap and rare; the alternative is threading
       two more uniforms through five programs. */
    if (formShiftX() + formFit() !== was) S.formUploaded = -1;
  },

  update: function (dt, p, ctx) {
    // CPU only — no gl.* calls here.
    var dp = p - S.lastP;
    S.lastP = p;
    var inst = Math.min(1, Math.abs(dp) * 30);
    S.scrollV = inst > S.scrollV ? S.scrollV + (inst - S.scrollV) * 0.4 : S.scrollV * 0.9;

    var cur = window.NB_MOTION ? window.NB_MOTION.cursor : null;
    S.cursor.x = cur ? (cur.sx - 0.5) * 2 * S.aspect : 0;
    S.cursor.y = cur ? (0.5 - cur.sy) * 2 : 0;

    // The lenticular: which of the three sampled frames is current, and how
    // resolved the field should be into it. p is this act's own 0..1
    // progress (see the manifest comment in stage.js) — update() only ever
    // runs in full motion mode, so there is no reduced-mode branch needed
    // here; drawStill() owns that composition instead.
    if (S.formsReady) {
      var form = computeForm(p);
      S.formFrame = form.frame;
      S.formWeight = form.weight;
    } else {
      S.formWeight = 0;
    }

    S.time += dt;
    S._pendingDt = dt;
  },

  draw: function (alpha, ctx) {
    var gl = ctx.gl;
    var pointScale = pointScaleFor(ctx) * (ctx.share < 1 ? 1 : 1);
    var dt = S._pendingDt || 0;

    uploadActiveForm(ctx);
    gl.enable(gl.BLEND);

    if (S.path === 'A') {
      if (dt > 0) aRunUpdate(ctx, S.a, dt);
      aDraw(ctx, S.a, alpha, pointScale);
    } else if (S.path === 'C') {
      if (dt > 0) cRunUpdate(ctx, S.c, dt);
      cDraw(ctx, S.c, alpha, pointScale);
    } else {
      dDraw(ctx, S.d, alpha, pointScale, S.lastP);
    }

    // Restore the Stage baseline this act departed from.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase);
    S._pendingDt = 0;
  },

  drawStill: function (ctx) {
    // init() already ran the settle burst; just render one frame of the
    // composed result. share is always 1 here (reduced mode never overlaps).
    var save = ctx.share;
    ctx.share = 1;
    var pointScale = pointScaleFor(ctx);
    var gl = ctx.gl;
    gl.enable(gl.BLEND);
    if (S.path === 'A') aDraw(ctx, S.a, 1, pointScale);
    else if (S.path === 'C') cDraw(ctx, S.c, 1, pointScale);
    else dDraw(ctx, S.d, 1, pointScale, 0.5);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0 + ctx.texUnitBase);
    ctx.share = save;
  },

  fallback: function (ctx) {
    if (ctx.root) ctx.root.setAttribute('data-drift-fallback', 'static');
  },

  dispose: function () {
    // Path A builds its update program and transform-feedback objects with
    // raw gl.* calls (transformFeedbackVaryings() must run before link, which
    // ctx.program() has no hook for), so unlike everything else here they are
    // not pooled by the Stage and must be freed by hand. Every gl.delete* is
    // a documented no-op on a lost context, so this is safe there too.
    if (S.a && S.a.gl) {
      try {
        S.a.gl.deleteProgram(S.a.updateProg);
        S.a.gl.deleteTransformFeedback(S.a.tfToA);
        S.a.gl.deleteTransformFeedback(S.a.tfToB);
      } catch (e) { /* lost context: already gone */ }
    }
    S.a = null; S.c = null; S.d = null; S.path = null; S.settled = false;
    S.forms = null; S.formsReady = false; S.formUploaded = -1;
  },

  stats: function () {
    return { particles: S.count, path: S.path };
  }
};
