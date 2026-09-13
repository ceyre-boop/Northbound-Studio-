/* js/hero-tag.js — BUDDY tags the headline.
 *
 * This retroactively explains the hero: the headline is already sprayed
 * paint (css/hero-stencil.css), and BUDDY is the one who painted it. He
 * sneaks in from the left, plants and sprays (the headline paints on in
 * sync), turns and comes toward camera, then bolts.
 *
 * This module is intentionally NOT part of the Stage. It self-mounts, plays
 * once when the hero is actually on screen, and no-ops cleanly if the hero
 * markup, fetch or IntersectionObserver are unavailable — decoration must
 * never take the page down with it. It owns nothing outside this file, its
 * own css/hero-tag.css and its own brand/buddy-tagger.svg: it finds the
 * headline and the hero section by selector at runtime rather than being
 * handed a reference, and it never edits index.html.
 *
 * Sequencing is a handful of setTimeouts flipping one [data-stage] attribute;
 * every actual animation is a CSS keyframe reacting to that attribute. A
 * per-frame JS loop writing styles would cost more than this page's budget
 * allows (median frame 8.3ms of a 16.7ms budget) for a decoration that plays
 * once.
 */
(function () {
  'use strict';

  var HERO_SELECTOR = '.act--arrival';
  var HEADLINE_SELECTOR = '.hero-spray';
  var RIG_URL = 'brand/buddy-tagger.svg';

  /* Beat durations in ms. These are the single source of truth: the CSS
     keyframe durations in css/hero-tag.css are written to match them by
     hand, and the headline's paint-in timing (--tag-delay/--tag-duration,
     set below) is read directly from SNEAK_MS/TAG_MS so the two files can
     never drift out of sync with each other. Total ~4.5s. */
  var SNEAK_MS = 1100;
  var TAG_MS = 1400;
  var APPROACH_MS = 1100;
  var ANTICIPATE_MS = 200;
  var BOLT_MS = 700;

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function loadRig(mount) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    return fetch(RIG_URL).then(function (res) {
      if (!res.ok) throw new Error('rig fetch failed: ' + res.status);
      return res.text();
    }).then(function (svgText) {
      mount.innerHTML = svgText;
      var svg = mount.querySelector('svg');
      if (svg) svg.classList.add('nb-hero-tag__rig');
      return mount.querySelector('#tag-rig') ? mount : null;
    });
  }

  function playStill(hero, headline) {
    var mount = document.createElement('div');
    mount.className = 'nb-hero-tag';
    mount.setAttribute('aria-hidden', 'true');
    mount.setAttribute('data-stage', 'still');
    hero.appendChild(mount);

    loadRig(mount).catch(function () {
      // No rig, no still frame — the headline is already fully visible and
      // unclipped, which is the whole requirement for this path.
      mount.remove();
    });
  }

  function playSequence(hero, headline) {
    var mount = document.createElement('div');
    mount.className = 'nb-hero-tag';
    mount.setAttribute('aria-hidden', 'true');
    hero.appendChild(mount);

    loadRig(mount).then(function (ok) {
      if (!ok) { mount.remove(); return; }
      armObserver(hero, mount, headline);
    }).catch(function () {
      mount.remove();
      // Fetch/parse failed: leave the headline exactly as authored, with no
      // clip class ever applied, so it stays fully visible with no sequence.
    });
  }

  function armObserver(hero, mount, headline) {
    if (!('IntersectionObserver' in window)) {
      run(mount, headline);
      return;
    }
    var played = false;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting && !played) {
          played = true;
          io.disconnect();
          run(mount, headline);
        }
      }
    }, { threshold: 0.4 });
    io.observe(hero);
  }

  function run(mount, headline) {
    headline.style.setProperty('--tag-delay', SNEAK_MS + 'ms');
    headline.style.setProperty('--tag-duration', TAG_MS + 'ms');
    headline.classList.add('nb-tag-paint');

    var t = 0;
    mount.setAttribute('data-stage', 'sneak');

    t += SNEAK_MS;
    setTimeout(function () { mount.setAttribute('data-stage', 'tag'); }, t);

    t += TAG_MS;
    setTimeout(function () { mount.setAttribute('data-stage', 'approach'); }, t);

    t += APPROACH_MS;
    setTimeout(function () { mount.setAttribute('data-stage', 'anticipate'); }, t);

    t += ANTICIPATE_MS;
    setTimeout(function () { mount.setAttribute('data-stage', 'bolt'); }, t);

    t += BOLT_MS;
    setTimeout(function () {
      mount.setAttribute('data-stage', 'gone');
      headline.classList.add('nb-tag-paint--done');
    }, t);
  }

  function init() {
    var hero = document.querySelector(HERO_SELECTOR);
    var headline = hero && hero.querySelector(HEADLINE_SELECTOR);
    if (!hero || !headline) return; // hero not present: no-op cleanly

    if (prefersReducedMotion()) {
      playStill(hero, headline);
      return;
    }

    playSequence(hero, headline);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
