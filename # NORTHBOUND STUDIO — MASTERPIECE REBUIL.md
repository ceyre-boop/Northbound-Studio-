# NORTHBOUND STUDIO — MASTERPIECE REBUILD BRIEF

## Claude Code Execution Document

**Directive:** Transform the existing Northbound Studio site from clean-but-generic (Clay.global tier) into an elite, award-worthy digital experience at the level of Active Theory, Resn, and Obys Agency.

---

## DESIGN PHILOSOPHY

**Same colors. Totally different soul.**
This is not a color or layout refresh. This is a complete motion + interaction + narrative overhaul.
The goal: a visitor lands and immediately feels they are inside a PRODUCT, not browsing a website.

**The three pillars:**

1. **Control** — You control exactly what the viewer sees and when they see it
2. **Pacing** — Speed changes, pauses, molecular moments create emotional rhythm
3. **Confidence** — The site itself is the portfolio. The site IS the proof.

---

## INSPIRATION BREAKDOWN (what to steal from each)

### ActiveTheory.net/work → PRIMARY INSPIRATION

- **Downward spiral scroll narrative** — content is fed to you in a controlled vertical river, not a page you browse
- **Molecular/particle logo** — the logo assembles from individual particles, and the MOUSE CAN SLICE THROUGH IT like a blade through smoke. Particles scatter and reform. This is the single most confidence-inspiring brand moment I have ever seen.
- **Mouse-tracking canvas** — the entire background responds to cursor position; fluid, subtle, alive
- **Pacing control** — scroll speed intentionally varies: fast section → pause → breathe → fast again → pause at the logo
- **No hard sections** — it flows like water downward, not like blocks stacked on a page

### Resn.co.nz → INTRO SEQUENCE STYLE

- Pure black screen opens the experience
- Thin elements appear with cinematic timing
- Feels like a movie before the movie starts
- Sets the emotional expectation immediately: this is premium

### StinkStudios.com → FIRST 3 SECONDS MOMENT

- Monochrome, clean, outline-only brand logos appear in sequence
- Simple. Thin. Fast.
- Just enough to say: "we've worked with serious people" before anything else loads
- Like the end of a movie trailer — logos flash, then: YOUR brand

### Obys.agency → PROJECT SHOWCASE SECTION

- Each project is a full-screen experience, not a card
- Hover = the project begins to breathe (preview animation, color wash)
- Click = full immersive project reveal
- Scrolling through projects feels like flipping through a high-end lookbook
- The MORE projects you add over time, the more powerful this section becomes

### HelloMonday.com → FOOTER

- Minimal. Direct. Zero noise.
- Small illustration (you're using a person at a desk — keep it, it's human)
- Simple 2-column contact grid
- No bullshit. Just: here's how to reach us.
- The understatement makes it feel MORE confident, not less

---

## PHASE 1 — CUSTOM CURSOR + MOUSE PRESENCE

### Implementation:

Replace the default cursor entirely.

```
cursor: none; /* on body */
```

Create a custom cursor system with THREE layers:

1. **Dot** — small 6px circle, follows cursor exactly (no lag)
2. **Ring** — 32px outline circle, follows with ~80ms lag (smooth lerp)
3. **Aura** — 120px soft glow, follows with ~200ms lag (very slow lerp)

When cursor moves fast: ring stretches (scaleX based on velocity)
When cursor hovers a link: dot disappears, ring expands to 48px with fill
When cursor hovers the logo: enter SLICE MODE (see Phase 3)

**Technology:** Vanilla JS with `requestAnimationFrame` lerp loop. No libraries needed.

```javascript
// Lerp formula:
current += (target - current) * 0.08; // adjust 0.08 for lag amount
```

---

## PHASE 2 — CANVAS BACKGROUND (Mouse-Reactive Field)

### What it looks like:

A dark background with a subtle field of particles or grid points that respond to mouse position. NOT loud. NOT distracting. Just alive. Like the background has gravity.

### Implementation:

Add a full-screen `<canvas>` element BEHIND all content, fixed position, z-index: 0.

**Option A — Particle field (recommended):**

- 80–120 small dots scattered across the canvas
- Each particle has: position, velocity, base position
- Mouse creates a repulsion field: particles within 150px push away
- When mouse leaves, particles spring back to base position (spring physics)
- Particles connected by thin lines when < 100px apart (graph style)
- Colors: same as your current palette (dark bg, accent color lines)

**Option B — Grid distortion:**

- Invisible grid of points
- Mouse position warps the grid like a magnet
- Draw grid lines with the warp applied
- Feels like spacetime bending

**Render loop:**

