// Mano Colony — time that passed while the game was not running (page closed
// or tab in the background). One calculation, never a frame-by-frame replay.
//
// Conservative on purpose: only Manos that were actually gathering produce,
// at OFFLINE.efficiency of their online rate, limited by what the nodes can
// give and by storage space. Builders keep building. Nothing goes negative.

import { MANO, NODES, OFFLINE, RESOURCES, START, TILE } from './config.js'
import { NODE, center, findPath, pathLength, refresh, zoneOfRow } from './world.js'
import { buildWork, caps, carryOf, drops, homes, workOf } from './sim.js'

// elapsed seconds that count, from the last simulated moment to now
export function elapsed(simAt, now) {
  if (!Number.isFinite(simAt) || !Number.isFinite(now)) return { seconds: 0, capped: false }
  const raw = (now - simAt) / 1000
  if (raw <= 0) return { seconds: 0, capped: false } // clock went back: nothing, never negative
  if (raw > OFFLINE.maxSeconds) return { seconds: OFFLINE.maxSeconds, capped: true }
  return { seconds: raw, capped: false }
}

// shortest walk (world px) from a node's stand to any drop-off for its resource
function tripLength(s, world, nodeId) {
  const n = NODE[nodeId]
  const res = NODES[n.kind].res
  let best = Infinity
  for (const [x, y] of drops(s, world, res)) {
    // from the node's own tile: the path starts on a blocked tile and steps off it
    best = Math.min(best, pathLength(findPath(world, n.x, n.y, x, y)))
  }
  return Number.isFinite(best) ? best * TILE : 20 * TILE
}

// Apply `seconds` of absence to the state. Returns what happened, for the notice.
export function applyOffline(s, world, seconds) {
  const report = { seconds, gains: { wood: 0, stone: 0, stardust: 0 }, built: [], arrived: 0 }
  if (!(seconds > 0)) return report
  refresh(world, s)

  // 1. construction: assigned builders keep working
  for (const b of s.buildings) {
    if (!b.build) continue
    const builders = s.manos.filter((m) => m.task && m.task.kind === 'build' && m.task.b === b.id).length
    if (!builders) continue
    b.build.progress = Math.min(buildWork(b), b.build.progress + builders * seconds)
    if (b.build.progress >= buildWork(b)) {
      b.level = b.build.to
      b.build = null
      s.stats.built++
      report.built.push({ type: b.type, level: b.level })
      // conservative: these builders do not also gather during the absence
      for (const m of s.manos) if (m.task && m.task.kind === 'build' && m.task.b === b.id) m.task = null
    }
  }
  refresh(world, s)

  // 2. gathering: rate of each Mano working a node (gathering there, or
  //    carrying a load from it)
  const rate = { wood: 0, stone: 0, stardust: 0 }
  for (const m of s.manos) {
    const t = m.task
    if (!t || (t.kind !== 'gather' && t.kind !== 'deliver')) continue
    if (!NODE[t.node] || !s.zones[zoneOfRow(NODE[t.node].y)]) continue
    const res = NODES[NODE[t.node].kind].res
    const cycle = workOf(s, res) + (2 * tripLength(s, world, t.node)) / MANO.speed + 1
    rate[res] += carryOf(s, res) / cycle
  }

  const cap = caps(s)
  for (const res of RESOURCES) {
    const ids = Object.keys(s.nodes).filter((id) => NODES[NODE[id].kind].res === res && s.zones[zoneOfRow(NODE[id].y)])
    // nodes regrow over the absence first; that is all there is to take
    for (const id of Object.keys(s.nodes).filter((i) => NODES[NODE[i].kind].res === res)) {
      const k = NODES[NODE[id].kind]
      s.nodes[id] = Math.min(k.max, s.nodes[id] + k.regen * seconds)
    }
    const supply = ids.reduce((a, id) => a + s.nodes[id], 0)
    const want = rate[res] * seconds * OFFLINE.efficiency
    const room = Math.max(0, cap[res] - s.res[res])
    const gain = Math.floor(Math.max(0, Math.min(want, supply, room)))
    if (gain > 0 && supply > 0) {
      for (const id of ids) s.nodes[id] = Math.max(0, s.nodes[id] - (gain * s.nodes[id]) / supply)
      s.res[res] += gain
      s.stats.gathered[res] += gain
      report.gains[res] = gain
    }
  }

  // 3. new residents (only while there is a home for them)
  const room = homes(s) - s.manos.length
  if (room > 0) {
    const n = Math.min(room, Math.floor((s.arrivalT + seconds) / MANO.arriveEvery))
    for (let i = 0; i < n; i++) {
      s.manos.push({ id: s.nextMano++, x: center(START.camp.x - 1 + (i % 3)), y: center(START.camp.y + 1) + 4, carry: null, task: null })
    }
    report.arrived = n
    s.arrivalT = s.manos.length < homes(s) ? (s.arrivalT + seconds) % MANO.arriveEvery : 0
  } else s.arrivalT = 0

  // 4. everyone walks again from where they stood (paths are rebuilt)
  for (const m of s.manos) {
    m._path = m._goal = null
    if (m.task && m.task.phase === 'work' && m.task.kind === 'gather') m.task.t = 0
  }
  s.cap = caps(s)
  return report
}

// is anything worth telling the player?
export const hasNews = (r) => r.built.length > 0 || r.arrived > 0 || RESOURCES.some((k) => r.gains[k] > 0)
