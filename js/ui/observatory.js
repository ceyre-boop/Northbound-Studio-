/* ============================================================
   ui/observatory.js — the constellation hub renderer.
   Positions the orbital nodes (floating drift) and draws the
   star-chart: dashed center→node lines + concentric radar rings.
   LAYER 1 (living constellation): a parallax dust field drifts in
   the dead space, shooting stars streak past every 8-12s, and nodes
   become gravity wells that pull nearby dust when the cursor nears.
   LAYER 2 hook: listens for `nb:warp` to implode/scatter the dust
   toward a clicked node during panel transitions.
   Only renders while in hub mode with no panel open.
   Returns false if the hub markup is missing (→ force linear).
   ============================================================ */
import { loop } from "../core/loop.js";
import { pointer } from "../core/pointer.js";
import { DPR, reduceMotion, clamp, rand, safe, TAU } from "../core/util.js";

export function initObservatory() {
  const hub = document.getElementById("hub");
  const canvas = hub && hub.querySelector(".hub__lines");
  const nodes = [...document.querySelectorAll(".node")];
  if (!hub || !canvas || !nodes.length) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  let W = 0, H = 0, cx = 0, cy = 0, rx = 0, ry = 0;
  const pos = nodes.map(() => ({ x: 0, y: 0, bx: 0, by: 0, phase: Math.random() * TAU }));

  /* ---- Living dust field (motion only; count scales with tier) ---- */
  const DUST_FOR_TIER = { 2: 90, 1: 55, 0: 0 };
  let dust = [];
  function buildDust() {
    const n = reduceMotion ? 0 : (DUST_FOR_TIER[loop.tier] ?? 55);
    dust = new Array(n);
    for (let i = 0; i < n; i++) {
      const z = rand(0.15, 1); // depth → size/alpha/parallax/drift speed
      dust[i] = {
        x: rand(0, W),
        y: rand(0, H),
        z,
        vx: rand(-0.12, 0.12) * z, // steady drift (px/frame)
        vy: rand(-0.12, 0.12) * z,
        ix: 0, iy: 0,             // impulse velocity (wells + warp), decays
        size: 0.6 + z * 1.8,
        seed: Math.random(),
      };
    }
  }
  loop.onTier(() => buildDust());

  /* ---- Shooting stars ---- */
  let meteors = [];
  let nextMeteor = 1500 + rand(0, 4000); // ms until first
  function spawnMeteor() {
    const speed = rand(820, 1300); // px/sec
    const ang = rand(Math.PI * 0.14, Math.PI * 0.30); // shallow down-right
    meteors.push({
      x: rand(-0.1 * W, 0.65 * W),
      y: rand(-0.15 * H, 0.08 * H),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0,
      max: rand(0.7, 1.15),
    });
  }

  /* ---- Layer 2: warp impulse from clicked node ---- */
  let warp = null; // { x, y, type: 'implode'|'scatter', t, dur }
  document.addEventListener("nb:warp", (e) => {
    if (reduceMotion) return;
    const d = (e && e.detail) || {};
    warp = {
      x: safe(d.x, cx),
      y: safe(d.y, cy),
      type: d.type === "scatter" ? "scatter" : "implode",
      t: 0,
      dur: 0.5,
    };
  });

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Orbit the viewport center (mode-independent — measuring the "N"
    // mid-boot is unreliable because the body may still be in linear mode).
    cx = W / 2;
    cy = H * 0.47;
    rx = Math.min(W * 0.30, 380);
    ry = Math.max(Math.min(H * 0.32, 320), 190);
    const n = nodes.length;
    nodes.forEach((_, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2; // top, clockwise
      pos[i].bx = cx + Math.cos(ang) * rx;
      pos[i].by = cy + Math.sin(ang) * ry;
    });
    buildDust();
  }
  layout();
  window.addEventListener("resize", () => setTimeout(layout, 60));

  const active = () =>
    document.body.dataset.mode === "hub" &&
    !document.body.classList.contains("is-panel-open");

  function draw(dt, now) {
    if (!active()) {
      ctx.clearRect(0, 0, W, H);
      for (const node of nodes) node.classList.remove("is-near");
      return;
    }
    ctx.clearRect(0, 0, W, H);
    const t = now * 0.001;
    const drift = reduceMotion ? 0 : 1;

    // Node positions (gentle float).
    nodes.forEach((node, i) => {
      const p = pos[i];
      p.x = p.bx + Math.sin(t * 0.6 + p.phase) * 11 * drift;
      p.y = p.by + Math.cos(t * 0.5 + p.phase) * 11 * drift;
      node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
    });

    // Which node (if any) is the active gravity well (cursor nearby)?
    let well = null;
    if (!reduceMotion && pointer.active) {
      let best = 150; // px
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(pointer.x - pos[i].x, pointer.y - pos[i].y);
        const near = d < 150;
        node_toggle(nodes[i], near);
        if (d < best) { best = d; well = pos[i]; }
      }
    } else {
      for (const node of nodes) node.classList.remove("is-near");
    }

    // Decay the warp impulse window.
    let warpToward = 0, wx = 0, wy = 0;
    if (warp) {
      warp.t += dt;
      if (warp.t >= warp.dur) warp = null;
      else {
        const k = 1 - warp.t / warp.dur;
        warpToward = (warp.type === "scatter" ? -1 : 1) * 9 * k;
        wx = warp.x; wy = warp.y;
      }
    }

    /* 1) Dust field (drawn behind rings/lines). */
    for (const p of dust) {
      // Gravity well pull.
      if (well) {
        const dx = well.x - p.x, dy = well.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 220 && d > 1) {
          const f = (1 - d / 220) * 0.05 * p.z;
          p.ix += (dx / d) * f;
          p.iy += (dy / d) * f;
        }
      }
      // Warp impulse toward / away from the clicked node.
      if (warpToward) {
        const dx = wx - p.x, dy = wy - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.ix += (dx / d) * warpToward;
        p.iy += (dy / d) * warpToward;
      }
      // Cursor wake — the comet stirs nearby dust (repel + carry along motion).
      if (pointer.active) {
        const cdx = p.x - pointer.x, cdy = p.y - pointer.y;
        const cd = Math.hypot(cdx, cdy);
        if (cd < 130 && cd > 0.1) {
          const f = 1 - cd / 130;
          p.ix += (cdx / cd) * f * 0.7;
          p.iy += (cdy / cd) * f * 0.7;
          p.ix += pointer.vx * f * 0.05;
          p.iy += pointer.vy * f * 0.05;
        }
      }
      // Integrate (impulse decays; steady drift continues).
      p.ix *= 0.9; p.iy *= 0.9;
      p.x = safe(p.x + p.vx + p.ix, p.x);
      p.y = safe(p.y + p.vy + p.iy, p.y);
      // Wrap at edges.
      if (p.x < -12) p.x = W + 12; else if (p.x > W + 12) p.x = -12;
      if (p.y < -12) p.y = H + 12; else if (p.y > H + 12) p.y = -12;

      // Parallax offset at draw time (depth follows the cursor).
      const sx = p.x + pointer.nx * p.z * 16;
      const sy = p.y + pointer.ny * p.z * 16;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.6 + p.seed * TAU);
      const a = clamp((0.10 + p.z * 0.30) * (0.6 + 0.4 * tw), 0, 0.7);
      ctx.fillStyle = p.seed > 0.82
        ? `rgba(190,250,255,${a.toFixed(3)})`
        : `rgba(0,240,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, TAU);
      ctx.fill();
    }

    /* 2) Shooting stars. */
    if (!reduceMotion) {
      nextMeteor -= dt * 1000;
      if (nextMeteor <= 0) {
        spawnMeteor();
        nextMeteor = rand(8000, 12000);
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.life > m.max || m.x > W + 60 || m.y > H + 60) {
          meteors.splice(i, 1);
          continue;
        }
        const fade = Math.sin((m.life / m.max) * Math.PI); // in-out
        const len = 90;
        const ux = m.vx, uy = m.vy;
        const mag = Math.hypot(ux, uy) || 1;
        const tailX = m.x - (ux / mag) * len;
        const tailY = m.y - (uy / mag) * len;
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(220,250,255,${(0.9 * fade).toFixed(3)})`);
        grad.addColorStop(1, "rgba(0,240,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }
    }

    /* 3) Concentric radar rings emanating from center. */
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,240,255,0.05)";
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * (k / 3) + 26, ry * (k / 3) + 26, 0, 0, TAU);
      ctx.stroke();
    }

    /* 4) Dashed, pulsing star-chart lines from center to each node. */
    ctx.setLineDash([3, 6]);
    nodes.forEach((node, i) => {
      const p = pos[i];
      const isWell = well === p;
      const pulse = (isWell ? 0.34 : 0.12) + 0.1 * Math.sin(t * 1.5 + i);
      ctx.strokeStyle = `rgba(0,240,255,${clamp(pulse, 0, 1).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  // Toggle helper kept tiny so the per-frame path stays cheap.
  function node_toggle(node, on) {
    if (on) { if (!node.classList.contains("is-near")) node.classList.add("is-near"); }
    else if (node.classList.contains("is-near")) node.classList.remove("is-near");
  }

  loop.add(draw);
  return true;
}