```javascript
function render() {
  ctx.clearRect(0, 0, w, h);
  updateParticles(mouseX, mouseY);
  drawConnections();
  drawParticles();
  requestAnimationFrame(render);
}
```

---

## PHASE 3 — MOLECULAR LOGO (The Signature Moment)

This is the most important feature on the site. This is what people screenshot and send to friends.

### What happens:

1. Logo starts in normal rendered state as page loads
2. After 1 second: logo DISSOLVES into ~300 individual particles, each particle being a tiny fragment of the logo's pixels
3. Particles float in a loose formation (breathing, subtle drift) — they still LOOK like the logo but alive
4. **MOUSE ENTERS LOGO AREA:** cursor switches to a custom slash/blade cursor
5. **MOUSE MOVES THROUGH LOGO:** particles in the cursor's path scatter and explode outward based on velocity and direction
6. Particles that were hit orbit outward, then slowly drift back to formation
7. The logo reforms itself continuously — it never dies, it just breathes and recovers

### Implementation:

```javascript
// Step 1: Render logo to an offscreen canvas
const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d");
offCtx.drawImage(logoSVGAsImage, 0, 0);

// Step 2: Sample pixel data to get particle positions
const imageData = offCtx.getImageData(0, 0, w, h);
const particles = [];
for (let x = 0; x < w; x += 4) {
  // sample every 4px
  for (let y = 0; y < h; y += 4) {
    const i = (y * w + x) * 4;
    if (imageData.data[i + 3] > 128) {
      // if pixel is visible
      particles.push({
        x: x,
        y: y, // current position
        baseX: x,
        baseY: y, // home position
        vx: 0,
        vy: 0, // velocity
      });
    }
  }
}

// Step 3: Per frame — apply mouse repulsion + spring return
particles.forEach((p) => {
  const dx = mouseX - p.x;
  const dy = mouseY - p.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const repulsionRadius = 60;

  if (dist < repulsionRadius && isMouseOverLogo) {
    const force = (repulsionRadius - dist) / repulsionRadius;
    p.vx -= (dx / dist) * force * 8; // scatter force
    p.vy -= (dy / dist) * force * 8;
  }

  // Spring back to base position
  p.vx += (p.baseX - p.x) * 0.05;
  p.vy += (p.baseY - p.y) * 0.05;

  // Damping
  p.vx *= 0.9;
  p.vy *= 0.9;

  // Apply velocity
  p.x += p.vx;
  p.y += p.vy;

  // Draw particle
  ctx.fillRect(p.x, p.y, 2, 2);
});
```

**Performance note:** Use OffscreenCanvas or sample at larger intervals (every 6px) if performance drops. Target: 60fps at all times.

---

## PHASE 4 — INTRO SEQUENCE (3-Second Opening)

Fires ONCE on first visit (use sessionStorage to not repeat).

### Timeline:

- **0.0s** — Black screen, 0 opacity
- **0.2s** — Fade in: 4–6 thin client logo outlines appear sequentially (monochrome, no fill, just stroke paths)
- **1.0s** — Logos fade out left/right
- **1.2s** — NORTHBOUND STUDIO wordmark fades in, centered, thin weight
- **1.8s** — Brief pulse / glow on the wordmark
- **2.2s** — Entire intro panel slides UP out of frame (like a curtain lifting)
- **2.5s** — Main site is revealed beneath it; hero animation begins

### Implementation:

```html
<div id="intro-overlay">
  <div class="client-logos">
    <!-- SVG outlines of 4–6 brand shapes, stroke only, no fill -->
  </div>
  <div class="studio-wordmark">NORTHBOUND STUDIO</div>
</div>
```

```javascript
// CSS animation timeline using animation-delay
// Use sessionStorage: if 'introSeen' exists, skip the intro entirely
if (!sessionStorage.getItem("introSeen")) {
  runIntroSequence();
  sessionStorage.setItem("introSeen", "true");
} else {
  document.getElementById("intro-overlay").style.display = "none";
}
```

For the client logos: Use SVG `stroke-dasharray` + `stroke-dashoffset` animation to make them "draw themselves" onto the screen. Classic line-drawing effect. Extremely premium looking.

---

## PHASE 5 — SCROLL NARRATIVE (Downward River Control)

The key insight from ActiveTheory: **the scroll controls the narrative speed, not just the scroll position.**

### How to implement:

**Option A — Smooth scroll hijacking (full control):**
Use a scroll proxy system:

- Listen to wheel events
- Instead of native scroll, animate a `scrollY` variable yourself
- Content moves based on this animated variable, not the browser scroll
- This gives you control over: easing, max speed, sections that "snap" or "pause"

