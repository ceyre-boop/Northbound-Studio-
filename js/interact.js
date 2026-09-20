/* Northbound — hover weight, magnetic CTAs, the sticky "Get a quote", and the
 * form.
 *
 * Ported from two places in history rather than invented fresh:
 *   - the magnetic-CTA feel is `js/interact.js` at commit 1bc3cb1 (8.6 KB
 *     raw), re-expressed on the current `NB_MOTION` spring API (presets from
 *     js/springs.js, never raw stiffness/damping numbers).
 *   - the sticky CTA, the package-button prefill and the fetch submit are
 *     `js/quote.js` on branch sellable-v1, adapted to this page: the "need"
 *     field here is a `<select>`, so a chosen package writes a line into the
 *     message field instead of into it.
 *
 * Loaded as a module (like js/scroll.js and js/entrance.js) purely so it
 * defers without a `defer` attribute and never blocks first paint — it has
 * no imports and no exports, for the same reason quote.js needed none: it
 * only ever reacts to DOM it does not own (card.js's basket, the plain
 * `[data-package]` buttons, `.pkg`/nav DOM already in index.html).
 *
 * Every hover effect below has a `pointerdown`/`data-pressed` twin, so touch
 * gets the same weight a mouse does; nothing is hover-only. Under reduced
 * motion (or `?still=1`) the magnet, the card light and the sticky pulse
 * never engage — the CSS beneath them already resolves to their rest state.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var STILL = /[?&]still=1\b/.test(location.search);
  function reducedNow() {
    return STILL || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  var PHONE = '470-573-8908';
  var M = window.NB_MOTION;

  /* =========================================================================
   * Sticky "Get a quote"
   * ---------------------------------------------------------------------- */
  var sticky = document.querySelector('[data-sticky-cta]');
  var contactSection = document.getElementById('contact');
  var scrolled = false, pastContact = false, overlayOpen = false;

  function applyStickyState() {
    if (!sticky) return;
    if (!scrolled) { sticky.setAttribute('data-state', 'pre-scroll'); return; }
    if (overlayOpen || pastContact) { sticky.setAttribute('data-state', 'hidden'); return; }
    sticky.removeAttribute('data-state');
  }

  if (sticky) {
    sticky.setAttribute('data-state', 'pre-scroll');

    window.addEventListener('scroll', function onFirstScroll() {
      scrolled = true;
      applyStickyState();
    }, { passive: true, once: true });

    if (contactSection && typeof IntersectionObserver !== 'undefined') {
      var contactIo = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) pastContact = entries[i].isIntersecting;
        applyStickyState();
      }, { threshold: 0.01 });
      contactIo.observe(contactSection);
    }

    /* card.js (offerings) builds `.offer-overlay` at runtime; watching the
       attribute it already toggles avoids needing an event from a module
       this file never imports. */
    if (typeof MutationObserver !== 'undefined') {
      var overlayWatch = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var t = mutations[i].target;
          if (t.classList && t.classList.contains('offer-overlay')) {
            overlayOpen = t.hasAttribute('data-open');
          }
        }
        applyStickyState();
      });
      overlayWatch.observe(document.body, { attributes: true, attributeFilter: ['data-open'], subtree: true });
    }

    /* Scale-and-settle pulse on every scroll-direction flip — a spring kick,
     * not a hand-tuned keyframe: `s.v` is nudged and the `ui` preset's own
     * response does the rest. Reads/writes js/motion.js's exposed spring
     * registry directly rather than adding a second API to a frozen file. */
    if (!reducedNow() && M && M.onFrame && M.spring) {
      var PULSE_KEY = 'sticky-pulse';
      var lastY = window.scrollY, lastDir = 0, pulseTicking = false, releasePulse = null;

      function tickPulse() {
        var v = M.spring(PULSE_KEY, 1, 'ui');
        sticky.style.setProperty('--sticky-pulse', v.toFixed(3));
        var s = M.springs.get(PULSE_KEY);
        if (s && s.value === s.target && s.v === 0) {
          pulseTicking = false;
          if (releasePulse) releasePulse();
        }
      }
      function ensurePulseTick() {
        if (pulseTicking) return;
        pulseTicking = true;
        releasePulse = M.onFrame(tickPulse);
      }
      window.addEventListener('scroll', function () {
        var y = window.scrollY;
        var dir = y > lastY ? 1 : (y < lastY ? -1 : lastDir);
        if (dir && lastDir && dir !== lastDir) {
          M.spring(PULSE_KEY, 1, 'ui'); // make sure the spring exists before reaching in
          var s = M.springs.get(PULSE_KEY);
          if (s) s.v += 2.2; // the kick; the preset's own damping brings it home
          ensurePulseTick();
        }
        lastDir = dir; lastY = y;
      }, { passive: true });
    }
  }

  /* =========================================================================
   * Package CTAs: prefill.
   *
   * The "need" field on this page is a <select>, not free text, so a chosen
   * package cannot be appended to it the way sellable-v1 appended offering
   * names. It goes into the message field instead, as one added line — never
   * removed once added, so a visitor's own typing is never touched.
   * ---------------------------------------------------------------------- */
  var addedPackageLines = Object.create(null);
  document.addEventListener('click', function (e) {
    var target = e.target;
    var btn = typeof target.closest === 'function' ? target.closest('[data-package]') : null;
    if (!btn) return;

    var line = btn.getAttribute('data-package');
    var note = document.getElementById('f-note');
    if (line && note && !addedPackageLines[line]) {
      addedPackageLines[line] = true;
      var prefix = 'On your project: ' + line;
      note.value = note.value ? (note.value.replace(/\s+$/, '') + '\n' + prefix) : prefix;
    }

    // The anchor's own href="#contact" does the scrolling (through js/scroll.js
    // if Lenis is running); this only adds what a hash link cannot do alone.
    var nameField = document.getElementById('f-name');
    if (nameField && !nameField.value) {
      setTimeout(function () { nameField.focus(); }, 350);
    }
  });

  /* =========================================================================
   * Submit: fetch, JSON, inline confirmation. The no-JS path
   * (action="/api/quote" method="post", a 303 to /thanks.html) never touches
   * this file at all — it keeps working because nothing here is required for
   * the <form> itself to submit.
   * ---------------------------------------------------------------------- */
  var form = document.querySelector('form.contact');
  var statusEl = document.querySelector('[data-form-status]');

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    if (kind) statusEl.setAttribute('data-status', kind);
    else statusEl.removeAttribute('data-status');
  }

  function nudgeInvalid(el) {
    if (!el) return;
    if (M && M.spring && M.onFrame && !reducedNow()) {
      var key = 'field-nudge:' + (el.id || el.name);
      M.spring(key, 0, 'ui');
      var s = M.springs.get(key);
      if (s) s.v = -6;
      var release = M.onFrame(function () {
        var v = M.spring(key, 0, 'ui');
        el.style.transform = 'translateX(' + v.toFixed(2) + 'px)';
        var st = M.springs.get(key);
        if (st && st.value === st.target && st.v === 0) { el.style.transform = ''; release(); }
      });
    }
    el.focus();
  }

  if (form && typeof fetch === 'function') {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var invalid = form.querySelector(':invalid');
      if (invalid) { nudgeInvalid(invalid); return; }

      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setStatus('Sending…');

      fetch(form.getAttribute('action'), {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      }).then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json().catch(function () { return null; });
      }).then(function (json) {
        if (!json || json.ok !== true) throw new Error((json && json.error) || 'unexpected response');
        var host = form.parentNode;
        var confirmed = document.createElement('p');
        confirmed.className = 'form-confirm';
        confirmed.setAttribute('role', 'status');
        confirmed.textContent = "Got it — we'll get back to you within one business day. A copy is on its way to your inbox.";
        confirmed.style.transform = 'translateY(10px)';
        if (host) host.replaceChild(confirmed, form);
        if (M && M.spring && M.onFrame && !reducedNow()) {
          var release = M.onFrame(function () {
            var v = M.spring('form-confirm', 1, 'settle');
            confirmed.style.transform = 'translateY(' + ((1 - v) * 10).toFixed(2) + 'px)';
            var s = M.springs.get('form-confirm');
            if (s && s.value === s.target && s.v === 0) { confirmed.style.transform = ''; release(); }
          });
        } else {
          confirmed.style.transform = '';
        }
      }).catch(function () {
        setStatus("That didn't send. Call " + PHONE + " and we'll take it over the phone.", 'error');
        if (btn) btn.disabled = false;
      });
    });
  }

  /* =========================================================================
   * Magnetic pull on every .btn — CTAs, the sticky CTA, the form submit.
   * `--mag-x`/`--mag-y` are read by css/stage.css's `.btn { translate: ... }`,
   * a standalone property so it composes with .btn's own hover/active
   * `transform` instead of overwriting it.
   * ---------------------------------------------------------------------- */
  if (!reducedNow() && M && M.spring && M.onFrame && M.valueOf) {
    var magCounter = 0;
    var magActive = new Map();
    var magTicking = false, releaseMag = null;

    function ensureMagTick() {
      if (magTicking) return;
      magTicking = true;
      releaseMag = M.onFrame(function () {
        var stillActive = false;
        magActive.forEach(function (_, el) {
          var kx = 'magnet-x:' + el.__nbMagId, ky = 'magnet-y:' + el.__nbMagId;
          var vx = M.valueOf(kx), vy = M.valueOf(ky);
          el.style.setProperty('--mag-x', vx.toFixed(2) + 'px');
          el.style.setProperty('--mag-y', vy.toFixed(2) + 'px');
          var sx = M.springs.get(kx), sy = M.springs.get(ky);
          var settled = (!sx || (sx.value === sx.target && sx.v === 0)) &&
                        (!sy || (sy.value === sy.target && sy.v === 0));
          if (settled) magActive.delete(el); else stillActive = true;
        });
        if (!stillActive) { magTicking = false; if (releaseMag) releaseMag(); }
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.btn'), function (el) {
      el.__nbMagId = 'm' + (magCounter++);
      var kx = 'magnet-x:' + el.__nbMagId, ky = 'magnet-y:' + el.__nbMagId;

      el.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return; // touch gets the press spring below, not a follow
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        M.spring(kx, dx * 0.28, 'magnet');
        M.spring(ky, dy * 0.28, 'magnet');
        magActive.set(el, true);
        ensureMagTick();
      });
      el.addEventListener('pointerleave', function () {
        M.spring(kx, 0, 'magnet');
        M.spring(ky, 0, 'magnet');
        magActive.set(el, true);
        ensureMagTick();
      });
    });
  }

  /* =========================================================================
   * Package cards: lift, a cursor-follow light, and proximity before entry.
   * ---------------------------------------------------------------------- */
  (function () {
    var packagesEl = document.querySelector('.packages');
    if (!packagesEl) return;
    var cards = Array.prototype.slice.call(packagesEl.querySelectorAll('.pkg'));
    if (!cards.length) return;

    function onCardMove(card, e) {
      var r = card.getBoundingClientRect();
      var mx = r.width ? (e.clientX - r.left) / r.width : 0.5;
      var my = r.height ? (e.clientY - r.top) / r.height : 0.5;
      card.style.setProperty('--mx', mx.toFixed(3));
      card.style.setProperty('--my', my.toFixed(3));
    }
    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) { onCardMove(card, e); });
      card.addEventListener('pointerdown', function (e) { card.setAttribute('data-pressed', ''); onCardMove(card, e); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        card.addEventListener(ev, function () { card.removeAttribute('data-pressed'); });
      });
    });

    // Proximity glow: --near ramps up as the pointer approaches a card, before
    // it ever enters — computed only while the packages section is on screen.
    if (reducedNow()) return;
    var PROX_PX = 140;
    var proxActive = false;
    function onProximityMove(e) {
      cards.forEach(function (card) {
        var r = card.getBoundingClientRect();
        var cx = Math.min(Math.max(e.clientX, r.left), r.right);
        var cy = Math.min(Math.max(e.clientY, r.top), r.bottom);
        var dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        var near = Math.max(0, 1 - dist / PROX_PX);
        card.style.setProperty('--near', near.toFixed(3));
      });
    }
    if (typeof IntersectionObserver !== 'undefined') {
      var proxIo = new IntersectionObserver(function (entries) {
        var visible = entries.some(function (en) { return en.isIntersecting; });
        if (visible && !proxActive) {
          proxActive = true;
          document.addEventListener('pointermove', onProximityMove, { passive: true });
        } else if (!visible && proxActive) {
          proxActive = false;
          document.removeEventListener('pointermove', onProximityMove);
          cards.forEach(function (c) { c.style.setProperty('--near', '0'); });
        }
      }, { threshold: 0 });
      proxIo.observe(packagesEl);
    } else {
      document.addEventListener('pointermove', onProximityMove, { passive: true });
    }
  })();

  /* =========================================================================
   * Nav / inline links: underline draws from whichever side the pointer
   * entered. `--from` (0 or 1) sets transform-origin in css/stage.css; timed
   * on the `ui` spring's linear() easing, no per-frame JS.
   * ---------------------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.masthead nav a'), function (a) {
    a.addEventListener('pointerenter', function (e) {
      var r = a.getBoundingClientRect();
      var from = r.width && (e.clientX - r.left) > r.width / 2 ? 1 : 0;
      a.style.setProperty('--from', String(from));
    });
    a.addEventListener('pointerdown', function () { a.setAttribute('data-pressed', ''); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      a.addEventListener(ev, function () { a.removeAttribute('data-pressed'); });
    });
  });
})();
