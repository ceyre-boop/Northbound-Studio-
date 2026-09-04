# Pass 1 — Bugs + a real Work floor

## Context

`northbound-dev.com` is a 7-floor "descent": one static `index.html` whose whole app is an
inline `class Component extends DCLogic` (the `support.js` runtime), rendering against the
`_ds_bundle.js` design system. Floors are plain `<section min-height:100vh>` elements in
normal document flow; floor state is derived in `onScroll` from which section top has crossed
45vh.

The site converts badly for two reasons this pass fixes. **It has no portfolio** — Floor 02
("The Work") is three lines of copy and no evidence, so a visitor is asked to trust a $1,500
quote having seen nothing built. And **the descent doesn't behave like a descent** — the
metaphor promises floors, but the wheel free-scrolls through ~700px of empty space between
them, so the one interaction that sells the concept is missing.

### What is already live (verified against https://northbound-dev.com/, matches `main` @ `18a28d0`)

Commits `cd3284f` and `18a28d0` already shipped part of the brief. **Do not redo these:**

- **D copy** — "…up within 48 hours of kickoff, and we only take 2–3 projects a month…" (`index.html:151`)
- **E copy** — "From $1,500. Fixed price, quoted before we start…" (`index.html:167`)
- **C option labels** — "An online store" / "Something with motion or 3D" (`index.html:215,217`)
- **C heading** — "Pick a starting point. We build from here, not a template." (`index.html:190`)
- **A4** — nav `Work` and hero `See the work` both already `href="#floor-2"` (`index.html:53,107`)

### What I reproduced in the live browser

- **A2 is real.** There is no wheel/touch/key handler anywhere — only `window.addEventListener('scroll')`.
  Five wheel ticks moved the page 700px and left the readout on `01 · ARRIVAL`.
- **A3 is half real.** `goTo()` already clamps (`Math.max(0, Math.min(len-1, i))`); clicking `«` at
  `scrollY 0` does nothing and does **not** wrap — I could not reproduce a wrap, and there is no
  wrap path in the code. What *is* missing is the affordance: both arrows render identical cyan at
  both ends, so a dead click reads as a bug. Deliverable = the disabled state, not a clamp.
- **A1 is "fixed" by deletion.** `showBubble` is `… && f !== 5 && f !== 6` (`index.html:469`) — the
  bubble is *hidden entirely* on Floors 06 and 07. Nothing collides because BUDDY is gone from the
  two floors that close the sale. Restore it and clamp it, per the brief.

### Decision taken

Demo sites ship as **in-repo paths now, subdomains in Pass 2**. GitHub Pages allows one custom
domain per repo (`CNAME` = `northbound-dev.com`), so `atlas.`/`vector.`/`halo.` would need three
more repos plus three Squarespace DNS records — out of scope for Pass 1. Cards point at
`/demos/<name>/` through a single `DEMOS` map; Pass 2 flips the map's values to subdomain URLs
and nothing else changes.

---

## Constraints

- **`js/*.js` and `css/style.css` are dead code** — `index.html` loads only `support.js` and the
  `_ds` bundle. Do not edit or resurrect them.
- **Design tokens only.** Colors come from `_ds/.../tokens/colors.css` — `--accent #00f0ff`,
  `--accent-glow`, `--border`, `--bg-card`, `--radius-lg`, `--ease-expo`. Invent no new colors.
- **DC template facts** (from `support.js`): `sc-if`/`sc-for` are the control-flow tags; `EVENT_MAP`
  (`support.js:317`) supports `onMouseEnter`/`onMouseLeave`/`onKeyDown` etc., not just `onClick`;
  `style="{{ obj }}"` binds a JS object (already used by `bubbleStyle`); raw HTML tags including
  `<iframe>` pass straight through.
- **No new runtime deps.** Playwright only, dev-only, installed with **bun** (`bun add -d`), never npm.
- `node_modules/` must never reach Pages — add `.gitignore`. The workflow (`path: '.'`) is safe as-is
  because CI runs no install step.
