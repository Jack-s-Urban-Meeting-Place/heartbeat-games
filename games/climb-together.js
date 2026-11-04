// ============================================================================
// Climb Together (two players working together, or one climbing solo)
// ----------------------------------------------------------------------------
// Two chameleons (games/lib/chameleon.js, one orange, one purple) escape from
// their tank on a bookshelf and climb to safety: up the shelf, past potted
// plants, out of a window, up an alley's boxes and brick wall, past broken
// windows, over crates and big rocks, and up a giant tree. Reaching the top wins:
// they climb on through its leaves to the very top, looking out over a valley.
//
// Players climb on the spot, hands up, reaching one hand after the other. The
// harder they climb, the faster their chameleon climbs; leaning the climb left or
// right steers. Now and then a cat (indoors and in the alley) or a crow (outside,
// higher up) comes to look: everyone must FREEZE. A chameleon that holds still
// takes on the colours of what's behind it (all but its eyes) and can't be seen.
// One that moves is caught and slides back down a few steps. And if one chameleon
// gets too far ahead, it loses its grip and slides back down to its friend.
//
// One player: as in Fly Together, a player who never climbs at the start is left
// out (their sensor is probably on a table), and the other climbs solo.
// Drawn in 3D (games/lib/climb3d.js). Designed from the storyboards in
// storyboards/climb-together/. The full game contract is at the top of js/app.js.
// ============================================================================
(function () {
  const F = HG.flight;                // shared helpers: the stage, ticks, colours
  const L = () => HG.climb3d.level;

  // ---- Tuning: climbing -------------------------------------------------------
  const ROUND_SECONDS = 90;          // climbing time, from the escape
  const CLIMB_SPEED = 0.26;          // metres per second when climbing hard (the whole climb is 12 m)
  const CLIMB_START = 0.45;          // movement (0 to 1) where climbing begins...
  const CLIMB_FULL = 0.78;           // ...and where it's at full speed
  const LEAN_DEADZONE = 6;           // a lean smaller than this (degrees) climbs straight up
  const LEAN_FULL = 24;              // a lean this big (degrees) climbs fully sideways
  const LEAN_SMOOTHING = 0.8;        // seconds: the climbing arm swings a lot, so its lean is averaged over this long
  const SIDEWAYS = 1.0;              // sideways speed at a full lean, as a share of climbing speed
  const TOGETHER_NEAR = 0.15;        // chameleons this close (metres) are climbing together...
  const TOGETHER_BOOST = 1;       // ...and climb this much faster (0.15 = 15%)
  // Climbing close together: tiny hearts trail out behind them (as in Fly Together).
  const HEARTS_NEAR = 0.25;          // chameleons this close (metres; side by side they never get closer than 0.2)...
  const HEARTS_START = 1;            // ...give off this many hearts per second...
  const HEARTS_PER_SECOND = 1;       // ...plus this many more for every second they stay close...
  const HEARTS_MAX = 5;              // ...up to this many per second
  const HEART_SECONDS = 1.4;         // how long each heart floats before fading
  const TILT_SPEED = 9;             // how quickly a chameleon tilts to match the surface (over shelf edges, onto tops)
  const LEAP_LIFT = 0.04;            // how far a leaping chameleon arcs out from the surface (metres)
  // ---- Tuning: hiding ----------------------------------------------------------
  const STILL_ENERGY = 0.32;         // below this much movement counts as holding still
  const HIDE_AFTER = 0.25;           // seconds of holding still before the camouflage starts
  // ---- Tuning: staying together --------------------------------------------------
  const GAP_WARN = 0.6;              // one chameleon this far above the other (metres): "Wait for your friend!"...
  const GAP_MAX = 0.95;              // ...and this far: it loses its grip and slides back down to them
  const REJOIN_ABOVE = 0.15;         // it slides down to this far above its friend
  // ---- Tuning: cats and crows ----------------------------------------------------
  const FIRST_VISIT = 3;             // seconds of climbing before the first cat
  const VISIT_EVERY = [3, 5];       // then one comes every this many seconds (from, to)
  const VISIT_HIGH = [-0.2, 0.3];    // where it arrives: this high above the middle of the view (from, to; metres)...
  const VISIT_ASIDE = 0.1;           // ...and this far to one side of it (metres)
  const VISIT_CLEAR = 0.26;         // and at least this far sideways from any chameleon at its height (metres)
  const CROWS_ABOVE = 5.85;          // above this height (metres: the roof, in the alley) crows come instead of cats
  // (Holding still only shows up about a second after a player stops: the sensor measures movement over
  // half a second, and its readings arrive about half a second late. So the warning is generous.)
  const WARNING = 1.4;               // seconds from a cat or crow appearing to it starting to look (time to freeze;
                                     // the same all the way up: a sensor's readings arrive about a second late)
  const LOOK_SECONDS = 2.0;          // how long it looks around
  const SPOT_SECONDS = 0.5;          // moving for this long while it's looking gets a chameleon caught
  // Higher up, the visitors get warier (from these numbers at the bottom to these at the top, in between by height):
  const VISIT_EVERY_TOP = [2, 3];  // they come more often (seconds between visits, from, to)...
  const LOOK_SECONDS_TOP = 1.0;      // ...look about for less time...
  const SPOT_SECONDS_TOP = 0.3;      // ...spot a moving chameleon quicker...
  const QUICKER_TOP = 1.2;           // ...and arrive and leave this many times faster
  const FALL_BACK = 0.6;             // a caught chameleon slides back down this far (metres)
  const FALL_SECONDS = 0.9;          // ...taking this long
  // ---- Tuning: the start (the escape from the tank) ----------------------------------
  const HOLD_SECONDS = 1.5;          // "Hands up! Hold still": this long, still
  const CLIMB_SECONDS = 1.8;         // "Climb on the spot!": this much climbing
  const LEFT_DEGREES = 12;           // "Climb to the left", then "Climb to the right": a lean this big...
  const LEFT_HOLD = 0.6;             // ...kept up this long
  const FREEZE_HOLD = 0.8;           // "Freeze!": everyone still this long, then they shove the tank's front off
  const HOLD_TIMEOUT = 9, CLIMB_TIMEOUT = 10, LEFT_TIMEOUT = 9, FREEZE_TIMEOUT = 5;   // steps never wait longer than this
                                     // (LEFT_TIMEOUT: for the left step and the right step each)
  const TABLE_WAIT = 1.2;            // seconds to wait for a sensor that hasn't moved at all (on a table)
  const SLOW_WAIT = 5;               // seconds to wait for a player who moved but hasn't climbed yet
  const ESCAPE_SECONDS = 1.8;        // the chameleons shoving the tank's front until it pops off and falls
  // ---- Tuning: the camera ----------------------------------------------------------
  const VIEW_HEIGHT = 1.2;           // metres of climb on screen, top to bottom, normally
  const FALL_ZOOM = 1.35;            // the view pulls back this much when someone is caught
  const CAM_DEPTH_SPEED = 1.6;       // how quickly the view follows the chameleons in and out (e.g. through the window)
  // ---- Tuning: the end at the very top of the tree ----------------------------------
  // Once both reach the finish, they climb on by themselves up through the leaves to the bough at the very top,
  // sit side by side, perfectly still, and the view turns to look out over the valley; then the photo.
  const FINALE_SPEED = 0.8;          // how fast they climb on up (metres per second)
  const FINALE_SLOW = 0.35;          // they slow down over this last stretch (metres) and sit
  const FINALE_SPOTS = 0.11;         // where they sit on the bough: this far either side of its middle (metres)
  const SIT_SECONDS = 0.6;           // once both are sitting, the view starts turning out over the valley after this long (seconds)...
  const VIEW_SECONDS = 2.0;          // ...taking this long...
  const VIEW_HOLD = 2.0;             // ...then it holds on the view this long before the photo
  // ---- Tuning: the end-of-round photo (as in Fly Together) ----------------------------
  const PHOTO_FREEZE = 0.5, PHOTO_ZOOM_IN = 1.4, PHOTO_HOLD = 0.9, PHOTO_PULL_BACK = 1.6;
  const PHOTO_MAX_ZOOM = 2.8, PHOTO_TILT_DEGREES = -5, PHOTO_SHARPNESS = 2;
  // ----------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (v) => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
  const perpendicular = (v, to) => { const k = dot(v, to); return [v[0] - k * to[0], v[1] - k * to[1], v[2] - k * to[2]]; };
  const DEG = Math.PI / 180;

  // ==========================================================================
  // Climber: reads one player's sensor. Learns, per round, the arm's average
  // direction while climbing ("centre"), while climbing to the left and while
  // climbing to the right, so it knows which way is "left" and where straight up
  // is; then gives how hard they're climbing (effort) and which way the climb leans.
  // ==========================================================================
  class Climber {
    constructor(p) {
      this.p = p; this.energy = 0; this.up = null; this.centre = null; this.left = null;
      this.still = []; this.climbSum = [0, 0, 0]; this.leanSum = [0, 0, 0]; this.rightSum = [0, 0, 0];
      this.leftMeasured = false;
    }
    update(dt) {
      const p = this.p;
      if (!p.connected) { this.energy = ease(this.energy, 0, 8, dt); return; }
      this.energy = ease(this.energy, p.energy(), 8, dt);
      const up = p.up(), k = Math.min(1, dt / LEAN_SMOOTHING);
      this.up = this.up ? norm(this.up.map((v, i) => v + (up[i] - v) * k)) : up;
    }
    get effort() { return this.p.connected ? clamp((this.energy - CLIMB_START) / (CLIMB_FULL - CLIMB_START), 0, 1) : 0; }
    get climbing() { return this.p.connected && this.energy > CLIMB_START; }
    get isStill() { return !this.p.connected || this.energy < STILL_ENERGY; }
    // How far the climb leans away from the centre, in degrees, whichever way.
    leanAmount() {
      if (!this.up || !this.centre) return 0;
      return Math.asin(clamp(Math.hypot(...perpendicular(this.up, this.centre)), 0, 1)) / DEG;
    }
    // For the "climb to the right" step: how far it leans, counted only if it's away from the side the left
    // step learned. (Only the direction is used: "left" learned from one side alone picks up some of the arm's
    // forward-and-back swing, so its degrees read short on the other side. The right step fixes that.)
    rightDegrees() {
      if (!this.up || !this.centre) return 0;
      if (this.leftMeasured && dot(perpendicular(this.up, this.centre), this.left) > 0) return 0;
      return this.leanAmount();
    }
    // The climb's lean away from the centre, in degrees (positive = toward "left"; before "left" is known: whichever way).
    leanDegrees() {
      if (!this.left) return this.leanAmount();
      return Math.atan2(dot(this.up, this.left), dot(this.up, this.centre)) / DEG;
    }
    // -1 (full left) to +1 (full right), with a dead zone in the middle.
    lean() {
      if (!this.left || !this.p.connected) return 0;
      let d = -this.leanDegrees();
      d = Math.abs(d) < LEAN_DEADZONE ? 0 : d - Math.sign(d) * LEAN_DEADZONE;
      return clamp(d / (LEAN_FULL - LEAN_DEADZONE), -1, 1);
    }
    finishCentre() {
      this.centre = Math.hypot(...this.climbSum) > 0 ? norm(this.climbSum) : (this.up || [0, 0, 1]);
    }
    finishLeft() {
      this.leftMeasured = Math.hypot(...this.leanSum) > 0.01;
      if (this.leftMeasured) this.left = norm(perpendicular(this.leanSum, this.centre));
      else {
        // No clear lean: guess, using the sensor axis most at right angles to the centre.
        const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const guess = axes.reduce((best, a) => Math.abs(dot(a, this.centre)) < Math.abs(dot(best, this.centre)) ? a : best);
        this.left = norm(perpendicular(guess, this.centre));
      }
    }
    // After "climb to the right". With both leans measured, "left" points from the right lean to the left lean,
    // and straight up moves halfway to the middle between them: so a player whose arm drifts to one side while
    // "climbing on the spot" doesn't end up steering that way all round. Without a right lean, keep what we had.
    finishRight() {
      if (Math.hypot(...this.rightSum) < 0.01) return;
      const r = norm(this.rightSum);
      if (!this.leftMeasured) { this.left = norm(perpendicular(r.map((v) => -v), this.centre)); return; }
      const l = norm(this.leanSum), middle = norm(l.map((v, k) => v + r[k]));
      const centre = norm(this.centre.map((v, k) => v + middle[k]));
      const across = perpendicular(l.map((v, k) => v - r[k]), centre);
      if (Math.hypot(...across) < 0.05) return;                         // (the two leans were the same way: keep what we had)
      this.centre = centre; this.left = norm(across);
    }
  }

  // ==========================================================================
  // The escape: the start of every round, in the tank. Hands up and still,
  // climb on the spot (the tank rocks), climb to the left, climb to the right, freeze, and they shove
  // the tank's front off. Each step waits for the players, with time limits.
  // ==========================================================================
  class Escape {
    constructor(players, climbers) {
      this.players = players; this.climbers = climbers;
      this.step = "hands"; this.stepTime = 0; this.progress = 0;
      this.ticks = players.map(() => [false, false, false, false]);
      this.held = players.map(() => 0); this.climbed = players.map(() => 0); this.leaning = players.map(() => 0);
      this.active = players.map(() => true); this.decided = false; this.firstClimb = null;
      this.peakEnergy = players.map(() => 0); this.stillFor = 0;
    }
    go(step) { this.step = step; this.stepTime = 0; }
    get playing() { return this.step === "play"; }
    get activeCount() { return this.active.filter(Boolean).length; }
    get solo() { return this.decided && this.activeCount === 1; }
    get soloIndex() { return this.active.indexOf(true); }

    update(dt) {
      this.stepTime += dt;
      const live = this.players.map((p) => p.connected), C = this.climbers;
      this.players.forEach((p, i) => { if (live[i]) this.peakEnergy[i] = Math.max(this.peakEnergy[i], p.energy()); });
      if (this.step === "hands") {
        this.players.forEach((p, i) => {
          if (!live[i] || this.ticks[i][0]) return;
          this.held[i] = C[i].isStill ? this.held[i] + dt : Math.max(0, this.held[i] - dt * 2);
          if (this.held[i] >= HOLD_SECONDS) this.ticks[i][0] = true;
        });
        if (this.players.every((p, i) => !live[i] || this.ticks[i][0]) || this.stepTime > HOLD_TIMEOUT) this.go("climb");
      } else if (this.step === "climb") {
        this.players.forEach((p, i) => {
          if (!live[i] || this.ticks[i][1]) return;
          if (C[i].climbing) {
            this.climbed[i] += dt;
            C[i].climbSum = C[i].climbSum.map((v, k) => v + C[i].up[k] * dt);
          }
          if (this.climbed[i] >= CLIMB_SECONDS) { this.ticks[i][1] = true; if (this.firstClimb === null) this.firstClimb = this.stepTime; }
        });
        // Who's playing: everyone who climbed. Others get a short wait (shorter if their sensor never moved).
        const done = this.players.map((p, i) => live[i] && this.ticks[i][1]);
        const waiting = this.players.map((p, i) => live[i] && !done[i]);
        let decide = !waiting.some(Boolean) && done.some(Boolean);
        if (!decide && this.firstClimb !== null) {
          const since = this.stepTime - this.firstClimb;
          const allIdle = waiting.every((w, i) => !w || this.peakEnergy[i] < 0.2);
          if ((allIdle && since > TABLE_WAIT) || since > SLOW_WAIT) decide = true;
        }
        if (this.stepTime > CLIMB_TIMEOUT) decide = true;
        if (decide) {
          this.active = done.some(Boolean) ? done : live.map((l) => l);
          if (!this.active.some(Boolean)) this.active = this.players.map(() => true);
          this.decided = true;
          C.forEach((c) => c.finishCentre());
          this.go("left");
        }
      } else if (this.step === "left") {
        this.players.forEach((p, i) => {
          if (!live[i] || !this.active[i] || this.ticks[i][2]) return;
          const lean = C[i].leanDegrees();
          if (C[i].climbing && lean > LEFT_DEGREES) {
            this.leaning[i] += dt;
            C[i].leanSum = C[i].leanSum.map((v, k) => v + C[i].up[k] * dt);
          } else this.leaning[i] = Math.max(0, this.leaning[i] - dt);
          if (this.leaning[i] >= LEFT_HOLD) this.ticks[i][2] = true;
        });
        if (this.players.every((p, i) => !live[i] || !this.active[i] || this.ticks[i][2]) || this.stepTime > LEFT_TIMEOUT) {
          C.forEach((c) => c.finishLeft());
          this.leaning = this.players.map(() => 0);
          this.go("right");
        }
      } else if (this.step === "right") {
        // The other way: a lean away from the side they leaned to before (if the left step timed out and
        // "left" is only a guess, a lean either way counts).
        this.players.forEach((p, i) => {
          if (!live[i] || !this.active[i] || this.ticks[i][3]) return;
          const right = C[i].rightDegrees();
          if (C[i].climbing && right > LEFT_DEGREES) {
            this.leaning[i] += dt;
            C[i].rightSum = C[i].rightSum.map((v, k) => v + C[i].up[k] * dt);
          } else this.leaning[i] = Math.max(0, this.leaning[i] - dt);
          if (this.leaning[i] >= LEFT_HOLD) this.ticks[i][3] = true;
        });
        if (this.players.every((p, i) => !live[i] || !this.active[i] || this.ticks[i][3]) || this.stepTime > LEFT_TIMEOUT) {
          C.forEach((c) => c.finishRight());
          this.go("freeze");
        }
      } else if (this.step === "freeze") {
        const still = this.players.every((p, i) => !live[i] || !this.active[i] || C[i].isStill);
        this.stillFor = still ? this.stillFor + dt : 0;
        if (this.stillFor > FREEZE_HOLD || this.stepTime > FREEZE_TIMEOUT) this.go("escape");
      } else if (this.step === "escape") {
        this.progress = clamp(this.stepTime / ESCAPE_SECONDS, 0, 1);
        if (this.progress >= 1) this.go("play");
      }
    }

    // How the tank moves: rocking while they climb in the tank; at the escape, a few hard shoves (tip: how
    // far through the escape: its front pops off and falls).
    tank(t) {
      const sideways = this.step === "left" || this.step === "right";
      const climbing = this.step === "climb" || sideways
        ? this.climbers.reduce((a, c, i) => a + (this.active[i] ? c.effort : 0), 0) / Math.max(1, this.activeCount) : 0;
      const shoving = this.step === "escape" && this.progress < 0.32 ? 0.7 : 0;
      return { rock: Math.sin(t * 9) * climbing * (sideways ? 1.4 : 1) + Math.sin(t * 20) * shoving,
        tip: this.step === "escape" ? this.progress : this.step === "play" ? 1 : 0 };
    }

    // The checklist at the top of the screen, and the big centre text.
    words() {
      const together = this.decided ? this.activeCount > 1 : this.players.filter((p) => p.connected).length > 1;
      const current = { hands: 0, climb: 1, left: 2, right: 3, freeze: 4 }[this.step];
      const lines = [together ? "Both of you: hands up, hold still ✋" : "Hands up, hold still ✋", "Climb on the spot! 🧗", "Climb to the left ⬅", "Climb to the right ➡", "Freeze! 🧊"];
      let list = "";
      if (current !== undefined) {
        list = lines.map((text, i) => {
          if (i < current) return '<div style="opacity:.55;font-size:.62em">✓ ' + text + "</div>";
          if (i === current) return "<div>" + text + "</div>";
          return '<div style="opacity:.4;font-size:.62em">' + text + "</div>";
        }).join("");
      }
      let big = "";
      if (this.step === "left" && this.stepTime < 1.6 && this.players.length > 1 && this.activeCount === 1) big = "Climbing solo!";
      if (this.step === "escape" && this.progress > 0.35) big = together ? "Climb together!" : "Climb!";
      return { list, big };
    }
  }

  // ==========================================================================
  // Visitors: a cat or a crow comes, looks around, and leaves, or catches
  // anyone it sees moving. Each visit is a little play in four acts:
  // arrive → look → (catch) → leave.
  // ==========================================================================
  function chooseSpot(kind, camX, camY, camZ, chams) {
    const list = kind === "cat" ? L().ledges : L().perches;
    const chamsX = chams.reduce((t, c) => t + c.x, 0) / chams.length;
    const side = chamsX > camX ? -1 : 1;                              // the side away from the chameleons
    // A spot in the top part of the view (above the chameleons, where it's easy to see looking about),
    // off to one side, at about the chameleons' depth (not behind the camera, nor far beyond them),
    // and not right on top of a chameleon.
    const clear = (x, y) => chams.every((c) => Math.abs(c.x - x) > VISIT_CLEAR || Math.abs(c.y - y) > 0.25);
    const within = ([from, to]) => list.filter((s) => s.y > camY + from && s.y < camY + to && Math.abs(s.z - camZ) < 0.7)
      .map((s) => ({ s, x: clamp(camX + side * VISIT_ASIDE, Math.min(s.x0 + 0.1, (s.x0 + s.x1) / 2), Math.max(s.x1 - 0.1, (s.x0 + s.x1) / 2)) }))
      .filter((o) => Math.abs(o.x - camX) < 0.9 && clear(o.x, o.s.y));
    let options = within(VISIT_HIGH), aim = camY + (VISIT_HIGH[0] + VISIT_HIGH[1]) / 2;
    if (!options.length) { options = within([-0.55, VISIT_HIGH[0]]); aim = camY; }    // nothing up high here: lower in the view
    if (!options.length) return null;
    options.sort((a, b) => Math.abs(a.s.y - aim) - Math.abs(b.s.y - aim));
    const best = options[0];
    return { x: best.x, y: best.s.y, z: best.s.z, side: Math.sign(best.x - camX) || side };
  }
  const yawToward = (dx, dz) => Math.atan2(-dx, -dz);                // turns a cat or crow (which faces -z) toward a direction
  const arc = (from, to, t, height) => ({
    x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + Math.sin(Math.PI * t) * height, z: from.z + (to.z - from.z) * t
  });

  const between = (bottom, top, wary) => bottom + (top - bottom) * wary;
  // A visit from a cat or a crow. wary: 0 at the bottom of the climb to 1 at the top (see VISIT_EVERY_TOP...).
  class Visit {
    constructor(kind, spot, wary = 0) {
      this.kind = kind; this.spot = spot; this.act = "arrive"; this.t = 0; this.time = 0;
      this.wary = wary; this.lookFor = between(LOOK_SECONDS, LOOK_SECONDS_TOP, wary);
      this.spotAfter = between(SPOT_SECONDS, SPOT_SECONDS_TOP, wary); this.quick = between(1, QUICKER_TOP, wary);
      this.spotted = []; this.victims = []; this.over = false; this.result = null;
      const off = { x: spot.x + spot.side * 1.7, y: spot.y + (kind === "crow" ? 1.0 : 0.45), z: spot.z + 0.2 };
      this.start = off; this.pos = { ...off }; this.yaw = 0;
      this.controls = kind === "cat" ? { mode: "leap", speed: 0, look: 0, hiss: 0, squint: 0.75 } : { mode: "fly", flap: 1, bank: 0, look: null, peck: 0 };
    }
    get looking() { return this.act === "look"; }

    // chams: [{x, y, z, moving, hidden}] for the players taking part. Returns indexes caught this frame.
    update(dt, chams, crowFoot) {
      this.t += dt; this.time += dt;
      const sp = this.spot, caught = [];
      // A cat stands side-on (as in the storyboard), turned a little toward the camera; a crow faces the camera more.
      const faceCamera = this.kind === "cat" ? yawToward(-sp.side, 0.6) : yawToward(-sp.side * 0.35, 1);
      if (this.act === "arrive") {
        const dur = (this.kind === "cat" ? 0.85 : 1.2) / this.quick, k = clamp(this.t / dur, 0, 1);
        const land = { x: sp.x, y: sp.y - (this.kind === "crow" ? crowFoot : 0), z: sp.z };
        this.pos = arc(this.start, land, this.kind === "cat" ? k : smooth(k), this.kind === "cat" ? 0.25 : 0);
        this.yaw = yawToward(land.x - this.start.x, 0.0001);
        if (this.kind === "cat") Object.assign(this.controls, { mode: k < 0.85 ? "leap" : "stand" });
        else Object.assign(this.controls, { mode: k < 0.65 ? "fly" : k < 1 ? "land" : "perch", flap: k < 0.65 ? 1 : 0 });
        if (k >= 1) { this.act = "look"; this.t = -(WARNING - dur); if (this.kind === "crow") this.cawNow = true; }
      } else if (this.act === "look") {
        // A cat strolls along its ledge a little, then stops; both look about, side to side.
        const look = (this.t < 0 ? 0 : this.t) * LOOK_SECONDS / this.lookFor;   // (in the slowest visit's seconds)
        if (this.kind === "cat") {
          const walking = look > 0.9 && look < 2.1;
          if (walking) this.pos.x += -sp.side * 0.12 * dt;
          Object.assign(this.controls, { mode: walking ? "walk" : look > 2.1 ? "sit" : "stand", speed: 0.5, look: Math.sin(this.time * 1.7) * 0.9, squint: 0.75 });
          this.yaw += ((walking ? yawToward(-sp.side, 0.25) : faceCamera) - this.yaw) * Math.min(1, dt * 5);
        } else {
          this.controls.look = Math.sin(this.time * 1.3) > 0 ? 0.9 : -0.9;
          this.yaw += (faceCamera - this.yaw) * Math.min(1, dt * 5);
          if (this.kind === "crow") this.pos.y = sp.y - crowFoot;
        }
        if (this.t >= 0) {
          chams.forEach((c, i) => {
            if (!c || this.victims.includes(i)) return;
            this.spotted[i] = c.moving ? (this.spotted[i] || 0) + dt : 0;
            if (this.spotted[i] >= this.spotAfter) { this.victims.push(i); }
          });
          if (this.victims.length) { this.act = "pounce"; this.t = 0; this.from = { ...this.pos }; this.result = "caught"; }
          else if (this.t >= this.lookFor) { this.act = "leave"; this.t = 0; this.from = { ...this.pos }; this.result = "hidden"; }
        }
      } else if (this.act === "pounce") {
        const target = chams[this.victims[0]] || { x: this.from.x, y: this.from.y, z: this.from.z };
        const crouch = this.kind === "cat" ? 0.35 : 0.15, fly = 0.42;
        if (this.t < crouch) {
          if (this.kind === "cat") Object.assign(this.controls, { mode: "crouch", hiss: 1, squint: 0, look: 0 });
          else Object.assign(this.controls, { mode: "perch", look: 0 });
          this.yaw += (yawToward(target.x - this.from.x, 0.25) - this.yaw) * Math.min(1, dt * 10);
          this.aim = { x: target.x, y: target.y - (this.kind === "cat" ? 0.12 : 0.05), z: target.z + 0.1 };
        } else {
          const k = clamp((this.t - crouch) / fly, 0, 1);
          this.pos = arc(this.from, this.aim, k, this.kind === "cat" ? 0.18 : 0.05);
          if (this.kind === "cat") Object.assign(this.controls, { mode: "leap", hiss: 1 });
          else Object.assign(this.controls, { mode: "land", flap: 0, peck: k > 0.7 ? 1 : 0 });
          if (k >= 1 && !this.struck) { this.struck = true; caught.push(...this.victims); }
          if (k >= 1 && this.t > crouch + fly + 0.25) { this.act = "leave"; this.t = 0; this.from = { ...this.pos }; }
        }
      } else if (this.act === "leave") {
        // Away off the side of the screen (a cat leaps; a crow flies up and away).
        const dur = (this.kind === "cat" ? 0.8 : 1.1) / this.quick, k = clamp(this.t / dur, 0, 1);
        const to = { x: this.from.x + sp.side * 1.9, y: this.from.y + (this.kind === "cat" ? 0.1 : 1.2), z: this.from.z + 0.1 };
        this.pos = arc(this.from, to, k, this.kind === "cat" ? 0.3 : 0);
        this.yaw += (yawToward(sp.side, 0.0001) - this.yaw) * Math.min(1, dt * 8);
        if (this.kind === "cat") Object.assign(this.controls, { mode: k < 0.15 ? "crouch" : "leap", hiss: 0, squint: 0.75 });
        else Object.assign(this.controls, { mode: "fly", flap: 1, peck: 0, look: null });
        if (k >= 1) this.over = true;
      }
      return caught;
    }

    // What the 3D scene needs to draw it.
    view() {
      return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, roll: 0, controls: this.controls };
    }
  }

  // ==========================================================================
  // The game
  // ==========================================================================
  HG.registerGame({
    key: 2,
    name: "Climb Together",
    icon: "🦎",
    colour: "#2a9a5a",
    howTo: "Hands up! Climb on the spot! Lean to steer!\nWhen a cat or crow comes: FREEZE and hide!\nStay close together.",
    introArt: "games/art/climb-together-pose.svg",   // two players, hands up, sensor on the wrist
    menuArt: "games/art/climb-together-menu.jpg",
    fullScreen: true,
    needs: "motion",
    roundSeconds: ROUND_SECONDS,
    countdown: false,                // the tank has its own start
    clock: "manual",                 // the clock starts at the escape
    warmUp: () => HG.climb3d.warmUp(),   // (gets the 3D climb ready in the background while the sensors connect)

    start(ctx) {
      const s = ctx.state, lv = L();
      s.climbers = ctx.players.map((p) => new Climber(p));
      s.launch = new Escape(ctx.players, s.climbers);
      s.time = 0; s.playTime = 0; s.clockStarted = false;
      s.chams = ctx.players.map((p, i) => ({
        p, x: (i === 0 ? -0.11 : 0.11), y: lv.START_Y, z: lv.TANK.z0 + 0.02, s: 0, key: null, pitch: 0, leap: null,
        vx: 0, vy: 0, camo: 0, stillFor: 0, fall: null, spin: 0,
        colour: F.playerColour(ctx.stage, p), hides: 0, caughtCount: 0, reached: false
      }));
      s.cam = { x: 0, y: lv.START_Y + 0.25, z: lv.surface(lv.START_Y), dist: 1.6 };
      s.zoom = 1; s.zoomHold = 0; s.visit = null; s.nextVisit = FIRST_VISIT; s.msgText = ""; s.messageFor = 0;
      s.hidden = 0; s.caught = 0; s.best = lv.START_Y; s.togetherTime = 0; s.won = false; s.wonAt = 0; s.gapWarn = 0;
      s.view = 0; s.viewTime = 0; s.hearts = []; s.heartsDue = 0; s.closeFor = 0;
      Object.assign(s, F.makeStage(ctx,
        '<span class="ct-height"></span>' +
        '<span style="text-align:right"><span class="ct-badge" style="display:block"></span>' +
        '<span class="ct-score" style="display:block;font-size:.65em;opacity:.9"></span></span>'));
      s.heightEl = ctx.stage.querySelector(".ct-height");
      s.badgeEl = ctx.stage.querySelector(".ct-badge");
      s.scoreEl = ctx.stage.querySelector(".ct-score");
      s.scene = HG.climb3d.get();
      s.scene.begin(s.viewEl, s.chams.map((c) => c.colour));
    },

    update(ctx, dt) {
      const s = ctx.state, E = s.launch, lv = L();
      s.time += dt;
      s.climbers.forEach((c) => c.update(dt));
      if (ctx.phase === "playing" && !s.won) E.update(dt);
      if (E.step === "escape" && !s.clockStarted) { ctx.startClock(); s.clockStarted = true; }
      const playing = E.playing && !s.won;
      if (playing) s.playTime += dt;
      const active = E.active, solo = E.solo;
      const team = s.chams.filter((c, i) => active[i]);

      // ---- Each chameleon: climb, steer, hide, or slide back down after a fall ----
      s.chams.forEach((c, i) => {
        const climber = s.climbers[i], live = c.p.connected;
        c.vx = 0; c.vy = 0;
        if (!active[i] && E.decided) { c.hidden = true; return; }
        c.hidden = false;
        // The chameleon moves along its route (level.route: up the books, over the shelf edges, back
        // across the shelf tops...), so `s` is how far it has climbed; its height and depth come from that.
        if (c.fall) {                                                    // sliding back down, legs flailing
          c.leap = null;
          c.fall.t += dt;
          const k = clamp(c.fall.t / FALL_SECONDS, 0, 1);
          const sNow = c.fall.from + (c.fall.to - c.fall.from) * (k * k * (3 - 2 * k));
          c.vy = (sNow - c.s) / Math.max(dt, 1e-3); c.s = sNow;
          c.spin = Math.sin(k * Math.PI) * 0.9 * c.fall.dir;
          if (k >= 1) { c.fall = null; c.spin = 0; }
        } else if (c.leap) {                                             // mid-leap: it carries on, whatever the player does
          c.leap.t = Math.min(1, c.leap.t + dt / HG.Chameleon.LEAP_SECONDS);
          c.s = c.leap.s0 + (c.leap.s1 - c.leap.s0) * HG.Chameleon.leapPath(c.leap.t).along;
          if (c.leap.t >= 1) { c.s = c.leap.s1 + 0.001; c.leap = null; }
        } else if (s.won && !c.sat) {                                   // the end: on up by themselves to the bough at the very top
          const spot = lv.LOOKOUT.x + (solo ? 0 : (i === 0 ? -1 : 1) * FINALE_SPOTS);
          c.vx = Math.abs(spot - c.x) < 0.01 ? 0 : clamp((spot - c.x) * 3, -0.3, 0.3);
          c.x = c.vx ? c.x + c.vx * dt : spot;
          if (lv.routeKey(c.x) !== c.key) { c.key = lv.routeKey(c.x); c.s = lv.project(c.x, c.y, c.z); }
          const route = lv.route(c.x), end = route[route.length - 1].s;
          c.vy = FINALE_SPEED * clamp((end - c.s) / FINALE_SLOW, 0.25, 1);  // slowing down as they get there
          c.s = Math.min(end, c.s + c.vy * dt);
          if (c.s >= end && !c.vx) { c.sat = true; c.vy = 0; }           // sitting: from now on it stays perfectly still
        } else if (playing && !c.reached) {
          if (live) {
            const others = team.filter((o) => o !== c);
            const together = !solo && others.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < TOGETHER_NEAR) ? 1 : 0;
            const speed = CLIMB_SPEED * climber.effort * (1 + TOGETHER_BOOST * together);
            const lean = climber.lean();
            c.vx = speed * lean * SIDEWAYS; c.vy = speed * (1 - 0.35 * Math.abs(lean));
          } else if (!solo) {
            // A player whose sensor drops out: their chameleon tags along just behind its friend.
            const friend = team.find((o) => o !== c);
            if (friend) { c.vy = clamp((friend.s - 0.3 - c.s) * 2, -0.3, 0.3); c.vx = clamp((friend.x - 0.2 - c.x) * 2, -0.3, 0.3); }
          }
          // Sideways: stay on the climbable strip (or inside the tank, until they leap out of it). Moving onto
          // a different book or pot changes the route a little, so find the same spot on the new one.
          const half = lv.half(c.y), centre = lv.centre(c.y), T = lv.TANK, inTank = c.y < T.y1 && c.z < T.z1;
          c.x = clamp(c.x + c.vx * dt, inTank ? T.x0 + 0.07 : centre - half, inTank ? T.x1 - 0.07 : centre + half);
          if (lv.routeKey(c.x) !== c.key) { c.key = lv.routeKey(c.x); c.s = lv.project(c.x, c.y, c.z); }
          c.s = Math.max(0, c.s + c.vy * dt);
          // A gap it can't climb (books to the shelf edge above, a plant or the wall to the sill): leap.
          const here = lv.at(c.x, c.s);
          if (here.leap && c.vy > 0) {
            c.leap = { s0: here.from.s, s1: here.to.s, t: 0 }; c.s = here.from.s;
            c.leapNow = true;
          }
        }
        // Where that puts it, and how it tilts: following the surface (tipping over edges a little before
        // it gets there), or in a leap, reaching up and out along the jump and lifting off the surface.
        const at = lv.at(c.x, c.s);
        let pitchTo = lv.tilt(c.x, c.s), lift = 0;
        if (c.leap) {
          const a = at.from, b = at.to;
          pitchTo = Math.atan2(b.z - a.z, b.y - a.y) * 0.4;
          lift = HG.Chameleon.leapPath(c.leap.t).lift * LEAP_LIFT;
        }
        c.pitch = c.pitch == null ? pitchTo : c.pitch + (pitchTo - c.pitch) * Math.min(1, dt * TILT_SPEED);
        c.y = at.y; c.z = at.z + lift;
        if (c.y >= lv.TOP && !c.reached) c.reached = true;
        // Hiding: holding still for a moment turns on the camouflage.
        c.stillFor = climber.isStill && live ? c.stillFor + dt : 0;
        c.camo = !c.fall && !s.won && c.stillFor > HIDE_AFTER && (E.playing || E.step === "freeze" || E.step === "escape") ? 1 : 0;
      });

      // Two chameleons side by side don't overlap: they nudge apart.
      const [a, b] = s.chams;
      if (!solo && active[0] && active[1] && Math.abs(a.y - b.y) < 0.25 && Math.abs(a.x - b.x) < 0.2) {
        const push = (0.2 - Math.abs(a.x - b.x)) * 0.5, dir = Math.sign(b.x - a.x) || 1;
        a.x -= dir * push * Math.min(1, dt * 8); b.x += dir * push * Math.min(1, dt * 8);
      }

      // ---- Staying together: one too far ahead loses its grip and slides back to its friend ----
      s.gapWarn = 0;
      if (playing && !solo && active[0] && active[1] && a.p.connected && b.p.connected && !a.fall && !b.fall && !a.leap && !b.leap) {
        const [top, bottom] = a.s > b.s ? [a, b] : [b, a];
        const gap = top.s - bottom.s;                                   // how far apart along the climb
        if (gap > GAP_WARN && !top.reached) s.gapWarn = top === a ? 1 : 2;
        if (gap > GAP_MAX && !top.reached) {
          top.fall = { t: 0, from: top.s, to: bottom.s + REJOIN_ABOVE, dir: Math.sign(top.x - bottom.x) || 1 };
          say(s, "Oops! Wait for your friend!", 2);
        }
      }

      // ---- The escape: the chameleons inside the tank, then out onto the shelf ----
      const tank = E.tank(s.time);
      s.chams.forEach((c, i) => {
        if (E.step === "play") return;
        // In the tank: on its back glass, just in front of the books, where its climb starts.
        if (E.step !== "escape") { c.x = (i === 0 ? -0.11 : 0.11) + (E.solo ? (i === 0 ? 0.11 : -0.11) : 0); }
        c.key = lv.routeKey(c.x); c.s = lv.project(c.x, lv.START_Y, lv.BAYS[0].front);
        c.y = lv.START_Y; c.pitch = 0;
        const inside = lv.TANK.z0 + 0.02, out = lv.at(c.x, c.s).z;
        c.z = E.step === "escape" ? inside + (out - inside) * smooth(E.progress * 2) : inside;
        if (E.step === "climb" || E.step === "left" || E.step === "right") {   // climbing on the spot in the tank: legs going, not moving
          const e = s.climbers[i].effort, cl = s.climbers[i];
          const leaning = E.step === "left" ? cl.leanDegrees() > LEFT_DEGREES : E.step === "right" && cl.rightDegrees() > LEFT_DEGREES;
          c.vy = e * 0.15; c.vx = leaning ? (E.step === "left" ? -0.08 : 0.08) * e : 0;
        } else if (E.step === "escape" && E.progress < 0.32) c.vy = 0.12;   // (scrabbling as they shove the front)
      });

      // ---- Visits from a cat or a crow ----
      if (playing && !s.visit && s.playTime > s.nextVisit && !team.some((c) => c.fall)) {
        const kind = s.cam.y > CROWS_ABOVE ? "crow" : "cat";
        const spot = chooseSpot(kind, s.cam.x, s.cam.y, s.cam.z, team);
        const height = team.reduce((t, c) => t + c.y, 0) / team.length, wary = clamp((height - lv.START_Y) / (lv.TOP - lv.START_Y), 0, 1);
        if (spot) { s.visit = new Visit(kind, spot, wary); say(s, kind === "cat" ? "🐱 A cat! FREEZE!" : "🐦 A crow! FREEZE!", WARNING + 0.6); }
        else s.nextVisit = s.playTime + 2;                            // nowhere for it to stand just here: try again soon
      }
      if (s.visit) {
        const v = s.visit, crowFoot = s.scene.crow ? s.scene.crow.footHeight() * HG.climb3d.CROW_SPAN : 0;
        const seen = s.chams.map((c, i) => (active[i] && !c.fall && !c.reached
          ? { x: c.x, y: c.y, z: c.z, moving: !s.climbers[i].isStill } : null));
        const caughtNow = v.update(dt, seen, crowFoot);
        if (v.cawNow) { v.cawNow = false; s.scene.crow.caw(); }
        for (const i of caughtNow) {
          const c = s.chams[i];
          c.fall = { t: 0, from: c.s, to: Math.max(0.15, c.s - FALL_BACK), dir: Math.sign(c.x - v.pos.x) || 1 };
          c.caughtCount++; s.caught++;
          s.zoomHold = 2.2;
          say(s, v.kind === "cat" ? "Caught by the cat! 🙀" : "Caught by the crow!", 1.8);
        }
        if (v.result === "hidden" && !v.thanked) {
          v.thanked = true; s.hidden++; s.chams.forEach((c, i) => { if (active[i]) c.hides++; });
          say(s, "Phew! You hid! 🦎", 1.6);
        }
        if (v.over) {
          const from = between(VISIT_EVERY[0], VISIT_EVERY_TOP[0], v.wary), to = between(VISIT_EVERY[1], VISIT_EVERY_TOP[1], v.wary);
          s.visit = null; s.nextVisit = s.playTime + from + Math.random() * (to - from);
        }
      }

      // ---- The top: when everyone playing has reached it, they climb on up to the very top, the view
      // turns out over the valley, and then the photo ----
      if (E.playing && !s.won && team.length && team.every((c) => c.reached)) {
        s.won = true; s.wonAt = s.time; s.visit = null; s.viewTime = 0; s.satFor = 0;
        team.forEach((c) => { c.fall = null; c.spin = 0; c.sat = false; });
        say(s, solo ? "You made it to the top! 🎉" : "You made it together! 🎉", 2.4);
      }
      if (s.won) {
        if (team.every((c) => c.sat)) s.satFor += dt;
        s.viewTime = Math.max(0, s.satFor - SIT_SECONDS);
        s.view = clamp(s.viewTime / VIEW_SECONDS, 0, 1);
        if (s.viewTime > VIEW_SECONDS + VIEW_HOLD || s.time - s.wonAt > 15) { ctx.endRound(); return; }
      }

      // ---- Score keeping ----
      if (playing && team.length) {
        s.best = Math.max(s.best, Math.min(...team.map((c) => c.y)));
        if (!solo && Math.abs(a.y - b.y) < TOGETHER_NEAR * 1.3) s.togetherTime += dt;
      }

      // ---- Camera: level, rising with the chameleons, pulling back to keep both in view ----
      const size = F.fitCanvas(s.overlay, s.g);
      if (!size) return;
      const [w, h] = size, g = s.g;
      const shown = team.length ? team : s.chams;
      const ys = shown.map((c) => c.y), xs = shown.map((c) => c.x);
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2, spread = Math.max(...ys) - Math.min(...ys);
      const inTank = !E.playing && E.step !== "escape";
      const camY = inTank ? lv.START_Y + 0.12 : s.won ? midY + 0.12 : Math.min(lv.TOP + 0.05, midY + 0.12);
      s.cam.y = ease(s.cam.y, camY, 2.2, dt);
      s.cam.x = ease(s.cam.x, (xs.reduce((t, x) => t + x, 0) / xs.length) * 0.7 + lv.centre(s.cam.y) * 0.3, 2, dt);
      // How deep the view looks: follows the chameleons, so it goes in through the window after them.
      const camZ = inTank ? lv.surface(s.cam.y) : shown.reduce((t, c) => t + c.z, 0) / shown.length;
      s.cam.z = ease(s.cam.z, camZ, CAM_DEPTH_SPEED, dt);
      s.zoomHold = Math.max(0, s.zoomHold - dt);
      const zoomOut = s.zoomHold > 0 || shown.some((c) => c.fall) ? FALL_ZOOM : 1;
      s.zoom = ease(s.zoom, zoomOut, zoomOut > s.zoom ? 4 : 1.2, dt);
      const span = (inTank ? 0.95 : Math.max(VIEW_HEIGHT, spread + 0.9)) * s.zoom;
      s.cam.dist = ease(s.cam.dist, s.scene.distanceFor(span), 3, dt);

      // ---- Draw the 3D world ----
      const v = s.visit;
      s.scene.frame({
        cam: s.cam, tank, shake: 0, view: s.won ? s.view : 0,
        chams: s.chams.map((c) => ({
          x: c.x, y: c.y, z: c.z, pitch: c.pitch, s: E.playing && !c.leap ? c.s : null, vx: c.vx, vy: c.vy, camo: c.camo, fall: c.fall ? 1 : 0, spin: c.spin, hidden: c.hidden,
          leapNow: c.leapNow ? !(c.leapNow = false) : false,               // (starts the leap animation once)
          lookAt: v && !c.leap ? { x: v.pos.x, y: v.pos.y + 0.15, z: v.pos.z }
            : s.won && c.sat ? { x: c.x, y: c.y - 2, z: c.z - 20 } : null   // (at the very top: gazing out over the valley)
        })),
        cat: v && v.kind === "cat" ? v.view() : null,
        crow: v && v.kind === "crow" ? v.view() : null
      });      const spots = s.scene.chamScreen;

      // ---- Effects on top: hearts when close, ticks in the tank, "!" over anyone moving ----
      // Hearts trail out from between them while they climb close together, more the longer they stay close.
      const close = playing && !solo && active[0] && active[1] && !a.fall && !b.fall && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < HEARTS_NEAR;
      s.closeFor = close ? s.closeFor + dt : 0;
      if (close) {
        s.heartsDue += Math.min(HEARTS_MAX, HEARTS_START + HEARTS_PER_SECOND * s.closeFor) * dt;
        const mid = { x: (spots[0].x + spots[1].x) / 2, y: (spots[0].y + spots[1].y) / 2, size: (spots[0].size + spots[1].size) / 2 };
        for (; s.heartsDue >= 1; s.heartsDue--) s.hearts.push(newHeart(mid, h));
      }
      s.hearts = s.hearts.filter((heart) => moveHeart(heart, dt) < 1);
      if (!s.won) for (const heart of s.hearts) drawHeart(g, heart);
      const words = E.words();
      if (!E.playing && E.step !== "escape" && !words.big) {
        spots.forEach((spot, i) => { if (active[i] && !s.chams[i].hidden) F.drawTicks(g, spot.x, spot.y - spot.size * 0.5, clamp(spot.size * 0.7, 40, h * 0.16), E.ticks[i], s.chams[i].colour); });
      }
      if (v && v.looking && v.t >= 0) {
        spots.forEach((spot, i) => {
          if (!active[i] || !(v.spotted[i] > 0)) return;
          g.save(); g.font = "900 " + Math.round(h * 0.09) + "px system-ui, sans-serif"; g.textAlign = "center";
          g.fillStyle = "#ff3b3b"; g.strokeStyle = "#fff"; g.lineWidth = 6;
          g.strokeText("!", spot.x, spot.y - spot.size * 0.7); g.fillText("!", spot.x, spot.y - spot.size * 0.7); g.restore();
        });
      }
      if (s.gapWarn) {
        const spot = spots[s.gapWarn - 1];
        g.save(); g.font = "800 " + Math.round(h * 0.035) + "px system-ui, sans-serif"; g.textAlign = "center";
        g.fillStyle = s.chams[s.gapWarn - 1].colour; g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 5;
        g.strokeText("Wait for your friend!", spot.x, spot.y - spot.size * 0.8); g.fillText("Wait for your friend!", spot.x, spot.y - spot.size * 0.8); g.restore();
      }

      // ---- Words on screen ----
      s.messageFor = Math.max(0, s.messageFor - dt);
      const big = words.big || (s.messageFor > 0 ? s.msgText : "");
      if (s.list.innerHTML !== words.list) s.list.innerHTML = words.list;
      if (s.shownText !== big) {
        s.shownText = big; s.message.innerHTML = big;
        s.message.style.fontSize = big.length > 14 ? "clamp(2rem,6vw,5.5rem)" : "";   // long messages a little smaller
      }
      const top = team.length ? Math.max(...team.map((c) => c.y)) : 0;
      s.heightEl.textContent = E.playing ? top.toFixed(1) + " m" : "";
      s.badgeEl.textContent = !E.playing ? "" : s.won ? "🎉" : v ? "" : solo ? "" : Math.abs(a.y - b.y) < TOGETHER_NEAR * 1.3 && Math.abs(a.x - b.x) < 0.6 ? "Together! ✨" : "";
      s.scoreEl.textContent = E.playing ? "Hidden: " + s.hidden + " · Caught: " + s.caught : "";
    },

    cleanup() {
      HG.climb3d.get().detach();
    },

    end(ctx) {
      const s = ctx.state, E = s.launch, lv = L(), solo = E.solo;
      const reached = s.won ? "the top of the giant tree!" : lv.section(s.best).name;
      const played = Math.max(1, s.playTime);
      const result = {
        solo, soloPlayer: E.soloIndex + 1, won: s.won, height: s.best.toFixed(1), reached,
        hidden: s.hidden, caught: s.caught, together: Math.round(s.togetherTime / played * 100),
        headline: s.won ? (solo ? "You climbed to the top!" : "You climbed to the top together!") : "You climbed " + s.best.toFixed(1) + " m" + (solo ? "!" : " together!"),
        detail: "You reached " + reached + " · Hid from " + s.hidden + " · Caught " + s.caught
      };
      try {
        const spots = s.scene.chamScreen.filter((spot, i) => E.active[i]);
        const size = Math.max(60, ...spots.map((spot) => spot.size));
        const xs = spots.map((spot) => spot.x), ys = spots.map((spot) => spot.y);
        // (at the very top, the setting sun goes in the photo too, with room for its glow)
        const sun = s.won && s.scene.sunScreen;
        if (sun) { xs.push(sun.x - size * 0.6, sun.x + size * 0.6); ys.push(sun.y - size * 0.6); }
        const focus = { x: Math.min(...xs) - size * 0.8, y: Math.min(...ys) - size * 0.7 };
        focus.w = Math.max(...xs) + size * 0.8 - focus.x; focus.h = Math.max(...ys) + size * 0.8 - focus.y;
        result.photo = HG.photoFinish.take([s.scene.snapshot(PHOTO_SHARPNESS), s.overlay], s.viewEl, focus);
      } catch (err) {
        console.warn("[heartbeat] Climb Together couldn't take the end photo:", err);
      }
      return result;
    },

    // The results screen: the photo on the right, the story and the numbers on the left.
    showResults(el, r) {
      if (!r.photo) throw new Error("no photo was taken");
      const accent = r.solo ? "var(--p" + r.soloPlayer + ")" : "linear-gradient(90deg, var(--p1), var(--p2))";
      const value = (text) => '<span style="background:' + accent + ';-webkit-background-clip:text;background-clip:text;color:transparent;text-transform:none">' + text + "</span>";
      const words =
        '<p style="font-size:clamp(1.3rem,2.6vw,2.6rem);line-height:1.15">' +
          (r.solo ? "Just one chameleon<br>climbing to<br>freedom" : "Just two chameleons<br>climbing to freedom<br>together") + "</p>" +
        '<p style="font-size:clamp(1.3rem,2.6vw,2.6rem);line-height:1;margin-top:2vh">' + (r.won ? "You made it to" : "You climbed") + "</p>" +
        '<p style="font-size:clamp(3.5rem,9vw,8.5rem);line-height:.9;letter-spacing:-.02em;text-transform:none">' + value(r.won ? "The top!" : r.height + "m") + "</p>" +
        '<p style="font-size:clamp(1.1rem,2.3vw,2.2rem);line-height:1.4;margin-top:2vh">' +
          "Hid from : " + value(r.hidden + (r.hidden === 1 ? " visitor" : " visitors")) + "<br>" +
          "Caught : " + value(String(r.caught)) + "<br>" +
          (r.won ? "" : "Reached : " + value(r.reached)) + "</p>";
      HG.photoFinish.show(el, r.photo, words, {
        freeze: PHOTO_FREEZE, zoomIn: PHOTO_ZOOM_IN, hold: PHOTO_HOLD, pullBack: PHOTO_PULL_BACK,
        maxZoom: PHOTO_MAX_ZOOM, tilt: PHOTO_TILT_DEGREES
      });
    }
  });

  // A big message in the middle of the screen for a few seconds.
  function say(s, text, seconds) { s.msgText = text; s.messageFor = seconds; }

  // A little heart (as in Fly Together's): it starts just behind the chameleons, between them, and drifts
  // down behind them in one gently wavering stream, growing a little and fading.
  function newHeart(from, h) {
    return {
      x: from.x, y: from.y + from.size * 0.25, age: 0, life: HEART_SECONDS * (0.8 + Math.random() * 0.4),
      vx: h * (Math.random() - 0.5) * 0.02, vy: h * (0.07 + Math.random() * 0.03), fall: h * 0.08,
      wobble: 3 + Math.random() * 2, sway: h * 0.03, start: from.size * 0.06, end: from.size * (0.16 + Math.random() * 0.12)
    };
  }
  // Moves one along; returns how far through its life it is (0 to 1).
  function moveHeart(p, dt) {
    p.age += dt; p.vy += p.fall * dt;
    p.x += p.vx * dt + Math.sin(p.age * p.wobble) * p.sway * dt; p.y += p.vy * dt;
    return p.age / p.life;
  }
  function drawHeart(g, p) {
    const t = p.age / p.life, s = (p.start + (p.end - p.start) * Math.pow(Math.min(1, t * 1.6), 0.8)) / 2, { x, y } = p;
    g.save();
    g.globalAlpha = t > 0.6 ? (1 - t) / 0.4 : 1;
    g.fillStyle = "#fff"; g.shadowColor = "rgba(120,30,60,0.35)"; g.shadowBlur = s * 0.6;
    g.beginPath();
    g.moveTo(x, y + s * 0.95);
    g.bezierCurveTo(x - s * 1.7, y - s * 0.15, x - s * 0.65, y - s * 1.45, x, y - s * 0.45);
    g.bezierCurveTo(x + s * 0.65, y - s * 1.45, x + s * 1.7, y - s * 0.15, x, y + s * 0.95);
    g.fill();
    g.restore();
  }
})();
