// ============================================================================
// app.js: the Heartbeat Games shell
// ----------------------------------------------------------------------------
// Connects the players' sensors (and reconnects them after a drop), shows the
// setup, menu and game screens, handles the controller buttons, and runs
// games through the game contract below. Games live in the games/ folder.
// ============================================================================

const VERSION = "2.28.1";
const CONFIG = Object.assign({ sensors: { 1: "", 2: "" }, sampleRate: 416, roundSeconds: 30 }, window.HG_CONFIG || {});

// ============================================================================
// The game contract
// ----------------------------------------------------------------------------
// Each game file calls HG.registerGame({...}) with:
//   key          1 to 9: the controller button that opens it (required)
//   name         shown on the menu and in the game (required)
//   icon         an emoji for the menu tile
//   colour       tile colour, e.g. "var(--g1)" or "#ef476f"
//   howTo        one or two sentences shown before the round starts
//   introArt     optional picture shown beside howTo, e.g. how to stand: "games/art/my-game.svg"
//   menuArt      optional screenshot shown on the game's menu tile, e.g. "games/art/my-game-menu.jpg"
//   fullScreen   true to play edge to edge: the title, clock and BACK hint shrink into the corners
//   needs        "motion" (fast motion data; heart rate games come later)
//   roundSeconds length of a round (defaults to the setting in config.js)
//   countdown    false to skip the shell's 3-2-1 (for games with their own start sequence)
//   clock        "manual" to start the round clock yourself with ctx.startClock(),
//                e.g. after a warm-up; until then no timer shows and the round can't time out
//   start(ctx)        build the game's scene inside ctx.stage (called as the countdown begins)
//   update(ctx, dt)   called every frame during the countdown and the round;
//                     dt is seconds since the last frame; check ctx.phase
//                     ("countdown" or "playing") before scoring
//   end(ctx)          return the results: { scores: [p1, p2], scoreLabel, headline, detail }
//                     (all optional; with scores, the shell works out the winner)
//   showResults(el, result)  optional: draw your own results screen inside el, using
//                     what end() returned (e.g. Fly Together's photo). Without it, or if
//                     it fails, the shell shows the headline and detail.
//   cleanup(ctx)      optional: stop anything the game started (timers, sounds)
//   warmUp()          optional: return a list of small steps (functions) that get the game ready in the
//                     background (build its 3D world, draw it once so the graphics card is prepared). The
//                     shell runs them one at a time, with pauses, while the sensors connect and on the menu,
//                     never during a round, so the first round doesn't stutter.
//
// ctx gives the game:
//   ctx.stage       the element to draw in (empty at start)
//   ctx.players     two player views (below)
//   ctx.phase       "countdown" or "playing"
//   ctx.elapsed     seconds played so far; ctx.remaining: seconds left
//   ctx.endRound()  finish the round early (for example, when someone wins)
//   ctx.startClock() start the round clock (only for games with clock: "manual")
//   ctx.state       an empty object the game can keep its own data in
//
// Each player view offers:
//   p.n, p.name, p.colour    1 or 2, "Player 1", and the player's CSS colour
//   p.connected              true while their sensor is streaming
//   p.energy()               0 to 1: how much they're moving right now
//   p.motion()               the same, raw, in milli-G
//   p.tilt()                 { pitch, roll } in degrees
//   p.up()                   [x, y, z]: which way is up for the sensor (length 1)
//   p.latest()               [x, y, z]: the newest raw reading, in milli-G
//
// A game that throws an error is stopped and the menu comes back, so a bug in
// one game can't break connecting or the other games.
// ============================================================================
const HG = {
  games: [],
  problems: [],
  registerGame(game) {
    const errors = [];
    if (!game || typeof game !== "object") errors.push("it isn't an object");
    else {
      if (!Number.isInteger(game.key) || game.key < 1 || game.key > 9) errors.push("key must be a whole number from 1 to 9");
      if (!game.name) errors.push("it needs a name");
      if (typeof game.update !== "function") errors.push("it needs an update(ctx, dt) function");
      if (game.needs && game.needs !== "motion") errors.push('needs must be "motion" for now');
      if (this.games.some((g) => g.key === game.key)) errors.push("button " + game.key + " is already used by another game");
    }
    if (errors.length) {
      const message = "Game “" + ((game && game.name) || "unnamed") + "” wasn’t added: " + errors.join("; ") + ".";
      this.problems.push(message);
      console.error("[heartbeat]", message);
      return;
    }
    this.games.push(Object.assign({ icon: "🎮", colour: "var(--g1)", howTo: "", needs: "motion", roundSeconds: CONFIG.roundSeconds }, game));
    this.games.sort((a, b) => a.key - b.key);
  }
};

