/* card.js — the CARD department: the DOM half of the offerings procession.
 *
 * The GL wall (procession.js / atlas.js / wall.js) draws twelve panels on a
 * helix that is not, and must never be, synchronised to the DOM — riding
 * twelve large transforms off a 12-panel helix every frame is a style
 * recalc bigger than the whole GL frame budget. So the split is:
 *
 *   DOM   a complete, static, readable document — every offering, always.
 *   GL    a treatment drawn OVER it. Never derived from it at runtime.
 *
 * This module owns the readable list, the "open" overlay card, the keyboard
 * path into both, and the basket. It knows nothing about the helix, t, z or
 * any panel geometry — the only thing it shares with the physics module is
 * an integer index, 0..11, which is the entire contract (see contract.js).
 *
 * Three ways in converge on open(index): a GL click (js/acts/offerings.js
 * calls Card.open(i) after its own hit test), keyboard activation of an
 * offering's link, and a plain click on the DOM item. All three end up here.
 *
 * If WebGL never starts, or init() throws before this runs, the act's own
 * fallback() calls init() again with no-op handlers — the list stops being a
 * transparent accessibility layer and becomes the visible section, and the
 * overlay still works, because none of this module depends on GL existing.
 */
import { OFFERINGS, OFFER_COPY } from './content.js';

/* `?still=1` is the determinism flag the perf/Playwright sweep depends on,
 * and mirrors js/panels.js: it and prefers-reduced-motion both mean "no
 * transition, the open state is simply present or simply gone." */
var STILL = /[?&]still=1\b/.test(location.search);

function reduced() {
  if (STILL) return true;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  var M = window.NB_MOTION;
  return !!(M && M.reduced);
}

var BASKET_KEY = 'nb-basket-v1';

var boundRoot = null;
var handlers = null;
var items = [];             // the 12 [data-offer] <li>, index-ordered
var basket = [];            // offering ids, in add order

/* the overlay, built once */
var overlay = null, panelEl = null, closeBtn = null, addBtn = null;
var numEl = null, nameEl = null, ownerEl = null, pkgBadge = null, sepBadge = null, upkeepBadge = null;
var trapKeydown = null;

var openIndex = -1;
var opener = null;          // element focus returns to on close
var savedScrollY = 0;
var closeTimer = 0;         // pending "finish closing" timer, so a fast re-open cannot race it

/* The overlay panel's exit transition (see css/act-offerings.css): 260ms is
 * its longest transitioning property. A little slack past that, not a
 * transitionend listener — opacity and transform finish at different times
 * and the first one to fire would hide the panel mid-flight on the other. */
var CLOSE_MS = 300;

/* the basket lives in #contact, not inside this act's root — the card is the
 * one department wired to reach outside its own subtree, by design (see the
 * brief: "the `.basket` block and the hidden `offerings` field"). */
var basketRoot = null, basketList = null, basketField = null;

/* --------------------------------------------------------------------- */

/** Idempotent — safe to call again with the same root (init() and the act's
 *  fallback() may both call this). `handlers` is refreshed every call so the
 *  no-op fallback set still takes effect even if the enhancement was already
 *  bound once. */
export function init(root, h) {
  handlers = h || {};
  if (!root) return;

  if (boundRoot !== root) {
    boundRoot = root;
    items = Array.prototype.slice.call(root.querySelectorAll('.offer[data-offer]'));
    items.sort(function (a, b) { return (+a.dataset.offer) - (+b.dataset.offer); });
    bindItems();
    buildOverlay(root);
  }

  bindBasketDom();
  loadBasket();
}

function findOffering(id) {
  for (var i = 0; i < OFFERINGS.length; i++) if (OFFERINGS[i].id === id) return OFFERINGS[i];
  return null;
}

/* --- the readable list ---------------------------------------------------- */

function bindItems() {
  items.forEach(function (item, i) {
    var link = item.querySelector('h3 a');
    if (link) {
      link.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!overlay) return;   // the enhancement did not build; a plain anchor beats a broken lightbox
        e.preventDefault();
        open(i);
      });
    }

    // A click anywhere else on the card also opens it — but never when it
    // lands on the link (already handled above) or the add button (its own
    // job), so a single click cannot fire two behaviours.
    item.addEventListener('click', function (e) {
      if (!overlay) return;
      if (e.target.closest('a')) return;
      if (e.target.closest('[data-add]')) return;
      open(i);
    });

    var addBtnInList = item.querySelector('[data-add]');
    if (addBtnInList) bindAddButton(addBtnInList);
  });
}

/* --- the overlay card ------------------------------------------------------
 * Same shape as js/panels.js on purpose: fixed positioning, a backdrop that
 * closes on click, a two-element focus trap, Escape closes, focus restores.
 * Built once and appended inside `root` — position: fixed escapes the
 * document flow regardless of ancestry, so this costs nothing in layout, and
 * it starts hidden, so its own insertion is never the shift the CLS gate
 * forbids. */
