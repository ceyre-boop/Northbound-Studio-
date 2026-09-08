/* reveal.js — the headline's split-character entrance.
 *
 * Driven from NB_MOTION's frame loop, never from CSS. No @keyframes, no
 * transition property, same discipline as the nbFloat/nbCue note in
 * index.html: one clock, so reduced motion stops everything dead in one place.
 *
 * The hard constraint is CLS. The boot shell paints the same headline at the
 * same pixel and the mounted hero must not move it, so this file measures
 * before and after the split and unwraps itself if the geometry moved at all.
 * Splitting a display face — Syne, at letter-spacing:-0.03em — into
 * inline-blocks drops kerning pairs, which is a real risk, not a theoretical
 * one. It is enforced here rather than assumed.
 */
(function () {
  'use strict';

  var RISE_EM = 0.42;
  var STIFF = 210, DAMP = 18;
  var LINE_STAGGER = 0.06, CHAR_STAGGER = 0.018, JITTER = 0.010;

  var chars = [], unsub = null, elapsed = 0, armed = false;
  var resolveDone;
  var done = new Promise(function (r) { resolveDone = r; });

  // Deterministic, so a test can assert the same reveal twice. Math.random()
  // would make the stagger unreproducible for no visual gain.
  function hash(i) {
    var x = Math.sin(i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function split(h1) {
    var line = 0, made = [];
    var nodes = Array.prototype.slice.call(h1.childNodes);
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      // <br>s are left exactly as authored. Line breaking stays authored and
      // is never recomputed, which removes the largest class of split-text
      // reflow bug before it can happen.
      if (node.nodeType === 1 && node.tagName === 'BR') { line++; continue; }
      if (node.nodeType !== 3) continue;
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      for (var i = 0; i < text.length; i++) {
        var s = document.createElement('span');
        s.className = 'nb-ch';
        s.setAttribute('aria-hidden', 'true');
        s.style.cssText = 'display:inline-block; white-space:pre; will-change:transform,opacity';
        s.textContent = text[i];
        frag.appendChild(s);
        made.push({ el: s, line: line, i: made.length });
      }
      h1.replaceChild(frag, node);
    }
    return made;
  }

  function unwrap(h1) {
    var text = h1.getAttribute('data-nb-text');
    if (text == null) return;
    var lines = text.split('\n');
    while (h1.firstChild) h1.removeChild(h1.firstChild);
    for (var i = 0; i < lines.length; i++) {
      if (i) h1.appendChild(document.createElement('br'));
      h1.appendChild(document.createTextNode(lines[i]));
    }
    h1.removeAttribute('aria-label');
  }

  function arm(h1) {
    if (armed || !h1) return;
    var M = window.NB_MOTION;

    // Reduced motion does not split at all. M.spring would snap to target
    // anyway, but not touching the DOM is stricter and keeps the
    // reduced-motion fallback gate's console-error count at zero.
    if (!M || M.reduced) { resolveDone(); return; }

    // A visitor who deep-linked past the hero would scroll back up later to a
    // half-revealed headline. Leave it at rest.
    if (location.hash && location.hash !== '#floor-1') { resolveDone(); return; }

    var lines = [], buf = '';
    Array.prototype.forEach.call(h1.childNodes, function (n) {
      if (n.nodeType === 1 && n.tagName === 'BR') { lines.push(buf); buf = ''; }
      else if (n.nodeType === 3) buf += n.nodeValue;
    });
    lines.push(buf);
    h1.setAttribute('data-nb-text', lines.join('\n'));
    h1.setAttribute('aria-label', lines.join(' '));

    var before = h1.getBoundingClientRect();
    chars = split(h1);
    var after = h1.getBoundingClientRect();

    // Measured, same frame. If the split moved the box the reveal is not
    // worth a layout shift — put the text back and let it appear at rest.
    if (Math.abs(after.width - before.width) > 0.5 ||
        Math.abs(after.height - before.height) > 0.5) {
      unwrap(h1);
      chars = [];
      console.warn('reveal: split shifted the headline box, reverted');
      resolveDone();
      return;
    }

    var rise = parseFloat(getComputedStyle(h1).fontSize) * RISE_EM;
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      c.rise = rise;
      c.delay = c.line * LINE_STAGGER + i * CHAR_STAGGER + hash(i) * JITTER;
      c.el.style.opacity = '0';
      c.el.style.transform = 'translate3d(0,' + rise.toFixed(2) + 'px,0)';
    }

    armed = true;
    elapsed = 0;
    unsub = M.onFrame(function (dt) { tick(dt, h1); });
  }

  function tick(dt, h1) {
    var M = window.NB_MOTION;
    elapsed += dt;
    var settled = 0;

    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      var v = M.spring('hero:ch' + c.i, elapsed > c.delay ? 1 : 0, STIFF, DAMP);
      c.el.style.opacity = v.toFixed(3);
      c.el.style.transform = 'translate3d(0,' + ((1 - v) * c.rise).toFixed(2) + 'px,0)';
      if (v > 0.999) settled++;
    }

    if (settled === chars.length && chars.length) {
      // Unwrapping is part of the mechanism, not tidiness. It restores
      // canonical kerning and leaves zero per-character DOM for the rest of
      // the session — which matters because descent.spec.ts's inkRects() and
      // the in-page measureBuddy() both treat a container's children as the
      // ink, and 34 glyph boxes are not the same measurement as 3 line boxes.
      if (unsub) { unsub(); unsub = null; }
      unwrap(h1);
      chars = [];
      resolveDone();
    }
  }

  window.NB_REVEAL = { arm: arm, done: done };
})();
