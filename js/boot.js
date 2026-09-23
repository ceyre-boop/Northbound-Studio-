/* js/boot.js — the veil.
 *
 * First paint shows the veil, not a half-loaded hero. On a slow connection
 * the page used to assemble itself in public — fonts swapping under the
 * headline, images popping, the canvas blinking in — and every one of those
 * frames reads as jank, especially on a phone. You cannot make everyone's
 * internet faster, but you can wait until the hero is ready before showing
 * it. That is all this file does.
 *
 * Progress is milestone-based, not byte-based: 12 at parse, 42 on
 * fonts.ready, 78 on window load, 100 at reveal. The counter tweens toward
 * each milestone so it reads as a measurement rather than a slideshow.
 *
 * It never traps: a hard cap reveals at MAX_MS even if the load event never
 * comes; a CSS failsafe in the head lifts the veil if this file never runs;
 * <noscript> hides it when JS is off; reduced-motion visitors never see it.
 */
(function () {
  'use strict';

  var veil = document.getElementById('nb-veil');
  if (!veil) return;
  veil.style.animation = 'none'; /* this file is alive; the CSS failsafe stands down */

  /* Reduced motion: no theater. The head CSS already hides the veil before
     first paint; just remove it and get out of the way. */
  if (document.documentElement.classList.contains('nb-no-veil')) {
    veil.remove();
    return;
  }

  var num = document.getElementById('nb-veil-num');
  var fill = document.getElementById('nb-veil-fill');
  var now = function () { return (window.performance && performance.now()) || 0; };
  var t0 = now();
  var MIN_MS = 650;   /* the ritual must read as intentional, not a flash */
  var MAX_MS = 2600;  /* the veil must never become the jank it hides */
  var target = 12, shown = 0, revealed = false, loaded = false;

  function paint() {
    shown += (target - shown) * 0.16;
    if (target - shown < 0.6) shown = target;
    var p = Math.round(shown);
    if (num) num.textContent = (p < 10 ? '0' : '') + p;
    if (fill) fill.style.width = p + '%';
    if (!revealed && shown < 100) requestAnimationFrame(paint);
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    target = 100;
    var wait = Math.max(0, MIN_MS - (now() - t0));
    /* Let 100 sit for a beat so the counter finishes its sentence. */
    setTimeout(function () {
      if (num) num.textContent = '100';
      if (fill) fill.style.width = '100%';
      veil.classList.add('is-done');
      /* The stage is clear: the hero sequence may begin. Fired as the fade
         finishes so the sneak plays on a clear stage, not under the veil. */
      setTimeout(function () {
        try { window.dispatchEvent(new CustomEvent('nb:revealed')); } catch (e) { /* old engines: the hero's own backstop covers this */ }
      }, 400);
      setTimeout(function () { veil.remove(); }, 500);
    }, wait + 220);
  }

  function maybe() { if (loaded) reveal(); }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (target < 42) target = 42;
    });
  }
  if (document.readyState === 'complete') {
    loaded = true;
  } else {
    window.addEventListener('load', function () {
      loaded = true;
      if (target < 78) target = 78;
      maybe();
    }, { once: true });
  }

  requestAnimationFrame(paint);
  if (loaded) maybe();
  /* The hard cap: reveal at MAX_MS even if the load event never comes. */
  setTimeout(function () {
    loaded = true;
    if (target < 78) target = 78;
    maybe();
  }, MAX_MS);
})();
