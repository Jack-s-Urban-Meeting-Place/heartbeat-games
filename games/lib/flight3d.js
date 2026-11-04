// ============================================================================
// games/lib/flight3d.js: the 3D world for the flying games
// ----------------------------------------------------------------------------
// Draws the valley in real 3D with three.js (js/vendor/three.min.js): sculpted
// terrain, a river, plants and rocks along the walls, a sky with clouds and
// distant ranges, the birds, and the nest the round starts in.
// The valley passes through ecosystems that blend into each other as you fly:
// Alpine (pines, snowy peaks) → High Desert (boulders, bushes, stone arches)
// → Deep Desert (cactus, sheer red cliffs) → Alpine again, and round and round.
// The games keep all the gameplay; each frame they tell this scene where the
// camera and birds are, and it draws them.
//
// Directions: the games measure distance (z) forward along the valley and x
// to the right. three.js looks along -z, so this file places things at -z.
// ============================================================================
HG.flight3d = (function () {
  const F = HG.flight;

  // ---- Look and feel ----------------------------------------------------------
  const FOV = 58;                    // camera field of view, degrees
  const CAMERA_HEIGHT = 8.6;         // metres above the valley floor while flying (looking down onto the wings)
  const BIRD_HEIGHT = 4.2;           // the birds' flying height
  const LOOK_DOWN_DEGREES = 15.5;    // puts the horizon about a quarter of the way down the screen
  const NEST_HEIGHT = 3.0;           // the nest sits this high on its branch
  const RIVER_HALF = 2.2;            // half the river's width, metres
  const SLOPE = 26;                  // metres from the valley edge to the ridge top
  const SNOWLINE = 50;               // snow above about this height
  const BIRD_SPAN = 6.6;             // the crows' wingspan, metres (game-sized: much bigger than a real crow, to read on screen)
  const FOG_NEAR = 160, FOG_FAR = 1050;

  // ---- Ecosystems ---------------------------------------------------------------
  const ZONE_LENGTH = 1000;          // metres of each ecosystem
  const ZONE_BLEND = 200;            // the last this-many metres of each one blend into the next
  const ARCHES_PER_ZONE = 3;         // stone arches over the valley in each High Desert stretch
  const ARCH_HEIGHT = 23;            // height of an arch's middle, metres (keep above 21: the camera flies at up to about 14 m)
  const CLIFF_SHARE = 0.55;          // in the Deep Desert, about this share of the walls are sheer cliffs
  const CLIFF_HEIGHT = 30;           // how tall the sheer cliffs are, metres
  const BOULDERS_PER_CHUNK = 22;     // rocks per 60 m of desert
  // Sky colours for each ecosystem: overhead, haze at the horizon, the two rings of distant mountains, sunlight.
  const SKIES = [
    { top: 0x5ea6e0, horizon: 0xf3dfcb, ranges: [0x9ea6c9, 0x8f91b8], sun: 0xffe8c8 },   // Alpine
    { top: 0x67acdf, horizon: 0xf5d6b0, ranges: [0xc8ab9e, 0xb59893], sun: 0xffe2b6 },   // High Desert
    { top: 0x7ab4dc, horizon: 0xf7cb94, ranges: [0xdbae8b, 0xc89679], sun: 0xffd8a2 }    // Deep Desert
  ];
  // What the light bounces off the valley floor in each ecosystem (lights the undersides of things a little).
  const BOUNCE = [0x5d7a3e, 0x9a8456, 0xb07a4a];

  // ---- Light (since 2.27.0) -------------------------------------------------------
  const SUN_STRENGTH = 2.7;          // how bright the sunlight is
  const SUN_FROM = [-0.4, 0.88, -0.32];   // which way the sun is: left, up, ahead (high, so the birds' shadows fall close under them; was [-0.55, 0.65, -0.5])
  const SKY_FILL = 1.15;             // the light from the sky: blue from above, and from below, the colour bounced off the valley floor
  const SOFT_LIGHT = 1.0;            // how strongly the river (and the birds, a little) mirror the sky (0 = not at all). Only those:
                                     // for everything, it tripled the drawing work in tests (the whole screen is valley)
  const SHADOWS = true;              // real shadows: the birds' (wings and all) on the ground, and of trees, rocks and the nest near them
  const SHADOW_AHEAD = 150;          // ...drawn this far (metres) down the valley ahead of the birds...
  const SHADOW_BEHIND = 15;          // ...this far behind them (under the camera)...
  const SHADOW_WIDE = 50;            // ...and this far to each side of the valley's middle; further away, no shadows
  const SHADOW_DETAIL = 2048;        // how finely they're drawn (dots across the shadow area; 1024 = blurrier, less work)
  const CREASES = 0.35;              // how much darker the ground is in hollows and at the foot of the slopes (0 = not at all)
  const GROUND_SPECKLE = 0.12;       // small patches of lighter and darker ground, so the valley floor isn't one flat colour
  const GLOW = false;                // a soft glow round the brightest things, and slightly darker corners. Off: the sun is never in
                                     // view here, so it showed little, and it was the next biggest cost (true to try it)
  const GLOW_FROM = 0.85, GLOW_STRENGTH = 0.4, GLOW_SPREAD = 1.0, VIGNETTE = 0.18;   // (as in Climb Together: games/lib/glow.js)
  // ----------------------------------------------------------------------------

  const CHUNK = 60, ROW = 2.5;       // terrain is built in 60 m sections, a row every 2.5 m
  const AHEAD = 1000, BEHIND = 90;   // how far ahead and behind to keep terrain
  const PLANTS_PER_CHUNK = 34;       // trees, bushes or cactus, depending on the ecosystem
  const BIRD_AHEAD = F.BIRD_AHEAD;
  const smooth = F.smooth, clamp = F.clamp;

  // ---- Noise: gentle randomness for natural-looking ground --------------------
  function hash(x, z, seed) { const n = Math.sin(x * 127.1 + z * 311.7 + seed * 0.0131) * 43758.5453; return n - Math.floor(n); }
  function noise(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, seed) {
    let sum = 0, amp = 0.5, freq = 1;
    for (let i = 0; i < 4; i++) { sum += amp * noise(x * freq, z * freq, seed + i * 17); freq *= 2.03; amp *= 0.5; }
    return sum / 0.9375;             // 0 to 1
  }
  function seeded(seed) { let x = (seed % 2147483646) + 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; }

  // ---- Which ecosystem is where ---------------------------------------------------
  const ALPINE = 0, HIGH_DESERT = 1, DEEP_DESERT = 2;
  // How much of each ecosystem there is at distance z: [alpine, high desert, deep desert], adding up to 1.
  function zoneWeights(z) {
    const cycle = ZONE_LENGTH * 3, along = ((z % cycle) + cycle) % cycle;
    const zone = Math.floor(along / ZONE_LENGTH), into = along - zone * ZONE_LENGTH;
    const next = smooth(clamp((into - (ZONE_LENGTH - ZONE_BLEND)) / ZONE_BLEND, 0, 1));
    const w = [0, 0, 0];
    w[zone] = 1 - next; w[(zone + 1) % 3] += next;
    return w;
  }

  // How sheer the wall on one side (-1 left, +1 right) is at distance z: 0 = a sloping
  // mountainside, 1 = a straight-up cliff. Only in the Deep Desert, in long stretches.
  function cliffAt(world, z, side) {
    const deep = zoneWeights(z)[DEEP_DESERT];
    if (deep <= 0) return 0;
    const n = noise(z * 0.008, side * 7.3, world.seed + 21);
    return deep * smooth(clamp((n - (1 - CLIFF_SHARE)) / 0.12 + 0.5, 0, 1));
  }

  // The height of the ground at distance z, sideways position x.
  function groundAt(world, z, x) {
    const u = x - world.centre(z), half = world.halfWidth(z), out = Math.abs(u) - half;
    const bumps = 0.35 * fbm(x * 0.08, z * 0.08, world.seed);
    if (out <= 0) {
      const river = Math.max(0, 1 - (u / RIVER_HALF) * (u / RIVER_HALF));
      return bumps - 1.1 * river;                      // the floor, with the river cut into it
    }
    const side = u < 0 ? -1 : 1;
    const ridge = world.height(z, side);
    const t = out / SLOPE;
    const rise = t < 1 ? t * t * (3 - 2 * t) : 1 + Math.min(t - 1, 4) * 0.4;
    const rugged = fbm(x * 0.03, z * 0.03, world.seed + 5) * 2 - 1;
    const slope = bumps + ridge * rise * (0.85 + 0.35 * rugged) + rugged * 7 * Math.min(1, t);
    const cliff = cliffAt(world, z, side);
    if (cliff <= 0) return slope;
    // A sheer cliff just beyond the valley floor, a flat mesa top, then a second, set-back step.
    const wall = clamp((out - 1.5) / 2.2, 0, 1), step = clamp((out - 34) / 2.2, 0, 1);
    const sheer = bumps + wall * (CLIFF_HEIGHT + 4 * rugged) + step * (14 + 4 * rugged);
    return slope + (sheer - slope) * cliff;
  }

  // ---- Colours ------------------------------------------------------------------
  const C = (hex) => new THREE.Color(hex);
  const PAL = {
    // Alpine: green grass, cool grey-purple rock, snow
    grassA: C(0x7cb35b), grassB: C(0x5f9a49), grassDark: C(0x4c7f3f), sand: C(0xc9b48a),
    rockWarm: C(0x9c7f6d), rockCool: C(0x7d7590), rockDark: C(0x5c5468), snow: C(0xf4f6fb),
    // High Desert: dry grass and sage on the floor, tan rock
    dryA: C(0xbfae72), dryB: C(0xa8995c), sage: C(0x8c9b66),
    tanA: C(0xc99a6c), tanB: C(0xb27b55), tanDark: C(0x86563c),
    // Deep Desert: sand on the floor, red rock in pale layers
    duneA: C(0xe4c48e), duneB: C(0xd6aa72),
    redA: C(0xd27c4a), redB: C(0xb8613a), redDark: C(0x8c4129), redPale: C(0xe8b07a)
  };
  const tmp = new THREE.Color(), tmp2 = new THREE.Color(), mixed = new THREE.Color();

  // The ground's colour at one spot, blending the ecosystems that meet there.
  function groundColour(world, z, x, h, steep) {
    const u = x - world.centre(z), out = Math.abs(u) - world.halfWidth(z);
    const n = fbm(x * 0.05, z * 0.05, world.seed + 9);
    const w = zoneWeights(z);
    mixed.setRGB(0, 0, 0);
    for (let zone = 0; zone < 3; zone++) if (w[zone] > 0) mixed.add(zoneColour(zone, u, out, h, steep, n).multiplyScalar(w[zone]));
    return mixed.multiplyScalar(1 + GROUND_SPECKLE * (fbm(x * 0.4, z * 0.4, world.seed + 13) * 2 - 1));   // (small lighter and darker patches)
  }

  // The ground's colour in one ecosystem. u: sideways from the river; out: metres beyond the valley floor.
  function zoneColour(zone, u, out, h, steep, n) {
    if (out <= 0) {                                       // the valley floor, with sandy river banks
      if (zone === ALPINE) tmp.copy(PAL.grassA).lerp(PAL.grassB, n);
      else if (zone === HIGH_DESERT) tmp.copy(PAL.dryA).lerp(PAL.dryB, n).lerp(PAL.sage, clamp((n - 0.55) * 4, 0, 0.7));
      else tmp.copy(PAL.duneA).lerp(PAL.duneB, n);
      if (Math.abs(u) < RIVER_HALF + 1.4) tmp.lerp(PAL.sand, clamp(1 - (Math.abs(u) - RIVER_HALF) / 1.4, 0, 1));
      return tmp;
    }
    if (zone === ALPINE) {                                // rock, grassy lower slopes, snowy tops
      tmp.copy(PAL.rockWarm).lerp(PAL.rockCool, n);
      tmp.lerp(PAL.rockDark, clamp((steep - 0.8) * 0.5, 0, 0.6));
      const grassy = clamp((10 + n * 10 - h) / 6, 0, 1) * clamp(1.4 - steep, 0, 1);
      if (grassy > 0) tmp.lerp(tmp2.copy(PAL.grassDark).lerp(PAL.grassB, n), grassy);
      const snow = clamp((h - SNOWLINE - n * 14) / 6, 0, 1) * clamp(2 - steep, 0, 1);
      if (snow > 0) tmp.lerp(PAL.snow, snow);
      return tmp;
    }
    if (zone === HIGH_DESERT) {                           // tan rock, scrubby lower slopes
      tmp.copy(PAL.tanA).lerp(PAL.tanB, n);
      tmp.lerp(PAL.tanDark, clamp((steep - 0.8) * 0.5, 0, 0.5));
      const scrub = clamp((8 + n * 8 - h) / 6, 0, 1) * clamp(1.4 - steep, 0, 1);
      if (scrub > 0) tmp.lerp(tmp2.copy(PAL.sage).lerp(PAL.dryB, n), scrub * 0.8);
      return tmp;
    }
    tmp.copy(PAL.redA).lerp(PAL.redB, n);                 // Deep Desert: red rock in pale layers
    const band = 0.5 + 0.5 * Math.sin(h * 0.55 + n * 2.5);
    tmp.lerp(PAL.redPale, band * band * 0.45);
    tmp.lerp(PAL.redDark, clamp((steep - 0.8) * 0.15, 0, 0.3));
    return tmp;
  }

  // Sideways positions of the terrain columns: close together near the valley, spreading out far away.
  const COLUMNS = (() => {
    const side = []; let u = 0, step = 1.6;
    while (u < 520) { side.push(u); u += step; if (u > 24) step *= 1.11; }
    return [...side.slice(1).reverse().map((v) => -v), ...side];
  })();

  // ---- Shared shapes and materials ------------------------------------------------
  // Joins several simple shapes into one (positions and normals only).
  function joinShapes(parts) {
    const flat = parts.map((g) => g.index ? g.toNonIndexed() : g);
    const count = flat.reduce((n, g) => n + g.attributes.position.count, 0);
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
    let at = 0;
    for (const g of flat) {
      pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3);
      at += g.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    return geo;
  }

  // Nudges every corner of a shape by a little randomness, for a rough, rocky look.
  // Corners in the same place move together, so no cracks open up.
  function roughen(geo, amount, seed) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.round(x * 20) * 0.37 + Math.round(y * 20) * 0.61 + Math.round(z * 20) * 0.83;
      p.setXYZ(i, x + (hash(k, 1, seed) - 0.5) * amount, y + (hash(k, 2, seed) - 0.5) * amount, z + (hash(k, 3, seed) - 0.5) * amount);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // A saguaro cactus about 5 m tall: a trunk with two upturned arms.
  function cactusShape() {
    const piece = (r, h, x, y, z, turn) => {
      const g = new THREE.CylinderGeometry(r, r * 1.05, h, 7);
      if (turn) g.rotateZ(Math.PI / 2);
      g.translate(x, y, z); return g;
    };
    const cap = (r, x, y) => { const g = new THREE.SphereGeometry(r, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(x, y, 0); return g; };
    return joinShapes([
      piece(0.38, 5, 0, 2.5, 0), cap(0.38, 0, 5),
      piece(0.26, 0.9, 0.5, 2.2, 0, true), piece(0.26, 1.7, 0.95, 3.0, 0), cap(0.26, 0.95, 3.85),
      piece(0.24, 0.8, -0.45, 2.9, 0, true), piece(0.24, 1.2, -0.85, 3.45, 0), cap(0.24, -0.85, 4.05)
    ]);
  }

  let shared = null;
  function makeShared() {
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const riverMat = new THREE.MeshStandardMaterial({ color: 0x3f86bf, roughness: 0.08, metalness: 0.1, emissive: 0x0b2236 });   // (smooth, so it mirrors the sky)
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.ConeGeometry(1, 1, 7); crownGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 1 });
    // Plants and rocks are white, coloured one by one, so each can be a slightly different shade.
    const plainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const blob = (r, x, y, z) => { const g = new THREE.IcosahedronGeometry(r, 0); g.translate(x, y, z); return g; };
    const bushGeo = roughen(joinShapes([blob(0.75, 0, 0.55, 0), blob(0.55, 0.6, 0.4, 0.2), blob(0.5, -0.55, 0.35, -0.25), blob(0.45, 0.1, 0.35, -0.6)]), 0.12, 4);
    const boulderGeo = roughen(new THREE.DodecahedronGeometry(1, 1), 0.45, 9);
    const cactusGeo = cactusShape();
    const archMat = new THREE.MeshStandardMaterial({ color: 0xc28b5f, roughness: 1, flatShading: true });
    return { groundMat, riverMat, trunkGeo, crownGeo, trunkMat, crownMat: plainMat, plainMat, bushGeo, boulderGeo, cactusGeo, archMat };
  }

  // Where the stone arches stand, between z0 and z1: a few in each High Desert stretch.
  function archesBetween(world, z0, z1) {
    const cycle = ZONE_LENGTH * 3, found = [];
    const usable = ZONE_LENGTH - ZONE_BLEND - 200;        // keep clear of the blends at each end
    for (let c = Math.floor(z0 / cycle); c <= Math.floor(z1 / cycle); c++) {
      const start = c * cycle + ZONE_LENGTH + 150;
      for (let k = 0; k < ARCHES_PER_ZONE; k++) {
        const z = start + (k + 0.25 + 0.5 * hash(c, k, world.seed + 41)) * usable / ARCHES_PER_ZONE;
        if (z >= z0 && z < z1) found.push(z);
      }
    }
    return found;
  }

  // A natural stone arch spanning the valley at distance z, its feet buried in the slopes either side.
  function buildArch(world, z, group) {
    const c = world.centre(z), reach = world.halfWidth(z) + 7;
    const footL = groundAt(world, z, c - reach) - 3, footR = groundAt(world, z, c + reach) - 3;
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const s = i / 24, a = Math.PI * (1 - s), base = footL + (footR - footL) * s;
      points.push(new THREE.Vector3(c + reach * Math.cos(a), base + (ARCH_HEIGHT - base) * Math.sin(a), -z));
    }
    const geo = roughen(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 2.6, 7, false), 1.4, Math.round(z));
    group.add(new THREE.Mesh(geo, shared.archMat));
    // Chunky rocks where the arch meets the ground.
    const rocks = new THREE.InstancedMesh(shared.boulderGeo, shared.archMat, 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(5, 4, 4.5);
    rocks.setMatrixAt(0, m.compose(new THREE.Vector3(c - reach + 1, footL + 3, -z), q, sc));
    rocks.setMatrixAt(1, m.compose(new THREE.Vector3(c + reach - 1, footR + 3, -z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.3), sc));
    group.add(rocks);
    return [geo, rocks];
  }

  // ---- One 60 m section of valley: ground, river and trees -------------------------
  function buildChunk(world, index, group) {
    const z0 = index * CHUNK, rows = Math.round(CHUNK / ROW) + 1, cols = COLUMNS.length;
    const pos = new Float32Array(rows * cols * 3), nor = new Float32Array(rows * cols * 3), col = new Float32Array(rows * cols * 3);
    const e = 0.9;
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * ROW, c0 = world.centre(z);
      for (let c = 0; c < cols; c++) {
        const x = c0 + COLUMNS[c], i = (r * cols + c) * 3;
        const h = groundAt(world, z, x);
        const dx = (groundAt(world, z, x + e) - groundAt(world, z, x - e)) / (2 * e);
        const dz = (groundAt(world, z + e, x) - groundAt(world, z - e, x)) / (2 * e);
        pos[i] = x; pos[i + 1] = h; pos[i + 2] = -z;
        const len = Math.hypot(dx, 1, dz);
        nor[i] = -dx / len; nor[i + 1] = 1 / len; nor[i + 2] = dz / len;
        const colour = groundColour(world, z, x, h, Math.hypot(dx, dz));
        col[i] = colour.r; col[i + 1] = colour.g; col[i + 2] = colour.b;
      }
    }
    // Creases: where the ground dips below its neighbours across the valley (the foot of a slope, a gully, the
    // river's banks), less light gets in, so it's a little darker. (Across only, so the 60 m sections match up.)
    if (CREASES > 0) for (let r = 0; r < rows; r++) for (let c = 3; c < cols - 3; c++) {
      const i = (r * cols + c) * 3, h = pos[i + 1];
      const around = (pos[i + 1 - 9] + pos[i + 1 + 9]) / 2;           // the ground three columns either side
      const dark = 1 - CREASES * clamp((around - h) / 1.6, 0, 1);
      col[i] *= dark; col[i + 1] *= dark; col[i + 2] *= dark;
    }
    const index32 = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, f = d + 1;
      index32.push(a, b, d, b, f, d);          // counter-clockwise from above, so the ground faces up
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(index32);
    const ground = new THREE.Mesh(geo, shared.groundMat);
    group.add(ground);

    // The river: a ribbon of water following the valley.
    const rpos = new Float32Array(rows * 2 * 3), ridx = [];
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * ROW, c0 = world.centre(z);
      for (let k = 0; k < 2; k++) {
        const i = (r * 2 + k) * 3;
        rpos[i] = c0 + (k ? 1 : -1) * RIVER_HALF * 0.92; rpos[i + 1] = -0.35; rpos[i + 2] = -z;
      }
      if (r < rows - 1) { const a = r * 2; ridx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
    rgeo.setIndex(ridx); rgeo.computeVertexNormals();
    group.add(new THREE.Mesh(rgeo, shared.riverMat));

    // Plants along the foot of the valley walls and up the lower slopes: pine trees
    // in the Alpine, bushes in the High Desert, cactus and bushes in the Deep Desert.
    const rand = seeded(world.seed * 31 + index * 7919);
    const N = PLANTS_PER_CHUNK, up = new THREE.Vector3(0, 1, 0);
    const trunks = new THREE.InstancedMesh(shared.trunkGeo, shared.trunkMat, N);
    const crowns = new THREE.InstancedMesh(shared.crownGeo, shared.crownMat, N);
    const bushes = new THREE.InstancedMesh(shared.bushGeo, shared.plainMat, N);
    const cacti = new THREE.InstancedMesh(shared.cactusGeo, shared.plainMat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const steepAt = (z, x) => Math.abs(groundAt(world, z, x + 1) - groundAt(world, z, x - 1)) / 2;
    const pickZone = (z) => { const w = zoneWeights(z), r = rand(); return r < w[0] ? ALPINE : r < w[0] + w[1] ? HIGH_DESERT : DEEP_DESERT; };
    let trees = 0, nBushes = 0, nCacti = 0;
    for (let t = 0; t < N * 2 && trees + nBushes + nCacti < N; t++) {
      const z = z0 + rand() * CHUNK, side = rand() < 0.5 ? -1 : 1;
      const u = side * (world.halfWidth(z) * 0.97 + Math.pow(rand(), 1.6) * 40);
      const x = world.centre(z) + u, h = groundAt(world, z, x);
      if (h > 26 || steepAt(z, x) > 3) continue;          // nothing high on the mountains, or on a cliff face
      const zone = pickZone(z);
      q.setFromAxisAngle(up, rand() * 6.28);
      if (zone === ALPINE) {
        const height = 5 + rand() * 6, width = height * (0.28 + rand() * 0.1);
        p.set(x, h - 0.2, -z);
        sc.set(1, height * 0.35, 1); m.compose(p, q, sc); trunks.setMatrixAt(trees, m);
        p.y += height * 0.25;
        sc.set(width, height * 0.8, width); m.compose(p, q, sc); crowns.setMatrixAt(trees, m);
        crowns.setColorAt(trees, tmp.setHSL(0.27 + rand() * 0.08, 0.38 + rand() * 0.15, 0.24 + rand() * 0.1));
        trees++;
      } else if (zone === DEEP_DESERT && rand() < 0.55) {
        const size = 0.6 + rand() * 0.6;
        p.set(x, h - 0.3, -z); sc.setScalar(size); m.compose(p, q, sc); cacti.setMatrixAt(nCacti, m);
        cacti.setColorAt(nCacti, tmp.setHSL(0.28 + rand() * 0.06, 0.35 + rand() * 0.12, 0.3 + rand() * 0.08));
        nCacti++;
      } else {
        const wide = (zone === HIGH_DESERT ? 0.8 : 0.6) + rand() * 0.7;
        p.set(x, h - 0.2, -z); sc.set(wide, wide * (0.7 + rand() * 0.3), wide); m.compose(p, q, sc); bushes.setMatrixAt(nBushes, m);
        bushes.setColorAt(nBushes, zone === HIGH_DESERT
          ? tmp.setHSL(0.2 + rand() * 0.07, 0.38 + rand() * 0.15, 0.3 + rand() * 0.08)       // sage and olive green
          : tmp.setHSL(0.13 + rand() * 0.05, 0.4 + rand() * 0.15, 0.34 + rand() * 0.08));    // dry, golden-green
        nBushes++;
      }
    }
    trunks.count = trees; crowns.count = trees; bushes.count = nBushes; cacti.count = nCacti;
    group.add(trunks, crowns, bushes, cacti);
    const parts = [geo, rgeo, trunks, crowns, bushes, cacti];

    // Boulders in the deserts: small ones on the valley floor near the walls, big ones on the slopes.
    const desert = 1 - zoneWeights(z0 + CHUNK / 2)[ALPINE];
    const wanted = Math.round(BOULDERS_PER_CHUNK * desert);
    if (wanted > 0) {
      const rocks = new THREE.InstancedMesh(shared.boulderGeo, shared.plainMat, wanted);
      let nRocks = 0;
      for (let t = 0; t < wanted * 2 && nRocks < wanted; t++) {
        const z = z0 + rand() * CHUNK, side = rand() < 0.5 ? -1 : 1, half = world.halfWidth(z);
        const onFloor = rand() < 0.35;
        const u = side * (onFloor ? half * (0.55 + rand() * 0.4) : half + 1 + Math.pow(rand(), 1.4) * 26);
        const x = world.centre(z) + u, h = groundAt(world, z, x);
        if (!onFloor && (h > 30 || steepAt(z, x) > 3)) continue;
        const size = onFloor ? 0.6 + rand() * 1.1 : 1.5 + Math.pow(rand(), 2) * 5.5;
        p.set(x, h + size * 0.25, -z);
        q.setFromAxisAngle(up, rand() * 6.28);
        sc.set(size * (0.9 + rand() * 0.5), size * (0.6 + rand() * 0.4), size * (0.9 + rand() * 0.5));
        m.compose(p, q, sc); rocks.setMatrixAt(nRocks, m);
        const red = pickZone(z) === DEEP_DESERT;
        rocks.setColorAt(nRocks, tmp.copy(red ? PAL.redB : PAL.tanB).lerp(red ? PAL.redPale : PAL.tanA, rand()).multiplyScalar(0.85 + rand() * 0.2));
        nRocks++;
      }
      rocks.count = nRocks;
      group.add(rocks); parts.push(rocks);
    }

    // Stone arches over the valley in the High Desert.
    for (const z of archesBetween(world, z0, z0 + CHUNK)) parts.push(...buildArch(world, z, group));
    // Shadows (only drawn near the birds): everything here takes shadows; the trees, bushes, cactus, rocks and arches
    // cast them. (Not the ground: the valley walls' shadows across the floor stopped in a hard line at the edge of
    // the area shadows are drawn in.)
    if (SHADOWS) group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = o !== ground && o.material !== shared.riverMat; } });
    return parts;
  }

  // ---- A bird: the crow from games/lib/crow.js, all in the player's colour, plus its shadow ----
  function makeBird(colour) {
    const crow = new HG.Crow({ colour });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.y = 0.55;
    return { crow, root: crow.root, shadow };
  }

  // ---- The tree, branch, leaves and nest the round starts in --------------------------
  function makeNest(world, x, z, count) {
    const group = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x6e4b32, roughness: 1 });
    const twigMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
    const ground = groundAt(world, z, x - 8);
    // Trunk on the left, reaching up out of view, with a big leafy crown.
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 34, 10), bark);
    trunk.position.set(x - 8, ground + 17, -z); group.add(trunk);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x4e8a3e, roughness: 0.9, flatShading: true });
    const rand = seeded(world.seed + 3);
    for (let i = 0; i < 9; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + rand() * 2.5, 1), crownMat);
      blob.position.set(x - 8 + (rand() - 0.5) * 9, ground + 16 + rand() * 10, -z + (rand() - 0.5) * 7);
      group.add(blob);
    }
    // The branch: from the trunk, under the nest, and on out to the right.
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x - 7.6, NEST_HEIGHT - 0.9, -z + 0.3), new THREE.Vector3(x - 2, NEST_HEIGHT - 1.1, -z),
      new THREE.Vector3(x + 2.5, NEST_HEIGHT - 0.6, -z - 0.3), new THREE.Vector3(x + 7, NEST_HEIGHT + 1.6, -z - 1.2),
      new THREE.Vector3(x + 10, NEST_HEIGHT + 4.2, -z - 2)
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path, 40, 0.32, 8, false), bark));
    const twig = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x + 4.2, NEST_HEIGHT + 0.1, -z - 0.6), new THREE.Vector3(x + 4.8, NEST_HEIGHT + 2.2, -z - 0.9),
      new THREE.Vector3(x + 4.4, NEST_HEIGHT + 4.4, -z - 1.1)
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(twig, 16, 0.12, 6, false), bark));
    // Leaves along the branch and twig.
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.35, 0.3, 0.75, 0); leafShape.quadraticCurveTo(0.35, -0.3, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 4);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 90);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < 90; i++) {
      const onTwig = i % 4 === 0, at = 0.25 + rand() * 0.75;
      p.copy((onTwig ? twig : path).getPoint(onTwig ? rand() : at));
      p.x += (rand() - 0.5) * 1.2; p.y += (rand() - 0.3) * 1.1; p.z += (rand() - 0.5) * 1.2;
      if (Math.abs(p.x - x) < 2.4 && p.y > NEST_HEIGHT - 0.4) p.y -= 1.4;   // keep leaves out of the nest
      e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28); q.setFromEuler(e);
      s.setScalar(0.9 + rand() * 0.8); m.compose(p, q, s); leaves.setMatrixAt(i, m);
      leaves.setColorAt(i, tmp.setHSL(0.26 + rand() * 0.07, 0.45 + rand() * 0.2, 0.3 + rand() * 0.14));
    }
    group.add(leaves);
    // The nest: a dark hollow inside a woven rim of twigs.
    const hollow = new THREE.Mesh(new THREE.SphereGeometry(1.75, 18, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1, side: THREE.DoubleSide }));
    hollow.scale.y = 0.55; hollow.position.set(x, NEST_HEIGHT + 0.55, -z); group.add(hollow);
    const base = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.5, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 1 }));
    base.rotation.x = Math.PI / 2; base.scale.z = 0.75; base.position.set(x, NEST_HEIGHT + 0.42, -z); group.add(base);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(1.8, 18, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x5c3f27, roughness: 1 }));
    bottom.scale.y = 0.45; bottom.position.set(x, NEST_HEIGHT + 0.3, -z); group.add(bottom);
    const twigGeo = new THREE.CylinderGeometry(0.04, 0.05, 1, 5);
    const twigs = new THREE.InstancedMesh(twigGeo, twigMat, 900);
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    for (let i = 0; i < 900; i++) {
      // Twigs wrap around the rim, following it, tilted a little up or down as if woven.
      const a = rand() * Math.PI * 2, around = rand() * Math.PI * 2;
      const tube = 0.5 * (0.75 + rand() * 0.4);
      const ring = 1.75 + Math.cos(around) * tube;
      p.set(x + Math.cos(a) * ring, NEST_HEIGHT + 0.42 + Math.sin(around) * tube * 0.75, -z + Math.sin(a) * ring);
      dir.set(-Math.sin(a), (rand() - 0.5) * 0.9, Math.cos(a)).normalize();
      q.setFromUnitVectors(up, dir);
      s.set(1, 0.5 + rand() * 0.7, 1); m.compose(p, q, s); twigs.setMatrixAt(i, m);
      twigs.setColorAt(i, tmp.setHSL(0.07 + rand() * 0.035, 0.3 + rand() * 0.25, 0.18 + rand() * 0.22));
    }
    group.add(twigs);
    // Where the birds sit: up on the rim so they show, a little apart, and Player 1 a touch
    // higher so their outstretched inner wings pass over and under rather than through each other.
    const seats = count > 1 ? [[x - 1.2, NEST_HEIGHT + 0.95, z], [x + 1.2, NEST_HEIGHT + 0.8, z]] : [[x, NEST_HEIGHT + 0.9, z]];
    return { group, seats };
  }

  // Soft round cloud texture, drawn once.
  function cloudTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    for (let i = 0; i < 7; i++) {
      const x = 30 + Math.random() * 68, y = 48 + Math.random() * 32, r = 22 + Math.random() * 20;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255,0.9)"); grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ============================================================================
  // The scene. One is created and reused for every round (graphics contexts
  // are limited, so making a new one each round would eventually fail).
  // ============================================================================
  class Scene {
    constructor() {
      if (!window.THREE) throw new Error("The 3D library (js/vendor/three.min.js) didn't load.");
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.canvas = this.renderer.domElement;
      this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1";
      shared = shared || makeShared();

      const scene = this.scene = new THREE.Scene();
      scene.fog = new THREE.Fog(SKIES[0].horizon, FOG_NEAR, FOG_FAR);
      this.skies = SKIES.map((s) => ({ top: C(s.top), horizon: C(s.horizon), ranges: s.ranges.map(C), sun: C(s.sun) }));
      this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.3, 4000);

      // Light: a warm sun, a plain light from the sky, and soft light from the whole sky (see "Light" above).
      this.hemi = new THREE.HemisphereLight(0xcfe6ff, BOUNCE[0], SKY_FILL); scene.add(this.hemi);
      const sun = this.sun = new THREE.DirectionalLight(SKIES[0].sun, SUN_STRENGTH);
      this.sunFrom = new THREE.Vector3(...SUN_FROM).normalize();
      sun.position.copy(this.sunFrom); scene.add(sun, sun.target);
      if (SHADOWS) {
        // The sun's shadows are drawn in a long box that follows the birds: SHADOW_BEHIND behind them, SHADOW_AHEAD
        // ahead down the valley, SHADOW_WIDE either side. (The box is turned so its long side runs down the valley:
        // the sun shines nearly straight down, so "up" in the sun's view is set to point ahead.)
        this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        sun.castShadow = true; sun.shadow.mapSize.set(SHADOW_DETAIL, SHADOW_DETAIL);
        const s = sun.shadow.camera; s.up.set(0, 0, -1);
        s.left = -SHADOW_WIDE; s.right = SHADOW_WIDE; s.bottom = -SHADOW_BEHIND; s.top = SHADOW_AHEAD; s.near = 1; s.far = 450;
        s.updateProjectionMatrix();
        sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.08;
      }
      this.bounceColour = new THREE.Color();

      // Sky: a big dome, blue overhead fading to warm haze at the horizon.
      const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color(SKIES[0].top) }, horizon: { value: new THREE.Color(SKIES[0].horizon) } },
        vertexShader: "varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;" +
          "void main() { float h = clamp(normalize(vPos).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }"
      });
      this.sky = new THREE.Mesh(skyGeo, skyMat); scene.add(this.sky);

      // Distant ranges all around, hazy (blue in the Alpine, warm in the deserts), always far away.
      this.ranges = new THREE.Group();
      for (const [radius, tall, colour] of [[2300, 520, SKIES[0].ranges[0]], [1800, 330, SKIES[0].ranges[1]]]) {
        const segs = 160, posArr = [];
        for (let i = 0; i <= segs; i++) {
          const a = i / segs * Math.PI * 2;
          const peak = tall * (0.35 + 0.45 * fbm(i * 0.22, radius * 0.01, 77) + 0.2 * Math.abs(Math.sin(i * 0.9)));
          posArr.push(Math.cos(a) * radius, -60, Math.sin(a) * radius, Math.cos(a) * radius, peak, Math.sin(a) * radius);
        }
        const idx = [];
        for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3)); geo.setIndex(idx);
        this.ranges.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, fog: false, side: THREE.DoubleSide })));
      }
      scene.add(this.ranges);

      // Clouds drifting high above.
      const tex = cloudTexture();
      this.clouds = [];
      for (let i = 0; i < 14; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
        sprite.scale.set(220 + Math.random() * 200, 90 + Math.random() * 60, 1);
        sprite.userData = { x: (Math.random() - 0.5) * 1600, y: 160 + Math.random() * 160, z: Math.random() * 2400 };
        scene.add(sprite); this.clouds.push(sprite);
      }

      this.terrain = new THREE.Group(); scene.add(this.terrain);
      this.chunks = new Map();
      this.birds = []; this.nest = null; this.world = null;
      this.projector = new THREE.Vector3();

      // The sky as the river mirrors it: the sky dome as it looks in the Alpine (blue overhead, warm haze at the
      // horizon) over a valley-coloured ground, blurred into the light arriving from every direction. Given to the
      // river and the birds only, not the whole scene: see SOFT_LIGHT.
      this.skyPicture = null;
      if (SOFT_LIGHT > 0) {
        const s = new THREE.Scene(), dome = this.sky.clone(); dome.position.set(0, 0, 0); dome.scale.setScalar(0.01); s.add(dome);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(25, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a8f62).multiplyScalar(0.6) }));
        ground.rotation.x = -Math.PI / 2; ground.position.y = -2; s.add(ground);
        const pm = new THREE.PMREMGenerator(this.renderer);
        this.skyPicture = pm.fromScene(s, 0.02).texture; pm.dispose();
        shared.riverMat.envMap = this.skyPicture; shared.riverMat.envMapIntensity = SOFT_LIGHT;
      }
      this.glow = GLOW ? HG.glow.make(this.renderer, { from: GLOW_FROM, strength: GLOW_STRENGTH, spread: GLOW_SPREAD, corners: VIGNETTE }) : null;
      this.drawSize = new THREE.Vector2();
    }

    // Draw the picture: straight to the screen, or (with the glow) into a picture first (games/lib/glow.js).
    draw() {
      const r = this.renderer;
      if (!this.glow) { r.render(this.scene, this.camera); return; }
      r.getDrawingBufferSize(this.drawSize); this.glow.size(this.drawSize.x, this.drawSize.y);
      r.setRenderTarget(this.glow.world); r.render(this.scene, this.camera);
      this.glow.show();
    }

    // Start a new round: attach to the page, and set up the world, birds and nest.
    begin(viewEl, world, colours, nestX) {
      viewEl.prepend(this.canvas);
      this.viewEl = viewEl;
      this.world = world;
      for (const [, chunk] of this.chunks) this.dropChunk(chunk);
      this.chunks.clear();
      for (const bird of this.birds) { this.scene.remove(bird.root, bird.shadow); bird.crow.dispose(); }
      this.birds = colours.map((colour) => { const b = makeBird(colour); this.scene.add(b.root, b.shadow); return b; });
      if (this.nest) { this.scene.remove(this.nest.group); this.nest.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      this.nest = makeNest(world, nestX, BIRD_AHEAD, colours.length);
      this.scene.add(this.nest.group);
      // The new birds and nest: real shadows (the birds' old shadow blobs aren't needed then); and the birds pick up
      // a little of the sky's colour (they're small on screen, so it costs little).
      for (const part of [...this.birds.map((b) => b.root), this.nest.group]) part.traverse((o) => {
        if (o.isMesh && SHADOWS) { o.castShadow = true; o.receiveShadow = true; }
      });
      if (this.skyPicture) for (const b of this.birds) b.root.traverse((o) => {
        if (o.material && o.material.isMeshStandardMaterial) { o.material.envMap = this.skyPicture; o.material.envMapIntensity = SOFT_LIGHT * 0.5; }
      });
      this.birdScreen = colours.map(() => ({ x: 0, y: 0, size: 0 }));
      this.tickScreen = colours.map(() => ({ x: 0, y: 0, size: 0 }));
    }

    dropChunk(chunk) {
      this.terrain.remove(chunk.group);
      chunk.parts.forEach((p) => p.dispose());
    }

    updateTerrain(z) {
      const first = Math.floor((z - BEHIND) / CHUNK), last = Math.floor((z + AHEAD) / CHUNK);
      for (const [i, chunk] of this.chunks) if (i < first || i > last) { this.dropChunk(chunk); this.chunks.delete(i); }
      let built = 0;
      for (let i = first; i <= last; i++) {
        if (this.chunks.has(i)) continue;
        if (built >= 2 && this.chunks.size > 4) break;   // spread the work over frames once started
        const group = new THREE.Group();
        const parts = buildChunk(this.world, i, group);
        this.terrain.add(group); this.chunks.set(i, { group, parts }); built++;
      }
    }

    // How far the camera can zoom in while keeping things within `reach` metres of centre on screen.
    fitZoom(reach, aspect) {
      return BIRD_AHEAD * Math.tan(FOV / 2 * Math.PI / 180) * aspect * 0.72 / Math.max(reach, 0.5);
    }

    // Draw one frame. f = { z, camX, zoom, roll, shake, view: {pull, lift, inNest}, birds: [{ x, y, bank, flapping, hidden }] }
    // bank: -1 (full left) to 1 (full right); flapping: 0 (gliding) to 1 (full wingbeats).
    frame(f) {
      const w = this.viewEl.clientWidth, h = this.viewEl.clientHeight;
      if (!w || !h) return;
      const now = performance.now(), dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
      this.lastFrame = now;
      const size = this.renderer.getSize(new THREE.Vector2());
      if (size.x !== w || size.y !== h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
      const world = this.world, birdZ = f.z + BIRD_AHEAD;
      this.updateTerrain(f.z);

      // ---- Camera: close-up on the nest, pulling back, then following the birds ----
      const zoom = f.zoom || 1, back = BIRD_AHEAD / zoom;
      // The camera stays over the valley floor, so on a sharp bend it never ends up inside a cliff.
      const camZ = birdZ - back, room = world.halfWidth(camZ) + 1;
      const flyX = clamp(f.camX, world.centre(camZ) - room, world.centre(camZ) + room);
      const flyPos = [flyX, BIRD_HEIGHT + (CAMERA_HEIGHT - BIRD_HEIGHT) / zoom, camZ];
      const look = Math.tan(LOOK_DOWN_DEGREES * Math.PI / 180) * 100;
      let pos = flyPos, target = [f.camX, flyPos[1] - look, flyPos[2] + 100];
      if (f.view.inNest) {
        const nx = this.nest.seats.reduce((a, s) => a + s[0], 0) / this.nest.seats.length;
        const close = [nx, NEST_HEIGHT + 2.5, BIRD_AHEAD - 4.2], closeAim = [nx, NEST_HEIGHT + 0.2, BIRD_AHEAD + 22];
        const wide = [nx - 2.5, NEST_HEIGHT + 6.5, BIRD_AHEAD - 15], wideAim = [nx + 1, NEST_HEIGHT - 2.5, BIRD_AHEAD + 40];
        const a = smooth(clamp(f.view.pull * 2, 0, 1)), b = smooth(clamp(f.view.pull * 2 - 1, 0, 1));
        const lerp3 = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
        pos = lerp3(lerp3(close, wide, a), flyPos, b);
        target = lerp3(lerp3(closeAim, wideAim, a), target, b);
      }
      const shake = f.shake || 0;
      this.camera.position.set(pos[0] + (Math.random() - 0.5) * 0.5 * shake, pos[1] + (Math.random() - 0.5) * 0.3 * shake, -pos[2]);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(target[0], target[1], -target[2]);
      if (f.roll) this.camera.rotateZ(-f.roll);           // the whole view banks when players lean together

      // Sky, haze, distant ranges and sunlight shift colour with the ecosystem just ahead.
      this.blendSky(f.z + 150);
      // Sky, distant ranges and clouds travel with the camera so they always stay far away.
      this.sky.position.copy(this.camera.position);
      this.ranges.position.set(this.camera.position.x, 0, this.camera.position.z);
      for (const cloud of this.clouds) {
        const d = cloud.userData;
        let cz = d.z - f.z * 0.6;                            // clouds drift past slowly
        cz = ((cz % 2400) + 2400) % 2400 + 200;
        cloud.position.set(this.camera.position.x + d.x, d.y, this.camera.position.z - cz);
      }

      // ---- Birds: in their seats in the nest, lifting off, then flying ----
      const lift = f.view.lift;
      f.birds.forEach((b, i) => {
        const bird = this.birds[i];
        bird.root.visible = !b.hidden;                    // a bird nobody is playing stays out of sight
        if (b.hidden) { bird.shadow.visible = false; return; }
        const seat = this.nest.seats[i] || this.nest.seats[0];
        const fly = [b.x, BIRD_HEIGHT + (b.y || 0), birdZ];
        const k = f.view.inNest ? lift : 1;
        const x = seat[0] + (fly[0] - seat[0]) * k;
        const y = seat[1] + (fly[1] - seat[1]) * k + Math.sin(k * Math.PI) * 1.6;
        const z = seat[2] + (fly[2] - seat[2]) * k;
        bird.root.position.set(x, y, -z);
        bird.root.scale.setScalar(BIRD_SPAN * (0.5 + 0.5 * k));      // smaller in the nest, full size once flying
        bird.root.rotation.set(0, -(b.bank || 0) * 0.22, 0);           // turns a little into the bank
        // The crow does the rest: it rolls, beats or holds its wings, and keeps its head level.
        Object.assign(bird.crow.controls, { mode: "fly", bank: b.bank || 0, flap: b.flapping || 0 });
        bird.crow.update(dt);
        const ground = groundAt(world, z, x);
        bird.shadow.visible = k > 0.6 && !SHADOWS;                     // (a blob, when there are no real shadows)
        bird.shadow.position.set(x, ground + 0.08, -z);
        bird.shadow.material.opacity = 0.24 * clamp(1 - (y - ground) / 14, 0.2, 1);
        // Where this bird is on screen, for the effects drawn on top.
        const s = this.toScreen(x, y, z, w, h);
        const s2 = this.toScreen(x + BIRD_SPAN * 0.36, y, z, w, h);
        this.birdScreen[i] = { x: s.x, y: s.y, size: Math.abs(s2.x - s.x) * 1.3 };
        const t = this.toScreen(seat[0], seat[1] + 1.3, seat[2], w, h);
        this.tickScreen[i] = { x: t.x, y: t.y, size: this.birdScreen[i].size };
      });

      // The sun's shadow box follows the birds (from between them, on the ground, out down the valley). Sideways it
      // sits halfway between the birds and the valley's middle further on, so it stays on the valley round bends.
      if (SHADOWS) {
        const shown = f.birds.filter((b) => !b.hidden), mid = shown.length ? shown.reduce((t, b) => t + b.x, 0) / shown.length : f.camX;
        const from = f.view.inNest ? this.nest.seats[0][0] : mid, z = f.view.inNest ? BIRD_AHEAD : birdZ;
        this.sun.target.position.set((from + world.centre(z + SHADOW_AHEAD * 0.6)) / 2, 0, -z);
        this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunFrom, 200);
      }
      this.draw();
    }

    blendSky(z) {
      const w = zoneWeights(z), u = this.sky.material.uniforms, mixIn = (target, pick) => {
        target.setRGB(0, 0, 0);
        this.skies.forEach((s, i) => { if (w[i] > 0) target.add(tmp.copy(pick(s)).multiplyScalar(w[i])); });
      };
      mixIn(u.top.value, (s) => s.top);
      mixIn(u.horizon.value, (s) => s.horizon);
      this.scene.fog.color.copy(u.horizon.value);
      if (this.glow) this.scene.fog.color.convertLinearToSRGB();        // (drawn into a picture, three.js takes the haze's colour as given: give it the screen's)
      this.ranges.children.forEach((range, i) => mixIn(range.material.color, (s) => s.ranges[i]));
      mixIn(this.sun.color, (s) => s.sun);
      this.hemi.groundColor.setRGB(0, 0, 0);                          // (the light bounced off the valley floor)
      w.forEach((share, i) => { if (share > 0) this.hemi.groundColor.add(this.bounceColour.set(BOUNCE[i]).multiplyScalar(share)); });
    }

    // A copy of the current picture, drawn `sharper` times finer than the screen
    // (so it stays crisp when zoomed into), as a separate canvas the page can keep.
    snapshot(sharper) {
      const r = this.renderer, ratio = r.getPixelRatio(), size = r.getSize(new THREE.Vector2());
      r.setPixelRatio(ratio * sharper); r.setSize(size.x, size.y, false);
      this.draw();
      const copy = document.createElement("canvas");
      copy.width = this.canvas.width; copy.height = this.canvas.height;
      copy.getContext("2d").drawImage(this.canvas, 0, 0);
      r.setPixelRatio(ratio); r.setSize(size.x, size.y, false);
      return copy;
    }

    toScreen(x, y, z, w, h) {
      const v = this.projector.set(x, y, -z).project(this.camera);
      return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 };
    }

    detach() { if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas); }
  }

  let scene = null;
  const get = () => scene || (scene = new Scene());

  // Getting ready in the background (since 2.26.0): the shell runs these steps one at a time while the sensors
  // connect. They build the scene, then draw the nest and a stretch of each ecosystem (Alpine, High Desert, Deep
  // Desert) into a hidden full-size view, so every shader is made and every picture is on the graphics card before
  // a round needs it. (Made the first time they were seen, e.g. the first desert, they caused little stutters.)
  // Each step waits for the graphics card to finish its drawing (by reading one dot back from it): left to itself,
  // the browser puts the drawing off and then does it all at once when the round starts, a long stutter instead.
  function warmUp() {
    let sc = null, view = null, world = null;
    const fly = (z, inNest) => () => {
      const centre = world.centre(z + BIRD_AHEAD);
      const birds = [-2, 2].map((dx, i) => ({ x: centre + dx, y: 0, bank: i ? 0.3 : -0.3, flapping: 1, hidden: false }));
      for (let k = 0; k < 6; k++) sc.frame({ z, camX: centre, zoom: 1, roll: 0, shake: 0, view: { pull: inNest ? 0 : 1, lift: inNest ? 0 : 1, inNest }, birds });
    };
    return [
      () => { sc = get(); },
      () => {
        view = document.createElement("div");
        view.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1";   // (full size, as in a round)
        document.body.appendChild(view);
        world = HG.flight.makeWorld();
        sc.begin(view, world, ["#e0662b", "#7a4fd6"], world.centre(BIRD_AHEAD));
      },
      fly(0, true), fly(0, false), fly(600, false), fly(1150, false), fly(1500, false), fly(2150, false), fly(2600, false),
      () => { sc.detach(); view.remove(); }
    ].map((step) => () => { step(); if (sc) { const gl = sc.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } });
  }

  return {
    BIRD_HEIGHT,
    // The shared scene, created the first time it's needed.
    get, warmUp,
    groundAt
  };
})();
