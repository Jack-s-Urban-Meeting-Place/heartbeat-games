// ============================================================================
// cat.js: a cat that prowls, sits, looks around, crouches and pounces
// ----------------------------------------------------------------------------
// Drawn from the Cat_walking and Cat_jumping storyboards (storyboards/climb-together/):
// a sly, narrow-eyed prowler with a curling tail, and an arched, hissing pounce with
// claws out. In its own space it stands on the ground (y = 0) facing -z.
// Size: 1 unit = from its chest to its hips; the game scales it.
//
//   const cat = new HG.Cat();  scene.add(cat.root);
//   cat.controls.mode = "stand" | "walk" | "sit" | "crouch" | "leap"
//   cat.controls.speed = units per second while walking (sets the pace of its legs)
//   cat.controls.look = -1..1   head turned to its left (-) or right (+)
//   cat.controls.hiss = 0..1    mouth open, ears back, tail puffed
//   cat.controls.squint = 0..1  sly half-closed eyes (as in the storyboard)
//   cat.update(dt);
//
// It has a skeleton of named joints (cat.joints: body, neck, head, jaw, ear.0/1, eye.0/1,
// lidU.0/1, lidL.0/1, tail.0-13, and leg.0-3 .upper/.lower/.paw, plus .hock on the back legs;
// legs 0-1 are the front, 0 and 2 on its left). Version 2's look is a skin made in Blender
// (games/lib/cat-model.js, from blender/build_cat.py) that moves with those joints: a fluffy
// grey tabby, from the references described in storyboards/cat-model/README.md. Without it
// (or with { model: "v1" }) the cat is built from simple shapes here (games/lib/creature-kit.js).
// ============================================================================
HG.Cat = (function () {
  const K = HG.kit;
  // ---- Tuning: how it moves -------------------------------------------------
  const STRIDE = 0.55;               // how far each foot steps while walking (body lengths)
  const EASE = 6;                    // how quickly it moves between poses (higher = snappier)
  const TAIL_SWISH = 0.25;           // how much the tail tip swishes (radians)
  const TAIL_PUFF = 0.9;             // how much fatter the tail gets when it hisses (0.9 = 90%)
  const FUR_BUMPS = 0.15;            // version 2: how strongly the fine fur stands out
  const SIT_HEIGHT = 0.48;           // how high the body sits when sitting (so its bottom rests on the floor)...
  const CROUCH_HEIGHT = 0.43;        // ...and when crouching
  const LEAP_EARS = 0.85;            // how flat the ears go back in a leap (0 = up, 1 = flat)
  // ---- Tuning: how it looks (version 1, the shapes built here) -----------------
  const FUR = 0x77706b;              // grey tabby...
  const STRIPES = 0x4b4643;          // ...with darker stripes over the back
  const CREAM = 0xe6d8c4;            // chest, muzzle and paws
  const EYES = 0xb8d13c;             // yellow-green
  const PINK = 0xd99a9a;             // nose and inner ears
  // ----------------------------------------------------------------------------

  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const ease = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const TAU = Math.PI * 2;

  // Version 1's torso, from the hips (+z) to the chest (-z): z, half-width, half-height.
  const TORSO = [[0.52, 0.13, 0.14], [0.42, 0.18, 0.2], [0.2, 0.19, 0.21], [-0.05, 0.18, 0.2], [-0.3, 0.19, 0.23], [-0.46, 0.17, 0.22], [-0.56, 0.12, 0.17]];
  // Legs: where each joins the body (body space), and bone lengths. Front legs: shoulder → elbow → wrist,
  // elbow pointing back. Back legs: hip → knee → hock, knee pointing forward, then the hock down to the paw.
  const LEGS = [
    { root: V(-0.11, -0.08, -0.4), a: 0.3, b: 0.3, front: true, rest: V(-0.11, 0, -0.42) },
    { root: V(0.11, -0.08, -0.4), a: 0.3, b: 0.3, front: true, rest: V(0.11, 0, -0.42) },
    { root: V(-0.12, -0.04, 0.4), a: 0.3, b: 0.3, front: false, rest: V(-0.12, 0, 0.4) },
    { root: V(0.12, -0.04, 0.4), a: 0.3, b: 0.3, front: false, rest: V(0.12, 0, 0.4) }
  ];
  const HOCK = V(0, 0.2, 0.08);      // a back leg's hock, from its paw
  const GAIT = [0.25, 0.75, 0.5, 0];       // walking: back-left, front-left, back-right, front-right, a quarter apart
  const TAIL_POINTS = 14;
  const TAIL_SEGMENT = 0.075;
  const NECK_AT = V(0, 0.1, -0.52), HEAD_AT = V(0, 0.12, -0.1), JAW_AT = V(0, -0.09, -0.07);
  const EAR_AT = [-1, 1].map((side) => V(side * 0.11, 0.13, 0.0));
  const EYE_AT = [-1, 1].map((side) => V(side * 0.085, 0.02, -0.15));

  class Cat {
    constructor(options = {}) {
      this.controls = { mode: "stand", speed: 0, look: 0, hiss: 0, squint: 0.4 };
      this.t = 0; this.phase = 0; this.hiss = 0; this.squint = 0.4; this.look = 0;
      this.weights = { stand: 1, walk: 0, sit: 0, crouch: 0, leap: 0 };
      this.geos = []; this.mats = [];
      this.root = new THREE.Group();

      // ---- The skeleton ----
      this.joints = {};
      const joint = (name, parent, at) => { const g = new THREE.Group(); g.name = name; if (at) g.position.copy(at); this.joints[name] = g; parent.add(g); return g; };
      this.body = joint("body", this.root);
      this.neck = joint("neck", this.body, NECK_AT);
      this.head = joint("head", this.neck, HEAD_AT);
      this.jaw = joint("jaw", this.head, JAW_AT);
      this.ears = [-1, 1].map((side, i) => ({ side, ear: joint("ear." + i, this.head, EAR_AT[i]) }));
      this.eyes = [-1, 1].map((side, i) => {
        const g = joint("eye." + i, this.head, EYE_AT[i]); g.rotation.y = side * -0.25;
        return { side, g, upper: joint("lidU." + i, g), lower: joint("lidL." + i, g) };
      });
      this.tailJoints = [];
      for (let i = 0; i < TAIL_POINTS; i++) this.tailJoints.push(joint("tail." + i, this.body));
      this.legs = LEGS.map((spec, i) => ({
        spec, phase: GAIT[i],
        upper: joint("leg." + i + ".upper", this.root), lower: joint("leg." + i + ".lower", this.root),
        hock: spec.front ? null : joint("leg." + i + ".hock", this.root), paw: joint("leg." + i + ".paw", this.root)
      }));
      this.tailPoints = []; for (let i = 0; i < TAIL_POINTS; i++) this.tailPoints.push(V());
      this.tmp = { root: V(), knee: V(), end: V(), target: V(), pole: V(), hockTop: V(), pawAt: V(), side: V(1, 0, 0) };

      // ---- The look: version 2 (Blender) if it's loaded, else simple shapes ----
      this.skinned = options.model !== "v1" && !!HG.catModel;
      if (this.skinned) this.buildSkin(); else this.buildShapes(options);
      this.addWhiskers();
      this.update(0);
    }

    setLayer(n) { this.root.traverse((o) => o.layers.set(n)); }
    mat(p) { const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, p)); this.mats.push(m); return m; }

    // ---- Version 2: wrap the Blender-made skin around the skeleton ----
    buildSkin() {
      const model = HG.catModel, T = K.skinAssets(model).textures;
      this.bindPose();
      const fur = (map) => this.mat({ color: 0xffffff, map: map || null, bumpMap: T.furBump || null, bumpScale: FUR_BUMPS, roughness: 0.95 });
      const pick = {
        body: fur(T.body), head: fur(T.head), tail: fur(T.tail), leg: fur(T.leg), tuft: fur(T.tuft),
        lid: this.mat({ color: 0x5a5551, roughness: 0.95 }), paw: this.mat({ color: 0xa39a8e, roughness: 0.95 }),
        brow: this.mat({ color: 0x8a857e, roughness: 0.95 }),            // brows and ears: the head's grey
        cream: this.mat({ color: CREAM, roughness: 0.95 }), pink: this.mat({ color: PINK, roughness: 0.6 }),
        eye: this.mat({ color: 0xffffff, map: T.eye || null, roughness: 0.15, emissive: EYES, emissiveIntensity: 0.12 }),
        pupil: this.mat({ color: 0x0c0a0a, roughness: 0.1 }), mouth: this.mat({ color: 0x5e1a24, roughness: 0.7 }),
        teeth: this.mat({ color: 0xf6f1e6, roughness: 0.3 }), dark: this.mat({ color: 0x2a2624, roughness: 0.8 })
      };
      this.skin = K.bindSkin(this.root, model, this.joints, (name) => pick[name] || pick.body);
    }

    // ---- Version 1: simple shapes on the joints ----
    buildShapes(options) {
      const keep = (g) => (this.geos.push(g), g);
      const fur = this.mat({ color: options.fur || FUR }), cream = this.mat({ color: CREAM }), pink = this.mat({ color: PINK });
      const furSkin = this.mat({ color: 0xffffff, vertexColors: true });
      const dark = this.mat({ color: 0x151012, roughness: 0.4 }), mouth = this.mat({ color: 0x6a1f2a }), white = this.mat({ color: 0xffffff, roughness: 0.3 });
      const eyeMat = this.mat({ color: EYES, roughness: 0.2, emissive: EYES, emissiveIntensity: 0.15 });
      // Torso: a tube, darker stripes over the back, cream underneath.
      const torso = new K.Tube(TORSO.length, 14, furSkin, { colours: true });
      torso.set(TORSO.map(([z]) => V(0, 0, z)), TORSO.map(([, w, h]) => [w, h]), V(1, 0, 0));
      const base = new THREE.Color(options.fur || FUR), stripe = new THREE.Color(STRIPES), belly = new THREE.Color(CREAM);
      torso.paint((i, k, ang) => {
        const upward = -Math.sin(ang);                  // this tube's "out" side faces down, so flip it
        if (upward < -0.45) return belly.clone();
        return base.clone().lerp(stripe, upward > 0.2 && i % 2 === 1 ? 0.8 : 0);
      });
      keep(torso.geometry); this.body.add(torso.mesh);
      // Head, on a short neck.
      const ball = keep(new THREE.SphereGeometry(1, 16, 12));
      const neckMesh = new THREE.Mesh(ball, fur); neckMesh.scale.set(0.12, 0.14, 0.13); neckMesh.position.set(0, 0.04, -0.03); this.neck.add(neckMesh);
      const part = (geo, m, scale, at) => { const o = new THREE.Mesh(geo, m); o.scale.set(...scale); if (at) o.position.set(...at); return o; };
      this.head.add(part(ball, fur, [0.2, 0.17, 0.18]), part(ball, fur, [0.22, 0.12, 0.14], [0, -0.05, -0.04]),
        part(ball, cream, [0.1, 0.07, 0.08], [0, -0.07, -0.15]), part(ball, pink, [0.025, 0.018, 0.02], [0, -0.035, -0.225]));
      // Ears: pointed, pink inside.
      const earGeo = keep(new THREE.ConeGeometry(0.07, 0.15, 4)), innerGeo = keep(new THREE.ConeGeometry(0.045, 0.11, 4));
      for (const { ear } of this.ears) {
        const outer = new THREE.Mesh(earGeo, fur); outer.position.y = 0.06; outer.rotation.y = Math.PI / 4;
        const inner = new THREE.Mesh(innerGeo, pink); inner.position.set(0, 0.05, -0.022); inner.rotation.y = Math.PI / 4;
        ear.add(outer, inner);
      }
      // Eyes: yellow-green with slit pupils, and lids (domes over the eye) that narrow into a sly squint.
      const eyeGeo = keep(new THREE.SphereGeometry(0.042, 12, 10)), slit = keep(new THREE.BoxGeometry(0.012, 0.06, 0.01));
      const lidGeo = keep(new THREE.SphereGeometry(0.048, 12, 8, 0, TAU, 0, Math.PI / 2));
      for (const e of this.eyes) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.scale.set(1, 0.85, 0.7);
        const pupil = new THREE.Mesh(slit, dark); pupil.position.z = -0.031;
        e.g.add(eye, pupil); e.upper.add(new THREE.Mesh(lidGeo, fur)); e.lower.add(new THREE.Mesh(lidGeo, fur));
      }
      // Jaw: opens to hiss, showing a dark mouth and fangs.
      this.jaw.add(part(ball, cream, [0.07, 0.03, 0.09], [0, -0.01, -0.08]), part(ball, mouth, [0.06, 0.04, 0.07], [0, 0.02, -0.08]));
      const fang = keep(new THREE.ConeGeometry(0.009, 0.035, 5));
      for (const side of [-1, 1]) { const f = new THREE.Mesh(fang, white); f.position.set(side * 0.035, -0.08, -0.19); f.rotation.x = Math.PI; this.head.add(f); }
      // Legs: a bone on each joint, and a paw.
      const bone = keep(K.limbGeometry(0.7));
      for (const leg of this.legs) {
        const thick = leg.spec.front ? [0.08, 0.055] : [0.12, 0.065];
        const up = new THREE.Mesh(bone, fur); up.scale.set(thick[0], leg.spec.a, thick[0]); leg.upper.add(up);
        const low = new THREE.Mesh(bone, fur); low.scale.set(thick[1], leg.spec.b, thick[1]); leg.lower.add(low);
        if (leg.hock) { leg.hockMesh = new THREE.Mesh(bone, fur); leg.hockMesh.scale.set(0.048, HOCK.length(), 0.048); leg.hock.add(leg.hockMesh); }
        leg.paw.add(part(ball, cream, [0.065, 0.04, 0.08]));
      }
      // Tail: a ringed tube through the tail joints.
      this.tailTube = new K.Tube(TAIL_POINTS, 8, furSkin, { colours: true });
      this.tailTube.paint((i) => (i % 3 === 1 ? stripe.clone() : base.clone()));
      keep(this.tailTube.geometry); this.body.add(this.tailTube.mesh);
      this.tailRadii = []; for (let i = 0; i < TAIL_POINTS; i++) this.tailRadii.push(0.06);
    }

    // Whiskers (thin lines, in both versions).
    addWhiskers() {
      const whisk = [];
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
        whisk.push(side * 0.06, -0.07, -0.2, side * (0.26 + k * 0.01), -0.05 - k * 0.035, -0.15 + k * 0.01);
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(whisk, 3)); this.geos.push(wg);
      const whiskMat = new THREE.LineBasicMaterial({ color: 0xf4efe6 }); this.mats.push(whiskMat);
      this.head.add(new THREE.LineSegments(wg, whiskMat));
    }

    // ---- Poses: each says where the body sits, how it's tilted, and where the four paws go ----
    // (Each may also give `hock`: where a back leg's hock sits, from its paw; and `ears`: 0 up, 1 flat back.)
    standPose() {
      return { bodyY: 0.62, pitch: 0, head: 0, tailRaise: 0.6, tailCurl: 0.55, feet: LEGS.map((l) => l.rest.clone()) };
    }
    walkPose() {
      const feet = this.legs.map((leg) => {
        const ph = (this.phase + leg.phase) % 1, f = leg.spec.rest.clone();
        if (ph < 0.65) f.z += STRIDE * (0.5 - ph / 0.65) * -1;                // planted: slides back under the body
        else { const s = (ph - 0.65) / 0.35; f.z += STRIDE * (-0.5 + s) * -1; f.y = Math.sin(s * Math.PI) * 0.1; }   // stepping forward
        return f;
      });
      const bob = 0.015 * Math.cos(this.phase * TAU * 2);
      return { bodyY: 0.6 + bob, pitch: 0, head: -0.05, tailRaise: 0.45, tailCurl: 0.5, feet };
    }
    sitPose() {
      return {
        bodyY: SIT_HEIGHT, pitch: 0.75, head: 0.05, tailRaise: -0.35, tailCurl: 0.75,
        feet: [V(-0.1, 0, -0.36), V(0.1, 0, -0.36), V(-0.16, 0, -0.02), V(0.16, 0, -0.02)]
      };
    }
    crouchPose() {
      const wiggle = Math.sin(this.t * 9) * 0.02;                         // the bottom-wiggle before a pounce
      return {
        bodyY: CROUCH_HEIGHT, pitch: -0.08, head: 0.2, tailRaise: 0.05, tailCurl: 0.2, wiggle, ears: 0.25,
        feet: [V(-0.12, 0, -0.62), V(0.12, 0, -0.62), V(-0.15, 0, 0.32), V(0.15, 0, 0.32)]
      };
    }
    leapPose() {
      // Stretched out: front paws reaching ahead, back legs pushed straight out behind
      // (the hock lying back in line with the leg, not standing up), ears flat back.
      return {
        bodyY: 0.55, pitch: 0.05, head: 0.1, tailRaise: 0.75, tailCurl: 0.1, ears: LEAP_EARS,
        hock: V(0, 0.04, -0.19),
        feet: [V(-0.14, 0.15, -1.0), V(0.14, 0.28, -0.98), V(-0.13, 0.36, 1.13), V(0.13, 0.42, 1.09)]
      };
    }

    // The pose the Blender model is built in: standing, tail straight out behind and a little up,
    // eyes wide open, mouth shut, looking ahead.
    bindPose() {
      this.hiss = 0; this.squint = 0; this.look = 0;
      const p = this.standPose(); p.tailRaise = 0.25; p.tailCurl = 0; p.wiggle = 0; p.swish = 0;
      this.pose(p);
    }

    update(dt) {
      const c = this.controls;
      this.t += dt;
      for (const k in this.weights) this.weights[k] = ease(this.weights[k], c.mode === k ? 1 : 0, c.mode === "leap" ? EASE * 2 : EASE, dt);
      if (c.mode === "walk") this.phase += dt * Math.max(0.3, c.speed || 0.5) / (STRIDE * 2);
      this.hiss = ease(this.hiss, clamp(c.hiss || 0, 0, 1), 10, dt);
      this.squint = ease(this.squint, clamp(c.squint == null ? 0.4 : c.squint, 0, 1), 6, dt);
      this.look = ease(this.look, clamp(c.look || 0, -1, 1), 5, dt);

      // Blend the poses by weight.
      const poses = { stand: this.standPose, walk: this.walkPose, sit: this.sitPose, crouch: this.crouchPose, leap: this.leapPose };
      let total = 0; for (const k in this.weights) total += this.weights[k];
      const p = { bodyY: 0, pitch: 0, head: 0, tailRaise: 0, tailCurl: 0, wiggle: 0, ears: 0, hock: V(), feet: LEGS.map(() => V()) };
      for (const k in poses) {
        const w = this.weights[k] / (total || 1);
        if (w < 0.001) continue;
        const q = poses[k].call(this);
        for (const key of ["bodyY", "pitch", "head", "tailRaise", "tailCurl"]) p[key] += q[key] * w;
        p.wiggle += (q.wiggle || 0) * w; p.ears += (q.ears || 0) * w;
        p.hock.addScaledVector(q.hock || HOCK, w);
        q.feet.forEach((f, i) => p.feet[i].addScaledVector(f, w));
      }
      p.swish = Math.sin(this.t * 2.2) * TAIL_SWISH;
      this.pose(p);
    }

    // Sets every joint from a pose.
    pose(p) {
      // ---- Body and head ----
      this.body.position.set(p.wiggle, p.bodyY, 0);
      this.body.rotation.set(p.pitch, 0, p.wiggle * 2);
      this.neck.rotation.set(-p.pitch * 0.85 + p.head + this.hiss * 0.15, this.look * 0.9, 0);
      this.head.rotation.set(-0.05, 0, this.look * -0.1);
      this.jaw.rotation.x = this.hiss * 0.65;
      const flat = Math.max(this.hiss, p.ears || 0);                    // ears flatten back when it hisses or leaps
      for (const { ear, side } of this.ears) ear.rotation.set(-flat * 0.9, 0, side * (-0.15 - flat * 0.9));
      // The lids are domes over the eye: swung back behind it when open, forward over it to close.
      const open = clamp(1 - this.squint * 0.85 + this.hiss * 0.3, 0, 1);   // 1 = wide open
      for (const e of this.eyes) {
        e.upper.rotation.x = lerp(-0.25, 1.45, open) - this.hiss * 0.45;     // lowered into an angry brow when hissing
        e.lower.rotation.x = Math.PI - lerp(0.25, 1.4, open);
      }
      this.body.updateMatrix();

      // ---- Legs ----
      const tm = this.tmp;
      tm.side.set(1, 0, 0);
      this.legs.forEach((leg, i) => {
        const spec = leg.spec, paw = p.feet[i];
        tm.root.copy(spec.root).applyMatrix4(this.body.matrix);
        if (spec.front) {
          tm.target.set(paw.x, paw.y + 0.05, paw.z);
          tm.pole.set(0, 0.6, 1).applyQuaternion(this.body.quaternion);        // the elbow points back (and a little up, never into the floor)
          K.reach(tm.root, tm.target, spec.a, spec.b, tm.pole, tm.knee, tm.end);
          K.aim(leg.upper, tm.root, tm.knee, tm.pole); K.aim(leg.lower, tm.knee, tm.end, tm.pole);
          leg.paw.position.set(tm.end.x, tm.end.y - 0.02, tm.end.z - 0.02);
        } else {
          // The hock: from the paw, angled up and back (or lying back in line with the leg in a leap).
          tm.hockTop.copy(paw).add(p.hock || HOCK);
          tm.pole.set(0, 0.25, -1).applyQuaternion(this.body.quaternion);      // the knee points forward (and a little up)
          K.reach(tm.root, tm.hockTop, spec.a, spec.b, tm.pole, tm.knee, tm.end);
          K.aim(leg.upper, tm.root, tm.knee, tm.pole); K.aim(leg.lower, tm.knee, tm.end, tm.pole);
          tm.pawAt.set(paw.x, paw.y + 0.03, paw.z);
          K.aim(leg.hock, tm.end, tm.pawAt, tm.pole);
          if (leg.hockMesh) leg.hockMesh.scale.y = tm.end.distanceTo(tm.pawAt);
          leg.paw.position.set(paw.x, paw.y + 0.02, paw.z - 0.03);
        }
      });

      // ---- Tail: up from the hips, curling at the tip, swishing; puffed up when it hisses ----
      const pts = this.tailPoints;
      pts[0].set(0, 0.06, 0.5);
      let angle = p.tailRaise;                                           // up from straight back
      for (let i = 1; i < TAIL_POINTS; i++) {
        const u = i / TAIL_POINTS;
        angle += p.tailCurl * Math.pow(u, 2.2) * 0.9;
        const sideways = (p.swish || 0) * u * u, prev = pts[i - 1];
        pts[i].set(prev.x + Math.sin(sideways) * TAIL_SEGMENT * 0.5, prev.y + Math.sin(angle) * TAIL_SEGMENT, prev.z + Math.cos(angle) * TAIL_SEGMENT);
      }
      const puff = 1 + this.hiss * TAIL_PUFF;
      // The tail never goes through the floor: where it would, it lies along the floor instead.
      tm.inverse = tm.inverse || new THREE.Matrix4(); tm.inverse.copy(this.body.matrix).invert();
      const lowest = 0.065 * puff;
      for (const pt of pts) {
        pt.applyMatrix4(this.body.matrix);
        if (pt.y < lowest) pt.y = lowest;
        pt.applyMatrix4(tm.inverse);
      }
      for (let i = 0; i < TAIL_POINTS; i++) {
        const next = i < TAIL_POINTS - 1 ? pts[i + 1] : tm.target.copy(pts[i]).multiplyScalar(2).sub(pts[i - 1]);
        K.aim(this.tailJoints[i], pts[i], next, tm.side);
        this.tailJoints[i].scale.set(puff, 1, puff);
      }
      if (this.tailTube) {
        for (let i = 0; i < TAIL_POINTS; i++) this.tailRadii[i] = (i === 0 ? 0.055 : 0.055 - i / TAIL_POINTS * 0.02) * puff;
        this.tailTube.set(pts, this.tailRadii);
      }
    }

    dispose() {
      for (const g of this.geos) g.dispose();             // (version 2's shared skin stays, for the next cat)
      for (const m of this.mats) m.dispose();
      if (this.skin) Object.values(this.skin)[0].skeleton.dispose();
    }
  }

  return Cat;
})();
