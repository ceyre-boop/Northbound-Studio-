# Northbound Studio — Design System

A design system extracted from the **Northbound Studio** website
(`ceyre-boop/Northbound-Studio-`). Northbound Studio is a small
design-and-development studio (Grand Ledge, MI → worldwide) that builds
cinematic, high-converting marketing websites for small businesses — "design +
development for small businesses that want to stand out online." Their own site
is the pitch: a scroll-driven anime/HUD experience where a glowing **N**
wordmark, a WebGL light-helix, and a shatter effect prove the studio can build
anything, ending in a template picker and application form.

This system captures that brand's foundations (near-black cinematic canvas, a
single electric-cyan accent, Syne / Instrument Sans / JetBrains Mono type,
glow-driven elevation, HUD-bracket framing) as reusable tokens, components, and
a full marketing-site UI kit.

## Sources
- **GitHub:** https://github.com/ceyre-boop/Northbound-Studio- — the live
  vanilla HTML/CSS/JS site (no build step). Explore it for the original scroll
  choreography (`js/helix.js`, `js/animations.js`), exact CSS values
  (`css/style.css`), and copy (`index.html`, `README.md`, `ISA.md`). Reading
  these directly will let you extend this system with higher fidelity.
- Live site: https://ceyre-boop.github.io/Northbound-Studio-/

No design-system definition existed in the source — tokens and components here
were derived from the site's `css/style.css` `:root` block and markup.

---

## CONTENT FUNDAMENTALS

The voice is **confident, punchy, and short**. Declarative sentences, often
fragments, frequently ALL-CAPS for headlines: "WE BUILD UNFAIR ADVANTAGES.",
"Let's build yours.", "Pick a starting point." Periods are used as beats even
on short lines.

- **Person:** "we" (the studio) speaking directly to "you/your" (the client).
  Never corporate third-person.
- **Tone:** swaggering but warm and human — "That's what we do.", "We don't
  disappear after launch. Something breaks? Text us. We fix it.", "We're not
  most agencies." It sells by contrast with big agencies, not by listing features.
