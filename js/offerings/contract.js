/* The Offerings Procession — the frozen data contract.
 *
 * Four departments build this section in parallel and none of them talks to
 * another. This file is the entire shared vocabulary between them. It is
 * typedefs and constants only: it has no runtime behaviour beyond exporting a
 * few numbers, and nothing in it may change once the departments start.
 *
 * The shape of the thing:
 *
 *   PHYSICS   js/offerings/procession.js   the helix, the springs, the pointer
 *   MOTION    js/offerings/atlas.js        twelve loops and the atlas
 *             js/gl/offering-loops.js
 *   GRAPHICS  js/offerings/wall.js         mesh, glass, blur, grain, light
 *             js/gl/offering-material.js
 *   CARD      js/offerings/card.js         open/close, the card, the form
 *   (lead)    js/acts/offerings.js         the act that wires them together
 *
 * Every department receives the SAME WallState object every frame. PHYSICS
 * mutates it; MOTION and GRAPHICS only read it. Nobody imports across
 * departments, and the act is the only module that imports more than one.
 *
 * ---------------------------------------------------------------------------
 * UNITS. Read this before writing a line. Getting these wrong produces bugs
 * that look like art direction problems and waste a day each.
 *
 *   Position   CSS pixels, origin top-left of the VIEWPORT, y down. The same
 *              space as getBoundingClientRect(). Not NDC, not device pixels,
 *              not panel-local. GRAPHICS converts to clip space in the vertex
 *              shader with one uniform and nobody else ever thinks about it.
 *   Rotation   radians, positive clockwise on screen.
 *   Scale      multiplier on the panel's nominal size. 1.0 at t = 0.
 *   t          signed helix phase. 0 is centre-foreground and largest.
 *              Negative is arriving from the lower right, positive is receding
 *              to the upper left. Visible band |t| <= 2.5.
 *   z          0 at the hero, 1 at the furthest drawn panel. Drives the
 *              recede-blur and the painter's order. A pure function of t, but
 *              PHYSICS owns that function and nobody else recomputes it.
 *   alpha      the panel's own opacity. GRAPHICS multiplies by the Stage's
 *              cross-fade alpha itself, once, at the very end.
 * ---------------------------------------------------------------------------
 */

/**
 * @typedef {Object} PanelState
 * @property {number} index      0..11, stable, matches the DOM [data-offer] order
 * @property {number} t          signed helix phase, 0 at centre
 * @property {number} z          0..1 depth, 0 at the hero
 * @property {number} cx         panel centre x, CSS px, viewport space
 * @property {number} cy         panel centre y, CSS px, viewport space
 * @property {number} w          panel width,  CSS px, already scaled by depth
 * @property {number} h          panel height, CSS px, already scaled by depth
 * @property {number} rot        rotation, radians
 * @property {number} alpha      0..1, this panel's own opacity
 * @property {number} intensity  0..1, how awake this loop should be. 1 at
 *                               centre, falling with |t|, spiking on press.
 *                               Becomes MOTION's u_intensity uniform.
 * @property {number} vertStart  first vertex of this panel within state.verts
 * @property {number} vertCount  vertex count for this panel
 * @property {number} idxStart   first index of this panel in the static IBO
 * @property {number} idxCount   index count for this panel
 */

/**
 * @typedef {Object} WallState
 * @property {PanelState[]} panels  always 12, always in index order
 * @property {number[]} order   panel indices, BACK TO FRONT. GRAPHICS draws in
 *                              exactly this order and never sorts. If the order
 *                              is wrong there is one file to open.
 * @property {number} centre    index of the panel nearest t = 0
 * @property {number} hover     hovered panel index, or -1
 * @property {number} open      opened panel index, or -1
 * @property {number} press     pressed panel index, or -1
 * @property {Float32Array} verts  the dynamic vertex data. LAYOUT FROZEN:
 *                              four floats per vertex, [x, y, nx, ny].
 *                              x,y are ABSOLUTE viewport CSS px — the helix
 *                              transform is already baked in by PHYSICS, which
 *                              is why GRAPHICS needs no knowledge of the helix
 *                              and does no matrix work at all.
 *                              nx,ny are the surface normal's screen-space xy;
 *                              nz is implied as sqrt(1 - nx*nx - ny*ny).
 *                              PHYSICS allocates and owns this array.
 *                              GRAPHICS uploads it and never writes to it.
 * @property {number} dirtyStart  first dirty VERTEX (not float, not byte)
 * @property {number} dirtyEnd    one past the last dirty vertex
 * @property {boolean} vertsReallocated  set by PHYSICS when the lattice size
 *                              changed and state.verts is a NEW array.
 *                              GRAPHICS checks it and re-does bufferData
 *                              instead of bufferSubData, then clears it.
 *                              Never set on an ordinary resize.
 * @property {number} lattice   vertices per side: 12, 8 or 5, set by tier
 * @property {number} phase     raw scroll phase. Debugging only.
 */

