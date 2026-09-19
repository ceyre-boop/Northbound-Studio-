/* Northbound — scroll feel.
 *
 * Lenis (vendored at js/vendor/lenis.mjs, no CDN, no bundler) turns the
 * page's scroll into weighted inertia instead of the browser's native
 * step-and-stop. It does NOT own a rAF of its own: js/motion.js is the one
 * loop this page runs, and this module hands Lenis's `raf(now)` to that
 * loop's pre-frame phase, before the Stage or any spring reads `scrollY` in
 * the same frame. A second `requestAnimationFrame` chain here would mean two
 * frame budgets fighting over the same 16.7ms, which is exactly the bug the
 * header of js/motion.js already tells this story about once (`claim()`).
 *
 * `prefers-reduced-motion: reduce` (or `?still=1`, the determinism flag
 * Playwright depends on): Lenis is never constructed. Not paused, not
 * stopped after the fact — never `new Lenis(...)`'d at all, so a visitor who
 * asked for less motion never pays for the module's memory or event
 * listeners either.
 *
 * `syncTouch: false` — phones keep native touch scrolling. This is inertia
 * on top of the wheel and the scrollbar, not scroll-jacking.
 */
import Lenis from './vendor/lenis.mjs';

(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var STILL = /[?&]still=1\b/.test(location.search);
  var reducedQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  if (STILL || reducedQuery.matches) {
    window.NB_SCROLL = { lenis: null };
    return;
  }

  var M = window.NB_MOTION;
  if (!M || !M.setPreFrame) {
    // motion.js is the only rAF this page is allowed to run. If it failed to
    // load, the fallback is native scroll — never a second loop of our own.
    window.NB_SCROLL = { lenis: null };
    return;
  }

  var lenis = new Lenis({
    autoRaf: false,        // driven from motion.js's pre-frame phase — see below
    smoothWheel: true,
    syncTouch: false,      // no scroll-jacking on touch
    lerp: 0.1,              // weighted inertia, no snap, no fixed duration
    wheelMultiplier: 1
  });

  var releasePreFrame = M.setPreFrame(function (now) { lenis.raf(now); });

  // Anchor links (including the skip link) go through Lenis, then focus
  // moves to the target once it arrives — the same place native anchor
  // navigation would land it, so the skip link still does its job.
  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, {
      onComplete: function () {
        var hadTabIndex = target.hasAttribute('tabindex');
        if (!hadTabIndex) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        if (!hadTabIndex) {
          target.addEventListener('blur', function onBlur() {
            target.removeAttribute('tabindex');
            target.removeEventListener('blur', onBlur);
          }, { once: true });
        }
      }
    });
  }
  document.addEventListener('click', onClick);

  reducedQuery.addEventListener && reducedQuery.addEventListener('change', function (e) {
    if (!e.matches) return;
    // A live switch to reduced motion tears Lenis down rather than leaving
    // it running underneath a page that now claims to have no motion.
    releasePreFrame();
    document.removeEventListener('click', onClick);
    lenis.destroy();
    window.NB_SCROLL = { lenis: null };
  }, { once: true });

  window.NB_SCROLL = { lenis: lenis };
})();
