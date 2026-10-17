// Mano Colony — saving to this browser's localStorage.
//
// Keys (fixed for good, never renamed between game updates):
//   nodnaba:colony:save     current save
//   nodnaba:colony:backup   the save before it (last good copy)
//   nodnaba:colony:corrupt  an unreadable save, kept aside instead of erased
//   nodnaba:colony:lock     which tab is playing (one active tab at a time)
//
// Only plain game data is stored, in an envelope with a format version and a
// checksum. Everything read back is checked (shape, numbers, ranges) before
// use; older formats are migrated, newer ones are never overwritten.

import {
  BUILDINGS,
  COLS,
  LOTS,
  MANO,
  MAX_MANOS,
  NODES,
  NODE_LIST,
  RESOURCES,
  ROWS,
  SAVE,
  START,
  TILE,
  TUTORIAL,
  ZONE_IDS,
} from './config.js'
import { caps } from './sim.js'

export const GAME_ID = 'mano-colony'
export const KEYS = SAVE.keys
const LOT_IDS = new Set(LOTS.map((l) => l.id))
const NODE_BY_ID = Object.fromEntries(NODE_LIST.map((n) => [n.id, n]))
const TASKS = new Set(['gather', 'build', 'deliver', 'wander', 'rest', 'arrive'])
const POSES = new Set(['sit', 'sleep', 'wave', 'cheer'])

// ── plain data out of the live state ────────────────────────────────────────

const num = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v)

export function serialize(s) {
  return {
    res: Object.fromEntries(RESOURCES.map((r) => [r, num(s.res[r])])),
    cap: { ...s.cap },
    buildings: s.buildings.map((b) => ({
      id: b.id,
      type: b.type,
      lot: b.lot,
      level: b.level,
      build: b.build ? { to: b.build.to, progress: num(b.build.progress) } : null,
    })),
    nodes: Object.fromEntries(Object.entries(s.nodes).map(([k, v]) => [k, num(v)])),
    manos: s.manos.map((m) => ({
      id: m.id,
      x: num(m.x),
      y: num(m.y),
      carry: m.carry ? { res: m.carry.res, n: m.carry.n } : null,
      task: m.task ? cleanTask(m.task) : null,
    })),
    zones: { ...s.zones },
    nextMano: s.nextMano,
    nextBuilding: s.nextBuilding,
    arrivalT: num(s.arrivalT),
    seed: s.seed,
    tutorial: { ...s.tutorial },
    settings: { ...s.settings },
    stats: { gathered: { ...s.stats.gathered }, built: s.stats.built },
    clock: { ...s.clock },
  }
}

function cleanTask(t) {
  const out = { kind: t.kind }
  for (const k of ['node', 'b', 'phase', 'pose']) if (t[k] !== undefined) out[k] = t[k]
  if (Array.isArray(t.stand)) out.stand = [t.stand[0], t.stand[1]]
  if (Number.isFinite(t.t)) out.t = num(t.t)
  return out
}

// FNV-1a: a cheap fingerprint to notice a damaged or hand-edited save
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

