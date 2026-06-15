/* ============================================================
   core/pointer.js — one global pointer source of truth.
   A single set of listeners feeds smoothed position + velocity that
   every module (cursor, starfield, logo) reads. Avoids N listeners
   all doing their own getBoundingClientRect math.
   ============================================================ */
import { clamp, safe } from "./util.js";

export const pointer = {
  // Raw viewport coords (px).
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  // Smoothed coords (lerped toward raw each frame).
  sx: window.innerWidth / 2,
  sy: window.innerHeight / 2,
  // Velocity (px/frame, smoothed).
  vx: 0,
  vy: 0,
  speed: 0,
  // Normalized −1..1 from center (for shader uniforms / parallax).
  nx: 0,
  ny: 0,
  down: false,
  active: false,
};

let prevX = pointer.x;
let prevY = pointer.y;

function onMove(e) {
  const x = safe(e.clientX, pointer.x);
  const y = safe(e.clientY, pointer.y);
  pointer.x = x;
  pointer.y = y;
  pointer.active = true;
}

window.addEventListener("pointermove", onMove, { passive: true });
window.addEventListener(
  "pointerdown",
  () => {
    pointer.down = true;
  },
  { passive: true }
);
window.addEventListener(
  "pointerup",
  () => {
    pointer.down = false;
  },
  { passive: true }
);
window.addEventListener("pointerleave", () => {
  pointer.active = false;
});
window.addEventListener("blur", () => {
  pointer.active = false;
  pointer.down = false;
});

/* Call once per frame from the shared loop (main wires this). */
export function updatePointer() {
  // Smooth follow.
  pointer.sx += (pointer.x - pointer.sx) * 0.18;
  pointer.sy += (pointer.y - pointer.sy) * 0.18;

  // Velocity from smoothed delta (kept finite + capped).
  const dx = clamp(pointer.x - prevX, -200, 200);
  const dy = clamp(pointer.y - prevY, -200, 200);
  pointer.vx += (dx - pointer.vx) * 0.25;
  pointer.vy += (dy - pointer.vy) * 0.25;
  pointer.speed = Math.hypot(pointer.vx, pointer.vy);
  prevX = pointer.x;
  prevY = pointer.y;

  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  pointer.nx = clamp((pointer.x / w) * 2 - 1, -1, 1);
  pointer.ny = clamp((pointer.y / h) * 2 - 1, -1, 1);
}
