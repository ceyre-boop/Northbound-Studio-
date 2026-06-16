/* ============================================================
   core/router.js — hash routing for the constellation.
   #studio | #work | #packages | #apply → fly into that panel.
   Empty hash → back to the map. Drives browser back/forward,
   deep-links, keyboard, and the nav/node anchors uniformly.
   Only intervenes in hub mode; linear mode uses native anchors.
   ============================================================ */
import { createTransitions } from "../ui/transitions.js";

export function initRouter() {
  const PANELS = ["studio", "work", "packages", "apply"];
  const t = createTransitions();
  const isHub = () => document.body.dataset.mode === "hub";

  function apply() {
    if (!isHub()) {
      // Linear mode: panels are normal sections; native anchors scroll.
      t.close();
      return;
    }
    const id = (location.hash || "").replace("#", "");
    if (PANELS.includes(id)) t.open(id);
    else t.close();
  }

  function goHub() {
    if (location.hash && location.hash !== "#") {
      location.hash = ""; // fires hashchange → apply() closes
    } else {
      t.close();
    }
  }

  window.addEventListener("hashchange", apply);
  window.addEventListener("popstate", apply);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isHub() && t.current) goHub();
  });

  document.querySelectorAll("[data-back]").forEach((b) =>
    b.addEventListener("click", goHub)
  );
  document.querySelectorAll("[data-home]").forEach((b) =>
    b.addEventListener("click", (e) => {
      if (isHub()) {
        e.preventDefault();
        goHub();
      }
    })
  );

  apply(); // honor a deep-link on load
  return { apply, goHub };
}
