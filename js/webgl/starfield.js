/* ============================================================
   webgl/starfield.js — the signature Deep-Space Constellation.
   GPU-instanced star points (3D fly-through, parallax, twinkle) over
   a domain-warped fbm nebula. A subset of stars assembles the "N".
   Returns false if WebGL2 is unavailable so callers can fall back.
   ============================================================ */
import { getGL, createProgram, locations, buffer } from "./gl.js";
import {
  NEBULA_VERT,
  NEBULA_FRAG,
  STAR_VERT,
  STAR_FRAG,
} from "./shaders.js";
import { pointer } from "../core/pointer.js";
import { loop } from "../core/loop.js";
import { DPR, clamp, rand, safe } from "../core/util.js";

/* Sample the letter "N" → array of NDC points used as star targets. */
function sampleGlyphTargets(count) {
  const S = 220;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.font = `900 ${S * 0.92}px Inter, system-ui, sans-serif`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("N", S / 2, S / 2 + S * 0.04);
  let data;
  try {
    data = x.getImageData(0, 0, S, S).data;
  } catch (e) {
    return null;
  }
  const hits = [];
  for (let py = 0; py < S; py += 3) {
    for (let px = 0; px < S; px += 3) {
      if (data[(py * S + px) * 4 + 3] > 128) {
        // → NDC, scaled so the N occupies ~the central third
        const nx = ((px / S) * 2 - 1) * 0.42;
        const ny = (1 - (py / S) * 2) * 0.42;
        hits.push([nx, ny]);
      }
    }
  }
  if (!hits.length) return null;
  // Resample to exactly `count` targets (cycle if fewer hits).
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const h = hits[(Math.random() * hits.length) | 0] || hits[i % hits.length];
    out[i * 2] = h[0];
    out[i * 2 + 1] = h[1];
  }
  return out;
}

export function initStarfield(canvas) {
  const gl = getGL(canvas);
  if (!gl) return false;

  const nebulaProg = createProgram(gl, NEBULA_VERT, NEBULA_FRAG);
  const starProg = createProgram(gl, STAR_VERT, STAR_FRAG);
  if (!nebulaProg || !starProg) return false;

  // Star count scales with the quality tier.
  const TIER_COUNTS = { 2: 2400, 1: 1300, 0: 650 };
  let count = TIER_COUNTS[loop.tier] ?? 1300;
  const nCount = Math.floor(count * 0.42); // share that forms the N

  // Build static star attributes.
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const isN = new Float32Array(count);
  const targets = sampleGlyphTargets(nCount) || new Float32Array(nCount * 2);
  const aTarget = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(-1.4, 1.4);
    pos[i * 3 + 1] = rand(-1.4, 1.4);
    pos[i * 3 + 2] = rand(0.05, 1.0); // depth
    size[i] = rand(1.2, 4.5);
    seed[i] = Math.random();
    if (i < nCount) {
      isN[i] = 1;
      aTarget[i * 2] = safe(targets[i * 2]);
      aTarget[i * 2 + 1] = safe(targets[i * 2 + 1]);
    }
  }

  const posBuf = buffer(gl, pos);
  const sizeBuf = buffer(gl, size);
  const seedBuf = buffer(gl, seed);
  const isNBuf = buffer(gl, isN);
  const tgtBuf = buffer(gl, aTarget);

  const starLoc = locations(
    gl,
    starProg,
    ["uTime", "uScroll", "uMouse", "uNForm", "uDpr", "uAspect"],
    ["aPos", "aSize", "aSeed", "aIsN", "aTarget"]
  );
  const nebLoc = locations(
    gl,
    nebulaProg,
    ["uTime", "uMouse", "uRes", "uScroll", "uTier"],
    []
  );

  function bindAttr(buf, loc, n) {
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
  }

  let W = 0,
    H = 0,
    aspect = 1;
  function resize() {
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    aspect = W / Math.max(H, 1);
    gl.viewport(0, 0, W, H);
  }
  resize();
  window.addEventListener("resize", resize);

  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0.039, 0.039, 0.043, 1); // matches --bg #0a0a0a

  let t = 0;
  // Smoothed mouse for the shader (avoids jitter).
  let mx = 0,
    my = 0;

  function render(dt) {
    t += dt;
    mx += (pointer.nx - mx) * 0.05;
    my += (-pointer.ny - my) * 0.05;

    // N assembles at the top of the page, disperses as you scroll.
    const hero = document.querySelector(".hero");
    const heroH = hero ? hero.offsetHeight : window.innerHeight;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const nForm = clamp(1 - scrollY / (heroH * 0.55), 0, 1);
    const scrollProg = clamp(
      scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1),
      0,
      1
    );

    gl.clear(gl.COLOR_BUFFER_BIT);

    // 1) Nebula backdrop (opaque).
    gl.disable(gl.BLEND);
    gl.useProgram(nebulaProg);
    gl.uniform1f(nebLoc.u.uTime, t);
    gl.uniform2f(nebLoc.u.uMouse, mx, my);
    gl.uniform2f(nebLoc.u.uRes, W, H);
    gl.uniform1f(nebLoc.u.uScroll, scrollProg);
    gl.uniform1f(nebLoc.u.uTier, loop.tier);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) Stars (additive glow).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(starProg);
    gl.uniform1f(starLoc.u.uTime, t);
    gl.uniform1f(starLoc.u.uScroll, scrollProg);
    gl.uniform2f(starLoc.u.uMouse, mx, my);
    gl.uniform1f(starLoc.u.uNForm, nForm);
    gl.uniform1f(starLoc.u.uDpr, DPR);
    gl.uniform1f(starLoc.u.uAspect, aspect);
    bindAttr(posBuf, starLoc.a.aPos, 3);
    bindAttr(sizeBuf, starLoc.a.aSize, 1);
    bindAttr(seedBuf, starLoc.a.aSeed, 1);
    bindAttr(isNBuf, starLoc.a.aIsN, 1);
    bindAttr(tgtBuf, starLoc.a.aTarget, 2);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  // Context loss → let the page fall back gracefully.
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    loop.remove(render);
    canvas.classList.add("is-gl-lost");
  });

  loop.add(render);
  canvas.classList.add("is-gl-active");
  return true;
}
