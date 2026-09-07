# Northbound Studio — Identity: The Needle

## What this is

Northbound sells one thing: a studio that ships fast and tells you the truth.
The old identity said none of that — it said "generic dark SaaS with a cyan
accent," the same three fonts and the same glow every template on the internet
uses. This identity is built around a **compass needle**: a mark that is
literally two colours pointing in one direction, split down the middle —
warm and grounded on one face, cool and ascending on the other, pivoting on a
dark axis. It reads as precision (the needle, the grid-built wordmark) and as
warmth (the beacon-orange, Buddy's face) at the same time, because that's the
actual pitch: an engineer's discipline sold with a human's manner ("text us
when something breaks"). Every asset in this folder is built from that one
idea — nothing is decorative filler.

## The mark

`logo.svg` — a diamond needle, split Beacon (warm) / Signal (cool), pivoting
on an ink axis. Faceted guide-lines suggest folded metal, not a flat sticker.
Reads at any size down to a 16px favicon (`favicon.svg`, backed on an ink
rounded square so it holds up on light browser chrome too).

`wordmark.svg` — "NORTHBOUND" built on a 5×7 module grid, the same
"constructed, not drawn" logic as the mark. This is deliberately **not** a
font run through a text tool — it's a custom lettering system with its own
file, so it never depends on a font loading correctly to render right. Use it
whole; don't kern it, recolour individual letters, or set it lowercase.

`buddy.svg` — Buddy, redesigned. He was a rendered 3D robot; he's now the
Needle personified — a single circular beacon-body wearing the needle as a
tiny antenna, one cool rim-light on his cheek (the same warm/cool relationship
as the mark, in miniature), with feet that can kick and an antenna that can
wobble. Layer IDs (`buddy-body`, `buddy-eye-left/right`, `buddy-mouth`,
`buddy-antenna`, `buddy-foot-left/right`, `buddy-glow`) are there for the
motion pass — animate the group, not the whole file.

`og.svg` — 1200×630 social card assembled from the same mark + wordmark
geometry, not a separate composition.

## Colour system

Three hues, each with one job — not "dark plus an accent":

| Token | Hex | Job |
|---|---|---|
| `--color-beacon-500` | `#ff8a3d` | The one call-to-action colour. Apply, submit, primary buttons. |
| `--color-signal-500` | `#4fa8ff` | Interactive/informational: links, focus rings, in-progress states. |
| `--color-drift-500` | `#c792ea` | The unexpected relationship — rare, delight-only (badges, easter eggs). Never load-bearing, never paired 1:1 with Beacon in the same component. |

Neutrals are a **warm** ink ramp (`--color-ink-950` → `--color-ink-500`), not
blue-black — small deliberate difference from the old `#060608`, keeps the
particle hero from reading cold and clinical.

### Contrast, measured (WCAG 2.1 relative-luminance formula)

| Pair | Ratio | Passes |
|---|---|---|
| text-primary `#f2ede6` on bg-base `#0b0a0c` | 16.96:1 | AA & AAA (body) |
| text-secondary `#a39a94` on bg-base `#0b0a0c` | 7.16:1 | AA & AAA (body) |
| text-primary on bg-surface `#1c1a1f` | 14.82:1 | AA & AAA |
| text-secondary on bg-surface `#1c1a1f` | 6.25:1 | AA & AAA |
| beacon-500 as text/icon on bg-base | 8.42:1 | AA & AAA |
| ink-950 text on beacon-500 button fill | 8.42:1 | AA & AAA |
| ink-950 text on beacon-600 (hover) fill | 6.53:1 | AA & AAA |
| signal-500 as text/link on bg-base | 7.88:1 | AA & AAA |
| drift-500 as text/link on bg-base | 8.21:1 | AA & AAA |
| text-tertiary `#6b6169` on bg-base | 3.33:1 | **Large text / decorative only** (≥3:1) — never body copy |

Every colour that carries body text or an interactive label clears AA
comfortably; nothing was tuned down to "just passes."

### The luminance ceiling for the GLSL hero

The hero sits a full-viewport particle field behind live text, which the
table above can't protect on its own — luminance isn't fixed there, it's
whatever the shader outputs at that pixel. The rule:

- **`--hero-bg-luminance-ceiling: 0.15`** (relative luminance, 0–1 scale). Any
  region of the particle field sitting directly under `--color-text-primary`
  must stay at or below this — it's the exact value needed to hold 4.5:1
  against `#f2ede6`. Tune the shader's brightness/bloom clamp to this number,
  don't eyeball it.
- Body copy (`--color-text-secondary`) needs the field far darker than that
  to stay AA on its own (~0.035) — don't chase that in the shader. Instead,
  drop `--color-bg-scrim` (`rgba(11,10,12,0.64)`, already in `tokens.css`)
  behind any text block that isn't a short bold display line, and measure
  contrast against the *scrim*, not the raw particles.
- Large/bold display type (≥24px, the `--text-2xl` step and up) only needs
  3:1, which raises the ceiling to 0.25 for that type — hero headlines get
  more room than hero body copy.

## Type system

**Display + mono: JetBrains Mono. Text: Instrument Sans.** Two families, not
three, used with intent — the previous system's Syne was dropped.

Why: this studio's entire pitch is technical honesty — code, precision, "we
built this in 48 hours and it works." Elevating a monospace face to *display*
duty (oversized, bold, wide-tracked headlines) is an actual point of view a
generic geometric-sans display face (which is what Syne was competing to be —
every "modern studio" site already runs a Syne-shaped font) doesn't give you.
JetBrains Mono then does double duty as the utility mono (labels, prices,
timestamps), so the same face reads two ways: huge and structural, or tiny
and technical. Instrument Sans stays for body copy because it's genuinely
good at long-form reading and doesn't fight the mono for attention.

### Sourcing & licence

| Role | Family | File | Licence | Source |
|---|---|---|---|---|
| Display + mono | JetBrains Mono | `fonts/jetbrains-mono.woff2` (kept) | SIL Open Font License 1.1 | JetBrains, originally via Google Fonts |
| Text | Instrument Sans | `fonts/instrument-sans.woff2` (kept) | SIL Open Font License 1.1 | Instrument, originally via Google Fonts |

Both are self-hosted `woff2`, no runtime request to a third party, licence
explicitly permits embedding and web-serving. `fonts/syne.woff2` is no longer
referenced by the token system — it's dead weight now that Syne isn't in the
type system; whoever wires up `<link>`/`@font-face` downstream can delete it.

**Why not new files:** sourcing a fourth typeface responsibly means verifying
its actual OFL/licence text and pulling a real `woff2` — this environment has
no network access to Google Fonts/Fontshare/etc. to do that safely, and I'm
not going to ship a font file I can't verify the licence of. The honest move
was to recompose the two faces already vetted and already self-hosted into a
system that's actually decided, rather than invent a citation for a file that
doesn't exist here. If a specific new display face is wanted later, source it
with a real licence check before adding the `woff2`.

### Scale

1.25 (major third) ratio, base 16px, fluid via `clamp()`:
`--text-xs` (12px) → `--text-6xl` (61–95px, hero display). Full ramp in
`css/tokens.css`. Tracking tokens (`--tracking-tight` … `--tracking-widest`)
exist because the mono display face needs *negative* tracking at huge sizes
and *very wide* tracking at label size — don't use one tracking value
everywhere.

## Shape, elevation, motion

- **Radii are mostly square** (`--radius-xs` 2px → `--radius-lg` 16px).
  `--radius-pill` (999px) is reserved for badges/tags/dots only — primary
  buttons are NOT pills anymore. A studio whose whole identity is a precision
  instrument doesn't wrap its CTA in a rounded-off SaaS pill.
- Shadows (`--elevation-1/2/3`) are warm-tinted (`rgba(13,10,8,…)`), matching
  the warm ink ramp — a pure-black shadow on a warm background looks like a
  mistake.
- Glows (`--elevation-glow-beacon/signal/drift`) exist per-hue so a
  hover/focus state can borrow the same colour logic as the mark.
- Easing tokens (`--ease-standard`, `--ease-emphasized`) are unchanged in
  value from the outgoing system on purpose — the scroll choreography that's
  staying (helix, shatter) was already tuned to these curves, and there's no
  reason to break working motion math for the sake of novelty.

## Rules

1. The needle mark never appears in a single flat colour — it is always the
   Beacon/Signal split, or `--color-text-primary` when it must be monochrome
   (e.g. embossed/etched contexts). Never Drift.
2. Drift is a seasoning, not an ingredient — no more than one Drift element
   per screen, never on anything the user must click to proceed.
3. The wordmark is a locked asset (`wordmark.svg`) — don't rebuild it in a
   live font unless you're also loading the grid font-face; the grid glyphs
   and any live-type fallback must never appear side-by-side.
4. Buddy always keeps his antenna — it's the visual link back to the mark. He
   can lose the glow, change expression, or float off-model for a joke, but
   the antenna stays.
5. Everything downstream imports `css/tokens.css` and refers to tokens by
   name. If a value isn't in that file, it isn't in the system yet — add the
   token, don't hardcode the hex.
