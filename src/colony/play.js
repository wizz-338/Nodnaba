// MANO COLONY — what Manos do when there is no work: roll about, dance, sniff
// flowers, nap, and play with a friend. Plain data in, plain data out.
//
// Everything here is temporary and never saved: a play is a Mano task
// ({ kind: 'play' } alone, { kind: 'duo' } with a friend) plus a few runtime
// fields on the state (s._joints, s._spots …) that a reload simply drops.
//
// A two-Mano play ("joint") involves two real residents. Both walk to two
// neighbouring tiles; once both are there, they are drawn as one picture of
// the two of them, and when it ends each is back on their own tile. Nobody is
// added or removed, a resident is in at most one joint, and a joint that
// cannot come together in time is called off.

import { ACTS, DECOR, NODES, PLAY, RESOURCES } from './config.js'
import { findPath, idx, inMap, nodeOf, walkable } from './world.js'
import { caps, carryOf, findSeat, rand, setPath } from './sim.js'

// runtime-only parts of the state; rebuilt whenever missing (or not what
// they should be, e.g. after the state was copied as plain JSON)
const spots = (s) => (s._spots instanceof Set ? s._spots : (s._spots = new Set()))
const crowd = (s) => (s._crowd instanceof Map ? s._crowd : (s._crowd = new Map()))

const FLOWERS = new Set(['flowerbed', 'lavender', 'bush_flower', 'planter', 'flower_arch', 'sakura', 'flower_cart', 'flower_rock'])
const now = (s) => s._time || 0
const between = (s, [a, b]) => a + rand(s) * (b - a)
const lenOf = (s, act) => between(s, PLAY[ACTS[act].len])
const tile = (v) => Math.floor(v)

// ── places ──────────────────────────────────────────────────────────────────

// A tile to play on: open grass with open grass all around (so not on a path,
// not by a door, a building site, a tree or a fence) and nobody else's spot.
function roomy(s, world, x, y) {
  if (!inMap(x, y) || world.floor[idx(x, y)]) return false
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!walkable(world, x + dx, y + dy)) return false
  return apart(s, x, y) // a tile apart from anyone else playing, so nobody overlaps
}

// no one else plays on this tile or right next to it
function apart(s, x, y) {
  const taken = spots(s)
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (taken.has(idx(x + dx, y + dy))) return false
  return true
}

// a roomy tile (or two side by side) near (x, y), reachable from where the
// Mano stands; a handful of random tries, never a full search
function openSpot(s, world, x, y, pair = false, tries = 14) {
  for (let i = 0; i < tries; i++) {
    const r = i === 0 ? 0 : 1 + Math.floor(rand(s) * 5)
    const a = i === 0 ? 0 : rand(s) * Math.PI * 2
    const tx = tile(x) + Math.round(Math.cos(a) * r)
    const ty = tile(y) + Math.round(Math.sin(a) * r)
    if (roomy(s, world, tx, ty) && (!pair || roomy(s, world, tx + 1, ty))) return [tx, ty]
  }
  return null
}

// a tile beside a flower decoration near the Mano, not crowded
function flowerSpot(s, world, m) {
  let best = null
  for (const d of s.decor) {
    if (!FLOWERS.has(d.type)) continue
    const dist = (d.x - m.x) ** 2 + (d.y - m.y) ** 2
    if (dist > 8 * 8 || (best && dist >= best.dist)) continue
    if ((crowd(s).get(d.id) || 0) >= PLAY.crowd) continue
    const [w, h] = DECOR[d.type].size || [1, 1]
    // only the two sides facing the viewer, so the flowers never hide the Mano
    const ring = []
    for (let x = d.x; x <= d.x + w; x++) ring.push([x, d.y + h])
    for (let y = d.y; y < d.y + h; y++) ring.push([d.x + w, y])
    const free = ring.filter(([x, y]) => walkable(world, x, y) && !world.floor[idx(x, y)] && apart(s, x, y))
    if (free.length) best = { d, spot: free[Math.floor(rand(s) * free.length)], dist }
  }
  return best
}

const flowersNear = (s, m) => s.decor.some((d) => FLOWERS.has(d.type) && (d.x - m.x) ** 2 + (d.y - m.y) ** 2 < 36)

