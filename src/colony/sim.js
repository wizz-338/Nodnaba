// Mano Colony — game rules. Pure data in, pure data out: no drawing, no DOM.
//
// Each Mano loops: pick a job → walk → work → carry → drop off → pick again.
// Saved per Mano: position, what she carries and her task. Everything with
// a leading underscore (path, animation) is rebuilt after loading.

import {
  BUILDINGS,
  GATHER,
  MANO,
  MAX_MANOS,
  NODES,
  RESOURCES,
  START,
  STARDUST_SHARE,
  TILE,
  ZONES,
} from './config.js'
import {
  LOT,
  NODE,
  campStands,
  center,
  findPath,
  lotStands,
  nodeStands,
  pathLength,
  refresh,
  smooth,
  tileOf,
  walkable,
  zoneOfRow,
} from './world.js'

// ── small helpers ────────────────────────────────────────────────────────────

export function rand(s) {
  let x = s.seed | 0 || 1
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  s.seed = x >>> 0
  return s.seed / 2 ** 32
}

const ENTRY = { x: 9.5 * TILE, y: 33.6 * TILE } // new Manos walk in from the road

export function newGame(now = Date.now(), seed = (Math.random() * 2 ** 32) >>> 0) {
  const s = {
    res: { ...START.res },
    cap: { ...START.baseCap },
    buildings: [],
    nodes: Object.fromEntries(Object.keys(NODE).map((id) => [id, NODES[NODE[id].kind].max])),
    manos: [],
    zones: { A: true, B: false, C: false },
    nextMano: 1,
    nextBuilding: 1,
    arrivalT: 0,
    seed: seed || 1,
    tutorial: { step: 0, done: false },
    settings: { effects: true },
    stats: { gathered: { wood: 0, stone: 0, stardust: 0 }, built: 0 },
    clock: { createdAt: now, simAt: now, savedAt: 0 },
  }
  const c = START.camp
  for (let i = 0; i < START.manos; i++) {
    s.manos.push({ id: s.nextMano++, x: (c.x - 1 + i) * TILE + TILE / 2, y: (c.y + 1.5) * TILE, carry: null, task: null })
  }
  s.cap = caps(s)
  return s
}

// ── derived values ───────────────────────────────────────────────────────────

const done = (b) => b.level >= 1

export function caps(s) {
  const c = { ...START.baseCap }
  for (const b of s.buildings) {
    if (b.type !== 'storage' || !done(b)) continue
    const add = BUILDINGS.storage.levels[b.level - 1].cap
    for (const r of RESOURCES) c[r] += add[r]
  }
  return c
}

export function homes(s) {
  let n = START.baseHomes
  for (const b of s.buildings) if (b.type === 'house' && done(b)) n += BUILDINGS.house.levels[b.level - 1].homes
  return Math.min(n, MAX_MANOS)
}

// best gathering bonus for a resource from finished lumber mills / quarries
export function bonus(s, res) {
  let best = { speed: 1, carry: 0, level: 0 }
  for (const b of s.buildings) {
    const def = BUILDINGS[b.type]
    if (def.gathers !== res || !done(b) || b.level <= best.level) continue
    const l = def.levels[b.level - 1]
    best = { speed: l.speed, carry: l.carry, level: b.level }
  }
  return best
}

export const carryOf = (s, res) => GATHER[res].carry + bonus(s, res).carry
export const workOf = (s, res) => GATHER[res].time / bonus(s, res).speed

export function lacking(s, cost) {
  const out = {}
  for (const r of RESOURCES) if ((cost[r] || 0) > s.res[r]) out[r] = (cost[r] || 0) - Math.floor(s.res[r])
  return out
}

export function overCap(s, cost) {
  const c = caps(s)
  const out = {}
  for (const r of RESOURCES) if ((cost[r] || 0) > c[r]) out[r] = c[r]
  return out
}

const pay = (s, cost) => {
  for (const r of RESOURCES) s.res[r] = Math.max(0, s.res[r] - (cost[r] || 0))
}

export const lotFree = (s, lotId) => !s.buildings.some((b) => b.lot === lotId)
export const lotOpen = (s, lotId) => !!s.zones[zoneOfRow(LOT[lotId].y)]

// ── player actions (each one pays exactly once, or not at all) ───────────────

