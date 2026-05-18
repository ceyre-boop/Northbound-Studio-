/* ═══════════════════════════════════════════════════════════════
   Northbound Studio — masterpiece.js
   Phases 1–10: cursor · canvas · molecular logo · intro · reveals
════════════════════════════════════════════════════════════════ */

const isMobile = () => window.innerWidth < 768 || navigator.maxTouchPoints > 0;
const ease = (curr, target, factor) => curr + (target - curr) * factor;

// ─── Body load ───────────────────────────────────────────────────────────────
window.addEventListener('load', () => document.body.classList.add('loaded'));

// ─── Touch device detection ──────────────────────────────────────────────────
if (navigator.maxTouchPoints > 0) document.body.classList.add('touch-device');

// ─── Phase 1: Custom Cursor ──────────────────────────────────────────────────
(function initCursor() {
  if (isMobile()) return;

  const cursor  = document.getElementById('cursor');
  const dot     = cursor.querySelector('.cursor-dot');
  const ring    = cursor.querySelector('.cursor-ring');
  const aura    = cursor.querySelector('.cursor-aura');

  let mx = -200, my = -200;         // mouse
  let rx = -200, ry = -200;         // ring position
  let ax = -200, ay = -200;         // aura position
  let pvx = 0,   pvy = 0;           // previous position (for velocity)
  let lastX = 0, lastY = 0;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  });

  // Hover detection
  document.querySelectorAll('a, button, [role="button"], .project-image-wrap, .slider-btn')
    .forEach((el) => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

  const logoWrap = document.getElementById('logo-wrap');
  if (logoWrap) {
    logoWrap.addEventListener('mouseenter', () => document.body.classList.add('cursor-logo'));
    logoWrap.addEventListener('mouseleave', () => document.body.classList.remove('cursor-logo'));
  }

  (function loop() {
    // Velocity for ring stretch
    const vx = mx - lastX;
    const vy = my - lastY;
    lastX = mx; lastY = my;
    pvx = ease(pvx, vx, 0.25);
    pvy = ease(pvy, vy, 0.25);
    const speed = Math.sqrt(pvx * pvx + pvy * pvy);

    // Dot — instant
    dot.style.transform = `translate(calc(${mx}px - 50%), calc(${my}px - 50%))`;

    // Ring — lag
    rx = ease(rx, mx, 0.14);
    ry = ease(ry, my, 0.14);
    const stretchX = 1 + Math.abs(pvx) * 0.04;
    const stretchY = 1 + Math.abs(pvy) * 0.04;
    const angle = Math.atan2(pvy, pvx) * (180 / Math.PI);
    ring.style.transform = `translate(calc(${rx}px - 50%), calc(${ry}px - 50%)) rotate(${angle}deg) scale(${stretchX}, ${stretchY})`;

    // Aura — slowest
    ax = ease(ax, mx, 0.06);
    ay = ease(ay, my, 0.06);
    aura.style.transform = `translate(calc(${ax}px - 50%), calc(${ay}px - 50%))`;

    requestAnimationFrame(loop);
  })();
})();

