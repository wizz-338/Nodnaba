// MANO COLONY rule, save and offline tests (no browser; storage is an
// in-memory stand-in, so no real save is ever touched).
//   node scripts/colony-test.mjs
import * as sim from '../src/colony/sim.js'
import { worldFor, newGame, tick, caps, homes } from '../src/colony/sim.js'
import { iso, fromIso, idx, reach, around, generate, zoneAt, findPath, walkable } from '../src/colony/world.js'
import { applyOffline, elapsed } from '../src/colony/offline.js'
import { createStore, parse, serialize, envelope, KEYS } from '../src/colony/save.js'
import { BUILDINGS, DECOR, FLOORS, MANO, OFFLINE, SAVE, START, DEFAULT_SEED } from '../src/colony/config.js'

let fails = 0
const ok = (c, msg) => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg)
  if (!c) fails++
}
class Mem {
  constructor(o = {}) { this.m = new Map(Object.entries(o)) }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null }
  setItem(k, v) { this.m.set(k, String(v)) }
  removeItem(k) { this.m.delete(k) }
}
const run = (s, w, secs, out = []) => {
  for (let t = 0; t < secs; t += 0.05) tick(s, w, 0.05, out)
  return out
}
const fresh = (res) => {
  const s = newGame(1000)
  if (res) s.res = { ...res }
  return [s, worldFor(s)]
}
const total = (r) => r.wood + r.stone + r.stardust
const rich = { wood: 400, stone: 400, stardust: 60 }

// ── map ─────────────────────────────────────────────────────────────────────
{
  const g = generate(DEFAULT_SEED)
  const [s, w] = fresh()
  let free = 0
  for (let y = 24; y < 72; y++) for (let x = 24; x < 72; x++) if (!w.occ[idx(x, y)] && !g.water[idx(x, y)]) free++
  ok(free / (48 * 48) > 0.95, `village centre 48×48 is open from the start and ${(100 * free / 2304).toFixed(1)}% buildable`)
  ok(!s.zones.N && s.zones.C && zoneAt(10, 10) === 'NW', 'outer ring starts locked, in zones')
  const rows = []
  for (let x = 0; x < 96; x++) for (let y = 0; y < 40; y++) if (g.water[idx(x, y)]) { rows.push(y); break }
  ok(Math.max(...rows) - Math.min(...rows) > 8, 'the creek winds (not a straight band)')
  const r = reach(w)
  const nodes = g.nodes.filter((n) => zoneAt(n.x, n.y) === 'C')
  ok(nodes.every((n) => around(w, { kind: 'node', x: n.x, y: n.y }, true).some(([x, y]) => r[idx(x, y)])), `every resource in the centre (${nodes.length}) can be reached`)
  const g2 = generate(DEFAULT_SEED)
  ok(g2 === g && JSON.stringify(generate(DEFAULT_SEED).nodes[5]) === JSON.stringify(g.nodes[5]), 'terrain is rebuilt identically from the seed')
  // screen ↔ tile
  const p = iso(37.25, 61.75)
  const t = fromIso(p.X, p.Y)
  ok(Math.abs(t.x - 37.25) < 1e-9 && Math.abs(t.y - 61.75) < 1e-9, 'screen ↔ tile conversion round-trips exactly')
}

// ── placing buildings ───────────────────────────────────────────────────────
{
  const [s, w] = fresh(rich)
  const n = w.gen.nodes.find((n) => zoneAt(n.x, n.y) === 'C')
  ok(!sim.canBuild(s, w, 'house', n.x - 1, n.y - 1).ok, 'cannot build over a tree/rock')
  ok(!sim.canBuild(s, w, 'house', 10, 40).ok, 'cannot build in a locked zone')
  const before = { ...s.res }
  const a = sim.build(s, w, 'house', 52, 52)
  const b = sim.build(s, w, 'house', 52, 52)
  ok(a.ok && !b.ok && before.wood - s.res.wood === 30 && before.stone - s.res.stone === 10, 'building pays once; a second tap on the same spot does nothing')
  ok(!sim.canBuild(s, w, 'quarry', 53, 53).ok, 'buildings cannot overlap')
  const c = sim.checkPlace(s, w, 'building', 'lumber', 60, 40)
  ok(c.ok && c.cells.length === 9 && c.cells.every((x) => x[2]), 'preview marks the 3×3 footprint green where it fits')
}

