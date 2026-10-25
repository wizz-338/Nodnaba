// MANO SURVIVOR — zyo_'s class change (balance.json → zyo; zyo.json names it).
//
// The artist zyo_ joins for good with chapter 15's first clear. From her
// chapter on (zyo.activeFromChapter), a run can change class once: four
// recipes, each two upgrade cards picked `need` times (a card Tizzzz rewrote
// counts as the times it did its effect, as run.picks counts it).
//   A 왕 탱탱볼 + 탱탱볼 개수   → 거대 탱탱볼, 회전 방어막
//   B 공격 주기 + 투사체 속도   → 거대 탱탱볼, 최후의 반격
//   C 뚱냥이 + 빠르게 할퀴기    → 닌자냥이, 흡혈
//   D 스피드냥이 + 발톱 갈기    → 닌자냥이, 쌍둥이 워프홀
// With 21 cards and three shown, two of them picked ten times each would
// almost never happen (bots that hunt for them: 0–2 runs in 16), so zyo_
// adds a card of her own to the level-up (never in place of one): the
// recipe furthest along, its card that has fewer picks. Once a recipe is
// complete its class card is offered there instead, at every level-up,
// until the player takes it (it never happens by itself).
//
// The class change replaces both attacks: the balls stop and the fighting
// cats leave (단추·호두·모루 go on picking up). What they could do becomes
// the new attack's strength, counted once (no crit: every hit rolls its own):
//   base = the ball's damage × count ÷ gap + one cat's scratch × cats ÷ its gap
// The new attack deals bonus × base a second on one target when all of it
// is on that target (its hits also hit whatever else they touch), × the
// 전투력 card's damage and rate. A handful of units, however big the build:
//   거대 탱탱볼: `ball.count` giant balls that chase monsters near Mano and
//     roll round the one they caught, hitting all they touch
//   닌자냥이: `ninja.count` cats that dash to a monster and slash round it
// and the special: A three more giant balls circling Mano that push monsters
// away; B a blast and full HP once a run when Mano falls; C healing from the
// share of monsters' HP the ninjas took (overkill counts nothing); D two
// linked warp holes far apart that Mano walks into.
// Every few seconds the class also casts its skill over the screen, on
// monsters wherever they are: 탱탱 메테오 (giant balls falling on them) or
// 그림자 분신 (shadow ninjas cutting them), a share of its damage (skill).
// Each 전투력 picked (its level) makes the units and their hit areas bigger
// and the skill cast more at once (never more units): growth, skill.
// After it the cards are the eight that are not attacks and 전투력, and no
// recipe or class card comes again that run.

import { critCount, TAU } from './weapons.js'
import { catDamage, catInterval } from './friends.js'

export const CLASS_CARDS = { A: 'clsA', B: 'clsB', C: 'clsC', D: 'clsD' }
// a card's name in this run: after the change 전투력 goes by the class's own
// name (닌자냥이▪흡혈 …), as its level
export const optionName = (run, id) => {
  const O = run.D.upgrades.options
  if (id === 'power' && run.cls) return O[CLASS_CARDS[run.cls.k]].name
  return O[id] ? O[id].name : id
}
export const isClassCard = (id) => typeof id === 'string' && /^cls[A-D]$/.test(id)
export const classOf = (id) => id.slice(3)

// every recipe and how far this run is along it
export function recipes(run) {
  const Z = run.D.balance.zyo
  return Object.entries(Z.recipes).map(([k, r]) => {
    const picks = r.mats.map((m) => run.picks[m] || 0)
    return { k, form: r.form, mats: r.mats, picks, ready: picks.every((n) => n >= Z.need) }
  })
}

// the recipe the player is going for: both its cards picked counts first
// (the fewer of the two), then all its picks — one card picked often for its
// own sake (a ball's count) does not make its recipe the one. null: none yet
export function zyoTarget(run) {
  if (!run.zyo || run.cls) return null
  const Z = run.D.balance.zyo
  let best = null
  for (const r of recipes(run)) {
    if (!r.mats.every((m) => run.pool.includes(m))) continue
    const got = r.picks.map((n) => Math.min(Z.need, n))
    const sum = got[0] + got[1]
    const score = Math.min(got[0], got[1]) * 100 + sum
    if (sum > 0 && (!best || score > best.score)) best = { r, score }
  }
  return best && best.r
}