export function canPlace(s, type, lotId) {
  if (!BUILDINGS[type] || !LOT[lotId]) return { ok: false, reason: '알 수 없는 건물이에요.' }
  if (!lotOpen(s, lotId)) return { ok: false, reason: '아직 잠긴 구역이에요.' }
  if (!lotFree(s, lotId)) return { ok: false, reason: '이미 건물이 있는 부지예요.' }
  return costCheck(s, BUILDINGS[type].levels[0].cost)
}

export function place(s, world, type, lotId) {
  const c = canPlace(s, type, lotId)
  if (!c.ok) return c
  pay(s, BUILDINGS[type].levels[0].cost)
  const b = { id: 'b' + s.nextBuilding++, type, lot: lotId, level: 0, build: { to: 1, progress: 0 } }
  s.buildings.push(b)
  refresh(world, s)
  // anyone walking finds a new way around the site (or off it)
  for (const m of s.manos) m._path = m._goal = null
  return { ok: true, building: b }
}

export function canUpgrade(s, bId) {
  const b = s.buildings.find((x) => x.id === bId)
  if (!b) return { ok: false, reason: '건물을 찾을 수 없어요.' }
  if (b.build) return { ok: false, reason: '공사가 끝난 뒤에 업그레이드할 수 있어요.' }
  if (b.level >= 3) return { ok: false, reason: '이미 최고 레벨이에요.' }
  return costCheck(s, BUILDINGS[b.type].levels[b.level].cost)
}

export function upgrade(s, bId) {
  const c = canUpgrade(s, bId)
  if (!c.ok) return c
  const b = s.buildings.find((x) => x.id === bId)
  pay(s, BUILDINGS[b.type].levels[b.level].cost)
  b.build = { to: b.level + 1, progress: 0 }
  return { ok: true, building: b }
}

export function canUnlock(s, zoneId) {
  const z = ZONES[zoneId]
  if (!z || !z.cost) return { ok: false, reason: '열 수 없는 구역이에요.' }
  if (s.zones[zoneId]) return { ok: false, reason: '이미 열린 구역이에요.' }
  if (!s.zones[z.needs]) return { ok: false, reason: `먼저 ${ZONES[z.needs].name}을(를) 열어야 해요.` }
  return costCheck(s, z.cost)
}

export function unlock(s, world, zoneId) {
  const c = canUnlock(s, zoneId)
  if (!c.ok) return c
  pay(s, ZONES[zoneId].cost)
  s.zones[zoneId] = true
  refresh(world, s)
  return { ok: true }
}

function costCheck(s, cost) {
  const over = overCap(s, cost)
  if (Object.keys(over).length) return { ok: false, over, reason: '보관 한도보다 비싸요. 저장소를 늘려 주세요.' }
  const miss = lacking(s, cost)
  if (Object.keys(miss).length) return { ok: false, missing: miss, reason: '자원이 부족해요.' }
  return { ok: true }
}

export const buildWork = (b) => BUILDINGS[b.type].levels[b.build.to - 1].work
export const buildSlots = (b) => BUILDINGS[b.type].levels[b.build.to - 1].builders

// ── job choice ───────────────────────────────────────────────────────────────

const tileXY = (m) => [tileOf(m.x), tileOf(m.y)]
const dist2 = (m, [x, y]) => (center(x) - m.x) ** 2 + (center(y) - m.y) ** 2

// nearest stand (by real path) out of a few close candidates
function route(world, m, stands, taken = []) {
  const [sx, sy] = tileXY(m)
  const free = stands.filter(([x, y]) => !taken.some(([a, b]) => a === x && b === y))
  const pool = (free.length ? free : stands).slice().sort((a, b) => dist2(m, a) - dist2(m, b)).slice(0, 4)
  let best = null
  for (const st of pool) {
    const p = findPath(world, sx, sy, st[0], st[1])
    const len = pathLength(p)
    if (len < (best ? best.len : Infinity)) best = { stand: st, path: p, len }
  }
  return best
}

const workers = (s, kind, key, val, except) =>
  s.manos.filter((o) => o !== except && o.task && o.task.kind === kind && o.task[key] === val)

