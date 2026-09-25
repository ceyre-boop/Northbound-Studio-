/* lab/scroll/05-type.js — the one thing 05 cannot do in CSS.
 *
 * A heading is a text node, and a text node cannot be transformed. This
 * wraps each word of the three headings that take part — the hero's h1,
 * "Twelve things" and "Three ways in." — in a span carrying its index, so
 * 05-type.css can move them one at a time. Words, not letters: a span round
 * a letter breaks the kerning on either side of it, which moves every glyph
 * after it by a fraction of a pixel, and that is a layout shift. A span
 * round a word keeps every kerning pair inside the word and only touches
 * the boundary with the space, which the two display faces do not kern.
 *
 * The whitespace between words is left as the text nodes it was, outside
 * the spans, so line breaking is unchanged. It runs once, after the fonts
 * are in, and does nothing under reduced motion or where scroll-driven
 * animations are not supported — there the spans would only be noise in
 * the accessibility tree. Screen readers read a heading made of
 * inline-block spans as one string, as they do any inline run.
 *
 * After the fonts, not at DOMContentLoaded. Measured with Syne loaded, the
 * wrapped heading is identical to the unwrapped one to the pixel at 1280
 * and at 390. Measured during the half-second the fallback face is showing,
 * it is not — the fallback's metrics plus inline-block put "in." on a
 * different line — and when the wrap raced the font it was recorded as a
 * 0.038 layout shift at 1280 one run in three. Waiting for fonts.ready
 * costs nothing visible, because the scroll that starts the transition is
 * later than that anyway.
 */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!(window.CSS && CSS.supports('animation-timeline', 'view()'))) return;

  function wrap(h) {
    if (!h || h.querySelector('.nb-w')) return;
    var text = h.textContent;
    var frag = document.createDocumentFragment();
    var re = /(\S+)|(\s+)/g;
    var m, i = 0;
    while ((m = re.exec(text))) {
      if (m[1]) {
        var s = document.createElement('span');
        s.className = 'nb-w';
        s.style.setProperty('--i', String(i++));
        s.textContent = m[1];
        frag.appendChild(s);
      } else {
        frag.appendChild(document.createTextNode(m[2]));
      }
    }
    h.textContent = '';
    h.appendChild(frag);
  }

  function run() {
    wrap(document.querySelector('.hero h1'));
    wrap(document.querySelector('#offerings h2'));
    wrap(document.querySelector('#packages h2'));
  }
  function ready() {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run, run);
    else run();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