// zyo_ adds no card of her own: the cards come at random as any other, and
// she marks those of hers that came. Her cards in the draw (beside the
// run's pool): a complete recipe's class card, once a run (before the
// change). After the change the class's own growth card (전투력, shown
// under the class's name) is in the pool with the eight left.
export function zyoPool(run) {
  if (!run.zyo || run.cls) return []
  return recipes(run)
    .filter((r) => r.ready && r.mats.every((m) => run.pool.includes(m)))
    .map((r) => CLASS_CARDS[r.k])
}

// zyo_'s own card beside the three drawn, some of the time (`offer`: the
// chance at a level-up; `shown`: the three): the recipe she is going for's
// card it needs most (one this run can pick now: `open`), or after the change
// the class's growth card; none when it is among the three already
export function zyoCards(run, shown, open) {
  const Z = run.D.balance.zyo
  if (!run.zyo && !run.cls) return []
  let id = null
  if (run.cls) id = 'power'
  else {
    const best = zyoTarget(run)
    if (!best) return []
    const left = best.mats.filter((m, i) => best.picks[i] < Z.need && open(m))
    left.sort((a, b) => (run.picks[a] || 0) - (run.picks[b] || 0))
    id = left[0]
  }
  if (!id || shown.includes(id) || run.rng() >= (Z.offer ?? 1)) return []
  return [id]
}

// the cards on show zyo_ marks: a class card; the recipe she is going for's
// cards it still needs; after the change, the class's growth card
export function zyoMarks(run) {
  if (run.cls) return run.choices.filter((id) => id === 'power')
  if (!run.zyo) return []
  const r = zyoTarget(run)
  const need = run.D.balance.zyo.need
  return run.choices.filter((id) => isClassCard(id) || (r && r.mats.includes(id) && (run.picks[id] || 0) < need))
}

// the strength of the attacks there are now, one number a second (see above)
export function firepower(run) {
  const w = run.weapon
  const ball = (w.damage * w.count) / w.interval
  const cats = run.cat.n > 0 ? (catDamage(run) * run.cat.n) / catInterval(run) : 0
  return ball + cats
}

// the class attack's numbers now: one hit of a unit, the gap between its hits
// (the rate past rateCap turns into damage, so hits never come too thick)
// what the class starts from: the run's firepower now, but never under a
// usual build's at this level (floor: its firepower at the start × e^(perLevel
// × levels gone by), a bot's median), so a class taken from a build that put
// its picks elsewhere is not left behind
export function classBase(run) {
  const F = run.D.balance.zyo.floor
  const fp = firepower(run)
  if (!F || !run.fp0) return fp
  return Math.max(fp, run.fp0 * Math.exp(F.perLevel * (run.level - 1)))
}

// the class's level: the 전투력 picked (a rewritten one counts twice)
export const classLevel = (run) => run.picks.power || 0
// how much bigger its units and hit areas are at that level
export const growth = (run) => 1 + run.D.balance.zyo.growth.perLevel * Math.min(classLevel(run), run.D.balance.zyo.growth.maxLevels)

function hitOf(run, unit) {
  const Z = run.D.balance.zyo
  const C = run.cls
  const U = Z[unit]
  const rate = Math.min(C.rate, Z.rateCap)
  const gap = U.hitGap / rate
  const dmg = (C.base * C.bonus * U.share * C.dmg * (C.rate / rate) * U.hitGap) / U.count
  return { dmg, gap }
}
// what the class does a second on one target with all of it there (the
// cards and the run stats show it)
export const classDps = (run, cls = run.cls) => cls.base * cls.bonus * cls.dmg * cls.rate
// a recipe's own bonus (its cards add less firepower: ×0.7 gaps against ×2
// counts and claws, so it is evened out here) times the class's bonus
export const bonusOf = (D, k) => D.balance.zyo.bonus * (D.balance.zyo.recipes[k].bonus || 1)