// ============================================================================
// Players: connection progress, automatic reconnection and live motion
// ============================================================================
// Page states (also reported in the window title for the launcher):
//   idle, connecting, settling, ready, failed, reconnecting (waiting to retry)
const STEP_ORDER = ["finding", "pairing", "starting", "ready"];
// Progress bar per step: [start, end, typical seconds]. The bar eases toward
// the end of a step without reaching it, then jumps when the step completes.
const STEP_PROGRESS = { finding: [0, .1, 5], pairing: [.1, .88, 60], starting: [.88, .98, 2] };
const RECONNECT_DELAY = 4000;        // ms between reconnection attempts
let busyPlayer = null;               // only one player connects at a time, so popups never overlap
let pageNote = null;                 // the latest problem, shown in the title for the launcher's log

class Player {
  constructor(n) {
    this.n = n; this.id = String(CONFIG.sensors[n] || "").toUpperCase();
    this.state = "idle"; this.step = null; this.stepStarted = 0; this.stepTimes = {};
    this.note = ""; this.sensor = null; this.finishSettle = null; this.closing = false;
    this.rate = CONFIG.sampleRate; this.window = []; this.motion = 0; this.lastSample = 0;
    this.up = [0, 0, 1]; this.latest = [0, 0, 1000]; this.reconnectTimer = null; this.everConnected = false;
    const card = document.getElementById("card" + n);
    card.appendChild(document.getElementById("setupCardTemplate").content.cloneNode(true));
    card.querySelector("h2").textContent = "Player " + n;
    this.card = card;
    this.view = this.makeView();
  }

  // The stable, read-only view of this player that games use.
  makeView() {
    const p = this;
    return Object.freeze({
      n: p.n, name: "Player " + p.n, colour: "var(--p" + p.n + ")",
      get connected() { return p.state === "ready" && performance.now() - p.lastSample < 2000; },
      energy: () => p.energy(),
      motion: () => p.motion,
      tilt: () => p.tilt(),
      up: () => p.up.slice(),
      latest: () => p.latest.slice()
    });
  }

  setStep(step) {
    if (this.step && this.step !== step) this.stepTimes[this.step] = (performance.now() - this.stepStarted) / 1000;
    this.step = step; this.stepStarted = performance.now();
    updateTitle();
  }
  setState(state, note = "") {
    this.state = state; this.note = note;
    if (state !== "connecting" && state !== "settling") this.detail = "";
    updateTitle();
  }

  progress() {
    if (this.state === "ready") return 1;
    if (!this.step || !STEP_PROGRESS[this.step]) return 0;
    const [from, to, typical] = STEP_PROGRESS[this.step];
    const t = (performance.now() - this.stepStarted) / 1000;
    return from + (to - from) * (1 - Math.exp(-t / (typical * 0.6)));
  }

  handlers() {
    return {
      log: (m, e) => log(this.n, m, e),
      status: () => {},
      stage: (s) => this.setStep(s === "starting" ? "starting" : "pairing"),
      detail: (d) => { this.detail = d; updateTitle(); },
      waitForSettle: (seconds) => this.waitForSettle(seconds),
      samples: (s) => this.addSamples(s),
      started: (rate) => this.onStarted(rate),
      disconnected: () => this.onDisconnected()
    };
  }

