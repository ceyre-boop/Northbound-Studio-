/* atomizer-shaders.js — GLSL for hero.js's particle mark.
 *
 * One vertex per particle, drawn with a single gl.drawArrays(POINTS, ...)
 * call — "instanced points," not a GPGPU ping-pong texture pair. Position is
 * a pure function of the current input state (cursor proximity/speed, scroll
 * velocity, time) with no simulation history to integrate, which is what
 * lets "reform" fall out for free: the moment inputs settle, disturb -> 0 and
 * every particle is already back at its home coordinate, no spring or decay
 * buffer required.
 *
 * Every particle's home position AND colour are sampled straight from a
 * rasterised render of brand/logo.svg + brand/wordmark.svg (see hero.js) —
 * the rim-light gradient and the single fringe segment those files already
 * carry come along for free, so the shader never invents a second colour
 * system on top of the one in css/tokens.css.
 *
 * Optional file, same as gl-core.js: hero.js embeds an identical inline copy
 * of both sources so a missing <script> tag here degrades to "hero.js is a
 * little bigger," never to a broken hero.
 */
(function () {
  'use strict';

  var VERT_SRC = [
    'attribute vec2 a_home;',     // design-space position, -1..1, y-up
    'attribute vec3 a_color;',    // colour sampled from the source art
    'attribute float a_alpha;',   // source alpha / "how lit" this pixel was
    'attribute vec3 a_rand;',     // per-particle seed: direction, phase, size

    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform float u_designAspect;', // rasterised composition's own w/h
    'uniform vec2 u_cursor;',        // 0..1, y-up (smoothed)
    'uniform float u_cursorSpeed;',  // 0..1
    'uniform float u_energy;',       // 0..1, scroll-velocity-driven agitation
    'uniform float u_dpr;',
    'uniform float u_pointBase;',    // base point size in CSS px

    'varying vec3 v_color;',
    'varying float v_alpha;',

    'void main() {',
    '  float viewportAspect = u_res.x / u_res.y;',
    // contain-fit the design composition into the viewport, centred, so it
    // never stretches regardless of hero aspect ratio
    '  vec2 fit = viewportAspect > u_designAspect',
    '    ? vec2(u_designAspect / viewportAspect, 1.0)',
    '    : vec2(1.0, viewportAspect / u_designAspect);',
    '  vec2 p = a_home * fit;',

    '  vec2 cursorP = (u_cursor - 0.5) * 2.0;',
    '  float d = distance(p, cursorP);',
    // proximity to a moving cursor kicks particles apart locally
    '  float localKick = u_cursorSpeed * exp(-d * d * 6.0);',
    // scroll-velocity energy disturbs particles in a staggered wave: each
    // particle's own random threshold decides how much energy it takes to
    // let go, so the whole mark doesn't pop at once
    '  float globalKick = smoothstep(a_rand.y * 0.6, 1.0, u_energy);',
    // dim/unlit-face pixels are "lighter" material and scatter first, the
    // same logic the identity already uses for which face recedes into void
    '  float mass = mix(1.5, 0.55, a_alpha);',
    '  float disturb = clamp((localKick + globalKick) * mass, 0.0, 1.6);',

    // a slow per-particle swirl, not a straight-line explosion — dust
    // unsettling and resettling, never fireworks
    '  float ang = a_rand.x * 6.28318 + u_time * (0.35 + a_rand.z * 0.55);',
    '  vec2 dir = vec2(cos(ang), sin(ang));',
    '  float radius = disturb * (0.09 + a_rand.z * 0.13);',
    // a tiny always-on breathing term so the resting mark is never a dead
    // static image — the same "held breath of light" the Buddy core uses
    '  float idle = 0.012 + 0.008 * sin(u_time * 0.6 + a_rand.x * 6.28318);',

    '  vec2 pos = p + dir * (radius + idle * mix(1.0, 0.4, a_alpha));',
    '  gl_Position = vec4(pos, 0.0, 1.0);',

    '  float size = u_pointBase * (0.55 + a_alpha * 0.85) * (1.0 - disturb * 0.32) * (0.8 + a_rand.z * 0.35);',
    '  gl_PointSize = max(1.0, size * u_dpr);',

    '  v_color = a_color;',
    '  v_alpha = a_alpha * mix(1.0, 0.55, min(disturb, 1.0));',
    '}'
  ].join('\n');

  var FRAG_SRC = [
    'precision mediump float;',
    'varying vec3 v_color;',
    'varying float v_alpha;',
    'uniform float u_luma;', // explicit cap, same contract field.js honours

    'void main() {',
    '  vec2 c = gl_PointCoord * 2.0 - 1.0;',
    '  float r = length(c);',
    '  float soft = smoothstep(1.0, 0.0, r);',   // soft circular sprite
    '  float core = smoothstep(0.35, 0.0, r) * 0.85;', // small bright centre
    '  vec3 col = v_color * (soft * 0.85 + core);',
    '  float a = v_alpha * soft;',
    '  float luma = dot(col, vec3(0.299, 0.587, 0.114));',
    '  if (luma > u_luma) col *= u_luma / max(luma, 0.0001);',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  window.NB_ATOMIZER_SHADERS = { vert: VERT_SRC, frag: FRAG_SRC };
})();
