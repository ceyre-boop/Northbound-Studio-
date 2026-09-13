/* BUDDY — the studio's mascot.
 *
 * This file used to draw a procedural robot arm: capsules as signed distance
 * fields, two-bone IK, the whole rig solved every frame. It was a nice piece of
 * engineering and it was not the mascot. BUDDY already existed — three rendered
 * poses of a blue mech that have been in this repo the whole time — and a
 * character somebody designed beats a mechanism nobody asked for.
 *
 * So this is DOM, not WebGL, and that is the right call rather than a
 * concession. The art is a raster with an alpha channel and hard mechanical
 * edges; pushing it through a texture upload to composite it against a shader
 * world would cost frame budget, cost texture memory, and make it softer than
 * the browser will render it for free. An <img> is crisper, cheaper and
 * swappable. draw() is deliberately a no-op: the act still calls it, and this
 * mascot has nothing to do inside the GL frame.
 *
 * The three poses map to what the procession is doing:
 *
 *   thinking   arms crossed. The resting state, and what he does while a card
 *              is open and the visitor is reading — attentive, not performing.
 *   salute     a brief acknowledgement when a new offering reaches centre.
 *              Under a second, then back to thinking.
 *   awesome    hands on hips, presenting, while you are hovering an offering.
 *
 * Nothing here is load-bearing. Every content path works with the mascot
 * absent, and the mount node is aria-hidden: he is decoration, and decoration
 * that throws must never take the procession down with it.
 */

var POSES = {
  thinking: { src: 'buddy-thinking-sm.webp', w: 200 },
  salute:   { src: 'buddy-salute-sm.webp',   w: 200 },
  awesome:  { src: 'buddy-awesome-320w.webp', w: 320 }
};

/* How long a one-shot pose holds before falling back to the resting one. */
var SALUTE_MS = 900;
var REACT_MS = 620;

export function create(ctx) {
  var mount = ctx && ctx.root ? ctx.root.querySelector('#nb-mascot-mount') : null;
  if (!mount) return null;

  var m = {
    mount: mount,
    imgs: {},
    /* null, not 'thinking'. apply() early-returns when the pose is already the
       one being asked for, so seeding this with the resting pose made the
       opening apply() a no-op and no image ever got the visible class. In full
       motion that hid him only until the first panel change swapped him to
       salute and back; in reduced motion, where update() never runs and
       drawStill() only ever asks for 'thinking', it hid him completely. */
    pose: null,
    until: 0,          // ms timestamp a one-shot pose expires
    lean: 0,           // -1..1, toward the panel being attended to
    leanShown: -999,
    bob: 0,
    reduced: ctx.mode === 'reduced',
    shake: 0
  };

  mount.setAttribute('data-buddy', '');
  if (m.reduced) mount.setAttribute('data-still', '');

  /* All three poses live in the DOM at once and cross-fade by opacity. Swapping
     a single img's src would show a blank frame on the first switch, which is
     exactly the moment the visitor is looking at him. */
  Object.keys(POSES).forEach(function (name) {
    var img = document.createElement('img');
    img.src = POSES[name].src;
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'eager';
    img.width = POSES[name].w;
    img.className = 'buddy__pose';
    img.setAttribute('data-pose', name);
    mount.appendChild(img);
    m.imgs[name] = img;
  });

  apply(m, 'thinking');
  return m;
}

export function resize() { /* sizing is entirely CSS; nothing to recompute */ }

function apply(m, pose) {
  if (m.pose === pose) return;
  m.pose = pose;
  Object.keys(m.imgs).forEach(function (name) {
    m.imgs[name].classList.toggle('is-on', name === pose);
  });
}

/** Which pose the current state asks for, ignoring one-shots. */
function restingPose(state) {
  if (!state) return 'thinking';
  if (state.open >= 0) return 'thinking';   // he watches while you read
  if (state.hover >= 0) return 'awesome';   // presenting the one under your cursor
  return 'thinking';
}

export function update(m, dt, state) {
  if (!m) return;
  var now = performance.now();

  if (now >= m.until) apply(m, restingPose(state));

  /* Lean toward whatever he is attending to. Quantised before it reaches the
     DOM: a style write every frame on a 16-screen document is exactly the kind
     of per-frame layout cost that took this site from 120fps to 18 once
     already, and a mascot leaning in 24 discrete steps is indistinguishable
     from one leaning continuously. */
  if (!m.reduced && state && state.panels && state.panels.length) {
    var watch = state.open >= 0 ? state.open : (state.hover >= 0 ? state.hover : state.centre);
    var p = state.panels[watch];
    if (p) {
      var target = Math.max(-1, Math.min(1, (p.cx - window.innerWidth * 0.5) / (window.innerWidth * 0.5)));
      m.lean += (target - m.lean) * Math.min(1, dt * 3.2);
    }
    m.bob += dt;
  }

  if (m.shake > 0) m.shake = Math.max(0, m.shake - dt * 1.6);

  var q = Math.round(m.lean * 24) / 24;
  if (q !== m.leanShown) {
    m.leanShown = q;
    m.mount.style.setProperty('--buddy-lean', q.toFixed(3));
  }
  var s = Math.round(m.shake * 20) / 20;
  if (s !== m.shakeShown) {
    m.shakeShown = s;
    m.mount.style.setProperty('--buddy-shake', s.toFixed(2));
  }
}

/* No GL. The act calls this inside its draw(); there is nothing to submit. */
export function draw() {}

/** Reduced motion: one composed pose, arms crossed, no bob and no lean. */
export function drawStill(m) {
  if (!m) return;
  apply(m, 'thinking');
  m.mount.style.setProperty('--buddy-lean', '0');
  m.mount.style.setProperty('--buddy-shake', '0');
}

/**
 * The procession talking to him. Called by the act for 'hover', 'focus',
 * 'open' and 'throw'.
 */
export function on(m, event, index) {
  if (!m) return;
  var now = performance.now();
  if (event === 'focus') {
    /* A new offering has arrived at centre. Acknowledge it, briefly. */
    apply(m, 'salute');
    m.until = now + SALUTE_MS;
  } else if (event === 'open') {
    apply(m, 'awesome');
    m.until = now + REACT_MS;
  } else if (event === 'throw') {
    apply(m, 'awesome');
    m.until = now + REACT_MS;
    m.shake = 1;
  }
  /* 'hover' needs no one-shot: restingPose() reads state.hover every frame, so
     he holds the pose while the cursor is on a panel and drops it the moment it
     leaves. A one-shot would stick, because there is no hover-end event. */
  void index;
}

export function dispose(m) {
  if (!m) return;
  try {
    while (m.mount.firstChild) m.mount.removeChild(m.mount.firstChild);
    m.mount.removeAttribute('data-buddy');
    m.mount.removeAttribute('data-still');
    m.mount.style.removeProperty('--buddy-lean');
    m.mount.style.removeProperty('--buddy-shake');
  } catch (e) { /* the page is going away; nothing here is worth throwing over */ }
  m.imgs = {};
}
