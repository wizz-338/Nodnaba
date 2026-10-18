// MANO COLONY — every number that shapes the game lives here: the map and its
// zones, building costs and effects, decorations, gathering, crews, offline
// rules and saving.
//
// Map units are logical tiles (x, y). The screen shows them as 2:1 diamonds:
// TW × TH world px per tile (see world.js for the conversion).

export const MAP = 96
export const TW = 64
export const TH = 32
export const DEFAULT_SEED = 20261018 // terrain, rivers and groves are rebuilt from this

export const RESOURCES = ['wood', 'stone', 'stardust']
export const RES_LABEL = { wood: '나무', stone: '돌', stardust: '별가루' }

// ── village start ────────────────────────────────────────────────────────────
export const START = {
  res: { wood: 40, stone: 20, stardust: 0 },
  manos: 3,
  baseCap: { wood: 100, stone: 100, stardust: 25 },
  baseHomes: 3, // the camp sleeps three before any house exists
  camp: { x: 47, y: 47 }, // 2×2 stockpile crate: everyone can drop off here
}
export const CAMP_SIZE = [2, 2]
export const MAX_MANOS = 200

// ── Mano ─────────────────────────────────────────────────────────────────────
export const MANO = {
  speed: 2.3, // tiles / s
  arriveEvery: 25, // s until a new Mano moves in while there is a free home
  workRate: 1, // construction work per second per Mano on site
  restMin: 3,
  restMax: 7,
  breakChance: 0.08, // after a delivery, sometimes a short sit on a bench
}

// ── gathering ────────────────────────────────────────────────────────────────
export const GATHER = {
  wood: { time: 2.6, carry: 2, node: 'tree', anim: 'chop' },
  stone: { time: 3.2, carry: 2, node: 'rock', anim: 'pick' },
  stardust: { time: 4.2, carry: 1, node: 'crystal', anim: 'gather_star' },
}
export const NODES = {
  tree: { res: 'wood', max: 30, regen: 0.22, slots: 2 },
  rock: { res: 'stone', max: 40, regen: 0.18, slots: 2 },
  crystal: { res: 'stardust', max: 12, regen: 0.05, slots: 2 },
}
export const STARDUST_SHARE = 1 / 3

// ── buildings (3×3 tiles) ────────────────────────────────────────────────────
// work = construction work (1 Mano on site does 1 per second, 3 do 3 per
// second); slots = most Manos that can work on it at once.
export const BUILDINGS = {
  house: {
    name: '마노 집',
    icon: 'mano',
    about: '마노가 사는 집. 빈자리가 생기면 새 마노가 이사 와요.',
    size: [3, 3],
    levels: [
      { cost: { wood: 30, stone: 10 }, work: 30, slots: 3, homes: 2 },
      { cost: { wood: 80, stone: 50, stardust: 3 }, work: 60, slots: 4, homes: 4 },
      { cost: { wood: 150, stone: 120, stardust: 10 }, work: 100, slots: 5, homes: 6 },
    ],
  },
  lumber: {
    name: '벌목장',
    icon: 'wood',
    about: '나무를 더 빨리, 더 많이 모아요. 나무를 여기에 내려놓을 수도 있어요.',
    size: [3, 3],
    gathers: 'wood',
    levels: [
      { cost: { wood: 25, stone: 15 }, work: 30, slots: 3, speed: 1.25, carry: 1 },
      { cost: { wood: 90, stone: 50, stardust: 4 }, work: 60, slots: 4, speed: 1.5, carry: 2 },
      { cost: { wood: 170, stone: 130, stardust: 12 }, work: 100, slots: 5, speed: 1.8, carry: 3 },
    ],
  },
  quarry: {
    name: '채석장',
    icon: 'stone',
    about: '돌을 더 빨리, 더 많이 캐요. 돌을 여기에 내려놓을 수도 있어요.',
    size: [3, 3],
    gathers: 'stone',
    levels: [
      { cost: { wood: 35, stone: 10 }, work: 30, slots: 3, speed: 1.25, carry: 1 },
      { cost: { wood: 80, stone: 90, stardust: 4 }, work: 60, slots: 4, speed: 1.5, carry: 2 },
      { cost: { wood: 150, stone: 180, stardust: 12 }, work: 100, slots: 5, speed: 1.8, carry: 3 },
    ],
  },
  storage: {
    name: '저장소',
    icon: 'storage',
    about: '자원을 더 많이 보관해요. 모든 자원을 여기에 내려놓을 수 있어요.',
    size: [3, 3],
    levels: [
      { cost: { wood: 40, stone: 25 }, work: 34, slots: 3, cap: { wood: 80, stone: 80, stardust: 20 } },
      { cost: { wood: 100, stone: 80, stardust: 5 }, work: 64, slots: 4, cap: { wood: 180, stone: 180, stardust: 45 } },
      { cost: { wood: 190, stone: 170, stardust: 14 }, work: 104, slots: 5, cap: { wood: 320, stone: 320, stardust: 80 } },
    ],
  },
}
export const BUILDING_TYPES = Object.keys(BUILDINGS)
export const DEMOLISH_REFUND = 0.5 // finished buildings give back half of what was spent

