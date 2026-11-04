// ============================================================================
// creature-kit.js: shared building blocks for animals made in code
// ----------------------------------------------------------------------------
// Used by the chameleon (games/lib/chameleon.js) and the cat (games/lib/cat.js),
// and handy for any future animal:
//   HG.kit.Tube      a bendy tube through a row of points (bodies, tails, necks)
//   HG.kit.reach     "two-bone reach": where the knee goes when a foot reaches a spot
//   HG.kit.limb      places a stretched cylinder between two points (a leg bone)
//   HG.kit.camoMaterial  a material that can fade into whatever is behind it
//                    (the chameleon's camouflage; see the note there)
// Needs three.js (js/vendor/three.min.js), loaded first.
// ============================================================================
HG.kit = (function () {
  // ---- Tuning ------------------------------------------------------------------
  const CAMO_SHIMMER = 0.006;        // how much the camouflage bends the picture behind it (share of the screen)
  const CAMO_RIM = 0.10;             // a faint glassy outline when hidden, so a sharp eye can still spot it (0 = none)
  // ----------------------------------------------------------------------------

  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // ==========================================================================
  // Tube: rings of corners around a row of points, joined into one surface.
  // The radius can be one number (round) or [across, out] for an oval, where
  // "across" runs along `side` (a direction the caller chooses, e.g. sideways)
  // and "out" at right angles to it. Call set() whenever the points move.
  // ==========================================================================
  class Tube {
    constructor(count, sides, material, options = {}) {
      this.count = count; this.sides = sides;
      const idx = [];
      for (let i = 0; i < count - 1; i++) {
        for (let k = 0; k < sides; k++) {
          const a = i * sides + k, b = i * sides + (k + 1) % sides, c = a + sides, d = b + sides;
          idx.push(a, b, c, b, d, c);
        }
      }
      // Close both ends with a point, so the tube is never open.
      this.tipIndex = count * sides; this.baseIndex = count * sides + 1;
      const all = new Float32Array((count * sides + 2) * 3);
      for (let k = 0; k < sides; k++) {
        idx.push((count - 1) * sides + k, (count - 1) * sides + (k + 1) % sides, this.tipIndex);
        idx.push((k + 1) % sides, k, this.baseIndex);
      }
      this.geometry = new THREE.BufferGeometry();
      this.geometry.setAttribute("position", new THREE.BufferAttribute(all, 3));
      this.geometry.setIndex(idx);
      if (options.colours) this.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(all.length), 3));
      this.mesh = new THREE.Mesh(this.geometry, material);
      this.mesh.frustumCulled = false;            // it changes shape every frame
      this.points = []; for (let i = 0; i < count; i++) this.points.push(new THREE.Vector3());
    }

    // points: count Vector3s. radii: count numbers or [across, out] pairs.
    // side: the "across" direction (default: worked out from the tube's own bend).
    set(points, radii, side) {
      const p = this.geometry.attributes.position.array, n = this.count, s = this.sides;
      const t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
      let last = null;
      for (let i = 0; i < n; i++) {
        const prev = points[Math.max(0, i - 1)], next = points[Math.min(n - 1, i + 1)];
        t.subVectors(next, prev).normalize();
        // "across": the requested side, kept at right angles to the tube; else carried along from the last ring
        if (side) a.copy(side); else if (last) a.copy(last); else a.set(1, 0, 0);
        a.addScaledVector(t, -a.dot(t));
        if (a.lengthSq() < 1e-8) a.set(0, 0, 1).addScaledVector(t, -t.z);
        a.normalize(); last = last || new THREE.Vector3(); last.copy(a);
        b.crossVectors(t, a);
        const r = radii[i], rx = Array.isArray(r) ? r[0] : r, ry = Array.isArray(r) ? r[1] : r;
        for (let k = 0; k < s; k++) {
          const ang = k / s * Math.PI * 2, c = Math.cos(ang) * rx, d = Math.sin(ang) * ry, o = (i * s + k) * 3;
          p[o] = points[i].x + a.x * c + b.x * d;
          p[o + 1] = points[i].y + a.y * c + b.y * d;
          p[o + 2] = points[i].z + a.z * c + b.z * d;
        }
      }
      // The tip: a little beyond the last ring, along the tube.
      const end = points[n - 1], before = points[n - 2], rEnd = radii[n - 1], rr = Array.isArray(rEnd) ? Math.max(...rEnd) : rEnd;
      t.subVectors(end, before).normalize();
      const o = this.tipIndex * 3;
      p[o] = end.x + t.x * rr * 0.8; p[o + 1] = end.y + t.y * rr * 0.8; p[o + 2] = end.z + t.z * rr * 0.8;
      const r0 = radii[0], r0r = Array.isArray(r0) ? Math.max(...r0) : r0, q = this.baseIndex * 3;
      t.subVectors(points[1], points[0]).normalize();
      p[q] = points[0].x - t.x * r0r * 0.6; p[q + 1] = points[0].y - t.y * r0r * 0.6; p[q + 2] = points[0].z - t.z * r0r * 0.6;
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      return this;
    }

    // Colour each corner: fn(i, k, angle) returns a THREE.Color (i = ring, k = corner round the ring).
    paint(fn) {
      const c = this.geometry.attributes.color.array, n = this.count, s = this.sides;
      for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) {
        const col = fn(i, k, k / s * Math.PI * 2), o = (i * s + k) * 3;
        c[o] = col.r; c[o + 1] = col.g; c[o + 2] = col.b;
      }
      const tip = fn(n - 1, 0, 0), o = this.tipIndex * 3;
      c[o] = tip.r; c[o + 1] = tip.g; c[o + 2] = tip.b;
      const base = fn(0, 0, 0), q = this.baseIndex * 3;
      c[q] = base.r; c[q + 1] = base.g; c[q + 2] = base.b;
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  // ==========================================================================
  // reach: a two-bone limb from `root` toward `target` (bone lengths a and b).
  // The knee bends toward `pole` (a direction). Fills `knee` and `end` (where the
  // tip actually gets to: the target, or as close as the limb can stretch).
  // ==========================================================================
  function reach(root, target, a, b, pole, knee, end) {
    const dir = tmp.subVectors(target, root);
    const dist = Math.min(Math.max(dir.length(), 1e-4), (a + b) * 0.999);
    dir.normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + dist * dist - b * b) / (2 * a * dist)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const side = tmp2.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
    side.normalize();
    knee.copy(root).addScaledVector(dir, a * cosA).addScaledVector(side, a * sinA);
    end.copy(root).addScaledVector(dir, dist);
  }

  // A cylinder (made by limbGeometry) stretched from one point to another.
  function limb(mesh, from, to, thickness) {
    const len = tmp.subVectors(to, from).length() || 1e-4;
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(up, tmp.divideScalar(len));
    mesh.scale.set(thickness, len, thickness);
  }
  // Length 1 along +y from its base, radius 1 at the base narrowing to `taper` at the far end.
  function limbGeometry(taper = 0.75, sides = 7) {
    const geo = new THREE.CylinderGeometry(taper, 1, 1, sides, 1);
    geo.translate(0, 0.5, 0);
    return geo;
  }

  // ==========================================================================
  // Camouflage. A camo material draws normally when camo = 0, and at camo = 1
  // shows the picture that's behind it instead (slightly bent, with a faint rim),
  // so the animal seems to vanish into the background. The game's scene must
  // draw the world WITHOUT the animals into a picture first, and put it in
  // HG.kit.camo.map (with its size in pixels in HG.kit.camo.size): see climb3d.js.
  // ==========================================================================
  const camo = { map: { value: null }, size: { value: new THREE.Vector2(1, 1) } };

  function camoMaterial(params) {
    const m = new THREE.MeshStandardMaterial(params);
    const amount = { value: 0 };
    m.userData.camo = amount;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.camoMap = camo.map; shader.uniforms.camoSize = camo.size; shader.uniforms.camoAmount = amount;
      shader.fragmentShader = "uniform sampler2D camoMap; uniform vec2 camoSize; uniform float camoAmount;\n" +
        shader.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
        if (camoAmount > 0.001) {
          vec3 camoN = normalize(normal);
          vec2 camoUv = gl_FragCoord.xy / camoSize + camoN.xy * ${CAMO_SHIMMER.toFixed(4)};
          vec3 behind = texture2D(camoMap, camoUv).rgb;
          float rim = pow(1.0 - abs(dot(camoN, normalize(vViewPosition))), 3.0) * ${CAMO_RIM.toFixed(3)};
          gl_FragColor.rgb = mix(gl_FragColor.rgb, behind + rim, camoAmount);
        }`);
    };
    m.customProgramCacheKey = () => "hg-camo";
    return m;
  }

  // ==========================================================================
  // aim: turns a joint so its +y runs from `from` toward `to`, with its +z toward `side`
  // (a direction), and puts it at `from`. Used to pose the bones of legs and tails.
  // ==========================================================================
  const basis = new THREE.Matrix4(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  function aim(joint, from, to, side) {
    ay.subVectors(to, from).normalize();
    az.copy(side).addScaledVector(ay, -side.dot(ay));
    if (az.lengthSq() < 1e-8) az.set(0, 0, 1).addScaledVector(ay, -ay.z);
    az.normalize(); ax.crossVectors(ay, az);
    basis.makeBasis(ax, ay, az);
    joint.position.copy(from);
    joint.quaternion.setFromRotationMatrix(basis);
  }

  // ==========================================================================
  // skinAssets: decodes a model made in Blender (e.g. HG.chameleonModel, written by a
  // blender/export_*.py script) into shared geometry, one per material, with each corner
  // moving with up to two joints, and its pictures into textures. Decoded once per model
  // and shared by every animal that uses it. Pictures whose name ends in "Bump" are bump maps.
  // ==========================================================================
  const decoded = new Map();
  function skinAssets(model) {
    if (decoded.has(model)) return decoded.get(model);
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
      const img = new Image(), tex = new THREE.Texture(img);
      img.onload = () => { tex.needsUpdate = true; };
      img.src = src;                                       // a picture embedded in the file, so it works offline
      tex.colorSpace = name.endsWith("Bump") ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
      textures[name] = tex;
    }
    const assets = { geometries, textures };
    decoded.set(model, assets);
    return assets;
  }

  // Binds a model's meshes to a skeleton made of the animal's named joints (which must be
  // in the pose the model was built in). pick(material name) gives each mesh's material.
  function bindSkin(root, model, joints, pick) {
    const shared = skinAssets(model);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(model.bones.map((name) => {
      if (!joints[name]) throw new Error("The model needs a joint called " + name);
      return joints[name];
    }));
    const meshes = {};
    for (const [name, geo] of Object.entries(shared.geometries)) {
      const mesh = new THREE.SkinnedMesh(geo, pick(name));
      mesh.frustumCulled = false;                         // legs and tails move well outside the resting shape
      root.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
      meshes[name] = mesh;
    }
    return meshes;
  }

  return { Tube, reach, limb, limbGeometry, camo, camoMaterial, aim, skinAssets, bindSkin };
})();
