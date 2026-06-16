/* ============================================================
   main.js — orchestrator for The Observatory.
   Progressive enhancement: the linear scroll site is the resilient
   base; the hub is layered on top. Every feature inits inside
   guard() so one failure is contained. If the hub renderer fails,
   we pin to linear. Background degrades WebGL2 → Canvas-2D → CSS.
   ============================================================ */
import { loop } from "./core/loop.js";
import { updatePointer } from "./core/pointer.js";
import { guard, reduceMotion } from "./core/util.js";
import { initStarfield } from "./webgl/starfield.js";
import { initFallback2D } from "./webgl/fallback2d.js";
import { initIntro } from "./ui/intro.js";
import { initReveals } from "./ui/reveals.js";
import { initNav } from "./ui/nav.js";
import { initCursor } from "./ui/cursor.js";
import { initLogo } from "./ui/logo.js";
import { initScrollFX } from "./ui/scrollfx.js";
import { initTilt } from "./ui/tilt.js";
import { initForm } from "./ui/form.js";
import { initObservatory } from "./ui/observatory.js";
import { initSections } from "./ui/sections.js";
import { initRouter } from "./core/router.js";

function wantsHub() {
  return (
    window.matchMedia("(min-width: 768px) and (hover: hover) and (pointer: fine)").matches &&
    !reduceMotion
  );
}

function initBackground() {
  const canvas = document.getElementById("bg");
  if (!canvas) {
    document.documentElement.classList.add("bg-static");
    return;
  }
  if (guard("starfield", () => initStarfield(canvas)) === true) return;
  const fresh = canvas.cloneNode(false);
  canvas.replaceWith(fresh);
  if (guard("fallback2d", () => initFallback2D(fresh)) === true) return;
  document.documentElement.classList.add("bg-static");
}

function initEasterEgg() {
  const seq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
  let i = 0;
  window.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    i = k === seq[i] ? i + 1 : k === seq[0] ? 1 : 0;
    if (i === seq.length) {
      i = 0;
      document.body.classList.add("warp");
      setTimeout(() => document.body.classList.remove("warp"), 1400);
    }
  });
}

function signature() {
  try {
    console.log(
      "%cNORTHBOUND%cSTUDIO  · The Observatory",
      "background:#00f0ff;color:#060608;font-weight:800;padding:4px 8px;border-radius:6px 0 0 6px;font-family:sans-serif;",
      "background:#060608;color:#00f0ff;font-weight:800;padding:4px 8px;border-radius:0 6px 6px 0;font-family:sans-serif;border:1px solid #00f0ff;"
    );
    console.log("%cHand-built · zero dependencies · raw WebGL2 + GLSL  ↑↑↓↓←→←→BA", "color:#7a7a8e;font-family:monospace;");
  } catch (e) {}
}

function boot() {
  loop.add(updatePointer);

  initBackground();

  // The hub renderer must succeed for hub mode to be allowed.
  const hubReady = guard("observatory", initObservatory) === true;
  const setMode = (m) => {
    document.body.dataset.mode = m === "hub" && hubReady ? "hub" : "linear";
  };
  setMode(wantsHub() ? "hub" : "linear");

  // Shared features (each self-gates on touch / reduced-motion / mode).
  guard("intro", initIntro);
  guard("reveals", initReveals);
  guard("nav", initNav);
  guard("form", initForm);
  guard("tilt", initTilt);
  guard("cursor", initCursor);
  guard("logo", initLogo);
  guard("sections", initSections);
  guard("scrollfx", initScrollFX);
  guard("router", initRouter);
  guard("easter", initEasterEgg);
  signature();

  // Re-evaluate mode when crossing the breakpoint.
  let last = document.body.dataset.mode;
  window.addEventListener("resize", () => {
    const m = wantsHub() ? "hub" : "linear";
    if (m !== last) {
      last = m;
      setMode(m);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