// ─── Phase 2: Canvas Particle Background ─────────────────────────────────────
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H, particles, mouseX = -999, mouseY = -999;

  const COUNT = isMobile() ? 40 : 90;
  const CONNECT_DIST = 110;
  const REPEL_DIST   = 130;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    build();
  }

  function build() {
    particles = Array.from({ length: COUNT }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      bx: 0, by: 0,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));
    particles.forEach(p => { p.bx = p.x; p.by = p.y; });
  }

  function update() {
    particles.forEach(p => {
      const dx = mouseX - p.x;
      const dy = mouseY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < REPEL_DIST && dist > 0) {
        const force = (REPEL_DIST - dist) / REPEL_DIST;
        p.vx -= (dx / dist) * force * 1.8;
        p.vy -= (dy / dist) * force * 1.8;
      }

      // Spring back
      p.vx += (p.bx - p.x) * 0.012;
      p.vy += (p.by - p.y) * 0.012;
      // Damping
      p.vx *= 0.88;
      p.vy *= 0.88;
      // Slow wander
      p.bx += Math.sin(Date.now() * 0.0003 + p.x) * 0.12;
      p.by += Math.cos(Date.now() * 0.0003 + p.y) * 0.12;
      p.bx = Math.max(0, Math.min(W, p.bx));
      p.by = Math.max(0, Math.min(H, p.by));

      p.x += p.vx;
      p.y += p.vy;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < CONNECT_DIST) {
          const alpha = (1 - d / CONNECT_DIST) * 0.18;
          ctx.strokeStyle = `rgba(87, 168, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Dots
    particles.forEach(p => {
      ctx.fillStyle = 'rgba(134, 240, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  document.addEventListener('mouseleave', () => { mouseX = -999; mouseY = -999; });

  resize();
  loop();
})();

// ─── Phase 3: Molecular Logo ─────────────────────────────────────────────────
(function initMolecularLogo() {
  if (isMobile()) return;

  const logoWrap   = document.getElementById('logo-wrap');
  const logoText   = document.getElementById('logo-text');
  const logoCanvas = document.getElementById('logo-canvas');
  if (!logoWrap || !logoText || !logoCanvas) return;

  const ctx = logoCanvas.getContext('2d');
  let particles = [];
  let mx = -999, my = -999;
  let isHover = false;
  let built = false;

  function build() {
    const rect = logoText.getBoundingClientRect();
    const W = Math.ceil(rect.width) + 4;
    const H = Math.ceil(rect.height) + 4;

    logoCanvas.width  = W;
    logoCanvas.height = H;
    logoCanvas.style.width  = W + 'px';
    logoCanvas.style.height = H + 'px';

    // Render text to offscreen canvas
    const off    = document.createElement('canvas');
    off.width    = W;
    off.height   = H;
    const offCtx = off.getContext('2d');

    const cs = getComputedStyle(logoText);
    offCtx.fillStyle = '#f7faff';
    offCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    offCtx.textBaseline = 'top';
    offCtx.fillText('Northbound Studio', 2, 2);

    const data = offCtx.getImageData(0, 0, W, H).data;
    particles = [];
    const STEP = 4;
    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const idx = (y * W + x) * 4;
        if (data[idx + 3] > 100) {
          particles.push({
            x: x, y: y,
            bx: x, by: y,
            vx: 0, vy: 0,
            a: data[idx + 3] / 255,
          });
        }
      }
    }

    built = true;
    logoText.classList.add('hidden');
    logoCanvas.classList.add('active');
  }

  function update() {
    if (!built) return;

    const rect = logoCanvas.getBoundingClientRect();
    const lx   = isHover ? mx - rect.left : -999;
    const ly   = isHover ? my - rect.top  : -999;
    const R    = 50;

    particles.forEach(p => {
      const dx   = lx - p.x;
      const dy   = ly - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < R && dist > 0) {
        const f = (R - dist) / R;
        p.vx -= (dx / dist) * f * 5;
        p.vy -= (dy / dist) * f * 5;
      }

      p.vx += (p.bx - p.x) * 0.06;
      p.vy += (p.by - p.y) * 0.06;
      p.vx *= 0.85;
      p.vy *= 0.85;
      p.x  += p.vx;
      p.y  += p.vy;
    });
  }

  function draw() {
    if (!built) return;
    ctx.clearRect(0, 0, logoCanvas.width, logoCanvas.height);
    particles.forEach(p => {
      ctx.fillStyle = `rgba(247, 250, 255, ${p.a})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    });
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  logoWrap.addEventListener('mouseenter', () => { isHover = true; });
  logoWrap.addEventListener('mouseleave', () => { isHover = false; });
  document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });

  // Wait for fonts before sampling text pixels
  document.fonts.ready.then(() => {
    // Small delay so layout is fully stable
    setTimeout(build, 300);
    loop();
  });
})();

