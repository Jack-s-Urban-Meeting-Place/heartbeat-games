# Reading the storyboards

Game ideas arrive as **photos of whiteboard drawings** plus a short written
description. The fast workflow (draw on the whiteboard, snap a photo) is
deliberate: the drawings are quick, clear and fully readable, so don't ask for
cleaner versions unless something truly can't be read.

## What the photos look like

- A rectangle frame per panel, drawn as the screen. Several panels may share a photo;
  partial neighbouring panels at the edges belong to other storyboards.
- Glare spots and faint ghost lines from earlier drawings are normal. Ignore them.
- Each photo has a descriptive file name (e.g. `Ready_in_nest.jpeg`,
  `Transition_to_canyon.jpeg`), which hints at its role.

## Colour conventions

The user colour-codes consistently and explains it in the description. So far:

| Colour | Means |
|---|---|
| **Pink** | The world: scenery, geometry, the sensor itself on a wrist |
| **Blue** | The players' characters (e.g. the birds); "PLAYER 1 / PLAYER 2" labels |
| **Green** | Movement: arrows for motion through the world, or of arms and wings |
| **Black** | The player's body (on wearable diagrams), or on-screen text prompts |

Always check the description: if it gives a different key, use that.

## Labels and text

- Labels in block capitals name things: TREE, NEST, LEAVES, MOUNTAINS, BASE GEOMETRY,
  MOTION, PLAYER 1. A line often connects a label to its object.
- Black text inside a frame (often as bullet lines) is **on-screen copy**, in order:
  e.g. "HOLD WINGS OUT / TILT TO THE LEFT / GET READY. 3.2.1" became the nest checklist.

## Kinds of panel, and what to take from each

- **Wearable panel** (person in black, sensor in pink, arrows in green): where the
  sensor is worn and the body movement that controls the game. Example: arms out
  in a T, sensor on top of one wrist, arms seesawing like wings → steering by tilt.
- **Base geometry panel**: the camera and space. Example: one-point perspective,
  vanishing point centred, horizon a quarter of the way down, green arrow = always
  moving forward into the screen. Respect these numbers when building the camera.
- **Scene panels**: what the world contains and how it's laid out (layered ridges
  forming a valley, a river down the middle, a mesa canyon, a nest on a branch).
- **Character placement**: where the player's character sits on screen and what it
  does (bird near the bottom centre, seen from behind, wings banked; green arrow
  showing the path it can take).
- **Transition panels**: an animation between two moments, read the arrows as
  movement over time (camera pulls back, birds lift out of the nest, tree and nest
  slide away into the foreground).
- **Stretch-goal panels**: the user often says which panels are "later". Build the
  core first and keep the stretch goal in mind (and in AGENTS.md's ideas list).

## Describing it back

Before building, write back what you see, one short paragraph per photo, in the
user's terms. Mention colours and labels you relied on, say where you're unsure, and
point out sensible small adjustments. Example from the nest storyboard:

> **Ready in nest:** a close-up of a big nest on a branch, with leaves, and both
> birds sitting in it with their wings out. The green arrows show the wing
> movements for calibration, and the black text at the top is a checklist of
> prompts: "Hold wings out," "Tilt to the left," "Get ready, 3, 2, 1."

Then propose the gameplay, and ask only the questions that change the build.
The user answers quickly when given clear options.

## How the Fly Together storyboards became the game

| Storyboard | Became |
|---|---|
| Player wearable (T-pose, sensor on wrist, seesaw arrows) | Steering by tilt, learned per player by the `Wings` calibration (level, then lean left) |
| Base geometry (one-point perspective, horizon at 1/4, forward arrow) | Camera pitched so the horizon sits a quarter of the way down; endless forward flight |
| Simple mountains and bird (layered ridges, bird at bottom centre) | The winding valley with ridges both sides, bird seen from behind, camera following |
| Bird flying through canyon (stretch goal) | The Deep Desert ecosystem (2.2.0): sheer red cliffs, mesa tops, cactus, the river |
| Ready in nest (nest, two birds, checklist) | The nest start: checklist with ticks per player, birds mirroring arms |
| Transition to canyon (pull back, fly out, tree and nest to foreground) | The take-off animation; the round clock starts here |

Ideas that came from conversation rather than drawings, and worked well: flying
close together for a speed boost that grows (cooperation), the view tilting when
both lean together, a loose "magnet" between birds, passing over/under instead of
colliding, the valley narrowing with distance, going solo automatically when only
one player calibrates.

## From body movement to sensor signal

| What the drawing shows | Sensor signal to use |
|---|---|
| Arms tilting / leaning / banking | Tilt from `p.up()`, calibrated with `Wings` (level + lean) |
| Moving a lot, dancing, running on the spot | `p.energy()` (0 to 1) |
| Freezing like a statue | `p.energy()` staying low for a while |
| Jumps, stomps, punches | Sudden spikes in `p.motion()` (react on arrival; don't wait for smoothing) |
| Where someone is in the room, or which way they face | **Not possible.** Suggest a tilt or movement alternative |
| Heart rate | Not in the current fast mode; would need a mode switch (see sensor reference) |
