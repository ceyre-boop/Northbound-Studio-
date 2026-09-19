# sellable-v1 implementation — status and remaining steps

Plan Mode was activated mid-task, after most of the implementation and
verification work was already done and four commits already made on
`sellable-v1`. This file records exactly what is done, what is verified, and
the two small remaining steps, so execution can resume with approval.

## Done (already committed, in this order)

1. `f28...` "Rip out the mascot, the concept builds, drift and solution" —
   deleted all files in the plan's rip-out table and "Also cut" list
   (hero-tag.js/css, mascot.css, offerings/mascot.js, all buddy-* assets,
   panels.js, posters/, demos/ (both atlas and vector projects), proof.js,
   content.js, drift.js/solution.js and their shaders/CSS,
   data/perf-budget.json, tests/budget.spec.ts). Unhooked the mascot from
   js/acts/offerings.js (import, `arm`, fire()'s arm branch, mount, resize
   /update/draw/drawStill/dispose calls) while keeping `C.HOOKS`/
   `NB_OFFERINGS`. Moved the sitewide copy-reveal IntersectionObserver out of
   panels.js into new js/reveal.js before deleting panels.js. Trimmed
   cast.js to declare only `northlight` and `offerings`. Cleaned
   vercel.json (/demos headers+rewrites, perf-budget header) and
   .vercelignore (demos lines). Cleaned stale comment references to deleted
   files in js/offerings/card.js, contract.js, content.js.

2. `fc4...` "Reorder the page around the sale: hero, rail, packages, contact"
   — full index.html rewrite: hero copy (pitch line, credibility line
   verbatim, new CTAs), offerings rail unchanged except mascot mount
   removed, new plain-HTML/CSS packages section directly after the rail
   (`id="packages-h"`, no duplicate `offer-h`, Engine badged "Most pick
   this", each card's "Get a quote for <Name>" button/link with
   `data-package="<Name> package"`), contact section rewritten (see below),
   sticky CTA markup outside `<main>`, footer/noscript rewritten, skip link
   and nav point at `#offerings`. css/stage.css and css/act-offerings.css
   updated: work-card/proof/act--drift-ground/coarse-pointer work-card rules
   cut per the plan's line ranges, closing-proof/work-card/work-overlay
   rules cut from act-offerings.css, plus new rules for the no-GL rail
   override (`html[data-gl="off"] #offerings { min-height: auto }` as a
   separate rule, `#offerings{min-height:1000svh}` left untouched), the
   packages badge, the `.tel` phone treatment (coarse = button, fine =
   plain text), the honeypot, the form-status region, and the sticky CTA
   (mobile full-width bar + desktop pill, static body padding-bottom at the
   phone breakpoint, `env(safe-area-inset-bottom)`).

3. `66a...` "Contact form, sticky CTA and the basket-to-quote prefill" —
   one added line in `card.js`'s `renderBasket()` dispatching
   `nb:basket` with `{ids, names}`. New `js/quote.js` (classic, defer, IIFE):
   owns the sticky CTA's `data-state` (pre-scroll / hidden over #contact or
   the offer overlay / else visible), the What-you-need prefill from the
   basket (add/remove exactly the lines it owns, never touching visitor
   text) and from package buttons (`data-package`, added once, never
   removed, then focuses the name field if empty), and the fetch-submit
   (POST FormData to `/api/quote` with `Accept: application/json`, swaps
   the form for a confirmation on `{ok:true}`, shows the phone-fallback
   message and re-enables the button on failure).

4. `42f...` "Stage: fallback() after a failed boot, and gate the rail's
   import" — fixed the pre-existing bug where `fail()` runs before cast.js
   has declared any act on a real page load (a classic deferred script runs
   as soon as parsing finishes, before `document.readyState` reaches
   `"loading"`), so no act's `fallback()` ever ran and card.js's "Add to my
   project" buttons were dead with no WebGL. `declare()` now calls a new
   `fallbackNow()` when the Stage already knows GL is dead, importing the
   act's module directly (the frame loop that would normally do this never
   starts without a context) and then running its fallback(). `runFallback()`
   itself was fixed to key off `rec.manifest.id` instead of
   `rec.act.manifest.id`, since `rec.act` can be null on this path.
   Separately, added `armImportGate()`: with drift and solution gone the
   offerings rail's measured window now starts close enough to scroll 0 that
   its preload margin would begin compiling shaders before the hero's first
   paint, so the rail's `import()` is now gated behind window `load` + idle
   (~1500ms timeout) or the visitor's first scroll/touch, whichever comes
   first — declared via a `gateImport: true` flag on its manifest in
   cast.js, so every test that reads `NB_STAGE.debug().windows` immediately
   after load is unaffected (only the import is gated, not the declaration).

