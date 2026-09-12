/* fluid-shaders.js — GLSL sources for Act III's dissolve.
 *
 * A Stam-style semi-Lagrangian incompressible solver: advect velocity, splat
 * cursor/scroll forces into it, solve for pressure with Jacobi iteration,
 * subtract the pressure gradient to make it divergence-free again, then
 * advect a dye field (the rasterized headline, see typeraster.js) through
 * the result. Six fixed passes plus K Jacobi iterations, exactly as the
 * Stage's contract for this act specifies.
 *
 * `hash` and `vnoise` below are copied VERBATIM from js/gl/northlight-shaders.js
 * (not imported — that module is owned by another department and this file
 * must not create a runtime dependency on it) so Act III's tier-1 curl field
 * shares the aurora's grain rather than growing its own.
 *
 * All passes share one fullscreen-triangle vertex shader and sample with
 * v_uv in 0..1, y-up (matches ctx.quad: [-1,-1, 3,-1, -1,3]).
 */
export const VERT = [
  'attribute vec2 a_pos;',
  'varying vec2 v_uv;',
  'void main() {',
  '  v_uv = a_pos * 0.5 + 0.5;',
  '  gl_Position = vec4(a_pos, 0.0, 1.0);',
  '}'
].join('\n');

/* Verbatim from northlight-shaders.js. */
export const NOISE = [
  'float hash(vec2 p) {',
  '  vec3 q = fract(vec3(p.xyx) * 0.1031);',
  '  q += dot(q, q.yzx + 33.33);',
  '  return fract((q.x + q.y) * q.z);',
  '}',
  '',
  'float vnoise(vec2 p) {',
  '  vec2 i = floor(p), f = fract(p);',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  float a = hash(i);',
  '  float b = hash(i + vec2(1.0, 0.0));',
  '  float c = hash(i + vec2(0.0, 1.0));',
  '  float d = hash(i + vec2(1.0, 1.0));',
  '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
  '}'
].join('\n');

/* Shared "sample the type mask at this screen-uv" helper. The atlas covers
   only the measured heading rect (u_maskOrigin/u_maskSize, normalized,
   y-up), not the whole screen, so outside that rect the mask is 0. */
export const MASK_SAMPLE = [
  'float sampleMask(sampler2D tex, vec2 uv, vec2 origin, vec2 size) {',
  '  vec2 m = (uv - origin) / max(size, vec2(1e-4));',
  '  if (m.x < 0.0 || m.x > 1.0 || m.y < 0.0 || m.y > 1.0) return 0.0;',
  '  return texture2D(tex, m).r;',
  '}'
].join('\n');

export const FRAG_SPLAT = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_vel;',
  'uniform float u_aspect;',
  'uniform vec2  u_point;   // uv, y-up',
  'uniform vec2  u_dir;     // impulse, uv/sec',
  'uniform float u_radius;',
  'void main() {',
  '  vec2 base = texture2D(u_vel, v_uv).xy;',
  '  vec2 d = v_uv - u_point;',
  '  d.x *= u_aspect;',
  '  float g = exp(-dot(d, d) / max(u_radius, 1e-5));',
  '  gl_FragColor = vec4(base + u_dir * g, 0.0, 1.0);',
  '}'
].join('\n');

export const FRAG_ADVECT_VEL = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_vel;',
  'uniform vec2  u_texel;',
  'uniform float u_dt;',
  'uniform float u_dissipation;',
  'void main() {',
  '  vec2 coord = v_uv - u_dt * texture2D(u_vel, v_uv).xy * u_texel * 32.0;',
  '  gl_FragColor = vec4(texture2D(u_vel, coord).xy * u_dissipation, 0.0, 1.0);',
  '}'
].join('\n');

export const FRAG_DIVERGENCE = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_vel;',
  'uniform vec2 u_texel;',
  'void main() {',
  '  float L = texture2D(u_vel, v_uv - vec2(u_texel.x, 0.0)).x;',
  '  float R = texture2D(u_vel, v_uv + vec2(u_texel.x, 0.0)).x;',
  '  float B = texture2D(u_vel, v_uv - vec2(0.0, u_texel.y)).y;',
  '  float T = texture2D(u_vel, v_uv + vec2(0.0, u_texel.y)).y;',
  '  gl_FragColor = vec4(0.5 * ((R - L) + (T - B)), 0.0, 0.0, 1.0);',
  '}'
].join('\n');