  // First connection: must come from a key press or click (Chrome's rule for its picker).
  async connect() {
    if (busyPlayer || this.state === "ready" || this.state === "connecting" || this.state === "settling") return;
    if (!/^[0-9A-F]{8}$/.test(this.id)) { this.setState("failed", "No sensor ID set for Player " + this.n + " in config.js."); return; }
    clearTimeout(this.reconnectTimer);
    busyPlayer = this; this.closing = false;
    this.setState("connecting"); this.stepTimes = {}; this.setStep("finding");
    this.sensor = new PolarSensor(this.id, this.handlers());
    try {
      await this.sensor.connect(this.rate);
    } catch (err) {
      if (busyPlayer === this) busyPlayer = null;
      this.setState("failed", err.name === "NotFoundError"
        ? "Couldn’t find sensor " + this.id + ". Is it switched on, with its blue side light showing?"
        : "Couldn’t connect. Check the sensor is on; the system will keep trying.");
      log(this.n, "Connect failed: " + err.message, true);
    }
  }

  onStarted(rate) {
    this.rate = rate; this.everConnected = true;
    this.setStep("ready"); this.setState("ready");
    if (busyPlayer === this) busyPlayer = null;
    if (app.screen !== "setup") showNotice("Player " + this.n + " is connected again!");
    onPlayerReady();
  }

  onDisconnected() {
    if (busyPlayer === this) busyPlayer = null;
    if (this.closing) { this.setState("idle", "Disconnected."); this.step = null; return; }
    log(this.n, "Sensor connection lost; reconnecting automatically.", true);
    showNotice("Player " + this.n + "’s sensor lost connection. Reconnecting… (stay close to the screen)");
    this.setState("reconnecting");
    this.scheduleReconnect(1500);
  }

  scheduleReconnect(ms) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.tryReconnect(), ms);
  }

  // Retries the same sensor until it's back in range. No picker, so no click needed.
  async tryReconnect() {
    if (this.closing || this.state === "ready" || !this.sensor) return;
    if (busyPlayer && busyPlayer !== this) { this.scheduleReconnect(RECONNECT_DELAY); return; }
    busyPlayer = this;
    this.setState("connecting"); this.stepTimes = {}; this.setStep("pairing");
    try {
      await this.sensor.reconnect(this.rate);       // onStarted runs when it's streaming again
    } catch (err) {
      if (busyPlayer === this) busyPlayer = null;
      log(this.n, "Reconnect attempt failed: " + err.message, true);
      this.setState("reconnecting");
      this.scheduleReconnect(RECONNECT_DELAY);
    }
  }

  // Waits while Windows finishes pairing. The launcher ends it early (F3) once
  // the Pairing window reports success; this timeout is the fallback.
  waitForSettle(seconds) {
    this.setState("settling");
    return new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); clearInterval(watch); this.finishSettle = null; this.setState("connecting"); resolve(); };
      const timer = setTimeout(finish, seconds * 1000);
      const watch = setInterval(() => {               // stop waiting if the sensor dropped
        if (!this.sensor || !this.sensor.device || !this.sensor.device.gatt.connected) finish();
      }, 1000);
      this.finishSettle = finish;
    });
  }

  addSamples(samples) {
    const alpha = 1 - Math.pow(1 - 0.12, 52 / this.rate);
    for (const s of samples) {
      this.window.push(s);
      const m = Math.hypot(s[0], s[1], s[2]) || 1;
      this.up = this.up.map((v, c) => v + alpha * (s[c] / m - v));
    }
    const um = Math.hypot(...this.up) || 1;
    this.up = this.up.map((v) => v / um);
    this.latest = samples[samples.length - 1].slice();
    const keep = Math.round(this.rate / 2);           // motion over the last half second
    if (this.window.length > keep) this.window.splice(0, this.window.length - keep);
    let total = 0;
    for (let c = 0; c < 3; c++) {
      const mean = this.window.reduce((a, s) => a + s[c], 0) / this.window.length;
      total += this.window.reduce((a, s) => a + (s[c] - mean) ** 2, 0) / this.window.length;
    }
    this.motion = Math.sqrt(total);
    this.lastSample = performance.now();
  }

  energy() {
    if (performance.now() - this.lastSample > 2000) return 0;
    return Math.min(1, Math.log10(1 + this.motion / 15) / Math.log10(1 + 600 / 15));
  }

  tilt() {
    const [x, y, z] = this.up;
    return { pitch: Math.atan2(-x, Math.hypot(y, z)) * 180 / Math.PI, roll: Math.atan2(y, z) * 180 / Math.PI };
  }

  renderCard() {
    const failed = this.state === "failed";
    const waiting = this.state === "reconnecting";
    this.card.classList.toggle("failed", failed);
    const current = STEP_ORDER.indexOf(this.state === "ready" ? "ready" : this.step);
    this.card.querySelectorAll(".steps li").forEach((li, i) => {
      li.classList.toggle("done", this.state === "ready" ? true : i < current);
      li.classList.toggle("now", !failed && !waiting && this.state !== "ready" && i === current);
      const time = li.querySelector(".time"), step = li.dataset.step;
      if (step === this.step && this.state !== "ready" && !failed && !waiting) time.textContent = clock((performance.now() - this.stepStarted) / 1000);
      else if (this.stepTimes[step] !== undefined) time.textContent = clock(this.stepTimes[step]);
      else time.textContent = "";
    });
    this.card.querySelector(".bar > div").style.width = (this.progress() * 100).toFixed(1) + "%";
    let note = this.note;
    if (!note) {
      if (waiting) note = "Lost connection. Trying again… make sure the sensor is on and nearby.";
      else if (this.state === "idle" && busyPlayer && busyPlayer !== this) note = "Waiting for Player " + busyPlayer.n + " to finish.";
      else if (this.state === "idle") note = "Waiting to start.";
      else if (this.step === "pairing") note = "Windows is pairing with the sensor. This takes about a minute.";
      else if (this.step === "finding") note = "Looking for sensor " + this.id + "…";
      else if (this.step === "starting") note = "Almost there…";
      else if (this.state === "ready") note = "Connected and streaming.";
    }
    this.card.querySelector(".card-note").textContent = note;
  }

  chipLabel() {
    if (this.state === "ready") return "Player " + this.n;
    if (this.state === "reconnecting" || this.state === "connecting" || this.state === "settling") return "Player " + this.n + ": reconnecting…";
    return "Player " + this.n + ": not connected";
  }
}

