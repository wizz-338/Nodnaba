// MANO COLONY — game rules. Plain data in, plain data out: no drawing, no DOM.
//
// Manos loop: pick a job → walk → work → carry → drop off → pick again.
// Construction is real work: every Mano standing at the site and hammering
// adds MANO.workRate per second, so three Manos build three times as fast;
// nobody on site, no progress. Fields starting with "_" on a Mano (path,
// animation) are rebuilt after loading and never saved.

import {
  BUILDINGS,
  CAMP_SIZE,
  DECOR,
  DEFAULT_SEED,
  DEMOLISH_REFUND,
  FLOORS,
  GATHER,
  MANO,
  MAX_MANOS,
  NODES,
  RESOURCES,
  START,
  STARDUST_SHARE,
  ZONES,
} from './config.js'
import {
  around,
  createWorld,
  decorSize,
  findPath,
  findPathAny,
  footprint,
  idx,
  inMap,
  nodeOf,
  pathLength,
  reach,
  refresh,
  walkable,
  zoneAt,
} from './world.js'
import { josa } from './text.js'

// ── helpers ─────────────────────────────────────────────────────────────────

export function rand(s) {
  let x = s.rs | 0 || 1
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  s.rs = x >>> 0
  return s.rs / 2 ** 32
}

const add = (a, b, k = 1) => {
  for (const r of RESOURCES) if (b[r]) a[r] = (a[r] || 0) + b[r] * k
  return a
}
const half = (c) => Object.fromEntries(RESOURCES.filter((r) => c[r]).map((r) => [r, Math.floor(c[r] * DEMOLISH_REFUND)]))
const pay = (s, cost) => {
  for (const r of RESOURCES) if (cost[r]) s.res[r] = Math.max(0, s.res[r] - cost[r])
}
// refunds may push stock over the storage limit: that is allowed (nothing is
// thrown away), new deliveries of that resource simply pause until it drops
const refund = (s, cost) => {
  for (const r of RESOURCES) if (cost[r]) s.res[r] += cost[r]
}
export const isEmpty = (c) => !RESOURCES.some((r) => c[r])

export function newGame(now = Date.now(), seed = DEFAULT_SEED) {
  const s = {
    seed,
    res: { ...START.res },
    cap: { ...START.baseCap },
    buildings: [],
    decor: [],
    floors: {},
    inventory: {},
    stored: [],
    nodes: {},
    manos: [],
    zones: { C: true },
    nextId: 1,
    arrivalT: 0,
    rs: ((now % 2147483647) >>> 0) || 7,
    tutorial: { step: 0, done: false },
    notice: { storage: false },
    settings: { effects: true },
    stats: { gathered: { wood: 0, stone: 0, stardust: 0 }, built: 0 },
    clock: { createdAt: now, simAt: now, savedAt: 0 },
  }
  const c = START.camp
  // a small starting square: a cobble cross, a signpost and a flower bed;
  // the rest of the land is left for the player
  const lay = (x, y) => (s.floors[idx(x, y)] = ['cobble', 0])
  for (let d = -3; d <= 4; d++) {
    lay(c.x + d, c.y + 3)
    lay(c.x + 3, c.y + d)
  }
  for (let d = 4; d <= 6; d++) {
    lay(c.x + d, c.y + 3)
    lay(c.x + 3, c.y + d)
  }
  s.decor.push({ id: 'd' + s.nextId++, type: 'signpost', x: c.x + 4, y: c.y + 4, dir: 0 })
  s.decor.push({ id: 'd' + s.nextId++, type: 'flowerbed', x: c.x - 3, y: c.y + 4, dir: 0 })
  s.decor.push({ id: 'd' + s.nextId++, type: 'lamp_small', x: c.x + 2, y: c.y + 2, dir: 0 })
  for (let i = 0; i < START.manos; i++) s.manos.push({ id: s.nextId++, x: c.x + 2.5, y: c.y + 0.5 + i, carry: null, task: null })
  const w = createWorld(seed)
  for (const n of w.gen.nodes) s.nodes[n.id] = NODES[n.kind].max
  s.cap = caps(s)
  return s
}

export function worldFor(s) {
  const w = createWorld(s.seed)
  refresh(w, s)
  return w
}

// ── derived values ──────────────────────────────────────────────────────────

const done = (b) => b.level >= 1

export function caps(s) {
  const c = { ...START.baseCap }
  for (const b of s.buildings) if (b.type === 'storage' && done(b)) add(c, BUILDINGS.storage.levels[b.level - 1].cap)
  return c
}

export function homes(s) {
  let n = START.baseHomes
  for (const b of s.buildings) if (b.type === 'house' && done(b)) n += BUILDINGS.house.levels[b.level - 1].homes
  return Math.min(n, MAX_MANOS)
}

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
  for (const r of RESOURCES) if ((cost[r] || 0) > s.res[r]) out[r] = Math.ceil((cost[r] || 0) - s.res[r])
  return out
}
function overCap(s, cost) {
  const c = caps(s)
  const out = {}
  for (const r of RESOURCES) if ((cost[r] || 0) > c[r]) out[r] = c[r]
  return out
}
function costCheck(s, cost) {
  const over = overCap(s, cost)
  if (Object.keys(over).length) return { ok: false, over, reason: '보관 한도보다 비싸요. 저장소를 늘려 주세요.' }
  const miss = lacking(s, cost)
  if (Object.keys(miss).length) return { ok: false, missing: miss, reason: '자원이 부족해요.' }
  return { ok: true }
}

