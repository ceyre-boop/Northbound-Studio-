/* transitions.js — REAL 3D energy-trail transitions (Three.js + UnrealBloom).
   NB.transitions.play(type): a glowing TubeGeometry draws itself along a
   CatmullRomCurve3 swooping through 3D space (with a bright travelling head),
   rendered through a dedicated EffectComposer+bloom on the .fx__canvas overlay.
   Idle until fired; only renders during the ~0.7s transition. RM → no-op. */
(function () {
  window.NB = window.NB || {};

  function glowTex() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(180,250,255,0.9)");
    g.addColorStop(1, "rgba(0,240,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  let R = null, raf = 0;
  function ensure() {
    if (R) return R;
    if (typeof THREE === "undefined" || !THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RenderPass) return null;
    const fx = document.querySelector(".fx");
    const canvas = fx && fx.querySelector(".fx__canvas");
    if (!canvas) return null;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;
    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 1.7, 0.6, 0.0);
    composer.addPass(bloom);
    const tex = glowTex();
    function size() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
      camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
    }
    size();
    window.addEventListener("resize", size);
    R = { renderer, scene, camera, composer, bloom, fx, tex };
    return R;
  }

  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const PATHS = {
    swoosh: [[-5.5, 1.4, -1], [-2, -0.6, 0.7], [1.2, 0.9, -0.7], [5.5, -1.4, 0.7]],
    wipe: [[-5.5, 3, -1], [-1.5, 1, 0.7], [1.5, -1, -0.7], [5.5, -3, 0.9]],
    disintegrate: [[-4.5, -3, 0.6], [-1, 0, -1.1], [1, 0.4, 1.1], [4.5, 3, -0.7]],
    scan: [[-5.5, 2.2, 0.7], [-1.6, 0.4, -0.9], [1.6, -0.4, 0.9], [5.5, -2.2, -0.7]],
  };

  function play(type) {
    if (NB.reduceMotion || NB.skipThree) return; // mobile/RM get no Three at all
    const r = ensure();
    if (!r) return;
    const curve = new THREE.CatmullRomCurve3((PATHS[type] || PATHS.swoosh).map(V));
    const geo = new THREE.TubeGeometry(curve, 180, 0.085, 12, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0x66fbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
    const tube = new THREE.Mesh(geo, mat);
    const idxCount = geo.index ? geo.index.count : 0;
    geo.setDrawRange(0, 0);
    r.scene.add(tube);

    const headGeo = new THREE.BufferGeometry();
    headGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    const head = new THREE.Points(headGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, map: r.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    r.scene.add(head);

    r.fx.classList.add("is-on");
    const start = performance.now(), dur = 720;
    function clean() {
      r.scene.remove(tube); geo.dispose(); mat.dispose();
      r.scene.remove(head); headGeo.dispose(); head.material.dispose();
      r.renderer.clear();
      r.fx.classList.remove("is-on");
    }
    function frame() {
      const e = Math.min((performance.now() - start) / dur, 1);
      const grow = Math.min(e / 0.6, 1);
      const fade = e < 0.6 ? 1 : 1 - (e - 0.6) / 0.4;
      geo.setDrawRange(0, Math.floor(idxCount * grow));
      mat.opacity = fade;
      const hp = curve.getPoint(grow);
      headGeo.attributes.position.setXYZ(0, hp.x, hp.y, hp.z);
      headGeo.attributes.position.needsUpdate = true;
      head.material.opacity = fade;
      r.composer.render();
      if (e < 1) raf = requestAnimationFrame(frame);
      else clean();
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  NB.transitions = { play };
})();
