# Northbound Studio — Identity: The Fragment

## What this is (v2)

v1 of this identity was a compass-needle icon in flat orange/blue with a dot
in the middle, a dot-matrix wordmark, and a mono code-font pushed into
display duty. Rejected, correctly — it read as a 2012 startup glyph and a
developer-portfolio cliché, not a studio that can stand next to Resn or
Active Theory. This version starts from what those studios actually do,
measured directly rather than guessed at: **true black**, restraint over
ornament, and colour that only ever shows up as *light hitting a form* —
rim-light, glow, a thin chromatic fringe where a highlight is strong enough
to split — never a flat icon fill.

The identity is now **The Fragment**: an irregular shard, almost entirely
void, that only becomes visible because light is hitting one of its faces.
The unlit face recedes back into black. Everything else in this system —
the wordmark, Buddy, the OG card — is drawn with that same logic: dark
material, one lit edge, one hue.

## The mark

`logo.svg` — a jagged, asymmetric polygon (never a diamond, lozenge, arrow,
or needle) filled with a near-black radial gradient that's barely lighter
than the page. One face of the shard carries a bright rim-light stroke
(white-hot at the top, cooling to Ion blue, fading to nothing at the
bottom); the opposite face carries only a faint grey line and otherwise
disappears into the void. A single short segment at the brightest point of
the lit edge carries a violet-magenta fringe stroke on `mix-blend-mode:
screen` — the one place colour "splits," the way a lens does at a hard
highlight. That fringe never appears anywhere else in the system. Verified
at both 400px and inside a 16px `<img>` render (see Method, below) — it
stays a coherent, deliberately unresolved shard at large size and a bright,
distinct silhouette at favicon size.

`favicon.svg` — the same shard, simplified for 16px legibility, backed on a
solid black rounded tile so it stays visible against light browser chrome.

## The wordmark

`wordmark.svg` — bespoke outlines, not a font and not a grid. Every letter
in NORTHBOUND is a hand-built monoline skeleton: straight strokes for N/T/H,
compass-drawn arcs for the bowls of R/B/D and the counter of O/U — the same
vocabulary an architect's stencil lettering or Active Theory's "nbarchitekt"
uses, produced honestly as original paths rather than traced from a
reference font. It's rendered with the identical two-layer treatment as the
mark: a soft blurred Ion under-glow, then a sharp gradient stroke (white-hot
top, Ion-blue bottom) on top — so the wordmark and the mark are visibly the
same light, not two unrelated assets. Use it whole, at the aspect ratio it
ships in; don't re-set it, don't recolour individual letters, don't put it
over a background bright enough to fight the glow.

## Buddy

`buddy.svg` — completely rebuilt. He is not a mascot with a face — no eyes,
no mouth, no smiley circle. He's a small, loose fragment of the same
material as the mark: an asymmetric shard with a living core (a soft white
Ion glow, `buddy-core`) and a thin trail of drifting embers (`buddy-trail`)
peeling off behind him. His "expressions" are structural, for the motion
director to drive:

- **`buddy-core`** — brightness and radius = how alert/awake he is; a slow
  scale/opacity pulse is his idle "breathing."
- **`buddy-fragment`** — rotation/tilt = attention (tilt toward the cursor,
  toward a section as it scrolls in).
- **`buddy-trail`** — particle count/spread/opacity = how fast he's moving;
  dense and long while scrolling, a few embers at rest.
- **`buddy-glow`** — ambient halo radius = overall presence/energy for
  transitions (flare it briefly on click/success states).

He keeps his character without a face because the core and the trail already
read as "alive" — a held breath of light behaves like a creature without
needing to draw one.

## Colour system

**One chromatic idea, not two brand colours.** Ion is a single cool cyan that
exists only as light: gradients, glows, rim-strokes. It never fills an icon
flat. Fringe is Ion's own refraction — a violet-magenta that appears *only*
as a 1px edge where a highlight is brightest, on an additive blend, and
nowhere else in the UI (never a background, never a button, never body
text). That's the "interference pair that only appears at edges" reading of
the brief, chosen over a second flat brand colour.

| Token | Hex / value | Job |
|---|---|---|
| `--color-void` | `#000000` | Page ground. True black — not tinted, not lifted. |
| `--color-ion-500` | `#6fe3ff` | The one interactive/brand hue: links, focus rings, CTA light, glows. |
| `--color-ion-600` | `#35b8de` | Hover/pressed depth of the same hue. |
| `--color-fringe-500` | `#ff7ad1` | Edge-only chromatic aberration. Decorative. Never a fill, never text, never a button. |

Neutrals are a true, cool black ramp (`--color-black-1` → `--color-black-3`)
lifted only enough off `#000000` to separate UI layers — no warmth added,
because the reference bar's grounds have none.

### Contrast, measured (WCAG 2.1 relative-luminance formula)

| Pair | Ratio | Passes |
|---|---|---|
| text-primary `#f1f2f4` on void `#000000` | 18.75:1 | AA & AAA (body) |
| text-secondary `#9a9ba3` on void | 7.59:1 | AA & AAA (body) |
| text-primary on surface `#0c0c0f` | 17.44:1 | AA & AAA |
| text-secondary on surface `#0c0c0f` | 7.06:1 | AA & AAA |
| ion-500 as text/icon/link on void | 14.11:1 | AA & AAA |
| ion-600 as text/icon/link on void | 9.06:1 | AA & AAA |
| inverse text (`#050506`) on ion-500 button fill | 13.69:1 | AA & AAA |
| fringe-500 on void (reference only — not used as text/UI colour) | 8.96:1 | n/a, decorative |
| text-tertiary `#64656e` on void | 3.63:1 | **Large text / decorative only** (≥3:1) |
| text-tertiary on surface `#0c0c0f` | 3.37:1 | **Large text / decorative only** (≥3:1) |

