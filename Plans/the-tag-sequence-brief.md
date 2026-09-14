# BAD BOT — the tag sequence, and the part of it that is still pretend

Status: choreography shipped and live. **Character art is a stand-in.**

This is the in-depth brief for finishing it. It says exactly what is real,
exactly what is fake, and what has to be made — so the next pass replaces the
stand-in without touching a single frame of timing that already works.

---

## 1. What is on the live site right now

Open <https://northbound-dev.com/> and watch the hero for about five seconds.
A small orange figure walks in from the left, stops, sprays, turns toward you,
crouches, and bolts off the right edge. The headline paints on while he sprays.

That whole sequence is **four beats plus an exit**, driven by one attribute
(`data-stage`) flipping on one element. Timings, from `js/hero-tag.js`, and
these are the single source of truth — `css/hero-tag.css` is written to match
them by hand:

| Beat | `data-stage` | ms | What happens |
|---|---|---|---|
| 1 | `sneak` | 1100 | Enters bottom-left, small (0.68 scale), low and quick. Reads as distance. |
| 2 | `tag` | 1400 | Plants, arm comes up, **the headline paints on in sync** — `--tag-delay` and `--tag-duration` are read straight from `SNEAK_MS`/`TAG_MS`, so the paint and the arm cannot drift apart. |
| 3 | `approach` | 1100 | Turns, walks toward camera. Scale 0.68 → ~1.0. This is the depth cheat: no 3D, just scale and a rising ground line. |
| 4 | `anticipate` | 200 | Crouches back the wrong way. The old Disney tell — a fast move reads as fast because of the stillness before it. |
| 5 | `bolt` | 700 | Leaves frame right, scale ~1.4, with a two-frame smear instead of inbetweens. Looks wrong frozen, correct in motion. |
| — | `gone` | — | Removed. Headline locks to `--done`. |

Three fixes already went in and should not be re-litigated:

- **Ground line at 42%, not 26%.** 26% was measured against the arrival
  *section*, which is taller than a viewport, and put him standing on the body
  copy.
- **A feathered mask over the paint's leading edge.** A bare `clip-path` reads
  as a guillotine wipe. Feathered, it reads as a spray front.
- **Sneak scale 0.50 → 0.68.** At 0.50 he was a small dim smudge against the
  dark aurora and nobody would have noticed him arrive at all.

Verified by querying his real x/y/scale at each stage boundary rather than by
screenshotting at fixed timestamps, which kept landing in the wrong beat:

```
sneak      x 130  y 524  w 60
tag        x 131  y 524  w 60
approach   x 539  y 493  w 89
anticipate x 936  y 534  w 207
bolt       x 1778 y 538  w 254
gone
```

**Keep all of the above.** It is the part that works.

---

## 2. What is pretend

### 2.1 It is the wrong Buddy

There are two different characters on this page right now and they do not look
like the same species.

- **The designed robot** — `buddy-thinking-sm.webp`, `buddy-salute-sm.webp`,
  `buddy-awesome-320w.webp`. Blue and brown, armoured, visored, properly lit.
  This is the mascot in the offerings section.
- **The tagger** — `brand/buddy-tagger.svg`. A flat orange disc with two
  chevron feet, two dot eyes, a stick arm and a spray can. I drew it. It is a
  rigged copy of the old `brand/buddy.svg` beacon mark with an arm bolted on.

The tagger exists because **the designed robot cannot be animated.** It is
three raster photographs. A raster cannot crouch, cannot squash, cannot drag
an antenna a beat behind the body. So the sequence was built against a vector
stand-in that *can* do those things, on the bet that the choreography was the
hard part and the art could be swapped in later.

That bet held. The choreography is right. The art is now the whole remaining
job.

### 2.2 He never actually sprays

He has a can. The can has no output. There is no jet, no particle cone, no
overspray haze, no hiss-and-release, and no fresh-paint drip forming under the
letters he just laid down. The headline paints on beside him, which sells it
at a glance, but nothing connects his can to the wall.

### 2.3 He never looks at you

Beat 3 walks him toward camera and that is all it does. There is no moment
where he registers being seen — the thing that makes a character read as alive
rather than as a moving asset.

### 2.4 It plays once and is gone

No re-trigger on scroll back to the hero, no idle behaviour, no reaction to
the cursor. He performs and vanishes, permanently, for the whole session.

### 2.5 The exit has no follow-through

He leaves the frame and the frame forgets him instantly. No dust, no dropped
cap rolling, no rattle of the can left behind — nothing that says a thing just
happened here.

---

## 3. What has to be made

### 3.1 The rig — the one blocking item

