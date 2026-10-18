// MANO SURVIVOR — one run of the battle. Plain data in, plain data out (no
// drawing, no DOM), so it can be tested and played by a bot in Node.
//
// Positions are ground points in the 360 × 640 logical screen; every hit test
// is a circle on the ground. Times are seconds. step() advances in fixed
// 1/60 s steps; nothing moves while the run waits for an upgrade choice, and
// the page simply stops calling step() while paused.

import { BEHAVIORS } from './weapons.js'

export const FIXED = 1 / 60
const TELEGRAPH = 0.35 // s an enemy shows where it will appear before it can touch
const DIE_TIME = 0.28
const DOWN_TIME = 0.55
const HIT_ANIM = 0.18
const CELL = 32

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

export const gradeIndex = (D, grade) => Math.max(0, D.progression.grades.indexOf(grade))
export const gradeMul = (D, grade) => D.progression.gradeDamageMultipliers[gradeIndex(D, grade)]
export const weaponDef = (D, id) => D.weapons.registry.find((w) => w.id === id) || null

// ── a new run ───────────────────────────────────────────────────────────────

// opts: { chapter, weaponId, grade, seed, runId }
export function createRun(D, opts) {
  const B = D.balance
  const def = weaponDef(D, opts.weaponId)
  const behaviour = def && BEHAVIORS[def.behaviorId]
  if (!behaviour) throw new Error('weapon not implemented: ' + opts.weaponId)
  const [x0, y0, x1, y1] = B.logicalArena.bounds
  const run = {
    D,
    id: opts.runId || 'run',
    chapter: opts.chapter || 1,
    rng: rng32(opts.seed || 1),
    t: 0,
    state: 'play', // play | levelup | dying | over
    result: null, // { cleared, wave, kills, coins, time }
    wave: 0,
    waveT: 0,
    spawnT: 0,
    nextId: 1,
    player: {
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2 + 40,
      vx: 0,
      vy: 0,
      hp: B.player.hp,
      maxHp: B.player.hp,
      speed: B.player.speed,
      hitR: B.player.hitRadius,
      pickupR: B.player.pickupRadius,
      inv: 0,
      hitT: 0,
      moving: false,
    },
    // this run's weapon: a fresh copy, upgrades never touch the saved one
    weaponDef: def,
    behaviour,
    weapon: behaviour.stats(def, gradeMul(D, opts.grade || 'D')),
    grade: opts.grade || 'D',
    fireT: 0.4,
    enemies: [],
    balls: [],
    orbs: [],
    events: [], // for the renderer: impacts, deaths, numbers (drained every frame)
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
    stats: { shots: 0, hits: 0, damage: 0, splits: 0, children: 0, hurt: 0, wavesHealed: 0 },
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
      this.near(x, y, r + 24, (e) => {
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

// ── enemies ─────────────────────────────────────────────────────────────────

const chapterHp = (c) => 1.35 ** (c - 1)
const chapterDamage = (c) => 1.12 ** (c - 1)
export const spawnInterval = (run) => run.D.balance.waves[run.wave].spawnInterval / Math.max(1, 1 + 0.1 * (run.chapter - 1))

function pickType(run) {
  const mix = run.D.balance.waves[run.wave].mix
  let total = 0
  for (const k in mix) total += mix[k]
  let r = run.rng() * total
  for (const k in mix) {
    r -= mix[k]
    if (r <= 0) return k
  }
  return Object.keys(mix)[0]
}

function spawn(run) {
  const B = run.D.balance
  const [x0, y0, x1, y1] = B.logicalArena.bounds
  const type = pickType(run)
  const def = B.enemies[type]
  const p = run.player
  // a point on the arena's edge, all four sides by their length; never right
  // next to Mano (a few tries, else wait for the next tick)
  for (let tries = 0; tries < 8; tries++) {
    const w = x1 - x0
    const h = y1 - y0
    let d = run.rng() * 2 * (w + h)
    let x
    let y
    const m = def.radius + 2
    if (d < w) (x = x0 + d), (y = y0 + m)
    else if ((d -= w) < h) (x = x1 - m), (y = y0 + d)
    else if ((d -= h) < w) (x = x1 - d), (y = y1 - m)
    else (d -= w), (x = x0 + m), (y = y1 - d)
    x = Math.max(x0 + m, Math.min(x1 - m, x))
    y = Math.max(y0 + m, Math.min(y1 - m, y))
    if ((x - p.x) ** 2 + (y - p.y) ** 2 < 60 * 60) continue
    const wave = B.waves[run.wave]
    const hp = def.hp * wave.hpMultiplier * chapterHp(run.chapter)
    run.enemies.push({
      id: run.nextId++,
      type,
      x,
      y,
      r: def.radius,
      hp,
      maxHp: hp,
      speed: def.speed * wave.speedMultiplier,
      damage: def.damage * chapterDamage(run.chapter),
      xp: def.xp,
      state: 'spawn',
      t: 0,
      hitT: 0,
      face: x < p.x ? 1 : -1,
    })
    return true
  }
  return false
}

function hurtEnemy(run, e, dmg, x, y) {
  if (e.state !== 'live') return
  e.hp -= dmg
  e.hitT = 0.15
  run.stats.hits++
  run.stats.damage += Math.min(dmg, e.hp + dmg)
  run.events.push({ type: 'hit', x, y, n: dmg })
  if (e.hp > 0) return
  e.state = 'die'
  e.t = 0
  run.kills++
  run.events.push({ type: 'die', x: e.x, y: e.y, kind: e.type })
  run.orbs.push({ kind: 'xp', x: e.x, y: e.y, v: e.xp, vx: 0, vy: 0, pull: false })
  if (run.rng() < run.D.balance.drops.coinChance) run.orbs.push({ kind: 'coin', x: e.x + 6, y: e.y + 3, v: run.D.balance.drops.coinAmount, vx: 0, vy: 0, pull: false })
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
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d = Math.hypot(dx, dy) || 1
    e.x += (dx / d) * e.speed * dt
    e.y += (dy / d) * e.speed * dt
    if (Math.abs(dx) > 2) e.face = dx > 0 ? 1 : -1
  }
  // a gentle push apart so they do not stack into one blob
  run.grid.rebuild(run.enemies.filter((e) => e.state === 'live'))
  for (const e of run.enemies) {
    if (e.state !== 'live') continue
    let px = 0
    let py = 0
    run.grid.near(e.x, e.y, e.r + 22, (o) => {
      if (o === e) return
      const dx = e.x - o.x
      const dy = e.y - o.y
      const min = e.r + o.r
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min || d2 === 0) return
      const d = Math.sqrt(d2)
      const push = (min - d) * 0.5
      px += (dx / d) * push
      py += (dy / d) * push
    })
    const lim = 30 * dt
    e.x += Math.max(-lim, Math.min(lim, px))
    e.y += Math.max(-lim, Math.min(lim, py))
    e.x = Math.max(x0 + e.r, Math.min(x1 - e.r, e.x))
    e.y = Math.max(y0 + e.r, Math.min(y1 - e.r, e.y))
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
  // any angle; never faster on a diagonal
  if (m > 1) (ix /= m), (iy /= m)
  p.vx = ix * p.speed
  p.vy = iy * p.speed
  p.moving = m > 0.001
  p.x = Math.max(x0 + p.hitR, Math.min(x1 - p.hitR, p.x + p.vx * dt))
  p.y = Math.max(y0 + p.hitR, Math.min(y1 - p.hitR, p.y + p.vy * dt))
  if (p.inv > 0) p.inv -= dt
  if (p.hitT > 0) p.hitT -= dt
}

// one hit per touch, however many enemies overlap at once; the strongest counts
function contact(run) {
  const p = run.player
  if (p.inv > 0 || run.state !== 'play') return
  let worst = 0
  run.grid.near(p.x, p.y, p.hitR + 30, (e) => {
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r + p.hitR) ** 2) worst = Math.max(worst, e.damage)
  })
  if (!worst) return
  p.hp = Math.max(0, p.hp - worst)
  p.inv = run.D.balance.player.contactInvulnerability
  p.hitT = HIT_ANIM
  run.stats.hurt += worst
  run.events.push({ type: 'hurt', x: p.x, y: p.y, n: worst })
  if (p.hp <= 0) {
    run.state = 'dying'
    run.dieT = DOWN_TIME
    run.result = { cleared: false, wave: run.wave + 1, kills: run.kills, coins: run.coins, time: run.t, level: run.level }
  }
}

// ── experience and coins ────────────────────────────────────────────────────

function moveOrbs(run, dt) {
  const p = run.player
  const keep = []
  for (const o of run.orbs) {
    const dx = p.x - o.x
    const dy = p.y - o.y
    const d = Math.hypot(dx, dy)
    if (d < p.hitR + 7) {
      if (o.kind === 'xp') gainXp(run, o.v)
      else run.coins += o.v
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
      const m = !o.pull && out.find((q) => q.kind === o.kind && !q.pull && Math.abs(q.x - o.x) < 26 && Math.abs(q.y - o.y) < 26)
      if (m) m.v += o.v
      else out.push(o)
    }
    run.orbs = out
  }
}

export const nextNeed = (need) => Math.round(need * 1.18 + 3)

function gainXp(run, v) {
  run.xp += v
  while (run.xp >= run.need) {
    run.xp -= run.need
    run.need = nextNeed(run.need)
    run.level++
    run.pending++
  }
  if (run.pending > 0 && run.state === 'play') openChoice(run)
}

// ── upgrades ────────────────────────────────────────────────────────────────

const optionsById = (D) => Object.fromEntries(D.upgrades.options.map((o) => [o.id, o]))

// what an upgrade does to the current numbers (pure: returns the new values)
export function applyPreview(run, id) {
  const w = run.weapon
  const p = run.player
  switch (id) {
    case 'count':
      return { count: Math.min(10, w.count + 1) }
    case 'damage':
      return { damage: w.damage * 1.3 }
    case 'bounce':
      return { bounces: Math.min(16, w.bounces + 2) }
    case 'split':
      return { splitChance: Math.min(2, w.splitChance + 0.25) }
    case 'haste':
      return { interval: Math.max(0.15, w.interval * 0.85) }
    case 'size':
      return { radius: Math.min(14, w.radius * 1.15), damage: w.damage * 1.1 }
    case 'magnet':
      return { pickupR: Math.min(160, p.pickupR + 24), speed: p.speed * 1.04 }
    case 'health':
      return { maxHp: p.maxHp + 20, hp: Math.min(p.maxHp + 20, p.hp + 35) }
    default:
      return {}
  }
}

// an option at its cap would do nothing: it is never offered
export function capped(run, id) {
  const w = run.weapon
  const p = run.player
  switch (id) {
    case 'count':
      return w.count >= 10
    case 'bounce':
      return w.bounces >= 16
    case 'split':
      return w.splitChance >= 2 - 1e-9
    case 'haste':
      return w.interval <= 0.15 + 1e-9
    case 'size':
      return w.radius >= 14 - 1e-9
    case 'magnet':
      return p.pickupR >= 160
    default:
      return false
  }
}

// three different options, drawn by weight without putting back; earlier
// picks stay in the pool for the next level
export function drawChoices(run) {
  const byId = optionsById(run.D)
  const pool = run.weaponDef.upgradePool.filter((id) => byId[id] && !capped(run, id))
  const out = []
  const left = pool.slice()
  while (out.length < 3 && left.length) {
    const total = left.reduce((a, id) => a + byId[id].weight, 0)
    let r = run.rng() * total
    let k = 0
    for (; k < left.length - 1; k++) {
      r -= byId[left[k]].weight
      if (r <= 0) break
    }
    out.push(left[k])
    left.splice(k, 1)
  }
  // fewer than three left: damage and health are always there
  for (const id of ['damage', 'health']) if (out.length < 3 && !out.includes(id)) out.push(id)
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
  for (const k of ['count', 'damage', 'bounces', 'splitChance', 'interval', 'radius']) if (k in ch) w[k] = ch[k]
  if ('pickupR' in ch) p.pickupR = ch.pickupR
  if ('speed' in ch) p.speed = ch.speed
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

// ── waves ───────────────────────────────────────────────────────────────────

function advanceWave(run, dt) {
  const B = run.D.balance
  const wave = B.waves[run.wave]
  run.waveT += dt
  if (run.waveT < wave.seconds) return
  if (run.wave >= B.waves.length - 1) {
    run.state = 'over'
    run.result = { cleared: true, wave: run.wave + 1, kills: run.kills, coins: run.coins, time: run.t, level: run.level }
    return
  }
  run.wave++
  run.waveT = 0
  const p = run.player
  p.hp = Math.min(p.maxHp, p.hp + B.waveHeal)
  run.stats.wavesHealed++
  run.events.push({ type: 'wave', n: run.wave + 1 })
}

function spawning(run, dt) {
  const B = run.D.balance
  const iv = spawnInterval(run)
  const alive = run.enemies.reduce((n, e) => n + (e.state !== 'die'), 0)
  run.spawnT += dt
  if (alive >= B.performance.enemySoftLimit) {
    // full: wait, and do not save up spawns to pour out later
    run.spawnT = Math.min(run.spawnT, iv)
    return
  }
  if (run.spawnT >= iv) {
    // one at a time per tick at most; a long frame never spawns a crowd at once
    if (spawn(run)) run.spawnT -= iv
    run.spawnT = Math.min(run.spawnT, iv)
  }
}

// ── the tick ────────────────────────────────────────────────────────────────

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
  // finished death animations leave
  run.enemies = run.enemies.filter((e) => e.state !== 'die' || e.t < DIE_TIME)
  contact(run)
  if (run.state !== 'play') return
  moveOrbs(run, dt)
  if (run.state !== 'play') return
  advanceWave(run, dt)
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
  const byId = optionsById(run.D)
  return Object.entries(run.picks)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, name: byId[id] ? byId[id].name : id, icon: byId[id] ? byId[id].icon : null, n }))
}
