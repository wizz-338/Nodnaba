// Mano Colony — which processed images the game uses and how they animate.
// Frame rectangles and anchors come from the generated *.json next to each
// atlas (scripts/colony-assets.py); animations are defined here by hand
// after looking at what each frame actually shows.

import manoPng from './assets/sprites/mano.png'
import manoJson from './assets/sprites/mano.json'
import buildingsPng from './assets/buildings/buildings.png'
import buildingsJson from './assets/buildings/buildings.json'
import propsPng from './assets/props/props.png'
import propsJson from './assets/props/props.json'
import effectsPng from './assets/effects/effects.png'
import effectsJson from './assets/effects/effects.json'
import grass from './assets/tiles/grass.png'
import grassLight from './assets/tiles/grass_light.png'
import dirt from './assets/tiles/dirt.png'
import sand from './assets/tiles/sand.png'
import water from './assets/tiles/water.png'
import iconWood from './assets/ui/wood.png'
import iconStone from './assets/ui/stone.png'
import iconStardust from './assets/ui/stardust.png'
import iconMano from './assets/ui/mano.png'
import iconHouse from './assets/ui/house.png'
import iconLumber from './assets/ui/lumber.png'
import iconQuarry from './assets/ui/quarry.png'
import iconStorage from './assets/ui/storage.png'
import iconHammer from './assets/ui/hammer.png'
import iconUpgrade from './assets/ui/upgrade.png'
import iconSettings from './assets/ui/settings.png'
import iconMap from './assets/ui/map.png'
import iconSave from './assets/ui/save.png'
import iconClock from './assets/ui/clock.png'
import iconLock from './assets/ui/lock.png'

export const ICONS = {
  wood: iconWood,
  stone: iconStone,
  stardust: iconStardust,
  mano: iconMano,
  house: iconHouse,
  lumber: iconLumber,
  quarry: iconQuarry,
  storage: iconStorage,
  hammer: iconHammer,
  upgrade: iconUpgrade,
  settings: iconSettings,
  map: iconMap,
  save: iconSave,
  clock: iconClock,
  lock: iconLock,
}

// Animations. `fps` for even timing, `durs` (s per frame) where the pose
// needs it: a swing holds the wind-up, snaps through the hit, then recovers.
// Side-facing animations face right; left is the same frames mirrored.
export const ANIMS = {
  idle: { frames: ['front_0', 'front_0', 'front_2', 'front_0', 'front_1'], fps: 2.4 },
  walk_r: { frames: ['walk_r_0', 'walk_r_1', 'walk_r_2', 'walk_r_3'], fps: 9 },
  walk_d: { frames: ['walk_d_0', 'walk_d_1', 'walk_d_2', 'walk_d_3'], fps: 8 },
  walk_u: { frames: ['walk_u_0', 'walk_u_1', 'walk_u_2', 'walk_u_3'], fps: 8 },
  carry_wood: { frames: ['carry_wood_0', 'carry_wood_1', 'carry_wood_2', 'carry_wood_3'], fps: 8 },
  carry_stone: { frames: ['carry_stone_0', 'carry_stone_1', 'carry_stone_2', 'carry_stone_3'], fps: 8 },
  carry_stardust: { frames: ['carry_stardust_0', 'carry_stardust_1', 'carry_stardust_2', 'carry_stardust_3'], fps: 8 },
  chop: { frames: ['chop_0', 'chop_1', 'chop_2', 'chop_3'], durs: [0.2, 0.16, 0.1, 0.26], hit: 2 },
  pick: { frames: ['pick_0', 'pick_1', 'pick_2', 'pick_3'], durs: [0.2, 0.16, 0.1, 0.26], hit: 2 },
  hammer: { frames: ['hammer_0', 'hammer_1', 'hammer_2', 'hammer_3'], durs: [0.16, 0.14, 0.09, 0.2], hit: 2 },
  sit: { frames: ['sit'], fps: 1 },
  sleep: { frames: ['sleep'], fps: 1 },
  cheer: { frames: ['cheer', 'front_2'], fps: 4 },
  wave: { frames: ['wave', 'front_0'], fps: 2.5 },
}

// one-shot effects (frame names in the effects atlas)
export const EFFECTS = {
  poof: { frames: ['poof_0', 'poof_1', 'poof_2', 'poof_3'], fps: 10 },
  sparkle: { frames: ['sparkle_0', 'sparkle_1', 'sparkle_2', 'sparkle_3'], fps: 9 },
  stars: { frames: ['stars_0', 'stars_1', 'stars_2', 'stars_3'], fps: 7 },
  hearts: { frames: ['hearts_0', 'hearts_1', 'hearts_2', 'hearts_3'], fps: 6 },
}

const SHEETS = {
  mano: [manoPng, manoJson],
  buildings: [buildingsPng, buildingsJson],
  props: [propsPng, propsJson],
  effects: [effectsPng, effectsJson],
}
const TEXTURES = { grass, grassLight, dirt, sand, water, lock: iconLock }

const image = (src) =>
  new Promise((ok, fail) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => ok(img)
    img.onerror = () => fail(new Error('이미지를 불러오지 못했어요: ' + src))
    img.src = src
  })

let loading = null
// load every image once (shared across remounts)
export function loadAssets() {
  loading ??= (async () => {
    const sheets = {}
    const textures = {}
    await Promise.all([
      ...Object.entries(SHEETS).map(async ([k, [src, meta]]) => {
        sheets[k] = { img: await image(src), frames: meta.frames, scale: meta.scale }
      }),
      ...Object.entries(TEXTURES).map(async ([k, src]) => {
        textures[k] = await image(src)
      }),
    ])
    return { sheets, textures }
  })().catch((e) => {
    loading = null
    throw e
  })
  return loading
}
