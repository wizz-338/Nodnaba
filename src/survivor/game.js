// MANO SURVIVOR — one run (one chapter) of the battle. Plain data in, plain
// data out (no drawing, no DOM), so it can be tested and played by a bot in
// Node. Every number comes from data/balance.json (the balanceConfig).
//
// Positions are ground points in the 360 × 640 logical screen; every hit test
// is a circle on the ground (never the picture). Times are seconds. step()
// advances in fixed 1/60 s steps; nothing moves while the run waits for an
// upgrade choice, and the page simply stops calling step() while paused.
//
// A chapter runs on a clock: the monsters change by phase, the first elite
// comes at 70 s, the second at 145 s, the boss at 210 s. The chapter is
// cleared only when the boss falls; a boss still standing at 240 s means boss
// overtime (the fight goes on and monsters come faster), never a free clear.

import { BEHAVIORS } from './weapons.js'

export const FIXED = 1 / 60
const TELEGRAPH = 0.35 // s an enemy shows where it will appear before it can touch
const DIE_TIME = 0.28
const DOWN_TIME = 0.55
const HIT_ANIM = 0.18
const FLASH = 0.12 // s an enemy flashes when hit
const CELL = 32
const CORE = ['count', 'interval', 'damage', 'bounce']

export function rng32(seed) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const gradeIndex = (D, grade) => Math.max(0, D.balance.grades.indexOf(grade))
export const gradeMul = (D, grade) => D.balance.gradeMultipliers[gradeIndex(D, grade)]
export const weaponDef = (D, id) => D.weapons.registry.find((w) => w.id === id) || null

// difficulty of a chapter: the listed ones, then each further one multiplied
export function chapterFactor(D, chapter) {
  const list = D.balance.chapters
  if (chapter <= list.length) return list[chapter - 1]
  const last = list[list.length - 1]
  const g = D.balance.beyondLastChapter
  const n = chapter - list.length
  return { hp: last.hp * g.hp ** n, damage: last.damage * g.damage ** n, spawn: last.spawn * g.spawn ** n }
}

// what the coin stats give (same formulas as the shop; see progress.js)
function perma(D, levels = {}) {
  const S = D.balance.perma.stats
  const v = (k) => {
    const s = S[k]
    const L = Math.min(levels[k] || 0, s.maxLevel ?? Infinity)
    return s.add ? Math.min(s.max ?? Infinity, s.add * L) : s.mul ** L
  }
  return { hp: v('hp'), damage: v('damage'), move: v('move'), interval: v('interval'), crit: v('crit'), coins: v('coins') }
}

// ── a new run ───────────────────────────────────────────────────────────────

