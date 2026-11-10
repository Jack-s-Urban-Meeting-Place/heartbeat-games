// ============================================================================
// Game Lab: everything you can look at (tools/Game-Lab.html)
// ----------------------------------------------------------------------------
// One entry per thing in the side menu, in groups. Each entry says:
//   id, name, about          its address name (?asset=...), the name shown, and one line about it
//   stage                    where it's shown: "studio", "climb" or "fly" (see stages.js)
//   frontYaw                 which way is its front (for the Front / Side / Back buttons)
//   enter(lab)               set it up and choose the first view
//   update(dt, lab)          move it, each frame (animals)
//   controls                 buttons for it: actions, options, places to jump to
//   options()                (game stages) what to pass to the stage's render()
//   describe(point)          (optional) more about a marked spot, e.g. how far down the canyon
// To add something: add an entry here. Most new pieces of a game can reuse makeClimbPart or the studio.
// ============================================================================

window.LAB = window.LAB || {};

LAB.catalog = (function () {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const PLAYERS = { 1: "#e0662b", 2: "#7a4fd6" };

  // A row of buttons: one choice from several. choose(key) is called when one is pressed.
  const choice = (label, choices, get, choose) => ({ label, choices, get, choose });

  // ---- Animals (in the studio) -------------------------------------------------------
  // Each animal does its actions on the spot, as in the old creature and bird labs.
  function animal(id, name, about, settings) {
    const state = { action: settings.actions[settings.start][0], colour: 1, model: "v2", look: "solid", style: "edges+tips", t: 0, leapClock: 0, altitude: 0.9 };
    let creature = null, ledges = null;
    const make = (lab) => {
      const props = lab.stage.props;
      if (creature) { props.remove(creature.root); creature.dispose(); }
      creature = settings.make(state);
      creature.root.userData.animal = creature;
      props.add(creature.root);
      state.leapClock = 0;
    };
    const entry = {
      id, name, about, group: "Animals", stage: "studio", frontYaw: settings.frontYaw,
      enter(lab) {
        lab.stage.setLook(settings.look, id === "chameleon");
        lab.stage.props.clear();
        make(lab);
        if (id === "chameleon") {                                     // two little shelves for the leap
          ledges = new THREE.Group();
          for (const p of [LEAP_FROM, LEAP_TO]) {
            const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0x9a6538, roughness: 0.8 }));
            shelf.position.set(p.x, p.y - 0.56, 0.06); ledges.add(shelf);
          }
          lab.stage.props.add(ledges);
        }
        lab.orbit.set(settings.view);
      },
      update(dt, lab) {
        state.t += dt;
        if (ledges) ledges.visible = state.action === "leap";
        settings.drive(creature, state, dt);
        creature.update(dt);
      },
      controls: [
        choice("Action", settings.actions, () => state.action, (k) => { state.action = k; state.leapClock = 0; creature.root.position.set(0, 0, 0); }),
        ...(settings.extra || []).map((c) => choice(c.label, c.choices, () => state[c.key], (k, lab) => { state[c.key] = k; make(lab); }))
      ],
      describe: () => ({ action: state.action })
    };
    return entry;
  }

  // The chameleon's leap: from a spot low on the wall up to a ledge, then round again.
  const LEAP_FROM = V(-0.1, -0.75, 0), LEAP_TO = V(0.12, 0.6, 0), LEAP_LIFT = 0.12;
  const colours = [["1", "Player 1 (orange)"], ["2", "Player 2 (purple)"]];

  const chameleon = animal("chameleon", "Chameleon", "Climbs on the wall. 1 unit = snout to tail base.", {
    look: "indoor", frontYaw: 0, start: 1,
    view: { target: V(0, 0, 0.1), yaw: 0, pitch: 0, distance: 2.6 },
    actions: [["rest", "Rest"], ["climb", "Climb"], ["climb-left", "Climb left"], ["climb-right", "Climb right"], ["leap", "Leap"], ["hide", "Hide (camouflage)"], ["fall", "Fall"], ["look", "Look around"]],
    extra: [{ label: "Colour", key: "colour", choices: colours }],
    make: (s) => new HG.Chameleon({ colour: PLAYERS[s.colour] }),
    drive(c, s, dt) {
      const k = c.controls;
      k.velocity = { climb: [0, 0.9], "climb-left": [-0.6, 0.6], "climb-right": [0.6, 0.6] }[s.action] || [0, 0];
      k.camo = s.action === "hide" ? 1 : 0;
      k.fall = s.action === "fall" ? 1 : 0;
      k.lookAt = s.action === "look" ? V(Math.sin(s.t) * 1.5, 1.2, 1.5) : null;
      if (s.action === "leap") {                                      // rest low, leap up, rest, and round again
        s.leapClock += dt;
        if (s.leapClock > 0.7 && !c.leaping && !c.leapDone) { c.leap(); c.leapDone = true; }
        const path = HG.Chameleon.leapPath(c.leapProgress);
        c.root.position.lerpVectors(LEAP_FROM, LEAP_TO, c.leapDone ? path.along : 0);
        c.root.position.z = c.leaping ? path.lift * LEAP_LIFT : 0;
        if (s.leapClock > 2.6) { s.leapClock = 0; c.leapDone = false; }
      } else c.root.position.set(0, 0, 0);
    }
  });

  const cat = animal("cat", "Cat", "Climb Together's cat. 1 unit = chest to hips.", {
    look: "indoor", frontYaw: Math.PI, start: 1,
    view: { target: V(0, 0.45, 0), yaw: 2.3, pitch: 0.3, distance: 4 },
    actions: [["stand", "Stand"], ["walk", "Walk"], ["sit", "Sit"], ["look", "Look around"], ["crouch", "Crouch"], ["leap", "Leap"], ["hiss", "Hiss"]],
    make: () => new HG.Cat(),
    drive(c, s) {
      const k = c.controls;
      k.mode = { stand: "stand", walk: "walk", sit: "sit", look: "sit", crouch: "crouch", leap: "leap", hiss: "crouch" }[s.action];
      k.speed = 0.9; k.look = s.action === "look" ? Math.sin(s.t * 1.3) : 0;
      k.hiss = s.action === "hiss" || s.action === "leap" ? 1 : 0;
      k.squint = s.action === "hiss" ? 0 : 0.75;
    }
  });

  const crow = animal("crow", "Crow", "Fly Together's birds and Climb Together's crow. Wingspan 1 unit.", {
    look: "outdoor", frontYaw: Math.PI, start: 1,
    view: { target: V(0, 0.9, 0), yaw: 0, pitch: 0.55, distance: 1.9 },
    actions: [["glide", "Glide"], ["flap", "Flap"], ["bank-left", "Bank left"], ["bank-right", "Bank right"], ["land", "Landing flare"], ["perch", "Perched"], ["peck", "Peck"], ["stare", "Stare"], ["caw", "Caw"]],
    extra: [
      { label: "Colour", key: "colour", choices: colours },
      { label: "Look", key: "look", choices: [["solid", "Solid colour (as in the games)"], ["black", "Black with colour"]] },
      { label: "Colour on (black crow)", key: "style", choices: [["edges+tips", "Edges and tips"], ["tips", "Tips"], ["edges", "Edges"], ["none", "All black"]] },
      { label: "Model", key: "model", choices: [["v2", "Version 2 (Blender)"], ["v1", "Version 1"]] }
    ],
    make: (s) => new HG.Crow(s.look === "solid" ? { colour: PLAYERS[s.colour], model: s.model } : { accent: PLAYERS[s.colour], style: s.style, model: s.model }),
    drive(c, s, dt) {
      const a = s.action, k = c.controls;
      Object.assign(k, { mode: { land: "land", perch: "perch", peck: "perch", stare: "perch", caw: "perch" }[a] || "fly",
        flap: a === "flap" ? 1 : 0, bank: a === "bank-left" ? -1 : a === "bank-right" ? 1 : 0,
        peck: a === "peck" && (s.t % 1.2) < 0.35 ? 1 : 0, look: a === "stare" ? 0.9 : null });
      if (a === "caw" && (s.t % 1.6) < dt) c.caw();
      // Up in the air when flying, sinking while landing, standing on the floor when perched.
      const w = c.weights, height = w.fly * 0.9 + w.land * 0.32 + w.perch * -c.footHeight();
      s.altitude += (height - s.altitude) * Math.min(1, dt * 3);
      c.root.position.y = s.altitude;
    }
  });

  // ---- Fly Together's trees, bushes and rocks (in the studio, outdoors) ----------------
  // One of each, as the game makes them: the game draws many copies of one shape, each coloured on its own.
  function flyPiece(id, name, about, build, view) {
    return {
      id, name, about, group: "Fly Together: pieces", stage: "studio", frontYaw: 0,
      enter(lab) {
        lab.stage.setLook("outdoor", false);
        lab.stage.props.clear();
        const parts = HG.flight3d.parts(), one = (geo, mat, colour, matrix) => {
          const m = new THREE.InstancedMesh(geo, mat, 1); m.setMatrixAt(0, matrix);
          if (colour) m.setColorAt(0, new THREE.Color().setHSL(...colour));
          lab.stage.props.add(m); return m;
        };
        build(parts.shared, one);
        lab.orbit.set(view);
      }
    };
  }
  const M4 = (x, y, z, sx, sy, sz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion(), V(sx, sy, sz));
  const flyPieces = [
    flyPiece("pine", "Pine tree", "The Alpine's trees (about 5-11 m tall in the game; this one 8 m).", (s, one) => {
      one(s.trunkGeo, s.trunkMat, null, M4(0, -0.2, 0, 1, 8 * 0.35, 1));
      one(s.crownGeo, s.crownMat, [0.3, 0.45, 0.29], M4(0, -0.2 + 8 * 0.25, 0, 2.6, 8 * 0.8, 2.6));
    }, { target: V(0, 4, 0), yaw: 0.5, pitch: 0.2, distance: 22 }),
    flyPiece("bush", "Bush", "Sage-green in the High Desert, dry golden-green in the Deep Desert.", (s, one) => {
      one(s.bushGeo, s.plainMat, [0.22, 0.45, 0.34], M4(-1.6, -0.2, 0, 1.2, 1.0, 1.2));
      one(s.bushGeo, s.plainMat, [0.15, 0.48, 0.38], M4(1.6, -0.2, 0, 1.0, 0.8, 1.0));
    }, { target: V(0, 0.8, 0), yaw: 0.4, pitch: 0.3, distance: 9 }),
    flyPiece("cactus", "Cactus", "The Deep Desert's cactus.", (s, one) => {
      one(s.cactusGeo, s.plainMat, [0.31, 0.41, 0.34], M4(0, -0.3, 0, 1, 1, 1));
    }, { target: V(0, 1.5, 0), yaw: 0.4, pitch: 0.15, distance: 8 }),
    flyPiece("boulder", "Boulders", "The deserts' rocks: tan in the High Desert, red in the Deep Desert.", (s, one) => {
      one(s.boulderGeo, s.plainMat, [0.08, 0.35, 0.6], M4(-2.5, 0.6, 0, 2.2, 1.6, 2.0));
      one(s.boulderGeo, s.plainMat, [0.03, 0.5, 0.45], M4(2.5, 0.4, 0, 1.6, 1.1, 1.5));
    }, { target: V(0, 1, 0), yaw: 0.3, pitch: 0.3, distance: 13 })
  ];

  // ---- Climb Together's parts (in the game's own scene) -----------------------------------
  // One labelled part of the climb on its own (see tagged() in games/lib/climb3d.js), in the game's light.
  function climbPart(part, name, about, view, extra = {}) {
    const state = { haze: false };
    return {
      id: "climb-" + part, name, about, group: "Climb Together: parts", stage: "climb", frontYaw: 0,
      enter(lab) {
        if (view) { lab.orbit.set(view); return; }
        const box = new THREE.Box3();
        for (const o of lab.stage.parts[part] || []) box.expandByObject(o);
        lab.orbit.frameBox(box, 0.3, 0.15);
      },
      options: () => ({ only: part, haze: state.haze, chameleons: false, valley: !!extra.valley }),
      controls: [choice("Haze", [["off", "Clear"], ["on", "As in the game"]], () => (state.haze ? "on" : "off"), (k) => { state.haze = k === "on"; })]
    };
  }
  const climbParts = [
    climbPart("room", "The room and window", "Back wall with the open window, floor, picture, skirting.", { target: V(0.3, 1.7, 0.2), yaw: 0.25, pitch: 0.1, distance: 6.5 }),
    climbPart("shelf", "Bookshelf and books", "Four shelves; the books are pushed back so the cat can walk along the front."),
    climbPart("tank", "The tank", "Where the chameleons start (its front pops off at the escape)."),
    climbPart("plants", "Potted plants", "On top of the bookshelf; the chameleons climb the middle stems."),
    climbPart("alley", "Alley and brick wall", "The alley's damp ground and the brick wall, with holes for the broken windows.", { target: V(0.6, 4.6, -1.4), yaw: 0.25, pitch: 0.1, distance: 7 }),
    climbPart("boxes", "Cardboard boxes", "In the alley, against the brick wall."),
    climbPart("pipes", "Pipes", "Two across the brick wall and one down, with brackets."),
    climbPart("windows", "Broken windows", "Dark inside, with shards of glass left in the frames."),
    climbPart("roof", "Roof, parapet and chimney", "The flat roof behind the parapet, a chimney and a vent."),
    climbPart("crates", "Wooden crates", "On the roof: low ones in front, tall ones (two stacked) behind."),
    climbPart("rocks", "Big rocks", "Three rows of rocks with grass and flowers, and the grassy hill behind."),
    climbPart("tree", "Giant tree", "Roots, trunk, branches, the leafy crown and the bough at the very top."),
    climbPart("valley", "Valley (the end view)", "Meadows, a river, woods and snowy mountains, seen from the top of the tree.",
      { target: V(1.4, 6, -40), yaw: 0, pitch: 0.12, distance: 46 }, { valley: true }),
    climbPart("sky", "Town skyline", "The far-off hills and town behind the roof (a painted picture).")
  ];

  // ---- Fly Together's nest and arch (in the game's own scene, in the canyon) ---------------
  function flyPlace(id, name, about, view, group = "Fly Together: pieces") {
    return {
      id, name, about, group, stage: "fly", frontYaw: 0, state: { haze: true },
      enter(lab) { lab.orbit.set(view(lab.stage)); },
      options() { return { haze: this.state.haze }; },
      describe: canyonSpot
    };
  }
  // Where a marked spot is in the canyon: how far down it, and which ecosystem.
  function canyonSpot(point) {
    const along = Math.round(-point.z), w = HG.flight3d.parts().zoneWeights(along);
    const names = ["Alpine", "High Desert", "Deep Desert"], parts = names.filter((n, i) => w[i] > 0.05);
    return { metresDownTheCanyon: along, ecosystem: parts.join(" blending into ") };
  }
  const nest = flyPlace("nest", "The nest", "Where each round starts: the tree, its branch and the nest.", (st) => {
    const box = new THREE.Box3().setFromObject(st.sc.nest.group), c = box.getCenter(V());
    return { target: V(c.x + 3, HG.flight3d.parts().NEST_HEIGHT + 1, c.z), yaw: Math.PI / 2 - 0.35, pitch: 0.2, distance: 24 };   // (from across the river, with the valley side behind)
  });
  const arch = flyPlace("arch", "Stone arch", "The High Desert has three, spanning the valley (23 m high).", (st) => {
    const z = HG.flight3d.parts().archesBetween(st.world, 1000, 2000)[0];
    return { target: V(st.world.centre(z), 12, -z), yaw: 0, pitch: 0.28, distance: 75 };   // (from up the valley, as the birds come to it)
  });

  // ---- The whole levels ----------------------------------------------------------------
  const places = (list, apply) => choice("Go to", list.map(([key, label]) => [key, label]), () => null, apply);

  const wholeClimb = {
    id: "climb-level", name: "Climb Together: the whole climb", about: "Every part, as in the game. Haze, chameleons and the end view can be switched.",
    group: "Whole levels", stage: "climb", frontYaw: 0, state: { haze: false, chameleons: true, valley: false },
    enter(lab) { lab.orbit.set({ target: V(0.7, 6.8, -1.2), yaw: 0.55, pitch: 0.12, distance: 21 }); this.state.valley = false; },
    options() { return { only: null, ...this.state }; },
    controls: []
  };
  const S = () => HG.climb3d.level.SECTIONS;
  wholeClimb.controls = [
    places([["all", "The whole climb"], ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [String(i), "…" + ["the bookshelf", "the potted plants", "the open window", "the alley's boxes", "the brick wall", "the broken windows", "the wooden crates", "the big rocks", "the giant tree"][i]]), ["top", "The very top (the end view)"]],
      (k, lab) => {
        wholeClimb.state.valley = k === "top";
        if (k === "all") return lab.orbit.set({ target: V(0.7, 6.8, -1.2), yaw: 0.55, pitch: 0.12, distance: 21 });
        if (k === "top") { const L = HG.climb3d.level.LOOKOUT; return lab.orbit.set({ target: V(L.x, L.y - 0.4, L.z - 3), yaw: 0, pitch: 0.25, distance: 4.2 }); }
        const s = S()[Number(k)];
        lab.orbit.set({ target: V(s.x, (s.from + s.to) / 2, s.z), yaw: 0.25, pitch: 0.08, distance: Math.max(1.6, (s.to - s.from) * 1.9) });
      }),
    choice("Haze", [["off", "Clear"], ["on", "As in the game"]], () => (wholeClimb.state.haze ? "on" : "off"), (k) => { wholeClimb.state.haze = k === "on"; }),
    choice("Chameleons", [["on", "Show, where you look"], ["off", "Hide"]], () => (wholeClimb.state.chameleons ? "on" : "off"), (k) => { wholeClimb.state.chameleons = k === "on"; }),
    choice("End view", [["off", "Climbing"], ["on", "Valley and sunset"]], () => (wholeClimb.state.valley ? "on" : "off"), (k) => { wholeClimb.state.valley = k === "on"; })
  ];

  const wholeCanyon = flyPlace("canyon-level", "Fly Together: the whole canyon", "All 3 km, until it starts again: Alpine, High Desert, Deep Desert.",
    (st) => ({ target: V(st.world.centre(1500), 0, -1500), yaw: 0.35, pitch: 1.05, distance: 2300 }), "Whole levels");
  wholeCanyon.state.haze = false;
  const fly = (z, lab) => lab.orbit.set({ target: V(lab.stage.world.centre(z), 4, -z), yaw: 0, pitch: 0.32, distance: 110 });
  wholeCanyon.controls = [
    places([["all", "The whole canyon"], ["start", "The start (the nest)"], ["500", "Alpine (500 m)"], ["900", "Alpine → High Desert"], ["1500", "High Desert (1,500 m)"],
      ["1900", "High Desert → Deep Desert"], ["2500", "Deep Desert (2,500 m)"], ["2900", "Deep Desert → Alpine"]], (k, lab) => {
      if (k === "all") return wholeCanyon.enter(lab);
      if (k === "start") return nest.enter(lab);
      fly(Number(k), lab);
    }),
    choice("Haze", [["off", "Clear"], ["on", "As in the game"]], () => (wholeCanyon.state.haze ? "on" : "off"), (k) => { wholeCanyon.state.haze = k === "on"; })
  ];
  for (const p of [nest, arch]) p.controls = [choice("Haze", [["on", "As in the game"], ["off", "Clear"]], () => (p.state.haze ? "on" : "off"), (k) => { p.state.haze = k === "on"; })];

  return [chameleon, cat, crow, ...climbParts, nest, arch, ...flyPieces, wholeClimb, wholeCanyon];
})();