export const buildWork = (b) => BUILDINGS[b.type].levels[b.build.to - 1].work
export const buildSlots = (b) => BUILDINGS[b.type].levels[b.build.to - 1].slots
export const findObj = (s, id) => (id[0] === 'b' ? s.buildings.find((b) => b.id === id) : s.decor.find((d) => d.id === id)) || null

// ── placement checks (run only while placing) ───────────────────────────────

function cellsOf(kind, type, x, y) {
  const [w, h] = kind === 'building' ? BUILDINGS[type].size : decorSize(type)
  const out = []
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) out.push([xx, yy])
  return out
}

// Can `kind/type` stand with its top corner at (x, y)?  ignore: id of the
// object being moved (its own tiles count as free).
// Returns { ok, reason, cells: [[x, y, ok], …] }.
export function checkPlace(s, world, kind, type, x, y, ignore = null) {
  const def = kind === 'building' ? BUILDINGS[type] : DECOR[type]
  const cells = cellsOf(kind, type, x, y)
  let reason = ''
  const marks = cells.map(([cx, cy]) => {
    if (!inMap(cx, cy)) return [cx, cy, false, '지도 밖이에요.']
    const i = idx(cx, cy)
    if (!world.open[i]) return [cx, cy, false, '아직 잠긴 구역이에요.']
    const o = world.occ[i]
    // a gate may replace a fence piece (the fence goes back into the box)
    const fenceUnderGate = type === 'gate' && o && o.kind === 'decor' && o.type === 'fence'
    if (o && o.id !== ignore && !fenceUnderGate) return [cx, cy, false, o.kind === 'node' ? '나무·바위·수정 위에는 놓을 수 없어요.' : '다른 것이 놓여 있어요.']
    const wet = world.gen.water[i] && !world.bridge[i]
    if (def.waterOnly && !world.gen.water[i]) return [cx, cy, false, '물 위에만 놓을 수 있어요.']
    if (wet && !def.water) return [cx, cy, false, '물 위에는 놓을 수 없어요.']
    if (kind === 'building' && world.gen.water[i]) return [cx, cy, false, '물 위에는 지을 수 없어요.']
    return [cx, cy, true, '']
  })
  const bad = marks.find((m) => !m[2])
  if (bad) reason = bad[3]
  if (!bad && def.bridge) {
    const wet = cells.some(([cx, cy]) => world.gen.water[idx(cx, cy)])
    if (!wet) reason = '다리는 물을 건너도록 놓아 주세요.'
  }
  if (!reason && (kind === 'building' || def.blocks)) reason = accessProblem(s, world, cells, ignore, kind === 'building' ? { x, y } : null)
  return { ok: !reason, reason, cells: marks.map(([a, b, c]) => [a, b, c && !reason]) }
}

// Would blocking these tiles cut off a building entrance, the camp or a
// resource that can be reached today?
function accessProblem(s, world, cells, ignore, newBuilding) {
  const extra = new Set(cells.map(([x, y]) => idx(x, y)))
  let allow = null
  if (ignore) {
    const o = findObj(s, ignore)
    if (o) allow = new Set(cellsOf(ignore[0] === 'b' ? 'building' : 'decor', o.type, o.x, o.y).map(([x, y]) => idx(x, y)))
  }
  const after = reach(world, extra, allow)
  const before = reach(world, null, null)
  const ok = (o) => around(world, o, true).some(([x, y]) => inMap(x, y) && after[idx(x, y)])
  if (newBuilding && !ok({ kind: 'building', x: newBuilding.x, y: newBuilding.y })) return '입구 쪽이 막혀서 마노가 들어갈 수 없어요.'
  for (const b of s.buildings) {
    if (b.id === ignore) continue
    const was = around(world, { kind: 'building', x: b.x, y: b.y }, true).some(([x, y]) => inMap(x, y) && before[idx(x, y)])
    if (was && !ok({ kind: 'building', x: b.x, y: b.y })) return `${BUILDINGS[b.type].name} 입구가 막혀요.`
  }
  for (const n of world.gen.nodes) {
    if (!world.open[idx(n.x, n.y)]) continue
    const near = (t) => around(world, { kind: 'node', x: n.x, y: n.y }, true).some(([x, y]) => inMap(x, y) && t[idx(x, y)])
    if (near(before) && !near(after)) return '나무·바위로 가는 길이 막혀요.'
  }
  return ''
}

// ── buildings ───────────────────────────────────────────────────────────────

export function canBuild(s, world, type, x, y, stored = null) {
  const p = checkPlace(s, world, 'building', type, x, y)
  if (!p.ok || stored !== null) return p
  const c = costCheck(s, BUILDINGS[type].levels[0].cost)
  return c.ok ? p : { ...p, ok: false, reason: c.reason, missing: c.missing, over: c.over }
}

// stored = index into s.stored (a building waiting in storage: free, keeps its level)
export function build(s, world, type, x, y, stored = null) {
  const c = canBuild(s, world, type, x, y, stored)
  if (!c.ok) return c
  let b
  if (stored !== null) {
    const st = s.stored[stored]
    if (!st || st.type !== type) return { ok: false, reason: '보관함에 그 건물이 없어요.' }
    s.stored.splice(stored, 1)
    b = { id: 'b' + s.nextId++, type, x, y, level: st.level, spent: { ...st.spent }, build: null }
    if (st.build) b.build = { ...st.build, crew: Math.min(2, s.manos.length) }
  } else {
    const cost = BUILDINGS[type].levels[0].cost
    pay(s, cost)
    b = { id: 'b' + s.nextId++, type, x, y, level: 0, spent: { ...cost }, build: { to: 1, progress: 0, crew: Math.min(2, s.manos.length), paid: { ...cost } } }
  }
  s.buildings.push(b)
  changed(s, world)
  return { ok: true, building: b }
}

