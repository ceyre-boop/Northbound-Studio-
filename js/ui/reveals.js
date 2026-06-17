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

/* Count a price up from zero, preserving its currency span + separators
   ($250 / $400–600 / $750+). Reduced-motion callers just skip it. */
function countUpPrice(priceEl) {
  const span = priceEl.querySelector(".pkg__currency");
  const currency = span ? span.textContent : "";
  const tpl = priceEl.textContent.replace(currency, "");
  const targets = (tpl.match(/\d+/g) || []).map(Number);
  if (!targets.length) return;
  const dur = 950;
  const start = performance.now();
  function frame(now) {
    const t = Math.min((now - start) / dur, 1);
    const e = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    let idx = 0;
    const out = tpl.replace(/\d+/g, () => String(Math.round(targets[idx++] * e)));
    priceEl.textContent = "";
    if (span) priceEl.appendChild(span);
    priceEl.appendChild(document.createTextNode(out));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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

  // Price count-up. In linear mode the IntersectionObserver fires on scroll;
  // in hub mode the prices live in a hidden fixed panel, so we also trigger
  // when the Packages panel is opened (hashchange). A WeakSet de-dupes.
  const counted = new WeakSet();
  const runCount = (p) => { if (!counted.has(p)) { counted.add(p); countUpPrice(p); } };
  const isShown = (el) =>
    getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length > 0;
  const prices = [...document.querySelectorAll(".pkg__price")];
  if (prices.length) {
    const priceObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && isShown(entry.target)) {
            priceObs.unobserve(entry.target);
            runCount(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    prices.forEach((p) => priceObs.observe(p));
    window.addEventListener("hashchange", () => {
      if (location.hash === "#packages") prices.forEach(runCount);
    });
  }

  return true;
}
