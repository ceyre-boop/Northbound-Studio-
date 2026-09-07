/* Northbound — Work Showcase, raw WebGL1 "light on form" shader.
 *
 * One fullscreen-triangle pass per case stage. It never generates colour —
 * it lights a photograph. The poster <img> is the only source of hue; this
 * program derives a cheap fake-normal from its luminance and grazes it with
 * a single directional light (white / Ion), the same "rim light + fringe at
 * the hottest edge" logic as the mark (brand/README.md). No ripple, no UV
 * displacement, no reading pixels out of a live iframe — this samples a
 * static <img>, which is the only thing a WebGL texture is allowed to touch
 * (a live cross-origin-capable iframe's pixels cannot be read into a canvas
 * at all, same-origin or not).
 *
 * Three uLightProfile presets (set from JS per case, see js/showcase.js):
 *   0 = hard    — Ridgeline Roofing: narrow, high-contrast, sun-hard rim.
 *   1 = soft    — Marrow Coffee: wide, low-intensity, unhurried falloff.
 *   2 = hairline — Lumen Interiors: extremely narrow, very bright, near-black crush.
 *
 * Exposed as a global (no bundler, no imports) — load this script before
 * js/showcase.js.
 */
(function () {
  'use strict';

  var vertexSrc = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var fragmentSrc = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',        // 1.0 / texture resolution in px
    'uniform float uTime;',
    'uniform float uProgress;',    // 0 = panel just arrived, 1 = settled (entrance sweep)
    'uniform vec2 uPointer;',      // 0..1 within the stage, springed
    'uniform float uPointerMix;',  // how much the pointer bends the light (0 = ambient only)
    'uniform float uProfile;',     // 0 hard, 1 soft, 2 hairline
    'uniform vec3 uIonTint;',      // --color-ion-500 as linear-ish 0..1
    'uniform vec3 uFringeTint;',   // --color-fringe-500, edge-only

    'float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }',

    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);',
    '}',

    'void main() {',
    '  vec4 tex = texture2D(uTex, vUv);',

    // Cheap fake-normal from the luminance gradient of the poster itself —
    // no separate normal map, no extra asset, just "light hitting the form
    // that is already there."
    '  float lC = luma(tex.rgb);',
    '  float lX = luma(texture2D(uTex, vUv + vec2(uTexel.x, 0.0)).rgb);',
    '  float lY = luma(texture2D(uTex, vUv + vec2(0.0, uTexel.y)).rgb);',
    '  vec3 normal = normalize(vec3((lC - lX) * 6.0, (lY - lC) * 6.0, 1.0));',

    // Profile-driven light shape. Hard = narrow + intense; soft = wide +
    // gentle falloff; hairline = extremely narrow and bright.
    '  float shininess = 10.0;',
    '  float baseLift = 0.34;',
    '  float ionWeight = 0.16;',
    '  if (uProfile < 0.5) {', // hard — Atlas
    '    shininess = 26.0; baseLift = 0.30; ionWeight = 0.16;',
    '  } else if (uProfile < 1.5) {', // soft — Vector
    '    shininess = 7.0; baseLift = 0.40; ionWeight = 0.10;',
    '  } else {', // hairline — Halo
    '    shininess = 60.0; baseLift = 0.20; ionWeight = 0.22;',
    '  }',

    // Ambient light direction breathes slowly on its own, and leans gently
    // toward the pointer when a fine-pointer visitor is actually hovering —
    // subtle enough that it reads as the form responding, not "an effect."
    '  float breathe = uTime * 0.08;',
    '  vec2 lightXY = vec2(cos(breathe) * 0.35, sin(breathe * 0.7) * 0.35);',
    '  vec2 pointerXY = (uPointer - 0.5) * 2.0;',
    '  lightXY = mix(lightXY, pointerXY, uPointerMix * 0.6);',
    '  vec3 lightDir = normalize(vec3(lightXY, 0.82));',

    '  float diff = max(dot(normal, lightDir), 0.0);',
    '  float spec = pow(diff, shininess);',

    // Entrance: a single specular band sweeps once across the panel as it
    // becomes the active case, tied to uProgress (never opacity).
    '  float sweep = smoothstep(uProgress - 0.18, uProgress, vUv.x + vUv.y * 0.4)',
    '    - smoothstep(uProgress, uProgress + 0.18, vUv.x + vUv.y * 0.4);',
    '  spec += sweep * 0.5 * step(uProgress, 1.05);',

    // Compose: the photograph, lifted by ambient + diffuse, with the
    // specular highlight tinted Ion (light, never a fill) and a whisper of
    // fringe riding only the very hottest edge of the highlight.
    '  vec3 lit = tex.rgb * (baseLift + (1.0 - baseLift) * diff);',
    '  lit += uIonTint * spec * ionWeight;',
    '  lit += uFringeTint * pow(spec, 3.0) * 0.10;',

    // Restraint: crush the periphery back toward void the way resn/active
    // theory leave ~95% of a frame empty — even a full-bleed panel should
    // feel like light emerging from black, not a lit photograph.
    '  float d = distance(vUv, vec2(0.5));',
    '  float vign = smoothstep(0.85, 0.25, d);',
    '  lit *= mix(0.55, 1.0, vign);',

    // Film grain — a single hash sample, cheap, breaks up banding on the
    // crushed blacks without ever reading as "a texture effect."
    '  float g = (hash(vUv * 800.0 + uTime * 60.0) - 0.5) * 0.03;',
    '  lit += g;',

    '  gl_FragColor = vec4(lit, 1.0);',
    '}'
  ].join('\n');

  window.NB_SHOWCASE_SHADERS = { vertex: vertexSrc, fragment: fragmentSrc };
})();
