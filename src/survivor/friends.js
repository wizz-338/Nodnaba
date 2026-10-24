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

// ── choosing what to scratch ────────────────────────────────────────────────
// Each cat weighs the monsters near itself (never Mano's nearest for all):
//   when it could strike: the run to scratching distance at its speed, or
//     its scratch still coming back (whichever is longer), in seconds, and
//     the run again × near (so the nearer of two still wins meanwhile);
//   what is left of it: its HP less the scratches booked on it by the cats
//     about to strike it (in reach of it, or scratching it: one scratch's
//     damage each, no crit counted; a cat still running books nothing, so it
//     never keeps a nearer cat off). One whose HP is
//     already covered counts covered s later — the others will finish it —
//     unless nothing else is near. A boss's HP is never covered: on a boss
//     every cat may pile in;
//     A monster the cats already on their way to it would finish counts
//     coming s later (softer: they may yet turn away);
//   the cats on it: crowd s later for each other cat about to strike it, so
//     the monsters near a pile get their share (a boss alone still gets
//     every cat: nothing else is there to choose);
//   the crowd round it: monsters inside a scratch's circle of it (뚱냥이
//     grows that circle) count clump s earlier each, so a scratch there hits
//     several.
// It keeps its target unless another is better by switchMargin s, and never
// changes in the middle of a scratch. About to start a scratch on one the
// others' booked scratches already finish, it takes the best other one
// instead, if there is one. Bookings are made afresh every step
// from what each cat is after, so nothing stays booked once a cat moves on.
// (balance.json → friendCats.aim)

const booked = new Map() // enemy id → damage the cats about to strike it will deal with their next scratch
const onIt = new Map() // enemy id → how many cats are about to strike it
const coming = new Map() // enemy id → damage of the next scratch of every cat after it (running ones too)
const clumps = new Map() // enemy id → monsters inside a scratch's circle of it (this step)

// one scratch's damage, as the strike deals it (no crit)
const scratchOf = (run, gap, atkDur) => catDamage(run) * (gap < atkDur ? Math.max(1, Math.round(atkDur / gap)) : 1)

function clumpOf(run, e, sw) {
  let n = clumps.get(e.id)
  if (n !== undefined) return n
  n = 0
  run.grid.near(e.x, e.y, sw + 30, (o) => {
    if (o !== e && o.state === 'live' && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= (sw + o.r) ** 2) n++
  })
  clumps.set(e.id, n)
  return n
}

// how good e is for cat c (lower is better), in seconds
function scoreOf(run, c, e, A) {
  const d = Math.hypot(e.x - c.x, e.y - c.y)
  // (from the monster's middle, as a cat sees it: a big one — boss, elite —
  // looks no nearer for its size, so the small ones round Mano are not left
  // to her while every cat goes for the big one; edge: how much of its size
  // counts)
  const run2 = Math.max(0, d - (e.r * A.aim.edge + A.reach)) / A.speed
  // (the run counts on its own too: while the claw is coming back, the
  // nearer of two still comes first)
  let s = Math.max(run2, Math.max(0, c.cd)) + run2 * A.aim.near
  const mine = c.target === e && c.ready ? 1 : 0
  const left = e.hp - ((booked.get(e.id) || 0) - mine * A.hit)
  // (finished by those about to strike it; or, softer, by those on their way)
  if (left <= 0) s += A.aim.covered
  else if (e.hp - ((coming.get(e.id) || 0) - (c.target === e ? A.hit : 0)) <= 0) s += A.aim.coming
  s += Math.max(0, (onIt.get(e.id) || 0) - mine) * A.aim.crowd
  return s - Math.min(A.aim.clumpMax, clumpOf(run, e, A.swipe)) * A.aim.clump
}

const allowed = (run, e, F) => {
  const p = run.player
  const [vx0, vy0, vx1, vy1] = run.view
  return e.state === 'live' && !e.under && e.x >= vx0 && e.x <= vx1 && e.y >= vy0 && e.y <= vy1 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= F.leash * F.leash
}

// the best monster for c among those on screen near Mano, looked for near
// the cat first and further only when nothing good is near
function findTarget(run, c, A, not = null) {
  const F = run.D.balance.friendCats
  let best = null
  let bs = Infinity
  for (const R of [90, 180, F.leash]) {
    run.grid.near(c.x, c.y, R, (e) => {
      if (e === not || !allowed(run, e, F)) return
      const s = scoreOf(run, c, e, A)
      if (s < bs) (bs = s), (best = e)
    })
    // good enough near (one not covered by others within this ring): no
    // need to look further
    if (best && bs <= (R / A.speed) * (1 + A.aim.near) + A.aim.coming) break
  }
  return best ? { e: best, s: bs } : null
}