function buildOverlay(root) {
  overlay = document.createElement('div');
  overlay.className = 'offer-overlay';
  overlay.hidden = true;

  var backdrop = document.createElement('div');
  backdrop.className = 'offer-overlay__backdrop';
  backdrop.setAttribute('data-offer-close', '');

  panelEl = document.createElement('div');
  panelEl.className = 'offer-overlay__panel';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-modal', 'true');

  closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'offer-overlay__close';
  closeBtn.setAttribute('data-offer-close', '');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';

  numEl = document.createElement('p');
  numEl.className = 'offer-overlay__n';

  nameEl = document.createElement('h3');
  nameEl.className = 'offer-overlay__name';
  nameEl.id = 'offer-overlay-name';
  panelEl.setAttribute('aria-labelledby', nameEl.id);

  ownerEl = document.createElement('p');
  ownerEl.className = 'offer-overlay__owner';

  var meta = document.createElement('p');
  meta.className = 'offer-overlay__meta';

  pkgBadge = document.createElement('span');
  pkgBadge.className = 'offer__pkg';
  pkgBadge.hidden = true;

  sepBadge = document.createElement('span');
  sepBadge.className = 'offer__sep';
  sepBadge.setAttribute('aria-hidden', 'true');
  sepBadge.textContent = '·';
  sepBadge.hidden = true;

  upkeepBadge = document.createElement('span');
  upkeepBadge.className = 'offer__upkeep';
  upkeepBadge.hidden = true;

  meta.appendChild(pkgBadge);
  meta.appendChild(document.createTextNode(' '));
  meta.appendChild(sepBadge);
  meta.appendChild(document.createTextNode(' '));
  meta.appendChild(upkeepBadge);

  addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn offer-overlay__add';
  addBtn.textContent = OFFER_COPY.addLabel;
  addBtn.addEventListener('click', function () {
    if (openIndex === -1) return;
    var offer = OFFERINGS[openIndex];
    if (!offer) return;
    toggleAdd(offer.id, offer.name, addBtn);
  });

  panelEl.appendChild(closeBtn);
  panelEl.appendChild(numEl);
  panelEl.appendChild(nameEl);
  panelEl.appendChild(ownerEl);
  panelEl.appendChild(meta);
  panelEl.appendChild(addBtn);

  overlay.appendChild(backdrop);
  overlay.appendChild(panelEl);
  root.appendChild(overlay);

  overlay.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-offer-close')) close();
  });

  trapKeydown = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var focusables = [closeBtn, addBtn];
    var i = focusables.indexOf(document.activeElement);
    if (e.shiftKey) {
      if (i <= 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
    } else if (i === focusables.length - 1 || i === -1) {
      e.preventDefault(); focusables[0].focus();
    }
  };
}

function fillCard(offer) {
  numEl.textContent = offer.n;
  nameEl.textContent = offer.name;
  ownerEl.textContent = offer.owner;

  if (offer.package) {
    pkgBadge.textContent = offer.package;
    pkgBadge.classList.remove('offer__pkg--addon');
    pkgBadge.hidden = false;
  } else if (offer.addOn) {
    pkgBadge.textContent = offer.addOn;
    pkgBadge.classList.add('offer__pkg--addon');
    pkgBadge.hidden = false;
  } else {
    pkgBadge.hidden = true;
  }

  if (offer.upkeep) {
    upkeepBadge.textContent = 'kept running by ' + offer.upkeep;
    upkeepBadge.hidden = false;
    sepBadge.hidden = false;
  } else {
    upkeepBadge.hidden = true;
    sepBadge.hidden = true;
  }

  addBtn.setAttribute('data-add', offer.id);
  addBtn.setAttribute('data-name', offer.name);
  setButtonState(addBtn, basket.indexOf(offer.id) !== -1);
}

/** Open offering `index`. Locks scroll, tells the physics module to glide
 *  that panel to centre-front, shows the card, and traps focus inside it.
 *  Deliberately does NOT call NB_STAGE.pause() — js/panels.js does that for
 *  its iframe and is right to; here it would freeze the very glide-to-centre
 *  animation this call is opening in order to watch. */
