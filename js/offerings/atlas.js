/* js/offerings/atlas.js — MOTION: the loop atlas and its refresh scheduler.
 *
 * One RGBA8 target, 4 columns x 3 rows of TILE[tier] px tiles, GUTTER texels
 * of padding around each. Twelve fragment programs (js/gl/offering-loops.js)
 * paint into it, one tile viewport at a time, at a rate driven entirely by
 * how close each panel is to the centre of the helix — see REFRESH in
 * js/offerings/contract.js for the schedule this file implements.
 *
 * Compilation is lazy by contract: create() compiles only the shared vertex
 * shader and the cheap prime program, and primes every tile so no tile is
 * ever black. render() compiles at most one loop program per call, so a
 * fresh section takes twelve calls to reach full fidelity — never one frame
 * that stalls on 12 back-to-back LLVM-JIT compiles.
 *
 * Loop phase is per-panel VISIBLE time: `phase[i]` only advances by `dt` on
 * a frame where tile `i` is actually refreshed. A tile stopped for six
 * seconds must not resume six seconds further into its loop, which is
 * exactly what global-time phase would do.
 *
 * Budget reading: TILE_BUDGET[tier] caps the number of tile refreshes this
 * module performs per frame BEYOND the hero, which is always served. All
 * twelve tiles at a given tier share one TILE[tier] size, so at a fixed tier
 * "a fragment budget" and "a tile count" are the same number — the contract
 * phrases it as fragments only because that number must NOT be reused
 * unscaled across tiers (a tier-3 tile is ~6x the fragments of a tier-1
 * tile), and the values given already vary per tier for exactly that
 * reason. This file therefore treats TILE_BUDGET[tier] as "how many tile
 * refreshes, at this tier's own tile size, fit in a frame" — a plain count
 * once tier is fixed, which is what the numbers in contract.js resolve to.
 *
 * MOTION reads state.panels[i].t and .intensity only, and writes nothing to
 * WallState, per the contract.
 */
import * as C from './contract.js';
import { VERT, PRIME_FRAG, loopSource, COUNT } from '../gl/offering-loops.js';

/* 6-10s per the brief; the middle of that range reads as neither hurried
 * nor sluggish across all twelve, which is what "one family" needs. */
var LOOP_SECONDS = 8;

/* Weight per REFRESH band, derived from its own cadence: a band due every
 * Nth frame is "worth" 1/N of a hero-frame when it finally comes due, so a
 * far tile that has waited six frames competes on equal footing with a near
 * tile that has waited one. The hero band's weight is never consulted — the
 * hero is always served, unconditionally, ahead of this priority queue. */
var WEIGHT = C.REFRESH.map(function (b) { return b.everyN > 0 ? 1 / b.everyN : 0; });

function bandIndex(at) {
  for (var i = 0; i < C.REFRESH.length; i++) {
    if (at <= C.REFRESH[i].maxT) return i;
  }
  return -1; // beyond the visible band entirely — loop stopped
}

function compileNext(bank, ctx) {
  var i = bank.compiled;
  var gl = bank.gl;
  var prog = ctx.program(VERT, loopSource(i), 'loop' + i);
  bank.programs[i] = prog;
  bank.uT[i] = gl.getUniformLocation(prog, 'u_t');
  bank.uI[i] = gl.getUniformLocation(prog, 'u_intensity');
  bank.uRes[i] = gl.getUniformLocation(prog, 'u_res');
  bank.compiled++;
}

function cellOf(bank, index) {
  return { x: (index % 4) * bank.cell, y: ((index / 4) | 0) * bank.cell };
}

