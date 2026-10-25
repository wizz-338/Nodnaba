// MANO SURVIVOR — weapon behaviours. A weapon in data/weapons.json names a
// behaviorId; the behaviour does the attacking. Adding a weapon later (churu,
// bubbles, rattle) means adding a behaviour here and an entry in the registry,
// nothing in the game loop.
//
// Every behaviour: { stats(def, gradeMul) → run stats, update(run, dt) }.
// Only weapons whose behaviour exists are ever offered or rewarded.

const TAU = Math.PI * 2
const LOCK = 0.18 // s: a ball cannot hit the same enemy again this soon
const SUB = 4 // px: longest move per collision check (fast balls never tunnel)
const TRAIL = 0.045 // s of past positions kept for the short trail

export const BEHAVIORS = {
  bounce_projectile: {
    stats(def, gradeMul) {
      const b = def.base
      return { ...b, damage: b.damage * gradeMul, split: def.split }
    },
    update: updateBalls,
  },
}

export const implemented = (def) => !!(def && BEHAVIORS[def.behaviorId])

// ── the bouncy ball ─────────────────────────────────────────────────────────

// life of a ball: the base, plus a little for every bounce past the first
// (data: ttl, ttlPerBounce, ttlMax) — a ball has to live to use its bounces
export const ballTtl = (w) => Math.min(w.ttlMax, w.ttl + w.ttlPerBounce * Math.max(0, w.bounces - 1))

// how many times a hit is critical: the whole part of the chance always, the
// rest by luck (so a chance past 100% keeps adding double, triple crits)
export const critCount = (chance, r) => Math.floor(chance) + (r < chance - Math.floor(chance) ? 1 : 0)

// spread of a volley: a narrow fan for a few balls that opens with every ball
// added (11° apart), up to a full ring for a big volley
export const fanAngles = (count) => {
  if (count === 1) return [0]
  const spread = Math.min(TAU * (1 - 1 / count), (count - 1) * ((11 * Math.PI) / 180))
  return Array.from({ length: count }, (_, i) => -spread / 2 + (spread * i) / (count - 1))
}

// How many balls a volley really launches, and the damage each carries. Up to
// the budget every ball flies; past it the volley launches what fits (at least
// one) and each launched ball carries the damage of the ones it stands for,
// so a volley always deals its full damage.
export function volley(count, live, budget) {
  const n = Math.max(1, Math.min(count, budget - live))
  return { n, mult: count / n }
}

function nearestTarget(run) {
  const p = run.player
  let best = null
  let bd = Infinity
  for (const e of run.enemies) {
    if (e.state !== 'live') continue
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d < bd) {
      bd = d
      best = e
    }
  }
  return best
}

// `volleys` volleys at once (more than one when the gap between volleys is
// shorter than a game step): count × volleys balls, as one burst
function fire(run, target, volleys) {
  const w = run.weapon
  const p = run.player
  const aim = Math.atan2(target.y - p.y, target.x - p.x)
  const want = w.count * volleys
  const { n, mult } = volley(want, run.balls.length, run.D.balance.performance.ballBudget)
  for (const da of fanAngles(n)) {
    const a = aim + da
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const b = newBall(run, p.x + dx * 12, p.y + dy * 12, dx * w.speed, dy * w.speed, w.radius, w.damage * mult, w.bounces, ballTtl(w), 0)
    // a ball standing for several (past the budget) looks golden
    b.heavy = mult > 1
    run.balls.push(b)
  }
  run.stats.volleys += volleys
  run.stats.shots += want
  run.stats.launched += n
  if (n < want) run.stats.merged += want - n
}

function newBall(run, x, y, vx, vy, r, damage, bounces, ttl, gen) {
  return { id: run.nextId++, x, y, vx, vy, r, damage, bounces, ttl, gen, hitAny: false, locks: [], trail: [], age: 0 }
}

