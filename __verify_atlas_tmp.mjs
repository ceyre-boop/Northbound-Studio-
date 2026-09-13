/* Direct-module verification for js/offerings/atlas.js + js/gl/offering-loops.js.
 * Builds a minimal stand-in for the Stage's ctx (per js/stage/stage.js's
 * documented contract) around a real WebGL context, then:
 *   1. drives render() across many synthetic frames to confirm all twelve
 *      loop programs eventually compile and zero console errors occur.
 *   2. reads back the atlas per frame to report cost.
 *   3. for each of the twelve loop sources, compiles it standalone into a
 *      1x1 target and renders u_t=0.999 vs u_t=0.0, asserting the seam.
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });

const result = await page.evaluate(async () => {
  const Motion = await import('/js/offerings/atlas.js');
  const Loops = await import('/js/gl/offering-loops.js');
  const GL = window.NB_GL;

  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 2048;
  const gl = canvas.getContext('webgl', { antialias: false }) || canvas.getContext('experimental-webgl');
  if (!gl) return { error: 'no webgl context available' };

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  var fboCount = 0;
  const ctx = {
    gl: gl,
    tier: 3,
    quad: quad,
    texUnitBase: 0,
    warn: function (m) { console.warn('[atlas-test] ' + m); },
    program: function (vert, frag, label) {
      return GL.buildProgram(gl, vert, frag, 'test:' + (label || 'p'), { a_pos: 0 });
    },
    target: function (w, h) {
      fboCount++;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo: fbo, tex: tex, width: w, height: h };
    },
    restore: function () {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  };

  const bank = Motion.create(ctx);

  // Synthetic WallState: panel 0 is the hero, others spread across the band.
  function makeState(centreIndex, tOffset) {
    const panels = [];
    for (let i = 0; i < 12; i++) {
      const t = (i - centreIndex) * 0.62 + (tOffset || 0);
      panels.push({ index: i, t: t, intensity: Math.max(0, 1 - Math.abs(t) / 2.5) });
    }
    return { panels: panels, centre: centreIndex, hover: -1, open: -1 };
  }

  // Drive 400 frames at 1/60s, walking the "centre" slowly across all 12
  // panels so every band (hero/near/far/prefetch) gets exercised for every
  // tile, same as a real scroll would.
  let frame = 0;
  for (let f = 0; f < 400; f++) {
    const centre = 5.5 + Math.sin(f * 0.02) * 6; // sweep back and forth
    const state = makeState(Math.round(centre), (f % 12) * 0.001);
    Motion.render(bank, state, 1 / 60, ctx);
    frame++;
  }

  const compiledCount = bank.programs.filter(Boolean).length;

  // Atlas cost per frame: one more render() call at "everything near/hero",
  // counted by pixels actually drawn (sum of viewport areas) this call.
  const centreState = makeState(0, 0);
  let drawnArea = 0;
  const origViewport = gl.viewport.bind(gl);
  gl.viewport = function (x, y, w, h) { drawnArea += w * h; origViewport(x, y, w, h); };
  Motion.render(bank, centreState, 1 / 60, ctx);
  gl.viewport = origViewport;

  // --- seam test: for each of the twelve loop sources, compile standalone
  // into a 1x1 target and compare u_t=0.999 vs u_t=0.0.
  const VERT = Loops.VERT;
  const seam = [];
  for (let i = 0; i < Loops.COUNT; i++) {
    const frag = Loops.loopSource(i);
    let prog;
    try {
      prog = GL.buildProgram(gl, VERT, frag, 'seam' + i, { a_pos: 0 });
    } catch (e) {
      seam.push({ i: i, ok: false, error: String(e) });
      continue;
    }
    const uT = gl.getUniformLocation(prog, 'u_t');
    const uI = gl.getUniformLocation(prog, 'u_intensity');
    const uRes = gl.getUniformLocation(prog, 'u_res');

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 1, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);

    function sample(t) {
      gl.uniform1f(uT, t);
      gl.uniform1f(uI, 0.7);
      gl.uniform2f(uRes, 128, 128);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }

    const a = sample(0.999);
    const b = sample(0.0);
    const diff = Math.max(
      Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])
    );
    seam.push({ i: i, ok: diff < 2, diff: diff, a: Array.from(a), b: Array.from(b) });

    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
    gl.deleteProgram(prog);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    compiledCount: compiledCount,
    total: Loops.COUNT,
    atlasW: bank.atlasW, atlasH: bank.atlasH, tileSize: bank.tileSize,
    drawnArea: drawnArea,
    seam: seam
  };
});

console.log('console/page errors:', errors.length);
if (errors.length) console.log(errors);
console.log(JSON.stringify(result, null, 2));

await browser.close();
