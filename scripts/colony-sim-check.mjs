// Mano Colony balance check: a simple player that builds whatever it can
// afford, on the first free lot, plays the first 15 minutes at 20 ticks/s.
//   node scripts/colony-sim-check.mjs
import { newGame, tick, place, upgrade, unlock, canPlace, canUpgrade, canUnlock, homes } from '../src/colony/sim.js'
import { createWorld, refresh } from '../src/colony/world.js'
import { LOTS } from '../src/colony/config.js'

const s = newGame(0, 12345)
const w = createWorld()
refresh(w, s)
const log = []
const order = ['house', 'lumber', 'quarry', 'storage']
let t = 0
const DT = 0.05
const seen = { firstBuild: null, house: null, lumber: null, quarry: null, storage: null, pop4: null, zoneB: null }
let lastLog = 0
let stuck = 0
while (t < 15 * 60) {
  const out = []
  tick(s, w, DT, out)
  t += DT
  for (const e of out) if (e.type === 'built') log.push(`${t.toFixed(0)}s built ${e.lot} → Lv${e.level}`)
  // player: one action per 2 s
  if (Math.round(t / DT) % 40 === 0) {
    let acted = false
    for (const type of order) {
      if (s.buildings.some((b) => b.type === type)) continue
      const lot = LOTS.find((l) => canPlace(s, type, l.id).ok)
      if (lot) {
        place(s, w, type, lot.id)
        log.push(`${t.toFixed(0)}s place ${type} @${lot.id}`)
        seen.firstBuild ??= t
        acted = true
        break
      }
    }
    if (!acted && s.buildings.length >= 3 && canUnlock(s, 'B').ok) {
      unlock(s, w, 'B')
      seen.zoneB = t
      log.push(`${t.toFixed(0)}s unlock B`)
    } else if (!acted && t > 360) {
      const b = s.buildings.find((b) => canUpgrade(s, b.id).ok)
      if (b) {
        upgrade(s, b.id)
        log.push(`${t.toFixed(0)}s upgrade ${b.type} → ${b.level + 1}`)
      } else if (canPlace(s, 'house', 'A5').ok && s.manos.length >= homes(s)) {
        place(s, w, 'house', 'A5')
        log.push(`${t.toFixed(0)}s place 2nd house`)
      }
    }
  }
  for (const b of s.buildings) if (b.level >= 1 && seen[b.type] === null) seen[b.type] = t
  if (s.manos.length >= 4 && seen.pop4 === null) seen.pop4 = t
  // every Mano must keep doing something (no one frozen in a 'go' phase without a way)
  for (const m of s.manos) {
    const frozen = m.task && m.task.phase === 'go' && !m._goal && !m._path
    m._frozen = frozen ? (m._frozen || 0) + 1 : 0
    if (m._frozen > 2) stuck++
  }
  if (t - lastLog >= 60) {
    lastLog = t
    log.push(`${t.toFixed(0)}s res ${Object.entries(s.res).map(([k, v]) => k + ' ' + Math.floor(v)).join(', ')} · manos ${s.manos.length}/${homes(s)} · jobs ${s.manos.map((m) => m.task?.kind[0] || '-').join('')}`)
  }
}
console.log(log.join('\n'))
console.log('\nmilestones (s):', JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v === null ? null : Math.round(v)]))))
console.log('Manos stuck for more than 2 ticks:', stuck)
const ok = stuck === 0 && seen.firstBuild !== null && seen.firstBuild <= 60 && seen.house <= 600 && seen.lumber <= 600 && seen.quarry <= 600 && seen.pop4 <= 600
console.log(ok ? 'PASS: first build ≤ 60 s; house, lumber mill, quarry and a new resident within 10 min' : 'FAIL: pacing targets missed')
process.exit(ok ? 0 : 1)
