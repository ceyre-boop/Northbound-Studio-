# home-swap-v1 — status and remaining step

## Done (all committed on branch `home-swap-v1`, rebased cleanly onto latest origin/main @ 5832bc8)

1. Swap: `index.html` (WebGL) → `studio.html`, `clean.html` → `index.html`. Canonical/og
   updated on both, `noindex` removed from the new homepage, footer/nav cross-links added.
2. `checkout.html`: links repointed to `/` and `/#packages`; copy fixed to stop promising
   Stripe ("Place order" / secure payment link within the business hour / no card details
   entered on this site).
3. `api/checkout.ts` — order capture modelled on `api/quote.ts`: server-side price table
   (clean 60000¢, care 4900¢/mo, bearing 60000¢/mo), honeypot, studio + customer emails,
   JSON/form response split, 303 → `/order-received.html`.
4. `order-received.html` — same visual language as checkout.html, honest "nothing charged
   yet" copy, phone number, account link for adding/dropping plans.
5. Repointed every WebGL spec (`acts`, `stage`, `offerings`, `motion`, `polish`, `budget`,
   `perf`, and the newly-arrived `reveal.spec.ts` from origin) at `/studio.html`, including
   `PERF_URL` defaults in `motion.spec.ts` / `perf.spec.ts`.
6. `scripts/ship.ts` — added a separate `PERF_URL` (`.../studio.html`) used only by the
   re-measure step; `data/release.json` poll and the artifact/release fetch in `verify()`
   stay at the site root. `codeCommit()` now tracks `js css studio.html`.
7. `scripts/perf.mjs` — default URL and the `codeCommit` git-log path both now point at
   `studio.html`.
8. `tests/budget.spec.ts` — the "measurement is newer than the rendering code" git-log path
   and the "proof block" HTML read both repointed from `index.html` to `studio.html` (this
   spec's own drift-vs-Stripe gate is still the known by-design failure at run time, per
   the task brief).
9. `tests/home.spec.ts` — new spec for the homepage: three prices, Bearing not a card but
   reachable, header/footer tel link, Buy it now → checkout.html, checkout add-ons/total
   (including the $1,249.00 both-ticked case), no h-scroll at 390px, zero console errors,
   full no-JS operation, checkout posts with JS off.
10. Rebased onto `5832bc8` (origin's veil/Buddy-return commit, `js/boot.js` +
    `tests/reveal.spec.ts`): resolved the `index.html` conflict by taking the clean
    homepage content for `index.html` and rebuilding `studio.html` from origin's updated
    WebGL page + my link edits, so `js/boot.js`/hero-tag stay on `studio.html` only.

## Blocking problem found mid-verification

Two `bunx playwright test` invocations ended up running **concurrently** against the same
`localhost:8099` dev server (my first full-suite run didn't actually finish/exit within its
foreground timeout window and silently continued in the background while I started a
second one to check progress). That contention is very likely why the in-progress log shows
implausible failures — several acts/motion tests timing out at exactly 3 minutes, which is
not consistent with a real regression from this diff. Process list at the time of writing:

- PID 29208 — first `playwright test` run (writing to
  `.../scratchpad/full-test-run.log`)
- PID 30136 — second `playwright test` run (started to check on the first)
- PID 53113 — a `pgrep`-based wait loop for either process to exit

## Next step (needs a clean shell, not plan mode)

1. Kill both stray `playwright test` processes and the wait loop.
2. Confirm nothing is holding port 8099 (`lsof -i :8099`), then run `bunx playwright test`
   **once**, uncontended, and let it finish.
3. Read the final summary. Expect all green except the known-by-design
   `budget.spec.ts` "the published number still matches a fresh measurement" (skipped, no
   `PERF_URL` set locally) and "the measurement is newer than the rendering code" (fails
   because `data/perf-budget.json` predates this branch's `studio.html` edits — this is the
   same pre-existing, by-design drift failure called out in the task brief, now correctly
   pointed at `studio.html` instead of `index.html`).
4. If anything else is red, it's a real regression from the swap and needs a real fix, not
   a re-run.
5. Then do the manual Playwright walk (home → checkout → tick both add-ons → $1,249.00 →
   place order with a test email, asserted, not POSTed to the live endpoint → order-received),
   screenshots at the sizes in the brief, and the unit test of `api/checkout.ts` pricing +
   honeypot with a mocked `fetch`, then final report.
