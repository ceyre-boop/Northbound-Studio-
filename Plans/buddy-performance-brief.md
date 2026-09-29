# Buddy: the performance brief

**Buddy builds your machine, and you watch him do it.**

One character and one job, carried down the whole site. Every clip below serves that story: it moves the story forward or answers something the visitor just did. Nothing is there only to be cute.

> **Which robot:** the navy-and-graphite Buddy with the lilac visor (`buddy-awesome.webp`), never the teal-and-gold `buddy-tagger`.

---

## The story, floor by floor

| # | Floor | What the visitor does | What Buddy does | Register |
|---|---|---|---|---|
| 0 | Loader | Waits | Powers on: visor lights up, he sits up, cracks his knuckles | Movie |
| 1 | Hero, "We build the machine." | Reads, answers "How important is it to you?" | Types at his desk. Reacts to the answer: the more it matters, the harder he works | Movie |
| 1→2 | Scroll down | Scrolls | Saves, stands, picks up the part he just built, walks off with it | Movie |
| 2 | The twelve parts | Picks parts | Arrives, sets up a workbench, catches every part they pick and bolts it onto a machine that grows as they choose | Commercial: he is the interface |
| 2→3 | Scroll down | Scrolls | Lifts the machine he built and carries it downstairs | Movie |
| 3 | The prices | Compares three packages | Sets the machine down, weighs it up, points at the package that covers what they picked | Commercial |
| 3→4 | Scroll down | Scrolls | Grabs a clipboard, pulls up a stool | Movie |
| 4 | The form, "Tell us what the job is." | Types | Listens, writes along, looks up when they pause, salutes when they send | Movie |
| 5 | The ribbon (infinite) | Keeps scrolling forever | Walks the ribbon like a treadmill, forever. Now and then glances at camera, waves, checks a part, sits on the edge | Movie, looping |

The through-line: **how much you put in is how hard he works.** Floor 1 asks "How important is it to you?"; his answer is his effort. Floor 2 builds exactly what you picked. Floor 3 recommends what fits it. Floor 4 writes down what you say. The ribbon is the machine running after launch, which is what Bearing is.

---

## How to read each clip

- **Name.** Use it exactly as the clip name in the export. The code looks clips up by name.
- **Plays.** How it is driven:
  - **LOOP:** its own clock, first frame equals last frame.
  - **SCRUB:** the page's scroll position drives its time, so it has to look right played backwards too.
  - **ONE-SHOT:** triggered by a visitor action, plays once, then blends back to a loop.
- **Starts / Ends.** One of the named poses in the Pose Library below. Clips connect only through these poses, which is what makes any order of events blend cleanly.
- **Frames.** At 30 fps.

---

## Pose library (hit these exactly; every clip starts and ends on one)

| Pose | Description |
|---|---|
| `P_OFFLINE` | Seated at the desk, powered down. Head bowed about 25°, arms resting on the desk edge, visor dark. |
| `P_SEAT_TYPE` | Seated, back straight with a slight lean in (about 8°), forearms level, fingers on the keyboard home row, eyes (visor) on the monitor. |
| `P_STAND` | Standing at rest, weight even, arms loose, facing the direction given in the clip. |
| `P_STAND_HOLD` | Standing, holding "the part" (a glowing cube, 18 cm, see Props) in both hands at chest height. |
| `P_CARRY` | Standing, carrying "the machine" (a box, 45 × 35 × 35 cm) at waist height in both arms, leaning back about 5° for the weight. |
| `P_BENCH` | Standing at a workbench, hands resting on its top, looking down at it. |
| `P_STOOL_NOTES` | Perched on a stool, clipboard on his left forearm, pen in his right hand hovering over it. |
| `P_RIBBON_WALK` | Mid-stride on the ribbon: the contact frame of the in-place walk. |

---

## 0 · The loader: he boots up

The loader panel folds into the hero's code editor, and **that is when he wakes**.

