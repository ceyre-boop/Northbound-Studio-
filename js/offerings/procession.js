/* PHYSICS — The Offerings Procession.
 *
 * The helix, the springs, the pointer. This module is the sole owner of
 * WallState: it allocates it, mutates it every frame, and nobody else ever
 * replaces or clones the object. MOTION and GRAPHICS only read it.
 *
 * ZERO gl.* calls, ZERO DOM writes. The only outside world this file touches
 * is a single getBoundingClientRect() on the sticky wrapper (on resize) and
 * window.NB_MOTION.cursor (for the hover ripple). Everything else is maths.
 *
 * -----------------------------------------------------------------------
 * THE HELIX
 *
 * p (0..1, straight from the Stage) is the only scroll input. Panel i's
 * phase is:
 *
 *   t_i = p * SPAN - i - BAND        SPAN = COUNT - 1 + 2*BAND
 *
 * BAND here is always the contract's global BAND (2.5) — that is what keeps
 * the t-to-scroll mapping identical on every device, which matters because
 * the section's height (SECTION_SVH) is derived from that same BAND and is
 * fixed across tiers. What DOES vary by device is DRAW_BAND: the distance
 * from centre at which a panel is actually considered "in view" and springs
 * go live for fading/cropping purposes. Desktop uses the full BAND (2.5);
 * mobile crops tighter, at 1.5, per the brief's "band ±1.5" for mobile —
 * read as a display-side crop of the same continuous t range, not a
 * different scroll mapping.
 *
 * From t, per panel:
 *   scale   s   = 1 / (1 + 0.62*|t|)
 *   along   ax  = -Ax * t     (enters right, leaves left)
 *           ay  =  AY * t     (AY carries its own sign; enters low, leaves high)
 *   orbit   r   = Rmax * |t|  (collapses to zero at centre — this is what
 *                              makes a panel LAND rather than pass through)
 *           phi = phi0 + t * PHI
 *   rot     = -t * ROT        (crosses zero exactly when the orbit does,
 *                              which is what makes it square up at centre)
 *   z       = |t| / BAND      (0 at centre, 1 at the contract edge)
 *   alpha   fades in over the first 0.35 of DRAW_BAND, out over the last 0.5
 *
 * Deceleration through centre falls out of the maths rather than needing a
 * separate easing curve: d/dt of the orbital term r*e^i*phi has a component
 * r * dphi/dt = Rmax*PHI*|t|, which is zero at t=0 and grows linearly away
 * from it. ax/ay contribute a constant speed, so total on-screen speed is
 * smallest at the centre and grows outward — exactly the "sails in, slows to
 * present itself, then accelerates away" pacing asked for, with no extra
 * easing function required.
 *
 * -----------------------------------------------------------------------
 * SPRINGS — a throw is a displacement from the rail, never free flight.
 *
 * t never changes because of a pointer. A drag/flick only displaces the
 * panel's rendered position from its rail pose by (dx,dy) and (drot), which
 * always springs back to (0,0,0). The clamp is tanh, per contract SPRING:
 *   d = dir * R * tanh(|d| / R),  R = SPRING.rail.maxFrac * viewportHeight
 *
 * Live springs (actual integration) run only for |t| <= 1.5, per the
 * contract's fixed cost control. Panels outside that band are snapped to
 * their rest displacement (0) directly — no wasted integration.
 *
 * -----------------------------------------------------------------------
 * THE LATTICE — it actually deforms.
 *
 * The mesh is not a rigid quad wearing a fake bulge in its normals. Each
 * vertex's [x, y] is the panel's rigid transform (the helix pose above) PLUS
 * an in-plane push from whatever is touching that vertex: a travelling
 * gaussian ripple from the cursor, and a localised wobble dimple from a
 * press/drag (SPRING.lattice). Both are smooth per-vertex fields, so
 * neighbours always sample nearly the same value and nothing tears — a tear
 * needs a discontinuity, not a gradient.
 *
 * A panel at rest still reads as glass rather than a flat sheet: every
 * vertex also carries a synthetic height from a shallow paraboloid lens
 * (peak at centre, zero at the rim). The ripple/wobble add to that same
 * height field rather than replacing it.
 *
 * nx,ny are then DERIVED from the displaced surface, not modelled apart from
 * it: central difference against lattice neighbours gives two tangents in
 * (x, y, height) space, and their cross product is the true normal. Because
 * the tangents come from the already-rotated, already-displaced positions,
 * the panel's own rotation is inherited for free — no separate rotation step
 * for the normal field, and shading always agrees with the silhouette that
 * produced it.
 */

