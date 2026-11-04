# The sensor, and what makes a game feel good

## What the sensor gives a game

Games never talk to Bluetooth. They read each player through the player view
(`ctx.players[i]`), updated about 52 times a second (packets arrive several times
a second at the 416 Hz fast mode the games use):

| Call | What it is | Good for |
|---|---|---|
| `p.connected` | true while the sensor is streaming | showing who's in, ignoring a missing player |
| `p.energy()` | 0 to 1: how much they're moving now (half-second window, log scale) | dance, run, shake, freeze games |
| `p.motion()` | the same, raw, in milli-G (about 3 to 5 lying still, hundreds when moving) | detecting bursts: jumps, stomps |
| `p.up()` | unit vector: which way is up for the sensor (smoothed) | tilt and lean, with calibration |
| `p.tilt()` | `{pitch, roll}` in degrees, from `up()`, uncalibrated | quick experiments only |
| `p.latest()` | newest raw reading `[x, y, z]` in milli-G | custom signal processing |

## What it can't do (say so early)

- No position in the room, no facing direction (accelerometer only, no compass).
- No heart rate while in fast mode. Heart-rate games would need the sensor switched
  out of SDK mode, which makes motion slower (52 Hz, about 0.7 s packets). Not built yet.
- Skin contact detection is unreliable on the Verity Sense (Polar says so). A sensor
  being taken off isn't detected instantly; lying still on a table looks like "very
  low movement and no orientation drift over several seconds".
- About half a second of delay comes from the sensor's packets. Design for flowing
  control (steering, filling meters), not split-second reflexes.

## Calibration: always per round, per player

Strap orientation and which wrist differ for every child, so never assume an axis.
The proven pattern (`HG.flight.Wings`, usable outside flying games too):

1. **Hold still in the start pose** for about 1.5 s: record "level" (average `up()`).
2. **Do the motion once** (e.g. "tilt to the left"): record its direction.
3. **Return to the start pose** before anything starts. Never launch straight
   after step 2: players will still be leaning (this caused crashes).

Each step waits for the players (with a time limit). Show a tick per player as they
complete a step, and mirror their movement on their character once calibrated, so
kids can see it working. A player who never does step 2 is treated as not playing:
that's how one-player mode is chosen automatically. See `Launch` in
`games/lib/flight.js`, including the quick/slow wait for an idle sensor.

## Steering feel

- A dead zone (about 4°) so tiny wobbles don't steer; full steering at about 35°.
- Smooth everything that's shown (ease toward targets), but act on the raw signal
  for collisions and scoring so the game stays fair.
- Steering can strengthen a little at high speed so fast moments stay possible.

## Designing for the room

- Kids, big screen, busy room: big shapes, few words, plain instructions, short
  rounds (about a minute of play). Visuals over reading.
- **Cooperation is the goal.** Reward doing things together (hearts streaming between the birds, speed,
  the view turning). Team scores; a single player should still have a good time.
- Don't end rounds on mistakes; make mistakes cost a little (a BONK, slowdown,
  streak reset) so the round keeps flowing.
- Difficulty rises with progress (narrower, faster), and good play earns speed.
- Gentle assists are welcome (a loose magnet pulling near-misses together) as long
  as a child can always override them with a clear movement.
- Arms get tired: rounds of about 60 to 80 seconds; rest between rounds.
- Anything a child can mash must be harmless: game buttons are ignored mid-round,
  Back needs a second press, Start only works on intro and results screens.
- One sensor missing or dropping mid-round must never break a game (the shell
  reconnects it automatically; meanwhile that player's input is simply quiet).

## On-screen copy

Short, warm, imperative, readable from across the room: "Hold your wings out",
"Tilt to the left ⬅", "Fly together!", "BONK!", "Together 12 s 🔥". Results lead with
a celebratory headline ("You flew 1,250 m together!") and one line of detail.
