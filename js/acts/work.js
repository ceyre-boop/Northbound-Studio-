/* work.js — Act IV, "the only two things that are real."
 *
 * The GL half here is deliberately small: atmosphere plus a dissolve, cost 1.
 * The dissolve is the noise-threshold wipe lifted from js/gl/wipe.js —
 * step(threshold, hash(cell)) with a diagonal bias and a lit rim on the cells
 * currently crossing over. wipe.js used it to hand a panel over to a live
 * iframe; here the same shader settles the field Solution leaves behind into
 * a hushed, held atmosphere behind the two work cards, so the seam reads in
 * the same visual language as the panel-open reveal below it — because it is
 * literally the same shader. wipe.js itself is left untouched: it owned its
 * own canvas and its own GL context, which the one-canvas rule forbids, so
 * only the fragment shader is lifted, not the module.
 *
 * The DOM half is the actual act. You cannot put a live iframe inside a
 * WebGL texture, so the two builds are real DOM — see js/panels.js, which
 * this module binds once, independent of its own init()/dispose() cycle. A
 * visitor can still open a build after this GL half has been torn down for
 * scrolling away, or when there is no GL context at all.
 */

import * as Panels from '../panels.js';

var VERT = [
  'attribute vec2 a_pos;',
  'varying vec2 v_uv;',
  'void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }'
].join('\n');

var FRAG = [
  'precision mediump float;',
  'varying vec2 v_uv;',
  'uniform vec2  u_res;',
  'uniform float u_p;       // 0..1, this act settling out of the field before it',
  'uniform float u_alpha;   // the Stage cross-fade',
  '',
  'float hash(vec2 p) {',
  '  vec3 q = fract(vec3(p.xyx) * 0.1031);',
  '  q += dot(q, q.yzx + 33.33);',
  '  return fract((q.x + q.y) * q.z);',
  '}',
  '',
  'void main() {',
  '  vec2  cell = floor(v_uv * u_res / 14.0);',
  '  float h    = hash(cell);',
  '  float bias = (v_uv.x * 0.35 + v_uv.y * 0.25);',
  '  // The reveal runs across the first slice of the act\'s own window and',
  '  // holds calm for the rest of it — the field settles well before the',
  '  // visitor reaches the cards, rather than dissolving under them.',
  '  float p    = clamp(u_p / 0.35, 0.0, 1.0);',
  '  float thr  = mix(-0.6, 1.6, p) - bias;',
  '  float on   = step(h, thr);',
  '  float edge = smoothstep(0.10, 0.0, abs(h - thr));',
  '  vec3  calm = vec3(0.03, 0.07, 0.075);',
  '  vec3  col  = calm + vec3(0.10, 0.86, 1.00) * edge * 0.35;',
  '  // A held vignette, not a flat field — depth behind the cards, not a card.',
  '  float vg   = smoothstep(0.92, 0.10, length(v_uv - 0.5));',
  '  float a    = max(on * 0.20, edge * 0.30) * vg * u_alpha;',
  '  gl_FragColor = vec4(col * a, a);',
  '}'
].join('\n');

var program = null, aPos = -1, uRes = null, uP = null, uAlpha = null;
var localP = 0;

function bindPanels(root) {
  var target = root || document.querySelector('[data-act="work"]');
  if (target) Panels.init(target);
}

// DOM binding is independent of the GL lifecycle below: it happens once, as
// soon as this module is imported at the act's preload margin, and survives
// context loss, teardown, and the no-WebGL path alike.
bindPanels();

export default {
  manifest: {
    id: 'work',
    label: 'The work',
    window: [0.82, 1.00],
    cost: 1,
    fboBudget: 2,
    requires: [],
    preload: 0.12
  },

  init: function (ctx) {
    program = ctx.program(VERT, FRAG, 'field');
    var gl = ctx.gl;
    aPos = gl.getAttribLocation(program, 'a_pos');
    uRes = gl.getUniformLocation(program, 'u_res');
    uP = gl.getUniformLocation(program, 'u_p');
    uAlpha = gl.getUniformLocation(program, 'u_alpha');
    localP = 0;
    bindPanels(ctx.root);
  },

  update: function (dt, p, ctx) {
    localP = p;
  },

  draw: function (alpha, ctx) {
    var gl = ctx.gl;
    if (!program) return;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quad);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(uRes, ctx.width * ctx.dpr, ctx.height * ctx.dpr);
    gl.uniform1f(uP, localP);
    gl.uniform1f(uAlpha, alpha);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Leave GL state exactly as the Stage baseline: nothing above touched
    // blending, textures, or the framebuffer, so only this program's own
    // attribute and buffer binding need to be released.
    gl.disableVertexAttribArray(aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  },

  /* Reduced motion — almost everyone here, since Reduce Motion is on
     system-wide on the machine this is built on. No dissolve: the field is
     simply composed once, fully settled, and held. */
  drawStill: function (ctx) {
    var gl = ctx.gl;
    if (!program) return;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, ctx.quad);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(uRes, ctx.width * ctx.dpr, ctx.height * ctx.dpr);
    gl.uniform1f(uP, 1);
    gl.uniform1f(uAlpha, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.disableVertexAttribArray(aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  },

  /* No WebGL at all, or init() threw. The cards and the panel controller do
     not depend on any of this — css/act-work.css carries a CSS-only
     atmosphere behind [data-act="work"][data-act-state="static"], and the
     DOM half above was already bound regardless of GL. */
  fallback: function (ctx) {
    bindPanels(ctx.root);
  },

  /* Nothing here was allocated with a raw gl.* call — the program came from
     ctx.program() and is pooled and reclaimed by the Stage. Only this
     module's own references need clearing, and that must be safe to do
     whether or not the context is lost. */
  dispose: function () {
    program = null;
    aPos = -1;
    uRes = null;
    uP = null;
    uAlpha = null;
    localP = 0;
  }
};
