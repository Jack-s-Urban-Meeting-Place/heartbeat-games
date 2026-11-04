# Chameleon model references

The next version of the chameleon in `games/lib/chameleon.js` (Climb Together's players) is being
modelled from about ten reference photos of **panther chameleons** (*Furcifer pardalis*), chosen
from roughly 220 on Wikimedia Commons. They are freely licensed (CC0, CC BY and CC BY-SA), but
they are kept locally for study only, so they are **not published with this project**: the
`references/` folder is left out by `.gitignore`. Its `CREDITS.txt` lists each photo's title,
photographer, licence and page.

## Choices made by the designer (2026-10-28)

- **Head:** panther chameleon: a low, rounded helmet (not the tall veiled-chameleon crest).
- **Pattern:** calm: mostly the player's colour (orange or purple), with a pale stripe of blotches
  along each side, in lighter and darker shades of that colour.
- **Skin:** smooth, with soft bumps and a hint of scales, like the crow: stylized-realistic, clean
  from a distance (not every scale modelled).
- **Width:** real shape from the side, but about 1.5 times wider from behind than a real one, so
  kids can spot their chameleon on the wall from across the room (the game camera sees them mostly
  from behind, where a real chameleon is very narrow). After seeing it in the game, the designer asked
  for it **a bit wider** still (version 2.9.1): now about twice a real one's width from behind.

## What the references show

| Reference | What it's for |
|---|---|
| 01-climbing-up-trunk, 02-climbing-up-branch, 03-climbing-from-behind | The game's view: from behind and above while climbing. The body is narrow and deep (flattened side to side), the back ridge is a row of small spikes, the head from above is a pointed wedge, the legs come out sideways with elbows and knees bent outward, the tail hangs or wraps the branch. |
| 04-side-full-body, 05-calm-colour-side-stripe, 06-feet-gripping | Proportions from the side: a deep, rounded body arching up to a peak over the hips; a short neck; the pale side stripe of separate blotches from the shoulder to the hips; spiky scales along the throat; legs thin and long for the body. |
| 07-head-side, 08-head-front-eyes | The head: a ridge from the snout tip over the eye to a low, rounded helmet at the back; a big wide mouth with a pale lip line ending in a lighter jaw patch; turret eyes covered in skin with radiating rows of tiny scales and a small round opening for the pupil; seen from the front, the two eyes stick out on either side of a narrow, ridged face. |
| 06-feet-gripping, 10-walking | The feet: mitten-like bundles of toes (two on one side, three on the other) closing around a branch like tongs; the walk: one front foot and the opposite back foot move together, the body rocks a little. |
| 05-calm-colour-side-stripe, 09-tail-curl | The tail: thick at the base and tapering, curled into a tight flat spiral when resting, with faint bands. |

## What was built (version 2.9.0)

Version 2 is made in Blender, as with the crow: `blender/build_chameleon.py` builds it on the
chameleon's skeleton (so its climbing walk, eyes, tail and camouflage keep working), and
`blender/export_chameleon.py` writes `games/lib/chameleon-model.js`, which the game loads. The
shape numbers (body, head, eyes, legs, tail) are at the top of the build script; see
"Chameleon and cat" in `AGENTS.md` for how the pieces fit together.
