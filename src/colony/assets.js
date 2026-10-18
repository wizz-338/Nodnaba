// MANO COLONY — which processed images the game uses and how they animate.
// Frame rectangles, anchors and scale come from the generated atlas JSON
// (scripts/colony-assets.py); animations are defined here after looking at
// what each frame actually shows.

import manoPng from './assets/atlas/mano.png'
import manoJson from './assets/atlas/mano.json'
import buildingsPng from './assets/atlas/buildings.png'
import buildingsJson from './assets/atlas/buildings.json'
import naturePng from './assets/atlas/nature.png'
import natureJson from './assets/atlas/nature.json'
import streetPng from './assets/atlas/street.png'
import streetJson from './assets/atlas/street.json'
import gardenPng from './assets/atlas/garden.png'
import gardenJson from './assets/atlas/garden.json'
import waterPng from './assets/atlas/water.png'
import waterJson from './assets/atlas/water.json'
import effectsPng from './assets/atlas/effects.png'
import effectsJson from './assets/atlas/effects.json'
import tilesPng from './assets/atlas/tiles.png'
import tilesJson from './assets/atlas/tiles.json'
import iWood from './assets/ui/wood.png'
import iStone from './assets/ui/stone.png'
import iStardust from './assets/ui/stardust.png'
import iMano from './assets/ui/mano.png'
import iBuild from './assets/ui/build.png'
import iUpgrade from './assets/ui/upgrade.png'
import iMove from './assets/ui/move.png'
import iDemolish from './assets/ui/demolish.png'
import iFlowers from './assets/ui/cat_flowers.png'
import iFloor from './assets/ui/cat_floor.png'
import iFence from './assets/ui/cat_fence.png'
import iTree from './assets/ui/cat_tree.png'
import iStorage from './assets/ui/storage.png'
import iSettings from './assets/ui/settings.png'
import iSave from './assets/ui/save.png'
import iClock from './assets/ui/clock.png'

export const ICONS = {
  wood: iWood,
  stone: iStone,
  stardust: iStardust,
  mano: iMano,
  build: iBuild,
  upgrade: iUpgrade,
  move: iMove,
  demolish: iDemolish,
  cat_flowers: iFlowers,
  cat_floor: iFloor,
  cat_fence: iFence,
  cat_tree: iTree,
  storage: iStorage,
  settings: iSettings,
  save: iSave,
  clock: iClock,
}

// atlas name → [image url, frame table] (also used for catalog thumbnails)
export const ATLASES = {
  mano: [manoPng, manoJson.frames],
  buildings: [buildingsPng, buildingsJson.frames],
  nature: [naturePng, natureJson.frames],
  street: [streetPng, streetJson.frames],
  garden: [gardenPng, gardenJson.frames],
  water: [waterPng, waterJson.frames],
  effects: [effectsPng, effectsJson.frames],
  tiles: [tilesPng, tilesJson.frames],
}

const four = (n) => [0, 1, 2, 3].map((i) => `${n}_${i}`)

// Walking: four diagonal directions (se/sw from the movement sheet, ne/nw
// from the back-view sheet). Work: wind-up, hold, a quick hit, follow
// through. Side-facing art faces right; left is mirrored.
export const ANIMS = {
  walk_se: { frames: four('walk_se'), fps: 8 },
  walk_sw: { frames: four('walk_sw'), fps: 8 },
  walk_ne: { frames: four('walk_ne'), fps: 8 },
  walk_nw: { frames: four('walk_nw'), fps: 8 },
  carry_wood: { frames: four('carry_wood'), fps: 8 },
  carry_stone: { frames: four('carry_stone'), fps: 8 },
  carry_stardust: { frames: four('carry_stardust'), fps: 8 },
  chop: { frames: four('chop'), durs: [0.22, 0.16, 0.1, 0.26], hit: 2 },
  pick: { frames: four('pick'), durs: [0.22, 0.16, 0.1, 0.26], hit: 2 },
  hammer: { frames: four('hammer'), durs: [0.18, 0.14, 0.09, 0.22], hit: 2 },
  gather_star: { frames: four('gather_star'), durs: [0.3, 0.25, 0.3, 0.35], hit: 2 },
  stand: { frames: ['stand'], fps: 1 },
  sit: { frames: ['sit'], fps: 1 },
  sleep: { frames: ['sleep'], fps: 1 },
  happy: { frames: ['sit_happy', 'stand'], fps: 3 },
}

export const EFFECTS = {
  poof: { frames: four('poof'), fps: 10 },
  dust: { frames: four('dust'), fps: 9 },
  sparkle: { frames: four('sparkle'), fps: 9 },
  hearts: { frames: four('hearts'), fps: 6 },
}

const image = (src) =>
  new Promise((ok, fail) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => ok(img)
    img.onerror = () => fail(new Error('이미지를 불러오지 못했어요: ' + src))
    img.src = src
  })

let loading = null
export function loadAssets() {
  loading ??= (async () => {
    const out = {}
    await Promise.all(
      Object.entries(ATLASES).map(async ([k, [src, frames]]) => {
        out[k] = { img: await image(src), frames }
      })
    )
    return out
  })().catch((e) => {
    loading = null
    throw e
  })
  return loading
}
