// MANO COLONY — the map: logical tiles ↔ screen diamonds, terrain made from a
// fixed seed (so it is the same on every visit), what stands where, who can
// walk where, and finding the way.
//
// Logical tile (x, y): x grows to the lower right on screen, y to the lower
// left. A tile's centre is (x + 0.5, y + 0.5). Every system — floors,
// buildings, fences, collision, Mano movement, touch — uses iso()/fromIso().

import { CAMP_SIZE, DECOR, FLOOR_TYPES, MAP, NODES, PATH_COST, START, TH, TW, ZONES, ZONE_IDS } from './config.js'

export const N = MAP * MAP
export const idx = (x, y) => y * MAP + x
export const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP && y < MAP

// logical (tile units, may be fractional) → world px, and back
export const iso = (x, y) => ({ X: ((x - y) * TW) / 2, Y: ((x + y) * TH) / 2 })
export const fromIso = (X, Y) => ({ x: Y / TH + X / TW, y: Y / TH - X / TW })

export function zoneAt(x, y) {
  for (const z of ZONE_IDS) {
    const [x0, y0, x1, y1] = ZONES[z].rect
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return z
  }
  return null
}

// ── terrain from a seed ──────────────────────────────────────────────────────

function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// cheap stable per-tile hash (grass variants, little details)
export function hash(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// groves and rock / crystal fields: [kind, cx, cy, radius, count]
const CLUSTERS = [
  // the village centre: a few groves near its edges, the middle left open
  ['tree', 31, 32, 3, 7],
  ['tree', 64, 35, 3, 6],
  ['tree', 30, 63, 3, 6],
  ['tree', 57, 66, 2, 4],
  ['rock', 64, 61, 2, 4],
  ['rock', 36, 57, 2, 3],
  ['crystal', 60, 29, 1, 2],
  ['crystal', 28, 47, 1, 1],
  // the ring around it
  ['tree', 10, 34, 4, 10],
  ['tree', 14, 58, 4, 8],
  ['rock', 6, 46, 2, 3],
  ['rock', 82, 36, 3, 6],
  ['rock', 86, 58, 3, 6],
  ['crystal', 80, 48, 2, 3],
  ['tree', 34, 7, 4, 10],
  ['tree', 62, 5, 4, 8],
  ['crystal', 48, 10, 2, 2],
  ['tree', 34, 84, 3, 6],
  ['rock', 60, 86, 3, 4],
  ['crystal', 48, 88, 2, 3],
  ['tree', 10, 10, 5, 12],
  ['crystal', 84, 10, 3, 5],
  ['tree', 17, 78, 3, 6],
  ['rock', 84, 84, 3, 6],
  ['crystal', 88, 79, 2, 3],
]

const generated = new Map()

// Terrain, resource nodes and the bridges that come with the river.
export function generate(seed) {
  if (generated.has(seed)) return generated.get(seed)
  const rnd = mulberry(seed)
  const water = new Uint8Array(N)
  const setW = (x, y) => inMap(x, y) && (water[idx(x, y)] = 1)

  // a creek winding across the north, dipping into the village's top edge
  const ph = rnd() * Math.PI * 2
  const yAt = (x) => 16 + 7 * Math.sin(x / 13 + ph) + 3 * Math.sin(x / 4.7 + ph * 1.7)
  const widthAt = (x) => (Math.sin(x / 9 + ph) > 0.55 ? 3 : 2)
  let prev = null
  for (let x = 0; x < MAP; x++) {
    const y = Math.round(yAt(x))
    for (let d = 0; d < widthAt(x); d++) setW(x, y + d)
    if (prev !== null) for (let yy = Math.min(prev, y); yy <= Math.max(prev, y); yy++) setW(x, yy)
    prev = y
  }
  // a round pond in the south-west
  for (let y = 76; y < 93; y++)
    for (let x = 4; x < 20; x++) if ((x - 11.5) ** 2 + ((y - 84.5) * 1.15) ** 2 < 4.6 ** 2 + hash(x, y, 9) * 6) setW(x, y)

  // bridges where the creek is two tiles wide, near two columns of the village
  const bridges = []
  for (const want of [38, 58, 12, 84]) {
    for (let dx = 0; dx < 8; dx++) {
      const x = want + (dx % 2 ? -1 : 1) * Math.ceil(dx / 2)
      const rows = [x, x + 1].map((c) => {
        const r = []
        for (let y = 0; y < 40; y++) if (water[idx(c, y)]) r.push(y)
        return r
      })
      if (rows[0].length === 2 && rows[1].length === 2 && rows[0][0] === rows[1][0]) {
        bridges.push({ x, y: rows[0][0] })
        break
      }
    }
  }

  // resource nodes
  const node = new Int32Array(N).fill(-1)
  const nodes = []
  const camp = START.camp
  const nearCamp = (x, y) => x >= camp.x - 4 && x <= camp.x + CAMP_SIZE[0] + 3 && y >= camp.y - 4 && y <= camp.y + CAMP_SIZE[1] + 3
  const free = (x, y) => inMap(x, y) && !water[idx(x, y)] && node[idx(x, y)] < 0
  const onBridge = (x, y) => bridges.some((b) => x >= b.x - 1 && x <= b.x + 2 && y >= b.y - 1 && y <= b.y + 2)
  for (const [kind, cx, cy, r, count] of CLUSTERS) {
    let placed = 0
    for (let tries = 0; tries < count * 25 && placed < count; tries++) {
      const a = rnd() * Math.PI * 2
      const d = Math.sqrt(rnd()) * r
      const x = Math.round(cx + Math.cos(a) * d)
      const y = Math.round(cy + Math.sin(a) * d)
      if (!free(x, y) || nearCamp(x, y) || onBridge(x, y)) continue
      // keep at least two open sides, so nothing gets walled in
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => free(x + dx, y + dy)).length
      if (open < 3) continue
      node[idx(x, y)] = nodes.length
      nodes.push({ id: 'n' + nodes.length, kind, x, y, v: kind === 'tree' ? (rnd() < 0.55 ? 'oak' : 'pine') : '' })
      placed++
    }
  }
  const out = { seed, water, nodes, bridges }
  generated.set(seed, out)
  return out
}

