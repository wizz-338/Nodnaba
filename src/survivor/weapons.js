// MANO SURVIVOR — weapon behaviours. A weapon in data/weapons.json names a
// behaviorId; the behaviour does the attacking. Adding a weapon later (churu:
// cats that fight on their own) means adding a behaviour here and an entry in
// the registry, nothing in the game loop.
//
// Every behaviour: { stats(def, gradeMul) → run stats, update(run, dt) }.
// Only weapons whose behaviour exists are ever offered or rewarded.

const TAU = Math.PI * 2
const LOCK = 0.18 // s: a ball cannot hit the same enemy again this soon
const SUB = 4 // px: longest move per collision check (fast balls never tunnel)
const TRAIL = 0.045 // s of past positions drawn behind a ball

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

// life of a ball: the base, plus 0.3 s per two extra bounces past the
// starting two, at most 5.3 s
export const ballTtl = (w) => Math.min(5.3, w.ttl + 0.15 * Math.max(0, w.bounces - 2))

// spread of a volley: narrow fan, never more than 60°
export const fanAngles = (count) => {
  const spread = Math.min((60 * Math.PI) / 180, (count - 1) * ((11 * Math.PI) / 180))
  return Array.from({ length: count }, (_, i) => (count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1)))
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

function fire(run, target) {
  const w = run.weapon
  const p = run.player
  const aim = Math.atan2(target.y - p.y, target.x - p.x)
  for (const da of fanAngles(w.count)) {
    const a = aim + da
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    run.balls.push(newBall(run, p.x + dx * 12, p.y + dy * 12, dx * w.speed, dy * w.speed, w.radius, w.damage, w.bounces, ballTtl(w), true))
  }
  run.stats.shots += w.count
}

function newBall(run, x, y, vx, vy, r, damage, bounces, ttl, canSplit) {
  return { id: run.nextId++, x, y, vx, vy, r, damage, bounces, ttl, canSplit, hitAny: false, locks: [], trail: [], age: 0 }
}

function updateBalls(run, dt) {
  const w = run.weapon
  // fire: only with someone to aim at; the timer waits at zero meanwhile
  run.fireT -= dt
  if (run.fireT <= 0) {
    const target = nearestTarget(run)
    if (target) {
      fire(run, target)
      run.fireT += w.interval
      if (run.fireT < 0) run.fireT = 0
    } else run.fireT = 0
  }
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  const out = []
  for (const b of run.balls) {
    b.ttl -= dt
    b.age += dt
    if (b.ttl <= 0) continue
    b.locks = b.locks.filter((l) => l.until > run.t)
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
      run.hurt(e, b.damage, b.x - nx * b.r, b.y - ny * b.r)
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
      if (first && b.canSplit) split(run, b, e)
      if (!spend(b)) alive = false
    }
    if (!alive) continue
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
// chance; each split makes two smaller balls that never split again
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
      const c = newBall(run, b.x, b.y, Math.cos(a) * speed, Math.sin(a) * speed, b.r * sp.childRadiusMultiplier, b.damage * sp.childDamageMultiplier, sp.childBounces, sp.childTtl, false)
      c.locks.push({ id: e.id, until: run.t + LOCK })
      c.hitAny = true
      run.balls.push(c)
      run.stats.children++
    }
  }
  run.stats.splits += procs
}

export { TAU }
