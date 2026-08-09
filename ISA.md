---
project: Northbound Studio
task: Site-wide revamp into 7-scene cinematic anime scroll experience
slug: northbound-anime-scroll
effort: E5
phase: learn
progress: 120/128
mode: build
started: 2026-07-14T22:30:36-0400
updated: 2026-07-15T14:45:00-0400
---

# ISA — Northbound Studio (Anime Scroll Experience)

## Problem

The live site is the previous "magnum opus" build (data-sphere hero, capability carousel, horizontal portfolio, packages grid). It no longer matches the studio's direction: a cinematic anime-branded scroll experience where the site itself proves premium positioning. The approved spec (Plans/northbound-studio-graceful-corbato.md) defines 7 new scenes; almost none exist in the current code. No character art exists anywhere in the repo.

## Vision

A visitor lands on two anime characters flanking a glowing wordmark, scrolls INTO a tunnel of cyan light, watches the tunnel collapse into a letter N that inflates and shatters toward their face, then glides through a confident story and picks a template — and by the time they reach the form they already believe this studio can build anything. Euphoric surprise: "a $250 studio site should not feel like this."

## Out of Scope

- Portfolio/work showcase section (dropped by user decision 2026-07-14).
- Boot/intro overlay before the hero (hero IS the intro).
- Packages pricing grid (superseded by template picker + form budget).
- Any framework, bundler, or build step — the site stays vanilla HTML/CSS/JS on GitHub Pages.
- Reproductions of copyrighted reference characters (Dante/Light) — original characters in that style only.
- Mobile WebGL — Three.js scenes are desktop-only by existing gating.
- Backend changes — Formspree endpoint stays as-is.

## Principles

- The site is the portfolio piece: every scene must feel intentional, never placeholder.
- Scroll position is the single source of truth for cinematic state — every visual is a pure function of progress `p` (reverse-scrub always correct).
- Progressive enhancement: content is reachable and readable if WebGL, JS, or images fail.
- Performance is part of the aesthetic — a stuttering shatter is worse than no shatter.

## Constraints

- Three.js pinned at r128 + unpkg three@0.128.0 examples/js post-processing (must move in lockstep; do not upgrade).
- GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.18 (native-scroll mode — NO scrollerProxy).
- Keep the NB module pattern: IIFE modules on window.NB, single gsap.ticker frame bus, central mobile/RM gating.
- Keep Formspree endpoint https://formspree.io/f/xpwzgvkn with `name`/`email` required, `_subject`, `_gotcha` intact.
- Deploy = push to `main` → existing .github/workflows/deploy-pages.yml (GitHub Actions Pages).
- Design tokens locked: --bg #060608, --accent #00F0FF, Syne / Instrument Sans / JetBrains Mono.

## Goal

The Northbound Studio site on `main` deploys to GitHub Pages as the approved 7-scene experience — hero with character art, scroll-driven helix→N→shatter WebGL voyage, 4-step journey, template picker wired to the apply form — with zero console errors, working mobile fallbacks, and live Interceptor-verified evidence for every user-facing scene.

## Criteria

### Repo hygiene / purge
- [x] ISC-1: index.html contains no `#boot`, `.fx`, `#capability`, `#portfolio`, `#packages` markup (Grep returns 0 matches)
- [x] ISC-2: js/three-scenes.js and js/transitions.js deleted from repo (ls fails)
- [x] ISC-3: Stale root file `# NORTHBOUND STUDIO — MASTERPIECE REBUIL.md` removed from git (git ls-files shows absent)
- [x] ISC-4: css/style.css contains no `.boot`, `.cap__`, `.work__`, `.pkg__`, `.has-3d-headline` rules (Grep 0)
- [x] ISC-5: index.html script tags reference exactly: cursor, form, templates, hero, helix, animations, app (in that order)
- [x] ISC-6: Nav links point to #journey, #templates, #apply only; no "Work" link (Grep)
- [x] ISC-7: Footer has no "View our work" link (Grep 0)
- [x] ISC-8: Anti: CDN `<head>`/vendor script block unchanged — three r128, examples/js set, GSAP 3.12.5, Lenis 1.1.18 all still referenced (Grep each URL)
- [x] ISC-9: README.md rewritten — no references to Why Us / Reviews / DNS Help / capability / portfolio / packages sections (Grep 0)