// ── choosing what to do ─────────────────────────────────────────────────────

// Weighted pick among the actions this Mano may do now. Recently done
// actions are out; an action someone else just started counts less, so the
// village never does the same thing all at once.
function pickAct(s, m, ctx) {
  const t = now(s)
  let total = 0
  const opts = []
  for (const [act, def] of Object.entries(ACTS)) {
    if (def.pair) continue
    if (m._recent && m._recent[act] > t) continue
    if (def.where === 'flower' && !ctx.flowers) continue
    if (ctx.afterWork && act !== 'yawn') continue
    let w = def.w
    if (def.rest) w *= ctx.full ? 2.5 : 1
    else if (ctx.full) w *= 0.6
    if (def.flowers && ctx.flowers) w *= def.flowers
    if (def.where === 'flower') w *= 3
    if (act === 'swing' && ctx.seat) w *= 3
    if (s._started && s._started[act] > t - PLAY.sameStart) w *= 0.25
    if (w <= 0) continue
    total += w
    opts.push([act, total])
  }
  if (!opts.length) return null
  const r = rand(s) * total
  return opts.find(([, c]) => r < c)[0]
}

function pickPairAct(s, a, b) {
  const t = now(s)
  const full = isFull(s)
  let total = 0
  const opts = []
  for (const [act, def] of Object.entries(ACTS)) {
    if (!def.pair) continue
    if ((a._recent && a._recent[act] > t) || (b._recent && b._recent[act] > t)) continue
    let w = def.w * (def.rest && full ? 2 : 1)
    if (s._started && s._started[act] > t - PLAY.sameStart) w *= 0.25
    total += w
    opts.push([act, total])
  }
  if (!opts.length) return null
  const r = rand(s) * total
  return opts.find(([, c]) => r < c)[0]
}

const isFull = (s) => {
  const c = caps(s)
  return RESOURCES.every((r) => s.res[r] >= c[r])
}

const remember = (s, m, act) => {
  m._recent = m._recent || {}
  m._recent[act] = now(s) + between(s, PLAY.repeat)
  s._started = s._started || {}
  s._started[act] = now(s)
}

// Called when a Mano has nothing to do. Returns true if a play was started.
export function startPlay(s, world, m, { afterWork = false } = {}) {
  if (!afterWork && rand(s) >= PLAY.playChance) return false
  if (!afterWork && rand(s) < PLAY.pairChance && startPairFor(s, world, m)) return true
  const seat = findSeat(s, world, m, true)
  const ctx = { full: isFull(s), flowers: flowersNear(s, m), seat: !!seat, afterWork }
  const act = pickAct(s, m, ctx)
  if (!act) return false
  return beginSolo(s, world, m, act, seat)
}

function beginSolo(s, world, m, act, seat, force = false) {
  const def = ACTS[act]
  let spot = null
  let extra = {}
  if (def.where === 'bench' && seat && DECOR[seat.d.type].dirs) {
    // on the bench seat, facing the way the bench runs
    const st = standBeside(world, seat.d)
    if (!st) return false
    spot = st
    extra = { seat: seat.d.id, si: seat.si, flip: seat.d.dir % 2 === 1 }
  } else if (def.where === 'flower') {
    const f = flowerSpot(s, world, m)
    if (!f) return false
    spot = f.spot
    extra = { decor: f.d.id, flip: f.d.x + 0.5 < f.spot[0] + 0.5 }
  } else if (def.where === 'here') {
    const x = tile(m.x)
    const y = tile(m.y)
    spot = walkable(world, x, y) && !world.floor[idx(x, y)] ? [x, y] : openSpot(s, world, m.x, m.y)
  } else spot = openSpot(s, world, m.x, m.y)
  if (!spot && force) spot = [tile(m.x), tile(m.y)]
  if (!spot) return false
  const path = spot[0] === tile(m.x) && spot[1] === tile(m.y) ? [] : findPath(world, tile(m.x), tile(m.y), spot[0], spot[1], 1500)
  if (!path) return false
  m.task = { kind: 'play', act, phase: 'go', spot, t: lenOf(s, act), flip: extra.flip ?? rand(s) < 0.5, ...extra }
  reserve(s, m.task)
  if (path.length) setPath(m, spot, path)
  else arrivePlay(s, world, m)
  remember(s, m, act)
  return true
}

