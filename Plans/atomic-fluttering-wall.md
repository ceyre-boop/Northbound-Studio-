# Buddy at work: a loader, a 3D hero and an infinite ribbon (dev)

## Context

Colin rejected the CSS floor transitions: "just simple, anyone could do that in 2 seconds." His bar is now studio grade: Lusion, Active Theory, Unseen Studio. The jury rule he quoted: art direction gives it a reason to exist, directed motion gives it life, performance keeps it alive on real devices. Restraint, type, pacing, one confident motion idea executed perfectly.

His brief, from the references he studied:
- **A loader before the page.** "Every cool site has one." Lusion shows a thin bar and a large 000→100 counter, then the bar folds into their L.
- **Buddy animated in 3D, scroll-driven**, like Lusion's astronaut but our own idea. Buddy sits at a computer typing (doing work for the client), stands up, and walks off screen as they scroll. The background stays; only Buddy animates.
- **An infinite ribbon at the bottom** (jesperlandberg.com): a curved WebGL ribbon of cards over a perspective floor. Scrolling pushes it sideways with inertia, it loops forever, and there's a little randomness so it keeps changing.

Decisions already made in chat:
- **Buddy** is the navy-and-graphite robot (`buddy-awesome.webp`, `brand/buddy-wave.*`, from a render named `Robot_typeA`). The teal-and-gold "tagger" robot and the orange SVG beacon are **not** Buddy.
- **Rigged 3D (GLB) route.** Nobody knows yet where the model file is, so the system is built on a stand-in and his GLB drops in later.
- **Ribbon content:** the twelve parts, as screens.

Everything happens on `dev`, previewed at https://nb-descent-git-dev-taboost.vercel.app/?motion=full, and merges only on Colin's word (`/dev-branch`).

## Approach

### 0. Clear the rejected work
- `git revert` the two transition commits on dev (`5bbf48f`, `1455b5b`). Revert, not reset: no history is lost and no force-push is needed.
- Keep the one-screen floors and the quiet question. They're on main already.

### 1. The one idea: the loader is Buddy's screen
- **What the visitor sees:** a dark full-screen panel (ink `#0E1512`) with a large Syne counter, 000→100, bottom-left. One line of code types itself above a blinking caret.
- **The counter is real:** bytes fetched for the hero scene (GLB and textures, via streamed `fetch`). No fake progress.
- **At 100:** the panel shrinks into the exact rectangle of the monitor on Buddy's desk, projected from the 3D camera. The page is revealed around it, with Buddy typing at that screen. The loader was his screen all along.
- **Rules:**
  - First visit per session only (`sessionStorage`).
  - Hard cap about 3.5s on slow networks, then enter with the still poster.
  - Reduced motion gets a short fade and no shrink.
  - No JS means no loader: the markup is injected by JS, so the page stays readable.
- **Reuse:** the veil pattern and failsafe from `js/boot.js` (min/max hold, CSS failsafe). Byte progress replaces its milestone progress.

### 2. Hero: Buddy at work, scroll-scrubbed
- **The canvas:** a transparent three.js canvas over the existing hero. The mint wash and the machine scene stay; only Buddy and his desk are new.
- **At rest:** `type_loop` plays on its own clock. The monitor glows, and it shows the loader's last frame.
- **Scrolling:** the hero is `position: sticky`, inside a spacer about two screens tall. Scroll progress scrubs `stand_up`, then `walk_off` (he walks out of frame to the right), using `AnimationMixer.setTime`. No Lenis. Native scroll with a critically damped follow keeps it smooth.
- **Type:** "We build the machine." and the question stay put, the way Lusion pins its type while the scene moves.
- **Fallbacks:** no WebGL, low tier (`NB_GL.deviceTier`), or reduced motion get today's still poster and today's layout.
- **Phones:** the 3D scene runs only on mid/high tier, at DPR up to 1.5.
- **Stand-in until Buddy's GLB:** three.js's `RobotExpressive.glb` (CC0, Quaternius; clips Sitting, Standing, Walking, Idle) with a simple desk and monitor built from primitives. Dev only, never merged as-is.

