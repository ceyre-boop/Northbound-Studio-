/* js/gl/offering-loops.js — MOTION: twelve abstract GLSL loops.
 *
 * Twelve fragment sources, one shared vertex shader, one "prime" fragment
 * shader that paints a static gradient so a tile is never black before its
 * real loop program exists (see atlas.js's lazy-compile gate).
 *
 * u_t is the loop's 0..1 phase and MUST be seamless: value AND first
 * derivative continuous across the t=1 -> t=0 wrap. Every loop below is
 * built only from sin()/cos() of `ang = 2*PI*u_t` (or a constant-shifted
 * copy of it) and from vnoise() sampled at a position that is itself a
 * function of sin(ang)/cos(ang) — never from `t` or `ang` directly inside a
 * fract()/mix() ramp, which is what produces a sawtooth and therefore a
 * once-per-loop hitch. No component has a period shorter than 250ms: at the
 * far band's 6th-frame refresh and a typical 60fps monitor that is a hard
 * floor of ~36 refreshed frames per apparent second of loop content, and
 * every oscillator here is 1-3 cycles per full loop, nowhere near that
 * floor.
 *
 * hash()/vnoise() are copied verbatim from js/gl/northlight-shaders.js per
 * the brief, so the loops share the aurora's grain. That file is owned by
 * another department and is never imported or edited here.
 *
 * Palette, shared with the aurora's family:
 *   ink   #05090C .. #0A1218   deep ground
 *   cyan  #4FD8C4              accent
 *   warm  #E0A05C              one warm signal, used sparingly
 *
 * Budget: ~1.2KB of unique authored GLSL per loop body, ~16KB for all
 * twelve. The PRELUDE (hash/vnoise/palette/main wrapper) is shared text
 * repeated once per compiled program, same as any single-file shader would
 * repeat its own boilerplate; it is not counted against a loop's own budget
 * below because it is not creative surface, it is scaffolding.
 */

var PRELUDE = [
  'precision mediump float;',
  'varying vec2 v_uv;',
  'uniform float u_t;',
  'uniform float u_intensity;',
  'uniform vec2 u_res;',
  '#define PI 3.14159265359',
  '',
  /* --- copied verbatim from js/gl/northlight-shaders.js, do not edit there --- */
  'float hash(vec2 p) {',
  '  vec3 q = fract(vec3(p.xyx) * 0.1031);',
  '  q += dot(q, q.yzx + 33.33);',
  '  return fract((q.x + q.y) * q.z);',
  '}',
  'float vnoise(vec2 p) {',
  '  vec2 i = floor(p), f = fract(p);',
  '  vec2 u = f * f * (3.0 - 2.0 * f);',
  '  float a = hash(i);',
  '  float b = hash(i + vec2(1.0, 0.0));',
  '  float c = hash(i + vec2(0.0, 1.0));',
  '  float d = hash(i + vec2(1.0, 1.0));',
  '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
  '}',
  /* --- end verbatim block --- */
  '',
  'vec3 ink(float k) {',
  '  return mix(vec3(0.0196, 0.0353, 0.0471), vec3(0.0392, 0.0706, 0.0941), k);',
  '}',
  'vec3 CYAN = vec3(0.3098, 0.8471, 0.7686);',
  'vec3 WARM = vec3(0.8784, 0.6275, 0.3608);',
  ''
].join('\n');

