// MANO SURVIVOR — the story's special bosses (balance.json → specialBosses):
// each episode's 3rd chapter has its mid-boss, its 5th its final boss, each
// with its own attacks. Pure rules, no drawing.
//
// An attack is planned when it starts: its warnings are on the ground at
// once (the danger to come, exactly where it will be), and a timeline of
// things that happen once each (a mark's blast, a volley, a dash, a
// burrow). Its stages follow the clock: windup until the first blow
// (attack frame 0), strike (frame 1), recover (frame 2), then the boss walks
// again. Damage comes only from the timeline's blows and the boss's body;
// the art never deals any.
//
// Fairness, kept by the data and checked by the tests: every blow is warned
// before it lands (at least minWarn), the warning is its real shape, there
// is room to step out of it at Mano's base speed, a hit makes Mano
// untouchable for a moment (so one mistake is one hit), the slow of ice is
// mild and short, a push is short and weak, and a boss that dies takes all
// its warnings and shots with it.

// ── shapes ──────────────────────────────────────────────────────────────────

// is a circle of radius pr at (px, py) touching the hazard h
export function touches(h, px, py, pr) {
  const dx = px - h.x
  const dy = py - h.y
  if (h.kind === 'circle') return dx * dx + dy * dy < (h.r + pr) ** 2
  if (h.kind === 'cone') {
    const d = Math.hypot(dx, dy)
    if (d > h.range + pr) return false
    if (d < pr + 6) return true
    const a = Math.atan2(dy, dx) - h.dir
    const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))
    // the edge of the cone, widened by the circle's own size at that distance
    return off <= h.angle / 2 + Math.asin(Math.min(1, pr / d))
  }
  if (h.kind === 'line') {
    const t = dx * h.dx + dy * h.dy
    if (t < -pr || t > h.len + pr) return false
    return Math.abs(dx * -h.dy + dy * h.dx) < h.half + pr
  }
  return false
}

// ── which boss a chapter has ────────────────────────────────────────────────

// the special boss of a chapter: the region's mid-boss in its 3rd chapter,
// its final boss in its last (5th); none in the others
export function specialOf(D, region, chapter) {
  const S = D.balance.specialBosses
  const p = chapter - region.from + 1
  const id = p === S.midChapter ? region.skins.brute : chapter === region.to ? region.skins.boss : null
  return id && S.bosses[id] ? { id, role: chapter === region.to ? 'final' : 'mid' } : null
}

// ── the boss itself ─────────────────────────────────────────────────────────

const toward = (from, x, y) => {
  const dx = x - from.x
  const dy = y - from.y
  const d = Math.hypot(dx, dy) || 1
  return [dx / d, dy / d]
}

// the attacks it uses now (the demon king's change with its HP)
function attacksOf(run, e) {
  const B = run.D.balance.specialBosses.bosses[e.special]
  if (!B.phases) return B.attacks
  const f = e.hp / e.maxHp
  return B.phases.find((ph) => f > ph.above).attacks
}
const phaseOf = (run, e) => {
  const B = run.D.balance.specialBosses.bosses[e.special]
  if (!B.phases) return 0
  const f = e.hp / e.maxHp
  return B.phases.findIndex((ph) => f > ph.above)
}

// one tick of a special boss (api: the game's own chase / hurt / spawn)
export function updateSpecial(run, e, dt, api) {
  const S = run.D.balance.specialBosses
  // a new phase (the demon king): what was on the ground goes, a short rest
  const ph = phaseOf(run, e)
  if (e.phase === undefined) e.phase = ph
  if (ph !== e.phase) {
    e.phase = ph
    clearOwned(run, e.id)
    e.atk = null
    e.under = false
    e.rest = S.phasePause
    run.events.push({ type: 'phase', x: e.x, y: e.y })
  }
  if (e.rest > 0) {
    e.rest -= dt
    return
  }
  if (!e.atk) {
    e.walkT = (e.walkT || 0) + dt
    api.chase(run, e, dt)
    if (e.walkT >= (run.D.balance.specialBosses.bosses[e.special].walk ?? S.walkSeconds)) {
      e.walkT = 0
      const list = attacksOf(run, e)
      const spec = list[(e.atkNo = ((e.atkNo ?? -1) + 1) % list.length)]
      e.atk = plan(run, e, spec)
    }
    return
  }
  const a = e.atk
  a.t += dt
  while (a.next < a.steps.length && a.t >= a.steps[a.next].at) a.steps[a.next++].run(run, e, api)
  if (e.dash) {
    const d = Math.min(e.dash.left, e.dash.speed * dt)
    e.x += e.dash.dx * d
    e.y += e.dash.dy * d
    e.dash.left -= d
    if (e.dash.left <= 1e-6) e.dash = null
  }
  e.stage = a.t < a.strikeAt ? 'windup' : a.t < a.strikeAt + S.strikeShow || e.dash ? 'strike' : 'recover'
  if (a.t >= a.endAt && !e.dash) {
    e.atk = null
    e.stage = null
  }
}

