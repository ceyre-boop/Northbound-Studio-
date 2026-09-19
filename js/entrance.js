/* Northbound — sitewide entrances.
 *
 * Replaces js/panels.js's old reveal controller (an IntersectionObserver
 * flipping `[data-reveal]` between "pending"/"in", driven by CSS opacity
 * transitions). That controller is deleted along with its CSS
 * (css/stage.css used to carry it at the "copy arrival" comment) — this file
 * is the one entrance system now.
 *
 * What's different, and why:
 *
 *   SCROLL-LINKED, LATCHED   Each block's progress is how far its top has
 *   entered the viewport (0 at the bottom edge, 1 a third of a screen later).
 *   The block's own running MAXIMUM of that value is what actually drives
 *   its springs, so scrolling back down never re-triggers a block that has
 *   already arrived — latched, not replayed.
 *
 *   DRIVEN BY THE SHARED SPRINGS   Every item (a heading's words, the body,
 *   a stack of cards) gets its own spring instance, but every one of them
 *   uses the SAME preset — `settle`, from js/springs.js. The preset's own
 *   underdamped response is the overshoot; nothing here hand-tunes a curve.
 *
 *   ONE SHARED DELAY CURVE, IN SCROLL DISTANCE   Staggering an item is not a
 *   transition-delay in milliseconds — it is a fraction subtracted from (and
 *   rescaled into) the same 0..1 progress value before it ever reaches that
 *   item's spring target. Two items latch at the same scroll distance apart
 *   regardless of how fast or slow the visitor is scrolling.
 *
 *   TRANSFORM ONLY, NEVER OPACITY   Headings split into words inside an
 *   `overflow:hidden` mask and rise out of it; everything else rises on
 *   translateY. Nothing here ever sets `opacity`.
 *
 *   CLS STAYS ZERO   Exactly the same rule the old controller used: a block
 *   is only primed (given a starting offset) if it can be confirmed, at
 *   setup, to be off-screen. Anything already visible at first paint is left
 *   completely alone.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var STILL = /[?&]still=1\b/.test(location.search);
  function reducedNow() {
    return STILL || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // The one shared stagger curve, expressed as fractions of the 0..1 progress
  // window — never milliseconds. Capped so a very long list still finishes
  // inside the block's own arrival, rather than trailing off it.
  var CHILD_STEP = 0.14;
  var WORD_STEP = 0.05;
  var ITEM_STEP = 0.07;
  var MAX_DELAY = 0.55;

  var STAGGER_GROUP_SELECTOR = '.pkg, .offer-list > li, .rules > li, .work-card';

  function splitWords(heading) {
    if (heading.hasAttribute('data-split')) {
      return Array.prototype.slice.call(heading.querySelectorAll('.reveal-word'));
    }
    var text = heading.textContent;
    var tokens = text.split(/(\s+)/);
    heading.textContent = '';
    var words = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (!tok) continue;
      if (/^\s+$/.test(tok)) { heading.appendChild(document.createTextNode(tok)); continue; }
      var mask = document.createElement('span');
      mask.className = 'reveal-mask';
      var word = document.createElement('span');
      word.className = 'reveal-word';
      word.textContent = tok;
      mask.appendChild(word);
      heading.appendChild(mask);
      words.push(word);
    }
    // One heading element, one accessible name — the split only changes what
    // paints, never what's in the accessibility tree.
    heading.setAttribute('data-split', '');
    return words;
  }

  function primeWord(el) {
    el.style.transform = 'translateY(115%)';
    el.style.willChange = 'transform';
  }
  function primeBlock(el) {
    el.style.transform = 'translateY(22px)';
    el.style.willChange = 'transform';
  }

  /** Build the item list for one `.act__ink` block: headings split into
   *  words, known card/list/rule groups staggered member-by-member, and
   *  every other direct child treated as one item. */
  function registerBlock(block) {
    var items = [];
    var children = Array.prototype.slice.call(block.children);
    for (var idx = 0; idx < children.length; idx++) {
      var child = children[idx];
      var baseDelay = Math.min(MAX_DELAY, idx * CHILD_STEP);
      var tag = child.tagName;

      if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
        var words = splitWords(child);
        for (var wi = 0; wi < words.length; wi++) {
          primeWord(words[wi]);
          items.push({ el: words[wi], mode: 'word', delay: Math.min(MAX_DELAY, baseDelay + wi * WORD_STEP) });
        }
        continue;
      }

      var group = child.querySelectorAll ? child.querySelectorAll(STAGGER_GROUP_SELECTOR) : [];
      if (group.length) {
        for (var gi = 0; gi < group.length; gi++) {
          primeBlock(group[gi]);
          items.push({ el: group[gi], mode: 'block', delay: Math.min(MAX_DELAY, baseDelay + gi * ITEM_STEP) });
        }
        continue;
      }

      primeBlock(child);
      items.push({ el: child, mode: 'block', delay: baseDelay });
    }
    return items;
  }

  function applyItem(it, v) {
    if (it.mode === 'word') {
      it.el.style.transform = 'translateY(' + ((1 - v) * 115).toFixed(2) + '%)';
    } else {
      it.el.style.transform = 'translateY(' + ((1 - v) * 22).toFixed(2) + 'px)';
    }
  }

  function computeProgress(rect) {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var p = (vh - rect.top) / (vh / 3);
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  function boot() {
    if (reducedNow()) return; // final at first paint — no entry, no priming, nothing to latch

    var M = window.NB_MOTION;
    if (!M || !M.onFrame || !M.spring) return; // motion.js is the only driver; no motion.js, no entrance

    var vh = window.innerHeight || document.documentElement.clientHeight;
    var blocks = Array.prototype.slice.call(document.querySelectorAll('.act__ink'));
    var states = [];

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var rect = block.getBoundingClientRect();
      // Same rule the old controller used: only a block confirmed off-screen
      // at setup gets primed. Anything visible at first paint is left alone —
      // the CLS gate is exactly zero.
      if (rect.top < vh && rect.bottom > 0) continue;
      var items = registerBlock(block);
      if (items.length) states.push({ el: block, items: items, max: 0, done: false, key: 'entrance-' + i });
    }

    if (!states.length) return;

    var release = M.onFrame(function () {
      var stillActive = false;
      for (var s = 0; s < states.length; s++) {
        var st = states[s];
        if (st.done) continue;
        var r = st.el.getBoundingClientRect();
        var p = computeProgress(r);
        if (p > st.max) st.max = p;

        var settled = st.max >= 1;
        for (var j = 0; j < st.items.length; j++) {
          var it = st.items[j];
          var target = st.max <= it.delay ? 0 : Math.min(1, (st.max - it.delay) / (1 - it.delay));
          var v = M.spring(st.key + ':' + j, target, 'settle');
          applyItem(it, v);
          if (target < 1 || Math.abs(v - target) > 0.001) settled = false;
        }
        if (settled) st.done = true; else stillActive = true;
      }
      // Every block has latched and every spring has parked — nothing left
      // that needs a per-frame write, so stop asking for frames at all.
      if (!stillActive) release();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