// ── the change ──────────────────────────────────────────────────────────────

export function startClass(run, k) {
  const Z = run.D.balance.zyo
  const R = Z.recipes[k]
  const p = run.player
  run.cls = {
    k,
    form: R.form,
    base: classBase(run),
    bonus: bonusOf(run.D, k),
    dmg: 1, // the 전투력 card: damage
    rate: 1, // and how often
    at: run.t,
    fxEnd: run.t + Z.fxSeconds,
    // what was out gathers to Mano in the change's moment (drawn only)
    gather: [...run.balls.slice(0, 48).map((b) => ({ x: b.x, y: b.y, kind: 'ball', r: b.r })), ...run.friends.map((c) => ({ x: c.x, y: c.y, kind: 'cat' }))],
    units: [],
    shield: [],
    revives: k === 'B' ? Z.revive.times : 0,
    heal: Z.lifesteal.perSecond * p.maxHp, // the healing bucket (C)
    healed: 0,
    warps: null, // D: the two holes
    warpLock: null,
    warpCd: 0,
    blasts: 0,
    skillT: Z.skill.first, // till its first skill
    casts: [], // the skill's strikes on their way: { x, y, r, dmg, at }
    skills: 0,
  }
  run.balls = []
  run.friends = []
  // the cards from now on: the eight that are not attacks, and 전투력
  run.pool = [...Z.keep, 'power']
  // nothing hurts her while the notes gather
  p.inv = Math.max(p.inv, Z.fxSeconds + 0.3)
  run.stats.classAt = run.t
  run.stats.classK = k
  run.events.push({ type: 'classChange', k, form: R.form, x: p.x, y: p.y })
}

// the units come out when the notes have gathered
function deploy(run) {
  const Z = run.D.balance.zyo
  const C = run.cls
  const p = run.player
  const n = C.form === 'ball' ? Z.ball.count : Z.ninja.count
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    C.units.push({ id: i, x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30, vx: 0, vy: 0, target: null, spin: a, cd: 0, locks: new Map(), trail: [], face: 1, slash: 0, seek: 0 })
  }
  if (C.k === 'A') for (let i = 0; i < Z.shield.count; i++) C.shield.push({ a: (i / Z.shield.count) * TAU, x: p.x, y: p.y, locks: new Map() })
  if (C.k === 'D') placeWarps(run)
  run.events.push({ type: 'classReady', k: C.k, form: C.form, x: p.x, y: p.y })
}

// ── a target near Mano, on the field (as the cats: never far off) ──────────
// The first half of the units (rounded up) go for a boss or an elite within
// HUNT leashes of Mano, while there is one: the giant balls and the ninjas
// never leave the chapter's boss alone while Mano keeps away from it.

const hunter = (run, u) => u.id < Math.ceil(run.cls.units.length / 2)
// where the units may go after monsters: the whole field (the extra special
// boss's fight area during it), within their leash of Mano
const field = (run) => (run.extra && run.extra.box) || run.arena.bounds
const HUNT = 2.5
function bigOne(run, x, y) {
  const [vx0, vy0, vx1, vy1] = field(run)
  const p = run.player
  const far = (run.D.balance.zyo.leash * HUNT) ** 2
  let best = null
  let bd = Infinity
  for (const e of run.enemies) {
    if (!e.rank || e.state !== 'live' || e.under) continue
    if (e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) continue
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > far) continue
    const d = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d < bd) (bd = d), (best = e)
  }
  return best
}

function findTarget(run, x, y, u) {
  if (u && hunter(run, u)) {
    const b = bigOne(run, x, y)
    if (b) return b
  }
  const Z = run.D.balance.zyo
  const p = run.player
  const [vx0, vy0, vx1, vy1] = field(run)
  const L2 = Z.leash * Z.leash
  let best = null
  let bd = Infinity
  for (const R of [140, Z.leash * 2]) {
    run.grid.near(x, y, R, (e) => {
      if (e.state !== 'live' || e.under) return
      if (e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) return
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > L2) return
      const d = (e.x - x) ** 2 + (e.y - y) ** 2
      if (d < bd) (bd = d), (best = e)
    })
    if (best) break
  }
  return best
}
const alive = (e) => e && e.state === 'live' && !e.under

