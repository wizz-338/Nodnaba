// MANO SURVIVOR — 친구냥이: the fighting cats (balance.json → friendCats).
//
// A line of growth of its own beside the red ball. A run with the cats
// (chapter 5's reward, from cats.activeFromChapter on) has 친구냥이 among the
// upgrade cards; each pick brings one more cat (+1, never doubled). Once
// there is one, the four other cat cards join the pool too: 뚱냥이 (bigger,
// and its scratch reaches further: the hit area itself grows), 스피드냥이
// (runs faster), 빠르게 할퀴기 (scratches more often), 발톱 갈기 (each
// scratch hurts more). The cats never get hurt, never block anyone and are
// never steered: they come out next to Mano, find the nearest monster, run
// to it, scratch it, and when it falls go for the next one; with nothing
// near they keep close to Mano. When the fight ends they are gone.
//
// A scratch's damage (one formula, nothing counted twice):
//   run.catBase = the ball's damage at the start of the run (its base × its
//                 grade × the coin stat 공격 피해; no in-run card) × damageCoef
//   one scratch = catBase × 발톱 갈기's multiplier × the pack (1 + packBonus ×
//                 (cats − 1)), × Mano's 치명타 피해 when it crits (Mano's 치명타
//                 확률: the coin stat plus the in-run card)
//   the gap     = interval × the coin stat 공격 주기 × 빠르게 할퀴기's multiplier
// The ball's in-run cards (개수, 주기, 피해, 반사, 크기, 속도, 분열) never touch
// the cats, and the cats' cards never touch the ball.

import { TAU } from './weapons.js'

export const CAT_CARDS = ['catSummon', 'catSize', 'catSpeed', 'catRate', 'catClaw']
// the cards that only mean something once there is a cat
const NEED_A_CAT = new Set(['catSize', 'catSpeed', 'catRate', 'catClaw'])

// the cat line's numbers at the start of a run
export const freshCatStats = () => ({ n: 0, size: 1, range: 1, speed: 1, rate: 1, claw: 1 })

// can the card come up now (the four need a cat first)
export const catCardOpen = (run, id) => !NEED_A_CAT.has(id) || run.cat.n > 0

// what a cat card does to the cat line's numbers (pure)
export function catPreview(run, id) {
  const E = run.D.balance.upgrades.effects[id]
  const c = run.cat
  switch (id) {
    case 'catSummon':
      return { cat: { ...c, n: c.n + E.add } }
    case 'catSize':
      return { cat: { ...c, size: c.size * E.mul, range: c.range * E.rangeMul } }
    case 'catSpeed':
      return { cat: { ...c, speed: c.speed * E.mul } }
    case 'catRate':
      return { cat: { ...c, rate: c.rate * E.mul } }
    case 'catClaw':
      return { cat: { ...c, claw: c.claw * E.mul } }
    default:
      return null
  }
}

// ── the numbers a cat fights with now ───────────────────────────────────────

// (the pack: every cat beyond the first adds packBonus to every cat's scratch)
export const packMul = (run) => 1 + run.D.balance.friendCats.packBonus * Math.max(0, run.cat.n - 1)
export const catDamage = (run) => run.catBase * run.cat.claw * packMul(run)
export const catInterval = (run) => run.D.balance.friendCats.interval * run.catPermaInterval * run.cat.rate
export const catSpeed = (run) => run.D.balance.friendCats.speed * run.cat.speed
// the scratch: its reach in front of the cat and the circle it hits
export const catSwipe = (run) => run.D.balance.friendCats.swipe * run.cat.range
export const catReach = (run) => run.D.balance.friendCats.reach * run.cat.range

// the cats on the field follow the count (a new one comes out next to Mano)
export function syncFriends(run) {
  const F = run.D.balance.friendCats
  const p = run.player
  while (run.friends.length < run.cat.n) {
    const i = run.friends.length
    const a = run.rng() * TAU
    run.friends.push({
      id: i,
      x: p.x + Math.cos(a) * 18,
      y: p.y + Math.sin(a) * 12,
      face: run.rng() < 0.5 ? 1 : -1,
      size: Math.min(F.maxDrawScale, run.cat.size), // as drawn (뚱냥이)
      dir: 'se', // se | e | ne (west is the same mirrored)
      mode: 'idle', // idle | chase | attack
      t: 0, // time in this mode (the animations)
      target: null,
      cd: F.firstScratch * run.rng(), // till it may scratch again
      atk: 0, // the scratch under way: its time
      atkDur: 0,
      struck: false,
      rec: 0, // recovering (drawn): time left
      seek: run.rng() * F.seekEvery, // till it looks again for a target
      slot: run.rng() * TAU, // where around its target it stands
      step: 0,
      home: { x: 0, y: 0, t: 0 }, // a spot near Mano when there is nothing to fight
    })
    run.events.push({ type: 'catSummon', x: run.friends[i].x, y: run.friends[i].y })
  }
}

