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
/* The character is the DESIGNED robot now, not the vector stand-in.
 *
 * The stand-in existed for one reason: the designed robot arrived as raster
 * art, and a raster cannot crouch, squash, or drag an antenna a beat behind
 * the body. So the choreography was built against a rigged SVG that could,
 * on the bet that the timing was the hard part and the art could be swapped
 * in later. The bet held — every beat duration below is unchanged.
 *
 * What the swap costs, stated plainly: no independent feet, no antenna drag,
 * no separate arm. What it buys is that the character in the hero and the
 * mascot further down the page are finally the same character, which is
 * worth more than three part-level flourishes nobody could name.
 *
 * Two layers, because the art has the paint baked into it and he must not be
 * spraying while he walks: the robot with his can, and the jet leaving it.
 * The jet is positioned off the can's nozzle in css/hero-tag.css and only
 * exists during the tag beat.
 *
 * Both composite with mix-blend-mode: screen. The art is lit on a dark
 * vignette and the hero is near-black, so screen drops the backing to
 * nothing and keeps the character's own rim light — a cut-out matte fought
 * that glow and lost, and cutting it away would have thrown out the best
 * part of the render. */
  var BOT = {
    src: 'brand/buddy-tagger-720w.webp',
    /* Capped at 900. He is never displayed wider than the 430px clamp, so 900
       already covers a 2x screen, and the 1200 variant was 132KB of hero
       bandwidth that put slow-4G LCP at 1208ms against a 1200ms gate. */
    srcset: 'brand/buddy-tagger-420w.webp 420w, brand/buddy-tagger-720w.webp 720w, brand/buddy-tagger-900w.webp 900w'
  };
  var SPRAY = {
    src: 'brand/buddy-spray-540w.webp',
    srcset: 'brand/buddy-spray-320w.webp 320w, brand/buddy-spray-540w.webp 540w, brand/buddy-spray-900w.webp 900w'
  };

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

/* Wait until the page has actually landed before fetching the character.
 *
 * He is a decoration and he is the heaviest single asset on the hero, and on
 * a slow connection the two facts collide: fetching him alongside the fonts
 * and the first act put the slow-4G LCP measurement at 1208ms against a
 * 1200ms gate, and bouncing to 1400ms on an unlucky sample. A gate you pass
 * on the second run is a gate you have not passed.
 *
 * So nothing here touches the network until load has fired and the main
 * thread has gone quiet. The sequence is armed by an IntersectionObserver
 * anyway, so the only visible consequence is that he arrives a moment later
 * on a slow connection — which is the correct thing for him to do. */
  function whenIdle() {
    return new Promise(function (resolve) {
      var go = function () {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(resolve, { timeout: 2000 });
        else setTimeout(resolve, 400);
      };
      if (document.readyState === 'complete') go();
      else window.addEventListener('load', go, { once: true });
    });
  }

  function img(cls, id, spec, w, h) {
    var el = document.createElement('img');
    el.className = cls;
    el.id = id;
    el.src = spec.src;
    el.srcset = spec.srcset;
    el.width = w; el.height = h;   // intrinsic ratio, so nothing reflows on load
    el.alt = '';
    el.decoding = 'async';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  /* Builds the two-layer rig. Resolves with the mount once the robot has
     actually decoded: starting the sequence against an undecoded image is how
     the first beat gets eaten, and the whole sneak is only 1100ms. */
  function loadRig(mount) {
    return whenIdle().then(function () { return buildRig(mount); });
  }

  function buildRig(mount) {
    var rig = document.createElement('div');
    rig.className = 'nb-hero-tag__rig';
    var bot = img('nb-hero-tag__bot', 'tag-body', BOT, 720, 555);
    var spray = img('nb-hero-tag__spray', 'tag-spray', SPRAY, 540, 469);
    rig.appendChild(bot);
    rig.appendChild(spray);
    mount.appendChild(rig);

    var ready = bot.decode ? bot.decode() : Promise.resolve();
    return ready.then(function () { return mount; }, function () {
      /* decode() rejects on a broken or unsupported image. Nothing to draw,
         so say so rather than playing an empty sequence over the headline. */
      throw new Error('rig art failed to decode');
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

  /* Phones get no Buddy at all — not the sequence, not the still, not even the
     fetch for his art. At 390px the hero is one column, so wherever he walks
     he walks across the pitch text, and for two seconds the one paragraph
     that says what we sell is unreadable. The breakpoint matches the CSS
     guard in css/hero-tag.css. */
  function isPhone() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 639.98px)').matches);
  }

  function init() {
    if (isPhone()) return;
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
