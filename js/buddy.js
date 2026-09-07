/* Northbound — Buddy's behaviour and mood, as a motion system.
 *
 * Buddy has no face (brand/buddy.svg): no eyes, no mouth, nothing to key an
 * "expression" off. His entire vocabulary is his core's brightness and
 * scale, his fragment's tilt, and his trail's length — exactly the four
 * layers brand/README.md names (`buddy-glow`, `buddy-trail`,
 * `buddy-fragment`, `buddy-core`). Every parameter below is a spring in the
 * shared js/motion.js loop, written straight to nodes each frame. No
 * setState, and no opacity used as an entrance/exit technique — showing or
 * hiding an ember in the trail is a scale change, never a fade, and the
 * widget itself is not something that enters/leaves the viewport under this
 * module's control (whatever mounts it owns that).
 *
 * ---------------------------------------------------------------------
 * CONTRACT — this expects brand/buddy.svg inlined into the DOM (not an
 * <img>, which would hide its internals from script), somewhere under
 * opts.root, using that file's own layer ids unchanged:
 *
 *   #buddy-glow      ambient halo — animated: radius via transform: scale()
 *   #buddy-trail     the ember group — animated: each direct child's own
 *                    scale (visible/hidden = target 1/0, never opacity)
 *   #buddy-fragment  the shard — animated: rotate (tilt) around its own
 *                    center, transform-origin already sits mid-shape
 *   #buddy-core      the living core — animated: scale (breathing/mood
 *                    intensity) and CSS filter brightness (mood heat)
 *
 * If any of those ids are missing, this module no-ops for that layer rather
 * than throwing — it does not assume a DOM shape beyond what it needs.
 * ---------------------------------------------------------------------
 *
 * MOODS → MOTION PARAMETERS
 *
 *   idle       Resting state. Slow sine breathing on the core (no spring
 *              target toggling — a continuous function of time, still
 *              written straight to the node every frame), 2 of 4 embers
 *              visible, glow at baseline, fragment level (no forced tilt).
 *   greeting   His intro line. Core brighter and larger, fragment leans in
 *              (a fixed tilt toward the viewer, not the cursor), full trail,
 *              glow widens — the "leaning in to talk to you" beat that
 *              answers the tonal gap (see below).
 *   working    "On it" — mid-fix. Trail extends further than greeting and
 *              gets a small continuous jitter (a re-randomized micro-target
 *              on the fragment's tilt, re-rolled every ~180ms), core pulses
 *              faster. Reads as busy without a face doing the "concentrating"
 *              look for him.
 *   success    "Fixed." A one-shot flare: glow spikes and decays, core scale
 *              spikes and decays, and the trail's embers pulse outward in a
 *              short stagger (each ember's scale target blips past 1 and
 *              back, offset a few ms apart) like a small wave of relief
 *              running down the tail. Then it settles back to idle.
 *
 * setMood(name) only ever changes spring targets (and, for 'success', fires
 * a one-shot timed sequence) — it never touches layout, so it's safe to call
 * on any cadence, including per dialogue line.
 *
 * Cursor attention (opts.cursorAttract, default true): on a fine pointer,
 * with motion enabled, the fragment's tilt blends the mood's own tilt with a
 * small lean toward the cursor when it's within range — Buddy "looking" at
 * you without eyes.
 */
