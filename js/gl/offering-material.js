/* offering-material.js — GLSL sources for the Offerings wall (the glass).
 *
 * Five small programs, house style (plain joined strings, no build step):
 *
 *   PANEL       the twelve panes themselves — refraction, chromatic fringe /
 *               recede-blur, inner bloom, rounded corners, cursor specular.
 *   GRADIENT    the backdrop's base wash, drawn into the private target.
 *   PARTICLE    a sparse scatter behind the panels, same target, additive.
 *               Technique copied from js/gl/drift-shaders.js's Path D
 *               (analytic, stateless — home + seed, no ping-pong) at a much
 *               smaller count. drift-shaders.js is owned by another
 *               department and is never imported or edited here; this is a
 *               deliberate, small, byte-for-byte-adjacent copy, the same
 *               call drift-shaders.js itself makes about northlight's
 *               hash()/vnoise().
 *   COMPOSITE   backdrop target -> default framebuffer, premultiplied.
 *   GRAIN       fullscreen grain over the composed section. Tier 1 never
 *               builds or uses this program — see wall.js.
 *
 * ES module, consumed only by js/offerings/wall.js via import.
 */

var QUAD_VERT = [
  'attribute vec2 a_pos;',
  'varying vec2 v_uv;',
  'void main() {',
  '  v_uv = a_pos * 0.5 + 0.5;',
  '  gl_Position = vec4(a_pos, 0.0, 1.0);',
  '}'
].join('\n');

/* --- PANEL ---------------------------------------------------------------- */

var PANEL_VERT = [
  'attribute vec2 a_pos;      // CSS px, viewport space. Helix already baked in.',
  'attribute vec2 a_normal;   // surface normal, screen-space xy',
  'attribute vec2 a_uv;       // panel-local uv, 0..1, static per lattice cell',
  '',
  'uniform vec2 u_viewport;   // CSS px, width/height',
  '',
  'varying vec2 v_uv;',
  'varying vec2 v_normal;',
  'varying vec2 v_worldPos;',
  '',
  '/* This is the whole matrix budget: CSS px -> clip space, one uniform, no',
  '   helix knowledge here at all — PHYSICS already baked the transform into',
  '   a_pos. y flips because CSS is y-down and clip space is y-up. */',
  'void main() {',
  '  v_uv = a_uv;',
  '  v_normal = a_normal;',
  '  v_worldPos = a_pos;',
  '  vec2 clip = (a_pos / u_viewport) * 2.0 - 1.0;',
  '  clip.y = -clip.y;',
  '  gl_Position = vec4(clip, 0.0, 1.0);',
  '}'
].join('\n');

