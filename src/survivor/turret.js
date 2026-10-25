// MANO SURVIVOR — the turret (chapter 20's reward; balance.json → turret).
// From turret.activeFromChapter on, in a run with it, a level-up can be spent
// on a turret instead of a card: two picks of the upgrades this run took (any
// two, of one card or of two) are taken back — the numbers they gave are
// undone — and one turret stands on the field. There is one kind of turret
// only: whatever the picks were, it is always the same.
//
// Taking a pick back: every pick remembers what it changed (`recordPick`, in
// choose), each number either multiplied (a ratio) or added to (a
// difference); taking it back divides or subtracts exactly that, so the
// upgrades left are as if that pick had never been chosen (the multiplying
// and the adding do not care about the order). A class's recipe cards are
// gone with the class change (zyo.js): they are never a turret's material.
//
// A turret stands where it was put (at random, inside the field, apart from
// the others and off the monsters) and shoots the nearest monster in range,
// every `interval` s, a little red ball. Its blow is a share of the run's
// main attack now: before the class change the ball's and the cats'
// firepower, after it the class's (its strength fixed at the change × its
// 전투력 cards); never under a usual build's at its level (zyo.js → floor),
// never more for what was given for it. Turrets last until the run
// ends; when the field shrinks to an extra special boss's fight area they are
// moved into it, at random.

import { classBase } from './zyo.js'

// what the ball and the fighting cats are: after the class change they are
// gone (zyo.js), so a pick that changed only these does nothing any more
const DEAD = new Set(['weapon.count', 'weapon.damage', 'weapon.bounces', 'weapon.splitChance', 'weapon.interval', 'weapon.radius', 'weapon.speed', 'cat.n', 'cat.size', 'cat.range', 'cat.speed', 'cat.rate', 'cat.claw'])

// the numbers a pick can change, and how: 'add' or 'mul'
const KEYS = [
  ['weapon', 'count', 'mul'],
  ['weapon', 'damage', 'mul'],
  ['weapon', 'bounces', 'mul'],
  ['weapon', 'splitChance', 'add'],
  ['weapon', 'interval', 'mul'],
  ['weapon', 'radius', 'mul'],
  ['weapon', 'critChance', 'add'],
  ['weapon', 'critMul', 'add'],
  ['weapon', 'speed', 'mul'],
  ['player', 'maxHp', 'mul'],
  ['player', 'speed', 'mul'],
  ['player', 'pickupR', 'mul'],
  ['player', 'coinMul', 'mul'],
  ['player', 'regen', 'add'],
  ['player', 'armor', 'mul'],
  ['player', 'xpMul', 'mul'],
  ['cat', 'n', 'add'],
  ['cat', 'size', 'mul'],
  ['cat', 'range', 'mul'],
  ['cat', 'speed', 'mul'],
  ['cat', 'rate', 'mul'],
  ['cat', 'claw', 'mul'],
  ['cls', 'dmg', 'mul'],
  ['cls', 'rate', 'mul'],
]
const WHOLE = new Set(['weapon.count', 'weapon.bounces', 'cat.n', 'nyang'])

// the numbers now (before a pick is applied)
export function snap(run) {
  const s = { nyang: run.nyang }
  for (const [o, k] of KEYS) if (run[o] && typeof run[o][k] === 'number') s[o + '.' + k] = run[o][k]
  return s
}

// a pick applied: what it changed, kept so it can be taken back
export function recordPick(run, id, before) {
  const after = snap(run)
  const d = {}
  for (const key of Object.keys(after)) {
    const a = after[key]
    const b = before[key]
    if (b === undefined || a === b) continue
    const mode = key === 'nyang' ? 'add' : KEYS.find(([o, k]) => o + '.' + k === key)[2]
    d[key] = mode === 'mul' && b !== 0 ? ['mul', a / b] : ['add', a - b]
  }
  ;(run.applied[id] ||= []).push(d)
}

// one pick of `id` taken back: its numbers undone, the pick uncounted
export function takeBack(run, id) {
  const d = run.applied[id] && run.applied[id].pop()
  if (!d) return false
  for (const [key, [mode, v]] of Object.entries(d)) {
    const [o, k] = key.split('.')
    const obj = key === 'nyang' ? null : run[o]
    if (key !== 'nyang' && !obj) continue
    let x = key === 'nyang' ? run.nyang : obj[k]
    x = mode === 'mul' ? x / v : x - v
    if (WHOLE.has(key)) x = Math.round(x)
    if (key === 'nyang') run.nyang = x
    else obj[k] = x
  }
  const p = run.player
  p.hp = Math.min(p.hp, p.maxHp)
  // (a friend cat fewer: the last one goes)
  if (run.friends.length > run.cat.n) run.friends.length = Math.max(0, run.cat.n)
  run.picks[id] = Math.max(0, (run.picks[id] || 0) - 1)
  if (!run.picks[id]) delete run.picks[id]
  return true
}

