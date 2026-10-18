// MANO COLONY — saving to this browser's localStorage.
//
// Keys (fixed for good, never renamed between game updates):
//   nodnaba:colony:save     current save
//   nodnaba:colony:backup   the save before it (last good copy)
//   nodnaba:colony:corrupt  an unreadable save, kept aside instead of erased
//   nodnaba:colony:lock     which tab is playing (one active tab at a time)
//   nodnaba:colony:pre-v3   an older-format save exactly as it was the first
//                           time this version opened it
//
// Only plain game data is stored, in an envelope with a format version and a
// checksum. Everything read back is checked (shape, numbers, ranges) before
// use; older formats are migrated (v1 → v2 → v3), newer ones never touched.

import {
  BUILDINGS,
  DECOR,
  DEFAULT_SEED,
  FLOORS,
  MANO,
  MAP,
  MAX_MANOS,
  NODES,
  RESOURCES,
  SAVE,
  START,
  TUTORIAL,
  ZONES,
  ZONE_IDS,
} from './config.js'
import { V2_LOTS, V2_WORK } from './legacy.js'
import { josa } from './text.js'
import { caps } from './sim.js'
import { createWorld, decorSize, generate, idx, inMap, refresh } from './world.js'

export const GAME_ID = 'mano-colony'
export const KEYS = SAVE.keys
const TASKS = new Set(['gather', 'build', 'deliver', 'wander', 'rest', 'arrive', 'sit'])
const POSES = new Set(['sit', 'sleep', 'stand', 'happy'])

// ── plain data out of the live state ────────────────────────────────────────

const num = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v)
const costCopy = (c) => Object.fromEntries(RESOURCES.filter((r) => c && c[r]).map((r) => [r, num(c[r])]))

export function serialize(s) {
  return {
    seed: s.seed,
    res: Object.fromEntries(RESOURCES.map((r) => [r, num(s.res[r])])),
    cap: { ...s.cap },
    buildings: s.buildings.map((b) => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      level: b.level,
      spent: costCopy(b.spent),
      build: b.build ? { to: b.build.to, progress: num(b.build.progress), crew: b.build.crew, paid: costCopy(b.build.paid) } : null,
    })),
    decor: s.decor.map((d) => ({ id: d.id, type: d.type, x: d.x, y: d.y, dir: d.dir || 0 })),
    floors: { ...s.floors },
    inventory: Object.fromEntries(Object.entries(s.inventory).filter(([, n]) => n > 0)),
    stored: s.stored.map((b) => ({ type: b.type, level: b.level, spent: costCopy(b.spent), build: b.build ? { ...b.build } : null })),
    nodes: Object.fromEntries(Object.entries(s.nodes).map(([k, v]) => [k, num(v)])),
    manos: s.manos.map((m) => ({
      id: m.id,
      x: num(m.x),
      y: num(m.y),
      carry: m.carry ? { res: m.carry.res, n: m.carry.n } : null,
      // plays are never saved: after loading, everyone simply picks a job again
      task: m.task && m.task.kind !== 'play' && m.task.kind !== 'duo' ? cleanTask(m.task) : null,
      resume: m.resume || null,
    })),
    zones: { ...s.zones },
    nextId: s.nextId,
    arrivalT: num(s.arrivalT),
    rs: s.rs,
    tutorial: { ...s.tutorial },
    notice: { ...s.notice },
    settings: { ...s.settings },
    stats: { gathered: { ...s.stats.gathered }, built: s.stats.built },
    clock: { ...s.clock },
  }
}

function cleanTask(t) {
  const out = { kind: t.kind }
  for (const k of ['node', 'b', 'phase', 'pose', 'seat']) if (t[k] !== undefined && t[k] !== null) out[k] = t[k]
  if (Number.isInteger(t.si)) out.si = t.si
  if (Array.isArray(t.spot)) out.spot = [t.spot[0], t.spot[1]]
  if (Number.isFinite(t.t)) out.t = num(t.t)
  return out
}

