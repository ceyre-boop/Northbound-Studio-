/* hero.js — Scene 1 intro: scan sweep, per-letter wordmark reveal, rule draw,
   N glow pulse, character slide-ins, and the art→placeholder fallback.
   Hidden states are set here in JS (never in CSS) so a CDN failure can't blank the page. */
(function () {
  window.NB = window.NB || {};

  NB.hero = {
    intro(opts) {
      const rm = opts && opts.reduceMotion;
      const hero = document.getElementById("hero");
      if (!hero) return;

      // Art fallback — covers live 404s AND cached 404s (complete + naturalWidth 0).
      hero.querySelectorAll(".hero__char").forEach((fig) => {
        const img = fig.querySelector(".hero__img");
        if (!img) { fig.classList.add("is-fallback"); return; }
        const fail = () => fig.classList.add("is-fallback");
        img.addEventListener("error", fail);
        img.addEventListener("load", () => fig.classList.remove("is-fallback"));
        if (img.complete && img.naturalWidth === 0) fail();
      });

      const nLtr = hero.querySelector(".ltr--n");
      if (rm || typeof gsap === "undefined") {
        if (nLtr) nLtr.classList.add("is-lit");
        if (typeof gsap !== "undefined") gsap.set([".hero__rule"], { scaleX: 1 });
        return;
      }

      const mainLtrs = hero.querySelectorAll(".hero__row--main .ltr");
      const subLtrs = hero.querySelectorAll(".hero__row--sub .ltr");
      const chars = [hero.querySelector(".hero__char--left"), hero.querySelector(".hero__char--right")].filter(Boolean);
      const scan = hero.querySelector(".hero__scan");
      const scroll = hero.querySelector(".hero__scroll");

      gsap.set([mainLtrs, subLtrs], { y: 26, autoAlpha: 0 });
      gsap.set(chars[0] || {}, { x: -100, autoAlpha: 0 });
      if (chars[1]) gsap.set(chars[1], { x: 100, autoAlpha: 0 });
      if (scroll) gsap.set(scroll, { autoAlpha: 0 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      if (scan) {
        tl.set(scan, { opacity: 1, top: 0 })
          .to(scan, { top: "100%", duration: 0.3, ease: "none" })
          .to(scan, { opacity: 0, duration: 0.15 }, ">-0.05");
      }
      tl.to(mainLtrs, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.03 }, 0.15)
        .to(".hero__rule", { scaleX: 1, duration: 0.55, ease: "expo.out" }, ">-0.25")
        .to(subLtrs, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.03 }, "<")
        .to(chars, { x: 0, autoAlpha: 1, duration: 0.8 }, "<")
        .add(() => { if (nLtr) nLtr.classList.add("is-glow"); }, ">-0.1")
        .add(() => { if (nLtr) { nLtr.classList.remove("is-glow"); nLtr.classList.add("is-lit"); } }, "+=0.65")
        .to(scroll, { autoAlpha: 1, duration: 0.6 }, "<");

      // Failsafe — never leave the wordmark hidden if the timeline dies mid-flight.
      setTimeout(() => {
        gsap.set([mainLtrs, subLtrs, chars, scroll], { clearProps: "opacity,visibility,transform" });
        gsap.set(".hero__rule", { scaleX: 1 });
      }, 4500);
    },
  };
})();
