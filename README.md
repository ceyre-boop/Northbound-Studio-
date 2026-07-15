# Northbound Studio — The Anime Scroll Experience

Cinematic scroll-driven site for Northbound Studio. Vanilla HTML/CSS/JS — **no build step**.

## Scenes

1. **Hero** — two anime characters flanking the NORTHBOUND STUDIO wordmark (per-letter reveal, scan sweep, N glow). Character art lives at `assets/char-colin.png` / `assets/char-partner.png`; styled placeholder cards render automatically until those files exist.
2. **Voyage** (`js/helix.js`) — a Three.js particle double-helix tunnel the camera flies through; the strands converge into a letter **N** that inflates, cracks, and shatters toward the camera. One canvas, one 600% pinned ScrollTrigger; every visual is a pure function of scroll progress (reverse-scrub safe).
3. **Journey** — four pinned story steps: unfair advantages, Design × Engineering split, iMessage support thread, animated stat counters.
4. **Template picker** — six style cards (Minimal / Bold Dark / Warm & Organic / Corporate Trust / Creative Pop / Original Design). Selecting one pre-fills the apply form's template + budget.
5. **Apply** — Formspree-backed application form.
6. **Footer**.

Budget tiers (canonical strings used in the form and picker): `$250 — Starter` · `$400–600 — Pro` · `$750+ — Full Brand Kit`.

## Stack

- Three.js **r128** (cdnjs) + `three@0.128.0` examples/js post-processing (unpkg) — these two must stay on the same version.
- GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.18 (native-scroll mode — no scrollerProxy).
- Modules attach to a shared `window.NB` namespace; one `gsap.ticker` drives everything (`js/app.js`).

## Mobile / accessibility

Three.js is skipped on mobile and under `prefers-reduced-motion` (`body.no-three`); the voyage falls back to a CSS starfield + stroke-drawn N. Journey steps stack without pins. The custom cursor disables itself on touch.

## Deploy

GitHub Pages via Actions: every push to `main` runs `.github/workflows/deploy-pages.yml` (Pages source must stay set to "GitHub Actions"). Live at:
`https://ceyre-boop.github.io/Northbound-Studio-/`

## Local dev

Serve the folder with any static server, e.g. `bunx serve -l 8080`, and open `http://localhost:8080`.
