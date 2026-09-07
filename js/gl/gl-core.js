/* gl-core.js — tiny, shared, raw-WebGL boilerplate.
 *
 * Not a wrapper library (no three.js/OGL, no imports — this stays a static
 * site with no build step). Just the handful of lines every raw-WebGL file
 * in this repo (field.js, ripple.js, and now hero.js's atomizer) would
 * otherwise duplicate: shader compile/link with useful error text, a device
 * pixel ratio helper that caps DPR on small screens the way field.js already
 * does, and a coarse device-tier guess so a particle system or shader effect
 * can size itself down before it ever renders a frame.
 *
 * Optional. hero.js works if this file never loads — it carries its own
 * inline copies of compileShader/buildProgram so a missing <script> tag for
 * this file degrades to "slightly more code in hero.js," never to a broken
 * hero. Load it before js/hero.js to let hero.js skip that duplication.
 */
(function () {
  'use strict';

  function compileShader(gl, type, src, label) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error((label || 'gl-core') + ' shader compile failed: ' + log);
    }
    return sh;
  }

  function buildProgram(gl, vertSrc, fragSrc, label) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc, label);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, label);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error((label || 'gl-core') + ' program link failed: ' + log);
    }
    return prog;
  }

  /** Same DPR-capping rule field.js uses: small screens don't need >1.5x. */
  function dprForViewport() {
    var small = Math.min(window.innerWidth, window.innerHeight) <= 480;
    var cap = small ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** Coarse, cheap device tier — good enough to pick a particle budget with,
   *  not a benchmark. Callers should still adapt downward at runtime if
   *  frames run long (see field.js's slow-frame streak pattern).
   *
   *  Uses viewport WIDTH, not min(width, height): most desktop/laptop
   *  windows are wider than 1024 but shorter than it too (e.g. 1440x900),
   *  and min() was classifying nearly every widescreen monitor as "mid" —
   *  the exact bug that made the hero read as a phone-tier sparse point
   *  cloud on desktop. Width is what actually tracks device class here;
   *  a narrow *tall* window (a phone held upright) is still correctly "low". */
  function deviceTier() {
    var w = window.innerWidth;
    var cores = navigator.hardwareConcurrency || 4;
    if (w <= 480 || cores <= 3) return 'low';
    if (w <= 900 || cores <= 4) return 'mid';
    return 'high';
  }

  window.NB_GL = {
    compileShader: compileShader,
    buildProgram: buildProgram,
    dprForViewport: dprForViewport,
    reducedMotion: reducedMotion,
    deviceTier: deviceTier
  };
})();
