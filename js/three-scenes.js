/* three-scenes.js — the hero 3D scene (Three.js r128, global THREE).
   A glowing wireframe icosahedron rotates and tilts toward the cursor,
   wrapped in a cloud of orbiting particles. burst() throws the particles
   outward then back (the boot N-explosion). Scroll compresses the sphere
   into the transition. Registers its render via NB.onFrame. */
(function () {
  window.NB = window.NB || {};
  NB.three = { available: false };

  NB.three.init = function (canvas) {
    if (typeof THREE === "undefined" || !canvas) return false;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) { return false; }
    if (!renderer.getContext()) return false;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(DPR);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 6;

    // Wireframe icosahedron core.
    const ico = new THREE.IcosahedronGeometry(2.1, 1);
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(ico),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.55 })
    );
    const innerWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.35, 0)),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.25 })
    );
    const group = new THREE.Group();
    group.add(wire); group.add(innerWire);
    scene.add(group);

    // Orbiting particle cloud (each has a home on a shell + a burst vector).
    const COUNT = 1400;
    const positions = new Float32Array(COUNT * 3);
    const home = new Float32Array(COUNT * 3);
    const burstDir = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 2.6 + Math.random() * 2.4;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th), y = r * Math.sin(ph) * Math.sin(th), z = r * Math.cos(ph);
      home[i * 3] = x; home[i * 3 + 1] = y; home[i * 3 + 2] = z;
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      const bl = 5 + Math.random() * 7;
      burstDir[i * 3] = (x / r) * bl; burstDir[i * 3 + 1] = (y / r) * bl; burstDir[i * 3 + 2] = (z / r) * bl;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pmat = new THREE.PointsMaterial({ color: 0x9af6ff, size: 0.045, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(pgeo, pmat);
    scene.add(points);

    let W = 0, H = 0;
    function resize() {
      const hero = document.getElementById("hero");
      W = window.innerWidth; H = (hero ? hero.clientHeight : window.innerHeight) || window.innerHeight;
      renderer.setSize(W, H, false);
      camera.aspect = W / Math.max(H, 1); camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    let burst = 0; // 0..1 explosion amount, eased back to 0
    NB.three.burst = function () { burst = 1; };

    let t = 0, mx = 0, my = 0;
    NB.onFrame(function render(dt) {
      t += dt;
      const p = NB.pointer;
      mx += ((p.nx || 0) - mx) * 0.05;
      my += ((p.ny || 0) - my) * 0.05;

      // Hero scroll progress (0 at top → 1 as it leaves) compresses the sphere.
      const prog = Math.min((NB.scrollY || 0) / Math.max(window.innerHeight, 1), 1);
      group.rotation.y += dt * 0.18;
      group.rotation.x = my * 0.5;
      group.rotation.z = mx * 0.3;
      const squash = 1 - prog;
      group.scale.set(squash, 1 + prog * 1.6, squash);
      group.position.y = -prog * 2;
      points.rotation.y -= dt * 0.04;
      points.rotation.x = my * 0.3;

      burst *= 0.94;
      if (burst < 0.001) burst = 0;
      const pos = pgeo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        const k = i * 3;
        const hx = home[k] * (1 - prog * 0.4), hy = home[k + 1] * (1 - prog * 0.4), hz = home[k + 2];
        pos[k] = hx + burstDir[k] * burst;
        pos[k + 1] = hy + burstDir[k + 1] * burst;
        pos[k + 2] = hz + burstDir[k + 2] * burst;
      }
      pgeo.attributes.position.needsUpdate = true;
      pmat.opacity = 0.9 * (1 - prog * 0.7);
      wire.material.opacity = 0.55 * (1 - prog * 0.6);
      innerWire.material.opacity = 0.25 * (1 - prog * 0.6);

      renderer.render(scene, camera);
    });

    NB.three.available = true;
    return true;
  };
})();