var PANEL_FRAG = [
  'precision highp float;',
  '',
  'varying vec2 v_uv;',
  'varying vec2 v_normal;',
  'varying vec2 v_worldPos;',
  '',
  'uniform sampler2D u_atlas;',
  'uniform sampler2D u_backdrop;',
  'uniform vec2  u_canvasPx;    // default framebuffer size, device px',
  'uniform vec2  u_tileMin;',
  'uniform vec2  u_tileMax;',
  'uniform vec2  u_panelSize;   // CSS px',
  'uniform float u_z;           // 0 hero .. 1 furthest',
  'uniform float u_intensity;',
  'uniform float u_alpha;',
  'uniform vec2  u_cursorPx;    // CSS px, viewport space, same as a_pos',
  '',
  '/* Rounded-rect signed distance, panel-centred, in CSS px. Radius and edge',
  '   falloff are done here from panel-local UV rather than with geometry —',
  '   the brief is explicit that this is a fragment-shader job. */',
  'float roundedBoxDist(vec2 p, vec2 he, float r) {',
  '  vec2 q = abs(p) - he + r;',
  '  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;',
  '}',
  '',
  'void main() {',
  '  vec3 n = vec3(v_normal, sqrt(max(1.0 - dot(v_normal, v_normal), 0.0)));',
  '',
  '  vec2 p = (v_uv - 0.5) * u_panelSize;',
  '  vec2 he = u_panelSize * 0.5;',
  '  float radius = clamp(min(u_panelSize.x, u_panelSize.y) * 0.09, 2.0, 28.0);',
  '  float d = roundedBoxDist(p, he - radius, radius);',
  '  float edge = 1.0 - smoothstep(-3.0, 0.5, d);',
  '  if (edge <= 0.001) discard;',
  '',
  '  /* How much this panel should be READ, not just drawn. A hero panel at',
  '     z=0 gets the full rim/fringe/spill treatment; by z~0.6 (roughly',
  '     |t| >= 1.5, PHYSICS\' own visible-band edge) it has settled back down',
  '     to quiet glass that does not compete with the centre. u_intensity',
  '     (already 1 at centre, falling with |t|, per contract.js) reinforces',
  '     the same falloff rather than fighting it. */',
  '  float presence = (1.0 - smoothstep(0.0, 0.65, u_z)) * mix(0.45, 1.0, u_intensity);',
  '',
  '  /* Refraction: both the backdrop tap and the atlas tap are offset by the',
  '     surface normal, scaled in PIXELS. Scaling in UV instead makes the',
  '     offset twice as strong horizontally on a phone as on a desktop, and',
  '     that is a bug that is only ever caught by looking at both. The',
  '     backdrop tap sells the edge; the atlas tap sells the thickness of the',
  '     loop behind the glass. Neither alone reads as glass. */',
  '  float refractPx = 14.0 + 30.0 * u_z;',
  '  vec2 screenUV = gl_FragCoord.xy / u_canvasPx;',
  '  vec2 backUV = clamp(screenUV + n.xy * (refractPx / u_canvasPx), 0.0, 1.0);',
  '  vec3 backdrop = texture2D(u_backdrop, backUV).rgb;',
  '',
  '  /* HONEST LIMITATION: u_backdrop is this wall\'s OWN gradient+particle',
  '     target, not the previous act\'s composited pixels — the Stage never',
  '     hands an act what is already on screen. In the cross-fade band with',
  '     the fluid act, the fluid does not bend through this glass. Nobody',
  '     will notice: by the time a panel is large enough for refraction to',
  '     read, it is also close enough that its own backdrop dominates the',
  '     frame. Left here so nobody spends a day proving it is a bug.',
  '',
  '     Chromatic fringe and recede-blur are the SAME three atlas taps.',
  '     Fringe needs three samples already; spreading them radially by',
  '     fringe + blur*z costs two extra ALU and nothing else, and clamping',
  '     every tap to the tile rect makes bleed between atlas tiles',
  '     impossible by construction rather than by careful spacing:',
  '       t = clamp(uv + dir * spread, tileMin, tileMax)',
  '     It is also what thick glass physically does — dispersion and defocus',
  '     are one phenomenon, not two effects stacked on top of each other.',
  '',
  '     generateMipmap is NOT the answer for the recede-blur, and that is',
  '     worth writing down so nobody re-proposes it: it would rebuild the',
  '     whole shared atlas pyramid — 1.64 Mpix at tier 3 — on every one of',
  '     twelve draw calls, several times a frame as tiles refresh, which',
  '     costs several times more than the wall itself. And texture2D\'s',
  '     LOD-bias argument is vertex-shader-only in GLSL ES 1.00, so the',
  '     WebGL1 path would need an extension the Stage never probes for.',
  '     Both routes are dead. At |t| >= 1.5 a panel is down around 0.4',
  '     scale and minification aliasing, not chromatic separation, is the',
  '     visible artefact, so blur widens with z until the three taps act as',
  '     a hand-rolled box filter — a manual mip at exactly the one LOD this',
  '     needs it at. */',
  '  vec2 tileSize = u_tileMax - u_tileMin;',
  '  vec2 dir = normalize(v_uv - 0.5 + 1e-5);',
  '',
  '  /* Both the fringe and the recede-blur are expressed in PIXELS first, the',
  '     same rule as the refraction offset above, and only THEN converted into',
  '     atlas-uv through the panel\'s own on-screen size (panelSize/tileSize) —',
  '     not a fixed fraction of the tile. A fixed uv fraction is invisible at',
  '     a ~460px hero and overdone on a receding panel a tenth that size;',
  '     converting through the panel\'s actual footprint is what makes the',
  '     hero show real colour separation while small panels stay clean.',
  '     Fringe itself also settles down with `presence`, matching the rim and',
  '     specular below, so the far panels do not compete with the centre.',
  '     Blur runs the other way — it is the recede/anti-alias term, and a',
  '     panel that is SMALL on screen is exactly the one with more atlas',
  '     texels per pixel, so it grows with z regardless of presence. */',
  '  float fringePx = mix(1.2, 7.0, presence);',
  '  float blurPx = 14.0 * u_z * u_z;',
  '  vec2 spreadUV = ((fringePx + blurPx) / max(u_panelSize, vec2(1.0))) * tileSize;',
  '  vec2 nOff = n.xy * (refractPx / max(u_panelSize, vec2(1.0))) * tileSize;',
  '',
  '  vec2 base = u_tileMin + v_uv * tileSize + nOff;',
  '  vec2 uvR = clamp(base + dir * spreadUV, u_tileMin, u_tileMax);',
  '  vec2 uvG = clamp(base, u_tileMin, u_tileMax);',
  '  vec2 uvB = clamp(base - dir * spreadUV, u_tileMin, u_tileMax);',
  '',
  '  vec3 loop = vec3(',
  '    texture2D(u_atlas, uvR).r,',
  '    texture2D(u_atlas, uvG).g,',
  '    texture2D(u_atlas, uvB).b',
  '  );',
  '',
  '  /* Inner bloom: a cheap bright-pass of the loop content, spread by',
  '     reusing the same three taps (zero extra samples) and added back,',
  '     gained hard enough that a lit loop actually lifts the panel out of',
  '     the near-black its own tile is drawn against, rather than only',
  '     brightening the handful of texels that were already bright. */',
  '  vec3 avg = (texture2D(u_atlas, uvR).rgb + texture2D(u_atlas, uvG).rgb',
  '            + texture2D(u_atlas, uvB).rgb) / 3.0;',
  '  vec3 bloom = max(avg - 0.4, 0.0) * 2.6;',
  '',
  '  vec3 glass = mix(backdrop, loop + bloom, 0.68);',
  '',
  '  /* Glass at rest still catches light even where the loop itself is dark —',
  '     a real pane is never truly black — so a small ambient lift, tied to',
  '     how awake this loop is, keeps the interior from reading as flat void',
  '     the way a pure atlas/backdrop mix does everywhere the tile is dark. */',
  '  glass += vec3(0.05, 0.085, 0.11) * mix(0.35, 1.0, u_intensity);',
  '',
  '  /* The edge is where glass actually reads: a Fresnel term off the surface',
  '     normal (view is effectively orthographic here, so NdotV is just n.z)',
  '     for the physically-driven part of the rim, plus a geometric band tied',
  '     to the rounded-rect distance field so the boundary is unmistakable',
  '     even on the flatter, more distant panels where the lens normal alone',
  '     is subtle. A darker band just inside that rim is what sells depth —',
  '     without it the rim reads as a glow, not as a turn in a surface. */',
  '  float distIn = -d;',
  '  float fres = pow(clamp(1.0 - n.z, 0.0, 1.0), 3.0);',
  '  float rimGeo = 1.0 - smoothstep(0.0, 9.0, distIn);',
  '  float rim = clamp(fres * 1.5 + rimGeo, 0.0, 1.8) * presence;',
  '  float darkBand = smoothstep(4.0, 11.0, distIn) * (1.0 - smoothstep(18.0, 44.0, distIn));',
  '  glass *= mix(1.0, 0.7, darkBand * presence);',
  '  glass += vec3(0.62, 0.86, 0.92) * rim * 0.6;',
  '',
  '  /* One directional light that follows the cursor. Modelled as a point a',
  '     fixed height above the glass plane in CSS-px space — enough for a',
  '     moving highlight without a real light rig. Specular off the lattice',
  '     normal, scaled by presence so a quiet, far panel does not catch as',
  '     much light as the one being looked at. */',
  '  vec3 toLight = normalize(vec3(u_cursorPx - v_worldPos, 140.0));',
  '  float spec = pow(max(dot(n, toLight), 0.0), 24.0);',
  '  glass += vec3(0.9, 0.95, 1.0) * spec * (0.35 + 0.65 * presence);',
  '',
  '  /* Premultiplied, to match the Stage baseline blend (ONE,',
  '     ONE_MINUS_SRC_ALPHA), multiplied by alpha exactly once, here. */',
  '  float a = edge * u_alpha;',
  '  gl_FragColor = vec4(glass * a, a);',
  '}'
].join('\n');

