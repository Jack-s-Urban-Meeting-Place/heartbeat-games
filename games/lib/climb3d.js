// ============================================================================
// climb3d.js: the 3D world for Climb Together
// ----------------------------------------------------------------------------
// One tall climb, built in code from the All_levels_zoom_out storyboard
// (storyboards/climb-together/): a bookshelf with the chameleons' tank, potted
// plants, an open window, boxes in the alley, a brick wall with pipes, broken
// windows, wooden crates, big rocks with grass, and a giant tree to the top.
//
// The camera stays level as it rises with the chameleons (no looking up or
// down), so upright edges stay upright and the horizon sits across the middle
// of the screen: the two-point perspective of the Base_Geometry storyboard. It
// looks at the climb a little from one side, so the shelves and boxes show
// their depth.
//
// HG.climb3d.level   the climb as plain numbers: where the climbable strip is at
//                    each height, how far it stands out, ledges for cats, perches
//                    for crows, and the sections' names. The game logic uses it.
// HG.climb3d.get()   the shared 3D scene (made once and reused every round).
// Units are metres. Needs three.js, creature-kit.js, chameleon.js, cat.js, crow.js.
// ============================================================================
HG.climb3d = (function () {
  // ---- Tuning: the look ---------------------------------------------------------
  const FOV = 50;                    // camera's field of view, top to bottom (degrees)
  const VIEW_FROM_SIDE = 17;         // how far round to one side the camera looks from (degrees)
  const CHAM_SIZE = 0.2;             // a chameleon's length, snout to tail base (metres)
  const CAT_SIZE = 0.34;             // the cat's length, chest to hips (metres)
  const CROW_SPAN = 0.95;            // the crow's wingspan (metres)
  const SHADOWS = true;              // soft shadows under the animals (turn off if the laptop is slow)
  const CAMO_DETAIL = 0.5;           // the camouflage picture's sharpness (share of the screen's pixels)
  const MAX_PIXEL_RATIO = 1.5;       // never draw finer than this (performance)
  const WINDOW_PASS = 0.6;           // the camera passes through the window as the chameleons go this far into the alley (metres)
  const WALL_THROUGH = -0.17;        // ...and then stays this far out past the room's wall (it's at 0; its back at -0.12)
  const BEND_ROUND = 0.025;          // a chameleon bends round corners as if they were rounded this much (metres)
  const PLANT_FADE = 0.75;          // how much the potted plants fade while the chameleons cross the sill (0 none, 1 gone)
  const VALLEY_RISE = 0.35;          // at the end, looking out from the top of the tree: the camera rises this much (metres)...
  const VALLEY_BACK = 0.6;           // ...steps back this much...
  const VALLEY_LOOK = [3.4, 22];     // ...and looks at a point this far down and this far out (metres): over the valley
  // ---- Tuning: the light in the room ---------------------------------------------
  // Late-afternoon sun comes in through a window off to the left, throwing a warm patch of light, with the
  // shadows of the window's bars, across the wall and the bookshelf; soft light bounces round the room.
  // It all fades out as the camera goes through the window into the alley (where the light stays as it was).
  const ROOM_SUN_FROM = [-3.0, 3.7, 4.3];     // where the sunbeam comes in: the window off to the left, in front (metres)
  const ROOM_SUN_AT = [-0.2, 1.35, 0];        // ...and the spot on the wall it's aimed at
  const ROOM_SUN_COLOUR = 0xffb468;           // warm late-afternoon sunlight
  const ROOM_SUN_STRENGTH = 5.0;              // how bright the patch of sunlight is
  const ROOM_SUN_WIDTH = 17;                  // how wide the beam is (degrees)
  const ROOM_BOUNCE = 0.55;                   // soft light bouncing round the room, from all directions (0 = none)
  const ROOM_FILL = 0.25;                     // the plain even light from the sky above, in the room (outside it's 1.3)
  const ROOM_FRONT = 0.55;                    // the light from the camera's side that gives the chameleons their shadows (outside 2.6)
  const DUST = 420;                           // specks of dust floating in the sunlight
  const DUST_SIZE = 0.009;                    // ...each this big (metres)
  // ---- Tuning: the light in the alley --------------------------------------------
  // The alley is in cool blue shade, with warm evening sun across the top of its brick wall: the room's own
  // building (behind the camera) shades everything below a line, so the chameleons climb out of the shade into
  // the sun. Above the wall (the roof, the rocks, the tree) it's open daylight, as before.
  const ALLEY_SUN_FROM = [4.5, 9.5, 6.5];     // where the evening sun shines from: high up, in front, to the right (metres)
  const ALLEY_SUN_AT = [0.9, 4.55, -1.4];     // ...aimed at the middle of the shadow's edge on the brick wall (between the pipes)
  const ALLEY_SUN_COLOUR = 0xffcf9c;          // warm evening sunlight
  const ALLEY_SUN_STRENGTH = 2.8;             // how bright the sunny part of the wall is
  const ALLEY_SUN_WIDTH = 16;                 // how wide the sunlight is (degrees)
  const ALLEY_SHADE = 0x93b2e6;               // the colour of the shade: blue light from the sky
  const ALLEY_BOUNCE = 0.7;                   // soft light from all round: the sky above, the warm bricks (0 = none)
  const ALLEY_FILL = 0.55;                    // the plain even light from the sky, in the alley (in the open it's 1.3)
  const ALLEY_FRONT = 0.55;                   // the light from the camera's side that gives the chameleons their shadows (in the open 2.6)
  const ALLEY_UP = [4.9, 5.8];                // the alley's light gives way to open daylight as the view rises from this height to this (metres)
  // ---- Tuning: the light in the open (the roof, the rocks, the tree) ----------------
  // A sunny afternoon: the sun from the right, a little in front, raking across the crates and rocks so their
  // right sides glow and their left sides fall into shade; soft blue light from the sky fills the shade.
  const OPEN_SUN_FROM = [0.8, 0.5, 0.33];     // which way the sun is: right, up, toward the camera (a direction, not a place)
  const OPEN_SUN_COLOUR = 0xffe2b8;           // warm afternoon sunlight
  const OPEN_SUN_STRENGTH = 3.6;              // how bright the sunlight is
  const OPEN_BOUNCE = 0.6;                    // soft light from all round: blue sky above, green hills below (0 = none)
  const OPEN_FILL = 0.25;                     // the plain even light from the sky (it was 1.3)
  // ---- Tuning: golden hour at the tree top -----------------------------------------
  // As the chameleons climb the giant tree, the afternoon turns to golden hour: the sun sinks lower and warmer,
  // the sky and haze turn gold. At the very top, as the view turns out over the valley, the setting sun comes
  // into view just above the far mountains, and the light swings round to come from it.
  const GOLD_UP = [9.2, 11.4];                // it turns golden as the view rises from this height to this (metres)
  const GOLD_SUN_FROM = [0.82, 0.3, 0.48];    // which way the low sun is while they climb: right, a little up, in front
  const GOLD_SUN_COLOUR = 0xffa860;           // deep warm golden-hour light
  const GOLD_SUN_STRENGTH = 3.4;              // how bright it is
  const GOLD_BOUNCE = 0.75;                   // soft light from all round: a golden sky (0 = none)
  const GOLD_FILL = 0.25;                     // the plain even light
  const GOLD_SKY = ["#6f8fc4", "#e9b98a", "#ffdcae"];   // the sky's colours: overhead, halfway down, at the horizon
  const GOLD_HAZE = 0xf0cfa8;                 // the colour of the haze in the distance
  const SUNSET_FROM = [0.42, 0.1, -0.9];      // where the setting sun is, seen from the top: right, just up, out over the valley
  const SUNSET_TURN = 0.6;                    // how far the light swings round to come from it at the end (0 = not at all, 1 = all the way)
  const SUNSET_SIZE = 46;                     // how big the sun and its glow look (metres, far away)
  const VALLEY_SHOW = [11.9, 12.8];           // the valley fades in behind while the view climbs through the leaves, from this height to this (metres)
  const POLLEN = 110;                         // specks of golden pollen floating round the bough at the top
  const POLLEN_SIZE = 0.012;                  // ...each this big (metres)
  const BIRDS = 7;                            // birds gliding far out over the valley at the end
  const BIRD_DISTANCE = 55;                   // ...this far out (metres)...
  const BIRD_HEIGHT = 3;                      // ...this far above the top of the tree...
  const BIRD_SPEED = 2.2;                     // ...drifting across this fast (metres per second)
  // ---- Tuning: shading in creases --------------------------------------------------
  // Where two surfaces meet (the floor and the wall, books and shelf, a box on the ground, a crate stepping up
  // from the one in front), less light gets in, so it's a little darker: soft dark gradients laid along each crease.
  const CREASES = true;                       // turn the shading in creases on or off
  const CREASE_DARK = 1.7;                    // how dark they are, all together (0.5 = half as dark, 1.5 = half as dark again)
  // ---- Tuning: glow ----------------------------------------------------------------
  // A soft glow spills round the brightest things (the setting sun, the window, patches of sunlight), as it does
  // in a camera or the eye; and the corners of the picture are a little darker, like a camera lens.
  const GLOW = true;                          // turn the glow (and the darker corners) on or off (off: a little less work for the laptop)
  const GLOW_FROM = 0.8;                      // how bright something must be before it glows (1 = white, on the screen)
  const GLOW_STRENGTH = 0.45;                 // how strong the glow is
  const GLOW_SPREAD = 1.0;                    // how far it spreads
  const VIGNETTE = 0.2;                       // how much darker the corners are (0 = not at all)
  // ----------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();   // repeatable "random"
  const C = (hex) => new THREE.Color(hex);
  const DEG = Math.PI / 180;

  // ==========================================================================
  // The level: nine sections, bottom to top. For each: the heights it covers,
  // the middle of the climbable strip (x) and half its width, and how far the
  // climbing surface stands out toward the camera (z).
  // ==========================================================================
  const SECTIONS = [
    { name: "the bookshelf", from: 0, to: 2.0, x: 0, half: 0.47, z: 0.3 },
    { name: "the potted plants", from: 2.0, to: 2.6, x: 0.05, half: 0.47, z: 0.22 },
    { name: "the open window", from: 2.6, to: 3.42, x: 0.35, half: 0.4, z: 0.04 },
    { name: "the boxes in the alley", from: 3.42, to: 4.3, x: 0.55, half: 0.42, z: 0.33 },
    { name: "the brick wall", from: 4.3, to: 6.0, x: 0.75, half: 0.6, z: 0.02 },
    { name: "the broken windows", from: 6.0, to: 6.95, x: 0.9, half: 0.5, z: 0.03 },
    { name: "the wooden crates", from: 6.95, to: 7.9, x: 1.05, half: 0.45, z: -0.31 },
    { name: "the big rocks", from: 7.9, to: 9.4, x: 1.2, half: 0.55, z: -1.11 },
    { name: "the giant tree", from: 9.4, to: 13, x: 1.4, half: 0.4, z: -2.31 }
  ];
  // The outdoors (the alley's boxes and everything above) was laid out on the room's own wall, with its
  // ground at 3.46 m. Since 2.14.0 it sits in a real alley behind the room, reached through the open
  // window: its ground level with the window sill, its far (brick) wall ALLEY_DEPTH back. OUT_DY and OUT_DZ
  // move all of it there; the 3D scenery is built in the old place inside a group moved by the same amounts.
  const ALLEY_DEPTH = 1.4;           // how far back the alley's brick wall is from the room's wall (metres)
  const OUT_DY = 2.62 - 3.46, OUT_DZ = -ALLEY_DEPTH;
  SECTIONS.forEach((s, i) => { if (i >= 3) { s.from += OUT_DY; s.to += OUT_DY; s.z += OUT_DZ; } });
  SECTIONS[2].to = SECTIONS[3].from = 2.66;                          // the window is now just the way through
  const TOP = 12.0 + OUT_DY;         // reaching this height wins
  const START_Y = 0.27;              // where the chameleons start, in the tank
  const BLEND = 0.22;                // sections blend into each other over this height (metres)
  const PIPES = [4.75, 5.45];        // heights of the pipes across the brick wall (they bulge out)
  const TREE = { x: 1.4, r: 0.5, z: -2.81 };                          // the giant tree's trunk: middle, radius, and centre depth
  const ROOTS = { y: 9.35, top: 9.75, r: 0.62 };                      // where it stands on the top rock, and its flaring roots
  // The very top (since 2.18.0): past the finish the trunk carries on up through the leafy crown, narrowing,
  // to a level bough across the top where the chameleons end, looking out over the valley.
  const CROWN = { from: 13.15, y: 14.45, r: 0.1, half: 0.45, topR: 0.16 };  // where the trunk starts narrowing; the bough's height, radius, half-length; the trunk's radius under it
  const BRANCHES = [[10.0, -1, 1.0], [10.9, 1, 1.1], [11.7, -1, 0.9]];  // its branches: height, side (-1 left), length
  const BRANCH_RADIUS = [0.12, 0.05];                                // a branch's thickness where it joins the trunk, and at its tip
  // A branch as a line: its root sunk well inside the trunk (so it's joined on), out and up to its tip.
  // at(t): the point t of the way along (0 root, 1 tip) and the branch's radius there.
  function branchLine(y, side, len) {
    const from = { x: TREE.x + side * TREE.r * 0.5, y, z: TREE.z + 0.18 };
    const to = { x: TREE.x + side * (TREE.r + len * 0.8), y: y + len * 0.5, z: TREE.z + 0.25 };
    return { from, to, at: (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t,
      r: BRANCH_RADIUS[0] + (BRANCH_RADIUS[1] - BRANCH_RADIUS[0]) * t }) };
  }

  function sectionAt(y) { return SECTIONS.find((s) => y < s.to) || SECTIONS[SECTIONS.length - 1]; }
  function blendAt(y, key) {
    const i = SECTIONS.indexOf(sectionAt(y)), s = SECTIONS[i];
    const next = SECTIONS[i + 1], prev = SECTIONS[i - 1];
    if (next && y > s.to - BLEND) return s[key] + (next[key] - s[key]) * smooth((y - (s.to - BLEND)) / (2 * BLEND)) ;
    if (prev && y < s.from + BLEND) return prev[key] + (s[key] - prev[key]) * smooth((y - (s.from - BLEND)) / (2 * BLEND));
    return s[key];
  }
  const level = {
    SECTIONS, TOP, START_Y,
    centre: (y) => blendAt(y, "x"),
    half: (y) => blendAt(y, "half"),
    // How far the climbing surface stands out at this height (with the pipes' bulges).
    surface(y) {
      let z = blendAt(y, "z");
      for (const p of PIPES) z += 0.085 * Math.exp(-Math.pow((y - p - OUT_DY) / 0.06, 2));
      return z;
    },
    section: (y) => sectionAt(y),
    // Where a cat can stand: flat tops (height, from x, to x, and how far out from the wall it stands).
    ledges: [
      { y: 0.55, x0: -0.45, x1: 0.45, z: 0.26 }, { y: 1.0, x0: -0.45, x1: 0.45, z: 0.26 },
      { y: 1.45, x0: -0.45, x1: 0.45, z: 0.26 }, { y: 2.0, x0: -0.5, x1: 0.5, z: 0.2 },
      { y: 2.62, x0: -0.1, x1: 0.8, z: 0.08 }, { y: 3.46, x0: -0.8, x1: 1.6, z: 0.24 },
      { y: 3.86, x0: 0.05, x1: 0.48, z: 0.17 }, { y: 4.32, x0: 0.27, x1: 0.73, z: 0.17 },
      { y: 4.8, x0: -1.5, x1: 2.6, z: 0.06 }, { y: 5.5, x0: -1.5, x1: 1.65, z: 0.06 },
      { y: 6.02, x0: 0.38, x1: 1.48, z: 0.06 }, { y: 6.98, x0: -1.5, x1: 3, z: 0.0 }
    ],
    // Where a crow can land (from the roof up): built with the climbing map, below.
    perches: [],
    // The tank (its front pops off at the escape; the rest stays). leapFrom: how high up its back glass the
    // chameleons climb before leaping out through the open front to the shelf above.
    TANK: { x0: -0.3, x1: 0.3, y0: 0.1, y1: 0.49, z0: 0.12, z1: 0.3, leapFrom: 0.38 },
    ALLEY_DEPTH, OUT_DY, OUT_DZ
  };

  // ==========================================================================
  // The climbing map (since 2.12.0; the whole climb since 2.16.0): the big solid shapes,
  // as plain numbers. The 3D scene is built from them, and the chameleons climb over
  // them: up the fronts of the books, over the shelf edges and across the shelf tops, up
  // the pots and plants, through the window, up the boxes and the brick wall, and up the
  // staircase of windows, roof, crates and rocks to the tree, leaping where they can't climb.
  // (The "surface" above is now only a rough guide, e.g. for the start in the tank.)
  // ==========================================================================
  const SHELF = {
    x0: -0.55, x1: 0.55, depth: 0.3, side: 0.03, board: 0.025,
    boards: [0.55, 1.0, 1.45],         // shelf tops (each board is `board` thick, just below)
    top: 2.0, topDepth: 0.32,          // the top of the bookcase, a little deeper
    plinth: 0.1
  };
  const CAT_WALK = 1 / 3;              // the front share of each shelf left clear of books, for the cat to walk on
  const BOOK_GAP = [0.06, 0.2];        // the gap from the tops of the books up to the shelf above (from, to; metres): the leap
  // The four bays: floor and ceiling heights, and how far out the fronts of the books come.
  // (The bottom bay's books are short-depth ones behind the tank.)
  const BAYS = [
    { floor: SHELF.plinth, ceil: 0.55 - SHELF.board, front: 0.11 },
    ...SHELF.boards.map((y, i) => ({ floor: y, ceil: (SHELF.boards[i + 1] || SHELF.top - 0.03) - (SHELF.boards[i + 1] ? SHELF.board : 0), front: SHELF.depth * (1 - CAT_WALK) }))
  ];
  // The books: a row along each bay, packed side by side, each with its own width and height.
  const BOOKS = (() => {
    let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return BAYS.map((bay) => {
      const row = []; let x = SHELF.x0 + SHELF.side + 0.004;
      const room = bay.ceil - bay.floor;                              // tall books, always with a little gap above them to leap
      while (x < SHELF.x1 - SHELF.side - 0.03) {
        const w = Math.min(0.025 + r() * 0.035, SHELF.x1 - SHELF.side - x - 0.002);
        row.push({ x0: x, x1: x + w, h: room - BOOK_GAP[0] - r() * (BOOK_GAP[1] - BOOK_GAP[0]), colour: Math.floor(r() * 10) });
        x += w + 0.002;
      }
      return row;
    });
  })();
  const bookTop = (bay, x) => {
    const row = BOOKS[bay]; const b = row.find((k) => x < k.x1) || row[row.length - 1];
    return BAYS[bay].floor + b.h;
  };
  // The potted plants on top of the bookcase, set back so the cat can walk in front of them.
  const POTS = [
    { x: -0.1, r: 0.1, h: 0.18 }, { x: 0.17, r: 0.1, h: 0.15 }, { x: 0.44, r: 0.1, h: 0.2 }   // all under the window sill
  ].map((p) => ({ ...p, z: 0.11, stem: SHELF.top + 0.44 }));         // z: the pot's middle; stem: how high its plant's stems reach
  const potRadius = (pot, u) => pot.r * (u < 0.85 ? 0.72 + 0.18 * u / 0.85 : 1);   // the pot's flowerpot profile (u: 0 base, 1 rim)
  const SILL = { x0: -0.15, x1: 0.85, y: 2.62, front: 0.13 };         // the window sill above the plants
  // The open window: the opening, its frame, and the sash pushed up (its bottom bar `sash`, its glass above).
  const WIN = { x0: -0.05, x1: 0.75, y0: 2.62, y1: 3.32, sash: 2.98, frameTop: 3.39, frameFront: 0.05 };
  const WALL_BACK = -0.12;                                            // the back of the room's wall (where the alley begins)
  // The alley, through the window: its ground level with the sill, cardboard boxes against its brick wall.
  // (BOXES_AT and PIPE_AT are in the outdoor scenery's own layout, ground at 3.46 against z = 0; BOXES and
  // PIPE are where they really are, moved back into the alley by OUT_DY and OUT_DZ.)
  const ALLEY = { y: SILL.y, wall: OUT_DZ };
  const BOXES_AT = [                                                  // x0..x1, y0..y1 (bottom to top), z0..z1 (back to front), turn
    { x0: 0.02, x1: 0.5, y0: 3.46, y1: 3.86, z0: 0.0, z1: 0.34, turn: 0.03 },
    { x0: 0.52, x1: 0.98, y0: 3.46, y1: 3.76, z0: 0.02, z1: 0.33, turn: -0.04 },
    { x0: 0.24, x1: 0.76, y0: 3.86, y1: 4.32, z0: 0.01, z1: 0.33, turn: 0.02 },   // (stacked on the first two)
    { x0: -0.6, x1: -0.15, y0: 3.46, y1: 3.78, z0: 0.0, z1: 0.3, turn: 0.06 },
    { x0: 1.1, x1: 1.45, y0: 3.46, y1: 3.7, z0: 0.0, z1: 0.28, turn: 0 }
  ];
  const BOXES = BOXES_AT.map((b) => ({ ...b, y0: b.y0 + OUT_DY, y1: b.y1 + OUT_DY, z0: b.z0 + OUT_DZ, z1: b.z1 + OUT_DZ }));
  // Two pipes across the brick wall (the second stops at a downpipe), each with brackets.
  const PIPE_AT = { r: 0.045, z: 0.06, runs: [{ y: 4.75, x0: -7, x1: 8 }, { y: 5.45, x0: -7, x1: 1.7 }] };
  const PIPE = { r: PIPE_AT.r, z: PIPE_AT.z + OUT_DZ, runs: PIPE_AT.runs.map((r) => ({ ...r, y: r.y + OUT_DY })) };
  const BRICK = ALLEY.wall + 0.006;                                   // the climbing line up the brick wall
  // Above the brick wall (since 2.16.0, from the designer's marked storyboards): a staircase stepping back
  // from the camera, with a short walk back across each top. Up the broken-window wall (over a window's sill,
  // up inside it, out under its top frame), over the roof's edge and back across the roof; up a low wooden
  // crate and back across it; up a tall crate and back across it; up three rows of big rocks, back across each;
  // then back across the top rock to the giant tree's roots, and up its round trunk.
  // (Numbers as built, in the outdoors' own heights and depths; the shifted ones follow.)
  const STEP = 0.4;                                                   // each walk back across a top (metres)
  const WINDOWS_AT = { y0: 6.02, y1: 6.78, glass: -0.08, sill: 0.1, frame: 0.04, bar: 0.02, runs: [[0.42, 0.86], [1.0, 1.44]] };
  const ROOF_AT = { cap: 6.88, y: 6.98, front: 0.09 };               // the parapet's cap (underside, top, front)
  const CRATES_AT = [                                                 // a front row of low crates on the roof, a row of tall ones behind
    { x0: 0.3, x1: 0.85, y1: 7.33, row: 0 }, { x0: 0.85, x1: 1.35, y1: 7.41, row: 0 }, { x0: 1.35, x1: 1.9, y1: 7.3, row: 0 },
    { x0: 0.3, x1: 1.08, y1: 7.84, row: 1 }, { x0: 1.08, x1: 1.9, y1: 7.88, row: 1 }
  ].map((c) => ({ ...c, y0: ROOF_AT.y, z1: ROOF_AT.front - STEP * (c.row + 1), z0: ROOF_AT.front - STEP * (c.row + 2) }));
  const ROCKS_AT = [                                                  // three rows of big rocks, two side by side in each
    { x0: 0.3, x1: 1.1, y1: 8.33, row: 0 }, { x0: 1.1, x1: 1.9, y1: 8.38, row: 0 },
    { x0: 0.3, x1: 1.0, y1: 8.86, row: 1 }, { x0: 1.0, x1: 1.9, y1: 8.82, row: 1 },
    { x0: 0.3, x1: 1.15, y1: ROOTS.y, row: 2 }, { x0: 1.15, x1: 1.9, y1: ROOTS.y - 0.02, row: 2 }
  ].map((r) => {
    const front = CRATES_AT[3].z0 - STEP * r.row;
    return { ...r, y0: ROOF_AT.y, z1: front, z0: r.row === 2 ? TREE.z - 0.8 : front - STEP };   // (the top row reaches back under the tree)
  });
  const shiftOut = (o) => ({ ...o, y0: o.y0 + OUT_DY, y1: o.y1 + OUT_DY, z0: o.z0 + OUT_DZ, z1: o.z1 + OUT_DZ });
  const WINDOWS = { ...WINDOWS_AT, y0: WINDOWS_AT.y0 + OUT_DY, y1: WINDOWS_AT.y1 + OUT_DY,
    glass: WINDOWS_AT.glass + OUT_DZ, sill: WINDOWS_AT.sill + OUT_DZ, frame: WINDOWS_AT.frame + OUT_DZ, bar: WINDOWS_AT.bar + OUT_DZ };
  const ROOF = { cap: ROOF_AT.cap + OUT_DY, y: ROOF_AT.y + OUT_DY, front: ROOF_AT.front + OUT_DZ };
  const CRATES = CRATES_AT.map(shiftOut), ROCKS = ROCKS_AT.map(shiftOut);
  const TRUNK = { x: TREE.x, r: TREE.r, z: TREE.z + OUT_DZ, base: ROOTS.y + OUT_DY, rootsTop: ROOTS.top + OUT_DY, rootsR: ROOTS.r };
  // The bough across the very top, where the climb ends (shifted like the rest of the outdoors).
  const LOOKOUT = { x: TREE.x, y: CROWN.y + OUT_DY, z: TRUNK.z, r: CROWN.r, half: CROWN.half };
  // The trunk's radius at height y: it narrows a little up to the crown, then quickly up to the bough, and
  // its last TIP metres taper into the bough.
  const TIP = 0.14;
  const trunkR = (y) => {
    const from = CROWN.from + OUT_DY, mid = TREE.r * 0.85;
    if (y < from) return TREE.r + (mid - TREE.r) * clamp((y - TRUNK.rootsTop) / (from - TRUNK.rootsTop), 0, 1);
    if (y < LOOKOUT.y - TIP) return mid + (CROWN.topR - mid) * clamp((y - from) / (LOOKOUT.y - TIP - from), 0, 1);
    return CROWN.topR + (LOOKOUT.r * 0.9 - CROWN.topR) * clamp((y - LOOKOUT.y + TIP) / TIP, 0, 1);   // (tucked inside the bough)
  };
  const TRUNK_SLICE = 0.05;                                           // routes up the round trunk differ every this far sideways
  // The crate or rock in a row at sideways position x (the nearest, past either end of the row).
  const inRow = (list, row, x) => {
    const r = list.filter((c) => c.row === row);
    return r.find((c) => x < c.x1) || r[r.length - 1];
  };

  // The route a chameleon climbs at sideways position x: points (y, z) from the bottom up. A point
  // marked `leap` is reached by leaping from the one before. Built once per distinct x (book, pot, box...).
  const routes = new Map();
  // The things on the way up at sideways position x (which book, pot, box, pipes...): x positions with
  // the same choices share a route.
  // (A chameleon counts as on a box up to half its width past the box's side, so it never hides inside the box.)
  const boxUnder = (x, y0, above = 0.01) => BOXES.findIndex((b) => b.y0 > y0 - 0.01 && b.y0 < y0 + above && x > b.x0 - 0.05 && x < b.x1 + 0.05);
  function choices(x) {
    const ledgeBox = boxUnder(x, ALLEY.y);
    return {
      books: BAYS.map((b, i) => BOOKS[i].findIndex((k) => x < k.x1)),
      tank: x > level.TANK.x0 && x < level.TANK.x1,
      pot: POTS.findIndex((p) => Math.abs(x - p.x) < p.r * 0.8),
      sill: x > SILL.x0 + 0.03 && x < SILL.x1 - 0.03,
      ledgeBox, topBox: ledgeBox < 0 ? -1 : boxUnder(x, BOXES[ledgeBox].y1, 0.15),   // (a box resting on it, or overhanging just above)
      pipes: PIPE.runs.map((r) => x > r.x0 && x < r.x1),
      win: WINDOWS.runs.findIndex(([a, b]) => x > a - 0.06 && x < b + 0.06),
      crates: [0, 1].map((row) => CRATES.indexOf(inRow(CRATES, row, x))),
      rocks: [0, 1, 2].map((row) => ROCKS.indexOf(inRow(ROCKS, row, x))),
      trunk: Math.round(clamp(x - TRUNK.x, -0.4, 0.4) / TRUNK_SLICE)
    };
  }
  const routeKey = (x) => JSON.stringify(choices(x));
  function buildRoute(x) {
    const pts = [];
    const add = (y, z, leap) => pts.push({ y, z, leap: !!leap });
    const front = SHELF.depth;
    // From the front of the plinth: back across it, then each bay: up the books, leap to the
    // front edge of the shelf above, over the edge, and back across the cat walk to the next books.
    add(SHELF.plinth, front);
    const T = level.TANK, inTank = x > T.x0 && x < T.x1;
    BAYS.forEach((bay, i) => {
      if (i === 0 && inTank) {                                        // in the tank: up its back glass, then leap out of the open front
        add(T.y0 + 0.04, T.z0 + 0.006); add(T.leapFrom, T.z0 + 0.006);
      } else {
        add(bay.floor, bay.front);
        add(bookTop(i, x), bay.front);
      }
      const next = BAYS[i + 1], edgeFront = next ? front : SHELF.topDepth, edgeTop = next ? next.floor : SHELF.top;
      add(edgeTop - SHELF.board * 0.8, edgeFront, true);              // leap: catch the front edge of the board above
      add(edgeTop, edgeFront);
    });
    // On top of the bookcase: back to a pot (up the pot, over its rim, up its plant, leap to the sill),
    // or between pots back to the wall and up it (leaping out to the sill's front edge).
    const pot = POTS.find((p) => Math.abs(x - p.x) < p.r * 0.8);
    const sill = x > SILL.x0 + 0.03 && x < SILL.x1 - 0.03;
    if (pot) {
      const front = (u) => pot.z + Math.sqrt(Math.max(0, potRadius(pot, u) ** 2 - (x - pot.x) ** 2));
      for (const u of [0, 0.45, 0.85, 1]) add(SHELF.top + pot.h * u, front(u));
      add(SHELF.top + pot.h + 0.03, pot.z + 0.03);                    // over the rim, onto a stem
      add(pot.stem, pot.z + 0.02);
    } else {
      add(SHELF.top, 0.006);
      add(SILL.y - 0.1, 0.006);
    }
    const ch = choices(x);
    if (sill) {
      add(SILL.y - 0.02, SILL.front, true);                           // leap to the front edge of the sill
      add(SILL.y, SILL.front);
    } else add(SILL.y, 0.006, !!pot);
    // Through the open window (the game keeps them within it by here): back across the sill, out over
    // the alley ground (level with the sill) to the boxes against the brick wall, or to the wall itself.
    add(SILL.y, WALL_BACK);
    let top = ALLEY.y;
    if (ch.ledgeBox >= 0) {
      const b = BOXES[ch.ledgeBox];
      add(ALLEY.y, b.z1); add(b.y1, b.z1); top = b.y1;
      if (ch.topBox >= 0) {
        const c = BOXES[ch.topBox];
        if (c.y0 > b.y1 + 0.01) add(c.y0 + 0.02, c.z1, true);           // overhanging just above: leap up to its front edge
        else add(b.y1, c.z1);
        add(c.y1, c.z1); top = c.y1;
      }
    }
    add(top, BRICK);
    // The brick wall: straight up, climbing round the front of each pipe.
    PIPE.runs.forEach((run, i) => {
      if (!ch.pipes[i]) return;
      add(run.y - PIPE.r - 0.012, BRICK);
      for (let k = 0; k <= 6; k++) {                                  // round the pipe's front, bottom to top
        const a = -Math.PI / 2 + Math.PI * k / 6;
        add(run.y + PIPE.r * Math.sin(a), PIPE.z + PIPE.r * Math.cos(a));
      }
      add(run.y + PIPE.r + 0.012, BRICK);
    });
    // The broken windows: over a window's sill, up inside it (on the glass, over its cross bar) and out under its
    // top frame; up its frame where it's at the window's side; or just up the wall between the windows.
    if (ch.win >= 0) {
      const [a, b] = WINDOWS.runs[ch.win], W = WINDOWS, inside = x > a + 0.02 && x < b - 0.02;
      const face = inside ? W.glass + 0.006 : W.frame + 0.006, mid = (W.y0 + W.y1) / 2;
      add(W.y0 - 0.05, BRICK); add(W.y0 - 0.05, W.sill); add(W.y0, W.sill);     // over the sill
      add(W.y0, face);
      if (inside) { add(mid - 0.012, face); add(mid - 0.012, W.bar); add(mid + 0.012, W.bar); add(mid + 0.012, face); }
      add(W.y1, face); add(W.y1, W.frame); add(W.y1 + 0.04, W.frame);            // out under the top frame
      add(W.y1 + 0.04, BRICK);
    }
    // Over the roof's edge (under the parapet's cap, round its front) and back across the roof; up the crates,
    // back across each top; up the rows of rocks, back across each top.
    add(ROOF.cap, BRICK); add(ROOF.cap, ROOF.front); add(ROOF.y, ROOF.front);
    let up = ROOF.y;
    for (const i of [...ch.crates.map((k) => CRATES[k]), ...ch.rocks.map((k) => ROCKS[k])]) { add(up, i.z1); add(i.y1, i.z1); up = i.y1; }
    // Back across the top rock to the tree, up its flaring roots and its round trunk.
    const dx = ch.trunk * TRUNK_SLICE, round = (r) => TRUNK.z + Math.sqrt(Math.max(0, r * r - dx * dx));
    add(up, round(TRUNK.rootsR));
    if (up < TRUNK.base) add(TRUNK.base, round(TRUNK.rootsR));
    for (let y = TRUNK.rootsTop; y < LOOKOUT.y - LOOKOUT.r - 0.03; y += 0.25) add(y, round(trunkR(y)));
    // Past the finish (TOP), the game carries them on up through the leaves, round the front of the bough
    // across the very top, and a little way back across it, looking out over the valley.
    const B = LOOKOUT;
    add(B.y - B.r - 0.03, round(trunkR(B.y - B.r - 0.03)));
    for (let a = -20; a <= 90; a += 22) add(B.y + B.r * Math.sin(a * DEG), B.z + B.r * Math.cos(a * DEG));
    add(B.y + B.r, B.z - 0.06);
    // How far along the route each point is (its "s"): the distance climbed to get there.
    let s = 0;
    pts.forEach((p, i) => { if (i) s += Math.hypot(p.y - pts[i - 1].y, p.z - pts[i - 1].z); p.s = s; });
    return pts;
  }
  function routeAt(x) {
    const key = routeKey(x);
    if (!routes.has(key)) routes.set(key, buildRoute(x));
    return routes.get(key);
  }
  Object.assign(level, {
    SHELF, BAYS, BOOKS, POTS, SILL, WIN, ALLEY, WALL_BACK, BOXES, BOXES_AT, PIPE, PIPE_AT, CAT_WALK,
    WINDOWS, WINDOWS_AT, ROOF, ROOF_AT, CRATES, CRATES_AT, ROCKS, ROCKS_AT, TRUNK, LOOKOUT, STEP,
    route: routeAt, routeKey,
    // Where on the route a distance s is: { y, z, pitch (how the chameleon tilts: 0 = head up a wall,
    // -90° = walking back across a top), leap (true on a leap), seg (the segment's index) }.
    at(x, s) {
      const pts = routeAt(x);
      s = clamp(s, 0, pts[pts.length - 1].s);
      let i = 1; while (i < pts.length - 1 && pts[i].s < s) i++;
      const a = pts[i - 1], b = pts[i], k = (s - a.s) / Math.max(1e-6, b.s - a.s);
      return { y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, leap: b.leap, seg: i,
        from: a, to: b, pitch: Math.atan2(b.z - a.z, b.y - a.y) };
    },
    // The way the route runs around s, averaged over a short stretch ahead and behind (so the
    // chameleon starts tipping over an edge a little before it gets there): the tilt angle.
    tilt(x, s, behind = 0.05, ahead = 0.07) {
      const p = level.at(x, s - behind), q = level.at(x, s + ahead);
      return Math.atan2(q.z - p.z, q.y - p.y);
    },
    // The route distance nearest to a point (y, z), skipping leaps (used when a chameleon moves
    // sideways onto a different book or pot, whose route is a little different).
    project(x, y, z) {
      const pts = routeAt(x); let best = 0, bestD = Infinity;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].leap) continue;
        const a = pts[i - 1], b = pts[i], dy = b.y - a.y, dz = b.z - a.z, len2 = dy * dy + dz * dz || 1e-9;
        const k = clamp(((y - a.y) * dy + (z - a.z) * dz) / len2, 0, 1);
        const d = Math.hypot(a.y + dy * k - y, a.z + dz * k - z);
        if (d < bestD) { bestD = d; best = a.s + (b.s - a.s) * k; }
      }
      return best;
    }
  });
  // The route around a chameleon at (x, s), as the surface it's on (controls.surface in chameleon.js): a point
  // d body lengths along, from its root at (y0, z0) tilted by `pitch`, in its own size; corners rounded a little
  // (BEND_ROUND), and the route carried on straight past either end.
  function surfaceFor(x, s, y0, z0, pitch, turn) {
    const pts = routeAt(x), end = pts[pts.length - 1].s, cp = Math.cos(pitch), sp = Math.sin(pitch);
    const point = (q) => {
      if (q >= 0 && q <= end) return level.at(x, q);
      const e = q < 0 ? 0 : end, p = level.at(x, e), b = level.at(x, e + (q < 0 ? 0.05 : -0.05)), k = Math.abs(q - e) / 0.05;
      return { y: p.y + (p.y - b.y) * k, z: p.z + (p.z - b.z) * k };
    };
    return {
      turn,
      at(d) {
        const q = s + d * CHAM_SIZE, a = point(q - BEND_ROUND), b = point(q), c = point(q + BEND_ROUND);
        const dy = (a.y + 2 * b.y + c.y) / 4 - y0, dz = (a.z + 2 * b.z + c.z) / 4 - z0;
        return { y: (dy * cp + dz * sp) / CHAM_SIZE, z: (dz * cp - dy * sp) / CHAM_SIZE, a: Math.atan2(c.z - a.z, c.y - a.y) - pitch };
      }
    };
  }

  // The cat walks along the front of each shelf (the cat walk) and across the top of the bookcase in
  // front of the pots: these replace the simple bookshelf ledges.
  // Higher up: the window sill, the tops of the boxes in the alley, and along the tops of the pipes.
  level.ledges.length = 0;
  level.ledges.push(
    ...SHELF.boards.map((y) => ({ y, x0: -0.42, x1: 0.42, z: SHELF.depth * (1 - CAT_WALK / 2) })),
    { y: SHELF.top, x0: -0.45, x1: 0.45, z: (SHELF.topDepth + POTS[0].z + POTS[0].r) / 2 },
    { y: SILL.y, x0: SILL.x0 + 0.05, x1: SILL.x1 - 0.05, z: 0.07 },
    { y: ALLEY.y, x0: -0.9, x1: -0.1, z: (WALL_BACK + ALLEY.wall) / 2 },   // the alley ground, beside the boxes
    ...BOXES.map((b) => ({ y: b.y1, x0: b.x0 + 0.06, x1: b.x1 - 0.06, z: (b.z0 + b.z1) / 2 })),
    ...PIPE.runs.map((r) => ({ y: r.y + PIPE.r, x0: Math.max(-1.5, r.x0), x1: Math.min(2.6, r.x1 - 0.1), z: PIPE.z + 0.012, pipe: true })),
    ...WINDOWS.runs.map(([a, b]) => ({ y: WINDOWS.y0, x0: a, x1: b, z: (WINDOWS.sill + WINDOWS.frame) / 2 })),
    { y: ROOF.y, x0: -1.5, x1: 3, z: (ROOF.front + CRATES[0].z1) / 2 });
  // Where a crow can land: the roof in front of the crates, the crate and rock tops, and the tree's branches.
  level.perches.push(
    { y: ROOF.y, x0: -1.0, x1: 2.4, z: (ROOF.front + CRATES[0].z1) / 2 },
    ...[...CRATES, ...ROCKS].map((c) => ({ y: c.y1, x0: c.x0 + 0.1, x1: c.x1 - 0.1, z: c.z1 - STEP / 2 })),
    ...BRANCHES.map(([y, side, len]) => {                             // (on the thick part, near the trunk, so it's in view)
      const p = branchLine(y, side, len).at(0.5);
      return { y: p.y + p.r * 0.9 + OUT_DY, x0: p.x - 0.08, x1: p.x + 0.08, z: p.z + OUT_DZ };
    }));

  // ==========================================================================
  // Pictures painted in code (no image files): wood, bricks, plaster, bark...
  // ==========================================================================
  function canvasTexture(w, h, paint, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    paint(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    return t;
  }
  // Stains and puddles on the alley's ground, in the same places every time it's painted (so the colour picture
  // and the "where it's wet" picture line up). Uses its own random numbers, so the rest of the level is unchanged.
  function alleyPuddles(g, stain, puddle) {
    let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.filter = "blur(6px)"; g.fillStyle = stain;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(rnd() * 256, rnd() * 128, 18 + rnd() * 30, 8 + rnd() * 14, rnd() * 3, 0, Math.PI * 2); g.fill(); }
    g.filter = "blur(1.5px)"; g.fillStyle = puddle;
    for (let i = 0; i < 3; i++) {
      const x = 30 + rnd() * 196, y = 30 + rnd() * 68;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 8, 7 + rnd() * 8, 4 + rnd() * 4, 0, 0, Math.PI * 2); g.fill(); }
    }
    g.filter = "none";
  }
  // The sky behind everything, top to bottom: blue overhead to a pale warm horizon by day, turning toward
  // GOLD_SKY as golden hour comes (gold 0 to 1).
  const DAY_SKY = ["#6fa8dc", "#bcd9ee", "#f3e6cf"];
  function paintSky(g, w, h, gold) {
    const gr = g.createLinearGradient(0, 0, 0, h), c = new THREE.Color(), d = new THREE.Color();
    [0, 0.55, 1].forEach((at, i) => gr.addColorStop(at, "#" + c.set(DAY_SKY[i]).lerp(d.set(GOLD_SKY[i]), gold).getHexString()));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  function speckle(g, w, h, n, colours, size) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colours[Math.floor(rand() * colours.length)];
      g.globalAlpha = 0.15 + rand() * 0.25;
      g.fillRect(rand() * w, rand() * h, size * (0.5 + rand()), size * (0.5 + rand()));
    }
    g.globalAlpha = 1;
  }
  const TEX = {
    plaster: () => canvasTexture(256, 256, (g, w, h) => { g.fillStyle = "#efe2c8"; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = "rgba(200,170,120,0.18)"; g.fillRect(x, 0, 14, h); }   // soft wallpaper stripes
      speckle(g, w, h, 900, ["#d9c7a6", "#fff6e2"], 3); }, [10, 4]),
    wood: () => canvasTexture(256, 64, (g, w, h) => { g.fillStyle = "#9a6538"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { g.strokeStyle = rand() < 0.5 ? "rgba(70,38,16,0.35)" : "rgba(190,130,80,0.3)"; g.lineWidth = 1 + rand() * 2;
        const y = rand() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 10, w * 0.6, y + (rand() - 0.5) * 10, w, y + (rand() - 0.5) * 6); g.stroke(); } }, [2, 1]),
    floor: () => canvasTexture(256, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = ["#a8723f", "#9c6837", "#b07b47"][i % 3]; g.fillRect(i * 32, 0, 32, h);
      g.fillStyle = "rgba(60,30,10,0.5)"; g.fillRect(i * 32, 0, 2, h); g.fillRect(i * 32, (i * 97) % h, 32, 2); }
      speckle(g, w, h, 500, ["#7a4a22", "#c99060"], 3); }, [8, 4]),
    brick: () => canvasTexture(512, 512, (g, w, h) => { g.fillStyle = "#d8cfc4"; g.fillRect(0, 0, w, h);
      const bw = 64, bh = 26;
      for (let r = 0; r < h / bh; r++) for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + (r % 2) * bw / 2, y = r * bh;
        const tone = 130 + rand() * 50;
        g.fillStyle = "rgb(" + Math.round(tone + 40) + "," + Math.round(tone * 0.48) + "," + Math.round(tone * 0.36) + ")";
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
      speckle(g, w, h, 1500, ["#5e2a1c", "#e3a07e", "#3a3a3a"], 4); }, [10, 5]),
    cardboard: () => canvasTexture(128, 128, (g, w, h) => { g.fillStyle = "#c79a5e"; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 300, ["#a77a40", "#ddb57e"], 3); g.fillStyle = "rgba(230,220,190,0.75)"; g.fillRect(w * 0.42, 0, w * 0.16, h); }),
    crate: () => canvasTexture(128, 128, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = ["#b88a55", "#a87a48", "#c4945d", "#ad7f4c"][i]; g.fillRect(0, i * 32, w, 32);
      g.fillStyle = "rgba(60,35,15,0.6)"; g.fillRect(0, i * 32, w, 3); }
      g.fillStyle = "#8a5e33"; g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
      speckle(g, w, h, 200, ["#6e4a26"], 2); }),
    bark: () => canvasTexture(256, 512, (g, w, h) => { g.fillStyle = "#6b4a32"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const x = rand() * w; g.strokeStyle = rand() < 0.6 ? "rgba(35,22,12,0.55)" : "rgba(150,115,85,0.35)"; g.lineWidth = 2 + rand() * 6;
        g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 32) g.lineTo(x + (rand() - 0.5) * 14, y); g.stroke(); } }, [3, 3]),
    rock: () => canvasTexture(256, 256, (g, w, h) => { g.fillStyle = "#8d8780"; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1800, ["#6f6962", "#aaa49b", "#5d6b52", "#c0b8ab"], 6); }, [2, 2]),
    gravel: () => canvasTexture(128, 128, (g, w, h) => { g.fillStyle = "#c8b9a0"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = ["#8a7a66", "#e8dcc6", "#a39077", "#6e8a9a"][i % 4];
        g.beginPath(); g.arc(rand() * w, rand() * h, 2 + rand() * 4, 0, Math.PI * 2); g.fill(); } }, [3, 1]),
    sky: () => canvasTexture(16, 256, (g, w, h) => paintSky(g, w, h, 0)),
    sunGlow: () => canvasTexture(128, 128, (g, w, h) => {              // the setting sun: a bright disc in a soft glow
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,250,235,1)"); gr.addColorStop(0.11, "rgba(255,240,200,1)"); gr.addColorStop(0.14, "rgba(255,200,130,0.55)");
      gr.addColorStop(0.4, "rgba(255,170,100,0.18)"); gr.addColorStop(1, "rgba(255,150,90,0)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
    alley: () => canvasTexture(256, 256, (g, w, h) => {                 // the view out of the open window
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#9cc7e8"); gr.addColorStop(1, "#e9dcc4");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#a35a43"; g.fillRect(0, h * 0.25, w * 0.55, h); g.fillStyle = "#8c4c3a"; g.fillRect(w * 0.62, h * 0.4, w, h);
      g.fillStyle = "rgba(40,30,30,0.5)"; for (let y = h * 0.32; y < h; y += 34) for (let x = 14; x < w * 0.5; x += 44) g.fillRect(x, y, 18, 22);
      g.strokeStyle = "#333"; g.lineWidth = 3; for (let y = h * 0.45; y < h; y += 40) { g.beginPath(); g.moveTo(w * 0.62, y); g.lineTo(w, y); g.stroke(); } }),
    skyline: () => canvasTexture(1024, 256, (g, w, h) => {              // distant hills and town, behind the roof
      g.fillStyle = "#9fb7a4"; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.35 + Math.sin(x * 0.006) * 40 + Math.sin(x * 0.019) * 14); g.lineTo(w, h); g.fill();
      g.fillStyle = "#b8b3ad";
      for (let x = 0; x < w; x += 30 + rand() * 40) { const bh = 30 + rand() * 90; g.fillRect(x, h - bh, 20 + rand() * 30, bh); }
    }),
    // The room's sunbeam as it falls on things: a window of six panes with soft-edged bars, the rest dark,
    // and the faint shadows of leaves from a plant outside it in one corner.
    sunbeam: () => canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
      g.filter = "blur(5px)";
      g.fillStyle = "#fff"; g.fillRect(40, 52, 176, 152);
      g.fillStyle = "#000"; g.fillRect(122, 52, 12, 152); g.fillRect(40, 99, 176, 9); g.fillRect(40, 148, 176, 9);
      g.filter = "blur(9px)"; g.fillStyle = "rgba(0,0,0,0.55)";
      for (const [x, y, r] of [[60, 70, 16], [84, 62, 12], [70, 92, 13], [48, 110, 10], [96, 84, 9]]) { g.beginPath(); g.ellipse(x, y, r * 1.4, r * 0.8, 0.6, 0, Math.PI * 2); g.fill(); }
    }),
    // The alley's evening sun as it falls on the brick wall: bright above, and below, the shadow of the room's
    // building behind the camera: its roofline, gently sloping, with a step and a thin aerial.
    alleySun: () => canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      g.filter = "blur(2px)"; g.fillStyle = "#000";
      g.beginPath(); g.moveTo(-10, 136); g.lineTo(150, 130); g.lineTo(150, 122); g.lineTo(266, 118);
      g.lineTo(266, 266); g.lineTo(-10, 266); g.fill();
      g.fillRect(70, 100, 2, 36); g.fillRect(62, 108, 18, 2);           // the aerial
    }),
    // The alley's ground: grey concrete with stains and puddles (alleyWet: where it's wet, which shines).
    alleyGround: () => canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = "#8f8b85"; g.fillRect(0, 0, w, h);
      alleyPuddles(g, "rgba(60,58,56,0.3)", "rgba(88,94,104,0.45)");
    }, [10, 1]),
    alleyWet: () => {
      const t = canvasTexture(256, 128, (g, w, h) => {
        g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, w, h);                // (light = rough and dull, dark = smooth and shiny)
        alleyPuddles(g, "#c4c4c4", "#787878");
      }, [10, 1]);
      t.colorSpace = THREE.NoColorSpace;                                // (amounts, not colours)
      return t;
    },
    dust: () => canvasTexture(32, 32, (g, w, h) => {                   // one soft speck of dust
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
    painting: () => canvasTexture(128, 96, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#f2c48a"); gr.addColorStop(1, "#7fb0c9");
      g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#4f6b5c"; g.beginPath(); g.moveTo(0, h); g.lineTo(30, 40); g.lineTo(60, 70); g.lineTo(90, 30); g.lineTo(w, 60); g.lineTo(w, h); g.fill();
      g.fillStyle = "#fff4d6"; g.beginPath(); g.arc(96, 22, 9, 0, Math.PI * 2); g.fill(); })
  };

  // ==========================================================================
  // Building the climb
  // ==========================================================================
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  }
  // Runs build() and labels what it added to parent with the name of that part of the climb ("shelf", "tree"...),
  // so tools/Game-Lab.html can show each part on its own. Anything already labelled keeps its label.
  function tagged(parent, part, build) {
    const before = new Set(parent.children), result = build();
    for (const o of parent.children) if (!before.has(o) && !o.userData.part) o.userData.part = part;
    return result;
  }
  // A box given by its corners (x0..x1, y0..y1, z0..z1).
  const boxAt = (x0, x1, y0, y1, z0, z1, mat, parent) => box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent);
  function plane(w, h, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); parent.add(m); return m;
  }
  const std = (p) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, p));
  // A lumpy ball (rocks, leafy clumps): every corner pushed in or out by an amount that depends
  // only on where it is, so corners shared by neighbouring faces move together and no cracks open.
  function lumpy(radius, amount, seed, squash = 1) {
    const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 12.99 + y * 78.23 + z * 37.72 + seed) * 43758.55, k = radius * (1 - amount / 2 + amount * (n - Math.floor(n)));
      p.setXYZ(i, x * k, y * k * squash, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // The room: back wall (with the open window), floor, a picture, and the bookshelf.
  function buildRoom(g, M) {
    const W0 = -7, W1 = 8, WIN = level.WIN;
    const wall = (x0, x1, y0, y1) => { const m = plane(x1 - x0, y1 - y0, M.plaster, (x0 + x1) / 2, (y0 + y1) / 2, 0, g);
      m.material = M.plaster; return m; };
    const H = 4.6;                                                                     // (high enough to fill the view from inside)
    wall(W0, WIN.x0, 0, H); wall(WIN.x1, W1, 0, H); wall(WIN.x0, WIN.x1, 0, WIN.y0); wall(WIN.x0, WIN.x1, WIN.y1, H);
    const floor = plane(W1 - W0, 4, M.floor, (W0 + W1) / 2, 0, 2, g); floor.rotation.x = -Math.PI / 2;
    boxAt(W0, W1, 0, 0.09, 0, 0.02, M.paint, g);                                  // skirting board
    // A framed picture on the wall, for a homely touch.
    boxAt(-1.75, -1.05, 1.15, 1.7, 0, 0.03, M.darkWood, g);
    plane(0.62, 0.47, M.painting, -1.4, 1.425, 0.032, g);
    // The open window: frame, sill (running out through the wall to the alley), raised sash, and the
    // sides of the opening through the wall's thickness. The alley itself is outside (buildOutside).
    const back = level.WALL_BACK;
    boxAt(WIN.x0 - 0.05, WIN.x0, WIN.y0, WIN.y1 + 0.02, -0.08, 0.04, M.paint, g);
    boxAt(WIN.x1, WIN.x1 + 0.05, WIN.y0, WIN.y1 + 0.02, -0.08, 0.04, M.paint, g);
    boxAt(WIN.x0 - 0.05, WIN.x1 + 0.05, WIN.y1, WIN.y1 + 0.07, -0.08, 0.05, M.paint, g);
    boxAt(WIN.x0 - 0.1, WIN.x1 + 0.1, WIN.y0 - 0.04, WIN.y0, back, 0.13, M.paint, g);   // the sill
    const sash = new THREE.Group(); g.add(sash);                                         // pushed up: two panes overlap at the top
    boxAt(WIN.x0, WIN.x1, WIN.y1 - 0.34, WIN.y1 - 0.31, -0.04, 0.0, M.paint, sash);
    boxAt(WIN.x0, WIN.x1, WIN.y1 - 0.03, WIN.y1, -0.04, 0.0, M.paint, sash);
    boxAt((WIN.x0 + WIN.x1) / 2 - 0.015, (WIN.x0 + WIN.x1) / 2 + 0.015, WIN.y1 - 0.34, WIN.y1, -0.04, 0.0, M.paint, sash);
    plane(WIN.x1 - WIN.x0, 0.31, M.glass, (WIN.x0 + WIN.x1) / 2, WIN.y1 - 0.17, -0.02, g);
    for (const [x0, x1] of [[WIN.x0, WIN.x0 + 0.001], [WIN.x1 - 0.001, WIN.x1]]) boxAt(x0, x1, WIN.y0, WIN.y1, back, 0, M.plasterSide, g);
    boxAt(WIN.x0, WIN.x1, WIN.y1 - 0.001, WIN.y1, back, 0, M.plasterSide, g);
  }

  function buildShelf(g, M) {
    const X0 = -0.55, X1 = 0.55, D = 0.3, T = 0.03;
    boxAt(X0, X0 + T, 0, 2.0, 0, D, M.wood, g); boxAt(X1 - T, X1, 0, 2.0, 0, D, M.wood, g);
    boxAt(X0, X1, 0, 0.1, 0.01, D, M.wood, g);                                         // plinth
    for (const y of [0.55, 1.0, 1.45]) boxAt(X0 + T, X1 - T, y - 0.025, y, 0, D, M.wood, g);
    boxAt(X0 - 0.02, X1 + 0.02, 1.97, 2.0, 0, D + 0.02, M.wood, g);                      // top
    boxAt(X0, X1, 0.1, 1.97, 0, 0.008, M.darkWood, g);                                  // back panel
    // Books: from the climbing map (level.BOOKS), pushed back so the front third of each shelf is
    // clear for the cat. One shape drawn many times, each with its own colour.
    const spots = [];
    level.BOOKS.forEach((row, i) => {
      const bay = level.BAYS[i];
      for (const b of row) spots.push({ x: (b.x0 + b.x1) / 2, y: bay.floor, w: b.x1 - b.x0, h: b.h, d: bay.front - 0.012, colour: b.colour });
    });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const books = new THREE.InstancedMesh(geo, M.book, spots.length);
    const palette = ["#7a2e2e", "#2e4a7a", "#3d6b45", "#c49a3a", "#5b3a6e", "#a8552d", "#2f6f73", "#d8cdb4", "#8c2f4f", "#3a3a48"];
    const m = new THREE.Matrix4();
    spots.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, 0.012 + b.d / 2);
      books.setMatrixAt(i, m); books.setColorAt(i, C(palette[b.colour]));
    });
    g.add(books);
    return books;
  }

  // The chameleons' tank on the bottom shelf. It rocks while they climb on the spot; at the escape its front
  // pops off and falls to the floor (the tank stays, open at the front, and the front lies where it fell).
  function buildTank(M) {
    const T = level.TANK, cx = (T.x0 + T.x1) / 2, w = T.x1 - T.x0, h = T.y1 - T.y0, d = T.z1 - T.z0;
    const root = new THREE.Group(); root.position.set(cx, T.y0, (T.z0 + T.z1) / 2);
    const rocker = new THREE.Group(); root.add(rocker);
    const body = new THREE.Group(); rocker.add(body);
    const glass = M.tankGlass.clone(); glass.side = THREE.DoubleSide;
    const pane = (pw, x, z, turn, parent) => { const m = plane(pw, h, glass, x, h / 2, z, parent); m.rotation.y = turn; return m; };
    pane(w, 0, -d / 2, 0, body); pane(d, -w / 2, 0, Math.PI / 2, body); pane(d, w / 2, 0, Math.PI / 2, body);
    for (const x of [-1, 1]) box(0.012, h, 0.012, M.dark, x * w / 2, h / 2, -d / 2, body);           // the frame: back posts...
    for (const y of [0, h]) {
      box(w, 0.012, 0.012, M.dark, 0, y, -d / 2, body);                                             // ...back rails...
      for (const x of [-1, 1]) box(0.012, 0.012, d, M.dark, x * w / 2, y, 0, body);                  // ...and side rails
    }
    // The front: its own piece, turning about its bottom edge (so it can tip forward and fall).
    const front = new THREE.Group(); front.position.set(0, 0, d / 2); rocker.add(front);
    pane(w, 0, 0, 0, front);
    for (const x of [-1, 1]) box(0.012, h, 0.012, M.dark, x * w / 2, h / 2, 0, front);
    for (const y of [0, h]) box(w, 0.012, 0.012, M.dark, 0, y, 0, front);
    box(w - 0.01, 0.04, d - 0.01, M.gravel, 0, 0.02, 0, body);
    // A little plant inside.
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(M.leafGeo, M.tankLeaf); leaf.scale.setScalar(0.07);
      leaf.position.set(-0.22 + rand() * 0.06, 0.06 + i * 0.03, (rand() - 0.5) * 0.05); leaf.rotation.set(0, rand() * 3, (rand() - 0.5) * 1.2); body.add(leaf);
    }
    return { root, rocker, front, h, d };
  }

  // Potted plants on top of the shelf (from the climbing map, level.POTS): terracotta pots set back
  // from the front edge, each with a bunch of thick stems up the middle (that the chameleons climb)
  // and leaves on arching stems, mostly to the sides and back so the climbers stay in view.
  function buildPlants(g, M) {
    const y0 = level.SHELF.top;
    const profile = (r, h) => [new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.72, 0), new THREE.Vector2(r * 0.9, h * 0.85), new THREE.Vector2(r, h * 0.86), new THREE.Vector2(r, h), new THREE.Vector2(r * 0.88, h), new THREE.Vector2(r * 0.86, h * 0.9)];
    const leaves = [];
    const stems = new THREE.Group(); g.add(stems);
    for (const p of level.POTS) {
      const pot = new THREE.Mesh(new THREE.LatheGeometry(profile(p.r, p.h), 16), M.pot);
      pot.position.set(p.x, y0, p.z); g.add(pot);
      const soil = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.86, 14), M.soil); soil.rotation.x = -Math.PI / 2; soil.position.set(p.x, y0 + p.h * 0.9, p.z); g.add(soil);
      // The thick middle stems, from the soil up to `stem`, leaning a little each way.
      for (const lean of [-0.03, 0, 0.03]) {
        const stalk = new THREE.Mesh(M.stemGeo, M.stem);
        HG.kit.limb(stalk, new THREE.Vector3(p.x + lean * 0.3, y0 + p.h * 0.9, p.z + 0.02), new THREE.Vector3(p.x + lean, p.stem, p.z + 0.01), 0.011);
        stems.add(stalk);
      }
      // Leaves on arching stems: up and out to the sides and back, some spilling down over the pot's sides.
      for (let k = 0; k < 24; k++) {
        const a = Math.PI * (0.05 + 0.9 * rand()) * (rand() < 0.5 ? 1 : -1);   // round the sides and back (the front, +z, kept clearer)
        const up = 0.08 + rand() * 0.4, out = 0.06 + rand() * 0.16;
        const side = Math.cos(a), back = Math.sin(a) < 0 ? Math.sin(a) : Math.sin(a) * 0.3;
        leaves.push({ x: p.x + side * out, y: y0 + p.h + up - (rand() < 0.2 ? 0.2 : 0), z: p.z + back * out * 0.6, s: 0.07 + rand() * 0.06, a, pot: p });
      }
    }
    for (const l of leaves) {
      if (rand() < 0.5) continue;
      const from = new THREE.Vector3(l.pot.x, y0 + l.pot.h * 0.9, l.pot.z), to = new THREE.Vector3(l.x, l.y, l.z);
      const stem = new THREE.Mesh(M.stemGeo, M.stem); HG.kit.limb(stem, from, to, 0.005); stems.add(stem);
    }
    const inst = new THREE.InstancedMesh(M.leafGeo, M.leaf, leaves.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    leaves.forEach((l, i) => {
      q.setFromEuler(e.set(-0.6 + rand() * 0.8, l.a, (rand() - 0.5) * 1.5));
      m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(l.s, l.s, l.s));
      inst.setMatrixAt(i, m); inst.setColorAt(i, C("#3f7d3a").lerp(C("#86b55a"), rand()));
    });
    g.add(inst);
  }

  // Outside, in the alley behind the room (built in the outdoor scenery's own layout, ground at 3.46 against
  // z = 0; the group it's in moves it back and down into place): the alley ground, the brick wall, boxes,
  // pipes, broken windows, and the parapet.
  function buildOutside(g, M) {
    const W0 = -7, W1 = 8, as = (part) => (build) => tagged(g, part, build);   // (each bit labelled for tools/Game-Lab.html)
    as("alley")(() => {
    // The brick wall, with holes for the broken windows (so you see into them, and the chameleons can climb in).
    const B0 = 3.42, B1 = 6.95, WA = level.WINDOWS_AT;
    const wall = new THREE.Shape([[W0, B0], [W1, B0], [W1, B1], [W0, B1]].map(([x, y]) => new THREE.Vector2(x, y)));
    for (const [a, b] of WA.runs) wall.holes.push(new THREE.Path([[a, WA.y0], [a, WA.y1], [b, WA.y1], [b, WA.y0]].map(([x, y]) => new THREE.Vector2(x, y))));
    const wallGeo = new THREE.ShapeGeometry(wall), pos = wallGeo.attributes.position, uv = wallGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - W0) / (W1 - W0), (pos.getY(i) - B0) / (B1 - B0));   // (the picture spread as on a plain wall)
    g.add(new THREE.Mesh(wallGeo, M.brick));
    boxAt(W0, W1, 3.3, 3.46, -0.05, level.WALL_BACK - level.OUT_DZ, M.alleyGround, g);   // the alley ground, up to the room's wall
    });
    const R = level.ROOF_AT;
    as("roof")(() => {
    boxAt(W0, W1, R.cap, R.y, -0.25, R.front, M.concrete, g);                         // parapet cap
    boxAt(W0, W1, R.cap - 0.02, R.y, -8, -0.25, M.roof, g);                           // the flat roof behind it
    });
    // Cardboard boxes in the alley, against the brick wall.
    as("boxes")(() => { for (const k of level.BOXES_AT) { const b = boxAt(k.x0, k.x1, k.y0, k.y1, k.z0, k.z1, M.cardboard, g); b.rotation.y = k.turn; } });
    // Pipes: two across, one down, with elbows and brackets.
    as("pipes")(() => {
    const P = level.PIPE_AT;
    const pipe = (from, to) => { const m = new THREE.Mesh(M.pipeGeo, M.pipe); HG.kit.limb(m, from, to, P.r); g.add(m); };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const run of P.runs) pipe(V(Math.max(W0, run.x0), run.y, P.z), V(Math.min(W1, run.x1), run.y, P.z));
    pipe(V(1.75, 5.4, 0.06), V(1.75, 6.88, 0.06));
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.045, 8, 10, Math.PI / 2), M.pipe); elbow.position.set(1.7, 5.4, 0.06); elbow.rotation.z = 0; g.add(elbow);
    for (let x = -3; x < 5; x += 0.9) for (const y of [4.75, 5.45]) if (y < 5 || x < 1.6) boxAt(x, x + 0.03, y - 0.06, y + 0.06, 0, 0.11, M.dark, g);
    });
    // Two broken windows: dark inside, cracked and missing panes.
    as("windows")(() => {
    for (const [x0, x1] of level.WINDOWS_AT.runs) {
      const y0 = level.WINDOWS_AT.y0, y1 = level.WINDOWS_AT.y1;
      plane(x1 - x0, y1 - y0, M.dark, (x0 + x1) / 2, (y0 + y1) / 2, -0.08, g);
      for (const [a, b] of [[x0 - 0.04, x0], [x1, x1 + 0.04]]) boxAt(a, b, y0 - 0.03, y1 + 0.03, -0.08, 0.04, M.darkWood, g);
      boxAt(x0 - 0.04, x1 + 0.04, y1, y1 + 0.04, -0.08, 0.04, M.darkWood, g);
      boxAt(x0 - 0.06, x1 + 0.06, y0 - 0.05, y0, -0.08, 0.1, M.concrete, g);           // sill
      boxAt((x0 + x1) / 2 - 0.012, (x0 + x1) / 2 + 0.012, y0, y1, -0.07, 0.02, M.darkWood, g);
      boxAt(x0, x1, (y0 + y1) / 2 - 0.012, (y0 + y1) / 2 + 0.012, -0.07, 0.02, M.darkWood, g);
      // Jagged shards of glass left in the frames.
      const shards = new THREE.BufferGeometry(), pts = [];
      for (let k = 0; k < 7; k++) {
        const cx = x0 + rand() * (x1 - x0), cy = y0 + rand() * (y1 - y0), s = 0.05 + rand() * 0.1;
        const edgeX = cx < (x0 + x1) / 2 ? x0 : x1;
        pts.push(edgeX, cy, -0.03, edgeX, cy + s, -0.03, cx, cy + s * (rand() - 0.2), -0.03);
      }
      shards.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); shards.computeVertexNormals();
      g.add(new THREE.Mesh(shards, M.glass));
    }
    });
    // A chimney and a vent on the roof behind the parapet, against the sky.
    as("roof")(() => { boxAt(-1.6, -1.1, 6.98, 7.9, -1.2, -0.7, M.brick2, g); boxAt(2.4, 2.75, 6.98, 7.25, -0.8, -0.45, M.pipe, g); });
    // Wooden crates on the roof: low ones in front, tall ones (two stacked) behind.
    as("crates")(() => {
    for (const c of level.CRATES_AT) {
      if (c.row === 0) boxAt(c.x0, c.x1, c.y0, c.y1, c.z0, c.z1, M.crate, g);
      else { const mid = (c.y0 + c.y1) / 2; boxAt(c.x0, c.x1, c.y0, mid, c.z0, c.z1, M.crate, g); boxAt(c.x0 + 0.01, c.x1 - 0.01, mid, c.y1, c.z0, c.z1, M.crate, g); }
    }
    });
  }

  // A big rock: a lumpy block with rounded edges filling r.x0..x1, y0..y1, z0..z1. Its front and top stay
  // nearly flat (the chameleons climb up the front and walk across the top); the lumps grow at the sides and back.
  function rockBlock(r, seed, mat) {
    const w = r.x1 - r.x0, h = r.y1 - r.y0, d = r.z1 - r.z0, round = 0.07;
    const geo = new THREE.BoxGeometry(w, h, d, Math.ceil(w * 14), Math.ceil(h * 12), Math.ceil(d * 12));
    const p = geo.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      inner.set(clamp(v.x, -w / 2 + round, w / 2 - round), clamp(v.y, -h / 2 + round, h / 2 - round), clamp(v.z, -d / 2 + round, d / 2 - round));
      dir.subVectors(v, inner);
      if (dir.lengthSq() < 1e-12) continue;
      dir.normalize(); v.copy(inner).addScaledVector(dir, round);
      const n = Math.sin(v.x * 9 + seed) * Math.sin(v.y * 7 + seed * 2) * Math.sin(v.z * 8 + seed * 3) + 0.4 * Math.sin(v.x * 23 + v.y * 19 + seed) * Math.sin(v.z * 21 + seed);
      const climbed = Math.max(0, dir.z, dir.y);                       // facing the camera or up: where they climb
      v.addScaledVector(dir, n * (0.045 - 0.035 * climbed));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, (r.z0 + r.z1) / 2);
    return mesh;
  }

  // Big rocks with grass and small plants, rising toward the giant tree, with a grassy hillside behind.
  function buildRocks(g, M) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.grass);
    hill.scale.set(6, 2.6, 4); hill.position.set(1.3, 7.0, -7.6); g.add(hill);
    // The rows of big rocks the chameleons climb (level.ROCKS_AT), and a few more at the sides.
    const grass = [], flowers = [];
    const sides = [{ x0: -0.5, x1: 0.32, y1: 8.05, row: 0 }, { x0: 1.88, x1: 2.6, y1: 8.15, row: 0 }, { x0: -0.3, x1: 0.32, y1: 8.6, row: 1 }, { x0: 1.88, x1: 2.4, y1: 8.7, row: 1 }]
      .map((s) => ({ ...s, y0: level.ROOF_AT.y, z1: level.ROCKS_AT[s.row * 2].z1 - 0.05, z0: level.ROCKS_AT[s.row * 2].z0 }));
    [...level.ROCKS_AT, ...sides].forEach((r, i) => {
      g.add(rockBlock(r, i * 1.7 + 0.4, M.rock));
      const back = Math.max(r.z0, r.z1 - level.STEP);
      for (let k = 0; k < 26; k++) {                                   // grass on top: along the back and at the ends
        const atEnd = k % 3 === 0, x = atEnd ? (rand() < 0.5 ? r.x0 + rand() * 0.12 : r.x1 - rand() * 0.12) : r.x0 + rand() * (r.x1 - r.x0);
        grass.push([x, r.y1 - 0.01, atEnd ? back + rand() * (r.z1 - back) : back + rand() * 0.1]);
      }
      if (i % 2 === 0) flowers.push([r.x0 + 0.08 + rand() * 0.1, r.y1, back + 0.06], [r.x1 - 0.1, r.y1, r.z1 - 0.08]);
    });
    const inst = new THREE.InstancedMesh(M.grassGeo, M.grassBlade, grass.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    grass.forEach(([x, y, z], i) => {
      q.setFromEuler(e.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4)); const s = 0.04 + rand() * 0.05;
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 1.6, s)); inst.setMatrixAt(i, m);
      inst.setColorAt(i, C("#5f8f3a").lerp(C("#a9c45c"), rand()));
    });
    g.add(inst);
    // Small flowering plants on the rock tops.
    flowers.forEach(([x, y, z], k) => {
      const flower = new THREE.Mesh(M.flowerGeo, k % 2 ? M.flowerA : M.flowerB); flower.position.set(x, y, z); flower.scale.setScalar(0.025 + rand() * 0.02); g.add(flower);
    });
  }

  // The giant tree: a wide trunk with roots over the rocks, three branches, and a leafy crown at the top,
  // with the trunk rising through it to a level bough across the very top (where the climb ends).
  function buildTree(g, M) {
    const X = TREE.x, R = TREE.r, Z = TREE.z;
    // (standing on the top rock: its roots flare out from ROOTS.top down to ROOTS.y; the climbing route follows
    // them and the trunk, whose radius matches trunkR: narrowing a little to CROWN.from, then more up to the bough)
    const piece = (r0, r1, y0, y1) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 32, 2), M.bark); m.position.set(X, (y0 + y1) / 2, Z); g.add(m);
    };
    const tip = CROWN.y - TIP;                                        // (where the last bit tapers into the bough)
    piece(ROOTS.r, R, ROOTS.y, ROOTS.top); piece(R, R * 0.85, ROOTS.top, CROWN.from); piece(R * 0.85, CROWN.topR, CROWN.from, tip);
    piece(CROWN.topR, CROWN.r * 0.9, tip, CROWN.y);
    // The bough: thickest in the middle, where it sits on the trunk, thinning to each end.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(CROWN.r * 0.55, CROWN.r, CROWN.half, 12), M.bark);
      arm.rotation.z = -side * Math.PI / 2; arm.position.set(X + side * CROWN.half / 2, CROWN.y, Z); g.add(arm);
    }
    const branch = (y, side, len) => {                                // from its root inside the trunk out to its tip
      const { from, to } = branchLine(y, side, len);
      const a = new THREE.Vector3(from.x, from.y, from.z), b = new THREE.Vector3(to.x, to.y, to.z), d = b.clone().sub(a);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(BRANCH_RADIUS[1], BRANCH_RADIUS[0], d.length(), 10), M.bark);
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(mesh);
      return [to.x, to.y, to.z];
    };
    const ends = BRANCHES.map(([y, side, len]) => branch(y, side, len));
    // The crown sits above the finish, so the chameleons are still in view when they reach it; then the game
    // carries them up through it (the clumps in front hide them for a moment). Three rings of leafy clumps, all
    // below the bough, so the view out from the top is clear; and a tuft at each end of the bough.
    const rings = [{ y: 12.75, out: 1.0, n: 7, r: 0.55 }, { y: 13.35, out: 1.1, n: 8, r: 0.55 }, { y: 13.9, out: 0.85, n: 7, r: 0.42 }];
    const clumps = [...ends.map(([x, y, z]) => [x, y + 0.1, z, 0.35]),
      ...rings.flatMap((ring, j) => Array.from({ length: ring.n }, (_, k) => {
        const a = (k + j * 0.5) / ring.n * Math.PI * 2, out = ring.out * (0.85 + rand() * 0.3);
        return [X + Math.cos(a) * out * 1.3, ring.y + (rand() - 0.5) * 0.2, Z + Math.sin(a) * out * 0.8, ring.r * (0.85 + rand() * 0.3)];
      })),
      [X - CROWN.half - 0.05, CROWN.y + 0.02, Z, 0.2], [X + CROWN.half + 0.05, CROWN.y + 0.02, Z, 0.2]];
    for (const [x, y, z, r] of clumps) {
      const clump = new THREE.Mesh(lumpy(1, 0.25, x * 3 + y * 5), rand() < 0.5 ? M.canopyA : M.canopyB);
      clump.scale.set(r, r * 0.8, r); clump.position.set(x, y, z); g.add(clump);
    }
  }

  // The sky behind everything, and far-off hills and town behind the roof.
  // (It rises with the camera, so the hills always sit just below the horizon.)
  function buildSky(g, M) {
    const far = plane(90, 22, M.skyline, 1, 10.2, -30, g); far.renderOrder = -1;
    return far;
  }

  // The peaceful valley seen from the top of the tree at the end (since 2.18.0): meadows sloping down from
  // behind the tree to a winding river, wooded hills on both sides, and snowy mountains far off. Only shown
  // (fading in, as the town skyline fades out) when the camera looks out from the top.
  // (World heights and depths; d = distance back from the room's wall.)
  const riverX = (d) => 1.4 + 4 * Math.sin(d * 0.05) + 2 * Math.sin(d * 0.13 + 1);
  function valleyHeight(x, d, carve = true) {
    const side = Math.abs(x - riverX(d));
    const floor = 2 + 3.6 * (1 - smooth((d - 8) / 30));                // from just below the roof down to the valley floor
    const hills = 9 * (1 - Math.exp(-side / 22)) * (0.35 + 0.65 * smooth((d - 10) / 25));
    const bumps = 1.2 * Math.sin(x * 0.21 + d * 0.13) * Math.sin(d * 0.09 - x * 0.17);
    const peaks = smooth((d - 95) / 45) * (14 + 8 * Math.sin(x * 0.07 + 1.3) + 4 * Math.sin(x * 0.19));
    return floor + hills + bumps + peaks - (carve ? 0.7 * Math.exp(-Math.pow(side / 1.3, 2)) : 0);
  }
  function buildValley(scene, M) {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const D0 = 6, D1 = 180, W = 170;
    const geo = new THREE.PlaneGeometry(W, D1 - D0, 136, 140); geo.rotateX(-Math.PI / 2);
    geo.translate(1.4, 0, -(D0 + D1) / 2);
    const p = geo.attributes.position, colours = new Float32Array(p.count * 3), c = new THREE.Color();
    const meadow = C("#93bf5c"), deep = C("#6c9c45"), wood = C("#4f7c38"), rock = C("#8f8a80"), snow = C("#f6f6f2"), bank = C("#b9c97a");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), d = -p.getZ(i), h = valleyHeight(x, d);
      p.setY(i, h);
      const n = Math.sin(x * 0.3 + d * 0.11) * Math.sin(d * 0.23 - x * 0.07);
      c.copy(meadow).lerp(deep, 0.5 + 0.5 * n);
      if (n > 0.45 && h < 15 && Math.abs(x - riverX(d)) > 8) c.lerp(wood, 0.6);
      if (Math.abs(x - riverX(d)) < 2.2) c.lerp(bank, 0.5);
      if (h > 14) c.lerp(rock, smooth((h - 14) / 3));
      if (h > 20) c.lerp(snow, smooth((h - 20) / 2.5));
      colours.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colours, 3)); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M.valley));
    // The river: a ribbon down the middle of the valley, just below the banks.
    const pts = [], idx = [];
    for (let d = D0 + 2, k = 0; d < 100; d += 1.5, k++) {
      const x = riverX(d), y = valleyHeight(x, d, false) - 0.3, w = 1.1 + d * 0.006;
      pts.push(x - w, y, -d, x + w, y, -d);
      if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
    }
    const river = new THREE.BufferGeometry(); river.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); river.setIndex(idx); river.computeVertexNormals();
    g.add(new THREE.Mesh(river, M.water));
    // Woods: little pointed trees, in patches on the hillsides.
    const spots = [];
    for (let tries = 0; spots.length < 380 && tries < 8000; tries++) {
      const d = 24 + rand() * 100, x = riverX(d) + (rand() - 0.5) * 120, h = valleyHeight(x, d);
      const n = Math.sin(x * 0.3 + d * 0.11) * Math.sin(d * 0.23 - x * 0.07);
      if (Math.abs(x - riverX(d)) > 8 && h < 15 && n > 0.25 + rand() * 0.3) spots.push([x, h - 0.2, -d]);
    }
    const tree = new THREE.ConeGeometry(1, 2.8, 6); tree.translate(0, 1.4, 0);
    const woods = new THREE.InstancedMesh(tree, M.pine, spots.length), m = new THREE.Matrix4();
    spots.forEach(([x, y, z], i) => {
      const s = 0.5 + rand() * 0.5; m.makeScale(s, s * (0.9 + rand() * 0.5), s).setPosition(x, y, z); woods.setMatrixAt(i, m);
      woods.setColorAt(i, C("#2f5a2c").lerp(C("#4f7a3a"), rand()));
    });
    g.add(woods);
    // See-through from the start, so fading it in never has to rebuild its shaders (a stutter just as it appears).
    const materials = [M.valley, M.water, M.pine];
    for (const m of materials) m.transparent = true;
    return { group: g, materials };
  }

  // ==========================================================================
  // Light for the room and the alley
  // ==========================================================================
  // Soft light from all round: a simple box of a place (walls, floor, sky) with a few bright patches, blurred
  // into a picture of the light arriving from every direction. Every surface takes its colour from that, so a
  // warm floor or a bright window shows up softly on everything ("image-based lighting").
  // faces: [right, left, above, below, behind the camera, in front], each [colour, brightness];
  // patches: [width, height, colour, brightness, x, y, z, turn about x, turn about y] (no turns: facing the middle).
  function softLight(renderer, size, faces, patches) {
    const s = new THREE.Scene(), glow = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
    s.add(new THREE.Mesh(new THREE.BoxGeometry(...size), faces.map(([hex, k]) => new THREE.MeshBasicMaterial({ color: glow(hex, k), side: THREE.BackSide }))));
    for (const [w, h, hex, k, x, y, z, rx, ry] of patches) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: glow(hex, k) }));
      m.position.set(x, y, z);
      if (rx == null) m.lookAt(0, 0, 0); else m.rotation.set(rx, ry, 0);
      s.add(m);
    }
    const pm = new THREE.PMREMGenerator(renderer), env = pm.fromScene(s, 0.04).texture;
    pm.dispose();
    return env;
  }
  // The room: warm walls, a wooden floor, a bright sunny window on the left, the open window behind the bookshelf.
  const roomEnvironment = (renderer) => softLight(renderer, [10, 4, 8],
    [[0xd8c6a8, 0.5], [0xe6cfa8, 0.65], [0xf1e7d4, 0.55], [0x7d5634, 0.55], [0xc8b89c, 0.4], [0xdccbac, 0.6]],
    [[2.2, 1.8, 0xffd29a, 6, -4.95, 0.5, 1.6, 0, Math.PI / 2],         // the sunny window on the left
      [1.8, 1.4, 0xffc888, 1.6, -3.0, -1.99, 1.5, -Math.PI / 2, 0],     // its patch of sun on the floor
      [0.8, 0.7, 0xbcd9f0, 2.5, 0.35, 0.9, -3.95, 0, 0]]);              // the open window behind the bookshelf
  // The alley: a narrow canyon of walls, open blue sky above, red bricks in front with the evening sun across
  // their top, the room's pale building behind the camera, damp grey ground.
  const alleyEnvironment = (renderer) => softLight(renderer, [8, 6, 3],
    [[0x9c8f88, 0.35], [0x9c8f88, 0.35], [0x9cc2ee, 1.6], [0x5d5a58, 0.3], [0xb8b4ae, 0.4], [0x9a4a3a, 0.45]],
    [[8, 1.6, 0xffb37a, 2.2, 0, 2.0, -1.49, 0, 0]]);                   // the sunny top of the brick wall
  // The open air: blue sky overhead, paler toward the horizon, green hills below, and the sun itself.
  const openEnvironment = (renderer) => {
    const d = new THREE.Vector3(...OPEN_SUN_FROM).normalize().multiplyScalar(4.5);
    return softLight(renderer, [20, 10, 20],
      [[0xc4d9ec, 0.6], [0xb4cbe6, 0.5], [0x8fbfec, 1.5], [0x7a8f5c, 0.4], [0xc4d9ec, 0.6], [0xb4cbe6, 0.5]],
      [[1.6, 1.6, 0xfff0d0, 9, d.x, d.y, d.z]]);                      // the sun
  };
  // Golden hour: a dusky blue sky overhead, a warm golden horizon all round, darker green below, a low orange sun.
  const goldEnvironment = (renderer) => {
    const d = new THREE.Vector3(...GOLD_SUN_FROM).normalize().multiplyScalar(4.5);
    return softLight(renderer, [20, 10, 20],
      [[0xf2c48e, 0.7], [0xd9a98a, 0.5], [0x7d93c4, 1.0], [0x5a6040, 0.35], [0xf0bf8c, 0.6], [0xe8b48a, 0.6]],
      [[2.2, 1.6, 0xffb060, 8, d.x, d.y, d.z]]);                      // the low sun
  };

  // A sunbeam: a spotlight, its light shaped by a picture (where it's dark, the light is blocked), casting shadows.
  function sunbeam(scene, from, at, colour, width, picture) {
    const sun = new THREE.SpotLight(colour, 0, 0, width * DEG, 0.35, 0);
    sun.position.set(...from); sun.target.position.set(...at);
    sun.map = picture;
    sun.castShadow = SHADOWS;
    if (SHADOWS) {
      sun.shadow.mapSize.set(1024, 1024);
      const d = Math.hypot(from[0] - at[0], from[1] - at[1], from[2] - at[2]);
      sun.shadow.camera.near = d * 0.35; sun.shadow.camera.far = d * 1.6;
      sun.shadow.camera.layers.enable(1);                               // the animals cast shadows in it too
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.015;
      sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true;     // (its shadows are only drawn while it's lit: see frame())
    }
    scene.add(sun, sun.target);
    return sun;
  }

  // Specks floating in the light: tiny glowing points, each drifting gently round its home spot inside a box
  // (x0..x1, y0..y1, z0..z1). Dust in front of the bookshelf; golden pollen at the top of the tree.
  function buildDust(scene, count, size, colour, [x0, x1, y0, y1, z0, z1], seed) {
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // (its own "random", so the rest stays the same)
    const home = [], geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) home.push({ x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0), z: z0 + rnd() * (z1 - z0), phase: rnd() * 6.3, speed: 0.15 + rnd() * 0.25 });
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: TEX.dust(), color: colour, size, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const points = new THREE.Points(geo, mat); points.frustumCulled = false; scene.add(points);
    // Move them along: each wanders slowly round its home spot, sinking and rising a little.
    const move = (t, see) => {
      points.visible = see > 0.01; mat.opacity = 0.7 * see;
      if (!points.visible) return;
      home.forEach((d, i) => {
        const a = t * d.speed + d.phase;
        pos[i * 3] = d.x + Math.sin(a) * 0.05 + Math.sin(a * 0.37) * 0.04;
        pos[i * 3 + 1] = d.y + Math.sin(a * 0.71 + 1) * 0.05;
        pos[i * 3 + 2] = d.z + Math.cos(a * 0.53) * 0.04;
      });
      geo.attributes.position.needsUpdate = true;
    };
    return move;
  }

  // A few birds far out over the valley, gliding across in a loose line and now and then flapping: dark
  // little "v" shapes against the evening sky (only seen at the end). One shape for all of them, its points
  // moved every frame.
  function buildBirds(scene) {
    let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const birds = [];
    for (let i = 0; i < BIRDS; i++) birds.push({ ahead: i * 3.2 + rnd() * 1.5, up: (rnd() - 0.5) * 2.5 + i * 0.25, out: (rnd() - 0.5) * 6, phase: rnd() * 6.3, size: 0.7 + rnd() * 0.3 });
    const pos = new Float32Array(BIRDS * 12), geo = new THREE.BufferGeometry();   // each bird: two triangles, four corners
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const idx = []; for (let i = 0; i < BIRDS; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b2c2c, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    const L = level.LOOKOUT, span = 90;
    const fly = (t, see) => {
      mesh.visible = see > 0.01; mat.opacity = see;
      if (!mesh.visible) return;
      birds.forEach((b, i) => {
        // Along a line across the valley, drifting left to right, wrapping round when far off to the side.
        const along = ((t * BIRD_SPEED + b.ahead) % span) - span / 2;
        const x = L.x + along, y = L.y + BIRD_HEIGHT + b.up + Math.sin(t * 0.3 + b.phase) * 0.4, z = L.z - BIRD_DISTANCE + b.out;
        const beat = Math.sin(t * 7 + b.phase) * (Math.sin(t * 0.8 + b.phase) > 0.3 ? 1 : 0.15);   // flaps in bursts, glides between
        const w = b.size, tip = 0.35 * w * beat + 0.15 * w;
        const set = (k, dx, dy, dz) => { pos[(i * 4 + k) * 3] = x + dx; pos[(i * 4 + k) * 3 + 1] = y + dy; pos[(i * 4 + k) * 3 + 2] = z + dz; };
        set(0, -w, tip, 0); set(1, 0, 0, -0.25 * w); set(2, w, tip, 0); set(3, 0, -0.08 * w, 0.2 * w);
      });
      geo.attributes.position.needsUpdate = true;
    };
    return fly;
  }

  // ==========================================================================
  // Shading in creases (since 2.24.0)
  // ==========================================================================
  // Each crease is the soft shadow of one shape on a flat surface beside it. On a flat plane (across, at
  // height `at`; or upright, at depth `at`) the shape's outline r = [from, to, from, to] (x and z across, x and y
  // upright; corners rounded by `round`) is dark, and the darkness fades out over `soft` metres from its edge.
  // Where the shape is behind the surface (the wall behind the floor), only the fading part shows. `clip` keeps
  // it within bounds (e.g. on top of the box underneath). One set of creases is one shape, drawn all at once.
  const CREASE_SHADER = {
    vertexShader: "attribute vec2 plane; attribute vec4 outline; attribute vec3 look; varying vec2 vP; varying vec4 vO; varying vec3 vL;\n" +
      "void main() { vP = plane; vO = outline; vL = look; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec2 vP; varying vec4 vO; varying vec3 vL;\n" +
      "void main() { vec2 q = abs(vP - vO.xy) - (vO.zw - vL.z); float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vL.z;\n" +
      "  float k = 1.0 - smoothstep(0.0, vL.x, d); gl_FragColor = vec4(0.0, 0.0, 0.0, vL.y * k * k); }"
  };
  function creaseSet() {
    const pos = [], plane = [], outline = [], look = [], index = [];
    const add = (flat, at, r, soft, dark, round = 0, clip = null) => {
      let [a0, a1, b0, b1] = [r[0] - soft, r[1] + soft, r[2] - soft, r[3] + soft];
      if (clip) { a0 = Math.max(a0, clip[0]); a1 = Math.min(a1, clip[1]); b0 = Math.max(b0, clip[2]); b1 = Math.min(b1, clip[3]); }
      if (a1 <= a0 || b1 <= b0) return;
      const n = pos.length / 3;
      for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) {
        pos.push(...(flat === "y" ? [a, at, b] : [a, b, at])); plane.push(a, b);
        outline.push((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, (r[1] - r[0]) / 2, (r[3] - r[2]) / 2);
        look.push(soft, dark * CREASE_DARK, round);
      }
      index.push(n, n + 1, n + 2, n, n + 2, n + 3);
    };
    // A box sitting on top of another (or on the ground) and standing in front of the next one back: its shadow
    // on what it sits on, and on the face behind it. (front: the box in front; back: the one behind it, if any.)
    const step = (front, back, soft, dark, lift = 0.002) => {
      const x = [Math.max(front.x0, back.x0), Math.min(front.x1, back.x1)];
      if (x[1] <= x[0]) return;
      add("y", front.y1 + lift, [back.x0, back.x1, back.z0, back.z1], soft, dark, 0, [x[0], x[1], front.z0, front.z1]);   // on the front box's top, at the back
      add("z", back.z1 + lift, [front.x0, front.x1, front.y0, front.y1], soft, dark, 0, [x[0], x[1], front.y1, back.y1]);   // on the back box's face, at the bottom
    };
    const build = (group) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("plane", new THREE.Float32BufferAttribute(plane, 2));
      geo.setAttribute("outline", new THREE.Float32BufferAttribute(outline, 4));
      geo.setAttribute("look", new THREE.Float32BufferAttribute(look, 3));
      geo.setIndex(index);
      const mat = new THREE.ShaderMaterial(Object.assign({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }, CREASE_SHADER));
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = -0.5; group.add(mesh);
    };
    return { add, step, build };
  }

  // The room's creases: the floor along the wall, the bookcase on the floor and against the wall, the books on
  // each shelf and the shelf above them, the tank, the pots, the window sill and the picture.
  function roomCreases(g) {
    const c = creaseSet(), S = SHELF, x0 = S.x0 + S.side, x1 = S.x1 - S.side;
    c.add("y", 0.001, [-7, 8, -1, 0.02], 0.25, 0.4, 0, [-7, 8, 0.02, 2]);              // the floor along the wall
    c.add("z", 0.021, [-7, 8, -1, 0.09], 0.12, 0.22, 0, [-7, 8, 0.0, 1]);             // the skirting board, just above the floor
    c.add("y", 0.002, [S.x0, S.x1, -1, S.depth + 0.02], 0.12, 0.5, 0, [-7, 8, 0.02, 2]);   // the bookcase on the floor
    c.add("z", 0.002, [S.x0 - 0.02, S.x1 + 0.02, 0, S.top], 0.07, 0.25, 0, [-7, 8, 0.09, 4]);   // ...and against the wall
    BAYS.forEach((bay) => {
      c.add("y", bay.floor + 0.001, [x0 - 1, x1 + 1, -1, bay.front], 0.07, 0.45, 0, [x0, x1, bay.front, S.depth]);   // in front of the books
      c.add("y", bay.ceil - 0.001, [x0 - 1, x1 + 1, -1, 0.012], 0.16, 0.45, 0, [x0, x1, 0.008, S.depth]);            // under the shelf above, toward the back
    });
    const T = level.TANK;
    c.add("y", T.y0 + 0.002, [T.x0, T.x1, T.z0, T.z1], 0.05, 0.45, 0, [x0, x1, T.z0 - 0.06, S.depth]);   // the tank on the bottom shelf
    for (const p of POTS) { const r = p.r * 0.72; c.add("y", S.top + 0.002, [p.x - r, p.x + r, p.z - r, p.z + r], 0.06, 0.5, r); }   // the pots
    const W = WIN;
    c.add("z", 0.002, [W.x0 - 0.1, W.x1 + 0.1, W.y0 - 0.04, W.y0], 0.08, 0.35, 0, [-7, 8, 0, W.y0 - 0.04]);   // under the window sill
    c.add("z", 0.002, [-1.75, -1.05, 1.15, 1.7], 0.05, 0.3);                           // the picture
    c.build(g);
  }

  // The outdoor creases (in the outdoors' own layout, as built): the alley's ground along the brick wall, the
  // boxes on the ground and against the wall, the pipes, the window sills, the parapet; the crates on the roof
  // and each crate and rock stepping up from the one in front; the giant tree on the top rock.
  function outdoorCreases(g) {
    const c = creaseSet(), G = 3.46;
    c.add("y", G + 0.002, [-7, 8, -1, 0], 0.25, 0.45, 0, [-7, 8, 0, 2]);              // the ground along the wall
    c.add("z", 0.002, [-7, 8, 0, G], 0.2, 0.35, 0, [-7, 8, G, 8]);                    // ...and the wall along the ground
    for (const b of BOXES_AT) {
      const under = b.y0 > G + 0.01 ? BOXES_AT.find((o) => Math.abs(o.y1 - b.y0) < 0.01) : null;   // (a box stacked on another)
      c.add("y", b.y0 + 0.002, [b.x0, b.x1, b.z0, b.z1], 0.08, 0.5, 0, under ? [under.x0, under.x1, under.z0, under.z1] : null);
      c.add("z", 0.003, [b.x0, b.x1, b.y0, b.y1], 0.1, 0.4);                           // against the wall
    }
    for (const run of PIPE_AT.runs) c.add("z", 0.003, [run.x0, run.x1, run.y - 0.045, run.y + 0.045], 0.06, 0.4);   // the pipes
    c.add("z", 0.003, [1.705, 1.795, 5.4, 6.88], 0.06, 0.4);                           // the downpipe
    const WA = WINDOWS_AT;
    for (const [a, b] of WA.runs) c.add("z", 0.003, [a - 0.06, b + 0.06, WA.y0 - 0.05, WA.y0], 0.07, 0.3, 0, [-7, 8, 0, WA.y0 - 0.05]);   // under the sills
    const R = ROOF_AT;
    c.add("z", 0.003, [-7, 8, R.cap, R.y], 0.1, 0.3, 0, [-7, 8, 0, R.cap]);           // under the parapet's cap
    const crates = CRATES_AT, rocks = ROCKS_AT;
    for (const k of crates) c.add("y", R.y + 0.002, [k.x0, k.x1, k.z0, k.z1], 0.1, 0.5, 0, [-7, 8, -8, R.front]);   // the crates on the roof
    const rows = (list, r) => list.filter((k) => k.row === r);
    // Each step up: low crates to tall crates, tall crates to the first rocks, and rock row to rock row. (The rocks
    // are lumpy, so their creases sit a little further out.)
    for (const f of rows(crates, 0)) for (const b of rows(crates, 1)) c.step(f, b, 0.1, 0.45);
    for (const f of rows(crates, 1)) for (const b of rows(rocks, 0)) c.step(f, b, 0.1, 0.45, 0.012);
    for (const r of [0, 1]) for (const f of rows(rocks, r)) for (const b of rows(rocks, r + 1)) c.step(f, b, 0.12, 0.45, 0.012);
    const topRow = rows(rocks, 2), top = Math.max(...topRow.map((k) => k.y1)), edge = 0.07;   // (kept off the rocks' rounded edges)
    c.add("y", top + 0.012, [TREE.x - ROOTS.r, TREE.x + ROOTS.r, TREE.z - ROOTS.r, TREE.z + ROOTS.r], 0.25, 0.5, ROOTS.r,   // the tree on the top rock
      [Math.min(...topRow.map((k) => k.x0)) + edge, Math.max(...topRow.map((k) => k.x1)) - edge, topRow[0].z0 + edge, topRow[0].z1 - edge]);
    c.build(g);
  }

  // ==========================================================================
  // The scene: made once, reused every round.
  // ==========================================================================
  class Scene {
    constructor() {
      if (!window.THREE) throw new Error("The 3D library (js/vendor/three.min.js) didn't load.");
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
      if (SHADOWS) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = false; }
      this.canvas = r.domElement;
      this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1";
      this.camoTarget = new THREE.WebGLRenderTarget(4, 4);

      const scene = this.scene = new THREE.Scene();
      scene.background = this.sky = TEX.sky(); this.gold = 0;
      scene.fog = new THREE.Fog(0xe6eef2, 12, 45);
      this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 80);
      this.camera.layers.enable(1);
      this.hemi = new THREE.HemisphereLight(0xe8f1ff, 0x7a6450, 1.15); scene.add(this.hemi);
      const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
      sun.castShadow = SHADOWS;
      if (SHADOWS) {
        sun.shadow.mapSize.set(1024, 1024);
        const s = sun.shadow.camera; s.left = -1.8; s.right = 1.8; s.top = 1.8; s.bottom = -1.8; s.near = 0.5; s.far = 9;
        s.layers.enable(1);                                       // the animals cast shadows too
        sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
      }
      scene.add(sun, sun.target);

      // ---- Materials ----
      const M = this.M = {
        plaster: std({ map: TEX.plaster() }), plasterSide: std({ color: 0xe2d2b4 }), floor: std({ map: TEX.floor(), roughness: 0.7 }),
        paint: std({ color: 0xf4f0e8, roughness: 0.6 }), wood: std({ map: TEX.wood(), roughness: 0.75 }), darkWood: std({ color: 0x5a3820 }),
        dark: std({ color: 0x1e1c22, roughness: 1 }), book: std({ color: 0xffffff, roughness: 0.8 }),
        glass: new THREE.MeshStandardMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.28, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
        tankGlass: new THREE.MeshStandardMaterial({ color: 0xd8f0f4, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false }),
        gravel: std({ map: TEX.gravel() }), pot: std({ color: 0xc0623b, roughness: 0.9 }), soil: std({ color: 0x3d2a1e }),
        leaf: std({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6 }), tankLeaf: std({ color: 0x5f9a45, side: THREE.DoubleSide }), stem: std({ color: 0x4f7a32 }),
        brick: std({ map: TEX.brick() }), brick2: std({ map: TEX.brick() }), concrete: std({ color: 0xb8b2a8, roughness: 0.95 }), roof: std({ color: 0x8e8a84, roughness: 1 }),
        alleyGround: std({ map: TEX.alleyGround(), roughnessMap: TEX.alleyWet(), roughness: 1 }),
        cardboard: std({ map: TEX.cardboard() }), crate: std({ map: TEX.crate() }), pipe: std({ color: 0x6f7f78, roughness: 0.45, metalness: 0.4 }),
        rock: std({ map: TEX.rock(), flatShading: true, color: 0xf4e9d8 }), grass: std({ color: 0x7fa35a, roughness: 1 }), grassBlade: std({ color: 0xffffff, roughness: 0.9 }),
        bark: std({ map: TEX.bark() }), canopyA: std({ color: 0x4f8a3c, flatShading: true }), canopyB: std({ color: 0x6aa34a, flatShading: true }),
        flowerA: std({ color: 0xf2c94c }), flowerB: std({ color: 0xe86f9a }),
        valley: std({ vertexColors: true, flatShading: true, roughness: 1 }), pine: std({ color: 0xffffff, flatShading: true }),
        water: std({ color: 0x5aa6d2, roughness: 0.35, emissive: 0x1e4a66, emissiveIntensity: 0.3 }),
        alley: new THREE.MeshBasicMaterial({ map: TEX.alley() }), painting: std({ map: TEX.painting() }),
        skyline: new THREE.MeshBasicMaterial({ map: TEX.skyline(), transparent: true, fog: false })
      };
      M.brick2.map = M.brick.map.clone(); M.brick2.map.repeat.set(1, 2); M.brick2.map.needsUpdate = true;
      for (const [key, m] of Object.entries(M)) if (m && m.isMaterial) m.name = key;   // (so tools/Game-Lab.html can say what was marked)
      // A heart-ish leaf, a grass tuft, a flower and a pipe, used many times.
      const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.6, 0.3, 0.6, 0.9, 0, 1.2); leafShape.bezierCurveTo(-0.6, 0.9, -0.6, 0.3, 0, 0);
      M.leafGeo = new THREE.ShapeGeometry(leafShape, 4); M.stemGeo = HG.kit.limbGeometry(1, 4);
      M.grassGeo = new THREE.ConeGeometry(0.35, 1, 4, 1, true); M.grassGeo.translate(0, 0.5, 0);
      M.flowerGeo = new THREE.IcosahedronGeometry(1, 0); M.pipeGeo = HG.kit.limbGeometry(1, 10);

      // ---- The climb ----
      const world = this.world = new THREE.Group(); scene.add(world);
      tagged(world, "room", () => buildRoom(world, M)); tagged(world, "shelf", () => buildShelf(world, M)); tagged(world, "plants", () => buildPlants(world, M));
      const outdoors = new THREE.Group(); outdoors.position.set(0, OUT_DY, OUT_DZ); world.add(outdoors);   // into the alley
      buildOutside(outdoors, M); tagged(outdoors, "rocks", () => buildRocks(outdoors, M)); tagged(outdoors, "tree", () => buildTree(outdoors, M));
      if (CREASES) tagged(world, "creases", () => tagged(outdoors, "creases", () => { roomCreases(world); outdoorCreases(outdoors); }));   // (soft shading where surfaces meet)
      this.far = tagged(world, "sky", () => buildSky(world, M));
      world.traverse((o) => { if (o.isMesh) o.receiveShadow = SHADOWS; });
      this.valley = buildValley(scene, M); this.view = -1; this.valley.group.userData.part = "valley";
      this.tank = buildTank(M); scene.add(this.tank.root); this.tank.root.userData.part = "tank";
      this.tank.root.traverse((o) => { if (o.isMesh) o.receiveShadow = SHADOWS; });
      // The room's light: soft light from all round, the sunbeam, and dust floating in it; and the alley's.
      this.envRoom = roomEnvironment(r); this.envAlley = alleyEnvironment(r); this.envOpen = openEnvironment(r); this.envGold = goldEnvironment(r);
      const toward = (v) => new THREE.Vector3(...v).normalize().multiplyScalar(3.5);   // (the view-following sun sits this far toward the sun)
      this.openSun = toward(OPEN_SUN_FROM); this.goldSun = toward(GOLD_SUN_FROM); this.sunsetSun = toward(SUNSET_FROM);
      this.sunOffset = new THREE.Vector3(); this.goldOffset = new THREE.Vector3();
      this.haze = scene.fog.color.clone();
      // The setting sun itself, far out over the valley (only seen at the end).
      this.sunset = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.sunGlow(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      this.sunset.scale.setScalar(SUNSET_SIZE); this.sunset.visible = false;
      this.sunset.position.set(level.LOOKOUT.x, level.LOOKOUT.y, level.LOOKOUT.z).addScaledVector(new THREE.Vector3(...SUNSET_FROM).normalize(), 200);
      scene.add(this.sunset);
      scene.environment = this.envRoom; this.bounce = -1;
      this.roomSun = sunbeam(scene, ROOM_SUN_FROM, ROOM_SUN_AT, ROOM_SUN_COLOUR, ROOM_SUN_WIDTH, TEX.sunbeam());
      this.alleySun = sunbeam(scene, ALLEY_SUN_FROM, ALLEY_SUN_AT, ALLEY_SUN_COLOUR, ALLEY_SUN_WIDTH, TEX.alleySun());
      this.dust = buildDust(scene, DUST, DUST_SIZE, 0xffe2b0, [-1.3, 1.0, 0, 2.9, 0.36, 1.26], 11);
      const L = level.LOOKOUT;                                          // (golden pollen round the bough at the top, between it and the camera)
      this.pollen = buildDust(scene, POLLEN, POLLEN_SIZE, 0xffb85a, [L.x - 1.1, L.x + 1.1, L.y - 0.6, L.y + 0.25, L.z - 0.1, L.z + 0.8], 31);
      this.birds = buildBirds(scene);
      this.skyColour = this.hemi.color.clone(); this.groundColour = this.hemi.groundColor.clone(); this.shade = new THREE.Color();
      this.glow = GLOW ? HG.glow.make(r, { from: GLOW_FROM, strength: GLOW_STRENGTH, spread: GLOW_SPREAD, corners: VIGNETTE }) : null;   // (games/lib/glow.js)
      // (ready to show without a stutter: everything, valley included, made ready to draw the way it will be drawn)
      this.valley.group.visible = true; r.setRenderTarget(this.glow ? this.glow.world : null);
      r.compile(scene, this.camera); r.setRenderTarget(null); this.valley.group.visible = false;

      this.chams = []; this.cat = null; this.crow = null;
      this.projector = new THREE.Vector3();
      this.chamScreen = []; this.predatorScreen = { x: 0, y: 0, size: 0, visible: false };
    }

    // Start a new round: attach to the page, make the two chameleons, put the tank back.
    begin(viewEl, colours) {
      viewEl.prepend(this.canvas);
      this.viewEl = viewEl;
      for (const c of this.chams) { this.scene.remove(c.root); c.dispose(); }
      this.chams = colours.map((colour, i) => {
        const c = new HG.Chameleon({ colour, tailSide: i === 0 ? 1 : -1 });
        c.root.scale.setScalar(CHAM_SIZE); c.setLayer(1); c.root.traverse((o) => { if (o.isMesh) o.castShadow = SHADOWS; });
        this.scene.add(c.root); return c;
      });
      if (!this.cat) {
        this.cat = new HG.Cat(); this.cat.root.scale.setScalar(CAT_SIZE); this.cat.setLayer(1);
        this.cat.root.traverse((o) => { if (o.isMesh) o.castShadow = SHADOWS; }); this.scene.add(this.cat.root);
      }
      if (!this.crow) {
        this.crow = new HG.Crow({ style: "none" }); this.crow.root.scale.setScalar(CROW_SPAN); this.crow.root.traverse((o) => { o.layers.set(1); if (o.isMesh) o.castShadow = SHADOWS; });
        this.scene.add(this.crow.root);
      }
      this.cat.root.visible = false; this.crow.root.visible = false;
      this.bounce = -1; this.softMats = null;                            // (the new chameleons need the room's soft light set too)
      this.tank.rocker.rotation.set(0, 0, 0);
      this.tank.front.rotation.set(0, 0, 0); this.tank.front.position.set(0, 0, this.tank.d / 2);
      this.chamScreen = colours.map(() => ({ x: 0, y: 0, size: 0 }));
      this.camY = START_Y;
    }

    // Draw one frame. f = {
    //   cam: { x, y, z?, dist },   (z: the depth to look at, e.g. the chameleons'; else level.surface(y))
    //   chams: [{ x, y, z?, pitch?, s?, vx, vy, camo, fall, spin, hidden, leapNow?, leapSeconds?, lookAt: {x, y}? }],
    //          (metres, metres per second; vy = speed along the climb; leapNow: start a leap this frame;
    //          s: how far along its route it is, so it bends round the route's corners; null = a flat wall)
    //   tank: { rock: -1..1, tip: 0..1 },   (tip: how far through the escape: the front popping off and falling)
    //   view: 0..1,   (at the end: looking out over the valley from the top of the tree)
    //   cat: null or { x, y, z, yaw, controls }, crow: null or { x, y, z, yaw, controls },
    //   shake: 0..1 }
    frame(f) {
      const w = this.viewEl.clientWidth, h = this.viewEl.clientHeight;
      if (!w || !h) return;
      const now = performance.now(), dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
      this.lastFrame = now;
      const r = this.renderer, size = r.getSize(new THREE.Vector2());
      if (size.x !== w || size.y !== h) { r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

      // ---- Camera: level, a little from one side, rising with the chameleons ----
      const cam = f.cam, tz = cam.z != null ? cam.z : level.surface(cam.y), shake = f.shake || 0;
      const target = new THREE.Vector3(cam.x, cam.y, tz);
      // Through the window: once the chameleons are out in the alley (behind the room's wall), the camera
      // follows them through the opening and stays just out past the wall, never backing into it.
      let camZ = tz + cam.dist;
      if (tz < 0) camZ = Math.min(camZ, camZ + (WALL_THROUGH - camZ) * smooth(-tz / WINDOW_PASS));
      // In the room it looks from one side; as it comes to the window it turns to look straight on (so it
      // passes cleanly through the opening), and stays straight on in the alley.
      const side = smooth((camZ - 0.3) / 0.6), yaw = VIEW_FROM_SIDE * side * Math.PI / 180;
      // At the end (f.view 0 to 1) it rises a little, steps back, and tips down to look out over the valley.
      const out = smooth(f.view || 0);
      this.camera.position.set(cam.x + Math.tan(yaw) * (camZ - tz) + (Math.random() - 0.5) * 0.04 * shake,
        cam.y + (Math.random() - 0.5) * 0.03 * shake + VALLEY_RISE * out, camZ + VALLEY_BACK * out);
      const py = this.camera.position.y;                                // looking straight ahead: level, so upright edges stay upright
      this.camera.lookAt(target.x, py - VALLEY_LOOK[0] * out, target.z - VALLEY_LOOK[1] * out);
      // (tools/Game-Lab.html looks from its own camera, f.lookFrom = { position, target }; the light still follows cam)
      if (f.lookFrom) { this.camera.position.copy(f.lookFrom.position); this.camera.lookAt(f.lookFrom.target); }
      this.camY = cam.y;
      this.far.position.y = cam.y - 3.8;
      // Light: the room's, the alley's or open daylight (below); the sun's shadow box follows the view.
      const outside = smooth(-tz / 0.8);
      // The potted plants fade out while the chameleons are on the window sill, so their leaves don't hide them.
      const onSill = f.chams.filter((c) => !c.hidden).every((c) => c.y > level.SILL.y - 0.03 && c.y < level.SILL.y + 0.3);
      this.plantFade = (this.plantFade || 0) + ((onSill ? 1 : 0) - (this.plantFade || 0)) * Math.min(1, dt * 5);
      const see = 1 - PLANT_FADE * this.plantFade, M = this.M;
      for (const m of [M.leaf, M.stem]) {
        m.opacity = see;
        if (m.transparent !== see < 0.99) { m.transparent = see < 0.99; m.depthWrite = !m.transparent; m.needsUpdate = true; }
      }
      // Four moods, mixed by where the view is: the room (inside), the alley (outside, below ALLEY_UP), open
      // daylight above it, and golden hour at the tree top (see "the light in the room", "...in the alley",
      // "...in the open" and "golden hour" in Tuning). The four shares add up to 1.
      const inside = 1 - outside, alley = outside * (1 - smooth((cam.y - ALLEY_UP[0]) / (ALLEY_UP[1] - ALLEY_UP[0])));
      const gold = (outside - alley) * smooth((cam.y - GOLD_UP[0]) / (GOLD_UP[1] - GOLD_UP[0])), open = outside - alley - gold;
      // At the end: the valley (with the setting sun) is shown once the view has climbed into the leaves (VALLEY_SHOW),
      // so it's already there when they come out at the top; or as the view turns out over it, whichever is more.
      const reveal = Math.max(clamp(f.view || 0, 0, 1), clamp((cam.y - VALLEY_SHOW[0]) / (VALLEY_SHOW[1] - VALLEY_SHOW[0]), 0, 1));
      const sunsetTurn = SUNSET_TURN * smooth(reveal);                  // (and the light swings round toward the setting sun)
      this.hemi.intensity = ROOM_FILL * inside + ALLEY_FILL * alley + OPEN_FILL * open + GOLD_FILL * gold;
      this.sun.intensity = ROOM_FRONT * inside + ALLEY_FRONT * alley + OPEN_SUN_STRENGTH * open + GOLD_SUN_STRENGTH * gold;
      this.sun.color.setRGB(1, 0.9 + 0.06 * outside, 0.78 + 0.12 * outside).lerp(this.shade.set(ALLEY_SHADE), alley * 0.6)
        .lerp(this.shade.set(OPEN_SUN_COLOUR), open + gold).lerp(this.shade.set(GOLD_SUN_COLOUR), gold);
      this.hemi.color.copy(this.skyColour).lerp(this.shade.set(ALLEY_SHADE), alley).lerp(this.shade.set(0xffcf9e), gold);
      this.hemi.groundColor.copy(this.groundColour).lerp(this.shade.set(0x55525a), alley).lerp(this.shade.set(0x4f4636), gold);
      // Golden hour also turns the sky, the haze and the distant town and hills golden (the sky picture is only
      // repainted when it has changed enough to see).
      const goldSky = Math.round(gold * 40) / 40;
      if (goldSky !== this.gold) {
        this.gold = goldSky;
        paintSky(this.sky.image.getContext("2d"), this.sky.image.width, this.sky.image.height, goldSky); this.sky.needsUpdate = true;
      }
      this.scene.fog.color.copy(this.haze).lerp(this.shade.set(GOLD_HAZE), gold);
      if (this.glow) this.scene.fog.color.convertLinearToSRGB();        // (drawn into a picture, three.js takes the haze's colour as given: give it the screen's)
      M.skyline.color.setRGB(1, 1, 1).lerp(this.shade.set(0xffc99a), gold);
      this.sunset.visible = reveal > 0.01; this.sunset.material.opacity = smooth(reveal);
      this.pollen(now / 1000, smooth(reveal)); this.birds(now / 1000, smooth(reveal));
      this.roomSun.intensity = ROOM_SUN_STRENGTH * inside;
      this.alleySun.intensity = ALLEY_SUN_STRENGTH * alley;
      for (const s of [this.roomSun, this.alleySun]) if (SHADOWS) s.shadow.needsUpdate = s.intensity > 0;
      this.dust(now / 1000, inside);
      // Soft light from all round: the strongest mood's picture. Going from one mood to the next it fades to
      // nothing at the halfway point, where the picture changes, and back up, so there's no jump.
      const moods = [[inside, this.envRoom, ROOM_BOUNCE], [alley, this.envAlley, ALLEY_BOUNCE], [open, this.envOpen, OPEN_BOUNCE], [gold, this.envGold, GOLD_BOUNCE]];
      const [share, env, strength] = moods.reduce((a, b) => (b[0] > a[0] ? b : a));
      const soft = Math.round(strength * smooth(2 * share - 1) * 50) / 50;
      if (env !== this.scene.environment) this.scene.environment = env;
      if (soft !== this.bounce) {                                        // (only reset every material when it has changed)
        this.bounce = soft;
        if (!this.softMats) {                                            // (the list of them, gathered once per round)
          const found = new Set();
          this.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if ("envMapIntensity" in m) found.add(m); });
          this.softMats = [...found];
        }
        for (const m of this.softMats) m.envMapIntensity = soft;
      }
      // The sun that follows the view (it gives the chameleons their shadows): from the camera's side, up and to
      // the left, in the room and alley; in the open, where the afternoon sun really is; at golden hour, the low
      // sun (swinging round to the setting sun at the very end).
      this.goldOffset.copy(this.goldSun).lerp(this.sunsetSun, sunsetTurn).setLength(3.5);
      this.sunOffset.set(-1.4, 2.4 + 0.8 * outside, 3.2 - 2.2 * outside).multiplyScalar(inside + alley)
        .addScaledVector(this.openSun, open).addScaledVector(this.goldOffset, gold);
      this.sun.position.copy(target).add(this.sunOffset); this.sun.target.position.copy(target);

      // ---- The tank: rocking; at the escape (tip 0 to 1) the chameleons shove its front, which pops off,
      // tips forward off the shelf and lands flat on the floor, where it stays ----
      const tank = f.tank || { rock: 0, tip: 1 }, tip = tank.tip, T = this.tank;
      T.rocker.rotation.z = (tank.rock || 0) * 0.09;
      const shove = tip < 0.3 ? Math.max(0, Math.sin(tip / 0.3 * Math.PI * 3)) * 0.008 * (0.4 + tip / 0.3) : 0;
      const pop = smooth((tip - 0.3) / 0.12), fall = clamp((tip - 0.34) / 0.44, 0, 1);
      const bounce = Math.sin(Math.PI * clamp((tip - 0.78) / 0.14, 0, 1)) * 0.12;
      T.front.position.set(0, -level.TANK.y0 * fall * fall + 0.006 * fall, T.d / 2 + shove + 0.05 * pop + 0.07 * fall);
      T.front.rotation.x = Math.PI / 2 * fall * fall - bounce;

      // ---- The valley at the end (reveal 0 to 1, above): it fades in as the town skyline fades out, and the
      // haze thins so the far mountains show. Eased, so it starts and finishes gently ----
      if (reveal !== this.view) {
        this.view = reveal;
        const fade = smooth(reveal);
        this.valley.group.visible = reveal > 0.001;
        for (const m of this.valley.materials) m.opacity = fade;
        M.skyline.opacity = 1 - fade; this.far.visible = reveal < 0.999;
        this.scene.fog.near = 12 + 25 * fade; this.scene.fog.far = 45 + 125 * fade;
        this.camera.far = 80 + 170 * fade; this.camera.updateProjectionMatrix();
      }

      // ---- Chameleons ----
      f.chams.forEach((c, i) => {
        const cham = this.chams[i];
        cham.root.visible = !c.hidden;
        if (c.hidden) return;
        // On the surface it's climbing, tilted to match it (pitch: 0 = head up a wall, -90° = walking
        // back across a shelf top), and lifted just clear of it.
        const z = c.z != null ? c.z : level.surface(c.y);
        const pitch = c.pitch || 0;
        cham.root.position.set(c.x, c.y - Math.sin(pitch) * 0.004, z + Math.cos(pitch) * 0.004);
        // Turn toward where it's climbing; spin when it has lost its grip.
        const heading = Math.abs(c.vx) + Math.abs(c.vy) > 0.02 ? -Math.atan2(c.vx, Math.max(0.05, c.vy)) * 0.7 : 0;
        cham.heading = (cham.heading || 0) + (heading - (cham.heading || 0)) * Math.min(1, dt * 5);
        cham.root.rotation.set(pitch, 0, cham.heading + (c.spin || 0));
        if (c.leapNow) { c.leapNow = false; cham.leap(c.leapSeconds); }
        // The route around it, so its body bends round corners and over edges (s: where it is on its route)
        cham.controls.surface = c.s != null ? surfaceFor(c.x, c.s, c.y, z, pitch, cham.heading + (c.spin || 0)) : null;
        Object.assign(cham.controls, { velocity: [c.vx / CHAM_SIZE, c.vy / CHAM_SIZE], camo: c.camo || 0, fall: c.fall || 0 });
        cham.controls.lookAt = c.lookAt ? cham.root.worldToLocal(new THREE.Vector3(c.lookAt.x, c.lookAt.y, (c.lookAt.z != null ? c.lookAt.z : z) + 0.1)) : null;
        cham.update(dt);
        const hidden = cham.camo > 0.6;                                 // a hidden chameleon casts no shadow either
        if (cham.shadowOff !== hidden) { cham.shadowOff = hidden; cham.root.traverse((o) => { if (o.isMesh) o.castShadow = SHADOWS && !hidden; }); }
      });

      // ---- Cat and crow ----
      for (const [key, model] of [["cat", this.cat], ["crow", this.crow]]) {
        const p = f[key];
        model.root.visible = !!p;
        if (!p) continue;
        model.root.position.set(p.x, p.y, p.z);
        model.root.rotation.set(0, p.yaw || 0, p.roll || 0);
        Object.assign(model.controls, p.controls || {});
        model.update(dt);
      }

      if (f.beforeDraw) f.beforeDraw(this);               // (tools/Game-Lab.html: e.g. show just one part)
      this.draw();

      // ---- Where things are on screen, for the words and effects drawn on top ----
      f.chams.forEach((c, i) => {
        const p = this.chams[i].root.position, s = this.toScreen(p.x, p.y, p.z, w, h), s2 = this.toScreen(p.x + CHAM_SIZE, p.y, p.z, w, h);
        this.chamScreen[i] = { x: s.x, y: s.y, size: Math.abs(s2.x - s.x) * 2.2 };
      });
      const pred = f.cat ? this.cat.root.position : f.crow ? this.crow.root.position : null;
      if (pred) { const s = this.toScreen(pred.x, pred.y + 0.15, pred.z, w, h); this.predatorScreen = { x: s.x, y: s.y, visible: true }; }
      else this.predatorScreen = { x: 0, y: 0, visible: false };
      // The setting sun, when it's showing (so the end photo can frame it too).
      const sun = this.sunset.position, ss = this.sunset.visible ? this.toScreen(sun.x, sun.y, sun.z, w, h) : null;
      this.sunScreen = ss && ss.visible && ss.x > 0 && ss.x < w && ss.y > 0 && ss.y < h ? ss : null;
    }

    // Render: first (only when a chameleon is hiding) the world without the animals,
    // as the picture its camouflage shows; then everything.
    draw() {
      const r = this.renderer, cam = this.camera;
      if (SHADOWS) r.shadowMap.needsUpdate = true;
      if (this.chams.some((c) => c.camo > 0.005 && c.root.visible)) {
        const buf = r.getDrawingBufferSize(new THREE.Vector2());
        const tw = Math.max(4, Math.round(buf.x * CAMO_DETAIL)), th = Math.max(4, Math.round(buf.y * CAMO_DETAIL));
        if (this.camoTarget.width !== tw || this.camoTarget.height !== th) this.camoTarget.setSize(tw, th);
        cam.layers.set(0);
        r.setRenderTarget(this.camoTarget); r.render(this.scene, cam); r.setRenderTarget(null);
        cam.layers.enable(1);
        HG.kit.camo.map.value = this.camoTarget.texture; HG.kit.camo.size.value.copy(buf);
      }
      if (!this.glow) { r.render(this.scene, cam); return; }
      const size = r.getDrawingBufferSize(new THREE.Vector2());           // with the glow: into a picture first, then to the screen
      this.glow.size(size.x, size.y);
      r.setRenderTarget(this.glow.world); r.render(this.scene, cam);
      this.glow.show();
    }

    // A copy of the current picture, drawn `sharper` times finer (for the end-of-round photo).
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

    // How far back the camera must be to fit `span` metres top to bottom (with some room around).
    distanceFor(span) { return span / 2 / Math.tan(FOV / 2 * Math.PI / 180); }

    toScreen(x, y, z, w, h) {
      const v = this.projector.set(x, y, z).project(this.camera);
      return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 };
    }

    detach() { if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas); }
  }

  let scene = null;
  const get = () => scene || (scene = new Scene());

  // Getting ready in the background (since 2.26.0): the shell runs these steps one at a time while the sensors
  // connect. They build the scene, then draw it once from each part of the climb (with the cat, the crow, the
  // camouflage, the valley and the glow) into a hidden full-size view, so every shader is made and every picture
  // is on the graphics card before a round needs it. (Made the first time they were seen, they caused little
  // stutters.) Each step waits for the graphics card to finish its drawing (by reading one dot back from it): left
  // to itself, the browser puts the drawing off and then does it all at once when the round starts: a long stutter.
  function warmUp() {
    let sc = null, view = null;
    const chamAt = (x, y, camo) => {                                 // a chameleon on its route, nearest height y
      const r = level.route(x); let best = r[0];
      for (const p of r) if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
      const a = level.at(x, best.s);
      return { x, y: a.y, z: a.z, pitch: level.tilt(x, best.s), s: best.s, vx: 0, vy: 0.2, camo, fall: 0, spin: 0, hidden: false, lookAt: null };
    };
    const cat = (x, y, z) => ({ x, y, z, yaw: 0, controls: { mode: "walk", speed: 0.5, look: 0, hiss: 0.5, squint: 0 } });
    const crow = (x, y, z) => ({ x, y, z, yaw: 0, controls: { mode: "perch", flap: 0, bank: 0, look: 0, peck: 0.5 } });
    const at = (x, y, extra = {}) => () => {                          // draw a few frames looking at height y (camouflaged if extra.camo)
      const chams = [chamAt(x - 0.11, y - 0.1, extra.camo || 0), chamAt(x + 0.11, y - 0.1, extra.camo || 0)];
      const cam = { x, y, z: (chams[0].z + chams[1].z) / 2, dist: 1.29 };
      for (let k = 0; k < 4; k++) sc.frame(Object.assign({ cam, chams, tank: { rock: 0, tip: 1 }, shake: 0, view: 0, cat: null, crow: null }, extra));
    };
    const L = level.LOOKOUT;
    return [
      () => { sc = get(); },
      () => {
        view = document.createElement("div");
        view.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1";   // (full size, as in a round)
        document.body.appendChild(view);
        sc.begin(view, ["#e0662b", "#7a4fd6"]);
      },
      () => { for (let k = 0; k < 3; k++) sc.frame({ cam: { x: 0, y: 0.39, z: 0.13, dist: 1.0 }, chams: [chamAt(-0.11, 0.27, 0), chamAt(0.11, 0.27, 0)], tank: { rock: 0.5, tip: 0.6 }, shake: 0, view: 0 }); },
      at(0, 1.2, { camo: 1, cat: cat(0.3, 1.0, 0.26) }),               // the shelves, a cat, hiding
      at(0.15, 2.3), at(0.35, 2.75),                                   // the plants, the window sill
      at(0.55, 3.05, { camo: 1, cat: cat(0.9, 2.62, -0.9) }),          // the alley's boxes
      at(0.8, 4.4), at(0.95, 5.4),                                     // the brick wall, the broken windows
      at(1.0, 6.4, { camo: 1, crow: crow(1.3, 6.15, -1.5) }),          // the roof, a crow
      at(1.2, 7.8), at(1.3, 8.6), at(1.4, 10.0), at(1.4, 12.3),        // the rocks, the tree, the leaves
      at(L.x, L.y + 0.12, { view: 0 }), at(L.x, L.y + 0.12, { view: 1 }),   // the very top: arriving, then the valley
      () => {                                                          // any picture not drawn yet: onto the graphics card too
        sc.scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const key of ["map", "roughnessMap", "normalMap", "bumpMap", "alphaMap"]) if (m[key]) sc.renderer.initTexture(m[key]); });
        sc.detach(); view.remove();
      }
    ].map((step) => () => { step(); if (sc) { const gl = sc.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } });
  }

  return {
    level, CHAM_SIZE, CAT_SIZE, CROW_SPAN,
    get, warmUp
  };
})();
