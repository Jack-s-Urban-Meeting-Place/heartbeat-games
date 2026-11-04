// ============================================================================
// Fly Together (two players working together, or one flying solo)
// ----------------------------------------------------------------------------
// Two crows (games/lib/crow.js, one orange, one purple) share one narrow valley.
// Flying close together, tiny hearts stream out from between them, more and more
// the longer they stay together, and the pair speeds up, faster and faster.
// A bonk on a wall puffs out a few feathers. A gentle magnet helps near-misses
// join up, and the birds can fly over and under each other.
// The camera keeps both birds on screen, pulling back when they drift apart
// and moving in when they fly together. When both players lean the same way
// at once, the whole view banks with them. The score is the team's distance.
// One player: if only one player tilts left in the nest (the other sensor is
// on the table, or switched off), the game flies solo: one bird, speeding up
// the longer it flies cleanly, and back to the starting speed after a bump.
// Drawn in 3D (games/lib/flight3d.js). Each round starts in a nest, where both players calibrate their wings, then
// the birds take off into the valley. The world, birds and nest are shared with
// Valley Flight: see games/lib/flight.js.
// The full game contract is at the top of js/app.js.
// ============================================================================
(function () {
  const F = HG.flight;

  // ---- Tuning: change these to adjust the feel ------------------------------
  const ROUND_SECONDS = 75;          // flying time, from take-off
  const MAX_SIDEWAYS_SPEED = 16;     // metres per second at full bank
  const START_SPEED = 24, END_SPEED = 36;          // forward speed, metres per second
  const START_HALF_WIDTH = 15, END_HALF_WIDTH = 9; // valley floor half-width, metres...
  const NARROW_OVER = 2600;                        // ...narrowing over this many metres flown...
  const MIN_HALF_WIDTH = 6;                        // ...then more and more slowly toward this (never narrower)
  const BIRD_HALF_SPAN = 1.6;        // how close to a wall counts as touching
  const BUMP_SLOWDOWN = 0.5;         // the pair's speed drops to this fraction on a bump
  const TOGETHER_NEAR = 4.5;         // birds this close (metres) are fully together...
  const TOGETHER_FAR = 9;            // ...and this far apart, not together at all
  const TOGETHER_BOOST = 0.15;       // flying together is instantly this much faster (0.15 = 15%)
  const STREAK_SPEEDUP = 0.035;      // ...plus this much more for every second you stay together
  const MAX_SPEEDUP = 2.2;           // never more than this many times the normal speed
  const STREAK_FADE = 4;             // apart, the streak drains this many seconds per second
  const STEER_WITH_SPEED = 0.6;      // steering strengthens with speed (0 = never, 1 = fully)
  const MAGNET_RANGE = 6;            // within this many metres, the birds drift together...
  const MAGNET_PULL = 1.2;           // ...at up to this many metres per second (a full lean is 16)
  const CROSSING_LIFT = 1.1;         // how far (metres) birds rise and dip to pass each other
  const SYNC_TILT_DEGREES = 9;       // how far the view banks when both lean together
  const ZOOM_IN = 1.2, ZOOM_APART = 0.82;          // camera framing when together / when apart
  const ZOOM_OUT_LIMIT = 0.45;                     // never pull back farther than this
  const SOLO_SPEEDUP = 0.03;         // flying solo: this much faster for every second without a bump
  const SOLO_ZOOM = 1.05;            // flying solo: camera framing
  // How the crows fly: bursts of wingbeats with glides between (and hard flapping at take-off).
  const FLAP_BURST = 1.6;            // seconds of flapping...
  const GLIDE_TIME = 1.2;            // ...then seconds of gliding, and round again
  const FLIGHT_FLAP = 0.75;          // how deep the in-flight wingbeats are (1 = full, as at take-off)
  // Flying together: tiny hearts stream out from between the birds, more the longer they stay together.
  const HEARTS_AFTER = 2;            // hearts start once they've been together this many seconds...
  const HEARTS_START = 2;            // ...at this many per second...
  const HEARTS_PER_STREAK_SECOND = 0.75;  // ...plus this many more per second for every second of the streak
  const HEARTS_MAX = 15;             // never more than this many per second
  const HEART_SECONDS = 1.8;         // how long each heart floats before fading
  const BONK_FEATHERS = 8;           // feathers that puff out behind a bird when it bonks a wall
  // The end-of-round photo: the last frame freezes, zooms in on the birds, then becomes a Polaroid.
  const PHOTO_FREEZE = 0.5;          // seconds the frozen frame holds before zooming in
  const PHOTO_ZOOM_IN = 1.4;         // seconds zooming in on the birds
  const PHOTO_HOLD = 0.9;            // seconds holding the close-up
  const PHOTO_PULL_BACK = 1.6;       // seconds pulling back into the Polaroid (then the words fade in)
  const PHOTO_MAX_ZOOM = 2.8;        // never zoom in closer than this (times the game view)
  const PHOTO_TILT_DEGREES = -5;     // the Polaroid's tilt (negative = anticlockwise)
  const PHOTO_SHARPNESS = 2;         // the photo is drawn this many times finer than the screen, so the zoom stays crisp
  // ----------------------------------------------------------------------------

  const ease = (current, target, rate, dt) => current + (target - current) * Math.min(1, dt * rate);

  // ---- Hearts and feathers: little things drawn on top of the 3D view ----
  // Both drift toward the camera, so they fall down the screen and grow as they go.
  // moveParticle moves one along and returns how far through its life it is (0 to 1).
  function moveParticle(p, dt) {
    p.age += dt;
    p.vy += p.fall * dt;
    p.x += p.vx * dt + Math.sin(p.age * p.wobble) * p.sway * dt;
    p.y += p.vy * dt;
    p.spin && (p.angle += p.spin * dt);
    return p.age / p.life;
  }

  // A heart that floats out to one side (side = -1 left, +1 right) and arcs down toward a corner.
  function newHeart(from, h, side) {
    return {
      x: from.x, y: from.y, age: 0, life: HEART_SECONDS * (0.8 + Math.random() * 0.4),
      vx: side * h * (0.16 + Math.random() * 0.2), vy: -h * (0.02 + Math.random() * 0.08), fall: h * 0.45,
      wobble: 3 + Math.random() * 3, sway: h * 0.02, start: h * 0.01, end: h * (0.07 + Math.random() * 0.07)
    };
  }

  function drawHeart(g, p) {
    const t = p.age / p.life, s = (p.start + (p.end - p.start) * Math.pow(t, 1.4)) / 2;
    const { x, y } = p;
    g.save();
    g.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
    g.fillStyle = "#fff"; g.shadowColor = "rgba(120,30,60,0.35)"; g.shadowBlur = s * 0.6;
    g.beginPath();
    g.moveTo(x, y + s * 0.95);
    g.bezierCurveTo(x - s * 1.7, y - s * 0.15, x - s * 0.65, y - s * 1.45, x, y - s * 0.45);
    g.bezierCurveTo(x + s * 0.65, y - s * 1.45, x + s * 1.7, y - s * 0.15, x, y + s * 0.95);
    g.fill();
    g.restore();
  }

  // A feather knocked loose by a bonk, tumbling out behind the bird toward the wall side.
  function newFeather(spot, side, colour, h) {
    return {
      x: spot.x + side * spot.size * (0.15 + Math.random() * 0.25), y: spot.y + (Math.random() - 0.3) * spot.size * 0.15,
      age: 0, life: 1.6 + Math.random() * 0.6, colour,
      vx: side * h * (0.04 + Math.random() * 0.14), vy: h * (0.1 + Math.random() * 0.15), fall: h * 0.2,
      wobble: 4 + Math.random() * 4, sway: h * 0.08, angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 6,
      start: spot.size * 0.15, end: spot.size * (0.7 + Math.random() * 0.5)
    };
  }

  function drawFeather(g, p) {
    const t = p.age / p.life, len = p.start + (p.end - p.start) * Math.pow(t, 1.2), half = len / 2;
    g.save();
    g.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
    g.translate(p.x, p.y); g.rotate(p.angle);
    g.fillStyle = p.colour;
    g.beginPath();                                                   // the vane: broad near the base, pointed tip
    g.moveTo(-half, 0);
    g.quadraticCurveTo(-half * 0.2, -len * 0.2, half, 0);
    g.quadraticCurveTo(-half * 0.1, len * 0.15, -half, 0);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = Math.max(1, len * 0.03);
    g.beginPath(); g.moveTo(-half * 1.15, 0); g.lineTo(half * 0.9, -len * 0.01); g.stroke();   // the shaft
    g.restore();
  }

  // White streaks rushing past the edges of the screen, more of them the faster you go.
  function drawSpeedLines(g, w, h, s, dt) {
    const rush = F.clamp((s.speedUp - 1.15) / 0.8, 0, 1);
    if (rush > 0 && Math.random() < rush * dt * 40) {
      const angle = Math.random() * Math.PI * 2;
      s.speedLines.push({ angle, r: 0.35 + Math.random() * 0.2, life: 1 });
    }
    s.speedLines = s.speedLines.filter((l) => (l.life -= dt * 2.2) > 0);
    const cx = w / 2, cy = h * 0.3, reach = Math.hypot(w, h) * 0.6;
    g.save();
    g.lineCap = "round";
    for (const l of s.speedLines) {
      const r1 = reach * (l.r + (1 - l.life) * 0.6), r2 = r1 + reach * 0.18;
      g.strokeStyle = "rgba(255,255,255," + (0.55 * l.life) + ")";
      g.lineWidth = Math.max(2, h * 0.006);
      g.beginPath();
      g.moveTo(cx + Math.cos(l.angle) * r1, cy + Math.sin(l.angle) * r1);
      g.lineTo(cx + Math.cos(l.angle) * r2, cy + Math.sin(l.angle) * r2);
      g.stroke();
    }
    g.restore();
  }

  HG.registerGame({
    key: 1,
    name: "Fly Together",
    icon: "🕊️",
    colour: "#7a4fd6",
    howTo: "Arms out like wings! Tilt to steer!\nFly close together to go faster!\nDon’t bonk the sides.",
    introArt: "games/art/fly-together-pose.svg",   // two players, arms out, sensor on the wrist
    menuArt: "games/art/fly-together-menu.jpg",    // the two crows flying together, for the menu tile
    fullScreen: true,
    needs: "motion",
    roundSeconds: ROUND_SECONDS,
    countdown: false,                // the nest has its own "get ready, 3, 2, 1"
    clock: "manual",                 // the clock starts at take-off
    warmUp: () => HG.flight3d.warmUp(),   // (gets the 3D valley ready in the background while the sensors connect)

    start(ctx) {
      const s = ctx.state;
      s.world = F.makeWorld({ startHalfWidth: START_HALF_WIDTH, endHalfWidth: END_HALF_WIDTH, narrowOver: NARROW_OVER, minHalfWidth: MIN_HALF_WIDTH });
      s.z = 0; s.speed = 0; s.speedFactor = 1; s.zoom = 1; s.roll = 0;
      s.distance = 0; s.togetherDistance = 0; s.syncSeconds = 0; s.bumps = 0;
      s.together = 0; s.sync = 0; s.shake = 0; s.hearts = []; s.heartsDue = 0; s.heartSide = 1; s.feathers = [];
      s.streak = 0; s.bestStreak = 0; s.speedUp = 1; s.topSpeedUp = 1; s.speedLines = [];
      s.wings = [new F.Wings(), new F.Wings()];
      s.launch = new F.Launch(ctx.players, s.wings); s.flyTime = 0; s.clockStarted = false;
      const centre = s.world.centre(F.BIRD_AHEAD);
      s.camX = centre;
      s.birds = ctx.players.map((p, i) => ({
        p, x: centre + (i === 0 ? -2 : 2), bank: 0, shown: 0, beat: i * 1.3, flapping: 0, bonk: 0, poof: false, colour: F.playerColour(ctx.stage, p)
      }));
      Object.assign(s, F.makeStage(ctx,
        '<span class="ff-distance"></span>' +
        '<span style="text-align:right"><span class="ff-badge" style="display:block"></span>' +
        '<span class="ff-bumps" style="display:block;font-size:.65em;opacity:.9"></span></span>'));
      s.distanceEl = ctx.stage.querySelector(".ff-distance");
      s.badgeEl = ctx.stage.querySelector(".ff-badge");
      s.bumpsEl = ctx.stage.querySelector(".ff-bumps");
      s.scene = HG.flight3d.get();
      s.scene.begin(s.viewEl, s.world, s.birds.map((b) => b.colour), centre);
    },

    update(ctx, dt) {
      const s = ctx.state;
      const L = s.launch;
      if (ctx.phase === "playing") L.update(dt);
      const flying = L.flying;
      if (L.step === "launch" && !s.clockStarted) { ctx.startClock(); s.clockStarted = true; }
      if (flying) s.flyTime += dt;
      const birdZ = s.z + F.BIRD_AHEAD;
      const centre = s.world.centre(birdZ);
      const solo = L.solo, active = L.active;
      const flyers = s.birds.filter((bird, i) => active[i]);

      // ---- Steering each bird ----
      // At high speed the valley's bends come faster, so steering strengthens too.
      const steerBoost = 1 + STEER_WITH_SPEED * (s.speedUp - 1);
      s.birds.forEach((b, i) => {
        b.bank = flying && active[i] && b.p.connected ? s.wings[i].bank(b.p.up()) : 0;
        if (!flying) b.x = centre + (solo ? 0 : i === 0 ? -2 : 2);   // in the nest and at take-off (centred when solo)
        else if (!b.p.connected) b.x = ease(b.x, centre, 2, dt);       // a player whose sensor drops mid-flight glides along the river
        else b.x += b.bank * MAX_SIDEWAYS_SPEED * steerBoost * dt;
      });

      // The birds don't collide: they can pass over and under each other. Close
      // together, a gentle magnet draws them in, weak enough to lean away from.
      const [a, b] = s.birds;
      const gap = Math.abs(a.x - b.x);
      if (flying && !solo && a.p.connected && b.p.connected && gap > 0.6 && gap < MAGNET_RANGE) {
        const pull = MAGNET_PULL * Math.sin(Math.PI * gap / MAGNET_RANGE) * dt;   // strongest mid-range, fading at both ends
        const dir = Math.sign(b.x - a.x);
        a.x += dir * pull / 2; b.x -= dir * pull / 2;
      }

      // ---- Together and in sync ----
      const separation = Math.abs(a.x - b.x);
      const togetherTarget = flying && !solo ? F.clamp((TOGETHER_FAR - separation) / (TOGETHER_FAR - TOGETHER_NEAR), 0, 1) : 0;
      s.together = ease(s.together, togetherTarget, 4, dt);
      const bothLive = a.p.connected && b.p.connected;
      const sameWay = Math.sign(a.bank) === Math.sign(b.bank) && Math.abs(a.bank - b.bank) < 0.3 && Math.abs(a.bank + b.bank) / 2 > 0.15;
      s.sync = ease(s.sync, flying && !solo && bothLive && sameWay ? 1 : 0, 3, dt);
      s.roll = ease(s.roll, (a.bank + b.bank) / 2 * SYNC_TILT_DEGREES * Math.PI / 180 * s.sync, 4, dt);

      // ---- Speed, valley and walls ----
      const progress = F.clamp(s.flyTime / ROUND_SECONDS, 0, 1);
      // The streak. Together: grows while together, drains away when apart.
      // Solo: grows the whole time you fly without a bump.
      if (flying && (solo || s.together > 0.6)) s.streak += dt;
      else s.streak = Math.max(0, s.streak - STREAK_FADE * dt);
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      const speedUpTarget = !flying ? 1 : solo ? Math.min(MAX_SPEEDUP, 1 + SOLO_SPEEDUP * s.streak)
        : Math.min(MAX_SPEEDUP, 1 + TOGETHER_BOOST * s.together + STREAK_SPEEDUP * s.streak);
      s.speedUp = ease(s.speedUp, speedUpTarget, 1.5, dt);
      s.topSpeedUp = Math.max(s.topSpeedUp, s.speedUp);
      // Still in the nest, then easing up to speed during take-off.
      const cruise = (START_SPEED + (END_SPEED - START_SPEED) * progress) * (flying ? s.speedUp : L.speedShare);
      s.speedFactor = Math.min(1, s.speedFactor + dt * 0.35);
      s.speed = cruise * s.speedFactor;
      s.z += s.speed * dt;
      const limit = s.world.halfWidth(birdZ) - BIRD_HALF_SPAN;
      for (const bird of s.birds) {
        if (flying && active[s.birds.indexOf(bird)] && s.flyTime > 1 && Math.abs(bird.x - centre) > limit) {
          bird.x = centre + Math.sign(bird.x - centre) * (limit - 1.5);
          if (bird.bonk < 0.3) {
            s.bumps++; s.streak = 0;                                     // a bump ends the streak
            bird.poof = true;                                            // feathers puff out (drawn below)
            if (solo) s.speedUp = 1;                                    // solo: straight back to the starting speed
            else s.speedFactor = BUMP_SLOWDOWN;
          }
          bird.bonk = 1; s.shake = 1;
        }
        bird.bonk = Math.max(0, bird.bonk - dt * 1.6);
        bird.shown = ease(bird.shown, flying ? bird.bank : L.bank(s.birds.indexOf(bird)), 10, dt);
        // Wingbeats: wings held out in the nest, hard flapping at take-off, then bursts of
        // flapping with glides between (gliding more through hard turns).
        bird.beat += dt;
        const bursting = bird.beat % (FLAP_BURST + GLIDE_TIME) < FLAP_BURST;
        bird.flapping = L.step === "launch" ? 1 : !flying ? 0 : bursting ? FLIGHT_FLAP * (1 - 0.6 * Math.abs(bird.shown)) : 0;
      }
      s.shake = Math.max(0, s.shake - dt * 2);
      if (flying) {
        s.distance += s.speed * dt;
        if (s.together > 0.5) s.togetherDistance += s.speed * dt;
        if (s.sync > 0.6) s.syncSeconds += dt;
      }

      // ---- Camera: centred between the birds, zooming to keep both in view ----
      const size = F.fitCanvas(s.overlay, s.g);
      if (!size) return;
      const [w, h] = size, g = s.g;
      s.camX = ease(s.camX, flyers.reduce((sum, bird) => sum + bird.x, 0) / flyers.length, 3, dt);
      const reach = Math.max(...flyers.map((bird) => Math.abs(bird.x - s.camX)));
      const fit = s.scene.fitZoom(reach, w / h);                         // the zoom that keeps both on screen
      const wanted = !flying ? 1 : solo ? SOLO_ZOOM
        : F.clamp(Math.min(ZOOM_APART + (ZOOM_IN - ZOOM_APART) * s.together, fit), ZOOM_OUT_LIMIT, ZOOM_IN);
      s.zoom = ease(s.zoom, wanted, wanted < s.zoom ? 4 : 1.5, dt);   // pull back quickly, move in gently

      // ---- Draw the 3D world ----
      // Crossing: Player 1 rises and Player 2 dips while they overlap, so one passes over the other.
      const overlap = Math.max(0, 1 - Math.abs(a.x - b.x) / 3);
      const lift = Math.sin(overlap * Math.PI / 2) * CROSSING_LIFT;
      s.scene.frame({
        z: s.z, camX: s.camX, zoom: s.zoom, roll: s.roll, shake: s.shake, view: L.view(),
        birds: s.birds.map((bird, i) => ({ x: bird.x, y: solo ? 0 : i === 0 ? lift : -lift * 0.6, bank: bird.shown, flapping: bird.flapping, hidden: !active[i] }))
      });
      const spots = s.scene.birdScreen;

      // ---- Effects on top: hearts when together, feathers on a bonk, ticks in the nest, speed lines ----
      // Hearts stream out from halfway between the birds, more and more the longer they stay together.
      if (flying && !solo && s.together > 0.3 && s.streak > HEARTS_AFTER) {
        s.heartsDue += Math.min(HEARTS_MAX, HEARTS_START + HEARTS_PER_STREAK_SECOND * s.streak) * s.together * dt;
        const mid = { x: (spots[0].x + spots[1].x) / 2, y: (spots[0].y + spots[1].y) / 2 };
        for (; s.heartsDue >= 1; s.heartsDue--) s.hearts.push(newHeart(mid, h, (s.heartSide = -s.heartSide)));
      }
      s.hearts = s.hearts.filter((heart) => moveParticle(heart, dt) < 1);
      for (const heart of s.hearts) drawHeart(g, heart);
      // A puff of feathers behind a bird that has just bonked, drifting off toward the wall side.
      s.birds.forEach((bird, i) => {
        if (!bird.poof) return;
        bird.poof = false;
        const side = Math.sign(bird.x - centre) || 1;
        for (let k = 0; k < BONK_FEATHERS; k++) s.feathers.push(newFeather(spots[i], side, bird.colour, h));
      });
      s.feathers = s.feathers.filter((feather) => moveParticle(feather, dt) < 1);
      for (const feather of s.feathers) drawFeather(g, feather);
      const words = L.words();
      // The ticks step aside while big words are showing (3, 2, 1 or "Flying solo!"), which sit in the same spot.
      if (L.view().lift === 0 && !flying && !words.big) {
        s.scene.tickScreen.forEach((t, i) => { if (active[i]) F.drawTicks(g, t.x, t.y, Math.max(40, t.size), L.ticks[i], s.birds[i].colour); });
      }
      drawSpeedLines(g, w, h, s, dt);
      F.bonkFlash(g, w, h, Math.max(a.bonk, b.bonk));

      // ---- Words on screen ----
      if (s.list.innerHTML !== words.list) s.list.innerHTML = words.list;
      if (s.message.innerHTML !== words.big) s.message.innerHTML = words.big;
      s.distanceEl.textContent = flying ? Math.round(s.distance).toLocaleString() + " m" : "";
      s.badgeEl.textContent = !flying ? "" : solo ? (s.speedUp > 1.08 ? "Speed ×" + s.speedUp.toFixed(1) + " 🔥" : "")
        : s.sync > 0.6 ? "In sync! 🌀"
        : s.streak >= 3 ? "Together " + Math.floor(s.streak) + " s 🔥" : s.together > 0.6 ? "Together! ✨" : "Fly closer!";
      s.bumpsEl.textContent = flying ? "Bumps: " + s.bumps : "";
    },

    cleanup() {
      HG.flight3d.get().detach();
    },

    end(ctx) {
      const s = ctx.state, solo = s.launch.solo;
      const togetherShare = s.distance > 0 ? Math.round(s.togetherDistance / s.distance * 100) : 0;
      const result = {
        solo, soloPlayer: s.launch.soloIndex + 1, distance: Math.round(s.distance), together: togetherShare,
        cleanRun: Math.round(s.bestStreak), bonks: s.bumps, topSpeed: s.topSpeedUp.toFixed(1),
        // The plain wording, used if the photo screen can't be shown.
        headline: "You flew " + Math.round(s.distance).toLocaleString() + " m" + (solo ? "!" : " together!"),
        detail: (solo ? "Longest clean run: " + Math.round(s.bestStreak) + " s" : "Together for " + togetherShare + "% of the flight") +
                " · Top speed ×" + s.topSpeedUp.toFixed(1) + " · Bonks: " + s.bumps
      };
      // The photo: copy the last frame now, before the 3D view is put away, and
      // note where the birds are in it so the zoom can frame them.
      try {
        const spots = s.scene.birdScreen.filter((spot, i) => s.launch.active[i]);
        const size = Math.max(40, ...spots.map((spot) => spot.size));
        const xs = spots.map((spot) => spot.x), ys = spots.map((spot) => spot.y);
        const focus = { x: Math.min(...xs) - size * 0.6, y: Math.min(...ys) - size * 0.45 };
        focus.w = Math.max(...xs) + size * 0.6 - focus.x; focus.h = Math.max(...ys) + size * 0.4 - focus.y;
        result.photo = HG.photoFinish.take([s.scene.snapshot(PHOTO_SHARPNESS), s.overlay], s.viewEl, focus);
      } catch (err) {
        console.warn("[heartbeat] Fly Together couldn't take the end photo:", err);
      }
      return result;
    },

    // The results screen: the photo on the right, the story and the stats on the left.
    showResults(el, r) {
      if (!r.photo) throw new Error("no photo was taken");          // the shell then shows the plain results
      const accent = r.solo ? "var(--p" + r.soloPlayer + ")" : "linear-gradient(90deg, var(--p1), var(--p2))";
      const value = (text) => '<span style="background:' + accent + ';-webkit-background-clip:text;background-clip:text;color:transparent;text-transform:none">' + text + "</span>";
      const words =
        '<p style="font-size:clamp(1.3rem,2.6vw,2.6rem);line-height:1.15">' +
          (r.solo ? "Just one bird<br>looking for<br>a new life" : "Just two birds<br>looking for a new life<br>together") + "</p>" +
        '<p style="font-size:clamp(1.3rem,2.6vw,2.6rem);line-height:1;margin-top:2vh">You flew</p>' +
        '<p style="font-size:clamp(3.5rem,9vw,8.5rem);line-height:.9;letter-spacing:-.02em;text-transform:none">' + value(r.distance.toLocaleString() + "m") + "</p>" +
        '<p style="font-size:clamp(1.1rem,2.3vw,2.2rem);line-height:1.4;margin-top:2vh">' +
          (r.solo ? "Longest clean run : " + value(r.cleanRun + " s") : "As a team : " + value(r.together + "%")) + "<br>" +
          "Bonks : " + value(String(r.bonks)) + "<br>" +
          "Top speed : " + value("×" + r.topSpeed) + "</p>";
      HG.photoFinish.show(el, r.photo, words, {
        freeze: PHOTO_FREEZE, zoomIn: PHOTO_ZOOM_IN, hold: PHOTO_HOLD, pullBack: PHOTO_PULL_BACK,
        maxZoom: PHOTO_MAX_ZOOM, tilt: PHOTO_TILT_DEGREES
      });
    }
  });
})();
