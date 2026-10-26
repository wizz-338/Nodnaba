# MANO SURVIVOR — one game, two platforms

| | 모바일 (phone) | PC |
|---|---|---|
| address | `#/game/mano-survivor` | `#/game/mano-survivor-pc` |
| GAME menu | MANO SURVIVOR (DEMO) · 모바일 전용 9:16 | MANO SURVIVOR (DEMO) · PC 전용 16:9 |
| screen | 9:16, logical 360 × 640 | 16:9, logical 1152 × 648 (any window size: 1920 × 1080, 2560 × 1440 …) |
| field | the screen | larger than the screen (1620 × 810); the camera follows Mano |
| moving Mano | touch stick | WASD / arrow keys (mixed, diagonals normalized) |
| menus | touch | mouse (keyboard: Enter / Space in cutscenes, Esc pauses, Esc again resumes; 전체 화면 is in 설정) |

Both are the same page (`SurvivorPage.jsx`) with a different `platform`
(`'mobile'` / `'pc'`), chosen in `App.jsx` from the address.

## The patch rule

**"마노 서바이벌 패치" with no platform named means BOTH versions.** A change
to the game (balance, monsters, cards, rewards, story, cutscenes, saves,
sounds, bugs) is made once in the shared code below and reaches both. Only a
request that names one platform ("모바일만", "PC만") changes that one, and then
only in its platform-specific part.

## What is shared (change once, both get it)

- `zyo.js` — zyo_'s class change (chapter 15's reward, from chapter 16):
  the recipes, her card beside the three drawn, the class cards, the giant
  balls and the ninja cats that replace the ball and the fighting cats, the
  four specials (shield, revive, lifesteal, warp holes) and the 전투력 card.
  Drawn by `render-zyo.js` (the notes of the change, the units, the holes);
  its sounds are made in `audio.js` (no file). Numbers: `balance.json →
  zyo`; names and words: `zyo.json`. The warp holes sit at shares of the
  field, so on the PC they are far apart off screen and on the phone both
  are on it.