// one hit of the class on e (crits rolled here); returns the HP it took
function strike(run, e, dmg, x, y, by) {
  const w = run.weapon
  const crits = critCount(w.critChance, w.critChance > 0 ? run.rng() : 1)
  const n = dmg * w.critMul ** crits
  const eff = run.hurt(e, n, x, y, crits > 0, by) || 0
  if (by !== 'ninja' && run.blessHit && e.state === 'live') run.blessHit(e, n, x, y)
  return eff
}

// ── every step ──────────────────────────────────────────────────────────────

export function updateClass(run, dt) {
  const C = run.cls
  if (!C) return
  if (run.t < C.fxEnd) return
  if (!C.units.length) deploy(run)
  if (C.form === 'ball') updateGiants(run, dt)
  else updateNinjas(run, dt)
  updateSkill(run, dt)
  if (C.k === 'A') updateShield(run, dt)
  if (C.k === 'C') C.heal = Math.min(run.D.balance.zyo.lifesteal.perSecond * run.player.maxHp, C.heal + run.D.balance.zyo.lifesteal.perSecond * run.player.maxHp * dt)
  if (C.k === 'D') updateWarps(run, dt)
}

// 거대 탱탱볼: chases a monster near Mano, then rolls round it (hitting all it
// touches, each at most once a gap); with nothing to chase it keeps by Mano
function updateGiants(run, dt) {
  const Z = run.D.balance.zyo
  const G = Z.ball
  const p = run.player
  const { dmg, gap } = hitOf(run, 'ball')
  for (const u of run.cls.units) {
    u.seek -= dt
    if (!alive(u.target) || u.seek <= 0) {
      const t = findTarget(run, u.x, u.y, u)
      if (t !== u.target) u.target = t
      u.seek = 0.4
    }
    let gx
    let gy
    if (u.target) {
      // round its target, close
      u.spin += G.roll * dt
      const R = u.target.r + G.radius * 0.7
      gx = u.target.x + Math.cos(u.spin) * R
      gy = u.target.y + Math.sin(u.spin) * R
    } else {
      u.spin += 1.6 * dt
      gx = p.x + Math.cos(u.spin + u.id * Math.PI) * 46
      gy = p.y + Math.sin(u.spin + u.id * Math.PI) * 46
    }
    const dx = gx - u.x
    const dy = gy - u.y
    const d = Math.hypot(dx, dy)
    const step = Math.min(d, G.speed * dt)
    if (d > 0) (u.x += (dx / d) * step), (u.y += (dy / d) * step)
    u.vx = d > 0 ? (dx / d) * G.speed : 0
    u.vy = d > 0 ? (dy / d) * G.speed : 0
    touch(run, u, G.radius * growth(run), dmg, gap, 'giant', 0)
  }
}

// a giant ball's touch: every monster under it not hit too lately
function touch(run, u, r, dmg, gap, by, push) {
  const t = run.t
  for (const [id, until] of u.locks) if (until <= t) u.locks.delete(id)
  run.grid.near(u.x, u.y, r + 60, (e) => {
    if (e.state !== 'live' || e.under) return
    const dx = e.x - u.x
    const dy = e.y - u.y
    const rr = e.r + r
    if (dx * dx + dy * dy >= rr * rr) return
    if (push && e.behavior !== 'boss' && e.behavior !== 'extra') {
      // pushed out of the shield's way
      const d = Math.hypot(dx, dy) || 1
      e.x += (dx / d) * Math.min(push, rr - d + 2)
      e.y += (dy / d) * Math.min(push, rr - d + 2)
    }
    if (u.locks.has(e.id)) return
    u.locks.set(e.id, t + gap)
    strike(run, e, dmg, (e.x + u.x) / 2, (e.y + u.y) / 2, by)
  })
}