// ---- Demo mode: simulated sensors for building games without hardware ----
function startDemo() {
  document.body.classList.add("demo");
  for (const p of players) {
    if (p.state === "ready") continue;
    p.rate = 52; p.setStep("ready"); p.setState("ready");
    let phase = Math.random() * 10;
    setInterval(() => {
      phase += 0.05;
      const lively = (Math.sin(phase * 0.7 + p.n) + 1) / 2;
      const tiltX = Math.sin(phase * 0.3 + p.n) * 500;
      p.addSamples(Array.from({ length: 5 }, () => [
        tiltX + (Math.random() - .5) * 600 * lively, (Math.random() - .5) * 600 * lively,
        Math.sqrt(Math.max(0, 1e6 - tiltX * tiltX)) + (Math.random() - .5) * 600 * lively]));
    }, 100);
  }
  onPlayerReady();
}

// ============================================================================
// Screens and the game runner
// ============================================================================
const app = { screen: "setup", game: null, phase: null, ctx: null, roundEnds: 0, roundStarted: 0, countdownEnds: 0, backArmedUntil: 0 };
let players = [];

function show(screen) {
  app.screen = screen;
  for (const el of document.querySelectorAll(".screen")) el.classList.toggle("active", el.id === screen);
}

function onPlayerReady() {
  if (players.every((p) => p.state === "ready") && app.screen === "setup") {
    document.getElementById("setupTitle").textContent = "All set!";
    document.getElementById("setupSub").textContent = "Both sensors are connected. Opening the games…";
    setTimeout(() => { if (app.screen === "setup") show("menu"); }, 2500);
  }
}

