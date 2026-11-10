# Heartbeat Games: guide for AI assistants (and people)

This is the project's memory: what it is, how it fits together, the decisions made so far
and why, and the known quirks. It's written to get any AI model, or any person, up to speed.
Keep it current when something important changes. (`CLAUDE.md` just loads this file for
Claude Code; other tools look for `AGENTS.md` directly.)

## Start here

**If you can read only one file,** read [`HEARTBEAT-GAMES-BUNDLE.md`](HEARTBEAT-GAMES-BUNDLE.md). It holds
all the documentation and source code in one text file (built by `tools/make-ai-bundle.mjs`). It's a
snapshot: if it disagrees with the real files, the real files win.

Otherwise, read in this order:

1. [`README.md`](README.md): what this is, for a first-time visitor.
2. **This file:** how it all works, the hard-won hardware facts, and the decisions made.
3. **The top of [`js/app.js`](js/app.js):** the game contract, i.e. how a game plugs into the shell.
4. **[`games/fly-together.js`](games/fly-together.js) and [`games/lib/`](games/lib/):** a complete game and its shared parts.
5. **[`docs/making-games/`](docs/making-games/):** how new games are designed (from storyboards), built, tested and shipped.
6. **Only when touching the hardware side:** [`js/sensor.js`](js/sensor.js) (Bluetooth) and [`heartbeat-launcher.ahk`](heartbeat-launcher.ahk) (Windows popups).

[`llms.txt`](llms.txt) is a short index of the project in the llms.txt format.

## Ground rules for changing things