export function canUpgrade(s, id) {
  const b = s.buildings.find((x) => x.id === id)
  if (!b) return { ok: false, reason: '건물을 찾을 수 없어요.' }
  if (b.build) return { ok: false, reason: '공사가 끝난 뒤에 업그레이드할 수 있어요.' }
  if (b.level >= 3) return { ok: false, reason: '이미 최고 레벨이에요.' }
  return costCheck(s, BUILDINGS[b.type].levels[b.level].cost)
}

export function upgrade(s, id) {
  const c = canUpgrade(s, id)
  if (!c.ok) return c
  const b = s.buildings.find((x) => x.id === id)
  const cost = BUILDINGS[b.type].levels[b.level].cost
  pay(s, cost)
  add(b.spent, cost)
  b.build = { to: b.level + 1, progress: 0, crew: Math.min(2, s.manos.length), paid: { ...cost } }
  return { ok: true, building: b }
}

export const maxCrew = (s, world, b) => (b.build ? Math.min(buildSlots(b), around(world, { kind: 'building', x: b.x, y: b.y }).length, s.manos.length) : 0)

export function setCrew(s, world, id, n) {
  const b = s.buildings.find((x) => x.id === id)
  if (!b || !b.build) return { ok: false }
  b.build.crew = Math.max(0, Math.min(n, maxCrew(s, world, b)))
  return { ok: true, crew: b.build.crew }
}

// What removing a building would give back and change (for the confirm box).
export function demolishPreview(s, id) {
  const b = s.buildings.find((x) => x.id === id)
  if (!b) return null
  const before = { homes: homes(s), cap: caps(s) }
  let back
  let kind
  if (b.level === 0) {
    kind = 'cancel' // a site that was never finished: everything back
    back = { ...b.build.paid }
  } else {
    kind = 'demolish' // half of what was spent; a running upgrade comes back in full
    const upg = b.build ? b.build.paid : {}
    const rest = add({ ...b.spent }, upg, -1)
    back = add(half(rest), upg)
  }
  const without = { ...s, buildings: s.buildings.filter((x) => x !== b) }
  const after = { homes: homes(without), cap: caps(without) }
  return { kind, refund: back, before, after, pop: s.manos.length, res: { ...s.res } }
}

export function demolish(s, world, id) {
  const p = demolishPreview(s, id)
  if (!p) return { ok: false, reason: '건물을 찾을 수 없어요.' }
  s.buildings = s.buildings.filter((b) => b.id !== id)
  refund(s, p.refund)
  release(s, (t) => t.b === id)
  changed(s, world)
  return { ok: true, ...p }
}

// stop a running upgrade: what it cost comes back in full, the level stays
export function cancelUpgrade(s, world, id) {
  const b = s.buildings.find((x) => x.id === id)
  if (!b || !b.build || b.level === 0) return { ok: false, reason: '진행 중인 업그레이드가 없어요.' }
  const back = { ...b.build.paid }
  add(b.spent, back, -1)
  b.build = null
  refund(s, back)
  release(s, (t) => t.b === id)
  return { ok: true, refund: back }
}

// ── decorations ─────────────────────────────────────────────────────────────

export const owned = (s, type) => s.inventory[type] || 0

export function canDecorate(s, world, type, x, y) {
  const p = checkPlace(s, world, 'decor', type, x, y)
  if (!p.ok || owned(s, type) > 0) return p
  const c = costCheck(s, DECOR[type].cost)
  return c.ok ? p : { ...p, ok: false, reason: c.reason, missing: c.missing }
}

// Place one decoration: from the storage box if there is one, else bought.
export function decorate(s, world, type, x, y, dir = 0) {
  const c = canDecorate(s, world, type, x, y)
  if (!c.ok) return c
  const fromBox = owned(s, type) > 0
  if (fromBox) s.inventory[type]--
  else pay(s, DECOR[type].cost)
  if (type === 'gate') {
    const f = s.decor.find((o) => o.type === 'fence' && o.x === x && o.y === y)
    if (f) {
      s.decor = s.decor.filter((o) => o !== f)
      s.inventory.fence = owned(s, 'fence') + 1
    }
  }
  const d = { id: 'd' + s.nextId++, type, x, y, dir: DECOR[type].dirs ? dir % DECOR[type].dirs.length : 0 }
  s.decor.push(d)
  changed(s, world)
  return { ok: true, decor: d, fromBox }
}

// Put a decoration back into the storage box (free to place again later).
export function stow(s, world, id) {
  const d = s.decor.find((x) => x.id === id)
  if (!d) return { ok: false, reason: '장식을 찾을 수 없어요.' }
  s.decor = s.decor.filter((x) => x !== d)
  s.inventory[d.type] = owned(s, d.type) + 1
  release(s, (t) => t.seat === id)
  changed(s, world)
  return { ok: true, type: d.type }
}

// ── lines: floors and fences ────────────────────────────────────────────────

