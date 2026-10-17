# Mano Colony art sources

`originals/` holds the nine sheets exactly as delivered (never edited):

| file | contents |
| --- | --- |
| `mano-move.png` | Mano walking: front, right, left, back (4 frames each) |
| `mano-work.png` | axe, pickaxe, carrying a log, hammer (4 frames each) |
| `mano-extra.png` | front run, carrying a stone, carrying a stardust pouch, sit / sleep / cheer / wave |
| `buildings.png` | house, lumber mill, quarry, storage — levels 1–3 |
| `props-nature.png` | trees, rocks, crystals in three stages; sakura, bush, flowers, camp crate |
| `props-deco.png` | fences, lantern, sign, planter, bench, building plot, scaffold, lumber pile, … |
| `effects.png` | dust puff, sparkle, stars, hearts (4 frames each) |
| `ui-icons.png` | resource, building and menu icons |
| `tiles.png` | grass, sand, dirt, wood, stone and water textures |

`manifest.json` lists every object taken from them, its name and its size in the
game. `scripts/colony-assets.py` turns the originals into the game files in
`src/colony/assets/` (those are committed, so building the site needs nothing
from here):

- the sheets' near-opaque pixels (alpha ~250) become fully opaque and the faint
  coloured noise around every drawing (alpha 1–60) is removed;
- each object is cut out by its own connected pixels and the grid cell its
  centre falls in, so neighbours never bleed into each other;
- Mano frames share one scale and are anchored at the feet and the head centre
  so animations do not wobble; left-facing actions mirror the right-facing frames;
- textures drop the 1–2 px lines between cells and are blended at the edges so
  they repeat without seams;
- everything is resized for the game (2× for sharp phones) and packed into
  atlases with a JSON file of frame rectangles and anchors.

Re-run after changing the manifest: `python3 scripts/colony-assets.py`
(needs Python 3 with Pillow, numpy and scipy).