/* --- the rail ------------------------------------------------------------ */

/** Twelve offerings, twelve panels. Never derived, never configurable. */
export const COUNT = 12;

/** Visible band. Beyond this a panel is not drawn and its loop is stopped. */
export const BAND = 2.5;

/* Scroll distance per panel step, in viewport heights.
 *
 * The section must carry panel 0 from t = -BAND to panel 11 at t = +BAND, so
 * the span is STEP * (COUNT - 1 + 2*BAND) = STEP * 16. At 0.62 that is 9.9
 * screens, which is the "about ten screens" Colin picked. Arrival to centre is
 * 2 * STEP = 1.24 viewports, and centre-to-centre is about 500px — roughly one
 * trackpad swipe per offering, which is deliberate rather than twitchy.
 *
 * If this number changes, SECTION_SVH below must change with it, and the
 * height in css/stage.css must match. They are checked against each other in
 * tests/offerings.spec.ts precisely because they will drift otherwise. */
export const STEP = 0.62;

/** Reserved section height, in svh. Must equal STEP * (COUNT - 1 + 2*BAND) * 100,
 *  rounded up. svh and not vh: a collapsing mobile URL bar must never resize
 *  the section, because the CLS gate is exactly zero. */
export const SECTION_SVH = 1000;

/* --- loop refresh schedule ----------------------------------------------- */

/* Only the panel being looked at runs at full rate. This is the whole reason
 * twelve live loops are affordable: without it the atlas alone costs more than
 * the rest of the section put together, and 85% of that goes to panels nobody
 * is looking at.
 *
 * Loop phase is driven by per-panel VISIBLE time — time accumulated only on
 * frames where that tile was actually refreshed. Using global time instead
 * means a tile stopped for six seconds resumes six seconds further through its
 * loop and visibly jumps on the frame it re-enters, every single time it comes
 * round. Counting visible frames makes the jump impossible, and ties a loop's
 * phase to how long the visitor really looked at it. */
export const REFRESH = [
  { maxT: 0.5, everyN: 1 },   // hero: the panel being read
  { maxT: 1.5, everyN: 2 },   // near: still legible at ~0.6 scale
  { maxT: 2.5, everyN: 6 },   // far: small, and the recede-blur hides it
  { maxT: 2.9, everyN: 0 }    // prefetch: rendered once on entry, then idle
];

/** Tile edge in px, and the per-frame fragment budget, by tier.
 *  The cap is a fragment budget rather than a tile count because tile size
 *  varies by tier and a tile count would mean something different at each. */
export const TILE = { 3: 320, 2: 224, 1: 128 };
export const TILE_BUDGET = { 3: 8, 2: 5, 1: 2 };

/** Gutter in texels around every tile. Cheap insurance: a clamp bug then
 *  degrades to a slightly cropped loop instead of a neighbouring tile bleeding
 *  in, which is a failure you can see in review rather than in production. */
export const GUTTER = 4;

/* --- geometry ------------------------------------------------------------ */

/** Lattice vertices per side, by tier. 12x12 is 144 verts a panel, 1728 total. */
export const LATTICE = { 3: 12, 2: 8, 1: 5 };

/** Hero panel height as a fraction of viewport height, and its aspect (w/h).
 *  4:5 portrait is our proportion: the loops are abstract and read better with
 *  vertical room, and it survives the narrower vertical spiral on a phone. */
export const HERO_H = 0.52;
export const ASPECT = 0.8;

/* --- springs -------------------------------------------------------------
 *
 * A throw is a DISPLACEMENT FROM THE RAIL that springs back. There is no
 * ballistic phase at all. A panel never leaves its slot, never changes its t,
 * and never enters free flight — which makes "panel thrown off screen"
 * impossible by construction rather than by clamping, and keeps the fixed
 * order 01-12 out of question.
 *
 * The clamp is a tanh soft limit, not a hard one. A hard clamp makes a strong
 * flick stop dead against an invisible wall and reads as a bug; tanh
 * asymptotes, so a harder flick gives more speed and more wobble but never
 * more distance. Which is how a heavy thing on a tether actually behaves. */
export const SPRING = {
  rail:    { k: 120, c: 13.6, maxFrac: 0.105 },  // maxFrac of viewport height
  rot:     { k: 90,  c: 12.0, max: 0.14 },       // radians, ~8 degrees
  lattice: { k: 260, c: 18.0, ampFrac: 0.035 }
};

/** Flick velocity is clamped before it seeds the spring, in units of the rail
 *  limit per second. The worst possible flick reaches the asymptote and
 *  returns. */
export const FLICK_MAX = 4;

/* --- mascot --------------------------------------------------------------
 * Built now, filled by the Character department later. The act publishes this
 * and fires the hooks; nothing here depends on a mascot existing. */
export const HOOKS = ['onPanelHover', 'onPanelFocus', 'onPanelOpen', 'onPanelThrow'];
