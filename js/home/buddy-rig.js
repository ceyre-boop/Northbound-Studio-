/* js/home/buddy-rig.js — the stand-in Buddy, until the animator's GLB lands.
 *
 * A faceted graybox built from primitives in Buddy's proportions and colours
 * (navy armour, graphite limbs, the lilac visor; see brand/ and the
 * buddy-identity note: the navy robot, never the teal one). It is animated
 * procedurally from joint angles, so the choreography can be judged now and
 * the real rig can take its place later behind the same interface:
 *
 *   const rig = makeGrayboxBuddy(T);
 *   rig.object          // THREE.Group, origin between the feet, facing +Z
 *   rig.pose({ t, sit, walk, phase })
 *        t      seconds, for the typing loop's own clock
 *        sit    1 = seated typing, 0 = standing
 *        walk   0..1 blend into the walk cycle
 *        phase  walk-cycle phase in radians (2π per stride pair)
 *   rig.STRIDE          // metres travelled per 2π of phase, for foot-locked travel
 *
 * Sign convention: a group's local +Y is "up the limb" for the torso and head,
 * "down the limb" is -Y for arms and legs, and the body faces +Z. Rotating an
 * up-pointing part by +x tips it forward; a down-pointing part swings forward
 * with -x.
 */

const NAVY = 0x2c3cae;
const NAVY_DEEP = 0x222e86;
const GRAPHITE = 0x565661;
const GRAPHITE_DARK = 0x3e3e47;
const VISOR = 0xa596ff;

export function makeGrayboxBuddy(T) {
  const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, metalness: 0.28, ...extra });
  const M = {
    navy: mat(NAVY),
    navyDeep: mat(NAVY_DEEP),
    graphite: mat(GRAPHITE, { roughness: 0.62 }),
    graphiteDark: mat(GRAPHITE_DARK, { roughness: 0.7 }),
    glow: new T.MeshBasicMaterial({ color: VISOR, toneMapped: false }),
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const joint = (parent, x, y, z) => { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const object = new T.Group();
  const J = {};

  // Pelvis: the rig's height is driven by moving this.
  J.pelvis = joint(object, 0, 0.98, 0);
  J.pelvis.add(box(0.36, 0.14, 0.24, M.graphite));
  J.pelvis.add(box(0.3, 0.12, 0.08, M.navy, 0, -0.01, 0.12));           // front plate

  // Torso: abdomen, chest, the armour and the light strips.
  J.waist = joint(J.pelvis, 0, 0.07, 0);
  J.waist.add(box(0.26, 0.2, 0.2, M.graphiteDark, 0, 0.1, 0));
  J.chest = joint(J.waist, 0, 0.2, 0);
  J.chest.add(box(0.5, 0.34, 0.3, M.navy, 0, 0.17, 0.01));
  J.chest.add(box(0.36, 0.2, 0.06, M.navyDeep, 0, 0.13, 0.17));
  J.chest.add(box(0.09, 0.012, 0.02, M.glow, -0.1, 0.2, 0.2));
  J.chest.add(box(0.09, 0.012, 0.02, M.glow, 0.1, 0.2, 0.2));
  J.chest.add(box(0.2, 0.08, 0.05, M.graphite, 0, 0.3, 0.14));            // collar

  // Head: graphite skull, navy crest, the visor, two ear fins.
  J.neck = joint(J.chest, 0, 0.36, 0);
  J.neck.add(box(0.1, 0.06, 0.1, M.graphiteDark, 0, 0.03, 0));
  J.head = joint(J.neck, 0, 0.06, 0);
  J.head.add(box(0.2, 0.22, 0.22, M.graphite, 0, 0.11, 0));
  J.head.add(box(0.22, 0.06, 0.24, M.navy, 0, 0.21, 0));
  J.head.add(box(0.1, 0.09, 0.02, M.glow, 0, 0.12, 0.115));
  J.head.add(box(0.04, 0.14, 0.12, M.navy, -0.13, 0.13, -0.01));
  J.head.add(box(0.04, 0.14, 0.12, M.navy, 0.13, 0.13, -0.01));
  J.head.add(box(0.02, 0.1, 0.02, M.graphiteDark, -0.13, 0.26, -0.03));   // antennae
  J.head.add(box(0.02, 0.1, 0.02, M.graphiteDark, 0.13, 0.26, -0.03));

  // Arms: pauldron, upper arm, gauntlet, hand.
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = joint(J.chest, s * 0.31, 0.3, 0);
    sh.add(box(0.2, 0.14, 0.24, M.navy, s * 0.03, 0.02, 0));
    const el = joint(sh, 0, -0.3, 0);
    sh.add(box(0.1, 0.28, 0.11, M.graphite, 0, -0.15, 0));
    el.add(box(0.13, 0.26, 0.13, M.navy, 0, -0.13, 0));
    el.add(box(0.1, 0.1, 0.12, M.graphiteDark, 0, -0.3, 0.01));
    J['shoulder' + k] = sh;
    J['elbow' + k] = el;
  }

  // Legs: thigh plate, shin armour, foot.
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const hip = joint(J.pelvis, s * 0.12, -0.04, 0);
    hip.add(box(0.14, 0.44, 0.15, M.graphite, 0, -0.22, 0));
    hip.add(box(0.15, 0.3, 0.06, M.navy, 0, -0.2, 0.08));
    const knee = joint(hip, 0, -0.45, 0);
    knee.add(box(0.15, 0.42, 0.16, M.navy, 0, -0.21, 0.01));
    const ankle = joint(knee, 0, -0.43, 0);
    ankle.add(box(0.15, 0.08, 0.26, M.graphiteDark, 0, -0.03, 0.05));
    J['hip' + k] = hip;
    J['knee' + k] = knee;
    J['ankle' + k] = ankle;
  }

  const lerp = (a, b, u) => a + (b - a) * u;

  function pose({ t = 0, sit = 0, walk = 0, phase = 0 }) {
    // Seated and typing. Hands on a keyboard at desk height, forearms level,
    // a slight lean in, the head tipped toward the screen, fingers busy.
    const tap = (w) => Math.sin(t * 13 + w) * 0.035;
    const seat = {
      pelvisY: 0.53, lean: 0.12, head: 0.16,
      shoulderL: -0.55, shoulderR: -0.55, elbowL: -0.75 + tap(0), elbowR: -0.75 + tap(1.9),
      hipL: -1.52, hipR: -1.52, kneeL: 1.5, kneeR: 1.5,
    };
    seat.head += Math.sin(t * 0.9) * 0.025;
    // Standing: weight even, arms relaxed.
    const stand = {
      pelvisY: 0.98, lean: 0, head: 0.03,
      shoulderL: 0.04, shoulderR: 0.04, elbowL: -0.14, elbowR: -0.14,
      hipL: 0, hipR: 0, kneeL: 0.02, kneeR: 0.02,
    };
    // Walking: legs swing opposite, knees fold on the passing leg, arms
    // counter-swing, the pelvis bobs twice per cycle.
    const sL = Math.sin(phase), sR = Math.sin(phase + Math.PI);
    const walkP = {
      pelvisY: 0.97 + Math.abs(Math.cos(phase)) * 0.025, lean: 0.05, head: 0.04,
      shoulderL: -0.34 * sR, shoulderR: -0.34 * sL, elbowL: -0.3, elbowR: -0.3,
      hipL: -0.46 * sL, hipR: -0.46 * sR,
      kneeL: 0.08 + 0.62 * Math.max(0, Math.cos(phase)), kneeR: 0.08 + 0.62 * Math.max(0, -Math.cos(phase)),
    };
    const P = {};
    for (const key in stand) {
      const standing = lerp(stand[key], walkP[key], walk);
      P[key] = lerp(standing, seat[key], sit);
    }
    J.pelvis.position.y = P.pelvisY;
    J.waist.rotation.x = P.lean;
    J.head.rotation.x = P.head;
    J.shoulderL.rotation.x = P.shoulderL; J.shoulderR.rotation.x = P.shoulderR;
    J.elbowL.rotation.x = P.elbowL; J.elbowR.rotation.x = P.elbowR;
    J.hipL.rotation.x = P.hipL; J.hipR.rotation.x = P.hipR;
    J.kneeL.rotation.x = P.kneeL; J.kneeR.rotation.x = P.kneeR;
    // Feet stay flat: undo the leg's net swing at the ankle.
    J.ankleL.rotation.x = -(P.hipL + P.kneeL);
    J.ankleR.rotation.x = -(P.hipR + P.kneeR);
  }

  pose({ sit: 1 });
  return { object, pose, STRIDE: 1.1, materials: M };
}

