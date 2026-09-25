/* 01 — MORPH, the part that has to be JavaScript.
 *
 * A view-transition-name has to be unique in the document, so only the card
 * that was actually clicked can wear one. This marks that card's title and
 * its button on the way out, and marks the checkout's headline and total row
 * on the way in, which is what makes those two things travel between the two
 * documents instead of cross-fading with everything else.
 *
 * Classic script, not a module: it has to be running before the navigation
 * starts, and a deferred module is not.
 */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  addEventListener('pointerdown', function (e) {
    var link = e.target.closest && e.target.closest('a[href^="checkout.html"]');
    if (!link) return;
    var card = link.closest('.pkg');
    if (card) {
      var title = card.querySelector('h3');
      if (title) title.style.viewTransitionName = 'nb-title';
    }
    link.style.viewTransitionName = 'nb-cta';
  }, true);

  addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var h1 = document.querySelector('main h1');
    if (h1) h1.style.viewTransitionName = 'nb-title';
    var total = document.querySelector('.row.total') || document.querySelector('#total');
    if (total) total.style.viewTransitionName = 'nb-cta';
  });
})();