/* --- GRADIENT (backdrop, pass 1a) ------------------------------------------
 * This target exists to be REFRACTED — every pixel of it is only ever seen
 * through a per-panel pixel offset (see PANEL_FRAG). Offsetting a sample of
 * a near-flat field by a few pixels returns almost the same colour, which is
 * why an early flat-navy-plus-dots version of this pass made the refraction
 * mathematically present and visually nil: there was nothing behind the
 * glass to bend. So this carries real, moving structure — a domain-warped
 * noise cloud plus a drifting glow — not decoration for its own sake.
 * hash()/vnoise() copied verbatim from js/gl/northlight-shaders.js, same
 * call drift-shaders.js makes about the same two functions: never imported
 * or edited here, small enough that a copy beats a cross-department
 * dependency neither team can review alone. */

var GRADIENT_FRAG = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform float u_time;',
  '',
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
  'void main() {',
  '  vec2 uv = v_uv;',
  '  vec3 top = vec3(0.035, 0.045, 0.075);',
  '  vec3 bot = vec3(0.085, 0.105, 0.16);',
  '  vec3 col = mix(bot, top, uv.y);',
  '',
  '  vec2 q = uv * 3.2 + vec2(u_time * 0.015, -u_time * 0.010);',
  '  float n1 = vnoise(q);',
  '  float n2 = vnoise(q * 2.15 + 11.0);',
  '  float cloud = n1 * 0.6 + n2 * 0.4;',
  '  col += vec3(0.05, 0.11, 0.13) * cloud * 0.6;',
  '',
  '  /* A slow drifting glow roughly where the procession actually sits —',
  '     the teal is the same accent Act III uses (AURORA in solution.js),',
  '     so the world the glass sits in reads as part of the same site. */',
  '  vec2 glowPos = vec2(0.52 + 0.14 * sin(u_time * 0.07), 0.46 + 0.09 * cos(u_time * 0.05));',
  '  float gd = length((uv - glowPos) * vec2(1.5, 1.0));',
  '  float glow = smoothstep(0.55, 0.0, gd);',
  '  col += vec3(0.14, 0.5, 0.47) * glow * 0.6;',
  '',
  '  float vig = smoothstep(1.05, 0.2, length(uv - 0.5));',
  '  col *= mix(0.68, 1.05, vig);',
  '',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