export function checksum(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function envelope(data, now = Date.now()) {
  return { game: GAME_ID, version: SAVE.version, savedAt: now, sum: checksum(JSON.stringify(data)), data }
}

// ── checking what we read back ──────────────────────────────────────────────

class Bad extends Error {}
const must = (cond, msg) => {
  if (!cond) throw new Bad(msg)
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const int = (v) => Number.isInteger(v)

function cost(c, what) {
  must(c === undefined || c === null || isObj(c), `${what} 값이 올바르지 않아요`)
  const out = {}
  for (const r of RESOURCES) {
    if (!c || c[r] === undefined) continue
    must(fin(c[r]) && c[r] >= 0 && c[r] <= 1e6, `${what} 값이 올바르지 않아요`)
    if (c[r]) out[r] = c[r]
  }
  return out
}

// A version-3 data object → cleaned copy (throws Bad if it cannot be trusted).
// Placement mistakes (two things on one tile) are repaired, never fatal:
// a building that does not fit goes to the storage box, a decoration too.
export function validate(d) {
  must(isObj(d), '저장 내용의 형식이 맞지 않아요')
  const seed = int(d.seed) && d.seed > 0 ? d.seed : DEFAULT_SEED
  const gen = generate(seed)

  must(isObj(d.res), '자원 정보가 없어요')
  const res = {}
  for (const r of RESOURCES) {
    must(fin(d.res[r]) && d.res[r] >= 0 && d.res[r] <= 1e7, `${r} 값이 올바르지 않아요`)
    res[r] = d.res[r]
  }

  must(isObj(d.zones) && d.zones.C === true, '구역 정보가 올바르지 않아요')
  const zones = {}
  for (const z of ZONE_IDS) {
    must(d.zones[z] === undefined || typeof d.zones[z] === 'boolean', '구역 정보가 올바르지 않아요')
    if (d.zones[z]) zones[z] = true
  }
  for (const z of Object.keys(zones)) must(z === 'C' || ZONES[z].needs.some((n) => zones[n]), '구역 정보가 올바르지 않아요')

  const ids = new Set()
  must(Array.isArray(d.buildings) && d.buildings.length <= 200, '건물 목록이 올바르지 않아요')
  const buildings = d.buildings.map((b) => {
    must(isObj(b) && typeof b.id === 'string' && /^b\d+$/.test(b.id) && !ids.has(b.id), '건물 ID가 올바르지 않아요')
    must(BUILDINGS[b.type], '알 수 없는 건물 종류예요')
    must(int(b.x) && int(b.y) && inMap(b.x, b.y), '건물 위치가 올바르지 않아요')
    must(int(b.level) && b.level >= 0 && b.level <= 3, '건물 레벨이 올바르지 않아요')
    ids.add(b.id)
    let build = null
    if (b.build) {
      must(isObj(b.build) && b.build.to === b.level + 1 && b.build.to <= 3, '공사 정보가 올바르지 않아요')
      const work = BUILDINGS[b.type].levels[b.build.to - 1].work
      must(fin(b.build.progress) && b.build.progress >= 0 && b.build.progress <= work + 1, '공사 진행이 올바르지 않아요')
      must(int(b.build.crew) && b.build.crew >= 0 && b.build.crew <= MAX_MANOS, '공사 인원이 올바르지 않아요')
      build = { to: b.build.to, progress: Math.min(b.build.progress, work), crew: b.build.crew, paid: cost(b.build.paid, '공사 비용') }
    }
    must(b.level > 0 || build, '짓지 않은 건물이에요')
    return { id: b.id, type: b.type, x: b.x, y: b.y, level: b.level, spent: cost(b.spent, '건설 비용'), build }
  })

  must(Array.isArray(d.decor) && d.decor.length <= 5000, '장식 목록이 올바르지 않아요')
  const decor = d.decor.map((o) => {
    must(isObj(o) && typeof o.id === 'string' && /^d\d+$/.test(o.id) && !ids.has(o.id), '장식 ID가 올바르지 않아요')
    must(DECOR[o.type], '알 수 없는 장식이에요')
    must(int(o.x) && int(o.y) && inMap(o.x, o.y), '장식 위치가 올바르지 않아요')
    ids.add(o.id)
    const dirs = DECOR[o.type].dirs ? DECOR[o.type].dirs.length : 1
    return { id: o.id, type: o.type, x: o.x, y: o.y, dir: int(o.dir) && o.dir >= 0 ? o.dir % dirs : 0 }
  })

  must(isObj(d.floors), '바닥 정보가 올바르지 않아요')
  const floors = {}
  for (const k of Object.keys(d.floors)) {
    const i = +k
    const v = d.floors[k]
    must(int(i) && i >= 0 && i < MAP * MAP && Array.isArray(v) && FLOORS[v[0]] && (v[1] === 0 || v[1] === 1), '바닥 정보가 올바르지 않아요')
    floors[i] = [v[0], v[1]]
  }

  const inventory = {}
  if (d.inventory !== undefined) {
    must(isObj(d.inventory), '보관함 정보가 올바르지 않아요')
    for (const [k, n] of Object.entries(d.inventory)) {
      must(DECOR[k] && int(n) && n >= 0 && n <= 10000, '보관함 정보가 올바르지 않아요')
      if (n) inventory[k] = n
    }
  }
  const stored = []
  if (d.stored !== undefined) {
    must(Array.isArray(d.stored) && d.stored.length <= 200, '보관함 정보가 올바르지 않아요')
    for (const b of d.stored) {
      must(isObj(b) && BUILDINGS[b.type] && int(b.level) && b.level >= 0 && b.level <= 3, '보관함 정보가 올바르지 않아요')
      let build = null
      if (b.build) {
        must(isObj(b.build) && b.build.to === b.level + 1, '보관함 정보가 올바르지 않아요')
        build = { to: b.build.to, progress: fin(b.build.progress) ? Math.max(0, b.build.progress) : 0, crew: 2, paid: cost(b.build.paid, '공사 비용') }
      }
      must(b.level > 0 || build, '보관함 정보가 올바르지 않아요')
      stored.push({ type: b.type, level: b.level, spent: cost(b.spent, '건설 비용'), build })
    }
  }

  must(isObj(d.nodes), '자원 노드 정보가 없어요')
  const nodes = {}
  for (const n of gen.nodes) {
    const v = d.nodes[n.id]
    const max = NODES[n.kind].max
    if (v === undefined) nodes[n.id] = max
    else {
      must(fin(v) && v >= 0 && v <= max + 0.001, '자원 노드 값이 올바르지 않아요')
      nodes[n.id] = Math.min(v, max)
    }
  }

  must(Array.isArray(d.manos) && d.manos.length >= 1 && d.manos.length <= MAX_MANOS, '주민 정보가 올바르지 않아요')
  const mids = new Set()
  const manos = d.manos.map((m) => {
    must(isObj(m) && int(m.id) && m.id > 0 && !mids.has(m.id), '주민 ID가 올바르지 않아요')
    must(fin(m.x) && fin(m.y), '주민 위치가 올바르지 않아요')
    mids.add(m.id)
    let carry = null
    if (m.carry) {
      must(isObj(m.carry) && RESOURCES.includes(m.carry.res) && int(m.carry.n) && m.carry.n >= 1 && m.carry.n <= 10, '운반 정보가 올바르지 않아요')
      carry = { res: m.carry.res, n: m.carry.n }
    }
    return {
      id: m.id,
      x: Math.min(Math.max(m.x, 0.5), MAP - 0.5),
      y: Math.min(Math.max(m.y, 0.5), MAP - 0.5),
      carry,
      task: checkTask(m.task, ids, gen),
      resume: typeof m.resume === 'string' && /^n\d+$/.test(m.resume) && gen.nodes[+m.resume.slice(1)] ? m.resume : null,
    }
  })

  must(isObj(d.clock) && fin(d.clock.simAt) && fin(d.clock.createdAt), '시간 정보가 올바르지 않아요')
  const maxId = Math.max(0, ...[...ids].map((s) => +s.slice(1)), ...manos.map((m) => m.id))
  const tut = isObj(d.tutorial) ? d.tutorial : {}
  const stats = isObj(d.stats) ? d.stats : {}
  const out = {
    seed,
    res,
    cap: null,
    buildings,
    decor,
    floors,
    inventory,
    stored,
    nodes,
    manos,
    zones,
    nextId: int(d.nextId) && d.nextId > maxId ? d.nextId : maxId + 1,
    arrivalT: fin(d.arrivalT) && d.arrivalT >= 0 ? Math.min(d.arrivalT, MANO.arriveEvery) : 0,
    rs: int(d.rs) && d.rs > 0 ? d.rs >>> 0 : 7,
    tutorial: { step: int(tut.step) && tut.step >= 0 ? Math.min(tut.step, TUTORIAL.length) : 0, done: tut.done === true },
    notice: { storage: !!(isObj(d.notice) && d.notice.storage) },
    settings: { effects: !(isObj(d.settings) && d.settings.effects === false) },
    stats: {
      gathered: Object.fromEntries(RESOURCES.map((r) => [r, isObj(stats.gathered) && fin(stats.gathered[r]) ? stats.gathered[r] : 0])),
      built: int(stats.built) ? stats.built : 0,
    },
    clock: { createdAt: d.clock.createdAt, simAt: d.clock.simAt, savedAt: fin(d.clock.savedAt) ? d.clock.savedAt : 0 },
  }
  repairOverlaps(out)
  out.cap = caps(out)
  return out
}

// Two things on one tile (should never happen): the later one goes to the box.
function repairOverlaps(s) {
  const w = createWorld(s.seed)
  const taken = new Uint8Array(MAP * MAP)
  for (const n of w.gen.nodes) taken[idx(n.x, n.y)] = 1
  for (let y = START.camp.y; y < START.camp.y + 2; y++) for (let x = START.camp.x; x < START.camp.x + 2; x++) taken[idx(x, y)] = 1
  const fits = (x0, y0, ww, hh, water) => {
    for (let y = y0; y < y0 + hh; y++)
      for (let x = x0; x < x0 + ww; x++) if (!inMap(x, y) || taken[idx(x, y)] || (!water && w.gen.water[idx(x, y)])) return false
    return true
  }
  const mark = (x0, y0, ww, hh) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) taken[idx(x, y)] = 1
  }
  s.buildings = s.buildings.filter((b) => {
    if (fits(b.x, b.y, 3, 3, false)) return mark(b.x, b.y, 3, 3), true
    s.stored.push({ type: b.type, level: b.level, spent: b.spent, build: b.build })
    return false
  })
  s.decor = s.decor.filter((d) => {
    const [ww, hh] = decorSize(d.type)
    if (fits(d.x, d.y, ww, hh, !!DECOR[d.type].water)) return mark(d.x, d.y, ww, hh), true
    s.inventory[d.type] = (s.inventory[d.type] || 0) + 1
    return false
  })
}

