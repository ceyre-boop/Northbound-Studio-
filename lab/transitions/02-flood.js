/* 02 — FLOOD, the part that has to be JavaScript.
 *
 * The circle opens at the pixel they pressed, and that pixel was on the
 * previous document — so the coordinates ride across in sessionStorage and
 * are written onto the incoming root before its first frame.
 */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function store(x, y) {
    try { sessionStorage.setItem('nb-x', x); sessionStorage.setItem('nb-y', y); } catch (err) {}
  }
  addEventListener('pointerdown', function (e) { store(e.clientX, e.clientY); }, true);

  function apply() {
    var x = innerWidth / 2, y = innerHeight / 2;
    try {
      x = Number(sessionStorage.getItem('nb-x')) || x;
      y = Number(sessionStorage.getItem('nb-y')) || y;
    } catch (err) {}
    document.documentElement.style.setProperty('--nb-x', x + 'px');
    document.documentElement.style.setProperty('--nb-y', y + 'px');
  }
  addEventListener('pagereveal', function (e) { if (e.viewTransition) apply(); });
  apply();
})();