function updateBalls(run, dt) {
  const w = run.weapon
  // fire: only with someone to aim at (the timer waits at zero meanwhile);
  // every volley that is due fires, however short the gap has become
  run.fireT -= dt
  if (run.fireT <= 0) {
    const target = nearestTarget(run)
    if (target) {
      const k = Math.floor(-run.fireT / w.interval) + 1
      fire(run, target, k)
      run.fireT += k * w.interval
    } else run.fireT = 0
  }
  // the balls bounce off the field's edges (on the PC wider than the screen:
  // they fly on past it as the monsters stand there; on the phone the field
  // is the screen), or off the extra special boss's fight area during it
  const [x0, y0, x1, y1] = (run.extra && run.extra.box) || run.arena.bounds
  const out = []
  for (const b of run.balls) {
    b.ttl -= dt
    b.age += dt
    if (b.ttl <= 0) {
      if (!b.hitAny) run.stats.missed++
      continue
    }
    if (b.locks.length) b.locks = b.locks.filter((l) => l.until > run.t)
    const speed = Math.hypot(b.vx, b.vy)
    const steps = Math.max(1, Math.ceil((speed * dt) / SUB))
    const h = dt / steps
    let alive = true
    for (let s = 0; s < steps && alive; s++) {
      b.x += b.vx * h
      b.y += b.vy * h
      // walls: reflect, put back inside
      let wall = false
      if (b.x - b.r < x0) (b.x = x0 + b.r), (b.vx = Math.abs(b.vx)), (wall = true)
      else if (b.x + b.r > x1) (b.x = x1 - b.r), (b.vx = -Math.abs(b.vx)), (wall = true)
      if (b.y - b.r < y0) (b.y = y0 + b.r), (b.vy = Math.abs(b.vy)), (wall = true)
      else if (b.y + b.r > y1) (b.y = y1 - b.r), (b.vy = -Math.abs(b.vy)), (wall = true)
      if (wall && !spend(b)) {
        alive = false
        break
      }
      // enemies: the first one touched this step
      const e = run.grid.first(b.x, b.y, b.r, (o) => o.state === 'live' && !b.locks.some((l) => l.id === o.id))
      if (!e) continue
      const nx0 = b.x - e.x
      const ny0 = b.y - e.y
      const d = Math.hypot(nx0, ny0) || 1
      const nx = nx0 / d
      const ny = ny0 / d
      const crits = critCount(w.critChance, w.critChance > 0 ? run.rng() : 1)
      if (crits) run.stats.crits++
      const dmg = b.damage * w.critMul ** crits
      run.hurt(e, dmg, b.x - nx * b.r, b.y - ny * b.r, crits > 0)
      if (run.blessHit) run.blessHit(e, dmg, b.x - nx * b.r, b.y - ny * b.r)
      b.locks.push({ id: e.id, until: run.t + LOCK })
      // bounce off: reflect on the contact normal, step out of the enemy
      const dot = b.vx * nx + b.vy * ny
      if (dot < 0) {
        b.vx -= 2 * dot * nx
        b.vy -= 2 * dot * ny
      }
      b.x = e.x + nx * (e.r + b.r + 0.5)
      b.y = e.y + ny * (e.r + b.r + 0.5)
      const first = !b.hitAny
      b.hitAny = true
      if (first && b.gen < w.split.generations) split(run, b, e)
      if (!spend(b)) alive = false
    }
    if (!alive) {
      if (!b.hitAny) run.stats.missed++
      continue
    }
    b.trail.push(b.age, b.x, b.y)
    while (b.trail.length > 3 && b.trail[0] < b.age - TRAIL) b.trail.splice(0, 3)
    out.push(b)
  }
  run.balls = out
}

// one collision used: bounce on if the budget allows, else the ball is gone
function spend(b) {
  if (b.bounces <= 0) return false
  b.bounces--
  return true
}

// first enemy hit only: floor(p) sure splits plus one more with the leftover
// chance; each split makes two smaller balls one generation older (data says
// how many generations may split, so it can never run away)
function split(run, b, e) {
  const sp = run.weapon.split
  const p = run.weapon.splitChance
  const procs = Math.floor(p) + (run.rng() < p - Math.floor(p) ? 1 : 0)
  if (!procs) return
  const a0 = Math.atan2(b.vy, b.vx)
  const speed = Math.hypot(b.vx, b.vy)
  for (let k = 0; k < procs; k++) {
    for (const side of [-1, 1]) {
      const a = a0 + side * ((22 + 18 * k) * Math.PI) / 180
      const c = newBall(run, b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed, b.r * sp.childRadiusMultiplier, b.damage * sp.childDamageMultiplier, sp.childBounces, sp.childTtl, b.gen + 1)
      c.locks.push({ id: e.id, until: run.t + LOCK })
      c.hitAny = true
      run.balls.push(c)
      run.stats.children++
    }
  }
  run.stats.splits += procs
}

export { TAU }