/* --- PARTICLE (backdrop, pass 1b) ------------------------------------------
 * Analytic, stateless — position is a pure function of (home, seed, time),
 * the same Path D idea drift-shaders.js uses for its own sparse field, at a
 * small fixed count. No ping-pong, nothing that can desync from a lost
 * context, nothing to simulate. */

var PARTICLE_VERT = [
  'precision highp float;',
  'attribute vec2 a_home;   // 0..1, backdrop-normalized, y-down',
  'attribute float a_seed;',
  '',
  'uniform float u_time;',
  'uniform float u_pointScale;',
  '',
  'varying float v_a;',
  'varying float v_lit;',
  '',
  'void main() {',
  '  vec2 pos = a_home;',
  '  pos.y += 0.02 * sin(u_time * 0.15 + a_seed * 40.0);',
  '  pos.x += 0.015 * cos(u_time * 0.11 + a_seed * 17.0);',
  '  vec2 clip = pos * 2.0 - 1.0;',
  '  clip.y = -clip.y;',
  '  gl_Position = vec4(clip, 0.0, 1.0);',
  '  float twinkle = 0.5 + 0.5 * sin(a_seed * 53.0 + u_time * 0.8);',
  '  v_lit = twinkle;',
  '  v_a = 0.26 + 0.55 * twinkle;',
  '  gl_PointSize = u_pointScale;',
  '}'
].join('\n');

