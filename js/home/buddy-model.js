/* js/home/buddy-model.js — the real Buddy, rigged and moving.
 *
 * brand/3d/buddy.glb is Colin's Buddy (brand-src/buddy/animationsss.obj,
 * converted by scripts/buddy-obj-to-glb.ts): a rigid-part robot with a ball
 * at every joint, plus his desk, chair, keyboard, monitor and mug. The file
 * holds one pose; the motion is made here. Each part is hung on a pivot at
 * its joint's ball, and the limbs are solved with two-bone IK against real
 * targets, so his hands land on his own keyboard and his feet stay planted:
 *
 *   const buddy = await loadBuddy(T, loader);
 *   buddy.object        Buddy (origin between his feet, facing +Z)
 *   buddy.props         desk, keyboard, monitor, mug and chair, rotated so the
 *                       desk is in front of him (+Z); buddy.chair moves alone
 *   buddy.pose({ t, sit, walk, phase })   same contract as the old graybox
 *   buddy.STRIDE, buddy.HEIGHT, buddy.screen, buddy.screenGlow
 *
 * The file's own layout puts the desk at Buddy's side (+X); turning the
 * props -90° about Y puts it in front of him, which is how he sits to type.
 */

export async function loadBuddy(T, loader, url = '/brand/3d/buddy.glb') {
  const gltf = await loader.loadAsync(url);
  const info = gltf.scene.userData.buddy || (gltf.parser.json.scenes[0].extras || {}).buddy;
  if (!info) throw new Error('buddy.glb has no rig data');
  const V = (a) => new T.Vector3(a[0], a[1], a[2]);
  const piv = Object.fromEntries(Object.entries(info.pivots).map(([k, v]) => [k, V(v)]));

  // --- the hierarchy: a group per joint, at its pivot ---------------------------
  const object = new T.Group();
  const J = {};
  const PARENT = {
    pelvis: null, waist: 'pelvis', chest: 'waist', neck: 'chest', head: 'neck',
    shoulder_L: 'chest', elbow_L: 'shoulder_L', wrist_L: 'elbow_L',
    shoulder_R: 'chest', elbow_R: 'shoulder_R', wrist_R: 'elbow_R',
    hip_L: 'pelvis', knee_L: 'hip_L', ankle_L: 'knee_L',
    hip_R: 'pelvis', knee_R: 'hip_R', ankle_R: 'knee_R',
  };
  for (const name of Object.keys(PARENT)) {
    const g = new T.Group();
    g.name = name;
    const parent = PARENT[name] ? J[PARENT[name]] : object;
    const parentPivot = PARENT[name] ? piv[PARENT[name]] : new T.Vector3();
    g.position.copy(piv[name]).sub(parentPivot);
    parent.add(g);
    J[name] = g;
  }
  object.updateMatrixWorld(true);

  // --- hang the meshes on their joints (keeping where they are), props aside ----
  const props = new T.Group();
  const chair = new T.Group();
  props.add(chair);
  let screen = null, screenGlow = null;
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  gltf.scene.updateMatrixWorld(true);
  for (const m of meshes) {
    const joint = (m.userData && m.userData.joint) || m.name.split('|')[0];
    if (J[joint]) J[joint].attach(m);
    else if (joint === 'prop_chair') chair.attach(m);
    else if (joint.startsWith('prop_')) {
      props.attach(m);
      if (joint === 'prop_screen') { screen = m; screenGlow = m.material; }
    }
    // Emissive parts glow at full strength regardless of the scene's exposure.
    if (m.material && m.material.emissive && m.material.emissive.getHex() !== 0) m.material.toneMapped = false;
  }
  // The file has the desk at his side (+X); turn it to stand in front of him.
  props.rotation.y = -Math.PI / 2;
  if (screenGlow && screenGlow.emissive) screenGlow.color.setRGB(0, 0, 0);
  object.updateMatrixWorld(true);

  // --- rest-pose bone directions, for the IK ---------------------------------------
  const rest = {};
  for (const s of ['L', 'R']) {
    rest['upper' + s] = piv['elbow_' + s].clone().sub(piv['shoulder_' + s]);
    rest['fore' + s] = V(info.handTip[s]).sub(piv['elbow_' + s]);
    rest['thigh' + s] = piv['knee_' + s].clone().sub(piv['hip_' + s]);
    rest['shin' + s] = piv['ankle_' + s].clone().sub(piv['knee_' + s]);
  }
  const len = (v) => v.length();

  // --- two-bone IK ------------------------------------------------------------------
  // Solve in the rig's own space (object), then express each joint's rotation
  // in its parent's frame as the minimal turn from its rest direction.
  const _q = new T.Quaternion(), _qp = new T.Quaternion(), _qi = new T.Quaternion();
  const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), _p = new T.Vector3(), _e = new T.Vector3();
  const objQ = new T.Quaternion();
  function rigQuat(g, out) {                 // g's world rotation relative to the rig
    g.getWorldQuaternion(out);
    object.getWorldQuaternion(objQ);
    return out.premultiply(objQ.invert());
  }
  function rigPos(g, out) { g.getWorldPosition(out); return object.worldToLocal(out); }

  function twoBone(root, mid, restA, restB, target, pole) {
    const S = rigPos(root, new T.Vector3());
    const L1 = len(restA), L2 = len(restB);
    _d.copy(target).sub(S);
    let dist = _d.length();
    dist = Math.min(Math.max(dist, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
    _d.normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _p.copy(pole).sub(S);
    _p.addScaledVector(_d, -_p.dot(_d)).normalize();
    const E = _e.copy(S).addScaledVector(_d, a).addScaledVector(_p, h);
    const T2 = _b.copy(S).addScaledVector(_d, dist);
    // Upper bone: rest direction -> S->E, in the parent's frame.
    rigQuat(root.parent, _qp);
    _qi.copy(_qp).invert();
    _a.copy(E).sub(S).normalize().applyQuaternion(_qi);
    root.quaternion.setFromUnitVectors(_q.set(0, 0, 0, 1) && restA.clone().normalize(), _a);
    // Lower bone: rest direction -> E->T, in the upper bone's frame.
    root.updateMatrixWorld(true);
    rigQuat(root, _qp);
    _qi.copy(_qp).invert();
    _a.copy(T2).sub(E).normalize().applyQuaternion(_qi);
    mid.quaternion.setFromUnitVectors(restB.clone().normalize(), _a);
    mid.updateMatrixWorld(true);
  }
  // Set a joint so its net rotation in the rig is `q` (feet flat, hands posed).
  function netRotation(g, q) {
    g.parent.updateMatrixWorld(true);
    rigQuat(g.parent, _qp);
    g.quaternion.copy(_qp.invert().multiply(q));
  }

  const lerp = (a, b, u) => a + (b - a) * u;
  const mix = (a, b, u) => new T.Vector3().lerpVectors(a, b, u);
  const e = new T.Euler();
  const qFrom = (x, y, z) => new T.Quaternion().setFromEuler(e.set(x, y, z));

  const HEIGHT = info.height;
  const STRIDE = 1.35;            // metres per full walk cycle (2π of phase)
  const seatHip = piv.pelvis.y;   // rest pelvis height
  // Where things are in Buddy's frame once the props are turned: the keyboard
  // is in front of him on the desk, the monitor beyond it.
  const KEYS = new T.Vector3(0, 0.955, 0.47);

  function pose({ t = 0, sit = 0, walk = 0, phase = 0 }) {
    // Pelvis: in the chair when seated, standing height otherwise, with a
    // small bob twice per step when walking.
    const bob = Math.abs(Math.cos(phase)) * 0.03 * walk;
    J.pelvis.position.set(0, lerp(lerp(seatHip - 0.02, seatHip - 0.06 + bob, walk), 0.6, sit), lerp(0, -0.04, sit));
    J.waist.rotation.set(lerp(0.03 * walk, 0.1, sit), 0, 0);
    J.chest.rotation.set(lerp(0, 0.04, sit), Math.sin(phase) * 0.06 * walk, 0);
    // Head: on the monitor while typing, a little life in it.
    J.head.rotation.set(lerp(0.02, 0.12 + Math.sin(t * 0.8) * 0.03, sit), Math.sin(t * 0.37) * 0.05 * sit, 0);
    object.updateMatrixWorld(true);

    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 1 : -1;
      // --- legs ---
      const hipP = rigPos(J['hip_' + s], new T.Vector3());
      const restFoot = V(info.footTip[s]);
      // Standing: foot under the hip. Walking: a gait ellipse, the far foot
      // lifting on its swing. Seated: feet planted forward of the chair.
      const ph = phase + (s === 'L' ? 0 : Math.PI);
      const walkFoot = new T.Vector3(restFoot.x, 0.02 + Math.max(0, -Math.sin(ph)) * 0.16, restFoot.z + Math.cos(ph) * STRIDE / 4);
      const standFoot = new T.Vector3(restFoot.x, 0.02, restFoot.z);
      const seatFoot = new T.Vector3(restFoot.x * 1.08, 0.02, 0.5);
      const foot = mix(mix(standFoot, walkFoot, walk), seatFoot, sit);
      const ankleTarget = foot.clone(); ankleTarget.y += piv['ankle_' + s].y - 0.02;
      const kneePole = hipP.clone().add(new T.Vector3(side * 0.05, -0.2, 1.5));
      twoBone(J['hip_' + s], J['knee_' + s], rest['thigh' + s], rest['shin' + s], ankleTarget, kneePole);
      netRotation(J['ankle_' + s], qFrom(0, 0, 0));

      // --- arms ---
      // Typing: hands on the keys, fingers busy (the hands tap in turn).
      const tap = Math.max(0, Math.sin(t * 11 + (s === 'L' ? 0 : 2.1))) * 0.018;
      const keyHand = KEYS.clone().add(new T.Vector3(side * 0.16 + Math.sin(t * 1.3 + side) * 0.02, 0.02 + tap, Math.sin(t * 0.9 + side) * 0.015));
      // Standing: hands hang a little forward of the hips. Walking: they swing
      // against the legs.
      const shoulderP = rigPos(J['shoulder_' + s], new T.Vector3());
      const hangHand = new T.Vector3(side * 0.33, shoulderP.y - 0.68, 0.06);
      const swing = Math.cos(ph + Math.PI) * 0.22;
      const walkHand = new T.Vector3(side * 0.31, shoulderP.y - 0.66, 0.05 + swing);
      const hand = mix(mix(hangHand, walkHand, walk), keyHand, sit);
      const elbowPole = shoulderP.clone().add(new T.Vector3(side * 0.9, -0.3, -0.9));
      twoBone(J['shoulder_' + s], J['elbow_' + s], rest['upper' + s], rest['fore' + s], hand, elbowPole);
      // Palms down on the keys; relaxed and inward when not typing.
      const qType = qFrom(-0.25, 0, side * 0.1);
      const qRest = qFrom(0, 0, 0);
      netRotation(J['wrist_' + s], qRest.slerp(qType, sit));
    }
  }

  pose({ sit: 1 });
  return { object, props, chair, screen, screenGlow, pose, STRIDE, HEIGHT, joints: J };
}