// ── floors (one tile each, painted in lines) ─────────────────────────────────
// Removing a floor gives back exactly what that tile cost when it was laid.
export const FLOORS = {
  soil: { name: '흙길', tex: 'soil', cost: {} },
  cobble: { name: '돌길', tex: 'cobble', cost: { stone: 1 } },
  brick: { name: '벽돌길', tex: 'brick', cost: { stone: 2 } },
  planks: { name: '나무 바닥', tex: 'planks', cost: { wood: 1 } },
  sand: { name: '모래 마당', tex: 'sand_0', cost: {} },
}
export const FLOOR_TYPES = Object.keys(FLOORS)
export const PATH_COST = 0.72 // walking on a floor feels this much shorter, so Manos like paths

// ── decorations ──────────────────────────────────────────────────────────────
// size: footprint in tiles. blocks: Manos cannot walk through it.
// flat: lies on the ground (drawn under everything that stands).
// dirs: drawings for each facing (only where the art has them; `flip` mirrors).
// seats: where a resting Mano sits (tile offsets inside the footprint).
// line: placed by drawing a line (fences); gate: lets Manos through.
// water: must be placed on water (bridges, boats).
export const DECOR = {
  fence: { name: '나무 울타리', cat: 'fence', cost: { wood: 1 }, line: true, blocks: true, icon: ['street', 'fence_post'] },
  gate: { name: '울타리 문', cat: 'fence', cost: { wood: 3 }, gate: true, blocks: false, icon: ['street', 'gate'] },
  hedge: {
    name: '꽃 울타리', cat: 'fence', cost: { wood: 2 }, blocks: true,
    dirs: [{ atlas: 'street', sprite: 'hedge_a' }, { atlas: 'street', sprite: 'hedge_a', flip: true }],
  },
  hedge_b: {
    name: '꽃 울타리 (길게)', cat: 'fence', cost: { wood: 2 }, blocks: true,
    dirs: [{ atlas: 'street', sprite: 'hedge_b' }, { atlas: 'street', sprite: 'hedge_b', flip: true }],
  },
  lamp_post: { name: '가로등', cat: 'light', atlas: 'street', sprite: 'lamp_post', cost: { wood: 2, stone: 1 }, blocks: true },
  lamp_small: { name: '작은 등불', cat: 'light', atlas: 'street', sprite: 'lamp_small', cost: { stone: 2 }, blocks: true },
  bench: {
    name: '벤치', cat: 'light', cost: { wood: 3 }, blocks: true, seats: [[0.5, 0.5]],
    dirs: [{ atlas: 'street', sprite: 'bench_ne' }, { atlas: 'street', sprite: 'bench_nw' }],
  },
  picnic_table: { name: '피크닉 테이블', cat: 'light', atlas: 'garden', sprite: 'picnic_table', cost: { wood: 5 }, blocks: true, seats: [[0.5, 0.5]] },
  signpost: { name: '표지판', cat: 'light', atlas: 'street', sprite: 'signpost', cost: { wood: 2 }, blocks: true },
  board: { name: '게시판', cat: 'light', atlas: 'street', sprite: 'board', cost: { wood: 4 }, blocks: true },
  banner: { name: '고양이 깃발', cat: 'light', atlas: 'street', sprite: 'banner', cost: { wood: 3 }, blocks: true },
  sakura: { name: '벚나무', cat: 'nature', atlas: 'nature', sprite: 'sakura', cost: { wood: 4, stardust: 1 }, blocks: true },
  sapling: { name: '어린 나무', cat: 'nature', atlas: 'nature', sprite: 'sapling', cost: { wood: 2 }, blocks: true },
  bush: { name: '덤불', cat: 'nature', atlas: 'nature', sprite: 'bush', cost: { wood: 1 }, blocks: true },
  bush_flower: { name: '꽃 덤불', cat: 'nature', atlas: 'nature', sprite: 'bush_flower', cost: { wood: 2 }, blocks: true },
  flower_rock: { name: '꽃바위', cat: 'nature', atlas: 'garden', sprite: 'flower_rock', cost: { stone: 2 }, blocks: true },
  lavender: { name: '라벤더 화단', cat: 'nature', atlas: 'garden', sprite: 'lavender', cost: { wood: 2 }, blocks: true },
  grass_tufts: { name: '풀숲', cat: 'nature', atlas: 'garden', sprite: 'grass_tufts', cost: {}, flat: true, blocks: false },
  petals: { name: '꽃잎', cat: 'nature', atlas: 'garden', sprite: 'petals', cost: {}, flat: true, blocks: false },
  cattails: { name: '부들', cat: 'nature', atlas: 'water', sprite: 'cattails', cost: { wood: 1 }, blocks: true },
  rocks_deco: { name: '돌무더기', cat: 'nature', atlas: 'water', sprite: 'rocks_deco', cost: { stone: 3 }, blocks: true },
  planter: {
    name: '나무 화분', cat: 'garden', cost: { wood: 3 }, blocks: true,
    dirs: [{ atlas: 'garden', sprite: 'planter_a' }, { atlas: 'garden', sprite: 'planter_b' }],
  },
  flowerbed: { name: '둥근 화단', cat: 'garden', atlas: 'garden', sprite: 'flowerbed_round', size: [2, 2], cost: { stone: 4 }, blocks: true },
  fountain: { name: '고양이 분수', cat: 'garden', atlas: 'garden', sprite: 'fountain', size: [2, 2], cost: { stone: 12, stardust: 2 }, blocks: true },
  cat_statue: { name: '고양이 동상', cat: 'garden', atlas: 'garden', sprite: 'cat_statue', size: [2, 2], cost: { stone: 10, stardust: 3 }, blocks: true },
  flower_arch: { name: '꽃 아치', cat: 'garden', atlas: 'garden', sprite: 'flower_arch', cost: { wood: 4 }, blocks: false },
  pergola: { name: '정자', cat: 'garden', atlas: 'garden', sprite: 'pergola', size: [2, 2], cost: { wood: 12 }, blocks: true, seats: [[0.6, 1], [1.4, 1]] },
  picnic_blanket: { name: '피크닉 돗자리', cat: 'garden', atlas: 'garden', sprite: 'picnic_blanket', size: [2, 2], cost: { wood: 2 }, flat: true, blocks: false, seats: [[0.7, 1], [1.3, 1]] },
  flower_cart: { name: '꽃수레', cat: 'garden', atlas: 'garden', sprite: 'flower_cart', cost: { wood: 4 }, blocks: true },
  well: { name: '우물', cat: 'garden', atlas: 'garden', sprite: 'well', cost: { stone: 6, wood: 2 }, blocks: true },
  stepping_stones: { name: '디딤돌', cat: 'garden', atlas: 'garden', sprite: 'stepping_stones', cost: { stone: 1 }, flat: true, blocks: false },
  barrel_crate: { name: '통과 상자', cat: 'garden', atlas: 'street', sprite: 'barrel_crate', cost: { wood: 2 }, blocks: true },
  log_rack: { name: '장작 더미', cat: 'garden', atlas: 'water', sprite: 'log_rack', cost: { wood: 4 }, blocks: true },
  wheelbarrow: { name: '외바퀴 수레', cat: 'garden', atlas: 'water', sprite: 'wheelbarrow', cost: { wood: 2 }, blocks: true },
  stone_cart: { name: '돌 수레', cat: 'garden', atlas: 'water', sprite: 'stone_cart', cost: { wood: 3, stone: 3 }, blocks: true },
  berry_patch: { name: '산딸기 밭', cat: 'garden', atlas: 'water', sprite: 'berry_patch', cost: { wood: 2 }, blocks: true },
  bridge: {
    name: '나무 다리', cat: 'garden', cost: { wood: 6 }, size: [2, 2], water: true, bridge: true, blocks: false,
    dirs: [{ atlas: 'water', sprite: 'bridge' }, { atlas: 'water', sprite: 'bridge', flip: true }],
  },
  boat: { name: '나룻배', cat: 'garden', atlas: 'water', sprite: 'boat', cost: { wood: 5 }, water: true, waterOnly: true, blocks: true },
  lily_pond: { name: '연꽃', cat: 'garden', atlas: 'water', sprite: 'lily_pond', cost: {}, water: true, waterOnly: true, flat: true, blocks: true },
}
export const DECOR_TYPES = Object.keys(DECOR)