// A: 회전 방어막 — three more giant balls circle Mano, and inside their ring
// the monsters (not a boss) are pushed out faster than any of them walks:
// room round her, however many there are
function updateShield(run, dt) {
  const Z = run.D.balance.zyo
  const S = Z.shield
  const p = run.player
  const { dmg, gap } = hitOf(run, 'shield')
  for (const s of run.cls.shield) {
    s.a += S.spin * dt
    s.x = p.x + Math.cos(s.a) * S.orbit
    s.y = p.y + Math.sin(s.a) * S.orbit
    touch(run, s, S.radius * growth(run), dmg, gap, 'shield', S.push)
  }
  const R = S.orbit + S.radius
  run.grid.near(p.x, p.y, R + 60, (e) => {
    if (e.state !== 'live' || e.behavior === 'boss' || e.behavior === 'extra') return
    const dx = e.x - p.x
    const dy = e.y - p.y
    const d = Math.hypot(dx, dy) || 1
    const out = R + e.r * 0.5 - d
    if (out <= 0) return
    const m = Math.min(out, S.pushSpeed * dt)
    e.x += (dx / d) * m
    e.y += (dy / d) * m
  })
}

// 닌자냥이: dashes to a monster near Mano and slashes round it (the slash hits
// every monster within slashR of it); a fallen target, the next at once
function updateNinjas(run, dt) {
  const Z = run.D.balance.zyo
  const N = Z.ninja
  const p = run.player
  const C = run.cls
  const { dmg, gap } = hitOf(run, 'ninja')
  for (const u of C.units) {
    u.cd -= dt
    if (u.slash > 0) u.slash -= dt
    u.seek -= dt
    if (!alive(u.target) || (u.seek <= 0 && hunter(run, u) && !u.target.rank)) (u.target = findTarget(run, u.x, u.y, u)), (u.seek = 0.5)
    let gx
    let gy
    const e = u.target
    if (e) {
      const a = u.spin
      gx = e.x + Math.cos(a) * (e.r + N.reach * 0.6)
      gy = e.y + Math.sin(a) * (e.r + N.reach * 0.6)
    } else {
      u.spin += 1.2 * dt
      gx = p.x + Math.cos(u.spin + (u.id * TAU) / N.count) * 34
      gy = p.y + Math.sin(u.spin + (u.id * TAU) / N.count) * 26
    }
    const dx = gx - u.x
    const dy = gy - u.y
    const d = Math.hypot(dx, dy)
    const sp = (e ? N.speed : N.speed * 0.5) * dt
    if (d > 0) {
      const s = Math.min(d, sp)
      u.x += (dx / d) * s
      u.y += (dy / d) * s
      if (Math.abs(dx) > 1) u.face = dx > 0 ? 1 : -1
    }
    // the afterimage: where it was a moment ago
    if (d > 2) {
      u.trail.push(u.x, u.y)
      if (u.trail.length > 8) u.trail.splice(0, 2)
    } else if (u.trail.length) u.trail.splice(0, 2)
    if (!e || u.cd > 0) continue
    const reach = e.r + N.reach
    if ((e.x - u.x) ** 2 + (e.y - u.y) ** 2 > reach * reach) continue
    // the slash: round the target to its other side, every monster near it hit
    u.cd = gap
    u.slash = 0.16
    u.spin += Math.PI * (0.7 + run.rng() * 0.6)
    u.face = e.x > u.x ? 1 : -1
    const sr = N.slashR * growth(run)
    run.events.push({ type: 'slash', x: e.x, y: e.y, r: sr })
    let took = 0
    run.grid.near(e.x, e.y, sr + 60, (o) => {
      if (o.state !== 'live' || o.under) return
      const rr = sr + o.r
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 >= rr * rr) return
      const eff = strike(run, o, dmg, o.x, o.y - 4, 'ninja')
      if (C.k === 'C' && eff > 0) took += drained(run, o, eff)
    })
    if (took > 0) lifesteal(run, took)
  }
}

// C: the share of a monster's HP taken, as healing (a boss's whole HP heals more)
function drained(run, o, eff) {
  const L = run.D.balance.zyo.lifesteal
  return (eff / o.maxHp) * (o.rank ? L.boss : L.mob)
}

