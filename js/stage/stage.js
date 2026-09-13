/* Northbound — the Stage.
 *
 * One canvas, one WebGL context, one render loop, four acts.
 *
 * Every act on this site is a hand-written GL system, and the temptation with
 * four of them is to let each own its own canvas and its own rAF. That is how
 * a site ends up with four frame budgets and no way to reason about any of
 * them. So: the Stage owns the context and the loop, and an act is a plain
 * object implementing the interface below. An act never calls
 * requestAnimationFrame, never calls getContext, never adds a resize listener.
 *
 * The loop is not ours either — it is the one already running in js/motion.js,
 * subscribed to via NB_MOTION.onFrame. There is exactly one rAF on this page
 * and motion.js holds it. See the scar-tissue comment in that file about the
 * two drivers that both stepped the springs, which made NB_MOTION.fps read
 * ~120 and the 60fps perf gate pass fraudulently. Same failure mode, same
 * rule: one driver, and it is not this file.
 *
 * ---------------------------------------------------------------------------
 * TIER AND MODE ARE ORTHOGONAL. This is the correction that matters most.
 *
 *   tier  1..3   how much GPU budget this machine has.
 *   mode  full | reduced   whether the visitor wants motion at all.
 *
 * js/gl/afford.js currently answers false to canAfford() whenever
 * NB_MOTION.reduced is true, which collapses the two axes into one. The
 * machine this site is built on has Reduce Motion on system-wide, so under
 * that rule every local session resolves to the cheapest tier and the full
 * quality path is never seen by the people building it. The Stage reads the
 * budget from deviceTier() and the mode from matchMedia, separately, and a
 * high-tier machine in reduced mode gets ONE beautifully composed still frame
 * per act — not a degraded animation, and never a blank canvas.
 * ---------------------------------------------------------------------------
 *
 * THE ACT CONTRACT — frozen. Four departments code against this in parallel.
 *
 *   An act module is an ES module whose default export is:
 *
 *   {
 *     manifest: {
 *       id:       'northlight' | 'drift' | 'solution' | 'work',
 *       label:    string,              // shown in the budget table
 *       window:   [enter, exit],       // scroll range in page progress 0..1
 *       cost:     1..5,                // relative GPU cost at tier 3
 *       fboBudget: number,             // ctx.target() throws past this
 *       requires: string[],            // GLCaps keys; unmet -> fallback() not init()
 *       preload:  number               // docProgress ahead of window to import+init
 *     },
 *
 *     init(ctx)         Allocate every GL object here and nowhere else. May be
 *                       async (Act III awaits document.fonts.ready). Must be
 *                       safe to call again after dispose() — context-loss
 *                       recovery depends on it. Throwing is handled: the Stage
 *                       catches, marks the act failed, and calls fallback().
 *                       Do not try/catch to hide a failure.
 *     resize(w,h,dpr)   Backing store already sized. Reallocate size-dependent
 *                       targets here.
 *     update(dt,p,ctx)  CPU only. NO gl.* calls — that separation is what lets
 *                       the Stage measure submission cost per act. dt is
 *                       seconds, clamped by motion.js, and 0 in reduced mode.
 *                       p is 0..1 within this act's own window.
 *     draw(alpha,ctx)   All gl.* work. Multiply your output by alpha. Leave GL
 *                       state exactly as you found it (see BASELINE below).
 *     drawStill(ctx)    Optional. Called once in reduced mode instead of the
 *                       draw loop. Compose the act's single best frame. This
 *                       is the default local experience — art-direct it first,
 *                       not last.
 *     fallback(ctx)     Optional. Called instead of init() when requires is
 *                       unmet or init() threw. No GL. Make the act's DOM read
 *                       as finished, intentional design. This is the path the
 *                       no-WebGL perf gate exercises: zero console errors.
 *     dispose()         Delete only what you made with raw gl.* calls. Anything
 *                       from ctx.program/ctx.target/ctx.buffer/ctx.texture is
 *                       pooled and reclaimed for you. Never delete ctx.quad.
 *                       Must be idempotent and safe on a lost context.
 *     stats()           Optional. { particles: 131072, grid: 128 } for the
 *                       budget table. Called at most once a second.
 *   }
 *
 * THE GL STATE BASELINE the Stage guarantees before every draw(), and which
 * every act must restore before returning:
 *
 *   bindFramebuffer(FRAMEBUFFER, null)   viewport(0,0,canvas.w,canvas.h)
 *   disable(DEPTH_TEST) disable(CULL_FACE) disable(SCISSOR_TEST)
 *   enable(BLEND) blendFunc(ONE, ONE_MINUS_SRC_ALPHA) blendEquation(FUNC_ADD)
 *   colorMask(1,1,1,1) depthMask(false)
 *   activeTexture(TEXTURE0 + ctx.texUnitBase)
 *
 * If you switch to additive blending — the particle field does — restore it.
 * If you bind a target, call ctx.restore(). Never bindFramebuffer(null)
 * yourself. Texture units are slot-scoped: yours are [texUnitBase,
 * texUnitBase+3] and nobody else touches them. At most two acts are live at
 * once, and WebGL1 guarantees 8 units, so this always fits.
 *
 * ?strict=1 makes the Stage snapshot GL state around every draw() and throw on
 * divergence, naming the act and the parameter. Run it before calling an act
 * done; tests/stage.spec.ts runs it across every seam.
 */