function takenStands(s, kind, key, val, except) {
  return workers(s, kind, key, val, except)
    .map((o) => o.task.stand)
    .filter(Boolean)
}

function pickSite(s, world, m) {
  const sites = s.buildings.filter((b) => b.build)
  if (!sites.length) return null
  const builders = s.manos.filter((o) => o !== m && o.task && o.task.kind === 'build').length
  if (s.manos.length >= 2 && builders >= s.manos.length - 1) return null // keep someone gathering
  const open = sites
    .map((b) => ({ b, n: workers(s, 'build', 'b', b.id, m).length }))
    .filter(({ b, n }) => n < buildSlots(b))
    .sort((a, b) => a.n - b.n)
  for (const { b } of open) {
    const r = route(world, m, lotStands(world, b.lot), takenStands(s, 'build', 'b', b.id, m))
    if (r) return { b, ...r }
  }
  return null
}

function incoming(s, res, except) {
  let n = 0
  for (const o of s.manos) {
    if (o === except) continue
    if (o.carry && o.carry.res === res) n += o.carry.n
    else if (o.task && o.task.kind === 'gather' && NODES[NODE[o.task.node].kind].res === res) n += carryOf(s, res)
  }
  return n
}

function pickGather(s, world, m) {
  const cap = caps(s)
  const last = m.task && m.task.kind === 'gather' ? m.task.node : m._lastNode
  const options = []
  for (const res of RESOURCES) {
    if (s.res[res] >= cap[res]) continue
    if (res === 'stardust') {
      const n = s.manos.filter((o) => o !== m && o.task && o.task.kind === 'gather' && NODE[o.task.node].kind === 'crystal').length
      if (n >= Math.max(1, Math.ceil(s.manos.length * STARDUST_SHARE))) continue
    }
    const ratio = (s.res[res] + incoming(s, res, m)) / cap[res]
    if (ratio >= 1) continue
    options.push({ res, ratio })
  }
  options.sort((a, b) => a.ratio - b.ratio)
  for (const { res } of options) {
    const kind = GATHER[res].node
    const carry = carryOf(s, res)
    const nodes = Object.keys(NODE)
      .filter((id) => NODE[id].kind === kind && s.zones[zoneOfRow(NODE[id].y)])
      .map((id) => ({ id, gs: workers(s, 'gather', 'node', id, m).length }))
      .filter(({ id, gs }) => gs < NODES[kind].slots && s.nodes[id] - gs * carry >= 1)
      // stick with the last node a little, then nearest
      .sort((a, b) => (a.id === last ? -1e6 : 0) + dist2(m, [NODE[a.id].x, NODE[a.id].y]) - ((b.id === last ? -1e6 : 0) + dist2(m, [NODE[b.id].x, NODE[b.id].y])))
      .slice(0, 4)
    for (const { id } of nodes) {
      const r = route(world, m, nodeStands(world, id), takenStands(s, 'gather', 'node', id, m))
      if (r) return { node: id, res, ...r }
    }
  }
  return null
}

// drop-off points that accept a resource
export function drops(s, world, res) {
  const out = campStands(world)
  for (const b of s.buildings) {
    if (!done(b)) continue
    const def = BUILDINGS[b.type]
    if (b.type === 'storage' || def.gathers === res) out.push(...lotStands(world, b.lot))
  }
  return out
}

function setPath(world, m, stand, path) {
  const [sx, sy] = tileXY(m)
  m._path = smooth(world, sx, sy, path) || []
  // a small personal offset so a crowd does not stack on one pixel
  const j = ((m.id * 37) % 11) - 5
  m._goal = { x: center(stand[0]) + j, y: center(stand[1]) + (((m.id * 53) % 7) - 3) }
}

export function decide(s, world, m, out) {
  m._lastNode = m.task && m.task.node ? m.task.node : m._lastNode
  m.task = null
  m._path = null

  if (m.carry) return startDeliver(s, world, m, out)

  const site = pickSite(s, world, m)
  if (site) {
    m.task = { kind: 'build', b: site.b.id, phase: 'go', stand: site.stand, t: 0 }
    setPath(world, m, site.stand, site.path)
    return
  }
  const job = pickGather(s, world, m)
  if (job) {
    m.task = { kind: 'gather', node: job.node, phase: 'go', stand: job.stand, t: 0 }
    setPath(world, m, job.stand, job.path)
    return
  }
  idle(s, world, m)
}

