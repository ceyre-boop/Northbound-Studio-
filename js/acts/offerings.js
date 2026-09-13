/* Act — The Offerings Procession.
 *
 * This file is the integrator and nothing else. It owns no helix maths, no
 * shader, no spring and no pixel. Its whole job is to call four modules in the
 * right order with the right arguments, and to be the only place that imports
 * more than one of them.
 *
 *   PHYSICS   procession.js   mutates the WallState every frame
 *   MOTION    atlas.js        reads the state, refreshes loop tiles
 *   GRAPHICS  wall.js         reads the state, draws the glass
 *   CARD      card.js         the DOM: open, close, add to project
 *
 * The one shared object is the WallState. PHYSICS mutates it, the other two
 * read it, and that is how the centre-panel index and the per-panel depth
 * reach MOTION and GRAPHICS without any of the three importing each other.
 *
 * Order inside draw() is load-bearing: the atlas must be refreshed BEFORE the
 * glass samples it, or every panel is one frame stale — which is invisible
 * when scrolling and very visible when a panel is opened and held still.
 */
import * as C from '../offerings/contract.js';
import * as Physics from '../offerings/procession.js';
import * as Motion from '../offerings/atlas.js';
import * as Graphics from '../offerings/wall.js';
import * as Card from '../offerings/card.js';

var S = null;        // WallState
var bank = null;     // MOTION
var glass = null;    // GRAPHICS
var pin = null;      // the sticky wrapper, our screen region and event target
var bound = false;

/* The mascot's seat. Built now, filled by the Character department later.
 * Nothing in this act depends on a mascot existing — every hook is a no-op
 * until something assigns to it. */
function publishHooks(root) {
  var api = window.NB_OFFERINGS || (window.NB_OFFERINGS = {});
  api.mount = root ? root.querySelector('#nb-mascot-mount') : null;
  for (var i = 0; i < C.HOOKS.length; i++) {
    if (typeof api[C.HOOKS[i]] !== 'function') api[C.HOOKS[i]] = function () {};
  }
  api.count = C.COUNT;
  return api;
}

function fire(name, a, b) {
  var api = window.NB_OFFERINGS;
  if (!api || typeof api[name] !== 'function') return;
  try { api[name](a, b); } catch (e) { /* a mascot must never break the wall */ }
}

/* Pointer plumbing. The act forwards raw events; PHYSICS does its own
 * hit-testing, because it is the only module that knows where the panels are.
 *
 * touch-action: pan-y on the pin (see css/act-offerings.css) means vertical
 * scrolling always wins on a phone and only horizontal drag pulls a panel.
 * That is the honest touch compromise and it is written down rather than
 * discovered: on touch you get ripple, horizontal drag and flick — not
 * vertical drag, because vertical belongs to the page. */
var last = { x: 0, y: 0, t: 0, vx: 0, vy: 0 };

function bindPointer(el) {
  if (bound) return;
  bound = true;

  el.addEventListener('pointermove', function (e) {
    var now = performance.now();
    var dt = Math.max(1, now - last.t) / 1000;
    last.vx = (e.clientX - last.x) / dt;
    last.vy = (e.clientY - last.y) / dt;
    last.x = e.clientX; last.y = e.clientY; last.t = now;
    if (!S) return;
    var before = S.hover;
    Physics.pointerMove(e.clientX, e.clientY, S);
    if (S.hover !== before && S.hover >= 0) fire('onPanelHover', S.hover);
  }, { passive: true });

  el.addEventListener('pointerdown', function (e) {
    if (!S || e.button !== 0) return;
    last.x = e.clientX; last.y = e.clientY; last.t = performance.now();
    Physics.pointerDown(e.clientX, e.clientY, S);
  }, { passive: true });

  el.addEventListener('pointerup', function (e) {
    if (!S) return;
    var pressed = S.press;
    var moved = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    Physics.pointerUp(e.clientX, e.clientY, last.vx, last.vy, S);
    if (pressed >= 0 && Math.hypot(last.vx, last.vy) > 250) fire('onPanelThrow', pressed);
    /* A tap is a click. Anything that travelled is a drag, and a drag must not
       open a panel underneath the finger it just dragged. */
    else if (pressed >= 0 && moved < 8) Card.open(pressed);
  }, { passive: true });

  el.addEventListener('pointerleave', function () {
    if (S) Physics.pointerLeave(S);
  }, { passive: true });
}