// Tiles of a straight-then-turn line from a to b along the grid axes.
export function lineCells(a, b) {
  const out = []
  const sx = Math.sign(b.x - a.x)
  const sy = Math.sign(b.y - a.y)
  for (let x = a.x; ; x += sx || 1) {
    out.push([x, a.y])
    if (x === b.x) break
  }
  for (let y = a.y + (sy || 1); sy && y !== b.y + sy; y += sy) out.push([b.x, y])
  return out
}

export function rectCells(a, b) {
  const out = []
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push([x, y])
  return out
}

function floorOk(world, x, y) {
  if (!inMap(x, y)) return '지도 밖이에요.'
  const i = idx(x, y)
  if (!world.open[i]) return '아직 잠긴 구역이에요.'
  if (world.gen.water[i]) return '물 위에는 깔 수 없어요.'
  const o = world.occ[i]
  if (o && (o.kind === 'building' || o.kind === 'node' || o.kind === 'camp')) return '건물·자원 아래에는 깔 수 없어요.'
  return ''
}

// Plan laying `type` (or erasing, type = null) on cells: what it costs and
// gives back. Painting the same floor again costs nothing.
export function planFloors(s, world, type, cells) {
  const marks = []
  const cost = {}
  const back = {}
  let count = 0
  for (const [x, y] of cells) {
    const why = floorOk(world, x, y)
    const cur = inMap(x, y) ? s.floors[idx(x, y)] : null
    if (why) {
      marks.push([x, y, false])
      continue
    }
    if (type === null) {
      marks.push([x, y, !!cur])
      if (cur) {
        count++
        if (cur[1]) add(back, FLOORS[cur[0]].cost)
      }
      continue
    }
    if (cur && cur[0] === type) {
      marks.push([x, y, true])
      continue
    }
    count++
    marks.push([x, y, true])
    add(cost, FLOORS[type].cost)
    if (cur && cur[1]) add(back, FLOORS[cur[0]].cost)
  }
  const net = add({ ...cost }, back, -1)
  const need = Object.fromEntries(RESOURCES.filter((r) => (net[r] || 0) > 0).map((r) => [r, net[r]]))
  const miss = lacking(s, need)
  const ok = count > 0 && !Object.keys(miss).length
  return { ok, count, cost, refund: back, cells: marks, missing: miss, reason: !count ? '바꿀 칸이 없어요.' : Object.keys(miss).length ? '자원이 부족해요.' : '' }
}

export function paintFloors(s, world, type, cells) {
  const p = planFloors(s, world, type, cells)
  if (!p.ok) return p
  for (const [x, y, ok] of p.cells) {
    if (!ok) continue
    const i = idx(x, y)
    const cur = s.floors[i]
    if (type === null) {
      if (cur) delete s.floors[i]
      continue
    }
    if (cur && cur[0] === type) continue
    s.floors[i] = [type, isEmpty(FLOORS[type].cost) ? 0 : 1]
  }
  refund(s, p.refund)
  pay(s, p.cost)
  changed(s, world)
  return { ok: true, ...p }
}

// Fences along a line: from the storage box first, then bought.
export function planFence(s, world, cells) {
  const marks = []
  let count = 0
  const free = []
  for (const [x, y] of cells) {
    const p = inMap(x, y) ? checkPlace(s, world, 'decor', 'fence', x, y) : { ok: false }
    const ok = p.ok || (inMap(x, y) && world.fence[idx(x, y)])
    marks.push([x, y, ok])
    if (p.ok) {
      count++
      free.push([x, y])
    }
  }
  // the line as a whole must not cut anything off
  const reason = free.length ? accessProblem(s, world, free, null, null) : ''
  const fromBox = Math.min(owned(s, 'fence'), count)
  const cost = add({}, DECOR.fence.cost, count - fromBox)
  const miss = lacking(s, cost)
  const why = reason || (!count ? '울타리를 놓을 칸이 없어요.' : Object.keys(miss).length ? '자원이 부족해요.' : '')
  return { ok: !why, reason: why, count, fromBox, cost, missing: miss, cells: marks.map(([a, b, c]) => [a, b, c && !reason]), free }
}

export function placeFence(s, world, cells) {
  const p = planFence(s, world, cells)
  if (!p.ok) return p
  s.inventory.fence = owned(s, 'fence') - p.fromBox
  pay(s, p.cost)
  for (const [x, y] of p.free) s.decor.push({ id: 'd' + s.nextId++, type: 'fence', x, y, dir: 0 })
  changed(s, world)
  return { ok: true, ...p }
}

// ── moving ──────────────────────────────────────────────────────────────────

export function canMove(s, world, id, x, y) {
  const o = findObj(s, id)
  if (!o) return { ok: false, reason: '대상을 찾을 수 없어요.' }
  if (id[0] === 'b' && o.build && o.level === 0) return { ok: false, reason: '공사 중인 건물은 옮길 수 없어요. 완성된 뒤에 옮겨 주세요.' }
  if (id[0] === 'b' && o.build) return { ok: false, reason: '업그레이드 중에는 옮길 수 없어요.' }
  return checkPlace(s, world, id[0] === 'b' ? 'building' : 'decor', o.type, x, y, id)
}

// Free; level, stock and everything else stay. Nothing changes until this
// is called, so cancelling a move just never calls it.
export function move(s, world, id, x, y, dir = null) {
  const c = canMove(s, world, id, x, y)
  if (!c.ok) return c
  const o = findObj(s, id)
  o.x = x
  o.y = y
  if (dir !== null && o.dir !== undefined && DECOR[o.type] && DECOR[o.type].dirs) o.dir = dir % DECOR[o.type].dirs.length
  release(s, (t) => t.seat === id)
  changed(s, world)
  return { ok: true }
}

