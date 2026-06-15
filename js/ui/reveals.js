/* ============================================================
   ui/reveals.js — scroll reveals, hero load stagger, kinetic type.
   - [data-reveal] elements fade/rise in on first intersection.
   - Section titles scramble-decode when they enter view.
   - Hero stagger triggers once fonts are ready.
   All paths are reduced-motion safe (snap to final state).
   ============================================================ */
import { reduceMotion } from "../core/util.js";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&/<>*+";

function scramble(el) {
  const final = el.dataset.text || el.textContent;
  el.dataset.text = final;
  if (reduceMotion) {
    el.textContent = final;
    return;
  }
  const chars = final.split("");
  let frame = 0;
  const total = 26; // ~0.4s at 60fps
  const id = setInterval(() => {
    frame++;
    const resolved = Math.floor((frame / total) * chars.length);
    el.textContent = chars
      .map((c, i) => {
        if (c === " " || i < resolved) return c;
        return GLYPHS[(Math.random() * GLYPHS.length) | 0];
      })
      .join("");
    if (frame >= total) {
      clearInterval(id);
      el.textContent = final;
    }
  }, 16);
}

export function initReveals() {
  // Hero load stagger (fonts-aware), independent of the intro.
  const reveal = () => document.body.classList.add("is-loaded");
  if (document.fonts && document.fonts.ready) {
    Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 1200)),
    ]).then(reveal);
  } else {
    reveal();
  }

  const els = document.querySelectorAll("[data-reveal]");
  const titles = document.querySelectorAll(".section-title");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return true;
  }

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  els.forEach((el) => obs.observe(el));

  const titleObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          scramble(entry.target);
          titleObs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  titles.forEach((t) => titleObs.observe(t));

  return true;
}