import {
  COUNT, BAND, LATTICE, HERO_H, ASPECT, SPRING, FLICK_MAX
} from './contract.js';

var F = 4;                       // floats per vertex: x, y, nx, ny
var FIXED = 1 / 120;              // fixed sub-step, matches js/motion.js
var PARK = 4e-4;
var LIVE_T = 1.5;                 // live-spring cutoff, fixed by contract prose
var MOBILE_WIDTH = 720;

var SPAN = COUNT - 1 + 2 * BAND;

/* ---- small maths helpers ------------------------------------------------ */

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

function tanhClamp(d, R) {
  if (R <= 0) return 0;
  var dir = d < 0 ? -1 : 1;
  var m = Math.abs(d);
  return dir * R * Math.tanh(m / R);
}

/** Semi-implicit Euler, fixed-step, sub-stepped — the js/motion.js idiom,
 *  copied rather than shared, because this module may not call NB_MOTION.spring
 *  (that registry writes CSS custom properties; this one writes vertex data). */
function integrateSpring(s, dt, k, c) {
  var n = Math.min(6, Math.max(1, Math.ceil(dt / FIXED)));
  var h = dt / n;
  for (var i = 0; i < n; i++) {
    var f = -k * (s.value - s.target) - c * s.v;
    s.v += f * h;
    s.value += s.v * h;
  }
  if (Math.abs(s.v) < PARK && Math.abs(s.value - s.target) < PARK) {
    s.value = s.target;
    s.v = 0;
  }
}

/* ---- per-tier / per-device constants ------------------------------------ */

function buildConsts(mobile, width, height) {
  var drawBand = mobile ? 1.5 : BAND;
  var Ax = (mobile ? 0.35 : 0.55) * width;
  var Ay = -(mobile ? 0.55 : 0.30) * height;   // negative: enters low, leaves high
  var Rmax = (mobile ? 0.28 : 0.42) * width;
  var PHI = (0.75 * Math.PI) / drawBand;        // ~3/4 turn swept across the drawn path
  var ROT = 0.5 / drawBand;                     // ~0.5rad of tilt at the drawn edge
  var phi0 = Math.PI / 4;
  var heroF = mobile ? 0.62 : HERO_H;
  return { mobile: mobile, drawBand: drawBand, Ax: Ax, Ay: Ay, Rmax: Rmax, PHI: PHI, ROT: ROT, phi0: phi0, heroF: heroF };
}

/* ---- lattice sizing ------------------------------------------------------ */

function latticeFor(tier) {
  return LATTICE[tier] || LATTICE[2] || 8;
}

function vertsPerPanel(lat) { return lat * lat; }
function idxPerPanel(lat) { return (lat - 1) * (lat - 1) * 6; }

/* ---- panel factory -------------------------------------------------------- */

function makePanel(i, vertStart, vertCount, idxStart, idxCount) {
  return {
    index: i,
    t: 0, z: 0, cx: 0, cy: 0, w: 0, h: 0, rot: 0, alpha: 0, intensity: 0,
    vertStart: vertStart, vertCount: vertCount, idxStart: idxStart, idxCount: idxCount,
    /* internal, PHYSICS-only ------------------------------------------- */
    _railX: { value: 0, target: 0, v: 0 },
    _railY: { value: 0, target: 0, v: 0 },
    _rot:   { value: 0, target: 0, v: 0 },
    _dragging: false,
    _dragStartX: 0, _dragStartY: 0,
    _dragBaseX: 0, _dragBaseY: 0,
    _pressGlow: 0,
    _rippleAnchorX: 0, _rippleAnchorY: 0, _rippleT: 999,
    _wobble: { value: 0, target: 0, v: 0 },
    _wobbleAnchorX: 0, _wobbleAnchorY: 0,
    _breathPhase: i * 2.399963229728653 /* golden angle, rad */,
    _prevAlpha: 0
  };
}

