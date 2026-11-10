# Making a Heartbeat Game: the playbook

How games for this project are designed, built, tested and shipped. It's written for
whoever does the building: an AI coding assistant (this project was built with
Claude Code) or a person. Read [`AGENTS.md`](../../AGENTS.md) in the project root first:
it explains the whole system, the hard-won Bluetooth facts and the decisions already made.

The other files in this folder:

| File | What it's for |
|---|---|
| [`storyboards.md`](storyboards.md) | How to read the whiteboard storyboards (colours, labels, kinds of panel), with worked examples from Fly Together |
| [`sensor-and-feel.md`](sensor-and-feel.md) | What the sensor can and can't sense, per-player calibration, and what makes a game work in a busy room of kids |
| [`testing.md`](testing.md) | Testing without sensors, using simulated sensors in a hidden browser (`tools/try-game.mjs`) |

Heartbeat Games are movement games for a public drop-in movement studio full of
kids. Players wear a sensor on the wrist; the game reads their movement and shows
it on a big screen; staff and kids use a Stream Deck as the controller.

**Who the ideas come from.** The project's games are designed by an artist and studio lead,
not a programmer, who thinks in drawings and physical movement. Speak plainly, show
pictures of results, and keep the momentum: small working steps they can try, rather
than big leaps.

## The workflow

Follow these steps in order. The second step (describe it back) matters most:
it's how misunderstandings get caught before any time goes into building.

### 1. Understand the idea

Ideas usually arrive as **whiteboard storyboard photos plus a short description**.
Read [`storyboards.md`](storyboards.md) for how to read them (colour conventions, labels,
what each kind of panel means, and worked examples from Fly Together).

Look at every photo carefully, together with the description. Work out: the scene
and camera view, what the player's body does, what moves on screen and how, how a
round starts and ends, what makes it fun or hard, and whether it's one player, two,
or both.

### 2. Describe it back, and ask only what matters

Before building anything, describe what you see, panel by panel, in plain words:
"Here's what I see, so you can check I've understood". Name the things you're
unsure about. Then propose how the movement maps to the sensor and how the game
plays, and ask the few questions that genuinely change the build (for example:
one player or two, how a round is won, what a bump costs). Offer choices rather
than open questions. When the answers are clear from the sketches, don't ask.