// opts: { chapter, weaponId, grade, seed, runId, perma: { hp: L, damage: L, … } }
export function createRun(D, opts) {
  const B = D.balance
  const def = weaponDef(D, opts.weaponId)
  const behaviour = def && BEHAVIORS[def.behaviorId]
  if (!behaviour) throw new Error('weapon not implemented: ' + opts.weaponId)
  const [x0, y0, x1, y1] = B.logicalArena.bounds
  const pm = perma(D, opts.perma)
  const grade = opts.grade || 'D'
  // the weapon's base, times its grade, times the coin stats: each its own
  // factor, multiplied together
  const weapon = behaviour.stats(def, gradeMul(D, grade))
  weapon.damage *= pm.damage
  weapon.interval *= pm.interval
  weapon.critChance = B.player.critChance + pm.crit
  weapon.critMul = B.player.critMultiplier
  const hp = B.player.hp * pm.hp
  const chapter = opts.chapter || 1
  const run = {
    D,
    id: opts.runId || 'run',
    chapter,
    factor: chapterFactor(D, chapter),
    rng: rng32(opts.seed || 1),
    t: 0,
    state: 'play', // play | levelup | dying | over
    result: null, // { cleared, time, kills, coins, level, elites, bossLeft }
    spawnT: 0,
    nextId: 1,
    player: {
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2 + 40,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      speed: B.player.speed * pm.move,
      baseSpeed: B.player.speed,
      hitR: B.player.hitRadius,
      pickupR: B.player.pickupRadius,
      regen: 0,
      armor: 1,
      xpMul: 1,
      coinMul: pm.coins,
      inv: 0,
      hitT: 0,
      moving: false,
    },
    // this run's weapon: a fresh copy, upgrades never touch the saved one
    weaponDef: def,
    behaviour,
    weapon,
    grade,
    // the weapon's own four core cards, then the general ones
    pool: [...def.core, ...B.upgrades.pool.filter((id) => !CORE.includes(id))],
    fireT: 0.4,
    enemies: [],
    balls: [],
    orbs: [],
    events: [], // for the renderer: impacts, deaths, numbers (drained every frame)
    awards: [], // rewards earned this run ('elite1', 'elite2', 'boss'), for the page to save
    nextEvent: 0,
    elites: {}, // key → the enemy, once it has come
    eliteKills: 0,
    boss: null,
    bossDown: false,
    xp: 0,
    level: 1,
    need: B.xp.startThreshold,
    pending: 0, // level-ups waiting for a choice
    choices: null,
    choiceSeq: 0,
    picks: {}, // upgrade id → times chosen this run
    log: [], // upgrade ids in the order chosen
    kills: 0,
    coins: 0,
    // what really happened (telemetry: for the result, the tests and the
    // balance runs; the page adds its frame times)
    stats: { volleys: 0, shots: 0, launched: 0, merged: 0, hits: 0, crits: 0, damage: 0, splits: 0, children: 0, hurt: 0, peakBalls: 0, frames: 0, frameMs: 0, frameMsMax: 0 },
    acc: 0,
  }
  run.grid = makeGrid(run)
  run.hurt = (e, dmg, x, y) => hurtEnemy(run, e, dmg, x, y)
  return run
}

// ── spatial grid for enemies (rebuilt every step) ───────────────────────────

function makeGrid(run) {
  const [, , x1, y1] = run.D.balance.logicalArena.bounds
  const cols = Math.ceil((x1 + 40) / CELL)
  const rows = Math.ceil((y1 + 40) / CELL)
  const cells = Array.from({ length: cols * rows }, () => [])
  const key = (x, y) => Math.max(0, Math.min(rows - 1, Math.floor(y / CELL))) * cols + Math.max(0, Math.min(cols - 1, Math.floor(x / CELL)))
  return {
    rebuild(list) {
      for (const c of cells) c.length = 0
      for (const e of list) cells[key(e.x, e.y)].push(e)
    },
    // calls fn on every enemy whose cell is near (x, y)
    near(x, y, reach, fn) {
      const cx0 = Math.max(0, Math.floor((x - reach) / CELL))
      const cx1 = Math.min(cols - 1, Math.floor((x + reach) / CELL))
      const cy0 = Math.max(0, Math.floor((y - reach) / CELL))
      const cy1 = Math.min(rows - 1, Math.floor((y + reach) / CELL))
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (const e of cells[cy * cols + cx]) fn(e)
    },
    // the first enemy overlapping a circle that passes `ok`
    first(x, y, r, ok) {
      let hit = null
      let bd = Infinity
      this.near(x, y, r + 30, (e) => {
        const d = (e.x - x) ** 2 + (e.y - y) ** 2
        if (d < (e.r + r) ** 2 && d < bd && ok(e)) {
          bd = d
          hit = e
        }
      })
      return hit
    },
  }
}

// ── the clock: phases and events ────────────────────────────────────────────

export const phaseAt = (run) => {
  const P = run.D.balance.chapter.phases
  let i = 0
  while (i + 1 < P.length && P[i + 1].from <= run.t) i++
  return P[i]
}

// boss overtime: the clock has run out and the boss still stands
export const overtime = (run) => run.t > run.D.balance.chapter.overtime.after && !!run.boss && run.boss.state !== 'down'

export function spawnInterval(run) {
  const o = run.D.balance.chapter.overtime
  let iv = phaseAt(run).spawnInterval / run.factor.spawn
  if (overtime(run)) iv *= o.spawnFaster ** (Math.floor((run.t - o.after) / o.every) + 1)
  return iv
}