function checkTask(t, ids, gen) {
  if (!isObj(t) || !TASKS.has(t.kind)) return null
  const out = { kind: t.kind }
  const okNode = (n) => typeof n === 'string' && /^n\d+$/.test(n) && gen.nodes[+n.slice(1)]
  if (t.kind === 'gather' && !okNode(t.node)) return null
  if (t.kind === 'build' && !ids.has(t.b)) return null
  if (t.kind === 'sit' && !ids.has(t.seat)) return null
  if (okNode(t.node)) out.node = t.node
  if (ids.has(t.b)) out.b = t.b
  if (ids.has(t.seat)) {
    out.seat = t.seat
    out.si = int(t.si) && t.si >= 0 ? t.si : 0
  }
  if (typeof t.phase === 'string') out.phase = t.phase
  if (t.kind === 'rest') out.pose = POSES.has(t.pose) ? t.pose : 'sit'
  if (Array.isArray(t.spot) && int(t.spot[0]) && int(t.spot[1]) && inMap(t.spot[0], t.spot[1])) out.spot = [t.spot[0], t.spot[1]]
  out.t = fin(t.t) ? Math.max(0, Math.min(t.t, 60)) : 0
  if (t.kind !== 'rest' && !out.phase) out.phase = 'go'
  if (t.kind === 'deliver' && out.phase === 'drop') out.phase = 'go'
  if (t.kind === 'rest' && out.seat) out.t = Math.min(out.t, 8)
  return out
}