// Calls a game function safely: a failing game is stopped and the menu returns.
function callGame(name, ...args) {
  const fn = app.game && app.game[name];
  if (typeof fn !== "function") return undefined;
  try {
    return fn.apply(app.game, args);
  } catch (err) {
    console.error("[heartbeat] " + app.game.name + " failed in " + name + "():", err);
    log(0, app.game.name + " failed in " + name + "(): " + err.message, true);
    const failedGame = app.game;
    stopGame();
    show("menu");
    showNotice("Sorry, " + failedGame.name + " hit a problem and was stopped.");
    return undefined;
  }
}

function stopGame() {
  if (app.ctx && app.game && typeof app.game.cleanup === "function") {
    try { app.game.cleanup(app.ctx); } catch (err) { console.error("[heartbeat] cleanup failed:", err); }
  }
  app.ctx = null; app.phase = null;
  document.getElementById("gameStage").innerHTML = "";
  document.getElementById("countdown").textContent = "";
}

function openGame(game) {
  stopGame();
  hideNotice();                        // e.g. a "coming soon" message from the menu
  app.game = game; app.phase = "intro";
  document.getElementById("gameIcon").textContent = game.icon;
  document.getElementById("gameName").textContent = game.name;
  show("game");
  renderGamePhase();
}

function startRound() {
  stopGame();
  app.gameTime = 0;                    // seconds of game time since Start (tests follow this clock)
  app.phase = "countdown";
  app.countdownEnds = performance.now() + 3000;
  const stage = document.getElementById("gameStage");
  const ctx = {
    stage, players: players.map((p) => p.view), phase: "countdown", elapsed: 0,
    remaining: app.game.roundSeconds, state: {},
    endRound: () => { if (app.phase === "playing") finishRound(); },
    startClock: () => { if (!app.clockRunning) startClock(performance.now()); }
  };
  app.clockRunning = false;
  app.ctx = ctx;
  renderGamePhase();
  callGame("start", ctx);
}

function finishRound() {
  const ctx = app.ctx;
  if (!ctx) return;
  const result = callGame("end", ctx) || {};
  if (!app.ctx) return;                                // the game failed in end()
  try { if (typeof app.game.cleanup === "function") app.game.cleanup(ctx); } catch (err) {}
  app.ctx = null;
  app.phase = "results";
  app.result = result;
  renderGamePhase();
}

function renderGamePhase() {
  const intro = document.getElementById("gameIntro"), results = document.getElementById("gameResults");
  const stage = document.getElementById("gameStage"), hint = document.getElementById("gameHint");
  intro.hidden = app.phase !== "intro";
  results.hidden = app.phase !== "results";
  stage.hidden = !(app.phase === "countdown" || app.phase === "playing");
  document.getElementById("game").classList.toggle("full", !!(app.game && app.game.fullScreen) && !stage.hidden);
  document.getElementById("gameTimer").textContent = "";
  if (app.phase === "intro") {
    document.getElementById("gameHowTo").textContent = app.game.howTo;
    const art = document.getElementById("gameArt");
    intro.classList.toggle("with-art", !!app.game.introArt);
    art.hidden = !app.game.introArt;
    if (app.game.introArt && art.getAttribute("src") !== app.game.introArt) art.src = app.game.introArt;
    hint.innerHTML = '<span class="key">BACK</span> for the menu';
  } else if (app.phase === "countdown" || app.phase === "playing") {
    hint.innerHTML = '<span class="key">BACK</span> twice to stop';
  } else if (app.phase === "results") {
    const r = app.result || {};
    hint.innerHTML = '<span class="key">START</span> to play again · <span class="key">BACK</span> for the menu';
    // The game's own results screen, if it has one.
    const custom = document.getElementById("resultsCustom"), plain = document.getElementById("resultsPlain");
    let own = typeof app.game.showResults === "function";
    custom.innerHTML = "";
    if (own) {
      results.classList.add("custom"); custom.hidden = false; plain.hidden = true;
      try { app.game.showResults(custom, r); }
      catch (err) { log(0, app.game.name + " failed in showResults(): " + err.message, true); own = false; custom.innerHTML = ""; }
    }
    if (own) return;
    results.classList.remove("custom"); custom.hidden = true; plain.hidden = false;
    let headline = r.headline, detail = r.detail;
    if (Array.isArray(r.scores)) {
      const label = r.scoreLabel || "points";
      const both = players.every((p) => p.state === "ready" || p.everConnected);
      const [a, b] = r.scores.map(Number);
      // Whole numbers for big scores; one decimal for small ones like seconds.
      const show = (v) => (Number.isInteger(v) || Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1));
      const tie = show(a) === show(b);
      if (!headline) headline = !both ? "Nice moving!" : tie ? "It’s a tie!" : "Player " + (a > b ? 1 : 2) + " wins!";
      if (!detail) detail = "Player 1: " + show(a) + " " + label + " · Player 2: " + show(b) + " " + label;
    }
    document.getElementById("resultsHeadline").textContent = headline || "Well done!";
    document.getElementById("resultsDetail").textContent = detail || "";
  }
}