export const CATEGORIES = [
  { id: 'build', name: '건물', icon: 'build' },
  { id: 'floor', name: '길·바닥', icon: 'cat_floor' },
  { id: 'fence', name: '울타리·문', icon: 'cat_fence' },
  { id: 'light', name: '조명·벤치', icon: 'settings' },
  { id: 'nature', name: '나무·꽃', icon: 'cat_tree' },
  { id: 'garden', name: '광장·정원', icon: 'cat_flowers' },
  { id: 'storage', name: '보관함', icon: 'storage' },
]

// ── zones ────────────────────────────────────────────────────────────────────
// rect = [x0, y0, x1, y1] inclusive. The centre 48×48 is open from the start;
// the ring around it opens piece by piece (each next to an open zone).
export const ZONES = {
  C: { name: '마을 중심', rect: [24, 24, 71, 71], cost: null },
  W: { name: '서쪽 들판', rect: [0, 24, 23, 71], cost: { wood: 80, stone: 50 }, needs: ['C'] },
  E: { name: '동쪽 바위언덕', rect: [72, 24, 95, 71], cost: { wood: 100, stone: 70 }, needs: ['C'] },
  N: { name: '북쪽 개울숲', rect: [24, 0, 71, 23], cost: { wood: 110, stone: 80, stardust: 4 }, needs: ['C'] },
  S: { name: '남쪽 꽃밭', rect: [24, 72, 71, 95], cost: { wood: 130, stone: 100, stardust: 8 }, needs: ['C'] },
  NW: { name: '북서 숲', rect: [0, 0, 23, 23], cost: { wood: 200, stone: 160, stardust: 18 }, needs: ['N', 'W'] },
  NE: { name: '북동 별빛터', rect: [72, 0, 95, 23], cost: { wood: 200, stone: 160, stardust: 18 }, needs: ['N', 'E'] },
  SW: { name: '남서 연못', rect: [0, 72, 23, 95], cost: { wood: 200, stone: 160, stardust: 18 }, needs: ['S', 'W'] },
  SE: { name: '남동 초원', rect: [72, 72, 95, 95], cost: { wood: 200, stone: 160, stardust: 18 }, needs: ['S', 'E'] },
}
export const ZONE_IDS = Object.keys(ZONES)