Everything else depends on this. Two routes, and route A is the right one:

**A. A vector rig in the robot's design language.** Redraw the designed robot
as SVG, in parts, so CSS transforms can pose it. This is what the stand-in
already is; it just looks like the wrong character. The parts the choreography
needs — these are the group ids the CSS already drives, so matching them means
the swap is a file replacement and nothing else:

| id | Must be able to |
|---|---|
| `tag-rig` | The only group the choreography transforms directly. Everything composes inside it, so a translate/scale on it moves a fully posed character rather than a flat sprite. |
| `tag-body` | Squash and stretch, volume preserved. |
| `tag-feet` | Two independent feet, so a walk cycle is possible. |
| `tag-face` | Eyes and mouth as separate paths — this is where "he looks at you" lives. |
| `tag-antenna` | Overlap and drag. Runs on a longer, bouncier timer than the body so it always arrives a beat late. On the designed robot this is the head crest or the visor light. |
| `tag-arm`, `tag-arm-limb`, `tag-can` | The spraying arm. Limb is a stroked path so it can bend. |
| `tag-shadow` | Contact shadow. Grounds him; scales with the depth cheat. |

Keep the geometry in the same 200×240 viewBox so every existing keyframe
value stays valid.

**B. A pose sheet.** 8–12 raster poses in the same rendered style as the three
existing ones — sneak, plant, spray-up, spray-down, turn, front, crouch,
launch, smear, and two walk frames. Swap poses on the beat boundaries, do the
travel with transforms.

Route B is faster to produce and worse to own: it cannot squash, cannot drag,
cannot react to the cursor, and every future beat needs new art. Route A costs
one drawing pass and then never costs anything again.

### 3.2 The spray

Owned by a new `js/hero-spray.js` + `css/hero-spray.css`; nothing in
`hero-tag.js` changes except firing one event at the `tag` boundary.

- A cone of particles from the can's nozzle, angled at the letters
- Overspray haze on the wall around the fresh paint, in the aurora's cyan
- One or two drips forming *after* the paint lands, not with it — paint runs
  late, that delay is the whole read
- Off entirely under reduced motion and below 640px, same as the hero drips

### 3.3 The look

One beat, 200–300ms, inserted between `approach` and `anticipate`: eyes track
to camera, brief hold, then the crouch. Costs nothing, and it is the single
highest-value addition in this document.

### 3.4 Re-trigger and idle

- Replay when the hero re-enters the viewport after having been left, at most
  once every 30s
- An idle loop while he is on screen — breathing, the antenna settling
- Optional: eyes follow the cursor while idle, which `js/motion.js` already
  publishes a smoothed cursor for

### 3.5 The exit

- A dust puff at the launch point, dissipating over ~400ms
- The can left behind for a beat, then gone

---

## 4. Constraints that do not move

- **CLS is exactly 0.** Transform and opacity only. Nothing in this sequence
  may participate in layout. It is `position: fixed`, pointer-events none.
- **Frame budget.** The page's measured median is ~8.4ms of a 16.7ms budget.
  This is a decoration; it gets the headroom, not the budget.
- **Reduced motion.** No sequence at all — one composed still, with the
  headline already painted. That is not a degraded version, it is the frame
  most visitors on this machine will ever see, so it gets art-directed first.
- **No JavaScript, no WebGL, no fetch.** The headline is real DOM, real font,
  selectable, screen-reader-readable, and present with all three off. The
  sequence is additive and its absence must be invisible.
- **It is not part of the Stage.** It self-mounts, plays once, and owns its own
  files. Do not give it a slot, a GL context, or a frame subscription.

---

## 5. Acceptance

1. The character in the hero is recognisably the same character as the mascot
   in the offerings section. Put the two side by side; if a stranger would call
   them different characters, it is not done.
2. All five beat timings unchanged. The positions table in §1 still measures
   the same, within tolerance.
3. The can visibly produces the paint.
4. He looks at the viewer once.
5. Reduced motion: one still, headline painted, no console errors.
6. 390×844: no horizontal overflow, no sequence below 640px if it costs frames.
7. CLS still exactly 0 on the perf gate.

---

## 6. Ownership

| File | Owner |
|---|---|
| `brand/buddy-tagger.svg` | Character — the rig, route A |
| `js/hero-spray.js`, `css/hero-spray.css` | Spray — new files, no conflicts |
| `js/hero-tag.js`, `css/hero-tag.css` | Sequence — the look beat, re-trigger, exit follow-through |

Three departments, no shared files. The rig's group ids in §3.1 are the
contract between them; freeze those before anyone starts.
