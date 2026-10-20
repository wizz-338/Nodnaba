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

// how much every coin of a chapter is worth: ×coinGrowth for each chapter
// after the first (rewards, coins on the field, coins in its chests)
export const chapterCoins = (D, chapter) => D.balance.rewards.coinGrowth ** (Math.max(1, chapter) - 1)

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

// opts: { chapter, weaponId, grade, seed, runId, perma: { hp: L, damage: L, … },
//         cats: true once the cat companions have joined,
//         tizzzz: true once the writer Tizzzz has joined }
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
  // the cats come along from their chapter on, once they have joined
  const withCats = !!opts.cats && chapter >= B.cats.activeFromChapter
  // Tizzzz rewrites a card at every level-up from her chapter on
  const withWriter = !!opts.tizzzz && chapter >= B.tizzzz.activeFromChapter
  const pool = [...def.core, ...B.upgrades.pool.filter((id) => !CORE.includes(id))]
  // with the cats, the magnet's place among the cards goes to 냥냥 연금술
  if (withCats) pool[pool.indexOf(B.upgrades.catSwap.from)] = B.upgrades.catSwap.to
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
    pool,
    cats: [],
    nyang: 0, // 냥냥 연금술 level this run (0: the cats leave hearts alone)
    writer: withWriter,
    edit: null, // { id, seq }: the card Tizzzz rewrote in the cards on show
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
  if (withCats) run.cats = makeCats(run)
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

export const phaseIndex = (run) => {
  const P = run.D.balance.chapter.phases
  let i = 0
  while (i + 1 < P.length && P[i + 1].from <= run.t) i++
  return i
}
export const phaseAt = (run) => run.D.balance.chapter.phases[phaseIndex(run)]

// the later chapters' extra push in the middle and end of a run: none before
// fromChapter, then growing a step each chapter until fullAtChapter
export function lateGame(run) {
  const L = run.D.balance.lateGame
  if (run.chapter < L.fromChapter) return { hp: 1, damage: 1, specialHp: () => 1 }
  const k = Math.min(1, (run.chapter - L.fromChapter + 1) / (L.fullAtChapter - L.fromChapter + 1))
  const i = phaseIndex(run)
  const part = (m) => m ** k // ×m at full strength, a share of it (on the log scale) before
  // from Tizzzz's chapter on, her rewritten cards are answered by tougher monsters
  const W = L.writer
  const w = run.chapter >= W.fromChapter ? { hp: W.hp[i], damage: W.damage[i], special: W.specialHp } : { hp: 1, damage: 1, special: {} }
  return {
    hp: part(L.hp[i]) * w.hp,
    damage: part(L.damage[i]) * w.damage,
    specialHp: (type) => part(L.specialHp[type] ?? 1) * (w.special[type] ?? 1),
  }
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
  const late = lateGame(run)
  const hp = def.hp * (special ? late.specialHp(type) : phase.hpMultiplier * late.hp) * run.factor.hp
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
    damage: def.damage * run.factor.damage * late.damage,
    damageMul: run.factor.damage * late.damage, // for the boss's charge and slam
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
  if (ev.key === 'boss') {
    run.boss = e
    // its guard from bossGuard.fromChapter on (full from the start)
    const G = run.D.balance.lateGame.bossGuard
    // and hits harder (body, charge, slam), so those seconds are a fight
    if (run.chapter >= G.fromChapter) Object.assign(e, { guard: true, guardLeft: e.maxHp * G.maxShare * G.burst, guardT: run.t, damage: e.damage * G.hits, damageMul: e.damageMul * G.hits })
  }
  run.events.push({ type: ev.key === 'boss' ? 'boss' : 'elite', key: ev.key, name: def.name })
}