### Scene 1 — Hero
- [x] ISC-10: `#hero` section exists with `.hero__char--left` and `.hero__char--right` figures (Grep)
- [x] ISC-11: Left char CSS: absolute, left 5%, bottom 0, max-height 85vh (Read css)
- [x] ISC-12: Right char CSS mirrored right 5% (Read css)
- [x] ISC-13: Each char figure contains `<img>` pointing at `assets/char-colin.png` / `assets/char-partner.png` plus a `.hero__fallback` placeholder card (Read html)
- [x] ISC-14: Fallback card styled: dark card bg, 1px accent border, large Syne letter C/A, mono "Character art loading…" caption (Interceptor screenshot with images absent)
- [x] ISC-15: hero.js toggles `.is-fallback` on img error AND on `img.complete && naturalWidth===0` (Read js)
- [x] ISC-16: CSS float keyframe on inner img: translateY ±5px, 4s ease-in-out infinite, right char phase-offset via animation-delay (Read css)
- [x] ISC-17: GSAP slide-in on outer figures: left x -100→0, right x +100→0, 0.8s power3.out (Read js)
- [x] ISC-18: Wordmark h1 has aria-label="Northbound Studio"; letter spans aria-hidden (Read html)
- [x] ISC-19: "NORTHBOUND" row sized to fit the viewport with no overflow (Syne 800, ls .1em) — refined from spec's 8–12vw, see Decisions 2026-07-15 (Interceptor screenshot + measured scrollWidth < viewport)
- [x] ISC-20: Per-letter reveal: fade + slide-up, 0.03s stagger (Read js)
- [x] ISC-21: `.hero__rule` draws center-outward scaleX 0→1, final width 60% (Read css/js)
- [x] ISC-22: The N letter (`.ltr--n`) pulses glow once then settles (Read js timeline)
- [x] ISC-23: `.hero__scan` scan line sweeps top→bottom ~0.3s on load then hides (Read js)
- [x] ISC-24: Four `.hud-bracket` corner brackets rendered in hero viewport corners (Interceptor screenshot)
- [x] ISC-25: Scroll indicator at bottom: pulsing arrow + mono "SCROLL" label, links to #voyage (Read html)
- [x] ISC-26: Initial hidden states set via gsap.set in JS, not CSS opacity:0 (Grep css for hero opacity rules = 0 matches)
- [x] ISC-27: Anti: with JS disabled or CDN failed, hero text content is still present in DOM and visible (Read: no CSS hides `.ltr`)
- [x] ISC-28: Hero renders correctly at 1440px: chars flank, wordmark centered, no overlap (Interceptor screenshot)

