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
var numEl = null, nameEl = null, ownerEl = null, pkgBadge = null, upkeepBadge = null;
var trapKeydown = null;

var openIndex = -1;
var opener = null;          // element focus returns to on close
var savedScrollY = 0;

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

  upkeepBadge = document.createElement('span');
  upkeepBadge.className = 'offer__upkeep';
  upkeepBadge.hidden = true;

  meta.appendChild(pkgBadge);
  meta.appendChild(upkeepBadge);

  addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn offer-overlay__add';
  addBtn.textContent = OFFER_COPY.addLabel;
  addBtn.addEventListener('click', function () {
    if (openIndex === -1) return;
    var offer = OFFERINGS[openIndex];
    if (!offer) return;
    toggleAdd(offer.id, offer.name);
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
  } else {
    upkeepBadge.hidden = true;
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

  openIndex = index;
  opener = (item.querySelector('h3 a')) || item;

  savedScrollY = window.scrollY;
  document.documentElement.style.overflow = 'hidden';

  fillCard(offer);

  overlay.hidden = false;
  if (reduced()) {
    overlay.setAttribute('data-open', 'true');
  } else {
    // Force layout before the open state lands, so the very first open on
    // the page has a starting frame to transition from.
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
  overlay.hidden = true;

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
    toggleAdd(id, name);
  });
}

function bindBasketDom() {
  basketRoot = document.querySelector('[data-basket]');
  basketList = document.querySelector('[data-basket-list]');
  basketField = document.querySelector('[data-basket-field]');
}

function toggleAdd(id, name) {
  var idx = basket.indexOf(id);
  if (idx === -1) basket.push(id);
  else basket.splice(idx, 1);
  saveBasket();
  renderBasket();
  syncButtons();
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

function renderBasket() {
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
    for (var i = 0; i < basket.length; i++) {
      basketList.appendChild(basketItem(basket[i]));
    }
    if (basketRoot.hidden) basketRoot.hidden = false;
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
