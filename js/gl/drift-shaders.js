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

  /* The ink lift — shared by all three render paths.
   *
   * The drift field is deliberately a dark city: roughly one particle in
   * seven is a lit window and the rest sit at a tenth of an alpha. That is
   * the right ambience, and it is exactly wrong once the field resolves into
   * a picture, because a picture drawn in the dark majority is a smudge. The
   * first build of the lenticular formed all three frames correctly and you
   * could barely see any of them.
   *
   * So the same u_formWeight that pulls a particle onto its target also
   * turns its light on. At weight 0 every line below collapses to the
   * original drift shading, byte for byte — the ambience is untouched
   * between holds. At weight 1 nearly every particle is ink, the twinkle
   * flattens toward steady (a picture should not shimmer while you read it),
   * and the dots grow enough to close the gaps between them.
   *
   * Dot SIZE is not handled here: it rides on u_pointScale, which the act
   * already raises with the form weight (see pointScaleFor and INK_POINT_GAIN
   * in js/acts/drift.js). One source of truth, and the low tiers — which have
   * the fewest points to draw a picture with and need the largest dots to
   * close the gaps between them — can be tuned from the CPU side without
   * touching three shaders. */
  var INK_LIFT = [
    '  float ink = u_formWeight;',
    '  float litted = max(lit, ink * 0.9);',
    '  v_lit = mix(0.12, 1.0, litted) * mix(twinkle, 0.82 + 0.18 * twinkle, ink);',
    '  float alpha = mix(mix(0.10, 0.9, lit), mix(0.62, 0.95, lit), ink);'
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
    'attribute vec2 a_target;  // sampled point of the CURRENTLY ACTIVE lenticular frame',
    '',
    'uniform float u_dt;',
    'uniform float u_time;',
    'uniform vec2  u_cursor;   // -1..1, aspect-corrected',
    'uniform float u_energy;   // scroll speed, 0..1',
    'uniform float u_formWeight; // 0 = pure drift, 1 = fully resolved into a_target',
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
    /* The lenticular target replaces home as the point this particle is
       tethered to, cross-faded by u_formWeight. At weight 0 this is just
       homeOf() again — the picture is only ever a modulation of the same
       spring, never a second system layered on top. */
    '  vec3 pull = mix(home, vec3(a_target, 0.0), u_formWeight);',
    '  vec3 toPull = pull - pos;',
    '  /* Per-particle character: how strongly this point answers the current',
    '     vs. stays tethered near home, and how fast it moves once it does —',
    '     some points hang almost still, some travel. The same variance makes',
    '     the picture assemble raggedly — some points arrive early, some',
    '     straggle — rather than the whole field snapping into place at once. */',
    '  float flow = mix(0.35, 1.0, hash(vec2(a_seed, 6.1)));',
    '  float speed = mix(0.6, 1.5, hash(vec2(a_seed, 6.7)));',
    '  float tether = mix(0.75, 0.25, flow);',
    '  /* Assembling into a picture needs far more authority than idle drift, or',
    '     the hold — a real scroll distance measured in a fraction of a',
    '     viewport, not seconds — is over before the spring ever gets there.',
    '     300x, tuned empirically against this act\'s actual measured window',
    '     rather than an assumed one, gets a legible picture within roughly',
    '     half a second of a frame becoming current and a settled one within',
    '     about a second, not the many seconds the untouched idle spring would',
    '     take to cross the same distance. Paired with the extra velocity',
    '     damping below so this stays a fast approach, not a fast, ringing',
    '     overshoot. */',
    '  tether *= mix(1.0, 300.0, u_formWeight);',
    '',
    '  /* Large-scale, low-frequency curl: a current that carries groups of',
    '     particles together rather than each wandering independently. Faded',
    '     out as the picture resolves so it reads as assembled, not jittering. */',
    '  float n = vnoise(pos.xy * 0.32 + u_time * 0.025 + a_seed * 1.3);',
    '  vec3 curl = vec3(n - 0.5, vnoise(pos.yz * 0.32 - u_time * 0.018) - 0.5, 0.0) * 0.34 * flow * (1.0 - u_formWeight);',
    '',
    '  vec2  toCursor = pos.xy - u_cursor;',
    '  float cd = dot(toCursor, toCursor);',
    '  vec2  push = toCursor / (cd + 0.05) * 0.0035;',
    '',
    '  vel += (toPull * tether + curl - vec3(push, 0.0)) * speed * u_dt;',
    /* pow(retention, u_dt*60.0) rather than a bare per-frame multiply: a
       fixed per-frame retention factor is a different PER-SECOND decay rate
       at every refresh rate, and a bare "*=" was silently tuned for exactly
       one (60fps). Normalizing against that baseline keeps the friction —
       and therefore how fast a picture can actually assemble — the same
       real-world speed regardless of the device's true refresh rate. */
    '  vel *= pow(mix(0.985, 0.94, u_energy) * mix(1.0, 0.82, u_formWeight), u_dt * 60.0);',
    '  pos += vel * u_dt;',
    '',
    '  if (life <= 0.0) { pos = pull; vel = vec3(0.0); life = 0.6 + hash(vec2(a_seed, u_time)) * 0.4; }',
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
    'uniform float u_formWeight;',
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
    INK_LIFT,
    '  v_a = smoothstep(0.0, 0.15, a_life) * alpha;',
    '  v_warm = step(0.855, hash(vec2(a_seed, 50.0))); // roughly one in seven',
    '  v_soft = mix(hash(vec2(a_seed, 70.0)), 0.25, ink); // the picture sharpens up',
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
    'uniform sampler2D u_targetTex; // whichever lenticular frame is CURRENTLY active',
    'uniform float u_dt;',
    'uniform float u_time;',
    'uniform vec2  u_cursor;',
    'uniform float u_energy;',
    'uniform float u_formWeight; // 0 = pure drift, 1 = fully resolved into u_targetTex',
    PACK,
    NOISE,
    'vec3 homeOf(float s) {',
    '  return vec3(hash(vec2(s, 1.7)) - 0.5, hash(vec2(s, 5.3)) - 0.5, hash(vec2(s, 9.1)) - 0.5) * 1.6;',
    '}',
    'float seedOf(vec2 uv) { return hash(uv * 971.31); }',
    /* u_targetTex is packed exactly like posTex (rg = pack16(x), ba =
       pack16(y)) over the same [-1.2, 1.2] domain — see packFormTexture() in
       js/gl/formsampler.js, which this must stay byte-for-byte compatible
       with. */
    'vec2 unpackTarget(vec2 uv) {',
    '  vec4 t = texture2D(u_targetTex, uv);',
    '  return vec2(unpack16(t.rg), unpack16(t.ba)) * 2.4 - 1.2;',
    '}'
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
    '  if (life <= 0.0) {',
    '    vec2 pullXY = mix(homeOf(seed).xy, unpackTarget(v_uv), u_formWeight);',
    '    pos = vec3(pullXY, pos.z);',
    '  } else {',
    '    pos += vel * u_dt;',
    /* Assembly is done as a direct exponential ease in POSITION space, not
       by driving the (fixed-point, +-1-clamped) velocity channel harder. A
       spring strong enough to resolve a picture in under two seconds needs
       velocities that channel cannot represent without wrapping — Path A's
       transform-feedback buffers are plain float32 and do not have this
       ceiling, which is why its version of this same idea lives in the
       velocity term instead. Per-particle rate is the same "own lag and
       stiffness" character as Path A's tether variance, just expressed as a
       time constant instead of a spring constant. */
    '    float rate = mix(2.0, 8.0, hash(vec2(seed, 6.7)));',
    '    float snap = u_formWeight * (1.0 - exp(-rate * u_dt));',
    '    pos.xy = mix(pos.xy, unpackTarget(v_uv), snap);',
    '  }',
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
    /* The lenticular pictures are flat, so z is pulled to 0 with the same
       weight rather than sampled from anywhere — there is nothing to sample,
       the assembled image simply loses its depth as it resolves. */
    '  if (life <= 0.0) { z = mix(homeOf(seed).z, 0.0, u_formWeight); life = 0.6 + hash(vec2(seed, u_time)) * 0.4; }',
    '  else {',
    '    z += vel.z * u_dt;',
    '    float rate = mix(2.0, 8.0, hash(vec2(seed, 6.7)));',
    '    float snap = u_formWeight * (1.0 - exp(-rate * u_dt));',
    '    z = mix(z, 0.0, snap);', // the pictures are flat: z relaxes to 0 as the field resolves
    '  }',
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
    '  vec3 pull = vec3(mix(home.xy, unpackTarget(v_uv), u_formWeight), mix(home.z, 0.0, u_formWeight));',
    '  vec3 toPull = pull - pos;',
    '  /* Per-particle character: how strongly this point answers the current',
    '     vs. stays tethered near home, and how fast it moves once it does —',
    '     some points hang almost still, some travel. The same variance makes',
    '     the picture assemble raggedly rather than snapping into place. */',
    '  float flow = mix(0.35, 1.0, hash(vec2(seed, 6.1)));',
    '  float speed2 = mix(0.6, 1.5, hash(vec2(seed, 6.7)));',
    '  float tether = mix(0.75, 0.25, flow);',
    /* Deliberately left unboosted, unlike Path A's equivalent. The picture's
       actual assembly happens as a direct position-space ease in POS_FRAG
       (see the comment there on why) — this tether now only contributes a
       small organic wobble toward the same pull point, which stays inside
       the +-1 range this channel packs into at 8 bits per component. */
    '  /* Large-scale, low-frequency curl: a current that carries groups of',
    '     particles together rather than each wandering independently. Faded',
    '     out as the picture resolves. */',
    '  float n = vnoise(pos.xy * 0.32 + u_time * 0.025 + seed * 1.3);',
    '  vec3 curl = vec3(n - 0.5, vnoise(pos.yz * 0.32 - u_time * 0.018) - 0.5, 0.0) * 0.34 * flow * (1.0 - u_formWeight);',
    '  vec2 toCursor = pos.xy - u_cursor;',
    '  float cd = dot(toCursor, toCursor);',
    '  vec2 push = toCursor / (cd + 0.05) * 0.0035;',
    '  vel += (toPull * tether + curl - vec3(push, 0.0)) * speed2 * u_dt;',
    // pow(retention, u_dt*60.0): see Path A's identical line for why a bare
    // per-frame multiply is a different per-second decay rate at every
    // refresh rate.
    '  vel *= pow(mix(0.985, 0.94, u_energy), u_dt * 60.0);',
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
    'uniform float u_formWeight;',
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
    INK_LIFT,
    '  v_a = smoothstep(0.0, 0.15, life) * alpha;',
    '  v_warm = step(0.855, hash(vec2(seed, 50.0))); // roughly one in seven',
    '  v_soft = mix(hash(vec2(seed, 70.0)), 0.25, ink); // the picture sharpens up',
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
    'attribute vec2 a_target; // sampled point of the CURRENTLY ACTIVE lenticular frame',
    '',
    'uniform mat4  u_proj;',
    'uniform float u_time;',
    'uniform vec2  u_cursor;',
    'uniform float u_energy;   // scroll speed, shears the field',
    'uniform float u_scroll;   // page progress, drifts it downward',
    'uniform float u_formWeight; // 0 = pure drift, 1 = fully resolved into a_target',
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
    /* Path D is stateless — there is no velocity to spring toward a target,
       so the picture is a direct positional cross-fade instead of a pull.
       Coarser than the springy assembly on Paths A/C, but it still resolves
       and still scatters, which is the hard requirement. */
    '  pos = mix(pos, vec3(a_target, 0.0), u_formWeight);',
    '',
    '  gl_Position = u_proj * vec4(pos, 1.0);',
    '  float phase = hash(vec2(a_seed, 12.0)) * 6.283;',
    '  float twinkle = (0.55 + 0.45 * sin(a_seed * 37.0 + u_time * 0.6 + phase))',
    '                * (0.85 + 0.15 * sin(a_seed * 5.3 + u_time * 0.11)); // slow, irregular, never a strobe',
    '  float lit = step(0.86, hash(vec2(a_seed, 3.0)));',
    INK_LIFT,
    '  v_warm = step(0.855, hash(vec2(a_seed, 50.0))); // roughly one in seven',
    '  v_soft = mix(clamp(1.0 - depth, 0.0, 1.0), 0.25, ink); // far reads hazier, the picture sharp',
    '  v_a = alpha * mix(mix(0.6, 1.0, depth), 1.0, ink);',
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
