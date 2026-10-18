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
import playPng from './assets/atlas/play.png'
import playJson from './assets/atlas/play.json'
import duoPng from './assets/atlas/duo.png'
import duoJson from './assets/atlas/duo.json'
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
  play: [playPng, playJson.frames],
  duo: [duoPng, duoJson.frames],
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

// Play and rest actions (originals-play/, one row of four frames each; pair
// actions draw two Manos and come from the 'duo' atlas). Durations per frame
// in seconds: lively moves are quick, dozing and stretching slow; actions with
// an ending (a high five, sitting down after a push) hold the last pose.
// The frames play once, then repeat from `from` (lean: dozing off happens
// once, then the dozing frames repeat). No frames are made up in between.
const act = (name, durs, from = 0, atlas = 'play') => ({ frames: four(name), durs, from, atlas })
const pair = (name, durs, from = 0) => act(name, durs, from, 'duo')
export const PLAY_ANIMS = {
  roll_wiggle: act('roll_wiggle', [0.22, 0.2, 0.22, 0.2]),
  roll_side: act('roll_side', [0.4, 0.3, 0.4, 0.3]),
  roll_flop: act('roll_flop', [0.6, 0.25, 0.7, 0.5]),
  roll_belly: act('roll_belly', [0.45, 0.3, 0.45, 0.3]),
  dance: act('dance', [0.18, 0.18, 0.18, 0.26]),
  hop: act('hop', [0.22, 0.16, 0.16, 0.24]),
  tail_chase: act('tail_chase', [0.2, 0.2, 0.2, 0.35]),
  butterfly: act('butterfly', [0.5, 0.45, 0.55, 0.7]),
  tap: pair('tap', [0.35, 0.25, 0.3, 0.45]),
  push: pair('push', [0.35, 0.35, 0.5, 1.1]),
  peekaboo: pair('peekaboo', [0.7, 0.35, 0.5, 0.6]),
  highfive: pair('highfive', [0.4, 0.22, 0.35, 1.0]),
  ball: pair('ball', [0.5, 0.5, 0.5, 0.5]),
  handdance: pair('handdance', [0.24, 0.24, 0.24, 0.32]),
  yawn: act('yawn', [0.9, 1.0, 1.0, 1.2]),
  nap: act('nap', [1.3, 1.3, 1.3, 1.3]),
  cookie: act('cookie', [0.6, 0.5, 0.6, 0.8]),
  bubbles: act('bubbles', [0.6, 0.6, 0.7, 0.9]),
  lean: pair('lean', [1.0, 1.3, 1.3, 1.4], 1),
  pat: pair('pat', [0.6, 0.45, 0.5, 0.7]),
  share: pair('share', [0.6, 0.5, 0.6, 0.8]),
  smell: act('smell', [0.8, 1.0, 0.8, 0.9]),
  petals: act('petals', [0.5, 0.35, 0.45, 0.8]),
  stones: act('stones', [0.7, 0.7, 0.8, 1.0]),
  swing: act('swing', [0.25, 0.25, 0.25, 0.25]),
}
// the breathing of a sleeper: a pixel up and down, nothing more
export const SLEEPY = new Set(['nap', 'lean'])

// frame index of a play animation `t` seconds in
export function playFrame(a, t) {
  const total = a.durs.reduce((x, y) => x + y, 0)
  let k = t
  if (k >= total) {
    const loop = a.durs.slice(a.from).reduce((x, y) => x + y, 0)
    k = a.durs.slice(0, a.from).reduce((x, y) => x + y, 0) + ((k - total) % loop)
  }
  for (let i = 0; i < a.durs.length; i++) {
    if (k < a.durs[i]) return i
    k -= a.durs[i]
  }
  return a.durs.length - 1
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
