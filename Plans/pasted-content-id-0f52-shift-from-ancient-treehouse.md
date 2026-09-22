# Five looks — a repeatable spec-site kit

## Context

Every prospect needs a site they can look at before they'll buy. Doing that by
hand each time is the bottleneck, and the flagship site (WebGL, Lenis, a ship
script, perf gates) is the wrong thing to copy: too much machinery for a
one-page spec build. This is the opposite — five plain versions of the
Northbound page, same words, five looks, each one file with no build step, no
dependencies and no JavaScript. Pick a look, swap the client's details, send a
link. Then we decide how to price the effort.

Found before planning, and it changes the shape:

- **The generator already exists.** `~/northbound-outreach` renders
  `templates/preview.html` per lead into `previews/<id>/index.html`, driven by
  `{{NAME}} {{TRADE}} {{CITY}} {{PHONE}} {{PHONE_TEL}} {{HEADLINE}}
  {{SERVICES_LIST}} {{RATING_BLOCK}} {{YEAR}}`, with 19 client previews already
  built. Five looks are five more templates in that same pipeline — not a new
  project. Reuse `renderLead()` (`src/preview.ts:32`) and `data/leads.schema.md`.
- That repo's own rule is "Bun + TypeScript, no external dependencies". The
  looks keep it: no fonts fetched at runtime unless a look calls for one, no
  framework, no build.

## The five looks

Same sections, same order, same copy, five visual directions. One
self-contained HTML file each (`<style>` inline, no JS), under ~30 KB:

| | Direction |
|---|---|
| `01-clean` | White, generous space, one accent. The safe one that never loses a deal. |
| `02-dark` | Near-black, single bright accent, big buttons. Closest to Northbound's own site. |
| `03-editorial` | Type-led: huge headline, rules and columns, almost no colour. |
| `04-photo` | Full-bleed photo hero with the text over it; the rest quiet. |
| `05-industrial` | Boxy, high-contrast, mono labels, visible grid. Reads as trades. |

Sections in every look: header with tap-to-call · hero (headline, one line, Call
+ Get a quote) · services · three reasons · quote form · footer with phone, city
and year. Mobile first, 44px targets, no sideways scroll at 390px.

## Files

- `templates/looks/0X-<name>.html` — the five, same token set as `preview.html`.
- `data/self.json` — Northbound as a lead record (name, "web design", Grand
  Ledge, 470-573-8908, services from the twelve offerings) so the five render
  with our own copy first. **No rating, no review count, no invented numbers** —
  `{{RATING_BLOCK}}` renders empty when the data isn't there.
- `src/looks.ts` — `bun run looks --lead self|<lead-id>` renders all five to
  `looks/<lead>/0X-<name>/index.html` plus a chooser page listing them.
  Token rendering moves from `src/preview.ts` into `src/lib.ts` and both callers
  use it (one renderer, not two).
- `src/looks.ts --serve` (`bun run looks:serve`) — one static server on :8200,
  prints the five URLs and the chooser.
- `README.md` — a "Five looks" section: render, serve, pick, ship to a client.

## The skill

`~/.claude/skills/NorthboundSpec/SKILL.md`, so this is one command next time and
the rules don't have to be re-said. It captures:

- **The process:** render → serve → look at all five at 390px and desktop →
  pick → swap in the client's details → screenshot → send.
- **The standing rules you've set**, in your words: sell the machine, not the
  website; plain words a contractor understands; the phone number is on every
  page and taps to call on mobile; mobile at 390px is the thing that must work;
  nothing unfinished ships, because unfinished reads as broken; no number,
  rating or claim that didn't happen; the form must actually reach an inbox and
  auto-reply before it counts as done; preview first, you merge; production only
  through `bun run ship`; spec sites stay back-to-basics — no WebGL, no smooth
  scroll, no build step.
- **The prices** (Beacon $3,500 · Engine $8,500 · Bearing $600/mo) as the
  current floor, marked as something we revisit, since how we sell this effort
  is still open.
- How to add a sixth look, and how to hand one to a client build.

## Verification

- `bun run looks --lead self && bun run looks:serve` → five URLs load.
- Each look, checked and screenshotted at 390×844 and 1280×800: no sideways
  scroll, the phone is a `tel:` link, the form is present, the page works with
  JavaScript disabled (there is none), total weight under 60 KB.
- `bun run looks --lead <a real lead id>` renders the same five with that
  business's name, trade, city and phone, proving the client path.
- Screenshots land in `looks/<lead>/shots/` and are copied to `~/Downloads`.

## Also still open (not part of this)

`salvage-v1` (support exchange + the morph's spring) is built, rebased, tested
and previewed at https://nb-descent-lcwswot57-taboost.vercel.app — waiting on
your word to merge and ship.
