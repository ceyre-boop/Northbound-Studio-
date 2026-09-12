/* Northbound — the cast list.
 *
 * The four acts, their scroll windows and their budgets, declared in one place
 * so that no act decides its own place in the sequence. An act that could move
 * its own window could overlap a neighbour, and two heavy acts live at once is
 * the one frame budget on this page that does not exist.
 *
 * The `window` values below are a FALLBACK, not the truth. At boot the Stage
 * measures each act's real section with measureWindows() and overrides them:
 * an act owns the scroll while its section's body crosses the middle of the
 * screen. These numbers are only used if an act's section is missing from the
 * document entirely.
 *
 * That indirection is not decoration. These were hardcoded first, and the
 * guesses were wrong by enough that Act III came on stage a viewport and a
 * half after its own heading had scrolled away — it rendered its type exactly
 * where the type was, off the top of the screen, and the canvas sat blank with
 * no error and nothing in the console to find. Measured windows cannot drift
 * when the copy changes length, and the copy will change length.
 *
 * Measured windows butt against each other exactly. The Stage widens each seam
 * by NB_STAGE.BAND on both sides, which is where the cross-fade happens, so at
 * most two acts are ever live and only for about a tenth of the scroll.
 *
 * `cost` is relative GPU cost at tier 3, and >= 4 means "heavy": when two heavy
 * acts overlap in a seam, each is told it has half the frame and each is
 * required to have a cheaper mode it can fall into for that moment.
 *
 * `requires` names GLCaps keys that must be truthy or the act's fallback()
 * runs instead of its init(). Keep these short — prefer degrading inside
 * init() over refusing to run at all.
 */
(function () {
  'use strict';

  /* These paths are root-absolute, and that is load-bearing rather than a
     style choice. A dynamic import() called from a CLASSIC script resolves
     against that script's own URL, not the document's — so './js/acts/work.js'
     written here, in a file served from /js/stage/, requests
     /js/stage/js/acts/work.js and 404s. Every act would then silently sink to
     its fallback() in production while working perfectly in any test that
     imported the module directly. */
  var S = window.NB_STAGE;
  if (!S) return;

  S.declare('northlight', '/js/acts/northlight.js', {
    label: 'Northlight',
    window: [0.00, 0.27],
    cost: 2,
    fboBudget: 0,
    requires: [],
    preload: 0.00   // eager: it is the first thing anyone sees
  });

  S.declare('drift', '/js/acts/drift.js', {
    label: 'Drift',
    window: [0.27, 0.55],
    cost: 4,
    fboBudget: 6,
    requires: [],   // has a stateless path for machines with no vertex texture fetch
    preload: 0.14
  });

  S.declare('solution', '/js/acts/solution.js', {
    label: 'Solution',
    window: [0.55, 0.82],
    cost: 5,
    fboBudget: 9,
    requires: [],   // degrades to an analytic curl field rather than refusing
    preload: 0.14
  });

  S.declare('work', '/js/acts/work.js', {
    label: 'The work',
    window: [0.82, 1.00],
    cost: 1,
    fboBudget: 2,
    requires: [],
    preload: 0.12
  });
})();