export function turn(s, world, id) {
  const d = s.decor.find((x) => x.id === id)
  if (!d || !DECOR[d.type].dirs) return { ok: false, reason: '방향을 바꿀 수 없는 장식이에요.' }
  d.dir = (d.dir + 1) % DECOR[d.type].dirs.length
  return { ok: true }
}

// ── zones ───────────────────────────────────────────────────────────────────

export function canUnlock(s, z) {
  const zone = ZONES[z]
  if (!zone || !zone.cost) return { ok: false, reason: '열 수 없는 구역이에요.' }
  if (s.zones[z]) return { ok: false, reason: '이미 열린 구역이에요.' }
  if (!zone.needs.some((n) => s.zones[n])) return { ok: false, reason: `먼저 ${josa(zone.needs.map((n) => ZONES[n].name).join(' 또는 '), '을', '를')} 열어야 해요.` }
  return costCheck(s, zone.cost)
}

export function unlock(s, world, z) {
  const c = canUnlock(s, z)
  if (!c.ok) return c
  pay(s, ZONES[z].cost)
  s.zones[z] = true
  changed(s, world)
  return { ok: true }
}

// ── after the map changed: refresh grids, re-route walkers ──────────────────

function changed(s, world) {
  refresh(world, s)
  // only walkers whose way is now blocked look for a new one (not all of
  // them at once, which would be a burst of searches with many residents)
  for (const m of s.manos) {
    if (m._path && m._path.some(([x, y]) => !walkable(world, x, y))) {
      m._path = null
      m._goal = null
    }
  }
  s.cap = caps(s)
}

// cancel tasks matching pred (their Mano picks a new job next tick)
function release(s, pred) {
  for (const m of s.manos) if (m.task && pred(m.task)) {
    m.task = null
    m._path = m._goal = null
  }
}

// ── jobs ────────────────────────────────────────────────────────────────────

const tile = (v) => Math.floor(v)
const d2 = (m, x, y) => (x + 0.5 - m.x) ** 2 + (y + 0.5 - m.y) ** 2

// nearest reachable stand tile among a few close candidates (one search
// toward all of them at once)
function route(s, world, m, stands, taken = []) {
  const free = stands.filter(([x, y]) => !taken.some(([a, b]) => a === x && b === y))
  const pool = (free.length ? free : stands)
    .slice()
    .sort((a, b) => d2(m, a[0], a[1]) - d2(m, b[0], b[1]))
    .slice(0, 4)
  const r = findPathAny(world, tile(m.x), tile(m.y), pool)
  return r && { stand: r.goal, path: r.path, len: pathLength(r.path) }
}

function failed(s, m, key) {
  m._fail = m._fail || {}
  m._fail[key] = s._time || 0
}
const recentlyFailed = (s, m, key) => m._fail && m._fail[key] !== undefined && (s._time || 0) - m._fail[key] < 12

const tasksOf = (s, pred, except) => s.manos.filter((o) => o !== except && o.task && pred(o.task))

function setPath(m, stand, path) {
  m._path = path || []
  const j = ((m.id * 37) % 7) / 20 - 0.15
  const k = ((m.id * 53) % 5) / 20 - 0.1
  m._goal = { x: stand[0] + 0.5 + j, y: stand[1] + 0.5 + k }
}

// Who is doing what right now, in one pass over the residents (instead of
// one pass per tree, which grows with residents × trees).
function census(s, world, except) {
  const at = new Map() // node id → stand spots of its gatherers
  const incoming = { wood: 0, stone: 0, stardust: 0 }
  let crystal = 0
  for (const o of s.manos) {
    if (o === except) continue
    if (o.carry) incoming[o.carry.res] += o.carry.n
    const t = o.task
    if (!t || t.kind !== 'gather') continue
    const nd = nodeOf(world, t.node)
    if (!nd) continue
    if (!o.carry) incoming[NODES[nd.kind].res] += carryOf(s, NODES[nd.kind].res)
    if (nd.kind === 'crystal') crystal++
    let list = at.get(t.node)
    if (!list) at.set(t.node, (list = []))
    list.push(t.spot)
  }
  return { at, incoming, crystal }
}

function pickGather(s, world, m) {
  const cap = caps(s)
  const last = m.resume || m._lastNode
  const who = census(s, world, m)
  const options = []
  for (const res of RESOURCES) {
    // full (or over-full after a storage was removed): pause this resource
    if (s.res[res] >= cap[res]) continue
    if (res === 'stardust' && who.crystal >= Math.max(1, Math.ceil(s.manos.length * STARDUST_SHARE))) continue
    const ratio = (s.res[res] + who.incoming[res]) / cap[res]
    if (ratio < 1) options.push({ res, ratio })
  }
  options.sort((a, b) => a.ratio - b.ratio)
  for (const { res } of options) {
    const kind = GATHER[res].node
    const carry = carryOf(s, res)
    const cands = []
    for (const n of world.gen.nodes) {
      if (n.kind !== kind || !world.open[idx(n.x, n.y)] || recentlyFailed(s, m, n.id)) continue
      const gs = (who.at.get(n.id) || []).length
      if (gs >= NODES[kind].slots || s.nodes[n.id] - gs * carry < 1) continue
      cands.push({ n, key: (n.id === last ? -1e6 : 0) + d2(m, n.x, n.y) })
    }
    cands.sort((a, b) => a.key - b.key)
    for (const { n } of cands.slice(0, 3)) {
      const r = route(s, world, m, around(world, { kind: 'node', x: n.x, y: n.y }), who.at.get(n.id) || [])
      if (r) return { node: n.id, ...r }
      failed(s, m, n.id)
    }
  }
  return null
}

