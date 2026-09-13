/* mascot.js — CHARACTER for the Offerings Procession. A small articulated
 * arm, solved every frame, drawn with no art files at all.
 *
 * The whole point is that it must read as a rig being solved, not a sprite
 * being played back — so the split below is load-bearing, not tidiness:
 *
 *   update()  CPU only. Reads the WallState, springs a handful of 2D targets,
 *             solves an analytic two-bone IK, writes the result into
 *             mascot.pose. Not one gl.* call.
 *   draw()    GL only. Uploads the arm's own bounding quad (recomputed every
 *             frame, 6 verts) and six uniforms — the joints — and lets the
 *             fragment shader in mascot-shaders.js evaluate the rig as SDFs.
 *
 * Anchored lower-left, per the brief: the panels arrive from the lower right,
 * so the rig's own idle reach sweeps up and away from that lane rather than
 * camping in it.
 *
 * Rig: base (a fixed plate) -> upper bone -> elbow -> fore bone -> wrist,
 * plus a lens head that sits a fixed stub beyond the wrist and carries its
 * own, softer spring so it lags the body and settles rather than snapping.
 * The two bones are solved with the closed-form cosine-rule IK below — two
 * bones is exact and free in closed form, so there is no iterative solver to
 * write or to have converge badly.
 *
 * WallState (state.hover / state.open / state.centre / state.panels[i].cx/cy)
 * is read directly, every frame, for hover/open/idle-focus — see the note by
 * bindPointer() in js/acts/offerings.js: onPanelHover only fires on ENTER, so
 * a hook-only implementation would have no way to notice a hover ending. The
 * WallState is the single source of truth for anything that has a resting
 * state; on() exists only for the one truly momentary event, the throw, which
 * has no WallState field of its own.
 */
import * as GLSL from '../gl/mascot-shaders.js';

/* --- tuning ---------------------------------------------------------------- */

var ARM_HEIGHT_FRAC = 0.30;   // of viewport height — the RIG's own unit; the
                               // reach ratios below turn this into an on-screen
                               // presence of about 18-22% vh at rest (see
                               // resize() for why the two numbers differ:
                               // idle never sits at full extension).
var REST_ANGLE = -1.05;       // radians; up and to the right from the anchor,
                               // away from the lower-right arrival lane
var ANCHOR_MARGIN = 0.09;     // fraction of viewport w/h — keeps the base
                               // plate fully inboard of both edges, at every
                               // viewport size, rather than a fixed px offset
var FIXED = 1 / 120;          // same fixed-timestep idiom as js/motion.js

/* --- small local spring integrator -----------------------------------------
 * Copied in shape from js/motion.js (semi-implicit Euler, sub-stepped at a
 * fixed 120Hz, parked below 4e-4) rather than imported: motion.js's springs
 * are a single global keyed map meant for cursor/DOM properties, and this rig
 * needs several independent 2D springs of its own that must not collide with
 * that keyspace or be steppable by anything but this module's own update(). */

function makeSpring(k, c) { return { value: 0, v: 0, target: 0, k: k, c: c }; }
function makeSpring2(k, c) { return { x: makeSpring(k, c), y: makeSpring(k, c) }; }

function integrate(s, dt) {
  var n = Math.min(6, Math.max(1, Math.ceil(dt / FIXED)));
  var h = dt / n;
  for (var i = 0; i < n; i++) {
    var f = -s.k * (s.value - s.target) - s.c * s.v;
    s.v += f * h;
    s.value += s.v * h;
  }
  if (Math.abs(s.v) < 4e-4 && Math.abs(s.value - s.target) < 4e-4) {
    s.value = s.target; s.v = 0;
  }
}
function integrate2(s2, dt) { integrate(s2.x, dt); integrate(s2.y, dt); }

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* --- analytic two-bone IK ---------------------------------------------------
 * Cosine rule for the elbow: exact, closed-form, no iteration. `bend` is +1 or
 * -1 and picks which side of the base->target line the elbow sits on — fixed
 * at -1 throughout so the arm reads as one consistent mechanical joint rather
 * than flipping elbows when the target crosses behind the base. */
