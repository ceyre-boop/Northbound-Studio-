# Apply UX copy review to Northbound Studio homepage

## Context

A UX copy review (pasted by Colin) audited `index.html` and found the voice is
strong but five things cost conversions: a decoded-not-felt hero headline, two
competing CTAs, unqualified speed/capacity claims, a price floor that reads as
"minimum, so what's the max," and BUDDY introduced with no context on the form
floor. The review gives concrete rewrites per section plus three hero-headline
alternatives. Goal: land these edits directly in `index.html`, matching exact
existing strings (all confirmed via grep/read), preserving the DC-component
markup (`x-import ...>text</x-import>` and inline `style=` attributes) exactly
as-is around the copy changes.

One correction to the review's own read of the page: BUDDY is not "first
mentioned" at Floor 07. BUDDY is the page's tour-guide mascot, introduced in
the Floor 01 hero itself (`BUDDY · UNIT 04 · YOUR DEVELOPER` speech bubble,
`buddy-awesome.png` portrait, and the meta description already says "BUDDY
will explain everything on the way"). By Floor 07 every visitor has met
BUDDY several times. So the actual defect isn't "unexplained persona" — it's
the collision with Floor 05's "REAL PEOPLE · NOT A TICKET NUMBER" promise:
naming BUDDY as the one who replies makes a nervous buyer wonder if a bot
handles their lead. Fix: drop BUDDY from the Floor 07 reply line and say a
person replies, which also resolves the review's own concern without
inventing new BUDDY lore.

## Changes (in `index.html`, all plain text-content edits — no markup restructuring)

1. **Hero headline** (line ~90): `WE BUILD<br>UNFAIR<br>ADVANTAGES.` →
   `Sites that sell<br>while you<br>sleep.` (Option A from the review — direct,
   benefit-led default; matches the general small-business/no-niche framing
   used elsewhere on the page, unlike Option B's brick-and-mortar assumption).

   **Finding during exploration:** Floor 02's `<h2>` (line ~112) is *already*
   the literal string `Sites that sell while you sleep.` — this is exactly
   the line the review says is "the best line on the page" and "belongs at
   the top." So moving it to the hero would duplicate it on Floor 02 two
   sections later. Fix: move it up (delete from Floor 02, add to hero per
   above) and give Floor 02 a new, different `<h2>` that still introduces its
   three capability cards (fast marketing sites / booking & payments /
   motion-and-3D) without repeating the hero promise. Use: `What you actually
   need built.` — plain, sets up the list, doesn't compete with the hero
   line. Drop "unfair advantages" entirely; it isn't used anywhere else.

2. **Hero subhead** (line ~90): `Design and development for small businesses
   that want to stand out online. Seven floors down, one build up.` →
   `Design and development for small businesses that want to stand out
   online. Live in 48 hours. From $1,500. Text us when something breaks.`

3. **Hero CTAs** (lines ~92–93): keep `Start a project` as the primary
   button (unchanged, no `variant` = primary style already). The secondary
   button is already `variant="ghost"` (confirmed a real, already-used DS
   variant — no component change needed), so it's already visually demoted;
   just update its label text from `See the work` to `See the work ↓`.
   Confirm visually via screenshot that ghost reads clearly secondary next
   to primary.

4. **Scroll cue** (line ~97): `Scroll to descend` → `Scroll ↓`.

5. **Floor 03 speed** (line ~137): `Most agencies quote six weeks. We ship
   your first live build in 48 hours and take 2–3 projects a month so yours
   never sits in a queue.` → `Most agencies quote six weeks. Your first live
   build is up within 48 hours of kickoff, and we only take 2–3 projects a
   month so yours never sits in a queue.`

6. **Floor 04 price** (line ~153): `$1,500 minimum, set before we start, and
   it does not move. $99 a month keeps it hosted, updated and monitored —
   cancel any time. AI intake, auto-responders and CRM hookups from $500.` →
   `From $1,500. Fixed price, quoted before we start, and it does not move.
   $99 a month keeps it hosted, updated and monitored. Cancel any time. AI
   intake, auto-responders and CRM hookups from $500.`
   Also check the Floor 04 Stat card label `CORE SITE BUILD · UPFRONT` — no
   change needed there, it already says "core," not "minimum."

7. **Floor 05 chat mockup** (line ~165): `fixed. it was the payment key.` →
   `fixed. it was a Stripe setting.` (generic, since we can't verify this is
   a real client incident — treat as illustrative per the review's own
   caveat).

8. **Floor 06 heading** (line ~176): `Pick a starting point.` → `Pick a
   starting point. We build from here, not a template.`

9. **Floor 07 lead-in** (line ~193): `Two spots left this month. Tell us
   what you sell and BUDDY will get back to you within the day.` →
   `Taking 2–3 projects a month. Tell us what you sell and we'll get back to
   you within the day.` (drops unverifiable "two spots left" scarcity per
   the review's own instruction, and drops BUDDY from this specific line per
   the correction above — resolves the "real people" contradiction without
   fabricating an AI-assistant explanation that isn't true).

10. **Floor 07 form option** (line ~203): `Something cinematic` → `Something
    with motion or 3D` (matches Floor 02 terminology per the review).

11. **Floor 07 form option** (line ~201): `A storefront with checkout` → `An
    online store` (review's "Couldn't verify" section flags this as
    redundant/jargon; the review's own summary calls out this exact phrase
    as something a small-business owner wouldn't say).

12. **Submit button label** (`src="` state, ~line 468 in the `<script>`):
    confirm current default/idle label. Right now it's `'SEND IT'` for idle,
    `'SENDING…'` mid-request, `'SENT — BUDDY IS ON IT'` on success, and a
    `FAILED — EMAIL...` error state. The review asks for `"Send project
    details"` instead of a generic "Submit" — but the current idle label is
    already `SEND IT`, not `Submit`, so this criterion is already met;
    leaving as-is unless Colin wants the more explicit "Send project
    details" wording (worth a one-line note in the summary, not a silent
    change, since "SEND IT" is punchier and matches the page's voice better
    than the review's suggested generic-sounding alternative).

13. **Title / meta description** (lines 6–8): update to foreground the
    48h/$1,500/2–3-per-month claims per the review's "Next moves" note.
    `<title>Northbound Studio — The Descent</title>` can stay (brand name),
    but `<meta name="description">` and the `og:description`/
    `twitter:description` tags should lead with the concrete claims, e.g.:
    `Sites that sell while you sleep. Live in 48 hours, from $1,500. 2–3
    projects a month, real support after launch.` (trim to fit ~155 chars
    for the primary description; og/twitter can be same or slightly longer).

## Explicitly not doing

- Not touching Floor 02's own headline unless reading it shows it's weak
  enough to need the old hero line — verify first, don't assume.
- Not fabricating BUDDY-as-AI-assistant copy, since it isn't true — chose
  the "we'll get back to you" fix instead (see Context above).
- Not touching the accessibility/reduced-motion interaction (review flags
  this as a separate follow-up, `/design:accessibility-review`) — out of
  scope for this pass.
- Not adding a "not sure" option to any dropdown or auditing success-state
  copy beyond what's already read (review's "Couldn't verify" section) —
  only the fields actually present in the file are touched.

## Verification

1. `grep -c` each new string post-edit to confirm exactly one occurrence
   landed where intended and the old string is gone.
2. Serve locally (`bunx serve -l 8080`) and load in Chrome via
   Claude-in-Chrome; screenshot Floors 1, 3, 4, 6, 7 to visually confirm the
   CTA demotion, headline, and form copy read correctly and nothing broke
   layout (the DS `x-import` components render from `_ds_bundle.js` — a
   typo'd prop name would silently blank a component, so a visual check
   matters more than a grep pass alone).
3. Re-run the earlier stubbed-fetch form test (override `window.fetch`,
   fill name/contact, click submit) to confirm the Floor 07 changes didn't
   break the working Formspree submission wired in an earlier session.
4. Commit with a message summarizing the conversion-copy pass, push to
   `main`, and note in chat that GitHub Pages will redeploy northbound-dev.com
   automatically within a few minutes.