// ── enemies ─────────────────────────────────────────────────────────────────

function pickType(run) {
  const mix = phaseAt(run).mix
  let total = 0
  for (const k in mix) total += mix[k]
  let r = run.rng() * total
  for (const k in mix) {
    r -= mix[k]
    if (r <= 0) return k
  }
  return Object.keys(mix)[0]
}

// a point on the arena's edge, all four sides by their length, never right
// next to Mano (a few tries; null if there was no room this time)
function edgePoint(run, m) {
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  const p = run.player
  for (let tries = 0; tries < 8; tries++) {
    const w = x1 - x0
    const h = y1 - y0
    let d = run.rng() * 2 * (w + h)
    let x
    let y
    if (d < w) (x = x0 + d), (y = y0 + m)
    else if ((d -= w) < h) (x = x1 - m), (y = y0 + d)
    else if ((d -= h) < w) (x = x1 - d), (y = y1 - m)
    else (d -= w), (x = x0 + m), (y = y1 - d)
    x = Math.max(x0 + m, Math.min(x1 - m, x))
    y = Math.max(y0 + m, Math.min(y1 - m, y))
    if ((x - p.x) ** 2 + (y - p.y) ** 2 >= 60 * 60) return { x, y }
  }
  return null
}

function spawn(run, type = pickType(run), at = null) {
  const B = run.D.balance
  const def = B.enemies[type]
  const pt = at || edgePoint(run, def.radius + 2)
  if (!pt) return null
  const phase = phaseAt(run)
  const special = !!def.rank // elites and the boss have their own strength
  const hp = def.hp * (special ? 1 : phase.hpMultiplier) * run.factor.hp
  const e = {
    id: run.nextId++,
    type,
    rank: def.rank || null,
    behavior: def.behavior,
    x: pt.x,
    y: pt.y,
    r: def.radius,
    hp,
    maxHp: hp,
    speed: def.speed * (special ? 1 : phase.speedMultiplier),
    damage: def.damage * run.factor.damage,
    xp: def.xp,
    state: 'spawn', // spawn | live | die | down | gone
    t: 0,
    hitT: 0,
    face: pt.x < run.player.x ? 1 : -1,
    mode: null,
    modeT: 0,
    dx: 0,
    dy: 0,
    life: 0,
    next: 'charge',
  }
  run.enemies.push(e)
  return e
}

// an elite or the boss enters from the top, on the side away from Mano
function spawnSpecial(run, ev) {
  const [x0, y0, x1] = run.D.balance.logicalArena.bounds
  const def = run.D.balance.enemies[ev.enemy]
  const p = run.player
  const e = spawn(run, ev.enemy, { x: p.x < (x0 + x1) / 2 ? x1 - def.radius - 20 : x0 + def.radius + 20, y: y0 + def.radius + 6 })
  e.key = ev.key
  run.elites[ev.key] = e
  if (ev.key === 'boss') run.boss = e
  run.events.push({ type: ev.key === 'boss' ? 'boss' : 'elite', key: ev.key, name: def.name })
}

function hurtEnemy(run, e, dmg, x, y) {
  if (e.state !== 'live') return
  e.hp -= dmg
  e.hitT = FLASH
  run.stats.hits++
  run.stats.damage += Math.min(dmg, e.hp + dmg)
  run.events.push({ type: 'hit', x, y, n: dmg })
  if (e.hp > 0) return
  e.t = 0
  run.kills++
  const B = run.D.balance
  run.events.push({ type: 'die', x: e.x, y: e.y, kind: e.type })
  run.orbs.push({ kind: 'xp', x: e.x, y: e.y, v: e.xp, pull: false })
  if (e.rank) {
    // an elite or the boss: its reward is earned now (the page saves it at once)
    run.awards.push(e.key)
    if (e.key !== 'boss') {
      run.eliteKills++
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + B.chapter.eliteHeal)
    }
  }
  if (e.behavior === 'boss') {
    // lies down a moment; the boss's fall clears the chapter when that ends
    e.state = 'down'
    e.mode = null
    return
  }
  e.state = 'die'
  if (e.rank) return
  if (run.rng() < B.drops.coinChance) run.orbs.push({ kind: 'coin', x: e.x + 6, y: e.y + 3, v: B.drops.coinAmount, pull: false })
  if (run.rng() < B.drops.healChance) run.orbs.push({ kind: 'heal', x: e.x - 6, y: e.y + 2, v: B.drops.healAmount, pull: false })
}

