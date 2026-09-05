# Pass 1 — QA notes

Screenshots: every floor at 1280×800 and 390×844, captured with
`bun qa/pass1/capture.mjs` against a local serve of this branch.

## Verified

| Check | Result |
|---|---|
| Playwright, 40 tests, 4 projects (1280×800, 390×844, reduced motion, headed Chrome) | 39 passed, 1 skipped (tilt on touch), 0 failed |
| Floors 01→07 by wheel, keyboard and nav arrow | one gesture per floor, landing square on each boundary; no wrap at either end |
| CSS scroll-snap engaged on the document scroller | verified in real headed Chrome; headless does not run the snap engine at all |
| BUDDY vs every glyph rect, all 7 floors, both sizes | no intersection |
| Lighthouse mobile performance (gzip, as Pages serves) | **93** (was 64 on this branch, 66 on `main`) |
| Demo routes `/demos/{atlas,vector,halo}/` | all 200 |

Lighthouse detail: FCP 2.3s, LCP 2.8s, TBT 30ms, CLS 0.027, SI 2.3s.
Measured with compression enabled locally — GitHub Pages gzips text assets and
the stdlib server does not, so an uncompressed local run understates the real
deploy by roughly 10 points.

## Things that look off — not fixed in this pass

1. **Floor 02 on a short window (≤780px tall) is ~90px taller than the screen**,
   and Floors 04 and 06 overflow by ~55px and ~32px. They scroll natively and
   snap at their edges, which is correct, but they are not one screen on a
   short laptop window. Fixing it properly means cutting content, not padding.
2. **The helix cable draws over content on every floor.** Most obvious on
   Floor 06, where it crosses the three cards, and Floor 07, where it runs
   through the headline and subhead. Pre-existing, and Pass 3 owns the cable,
   so it is deliberately untouched.
3. **Floor 02 on mobile is ~1600px tall** — three stacked cards plus the header
   block. It scrolls natively and the swipe snaps at its edge, which is correct
   behaviour, but it is the one floor that is not a "floor" on a phone.
4. **BUDDY's avatar overlaps the Vector card's skeleton poster on mobile
   Floor 02.** The overlap assertion passes because it covers a placeholder
   block, not text, but it looks incidental rather than designed.
5. **The bubble is avatar-only below 900px wide.** Deliberate — no corner on a
   390px screen fits a 340px bubble beside 340px of copy — but it means BUDDY
   says nothing on a phone unless tapped.
6. **The Floor 02 cards are concept builds for invented businesses**, labelled
   as such on every card. No result, metric or client name on that floor
   describes something that happened. The demo routes are holding pages until
   the Pass 2 builds land.
7. **`og:url` still points at `ceyre-boop.github.io`**, not
   `northbound-dev.com`, and there is no `og:image`. Out of scope here, worth
   a line in Pass 2.
