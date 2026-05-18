/* ═══════════════════════════════════════════════════════════════
   Northbound Studio — Active Theory tier
   Spine · Jellyfish · Machine Ring · Cursor Trail · Molecular Logo
════════════════════════════════════════════════════════════════ */

const isMobile = () => window.innerWidth < 768 || navigator.maxTouchPoints > 0;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU  = Math.PI * 2;

window.addEventListener('load', () => document.body.classList.add('loaded'));
if (navigator.maxTouchPoints > 0) document.body.classList.add('touch-device');

// ─── Shared mouse state ───────────────────────────────────────────────────────
const mouse = { x: -999, y: -999, px: -999, py: -999, vx: 0, vy: 0 };
document.addEventListener('mousemove', (e) => {
  mouse.vx  = e.clientX - mouse.px;
  mouse.vy  = e.clientY - mouse.py;
  mouse.px  = mouse.x;
  mouse.py  = mouse.y;
  mouse.x   = e.clientX;
  mouse.y   = e.clientY;
});

// ─── Phase 1: Custom Cursor ───────────────────────────────────────────────────
(function initCursor() {
  if (isMobile()) return;

  const cursorEl = document.getElementById('cursor');
  const dot      = cursorEl.querySelector('.cursor-dot');
  const ring     = cursorEl.querySelector('.cursor-ring');
  const aura     = cursorEl.querySelector('.cursor-aura');

  let rx = -200, ry = -200, ax = -200, ay = -200;
  let svx = 0, svy = 0;

  document.querySelectorAll('a, button, [role="button"], .project-image-wrap, .slider-btn, .card-cta')
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
    // Smooth velocity for ring stretch
    svx = lerp(svx, mouse.vx, 0.2);
    svy = lerp(svy, mouse.vy, 0.2);
    const speed  = Math.sqrt(svx * svx + svy * svy);
    const angle  = Math.atan2(svy, svx) * (180 / Math.PI);
    const scaleX = 1 + Math.min(speed * 0.025, 0.4);
    const scaleY = 1 - Math.min(speed * 0.01,  0.15);

    dot.style.transform = `translate(calc(${mouse.x}px - 50%), calc(${mouse.y}px - 50%))`;

    rx = lerp(rx, mouse.x, 0.13);
    ry = lerp(ry, mouse.y, 0.13);
    ring.style.transform = `translate(calc(${rx}px - 50%), calc(${ry}px - 50%)) rotate(${angle}deg) scaleX(${scaleX}) scaleY(${scaleY})`;

    ax = lerp(ax, mouse.x, 0.055);
    ay = lerp(ay, mouse.y, 0.055);
    aura.style.transform = `translate(calc(${ax}px - 50%), calc(${ay}px - 50%))`;

    requestAnimationFrame(loop);
  })();
})();

// ─── Phase 1b: Cursor Trail ───────────────────────────────────────────────────
(function initCursorTrail() {
  if (isMobile()) return;
  const trail = document.getElementById('cursor-trail');
  if (!trail) return;

  let last = 0;
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - last < 40) return; // throttle
    last = now;
    const dot = document.createElement('div');
    dot.className = 'trail-dot';
    dot.style.left = e.clientX + 'px';
    dot.style.top  = e.clientY + 'px';
    trail.appendChild(dot);
    setTimeout(() => dot.remove(), 560);
  });
})();