const toward = (e, x, y) => {
  const dx = x - e.x
  const dy = y - e.y
  const d = Math.hypot(dx, dy) || 1
  return [dx / d, dy / d]
}

// how each kind moves; returns nothing, moves e
const MOVES = {
  // straight at Mano
  chase(run, e, dt) {
    const [ux, uy] = toward(e, run.player.x, run.player.y)
    e.x += ux * e.speed * dt
    e.y += uy * e.speed * dt
  },
  // quick, swinging a little from side to side on the way in
  weave(run, e, dt) {
    const [ux, uy] = toward(e, run.player.x, run.player.y)
    const s = Math.sin(e.life * 5 + e.id) * 0.55
    const c = Math.cos(s)
    const n = Math.sin(s)
    e.x += (ux * c - uy * n) * e.speed * dt
    e.y += (uy * c + ux * n) * e.speed * dt
  },
  // aims, runs a straight line, stops, aims again
  line(run, e, dt) {
    const def = run.D.balance.enemies[e.type]
    e.modeT -= dt
    if (e.modeT <= 0) {
      if (e.mode === 'run') (e.mode = 'pause'), (e.modeT = def.pauseSeconds)
      else {
        e.mode = 'run'
        e.modeT = def.lineSeconds
        ;[e.dx, e.dy] = toward(e, run.player.x, run.player.y)
      }
    }
    if (e.mode === 'run') {
      e.x += e.dx * e.speed * dt
      e.y += e.dy * e.speed * dt
    }
  },
  // the thief: keeps away from Mano, slides along the walls, escapes in time
  flee(run, e, dt) {
    const def = run.D.balance.enemies[e.type]
    if (e.life > def.staySeconds) {
      e.state = 'gone'
      e.t = 0
      run.events.push({ type: 'escape', key: e.key })
      return
    }
    const [ux, uy] = toward(e, run.player.x, run.player.y)
    const s = Math.sin(e.life * 1.3 + e.id) * 0.8
    e.x += (-ux * Math.cos(s) + uy * Math.sin(s)) * e.speed * dt
    e.y += (-uy * Math.cos(s) - ux * Math.sin(s)) * e.speed * dt
  },
  // walk in; then, by turns, a charge (stops, shows the path, charges along
  // it) or — for the boss — a slam (stops, shows the circle, slams); rest
  boss(run, e, dt) {
    const def = run.D.balance.enemies[e.type]
    e.modeT -= dt
    if (!e.mode) (e.mode = 'walk'), (e.modeT = def.walkSeconds)
    if (e.modeT <= 0) {
      if (e.mode === 'walk') {
        if (e.next === 'stomp') {
          e.mode = 'stompWind'
          e.modeT = def.stompWindup
        } else {
          e.mode = 'windup'
          e.modeT = def.windupSeconds
          ;[e.dx, e.dy] = toward(e, run.player.x, run.player.y)
          e.face = e.dx >= 0 ? 1 : -1
        }
        e.next = def.stomp && e.next === 'charge' ? 'stomp' : 'charge'
      } else if (e.mode === 'windup') {
        // it charges exactly the path it showed, no further
        e.mode = 'charge'
        e.modeT = Infinity
        e.left = chargePath(run, e).len
      } else if (e.mode === 'stompWind') {
        stomp(run, e, def)
        e.mode = 'rest'
        e.modeT = def.restSeconds
      } else if (e.mode === 'rest') (e.mode = 'walk'), (e.modeT = def.walkSeconds)
    }
    if (e.mode === 'walk') MOVES.chase(run, e, dt)
    else if (e.mode === 'charge') {
      if (!(e.left >= 0)) e.left = chargePath(run, e).len
      const d = Math.min(e.left, def.chargeSpeed * dt)
      e.x += e.dx * d
      e.y += e.dy * d
      e.left -= d
      if (e.left <= 1e-9) (e.mode = 'rest'), (e.modeT = def.restSeconds)
    }
  },
}

