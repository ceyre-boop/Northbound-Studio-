/* ============================================================
   webgl/fallback2d.js — Canvas-2D constellation.
   The graceful-degradation renderer when WebGL2 is unavailable.
   Same brand language (cyan points + links + cursor gravity), just
   on the CPU. Derived from the original, stable script.js field.
   ============================================================ */
import { pointer } from "../core/pointer.js";
import { loop } from "../core/loop.js";
import { DPR, clamp, reduceMotion } from "../core/util.js";

export function initFallback2D(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const ACCENT = "0, 240, 255";
  let w = 0,
    h = 0,
    particles = [],
    linkDist = 120;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function build() {
    const tier = loop.tier;
    const base = tier === 0 ? 26000 : tier === 1 ? 20000 : 15000;
    const count = clamp(Math.round((w * h) / base), 24, 140);
    linkDist = w < 768 ? 90 : 120;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6,
    }));
  }

  function step() {
    ctx.clearRect(0, 0, w, h);
    const mActive = pointer.active;
    const mx = pointer.x;
    const my = pointer.y;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      if (mActive) {
        const dx = mx - p.x;
        const dy = my - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 150 * 150 && d2 > 1) {
          const d = Math.sqrt(d2);
          const pull = clamp((150 - d) / 150, 0, 1) * 0.04;
          p.vx += (dx / d) * pull;
          p.vy += (dy / d) * pull;
        }
      }
      p.vx = clamp(p.vx * 0.985, -0.8, 0.8);
      p.vy = clamp(p.vy * 0.985, -0.8, 0.8);
    }

    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          ctx.strokeStyle = `rgba(${ACCENT}, ${0.16 * (1 - d / linkDist)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      ctx.fillStyle = `rgba(${ACCENT}, 0.7)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  resize();
  window.addEventListener("resize", () => setTimeout(resize, 150));

  if (reduceMotion) {
    step(); // one static frame, no loop
  } else {
    loop.add(step);
  }
  canvas.classList.add("is-2d-active");
  return true;
}
