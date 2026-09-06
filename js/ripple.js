/* ripple.js — case-card poster displacement.
 *
 * The Floor 02 rail shows a poster until its live demo iframe wakes up. On
 * hover the poster displaces via shader — never an opacity fade. The live
 * previews are same-origin-agnostic <iframe>s; their pixels cannot be read
 * into a WebGL texture from any origin, so the ripple only ever touches the
 * poster, and dissolves out once the caller tells it the iframe has loaded.
 *
 * Raw WebGL, one fullscreen triangle per instance, no imports. Rides the
 * site's single rAF loop via window.NB_MOTION.onFrame; falls back to its own
 * rAF only when NB_MOTION isn't present, and only while at least one card is
 * attached.
 */
(function () {
  'use strict';

  var VERT_SRC = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = vec2(a_pos.x, -a_pos.y) * 0.5 + 0.5;', // flip Y: texture space
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_SRC = [
    'precision mediump float;',
    'varying vec2 v_uv;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_cursor;',    // 0..1, local to the element, y down
    'uniform float u_strength;', // 0..1, decays to 0 when idle
    'uniform float u_time;',
    'uniform float u_dissolve;', // 0..1, 1 = fully handed off to the iframe

    'float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453123); }',

    'void main() {',
    '  vec2 uv = v_uv;',
    '  vec2 d = uv - u_cursor;',
    '  float r = length(d);',
    // a single soft ring propagating from the cursor, not a splash — the
    // displacement itself is the only tell, never a visible ring or seam
    '  float wave = sin(r * 26.0 - u_time * 3.2) * exp(-r * 6.0);',
    '  vec2 offset = normalize(d + 1e-4) * wave * 0.018 * u_strength;',
    '  vec3 col = texture2D(u_tex, uv + offset).rgb;',
    // dissolve: a soft noise-threshold wipe rather than a hard cut or fade
    '  float n = hash(floor(uv * 48.0));',
    '  float cut = step(u_dissolve, n);',
    '  gl_FragColor = vec4(col, cut * (1.0 - u_dissolve * 0.999));',
    '}'
  ].join('\n');

  var DECAY_PER_SEC = 2.6;     // how fast ripple strength settles when idle
  var RISE_PER_SEC = 6.0;      // how fast it rises on hover
  var DISSOLVE_MS = 550;

  var instances = [];
  var sharedRafId = null;
  var sharedOffFrame = null;

  var R = {
    attach: attach,
    detachAll: detachAll
  };

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
      throw new Error('ripple.js shader compile failed: ' + log);
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
      throw new Error('ripple.js program link failed: ' + log);
    }
    return prog;
  }

  // No real poster photograph exists yet on this build (procedural/SVG
  // placeholders only — see plan notes). Until a real screenshot URL is
  // passed in opts.image, this draws the same restrained cyan-on-charcoal
  // gradient the CSS poster already uses, so the module is never left
  // rippling a blank texture and needs no change once real posters land.
  function proceduralTexture(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(0,240,255,0.07)');
    g.addColorStop(0.6, 'rgba(6,6,8,1)');
    g.addColorStop(1, 'rgba(6,6,8,1)');
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,240,255,0.55)';
    ctx.fillRect(w * 0.06, h * 0.14, w * 0.5, h * 0.05);
    ctx.fillStyle = 'rgba(0,240,255,0.16)';
    ctx.fillRect(w * 0.06, h * 0.28, w * 0.32, h * 0.14);
    return c;
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function ensureSharedLoop() {
    if (sharedOffFrame || sharedRafId) return;
    if (window.NB_MOTION && typeof window.NB_MOTION.onFrame === 'function') {
      sharedOffFrame = window.NB_MOTION.onFrame(stepAll);
    } else {
      var last = null;
      var loop = function (now) {
        var dt = last == null ? 1 / 60 : Math.min(0.1, (now - last) / 1000);
        last = now;
        stepAll(dt, now);
        sharedRafId = requestAnimationFrame(loop);
      };
      sharedRafId = requestAnimationFrame(loop);
    }
  }

  function teardownSharedLoopIfIdle() {
    if (instances.length) return;
    if (sharedOffFrame) { try { sharedOffFrame(); } catch (e) {} sharedOffFrame = null; }
    if (sharedRafId) { try { cancelAnimationFrame(sharedRafId); } catch (e) {} sharedRafId = null; }
  }

  function stepAll(dt, now) {
    for (var i = 0; i < instances.length; i++) {
      stepInstance(instances[i], dt);
    }
  }

  function stepInstance(inst, dt) {
    if (inst.paused || inst.destroyed) return;
    inst.time += dt;
    var target = inst.hovering ? 1 : 0;
    var rate = inst.hovering ? RISE_PER_SEC : DECAY_PER_SEC;
    inst.strength += (target - inst.strength) * Math.min(1, dt * rate);
    if (Math.abs(inst.strength - target) < 0.001) inst.strength = target;

    if (inst.dissolveStart != null) {
      var t = (performance.now() - inst.dissolveStart) / DISSOLVE_MS;
      inst.dissolve = Math.max(0, Math.min(1, t));
      if (inst.dissolve >= 1) {
        inst.canvas.style.display = 'none';
        return; // handed off to the iframe, stop drawing
      }
    }

    var gl = inst.gl;
    gl.useProgram(inst.prog);
    gl.uniform1f(inst.u.time, inst.time);
    gl.uniform2f(inst.u.cursor, inst.cursorX, inst.cursorY);
    gl.uniform1f(inst.u.strength, inst.strength);
    gl.uniform1f(inst.u.dissolve, inst.dissolve);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resizeInstance(inst) {
    var r = inst.el.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (inst.canvas.width !== w || inst.canvas.height !== h) {
      inst.canvas.width = w;
      inst.canvas.height = h;
    }
    inst.canvas.style.width = r.width + 'px';
    inst.canvas.style.height = r.height + 'px';
    inst.gl.viewport(0, 0, w, h);
  }

  function noop() { return { detach: function () {} }; }

  /**
   * attach(el, opts) — el is the poster element (or its positioned
   * container). opts:
   *   image  — screenshot URL for the poster, optional (procedural fallback
   *            used until one exists)
   *   iframe — the live-preview <iframe> this card swaps in; when it fires
   *            'load' the ripple dissolves out and stops drawing
   * Returns { detach() }. No-ops without WebGL.
   */
  function attach(el, opts) {
    if (!el) return noop();
    opts = opts || {};

    var canvas = document.createElement('canvas');
    var gl;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true }) ||
           canvas.getContext('experimental-webgl', { alpha: true, antialias: false });
    } catch (e) {
      gl = null;
    }
    if (!gl) return noop();

    var prog;
    try {
      prog = buildProgram(gl);
    } catch (e) {
      try { console.warn(e.message); } catch (e2) {}
      return noop();
    }

    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';

    var computed = window.getComputedStyle(el);
    if (computed.position === 'static') el.style.position = 'relative';
    el.appendChild(canvas);

    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 1x1 transparent placeholder until the real source decodes
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    var inst = {
      el: el,
      canvas: canvas,
      gl: gl,
      prog: prog,
      tex: tex,
      u: {
        tex: gl.getUniformLocation(prog, 'u_tex'),
        cursor: gl.getUniformLocation(prog, 'u_cursor'),
        strength: gl.getUniformLocation(prog, 'u_strength'),
        time: gl.getUniformLocation(prog, 'u_time'),
        dissolve: gl.getUniformLocation(prog, 'u_dissolve')
      },
      time: 0,
      strength: 0,
      dissolve: 0,
      dissolveStart: null,
      cursorX: 0.5,
      cursorY: 0.5,
      hovering: false,
      paused: false,
      destroyed: false,
      onMove: null,
      onEnter: null,
      onLeave: null,
      onIframeLoad: null,
      resizeObserver: null
    };

    resizeInstance(inst);
    if (window.ResizeObserver) {
      inst.resizeObserver = new ResizeObserver(function () { resizeInstance(inst); });
      inst.resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', function () { resizeInstance(inst); }, { passive: true });
    }

    (function loadTexture() {
      if (opts.image) {
        loadImage(opts.image).then(function (img) {
          if (inst.destroyed) return;
          if (img) {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          } else {
            uploadProcedural();
          }
        });
      } else {
        uploadProcedural();
      }
    })();

    function uploadProcedural() {
      var src = proceduralTexture(512, 256);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }

    if (!reducedMotion()) {
      inst.onEnter = function () { inst.hovering = true; };
      inst.onMove = function (e) {
        var r = el.getBoundingClientRect();
        inst.cursorX = (e.clientX - r.left) / Math.max(1, r.width);
        inst.cursorY = (e.clientY - r.top) / Math.max(1, r.height);
      };
      inst.onLeave = function () { inst.hovering = false; };
      el.addEventListener('pointerenter', inst.onEnter, { passive: true });
      el.addEventListener('pointermove', inst.onMove, { passive: true });
      el.addEventListener('pointerleave', inst.onLeave, { passive: true });
    } else {
      canvas.style.display = 'none'; // one static frame is the poster itself
    }

    if (opts.iframe) {
      inst.onIframeLoad = function () { inst.dissolveStart = performance.now(); };
      opts.iframe.addEventListener('load', inst.onIframeLoad, { once: true });
    }

    document.addEventListener('visibilitychange', function () {
      inst.paused = document.hidden;
    });

    instances.push(inst);
    ensureSharedLoop();

    function detach() {
      if (inst.destroyed) return;
      inst.destroyed = true;
      var idx = instances.indexOf(inst);
      if (idx >= 0) instances.splice(idx, 1);
      if (inst.onEnter) el.removeEventListener('pointerenter', inst.onEnter);
      if (inst.onMove) el.removeEventListener('pointermove', inst.onMove);
      if (inst.onLeave) el.removeEventListener('pointerleave', inst.onLeave);
      if (opts.iframe && inst.onIframeLoad) opts.iframe.removeEventListener('load', inst.onIframeLoad);
      if (inst.resizeObserver) inst.resizeObserver.disconnect();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      try {
        var ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (e) {}
      teardownSharedLoopIfIdle();
    }

    return { detach: detach };
  }

  function detachAll() {
    // Copy first: detach() mutates `instances` while we iterate it.
    instances.slice().forEach(function (inst) {
      var idx = instances.indexOf(inst);
      if (idx >= 0) instances.splice(idx, 1);
      if (inst.canvas.parentNode) inst.canvas.parentNode.removeChild(inst.canvas);
      inst.destroyed = true;
    });
    teardownSharedLoopIfIdle();
  }

  window.NB_RIPPLE = R;
})();
