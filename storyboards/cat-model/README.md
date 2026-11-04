# Cat model references

The next version of the cat in `games/lib/cat.js` (Climb Together's visitor) is being modelled
from ten reference photos of cats, chosen from about 260 on Wikimedia Commons (walking, jumping,
crouching and hissing cats), together with the designer's own storyboards
(`storyboards/climb-together/Cat_walking.jpg` and `Cat_jumping.jpg`). The photos are freely licensed
(CC0, CC BY and CC BY-SA), but they are kept locally for study only, so they are **not published
with this project**: the `references/` folder is left out by `.gitignore`. Its `CREDITS.txt` lists
each photo's title, photographer, licence and page.

## Choices made by the designer (2026-10-28)

- **Coat:** grey tabby, as now: it stands apart from the orange and purple chameleons, from the
  black crows, and from every background in the climb.
- **Face and fur:** fluffy-faced, like the storyboards: tufty cheeks and chest, a sly squint, and
  fur that puffs up when it hisses.
- **Fur:** painted, like the crow and the chameleons: smooth shapes with the stripes and soft fur
  painted on, and tufts as shapes at the cheeks, chest and tail (no see-through fur layers, which
  would be heavy for the studio laptop to draw).

## What the references show

| Reference | What it's for |
|---|---|
| 01-tabby-walking-tail-up, 02-prowling-on-ledge, 03-tabby-stripes-side | Walking and prowling along a ledge (as the cat does on the shelves): long slender legs, a long body sloping up to the hips, head held low while prowling, tail up in a hook or held out low behind. The tabby pattern: a dark stripe down the spine, narrow dark stripes running down the flanks from it, bars on the legs, rings down the tail to a dark tip. |
| 04-crouching-on-ledge | The crouch before a pounce: body pressed low, shoulder blades standing up, head low and forward, front paws tucked under, staring. |
| 05-fluffy-tabby-sitting, 06-fluffy-face-front | The fluffy face: a ruff of longer fur round the cheeks and a pale bib on the chest make the head look wide and round; tufts inside the ears; a dark "M" on the forehead; dark lines from the outer corners of the eyes across the cheeks; a pale chin and muzzle; big green-yellow almond eyes with a dark rim and narrow upright pupils. |
| 07-hissing-face, 08-arched-back-hiss | The hiss (the designer's Cat_jumping storyboard): ears flattened out sideways and back, mouth wide open showing four fangs, whiskers pushed forward, eyes wide; from the side, the back arched high, fur puffed up all over, legs straight and stiff. |
| 09-leaping, 10-pouncing-down | The leap and pounce: the body stretched long, front legs reaching forward with paws spread, back legs pushing out behind, tail out straight behind or curving up. |

## What was built (version 2.10.0)

Version 2 is made in Blender, as with the crow and the chameleon: `games/lib/cat.js` now has a
skeleton of named joints (body, neck, head, jaw, ears, eyelids, tail, and each leg's bones);
`blender/build_cat.py` builds the fluffy grey tabby on it, with the stripes, "M", eye lines and
pale muzzle, chin, chest and belly painted into the skin pictures and fringes of fur round the
cheeks; and `blender/export_cat.py` writes `games/lib/cat-model.js`, which the game loads. Tufts on
the chest were tried and dropped (they looked like a necklace of teeth); the pale bib is painted on.
The shape and colour numbers are at the top of the build script.
