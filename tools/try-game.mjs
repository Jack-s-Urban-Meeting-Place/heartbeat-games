// ============================================================================
// try-game.mjs: play a Heartbeat Game in a hidden browser with simulated sensors
// ----------------------------------------------------------------------------
// Opens heartbeat-games.html, replaces the Bluetooth sensors with simulated ones,
// connects both players, opens a game, presses Start, and plays a scripted
// "arm movement" timeline while saving screenshots and printing what happens.
//
// One-time setup (from the HeartbeatGames folder):
//   npm install --save-dev playwright
//   npx playwright install chromium
//
// Examples:
//   node tools/try-game.mjs --game 1
//   node tools/try-game.mjs --game 1 --players 1 --seconds 40
//   node tools/try-game.mjs --game 2 --timeline my-moves.json
//
// Options:
//   --game N         button number of the game to open (default 1)
//   --players 1|2    2 = both players move; 1 = player 2's sensor lies still "on a table"
//   --seconds N      game seconds to run after pressing Start (default 30)
//   --every N        screenshot every N game seconds (default 3)
//   --timeline FILE  JSON list of moves: [{ "at": 2.5, "player": 1, "tilt": 25 }, ...]
//                    tilt in degrees: positive = lean left, negative = lean right, 0 = level.
//                    "player": "both" moves both. Optional "shake": true adds big movement;
//                    "climb": true swings the arm as if climbing on the spot (Climb Together).
//                    { "at": 12, "js": "..." } runs a line of code in the page instead (e.g. to skip ahead).
//                    Game 2 (Climb Together) has its own default timeline below.
//   --out DIR        where screenshots go (default test-output/)
//   --size WxH       browser size (default 1366x768; smaller renders 3D faster)
//   --software       force software 3D (slow, but works on any computer)
//   --warm           wait until the games have got ready in the background (HG.warm) before opening the game
//   --no-warm        don't get the games ready in the background at all (to compare)
//   --frames         report how long frames took: the usual frame, and the longest hitches (stutters)
//
// Times are GAME seconds (the game's own clock, app.gameTime), so the timeline stays
// in step even when 3D drawing is slow. The default timeline walks through the
// nest start: arms level, lean left, level again, then gentle steering.
// ============================================================================
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("playwright-core")); }

// ---- Options ----
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes("--" + name);
const game = opt("game", "1");
const players = Number(opt("players", "2"));
const seconds = Number(opt("seconds", "30"));
const every = Number(opt("every", "3"));
const outDir = opt("out", "test-output");
const [width, height] = opt("size", "1366x768").split("x").map(Number);

// The HeartbeatGames folder: this script lives in tools/
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const page = pathToFileURL(path.join(root, "heartbeat-games.html")).href + (flag("no-warm") ? "?nowarm" : "");
const config = fs.readFileSync(path.join(root, "config.js"), "utf8");
const ids = [...config.matchAll(/"([0-9A-Fa-f]{8})"/g)].map((m) => m[1].toUpperCase());
if (ids.length < 2) throw new Error("Couldn't find two sensor IDs in config.js");

const defaultTimeline = [
  { at: 0, player: "both", tilt: 0 },          // arms out, level (step 1)
  { at: 3, player: 1, tilt: 25 },              // lean left (step 2)
  ...(players === 2 ? [{ at: 3, player: 2, tilt: 25 }] : []),
  { at: 5.5, player: "both", tilt: 0 },        // back to level (step 3, then 3-2-1)
  { at: 16, player: "both", tilt: -15 },       // gentle steering right...
  { at: 18, player: "both", tilt: 12 },        // ...and left
  { at: 20, player: "both", tilt: 0 }
];
// Climb Together (button 2): hands up and still, climb on the spot, climb to the left, climb to
// the right, freeze (the tank's front pops off), then climb, steer, and freeze when a cat comes.
const climbTimeline = [
  { at: 0, player: "both", tilt: 0 },
  { at: 2.5, player: 1, climb: true },
  ...(players === 2 ? [{ at: 2.5, player: 2, climb: true }] : []),
  { at: 5.5, player: 1, climb: true, tilt: 25 },
  ...(players === 2 ? [{ at: 5.5, player: 2, climb: true, tilt: 25 }] : []),
  { at: 8.5, player: 1, climb: true, tilt: -25 },
  ...(players === 2 ? [{ at: 8.5, player: 2, climb: true, tilt: -25 }] : []),
  { at: 12.5, player: "both", tilt: 0 },                     // freeze
  { at: 15.5, player: 1, climb: true },
  ...(players === 2 ? [{ at: 15.5, player: 2, climb: true }] : []),
  { at: 19.5, player: 1, climb: true, tilt: -15 },
  { at: 21.5, player: 1, climb: true, tilt: 0 },
  { at: 26, player: "both", tilt: 0 },                       // freeze for the cat
  { at: 31.5, player: 1, climb: true },
  ...(players === 2 ? [{ at: 32, player: 2, climb: true }] : [])
];
const timeline = opt("timeline") ? JSON.parse(fs.readFileSync(opt("timeline"), "utf8")) : game === "2" ? climbTimeline : defaultTimeline;

