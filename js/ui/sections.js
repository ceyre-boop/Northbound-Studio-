/* ============================================================
   ui/sections.js — WORK horizontal gallery (hub mode).
   Arrows + dots + drag + keyboard, with snap. In linear mode the
   track is a vertical grid (CSS) and transforms are cleared.
   ============================================================ */
import { clamp } from "../core/util.js";

export function initSections() {
  const track = document.querySelector("[data-work-track]");
  if (!track) return false;
  const slides = [...track.children];
  const dotsWrap = document.querySelector("[data-work-dots]");
  const prev = document.querySelector("[data-work-prev]");
  const next = document.querySelector("[data-work-next]");
  let idx = 0;

  const isHub = () => document.body.dataset.mode === "hub";

  if (dotsWrap) {
    dotsWrap.innerHTML = "";
    slides.forEach((_, i) => {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "work__dot" + (i === 0 ? " is-active" : "");
      d.setAttribute("aria-label", `Project ${i + 1}`);
      d.addEventListener("click", () => go(i));
      dotsWrap.appendChild(d);
    });
  }

  function applyTransform() {
    if (isHub()) track.style.transform = `translateX(${-idx * 100}%)`;
    else track.style.transform = ""; // never offset the vertical grid
  }

  function go(i) {
    idx = clamp(i, 0, slides.length - 1);
    applyTransform();
    if (dotsWrap)
      [...dotsWrap.children].forEach((d, j) => d.classList.toggle("is-active", j === idx));
  }

  if (prev) prev.addEventListener("click", () => go(idx - 1));
  if (next) next.addEventListener("click", () => go(idx + 1));

  window.addEventListener("keydown", (e) => {
    if (!isHub()) return;
    const wp = document.getElementById("work");
    if (!wp || !wp.classList.contains("is-active")) return;
    if (e.key === "ArrowRight") go(idx + 1);
    if (e.key === "ArrowLeft") go(idx - 1);
  });

  // Drag / swipe (hub only).
  let down = false, sx = 0, dx = 0;
  track.addEventListener("pointerdown", (e) => {
    if (!isHub()) return;
    down = true;
    sx = e.clientX;
    dx = 0;
    track.style.transition = "none";
  });
  window.addEventListener("pointermove", (e) => {
    if (!down) return;
    dx = e.clientX - sx;
    track.style.transform = `translateX(calc(${-idx * 100}% + ${dx}px))`;
  });
  window.addEventListener("pointerup", () => {
    if (!down) return;
    down = false;
    track.style.transition = "";
    if (Math.abs(dx) > 80) go(idx + (dx < 0 ? 1 : -1));
    else applyTransform();
  });

  window.addEventListener("resize", applyTransform);
  applyTransform();
  return true;
}