export function open(index) {
  if (!overlay || openIndex !== -1) return;
  var item = items[index];
  var offer = OFFERINGS[index];
  if (!item || !offer) return;

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
  overlay.removeAttribute('data-closing');

  openIndex = index;
  opener = (item.querySelector('h3 a')) || item;

  savedScrollY = window.scrollY;
  document.documentElement.style.overflow = 'hidden';

  fillCard(offer);

  overlay.hidden = false;
  if (reduced()) {
    overlay.setAttribute('data-open', 'true');
  } else {
    // The card should feel like it BECOMES the panel, not that a dialog
    // appeared over it — so before the open state lands, tell the panel
    // where the clicked card is. offsetWidth/offsetHeight are the panel's
    // real, untransformed footprint (unlike getBoundingClientRect, which
    // would read whatever transform this very calculation is about to set),
    // so the ratio against the card's rect is a true "how much smaller was
    // the card" scale, not a guess.
    void overlay.offsetWidth;
    var r = item.getBoundingClientRect();
    var pw = panelEl.offsetWidth || r.width || 1;
    var ph = panelEl.offsetHeight || r.height || 1;
    var scale = Math.min(1, Math.max(0.22, Math.min(r.width / pw, r.height / ph)));
    panelEl.style.setProperty('--card-ox', ((r.left + r.width / 2) - window.innerWidth / 2).toFixed(1) + 'px');
    panelEl.style.setProperty('--card-oy', ((r.top + r.height / 2) - window.innerHeight / 2).toFixed(1) + 'px');
    panelEl.style.setProperty('--card-scale', scale.toFixed(3));
    // Force layout again before the open state lands, so the very first open
    // on the page has a starting frame — at the card's position — to
    // transition from.
    void overlay.offsetWidth;
    overlay.setAttribute('data-open', 'true');
  }

  if (handlers && typeof handlers.onOpen === 'function') {
    try { handlers.onOpen(index); } catch (e) { /* the card must open even if the wall can't */ }
  }

  document.addEventListener('keydown', trapKeydown, true);
  closeBtn.focus();
}

/** Reverse of open(): tell physics to release the panel, hide the card,
 *  write back the exact scrollY read on open (overflow: hidden can reset a
 *  scroll position on some browsers; skipping this restore would mean the
 *  Stage re-enters readProgress() at a different value and every act's
 *  window gets re-evaluated mid-frame), and return focus to the opener. */
export function close() {
  if (openIndex === -1) return;
  overlay.removeAttribute('data-open');

  if (handlers && typeof handlers.onClose === 'function') {
    try { handlers.onClose(); } catch (e) {}
  }

  document.removeEventListener('keydown', trapKeydown, true);

  document.documentElement.style.overflow = '';
  window.scrollTo(0, savedScrollY);

  var toFocus = opener;
  openIndex = -1;
  opener = null;
  if (toFocus && typeof toFocus.focus === 'function') toFocus.focus();

  // Departing is faster than arriving, but it is not instant: hide only once
  // the panel has actually finished travelling back toward the card, so the
  // close reads as the same relationship in reverse rather than a snap-cut.
  if (closeTimer) clearTimeout(closeTimer);
  if (reduced()) {
    overlay.hidden = true;
  } else {
    closeTimer = setTimeout(function () {
      overlay.hidden = true;
      closeTimer = 0;
    }, CLOSE_MS);
  }
}

/** Called by the act whenever the physics centre changes. Not needed to
 *  drive the DOM card (scroll is locked whenever one is open, so the centre
 *  cannot change mid-open) — used only to mark the corresponding list item
 *  for anyone who wants to style "currently centred" without moving anything. */
export function setCentre(index) {
  for (var i = 0; i < items.length; i++) {
    if (i === index) items[i].setAttribute('data-centre', 'true');
    else items[i].removeAttribute('data-centre');
  }
}

/** DOM state, not a GL resource — deliberately not called from the act's own
 *  dispose(), which lets the readable list and the basket keep working while
 *  the act is scrolled out and torn down. Exposed for completeness. */
export function dispose() {
  if (openIndex !== -1) close();
  boundRoot = null;
}

/* --- add to my project / the basket ---------------------------------------
 * Appends to the visible chip list AND the hidden `offerings` field in the
 * #contact form; persists across a reload via localStorage, wrapped in
 * try/catch because a private window throws on both getItem and setItem and
 * a thrown accessor must never take the section down.
 *
 * Layout: the basket box is reserved at a fixed footprint from first paint
 * in css/act-offerings.css — un-hiding it and filling it only ever changes
 * its opacity, never its height, which is the whole CLS mechanism here. */
function bindAddButton(btn) {
  btn.addEventListener('click', function () {
    var id = btn.getAttribute('data-add');
    var name = btn.getAttribute('data-name') || id;
    if (!id) return;
    toggleAdd(id, name, btn);
  });
}

function bindBasketDom() {
  basketRoot = document.querySelector('[data-basket]');
  basketList = document.querySelector('[data-basket-list]');
  basketField = document.querySelector('[data-basket-field]');
}

