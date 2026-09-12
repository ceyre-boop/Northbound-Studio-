/* northlight-shaders.js — GLSL sources for the hero's aurora curtain.
 *
 * Sources are plain strings with a %DEFINES% placeholder, the same convention
 * js/gl/atomizer-shaders.js used: the host prepends a block of #defines at
 * build time so each device tier compiles a specialised shader with no
 * dynamic branching in the hot loop. Tier is decided once per session — a
 * mid-session recompile stalls the GL pipeline and you can see it happen.
 *
 * The design is one image: vertical filaments of light hanging in a dark
 * shaft, seen from inside. It has exactly two verbs. The cursor bends the
 * domain like a lens. Scroll velocity compresses the vertical axis so the
 * filaments stretch into streaks — motion blur out an elevator window. Every
 * reactive term displaces the domain; nothing is ever added on top as a
 * sprite, which is what keeps it reading as one material rather than as a
 * pile of effects.
 *
 * ES module, not a window.NB_* global: the Stage imports acts (and whatever
 * they import) as modules, and index.html — frozen for the duration of the
 * parallel build — no longer carries a <script> tag for this file. It is
 * consumed by js/acts/northlight.js via `import`.
 */

var VERT = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = a_pos * 0.5 + 0.5;',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

var FRAG = [
    '%DEFINES%',
    'precision highp float;',
    '',
    'varying vec2 v_uv;',
    '',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform vec2  u_cursor;      // 0..1, y-up, already smoothed by NB_MOTION',
    'uniform float u_cursorSpeed; // 0..1',
    'uniform float u_energy;      // scroll velocity, asymmetrically smoothed',
    'uniform float u_page;        // scrollY / innerHeight, clamped — hero fade',
    'uniform float u_scroll;      // whole-document progress 0..1',
    'uniform float u_floor;       // fractional floor index — per-floor seed',
    'uniform vec4  u_safe;        // measured text box: cx, cy, rx, ry (p-space)',
    'uniform float u_luma;        // hard luminance ceiling',
    'uniform float u_alpha;       // Stage cross-fade — 0..1, multiplies final colour',
    '',
    '/* Integer-ish hash. The sin() version is the classic, and it is also the',
    '   single most expensive line in a shader that evaluates noise per layer',
    '   per pixel. This costs a multiply and a fract. */',
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
    '}',
    '',
    'float fbm(vec2 p) {',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < OCTAVES; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }',
    '  return s;',
    '}',
    '',
    '/* One filament from a noise value: a ridge, sharpened. */',
    'float fil(float x, float sharp) {',
    '  return pow(max(1.0 - abs(fract(x) - 0.5) * 2.0, 0.0), sharp);',
    '}',
    '',
    'void main() {',
    '  float aspect = u_res.x / max(u_res.y, 1.0);',
    '  vec2  p = (v_uv - 0.5) * vec2(aspect, 1.0);',
    '  vec2  c = (u_cursor - 0.5) * vec2(aspect, 1.0);',
    '',
    '  vec2 q = p;',
    '  q.y += u_scroll * 0.85;                        // fall through the curtain',
    '',
    '#if CURSOR_LENS',
    '  vec2  dc = p - c;',
    '  float g  = 1.0 / (1.0 + dot(dc, dc) * 9.0);    // refraction, not a spotlight',
    '  q += normalize(dc + 1e-4) * g * (0.055 + 0.11 * u_cursorSpeed);',
    '#endif',
    '',
    '  q.y *= mix(1.0, 0.42, u_energy);               // fast scroll -> vertical streaks',
    '  q.x += 0.16 * sin(q.y * 1.25 + u_time * 0.10); // the curtain\'s own hang',
    '',
    '  /* Chromatic aberration as a phase offset on the filament, not as a',
    '     second and third evaluation of the whole field. Physically it is the',
    '     same story — each wavelength lands a hair off the others — and it',
    '     costs two extra pow() per layer instead of tripling the noise. */',
    '  float aberr = (dot(p, p) * 0.0055 + u_energy * 0.010) * 12.0;',
    '',
    '  vec3 col = vec3(0.0);',
    '  for (int i = 0; i < LAYERS; i++) {',
    '    float fi = float(i);',
    '    float k  = 1.0 + fi * 0.85;                  // depth of this sheet',
    '    vec2  qs = vec2(q.x * (1.9 * k) + fi * 13.7,',
    '                    q.y * 0.34 - u_time * (0.055 / k) + u_floor * 0.21);',
    '    float n     = fbm(qs) * 3.0;',
    '    float sharp = mix(8.0, 4.0, u_energy);       // speed blurs the filaments open',
    '',
    '#if CHROMA > 1',
    '    vec3 f = vec3(fil(n + aberr, sharp), fil(n, sharp), fil(n - aberr, sharp));',
    '#else',
    '    vec3 f = vec3(fil(n, sharp));',
    '#endif',
    '',
    '    /* This envelope is doing design work, not just masking: it puts the',
    '       curtain\'s brightest mass in a band below and behind the headline,',
    '       so peak luminance is never coincident with peak text density. */',
    '    float env  = smoothstep(-0.70, 0.05, q.y) * (1.0 - smoothstep(0.22, 0.85, q.y));',
    '    vec3  tint = mix(vec3(0.06, 0.10, 0.22), vec3(0.10, 0.86, 1.00),',
    '                     0.35 + 0.30 * fi);',
    '    col += tint * f * env * (0.42 / k);',
    '  }',
    '',
    '  /* Local text well. u_safe is the measured union box of the headline,',
    '     subhead and CTA row, so there are no per-breakpoint magic numbers. */',
    '  float dw = length((p - u_safe.xy) / max(u_safe.zw, vec2(1e-3)));',
    '  col *= 1.0 - 0.62 * smoothstep(1.2, 0.0, dw);',
    '',
    '  /* Past the hero the curtain stays, quieter. Not zero: losing the spiral',
    '     took away the only depth cue floors 02-07 had, and dead-flat #060608',
    '     below the fold would be a visible downgrade. */',
    '  float past = smoothstep(0.15, 1.0, u_page);',
    '  col *= mix(1.0, 0.26, past);',
    '',
    '#if GRAIN',
    '  col += (hash(v_uv * u_res + u_time * 60.0) - 0.5) * 0.022;',
    '#endif',
    '',
    '  /* The hard contract. Against #E8E8ED body text a 0.16 ceiling keeps',
    '     contrast above 12:1 no matter what the noise does. This is an',
    '     invariant, not a tuning value — no art pass may raise it. */',
    '  float cap  = u_luma * mix(1.0, 0.55, past);',
    '  float luma = dot(col, vec3(0.299, 0.587, 0.114));',
    '  if (luma > cap) col *= cap / max(luma, 1e-4);',
    '',
    '  /* Premultiplied alpha, to match the Stage baseline blend (ONE,',
    '     ONE_MINUS_SRC_ALPHA): both channels carry u_alpha so the seam into',
    '     Drift is a true cross-fade, not a colour that suddenly dims into a',
    '     wash of the destination act. */',
    '  col = max(col, 0.0) * u_alpha;',
    '  gl_FragColor = vec4(col, u_alpha);',
    '}'
  ].join('\n');

export { VERT, FRAG };
