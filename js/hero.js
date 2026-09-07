/* hero.js — the atomizer. The signature moment.
 *
 * The studio's mark (brand/logo.svg + brand/wordmark.svg) rendered as a
 * field of light-particles that rest in formed shape, then locally
 * disintegrate and reform under cursor proximity/speed and scroll velocity.
 * Raw WebGL, one gl.drawArrays(POINTS, ...) call, no GPGPU feedback buffers,
 * no three.js/OGL, no imports — see js/gl/atomizer-shaders.js for why a
 * stateless per-frame function is enough to make "reform" fall out for free.
 *
 * LCP contract: this file never gambles the hero's paint on WebGL. It mounts
 * two real <img> elements (brand/logo.svg, brand/wordmark.svg — the actual
 * finished mark, not a placeholder) plus a real text caption immediately;
 * those are what the browser scores for LCP, and they paint at native <img>/
 * text speed with zero dependency on shader compilation or particle-buffer
 * construction. The canvas is a progressive enhancement that crossfades in
 * on top once it has rasterised those same two images into a particle field
 * and drawn a first frame — mirroring the poster-to-iframe dissolve ripple.js
 * already uses for the Floor 02 rail, applied here to "static mark" instead
 * of "static poster."
 *
 * Fallback chain, in order:
 *   1. prefers-reduced-motion: reduce -> the two <img>s ARE the hero. No
 *      canvas is created. One composed, already-final frame, no simulation.
 *   2. No WebGL -> same as (1). Never a different design, never a stock
 *      image — it is literally the studio's real logo lockup.
 *   3. WebGL available and motion allowed -> full atomizer, particle count
 *      scaled to a coarse device tier (js/gl/gl-core.js's deviceTier, with an
 *      inline fallback below if that file didn't load), then adapted further
 *      at runtime the way field.js halves its resolution scale under
 *      sustained slow frames.
 *
 * Rides the site's single rAF loop via window.NB_MOTION.onFrame; falls back
 * to its own rAF only if NB_MOTION isn't on the page. Pauses on
 * visibilitychange. Exports window.NB_HERO = { init, destroy, ok, setScroll }.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Inline fallback copies of gl-core.js / atomizer-shaders.js. Only used
  // if those optional files didn't load before this one — see file header.
  // ---------------------------------------------------------------------
  function inlineCompileShader(gl, type, src, label) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error((label || 'hero.js') + ' shader compile failed: ' + log);
    }
    return sh;
  }

  function inlineBuildProgram(gl, vertSrc, fragSrc, label) {
    var vs = inlineCompileShader(gl, gl.VERTEX_SHADER, vertSrc, label);
    var fs = inlineCompileShader(gl, gl.FRAGMENT_SHADER, fragSrc, label);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error((label || 'hero.js') + ' program link failed: ' + log);
    }
    return prog;
  }

  var INLINE_VERT = [
    'attribute vec2 a_home;',
    'attribute vec3 a_color;',
    'attribute float a_alpha;',
    'attribute vec3 a_rand;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform float u_designAspect;',
    'uniform vec2 u_cursor;',
    'uniform float u_cursorSpeed;',
    'uniform float u_energy;',
    'uniform float u_dpr;',
    'uniform float u_pointBase;',
    'varying vec3 v_color;',
    'varying float v_alpha;',
    'void main() {',
    '  float viewportAspect = u_res.x / u_res.y;',
    '  vec2 fit = viewportAspect > u_designAspect',
    '    ? vec2(u_designAspect / viewportAspect, 1.0)',
    '    : vec2(1.0, viewportAspect / u_designAspect);',
    '  vec2 p = a_home * fit;',
    '  vec2 cursorP = (u_cursor - 0.5) * 2.0;',
    '  float d = distance(p, cursorP);',
    '  float localKick = u_cursorSpeed * exp(-d * d * 6.0);',
    '  float globalKick = smoothstep(a_rand.y * 0.6, 1.0, u_energy);',
    '  float mass = mix(1.5, 0.55, a_alpha);',
    '  float disturb = clamp((localKick + globalKick) * mass, 0.0, 1.6);',
    '  float ang = a_rand.x * 6.28318 + u_time * (0.35 + a_rand.z * 0.55);',
    '  vec2 dir = vec2(cos(ang), sin(ang));',
    '  float radius = disturb * (0.09 + a_rand.z * 0.13);',
    '  float idle = 0.012 + 0.008 * sin(u_time * 0.6 + a_rand.x * 6.28318);',
    '  vec2 pos = p + dir * (radius + idle * mix(1.0, 0.4, a_alpha));',
    '  gl_Position = vec4(pos, 0.0, 1.0);',
    '  float size = u_pointBase * (0.55 + a_alpha * 0.85) * (1.0 - disturb * 0.32) * (0.8 + a_rand.z * 0.35);',
    '  gl_PointSize = max(1.0, size * u_dpr);',
    '  v_color = a_color;',
    '  v_alpha = a_alpha * mix(1.0, 0.55, min(disturb, 1.0));',
    '}'
  ].join('\n');

  var INLINE_FRAG = [
    'precision mediump float;',
    'varying vec3 v_color;',
    'varying float v_alpha;',
    'uniform float u_luma;',
    'void main() {',
    '  vec2 c = gl_PointCoord * 2.0 - 1.0;',
    '  float r = length(c);',
    '  float soft = smoothstep(1.0, 0.0, r);',
    '  float core = smoothstep(0.35, 0.0, r) * 0.85;',
    '  vec3 col = v_color * (soft * 0.85 + core);',
    '  float a = v_alpha * soft;',
    '  float luma = dot(col, vec3(0.299, 0.587, 0.114));',
    '  if (luma > u_luma) col *= u_luma / max(luma, 0.0001);',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  function shaders() {
    return (window.NB_ATOMIZER_SHADERS) || { vert: INLINE_VERT, frag: INLINE_FRAG };
  }

  function compileShader(gl, type, src, label) {
    if (window.NB_GL) return window.NB_GL.compileShader(gl, type, src, label);
    return inlineCompileShader(gl, type, src, label);
  }

  function buildProgram(gl, vertSrc, fragSrc, label) {
    if (window.NB_GL) return window.NB_GL.buildProgram(gl, vertSrc, fragSrc, label);
    return inlineBuildProgram(gl, vertSrc, fragSrc, label);
  }

  function dprForViewport() {
    if (window.NB_GL) return window.NB_GL.dprForViewport();
    var small = Math.min(window.innerWidth, window.innerHeight) <= 480;
    return Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
  }

  function reducedMotion() {
    if (window.NB_GL) return window.NB_GL.reducedMotion();
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function deviceTier() {
    if (window.NB_GL) return window.NB_GL.deviceTier();
    var w = Math.min(window.innerWidth, window.innerHeight);
    var cores = navigator.hardwareConcurrency || 4;
    if (w <= 480 || cores <= 3) return 'low';
    if (w <= 1024 || cores <= 6) return 'mid';
    return 'high';
  }

  // ---------------------------------------------------------------------
  // Tunables
  // ---------------------------------------------------------------------
  var TIER_TARGET_COUNT = { low: 1800, mid: 4200, high: 8200 };
  var DESIGN_W = 640, DESIGN_H = 360;         // offscreen raster composition
  var ALPHA_THRESHOLD = 18;                    // 0-255, skip near-transparent px
  // The 0.15 token caps brightness *behind body copy*. Nothing in this
  // composition sits behind the plain-text caption (it's rendered on pure
  // black beneath the art box), and the particle mark itself is display-
  // scale content, so it gets the "large/bold display type" allowance the
  // README raises the ceiling to (0.26) rather than the body-copy ceiling.
  // If a future integration ever overlays running text on top of the
  // canvas, drop that text through --color-bg-scrim as the README already
  // prescribes for the rest of the identity system — don't lower this.
  var LUMA_CAP = 0.26;
  var RISE_PER_SEC = 5.5;                      // energy attack (scroll kick in)
  var DECAY_PER_SEC = 1.8;                     // energy release (settle back)
  var CROSSFADE_MS = 320;
  var SLOW_FRAME_MS = 22;
  var SLOW_STREAK = 30;
  var MIN_SCALE = 0.55;

  var F = {
    ok: false,
    init: init,
    destroy: destroy,
    setScroll: setScroll
  };

  var s = null; // live instance state, null while not running

  function fail(reason) {
    if (reason) { try { console.warn('hero.js: ' + reason); } catch (e) {} }
    // Deliberately does NOT tear down the still images/caption — that is the
    // permanent, correct fallback design, not an error state to hide.
    if (s && s.canvas && s.canvas.parentNode) { s.canvas.parentNode.removeChild(s.canvas); }
    if (s) { s.glFailed = true; }
    F.ok = false;
  }

  // -- offscreen raster -> particle buffers --------------------------------

  function rasterComposition(markImg, wordImg) {
    var c = document.createElement('canvas');
    c.width = DESIGN_W; c.height = DESIGN_H;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);

    var mh = 148;
    var mw = mh * (markImg.naturalWidth / markImg.naturalHeight || 0.75);
    var mx = DESIGN_W / 2 - mw / 2, my = 22;
    ctx.drawImage(markImg, mx, my, mw, mh);

    var ww = 428;
    var wh = ww * (wordImg.naturalHeight / wordImg.naturalWidth || 0.167);
    var wx = DESIGN_W / 2 - ww / 2, wy = my + mh + 20;
    ctx.drawImage(wordImg, wx, wy, ww, wh);

    return ctx.getImageData(0, 0, DESIGN_W, DESIGN_H);
  }

  /** Scans the raster once (init-time only, never per-frame) and returns
   *  Float32Arrays sized to ~targetCount particles, subsampled evenly from
   *  every above-threshold pixel so density stays proportional across the
   *  mark and wordmark rather than clumping wherever pixels happen to land. */
  function buildParticleBuffers(imageData, targetCount) {
    var w = imageData.width, h = imageData.height, data = imageData.data;
    var candidates = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var a = data[i + 3];
        if (a > ALPHA_THRESHOLD) {
          candidates.push(x, y, data[i], data[i + 1], data[i + 2], a);
        }
      }
    }
    var total = candidates.length / 6;
    if (total === 0) return null;
    var stride = Math.max(1, Math.floor(total / targetCount));
    var count = Math.ceil(total / stride);

    var home = new Float32Array(count * 2);
    var color = new Float32Array(count * 3);
    var alpha = new Float32Array(count);
    var rand = new Float32Array(count * 3);

    var n = 0;
    for (var k = 0; k < total; k += stride) {
      if (n >= count) break;
      var base = k * 6;
      var px = candidates[base], py = candidates[base + 1];
      home[n * 2] = (px / w) * 2 - 1;
      home[n * 2 + 1] = -((py / h) * 2 - 1); // canvas y-down -> GL y-up
      color[n * 3] = candidates[base + 2] / 255;
      color[n * 3 + 1] = candidates[base + 3] / 255;
      color[n * 3 + 2] = candidates[base + 4] / 255;
      alpha[n] = candidates[base + 5] / 255;
      rand[n * 3] = Math.random();
      rand[n * 3 + 1] = Math.random();
      rand[n * 3 + 2] = Math.random();
      n++;
    }
    return { home: home, color: color, alpha: alpha, rand: rand, count: n };
  }

  // -- DOM ------------------------------------------------------------------

  function buildDom(host) {
    var wrap = document.createElement('div');
    wrap.className = 'nb-atomizer';
    wrap.style.position = 'relative';
    wrap.style.width = '100%';
    wrap.style.height = '100%';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.gap = 'clamp(0.75rem, 2.5vw, 1.5rem)';

    // Plain flow, not aspect-ratio + percentage-height children: that
    // combination cycles (a child's percentage height needs the parent's
    // resolved height, which here depends on aspect-ratio, which some
    // engines settle by falling back to content-based sizing) and blows the
    // composition's height out to the size of the images at their intrinsic
    // resolution. Fixed percentage *widths* with height:auto avoid the cycle
    // entirely and still keep the mark/wordmark in the same proportion the
    // offscreen raster (rasterComposition) uses, so the DOM fallback and the
    // particle composition read as the same piece.
    var art = document.createElement('div');
    art.className = 'nb-atomizer__art';
    art.style.position = 'relative';
    art.style.width = 'min(92vw, 640px)';
    art.style.aspectRatio = (DESIGN_W / DESIGN_H).toFixed(4);
    art.style.display = 'flex';
    art.style.flexDirection = 'column';
    art.style.alignItems = 'center';

    var mark = document.createElement('img');
    mark.className = 'nb-atomizer__mark';
    mark.src = 'brand/logo.svg';
    mark.alt = '';
    mark.setAttribute('aria-hidden', 'true');
    mark.width = 120; mark.height = 160;
    mark.decoding = 'async';
    mark.style.width = '17.4%';
    mark.style.height = 'auto';
    mark.style.marginTop = '6%';
    mark.style.display = 'block';

    var word = document.createElement('img');
    word.className = 'nb-atomizer__wordmark';
    word.src = 'brand/wordmark.svg';
    word.alt = 'Northbound Studio';
    word.width = 598; word.height = 100;
    word.decoding = 'async';
    word.style.width = '67%';
    word.style.height = 'auto';
    word.style.marginTop = '5%';
    word.style.display = 'block';

    art.appendChild(mark);
    art.appendChild(word);

    var caption = document.createElement('p');
    caption.className = 'nb-atomizer__caption';
    caption.textContent = 'Sites that sell while you sleep.';
    caption.style.margin = '0';
    caption.style.font = '600 clamp(1.05rem, 1rem + 0.6vw, 1.4rem)/1.4 var(--font-text, "Instrument Sans", system-ui, sans-serif)';
    caption.style.color = 'var(--color-text-secondary, #9a9ba3)';
    caption.style.textAlign = 'center';
    caption.style.letterSpacing = 'var(--tracking-wide, 0.02em)';
    caption.style.maxWidth = '34ch';
    caption.style.padding = '0 1rem';

    wrap.appendChild(art);
    wrap.appendChild(caption);
    host.appendChild(wrap);

    return { wrap: wrap, art: art, mark: mark, word: word, caption: caption };
  }

  // -- GL setup ---------------------------------------------------------------

  function setupGl(canvas) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }) ||
           canvas.getContext('experimental-webgl', { alpha: true, antialias: false });
    } catch (e) { gl = null; }
    return gl;
  }

  function uploadBuffers(gl, prog, buffers) {
    function makeBuf(loc, arr, size) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return buf;
    }
    var locHome = gl.getAttribLocation(prog, 'a_home');
    var locColor = gl.getAttribLocation(prog, 'a_color');
    var locAlpha = gl.getAttribLocation(prog, 'a_alpha');
    var locRand = gl.getAttribLocation(prog, 'a_rand');
    makeBuf(locHome, buffers.home, 2);
    makeBuf(locColor, buffers.color, 3);
    makeBuf(locAlpha, buffers.alpha, 1);
    makeBuf(locRand, buffers.rand, 3);
  }

  function resize() {
    if (!s || !s.canvas) return;
    var w = window.innerWidth, h = s.art.clientHeight || window.innerHeight;
    s.dpr = dprForViewport() * s.scaleFactor;
    var cw = Math.max(1, Math.round(s.art.clientWidth * s.dpr));
    var ch = Math.max(1, Math.round(s.art.clientHeight * s.dpr));
    if (s.canvas.width !== cw || s.canvas.height !== ch) {
      s.canvas.width = cw; s.canvas.height = ch;
    }
    s.canvas.style.width = s.art.clientWidth + 'px';
    s.canvas.style.height = s.art.clientHeight + 'px';
    if (s.gl) s.gl.viewport(0, 0, cw, ch);
    s.resUniform = [cw, ch];
  }

  function onPointer(e) {
    if (!s) return;
    s.hasOwnCursor = true;
    s.cursorX = e.clientX / window.innerWidth;
    s.cursorY = 1 - e.clientY / window.innerHeight;
  }

  function currentCursor() {
    var m = window.NB_MOTION;
    if (m && m.cursor) return { x: m.cursor.sx, y: 1 - m.cursor.sy, speed: m.cursor.speed };
    return { x: s.cursorX, y: s.cursorY, speed: s.ownSpeed || 0 };
  }

  function tick(dt, now) {
    if (!s || s.paused || !s.gl) return;
    var t0 = performance.now();
    s.time += dt;

    // scroll velocity -> energy, attack/decay like ripple.js's strength spring
    var scrollDelta = Math.abs(s.scroll - s.lastScroll);
    s.lastScroll = s.scroll;
    var scrollVel = Math.min(1, (scrollDelta / Math.max(dt, 0.001)) * 2.2);

    var cur = currentCursor();
    if (!window.NB_MOTION) {
      // minimal own smoothing so the effect still reads without motion.js
      s.ownSx = (s.ownSx === undefined ? s.cursorX : s.ownSx);
      s.ownSy = (s.ownSy === undefined ? s.cursorY : s.ownSy);
      var k = Math.min(1, dt * 10);
      var dx = s.cursorX - s.ownSx, dy = s.cursorY - s.ownSy;
      s.ownSx += dx * k; s.ownSy += dy * k;
      s.ownSpeed = Math.min(1, Math.hypot(dx, dy) / Math.max(dt, 0.001) * 0.35);
      cur = { x: s.ownSx, y: s.ownSy, speed: s.ownSpeed };
    }

    var target = Math.min(1, scrollVel * 1.15 + cur.speed * 0.25);
    var rate = target > s.energy ? RISE_PER_SEC : DECAY_PER_SEC;
    var diff = target - s.energy;
    s.energy += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);

    var gl = s.gl;
    gl.uniform2fv(s.u.res, s.resUniform);
    gl.uniform1f(s.u.time, s.time);
    gl.uniform1f(s.u.designAspect, DESIGN_W / DESIGN_H);
    gl.uniform2f(s.u.cursor, cur.x, cur.y);
    gl.uniform1f(s.u.cursorSpeed, cur.speed);
    gl.uniform1f(s.u.energy, s.energy);
    gl.uniform1f(s.u.dpr, s.dpr);
    gl.uniform1f(s.u.pointBase, s.pointBase);
    gl.uniform1f(s.u.luma, LUMA_CAP);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, s.particleCount);

    if (!s.revealed) {
      s.revealed = true;
      s.canvas.style.transition = 'opacity ' + CROSSFADE_MS + 'ms ' + 'ease-out';
      s.canvas.style.opacity = '1';
      s.mark.style.transition = 'opacity ' + CROSSFADE_MS + 'ms ease-out';
      s.word.style.transition = 'opacity ' + CROSSFADE_MS + 'ms ease-out';
      s.mark.style.opacity = '0';
      s.word.style.opacity = '0';
    }

    var frameMs = performance.now() - t0;
    if (frameMs > SLOW_FRAME_MS) {
      s.slowStreak++;
      if (s.slowStreak >= SLOW_STREAK && s.scaleFactor > MIN_SCALE) {
        s.scaleFactor = Math.max(MIN_SCALE, s.scaleFactor * 0.6);
        s.slowStreak = 0;
        resize();
        try { console.warn('hero.js: sustained frame cost, scaling canvas resolution to ' + s.scaleFactor); } catch (e) {}
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

  // -- lifecycle --------------------------------------------------------------

  function init(opts) {
    if (s) return F;
    opts = opts || {};
    var host = opts.host;
    if (!host) { try { console.warn('hero.js: init() requires opts.host'); } catch (e) {} return F; }

    var dom = buildDom(host);
    s = {
      host: host,
      wrap: dom.wrap,
      art: dom.art,
      mark: dom.mark,
      word: dom.word,
      caption: dom.caption,
      canvas: null,
      gl: null,
      time: 0,
      scroll: 0, lastScroll: 0,
      energy: 0,
      cursorX: 0.5, cursorY: 0.5,
      paused: false,
      reduced: reducedMotion(),
      scaleFactor: 1,
      slowStreak: 0,
      revealed: false,
      glFailed: false,
      rafId: null, rafLast: 0, offFrame: null
    };

    // Case 1: reduced motion. The two <img>s are the finished hero. Done.
    if (s.reduced) {
      F.ok = true;
      return F;
    }

    // Wait for both real images to be ready, then attempt the GL layer.
    // This never blocks or delays their own paint — decoding is async and
    // owned by the browser regardless of what this function does next.
    var pending = 0, failed = false;
    function ready() {
      pending--;
      if (failed || pending > 0) return;
      startGl();
    }
    function onErr() { failed = true; fail('mark/wordmark failed to load — static lockup remains the hero'); }

    [dom.mark, dom.word].forEach(function (img) {
      pending++;
      if (img.complete && img.naturalWidth > 0) { ready(); return; }
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', onErr, { once: true });
    });

    document.addEventListener('visibilitychange', function () {
      if (!s) return;
      s.paused = document.hidden;
    });

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });

    F.ok = true; // static lockup is already a fully valid "ok" hero
    return F;
  }

  function startGl() {
    if (!s || s.canvas) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'nb-atomizer__gl';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = '0';
    canvas.style.display = 'block';

    var gl = setupGl(canvas);
    if (!gl) { fail('no WebGL context — static lockup remains the hero'); return; }

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      fail('context lost');
    }, false);

    var buffers;
    try {
      var imageData = rasterComposition(s.mark, s.word);
      var tier = deviceTier();
      buffers = buildParticleBuffers(imageData, TIER_TARGET_COUNT[tier] || TIER_TARGET_COUNT.mid);
    } catch (e) {
      fail('raster/particle build failed: ' + e.message);
      return;
    }
    if (!buffers || !buffers.count) { fail('no particles sampled from source art'); return; }

    var prog;
    try {
      var src = shaders();
      prog = buildProgram(gl, src.vert, src.frag, 'hero.js atomizer');
    } catch (e) {
      fail(e.message);
      return;
    }
    gl.useProgram(prog);
    uploadBuffers(gl, prog, buffers);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    s.canvas = canvas;
    s.gl = gl;
    s.particleCount = buffers.count;
    s.pointBase = 2.8; // CSS px, scaled by dpr in-shader
    s.u = {
      res: gl.getUniformLocation(prog, 'u_res'),
      time: gl.getUniformLocation(prog, 'u_time'),
      designAspect: gl.getUniformLocation(prog, 'u_designAspect'),
      cursor: gl.getUniformLocation(prog, 'u_cursor'),
      cursorSpeed: gl.getUniformLocation(prog, 'u_cursorSpeed'),
      energy: gl.getUniformLocation(prog, 'u_energy'),
      dpr: gl.getUniformLocation(prog, 'u_dpr'),
      pointBase: gl.getUniformLocation(prog, 'u_pointBase'),
      luma: gl.getUniformLocation(prog, 'u_luma')
    };

    s.art.appendChild(canvas);
    resize();

    if (window.NB_MOTION && typeof window.NB_MOTION.onFrame === 'function') {
      s.offFrame = window.NB_MOTION.onFrame(tick);
    } else {
      s.rafId = requestAnimationFrame(ownRaf);
    }
  }

  function setScroll(v) {
    if (!s) return;
    s.scroll = Math.max(0, Math.min(1, v));
  }

  function destroy() {
    F.ok = false;
    if (!s) return;
    if (s.offFrame) { try { s.offFrame(); } catch (e) {} }
    if (s.rafId) { try { cancelAnimationFrame(s.rafId); } catch (e) {} }
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointer);
    if (s.gl) {
      try {
        var ext = s.gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (e) {}
    }
    if (s.wrap && s.wrap.parentNode) { s.wrap.parentNode.removeChild(s.wrap); }
    s = null;
  }

  window.NB_HERO = F;
})();