export const FRAG_JACOBI = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_pressure;',
  'uniform sampler2D u_divergence;',
  'uniform vec2 u_texel;',
  'void main() {',
  '  float L = texture2D(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;',
  '  float R = texture2D(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;',
  '  float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;',
  '  float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;',
  '  float div = texture2D(u_divergence, v_uv).x;',
  '  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);',
  '}'
].join('\n');

export const FRAG_GRADIENT = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_pressure;',
  'uniform sampler2D u_vel;',
  'uniform vec2 u_texel;',
  'void main() {',
  '  float L = texture2D(u_pressure, v_uv - vec2(u_texel.x, 0.0)).x;',
  '  float R = texture2D(u_pressure, v_uv + vec2(u_texel.x, 0.0)).x;',
  '  float B = texture2D(u_pressure, v_uv - vec2(0.0, u_texel.y)).x;',
  '  float T = texture2D(u_pressure, v_uv + vec2(0.0, u_texel.y)).x;',
  '  vec2 vel = texture2D(u_vel, v_uv).xy - 0.5 * vec2(R - L, T - B);',
  '  gl_FragColor = vec4(vel, 0.0, 1.0);',
  '}'
].join('\n');

export const FRAG_ADVECT_DYE = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_dye;',
  'uniform sampler2D u_vel;',
  'uniform sampler2D u_mask;',
  'uniform vec2  u_texel;',
  'uniform vec2  u_maskOrigin;',
  'uniform vec2  u_maskSize;',
  'uniform float u_dt;',
  'uniform float u_dissipation;',
  'uniform float u_inject;',
  MASK_SAMPLE,
  'void main() {',
  '  vec2 coord = v_uv - u_dt * texture2D(u_vel, v_uv).xy * u_texel * 32.0;',
  '  float d = texture2D(u_dye, coord).r * u_dissipation;',
  '  float m = sampleMask(u_mask, v_uv, u_maskOrigin, u_maskSize);',
  '  d = max(d, m * u_inject);',
  '  gl_FragColor = vec4(d, 0.0, 0.0, 1.0);',
  '}'
].join('\n');

export const FRAG_COMPOSITE = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_dye;',
  'uniform vec3  u_color;',
  'uniform float u_alpha;',
  'void main() {',
  '  float d = clamp(texture2D(u_dye, v_uv).r, 0.0, 1.0);',
  '  gl_FragColor = vec4(u_color * d * u_alpha, d * u_alpha);',
  '}'
].join('\n');

export const FRAG_COPY_MASK = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_mask;',
  'uniform vec2 u_maskOrigin;',
  'uniform vec2 u_maskSize;',
  MASK_SAMPLE,
  'void main() {',
  '  float m = sampleMask(u_mask, v_uv, u_maskOrigin, u_maskSize);',
  '  gl_FragColor = vec4(m, 0.0, 0.0, 1.0);',
  '}'
].join('\n');

/* Tier 1: no solver at all. An analytically evaluated curl-noise flow field
   — divergence-free by construction, so it genuinely is a flow rather than
   a fake one. See the Stage/cast brief for why this beats a degraded
   64x64 Jacobi solve. */
export const FRAG_CURL = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_mask;',
  'uniform vec2  u_maskOrigin;',
  'uniform vec2  u_maskSize;',
  'uniform float u_aspect;',
  'uniform float u_time;',
  'uniform float u_strength;',
  'uniform float u_progress;',
  'uniform vec3  u_color;',
  'uniform float u_alpha;',
  NOISE,
  MASK_SAMPLE,
  'vec2 curl(vec2 p, float t) {',
  '  float e = 0.01;',
  '  float n1 = vnoise(vec2(p.x, p.y + e) + t * 0.11);',
  '  float n2 = vnoise(vec2(p.x, p.y - e) + t * 0.11);',
  '  float n3 = vnoise(vec2(p.x + e, p.y) + t * 0.11);',
  '  float n4 = vnoise(vec2(p.x - e, p.y) + t * 0.11);',
  '  return vec2(n1 - n2, n4 - n3) / (2.0 * e);',
  '}',
  'void main() {',
  '  vec2 p = vec2(v_uv.x * u_aspect, v_uv.y);',
  '  vec2 off = curl(p * 2.2, u_time) * u_strength * u_progress;',
  '  float m = sampleMask(u_mask, v_uv - off * 0.12, u_maskOrigin, u_maskSize);',
  '  gl_FragColor = vec4(u_color * m * u_alpha, m * u_alpha);',
  '}'
].join('\n');

