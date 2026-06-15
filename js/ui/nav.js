/* ============================================================
   ui/nav.js — sticky nav state. Ported from the stable script.js.
   ============================================================ */
export function initNav() {
  const nav = document.getElementById("nav");
  if (!nav) return false;
  let ticking = false;
  const update = () => {
    nav.classList.toggle("is-stuck", window.scrollY > 60);
    ticking = false;
  };
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
  update();
  return true;
}