function hurtEnemy(run, e, dmg, x, y) {
  if (e.state !== 'live') return
  if (e.guard) dmg = guarded(run, e, dmg)
  e.hp -= dmg
  e.hitT = FLASH
  run.stats.hits++
  run.stats.damage += Math.min(dmg, e.hp + dmg)
  if (dmg > 0) run.events.push({ type: 'hit', x, y, n: dmg })
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
  if (run.rng() < B.drops.coinChance) run.orbs.push({ kind: 'coin', x: e.x + 6, y: e.y + 3, v: B.drops.coinAmount * chapterCoins(run.D, run.chapter), pull: false })
  if (run.rng() < B.drops.healChance) run.orbs.push({ kind: 'heal', x: e.x - 6, y: e.y + 2, v: B.drops.healAmount, pull: false })
}

// the skull king's guard (lateGame.bossGuard): it loses at most maxShare of
// its HP a second (a second's worth can be spent at once), so even a build
// that has grown past all measure fights it for a while; what is over the
// guard is lost
function guarded(run, e, dmg) {
  const G = run.D.balance.lateGame.bossGuard
  const rate = e.maxHp * G.maxShare
  e.guardLeft = Math.min(rate * G.burst, e.guardLeft + (run.t - e.guardT) * rate)
  e.guardT = run.t
  const n = Math.min(dmg, Math.max(0, e.guardLeft))
  e.guardLeft -= n
  return n
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
  if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (def.stompRadius + p.hitR) ** 2) hurtPlayer(run, def.stompDamage * e.damageMul)
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
  // regen: a share of the maximum HP each second, so it keeps its worth at any HP
  if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * p.maxHp * dt)
  if (p.inv > 0) p.inv -= dt
  if (p.hitT > 0) p.hitT -= dt
}

// what touching this enemy costs right now (a charging boss hits harder)
const touchDamage = (run, e) => (e.behavior === 'boss' && e.mode === 'charge' ? run.D.balance.enemies[e.type].chargeDamage * e.damageMul : e.damage)

// boss overtime hits harder and harder: a run that can no longer win ends
export const overtimeHit = (run) => {
  const o = run.D.balance.chapter.overtime
  return overtime(run) ? o.hitsHarder ** (Math.floor((run.t - o.after) / o.every) + 1) : 1
}

function hurtPlayer(run, dmg) {
  const p = run.player
  const n = dmg * p.armor * overtimeHit(run)
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
  } else if (o.kind === 'pheal') {
    // a 퍼센트 하트: a share of the maximum HP, never past it
    const n = p.maxHp * o.v
    p.hp = Math.min(p.maxHp, p.hp + n)
    run.events.push({ type: 'heal', x: p.x, y: p.y, n })
  }
  o.done = true // gone: a cat after it looks elsewhere
}

function moveOrbs(run, dt) {
  const p = run.player
  const pullAfter = run.D.balance.xp.pullAfter
  const keep = []
  for (const o of run.orbs) {
    if (o.done) continue // picked up by a cat this step
    if (o.pop > 0) {
      // a 퍼센트 하트 still jumping out of a cat: not there to pick up yet
      o.pop -= dt
      keep.push(o)
      continue
    }
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
      if (m) (m.v += o.v), (o.done = true)
      else out.push(o)
    }
    run.orbs = out
  }
}

// ── the cat companions ──────────────────────────────────────────────────────
// They fetch coins and experience lying on the field (each cat its own pick,
// never the same one as another cat), and with 냥냥 연금술 they eat a normal
// heart and spit out 퍼센트 하트. They never fight, have no HP, touch nothing
// and never get in Mano's way. With nothing to fetch they play near her.

function makeCats(run) {
  const p = run.player
  return run.D.cats.companions.map((c, i) => ({
    id: c.id,
    frames: c.frames,
    x: p.x + (i - 1) * 24,
    y: p.y + 20,
    vx: 0,
    vy: 0,
    face: i % 2 ? -1 : 1,
    mode: 'sit', // go (to a pickup) | roam | sit | eat
    modeT: 0.4 + i * 0.35,
    target: null,
    roam: null,
    look: i * 0.08, // the three look around at different moments
    hop: 0, // time left of a little jump (drawn)
    step: 0, // distance run, for the legs
    eats: 0,
  }))
}

