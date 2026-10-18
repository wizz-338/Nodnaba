# MANO SURVIVOR art sources

`originals/` holds the seven sheets exactly as delivered (never edited):

| file | contents |
| --- | --- |
| `01-mano-walk.png` | Mano walking, 8 facings × 12 frames (128 px cells) |
| `02-mano-idle.png` | Mano standing, 8 facings × 6 frames |
| `03-mano-hit.png` | Mano hit, 8 facings × 4 frames |
| `04-mano-down.png` | Mano falling down, 8 facings × 8 frames |
| `05-enemies.png` | hunter, jaw, armor — move, hit, die rows |
| `06-icons-effects.png` | ball, upgrade icons, xp, coin, chest, fusion, impact and dust effects |
| `07-ground.png` | the field |

`00-READ-ME-CLAUDE.txt` is the delivered package (specs, data and UI files);
`docs/` holds its documents as separate files, `crops.json` lists where each
game image comes from.

`python3 scripts/survivor-assets.py` makes everything in
`src/survivor/assets/` from these (Mano sheets copied unchanged, the other
sheets cut exactly at the listed cells, the ground saved as a JPEG) and the
site thumbnail `src/assets/games/mano-survivor.webp`.