// ── fences, gates and blocked entrances ─────────────────────────────────────
{
  const [s, w] = fresh(rich)
  sim.build(s, w, 'house', 54, 40)
  // a ring around the house, leaving the corner gap for a gate
  const ring = []
  for (let x = 52; x <= 58; x++) ring.push([x, 38], [x, 44])
  for (let y = 39; y <= 43; y++) ring.push([52, y], [58, y])
  const full = sim.planFence(s, w, ring)
  ok(!full.ok && /입구/.test(full.reason), `a fence ring that seals the house is refused: "${full.reason}"`)
  const gap = ring.filter(([x, y]) => !(x === 55 && y === 44))
  const p = sim.placeFence(s, w, gap)
  const g = sim.decorate(s, w, 'gate', 55, 44, 0)
  ok(p.ok && g.ok, `fence with a gate placed (${p.count} pieces)`)
  ok(walkable(w, 55, 44) && !walkable(w, 54, 44), 'gates let Manos through, fences do not')
  const path = findPath(w, 55, 46, 55, 43)
  ok(path && path.some(([x, y]) => x === 55 && y === 44), 'Manos walk into the yard through the gate')
  const res0 = { ...s.res }
  const again = sim.planFence(s, w, gap)
  ok(again.count === 0, 'drawing the same fence again costs nothing')
  ok(total(s.res) === total(res0), 'no resources moved by the repeat')
}

// ── floors: exact refunds, no duplication ───────────────────────────────────
{
  const [s, w] = fresh({ wood: 50, stone: 50, stardust: 0 })
  const line = sim.lineCells({ x: 30, y: 50 }, { x: 39, y: 52 })
  const r0 = { ...s.res }
  const p = sim.paintFloors(s, w, 'cobble', line)
  ok(p.ok && r0.stone - s.res.stone === line.length, `a ${line.length}-tile cobble path costs ${line.length} stone`)
  const again = sim.planFloors(s, w, 'cobble', line)
  ok(!again.ok && again.count === 0, 'painting the same path again costs nothing')
  const swap = sim.paintFloors(s, w, 'planks', line)
  ok(swap.ok && s.res.stone === r0.stone && r0.wood - s.res.wood === line.length, 'switching floor type refunds the old tiles exactly and charges the new')
  for (let i = 0; i < 5; i++) {
    sim.paintFloors(s, w, null, line)
    sim.paintFloors(s, w, 'cobble', line)
  }
  sim.paintFloors(s, w, null, line)
  ok(s.res.wood === r0.wood && s.res.stone === r0.stone, 'laying and removing a path 5 times leaves resources exactly as before')
  const start = Object.keys(s.floors).map(Number).slice(0, 3).map((i) => [i % 96, Math.floor(i / 96)])
  const before = { ...s.res }
  sim.paintFloors(s, w, null, start)
  ok(total(s.res) === total(before), 'removing the free starting path gives nothing back')
}

