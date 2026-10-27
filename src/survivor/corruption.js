// MANO SURVIVOR — 마계 침공: chapters 26–30 (하늘 구름 위의 세계), where the
// demon world's invasion corrupts the sky's monsters (balance.json →
// corruption). Pure rules, no drawing (render.js draws the stages).
//
// A monster left alive long enough turns:
//   1. clean: as it came, a sky monster;
//   2. warn (변이 징후): after `after` s alive (each its own, ± jitter) it
//      shows violet cracks for `warn` s — the warning that it is about to
//      turn, and the time to kill it first;
//   3. full (완전 변이): faster, stronger, tougher (corruption.mul), worth
//      more, and it shoots: when Mano is in reach it stops, charges a dark
//      orb for `shot.windup` s (seen) and fires `shots` of them (slower than
//      she walks): one at where she is then, a second where she is going. It no longer crowds her as the clean
//      ones do: nearer than `shot.keep` it circles her at that distance.
// Only some monsters can turn (`share` of the ordinary ones as they come),
// never more than `cap` at once (a warning counts: it always ends in the
// turn it promised), never the thief nor the extra special bosses, and the
// dark orbs in the air are capped too (`maxShots`). In the last chapter
// (`bosses`) the mid-boss and the boss turn as well, after `bossAfter` s.
// A frozen monster's clock stands still; a slowed one's runs slower.

// the chapter's settings, or null (no invasion there)
export function corruptionOf(D, chapter) {
  const C = D.balance.corruption
  const c = C && C.chapters[chapter]
  return c ? { ...C, ...c } : null
}

// at its spawn: whether this monster can turn, and when
export function markCorruption(run, e) {
  const C = run.corrupt
  if (!C || run.extra || e.behavior === 'flee' || e.behavior === 'extra') return
  if (e.rank) {
    if (!C.bosses) return
    e.cAt = C.bossAfter
  } else {
    if (run.rng() >= C.share) return
    e.cAt = C.after * (1 - C.jitter + 2 * C.jitter * run.rng())
  }
  e.cT = 0 // its clock (s alive, frozen time not counted)
  e.cStage = 0 // 0 clean, 1 warn, 2 full
}

// how many ordinary ones are turning or turned now (alive; the cap's count:
// the mid-boss and the boss turn on time whatever the field holds)
export const corruptedNow = (run) => run.enemies.reduce((n, e) => n + (e.state === 'live' && e.cStage > 0 && !e.rank ? 1 : 0), 0)
const voidShots = (run) => run.shots.reduce((n, s) => n + (s.kind === 'abyss'), 0)

// Each frame of a live monster that can turn (dt: its own time, slowed or
// frozen by a blessing). Returns true when it moved itself this frame (it
// stands charging a shot, or circles Mano): the game does not move it then.
export function corruptTick(run, e, dt) {
  const C = run.corrupt
  if (!C || e.cAt === undefined || e.state !== 'live') return false
  e.cT += dt
  if (e.cStage === 0) {
    // (its time has come, but the field holds all it may: it waits clean)
    if (e.cT < e.cAt || (!e.rank && corruptedNow(run) >= C.cap)) return false
    e.cStage = 1
    e.cWarn = 0
    run.stats.corrupt.warned++
    run.events.push({ type: 'corruptWarn', id: e.id, x: e.x, y: e.y })
    return false
  }
  if (e.cStage === 1) {
    e.cWarn += dt
    if (e.cWarn >= C.warn) turn(run, e)
    return false
  }
  if (shoot(run, e, dt)) return true
  return keepAway(run, e, dt)
}

// A turned one (not a boss) closer to Mano than shot.keep does not crowd her
// as the clean ones do: it circles her at that distance (its own way round)
// to shoot from there. Returns true when it moved itself.
function keepAway(run, e, dt) {
  if (e.rank) return false
  const S = run.corrupt.shot
  const p = run.player
  const dx = e.x - p.x
  const dy = e.y - p.y
  const d = Math.hypot(dx, dy) || 1
  if (d >= S.keep) return false
  const ux = dx / d
  const uy = dy / d
  const turn = e.id % 2 ? 1 : -1
  const out = Math.min(1, (S.keep - d) / (S.keep * 0.4))
  let vx = -uy * turn * (1 - out) + ux * out
  let vy = ux * turn * (1 - out) + uy * out
  const m = Math.hypot(vx, vy) || 1
  vx /= m
  vy /= m
  e.x += vx * e.speed * S.orbit * dt
  e.y += vy * e.speed * S.orbit * dt
  return true
}