// ── older formats ───────────────────────────────────────────────────────────

const costOfLevels = (type, upTo) => {
  const out = {}
  for (let l = 0; l < upTo; l++) for (const [r, n] of Object.entries(BUILDINGS[type].levels[l].cost)) out[r] = (out[r] || 0) + n
  return out
}

const MIGRATIONS = {
  // v1 (development format): totals, a building list, a head count
  1: (d) => {
    must(isObj(d), '저장 내용의 형식이 맞지 않아요')
    const now = fin(d.savedAt) ? d.savedAt : Date.now()
    const n = int(d.manoCount) ? Math.max(1, Math.min(d.manoCount, MAX_MANOS)) : START.manos
    return {
      data: {
        res: { wood: d.wood, stone: d.stone, stardust: d.stardust },
        buildings: (Array.isArray(d.buildings) ? d.buildings : []).map((b, i) => ({ id: 'b' + (i + 1), type: b && b.type, lot: b && b.lot, level: b && b.level, build: null })),
        nodes: {},
        manos: Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 0, y: 0, carry: null, task: null })),
        zones: { A: true, B: Array.isArray(d.zones) && d.zones.includes('B'), C: Array.isArray(d.zones) && d.zones.includes('C') },
        tutorial: { step: d.tutorialDone ? 3 : 0, done: !!d.tutorialDone },
        clock: { createdAt: now, simAt: now, savedAt: now },
      },
      notes: [],
    }
  },

  // v2 (first demo: 20×34 map, fixed lots) → v3 (96×96 diamond map)
  2: (d) => {
    must(isObj(d) && isObj(d.res) && Array.isArray(d.buildings) && Array.isArray(d.manos) && isObj(d.clock), '저장 내용의 형식이 맞지 않아요')
    for (const r of RESOURCES) must(fin(d.res[r]) && d.res[r] >= 0, '자원 값이 올바르지 않아요')
    must(d.manos.length >= 1 && d.manos.length <= MAX_MANOS, '주민 정보가 올바르지 않아요')
    const notes = []
    const zones = { C: true }
    if (d.zones && d.zones.B) zones.N = true // 숲 언저리 → 북쪽 개울숲
    if (d.zones && d.zones.C) zones.NE = true // 별빛 언덕 → 북동 별빛터 (next to the north)
    const s = {
      seed: DEFAULT_SEED,
      res: { ...d.res },
      buildings: [],
      decor: [],
      floors: {},
      inventory: {},
      stored: [],
      nodes: {},
      manos: [],
      zones,
      nextId: 1,
      clock: d.clock,
    }
    const world = createWorld(DEFAULT_SEED)
    refresh(world, s)
    const fits = (x, y) => {
      for (let yy = y; yy < y + 3; yy++)
        for (let xx = x; xx < x + 3; xx++) {
          if (!inMap(xx, yy)) return false
          const i = idx(xx, yy)
          if (!world.open[i] || world.occ[i] || world.gen.water[i]) return false
        }
      // keep a free tile in front so Manos can reach it
      return [[x + 3, y + 1], [x + 1, y + 3], [x - 1, y + 1], [x + 1, y - 1]].some(([a, b]) => inMap(a, b) && !world.block[idx(a, b)])
    }
    for (const b of d.buildings) {
      if (!isObj(b) || !BUILDINGS[b.type] || !int(b.level) || b.level < 0 || b.level > 3) continue
      const lot = V2_LOTS[b.lot]
      const level = b.level
      let build = null
      if (isObj(b.build) && int(b.build.to) && b.build.to === level + 1 && b.build.to <= 3) {
        const oldWork = V2_WORK[b.type][b.build.to - 1]
        const frac = fin(b.build.progress) ? Math.min(1, Math.max(0, b.build.progress / oldWork)) : 0
        build = { to: b.build.to, progress: frac * BUILDINGS[b.type].levels[b.build.to - 1].work, crew: 2, paid: { ...BUILDINGS[b.type].levels[b.build.to - 1].cost } }
      }
      if (level === 0 && !build) continue
      const spent = costOfLevels(b.type, level + (build ? 1 : 0))
      // old lot → the same spot on the new map's centre (2 tiles per old tile)
      const want = lot ? { x: 36 + (lot[0] - 3) * 2, y: 36 + (lot[1] - 22) * 2 } : { x: 40, y: 40 }
      let spot = fits(want.x, want.y) ? want : null
      for (let r = 1; !spot && r <= 14; r++)
        for (let dy = -r; dy <= r && !spot; dy++)
          for (let dx = -r; dx <= r && !spot; dx++)
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && fits(want.x + dx, want.y + dy)) spot = { x: want.x + dx, y: want.y + dy }
      const name = BUILDINGS[b.type].name
      if (!spot) {
        s.stored.push({ type: b.type, level, spent, build })
        notes.push(`${josa(`${name} Lv${Math.max(level, 1)}`, '은', '는')} 새 지도에 자리가 없어 보관함에 넣어 두었어요.`)
        continue
      }
      if (spot !== want) notes.push(`${josa(name, '을', '를')} 새 지도에 맞게 가까운 자리로 옮겼어요.`)
      s.buildings.push({ id: 'b' + s.nextId++, type: b.type, x: spot.x, y: spot.y, level, spent, build })
      refresh(world, s)
    }
    // the starting square comes along (only where it fits)
    const c = START.camp
    for (const [type, x, y] of [['signpost', c.x + 4, c.y + 4], ['lamp_small', c.x + 2, c.y + 2]]) {
      const i = idx(x, y)
      if (!world.occ[i]) {
        s.decor.push({ id: 'd' + s.nextId++, type, x, y, dir: 0 })
        refresh(world, s)
      }
    }
    for (let k = -3; k <= 6; k++)
      for (const [x, y] of [[c.x + k, c.y + 3], [c.x + 3, c.y + k]]) {
        const o = world.occ[idx(x, y)]
        if (!o || o.kind === 'decor') s.floors[idx(x, y)] = ['cobble', 0]
      }
    s.manos = d.manos.map((m, i) => ({
      id: s.nextId++,
      x: c.x + 2.5 + (i % 3),
      y: c.y + 0.5 + Math.floor(i / 3) * 0.6,
      carry: isObj(m && m.carry) && RESOURCES.includes(m.carry.res) && int(m.carry.n) && m.carry.n >= 1 && m.carry.n <= 10 ? { res: m.carry.res, n: m.carry.n } : null,
      task: null,
    }))
    const tut = isObj(d.tutorial) ? d.tutorial : {}
    return {
      data: {
        ...s,
        arrivalT: fin(d.arrivalT) ? d.arrivalT : 0,
        rs: int(d.seed) && d.seed > 0 ? d.seed : 7,
        tutorial: { step: 0, done: tut.done === true || (int(tut.step) && tut.step > 0) || d.buildings.length > 0 },
        notice: { storage: false },
        settings: isObj(d.settings) ? { effects: d.settings.effects !== false } : { effects: true },
        stats: isObj(d.stats) ? d.stats : { gathered: {}, built: 0 },
      },
      notes,
    }
  },
}