### Scenes 2+3 — Voyage (helix → N → shatter)
- [x] ISC-29: `#voyage` section with `.voyage__pin` (100vh) containing `canvas.voyage__canvas`, `.voyage__flash`, and sibling `.voyage__lite` (Read html)
- [x] ISC-30: js/helix.js exists and registers via NB.onFrame; no separate rAF loop (Grep)
- [x] ISC-31: ScrollTrigger pin: trigger .voyage__pin, start top top, end +=600%, pin true, scrub 0.6, anticipatePin 1 (Read js)
- [x] ISC-32: Render early-returns when pin inactive (Grep for active guard)
- [x] ISC-33: Helix: 1200 particles (600/strand), angle increment 0.15, spacing 0.12, strand 2 phase +π (Read js constants)
- [x] ISC-34: PointsMaterial: size .14 with soft round glow sprite (refined from .08 — see Decisions 2026-07-15), additive blending, depthWrite false, vertexColors true (Read js)
- [x] ISC-35: Bridge LineSegments every 10th pair, opacity 0.3, additive (Read js)
- [x] ISC-36: Background stars: separate static Points, dim color ≤ #1a2a30 range (Read js)
- [x] ISC-37: UnrealBloomPass(strength 1.5, radius 0.4, threshold 0) on an EffectComposer (Read js)
- [x] ISC-38: Pixel ratio capped at min(devicePixelRatio, 1.25) (Grep)
- [x] ISC-39: Phase A (p 0–.533): camera.z lerps +6→−64; position attribute NOT written (Read js: needsUpdate gated on p ≥ .533)
- [x] ISC-40: Phase B (p .533–.667): radius 3.5→0 eased; bridges fade to 0 (Read js)
- [x] ISC-41: Phase C (p .667–.767): lerp to nPos with per-particle stagger; rotation unwinds ×(1−t); camera settles z −62 (Read js)
- [x] ISC-42: nPos samples 1200 points across exactly 3 strokes (left vertical, diagonal, right vertical) proportional to stroke length with jitter (Read js)
- [x] ISC-43: Phase D (p .767–.833): slow Y rotation windowed to phase (Read js)
- [x] ISC-44: Phase E (p .833–.917): scale 1→2.5 + bulge noise; bloom 1.4→2.4 (Read js)
- [x] ISC-45: Phase F (p .917–.933): crack THREE.Line opacity = sin(π·t); flash overlay opacity 0.3·sin(π·t); bloom spike ~3.2 (Read js)
- [x] ISC-46: Phase G (p .933–1.0): analytic frozen pos + vel·ease(t); vertex colors darken toward black for fade; clearColor lerps 0x000000→0x060608 (Read js)
- [x] ISC-47: Anti: NO one-shot onEnter tweens drive flash/crack/bloom — all scrub-critical visuals are pure functions of p. Two disclosed decorative exceptions, both windowed/multiplied to 0 at phase boundaries so reverse-scrub stays exact: rotAccum (helix spin) and the phase-D y-wobble (wall-clock driven). (Grep + Cato audit 2026-07-15)
- [x] ISC-48: Scroll-velocity rotation: rotAccum uses NB.scrollVel with clamp (Read js)
- [x] ISC-49: NB.scrollVel populated in app.js from lenis.velocity (or scrollY delta fallback) (Read js)
- [x] ISC-50: helix.js init bails when NB.skipThree (Grep)
- [x] ISC-51: Reverse-scrub: scrolling back up from p=1 to p=0 restores helix (Interceptor scroll walk down then up, screenshots match phase)
- [x] ISC-52: Full scrub down shows all 7 phases visually (Interceptor screenshots at ~p 0.25 / 0.6 / 0.72 / 0.87 / 0.925 / 0.97)
- [x] ISC-53: Anti: no WebGL console errors or three.js warnings during full scroll (Interceptor console read)
- [x] ISC-54: `.voyage__lite` mobile fallback: hidden on desktop, shown under body.no-three, contains CSS starfield + stroke-drawn SVG N (Read css + Interceptor mobile)

### Scene 4 — Journey
- [x] ISC-55: `#journey` contains 4 `.journey__step` sections with IDs j-advantage, j-craft, j-support, j-numbers (Grep)
- [x] ISC-56: Each step pinned individually: pin true, end +=50%, no scrub; content timeline onEnter / reversed onLeaveBack (Read js)
- [x] ISC-57: Step A headline "WE BUILD UNFAIR ADVANTAGES." with clip-path inset reveal (Read html/js)
- [x] ISC-58: Step A subline "Custom websites that make your competition irrelevant." (Grep)
- [x] ISC-59: Step A floating CSS particles present (Read css)
- [x] ISC-60: Step B split: "THE ART SIDE" tags Logos/Branding/Illustration/Motion; "THE BUILD SIDE" tags Websites/Apps/Performance/SEO (Grep all 8)
- [x] ISC-61: Step B center connector line scaleY 0→1 + caption "A SCAD-trained designer and a production AI engineer. One studio." (Grep)
- [x] ISC-62: Step C chat: 4 bubbles with exact spec copy incl. "That was 3 minutes 😳" (Grep)
- [x] ISC-63: Step C bubbles animate slide+bounce back.out, ~0.4s each, ~0.6s stagger (Read js)
- [x] ISC-64: Step C tag "ONGOING SUPPORT · REAL PEOPLE · NOT A TICKET NUMBER" + support copy line (Grep)
- [x] ISC-65: Step D three counters render "< 2 WEEKS", "$250+", "100%" via NB.countUp(data-count), fire once on enter (Read js + Interceptor)
- [x] ISC-66: Step D line "Most agencies charge $5,000+ for this. We're not most agencies." (Grep)
- [x] ISC-67: countUp generalized to data-count and exposed as NB.countUp (Read js)
- [x] ISC-68: Mobile: no journey pins created; steps stack vertically with onEnter reveals (Read js branch + Interceptor mobile)
- [x] ISC-69: All four steps pin and release cleanly scrolling down AND up (Interceptor scroll walk)