// ---- Simulated sensors ----
// Each sensor streams "up" readings; tilting rotates them. A sensor "on the table"
// barely changes; "shake" adds big random movement (running, jumping).
const MOCK = `(ids) => {
  window.simTilt = { [ids[0]]: 0, [ids[1]]: 0 };
  window.simShake = { [ids[0]]: false, [ids[1]]: false };
  window.simClimb = { [ids[0]]: false, [ids[1]]: false };
  window.simStill = { [ids[0]]: false, [ids[1]]: ${players === 1 ? "true" : "false"} };
  PolarSensor.prototype.connect = async function (rate) {
    this.device = { gatt: { connected: true, disconnect() {} } };
    await new Promise((r) => setTimeout(r, 200)); this.h.stage("pairing");
    await this.h.waitForSettle(150); this.h.stage("starting"); this.h.started(52);
    let clock = 0;
    setInterval(() => {
      const r = window.simTilt[this.id] * Math.PI / 180, noise = window.simStill[this.id] ? 3 : 20;
      const big = window.simShake[this.id] ? 600 : window.simClimb[this.id] ? 250 : 0;
      this.h.samples(Array.from({ length: 5 }, () => {
        // Climbing: the forearm swings forward and back (about 35 degrees) about once a second.
        clock += 0.02;
        const p = window.simClimb[this.id] ? 35 * Math.PI / 180 * (0.5 + 0.5 * Math.sin(clock * 2 * Math.PI * 1.2)) : 0;
        return [1000 * Math.sin(p) + (Math.random() - .5) * (noise + big), 1000 * Math.cos(p) * Math.sin(r) + (Math.random() - .5) * (noise + big),
          1000 * Math.cos(p) * Math.cos(r) + (Math.random() - .5) * (noise + big)];
      }));
    }, 100);
  };
  PolarSensor.prototype.disconnect = async function () {};
}`;

const launchArgs = flag("software") ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];
const browser = await chromium.launch({ args: launchArgs, executablePath: process.env.CHROME_PATH || undefined });
const tab = await browser.newPage({ viewport: { width, height } });
const problems = [];
tab.on("pageerror", (e) => problems.push("page error: " + e.message));
tab.on("console", (m) => { if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|fonts/.test(m.text())) problems.push("console: " + m.text()); });

const key = (k) => tab.keyboard.press("Control+Alt+Shift+" + k);
await tab.goto(page);
await tab.evaluate(`(${MOCK})(${JSON.stringify(ids)})`);
for (const k of ["F1", "F3", "F2", "F3"]) { await key(k); await tab.waitForTimeout(400); }
await tab.waitForTimeout(3000);                                     // "All set!" then the menu
const menu = await tab.evaluate(() => [...document.querySelectorAll(".tile .name")].map((t) => t.textContent));
console.log("Menu:", menu.join(", ") || "(empty)");
fs.mkdirSync(outDir, { recursive: true });
if (flag("warm")) {
  const waited = Date.now();
  await tab.waitForFunction(() => HG.warm === true, null, { timeout: 600000 });
  console.log("Games ready in the background after " + ((Date.now() - waited) / 1000).toFixed(0) + " s more");
}

