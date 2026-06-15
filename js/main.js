/* ============================================================
   main.js — orchestrator.
   Initializes every feature inside its own guard() so one failure
   is logged and skipped, never fatal. Background degrades through
   WebGL2 → Canvas-2D → static CSS gradient. The page is never blank.
   ============================================================ */
import { loop } from "./core/loop.js";
import { updatePointer } from "./core/pointer.js";
import { guard } from "./core/util.js";
import { initStarfield } from "./webgl/starfield.js";
import { initFallback2D } from "./webgl/fallback2d.js";
import { initIntro } from "./ui/intro.js";
import { initReveals } from "./ui/reveals.js";
import { initNav } from "./ui/nav.js";
import { initCursor } from "./ui/cursor.js";
import { initLogo } from "./ui/logo.js";
import { initScrollFX } from "./ui/scrollfx.js";
import { initTilt } from "./ui/tilt.js";
import { initModal } from "./ui/modal.js";
import { initForm } from "./ui/form.js";

function initBackground() {
  const canvas = document.getElementById("bg");
  if (!canvas) {
    document.documentElement.classList.add("bg-static");
    return;
  }
  // 1) WebGL2 deep-space constellation.
  if (guard("starfield", () => initStarfield(canvas)) === true) return;

  // 2) Canvas-2D constellation (fresh canvas — old one may hold a GL ctx).
  const fresh = canvas.cloneNode(false);
  canvas.replaceWith(fresh);
  if (guard("fallback2d", () => initFallback2D(fresh)) === true) return;

  // 3) Static CSS gradient backdrop.
  document.documentElement.classList.add("bg-static");
}

function initEasterEgg() {
  const seq = [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a",
  ];
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
      "%cNORTHBOUND%cSTUDIO",
      "background:#00f0ff;color:#001316;font-weight:800;padding:4px 8px;border-radius:6px 0 0 6px;font-family:sans-serif;",
      "background:#0a0a0a;color:#00f0ff;font-weight:800;padding:4px 8px;border-radius:0 6px 6px 0;font-family:sans-serif;border:1px solid #00f0ff;"
    );
    console.log(
      "%cHand-built. Zero dependencies. Raw WebGL2 + GLSL.  ↑↑↓↓←→←→BA",
      "color:#8b8d90;font-family:monospace;"
    );
  } catch (e) {
    /* console styling unsupported — no problem */
  }
}

function boot() {
  // Pointer must update first each frame so renderers read fresh values.
  loop.add(updatePointer);

  initBackground();
  guard("intro", initIntro);
  guard("reveals", initReveals);
  guard("nav", initNav);
  guard("cursor", initCursor);
  guard("logo", initLogo);
  guard("scrollfx", initScrollFX);
  guard("tilt", initTilt);
  guard("modal", initModal);
  guard("form", initForm);
  guard("easter", initEasterEgg);
  signature();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
