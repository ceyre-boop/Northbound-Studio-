/* js/dream.js — hand-rolled motion for the dream rebuild.
 * Three things only, per rebuild-brief §4:
 *   1. hero headline lines rise in, staggered, on load;
 *   2. sections fade/slide in once via IntersectionObserver, then stay;
 *   3. the hero media drifts a few px against scroll (rAF);
 *   4. Buddy waves on a loop, with one control that stops him.
 * prefers-reduced-motion turns 1–3 off. Buddy's wave is a small picture in
 * a fixed frame, not the page moving, so he still waves; the pause control
 * is for anyone who would rather he did not.
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
   * few px against scroll reads as depth without anything bouncing. Written
   * as a variable so the CSS can keep its own X (Buddy centred in the frame). */
  var wrap = document.querySelector('[data-drift-wrap]');
  var media = document.querySelector('[data-drift]');
  if (wrap && media) {
    if (!reduced) {
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
          media.style.setProperty('--drift', shift.toFixed(1) + 'px');
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  /* 4 — Buddy waves; one button stops him. A visitor who stopped him stays
   * stopped for the session. */
  var pause = document.querySelector('[data-hero-pause]');
  if (media && pause) {
    var KEY = 'nb-buddy-paused';
    var setPaused = function (on) {
      pause.setAttribute('aria-pressed', on ? 'true' : 'false');
      pause.setAttribute('aria-label', on ? 'Let Buddy wave' : 'Pause Buddy');
      if (on) media.pause();
      else { var p = media.play(); if (p && p.catch) p.catch(function () {}); }
      try { sessionStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    };
    var wanted = false;
    try { wanted = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
    setPaused(wanted);
    pause.addEventListener('click', function () {
      setPaused(pause.getAttribute('aria-pressed') !== 'true');
    });
  }
})();