Small honest adjustments are welcome when they help ("the birds face away from
us, into the valley, since they're about to fly into it"); say what and why.

### 3. Check it against the sensor and the room

Read [`sensor-and-feel.md`](sensor-and-feel.md). Check that every action in the sketch is
something the sensor can sense well (tilt, how much someone moves, sudden bursts,
holding still), and that the game suits a busy room of kids: big visuals, few
words, short rounds, nothing that breaks if buttons are mashed. If something
won't work well, say so and suggest the closest thing that will.

### 4. Build it

- Start from [`games/examples/game-template.js`](../../games/examples/game-template.js). A game is
  one file in `games/` that calls `HG.registerGame({...})`; the full contract is at the top of
  `js/app.js`. The shell already handles connecting, the menu, Start/Back, protecting a running
  round, results and recovery if the game crashes. Don't rebuild those.
- Add the game with a `<script src="games/your-game.js">` line in
  `heartbeat-games.html` (after `games/lib/*` if it uses them), using a free button
  number. Check `AGENTS.md` for which buttons are taken.
- Flying games should build on `games/lib/flight.js` (valley, `Wings` calibration,
  `Launch` nest start, solo detection) and `games/lib/flight3d.js` (the 3D world).
  Other 3D games can reuse three.js (`js/vendor/three.min.js`, loaded as a global
  `THREE`; r158; no ES modules because the page runs from `file:///`).
  Birds: reuse the crow in `games/lib/crow.js` (try it in `tools/Game-Lab.html`).
- Save the storyboard photos in `storyboards/<game-name>/`, named by panel, with a short
  `README.md` saying what each became (see `storyboards/fly-together/`). Concepts made from
  photos we don't own go in `storyboards/<game-name>/unpublished/`, which is never published.
- Give the START screen a picture of the starting pose (`introArt: "games/art/<game>-pose.svg"`):
  redraw the wearable panel cleanly as SVG with both players in their colours. People copy the
  picture far more readily than they read the text. See `games/art/fly-together-pose.svg`.
  Give the menu tile a screenshot (`menuArt`), as Fly Together does.
- **Every tunable number goes in a "Tuning" block at the top of the file**, each
  with a plain-English comment saying what it does and its units. The designer tunes
  the feel after playtesting, so these must be easy to find and safe to change.
- Write comments for a curious non-programmer (and for strangers: the project is
  open source): say what a section does and why.
- Calibrate per round and per player (see the sensor reference). Never assume which
  wrist, or how the strap sits.
- Prefer "wait for the players, with time limits" over fixed timers.
- Make sure a game works with one sensor missing or dropping out mid-round.
- Keep everything offline-safe: no new downloads at runtime. If a library is truly
  needed, save it in `js/vendor/` with its licence, and only if its licence is
  compatible with MIT (code) / CC BY-SA 4.0 (art).

- **Add each new 3D piece to the Game Lab** (`tools/game-lab/catalog.js`: one entry each; parts of a level
  built in code can be labelled with `tagged()`, as in `games/lib/climb3d.js`), so the designer can look at it
  on its own, turn it, zoom in and mark it up. See "Looking at and marking up 3D pieces" below.

### 5. Test it with simulated sensors

Read [`testing.md`](testing.md), then run `tools/try-game.mjs` against the game.
It plays the game in a hidden browser with simulated sensors, follows a movement
timeline, prints what happens and saves screenshots. Always:

- Look at the screenshots yourself and fix what looks wrong before showing anyone.
  Several real problems (ground drawn facing the wrong way, birds too small to
  read, text overlapping) were only caught by looking.
- Test one player and two players, a player who never calibrates, a sensor that
  drops out, Back pressed twice mid-round, and reaching the results screen.
- Check the existing games still work (the shell and shared libraries are shared).

### 6. Ship it

- Bump `VERSION` in `js/app.js` (new game or big change: minor version, e.g.
  2.1 → 2.2; small fix: patch, e.g. 2.1.1 → 2.1.2). Update the version and file list
  in `READ ME FIRST.txt` if they changed.
- Update `AGENTS.md`: what the game is, its button, its key mechanics and any new
  decisions or quirks. This file is the project's memory.
- Update `README.md`, the public-facing overview: the games table, controls, and any
  new reusable piece. Credit any third-party code or assets there. Keep stock or web
  images out of the repo (see `.gitignore`).
- Rebuild the single-file AI bundle: `node tools/make-ai-bundle.mjs` (see `AGENTS.md`).
- If the folder is a Git repository, commit with a clear message.
- Tell the designer what changed in plain words, what to try on the real sensors, and
  which tuning numbers they're most likely to want to adjust.
- Things only the real setup can confirm (Bluetooth, the launcher, 3D speed on the
  studio laptop, how kids actually move): say so, and ask them to report back.

## Looking at and marking up 3D pieces: the Game Lab

[`tools/Game-Lab.html`](../../tools/Game-Lab.html) (open it in Chrome, straight from the folder) shows every 3D
piece of the games on its own, and both whole levels, so the designer can look closely and say what should change:

1. **Pick something** in the menu on the left: an animal (with its actions: climb, leap, hiss, flap...), a part of
   a level (the bookshelf, the giant tree, the stone arch...), or a whole level (with "Go to" buttons for each place).
2. **Look around:** drag to turn, scroll to zoom (toward the spot under the mouse), right-drag to slide, double-click
   to look at a spot. The Front / Side / Back / Top buttons and "Start view" put the view back.
3. **Mark it up:** 🖌 Paint over an area, 📍 Pin an exact spot (each pin has its own note), 🧽 Erase. Write what should
   change in the notes. Animals hold still while you mark them. Marks are kept per piece (a pink dot in the menu).
4. **Save for Claude:** a picture of the view with the marks, and a notes file, go into `lab-notes/` (the first save
   asks for the folder: pick the project's `lab-notes` folder) or into Downloads. Then tell Claude "I left notes".

For whoever acts on the notes: [`lab-notes/README.md`](../../lab-notes/README.md) says how to read them. Each mark says
what it's on (the level part, its material, the animal's joint, how far down the canyon) and exactly where in 3D, and
`reopen` opens the same view. Describe back what you understood from the marks before changing anything, as with a
storyboard.

## Look and feel

The games have a consistent style: warm, friendly and readable from across a room.
The shell's colours live in CSS variables in `heartbeat-games.html` (`--p1` orange
and `--p2` purple are the players' colours; use them for anything belonging to a
player). Game worlds use a stylized-realistic look: low-poly 3D, warm low sun,
soft haze. On-screen text is short, big and white with a soft shadow over scenes.
Effects that reward cooperation (hearts streaming between the birds, the view
tilting when players lean together) work well.

## Things that have gone wrong before

- Building straight from a sketch without describing it back led to small
  misreadings; describe first.
- Ending calibration on "tilt left" and launching immediately made players crash:
  always finish calibration with "back to level" before the countdown.
- The nest/warm-up must wait for the players; fixed timers rushed kids.
- Overlapping things on screen (notices over scores, text pushing the controller
  hints off-screen) are easy to miss without screenshots at a real screen size.