function solveIK(bx, by, tx, ty, l1, l2, bend) {
  var dx = tx - bx, dy = ty - by;
  var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
  var maxD = l1 + l2 - 0.001;
  var minD = Math.abs(l1 - l2) + 0.001;
  var dc = clamp(d, minD, maxD);
  var baseAngle = Math.atan2(dy, dx);
  var cosA = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1);
  var a = Math.acos(cosA);
  var elbowAngle = baseAngle + bend * a;
  var ex = bx + Math.cos(elbowAngle) * l1;
  var ey = by + Math.sin(elbowAngle) * l1;
  var wristAngle = Math.atan2(ty - ey, tx - ex);
  var wx = ex + Math.cos(wristAngle) * l2;
  var wy = ey + Math.sin(wristAngle) * l2;
  return { ex: ex, ey: ey, wx: wx, wy: wy };
}

/* --- the throw: the one moment this thing gets real force in it ------------
 * A hand-authored radial curve rather than a spring impulse, because a throw
 * needs a shape (brace back, then recoil hard, then ring down) that a single
 * spring cannot produce on its own, and the brief is explicit that it must be
 * over in under a second. Returns a signed multiplier applied along the
 * current reach direction, plus how bright the lens should be while it runs. */
var THROW_BRACE = 0.08, THROW_RECOIL = 0.20, THROW_RECOVER = 0.52;
var THROW_TOTAL = THROW_BRACE + THROW_RECOIL + THROW_RECOVER; // 0.80s, < 1s

function throwCurve(t) {
  if (t < THROW_BRACE) {
    var p0 = t / THROW_BRACE;
    return { k: -0.5 * (p0 * p0), attn: 1.0, done: false };
  }
  if (t < THROW_BRACE + THROW_RECOIL) {
    var p1 = (t - THROW_BRACE) / THROW_RECOIL;
    // overshoots past 1.0 then settles toward it — "recoils" reads as a snap
    var over = 1.0 + (1.0 - p1) * 0.6;
    var eased = 1.0 - Math.pow(1.0 - p1, 3.0);
    return { k: lerp(-0.5, over, eased), attn: 1.0, done: false };
  }
  if (t < THROW_TOTAL) {
    var p2 = (t - THROW_BRACE - THROW_RECOIL) / THROW_RECOVER;
    var decay = Math.exp(-p2 * 4.5);
    var osc = Math.cos(p2 * Math.PI * 2.2);
    return { k: osc * decay, attn: lerp(1.0, 0.4, p2), done: false };
  }
  return { k: 0, attn: 0, done: true };
}

/* --- uniform/attrib lookup, house pattern from wall.js ---------------------- */
function locs(gl, prog, names) {
  var o = {};
  for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(prog, names[i]);
  return o;
}