/* The desk, chair and monitor Buddy works at. Local frame: Buddy's seat at
   the origin facing +Z, the desk in front of him. The monitor's glow is a
   separate material so the scene can pulse it while he types. */
export function makeStation(T) {
  const station = new T.Group();
  const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, flatShading: true, ...extra });
  const desk = mat(0xeef3f1, { roughness: 0.4 });
  const frame = mat(0x4a4f57);
  const metal = mat(0x8d949b, { metalness: 0.6, roughness: 0.35 });
  const screenGlow = new T.MeshBasicMaterial({ color: 0x9ff0e1, toneMapped: false });
  const box = (w, h, d, m, x, y, z) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); station.add(b); return b; };

  box(1.1, 0.035, 0.56, desk, 0, 0.74, 0.62);          // desk top
  for (const x of [-0.5, 0.5]) for (const z of [0.4, 0.84]) box(0.03, 0.72, 0.03, metal, x, 0.36, z);   // slim legs
  box(0.5, 0.02, 0.16, frame, 0, 0.77, 0.47);          // keyboard
  box(0.05, 0.22, 0.05, frame, 0, 0.87, 0.82);         // monitor stand
  box(0.22, 0.015, 0.16, frame, 0, 0.765, 0.82);
  box(0.58, 0.35, 0.025, frame, 0, 1.1, 0.8);          // monitor body
  const screen = box(0.55, 0.32, 0.005, screenGlow, 0, 1.1, 0.785);   // faces Buddy (-Z)

  const chair = new T.Group();
  const add = (w, h, d, m, x, y, z) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); chair.add(b); };
  add(0.48, 0.06, 0.46, frame, 0, 0.46, -0.02);        // seat
  add(0.46, 0.5, 0.05, frame, 0, 0.78, -0.26);         // back
  add(0.05, 0.4, 0.05, frame, 0, 0.23, -0.02);         // post
  add(0.5, 0.03, 0.08, frame, 0, 0.03, -0.02);         // base
  add(0.08, 0.03, 0.5, frame, 0, 0.03, -0.02);
  station.add(chair);

  return { object: station, screen, chair, screenGlow };
}
