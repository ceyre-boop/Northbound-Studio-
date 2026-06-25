/* animations.js — GSAP ScrollTrigger choreography for every scene.
   Reveals, the pinned capability showcase, the horizontal portfolio,
   package count-up + tilt, nav state, and the scene-boundary transitions. */
(function () {
  window.NB = window.NB || {};

  const CODE = [
    ['c', '// northbound.systems — build pipeline'],
    ['k', 'export', ' function ', 'k', 'mount', '(app) {'],
    ['', '  const ui = ', 'k', 'createScene', '({'],
    ['', '    theme: ', 's', '"northbound"', ', fps: 60,'],
    ['', '    a11y: ', 'k', 'true', ', perf: ', 's', '"max"'],
    ['', '  });'],
    ['', '  ui.', 'k', 'render', '(', 's', '"#root"', ');'],
    ['', '  ', 'k', 'return', ' ui.ready;'],
    ['', '}'],
  ];
  function codeHTML() {
    return CODE.map((line) => {
      let out = "";
      for (let j = 0; j < line.length; j += 2) {
        const c = line[j], t = line[j + 1];
        out += c ? `<span class="${c}">${t}</span>` : t;
      }
      return out;
    }).join("\n");
  }

  function countUp(el) {
    const raw = (el.getAttribute("data-price") || "").trim();
    const cur = el.querySelector(".pkg__cur");
    const targets = (raw.match(/\d+/g) || []).map(Number);
    if (!targets.length) return;
    const tpl = el.textContent.replace(cur ? cur.textContent : "", "");
    const start = performance.now(), dur = 950;
    function frame(now) {
      const t = Math.min((now - start) / dur, 1), e = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      let idx = 0;
      const out = tpl.replace(/\d+/g, () => String(Math.round(targets[idx++] * e)));
      el.textContent = ""; if (cur) el.appendChild(cur); el.appendChild(document.createTextNode(out));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  NB.animations = {
    revealHero() {
      if (NB.reduceMotion) return;
      gsap.to("[data-hero]", { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.12 });
    },

    init(opts) {
      const mobile = opts.mobile, rm = opts.reduceMotion;
      const nav = document.getElementById("nav");

      // Nav stuck state.
      ScrollTrigger.create({ start: 40, end: 99999, onUpdate: (self) => nav.classList.toggle("is-stuck", self.scroll() > 40) });

      // Generic reveals.
      if (!rm) {
        gsap.utils.toArray("[data-reveal]").forEach((el) => {
          gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
        });
      } else {
        gsap.utils.toArray("[data-reveal], [data-hero]").forEach((el) => gsap.set(el, { opacity: 1, y: 0 }));
      }

      // Prefill the code-editor demo.
      const codeEl = document.querySelector(".demo__code");
      if (codeEl) codeEl.innerHTML = codeHTML();

      // ── Capability showcase (pinned scrub) ──
      const capPin = document.querySelector(".cap__pin");
      const demos = gsap.utils.toArray(".demo");
      const tagEl = document.querySelector("[data-cap-tag]");
      const headEl = document.querySelector("[data-cap-head]");
      const textEl = document.querySelector("[data-cap-text]");
      const countEl = document.querySelector(".cap__count em");
      const COPY = [
        { tag: "DESIGN · UX · CONVERSION", head: "Design that converts.", text: "Every pixel placed with intent. Every interaction designed to convert." },
        { tag: "ENGINEERING · PERFORMANCE · SPEED", head: "Code that performs.", text: "Clean, fast code. Modern design systems. Performance and accessibility built in." },
        { tag: "BRANDING · IDENTITY · ART DIRECTION", head: "Brands that stand out.", text: "Professional-grade logos and visual identity from a trained SCAD designer." },
        { tag: "ONGOING SUPPORT · REAL PEOPLE · PARTNERSHIP", head: "Support that lasts.", text: "We don't disappear after launch. Something breaks? Text us. We fix it." },
      ];
      let cur = -1;
      function setDemo(i) {
        if (i === cur || !demos.length) return;
        cur = i;
        demos.forEach((d, di) => d.classList.toggle("is-live", di === i));
        if (tagEl) tagEl.textContent = COPY[i].tag;
        if (headEl) headEl.textContent = COPY[i].head;
        if (textEl) textEl.textContent = COPY[i].text;
        if (countEl) countEl.textContent = "0" + (i + 1);
        if (!rm) gsap.fromTo([headEl, textEl], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.05 });
        if (i === 1) { // code → animate Lighthouse meter
          const fg = document.querySelector(".meter__fg"), num = document.querySelector(".meter__num");
          if (fg) gsap.fromTo(fg, { strokeDashoffset: 327 }, { strokeDashoffset: 327 * (1 - 0.98), duration: 1, ease: "power2.out" });
          if (num) { const o = { v: 0 }; gsap.to(o, { v: 98, duration: 1, ease: "power2.out", onUpdate: () => (num.textContent = Math.round(o.v)) }); }
        }
      }
      if (capPin && demos.length) {
        if (mobile || rm) {
          setDemo(0);
          // On mobile each demo is shown as a stacked reveal; keep first live + reveal copy.
        } else {
          ScrollTrigger.create({
            trigger: capPin, start: "top top", end: "+=300%", pin: true, scrub: true,
            onUpdate: (self) => setDemo(Math.min(3, Math.floor(self.progress * 4))),
          });
          setDemo(0);
        }
      }

      // ── Portfolio (horizontal pinned scrub) ──
      const workPin = document.querySelector(".work__pin");
      const track = document.querySelector(".work__track");
      const slides = gsap.utils.toArray(".work__slide");
      const dots = gsap.utils.toArray(".work__dots i");
      const wCount = document.querySelector(".work__counter em");
      if (workPin && track && slides.length > 1 && !mobile && !rm) {
        const n = slides.length;
        ScrollTrigger.create({
          trigger: workPin, start: "top top", end: () => "+=" + (n - 1) * window.innerWidth, pin: true, scrub: 0.6,
          onUpdate: (self) => {
            gsap.set(track, { x: -self.progress * (n - 1) * window.innerWidth });
            const i = Math.round(self.progress * (n - 1));
            dots.forEach((d, di) => d.classList.toggle("is-active", di === i));
            if (wCount) wCount.textContent = "0" + (i + 1);
          },
        });
      }

      // ── Packages: count-up + 3D tilt ──
      gsap.utils.toArray(".pkg__price").forEach((el) => {
        ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => (rm ? null : countUp(el)) });
      });
      if (!mobile && !rm) {
        gsap.utils.toArray("[data-tilt]").forEach((card) => {
          card.addEventListener("pointermove", (e) => {
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
            card.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateZ(8px)`;
          });
          card.addEventListener("pointerleave", () => { card.style.transform = ""; });
        });
      }

      // ── Scene-boundary transitions ──
      if (!rm) {
        const at = (sel, type) => ScrollTrigger.create({ trigger: sel, start: "top 78%", onEnter: () => NB.transitions.play(type) });
        at("#capability", "swoosh");
        at("#portfolio", "disintegrate");
        at("#packages", "wipe");
        at("#apply", "scan");
      }

      ScrollTrigger.refresh();
    },
  };
})();