// ── the skill: every few seconds, over the whole screen ────────────────────
// 탱탱 메테오 (giant balls) / 그림자 분신 (ninjas): `count` (more with the
// level, up to max) strikes on monsters on screen, a boss first when there is
// one, each landing `delay` s later and hitting every monster within its
// radius (bigger with the level). Together they deal `share` of the class's
// one-target damage a second, so the skill is part of the class, not on top
// of it without end.
function updateSkill(run, dt) {
  const Z = run.D.balance.zyo
  const K = Z.skill
  const C = run.cls
  C.skillT -= dt
  // what was cast lands
  for (let i = C.casts.length - 1; i >= 0; i--) {
    const c = C.casts[i]
    if (run.t < c.at) continue
    C.casts.splice(i, 1)
    let took = 0
    run.grid.near(c.x, c.y, c.r + 60, (o) => {
      if (o.state !== 'live' || o.under) return
      const rr = c.r + o.r
      if ((o.x - c.x) ** 2 + (o.y - c.y) ** 2 >= rr * rr) return
      const eff = strike(run, o, c.dmg, o.x, o.y - 6, 'skill')
      if (C.k === 'C' && eff > 0) took += drained(run, o, eff)
    })
    if (took > 0) lifesteal(run, took)
    run.events.push({ type: 'skillHit', kind: C.form, x: c.x, y: c.y, r: c.r })
  }
  if (C.skillT > 0) return
  const every = K.every / Math.min(C.rate, Z.rateCap)
  C.skillT = every
  // the monsters on screen, a boss or an elite first
  const [vx0, vy0, vx1, vy1] = run.view
  const live = run.enemies.filter((e) => e.state === 'live' && !e.under && e.x > vx0 && e.x < vx1 && e.y > vy0 && e.y < vy1)
  if (!live.length) return
  const n = Math.min(K.max, K.count + Math.floor(classLevel(run) / K.perLevels))
  const big = live.filter((e) => e.rank)
  const picked = []
  for (const e of big) if (picked.length < n) picked.push(e)
  const rest = live.filter((e) => !e.rank)
  while (picked.length < n && rest.length) picked.push(rest.splice(Math.floor(run.rng() * rest.length), 1)[0])
  while (picked.length < n) picked.push(live[Math.floor(run.rng() * live.length)])
  const dmg = (classDps(run) * K.share * every) / n
  const r = K.radius * growth(run)
  const list = picked.map((e, i) => ({ x: e.x + (run.rng() - 0.5) * 10, y: e.y + (run.rng() - 0.5) * 10, r, dmg, at: run.t + K.delay + i * K.stagger }))
  C.casts.push(...list)
  C.skills++
  run.events.push({ type: 'skillCast', kind: C.form, list: list.map((c) => ({ x: c.x, y: c.y, r: c.r, at: c.at - run.t })), x: run.player.x, y: run.player.y })
}

// C: 흡혈 — heal Mano by `share` × her full HP, never past it, never more than
// lifesteal.perSecond of it a second
function lifesteal(run, share) {
  const p = run.player
  const C = run.cls
  if (p.hp >= p.maxHp) return
  const n = Math.min(share * p.maxHp, C.heal, p.maxHp - p.hp)
  if (n <= 0) return
  C.heal -= n
  C.healed += n
  p.hp += n
  run.stats.lifesteal = (run.stats.lifesteal || 0) + n
  if (n >= p.maxHp * 0.01) run.events.push({ type: 'heal', x: p.x, y: p.y, n })
}