// ─── Phase 4: Intro Sequence ─────────────────────────────────────────────────
(function initIntro() {
  const overlay = document.getElementById('intro-overlay');
  if (!overlay) return;

  if (sessionStorage.getItem('nbIntroSeen')) {
    overlay.style.display = 'none';
    return;
  }

  sessionStorage.setItem('nbIntroSeen', '1');

  // Wait for GSAP
  function runIntro() {
    if (typeof gsap === 'undefined') {
      setTimeout(runIntro, 50);
      return;
    }

    const logos     = overlay.querySelector('.intro-logos');
    const words     = overlay.querySelectorAll('.intro-logo-word');
    const wordmark  = overlay.querySelector('.intro-wordmark');
    const name      = overlay.querySelector('.intro-name');
    const studio    = overlay.querySelector('.intro-studio');
    const curtain   = overlay.querySelector('.intro-curtain');

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Client wordmarks slide up
    tl.to(logos, { opacity: 1, duration: 0.01 })
      .to(words, {
        y: 0,
        duration: 0.55,
        stagger: 0.18,
        ease: 'power3.out',
      })
      // Fade out logos
      .to(logos, { opacity: 0, y: -12, duration: 0.35, ease: 'power2.in' }, '+=0.3')
      // Wordmark appears
      .to(wordmark, { opacity: 1, duration: 0.01 })
      .fromTo(name,   { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65 }, '-=0.1')
      .fromTo(studio, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, '-=0.4')
      // Brief breathe
      .to({}, { duration: 0.55 })
      // Curtain lifts
      .fromTo(curtain, { y: '100%' }, { y: '-100%', duration: 0.9, ease: 'power3.inOut' })
      .call(() => { overlay.style.display = 'none'; });
  }

  runIntro();
})();

// ─── Phase 9: Scroll Reveal (IntersectionObserver) ───────────────────────────
const revealObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObs.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.reveal').forEach((el) => revealObs.observe(el));

// ─── Review Slider ───────────────────────────────────────────────────────────
(function initSlider() {
  const slider = document.querySelector('[data-slider]');
  if (!slider) return;

  const reviews = slider.querySelectorAll('.review');
  const prev    = slider.querySelector('[data-prev]');
  const next    = slider.querySelector('[data-next]');
  let idx = 0, autoId = null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const show = (t) => {
    reviews[idx].classList.remove('active');
    idx = (t + reviews.length) % reviews.length;
    reviews[idx].classList.add('active');
  };

  const startAuto = () => {
    if (autoId || document.hidden || reducedMotion.matches) return;
    autoId = setInterval(() => show(idx + 1), 6000);
  };

  const stopAuto = () => { clearInterval(autoId); autoId = null; };

  prev?.addEventListener('click', () => { stopAuto(); show(idx - 1); });
  next?.addEventListener('click', () => { stopAuto(); show(idx + 1); });
  document.addEventListener('visibilitychange', () => document.hidden ? stopAuto() : startAuto());

  startAuto();
})();

// ─── Package card → pre-fill budget select ───────────────────────────────────
document.querySelectorAll('[data-package]').forEach((link) => {
  link.addEventListener('click', () => {
    const sel = document.getElementById('budget-select');
    if (!sel) return;
    const prefix = link.dataset.package.split(' ')[0];
    for (const opt of sel.options) {
      if (opt.text.startsWith(prefix)) { opt.selected = true; break; }
    }
  });
});

// ─── Application Form (Formspree AJAX) ───────────────────────────────────────
(function initForm() {
  const form    = document.getElementById('intake-form');
  const message = document.querySelector('.form-message');
  if (!form) return;

  const validateField = (field) => {
    const err = field.closest('label')?.querySelector('.field-error');
    if (field.required && !field.value.trim()) {
      field.classList.add('invalid');
      if (err) err.textContent = 'This field is required.';
      return false;
    }
    field.classList.remove('invalid');
    if (err) err.textContent = '';
    return true;
  };

  form.querySelectorAll('input, select, textarea').forEach((f) => {
    f.addEventListener('blur',  () => validateField(f));
    f.addEventListener('input', () => { if (f.classList.contains('invalid')) validateField(f); });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = form.querySelectorAll('input:not([name="_gotcha"]), select, textarea');
    let valid = true;
    fields.forEach((f) => { if (!validateField(f)) valid = false; });
    if (!valid) return;

    const btn     = document.getElementById('form-submit');
    const label   = btn.querySelector('.btn-label');
    const spinner = btn.querySelector('.btn-spinner');

    btn.disabled = true;
    label.textContent = 'Sending…';
    spinner.hidden = false;

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        message.textContent = "Application received — we'll be in touch within 24 hours.";
        message.className = 'form-message success';
        form.reset();
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'failed');
      }
    } catch {
      message.textContent = 'Something went wrong. Please try again or email us directly.';
      message.className = 'form-message error';
    } finally {
      btn.disabled = false;
      label.textContent = 'Submit Application';
      spinner.hidden = true;
    }
  });
})();