// ── decorations and the storage box ─────────────────────────────────────────
{
  const [s, w] = fresh({ wood: 20, stone: 20, stardust: 0 })
  const r0 = { ...s.res }
  const a = sim.decorate(s, w, 'bench', 40, 52, 1)
  ok(a.ok && !a.fromBox && r0.wood - s.res.wood === DECOR.bench.cost.wood, 'buying a bench pays its cost')
  const st = sim.stow(s, w, a.decor.id)
  ok(st.ok && s.inventory.bench === 1 && s.res.wood === r0.wood - 3, 'putting it in the box gives no resources back (no duplication)')
  const b = sim.decorate(s, w, 'bench', 44, 56, 0)
  ok(b.ok && b.fromBox && s.inventory.bench === 0 && s.res.wood === r0.wood - 3, 'placing from the box is free and uses the stored one')
  const two = sim.decorate(s, w, 'bench', 46, 56, 1)
  ok(two.ok && s.decor.filter((d) => d.type === 'bench').length === 2, 'the same decoration can be owned several times')
  ok(!DECOR.sakura.res && !w.gen.nodes.some((n) => n.kind === 'sakura'), 'bought trees are decorations, never resource nodes')
}

// ── moving ──────────────────────────────────────────────────────────────────
{
  const [s, w] = fresh(rich)
  const site = sim.build(s, w, 'storage', 40, 40).building
  ok(!sim.canMove(s, w, site.id, 30, 40).ok, 'a building under construction cannot be moved (with a reason)')
  site.level = 2
  site.build = null
  const spent = JSON.stringify(site.spent)
  const r0 = JSON.stringify(s.res)
  const c = sim.canMove(s, w, site.id, 50, 30)
  ok(c.ok, 'a finished building can be moved to a free spot')
  ok(site.x === 40 && site.y === 40, 'checking a move changes nothing (cancel = original place)')
  const m = sim.move(s, w, site.id, 50, 30)
  ok(m.ok && site.x === 50 && site.level === 2 && JSON.stringify(site.spent) === spent && JSON.stringify(s.res) === r0, 'moving is free and keeps level and history')
  ok(sim.canMove(s, w, site.id, 51, 30).ok, 'a building can be shifted onto tiles it already covers')
}

// ── demolishing: refunds once, nobody and nothing deleted ───────────────────
{
  const [s, w] = fresh(rich)
  const site = sim.build(s, w, 'house', 40, 40).building
  const r0 = { ...s.res }
  const d = sim.demolish(s, w, site.id)
  ok(d.ok && d.kind === 'cancel' && s.res.wood === r0.wood + 30 && s.res.stone === r0.stone + 10, 'cancelling a site refunds all of it')
  ok(!sim.demolish(s, w, site.id).ok, 'the refund happens only once')
  // a finished Lv2 house with residents living in it
  const h = sim.build(s, w, 'house', 40, 40).building
  h.level = 2
  h.build = null
  h.spent = { wood: 110, stone: 60, stardust: 3 }
  while (s.manos.length < homes(s)) s.manos.push({ id: s.nextId++, x: 47.5, y: 50.5, carry: null, task: null })
  const pop = s.manos.length
  const pv = sim.demolishPreview(s, h.id)
  ok(pv.refund.wood === 55 && pv.refund.stone === 30 && pv.refund.stardust === 1 && pv.after.homes < pop, `preview shows a 50% refund and homes ${pv.before.homes} → ${pv.after.homes}`)
  sim.demolish(s, w, h.id)
  run(s, w, 60)
  ok(s.manos.length === pop, `homes now below residents: nobody leaves (${s.manos.length}), new arrivals stop`)
  // storage removed while above the base limit
  const st = sim.build(s, w, 'storage', 40, 40).building
  st.level = 1
  st.build = null
  s.res.wood = caps(s).wood
  sim.demolish(s, w, st.id)
  const wood = s.res.wood
  ok(wood > caps(s).wood, `storage removed: ${Math.floor(wood)} wood kept above the new limit ${caps(s).wood}`)
  run(s, w, 30)
  ok(s.res.wood <= wood && !s.manos.some((m) => m.task && m.task.kind === 'gather' && w.gen.nodes[+m.task.node.slice(1)].kind === 'tree'), 'while over the limit, nobody gathers wood (and nothing is deleted)')
  ok(s.manos.every((m) => m.task), 'no Mano is left stuck without a task')
}