- `turret.js` — the turret (chapter 20's reward, from chapter 21): at a
  level-up two picks of this run's upgrades are taken back exactly and one
  turret stands at a random spot of the field (the extra special boss's
  fight area while it lasts), shooting the nearest monster. The craft screen
  is in `SurvivorPage.jsx` (`TurretCraft`; on the PC its list has two
  columns), the drawing in `render.js` (its eight ways from `turret.webp`,
  made by `scripts/survivor-turret-assets.py`). Numbers: `balance.json → turret`;
  words: `turret.json`. Turrets stand in the field, not on the screen, so on
  the PC some are off screen.
- `friends.js` — 친구냥이, the fighting cats (cards, AI, damage), and the
  rerolls (`reroll` in game.js): the same on both. Their leash
  (`friendCats.leash`) is in field px, so on the PC (a wider view) they
  leave far monsters to the ball as on the phone.
- `game.js`, `weapons.js`, `bosses.js` — the fight: spawns, monsters, bosses
  (the extra special bosses after the boss in chapters 3, 5, 8, 10 …:
  `bosses.js`, drawn by `render-extra.js`), cards, blessings, rewards of a
  run. On the PC the camera holds still for the extra boss's fight, so its
  attacks over the whole area are all on screen. The field comes in as `opts.arena`; nothing else in the fight knows
  the platform.
- `room.js`, `room-items.js` — 마노의 방, the 마노 강화 tab's room: one of
  six pictures of it (growth stages, `data/room.json → stages`), chosen by
  the coin stats' levels added up, with Mano and the cats living in it
  (their fight sprites and a still pose each: `assets/room/`, made by
  `scripts/survivor-room-assets.py`). Made again from the save's levels
  every time, never stored, no number of the game in it. The same room on
  both; on the phone it is above the stats, on the PC beside them
  (`.ms-stats-room` in `survivor.css`). Mano's skin was made a little
  lighter in her own sheets (`scripts/survivor-mano-skin.py`), so the fight
  and the room show the same Mano.
- `tester.js` — the special-boss tester, at `#/game/mano-survivor-test`
  (phone) and `#/game/mano-survivor-pc-test` (PC), in no menu: pick a
  special boss, a class change (two of the ball, two of the cats) and its
  level, how long the boss lasts; the fight starts at the chapter's boss,
  which falls at once. Its save is in memory only (`testerStorage`): the
  real save is never read or written. Its lobby and bar are in
  `SurvivorPage.jsx` (`TesterLobby`, `TesterBar`).
- `perma.js` — the coin stats' numbers and prices (the shop and the run):
  치명타 확률 goes to 100% (`balance.json → perma.stats.crit.past`), and at
  100% the run draws no 치명타 확률 card (`run.critFull`).
- `progress.js` — the save. **One save for both** (`localStorage`, key
  `nodnaba:survivor:save`): on the same browser the phone and PC versions
  share progress, coins, coin stats, weapons, records and cutscene flags.
  One-time rewards are spend-once in the save, so playing on the other
  version never gives them again. No server sync.
- `data/*.json` — every number and every text: `balance.json`, `stages`,
  `upgrades`, `weapons`, `story.json` (regions, monsters, cutscenes, rewards),
  `motion.json` (the monsters' animation frames, made by
  `scripts/survivor-motion-assets.py`), `extra-motion.json` (the extra
  special bosses', made by `scripts/survivor-extra-boss-assets.py`),
  `ep01-assets.json` (chapter 5's clear package MANO_EP01: its five 16:9
  cutscenes, rewards, cat card icons, scratches and the friend cat's atlas,
  made by `scripts/survivor-ep01-assets.py`), `ep02-assets.json` (chapter
  10's clear cutscenes, MANO_CH10_CUTSCENES: `scripts/survivor-ep02-assets.py`),
  `ep03-assets.json` (chapter 15's, MANO_CH15_CUTSCENES, with zyo_'s reward
  picture and face: `scripts/survivor-ep03-assets.py`), `ep04-assets.json`
  (chapter 20's, MANO_CH20_CUTSCENES, with the turret's reward picture:
  `scripts/survivor-ep04-assets.py`).
- `render.js` — the drawing; it takes the platform's logical screen and
  which background to draw.
- `audio.js`, `sprites.js`, `story-art.js`, the pictures in `assets/`.
- `SurvivorPage.jsx` — every screen (lobby, battle, level-up, gear, fusion,
  stats, settings, cutscenes, rewards, result). The PC layout is CSS over the
  same elements.

## What is platform-specific (change only for that platform)

- `platform.js` — `PLATFORMS.mobile` / `PLATFORMS.pc`: logical screen, field
  (`balance.logicalArena` / `balance.logicalArenaPc`; on the PC Mano runs
  `speedMul` ×1.2 as fast over its wider field), HUD boxes
  (`ui.json → hud` / `ui.json → pc.hud`), input (`touch` / `keys`), which
  background and lobby backdrop each region uses.
- `keys.js` — the PC keys and their direction (pure, tested).
- `survivor.css` — the phone layout is the stylesheet as it is; the PC layout
  is the `.ms--pc` section at its end (16:9 frame, menus laid out at
  1280 × 720 and scaled with `zoom: var(--z)`, cards side by side, cutscene
  picture with the words beside it; a 16:9 cutscene — chapter 5's clear —
  fills the screen with the words over its foot: `.ms-cut--wide`; a cut
  marked `layout: 'split'` keeps the words below the picture instead:
  `.ms-cut--split`). On the
  phone a 16:9 cutscene is shown whole, never stretched or cut, with dark
  bands above and below.
- `survivor-theme.css` — the look of both (loaded after `survivor.css`, which
  keeps the layout): clean and light — a warm off-white page, white cards
  with soft shadows and a thin dark outline, flat buttons in one accent (Mano's red),
  tabs as a segmented control, level-up cards all alike (only Tizzzz's,
  zyo_'s and a class card have their own colour), the battle bar's colours and the low-health red edge. A look
  change goes here, for both platforms at once.
- Backgrounds: phone `bg_<region>` (portrait), PC `bg_<region>_wide`, which
  covers the whole PC field (`assets/s84/backgrounds/`, made by
  `scripts/survivor-story-assets.py`).
  The wide ones are stand-ins (the portrait ground mirrored out to the
  sides) until real 16:9 art exists; a new picture replaces the file under
  the same name and nothing else changes.

## The PC field and fairness

The PC screen shows much more of the world than the phone's (1152 × 648
logical against 360 × 640), so everything looks smaller on a large monitor,
and its field (1620 × 810) is larger still: the camera follows Mano over it
(`follow` in game.js; `run.view` is the part on screen). Monsters come in
on screen and then live in the field, not the view (`monsterBox` in
game.js): the ones Mano walks away from stay where they are, out of sight,
and come after her at their own pace (an elite or a boss off screen gets an
arrow at the edge). The attacks keep to the field too, not the screen: the
balls fly on past the screen's edge and bounce off the field's (or off the
extra special boss's fight area during it), and the friend cats and a
class's units go after monsters anywhere on the field within their leash of
Mano (a class's skill still strikes what is on screen). Mano walks the whole
field. On the phone the view is
the field and never moves, so nothing there changed.

Because the PC view is about 3.4× the phone field's area, the PC field has a
`spawnBox` (600 × 304, the phone field's area): monsters come in on that box
around Mano (inside the view), as near as on the phone. `spawnMul` can bring
them faster if PC proves easier. `scripts/survivor-platform-parity.mjs` plays
the same bots and loadouts on both and prints clear rates and times;
`npm run test:survivor` checks the PC view, camera, spawns and keys.

## PC only, besides the layout

- The thief comes from any side of Mano, a little past the view's edge, and
  may roam out of sight but never out of the field (`aroundPoint` in
  game.js); an arrow at the play area's edge points at an elite out of
  sight (`drawArrows` in render.js). The phone keeps its entry at the top;
  the mid-boss and the boss keep theirs on both (moving them changed how
  hard the PC chapters were).
- The lobby has a fixed height (1280 × 720, zoomed): its notices are a layer
  over the content (`.ms--pc .ms-notices`), never a row of it, and the 출발
  tab's episode fan takes only the height the panel and chapter strip leave
  (a notice as a row once pushed the strip off the page).

## Checklist for a patch

1. Change the shared code / data once.
2. A new screen or element: check it in both layouts (phone 9:16 and the
   `.ms--pc` rules; a new menu element may need a PC rule).
3. A new background or full-screen picture: the phone one, and a 16:9 one for
   PC (or a stand-in from the script).
4. `npm run test:survivor`, `npm run build`; open both addresses.
5. A balance change to the ball or the cats: `node scripts/survivor-cats-dps.mjs
   runs` (and `FIELD=pc …`) compares the ball, cat and unlucky builds on
   each field; `… bench` measures DPS per card picked.
