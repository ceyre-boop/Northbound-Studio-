/* ============================================================
   ui/observatory.js — the constellation hub renderer.
   Positions the orbital nodes (floating drift) and draws the
   star-chart: dashed center→node lines + concentric radar rings.
   Only renders while in hub mode with no panel open.
   Returns false if the hub markup is missing (→ force linear).
   ============================================================ */
import { loop } from "../core/loop.js";
import { DPR, reduceMotion } from "../core/util.js";

export function initObservatory() {
  const hub = document.getElementById("hub");
  const canvas = hub && hub.querySelector(".hub__lines");
  const brandN = document.getElementById("brandN");
  const nodes = [...document.querySelectorAll(".node")];
  if (!hub || !canvas || !nodes.length) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  let W = 0, H = 0, cx = 0, cy = 0, rx = 0, ry = 0;
  const pos = nodes.map(() => ({ x: 0, y: 0, bx: 0, by: 0, phase: Math.random() * 6.283 }));

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Orbit the viewport center (mode-independent — measuring the "N"
    // mid-boot is unreliable because the body may still be in linear mode).
    cx = W / 2;
    cy = H * 0.47;
    rx = Math.min(W * 0.30, 380);
    ry = Math.max(Math.min(H * 0.32, 320), 190);
    const n = nodes.length;
    nodes.forEach((_, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2; // top, clockwise
      pos[i].bx = cx + Math.cos(ang) * rx;
      pos[i].by = cy + Math.sin(ang) * ry;
    });
  }
  layout();
  window.addEventListener("resize", () => setTimeout(layout, 60));

  const active = () =>
    document.body.dataset.mode === "hub" &&
    !document.body.classList.contains("is-panel-open");

  function draw(dt, now) {
    if (!active()) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    ctx.clearRect(0, 0, W, H);

    // Concentric radar rings emanating from center.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,240,255,0.05)";
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * (k / 3) + 26, ry * (k / 3) + 26, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const t = now * 0.001;
    const drift = reduceMotion ? 0 : 1;
    nodes.forEach((node, i) => {
      const p = pos[i];
      p.x = p.bx + Math.sin(t * 0.6 + p.phase) * 11 * drift;
      p.y = p.by + Math.cos(t * 0.5 + p.phase) * 11 * drift;
      node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    });

    // Dashed, pulsing star-chart lines from center to each node.
    ctx.setLineDash([3, 6]);
    nodes.forEach((node, i) => {
      const p = pos[i];
      const pulse = 0.12 + 0.1 * Math.sin(t * 1.5 + i);
      ctx.strokeStyle = `rgba(0,240,255,${pulse.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  loop.add(draw);
  return true;
}
