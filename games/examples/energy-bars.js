// ============================================================================
// Example game (not loaded): move as much as you can to fill your bar.
// Shows how a game uses p.energy(). Copy this file to start a new game, give it
// a free button number, and add a <script> line for it in heartbeat-games.html.
// The full game contract is described at the top of js/app.js.
// ============================================================================
HG.registerGame({
  key: 1,
  name: "Game One",
  icon: "⚡",
  colour: "var(--g1)",
  howTo: "Placeholder: move as much as you can to fill your bar!",
  needs: "motion",
  roundSeconds: 30,

  start(ctx) {
    ctx.state.scores = [0, 0];
    ctx.stage.innerHTML = '<div class="hg-lanes">' + ctx.players.map((p) =>
      '<div class="hg-lane p' + p.n + '"><div class="hg-lane-name">' + p.name + '</div>' +
      '<div class="hg-track"><div class="hg-fill"></div></div><div class="hg-score">0</div></div>').join("") + '</div>';
    ctx.state.fills = ctx.stage.querySelectorAll(".hg-fill");
    ctx.state.labels = ctx.stage.querySelectorAll(".hg-score");
  },

  update(ctx, dt) {
    ctx.players.forEach((p, i) => {
      const energy = p.energy();
      if (ctx.phase === "playing") ctx.state.scores[i] += energy * dt * 10;
      ctx.state.fills[i].style.height = (energy * 100).toFixed(1) + "%";
      ctx.state.labels[i].textContent = Math.round(ctx.state.scores[i]) + " pts";
    });
  },

  end(ctx) {
    return { scores: ctx.state.scores.map(Math.round), scoreLabel: "points" };
  }
});