function allocGeometry(tier) {
  var lat = latticeFor(tier);
  var vpp = vertsPerPanel(lat);
  var ipp = idxPerPanel(lat);
  var panels = [];
  for (var i = 0; i < COUNT; i++) {
    panels.push(makePanel(i, i * vpp, vpp, i * ipp, ipp));
  }
  var verts = new Float32Array(COUNT * vpp * F);
  return {
    lattice: lat, panels: panels, verts: verts,
    tmpX: new Float64Array(vpp), tmpY: new Float64Array(vpp), tmpZ: new Float64Array(vpp)
  };
}

/* ---- geometry: one panel's rail pose from t ------------------------------ */

function poseFromT(t, c, out) {
  var at = Math.abs(t);
  var s = 1 / (1 + 0.62 * at);
  var ax = -c.Ax * t;
  var ay = c.Ay * t;
  var r = c.Rmax * at;
  var phi = c.phi0 + t * c.PHI;
  out.ox = ax + r * Math.cos(phi);
  out.oy = ay + r * Math.sin(phi);
  out.s = s;
  out.rot = -t * c.ROT;
  out.z = clamp(at / BAND, 0, 1);
  return out;
}

function alphaFromT(t, drawBand) {
  var edgeIn = -drawBand, edgeOut = drawBand;
  var fadeInW = 0.35 * drawBand;
  var fadeOutW = 0.5 * drawBand;
  var aIn = clamp((t - edgeIn) / fadeInW, 0, 1);
  var aOut = clamp((edgeOut - t) / fadeOutW, 0, 1);
  return clamp(Math.min(aIn, aOut), 0, 1);
}

/* ---- vertex fill -----------------------------------------------------------
 *
 * The lattice actually deforms. A vertex's final [x,y] is the panel's rigid
 * transform (rotate, translate — same as before) PLUS an in-plane push from
 * whatever lattice springs are alive at that vertex: the cursor ripple and
 * the press/drag wobble. Both are smooth fields evaluated per vertex — a
 * travelling gaussian and a localised bump — so neighbouring vertices always
 * sample nearly the same value and nothing tears.
 *
 * The panel's rest shape is a shallow lens (a paraboloid height field) so it
 * reads as glass even with no pointer near it. The ripple/wobble add to that
 * same height field rather than living apart from it.
 *
 * Normals are then DERIVED from the actual displaced surface: central
 * difference across lattice neighbours gives two tangents (in absolute
 * viewport space, height as a synthetic z), and their cross product is the
 * true surface normal. This is why it needs no separate rotation step — the
 * tangents are built from the already-rotated, already-displaced positions,
 * so rotation is inherited automatically and shading always agrees with the
 * silhouette that produced it.
 */

var MAX_PUSH_MULT = 1.2;     // safety cap on combined ripple+wobble push, in
                              // multiples of SPRING.lattice.ampFrac*viewportHeight

function lensHeight(lu, lv, amp) {
  var r2 = lu * lu + lv * lv;               // lu,lv in [-0.5, 0.5]
  var h = amp * (1 - 2 * r2);
  return h > 0 ? h : 0;
}