await key(game); await tab.waitForTimeout(300);
console.log("Opened:", await tab.evaluate(() => app.game && app.game.name));
await tab.screenshot({ path: path.join(outDir, "00-intro.png") });
if (flag("frames")) await tab.evaluate(() => {        // note every frame's length, from Start on
  window.frameLog = []; window.hitchLog = []; let last = performance.now();
  const tick = (t) => {
    const d = t - last; window.frameLog.push(d); last = t;
    if (d > 1000) window.hitchLog.push((d / 1000).toFixed(1) + " s at game time " + (app.gameTime || 0).toFixed(1) + " (" + app.phase + ")");
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await key("S");

// ---- Play the timeline (in game time) ----
const start = Date.now(), realLimit = Math.max(120, seconds * 30) * 1000;   // give up if drawing is hopelessly slow
let next = every > seconds ? Infinity : 0, shot = 1, lastState = "";   // (screenshots every more than the whole run: none)
const pending = [...timeline].sort((a, b) => a.at - b.at);
while (Date.now() - start < realLimit) {
  const [t, roundOver] = await tab.evaluate(() => [app.gameTime || 0, app.phase === "results" || !app.ctx]);
  if (t >= seconds) break;
  if (roundOver) { console.log(t.toFixed(1).padStart(5) + "s  the game ended the round"); break; }
  while (pending.length && pending[0].at <= t) {
    const m = pending.shift();
    const who = m.player === "both" ? ids : [ids[Number(m.player) - 1]];
    if (m.js) { await tab.evaluate(m.js); continue; }          // a line of code to run in the page (e.g. to jump ahead)
    await tab.evaluate(([who, tilt, shake, climb]) => who.forEach((id) => {
      window.simTilt[id] = tilt; window.simShake[id] = !!shake; window.simClimb[id] = !!climb;
    }), [who, m.tilt ?? 0, m.shake, m.climb]);
  }
  const state = await tab.evaluate(() => {
    const words = (sel) => { const el = document.querySelector(sel); return el ? el.innerText.replace(/\s+/g, " ").trim() : ""; };
    const launch = app.ctx && app.ctx.state && app.ctx.state.launch;
    const climbers = app.ctx && app.ctx.state && app.ctx.state.climbers;   // Climb Together: how much each player is moving
    const moving = climbers ? "moving " + climbers.map((c) => (c.energy > 0.32 ? "yes" : "no")).join("/") : "";
    return [app.screen, app.phase, launch ? "start:" + launch.step : "", moving, words(".fl-message")]
      .filter(Boolean).join(" | ");
  });
  if (state !== lastState) { console.log(t.toFixed(1).padStart(5) + "s  " + state); lastState = state; }
  if (t >= next) { await tab.screenshot({ path: path.join(outDir, String(shot++).padStart(2, "0") + "-" + Math.round(t) + "s.png") }); next += every; }
  await tab.waitForTimeout(250);
}

if (flag("frames")) {
  const f = await tab.evaluate(() => window.frameLog.slice(1));
  const sorted = [...f].sort((a, b) => a - b), at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const usual = at(0.5);
  console.log(`Frames: ${f.length}, usual ${usual.toFixed(0)} ms, 95% under ${at(0.95).toFixed(0)} ms, longest ${sorted.slice(-5).reverse().map((v) => v.toFixed(0)).join(", ")} ms; ` +
    `${f.filter((v) => v > usual * 3).length} hitches over 3x the usual`);
  const long = await tab.evaluate(() => window.hitchLog);
  if (long.length) console.log("Frames over a second: " + long.join("; "));
}

// ---- Finish the round (if the game hasn't already) and show the results ----
await tab.evaluate(() => { if (app.phase !== "results") { if (app.clockRunning) app.roundEnds = performance.now() + 200; else if (app.ctx) app.ctx.endRound(); } });
await tab.waitForTimeout(1200);
const results = await tab.evaluate(() => {
  const custom = document.getElementById("resultsCustom");
  if (custom && !custom.hidden) return { phase: app.phase, headline: "(the game's own results screen)", detail: custom.innerText.replace(/\s+/g, " ").trim() };
  return { phase: app.phase, headline: document.getElementById("resultsHeadline").textContent, detail: document.getElementById("resultsDetail").textContent };
});
console.log("Results:", results.phase === "results" ? results.headline + " | " + results.detail : "(round didn't reach results: " + results.phase + ")");
if (results.headline.startsWith("(the game")) {
  await tab.waitForTimeout(6000);                        // let any results animation finish before the screenshot
}
await tab.screenshot({ path: path.join(outDir, "99-results.png") });
console.log(problems.length ? "PROBLEMS:\n  " + problems.join("\n  ") : "No errors.");
const realSeconds = (Date.now() - start) / 1000;
if (realSeconds > seconds * 2) console.log(`Note: ${seconds} game seconds took ${realSeconds.toFixed(0)} real seconds (slow 3D drawing in the hidden browser).`);
console.log("Screenshots in " + path.resolve(outDir));
await browser.close();
