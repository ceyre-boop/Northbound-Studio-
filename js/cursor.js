/* cursor.js — the "Comet" cursor (ported from the Observatory build).
   A luminous core trails a wake of glowing particles; blooms on hover
   with a VIEW/ENTER/TEXT label; click fires a shockwave + burst.
   Reads NB.pointer (set up in app.js); registers its render via NB.onFrame. */
(function () {
  window.NB = window.NB || {};
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  NB.cursor = {
    init() {
      if (NB.isTouch || NB.reduceMotion) return false;
      const p = NB.pointer;
      const canvas = document.createElement("canvas");
      canvas.className = "cursor-canvas";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      if (!ctx) { canvas.remove(); return false; }

      const label = document.createElement("div");
      label.className = "cursor-label";
      label.setAttribute("aria-hidden", "true");
      document.body.appendChild(label);
      document.documentElement.classList.add("has-cursor");

      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      let W = 0, H = 0;
      function resize() {
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W * DPR; canvas.height = H * DPR;
        canvas.style.width = W + "px"; canvas.style.height = H + "px";
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      }
      resize();
      window.addEventListener("resize", resize);

      const trail = [], ripples = [];
      const TRAIL_MAX = 150;
      let mode = "", bloom = 0, bloomTarget = 0, lastX = p.x, lastY = p.y;
      const LINKISH = "a, button, .btn, input, select, textarea, label, [data-magnetic]";
      function pickMode(el) {
        if (!el || !el.closest) return ["", ""];
        if (el.closest(".work__frame, .cap__device")) return ["view", "VIEW"];
        if (el.closest(".pkg, .nav__cta")) return ["link", ""];
        if (el.closest("input, textarea")) return ["text", ""];
        if (el.closest(LINKISH)) return ["link", ""];
        return ["", ""];
      }
      document.addEventListener("pointerover", (e) => {
        const [m, txt] = pickMode(e.target);
        mode = m; label.textContent = txt; label.dataset.show = txt ? "1" : "";
        bloomTarget = m ? 1 : 0;
      });
      function burstAt(x, y, n) {
        ripples.push({ x, y, max: 170, life: 0, maxLife: 0.65 });
        for (let i = 0; i < (n || 18); i++) {
          const a = Math.random() * TAU, s = 2 + Math.random() * 6.5;
          trail.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.5 + Math.random() * 0.5, size: 1.2 + Math.random() * 2.6, hot: Math.random() < 0.5 });
        }
      }
      NB.burstAt = burstAt;
      window.addEventListener("pointerdown", () => burstAt(p.x, p.y, 16));

      NB.onFrame(function render(dt) {
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = "lighter";
        const sp = p.speed;
        const spawn = clamp(Math.round(sp * 0.3), 0, 5) + (sp > 0.6 ? 1 : 0);
        for (let i = 0; i < spawn; i++) {
          const f = spawn > 1 ? i / spawn : 0;
          trail.push({ x: lerp(lastX, p.x, f), y: lerp(lastY, p.y, f), vx: (Math.random() - 0.5) * 0.7 - p.vx * 0.02, vy: (Math.random() - 0.5) * 0.7 - p.vy * 0.02, life: 0, max: 0.45 + Math.random() * 0.45, size: 1.2 + Math.random() * 2.4, hot: Math.random() < 0.3 });
        }
        while (trail.length > TRAIL_MAX) trail.shift();
        lastX = p.x; lastY = p.y;
        for (let i = trail.length - 1; i >= 0; i--) {
          const q = trail[i]; q.life += dt;
          if (q.life >= q.max) { trail.splice(i, 1); continue; }
          q.x += q.vx; q.y += q.vy; q.vx *= 0.93; q.vy *= 0.93;
          const t = 1 - q.life / q.max, a = t * t * 0.8, rr = q.size * (0.5 + t) * 3;
          const col = q.hot ? "200,250,255" : "0,240,255";
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr);
          g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, TAU); ctx.fill();
        }
        bloom += (bloomTarget - bloom) * 0.15;
        const coreR = (6 + bloom * 11) * 2.4;
        const cg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coreR);
        cg.addColorStop(0, "rgba(225,251,255,0.95)"); cg.addColorStop(0.35, "rgba(0,240,255,0.55)"); cg.addColorStop(1, "rgba(0,240,255,0)");
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(p.x, p.y, coreR, 0, TAU); ctx.fill();
        const stretch = clamp(p.speed * 0.05, 0, 1.6), ang = Math.atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.scale(1 + stretch, 1);
        if (mode === "text") { ctx.fillStyle = "rgba(240,253,255,0.96)"; ctx.fillRect(-1, -10, 2, 20); }
        else { ctx.fillStyle = "rgba(240,253,255,0.96)"; ctx.beginPath(); ctx.arc(0, 0, 2 + bloom * 1.6, 0, TAU); ctx.fill(); }
        ctx.restore();
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i]; r.life += dt;
          if (r.life >= r.maxLife) { ripples.splice(i, 1); continue; }
          const t = r.life / r.maxLife, rad = 6 + t * r.max, a = (1 - t) * 0.55;
          ctx.strokeStyle = `rgba(0,240,255,${a.toFixed(3)})`; ctx.lineWidth = (1 - t) * 2.4 + 0.4;
          ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
        label.style.transform = `translate(${(p.x + 18).toFixed(1)}px, ${(p.y + 12).toFixed(1)}px)`;
      });

      document.addEventListener("mouseleave", () => { canvas.style.opacity = "0"; label.style.opacity = "0"; });
      document.addEventListener("mouseenter", () => { canvas.style.opacity = "1"; label.style.opacity = ""; });
      return true;
    },
  };
})();