function fillPanelVerts(state, panel, lat) {
  var verts = state.verts;
  var base = panel.vertStart * F;
  var cosR = Math.cos(panel.rot), sinR = Math.sin(panel.rot);
  var n = lat - 1;
  var tmpX = state._tmpX, tmpY = state._tmpY, tmpZ = state._tmpZ;

  var ampBase = SPRING.lattice.ampFrac * state.height;
  var lensAmp = 0.08 * Math.min(panel.w, panel.h);
  var pushCap = ampBase * MAX_PUSH_MULT;

  var hasRipple = state.hover === panel.index && panel._rippleT < 0.8;
  var rippleAmp = 0, wavefront = 0, rippleSigma = Math.max(20, 0.18 * Math.min(panel.w, panel.h));
  if (hasRipple) {
    var env = 1 - panel._rippleT / 0.8;
    rippleAmp = ampBase * env;
    wavefront = panel._rippleT * 1.4 * state.height;
  }

  var wobbleVal = panel._wobble ? panel._wobble.value : 0;
  var hasWobble = Math.abs(wobbleVal) > 0.001;
  var wobbleSigma = Math.max(20, 0.35 * Math.min(panel.w, panel.h));

  /* pass 1: displaced position + synthetic height, per vertex */
  for (var row = 0; row <= n; row++) {
    var lv = (n === 0 ? 0 : row / n) - 0.5;
    for (var col = 0; col <= n; col++) {
      var lu = (n === 0 ? 0 : col / n) - 0.5;

      var lx = lu * panel.w;
      var ly = lv * panel.h;

      var pushX = 0, pushY = 0;
      var height = lensHeight(lu, lv, lensAmp);

      if (hasRipple) {
        var dxr = lx - panel._rippleAnchorX;
        var dyr = ly - panel._rippleAnchorY;
        var dr = Math.sqrt(dxr * dxr + dyr * dyr);
        var dd = dr - wavefront;
        var gr = Math.exp(-(dd * dd) / (2 * rippleSigma * rippleSigma));
        var ar = rippleAmp * gr;
        if (dr > 1e-4) { pushX += (dxr / dr) * ar; pushY += (dyr / dr) * ar; }
        height += ar;
      }

      if (hasWobble) {
        var dxw = lx - panel._wobbleAnchorX;
        var dyw = ly - panel._wobbleAnchorY;
        var dw = Math.sqrt(dxw * dxw + dyw * dyw);
        var gw = Math.exp(-(dw * dw) / (2 * wobbleSigma * wobbleSigma));
        var aw = ampBase * wobbleVal * gw;
        if (dw > 1e-4) { pushX += (dxw / dw) * aw; pushY += (dyw / dw) * aw; }
        height += aw;
      }

      var pushMag = Math.sqrt(pushX * pushX + pushY * pushY);
      if (pushMag > pushCap) {
        var pk = pushCap / pushMag;
        pushX *= pk; pushY *= pk;
      }

      var nlx = lx + pushX, nly = ly + pushY;
      var idx = row * (n + 1) + col;
      tmpX[idx] = panel.cx + nlx * cosR - nly * sinR;
      tmpY[idx] = panel.cy + nlx * sinR + nly * cosR;
      tmpZ[idx] = height;
    }
  }

  /* pass 2: normal from the actual displaced surface, central difference */
  for (var row2 = 0; row2 <= n; row2++) {
    for (var col2 = 0; col2 <= n; col2++) {
      var i0 = row2 * (n + 1) + col2;
      var iL = col2 > 0 ? i0 - 1 : i0;
      var iR = col2 < n ? i0 + 1 : i0;
      var iU = row2 > 0 ? i0 - (n + 1) : i0;
      var iD = row2 < n ? i0 + (n + 1) : i0;

      var Ux = tmpX[iR] - tmpX[iL], Uy = tmpY[iR] - tmpY[iL], Uz = tmpZ[iR] - tmpZ[iL];
      var Vx = tmpX[iD] - tmpX[iU], Vy = tmpY[iD] - tmpY[iU], Vz = tmpZ[iD] - tmpZ[iU];

      var Nx = Uy * Vz - Uz * Vy;
      var Ny = Uz * Vx - Ux * Vz;
      var Nz = Ux * Vy - Uy * Vx;
      if (Nz < 0) { Nx = -Nx; Ny = -Ny; Nz = -Nz; }  // face the viewer

      var len = Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz);
      var nx = 0, ny = 0;
      if (len > 1e-6) { nx = Nx / len; ny = Ny / len; }

      var vi = base + i0 * F;
      verts[vi] = tmpX[i0];
      verts[vi + 1] = tmpY[i0];
      verts[vi + 2] = nx;
      verts[vi + 3] = ny;
    }
  }
}

/* ---- hit testing ----------------------------------------------------------- */

function hitTest(state, x, y) {
  var panels = state.panels;
  var order = state.order;
  for (var k = order.length - 1; k >= 0; k--) {
    var p = panels[order[k]];
    if (p.alpha < 0.05) continue;
    var dx = x - p.cx, dy = y - p.cy;
    var cosR = Math.cos(p.rot), sinR = Math.sin(p.rot);
    var lx = dx * cosR + dy * sinR;
    var ly = -dx * sinR + dy * cosR;
    if (Math.abs(lx) <= p.w * 0.5 && Math.abs(ly) <= p.h * 0.5) return p.index;
  }
  return -1;
}

/* ---- public API ------------------------------------------------------------ */

