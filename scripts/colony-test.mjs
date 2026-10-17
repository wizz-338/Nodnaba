// Mano Colony rule, save and offline tests (no browser; storage is an
// in-memory stand-in, so no real save is ever touched).
//   node scripts/colony-test.mjs
import { newGame, tick, place, upgrade, canPlace, caps, homes } from '../src/colony/sim.js'
import { createWorld, refresh, findPath, nodeStands, lotStands, campStands, NODE, LOT } from '../src/colony/world.js'
import { applyOffline, elapsed } from '../src/colony/offline.js'
import { createStore, parse, serialize, envelope, checksum, exportText, KEYS } from '../src/colony/save.js'
import { BUILDINGS, OFFLINE, SAVE, START } from '../src/colony/config.js'

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
const fromData = (d) => {
  const s = d
  s.cap = caps(s)
  return s
}
const run = (s, w, secs, out = []) => {
  for (let t = 0; t < secs; t += 0.05) tick(s, w, 0.05, out)
  return out
}

// ── map: everything reachable once every zone is open ───────────────────────
{
  const s = newGame(0, 7)
  s.zones = { A: true, B: true, C: true }
  const w = createWorld()
  refresh(w, s)
  const [cx, cy] = campStands(w)[0]
  const bad = []
  for (const id in NODE) if (!nodeStands(w, id).some(([x, y]) => findPath(w, cx, cy, x, y))) bad.push(id)
  for (const id in LOT) if (!lotStands(w, id).some(([x, y]) => findPath(w, cx, cy, x, y))) bad.push(id)
  ok(bad.length === 0, `every node and lot is reachable from the camp ${bad.join(' ')}`)
  // and buildings on every lot never cut the village apart
  for (const id in LOT) s.buildings.push({ id: 'b' + id, type: 'house', lot: id, level: 1, build: null })
  refresh(w, s)
  const cut = []
  for (const id in NODE) if (!nodeStands(w, id).some(([x, y]) => findPath(w, cx, cy, x, y))) cut.push(id)
  for (const id in LOT) if (!lotStands(w, id).some(([x, y]) => findPath(w, cx, cy, x, y))) cut.push(id)
  ok(cut.length === 0, `with every lot built, every node and building can still be reached ${cut.join(' ')}`)
}

// ── save round trip ─────────────────────────────────────────────────────────
{
  const st = new Mem()
  const store = createStore(st)
  const s = newGame(1000, 9)
  const w = createWorld()
  refresh(w, s)
  run(s, w, 40)
  ok(store.load().status === 'new', 'empty storage → new game')
  ok(store.save(s, 50000).ok, 'save works')
  const r = store.load()
  ok(r.status === 'ok' && JSON.stringify(r.data.res) === JSON.stringify(serialize(s).res), 'load gives back the same resources')
  ok(r.data.manos.length === s.manos.length && r.data.buildings.length === s.buildings.length, 'same Manos and buildings')
  ok(!JSON.parse(st.getItem(KEYS.save)).data.manos.some((m) => '_path' in m || '_goal' in m), 'only plain data is saved (no paths or render state)')
  run(s, w, 5)
  store.save(s, 60000)
  ok(parse(st.getItem(KEYS.backup)).ok && JSON.parse(st.getItem(KEYS.backup)).savedAt === 50000, 'the previous save is kept as backup')
}

// ── damaged saves ───────────────────────────────────────────────────────────
{
  const st = new Mem()
  const store = createStore(st)
  const s = newGame(0, 3)
  store.save(s, 1)
  s.res.wood = 7
  store.save(s, 2)
  const good = st.getItem(KEYS.save)
  st.setItem(KEYS.save, good.slice(0, good.length / 2)) // cut off half way
  const r = store.load()
  ok(r.status === 'restored' && r.data.res.wood === START.res.wood, 'broken current save → restored from backup')
  ok(st.getItem(KEYS.corrupt) === good.slice(0, good.length / 2), 'the broken save is kept aside, not erased')

  // a value edited by hand → checksum no longer matches
  const env = JSON.parse(good)
  env.data.res.wood = 99999
  st.setItem(KEYS.save, JSON.stringify(env))
  ok(store.load().status === 'restored', 'edited save (checksum mismatch) is not trusted')

  // both broken → nothing is overwritten by loading
  st.setItem(KEYS.save, '{oops')
  st.setItem(KEYS.backup, 'null')
  const before = [st.getItem(KEYS.save), st.getItem(KEYS.backup)]
  const c = store.load()
  ok(c.status === 'corrupt' && c.raw === '{oops', 'both broken → recovery screen, raw data offered')
  ok(st.getItem(KEYS.save) === before[0] && st.getItem(KEYS.backup) === before[1], 'loading never replaces a broken save with a new game')
}

