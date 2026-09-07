/* Northbound — Work Showcase.
 *
 * The three concept builds (Ridgeline Roofing / Marrow Coffee / Lumen
 * Interiors), full-bleed, each with its own light and its own reveal — the
 * second-most-immersive thing on the site after the hero. Not a card rail.
 *
 * This module owns exactly one job per case: the visual "stage" (poster +
 * light-on-form shader + lazy live iframe) and the interaction that turns
 * one into the other. It does NOT reimplement scroll choreography or entrance
 * reveals — [data-reveal] on any text inside a case is handled by the
 * already-shipped js/choreo.js. It does NOT touch index.html, tokens, or the
 * narrative layout. It shares the one render loop (js/motion.js) and never
 * starts a second rAF.
 *
 * ---------------------------------------------------------------------
 * HARD BROWSER CONSTRAINT this module is built around, not surprised by:
 * a live <iframe>'s pixels cannot be read into a WebGL texture, at any
 * origin, ever. So the shader only ever touches a static <img> poster.
 * The live iframe sits underneath the poster from the start (src withheld
 * via data-src until requested) and is revealed by parting the poster layer
 * with a clip-path iris once the iframe has actually loaded — never by
 * feeding iframe pixels to the GPU, never by opacity.
 * ---------------------------------------------------------------------
 *
 * ATTRIBUTE CONTRACT — markup this module expects to find already authored
 * (progressive enhancement: the composition below must be correct, legible
 * and navigable with zero JS; this module only adds the light and the
 * in-place preview on top of it, the same discipline js/choreo.js and
 * css/layout.css already hold elsewhere in this codebase).
 *
 * [data-showcase]              Root. One per page. Also carries
 *                              data-section="showcase" for whatever scroll
 *                              system the integrator wires up — this module
 *                              does not depend on it.
 *
 * [data-showcase-case="KEY"]   One per build. KEY should match a key in
 *                              NB_CONFIG.DEMOS (e.g. "atlas") so the demo URL
 *                              can be resolved if data-src is left off the
 *                              iframe. Real heading/body copy, the poster
 *                              <img>, and the "CONCEPT BUILD" label all live
 *                              in this markup, by hand — this module never
 *                              authors content.
 *
 * [data-showcase-light]        Optional override on a case: "hard" | "soft"
 *                              | "hairline" picks the light profile. Falls
 *                              back to a per-key default (atlas=hard,
 *                              vector=soft, halo=hairline) so a fourth case
 *                              added later without this attribute still gets
 *                              a considered light rather than a silent no-op.
 *
 * [data-showcase-stage]        Required inside a case. The full-bleed visual
 *                              box. css/showcase.css reserves its height
 *                              (100svh) so nothing here can cause CLS.
 *
 * [data-showcase-poster]       Required. The <img> poster — real src/alt,
 *                              renders with zero JS. Doubles as the WebGL
 *                              texture source. If it 404s, the case falls
 *                              back to the CSS-only light (same as no-WebGL).
 *
 * [data-showcase-frame]        Required. The lazy live preview <iframe>.
 *                              Its real URL lives in data-src (never src —
 *                              three eager iframes would cost the LCP
 *                              budget). title is required. Starts
 *                              tabindex="-1" aria-hidden="true"; this module
 *                              restores both once the preview is loaded.
 *
 * [data-showcase-trigger]      Any element inside the case (typically a
 *                              button) that requests the live preview.
 *                              Click/tap always works; on a fine pointer the
 *                              whole [data-showcase-stage] also arms on
 *                              hover-intent. Optional — the stage itself is
 *                              always a fallback trigger.
 *
 * [data-showcase-open]         Required. A real <a href="..." target="_blank"
 *                              rel="noopener">. The explicit, always-present
 *                              way to open the real site — independent of
 *                              JS, independent of whether the preview has
 *                              been requested in-place.
 *
 * Everything above is one sentence per attribute because that's the whole
 * contract; nothing else is read off the DOM. One optional, non-attribute
 * hook: a plain `.showcase__loading` element inside the stage (see
 * css/showcase.css) is purely CSS-driven off the `.is-loading` class this
 * module already applies to the case root while the iframe is in flight —
 * no data-attribute needed for it.
 *
 * Load order: js/motion.js, js/gl/showcase/shaders.js, then this file.
 *
 * Exports window.NB_SHOWCASE = { init(opts), destroy() }.
 */