// ── construction is real work: 3 Manos = 3× the speed ───────────────────────
function workTime(crew) {
  const [s, w] = fresh(rich)
  while (s.manos.length < 4) s.manos.push({ id: s.nextId++, x: 47.5, y: 50.5, carry: null, task: null })
  const b = sim.build(s, w, 'house', 52, 46).building
  sim.setCrew(s, w, b.id, crew)
  let working = 0
  let full = null
  let fullP = 0
  let walked = 0
  for (let t = 0; t < 300 && b.build; t += 0.05) {
    tick(s, w, 0.05)
    if (!b.build) break
    if (b.build.active) working += 0.05
    else walked += 0.05
    if (full === null && b.build.active === crew) {
      full = t
      fullP = b.build.progress
    }
  }
  return { working, level: b.level, walked, full, fullP }
}
{
  const one = workTime(1)
  const three = workTime(3)
  ok(one.level === 1 && three.level === 1, 'both sites finish')
  const per1 = (BUILDINGS.house.levels[0].work - one.fullP) / 1
  const per3 = (BUILDINGS.house.levels[0].work - three.fullP) / 3
  ok(Math.abs(per1 / per3 - 3) < 0.3, `after everyone arrives: 1 Mano needs ${per1.toFixed(1)} s, 3 Manos ${per3.toFixed(1)} s of work (×${(per1 / per3).toFixed(2)})`)
  ok(one.working > three.working * 2, `time with someone hammering: ${one.working.toFixed(1)} s vs ${three.working.toFixed(1)} s`)
  const [s, w] = fresh(rich)
  const b = sim.build(s, w, 'house', 52, 46).building
  sim.setCrew(s, w, b.id, 0)
  run(s, w, 20)
  ok(b.build.progress === 0, 'nobody on site: no progress')
  sim.setCrew(s, w, b.id, 9)
  ok(b.build.crew === s.manos.length, `crew is capped at the head count (${b.build.crew})`)
}

// ── idle Manos rest on benches, one per seat ────────────────────────────────
{
  const [s, w] = fresh(rich)
  s.res = { ...caps(s) } // everything full: nothing to gather
  while (s.manos.length < 6) s.manos.push({ id: s.nextId++, x: 47.5, y: 50.5, carry: null, task: null })
  sim.decorate(s, w, 'bench', 44, 52, 0)
  sim.decorate(s, w, 'bench', 46, 52, 1)
  let sat = 0
  let clash = 0
  for (let t = 0; t < 60; t += 0.05) {
    tick(s, w, 0.05)
    const seats = s.manos.filter((m) => m.task && m.task.kind === 'rest' && m.task.seat).map((m) => m.task.seat + m.task.si)
    sat = Math.max(sat, seats.length)
    if (new Set(seats).size !== seats.length) clash++
  }
  ok(sat >= 1 && clash === 0, `idle Manos sit on benches (up to ${sat} at once), never two on one seat`)
}

// ── offline ─────────────────────────────────────────────────────────────────
{
  ok(elapsed(10000, 5000).seconds === 0, 'clock set back → 0 s')
  const big = elapsed(0, 30 * 3600 * 1000)
  ok(big.seconds === OFFLINE.maxSeconds && big.capped, 'a day away → capped at 8 h')
  const [s, w] = fresh(rich)
  while (s.manos.length < 4) s.manos.push({ id: s.nextId++, x: 47.5, y: 50.5, carry: null, task: null })
  const b = sim.build(s, w, 'house', 52, 46).building
  sim.setCrew(s, w, b.id, 2)
  for (let t = 0; t < 60 && b.build && !(b.build.active >= 2); t += 0.05) tick(s, w, 0.05)
  const working = s.manos.filter((m) => m.task && m.task.kind === 'build' && m.task.phase === 'work').length
  const p0 = b.build.progress
  const pop = s.manos.length
  const nb = s.buildings.length
  applyOffline(s, w, 5)
  ok(working === 2 && Math.abs(b.build.progress - (p0 + 10)) < 0.01, `offline building uses the ${working} Manos that were hammering (5 s → +10 work)`)
  ok(s.manos.length === pop && s.buildings.length === nb, 'offline starts no new residents or sites')
  const [s2, w2] = fresh(rich)
  const b2 = sim.build(s2, w2, 'house', 44, 56).building
  sim.setCrew(s2, w2, b2.id, 2)
  tick(s2, w2, 0.05) // assigned, still walking
  applyOffline(s2, w2, 30)
  ok(b2.build && b2.build.progress === 0, 'builders still walking to the site add nothing offline')
}

