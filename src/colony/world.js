// Mano Colony — the tile grid: zones, what blocks walking, and pathfinding.
// Static parts come from config; buildings and unlocked zones come from the
// game state, so call refresh(state) after either changes.

import {
  BRIDGE,
  COLS,
  DECOR,
  LOTS,
  NODE_LIST,
  ROWS,
  START,
  TILE,
  WATER_ROW,
  ZONES,
  ZONE_IDS,
} from './config.js'

export const LOT = Object.fromEntries(LOTS.map((l) => [l.id, l]))
export const NODE = Object.fromEntries(NODE_LIST.map((n) => [n.id, n]))

export const zoneOfRow = (y) => ZONE_IDS.find((z) => y >= ZONES[z].rows[0] && y <= ZONES[z].rows[1])
export const isWater = (x, y) => y === WATER_ROW && !BRIDGE.includes(x)

const idx = (x, y) => y * COLS + x
const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS

// tiles that never change: water, nodes, decorations, the camp crate
const STATIC = new Uint8Array(COLS * ROWS)
for (let x = 0; x < COLS; x++) if (isWater(x, WATER_ROW)) STATIC[idx(x, WATER_ROW)] = 1
for (const n of NODE_LIST) STATIC[idx(n.x, n.y)] = 1
for (const [, x, y, blocks] of DECOR) if (blocks) STATIC[idx(x, y)] = 1
STATIC[idx(START.camp.x, START.camp.y)] = 1

export function createWorld() {
  return { blocked: new Uint8Array(COLS * ROWS), open: Object.fromEntries(ZONE_IDS.map((z) => [z, z === 'A'])) }
}

export function refresh(world, state) {
  const b = world.blocked
  for (const z of ZONE_IDS) world.open[z] = !!state.zones[z]
  for (let y = 0; y < ROWS; y++) {
    const open = world.open[zoneOfRow(y)]
    for (let x = 0; x < COLS; x++) b[idx(x, y)] = open ? STATIC[idx(x, y)] : 1
  }
  for (const bd of state.buildings) {
    const l = LOT[bd.lot]
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) b[idx(l.x + dx, l.y + dy)] = 1
  }
}

export const walkable = (world, x, y) => inside(x, y) && !world.blocked[idx(x, y)]

export const tileOf = (px) => Math.floor(px / TILE)
export const center = (t) => (t + 0.5) * TILE

// where Manos stand to work on / drop at things
export function lotStands(world, lotId) {
  const l = LOT[lotId]
  const c = [
    [l.x, l.y + 2],
    [l.x + 1, l.y + 2],
    [l.x - 1, l.y + 1],
    [l.x + 2, l.y + 1],
    [l.x - 1, l.y + 2],
    [l.x + 2, l.y + 2],
  ]
  return c.filter(([x, y]) => walkable(world, x, y))
}

export function nodeStands(world, nodeId) {
  const n = NODE[nodeId]
  // left/right first so Mano faces the node while she works
  const c = [
    [n.x - 1, n.y],
    [n.x + 1, n.y],
    [n.x, n.y + 1],
    [n.x, n.y - 1],
  ]
  return c.filter(([x, y]) => walkable(world, x, y))
}

export function campStands(world) {
  const { x, y } = START.camp
  return [
    [x, y + 1],
    [x - 1, y + 1],
    [x + 1, y + 1],
    [x - 1, y],
  ].filter(([a, b]) => walkable(world, a, b))
}

// ── A* on the tile grid (8 directions, no cutting corners) ──────────────────

const N = COLS * ROWS
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

// small binary heap of tile indices ordered by f
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

// Returns a list of tiles [[x, y], …] from start (excluded) to goal, or null.
// The start tile may be blocked (a building just went up around Mano).
export function findPath(world, sx, sy, gx, gy) {
  if (!inside(sx, sy) || !walkable(world, gx, gy)) return null
  if (sx === gx && sy === gy) return []
  gen++
  heap.length = 0
  const s = idx(sx, sy)
  const goal = idx(gx, gy)
  const h = (x, y) => {
    const dx = Math.abs(x - gx)
    const dy = Math.abs(y - gy)
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)
  }
  stamp[s] = gen
  g[s] = 0
  f[s] = h(sx, sy)
  from[s] = -1
  push(s)
  while (heap.length) {
    const cur = pop()
    if (cur === goal) break
    if (closed[cur] === gen) continue
    closed[cur] = gen
    const cx = cur % COLS
    const cy = (cur / COLS) | 0
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (!walkable(world, nx, ny)) continue
      if (dx && dy && (!walkable(world, cx + dx, cy) || !walkable(world, cx, cy + dy))) continue
      const ni = idx(nx, ny)
      const ng = g[cur] + cost
      if (stamp[ni] === gen && ng >= g[ni]) continue
      stamp[ni] = gen
      g[ni] = ng
      f[ni] = ng + h(nx, ny)
      from[ni] = cur
      push(ni)
    }
  }
  if (stamp[goal] !== gen) return null
  const out = []
  for (let i = goal; i !== s; i = from[i]) out.push([i % COLS, (i / COLS) | 0])
  return out.reverse()
}

// path length in tiles (for choosing the nearest target), Infinity if none
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

// clear straight line between two tile centres (used to smooth paths)
function clear(world, ax, ay, bx, by) {
  const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 3)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = ax + (bx - ax) * t
    const y = ay + (by - ay) * t
    // keep a little clearance from blocked tiles
    for (const [ox, oy] of [
      [0.28, 0.28],
      [-0.28, 0.28],
      [0.28, -0.28],
      [-0.28, -0.28],
    ]) {
      if (!walkable(world, Math.floor(x + 0.5 + ox), Math.floor(y + 0.5 + oy))) return false
    }
  }
  return true
}

// Drop in-between tiles where Mano can walk straight, so she does not zig-zag.
export function smooth(world, sx, sy, path) {
  if (!path || path.length < 2) return path
  const out = []
  let ax = sx
  let ay = sy
  let i = 0
  while (i < path.length) {
    let j = path.length - 1
    while (j > i && !clear(world, ax, ay, path[j][0], path[j][1])) j--
    out.push(path[j])
    ;[ax, ay] = path[j]
    i = j + 1
  }
  return out
}