function startClock(now) {
  app.clockRunning = true;
  app.roundStarted = now;
  app.roundEnds = now + app.game.roundSeconds * 1000;
}

function tickGame(now, dt) {
  if (app.screen !== "game" || !app.ctx) return;
  app.gameTime += dt;
  const ctx = app.ctx, timer = document.getElementById("gameTimer"), countdown = document.getElementById("countdown");
  if (app.phase === "countdown") {
    const ownStart = app.game.countdown === false;            // the game runs its own start sequence
    const left = Math.ceil((app.countdownEnds - now) / 1000);
    if (!ownStart) countdown.textContent = left > 0 ? left : "GO!";
    if (ownStart || now >= app.countdownEnds) {
      app.phase = "playing"; ctx.phase = "playing";
      if (app.game.clock !== "manual") startClock(now);
      if (!ownStart) setTimeout(() => { if (app.phase === "playing") countdown.textContent = ""; }, 600);
    }
  }
  if (app.phase === "playing") {
    if (app.clockRunning) {
      ctx.elapsed = (now - app.roundStarted) / 1000;
      ctx.remaining = Math.max(0, (app.roundEnds - now) / 1000);
      timer.textContent = clock(ctx.remaining);
    } else {
      ctx.elapsed = 0; ctx.remaining = app.game.roundSeconds;
      timer.textContent = "";
    }
  }
  callGame("update", ctx, dt);
  if (app.phase === "playing" && app.ctx && app.clockRunning && ctx.remaining <= 0) finishRound();
}

// ============================================================================
// Controller buttons: the Stream Deck sends Ctrl + Alt + Shift + key
//   1 to 9  open a game         S  start         B  back
//   F1/F2   connect a player    F3 pairing done  F4 disconnect both
//   F9      demo mode (simulated sensors)
// ============================================================================
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey && e.altKey && e.shiftKey)) return;
  const code = e.code;
  if (code === "F1" || code === "F2") { e.preventDefault(); players[code === "F1" ? 0 : 1].connect(); return; }
  if (code === "F3") {
    e.preventDefault();
    if (busyPlayer && busyPlayer.finishSettle) { log(busyPlayer.n, "Windows finished pairing."); busyPlayer.finishSettle(); }
    return;
  }
  if (code === "F4") {
    e.preventDefault();
    for (const p of players) { p.closing = true; clearTimeout(p.reconnectTimer); if (p.sensor) p.sensor.disconnect(); }
    return;
  }
  if (code === "F9") { e.preventDefault(); startDemo(); return; }
  const digit = /^Digit([1-9])$/.exec(code);
  if (digit) {
    e.preventDefault();
    const game = HG.games.find((g) => g.key === Number(digit[1]));
    if (!game) { if (app.screen === "menu") showNotice("Game " + digit[1] + " is coming soon!", 2500); return; }
    if (app.screen === "game" && (app.phase === "playing" || app.phase === "countdown")) {
      showNotice("A game is running. Press BACK twice to stop it first.");
      return;
    }
    if (app.screen === "setup" && !players.some((p) => p.state === "ready")) return;
    openGame(game);
    return;
  }
  if (code === "KeyS") {
    e.preventDefault();
    if (app.screen === "game" && (app.phase === "intro" || app.phase === "results")) startRound();
    return;
  }
  if (code === "KeyB") {
    e.preventDefault();
    if (app.screen === "game" && (app.phase === "playing" || app.phase === "countdown")) {
      if (performance.now() < app.backArmedUntil) { app.backArmedUntil = 0; hideNotice(); stopGame(); show("menu"); }
      else { app.backArmedUntil = performance.now() + 3000; showNotice("Press BACK again to stop the game."); }
      return;
    }
    if (app.screen === "game") { stopGame(); show("menu"); return; }
    if (app.screen === "setup" && players.some((p) => p.state === "ready") && !busyPlayer) { show("menu"); return; }
  }
});

