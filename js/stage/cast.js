/* Northbound — the cast list.
 *
 * The four acts, their scroll windows and their budgets, declared in one place
 * so that no act decides its own place in the sequence. An act that could move
 * its own window could overlap a neighbour, and two heavy acts live at once is
 * the one frame budget on this page that does not exist.
 *
 * Windows are contiguous and butt against each other. The Stage widens each
 * seam by NB_STAGE.BAND on both sides, which is where the cross-fade happens,
 * so at most two acts are ever live and only for about a tenth of the scroll.
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

  var S = window.NB_STAGE;
  if (!S) return;

  S.declare('northlight', './js/acts/northlight.js', {
    label: 'Northlight',
    window: [0.00, 0.27],
    cost: 2,
    fboBudget: 0,
    requires: [],
    preload: 0.00   // eager: it is the first thing anyone sees
  });

  S.declare('drift', './js/acts/drift.js', {
    label: 'Drift',
    window: [0.27, 0.55],
    cost: 4,
    fboBudget: 6,
    requires: [],   // has a stateless path for machines with no vertex texture fetch
    preload: 0.14
  });

  S.declare('solution', './js/acts/solution.js', {
    label: 'Solution',
    window: [0.55, 0.82],
    cost: 5,
    fboBudget: 9,
    requires: [],   // degrades to an analytic curl field rather than refusing
    preload: 0.14
  });

  S.declare('work', './js/acts/work.js', {
    label: 'The work',
    window: [0.82, 1.00],
    cost: 1,
    fboBudget: 2,
    requires: [],
    preload: 0.12
  });
})();