// the turn itself: faster, stronger, tougher (its share of HP kept), worth more
function turn(run, e) {
  const M = run.corrupt.mul
  const big = !!e.rank
  e.cStage = 2
  e.speed *= big ? M.bossSpeed : M.speed
  e.damage *= big ? M.bossDamage : M.damage
  e.damageMul *= big ? M.bossDamage : M.damage
  if (!big) {
    e.hp *= M.hp
    e.maxHp *= M.hp
    e.xp *= M.xp
  }
  e.cFire = run.corrupt.shot.first * (0.6 + 0.8 * run.rng())
  run.stats.corrupt.full++
  run.events.push({ type: 'corrupt', id: e.id, x: e.x, y: e.y, big })
}

// a turned one's dark orbs: when Mano is within reach (not too near: then it
// simply bites), it stands and charges (e.cAim, seen), then fires
function shoot(run, e, dt) {
  const C = run.corrupt
  const S = C.shot
  const p = run.player
  const big = !!e.rank
  if (e.cAim !== undefined) {
    e.cAim += dt
    if (e.cAim < (big ? S.bossWindup : S.windup)) return !big
    e.cAim = undefined
    e.cFire = C.fire * (0.85 + 0.3 * run.rng())
    const n = big ? S.bossShots : C.shots
    const spread = ((big ? S.bossSpreadDeg : S.spreadDeg) * Math.PI) / 180
    const a0 = Math.atan2(p.y - e.y, p.x - e.x)
    // where: a boss's fan centred on her (an odd number: one comes straight
    // at her); a monster's first orb at her, its second where she is going
    // (where she will be when it gets there, if she keeps on; standing
    // still, beside her): walking on or standing still are both no shelter,
    // turning aside is
    const angles = []
    if (big) for (let i = 0; i < n; i++) angles.push(a0 + (i - (n - 1) / 2) * spread)
    else {
      angles.push(a0)
      if (n > 1) {
        const t = Math.hypot(p.x - e.x, p.y - e.y) / S.speed
        const lead = Math.atan2(p.y + p.vy * t - e.y, p.x + p.vx * t - e.x)
        let d = Math.atan2(Math.sin(lead - a0), Math.cos(lead - a0))
        if (Math.abs(d) < spread) d = (d < 0 || (d === 0 && run.rng() < 0.5) ? -1 : 1) * spread
        angles.push(a0 + d)
      }
    }
    const room = big ? n : Math.max(0, C.maxShots - voidShots(run))
    for (const a of angles.slice(0, room)) {
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      run.shots.push({ owner: e.id, x: e.x + dx * e.r * 0.7, y: e.y + dy * e.r * 0.7, vx: dx * S.speed, vy: dy * S.speed, r: S.r, damage: e.damage * S.damage, ttl: S.ttl, kind: 'abyss' })
      run.stats.corrupt.shots++
    }
    run.events.push({ type: 'voidShot', id: e.id, x: e.x, y: e.y })
    return false
  }
  e.cFire -= dt
  if (e.cFire > 0) return false
  const d = Math.hypot(p.x - e.x, p.y - e.y)
  // (out of reach, too near, or the air already full of them: later)
  if (d > S.range || d < S.near || (!big && voidShots(run) >= C.maxShots)) {
    e.cFire = 0.4
    return false
  }
  e.cAim = 0
  e.cAimA = Math.atan2(p.y - e.y, p.x - e.x)
  return !big
}

// how far it has turned, for the drawing: 0 clean … 1 full; and the warning's
// share done (0 … 1) while it warns
export function corruptLook(run, e) {
  if (!e.cStage) return null
  if (e.cStage === 1) return { stage: 1, k: Math.min(1, e.cWarn / run.corrupt.warn) }
  const S = run.corrupt.shot
  const aim = e.cAim !== undefined ? Math.min(1, e.cAim / (e.rank ? S.bossWindup : S.windup)) : 0
  return { stage: 2, k: 1, aim }
}