// ── what stands where ───────────────────────────────────────────────────────

export const decorSize = (kind) => (DECOR[kind] && DECOR[kind].size) || [1, 1]

export function footprint(o) {
  if (o.kind === 'camp') return [START.camp.x, START.camp.y, CAMP_SIZE[0], CAMP_SIZE[1]]
  if (o.kind === 'building') return [o.x, o.y, 3, 3]
  if (o.kind === 'decor') {
    const [w, h] = decorSize(o.type)
    return [o.x, o.y, w, h]
  }
  return [o.x, o.y, 1, 1]
}

export function createWorld(seed) {
  return {
    seed,
    gen: generate(seed),
    open: new Uint8Array(N), // tile is in an unlocked zone
    occ: new Array(N).fill(null), // {kind, id} of whatever stands on the tile
    block: new Uint8Array(N), // Manos cannot step here
    floor: new Uint8Array(N), // 0 = none, else FLOOR_TYPES index + 1
    bridge: new Uint8Array(N),
    gate: new Uint8Array(N),
    fence: new Uint8Array(N),
    version: 0,
  }
}

// Rebuild every grid from the game state (cheap: 9 216 tiles).
export function refresh(world, s) {
  const { open, occ, block, floor, bridge, gate, fence } = world
  const { water, nodes } = world.gen
  open.fill(0)
  for (const z of ZONE_IDS) {
    if (!s.zones[z]) continue
    const [x0, y0, x1, y1] = ZONES[z].rect
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) open[idx(x, y)] = 1
  }
  occ.fill(null)
  block.fill(0)
  bridge.fill(0)
  gate.fill(0)
  fence.fill(0)
  floor.fill(0)
  const put = (o, blocks) => {
    const [x0, y0, w, h] = footprint(o)
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (!inMap(x, y)) continue
        occ[idx(x, y)] = o
        if (blocks) block[idx(x, y)] = 1
      }
  }
  for (const n of nodes) put({ kind: 'node', id: n.id, x: n.x, y: n.y }, true)
  put({ kind: 'camp', id: 'camp' }, true)
  for (const b of s.buildings) put({ kind: 'building', id: b.id, x: b.x, y: b.y }, true)
  for (const d of s.decor) {
    const def = DECOR[d.type]
    put({ kind: 'decor', id: d.id, type: d.type, x: d.x, y: d.y }, def.blocks)
    const [x0, y0, w, h] = footprint({ kind: 'decor', type: d.type, x: d.x, y: d.y })
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (def.bridge) bridge[idx(x, y)] = 1
        if (def.gate) gate[idx(x, y)] = 1
        if (d.type === 'fence') fence[idx(x, y)] = 1
      }
  }
  for (const b of world.gen.bridges)
    for (let y = b.y; y < b.y + 2; y++) for (let x = b.x; x < b.x + 2; x++) bridge[idx(x, y)] = 1
  // floors: { tileIndex: [type, paid] }
  for (const k in s.floors) {
    const t = FLOOR_TYPES.indexOf(s.floors[k][0])
    if (t >= 0) floor[+k] = t + 1
  }
  for (let i = 0; i < N; i++) if (!open[i] || (water[i] && !bridge[i])) block[i] = 1
  world.version++
}