// the targets cats share: claims by enemy id this step
const claims = new Map()

// the nearest live monster on screen and near Mano (a monster many cats are
// already on counts as further, so they spread out)
function findTarget(run, c) {
  const F = run.D.balance.friendCats
  const p = run.player
  const [vx0, vy0, vx1, vy1] = run.view
  let best = null
  let bd = Infinity
  for (const R of [90, 180, F.leash]) {
    run.grid.near(c.x, c.y, R, (e) => {
      if (e.state !== 'live' || e.under || e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) return
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > F.leash * F.leash) return
      const d = Math.hypot(e.x - c.x, e.y - c.y) + (claims.get(e.id) || 0) * F.crowdPenalty
      if (d < bd) (bd = d), (best = e)
    })
    if (best && bd <= R) break
  }
  return best
}

const usable = (run, e) => {
  if (!e || e.state !== 'live' || e.under) return false
  const F = run.D.balance.friendCats
  const p = run.player
  return (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= (F.leash * 1.25) ** 2
}

function faceTo(c, dx, dy) {
  if (Math.abs(dx) > 0.5) c.face = dx > 0 ? 1 : -1
  const a = Math.atan2(-dy, Math.abs(dx)) // up is positive
  c.dir = a > 0.45 ? 'ne' : a < -0.45 ? 'se' : 'e'
}

// one scratch (or several at once when the gap has gone below a step):
// every live monster inside the swipe's circle in front of the cat is hit
function strike(run, c, e, times) {
  const F = run.D.balance.friendCats
  const w = run.weapon
  const dx = e.x - c.x
  const dy = e.y - c.y
  const d = Math.hypot(dx, dy) || 1
  const sw = catSwipe(run)
  const reach = Math.min(d, catReach(run) * c.size + sw * 0.5)
  const sx = c.x + (dx / d) * reach
  const sy = c.y + (dy / d) * reach
  const base = catDamage(run)
  let hit = 0
  run.grid.near(sx, sy, sw + 40, (o) => {
    if (o.state !== 'live') return
    if ((o.x - sx) ** 2 + (o.y - sy) ** 2 > (sw + o.r) ** 2) return
    let dmg = 0
    let crits = 0
    for (let k = 0; k < times; k++) {
      const crit = w.critChance > 0 && run.rng() < w.critChance
      if (crit) crits++
      dmg += crit ? base * w.critMul : base
    }
    run.hurt(o, dmg, o.x - (o.x - sx) * 0.4, o.y - (o.y - sy) * 0.4 - 4, crits > 0, 'cat')
    hit++
  })
  const S = run.stats
  S.catSwings = (S.catSwings || 0) + times
  if (!hit) S.catWhiffs = (S.catWhiffs || 0) + times
  run.events.push({ type: 'catSlash', x: sx, y: sy, r: sw, face: dx >= 0 ? 1 : -1, a: Math.atan2(dy, dx), power: run.cat.claw >= F.powerAt })
}

export function updateFriends(run, dt) {
  const list = run.friends
  if (!list.length) return
  const F = run.D.balance.friendCats
  const p = run.player
  const [x0, y0, x1, y1] = run.arena.bounds
  const sp = catSpeed(run)
  const gap = catInterval(run)
  const size = Math.min(F.maxDrawScale, run.cat.size)
  claims.clear()
  for (const c of list) if (c.target) claims.set(c.target.id, (claims.get(c.target.id) || 0) + 1)
  const S = run.stats
  for (const c of list) {
    c.size = size
    c.t += dt
    c.cd -= dt
    if (c.rec > 0) c.rec -= dt
    if (!usable(run, c.target)) {
      if (c.target) claims.set(c.target.id, (claims.get(c.target.id) || 1) - 1)
      c.target = null
    }
    if ((c.seek -= dt) <= 0 || !c.target) {
      c.seek = F.seekEvery
      const was = c.target
      const nt = findTarget(run, c)
      // keep the one it is scratching unless another is clearly nearer
      if (nt && nt !== was && (!was || Math.hypot(nt.x - c.x, nt.y - c.y) + F.stickiness < Math.hypot(was.x - c.x, was.y - c.y))) {
        if (was) claims.set(was.id, (claims.get(was.id) || 1) - 1)
        claims.set(nt.id, (claims.get(nt.id) || 0) + 1)
        c.target = nt
        c.slot = run.rng() * TAU
      }
    }
    // the scratch under way: it lands at its middle, whoever is in front
    if (c.mode === 'attack') {
      c.atk += dt
      if (!c.struck && c.atk >= c.atkDur * F.strikeAt) {
        c.struck = true
        const e = c.target && c.target.state === 'live' ? c.target : null
        if (e) {
          // the gap below one step: the scratches due in it land together
          const times = gap < c.atkDur ? Math.max(1, Math.round(c.atkDur / gap)) : 1
          strike(run, c, e, times)
        } else (S.catWhiffs = (S.catWhiffs || 0) + 1), (S.catSwings = (S.catSwings || 0) + 1)
      }
      if (c.atk >= c.atkDur) {
        c.mode = c.target ? 'chase' : 'idle'
        c.t = 0
        c.rec = F.recoverSeconds
      } else {
        S.catBusy = (S.catBusy || 0) + dt
        continue
      }
    }
    let tx
    let ty
    let speed = sp
    const e = c.target
    if (e) {
      // its place at the target's edge (each cat its own side)
      const stand = e.r + catReach(run) * c.size * 0.8
      tx = e.x + Math.cos(c.slot) * stand
      ty = e.y + Math.sin(c.slot) * stand * 0.7
      const d = Math.hypot(e.x - c.x, e.y - c.y)
      if (d <= e.r + catReach(run) * c.size + catSwipe(run) * 0.6) {
        // close enough: scratch when ready, else stay put facing it
        faceTo(c, e.x - c.x, e.y - c.y)
        if (c.cd <= 0) {
          c.mode = 'attack'
          c.atk = 0
          c.atkDur = Math.min(F.attackSeconds, Math.max(F.minAttackSeconds, gap * 0.8))
          c.struck = false
          c.cd += Math.max(gap, c.atkDur)
          if (c.cd < 0) c.cd = 0
          c.t = 0
          S.catBusy = (S.catBusy || 0) + dt
          continue
        }
        if (c.cd < 0) c.cd = 0
        S.catBusy = (S.catBusy || 0) + dt
        tx = c.x
        ty = c.y
      } else {
        if (c.cd < 0) c.cd = 0
        S.catChase = (S.catChase || 0) + dt
      }
      c.mode = 'chase'
    } else {
      if (c.cd < 0) c.cd = 0
      // nothing to fight: a spot close to Mano, changed now and then
      if ((c.home.t -= dt) <= 0 || Math.hypot(c.home.x - p.x, c.home.y - p.y) > F.homeRadius * (1 + Math.sqrt(list.length) / 5) * 1.6) {
        // (the more cats, the wider they wait, so they never pile up)
        const a = run.rng() * TAU
        const r = F.homeRadius * (1 + Math.sqrt(list.length) / 5) * (0.4 + 0.6 * run.rng())
        c.home.x = p.x + Math.cos(a) * r
        c.home.y = p.y + Math.sin(a) * r * 0.7
        c.home.t = 1.2 + run.rng() * 1.6
      }
      tx = c.home.x
      ty = c.home.y
      const far = Math.hypot(p.x - c.x, p.y - c.y)
      speed = far > F.homeRadius * 2 ? sp : Math.min(sp, p.speed * 1.1 + 20)
      S.catIdle = (S.catIdle || 0) + dt
    }
    const dx = tx - c.x
    const dy = ty - c.y
    const d = Math.hypot(dx, dy)
    if (d > 1) {
      const m = Math.min(d, speed * dt)
      c.x = Math.max(x0 + 6, Math.min(x1 - 6, c.x + (dx / d) * m))
      c.y = Math.max(y0 + 6, Math.min(y1 - 4, c.y + (dy / d) * m))
      c.step += m
      if (!e || Math.hypot(e.x - c.x, e.y - c.y) > e.r + catReach(run) * c.size + catSwipe(run) * 0.6) faceTo(c, dx, dy)
      if (c.mode !== 'chase' && e) (c.mode = 'chase'), (c.t = 0)
      if (!e && c.mode !== 'idle') (c.mode = 'idle'), (c.t = 0)
      c.moving = d > 2
    } else {
      c.moving = false
      if (!e && c.mode !== 'idle') (c.mode = 'idle'), (c.t = 0)
    }
  }
}