export default {
  manifest: {
    id: 'offerings',
    label: 'The offerings',
    /* Fallback only. The Stage measures the real window from the section's own
       geometry at boot and overrides this — see measureWindows() in
       js/stage/stage.js and the comment in js/stage/cast.js about why these
       numbers are not the truth. */
    window: [0.40, 0.95],
    cost: 5,
    /* Two targets: MOTION's loop atlas and GRAPHICS' backdrop. One spare so a
       later pass never has to come back and edit the cast list. */
    fboBudget: 3,
    requires: [],
    preload: 0.10
  },

  async init(ctx) {
    pin = ctx.root ? ctx.root.querySelector('.offer-pin') : null;
    publishHooks(ctx.root);

    S = Physics.create({
      tier: ctx.tier,
      reduced: ctx.mode === 'reduced',
      width: ctx.width,
      height: ctx.height,
      rect: pin
    });

    /* MOTION compiles only its vertex shader and the prime pass here, and
       primes all twelve tiles with a static gradient. The twelve loop programs
       compile one per frame inside render().

       This is not an optimisation, it is a gate requirement. Fifteen programs
       LLVM-JIT'd by the software rasteriser CI runs on is plausibly a 300-600ms
       stall in one frame, and scripts/perf.mjs takes the MINIMUM of six
       half-second FPS samples — so a single stall fails fpsMin outright. The
       Stage catches throws; it cannot catch a stall. */
    bank = Motion.create(ctx);
    glass = Graphics.create(ctx, S);

    Card.init(ctx.root, {
      onOpen: function (i) {
        Physics.open(i, S);
        fire('onPanelOpen', i);
      },
      onClose: function () { Physics.close(S); },
      centre: function () { return S ? S.centre : 0; }
    });

    if (pin) bindPointer(pin);

    /* The wall state, exposed for tests and for looking at the thing while it
       runs. Read-only by convention: nothing in the build writes through it. */
    window.__NB_WALL = S;
  },

  resize(w, h, dpr) {
    if (!S) return;
    Physics.resize(w, h, S);
    Graphics.resize(glass, w, h, dpr);
  },

  /* CPU only — not one gl.* call in here, per the Stage contract. That
     separation is what lets the Stage measure this act's submission cost
     separately from everyone else's. */
  update(dt, p, ctx) {
    if (!S) return;
    var before = S.centre;
    Physics.update(dt, p, S);
    if (S.centre !== before) {
      Card.setCentre(S.centre);
      fire('onPanelFocus', S.centre);
    }
  },

  draw(alpha, ctx) {
    if (!S || !bank || !glass) return;
    Motion.render(bank, S, ctx.lastDt || 1 / 60, ctx);
    Graphics.draw(glass, S, Motion.texture(bank), function (i) {
      return Motion.tileRect(bank, i);
    }, alpha, ctx);
  },

  /* Reduced motion, which is the default on the machine this is built on and
     therefore the frame most people here will ever see. The procession settles
     to its rest pose for the current scroll position, every loop is rendered
     once at its settled phase, and the glass composes one frame. The card
     still opens, and every offering is still reachable. */
  drawStill(ctx) {
    if (!S || !bank || !glass) return;
    Physics.settle(window.NB_STAGE ? localProgress(ctx) : 0, S);
    Motion.renderStill(bank, S, ctx);
    Graphics.drawStill(glass, S, Motion.texture(bank), function (i) {
      return Motion.tileRect(bank, i);
    }, ctx);
  },

  /* No WebGL, or init threw. The DOM list is the section: it stops being a
     hidden accessibility layer and becomes the visible, readable presentation.
     No GL calls here, and zero console errors — a perf gate counts them. */
  fallback(ctx) {
    var root = ctx && ctx.root;
    if (root) root.setAttribute('data-act-state', 'static');
    try { Card.init(root, { onOpen: function () {}, onClose: function () {}, centre: function () { return 0; } }); }
    catch (e) { /* the links still work without it */ }
  },

  stats() {
    if (!S) return {};
    return { panels: C.COUNT, lattice: S.lattice, centre: S.centre };
  },

  dispose() {
    try { Motion.dispose(bank); } catch (e) {}
    try { Graphics.dispose(glass); } catch (e) {}
    try { Physics.dispose(S); } catch (e) {}
    bank = null; glass = null; S = null;
    try { delete window.__NB_WALL; } catch (e) { window.__NB_WALL = null; }
    /* Card and the pointer listeners deliberately survive: the DOM half of this
       section must keep working while the act is scrolled out and torn down. */
  }
};

/** The act's own 0..1 progress, for the still path where the Stage does not
 *  hand it to us. */
function localProgress(ctx) {
  var st = window.NB_STAGE;
  if (!st || !ctx || !ctx.root) return 0;
  var r = ctx.root.getBoundingClientRect();
  var top = r.top + window.scrollY;
  var span = Math.max(1, r.height - window.innerHeight);
  var t = (window.scrollY - top) / span;
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}
