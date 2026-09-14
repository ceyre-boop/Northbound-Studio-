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
  '',
  /* The intensity ramp every loop drives its accent brightness through. Not
   * a straight lerp: the floor (0.12) keeps a far/idle panel legibly quiet
   * rather than dead, and the ceiling (1.72) is deliberately past 1.0 — the
   * fragment write clamps on the way into the RGBA8 atlas, so the hero panel
   * saturates its brightest pixels to genuine white-hot rather than merely
   * approaching it. u_intensity never touches a trig argument, only this, so
   * it cannot affect seamlessness: the seam test fixes I and only varies u_t. */
  'float drive(float I) { return 0.12 + 1.60 * I; }',
  '',
  /* --- shape vocabulary -------------------------------------------------
   * The first pass at these twelve was twelve abstractions, and an
   * abstraction is a poor salesman: a visitor looking at "booking flow" got
   * a pulsing grid that could equally have been anything else on the list.
   * Each loop now draws the THING — a page assembling, a slot filling, a
   * star being earned — which needs real shapes rather than more noise.
   *
   * These are the standard analytic distance fields, kept here rather than
   * open-coded twelve times. Everything below returns a signed or unsigned
   * distance in tile space; `stroke` and `fill` turn one into coverage. */
  'float sdSeg(vec2 p, vec2 a, vec2 b) {',
  '  vec2 pa = p - a, ba = b - a;',
  '  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);',
  '  return length(pa - ba * h);',
  '}',
  'float sdBox(vec2 p, vec2 b) {',
  '  vec2 d = abs(p) - b;',
  '  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);',
  '}',
  /* iq's five-pointed star, the standard construction: two reflections put
     any point into one tenth of the figure, then it is a segment distance. */
  'float sdStar5(vec2 p, float r, float rf) {',
  '  const vec2 k1 = vec2(0.809016994375, -0.587785252292);',
  '  const vec2 k2 = vec2(-0.809016994375, -0.587785252292);',
  '  p.x = abs(p.x);',
  '  p -= 2.0 * max(dot(k1, p), 0.0) * k1;',
  '  p -= 2.0 * max(dot(k2, p), 0.0) * k2;',
  '  p.x = abs(p.x);',
  '  p.y -= r;',
  '  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);',
  '  float h = clamp(dot(p, ba) / max(dot(ba, ba), 1e-5), 0.0, r);',
  '  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);',
  '}',
  /* A map pin: a disc with a cone hanging off the bottom of it. */
  'float sdPin(vec2 p, float r) {',
  '  float head = length(p - vec2(0.0, r * 0.55)) - r;',
  '  float tip = max(abs(p.x) * 1.55 + p.y * 0.62, -p.y - r * 1.35);',
  '  return min(head, max(tip, p.y - r * 0.55));',
  '}',
  'float stroke(float d, float w) { return smoothstep(w, 0.0, abs(d)); }',
  'float fill(float d, float soft) { return smoothstep(soft, -soft, d); }',
  /* A dot that fades out entirely rather than snapping — used wherever a
     mark has to be able to leave the composition without a pop. */
  'float dot2(vec2 p, vec2 c, float r) { return smoothstep(r, r * 0.25, length(p - c)); }',
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
  /* 01 CUSTOM SITE — a page building itself.
   * A nav bar, a hero, two columns and a footer fly in from scattered
   * positions and lock into a layout that holds at the top of the loop. The
   * blocks are a real page skeleton, not five stripes: that is the whole
   * difference between "a custom site" and "some lines". */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  float conv = smoothstep(0.05, 0.95, 0.5 + 0.5 * cos(ang));',
    '  vec3 col = ink(0.0);',
    '  for (int i = 0; i < 6; i++) {',
    '    float fi = float(i);',
    /* target layout, in tile space: nav, hero, two columns, two footer rules */
    '    vec2 tc = vec2(0.0, 0.40);  vec2 tb = vec2(0.44, 0.035);',
    '    if (i == 1) { tc = vec2(0.0, 0.17);  tb = vec2(0.44, 0.10); }',
    '    if (i == 2) { tc = vec2(-0.23, -0.10); tb = vec2(0.20, 0.09); }',
    '    if (i == 3) { tc = vec2(0.23, -0.10);  tb = vec2(0.20, 0.09); }',
    '    if (i == 4) { tc = vec2(-0.14, -0.31); tb = vec2(0.30, 0.022); }',
    '    if (i == 5) { tc = vec2(-0.26, -0.41); tb = vec2(0.18, 0.022); }',
    /* scattered origin: a stable per-block offset, swung by the phase */
    '    vec2 off = vec2(vnoise(vec2(fi, 3.0)) - 0.5, vnoise(vec2(fi, 9.0)) - 0.5) * 1.5;',
    '    vec2 c = mix(tc + off * vec2(cos(ang + fi), sin(ang + fi * 1.3)), tc, conv);',
    '    float d = sdBox(p - c, tb);',
    '    float body = fill(d, 0.012) * mix(0.22, 0.62, conv);',
    '    float edge = stroke(d, 0.012) * mix(0.45, 1.0, conv);',
    '    vec3 tone = (i == 1) ? mix(CYAN, WARM, 0.55) : CYAN;',
    '    col += tone * (body * 0.40 + edge) * drive(I);',
    '  }',
    '  return col;',
    '}'
  ],

  /* 02 BRAND IDENTITY — three marks becoming one lockup.
   * They arrive from three directions and settle into a mark-plus-wordmark:
   * a diamond on the left, two bars to the right of it. A logo is a
   * relationship between parts, so the settled frame has to be a
   * composition, not three dots stacked in the middle. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  float settle = smoothstep(0.1, 0.95, 0.5 + 0.5 * cos(ang));',
    '  vec3 col = ink(0.12);',
    /* the mark: a diamond, which is the Needle in the site's own logo */
    '  vec2 mTarget = vec2(-0.26, 0.0);',
    '  vec2 mOrbit = vec2(cos(ang), sin(ang)) * 0.46;',
    '  vec2 mc = mix(mOrbit, mTarget, settle);',
    '  vec2 q = p - mc;',
    '  float diamond = (abs(q.x) + abs(q.y)) - mix(0.10, 0.15, settle);',
    '  col += mix(CYAN, WARM, 0.35) * (fill(diamond, 0.012) * 0.85 + stroke(diamond, 0.016)) * drive(I);',
    /* the wordmark: two bars that only exist once the mark has landed */
    '  for (int i = 0; i < 2; i++) {',
    '    float fi = float(i);',
    '    vec2 wTarget = vec2(0.12 - fi * 0.06, 0.055 - fi * 0.11);',
    '    vec2 wOrbit = vec2(cos(ang + 2.0944 + fi * 2.0944), sin(ang + 2.0944 + fi * 2.0944)) * 0.48;',
    '    vec2 wc = mix(wOrbit, wTarget, settle);',
    '    vec2 wb = vec2(mix(0.03, 0.20 - fi * 0.06, settle), 0.028);',
    '    float d = sdBox(p - wc, wb);',
    '    col += CYAN * fill(d, 0.012) * mix(0.30, 0.85, settle) * drive(I);',
    '  }',
    '  return col;',
    '}'
  ],

  /* 03 BOOKING FLOW — a week of slots, and one of them being taken.
   * A grid of empty slot pills with a cursor sweeping across them; on each
   * pass one slot fills solid and stays filled. That is the entire promise
   * of the feature in one gesture: the customer picked a time and it is
   * now spoken for. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.06);',
    '  float sweep = 0.52 * cos(ang);',
    '  float taken = smoothstep(-0.1, 0.55, cos(ang));',
    '  for (int gx = 0; gx < 4; gx++) {',
    '    for (int gy = 0; gy < 3; gy++) {',
    '      float fx = float(gx), fy = float(gy);',
    '      vec2 c = vec2((fx / 3.0 - 0.5) * 0.72, (fy / 2.0 - 0.5) * 0.60);',
    '      float d = sdBox(p - c, vec2(0.095, 0.055));',
    '      float edge = stroke(d, 0.011);',
    '      float near = smoothstep(0.22, 0.0, abs(c.x - sweep));',
    '      col += CYAN * edge * (0.30 + 0.55 * near) * drive(I);',
    /*     the one slot that gets booked — second column, middle row */
    '      if (gx == 2 && gy == 1) {',
    '        col += mix(CYAN, WARM, 0.85) * fill(d, 0.010) * taken * 0.85 * drive(I);',
    '        col += WARM * stroke(d, 0.020) * taken * drive(I);',
    '      }',
    '    }',
    '  }',
    '  return col;',
    '}'
  ],

  /* 04 QUOTE FLOW — a wide range closing on one number.
   * Two brackets start at the edges with a scale of ticks between them and
   * travel inward until they meet on a single bright bar. The uncertainty
   * is visible, and so is it being resolved. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.04);',
    '  float conv = smoothstep(0.0, 1.0, 0.5 + 0.5 * cos(ang));',
    '  float x = mix(0.46, 0.035, conv);',
    /* the scale the brackets slide along */
    '  col += CYAN * 0.16 * stroke(sdSeg(p, vec2(-0.46, 0.0), vec2(0.46, 0.0)), 0.008) * drive(I);',
    '  for (int i = 0; i < 7; i++) {',
    '    float tx = (float(i) / 6.0 - 0.5) * 0.92;',
    '    col += CYAN * 0.20 * stroke(sdSeg(p, vec2(tx, -0.05), vec2(tx, 0.05)), 0.007) * drive(I);',
    '  }',
    /* the two brackets */
    '  for (int s = 0; s < 2; s++) {',
    '    float sx = (s == 0) ? -x : x;',
    '    float d = min(sdSeg(p, vec2(sx, -0.26), vec2(sx, 0.26)),',
    '                  sdSeg(p, vec2(sx, 0.26), vec2(sx + (s == 0 ? 0.07 : -0.07), 0.26)));',
    '    d = min(d, sdSeg(p, vec2(sx, -0.26), vec2(sx + (s == 0 ? 0.07 : -0.07), -0.26)));',
    '    col += mix(CYAN, WARM, conv * 0.7) * stroke(d, 0.014) * (0.5 + 0.7 * conv) * drive(I);',
    '  }',
    /* the answer */
    '  float bar = sdBox(p, vec2(0.018, 0.20));',
    '  col += WARM * fill(bar, 0.010) * pow(conv, 2.0) * drive(I);',
    '  col += WARM * 0.5 * smoothstep(0.30, 0.0, length(p)) * pow(conv, 3.0) * drive(I);',
    '  return col;',
    '}'
  ],

  /* 05 PAYMENTS — money crossing, and the receipt.
   * A token leaves a source, travels the track, drops into the till, and a
   * confirming ring goes out from it. The token fades at both ends of its
   * run so the loop never shows it snapping back to the start. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.02);',
    '  float travel = 0.5 - 0.5 * cos(ang);',
    '  col += CYAN * 0.14 * stroke(sdSeg(p, vec2(-0.40, 0.0), vec2(0.40, 0.0)), 0.010) * drive(I);',
    /* source on the left, till on the right */
    '  float src = sdBox(p - vec2(-0.40, 0.0), vec2(0.055, 0.10));',
    '  col += CYAN * stroke(src, 0.012) * 0.55 * drive(I);',
    '  float till = sdBox(p - vec2(0.40, 0.0), vec2(0.075, 0.12));',
    '  col += mix(CYAN, WARM, 0.5) * stroke(till, 0.013) * (0.5 + 0.6 * travel) * drive(I);',
    /* the token */
    '  float x = mix(-0.40, 0.40, travel);',
    '  float alive = smoothstep(0.0, 0.12, travel) * smoothstep(1.0, 0.88, travel);',
    '  float coin = length(p - vec2(x, 0.0)) - 0.052;',
    '  col += WARM * (fill(coin, 0.012) * 0.9 + stroke(coin, 0.022) * 0.5) * alive * drive(I);',
    '  col += WARM * 0.25 * smoothstep(0.20, 0.0, length(p - vec2(x, 0.0))) * alive * drive(I);',
    /* the receipt: one ring leaving the till as the token lands */
    '  float land = smoothstep(0.80, 1.0, travel);',
    '  float rr = mix(0.06, 0.42, land);',
    '  col += WARM * stroke(length(p - vec2(0.40, 0.0)) - rr, 0.018) * land * (1.0 - land * 0.75) * drive(I);',
    '  return col;',
    '}'
  ],

  /* 06 LEAD CAPTURE — the ones who would have got away.
   * Motes wander at the edges, a funnel opens, and they are drawn down into
   * it and counted. The funnel is the point: without it they drift off the
   * frame, which is what a site without lead capture does all day. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  float pull = smoothstep(0.0, 1.0, 0.5 + 0.5 * cos(ang));',
    /* the funnel walls */
    '  float fl = sdSeg(p, vec2(-0.40, 0.34), vec2(-0.075, -0.10));',
    '  float fr = sdSeg(p, vec2(0.40, 0.34), vec2(0.075, -0.10));',
    '  col += CYAN * (stroke(fl, 0.012) + stroke(fr, 0.012)) * (0.25 + 0.55 * pull) * drive(I);',
    '  col += CYAN * 0.30 * stroke(sdBox(p - vec2(0.0, -0.30), vec2(0.16, 0.055)), 0.012) * drive(I);',
    '  for (int i = 0; i < 9; i++) {',
    '    float fi = float(i);',
    '    float sp = vnoise(vec2(fi, 2.0));',
    '    vec2 wander = vec2(cos(ang + fi * 1.9) * 0.44, 0.30 + sin(ang * 2.0 + fi) * 0.10);',
    '    vec2 caught = vec2(0.0, mix(-0.10, -0.30, fract(sp * 3.0)));',
    '    vec2 c = mix(wander, caught, pull * (0.55 + 0.45 * sp));',
    '    col += mix(CYAN, WARM, fract(fi * 0.37)) * dot2(p, c, 0.055) * drive(I);',
    '  }',
    '  return col;',
    '}'
  ],

  /* 07 AUTOMATED FOLLOW-UP — nobody is forgotten.
   * A pulse runs along a thread past three waiting nodes, lighting each as
   * it passes and leaving it lit. The thread is a queue of people who have
   * not answered yet, and the point is that the pulse comes round again. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.0);',
    '  float run = 0.5 - 0.5 * cos(ang);',
    '  float wave = sin(p.x * 4.2) * 0.16;',
    '  col += mix(vec3(0.05, 0.09, 0.10), CYAN, 0.30) * stroke(abs(p.y - wave), 0.013) * drive(I) * 0.8;',
    '  for (int i = 0; i < 3; i++) {',
    '    float fi = float(i);',
    '    float nx = (fi / 2.0 - 0.5) * 0.72;',
    '    float ny = sin(nx * 4.2) * 0.16;',
    '    float lit = smoothstep(0.0, 0.16, run - (fi / 2.0) * 0.72 - 0.14);',
    '    float d = length(p - vec2(nx, ny)) - 0.062;',
    '    col += CYAN * stroke(d, 0.014) * (0.35 + 0.65 * lit) * drive(I);',
    '    col += mix(CYAN, WARM, 0.6) * fill(d, 0.012) * lit * 0.8 * drive(I);',
    '  }',
    /* the pulse itself */
    '  float px = mix(-0.46, 0.46, run);',
    '  float py = sin(px * 4.2) * 0.16;',
    '  float alive = smoothstep(0.0, 0.10, run) * smoothstep(1.0, 0.90, run);',
    '  col += WARM * smoothstep(0.085, 0.0, length(p - vec2(px, py))) * alive * drive(I);',
    '  return col;',
    '}'
  ],

  /* 08 REMINDERS — the day before, without anyone remembering to.
   * A clock face with its ticks, one hand going round, and a flare every
   * time it passes the marked hour. Unmistakably a clock, which is the
   * whole job of this tile. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.02);',
    '  float R = 0.40;',
    '  col += CYAN * 0.30 * stroke(length(p) - R, 0.012) * drive(I);',
    '  for (int i = 0; i < 12; i++) {',
    '    float a2 = float(i) * 0.5235987756;',
    '    vec2 dir = vec2(cos(a2), sin(a2));',
    '    float big = (i == 0 || i == 3 || i == 6 || i == 9) ? 0.085 : 0.045;',
    '    float d = sdSeg(p, dir * (R - big), dir * (R - 0.012));',
    '    col += CYAN * stroke(d, 0.010) * ((i == 3) ? 0.9 : 0.28) * drive(I);',
    '  }',
    /* the hand */
    '  vec2 h = vec2(cos(ang), sin(ang));',
    '  col += mix(CYAN, WARM, 0.4) * stroke(sdSeg(p, vec2(0.0), h * (R - 0.07)), 0.013) * drive(I);',
    '  col += CYAN * smoothstep(0.035, 0.0, length(p)) * drive(I);',
    /* the flare as it passes the marked hour (top of the circle, i == 3) */
    '  float pass = pow(max(0.0, sin(ang)), 16.0);',
    '  col += WARM * pass * smoothstep(0.26, 0.0, length(p - vec2(0.0, R))) * drive(I);',
    '  col += WARM * 0.5 * pass * stroke(length(p) - R, 0.030) * drive(I);',
    '  return col;',
    '}'
  ],

  /* 09 REVIEW REQUESTS — the star gets earned, one at a time.
   * Five stars fill left to right and hold full, then release. A row of
   * stars is the single most legible thing on this list and there is no
   * reason to be clever about it. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.02);',
    '  float earn = 0.5 - 0.5 * cos(ang);',
    '  float got = smoothstep(0.0, 0.72, earn) * 5.0;',
    '  for (int i = 0; i < 5; i++) {',
    '    float fi = float(i);',
    '    vec2 c = vec2((fi / 4.0 - 0.5) * 0.78, 0.0);',
    '    float d = sdStar5((p - c) * 5.6, 0.55, 0.42) / 5.6;',
    '    float on = clamp(got - fi, 0.0, 1.0);',
    '    col += CYAN * 0.35 * stroke(d, 0.013) * drive(I);',
    '    col += mix(CYAN, WARM, 0.8) * fill(d, 0.010) * on * drive(I);',
    '    col += WARM * 0.30 * on * smoothstep(0.17, 0.0, length(p - c)) * drive(I);',
    '  }',
    '  return col;',
    '}'
  ],

  /* 10 OWNER DASHBOARD — where the calls came from, and what they were worth.
   * A framed panel with a header rule, five bars that rise and then breathe,
   * and a trend line over them. It should read as a screen someone actually
   * opens on a Monday morning. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.03);',
    '  float rise = smoothstep(0.0, 0.85, 0.5 - 0.5 * cos(ang));',
    '  float frame = sdBox(p, vec2(0.45, 0.34));',
    '  col += CYAN * 0.26 * stroke(frame, 0.011) * drive(I);',
    '  col += CYAN * 0.22 * stroke(sdSeg(p, vec2(-0.45, 0.22), vec2(0.45, 0.22)), 0.008) * drive(I);',
    '  col += CYAN * 0.55 * fill(sdBox(p - vec2(-0.34, 0.28), vec2(0.09, 0.022)), 0.008) * drive(I);',
    '  for (int i = 0; i < 5; i++) {',
    '    float fi = float(i);',
    '    float x = (fi / 4.0 - 0.5) * 0.66;',
    '    float target = 0.10 + 0.30 * (0.5 + 0.5 * sin(fi * 2.1));',
    '    float breathe = 0.022 * sin(ang * 2.0 + fi * 1.3) * I;',
    '    float h = target * rise + breathe * rise;',
    '    float d = sdBox(p - vec2(x, -0.30 + h * 0.5), vec2(0.055, max(h * 0.5, 0.004)));',
    '    col += mix(CYAN, WARM, fi * 0.18) * fill(d, 0.009) * 0.75 * drive(I);',
    '    col += mix(CYAN, WARM, fi * 0.18) * stroke(d, 0.011) * drive(I);',
    '  }',
    /* the trend line across the tops */
    '  float trend = 1.0;',
    '  for (int i = 0; i < 4; i++) {',
    '    float fi = float(i);',
    '    float x0 = (fi / 4.0 - 0.5) * 0.66, x1 = ((fi + 1.0) / 4.0 - 0.5) * 0.66;',
    '    float h0 = (0.10 + 0.30 * (0.5 + 0.5 * sin(fi * 2.1))) * rise;',
    '    float h1 = (0.10 + 0.30 * (0.5 + 0.5 * sin((fi + 1.0) * 2.1))) * rise;',
    '    trend = min(trend, sdSeg(p, vec2(x0, -0.30 + h0), vec2(x1, -0.30 + h1)));',
    '  }',
    '  col += WARM * stroke(trend, 0.010) * rise * 0.8 * drive(I);',
    '  return col;',
    '}'
  ],

  /* 11 LOCAL SEO — found by the people twenty minutes away.
   * A pin planted in the middle, rings going out from it, and attention
   * coming in from the edges of the frame. Both directions at once, because
   * that is what local search actually is. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.02);',
    '  float pull = smoothstep(0.0, 1.0, 0.5 + 0.5 * cos(ang));',
    /* Rings going out, two of them half a cycle apart so one is always on
       screen at a different radius — two rings a HALF cycle apart both
       reach fade 0 at the same instant, which left the tile empty every
       time round. ph is built from cos, never from fract(t): a sawtooth is
       value-continuous at the wrap but not derivative-continuous, which is
       exactly the once-per-loop hitch this file's header forbids. sin^2
       fading reaches zero WITH zero slope at both ends, so each ring is
       already invisible while it travels back in. */
    '  for (int i = 0; i < 3; i++) {',
    '    float ph = 0.5 - 0.5 * cos(ang + float(i) * 2.0943951);',
    '    float r = 0.08 + ph * 0.46;',
    '    float fade = sin(ph * PI); fade *= fade;',
    '    col += CYAN * stroke(length(p) - r, 0.014) * fade * 0.75 * drive(I);',
    '  }',
    /* attention arriving from the edges */
    '  for (int i = 0; i < 6; i++) {',
    '    float fi = float(i);',
    '    float a2 = fi * 1.0471975512 + 0.3;',
    '    vec2 edge = vec2(cos(a2), sin(a2)) * 0.66;',
    '    vec2 c = mix(edge, vec2(0.0, -0.02), pull);',
    '    col += mix(CYAN, WARM, 0.2) * dot2(p, c, 0.05) * (1.0 - pull * 0.55) * drive(I);',
    '  }',
    /* the pin */
    '  vec2 pp = (p - vec2(0.0, -0.02)) * 3.4;',
    '  float pin = sdPin(pp, 0.42) / 3.4;',
    /* the hole in the head — without it the silhouette is a balloon */
    '  float hole = (length(pp - vec2(0.0, 0.231)) - 0.165) / 3.4;',
    '  float solid = max(fill(pin, 0.010), 0.0) * (1.0 - fill(hole, 0.008));',
    '  col += WARM * solid * (0.55 + 0.45 * pull) * drive(I);',
    '  col += WARM * stroke(pin, 0.016) * drive(I);',
    '  col += WARM * 0.7 * stroke(hole, 0.012) * drive(I);',
    '  return col;',
    '}'
  ],

  /* 12 AI INTAKE — a question at nine on a Sunday, answered.
   * A scattered cluster of marks gathers into one line, and the line opens
   * out again into an ordered row. A question becoming an answer, and the
   * loop coming round because the next one is always arriving. */
  [
    'vec3 loop(vec2 p, float ang, float t, float I) {',
    '  vec3 col = ink(0.02);',
    '  float fold = 0.5 + 0.5 * cos(ang);',
    '  float unfold = 0.5 + 0.5 * cos(ang * 2.0);',
    /* the bar the question folds down into */
    '  col += mix(CYAN, WARM, 0.4) * fill(sdBox(p, vec2(mix(0.06, 0.30, fold), 0.016)), 0.010) * fold * 0.9 * drive(I);',
    '  for (int i = 0; i < 7; i++) {',
    '    float fi = float(i);',
    /*   scattered: the question. ordered: the answer, a tidy row. */
    '    vec2 ask = vec2(vnoise(vec2(fi, 4.0)) - 0.5, vnoise(vec2(fi, 11.0)) - 0.5) * 0.74;',
    '    vec2 ans = vec2((fi / 6.0 - 0.5) * 0.70, -0.24);',
    '    vec2 c = mix(mix(ask, vec2(0.0), fold), ans, unfold * fold);',
    '    float r = mix(0.048, 0.030, unfold);',
    '    col += mix(CYAN, WARM, fract(fi * 0.29)) * dot2(p, c, r) * drive(I);',
    '  }',
    '  return col;',
    '}'
  ]
];

/** Full fragment source for loop `index` (0..11), lazily built on demand. */
export function loopSource(index) {
  return wrap(BODIES[index].join('\n'));
}

export var COUNT = BODIES.length;