export const walkable = (world, x, y) => inMap(x, y) && !world.block[idx(x, y)]

// tiles around a footprint where Manos stand to work / drop off (front first)
export function around(world, o, all = false) {
  const [x0, y0, w, h] = footprint(o)
  const c = []
  for (let y = y0; y < y0 + h; y++) c.push([x0 + w, y])
  for (let x = x0; x < x0 + w; x++) c.push([x, y0 + h])
  for (let y = y0; y < y0 + h; y++) c.push([x0 - 1, y])
  for (let x = x0; x < x0 + w; x++) c.push([x, y0 - 1])
  return all ? c : c.filter(([x, y]) => walkable(world, x, y))
}

// ── reachability (only checked when something is being placed) ─────────────

// Every tile reachable from the camp; extra = tile indices to treat as blocked.
export function reach(world, extra = null, allow = null) {
  const seen = new Uint8Array(N)
  const q = new Int32Array(N)
  let head = 0
  let tail = 0
  const blocked = (i) => (world.block[i] && !(allow && allow.has(i))) || (extra && extra.has(i))
  for (const [x, y] of around(world, { kind: 'camp' }, true)) {
    const i = idx(x, y)
    if (inMap(x, y) && !blocked(i)) {
      seen[i] = 1
      q[tail++] = i
    }
  }
  while (head < tail) {
    const i = q[head++]
    const x = i % MAP
    const y = (i / MAP) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (!inMap(nx, ny)) continue
      const j = idx(nx, ny)
      if (seen[j] || blocked(j)) continue
      seen[j] = 1
      q[tail++] = j
    }
  }
  return seen
}

// ── A* (8 directions, no corner cutting, floors are cheaper) ─────────────────

const g = new Float32Array(N)
const f = new Float32Array(N)
const from = new Int32Array(N)
const stamp = new Uint32Array(N)
const closed = new Uint32Array(N)
let gen = 0
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]
const heap = []
function push(i) {
  heap.push(i)
  let k = heap.length - 1
  while (k > 0) {
    const p = (k - 1) >> 1
    if (f[heap[p]] <= f[heap[k]]) break
    ;[heap[p], heap[k]] = [heap[k], heap[p]]
    k = p
  }
}
function pop() {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length) {
    heap[0] = last
    let k = 0
    for (;;) {
      const l = 2 * k + 1
      const r = l + 1
      let m = k
      if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l
      if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r
      if (m === k) break
      ;[heap[m], heap[k]] = [heap[k], heap[m]]
      k = m
    }
  }
  return top
}

