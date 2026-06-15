/* ============================================================
   ui/tilt.js — package cards: parallax tilt + cursor-tracking sheen.
   Sets CSS custom props (--mx/--my) the stylesheet uses to position
   a specular highlight, plus a 3D rotate toward the pointer.
   Desktop + motion only.
   ============================================================ */
import { reduceMotion, isTouch, clamp } from "../core/util.js";

export function initTilt() {
  if (reduceMotion || isTouch) return false;
  const cards = document.querySelectorAll(".pkg");
  if (!cards.length) return false;

  cards.forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1);
      const py = clamp((e.clientY - r.top) / r.height, 0, 1);
      card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      card.style.transform =
        `perspective(900px) rotateY(${(px - 0.5) * 9}deg) rotateX(${(0.5 - py) * 9}deg) translateZ(8px)`;
      card.classList.add("is-tilting");
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
      card.classList.remove("is-tilting");
    });
  });
  return true;
}
