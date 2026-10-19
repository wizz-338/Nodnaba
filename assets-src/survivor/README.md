# MANO SURVIVOR art sources

## v3 (in use)

`v3/CLAUDE_HANDOFF.txt` is the delivery note: how the art is used, and the
frame table (copied unchanged to `src/survivor/data/assets-v3.json`). The nine
sheets it describes are used exactly as delivered, from
`src/survivor/assets/v3/`:

| file | contents |
| --- | --- |
| `01_mano_run.png` | Mano running, 64 px cells, rows S SE E NE N SW W NW, 4 frames each (the left rows are mirrored copies of the right) |
| `02_mano_states.png` | idle, hit and down frames |
| `03_enemies.png` | imp, spider, slime, bone beast: 4 running frames each, facing right |
| `04_elites.png` | the thief and the boss (96 px cells): running, wind-up, charge, hit, down |
| `05_items.png` | balls, impact, coin, gem, chest, heal, weapon and two upgrade icons |
| `06_upgrades_fx.png` | eight upgrade icons, dust, trail |
| `07_ui.png` | bars, weapon slot, pause, buttons, card, joystick, avatar frame |
| `08_profile.png` | portraits (happy, wink, cry) and three small Manos (wave, sleep, roll) |
| `09_ground.png` | the field (laid mirrored, not assumed seamless) |

Frames are cut by the rects in the table, placed by their pivots; no sheet is
split evenly or trimmed. `v3/reference/` holds the preview images that came
with them (layout references only, not used in the game).

## v1 (replaced)

`originals/`, `00-READ-ME-CLAUDE.txt`, `crops.json` and `docs/` are the first
package, kept for reference. The game no longer uses its pictures; the texts
and numbers that came with it still live in `src/survivor/data/`.

## v3: frames that need fixing (checked in the game at 360 × 640)

The game uses the frames as delivered (no resizing or trimming per frame, as
the hand-off asks). These are the places where the art itself falls short:

| what | frames | problem |
| --- | --- | --- |
| Mano running SE / SW | `run_se_0..3`, `run_sw_0..3` | the figure is 39–40 px tall where every other direction is 47–50 px: Mano visibly shrinks when she turns diagonally down |
| loose pixels | `boss_run_0..3`, `boss_hit`, `boss_down`, `bone_beast_run_3` | a few detached pixels at the cell edge show next to the monster |
| the final boss | — | there is no art of its own: it wears the crowned skull beast (`boss_*`, also used by elite 2) at a larger size |
| the boss's slam | — | no slam pose: the wind-up frame is shown while the warning circle closes |
| Mano hit, other facings | `hit_*` exist only for S / SE | other facings keep their frame and flash red instead (as the hand-off says) |