const come = (e, n) => coming.set(e.id, (coming.get(e.id) || 0) + n)
const book = (e, n) => {
  booked.set(e.id, (booked.get(e.id) || 0) + n)
  onIt.set(e.id, (onIt.get(e.id) || 0) + Math.sign(n))
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
  // this step's bookings: every cat's next scratch on what it is after
  const atkDur = Math.min(F.attackSeconds, Math.max(F.minAttackSeconds, gap * 0.8))
  const A = { aim: F.aim, speed: sp, reach: catReach(run) * size + catSwipe(run) * 0.6, swipe: catSwipe(run), hit: scratchOf(run, gap, atkDur) }
  booked.clear()
  onIt.clear()
  coming.clear()
  clumps.clear()
  for (const c of list) if (c.ready && c.target && c.target.state === 'live') book(c.target, A.hit)
  for (const c of list) if (c.target && c.target.state === 'live') come(c.target, A.hit)
  const S = run.stats
  for (const c of list) {
    c.size = size
    c.t += dt
    c.cd -= dt
    if (c.rec > 0) c.rec -= dt
    const scratching = c.mode === 'attack' && !c.struck
    if (!usable(run, c.target) && !scratching) {
      if (c.ready && c.target && c.target.state === 'live') book(c.target, -A.hit)
      if (c.target && c.target.state === 'live') come(c.target, -A.hit)
      c.target = null
      c.ready = false
    }
    // (never in the middle of a scratch: it lands where it was aimed)
    if (!scratching && ((c.seek -= dt) <= 0 || !c.target)) {
      c.seek = F.seekEvery
      const was = c.target
      const nt = findTarget(run, c, A)
      // keep the one it is after unless another is clearly better
      if (nt && nt.e !== was && (!was || nt.s + F.aim.switchMargin < scoreOf(run, c, was, A))) {
        if (was) S.catSwitches = (S.catSwitches || 0) + 1
        if (was && c.ready) book(was, -A.hit)
        if (was) come(was, -A.hit)
        come(nt.e, A.hit)
        c.ready = false
        c.target = nt.e
        c.slot = run.rng() * TAU
      }
    }
    // the scratch under way: it lands at its middle, whoever is in front
    if (c.mode === 'attack') {
      c.atk += dt
      if (!c.struck && c.atk >= c.atkDur * F.strikeAt) {
        c.struck = true
        let e = c.target && c.target.state === 'live' ? c.target : null
        // it fell during the swing: the claw goes to a monster already in
        // reach instead (never towards one further off: it would miss)
        if (!e) {
          let bd = Infinity
          run.grid.near(c.x, c.y, A.reach + 40, (o) => {
            const d = Math.hypot(o.x - c.x, o.y - c.y) - o.r
            if (o.state === 'live' && d <= A.reach && d < bd) (bd = d), (e = o)
          })
          if (e) (c.target = e), (c.ready = true), book(e, A.hit), come(e, A.hit)
        }
        // (telemetry: how many cats were after the one it struck; swings at nothing left)
        if (e) (S.catStrikes = (S.catStrikes || 0) + 1), (S.catStrikeClaims = (S.catStrikeClaims || 0) + Math.max(1, Math.round((booked.get(e.id) || A.hit) / A.hit)))
        else S.catDeadSwings = (S.catDeadSwings || 0) + 1
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
        // close enough: scratch when ready, else stay put facing it (and its
        // next scratch is booked on it)
        if (!c.ready) (c.ready = true), book(e, A.hit)
        faceTo(c, e.x - c.x, e.y - c.y)
        // already finished by the others' booked scratches: another one, if any
        if (c.cd <= 0 && e.hp - ((booked.get(e.id) || 0) - A.hit) <= 0) {
          const nt = findTarget(run, c, A, e)
          if (nt && nt.s < A.aim.covered) {
            book(e, -A.hit)
            come(e, -A.hit)
            come(nt.e, A.hit)
            c.ready = false
            c.target = nt.e
            c.slot = run.rng() * TAU
            S.catSwitches = (S.catSwitches || 0) + 1
            S.catChase = (S.catChase || 0) + dt
            continue
          }
        }
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
        if (c.ready) (c.ready = false), book(e, -A.hit)
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
