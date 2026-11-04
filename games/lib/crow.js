// ============================================================================
// games/lib/crow.js: a low-poly crow with a real bird's skeleton
// ----------------------------------------------------------------------------
// Built in code from simple three.js shapes (no model files, so it works
// offline from the folder). Each wing has the joints a real wing has
// (shoulder, elbow, wrist) and separate flight feathers: secondaries along the
// forearm, and primaries on the hand whose outer five spread into "fingers".
// The feathers fan open and fold away as the joints move. The head stays level
// while the body tilts, the tail fans and twists to steer, and the legs tuck
// away in flight. Proportions follow storyboards/crow-model/references.
//
// A game drives it with a few simple controls, every frame:
//   const crow = new HG.Crow({ accent: "#e0662b" });  scene.add(crow.root);   // black, with colour accents
//   const crow = new HG.Crow({ colour: "#e0662b" });                          // the whole bird in one colour
//   crow.controls.mode = "fly" | "land" | "perch";
//   crow.controls.flap = 0..1   (0 = glide, 1 = full wingbeats)
//   crow.controls.bank = -1..1  (lean left / right)
//   crow.controls.look = null, or -1.4..1.4: perched, turn the head to this angle (radians, + = its left)
//                        instead of glancing about on its own
//   crow.controls.peck = 0..1   perched: stab forward and down with the beak open
//   crow.caw();                 perched: caw now
//   crow.update(dt);
// The crow eases smoothly between whatever the controls ask for.
// Try it in tools/bird-lab.html. Size: wingspan 1 unit (scale crow.root to taste).
// ============================================================================
HG.Crow = (function () {
  // ---- Tuning: how it moves ---------------------------------------------------
  const FLAP_HZ = 2.6;               // wingbeats per second at full flap
  const BRAKE_HZ = 3.2;              // the quick braking beats while landing
  const BANK_ROLL = 0.62;            // body roll at full bank (radians; 0.62 is about 35°)
  const EASE = 4;                    // how quickly it moves between actions (higher = snappier)
  const HEAD_LEVEL = 0.85;           // how much the head stays level when the body tilts (0 to 1)
  // ---- Tuning: how it looks -----------------------------------------------------
  const PLUMAGE = 0x1a1920;          // body feathers: black with a cool tint
  const FEATHER = 0x23222c;          // flight feathers: a shade lighter, so they read separately
  const SHEEN = 0x4a3f7a;            // the blue-purple sheen crows have in the light...
  const SHEEN_GLOSS = 0x8a90d0;      // ...and the colour of their glossy highlights
  const BARE = 0x1c1b20;             // beak and legs
  const ACCENT_GLOW = 0.35;          // how much the player's colour glows (0 = not at all)
  // ---- Body measurements (wingspan = 1) -----------------------------------------
  const ARM = 0.095, FOREARM = 0.115, HAND = 0.08;   // wing bone lengths
  const SHOULDER = [0.032, 0.022, -0.04];            // where the wings join the body
  const ELBOW_FOLD = 2.65, WRIST_FOLD = 2.75;        // how far the joints bend when fully folded (radians)
  // ----------------------------------------------------------------------------

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);
  const TAU = Math.PI * 2;

  // ==========================================================================
  // Shapes
  // ==========================================================================

  // One feather lying flat, its shaft along +x from the base (x = 0) to the tip
  // (x = len). Only the stretch from `from` to `to` (shares of the length) is
  // made, so a feather can be built in two pieces (the tip in the player's colour).
  // finger: the narrow, separated outer primaries. bend: the tip curls up a little.
  function featherGeo(len, width, finger, from, to, bend) {
    const round = (u) => (u > 0.7 ? Math.sqrt(Math.max(0, (1 - u) / 0.3)) : 1);
    const base = (u) => (u < 0.12 ? 0.45 + 0.55 * u / 0.12 : 1);
    const lead = (u) => width * 0.5 * base(u) * round(u) * (finger && u > 0.5 ? 0.5 : 0.8);   // outer vane: narrow
    const trail = (u) => width * 0.5 * base(u) * round(u) * (finger && u > 0.55 ? 0.75 : 1);  // inner vane
    const us = [];
    for (let k = 0; k <= 6; k++) us.push(from + (to - from) * k / 6);
    const shape = new THREE.Shape();
    us.forEach((u, k) => (k ? shape.lineTo(u * len, -lead(u)) : shape.moveTo(u * len, -lead(u))));
    for (let k = us.length - 1; k >= 0; k--) shape.lineTo(us[k] * len, trail(us[k]));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);                            // lie flat: the 2D shape's "up" becomes +z
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / len; p.setY(i, p.getY(i) + bend * len * u * u); }
    geo.computeVertexNormals();
    return geo;
  }

  // A plate of small covering feathers over the bones and the bases of the flight
  // feathers: a straight leading edge, and a scalloped trailing edge.
  function covertGeo(x0, x1, lead, depth0, depth1, scallops) {
    const shape = new THREE.Shape();
    shape.moveTo(x0, -lead);
    shape.lineTo(x1, -lead * 0.7);
    for (let k = scallops; k >= 0; k--) {
      const x = lerp(x0, x1, k / scallops), d = lerp(depth0, depth1, k / scallops);
      if (k < scallops) shape.lineTo(x + (x1 - x0) / scallops / 2, d + 0.012);
      shape.lineTo(x, d);
    }
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    return geo;
  }

  // A thin strip along a wing's leading edge, for the player's colour.
  function stripGeo(x0, x1, lead, width) {
    const shape = new THREE.Shape();
    shape.moveTo(x0, -lead - width * 0.4); shape.lineTo(x1, -lead * 0.7 - width * 0.4);
    shape.lineTo(x1, -lead * 0.7 + width * 0.6); shape.lineTo(x0, -lead + width * 0.6);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    return geo;
  }

  // Joins several shapes into one (positions and normals), so the body is a single piece.
  function join(parts) {
    const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const count = flat.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
    let at = 0;
    for (const g of flat) { pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3); at += g.attributes.position.count; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return geo;
  }

  // ==========================================================================
  // Poses: every joint angle, as plain numbers, so poses can be blended.
  // ==========================================================================
  // Wing: up (raise), sweep (forward +, back -), twist (leading edge up +), elbow and
  // wrist (0 = straight, 1 = folded), handUp (tip curls up), spread (fingers apart, 0 to 1).
  const GLIDE_WING = { up: 0.07, sweep: 0, twist: 0.04, elbow: 0.04, wrist: 0.04, handUp: 0.06, spread: 0.75 };

  // One full wingbeat, as six moments, read from the four-frame reference photo:
  // top (fingers spread) → downstroke (straight, feathers closed, sweeping forward)
  // → bottom (tips curl forward) → upstroke (wrist folds, hand trails back, feathers part).
  const BEAT = [
    { up: 0.95, sweep: -0.05, twist: 0.10, elbow: 0.22, wrist: 0.20, handUp: 0.25, spread: 1.0 },
    { up: 0.55, sweep: 0.10, twist: -0.12, elbow: 0.04, wrist: 0.04, handUp: 0.10, spread: 0.45 },
    { up: 0.02, sweep: 0.22, twist: -0.18, elbow: 0.00, wrist: 0.00, handUp: -0.05, spread: 0.2 },
    { up: -0.55, sweep: 0.25, twist: -0.05, elbow: 0.05, wrist: 0.06, handUp: -0.30, spread: 0.35 },
    { up: -0.28, sweep: 0.00, twist: 0.25, elbow: 0.45, wrist: 0.62, handUp: -0.10, spread: 0.8 },
    { up: 0.42, sweep: -0.20, twist: 0.25, elbow: 0.50, wrist: 0.50, handUp: 0.28, spread: 1.0 }
  ];

  // Smooth loop through the wingbeat (Catmull-Rom), phase 0 to 1.
  function beatAt(phase) {
    const n = BEAT.length, f = ((phase % 1) + 1) % 1 * n, i = Math.floor(f), t = f - i;
    const p0 = BEAT[(i + n - 1) % n], p1 = BEAT[i], p2 = BEAT[(i + 1) % n], p3 = BEAT[(i + 2) % n];
    const out = {};
    for (const k in p1) {
      const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
      out[k] = 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    }
    return out;
  }

  function mixInto(out, pose, weight) {
    for (const k in pose) {
      if (typeof pose[k] === "object") mixInto(out[k] || (out[k] = Array.isArray(pose[k]) ? [] : {}), pose[k], weight);
      else out[k] = (out[k] || 0) + pose[k] * weight;
    }
    return out;
  }
  const wingMix = (a, b, t) => { const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], t); return o; };

  // ==========================================================================
  // Version 2's skin (made in Blender; see blender/build_crow.py)
  // ==========================================================================
  // The pose the Blender model was built in: wings straight out, fingers spread, tail half
  // fanned, legs down. tools/crow-skeleton.cjs records the skeleton in this pose for Blender.
  const STRAIGHT_WING = { up: 0, sweep: 0, twist: 0, elbow: 0, wrist: 0, handUp: 0, spread: 1 };
  const BIND_POSE = {
    body: { pitch: 0, roll: 0, bob: 0 }, head: { pitch: 0, yaw: 0, level: 0 },
    tail: { spread: 0.5, pitch: 0, twist: 0 }, legs: { extend: 1, reach: 0 }, beak: 0,
    wings: [{ ...STRAIGHT_WING }, { ...STRAIGHT_WING }]
  };

  // Decode games/lib/crow-model.js once: its triangles become shared geometry (one per
  // material) and its pictures shared textures, reused by every crow.
  let assets = null;
  function skinAssets(model) {
    if (assets) return assets;
    const decode = (text, Type) => {
      const bin = atob(text), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Type(bytes.buffer);
    };
    const geometries = {};
    for (const g of model.groups) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(decode(g.position, Float32Array), 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(decode(g.normal, Float32Array), 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(decode(g.uv, Float32Array), 2));
      // Each corner moves with up to two joints (most move with one).
      const pairs = decode(g.bones, Uint8Array), first = decode(g.weight, Uint8Array);
      const index = new Uint16Array(g.vertices * 4), weight = new Float32Array(g.vertices * 4);
      for (let i = 0; i < g.vertices; i++) {
        index[4 * i] = pairs[2 * i]; index[4 * i + 1] = pairs[2 * i + 1];
        weight[4 * i] = first[i] / 255; weight[4 * i + 1] = 1 - first[i] / 255;
      }
      geo.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4));
      geo.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4));
      geo.setIndex(new THREE.BufferAttribute(decode(g.index, g.index32 ? Uint32Array : Uint16Array), 1));
      geometries[g.material] = geo;
    }
    const textures = {};
    for (const [name, src] of Object.entries(model.textures || {})) {
      const img = new Image();
      const tex = new THREE.Texture(img);
      img.onload = () => { tex.needsUpdate = true; };
      img.src = src;                                     // a picture embedded in the file, so it works offline
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;      // the body's feather pattern repeats
      tex.anisotropy = 4;
      textures[name] = tex;
    }
    return (assets = { geometries, textures });
  }

  // ==========================================================================
  // The crow
  // ==========================================================================
  class Crow {
    constructor(options = {}) {
      this.controls = { mode: "fly", flap: 0, bank: 0, look: null, peck: 0 };
      this.t = 0; this.phase = 0; this.brakePhase = 0; this.peck = 0; this.look = 0;
      this.weights = { fly: 1, land: 0, perch: 0 };
      this.flap = 0; this.bank = 0;
      this.idle = { yaw: 0, yawTarget: 0, nextLook: 1.5, nextCaw: 4, caw: 0 };
      this.mats = {
        // A soft, cool gloss: strong warm highlights made black feathers look pale from behind.
        plumage: new THREE.MeshPhysicalMaterial({ color: PLUMAGE, roughness: 0.62, metalness: 0, specularIntensity: 0.35, specularColor: SHEEN_GLOSS, sheen: 0.3, sheenColor: SHEEN, sheenRoughness: 0.5, flatShading: true, side: THREE.DoubleSide }),
        feather: new THREE.MeshPhysicalMaterial({ color: FEATHER, roughness: 0.58, metalness: 0, specularIntensity: 0.35, specularColor: SHEEN_GLOSS, sheen: 0.3, sheenColor: SHEEN, sheenRoughness: 0.45, flatShading: true, side: THREE.DoubleSide }),
        bare: new THREE.MeshStandardMaterial({ color: BARE, roughness: 0.6, flatShading: true }),
        eye: new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.12, metalness: 0.2 }),
        accent: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, flatShading: true, side: THREE.DoubleSide })
      };
      this.style = options.style || "edges+tips";
      this.setAccent(options.accent || "#e0662b");
      // Solid colour (for games, where each player needs to spot their bird at a glance):
      // the whole bird in that colour, the flight feathers a touch brighter than the body.
      if (options.colour) {
        const c = new THREE.Color(options.colour);
        this.mats.plumage.color.copy(c).multiplyScalar(0.82);
        this.mats.feather.color.copy(c);
        for (const m of [this.mats.plumage, this.mats.feather]) {
          m.sheenColor.copy(c).lerp(new THREE.Color(0xffffff), 0.35);
          m.specularColor.set(0xffffff);
        }
        this.style = "none";
      }
      this.geos = [];
      this.root = new THREE.Group();
      // Version 2: the skin made in Blender (games/lib/crow-model.js), when it's loaded.
      // Otherwise (or with { model: "v1" }) the bird is built from simple shapes here.
      this.skinned = options.model !== "v1" && !!HG.crowModel;
      this.joints = {};
      this.build();
      if (this.skinned) this.buildSkin();
      this.update(0);
    }

    // Name a joint, so the Blender model can find it (see blender/build_crow.py).
    joint(name, obj) { this.joints[name] = obj; return obj; }

    // ---- Version 2: wrap the Blender-made skin around this skeleton ----
    buildSkin() {
      const model = HG.crowModel, shared = skinAssets(model);
      // Pose the skeleton exactly as the model was built (the "bind pose"), then bind.
      this.apply(BIND_POSE);
      this.root.updateMatrixWorld(true);
      const bones = model.bones.map((name) => {
        if (!this.joints[name]) throw new Error("The crow model needs a joint called " + name);
        return this.joints[name];
      });
      const skeleton = new THREE.Skeleton(bones);
      const M = this.mats;
      // The Blender model's materials, mapped onto this crow's (so colours and styles still work).
      M.plumage.flatShading = false;                      // the body is smooth now
      M.covert = M.plumage.clone();
      M.plumage.map = shared.textures.plumage || null;
      M.covert.map = shared.textures.covert || null;
      M.feather.map = shared.textures.feather || null;
      const tipFeather = M.feather.clone();               // finger tips when they're not in the player's colour
      M.tipFeather = tipFeather;
      for (const m of Object.values(M)) m.needsUpdate = true;
      const pick = { plumage: M.plumage, covert: M.covert, feather: M.feather, tip: tipFeather, edge: M.accent, bare: M.bare, eye: M.eye };
      this.skin = {};
      for (const [name, geo] of Object.entries(shared.geometries)) {
        const mesh = new THREE.SkinnedMesh(geo, pick[name] || M.plumage);
        mesh.frustumCulled = false;                       // the wings move well outside the resting shape
        this.root.add(mesh);
        mesh.bind(skeleton, new THREE.Matrix4());
        this.skin[name] = mesh;
      }
      this.setStyle(this.style);
    }

    setAccent(colour) {
      this.mats.accent.color.set(colour);
      this.mats.accent.emissive.set(colour).multiplyScalar(ACCENT_GLOW);
    }

    // Which parts carry the player's colour: "edges+tips", "tips", "edges" or "none".
    setStyle(style) {
      this.style = style;
      const tips = style.includes("tips"), edges = style.includes("edges");
      for (const m of this.tipMeshes) m.material = tips ? this.mats.accent : this.mats.feather;
      for (const m of this.edgeMeshes) m.visible = edges;
      if (this.skin) {
        if (this.skin.tip) this.skin.tip.material = tips ? this.mats.accent : this.mats.tipFeather;
        if (this.skin.edge) this.skin.edge.visible = edges;
      }
    }

    mesh(geo, mat, parent) {
      if (this.skinned) { geo.dispose(); return new THREE.Object3D(); }   // version 2 has its own skin
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      parent.add(m);
      return m;
    }

    build() {
      const M = this.mats;
      this.tipMeshes = []; this.edgeMeshes = [];

      // ---- Body: a rounded, slightly flattened torso, pointing forward (-z) ----
      const body = this.body = this.joint("body", new THREE.Group());
      body.rotation.order = "ZXY";
      this.root.add(body);
      const torso = new THREE.LatheGeometry([
        [0, -0.11], [0.026, -0.1], [0.046, -0.07], [0.055, -0.03], [0.053, 0.015], [0.043, 0.055], [0.026, 0.088], [0.008, 0.105]
      ].map(([r, y]) => new THREE.Vector2(r, y)), 9);
      torso.rotateX(Math.PI / 2); torso.scale(1, 0.86, 1);
      this.mesh(torso, M.plumage, body);

      // ---- Neck and head: the head turns on the neck, and stays level in a tilt ----
      const head = this.head = this.joint("head", new THREE.Group());
      head.rotation.order = "YXZ";
      head.position.set(0, 0.018, -0.088);
      body.add(head);
      const neck = new THREE.IcosahedronGeometry(0.042, 1);           // the thick nape, blending into the body
      neck.scale(0.95, 0.88, 1.25); neck.translate(0, -0.002, -0.012);
      const skull = new THREE.IcosahedronGeometry(0.038, 1);
      skull.scale(0.9, 0.92, 1.22); skull.translate(0, 0.012, -0.05);
      this.mesh(join([neck, skull]), M.plumage, head);
      // The beak: deep and slightly hooked, in two halves so it can open to caw.
      const upper = new THREE.ConeGeometry(0.016, 0.064, 5);
      upper.rotateX(-Math.PI / 2); upper.scale(0.85, 1.15, 1); upper.translate(0, 0.0, -0.032);
      this.beakTop = this.joint("beakTop", new THREE.Group()); this.beakTop.position.set(0, 0.012, -0.078); this.beakTop.rotation.x = -0.12;
      this.mesh(upper, M.bare, this.beakTop); head.add(this.beakTop);
      const lower = new THREE.ConeGeometry(0.012, 0.05, 5);
      lower.rotateX(-Math.PI / 2); lower.scale(0.85, 0.7, 1); lower.translate(0, 0, -0.025);
      this.beakLow = this.joint("beakLow", new THREE.Group()); this.beakLow.position.set(0, 0.0, -0.081); this.beakLow.rotation.x = -0.1;
      this.mesh(lower, M.bare, this.beakLow); head.add(this.beakLow);
      for (const side of [-1, 1]) {
        const eye = new THREE.SphereGeometry(0.0065, 8, 6); eye.translate(side * 0.027, 0.024, -0.07);
        this.mesh(eye, M.eye, head);
      }

      // ---- Tail: seven feathers that fan open, with a rounded end ----
      const tail = this.tail = this.joint("tail", new THREE.Group());
      tail.rotation.order = "ZXY";
      tail.position.set(0, 0.006, 0.088);
      body.add(tail);
      this.tailFeathers = [];
      for (let i = 0; i < 7; i++) {
        const off = i - 3, len = 0.178 - Math.abs(off) * 0.006;
        const holder = this.joint("tail." + i, new THREE.Group());
        holder.position.y = -Math.abs(off) * 0.0015;
        this.mesh(featherGeo(len, 0.05, false, 0, 1, -0.02), M.feather, holder);
        tail.add(holder);
        this.tailFeathers.push({ holder, off });
      }

      // ---- Legs: tucked back in flight, down for landing and standing ----
      this.legs = [];
      for (const side of [-1, 1]) {
        const n = this.legs.length;
        const hip = this.joint("leg." + n + ".hip", new THREE.Group()); hip.position.set(side * 0.022, -0.028, 0.03);
        const shin = new THREE.CylinderGeometry(0.0045, 0.0055, 0.07, 5); shin.translate(0, -0.035, 0);
        const thigh = new THREE.CylinderGeometry(0.012, 0.016, 0.03, 6); thigh.translate(0, -0.005, 0);
        this.mesh(shin, M.bare, hip); this.mesh(thigh, M.plumage, hip);
        const foot = this.joint("leg." + n + ".foot", new THREE.Group()); foot.position.y = -0.07; hip.add(foot);
        const toes = [];
        for (const [ang, len] of [[-0.35, 0.038], [0, 0.042], [0.35, 0.036], [Math.PI, 0.028]]) {
          const toe = new THREE.CylinderGeometry(0.0025, 0.0035, len, 4);
          toe.translate(0, len / 2, 0); toe.rotateX(-Math.PI / 2); toe.rotateY(-ang);
          toes.push(toe);
        }
        this.mesh(join(toes), M.bare, foot);
        body.add(hip);
        this.legs.push({ hip, foot });
      }

      // ---- Wings ----
      this.wings = [-1, 1].map((side) => this.buildWing(side));
      this.setStyle(this.style);
    }

    // One wing. The mirror sits on an outer group, so both wings use the same angles.
    buildWing(side) {
      const M = this.mats;
      const tag = "wing." + (side < 0 ? 0 : 1) + ".";    // wing 0 is the left, wing 1 the right
      const mirror = new THREE.Group();
      mirror.position.set(side * SHOULDER[0], SHOULDER[1], SHOULDER[2]);
      mirror.scale.x = side;
      this.body.add(mirror);
      const shoulder = this.joint(tag + "shoulder", new THREE.Group()); shoulder.rotation.order = "YZX"; mirror.add(shoulder);   // the upper arm (humerus) runs along +x
      const elbow = this.joint(tag + "elbow", new THREE.Group()); elbow.position.x = ARM; shoulder.add(elbow);                 // the forearm
      const wrist = this.joint(tag + "wrist", new THREE.Group()); wrist.position.x = FOREARM; wrist.rotation.order = "YZX"; elbow.add(wrist);   // the hand

      const wing = { side, shoulder, elbow, wrist, tertials: [], secondaries: [], primaries: [] };
      const add =(list, parent, x, len, width, finger, y) => {
        const kind = list === wing.tertials ? "tertial" : list === wing.secondaries ? "secondary" : "primary";
        const holder = this.joint(tag + kind + "." + list.length, new THREE.Group()); holder.position.set(x, y, 0); parent.add(holder);
        const tipFrom = finger ? 0.8 : 1;
        this.mesh(featherGeo(len, width, finger, 0, tipFrom, finger ? 0.06 : 0.02), M.feather, holder);
        if (finger) this.tipMeshes.push(this.mesh(featherGeo(len, width, finger, tipFrom, 1, 0.06), M.feather, holder));
        list.push(holder);
        return holder;
      };
      // Tertials: three inner feathers on the upper arm, near the body.
      [0.05, 0.068, 0.086].forEach((x, i) => add(wing.tertials, shoulder, x, 0.135 + i * 0.008, 0.042, false, -0.001 * i));
      // Secondaries: eight along the forearm, pointing back (a crow's wing is broad near the body).
      for (let i = 0; i < 8; i++) add(wing.secondaries, elbow, 0.004 + i * (FOREARM - 0.008) / 7, 0.158 - i * 0.002, 0.042, false, 0.0012 * i);
      // Primaries: three inner ones, then the five outer "fingers".
      const anchors = [0.0, 0.016, 0.032, 0.046, 0.057, 0.066, 0.074, 0.08];
      const lengths = [0.14, 0.155, 0.175, 0.205, 0.225, 0.232, 0.222, 0.19];
      anchors.forEach((x, i) => add(wing.primaries, wrist, x, lengths[i], i < 3 ? 0.04 : 0.036, i >= 3, 0.0014 * i));
      // Coverts: the small feathers over the bones and feather bases (above the flight feathers).
      const covertY = 0.008;
      const armCovert = covertGeo(-0.03, ARM + 0.006, 0.026, 0.07, 0.06, 5); armCovert.translate(0, covertY, 0);
      const foreCovert = covertGeo(-0.004, FOREARM + 0.006, 0.022, 0.062, 0.05, 6); foreCovert.translate(0, covertY + 0.001, 0);
      const handCovert = covertGeo(-0.006, HAND + 0.004, 0.014, 0.045, 0.02, 4); handCovert.translate(0, covertY + 0.002, 0);
      // (They slim down as the wing folds, like real coverts, so a folded wing lies flat.)
      wing.coverts = [[armCovert, shoulder], [foreCovert, elbow], [handCovert, wrist]].map(([geo, parent], k) => {
        const holder = this.joint(tag + "covert." + k, new THREE.Group());
        parent.add(holder);
        this.mesh(geo, M.plumage, holder);
        return holder;
      });
      // The player's colour along the leading edge.
      for (const [parent, len, lead] of [[shoulder, ARM + 0.006, 0.026], [elbow, FOREARM + 0.006, 0.022], [wrist, HAND, 0.014]]) {
        const strip = stripGeo(-0.002, len, lead, 0.011); strip.translate(0, covertY + 0.004, 0);
        this.edgeMeshes.push(this.mesh(strip, M.accent, parent));
      }
      return wing;
    }

    // ---- The three kinds of pose ----
    flyPose() {
      const beat = beatAt(this.phase), b = this.bank, ab = Math.abs(b);
      const wings = [0, 1].map((i) => {
        const w = wingMix(GLIDE_WING, beat, this.flap);
        const inner = (b > 0) === (i === 1);                  // the wing on the inside of the turn
        if (ab > 0) {
          w.up += inner ? -0.12 * ab : 0.1 * ab;
          w.elbow += inner ? 0.14 * ab : 0;
          w.spread = clamp(w.spread + 0.15 * ab, 0, 1);
        }
        return w;
      });
      return {
        body: { pitch: -0.04, roll: -b * BANK_ROLL, bob: -0.012 * Math.cos(TAU * (this.phase - 0.15)) * this.flap },
        head: { pitch: 0.04, yaw: b * 0.28, level: HEAD_LEVEL },
        tail: { spread: 0.15 + 0.3 * ab, pitch: 0.04 + 0.04 * Math.sin(TAU * this.phase) * this.flap, twist: b * 0.4 },
        legs: { extend: 0, reach: 0 }, beak: 0, wings
      };
    }

    landPose() {
      const s = Math.sin(TAU * this.brakePhase);
      const w = { up: 0.55 + 0.32 * s, sweep: 0.5 + 0.12 * s, twist: 0.55, elbow: 0.12, wrist: 0.1, handUp: 0.25, spread: 1 };
      return {
        body: { pitch: 0.9, roll: 0, bob: 0.008 * s },
        head: { pitch: -0.3, yaw: 0, level: 1 },              // looking down at the landing spot
        tail: { spread: 1, pitch: 0.55, twist: 0 },
        legs: { extend: 1, reach: 0.55 }, beak: 0, wings: [w, { ...w }]
      };
    }

    perchPose() {
      // Folded: swept right back and turned on edge, so it lies flat against the body
      // with the wing tips crossing over the tail (angles found by a search that keeps
      // every feather inside the body's outline).
      const w = { up: 0.2, sweep: -1.9, twist: -1.5, elbow: 1, wrist: 1, handUp: 0, spread: 0 };
      const caw = this.idle.caw, peck = this.peck;
      // Pecking: the body tips forward, the head stabs down and the beak opens; the wings lift a little.
      if (peck > 0) { w.up += 0.35 * peck; w.sweep += 0.5 * peck; }
      return {
        body: { pitch: 0.45 - 0.12 * caw - 0.75 * peck, roll: 0, bob: 0.003 * Math.sin(TAU * this.t * 0.4) },
        head: { pitch: 0.05 + 0.25 * caw - 0.6 * peck, yaw: this.controls.look == null ? this.idle.yaw : this.look, level: 1 - 0.5 * peck },
        tail: { spread: 0.4 * peck, pitch: 0.12 - 0.15 * caw + 0.4 * peck, twist: 0 },
        legs: { extend: 1, reach: 0 }, beak: Math.max(caw, peck), wings: [w, { ...w }]
      };
    }

    // ---- Every frame ----
    update(dt) {
      const c = this.controls;
      this.t += dt;
      this.flap = ease(this.flap, clamp(c.flap, 0, 1), EASE, dt);
      this.bank = ease(this.bank, clamp(c.bank, -1, 1), EASE, dt);
      this.peck = ease(this.peck, clamp(c.peck || 0, 0, 1), 14, dt);           // a quick stab
      if (c.look != null) this.look = ease(this.look, clamp(c.look, -1.4, 1.4), 14, dt);   // snaps, like a bird
      for (const k in this.weights) this.weights[k] = ease(this.weights[k], c.mode === k ? 1 : 0, EASE, dt);
      this.phase += dt * FLAP_HZ;
      this.brakePhase += dt * BRAKE_HZ;
      this.updateIdle(dt);

      // Blend the poses by how much each action is happening right now.
      const total = this.weights.fly + this.weights.land + this.weights.perch || 1;
      const pose = {};
      if (this.weights.fly > 0.001) mixInto(pose, this.flyPose(), this.weights.fly / total);
      if (this.weights.land > 0.001) mixInto(pose, this.landPose(), this.weights.land / total);
      if (this.weights.perch > 0.001) mixInto(pose, this.perchPose(), this.weights.perch / total);
      this.apply(pose);
    }

    // Caw now (while perched).
    caw() { this.idle.cawFor = 0.5; this.idle.nextCaw = 4 + Math.random() * 4; }

    // Standing idle: quick head turns now and then, and the odd caw.
    updateIdle(dt) {
      const idle = this.idle;
      idle.nextLook -= dt; idle.nextCaw -= dt;
      if (idle.nextLook <= 0) { idle.yawTarget = (Math.random() - 0.5) * 1.6; idle.nextLook = 0.8 + Math.random() * 2.2; }
      idle.yaw = ease(idle.yaw, idle.yawTarget, 14, dt);           // birds turn their heads in quick snaps
      if (idle.nextCaw <= 0) { idle.cawFor = 0.45; idle.nextCaw = 5 + Math.random() * 5; }
      idle.cawFor = Math.max(0, (idle.cawFor || 0) - dt);
      idle.caw = ease(idle.caw, idle.cawFor > 0 ? 1 : 0, 16, dt);
    }

    apply(p) {
      const body = this.body;
      body.position.y = p.body.bob;
      body.rotation.set(p.body.pitch, 0, p.body.roll);
      // The head counters the body's tilt, so it stays level.
      this.head.rotation.set(-p.body.pitch * p.head.level + p.head.pitch, p.head.yaw, -p.body.roll * p.head.level);
      this.beakTop.rotation.x = -0.12 + 0.18 * p.beak;
      this.beakLow.rotation.x = -0.1 - 0.42 * p.beak;
      // Tail
      this.tail.rotation.set(p.tail.pitch, 0, p.tail.twist);
      for (const f of this.tailFeathers) f.holder.rotation.y = -Math.PI / 2 + f.off / 3 * (0.08 + 0.55 * p.tail.spread);
      // Legs: from tucked back to pointing down (straight down in the world when standing).
      this.legs.forEach(({ hip, foot }) => {
        const down = -p.body.pitch + p.legs.reach;
        hip.rotation.x = lerp(-1.4, down, p.legs.extend);
        foot.rotation.x = -(hip.rotation.x + p.body.pitch) * p.legs.extend;
        // Tucked away out of sight in flight (version 2's skin follows the joint, so it shrinks it away).
        const tucked = p.legs.extend <= 0.06;
        hip.scale.setScalar(tucked && this.skinned ? 0.0001 : lerp(0.75, 1, p.legs.extend));
        hip.visible = !tucked;
      });
      // Wings
      this.wings.forEach((w, i) => this.applyWing(w, p.wings[i]));
    }

    applyWing(w, q) {
      w.shoulder.rotation.set(q.twist, q.sweep, q.up);
      w.elbow.rotation.y = q.elbow * ELBOW_FOLD;
      w.wrist.rotation.set(0, -q.wrist * WRIST_FOLD, q.handUp);
      w.coverts[0].scale.z = w.coverts[1].scale.z = lerp(1, 0.3, q.elbow);
      w.coverts[2].scale.z = lerp(1, 0.35, q.wrist);
      // Feathers turn with the joints: straight out behind the wing when it's open,
      // lying back along the bones when it folds.
      w.tertials.forEach((f, i) => { f.rotation.y = lerp(-Math.PI / 2 - 0.12 + i * 0.04, -0.12, q.elbow); });
      w.secondaries.forEach((f, i) => { f.rotation.y = lerp(-Math.PI / 2 + i * 0.02, -Math.PI + 0.1 + i * 0.012, q.elbow); });
      const open = [-1.45, -1.22, -1.0, -0.82, -0.63, -0.45, -0.28, -0.12];
      const closed = [-1.4, -1.2, -1.02, -0.88, -0.77, -0.68, -0.6, -0.53];
      const folded = [-0.35, -0.3, -0.25, -0.2, -0.16, -0.12, -0.08, -0.05];
      w.primaries.forEach((f, i) => {
        f.rotation.y = lerp(lerp(closed[i], open[i], q.spread), folded[i], q.wrist);
        f.rotation.z = i >= 3 ? (0.03 + 0.25 * q.handUp) * (i - 2) / 5 * (1 - q.wrist) : 0;   // the fingers curl up at the tips
      });
    }

    // Where the toes are, relative to the crow's root (so a standing crow can be set on the ground).
    footHeight() {
      this.root.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      this.legs[0].foot.getWorldPosition(v);
      return this.root.worldToLocal(v).y;
    }

    dispose() {
      for (const g of this.geos) g.dispose();             // (version 2's shared skin stays, for the next crow)
      for (const k in this.mats) this.mats[k].dispose();
      if (this.skin) Object.values(this.skin)[0].skeleton.dispose();
    }
  }

  return Crow;
})();