// ─── Phase 2: Background — Particles + Twisted Spine ─────────────────────────
(function initBgCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  const COUNT = isMobile() ? 35 : 75;
  const CONNECT = 100;
  const REPEL   = 120;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    buildParticles();
  }

  function buildParticles() {
    particles = Array.from({ length: COUNT }, () => {
      const x = Math.random() * W;
      const y = Math.random() * H;
      return { x, y, bx: x, by: y, vx: (Math.random()-.5)*.3, vy: (Math.random()-.5)*.3 };
    });
  }

  function updateParticles(t) {
    particles.forEach((p, i) => {
      const dx   = mouse.x - p.x;
      const dy   = mouse.y - p.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < REPEL && dist > 0) {
        const f = (REPEL - dist) / REPEL;
        p.vx -= (dx / dist) * f * 1.5;
        p.vy -= (dy / dist) * f * 1.5;
      }

      // Slow drift of base
      p.bx += Math.sin(t * 0.00025 + i * 0.4) * 0.08;
      p.by += Math.cos(t * 0.00025 + i * 0.6) * 0.08;
      p.bx = Math.max(0, Math.min(W, p.bx));
      p.by = Math.max(0, Math.min(H, p.by));

      p.vx += (p.bx - p.x) * 0.01;
      p.vy += (p.by - p.y) * 0.01;
      p.vx *= 0.88;
      p.vy *= 0.88;
      p.x  += p.vx;
      p.y  += p.vy;
    });
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i+1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx*dx + dy*dy);
        if (d < CONNECT) {
          const a = (1 - d/CONNECT) * 0.15;
          ctx.strokeStyle = `rgba(0,180,255,${a})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(0,220,255,0.4)';
      ctx.beginPath();
      ctx.arc(particles[i].x, particles[i].y, 1.5, 0, TAU);
      ctx.fill();
    }
  }

  // Twisted cable spine
  function drawSpine(t) {
    const cx = W * 0.62; // sits in right half of viewport
    const STRANDS = 3;

    for (let s = 0; s < STRANDS; s++) {
      const phase  = (s / STRANDS) * TAU;
      const bright = s === 1 ? 0.6 : 0.25;

      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0,   `rgba(0,200,255,0)`);
      grad.addColorStop(0.15,`rgba(0,200,255,${bright})`);
      grad.addColorStop(0.85,`rgba(0,255,200,${bright})`);
      grad.addColorStop(1,   `rgba(0,200,255,0)`);

      ctx.beginPath();
      for (let y = 0; y <= H; y += 3) {
        const twist = y * 0.014 + t * 0.0004 + phase;
        const x     = cx + Math.sin(twist) * 22;
        y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth   = s === 1 ? 1.5 : 0.8;
      ctx.stroke();
    }

    // Core glow thread
    const coreGrad = ctx.createLinearGradient(0, 0, 0, H);
    coreGrad.addColorStop(0,   'rgba(0,255,200,0)');
    coreGrad.addColorStop(0.2, 'rgba(0,255,200,0.9)');
    coreGrad.addColorStop(0.8, 'rgba(0,200,255,0.9)');
    coreGrad.addColorStop(1,   'rgba(0,255,200,0)');

    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.strokeStyle = coreGrad;
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Data node pulses along spine
    for (let i = 0; i < 5; i++) {
      const yy  = ((t * 0.06 + i * (H / 5)) % H + H) % H;
      const xx  = cx + Math.sin(yy * 0.014 + t * 0.0004) * 22;
      const pulse = (Math.sin(t * 0.003 + i) + 1) * 0.5;
      ctx.fillStyle = `rgba(0,255,200,${0.3 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(xx, yy, 2 + pulse * 2, 0, TAU);
      ctx.fill();
    }
  }

  function loop(t) {
    ctx.clearRect(0, 0, W, H);
    updateParticles(t);
    drawSpine(t);
    drawParticles();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
})();

