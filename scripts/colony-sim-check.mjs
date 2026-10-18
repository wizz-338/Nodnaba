// MANO COLONY pacing check: a simple player that builds what it can afford
// on the nearest free spot to the camp, plays 15 minutes at 20 ticks/s.
//   node scripts/colony-sim-check.mjs
import * as sim from '../src/colony/sim.js'
import { homes } from '../src/colony/sim.js'
import { START } from '../src/colony/config.js'

const s = sim.newGame(0)
const w = sim.worldFor(s)
const log = []
const order = ['house', 'lumber', 'quarry', 'storage']
const seen = { firstBuild: null, house: null, lumber: null, quarry: null, storage: null, pop4: null }
const spot = (type) => {
  const c = START.camp
  for (let r = 4; r < 22; r++)
    for (let dy = -r; dy <= r; dy += 4)
      for (let dx = -r; dx <= r; dx += 4) {
        const x = c.x + dx
        const y = c.y + dy
        if (sim.canBuild(s, w, type, x, y).ok) return [x, y]
      }
  return null
}
let stuck = 0
for (let t = 0; t < 15 * 60; t += 0.05) {
  const out = []
  sim.tick(s, w, 0.05, out)
  for (const e of out) if (e.type === 'built') log.push(`${t.toFixed(0)}s built ${e.b} → Lv${e.level}`)
  if (Math.round(t / 0.05) % 40 === 0) {
    for (const type of order) {
      if (s.buildings.some((b) => b.type === type)) continue
      const p = spot(type)
      if (p) {
        const r = sim.build(s, w, type, ...p)
        if (r.ok) {
          log.push(`${t.toFixed(0)}s place ${type} at ${p}`)
          seen.firstBuild ??= t
          break
        }
      }
    }
    if (t > 400) {
      const b = s.buildings.find((b) => sim.canUpgrade(s, b.id).ok)
      if (b) sim.upgrade(s, b.id) && log.push(`${t.toFixed(0)}s upgrade ${b.type}`)
    }
  }
  for (const b of s.buildings) if (b.level >= 1 && seen[b.type] === null) seen[b.type] = t
  if (s.manos.length >= 4 && seen.pop4 === null) seen.pop4 = t
  for (const m of s.manos) {
    const frozen = m.task && m.task.phase === 'go' && !m._goal && !m._path
    m._frozen = frozen ? (m._frozen || 0) + 1 : 0
    if (m._frozen > 3) stuck++
  }
  if (Math.round(t / 0.05) % 1200 === 0) log.push(`${t.toFixed(0)}s res ${Object.entries(s.res).map(([k, v]) => k + ' ' + Math.floor(v)).join(', ')} · manos ${s.manos.length}/${homes(s)}`)
}
console.log(log.join('\n'))
console.log('\nmilestones (s):', JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v === null ? null : Math.round(v)]))))
console.log('Manos stuck for more than 3 ticks:', stuck)
const ok = stuck === 0 && seen.firstBuild !== null && seen.firstBuild <= 60 && seen.house <= 600 && seen.lumber <= 600 && seen.quarry <= 600 && seen.pop4 <= 600
console.log(ok ? 'PASS: first build ≤ 60 s; house, lumber mill, quarry and a new resident within 10 min' : 'FAIL: pacing targets missed')
process.exit(ok ? 0 : 1)