- **This machine has macOS Reduce Motion ON** — `prefers-reduced-motion: reduce` matches locally, so
  the reduced-motion branch is what you'll see by default. Test the motion branch by emulating
  `reducedMotion: 'no-preference'` in Playwright, not by eyeballing locally.

---

## Work — one commit per section, branch `pass1-work-floor`

### 0. Scaffold

New `js/site-config.js`, loaded from `<head>` before the DC script, exposing `window.NB_CONFIG`:

```js
window.NB_CONFIG = {
  SPOTS_LEFT: 2,                    // null → "Taking 2–3 projects a month."
  DEMOS: { atlas: '/demos/atlas/', vector: '/demos/vector/', halo: '/demos/halo/' },
  CASES: [ /* name, business, result, tech, demo key */ ],
};
```

This is the one file F's "one-line update" and B's demo URLs both live in.

### 1. A1 — BUDDY bubble clamp

`index.html`, the two dock blocks (`:71-94`) and `renderVals` (`:456`).

- Delete the `f !== 5 && f !== 6` hide from `showBubble`; BUDDY returns to all seven floors.
- Add a measured clamp: on floor change and on resize, take the active section's lowest content
  bound (`getBoundingClientRect().bottom` of its last element child) and set
  `bubbleStyle.marginBottom` so the bubble sits above it, floored at the existing 20px.
- Reserve the zone so the clamp has room: add bottom padding to Floors 06 and 07 sized to the
  bubble box (~360×132 desktop).
