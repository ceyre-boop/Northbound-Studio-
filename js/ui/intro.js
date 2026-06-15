/* ============================================================
   ui/intro.js — cinematic first-visit intro.
   Line-draw marks → wordmark reveal → curtain lift.
   Fail-safes (so the page can NEVER be trapped on black):
     1. inline <head> script skips it for repeat visits (no flash)
     2. reduced-motion skips instantly
     3. click / keypress skips
     4. JS timer lifts at ~2.6s
     5. JS hard timer force-removes at 4s
     6. pure-CSS keyframe removes it at 6s even if JS never runs
   ============================================================ */
import { reduceMotion } from "../core/util.js";

export function initIntro() {
  const intro = document.getElementById("intro");
  if (!intro) {
    document.body.classList.add("intro-done");
    return false;
  }

  const done = () => {
    document.body.classList.add("intro-done");
    if (intro.isConnected) intro.remove();
  };

  const lift = () => {
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

  setTimeout(lift, 2600); // scheduled curtain lift
  setTimeout(done, 4000); // hard failsafe — remove no matter what

  return true;
}
