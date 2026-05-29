/* ============================================================
   Northbound Studio — script.js
   Vanilla JS, no libraries. Mobile-first, reduced-motion aware.
   ============================================================ */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ── 1. Hero constellation canvas ─────────────────────────── */
  function initHeroCanvas() {
    const canvas = document.querySelector(".hero__canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const hero = canvas.closest(".hero");
    const accent = "0, 240, 255";
    const mouse = { x: -9999, y: -9999, active: false };

    let dpr, w, h, particles, linkDist, raf;

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth;
      h = hero.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function build() {
      const mobile = w < 768;
      const count = mobile ? 28 : Math.min(80, Math.round((w * h) / 18000));
      linkDist = mobile ? 90 : 120;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6,
      }));
    }

    function step() {
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        // Eased, capped attraction toward the cursor (desktop only).
        if (mouse.active && !isTouch) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 150 * 150 && d2 > 1) {
            const d = Math.sqrt(d2);
            const pull = clamp((150 - d) / 150, 0, 1) * 0.04;
            p.vx += (dx / d) * pull;
            p.vy += (dy / d) * pull;
          }
        }
        // Friction keeps drift slow and springs back to a calm state.
        p.vx = clamp(p.vx * 0.985, -0.8, 0.8);
        p.vy = clamp(p.vy * 0.985, -0.8, 0.8);
      }

      // Connecting lines between near neighbours.
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < linkDist) {
            ctx.strokeStyle = `rgba(${accent}, ${0.18 * (1 - d / linkDist)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Points.
      for (const p of particles) {
        ctx.fillStyle = `rgba(${accent}, 0.7)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(step);
    }

    function start() {
      size();
      build();
      cancelAnimationFrame(raf);
      if (reduceMotion) {
        // One static frame, no loop.
        for (const p of particles) {
          p.vx = 0;
          p.vy = 0;
        }
        step();
        cancelAnimationFrame(raf);
      } else {
        step();
      }
    }

    if (!isTouch) {
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        mouse.x = e.clientX - r.left;
        mouse.y = e.clientY - r.top;
        mouse.active = true;
      });
      hero.addEventListener("pointerleave", () => (mouse.active = false));
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(start, 200);
    });

    start();
  }

  /* ── 2. Hero stagger reveal on load ───────────────────────── */
  function initHeroReveal() {
    const reveal = () => document.body.classList.add("is-loaded");
    if (document.fonts && document.fonts.ready) {
      Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1200)),
      ]).then(reveal);
    } else {
      reveal();
    }
  }

  /* ── 3. Sticky nav state ──────────────────────────────────── */
  function initNav() {
    const nav = document.getElementById("nav");
    if (!nav) return;
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
  }

  /* ── 4. Scroll reveals ────────────────────────────────────── */
  function initReveals() {
    const els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => obs.observe(el));
  }

  /* ── 5. Why-Us parallax ───────────────────────────────────── */
  function initParallax() {
    if (reduceMotion || isTouch) return;
    const split = document.querySelector(".why__split");
    const dev = document.querySelector(".why__card--dev");
    const design = document.querySelector(".why__card--design");
    if (!split || !dev || !design) return;
    let ticking = false;
    const update = () => {
      const r = split.getBoundingClientRect();
      const progress = clamp(
        (window.innerHeight - r.top) / (window.innerHeight + r.height),
        0,
        1
      );
      const shift = (progress - 0.5) * 40;
      dev.style.transform = `translateY(${shift}px)`;
      design.style.transform = `translateY(${-shift}px)`;
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
  }

  /* ── 6. Package 3D tilt ───────────────────────────────────── */
  function initTilt() {
    if (reduceMotion || isTouch) return;
    document.querySelectorAll(".pkg").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          `perspective(900px) rotateY(${px * 8}deg) rotateX(${-py * 8}deg) translateZ(6px)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* ── 7. Portfolio case-study modal ────────────────────────── */
  const CASES = {
    keystone: {
      title: "Keystone South Construction",
      tag: "Web Design · Local Business",
      blurb:
        "Keystone needed a web presence that matched the quality of their build work — " +
        "clear, professional, and quick to turn a visitor into an estimate request.",
      stats: [
        ["1 week", "Concept to launch"],
        ["100%", "Mobile-ready"],
      ],
      list: [
        "Service-first messaging with strong local trust signals",
        "Responsive layout that reads cleanly on every device",
        "Fast load and basic SEO so they're findable locally",
        "Clear path to request an estimate from any section",
      ],
      url: "https://keystonesouthconstruction.com/",
    },
    taboost: {
      title: "TABOOST Shop",
      tag: "E-Commerce · Product Experience",
      blurb:
        "A product-first storefront that puts the brand and the buying flow front and " +
        "center — built to feel fast and convert browsers into buyers.",
      stats: [
        ["Product-first", "Layout system"],
        ["Brand-forward", "Visual identity"],
      ],
      list: [
        "Clean, distraction-free buying flow",
        "Brand-forward hero and product presentation",
        "Snappy interactions tuned for conversion",
        "Responsive from phone to desktop",
      ],
      url: "https://shop.taboost.me/",
    },
  };

  function initModal() {
    const modal = document.getElementById("caseModal");
    const content = document.getElementById("caseContent");
    if (!modal || !content) return;
    let lastFocus = null;

    function open(key, trigger) {
      const c = CASES[key];
      if (!c) return;
      lastFocus = trigger || null;
      content.innerHTML = `
        <span class="case__tag">${c.tag}</span>
        <h3 id="caseTitle">${c.title}</h3>
        <p>${c.blurb}</p>
        <div class="case__stats">
          ${c.stats
            .map(
              ([num, lbl]) =>
                `<div class="case__stat"><div class="case__num">${num}</div><div class="case__lbl">${lbl}</div></div>`
            )
            .join("")}
        </div>
        <ul class="case__list">
          ${c.list.map((li) => `<li>${li}</li>`).join("")}
        </ul>
        <p style="margin-top:1.6rem">
          <a class="project__open" href="${c.url}" target="_blank" rel="noopener noreferrer">
            Visit the live site <span aria-hidden="true">↗</span>
          </a>
        </p>`;
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add("is-open"));
      if (trigger) trigger.setAttribute("aria-expanded", "true");
      modal.querySelector(".modal__close").focus();
      document.addEventListener("keydown", onKey);
    }

    function close() {
      modal.classList.remove("is-open");
      document.removeEventListener("keydown", onKey);
      document
        .querySelectorAll('.project__open[aria-expanded="true"]')
        .forEach((b) => b.setAttribute("aria-expanded", "false"));
      const done = () => {
        modal.hidden = true;
        modal.removeEventListener("transitionend", done);
        if (lastFocus) lastFocus.focus();
      };
      if (reduceMotion) done();
      else modal.addEventListener("transitionend", done);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab") {
        // Trap-lite: keep focus inside the panel.
        const focusables = modal.querySelectorAll(
          'button, a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.querySelectorAll(".project__open[data-project]").forEach((btn) => {
      btn.addEventListener("click", () => open(btn.dataset.project, btn));
    });
    modal.querySelectorAll("[data-close]").forEach((el) =>
      el.addEventListener("click", close)
    );
  }

  /* ── 8. Apply form ────────────────────────────────────────── */
  function initForm() {
    const form = document.getElementById("applyForm");
    if (!form) return;
    const status = form.querySelector(".form__status");
    const budget = form.querySelector("#budgetSelect");

    // Package CTA → pre-fill budget + scroll to form.
    document.querySelectorAll(".pkg__cta[data-budget]").forEach((cta) => {
      cta.addEventListener("click", () => {
        if (budget) {
          const want = cta.dataset.budget;
          [...budget.options].forEach((o) => {
            if (o.value === want || o.text === want) budget.value = o.value;
          });
        }
      });
    });

    function setStatus(msg, type) {
      status.textContent = msg;
      status.classList.remove("is-error", "is-success");
      if (type) status.classList.add(type);
    }

    function validate() {
      let ok = true;
      form.querySelectorAll("[required]").forEach((field) => {
        const valid = field.value.trim() !== "";
        field.classList.toggle("is-invalid", !valid);
        if (!valid && ok) {
          ok = false;
          field.focus();
        }
      });
      return ok;
    }

    form.querySelectorAll(".field__input").forEach((field) => {
      field.addEventListener("input", () => field.classList.remove("is-invalid"));
      field.addEventListener("change", () => field.classList.remove("is-invalid"));
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Honeypot — silently succeed for bots.
      if (form.querySelector('[name="_gotcha"]').value) {
        setStatus("Thanks — we'll be in touch.", "is-success");
        return;
      }
      if (!validate()) {
        setStatus("Please fill in the highlighted fields.", "is-error");
        return;
      }

      form.classList.add("is-sending");
      setStatus("Sending…", "");

      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });
        form.classList.remove("is-sending");
        if (res.ok) {
          form.classList.add("is-sent");
          setStatus("Application sent — we'll reply within 24 hours.", "is-success");
          form.reset();
          setTimeout(() => form.classList.remove("is-sent"), 4000);
        } else {
          const data = await res.json().catch(() => ({}));
          const msg =
            data.errors && data.errors.length
              ? data.errors.map((x) => x.message).join(", ")
              : "Something went wrong. Please try again or email us directly.";
          setStatus(msg, "is-error");
        }
      } catch {
        form.classList.remove("is-sending");
        setStatus("Network error — check your connection and try again.", "is-error");
      }
    });
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    initHeroCanvas();
    initHeroReveal();
    initNav();
    initReveals();
    initParallax();
    initTilt();
    initModal();
    initForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