// ── validation of values ────────────────────────────────────────────────────
{
  const base = serialize(newGame(0, 5))
  const wrap = (mut) => {
    const d = JSON.parse(JSON.stringify(base))
    mut(d)
    return parse(JSON.stringify(envelope(d)))
  }
  ok(wrap(() => {}).ok, 'a clean save passes the checks')
  ok(!wrap((d) => (d.res.stone = -5)).ok, 'negative resources rejected')
  ok(!wrap((d) => (d.res.wood = NaN)).ok, 'NaN rejected')
  ok(!wrap((d) => d.buildings.push({ id: 'b1', type: 'castle', lot: 'A1', level: 1, build: null })).ok, 'unknown building type rejected')
  ok(!wrap((d) => d.buildings.push({ id: 'b1', type: 'house', lot: 'A1', level: 1, build: null }, { id: 'b2', type: 'house', lot: 'A1', level: 1, build: null })).ok, 'two buildings on one lot rejected')
  ok(!wrap((d) => d.buildings.push({ id: 'b1', type: 'house', lot: 'A1', level: 4, build: null })).ok, 'level 4 rejected')
  ok(!wrap((d) => (d.zones = { A: true, B: false, C: true })).ok, 'zone C without B rejected')
  ok(!wrap((d) => (d.manos = [])).ok, 'a village with no Manos rejected')
  const trimmed = wrap((d) => (d.res.wood = 5000))
  ok(trimmed.ok && trimmed.data.res.wood === START.baseCap.wood, 'stock above the storage limit is trimmed to the limit')
  ok(parse('hello').kind === 'corrupt' && parse('{"game":"other"}').kind === 'foreign', 'non-JSON and foreign files rejected')
}

// ── versions ────────────────────────────────────────────────────────────────
{
  const v1 = {
    game: 'mano-colony',
    version: 1,
    savedAt: 5000,
    data: { wood: 40, stone: 22, stardust: 3, buildings: [{ type: 'house', lot: 'A2', level: 2 }, { type: 'lumber', lot: 'A1', level: 1 }], manoCount: 5, zones: ['A', 'B'], tutorialDone: true, savedAt: 5000 },
  }
  const r = parse(JSON.stringify(v1))
  ok(r.ok && r.migrated && r.data.res.wood === 40 && r.data.buildings.length === 2 && r.data.manos.length === 5 && r.data.zones.B && r.data.tutorial.done, 'version 1 save migrates with progress kept')
  const st = new Mem({ [KEYS.save]: JSON.stringify(v1) })
  const store = createStore(st)
  const l = store.load()
  ok(l.status === 'migrated', 'load reports a migrated save')
  const fut = JSON.stringify({ game: 'mano-colony', version: SAVE.version + 1, savedAt: 1, data: {} })
  const st2 = new Mem({ [KEYS.save]: fut })
  const f = createStore(st2).load()
  ok(f.status === 'future' && st2.getItem(KEYS.save) === fut, 'newer-version save → not loaded, not overwritten')
}

// ── storage failures ────────────────────────────────────────────────────────
{
  class Full extends Mem {
    setItem() {
      const e = new Error('quota')
      e.name = 'QuotaExceededError'
      throw e
    }
  }
  class Drop extends Mem {
    setItem() {}
  }
  const s = newGame(0, 1)
  const a = createStore(new Full()).save(s)
  ok(!a.ok && a.error === 'full', 'storage full → save reports failure (not success)')
  const b = createStore(new Drop()).save(s)
  ok(!b.ok && b.error === 'verify', 'write that silently does not stick → reported as failure')
  ok(createStore(null).save(s).error === 'unavailable', 'no storage at all → reported as unavailable')
}

// ── reset only touches this game ────────────────────────────────────────────
{
  const st = new Mem({ 'nodnaba:manorun:best': '535', 'other-site-key': 'x' })
  const store = createStore(st)
  store.save(newGame(), 1)
  store.save(newGame(), 2)
  store.reset()
  ok(st.getItem(KEYS.save) === null && st.getItem(KEYS.backup) === null, 'reset removes the game save and backup')
  ok(st.getItem('nodnaba:manorun:best') === '535' && st.getItem('other-site-key') === 'x', 'reset leaves MANO RUN best score and other keys alone')
}