export const stats = { searches: 0, expanded: 0, failed: 0 }

// Tiles [[x, y], …] from start (excluded) to goal, or null. The start tile may
// be blocked (something was just built around a Mano). Gives up after
// `limit` expanded tiles instead of searching the whole map forever.
export function findPath(world, sx, sy, gx, gy, limit = 7000) {
  const r = findPathAny(world, sx, sy, [[gx, gy]], limit)
  return r ? r.path : null
}

// One search toward several goal tiles at once (the stand spots around a
// tree, a site or a drop-off): returns the nearest one reached as
// { path, goal: [x, y] }, or null. One search instead of one per spot.
export function findPathAny(world, sx, sy, goals, limit = 7000) {
  stats.searches++
  if (!inMap(sx, sy)) return null
  const gs = goals.filter(([x, y]) => walkable(world, x, y))
  if (!gs.length) return null
  for (const [x, y] of gs) if (x === sx && y === sy) return { path: [], goal: [x, y] }
  gen++
  heap.length = 0
  const s = idx(sx, sy)
  const isGoal = new Set(gs.map(([x, y]) => idx(x, y)))
  const h = (x, y) => {
    let best = Infinity
    for (const [gx, gy] of gs) {
      const dx = Math.abs(x - gx)
      const dy = Math.abs(y - gy)
      const d = dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)
      if (d < best) best = d
    }
    return best * PATH_COST
  }
  stamp[s] = gen
  g[s] = 0
  f[s] = h(sx, sy)
  from[s] = -1
  push(s)
  let n = 0
  let goal = -1
  while (heap.length) {
    const cur = pop()
    if (isGoal.has(cur)) {
      goal = cur
      break
    }
    if (closed[cur] === gen) continue
    closed[cur] = gen
    if (++n > limit) break
    const cx = cur % MAP
    const cy = (cur / MAP) | 0
    for (const [dx, dy, len] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (!walkable(world, nx, ny)) continue
      if (dx && dy && (!walkable(world, cx + dx, cy) || !walkable(world, cx, cy + dy))) continue
      const ni = idx(nx, ny)
      const ng = g[cur] + len * (world.floor[ni] ? PATH_COST : 1)
      if (stamp[ni] === gen && ng >= g[ni]) continue
      stamp[ni] = gen
      g[ni] = ng
      f[ni] = ng + h(nx, ny)
      from[ni] = cur
      push(ni)
    }
  }
  stats.expanded += n
  // out of budget: a goal already seen is still a usable (if not shortest) way
  if (goal < 0) for (const i of isGoal) if (stamp[i] === gen && (goal < 0 || g[i] < g[goal])) goal = i
  if (goal < 0) {
    stats.failed++
    return null
  }
  const out = []
  for (let i = goal; i !== s; i = from[i]) out.push([i % MAP, (i / MAP) | 0])
  return { path: out.reverse(), goal: [goal % MAP, (goal / MAP) | 0] }
}

export function pathLength(path) {
  if (!path) return Infinity
  let len = 0
  let px = null
  let py = null
  for (const [x, y] of path) {
    if (px !== null) len += x !== px && y !== py ? Math.SQRT2 : 1
    px = x
    py = y
  }
  return len + (path.length ? 1 : 0)
}

export const nodeKind = (world, id) => {
  const n = world.gen.nodes[+id.slice(1)]
  return n ? NODES[n.kind] : null
}
export const nodeOf = (world, id) => world.gen.nodes[+String(id).slice(1)] || null