export function create(opts) {
  opts = opts || {};
  var width = opts.width || 1;
  var height = opts.height || 1;
  var mobile = width < MOBILE_WIDTH;
  var geo = allocGeometry(opts.tier || 2);

  var state = {
    panels: geo.panels,
    order: [],
    centre: 0,
    hover: -1,
    open: -1,
    press: -1,
    verts: geo.verts,
    _tmpX: geo.tmpX, _tmpY: geo.tmpY, _tmpZ: geo.tmpZ,
    dirtyStart: 0,
    dirtyEnd: geo.panels.length ? geo.panels[geo.panels.length - 1].vertStart + geo.panels[geo.panels.length - 1].vertCount : 0,
    vertsReallocated: true,
    lattice: geo.lattice,
    phase: 0,

    /* internal ------------------------------------------------------------ */
    _tier: opts.tier || 2,
    _reduced: !!opts.reduced,
    _pin: opts.rect || null,
    width: width,
    height: height,
    _mobile: mobile,
    _c: buildConsts(mobile, width, height),
    _time: 0,
    _openSpring: { value: 0, target: 0, v: 0 },
    _openFrozenT: 0,
    _q: { hasMove: false, moveX: 0, moveY: 0 },
    _disposed: false
  };

  settle(0, state);
  state.vertsReallocated = true;
  return state;
}

export function resize(w, h, state) {
  if (!state) return;
  state.width = w;
  state.height = h;
  state._mobile = w < MOBILE_WIDTH;
  state._c = buildConsts(state._mobile, w, h);

  if (state._pin && typeof state._pin.getBoundingClientRect === 'function') {
    try { state._rect = state._pin.getBoundingClientRect(); } catch (e) { /* detached during teardown */ }
  }

  if (state._tier != null) {
    var lat = latticeFor(state._tier);
    if (lat !== state.lattice) {
      var geo = allocGeometry(state._tier);
      state.panels = geo.panels;
      state.verts = geo.verts;
      state._tmpX = geo.tmpX; state._tmpY = geo.tmpY; state._tmpZ = geo.tmpZ;
      state.lattice = geo.lattice;
      state.vertsReallocated = true;
    }
  }
}