// Returns a cleaned copy of a version-2 data object, or throws Bad.
export function validate(d) {
  must(isObj(d), '데이터 형식이 아니에요')

  must(isObj(d.res), '자원 정보가 없어요')
  const res = {}
  for (const r of RESOURCES) {
    must(fin(d.res[r]) && d.res[r] >= 0 && d.res[r] <= 1e6, `${r} 값이 올바르지 않아요`)
    res[r] = d.res[r]
  }

  must(Array.isArray(d.buildings) && d.buildings.length <= LOTS.length, '건물 목록이 올바르지 않아요')
  const lots = new Set()
  const ids = new Set()
  const buildings = d.buildings.map((b) => {
    must(isObj(b) && typeof b.id === 'string' && /^b\d+$/.test(b.id) && !ids.has(b.id), '건물 ID가 올바르지 않아요')
    must(BUILDINGS[b.type], '알 수 없는 건물 종류예요')
    must(LOT_IDS.has(b.lot) && !lots.has(b.lot), '건물 위치가 올바르지 않아요')
    must(int(b.level) && b.level >= 0 && b.level <= 3, '건물 레벨이 올바르지 않아요')
    ids.add(b.id)
    lots.add(b.lot)
    let build = null
    if (b.build !== null && b.build !== undefined) {
      must(isObj(b.build) && b.build.to === b.level + 1 && b.build.to <= 3, '공사 정보가 올바르지 않아요')
      const work = BUILDINGS[b.type].levels[b.build.to - 1].work
      must(fin(b.build.progress) && b.build.progress >= 0 && b.build.progress <= work + 1, '공사 진행이 올바르지 않아요')
      build = { to: b.build.to, progress: Math.min(b.build.progress, work) }
    }
    must(b.level > 0 || build, '짓지 않은 건물이에요')
    return { id: b.id, type: b.type, lot: b.lot, level: b.level, build }
  })

  must(isObj(d.zones) && d.zones.A === true, '구역 정보가 올바르지 않아요')
  const zones = {}
  for (const z of ZONE_IDS) {
    must(d.zones[z] === undefined || typeof d.zones[z] === 'boolean', '구역 정보가 올바르지 않아요')
    zones[z] = d.zones[z] === true
  }
  must(!zones.C || zones.B, '구역 정보가 올바르지 않아요')

  // nodes: missing ones (added in a later update) start full, unknown ones go
  must(isObj(d.nodes), '자원 노드 정보가 없어요')
  const nodes = {}
  for (const n of NODE_LIST) {
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
      // a position off the map is moved back onto it
      x: Math.min(Math.max(m.x, TILE / 2), COLS * TILE - TILE / 2),
      y: Math.min(Math.max(m.y, TILE / 2), ROWS * TILE - TILE / 2),
      carry,
      task: checkTask(m.task, ids),
    }
  })

  must(isObj(d.clock) && fin(d.clock.simAt) && fin(d.clock.createdAt), '시간 정보가 올바르지 않아요')

  const maxMano = Math.max(...manos.map((m) => m.id))
  const maxB = Math.max(0, ...buildings.map((b) => +b.id.slice(1)))
  const tut = isObj(d.tutorial) ? d.tutorial : {}
  const stats = isObj(d.stats) ? d.stats : {}
  const out = {
    res,
    cap: null,
    buildings,
    nodes,
    manos,
    zones,
    nextMano: int(d.nextMano) && d.nextMano > maxMano ? d.nextMano : maxMano + 1,
    nextBuilding: int(d.nextBuilding) && d.nextBuilding > maxB ? d.nextBuilding : maxB + 1,
    arrivalT: fin(d.arrivalT) && d.arrivalT >= 0 ? Math.min(d.arrivalT, MANO.arriveEvery) : 0,
    seed: int(d.seed) && d.seed > 0 ? d.seed >>> 0 : 1,
    tutorial: {
      step: int(tut.step) && tut.step >= 0 ? Math.min(tut.step, TUTORIAL.length) : 0,
      done: tut.done === true,
    },
    settings: { effects: !(isObj(d.settings) && d.settings.effects === false) },
    stats: {
      gathered: Object.fromEntries(RESOURCES.map((r) => [r, isObj(stats.gathered) && fin(stats.gathered[r]) ? stats.gathered[r] : 0])),
      built: int(stats.built) ? stats.built : 0,
    },
    clock: {
      createdAt: d.clock.createdAt,
      simAt: d.clock.simAt,
      savedAt: fin(d.clock.savedAt) ? d.clock.savedAt : 0,
    },
  }
  // stock above the limit (e.g. an edited file) is trimmed, never kept
  out.cap = caps(out)
  for (const r of RESOURCES) out.res[r] = Math.min(out.res[r], out.cap[r])
  return out
}

// A task that does not check out is dropped: that Mano simply picks a new job.
function checkTask(t, buildingIds) {
  if (!isObj(t) || !TASKS.has(t.kind)) return null
  const out = { kind: t.kind }
  if (t.kind === 'gather' && !NODE_BY_ID[t.node]) return null
  if (t.kind === 'build' && !buildingIds.has(t.b)) return null
  if (NODE_BY_ID[t.node]) out.node = t.node
  if (t.b) out.b = t.b
  if (typeof t.phase === 'string') out.phase = t.phase
  if (t.kind === 'rest') out.pose = POSES.has(t.pose) ? t.pose : 'sit'
  if (Array.isArray(t.stand) && int(t.stand[0]) && int(t.stand[1])) out.stand = [t.stand[0], t.stand[1]]
  out.t = fin(t.t) ? Math.max(0, Math.min(t.t, 60)) : 0
  if (t.kind !== 'rest' && !out.phase) out.phase = 'go'
  if (t.kind === 'deliver' && out.phase === 'drop') out.phase = 'go'
  return out
}

