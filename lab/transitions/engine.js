/* lab/transitions/engine.js — the twenty lines every candidate transition
 * shares. Injected alongside one candidate stylesheet; the stylesheet is the
 * whole difference between them.
 *
 * Cross-document View Transitions were the first attempt and are the right
 * answer on paper: no JavaScript, the browser does the snapshotting. In
 * practice the incoming document kept declining the handshake — pagereveal
 * fired with no viewTransition — so every recording was a plain navigation
 * with nothing to look at. This does it the way that works everywhere
 * instead: animate the page we are on, start loading the next one before the
 * animation ends, and let the next one animate itself in.
 *
 * Three things it will not do:
 *   - It never blocks the click. The href is followed at 85% of the
 *     departure, and if anything throws, immediately. A transition that
 *     costs us a sale is not a transition, it is a bug.
 *   - Under prefers-reduced-motion it does nothing at all. The link is a
 *     link.
 *   - It prefetches the destination on hover, so the page is usually already
 *     in cache by the time the animation ends and the arrival is instant.
 *
 * The candidate stylesheet sets --nb-leave-ms, --nb-arrive-ms and optionally
 * --nb-veil-cells, then styles .nb-veil, html.nb-leaving and
 * html.nb-arriving. Nothing else is shared.
 */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var root = document.documentElement;
  var LINKS = 'a[href^="checkout.html"], a[href^="/checkout.html"]';

  function ms(name, fallback) {
    var v = getComputedStyle(root).getPropertyValue(name).trim();
    var n = parseFloat(v);
    return isNaN(n) ? fallback : n;
  }

  /* Arrival: the destination announces itself, then gets out of the way so
     nothing on the page is left in a transformed state. */
  if (sessionStorage.getItem('nb-transit') === '1') {
    sessionStorage.removeItem('nb-transit');
    var x = sessionStorage.getItem('nb-x');
    var y = sessionStorage.getItem('nb-y');
    if (x) root.style.setProperty('--nb-x', x + 'px');
    if (y) root.style.setProperty('--nb-y', y + 'px');
    root.classList.add('nb-arriving');
    setTimeout(function () { root.classList.remove('nb-arriving'); }, ms('--nb-arrive-ms', 700) + 120);
  }

  var prefetched = {};
  function warm(href) {
    if (prefetched[href]) return;
    prefetched[href] = 1;
    var l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = href;
    document.head.appendChild(l);
  }

  var going = false;

  document.addEventListener('pointerover', function (e) {
    var a = e.target.closest && e.target.closest(LINKS);
    if (a) warm(a.href);
  }, true);

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest(LINKS);
    if (!a || going) return;

    e.preventDefault();
    going = true;

    /* Where the click landed, for the candidates that open from it. */
    var r = a.getBoundingClientRect();
    var px = e.clientX || r.left + r.width / 2;
    var py = e.clientY || r.top + r.height / 2;
    root.style.setProperty('--nb-x', px + 'px');
    root.style.setProperty('--nb-y', py + 'px');
    try {
      sessionStorage.setItem('nb-transit', '1');
      sessionStorage.setItem('nb-x', px);
      sessionStorage.setItem('nb-y', py);
    } catch (err) {}

    var veil = document.createElement('div');
    veil.className = 'nb-veil';
    veil.setAttribute('aria-hidden', 'true');
    /* Some candidates are made of parts — twelve bands, a grid of tiles —
       and say how many they want in --nb-veil-cells. */
    var cells = ms('--nb-veil-cells', 0);
    for (var i = 0; i < cells; i++) veil.appendChild(document.createElement('i'));
    /* On <html>, not <body>: the departure animates a transform on body, and
       a transformed element becomes the containing block for its fixed-
       position children — the veil then sized itself to the whole 4800px
       document and opened its circle somewhere off-screen. */
    root.appendChild(veil);
    root.classList.add('nb-leaving');

    var leave = ms('--nb-leave-ms', 520);
    setTimeout(function () { location.href = a.href; }, leave * 0.85);
    setTimeout(function () { location.href = a.href; }, leave + 600); // belt and braces
  }, true);
})();