function primeAll(bank, ctx) {
  var gl = bank.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, bank.target.fbo);
  gl.bindBuffer(gl.ARRAY_BUFFER, bank.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(bank.primeProg);

  for (var i = 0; i < COUNT; i++) {
    var c = cellOf(bank, i);
    gl.viewport(c.x, c.y, bank.cell, bank.cell);
    gl.uniform1f(bank.uSeed, i);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  gl.disableVertexAttribArray(0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  ctx.restore();
}

/* Pass 1 of the schedule: classify every panel by |t| into a REFRESH band,
 * bump its "frames since last refresh" counter, and collect who is due.
 * The hero band (everyN === 1) is always due and is exempt from the budget
 * entirely. The prefetch band (everyN === 0) fires once on entry and then
 * goes idle until the panel leaves the visible band and re-enters. */
function selectJobs(bank, state, tier) {
  var heroJobs = [], candJobs = [], i;

  for (i = 0; i < COUNT; i++) {
    var panel = state.panels[i];
    if (!panel) continue;
    var at = Math.abs(panel.t);
    var bi = bandIndex(at);

    if (bi < 0) {
      bank.prefetched[i] = false; // re-arm: next entry gets one fresh prefetch
      continue;
    }

    var band = C.REFRESH[bi];
    if (band.everyN === 0) {
      if (!bank.prefetched[i]) candJobs.push({ i: i, pr: Infinity, prefetch: true });
      continue;
    }

    bank.framesSince[i]++;
    if (bank.framesSince[i] < band.everyN) continue;

    var pr = bank.framesSince[i] * WEIGHT[bi];
    if (bi === 0) heroJobs.push({ i: i, pr: pr, prefetch: false });
    else candJobs.push({ i: i, pr: pr, prefetch: false });
  }

  candJobs.sort(function (a, b) { return b.pr - a.pr; });
  var budget = C.TILE_BUDGET[tier] || C.TILE_BUDGET[1];
  var room = Math.max(0, budget - heroJobs.length);
  return heroJobs.concat(candJobs.slice(0, room));
}

function drawJob(bank, job, state, dt) {
  if (!bank.programs[job.i]) return; // program not compiled yet — stays primed
  var gl = bank.gl;
  var panel = state.panels[job.i];
  var c = cellOf(bank, job.i);

  bank.phase[job.i] = (bank.phase[job.i] + dt / LOOP_SECONDS) % 1.0;

  gl.viewport(c.x, c.y, bank.cell, bank.cell);
  gl.useProgram(bank.programs[job.i]);
  gl.uniform1f(bank.uT[job.i], bank.phase[job.i]);
  gl.uniform1f(bank.uI[job.i], panel.intensity);
  gl.uniform2f(bank.uRes[job.i], bank.tileSize, bank.tileSize);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  if (job.prefetch) bank.prefetched[job.i] = true;
  else bank.framesSince[job.i] = 0;
}

// --- exports ---------------------------------------------------------------

export function create(ctx) {
  var gl = ctx.gl;
  var tileSize = C.TILE[ctx.tier] || C.TILE[1];
  var cell = tileSize + C.GUTTER * 2;
  var atlasW = cell * 4, atlasH = cell * 3;
  var target = ctx.target(atlasW, atlasH);
  var primeProg = ctx.program(VERT, PRIME_FRAG, 'prime');

  var bank = {
    gl: gl,
    quad: ctx.quad,
    tileSize: tileSize,
    cell: cell,
    atlasW: atlasW,
    atlasH: atlasH,
    target: target,
    primeProg: primeProg,
    uSeed: gl.getUniformLocation(primeProg, 'u_seed'),
    programs: new Array(COUNT).fill(null),
    uT: new Array(COUNT).fill(null),
    uI: new Array(COUNT).fill(null),
    uRes: new Array(COUNT).fill(null),
    compiled: 0,
    phase: new Float32Array(COUNT),
    // Large so every tile is immediately "due" the first time it is seen.
    framesSince: new Array(COUNT).fill(1e6),
    prefetched: new Array(COUNT).fill(false)
  };

  primeAll(bank, ctx);
  return bank;
}

export function render(bank, state, dt, ctx) {
  if (!bank || !state) return;
  if (bank.compiled < COUNT) compileNext(bank, ctx);

  var jobs = selectJobs(bank, state, ctx.tier);
  if (!jobs.length) return;

  var gl = bank.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, bank.target.fbo);
  gl.bindBuffer(gl.ARRAY_BUFFER, bank.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  for (var k = 0; k < jobs.length; k++) drawJob(bank, jobs[k], state, dt);

  gl.disableVertexAttribArray(0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  ctx.restore();
}

/* Reduced motion: one full pass, every tile drawn once at a settled phase.
 * Not fps-gated (the fps gate always runs with ?motion=full — see
 * scripts/perf.mjs), so it is safe to finish compiling here rather than
 * defer further; a visitor in reduced motion sees exactly one composed
 * frame, ever, until the next resize. Phases are offset per tile so twelve
 * settled loops do not all read as the same frozen instant. */
export function renderStill(bank, state, ctx) {
  if (!bank) return;
  while (bank.compiled < COUNT) compileNext(bank, ctx);

  var gl = bank.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, bank.target.fbo);
  gl.bindBuffer(gl.ARRAY_BUFFER, bank.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  for (var i = 0; i < COUNT; i++) {
    if (!bank.programs[i]) continue;
    var panel = state && state.panels ? state.panels[i] : null;
    var c = cellOf(bank, i);
    var phase = (0.35 + i * 0.0833) % 1.0;

    gl.viewport(c.x, c.y, bank.cell, bank.cell);
    gl.useProgram(bank.programs[i]);
    gl.uniform1f(bank.uT[i], phase);
    gl.uniform1f(bank.uI[i], panel ? panel.intensity : 0.4);
    gl.uniform2f(bank.uRes[i], bank.tileSize, bank.tileSize);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  gl.disableVertexAttribArray(0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  ctx.restore();
}

export function tileRect(bank, index) {
  var c = cellOf(bank, index);
  var x0 = c.x + C.GUTTER, y0 = c.y + C.GUTTER;
  var size = bank.tileSize;
  return {
    u0: x0 / bank.atlasW,
    v0: y0 / bank.atlasH,
    u1: (x0 + size) / bank.atlasW,
    v1: (y0 + size) / bank.atlasH
  };
}

export function texture(bank) {
  return bank ? bank.target.tex : null;
}

/* Everything here came from ctx.program/ctx.target — the Stage's teardown()
 * deletes every one of them. Nothing in this bank was created with a raw
 * gl.* call, so there is nothing of our own to free. */
export function dispose(bank) {
  void bank;
}