// what a cat goes for: coins and experience, and normal hearts once it knows
// 냥냥 연금술. Never a 퍼센트 하트 (so nothing is ever turned twice), never
// one already flying to Mano, or to another cat.
const catWants = (run, o, cat) => !o.done && !o.pull && !(o.cat && o.cat !== cat) && !(o.pop > 0) && (o.kind === 'xp' || o.kind === 'coin' || (o.kind === 'heal' && run.nyang > 0))

// the nearest wanted pickup no other cat is after (hearts count a little nearer)
function catTarget(run, cat) {
  let best = null
  let bd = Infinity
  for (const o of run.orbs) {
    if (!catWants(run, o, cat)) continue
    if (run.cats.some((c) => c !== cat && c.target === o)) continue
    const d = Math.hypot(o.x - cat.x, o.y - cat.y) * (o.kind === 'heal' ? 0.6 : 1)
    if (d < bd) (bd = d), (best = o)
  }
  return best
}

function updateCats(run, dt) {
  if (!run.cats.length) return
  const C = run.D.balance.cats
  const p = run.player
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  const inX = (x) => Math.max(x0 + 8, Math.min(x1 - 8, x))
  const inY = (y) => Math.max(y0 + 8, Math.min(y1 - 4, y))
  for (const c of run.cats) {
    if (c.hop > 0) c.hop -= dt
    if (c.mode === 'eat') {
      // munching a heart: stands still, then out come the 퍼센트 하트
      c.vx = c.vy = 0
      c.modeT -= dt
      if (c.modeT <= 0) {
        spitHearts(run, c)
        c.mode = 'roam'
        c.roam = null
        c.hop = 0.3
      }
      continue
    }
    // a pickup gone (taken, flown to Mano): look for the next one at once
    if (c.target && !catWants(run, c.target, c)) (c.target = null), (c.look = 0)
    if ((c.look -= dt) <= 0) {
      c.look = C.lookEverySeconds
      c.target = catTarget(run, c) || c.target
    }
    let tx = c.x
    let ty = c.y
    let sp = 0
    if (c.target) {
      c.mode = 'go'
      tx = c.target.x
      ty = c.target.y
      sp = C.speed
    } else {
      if (c.mode === 'go') (c.mode = 'roam'), (c.roam = null)
      c.modeT -= dt
      if (c.mode === 'sit') {
        if (c.modeT <= 0) (c.mode = 'roam'), (c.roam = null)
      } else if (!c.roam || c.modeT <= 0 || (!c.roam.follow && Math.hypot(c.roam.x - c.x, c.roam.y - c.y) < 3)) {
        const r = run.rng()
        if (r < 0.25 && c.roam) {
          // sit a moment (tail going)
          c.mode = 'sit'
          c.modeT = 0.6 + run.rng() * 1.2
          c.roam = null
        } else if (r < 0.4) {
          // run after another cat for a while
          const others = run.cats.filter((o) => o !== c)
          c.roam = { follow: others[Math.floor(run.rng() * others.length)] }
          c.modeT = 1 + run.rng()
          if (run.rng() < 0.5) c.hop = 0.3
        } else {
          // a spot somewhere near Mano
          const a = run.rng() * 2 * Math.PI
          const d = C.stayNearMano * (0.35 + 0.65 * run.rng())
          c.roam = { x: inX(p.x + Math.cos(a) * d), y: inY(p.y + Math.sin(a) * d) }
          c.modeT = 1.5 + run.rng() * 1.5
          if (run.rng() < 0.2) c.hop = 0.3
        }
      }
      if (c.mode === 'roam' && c.roam) {
        const g = c.roam.follow || c.roam
        tx = g.x
        ty = g.y
        sp = c.roam.follow ? C.speed * 0.8 : C.wanderSpeed
      }
      // strayed far from Mano: back to her at a run
      if (Math.hypot(p.x - c.x, p.y - c.y) > C.stayNearMano * 2.2) {
        c.mode = 'roam'
        c.roam = null
        tx = p.x
        ty = p.y
        sp = C.speed
      }
    }
    const dx = tx - c.x
    const dy = ty - c.y
    const d = Math.hypot(dx, dy)
    if (sp > 0 && d > 0.5) {
      const m = Math.min(d, sp * dt)
      c.vx = (dx / d) * sp
      c.vy = (dy / d) * sp
      c.x = inX(c.x + (dx / d) * m)
      c.y = inY(c.y + (dy / d) * m)
      c.step += m
      if (Math.abs(c.vx) > sp * 0.2) c.face = c.vx > 0 ? 1 : -1
    } else c.vx = c.vy = 0
    if (c.target && Math.hypot(c.target.x - c.x, c.target.y - c.y) <= C.reach) catTake(run, c, c.target)
    catMagnet(run, c, dt)
  }
}

