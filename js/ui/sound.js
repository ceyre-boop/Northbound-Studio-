/* ============================================================
   ui/sound.js — optional generative sound (Web Audio, zero files).
   Default OFF. A corner toggle arms it; a low ambient drone fades in,
   nodes play pentatonic plucks on hover, panel transitions sweep, and
   clicks tick. All synthesised from oscillators — nothing is loaded.
   Audio only starts on a user gesture (browser autoplay policy).
   ============================================================ */
export function initSound() {
  const btn = document.createElement("button");
  btn.className = "sound-toggle";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", "Toggle ambient sound");
  btn.innerHTML =
    `<span class="sound-toggle__icon" aria-hidden="true"><i></i><i></i><i></i></span><span class="sound-toggle__txt">Sound</span>`;
  document.body.appendChild(btn);

  const NOTES = [261.63, 329.63, 392.0, 493.88]; // C E G B — per node
  let ctx = null, master = null, on = false;

  function ensureCtx() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Ambient drone: detuned low oscillators → lowpass → gentle gain.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.09;
    lp.connect(droneGain);
    droneGain.connect(master);
    [55, 55.4, 82.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.35 : 1;
      o.connect(g);
      g.connect(lp);
      o.start();
    });
  }

  function fade(to) {
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(to, ctx.currentTime, 0.25);
  }

  function setOn(v) {
    on = v;
    btn.setAttribute("aria-pressed", String(v));
    btn.classList.toggle("is-on", v);
    try { sessionStorage.setItem("nb_sound", v ? "1" : "0"); } catch (e) {}
    if (v) {
      ensureCtx();
      if (ctx && ctx.state === "suspended") ctx.resume();
      fade(0.5);
    } else {
      fade(0);
    }
  }

  btn.addEventListener("click", () => setOn(!on));

  function pluck(freq, vol, type = "sine") {
    if (!on || !ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(master);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.setTargetAtTime(0, t + 0.02, 0.13);
    o.start(t);
    o.stop(t + 0.7);
  }

  document.querySelectorAll(".node").forEach((node, i) => {
    node.addEventListener("pointerenter", () => pluck(NOTES[i % NOTES.length], 0.18));
  });

  document.addEventListener("nb:warp", (e) => {
    if (!on || !ctx) return;
    const up = (e.detail && e.detail.type) !== "scatter";
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(lp);
    lp.connect(g);
    g.connect(master);
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(up ? 180 : 720, t);
    o.frequency.exponentialRampToValueAtTime(up ? 880 : 150, t + 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.03);
    g.gain.setTargetAtTime(0, t + 0.12, 0.16);
    o.start(t);
    o.stop(t + 0.7);
  });

  document.addEventListener("nb:click", () => pluck(660, 0.07, "triangle"));

  // Restore the session preference; audio resumes on the first gesture.
  let pref = "0";
  try { pref = sessionStorage.getItem("nb_sound") || "0"; } catch (e) {}
  if (pref === "1") {
    btn.classList.add("is-on");
    btn.setAttribute("aria-pressed", "true");
    const prime = () => { setOn(true); window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
  }

  return true;
}
