/* typeraster.js — text to texture, canvas2d, no build step.
 *
 * MSDF is the better technique for GPU type and the wrong choice here: it
 * needs msdfgen or msdf-bmfont-xml, both a build step, and this site has
 * none. So: OffscreenCanvas (falling back to a detached <canvas> where it is
 * unavailable) + fillText + texImage2D. Rasterized once per resize(), never
 * per frame — solution.js is the only caller and it knows not to call this
 * in the draw loop.
 *
 * Two bugs this file exists to not have:
 *
 *   1. `document.fonts.ready` alone resolves immediately if the family has
 *      never been requested. That is invisible on a machine that already has
 *      the font cached — i.e. every dev machine after the first load — and
 *      the bug is "we textured Times New Roman" discovered on someone else's
 *      cold cache. So: explicitly `fonts.load()` the exact face string first,
 *      then await `fonts.ready`.
 *   2. Rasterizing at CSS pixel resolution and stretching to the backing
 *      store produces soft type at any DPR above 1. Rasterize at the same
 *      DPR as the backbuffer.
 */

/** Detached canvas, OffscreenCanvas where available. Both expose 2D context
 *  + width/height, which is all texImage2D and this file need. */
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Rasterize `text` into an atlas of `width` x `height` CSS px at `dpr`,
 *  coverage-only: white text on black, meant to be uploaded as a single-
 *  channel LUMINANCE/R8 texture (color comes from the composite shader, this
 *  is a mask). Resolves { source, width, height } in backing-store pixels,
 *  ready for texImage2D.
 *
 *  `font` must be the exact CSS font shorthand solution.js will also read
 *  the family out of, e.g. '700 120px Syne, sans-serif' — the family in that
 *  string is what gets passed to fonts.load().
 */
export async function rasterize(opts) {
  var text = opts.text;
  var width = opts.width, height = opts.height;
  var dpr = opts.dpr || 1;
  var font = opts.font;
  var family = opts.family; // e.g. "700 120px Syne" minus the trailing fallback stack

  if (document.fonts) {
    try {
      await document.fonts.load(family || font);
      await document.fonts.ready;
    } catch (e) {
      /* Proceed with whatever face resolves — a fallback face beats a
         thrown init() and a fallback() takeover of an otherwise-fine act. */
    }
  }

  var pxW = Math.max(1, Math.round(width * dpr));
  var pxH = Math.max(1, Math.round(height * dpr));
  var canvas = makeCanvas(pxW, pxH);
  var ctx2d = canvas.getContext('2d');

  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, pxW, pxH);
  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, pxW, pxH);

  ctx2d.scale(dpr, dpr);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = font;
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'alphabetic';

  var baseline = opts.baseline != null ? opts.baseline : height * 0.7;
  var padX = opts.padX || 0;
  ctx2d.fillText(text, padX, baseline);

  return { source: canvas, width: pxW, height: pxH };
}

/** Upload a rasterized atlas as a coverage-only texture: LUMINANCE on
 *  WebGL1, R8/RED on WebGL2. Caller owns `tex` (from ctx.texture()) and the
 *  bind; this only uploads and sets filtering/wrap. */
export function upload(gl, isWebGL2, tex, atlas) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (isWebGL2) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, atlas.source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, atlas.source);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