Every colour that carries body text or an interactive label clears AA with
real margin. Fringe is measured for completeness but is never load-bearing —
it is an edge effect, not a UI colour, so it isn't held to the text-contrast
bar.

### The luminance ceiling for the GLSL hero

- **`--hero-bg-luminance-ceiling: 0.15`** (relative luminance) — the exact
  value that holds 4.5:1 against `--color-text-primary`. Clamp the shader's
  brightness/bloom to this wherever the hero renders text directly on top of
  the particle field.
- Body copy (`--color-text-secondary`) needs the field far darker on its own
  (~0.034) to hit AA unassisted — don't chase that in the shader. Drop
  `--color-bg-scrim` (`rgba(0,0,0,0.68)`, in `tokens.css`) behind any text
  block that isn't a short, bold display line, and measure contrast against
  the scrim, not the raw particles.
- Large/bold display type (≥24px, `--text-2xl` and up) only needs 3:1,
  raising the ceiling to 0.26 for headline-scale text.

## Type system

**Text: Instrument Sans. Display: bespoke SVG lettering — deliberately not a
webfont.**

Instrument Sans stays because the brief said it could if defended: it's a
genuinely well-built humanist grotesk with real optical sizing, it's already
self-hosted under a licence that permits this, and swapping it purely to
prove novelty would cost real legibility for no gain — the studio's voice is
short, direct sentences, and this face carries that at both hero-lede and
body sizes without calling attention to itself, which is the correct job for
a text face next to a display system this graphic.

Display is **not** a font, on purpose. The rejected v1 used JetBrains Mono at
display size, which reads as "developer portfolio," not "studio" — a
monospace code face signals implementation, not craft. The correct fix isn't
to swap in a different licensed display font found blind (this environment
has no network access to verify a new typeface's licence, and shipping a
`woff2` nobody can confirm the rights on is worse than not shipping one) —
it's to do what a studio that draws its own logotype actually does: **the
wordmark is hand-drawn outlines, and headline-scale display moments use that
same drawn vocabulary or fall back to Instrument Sans at weight 700+**. This
is listed in `tokens.css` as `--font-display: "Northbound Display", var(--font-text)`
— "Northbound Display" is not a font file that ships; it's a signal to
whoever builds a heading component that oversized/hero-scale display
moments should be evaluated for bespoke SVG lettering first, with Instrument
Sans Bold as the honest fallback rather than a second typeface.

### Sourcing & licence

| Role | Family | File | Licence | Source |
|---|---|---|---|---|
| Text | Instrument Sans | `fonts/instrument-sans.woff2` (kept) | SIL Open Font License 1.1 | Instrument, originally via Google Fonts |
| Utility mono (data/timestamps/code only — never display) | JetBrains Mono | `fonts/jetbrains-mono.woff2` (kept) | SIL Open Font License 1.1 | JetBrains, originally via Google Fonts |
| Display | Bespoke SVG outlines (`wordmark.svg`, this folder) | — | Original artwork, no licence needed | Drawn for this project |

`fonts/syne.woff2` is not referenced by the token system in either version
of this identity — it's dead weight; whoever wires up `<link>`/`@font-face`
downstream can delete it.

## Shape, elevation, motion

- **Radii are mostly square** (`--radius-xs` 2px → `--radius-lg` 16px).
  `--radius-pill` (999px) is reserved for badges/tags/dots only.
- Shadows (`--elevation-1/2/3`) are neutral, true-black-based
  (`rgba(0,0,0,…)`) — no warm tint, matching the cool true-black ground.
- `--elevation-glow-ion` / `--elevation-glow-fringe` exist for hover/focus
  states that want to borrow the mark's own light logic instead of a plain
  drop shadow.
- Easing tokens (`--ease-standard`, `--ease-emphasized`) are unchanged from
  the outgoing system on purpose — the scroll choreography that's staying
  (helix, shatter) was already tuned to these curves.

## Rules

1. Ion never fills a shape flat. It is a gradient, a stroke, or a glow — the
   moment it becomes a solid icon fill, it stops being "light" and becomes
   "a brand colour," which is the mistake this version corrects.
2. Fringe appears at edges only, on an additive/screen blend, never as a
   fill, never as text, never as a button colour, and never covering more
   than a short segment of any given shape's brightest edge.
3. No compass needles, arrows, diamonds, lozenges, or letter-in-a-box marks
   anywhere in this system going forward — the geometry vocabulary is
   irregular faceted shards, not tidy geometric icons.
4. The wordmark is a locked asset (`wordmark.svg`). If a live-type fallback
   is ever needed (e.g. a `<title>` tag), it falls back to Instrument Sans
   Bold, never to a substitute display font — the two visual languages don't
   mix on screen at the same time.
5. Buddy never gets eyes, a mouth, or a face. His moods are the core's
   brightness, the fragment's tilt, and the trail's length — animate those,
   not a cartoon expression.
6. Everything downstream imports `css/tokens.css` and refers to tokens by
   name. If a value isn't in that file, it isn't in the system yet — add the
   token, don't hardcode the hex.

## Method

Built and checked without live network access to the reference sites myself
in this pass either — this version is a direct response to the coordinator's
own on-site measurements (ground colour, canvas count, "light on form," the
named typefaces) rather than a second blind guess, and every deliverable was
rendered through a real Chromium instance (via this repo's existing
Playwright dependency) at both display size and a true 16×16 viewport for
the favicon, not just opened as flat markup, to confirm the glow/gradient/
blend-mode treatment actually resolves the way it's described here.