// the slam: Mano inside the circle it showed is hit once
function stomp(run, e, def) {
  const p = run.player
  run.events.push({ type: 'stomp', x: e.x, y: e.y, r: def.stompRadius })
  if (p.inv > 0) return
  if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (def.stompRadius + p.hitR) ** 2) hurtPlayer(run, def.stompDamage * run.factor.damage)
}

// the charge path while it winds up: exactly where the charge will go (a band
// as wide as its body), cut short by the walls like the charge itself
export function chargePath(run, e) {
  const def = run.D.balance.enemies[e.type]
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  let len = def.chargeSpeed * def.chargeSeconds
  if (e.dx > 0) len = Math.min(len, (x1 - e.r - e.x) / e.dx)
  if (e.dx < 0) len = Math.min(len, (x0 + e.r - e.x) / e.dx)
  if (e.dy > 0) len = Math.min(len, (y1 - e.r - e.y) / e.dy)
  if (e.dy < 0) len = Math.min(len, (y0 + e.r - e.y) / e.dy)
  len = Math.max(0, len)
  return { x: e.x, y: e.y, dx: e.dx, dy: e.dy, len, half: e.r }
}

function moveEnemies(run, dt) {
  const p = run.player
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  for (const e of run.enemies) {
    e.t += dt
    if (e.hitT > 0) e.hitT -= dt
    if (e.state === 'spawn') {
      if (e.t >= TELEGRAPH) (e.state = 'live'), (e.t = 0)
      continue
    }
    if (e.state !== 'live') continue
    e.life += dt
    const ox = e.x
    MOVES[e.behavior](run, e, dt)
    if (e.state !== 'live') continue
    if (e.behavior === 'boss' && (e.mode === 'windup' || e.mode === 'stompWind')) continue
    if (Math.abs(e.x - ox) > 0.01) e.face = e.x > ox ? 1 : -1
    else if (Math.abs(p.x - e.x) > 2 && e.behavior !== 'line') e.face = p.x > e.x ? 1 : -1
  }
  // a gentle push apart so they do not stack into one blob (the big ones are
  // too heavy to be pushed)
  run.grid.rebuild(run.enemies.filter((e) => e.state === 'live'))
  for (const e of run.enemies) {
    if (e.state !== 'live') continue
    if (e.behavior !== 'boss') {
      let px = 0
      let py = 0
      run.grid.near(e.x, e.y, e.r + 30, (o) => {
        if (o === e) return
        const dx = e.x - o.x
        const dy = e.y - o.y
        const min = e.r + o.r
        const d2 = dx * dx + dy * dy
        if (d2 >= min * min || d2 === 0) return
        const d = Math.sqrt(d2)
        const push = (min - d) * (o.behavior === 'boss' ? 1 : 0.5)
        px += (dx / d) * push
        py += (dy / d) * push
      })
      const lim = 30 * dt
      e.x += Math.max(-lim, Math.min(lim, px))
      e.y += Math.max(-lim, Math.min(lim, py))
    }
    const cx = Math.max(x0 + e.r, Math.min(x1 - e.r, e.x))
    const cy = Math.max(y0 + e.r, Math.min(y1 - e.r, e.y))
    // a straight runner that meets a wall ends its line there
    if ((cx !== e.x || cy !== e.y) && e.behavior === 'line' && e.mode === 'run') e.modeT = 0
    e.x = cx
    e.y = cy
  }
  run.grid.rebuild(run.enemies.filter((e) => e.state === 'live'))
}

// ── Mano ────────────────────────────────────────────────────────────────────

