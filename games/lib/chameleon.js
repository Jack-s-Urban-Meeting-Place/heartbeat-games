// ============================================================================
// chameleon.js: a chameleon that climbs, hides and looks around
// ----------------------------------------------------------------------------
// In "climbing pose": lying on a wall with its belly to the wall, head pointing
// up. In its own space the wall is the flat z = 0, "up the wall" is +y, and its
// back faces +z (toward the camera). Size: 1 unit = snout to the base of the tail;
// the game scales it.
//
//   const cham = new HG.Chameleon({ colour: "#e0662b" });  scene.add(cham.root);
//   cham.controls.velocity = [x, y]   how fast it's climbing, in body lengths per second
//                                     (its feet stay planted on the wall as it moves)
//   cham.controls.camo = 0..1         0 = its own colour, 1 = hidden (all but its eyes)
//   cham.controls.fall = 0..1         lost its grip: legs flailing
//   cham.controls.lookAt = null or a point (THREE.Vector3, in the chameleon's own space)
//                                     to stare at; otherwise each eye roams on its own
//   cham.controls.surface = null      (a flat wall) or the surface it's on, when that bends: an inside
//                                     corner (floor to wall) or an outside edge (up a face and over the top).
//                                     { at(d) → { y, z, a }, turn }: d = distance along its way (body lengths;
//                                     + ahead of cham.root, - behind), y and z = the surface's middle line there
//                                     and a = its angle (radians; 0 = like the root's own wall), in the root's
//                                     space before turning by `turn` (the root's own turn about z). Each part
//                                     then lies on the surface where it is: the back half on one face, the chest
//                                     and head on the next, each foot where it stepped, the tail trailing.
//   cham.update(dt);
//
//   cham.leap(seconds)                a leap (for gaps it can't climb: shelf to ledge, rock to rock):
//                                     crouch, spring, fly with the front feet reaching ahead and the tail
//                                     stretched out behind, catch with the front feet, swing the back legs in.
//                                     The animal does the legs, body and tail; whoever moves cham.root carries
//                                     it from where it was to where it lands, using
//   HG.Chameleon.leapPath(t)          t = how far through the leap (0..1, from cham.leapProgress):
//                                     { along: 0..1 of the way there, lift: 0..1 away from the wall }
//   cham.leaping, cham.leapProgress   whether it's mid-leap, and how far through (0..1)
//
// Chameleon things it does: a rocking, diagonal walk (front-left with back-right),
// eyes that swivel separately, a tail that curls up tight when resting.
//
// It has a skeleton of named joints (cham.joints: body, chest, head, eye.0/1, look.0/1,
// tail.0-15, leg.0-3.upper/lower/foot; leg 0 = front left; the chest bends the front half). Version 2's look is a skin
// made in Blender (games/lib/chameleon-model.js, from blender/build_chameleon.py)
// that moves with those joints; without it (or with { model: "v1" }) the chameleon is
// built from simple shapes here (games/lib/creature-kit.js).
// Its look follows panther chameleons: see storyboards/chameleon-model/README.md.
// ============================================================================
HG.Chameleon = (function () {
  const K = HG.kit;
  // ---- Tuning: how it moves -------------------------------------------------
  const STRIDE = 0.24;               // a foot steps once it has been dragged this far from its resting spot (body lengths)
  const STEP_SECONDS = 0.2;          // how long a step takes at climbing speed
  const STEP_LIFT = 0.07;            // how far a foot lifts off the wall while stepping
  const SWAY = 0.12;                 // the body's side-to-side rock as it walks (radians)
  const TAIL_CURL_RESTING = 1.0;     // how tightly the tail curls when resting (1 = a full spiral)...
  const TAIL_CURL_CLIMBING = 0.45;   // ...and when climbing
  const EYE_ROAM = [0.5, 1.8];       // each eye looks somewhere new every this many seconds (from, to)
  const BEND_SPEED = 8;              // how quickly it settles onto a bending surface (or back to a flat one, e.g. for a leap)
  // Where along the body each stiff part sits on the surface (body lengths from the middle; + toward the head):
  const HIPS_ON = -0.22;             // the back half (hips and back legs)...
  const CHEST_ON = 0.14;             // ...the front half (shoulders and front legs)...
  const HEAD_ON = 0.5;               // ...and the head
  // ---- Tuning: the leap (shares of the whole leap, 0 to 1) ---------------------
  const LEAP_SECONDS = 0.9;          // how long a whole leap takes, crouch to settled
  const LEAP_CROUCH = 0.24;          // coiling up, feet still gripping...
  const LEAP_CATCH = 0.78;           // ...in the air until the front feet catch here...
  const LEAP_SETTLE = 0.95;          // ...and the back legs have swung in by here
  const LEAP_REACH = 0.26;           // how far the front feet reach ahead in the air (body lengths)
  const LEAP_PUSH = 0.22;            // how far the back legs stretch out behind
  // ---- Tuning: how it looks -------------------------------------------------
  const STRIPE_LIGHTEN = 0.35;       // version 1: the pale stripe along each side (0 = none)
  const BELLY_DARKEN = 0.25;         // version 1: how much darker the underside is
  const SKIN_SHADE = 0.64;           // version 2: how much the skin picture darkens the colour (so it's brightened by this first)
  const SKIN_BUMPS = 0.45;           // version 2: how strongly the soft scales stand out
  // ----------------------------------------------------------------------------

  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const ease = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Version 1's body, from the base of the tail (vent) to the neck: height up the wall,
  // half-width, and how far the back stands out from the wall.
  const BODY = [
    [-0.46, 0.07, 0.06], [-0.38, 0.13, 0.1], [-0.24, 0.185, 0.14], [-0.04, 0.205, 0.16],
    [0.14, 0.19, 0.155], [0.27, 0.145, 0.125], [0.36, 0.1, 0.1]
  ];
  const BODY_RINGS = 19;             // the body's outline above, smoothed into this many rings
  const BANDS = 5;                   // darker bands across the back
  // Legs: where each joins the body, its two bone lengths, its resting foot spot, and
  // which way its elbow or knee points. Order: front-left, front-right, back-left, back-right.
  const LEGS = [
    { root: V(-0.08, 0.2, 0.1), a: 0.2, b: 0.19, rest: V(-0.35, 0.36, 0), pole: V(-0.5, -1, 0.8) },
    { root: V(0.08, 0.2, 0.1), a: 0.2, b: 0.19, rest: V(0.35, 0.36, 0), pole: V(0.5, -1, 0.8) },
    { root: V(-0.075, -0.32, 0.1), a: 0.2, b: 0.19, rest: V(-0.33, -0.47, 0), pole: V(-0.5, 1, 0.8) },
    { root: V(0.075, -0.32, 0.1), a: 0.2, b: 0.19, rest: V(0.33, -0.47, 0), pole: V(0.5, 1, 0.8) }
  ];
  const PAIRS = [[0, 3], [1, 2]];    // the diagonal pairs that step together
  const HEAD_AT = V(0, 0.36, 0.13);  // where the head joins the neck
  const EYE_AT = [-1, 1].map((side) => V(side * 0.095, 0.085, 0.045));   // each eye, from the head
  const TAIL_POINTS = 16;
  const TAIL_BASE = V(0, -0.42, 0.08);

  const aim = K.aim;

  class Chameleon {
    constructor(options = {}) {
      const colour = new THREE.Color(options.colour || "#3c9a4a");
      this.colour = colour;
      this.controls = { velocity: [0, 0], camo: 0, fall: 0, lookAt: null, surface: null };
      this.bend = 0; this.lastSurface = null;              // how much it follows the bending surface (0..1)
      this.t = Math.random() * 10; this.camo = 0; this.fall = 0; this.speed = 0; this.sway = 0;
      this.curl = TAIL_CURL_RESTING; this.climbing = 0;
      this.tailSide = options.tailSide || 1;
      this.geos = []; this.mats = []; this.camoMats = [];
      this.root = new THREE.Group();

      // ---- The skeleton ----
      this.joints = {};
      const joint = (name, parent) => { const g = new THREE.Group(); g.name = name; this.joints[name] = g; parent.add(g); return g; };
      this.body = joint("body", this.root);
      this.chest = joint("chest", this.body);
      this.head = joint("head", this.chest); this.head.position.copy(HEAD_AT);
      this.eyes = [-1, 1].map((side, i) => {
        const eye = joint("eye." + i, this.head); eye.position.copy(EYE_AT[i]);
        const look = joint("look." + i, eye);            // turns to look; the pupil points along its +x (outward)
        return { side, eye, look, yaw: 0, pitch: 0, yawTo: 0, pitchTo: 0, next: Math.random() };
      });
      this.tailJoints = [];
      for (let i = 0; i < TAIL_POINTS; i++) this.tailJoints.push(joint("tail." + i, this.body));
      this.legs = LEGS.map((spec, i) => ({
        spec, front: i < 2, planted: spec.rest.clone(), from: spec.rest.clone(), to: spec.rest.clone(), swing: -1, lift: 0,
        upper: joint("leg." + i + ".upper", this.root), lower: joint("leg." + i + ".lower", this.root), foot: joint("leg." + i + ".foot", this.root)
      }));
      this.knee = V(); this.end = V(); this.rootWorld = V(); this.target = V(); this.pole = V(); this.out = V(0, 0, 1);
      this.axis = V(1, 0, 0); this.turnQ = new THREE.Quaternion(); this.m1 = new THREE.Matrix4(); this.m2 = new THREE.Matrix4();
      this.flat = { body: new THREE.Matrix4(), chest: new THREE.Matrix4(), head: new THREE.Matrix4() };
      this.bent = { body: new THREE.Matrix4(), chest: new THREE.Matrix4(), head: new THREE.Matrix4() };
      this.bodyOffset = V(); this.headLift = 0; this.leapT = null;
      this.tailPoints = []; for (let i = 0; i < TAIL_POINTS; i++) this.tailPoints.push(V());

      // ---- The look: version 2 (Blender) if it's loaded, else simple shapes ----
      this.skinned = options.model !== "v1" && !!HG.chameleonModel;
      if (this.skinned) this.buildSkin(); else this.buildShapes();
      this.update(0);
    }

    // Puts every part of the chameleon on a "layer" (so a scene can leave it out of a picture).
    setLayer(n) { this.root.traverse((o) => o.layers.set(n)); }

    // ---- Version 2: wrap the Blender-made skin around the skeleton ----
    buildSkin() {
      const model = HG.chameleonModel, shared = K.skinAssets(model);
      this.bindPose();
      // The skin pictures are mostly grey: they darken the colour, so the colour starts brighter (same hue),
      // and the skin comes out in the player's colour, with the pale markings lighter still.
      const base = this.colour.clone().multiplyScalar(1 / SKIN_SHADE);
      base.setRGB(Math.min(1, base.r), Math.min(1, base.g), Math.min(1, base.b));
      const camo = (map, bump, extra) => {
        const m = K.camoMaterial(Object.assign({ color: base, map: map || null, bumpMap: bump || null, bumpScale: SKIN_BUMPS, roughness: 0.5 }, extra));
        this.camoMats.push(m); this.mats.push(m); return m;
      };
      const T = shared.textures;
      const pick = {
        skin: camo(T.skin, T.skinBump), tail: camo(T.tail, T.tailBump),
        // (the head and legs have bumps but no picture to darken them: the plain player colour)
        head: camo(null, T.headBump, { color: this.colour.clone() }), limb: camo(null, T.limbBump, { color: this.colour.clone() }),
        crest: camo(null, null, { color: this.colour.clone().multiplyScalar(0.75) }),
        eye: this.plain({ color: base.clone(), roughness: 0.4, map: T.eye || null }),   // (not camouflaged: the eyes always show)
        pupil: this.plain({ color: 0x111111, roughness: 0.15 }),
        mouth: camo(null, null, { color: base.clone().lerp(new THREE.Color(1, 0.95, 0.8), 0.5) })
      };
      this.skin = K.bindSkin(this.root, model, this.joints, (name) => pick[name] || pick.skin);
    }

    plain(p) { const m = new THREE.MeshStandardMaterial(p); this.mats.push(m); return m; }

    // ---- Version 1: simple shapes on the joints ----
    buildShapes() {
      const colour = this.colour, keep = (g) => (this.geos.push(g), g);
      const skin = K.camoMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0 });
      const limbSkin = K.camoMaterial({ color: colour.clone().multiplyScalar(0.92), roughness: 0.6 });
      const crestSkin = K.camoMaterial({ color: colour.clone().multiplyScalar(0.75), roughness: 0.6, flatShading: true });
      this.camoMats.push(skin, limbSkin, crestSkin); this.mats.push(skin, limbSkin, crestSkin);
      const eyeMat = this.plain({ color: colour.clone().lerp(new THREE.Color(1, 1, 1), 0.08), roughness: 0.4 });
      const ringMat = this.plain({ color: 0xffe9a8, roughness: 0.3 }), pupilMat = this.plain({ color: 0x111111, roughness: 0.15 });
      const pale = colour.clone().lerp(new THREE.Color(1, 1, 0.85), STRIPE_LIGHTEN);
      const dark = colour.clone().multiplyScalar(1 - BELLY_DARKEN);

      // Body: one smooth tube, oval, with darker bands across the back and a pale stripe along each side.
      const rings = [];
      for (let i = 0; i < BODY_RINGS; i++) {
        const f = i / (BODY_RINGS - 1) * (BODY.length - 1), j = Math.min(BODY.length - 2, Math.floor(f)), u = f - j;
        const s = u * u * (3 - 2 * u);
        rings.push(BODY[j].map((v, c) => v + (BODY[j + 1][c] - v) * s));
      }
      const bodyTube = new K.Tube(BODY_RINGS, 16, skin, { colours: true });
      bodyTube.set(rings.map(([y, , out]) => V(0, y, out * 0.95)), rings.map(([, w, out]) => [w, out]), V(1, 0, 0));
      const band = colour.clone().multiplyScalar(0.72);
      bodyTube.paint((i, k, ang) => {
        const facing = Math.sin(ang), flank = Math.abs(Math.cos(ang));   // facing: +1 = the back, -1 = the belly
        const u = i / (BODY_RINGS - 1), inBand = Math.sin(u * Math.PI * BANDS * 2) > 0.45 && u > 0.1 && u < 0.85;
        return colour.clone().lerp(band, facing > 0.35 && inBand ? 1 : 0)
          .lerp(pale, flank > 0.8 && facing > -0.3 ? STRIPE_LIGHTEN * 2 : 0).lerp(dark, facing < -0.3 ? 1 : 0);
      });
      keep(bodyTube.geometry); this.body.add(bodyTube.mesh);
      // A row of little spikes along the back.
      const spike = keep(new THREE.ConeGeometry(0.03, 0.08, 4)); spike.rotateX(Math.PI / 2);
      for (let k = 0; k < 10; k++) {
        const m = new THREE.Mesh(spike, crestSkin);
        m.position.set(0, -0.38 + k * 0.072, 0.14 + 0.035 * Math.sin(k / 9 * Math.PI)); m.scale.setScalar(0.7 + 0.5 * Math.sin(k / 9 * Math.PI));
        this.body.add(m);
      }
      // Head: a pointed helmet (the casque), a blunt snout, and turret eyes.
      const ball = keep(new THREE.SphereGeometry(1, 14, 10));
      const skull = new THREE.Mesh(ball, limbSkin); skull.scale.set(0.125, 0.15, 0.1); skull.position.set(0, 0.06, -0.03);
      const snout = new THREE.Mesh(keep(new THREE.ConeGeometry(0.085, 0.17, 10)), limbSkin); snout.position.set(0, 0.19, -0.035); snout.scale.set(1, 1, 0.8);
      const casque = new THREE.Mesh(keep(new THREE.ConeGeometry(0.075, 0.2, 6)), crestSkin); casque.position.set(0, -0.01, 0.07); casque.rotation.x = -2.3;
      this.head.add(skull, snout, casque);
      const dome = keep(new THREE.SphereGeometry(0.068, 16, 12)), ringGeo = keep(new THREE.SphereGeometry(0.03, 12, 8)), pupilGeo = keep(new THREE.SphereGeometry(0.017, 8, 6));
      for (const e of this.eyes) {
        e.eye.add(new THREE.Mesh(dome, eyeMat));
        const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.set(e.side * 0.05, 0, 0); ring.scale.set(0.6, 1, 1);
        const pupil = new THREE.Mesh(pupilGeo, pupilMat); pupil.position.set(e.side * 0.066, 0, 0);
        e.look.add(ring, pupil);
      }
      // Legs: a bone on each joint, ending in a two-toed grip.
      const bone = keep(K.limbGeometry(0.7)), toe = ball;
      for (const leg of this.legs) {
        const upper = new THREE.Mesh(bone, limbSkin); upper.scale.set(0.048, leg.spec.a, 0.048); leg.upper.add(upper);
        const lower = new THREE.Mesh(bone, limbSkin); lower.scale.set(0.036, leg.spec.b, 0.036); leg.lower.add(lower);
        for (const turn of [-0.55, 0.55]) {             // chameleon feet: two bundles of toes, like mittens
          const t = new THREE.Mesh(toe, limbSkin);
          t.scale.set(0.028, 0.06, 0.022); t.rotation.z = turn; t.position.set(Math.sin(-turn) * 0.03, Math.cos(turn) * 0.03, 0);
          leg.foot.add(t);
        }
      }
      // Tail: a tapering tube through the tail joints.
      this.tailTube = new K.Tube(TAIL_POINTS, 8, skin, { colours: true });
      this.tailTube.paint((i, k, ang) => colour.clone().lerp(dark, Math.sin(ang) < -0.3 ? 1 : 0).lerp(pale, (i % 3 === 0) && Math.sin(ang) > 0.3 ? 0.35 : 0));
      keep(this.tailTube.geometry); this.body.add(this.tailTube.mesh);
      this.tailRadii = []; for (let i = 0; i < TAIL_POINTS; i++) this.tailRadii.push(0.055 * Math.pow(1 - i / TAIL_POINTS, 1.1) + 0.007);
    }

    // ---- The leap ----
    leap(seconds = LEAP_SECONDS) {
      if (this.leapT != null) return;
      this.leapT = 0; this.leapSeconds = seconds;
      for (const leg of this.legs) { leg.swing = -1; leg.leapFrom = leg.planted.clone(); }
    }
    get leaping() { return this.leapT != null; }
    get leapProgress() { return this.leapT == null ? 1 : this.leapT; }

    // Where the legs, body, head and tail are at a point t (0..1) through a leap.
    leapPose(t) {
      const sm = (a, b) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
      const coil = sm(0, LEAP_CROUCH) * (1 - sm(LEAP_CROUCH, LEAP_CROUCH + 0.06));     // bunch up, then let go
      const air = sm(LEAP_CROUCH, LEAP_CROUCH + 0.08) * (1 - sm(LEAP_CATCH - 0.04, LEAP_CATCH + 0.04));
      const frontDown = sm(LEAP_CATCH - 0.08, LEAP_CATCH + 0.02);                         // the front feet catch first...
      const backDown = sm(LEAP_CATCH + 0.02, LEAP_SETTLE);                               // ...then the back legs swing in
      this.legs.forEach((leg) => {
        const rest = leg.spec.rest, from = leg.leapFrom || rest;
        // bunched: feet drawn in under the body; flying: front feet reaching ahead, back legs pushed out behind
        const bunched = V(rest.x * 0.85, rest.y + (leg.front ? -0.08 : 0.06), 0);
        const flying = leg.front ? V(rest.x * 0.75, rest.y + LEAP_REACH, 0.06) : V(rest.x * 0.65, rest.y - LEAP_PUSH, 0.04);
        const p = from.clone().lerp(bunched, coil > 0 && t < LEAP_CROUCH ? coil : 0);
        if (t >= LEAP_CROUCH) p.copy(bunched).lerp(flying, sm(LEAP_CROUCH, LEAP_CROUCH + 0.1));
        const down = leg.front ? frontDown : backDown;
        if (down > 0) p.lerp(V(rest.x, rest.y, 0), down);
        leg.planted.set(p.x, p.y, 0); leg.lift = p.z;
      });
      this.bodyOffset.set(0, -0.05 * coil + 0.03 * air, 0.03 * air);   // coiled back, then stretched forward
      this.headLift = 0.3 * air - 0.12 * coil;                         // chin down to coil, head up in the air
      this.curl = TAIL_CURL_CLIMBING * (1 - air) + 0.08 * air;         // the tail straightens out behind for balance
      for (const e of this.eyes) { e.yawTo = 1.2; e.pitchTo = 0.1; }  // both eyes fixed on where it's going
    }

    // The pose the Blender model is built in: standing still, feet at rest, tail straight down, eyes ahead.
    bindPose() {
      this.sway = 0; this.fall = 0; this.curl = 0; this.climbing = 0; this.bend = 0;
      for (const leg of this.legs) { leg.planted.copy(leg.spec.rest); leg.lift = 0; leg.swing = -1; }
      for (const e of this.eyes) { e.yaw = 0; e.pitch = 0; }
      this.pose();
    }

    update(dt) {
      const c = this.controls;
      this.t += dt;
      const vx = c.velocity[0] || 0, vy = c.velocity[1] || 0, speed = Math.hypot(vx, vy);
      this.speed = ease(this.speed, speed, 6, dt);
      this.camo = ease(this.camo, clamp(c.camo, 0, 1), c.camo > this.camo ? 3 : 9, dt);   // fades in gently, snaps back fast
      this.fall = ease(this.fall, clamp(c.fall, 0, 1), 10, dt);
      for (const m of this.camoMats) m.userData.camo.value = this.camo;
      // Following a bending surface (not while leaping: then it's flying straight between the two)
      const surface = this.leapT == null ? c.surface : null;
      if (surface) this.lastSurface = surface;
      this.bend = ease(this.bend, surface ? 1 : 0, BEND_SPEED, dt);

      // ---- Leaping: the leap sets the feet, body, head and tail itself ----
      if (this.leapT != null) {
        this.leapT = Math.min(1, this.leapT + dt / this.leapSeconds);
        this.leapPose(this.leapT);
        this.sway = ease(this.sway, 0, 10, dt);
        for (const e of this.eyes) { e.yaw = ease(e.yaw, e.yawTo, 12, dt); e.pitch = ease(e.pitch, e.pitchTo, 12, dt); }
        if (this.leapT >= 1) {                                           // landed: feet back at rest where it is now
          this.leapT = null; this.bodyOffset.set(0, 0, 0); this.headLift = 0;
          for (const leg of this.legs) { leg.planted.copy(leg.spec.rest); leg.lift = 0; leg.swing = -1; }
        }
        this.pose();
        return;
      }

      // ---- Feet: planted feet slide back as the body moves on; a foot dragged too far steps forward ----
      const moving = this.speed > 0.02;
      const dir = moving ? [vx / (speed || 1), vy / (speed || 1)] : [0, 1];
      const stepTime = STEP_SECONDS * clamp(0.9 / Math.max(0.25, this.speed), 0.6, 2);
      this.legs.forEach((leg) => { if (leg.swing < 0) { leg.planted.x -= vx * dt; leg.planted.y -= vy * dt; } });
      for (const pair of PAIRS) {
        const legs = pair.map((i) => this.legs[i]);
        const otherSwinging = this.legs.some((l, i) => !pair.includes(i) && l.swing >= 0);
        const stretched = Math.max(...legs.map((l) => l.planted.distanceTo(l.spec.rest)));
        const untidy = !moving && stretched > 0.06 && (this.t % 1.3) < dt * 1.5;   // standing still: tidy the feet now and then
        if (!otherSwinging && legs.every((l) => l.swing < 0) && (stretched > STRIDE * 0.5 || untidy) && this.fall < 0.3) {
          for (const l of legs) {
            l.swing = 0; l.from.copy(l.planted);
            l.to.copy(l.spec.rest); if (moving) { l.to.x += dir[0] * STRIDE * 0.42; l.to.y += dir[1] * STRIDE * 0.42; }
            l.stepTime = moving ? stepTime : 0.25;
          }
        }
      }
      let swayTarget = 0;
      this.legs.forEach((leg, i) => {
        if (leg.swing >= 0) {
          leg.swing += dt / leg.stepTime;
          const s = Math.min(1, leg.swing), smooth = s * s * (3 - 2 * s);
          leg.planted.lerpVectors(leg.from, leg.to, smooth);
          leg.lift = Math.sin(s * Math.PI) * STEP_LIFT;
          if (leg.swing >= 1) { leg.swing = -1; leg.lift = 0; }
          swayTarget = (i === 0 || i === 3 ? -1 : 1) * SWAY * Math.sin(s * Math.PI);
        } else leg.lift = 0;
      });
      this.sway = ease(this.sway, moving ? swayTarget : 0, 8, dt);

      // ---- Tail: tighter when resting, looser when climbing ----
      this.climbing = clamp(this.speed / 0.6, 0, 1);
      this.curl = ease(this.curl, this.fall > 0.3 ? 0.2 : this.climbing > 0.2 ? TAIL_CURL_CLIMBING : TAIL_CURL_RESTING, 2.5, dt);

      // ---- Eyes: each roams on its own, or both stare at something ----
      for (const e of this.eyes) {
        e.next -= dt;
        if (c.lookAt) {
          const local = c.lookAt;
          e.yawTo = clamp(Math.atan2(local.y - 0.45, (local.x - e.side * 0.1) * e.side), -1.3, 1.3);
          e.pitchTo = clamp((local.z - 0.1) * 1.5, -0.6, 0.8);
        } else if (e.next <= 0) {
          e.yawTo = (Math.random() - 0.3) * 2.2; e.pitchTo = (Math.random() - 0.3) * 1.2;
          e.next = EYE_ROAM[0] + Math.random() * (EYE_ROAM[1] - EYE_ROAM[0]);
        }
        e.yaw = ease(e.yaw, e.yawTo, 12, dt); e.pitch = ease(e.pitch, e.pitchTo, 12, dt);
      }
      this.pose();
    }

    // Sets every joint from the current state (feet, sway, fall, tail curl, eyes).
    pose() {
      // ---- Body: rocks side to side as it walks; lifts off a little when it loses its grip ----
      // (worked out flat first, as if on a flat wall; then each stiff part is laid on the surface where it is)
      this.body.rotation.set(0, this.sway * 0.5, this.sway);
      this.body.position.set(0, 0, this.fall * 0.05).add(this.bodyOffset);
      this.chest.position.set(0, 0, 0); this.chest.quaternion.identity();
      this.head.position.copy(HEAD_AT);
      this.head.rotation.set(this.headLift, 0, -this.sway * 0.8 + this.fall * Math.sin(this.t * 17) * 0.3);
      this.body.updateMatrix(); this.head.updateMatrix();
      const flat = this.flat, bent = this.bent, bending = this.bend > 0.001 && this.lastSurface;
      flat.body.copy(this.body.matrix); flat.chest.copy(flat.body); flat.head.multiplyMatrices(flat.chest, this.head.matrix);
      if (bending) {
        this.bendFrame(flat.body, V(0, HIPS_ON, 0), bent.body);
        this.bendFrame(flat.chest, V(0, CHEST_ON, 0), bent.chest);
        this.bendFrame(flat.head, V(0, HEAD_ON, 0), bent.head);
        bent.body.decompose(this.body.position, this.body.quaternion, this.body.scale);
        this.m1.copy(bent.body).invert().multiply(bent.chest);
        this.m1.decompose(this.chest.position, this.chest.quaternion, this.chest.scale);
        this.m1.copy(bent.chest).invert().multiply(bent.head);
        this.m1.decompose(this.head.position, this.head.quaternion, this.head.scale);
      } else for (const k in flat) bent[k].copy(flat[k]);

      // ---- Legs: reach each joint to its foot (the feet grip the surface where they stepped) ----
      for (const leg of this.legs) {
        const spec = leg.spec;
        this.rootWorld.copy(spec.root).applyMatrix4(leg.front ? bent.chest : bent.body);
        this.target.copy(leg.planted); this.target.z = leg.lift || 0;
        if (this.fall > 0.01) {                       // flailing: feet off the wall, waving
          const wave = Math.sin(this.t * 19 + (leg.front ? 0 : 2) + spec.rest.x * 9);
          this.target.lerp(V(spec.rest.x * 1.3, spec.rest.y + wave * 0.12, 0.16 + wave * 0.05), this.fall);
        }
        this.onSurface(this.target);
        this.pole.copy(spec.pole).normalize().applyQuaternion(this.turnQ);
        K.reach(this.rootWorld, this.target, spec.a, spec.b, this.pole, this.knee, this.end);
        aim(leg.upper, this.rootWorld, this.knee, this.pole);
        aim(leg.lower, this.knee, this.end, this.pole);
        leg.foot.position.copy(this.end);
        leg.foot.rotation.set(0, 0, Math.atan2(-spec.rest.x, spec.rest.y >= 0 ? 1 : -1) * 0.5 + (spec.rest.y < 0 ? Math.PI : 0));
        leg.foot.quaternion.premultiply(this.turnQ);
      }

      // ---- Tail: a spiral through the tail joints, swaying a little when climbing ----
      let heading = -Math.PI / 2 + this.sway * 1.5 + Math.sin(this.t * 3) * 0.08 * this.climbing;
      const p = this.tailPoints;
      p[0].copy(TAIL_BASE);
      for (let i = 1; i < TAIL_POINTS; i++) {
        const seg = 0.075 * (1 - i / TAIL_POINTS * 0.55);
        heading += this.tailSide * this.curl * 0.9 * Math.pow(i / TAIL_POINTS, 1.6) * 1.9;
        p[i].set(p[i - 1].x + Math.cos(heading) * seg, p[i - 1].y + Math.sin(heading) * seg,
          Math.max(0.02, TAIL_BASE.z - i * 0.004) + this.fall * 0.05 * Math.sin(this.t * 13 + i));
      }
      // (on a bending surface: each point laid on the surface where it is, so the tail trails along it)
      const sides = this.tailSides || (this.tailSides = p.map(() => V()));
      if (bending) this.m1.copy(bent.body).invert();
      for (let i = 0; i < TAIL_POINTS; i++) {
        sides[i].copy(this.out);
        if (!bending) continue;
        this.onSurface(p[i].applyMatrix4(flat.body)).applyMatrix4(this.m1);
        sides[i].applyQuaternion(this.turnQ).transformDirection(this.m1);
      }
      for (let i = 0; i < TAIL_POINTS; i++) {
        const next = i < TAIL_POINTS - 1 ? p[i + 1] : this.target.copy(p[i]).multiplyScalar(2).sub(p[i - 1]);
        aim(this.tailJoints[i], p[i], next, sides[i]);
      }
      if (this.tailTube) this.tailTube.set(p, this.tailRadii, this.out);

      // ---- Eyes: the pupil swings round the dome: yaw moves it up/down the wall, pitch out toward the camera ----
      for (const e of this.eyes) e.look.rotation.set(0, -e.side * e.pitch, e.side * e.yaw);
    }

    // Where a point of its flat pose (in its own space) lies on the bending surface (controls.surface),
    // blended in by how much it's following it; also sets this.turnQ to how the surface there is turned.
    onSurface(p, out = p) {
      const s = this.lastSurface, k = this.bend;
      if (!s || k < 0.001) { this.turnQ.identity(); return out.copy(p); }
      const c = Math.cos(s.turn || 0), sn = Math.sin(s.turn || 0);
      const along = p.x * sn + p.y * c, across = p.x * c - p.y * sn;      // along its way, and sideways
      const at = s.at(along);
      const oy = at.y - Math.sin(at.a) * p.z, oz = at.z + Math.cos(at.a) * p.z;   // standing out from the surface
      const x = across * c + oy * sn, y = -across * sn + oy * c;
      this.turnQ.setFromAxisAngle(this.axis.set(c, -sn, 0), at.a * k);
      return out.set(p.x + (x - p.x) * k, p.y + (y - p.y) * k, p.z + (oz - p.z) * k);
    }

    // A stiff part (its flat matrix) laid on the surface at the spot q along it: moved and turned as that spot is.
    bendFrame(flatMatrix, q, out) {
      const on = this.onSurface(q, V());
      out.makeRotationFromQuaternion(this.turnQ);
      out.setPosition(on.sub(q.applyQuaternion(this.turnQ)));
      return out.multiply(flatMatrix);
    }

    dispose() {
      for (const g of this.geos) g.dispose();            // (version 2's shared skin stays, for the next chameleon)
      for (const m of this.mats) m.dispose();
      if (this.skin) Object.values(this.skin)[0].skeleton.dispose();
    }
  }

  // How far along its jump a leaping chameleon is, t through the leap: it stays put while it
  // coils, flies (fast at first, slowing as it reaches) until the front feet catch, then the
  // body pulls in the last little bit while the back legs swing in. lift: how far off the wall.
  Chameleon.LEAP_SECONDS = LEAP_SECONDS;
  Chameleon.leapPath = function (t) {
    const u = clamp((t - LEAP_CROUCH) / (LEAP_CATCH - LEAP_CROUCH), 0, 1);
    const fly = 1 - Math.pow(1 - u, 2);                                // springs off fast, slows at the catch
    const pull = clamp((t - LEAP_CATCH) / (LEAP_SETTLE - LEAP_CATCH), 0, 1);
    return { along: 0.94 * fly + 0.06 * pull * pull * (3 - 2 * pull), lift: Math.sin(Math.PI * u) };
  };

  return Chameleon;
})();