### `boot_power_on`: ONE-SHOT · 75 frames (2.5 s) · `P_OFFLINE` → `P_SEAT_TYPE`
- **f0–15:** Still. Dark visor. One small servo twitch in the right hand (f8).
- **f15–30:** The visor flickers on in three stutters (emissive 0 → 30% → 0 → 60% → 0 → 100%), the way a fluorescent tube strikes.
- **f30–45:** Head lifts, as if he just heard something. The chest light strips come on.
- **f45–60:** Sits up straight, shoulders roll back. Interlaces his fingers and pushes them out (knuckle crack). Add a subtle recoil.
- **f60–75:** Hands drop onto the keys and settle into `P_SEAT_TYPE`.
- **Note:** this is the first thing anyone sees him do. Weight and timing matter more than detail. The visor strike is what makes it feel alive.

---

## 1 · Hero: he works for you

### `type_loop`: LOOP · 120 frames (4 s) · `P_SEAT_TYPE` → `P_SEAT_TYPE`
- Continuous typing in uneven bursts (real typing isn't even): about 1.5 s fast, a 0.4 s pause, 1 s fast.
- **f55:** A glance down-left at an imaginary note on the desk, then back.
- **f100:** A little flourish. The right index finger lifts high and comes down on Enter; a satisfied micro-nod.
- Visor pulse: brightens 10% on the Enter hit.
- Loop seam: f0 = f120 exactly. No pop.

### Answer reactions (the visitor picks "How important is it to you?")

All three are **ONE-SHOT** clips that start and end on `P_SEAT_TYPE`, then hand back to a typing loop. Each answer switches the loop to a new speed tier (see below).

**`react_look`** (answer: "Worth a look"): 45 frames
- **f0–12:** Stops typing, turns his head to screen-right (toward the question). One small nod.
- **f12–30:** Holds a beat, friendly.
- **f30–45:** Back to the screen, resumes typing at a normal pace.

**`react_matters`** (answer: "It matters"): 60 frames
- **f0–12:** Stops, looks screen-right.
- **f12–24:** Sits up straighter, rolls his neck.
- **f24–40:** Pushes the chair in a little closer to the desk.
- **f40–60:** Resumes typing, faster and more focused. The lean-in increases to about 14°.

**`react_everything`** (answer: "It's everything"): 90 frames
- **f0–10:** Stops dead and looks straight at camera. The visor flares (+40% emissive).
- **f10–30:** Pushes up halfway out of the chair and rolls both shoulders. He means it.
- **f30–45:** Drops back into the chair, cracks his knuckles (echoing the boot).
- **f45–90:** Attacks the keyboard: double-speed typing, both hands, the monitor's glow brightening. Ends on `P_SEAT_TYPE` at the new, faster pace.

**The typing loop tiers after an answer:**
- `type_loop`: the default.
- `type_loop_focused`: 120 frames, about 1.4× faster, the lean at 14°.
- `type_loop_all_in`: 120 frames, about 2× faster, occasional head shake "in the zone", visor 20% brighter.

### Scroll: he takes the work downstairs

**`stand_up`**: SCRUB · 60 frames · `P_SEAT_TYPE` → `P_STAND_HOLD` (facing screen-left)
- **f0–10:** Final keystroke, a small Enter tap. The monitor flashes once (the screen material flares; "saved").
- **f10–25:** Pushes back from the desk. The chair rolls about 40 cm back (`chair` node animated).
- **f25–40:** Stands. As he rises, his right hand lifts **the part** (the glowing cube) off the desk beside the keyboard.
- **f40–60:** Turns to screen-left, holding the part in both hands at chest height. Glances at it once, pleased.
- **Must read well played backwards:** reversed, he turns back, sets the part down, sits and gets back to typing.

**`walk_hold`**: in-place walk cycle, SCRUB · 32 frames (one cycle) · `P_STAND_HOLD` contact → same
- Walking while holding the part at chest height: a steady, purposeful pace.
- **In place:** no forward travel in the file. **Write down the stride** (meters per 32-frame cycle). We move him in code so his feet never slide.

---

## 1→2 · The drop between floors

As he reaches the left edge of the hero, the visitor has scrolled to the seam between floors.

**`drop_down`**: SCRUB · 45 frames · `P_STAND_HOLD` → `P_STAND_HOLD` (landed)
- **f0–10:** Stops at the edge, looks down over it.
- **f10–18:** A small hop off the ledge, holding the part up like something precious.
- **f18–32:** Falls. Legs tuck, part held high.
- **f32–38:** Lands in a crouch, knees absorbing it. His free hand touches the floor. The part stays level.
- **f38–45:** Rises back to `P_STAND_HOLD`.
- We pair the landing frame (f32) with a light ring on the twelve's grid.

---

## 2 · The twelve: he builds what you pick

He stands at a small workbench at the left end of the twelve. There's an empty machine frame on the bench, and each pick adds a part to it. **This is the UI:** the machine on his bench is the visitor's order, visibly.

**`bench_setup`**: ONE-SHOT · 45 frames · `P_STAND_HOLD` → `P_BENCH`
- Sets the part from the hero down as the machine's base, and gives it a pat.

**`bench_idle`**: LOOP · 150 frames (5 s) · `P_BENCH` → `P_BENCH`
- Waits for picks. Looks along the grid of twelve (a slow head pan left to right, about 30°).
- **f90:** Taps two fingers on the bench, patient.
- **f130:** A quick glance at camera: "your call".

**`catch_part`**: ONE-SHOT · 36 frames · `P_BENCH` → `P_BENCH` (plays when a part is picked)
- **f0–8:** Head snaps toward the grid (we rotate his head toward the exact card procedurally, so animate a neutral snap).
- **f8–18:** His right hand reaches up and catches a small part tile (props: `part_tile`, 10 cm) out of the air.
- **f18–30:** Turns and slots it into the machine on the bench with a firm press.
- **f30–36:** A tiny nod.
- Twelve different tiles would be a luxury. One tile we recolor in code is enough.

**`return_part`**: ONE-SHOT · 30 frames · `P_BENCH` → `P_BENCH` (plays when a part is unpicked)
- Pulls a tile off the machine, looks at it, shrugs one shoulder, tosses it gently back over his shoulder. No judgment, just a "fair enough".

**`bench_proud`**: ONE-SHOT · 45 frames · `P_BENCH` → `P_BENCH` (plays on the 4th pick and on every 4th after)
- Steps back half a pace, hands on hips (the pose in `buddy-awesome.webp`), looks the machine over, one nod, steps back in.

---

## 2→3 · Carrying it down

**`lift_machine`**: SCRUB · 40 frames · `P_BENCH` → `P_CARRY`
- Wraps both arms round the machine, bends at the knees (lift properly), and stands with it.

**`walk_carry`**: in-place walk cycle, SCRUB · 36 frames · `P_CARRY` → `P_CARRY`
- A heavier walk than `walk_hold`: shorter steps, a slight sway, careful. **Write down the stride.**

---

## 3 · The prices: he recommends

**`set_down_present`**: ONE-SHOT · 50 frames · `P_CARRY` → `P_STAND` (facing camera)
- Sets the machine down at his feet and steps beside it. Brushes his hands together. Opens one palm toward the three price cards, like a presenter.

**`weigh_it_up`**: ONE-SHOT · 60 frames · `P_STAND` → `P_STAND`
- Hands out like a balance scale: the left dips, the right dips, then level. His head tilts with the scale. This is `buddy-thinking-sm.webp` brought to life.

**`point_left` / `point_center` / `point_right`**: ONE-SHOT · 40 frames each · `P_STAND` → `P_STAND_POINT` (hold)
- Points decisively at one of the three price cards. We play whichever one matches the package that covers the visitor's picks.
- Echo `buddy-point-poster.webp`: arm fully extended, a slight lean into the point, visor toward the card.
- **`P_STAND_POINT`:** the held end frame of the point. We let it rest there for 2 s, then blend to `stand_idle`.

**`stand_idle`**: LOOP · 150 frames · `P_STAND` → `P_STAND`
- Weight shifts, arms loose. He glances at whichever card the cursor is on (we aim his head), with a small visor blink at f110.

**`impressed`**: ONE-SHOT · 40 frames · `P_STAND` → `P_STAND` (plays when the visitor hovers or picks Engine)
- Hands on hips, slow approving nod. It's the `buddy-awesome` pose.

---

## 3→4 · Taking notes

**`fetch_clipboard`**: SCRUB · 50 frames · `P_STAND` → `P_STOOL_NOTES`
- Reaches behind the machine, comes up with a clipboard, hooks a stool over with his foot, sits, and clicks the pen.

---

## 4 · The form: he writes down what you want

**`notes_listen`**: LOOP · 150 frames · `P_STOOL_NOTES` → `P_STOOL_NOTES`
- Pen hovering. Looks up at the form (screen-right), then back at the clipboard. Leans in slightly. A patient listener, not bored.

**`notes_write`**: LOOP · 60 frames · `P_STOOL_NOTES` → `P_STOOL_NOTES` (while the visitor is typing)
- Writes quickly across the clipboard in short strokes. Now and then underlines. The head follows the pen.

**`notes_pause_look`**: ONE-SHOT · 30 frames (when the visitor stops typing for about 1.5 s)
- Pen stops. Looks up at them, head slightly tilted: "go on".

**`notes_underline`**: ONE-SHOT · 24 frames (when a field is completed)
- One firm underline, a tap of the pen on the clipboard.

**`send_salute`**: ONE-SHOT · 60 frames · `P_STOOL_NOTES` → `P_STAND` (when the form is sent)
- **f0–20:** Stands, tucks the clipboard under his arm.
- **f20–40:** Crisp salute (echo `buddy-salute-sm.webp`), visor flash.
- **f40–60:** Drops the salute and holds, proud.

**`send_fail_shrug`**: ONE-SHOT · 40 frames (when the form errors)
- Looks at the clipboard, then at the field with the problem (we aim his head), with one small "hm" tilt. Not cartoonish: he's helping, not mocking.

---

## 5 · The ribbon: the machine keeps running

The ribbon at the bottom scrolls forever. He is on it, walking, and it never ends. This is **Bearing**, the thing that keeps the machine running after launch.

**`ribbon_walk`**: LOOP · 32 frames · `P_RIBBON_WALK` → same
- A relaxed, confident in-place walk. It's the treadmill: the ribbon moves under him and he stays put on screen.

**Variations.** We pick them at random, every 6–14 s, so it never looks like a loop. Each is ONE-SHOT, from `P_RIBBON_WALK` back to `P_RIBBON_WALK`, and he keeps walking through all of them:
- **`ribbon_wave`** (40 frames): a wave to camera while walking.
- **`ribbon_check`** (60 frames): takes a part tile out of his chest compartment, taps it, puts it back (maintenance).
- **`ribbon_look_back`** (45 frames): glances over his shoulder at the ribbon behind him.
- **`ribbon_stretch`** (50 frames): arms up in a stretch, still walking.
- **`ribbon_stumble`** (36 frames): a tiny trip over a seam, catches himself, looks round to see if anyone saw. **Rare:** about 1 in 12 variations.

**`ribbon_sit`**: ONE-SHOT → LOOP (when the visitor stops scrolling for 4 s)
- Steps off to the front edge of the ribbon, sits with his legs over the edge, swings them. `ribbon_sit_loop` (150 frames) until they scroll again; then `ribbon_stand` (30 frames) gets up and falls back into step.

**`ribbon_speed`** (the faster the visitor scrolls, the faster he walks)
- No separate clip is needed: we speed up `ribbon_walk` in code. If your tool can also give us **`ribbon_jog`** (24 frames, in place), we cross-blend walk → jog at high scroll speed.

---

## Encore (if the tool makes it cheap)

- **`cursor_follow`:** not a clip. Name the head and neck bones exactly `head` and `neck`, and we'll turn his head toward the cursor in code, on every floor.
- **`phone_ring`** (Floor 1, when the visitor hovers the phone number): Buddy's desk phone buzzes; he glances at it, then back at the screen.
- **`sleep`:** after 60 s with no activity, he slowly slumps back toward `P_OFFLINE`, the visor dims to 20%, and one "z" of light pulses. Any input and he jolts awake (`wake`, 20 frames).
- **Order-paid page:** `celebrate`: a fist pump, then a double fist pump. The visor goes to full flare.
- **404 page:** `lost`: holds a map upside down, turns it the right way, points back home.

---

## Props (in the file, as separate named nodes)

| Node | What | Notes |
|---|---|---|
| `desk` | Light desk, slim metal legs | About 110 × 56 cm top, 74 cm high |
| `chair` | Office chair on castors | Rolls in `stand_up` |
| `monitor` + material `screen` | Slim monitor | Screen UVs fill 0..1; we put live content on it |
| `keyboard` | Low-profile | |
| `part` | The glowing cube, 18 cm | Emissive edges in the brand mint `#6FE3CE`. Used on floors 1 and 2. |
| `part_tile` | 10 cm tile | We recolor it per part |
| `bench` | Small workbench, about 90 cm long | Floor 2 |
| `machine` | The box he assembles, 45 × 35 × 35 cm | It gains tiles: give it **12 empty sockets** named `socket_01` to `socket_12` |
| `clipboard`, `pen`, `stool` | Floor 4 | |

**Hand sockets.** Name empty nodes on each hand, `hand_R_grip` and `hand_L_grip`, so we can attach props in code when the tool can't.

---

## Look and acting notes

- **Weight.** He's a heavy robot, not a cartoon. Every move has anticipation and settle. No floaty arcs.
- **Restraint.** One gesture per beat. The studios Colin studied (Lusion, Unseen) win on pacing, not on how much happens.
- **The visor is his face.** Brightness is his emotion: dim when thinking, a flare when excited, a blink when listening. Animate it on its own emissive track if your tool can; otherwise leave it to us.
- **Scrubbed clips run backwards.** `stand_up`, `drop_down`, `lift_machine`, `fetch_clipboard` and the walks must look right in reverse. Avoid actions that read wrong reversed, like a sneeze or a cough.
- **Camera.** Author everything from a three-quarter front view at chest height; we set the real camera. No camera moves in the file.

---

## Technical delivery

| | |
|---|---|
| File | GLB (glTF 2.0). **One core file** (mesh, skeleton, props, and all Floor 0–1 clips), plus **one animation-only GLB per floor** (`buddy-floor2.glb`, and so on) so each floor loads just before it's needed |
| Frame rate | 30 fps, baked, no live IK or constraints |
| Axes | Y up, meters, origin between the feet in `P_STAND` |
| Root motion | **All walks in place.** Write the stride in meters per cycle next to each walk |
| Mesh | 30k triangles or fewer (60k ceiling); textures 2048 or smaller (baseColor, ORM, normal, emissive) |
| Names | Exactly as written in this brief. The code looks them up by name |
| Check | Every clip plays in https://gltf-viewer.donmccurdy.com by name. Loops show no pop at the seam |

---

## Build order (what to make first)

1. **Set A, which is what's on the preview now:** `boot_power_on`, `type_loop`, `stand_up`, `walk_hold`.
2. **Set B, the answer reactions:** `react_look`, `react_matters`, `react_everything`, and the two faster typing loops.
3. **Set C, floor 2:** `drop_down`, `bench_setup`, `bench_idle`, `catch_part`, `return_part`, `bench_proud`.
4. **Set D, floors 3–4:** `lift_machine`, `walk_carry`, `set_down_present`, `weigh_it_up`, the three points, `stand_idle`, `impressed`, `fetch_clipboard`, the four notes clips, `send_salute`, `send_fail_shrug`.
5. **Set E, the ribbon:** `ribbon_walk`, the five variations, `ribbon_sit` / `ribbon_sit_loop` / `ribbon_stand` (and `ribbon_jog` if it's cheap).
6. **Encore,** as the tool allows.

Total: about 45 clips. Set A alone makes the hero real.