// a boss down: nothing of its attack stays
export function clearOwned(run, id) {
  run.hazards = run.hazards.filter((h) => h.owner !== id)
  run.shots = run.shots.filter((s) => s.owner !== id)
  run.floors = run.floors.filter((f) => f.owner !== id)
}

// ── planning an attack ──────────────────────────────────────────────────────

// a warning on the ground now that strikes at run.t + delay
function hazard(run, e, h, delay) {
  const H = { owner: e.id, born: run.t, at: run.t + delay, done: false, linger: 0.22, ...h }
  run.hazards.push(H)
  return H
}

function inView(run, x, y, m = 12) {
  const [x0, y0, x1, y1] = run.view
  return [Math.max(x0 + m, Math.min(x1 - m, x)), Math.max(y0 + m, Math.min(y1 - m, y))]
}

function plan(run, e, spec) {
  const S = run.D.balance.specialBosses
  const p = run.player
  const dmg = (n) => n * e.damageMul
  const steps = []
  const at = (t, fn) => steps.push({ at: t, run: fn })
  let strikeAt = spec.warn
  let endAt = spec.warn + (spec.recover ?? S.recoverSeconds)
  const [ux, uy] = toward(e, p.x, p.y)
  e.face = ux >= 0 ? 1 : -1
  switch (spec.type) {
    case 'cone': {
      // a fan of ground in front, aimed once at the start, then slammed
      hazard(run, e, { kind: 'cone', x: e.x, y: e.y, dir: Math.atan2(uy, ux), angle: (spec.angle * Math.PI) / 180, range: spec.range, damage: dmg(spec.damage) }, spec.warn)
      break
    }
    case 'radial': {
      // slow seeds in every direction but a lane or two; their paths show first
      const a0 = run.rng() * Math.PI * 2
      const gapAt = Math.floor(run.rng() * spec.count)
      const dirs = []
      for (let i = 0; i < spec.count; i++) {
        let off = (i - gapAt + spec.count) % spec.count
        if (off < spec.gap) continue
        dirs.push(a0 + (i / spec.count) * Math.PI * 2)
      }
      // (the lanes stay drawn, fading, while the seeds fly along them)
      for (const a of dirs) hazard(run, e, { kind: 'ray', x: e.x, y: e.y, dx: Math.cos(a), dy: Math.sin(a), len: spec.show ?? 90, harmless: true, keep: 1.2, speed: spec.speed }, spec.warn)
      at(spec.warn, (run, e) => {
        for (const a of dirs) shot(run, e, Math.cos(a), Math.sin(a), spec)
      })
      break
    }
    case 'fan': {
      // a spread of shots aimed at Mano; the aim follows her until lockAt
      // of the windup, then stays (what is shown is what comes)
      const dir = { a: Math.atan2(uy, ux) }
      const spread = (spec.spread * Math.PI) / 180
      const rays = []
      for (let i = 0; i < spec.count; i++) rays.push(hazard(run, e, { kind: 'ray', x: e.x, y: e.y, dx: 1, dy: 0, len: spec.show ?? 110, harmless: true, keep: 1.0, speed: spec.speed }, spec.warn))
      const aim = () => {
        rays.forEach((r, i) => {
          const a = dir.a + (spec.count > 1 ? (i / (spec.count - 1) - 0.5) * spread : 0)
          r.dx = Math.cos(a)
          r.dy = Math.sin(a)
        })
      }
      aim()
      const lockAt = spec.warn * (spec.lock ?? 0.7)
      for (let t = 0.1; t < lockAt; t += 0.1)
        at(t, (run, e) => {
          const [vx, vy] = toward(e, run.player.x, run.player.y)
          dir.a = Math.atan2(vy, vx)
          aim()
        })
      at(spec.warn, (run, e) => {
        for (const r of rays) shot(run, e, r.dx, r.dy, spec)
      })
      break
    }
    case 'marks': {
      // a mark where Mano is, then another, then another: each stays where it
      // was put and bursts a moment later
      for (let i = 0; i < spec.count; i++)
        at(i * spec.every, (run, e) => {
          const [x, y] = inView(run, run.player.x, run.player.y)
          hazard(run, e, { kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage) }, spec.delay)
        })
      strikeAt = spec.delay
      endAt = (spec.count - 1) * spec.every + spec.delay + (spec.recover ?? S.recoverSeconds)
      break
    }
    case 'roots': {
      // roots come up over the ground around Mano, row after row, except in
      // the safe spots (shown in green from the start, one of them next to her)
      const cols = spec.cols
      const rows = spec.rows
      const sp = spec.spacing
      const [cx, cy] = inView(run, p.x, p.y, sp)
      const cells = []
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push({ i, j, x: cx + (i - (cols - 1) / 2) * sp, y: cy + (j - (rows - 1) / 2) * sp })
      const mid = cells.reduce((b, c) => (Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? c : b))
      const near = cells.filter((c) => c !== mid && Math.abs(c.i - mid.i) + Math.abs(c.j - mid.j) === 1)
      const safe = new Set([near[Math.floor(run.rng() * near.length)]])
      const others = cells.filter((c) => c !== mid && !safe.has(c))
      while (safe.size < spec.safe && others.length) safe.add(others.splice(Math.floor(run.rng() * others.length), 1)[0])
      const [x0, y0, x1, y1] = run.view
      let n = 0
      // the order: the row nearest the boss first
      const order = cells.filter((c) => !safe.has(c)).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))
      for (const c of order) {
        if (c.x < x0 - spec.r || c.x > x1 + spec.r || c.y < y0 - spec.r || c.y > y1 + spec.r) continue
        hazard(run, e, { kind: 'circle', x: c.x, y: c.y, r: spec.r, damage: dmg(spec.damage), order: n + 1 }, spec.warn + Math.floor(n / cols) * spec.step)
        n++
      }
      for (const c of safe) hazard(run, e, { kind: 'safe', x: c.x, y: c.y, r: spec.r * 0.9, harmless: true }, spec.warn + Math.ceil(n / cols) * spec.step)
      endAt = spec.warn + Math.ceil(n / cols) * spec.step + (spec.recover ?? S.recoverSeconds)
      break
    }
    case 'charge': {
      // shows its path; aims at Mano until lockAt of the windup, then that
      // path is the charge
      const path = { x: e.x, y: e.y, dx: ux, dy: uy }
      const band = hazard(run, e, { kind: 'line', x: e.x, y: e.y, dx: ux, dy: uy, len: 0, half: e.r, damage: 0, harmless: true, dash: true }, spec.warn)
      const lane = () => {
        const [x0, y0, x1, y1] = run.view
        let len = spec.speed * spec.seconds
        if (path.dx > 0) len = Math.min(len, (x1 - e.r - e.x) / path.dx)
        if (path.dx < 0) len = Math.min(len, (x0 + e.r - e.x) / path.dx)
        if (path.dy > 0) len = Math.min(len, (y1 - e.r - e.y) / path.dy)
        if (path.dy < 0) len = Math.min(len, (y0 + e.r - e.y) / path.dy)
        Object.assign(band, { x: e.x, y: e.y, dx: path.dx, dy: path.dy, len: Math.max(0, len) })
      }
      lane()
      const lockAt = spec.warn * (spec.lock ?? 0.65)
      for (let t = 0.1; t < lockAt; t += 0.1)
        at(t, (run, e) => {
          ;[path.dx, path.dy] = toward(e, run.player.x, run.player.y)
          e.face = path.dx >= 0 ? 1 : -1
          lane()
        })
      // (the path stays shown while it charges along it)
      band.keep = spec.seconds + 0.1
      at(spec.warn, (run, e) => {
        e.dash = { dx: band.dx, dy: band.dy, left: band.len, speed: spec.speed, damage: dmg(spec.damage) }
      })
      endAt = spec.warn + spec.seconds + (spec.recover ?? S.recoverSeconds)
      break
    }
    case 'slams': {
      // blows one after another, each a step further toward where Mano was
      for (let i = 0; i < spec.count; i++) {
        const [x, y] = inView(run, e.x + ux * spec.reach * (i + 1), e.y + uy * spec.reach * (i + 1))
        hazard(run, e, { kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage), order: i + 1 }, spec.warn + i * spec.every)
      }
      endAt = spec.warn + (spec.count - 1) * spec.every + (spec.recover ?? S.recoverSeconds)
      break
    }
    case 'burrow': {
      // into the sand (nothing touches it, it touches nothing), out where
      // Mano was when it went in
      const [x, y] = inView(run, p.x, p.y, spec.r)
      hazard(run, e, { kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage) }, spec.warn)
      at(spec.dig ?? 0.35, (run, e) => (e.under = true))
      at(spec.warn, (run, e) => {
        e.x = x
        e.y = y
        e.under = false
      })
      break
    }
    case 'lines': {
      // beams out of the boss, one after another round it (never all ways
      // at once: the space between two is wide); the next time turned
      e.turn = (e.turn || 0) + (spec.rotate * Math.PI) / 180
      for (let i = 0; i < spec.count; i++) {
        const a = e.turn + (i / spec.count) * Math.PI * 2
        hazard(run, e, { kind: 'line', x: e.x, y: e.y, dx: Math.cos(a), dy: Math.sin(a), len: spec.len, half: spec.width / 2, damage: dmg(spec.damage), order: i + 1 }, spec.warn + i * spec.step)
      }
      endAt = spec.warn + (spec.count - 1) * spec.step + (spec.recover ?? S.recoverSeconds)
      break
    }
    case 'floor': {
      // frost on the ground near Mano: after its warning it slows (a little,
      // for a while); there are never more than `cap` patches
      for (let i = 0; i < spec.count; i++) {
        const a = run.rng() * Math.PI * 2
        const d = i === 0 ? 0 : spec.spread * (0.6 + 0.4 * run.rng())
        const [x, y] = inView(run, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, spec.r)
        hazard(run, e, { kind: 'circle', x, y, r: spec.r, harmless: true, frost: true }, spec.warn)
        at(spec.warn, (run, e) => {
          run.floors.push({ owner: e.id, x, y, r: spec.r, from: run.t, until: run.t + spec.life, slow: spec.slow })
          while (run.floors.length > spec.cap) run.floors.shift()
        })
      }
      break
    }
    case 'wind': {
      // a gust away from the boss: short and weak (never into a wall: it
      // stops at the view's edge like walking does)
      hazard(run, e, { kind: 'cone', x: e.x, y: e.y, dir: Math.atan2(uy, ux), angle: Math.PI * 0.6, range: spec.range, harmless: true, wind: true }, spec.warn)
      at(spec.warn, (run, e) => {
        const [vx, vy] = toward(e, run.player.x, run.player.y)
        if (Math.hypot(run.player.x - e.x, run.player.y - e.y) < spec.range + 20) run.player.push = { vx: vx * spec.push, vy: vy * spec.push, until: run.t + spec.seconds }
      })
      break
    }
    case 'bolts': {
      // lightning where Mano is and close by, one after another
      for (let i = 0; i < spec.count; i++) {
        const a = run.rng() * Math.PI * 2
        const d = i === 0 ? 0 : spec.spread * (0.5 + 0.5 * run.rng())
        const [x, y] = inView(run, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d)
        hazard(run, e, { kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage), order: i + 1, bolt: true }, spec.warn + i * spec.step)
      }
      endAt = spec.warn + (spec.count - 1) * spec.step + (spec.recover ?? S.recoverSeconds)
      break
    }
    case 'chain': {
      // a row of lightning across where Mano is, falling from one end to the
      // other (numbered): stepping off the row sideways is always safe
      const a = run.rng() * Math.PI
      const cx = Math.cos(a)
      const cy = Math.sin(a)
      for (let i = 0; i < spec.count; i++) {
        const k = i - (spec.count - 1) / 2
        const [x, y] = inView(run, p.x + cx * k * spec.spacing, p.y + cy * k * spec.spacing)
        hazard(run, e, { kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage), order: i + 1, bolt: true }, spec.warn + i * spec.step)
      }
      endAt = spec.warn + (spec.count - 1) * spec.step + (spec.recover ?? S.recoverSeconds)
      break
    }
    case 'summon': {
      // a few of its own (never more than `cap` alive at once)
      const alive = run.enemies.filter((m) => m.owner === e.id && (m.state === 'live' || m.state === 'spawn')).length
      const n = Math.max(0, Math.min(spec.count, spec.cap - alive))
      const spots = []
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2 + run.rng()
        spots.push(inView(run, e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46))
      }
      for (const [x, y] of spots) hazard(run, e, { kind: 'circle', x, y, r: 16, harmless: true, summon: true }, spec.warn)
      at(spec.warn, (run, e) => {
        for (const [x, y] of spots) {
          const m = api_spawn(run, spec.enemy, x, y)
          if (m) m.owner = e.id
        }
      })
      break
    }
    case 'combo': {
      // two attacks it already knows, one after the other (their safe places
      // agree: the second starts after the first's last blow)
      const first = plan(run, e, spec.parts[0])
      const delay = spec.parts[1].after
      for (const s of first.steps) steps.push(s)
      at(delay, (run, e) => {
        const second = plan(run, e, spec.parts[1])
        for (const s of second.steps) e.atk.steps.push({ at: s.at + delay, run: s.run })
        e.atk.steps.sort((a, b) => a.at - b.at)
        e.atk.endAt = Math.max(e.atk.endAt, delay + second.endAt)
      })
      strikeAt = first.strikeAt
      endAt = Math.max(first.endAt, delay + 0.1)
      break
    }
    default:
      throw new Error('unknown attack: ' + spec.type)
  }
  steps.sort((a, b) => a.at - b.at)
  return { spec, t: 0, next: 0, steps, strikeAt, endAt }
}

