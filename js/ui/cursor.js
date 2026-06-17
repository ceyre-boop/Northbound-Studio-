/* ============================================================
   ui/cursor.js — the "Comet" cursor.
   A luminous core steers through space trailing a wake of glowing
   particles (additive blend). Faster motion → longer brighter tail.
   Hover blooms the core + shows a tasteful label (NO ring-and-dot).
   Click fires a shockwave ring + a burst, and broadcasts nb:warp +
   nb:click so the constellation dust and the sound layer react.
   Rendered on its own canvas. Desktop + fine-pointer + motion only.
   ============================================================ */
import { pointer } from "../core/pointer.js";
import { loop } from "../core/loop.js";
import { isTouch, reduceMotion, clamp, lerp, TAU } from "../core/util.js";

export function initCursor() {
  if (isTouch || reduceMotion) return false;

  const canvas = document.createElement("canvas");
  canvas.className = "cursor-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return false; }

  const label = document.createElement("div");
  label.className = "cursor-label";
  label.setAttribute("aria-hidden", "true");
  document.body.appendChild(label);

  document.documentElement.classList.add("has-cursor");

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  const trail = [];   // wake particles
  const ripples = [];  // click shockwaves
  const TRAIL_MAX = loop.tier >= 2 ? 150 : loop.tier >= 1 ? 95 : 55;

  /* Hover intent — recomputed on every pointerover (fires for body too). */
  let mode = "";
  let bloomTarget = 0;
  let bloom = 0;
  const LINKISH = "a, button, .btn, input, select, textarea, label, [data-magnetic]";
  function pickMode(el) {
    if (!el || !el.closest) return ["", ""];
    if (el.closest(".project__frame, .browser")) return ["view", "VIEW"];
    if (el.closest(".node")) return ["warp", "ENTER"];
    if (el.closest(".hero__logo")) return ["slice", ""];
    if (el.closest(LINKISH)) return ["link", ""];
    return ["", ""];
  }
  document.addEventListener("pointerover", (e) => {
    const [m, txt] = pickMode(e.target);
    mode = m;
    label.textContent = txt;
    label.dataset.show = txt ? "1" : "";
    bloomTarget = m ? 1 : 0;
  });

  window.addEventListener("pointerdown", () => {
    ripples.push({ x: pointer.x, y: pointer.y, max: 150, life: 0, maxLife: 0.6 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU, s = 2 + Math.random() * 5.5;
      trail.push({
        x: pointer.x, y: pointer.y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: 0.5 + Math.random() * 0.45,
        size: 1.2 + Math.random() * 2.4, hot: Math.random() < 0.45,
      });
    }
    // The whole site reacts to a click.
    try { document.dispatchEvent(new CustomEvent("nb:warp", { detail: { type: "scatter", x: pointer.x, y: pointer.y } })); } catch (_) {}
    try { document.dispatchEvent(new CustomEvent("nb:click", { detail: { x: pointer.x, y: pointer.y } })); } catch (_) {}
  });

  // Fireworks bus — anything can paint a burst on the cursor canvas (Konami).
  document.addEventListener("nb:burst", (e) => {
    const x = (e.detail && e.detail.x) ?? pointer.x;
    const y = (e.detail && e.detail.y) ?? pointer.y;
    ripples.push({ x, y, max: 190, life: 0, maxLife: 0.75 });
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * TAU, s = 2 + Math.random() * 7.5;
      trail.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: 0.6 + Math.random() * 0.55,
        size: 1.4 + Math.random() * 2.8, hot: Math.random() < 0.5,
      });
    }
  });

  /* Magnetic pull on interactive elements (kept — it feels good). */
  const magnets = [];
  function collectMagnets() {
    magnets.length = 0;
    document.querySelectorAll("[data-magnetic], .btn, .nav__cta").forEach((el) => magnets.push(el));
  }
  collectMagnets();
  window.addEventListener("resize", () => setTimeout(collectMagnets, 200));
  function applyMagnets() {
    for (const el of magnets) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = pointer.x - cx, dy = pointer.y - cy;
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(r.width, r.height) * 0.9 + 26;
      if (dist < radius) {
        const pull = (1 - dist / radius) * 0.4;
        el.style.transform = `translate(${dx * pull}px, ${dy * pull}px)`;
        el.classList.add("is-magnet");
      } else if (el.classList.contains("is-magnet")) {
        el.style.transform = "";
        el.classList.remove("is-magnet");
      }
    }
  }

  let lastX = pointer.x, lastY = pointer.y;

  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    // Spawn wake — count scales with cursor speed, smeared along the path.
    const sp = pointer.speed;
    const spawn = clamp(Math.round(sp * 0.3), 0, 5) + (sp > 0.6 ? 1 : 0);
    for (let i = 0; i < spawn; i++) {
      const f = spawn > 1 ? i / spawn : 0;
      trail.push({
        x: lerp(lastX, pointer.x, f), y: lerp(lastY, pointer.y, f),
        vx: (Math.random() - 0.5) * 0.7 - pointer.vx * 0.02,
        vy: (Math.random() - 0.5) * 0.7 - pointer.vy * 0.02,
        life: 0, max: 0.45 + Math.random() * 0.45,
        size: 1.2 + Math.random() * 2.4, hot: Math.random() < 0.3,
      });
    }
    while (trail.length > TRAIL_MAX) trail.shift();
    lastX = pointer.x; lastY = pointer.y;

    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      p.life += dt;
      if (p.life >= p.max) { trail.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.93; p.vy *= 0.93;
      const t = 1 - p.life / p.max;
      const a = t * t * 0.8;
      const rr = p.size * (0.5 + t) * 3;
      const col = p.hot ? "200,250,255" : "0,240,255";
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill();
    }

    // Core glow + bright center, with a velocity stretch.
    bloom += (bloomTarget - bloom) * 0.15;
    const coreR = (6 + bloom * 11) * 2.4;
    const cg = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, coreR);
    cg.addColorStop(0, "rgba(225,251,255,0.95)");
    cg.addColorStop(0.35, "rgba(0,240,255,0.55)");
    cg.addColorStop(1, "rgba(0,240,255,0)");
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(pointer.x, pointer.y, coreR, 0, TAU); ctx.fill();

    const stretch = clamp(pointer.speed * 0.05, 0, 1.6);
    const ang = Math.atan2(pointer.vy, pointer.vx);
    ctx.save();
    ctx.translate(pointer.x, pointer.y);
    ctx.rotate(ang);
    ctx.scale(1 + stretch, 1);
    ctx.fillStyle = "rgba(240,253,255,0.96)";
    ctx.beginPath(); ctx.arc(0, 0, 2 + bloom * 1.6, 0, TAU); ctx.fill();
    ctx.restore();

    // Click shockwaves.
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.life += dt;
      if (rp.life >= rp.maxLife) { ripples.splice(i, 1); continue; }
      const t = rp.life / rp.maxLife;
      const r = 6 + t * rp.max;
      const a = (1 - t) * 0.55;
      ctx.strokeStyle = `rgba(0,240,255,${a.toFixed(3)})`;
      ctx.lineWidth = (1 - t) * 2.4 + 0.4;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, r, 0, TAU); ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
    label.style.transform = `translate(${(pointer.x + 18).toFixed(1)}px, ${(pointer.y + 12).toFixed(1)}px)`;
    applyMagnets();
  }
  loop.add(render);

  // Fade out when the pointer leaves the window.
  document.addEventListener("mouseleave", () => { canvas.style.opacity = "0"; label.style.opacity = "0"; });
  document.addEventListener("mouseenter", () => { canvas.style.opacity = "1"; label.style.opacity = ""; });

  return true;
}