// ── play and rest ────────────────────────────────────────────────────────────
// What idle Manos do when there is no work: small things all over the village.
// Times in seconds. Work always comes first: plays end early when work turns
// up, and a resident playing never counts as working.
export const PLAY = {
  short: [2, 4], // a quick reaction (a stretch after work)
  normal: [5, 12], // most plays
  nap: [12, 25], // naps, dozing on a friend's shoulder
  repeat: [20, 45], // the same action again only after this long (per Mano)
  pairAgain: [15, 30], // a Mano joins another two-Mano play only after this long
  maxPairs: 8, // two-Mano plays at the same time
  meetTimeout: 12, // both must reach the meeting spot within this
  friendRadius: 8, // tiles: how far a friend can be
  scanEvery: 1, // how often the "who is free nearby" map is rebuilt
  playChance: 0.75, // an idle Mano plays (else walks, sits or rests as before)
  pairChance: 0.35, // of those plays, how often two friends play together
  afterWork: 0.12, // after delivering, now and then a quick stretch
  sameStart: 3, // an action someone else just started is picked less for this long
  crowd: 2, // most players around the same flower bed at once
  wakeAfter: 1.2, // when work turns up, a play wraps up within this
  seatLift: 11, // game px a Mano sits above the ground on a bench
}

// The 25 actions. where: open = a free patch of grass (not on paths, not by
// doors or building sites), flower = next to a flower decoration, bench = on
// a bench seat (else on the grass), here = right where the Mano is.
// len: which of PLAY's time ranges. pair: two real residents in one drawing.
export const ACTS = {
  // 01 rolling about (alone)
  roll_wiggle: { label: '뒹굴거리는 중', where: 'open', len: 'normal', w: 1 },
  roll_side: { label: '데굴데굴 구르는 중', where: 'open', len: 'normal', w: 1 },
  roll_flop: { label: '발라당 넘어가는 중', where: 'open', len: 'normal', w: 1 },
  roll_belly: { label: '엎드려 발 까딱이는 중', where: 'open', len: 'normal', w: 1 },
  // 02 playing alone
  dance: { label: '춤추는 중', where: 'open', len: 'normal', w: 1 },
  hop: { label: '폴짝폴짝 뛰는 중', where: 'open', len: 'normal', w: 1 },
  tail_chase: { label: '꼬리 쫓는 중', where: 'open', len: 'normal', w: 0.8 },
  butterfly: { label: '나비 구경 중', where: 'open', len: 'normal', w: 0.8, flowers: 2 },
  // 03 tussling (two friends)
  tap: { label: '친구와 장난치는 중', pair: true, len: 'normal', w: 1 },
  push: { label: '친구와 밀치기 놀이 중', pair: true, len: 'normal', w: 0.8 },
  peekaboo: { label: '친구와 까꿍 놀이 중', pair: true, len: 'normal', w: 1 },
  // 04 playing together
  highfive: { label: '친구와 하이파이브 중', pair: true, len: 'short', w: 1, cheer: true },
  ball: { label: '친구와 공놀이 중', pair: true, len: 'normal', w: 1 },
  handdance: { label: '친구와 손잡고 춤추는 중', pair: true, len: 'normal', w: 1 },
  // 05 lazy rest (alone)
  yawn: { label: '기지개 켜는 중', where: 'here', len: 'short', w: 0.7, rest: true },
  nap: { label: '낮잠 자는 중', where: 'here', len: 'nap', w: 0.6, rest: true },
  cookie: { label: '과자 먹는 중', where: 'here', len: 'normal', w: 0.8, rest: true },
  bubbles: { label: '비눗방울 부는 중', where: 'open', len: 'normal', w: 0.8, rest: true },
  // 06 resting with a friend
  lean: { label: '친구에게 기대어 조는 중', pair: true, len: 'nap', w: 0.8, rest: true },
  pat: { label: '친구 머리 쓰다듬는 중', pair: true, len: 'normal', w: 0.8, rest: true, cheer: true },
  share: { label: '친구와 과자 나눠 먹는 중', pair: true, len: 'normal', w: 0.8, rest: true },
  // 07 garden play (alone)
  smell: { label: '꽃 구경 중', where: 'flower', len: 'normal', w: 1 },
  petals: { label: '꽃잎 뿌리는 중', where: 'flower', len: 'normal', w: 1 },
  stones: { label: '돌 쌓는 중', where: 'open', len: 'normal', w: 0.7 },
  swing: { label: '발 흔드는 중', where: 'bench', len: 'normal', w: 0.8 },
}
export const ACT_IDS = Object.keys(ACTS)

