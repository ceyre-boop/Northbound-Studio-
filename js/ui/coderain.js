/* ============================================================
   ui/coderain.js — ambient "digital rain" behind the Build Side card.
   A faint column-rain of code glyphs renders on a canvas clipped to
   the dev card, only while the card is on screen. Pure flourish:
   gates off on reduced-motion and weak hardware, never blocks layout.
   ============================================================ */
import { loop } from "../core/loop.js";
import { reduceMotion } from "../core/util.js";

export function initCodeRain() {
  if (reduceMotion) return false;
  if (loop.tier < 1) return false; // skip the weakest tier

  const card = document.querySelector(".why__card--dev");
  if (!card) return false;

  const canvas = document.createElement("canvas");
  canvas.className = "coderain";
  canvas.setAttribute("aria-hidden", "true");
  card.insertBefore(canvas, card.firstChild);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return false; }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const GLYPHS = "01{}</>=;:+*#$".split("");
  const FONT = 13;
  let W = 0, H = 0, cols = [];

  function layout() {
    const r = card.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.ceil(W / FONT);
    cols = new Array(n).fill(0).map(() => ({
      y: Math.random() * H,
      speed: 26 + Math.random() * 48,
    }));
  }
  layout();
  try { new ResizeObserver(() => layout()).observe(card); } catch (e) {}

  let visible = true;
  try {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.04 })
      .observe(card);
  } catch (e) {}

  function draw(dt) {
    if (!visible) return;
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${FONT}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = "top";
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      c.y += c.speed * dt;
      if (c.y > H + 40) { c.y = -Math.random() * 60; c.speed = 26 + Math.random() * 48; }
      const x = i * FONT + 1;
      for (let k = 0; k < 7; k++) {
        const yy = c.y - k * FONT;
        if (yy < -FONT || yy > H) continue;
        const a = (k === 0 ? 0.85 : 0.45 * (1 - k / 7)) * 0.5;
        ctx.fillStyle = k === 0 ? `rgba(190,250,255,${a.toFixed(3)})` : `rgba(0,240,255,${a.toFixed(3)})`;
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, yy);
      }
    }
  }
  loop.add(draw);
  return true;
}
