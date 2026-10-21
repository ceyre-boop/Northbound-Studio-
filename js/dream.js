/* js/dream.js — hand-rolled motion for the dream rebuild.
 * Three things only, per rebuild-brief §4:
 *   1. hero headline lines rise in, staggered, on load;
 *   2. sections fade/slide in once via IntersectionObserver, then stay;
 *   3. the hero media drifts a few px against scroll (rAF).
 * prefers-reduced-motion turns all of it off.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1 — load reveal. CSS holds the hero lines down only under html.js;
   * adding .is-loaded lets them rise with their stagger delays. */
  function loaded() { document.body.classList.add('is-loaded'); }
  if (document.readyState === 'complete') loaded();
  else window.addEventListener('load', loaded);
  /* Safety: never let the headline wait on a slow asset. */
  setTimeout(loaded, 600);

  /* 2 — scroll reveals, once each. */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* 3 — hero drift. The video is 112% tall inside its frame; sliding it a
   * few px against scroll reads as depth without anything bouncing. */
  var wrap = document.querySelector('[data-drift-wrap]');
  var media = document.querySelector('[data-drift]');
  if (wrap && media) {
    if (reduced) {
      media.removeAttribute('autoplay');
      media.pause();
    } else {
      var ticking = false;
      var onScroll = function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var rect = wrap.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) return;
          var progress = -rect.top / (rect.height + window.innerHeight);
          var shift = Math.max(-14, Math.min(14, progress * 28 - 7));
          media.style.transform = 'translate3d(0,' + shift.toFixed(1) + 'px,0)';
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
})();