// ============================================================================
// Helpers, rendering and start-up
// ============================================================================
function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

let noticeTimer = null;
function showNotice(text, ms = 5000) {
  const n = document.getElementById("notice");
  n.textContent = text; n.classList.add("show");
  clearTimeout(noticeTimer); noticeTimer = setTimeout(hideNotice, ms);
}
function hideNotice() { document.getElementById("notice").classList.remove("show"); }

function log(who, message, isError = false) {
  const line = (performance.now() / 1000).toFixed(1) + "s " + (who ? "P" + who : "app") + " " + message;
  (isError ? console.warn : console.log)("[heartbeat]", line);
  const list = document.getElementById("log"), item = document.createElement("li");
  item.textContent = line; list.appendChild(item);
  while (list.children.length > 300) list.firstChild.remove();
  // Problems also go into the window title, so the launcher can copy them into heartbeat-log.txt.
  if (isError) {
    const text = message.replace(/[\r\n|]+/g, " ").replace(/:/g, " -").slice(0, 160);
    pageNote = { n: (pageNote ? pageNote.n : 0) + 1, who: who ? "P" + who : "app", text };
    updateTitle();
  }
}

// The launcher reads this title to follow progress, e.g. "P1:ready P2:settling".
// A numbered problem note may follow: "... | note 3 P2 Reconnect attempt failed - ...".
// While connecting, the current step is added after a dash ("P1:connecting-pairing")
// so the launcher's log shows exactly where a connection is.
function updateTitle() {
  if (!players.length) return;
  document.title = "Heartbeat Games | " + players.map((p) => "P" + p.n + ":" + p.state + (p.detail && p.detail !== p.state ? "-" + p.detail : "")).join(" ")
    + (pageNote ? " | note " + pageNote.n + " " + pageNote.who + " " + pageNote.text : "");
}

// The menu always shows this many buttons; a number with no game yet shows "Coming soon". (2 since 2.28.0: the two
// games, each half the screen. A game's menuArt fills its whole tile, with its number in a corner and its name below.)
const MENU_SLOTS = 2;

function buildMenu() {
  const tiles = document.getElementById("tiles");
  tiles.innerHTML = "";
  const slots = Math.max(MENU_SLOTS, ...HG.games.map((g) => g.key));
  for (let key = 1; key <= slots; key++) {
    const g = HG.games.find((game) => game.key === key);
    const tile = document.createElement("div");
    tile.className = "tile" + (g ? "" : " soon") + (g && g.menuArt ? " has-art" : "");
    if (g) tile.style.setProperty("--tile", g.colour);
    tile.innerHTML = '<div class="num"></div>' + (g && g.menuArt ? '<div class="shot"></div>' : '<div class="icon"></div>') + '<div class="name"></div>';
    tile.querySelector(".num").textContent = key;
    if (g && g.menuArt) tile.querySelector(".shot").style.backgroundImage = 'url("' + g.menuArt + '")';
    else tile.querySelector(".icon").textContent = g ? g.icon : "";
    tile.querySelector(".name").textContent = g ? g.name : "Coming soon";
    tiles.appendChild(tile);
  }
  tiles.style.gridTemplateColumns = "repeat(" + Math.min(slots, 4) + ", 1fr)";
  const chips = players.map((p) => '<div class="chip p' + p.n + '"><div class="meter"><div></div></div><span class="chip-label"></span></div>').join("");
  document.getElementById("chips").innerHTML = chips;
  document.getElementById("gameChips").innerHTML = chips;
}

