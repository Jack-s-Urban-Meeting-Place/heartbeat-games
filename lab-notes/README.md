# Lab notes

Notes the designer leaves in the Game Lab (`tools/Game-Lab.html`) land here: one pair of files per save,
named by date, time and what was marked, e.g. `2026-11-10_1432_climb-tree.json` and `.png`. Only this README
is published: the notes themselves are working notes, kept out of the public repository by `.gitignore`.

## Reading a note (for Claude, or anyone working on the games)

- **The picture** (`.png`) is the view as the designer saw it, with their marks: pink paint over an area, and
  numbered pink pins on exact spots. Look at it first.
- **The notes file** (`.json`):
  - `asset`, `assetName`: what was being looked at (an id from `tools/game-lab/catalog.js`).
  - `note`: the designer's general note.
  - `pins`: each pin's `number` (as in the picture), its `note`, what it's `on`, and where (`at`).
  - `paint`: how many brush `dabs`, what they `cover` (grouped by what they're on, most first), the `box` they fill,
    and every dab's position (`dabsAt`).
  - `on` says what a mark touches, in the game's own words: the level's `part` (from `tagged()` in
    `games/lib/climb3d.js`, e.g. "tree", "shelf"), its `material` (the key in that file's materials, e.g. "canopyB"),
    the `shape` (e.g. "pine tree"), the animal's nearest `joint` (e.g. "leg.1.upper") and the `action` it was doing,
    a `copy` number for shapes drawn many times, and in Fly Together's canyon how many `metresDownTheCanyon` and in
    which `ecosystem`.
  - Positions are `[x, y, z]` in metres, in the game's own 3D space (y is up). In Fly Together the canyon runs
    toward -z (so 500 m down the canyon is z = -500).
  - `view` and `reopen`: where the camera was. Open `reopen` (relative to the project folder) to see the same view.
- **Before changing anything**, describe back what you understood from the marks and check it with the designer,
  as with a storyboard (see `docs/making-games/README.md`).
