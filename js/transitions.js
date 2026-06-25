/* transitions.js — the inter-scene "anime moments".
   NB.transitions.play(type): swoosh | disintegrate | wipe | scan.
   Drives the fixed .fx overlay via GSAP. No-op under reduced motion. */
(function () {
  window.NB = window.NB || {};
  NB.transitions = {
    play(type) {
      if (NB.reduceMotion || typeof gsap === "undefined") return;
      const fx = document.querySelector(".fx");
      if (!fx) return;
      const sweep = fx.querySelector(".fx__sweep");
      const flash = fx.querySelector(".fx__flash");
      fx.classList.add("is-on");
      const done = () => fx.classList.remove("is-on");
      const tl = gsap.timeline({ onComplete: done });

      if (type === "wipe") {
        gsap.set(sweep, { left: "-40%", top: 0, rotation: 32, transformOrigin: "50% 50%", opacity: 1 });
        tl.to(sweep, { left: "140%", duration: 0.5, ease: "power2.inOut" }).set(sweep, { opacity: 0, rotation: 0 });
      } else if (type === "disintegrate") {
        gsap.set(flash, { opacity: 0, scale: 0.3, transformOrigin: "50% 50%" });
        tl.to(flash, { opacity: 0.75, scale: 1.4, duration: 0.22, ease: "power2.out" })
          .to(flash, { opacity: 0, scale: 1.8, duration: 0.32, ease: "power2.in" });
      } else if (type === "scan") {
        gsap.set(sweep, { rotation: 90, top: "-60%", left: "35%", opacity: 0.9, transformOrigin: "50% 50%" });
        tl.fromTo(flash, { opacity: 0 }, { opacity: 0.25, duration: 0.1, yoyo: true, repeat: 1 }, 0)
          .to(sweep, { top: "160%", duration: 0.55, ease: "none" }, 0)
          .set(sweep, { opacity: 0, rotation: 0 });
      } else {
        // swoosh (default, 1→2)
        gsap.set(sweep, { left: "-30%", top: 0, rotation: 0, opacity: 1 });
        tl.to(sweep, { left: "130%", duration: 0.55, ease: "power2.inOut" })
          .fromTo(flash, { opacity: 0 }, { opacity: 0.5, duration: 0.12, yoyo: true, repeat: 1 }, 0.18)
          .set(sweep, { opacity: 0 });
      }
    },
  };
})();
