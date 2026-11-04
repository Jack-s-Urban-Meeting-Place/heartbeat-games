// ============================================================================
// games/lib/flight.js: shared gameplay for the flying games
// ----------------------------------------------------------------------------
// The winding valley (its shape, width and mountains), the wings calibration,
// and the nest launch sequence. Used by Valley Flight and Fly Together.
// The 3D drawing lives in games/lib/flight3d.js. Load this file first.
// ============================================================================
HG.flight = (function () {
  // ---- Steering feel (shared by both games) ----------------------------------
  const MAX_BANK_DEGREES = 35;       // this much tilt = full steering
  const DEADZONE_DEGREES = 4;        // tiny wobbles don't steer
  // ----------------------------------------------------------------------------

  const BIRD_AHEAD = 11;             // the birds fly this far in front of the camera (metres)

  // ---- Small maths helpers ----------------------------------------------------
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (v) => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
  const perpendicular = (v, to) => { const k = dot(v, to); return [v[0] - k * to[0], v[1] - k * to[1], v[2] - k * to[2]]; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, alpha = 1) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";


  // A fresh, smoothly winding valley each round, made from a few gentle waves.
  // The valley floor narrows the farther you fly: from startHalfWidth to
  // endHalfWidth (metres either side of the river) over narrowOver metres, then
  // keeps narrowing, more and more slowly, toward minHalfWidth (if given).
  function makeWorld(options = {}) {
    const startHalf = options.startHalfWidth || 17, endHalf = options.endHalfWidth || 9;
    const narrowOver = options.narrowOver || 2400;
    const minHalf = Math.min(endHalf, options.minHalfWidth || endHalf);
    const r = Math.random;
    const waves = [
      { amp: 11, len: 430, phase: r() * 7 },
      { amp: 5.5, len: 240, phase: r() * 7 },
      { amp: 2.5, len: 140, phase: r() * 7 }
    ];
    const peaks = [{ len: 197, phase: r() * 7 }, { len: 83, phase: r() * 7 }, { len: 37, phase: r() * 7 }];
    return {
      seed: Math.floor(r() * 1e6),
      // Where the river runs, left to right, at distance z. Bends get stronger the farther you fly.
      centre(z) {
        const strength = Math.min(1, 0.35 + Math.max(0, z) / 2600);
        return waves.reduce((sum, w) => sum + w.amp * Math.sin(z / w.len * Math.PI * 2 + w.phase), 0) * strength;
      },
      // Half the width of the valley floor at distance z.
      halfWidth(z) {
        if (z <= narrowOver) return startHalf + (endHalf - startHalf) * Math.max(0, z) / narrowOver;
        // Past narrowOver: carry on at the same pace at first, then ease off so it never quite reaches minHalf.
        const room = endHalf - minHalf, pace = (startHalf - endHalf) / narrowOver;
        return room > 0 ? endHalf - room * (1 - Math.exp(-(z - narrowOver) * pace / room)) : endHalf;
      },
      // How tall the ridge is on one side (-1 left, +1 right) at distance z.
      height(z, side) {
        const s = side < 0 ? 0 : 3.1;
        return 34 + 14 * Math.sin(z / peaks[0].len * 6.28 + peaks[0].phase + s)
                  + 8 * Math.sin(z / peaks[1].len * 6.28 + peaks[1].phase + s * 1.7)
                  + 4 * Math.abs(Math.sin(z / peaks[2].len * 6.28 + peaks[2].phase + s * 2.3));
      }
    };
  }

  // Which player flies: Player 1, or Player 2 if only they are connected.
  function pilot(players) {
    return players.find((p) => p.connected) || players[0];
  }

  // ---- Wings: learns "level" and "left" for one sensor, then reads the bank ----
  class Wings {
    constructor() { this.levelSamples = []; this.level = null; this.bestLean = null; this.left = null; }
    learnLevel(up) { this.levelSamples.push(up); }
    finishLevel(up) {
      const sum = this.levelSamples.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
      this.level = norm(this.levelSamples.length ? sum : up);
    }
    learnLean(up) {
      const lean = perpendicular(up, this.level);
      if (!this.bestLean || Math.hypot(...lean) > Math.hypot(...this.bestLean)) this.bestLean = lean;
    }
    finishLean() {
      if (this.bestLean && Math.hypot(...this.bestLean) > Math.sin(10 * Math.PI / 180)) {
        this.left = norm(this.bestLean);
      } else {
        // No clear lean: guess, using the sensor axis most at right angles to "up".
        const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const guess = axes.reduce((best, a) => Math.abs(dot(a, this.level)) < Math.abs(dot(best, this.level)) ? a : best);
        this.left = norm(perpendicular(guess, this.level));
      }
    }
    // -1 (full left) to +1 (full right).
    bank(up) {
      if (!this.level || !this.left) return 0;
      let bank = -Math.atan2(dot(up, this.left), dot(up, this.level)) * 180 / Math.PI;
      bank = Math.abs(bank) < DEADZONE_DEGREES ? 0 : bank - Math.sign(bank) * DEADZONE_DEGREES;
      return clamp(bank / (MAX_BANK_DEGREES - DEADZONE_DEGREES), -1, 1);
    }
  }

  // ==========================================================================
  // The nest launch: the birds start in a nest on a branch, calibrate their
  // wings with a short checklist, count down, then take off into the valley.
  // Each step waits for the players (with time limits), and "Get ready" only
  // begins once everyone's wings are back to level, so nobody launches leaning.
  // ==========================================================================
  const LEVEL_HOLD = 1.5;            // seconds of steady wings to pass step 1
  const STEADY_ENERGY = 0.35;        // below this much movement counts as steady
  const LEAN_DEGREES = 15;           // a lean this big passes step 2...
  const LEAN_HOLD = 0.4;             // ...when held this long
  const LEVEL_TIMEOUT = 9, LEAN_TIMEOUT = 8, READY_TIMEOUT = 5;   // steps never wait longer than this
  const COUNT_SECONDS = 3;           // 3, 2, 1
  // Who's playing: a player who never tilts left is left out (their sensor is
  // probably lying on a table). If their sensor has barely moved at all since
  // the round began, the others don't wait long; otherwise they wait a little.
  const STILL_ENERGY = 0.2;          // a sensor that never moved more than this is "on the table"
  const TABLE_WAIT = 1.2;            // seconds to wait for a sensor on the table
  const SLOW_WAIT = 5;               // seconds to wait for a player who moved but hasn't tilted yet
  const LAUNCH_SECONDS = 3.2;        // the take-off animation

  const smooth = (x) => x * x * (3 - 2 * x);

  class Launch {
    constructor(players, wings) {
      this.players = players; this.wings = wings;
      this.step = "level"; this.stepTime = 0; this.progress = 0;
      this.done = players.map(() => false); this.ticks = players.map(() => [false, false]);
      this.held = players.map(() => 0); this.leaning = players.map(() => 0); this.readyHeld = 0;
      this.active = players.map(() => true);           // who's playing (decided after the lean step)
      this.decided = false; this.firstLean = null;
      this.peakEnergy = players.map(() => 0);           // the most each sensor has moved this round
    }
    get flying() { return this.step === "fly"; }
    go(step) { this.step = step; this.stepTime = 0; this.done = this.players.map(() => false); }

    update(dt) {
      this.stepTime += dt;
      const live = this.players.map((p) => p.connected);
      this.players.forEach((p, i) => { if (live[i]) this.peakEnergy[i] = Math.max(this.peakEnergy[i], p.energy()); });
      if (this.step === "level") {
        this.players.forEach((p, i) => {
          if (!live[i]) { this.done[i] = true; return; }        // a missing player doesn't hold others up
          if (this.done[i]) return;
          if (p.energy() < STEADY_ENERGY) {
            this.held[i] += dt;
            if (this.held[i] > 0.4) this.wings[i].learnLevel(p.up());
          } else {
            this.held[i] = Math.max(0, this.held[i] - dt * 2);
          }
          if (this.held[i] >= LEVEL_HOLD) { this.done[i] = true; this.ticks[i][0] = true; }
        });
        if (this.done.every(Boolean) || this.stepTime > LEVEL_TIMEOUT) {
          this.players.forEach((p, i) => this.wings[i].finishLevel(p.up()));
          this.go("lean");
        }
      } else if (this.step === "lean") {
        this.players.forEach((p, i) => {
          if (!live[i]) { this.done[i] = true; return; }
          if (this.done[i]) return;
          this.wings[i].learnLean(p.up());
          const amount = Math.hypot(...perpendicular(p.up(), this.wings[i].level));
          this.leaning[i] = amount > Math.sin(LEAN_DEGREES * Math.PI / 180) ? this.leaning[i] + dt : 0;
          if (this.leaning[i] >= LEAN_HOLD) {
            this.done[i] = true; this.ticks[i][1] = true;
            if (this.firstLean === null) this.firstLean = this.stepTime;
          }
        });
        const leaned = this.players.map((p, i) => live[i] && this.ticks[i][1]);
        const waiting = this.players.map((p, i) => live[i] && !leaned[i]);
        let decide = false;
        if (!waiting.some(Boolean) && this.stepTime > 0.6) decide = true;                 // everyone has tilted
        else if (this.firstLean !== null) {
          const since = this.stepTime - this.firstLean;
          const allStill = waiting.every((w, i) => !w || this.peakEnergy[i] < STILL_ENERGY);
          if ((allStill && since > TABLE_WAIT) || since > SLOW_WAIT) decide = true;     // someone's sensor is idle
        }
        if (this.stepTime > LEAN_TIMEOUT) decide = true;
        if (decide) {
          // Players who tilted are playing. If nobody tilted, keep everyone connected (best guess).
          this.active = leaned.some(Boolean) ? leaned : live.map((l) => l);
          if (!this.active.some(Boolean)) this.active = this.players.map(() => true);
          this.decided = true;
          this.wings.forEach((w) => w.finishLean());
          this.go("ready");
        }
      } else if (this.step === "ready") {
        const level = this.players.every((p, i) => !live[i] || !this.active[i] || Math.abs(this.wings[i].bank(p.up())) < 0.3);
        this.readyHeld = level ? this.readyHeld + dt : 0;
        if (this.readyHeld > 0.6 || this.stepTime > READY_TIMEOUT) this.go("count");
      } else if (this.step === "count") {
        if (this.stepTime >= COUNT_SECONDS) this.go("launch");
      } else if (this.step === "launch") {
        this.progress = clamp(this.stepTime / LAUNCH_SECONDS, 0, 1);
        if (this.progress >= 1) this.go("fly");
      }
    }

    // How much of full speed the world should be moving at (0 in the nest, easing up during take-off).
    get speedShare() { return this.step === "fly" ? 1 : this.step === "launch" ? smooth(clamp((this.progress - 0.3) / 0.7, 0, 1)) : 0; }

    // ---- Who's playing ----
    get activeCount() { return this.active.filter(Boolean).length; }
    get solo() { return this.decided && this.activeCount === 1; }
    get soloIndex() { return this.active.indexOf(true); }

    // The bank to show on a bird's wings: live once "left" has been learned.
    bank(i) {
      const known = this.step === "ready" || this.step === "count" || this.step === "launch" || this.step === "fly";
      return known && this.active[i] && this.players[i].connected ? this.wings[i].bank(this.players[i].up()) : 0;
    }

    // The checklist at the top of the screen, and the big centre text.
    words() {
      const together = this.decided ? this.activeCount > 1 : this.players.filter((p) => p.connected).length > 1;
      const current = { level: 0, lean: 1, ready: 2, count: 2 }[this.step];
      const lines = [
        together ? "Both of you: hold your wings out" : "Hold your wings out",
        "Tilt to the left ⬅",
        this.step === "count" ? "Get ready… 3, 2, 1" : "Wings level… get ready!"
      ];
      let list = "";
      if (current !== undefined) {
        list = lines.map((text, i) => {
          if (i < current) return '<div style="opacity:.55;font-size:.62em">✓ ' + text + "</div>";
          if (i === current) return "<div>" + text + "</div>";
          return '<div style="opacity:.4;font-size:.62em">' + text + "</div>";
        }).join("");
      }
      let big = "";
      if (this.step === "count") big = String(Math.max(1, COUNT_SECONDS - Math.floor(this.stepTime)));
      if (this.step === "ready" && this.stepTime < 1.6 && this.players.length > 1 && this.activeCount === 1) big = "Flying solo!";
      if (this.step === "launch" && this.progress < 0.35) big = together ? "Fly together!" : "Fly!";
      return { list, big };
    }

    // Where the nest scene is: close-up while calibrating; during take-off the
    // camera pulls back, then the tree and nest slide away into the foreground.
    // pull: 0 = close-up on the nest, 1 = the normal flying camera.
    // lift: 0 = sitting in the nest, 1 = at flying height.
    view() {
      if (this.step === "fly") return { pull: 1, lift: 1, inNest: false };
      if (this.step !== "launch") return { pull: 0, lift: 0, inNest: true };
      return {
        pull: smooth(clamp(this.progress / 0.45, 0, 1)),
        lift: smooth(clamp((this.progress - 0.2) / 0.6, 0, 1)),
        inNest: true
      };
    }
  }

  // Sets up the stage: the 3D view, a drawing layer on top for effects, the
  // corner scores (hud), the checklist at the top and big centre words.
  function makeStage(ctx, hud) {
    ctx.stage.innerHTML =
      '<div class="fl-view" style="position:relative;flex:1;min-height:0;border-radius:22px;overflow:hidden;background:#cfe3f2">' +
        '<canvas class="fl-overlay" style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2"></canvas>' +
        '<div class="fl-hud" style="position:absolute;top:2.5vh;left:2.5vw;right:2.5vw;display:flex;justify-content:space-between;align-items:flex-start;z-index:3;' +
          'font-weight:800;font-size:clamp(1.3rem,3vw,2.6rem);color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.45);pointer-events:none">' + hud + '</div>' +
        '<div class="fl-list" style="position:absolute;left:0;right:0;top:3vh;text-align:center;font-weight:800;line-height:1.35;z-index:3;' +
          'font-size:clamp(1.4rem,3.6vw,3.2rem);color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.55);pointer-events:none;padding:0 12vw"></div>' +
        '<div class="fl-message" style="position:absolute;left:0;right:0;top:34%;text-align:center;font-weight:800;z-index:3;' +
          'font-size:clamp(3rem,10vw,9rem);color:#fff;text-shadow:0 4px 14px rgba(0,0,0,.5);pointer-events:none;padding:0 4vw"></div>' +
      '</div>';
    const overlay = ctx.stage.querySelector(".fl-overlay");
    return {
      viewEl: ctx.stage.querySelector(".fl-view"), overlay, g: overlay.getContext("2d"),
      message: ctx.stage.querySelector(".fl-message"), list: ctx.stage.querySelector(".fl-list")
    };
  }

  // Keeps the effects layer sharp at its current size. Returns [width, height] or null.
  function fitCanvas(canvas, g) {
    const ratio = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    }
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    return [w, h];
  }

  function playerColour(stage, p) {
    return getComputedStyle(stage).getPropertyValue("--p" + p.n).trim() || (p.n === 1 ? "#e0662b" : "#7a4fd6");
  }

  function bonkFlash(g, w, h, amount) {
    if (amount <= 0) return;
    g.fillStyle = "rgba(255,80,60," + (0.22 * amount) + ")"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255," + amount + ")";
    g.font = "800 " + Math.round(h * 0.11) + "px system-ui, sans-serif";
    g.textAlign = "center"; g.fillText("BONK!", w / 2, h * 0.5);
  }

  // A tick above a bird once its player has finished a step.
  function drawTicks(g, x, y, size, ticks, colour) {
    const done = ticks.filter(Boolean).length;
    if (!done) return;
    g.save();
    g.font = "800 " + Math.round(size * 0.32) + "px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillStyle = colour; g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = size * 0.05;
    const text = "✓".repeat(done);
    g.strokeText(text, x, y); g.fillText(text, x, y);
    g.restore();
  }

  return {
    BIRD_AHEAD, makeWorld, Wings, Launch, makeStage, fitCanvas, playerColour, bonkFlash, drawTicks, pilot,
    clamp, mix, rgb, smooth
  };
})();
