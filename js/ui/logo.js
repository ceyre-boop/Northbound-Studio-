/* ============================================================
   ui/logo.js — molecular "N" you can slice through.
   The hero mark dissolves into particles that breathe in formation;
   the cursor scatters them; spring physics reform them. A separate
   Canvas-2D failure domain from WebGL, with NaN-proof home positions.
   ============================================================ */
import { pointer } from "../core/pointer.js";
import { loop } from "../core/loop.js";
import { DPR, reduceMotion, clamp, safe } from "../core/util.js";

export function initLogo() {
  const box = document.querySelector(".hero__n");
  const wrap = document.querySelector(".hero__logo");
  if (!box || !wrap) return false;

  const canvas = document.createElement("canvas");
  canvas.className = "logo-canvas";
  canvas.setAttribute("aria-hidden", "true");
  wrap.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  let cw = 0,
    ch = 0,
    particles = [];

  function buildParticles() {
    const rect = box.getBoundingClientRect();
    cw = Math.max(Math.round(rect.width), 40);
    ch = Math.max(Math.round(rect.height), 40);
    canvas.width = cw * DPR;
    canvas.height = ch * DPR;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Render an "N" offscreen and sample opaque pixels into homes.
    const o = document.createElement("canvas");
    o.width = cw;
    o.height = ch;
    const oc = o.getContext("2d");
    oc.fillStyle = "#fff";
    oc.font = `800 ${ch * 0.82}px Inter, system-ui, sans-serif`;
    oc.textAlign = "center";
    oc.textBaseline = "middle";
    oc.fillText("N", cw / 2, ch / 2 + ch * 0.02);

    let data;
    try {
      data = oc.getImageData(0, 0, cw, ch).data;
    } catch (e) {
      return false;
    }
    const step = cw < 110 ? 3 : 4;
    const next = [];
    for (let y = 0; y < ch; y += step) {
      for (let x = 0; x < cw; x += step) {
        if (data[(y * cw + x) * 4 + 3] > 128) {
          next.push({
            x: safe(x, cw / 2),
            y: safe(y, ch / 2),
            baseX: safe(x, cw / 2),
            baseY: safe(y, ch / 2),
            vx: 0,
            vy: 0,
            seed: Math.random(),
          });
        }
      }
    }
    if (next.length) {
      particles = next;
      box.classList.add("is-molecular"); // CSS hides the static glyph
      return true;
    }
    return false;
  }

  if (!buildParticles()) {
    canvas.remove();
    return false; // leave the static N intact
  }
  window.addEventListener("resize", () => setTimeout(buildParticles, 200));

  let rect = box.getBoundingClientRect();
  let rectTimer = 0;

  function step(dt, now) {
    // Refresh element rect a few times/sec (it scrolls with the page).
    if (now - rectTimer > 120) {
      rect = box.getBoundingClientRect();
      rectTimer = now;
    }
    // Pointer in canvas-local space.
    const mxRaw = pointer.x - rect.left;
    const myRaw = pointer.y - rect.top;
    const inside =
      pointer.active &&
      mxRaw > -50 &&
      mxRaw < cw + 50 &&
      myRaw > -50 &&
      myRaw < ch + 50;

    ctx.clearRect(0, 0, cw, ch);
    const breathe = reduceMotion ? 0 : Math.sin(now * 0.0015) * 0.6;

    for (const p of particles) {
      if (inside) {
        const dx = mxRaw - p.x;
        const dy = myRaw - p.y;
        const d = Math.hypot(dx, dy);
        const R = 30;
        if (d < R && d > 0.001) {
          const force = (R - d) / R;
          // Scatter scaled by cursor speed — fast swipes slice harder.
          const power = 6 + clamp(pointer.speed * 0.4, 0, 14);
          p.vx -= (dx / d) * force * power;
          p.vy -= (dy / d) * force * power;
        }
      }
      // Spring home + damping (all clamped → never NaN/explode).
      p.vx += (p.baseX - p.x) * 0.05;
      p.vy += (p.baseY - p.y) * 0.05;
      p.vx = clamp(p.vx * 0.9, -40, 40);
      p.vy = clamp(p.vy * 0.9, -40, 40);
      p.x = safe(p.x + p.vx, p.baseX);
      p.y = safe(p.y + p.vy, p.baseY);

      const off = Math.hypot(p.x - p.baseX, p.y - p.baseY);
      const lit = clamp(off / 30, 0, 1);
      const a = 0.55 + breathe * 0.1 + lit * 0.45;
      ctx.fillStyle = lit > 0.4
        ? `rgba(170, 250, 255, ${clamp(a, 0, 1)})`
        : `rgba(0, 240, 255, ${clamp(a, 0, 1)})`;
      const s = 1.7 + lit * 1.3;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  if (reduceMotion) {
    step(0, performance.now());
  } else {
    loop.add(step);
  }
  return true;
}