function movePlayer(run, dt, input) {
  const p = run.player
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  let ix = input ? input.x : 0
  let iy = input ? input.y : 0
  const m = Math.hypot(ix, iy)
  // any angle; never faster on a diagonal; no sliding: she stops when the
  // stick is let go
  if (m > 1) (ix /= m), (iy /= m)
  p.vx = ix * p.speed
  p.vy = iy * p.speed
  p.moving = m > 0.001
  p.x = Math.max(x0 + p.hitR, Math.min(x1 - p.hitR, p.x + p.vx * dt))
  p.y = Math.max(y0 + p.hitR, Math.min(y1 - p.hitR, p.y + p.vy * dt))
  if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt)
  if (p.inv > 0) p.inv -= dt
  if (p.hitT > 0) p.hitT -= dt
}

// what touching this enemy costs right now (a charging boss hits harder)
const touchDamage = (run, e) => (e.behavior === 'boss' && e.mode === 'charge' ? run.D.balance.enemies[e.type].chargeDamage * run.factor.damage : e.damage)

function hurtPlayer(run, dmg) {
  const p = run.player
  const n = dmg * p.armor
  p.hp = Math.max(0, p.hp - n)
  p.inv = run.D.balance.player.contactInvulnerability
  p.hitT = HIT_ANIM
  run.stats.hurt += n
  run.events.push({ type: 'hurt', x: p.x, y: p.y, n })
  if (p.hp <= 0) {
    run.state = 'dying'
    run.dieT = DOWN_TIME
    run.result = summary(run, false)
  }
}

// one hit per touch, however many enemies overlap at once; the strongest counts
function contact(run) {
  const p = run.player
  if (p.inv > 0 || run.state !== 'play') return
  let worst = 0
  run.grid.near(p.x, p.y, p.hitR + 40, (e) => {
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r + p.hitR) ** 2) worst = Math.max(worst, touchDamage(run, e))
  })
  if (worst) hurtPlayer(run, worst)
}

function summary(run, cleared) {
  const b = run.boss
  return {
    cleared,
    time: run.t,
    kills: run.kills,
    coins: Math.floor(run.coins),
    level: run.level,
    elites: run.eliteKills,
    bossLeft: b ? Math.max(0, b.hp) / b.maxHp : null,
    // telemetry
    shots: run.stats.shots,
    hits: run.stats.hits,
    dps: run.t > 0 ? run.stats.damage / run.t : 0,
    peakBalls: run.stats.peakBalls,
    killsPerMinute: run.t > 0 ? (run.kills * 60) / run.t : 0,
  }
}

// ── experience, coins, healing ──────────────────────────────────────────────

function collect(run, o) {
  const p = run.player
  if (o.kind === 'xp') gainXp(run, o.v * p.xpMul)
  else if (o.kind === 'coin') run.coins += o.v * p.coinMul
  else if (o.kind === 'heal') {
    p.hp = Math.min(p.maxHp, p.hp + o.v)
    run.events.push({ type: 'heal', x: p.x, y: p.y, n: o.v })
  }
}

function moveOrbs(run, dt) {
  const p = run.player
  const pullAfter = run.D.balance.xp.pullAfter
  const keep = []
  for (const o of run.orbs) {
    // experience left lying comes to Mano by itself after a while
    if (o.kind === 'xp' && (o.age = (o.age || 0) + dt) >= pullAfter) o.pull = true
    const dx = p.x - o.x
    const dy = p.y - o.y
    const d = Math.hypot(dx, dy)
    if (d < p.hitR + 7) {
      collect(run, o)
      continue
    }
    if (d < p.pickupR || o.pull) {
      o.pull = true // once it starts coming, it comes
      const sp = Math.min(520, 140 + (p.pickupR - Math.min(d, p.pickupR)) * 4 + (o.sp = (o.sp || 0) + 900 * dt))
      o.x += (dx / d) * sp * dt
      o.y += (dy / d) * sp * dt
    }
    keep.push(o)
  }
  run.orbs = keep
  // many lying around: fold close ones together (the total is kept)
  if (run.orbs.length > 160) {
    const out = []
    for (const o of run.orbs) {
      const m = !o.pull && (o.kind === 'xp' || o.kind === 'coin') && out.find((q) => q.kind === o.kind && !q.pull && Math.abs(q.x - o.x) < 26 && Math.abs(q.y - o.y) < 26)
      if (m) m.v += o.v
      else out.push(o)
    }
    run.orbs = out
  }
}

