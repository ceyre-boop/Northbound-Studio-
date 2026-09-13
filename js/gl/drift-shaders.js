/* drift-shaders.js — GLSL for the market-scatter particle field (Act II).
 *
 * Three independent techniques, gated by ctx.caps at init() time — never a
 * runtime branch inside a shader that only one device class ever takes:
 *
 *   A  WebGL2 transform feedback  — interleaved position/velocity/life/seed,
 *      integrated on the GPU, ping-ponged between two VBOs.
 *   C  WebGL1 RGBA8 fixed-point   — position and life packed into 8-bit
 *      textures, ping-ponged as render targets, sampled back in the vertex
 *      shader via the vertex texture fetch (gated by vertexTextureUnits).
 *   D  Analytic, stateless        — no GPGPU at all. Position is a pure
 *      function of (home, seed, time, cursor, scroll) evaluated per-vertex,
 *      the same technique js/scatter.js uses elsewhere on this page: no
 *      simulation state, so there is nothing to ping-pong and nothing that
 *      can drift out of sync with a lost context.
 *
 * hash()/vnoise() below are copied verbatim from js/gl/northlight-shaders.js
 * so the field carries the same grain as the aurora curtain. That file is
 * owned by another department and is never imported or edited here — the
 * two functions are small enough that a byte-for-byte copy is cheaper than a
 * cross-department shared-module dependency neither team can review alone.
 *
 * This file is a plain ES module (export, not a window global) because it is
 * never loaded via a <script> tag — index.html is frozen and only imports
 * js/acts/drift.js dynamically. drift.js imports these sources directly.
 */

  var NOISE = [
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

  /* Shared sprite shading for all three render paths: a soft round dot,
     additive, discarded early so the untouched majority of each point's
     bounding square never reaches the blend stage.
     v_warm and v_soft are set per-vertex by every path below: v_warm picks
     the aurora/cool vs. signal/warm palette (a roughly one-in-seven minority
     — see the 0.855 threshold at each call site), v_soft varies the falloff
     from a crisp near point to a hazy, diffuse far one — the depth cue that
     reads as "dreamy" rather than "flat". */
  var SPRITE_FRAG_BODY = [
    'void main() {',
    '  vec2 d = gl_PointCoord * 2.0 - 1.0;',
    '  float r2 = dot(d, d);',
    '  if (r2 > 1.0) discard;',
    '  float falloffPow = mix(2.4, 0.85, v_soft); // near = crisp, far = hazy',
    '  float core = pow(clamp(1.0 - r2, 0.0, 1.0), falloffPow);',
    '  vec3 dimCool = vec3(0.09, 0.15, 0.21);',
    '  vec3 litCool = vec3(0.33, 0.86, 0.80);', // aurora-adjacent, not pure cyan
    '  vec3 dimWarm = vec3(0.20, 0.13, 0.07);',
    '  vec3 litWarm = vec3(0.88, 0.63, 0.36);', // signal
    '  vec3 dim = mix(dimCool, dimWarm, v_warm);',
    '  vec3 lit = mix(litCool, litWarm, v_warm);',
    '  vec3 col = mix(dim, lit, v_lit) * core;',
    '  float a = core * v_a;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------------
  // Path A — WebGL2 transform feedback. ESSL 1.00 syntax throughout: WebGL2
  // accepts attribute/varying shaders for transform feedback as long as the
  // captured names are declared as varyings and passed to
  // transformFeedbackVaryings() before linking, so there is no need for a
  // second, ESSL-300 dialect here.
  // ---------------------------------------------------------------------

  var A_UPDATE_VARYINGS = ['v_outPosition', 'v_outVelocity', 'v_outLife', 'v_outSeed'];

  var A_UPDATE_VERT = [
    'precision highp float;',
    'attribute vec3 a_position;',
    'attribute vec3 a_velocity;',
    'attribute float a_life;',
    'attribute float a_seed;',
    '',
    'uniform float u_dt;',
    'uniform float u_time;',
    'uniform vec2  u_cursor;   // -1..1, aspect-corrected',
    'uniform float u_energy;   // scroll speed, 0..1',
    '',
    NOISE,
    '',
    'varying vec3  v_outPosition;',
    'varying vec3  v_outVelocity;',
    'varying float v_outLife;',
    'varying float v_outSeed;',
    '',
    /* Home is derived from the seed alone so a respawned particle returns to
       a stable point in the field rather than a fresh random one every time
       — the field reads as forty fixed points of light, not fireflies. */
    'vec3 homeOf(float s) {',
    '  return vec3(hash(vec2(s, 1.7)) - 0.5, hash(vec2(s, 5.3)) - 0.5, hash(vec2(s, 9.1)) - 0.5) * 1.6;',
    '}',
    '',
    'void main() {',
    '  vec3 pos = a_position;',
    '  vec3 vel = a_velocity;',
    '  float life = a_life - u_dt * 0.05;',
    '',
    '  vec3 home = homeOf(a_seed);',
    '  vec3 toHome = home - pos;',
    '  /* Per-particle character: how strongly this point answers the current',
    '     vs. stays tethered near home, and how fast it moves once it does —',
    '     some points hang almost still, some travel. */',
    '  float flow = mix(0.35, 1.0, hash(vec2(a_seed, 6.1)));',
    '  float speed = mix(0.6, 1.5, hash(vec2(a_seed, 6.7)));',
    '  float tether = mix(0.75, 0.25, flow);',
    '',
    '  /* Large-scale, low-frequency curl: a current that carries groups of',
    '     particles together rather than each wandering independently. */',
    '  float n = vnoise(pos.xy * 0.32 + u_time * 0.025 + a_seed * 1.3);',
    '  vec3 curl = vec3(n - 0.5, vnoise(pos.yz * 0.32 - u_time * 0.018) - 0.5, 0.0) * 0.34 * flow;',
    '',
    '  vec2  toCursor = pos.xy - u_cursor;',
    '  float cd = dot(toCursor, toCursor);',
    '  vec2  push = toCursor / (cd + 0.05) * 0.0035;',
    '',
    '  vel += (toHome * tether + curl - vec3(push, 0.0)) * speed * u_dt;',
    '  vel *= mix(0.985, 0.94, u_energy);',
    '  pos += vel * u_dt;',
    '',
    '  if (life <= 0.0) { pos = home; vel = vec3(0.0); life = 0.6 + hash(vec2(a_seed, u_time)) * 0.4; }',
    '',
    '  v_outPosition = pos;',
    '  v_outVelocity = vel;',
    '  v_outLife = life;',
    '  v_outSeed = a_seed;',
    '  gl_Position = vec4(0.0);', // rasterizer discard is on; never rasterized
    '}'
  ].join('\n');

  /* No fragment output is ever used (RASTERIZER_DISCARD is on for this
     program) but every program still needs a shader that links. */
  var A_UPDATE_FRAG = [
    'precision mediump float;',
    'void main() { gl_FragColor = vec4(0.0); }'
  ].join('\n');

  var A_RENDER_VERT = [
    'precision highp float;',
    'attribute vec3 a_position;',
    'attribute float a_life;',
    'attribute float a_seed;',
    '',
    'uniform mat4  u_proj;',
    'uniform float u_dpr;',
    'uniform float u_pointScale; // clamp target, already includes tier + share',
    'uniform float u_maxPoint;',
    '',
    NOISE,
    '',
    'varying float v_a;',
    'varying float v_lit;',
    'varying float v_warm;',
    'varying float v_soft;',
    '',
    'void main() {',
    '  gl_Position = u_proj * vec4(a_position, 1.0);',
    '  float phase = hash(vec2(a_seed, 12.0)) * 6.283;',
    '  float twinkle = (0.55 + 0.45 * sin(a_seed * 37.0 + a_life * 6.0 + phase))',
    '                * (0.85 + 0.15 * sin(a_seed * 5.3 + a_life * 0.8)); // slow, irregular, never a strobe',
    '  float lit = step(0.86, hash(vec2(a_seed, 3.0))); // a few lit windows, most dark',
    '  v_lit = mix(0.12, 1.0, lit) * twinkle;',
    '  v_a = smoothstep(0.0, 0.15, a_life) * mix(0.10, 0.9, lit);',
    '  v_warm = step(0.855, hash(vec2(a_seed, 50.0))); // roughly one in seven',
    '  v_soft = hash(vec2(a_seed, 70.0));',
    '  float warmSize = mix(1.0, 1.22, v_warm);',
    '  gl_PointSize = min(u_pointScale * u_dpr * warmSize, u_maxPoint);',
    '}'
  ].join('\n');

  var A_RENDER_FRAG = [
    'precision mediump float;',
    'varying float v_a;',
    'varying float v_lit;',
    'varying float v_warm;',
    'varying float v_soft;',
    SPRITE_FRAG_BODY
  ].join('\n');

  // ---------------------------------------------------------------------
  // Path C — WebGL1, RGBA8 fixed-point ping-pong textures + vertex texture
  // fetch. Baseline path: no extensions required beyond a single vertex
  // texture unit.
  // ---------------------------------------------------------------------

  var PACK = [
    'vec2 pack16(float v) {',
    '  float s = clamp(v, 0.0, 1.0) * 255.0;',
    '  float hi = floor(s);',
    '  return vec2(hi, floor((s - hi) * 255.0)) / 255.0;',
    '}',
    'float unpack16(vec2 p) {',
    '  return (p.x * 255.0 + p.y) / 255.0;',
    '}'
  ].join('\n');

  var C_QUAD_VERT = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = a_pos * 0.5 + 0.5;',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* Simulation domain is a unit cube in [-1.2, 1.2]^3, remapped to 0..1 for
     packing with (v / 2.4 + 0.5). All three sim passes share that mapping. */
  var C_SIM_HEADER = [
    'precision highp float;',
    'varying vec2 v_uv;',
    'uniform sampler2D u_posTex;',
    'uniform sampler2D u_zlTex;',
    'uniform sampler2D u_velTex;',
    'uniform float u_dt;',
    'uniform float u_time;',
    'uniform vec2  u_cursor;',
    'uniform float u_energy;',
    PACK,
    NOISE,
    'vec3 homeOf(float s) {',
    '  return vec3(hash(vec2(s, 1.7)) - 0.5, hash(vec2(s, 5.3)) - 0.5, hash(vec2(s, 9.1)) - 0.5) * 1.6;',
    '}',
    'float seedOf(vec2 uv) { return hash(uv * 971.31); }'
  ].join('\n');

  var C_POS_FRAG = [
    C_SIM_HEADER,
    'void main() {',
    '  vec4 pp = texture2D(u_posTex, v_uv);',
    '  vec4 zl = texture2D(u_zlTex, v_uv);',
    '  vec3 vel = texture2D(u_velTex, v_uv).xyz * 2.0 - 1.0;',
    '  float life = zl.b;',
    '  vec3 pos = vec3(unpack16(pp.rg), unpack16(pp.ba), unpack16(zl.rg)) * 2.4 - 1.2;',
    '  float seed = seedOf(v_uv);',
    '  if (life <= 0.0) pos = homeOf(seed);',
    '  else pos += vel * u_dt;',
    '  vec3 np = clamp(pos / 2.4 + 0.5, 0.0, 1.0);',
    '  gl_FragColor = vec4(pack16(np.x), pack16(np.y));', // posTex: rg=x, ba=y
    '}'
  ].join('\n');

  /* z shares zlTex with life: rg = pack16(z), b = life, a = free. */
  var C_ZL_FRAG = [
    C_SIM_HEADER,
    'void main() {',
    '  vec4 zl = texture2D(u_zlTex, v_uv);',
    '  vec4 pp = texture2D(u_posTex, v_uv);',
    '  vec3 vel = texture2D(u_velTex, v_uv).xyz * 2.0 - 1.0;',
    '  float life = zl.b - u_dt * 0.05;',
    '  float z = unpack16(zl.rg) * 2.4 - 1.2;',
    '  float seed = seedOf(v_uv);',
    '  if (life <= 0.0) { z = homeOf(seed).z; life = 0.6 + hash(vec2(seed, u_time)) * 0.4; }',
    '  else z += vel.z * u_dt;',
    '  vec2 zp = pack16(clamp(z / 2.4 + 0.5, 0.0, 1.0));',
    '  gl_FragColor = vec4(zp.x, zp.y, life, 1.0);',
    '}'
  ].join('\n');

  var C_VEL_FRAG = [
    C_SIM_HEADER,
    'void main() {',
    '  vec4 pp = texture2D(u_posTex, v_uv);',
    '  vec4 zl = texture2D(u_zlTex, v_uv);',
    '  vec3 vel = texture2D(u_velTex, v_uv).xyz * 2.0 - 1.0;',
    '  vec3 pos = vec3(unpack16(pp.rg), unpack16(pp.ba), unpack16(zl.rg)) * 2.4 - 1.2;',
    '  float seed = seedOf(v_uv);',
    '  float life = zl.b;',
    '  vec3 home = homeOf(seed);',
    '  vec3 toHome = home - pos;',
    '  /* Per-particle character: how strongly this point answers the current',
    '     vs. stays tethered near home, and how fast it moves once it does —',
    '     some points hang almost still, some travel. */',
    '  float flow = mix(0.35, 1.0, hash(vec2(seed, 6.1)));',
    '  float speed2 = mix(0.6, 1.5, hash(vec2(seed, 6.7)));',
    '  float tether = mix(0.75, 0.25, flow);',
    '  /* Large-scale, low-frequency curl: a current that carries groups of',
    '     particles together rather than each wandering independently. */',
    '  float n = vnoise(pos.xy * 0.32 + u_time * 0.025 + seed * 1.3);',
    '  vec3 curl = vec3(n - 0.5, vnoise(pos.yz * 0.32 - u_time * 0.018) - 0.5, 0.0) * 0.34 * flow;',
    '  vec2 toCursor = pos.xy - u_cursor;',
    '  float cd = dot(toCursor, toCursor);',
    '  vec2 push = toCursor / (cd + 0.05) * 0.0035;',
    '  vel += (toHome * tether + curl - vec3(push, 0.0)) * speed2 * u_dt;',
    '  vel *= mix(0.985, 0.94, u_energy);',
    '  if (life <= 0.0) vel = vec3(0.0);',
    '  gl_FragColor = vec4(clamp(vel * 0.5 + 0.5, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var C_RENDER_VERT = [
    'precision highp float;',
    'attribute vec2 a_uv; // texel centre of this particle, static',
    'uniform sampler2D u_posTex;',
    'uniform sampler2D u_zlTex;',
    'uniform mat4  u_proj;',
    'uniform float u_dpr;',
    'uniform float u_pointScale;',
    'uniform float u_maxPoint;',
    PACK,
    NOISE,
    'varying float v_a;',
    'varying float v_lit;',
    'varying float v_warm;',
    'varying float v_soft;',
    'void main() {',
    '  vec4 pp = texture2D(u_posTex, a_uv);',
    '  vec4 zl = texture2D(u_zlTex, a_uv);',
    '  vec3 pos = vec3(unpack16(pp.rg), unpack16(pp.ba), unpack16(zl.rg)) * 2.4 - 1.2;',
    '  float life = zl.b;',
    '  float seed = hash(a_uv * 971.31);',
    '  gl_Position = u_proj * vec4(pos, 1.0);',
    '  float phase = hash(vec2(seed, 12.0)) * 6.283;',
    '  float twinkle = (0.55 + 0.45 * sin(seed * 37.0 + life * 6.0 + phase))',
    '                * (0.85 + 0.15 * sin(seed * 5.3 + life * 0.8)); // slow, irregular, never a strobe',
    '  float lit = step(0.86, hash(vec2(seed, 3.0)));',
    '  v_lit = mix(0.12, 1.0, lit) * twinkle;',
    '  v_a = smoothstep(0.0, 0.15, life) * mix(0.10, 0.9, lit);',
    '  v_warm = step(0.855, hash(vec2(seed, 50.0))); // roughly one in seven',
    '  v_soft = hash(vec2(seed, 70.0));',
    '  float warmSize = mix(1.0, 1.22, v_warm);',
    '  gl_PointSize = min(u_pointScale * u_dpr * warmSize, u_maxPoint);',
    '}'
  ].join('\n');

  var C_RENDER_FRAG = [
    'precision mediump float;',
    'varying float v_a;',
    'varying float v_lit;',
    'varying float v_warm;',
    'varying float v_soft;',
    SPRITE_FRAG_BODY
  ].join('\n');

  // ---------------------------------------------------------------------
  // Path D — analytic, stateless. No simulation state at all: position is a
  // pure function of (home, seed, time, cursor, scroll). Same technique as
  // js/scatter.js's sparse field — parallax by depth, a cheap domain-warp
  // drift, no ping-pong, nothing that can desync from a lost context.
  // ---------------------------------------------------------------------

  var D_VERT = [
    'precision highp float;',
    'attribute vec3 a_home;   // fixed point in the field',
    'attribute float a_seed;',
    '',
    'uniform mat4  u_proj;',
    'uniform float u_time;',
    'uniform vec2  u_cursor;',
    'uniform float u_energy;   // scroll speed, shears the field',
    'uniform float u_scroll;   // page progress, drifts it downward',
    'uniform float u_dpr;',
    'uniform float u_pointScale;',
    'uniform float u_maxPoint;',
    '',
    NOISE,
    '',
    'varying float v_a;',
    'varying float v_lit;',
    'varying float v_warm;',
    'varying float v_soft;',
    '',
    'void main() {',
    '  float depth = 0.3 + 0.7 * hash(vec2(a_seed, 8.8)); // parallax-by-depth',
    '  /* Per-particle character: some drift far in the current, some barely',
    '     move — plus a large-scale, low-frequency wave that carries nearby',
    '     particles together rather than each wandering independently. */',
    '  float flow = mix(0.5, 1.3, hash(vec2(a_seed, 6.1)));',
    '  vec2 current = vec2(',
    '    vnoise(a_home.xy * 0.30 + u_time * 0.018) - 0.5,',
    '    vnoise(a_home.yx * 0.30 - u_time * 0.014) - 0.5',
    '  ) * 0.30 * depth * flow;',
    '  vec2 drift = vec2(',
    '    vnoise(a_home.xy * 0.8 + u_time * 0.02) - 0.5,',
    '    vnoise(a_home.yx * 0.8 - u_time * 0.017) - 0.5',
    '  ) * 0.12 * depth;',
    '',
    '  vec2 toCursor = a_home.xy - u_cursor;',
    '  float cd = dot(toCursor, toCursor);',
    '  vec2 push = toCursor / (cd + 0.06) * 0.02 * depth;',
    '',
    '  vec3 pos = a_home;',
    '  pos.xy += current + drift + push;',
    '  pos.x += u_energy * (a_home.y * 0.35);   // scroll shears the field',
    '  pos.y -= u_scroll * 0.6 * depth;         // slow parallax fall',
    '',
    '  gl_Position = u_proj * vec4(pos, 1.0);',
    '  float phase = hash(vec2(a_seed, 12.0)) * 6.283;',
    '  float twinkle = (0.55 + 0.45 * sin(a_seed * 37.0 + u_time * 0.6 + phase))',
    '                * (0.85 + 0.15 * sin(a_seed * 5.3 + u_time * 0.11)); // slow, irregular, never a strobe',
    '  float lit = step(0.86, hash(vec2(a_seed, 3.0)));',
    '  v_lit = mix(0.12, 1.0, lit) * twinkle;',
    '  v_warm = step(0.855, hash(vec2(a_seed, 50.0))); // roughly one in seven',
    '  v_soft = clamp(1.0 - depth, 0.0, 1.0); // far (shallow depth) reads hazier',
    '  v_a = mix(0.10, 0.85, lit) * mix(0.6, 1.0, depth);',
    '  float warmSize = mix(1.0, 1.22, v_warm);',
    '  gl_PointSize = min(u_pointScale * u_dpr * depth * warmSize, u_maxPoint);',
    '}'
  ].join('\n');

  var D_FRAG = [
    'precision mediump float;',
    'varying float v_a;',
    'varying float v_lit;',
    'varying float v_warm;',
    'varying float v_soft;',
    SPRITE_FRAG_BODY
  ].join('\n');

  export var DRIFT_SHADERS = {
    A: {
      UPDATE_VARYINGS: A_UPDATE_VARYINGS,
      UPDATE_VERT: A_UPDATE_VERT,
      UPDATE_FRAG: A_UPDATE_FRAG,
      RENDER_VERT: A_RENDER_VERT,
      RENDER_FRAG: A_RENDER_FRAG
    },
    C: {
      QUAD_VERT: C_QUAD_VERT,
      POS_FRAG: C_POS_FRAG,
      ZL_FRAG: C_ZL_FRAG,
      VEL_FRAG: C_VEL_FRAG,
      RENDER_VERT: C_RENDER_VERT,
      RENDER_FRAG: C_RENDER_FRAG
    },
    D: {
      VERT: D_VERT,
      FRAG: D_FRAG
    }
  };
