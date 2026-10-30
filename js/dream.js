/* js/dream.js — hand-rolled motion for the dream rebuild.
 * No library, no build step. Seven things, each a few lines:
 *   1. hero headline lines rise in, staggered, on load;
 *   2. sections fade/slide in once via IntersectionObserver, then stay
 *      (their rows cascade after them, in CSS);
 *   3. the hero frame drifts a few px against scroll;
 *   4. Buddy waves on a loop, with one control that stops him;
 *   5. the hero frame tilts toward the pointer and Buddy looks along with it;
 *   6. buttons lean a few px toward a pointer that comes near;
 *   7. a hairline along the top edge shows how far down the page you are.
 * prefers-reduced-motion turns off 3, 5 and 6, and the CSS turns its own
 * transitions off. Buddy's wave is a small picture in a fixed frame, not
 * the page moving, so he still waves; the pause control is for anyone who
 * would rather he did not.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover)').matches;
  var root = document.documentElement;

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

  var wrap = document.querySelector('[data-drift-wrap]');
  var media = document.querySelector('[data-drift]');

  /* 3 — hero drift. The frame slides a few px against scroll; it reads as
   * depth without anything bouncing. Written as a variable so the CSS can
   * compose it with the tilt below. */
  if (wrap && !reduced) {
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
        wrap.style.setProperty('--drift', shift.toFixed(1) + 'px');
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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

  /* 5 — the frame follows the pointer. Across the hero, the frame tilts up
   * to five degrees toward the pointer and Buddy shifts a few px the same
   * way, so the picture has a little depth to it. Pointer devices only. */
  var hero = document.querySelector('.hero');
  if (hero && wrap && media && canHover && !reduced) {
    var look = function (e) {
      if (window.innerWidth < 761) return;
      var r = hero.getBoundingClientRect();
      var nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      var ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      nx = Math.max(-1, Math.min(1, nx)); ny = Math.max(-1, Math.min(1, ny));
      wrap.style.setProperty('--tilt-y', (nx * 5).toFixed(2) + 'deg');
      wrap.style.setProperty('--tilt-x', (-ny * 4).toFixed(2) + 'deg');
      media.style.setProperty('--look-x', (nx * 6).toFixed(1) + 'px');
      media.style.setProperty('--look-y', (ny * 8).toFixed(1) + 'px');
    };
    var rest = function () {
      wrap.style.setProperty('--tilt-y', '0deg');
      wrap.style.setProperty('--tilt-x', '0deg');
      media.style.setProperty('--look-x', '0px');
      media.style.setProperty('--look-y', '0px');
    };
    hero.addEventListener('pointermove', look);
    hero.addEventListener('pointerleave', rest);
  }

  /* 6 — magnetic buttons. Within 110px of a button's centre the button
   * leans toward the pointer, a quarter of the distance, ten px at most. */
  var btns = Array.prototype.slice.call(document.querySelectorAll('.btn'));
  if (btns.length && canHover && !reduced) {
    var RADIUS = 110, MAX = 10;
    var pending = null;
    var magnet = function () {
      var e = pending; pending = null;
      btns.forEach(function (b) {
        var r = b.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = e.clientX - cx, dy = e.clientY - cy;
        var d = Math.hypot(dx, dy);
        if (d < RADIUS + Math.max(r.width, r.height) / 2) {
          var k = 0.25;
          b.style.setProperty('--mx', Math.max(-MAX, Math.min(MAX, dx * k)).toFixed(1) + 'px');
          b.style.setProperty('--my', Math.max(-MAX, Math.min(MAX, dy * k)).toFixed(1) + 'px');
        } else if (b.style.getPropertyValue('--mx')) {
          b.style.removeProperty('--mx');
          b.style.removeProperty('--my');
        }
      });
    };
    document.addEventListener('pointermove', function (e) {
      if (!pending) requestAnimationFrame(magnet);
      pending = e;
    }, { passive: true });
  }

  /* 7 — the hairline. --progress is 0 at the top of the page and 1 at the
   * bottom; the CSS scales a two-pixel line by it. */
  var line = document.querySelector('.scroll-line');
  if (line) {
    var lineTick = false;
    var measure = function () {
      if (lineTick) return;
      lineTick = true;
      requestAnimationFrame(function () {
        lineTick = false;
        var max = root.scrollHeight - window.innerHeight;
        var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        root.style.setProperty('--progress', p.toFixed(4));
      });
    };
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    measure();
  }
})();
