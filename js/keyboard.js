// ============================================================================
// keyboard.js: playing with the keyboard instead of sensors (the "play online" version)
// ----------------------------------------------------------------------------
// Online (GitHub Pages) nobody has the wrist sensors, so each player's keys pretend to be a sensor:
//   Player 1:  A / D  tilt left / right       W  climb
//   Player 2:  ← / →  tilt left / right       ↑  climb
// The pretend sensor sends the same kind of readings a real one would (as tools/try-game.mjs does in
// tests): tilting turns its "up" direction; climbing swings it back and forth like a climbing arm.
// So the games, their calibration steps and their tuning work exactly as with real sensors.
// The controller buttons are number keys in this mode: 1 and 2 open the games, 0 is START, 9 is BACK
// (see js/app.js). Keyboard mode is on when the page's address has ?keys (index.html adds it).
// ============================================================================

HG.keys = (function () {
  // ---- Tuning ----
  const TILT_DEGREES = 25;      // how far a key tilts the pretend sensor (the games learn this as "left" when you press it)
  const TILT_EASE = 0.15;       // seconds to tilt over: a little softer than instant
  const CLIMB_SWING = 35;       // degrees the pretend arm swings forward and back while climbing...
  const CLIMB_RATE = 1.2;       // ...this many times a second
  const SHAKE = 250;            // extra jiggle while climbing (milli-G), as a real climbing arm has
  const NOISE = 20;             // a real sensor's small, constant jiggle (milli-G)
  const SAMPLE_RATE = 52;       // readings a second (sent 5 at a time, every 100 ms, like a real sensor's packets)

  // Which keys each player uses (by position on the keyboard, so other keyboard layouts work too).
  const KEYS = {
    1: { left: "KeyA", right: "KeyD", climb: "KeyW" },
    2: { left: "ArrowLeft", right: "ArrowRight", climb: "ArrowUp" }
  };
  const down = new Set();
  const allKeys = new Set(Object.values(KEYS).flatMap((k) => Object.values(k)).concat(["KeyS", "ArrowDown"]));

  function start(players) {
    addEventListener("keydown", (e) => {
      if (!allKeys.has(e.code) || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();                                            // (the arrow keys would scroll the page)
      down.add(e.code);
    });
    addEventListener("keyup", (e) => down.delete(e.code));
    addEventListener("blur", () => down.clear());                    // (a key let go in another window)
    for (const p of players) pretendSensor(p, KEYS[p.n]);
  }

  // One player's pretend sensor: every 100 ms, five readings, like a real one.
  function pretendSensor(player, keys) {
    player.rate = SAMPLE_RATE; player.setStep("ready"); player.setState("ready");
    let tilt = 0, swing = 0;
    const step = 1 / SAMPLE_RATE;
    setInterval(() => {
      const target = (down.has(keys.left) ? TILT_DEGREES : 0) - (down.has(keys.right) ? TILT_DEGREES : 0);
      const climbing = down.has(keys.climb);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        tilt += (target - tilt) * Math.min(1, step / TILT_EASE);
        swing = climbing ? swing + step : 0;
        const r = tilt * Math.PI / 180;
        const p = climbing ? CLIMB_SWING * Math.PI / 180 * (0.5 + 0.5 * Math.sin(swing * 2 * Math.PI * CLIMB_RATE)) : 0;
        const jiggle = () => (Math.random() - 0.5) * (NOISE + (climbing ? SHAKE : 0));
        samples.push([1000 * Math.sin(p) + jiggle(), 1000 * Math.cos(p) * Math.sin(r) + jiggle(), 1000 * Math.cos(p) * Math.cos(r) + jiggle()]);
      }
      player.addSamples(samples);
    }, 100);
  }

  return { start, KEYS };
})();
