# Northbound Studio — Anime Scroll Experience Revamp

## Context

Site-wide revamp of the Northbound Studio site (repo `ceyre-boop/Northbound-Studio-`, GitHub Pages via Actions workflow on push to `main`). The current "magnum opus" build (data-sphere Three.js hero, capability carousel, horizontal portfolio, packages grid) is replaced by the new 7-scene cinematic spec: anime hero → 3D double-helix scroll tunnel → particle "N" inflate/shatter → journey storytelling → template picker → apply form → footer. Goal: the site itself is the proof of premium positioning ($250 → $750+ tiers).

**Locked user decisions:**
- **Drop** `#portfolio`, `#capability`, `#packages`, and the `#boot` overlay (hero IS the intro). Footer loses "View our work".
- **Character art:** generate two ORIGINAL anime-style characters matching the reference image's poses/energy (left: white-haired confident guy in red coat, thumbs-up; right: brown-haired man in dark suit at desk, hand to temple). Original designs in that style — not reproductions of the copyrighted reference characters (Dante/Light). Site code ships fallback-first so it works before/without the PNGs.
- Keep the existing comet cursor (exceeds spec's dot+circle), Formspree endpoint `xpwzgvkn`, NB module architecture, and design tokens (already match spec exactly).

## File changes

| File | Action |
|---|---|
| `index.html` | Rewrite. New order: `.grain` → `.nav` → `#hero` → `#voyage` (scenes 2+3) → `#journey` → `#templates` → `#apply` → `#footer`. Nav links: Journey / Templates / Apply pill. Keep head/CDN block byte-identical (three r128 cdnjs + unpkg examples/js post-processing + GSAP 3.12.5 + Lenis 1.1.18). Script order: `cursor → form → templates → hero → helix → animations → app` |
| `css/style.css` | Heavy rewrite. KEEP: `:root` tokens, base/type, `.btn`, `.grain`, `.nav`/`.navmenu`, `.hud-bracket`, form/apply, footer, cursor, RM kill-switch, `.bubble` chat CSS (moves to journey). DELETE: `.boot`, `.fx`, capability/portfolio/packages blocks, `.has-3d-headline`. ADD: hero-v2, voyage, journey, templates |
| `js/hero.js` | NEW — Scene 1 intro timeline + image-fallback logic |
| `js/helix.js` | NEW — Scenes 2+3 Three.js pipeline (replaces deleted `js/three-scenes.js`) |
| `js/templates.js` | NEW — picker state + form wiring |
| `js/app.js` | Modify: remove `boot()`, add `NB.scrollVel` (from `lenis.velocity`), extract `NB.scrollTo(el)`, add `body.no-three` class when `NB.skipThree`, call `NB.hero.intro()` |
| `js/animations.js` | Rewrite in place: keep nav-stuck, `[data-reveal]`, generalize `countUp()` → `NB.countUp` reading `data-count`; delete cap/work/pkg code; add 4 Journey pins |
| `js/form.js` | Modify: replace pkg `data-budget` listener with `NB.form.setTemplate(name, budget)` API; everything else untouched |
| `js/cursor.js` | Keep; update `pickMode()` hover selectors to `.tpl` |
| `js/three-scenes.js`, `js/transitions.js` | DELETE |
| `# NORTHBOUND STUDIO — MASTERPIECE REBUIL.md` | DELETE (`git rm '# NORTHBOUND...'` — quote the leading `#`) |
| `README.md` | Rewrite to match new site (stale section list) |
| `assets/char-colin.png`, `assets/char-partner.png` | NEW — generated via Art skill, transparent bg, ≥2000px tall, compressed <~400KB each (pngquant). Lowercase exact names — Pages is case-sensitive |

## Scene implementation

### 1 — Hero (`#hero`, 100vh)
- Chars: `figure.hero__char--left` (abs, left:5%, bottom:0, max-height:85vh; right mirrored). GSAP slide-in (x ∓100→0, 0.8s power3.out) on the outer figure; CSS float keyframe (±5px, 4s, `animation-delay:-2s` on right) on the inner img — two elements so transforms never fight. Each figure holds `<img>` + hidden `.hero__fallback` placeholder card (dark card, cyan border, "C"/"A", "Character art loading…"); `error` listener + `img.complete && naturalWidth===0` check toggles `.is-fallback`.
- Wordmark: letters pre-split in HTML (`aria-label` on h1, `aria-hidden` spans). "NORTHBOUND" `clamp(3rem,10vw,12vw)` Syne, ls .1em; "STUDIO" below. Per-letter reveal stagger 0.03s; `.hero__rule` scaleX 0→1 (60% width, center origin); `.ltr--n` glow pulse once then settle.
- Effects: `.hero__scan` 0.3s top→bottom sweep on load (reuse old `.boot__scan` styling); 4× `.hud-bracket` corners; `.hero__scroll` pulsing arrow + mono "SCROLL".
- Initial hidden states via `gsap.set` in JS (not CSS) — page stays visible if CDN fails.

### 2+3 — Voyage (`#voyage`): ONE canvas, ONE pin, 600vh
`ScrollTrigger.create({ trigger:'.voyage__pin', start:'top top', end:'+=600%', pin:true, scrub:0.6, anticipatePin:1, onUpdate: s => state.p = s.progress })` — render via `NB.onFrame`, early-return when pin inactive. Every phase is a pure function of master progress `p` (reverse-scrub correct by construction; no one-shot tweens).

| Phase | p range | Behavior |
|---|---|---|
| A helix travel | 0–.533 | camera.z +6 → −64 through helix (z 0…−72); positions static; bloom 1.5 |
| B converge | .533–.667 | radius 3.5→0 (recompute from stored cos/sin); bridge lines fade out |
| C N-form | .667–.767 | lerp axis pos → `nPos[i]` with per-particle stagger; helix rotation unwinds ×(1−t); camera settles z=−62 (N at −72 → "front z=10") |
| D N hold | .767–.833 | slow time-based Y rotation, amplitude windowed |
| E inflate | .833–.917 | group scale 1→2.5 + precomputed `bulge[i]` noise; bloom 1.4→2.4 |
| F freeze/crack/flash | .917–.933 | motion→0; jagged crack `THREE.Line` opacity = sin(π·t); DOM `.voyage__flash` white overlay 0→0.3→0; bloom spikes 3.2 |
| G shatter | .933–1.0 | pos = frozen(analytic) + `vel[i]`·ease(t); per-particle fade = darken vertex color toward black (additive ⇒ black = transparent); clearColor 0x000000→0x060608; bloom→0.8 |

Buffers: single `THREE.Points`, COUNT=1200 (600/strand, angle inc 0.15, spacing 0.12, strand 2 +π). Precomputed Float32Arrays: `cosA/sinA`, `zBase`, `nPos` (1200 pts over 3 N-strokes ∝ length, ±0.06 jitter), `vel` (x,y ±5; z 5–15 toward camera), `bulge`, `color` (vertexColors). Material: size .08, additive, depthWrite false, vertexColors. Position attribute only written when p ≥ .533. Bridges: `LineSegments`, every 10th pair (60 segs), opacity .3. Stars: separate static Points, dim ~0x1a2a30 (threshold:0 bloom halos anything bright). `UnrealBloomPass(res, 1.5, 0.4, 0)`; `setPixelRatio(min(dpr, 1.25))`. Scroll-velocity rotation: `rotAccum += (0.002 + clamp(|NB.scrollVel|·0.003, 0, .05))·dt·60`.

### 4 — Journey (`#journey`): FOUR separate pins (not one)
Each `.journey__step` = 100vh section, `pin:true, end:'+=50%'`, NO scrub — content timelines fire `onEnter`/reverse `onLeaveBack` (bounce/counters need time-based easing, and mobile degrades by simply not creating pins).
- **A `#j-advantage`:** "WE BUILD UNFAIR ADVANTAGES." clip-path `inset(100% 0 0 0)→inset(0)` + sub-line + CSS floating dots.
- **B `#j-craft`:** split grid, ART SIDE / BUILD SIDE tag pills stagger from each side, center 1px connector scaleY 0→1, caption "A SCAD-trained designer and a production AI engineer. One studio."
- **C `#j-support`:** iMessage thread (reuse restyled `.bubble` CSS), 4 messages per spec incl. "That was 3 minutes 😳", `back.out(1.8)` 0.4s each, stagger 0.6; tag "ONGOING SUPPORT · REAL PEOPLE · NOT A TICKET NUMBER".
- **D `#j-numbers`:** counters `< 2 WEEKS` / `$250+` / `100%` via generalized `NB.countUp` (`data-count`), once:true; footer line "Most agencies charge $5,000+…".

### 5 — Templates (`#templates`)
6 `<button class="tpl" data-template data-budget style="--t1..--t3">` cards (Minimal / Bold Dark / Warm & Organic / Corporate Trust / Creative Pop / Original Design) with CSS mini-mockup previews from palette vars; `.tpl--original` spans full row, accent border + glow. Click → single-select `.is-selected` (glow + scale 1.02) → `NB.form.setTemplate(name, budget)` → `NB.scrollTo('#apply')`. Budget defaults: templates → `$250 — Starter`; Original → `$400–600 — Pro`.
**One canonical budget-string set** everywhere (options, data-attrs, README): `$250 — Starter` / `$400–600 — Pro` / `$750+ — Full Brand Kit` (current form has `$400–$600` — normalize, else string-equality auto-fill silently no-ops).

### 6 — Apply form
Keep endpoint/honeypot/`_subject`/validation/success burst. Add `select#templateSelect name="template"` (options: 6 templates + "No preference", not required) between Industry and Focus. Existing eyebrow/headline/scarcity copy already matches spec.

### 7 — Footer
Keep; remove "View our work" link.

## Mobile / reduced-motion (add `body.no-three` when `NB.skipThree`)
- Hero: left char max-height 38vh behind text, right char hidden ≤600px; letter reveal still runs; RM → static.
- Voyage: `.voyage__pin` display:none; `.voyage__lite` shows — ~70vh black section, CSS starfield, SVG "N" stroke-draw on enter (reuse deleted boot N path). `helix.js init()` bails on `NB.skipThree`.
- Journey: no pins; normal sections with `onEnter` reveals at `top 75%`.
- Templates: 1-column grid ≤880px. Cursor/Lenis already bail on touch/RM.

## Build order (commit-sized; verify each locally with `bunx serve -l 8080` + Interceptor)
1. **Purge** — remove boot/fx/capability/portfolio/packages + dead JS/CSS + script tags; nav/footer link updates. Verify: loads clean, zero console errors, form validates.
2. **Hero v2** — markup/CSS/`hero.js`/app.js hookup + `NB.scrollTo` extraction. Verify the FALLBACK path animates (guaranteed state until art lands).
3. **Journey** — markup/CSS/4 pins/`countUp` generalization. Verify pins both directions + mobile stack (devtools ≤768 + reload).
4. **Templates + form** — markup/CSS/`templates.js`/form field/budget normalization. Verify select → highlight → auto-fill both selects → smooth scroll.
5. **Voyage** (biggest) — markup/`.voyage__lite`/CSS/`helix.js`. Verify scrub down AND up through all 7 phases; flash/crack replay in reverse; ~60fps; `no-three` path.
6. **Polish** — cursor selectors, title/meta, dead CSS, cache-bust `?v=2` on css/js.
7. **Character art** — Art skill: two original anime characters per reference poses, transparent PNG ≥2000px, compress, drop at `assets/char-*.png`. Verify fallback swap + float/slide-in.
8. **Cleanup + docs** — `git rm` stale spec file, rewrite README.
9. **Deploy** — push to `main` → Pages workflow. Per PAI rules execution runs at E5 with Forge spawned in EXECUTE for the coding steps.

## Verification (end-to-end)
- Local: `bunx serve` + **Interceptor** (`interceptor open http://localhost:8080`) at each step — console errors, network 404s, screenshots of each scene, full scroll walk.
- Post-deploy (mandatory Interceptor, never agent-browser): open `https://ceyre-boop.github.io/Northbound-Studio-/`, hard-refresh; walk all scenes desktop; check console + CDN loads; confirm `assets/*.png` 200; submit one real test application and confirm the Formspree email contains the new `template` field; devtools mobile pass (lite voyage, stacked journey, 1-col templates).

## Risks / gotchas
1. **r128 lockstep:** cdnjs three r128 + unpkg `three@0.128.0/examples/js/*` must move together (`examples/js` deleted ~r148). Optional hardening commit: vendor the 7 example files into `/vendor/three/`.
2. **Lenis 1.1.x = native scroll — NO scrollerProxy** (existing `lenis.on('scroll', ScrollTrigger.update)` + single ticker is correct; a proxy double-smooths).
3. **Pinning:** ScrollTrigger pins the wrapper; canvas stays `absolute inset:0` inside. No transformed ancestors of pinned elements (silently downgrades to transform pinning → jitter).
4. **Scrub reversibility:** flash/crack/bloom must be pure functions of `p` — never onEnter one-shots (stuck white overlay on reverse).
5. **Per-particle fade:** PointsMaterial has no per-particle opacity — darken vertexColors toward black (additive ⇒ transparent).
6. **Bloom perf** is the cost, not particles: DPR cap 1.25, render only while pin active, keep stars dim (threshold 0 halos everything).
7. **Formspree:** keep `name`/`email` required names, `_subject`, `_gotcha` stable; new fields are auto-accepted.
8. **JS-set hidden states** for hero/journey (not CSS) so a CDN hiccup can't blank the page.
9. Mobile gate is load-time only (existing behavior; accept).
10. GitHub Pages caches ~10 min — cache-bust query strings; PNG names lowercase (case-sensitive).
