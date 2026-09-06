/* Northbound — magnetic CTAs and press/hover springs.
 *
 * Same rule as everywhere else on this layer: one render loop, owned by
 * motion.js. This file never calls requestAnimationFrame — it subscribes via
 * NB_MOTION.onFrame and writes transforms straight to nodes, once per frame,
 * for a small, fixed set of interactive elements (buttons, nav arrows). It
 * is not a per-node event-driven animation library; every value it moves is
 * a spring integrated in the shared 120Hz loop, so a CTA feels like it has
 * exactly the same mass as the scroll or the cursor dot.
 *
 * Reduced motion and touch are both checked once, at init, and gate whether
 * any listener is attached at all — matching the pattern in scroll.js rather
 * than trying to toggle behaviour live mid-session.
 */
(function () {
  'use strict';

  var DEFAULT_MAGNETIC_SELECTOR = '[data-nav], .nb-btn, [data-nb-cta]';
  var DEFAULT_INTERACTIVE_SELECTOR =
    '[data-nav], .nb-btn, [data-nb-cta], .nb-open, a[href^="mailto"]';

  // Magnetic pull. A CTA leans toward the cursor within this radius and
  // springs back the moment the cursor leaves it — never a linear return.
  var MAGNET_RADIUS = 90;       // px
  var MAGNET_MAX_PULL = 16;     // px — capped: it leans, it does not chase
  var MAGNET_STIFFNESS = 220;
  var MAGNET_DAMPING = 16;      // ratio ~0.54 — overshoots into place on approach, eases back off-release

  // Hover: fine-pointer only. A soft single overshoot on the way in, not a
  // scale-up-and-hold.
  var HOVER_STIFFNESS = 190;
  var HOVER_DAMPING = 17;       // ratio ~0.62
  var HOVER_SCALE = 0.045;      // subtle lift, same restraint as the scroll skew cap

  // Press: every pointer type, including touch. A real dip-and-rebound,
  // never an ease-out fade.
  var PRESS_STIFFNESS = 260;
  var PRESS_DAMPING = 15;       // ratio ~0.46 — firm dip, springs back past neutral before settling
  var PRESS_SCALE = 0.055;

  var api = { init: init, destroy: destroy };
  var st = null; // live instance state, null while not running

  function toArray(list) { return Array.prototype.slice.call(list); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function resolveElements(sel, root) {
    if (!sel) return [];
    if (typeof sel === 'string') return toArray((root || document).querySelectorAll(sel));
    if (sel.length !== undefined) return toArray(sel); // NodeList / array already handed to us
    return [sel]; // a single element
  }

  function onPointerMove(e) {
    st.pointerX = e.clientX;
    st.pointerY = e.clientY;
    st.pointerActive = true;
  }
  function onPointerLeaveWindow() { st.pointerActive = false; }

  function bindPress(item) {
    var el = item.el;
    function down() { item.pressTarget = 1; }
    function up() { item.pressTarget = 0; }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up); // dragging off while held releases the press
    item.unbindPress = function () {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
    };
  }

  function bindHover(item) {
    var el = item.el;
    function enter() { item.hoverTarget = 1; }
    function leave() { item.hoverTarget = 0; }
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    item.unbindHover = function () {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
    };
  }

  function tick(dt, now) {
    if (!st) return;
    try {
      var M = window.NB_MOTION;
      var items = st.items;
      var i, item;

      // Reads first: every magnetic element's rect, before any writes below
      // touch layout. The container these buttons sit in may be mid-scroll
      // (translated every frame by scroll.js), so rects are only ever valid
      // for the frame they're read in — cache-across-frames would drift.
      for (i = 0; i < items.length; i++) {
        item = items[i];
        if (!item.magnetic) continue;
        if (!st.pointerActive) { item.magnetTX = 0; item.magnetTY = 0; continue; }
        var r = item.el.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = st.pointerX - cx, dy = st.pointerY - cy;
        var dist = Math.hypot(dx, dy);
        if (dist >= MAGNET_RADIUS || dist === 0) {
          item.magnetTX = 0; item.magnetTY = 0;
        } else {
          var pull = (1 - dist / MAGNET_RADIUS) * MAGNET_MAX_PULL;
          item.magnetTX = (dx / dist) * pull;
          item.magnetTY = (dy / dist) * pull;
        }
      }

      // Writes: one spring read/write per axis per element, then a single
      // transform assignment. No setState anywhere in this loop.
      for (i = 0; i < items.length; i++) {
        item = items[i];
        var mx = item.magnetic ? M.spring(item.keyMX, item.magnetTX, MAGNET_STIFFNESS, MAGNET_DAMPING) : 0;
        var my = item.magnetic ? M.spring(item.keyMY, item.magnetTY, MAGNET_STIFFNESS, MAGNET_DAMPING) : 0;
        var hv = item.hoverable ? M.spring(item.keyHover, item.hoverTarget, HOVER_STIFFNESS, HOVER_DAMPING) : 0;
        var pv = M.spring(item.keyPress, item.pressTarget, PRESS_STIFFNESS, PRESS_DAMPING);
        var scale = 1 + hv * HOVER_SCALE - pv * PRESS_SCALE;
        item.el.style.transform =
          'translate3d(' + mx.toFixed(2) + 'px,' + my.toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')';
      }
    } catch (err) {
      console.error('interact tick', err); // never let a throw drop this subscriber
    }
  }

  function makeItem(el, index, magnetic, hoverable) {
    return {
      el: el,
      magnetic: magnetic,
      hoverable: hoverable,
      keyMX: 'nb-interact-mx-' + index,
      keyMY: 'nb-interact-my-' + index,
      keyHover: 'nb-interact-hover-' + index,
      keyPress: 'nb-interact-press-' + index,
      magnetTX: 0,
      magnetTY: 0,
      hoverTarget: 0,
      pressTarget: 0,
      prevTransform: el.style.transform,
      prevWillChange: el.style.willChange,
      unbindPress: null,
      unbindHover: null
    };
  }

  function init(opts) {
    opts = opts || {};
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !window.NB_MOTION) return api; // no listeners attached, layout untouched

    var isFinePointer = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    var root = opts.root || document;
    var magneticEls = resolveElements(opts.magnetic || DEFAULT_MAGNETIC_SELECTOR, root);
    var interactiveEls = resolveElements(opts.interactive || DEFAULT_INTERACTIVE_SELECTOR, root);

    // One item per unique element, magnetic and hover flags merged in rather
    // than double-binding an element that appears in both selector sets.
    var seen = new Map();
    var index = 0;
    function ensure(el, magnetic) {
      var item = seen.get(el);
      if (!item) {
        item = makeItem(el, index++, false, false);
        seen.set(el, item);
      }
      if (magnetic && isFinePointer) item.magnetic = true;
      return item;
    }
    interactiveEls.forEach(function (el) { ensure(el, false); });
    magneticEls.forEach(function (el) { ensure(el, true); });

    var items = Array.from(seen.values());
    items.forEach(function (item) {
      item.el.style.willChange = 'transform';
      bindPress(item);
      if (isFinePointer) { item.hoverable = true; bindHover(item); }
    });

    st = {
      items: items,
      pointerX: 0,
      pointerY: 0,
      pointerActive: false,
      unsub: null
    };

    if (isFinePointer && items.some(function (i) { return i.magnetic; })) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerleave', onPointerLeaveWindow, { passive: true });
    }

    st.unsub = window.NB_MOTION.onFrame(tick);
    return api;
  }

  function destroy() {
    if (!st) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerleave', onPointerLeaveWindow);
    if (st.unsub) st.unsub();

    st.items.forEach(function (item) {
      if (item.unbindPress) item.unbindPress();
      if (item.unbindHover) item.unbindHover();
      item.el.style.transform = item.prevTransform;
      item.el.style.willChange = item.prevWillChange;
    });

    st = null;
  }

  window.NB_INTERACT = api;
})();