(function () {
  'use strict';

  var CANVAS_ID = 'nb-stage';

  /* Cross-fade band and hysteresis, expressed in SCREENS rather than in page
     progress.
   
     They used to be fixed fractions of the document, which worked only while
     every section was about a screen tall. The offerings procession is ten
     screens, which squeezes the first three acts into 18% of the document
     between them — and at that point a 0.05 band is WIDER than the aurora's
     entire window, so the aurora could never reach full opacity at all. A
     constant that silently rescales when an unrelated section grows is not a
     constant, it is a trap.
   
     These are really distances: fade over about half a screen, warm up a screen
     early, let go two and a half screens away. Converted to progress at measure
     time, with floors so a short document keeps roughly the behaviour it had. */
  var BAND_SCREENS = 0.45;
  var WARM_SCREENS = 1.0;
  var COLD_SCREENS = 2.5;
  var BAND = 0.05;          // nominal, published on the API for tests
  var scrollSpan = 1;

  var DWELL_COLD = 4000;   // ms out of range before teardown is even considered
  var CALM = 0.08;         // never tear down while the user is still flinging

  var canvas = null, gl = null, isWebGL2 = false, caps = null, quad = null;
  var tier = 3, mode = 'full', lost = false, ok = false, strict = false;

  var acts = [];
  var records = new Map();
  var slots = [null, null];

  var vw = 0, vh = 0, dpr = 1;
  var progress = 0, velocity = 0, lastProgress = 0;
  var paused = Object.create(null), pauseCount = 0;
  var lastLiveKey = "";

  // --- capability probe ----------------------------------------------------

  /* Extension strings lie. ANGLE will hand you OES_texture_float and then
     refuse to render to it, and MAX_VERTEX_TEXTURE_IMAGE_UNITS is genuinely 0
     on some D3D9 paths — which makes every GPGPU technique on this page
     impossible, not merely slow. So each format is proved by allocating a 2x2
     target and asking checkFramebufferStatus, and the answer is cached. */
  function renderable(internal, type) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 2, 2, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var okStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return okStatus;
  }

  function probe() {
    var ext = function (n) { return gl.getExtension(n); };
    var floatOk = false, halfOk = false, halfType = null;

    if (isWebGL2) {
      ext('EXT_color_buffer_float');
      floatOk = renderable(gl.RGBA32F, gl.FLOAT);
      halfOk = renderable(gl.RGBA16F, gl.HALF_FLOAT);
      halfType = gl.HALF_FLOAT;
    } else {
      if (ext('OES_texture_float')) floatOk = renderable(gl.RGBA, gl.FLOAT);
      var hf = ext('OES_texture_half_float');
      if (hf) { halfType = hf.HALF_FLOAT_OES; halfOk = renderable(gl.RGBA, halfType); }
    }

    return {
      version: isWebGL2 ? 2 : 1,
      renderFloat: floatOk,
      renderHalfFloat: halfOk,
      halfType: halfType,
      /* Filtering is a narrower gate than renderability, and semi-Lagrangian
         advection is DEFINED by bilinear sampling of the back-traced point.
         NEAREST advection is visibly blocky, so the fluid act must check this
         and not merely renderFloat. */
      linearFloat: isWebGL2 ? !!ext('OES_texture_float_linear') : !!ext('OES_texture_float_linear'),
      linearHalfFloat: isWebGL2 ? true : !!ext('OES_texture_half_float_linear'),
      instanced: isWebGL2 || !!ext('ANGLE_instanced_arrays'),
      transformFeedback: isWebGL2,
      vao: isWebGL2 || !!ext('OES_vertex_array_object'),
      /* Zero on some ANGLE D3D9 paths. Any GPGPU path needs >= 1; below that
         an act must fall back to analytic, stateless motion. */
      vertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) || 0,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048,
      maxPointSize: (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1]
    };
  }

  /* Budget only. Never the motion mode — see the header. Never 0: an act
     degrades, it does not switch off. A background that vanishes on a
     mid-range phone reads as broken, and broken is the one impression this
     page cannot afford. */
  function computeTier() {
    var forced = /[?&]tier=(\d)/.exec(location.search);
    if (forced) return Math.max(1, Math.min(3, +forced[1]));
    var d = window.NB_GL ? window.NB_GL.deviceTier() : 'high';
    var mem = navigator.deviceMemory;
    if (typeof mem === 'number' && mem <= 4) return 1;
    if (d === 'low') return 1;
    if (d === 'mid') return 2;
    return 3;
  }

  function computeMode() {
    /* ?motion=full is not a convenience. Reduce Motion is on system-wide on
       the machine this is built on, so without this the animated path would
       never be seen locally at all and would rot silently while the reduced
       path stayed excellent — the inverse of the usual failure, and the one
       nobody thinks to check. */
    if (/[?&]motion=full\b/.test(location.search)) return 'full';
    if (/[?&]motion=off\b/.test(location.search)) return 'reduced';
    return window.NB_GL && window.NB_GL.reducedMotion() ? 'reduced' : 'full';
  }

  // --- context -------------------------------------------------------------

  function makeContext() {
    var attrs = {
      alpha: true,
      antialias: false,   // nothing here draws an edge MSAA would help; it is pure cost
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      /* In reduced motion each act draws one composed frame and then nothing
         ever again, so the frame has to survive. Without this the browser
         hands back a cleared buffer on the very next composite and the
         visitor gets a blank canvas — which is exactly the failure the still
         path exists to avoid, and the one hardest to notice, because the DOM
         on top of it still looks fine. It costs nothing here: in this mode we
         are not drawing per frame at all. */
      preserveDrawingBuffer: mode === 'reduced',
      powerPreference: 'high-performance'
    };
    var c = canvas.getContext('webgl2', attrs);
    if (c) { isWebGL2 = true; return c; }
    isWebGL2 = false;
    return canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  }

  function onLost(e) {
    e.preventDefault();
    lost = true;
    /* Do NOT call dispose(): every gl.delete* is a no-op on a lost context and
       any readback throws. Drop straight to unborn and rebuild on restore. */
    records.forEach(function (r) { r.live = false; r.ctx = null; r.res = null; r.slot = -1; });
    slots[0] = slots[1] = null;
  }

  function onRestored() {
    gl = makeContext();
    if (!gl) { fail(); return; }
    caps = probe();
    makeQuad();
    lost = false;
    resize(true);
  }

  /* No context at all. The DOM layer IS the site; the canvas is a treatment on
     top of it. Say so in one attribute and let the stylesheet carry the page. */
  function fail() {
    ok = false;
    document.documentElement.setAttribute('data-gl', 'off');
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    records.forEach(function (r) { runFallback(r); });
  }

  function makeQuad() {
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // --- tracked resources ---------------------------------------------------

  function makeCtx(rec) {
    var res = rec.res;
    var budget = rec.act.manifest.fboBudget || 0;

    var ctx = {
      gl: gl,
      isWebGL2: isWebGL2,
      caps: caps,
      tier: tier,
      mode: mode,
      reduced: mode === 'reduced',
      quad: quad,
      slot: rec.slot,
      texUnitBase: rec.slot * 4,
      root: document.querySelector('[data-act="' + rec.act.manifest.id + '"]'),
      share: 1,          // frame share when two heavy acts overlap
      dpr: dpr, width: vw, height: vh,

      warn: function (m) { console.warn('[' + rec.act.manifest.id + '] ' + m); },

      /* a_pos is pinned to attribute 0 for every program built through the
         Stage. Attribute state is global to the context but locations are
         per-program and driver-assigned, so an act that sets its attribute up
         once and then switches programs is relying on all of them agreeing.
         Pinning makes them agree. Acts that query getAttribLocation get 0 and
         are unaffected; the name simply does not exist in programs that use a
         different one, and binding an absent name is a no-op. */
      program: function (vert, frag, label) {
        var p = window.NB_GL.buildProgram(
          gl, vert, frag, rec.act.manifest.id + ':' + (label || 'p'), { a_pos: 0 }
        );
        res.programs.push(p);
        return p;
      },
      buffer: function () { var b = gl.createBuffer(); res.buffers.push(b); return b; },
      texture: function () { var t = gl.createTexture(); res.textures.push(t); return t; },
      vao: function () {
        if (isWebGL2) { var v = gl.createVertexArray(); res.vaos.push(v); return v; }
        var e = gl.getExtension('OES_vertex_array_object');
        if (!e) return null;
        var v2 = e.createVertexArrayOES(); res.vaos.push(v2); return v2;
      },

      /* fmt: 'float' | 'half' | 'byte'. Falls down the chain rather than
         returning null — an act that must handle a null target is an act with
         two code paths for one idea. */
      target: function (w, h, fmt) {
        if (res.fbos.length >= budget) {
          throw new Error(rec.act.manifest.id + ': FBO budget of ' + budget + ' exceeded');
        }
        var type = gl.UNSIGNED_BYTE;
        var internal = isWebGL2 ? gl.RGBA8 : gl.RGBA;
        if (fmt === 'float' && caps.renderFloat) {
          type = gl.FLOAT; internal = isWebGL2 ? gl.RGBA32F : gl.RGBA;
        } else if ((fmt === 'float' || fmt === 'half') && caps.renderHalfFloat) {
          type = caps.halfType; internal = isWebGL2 ? gl.RGBA16F : gl.RGBA;
        }
        var linear = type === gl.UNSIGNED_BYTE
          || (type === gl.FLOAT ? caps.linearFloat : caps.linearHalfFloat);
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
        var filt = linear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        res.textures.push(tex); res.fbos.push(fbo);
        return { fbo: fbo, tex: tex, width: w, height: h, type: type, linear: linear };
      },

      /* Restores the Stage's target and viewport. Never bindFramebuffer(null)
         yourself — that punches a hole through the compositor. */
      restore: function () {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
      },

      /* A ping-pong pair, built here so the particle field and the fluid
         solver consume one implementation and neither writes its own. */
      pingPong: function (w, h, fmt) {
        var a = ctx.target(w, h, fmt), b = ctx.target(w, h, fmt);
        return {
          read: a, write: b, width: w, height: h,
          swap: function () { var t = this.read; this.read = this.write; this.write = t; }
        };
      }
    };
    return ctx;
  }

  function freshRes() { return { programs: [], buffers: [], textures: [], fbos: [], vaos: [] }; }

  function teardown(rec) {
    if (!rec.live) return;
    try { if (rec.act.dispose) rec.act.dispose(); } catch (e) { console.warn('dispose ' + rec.act.manifest.id, e); }
    if (gl && !lost && rec.res) {
      rec.res.programs.forEach(function (p) { gl.deleteProgram(p); });
      rec.res.buffers.forEach(function (b) { gl.deleteBuffer(b); });
      rec.res.textures.forEach(function (t) { gl.deleteTexture(t); });
      rec.res.fbos.forEach(function (f) { gl.deleteFramebuffer(f); });
      rec.res.vaos.forEach(function (v) {
        if (isWebGL2) gl.deleteVertexArray(v);
        else { var e = gl.getExtension('OES_vertex_array_object'); if (e) e.deleteVertexArrayOES(v); }
      });
    }
    if (rec.slot >= 0) slots[rec.slot] = null;
    rec.slot = -1; rec.res = null; rec.ctx = null; rec.live = false; rec.still = false;
  }

  function runFallback(rec) {
    if (rec.fellBack) return;
    rec.fellBack = true;
    var root = document.querySelector('[data-act="' + rec.act.manifest.id + '"]');
    if (root) root.setAttribute('data-act-state', 'static');
    try { if (rec.act.fallback) rec.act.fallback({ root: root, tier: tier, mode: mode }); }
    catch (e) { console.warn('fallback ' + rec.act.manifest.id, e); }
  }

  function claimSlot(rec) {
    if (slots[0] === null) { slots[0] = rec.act.manifest.id; return 0; }
    if (slots[1] === null) { slots[1] = rec.act.manifest.id; return 1; }
    return -1;
  }

  function unmet(req) {
    for (var i = 0; i < (req || []).length; i++) {
      var k = req[i];
      var v = caps[k];
      if (!v || (k === 'vertexTextureUnits' && v < 1)) return k;
    }
    return null;
  }

  function bringUp(rec) {
    if (rec.live || rec.failed || lost || !gl) return;
    var miss = unmet(rec.act.manifest.requires);
    if (miss) { rec.failed = true; runFallback(rec); return; }
    var slot = claimSlot(rec);
    if (slot < 0) return;  // both slots held; try again next frame
    rec.slot = slot;
    rec.res = freshRes();
    rec.ctx = makeCtx(rec);
    try {
      var r = rec.act.init(rec.ctx);
      var finish = function () {
        if (rec.act.resize) rec.act.resize(vw, vh, dpr);
        rec.live = true;
      };
      if (r && typeof r.then === 'function') r.then(finish, function (e) { onInitFail(rec, e); });
      else finish();
    } catch (e) { onInitFail(rec, e); }
  }

  function onInitFail(rec, e) {
    console.warn('init ' + rec.act.manifest.id, e);
    teardown(rec);
    rec.failed = true;
    runFallback(rec);
  }

  /* Acts 2-4 are imported at their preload margin rather than eagerly. Four
     acts' worth of modules and GLSL in the critical path would blow the
     1200ms LCP gate outright, and unlike a frame-rate miss an LCP miss cannot
     be recovered by dropping a tier. */
  function ensureLoaded(rec) {
    if (rec.mod || rec.loading || rec.failed) return;
    rec.loading = true;
    import(rec.src).then(function (m) {
      rec.act = m.default || m;
      rec.mod = true;
      rec.loading = false;
    }, function (e) {
      rec.loading = false; rec.failed = true;
      console.warn('load ' + rec.id, e);
      runFallback(rec);
    });
  }

  // --- scroll --------------------------------------------------------------

  function readProgress() {
    var span = (document.documentElement.scrollHeight - window.innerHeight) || 1;
    var p = window.scrollY / span;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  function smoothstep(a, b, x) {
    if (b === a) return x < a ? 0 : 1;
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  /* An act's band is capped at a third of its own window, so a short act still
     reaches full opacity in the middle of it. Without that cap a section that
     is small relative to the page never fully arrives. */
  function bandFor(w) {
    var byScreens = (BAND_SCREENS * (window.innerHeight || 800)) / scrollSpan;
    return Math.min(0.30 * (w[1] - w[0]), byScreens);
  }

  function warmP() { return Math.max(0.04, (WARM_SCREENS * (window.innerHeight || 800)) / scrollSpan); }
  function coldP() { return Math.max(0.10, (COLD_SCREENS * (window.innerHeight || 800)) / scrollSpan); }

  function fadeFor(w, p) {
    var b = bandFor(w);
    if (p < w[0] - b || p > w[1] + b) return 0;
    return Math.min(smoothstep(w[0] - b, w[0], p), 1 - smoothstep(w[1], w[1] + b, p));
  }

  /* An act's scroll window is measured from its own section, not declared as a
     fraction of the document.

     Hardcoding them looked fine and was wrong: the numbers in cast.js were
     guesses at where five sections would land, and the real layout put Act
     III's heading a full viewport and a half above the screen by the time the
     Stage believed that act was on stage. It rendered its type exactly where
     its type was — off the top of the window — so the canvas was blank with no
     error, no failed link, and nothing to find in a log. Measuring means the
     windows cannot drift when the copy changes length, which it will.

     An act is live from the moment its section starts entering the viewport
     until the moment it has fully left. Adjacent sections therefore overlap by
     nothing, and the Stage's BAND widens each seam into the cross-fade. */
  function measureWindows() {
    var span = (document.documentElement.scrollHeight - window.innerHeight) || 1;
    var vh = window.innerHeight;
    scrollSpan = span;
    var measured = [];

    records.forEach(function (r) {
      var el = document.querySelector('[data-act="' + r.id + '"]');
      if (!el) { r.win = r.manifest.window; return; }
      var rect = el.getBoundingClientRect();
      var top = rect.top + window.scrollY;
      /* The act owns the scroll while its section's body crosses the middle of
         the screen. Using "enters the viewport" to "fully leaves" instead gives
         every act a window two viewports long, so neighbours overlap by a whole
         screen and three acts end up live at once — which is one more than the
         frame budget assumes. Measuring against the midline makes consecutive
         windows butt exactly, and the Stage's BAND is then the only overlap. */
      r.win = [
        Math.max(0, Math.min(1, (top - vh * 0.5) / span)),
        Math.max(0, Math.min(1, (top + rect.height - vh * 0.5) / span))
      ];
      measured.push(r);
    });

    /* Whatever runs last holds the stage through the closing section and the
       footer. Letting it end at its own section's edge would leave the canvas
       empty behind the contact form, which reads as the page having broken
       rather than having finished. */
    if (measured.length) {
      measured.sort(function (a, b) { return a.win[0] - b.win[0]; });
      measured[measured.length - 1].win[1] = 1;
    }
  }

  function winOf(rec) { return rec.win || rec.manifest.window; }

  function localOf(w, p) {
    var span = (w[1] - w[0]) || 1;
    var t = (p - w[0]) / span;
    return t < 0 ? 0 : (t > 1 ? 1 : t);
  }

  // --- resize --------------------------------------------------------------

  function resize(force) {
    if (!gl || !canvas) return;
    var nd = window.NB_GL.dprForViewport();
    var w = window.innerWidth, h = window.innerHeight;
    if (!force && w === vw && h === vh && nd === dpr) return;
    vw = w; vh = h; dpr = nd;
    measureWindows();
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    records.forEach(function (r) {
      if (!r.ctx) return;
      r.ctx.width = vw; r.ctx.height = vh; r.ctx.dpr = dpr;
      if (!r.live) return;
      try {
        if (r.act.resize) r.act.resize(vw, vh, dpr);
        r.still = false;   // a still frame must be recomposed at the new size
      } catch (e) { console.warn('resize ' + r.act.manifest.id, e); }
    });
  }

  // --- strict-mode GL state guard -----------------------------------------
  /* One context shared by four independently authored acts, with no shared
     conversation between their authors, is the highest-probability failure in
     this whole design. The particle field leaves additive blending set; the
     aurora renders blown out in exactly the one scroll position where both are
     live, and neither author can reproduce it alone. This catches it by name. */
  var WATCH = ['BLEND', 'DEPTH_TEST', 'CULL_FACE', 'SCISSOR_TEST',
               'BLEND_SRC_RGB', 'BLEND_DST_RGB', 'BLEND_EQUATION_RGB',
               'FRAMEBUFFER_BINDING', 'ACTIVE_TEXTURE', 'DEPTH_WRITEMASK'];

  function snapshot() {
    var s = {};
    for (var i = 0; i < WATCH.length; i++) s[WATCH[i]] = gl.getParameter(gl[WATCH[i]]);
    return s;
  }

  function compare(before, after, id) {
    for (var i = 0; i < WATCH.length; i++) {
      var k = WATCH[i];
      if (String(before[k]) !== String(after[k])) {
        throw new Error('act "' + id + '" left GL state dirty: ' + k +
                        ' was ' + before[k] + ', is ' + after[k]);
      }
    }
  }

  // --- frame instrumentation ----------------------------------------------
  /* NB_MOTION.fps counts rAF callbacks, and rAF keeps firing at 60Hz while the
     GPU queue grows — right up until it collapses to 30. It is blind to
     exactly the failure a four-act GL showcase produces, and this repo has
     already shipped one perf gate that passed fraudulently. So the number this
     site publishes is frame SPAN in milliseconds, with a per-act breakdown. */
  var spans = new Float32Array(600), spanAt = 0, spanN = 0;
  var perAct = Object.create(null);

  function record(store, ms) {
    store.buf[store.at] = ms;
    store.at = (store.at + 1) % store.buf.length;
    if (store.n < store.buf.length) store.n++;
  }

  function percentile(buf, n, q) {
    if (!n) return 0;
    var a = Array.prototype.slice.call(buf, 0, n).sort(function (x, y) { return x - y; });
    return a[Math.min(n - 1, Math.floor(n * q))];
  }

  // --- frame ---------------------------------------------------------------

  function frame(dt) {
    if (!gl || lost || !ok || pauseCount > 0) return;
    var t0 = performance.now();

    lastProgress = progress;
    progress = readProgress();
    var inst = Math.min(1, Math.abs(progress - lastProgress) * 40);
    velocity = inst > velocity ? velocity + (inst - velocity) * 0.35 : velocity * 0.92;

    var step = mode === 'reduced' ? 0 : dt;
    var live = [], heavy = 0, now = performance.now();
    var wanted = [], evictable = [], idle = [], i, rec, man;

    /* Pass 1 — who wants to be on stage, and who is far enough away to give up
       a slot. Classify before acting: deciding and evicting in the same loop
       is how the deadlock below got written in the first place. */
    for (i = 0; i < acts.length; i++) {
      rec = records.get(acts[i]);
      if (rec.failed) continue;
      man = rec.mod ? rec.act.manifest : rec.manifest;
      rec._man = man;
      var win = winOf(rec);

      var warm = Math.max(man.preload || 0, warmP());
      var cold = coldP();
      var near = progress >= win[0] - warm && progress <= win[1] + warm;
      var far = progress < win[0] - cold || progress > win[1] + cold;

      if (near) {
        rec.outSince = 0;
        if (!rec.live) wanted.push(rec);
      } else if (far) {
        if (!rec.outSince) rec.outSince = now;
        if (rec.live) evictable.push(rec);
      }

      /* Anything live that is contributing nothing to this frame is a
         legitimate donor when a slot is contended. Restricting donors to the
         `far` set left a dead zone between the two margins where an act held a
         slot it could not be asked to give up: at 91% of the scroll the
         particle field was neither near enough to want its slot nor far enough
         to lose it, so Act IV never got on stage at all and the page simply
         ended after the fluid. Donors are ordered furthest-from-view first. */
      if (rec.live && fadeFor(win, progress) === 0) {
        rec._dist = Math.min(Math.abs(progress - win[0]), Math.abs(progress - win[1]));
        idle.push(rec);
      }
    }
    idle.sort(function (a, b) { return b._dist - a._dist; });

    /* Pass 2 — bring up what is wanted, evicting to make room if we must.
       There are only two slots, and the eviction used to require that the
       visitor had stopped scrolling. During a continuous scroll the velocity
       never falls, so the first two acts held both slots forever and acts III
       and IV could never come up at all — the page silently ended after the
       particle field. Contention now overrides the anti-thrash brakes: an act
       that is a full COLD margin outside its own window is not going to be
       drawn, so if something else needs its slot it gives it up now. */
    for (i = 0; i < wanted.length; i++) {
      rec = wanted[i];
      ensureLoaded(rec);
      if (!rec.mod) continue;
      if (slots[0] !== null && slots[1] !== null) {
        var give = idle.shift();
        if (!give) break;          // both slots held by acts that are actually drawing
        var gi = evictable.indexOf(give);
        if (gi >= 0) evictable.splice(gi, 1);
        teardown(give);
      }
      bringUp(rec);
    }

    /* Pass 3 — the unhurried path. Nothing is waiting, so an act only goes
       when it has been out of range a while and the visitor has settled. */
    for (i = 0; i < evictable.length; i++) {
      rec = evictable[i];
      if (rec.live && now - rec.outSince > DWELL_COLD && velocity < CALM) teardown(rec);
    }

    for (i = 0; i < acts.length; i++) {
      rec = records.get(acts[i]);
      if (rec.failed || !rec.live) continue;
      man = rec._man || rec.manifest;
      var f = fadeFor(winOf(rec), progress);
      if (f > 0) {
        live.push({ rec: rec, fade: f, man: man });
        if (man.cost >= 4) heavy++;
      }
    }

    /* Reduced motion: each act composes one frame and holds it. The context
       was created with preserveDrawingBuffer, so when there is nothing new to
       compose we return before touching the canvas at all — no clear, no draw,
       no GL work whatsoever for a visitor who asked for no motion. Clearing
       here unconditionally is what made the still frame blank: it was drawn
       once and wiped on the very next frame. */
    if (mode === 'reduced') {
      var stale = false;
      var key = '';
      for (i = 0; i < live.length; i++) {
        key += live[i].man.id + '|';
        if (!live[i].rec.still) stale = true;
      }
      /* An act leaving the live set is also stale state: its pixels are still
         on the preserved buffer and nothing else would ever clear them. */
      if (key !== lastLiveKey) { stale = true; lastLiveKey = key; }
      if (!stale) return;
      composeStill(live);
      spans[spanAt] = performance.now() - t0;
      spanAt = (spanAt + 1) % spans.length;
      if (spanN < spans.length) spanN++;
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(false);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    /* Two heavy acts in one frame is the seam between the particle field and
       the fluid. Dropping one would be a hard cut, which is far uglier than a
       soft one, so instead each is told it has half the frame and each is
       required to have a cheaper mode for the ~0.1 of scroll this lasts. */
    var share = heavy > 1 ? 1 / heavy : 1;

    for (var j = 0; j < live.length; j++) {
      var L = live[j], id = L.man.id;
      L.rec.ctx.share = L.man.cost >= 4 ? share : 1;
      L.rec.ctx.tier = tier;

      var a0 = performance.now();
      try {
        L.rec.act.update(step, localOf(winOf(L.rec), progress), L.rec.ctx);
        gl.activeTexture(gl.TEXTURE0 + L.rec.slot * 4);
        var before = strict ? snapshot() : null;
        L.rec.act.draw(L.fade, L.rec.ctx);
        if (strict) compare(before, snapshot(), id);
      } catch (e) { onFrameFail(L.rec, e); continue; }

      if (!perAct[id]) perAct[id] = { buf: new Float32Array(240), at: 0, n: 0, label: L.man.label };
      record(perAct[id], performance.now() - a0);
    }

    spans[spanAt] = performance.now() - t0;
    spanAt = (spanAt + 1) % spans.length;
    if (spanN < spans.length) spanN++;
  }

  /* One composed frame per live act, drawn together so that a newly-arrived
     neighbour cannot wipe the one already standing. Every live act is redrawn
     whenever any of them is stale, because the clear takes them all.
     drawStill is the act's poster: it does not track scroll and it does not
     advance time. Scroll-linked composition is motion, and this is the path
     for a visitor who asked for none. */
  function composeStill(live) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(false);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (var i = 0; i < live.length; i++) {
      var L = live[i], id = L.man.id;
      L.rec.ctx.share = 1;
      L.rec.ctx.tier = tier;
      var a0 = performance.now();
      try {
        gl.activeTexture(gl.TEXTURE0 + L.rec.slot * 4);
        if (L.rec.act.drawStill) {
          L.rec.act.drawStill(L.rec.ctx);
        } else {
          L.rec.act.update(0, localOf(winOf(L.rec), progress), L.rec.ctx);
          L.rec.act.draw(1, L.rec.ctx);
        }
        L.rec.still = true;
      } catch (e) { onFrameFail(L.rec, e); continue; }

      /* Composing a still costs something too — Act III runs a short burst of
         its solver to settle the frame — and an act that reports nothing here
         is indistinguishable from an act that never ran. */
      if (!perAct[id]) perAct[id] = { buf: new Float32Array(240), at: 0, n: 0, label: L.man.label };
      record(perAct[id], performance.now() - a0);
    }
  }

  function onFrameFail(rec, e) {
    console.warn('frame ' + rec.act.manifest.id, e);
    teardown(rec);
    rec.failed = true;
    runFallback(rec);
  }

  // --- boot ----------------------------------------------------------------

  function boot() {
    canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = CANVAS_ID;
      canvas.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(canvas, document.body.firstChild);
    }

    /* Mode before context: it decides preserveDrawingBuffer, which can only be
       set at creation time. */
    mode = computeMode();

    gl = makeContext();
    if (!gl) { fail(); return; }

    caps = probe();
    makeQuad();
    tier = computeTier();
    strict = /[?&]strict=1\b/.test(location.search);
    ok = true;

    var root = document.documentElement;
    root.setAttribute('data-gl', 'on');
    root.setAttribute('data-tier', String(tier));
    root.setAttribute('data-motion', mode);

    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);

    measureWindows();
    resize(true);
    window.addEventListener('resize', function () { resize(false); }, { passive: true });
    window.addEventListener('orientationchange', function () { resize(true); }, { passive: true });

    /* Web fonts land after first paint and change how tall the type is, which
       moves every section under it. Re-measure once the page has settled, and
       again when a font finishes loading. */
    window.addEventListener('load', function () { measureWindows(); }, { once: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measureWindows(); });
    }

    window.NB_MOTION.onFrame(frame);
  }

  // --- public --------------------------------------------------------------

  var API = {
    BAND: BAND,

    /* Declared in index.html before any act module exists. The Stage imports
       each src at its own preload margin. */
    declare: function (id, src, manifest) {
      if (records.has(id)) return;
      manifest.id = id;
      records.set(id, {
        id: id, src: src, manifest: manifest, act: null, mod: false, loading: false,
        ctx: null, res: null, live: false, failed: false, fellBack: false,
        still: false, slot: -1, outSince: 0
      });
      acts.push(id);
      /* Measure immediately. The cast is declared by a deferred script, and
         deferred scripts run when readyState is already "interactive" — so the
         Stage has usually booted and measured before a single act existed.
         Measuring only at boot left every act on the placeholder window
         declared in cast.js, which is how Act III came to be "on stage" a
         viewport and a half after its own section had scrolled away. */
      if (document.body) measureWindows();
      acts.sort(function (a, b) {
        return winOf(records.get(a))[0] - winOf(records.get(b))[0];
      });
    },

    /* Reference-counted. Act IV parks the whole stage when a live iframe
       opens: an Astro site with its own rAF composited over a particle field
       and a fluid solver is not a frame budget that exists on any device, and
       the visitor is looking at the work, which is the point of the act. */
    pause: function (why) { if (!paused[why]) { paused[why] = 1; pauseCount++; } },
    resume: function (why) { if (paused[why]) { delete paused[why]; pauseCount--; } },

    setTier: function (t) {
      tier = Math.max(1, Math.min(3, t));
      document.documentElement.setAttribute('data-tier', String(tier));
      records.forEach(function (r) { if (r.ctx) { r.ctx.tier = tier; r.still = false; } });
    },

    /** Frame span in ms, p50/p95, plus the per-act breakdown. This is what
     *  scripts/perf.mjs reads and what the page publishes. */
    budget: function () {
      var out = { p50: percentile(spans, spanN, 0.5), p95: percentile(spans, spanN, 0.95), samples: spanN, acts: {} };
      Object.keys(perAct).forEach(function (k) {
        var s = perAct[k];
        out.acts[k] = { label: s.label, p50: percentile(s.buf, s.n, 0.5), p95: percentile(s.buf, s.n, 0.95) };
      });
      return out;
    },

    debug: function () {
      var n = { programs: 0, buffers: 0, textures: 0, fbos: 0, vaos: 0, live: 0 };
      records.forEach(function (r) {
        if (!r.live || !r.res) return;
        n.live++;
        n.programs += r.res.programs.length; n.buffers += r.res.buffers.length;
        n.textures += r.res.textures.length; n.fbos += r.res.fbos.length; n.vaos += r.res.vaos.length;
      });
      var wins = {};
      records.forEach(function (r) { wins[r.id] = winOf(r); });
      return { progress: progress, velocity: velocity, tier: tier, mode: mode,
               ok: ok, caps: caps, resources: n, windows: wins };
    },

    get progress() { return progress; },
    get tier() { return tier; },
    get mode() { return mode; },
    get ok() { return ok; }
  };

  window.NB_STAGE = API;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