function idle(s, world, m) {
  const r = rand(s)
  if (r < 0.45) {
    // stroll somewhere nearby in an open zone
    const [sx, sy] = tileXY(m)
    for (let i = 0; i < 6; i++) {
      const x = sx + Math.round((rand(s) - 0.5) * 8)
      const y = sy + Math.round((rand(s) - 0.5) * 6)
      if (!walkable(world, x, y)) continue
      const p = findPath(world, sx, sy, x, y)
      if (!p) continue
      m.task = { kind: 'wander', phase: 'go', t: 0 }
      setPath(world, m, [x, y], p)
      return
    }
  }
  const pose = r < 0.7 ? 'sit' : r < 0.9 ? 'sleep' : 'wave'
  m.task = { kind: 'rest', pose, t: MANO.restMin + rand(s) * (MANO.restMax - MANO.restMin) }
}

function startDeliver(s, world, m) {
  const r = route(world, m, drops(s, world, m.carry.res))
  if (!r) {
    m.task = { kind: 'rest', pose: 'sit', t: 2 }
    return
  }
  // remember the node the load came from: she goes back there next
  m.task = { kind: 'deliver', phase: 'go', stand: r.stand, t: 0 }
  if (m._lastNode) m.task.node = m._lastNode
  setPath(world, m, r.stand, r.path)
}

// ── per-frame update ─────────────────────────────────────────────────────────

// walk along the path; true once at the goal
function walk(world, m, dt) {
  if (!m._goal) return true
  let step = MANO.speed * dt
  while (step > 0) {
    const next = m._path && m._path.length ? m._path[0] : null
    const tx = next && m._path.length > 1 ? center(next[0]) : m._goal.x
    const ty = next && m._path.length > 1 ? center(next[1]) : m._goal.y
    const dx = tx - m.x
    const dy = ty - m.y
    const d = Math.hypot(dx, dy)
    if (d > 0.01) {
      m._vx = dx / d
      m._vy = dy / d
    }
    if (d <= step) {
      m.x = tx
      m.y = ty
      step -= d
      if (m._path && m._path.length) m._path.shift()
      if (!m._path || !m._path.length) {
        if (Math.abs(m.x - m._goal.x) < 0.5 && Math.abs(m.y - m._goal.y) < 0.5) {
          m._goal = null
          m._vx = m._vy = 0
          return true
        }
      }
    } else {
      m.x += (dx / d) * step
      m.y += (dy / d) * step
      step = 0
    }
  }
  return false
}

// after loading (or when a path went missing) find the way again
function rePath(s, world, m) {
  const t = m.task
  if (!t || !t.stand) return false
  const [sx, sy] = tileXY(m)
  if (!walkable(world, t.stand[0], t.stand[1])) return false
  const p = findPath(world, sx, sy, t.stand[0], t.stand[1])
  if (!p) return false
  setPath(world, m, t.stand, p)
  return true
}

export function tick(s, world, dt, out = []) {
  // resource nodes slowly grow back
  for (const id in s.nodes) {
    const k = NODES[NODE[id].kind]
    if (s.nodes[id] < k.max) s.nodes[id] = Math.min(k.max, s.nodes[id] + k.regen * dt)
  }

  // new residents while there is room
  if (s.manos.length < homes(s)) {
    s.arrivalT += dt
    if (s.arrivalT >= MANO.arriveEvery) {
      s.arrivalT = 0
      const m = { id: s.nextMano++, x: ENTRY.x, y: ENTRY.y, carry: null, task: null }
      s.manos.push(m)
      const c = campStands(world)
      const p = c.length ? findPath(world, tileOf(m.x), tileOf(m.y), c[0][0], c[0][1]) : null
      if (p) {
        m.task = { kind: 'arrive', phase: 'go', stand: c[0], t: 0 }
        setPath(world, m, c[0], p)
      }
      out.push({ type: 'arrive', id: m.id, x: m.x, y: m.y })
    }
  } else s.arrivalT = 0

  for (const m of s.manos) step(s, world, m, dt, out)
  s.cap = caps(s)
}