// ─── Phase 3a: Jellyfish (right side, bioluminescent) ────────────────────────
(function initJellyfish() {
  if (isMobile()) return;
  const canvas = document.getElementById('jellyfish-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const W = canvas.width  = 340;
  canvas.style.width = '340px';

  function resize() {
    canvas.height = window.innerHeight;
    canvas.style.height = window.innerHeight + 'px';
  }

  resize();
  window.addEventListener('resize', resize);

  // Tentacle spring physics
  const TENTACLES = 14;
  const TENT_SEG  = 8;
  const SEG_LEN   = 12;

  const tentacles = Array.from({ length: TENTACLES }, (_, ti) => ({
    baseXFrac: 0.15 + (ti / (TENTACLES - 1)) * 0.7,
    segments: Array.from({ length: TENT_SEG }, () => ({ x: 0, y: 0, vx: 0, vy: 0 })),
    phase: Math.random() * TAU,
    len: 70 + Math.random() * 50,
  }));

  let jx = W * 0.5, jy = -120; // start off-screen, drift down

  function drawJellyfish(t) {
    const H = canvas.height;
    const capW = 95, capH = 62;

    // Gentle bob
    const bob = Math.sin(t * 0.0008) * 12;
    const cy  = jy + bob;

    ctx.clearRect(0, 0, W, H);

    // Outer glow bloom
    const bloom = ctx.createRadialGradient(jx, cy, 10, jx, cy, capW * 1.5);
    bloom.addColorStop(0,   'rgba(0,255,200,0.06)');
    bloom.addColorStop(0.5, 'rgba(0,180,255,0.04)');
    bloom.addColorStop(1,   'transparent');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(jx, cy, capW * 1.5, 0, TAU);
    ctx.fill();

    // Cap
    const capGrad = ctx.createRadialGradient(jx, cy - capH * 0.3, 10, jx, cy, capW);
    capGrad.addColorStop(0,   'rgba(0,255,220,0.22)');
    capGrad.addColorStop(0.6, 'rgba(0,160,255,0.1)');
    capGrad.addColorStop(1,   'rgba(0,80,200,0.0)');

    ctx.beginPath();
    ctx.ellipse(jx, cy, capW, capH, 0, Math.PI, 0);
    ctx.fillStyle = capGrad;
    ctx.fill();

    // Cap rim
    const rimGrad = ctx.createLinearGradient(jx - capW, cy, jx + capW, cy);
    rimGrad.addColorStop(0,   'rgba(0,200,255,0)');
    rimGrad.addColorStop(0.3, 'rgba(0,255,200,0.5)');
    rimGrad.addColorStop(0.7, 'rgba(0,200,255,0.5)');
    rimGrad.addColorStop(1,   'rgba(0,200,255,0)');

    ctx.beginPath();
    ctx.ellipse(jx, cy, capW, capH, 0, Math.PI, 0);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    // Inner organs
    [[0.3, 0.55, 'rgba(0,255,200,0.12)'], [0.18, 0.35, 'rgba(0,200,255,0.1)']].forEach(([rw, rh, c]) => {
      ctx.beginPath();
      ctx.ellipse(jx, cy - capH * 0.15, capW * rw, capH * rh, 0, 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
    });

    // Lip frills
    const FRILLS = 8;
    for (let f = 0; f < FRILLS; f++) {
      const fx = jx - capW + (f / (FRILLS-1)) * capW * 2;
      const frill = Math.sin(t * 0.002 + f * 0.8) * 6;
      ctx.beginPath();
      ctx.moveTo(fx, cy);
      ctx.quadraticCurveTo(fx, cy + 10 + frill, fx + 4 * (f%2===0?1:-1), cy + 18);
      ctx.strokeStyle = `rgba(0,255,200,${0.15 + frill * 0.01})`;
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    }

    // Tentacles with spring physics
    tentacles.forEach((tent, ti) => {
      const tx  = jx - capW + tent.baseXFrac * capW * 2;
      const ty0 = cy;

      // Mouse proximity repulsion
      const mdx  = mouse.x - (canvas.getBoundingClientRect().left + tx);
      const mdy  = mouse.y - (canvas.getBoundingClientRect().top  + ty0);
      const mdist = Math.sqrt(mdx*mdx + mdy*mdy);

      tent.segments.forEach((seg, si) => {
        const px = si === 0 ? tx : tent.segments[si-1].x;
        const py = si === 0 ? ty0 : tent.segments[si-1].y;

        const drift   = Math.sin(t * 0.0009 + tent.phase + si * 0.5) * 8;
        const gravity = 0.5;

        // Mouse repulsion on tentacles
        let mx_force = 0, my_force = 0;
        if (mdist < 140 && mdist > 0) {
          const mf = (140 - mdist) / 140;
          mx_force = -(mdx / mdist) * mf * 2;
          my_force = -(mdy / mdist) * mf * 1.5;
        }

        // Target: hang below previous segment + drift
        const targetX = px + drift * 0.4;
        const targetY = py + SEG_LEN;

        seg.vx += (targetX - seg.x) * 0.04 + mx_force;
        seg.vy += (targetY - seg.y) * 0.04 + gravity + my_force;
        seg.vx *= 0.82;
        seg.vy *= 0.82;
        seg.x  += seg.vx;
        seg.y  += seg.vy;
      });

      // Draw tentacle as bezier chain
      ctx.beginPath();
      ctx.moveTo(tx, ty0);
      tent.segments.forEach((seg) => ctx.lineTo(seg.x, seg.y));

      const tentAlpha = 0.12 + (ti % 3) * 0.06;
      const tGrad = ctx.createLinearGradient(tx, ty0, tx, ty0 + tent.len);
      tGrad.addColorStop(0, `rgba(0,255,200,${tentAlpha + 0.1})`);
      tGrad.addColorStop(1, `rgba(0,180,255,0)`);
      ctx.strokeStyle = tGrad;
      ctx.lineWidth   = ti % 3 === 0 ? 1.2 : 0.7;
      ctx.stroke();

      // Bioluminescent beads along tentacle
      if (ti % 2 === 0) {
        tent.segments.forEach((seg, si) => {
          if (si % 2 !== 0) return;
          const pulse = (Math.sin(t * 0.003 + ti + si) + 1) * 0.5;
          ctx.fillStyle = `rgba(0,255,200,${0.15 + pulse * 0.25})`;
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, 1.5 + pulse, 0, TAU);
          ctx.fill();
        });
      }
    });

    // Slow jellyfish drift down (cycles)
    jy += 0.2;
    if (jy > H + 200) jy = -200;
  }

  (function loop(t) {
    drawJellyfish(t);
    requestAnimationFrame(loop);
  })();
})();

// ─── Phase 3b: Logo Machine Ring ─────────────────────────────────────────────
(function initMachineRing() {
  const canvas = document.getElementById('machine-canvas');
  const stage  = document.getElementById('machine-stage');
  if (!canvas || !stage) return;

  const SIZE = canvas.offsetWidth || 380;
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const cx  = SIZE / 2;
  const cy  = SIZE / 2;
  const R   = SIZE * 0.42;

  let tiltX = 0, tiltY = 0;

  // Mouse tilt on the machine
  if (!isMobile()) {
    const heroMachine = document.getElementById('hero-machine');
    if (heroMachine) {
      heroMachine.addEventListener('mousemove', (e) => {
        const rect  = stage.getBoundingClientRect();
        const relX  = (e.clientX - rect.left - SIZE / 2) / (SIZE / 2);
        const relY  = (e.clientY - rect.top  - SIZE / 2) / (SIZE / 2);
        tiltX = lerp(tiltX, relY * -18, 0.08); // rotateX
        tiltY = lerp(tiltY, relX *  18, 0.08); // rotateY
      });
      heroMachine.addEventListener('mouseleave', () => {
        tiltX = lerp(tiltX, 0, 0.05);
        tiltY = lerp(tiltY, 0, 0.05);
      });
    }
  }

  function drawMachine(t) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // ── Outer glow ring
    const outerGlow = ctx.createRadialGradient(cx, cy, R-6, cx, cy, R+18);
    outerGlow.addColorStop(0, 'rgba(0,200,255,0.55)');
    outerGlow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.strokeStyle = outerGlow;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // ── Rotating tick marks
    const TICKS = 32;
    for (let i = 0; i < TICKS; i++) {
      const angle = (i / TICKS) * TAU + t * 0.4;
      const isMajor = i % 4 === 0;
      const r1 = R - (isMajor ? 10 : 5);
      const r2 = R + (isMajor ? 10 : 4);
      const x1 = cx + Math.cos(angle) * r1;
      const y1 = cy + Math.sin(angle) * r1;
      const x2 = cx + Math.cos(angle) * r2;
      const y2 = cy + Math.sin(angle) * r2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isMajor ? `rgba(0,255,200,0.8)` : `rgba(0,200,255,0.25)`;
      ctx.lineWidth   = isMajor ? 2 : 1;
      ctx.stroke();
    }

    // ── Inner concentric rings
    [0.7, 0.5, 0.35].forEach((factor, idx) => {
      const alpha = [0.15, 0.1, 0.07][idx];
      ctx.beginPath();
      ctx.arc(cx, cy, R * factor, 0, TAU);
      ctx.strokeStyle = `rgba(0,${150 + idx*30},255,${alpha})`;
      ctx.lineWidth   = 1;
      ctx.stroke();
    });

    // ── Counter-rotating inner ring
    const innerR = R * 0.82;
    const INNER_DASHES = 18;
    for (let i = 0; i < INNER_DASHES; i++) {
      const a   = (i / INNER_DASHES) * TAU - t * 0.25;
      const len = i % 3 === 0 ? 0.08 : 0.04;
      const a2  = a + len;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, a, a2);
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(0,255,200,0.45)' : 'rgba(0,200,255,0.15)';
      ctx.lineWidth   = i % 3 === 0 ? 2 : 1;
      ctx.stroke();
    }

    // ── Orbiting energy nodes
    const NODES = 6;
    for (let i = 0; i < NODES; i++) {
      const angle = (i / NODES) * TAU + t * 0.7;
      const orbit = R * 0.62;
      const nx    = cx + Math.cos(angle) * orbit;
      const ny    = cy + Math.sin(angle) * orbit;
      const pulse = (Math.sin(t * 2 + i) + 1) * 0.5;

      // Node glow
      const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, 8 + pulse * 4);
      ng.addColorStop(0, `rgba(0,255,200,${0.6 + pulse * 0.3})`);
      ng.addColorStop(1, 'transparent');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(nx, ny, 8 + pulse * 4, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.arc(nx, ny, 2.5, 0, TAU);
      ctx.fill();
    }

    // ── Sweeping arc (scanner)
    const sweepA = t * 1.1;
    const sweepGrad = ctx.createConicalGradient
      ? (() => {/* conical not widely supported */})()
      : null;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R * 0.85, sweepA, sweepA + 0.6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,200,255,0.06)';
    ctx.fill();

    // ── Corner bracket decorations
    const BSIZE = 14;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([dx, dy]) => {
      const bx = cx + dx * (R + 22);
      const by = cy + dy * (R + 22);
      ctx.strokeStyle = 'rgba(0,200,255,0.35)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx,          by + dy * BSIZE * -1);
      ctx.lineTo(bx,          by);
      ctx.lineTo(bx + dx * BSIZE * -1, by);
      ctx.stroke();
    });

    // Apply 3D tilt to stage
    stage.style.transform = `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    tiltX = lerp(tiltX, 0, 0.03);
    tiltY = lerp(tiltY, 0, 0.03);

    requestAnimationFrame(drawMachine);
  }

  requestAnimationFrame(drawMachine);
})();

// ─── Phase 3c: Molecular Logo ─────────────────────────────────────────────────
(function initMolecularLogo() {
  if (isMobile()) return;

  const logoWrap   = document.getElementById('logo-wrap');
  const logoText   = document.getElementById('logo-text');
  const logoCanvas = document.getElementById('logo-canvas');
  if (!logoWrap || !logoText || !logoCanvas) return;

  const ctx = logoCanvas.getContext('2d');
  let particles = [], built = false;

  function build() {
    const rect = logoText.getBoundingClientRect();
    const W    = Math.ceil(rect.width)  + 4;
    const H    = Math.ceil(rect.height) + 4;

    logoCanvas.width  = W;
    logoCanvas.height = H;
    logoCanvas.style.width  = W + 'px';
    logoCanvas.style.height = H + 'px';

    const off    = document.createElement('canvas');
    off.width    = W;
    off.height   = H;
    const offCtx = off.getContext('2d');
    const cs     = getComputedStyle(logoText);

    offCtx.fillStyle = '#e8f4ff';
    offCtx.font      = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    offCtx.textBaseline = 'top';
    offCtx.fillText('Northbound Studio', 2, 2);

    const data = offCtx.getImageData(0, 0, W, H).data;
    particles  = [];
    const STEP = 4;
    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const i = (y * W + x) * 4;
        if (data[i+3] > 100) {
          particles.push({ x, y, bx: x, by: y, vx: 0, vy: 0, a: data[i+3]/255 });
        }
      }
    }

    built = true;
    logoText.classList.add('hidden');
    logoCanvas.classList.add('active');
  }

  let isHover = false;
  logoWrap.addEventListener('mouseenter', () => { isHover = true; });
  logoWrap.addEventListener('mouseleave', () => { isHover = false; });

  (function loop() {
    if (built) {
      const rect = logoCanvas.getBoundingClientRect();
      const lx   = isHover ? mouse.x - rect.left : -999;
      const ly   = isHover ? mouse.y - rect.top  : -999;
      const R    = 48;

      ctx.clearRect(0, 0, logoCanvas.width, logoCanvas.height);

      particles.forEach(p => {
        const dx   = lx - p.x;
        const dy   = ly - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < R && dist > 0) {
          const f = (R - dist) / R;
          p.vx -= (dx / dist) * f * 5;
          p.vy -= (dy / dist) * f * 5;
        }

        p.vx += (p.bx - p.x) * 0.06;
        p.vy += (p.by - p.y) * 0.06;
        p.vx *= 0.84;
        p.vy *= 0.84;
        p.x  += p.vx;
        p.y  += p.vy;

        ctx.fillStyle = `rgba(232,244,255,${p.a})`;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      });
    }
    requestAnimationFrame(loop);
  })();

  document.fonts.ready.then(() => setTimeout(build, 400));
})();

// ─── Phase 4: Intro Sequence ──────────────────────────────────────────────────
(function initIntro() {
  const overlay = document.getElementById('intro-overlay');
  if (!overlay) return;

  if (sessionStorage.getItem('nbIntroSeen')) {
    overlay.style.display = 'none';
    return;
  }

  sessionStorage.setItem('nbIntroSeen', '1');

  function run() {
    if (typeof gsap === 'undefined') { setTimeout(run, 50); return; }

    const logos    = overlay.querySelector('.intro-logos');
    const words    = overlay.querySelectorAll('.intro-logo-word');
    const wordmark = overlay.querySelector('.intro-wordmark');
    const name     = overlay.querySelector('.intro-name');
    const studio   = overlay.querySelector('.intro-studio');
    const curtain  = overlay.querySelector('.intro-curtain');

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.to(logos, { opacity: 1, duration: 0.01 })
      .to(words,  { y: 0, duration: 0.5, stagger: 0.18 })
      .to(logos,  { opacity: 0, y: -10, duration: 0.3, ease: 'power2.in' }, '+=0.35')
      .to(wordmark, { opacity: 1, duration: 0.01 })
      .fromTo(name,   { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65 }, '-=0.05')
      .fromTo(studio, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, '-=0.4')
      .to({}, { duration: 0.5 })
      .fromTo(curtain, { y: '100%' }, { y: '-100%', duration: 0.85, ease: 'power3.inOut' })
      .call(() => overlay.style.display = 'none');
  }

  run();
})();

// ─── Phase 9: Scroll Reveals ──────────────────────────────────────────────────
const revealObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.reveal').forEach((el) => revealObs.observe(el));

// ─── Review Slider ────────────────────────────────────────────────────────────
(function initSlider() {
  const slider = document.querySelector('[data-slider]');
  if (!slider) return;

  const reviews = slider.querySelectorAll('.review');
  const prev    = slider.querySelector('[data-prev]');
  const next    = slider.querySelector('[data-next]');
  const rm      = window.matchMedia('(prefers-reduced-motion: reduce)');
  let idx = 0, tid = null;

  const show = (t) => {
    reviews[idx].classList.remove('active');
    idx = (t + reviews.length) % reviews.length;
    reviews[idx].classList.add('active');
  };

  const start = () => { if (!tid && !document.hidden && !rm.matches) tid = setInterval(() => show(idx+1), 6000); };
  const stop  = () => { clearInterval(tid); tid = null; };

  prev?.addEventListener('click', () => { stop(); show(idx-1); });
  next?.addEventListener('click', () => { stop(); show(idx+1); });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
})();

// ─── Package → budget pre-fill ────────────────────────────────────────────────
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

// ─── Application Form ─────────────────────────────────────────────────────────
(function initForm() {
  const form    = document.getElementById('intake-form');
  const message = document.querySelector('.form-message');
  if (!form) return;

  const validate = (f) => {
    const err = f.closest('label')?.querySelector('.field-error');
    if (f.required && !f.value.trim()) {
      f.classList.add('invalid');
      if (err) err.textContent = 'Required.';
      return false;
    }
    f.classList.remove('invalid');
    if (err) err.textContent = '';
    return true;
  };

  form.querySelectorAll('input, select, textarea').forEach((f) => {
    f.addEventListener('blur',  () => validate(f));
    f.addEventListener('input', () => { if (f.classList.contains('invalid')) validate(f); });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll('input:not([name="_gotcha"]), select, textarea').forEach((f) => {
      if (!validate(f)) valid = false;
    });
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
        message.className   = 'form-message success';
        form.reset();
      } else {
        throw new Error();
      }
    } catch {
      message.textContent = 'Something went wrong. Please try again.';
      message.className   = 'form-message error';
    } finally {
      btn.disabled = false;
      label.textContent = 'Submit Application';
      spinner.hidden = true;
    }
  });
})();