- Fallback, not the primary path: if after clamping the bubble would still overlap, drop to
  avatar-only (today's behavior). Below 640px the bubble is avatar-only regardless.

### 2. A2 — wheel / touch / keyboard floor advance

New methods on `Component`, wired in `componentDidMount` and torn down in `componentWillUnmount`
(which already removes its three listeners — match that discipline).

- `this.navLock` timestamp; **700ms debounce**; every path routes through the existing `goTo()`.
- `wheel` — `{ passive: false }`, `preventDefault()`, threshold ~`|deltaY| > 12` to ignore trackpad
  micro-jitter. Bail out if `e.target.closest('input, select, textarea')`.
- `touchstart`/`touchend` — vertical swipe over ~50px.
- `keydown` — `ArrowUp`/`ArrowDown`/`PageUp`/`PageDown`/`Space` (`Shift+Space` = up); ignore when the
  target is a form field so Floor 07's form still types normally.
- **Reduced motion**: `goTo()` picks `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
  ? 'auto' : 'smooth'` — instant jump, no ride.

### 3. A3 — arrow disabled states

`renderVals` gains `atTop: f === 0` / `atEnd: f === this.labels.length - 1`. The `«`/`»` spans
(`:60,62`) bind `style="{{ prevArrowStyle }}"` / `{{ nextArrowStyle }}` — dimmed to
`var(--text-dim)` with `cursor:default; pointer-events:none` at the ends. Add `role="button"` and
`aria-disabled`. The clamp in `goTo()` already exists and stays.

### 4. A5 — deep links

`#floor-1 … #floor-7` ids already exist. Add: `history.replaceState` of the hash on every floor
change (in `onScroll`, only when `floor` actually changes, so history isn't spammed); a
`hashchange` listener calling `goTo`; and an on-mount read of `location.hash` to open directly on
a floor.

### 5. B — Floor 02 becomes the portfolio

Rebuild `index.html:123-143`. Keep the existing eyebrow and `h2`; replace the body.

- Three case cards in a horizontal rail (`grid-template-columns: repeat(3,1fr)` desktop, single
  column under 900px), driven by `NB_CONFIG.CASES` via `sc-for`.
- Each card: a device frame holding a **poster-first** preview — an inline SVG/CSS skeleton poster
  (no binary assets, no new deps) swapped for `<iframe loading="lazy" src=DEMOS[key]>` on
  `onMouseEnter` / first tap. The iframe is never in the initial DOM, which is what protects the
  Lighthouse number.
- Below the frame: business name, one-line result, mono tech line ("Astro · Stripe · 0.4s LCP"),
  and "Open site ↗".
- Hover: parallax tilt capped at **6°** (`onMouseMove` → `rotateX/rotateY`, reset on
  `onMouseLeave`) plus a cyan edge glow from `--glow-accent`. **Skip the tilt entirely under
  `prefers-reduced-motion`.**
- The three existing feature bullets move **below** the rail at reduced size.
- Placeholder demo pages at `demos/atlas/index.html`, `demos/vector/index.html`,
  `demos/halo/index.html` — token-styled "Coming in Pass 2" holding pages, not blank files.
- Comment in `site-config.js` recording the Pass 2 subdomain switch (three sibling repos with
  `CNAME` files + three Squarespace CNAME records).

### 6. C — Floor 06 reframe

- `labels[5]` `'TEMPLATES'` → `'DIRECTIONS'` (`:242`), `data-screen-label="06 Directions"` (`:187`),
  eyebrow `FLOOR 06 · CHOOSE YOUR STYLE` → `FLOOR 06 · DIRECTIONS` (`:189`).
- Each of Atlas/Vector/Halo gains a "See it built ↗" link to the matching Floor 02 case
  (`#floor-2` + a card id such as `#case-atlas`). Names and the heading are already correct.

### 7. D — Floor 03 live speed proof

`index.html:145-153`. Keep the `48 HRS` `Stat`; replace the supporting line.

- Read `performance.getEntriesByType('navigation')[0]`, take `loadEventEnd - startTime`, and
  count up to "This page loaded in 0.41s on your connection" (2 decimals) via the existing
  `requestAnimationFrame` tick loop rather than a new timer.
- Second bar labeled "Typical agency site" crawling to 3.8s, same token palette.
- **Fallback:** entry missing, zero, or `prefers-reduced-motion` → render the final numbers with
  no animation; API entirely absent → the current static copy, unchanged.

### 8. F — Floor 07

- Subhead reads from `NB_CONFIG.SPOTS_LEFT`: an integer renders "Two spots left this month."
  (number word-mapped), `null` renders "Taking 2–3 projects a month."
- `lines[6]` → "BUDDY, our intake assistant, replies within the hour. A human follows up the same day."
- `submitLabel` idle state `'SEND IT'` → **"Send project details"** (`:484`); sending/sent/error
  states keep their current wording.

### 9. Tests + QA

- `bun add -d @playwright/test`; `.gitignore` for `node_modules/`, `test-results/`,
  `playwright-report/`.
- `tests/descent.spec.ts` at **1280×800 and 390×844**:
  - floors 1→7 by wheel, by keyboard, and by nav `»`; readout and hash correct at each stop
  - `«` at Floor 01 and `»` at Floor 07 change nothing and are `aria-disabled`
  - **bounding-box assertion**: the bubble rect intersects no text node rect on any floor
  - reduced-motion project (`reducedMotion: 'reduce'`) asserts instant jumps and no tilt
- `bunx lighthouse` (ephemeral, not a repo dep) mobile run — **perf ≥ 90**. If lazy+poster doesn't
  hold it, the iframe becomes click-to-load rather than hover-to-load; report the real number
  either way.
- Screenshots of all 7 floors at both sizes → `qa/pass1/` (committed as evidence; note that Pages
  serves the whole repo, so they will be publicly reachable), plus a written list of anything off.

---

## Out of scope

R3F / cable / BUDDY 3D rewrite (Pass 3). No dependency beyond Playwright. No DNS changes.

## Verification

`git checkout pass1-work-floor && bunx playwright test` — green at both viewports, both motion
settings. Then `bunx lighthouse http://localhost:8000 --preset=desktop --form-factor=mobile` for
the perf number, and a Chrome pass over the deployed branch confirming the wheel descends one
floor per gesture, the arrows dim at both ends, the URL hash tracks the floor, and BUDDY's bubble
clears every headline on Floors 06 and 07. Report the actual command output, not "looks done".