// B: 최후의 반격 — Mano falls: the blast, full HP, a moment safe. Returns true
// when she got up (game.js then does not let her fall)
export function revive(run) {
  const C = run.cls
  if (!C || C.revives <= 0) return false
  const Z = run.D.balance.zyo
  const V = Z.revive
  const p = run.player
  C.revives--
  C.blasts++
  p.hp = p.maxHp
  p.inv = V.inv
  const blow = classDps(run) * V.seconds
  run.grid.near(p.x, p.y, V.radius + 60, (e) => {
    if (e.state !== 'live' || e.under) return
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d > V.radius + e.r) return
    // a boss loses at most bossCap of its HP to it; it breaks through a guard
    const n = e.rank ? Math.min(blow, e.maxHp * V.bossCap) : blow
    run.hurt(e, n, e.x, e.y - 6, false, 'blast')
    if (e.state === 'live' && e.behavior !== 'boss' && e.behavior !== 'extra' && d > 0) {
      e.x += ((e.x - p.x) / d) * 60
      e.y += ((e.y - p.y) / d) * 60
    }
  })
  // what was coming at her goes too
  run.shots = []
  run.events.push({ type: 'revive', x: p.x, y: p.y, r: V.radius })
  return true
}

// ── D: 쌍둥이 워프홀 ───────────────────────────────────────────────────────
// Two linked holes far apart in the field (in the extra boss's area during its
// fight). Mano walks into one and comes out of the other; she must step out
// of the hole she came out of before either works again (and `cooldown` s
// pass), so she never bounces between them. Monsters cannot use them; the
// ones at the exit are pushed back and she is safe a moment.

const warpBox = (run) => (run.extra && run.extra.box) || run.arena.bounds
function placeWarps(run) {
  const W = run.D.balance.zyo.warp
  const B = warpBox(run)
  const C = run.cls
  C.warpBox = B
  C.warps = W.at.map(([fx, fy]) => ({ x: B[0] + (B[2] - B[0]) * fx, y: B[1] + (B[3] - B[1]) * fy }))
  C.warpLock = null
  C.warpCd = 0
}
function updateWarps(run, dt) {
  const W = run.D.balance.zyo.warp
  const C = run.cls
  const p = run.player
  if (C.warpBox !== warpBox(run)) placeWarps(run)
  C.warpCd -= dt
  const H = C.warps
  if (C.warpLock !== null && Math.hypot(p.x - H[C.warpLock].x, p.y - H[C.warpLock].y) > W.radius + 14) C.warpLock = null
  if (C.warpLock !== null || C.warpCd > 0 || run.state !== 'play') return
  for (let i = 0; i < 2; i++) {
    if (Math.hypot(p.x - H[i].x, p.y - H[i].y) > W.radius) continue
    const o = H[1 - i]
    const from = { x: p.x, y: p.y }
    p.x = o.x
    p.y = o.y
    C.warpLock = 1 - i
    C.warpCd = W.cooldown
    p.inv = Math.max(p.inv, W.inv)
    // room at the exit: the monsters there pushed back (bosses stand)
    run.grid.near(o.x, o.y, W.clear + 60, (e) => {
      if (e.state !== 'live' || e.behavior === 'boss' || e.behavior === 'extra') return
      const dx = e.x - o.x
      const dy = e.y - o.y
      const d = Math.hypot(dx, dy) || 1
      if (d >= W.clear + e.r) return
      e.x = o.x + (dx / d) * (W.clear + e.r)
      e.y = o.y + (dy / d) * (W.clear + e.r)
    })
    run.stats.warps = (run.stats.warps || 0) + 1
    run.events.push({ type: 'warp', from, to: { x: o.x, y: o.y } })
    break
  }
}

// ── the 전투력 card ──────────────────────────────────────────────────────────

// what one 전투력 does (pure): damage × (damageMul + damageMulPerLevel × the
// run's levels past damageMulFrom), rate × rateMul. The later in the run, the
// more one adds: the attack cards the class gave up multiply on each other,
// faster and faster as a run goes on, and the class keeps up with them
// (by the run's level, so a class taken late catches up)
export function powerMul(run, level = run.level) {
  const E = run.D.balance.upgrades.effects.power
  // (pow: it comes about one level-up in three, at random, so one counts
  // for about three)
  const n = E.pow || 1
  return { dmg: (E.damageMul + (E.damageMulPerLevel || 0) * Math.max(0, level - (E.damageMulFrom || 0))) ** n, rate: E.rateMul ** n }
}
export function powerPreview(run) {
  const m = powerMul(run)
  const C = run.cls
  return { cls: { ...C, dmg: C.dmg * m.dmg, rate: C.rate * m.rate } }
}
