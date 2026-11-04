// ============================================================================
// Flock Flight (two players, working together)
// ----------------------------------------------------------------------------
// Two birds share one narrow valley. Flying close together forms a flock:
// a glowing link appears, sparkles trail behind, and the flock speeds up.
// The camera keeps both birds on screen, pulling back when they drift apart
// and moving in when they fly together. When both players lean the same way
// at once, the whole view banks with them. The score is the team's distance.
// The world, birds and warm-up are shared with Valley Flight: see games/lib/flight.js.
// The full game contract is at the top of js/app.js.
// ============================================================================
(function () {
  const F = HG.flight;

  // ---- Tuning: change these to adjust the feel ------------------------------
  const ROUND_SECONDS = 80;          // includes the warm-up
  const MAX_SIDEWAYS_SPEED = 16;     // metres per second at full bank
  const START_SPEED = 24, END_SPEED = 36;          // forward speed, metres per second
  const START_HALF_WIDTH = 15, END_HALF_WIDTH = 9; // valley floor half-width, metres
  const BIRD_HALF_SPAN = 1.6;        // how close to a wall counts as touching
  const BUMP_SLOWDOWN = 0.5;         // the flock's speed drops to this fraction on a bump
  const TOGETHER_NEAR = 4.5;         // birds this close (metres) are fully a flock...
  const TOGETHER_FAR = 9;            // ...and this far apart, not a flock at all
  const FLOCK_BOOST = 0.25;          // a full flock flies this much faster (0.25 = 25%)
  const MIN_GAP = 2.4;               // birds gently keep at least this far apart
  const SYNC_TILT_DEGREES = 9;       // how far the view banks when both lean together
  const ZOOM_IN = 1.2, ZOOM_APART = 0.82;          // camera framing when flocking / when apart
  const ZOOM_OUT_LIMIT = 0.45;                     // never pull back farther than this
  // ----------------------------------------------------------------------------

  const ease = (current, target, rate, dt) => current + (target - current) * Math.min(1, dt * rate);

  HG.registerGame({
    key: 2,
    name: "Flock Flight",
    icon: "🕊️",
    colour: "#7a4fd6",
    howTo: "Two birds, one team! Tilt your arms to steer, and fly close together to form a flock. Flocks fly faster, and if you lean together, the whole sky turns with you!",
    needs: "motion",
    roundSeconds: ROUND_SECONDS,

    start(ctx) {
      const s = ctx.state;
      s.world = F.makeWorld();
      s.z = 0; s.camX = 0; s.speed = 8; s.speedFactor = 1; s.zoom = 1; s.roll = 0;
      s.halfWidth = START_HALF_WIDTH; s.distance = 0; s.togetherDistance = 0; s.syncSeconds = 0; s.bumps = 0;
      s.together = 0; s.sync = 0; s.shake = 0; s.sparkles = [];
      s.warm = { step: "level" }; s.wings = [new F.Wings(), new F.Wings()];
      s.birds = ctx.players.map((p, i) => ({
        p, x: (i === 0 ? -3 : 3), bank: 0, shown: 0, flap: i * 1.7, bonk: 0, colour: F.playerColour(ctx.stage, p)
      }));
      Object.assign(s, F.makeStage(ctx,
        '<span class="ff-distance">0 m</span>' +
        '<span style="text-align:right"><span class="ff-badge" style="display:block"></span>' +
        '<span class="ff-bumps" style="display:block;font-size:.65em;opacity:.9"></span></span>'));
      s.distanceEl = ctx.stage.querySelector(".ff-distance");
      s.badgeEl = ctx.stage.querySelector(".ff-badge");
      s.bumpsEl = ctx.stage.querySelector(".ff-bumps");
    },

    update(ctx, dt) {
      const s = ctx.state;
      const playing = ctx.phase === "playing";
      const t = playing ? ctx.elapsed : 0;
      const message = F.warmUp(s.warm, ctx.players, s.wings, t, playing, true);
      const flying = s.warm.step === "fly";
      const centre = s.world.centre(s.z + F.BIRD_AHEAD);

      // ---- Steering each bird ----
      s.birds.forEach((b, i) => {
        b.bank = flying && b.p.connected ? s.wings[i].bank(b.p.up()) : 0;
        if (!flying) b.x = centre + (i === 0 ? -3 : 3);                // side by side during the warm-up
        else if (!b.p.connected) b.x = ease(b.x, centre, 2, dt);       // a missing player's bird follows the river
        else b.x += b.bank * MAX_SIDEWAYS_SPEED * dt;
      });

      // Birds gently keep their distance so they never overlap.
      const [a, b] = s.birds;
      const gap = Math.abs(a.x - b.x);
      if (gap < MIN_GAP) {
        const mid = (a.x + b.x) / 2, dir = a.x <= b.x ? -1 : 1;
        a.x = mid + dir * MIN_GAP / 2; b.x = mid - dir * MIN_GAP / 2;
      }

      // ---- Flock and sync ----
      const separation = Math.abs(a.x - b.x);
      const togetherTarget = flying ? F.clamp((TOGETHER_FAR - separation) / (TOGETHER_FAR - TOGETHER_NEAR), 0, 1) : 0;
      s.together = ease(s.together, togetherTarget, 4, dt);
      const bothLive = a.p.connected && b.p.connected;
      const sameWay = Math.sign(a.bank) === Math.sign(b.bank) && Math.abs(a.bank - b.bank) < 0.3 && Math.abs(a.bank + b.bank) / 2 > 0.15;
      s.sync = ease(s.sync, flying && bothLive && sameWay ? 1 : 0, 3, dt);
      s.roll = ease(s.roll, (a.bank + b.bank) / 2 * SYNC_TILT_DEGREES * Math.PI / 180 * s.sync, 4, dt);

      // ---- Speed, valley and walls ----
      const progress = flying ? F.clamp((t - s.warm.flyStart) / (ROUND_SECONDS - F.LEVEL_SECONDS - F.LEAN_SECONDS), 0, 1) : 0;
      const cruise = flying ? (START_SPEED + (END_SPEED - START_SPEED) * progress) * (1 + FLOCK_BOOST * s.together) : 8;
      s.speedFactor = Math.min(1, s.speedFactor + dt * 0.35);
      s.speed = cruise * s.speedFactor;
      s.halfWidth = START_HALF_WIDTH + (END_HALF_WIDTH - START_HALF_WIDTH) * progress;
      s.z += s.speed * dt;
      const limit = s.halfWidth - BIRD_HALF_SPAN;
      for (const bird of s.birds) {
        if (flying && Math.abs(bird.x - centre) > limit) {
          bird.x = centre + Math.sign(bird.x - centre) * (limit - 1.5);
          if (bird.bonk < 0.3) { s.bumps++; s.speedFactor = BUMP_SLOWDOWN; }
          bird.bonk = 1; s.shake = 1;
        }
        bird.bonk = Math.max(0, bird.bonk - dt * 1.6);
        bird.shown = ease(bird.shown, bird.bank, 10, dt);
        bird.flap += dt * (flying ? 5 + s.speed * 0.08 : 4);
      }
      s.shake = Math.max(0, s.shake - dt * 2);
      if (flying) {
        s.distance += s.speed * dt;
        if (s.together > 0.5) s.togetherDistance += s.speed * dt;
        if (s.sync > 0.6) s.syncSeconds += dt;
      }

      // ---- Camera: centred between the birds, zooming to keep both in view ----
      const size = F.fitCanvas(s.canvas, s.g);
      if (!size) return;
      const [w, h] = size, g = s.g;
      s.camX = ease(s.camX, (a.x + b.x) / 2, 3, dt);
      const reach = Math.max(Math.abs(a.x - s.camX), Math.abs(b.x - s.camX), 0.5);
      const fit = 0.36 * w * F.BIRD_AHEAD / (h * 0.9 * reach);       // the zoom that keeps both on screen
      const wanted = F.clamp(Math.min(ZOOM_APART + (ZOOM_IN - ZOOM_APART) * s.together, fit), ZOOM_OUT_LIMIT, ZOOM_IN);
      s.zoom = ease(s.zoom, wanted, wanted < s.zoom ? 4 : 1.5, dt);   // pull back quickly, move in gently

      // ---- Draw ----
      g.save();
      if (s.shake > 0) g.translate((Math.random() - 0.5) * 12 * s.shake, (Math.random() - 0.5) * 8 * s.shake);
      g.translate(w / 2, h * 0.6); g.rotate(-s.roll); g.translate(-w / 2, -h * 0.6);   // sync tilt
      F.drawWorld(g, w, h, s);
      const scale = h * 0.9 * s.zoom / F.BIRD_AHEAD, birdY = h * 0.72;
      const positions = s.birds.map((bird) => w / 2 + (bird.x - s.camX) * scale);
      const birdSize = Math.min(w, h) * 0.13 * (0.75 + 0.25 * s.zoom);

      // The flock link and its sparkles.
      if (s.together > 0.05) {
        const link = g.createLinearGradient(positions[0], 0, positions[1], 0);
        link.addColorStop(0, a.colour); link.addColorStop(1, b.colour);
        g.save();
        g.globalAlpha = s.together * 0.85; g.strokeStyle = link; g.lineCap = "round";
        g.shadowColor = "rgba(255,255,255,0.9)"; g.shadowBlur = 18 * s.together;
        g.lineWidth = Math.max(3, birdSize * 0.06);
        g.beginPath(); g.moveTo(positions[0], birdY - birdSize * 0.1); g.lineTo(positions[1], birdY - birdSize * 0.1); g.stroke();
        g.restore();
        if (flying && Math.random() < s.together * dt * 30) {
          const at = Math.random();
          s.sparkles.push({ x: positions[0] + (positions[1] - positions[0]) * at, y: birdY, life: 1,
                            dx: (Math.random() - 0.5) * 60, dy: 60 + Math.random() * 80 });
        }
      }
      s.sparkles = s.sparkles.filter((sp) => (sp.life -= dt * 1.3) > 0);
      for (const sp of s.sparkles) {
        sp.x += sp.dx * dt; sp.y += sp.dy * dt;
        g.fillStyle = "rgba(255,248,220," + sp.life + ")";
        g.beginPath(); g.arc(sp.x, sp.y, Math.max(1.5, birdSize * 0.035 * sp.life), 0, Math.PI * 2); g.fill();
      }
      s.birds.forEach((bird, i) => F.drawBird(g, positions[i], birdY, birdSize, bird.shown * 0.7, bird.flap, bird.colour));
      g.restore();
      F.bonkFlash(g, w, h, Math.max(a.bonk, b.bonk));

      // ---- Words on screen ----
      if (s.message.innerHTML !== message) s.message.innerHTML = message;
      s.distanceEl.textContent = Math.round(s.distance).toLocaleString() + " m";
      s.badgeEl.textContent = !flying ? "" : s.sync > 0.6 ? "In sync! 🌀" : s.together > 0.6 ? "Flock! ✨" : "Fly closer!";
      s.bumpsEl.textContent = flying ? "Bumps: " + s.bumps : "";
    },

    end(ctx) {
      const s = ctx.state;
      const togetherShare = s.distance > 0 ? Math.round(s.togetherDistance / s.distance * 100) : 0;
      return {
        headline: "Your flock flew " + Math.round(s.distance).toLocaleString() + " m!",
        detail: "Together for " + togetherShare + "% of the flight · In sync for " + Math.round(s.syncSeconds) + " s · Bumps: " + s.bumps
      };
    }
  });
})();