export function update(dt, p, state) {
  if (!state) return;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;

  state._time += dt;
  state.phase = p;

  var q = state._q;
  var press = state.press;

  /* apply queued drag impulse, exactly once, here */
  if (press >= 0 && q.hasMove) {
    var pp = state.panels[press];
    var R = SPRING.rail.maxFrac * state.height;
    var rawDX = q.moveX - pp._dragStartX;
    var rawDY = q.moveY - pp._dragStartY;
    pp._railX.value = tanhClamp(pp._dragBaseX + rawDX, R);
    pp._railY.value = tanhClamp(pp._dragBaseY + rawDY, R);
    pp._railX.target = 0; pp._railY.target = 0;
    pp._railX.v = 0; pp._railY.v = 0;

    var rotR = SPRING.rot.max;
    pp._rot.value = tanhClamp(rawDX / (R || 1), 1) * rotR;
    pp._rot.target = 0; pp._rot.v = 0;
  }
  q.hasMove = false;

  /* open/close scalar spring */
  integrateSpring(state._openSpring, dt, SPRING.rail.k, SPRING.rail.c);
  if (state.open >= 0 && state._openSpring.value <= PARK && state._openSpring.target === 0) {
    state.open = -1;
  }

  var c = state._c;
  var vw = state.width, vh = state.height;
  var pose = { ox: 0, oy: 0, s: 1, rot: 0, z: 0 };
  var order = [];
  var minV = Infinity, maxV = -Infinity;
  var nearestCentreIdx = 0, nearestCentreAbsT = Infinity;

  for (var i = 0; i < COUNT; i++) {
    var panel = state.panels[i];
    var t = p * SPAN - i - BAND;

    var isOpenPanel = state.open === i;
    var tEff = t;
    if (isOpenPanel) {
      tEff = lerp(state._openFrozenT, 0, state._openSpring.value);
    }
    panel.t = tEff;

    poseFromT(tEff, c, pose);

    var baseAlpha = alphaFromT(tEff, c.drawBand);
    var alpha = baseAlpha;
    if (state.open >= 0 && !isOpenPanel) {
      alpha = lerp(baseAlpha, 0.25, state._openSpring.value);
    } else if (isOpenPanel) {
      alpha = lerp(baseAlpha, 1, state._openSpring.value);
    }

    var live = Math.abs(tEff) <= LIVE_T;
    if (live && !panel._dragging) {
      integrateSpring(panel._railX, dt, SPRING.rail.k, SPRING.rail.c);
      integrateSpring(panel._railY, dt, SPRING.rail.k, SPRING.rail.c);
      integrateSpring(panel._rot, dt, SPRING.rot.k, SPRING.rot.c);
    } else if (!live) {
      panel._railX.value = 0; panel._railX.v = 0; panel._railX.target = 0;
      panel._railY.value = 0; panel._railY.v = 0; panel._railY.target = 0;
      panel._rot.value = 0; panel._rot.v = 0; panel._rot.target = 0;
    }

    /* the lattice wobble: a press/drag dimples the surface, a release lets
       it spring back — this is the ONLY thing that runs on SPRING.lattice
       and it lives in the mesh, never on the panel's rigid transform. */
    panel._wobble.target = panel._dragging ? 1 : 0;
    if (live) {
      integrateSpring(panel._wobble, dt, SPRING.lattice.k, SPRING.lattice.c);
    } else {
      panel._wobble.value = 0; panel._wobble.v = 0; panel._wobble.target = 0;
    }

    /* idle life: breathing + slow drift, geometry only, never intensity */
    var breath = Math.sin(state._time * 0.6 + panel._breathPhase);
    var breathScale = 1 + breath * 0.01;
    var driftPhi = state._time * 0.05;

    var s = pose.s * breathScale;
    var h = c.heroF * vh * s;
    var w = h * ASPECT;

    var driftOx = pose.ox;
    var driftOy = pose.oy;
    if (Math.abs(tEff) > 1e-6) {
      var r = c.Rmax * Math.abs(tEff);
      var basePhi = c.phi0 + tEff * c.PHI;
      driftOx = -c.Ax * tEff + r * Math.cos(basePhi + driftPhi);
      driftOy = c.Ay * tEff + r * Math.sin(basePhi + driftPhi);
    }

    panel.cx = vw * 0.5 + driftOx + panel._railX.value + breath * 1.5;
    panel.cy = vh * 0.5 + driftOy + panel._railY.value + breath * 1.2;
    panel.w = w;
    panel.h = h;
    panel.rot = pose.rot + panel._rot.value + breath * 0.01;
    panel.z = pose.z;
    panel.alpha = alpha;

    panel._pressGlow *= Math.exp(-dt / 0.25);
    var baseIntensity = 1 - pose.z;
    panel.intensity = clamp(baseIntensity + panel._pressGlow * 0.5, 0, 1);

    if (state.hover === i && panel._rippleT < 999) panel._rippleT += dt;

    fillPanelVerts(state, panel, state.lattice);

    var touched = alpha > 0.001 || panel._prevAlpha > 0.001;
    if (touched) {
      if (panel.vertStart < minV) minV = panel.vertStart;
      var end = panel.vertStart + panel.vertCount;
      if (end > maxV) maxV = end;
    }
    panel._prevAlpha = alpha;

    if (Math.abs(tEff) <= c.drawBand) {
      order.push(i);
    }
    if (Math.abs(tEff) < nearestCentreAbsT) { nearestCentreAbsT = Math.abs(tEff); nearestCentreIdx = i; }
  }

  order.sort(function (a, b) { return state.panels[b].z - state.panels[a].z; });
  state.order = order;
  state.centre = nearestCentreIdx;

  if (minV === Infinity) { state.dirtyStart = 0; state.dirtyEnd = 0; }
  else { state.dirtyStart = minV; state.dirtyEnd = maxV; }
}

export function pointerMove(x, y, state) {
  if (!state) return;
  state.hover = hitTest(state, x, y);
  if (state.hover >= 0) {
    var p = state.panels[state.hover];
    var cosR = Math.cos(p.rot), sinR = Math.sin(p.rot);
    var dx = x - p.cx, dy = y - p.cy;
    p._rippleAnchorX = dx * cosR + dy * sinR;
    p._rippleAnchorY = -dx * sinR + dy * cosR;
    p._rippleT = 0;
  }
  if (state.press >= 0) {
    state._q.hasMove = true;
    state._q.moveX = x;
    state._q.moveY = y;
    state.panels[state.press]._dragging = true;
  }
}