### 3. Spec for the animator: `Plans/buddy-rig-spec.md`
- **Format:** GLB 2.0, Y-up, meters, origin at the feet.
- **Budget:** one skinned mesh, 30k triangles or fewer; textures 2048px or smaller (baseColor, ORM, normal, emissive for the visor and light strips).
- **Clips, named exactly:**
  - `type_loop`: seamless, 2–4s.
  - `stand_up`: about 1.5–2s.
  - `walk_off`: about 3s, root motion baked, exits screen right.
- **Props:** desk, chair and monitor. The monitor face is its own material named `screen`.
- **Optional:** a glTF camera named `hero_cam`.
- **Acceptable to deliver:** GLB, or FBX (I convert). I compress with gltf-transform (meshopt + KTX2).
- **Includes** a reference sheet of the navy Buddy renders, so the right robot gets built.

### 4. The ribbon floor, at the very bottom (after #quote)
- **Cards:** the twelve parts as UI screens, 01–12. They're pre-rendered to `brand/ribbon/NN.webp` by `scripts/ribbon-cards.ts`, modeled on `scripts/looks-thumbs.ts` (Playwright screenshots of 12 small HTML screens). Data is illustrative and labeled "example". No fabricated metrics.
- **Scene:** three.js cards bent on a cylinder over a perspective grid floor.
- **Motion:** scroll velocity drives the offset, with inertia. Cards bend and skew more with speed. Each lap brings slight random variation: tilt and height jitter, and card order rotating.
- **Infinite:** the ribbon floor is sticky, and once the visitor reaches it, scroll deltas past the end are absorbed. The ribbon offset is modular, so it never runs out. The document-loop and wheel-capture choices wait on the design review's call (see Open).
- **Corners, like Jesper's:** NORTHBOUND STUDIO, the phone number, the email, Back to top. A visually hidden list carries the twelve for screen readers. Home and PageUp always escape.

### 5. Stack
- **three.js** vendored as ES modules under `js/vendor/three/`, with an `<script type="importmap">`. That keeps the no-build-step rule. It's the proven loader and skinning path, not a rewrite.
- **One rAF:** reuse `js/motion.js` (`NB_MOTION.onFrame`). Each canvas renders only while its floor is on screen (IntersectionObserver).
- **Scripts load after the loader starts** (hero scene) or on idle (ribbon), so LCP stays the headline and counter.
- **Files:**
  - `js/home/loader.js`, `js/home/hero3d.js`, `js/home/ribbon.js`
  - `scripts/ribbon-cards.ts`
  - `brand/ribbon/*.webp`, `brand/3d/buddy-standin.glb`
  - `index.html`: markup hooks, CSS, importmap

### 6. Order of previews
1. Revert, then loader and hero with the stand-in. Preview.
2. Ribbon floor. Preview.
3. Swap in Buddy's GLB when it arrives. Tune timing. Preview.

## Verification
- **Playwright** (`tests/home3d.spec.ts`):
  - The loader counter tracks real bytes, is capped at 3.5s, and is skipped on a second visit in the same session.
  - No loader without JS.
  - Canvases are absent under reduced motion and without WebGL, and the poster is present instead.
  - Hero scrub progress follows scroll; the pin releases into #offerings.
  - Ribbon offset keeps moving past the page end with no visible jump.
  - Floors are still one screen, no CLS on load, no sideways scroll at 390.
  - An FPS probe at 390x844 with 4x CPU throttle stays at 55fps or more.
- **Existing suites:** `bun run test:unit` plus the homepage Playwright suites, all green.
- **Screenshots** at 1512 and 390, for each beat.
- **A fresh-context `reviewer` subagent** on each diff before Colin sees it.
- **Check the dev preview in Colin's Chrome** (it's behind Vercel login), then send the link, leading the reply.
- **Memory and journal:**
  - Save a memory: Buddy is the navy `Robot_typeA`; the tagger and SVG are not Buddy.
  - Append to the Direction Journal: "too simple" moved the bar to studio grade.

## Open (decided during build, not blocking)
- Document scroll loop vs wheel/touch capture for the infinite ribbon, whichever the design review finds safer on iOS Safari.
- Whether the real Buddy GLB exists (Colin is asking the animator).
