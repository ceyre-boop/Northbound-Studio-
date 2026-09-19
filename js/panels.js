/* panels.js — the work act's DOM controller.
 *
 * Two `.work-card` elements, each built around a real `<a href>` to a live
 * concept build. The enhancement below intercepts activation of that link to
 * open the build in an in-page panel instead of navigating away — it never
 * replaces the link, so every card is a fully working link with JS off and
 * with WebGL off. If focus handling below cannot be done well, the fallback
 * is to leave the plain link alone; a working link beats a broken lightbox.
 *
 * DOM only. No WebGL — you cannot put an iframe inside a WebGL texture, so
 * the two builds are real elements, not quads in the act's shader. Binding
 * happens once, independent of js/acts/work.js's own init()/dispose() cycle:
 * a visitor can still open a build after the GL half has been torn down for
 * scrolling away, or when there is no GL context at all.
 *
 * `?still=1` — the determinism flag Playwright depends on — turns off the
 * open/close transition. Reduced motion (prefers-reduced-motion or ?still=1)
 * gets the same: the panel is simply present or simply gone, no animation
 * and no motion-dependent code path.
 */

var STILL = /[?&]still=1\b/.test(location.search);

function reduced() {
  var M = window.NB_MOTION;
  return STILL || !M || M.reduced;
}

var boundRoot = null;
var overlay = null, panelEl = null, frameEl = null, closeBtn = null, openLink = null, kindEl = null;
var opener = null;          // the <a> that opened the current panel; also the "one at a time" guard
var trapKeydown = null;
var closeTimer = 0;

/* The panel's exit transition (css/act-offerings.css): 260ms is its longest
 * transitioning property. A little slack past that, not a transitionend
 * listener — see the identical note in js/offerings/card.js. */
var CLOSE_MS = 300;

/** Bind the two work cards inside `root` ([data-act="work"]). Idempotent —
 *  calling it again with the same root is a no-op, so it is safe to call
 *  from both init() and fallback(). */
export function init(root) {
  if (!root || boundRoot === root) return;
  boundRoot = root;

  var cards = root.querySelectorAll('.work-card');
  for (var i = 0; i < cards.length; i++) bindCard(cards[i]);

  buildOverlay(root);
}

function bindCard(card) {
  var link = card.querySelector('a[href]');
  if (!link) return;   // no link, no enhancement — never build a lightbox with nothing to open

  card.addEventListener('pointermove', function (e) { tilt(card, e); }, { passive: true });
  card.addEventListener('pointerleave', function () { untilt(card); }, { passive: true });

  link.addEventListener('click', function (e) {
    // A real navigation the visitor asked for — modifier key, a non-primary
    // button, or something upstream already handled — must win over the panel.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(card, link);
  });
}

function tilt(card, e) {
  if (reduced()) return;
  var r = card.getBoundingClientRect();
  var nx = (e.clientX - r.left) / r.width - 0.5;
  var ny = (e.clientY - r.top) / r.height - 0.5;
  card.style.setProperty('--tilt-x', (-ny * 6).toFixed(2) + 'deg');
  card.style.setProperty('--tilt-y', (nx * 6).toFixed(2) + 'deg');
}

function untilt(card) {
  card.style.setProperty('--tilt-x', '0deg');
  card.style.setProperty('--tilt-y', '0deg');
}

/* The overlay is built once and appended inside `root`, not document.body —
 * css/act-work.css may only style [data-act="work"] and its descendants, and
 * `position: fixed` escapes the document flow regardless of which ancestor
 * holds it, so this costs nothing in layout. It starts `hidden`, so its
 * insertion cannot be the layout shift the CLS gate forbids. */
function buildOverlay(root) {
  overlay = document.createElement('div');
  overlay.className = 'work-overlay';
  overlay.hidden = true;

  var backdrop = document.createElement('div');
  backdrop.className = 'work-overlay__backdrop';
  backdrop.setAttribute('data-work-close', '');

  panelEl = document.createElement('div');
  panelEl.className = 'work-overlay__panel';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-modal', 'true');

  var bar = document.createElement('div');
  bar.className = 'work-overlay__bar';

  // Kept visible here on purpose: once the panel covers the section, this is
  // the only place left for the disclosure to still read. It must never be
  // the thing an open-state animation hides.
  kindEl = document.createElement('p');
  kindEl.className = 'work-card__kind';
  kindEl.textContent = 'Concept build · invented business';

  var actions = document.createElement('div');
  actions.className = 'work-overlay__actions';

  openLink = document.createElement('a');
  openLink.className = 'work-overlay__open';
  openLink.target = '_blank';
  openLink.rel = 'noopener';
  openLink.textContent = 'Open in a new tab ↗';

  closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'work-overlay__close';
  closeBtn.setAttribute('data-work-close', '');
  closeBtn.textContent = 'Close ✕';

  actions.appendChild(openLink);
  actions.appendChild(closeBtn);
  bar.appendChild(kindEl);
  bar.appendChild(actions);

  frameEl = document.createElement('iframe');
  frameEl.className = 'work-overlay__frame';
  frameEl.loading = 'lazy';
  // Excluded from the Tab sequence — see the note in open()'s trap. Mouse
  // and touch still reach it directly; a keyboard visitor reaches the live
  // site through "Open in a new tab" instead.
  frameEl.tabIndex = -1;

  panelEl.appendChild(bar);
  panelEl.appendChild(frameEl);
  overlay.appendChild(backdrop);
  overlay.appendChild(panelEl);
  root.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-work-close')) close();
  });
}

