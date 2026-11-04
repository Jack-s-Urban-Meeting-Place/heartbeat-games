# Testing a game without the sensors

The real sensors, Bluetooth pairing and the launcher can only be tested on the
studio setup. Everything else (the game itself, calibration, one and two players,
results, the shell) can be tested in a hidden browser with simulated sensors, and
should be, before handing anything to the user.

## Setup (once per computer)

From the HeartbeatGames folder (Node.js must be installed):

```
npm install --save-dev playwright
npx playwright install chromium
```

Add `node_modules/`, `package.json`, `package-lock.json` and `test-output/` to
`.gitignore` if they shouldn't be committed. They aren't needed to run the games.

## The script: tools/try-game.mjs

```
node tools/try-game.mjs --game 1
node tools/try-game.mjs --game 1 --players 1 --seconds 40
node tools/try-game.mjs --game 1 --timeline moves.json --size 960x540
```

It replaces `PolarSensor` with simulated sensors (the sensor IDs come from
`config.js`), connects both players through the real shell, opens the game by its
button number, presses Start, plays a movement timeline, prints each change of
screen/phase/nest step/big message, saves screenshots, then ends the round and
prints the results. Timeline times are in **game seconds** (`app.gameTime`), so it
stays in step even when 3D drawing is slow.

A timeline is a JSON list. Tilt is in degrees: positive = lean left, negative =
lean right, 0 = level. `"shake": true` adds big random movement (running, jumping).
`"climb": true` swings the arm as if climbing on the spot (Climb Together; game 2 has
its own default timeline). `{ "at": 13, "js": "..." }` runs a line of code in the page
instead, e.g. to jump the chameleons up the climb or bring the next cat sooner.
For Climb Together the script also prints whether each player counts as moving.

```json
[
  { "at": 0, "player": "both", "tilt": 0 },
  { "at": 3, "player": 1, "tilt": 25 },
  { "at": 3, "player": 2, "tilt": 25 },
  { "at": 5.5, "player": "both", "tilt": 0 },
  { "at": 15, "player": 1, "tilt": -20, "shake": true },
  { "at": 18, "player": 1, "tilt": 0, "shake": false }
]
```

`--players 1` makes player 2's sensor lie still "on a table" (tests solo detection).

**Smoothness:** `--frames` reports how long frames took (the usual frame, the longest, and any over a second,
with the game time). `--warm` waits until the games have got ready in the background before opening one;
`--no-warm` skips that, to compare. Use a screenshot interval longer than the run (e.g. `--every 999`) when
measuring: taking a screenshot is itself a long frame. The hidden test browser draws in software, so compare
runs with each other rather than reading the numbers as the laptop's.

For checks the script doesn't cover, write a small one-off script in the same
style: open the page, run the MOCK, then use `page.evaluate` to read game state
(`app.ctx.state` is the running game's own state) or to force situations (move a
bird next to a wall, set a streak, end the round).

## What to test for every game

1. Two players, start to results, following the game's intended movements.
2. One player (`--players 1`): solo behaviour and wording.
3. A player who never calibrates; a sensor dropping out mid-round
   (call the simulated sensor's `h.disconnected()`, then let the shell reconnect).
4. Back pressed once (warning) and twice (menu) during a round; Start again from results.
5. Other games still work: open each menu button briefly.
6. **Look at the screenshots** at a realistic size (1366x768 or 1920x1080) in light
   and dark mode. Check text doesn't overlap, players are readable, the controller
   hints stay on screen.

## Pitfalls met before

- With Playwright's `page.evaluate("...")`, a string that is a function expression
  gets *called*. To install a function (e.g. replace a method), wrap it:
  `page.evaluate("() => { thing.method = () => {...}; }")`.
- Software 3D (`--software`, or a hidden browser without graphics) can run at one
  or two frames a second. Use game time, small sizes (e.g. `--size 640x360`) for
  long runs, and full size only for screenshots you'll inspect.
- The round timer on screen follows real time; `app.gameTime` follows game time.
  They differ when drawing is slow; that's expected in tests.
- A 404 for the Google font is normal when offline.
- `HG.flight3d` keeps one shared 3D renderer for all rounds (graphics contexts are
  limited); a game using it must detach it in `cleanup()`.
- A new 3D game should offer `warmUp()` steps (see the game contract) that draw its world once from each place
  a round goes, so shaders and pictures are ready, and read one dot back after each step: the browser otherwise
  puts the drawing off until the first round, which then stutters badly.
