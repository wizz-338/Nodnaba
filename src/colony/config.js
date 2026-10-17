// Mano Colony — every number that shapes the game lives here: map, zones,
// building costs and effects, gather times, arrivals, offline rules, saving.
// Units: tiles (1 tile = TILE world px) for positions, seconds for time.

export const TILE = 32
export const COLS = 20
export const ROWS = 34

export const RESOURCES = ['wood', 'stone', 'stardust']
export const RES_LABEL = { wood: '나무', stone: '돌', stardust: '별가루' }

// ── village start ────────────────────────────────────────────────────────────
export const START = {
  res: { wood: 24, stone: 12, stardust: 0 },
  manos: 3,
  baseCap: { wood: 80, stone: 80, stardust: 20 },
  baseHomes: 3, // the camp sleeps three before any house exists
  camp: { x: 11, y: 26 }, // stockpile crate (a drop point); its front tile is below it
}

export const MAX_MANOS = 24

// ── Mano ─────────────────────────────────────────────────────────────────────
export const MANO = {
  speed: 74, // world px / s
  arriveEvery: 20, // s until a new Mano moves in while there is room
  restMin: 3,
  restMax: 7,
}

// ── gathering ────────────────────────────────────────────────────────────────
// time = seconds of work per load, carry = items per trip (before bonuses)
export const GATHER = {
  wood: { time: 2.6, carry: 2, node: 'tree', anim: 'chop' },
  stone: { time: 3.2, carry: 2, node: 'rock', anim: 'pick' },
  stardust: { time: 4.2, carry: 1, node: 'crystal', anim: 'pick' },
}

// resource nodes: amount when full, regrowth per second (never runs out for good)
export const NODES = {
  tree: { res: 'wood', max: 30, regen: 0.22, slots: 2 },
  rock: { res: 'stone', max: 40, regen: 0.18, slots: 2 },
  crystal: { res: 'stardust', max: 12, regen: 0.05, slots: 2 },
}

// at most this share of the village gathers stardust at once (rounded up)
export const STARDUST_SHARE = 1 / 3

// ── buildings ────────────────────────────────────────────────────────────────
// levels[i] is level i+1: cost to build/upgrade to it, work = builder-seconds,
// builders = how many Manos can work on it at once.
export const BUILDINGS = {
  house: {
    name: '마노 집',
    icon: 'house',
    about: '마노가 살 집. 빈자리가 생기면 새 마노가 이사 와요.',
    levels: [
      { cost: { wood: 30, stone: 10 }, work: 12, builders: 2, homes: 2 },
      { cost: { wood: 80, stone: 50, stardust: 3 }, work: 24, builders: 3, homes: 4 },
      { cost: { wood: 150, stone: 120, stardust: 10 }, work: 40, builders: 3, homes: 6 },
    ],
  },
  lumber: {
    name: '벌목장',
    icon: 'lumber',
    about: '나무를 더 빨리, 더 많이 모아요. 나무를 여기에 내려놓을 수도 있어요.',
    gathers: 'wood',
    levels: [
      { cost: { wood: 25, stone: 15 }, work: 12, builders: 2, speed: 1.25, carry: 1 },
      { cost: { wood: 90, stone: 50, stardust: 4 }, work: 24, builders: 3, speed: 1.5, carry: 2 },
      { cost: { wood: 170, stone: 130, stardust: 12 }, work: 40, builders: 3, speed: 1.8, carry: 3 },
    ],
  },
  quarry: {
    name: '채석장',
    icon: 'quarry',
    about: '돌을 더 빨리, 더 많이 캐요. 돌을 여기에 내려놓을 수도 있어요.',
    gathers: 'stone',
    levels: [
      { cost: { wood: 35, stone: 10 }, work: 12, builders: 2, speed: 1.25, carry: 1 },
      { cost: { wood: 80, stone: 90, stardust: 4 }, work: 24, builders: 3, speed: 1.5, carry: 2 },
      { cost: { wood: 150, stone: 180, stardust: 12 }, work: 40, builders: 3, speed: 1.8, carry: 3 },
    ],
  },
  storage: {
    name: '저장소',
    icon: 'storage',
    about: '자원을 더 많이 보관해요. 모든 자원을 여기에 내려놓을 수 있어요.',
    levels: [
      { cost: { wood: 40, stone: 25 }, work: 14, builders: 2, cap: { wood: 60, stone: 60, stardust: 15 } },
      { cost: { wood: 100, stone: 80, stardust: 5 }, work: 26, builders: 3, cap: { wood: 140, stone: 140, stardust: 35 } },
      { cost: { wood: 190, stone: 170, stardust: 14 }, work: 42, builders: 3, cap: { wood: 260, stone: 260, stardust: 60 } },
    ],
  },
}
export const BUILDING_TYPES = Object.keys(BUILDINGS)

// ── map ──────────────────────────────────────────────────────────────────────
// Zones are bands of rows. A is open from the start; B (across the stream,
// over the bridge) and C (beyond B) are bought with resources.
export const ZONES = {
  A: { name: '마을 광장', rows: [20, 33], cost: null },
  B: { name: '숲 언저리', rows: [9, 19], cost: { wood: 60, stone: 40 }, needs: 'A' },
  C: { name: '별빛 언덕', rows: [0, 8], cost: { wood: 160, stone: 130, stardust: 15 }, needs: 'B' },
}
export const ZONE_IDS = Object.keys(ZONES)

// stream across row 19, crossed by the bridge at cols 9–10
export const WATER_ROW = 19
export const BRIDGE = [9, 10]