/* --- GL: upload the arm's own bounding quad, 6 verts, every frame ---------- */
function uploadQuad(gl, mascot) {
  var b = mascot.bbox, v = mascot.verts;
  v[0] = b.x0; v[1] = b.y0;
  v[2] = b.x1; v[3] = b.y0;
  v[4] = b.x0; v[5] = b.y1;
  v[6] = b.x0; v[7] = b.y1;
  v[8] = b.x1; v[9] = b.y0;
  v[10] = b.x1; v[11] = b.y1;
  gl.bindBuffer(gl.ARRAY_BUFFER, mascot.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
}

function drawInternal(mascot, alpha, ctx) {
  var gl = ctx.gl;
  uploadQuad(gl, mascot);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.blendEquation(gl.FUNC_ADD);

  gl.useProgram(mascot.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, mascot.vbo);
  gl.enableVertexAttribArray(0); // a_pos, pinned by the Stage
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  var u = mascot.u, p = mascot.pose;
  gl.uniform2f(u.u_viewport, mascot.w || 1, mascot.h || 1);
  gl.uniform2f(u.u_base, p.baseX, p.baseY);
  gl.uniform2f(u.u_elbow, p.elbowX, p.elbowY);
  gl.uniform2f(u.u_wrist, p.wristX, p.wristY);
  gl.uniform2f(u.u_head, p.headX, p.headY);
  gl.uniform1f(u.u_plateR, p.plateR);
  gl.uniform1f(u.u_upperR, p.upperR);
  gl.uniform1f(u.u_foreR, p.foreR);
  gl.uniform1f(u.u_headR, p.headR);
  gl.uniform1f(u.u_attention, p.attention);
  gl.uniform1f(u.u_alpha, alpha);
  gl.uniform1f(u.u_tier, ctx.tier || 1);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  /* Attribute 0 is left enabled/bound, same convention as wall.js's
     bindQuadAttrib — nothing in the Stage's GL baseline concerns vertex
     attribute state, and the next consumer of attribute 0 re-binds it
     before use. */
}

/* Composes mascot.pose directly (no springs, no time) for a single settled
 * frame. Used by drawStill() and to seed a sane first pose in resize(). */
function settlePose(mascot, lookX, lookY, leanBias, attention) {
  var bx = mascot.baseX + leanBias * mascot.armScale * 0.05;
  var by = mascot.baseY;
  var restReach = (mascot.L1 + mascot.L2) * 0.58;
  var tx = bx + Math.cos(REST_ANGLE) * restReach;
  var ty = by + Math.sin(REST_ANGLE) * restReach;
  var ik = solveIK(bx, by, tx, ty, mascot.L1, mascot.L2, -1);

  var hdx = lookX - ik.wx, hdy = lookY - ik.wy;
  var headAngle = Math.atan2(hdy, hdx);
  var headX = ik.wx + Math.cos(headAngle) * mascot.headStub;
  var headY = ik.wy + Math.sin(headAngle) * mascot.headStub;

  writePose(mascot, bx, by, ik.ex, ik.ey, ik.wx, ik.wy, headX, headY, attention);
}

function writePose(mascot, bx, by, ex, ey, wx, wy, hx, hy, attention) {
  var pose = mascot.pose;
  pose.baseX = bx; pose.baseY = by;
  pose.elbowX = ex; pose.elbowY = ey;
  pose.wristX = wx; pose.wristY = wy;
  pose.headX = hx; pose.headY = hy;
  pose.plateR = mascot.plateR; pose.upperR = mascot.upperR;
  pose.foreR = mascot.foreR; pose.headR = mascot.headR;
  pose.attention = attention;

  /* Fixed, not proportional to headR: the only things the shader spills
     beyond the raw joint-to-joint envelope are the AA edge (~1.25px) and the
     fake-bevel rim width (~9px), both constants in mascot-shaders.js. Padding
     by headR here used to nearly double the shaded box for no visual gain —
     most of it was empty backdrop the fragment shader still had to evaluate
     and discard. */
  var pad = 18;
  var xs0 = Math.min(bx, ex, wx, hx) - pad, xs1 = Math.max(bx, ex, wx, hx) + pad;
  var ys0 = Math.min(by, ey, wy, hy) - pad, ys1 = Math.max(by, ey, wy, hy) + pad;
  mascot.bbox.x0 = xs0; mascot.bbox.y0 = ys0;
  mascot.bbox.x1 = xs1; mascot.bbox.y1 = ys1;
}

// --- exports -----------------------------------------------------------------

export function create(ctx) {
  var gl = ctx.gl;
  var prog = ctx.program(GLSL.MASCOT_VERT, GLSL.MASCOT_FRAG, 'mascot');

  var mascot = {
    prog: prog,
    u: locs(gl, prog, [
      'u_viewport', 'u_base', 'u_elbow', 'u_wrist', 'u_head',
      'u_plateR', 'u_upperR', 'u_foreR', 'u_headR', 'u_attention', 'u_alpha', 'u_tier'
    ]),
    vbo: ctx.buffer(),
    verts: new Float32Array(12),

    w: 0, h: 0, dpr: 1,
    baseX: 0, baseY: 0, armScale: 100,
    L1: 0, L2: 0, headStub: 0,
    plateR: 0, upperR: 0, foreR: 0, headR: 0,

    // reach target the IK solves for, and the head's own softer look target
    reach: makeSpring2(46, 9),
    lean: makeSpring(30, 9),
    headLook: makeSpring2(20, 7),   // softer + laggier than the body, on purpose
    attention: makeSpring(24, 8),

    mode: 'idle',
    activeIndex: -1,
    held: false,
    time: Math.random() * 1000, // desynchronise multiple sessions' idle sway

    throwT: -1,

    pose: {
      baseX: 0, baseY: 0, elbowX: 0, elbowY: 0, wristX: 0, wristY: 0,
      headX: 0, headY: 0, plateR: 0, upperR: 0, foreR: 0, headR: 0, attention: 0
    },
    bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },

    _inited: false
  };

  return mascot;
}

