// ============================================================================
// Example game (not loaded): tilt to keep your ball in the middle zone.
// Shows how a game uses p.tilt(). Copy this file to start a new game, give it
// a free button number, and add a <script> line for it in heartbeat-games.html.
// The full game contract is at the top of js/app.js.
// ============================================================================
HG.registerGame({
  key: 2,
  name: "Game Two",
  icon: "🌊",
  colour: "var(--g2)",
  howTo: "Placeholder: tilt your arm to keep your ball inside the middle zone!",
  needs: "motion",
  roundSeconds: 30,

  start(ctx) {
    ctx.state.scores = [0, 0];
    ctx.stage.innerHTML = '<div class="hg-lanes">' + ctx.players.map((p) =>
      '<div class="hg-lane p' + p.n + '"><div class="hg-lane-name">' + p.name + '</div>' +
      '<div class="hg-track">' +
        '<div style="position:absolute;left:35%;right:35%;top:0;bottom:0;background:color-mix(in srgb,var(--player) 18%,transparent)"></div>' +
        '<div class="ball" style="position:absolute;top:50%;width:14%;aspect-ratio:1;border-radius:50%;background:var(--player);transform:translate(-50%,-50%)"></div>' +
      '</div><div class="hg-score">0</div></div>').join("") + '</div>';
    ctx.state.balls = ctx.stage.querySelectorAll(".ball");
    ctx.state.labels = ctx.stage.querySelectorAll(".hg-score");
  },

  update(ctx, dt) {
    ctx.players.forEach((p, i) => {
      // Roll of about -45 to +45 degrees moves the ball across the track.
      const position = Math.max(0, Math.min(1, 0.5 + p.tilt().roll / 90));
      ctx.state.balls[i].style.left = (position * 100).toFixed(1) + "%";
      const inZone = position > 0.35 && position < 0.65;
      if (ctx.phase === "playing" && inZone && p.connected) ctx.state.scores[i] += dt;
      ctx.state.labels[i].textContent = ctx.state.scores[i].toFixed(1) + " s";
    });
  },

  end(ctx) {
    return { scores: ctx.state.scores, scoreLabel: "seconds in the zone" };
  }
});
