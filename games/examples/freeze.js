// ============================================================================
// EXAMPLE, NOT LOADED: Freeze (was the button-3 placeholder until 2.6.0)
// A game that rewards stillness and ends early with ctx.endRound(). To use it,
// give it a free key and add <script src="games/examples/freeze.js"></script>
// to heartbeat-games.html.
// The full game contract is at the top of js/app.js.
// ============================================================================
HG.registerGame({
  key: 3,
  name: "Game Three",
  icon: "🌟",
  colour: "var(--g3)",
  howTo: "Placeholder: freeze like a statue! Your bar fills while you stay still.",
  needs: "motion",
  roundSeconds: 20,

  start(ctx) {
    ctx.state.scores = [0, 0];
    ctx.stage.innerHTML = '<div class="hg-lanes">' + ctx.players.map((p) =>
      '<div class="hg-lane p' + p.n + '"><div class="hg-lane-name">' + p.name + '</div>' +
      '<div class="hg-track"><div class="hg-fill"></div></div><div class="hg-score">0</div></div>').join("") + '</div>';
    ctx.state.fills = ctx.stage.querySelectorAll(".hg-fill");
    ctx.state.labels = ctx.stage.querySelectorAll(".hg-score");
  },

  update(ctx, dt) {
    const target = 10;                        // seconds of stillness to win
    ctx.players.forEach((p, i) => {
      const still = p.connected && p.energy() < 0.25;
      if (ctx.phase === "playing" && still) ctx.state.scores[i] += dt;
      ctx.state.fills[i].style.height = Math.min(100, ctx.state.scores[i] / target * 100).toFixed(1) + "%";
      ctx.state.labels[i].textContent = still ? "Frozen!" : "Moving…";
    });
    if (ctx.state.scores.some((s) => s >= target)) ctx.endRound();
  },

  end(ctx) {
    return { scores: ctx.state.scores, scoreLabel: "seconds frozen" };
  }
});