(function () {
  'use strict';

  var IDS = { glow: 'buddy-glow', trail: 'buddy-trail', fragment: 'buddy-fragment', core: 'buddy-core' };

  var BREATH_PERIOD_MS = 3400;
  var BREATH_DEPTH = 0.035;

  var TILT_STIFFNESS = 90;
  var TILT_DAMPING = 14;      // ratio ~0.74 — a soft lean, one small overshoot
  var CURSOR_TILT_RADIUS = 480; // px — beyond this Buddy stops tracking the cursor
  var CURSOR_TILT_MAX_DEG = 5;

  var CORE_STIFFNESS = 140;
  var CORE_DAMPING = 16;
  var GLOW_STIFFNESS = 110;
  var GLOW_DAMPING = 16;
  var TRAIL_STIFFNESS = 170;
  var TRAIL_DAMPING = 15;     // ratio ~0.58 — embers pop in/out with a little life, not a linear pop

  var JITTER_REROLL_MS = 180;
  var JITTER_MAX_DEG = 2.2;

  var MOODS = {
    idle:     { core: 1.00, brightness: 1.00, glow: 1.00, tilt: 0, trailCount: 2, jitter: false },
    greeting: { core: 1.18, brightness: 1.35, glow: 1.25, tilt: -6, trailCount: 4, jitter: false },
    working:  { core: 1.10, brightness: 1.20, glow: 1.10, tilt: 3, trailCount: 4, jitter: true },
    success:  { core: 1.00, brightness: 1.00, glow: 1.00, tilt: 0, trailCount: 3, jitter: false }
  };

  var api = { init: init, setMood: setMood, destroy: destroy };
  var st = null;

  function q(root, id) { return root.querySelector('#' + id) || root.querySelector('[data-buddy="' + id.replace('buddy-', '') + '"]'); }

  function onPointerMove(e) {
    st.pointerX = e.clientX;
    st.pointerY = e.clientY;
    st.pointerActive = true;
  }
  function onPointerLeave() { st.pointerActive = false; }

  function fireSuccess() {
    var now = performance.now();
    st.successAt = now;
    st.successActive = true;
  }

  function setMood(name) {
    if (!st || !MOODS[name]) return;
    st.mood = name;
    if (name === 'success') fireSuccess();
  }

  function tick(dt, now) {
    if (!st) return;
    try {
      var M = window.NB_MOTION;
      var mood = MOODS[st.mood] || MOODS.idle;

      // Breathing: a continuous function of time, not a spring target — this
      // is idle "alive" texture, independent of mood swaps layered on top.
      var breath = 1 + Math.sin((now / BREATH_PERIOD_MS) * Math.PI * 2) * BREATH_DEPTH;

      // Jitter: working mood re-rolls a small random tilt offset periodically
      // rather than animating toward one fixed value, so it reads as
      // "occupied," not "leaning."
      if (mood.jitter && now - st.jitterRolledAt > JITTER_REROLL_MS) {
        st.jitterTarget = (Math.random() * 2 - 1) * JITTER_MAX_DEG;
        st.jitterRolledAt = now;
      } else if (!mood.jitter) {
        st.jitterTarget = 0;
      }

      // Cursor attention: blended on top of the mood's own tilt, fine
      // pointer only, only while active and within range.
      var cursorTilt = 0;
      if (st.cursorAttract && st.pointerActive && st.fragment) {
        var r = st.fragment.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = st.pointerX - cx;
        var dist = Math.hypot(dx, st.pointerY - cy);
        if (dist < CURSOR_TILT_RADIUS) {
          var pull = 1 - dist / CURSOR_TILT_RADIUS;
          cursorTilt = clampNum(dx / CURSOR_TILT_RADIUS, -1, 1) * CURSOR_TILT_MAX_DEG * pull;
        }
      }

      var tiltTarget = mood.tilt + st.jitterTarget + cursorTilt;
      var tilt = M.spring('nb-buddy-tilt', tiltTarget, TILT_STIFFNESS, TILT_DAMPING);
      if (st.fragment) st.fragment.style.transform = 'rotate(' + tilt.toFixed(2) + 'deg)';

      var successBoost = 0, successGlow = 0;
      if (st.successActive) {
        // A short spike-and-decay curve, hand-shaped rather than sprung,
        // because a one-shot flare reads cleaner as an explicit curve than
        // as a spring target that gets set back a moment later.
        var elapsed = now - st.successAt;
        var FLARE_MS = 620;
        if (elapsed > FLARE_MS) {
          st.successActive = false;
        } else {
          var p = elapsed / FLARE_MS;
          var env = Math.sin(p * Math.PI); // 0 -> 1 -> 0
          successBoost = env * 0.4;
          successGlow = env * 0.6;
        }
      }

      var coreTarget = mood.core + successBoost;
      var coreScale = M.spring('nb-buddy-core-scale', coreTarget, CORE_STIFFNESS, CORE_DAMPING) * breath;
      if (st.core) {
        st.core.style.transform = 'scale(' + coreScale.toFixed(4) + ')';
        st.core.style.filter = 'brightness(' + (mood.brightness + successBoost).toFixed(3) + ')';
      }

      var glowTarget = mood.glow + successGlow;
      var glowScale = M.spring('nb-buddy-glow-scale', glowTarget, GLOW_STIFFNESS, GLOW_DAMPING);
      if (st.glow) st.glow.style.transform = 'scale(' + glowScale.toFixed(4) + ')';

      if (st.trailItems.length) {
        st.trailItems.forEach(function (el, i) {
          var visible = i < mood.trailCount;
          // Success sends a short wave down the tail: each ember's target
          // blips past its resting scale a few ms apart.
          var waveTarget = 1;
          if (st.successActive) {
            var waveElapsed = (now - st.successAt) - i * 70;
            if (waveElapsed > 0 && waveElapsed < 260) {
              waveTarget = 1 + Math.sin((waveElapsed / 260) * Math.PI) * 0.5;
            }
          }
          var target = visible ? waveTarget : 0;
          var v = M.spring('nb-buddy-trail-' + i, target, TRAIL_STIFFNESS, TRAIL_DAMPING);
          el.style.transform = 'scale(' + v.toFixed(3) + ')';
        });
      }
    } catch (err) {
      console.error('buddy tick', err);
    }
  }

  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function init(opts) {
    opts = opts || {};
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !window.NB_MOTION) return api; // static art, no listeners, no springs

    var root = opts.root
      ? (typeof opts.root === 'string' ? document.querySelector(opts.root) : opts.root)
      : document;
    if (!root) return api;

    var glow = q(root, IDS.glow);
    var trail = q(root, IDS.trail);
    var fragment = q(root, IDS.fragment);
    var core = q(root, IDS.core);
    if (!glow && !trail && !fragment && !core) return api; // nothing to drive

    var isFinePointer = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    st = {
      root: root,
      glow: glow,
      trail: trail,
      fragment: fragment,
      core: core,
      trailItems: trail ? Array.prototype.slice.call(trail.children) : [],
      mood: opts.mood && MOODS[opts.mood] ? opts.mood : 'idle',
      jitterTarget: 0,
      jitterRolledAt: 0,
      successActive: false,
      successAt: 0,
      cursorAttract: opts.cursorAttract !== false && isFinePointer,
      pointerX: 0,
      pointerY: 0,
      pointerActive: false,
      unsub: null
    };

    // Transform-origin so rotate() reads as a tilt of the whole shard rather
    // than an orbit around its bounding-box corner.
    if (fragment) fragment.style.transformOrigin = '50% 50%';
    if (core) core.style.transformOrigin = '50% 50%';
    if (glow) glow.style.transformOrigin = '50% 50%';
    st.trailItems.forEach(function (el) { el.style.transformOrigin = '50% 50%'; });

    if (st.cursorAttract) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    }

    st.unsub = window.NB_MOTION.onFrame(tick);
    return api;
  }

  function destroy() {
    if (!st) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerleave', onPointerLeave);
    if (st.unsub) st.unsub();

    if (st.fragment) st.fragment.style.transform = '';
    if (st.core) { st.core.style.transform = ''; st.core.style.filter = ''; }
    if (st.glow) st.glow.style.transform = '';
    st.trailItems.forEach(function (el) { el.style.transform = ''; });

    st = null;
  }

  window.NB_BUDDY = api;
})();