// the walkable tile a bench user steps on and off from
function standBeside(world, d) {
  for (const [x, y] of [[d.x + 1, d.y], [d.x, d.y + 1], [d.x - 1, d.y], [d.x, d.y - 1]]) if (walkable(world, x, y)) return [x, y]
  return null
}

function reserve(s, t) {
  spots(s).add(idx(t.spot[0], t.spot[1]))
  if (t.decor) crowd(s).set(t.decor, (crowd(s).get(t.decor) || 0) + 1)
}

function unreserve(s, t) {
  if (t.spot) spots(s).delete(idx(t.spot[0], t.spot[1]))
  if (t.decor) crowd(s).set(t.decor, Math.max(0, (crowd(s).get(t.decor) || 0) - 1))
}

// reached the spot: settle in (on the bench, if it is a bench play)
export function arrivePlay(s, world, m) {
  const t = m.task
  t.phase = 'play'
  t.at = 0
  m._path = m._goal = null
  if (t.seat) {
    const d = s.decor.find((x) => x.id === t.seat)
    if (!d) return endPlay(s, world, m)
    const [sx, sy] = DECOR[d.type].seats[t.si] || [0.5, 0.5]
    m.x = d.x + sx
    m.y = d.y + sy
  } else {
    m.x = t.spot[0] + 0.5
    m.y = t.spot[1] + 0.5
  }
}

// Ends a solo play: spot and seat freed, the Mano on a tile it can walk from.
export function endPlay(s, world, m) {
  const t = m.task
  if (!t || t.kind !== 'play') return
  unreserve(s, t)
  if (t.seat) {
    const d = s.decor.find((x) => x.id === t.seat)
    const st = (d && standBeside(world, d)) || t.spot
    m.x = st[0] + 0.5
    m.y = st[1] + 0.5
  }
  m.task = null
  m._path = m._goal = null
}

// ── two friends ─────────────────────────────────────────────────────────────

const joints = (s) => (Array.isArray(s._joints) ? s._joints : (s._joints = []))

// residents free to be asked to play: resting on the grass or strolling, not
// carrying, not just back from another pair play
function freeForPair(s, o) {
  if (o.carry || (o._pairAgain || 0) > now(s)) return false
  const t = o.task
  return !t || t.kind === 'wander' || (t.kind === 'rest' && !t.seat && t.pose !== 'happy')
}

// who is free where: rebuilt once a second, so finding a friend never scans
// every resident
function freeGrid(s) {
  if (s._gridAt !== undefined && now(s) - s._gridAt < PLAY.scanEvery && s._grid instanceof Map) return s._grid
  const g = new Map()
  for (const o of s.manos) {
    if (!freeForPair(s, o)) continue
    const k = (o.x >> 3) * 64 + (o.y >> 3)
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(o)
  }
  s._grid = g
  s._gridAt = now(s)
  return g
}

function friendFor(s, m) {
  const g = freeGrid(s)
  const cx = m.x >> 3
  const cy = m.y >> 3
  let best = null
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const o of g.get((cx + dx) * 64 + (cy + dy)) || []) {
        if (o === m || !freeForPair(s, o)) continue
        const d = (o.x - m.x) ** 2 + (o.y - m.y) ** 2
        if (d <= PLAY.friendRadius ** 2 && (!best || d < best.d)) best = { o, d }
      }
  return best && best.o
}

function startPairFor(s, world, m) {
  if (joints(s).length >= PLAY.maxPairs || (m._pairAgain || 0) > now(s)) return false
  const o = friendFor(s, m)
  if (!o) return false
  const act = pickPairAct(s, m, o)
  return !!act && startJoint(s, world, m, o, act)
}