- **The page runs from `file:///`, with no server.** So: no ES modules (Chrome blocks them on file://), only
  classic `<script src>` tags and globals. Offline-safe: no runtime downloads except the Google font,
  which falls back to a system font.
- **Kids first:** big visuals, few words, short rounds, nothing a child can break by mashing buttons.
  **Cooperation over competition.**
- **Calibrate every round, per player.** Never assume which wrist, or how the strap sits.
- **Every tunable number goes in a "Tuning" block** at the top of its file, with a plain-English
  comment and its units. Comments are written for a curious non-programmer, and for strangers (the project is open source).
- **Test with simulated sensors** (`node tools/try-game.mjs`; see `docs/making-games/testing.md`), and
  *look at the screenshots*. Bluetooth, the launcher and real-world speed can only be checked on the
  real laptop: say so, rather than claiming they work.
- **When you ship a change:**
  - Bump `VERSION` in `js/app.js`.
  - Update this file, `README.md` (the public front door) and `READ ME FIRST.txt` (for staff).
  - Rebuild the bundle: `node tools/make-ai-bundle.mjs`.
  - Add a line to **History** at the end of this file, and keep the footer's "Built with Claude Code
    <version> (model: <model>)" credit (in `heartbeat-games.html` and the README's Licence section) current.
- **New games and big changes:** follow the playbook in `docs/making-games/` (Claude Code: the `new-game`
  skill in `.claude/skills/new-game/` points there).
- **Licences:** code is MIT and art/docs are CC BY-SA 4.0. Only add third-party material whose licence
  allows it, and credit it in the README. Never commit pictures we don't own (see "Open source" below).

## What this is

Movement games for a public drop-in **movement studio** (lots of kids). Players
wear a **Polar Verity Sense** optical sensor on the wrist; a Windows laptop runs
the games full screen in Chrome; a **Stream Deck MK.2** is the controller. It must
be simple enough for a **volunteer** to start: turn on laptop, turn on sensors,
double-click "Start Heartbeat Games", wait for "All set!".

Current version: **2.29.0** (shown bottom-right on screen; set in `js/app.js`).

## Folder layout

```
README.md               the public-facing overview: keep it up to date
AGENTS.md               this guide (CLAUDE.md just loads it, for Claude Code)
llms.txt                a short index of the project for AI tools
HEARTBEAT-GAMES-BUNDLE.md  generated: every doc and source file in one text file (tools/make-ai-bundle.mjs)
LICENSE                 MIT (the code); LICENSE-ART.txt: CC BY-SA 4.0 (storyboards, art, pictures, docs)
heartbeat-games.html    page layout and styling; loads the scripts below in order
config.js               SETTINGS: sensor IDs, sample rate, default round length
js/sensor.js            Polar Bluetooth connection + accelerometer decoding (proven; change rarely)
js/app.js               shell: setup screen, menu, controller buttons, reconnection, game runner,
                        and THE GAME CONTRACT (documented at the top of the file)
js/vendor/three.min.js  three.js r158 (last version with a classic single-file build; MIT)
games/lib/flight.js     flying-game gameplay: valley shape, Wings calibration, Launch (nest) sequence
games/lib/flight3d.js   flying-game 3D world: terrain, ecosystems, river, plants, rocks, arches, sky, birds, nest, camera
games/lib/glow.js       the soft glow round the brightest things and the darker corners (HG.glow; both 3D games)
games/lib/photo-finish.js  end-of-round photo: freeze the last frame, zoom on the players, pull back into a
                        Polaroid on the right with the game's words on the left (any canvas game can use it)
games/lib/crow.js       the realistic low-poly crow: Fly Together's birds since 2.5.0 (see "Crow model" below)
games/lib/crow-model.js GENERATED (blender/export_crow.py): the crow's version-2 skin, made in Blender
blender/                the crow's source in Blender: crow.blend (the saved scene, opens on "Crow"; textures
                        linked from textures/), build_crow.py (builds the model on the skeleton),
                        export_crow.py (writes games/lib/crow-model.js), crow-skeleton.json (joint positions,
                        from tools/crow-skeleton.cjs), textures/ (the painted feather pictures); and the same set for
                        the chameleon (chameleon.blend, build_chameleon.py, export_chameleon.py, chameleon-skeleton.json
                        from tools/chameleon-skeleton.cjs, textures/cham_*.png) and the cat (cat.blend, build_cat.py,
                        export_cat.py, cat-skeleton.json from tools/cat-skeleton.cjs, textures/cat_*.png);
                        model_kit.py (shared building helpers, used by build_cat.py) and export_model.py (the
                        shared exporter behind export_chameleon.py and export_cat.py)
games/fly-together.js   button 1: one OR two players (see below)
games/climb-together.js button 2: one OR two players (see "Climb Together" below)
                        (button 3: no game; since 2.28.0 the menu shows just the two games)
games/lib/climb3d.js    Climb Together's 3D world: the level data (level.SECTIONS, ledges, perches), the nine
                        sections built in code, the level camera, and the camouflage render pass
games/lib/chameleon.js  the chameleon (climbing walk, swivelling eyes, curling tail, camouflage): its skeleton and movement
games/lib/chameleon-model.js  GENERATED (blender/export_chameleon.py): the chameleon's version-2 skin, made in Blender
games/lib/cat.js        the cat (stand, walk, sit, crouch, leap; look, hiss, squint): its skeleton and movement
games/lib/cat-model.js  GENERATED (blender/export_cat.py): the cat's version-2 skin, made in Blender
games/lib/creature-kit.js  shared parts for animals: Tube (bendy bodies/tails), reach (two-bone legs), aim (point a
                        joint), limb, camoMaterial (fades into the picture behind it), skinAssets + bindSkin
                        (wrap a Blender-made skin round an animal's joints)
games/examples/         not loaded: game-template.js (start new games here), energy-bars, tilt-zone,
                        freeze (the old button-3 placeholder), retired valley-flight
games/archive/          not loaded; old prototypes kept for reference (flock-flight, game-2, valley-flight)
games/art/              pictures games show: introArt (fly-together-pose.svg, climb-together-pose.svg; plain SVG,
                        editable in any vector app) and menuArt (fly-together-menu.jpg, climb-together-menu.jpg)
docs/making-games/      the playbook: storyboards → describe back → check → build → test → ship, plus
                        storyboards.md, sensor-and-feel.md, testing.md
streamdeck/             key pictures for the Stream Deck (game-1, game-2, start, back; 144 x 144 PNG) + how to set them
storyboards/<game>/     the designer's whiteboard storyboard photos, one folder per game, named by panel, each
                        with a README saying what each panel became. unpublished/ subfolders and
                        crow-model/references/ hold photo-based or stock pictures: kept locally, never published.
heartbeat-launcher.ahk  AutoHotkey v2: opens Chrome kiosk, connects players, clicks pairing popups
setup.bat / setup.ps1   one-time install: Task Scheduler task (runs launcher as admin) + desktop shortcut
tools/                  Game-Lab.html (every 3D piece and both whole levels, to look at and mark up; its parts in
                        tools/game-lab/; see "Game Lab" below), try-game.mjs (simulated-sensor test runs),
                        make-ai-bundle.mjs, crow-skeleton.cjs (joint positions for Blender), and sensor test pages
                        and old scripts for troubleshooting
lab-notes/              notes the designer leaves in the Game Lab (a picture + a notes file per save); only its
                        README (how to read them) is published
.claude/skills/new-game/  a pointer for Claude Code to docs/making-games/ (the real playbook)
UIA.ahk                 NOT included (another project's file): Lib/UIA.ahk of the UIA-v2 project (Descolada, MIT)
                        on GitHub; known to work: 1.1.3. GET-UIA.txt says where to get it and where to put it;
                        setup.ps1 offers to download it, and the launcher says what to do if it's missing
```

To add a game: a new file in `games/`, a free `key`, and a script tag in `heartbeat-games.html`.

## How the pieces talk

- **Page → launcher:** the window title, e.g. `Heartbeat Games | P1:ready P2:connecting-pairing`.
  States: `idle, connecting, settling, ready, failed, reconnecting`; the part after `-` is the
  current connection step (logged by the launcher). Since 2.2.1 the page's latest problem may follow,
  numbered: `… | note 3 P2 Reconnect attempt failed - …` (colons become " -"); the launcher copies
  each new note into the log as `Page, Player 2: …`. Page errors were otherwise lost on close.
- **Launcher → page:** keyboard shortcuts (a key press counts as a user gesture for Chrome):
  `Ctrl+Alt+Shift+F1/F2` connect player 1/2, `F3` "Windows finished pairing", `F4` disconnect both.
- **Stream Deck → page:** `Ctrl+Alt+Shift` + `1..9` open game, `S` start, `B` back
  (twice during a round; the second press returns to the menu). `F9` = demo mode (fake sensors).
- **Staff (launcher):** `Ctrl+Alt+Shift+R` reconnect, `X` or `Alt+F4` tidy close (sensors back to
  normal mode), `P` pause popup helper, `D` snapshot the Pairing window into the log.

## Sensors and Bluetooth: hard-won facts

- Standard heart rate service works, but **the sensor demands pairing** before it streams.
  On the studio's **Logitech BT adapter**, permanent pairing (Windows Settings) breaks the
  connection; **temporary pairing via the popup works**. Each new connection re-pairs (~60 s).
- The pairing flow has **three popups**: Chrome's picker ("file:/// wants to pair"), Windows'
  "Add a device. Tap to set up your Polar Sense…" notification (must be tapped), and the
  "Pair Device" window (Allow; AutomationId `ButtonOk`). The launcher handles all three via
  UI Automation, **only for sensor IDs in config.js**, and needs admin rights.
- Windows doesn't expose "connection succeeded" text; pairing is done when the Pair Device window
  **switches away from the "Do you want to allow this?" question** (~60 s after Allow). Closing it
  earlier breaks the connection. The launcher hides the Pairing/Settings windows off-screen
  (not minimised: that can pause them).
- Accelerometer comes via Polar's PMD service (UUID `fb005c80-…`), documented in the
  polar-ble-sdk repo. Data arrives in **packets (~0.7 s at 52 Hz)**; that bundling is the main
  latency. **SDK mode** (fast mode) allows 104/208/416 Hz but **turns heart rate off**; the games
  use SDK mode at 416 Hz. The mode persists until told to stop or the sensor is switched off,
  hence the tidy shutdown. Verity Sense **skin contact is unreliable** (Polar says so); don't use it.
- A sensor still in fast mode sends no heart rate, so the "first reading means paired" check
  times out after 25 s and carries on anyway.
- Every Bluetooth step has a time limit (`withTimeout` in sensor.js) so a hung step becomes a
  failed attempt and is retried, never a permanent hang.
- Auto-reconnect: the page keeps the chosen sensor and retries `gatt.connect()` every 4 s
  (no picker, no click needed); the launcher handles the re-pairing popups.
- **Sleep breaks everything** (Bluetooth off, both sensors drop). Since 2.2.1 the launcher asks Windows
  to stay awake with the screen on while it runs (`SetThreadExecutionState`, like a video player;
  `KEEP_AWAKE`). This doesn't stop sleep from closing the lid or pressing the power button.
- **After a wake (2026-10-22 log), reconnects looped for 5 minutes:** Player 2's Pairing window appeared
  ~1 s *after* the launcher had given the go-ahead, the page moved on to Player 1, and when Player 1's
  attempt ended the launcher closed "its" Pairing window, which was really Player 2's, ~28 s in, which
  broke that pairing; repeat. Fixed in 2.2.1: the launcher reads which sensor a Pairing window is for
  and never closes another player's window mid-pairing (closes it once done), and waits up to
  `LATE_PAIRING_WAIT` (12 s) for a Pairing window before the go-ahead. Why Player 1's connection also
  dropped during its 25 s fast-mode wait is still unknown: the new page notes should show it.

## The game contract (summary; full version at top of js/app.js)

`HG.registerGame({ key, name, icon, colour, howTo, introArt?, menuArt?, fullScreen?, needs: "motion", roundSeconds,
countdown: false?, clock: "manual"?, start(ctx), update(ctx, dt), end(ctx), showResults(el, result)?, cleanup(ctx), warmUp()? })`.
`warmUp` (since 2.26.0): a list of small steps that get the game ready in the background (see "Getting ready in the
background" below).
`menuArt` (since 2.6.0): a picture on the game's menu tile instead of the emoji icon. `fullScreen` (since 2.6.0):
during the countdown and play the stage fills the screen; the title + clock shrink to the top-left and the BACK
hint to the bottom-right (white with a shadow); the player chips hide; a `.fl-hud` moves down below the title.
The menu always shows `MENU_SLOTS` tiles; numbers without a game are greyed "Coming soon", and pressing
one (e.g. button 3) shows a short "Game N is coming soon!" notice (cleared when a game opens). **Since 2.28.0** the
designer is debuting just the two games: `MENU_SLOTS` is 2, so the menu is two tiles, each half the screen, and a
tile with `menuArt` (class `has-art`) is filled by its picture, with the button number in a badge of the game's
colour at the top and the name over a fade of that colour at the bottom. The pictures (`games/art/*-menu.jpg`,
1200x1000) were re-shot from the new graphics: Fly Together's birds flying up the High Desert canyon toward a stone
arch, with their shadows; Climb Together's chameleons on the sunlit bookshelf with the cat eyeing them (from a
one-off script that drives `HG.flight3d` / `HG.climb3d` directly; other candidates were the Alpine, the Deep
Desert, the plants by the window and the very top at golden hour).
`showResults` (since 2.4.0) lets a game draw its own results screen from what `end()` returned; if it's
missing or throws, the shell shows the plain headline and detail (so `end()` should still return those).
`ctx`: `stage, players, phase, elapsed, remaining, endRound(), startClock(), state`.
Player view: `n, name, colour, connected, energy() 0..1, motion() mG, tilt(), up(), latest()`.
A game that throws is stopped and the menu returns; other games keep working.

## Getting ready in the background (since 2.26.0)

The designer saw little stutters on the studio laptop after the lighting work. Most came from things the graphics
card prepares the first time they're seen (a shader for each kind of surface and light, each picture uploaded): the
start of a round, the first cat or crow, the first hide (camouflage draws the world a second way), the first
desert, the valley. Now, while the sensors connect, `warmUpGames()` in app.js runs each game's `warmUp()` steps one
at a time (`WARM_UP_FIRST` 1.5 s after the page opens, then `WARM_UP_PAUSE` 150 ms apart; never during a round; a
failing step skips the rest of that game's). `HG.climb3d.warmUp()` builds the scene and draws it in a hidden
full-size view from each part of the climb, with the cat, the crow, hiding, the very top and the valley;
`HG.flight3d.warmUp()` draws the nest and a stretch of each ecosystem. About 10 s in tests; when done, `HG.warm`
is true and the console says "games ready".
**The catch, found by measuring:** the browser puts drawing off until it must show it, so the warm-up's drawing
was all done in one go when the first round started (a 13 s frame in tests, worse than none). So each step reads
one dot back from the graphics card (`gl.readPixels`), which forces the drawing to happen then; `gl.finish()` was
not enough. Measured in the test browser (software drawing, so slow overall): Climb Together's start went from a
4 s frame to 0.7 s, the hitch at the first hide (1.3-1.9 s) is gone, and Fly Together starts with none.
`?nowarm` on the page's address skips it (for comparing). `try-game.mjs` has `--warm` (wait for it before opening
the game), `--no-warm`, and `--frames` (frame times and any frame over a second, with when).
Also: Climb Together's soft-light strengths are set on a list of materials gathered once per round, no longer by
walking the whole scene each time the light changes.

## Fly Together (button 1)

- **START screen** (since 2.3.0): `games/art/fly-together-pose.svg`, redrawn from the Player_wearable
  storyboard: both players (orange, purple) standing arms out, sensor on top of one wrist (pulsing
  ring), green seesaw arrows, arms gently tilting together. Shown on a white card left of the howTo
  text (`introArt`); games without introArt keep the centred text layout.
- **Full screen during play** (since 2.6.0; `fullScreen: true`), and a cropped screenshot on its menu tile.
- **Nest start** (from storyboards): birds in a nest on a branch; checklist: hold wings out
  (steady 1.5 s, learns "level"), tilt to the left (learns "left", so either wrist works),
  wings level… 3, 2, 1 (waits until wings are level, the fix for "launching while leaning").
  Take-off: camera pulls back to a wide shot, birds fly off, tree and nest pass beneath.
  The round clock starts at take-off.
- **Who's playing** is decided at the tilt step: a player who never tilts is left out.
  If their sensor barely moved all round (on a table, peak energy < 0.2) the wait is ~1.2 s;
  if it moved, up to 5 s. Nobody tilts → keep everyone. Shows "Flying solo!".
- **The birds** (since 2.5.0) are the crows from `games/lib/crow.js`, solid orange and solid purple for
  readability, 6.6 m wingspan (game-sized). They flap in bursts with glides between (`FLAP_BURST`,
  `GLIDE_TIME`, `FLIGHT_FLAP`), glide more in hard turns, flap hard at take-off, and hold their wings out
  in the nest (sitting up on the rim, a little apart, P1 slightly higher so inner wings don't cross).
- **Two players:** close together → tiny white hearts stream out from halfway between the birds and arc
  down to both sides, growing as they drift toward the camera; they start after 2 s together, at 2 per
  second, plus 0.75 more per second for each second of the streak, up to 15 (halved in 2.5.1 at the
  designer's request; `HEARTS_*`). (The old glowing link and sparkles are gone.) Plus a speed boost that
  keeps growing with the "together streak" (drains when apart, reset by a bump); gentle magnet within 6 m;
  birds pass over/under each other (no collisions); camera centres and zooms to frame both;
  leaning the same way together banks the whole view ("In sync!"). Team score.
- **Solo:** speed grows the whole time you avoid walls; a bonk resets to starting speed.
- **Bonk:** besides the BONK! flash, a puff of feathers in the bird's colour tumbles out behind it toward
  the wall side (`BONK_FEATHERS`). Hearts and feathers are drawn on the 2D effects layer over the 3D view.
  (Both effects came from photo-based concepts kept in `storyboards/fly-together/unpublished/`, which are
  described in that folder's README.)
- The valley **narrows with distance flown**: 15 → 9 m half-width over 2,600 m, then keeps
  narrowing more and more slowly toward 6 m (never closes).
- **Ecosystems** (since 2.2.0), 1,000 m each, the last 200 m of each blending into the next, looping:
  **Alpine** (pines, grassy slopes, snowy peaks) → **High Desert** (tan rock, boulders, sage bushes,
  3 natural stone arches spanning the valley) → **Deep Desert** (sand floor, red layered rock, cactus,
  long stretches of sheer vertical cliffs with mesa tops) → Alpine again. Sky haze, distant ranges and
  sunlight warm up in the deserts. All of it is looks only: walls bump by valley width as before, and
  the arches are scenery (23 m high; the camera never goes above ~14 m). A normal round reaches
  2,000-2,500 m, so most players see all three; only strong teams loop back to Alpine.
- The camera is kept over the valley floor, so on sharp bends it never ends up inside a cliff.
- **End screen** (since 2.4.0, from `storyboards/fly-together/End_screen_concept.png`): when time runs
  out the last frame freezes (copied at 2x sharpness, without the score overlay), zooms in to frame the
  birds, then pulls back into a tilted Polaroid on the right. On the left, fading in line by line:
  "JUST TWO BIRDS / LOOKING FOR A NEW LIFE / TOGETHER" (solo: "JUST ONE BIRD / LOOKING FOR / A NEW LIFE"),
  "YOU FLEW" + the distance, then AS A TEAM % (solo: LONGEST CLEAN RUN), BONKS, TOP SPEED. House style,
  not the concept's black/red: cream background, the page font, values in the orange→purple player
  gradient (solo: that player's colour). About 4.5 s; START works at any moment. Timings: `PHOTO_*`
  in fly-together.js. Stopping a round with BACK still goes straight to the menu.
- Tuning numbers are at the top of `games/fly-together.js`, `games/lib/flight.js`
  (steering, nest timing, solo detection) and `games/lib/flight3d.js` (look, light, performance).
- **Light (since 2.27.0, the designer asked for a graphics pass like Climb Together's):** in flight3d.js's "Light"
  block. **Real shadows** (`SHADOWS`): the sun casts shadows in a long box that follows the birds (in the nest,
  round the nest): since 2.27.1, at the designer's request after the laptop test (at first 18 m round the birds,
  so shadows only showed close to the camera), `SHADOW_BEHIND` 15 m behind them to `SHADOW_AHEAD` 150 m ahead,
  `SHADOW_WIDE` 50 m either side, `SHADOW_DETAIL` 2048 dots. The sun's view is turned so "up" points down the
  valley (`shadow.camera.up`), making the box's long side run ahead; sideways it sits halfway between the birds and
  the valley's middle 90 m on, so it stays on the valley round bends. Cost in the test browser: shadows went from
  about 11 to 27 ms a frame (79 to 94 ms in all). The shadows: the birds' own wing-shaped shadows (they replace the grey blobs, which
  stay only when shadows are off), and those of trees, bushes, cactus, rocks, arches and the nest. The ground itself
  doesn't cast (the walls' shadows stopped in a hard line at the box's edge). The sun was raised (`SUN_FROM`, from
  [-0.55, 0.65, -0.5]) so the birds' shadows fall close under them instead of off the bottom of the screen.
  **Ground:** small lighter and darker patches (`GROUND_SPECKLE`) and **creases** (`CREASES`): darker where the
  ground dips below the ground three columns either side (the foot of the slopes, gullies, the river banks), worked
  out across the valley only so the 60 m sections still match. **Sky light:** the hemisphere light's lower colour is
  the light bounced off each ecosystem's floor (`BOUNCE`, blended like the sky). **The river** mirrors the sky
  (`SOFT_LIGHT`: a blurred picture of the sky dome, `this.skyPicture`, given to the river and, at half strength, the
  birds; smoother water). **Measured, and trimmed for the laptop:** giving that soft sky light to the whole scene
  (as in Climb Together) tripled the drawing work in tests (the whole screen is valley), so only the river and birds
  have it; the glow (`GLOW`, shared with Climb Together in games/lib/glow.js) is off here by default (the sun is
  never in view, so it showed little, and it was the next biggest cost). In the test browser a frame went from about
  60-67 ms to 79 ms (shadows about 11 ms of that).

## Climb Together (button 2, since 2.8.0)

From the storyboards in `storyboards/climb-together/` (its README says what each panel became).
- **The story:** two chameleons (orange, purple) escape from a tank on a bookshelf and climb to safety.
  The climb, bottom to top, about 11 m: bookshelf → potted plants → through the open window → along the
  alley floor to the boxes → brick wall with two pipes → broken windows → wooden crates on the roof → big
  rocks with grass → giant tree. Both reaching the top (`level.TOP`, 11.16 m) wins; otherwise the round is 90 s.
- **The very top (since 2.18.0, at the designer's request):** after both reach `level.TOP`, they climb on by
  themselves (`FINALE_SPEED`) up the trunk through the leafy crown (three rings of clumps; the ones in front hide
  them for a moment) to a level bough across the very top (`CROWN` / `level.LOOKOUT`; the route goes round its
  front and a little way back across it, so they sit side by side, `FINALE_SPOTS` apart, facing away, eyes on the
  view). They slow down over the last `FINALE_SLOW` and sit, perfectly still (`c.sat`; since 2.18.2, at the
  designer's request: before, the view turned while they were still stepping round the bough, which looked like
  walking on the spot). Once both have sat for `SIT_SECONDS`, the camera rises, steps back and tips down
  (`VALLEY_RISE`, `VALLEY_BACK`, `VALLEY_LOOK` in climb3d.js) over `VIEW_SECONDS`, holds `VIEW_HOLD`, then the
  photo. The peaceful valley (`buildValley()`: meadows, a winding river, patches of little pine trees, snowy
  mountains; one height function, `valleyHeight()`) only shows then: it fades in (eased) as the town skyline fades
  out, and the haze and camera range open up so the mountains show. Its materials are see-through from the start
  and its shaders are prepared when the scene is built, so it doesn't stutter or pop in when it appears
  (it did in 2.18.0). The end photo is of that view.
- **Through the window (since 2.14.0, from the zoom_thru_open_window storyboards):** the room's window opens
  onto a real alley. Everything from the alley up is built in its own group, moved back `ALLEY_DEPTH` 1.4 m and
  down `OUT_DY` (so the alley floor is level with the sill); `level.SECTIONS`, `TOP`, perches, boxes and pipes
  are all shifted by it (`BOXES_AT` / `PIPE_AT` keep the unshifted numbers the builders use). The chameleons
  crawl over the sill and along the alley floor (`level.ALLEY`) to the boxes. The game passes the camera a
  depth (`cam.z`, eased toward the chameleons by `CAM_DEPTH_SPEED`); in climb3d.js the camera goes in through
  the opening after them (`WINDOW_PASS`), stops just past the wall (`WALL_THROUGH`), and turns to look straight
  on as it passes. The light gets brighter outside. The potted plants fade (`PLANT_FADE`) while both
  chameleons are at sill height, so the leaves don't hide them.
- **The movement:** hands up, climbing on the spot. `Climber` (in the game file) reads each sensor:
  `effort` from how much they move (`CLIMB_START` 0.45 → `CLIMB_FULL` 0.78), and `lean` from the arm's
  direction averaged over `LEAN_SMOOTHING` (0.8 s, because a climbing arm swings a lot), measured from
  the arm's average direction *while climbing* ("centre") along a learned "left". Speed `CLIMB_SPEED`
  0.26 m/s; leaning climbs sideways. Climbing within `TOGETHER_NEAR` 0.35 m of each other is twice as fast
  (`TOGETHER_BOOST` 1; raised from 0.15 by the designer in 2.18.0, after playtesting: it felt good).
- **Hearts (since 2.18.0):** within `HEARTS_NEAR` 0.25 m (the designer asked for 0.2, but side by side they're
  nudged to stay 0.2 apart, so 0.2 would hardly ever show), tiny white hearts trail out from between them and
  drift down behind in a single, gently wavering stream (since 2.18.1, at the designer's request; at first they
  went out to both sides as in Fly Together): `HEARTS_START` 3 a second plus `HEARTS_PER_SECOND` more for each second
  close, up to `HEARTS_MAX` 8. Not shown in the finale (they'd be in the photo).
- **The start (the escape), per round, per player:** hands up, hold still → climb on the spot (learns the
  centre; the tank rocks; **who's playing is decided here**, like Fly Together's tilt step) → climb to the
  left (learns "left", averaged while leaning) → climb to the right (since 2.18.3, at the designer's request:
  players sometimes got stuck drifting left) → freeze → the escape. **Why the right step matters:** a climbing
  arm swings forward and back, and "left" learned from a left lean alone picks up part of that swing (in tests
  about a third), so the swing itself read as leaning left and a right lean read short (-7° for a 25° lean).
  `finishRight()` takes "left" as the line from the right lean to the left lean (the swing cancels out) and moves
  straight-up halfway to the middle between them, so an arm that drifted during "climb on the spot" doesn't
  steer all round. In the right step only a lean away from the left one counts (`rightDegrees()`); if the left
  step timed out, either way does. With no right lean (it timed out), the left step's numbers stay. Tested with
  simulated sensors only, including an arm drifting 8° during the centre step: straight read within ±4°,
  25° leans read about 19-23° both ways. The escape (`ESCAPE_SECONDS` 1.8): the tank shakes as
  they shove its front, which pops off, tips forward off the shelf and lands flat on the floor (since 2.18.0, at the
  designer's request; before, the whole tank fell over). The tank stays, open at the front (inside: gravel and a little plant; its stick was taken out in 2.18.3). The clock starts at
  the escape. In the tank the route goes up its back glass to `TANK.leapFrom` and leaps out through the open front
  to the shelf above; until then the game keeps them inside the tank's sides.
- **Hiding:** still (`STILL_ENERGY` 0.32) for `HIDE_AFTER` 0.25 s → the chameleon camouflages: its skin
  shows the picture behind it (slightly bent, with a faint glassy rim) and only its eyes, in the
  player's colour, stay visible. Its shadow goes too. How: `climb3d.js` draws the world without the
  animals (they're on layer 1) into a half-size picture first, and the chameleon's materials
  (`HG.kit.camoMaterial`) mix that in by screen position. Only done while someone is hiding.
- **Visits** (numbers as tuned by the designer in 2.18.0 after playtesting): a cat (below `CROWS_ABOVE` 5.85 m: the
  roof) or a crow (above) comes every `VISIT_EVERY` 5-8 s (first after `FIRST_VISIT` 3 s). It arrives on a spot from `level.ledges` /
  `level.perches` in the top part of the view (`VISIT_HIGH`; lower down only if there's nothing up there), off
  to the side (`VISIT_ASIDE`), at about the chameleons' depth, and at least `VISIT_CLEAR` sideways from any
  chameleon at its height; `WARNING` 1.4 s later it starts looking for `LOOK_SECONDS` 2.4 s (since 2.10.1 there's no
  "Shh… it's looking!" message or 👀 over it, at the designer's request: just the cat or crow looking about).
  Anyone moving for `SPOT_SECONDS` 0.5 s is caught: the cat crouches and pounces (the crow pecks), the
  chameleon slides `FALL_BACK` 0.6 m down, the view pulls back. Nobody moved: "Phew! You hid!".
  **The warning is generous on purpose:** holding still only registers about a second after a player
  stops (the sensor measures over half a second and its readings arrive about half a second late).
  **Warier higher up (since 2.17.0, at the designer's request):** each visit gets a `wary` 0..1 from the team's
  average height (tank to `level.TOP`), and in between by it: the next visit comes after `VISIT_EVERY` [5, 8] s at
  the bottom down to `VISIT_EVERY_TOP` [2, 5] s at the top; it looks for `LOOK_SECONDS` 2.4 → `LOOK_SECONDS_TOP`
  1.0 s; it spots a moving chameleon after `SPOT_SECONDS` 0.5 → `SPOT_SECONDS_TOP` 0.3 s; it arrives and leaves
  up to `QUICKER_TOP` 1.2x faster. `WARNING` (1.4 s to freeze) stays the same everywhere, because of the sensor
  lag above. `VISIT_ASIDE` is 0.1 m. (Still to check with real kids: whether 1.4 s is enough time to freeze,
  given that lag.) The crows' tree perches are halfway
  along each branch, near the trunk (further out they were too far to the side ever to be chosen).
- **The tree's branches** (fixed in 2.17.1: they floated just off the trunk) are each a line from a root sunk
  inside the trunk to a tip (`branchLine()` in climb3d.js, thickness `BRANCH_RADIUS`); the leaf clumps and the
  crows' perches use the same line.
- **Staying together:** above `GAP_WARN` 0.6 m apart, "Wait for your friend!" over the leader; above
  `GAP_MAX` 0.95 m, the leader loses its grip and slides to just above its friend. If a sensor drops out
  mid-round, that chameleon tags along just below its friend.
- **The climbing map (since 2.12.0; the whole climb since 2.16.0):** the big solid shapes are plain numbers in
  `climb3d.js` (`level.SHELF`, `BAYS`, `BOOKS`, `POTS`, `SILL`, `WIN`, `BOXES`, `PIPE`, `WINDOWS`, `ROOF`, `CRATES`,
  `ROCKS`, `TRUNK`; the outdoor ones also as built, before the alley shift: `BOXES_AT`, `PIPE_AT`, `WINDOWS_AT`...),
  and the 3D scene is built from them.
  Books are pushed back so the front third of each shelf (`CAT_WALK`) is clear for the cat; the gap from the books
  up to the shelf above is `BOOK_GAP`. `level.route(x)` gives the path a chameleon climbs at sideways position x:
  back across the plinth, up the books' fronts (each book's own height), **leap** to the front edge of the shelf
  above, over the edge and back across the cat walk to the next books; on top, back to a pot, up it, over the rim,
  up its plant's stems and leap to the window sill (between pots: up the wall and leap out to the sill). Then
  (since 2.14.0) back across the sill and out along the alley floor to the boxes, up the boxes (leaping to the
  stacked box where it overhangs a shorter one; a chameleon within half a body-width of a box's side counts as on
  it, so it never hides inside), across the top to the wall, and up the brick wall, climbing round the front of
  each pipe. **Above the brick wall (since 2.16.0, from the `All_levels_zoom_out_marked_*` storyboards):** a
  staircase stepping back from the camera, with a short walk (`STEP` 0.4 m, about 1.5 s) back across each top:
  over a broken window's sill, up inside it (on the dark glass, over its cross bar) and out under its top frame;
  over the parapet's cap and back across the flat roof; up a low crate and back across it; up a tall crate (two
  stacked) and back across it; up three rows of big rocks (two side by side in each row, rounded lumpy blocks
  whose fronts and tops stay nearly flat: `rockBlock()`), back across each; back across the top rock to the giant
  tree, up its flaring roots (`ROOTS`) and round its trunk. The brick wall has holes for the windows. The whole
  route is now about 17 m (at the designer's choice the climbing speed and 90 s round stay as they were, so
  reaching the tree is an achievement). `choices(x)` lists what's at each sideways position (book, pot, sill,
  boxes, pipes, window, crates, rocks, and a 5 cm slice of the round trunk); positions with the same choices
  share a cached route. `level.surface(y)` is now only a rough fallback (the tank, perches).
  The game moves each chameleon by distance along its route (`c.s`); `level.at(x, s)` gives its height, depth
  and segment; `level.tilt(x, s)` the angle of the surface around it, averaged a little ahead and behind, so it
  tips forward over edges and back up onto faces (eased by `TILT_SPEED`; the 3D scene turns it by `pitch`).
  **Bending (since 2.15.0, from the Bend_up_at_right_angle and climb_over_ledge storyboards):** the game also
  passes each chameleon's `s` (null while leaping or before the escape); `surfaceFor()` in climb3d.js turns the
  route around it into the chameleon's `controls.surface`, with corners rounded by `BEND_ROUND`, so its back half,
  chest, head, each foot and the tail each lie on the route where they are: at an inside corner the front climbs
  the new face while the back and tail stay on the floor; over an outside edge the body curls over it.
  Reaching a leap segment starts `cham.leap()` automatically (players just keep climbing); the leap commits once
  started and arcs out by `LEAP_LIFT`. Moving sideways onto a different book or pot re-finds the same spot on its
  route (`level.project`). Catches, falls and "too far apart" are measured along the route (`s`), not in height.
  Cat ledges (`level.ledges`, built from the map): the cat walks (`z` mid-strip), the bookcase top in front of
  the pots, the window sill, the alley floor, the box tops, and along the tops of the pipes (marked `pipe: true`).
  Crow perches (`level.perches`, also from the map): the roof in front of the crates, every crate and rock top,
  and the tree's branches.
- **The camera** stays level (two-point perspective, as on the Base_Geometry storyboard), looking at the
  climb `VIEW_FROM_SIDE` 17° from one side, framing both chameleons (`VIEW_HEIGHT` 1.2 m of climb).
- **The world** is built in code from boxes, tubes, lathes, lumpy balls and rounded rock blocks, with painted-in-code
  textures (plaster, wood, books as one instanced shape, bricks, cardboard, crates, bark, rock); soft
  shadows from a sun that follows the view (`SHADOWS` in climb3d.js to turn off). Sections blend into
  each other over `BLEND` 0.22 m (their names are what the end screen says was reached); the chameleons
  follow the climbing map's routes, not the sections.
- **The room's light (since 2.19.0, the first step of a lighting pass the designer chose to start here):**
  late-afternoon sun through a window off to the left (off screen). Three parts, all numbers in "the light
  in the room" in climb3d.js's Tuning: a warm spotlight (`roomSun()`, `ROOM_SUN_*`) whose light is shaped by a
  painted picture of a six-pane window with faint leaf shadows (`TEX.sunbeam`, as the spotlight's `map`), so a
  window-shaped patch with the bars' shadows falls across the wall, bookshelf and books, and it casts its own
  shadows (shelves shade the bays, the chameleons cast shadows in it); soft light from all round
  (`roomEnvironment()`: a simple warm room with a bright window, blurred by three.js's PMREMGenerator into the
  scene's `environment`, strength `ROOM_BOUNCE`); and dust specks drifting in front of the shelf (`buildDust()`,
  `DUST`; its own random numbers so the rest of the level is unchanged). The old even light is turned down in
  the room (`ROOM_FILL`, `ROOM_FRONT`). All of it fades out with `outside` as the camera goes through the
  window (the soft light's strength is set on every material, only when it changes).
- **The alley's light (since 2.20.0, the second step):** cool blue shade below, warm evening sun across the top
  of the brick wall, so the chameleons climb out of the shade into the sun (the edge falls between the two
  pipes). Numbers in "the light in the alley" in climb3d.js's Tuning. The sun is a second `sunbeam()` spotlight
  (`ALLEY_SUN_*`) whose picture (`TEX.alleySun`) is bright above and dark below: the shadow of the room's own
  building behind the camera, its roofline with a step and an aerial. Soft light from all round comes from
  `alleyEnvironment()` (blue sky above, red bricks, damp grey ground); the plain lights turn down and cooler
  (`ALLEY_FILL`, `ALLEY_FRONT`, `ALLEY_SHADE`). The ground is damp concrete with faint puddles (`M.alleyGround`:
  a colour picture and a matching "where it's wet" roughness picture, `alleyPuddles()`, own random numbers).
  **How the moods mix:** in `frame()`, `inside` (the room), `alley` (outside, below `ALLEY_UP`) and `open`
  (daylight above; its own mood since 2.21.0, below) add up to 1 (since 2.22.0 `open` splits into `open` and `gold`). The soft light switches from the room's picture to
  the alley's halfway through the window, fading to nothing and back so there's no jump. Each sunbeam's shadows
  are only drawn while it's lit (`shadow.autoUpdate` off, `needsUpdate` set each frame), so the extra lights
  cost little where they're not used.
- **The light in the open (since 2.21.0, the third step: the roof, the rocks and, for now, the tree):** a sunny
  afternoon. The sun that follows the view moves round to where the afternoon sun is (`OPEN_SUN_FROM`: from the
  right, above, a little in front), so crates throw shadows to the left across the rocks and the trunk is lit on
  its right; warmer sunlight (`OPEN_SUN_COLOUR`, `OPEN_SUN_STRENGTH`); the plain even light turned well down
  (`OPEN_FILL`, from 1.3) and soft light from all round instead (`openEnvironment()`: blue sky overhead, paler
  at the horizon, green below, a bright sun patch; `OPEN_BOUNCE`). The rocks are tinted a little warm
  (`M.rock` colour). The soft light picks whichever mood is strongest (`moods` in `frame()`), fading to nothing
  at each halfway point where its picture changes. Checked: the climb from the alley onto the roof, and the
  finale's valley view.
- **Golden hour at the tree top (since 2.22.0, the fourth step):** a fourth mood, `gold`, taking over from open
  daylight as the view rises through `GOLD_UP` (the tree's trunk, up to the finish), so the finale is all golden.
  Numbers in "golden hour at the tree top" in climb3d.js's Tuning. A lower, deeper-orange sun (`GOLD_SUN_*`), a
  golden soft light (`goldEnvironment()`), warm hemisphere colours; the sky picture is repainted toward
  `GOLD_SKY` (`paintSky()`, only when the amount has changed by a 40th), the haze turns `GOLD_HAZE` and the
  distant town/hills picture is tinted warm. At the very end, as the view turns out over the valley, the
  setting sun appears just above the far mountains (`this.sunset`: a glowing sprite 200 m out along
  `SUNSET_FROM`, fading in with `view`; it shows once the camera's range has opened up), and the light swings
  `SUNSET_TURN` of the way round to come from it.
- **The end, polished (since 2.23.0, at the designer's request):** the valley no longer waits for the view to
  turn: it fades in (`reveal` in `frame()`, the larger of `view` and how far the view has climbed through
  `VALLEY_SHOW`) while the chameleons are hidden in the leaves, so when they come out on the bough it's already
  there, with the setting sun just above the mountains. The light's swing toward the sun, the haze and the
  camera's range follow `reveal` too. Added: golden pollen drifting round the bough (`POLLEN`, the same
  `buildDust()` as the room's dust, which now takes its box, size and colour) and a loose line of birds gliding
  across far out over the valley, flapping now and then (`buildBirds()`, `BIRDS`, `BIRD_*`: dark "v" shapes,
  one shape for all, its points moved each frame). The end photo now frames the setting sun too
  (`scene.sunScreen`, added to the photo's focus in `end()`), so the Polaroid shows the chameleons, the sun,
  the birds and the valley.
- **Shading in creases (since 2.24.0, the fifth step):** soft dark gradients wherever two surfaces meet, so things
  sit into each other instead of floating ("contact shading", a cheap stand-in for ambient occlusion). Each crease is
  the soft shadow of a shape on a flat surface beside it: a rounded-rectangle outline that fades out over `soft`
  metres, drawn by a tiny shader (`CREASE_SHADER`, `creaseSet()`: `add()` for one, `step()` for a box stepping up
  from the one in front: on its top at the back and on the face behind at the bottom). All of a set is one shape,
  one draw. Laid out from the climbing map's own numbers (`roomCreases()`: floor along the wall, the bookcase on
  the floor and wall, in front of the books and under each shelf, the tank, the pots, the sill, the picture;
  `outdoorCreases()`, in the outdoors' own layout: the alley's ground and wall, each box on the ground or the box
  below and against the wall, the pipes, the window sills, the parapet, the crates on the roof, every crate-to-crate,
  crate-to-rock and rock-to-rock step, and the tree on the top rock, kept off the rocks' rounded edges).
  `CREASES` turns it off, `CREASE_DARK` (1.7) sets how dark. A screen-space ambient occlusion pass was considered
  and not used: three.js's is a module (not loadable from file://) and it would cost a full extra render each frame.
- **Glow (since 2.25.0, the last step of the lighting pass):** a soft bloom round the brightest things (the patch
  of sun in the room, the setting sun, sunlit snow) and slightly darker corners (a vignette). Hand-written, as
  three.js's add-on is a module: `HG.glow.make()` in games/lib/glow.js (in climb3d.js until 2.27.0, when it was
  shared with Fly Together). `draw()` renders the world into a picture
  (`glow.world`: half-float, 4x multisampled for smooth edges), then `glow.show()` keeps only what is brighter
  than `GLOW_FROM` at quarter size, blurs it there and again at an eighth (a 9-tap blur in 5 looks, `GLOW_SPREAD`),
  and lays both over the picture on the way to the screen (`GLOW_STRENGTH`, `VIGNETTE`). **Two three.js quirks it
  works round, so the picture looks exactly like drawing straight to the screen (checked pixel by pixel):**
  three.js only finishes colours for a screen (tone mapping, then screen colours) when drawing to the screen, so
  the picture is marked `isXRRenderTarget` with an sRGB colour space, which makes it finish them the same way;
  and drawn into any picture, three.js hands the haze (fog) its colour unconverted, so in `frame()` the fog colour
  is converted to screen colours first (`convertLinearToSRGB()`) while the glow is on. The pre-compile at start-up
  draws into the picture too, so nothing has to be prepared mid-game. `GLOW` false goes back to drawing straight
  to the screen. Camouflage (its own picture of the world) is unchanged. Not yet checked: speed on the studio laptop.
- **End screen:** Fly Together's Polaroid: "JUST TWO CHAMELEONS / CLIMBING TO FREEDOM / TOGETHER" (solo:
  "JUST ONE CHAMELEON / CLIMBING TO / FREEDOM"), "YOU CLIMBED" + height (or "YOU MADE IT TO / The top!"),
  then hid from, caught, and the section reached. Reaching the top, the photo is the view from the very top.
- **Tuning:** the top of `games/climb-together.js` (climbing, hiding, visits, start, camera) and of
  `games/lib/climb3d.js` (look, sizes, shadows).

## Chameleon and cat (made in code; meant for future games too)

- **`HG.Chameleon({ colour })`** (`games/lib/chameleon.js`): lies on a wall (its z = 0), head up +y,
  back toward +z; 1 unit = snout to tail base. Controls each frame: `velocity [x, y]` (body lengths per
  second; feet stay planted on the wall and step when stretched, in diagonal pairs), `camo` 0..1, `fall`
  0..1 (legs flailing), `lookAt` (a point, or null for each eye roaming on its own). Legs use `HG.kit.reach`.
  - **Leap (since 2.11.0):** `cham.leap(seconds)` (default `LEAP_SECONDS` 0.9): coil (feet drawn in, chin down),
    spring, fly stretched out (front feet reaching ahead `LEAP_REACH`, back legs pushed out behind `LEAP_PUSH`, tail
    straight, both eyes fixed ahead), catch with the front feet, swing the back legs in, settle. The chameleon poses
    itself; whoever moves `cham.root` carries it from start to landing spot with `HG.Chameleon.leapPath(cham.leapProgress)`
    → `{ along, lift }` (stays put while coiling, springs off fast and slows at the catch; `lift` = off the wall).
    Meant for gaps a climb can't cross (top of the books to an overhanging shelf edge, plant to sill, rock to rock),
    triggered automatically by the game while the players just keep climbing: used by Climb Together since
    2.12.0 on the bookshelf (books to shelf edge) and plants (to the sill). See it in the Game Lab (Chameleon, "Leap").
  - **Skeleton (since 2.9.0):** named joints in `cham.joints`: `body`, `chest` (since 2.15.0: the front half, so
    the body can bend), `head`, `eye.0/1` and `look.0/1` (the eye turrets turn with "look"), `tail.0`-`tail.15`,
    and `leg.0`-`leg.3` `.upper/.lower/.foot` (leg 0 = front left; the front legs hang from the chest). `pose()`
    sets them all each frame; `bindPose()` is the pose the model is built in (feet at rest, tail straight down,
    eyes ahead).
  - **Bending round corners (since 2.15.0):** `controls.surface` = null (a flat wall) or `{ at(d) → { y, z, a },
    turn }`, the surface's middle line d body lengths ahead of (or behind) the root, in the root's space. `pose()`
    works out the pose flat, then lays each stiff part on the surface where it is (`onSurface`, `bendFrame`): the
    back half at `HIPS_ON`, the chest at `CHEST_ON`, the head at `HEAD_ON`; each foot where it stepped (legs reach
    after that); each tail point. It eases in and out (`BEND_SPEED`) and goes flat while leaping. In the model
    the body blends from `body` to `chest` from `CHEST_FROM` over `CHEST_BLEND` (build_chameleon.py).
  - **Version 2 (since 2.9.0): its look is made in Blender**, the same way as the crow's, from panther-chameleon
    references and the designer's choices (`storyboards/chameleon-model/README.md`): a tall, rounded body about
    twice a real one's width from behind (1.5x at first; widened in 2.9.1 at the designer's request so it reads
    from across the room: `BODY_WIDTH`, `HEAD_WIDTH`, `TAIL_WIDTH` in build_chameleon.py), a spiky back ridge, a low rounded helmet head with a ridge over each
    eye and a pale lip line in a mouth groove, turret eyes with rings of scales, thin legs with mitten feet, a
    tapering tail. About 7,000 triangles after smoothing, in 8 skinned meshes (one per material) on one skeleton.
    Skin pictures (grey, one-channel PNGs painted in code): soft scale bumps everywhere, the pale stripe of
    blotches along each side and faint tail bands. The game tints them in the player's colour: the colour is
    brightened by `SKIN_SHADE` first so the skin comes out in the player's colour with lighter markings;
    `SKIN_BUMPS` sets how strongly the scales stand out. The eyes are never camouflaged.
  - **How it's made:** `node tools/chameleon-skeleton.cjs . blender/chameleon-skeleton.json` (if the skeleton
    changes), then in Blender `blender/build_chameleon.py` (shape numbers at its top; works in its own
    "Chameleon" scene, saved as `blender/chameleon.blend`), then `blender/export_chameleon.py` (writes
    `games/lib/chameleon-model.js`, ~600 KB). Check it in `tools/Game-Lab.html`. Without the model file,
    or with `{ model: "v1" }`, the old shapes built in code are used.
- **`HG.Cat()`** (`games/lib/cat.js`): stands on y = 0 facing -z; 1 unit = chest to hips. Controls:
  `mode` stand/walk/sit/crouch/leap (blended), `speed`, `look` -1..1, `hiss` 0..1, `squint` 0..1.
  Drawn from the Cat_walking and Cat_jumping storyboards.
  - **Skeleton (since 2.10.0):** `cat.joints`: `body`, `neck`, `head`, `jaw`, `ear.0/1`, `eye.0/1`, `lidU.0/1` and
    `lidL.0/1` (eyelids that swing over the eye), `tail.0`-`tail.13` (scaled fatter when it hisses: `TAIL_PUFF`),
    and `leg.0`-`leg.3` `.upper/.lower/.paw` plus `.hock` on the back legs (legs 0-1 front; 0 and 2 its left).
    `pose(p)` sets them from a blended pose; `bindPose()` is the model's pose (standing, tail out behind).
  - **Version 2 (since 2.10.0): its look is made in Blender**, from cat references and the designer's choices
    (`storyboards/cat-model/README.md`): a fluffy-faced grey tabby with painted fur: mackerel stripes down the
    sides breaking up a little, a dark spine stripe, leg bars, tail rings to a dark tip, an "M" on the forehead,
    dark lines from the eyes, a pale muzzle, chin, chest and belly (colour pictures, painted in code); fringes of
    fur round the cheeks (the storyboard's zigzag cheeks); almond yellow-green eyes with slit pupils and lids;
    thin pointed ears with pink insides; a chin and lower mouth on the jaw, with fangs that show when it hisses.
    ~3,700 triangles before smoothing, 13 skinned meshes on one skeleton; whiskers stay plain lines.
    One shared fine-fur bump picture (`FUR_BUMPS`). Chest tufts were tried and dropped: they looked like teeth.
  - **2.10.1 fixes (designer's notes):** a face closer to a real cat's (flatter face, short nose bridge, a pink
    triangle nose, two round whisker pads, soft brows over the eyes); the ears' bases run down inside the head
    and the cheek fur grows from just inside the cheek surface, so neither floats off the head; in a leap the
    ears go flat back (`LEAP_EARS`) and the back legs stretch straight out behind (poses can now set `ears` and
    the back legs' `hock`); and nothing goes through the floor: the sit and crouch heights were raised
    (`SIT_HEIGHT`, `CROUCH_HEIGHT`), elbows and knees bend a little upward, and the tail lies along the floor
    where it would otherwise go through it.
  - **How it's made:** `node tools/cat-skeleton.cjs . blender/cat-skeleton.json` (if the skeleton changes), then
    in Blender `blender/build_cat.py` (shape and colour numbers at its top; its own "Cat" scene, saved as
    `blender/cat.blend`), then `blender/export_cat.py` (writes `games/lib/cat-model.js`, ~650 KB). Without the
    model file, or with `{ model: "v1" }`, the old shapes built in code are used.
- Try the chameleon, the cat and the crow in `tools/Game-Lab.html` (`?asset=cat&action=leap&t=1&freeze=1&ui=0` for
  screenshots; see "Game Lab" below).

## Crow model (Fly Together's birds; meant for future games too)

- `games/lib/crow.js` (`new HG.Crow({ accent, style })` black with colour accents (the Game Lab's "Black with colour" look);
  `new HG.Crow({ colour })` solid colour, as in the games), built in code (no model files): wingspan 1 unit,
  proportions from reference photos (kept locally, see `storyboards/crow-model/README.md`): wingspan ≈ 2.2×
  body length, broad inner wing, five separated "finger" primaries, rounded fan tail, heavy beak. Rig:
  shoulder/elbow/wrist per wing; tertials, 8 secondaries and 8 primaries that fan and fold with the joints;
  coverts that slim as the wing folds; head that stays level when the body tilts; tail that fans/twists;
  legs that tuck in flight.
- Driven by controls each frame: `crow.controls = { mode: "fly"|"land"|"perch", flap: 0..1, bank: -1..1 }`,
  then `crow.update(dt)`; it eases between them. Since 2.8.0 (for Climb Together's crows), when perched:
  `controls.look` (turn the head to an angle instead of glancing about), `controls.peck` 0..1 (stab down,
  beak open) and `crow.caw()`; in the Game Lab as "Peck" and "Stare". The wingbeat is six key poses read from a four-frame
  reference (the key realism: on the upstroke the wrist folds and the hand trails back). Perched idle:
  quick head turns, an occasional caw. The perched fold angles came from a numeric search that keeps
  every feather inside the body outline.
- Look: black with a cool blue-purple gloss (strong warm highlights made it look pale from behind);
  player colour on wing leading edges and finger tips (`setStyle`: edges+tips, tips, edges, none).
- Test it in `tools/Game-Lab.html` ("Crow": actions, colour, model v1/v2, black or solid look, speed;
  `?asset=crow&action=flap&t=1.2&freeze=1&ui=0` for screenshots; `lab.setCamera()` from scripts).
- **Version 2 (since 2.7.0): the crow's look is made in Blender**; the skeleton and movement are unchanged.
  - **What it is:** a smooth one-piece body/neck/head (a loft, skinned to the body and head joints so
    it bends at the neck), a hooked two-part beak, inset eyes, flight feathers and two rows of covert
    feathers per wing bone with painted textures (vane lines, darker edges and tips; soft body
    plumage), and legs. ~2,000 triangles in 7 skinned meshes (one per material) sharing one skeleton.
  - **Why it's faster:** a frame went from 232 to 107 draw calls with two birds.
  - **How it's made:**
    - `blender/build_crow.py` builds every part exactly on the skeleton, placed from
      `blender/crow-skeleton.json`: crow.js's joints in the bind pose (`BIND_POSE`: wings straight,
      fingers spread, tail half fanned, legs down).
    - Each part carries a `bone` property naming its joint, e.g. `wing.1.primary.4`
      (wing 0 = left), or vertex groups for smooth blending.
    - `blender/export_crow.py` writes `games/lib/crow-model.js` (`HG.crowModel`: base64 triangles per
      material, joint pairs and weights per corner, the textures as embedded PNGs).
  - **How the game uses it:** `crow.js` names its joints (`crow.joints`), poses them in `BIND_POSE`,
    binds `THREE.SkinnedMesh`es and maps the model's materials onto its own (so colours, styles and
    `setStyle` still work). It falls back to the built-in shapes if the model isn't loaded, or with
    `{ model: "v1" }`. The model is decoded once and shared by both birds. Tucked legs are shrunk to
    nothing (skin can't be hidden part by part).
  - **To change the look:**
    1. Edit the numbers at the top of `build_crow.py`, or sculpt the parts by hand in Blender
       (keep each part's `bone` property).
    2. Run `export_crow.py`.
    3. Check it in the Game Lab.
  - **If crow.js's skeleton changes:** run `node tools/crow-skeleton.cjs . blender/crow-skeleton.json`
    first, then rebuild.
  - **Blender access:** Blender is driven through the Blender MCP connector, which needs
    `UV_PYTHON=3.13`: its `pywin32` dependency has no Python 3.15 build yet.
- Speed on the studio laptop: Fly Together runs smoothly (the designer's check, 2026-10-30).

## Game Lab (since 2.29.0)

`tools/Game-Lab.html`, asked for by the designer as part of "how we make games": every 3D piece on its own, both
whole levels, and a 3D highlighter for saying what should change. It replaced `creature-lab.html` and `bird-lab.html`.
How the designer uses it is in `docs/making-games/README.md` ("Looking at and marking up 3D pieces").
- **Layout:** a side menu of assets in groups (Animals; Climb Together: parts; Fly Together: pieces; Whole levels),
  the view in the middle, and a panel on the right (view buttons, the asset's actions and options, "Go to" places
  in the whole levels, the highlighter, notes, Save for Claude).
- **The parts** (in `tools/game-lab/`, loaded with classic script tags like the games): `orbit.js` (drag to turn, scroll
  to zoom toward the spot under the mouse, right-drag or shift-drag to slide, double-click to look at a spot, W A S D Q E
  and arrows; three.js's OrbitControls is a module, so this is a small one of its own), `stages.js` (where things are
  shown), `catalog.js` (the list: one entry per asset; add new pieces there), `marks.js` (the highlighter), `lab.js`
  (the page, and the address settings: `asset`, `action`, `t`, `freeze`, `ui=0`, `cam=x,y,z,turn,tilt,distance`,
  `marks=0`).
- **Three stages:** the *studio* (a plain backdrop: the animals, as in the old labs, and Fly Together's pine, bush,
  cactus and boulders); *climb* (Climb Together's own scene, `HG.climb3d.get()`, in the game's own light for where
  the view looks); *fly* (Fly Together's own scene with the whole 3 km canyon built, `buildRange()`). The game scenes
  are used as they are, through small hooks added for the lab: `f.lookFrom` (the lab's camera), `f.beforeDraw`
  (e.g. show one part), `f.keepTerrain` (Fly), and names: `tagged()` in climb3d.js labels each part of the climb
  (`userData.part`: room, shelf, plants, alley, boxes, pipes, windows, roof, crates, rocks, tree, creases, sky; and the
  tank and valley), and both files name their materials and Fly's shapes, so marks can say what they're on.
  The lab's canyon is always the same one (made with a fixed seed, `CANYON_SEED` in stages.js), so notes still match.
- **The highlighter** (`marks.js`): 🖌 Paint (round dabs laid flat on the surface, one shape drawn many times),
  📍 Pin (numbered, always drawn on top, each with a note), 🧽 Erase; Look to move again (Esc). Animals hold still
  while marking. Marks are kept per asset in the browser (`localStorage`), with a pink dot in the menu.
  **Save for Claude** writes `<date>_<time>_<asset>.png` (the view with the marks) and `.json` (the notes: each pin's
  and the paint's `on`: part, material, shape, the animal's nearest joint and action, copy number, metres down the
  canyon and ecosystem; positions; the view; a `reopen` link) into a folder picked once (the project's `lab-notes/`,
  remembered by the browser), or Downloads. **When the designer says they left notes:** read the newest pair in
  `lab-notes/` (or ask where they saved them), look at the picture, follow `lab-notes/README.md`, and describe back
  what you understood before changing anything.
- Tested with the hidden test browser (software drawing): every asset opens without errors; painting, pins, notes and
  saving work. Not checked on the studio laptop (it's a design tool, meant for any computer with Chrome).

## Decisions and preferences

- Kids first: big visuals, few words, short rounds, nothing a child can break by mashing buttons.
- **Cooperation over competition** is the goal for games.
- Calibrate per round, relative to each player; never assume which wrist or strap orientation.
- Prefer "wait for the players, with time limits" over fixed timers.
- Offline-safe: no runtime downloads except the Google font (falls back to a system font).
- Changes ship as a zip extracted over `C:\HeartbeatGames` (keeps UIA.ahk); bump `VERSION`.
- Stylized-realistic 3D look (three.js), low-poly, warm light, haze.

## Open source

- **Licences (chosen by the designer):** code under the **MIT License** (`LICENSE`, "Copyright (c) 2026
  Jack's Urban Meeting Place (JUMP)"; it was GPLv3 until 2.28.1, switched to match JUMP's standard for all its
  projects); storyboards, art, pictures and docs under **CC BY-SA 4.0** (`LICENSE-ART.txt`). Both are official texts, and the README's Licence section
  explains which applies where. Third-party parts keep their own licences (three.js MIT, the font OFL,
  UIA-v2 separate). Anything added must be compatible and credited.
- **`README.md` is the public front door.** This file is the detailed memory, and the bundle is the
  everything-in-one copy. Keep all three current.
- **Never commit pictures or files we don't own.** `.gitignore` leaves out `UIA.ahk`,
  `storyboards/crow-model/references/` (stock and web photos), `storyboards/chameleon-model/references/`
  and `storyboards/cat-model/references/` (Wikimedia Commons photos, credited in their `CREDITS.txt`)
  and every `storyboards/**/unpublished/`
  (photo-based concepts, e.g. the two `Realistic_Birds_*.png`). Write down what was learned from them instead.
- **On GitHub (since 2.28.1):** published as a public repo in the Jack-s-Urban-Meeting-Place organization.
  `.gitignore` also leaves out Chrome's data, the launcher's log, the test tools and test output, and the
  comparison screenshots saved in the main folder while working (`/*.png`).
- **The credit footer:** setup and menu screens show, small in the bottom-right corner beside the version,
  "Free and open source under the MIT License (linked to `LICENSE`) · Built with Claude Code <version>
  (model: <model>)". It hides on the game screen (`body:has(#game.active)`), so it never covers a game.
- **Write code and comments for a stranger:** no personal names, emails, or studio-only paths.
- **Made for AI readers too:** this file (`AGENTS.md`) is the vendor-neutral entry point, `llms.txt` is the
  index, and `HEARTBEAT-GAMES-BUNDLE.md` is the one-file copy. Nothing important lives only in a hidden
  (dot) folder, because some upload tools skip them.

## Working with the designer

The games are designed by an artist and studio lead, not a programmer. They share game ideas as
whiteboard storyboard photos with a short description (colour-coded: pink world, blue characters,
green movement, black body/text). Always describe the storyboards back and confirm before building.
Follow `docs/making-games/README.md` for any new game or big change. Speak plainly and show screenshots.

## Known quirks and open items

- 3D performance: both games run smoothly on the studio laptop (the designer's check, 2026-10-30,
  version 2.18.3). If a later change makes one slow: lower `AHEAD`,
  `PLANTS_PER_CHUNK`, `BOULDERS_PER_CHUNK`, or the pixel-ratio cap in flight3d.js.
  The deserts draw about as many triangles as the Alpine (~200k in tests).
- Sheer cliff faces are one smooth colour gradient (the ground is a height map, so a vertical face
  has no points in between for rock layers); the layers show on slopes and mesa tops.
- The studio laptop's own Bluetooth may behave differently from the Logitech adapter
  (maybe no popups, maybe permanent pairing works). The launcher copes either way.
- Hand-off detection (sensor taken off one kid, put on another) is unsolved: drift over 5 s
  was the most promising signal; not yet built into the games.
- heartbeat-log.txt grows forever (no trimming yet).
- **Climb Together is tested only with simulated sensors.** Still to check with real kids: whether the
  climbing motion's movement levels match `CLIMB_START` / `CLIMB_FULL` / `STILL_ENERGY`, whether leaning
  a climb steers reliably (the lean is measured while the arm swings), whether the freeze warning is
  long enough, and how long a good team takes to reach the top (aimed at 70-85 s of a 90 s round).
- **Climb Together's length:** the route to the top is about 17 m since 2.16.0 (it was 12 m of height when
  `CLIMB_SPEED` was set). The designer chose to keep the speed and the 90 s round; check with real kids how far
  teams get. The cat still appears on a ledge rather than walking between walkways.
- Climb Together uses its own 3D drawing surface (graphics context), separate from Fly Together's; both
  are made once and reused. It ran smoothly on the studio laptop (2.18.3, 2026-10-30), before the room's
  and alley lighting (2.19.0, 2.20.0) added two shadow-casting spotlights (only one drawn at a time) and soft
  image-based light, and the glow (2.25.0) draws the world into a picture first; if that's slow, set `GLOW` false, lower
  `DUST`, or turn off `SHADOWS` or lower `CAMO_DETAIL` in climb3d.js.
- Ideas: a game for button 3, a laminated instruction sheet, heart-rate games (would need switching
  sensors out of fast mode), birds of prey, sparkling river, sunset option, arches as a bonus to fly
  through. (The mesa-canyon storyboard is now the Deep Desert.)

## Testing

`tools/try-game.mjs` (Node.js + Playwright) replaces `PolarSensor` with simulated sensors, plays a
movement timeline in game time (`app.gameTime`), prints events and saves screenshots. See
`docs/making-games/testing.md`. The launcher/AutoHotkey parts can only be tested on the real laptop:
check `heartbeat-log.txt`.

## Glossary

| Term | Meaning |
|---|---|
| **shell** | `js/app.js`: everything around the games (setup, menu, buttons, reconnection, running rounds) |
| **game contract** | the object a game passes to `HG.registerGame`, documented at the top of `js/app.js` |
| **player view** | what a game sees of each player: `energy()`, `up()`, `tilt()`, `motion()`, `connected` |
| **energy** | 0 to 1: how much a player is moving right now (half-second window) |
| **up()** | the direction of "up" for the sensor, used for tilt; meaningful only after calibration |
| **SDK mode / fast mode** | the Verity Sense mode that streams motion at up to 416 Hz but turns heart rate off |
| **PMD** | Polar Measurement Data, the Bluetooth service that carries the motion data |
| **Wings** | the per-player calibration in `flight.js`: learns "level", then "left" |
| **Launch / nest start** | the start of a Fly Together round: checklist in the nest, 3-2-1, take-off |
| **solo** | one player: decided at the tilt step (a player who never tilts is left out) |
| **together / streak** | Fly Together: how close the birds are (0 to 1), and how many seconds they've stayed together |
| **bonk / bump** | hitting the valley wall: costs speed and resets the streak |
| **ecosystem** | Alpine, High Desert or Deep Desert: the 1,000 m looks the valley loops through |
| **chunk** | a 60 m section of 3D valley, built just ahead of the birds and dropped behind |
| **introArt / menuArt** | a game's picture on its START screen / its menu tile |
| **photo finish** | the end-of-round freeze → zoom → Polaroid effect (`games/lib/photo-finish.js`) |
| **launcher** | `heartbeat-launcher.ahk`: starts Chrome, connects sensors, clicks Windows' pairing popups |
| **episode** | in the launcher's log: one player's connection attempt, from "connecting" to finished |
| **settling** | the page waiting for Windows to finish pairing before starting motion |
| **demo mode** | Ctrl+Alt+Shift+F9: simulated sensors, for trying the games without hardware |
| **escape** | the start of a Climb Together round: the checklist in the tank, then its front pops off |
| **lookout / finale** | Climb Together's end: on up through the leaves to the bough at the very top, looking out over the valley |
| **climber / effort / lean** | Climb Together: how one player's sensor is read; effort = how hard they climb (0 to 1), lean = steering (-1 to 1) |
| **camo** | camouflage: a hiding chameleon shows the picture behind it, all but its eyes |
| **visit** | a cat or crow coming to look: arrive → look → (catch) → leave |
| **ledge / perch** | where a cat can stand / a crow can land (`level.ledges`, `level.perches` in climb3d.js) |
| **storyboard** | a photographed whiteboard drawing of a game idea; colours: pink world, blue characters, green movement, black body/text |

## History

Version, date and what changed (newest first). Exact dates were only noted from 2.18; earlier versions
were all made in October 2026. The sections above say more about each.

| Version | Date | What changed |
|---|---|---|
| 2.29.0 | 2026-11-10 | The Game Lab (`tools/Game-Lab.html`) replaces the creature and bird labs: every 3D piece and both whole levels, a side menu, drag to turn and scroll to zoom, and a 3D highlighter (paint, numbered pins, notes) that saves a picture and a notes file for Claude into `lab-notes/`. Small hooks in climb3d.js and flight3d.js for it (named parts and materials, the lab's camera); the games themselves are unchanged. |
| 2.28.1 | 2026-11-04 | Brought up to JUMP's project standard: code now under the MIT License (art and docs stay CC BY-SA 4.0); open-source credit footer on the setup and menu screens; one-line `CLAUDE.md`; this History; published on GitHub. Clear help for getting `UIA.ahk` (not included): `GET-UIA.txt`, the README and READ ME FIRST give the link and where to put it, `setup.bat` offers to download it, and the launcher shows a message if it's missing. |
| 2.28.0 | 2026-10-30 | The menu shows just the two games, each half the screen, with new pictures shot from the new graphics. |
| 2.27.0-2.27.1 | 2026-10-30 | Fly Together graphics pass: real shadows (reaching 150 m ahead since 2.27.1), ground creases and speckle, sky-coloured bounce light, the river mirroring the sky. Glow shared in `games/lib/glow.js`. |
| 2.26.0 | 2026-10-30 | Games get ready in the background while the sensors connect (`warmUp()`), to stop first-time stutters. |
| 2.19.0-2.25.0 | 2026-10-30 | Climb Together lighting pass: window-shaped sunbeam and dust in the room, shade and evening sun in the alley, afternoon sun in the open, golden hour at the tree top, the valley loading while hidden in the leaves, creases, glow. |
| 2.18.0-2.18.3 | 2026-10-29 | Climb Together after playtesting: the finale on the very top and the valley view; hearts (one stream since 2.18.1); chameleons sit still at the top (2.18.2); a "climb to the right" step and no stick in the tank (2.18.3). |
| 2.17.0-2.17.1 | October 2026 | Visits get warier higher up; the tree's branches fixed. |
| 2.14.0-2.16.0 | October 2026 | Through the window into the alley; chameleons bend round corners; the whole climb mapped above the brick wall (windows, roof, crates, rocks, tree). |
| 2.11.0-2.12.0 | October 2026 | The chameleon's leap; the climbing map (bookshelf, plants, sill). |
| 2.8.0-2.10.1 | October 2026 | Climb Together (button 2); the chameleon's and the cat's looks made in Blender. |
| 2.5.0-2.7.0 | October 2026 | The crow model (made in Blender since 2.7.0); full-screen games and menu pictures. |
| 2.2.0-2.4.0 | October 2026 | Fly Together's ecosystems; the launcher's pairing fix after a wake (2.2.1, from the 2026-10-22 log); the START-screen picture; the Polaroid end screen. |
