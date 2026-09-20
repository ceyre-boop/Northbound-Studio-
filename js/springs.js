/* Northbound — spring presets.
 *
 * This is the file every DOM spring's numbers come from. Two narrow,
 * documented exceptions exist and both are exempted by tests/motion.spec.ts's
 * grep guard rather than silently ignored:
 *   - js/offerings/* — its own drag/throw simulation, a different model
 *     entirely (see that department's own header).
 *   - js/motion.js's single DEFAULT_PRESET — the integrator's fallback for
 *     the (should-never-happen) case that this file failed to load, so
 *     spring() has somewhere safe to fall back to instead of producing NaN.
 * Every other DOM spring, in JS or in CSS, is a name that resolves back to
 * one of the presets below.
 *
 * Each preset is `{ stiffness, damping, mass }`, fed straight into
 * js/motion.js's semi-implicit-Euler integrator: `a = (-k*(x-target) - d*v) / m`.
 *
 * At boot this module also samples each preset's step response into a CSS
 * `linear()` easing function plus its settle duration, and publishes both as
 * `--spring-<name>` / `--spring-<name>-ms` on :root. A CSS transition that
 * uses those two custom properties runs the exact same physics with no
 * per-frame JS — that's what nav underlines and label motion do.
 */
(function () {
  'use strict';

  var PRESETS = {
    // Entrances: latched scroll progress settling into place.
    settle: { stiffness: 170, damping: 18, mass: 1 },
    // Cards lifting off the page under a cursor / touch.
    lift: { stiffness: 220, damping: 20, mass: 1 },
    // Pressed state — fast in, no overshoot.
    press: { stiffness: 420, damping: 32, mass: 0.7 },
    // Magnetic pull toward the cursor.
    magnet: { stiffness: 260, damping: 16, mass: 0.6 },
    // Small UI motion — labels, underlines, the sticky CTA, form state.
    ui: { stiffness: 300, damping: 26, mass: 0.9 },
    // A clicked element becoming an overlay: the offer/work card morphing
    // into its panel, and the basket chip a ghost has just landed on. Tuned
    // for the same overshoot the old hand-picked cubic-bezier(.28,1.5,.5,1)
    // gave that transform, at the same ~560-600ms it settled in.
    morph: { stiffness: 370, damping: 22, mass: 1 }
  };

  // A reasonable static approximation of each preset's curve, used only when
  // the browser cannot parse `linear()` (Safe­ari < 17.4, older Firefox).
  var FALLBACK = {
    settle: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    lift: 'cubic-bezier(0.22, 1, 0.36, 1)',
    press: 'cubic-bezier(0.4, 0, 0.2, 1)',
    magnet: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    ui: 'cubic-bezier(0.4, 0, 0.2, 1)',
    morph: 'cubic-bezier(.28, 1.5, .5, 1)'
  };

  var FIXED = 1 / 120;

  /** Run the same integrator js/motion.js uses, from 0 toward 1, and sample
   *  it. Returns { points: number[], durationMs }. */
  function sample(preset, steps) {
    steps = steps || 24;
    var k = preset.stiffness, d = preset.damping, m = preset.mass || 1;
    var value = 0, v = 0, target = 1;
    var points = [0];
    var t = 0;
    var maxMs = 2400; // hard stop — a spring that hasn't settled by then is mistuned
    var settledAt = null;
    while (t < maxMs / 1000) {
      var f = -k * (value - target) - d * v;
      var a = f / m;
      v += a * FIXED;
      value += v * FIXED;
      t += FIXED;
      if (settledAt === null && Math.abs(v) < 0.001 && Math.abs(value - target) < 0.001) {
        settledAt = t;
        break;
      }
    }
    var duration = settledAt || t || 0.4;
    // Re-run, sampling at even time steps across the settle duration, so the
    // linear() stop list reflects real elapsed time (what a CSS transition
    // interpolates against), not simulation steps.
    value = 0; v = 0; t = 0;
    var next = duration / steps;
    var sampleAt = next;
    for (var iter = 0; iter < 200000 && t < duration + FIXED; iter++) {
      var f2 = -k * (value - target) - d * v;
      var a2 = f2 / m;
      v += a2 * FIXED;
      value += v * FIXED;
      t += FIXED;
      if (t >= sampleAt) {
        points.push(value);
        sampleAt += next;
      }
    }
    points.push(1);
    return { points: points, durationMs: Math.round(duration * 1000) };
  }

  function toLinear(points) {
    var stops = [];
    for (var i = 0; i < points.length; i++) {
      var pct = (i / (points.length - 1)) * 100;
      stops.push(points[i].toFixed(4) + ' ' + pct.toFixed(2) + '%');
    }
    return 'linear(' + stops.join(', ') + ')';
  }

  function supportsLinear() {
    try {
      return typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)');
    } catch (e) { return false; }
  }

  function boot() {
    if (typeof document === 'undefined') return;
    var root = document.documentElement;
    var useLinear = supportsLinear();
    Object.keys(PRESETS).forEach(function (name) {
      var s = sample(PRESETS[name]);
      var easing = useLinear ? toLinear(s.points) : FALLBACK[name];
      root.style.setProperty('--spring-' + name, easing);
      root.style.setProperty('--spring-' + name + '-ms', s.durationMs + 'ms');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.NB_SPRINGS = { presets: PRESETS, fallback: FALLBACK };
})();