```javascript
let targetScrollY = 0;
let currentScrollY = 0;

window.addEventListener("wheel", (e) => {
  targetScrollY += e.deltaY * 0.8; // 0.8 slows wheel speed
  targetScrollY = clamp(targetScrollY, 0, maxScroll);
});

function updateScroll() {
  currentScrollY += (targetScrollY - currentScrollY) * 0.06; // smooth
  document.getElementById("scroll-container").style.transform =
    `translateY(${-currentScrollY}px)`;
  requestAnimationFrame(updateScroll);
}
```

**Option B — Locomotive Scroll library (easier, production-ready):**

```html
<script src="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.js"></script>
```

Use `data-scroll` attributes on elements to trigger animations.
This gives you the smooth, cinematic scroll ActiveTheory uses without rebuilding from scratch.

**Recommended:** Use Locomotive Scroll as the base, then layer custom canvas on top.

### Scroll-triggered sections:

Each major section gets a "scroll threshold" — when you hit it, the scroll BRIEFLY slows (lerp target reduces) to force the viewer to absorb the content. This is the "pause at the logo" moment.

```javascript
const pauseZones = [logoSectionY, packagesSectionY, testimonialsSectionY];
pauseZones.forEach((zoneY) => {
  if (Math.abs(currentScrollY - zoneY) < 100) {
    scrollSpeed *= 0.3; // dramatically slow down in this zone
  }
});
```

---

## PHASE 6 — PROJECT SHOWCASE (Obys.agency style)

### Structure:

```html
<section class="projects-river">
  <div class="project-item" data-index="0">
    <div class="project-image-wrap">
      <img src="project1.jpg" />
      <div class="project-overlay"></div>
    </div>
    <div class="project-meta">
      <span class="project-number">01</span>
      <h3 class="project-title">Client Name — Site Type</h3>
      <p class="project-tags">Web Design · Brand Identity</p>
    </div>
  </div>
  <!-- repeat -->
</section>
```

### Hover behavior:

- Default state: project title visible, image slightly desaturated
- On hover: image snaps to full color + subtle scale (1.02)
- Cursor becomes a large circle with text "VIEW" inside it
- A preview clip of the project (short loop video or animated gif) fades in

### Layout — alternating offsets (Obys signature):

```css
.project-item:nth-child(odd) {
  margin-left: 0;
  margin-right: auto;
  width: 60%;
}
.project-item:nth-child(even) {
  margin-left: auto;
  margin-right: 0;
  width: 60%;
  margin-top: -80px; /* vertical overlap */
}
```

This creates the staggered, organic flow down the page — NOT a boring grid.

---

## PHASE 7 — TYPOGRAPHY SYSTEM (The Invisible Architecture)

Current problem: generic font weights, inconsistent hierarchy.
Fix: create a deliberate typographic scale.

### Recommended font stack:

**Display (headings):** `Syne` (from Google Fonts) — geometric, slightly futuristic, premium feel

```html
<link
  href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&display=swap"
  rel="stylesheet"
/>
```

**Body:** `DM Sans` — clean, modern, readable, pairs perfectly with Syne

```html
<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;1,300&display=swap"
  rel="stylesheet"
/>
```

**Mono accent:** `Space Mono` — for numbers, labels, technical details

```html
<link
  href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

### CSS Scale:

```css
:root {
  --font-display: "Syne", sans-serif;
  --font-body: "DM Sans", sans-serif;
  --font-mono: "Space Mono", monospace;

  /* Scale */
  --text-xs: clamp(0.7rem, 1vw, 0.8rem);
  --text-sm: clamp(0.875rem, 1.2vw, 1rem);
  --text-base: clamp(1rem, 1.5vw, 1.125rem);
  --text-lg: clamp(1.25rem, 2vw, 1.5rem);
  --text-xl: clamp(1.5rem, 3vw, 2rem);
  --text-2xl: clamp(2rem, 5vw, 3.5rem);
  --text-hero: clamp(3rem, 8vw, 7rem);
}

h1 {
  font-family: var(--font-display);
  font-size: var(--text-hero);
  font-weight: 800;
}
h2 {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 700;
}
.label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
p {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: 1.7;
}
```

---

## PHASE 8 — MINIMAL FOOTER (HelloMonday style)

### Structure:

```html
<footer class="site-footer">
  <div class="footer-illustration">
    <!-- Keep your existing person-at-desk illustration -->
    <!-- Just make sure it's an SVG so it scales crisp -->
  </div>

  <div class="footer-grid">
    <div class="footer-col">
      <span class="footer-label">Want to work together?</span>
      <a href="mailto:hello@northboundstudio.com" class="footer-link">
        hello@northboundstudio.com
      </a>
    </div>
    <div class="footer-col">
      <span class="footer-label">Follow the build</span>
      <a href="#" class="footer-link">@northboundstudio</a>
    </div>
  </div>

  <div class="footer-bottom">
    <span class="footer-copy">© 2025 Northbound Studio</span>
    <span class="footer-location">Grand Ledge, MI → Worldwide</span>
  </div>