export function drops(s, world, res) {
  const out = around(world, { kind: 'camp' })
  for (const b of s.buildings) {
    if (!done(b)) continue
    if (b.type === 'storage' || BUILDINGS[b.type].gathers === res) out.push(...around(world, { kind: 'building', x: b.x, y: b.y }))
  }
  return out
}

function startDeliver(s, world, m) {
  const r = route(s, world, m, drops(s, world, m.carry.res))
  if (!r) {
    m.task = { kind: 'rest', pose: 'stand', t: 2 }
    return
  }
  m.task = { kind: 'deliver', phase: 'go', spot: r.stand, node: m._lastNode || null }
  setPath(m, r.stand, r.path)
}

// a free seat on a bench / picnic spot near Mano
function findSeat(s, world, m) {
  const busy = new Set(s.manos.filter((o) => o !== m && o.task && o.task.seat).map((o) => o.task.seat + ':' + o.task.si))
  let best = null
  for (const d of s.decor) {
    const def = DECOR[d.type]
    if (!def.seats || recentlyFailed(s, m, d.id)) continue
    const dist = d2(m, d.x, d.y)
    if (dist > 22 * 22) continue
    def.seats.forEach((_, si) => {
      if (!busy.has(d.id + ':' + si) && (!best || dist < best.dist)) best = { d, si, dist }
    })
  }
  return best
}

const DECIDE_PER_SECOND = 240

// Standing where something was just built (or on a tile now closed in): step
// out to the nearest open tile first, or no way anywhere can be found.
function stepOut(world, m) {
  const x = tile(m.x)
  const y = tile(m.y)
  const open = (a, b) => walkable(world, a, b)
  if (open(x, y) && (open(x + 1, y) || open(x - 1, y) || open(x, y + 1) || open(x, y - 1))) return
  for (let r = 1; r <= 8; r++) {
    let best = null
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !open(x + dx, y + dy)) continue
        const d = dx * dx + dy * dy
        if (!best || d < best.d) best = { x: x + dx, y: y + dy, d }
      }
    if (best) {
      m.x = best.x + 0.5
      m.y = best.y + 0.5
      m._path = m._goal = null
      return
    }
  }
}

export function decide(s, world, m, out) {
  stepOut(world, m)
  if (m.task && m.task.node) m._lastNode = m.task.node
  m.task = null
  m._path = m._goal = null
  if (m.carry) return startDeliver(s, world, m)
  const job = pickGather(s, world, m)
  if (job) {
    m.resume = job.node
    m.task = { kind: 'gather', node: job.node, phase: 'go', spot: job.stand, t: 0 }
    setPath(m, job.stand, job.path)
    return
  }
  idle(s, world, m)
}

function idle(s, world, m) {
  const r = rand(s)
  if (r < 0.5) {
    const seat = findSeat(s, world, m)
    if (seat && goSit(s, world, m, seat)) return
  }
  if (r < 0.8) {
    const sx = tile(m.x)
    const sy = tile(m.y)
    for (let i = 0; i < 6; i++) {
      const x = sx + Math.round((rand(s) - 0.5) * 10)
      const y = sy + Math.round((rand(s) - 0.5) * 10)
      if (!walkable(world, x, y)) continue
      const p = findPath(world, sx, sy, x, y, 1500)
      if (!p) continue
      m.task = { kind: 'wander', phase: 'go' }
      setPath(m, [x, y], p)
      return
    }
  }
  m.task = { kind: 'rest', pose: rand(s) < 0.7 ? 'sit' : 'sleep', t: MANO.restMin + rand(s) * (MANO.restMax - MANO.restMin) }
}

function goSit(s, world, m, seat) {
  const r = route(s, world, m, around(world, { kind: 'decor', type: seat.d.type, x: seat.d.x, y: seat.d.y }))
  if (!r) {
    failed(s, m, seat.d.id)
    return false
  }
  m.task = { kind: 'sit', phase: 'go', seat: seat.d.id, si: seat.si, spot: r.stand }
  setPath(m, r.stand, r.path)
  return true
}

// ── crews: who builds where ─────────────────────────────────────────────────