function renderSetup() {
  for (const p of players) p.renderCard();
  const overall = (players[0].progress() + players[1].progress()) / 2;
  document.getElementById("overallFill").style.width = (overall * 100).toFixed(1) + "%";
  const failed = players.filter((p) => p.state === "failed");
  const hint = document.getElementById("setupHint");
  if (failed.length && players.some((p) => p.state === "ready"))
    hint.innerHTML = 'To play with one player for now, press <span class="key">BACK</span>.';
  else if (failed.length)
    hint.textContent = "Check the sensors are switched on (blue side light). Staff: press Ctrl + Alt + Shift + R to try again.";
  else hint.innerHTML = "&nbsp;";
  const title = document.getElementById("setupTitle");
  if (failed.length) title.textContent = "A sensor needs attention";
  else if (!players.every((p) => p.state === "ready")) title.textContent = "Getting ready…";
}

function renderChips() {
  document.querySelectorAll(".chips").forEach((group) => {
    group.querySelectorAll(".chip").forEach((chip, i) => {
      const p = players[i], live = p.state === "ready";
      chip.classList.toggle("off", !live);
      chip.querySelector(".meter > div").style.width = (live ? p.energy() * 100 : 0).toFixed(1) + "%";
      const label = p.chipLabel(), el = chip.querySelector(".chip-label");
      if (el.textContent !== label) el.textContent = label;
    });
  });
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (app.screen === "setup") renderSetup();
  renderChips();
  tickGame(now, dt);
  requestAnimationFrame(frame);
}

// If the window closes without the tidy shutdown, try to leave fast mode anyway.
window.addEventListener("pagehide", () => {
  for (const p of players) {
    const s = p.sensor;
    if (s && s.sdkMode && s.controlPoint && s.device && s.device.gatt.connected) {
      try {
        s.controlPoint.writeValue(new Uint8Array([CMD_STOP, ACC]))
          .then(() => s.controlPoint.writeValue(new Uint8Array([CMD_STOP, SDK_MODE])))
          .catch(() => {});
      } catch (err) {}
    }
  }
});

// Getting the games ready in the background: each game's warmUp steps (see the game contract), one at a time,
// with a pause between so the page stays responsive while the sensors connect. Never during a round: if a
// round is on, it waits. A step that fails is skipped (the game then just gets ready when it's first played).
const WARM_UP_FIRST = 1500;          // ms after the page opens before the first step
const WARM_UP_PAUSE = 150;           // ms between steps
function warmUpGames() {
  if (/[?&]nowarm\b/.test(location.search)) return;                 // (for testing: "?nowarm" on the page's address skips it)
  const steps = [];
  for (const game of HG.games) {
    if (typeof game.warmUp !== "function") continue;
    try { for (const step of game.warmUp()) steps.push({ game, step }); }
    catch (err) { console.warn("[heartbeat] couldn't get " + game.name + " ready in the background:", err); }
  }
  const started = performance.now();
  const next = () => {
    if (!steps.length) { console.info("[heartbeat] games ready (" + ((performance.now() - started) / 1000).toFixed(1) + " s)"); HG.warm = true; return; }
    if (app.screen === "game") { setTimeout(next, 1000); return; }
    const { game, step } = steps.shift();
    try { step(); }
    catch (err) { console.warn("[heartbeat] getting " + game.name + " ready:", err); steps.splice(0, steps.length, ...steps.filter((s) => s.game !== game)); }
    setTimeout(next, WARM_UP_PAUSE);
  };
  setTimeout(next, WARM_UP_FIRST);
}

// Called at the bottom of heartbeat-games.html, after the games have loaded.
HG.start = function () {
  players = [new Player(1), new Player(2)];
  document.getElementById("version").textContent = "v" + VERSION;
  buildMenu();
  updateTitle();
  for (const message of HG.problems) showNotice(message);
  requestAnimationFrame(frame);
  warmUpGames();
};
