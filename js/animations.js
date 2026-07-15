/* animations.js — GSAP ScrollTrigger choreography: nav state, generic reveals,
   the four pinned Journey steps (mask reveal, split craft, iMessage bounce,
   stat counters), and the voyage-lite fallback trigger. */
(function () {
  window.NB = window.NB || {};

  // Generalized count-up: reads the final display string from data-count and
  // tweens every digit group from 0 (e.g. "< 2 WEEKS", "$250+", "100%").
  function countUp(el, dur) {
    const target = (el.getAttribute("data-count") || el.textContent).trim();
    if (!/\d/.test(target)) return;
    const start = performance.now(), d = dur || 950;
    function frame(now) {
      const t = Math.min((now - start) / d, 1);
      const e = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = target.replace(/\d+/g, (m) => String(Math.round(Number(m) * e)));
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = target;
    }
    requestAnimationFrame(frame);
  }
  NB.countUp = countUp;

  NB.animations = {
    init(opts) {
      const mobile = opts.mobile, rm = opts.reduceMotion;
      const nav = document.getElementById("nav");
      const hasST = typeof ScrollTrigger !== "undefined";
      if (!hasST || typeof gsap === "undefined") return;

      // Nav stuck state.
      ScrollTrigger.create({ start: 40, end: 99999, onUpdate: (self) => nav.classList.toggle("is-stuck", self.scroll() > 40) });

      // Generic reveals.
      if (!rm) {
        gsap.utils.toArray("[data-reveal]").forEach((el) => {
          gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
        });
      } else {
        gsap.utils.toArray("[data-reveal]").forEach((el) => gsap.set(el, { opacity: 1, y: 0 }));
      }

      // Voyage lite (mobile / reduced-motion / WebGL-failure) — draw the N on entry.
      const lite = document.querySelector(".voyage__lite");
      if (lite) ScrollTrigger.create({ trigger: lite, start: "top 75%", once: true, onEnter: () => lite.classList.add("is-in") });

      // ── Journey: 4 individually pinned steps, time-based content timelines ──
      const steps = gsap.utils.toArray(".journey__step");
      if (!steps.length) return;

      if (rm) {
        // Everything visible and final, counters at final text (already in markup).
        gsap.set("[data-j-mask]", { clipPath: "inset(0% 0 0 0)" });
        gsap.set("[data-j-fade], [data-j-left], [data-j-right], [data-j-bubble]", { opacity: 1, y: 0, x: 0, scale: 1 });
        return;
      }

      // Pins (desktop only) — hold each step for an extra half-viewport.
      if (!mobile) {
        steps.forEach((step) => {
          ScrollTrigger.create({ trigger: step, start: "top top", end: "+=50%", pin: true, anticipatePin: 1 });
        });
      }

      // Content timelines — play on scroll-in, reverse when leaving upward.
      steps.forEach((step) => {
        const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });

        const mask = step.querySelector("[data-j-mask]");
        const fades = step.querySelectorAll("[data-j-fade]");
        const left = step.querySelector("[data-j-left]");
        const right = step.querySelector("[data-j-right]");
        const line = step.querySelector("[data-j-line]");
        const bubbles = step.querySelectorAll("[data-j-bubble]");

        if (mask) {
          gsap.set(mask, { clipPath: "inset(100% 0 0 0)" });
          tl.to(mask, { clipPath: "inset(0% 0 0 0)", duration: 0.9, ease: "power4.out" });
        }
        if (left && right) {
          const lTags = left.querySelectorAll(".tag, .craft__eyebrow");
          const rTags = right.querySelectorAll(".tag, .craft__eyebrow");
          gsap.set(left, { x: -44, autoAlpha: 0 });
          gsap.set(right, { x: 44, autoAlpha: 0 });
          gsap.set([lTags, rTags], { y: 12, autoAlpha: 0 });
          tl.to(left, { x: 0, autoAlpha: 1, duration: 0.6 }, 0)
            .to(right, { x: 0, autoAlpha: 1, duration: 0.6 }, 0.08)
            .to(lTags, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.06 }, 0.25)
            .to(rTags, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.06 }, 0.33);
          if (line) {
            const axis = mobile ? "scaleX" : "scaleY";
            gsap.set(line, { [axis]: 0 });
            tl.to(line, { [axis]: 1, duration: 0.7, ease: "expo.out" }, 0.2);
          }
        }
        if (bubbles.length) {
          gsap.set(bubbles, { y: 16, scale: 0.92, autoAlpha: 0 });
          tl.to(bubbles, { y: 0, scale: 1, autoAlpha: 1, duration: 0.4, ease: "back.out(1.8)", stagger: 0.6 }, 0);
        }
        if (fades.length) {
          gsap.set(fades, { y: 24, autoAlpha: 0 });
          tl.to(fades, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.12 }, bubbles.length ? 0.6 * bubbles.length : (mask || left ? 0.5 : 0));
        }

        ScrollTrigger.create({
          trigger: step,
          start: "top 70%",
          onEnter: () => tl.play(),
          onLeaveBack: () => tl.reverse(),
        });
      });

      // Stat counters — fire once when the numbers step arrives.
      gsap.utils.toArray("#j-numbers .num__val").forEach((el) => {
        ScrollTrigger.create({ trigger: "#j-numbers", start: "top 60%", once: true, onEnter: () => countUp(el) });
      });

      ScrollTrigger.refresh();
    },
  };
})();