// Coins and experience within a cat's magnet fly to it and are taken when
// they arrive, so a cat sweeps a whole pile instead of fetching one by one.
// (Hearts are never pulled: a cat has to go and eat those.) What Mano's own
// pull has caught stays hers.
function catMagnet(run, c, dt) {
  if (c.mode === 'eat') return
  const C = run.D.balance.cats
  const r2 = C.magnet * C.magnet
  for (const o of run.orbs) {
    if (o.done || o.pull || o.pop > 0 || (o.kind !== 'xp' && o.kind !== 'coin')) continue
    if (o.cat && o.cat !== c) continue
    const dx = c.x - o.x
    const dy = c.y - o.y
    const d2 = dx * dx + dy * dy
    if (!o.cat && d2 > r2) continue
    o.cat = c
    const d = Math.sqrt(d2)
    if (d <= C.reach) {
      if (c.target === o) c.target = null
      catTake(run, c, o)
      continue
    }
    const m = Math.min(d, C.magnetSpeed * dt)
    o.x += (dx / d) * m
    o.y += (dy / d) * m
  }
}

function catTake(run, c, o) {
  c.target = null
  if (o.kind === 'heal') {
    // a normal heart is eaten (not healing anyone) and turned into 퍼센트 하트
    o.done = true
    c.mode = 'eat'
    c.modeT = run.D.balance.cats.eatSeconds
    c.eats++
    run.stats.catEats = (run.stats.catEats || 0) + 1
    run.events.push({ type: 'catEat', x: c.x, y: c.y })
    return
  }
  // coins and experience: exactly as if Mano had picked them up
  run.stats.catPicks = (run.stats.catPicks || 0) + 1
  o.byCat = true
  collect(run, o)
}

// the 퍼센트 하트 of the current 냥냥 연금술 level, spread around the cat so
// they never lie on top of each other
function spitHearts(run, c) {
  const L = run.D.balance.upgrades.effects.nyang.levels[run.nyang - 1]
  if (!L) return
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  const spread = run.D.balance.percentHeart.spread
  const a0 = run.rng() * 2 * Math.PI
  for (let i = 0; i < L.hearts; i++) {
    const a = a0 + (i / L.hearts) * 2 * Math.PI + (run.rng() - 0.5) * 0.5
    const d = spread * (0.8 + 0.4 * run.rng())
    run.orbs.push({
      kind: 'pheal',
      x: Math.max(x0 + 8, Math.min(x1 - 8, c.x + Math.cos(a) * d)),
      y: Math.max(y0 + 8, Math.min(y1 - 8, c.y + Math.sin(a) * d)),
      v: L.share,
      pull: false,
      pop: 0.35, // jumping out of the cat (drawn as an arc), not yet to pick up
      fromX: c.x,
      fromY: c.y,
    })
  }
  run.stats.pHearts = (run.stats.pHearts || 0) + L.hearts
  run.events.push({ type: 'catSpit', x: c.x, y: c.y, n: L.hearts })
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
      return { regen: p.regen + E.addMaxHpShare }
    case 'armor':
      return { armor: p.armor * E.mul }
    case 'xpGain':
      return { xpMul: p.xpMul * E.mul }
    case 'nyang': {
      // the next level of the table: how many 퍼센트 하트 and how much each heals
      const L = Math.min(E.levels.length, run.nyang + 1)
      return { nyang: L, ...E.levels[L - 1] }
    }
    default:
      return {}
  }
}