export const nextNeed = (D, need) => Math.round(need * D.balance.xp.growth + D.balance.xp.add)

function gainXp(run, v) {
  run.xp += v
  while (run.xp >= run.need) {
    run.xp -= run.need
    run.need = nextNeed(run.D, run.need)
    run.level++
    run.pending++
  }
  if (run.pending > 0 && run.state === 'play') openChoice(run)
}

// ── upgrades ────────────────────────────────────────────────────────────────

// What an upgrade does to the current numbers (pure: returns the new values).
// Every one multiplies or adds by its amount in the balanceConfig, every time
// it is chosen, with no cap and nothing hidden. (The gap between volleys can
// go below one game step: several volleys then fire in that step.)
export function applyPreview(run, id) {
  const w = run.weapon
  const p = run.player
  const E = run.D.balance.upgrades.effects[id]
  switch (id) {
    case 'count':
      return { count: w.count * E.mul }
    case 'interval':
      return { interval: w.interval * E.mul }
    case 'damage':
      return { damage: w.damage * E.mul }
    case 'bounce':
      return { bounces: w.bounces * E.mul }
    case 'maxHp': {
      const maxHp = p.maxHp * E.mul
      return { maxHp, hp: Math.min(maxHp, p.hp + maxHp * E.healShare) }
    }
    case 'move':
      return { speed: p.speed * E.mul }
    case 'crit':
      return { critChance: w.critChance + E.add }
    case 'critDamage':
      return { critMul: w.critMul + E.add }
    case 'ballSpeed':
      return { ballSpeed: w.speed * E.mul }
    case 'size':
      return { radius: w.radius * E.mul }
    case 'pickup':
      return { pickupR: p.pickupR * E.mul }
    case 'split':
      return { splitChance: w.splitChance + E.add }
    case 'luck':
      return { coinMul: p.coinMul * E.mul }
    case 'regen':
      return { regen: p.regen + E.add }
    case 'armor':
      return { armor: p.armor * E.mul }
    case 'xpGain':
      return { xpMul: p.xpMul * E.mul }
    default:
      return {}
  }
}

// Three different options, all with the same chance; an option chosen before
// stays in the pool and can come back at every later level.
export function drawChoices(run) {
  const left = run.pool.slice()
  const out = []
  while (out.length < 3 && left.length) out.push(left.splice(Math.floor(run.rng() * left.length), 1)[0])
  return out
}

function openChoice(run) {
  run.state = 'levelup'
  run.choices = drawChoices(run)
  run.choiceSeq++
}

// Apply a choice. `seq` must be the one shown with the cards, so a double tap
// (or a tap on cards that already changed) does nothing. Returns true once.
export function choose(run, id, seq) {
  if (run.state !== 'levelup' || seq !== run.choiceSeq || !run.choices || !run.choices.includes(id)) return false
  const ch = applyPreview(run, id)
  const w = run.weapon
  const p = run.player
  for (const k of ['count', 'damage', 'bounces', 'splitChance', 'interval', 'radius', 'critChance', 'critMul']) if (k in ch) w[k] = ch[k]
  if ('ballSpeed' in ch) w.speed = ch.ballSpeed
  for (const k of ['pickupR', 'speed', 'coinMul', 'regen', 'armor', 'xpMul']) if (k in ch) p[k] = ch[k]
  if ('maxHp' in ch) (p.maxHp = ch.maxHp), (p.hp = ch.hp)
  run.picks[id] = (run.picks[id] || 0) + 1
  run.log.push(id)
  run.pending--
  if (run.pending > 0) openChoice(run)
  else {
    run.state = 'play'
    run.choices = null
    run.choiceSeq++
  }
  return true
}

