# The Narrative Layout — composition spec

Owns: the speed → price → support argument, and the contact finale.
Does not own: the hero, the work/case showcase, or `index.html` itself — this
is the spec the creative director builds those two sections from.

## The idea in three sentences

Speed, price and support stop being three equal boxes and become one argument
read top to bottom, alternating left and right of a single vertical thread of
light so the eye zig-zags across it the way an argument volleys point,
counterpoint, reassurance; each beat gets a different scale and a different
amount of air around it — a shout, a comparison, a whisper — so the rhythm
itself carries meaning instead of three identical paragraphs. The whisper
(support) is deliberately the smallest, quietest, most empty beat, so that
the finale — full-width, unbound by the 12-column argument grid, headline
alone in its own silence before the form ever appears — reads as arrival: the
one moment the page's light fully resolves, the visual echo of the mark
itself, a shard that only appears where light hits it.

## Section order and what dominates

1. **`[data-section="argument"]`** — three beats, alternating sides of a
   vertical thread, each a different scale:
   - **Beat 1, Speed** — dominates: the numeral `48`. Left of the thread,
     numeral set at `--text-6xl`, everything else quiet and small underneath
     it. Loudest, most confident beat — the argument's opening shout.
   - **Beat 2, Price** — dominates: the comparison itself, not either number
     alone. Right of the thread (opposite side from Speed — the zig-zag).
     `$5,000+` small and struck through at `--text-lg`, an arrow, then
     `$1,500` at `--text-5xl` (one step down from Speed's `48`, so Speed still
     reads as the loudest single beat on the page, Price as the reasoning).
   - **Beat 3, Support** — dominates: *emptiness*. Left of the thread again
     (settling), narrow column, the text-message exchange sitting alone with
     roughly two-thirds of the row's width held empty to its right. This is
     the quietest beat on the page on purpose — a text-you-when-it-breaks
     promise should feel like a whisper, not a stat.
2. **`[data-section="contact"]`** — the finale. Full width, breaks the
   12-column argument grid entirely (per the brief: grid is a tool, not a
   cage). Dominates: the headline `Let's build yours.` alone at `--text-6xl`
   in its own row with nothing beside it, THEN — after the single most
   aggressive negative-space gap on the page — the form arrives lower and to
   the right. A soft Ion glow (`--color-ion-soft`, radial, decorative,
   `aria-hidden`) sits behind the headline only: the one place on the page
   colour appears as light hitting a form, echoing the identity mark.

## Scale relationships (desktop)