export function pointerDown(x, y, state) {
  if (!state) return;
  var i = hitTest(state, x, y);
  state.press = i;
  if (i >= 0) {
    var p = state.panels[i];
    p._dragging = true;
    p._dragStartX = x;
    p._dragStartY = y;
    p._dragBaseX = p._railX.value;
    p._dragBaseY = p._railY.value;
    p._pressGlow = 1;

    var cosR = Math.cos(p.rot), sinR = Math.sin(p.rot);
    var dx = x - p.cx, dy = y - p.cy;
    p._wobbleAnchorX = dx * cosR + dy * sinR;
    p._wobbleAnchorY = -dx * sinR + dy * cosR;
  }
}

export function pointerUp(x, y, vx, vy, state) {
  if (!state) return;
  var i = state.press;
  if (i >= 0) {
    var p = state.panels[i];
    p._dragging = false;
    var R = SPRING.rail.maxFrac * state.height;
    var maxV = FLICK_MAX * R;
    p._railX.v = clamp(vx, -maxV, maxV);
    p._railY.v = clamp(vy, -maxV, maxV);
    p._railX.target = 0; p._railY.target = 0;
    p._rot.target = 0;
  }
  state.press = -1;
}

export function pointerLeave(state) {
  if (!state) return;
  state.hover = -1;
  var i = state.press;
  if (i >= 0) {
    var p = state.panels[i];
    p._dragging = false;
    p._railX.target = 0; p._railY.target = 0; p._rot.target = 0;
  }
  state.press = -1;
}

export function open(index, state) {
  if (!state) return;
  if (index < 0 || index >= COUNT) return;
  state.open = index;
  state._openFrozenT = state.panels[index].t;
  state._openSpring.target = 1;
}

export function close(state) {
  if (!state) return;
  state._openSpring.target = 0;
}

export function settle(p, state) {
  if (!state) return;
  var c = state._c;
  var vw = state.width, vh = state.height;
  var pose = { ox: 0, oy: 0, s: 1, rot: 0, z: 0 };
  var order = [];
  var minV = Infinity, maxV = -Infinity;
  var nearestCentreIdx = 0, nearestCentreAbsT = Infinity;

  for (var i = 0; i < COUNT; i++) {
    var panel = state.panels[i];
    var t = p * SPAN - i - BAND;
    var isOpenPanel = state.open === i;
    var tEff = isOpenPanel ? 0 : t;
    panel.t = tEff;

    poseFromT(tEff, c, pose);
    var baseAlpha = alphaFromT(tEff, c.drawBand);
    var alpha = baseAlpha;
    if (state.open >= 0 && !isOpenPanel) alpha = 0.25;
    else if (isOpenPanel) alpha = 1;

    var h = c.heroF * vh * pose.s;
    var w = h * ASPECT;

    panel.cx = vw * 0.5 + pose.ox;
    panel.cy = vh * 0.5 + pose.oy;
    panel.w = w;
    panel.h = h;
    panel.rot = pose.rot;
    panel.z = pose.z;
    panel.alpha = alpha;
    panel.intensity = clamp(1 - pose.z, 0, 1);

    panel._railX.value = 0; panel._railX.v = 0; panel._railX.target = 0;
    panel._railY.value = 0; panel._railY.v = 0; panel._railY.target = 0;
    panel._rot.value = 0; panel._rot.v = 0; panel._rot.target = 0;
    panel._wobble.value = 0; panel._wobble.v = 0; panel._wobble.target = 0;
    panel._pressGlow = 0;
    panel._rippleT = 999;

    fillPanelVerts(state, panel, state.lattice);

    minV = Math.min(minV, panel.vertStart);
    maxV = Math.max(maxV, panel.vertStart + panel.vertCount);
    panel._prevAlpha = alpha;

    if (Math.abs(tEff) <= c.drawBand) order.push(i);
    if (Math.abs(tEff) < nearestCentreAbsT) { nearestCentreAbsT = Math.abs(tEff); nearestCentreIdx = i; }
  }

  order.sort(function (a, b) { return state.panels[b].z - state.panels[a].z; });
  state.order = order;
  state.centre = nearestCentreIdx;
  state.phase = p;
  state.dirtyStart = minV === Infinity ? 0 : minV;
  state.dirtyEnd = maxV === -Infinity ? 0 : maxV;
}

export function dispose(state) {
  if (!state) return;
  state._disposed = true;
  state.hover = -1;
  state.press = -1;
  state._q.hasMove = false;
  /* PHYSICS owns no GPU or DOM resources — nothing else to release. state
     itself is left intact and mutable; the act drops its own reference. */
}
