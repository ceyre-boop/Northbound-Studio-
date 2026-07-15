/* helix.js — Scenes 2+3 "Voyage" pipeline (Three.js r128 + UnrealBloom).
   A two-strand particle helix travels toward the camera, converges into a
   letter N, the N inflates + cracks, then shatters past the viewer and fades
   to black. ONE canvas, ONE ScrollTrigger, ONE frame callback. Every visual
   is a pure function of master progress p (state.p) so reverse-scrub replays
   exactly — the only forward-only state is rotAccum, which is decorative and
   is multiplied out to 0 by the end of phase C. */
(function () {
  window.NB = window.NB || {};

  const COUNT = 1200;      // 600 per strand
  const PER = 600;
  const RADIUS = 3.5;
  const Z_SPAN = 71.88;    // -PER*0.12 → helix spans z 0…−71.88
  const N_Z = -72;         // N centered at (0,0,−72)
  const BRIDGE_STEP = 10;  // bridge every 10th index → 60 segments

  // Tiny pure easings/helpers (no allocation, safe to call in the frame loop).
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function T(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); } // easeOut cubic
  function easeIn(t) { return t * t; }

  NB.helix = {};

  NB.helix.init = function (canvas) {
    // Mobile / reduced-motion: app.js sets NB.skipThree and hides .voyage__pin.
    if (NB.skipThree || !canvas) return;
    if (typeof THREE === "undefined" || !THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) {
      document.body.classList.add("no-three");
      return;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: "high-performance" });
    } catch (e) {
      document.body.classList.add("no-three"); // CSS falls back to .voyage__lite
      return;
    }
    renderer.setClearColor(0x000000);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / Math.max(window.innerHeight, 1), 0.1, 500);
    camera.position.z = 6; // looking down −z

    const group = new THREE.Group(); // holds particles, bridges, crack (scales about N plane)
    scene.add(group);

    // ── Precomputed Float32Arrays (never allocate in the frame loop) ──
    const posArr = new Float32Array(COUNT * 3);
    const colorArr = new Float32Array(COUNT * 3);
    const cosA = new Float32Array(COUNT);
    const sinA = new Float32Array(COUNT);
    const zBaseArr = new Float32Array(COUNT);
    const nPos = new Float32Array(COUNT * 3);
    const vel = new Float32Array(COUNT * 3);
    const bulge = new Float32Array(COUNT * 3);

    const BASE_G = 240 / 255, BASE_B = 1; // cyan 0x00F0FF baked into color attr (r=0)

    for (let i = 0; i < COUNT; i++) {
      const strand = i < PER ? 0 : 1;
      const idx = strand === 0 ? i : i - PER;
      const angle = idx * 0.15 + (strand === 1 ? Math.PI : 0);
      cosA[i] = Math.cos(angle);
      sinA[i] = Math.sin(angle);
      zBaseArr[i] = -idx * 0.12;
      const k = i * 3;
      // init buffer = helix (phase A never rewrites this)
      posArr[k] = cosA[i] * RADIUS;
      posArr[k + 1] = sinA[i] * RADIUS;
      posArr[k + 2] = zBaseArr[i];
      colorArr[k] = 0; colorArr[k + 1] = BASE_G; colorArr[k + 2] = BASE_B;
      // shatter velocity: x,y ±5; z +5..15 (POSITIVE z = toward camera, since
      // camera sits at ~−58 while N is at −72, so +z carries points past it)
      vel[k] = (Math.random() * 2 - 1) * 5;
      vel[k + 1] = (Math.random() * 2 - 1) * 5;
      vel[k + 2] = 5 + Math.random() * 10;
      // outward-ish unit vector * ~0.35 for the inflate "bulge"
      let bx = Math.random() * 2 - 1, by = Math.random() * 2 - 1, bz = Math.random() * 2 - 1;
      const bl = Math.hypot(bx, by, bz) || 1;
      bulge[k] = (bx / bl) * 0.35; bulge[k + 1] = (by / bl) * 0.35; bulge[k + 2] = (bz / bl) * 0.35;
    }

    // nPos: 1200 points across the letter N (left vertical / diagonal / right
    // vertical) allotted by stroke length, even-spaced + ±0.06 jitter on x/y.
    (function buildN() {
      const L = 375, D = 450; // R = 375; L+D+R = 1200
      let w = 0;
      function put(x, y) {
        const k = w * 3;
        nPos[k] = x + (Math.random() - 0.5) * 0.12;
        nPos[k + 1] = y + (Math.random() - 0.5) * 0.12;
        nPos[k + 2] = N_Z;
        w++;
      }
      for (let j = 0; j < L; j++) put(-2, -3 + 6 * (j / (L - 1)));                 // left vertical
      for (let j = 0; j < D; j++) { const t = j / (D - 1); put(-2 + 4 * t, 3 - 6 * t); } // diagonal ↘
      for (let j = 0; j < COUNT - L - D; j++) put(2, -3 + 6 * (j / (COUNT - L - D - 1))); // right vertical
    })();

    // ── Particle system ──
    // Soft round glow sprite — default PointsMaterial renders hard squares.
    const glowTex = (function () {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      return tex;
    })();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));
    const posAttr = geo.attributes.position;
    const colAttr = geo.attributes.color;
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.14, map: glowTex, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    group.add(points);

    // ── Bridges: strand1[i] ↔ strand2[i] for every 10th i (60 segments) ──
    const bridgeArr = new Float32Array(60 * 2 * 3);
    function writeBridges() {
      for (let pIdx = 0; pIdx < 60; pIdx++) {
        const i = pIdx * BRIDGE_STEP;
        const s1 = i * 3, s2 = (PER + i) * 3;
        const b1 = pIdx * 6, b2 = b1 + 3;
        bridgeArr[b1] = posArr[s1]; bridgeArr[b1 + 1] = posArr[s1 + 1]; bridgeArr[b1 + 2] = posArr[s1 + 2];
        bridgeArr[b2] = posArr[s2]; bridgeArr[b2 + 1] = posArr[s2 + 1]; bridgeArr[b2 + 2] = posArr[s2 + 2];
      }
    }
    writeBridges();
    const bridgeGeo = new THREE.BufferGeometry();
    bridgeGeo.setAttribute("position", new THREE.BufferAttribute(bridgeArr, 3));
    const bridgeAttr = bridgeGeo.attributes.position;
    const bridges = new THREE.LineSegments(bridgeGeo, new THREE.LineBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending
    }));
    group.add(bridges);

    // ── Crack: jagged Line (~14 segments) across the N at its z-plane ──
    const crackPts = 15;
    const crackArr = new Float32Array(crackPts * 3);
    for (let j = 0; j < crackPts; j++) {
      const t = j / (crackPts - 1);
      crackArr[j * 3] = -2.5 + 5 * t;
      crackArr[j * 3 + 1] = 3.2 - 6.4 * t + (Math.random() - 0.5) * 0.9; // jitter = jagged
      crackArr[j * 3 + 2] = N_Z;
    }
    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute("position", new THREE.BufferAttribute(crackArr, 3));
    const crack = new THREE.Line(crackGeo, new THREE.LineBasicMaterial({
      color: 0xccffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending
    }));
    group.add(crack);

    // ── Stars: static dim shell (bloom threshold 0 halos anything bright) ──
    const STARS = 400;
    const starArr = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const r = 40 + Math.random() * 50, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      starArr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starArr[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      starArr[i * 3 + 2] = r * Math.cos(ph);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starArr, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0x16262c, size: 0.35, map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(stars);

    // ── Composer + bloom (strength driven per-frame) ──
    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0);
    composer.addPass(bloom);

    const flashEl = document.querySelector(".voyage__flash");

    // ── State ──
    const state = { p: 0, active: false, needsRender: true };
    let lastP = -1, rotAccum = 0, clock = 0, wasActive = false, colorsDirty = false, stopped = false;

    function sizeRenderer() {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
    }
    sizeRenderer();

    // ── Pure functions of p ──
    function cameraZ(p) {
      if (p < 0.533) return lerp(6, -64, easeInOut(T(p, 0, 0.533)));   // A: fly in
      if (p < 0.667) return lerp(-64, -62, T(p, 0.533, 0.667));        // B: drift
      if (p < 0.833) return -62;                                       // C+D: settled
      if (p < 0.917) return lerp(-62, -58, ease(T(p, 0.833, 0.917)));  // E: back off
      return -58;                                                      // F+G
    }
    function bloomOf(p) {
      if (p < 0.533) return 1.5;
      if (p < 0.667) return lerp(1.5, 1.2, T(p, 0.533, 0.667));
      if (p < 0.767) return lerp(1.2, 1.4, T(p, 0.667, 0.767));
      if (p < 0.833) return 1.4;
      if (p < 0.917) return lerp(1.4, 2.4, ease(T(p, 0.833, 0.917)));
      if (p < 0.933) return 2.4 + 0.8 * easeIn(T(p, 0.917, 0.933)); // F: monotonic → 3.2
      return lerp(3.2, 0.8, T(p, 0.933, 1));                        // G
    }
    function scaleOf(p) {
      if (p < 0.833) return 1;
      if (p < 0.917) return lerp(1, 2.5, ease(T(p, 0.833, 0.917)));
      return 2.5;
    }
    function bridgeOpacity(p) {
      if (p < 0.533) return 0.3;
      if (p < 0.667) return 0.3 * (1 - T(p, 0.533, 0.667));
      return 0;
    }
    // Per-particle position for p ≥ .533. Written straight into posArr.
    function writePositions(p) {
      if (p < 0.667) {                         // B: converge + z-compress
        const tB = T(p, 0.533, 0.667);
        const radius = RADIUS * (1 - ease(tB));
        for (let i = 0; i < COUNT; i++) {
          const k = i * 3;
          posArr[k] = cosA[i] * radius;
          posArr[k + 1] = sinA[i] * radius;
          posArr[k + 2] = lerp(zBaseArr[i], N_Z + (zBaseArr[i] / Z_SPAN) * 6, tB);
        }
      } else if (p < 0.767) {                  // C: staggered lerp axis → N
        const tC = T(p, 0.667, 0.767);
        for (let i = 0; i < COUNT; i++) {
          const k = i * 3;
          const zc = N_Z + (zBaseArr[i] / Z_SPAN) * 6; // B-end axis z
          const tcp = clamp(tC * 1.3 - 0.3 * (i / COUNT), 0, 1);
          posArr[k] = nPos[k] * tcp;               // lerp(0, nPos, tcp)
          posArr[k + 1] = nPos[k + 1] * tcp;
          posArr[k + 2] = lerp(zc, nPos[k + 2], tcp);
        }
      } else if (p < 0.833) {                  // D: hold at N
        posArr.set(nPos);
      } else if (p < 0.917) {                  // E: bulge outward
        const tE = ease(T(p, 0.833, 0.917));
        for (let i = 0; i < COUNT * 3; i++) posArr[i] = nPos[i] + bulge[i] * tE;
      } else if (p < 0.933) {                  // F: frozen E-end
        for (let i = 0; i < COUNT * 3; i++) posArr[i] = nPos[i] + bulge[i];
      } else {                                 // G: shatter past camera
        // Multiplier 2.5 (not larger): passage past the camera then spreads
        // across tG≈0.4–0.7 instead of everything vanishing in the first 20%.
        const tG = easeIn(T(p, 0.933, 1));
        for (let i = 0; i < COUNT * 3; i++) posArr[i] = nPos[i] + bulge[i] + vel[i] * tG * 2.5;
      }
    }
    // G fade: darken color toward black by passage past the camera plane
    // (additive blending ⇒ black = invisible). posArr already holds G positions.
    function writeGColors(p, scaleVal, groupPosZ, camZ) {
      for (let i = 0; i < COUNT; i++) {
        const k = i * 3;
        const worldZ = groupPosZ + scaleVal * posArr[k + 2];
        const mult = clamp((camZ - worldZ) / 13, 0, 1); // 1 while ahead, 0 once past
        colorArr[k] = 0; colorArr[k + 1] = BASE_G * mult; colorArr[k + 2] = BASE_B * mult;
      }
    }
    function resetColors() {
      for (let i = 0; i < COUNT; i++) { const k = i * 3; colorArr[k] = 0; colorArr[k + 1] = BASE_G; colorArr[k + 2] = BASE_B; }
    }
    // Fast reverse scrub can jump from B/C back into A in one frame; phase A
    // never writes positions, so restore the pristine helix once on crossing.
    function restoreHelix() {
      for (let i = 0; i < COUNT; i++) {
        const k = i * 3;
        posArr[k] = cosA[i] * RADIUS;
        posArr[k + 1] = sinA[i] * RADIUS;
        posArr[k + 2] = zBaseArr[i];
      }
    }
    function clearColorOf(p) {
      if (p < 0.933) return 0x000000;
      const t = T(p, 0.933, 1);
      const r = Math.round(lerp(0, 6, t)), g = Math.round(lerp(0, 6, t)), b = Math.round(lerp(0, 8, t));
      return (r << 16) | (g << 8) | b; // 0x000000 → 0x060608
    }

    // ── The one and only per-frame callback (shared gsap.ticker bus) ──
    NB.onFrame(function (dt) {
      if (stopped) return;
      clock += dt;
      const p = state.p;
      // rotAccum: forward-only but decorative; only accumulates in phases A–B.
      if (state.active && p < 0.667) rotAccum += 0.002 + Math.min(Math.abs(NB.scrollVel || 0) * 0.003, 0.05);

      const deactivating = wasActive && !state.active;
      const forced = state.needsRender || deactivating;
      wasActive = state.active;
      if (!state.active && !forced) return; // render only while active (+ forced/final frames)
      state.needsRender = false;

      const scaleVal = scaleOf(p);
      const groupPosZ = N_Z * (1 - scaleVal); // pivot scale about the N z-plane so it inflates in place
      const camZ = cameraZ(p);
      camera.position.z = camZ;
      group.rotation.z = rotAccum * (1 - T(p, 0.667, 0.767)); // unwinds to 0 by end of C
      group.rotation.y = (p >= 0.767 && p < 0.833) ? Math.sin(clock * 0.4) * 0.12 * Math.sin(Math.PI * T(p, 0.767, 0.833)) : 0;
      group.scale.set(scaleVal, scaleVal, scaleVal);
      group.position.z = groupPosZ;

      // Positions: rewrite ONLY when p ≥ .533 and something changed.
      if (p >= 0.533 && (p !== lastP || forced)) {
        writePositions(p);
        posAttr.needsUpdate = true;
        if (p < 0.667) { writeBridges(); bridgeAttr.needsUpdate = true; } // bridges visible only in A–B
      } else if (p < 0.533 && lastP >= 0.533) {
        restoreHelix();
        posAttr.needsUpdate = true;
        writeBridges();
        bridgeAttr.needsUpdate = true;
      }
      lastP = p;

      // Colors: base cyan everywhere except the G fade.
      if (p >= 0.933) { writeGColors(p, scaleVal, groupPosZ, camZ); colAttr.needsUpdate = true; colorsDirty = true; }
      else if (colorsDirty) { resetColors(); colAttr.needsUpdate = true; colorsDirty = false; }

      bridges.material.opacity = bridgeOpacity(p);
      crack.material.opacity = (p >= 0.917 && p < 0.933) ? Math.sin(Math.PI * T(p, 0.917, 0.933)) : 0;
      if (flashEl) flashEl.style.opacity = (p >= 0.917 && p < 0.933 ? 0.3 * Math.sin(Math.PI * T(p, 0.917, 0.933)) : 0).toFixed(3);
      stars.material.opacity = 1 - T(p, 0.933, 1);
      bloom.strength = bloomOf(p);
      renderer.setClearColor(clearColorOf(p));

      composer.render();
    });

    // ── ONE ScrollTrigger drives master progress p ──
    if (typeof ScrollTrigger !== "undefined") {
      ScrollTrigger.create({
        trigger: ".voyage__pin", start: "top top", end: "+=600%",
        pin: true, scrub: 0.6, anticipatePin: 1,
        onUpdate: (s) => { state.p = s.progress; },
        onToggle: (s) => { state.active = s.isActive; if (s.isActive) state.needsRender = true; }
      });
      ScrollTrigger.addEventListener("refresh", () => { sizeRenderer(); state.needsRender = true; });
    }

    // Resize: keep camera/renderer/composer in sync, force one frame.
    window.addEventListener("resize", () => { sizeRenderer(); state.needsRender = true; });

    // Context loss: bail to the CSS fallback and stop rendering.
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      document.body.classList.add("no-three");
      stopped = true;
    }, false);
  };
})();
