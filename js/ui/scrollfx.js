/* ============================================================
   ui/scrollfx.js — scroll-LINKED cinema (native scroll kept).
   - Vertical progress rail that fills with page progress.
   - Live section counter "0X / NN — LABEL".
   - Subtle parallax on [data-parallax] elements.
   No scroll-hijacking → anchors, fixed nav, modal, a11y all intact.
   ============================================================ */
import { reduceMotion, isTouch, clamp } from "../core/util.js";

const LABELS = {
  hero: "Home",
  why: "Studio",
  packages: "Packages",
  work: "Work",
  apply: "Contact",
};

export function initScrollFX() {
  const sections = [...document.querySelectorAll("main section[id]")];
  if (!sections.length) return false;

  // Build the HUD: progress rail + section counter.
  const hud = document.createElement("div");
  hud.className = "hud";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `
    <div class="hud__rail"><span class="hud__fill"></span></div>
    <div class="hud__count"><span class="hud__idx">01</span><span class="hud__sep">/</span><span class="hud__total"></span><span class="hud__label"></span></div>`;
  document.body.appendChild(hud);
  const fill = hud.querySelector(".hud__fill");
  const idxEl = hud.querySelector(".hud__idx");
  const labelEl = hud.querySelector(".hud__label");
  hud.querySelector(".hud__total").textContent = String(
    sections.length
  ).padStart(2, "0");

  const parallax = [...document.querySelectorAll("[data-parallax]")];

  let ticking = false;
  function update() {
    ticking = false;
    const scrollY = window.scrollY || 0;
    const max = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1
    );
    const prog = clamp(scrollY / max, 0, 1);
    fill.style.transform = `scaleY(${prog})`;

    // Active section = the last one whose top has passed mid-viewport.
    const mid = scrollY + window.innerHeight * 0.4;
    let active = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= mid) active = i;
    }
    idxEl.textContent = String(active + 1).padStart(2, "0");
    labelEl.textContent = LABELS[sections[active].id] || "";

    if (!reduceMotion && !isTouch) {
      const vh = window.innerHeight;
      for (const el of parallax) {
        const speed = parseFloat(el.dataset.parallax) || 0.06;
        const r = el.getBoundingClientRect();
        const fromCenter = r.top + r.height / 2 - vh / 2;
        el.style.setProperty("--py", `${(-fromCenter * speed).toFixed(1)}px`);
      }
    }
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", () => requestAnimationFrame(update));
  update();
  return true;
}