## Verified before Plan Mode activated

- `bunx playwright test tests/sellable.spec.ts` — all tests green across
  desktop / mobile / desktop-reduced (after fixing one test to use a
  scripted `.click()` on the DOM button when GL is running, matching the
  existing convention in tests/offerings.spec.ts, since the readable list is
  `pointer-events: none` while the canvas is live).
- `bunx playwright test tests/stage.spec.ts` — all green, after fixing a
  real regression in `tests/stage.spec.ts`'s "does not ratchet GL resources"
  test: with drift/solution removed the document is much shorter, so the
  same fixed-fraction scrub now carries the visitor past every offerings
  panel's centre position several times over in a single pass, and the
  rail's lazy per-frame program compilation (by design, in the frozen
  js/offerings/atlas.js, which this task must not edit) legitimately needs
  a few more full passes to reach its steady state than it used to. Fixed
  by warming up 6 passes before taking the "first" baseline sample instead
  of 1, so the test still catches genuine unbounded leaks without
  false-failing on one-time lazy compilation. Confirmed via a worktree of
  `main` that this test passes there unmodified — i.e., this is a real,
  isolated consequence of the required structural change, not a mistake
  elsewhere.
- `bunx playwright test tests/acts.spec.ts` and `tests/offerings.spec.ts` —
  all green (12 and 36 tests respectively).
- Full `bun run test` — 110 passed, 9 failed, all 9 failures in
  `tests/perf.spec.ts` (`ERR_NAME_NOT_RESOLVED` navigating to
  `https://northbound-dev.com/`, the production domain, which per the plan's
  own Context section is offline/`clientHold` right now). Confirmed this is
  pre-existing and unrelated to any change here: the same 9 tests fail
  identically on `main` before any of this work. `perf.spec.ts` needs
  `PERF_URL=<preview>` against a real deploy, which is explicitly the main
  thread's / a later step's responsibility per the plan's Verification
  section, not something fixable inside this repo.
- 390×844 screenshots taken (hero+CTAs, sticky bar after scroll, packages
  with the "Most pick this" badge and prices, and the full contact form) —
  all legible, tap-sized, and the sticky bar and packages/contact content
  do not overlap.

## Remaining steps (not yet done — Plan Mode stopped here)

1. **Commit 5 "tests"** — `git add tests/acts.spec.ts tests/stage.spec.ts
   tests/offerings.spec.ts tests/sellable.spec.ts` and commit. These are
   already edited/created and verified green on disk; only the commit
   itself remains.
2. **Commit 6 "README"** — `git add README.md` and commit. Already rewritten
   on disk per the plan's rule (every number on the page is a price we set
   or the phone number; architecture/deploy sections lose proof, demos,
   drift, solution, mascot, hero-tag; mentions `api/quote.ts` exists and is
   owned separately).
3. Re-run `bun run test` once more after these two commits, purely as a
   final confirmation nothing shifted (no code changes expected between now
   and then — commits only).
4. Deliver the final report (files changed, commit hashes, test summary,
   the one deviation — commit granularity on css/stage.css, see below) via
   SubagentHandback.

## One deviation from the requested commit granularity, already made

The plan asked for commits in the shape "rip-out → reorder/copy →
contact+sticky+quote.js → stage fixes → tests → README". `css/stage.css`
and `css/act-offerings.css` each carry both rip-out deletions (work-card,
proof, act--drift ground, coarse-pointer work-card rules) and new
reorder/copy-era additions (packages badge, phone, honeypot, sticky CTA,
form-status, no-GL rail override) in the same file. `git diff` on
`css/stage.css` produces one large hunk covering the tail of the file where
the cut and the new additions are directly adjacent with no unchanged
context line between them, so `git add -p` cannot split "the deletion" from
"the addition" within that hunk — there is nothing for git to hunk-split.
Given that, both files were committed as a whole in the "reorder/copy"
commit rather than split across "rip-out" and "reorder/copy". This was
called out rather than forced with a fragile partial-hunk workaround.

## Explicitly not touched (per the task boundary)

`api/quote.ts` and `thanks.html` — both appeared as untracked files in the
working tree during this session (the main thread's concurrent work) and
were never `git add`ed or referenced in any commit. `Plans/` was never
staged. No `git push`, no `vercel deploy`.
