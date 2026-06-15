/* ============================================================
   ui/cursor.js — three-layer magnetic cursor.
   Dot (exact) · Ring (lerp + velocity stretch) · Aura (slow lerp).
   Modes: default / link / view (portfolio) / slice (hero logo).
   Desktop + fine-pointer only. Any failure restores native cursor.
   ============================================================ */
import { pointer } from "../core/pointer.js";
import { loop } from "../core/loop.js";
import { isTouch, reduceMotion, clamp, lerp } from "../core/util.js";

export function initCursor() {
  if (isTouch || reduceMotion) return false;

  const root = document.createElement("div");
  root.className = "cursor";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="cursor__aura"></div>
    <div class="cursor__ring"><span class="cursor__label"></span></div>
    <div class="cursor__dot"></div>`;
  document.body.appendChild(root);
  document.documentElement.classList.add("has-cursor");

  const aura = root.querySelector(".cursor__aura");
  const ring = root.querySelector(".cursor__ring");
  const dot = root.querySelector(".cursor__dot");
  const label = root.querySelector(".cursor__label");

  // Lerp state.
  let rx = pointer.x,
    ry = pointer.y; // ring
  let ax = pointer.x,
    ay = pointer.y; // aura

  let mode = "";
  function setMode(next, text) {
    if (mode === next) return;
    mode = next;
    root.dataset.mode = next;
    label.textContent = text || "";
  }

  // Hover detection via event delegation (cheap, no per-frame hit test).
  const LINKISH = "a, button, .btn, input, select, textarea, label, [data-magnetic]";
  document.addEventListener("pointerover", (e) => {
    const t = e.target;
    if (t.closest(".project__frame")) setMode("view", "VIEW");
    else if (t.closest(".hero__logo")) setMode("slice", "");
    else if (t.closest(LINKISH)) setMode("link", "");
  });
  document.addEventListener("pointerout", (e) => {
    const to = e.relatedTarget;
    if (
      !to ||
      (!to.closest(".project__frame") &&
        !to.closest(".hero__logo") &&
        !to.closest(LINKISH))
    ) {
      setMode("", "");
    }
  });

  // Magnetic pull on tagged elements.
  const magnets = [];
  function collectMagnets() {
    magnets.length = 0;
    document
      .querySelectorAll("[data-magnetic], .btn, .nav__cta")
      .forEach((el) => magnets.push(el));
  }
  collectMagnets();
  window.addEventListener("resize", () => setTimeout(collectMagnets, 200));

  function applyMagnets() {
    for (const el of magnets) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(r.width, r.height) * 0.9 + 24;
      if (dist < radius) {
        const pull = (1 - dist / radius) * 0.35;
        el.style.transform = `translate(${dx * pull}px, ${dy * pull}px)`;
        el.classList.add("is-magnet");
      } else if (el.classList.contains("is-magnet")) {
        el.style.transform = "";
        el.classList.remove("is-magnet");
      }
    }
  }

  function render() {
    // Dot is exact; ring/aura lag for depth.
    dot.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
    rx = lerp(rx, pointer.x, 0.22);
    ry = lerp(ry, pointer.y, 0.22);
    ax = lerp(ax, pointer.x, 0.10);
    ay = lerp(ay, pointer.y, 0.10);

    // Velocity stretch along travel direction.
    const sp = clamp(pointer.speed * 0.02, 0, 0.45);
    const ang = Math.atan2(pointer.vy, pointer.vx);
    ring.style.transform =
      `translate(${rx}px, ${ry}px) rotate(${ang}rad) scale(${1 + sp}, ${1 - sp * 0.6})`;
    aura.style.transform = `translate(${ax}px, ${ay}px)`;
    if (!reduceMotion) applyMagnets();
  }

  loop.add(render);

  // Hide while outside the window; restore on return.
  document.addEventListener("mouseleave", () => (root.style.opacity = "0"));
  document.addEventListener("mouseenter", () => (root.style.opacity = "1"));

  return true;
}
