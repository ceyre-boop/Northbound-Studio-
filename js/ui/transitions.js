/* ============================================================
   ui/transitions.js — fly-in / fly-out of section panels (hub mode).
   The clicked node's screen position becomes the panel's
   transform-origin, so the panel expands *from* that node.
   LAYER 2 (cinematic transition): on open, dust implodes toward the
   node (`nb:warp`), an expanding light ring + flash fire from that
   point (#warpgate), then the panel reveals from inside it. On close
   the dust scatters back outward. CSS owns the animations; this sets
   origin + classes + dispatches the impulse — and is written so a
   thrown FX call can NEVER stop the panel from opening/closing.
   ============================================================ */
import { reduceMotion } from "../core/util.js";

export function createTransitions() {
  let current = null;

  const panelEl = (id) => document.getElementById(id);
  const nodeFor = (id) => document.querySelector(`.node[data-target="${id}"]`);

  function originPoint(id) {
    const node = nodeFor(id);
    if (node) {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function setOrigin(panel, id) {
    const o = originPoint(id);
    panel.style.setProperty("--ox", `${o.x}px`);
    panel.style.setProperty("--oy", `${o.y}px`);
    return o;
  }

  /* The warp-gate overlay (light ring + flash), created once. */
  let gate = null;
  function ensureGate() {
    if (gate) return gate;
    gate = document.createElement("div");
    gate.id = "warpgate";
    gate.setAttribute("aria-hidden", "true");
    gate.innerHTML =
      `<span class="warpgate__flash"></span><span class="warpgate__ring"></span>`;
    document.body.appendChild(gate);
    return gate;
  }
  function fireWarp(dir, o) {
    const g = ensureGate();
    if (!g) return;
    g.style.setProperty("--ox", `${o.x}px`);
    g.style.setProperty("--oy", `${o.y}px`);
    g.classList.remove("is-in", "is-out");
    void g.offsetWidth; // force reflow so the animation restarts
    g.classList.add(dir === "out" ? "is-out" : "is-in");
  }
  function impulse(type, o) {
    try {
      document.dispatchEvent(
        new CustomEvent("nb:warp", { detail: { type, x: o.x, y: o.y } })
      );
    } catch (e) {
      /* CustomEvent unsupported — particles just won't react */
    }
  }

  function focusHeading(panel) {
    const h = panel.querySelector(".panel__title");
    if (!h) return;
    h.setAttribute("tabindex", "-1");
    try { h.focus({ preventScroll: true }); } catch (e) { try { h.focus(); } catch (_) {} }
  }

  function open(id) {
    const panel = panelEl(id);
    if (!panel || !panel.classList.contains("panel")) return;
    if (current && current !== id) {
      const prev = panelEl(current);
      if (prev) prev.classList.remove("is-active");
    }
    const o = setOrigin(panel, id);
    // Force-reveal children (IntersectionObserver may not fire reliably
    // for a panel that toggles visibility), and reset scroll to top.
    panel.querySelectorAll("[data-reveal]").forEach((e) => e.classList.add("is-visible"));
    panel.scrollTop = 0;
    current = id;

    // The reveal itself — the essential, must-not-fail part.
    const reveal = () => {
      panel.classList.add("is-active");
      document.body.classList.add("is-panel-open");
      focusHeading(panel);
    };

    if (reduceMotion) {
      requestAnimationFrame(reveal);
      return;
    }

    // Cinematic burst, then reveal from inside the ring. Wrapped so any
    // failure falls straight through to an immediate reveal.
    let scheduled = false;
    try {
      fireWarp("in", o);
      impulse("implode", o);
      scheduled = true;
      setTimeout(reveal, 90);
    } catch (e) {
      if (!scheduled) requestAnimationFrame(reveal);
    }
  }

  function close() {
    if (current) {
      const p = panelEl(current);
      if (p) p.classList.remove("is-active");
      if (!reduceMotion) {
        try {
          const o = originPoint(current);
          fireWarp("out", o);
          impulse("scatter", o);
        } catch (e) { /* FX optional — closing must still happen */ }
      }
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