### Scene 5 — Template picker
- [x] ISC-70: `#templates` section: eyebrow "CHOOSE YOUR STYLE", h2 "Pick a starting point.", subtext per spec (Grep)
- [x] ISC-71: Exactly 6 `.tpl` button cards: Minimal, Bold Dark, Warm & Organic, Corporate Trust, Creative Pop, Original Design (Grep data-template)
- [x] ISC-72: Each card carries palette CSS vars --t1..--t3 matching spec hexes (Read html)
- [x] ISC-73: Each card shows CSS mini-mockup preview built from palette vars (Interceptor screenshot)
- [x] ISC-74: Cards show name, audience line, price range per spec (Grep prices)
- [x] ISC-75: `.tpl--original` styled distinctly: larger/full-row, accent border, glow (Read css + Interceptor)
- [x] ISC-76: Click selects: single `.is-selected` with border glow + scale (Read js + Interceptor click)
- [x] ISC-77: Selection calls NB.form.setTemplate(name, budget) and template select updates (Interceptor: click card, read #templateSelect value)
- [x] ISC-78: Budget default: template cards → "$250 — Starter"; Original → "$400–600 — Pro" (Interceptor: click both kinds, read #budgetSelect)
- [x] ISC-79: Selection smooth-scrolls to #apply via NB.scrollTo (Interceptor: click card, viewport lands at form)
- [x] ISC-80: Cards are `<button type="button">` — keyboard focusable/activatable (Read html)
- [x] ISC-81: Grid collapses to 1 column ≤880px (Read css)

### Scene 6 — Apply form
- [x] ISC-82: Form action still https://formspree.io/f/xpwzgvkn with _subject and _gotcha honeypot (Grep)
- [x] ISC-83: New select#templateSelect name="template" with 6 template options + "No preference", not required (Read html)
- [x] ISC-84: Budget options exactly: "$250 — Starter" / "$400–600 — Pro" / "$750+ — Full Brand Kit" — one canonical string set matching all data-budget attrs (Grep both files, string equality)
- [x] ISC-85: Required fields name + email unchanged; focus options Logo/Website/Logo + Website (Read html)
- [x] ISC-86: Validation, sending/success states, success particle burst still work (Read js/form.js unchanged paths + Interceptor: submit empty form shows validation)
- [x] ISC-87: Anti: no existing field `name=` attributes renamed (git diff shows name/email/focus/budget/details/timeline intact)
- [x] ISC-88: Eyebrow "START A PROJECT", headline "Let's build yours.", scarcity "We take on 2–3 projects per month." present (Grep)

### Scene 7 — Footer + global
- [x] ISC-89: Footer keeps pulsing N, tagline, "Start a project" link, © line, "Built with Three.js · GSAP · Obsession" (Grep)
- [x] ISC-90: Comet cursor still initializes on desktop; pickMode hover selectors updated to .tpl (Read js)
- [x] ISC-91: Film grain overlay present (Grep .grain)
- [x] ISC-92: Lenis smooth scroll active on desktop; anchors route through NB.scrollTo (Read js)
- [x] ISC-93: app.js adds body.no-three when NB.skipThree (Read js)
- [x] ISC-94: `<title>` and meta description updated for new site (Read html)
- [x] ISC-95: css/js referenced with cache-bust query (?v=) (Grep)

### Character art
- [ ] ISC-96: assets/char-colin.png exists: anime male, white/silver hair, red coat, confident thumbs-up pose, transparent background (Read image visually)
- [ ] ISC-97: assets/char-partner.png exists: anime male, brown hair, dark suit, seated-desk/hand-to-temple pose, transparent background (Read image visually)
- [ ] ISC-98: Both PNGs ≥1600px tall and ≤600KB each after compression (Bash sips/stat)
- [ ] ISC-99: Anti: characters are NOT identifiable reproductions of the copyrighted references — original designs in matching style (visual review)
- [ ] ISC-100: With images present, hero shows art (not fallbacks) and slide-in/float animate (Interceptor screenshot)
- [ ] ISC-101: Antecedent: character art palette harmonizes with site (cool darks + red accent left, dark suit right) so hero reads as one composition, not pasted stickers (visual review of screenshot)

### Mobile / reduced-motion
- [x] ISC-102: ≤768px: no WebGL canvas initialized (NB.skipThree path) (Interceptor mobile viewport + console)
- [x] ISC-103: Mobile hero: left char shrunk (~38vh) behind text, right char hidden ≤600px (Read css)
- [x] ISC-104: Mobile full-page scroll: hero → lite voyage → journey stack → templates 1-col → form → footer, no horizontal overflow (Interceptor mobile walk)
- [x] ISC-105: prefers-reduced-motion: kill-switch still forces static visible content (Read css)

### Build, deploy, live verification
- [x] ISC-106: Local serve (bunx serve): page loads with zero console errors (Interceptor console read)
- [x] ISC-107: Zero 404s in network log locally except (pre-art) the two char PNGs (Interceptor network read)
- [x] ISC-108: All work committed to main in logical commits and pushed (git log/status)
- [x] ISC-109: GitHub Actions Pages deploy run completes green after push (gh run watch / API)
- [x] ISC-110: Live https://ceyre-boop.github.io/Northbound-Studio-/ serves new index (curl grep for voyage/journey markers)
- [x] ISC-111: Live site: full desktop scroll walk verified via Interceptor with screenshots of all 7 scenes
- [x] ISC-112: Live site: zero console errors on load and through full scroll (Interceptor console)
- [ ] ISC-113: Live assets/char-*.png return HTTP 200 (curl -I)
- [x] ISC-114: Live: template card click auto-fills form selects (Interceptor interaction)
- [ ] ISC-115: Anti: no regression to form deliverability — test submission reaches Formspree (Interceptor submit + success state; email confirmed by user or Formspree dashboard) [may be DEFERRED-VERIFY with follow-up]
- [x] ISC-116: Anti: main branch never left in a broken state between pushes — each push is a coherent working site (verify before each push)
- [x] ISC-117: Live mobile emulation pass on deployed URL (Interceptor devtools mobile)
- [x] ISC-118: Plans/ and ISA.md may ship in the Pages artifact (harmless) — but no secrets/keys anywhere in repo (Grep for key patterns = 0)

### Performance / quality bars
- [x] ISC-119: Voyage scroll maintains visually smooth scrub (no multi-second hitches) in Interceptor walk (visual + no long-task console warnings)
- [x] ISC-120: Total JS (non-CDN) remains < 100KB unminified (Bash du)
- [x] ISC-121: Hero LCP content (wordmark) visible without scroll on 1440×900 (Interceptor screenshot)
- [x] ISC-122: Anti: no layout shift when char PNGs load (absolute positioning verified in css) (Read css)
- [x] ISC-123: Antecedent: shatter phase visually reads as "glass toward the camera" — particles pass camera edges, flash lands, calm after (Interceptor screenshots sequence)
- [x] ISC-124: Antecedent: helix tunnel feel — particles visibly pass on both sides of camera mid-phase-A (Interceptor screenshot)

### Documentation / system of record
- [x] ISC-125: README.md describes new scene list, deploy model, no-build constraint, budget tiers with canonical strings (Read)
- [x] ISC-126: ISA.md (this file) committed to repo as system of record (git ls-files)
- [x] ISC-127: Obsidian 00-BRAIN/NEXT.md Northbound section updated at completion (Read)
- [x] ISC-128: Plans/northbound-studio-graceful-corbato.md committed for traceability (git ls-files)

## Test Strategy

| ISC range | type | check | threshold | tool |
|---|---|---|---|---|
| 1–9 | static | markup/file absence + presence | exact | Grep / Bash ls / git ls-files |
| 10–28 | static+visual | hero structure, CSS values, timeline order | exact values | Read / Grep / Interceptor screenshot |
| 29–54 | code+visual | pipeline constants, phase math, scrub walk | phase visuals at 6 checkpoints, 0 console errors | Read / Grep / Interceptor |
| 55–69 | code+visual | journey markup/copy/pins | exact copy strings, clean pin/release | Grep / Interceptor |
| 70–81 | code+interactive | picker cards, selection, autofill, scroll | select values match canonical strings | Read / Interceptor click+read |
| 82–88 | code+interactive | form fields, endpoint, validation | endpoint unchanged, validation blocks empty | Grep / Interceptor |
| 89–95 | static | global elements | present | Grep / Read |
| 96–101 | asset+visual | art files, size, style, composition | ≥1600px, ≤600KB, transparent, original | Bash sips / Read image |
| 102–105 | responsive | mobile/RM behavior | no canvas, no h-overflow | Interceptor mobile |
| 106–118 | deploy+live | local + live probes | 0 console errors, HTTP 200s, green Actions run | Interceptor / curl / gh |
| 119–124 | experiential | perf + antecedent feel probes | smooth scrub, composition reads | Interceptor sequence |
| 125–128 | docs | record-keeping | committed | Read / git |

## Features

| name | satisfies | depends_on | parallelizable |
|---|---|---|---|
| purge | ISC-1..9 | — | no (foundation) |
| hero-v2 | ISC-10..28, 121–122 | purge | yes |
| journey | ISC-55..69 | purge | yes |
| templates+form | ISC-70..88 | purge | yes |
| voyage-pipeline | ISC-29..54, 119, 123–124 | purge | yes (Forge parallel) |
| character-art | ISC-96..101 | — (fully parallel) | yes (Art skill) |
| polish+mobile | ISC-89..95, 102–105 | hero/journey/templates/voyage | no |
| docs+cleanup | ISC-9, 125–128 | all | no |
| deploy+live-verify | ISC-106..118 | all | no (final) |

## Decisions

- 2026-07-14 22:30 — E5 Interview requirement satisfied by plan-mode AskUserQuestion round (portfolio=drop, boot=drop, art=generate-matching-reference) + user-approved plan file. Re-interviewing would re-litigate settled decisions.
- 2026-07-14 22:30 — show-your-math (ISC floor): E5 soft floor is 256; this ISA carries 128. The site is a bounded static artifact — 128 ISCs already cover every scene, interaction, asset, deploy, and experiential probe at one-binary-probe granularity; padding to 256 would split atomic probes into non-atomic fragments.
- 2026-07-14 22:30 — Character art: original designs matching reference poses/energy, NOT reproductions of Dante (Capcom) / Light Yagami (Shueisha) — commercial studio site cannot ship copyrighted characters.
- 2026-07-14 22:30 — Keep comet cursor over spec's simpler dot+circle (exceeds spec; deliberate, noted in approved plan).
- 2026-07-14 22:30 — Delegation: Forge on helix.js (isolated new module = clean parallel target), Artist/Art on PNGs, Cato at VERIFY, Interceptor for all web probes. Prior session flagged codex auth may be dead — if Forge fails auth, build helix.js directly and log here.
- 2026-07-15 — Forge fallback fired as pre-registered: ChatGPT-account auth carries no Codex model entitlement (gpt-5.4/codex variants all 400). Forge agent built helix.js directly to spec; static verification (parse, banned APIs, allocation scan, 6-boundary continuity ≤5.4e-4) passed. Coordinator review added one fix Forge's boundary check couldn't see: fast reverse scrub jumping B/C→A in one frame left a half-converged buffer — restoreHelix() now fires on crossing below p=.533.
- 2026-07-15 — Character art BLOCKED: Art skill needs GOOGLE_API_KEY (absent from ~/.claude/.env); permission classifier denied credential search for both the art agent and the coordinator (correctly — credential exploration). rembg + pngquant installed and prompts staged; pipeline runs end-to-end the moment a key lands. Site ships fallback-first per design (ISC-96..101 pending user decision). Escalated to Colin in the final report.
- 2026-07-15 — Session restart recovery: prior process died mid-EXECUTE; both background agents resumed from transcripts; no work lost (assets/ empty, helix.js re-landed on resume).
- 2026-07-15 — Classifier returned E3 for the post-restart "continue" prompt; conversation-context override holds the run at E5 (mid-flight E5 ISA).

### Risks (THINK)

- Converge-through-camera flicker (fix: z-compression during phase B — encoded as build delta)
- Double-smoothing if anyone adds scrollerProxy (banned — SystemsThinking L1/L2)
- Pin-spacer misposition from late image/font load (fix: absolute-positioned chars + refresh on load/fonts.ready)
- Stale frame on pin re-entry (fix: force one render on activate/refresh/resize)
- GitHub Pages cache fog (fix: ?v= stamps + Interceptor version check)
- Codex/Forge auth possibly dead (fallback: direct build, log decision)
- Art generation may miss transparent-bg or style match (fallback: site ships fallback-first; regenerate)

- 2026-07-15 — refined: ISC-19 — spec's 8–12vw wordmark overflowed (Syne 800 is wide: measured 1399px row in an 1100px container at 6.8vw); final clamp(2rem, 6.2vw, 7rem) + uncapped hero container centers cleanly at 1512px.
- 2026-07-15 — refined: shatter velocity multiplier 14 → 2.5 — at ×14 (with ×2.5 group scale) every particle passed the camera in the first ~20% of phase G, leaving 30vh of empty scroll; at ×2.5 passage spreads across tG≈0.4–0.7 (verified visually: full-frame debris at p 0.955).
- 2026-07-15 — refined: soft round glow sprite (CanvasTexture radial gradient, size .08→.14) replaces default square points — near-camera particles rendered as hard squares in phase B (ISC-34 satisfied in spirit; size param refined).
- 2026-07-15 — Discovery: this Mac has OS-level Reduce Motion ON — the site correctly served the static fallback, which would read as "the build is broken" during acceptance. Added ?motion=full / ?motion=lite URL overrides (html.force-motion scopes the RM CSS kill-switch). Default behavior for visitors unchanged: OS setting honored.
- 2026-07-15 — refined: NB.scrollTo Lenis duration 1.2s — default lerp took ~6s+ over pin-spacer distances (template card → form felt broken).
- 2026-07-15 — Interceptor CLI absent on this machine (no binary, no ~/Projects/interceptor) — web verification ran on the Claude-in-Chrome extension (real Chrome, non-CDP), honoring the Interceptor rule's intent. Flag: reinstall interceptor for future sessions.
- 2026-08-09 — SITE REPLACED: Colin approved the "Northbound Descent" design (claude.ai design project 8b91ff26, file `Northbound Descent.dc.html`) and asked for it live. Exported the project archive from claude.ai/design, replaced index.html wholesale (old anime-scroll build preserved at commit 7072df1), shipped design-system runtime (`_ds/`, `support.js`) and BUDDY character art (buddy-*.png). Added title/meta/OG/favicon head block (export shipped none). The anime-scroll ISCs below describe the superseded build; this ISA needs a re-seed against the Descent experience as a follow-up.
- 2026-08-09 — Gotcha: GitHub Pages default Jekyll build silently drops underscore-prefixed dirs — `_ds/` returned 503/404 on first deploy, page rendered with no design system. Fixed with root `.nojekyll` (commit 312b4ce). Any future export containing `_`-prefixed paths depends on that file staying in the repo.
- 2026-08-09 — Verification note: an instant `End`-key jump renders a black viewport (scroll-driven reveal needs progressive scroll); real wheel scrolling renders all seven floors including Floor 07 N-assembly + form. Not a defect.

## Changelog

- **2026-07-15 — shatter velocity.**
  - conjectured: `vel·easeIn(tG)·14` would spread particle passage across phase G ("fast, dramatic, then calm").
  - refuted by: live screenshot at p=0.955 — frame already empty; the ×2.5 group scale multiplies displacement, so every particle passed the camera in the first ~20% of G.
  - learned: displacement tuning must be computed in WORLD units (local × group scale), and the passage *window* — not the max distance — is the design variable.
  - criterion now: ISC-46/123 — multiplier 2.5 spreads passage across tG≈0.4–0.7; full-frame debris verified at p 0.955.
- **2026-07-15 — reduce-motion acceptance trap.**
  - conjectured: a correct prefers-reduced-motion gate is purely an accessibility win.
  - refuted by: this Mac has OS Reduce Motion ON — the "correct" gate rendered the fallback during acceptance, indistinguishable from a broken build (the exact failure pattern in recent learning signals).
  - learned: motion-gated sites need an explicit inspection override, and environment state (OS settings, tool availability) belongs in PREFLIGHT probes.
  - criterion now: `?motion=full`/`?motion=lite` overrides exist (app.js), html.force-motion scopes the RM CSS; default honors the OS setting.

## Verification

Local verification 2026-07-15 (server: bunx serve :8080; browser: Claude-in-Chrome on real Chrome, 1512×860 and 390×844):

- ISC-1..9: Bash/Grep batch — purge greps 0, files deleted, script order exact, CDN lockstep 10 refs, canonical budget strings ×3 / legacy ×0, all 7 JS files parse (node --check), 56KB total JS.
- ISC-10..28: hero screenshot ss_5269g9swn — wordmark centered no-overflow, N lit cyan, rule drawn, both fallback cards, 4 brackets, scroll cue; structure/values by Read/Grep.
- ISC-29..54: phase walk screenshots — A tunnel ss_808098dgu, B converge spiral ss_9701jl16y, C/D formed N ss_1016ij3lf, E inflate ss_0548nfveg, F crack+flash ss_6622g6nvl, G shatter (retuned) ss_0532dt5xu, single-frame G→A reverse restore ss_9992fccqb. Forge static proofs: parse OK, 0 banned APIs, 0 frame-loop allocations, 6-boundary continuity ≤5.4e-4.
- ISC-55..69: step A mask reveal ss_18810r1fw; step C 4 bubbles exact copy ss_0781cryq7; counters read final "< 2 WEEKS / $250+ / 100%" after onEnter (JS probe); craft split + line verified in RM-mode render earlier.
- ISC-70..81: grid ss_8371p91d5; click "Bold Dark" → is-selected + template="Bold Dark" + budget="$250 — Starter" (JS probe); Original card → "Original Design" + "$400–600 — Pro"; scroll-to-apply arrives (duration refined); buttons keyboard-focusable; 1-col at 390px (gridCols=1).
- ISC-82..95: form endpoint/honeypot/_subject greps; empty submit → "Please fill in the highlighted fields.", 3 fields flagged, focus to f-name; footer/nav/cursor/grain/lenis/no-three/title/cache-bust by Read+screenshot.
- ISC-102..107: 390×844 load → body "is-mobile no-three", lite voyage stars+drawn N ss_5485g4872, no h-overflow (scrollWidth check), templates 1-col ss_71192hmzk; console errors 0 across entire walk; network 404s = only the 2 expected char PNGs.
- ISC-120..125: JS 56KB; hero LCP in first viewport; chars absolutely positioned (no CLS); shatter/tunnel antecedents per phase screenshots; README rewritten.
Live verification 2026-07-15 (deploy 4975352 + 86fb99e + a11y fix, Chrome on https://ceyre-boop.github.io/Northbound-Studio-/):

- ISC-108/109/116/126/128: pushes green (gh run conclusion success ×2), each push a verified-working site, ISA + plan committed.
- ISC-110: curl 200 + 5 new-markup markers; every live asset request 200 except the 2 expected char PNGs (network log, 22 requests — subpath-relative paths hold on Pages).
- ISC-111/119: live hero ss_2164k1rvz + live N-formation ss_1066g5w2k mid-scrub; scrub rendered cleanly at every checkpoint.
- ISC-112: live console 0 errors across load + walk + interactions.
- ISC-114: live click "Creative Pop" → template="Creative Pop", budget="$400–600 — Pro"; ISC-75 Original card renders.
- ISC-68/117: live 390×844 → body "is-mobile no-three", 0 pins, steps stack, no h-overflow.
- ISC-118: Cato secret scan — only benign prose mentions, no live keys.
- ISC-127: Obsidian NEXT.md Northbound section updated with ship note + open items.

Cato cross-vendor audit 2026-07-15: verdict CONCERNS, 0 critical, cross_vendor=false (codex entitlement dead — same-family audit, disclosed). Actioned: navmenu aria-hidden toggle + visibility fix (real a11y bug), ISC-34/47 criterion text reconciled to artifacts, frontmatter progress reconciled to checkbox count (checkboxes are the record). Remaining findings are the already-tracked pendings.

PENDING (8): ISC-96..101 + 113 — character art blocked on GOOGLE_API_KEY (user decision); ISC-115 [DEFERRED-VERIFY] — live Formspree submission emails the real inbox; follow-up task: Colin submits one test application after art lands (tracked in Obsidian NEXT.md).
