/* Northbound — virtual scroll for the descent.
 *
 * Native scroll and JS scroll must never share a floor: the previous attempt
 * preventDefault-ed only near floor edges and let native scroll run the rest
 * of the time, so trackpad inertia and the JS snap animation fought each
 * other on any floor taller than the window. Here JS owns the whole thing —
 * html/body overflow is hidden, the descent never actually scrolls, and a
 * wrapper element is translated instead. There is nothing left to hand off.
 *
 * The wrapper is driven by the shared spring in motion.js rather than a
 * second rAF loop, so it inherits the same fixed-timestep integration that
 * keeps every other animation on this site frame-rate independent.
 */
(function () {
  'use strict';

  var IDLE_MS = 120;      // pause length before input settles into a snap
  var STIFFNESS = 170;
  var DAMPING = 26;
  var KEY = 'nb-scroll';
  var FORM_SELECTOR = 'input, select, textarea, [contenteditable="true"]';

  var api = {
    init: init,
    destroy: destroy,
    scrollToFloor: scrollToFloor,
    current: 0,
    offset: 0,
    progress: 0,
    enabled: false
  };

  var s = null; // live instance state, null while not running

  function toArray(list) { return Array.prototype.slice.call(list); }

  function isFormField(el) {
    while (el && el.nodeType === 1) {
      if (el.matches && el.matches(FORM_SELECTOR)) return true;
      el = el.parentElement;
    }
    return false;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Layout distance between the container's top and a descendant's top is
  // invariant under the container's own transform — both rects shift by the
  // same amount, so the difference cancels the current offset out. That lets
  // us recompute floor positions from getBoundingClientRect at any moment,
  // mid-scroll or otherwise, without unwinding the transform first.
  function relTop(container, el) {
    return el.getBoundingClientRect().top - container.getBoundingClientRect().top;
  }

  function measure() {
    s.floorStarts = s.sections.map(function (el) { return relTop(s.container, el); });
    var last = s.sections[s.sections.length - 1];
    var totalHeight = s.floorStarts[s.floorStarts.length - 1] + last.offsetHeight;
    s.maxOffset = Math.max(0, totalHeight - window.innerHeight);
    s.target = clamp(s.target, 0, s.maxOffset);
  }

  function nearestFloorIndex(value) {
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < s.floorStarts.length; i++) {
      var d = Math.abs(s.floorStarts[i] - value);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function computeCurrent(value) {
    var starts = s.floorStarts, n = starts.length;
    if (n === 0) return 0;
    if (value <= starts[0]) return 0;
    for (var i = 0; i < n - 1; i++) {
      if (value <= starts[i + 1]) {
        var span = starts[i + 1] - starts[i];
        return i + (span > 0 ? (value - starts[i]) / span : 0);
      }
    }
    return n - 1;
  }

  function setTarget(v) {
    s.target = clamp(v, 0, s.maxOffset);
  }

  function markInput() {
    s.lastInputAt = performance.now();
    s.settled = false;
  }

  function onWheel(e) {
    if (isFormField(e.target)) return;
    e.preventDefault(); // native scroll is off; there is nothing to defer to
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 18;             // DOM_DELTA_LINE ~ one text line
    else if (e.deltaMode === 2) d *= window.innerHeight; // DOM_DELTA_PAGE
    setTarget(s.target + d);
    markInput();
  }

  function onKeyDown(e) {
    if (isFormField(e.target)) return;
    var idx = nearestFloorIndex(s.target);
    var handled = true;
    switch (e.code) {
      case 'ArrowDown': case 'PageDown':
        idx = Math.min(s.floorStarts.length - 1, idx + 1); break;
      case 'ArrowUp': case 'PageUp':
        idx = Math.max(0, idx - 1); break;
      case 'Space':
        idx = e.shiftKey ? Math.max(0, idx - 1) : Math.min(s.floorStarts.length - 1, idx + 1);
        break;
      case 'Home': idx = 0; break;
      case 'End': idx = s.floorStarts.length - 1; break;
      default: handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    setTarget(s.floorStarts[idx]);
    markInput();
  }

  var touch = null;
  function onTouchStart(e) {
    if (isFormField(e.target)) return;
    var t = e.touches[0];
    touch = { y: t.clientY, t: performance.now(), v: 0, startTarget: s.target };
  }
  function onTouchMove(e) {
    if (!touch) return;
    e.preventDefault();
    var t = e.touches[0];
    var now = performance.now();
    var dy = touch.y - t.clientY; // drag up = content moves up = scroll down
    var dt = Math.max(1, now - touch.t);
    touch.v = dy / dt; // px/ms, used for release inertia
    setTarget(touch.startTarget + dy);
    touch.y = t.clientY;
    touch.t = now;
    touch.startTarget = s.target;
    markInput();
  }
  function onTouchEnd() {
    if (!touch) return;
    // A short flick carries momentum past the last touchmove sample; a fixed
    // multiplier over the last known velocity approximates that carry without
    // a second integrator, then the shared spring takes over the deceleration.
    setTarget(s.target + touch.v * 140);
    touch = null;
    markInput();
  }

  function onFocusIn(e) {
    if (!s) return;
    var r = e.target.getBoundingClientRect();
    if (r.top < 0) setTarget(s.target + r.top);
    else if (r.bottom > window.innerHeight) setTarget(s.target + (r.bottom - window.innerHeight));
  }

  function onResize() { if (s) measure(); }

  function tick(dt, now) {
    if (!s) return;
    try {
      if (!s.settled && now - s.lastInputAt > IDLE_MS) {
        // Retarget only — the spring keeps its current velocity, so the snap
        // blends into whatever inertia is already running instead of cutting
        // it off and starting a fresh, jerky animation.
        setTarget(s.floorStarts[nearestFloorIndex(s.target)]);
        s.settled = true;
      }
      var value = window.NB_MOTION.spring(KEY, s.target, STIFFNESS, DAMPING);
      s.container.style.transform = 'translate3d(0,' + (-value) + 'px,0)';
      api.offset = value;
      api.progress = s.maxOffset > 0 ? clamp(value / s.maxOffset, 0, 1) : 0;
      api.current = computeCurrent(value);
      var idx = Math.round(api.current);
      if (idx !== s.lastFloor) {
        s.lastFloor = idx;
        if (typeof s.onFloorChange === 'function') s.onFloorChange(idx);
      }
    } catch (err) {
      console.error('scroll tick', err); // never let a throw drop this subscriber
    }
  }

  function init(opts) {
    opts = opts || {};
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !window.NB_MOTION) {
      // Leave native/CSS scroll-snap completely alone in both cases.
      api.enabled = false;
      return api;
    }

    var sections = opts.sections
      ? (typeof opts.sections === 'string' ? toArray(document.querySelectorAll(opts.sections)) : toArray(opts.sections))
      : toArray(document.querySelectorAll('[data-floor]'));
    if (!sections.length) { api.enabled = false; return api; }

    var container = opts.container || sections[0].parentElement;
    if (!container) { api.enabled = false; return api; }

    var html = document.documentElement, body = document.body;
    s = {
      container: container,
      sections: sections,
      onFloorChange: opts.onFloorChange,
      target: 0,
      floorStarts: [],
      maxOffset: 0,
      lastInputAt: 0,
      settled: true,
      lastFloor: 0,
      prevHtmlOverflow: html.style.overflow,
      prevBodyOverflow: body.style.overflow,
      prevContainerWillChange: container.style.willChange,
      unsub: null
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    container.style.willChange = 'transform';
    window.scrollTo(0, 0);

    measure();

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('resize', onResize);

    s.unsub = window.NB_MOTION.onFrame(tick);
    api.enabled = true;
    return api;
  }

  function destroy() {
    if (!s) return;
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('focusin', onFocusIn);
    window.removeEventListener('resize', onResize);
    if (s.unsub) s.unsub();

    document.documentElement.style.overflow = s.prevHtmlOverflow;
    document.body.style.overflow = s.prevBodyOverflow;
    s.container.style.willChange = s.prevContainerWillChange;
    s.container.style.transform = '';

    s = null;
    touch = null;
    api.enabled = false;
  }

  function scrollToFloor(i) {
    if (!s) return;
    var idx = clamp(i, 0, s.floorStarts.length - 1);
    setTarget(s.floorStarts[idx]);
    s.settled = true; // already the snap target, nothing left to idle towards
    markInput();
  }

  window.NB_SCROLL = api;
})();
