// ============================================================================
// Valley Flight (one player)
// ----------------------------------------------------------------------------
// Arms out like wings, sensor on a wrist. Tilting your arms banks the bird and
// steers it through a winding valley. Touching a wall gives a BONK and slows
// you down, so avoiding walls means flying farther.
// Drawn in 3D (games/lib/flight3d.js). Each round starts in a nest, where the
// player calibrates their wings, then the bird takes off into the valley.
// The full game contract is at the top of js/app.js.
// ============================================================================
(function () {
  const F = HG.flight;

  // ---- Tuning: change these to adjust the feel ------------------------------
  const ROUND_SECONDS = 70;          // flying time, from take-off
  const MAX_SIDEWAYS_SPEED = 17;     // metres per second at full bank
  const START_SPEED = 26, END_SPEED = 40;          // forward speed, metres per second
  const START_HALF_WIDTH = 17, END_HALF_WIDTH = 9; // valley floor half-width, metres...
  const NARROW_OVER = 2200;                        // ...narrowing over this many metres flown
  const BIRD_HALF_SPAN = 1.6;        // how close to a wall counts as touching
  const BUMP_SLOWDOWN = 0.45;        // speed drops to this fraction on a bump
  // ----------------------------------------------------------------------------

  HG.registerGame({
    key: 1,
    name: "Valley Flight",
    icon: "🦅",
    colour: "#2b9fd8",
    howTo: "Put your arms out like wings. Tilt them to steer the bird through the valley, and don’t touch the mountains!",
    needs: "motion",
    roundSeconds: ROUND_SECONDS,
    countdown: false,                // the nest has its own "get ready, 3, 2, 1"
    clock: "manual",                 // the clock starts at take-off

    start(ctx) {
      const s = ctx.state;
      s.world = F.makeWorld({ startHalfWidth: START_HALF_WIDTH, endHalfWidth: END_HALF_WIDTH, narrowOver: NARROW_OVER });
      s.z = 0; s.speed = 0; s.speedFactor = 1;
      s.distance = 0; s.bumps = 0; s.streak = 0; s.bestStreak = 0;
      s.bank = 0; s.shownBank = 0; s.flap = 0; s.bonk = 0;
      s.wings = [new F.Wings()];
      s.pilot = F.pilot(ctx.players);
      s.launch = new F.Launch([s.pilot], s.wings); s.flyTime = 0; s.clockStarted = false;
      const centre = s.world.centre(F.BIRD_AHEAD);
      s.birdX = centre; s.camX = centre;
      Object.assign(s, F.makeStage(ctx, '<span class="vf-distance"></span><span class="vf-bumps"></span>'));
      s.distanceEl = ctx.stage.querySelector(".vf-distance");
      s.bumpsEl = ctx.stage.querySelector(".vf-bumps");
      s.birdColour = F.playerColour(ctx.stage, s.pilot);
      s.scene = HG.flight3d.get();
      s.scene.begin(s.viewEl, s.world, [s.birdColour], centre);
    },

    update(ctx, dt) {
      const s = ctx.state, p = s.pilot;
      const L = s.launch;
      if (ctx.phase === "playing") L.update(dt);
      const flying = L.flying;
      if (L.step === "launch" && !s.clockStarted) { ctx.startClock(); s.clockStarted = true; }
      if (flying) s.flyTime += dt;
      const birdZ = s.z + F.BIRD_AHEAD;

      s.bank = flying && p.connected ? s.wings[0].bank(p.up()) : 0;
      const progress = F.clamp(s.flyTime / ROUND_SECONDS, 0, 1);
      // Still in the nest, then easing up to speed during take-off.
      const cruise = (START_SPEED + (END_SPEED - START_SPEED) * progress) * (flying ? 1 : L.speedShare);
      s.speedFactor = Math.min(1, s.speedFactor + dt * 0.35);
      s.speed = cruise * s.speedFactor;
      s.z += s.speed * dt;
      s.birdX += s.bank * MAX_SIDEWAYS_SPEED * dt;
      const centre = s.world.centre(birdZ);
      if (!flying) s.birdX = centre;                     // over the river in the nest and at take-off

      // Walls: a bump pushes the bird back, slows it, and shakes the screen.
      const limit = s.world.halfWidth(birdZ) - BIRD_HALF_SPAN;
      if (flying && s.flyTime > 1 && Math.abs(s.birdX - centre) > limit) {
        s.birdX = centre + Math.sign(s.birdX - centre) * (limit - 1.5);
        if (s.bonk < 0.3) { s.bumps++; s.bestStreak = Math.max(s.bestStreak, s.streak); s.streak = 0; s.speedFactor = BUMP_SLOWDOWN; }
        s.bonk = 1;
      }
      s.bonk = Math.max(0, s.bonk - dt * 1.6);
      if (flying) { s.distance += s.speed * dt; s.streak += s.speed * dt; }

      s.camX += (s.birdX - s.camX) * Math.min(1, dt * 3);
      s.shownBank += ((flying ? s.bank : L.bank(0)) - s.shownBank) * Math.min(1, dt * 10);
      s.flap += dt * (flying ? 5 + s.speed * 0.08 : L.step === "launch" ? 9 : 1.5);

      // ---- Draw the 3D world, then effects on top ----
      const size = F.fitCanvas(s.overlay, s.g);
      if (!size) return;
      const [w, h] = size, g = s.g;
      s.scene.frame({
        z: s.z, camX: s.camX, zoom: 1, roll: 0, shake: s.bonk, view: L.view(),
        birds: [{ x: s.birdX, y: 0, bank: s.shownBank, flap: s.flap }]
      });
      if (L.view().lift === 0 && !flying) {
        const t = s.scene.tickScreen[0];
        F.drawTicks(g, t.x, t.y, Math.max(40, t.size), L.ticks[0], s.birdColour);
      }
      F.bonkFlash(g, w, h, s.bonk);

      const words = L.words();
      if (s.list.innerHTML !== words.list) s.list.innerHTML = words.list;
      if (s.message.innerHTML !== words.big) s.message.innerHTML = words.big;
      s.distanceEl.textContent = flying ? Math.round(s.distance).toLocaleString() + " m" : "";
      s.bumpsEl.textContent = flying ? "Bumps: " + s.bumps : "";
    },

    cleanup() {
      HG.flight3d.get().detach();
    },

    end(ctx) {
      const s = ctx.state;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      return {
        headline: "You flew " + Math.round(s.distance).toLocaleString() + " m!",
        detail: s.bumps === 0 ? "No bumps at all. Amazing flying!"
          : "Wall bumps: " + s.bumps + " · Longest clean flight: " + Math.round(s.bestStreak).toLocaleString() + " m"
      };
    }
  });
})();
