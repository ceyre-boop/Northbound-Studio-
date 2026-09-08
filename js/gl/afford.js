/* afford.js — how much GPU work this machine can carry, and a wrapper that
 * keeps a failed layer from taking the page down with it.
 *
 * The probe below started life on the abandoned layer branch as
 * canAffordField(), where a false verdict meant "do not render the field at
 * all". That is not what it means here. Northlight has no off state short of
 * a missing WebGL context: a machine that fails the probe gets the cheapest
 * tier of the same curtain, never a fallback to some other background. So the
 * verdict is a budget, not a veto.
 *
 * It is a budget probe, not a device sniff — it samples the frame loop we are
 * already running rather than guessing from a UA string, and a cold first
 * second is explicitly not disqualifying (fps === 0 means "not measured yet").
 */
(function () {
  'use strict';

  /* Coarse pointer is the interesting case. It is every phone, and on the old
     branch it meant "render nothing", because the field was a desktop luxury.
     Here it means two narrower things: run the cheap tier, and switch off the
     cursor lens — there is no cursor to bend the curtain toward. */
  function coarsePointer() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  /** true when this machine has headroom for the full curtain. */
  function canAfford() {
    var m = window.NB_MOTION;
    if (!m || m.reduced) return false;
    if (coarsePointer()) return false;
    var dm = navigator.deviceMemory;
    if (typeof dm === 'number' && dm <= 4) return false;
    var hc = navigator.hardwareConcurrency;
    if (typeof hc === 'number' && hc <= 4) return false;
    // fps === 0 is "not measured yet" — do not disqualify a cold start.
    return m.fps === 0 || m.fps >= 55;
  }

  /* Every layer brought up at mount goes through this. A throw in one layer
     must never reach the render loop that draws the rest of the page. */
  function safe(name, fn) {
    try { fn(); } catch (e) { console.error('layer ' + name, e); }
  }

  window.NB_AFFORD = {
    canAfford: canAfford,
    coarsePointer: coarsePointer,
    safe: safe
  };
})();