function staffSites(s, world) {
  for (const b of s.buildings) {
    if (!b.build) continue
    const want = Math.min(b.build.crew, maxCrew(s, world, b))
    const crew = tasksOf(s, (t) => t.kind === 'build' && t.b === b.id)
    if (crew.length > want) {
      // release the ones not yet hammering first, then the farthest
      crew.sort((a, c) => (a.task.phase === 'work') - (c.task.phase === 'work') || d2(c, b.x, b.y) - d2(a, b.x, b.y))
      for (const m of crew.slice(0, crew.length - want)) {
        m.task = null
        m._path = m._goal = null
      }
      continue
    }
    if (crew.length === want) continue
    const spots = around(world, { kind: 'building', x: b.x, y: b.y })
    const taken = crew.map((m) => m.task.spot)
    const open = spots.filter(([x, y]) => !taken.some(([a, c]) => a === x && c === y))
    // work from the two sides facing the viewer while there is room there
    const front = open.filter(([x, y]) => x === b.x + 3 || y === b.y + 3)
    const free = front.length >= want - crew.length ? front : open
    const pool = s.manos
      .filter((m) => !(m.task && m.task.kind === 'build') && !recentlyFailed(s, m, b.id))
      .sort((a, c) => rank(a) - rank(c) || d2(a, b.x + 1, b.y + 1) - d2(c, b.x + 1, b.y + 1))
    let have = crew.length
    for (const m of pool) {
      if (have >= want || !free.length) break
      // leave a tile between workers when there is room, so each one shows
      const spaced = free.filter(([x, y]) => !taken.some(([a, c]) => Math.abs(a - x) <= 1 && Math.abs(c - y) <= 1))
      const r = route(s, world, m, spaced.length ? spaced : free)
      if (!r) {
        failed(s, m, b.id)
        continue
      }
      // remember the job, to go back to it when the site is done
      if (m.task && m.task.kind === 'gather') m.resume = m.task.node
      m.task = { kind: 'build', b: b.id, phase: 'go', spot: r.stand, t: 0 }
      setPath(m, r.stand, r.path)
      free.splice(free.findIndex(([x, y]) => x === r.stand[0] && y === r.stand[1]), 1)
      taken.push(r.stand)
      have++
    }
  }
}
// idle first, then gatherers not carrying, carriers last
const rank = (m) => (!m.task || ['rest', 'wander', 'sit'].includes(m.task.kind) ? 0 : m.carry ? 2 : 1)

// ── per-frame update ────────────────────────────────────────────────────────

function walk(world, m, dt) {
  if (!m._goal) return true
  let step = MANO.speed * dt
  while (step > 0) {
    const next = m._path && m._path.length ? m._path[0] : null
    if (next && !walkable(world, next[0], next[1])) {
      m._path = null // something now stands in the way: find a new way
      return false
    }
    const last = !m._path || m._path.length <= 1
    const tx = last ? m._goal.x : next[0] + 0.5
    const ty = last ? m._goal.y : next[1] + 0.5
    const dx = tx - m.x
    const dy = ty - m.y
    const d = Math.hypot(dx, dy)
    if (d > 0.001) {
      m._vx = dx / d
      m._vy = dy / d
    }
    if (d <= step) {
      m.x = tx
      m.y = ty
      step -= d
      if (m._path && m._path.length) m._path.shift()
      if (last) {
        m._goal = null
        return true
      }
    } else {
      m.x += (dx / d) * step
      m.y += (dy / d) * step
      step = 0
    }
  }
  return false
}

// after loading, a map change or a blocked step: find the way again
function rePath(s, world, m) {
  stepOut(world, m)
  const t = m.task
  if (!t || !t.spot) return false
  if (!walkable(world, t.spot[0], t.spot[1])) return false
  const p = findPath(world, tile(m.x), tile(m.y), t.spot[0], t.spot[1])
  if (!p) return false
  setPath(m, t.spot, p)
  return true
}

export function tick(s, world, dt, out = []) {
  s._time = (s._time || 0) + dt
  for (const id in s.nodes) {
    const n = nodeOf(world, id)
    if (!n) continue
    const k = NODES[n.kind]
    if (s.nodes[id] < k.max) s.nodes[id] = Math.min(k.max, s.nodes[id] + k.regen * dt)
  }

  // new residents only while there is a free home (a house removed below
  // the head count never sends anyone away; it just stops new arrivals)
  if (s.manos.length < homes(s)) {
    s.arrivalT += dt
    if (s.arrivalT >= MANO.arriveEvery) {
      s.arrivalT = 0
      const c = START.camp
      const m = { id: s.nextId++, x: c.x + CAMP_SIZE[0] + 0.5, y: c.y + CAMP_SIZE[1] + 0.5, carry: null, task: { kind: 'rest', pose: 'happy', t: 1.6 } }
      s.manos.push(m)
      out.push({ type: 'arrive', id: m.id, x: m.x, y: m.y })
    }
  } else s.arrivalT = 0

  s._staffT = (s._staffT || 0) - dt
  if (s._staffT <= 0) {
    s._staffT = 0.4
    staffSites(s, world)
  }

  for (const b of s.buildings) if (b.build) b.build.active = 0
  // choosing a job means path searches: only so many per tick, the rest wait
  // a moment (a few hundredths of a second), so 200 Manos finishing at once
  // never freeze a frame. Whose turn comes first rotates.
  s._budget = Math.max(2, Math.round(dt * DECIDE_PER_SECOND))
  const n = s.manos.length
  const first = n ? (s._turn = ((s._turn || 0) + 1) % n) : 0
  for (let i = 0; i < n; i++) step(s, world, s.manos[(first + i) % n], dt, out)
  s.cap = caps(s)
}

// pick a new job now if this tick still has room for it, else next tick
function next(s, world, m, out) {
  if (s._budget > 0) {
    s._budget--
    return decide(s, world, m, out)
  }
  if (m.task && m.task.node) m._lastNode = m.task.node
  m.task = null
  m._path = m._goal = null
}