// ── saving ──────────────────────────────────────────────────────────────────
{
  const st = new Mem()
  const store = createStore(st)
  const [s, w] = fresh(rich)
  sim.build(s, w, 'house', 52, 46)
  sim.paintFloors(s, w, 'brick', sim.lineCells({ x: 30, y: 40 }, { x: 34, y: 40 }))
  const bench = sim.decorate(s, w, 'bench', 40, 52, 1).decor
  sim.stow(s, w, bench.id)
  run(s, w, 8)
  ok(store.save(s, 5000).ok, 'save works')
  const l = store.load()
  ok(l.status === 'ok' && l.data.buildings[0].build.progress === serialize(s).buildings[0].build.progress, 'site progress restored exactly')
  ok(l.data.inventory.bench === 1 && Object.keys(l.data.floors).length === Object.keys(s.floors).length, 'storage box and floors restored')
  ok(!JSON.parse(st.getItem(KEYS.save)).data.manos.some((m) => '_path' in m), 'only plain data is saved')
  // damaged current → backup
  sim.paintFloors(s, w, 'soil', [[33, 33]])
  store.save(s, 6000)
  const good = st.getItem(KEYS.save)
  st.setItem(KEYS.save, good.slice(0, 100))
  ok(store.load().status === 'restored', 'damaged save → restored from backup')
  st.setItem(KEYS.backup, '{}')
  ok(store.load().status === 'corrupt' && st.getItem(KEYS.save) === good.slice(0, 100), 'both damaged → recovery, nothing overwritten')
  // over-full stock is a legal state now
  const d = serialize(newGame(1))
  d.res.wood = 500
  const p = parse(JSON.stringify(envelope(d)))
  ok(p.ok && p.data.res.wood === 500, 'stock above the limit (after a refund) is kept, not trimmed')
  const fut = JSON.stringify({ game: 'mano-colony', version: SAVE.version + 1, savedAt: 1, data: {} })
  const st3 = new Mem({ [KEYS.save]: fut })
  ok(createStore(st3).load().status === 'future' && st3.getItem(KEYS.save) === fut, 'newer version → not loaded, not overwritten')
  class Full extends Mem { setItem() { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e } }
  ok(createStore(new Full()).save(s).error === 'full', 'storage full → reported as failure')
  const st4 = new Mem({ 'nodnaba:manorun:best': '9' })
  const s4 = createStore(st4)
  s4.save(s, 1)
  s4.reset()
  ok(st4.getItem(KEYS.save) === null && st4.getItem('nodnaba:manorun:best') === '9', 'reset removes only this game')
}