// ── the chapter's clock ─────────────────────────────────────────────────────

function advanceClock(run) {
  const C = run.D.balance.chapter
  while (run.nextEvent < C.events.length && run.t >= C.events[run.nextEvent].at) spawnSpecial(run, C.events[run.nextEvent++])
  // cleared when the boss has fallen and lain down for a moment
  const b = run.boss
  if (b && b.state === 'down' && b.t >= run.D.balance.enemies[b.type].downSeconds) {
    run.bossDown = true
    run.state = 'over'
    run.result = summary(run, true)
  }
}

function spawning(run, dt) {
  const B = run.D.balance
  const iv = spawnInterval(run)
  const alive = run.enemies.reduce((n, e) => n + (e.state === 'live' || e.state === 'spawn'), 0)
  run.spawnT += dt
  if (alive >= B.performance.enemySoftLimit) {
    // full: wait, and do not save up spawns to pour out later
    run.spawnT = Math.min(run.spawnT, iv)
    return
  }
  if (run.spawnT >= iv) {
    // one pack per tick at most; a long frame never spawns a crowd at once
    if (spawnPack(run, B.performance.enemySoftLimit - alive)) run.spawnT -= iv
    run.spawnT = Math.min(run.spawnT, iv)
  }
}

// A pack: the phase's pack size of one kind of monster, bunched at one point
// of the edge (never closer than 60 to Mano), up to the room left.
function spawnPack(run, room) {
  const B = run.D.balance
  const type = pickType(run)
  const def = B.enemies[type]
  const m = def.radius + 2
  const pt = edgePoint(run, m)
  if (!pt) return 0
  const [x0, y0, x1, y1] = B.logicalArena.bounds
  const p = run.player
  const n = Math.min(room, phaseAt(run).pack || 1)
  let made = 0
  for (let i = 0; i < n; i++) {
    const a = run.rng() * 2 * Math.PI
    const d = def.radius * 1.8 * Math.sqrt(i)
    const x = Math.max(x0 + m, Math.min(x1 - m, pt.x + Math.cos(a) * d))
    const y = Math.max(y0 + m, Math.min(y1 - m, pt.y + Math.sin(a) * d))
    if ((x - p.x) ** 2 + (y - p.y) ** 2 < 60 * 60) continue
    if (spawn(run, type, { x, y })) made++
  }
  return made
}

// ── the tick ────────────────────────────────────────────────────────────────

const gone = (e) => (e.state === 'die' && e.t >= DIE_TIME) || (e.state === 'gone' && e.t >= DIE_TIME)

function tick(run, dt, input) {
  if (run.state === 'dying') {
    run.dieT -= dt
    if (run.dieT <= 0) run.state = 'over'
    return
  }
  if (run.state !== 'play') return
  run.t += dt
  movePlayer(run, dt, input)
  spawning(run, dt)
  moveEnemies(run, dt)
  run.behaviour.update(run, dt)
  if (run.balls.length > run.stats.peakBalls) run.stats.peakBalls = run.balls.length
  // finished death animations leave
  if (run.enemies.some(gone)) run.enemies = run.enemies.filter((e) => !gone(e))
  contact(run)
  if (run.state !== 'play') return
  moveOrbs(run, dt)
  if (run.state !== 'play') return
  advanceClock(run)
}

// Advance by real time dt (seconds). Long frames are capped, never replayed
// in a burst; the rest happens in fixed steps.
export function step(run, dt, input) {
  run.acc += Math.min(dt, 0.1)
  let n = 0
  while (run.acc >= FIXED && n < 8) {
    tick(run, FIXED, input)
    run.acc -= FIXED
    n++
    if (run.state === 'levelup' || run.state === 'over') {
      run.acc = 0
      break
    }
  }
  return run.state
}

// summary of what was chosen this run, for the result screen
export function buildSummary(run) {
  const O = run.D.upgrades.options
  return Object.entries(run.picks)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, name: O[id] ? O[id].name : id, icon: O[id] ? O[id].icon : null, n }))
}