function step(s, world, m, dt, out) {
  const t = m.task
  if (!t) return decide(s, world, m, out)

  if (t.kind === 'rest') {
    t.t -= dt
    if (t.t <= 0) decide(s, world, m, out)
    return
  }

  if (t.phase === 'go') {
    if (!m._goal && !m._path) {
      if (!rePath(s, world, m) && t.stand) {
        // the way is gone (a building went up): choose again
        return decide(s, world, m, out)
      }
    }
    // the job may have vanished while walking there
    if (t.kind === 'build' && !s.buildings.some((b) => b.id === t.b && b.build)) return decide(s, world, m, out)
    if (!walk(world, m, dt)) return
    if (t.kind === 'wander') {
      m.task = { kind: 'rest', pose: rand(s) < 0.6 ? 'sit' : 'wave', t: 1.5 + rand(s) * 3 }
      return
    }
    if (t.kind === 'arrive') {
      m.task = { kind: 'rest', pose: 'cheer', t: 1.6 }
      return
    }
    t.phase = t.kind === 'deliver' ? 'drop' : 'work'
    t.t = 0
    // face the work
    const tx = t.kind === 'gather' ? NODE[t.node].x : t.kind === 'build' ? LOT[s.buildings.find((b) => b.id === t.b).lot].x + 1 : null
    if (tx !== null) m._face = center(tx) >= m.x ? 1 : -1
  }

  if (t.kind === 'deliver' && t.phase === 'drop') {
    const { res, n } = m.carry
    const room = Math.max(0, caps(s)[res] - s.res[res])
    const add = Math.min(n, room)
    s.res[res] += add
    s.stats.gathered[res] += add
    out.push({ type: 'deliver', res, n: add, lost: n - add, x: m.x, y: m.y - 30 })
    m.carry = null
    return decide(s, world, m, out)
  }

  if (t.kind === 'gather' && t.phase === 'work') {
    const res = NODES[NODE[t.node].kind].res
    t.t += dt
    if (t.t < workOf(s, res)) return
    const n = Math.min(carryOf(s, res), Math.floor(s.nodes[t.node]))
    if (n < 1) return decide(s, world, m, out)
    s.nodes[t.node] -= n
    m.carry = { res, n }
    out.push({ type: 'gather', res, x: center(NODE[t.node].x), y: center(NODE[t.node].y) })
    m._lastNode = t.node
    return startDeliver(s, world, m, out)
  }

  if (t.kind === 'build' && t.phase === 'work') {
    const b = s.buildings.find((x) => x.id === t.b)
    if (!b || !b.build) return decide(s, world, m, out)
    b.build.progress += dt
    t.t += dt
    if (b.build.progress >= buildWork(b)) {
      b.level = b.build.to
      b.build = null
      s.stats.built++
      s.cap = caps(s)
      refresh(world, s)
      out.push({ type: 'built', b: b.id, lot: b.lot, level: b.level })
      for (const o of s.manos) {
        if (o.task && o.task.kind === 'build' && o.task.b === b.id) {
          o.task = { kind: 'rest', pose: 'cheer', t: 1.2 }
          o._path = o._goal = null
        }
      }
    }
  }
}

// what a Mano is doing, in words (for the residents list)
export function activity(m) {
  const t = m.task
  if (!t) return '생각 중'
  if (t.kind === 'gather') {
    const res = NODES[NODE[t.node].kind].res
    const verb = { wood: '나무하러', stone: '돌 캐러', stardust: '별가루 캐러' }[res]
    return t.phase === 'work' ? { wood: '나무하는 중', stone: '돌 캐는 중', stardust: '별가루 캐는 중' }[res] : `${verb} 가는 중`
  }
  if (t.kind === 'deliver') return `${{ wood: '나무', stone: '돌', stardust: '별가루' }[m.carry ? m.carry.res : 'wood']} 나르는 중`
  if (t.kind === 'build') return t.phase === 'work' ? '건설하는 중' : '공사장으로 가는 중'
  if (t.kind === 'wander') return '산책 중'
  if (t.kind === 'arrive') return '이사 오는 중'
  if (t.kind === 'rest') return { sit: '쉬는 중', sleep: '꾸벅꾸벅 조는 중', wave: '쉬는 중', cheer: '신난 중' }[t.pose] || '쉬는 중'
  return '쉬는 중'
}
