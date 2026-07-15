/* app.js — orchestrator. Shared pointer + frame bus, Lenis smooth scroll
   wired to ScrollTrigger, nav, smooth anchors; boots every module.
   Mobile/reduced-motion are gated here (body.no-three hides WebGL scenes). */
(function () {
  window.NB = window.NB || {};

  // ?motion=full forces the cinematic experience (overrides OS reduce-motion);
  // ?motion=lite forces the calm fallback. No param → honor the OS setting.
  const motionParam = new URLSearchParams(location.search).get("motion");
  NB.reduceMotion = motionParam === "full" ? false
    : motionParam === "lite" ? true
    : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (motionParam === "full") document.documentElement.classList.add("force-motion");
  NB.isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const isMobile = window.innerWidth <= 768;
  if (isMobile) document.body.classList.add("is-mobile");

  // Shared pointer + frame bus.
  NB.pointer = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, vx: 0, vy: 0, speed: 0, active: false };
  let px = NB.pointer.x, py = NB.pointer.y;
  window.addEventListener("pointermove", (e) => { NB.pointer.x = e.clientX; NB.pointer.y = e.clientY; NB.pointer.active = true; }, { passive: true });
  NB._frames = [];
  NB.onFrame = (fn) => NB._frames.push(fn);
  NB.scrollY = 0;
  NB.scrollVel = 0; // px/frame-ish scroll velocity (helix rotation reads this)
  NB.burstAt = null; // assigned by cursor

  function ready() {
    // Plugins.
    if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);

    // Cursor.
    if (NB.cursor) NB.cursor.init();

    // WebGL gating — one flag, one body class for CSS fallbacks.
    NB.skipThree = NB.reduceMotion || isMobile;
    if (NB.skipThree) document.body.classList.add("no-three");
    if (NB.helix) {
      const c = document.querySelector(".voyage__canvas");
      try { NB.helix.init(c); } catch (e) { document.body.classList.add("no-three"); }
    }

    // Lenis smooth scroll (desktop, motion only) wired to ScrollTrigger.
    let lenis = null;
    if (!NB.reduceMotion && !isMobile && typeof Lenis !== "undefined") {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      if (typeof ScrollTrigger !== "undefined") lenis.on("scroll", ScrollTrigger.update);
    }
    NB.lenis = lenis;

    // Shared smooth-scroll target helper (anchors + template picker).
    NB.scrollTo = (el) => {
      if (!el) return;
      if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.2 });
      else el.scrollIntoView({ behavior: NB.reduceMotion ? "auto" : "smooth" });
    };

    // Modules.
    if (NB.form) NB.form.init();
    if (NB.templates) NB.templates.init();
    if (NB.animations) NB.animations.init({ mobile: isMobile, reduceMotion: NB.reduceMotion });
    if (NB.hero) NB.hero.intro({ reduceMotion: NB.reduceMotion });

    // Smooth-scroll anchors.
    document.querySelectorAll("[data-scroll]").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (!href || href[0] !== "#") return;
        const el = href === "#top" ? document.body : document.querySelector(href);
        if (!el) return;
        e.preventDefault();
        NB.scrollTo(el);
        closeMenu();
      });
    });

    // Nav burger.
    const burger = document.querySelector(".nav__burger");
    const menu = document.querySelector(".navmenu");
    const navEl = document.getElementById("nav");
    function closeMenu() { if (!menu) return; menu.classList.remove("is-open"); navEl.classList.remove("is-menu"); menu.setAttribute("aria-hidden", "true"); burger && burger.setAttribute("aria-expanded", "false"); }
    if (burger && menu) {
      burger.addEventListener("click", () => {
        const open = menu.classList.toggle("is-open");
        navEl.classList.toggle("is-menu", open);
        burger.setAttribute("aria-expanded", String(open));
        menu.setAttribute("aria-hidden", String(!open));
      });
    }

    // Single ticker: Lenis raf + pointer velocity + scroll + frame callbacks.
    if (typeof gsap !== "undefined") {
      let prevScrollY = 0;
      gsap.ticker.lagSmoothing(0);
      gsap.ticker.add((time) => {
        if (lenis) lenis.raf(time * 1000);
        const p = NB.pointer;
        p.vx += (p.x - px - p.vx) * 0.25; p.vy += (p.y - py - p.vy) * 0.25;
        p.speed = Math.hypot(p.vx, p.vy); px = p.x; py = p.y;
        p.nx = (p.x / innerWidth) * 2 - 1; p.ny = (p.y / innerHeight) * 2 - 1;
        NB.scrollY = lenis ? lenis.scroll : (window.scrollY || window.pageYOffset || 0);
        NB.scrollVel = lenis ? (lenis.velocity || 0) : (NB.scrollY - prevScrollY);
        prevScrollY = NB.scrollY;
        const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.05);
        for (let i = 0; i < NB._frames.length; i++) { try { NB._frames[i](dt); } catch (e) {} }
      });
    }

    // Late layout shifts (fonts, hero images) move every pin — re-measure.
    window.addEventListener("load", () => { if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh(); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh(); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