// Two residents agree to play `act`: both get a meeting tile (side by side),
// walk there, and the joint waits for both.
export function startJoint(s, world, a, b, act, force = false) {
  if (a === b || joints(s).some((j) => j.a === a.id || j.b === a.id || j.a === b.id || j.b === b.id)) return false
  let spot = openSpot(s, world, (a.x + b.x) / 2, (a.y + b.y) / 2, true, 20)
  if (!spot && force) {
    const x = tile(a.x)
    const y = tile(a.y)
    if (walkable(world, x, y) && walkable(world, x + 1, y)) spot = [x, y]
  }
  if (!spot) return false
  const spots = [spot, [spot[0] + 1, spot[1]]]
  // the one already nearer the left tile takes it
  const [l, r] = (a.x - spots[0][0]) ** 2 + (a.y - spots[0][1]) ** 2 <= (b.x - spots[0][0]) ** 2 + (b.y - spots[0][1]) ** 2 ? [a, b] : [b, a]
  const pl = findPath(world, tile(l.x), tile(l.y), spots[0][0], spots[0][1], 1500)
  const pr = findPath(world, tile(r.x), tile(r.y), spots[1][0], spots[1][1], 1500)
  if (!pl || !pr) return false
  for (const o of [a, b]) leave(s, world, o)
  s._jointSeq = (s._jointSeq || 0) + 1
  const j = { id: 'j' + s._jointSeq, act, a: l.id, b: r.id, spots, state: 'meet', t: 0, dur: lenOf(s, act), cheer: false }
  joints(s).push(j)
  for (const [o, sp, p] of [[l, spots[0], pl], [r, spots[1], pr]]) {
    o.task = { kind: 'duo', joint: j.id, phase: 'go', spot: sp }
    reserve(s, o.task)
    if (p.length) setPath(o, sp, p)
    else {
      o.x = sp[0] + 0.5
      o.y = sp[1] + 0.5
      o.task.phase = 'wait'
    }
    remember(s, o, act)
  }
  s._grid = null // the two are taken now
  return true
}

// Calls a joint off: both residents are back as themselves, on their tiles.
export function cancelJoint(s, j, why = 'cancel') {
  const list = joints(s)
  const i = list.indexOf(j)
  if (i < 0) return
  list.splice(i, 1)
  for (const id of [j.a, j.b]) {
    const m = s.manos.find((o) => o.id === id)
    if (!m || !m.task || m.task.kind !== 'duo' || m.task.joint !== j.id) continue
    unreserve(s, m.task)
    m.task = null
    m._path = m._goal = null
    m._pairAgain = now(s) + (why === 'done' ? between(s, PLAY.pairAgain) : 5)
  }
}

export const jointOf = (s, m) => (m.task && m.task.kind === 'duo' ? joints(s).find((j) => j.id === m.task.joint) || null : null)

// Any play this Mano is in ends cleanly (work came, a seat vanished, a reload…).
export function leave(s, world, m) {
  const t = m.task
  if (!t) return
  if (t.kind === 'play') endPlay(s, world, m)
  else if (t.kind === 'duo') {
    const j = jointOf(s, m)
    if (j) cancelJoint(s, j)
    else {
      unreserve(s, t)
      m.task = null
      m._path = m._goal = null
    }
  }
}

// ── every tick ──────────────────────────────────────────────────────────────

// Is there gathering work with room to store it? Checked once a second.
function workWaiting(s, world) {
  if (s._workAt !== undefined && now(s) - s._workAt < 1) return s._work
  const c = caps(s)
  const coming = { wood: 0, stone: 0, stardust: 0 }
  for (const o of s.manos) {
    if (o.carry) coming[o.carry.res] += o.carry.n
    else if (o.task && o.task.kind === 'gather') {
      const n = nodeOf(world, o.task.node)
      if (n) coming[NODES[n.kind].res] += carryOf(s, NODES[n.kind].res)
    }
  }
  s._work = RESOURCES.some((r) => s.res[r] + coming[r] < c[r] - 2)
  s._workAt = now(s)
  return s._work
}

// a Mano that looked for work and found none a moment ago keeps playing
const mayWake = (s, m) => !(m._noWorkAt !== undefined && now(s) - m._noWorkAt < 10)