function toggleAdd(id, name, originEl) {
  var idx = basket.indexOf(id);
  var adding = idx === -1;
  if (adding) basket.push(id);
  else basket.splice(idx, 1);
  saveBasket();
  renderBasket(adding ? id : null);
  syncButtons();
  if (adding && originEl) flyToBasket(originEl, name);
}

/** The "travelled from the card" cue for an add: a small ghost pill flies,
 *  in position: fixed (out of flow — cannot touch layout or the CLS gate),
 *  from the button that was pressed to roughly where the new chip landed.
 *  Skips itself entirely under reduced motion, and never blocks the real
 *  chip render above, which has already happened by the time this runs. */
function flyToBasket(originEl, name) {
  if (reduced()) return;
  if (!basketRoot || !basketList || basketRoot.hidden) return;
  if (typeof originEl.getBoundingClientRect !== 'function') return;

  var fromRect = originEl.getBoundingClientRect();
  var landing = basketList.lastElementChild || basketList;
  var toRect = landing.getBoundingClientRect();
  if (!fromRect.width || !toRect.width) return;

  var ghost = document.createElement('span');
  ghost.className = 'basket-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = name;
  ghost.style.left = fromRect.left + 'px';
  ghost.style.top = fromRect.top + 'px';
  ghost.style.width = fromRect.width + 'px';
  ghost.style.height = fromRect.height + 'px';
  document.body.appendChild(ghost);

  var dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
  var dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
  ghost.style.setProperty('--fly-dx', dx.toFixed(1) + 'px');
  ghost.style.setProperty('--fly-dy', dy.toFixed(1) + 'px');

  void ghost.offsetWidth;
  ghost.setAttribute('data-fly', 'true');

  var remove = function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };
  ghost.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 700); // safety net if a transitionend never fires
}

function setButtonState(btn, added) {
  btn.setAttribute('aria-pressed', added ? 'true' : 'false');
  btn.textContent = added ? OFFER_COPY.addedLabel : OFFER_COPY.addLabel;
  btn.classList.toggle('is-added', added);
}

function syncButtons() {
  var all = document.querySelectorAll('[data-add]');
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    setButtonState(b, basket.indexOf(b.getAttribute('data-add')) !== -1);
  }
}

/** Rebuilds the chip list. `justAddedId`, when given, marks that one chip
 *  (only) as entering, so it plays the arrival transition in
 *  css/act-offerings.css while every chip that already existed is recreated
 *  already-settled and does not replay an arrival it already had. */
function renderBasket(justAddedId) {
  if (!basketRoot || !basketList || !basketField) return;

  basketList.innerHTML = '';

  if (basket.length === 0) {
    // Only shown once the basket has ever been revealed — a box that has
    // never been un-hidden stays exactly that: hidden, reserved, invisible.
    if (!basketRoot.hidden) {
      var empty = document.createElement('li');
      empty.className = 'basket__empty';
      empty.textContent = OFFER_COPY.cartEmpty;
      basketList.appendChild(empty);
    }
  } else {
    if (basketRoot.hidden) basketRoot.hidden = false;
    var entering = null;
    for (var i = 0; i < basket.length; i++) {
      var li = basketItem(basket[i]);
      if (justAddedId && basket[i] === justAddedId && !reduced()) {
        li.classList.add('basket__item--enter');
        entering = li;
      }
      basketList.appendChild(li);
    }
    if (entering) {
      // Forced reflow, then release the "--enter" class next frame so the
      // browser has actually committed the pre-arrival frame to paint before
      // the transition in css/act-offerings.css has anything to animate from.
      void entering.offsetWidth;
      requestAnimationFrame(function () { entering.classList.remove('basket__item--enter'); });
    }
  }

  basketField.value = basket.join(',');
}

function basketItem(id) {
  var offer = findOffering(id);
  var name = offer ? offer.name : id;

  var li = document.createElement('li');
  li.className = 'basket__item';
  li.setAttribute('data-basket-item', id);

  var label = document.createElement('span');
  label.className = 'basket__label';
  label.textContent = name;

  var remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'basket__remove';
  remove.setAttribute('aria-label', 'Remove ' + name);
  remove.textContent = '×';
  remove.addEventListener('click', function () { toggleAdd(id, name); });

  li.appendChild(label);
  li.appendChild(remove);
  return li;
}

function saveBasket() {
  try { localStorage.setItem(BASKET_KEY, JSON.stringify(basket)); } catch (e) { /* private window */ }
}

function loadBasket() {
  try {
    var raw = localStorage.getItem(BASKET_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    basket = Array.isArray(parsed) ? parsed.filter(function (id) { return !!findOffering(id); }) : [];
  } catch (e) {
    basket = [];
  }
  renderBasket();
  syncButtons();
}

export default { init: init, open: open, close: close, setCentre: setCentre, dispose: dispose };