</footer>
```

### CSS:

```css
.site-footer {
  padding: 80px 60px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 60px;
  align-items: start;
}

.footer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
}

.footer-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  opacity: 0.4;
  display: block;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.footer-link {
  font-family: var(--font-display);
  font-size: 1.1rem;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.footer-link:hover {
  border-bottom-color: currentColor;
}

.footer-bottom {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  opacity: 0.3;
  font-size: 0.75rem;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
```

---

## PHASE 9 — SCROLL-TRIGGERED REVEAL ANIMATIONS

Every section should enter the viewport with intention. Never just sitting there waiting.

### Pattern for all sections:

Start state: `opacity: 0; transform: translateY(40px);`
End state: `opacity: 1; transform: translateY(0);`
Trigger: when element enters viewport by 20%
Duration: 0.8s, ease: `cubic-bezier(0.16, 1, 0.3, 1)` (snappy easeOutExpo)

### Implementation with IntersectionObserver:

```javascript
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        revealObserver.unobserve(entry.target); // fire once
      }
    });
  },
  { threshold: 0.2 },
);

document.querySelectorAll("[data-reveal]").forEach((el) => {
  revealObserver.observe(el);
});
```

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(40px);
  transition:
    opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

[data-reveal].revealed {
  opacity: 1;
  transform: translateY(0);
}

/* Stagger children */
[data-reveal-stagger] > * {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

[data-reveal-stagger].revealed > *:nth-child(1) {
  transition-delay: 0.1s;
  opacity: 1;
  transform: none;
}
[data-reveal-stagger].revealed > *:nth-child(2) {
  transition-delay: 0.2s;
  opacity: 1;
  transform: none;
}
[data-reveal-stagger].revealed > *:nth-child(3) {
  transition-delay: 0.3s;
  opacity: 1;
  transform: none;
}
/* etc. */
```

---

## PHASE 10 — PERFORMANCE + POLISH

### Required meta tags:

```html
<meta name="theme-color" content="#000000" />
<meta property="og:image" content="/og-image.jpg" />
<!-- 1200x630 -->
```

### Canvas performance:

- Use `will-change: transform` on the canvas element
- Throttle particle updates to 60fps max with `requestAnimationFrame`
- Reduce particle count on mobile (detect via `window.innerWidth < 768`)
- Disable canvas entirely on mobile if needed — use a CSS gradient fallback

### Mobile:

- Disable molecular logo particle system on mobile (too heavy)
- Disable custom cursor on touch devices (`navigator.maxTouchPoints > 0`)
- Keep scroll animations, typography, reveal animations fully on mobile

### Loading:

- Show a minimal loading state while fonts load (`document.fonts.ready`)
- Don't start intro sequence until fonts are confirmed loaded

---

## IMPLEMENTATION ORDER (execute in this sequence)

```
1. Install fonts (Google Fonts links in <head>)
2. Apply typography CSS system
3. Build custom cursor system
4. Add canvas background with particle field
5. Build intro overlay sequence
6. Add scroll reveal system (IntersectionObserver)
7. Implement Locomotive Scroll (or custom scroll proxy)
8. Build molecular logo canvas
9. Rebuild project showcase section (Obys layout)
10. Rebuild footer (HelloMonday style)
11. Test on mobile and optimize
12. Final polish pass: timing, easing, color consistency
```

---

## TECHNOLOGY STACK (no build tools needed — pure CDN)

```html
<!-- Locomotive Scroll (cinematic scroll) -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css"
/>
<script src="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.js"></script>

<!-- GSAP (for intro timeline + logo animations) -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/ScrollTrigger.min.js"></script>

<!-- Google Fonts -->
<link
  href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:ital,wght@0,300;0,400;1,300&family=Space+Mono&display=swap"
  rel="stylesheet"
/>
```

Everything else: vanilla JS + CSS. No React. No webpack. No complexity.
This stack is fast, lightweight, and you understand every line.

---

## FINAL NOTE TO CLAUDE CODE

**Preserve:** all existing content (copy, packages, prices, testimonials, application form), all existing colors and brand variables, all existing section structure.

**Transform:** everything visual — motion, typography, cursor, canvas, scroll behavior, project layout, footer.

**Goal:** same house, completely different soul. A client who sees this site should feel the same way Colin felt when he saw activetheory.net/work.

"These people can take all my money."

```

That's the mission. Execute it.
```