// (the ordinary bosses' shooter, type C, uses the same lanes and shots: game.js)
export { hazard as addHazard, shot as fireShot }

// spawning goes through the game (set by game.js: the same spawn as waves)
let api_spawn = () => null
export const setSpawner = (fn) => (api_spawn = fn)

function shot(run, e, dx, dy, spec) {
  // (exactly on the lane that was shown)
  run.shots.push({ owner: e.id, x: e.x + dx * (e.r * 0.6), y: e.y + dy * (e.r * 0.6), vx: dx * spec.speed, vy: dy * spec.speed, r: spec.r, damage: spec.damage * e.damageMul, ttl: spec.ttl ?? 6, kind: spec.look || 'seed' })
}

// ── the ground and the air: warnings, blows, shots, frost ───────────────────

export function updateHazards(run, dt, hurt) {
  const p = run.player
  const live = run.state === 'play'
  // blows that land now (one hit each; a hit makes Mano untouchable a moment)
  if (run.hazards.length) {
    for (const h of run.hazards) {
      if (h.done || run.t < h.at) continue
      h.done = true
      if (h.harmless || !live) continue
      run.events.push({ type: h.bolt ? 'bolt' : 'blast', x: h.x, y: h.y, r: h.r || 0, x0: h.x, y0: h.y - 60, x1: h.x, y1: h.y })
      if (p.inv <= 0 && touches(h, p.x, p.y, p.hitR)) hurt(run, h.damage, 'blast')
    }
    run.hazards = run.hazards.filter((h) => run.t < h.at + (h.keep ?? (h.harmless ? 0 : h.linger)))
  }
  if (run.shots.length) {
    const [x0, y0, x1, y1] = run.view
    const out = []
    for (const s of run.shots) {
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.ttl -= dt
      if (s.ttl <= 0 || s.x < x0 - 30 || s.x > x1 + 30 || s.y < y0 - 30 || s.y > y1 + 30) continue
      if (live && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < (s.r + p.hitR) ** 2) {
        if (p.inv <= 0) hurt(run, s.damage, 'shot')
        continue
      }
      out.push(s)
    }
    run.shots = out
  }
  // frost: Mano is slowed (never below the floor's own slow) while on it
  p.slow = 1
  if (run.floors.length) {
    run.floors = run.floors.filter((f) => run.t < f.until)
    for (const f of run.floors) if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < f.r * f.r) p.slow = Math.min(p.slow, f.slow)
  }
  if (p.push && run.t >= p.push.until) p.push = null
}