export function resize(mascot, w, h, dpr) {
  if (!mascot) return;
  mascot.w = w; mascot.h = h; mascot.dpr = dpr;
  mascot.armScale = h * ARM_HEIGHT_FRAC;
  mascot.baseX = w * ANCHOR_MARGIN;
  mascot.baseY = h * (1 - ANCHOR_MARGIN);
  /* Length grows faster than thickness here on purpose: three slender bones
     read as a shoulder/elbow/wrist reaching, where the earlier, stubbier
     ratios read as a bracket hinging. Radii are 9-12% of their own segment's
     length, not of armScale, so the taper toward the wrist survives any
     future retune of armScale itself. */
  mascot.L1 = mascot.armScale * 0.50;
  mascot.L2 = mascot.armScale * 0.44;
  mascot.headStub = mascot.armScale * 0.30;
  mascot.plateR = mascot.armScale * 0.075;
  mascot.upperR = mascot.L1 * 0.105;
  mascot.foreR = mascot.L2 * 0.092;
  mascot.headR = mascot.armScale * 0.115;

  var restReach = (mascot.L1 + mascot.L2) * 0.56;
  var rx = mascot.baseX + Math.cos(REST_ANGLE) * restReach;
  var ry = mascot.baseY + Math.sin(REST_ANGLE) * restReach;

  if (!mascot._inited) {
    /* Seed every spring at its resting value so the very first frame is
       already the rest pose, not a snap-in from (0,0). */
    mascot.reach.x.value = mascot.reach.x.target = rx;
    mascot.reach.y.value = mascot.reach.y.target = ry;
    mascot.headLook.x.value = mascot.headLook.x.target = w * 0.52;
    mascot.headLook.y.value = mascot.headLook.y.target = h * 0.42;
    mascot.attention.value = mascot.attention.target = 0.3;
    mascot._inited = true;
  }
  settlePose(mascot, mascot.headLook.x.value, mascot.headLook.y.value, mascot.lean.value, mascot.attention.value);
}

/* CPU only — not one gl.* call. */
export function update(mascot, dt, state) {
  if (!mascot || !state) return;
  if (dt > 0.1) dt = 0.1; // a backgrounded tab must not explode the springs
  mascot.time += dt;

  var openIdx = state.open;
  var hoverIdx = state.hover;
  var centreIdx = state.centre;
  var panels = state.panels;

  var held = openIdx >= 0 && panels[openIdx];
  var hovering = !held && hoverIdx >= 0 && panels[hoverIdx];
  var centrePanel = panels[centreIdx] || null;

  var tx, ty, lookX, lookY, leanGoal, attentionGoal;

  if (held) {
    var op = panels[openIdx];
    var dxo = op.cx - mascot.baseX, dyo = op.cy - mascot.baseY;
    var dlo = Math.sqrt(dxo * dxo + dyo * dyo) || 1;
    var retractReach = (mascot.L1 + mascot.L2) * 0.38;
    tx = mascot.baseX + (dxo / dlo) * retractReach;
    ty = mascot.baseY + (dyo / dlo) * retractReach;
    lookX = op.cx; lookY = op.cy;
    leanGoal = clamp((op.cx - mascot.baseX) / Math.max(1, mascot.w), -1, 1) * 0.5;
    attentionGoal = 0.9;
    mascot.mode = 'open';
    mascot.activeIndex = openIdx;
  } else if (hovering) {
    var hp = panels[hoverIdx];
    var dxh = hp.cx - mascot.baseX, dyh = hp.cy - mascot.baseY;
    var dlh = Math.sqrt(dxh * dxh + dyh * dyh) || 1;
    var maxReach = (mascot.L1 + mascot.L2) * 0.94;
    var reachLen = Math.min(dlh, maxReach);
    tx = mascot.baseX + (dxh / dlh) * reachLen;
    ty = mascot.baseY + (dyh / dlh) * reachLen;
    lookX = hp.cx; lookY = hp.cy;
    leanGoal = clamp((hp.cx - mascot.baseX) / Math.max(1, mascot.w), -1, 1);
    attentionGoal = 1.0;
    mascot.mode = 'hover';
    mascot.activeIndex = hoverIdx;
  } else {
    /* Idle: slow sway that never stops, the head tracking the centre panel
       (onPanelFocus has no persistent WallState flag of its own beyond
       state.centre, so reading it here every frame both drives idle look-at
       AND is how a focus change turns the head — no separate code path
       needed), and a lean that biases toward whichever side of the anchor
       the centre panel currently sits on ("shifts weight toward it"). */
    var sway = Math.sin(mascot.time * 0.37) * 0.16 + Math.sin(mascot.time * 0.13 + 1.7) * 0.06;
    var breathe = 0.56 + Math.sin(mascot.time * 0.22) * 0.05;
    var ang = REST_ANGLE + sway;
    var reach0 = (mascot.L1 + mascot.L2) * breathe;
    tx = mascot.baseX + Math.cos(ang) * reach0;
    ty = mascot.baseY + Math.sin(ang) * reach0;
    if (centrePanel) { lookX = centrePanel.cx; lookY = centrePanel.cy; }
    else { lookX = mascot.headLook.x.target; lookY = mascot.headLook.y.target; }
    var centreBias = centrePanel ? clamp((centrePanel.cx - mascot.w * 0.5) / Math.max(1, mascot.w * 0.5), -1, 1) : 0;
    leanGoal = centreBias * 0.35 + Math.sin(mascot.time * 0.37) * 0.12;
    attentionGoal = 0.32;
    mascot.mode = 'idle';
    mascot.activeIndex = -1;
  }

  /* The throw: an additive radial kick along the current reach direction, on
     top of whatever the mode above already wants. Never its own mode — the
     body keeps whatever pose it was in and this rides on top of it, which is
     what makes it read as one thing flinching rather than a separate gesture. */
  if (mascot.throwT >= 0) {
    mascot.throwT += dt;
    var c = throwCurve(mascot.throwT);
    var kdx = tx - mascot.baseX, kdy = ty - mascot.baseY;
    var kdl = Math.sqrt(kdx * kdx + kdy * kdy) || 1;
    var kick = mascot.armScale * 0.22 * c.k;
    tx += (kdx / kdl) * kick;
    ty += (kdy / kdl) * kick;
    attentionGoal = Math.max(attentionGoal, c.attn);
    if (c.done) mascot.throwT = -1;
  }

  mascot.held = held;
  mascot.reach.x.target = tx; mascot.reach.y.target = ty;
  mascot.headLook.x.target = lookX; mascot.headLook.y.target = lookY;
  mascot.lean.target = leanGoal;
  mascot.attention.target = attentionGoal;

  integrate2(mascot.reach, dt);
  integrate2(mascot.headLook, dt);
  integrate(mascot.lean, dt);
  integrate(mascot.attention, dt);

  var bx = mascot.baseX + mascot.lean.value * mascot.armScale * 0.05;
  var by = mascot.baseY;
  var ik = solveIK(bx, by, mascot.reach.x.value, mascot.reach.y.value, mascot.L1, mascot.L2, -1);

  var hdx = mascot.headLook.x.value - ik.wx, hdy = mascot.headLook.y.value - ik.wy;
  var headAngle = Math.atan2(hdy, hdx);
  var headX = ik.wx + Math.cos(headAngle) * mascot.headStub;
  var headY = ik.wy + Math.sin(headAngle) * mascot.headStub;

  writePose(mascot, bx, by, ik.ex, ik.ey, ik.wx, ik.wy, headX, headY, mascot.attention.value);
}