var MAIN = [
  '',
  'void main() {',
  '  float aspect = u_res.x / max(u_res.y, 1.0);',
  '  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0);',
  '  float ang = 2.0 * PI * u_t;',
  '  vec3 col = loop(p, ang, u_t, u_intensity);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

function wrap(body) {
  return PRELUDE + body + MAIN;
}

/** The shared vertex shader. Every loop program and the prime program link
 *  against this same source. */
export var VERT = [
  'attribute vec2 a_pos;',
  'varying vec2 v_uv;',
  'void main() {',
  '  v_uv = a_pos * 0.5 + 0.5;',
  '  gl_Position = vec4(a_pos, 0.0, 1.0);',
  '}'
].join('\n');

/* The prime pass. Cheap, compiled once at create(), paints every tile with a
 * per-tile static gradient (via u_seed) so no tile is ever black before its
 * real loop program exists. No time dependence at all — it is a placeholder,
 * not a thirteenth loop. */
export var PRIME_FRAG = [
  'precision mediump float;',
  'varying vec2 v_uv;',
  'uniform float u_seed;',
  'void main() {',
  '  vec3 lo = vec3(0.0196, 0.0353, 0.0471);',
  '  vec3 hi = vec3(0.0392, 0.0706, 0.0941);',
  '  vec3 cyan = vec3(0.3098, 0.8471, 0.7686);',
  '  float k = fract(u_seed * 0.61803399);',
  '  vec3 base = mix(lo, hi, v_uv.y * 0.6 + 0.2);',
  '  base += cyan * 0.05 * (1.0 - v_uv.y) * k;',
  '  gl_FragColor = vec4(base, 1.0);',
  '}'
].join('\n');

/* --- the twelve loop bodies ------------------------------------------------
 * Each defines `vec3 loop(vec2 p, float ang, float t, float I)`. p is tile
 * space, aspect-corrected, roughly [-0.5, 0.5] on the short axis (tiles are
 * square so both axes). One line of `content.js`'s `loop` brief precedes
 * each, so copy and animation cannot drift apart. */

var BODIES = [
  /* 01 site — Scattered rule-lines drifting, then assembling into a grid that holds */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  float conv = smoothstep(0.15, 0.9, 0.5 + 0.5 * cos(ang));',
    '  vec3 col = ink(0.0);',
    '  for (int i = 0; i < 6; i++) {',
    '    float fi = float(i);',
    '    vec2 c = vec2(cos(ang + fi * 1.7), sin(ang + fi * 1.7));',
    '    float jitter = (vnoise(c * 2.0 + fi * 9.0) - 0.5) * 0.8;',
    '    float gridY = (fi / 6.0 - 0.5) * 0.8;',
    '    float y = mix(jitter, gridY, conv);',
    '    float line = smoothstep(0.03, 0.0, abs(p.y - y));',
    '    col += mix(CYAN, WARM, 0.15) * line * (0.35 + 0.65 * conv) * (0.5 + 0.5 * I);',
    '  }',
    '  return col;',
    '}'
  ],
  /* 02 brand — Three marks resolving out of noise and settling into one lockup */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  float settle = 0.5 + 0.5 * cos(ang);',
    '  vec3 col = ink(0.2);',
    '  for (int i = 0; i < 3; i++) {',
    '    float fi = float(i);',
    '    float a2 = ang + fi * 2.0943951;',
    '    vec2 orbit = vec2(cos(a2), sin(a2)) * 0.22 * (1.0 - settle);',
    '    vec2 c = mix(orbit, vec2(0.0), settle);',
    '    float d = length(p - c);',
    '    float n = vnoise(p * 3.0 + vec2(cos(ang), sin(ang)) * 2.0 + fi * 5.0);',
    '    float mark = smoothstep(0.20, 0.0, d) * mix(n, 1.0, settle);',
    '    col += mix(CYAN, WARM, fi * 0.4) * mark * (0.4 + 0.6 * I);',
    '  }',
    '  return col;',
    '}'
  ],
  /* 03 booking — Time slots locking into a grid, one of them turning solid */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.1);',
    '  vec2 g = p * 4.0;',
    '  vec2 cell = floor(g);',
    '  vec2 f = fract(g) - 0.5;',
    '  float id = hash(cell);',
    '  float phase = ang + id * 2.0 * PI;',
    '  float pulse = pow(0.5 + 0.5 * cos(phase), 6.0);',
    '  float boxd = max(abs(f.x), abs(f.y));',
    '  float edge = smoothstep(0.48, 0.40, boxd) - smoothstep(0.40, 0.30, boxd);',
    '  vec3 slot = mix(CYAN * 0.3, WARM, pulse);',
    '  col += edge * slot * (0.4 + 0.6 * I);',
    '  return col;',
    '}'
  ],
  /* 04 quote — A wide range converging inward until it resolves to one figure */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  float conv = 0.5 + 0.5 * cos(ang);',
    '  vec3 col = ink(0.05);',
    '  float spread = mix(0.02, 0.42, 1.0 - conv);',
    '  for (int i = 0; i < 5; i++) {',
    '    float fi = float(i);',
    '    float r = abs((fi / 5.0 - 0.5) * 2.0) * spread;',
    '    float ring = smoothstep(0.035, 0.0, abs(length(p) - r - 0.02));',
    '    col += mix(CYAN, WARM, 0.3) * ring * (0.3 + 0.7 * conv) * (0.4 + 0.6 * I);',
    '  }',
    '  return col;',
    '}'
  ],
  /* 05 payments — A value pulse travelling along a line and resolving at the end */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  float lineMask = smoothstep(0.02, 0.0, abs(p.y));',
    '  col += lineMask * vec3(0.05, 0.09, 0.11);',
    '  float x = 0.40 * cos(ang);',
    '  float d = abs(p.x - x);',
    '  float pulse = smoothstep(0.10, 0.0, d);',
    '  float resolve = smoothstep(0.55, 0.85, abs(cos(ang)));',
    '  vec3 pcol = mix(CYAN, WARM, resolve);',
    '  col += pcol * pulse * (0.5 + 0.5 * I) * lineMask;',
    '  col += lineMask * CYAN * 0.15 * smoothstep(0.5, 0.0, d) * (0.3 + 0.7 * I);',
    '  return col;',
    '}'
  ],
  /* 06 leads — Drifting motes caught and held by a soft field */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  for (int i = 0; i < 8; i++) {',
    '    float fi = float(i);',
    '    float a2 = ang + fi * 0.7853981634;',
    '    vec2 c = vec2(cos(a2 * 2.0 + fi), sin(a2 * 3.0 + fi * 2.0)) * 0.4;',
    '    vec2 pos = mix(c, c * 0.15, 0.3 + 0.5 * I);',
    '    float d = length(p - pos);',
    '    float mote = smoothstep(0.05, 0.0, d);',
    '    col += mix(CYAN, WARM, fract(fi * 0.37)) * mote * 0.8;',
    '  }',
    '  return col;',
    '}'
  ],
  /* 07 followup — A signal chasing a thread until it catches and lands */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  float wave = sin(p.x * 6.0 + ang) * 0.20;',
    '  float threadMask = smoothstep(0.02, 0.0, abs(p.y - wave));',
    '  col += threadMask * vec3(0.05, 0.09, 0.10);',
    '  float sx = cos(ang) * 0.40;',
    '  float sy = sin(sx * 6.0 + ang) * 0.20;',
    '  float d = length(p - vec2(sx, sy));',
    '  float glow = smoothstep(0.09, 0.0, d);',
    '  col += mix(CYAN, WARM, 0.4) * glow * (0.5 + 0.5 * I);',
    '  return col;',
    '}'
  ],
  /* 08 reminders — A slow orbit crossing a threshold and flaring as it passes */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  vec2 orbitPos = vec2(cos(ang), sin(ang) * 0.6) * 0.40;',
    '  float d = length(p - orbitPos);',
    '  float body = smoothstep(0.06, 0.0, d);',
    '  float ring = smoothstep(0.02, 0.0, abs(length(p) - 0.40));',
    '  float flare = pow(max(0.0, cos(ang)), 8.0);',
    '  col += ring * CYAN * 0.12 * (0.3 + 0.7 * I);',
    '  col += body * mix(CYAN, WARM, 0.5) * (0.6 + 0.4 * I);',
    '  col += body * WARM * flare * 0.6;',
    '  return col;',
    '}'
  ],
  /* 09 reviews — A star figure completing itself one stroke at a time */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  float aRaw = atan(p.y, p.x);',
    '  float a = aRaw - ang * 0.2;',
    '  float r = length(p);',
    '  float star = cos(a * 5.0);', // coeff of ang here is 5*0.2 = 1.0, integer: seamless
    '  float points = 0.30 + 0.10 * star;',
    '  float ringMask = smoothstep(0.025, 0.0, abs(r - points));',
    '  float complete = 0.5 + 0.5 * cos(ang);',
    // angNorm is spatial only (aRaw, not `a`) so it carries no dependence on
    // ang at all, which is what keeps the sweep boundary seamless: `a`
    // itself is only ever consumed through the *5.0 above.
    '  float angNorm = fract((aRaw + PI) / (2.0 * PI));',
    '  float drawn = smoothstep(complete + 0.02, complete - 0.02, angNorm);',
    '  col += ringMask * drawn * mix(CYAN, WARM, 0.3) * (0.4 + 0.6 * I);',
    '  return col;',
    '}'
  ],
  /* 10 dashboard — Metrics settling into bars, then breathing */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  for (int i = 0; i < 5; i++) {',
    '    float fi = float(i);',
    '    float x = (fi / 5.0 - 0.4) * 0.8;',
    '    float h = 0.15 + 0.20 * (0.5 + 0.5 * sin(fi * 2.1));',
    '    float breathe = 0.06 * sin(ang * 2.0 + fi * 1.3);',
    '    float hh = h + breathe * I;',
    '    float bar = smoothstep(0.06, 0.0, abs(p.x - x))',
    '      * step(p.y, -0.5 + hh) * step(-0.5, p.y);',
    '    col += bar * mix(CYAN, WARM, fi * 0.2) * (0.5 + 0.5 * I);',
    '  }',
    '  return col;',
    '}'
  ],
  /* 11 seo — A pin pulling attention inward from the edges of the frame */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  float pull = 0.5 + 0.5 * cos(ang);',
    '  for (int i = 0; i < 6; i++) {',
    '    float fi = float(i);',
    '    float a2 = fi * 1.0471975512;',
    '    vec2 edge = vec2(cos(a2), sin(a2)) * 0.42;',
    '    vec2 pos = mix(edge, vec2(0.0, 0.05), pull);',
    '    float d = length(p - pos);',
    '    float mote = smoothstep(0.05, 0.0, d);',
    '    col += mote * mix(CYAN, WARM, 0.2) * (0.4 + 0.6 * I);',
    '  }',
    '  float pind = length(p - vec2(0.0, 0.05));',
    '  col += smoothstep(0.08, 0.0, pind) * WARM * pull * (0.5 + 0.5 * I);',
    '  return col;',
    '}'
  ],
  /* 12 intake — A question folding into an answer and unfolding again */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  float fold = cos(ang);',
    '  vec2 q = p;',
    '  q.x *= mix(1.0, 0.15, abs(fold));',
    '  float d = length(q);',
    '  float shape = smoothstep(0.40, 0.34, d) - smoothstep(0.34, 0.28, d);',
    '  float hue = 0.5 + 0.5 * sin(ang);',
    '  col += shape * mix(CYAN, WARM, hue) * (0.4 + 0.6 * I);',
    '  return col;',
    '}'
  ]
];

/** Full fragment source for loop `index` (0..11), lazily built on demand. */
export function loopSource(index) {
  return wrap(BODIES[index].join('\n'));
}

export var COUNT = BODIES.length;