// Three different options, all with the same chance; an option chosen before
// stays in the pool and can come back at every later level.
export function drawChoices(run) {
  // a card with levels (냥냥 연금술) leaves the pool at its last level
  const left = run.pool.filter((id) => !maxed(run, id))
  const out = []
  while (out.length < 3 && left.length) out.push(left.splice(Math.floor(run.rng() * left.length), 1)[0])
  return out
}

const levelsOf = (run, id) => run.D.balance.upgrades.effects[id].levels
export const maxed = (run, id) => !!levelsOf(run, id) && (run.picks[id] || 0) >= levelsOf(run, id).length

function openChoice(run) {
  run.state = 'levelup'
  run.choices = drawChoices(run)
  run.choiceSeq++
  // Tizzzz rewrites one of them, at random among those that can take it
  run.edit = null
  if (run.writer) {
    const ok = run.choices.filter((id) => canEdit(run, id))
    if (ok.length) run.edit = { id: ok[Math.floor(run.rng() * ok.length)], seq: run.choiceSeq }
  }
}

// put an upgrade's new values (from applyPreview) into the run
function applyChange(run, ch) {
  const w = run.weapon
  const p = run.player
  for (const k of ['count', 'damage', 'bounces', 'splitChance', 'interval', 'radius', 'critChance', 'critMul']) if (k in ch) w[k] = ch[k]
  if ('ballSpeed' in ch) w.speed = ch.ballSpeed
  for (const k of ['pickupR', 'speed', 'coinMul', 'regen', 'armor', 'xpMul']) if (k in ch) p[k] = ch[k]
  if ('maxHp' in ch) (p.maxHp = ch.maxHp), (p.hp = ch.hp)
  if ('nyang' in ch) run.nyang = ch.nyang
}

// What choosing `id` n times in a row would make (pure: works on a copy).
// For the cards: n = 1, or Tizzzz's times for the card she rewrote.
export function previewTimes(run, id, n) {
  const tmp = { D: run.D, weapon: { ...run.weapon }, player: { ...run.player }, nyang: run.nyang }
  for (let i = 0; i < n; i++) applyChange(tmp, applyPreview(tmp, id))
  const w = tmp.weapon
  const p = tmp.player
  return { ...w, ballSpeed: w.speed, maxHp: p.maxHp, hp: p.hp, speed: p.speed, pickupR: p.pickupR, coinMul: p.coinMul, regen: p.regen, armor: p.armor, xpMul: p.xpMul, nyang: tmp.nyang }
}

// Tizzzz's rewrite: the card can take her `times` (a card with levels needs
// that many levels left)
export function canEdit(run, id) {
  const L = levelsOf(run, id)
  return !L || (run.picks[id] || 0) + run.D.balance.tizzzz.times <= L.length
}
export const isEdited = (run, id, seq) => !!run.edit && run.edit.id === id && run.edit.seq === seq

// Apply a choice. `seq` must be the one shown with the cards, so a double tap
// (or a tap on cards that already changed) does nothing. Returns true once.
export function choose(run, id, seq) {
  if (run.state !== 'levelup' || seq !== run.choiceSeq || !run.choices || !run.choices.includes(id)) return false
  // a card Tizzzz rewrote does its own effect `times` times over, exactly as
  // if it had been chosen that many times (the same multiplying, nothing else)
  const times = isEdited(run, id, seq) ? run.D.balance.tizzzz.times : 1
  for (let i = 0; i < times; i++) {
    applyChange(run, applyPreview(run, id))
    run.picks[id] = (run.picks[id] || 0) + 1
    run.log.push(id)
  }
  if (times > 1) run.stats.edited = (run.stats.edited || 0) + 1
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
  updateCats(run, dt)
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