// ── migration from the first demo (v2) ──────────────────────────────────────
function v2save() {
  const data = {
    res: { wood: 61, stone: 44, stardust: 7 },
    cap: { wood: 220, stone: 220, stardust: 55 },
    buildings: [
      { id: 'b1', type: 'lumber', lot: 'A1', level: 2, build: null },
      { id: 'b2', type: 'house', lot: 'A2', level: 1, build: { to: 2, progress: 12 } },
      { id: 'b3', type: 'storage', lot: 'A4', level: 2, build: null },
      { id: 'b4', type: 'quarry', lot: 'C1', level: 0, build: { to: 1, progress: 6 } },
    ],
    nodes: { tA1: 3 },
    manos: [1, 2, 3, 4, 5].map((id) => ({ id, x: 300, y: 860, carry: id === 2 ? { res: 'wood', n: 2 } : null, task: null })),
    zones: { A: true, B: true, C: true },
    nextMano: 6, nextBuilding: 5, arrivalT: 4, seed: 99,
    tutorial: { step: 3, done: true }, settings: { effects: false },
    stats: { gathered: { wood: 300, stone: 200, stardust: 10 }, built: 6 },
    clock: { createdAt: 1000, simAt: 2000, savedAt: 2000 },
  }
  return JSON.stringify({ game: 'mano-colony', version: 2, savedAt: 2000, sum: (() => { let h = 0x811c9dc5; const str = JSON.stringify(data); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) } return (h >>> 0).toString(16).padStart(8, '0') })(), data })
}
{
  const raw = v2save()
  const st = new Mem({ [KEYS.save]: raw })
  const store = createStore(st)
  const l = store.load()
  ok(l.status === 'migrated' && l.from === 2, 'v2 save loads as migrated')
  const d = l.data
  ok(d.res.wood === 61 && d.res.stone === 44 && d.res.stardust === 7 && d.manos.length === 5, 'resources and all 5 residents kept')
  ok(d.manos.some((m) => m.carry && m.carry.n === 2), 'a load being carried is kept')
  const types = [...d.buildings.map((b) => `${b.type}${b.level}`), ...d.stored.map((b) => `${b.type}${b.level}*`)].sort().join(',')
  ok(types === 'house1,lumber2,quarry0,storage2' || types === 'house1,lumber2,quarry0*,storage2', `every building kept with its level: ${types}`)
  const lum = d.buildings.find((b) => b.type === 'lumber')
  ok(lum && lum.x === 36 && lum.y === 36, 'lot A1 lands at the same place on the new map centre (36,36)')
  const house = d.buildings.find((b) => b.type === 'house')
  ok(house && house.build && Math.abs(house.build.progress / BUILDINGS.house.levels[1].work - 0.5) < 0.01, 'a half-done upgrade stays half done')
  ok(d.zones.N && d.zones.NE, 'unlocked forest / hill zones carried over')
  ok(l.notes.length >= 1, 'moved or stored buildings are reported: ' + l.notes.join(' / '))
  ok(st.getItem(KEYS.beforeUpgrade) === raw, 'the v2 save is kept as it was (pre-v3 copy)')
  const w = worldFor({ ...d, cap: d.cap })
  ok(d.buildings.every((b) => around(w, { kind: 'building', x: b.x, y: b.y }).length > 0), 'every migrated building can be reached')
  const s2 = { ...d }
  store.save(s2, 9000)
  ok(st.getItem(KEYS.beforeUpgrade) === raw && JSON.parse(st.getItem(KEYS.save)).version === 3, 'after saving in v3 the old copy is still there')
  // a broken v2 save is never overwritten
  const bad = JSON.parse(raw)
  bad.data.manos = []
  bad.sum = (() => { let h = 0x811c9dc5; const str = JSON.stringify(bad.data); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) } return (h >>> 0).toString(16).padStart(8, '0') })()
  const st2 = new Mem({ [KEYS.save]: JSON.stringify(bad) })
  const r2 = createStore(st2).load()
  ok(r2.status === 'migrate-failed' && st2.getItem(KEYS.save) === JSON.stringify(bad), 'a v2 save that cannot be carried over is left untouched')
  // v1 still goes all the way
  const v1 = { game: 'mano-colony', version: 1, savedAt: 5, data: { wood: 9, stone: 8, stardust: 1, buildings: [{ type: 'house', lot: 'A5', level: 1 }], manoCount: 4, zones: ['A'], tutorialDone: true, savedAt: 5 } }
  const p1 = parse(JSON.stringify(v1))
  ok(p1.ok && p1.data.buildings.length === 1 && p1.data.manos.length === 4, 'v1 save migrates through v2 to v3')
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