// the picks a turret can be made of now: { id: how many } — the run's own
// picks (those it remembers), less a class's recipe cards (gone with the
// change), never a class card
export function materials(run) {
  const out = {}
  const gone = run.cls ? new Set(run.D.balance.zyo.recipes[run.cls.k].mats) : null
  for (const [id, list] of Object.entries(run.applied)) {
    if (gone && gone.has(id)) continue
    const n = Math.min(list.length, run.picks[id] || 0)
    if (n > 0) out[id] = n
  }
  return out
}
// a pick of `id` that does nothing now (after the class change, one that
// changed only the ball or the fighting cats): a turret of it costs nothing
export function sunk(run, id) {
  const list = run.cls && run.applied[id]
  return !!list && list.length > 0 && list.every((d) => Object.keys(d).length > 0 && Object.keys(d).every((k) => DEAD.has(k)))
}
export const materialCount = (run) => Object.values(materials(run)).reduce((a, n) => a + n, 0)
export const canMake = (run) => !!run.turretOn && materialCount(run) >= run.D.balance.turret.cost

// is `ids` (cost picks: one id twice, or two ids) a turret's material now?
export function fits(run, ids) {
  const T = run.D.balance.turret
  if (!Array.isArray(ids) || ids.length !== T.cost) return false
  const have = materials(run)
  const want = {}
  for (const id of ids) want[id] = (want[id] || 0) + 1
  return Object.entries(want).every(([id, n]) => (have[id] || 0) >= n)
}

// the field the turrets stand in: the extra special boss's fight area during
// it, else the whole field
const field = (run) => (run.extra && run.extra.box) || run.arena.bounds

// a spot for a turret: inside the field, apart from the other turrets, off
// the monsters (the best of a few tries)
function spot(run, not) {
  const T = run.D.balance.turret
  const [x0, y0, x1, y1] = field(run)
  const m = T.place.margin
  let best = null
  let bs = -Infinity
  for (let i = 0; i < T.place.tries; i++) {
    const x = x0 + m + run.rng() * Math.max(1, x1 - x0 - 2 * m)
    const y = y0 + m + run.rng() * Math.max(1, y1 - y0 - 2 * m)
    let s = 0
    for (const t of run.turrets) if (t !== not) s -= Math.max(0, T.place.apart - Math.hypot(t.x - x, t.y - y))
    for (const e of run.enemies) if (e.state === 'live') s -= Math.max(0, e.r + T.place.clear - Math.hypot(e.x - x, e.y - y)) * 2
    if (s === 0) return { x, y }
    if (s > bs) (bs = s), (best = { x, y })
  }
  return best
}

export function placeTurret(run) {
  const T = run.D.balance.turret
  const at = spot(run)
  const t = { id: run.turretId++, x: at.x, y: at.y, cd: T.first, aim: -Math.PI / 2, kick: 0 }
  run.turrets.push(t)
  run.events.push({ type: 'turretMade', id: t.id, x: t.x, y: t.y })
  return t
}

// the field changed (the extra special boss's fight area): every turret
// outside it is put again, at random, inside
export function relocateTurrets(run) {
  const [x0, y0, x1, y1] = field(run)
  for (const t of run.turrets) {
    if (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1) continue
    const at = spot(run, t)
    t.x = at.x
    t.y = at.y
    run.events.push({ type: 'turretMade', id: t.id, x: t.x, y: t.y, moved: true })
  }
}

// the firepower a turret's blow is a share of: the ball's and the cats' now,
// or after the class change the class's (its strength at the change × its
// 전투력 cards, never the dead ball's numbers); never under a usual build's at
// this level (classBase, zyo.js)
export function turretBase(run) {
  if (!run.cls) return classBase(run)
  const F = run.D.balance.zyo.floor
  const cls = run.cls.base * run.cls.dmg * run.cls.rate
  return F && run.fp0 ? Math.max(cls, run.fp0 * Math.exp(F.perLevel * (run.level - 1))) : cls
}

// one shot's blow
export function turretHit(run) {
  const T = run.D.balance.turret
  return T.power * turretBase(run) * T.interval
}

export function updateTurrets(run, dt) {
  if (!run.turrets.length) return
  const T = run.D.balance.turret
  const R = T.range
  const hit = turretHit(run)
  for (const t of run.turrets) {
    t.kick = Math.max(0, t.kick - dt)
    t.cd -= dt
    if (t.cd > 0) continue
    let best = null
    let bd = R * R
    run.grid.near(t.x, t.y, R, (e) => {
      if (e.state !== 'live' || e.under) return
      const d = (e.x - t.x) ** 2 + (e.y - t.y) ** 2
      if (d < bd) (bd = d), (best = e)
    })
    if (!best) {
      t.cd = T.retry
      continue
    }
    t.aim = Math.atan2(best.y - t.y, best.x - t.x)
    t.kick = T.kick
    t.cd = T.interval
    run.events.push({ type: 'turretShot', id: t.id, x: t.x, y: t.y, tx: best.x, ty: best.y })
    run.hurt(best, hit, best.x, best.y, false, 'turret')
  }
}

