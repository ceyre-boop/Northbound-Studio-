/* Northbound — scroll choreography, section transitions, reveals, cursor presence.
 *
 * Same rules as the rest of this layer: one render loop (js/motion.js), no
 * setState, no opacity as an entrance/exit technique. Every reveal here is a
 * clip-path and/or transform driven by a spring integrated in the shared
 * 120Hz loop, so a heading mask and the scroll skew and a magnetic button
 * all feel like the same physical material.
 *
 * Wires js/scroll.js (virtual scroll, never handed to native) through this
 * module rather than leaving it merged-but-unused.
 *
 * ---------------------------------------------------------------------
 * ATTRIBUTE CONTRACT — this is the markup this module expects. The page is
 * being rebuilt from scratch elsewhere; nothing here assumes a DOM shape
 * beyond these attributes existing somewhere under the passed-in root.
 * ---------------------------------------------------------------------
 *
 * [data-section]           Top-level scroll floors. Handed straight to
 *                          js/scroll.js as its section list. One per screen
 *                          of the descent.
 *
 * [data-section-wipe]      Opt-in on a [data-section]: when the virtual
 *                          scroll lands on this floor, a fixed curtain does
 *                          one diagonal wipe across the viewport as it
 *                          settles. Skipped on the section that's already
 *                          visible at load (nothing wipes in on first paint).
 *
 * [data-reveal]             Entrance animation on any descendant. Optional
 *                          value picks the geometry (default "rise" if the
 *                          attribute is present with no value):
 *                            rise     — clip-path wipe open bottom-up + a
 *                                       short translateY settle.
 *                            mask-x   — clip-path wipe open left-to-right
 *                                       (or right-to-left with data-reveal-dir="rtl").
 *                            mask-y   — clip-path wipe open top-to-bottom
 *                                       (or bottom-up with data-reveal-dir="rtl").
 *                            scale    — clip-path circle() iris, expands
 *                                       from its own center.
 *                            split    — text content is split into words at
 *                                       init; each word is masked behind an
 *                                       overflow-hidden wrapper and rises in
 *                                       with a per-word stagger. Only safe on
 *                                       elements whose entire content is
 *                                       inline text (no nested elements).
 *                          Never touches opacity. Layout box is unchanged at
 *                          every point in the animation — CLS stays 0.
 *
 * [data-reveal-delay]       Extra stagger in ms, added on top of any group
 *                          stagger, e.g. data-reveal-delay="120".
 *
 * [data-reveal-group]      Elements sharing a group name stagger in DOM
 *                          order (60ms apart) as if they were one reveal,
 *                          e.g. every card in a row sharing data-reveal-group="cases".
 *
 * [data-reveal-dir]         "rtl" flips the direction of mask-x/mask-y.
 *
 * [data-reveal-replay]     If present, the element resets and replays every
 *                          time it re-enters the viewport. Default: reveals
 *                          once and holds its revealed state.
 *
 * [data-cursor]             On any element: "expand" grows the cursor
 *                          presence dot while hovered (fine pointer only),
 *                          "hide" hides it entirely over that element (for
 *                          zones another specialist's own cursor/canvas
 *                          owns, e.g. the hero's WebGL surface).
 *
 * Root/selector overrides all come through opts — see init() below. Nothing
 * is hardcoded to a specific tag or class beyond the attributes above.
 */
