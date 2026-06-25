/* app.js — orchestrator. Sets up the shared pointer + frame loop, Lenis
   smooth scroll wired to ScrollTrigger, the boot sequence, nav, smooth
   anchors, and boots every module. Mobile/reduced-motion are gated here. */
(function () {
  window.NB = window.NB || {};

  NB.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  NB.burstAt = null; // assigned by cursor

  function boot() {
    const bootEl = document.getElementById("boot");
    if (!bootEl) { NB.animations.revealHero(); return; }
    const log = bootEl.querySelector(".boot__log");
    const nSvg = bootEl.querySelector(".boot__n");
    const nPath = bootEl.querySelector(".boot__n path");
    const lines = [
      "> INITIALIZING NORTHBOUND.SYSTEMS...",
      "> LOADING CREATIVE ENGINE v2.0...",
      "> CALIBRATING DESIGN PROTOCOLS...",
      "> STATUS: ONLINE",
    ];
    let li = 0, ci = 0, text = "";
    function type() {
      if (li >= lines.length) { afterLog(); return; }
      const line = lines[li];
      if (ci <= line.length) { log.textContent = text + line.slice(0, ci); ci++; setTimeout(type, 15); }
      else { text += line + "\n"; li++; ci = 0; setTimeout(type, 130); }
    }
    function afterLog() {
      gsap.set(nSvg, { opacity: 1 });
      gsap.timeline()
        .to(nPath, { strokeDashoffset: 0, duration: 1.0, ease: "power2.inOut" })
        .add(() => { if (NB.three && NB.three.available) NB.three.burst(); })
        .to(bootEl, { opacity: 0, duration: 0.6, ease: "power2.out" }, "+=0.15")
        .add(() => { bootEl.classList.add("is-done"); NB.animations.revealHero(); });
    }
    type();
    // Failsafe — never trap the page on the boot screen.
    setTimeout(() => { if (!bootEl.classList.contains("is-done")) { bootEl.classList.add("is-done"); NB.animations.revealHero(); } }, 6000);
  }

  function ready() {
    // Plugins.
    if (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);

    // Hide hero items pre-reveal (covered by the boot overlay anyway).
    if (!NB.reduceMotion && typeof gsap !== "undefined") gsap.set("[data-hero]", { opacity: 0, y: 24 });

    // Cursor.
    if (NB.cursor) NB.cursor.init();

    // Three.js hero (desktop, motion only).
    NB.skipThree = NB.reduceMotion || isMobile;
    if (!NB.skipThree && NB.three) {
      const c = document.querySelector(".hero__canvas");
      try { NB.three.init(c); } catch (e) { NB.three.available = false; }
    }

    // Lenis smooth scroll (desktop, motion only) wired to ScrollTrigger.
    let lenis = null;
    if (!NB.reduceMotion && !isMobile && typeof Lenis !== "undefined") {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      if (typeof ScrollTrigger !== "undefined") lenis.on("scroll", ScrollTrigger.update);
    }
    NB.lenis = lenis;

    // Form + scene choreography.
    if (NB.form) NB.form.init();
    if (NB.animations) NB.animations.init({ mobile: isMobile, reduceMotion: NB.reduceMotion });

    // Smooth-scroll anchors.
    document.querySelectorAll("[data-scroll]").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (!href || href[0] !== "#") return;
        const el = href === "#top" ? document.body : document.querySelector(href);
        if (!el) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(el, { offset: 0 });
        else el.scrollIntoView({ behavior: NB.reduceMotion ? "auto" : "smooth" });
        closeMenu();
      });
    });

    // Nav burger.
    const burger = document.querySelector(".nav__burger");
    const menu = document.querySelector(".navmenu");
    const navEl = document.getElementById("nav");
    function closeMenu() { if (!menu) return; menu.classList.remove("is-open"); navEl.classList.remove("is-menu"); burger && burger.setAttribute("aria-expanded", "false"); }
    if (burger && menu) {
      burger.addEventListener("click", () => {
        const open = menu.classList.toggle("is-open");
        navEl.classList.toggle("is-menu", open);
        burger.setAttribute("aria-expanded", String(open));
      });
    }

    // Single ticker: Lenis raf + pointer velocity + scroll + frame callbacks.
    if (typeof gsap !== "undefined") {
      gsap.ticker.lagSmoothing(0);
      gsap.ticker.add((time) => {
        if (lenis) lenis.raf(time * 1000);
        const p = NB.pointer;
        p.vx += (p.x - px - p.vx) * 0.25; p.vy += (p.y - py - p.vy) * 0.25;
        p.speed = Math.hypot(p.vx, p.vy); px = p.x; py = p.y;
        p.nx = (p.x / innerWidth) * 2 - 1; p.ny = (p.y / innerHeight) * 2 - 1;
        NB.scrollY = lenis ? lenis.scroll : (window.scrollY || window.pageYOffset || 0);
        const dt = Math.min(gsap.ticker.deltaRatio(60) / 60, 0.05);
        for (let i = 0; i < NB._frames.length; i++) { try { NB._frames[i](dt); } catch (e) {} }
      });
    }

    // Boot.
    if (NB.reduceMotion) { const b = document.getElementById("boot"); if (b) b.classList.add("is-done"); NB.animations.revealHero(); }
    else boot();

    window.addEventListener("load", () => { if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