// A solo play this tick. Returns true when it ended (the caller picks a job).
export function stepPlay(s, world, m, dt) {
  const t = m.task
  if (t.phase !== 'play') return false
  // the bench, the flowers or the patch of grass is gone: stop right away
  const gone = t.seat ? !s.decor.some((d) => d.id === t.seat) : !walkable(world, t.spot[0], t.spot[1]) || (t.decor && !s.decor.some((d) => d.id === t.decor))
  if (gone) {
    endPlay(s, world, m)
    return true
  }
  t.at += dt
  t.t -= dt
  // work turned up: finish the move in hand, then go
  if (t.t > PLAY.wakeAfter && workWaiting(s, world) && mayWake(s, m)) t.t = PLAY.wakeAfter
  if (t.t > 0) return false
  endPlay(s, world, m)
  return true
}

// Joints this tick: meet → play → done (or called off).
export function stepJoints(s, world, dt, out) {
  const list = joints(s)
  if (!list.length) return
  const byId = new Map()
  for (const j of list) for (const id of [j.a, j.b]) byId.set(id, null)
  for (const o of s.manos) if (byId.has(o.id)) byId.set(o.id, o)
  for (const j of list.slice()) {
    const a = byId.get(j.a)
    const b = byId.get(j.b)
    const mine = (o) => o && o.task && o.task.kind === 'duo' && o.task.joint === j.id
    if (!mine(a) || !mine(b) || !j.spots.every(([x, y]) => walkable(world, x, y))) {
      cancelJoint(s, j)
      continue
    }
    j.t += dt
    if (j.state === 'meet') {
      if (a.task.phase === 'wait' && b.task.phase === 'wait') {
        j.state = 'play'
        j.t = 0
        for (const [o, [x, y]] of [[a, j.spots[0]], [b, j.spots[1]]]) {
          o.x = x + 0.5
          o.y = y + 0.5
          o.task.phase = 'play'
        }
      } else if (j.t > PLAY.meetTimeout) cancelJoint(s, j, 'timeout')
      continue
    }
    if (j.dur - j.t > PLAY.wakeAfter && workWaiting(s, world) && mayWake(s, a) && mayWake(s, b)) j.dur = j.t + PLAY.wakeAfter
    if (ACTS[j.act].cheer && !j.cheer && j.t > j.dur * 0.6) {
      j.cheer = true
      if (rand(s) < 0.4) out.push({ type: 'cheer', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    }
    if (j.t >= j.dur) cancelJoint(s, j, 'done')
  }
}

// A duo member reached the meeting tile.
export function arriveDuo(m) {
  m.task.phase = 'wait'
  m.x = m.task.spot[0] + 0.5
  m.y = m.task.spot[1] + 0.5
}

// Before saving or after time away: no play survives (nothing to restore later).
export function settle(s, world) {
  for (const j of joints(s).slice()) cancelJoint(s, j)
  for (const m of s.manos) if (m.task && (m.task.kind === 'play' || m.task.kind === 'duo')) leave(s, world, m)
  s._spots = new Set()
  s._crowd = new Map()
}

// ── development preview ─────────────────────────────────────────────────────

// Plays `act` right away with Mano m (and the nearest other Mano for a pair
// play), wherever they are. Only used by the dev-only preview.
export function forcePlay(s, world, m, act) {
  if (!ACTS[act]) return false
  leave(s, world, m)
  if (m._recent) delete m._recent[act]
  if (!ACTS[act].pair) {
    const seat = act === 'swing' ? findSeat(s, world, m, true) : null
    if (ACTS[act].where === 'flower' && !flowerSpot(s, world, m)) {
      // no flowers near: play it on the spot so the frames can still be seen
      m.task = { kind: 'play', act, phase: 'go', spot: [tile(m.x), tile(m.y)], t: lenOf(s, act), flip: false }
      reserve(s, m.task)
      arrivePlay(s, world, m)
      remember(s, m, act)
      return true
    }
    return beginSolo(s, world, m, act, seat, true)
  }
  let best = null
  for (const o of s.manos) {
    if (o === m) continue
    const d = (o.x - m.x) ** 2 + (o.y - m.y) ** 2
    if (!best || d < best.d) best = { o, d }
  }
  if (!best) return false
  leave(s, world, best.o)
  return startJoint(s, world, m, best.o, act, true)
}