// Text → checked data. Never throws.
//   { ok: true, data, version, migrated, notes }
//   { ok: false, kind: 'future' | 'corrupt' | 'foreign' | 'migrate', error }
export function parse(text) {
  let env
  try {
    env = JSON.parse(text)
  } catch {
    return { ok: false, kind: 'corrupt', error: '저장 내용이 깨져 있어요' }
  }
  if (!isObj(env) || env.game !== GAME_ID) return { ok: false, kind: 'foreign', error: '마노 마을 저장 데이터가 아니에요' }
  if (!int(env.version) || env.version < 1) return { ok: false, kind: 'corrupt', error: '저장 형식 버전을 알 수 없어요' }
  if (env.version > SAVE.version) return { ok: false, kind: 'future', version: env.version, error: '더 새로운 버전의 게임에서 만든 저장 데이터예요' }
  let data = env.data
  try {
    if (env.version >= 2) must(typeof env.sum === 'string' && env.sum === checksum(JSON.stringify(data)), '저장 데이터가 손상되었어요')
  } catch (e) {
    return { ok: false, kind: 'corrupt', error: e.message }
  }
  const notes = []
  try {
    for (let v = env.version; v < SAVE.version; v++) {
      const r = MIGRATIONS[v](data)
      data = r.data
      notes.push(...r.notes)
    }
    return { ok: true, data: validate(data), version: env.version, migrated: env.version < SAVE.version, notes, savedAt: env.savedAt }
  } catch (e) {
    const msg = e instanceof Bad ? e.message : '저장 데이터를 확인하지 못했어요'
    // an older save that could not be carried over is left exactly as it is
    if (env.version < SAVE.version) return { ok: false, kind: 'migrate', version: env.version, error: msg }
    return { ok: false, kind: 'corrupt', error: msg }
  }
}