/** Open the build behind `link` (a work card's real anchor) in the panel.
 *  Moves focus into it and traps Tab while it is open; Escape closes it and
 *  returns focus to `link`. Pauses the Stage — a live Astro app with its own
 *  rAF, composited over the particle field and the fluid solver, is not a
 *  frame budget that exists on any device, and parking it is not a
 *  degradation: the visitor is looking at the work. */
export function open(card, link) {
  if (!overlay || opener) return;   // one panel at a time
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
  opener = link;

  var heading = card.querySelector('h3');
  var name = heading ? heading.textContent.trim() : 'the live build';
  panelEl.setAttribute('aria-label', name + ' — live build');
  frameEl.setAttribute('title', name + ' — live build');
  frameEl.setAttribute('src', link.href);
  openLink.href = link.href;

  overlay.hidden = false;
  if (reduced()) {
    overlay.setAttribute('data-open', 'true');
  } else {
    // Same relationship as the offerings card: the panel opens FROM the work
    // card that was clicked, not over the top of it. offsetWidth/offsetHeight
    // are the panel's real, untransformed footprint.
    void overlay.offsetWidth;
    var r = card.getBoundingClientRect();
    var pw = panelEl.offsetWidth || r.width || 1;
    var ph = panelEl.offsetHeight || r.height || 1;
    var scale = Math.min(1, Math.max(0.18, Math.min(r.width / pw, r.height / ph)));
    panelEl.style.setProperty('--card-ox', ((r.left + r.width / 2) - window.innerWidth / 2).toFixed(1) + 'px');
    panelEl.style.setProperty('--card-oy', ((r.top + r.height / 2) - window.innerHeight / 2).toFixed(1) + 'px');
    panelEl.style.setProperty('--card-scale', scale.toFixed(3));
    // Force layout before the open state is applied, so the very first open
    // on a page has a starting frame — at the card's position — to transition
    // from.
    void overlay.offsetWidth;
    overlay.setAttribute('data-open', 'true');
  }

  if (window.NB_STAGE) window.NB_STAGE.pause('iframe');

  trapKeydown = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    // Deliberately just these two, in DOM order — never the iframe. Once
    // keyboard focus is inside a (likely cross-origin) iframe's own content,
    // its keydown events never reach this document's listener at all, which
    // would silently break both the trap and Escape. Keeping the loop to
    // elements this document actually owns is what makes the trap and
    // Escape unconditional; "Open in a new tab" is the keyboard path into
    // the live site itself, in a context with no trap to fight.
    var focusables = [openLink, closeBtn];
    var i = focusables.indexOf(document.activeElement);
    if (e.shiftKey) {
      if (i <= 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
    } else if (i === focusables.length - 1 || i === -1) {
      e.preventDefault(); focusables[0].focus();
    }
  };
  document.addEventListener('keydown', trapKeydown, true);

  closeBtn.focus();
}

/** Close the panel, tear the iframe down (not just hide it — a hidden live
 *  site keeps its timers and network running behind the page), resume the
 *  Stage, and return focus to the card that opened it. */
export function close() {
  if (!opener) return;
  overlay.removeAttribute('data-open');

  if (window.NB_STAGE) window.NB_STAGE.resume('iframe');
  if (trapKeydown) { document.removeEventListener('keydown', trapKeydown, true); trapKeydown = null; }

  var toFocus = opener;
  opener = null;
  if (toFocus) toFocus.focus();

  // Tear the iframe down and hide the shell only once the panel has actually
  // finished travelling back toward the card — removing src immediately would
  // blank the live site to white while the panel is still visibly fading,
  // which is a worse seam than the one this pass exists to close.
  if (closeTimer) clearTimeout(closeTimer);
  var finish = function () {
    overlay.hidden = true;
    frameEl.removeAttribute('src');
    closeTimer = 0;
  };
  if (reduced()) finish();
  else closeTimer = setTimeout(finish, CLOSE_MS);
}

/** Not a GL resource — this is DOM state, so it is not called from the act's
 *  own dispose(). Exposed for completeness (e.g. a future SPA-style teardown). */
export function dispose() {
  if (opener) close();
  boundRoot = null;
}

export default { init: init, open: open, close: close, dispose: dispose };

/* Self-binding.
 *
 * These two concept builds used to live in the work section and were bound by
 * that act, which is gone — the offerings procession took the section, and the
 * builds moved down beside the contact form. The closing section is not an act,
 * so nothing over there would ever call init(), and the overlay would have been
 * quietly lost along with the section it grew up in. The links would still have
 * worked, which is exactly why nobody would have noticed.
 *
 * init() is idempotent and guards on boundRoot, so an act calling it later is
 * harmless. */
(function () {
  if (typeof document === 'undefined') return;
  function bind() {
    var host = document.querySelector('.closing-proof') || document.getElementById('contact');
    if (host && host.querySelector('.work-card')) init(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();

/* Copy arrival, sitewide, now lives in js/entrance.js — scroll-linked and
 * latched, driven by js/springs.js's `settle` preset, replacing the
 * IntersectionObserver + CSS-opacity-transition controller that used to be
 * here. See that file's header for the full rationale. */
