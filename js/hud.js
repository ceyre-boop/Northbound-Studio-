/* hud.js — instrument-panel HUD. Four rows, all real values.
 *
 * No fake numbers: LOADED reads Navigation Timing, RENDER reads NB_MOTION.fps
 * (falling back to its own rAF sampler only if NB_MOTION isn't present), and
 * STATUS/FLOOR are whatever the caller's getters return. If a value can't be
 * measured, the row shows "--" rather than lying.
 *
 * Static markup is built once at mount() so the box's height never changes
 * as text fills in — that's what keeps CLS at zero while fonts are still
 * loading.
 */
(function () {
  'use strict';

  var UPDATE_HZ = 4;
  var UPDATE_MS = 1000 / UPDATE_HZ;

  var state = {
    root: null,
    opts: null,
    timer: null,
    rafId: null,
    fpsFrames: 0,
    fpsAcc: 0,
    fpsLast: 0,
    ownFps: null // only used when NB_MOTION.fps isn't available
  };

  function fmt(v, digits) {
    return (v === null || v === undefined || Number.isNaN(v)) ? '--' : v.toFixed(digits);
  }

  function readLoaded() {
    if (!window.performance || !performance.getEntriesByType) return null;
    var nav = performance.getEntriesByType('navigation')[0];
    if (!nav || !nav.loadEventEnd || nav.loadEventEnd <= 0) return null;
    var startTime = nav.startTime || 0;
    return (nav.loadEventEnd - startTime) / 1000;
  }

  function readFps() {
    if (window.NB_MOTION && typeof window.NB_MOTION.fps === 'number' && window.NB_MOTION.fps > 0) {
      return window.NB_MOTION.fps;
    }
    return state.ownFps;
  }

  // Self-measured fallback sampler — only runs when NB_MOTION isn't on the
  // page, so the HUD never adds a second rAF loop on top of the site's own.
  function tickOwnFps(now) {
    if (state.fpsLast) {
      var dt = (now - state.fpsLast) / 1000;
      state.fpsAcc += dt;
      state.fpsFrames++;
      if (state.fpsAcc >= 0.5) {
        state.ownFps = Math.round(state.fpsFrames / state.fpsAcc);
        state.fpsAcc = 0;
        state.fpsFrames = 0;
      }
    }
    state.fpsLast = now;
    state.rafId = requestAnimationFrame(tickOwnFps);
  }

  function row(label, valueId) {
    return (
      '<div class="nb-hud__row">' +
        '<span class="nb-hud__label">' + label + '</span>' +
        '<span class="nb-hud__value nb-tabular" id="' + valueId + '">--</span>' +
      '</div>'
    );
  }

  function mount(opts) {
    if (!opts || !opts.host) throw new Error('NB_HUD.mount requires opts.host');
    destroy(); // idempotent — a re-mount tears down any prior instance first

    state.opts = opts;
    var el = document.createElement('div');
    el.className = 'nb-hud nb-brackets';
    el.setAttribute('aria-hidden', 'true'); // decorative instrumentation, not content
    el.innerHTML =
      row('Status', 'nb-hud-status') +
      row('Loaded', 'nb-hud-loaded') +
      row('Render', 'nb-hud-render') +
      row('Floor', 'nb-hud-floor');
    opts.host.appendChild(el);
    state.root = el;

    if (!(window.NB_MOTION && typeof window.NB_MOTION.fps === 'number')) {
      state.rafId = requestAnimationFrame(tickOwnFps);
    }

    render();
    state.timer = setInterval(render, UPDATE_MS);
    return el;
  }

  function render() {
    if (!state.root) return;
    var opts = state.opts;

    var status = typeof opts.status === 'function' ? opts.status() : null;
    var loaded = readLoaded();
    var fps = readFps();
    var floor = typeof opts.floor === 'function' ? opts.floor() : null;

    var $status = document.getElementById('nb-hud-status');
    var $loaded = document.getElementById('nb-hud-loaded');
    var $render = document.getElementById('nb-hud-render');
    var $floor = document.getElementById('nb-hud-floor');

    if ($status) $status.textContent = status || '--';
    if ($loaded) $loaded.textContent = loaded === null ? '--' : fmt(loaded, 2) + 's';
    if ($render) $render.textContent = (fps === null || fps === undefined) ? '--' : Math.round(fps) + 'fps';
    if ($floor) $floor.textContent = (typeof floor === 'number' && !Number.isNaN(floor)) ? String(floor) : '--';
  }

  /** Public update() lets a caller force an immediate refresh (e.g. on floor change). */
  function update() {
    render();
  }

  function destroy() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (state.root && state.root.parentNode) state.root.parentNode.removeChild(state.root);
    state.root = null;
    state.opts = null;
    state.fpsFrames = 0;
    state.fpsAcc = 0;
    state.fpsLast = 0;
    state.ownFps = null;
  }

  window.NB_HUD = { mount: mount, update: update, destroy: destroy };
})();