// ── building across a save: paid once, finished once ────────────────────────
{
  const st = new Mem()
  const store = createStore(st)
  const s = newGame(0, 11)
  s.res = { wood: 60, stone: 30, stardust: 0 }
  const w = createWorld()
  refresh(w, s)
  const r1 = place(s, w, 'house', 'A2')
  const r2 = place(s, w, 'house', 'A2') // double tap
  ok(r1.ok && !r2.ok && s.res.wood === 30 && s.res.stone === 20, 'placing pays once; a second tap on the same lot does nothing')
  run(s, w, 6)
  const p = s.buildings[0].build.progress
  ok(p > 0 && p < BUILDINGS.house.levels[0].work, `building half way (${p.toFixed(1)} / ${BUILDINGS.house.levels[0].work})`)
  store.save(s, 1)
  const l = store.load()
  const s2 = fromData(l.data)
  const w2 = createWorld()
  refresh(w2, s2)
  ok(Math.abs(s2.buildings[0].build.progress - p) < 0.01 && s2.res.wood >= 30 - 0.001, 'after reload: same progress, cost not taken again')
  const out = run(s2, w2, 30)
  const built = out.filter((e) => e.type === 'built')
  ok(built.length === 1 && s2.buildings[0].level === 1 && s2.stats.built === 1, 'construction finishes exactly once after reload')
}

// ── offline time ────────────────────────────────────────────────────────────
{
  ok(elapsed(10000, 5000).seconds === 0, 'clock set back → 0 s, no negative reward')
  const big = elapsed(0, 30 * 3600 * 1000)
  ok(big.seconds === OFFLINE.maxSeconds && big.capped, 'a day and more away → capped at 8 h')
  ok(elapsed(NaN, 1).seconds === 0, 'broken time → 0 s')

  const s = newGame(0, 21)
  const w = createWorld()
  refresh(w, s)
  run(s, w, 20) // everyone has a job
  const before = { ...s.res }
  const gatherers = s.manos.filter((m) => m.task && m.task.kind === 'gather').length
  const t0 = performance.now()
  const rep = applyOffline(s, w, 3600)
  const ms = performance.now() - t0
  const c = caps(s)
  ok(Object.keys(c).every((k) => s.res[k] <= c[k]), 'offline gains never pass the storage limit')
  ok(Object.keys(before).every((k) => s.res[k] >= before[k]), 'offline never takes resources away')
  ok(ms < 50, `an hour away is one calculation (${ms.toFixed(1)} ms)`)
  ok(gatherers > 0 && Object.values(rep.gains).some((v) => v > 0), `gathering Manos (${gatherers}) produced: ${JSON.stringify(rep.gains)}`)

  // conservative: compare with an hour simulated online from the same start
  const a = newGame(0, 33)
  const wa = createWorld()
  refresh(wa, a)
  a.res = { wood: 0, stone: 0, stardust: 0 }
  run(a, wa, 10)
  const b = JSON.parse(JSON.stringify(serialize(a)))
  const sb = fromData(b)
  const wb = createWorld()
  refresh(wb, sb)
  run(a, wa, 120)
  applyOffline(sb, wb, 120)
  const online = a.res.wood + a.res.stone + a.res.stardust
  const offline = sb.res.wood + sb.res.stone + sb.res.stardust
  ok(offline <= online + 2, `offline (${Math.floor(offline)}) is not more than the same time online (${Math.floor(online)})`)

  // no double claim: reward and its time are saved together
  const st = new Mem()
  const store = createStore(st)
  const g = newGame(0, 4)
  const wg = createWorld()
  refresh(wg, g)
  run(g, wg, 20)
  g.clock.simAt = 1000
  store.save(g, 1000)
  const now = 1000 + 1800 * 1000
  const l1 = fromData(store.load().data)
  const w1 = createWorld()
  refresh(w1, l1)
  applyOffline(l1, w1, elapsed(l1.clock.simAt, now).seconds)
  l1.clock.simAt = now
  store.save(l1, now)
  const got = l1.res.wood
  // the page is reloaded right away: nothing more to claim
  const l2 = fromData(store.load().data)
  const again = elapsed(l2.clock.simAt, now + 500).seconds
  ok(again < 1 && l2.res.wood === got, 'reloading right after a reward claims nothing again')
}

// ── homes and arrivals ──────────────────────────────────────────────────────
{
  const s = newGame(0, 2)
  const w = createWorld()
  refresh(w, s)
  ok(homes(s) === START.baseHomes && s.manos.length === START.baseHomes, 'start: 3 Manos, room for 3')
  s.buildings.push({ id: 'b1', type: 'house', lot: 'A2', level: 1, build: null })
  refresh(w, s)
  const out = run(s, w, 45)
  ok(out.filter((e) => e.type === 'arrive').length === 2 && s.manos.length === 5, 'a house brings two new Manos, one after another')
  run(s, w, 60)
  ok(s.manos.length === 5, 'no one moves in without a free home')
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
