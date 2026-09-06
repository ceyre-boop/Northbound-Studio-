/* field.js — the GPU background.
 *
 * One fullscreen triangle, one fragment shader, raw WebGL (no three.js/OGL,
 * no imports — this is a static site with no build step). A log-radial depth
 * grid converges on a cursor/scroll-driven vanishing point, with 2-octave
 * value-noise drift, a cursor glow, per-floor micro-variance, a cheap
 * quadratic-in-p chromatic offset, and animated grain — all held under an
 * explicit luminance cap so the canvas can never fight text contrast.
 *
 * "Their landing page has zero canvases. The craft is restraint." Nothing
 * here is allowed to read as "an effect": no bloom, no starfield, no visible
 * shapes. It is depth a viewer feels in peripheral vision and cannot name.
 *
 * Rides the site's single rAF loop via window.NB_MOTION.onFrame — this file
 * never starts a second requestAnimationFrame loop. If NB_MOTION isn't on
 * the page yet it falls back to its own rAF, because the background must
 * never depend on load order.
 */
(function () {
  'use strict';

  var VERT_SRC = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = a_pos * 0.5 + 0.5;',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

  // One shared brightness function evaluated three times (R/G/B) at a
  // quadratic-in-p offset instead of three full render passes — that is the
  // whole chromatic-aberration budget.
  var FRAG_SRC = [
    'precision highp float;',
    'varying vec2 v_uv;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform vec2 u_cursor;',   // 0..1, smoothed cursor position
    'uniform float u_scroll;',  // 0..1 scroll progress
    'uniform float u_floor;',   // current floor index, fractional during transit
    'uniform float u_luma;',    // explicit luminance cap

    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
    '}',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
    '}',
    // two-octave value noise, cheap drift only
    'float fbm(vec2 p) {',
    '  float v = 0.0;',
    '  v += noise(p) * 0.6;',
    '  v += noise(p * 2.03 + 11.0) * 0.4;',
    '  return v;',
    '}',

    // shared brightness field, sampled per-channel at a tiny offset
    'float field(vec2 p, vec2 vp, float t, float flr) {',
    '  vec2 d = p - vp;',
    '  float r = length(d) + 0.0001;',
    '  float ang = atan(d.y, d.x);',
    // log-radial rings: naturally denser near the vanishing point without
    // any explicit falloff term
    '  float rings = fract(log(r * 9.0 + 1.0) * 2.2 - t * 0.05);',
    '  float ring = smoothstep(0.0, 0.05, rings) - smoothstep(0.08, 0.13, rings);',
    // faint radial spokes, coarse, gives the grid its "depth" read
    '  float spokes = abs(fract(ang * 2.5 / 3.14159265 + flr * 0.13) - 0.5) * 2.0;',
    '  float spoke = smoothstep(0.94, 1.0, spokes);',
    '  float base = ring * 0.55 + spoke * (0.10 / (1.0 + r * 2.2));',
    // slow value-noise drift, per-floor micro-variance via a tiny seed shift
    '  float n = fbm(p * 1.6 + vec2(t * 0.015, -t * 0.011) + flr * 3.7);',
    '  base *= 0.72 + n * 0.5;',
    // cursor glow, falls off fast so it never washes the frame
    '  float glow = 0.05 / (1.0 + r * r * 10.0);',
    '  return base * 0.55 + glow;',
    '}',

    'void main() {',
    '  vec2 uv = v_uv;',
    '  float aspect = u_res.x / u_res.y;',
    '  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);',
    // vanishing point drifts toward the cursor and downward with scroll
    '  vec2 vp = (u_cursor - 0.5) * vec2(aspect, 1.0) * 0.6;',
    '  vp.y -= (u_scroll - 0.5) * 0.5;',
    '  float t = u_time;',
    '  float aberr = dot(p, p) * 0.006;', // quadratic-in-p, zero at centre
    '  vec2 dir = normalize(p - vp + 1e-4);',
    '  float r = field(p - dir * aberr, vp, t, u_floor);',
    '  float g = field(p, vp, t, u_floor);',
    '  float b = field(p + dir * aberr, vp, t, u_floor);',
    '  vec3 col = vec3(r, g, b) * vec3(0.35, 0.95, 1.0);', // faint cyan tilt
    // grain, animated, very low amplitude
    '  float grain = (hash(uv * u_res.xy + t * 60.0) - 0.5) * 0.025;',
    '  col += grain;',
    '  col = max(col, 0.0);',
    '  float luma = dot(col, vec3(0.299, 0.587, 0.114));',
    '  if (luma > u_luma) col *= u_luma / max(luma, 0.0001);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var LUMA_CAP = 0.16;        // caps the field so it never fights text contrast
  var SLOW_FRAME_MS = 22;     // budget before we scale down
  var SLOW_STREAK = 30;       // consecutive slow frames before we act
  var MIN_SCALE = 0.5;

  var F = {
    ok: false,
    init: init,
    destroy: destroy,
    setScroll: setScroll,
    setFloor: setFloor
  };

  var s = null; // live instance state, null while not running

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function compileShader(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('field.js shader compile failed: ' + log);
    }
    return sh;
  }

  function buildProgram(gl) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('field.js program link failed: ' + log);
    }
    return prog;
  }

  function scaleForViewport() {
    var small = Math.min(window.innerWidth, window.innerHeight) <= 480;
    var cap = small ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function resize() {
    if (!s) return;
    var w = window.innerWidth, h = window.innerHeight;
    s.baseDpr = scaleForViewport();
    var dpr = s.baseDpr * s.scaleFactor;
    var cw = Math.max(1, Math.round(w * dpr));
    var ch = Math.max(1, Math.round(h * dpr));
    if (s.canvas.width !== cw || s.canvas.height !== ch) {
      s.canvas.width = cw;
      s.canvas.height = ch;
    }
    s.canvas.style.width = w + 'px';
    s.canvas.style.height = h + 'px';
    s.gl.viewport(0, 0, cw, ch);
    s.resUniform = [cw, ch];
    // A resize clears WebGL's drawing buffer; reduced-motion mode never
    // re-enters the loop, so it must redraw its one static frame itself.
    if (s.reduced) drawStaticFrame();
  }

  function onPointer(e) {
    if (!s) return;
    s.cursorX = e.clientX / window.innerWidth;
    s.cursorY = 1 - e.clientY / window.innerHeight; // GL space, y up
  }

  function fail(reason) {
    if (reason) { try { console.warn('field.js: ' + reason); } catch (e) {} }
    destroy();
  }

  function drawStaticFrame() {
    if (!s) return;
    var gl = s.gl;
    gl.uniform2fv(s.u.res, s.resUniform);
    gl.uniform1f(s.u.time, 0);
    gl.uniform2f(s.u.cursor, 0.5, 0.5);
    gl.uniform1f(s.u.scroll, 0);
    gl.uniform1f(s.u.floor, 0);
    gl.uniform1f(s.u.luma, LUMA_CAP);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(dt, now) {
    if (!s || s.paused) return;
    var t0 = performance.now();

    s.time += dt;
    s.smoothCursorX += (s.cursorX - s.smoothCursorX) * Math.min(1, dt * 4);
    s.smoothCursorY += (s.cursorY - s.smoothCursorY) * Math.min(1, dt * 4);
    s.smoothScroll += (s.scroll - s.smoothScroll) * Math.min(1, dt * 5);
    s.smoothFloor += (s.floor - s.smoothFloor) * Math.min(1, dt * 6);

    var gl = s.gl;
    gl.uniform2fv(s.u.res, s.resUniform);
    gl.uniform1f(s.u.time, s.time);
    gl.uniform2f(s.u.cursor, s.smoothCursorX, s.smoothCursorY);
    gl.uniform1f(s.u.scroll, s.smoothScroll);
    gl.uniform1f(s.u.floor, s.smoothFloor);
    gl.uniform1f(s.u.luma, LUMA_CAP);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Adaptive resolution: 30 consecutive slow frames halves scale once.
    var frameMs = performance.now() - t0;
    if (frameMs > SLOW_FRAME_MS) {
      s.slowStreak++;
      if (s.slowStreak >= SLOW_STREAK && s.scaleFactor > MIN_SCALE) {
        s.scaleFactor = Math.max(MIN_SCALE, s.scaleFactor * 0.5);
        s.slowStreak = 0;
        resize();
        try { console.warn('field.js: sustained frame cost, halving resolution scale to ' + s.scaleFactor); } catch (e) {}
      }
    } else {
      s.slowStreak = 0;
    }
  }

  function ownRaf(now) {
    if (!s) return;
    var last = s.rafLast || now;
    var dt = Math.min(0.1, (now - last) / 1000);
    s.rafLast = now;
    tick(dt || 1 / 60, now);
    s.rafId = requestAnimationFrame(ownRaf);
  }

  function init(opts) {
    if (s) return F; // already running
    opts = opts || {};

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';

    var gl;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' }) ||
           canvas.getContext('experimental-webgl', { alpha: false, antialias: false });
    } catch (e) {
      gl = null;
    }
    if (!gl) { fail('no WebGL context'); return F; }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      fail('context lost');
    }, false);

    var prog;
    try {
      prog = buildProgram(gl);
    } catch (e) {
      fail(e.message);
      return F;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // one fullscreen triangle, no quad, no index buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    s = {
      canvas: canvas,
      gl: gl,
      prog: prog,
      u: {
        res: gl.getUniformLocation(prog, 'u_res'),
        time: gl.getUniformLocation(prog, 'u_time'),
        cursor: gl.getUniformLocation(prog, 'u_cursor'),
        scroll: gl.getUniformLocation(prog, 'u_scroll'),
        floor: gl.getUniformLocation(prog, 'u_floor'),
        luma: gl.getUniformLocation(prog, 'u_luma')
      },
      resUniform: [1, 1],
      time: 0,
      cursorX: 0.5, cursorY: 0.5,
      smoothCursorX: 0.5, smoothCursorY: 0.5,
      scroll: 0, smoothScroll: 0,
      floor: 0, smoothFloor: 0,
      scaleFactor: 1,
      baseDpr: 1,
      slowStreak: 0,
      paused: false,
      offFrame: null,
      rafId: null,
      rafLast: 0,
      reduced: reducedMotion()
    };

    document.body.appendChild(canvas);
    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (!s) return;
      s.paused = document.hidden;
    });

    if (s.reduced) {
      // Exactly one static frame, time frozen, no loop.
      drawStaticFrame();
      F.ok = true;
      return F;
    }

    if (window.NB_MOTION && typeof window.NB_MOTION.onFrame === 'function') {
      s.offFrame = window.NB_MOTION.onFrame(tick);
    } else {
      s.rafId = requestAnimationFrame(ownRaf);
    }

    F.ok = true;
    return F;
  }

  function setScroll(v) {
    if (!s) return;
    s.scroll = Math.max(0, Math.min(1, v));
  }

  function setFloor(i) {
    if (!s) return;
    s.floor = i;
  }

  function destroy() {
    F.ok = false;
    if (!s) return;
    if (s.offFrame) { try { s.offFrame(); } catch (e) {} }
    if (s.rafId) { try { cancelAnimationFrame(s.rafId); } catch (e) {} }
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointer);
    if (s.canvas && s.canvas.parentNode) { s.canvas.parentNode.removeChild(s.canvas); }
    var gl = s.gl;
    if (gl) {
      try {
        var ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (e) {}
    }
    s = null;
  }

  window.NB_FIELD = F;
})();