// ── older formats ───────────────────────────────────────────────────────────
// v1 was the development format: totals, a building list and a head count.

const MIGRATIONS = {
  1: (d) => {
    must(isObj(d), '데이터 형식이 아니에요')
    const now = fin(d.savedAt) ? d.savedAt : Date.now()
    const camp = START.camp
    const n = int(d.manoCount) ? Math.max(1, Math.min(d.manoCount, MAX_MANOS)) : START.manos
    return {
      res: { wood: d.wood, stone: d.stone, stardust: d.stardust },
      buildings: (Array.isArray(d.buildings) ? d.buildings : []).map((b, i) => ({
        id: 'b' + (i + 1),
        type: b && b.type,
        lot: b && b.lot,
        level: b && b.level,
        build: null,
      })),
      nodes: {},
      manos: Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        x: (camp.x - 1 + (i % 3)) * TILE + TILE / 2,
        y: (camp.y + 1.5) * TILE,
        carry: null,
        task: null,
      })),
      zones: Object.fromEntries(ZONE_IDS.map((z) => [z, z === 'A' || (Array.isArray(d.zones) && d.zones.includes(z))])),
      tutorial: { step: d.tutorialDone ? TUTORIAL.length : 0, done: !!d.tutorialDone },
      clock: { createdAt: now, simAt: now, savedAt: now },
    }
  },
}

// Text → checked data. Never throws.
//   { ok: true, data, version, migrated }
//   { ok: false, kind: 'future' | 'corrupt' | 'foreign', error }
export function parse(text) {
  let env
  try {
    env = JSON.parse(text)
  } catch {
    return { ok: false, kind: 'corrupt', error: '저장 내용이 깨져 있어요' }
  }
  if (!isObj(env) || env.game !== GAME_ID) return { ok: false, kind: 'foreign', error: '마노 마을 저장 데이터가 아니에요' }
  if (!int(env.version) || env.version < 1) return { ok: false, kind: 'corrupt', error: '저장 형식 버전을 알 수 없어요' }
  if (env.version > SAVE.version) {
    return { ok: false, kind: 'future', version: env.version, error: '더 새로운 버전의 게임에서 만든 저장 데이터예요' }
  }
  try {
    let data = env.data
    if (env.version >= 2) {
      must(typeof env.sum === 'string' && env.sum === checksum(JSON.stringify(data)), '저장 데이터가 손상되었어요')
    }
    for (let v = env.version; v < SAVE.version; v++) data = MIGRATIONS[v](data)
    return { ok: true, data: validate(data), version: env.version, migrated: env.version < SAVE.version, savedAt: env.savedAt }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, kind: 'corrupt', error: e.message }
    return { ok: false, kind: 'corrupt', error: '저장 데이터를 확인하지 못했어요' }
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

  return {
    available: !!storage,

    // What is saved here, already checked.
    //   new | ok | migrated | restored (from backup) | corrupt | future | unavailable
    load() {
      if (!storage) return { status: 'unavailable' }
      const cur = get(KEYS.save)
      const bak = get(KEYS.backup)
      if (!cur && !bak) return { status: 'new' }
      const a = cur ? parse(cur) : null
      if (a && a.ok) return { status: a.migrated ? 'migrated' : 'ok', data: a.data, from: a.version }
      if (a && a.kind === 'future') return { status: 'future', raw: cur, version: a.version }
      const b = bak ? parse(bak) : null
      if (b && b.ok) {
        // keep the broken copy aside; the backup becomes the game
        if (cur) this.keepCorrupt(cur)
        return { status: 'restored', data: b.data, error: a ? a.error : '저장본이 없어요', from: b.version }
      }
      if (b && b.kind === 'future') return { status: 'future', raw: bak, version: b.version }
      return { status: 'corrupt', raw: cur || bak, error: (a || b).error }
    },

    keepCorrupt(raw) {
      try {
        storage.setItem(KEYS.corrupt, raw)
      } catch {
        /* nowhere to keep it; the export button still offers it */
      }
    },

    // Write the game. The previous good save becomes the backup. The write is
    // read back to make sure it really landed.
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

    // keep the current good save as the backup (before an import replaces it)
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
        for (const k of [KEYS.save, KEYS.backup, KEYS.corrupt]) storage.removeItem(k)
        return true
      } catch {
        return false
      }
    },

    // ── one active tab ──
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