// ── texts ────────────────────────────────────────────────────────────────────
export const STORAGE_NOTICE =
  '진행 상황은 현재 기기와 브라우저에만 저장됩니다. 다른 기기·브라우저에서는 자동으로 이어지지 않습니다. 브라우저 데이터 삭제 전 백업을 내보내세요.'

export const TUTORIAL = [
  '마노들이 알아서 나무·돌·별가루를 모아요. 지도를 끌어 둘러보고, 두 손가락이나 +/− 버튼으로 확대해 보세요.',
  '[건설]에서 건물이나 장식을 고른 뒤 땅을 눌러 위치를 정하고 확정하세요. 초록색이면 놓을 수 있어요.',
  '건설 현장을 누르면 일할 마노 수를 늘리거나 줄일 수 있어요. 많을수록 빨리 지어요.',
]

// ── offline progress ─────────────────────────────────────────────────────────
export const OFFLINE = {
  maxSeconds: 8 * 3600,
  efficiency: 0.8,
  minNotice: 60,
  gap: 3,
}

// ── saving ───────────────────────────────────────────────────────────────────
export const SAVE = {
  version: 3,
  prefix: 'nodnaba:colony:',
  keys: {
    save: 'nodnaba:colony:save',
    backup: 'nodnaba:colony:backup',
    corrupt: 'nodnaba:colony:corrupt',
    lock: 'nodnaba:colony:lock',
    // the last save of an older format, kept as it was the first time a newer
    // version opened it (never overwritten afterwards)
    beforeUpgrade: 'nodnaba:colony:pre-v3',
  },
  every: 10,
  lockBeat: 2,
  lockStale: 7,
}