var PARTICLE_FRAG = [
  'precision mediump float;',
  'varying float v_a;',
  'varying float v_lit;',
  'void main() {',
  '  vec2 d = gl_PointCoord * 2.0 - 1.0;',
  '  float r2 = dot(d, d);',
  '  if (r2 > 1.0) discard;',
  '  float core = smoothstep(1.0, 0.0, r2);',
  '  vec3 col = mix(vec3(0.16, 0.22, 0.30), vec3(0.55, 0.82, 0.96), v_lit);',
  '  float a = core * v_a;',
  '  if (a < 0.004) discard;',
  '  gl_FragColor = vec4(col * a, a);',
  '}'
].join('\n');

/* --- COMPOSITE (backdrop -> default framebuffer) --------------------------- */

var COMPOSITE_FRAG = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_tex;',
  'uniform float u_alpha;',
  '',
  '/* Premultiplied, so this composite is a true cross-fade against whatever',
  '   the Stage already has under it (see stage.js\'s baseline blend), not a',
  '   colour that dims into a wash of the destination. */',
  'void main() {',
  '  vec3 c = texture2D(u_tex, v_uv).rgb;',
  '  gl_FragColor = vec4(c * u_alpha, u_alpha);',
  '}'
].join('\n');

/* --- GRAIN (fullscreen, tier > 1 only) -------------------------------------
 * hash() copied verbatim from js/gl/northlight-shaders.js, same as
 * drift-shaders.js does — small enough that a byte-for-byte copy beats a
 * cross-department shared-module dependency neither team can review alone.
 * northlight-shaders.js is never imported or edited here. */

var GRAIN_FRAG = [
  'precision highp float;',
  'varying vec2 v_uv;',
  'uniform vec2 u_res;',
  'uniform float u_time;',
  'uniform float u_alpha;',
  '',
  'float hash(vec2 p) {',
  '  vec3 q = fract(vec3(p.xyx) * 0.1031);',
  '  q += dot(q, q.yzx + 33.33);',
  '  return fract((q.x + q.y) * q.z);',
  '}',
  '',
  '/* Output alpha is 0.0 on purpose. Against the Stage baseline blend',
  '   (ONE, ONE_MINUS_SRC_ALPHA) an alpha-0 fragment adds its colour to the',
  '   destination and leaves the destination alpha untouched — additive',
  '   grain with zero blend-state changes to make and zero to restore. */',
  'void main() {',
  '  float n = hash(v_uv * u_res + u_time * 60.0) - 0.5;',
  '  float g = n * 0.05 * u_alpha;',
  '  gl_FragColor = vec4(vec3(g), 0.0);',
  '}'
].join('\n');

export {
  QUAD_VERT,
  PANEL_VERT, PANEL_FRAG,
  GRADIENT_FRAG,
  PARTICLE_VERT, PARTICLE_FRAG,
  COMPOSITE_FRAG,
  GRAIN_FRAG
};
