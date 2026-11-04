# Climb Together: storyboards

Whiteboard storyboards for the second game, drawn by the designer (CC BY-SA 4.0, like all the
project's art). Colours as usual: pink = world, blue = characters, green = movement, black = body.

**The idea:** two chameleons (one per player) escape from an aquarium and climb to safety: up a
bookshelf, out a window, through an alley, up a brick wall, over rocks and up a giant tree.
Players climb on the spot to climb; leaning the climb steers left or right. When a cat or a crow
comes by, players hold still and their chameleon camouflages (takes on the background, all but
its eyes). A chameleon that's caught falls back a few steps; if the two get too far apart, the
top one falls back to join the other. Both reaching the top of the tree wins.

Built in version 2.8.0 as button 2: `games/climb-together.js`, with the world in
`games/lib/climb3d.js` and the animals in `games/lib/chameleon.js` and `games/lib/cat.js`.

| Panel | What it shows | What it became |
|---|---|---|
| `Base_Geometry_Cham_Game.jpg` | The camera: two-point perspective with the horizon across the middle of the screen; the green arrow is the usual motion (up, winding a little). | The camera stays level as it rises with the chameleons (it never looks up or down), and looks at the climb a little from one side (`VIEW_FROM_SIDE`), so upright edges stay upright and shelves and boxes show their depth. |
| `In_Game_geo_populated.jpg` | The opening shot: the bottom of a bookshelf, books on the shelves, an aquarium with the two chameleons (P1, P2) inside. Calibrating knocks the aquarium over so they escape. | The round starts close up on the tank on the bottom shelf. The start checklist is the calibration: hands up and still, climb on the spot (the tank rocks), climb to the left, then to the right (it rocks harder), freeze, and they shove the tank's front off (since 2.18.0; at first the whole tank tipped over and fell away). |
| `Cham_climbing.jpg` | A chameleon climbing up the spines of books; arrows show the path upward. | The chameleons climb with their bellies to the surface and backs to the camera, in a rocking diagonal walk (front-left with back-right), feet planted as they go. |
| `Player_actions.jpg` | The player's move: hands up, palms forward, reaching up one hand after the other. The sensor (pink) is on the wrist. | How hard a player climbs sets their chameleon's speed; the climbing arm's average lean steers. Redrawn with both players for the START screen (`games/art/climb-together-pose.svg`). |
| `Cat_walking.jpg` | A cat prowling: cats walk along flat surfaces like the shelves. | `games/lib/cat.js`: a grey tabby with sly half-closed eyes. It jumps onto a shelf, sill, box top or pipe near the chameleons, looks around, strolls a little, sits, and jumps away. |
| `Cat_jumping.jpg` | A cat leaping into the scene, claws out, hissing. | The cat's pounce: a crouch with its bottom wiggling, then a leap with its mouth open, ears back and tail puffed. |
| `All_levels_zoom_out.jpg` | The whole climb, bottom to top. | The nine sections of the climb, in the same order, about 11 m in all (`level.SECTIONS` in climb3d.js). |
| `Level_001.jpg` to `Level_004.jpg` | Close-ups of the same climb, bottom to top. | Bookshelf and potted plants; open window, alley boxes on a ledge, brick wall with two pipes; broken windows, a parapet with wooden crates on the roof; big rocks with grass and small plants in front of a grassy hill; the giant tree with three branches and a leafy crown. |
| `zoom_thru_open_window_001.jpg` to `_003.jpg` | The camera move (green) at the top of the plants: the chameleons leap from the plants into the open window, crawl through it, and come out in an alley with boxes against a brick wall. | Since 2.14.0 the room's window opens onto a real alley, 1.4 m deep, its floor level with the sill. The chameleons crawl over the sill and along the alley floor to the boxes, and the camera follows them in through the window (it turns to look straight on as it passes the opening). The potted plants fade while the chameleons cross the sill, so the leaves don't hide them. |
| `All_levels_zoom_out_marked_window_boxes.jpg`, `All_levels_zoom_out_marked_rocks_tree.jpg` | The whole climb again, with small green and black arrows marking short flat stretches: the alley floor between the window and the brick wall, the top of the broken-window block, the crate tops, the rock tops. | The alley floor is in (2.14.0); the rest since 2.16.0. Above the brick wall the climb is a staircase stepping back: over a broken window's sill and up inside it, over the parapet and back across the roof, up a low crate and across, up the tall crates and across, up three rows of rocks (grass and small flowers on top) and across each, then back across the top rock to the tree's roots and up the trunk. Each walk is short (about 1.5 s), at the designer's choice. |
| `Bend_up_at_right_angle.jpg`, `Bend_up_at_right_angle_animation.jpg` | A chameleon reaching an inside corner (floor to wall), and a side view of it bending its body up the wall, front first. | Since 2.15.0 the chameleon's body bends through the corner: its front half climbs the new face while its back legs and tail are still on the floor, then the rest follows. (The chameleon has a chest joint now, and every part lies on the surface where it is.) |
| `climb_over_ledge_animation.jpg` | A side view of a chameleon climbing over an outside edge (the panels go down over it; in the game they climb up a face and over onto the top). | Since 2.15.0 the body curls over the edge the same way: the front over the top, the back legs gripping the face, the tail hanging down it. |

Visitors (from the designer's notes with these panels): since 2.14.0 a cat or crow comes more often
(every 7-11 s) and arrives in the top part of the view, so it's easy to see while it looks around. Since
2.17.0 they get warier as the climb goes up: near the top they come every 4-6.5 s, look for less time,
spot a moving chameleon quicker, and fly off sooner (the time to freeze stays the same).

Things added that aren't in the panels: crows come instead of cats once the climb is above the roof
(they land on the parapet, crates, flat rocks and tree branches, look about, caw, and peck); a short
"Wait for your friend!" warning before the top chameleon slides back; and the Polaroid ending from
Fly Together ("Just two chameleons climbing to freedom together").