function step(s, world, m, dt, out) {
  const t = m.task
  if (!t) return next(s, world, m, out)

  if (t.kind === 'rest') {
    t.t -= dt
    if (t.t <= 0) {
      if (t.seat) {
        // stand up next to the seat
        const d = s.decor.find((x) => x.id === t.seat)
        const st = d && around(world, { kind: 'decor', type: d.type, x: d.x, y: d.y })[0]
        if (st) {
          m.x = st[0] + 0.5
          m.y = st[1] + 0.5
        }
      }
      next(s, world, m, out)
    }
    return
  }

  if (t.phase === 'go') {
    if (!m._goal && !m._path) {
      if (s._budget <= 0) return // finds the way again next tick
      s._budget--
      if (!rePath(s, world, m) && t.spot) {
        if (t.b) failed(s, m, t.b)
        return next(s, world, m, out)
      }
    }
    if (t.kind === 'build' && !s.buildings.some((b) => b.id === t.b && b.build)) return next(s, world, m, out)
    if (t.kind === 'gather' && !nodeOf(world, t.node)) return next(s, world, m, out)
    if (!walk(world, m, dt)) return
    if (t.kind === 'wander') {
      m.task = { kind: 'rest', pose: rand(s) < 0.5 ? 'sit' : 'stand', t: 1.5 + rand(s) * 3 }
      return
    }
    if (t.kind === 'sit') {
      const d = s.decor.find((x) => x.id === t.seat)
      if (!d) return next(s, world, m, out)
      const [sx, sy] = DECOR[d.type].seats[t.si] || [0.5, 0.5]
      m.x = d.x + sx
      m.y = d.y + sy
      m.task = { kind: 'rest', pose: 'sit', t: MANO.restMin + rand(s) * 4, seat: d.id, si: t.si }
      return
    }
    t.phase = t.kind === 'deliver' ? 'drop' : 'work'
    t.t = 0
  }

  if (t.kind === 'deliver' && t.phase === 'drop') {
    const { res, n } = m.carry
    const room = Math.max(0, caps(s)[res] - s.res[res])
    const put = Math.min(n, room)
    s.res[res] += put
    s.stats.gathered[res] += put
    out.push({ type: 'deliver', res, n: put, lost: n - put, x: m.x, y: m.y })
    m.carry = null
    // now and then a short break on a bench, never for long
    if (rand(s) < MANO.breakChance) {
      const seat = findSeat(s, world, m)
      if (seat && goSit(s, world, m, seat)) return
    }
    return next(s, world, m, out)
  }

  if (t.kind === 'gather' && t.phase === 'work') {
    const n = nodeOf(world, t.node)
    const res = NODES[n.kind].res
    m._face = n.x + 0.5 - m.x - (n.y + 0.5 - m.y)
    t.t += dt
    if (t.t < workOf(s, res)) return
    const got = Math.min(carryOf(s, res), Math.floor(s.nodes[t.node]))
    if (got < 1) return next(s, world, m, out)
    s.nodes[t.node] -= got
    m.carry = { res, n: got }
    m._lastNode = t.node
    out.push({ type: 'gather', res, x: n.x + 0.5, y: n.y + 0.5 })
    return startDeliver(s, world, m)
  }

  if (t.kind === 'build' && t.phase === 'work') {
    const b = s.buildings.find((x) => x.id === t.b)
    if (!b || !b.build) return next(s, world, m, out)
    m._face = b.x + 1.5 - m.x - (b.y + 1.5 - m.y)
    // only Manos actually standing at the site and hammering count
    b.build.progress += MANO.workRate * dt
    b.build.active++
    t.t += dt
    if (b.build.progress >= buildWork(b)) finish(s, world, b, out)
  }
}

function finish(s, world, b, out) {
  b.level = b.build.to
  b.build = null
  s.stats.built++
  s.cap = caps(s)
  out.push({ type: 'built', b: b.id, level: b.level, x: b.x + 1.5, y: b.y + 1.5 })
  // the crew goes back to what it was doing (decide() prefers m.resume)
  for (const m of s.manos) if (m.task && m.task.kind === 'build' && m.task.b === b.id) {
    m.task = { kind: 'rest', pose: 'happy', t: 1.2 }
    m._path = m._goal = null
  }
  refresh(world, s)
}

// ETA in seconds for a site with the Manos working on it now (null = stopped)
export function siteEta(b) {
  if (!b.build) return null
  const left = Math.max(0, buildWork(b) - b.build.progress)
  return b.build.active ? left / (b.build.active * MANO.workRate) : null
}

export function activity(s, world, m) {
  const t = m.task
  if (!t) return '생각 중'
  if (t.kind === 'gather') {
    const n = nodeOf(world, t.node)
    const res = n ? NODES[n.kind].res : 'wood'
    if (t.phase === 'work') return { wood: '나무하는 중', stone: '돌 캐는 중', stardust: '별가루 모으는 중' }[res]
    return { wood: '나무하러 가는 중', stone: '돌 캐러 가는 중', stardust: '별가루 캐러 가는 중' }[res]
  }
  if (t.kind === 'deliver') return `${{ wood: '나무', stone: '돌', stardust: '별가루' }[m.carry ? m.carry.res : 'wood']} 나르는 중`
  if (t.kind === 'build') {
    const b = s.buildings.find((x) => x.id === t.b)
    return `${b ? BUILDINGS[b.type].name : '건물'} ${t.phase === 'work' ? '짓는 중' : '공사장으로 가는 중'}`
  }
  if (t.kind === 'sit') return '쉬러 가는 중'
  if (t.kind === 'wander') return '산책 중'
  if (t.kind === 'rest') return t.seat ? '벤치에서 쉬는 중' : t.pose === 'sleep' ? '꾸벅꾸벅 조는 중' : t.pose === 'happy' ? '신난 중' : '쉬는 중'
  return '쉬는 중'
}

export { footprint, zoneAt }
