// MANO COLONY — time that passed while the game was not running (page closed
// or tab in the background). One calculation, never a frame-by-frame replay.
//
// Conservative on purpose:
//  - only Manos that were gathering (or carrying a load home) produce, at
//    OFFLINE.efficiency of their online rate, limited by what the nodes give
//    back and by free storage;
//  - construction moves on only with the Manos that were actually hammering
//    at the site when the game stopped (not those still walking there);
//  - nothing new starts while away: no new sites, upgrades or residents.

import { MANO, NODES, OFFLINE, RESOURCES } from './config.js'
import { findPathAny, idx, nodeOf, pathLength, refresh } from './world.js'
import { buildWork, caps, carryOf, drops, workOf } from './sim.js'
import { settle } from './play.js'

export function elapsed(simAt, now) {
  if (!Number.isFinite(simAt) || !Number.isFinite(now)) return { seconds: 0, capped: false }
  const raw = (now - simAt) / 1000
  if (raw <= 0) return { seconds: 0, capped: false } // clock went back: nothing, never negative
  if (raw > OFFLINE.maxSeconds) return { seconds: OFFLINE.maxSeconds, capped: true }
  return { seconds: raw, capped: false }
}

// tiles from a node to its nearest drop-off, as walked (one search toward
// all drop-off spots; each node is measured once however many Manos use it)
function tripLength(s, world, n, cache) {
  if (cache.has(n.id)) return cache.get(n.id)
  const near = drops(s, world, NODES[n.kind].res)
    .sort((a, b) => (a[0] - n.x) ** 2 + (a[1] - n.y) ** 2 - ((b[0] - n.x) ** 2 + (b[1] - n.y) ** 2))
    .slice(0, 8)
  const r = findPathAny(world, n.x, n.y, near, 4000)
  const len = r ? pathLength(r.path) : 30
  cache.set(n.id, len)
  return len
}

export function applyOffline(s, world, seconds) {
  const report = { seconds, gains: { wood: 0, stone: 0, stardust: 0 }, built: [], progressed: 0 }
  if (!(seconds > 0)) return report
  refresh(world, s)
  settle(s, world) // plays in progress simply end; they are not replayed

  // 1. construction: only the Manos hammering at the site when it stopped
  for (const b of s.buildings) {
    if (!b.build) continue
    const working = s.manos.filter((m) => m.task && m.task.kind === 'build' && m.task.b === b.id && m.task.phase === 'work').length
    if (!working) continue
    const before = b.build.progress
    b.build.progress = Math.min(buildWork(b), b.build.progress + working * MANO.workRate * seconds)
    report.progressed += b.build.progress - before
    if (b.build.progress >= buildWork(b)) {
      b.level = b.build.to
      b.build = null
      s.stats.built++
      report.built.push({ type: b.type, level: b.level })
      for (const m of s.manos) if (m.task && m.task.kind === 'build' && m.task.b === b.id) m.task = null
    }
  }

  // 2. gathering: Manos working a node (gathering there or carrying from it)
  const rate = { wood: 0, stone: 0, stardust: 0 }
  const trips = new Map()
  for (const m of s.manos) {
    const t = m.task
    if (!t || (t.kind !== 'gather' && t.kind !== 'deliver')) continue
    const n = t.node && nodeOf(world, t.node)
    if (!n || !world.open[idx(n.x, n.y)]) continue
    const res = NODES[n.kind].res
    const cycle = workOf(s, res) + (2 * tripLength(s, world, n, trips)) / MANO.speed + 1
    rate[res] += carryOf(s, res) / cycle
  }
  const cap = caps(s)
  for (const res of RESOURCES) {
    const ids = Object.keys(s.nodes).filter((id) => {
      const n = nodeOf(world, id)
      return n && NODES[n.kind].res === res
    })
    for (const id of ids) {
      const k = NODES[nodeOf(world, id).kind]
      s.nodes[id] = Math.min(k.max, s.nodes[id] + k.regen * seconds)
    }
    const open = ids.filter((id) => {
      const n = nodeOf(world, id)
      return world.open[idx(n.x, n.y)]
    })
    const supply = open.reduce((a, id) => a + s.nodes[id], 0)
    const want = rate[res] * seconds * OFFLINE.efficiency
    const room = Math.max(0, cap[res] - s.res[res]) // over-full stays as it is, nothing is added
    const gain = Math.floor(Math.max(0, Math.min(want, supply, room)))
    if (gain > 0 && supply > 0) {
      for (const id of open) s.nodes[id] = Math.max(0, s.nodes[id] - (gain * s.nodes[id]) / supply)
      s.res[res] += gain
      s.stats.gathered[res] += gain
      report.gains[res] = gain
    }
  }

  // 3. no new residents while away; the arrival timer simply waits
  // 4. everyone finds the way again from where they stood
  for (const m of s.manos) {
    m._path = m._goal = null
    if (m.task && m.task.kind === 'gather' && m.task.phase === 'work') m.task.t = 0
  }
  s.cap = caps(s)
  return report
}

export const hasNews = (r) => r.built.length > 0 || r.progressed > 0 || RESOURCES.some((k) => r.gains[k] > 0)
