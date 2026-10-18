# Mano Colony art sources

`originals-v2/` holds the thirteen sheets the isometric game is built from,
exactly as delivered (never edited):

| file | contents |
| --- | --- |
| `mano-move.png` | Mano walking toward the viewer, down-right and down-left (4 frames each) |
| `mano-back.png` | Mano walking away, up-right and up-left (used for every walk away from the viewer) |
| `mano-work.png` | axe, pickaxe, hammer and gathering stardust (4 frames each) |
| `mano-carry-rest.png` | carrying wood / stone / stardust, standing, sitting, sleeping, cheering |
| `buildings.png` | house, lumber mill, quarry, storage — levels 1–3, isometric |
| `nature.png` | oak, pine, sakura, sapling, bushes, stump, rocks and crystals in three stages, camp crate |
| `street-props.png` | fence pieces, gate, hedges, benches, lamps, signpost, board, banner |
| `garden-props.png` | planters, flower beds, fountain, cat statue, arch, pergola, picnic things, well, … |
| `water-construction.png` | bridges, dock, cattails, lilies, boat, building plot, frame, scaffold, carts |
| `effects.png` | poof, sparkle, dust, hearts (4 frames each) |
| `iso-tiles.png` | 2:1 diamond tiles: grass, sand, cobble, brick, planks, soil, water |
| `ui-icons.png` | resource, building, action and menu icons |
| `terrain-edges.png` | water edge pieces — kept, but not used (the game draws its own shorelines) |

`originals-play/` holds the seven play and rest sheets, as delivered (one row
= one action, four frames, left to right; listed in `manifest-play.json`):

| file | rows (actions) |
| --- | --- |
| `solo-roll.png` | waving limbs on the back · rolling over · flopping back from sitting · on the belly kicking feet |
| `solo-play.png` | dancing · hopping · chasing the tail · watching a butterfly |
| `duo-tussle.png` (two Manos) | playful pawing · pushing, then sitting down laughing · peekaboo |
| `duo-play.png` (two Manos) | high five · rolling a ball · dancing hand in hand |
| `solo-rest.png` | yawning and stretching · curled-up nap · eating a cookie · blowing bubbles |
| `duo-rest.png` (two Manos) | dozing on a shoulder · patting a head · sharing cookies |
| `solo-garden.png` | smelling a flower · throwing petals · stacking stones (they topple) · sitting and swinging the feet |

These sheets are not on an exact grid: frames are found where they are drawn
(row bands from the drawn lines; between frames that touch, the cut goes along
the emptiest column). Each sheet gets one scale that matches the hood width of
the walking Mano, so no pose is stretched and no frame changes size; frames
stand on their lowest body pixel (or on one ground line for a whole row when
the action leaves the ground, like hopping). Two-Mano frames are kept as one
picture of the pair: the game shows it for two real residents playing together.

`originals/` holds the nine sheets of the first, top-down version; they are kept
as delivered and no longer used.

`manifest-v2.json` lists every object taken from the sheets: its name, the atlas
it goes to and its size in the game (`k` = source pixels per game pixel). Where
drawings touch, an explicit `box` (and `anchor`, the point that stands on the
ground) is given. `scripts/colony-assets.py` turns the originals into the game
files in `src/colony/assets/` (those are committed, so building the site needs
nothing from here):

- transparency is cleaned softly: faint noise around drawings is removed, but
  semi-transparent edges and thin lines keep their alpha (nothing is forced to
  fully opaque, nothing is cut by a hard threshold);
- each object is cut out by its own connected pixels inside its grid cell, so
  neighbours never bleed into each other;
- every Mano sheet is scaled so Mano stands the same height (52 game px) and
  frames are anchored at the feet, so animations do not wobble;
- diamond tiles are resized to exactly 64 × 32 (stored at 2×), masked to the
  diamond, and their colour is bled 1 px outward from 2 px inside the edge, so
  tiles meet without seams or dark dots;
- everything is stored at 2× (sharp on phones) and packed into atlases with a
  JSON file of frame rectangles, anchors and scale.

Re-run after changing a manifest: `python3 scripts/colony-assets.py`
(needs Python 3 with Pillow, numpy and scipy).
