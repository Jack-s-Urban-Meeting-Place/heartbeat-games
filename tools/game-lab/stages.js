// ============================================================================
// Game Lab: the three places things are shown (tools/Game-Lab.html)
// ----------------------------------------------------------------------------
//   studio  a plain backdrop with simple light: the animals, and Fly Together's trees, bushes and rocks
//   climb   Climb Together's own 3D scene (games/lib/climb3d.js), with the game's own light for where you look
//   fly     Fly Together's own 3D scene (games/lib/flight3d.js), with the whole canyon built
// Each stage has: canvas (shown while it's in use), camera, scene, pickable() (what the highlighter can mark),
// and render(orbit, options). The game stages are made the first time they're needed (they're big).
// ============================================================================

window.LAB = window.LAB || {};

LAB.stages = (function () {
  const view = () => document.getElementById("view");

  // ---- The studio ---------------------------------------------------------------
  function makeStudio() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = "stage";
    view().appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.layers.enable(1);                                       // (the animals are on layer 1 in the games)
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b5a48, 1.6); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 3, 2.5); scene.add(sun);
    // A wall (for the chameleon, which climbs on z = 0) and a floor (everything else), with a faint grid of
    // 10 cm squares on the floor, so sizes can be judged.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.9 }));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshStandardMaterial({ color: 0xb59b7a, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(20, 200, 0x9c8466, 0xa58d6f); grid.position.y = 0.001;
    scene.add(wall, floor, grid);
    const props = new THREE.Group(); scene.add(props);           // whatever is being shown
    const camoTarget = new THREE.WebGLRenderTarget(4, 4);

    const LOOKS = {
      indoor: { background: 0xe9e1d4, floor: 0xb59b7a, sky: 0xfff4e0, ground: 0x6b5a48, fill: 1.6, sunColour: 0xffffff, sunStrength: 2.2, grid: true },
      outdoor: { background: 0xcfe3f2, floor: 0x8fb36b, sky: 0xcfe6ff, ground: 0x6b5a48, fill: 1.25, sunColour: 0xffe8c8, sunStrength: 2.7, grid: false }
    };
    return {
      name: "studio", canvas: renderer.domElement, renderer, scene, camera, props, wall, floor,
      // look: "indoor" (warm, as the old creature lab) or "outdoor" (sky blue and grass, as the bird lab); showWall: for the chameleon
      setLook(look, showWall, gridSize = 1) {
        const L = LOOKS[look];
        scene.background = new THREE.Color(L.background); floor.material.color.set(L.floor);
        scene.fog = look === "outdoor" ? new THREE.Fog(L.background, 60, 260) : null;   // (outdoors, the ground fades into the sky far off)
        hemi.color.set(L.sky); hemi.groundColor.set(L.ground); hemi.intensity = L.fill;
        sun.color.set(L.sunColour); sun.intensity = L.sunStrength;
        wall.visible = showWall; floor.visible = !showWall; grid.visible = L.grid && !showWall; grid.scale.setScalar(gridSize);
      },
      pickable: () => [props, wall, floor],
      render(orbit) {
        const w = view().clientWidth, h = view().clientHeight;
        const size = renderer.getSize(new THREE.Vector2());
        if (size.x !== w || size.y !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; }
        orbit.apply(camera);
        // Camouflage (the chameleon): first draw the scene without the animal, as the picture its skin shows.
        let camo = false;
        props.traverse((o) => { if (o.userData.animal && o.userData.animal.camo > 0.005) camo = true; });
        if (camo) {
          const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
          if (camoTarget.width !== buf.x || camoTarget.height !== buf.y) camoTarget.setSize(buf.x, buf.y);
          camera.layers.set(0); renderer.setRenderTarget(camoTarget); renderer.render(scene, camera); renderer.setRenderTarget(null);
          camera.layers.enable(1);
          HG.kit.camo.map.value = camoTarget.texture; HG.kit.camo.size.value.copy(buf);
        }
        renderer.render(scene, camera);
      }
    };
  }

  // ---- Climb Together's scene -----------------------------------------------------
  function makeClimb() {
    const sc = HG.climb3d.get(), level = HG.climb3d.level;
    sc.begin(view(), ["#e0662b", "#7a4fd6"]);
    sc.canvas.classList.add("stage");
    // Every labelled part of the climb (see tagged() in climb3d.js): the room, shelf, plants, alley, boxes,
    // pipes, windows, roof, crates, rocks, tree, creases, sky; and the tank and valley.
    const parts = {};
    sc.scene.traverse((o) => { if (o.userData.part) (parts[o.userData.part] = parts[o.userData.part] || []).push(o); });
    // A chameleon on its climbing route, as near height y as it gets (as in climb3d.js's warmUp).
    const chamAt = (x, y) => {
      const r = level.route(x); let best = r[0];
      for (const p of r) if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
      const a = level.at(x, best.s);
      return { x, y: a.y, z: a.z, pitch: level.tilt(x, best.s), s: best.s, vx: 0, vy: 0, camo: 0, fall: 0, spin: 0, hidden: false, lookAt: null };
    };
    const lookFrom = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    return {
      name: "climb", canvas: sc.canvas, renderer: sc.renderer, scene: sc.scene, camera: sc.camera, sc, parts, level,
      pickable: () => [sc.world, sc.tank.root, sc.valley.group, ...sc.chams.map((c) => c.root)],
      // options: { only: a part's name (just that part) or null (everything), haze: true/false, chameleons: true/false,
      //            valley: true/false (the end: the valley and the setting sun) }
      render(orbit, options) {
        orbit.position(lookFrom.position); lookFrom.target.copy(orbit.target);
        const t = orbit.target, only = options.only;
        // The game's light follows where the view looks (the room, the alley, daylight, golden hour).
        const lightAt = { x: t.x, y: Math.max(0.2, Math.min(14, t.y)), z: t.z, dist: 1.3 };
        // (above 11.9 m the game starts fading in the valley at the end: VALLEY_SHOW in climb3d.js. Kept below it unless asked)
        if (!options.valley) lightAt.y = Math.min(lightAt.y, 11.85);
        const chams = options.chameleons
          ? [chamAt(level.centre(lightAt.y) - 0.11, lightAt.y), chamAt(level.centre(lightAt.y) + 0.11, lightAt.y)]
          : [0, 1].map(() => ({ x: 0, y: 0, hidden: true, vx: 0, vy: 0 }));
        const fog = sc.scene.fog;
        if (!options.haze) { fog.near = 1e4; fog.far = 2e4; } else if (!options.valley) { fog.near = 12; fog.far = 45; }
        sc.frame({
          cam: lightAt, chams, tank: { rock: 0, tip: 0 }, shake: 0, view: options.valley ? 1 : 0, cat: null, crow: null, lookFrom,
          beforeDraw: () => {
            for (const [name, objects] of Object.entries(parts)) {
              const show = only ? name === only : name !== "valley" || options.valley;
              // (the valley: the game fades it in at the end, sc.view; the lab can still hide it)
              for (const o of objects) o.visible = show && (name !== "valley" || sc.view > 0.001);
            }
            sc.camera.near = Math.max(0.005, orbit.distance * 0.01); sc.camera.far = Math.max(80, orbit.distance * 60);
            sc.camera.updateProjectionMatrix();
          }
        });
      }
    };
  }

  // ---- Fly Together's scene --------------------------------------------------------
  // The canyon is different every round (it's made with random numbers); the lab always makes the same one,
  // so notes left on it still match next time.
  const CANYON_SEED = 20261110;
  const CANYON_LENGTH = 3000;   // metres: Alpine, High Desert, Deep Desert (then it starts again)
  function makeFly() {
    const sc = HG.flight3d.get();
    let s = CANYON_SEED;
    const real = Math.random;
    Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;      // (the same "random" canyon each time)
    const world = HG.flight.makeWorld();
    Math.random = real;
    sc.begin(view(), world, [], world.centre(HG.flight.BIRD_AHEAD));
    sc.buildRange(0, CANYON_LENGTH);
    sc.canvas.classList.add("stage");
    const lookFrom = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    return {
      name: "fly", canvas: sc.canvas, renderer: sc.renderer, scene: sc.scene, camera: sc.camera, sc, world, length: CANYON_LENGTH,
      pickable: () => [sc.terrain, sc.nest.group],
      // options: { haze: true/false }
      render(orbit, options) {
        orbit.position(lookFrom.position); lookFrom.target.copy(orbit.target);
        const along = -orbit.target.z;                                    // (the game measures distance down the valley as +z)
        sc.scene.fog.near = options.haze ? 160 : 1e5; sc.scene.fog.far = options.haze ? 1050 : 2e5;
        sc.frame({
          z: along - 150, camX: orbit.target.x, zoom: 1, roll: 0, shake: 0, keepTerrain: true, lookFrom,
          view: { pull: 1, lift: 1, inNest: false }, birds: [],
          beforeDraw: () => {
            // (from high above, the rings of distant mountains and the clouds, which the game keeps round the camera, get in the way)
            const high = orbit.distance > 400;
            sc.ranges.visible = !high; for (const cloud of sc.clouds) cloud.visible = !high;
            sc.camera.near = Math.max(0.05, orbit.distance * 0.005); sc.camera.far = Math.max(4000, orbit.distance * 4);
            sc.camera.updateProjectionMatrix();
          }
        });
      }
    };
  }

  const made = {};
  const makers = { studio: makeStudio, climb: makeClimb, fly: makeFly };
  return {
    // The stage with this name, made the first time it's asked for.
    get(name) { return made[name] || (made[name] = makers[name]()); },
    // Show one stage's picture and hide the others'.
    show(name) { for (const [key, stage] of Object.entries(made)) stage.canvas.style.display = key === name ? "block" : "none"; }
  };
})();