(function () {
  'use strict';

  var REVEAL_STAGGER_MS = 60;     // per-item offset inside a data-reveal-group
  var REVEAL_STIFFNESS = 130;
  var REVEAL_DAMPING = 18;        // ratio ~0.7 — settles with one soft overshoot, never linear
  var REVEAL_RISE_PX = 28;        // how far the rise/mask variants travel before settling
  var SPLIT_WORD_STAGGER_MS = 45;

  var CURTAIN_STIFFNESS = 150;
  var CURTAIN_DAMPING = 22;
  var CURTAIN_HOLD_MS = 90;       // how long the curtain stays fully swept before retreating

  var CURSOR_STIFFNESS = 210;
  var CURSOR_DAMPING = 24;
  var CURSOR_EXPAND_SCALE = 3.2;
  var CURSOR_SPEED_SCALE = 0.6;   // extra scale added at full cursor speed

  var api = { init: init, destroy: destroy };
  var st = null;

  function toArray(list) { return Array.prototype.slice.call(list); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function resolve(sel, root) {
    if (!sel) return [];
    if (typeof sel === 'string') return toArray((root || document).querySelectorAll(sel));
    if (sel.length !== undefined) return toArray(sel);
    return [sel];
  }

  // --- reveal geometry -------------------------------------------------
  // Every variant is a pure function of v (0 = hidden, 1 = fully revealed)
  // that returns { clip, transform } strings. Nothing here reads or writes
  // opacity, at any point in the curve.

  function geomRise(v) {
    var inset = (1 - v) * 100;
    var y = (1 - v) * REVEAL_RISE_PX;
    return {
      clip: 'inset(0 0 ' + inset.toFixed(2) + '% 0)',
      transform: 'translate3d(0,' + y.toFixed(2) + 'px,0)'
    };
  }

  function geomMaskX(v, rtl) {
    var hide = (1 - v) * 100;
    var clip = rtl
      ? 'inset(0 0 0 ' + hide.toFixed(2) + '%)'
      : 'inset(0 ' + hide.toFixed(2) + '% 0 0)';
    return { clip: clip, transform: 'none' };
  }

  function geomMaskY(v, rtl) {
    var hide = (1 - v) * 100;
    var clip = rtl
      ? 'inset(0 0 ' + hide.toFixed(2) + '% 0)'
      : 'inset(' + hide.toFixed(2) + '% 0 0 0)';
    return { clip: clip, transform: 'none' };
  }

  function geomScale(v) {
    var r = v * 75; // 75% covers a corner-to-corner circle from center
    return {
      clip: 'circle(' + r.toFixed(2) + '% at 50% 50%)',
      transform: 'none'
    };
  }

  function applyGeom(el, kind, v, rtl) {
    var g;
    switch (kind) {
      case 'mask-x': g = geomMaskX(v, rtl); break;
      case 'mask-y': g = geomMaskY(v, rtl); break;
      case 'scale': g = geomScale(v); break;
      default: g = geomRise(v);
    }
    el.style.clipPath = g.clip;
    el.style.webkitClipPath = g.clip;
    if (g.transform !== 'none' || kind === 'rise') el.style.transform = g.transform;
  }

  // --- split-text (word-level, resize-safe — no line measurement) ------
  function splitWords(el) {
    var text = el.textContent;
    el.textContent = '';
    var words = text.split(/(\s+)/); // keep whitespace tokens so wrapping stays natural
    var spans = [];
    words.forEach(function (chunk) {
      if (/^\s+$/.test(chunk)) { el.appendChild(document.createTextNode(chunk)); return; }
      if (chunk === '') return;
      var wrap = document.createElement('span');
      wrap.style.display = 'inline-block';
      wrap.style.overflow = 'hidden';
      wrap.style.verticalAlign = 'top';
      var inner = document.createElement('span');
      inner.style.display = 'inline-block';
      inner.textContent = chunk;
      wrap.appendChild(inner);
      el.appendChild(wrap);
      spans.push(inner);
    });
    return spans;
  }

  // --- reveal registry ---------------------------------------------------
  function buildReveals(root) {
    var els = resolve('[data-reveal]', root);
    var groupCounts = {};
    var items = [];
    var index = 0;

    els.forEach(function (el) {
      var kind = el.getAttribute('data-reveal') || 'rise';
      var rtl = el.getAttribute('data-reveal-dir') === 'rtl';
      var replay = el.hasAttribute('data-reveal-replay');
      var group = el.getAttribute('data-reveal-group');
      var ownDelay = parseInt(el.getAttribute('data-reveal-delay'), 10) || 0;
      var groupDelay = 0;
      if (group) {
        groupCounts[group] = (groupCounts[group] || 0);
        groupDelay = groupCounts[group] * REVEAL_STAGGER_MS;
        groupCounts[group]++;
      }

      var words = null;
      if (kind === 'split') {
        // Split only elements that are pure inline text — anything with
        // element children is left alone rather than risking mangled markup.
        if (el.children.length === 0) words = splitWords(el);
        else kind = 'rise';
      }

      var item = {
        el: el,
        kind: kind,
        rtl: rtl,
        replay: replay,
        delay: ownDelay + groupDelay,
        words: words,
        key: 'nb-reveal-' + (index++),
        wordKeys: null,
        revealed: false,
        armedAt: 0
      };

      if (words) {
        item.wordKeys = words.map(function (_, i) { return item.key + '-w' + i; });
      }

      // Initial state — set directly in JS, not CSS, so a script failure or
      // a slow connection never leaves content permanently clipped.
      applyGeom(el, kind, 0, rtl);
      if (words) words.forEach(function (w) {
        w.style.transform = 'translate3d(0,' + REVEAL_RISE_PX + 'px,0)';
      });

      items.push(item);
    });

    return items;
  }

  function armReveal(item, now) {
    if (item.revealed && !item.replay) return;
    item.revealed = true;
    item.armedAt = now + item.delay;
  }

  function disarmReveal(item) {
    if (!item.replay) return;
    item.revealed = false;
  }

  function tickReveals(now) {
    var M = window.NB_MOTION;
    st.reveals.forEach(function (item) {
      var target = item.revealed && now >= item.armedAt ? 1 : 0;
      var v = M.spring(item.key, target, REVEAL_STIFFNESS, REVEAL_DAMPING);
      if (item.words) {
        item.words.forEach(function (w, i) {
          var wKey = item.wordKeys[i];
          var wTarget = item.revealed && now >= item.armedAt + i * SPLIT_WORD_STAGGER_MS ? 1 : 0;
          var wv = M.spring(wKey, wTarget, REVEAL_STIFFNESS, REVEAL_DAMPING);
          w.style.transform = 'translate3d(0,' + ((1 - wv) * REVEAL_RISE_PX).toFixed(2) + 'px,0)';
        });
      } else {
        applyGeom(item.el, item.kind, v, item.rtl);
      }
    });
  }

  // Trigger threshold, expressed the same way the old IntersectionObserver
  // options were: 12% of the element's own height must be inside a root
  // shrunk by 8% off its bottom edge.
  var REVEAL_VISIBLE_RATIO = 0.12;
  var REVEAL_ROOT_BOTTOM_INSET = 0.08;

  // Deliberately NOT IntersectionObserver. Every [data-reveal] element's
  // *hidden* state is a zero-height clip-path (see applyGeom/geomRise —
  // "inset(0 0 100% 0)" has zero visible area by definition). An observer
  // computes intersection against that same zero-area box, so the ratio is
  // pinned at 0 forever and the browser stops bothering to recheck it —
  // isIntersecting never turns true, no matter how far the element scrolls
  // into view. That is exactly what broke this the first time: it looked
  // like a wiring bug (item.revealed never set) but the entries never
  // arrived in the first place, because clip-path doesn't touch layout —
  // getBoundingClientRect() reports the full, unclipped box regardless of
  // how the element is clipped — so reading it directly, the same way
  // js/scroll.js and js/interact.js already do on this page for the same
  // "geometry under a transform/clip can't be trusted to a lazy browser
  // API" reason, is both correct and consistent with the rest of this
  // layer. This runs once per frame from the existing onFrame subscription,
  // not a second timer.
  function checkReveals(now) {
    var vh = window.innerHeight;
    var rootBottom = vh * (1 - REVEAL_ROOT_BOTTOM_INSET);
    st.reveals.forEach(function (item) {
      var r = item.el.getBoundingClientRect();
      if (r.height <= 0) return; // not laid out yet; nothing to measure
      var visibleTop = Math.max(r.top, 0);
      var visibleBottom = Math.min(r.bottom, rootBottom);
      var visibleHeight = Math.max(0, visibleBottom - visibleTop);
      var ratio = visibleHeight / r.height;
      if (ratio >= REVEAL_VISIBLE_RATIO) armReveal(item, now);
      else disarmReveal(item);
    });
  }

  // --- section boundary curtain -----------------------------------------
  // A fixed overlay that sweeps once, diagonally, across the viewport when
  // the virtual scroll commits to a new floor that opted in. Independent of
  // the per-element reveals above — this is the "does the page itself
  // transition" beat, not a content entrance.
  function buildCurtain(root) {
    var el = document.createElement('div');
    el.className = 'nb-curtain';
    el.setAttribute('aria-hidden', 'true');
    (root === document ? document.body : root).appendChild(el);
    return el;
  }

  function tickCurtain(now) {
    if (!st.curtain) return;
    var M = window.NB_MOTION;
    var v = M.spring('nb-curtain', st.curtainTarget, CURTAIN_STIFFNESS, CURTAIN_DAMPING);
    if (st.curtainTarget === 1 && v > 0.97 && !st.curtainRetreating) {
      st.curtainRetreating = true;
      setTimeout(function () { if (st) st.curtainTarget = 0; }, CURTAIN_HOLD_MS);
    }
    // A diagonal sweep: two edges of a polygon travel at slightly different
    // rates so the wipe reads as a blade crossing the screen, not a flat
    // door closing.
    var lead = clamp(v * 1.15, 0, 1) * 100;
    var trail = clamp(v * 0.85, 0, 1) * 100;
    st.curtain.style.clipPath =
      'polygon(0% 0%, 100% 0%, 100% ' + lead.toFixed(2) + '%, 0% ' + trail.toFixed(2) + '%)';
    st.curtain.style.webkitClipPath = st.curtain.style.clipPath;
  }

  function triggerCurtain() {
    if (!st.curtain) return;
    st.curtainRetreating = false;
    st.curtainTarget = 1;
  }

  // --- cursor presence ----------------------------------------------------
  function buildCursor(root) {
    var el = document.createElement('div');
    el.className = 'nb-cursor';
    el.setAttribute('aria-hidden', 'true');
    (root === document ? document.body : root).appendChild(el);
    return el;
  }

  function bindCursorZones(root) {
    var expand = resolve('[data-cursor="expand"]', root);
    var hide = resolve('[data-cursor="hide"]', root);
    var unbinds = [];
    expand.forEach(function (el) {
      function on() { st.cursorHoverTarget = 1; }
      function off() { st.cursorHoverTarget = 0; }
      el.addEventListener('pointerenter', on);
      el.addEventListener('pointerleave', off);
      unbinds.push(function () {
        el.removeEventListener('pointerenter', on);
        el.removeEventListener('pointerleave', off);
      });
    });
    hide.forEach(function (el) {
      function on() { st.cursorHideDepth++; }
      function off() { st.cursorHideDepth = Math.max(0, st.cursorHideDepth - 1); }
      el.addEventListener('pointerenter', on);
      el.addEventListener('pointerleave', off);
      unbinds.push(function () {
        el.removeEventListener('pointerenter', on);
        el.removeEventListener('pointerleave', off);
      });
    });
    return unbinds;
  }

  function tickCursor() {
    if (!st.cursor) return;
    var M = window.NB_MOTION;
    var c = M.cursor;
    var x = c.sx * window.innerWidth;
    var y = c.sy * window.innerHeight;
    var hoverV = M.spring('nb-cursor-hover', st.cursorHoverTarget, CURSOR_STIFFNESS, CURSOR_DAMPING);
    var hideTarget = st.cursorHideDepth > 0 || !c.active ? 0 : 1;
    var visV = M.spring('nb-cursor-visible', hideTarget, CURSOR_STIFFNESS, CURSOR_DAMPING);
    var scale = 1 + hoverV * (CURSOR_EXPAND_SCALE - 1) + c.speed * CURSOR_SPEED_SCALE;
    st.cursor.style.transform =
      'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + (scale * visV).toFixed(3) + ')';
  }

  // --- lifecycle -----------------------------------------------------------
  // Time source: `now` is read locally via performance.now() rather than
  // trusted from the `now` argument NB_MOTION.onFrame hands this callback.
  // motion.js's own driver changed under this module (it went from
  // externally-stepped to self-driving) and nothing here contracts what
  // clock, epoch, or even arity that argument has going forward — sourcing
  // it locally, once per tick, and threading that single value through
  // checkReveals/tickReveals/tickCurtain removes the dependency on the
  // driver's contract entirely rather than assuming it stays compatible.
  function tick(dt, now) {
    if (!st) return;
    try {
      var t = performance.now();
      checkReveals(t);
      tickReveals(t);
      tickCurtain(t);
      tickCursor();
    } catch (err) {
      console.error('choreo tick', err);
    }
  }

  function init(opts) {
    opts = opts || {};
    // Idempotent: a second init() call (a duplicate boot.js invocation,
    // a hot-reload) must not leave the previous instance's observer and
    // listeners orphaned while this module's state moves on without them.
    if (st) destroy();

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = opts.root || document;

    if (reduced || !window.NB_MOTION) {
      // Reduced motion: reveal everything in its final state immediately,
      // no listeners, no clip-path left mid-flight, layout untouched.
      resolve('[data-reveal]', root).forEach(function (el) {
        el.style.clipPath = 'none';
        el.style.webkitClipPath = 'none';
      });
      return api;
    }

    var reveals = buildReveals(root);

    var sectionEls = resolve(opts.sections || '[data-section]', root);
    var loadedSection = sectionEls.length
      ? sectionEls.reduce(function (top, el) {
          return el.getBoundingClientRect().top < top.getBoundingClientRect().top ? el : top;
        })
      : null;

    st = {
      reveals: reveals,
      curtain: null,
      curtainTarget: 0,
      curtainRetreating: false,
      cursor: null,
      cursorHoverTarget: 0,
      cursorHideDepth: 0,
      cursorUnbinds: [],
      unsubMotion: null,
      unsubScroll: null,
      firstFloorChange: true
    };

    // Elements not yet visible on load must not sit revealed-by-default —
    // run one synchronous check now rather than waiting for the first tick,
    // so nothing above the fold flashes hidden-then-shown.
    checkReveals(performance.now());

    if (opts.curtain !== false) {
      st.curtain = buildCurtain(root);
    }

    var isFinePointer = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var isTouch = !isFinePointer;
    if (opts.cursor !== false && !isTouch) {
      st.cursor = buildCursor(root);
      st.cursorUnbinds = bindCursorZones(root);
    }

    // Wire the virtual scroll. It ships merged-but-unused — this is where it
    // actually gets turned on.
    if (window.NB_SCROLL) {
      window.NB_SCROLL.init({
        sections: opts.sections || '[data-section]',
        container: opts.scrollContainer,
        onFloorChange: function (idx) {
          // No wipe for the section already on screen at load.
          if (st.firstFloorChange) { st.firstFloorChange = false; return; }
          var el = sectionEls[idx];
          if (el && el.hasAttribute('data-section-wipe')) triggerCurtain();
          if (typeof opts.onFloorChange === 'function') opts.onFloorChange(idx);
        },
        onProgress: opts.onProgress
      });
    }

    st.unsubMotion = window.NB_MOTION.onFrame(tick);
    return api;
  }

  function destroy() {
    if (!st) return;
    if (st.unsubMotion) st.unsubMotion();
    st.cursorUnbinds.forEach(function (fn) { fn(); });

    st.reveals.forEach(function (item) {
      item.el.style.clipPath = '';
      item.el.style.webkitClipPath = '';
      item.el.style.transform = '';
    });
    if (st.curtain && st.curtain.parentNode) st.curtain.parentNode.removeChild(st.curtain);
    if (st.cursor && st.cursor.parentNode) st.cursor.parentNode.removeChild(st.cursor);

    if (window.NB_SCROLL) window.NB_SCROLL.destroy();

    st = null;
  }

  window.NB_CHOREO = api;
})();