export function draw(mascot, alpha, ctx) {
  if (!mascot) return;
  drawInternal(mascot, alpha, ctx);
}

/* Reduced motion. Signature carries no WallState (see the header comment on
 * the contract this file was handed), so the true centre-panel position that
 * PHYSICS computes is not reachable from here. Approximated instead at the
 * viewport point the hero panel occupies by construction (contract.js: HERO_H
 * centred, roughly mid-frame) — close enough that the rig still reads as
 * "looking at the panel that matters" without inventing a second channel of
 * state this department does not own. */
export function drawStill(mascot, ctx) {
  if (!mascot) return;
  settlePose(mascot, mascot.w * 0.52, mascot.h * 0.42, 0.12, 0.65);
  drawInternal(mascot, 1, ctx);
}

export function dispose(mascot) {
  /* prog and vbo came from ctx.program()/ctx.buffer(), which the Stage pools
     and reclaims itself — nothing to gl.delete* by hand, which is also what
     makes this safe to call on a lost context. create() builds a fresh
     mascot object from scratch, so calling it again after dispose() needs
     nothing special here. */
}

/* event: 'hover' | 'focus' | 'open' | 'throw', index: panel 0..11.
 *
 * hover/focus/open all have a live, self-correcting home in the WallState
 * (state.hover, state.centre, state.open) that update() reads every frame —
 * see the header comment on why a hook-only implementation of hover would
 * miss every hover-END. Wiring on() to also poke those directly here would
 * just be a second, racier source of truth for the same thing, so those three
 * are accepted but intentionally no-ops. throw is the one event with no
 * WallState field of its own — it is a moment, not a state — so it is the
 * only one that needs to land here. */
export function on(mascot, event, index) {
  if (!mascot) return;
  if (event === 'throw') {
    mascot.throwT = 0;
    mascot.activeIndex = index;
  }
}