// ── storage ─────────────────────────────────────────────────────────────────

export function browserStorage() {
  try {
    const ls = window.localStorage
    const k = SAVE.prefix + 'probe'
    ls.setItem(k, '1')
    ls.removeItem(k)
    return ls
  } catch {
    return null
  }
}

export function createStore(storage) {
  const get = (k) => {
    try {
      return storage ? storage.getItem(k) : null
    } catch {
      return null
    }
  }
  const keepOld = (raw) => {
    // the first time an older save is opened, keep it exactly as it was
    try {
      if (!storage.getItem(KEYS.beforeUpgrade)) storage.setItem(KEYS.beforeUpgrade, raw)
    } catch {
      /* no room: the normal backup still holds it until the next save */
    }
  }

  return {
    available: !!storage,

    //   new | ok | migrated | restored | corrupt | future | migrate-failed | unavailable
    load() {
      if (!storage) return { status: 'unavailable' }
      const cur = get(KEYS.save)
      const bak = get(KEYS.backup)
      if (!cur && !bak) return { status: 'new' }
      const a = cur ? parse(cur) : null
      if (a && a.ok) {
        if (a.migrated) keepOld(cur)
        return { status: a.migrated ? 'migrated' : 'ok', data: a.data, from: a.version, notes: a.notes }
      }
      if (a && a.kind === 'future') return { status: 'future', raw: cur, version: a.version }
      if (a && a.kind === 'migrate') return { status: 'migrate-failed', raw: cur, error: a.error, version: a.version }
      const b = bak ? parse(bak) : null
      if (b && b.ok) {
        if (cur) this.keepCorrupt(cur)
        if (b.migrated) keepOld(bak)
        return { status: 'restored', data: b.data, error: a ? a.error : '저장본이 없어요', from: b.version, notes: b.notes }
      }
      if (b && b.kind === 'future') return { status: 'future', raw: bak, version: b.version }
      if (b && b.kind === 'migrate') return { status: 'migrate-failed', raw: bak, error: b.error, version: b.version }
      return { status: 'corrupt', raw: cur || bak, error: (a || b).error }
    },

    keepCorrupt(raw) {
      try {
        storage.setItem(KEYS.corrupt, raw)
      } catch {
        /* nowhere to keep it; the export button still offers it */
      }
    },

    save(state, now = Date.now()) {
      if (!storage) return { ok: false, error: 'unavailable' }
      const data = serialize(state)
      data.clock.savedAt = now
      const text = JSON.stringify(envelope(data, now))
      try {
        const prev = storage.getItem(KEYS.save)
        if (prev && prev !== text && parse(prev).ok) storage.setItem(KEYS.backup, prev)
        storage.setItem(KEYS.save, text)
        if (storage.getItem(KEYS.save) !== text) return { ok: false, error: 'verify' }
        state.clock.savedAt = now
        return { ok: true, at: now }
      } catch (e) {
        const full = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)
        return { ok: false, error: full ? 'full' : 'blocked' }
      }
    },

    backupNow() {
      const cur = get(KEYS.save)
      if (!cur || !parse(cur).ok) return false
      try {
        storage.setItem(KEYS.backup, cur)
        return true
      } catch {
        return false
      }
    },

    // only this game's keys; the rest of the site's storage is left alone
    reset() {
      try {
        for (const k of [KEYS.save, KEYS.backup, KEYS.corrupt, KEYS.beforeUpgrade]) storage.removeItem(k)
        return true
      } catch {
        return false
      }
    },

    readLock() {
      try {
        const l = JSON.parse(get(KEYS.lock))
        return isObj(l) && typeof l.id === 'string' && fin(l.t) ? l : null
      } catch {
        return null
      }
    },
    lockFree(id, now = Date.now()) {
      const l = this.readLock()
      return !l || l.id === id || now - l.t > SAVE.lockStale * 1000 || now < l.t - 60000
    },
    claimLock(id, now = Date.now()) {
      try {
        storage.setItem(KEYS.lock, JSON.stringify({ id, t: now }))
        return true
      } catch {
        return false
      }
    },
    releaseLock(id) {
      try {
        const l = this.readLock()
        if (l && l.id === id) storage.removeItem(KEYS.lock)
      } catch {
        /* ignore */
      }
    },
  }
}

// ── backup files ────────────────────────────────────────────────────────────

export function exportText(state, now = Date.now()) {
  const data = serialize(state)
  data.clock.savedAt = now
  return JSON.stringify(envelope(data, now), null, 1)
}

export function exportName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `mano-colony-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`
}
