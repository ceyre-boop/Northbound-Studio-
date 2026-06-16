/* ============================================================
   ui/intro.js — cinematic first-visit intro.
   N draws itself → "NORTHBOUND STUDIO" typewriters in → curtain lift.
   Fail-safes (so the page can NEVER be trapped on black):
     1. inline <head> script skips it for repeat visits (no flash)
     2. reduced-motion skips instantly
     3. click / keypress skips
     4. JS timer lifts at ~3.2s (after the wordmark finishes)
     5. JS hard timer force-removes at 4.6s
     6. pure-CSS keyframe removes it at ~3.2s even if JS never runs
   ============================================================ */
import { reduceMotion } from "../core/util.js";

export function initIntro() {
  const intro = document.getElementById("intro");
  if (!intro) {
    document.body.classList.add("intro-done");
    return false;
  }

  let typeTimer = 0;

  const done = () => {
    clearInterval(typeTimer);
    document.body.classList.add("intro-done");
    if (intro.isConnected) intro.remove();
  };

  const lift = () => {
    clearInterval(typeTimer);
    intro.classList.add("is-lifted");
    document.body.classList.add("intro-done");
    intro.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 1200); // belt + suspenders
  };

  const skip =
    document.documentElement.classList.contains("intro-skip") || reduceMotion;

  if (skip) {
    done();
    return true;
  }

  try {
    sessionStorage.setItem("nb_intro", "1");
  } catch (e) {
    /* private mode — fine, intro just replays */
  }

  intro.classList.add("is-playing");
  intro.addEventListener("click", lift, { once: true });
  window.addEventListener("keydown", lift, { once: true });

  // Typewriter the wordmark once the N has finished drawing itself (~1.1s).
  const type = intro.querySelector(".intro__type");
  if (type) {
    const text = "NORTHBOUND STUDIO";
    setTimeout(() => {
      let i = 0;
      type.classList.add("is-typing");
      typeTimer = setInterval(() => {
        i++;
        type.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(typeTimer);
          type.classList.add("is-typed");
        }
      }, 68);
    }, 1000);
  }

  setTimeout(lift, 3200); // scheduled curtain lift (after the wordmark types in)
  setTimeout(done, 4600); // hard failsafe — remove no matter what

  return true;
}
