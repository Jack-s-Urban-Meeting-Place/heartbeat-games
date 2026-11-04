// ============================================================================
// GAME NAME (one or two players)
// ----------------------------------------------------------------------------
// What the game is, in two or three plain sentences: what players do with their
// bodies, what happens on screen, how a round is won. Mention one/two players.
//
// TEMPLATE: copy this file to games/your-game.js, rename everything marked GAME,
// add <script src="games/your-game.js"></script> to heartbeat-games.html, and give
// it a free button number. As written it's a tiny working example: "Shake It Up",
// where both players shake to fill a shared bar together.
// The full game contract is at the top of js/app.js.
// ============================================================================
(function () {
  // ---- Tuning: change these to adjust the feel ------------------------------
  const ROUND_SECONDS = 45;          // length of a round
  const FILL_RATE = 0.06;            // how fast the shared bar fills at full energy (share per second)
  const DRAIN_RATE = 0.02;           // how fast it empties when nobody moves (share per second)
  const STILL_ENERGY = 0.15;         // below this much movement counts as "not moving"
  // ----------------------------------------------------------------------------

  const ease = (current, target, rate, dt) => current + (target - current) * Math.min(1, dt * rate);

  HG.registerGame({
    key: 9,                          // GAME: a free Stream Deck button number (1 to 9)
    name: "Shake It Up",             // GAME: shown on the menu tile and at the top of the game
    icon: "🎉",                      // GAME: an emoji for the menu tile
    colour: "var(--g3)",             // GAME: tile colour
    howTo: "Shake your arms to fill the bar together! Fill it before time runs out.",
    needs: "motion",
    roundSeconds: ROUND_SECONDS,
    // countdown: false,             // uncomment if the game has its own start sequence
    // clock: "manual",              // ...and then call ctx.startClock() when play really starts

    // Called as the 3-2-1 countdown begins: build the scene inside ctx.stage.
    start(ctx) {
      const s = ctx.state;           // the game's own data lives here
      s.fill = 0; s.shown = 0; s.filledAt = null;
      s.energy = ctx.players.map(() => 0);
      ctx.stage.innerHTML =
        '<div style="flex:1;display:flex;flex-direction:column;gap:3vh;align-items:center;justify-content:center">' +
          '<div class="shake-message" style="font-weight:800;font-size:clamp(1.6rem,4vw,3.5rem)"></div>' +
          '<div style="width:80%;height:9vh;border-radius:999px;background:var(--track);overflow:hidden">' +
            '<div class="shake-fill" style="height:100%;width:0;background:linear-gradient(90deg,var(--p1),var(--p2));border-radius:999px"></div>' +
          '</div>' +
          '<div class="hg-lanes" style="width:80%;flex:0 0 22vh">' + ctx.players.map((p) =>
            '<div class="hg-lane p' + p.n + '"><div class="hg-lane-name">' + p.name + '</div>' +
            '<div class="hg-track"><div class="hg-fill"></div></div></div>').join("") + '</div>' +
        '</div>';
      s.messageEl = ctx.stage.querySelector(".shake-message");
      s.fillEl = ctx.stage.querySelector(".shake-fill");
      s.laneEls = ctx.stage.querySelectorAll(".hg-fill");
    },

    // Called every frame during the countdown and the round. Only score while ctx.phase is "playing".
    update(ctx, dt) {
      const s = ctx.state, playing = ctx.phase === "playing";
      // Each connected player's movement; a missing sensor simply counts as still.
      ctx.players.forEach((p, i) => { s.energy[i] = ease(s.energy[i], p.connected ? p.energy() : 0, 8, dt); });
      const live = ctx.players.filter((p) => p.connected).length || 1;
      const together = s.energy.reduce((a, e) => a + e, 0) / live;
      if (playing && s.filledAt === null) {
        s.fill += (together > STILL_ENERGY ? together * FILL_RATE : -DRAIN_RATE) * dt;
        s.fill = Math.max(0, Math.min(1, s.fill));
        if (s.fill >= 1) { s.filledAt = ctx.elapsed; ctx.endRound(); }   // finished early: straight to results
      }
      // Draw: ease what's shown, so it moves smoothly.
      s.shown = ease(s.shown, s.fill, 6, dt);
      s.fillEl.style.width = (s.shown * 100).toFixed(1) + "%";
      s.laneEls.forEach((el, i) => { el.style.height = (s.energy[i] * 100).toFixed(1) + "%"; });
      const message = !playing ? "Get ready to shake!" : together > STILL_ENERGY ? "Keep shaking! 🎉" : "Shake your arms!";
      if (s.messageEl.textContent !== message) s.messageEl.textContent = message;
    },

    // Return the results; the shell shows them and offers Start (again) and Back (menu).
    end(ctx) {
      const s = ctx.state;
      if (s.filledAt !== null) return { headline: "You filled it together!", detail: "In " + Math.round(s.filledAt) + " seconds" };
      return { headline: "So close!", detail: "You filled " + Math.round(s.fill * 100) + "% of the bar" };
    },

    // Optional: stop anything the game started (timers, sounds, a shared 3D view).
    cleanup(ctx) {}
  });
})();