(function () {
  'use strict';

  var LIGHT_DEFAULT_BY_KEY = { atlas: 'hard', vector: 'soft', halo: 'hairline' };
  var LIGHT_PROFILE_INDEX = { hard: 0, soft: 1, hairline: 2 };

  var ACTIVE_STIFFNESS = 90, ACTIVE_DAMPING = 20;
  var IRIS_STIFFNESS = 140, IRIS_DAMPING = 22;
  var POINTER_STIFFNESS = 120, POINTER_DAMPING = 18;

  var api = { init: init, destroy: destroy };
  var st = null;

  function toArray(list) { return Array.prototype.slice.call(list || []); }

  function hexToVec3(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length !== 6) return [1, 1, 1];
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b];
  }

  function readTokenColor(name, fallbackHex) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (v && v.charAt(0) === '#') return hexToVec3(v);
    } catch (e) { /* fall through */ }
    return hexToVec3(fallbackHex);
  }

  // --- GL setup, one context per case (only three, cheap) -----------------
  function createGL(canvas) {
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' }) ||
      canvas.getContext('experimental-webgl', { alpha: false, antialias: false });
    if (!gl) return null;

    var shaders = window.NB_SHOWCASE_SHADERS;
    if (!shaders) return null;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('showcase shader', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, shaders.vertex);
    var fs = compile(gl.FRAGMENT_SHADER, shaders.fragment);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('showcase program', gl.getProgramInfoLog(prog));
      return null;
    }

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    var aPos = gl.getAttribLocation(prog, 'aPos');
    var uniforms = {};
    ['uTexel', 'uTime', 'uProgress', 'uPointer', 'uPointerMix', 'uProfile', 'uIonTint', 'uFringeTint', 'uTex']
      .forEach(function (name) { uniforms[name] = gl.getUniformLocation(prog, name); });

    return { gl: gl, prog: prog, buf: buf, tex: tex, aPos: aPos, uniforms: uniforms, texReady: false };
  }

  function uploadTexture(handle, img) {
    var gl = handle.gl;
    gl.bindTexture(gl.TEXTURE_2D, handle.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      handle.texReady = true;
      handle.texW = img.naturalWidth || img.width || 1;
      handle.texH = img.naturalHeight || img.height || 1;
    } catch (e) {
      // Cross-origin poster without CORS headers, or a decode failure — fall
      // back to the CSS-only light rather than a dead black canvas.
      handle.texReady = false;
      handle.failed = true;
    }
  }

  function drawGL(handle, uniformValues) {
    var gl = handle.gl;
    if (!handle.texReady) return;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(handle.prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, handle.buf);
    gl.enableVertexAttribArray(handle.aPos);
    gl.vertexAttribPointer(handle.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, handle.tex);
    gl.uniform1i(handle.uniforms.uTex, 0);
    gl.uniform2f(handle.uniforms.uTexel, 1 / handle.texW, 1 / handle.texH);
    gl.uniform1f(handle.uniforms.uTime, uniformValues.time);
    gl.uniform1f(handle.uniforms.uProgress, uniformValues.progress);
    gl.uniform2f(handle.uniforms.uPointer, uniformValues.px, uniformValues.py);
    gl.uniform1f(handle.uniforms.uPointerMix, uniformValues.pointerMix);
    gl.uniform1f(handle.uniforms.uProfile, uniformValues.profile);
    gl.uniform3f(handle.uniforms.uIonTint, uniformValues.ion[0], uniformValues.ion[1], uniformValues.ion[2]);
    gl.uniform3f(handle.uniforms.uFringeTint, uniformValues.fringe[0], uniformValues.fringe[1], uniformValues.fringe[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function destroyGL(handle) {
    if (!handle) return;
    var gl = handle.gl;
    try {
      gl.deleteTexture(handle.tex);
      gl.deleteBuffer(handle.buf);
      gl.deleteProgram(handle.prog);
    } catch (e) { /* context may already be lost */ }
  }

  // --- per-case wiring ------------------------------------------------------
  function resizeCanvas(canvas, stage) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(stage.clientWidth * dpr));
    var h = Math.max(1, Math.round(stage.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function resolveDemoUrl(key, explicitSrc) {
    if (explicitSrc) return explicitSrc;
    var demos = (window.NB_CONFIG && window.NB_CONFIG.DEMOS) || {};
    return demos[key] || '';
  }

  function setupCase(el, index, ion, fringe) {
    var key = el.getAttribute('data-showcase-case') || ('case-' + index);
    var stage = el.querySelector('[data-showcase-stage]');
    var poster = el.querySelector('[data-showcase-poster]');
    var frame = el.querySelector('[data-showcase-frame]');
    var open = el.querySelector('[data-showcase-open]');
    var trigger = el.querySelector('[data-showcase-trigger]') || stage;

    if (!stage || !poster || !frame) {
      console.warn('showcase: case "' + key + '" is missing a required element (stage/poster/frame) — skipping.');
      return null;
    }

    // Dev-time guard for the non-negotiable labelling rule. Never blocks
    // rendering, never touches the DOM — just tells whoever authored the
    // markup they forgot the label.
    if (!/concept build/i.test(el.textContent || '')) {
      console.warn('showcase: case "' + key + '" has no visible "CONCEPT BUILD" label — labelling is non-negotiable.');
    }

    var lightName = el.getAttribute('data-showcase-light') || LIGHT_DEFAULT_BY_KEY[key] || 'soft';
    var profile = LIGHT_PROFILE_INDEX.hasOwnProperty(lightName) ? LIGHT_PROFILE_INDEX[lightName] : 1;

    var canvas = stage.querySelector('canvas[data-showcase-canvas]');
    var canvasCreatedByJs = false;
    if (!canvas && !st.cssOnly) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('data-showcase-canvas', '');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'showcase__gl';
      stage.insertBefore(canvas, poster.nextSibling);
      canvasCreatedByJs = true;
    }

    var gl = null;
    if (!st.cssOnly && canvas) {
      gl = createGL(canvas);
      if (!gl) {
        el.classList.add('is-css-fallback');
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        canvas = null;
      } else {
        canvas.classList.add('is-ready');
      }
    } else {
      el.classList.add('is-css-fallback');
    }

    function tryUploadPoster() {
      if (!gl) return;
      if (poster.complete && poster.naturalWidth > 0) {
        uploadTexture(gl, poster);
        if (gl.failed) el.classList.add('is-css-fallback');
      }
    }

    if (gl) {
      if (poster.complete) tryUploadPoster();
      else poster.addEventListener('load', tryUploadPoster);
      poster.addEventListener('error', function () { el.classList.add('is-css-fallback'); });
    }

    var demoUrl = resolveDemoUrl(key, frame.getAttribute('data-src'));
    if (open && !open.getAttribute('href')) open.setAttribute('href', demoUrl || '#');

    var activeKey = 'nb-showcase-active-' + key;
    var irisKey = 'nb-showcase-iris-' + key;
    var pxKey = 'nb-showcase-px-' + key;
    var pyKey = 'nb-showcase-py-' + key;

    var caseState = {
      key: key, el: el, stage: stage, poster: poster, frame: frame, canvas: canvas, gl: gl,
      canvasCreatedByJs: canvasCreatedByJs,
      profile: profile, isActive: false, isLoaded: false, isOpen: false,
      pointerMixTarget: 0, activeKey: activeKey, irisKey: irisKey, pxKey: pxKey, pyKey: pyKey,
      unbinds: []
    };

    function requestPreview(clientX, clientY) {
      if (caseState.isLoaded) return;
      caseState.isLoaded = true;
      var url = demoUrl;
      if (!url) return;
      var rect = stage.getBoundingClientRect();
      var ox = rect.width ? ((clientX != null ? clientX - rect.left : rect.width / 2) / rect.width) : 0.5;
      var oy = rect.height ? ((clientY != null ? clientY - rect.top : rect.height / 2) / rect.height) : 0.5;
      stage.style.setProperty('--nb-showcase-iris-x', (ox * 100).toFixed(2) + '%');
      stage.style.setProperty('--nb-showcase-iris-y', (oy * 100).toFixed(2) + '%');

      frame.setAttribute('src', url);
      frame.removeAttribute('data-src');
      el.classList.add('is-loading');

      function onLoad() {
        frame.removeAttribute('tabindex');
        frame.removeAttribute('aria-hidden');
        el.classList.remove('is-loading');
        el.classList.add('is-open');
        caseState.isOpen = true;
      }
      frame.addEventListener('load', onLoad, { once: true });

      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || !window.NB_MOTION) {
        // No motion (or no motion system at all): the spring loop that would
        // normally drive --nb-showcase-iris-r isn't running, so open the
        // iris directly. Still waits for the real 'load' event above before
        // exposing the iframe as focusable/interactive — only the animation
        // is skipped, not the correctness of when it becomes usable.
        stage.style.setProperty('--nb-showcase-iris-r', '150%');
        stage.classList.add('is-iris-instant');
      }
    }

    function onTriggerActivate(e) {
      var pt = e && (e.clientX != null ? e : (e.touches && e.touches[0]));
      requestPreview(pt ? pt.clientX : null, pt ? pt.clientY : null);
    }
    trigger.addEventListener('click', onTriggerActivate);
    caseState.unbinds.push(function () { trigger.removeEventListener('click', onTriggerActivate); });

    var isFinePointer = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (isFinePointer) {
      var onEnter = function (e) { requestPreview(e.clientX, e.clientY); };
      stage.addEventListener('pointerenter', onEnter);
      caseState.unbinds.push(function () { stage.removeEventListener('pointerenter', onEnter); });

      if (gl) {
        var onMove = function (e) {
          var rect = stage.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var px = (e.clientX - rect.left) / rect.width;
          var py = 1 - (e.clientY - rect.top) / rect.height; // GL v-space
          window.NB_MOTION.spring(pxKey, px, POINTER_STIFFNESS, POINTER_DAMPING);
          window.NB_MOTION.spring(pyKey, py, POINTER_STIFFNESS, POINTER_DAMPING);
          caseState.pointerMixTarget = 1;
        };
        var onLeave = function () { caseState.pointerMixTarget = 0; };
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerleave', onLeave);
        caseState.unbinds.push(function () {
          stage.removeEventListener('pointermove', onMove);
          stage.removeEventListener('pointerleave', onLeave);
        });
      }
    }

    return caseState;
  }

  // --- visibility gating: only the in-view case(s) actually draw ----------
  function watchActive(cases) {
    if (!('IntersectionObserver' in window)) {
      cases.forEach(function (c) { c.isActive = true; });
      return null;
    }
    var byEl = new Map();
    cases.forEach(function (c) { byEl.set(c.el, c); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var c = byEl.get(entry.target);
        if (!c) return;
        c.isActive = entry.isIntersecting && entry.intersectionRatio > 0.25;
      });
    }, { threshold: [0, 0.25, 0.5] });
    cases.forEach(function (c) { io.observe(c.el); });
    return io;
  }

  function tick(dt, now) {
    if (!st) return;
    var M = window.NB_MOTION;
    var time = now / 1000;
    st.cases.forEach(function (c) {
      if (!c.gl) return;
      if (c.isOpen) return; // live preview is up — stop spending GPU on the poster light.

      var activeTarget = c.isActive ? 1 : 0;
      var progress = M.spring(c.activeKey, activeTarget, ACTIVE_STIFFNESS, ACTIVE_DAMPING);
      var pointerMix = M.spring(c.key + '-pmix', c.pointerMixTarget, POINTER_STIFFNESS, POINTER_DAMPING);

      if (!c.isActive) return; // parked off-screen: skip the draw call entirely.

      resizeCanvas(c.canvas, c.stage);
      var px = M.valueOf(c.pxKey) || 0.5;
      var py = M.valueOf(c.pyKey) || 0.5;

      drawGL(c.gl, {
        time: time, progress: progress, px: px, py: py, pointerMix: pointerMix,
        profile: c.profile, ion: st.ion, fringe: st.fringe
      });
    });

    // Iris: parts the poster layer once the live preview has loaded, purely
    // via clip-path (never opacity) so the reveal reads as the material
    // itself opening rather than a cross-fade.
    st.cases.forEach(function (c) {
      var target = c.isLoaded ? 1 : 0;
      var v = M.spring(c.irisKey, target, IRIS_STIFFNESS, IRIS_DAMPING);
      var r = (v * 150).toFixed(2) + '%';
      c.stage.style.setProperty('--nb-showcase-iris-r', r);
    });
  }

  function init(opts) {
    opts = opts || {};
    var root = opts.root ? (typeof opts.root === 'string' ? document.querySelector(opts.root) : opts.root)
      : document.querySelector('[data-showcase]');
    if (!root) return api;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var caseEls = toArray(root.querySelectorAll('[data-showcase-case]'));

    st = {
      root: root,
      cases: [],
      io: null,
      unsubMotion: null,
      cssOnly: reduced || !window.NB_MOTION || !window.NB_SHOWCASE_SHADERS,
      ion: readTokenColor('--color-ion-500', '#6fe3ff'),
      fringe: readTokenColor('--color-fringe-500', '#ff7ad1')
    };

    caseEls.forEach(function (el, i) {
      var c = setupCase(el, i, st.ion, st.fringe);
      if (c) st.cases.push(c);
    });

    if (reduced) {
      // No motion: still wire the trigger/open affordances (done above),
      // just never spin up a render loop and never animate the iris — the
      // preview swap is instant, the composition is otherwise identical.
      root.classList.add('is-reduced-motion');
      return api;
    }

    st.io = watchActive(st.cases);
    if (window.NB_MOTION) st.unsubMotion = window.NB_MOTION.onFrame(tick);

    return api;
  }

  function destroy() {
    if (!st) return;
    if (st.io) st.io.disconnect();
    if (st.unsubMotion) st.unsubMotion();
    st.cases.forEach(function (c) {
      c.unbinds.forEach(function (fn) { fn(); });
      if (c.gl) destroyGL(c.gl);
      if (c.canvasCreatedByJs && c.canvas && c.canvas.parentNode) {
        c.canvas.parentNode.removeChild(c.canvas);
      }
      c.el.classList.remove('is-css-fallback', 'is-loading', 'is-open');
      c.stage.style.removeProperty('--nb-showcase-iris-r');
      c.stage.style.removeProperty('--nb-showcase-iris-x');
      c.stage.style.removeProperty('--nb-showcase-iris-y');
      c.stage.classList.remove('is-iris-instant');
    });
    if (st.root) st.root.classList.remove('is-reduced-motion');
    st = null;
  }

  window.NB_SHOWCASE = api;
})();
