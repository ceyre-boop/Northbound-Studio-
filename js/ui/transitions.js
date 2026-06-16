/* ============================================================
   ui/transitions.js — fly-in / fly-out of section panels (hub mode).
   The clicked node's screen position becomes the panel's
   transform-origin, so the panel expands *from* that node.
   CSS owns the actual animation; this just sets origin + classes.
   ============================================================ */
export function createTransitions() {
  let current = null;

  const panelEl = (id) => document.getElementById(id);
  const nodeFor = (id) => document.querySelector(`.node[data-target="${id}"]`);

  function setOrigin(panel, id) {
    const node = nodeFor(id);
    if (node) {
      const r = node.getBoundingClientRect();
      panel.style.setProperty("--ox", `${r.left + r.width / 2}px`);
      panel.style.setProperty("--oy", `${r.top + r.height / 2}px`);
    } else {
      panel.style.setProperty("--ox", "50%");
      panel.style.setProperty("--oy", "50%");
    }
  }

  function open(id) {
    const panel = panelEl(id);
    if (!panel || !panel.classList.contains("panel")) return;
    if (current && current !== id) {
      const prev = panelEl(current);
      if (prev) prev.classList.remove("is-active");
    }
    setOrigin(panel, id);
    // Force-reveal children (IntersectionObserver may not fire reliably
    // for a panel that toggles visibility), and reset scroll to top.
    panel.querySelectorAll("[data-reveal]").forEach((e) => e.classList.add("is-visible"));
    panel.scrollTop = 0;
    requestAnimationFrame(() => {
      panel.classList.add("is-active");
      document.body.classList.add("is-panel-open");
    });
    current = id;
    // Move focus to the panel heading for keyboard/AT users.
    const h = panel.querySelector(".panel__title");
    if (h) {
      h.setAttribute("tabindex", "-1");
      try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
    }
  }

  function close() {
    if (current) {
      const p = panelEl(current);
      if (p) p.classList.remove("is-active");
    }
    current = null;
    document.body.classList.remove("is-panel-open");
  }

  return {
    open,
    close,
    get current() { return current; },
  };
}