// dirt paths: [x0, y0, x1, y1] tile rectangles (inclusive), purely visual
export const PATHS = [
  [9, 1, 10, 33],
  [3, 27, 16, 27],
  [3, 16, 16, 16],
  [3, 5, 16, 5],
]

// building lots (2×2 tiles, top-left corner). Manos use the two tiles below.
export const LOTS = [
  { id: 'A1', x: 3, y: 22 },
  { id: 'A2', x: 6, y: 22 },
  { id: 'A3', x: 12, y: 22 },
  { id: 'A4', x: 15, y: 22 },
  { id: 'A5', x: 3, y: 29 },
  { id: 'A6', x: 15, y: 29 },
  { id: 'B1', x: 3, y: 12 },
  { id: 'B2', x: 6, y: 12 },
  { id: 'B3', x: 14, y: 12 },
  { id: 'C1', x: 4, y: 2 },
  { id: 'C2', x: 14, y: 2 },
]

// resource nodes (1 tile each)
export const NODE_LIST = [
  // A — trees west, rocks east, one small crystal
  { id: 'tA1', kind: 'tree', x: 1, y: 21 },
  { id: 'tA2', kind: 'tree', x: 1, y: 24 },
  { id: 'tA3', kind: 'tree', x: 0, y: 27 },
  { id: 'tA4', kind: 'tree', x: 1, y: 32 },
  { id: 'tA5', kind: 'tree', x: 6, y: 32 },
  { id: 'rA1', kind: 'rock', x: 18, y: 21 },
  { id: 'rA2', kind: 'rock', x: 18, y: 25 },
  { id: 'rA3', kind: 'rock', x: 13, y: 32 },
  { id: 'rA4', kind: 'rock', x: 18, y: 32 },
  { id: 'cA1', kind: 'crystal', x: 7, y: 29 },
  // B — the forest
  { id: 'tB1', kind: 'tree', x: 1, y: 10 },
  { id: 'tB2', kind: 'tree', x: 5, y: 9 },
  { id: 'tB3', kind: 'tree', x: 13, y: 9 },
  { id: 'tB4', kind: 'tree', x: 17, y: 10 },
  { id: 'tB5', kind: 'tree', x: 1, y: 15 },
  { id: 'tB6', kind: 'tree', x: 18, y: 15 },
  { id: 'tB7', kind: 'tree', x: 6, y: 17 },
  { id: 'rB1', kind: 'rock', x: 12, y: 14 },
  { id: 'rB2', kind: 'rock', x: 16, y: 17 },
  { id: 'cB1', kind: 'crystal', x: 7, y: 15 },
  { id: 'cB2', kind: 'crystal', x: 13, y: 18 },
  // C — the starlit hill
  { id: 'cC1', kind: 'crystal', x: 1, y: 3 },
  { id: 'cC2', kind: 'crystal', x: 8, y: 2 },
  { id: 'cC3', kind: 'crystal', x: 18, y: 4 },
  { id: 'cC4', kind: 'crystal', x: 12, y: 7 },
  { id: 'rC1', kind: 'rock', x: 2, y: 7 },
  { id: 'rC2', kind: 'rock', x: 16, y: 7 },
  { id: 'tC1', kind: 'tree', x: 6, y: 7 },
]

// decorations: [sprite, x, y, blocks walking]
export const DECOR = [
  ['board', 8, 26, true],
  ['lantern', 8, 21, true],
  ['lantern', 11, 21, true],
  ['flowers', 5, 25, false],
  ['flowers', 13, 25, false],
  ['bench', 5, 28, true],
  ['planter', 13, 28, true],
  ['sakura', 0, 33, true],
  ['sakura', 19, 29, true],
  ['bush', 19, 23, true],
  ['bush', 11, 32, true],
  ['wheelbarrow', 14, 26, true],
  ['banner', 12, 26, true],
  ['flowers', 2, 18, false],
  ['bush', 11, 11, true],
  ['sakura', 19, 12, true],
  ['lantern', 8, 9, true],
  ['signpost', 11, 9, true],
  ['flowers', 16, 13, false],
  ['bush', 0, 6, true],
  ['flowers', 14, 6, false],
  ['sakura', 19, 1, true],
]

// ── tutorial ────────────────────────────────────────────────────────────────
export const TUTORIAL = [
  '마노들이 알아서 나무·돌·별가루를 모아요. 화면을 끌어서 마을을 둘러보세요.',
  '아래 [건설]을 누르거나 빈 부지(+)를 눌러 첫 건물을 지어 보세요.',
  '마노들이 망치로 건물을 지어요. 건물을 누르면 레벨과 업그레이드를 볼 수 있어요.',
]

// ── offline progress ─────────────────────────────────────────────────────────
export const OFFLINE = {
  maxSeconds: 8 * 3600, // only up to 8 hours count
  efficiency: 0.8, // conservative: 80% of what the same Manos make online
  minNotice: 60, // show a report for absences of a minute or more
  gap: 3, // a frame gap longer than this (s) goes through the offline path
}

// ── saving ───────────────────────────────────────────────────────────────────
export const SAVE = {
  version: 2,
  prefix: 'nodnaba:colony:',
  keys: {
    save: 'nodnaba:colony:save',
    backup: 'nodnaba:colony:backup',
    corrupt: 'nodnaba:colony:corrupt',
    lock: 'nodnaba:colony:lock',
  },
  every: 10, // autosave interval, s
  lockBeat: 2, // tab-lock heartbeat, s
  lockStale: 7, // a lock older than this belongs to a closed tab, s
}