`48` (`--text-6xl`) > `Let's build yours.` (`--text-6xl`, same ceiling, wins
on width instead of height because it's a full sentence, not two digits) >
`$1,500` (`--text-5xl`) > beat ledes (`--text-lg`) > body copy
(`--text-md`/`--text-base`) > eyebrows and the struck-through `$5,000+`
(`--text-xs`/`--text-lg` respectively) > chat bubbles (`--text-sm`, they are
overheard, not announced).

No custom sizes are invented — every size above is a named token from
`css/tokens.css`. Contrast comes from *which* tokens sit next to each other,
not from stretching the scale.

## Where negative space is used most aggressively

1. **Beside Beat 3 (Support).** On the 12-column argument grid, Support
   occupies columns 2–7; columns 7–13 are held empty. That's over half the
   row width left void beside a three-line text exchange — the single
   largest deliberate void on the page before the finale.
2. **Between the finale headline and the form.** The headline sits alone in
   grid row 1; the form wrapper shares row 1's column track but is pushed
   down with `margin-top: clamp(6rem, 10vw, 11rem)` before it appears. On a
   short viewport this collapses gracefully (it's a margin, not a fixed
   height) but never disappears below `--space-9` (96px) even at the
   smallest breakpoint tested (390×844) — there's always an arrival pause.

## The thread

A single 1px vertical rule (`.argument__thread`), Ion-tinted, gradient from
faint at the top of the Speed beat to `--color-ion-glow`-bright by the bottom
of the Support beat — the light gathering strength as the argument builds
toward the ask. It's a decorative `aria-hidden="true"` grid item spanning
`grid-row: 1 / -1` at the column boundary the three beats alternate around
(desktop only — see below). It never carries text, never becomes a border on
a real element, and its width is fixed (never percentage-based off content),
so it cannot cause CLS or overflow.

Below 768px there is no room for a real zig-zag, so the thread becomes a
plain 2px left border-image on the whole `.argument` wrapper — same gradient,
same idea, cheaper geometry. It is **not** the floor-nav rail or the deleted
spiral — it is 1–2px, it has no ticks, no labels, and it does not scroll-snap
anything.

## Markup contract

Semantic HTML, `[data-section]` on each top-level section for the motion
director's scroll-trigger wiring, `[data-reveal]` on every element that
should enter individually (fade + rise, per the existing convention in
`js/animations.js`). **`css/layout.css` never sets an initial hidden state
for `[data-reveal]`** — every element renders in its final, correct position
and full opacity with zero JS. The motion layer is additive: it may set
`opacity:0` + a Y offset *before* animating in, but that is its job, not
layout's — this is what keeps "CLS 0" and "no layout depends on JS to become
correct" both true at once.

```html
<!-- ============================================================
     THE ARGUMENT — speed / price / support, one continuous read
     ============================================================ -->
<section class="argument" data-section="argument" aria-labelledby="argument-heading">
  <h2 id="argument-heading" class="sr-only">Why founders choose Northbound</h2>

  <div class="argument__thread" aria-hidden="true"></div>

  <!-- BEAT 1 — SPEED. Loudest. Left of the thread. -->
  <article class="beat beat--speed">
    <p class="beat__eyebrow" data-reveal>01 — SPEED</p>
    <p class="beat__figure" data-reveal>
      <span class="beat__figure-num">48</span><span class="beat__figure-unit">HRS</span>
    </p>
    <h3 class="beat__lede" data-reveal><!-- CONTENT.speed.heading --></h3>
    <p class="beat__body" data-reveal><!-- CONTENT.speed.body --></p>
  </article>

  <!-- BEAT 2 — PRICE. The comparison is the point. Right of the thread. -->
  <article class="beat beat--price">
    <p class="beat__eyebrow" data-reveal>02 — PRICE</p>
    <p class="beat__compare" data-reveal>
      <span class="beat__was"><!-- literal: $5,000+ --></span>
      <span class="beat__arrow" aria-hidden="true">→</span>
      <span class="beat__now"><!-- literal: $1,500 --></span>
    </p>
    <h3 class="beat__lede" data-reveal><!-- CONTENT.price.heading --></h3>
    <p class="beat__body" data-reveal><!-- CONTENT.price.body --></p>
  </article>

  <!-- BEAT 3 — SUPPORT. Quietest. Narrow. Left of the thread, huge void beside it. -->
  <article class="beat beat--support">
    <p class="beat__eyebrow" data-reveal>03 — SUPPORT</p>
    <h3 class="beat__lede" data-reveal><!-- CONTENT.support.heading --></h3>
    <div class="beat__chat" role="group" aria-label="Example text exchange with Buddy">
      <!-- one .chat__bubble per CONTENT.support.exchange[i], modifier
           .chat__bubble--you or .chat__bubble--buddy from .from -->
      <p class="chat__bubble chat__bubble--you" data-reveal><!-- exchange[0].text --></p>
      <p class="chat__bubble chat__bubble--buddy" data-reveal><!-- exchange[1].text --></p>
      <p class="chat__bubble chat__bubble--buddy" data-reveal><!-- exchange[2].text --></p>
    </div>
    <p class="beat__body" data-reveal><!-- CONTENT.support.body --></p>
  </article>
</section>

<!-- ============================================================
     THE FINALE — contact. Arrival, not a footer form.
     ============================================================ -->
<section class="finale" data-section="contact" aria-labelledby="finale-heading">
  <div class="finale__glow" aria-hidden="true"></div>

  <div class="finale__inner">
    <div class="finale__intro">
      <p class="finale__eyebrow" data-reveal>04 — START HERE</p>
      <h2 id="finale-heading" class="finale__heading" data-reveal><!-- CONTENT.contact.heading --></h2>
      <!-- reserve the line box before JS fills it — zero CLS -->
      <p class="finale__spots" data-spots-line data-reveal></p>
      <p class="finale__body" data-reveal><!-- CONTENT.contact.body --></p>
    </div>

    <form class="finale__form" data-reveal aria-label="Start a project">
      <fieldset class="finale__options">
        <legend class="finale__options-legend">What are you building?</legend>
        <!-- one pair per CONTENT.contact.options[i] -->
        <div class="option">
          <input class="option__input" type="radio" name="project-type" id="opt-0" value="A new marketing site">
          <label class="option__label" for="opt-0">A new marketing site</label>
        </div>
        <div class="option">
          <input class="option__input" type="radio" name="project-type" id="opt-1" value="An online store">
          <label class="option__label" for="opt-1">An online store</label>
        </div>
        <div class="option">
          <input class="option__input" type="radio" name="project-type" id="opt-2" value="A rebuild of what I have">
          <label class="option__label" for="opt-2">A rebuild of what I have</label>
        </div>
        <div class="option">
          <input class="option__input" type="radio" name="project-type" id="opt-3" value="Something with motion or 3D">
          <label class="option__label" for="opt-3">Something with motion or 3D</label>
        </div>
      </fieldset>

      <div class="finale__field">
        <label class="finale__field-label" for="contact-email">Email</label>
        <input class="finale__field-input" type="email" id="contact-email" name="email" required autocomplete="email">
      </div>

      <div class="finale__field">
        <label class="finale__field-label" for="contact-message">A bit about what you sell</label>
        <textarea class="finale__field-input finale__field-input--area" id="contact-message" name="message" rows="3"></textarea>
      </div>

      <div class="finale__actions">
        <button class="finale__submit" type="submit"><!-- CONTENT.contact.submit --></button>
        <!-- aria-live so the success string never needs a layout jump -->
        <p class="finale__status" role="status" aria-live="polite"></p>
      </div>
    </form>
  </div>
</section>
```

## Notes for the director

- `.sr-only` is assumed to exist as a standard visually-hidden utility
  somewhere in the shared CSS; if it doesn't yet, one line
  (`position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;`)
  covers it — it isn't reinvented in `layout.css` since it's a cross-cutting
  utility, not narrative-layout's to own.
- `data-spots-line` is the hook `js/site-config.js`'s spots logic (referenced
  in `js/content.js`'s comment) fills at runtime. Its box has a reserved
  `min-height` in `layout.css` sized to one `--text-md` line so filling it in
  later never shifts anything below it.
- The four options are radios (single choice), styled as pill "chip" toggles
  using `--radius-pill` — the one radius token the system reserves for
  tag/badge-scale controls, which is exactly what these are.
- Every colour, size, space, radius and easing value used in `layout.css`
  is a named token from `css/tokens.css`. Nothing is hardcoded.
