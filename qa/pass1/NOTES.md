# Pass 1 — QA notes

Screenshots: every floor at 1280×800 and 390×844, captured with
`bun qa/pass1/capture.mjs` against a local serve of this branch.

## Verified

| Check | Result |
|---|---|
| Playwright, 39 tests, 3 projects (1280×800, 390×844, reduced motion) | 38 passed, 1 skipped (tilt on touch), 0 failed |
| Floors 01→07 by wheel, keyboard and nav arrow | one gesture per floor; no wrap at either end |
| BUDDY vs every glyph rect, all 7 floors, both sizes | no intersection |
| Lighthouse mobile performance (gzip, as Pages serves) | **93** (was 64 on this branch, 66 on `main`) |
| Demo routes `/demos/{atlas,vector,halo}/` | all 200 |

Lighthouse detail: FCP 2.3s, LCP 2.8s, TBT 30ms, CLS 0.027, SI 2.3s.
Measured with compression enabled locally — GitHub Pages gzips text assets and
the stdlib server does not, so an uncompressed local run understates the real
deploy by roughly 10 points.

## Things that look off — not fixed in this pass

1. **The helix cable draws over content on every floor.** Most obvious on
   Floor 06, where it crosses the three cards, and Floor 07, where it runs
   through the headline and subhead. Pre-existing, and Pass 3 owns the cable,
   so it is deliberately untouched.
2. **Floor 02 on mobile is 1613px tall** — three stacked cards plus the header
   block. It scrolls natively and the swipe snaps at its edge, which is correct
   behaviour, but it is the one floor that is not a "floor" on a phone.
3. **BUDDY's avatar overlaps the Vector card's skeleton poster on mobile
   Floor 02.** The overlap assertion passes because it covers a placeholder
   block, not text, but it looks incidental rather than designed.
4. **The bubble is avatar-only below 900px wide.** Deliberate — no corner on a
   390px screen fits a 340px bubble beside 340px of copy — but it means BUDDY
   says nothing on a phone unless tapped.
5. **The old full-size BUDDY PNGs are still in the repo** (1.9MB, unreferenced
   after the WebP swap). Harmless to visitors, dead weight in the repo.
6. **Case-study copy and metrics are placeholders.** Business names, results
   and tech lines land with the Pass 2 builds; the demo routes are holding
   pages.
7. **`og:url` still points at `ceyre-boop.github.io`**, not
   `northbound-dev.com`, and there is no `og:image`. Out of scope here, worth
   a line in Pass 2.
