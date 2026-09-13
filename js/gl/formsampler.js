/* formsampler.js — SVG silhouette to weighted point cloud, no build step.
 *
 * The lenticular needs three pictures a particle field can resolve into. The
 * pictures are hand-drawn solid-fill SVGs (brand/form-*.svg); this file turns
 * one into a set of (x, y) points whose density follows the ink, so that N
 * points rejection-sampled from it read as the silhouette rather than as a
 * grid or a uniform fill.
 *
 * Same shape as js/gl/typeraster.js's canvas2d -> pixels path (detached
 * canvas, draw once, read back once) but the source is an <img> decoding an
 * SVG rather than fillText, and the output is point positions rather than a
 * texture. That file is not imported here — it is owned by another
 * department and the two techniques are small enough that a byte-for-byte
 * shared dependency is not worth the cross-department coupling.
 *
 * Everything in this file runs once, at an act's init(), off the critical
 * path. Nothing here is safe to call per frame: sampling walks every pixel
 * of the raster once to build a cumulative distribution, then draws `count`
 * samples from it, which is cheap for a one-off but not for 60Hz.
 */

/** Detached canvas, OffscreenCanvas where available — mirrors typeraster.js. */
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Loads an SVG at `url` as a decoded <img>, forcing an explicit square
 *  intrinsic size first. Without this, an <svg> with only a viewBox (no
 *  width/height — exactly how brand/form-*.svg are authored, deliberately,
 *  so they scale cleanly anywhere else they're used) can rasterize at the
 *  UA's default intrinsic box (historically 300x150) before drawImage ever
 *  gets a say, silently squashing a square 200x200 viewBox non-uniformly.
 *  Injecting width/height that match the viewBox pins the aspect before any
 *  rasterization happens. */
function loadSquareSVG(url) {
  return fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('formsampler: ' + url + ' ' + res.status);
      return res.text();
    })
    .then(function (text) {
      if (!/\swidth=/.test(text)) {
        text = text.replace('<svg', '<svg width="200" height="200"');
      }
      var blob = new Blob([text], { type: 'image/svg+xml' });
      var objUrl = URL.createObjectURL(blob);
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(objUrl); resolve(img); };
        img.onerror = function (e) { URL.revokeObjectURL(objUrl); reject(e); };
        img.src = objUrl;
      });
    });
}

/** Small deterministic PRNG (mulberry32) so a rebuild after context loss
 *  reproduces the same-looking cloud rather than a new random one each time. */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) { h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; }
  return h;
}

/** Rasterizes `url` at `size`x`size` px and samples `count` points weighted
 *  by ink coverage, returning a Float32Array of length count*2 (x, y pairs)
 *  in a -scale..+scale square, +y up, origin centred — the same convention
 *  drift.js's homeOf() uses for particle homes.
 *
 *  Ink weight is alpha * red rather than alpha alone: brand/form-*.svg draws
 *  its silhouette in white and cuts eyes/mouth out of it in black on top (see
 *  the SVGs' own comments), and both are fully opaque. Weighting by the red
 *  channel too means a black "hole" pixel scores zero and stays a gap in the
 *  cloud, which is what makes the cutout read at all once rebuilt from dots.
 */
export async function sampleForm(url, count, size, scale) {
  size = size || 256;
  scale = scale != null ? scale : 0.86;

  var img = await loadSquareSVG(url);
  var canvas = makeCanvas(size, size);
  var c2d = canvas.getContext('2d');
  c2d.clearRect(0, 0, size, size);
  c2d.drawImage(img, 0, 0, size, size);

  var data = c2d.getImageData(0, 0, size, size).data;
  var xs = [];
  var ys = [];
  var cum = [];
  var acc = 0;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var i = (y * size + x) * 4;
      var w = (data[i + 3] / 255) * (data[i] / 255); // alpha * red: white ink only
      if (w > 0.02) {
        acc += w;
        xs.push(x); ys.push(y); cum.push(acc);
      }
    }
  }

  var out = new Float32Array(count * 2);
  if (acc <= 0 || xs.length === 0) return out; // blank/failed raster: caller degrades

  var rng = mulberry32(hashString(url) ^ count);
  for (var n = 0; n < count; n++) {
    var r = rng() * acc;
    // binary search cum for the first entry >= r
    var lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (cum[mid] < r) lo = mid + 1; else hi = mid;
    }
    var px = (xs[lo] + rng()) / size; // sub-pixel jitter: no visible pixel grid
    var py = (ys[lo] + rng()) / size;
    out[n * 2 + 0] = (px * 2 - 1) * scale;
    out[n * 2 + 1] = (1 - py * 2) * scale; // canvas y-down -> GL y-up
  }
  return out;
}

/** Packs a sampled point cloud into an RGBA8 texel buffer using the same
 *  16-bit-across-two-channels convention drift-shaders.js's C_POS_FRAG uses
 *  for its position texture (rg = pack16(x), ba = pack16(y)), so Path C can
 *  upload a target cloud with texImage2D and read it back with the same
 *  unpack16() already in every one of its simulation shaders.
 *
 *  `domain` must match the caller's position-space half-extent (Path C's sim
 *  domain is [-1.2, 1.2], i.e. domain = 1.2) so packed values round-trip.
 */
export function packFormTexture(points, w, h, domain) {
  var out = new Uint8Array(w * h * 4);
  var n = Math.min(points.length / 2, w * h);
  for (var i = 0; i < n; i++) {
    var x = clamp01(points[i * 2 + 0] / (2 * domain) + 0.5);
    var y = clamp01(points[i * 2 + 1] / (2 * domain) + 0.5);
    var o = i * 4;
    pack16Into(out, o, x);
    pack16Into(out, o + 2, y);
  }
  return out;
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

function pack16Into(bytes, offset, v) {
  var s = v * 255;
  var hi = Math.floor(s);
  var lo = Math.floor((s - hi) * 255);
  bytes[offset] = hi;
  bytes[offset + 1] = lo;
}
