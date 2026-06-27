/* three-scenes.js — the hero 3D scene (Three.js r128 + UnrealBloom).
   REAL 3D rendered through an EffectComposer:
     • Data sphere   — faceted icosahedron wireframe + glowing vertex Points,
                       edges pulse like data flow. Rotates on 3 axes, tilts to cursor.
     • Ring array    — 6 thin TorusGeometry rings on different axes/speeds.
     • Particle text — the headline sampled into 3D Points that assemble on load
                       and scatter on scroll.
   The glow is UnrealBloomPass (not CSS). Registers render via NB.onFrame. */
(function () {
  window.NB = window.NB || {};
  NB.three = { available: false };

  const HEAD = ["We don't build websites.", "We build unfair advantages."];

  function glowTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(180,250,255,0.95)");
    g.addColorStop(1, "rgba(0,240,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  // Sample the headline into world-space target points (x/y plane).
  function sampleText(lines, worldW) {
    const cw = 1700, lh = 150, pad = 40;
    const ch = lines.length * lh + pad * 2;
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.font = '800 96px "Syne", system-ui, sans-serif';
    x.textAlign = "center"; x.textBaseline = "middle";
    lines.forEach((ln, i) => x.fillText(ln, cw / 2, pad + lh * (i + 0.5)));
    let data;
    try { data = x.getImageData(0, 0, cw, ch).data; } catch (e) { return null; }
    const pts = [];
    const step = 5;
    for (let py = 0; py < ch; py += step) {
      for (let px = 0; px < cw; px += step) {
        if (data[(py * cw + px) * 4 + 3] > 128) pts.push(px, py);
      }
    }
    const n = pts.length / 2;
    if (!n) return null;
    const scale = worldW / cw;
    const home = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      home[i * 3] = (pts[i * 2] - cw / 2) * scale;
      home[i * 3 + 1] = -(pts[i * 2 + 1] - ch / 2) * scale;
      home[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
    }
    return { home, count: n };
  }

  NB.three.init = function (canvas) {
    if (typeof THREE === "undefined" || !canvas) return false;
    if (!THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RenderPass) return false;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch (e) { return false; }
    if (!renderer.getContext()) return false;

    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x060608, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 6;

    // ── Data sphere (backdrop) ──
    const core = new THREE.Group();
    core.position.z = -2.6;
    const icoGeo = new THREE.IcosahedronGeometry(2.1, 1);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(icoGeo),
      new THREE.LineBasicMaterial({ color: 0x00aab3, transparent: true, opacity: 0.6 })
    );
    const pulse = new THREE.LineSegments( // brighter overlay → "data flow" pulse
      new THREE.WireframeGeometry(icoGeo),
      new THREE.LineBasicMaterial({ color: 0x9af6ff, transparent: true, opacity: 0.0 })
    );
    const inner = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.3, 0)),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.3 })
    );
    // Glowing point at every icosahedron vertex.
    const vGeo = new THREE.BufferGeometry();
    vGeo.setAttribute("position", icoGeo.attributes.position.clone());
    const vMat = new THREE.PointsMaterial({ map: glowTexture(), color: 0xffffff, size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const verts = new THREE.Points(vGeo, vMat);
    core.add(wire, pulse, inner, verts);

    // Orbiting dust around the sphere (kept for depth; powers boot burst).
    const DUST = 900;
    const dpos = new Float32Array(DUST * 3), dhome = new Float32Array(DUST * 3), dburst = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      const r = 2.7 + Math.random() * 2.2, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th), y = r * Math.sin(ph) * Math.sin(th), z = r * Math.cos(ph);
      dhome[i * 3] = x; dhome[i * 3 + 1] = y; dhome[i * 3 + 2] = z;
      dpos[i * 3] = x; dpos[i * 3 + 1] = y; dpos[i * 3 + 2] = z;
      const bl = 5 + Math.random() * 7;
      dburst[i * 3] = (x / r) * bl; dburst[i * 3 + 1] = (y / r) * bl; dburst[i * 3 + 2] = (z / r) * bl;
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0x6af2ff, size: 0.04, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.add(dust);
    scene.add(core);

    // ── Ring array (around the sphere) ──
    const rings = new THREE.Group();
    rings.position.z = -3.4;
    const ringDefs = [];
    for (let i = 0; i < 5; i++) {
      const rad = 1.9 + i * 0.48;
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(rad, 0.014, 8, 140),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x00f0ff : 0x7a5cff, transparent: true, opacity: 0.6 })
      );
      torus.rotation.x = Math.random() * Math.PI;
      torus.rotation.y = Math.random() * Math.PI;
      rings.add(torus);
      ringDefs.push({ m: torus, ax: i % 3, sp: (0.1 + Math.random() * 0.3) * (i % 2 ? 1 : -1) });
    }
    scene.add(rings);

    // ── Particle-text headline (front, z = 0) — built after fonts load ──
    let textPts = null, textHome = null, textScatter = null, textCount = 0, assembleAt = 0;
    function buildText() {
      const sampled = sampleText(HEAD, 8.5);
      if (!sampled) return;
      textCount = sampled.count;
      textHome = sampled.home;
      const start = new Float32Array(textCount * 3);
      textScatter = new Float32Array(textCount * 3);
      for (let i = 0; i < textCount; i++) {
        start[i * 3] = (Math.random() - 0.5) * 14;
        start[i * 3 + 1] = (Math.random() - 0.5) * 9;
        start[i * 3 + 2] = (Math.random() - 0.5) * 8;
        const a = Math.random() * Math.PI * 2;
        textScatter[i * 3] = Math.cos(a) * 9;
        textScatter[i * 3 + 1] = (Math.random() - 0.5) * 9;
        textScatter[i * 3 + 2] = Math.sin(a) * 9;
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute("position", new THREE.BufferAttribute(start, 3));
      textPts = new THREE.Points(tg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.062, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      textPts.position.z = 0.6; // bring the headline forward of the backdrop
      scene.add(textPts);
      assembleAt = performance.now();
      document.body.classList.add("has-3d-headline"); // CSS hides the DOM <h1>
    }
    if (document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1400))]).then(buildText);
    } else { setTimeout(buildText, 200); }

    // ── Composer + bloom ──
    let W = 0, H = 0;
    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 1.3, 0.5, 0.12);
    composer.addPass(bloom);

    function resize() {
      const hero = document.getElementById("hero");
      W = window.innerWidth; H = (hero ? hero.clientHeight : window.innerHeight) || window.innerHeight;
      renderer.setSize(W, H, false);
      composer.setSize(W, H);
      bloom.setSize(W, H);
      camera.aspect = W / Math.max(H, 1); camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    let burst = 0;
    NB.three.burst = function () { burst = 1; if (textHome) assembleAt = performance.now(); };

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    let t = 0, mx = 0, my = 0;

    NB.onFrame(function render(dt) {
      t += dt;
      const p = NB.pointer;
      mx += ((p.nx || 0) - mx) * 0.05;
      my += ((p.ny || 0) - my) * 0.05;
      const prog = Math.min((NB.scrollY || 0) / Math.max(window.innerHeight, 1), 1);

      // Sphere: 3-axis rotation + cursor tilt + scroll squash.
      core.rotation.y += dt * 0.2;
      core.rotation.x = my * 0.5 + t * 0.05;
      core.rotation.z = mx * 0.3;
      const squash = 1 - prog * 0.9, cs = 0.9;
      core.scale.set(squash * cs, (1 + prog * 1.4) * cs, squash * cs);
      // Edge "data-flow" pulse + a stochastic flash.
      pulse.material.opacity = 0.12 + 0.12 * Math.sin(t * 2.2) + (Math.random() < 0.03 ? 0.4 : 0);

      // Rings rotate on different axes/speeds; whole array tilts to cursor.
      rings.rotation.x = my * 0.4; rings.rotation.y = mx * 0.4;
      for (const r of ringDefs) {
        if (r.ax === 0) r.m.rotation.x += dt * r.sp;
        else if (r.ax === 1) r.m.rotation.y += dt * r.sp;
        else r.m.rotation.z += dt * r.sp;
        r.m.material.opacity = 0.85 * (1 - prog * 0.7);
      }

      // Dust burst (boot) + scroll fade.
      burst *= 0.94; if (burst < 0.001) burst = 0;
      const dp = dGeo.attributes.position.array;
      for (let i = 0; i < DUST; i++) {
        const k = i * 3;
        dp[k] = dhome[k] + dburst[k] * burst;
        dp[k + 1] = dhome[k + 1] + dburst[k + 1] * burst;
        dp[k + 2] = dhome[k + 2] + dburst[k + 2] * burst;
      }
      dGeo.attributes.position.needsUpdate = true;
      dust.material.opacity = 0.85 * (1 - prog * 0.7);
      wire.material.opacity = 0.6 * (1 - prog * 0.6);
      inner.material.opacity = 0.3 * (1 - prog * 0.6);
      vMat.opacity = 1 - prog * 0.7;

      // Particle text: assemble on load, scatter on scroll.
      if (textPts) {
        const a = easeOut(Math.min((performance.now() - assembleAt) / 1500, 1));
        const tp = textPts.geometry.attributes.position.array;
        for (let i = 0; i < textCount; i++) {
          const k = i * 3;
          const hx = textHome[k] + (textScatter[k] - textHome[k]) * prog;
          const hy = textHome[k + 1] + (textScatter[k + 1] - textHome[k + 1]) * prog;
          const hz = textHome[k + 2] + textScatter[k + 2] * prog;
          tp[k] += (hx - tp[k]) * (0.06 + a * 0.12);
          tp[k + 1] += (hy - tp[k + 1]) * (0.06 + a * 0.12);
          tp[k + 2] += (hz - tp[k + 2]) * (0.06 + a * 0.12);
        }
        textPts.geometry.attributes.position.needsUpdate = true;
        textPts.material.opacity = (0.4 + 0.55 * a) * (1 - prog * 0.85);
      }

      composer.render();
    });

    NB.three.available = true;
    return true;
  };
})();