- **Casing:** headlines in Syne are usually sentence-case ("Let's build yours.")
  or full-caps for the big statements. Labels, eyebrows, prices, and captions are
  **UPPERCASE mono with wide 0.14em tracking** ("CHOOSE YOUR STYLE", "START A
  PROJECT", "ONGOING SUPPORT · REAL PEOPLE · NOT A TICKET NUMBER").
- **Punctuation quirks:** middot separators (`·`) in mono strings; en-dashes in
  prices ($400–600); arrows (↗, →) for links and geography.
- **Emoji:** used *sparingly and only for human texture* — the support thread has
  one "😳". Not in headings, labels, or UI chrome. Don't sprinkle emoji.
- **Numbers as proof:** "< 2 WEEKS", "$250+", "100%", "2–3 projects per month",
  "Most agencies charge $5,000+". Concrete, scarcity-flavored.
- **Vibe:** premium indie studio that ships fast and texts you back. Cinematic
  confidence without being cold.

---

## VISUAL FOUNDATIONS

**Overall vibe:** cinematic, dark, HUD/sci-fi. The site feels like a targeting
interface flying through space, lit by a single cyan light source.

- **Color:** a near-black canvas (`--bg #060608`) with layered dark surfaces
  (`#0c0c10 → #16161e`). **One accent — electric cyan `#00F0FF`** — carries the
  entire brand (glows, focus, selection, links, the N). A green `#00C853` is the
  only secondary, reserved for success. Text is a soft off-white `#E8E8ED`
  stepping down through muted `#7A7A8E` to dim `#4A4A5E`. No other hues.
- **Type:** **Syne 800** (display, headlines, wordmark) with tight `-0.03em`
  tracking — except the wordmark, which spreads to `0.1em`. **Instrument Sans**
  for body/UI at 1.6 line-height. **JetBrains Mono** uppercase + 0.14em tracking
  for every label, price, eyebrow, and caption.
- **Backgrounds:** full-bleed near-black with **radial cyan glow washes** at the
  top of sections (`radial-gradient(... var(--accent-subtle) ...)`). A
  fixed **film-grain overlay** (SVG fractal noise, ~3.5% opacity) sits over
  everything. No photographic backgrounds; imagery is anime character art
  (absent in source — see below) and WebGL particles.
- **Borders:** hairline, almost always `rgba(255,255,255,0.06)`, brightening to
  `0.12` on hover. Accent borders are cyan for selected/focused states.
- **Corner radii:** inputs & preview thumbs `10px`, chat bubbles `16px`, cards &
  panels `18px`, tiny chips `4px`, and **`999px` pills** for all buttons and tags.
- **Cards:** translucent dark glass — `rgba(12,12,16,0.8)` + `backdrop-filter:
  blur(20px)`, hairline border, `18px` radius. No opaque drop shadows by default;
  selection adds a cyan outer glow + faint inset glow and a `scale(1.02)`.
- **Shadow / elevation system:** built from **cyan light-bleed**, not black
  drops. Hover blooms `0 0 26px var(--accent-glow)`; primary buttons add a lifted
  `0 12px 40px -8px` cyan shadow; floating art uses a deep `0 24px 60px
  rgba(0,0,0,0.6)` drop plus an inner cyan glow.
- **HUD brackets:** four cyan L-shaped corner brackets frame the hero and the
  form — the signature "reticle" motif (see `HudFrame`).
- **Animation:** everything eases on `cubic-bezier(0.22,1,0.36,1)` (and a more
  dramatic `0.16,1,0.3,1` for panel slides). Motifs: per-letter reveals, a
  center-out rule draw (`scaleX 0→1`), gentle infinite float on hero art,
  pulsing scroll arrow, glow pulses on the N, and the scroll-scrubbed WebGL
  voyage. Chat bubbles pop in with a `back.out` bounce. No harsh linear motion.
- **Hover states:** lift `translateY(-2px)` (cards `-3px`) + brighter border +
  cyan glow. Ghost buttons flip text/border to cyan.
- **Press / selected:** selection = cyan border + outer glow + `scale(1.02)`
  (cards grow slightly rather than shrink).
- **Transparency & blur:** used on the sticky nav (`blur(20px)` once scrolled)
  and glass cards (`blur(20px)`). Blur signals "floating above the scene."
- **Layout:** content capped at `--maxw 1180px` inside a fluid gutter
  `clamp(1.25rem,4vw,3rem)`; sections are near-full-viewport-height and
  center-aligned. Fixed elements: nav (top), film grain (everywhere), custom
  comet cursor on desktop.
- **Imagery vibe:** cool and dark — cyan-lit anime characters over black, deep
  drop shadows, grain. Warm only via the single green success accent.

---

## ICONOGRAPHY

Northbound Studio uses **almost no icons** — the aesthetic is typographic and
CSS-drawn, not icon-driven.

- **No icon font, sprite, or SVG icon set.** The one meaningful SVG is the
  stroke-drawn **N** in the voyage fallback (`<path d="M10 50 V6 L50 50 V6">`),
  reused in this kit's `Voyage.jsx`.
- **CSS-drawn "iconography":** the HUD corner brackets, the chevron on selects,
  and the scroll-cue arrow are all pure CSS borders rotated 45° — not glyphs.
  This system reproduces them the same way (see `HudFrame`, `Select`).
- **Unicode as icons:** arrows `↗` (links) and `→` (geography), middots `·` as
  separators. These are the only "icons" in running text.
- **Emoji:** one "😳" in the support chat, for human texture only.
- **Logo / brand mark:** the source ships **no logo file** — the mark is the
  letter **N** rendered in Syne 800 (in a bordered box in the nav, glowing in the
  footer and hero). This system does the same; **no logo was invented**. If a
  real mark exists, drop it in `assets/` and swap the `N` glyphs.

If you need icons for an extension, add a CDN stroke set (e.g. Lucide) at ~2px
weight to match the thin HUD lines — flag it as an addition, since the source
has none.

---

## Intentional additions

- **`Card`** — the source only styles a full "template card"; this system
  factors out the underlying glass surface so consumers can box any content.
  `TemplateCard` is built on it.
- **`HudFrame`** — extracted the repeated corner-bracket markup (hero + form)
  into one reusable wrapper.
- **`Stat`, `Eyebrow`, `Tag`, `Bubble`, `Input`, `Select`** — factored from
  inline site markup into reusable primitives. No families were invented beyond
  what the site already renders.

---

## Index / manifest

**Root**
- `styles.css` — entry point; `@import`s every token + font file. Consumers link this.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`.
- `thumbnail.html` — homepage tile.
- `SKILL.md` — Agent-Skills-compatible entry.

**Components** (`window.NorthboundStudioDesignSystem_3c18cf.*`)
- Core — `Button`, `Tag`, `Eyebrow` (`components/core/`)
- Forms — `Input`, `Select` (`components/forms/`)
- Feedback — `Bubble` (`components/feedback/`)
- Marketing — `Card`, `TemplateCard`, `HudFrame`, `Stat` (`components/marketing/`)

**Foundation cards** — `guidelines/*.card.html` (Colors, Type, Spacing, Brand).

**UI kit** — `ui_kits/marketing-site/` — full interactive site recreation
(`index.html` + Nav / Hero / Voyage / Journey / TemplatePicker / ApplyForm / Footer).

---

## CAVEATS
- **Fonts** are the real ones (Syne, Instrument Sans, JetBrains Mono) loaded
  from **Google Fonts** via `@import` — no self-hosted binaries, so no
  `@font-face` files ship. Swap in `.woff2` files + `@font-face` rules if you
  need offline/self-hosted fonts.
- **No logo file** exists in the source; the **N** wordmark stands in.
- The **WebGL helix/N-shatter voyage** is not reproduced — the kit uses the
  repo's own CSS starfield fallback. See `js/helix.js` in the source to rebuild it.
- **No character art** exists in the source repo; the hero shows the studio's
  shipped fallback panels.
