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
import { permaValue } from './perma.js'
import { CAT_CARDS, freshCatStats, catCardOpen, catPreview, syncFriends, updateFriends } from './friends.js'
import { snap, recordPick, takeBack, fits, placeTurret, relocateTurrets, updateTurrets } from './turret.js'
import { extraOf, extraSpec, updateExtra, updateHazards, clearOwned, addHazard, fireShot, startAttack, tickAttack, bossSkills, bossSkill, tierOf } from './bosses.js'
import { corruptionOf, markCorruption, corruptTick } from './corruption.js'
import { isClassCard, classOf, startClass, updateClass, revive, zyoPool, zyoCards, zyoMarks, zyoSure, powerPreview, optionName, firepower } from './zyo.js'

export const FIXED = 1 / 60
const TELEGRAPH = 0.35 // s an enemy shows where it will appear before it can touch
const DIE_TIME = 0.28
const DOWN_TIME = 0.55
const HIT_ANIM = 0.18
const FLASH = 0.12 // s an enemy flashes when hit
const FLIP_PACE = 8 // px/s the other way before a monster turns round (no flicker)
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

// the story's region of a chapter (story.json): 7 places of 5 chapters; the
// chapters past the last region go on in it
// the story's last chapter: the game ends there (the last region's end, 35)
export const lastChapter = (D) => D.story.regions[D.story.regions.length - 1].to

export function regionOf(D, chapter) {
  const R = D.story.regions
  return R.find((r) => chapter >= r.from && chapter <= r.to) || (chapter < R[0].from ? R[0] : R[R.length - 1])
}
// the monster a role wears in a region (its picture id), and its name
export const skinOf = (D, region, type) => region.skins[type] || null
export function enemyName(D, region, type) {
  const id = skinOf(D, region, type)
  return (id && D.story.monsters[id] && D.story.monsters[id].name) || D.balance.enemies[type].name || type
}
// the name of one monster on the field: the look it wears (the extra
// special boss wears its own), else its role's
export const monsterName = (D, region, e) => (e.skin && ((D.story.monsters[e.skin] && D.story.monsters[e.skin].name) || (D.motion.characters[e.skin] && D.motion.characters[e.skin].name))) || enemyName(D, region, e.type)

// what the coin stats give (same formulas as the shop; see progress.js)
function perma(D, levels = {}) {
  const S = D.balance.perma.stats
  const v = (k) => permaValue(S[k], levels[k] || 0)
  return { hp: v('hp'), damage: v('damage'), move: v('move'), interval: v('interval'), crit: v('crit'), coins: v('coins'), armor: v('armor'), regen: v('regen') }
}

// ── a new run ───────────────────────────────────────────────────────────────

// opts: { chapter, weaponId, grade, seed, runId, perma: { hp: L, damage: L, … },
//         cats: true once the cat companions have joined,
//         tizzzz: true once the writer Tizzzz has joined,
//         blessings: { phoenix, snow, thunder, final } — the story's battle
//         blessings owned (story.json → rewards),
//         rerolls: redraws of the cards a run gets (the save's; from
//                  balance.rerolls.fromChapter on),
//         bossBag: { order: [] } kept by the page from run to run, so the
//                ordinary bosses' types go round all four (see nextBossType),
//         arena: the platform's field (default: balance.logicalArena, mobile;
//                a field with a view is larger than the screen: see follow),
//         coinBonus: the coins of this run × this (the save's retry bonus:
//                    progress.js → startRun; 1 without) }
export function createRun(D, opts) {
  const B = D.balance
  const def = weaponDef(D, opts.weaponId)
  const behaviour = def && BEHAVIORS[def.behaviorId]
  if (!behaviour) throw new Error('weapon not implemented: ' + opts.weaponId)
  // the field: the mobile game's (balance.logicalArena) unless the platform
  // brings its own (the PC game's logicalArenaPc: as wide as it is tall there,
  // the same area, so the same fight)
  const arena = opts.arena || B.logicalArena
  const [x0, y0, x1, y1] = arena.bounds
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
  // zyo_'s class change from her chapter on (zyo.js)
  const withZyo = !!opts.zyo && chapter >= B.zyo.activeFromChapter
  const withTurret = !!opts.turret && chapter >= B.turret.activeFromChapter
  const pool = [...def.core, ...B.upgrades.pool.filter((id) => !CORE.includes(id))]
  // with the cats, the magnet's place among the cards goes to 냥냥 연금술, and
  // the friend cats' five cards come in (four of them once there is a cat)
  if (withCats) {
    pool[pool.indexOf(B.upgrades.catSwap.from)] = B.upgrades.catSwap.to
    pool.push(...CAT_CARDS)
  }
  // the coin stat 치명타 확률 at 100%: the crit card never comes (a card
  // of the others takes its place in every draw, a redraw too)
  const critFull = pm.crit >= 1
  if (critFull) pool.splice(pool.indexOf('crit'), 1)
  const run = {
    D,
    id: opts.runId || 'run',
    chapter,
    arena,
    // the part of the field on screen: where monsters come in and stay, and
    // what the balls bounce off (the whole field unless it has a view)
    view: arena.bounds.slice(),
    factor: chapterFactor(D, chapter),
    rng: rng32(opts.seed || 1),
    t: 0,
    state: 'play', // play | levelup | dying | over
    result: null, // { cleared, time, kills, coins, level, elites, bossLeft }
    spawnT: 0,
    nextId: 1,
    player: {
      x: arena.start ? arena.start[0] : (x0 + x1) / 2,
      y: arena.start ? arena.start[1] : (y0 + y1) / 2 + 40,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      // (the PC field is wider than the phone's: Mano runs arena.speedMul as fast)
      speed: B.player.speed * pm.move * (arena.speedMul || 1),
      baseSpeed: B.player.speed * (arena.speedMul || 1),
      hitR: B.player.hitRadius,
      pickupR: B.player.pickupRadius,
      // (the coin stats 회복 and 방어력 to start with; the run's cards add to them)
      regen: pm.regen,
      armor: pm.armor,
      xpMul: 1,
      coinMul: pm.coins * (opts.coinBonus || 1),
      inv: 0,
      slow: 1, // frost under her feet: her speed × this
      push: null, // a gust (the storm ray's): { vx, vy, until }
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
    critFull,
    cats: [],
    // the friend cats (friends.js): the line's numbers, the cats on the field,
    // a scratch's base (the ball's damage at the start of the run, so the
    // coin stat 공격 피해 and the ball's grade count once, × damageCoef) and
    // the coin stat 공격 주기 (never the ball's in-run cards)
    cat: freshCatStats(),
    friends: [],
    catBase: weapon.damage * B.friendCats.damageCoef,
    catPermaInterval: pm.interval,
    // redraws of the cards left this run
    rerolls: chapter >= B.rerolls.fromChapter ? Math.max(0, opts.rerolls | 0) : 0,
    nyang: 0, // 냥냥 연금술 level this run (0: the cats leave hearts alone)
    writer: withWriter,
    zyo: withZyo,
    cls: null, // the class this run changed into (zyo.js), once
    // the turret (turret.js): whether it can be made this run, the turrets
    // standing, and what each pick changed (so two can be taken back)
    turretOn: withTurret,
    turrets: [],
    turretId: 1,
    applied: {},
    zyoPick: null, // { ids, seq }: zyo_'s cards among those on show
    sure: [], // the class cards that came for sure once their recipe was complete (zyo.js → zyoSure)
    edit: null, // { id, seq }: the card Tizzzz rewrote in the cards on show
    region: regionOf(D, chapter), // where the chapter is: its monsters' looks and mix
    corrupt: corruptionOf(D, chapter), // 마계 침공 (chapters 26–30; corruption.js), or null
    bless: blessingsFor(D, opts.blessings),
    fireT: 0.4,
    enemies: [],
    balls: [],
    orbs: [],
    events: [], // for the renderer: impacts, deaths, numbers (drained every frame)
    awards: [], // rewards earned this run ('elite1', 'elite2', 'boss'), for the page to save
    // bosses' attacks (bosses.js): warnings and blows on the ground, shots
    hazards: [],
    // the chapter's extra special boss, once its turn has come (see startExtra)
    extra: null,
    bossBag: opts.bossBag || { order: [] }, // the ordinary bosses' types to come (see nextBossType)
    shots: [],
    floors: [],
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
    // by: damage by source (ball, cat, bless): raw (as dealt), eff (what
    // the monsters really lost) and over (the rest: past the HP left, or
    // held back by a guard), hits, kills
    stats: { volleys: 0, shots: 0, launched: 0, merged: 0, hits: 0, crits: 0, damage: 0, splits: 0, children: 0, hurt: 0, peakBalls: 0, frames: 0, frameMs: 0, frameMsMax: 0, missed: 0, by: {}, corrupt: { warned: 0, full: 0, shots: 0 } },
    acc: 0,
  }
  follow(run)
  if (withCats) run.cats = makeCats(run)
  run.grid = makeGrid(run)
  // (returns the HP it really took: never past what the monster had)
  run.hurt = (e, dmg, x, y, crit, by) => {
    if (e.state !== 'live') return 0
    const hp = e.hp
    hurtEnemy(run, e, dmg, x, y, crit, by)
    return Math.max(0, Math.min(hp, hp - e.hp))
  }
  // a ball's hit may set off a blessing (lightning never does)
  run.blessHit = (e, dmg, x, y) => blessHit(run, e, dmg, x, y)
  // its firepower at the start (zyo.js: the class's floor grows from it)
  run.fp0 = firepower(run)
  return run
}

// ── the story's blessings ───────────────────────────────────────────────────

// what this run has: each owned blessing's settings, its chance times the
// final strengthening, and a bucket of at most perSecond uses a second
function blessingsFor(D, owned = {}) {
  const B = D.balance.blessings
  const mul = owned.final ? B.final.chanceMul : 1
  const out = {}
  for (const k of ['phoenix', 'snow', 'thunder'])
    if (owned[k]) out[k] = { ...B[k], chance: Math.min(1, B[k].chance * mul), tokens: B[k].perSecond }
  return out
}

function blessHit(run, e, dmg, x, y) {
  const b = run.bless
  const fire = (k) => {
    const c = b[k]
    if (!c || c.tokens < 1 || run.rng() >= c.chance) return false
    c.tokens -= 1
    return true
  }
  const boss = e.behavior === 'boss' || e.behavior === 'extra'
  if (b.phoenix && e.state === 'live' && fire('phoenix')) {
    const c = b.phoenix
    slowDown(e, boss ? c.bossSlow : c.slow, c.seconds)
    run.events.push({ type: 'bless', kind: 'slow', x: e.x, y: e.y })
  }
  if (b.snow && e.state === 'live' && !(e.frozenAgain > run.t) && fire('snow')) {
    const c = b.snow
    // the boss is never frozen: a short slow instead
    if (boss) slowDown(e, c.bossSlow, c.bossSeconds)
    else (e.freezeT = Math.max(e.freezeT || 0, c.seconds)), (e.frozenAgain = run.t + c.again)
    run.events.push({ type: 'bless', kind: 'freeze', x: e.x, y: e.y })
  }
  if (b.thunder && fire('thunder')) {
    const c = b.thunder
    // the nearest few around the one hit (it too, if still standing), each
    // struck for a share of the hit; a strike is not a ball hit, so it sets
    // nothing else off
    const near = []
    run.grid.near(x, y, c.radius, (o) => {
      if (o.state !== 'live') return
      const d = (o.x - x) ** 2 + (o.y - y) ** 2
      if (d <= c.radius * c.radius) near.push([d, o])
    })
    near.sort((a, q) => a[0] - q[0])
    for (const [, o] of near.slice(0, c.targets)) {
      run.events.push({ type: 'bolt', x0: x, y0: y - 30, x1: o.x, y1: o.y })
      hurtEnemy(run, o, dmg * c.share, o.x, o.y, false, 'bless')
    }
  }
}

// slower for a while; a new one renews it (the stronger of the two), never stacks
function slowDown(e, mul, seconds) {
  if (!(e.slowT > 0) || mul <= e.slowMul) e.slowMul = mul
  e.slowT = Math.max(e.slowT || 0, seconds)
}

// refill the blessings' buckets (perSecond a second, never above it)
function refillBlessings(run, dt) {
  for (const c of Object.values(run.bless)) c.tokens = Math.min(c.perSecond, c.tokens + c.perSecond * dt)
}

// A field larger than its screen (the PC game's: arena.view is the size of
// the screen's play area): the view is that much of the field around Mano,
// kept inside the field — the camera. Mano and the monsters walk the whole
// field (a monster she leaves behind stays where it is, off screen); spawns
// and the balls keep to the view, as on the phone, where the view is the
// field.
function follow(run) {
  const A = run.arena
  // the extra special boss's fight: the camera holds still on its area
  if (!A.view || (run.extra && run.extra.box)) return
  const [x0, y0, x1, y1] = A.bounds
  const [w, h] = A.view
  const p = run.player
  const vx = Math.max(x0, Math.min(x1 - w, p.x - w / 2))
  const vy = Math.max(y0, Math.min(y1 - h, p.y - h / 2))
  run.view[0] = vx
  run.view[1] = vy
  run.view[2] = vx + w
  run.view[3] = vy + h
}

// ── spatial grid for enemies (rebuilt every step) ───────────────────────────

function makeGrid(run) {
  const [, , x1, y1] = run.arena.bounds
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
// (only while the chapter's boss stands: not once it has fallen, nor in the
// extra special boss's fight after it)
export const overtime = (run) => run.t > run.D.balance.chapter.overtime.after && !!run.boss && (run.boss.state === 'live' || run.boss.state === 'spawn')

// how much faster the ordinary monsters run while the chapter's boss has
// lived long (overtime.mobSpeed): by whole steps of the clock since it came,
// capped; ×1 without a boss standing (so nothing carries over)
export function mobSpeed(run) {
  const M = run.D.balance.chapter.overtime.mobSpeed
  const b = run.boss
  if (!M || !b || b.state !== 'live' || run.bossAt === undefined) return 1
  const since = run.t - run.bossAt - M.after
  if (since < 0) return 1
  return Math.min(M.max, 1 + M.step * (Math.floor(since / M.every) + 1))
}

export function spawnInterval(run) {
  const o = run.D.balance.chapter.overtime
  // (a field can bring monsters faster: spawnMul, the PC game's, whose
  // screen holds far more of the field than the phone's)
  let iv = phaseAt(run).spawnInterval / run.factor.spawn / (run.arena.spawnMul || 1)
  if (overtime(run)) iv *= o.spawnFaster ** (Math.floor((run.t - o.after) / o.every) + 1)
  return iv
}

// ── enemies ─────────────────────────────────────────────────────────────────

// the phase's mix, each role weighed by the region's taste for it
function pickType(run) {
  const mix = phaseAt(run).mix
  const bias = run.region.mix || {}
  let total = 0
  for (const k in mix) total += mix[k] * (bias[k] ?? 1)
  let r = run.rng() * total
  for (const k in mix) {
    r -= mix[k] * (bias[k] ?? 1)
    if (r <= 0) return k
  }
  return Object.keys(mix)[0]
}

// a point on the view's edge, all four sides by their length, never right
// next to Mano (a few tries; null if there was no room this time). A field
// with a spawnBox (the PC game's, whose view is much larger than the phone's
// field) uses the edge of that box around Mano, inside the view, so monsters
// come in as near and as thick as on the phone.
function edgePoint(run, m) {
  const p = run.player
  const B = run.arena.spawnBox
  let [x0, y0, x1, y1] = run.view
  if (B) {
    x0 = Math.max(x0, p.x - B[0] / 2)
    x1 = Math.min(x1, p.x + B[0] / 2)
    y0 = Math.max(y0, p.y - B[1] / 2)
    y1 = Math.min(y1, p.y + B[1] / 2)
  }
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

// a point in a random direction from Mano: on the view's edge (inside it,
// m from the edge), or past it (out) but inside the field; null if none fits
export function aroundPoint(run, m, out = false) {
  const p = run.player
  const [x0, y0, x1, y1] = run.view
  const [bx0, by0, bx1, by1] = run.arena.bounds
  for (let tries = 0; tries < 16; tries++) {
    const a = run.rng() * Math.PI * 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    // how far along that direction the view's edge is (less m)
    const tx = dx > 0 ? (x1 - m - p.x) / dx : dx < 0 ? (x0 + m - p.x) / dx : Infinity
    const ty = dy > 0 ? (y1 - m - p.y) / dy : dy < 0 ? (y0 + m - p.y) / dy : Infinity
    let t = Math.min(tx, ty)
    if (out) t += m * 2 + 40 + run.rng() * 80
    const x = p.x + dx * t
    const y = p.y + dy * t
    if (t < 60 || x < bx0 + m || x > bx1 - m || y < by0 + m || y > by1 - m) continue
    return { x, y }
  }
  return null
}

// (balance benches place monsters themselves: scripts/survivor-cats-dps.mjs)
export const spawnAt = (run, type, at) => spawn(run, type, at)

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
    skin: skinOf(run.D, run.region, type), // the region's monster it looks like (null: its own pixel art)
    xp: def.xp * (special ? 1 : phase.xpMultiplier ?? 1), // (the early phases bring more, each worth less)
    state: 'spawn', // spawn | live | die | down | gone
    t: 0,
    hitT: 0,
    face: pt.x < run.player.x ? 1 : -1,
    mode: null,
    modeT: 0,
    dx: 0,
    dy: 0,
    life: 0,
  }
  run.enemies.push(e)
  // (in the invaded chapters, whether it may turn and when: corruption.js)
  if (run.corrupt) markCorruption(run, e)
  return e
}

// the ordinary bosses' types (balance.json → bossTypes) come out of a bag:
// the four in a shuffled order, then a new shuffle. The bag may be the
// page's (opts.bossBag, kept from one run to the next) or the run's own
export function nextBossType(run) {
  const bag = run.bossBag
  if (!bag.order.length) {
    const t = [...run.D.balance.bossTypes.order]
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(run.rng() * (i + 1))
      ;[t[i], t[j]] = [t[j], t[i]]
    }
    bag.order = t
  }
  return bag.order.shift()
}

// an elite or the boss enters from the top, on the side away from Mano. On a
// field larger than the screen (the PC game's) the thief comes from any side
// instead, a little past the view's edge, and may roam the whole field (an
// arrow on the screen's edge shows where it is); the mid-boss and the boss
// keep their entry, so the fight against them is the same as before
function spawnSpecial(run, ev) {
  const [x0, y0, x1] = run.view
  const def = run.D.balance.enemies[ev.enemy]
  const p = run.player
  const pt = (run.arena.view && def.behavior === 'flee' && aroundPoint(run, def.radius, true)) || { x: p.x < (x0 + x1) / 2 ? x1 - def.radius - 20 : x0 + def.radius + 20, y: y0 + def.radius + 6 }
  const e = spawn(run, ev.enemy, pt)
  e.key = ev.key
  run.elites[ev.key] = e
  // an ordinary boss: its one way of fighting, the next from the bag
  if (e.behavior === 'boss') e.btype = nextBossType(run)
  if (ev.key === 'boss') {
    run.boss = e
    run.bossAt = run.t
    // its guard from bossGuard.fromChapter on (full from the start)
    const G = run.D.balance.lateGame.bossGuard
    // and hits harder (body, charge, slam), so those seconds are a fight
    if (run.chapter >= G.fromChapter) Object.assign(e, { guard: true, guardLeft: e.maxHp * G.maxShare * G.burst, guardT: run.t, damage: e.damage * G.hits, damageMul: e.damageMul * G.hits })
  }
  run.events.push({ type: ev.key === 'boss' ? 'boss' : 'elite', key: ev.key, name: monsterName(run.D, run.region, e), flee: def.behavior === 'flee' ? def.staySeconds : 0 })
  // (telemetry: when the boss came, and the kills before it)
  if (ev.key === 'boss') (run.stats.bossAt = run.t), (run.stats.preBossKills = run.kills)
}

function hurtEnemy(run, e, dmg, x, y, crit = false, by = 'ball') {
  if (e.state !== 'live') return
  const raw = dmg
  // (the 최후의 반격 blast breaks through the guard: it has its own cap)
  if (e.guard && by !== 'blast') dmg = guarded(run, e, dmg)
  const eff = Math.max(0, Math.min(dmg, e.hp))
  e.hp -= dmg
  e.hitT = FLASH
  run.stats.hits++
  run.stats.damage += eff
  const S = run.stats.by[by] || (run.stats.by[by] = { raw: 0, eff: 0, over: 0, hits: 0, kills: 0, boss: 0 })
  S.raw += raw
  S.eff += eff
  S.over += raw - eff
  S.hits++
  if (e.behavior === 'boss' || e.behavior === 'extra') S.boss += eff
  if (dmg > 0) run.events.push({ type: 'hit', x, y, n: dmg, crit, by })
  if (e.hp > 0) return
  S.kills++
  e.t = 0
  run.kills++
  const B = run.D.balance
  run.events.push({ type: 'die', x: e.x, y: e.y, kind: e.type })
  run.orbs.push({ kind: 'xp', x: e.x, y: e.y, v: e.xp, pull: false })
  if (e.rank && e.key !== 'extra') {
    // an elite or the boss: its reward is earned now (the page saves it at once)
    run.awards.push(e.key)
    if (e.key !== 'boss') {
      run.eliteKills++
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + B.chapter.eliteHeal)
    }
  }
  if (e.behavior === 'boss' || e.behavior === 'extra') {
    if (e === run.boss) run.stats.bossDownAt = run.t
    // falls (its death plays once) and stops at once: no more attacks, no
    // touch; whatever it had on the ground or in the air goes with it. The
    // boss's fall clears the chapter when that ends (or, where an extra
    // special boss is to come, brings it on); an elite fades away
    e.state = 'down'
    e.mode = null
    e.atk = null
    e.dash = null
    e.under = false
    e.stage = null
    clearOwned(run, e.id)
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
  // (guardShare: its own share, the boss tester's: tester.js)
  const rate = e.maxHp * (e.guardShare ?? G.maxShare)
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
  // the extra special boss: drifts at Mano, then one of its attacks (bosses.js)
  extra(run, e, dt) {
    updateExtra(run, e, dt, { chase: MOVES.chase })
  },
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
  // an ordinary boss (the 145 s mid-boss, the 210 s boss): one of four ways
  // (balance.json → bossTypes), given when it comes and kept until it falls,
  // and between its own moves its skills by turns (balance.json →
  // bossSkills: more of them in later chapters, two at a time once enraged)
  boss(run, e, dt) {
    const def = run.D.balance.enemies[e.type]
    const T = run.D.balance.bossTypes
    const SK = run.D.balance.bossSkills
    const type = e.btype || 'A'
    // enraged under a share of its HP (from its tier on): it says so once
    const R = SK.enrage
    if (!e.enraged && e.hp < e.maxHp * R.below && tierOf(run.chapter) >= (e.type === 'brute' ? R.bruteFromTier : R.fromTier)) {
      e.enraged = true
      run.events.push({ type: 'bossRage', x: e.x, y: e.y })
    }
    const walk = def.walkSeconds * (e.enraged ? R.walk : 1)
    // a skill under way (bosses.js): it runs to its end, then a short rest
    if (e.mode === 'skill') {
      if (!tickAttack(run, e, dt)) (e.mode = 'rest'), (e.modeT = def.restSeconds)
      return
    }
    e.modeT -= dt
    if (!e.mode) (e.mode = 'walk'), (e.modeT = walk)
    if (e.modeT <= 0) {
      const skills = (e.skills ??= bossSkills(run.D, type, e.type, run.chapter))
      if (e.mode === 'walk' && skills.length && (e.turns = (e.turns || 0) + 1) % 2 === 0) {
        // a skill: the next of its list (enraged: that and the one after it)
        const i = (e.skillNo = (e.skillNo ?? -1) + 1) % skills.length
        let spec = bossSkill(run.D, skills[i], run.chapter, def)
        if (e.enraged && skills.length > 1) spec = { type: 'combo', after: [R.after], parts: [spec, bossSkill(run.D, skills[(i + 1) % skills.length], run.chapter, def)] }
        e.mode = 'skill'
        e.modeT = Infinity
        startAttack(run, e, spec)
        return
      }
      if (e.mode === 'walk') {
        if (type === 'A') {
          // A: stops and shows where it will charge
          e.mode = 'windup'
          e.modeT = def.windupSeconds
          ;[e.dx, e.dy] = toward(e, run.player.x, run.player.y)
          e.face = e.dx >= 0 ? 1 : -1
        } else if (type === 'C') {
          // C: stops and shows three lanes at Mano; they are where it shoots
          const C = T.C
          e.mode = 'aim'
          e.modeT = C.aim
          const [ux, uy] = toward(e, run.player.x, run.player.y)
          e.face = ux >= 0 ? 1 : -1
          const a0 = Math.atan2(uy, ux)
          const spread = (C.spread * Math.PI) / 180
          e.lanes = []
          for (let i = 0; i < C.count; i++) {
            const a = a0 + (C.count > 1 ? (i / (C.count - 1) - 0.5) * spread : 0)
            e.lanes.push(addHazard(run, e, { kind: 'ray', x: e.x, y: e.y, dx: Math.cos(a), dy: Math.sin(a), len: C.show, harmless: true, keep: 0.8, speed: C.speed }, C.aim))
          }
        } else if (type === 'D') {
          // D: shakes a moment (a ring round it shows it), then runs
          e.mode = 'rushWind'
          e.modeT = T.D.warn
          ;[e.dx, e.dy] = toward(e, run.player.x, run.player.y)
        } else e.modeT = walk // B only walks
      } else if (e.mode === 'windup') {
        // it charges exactly the path it showed, no further
        e.mode = 'charge'
        e.modeT = Infinity
        e.left = chargePath(run, e).len
      } else if (e.mode === 'aim') {
        const C = T.C
        for (const l of e.lanes) fireShot(run, e, l.dx, l.dy, { speed: C.speed, r: C.r, ttl: C.ttl, look: C.look, damage: def.chargeDamage })
        e.lanes = null
        e.mode = 'rest'
        e.modeT = def.restSeconds
      } else if (e.mode === 'rushWind') {
        e.mode = 'rush'
        e.modeT = T.D.seconds
      } else if (e.mode === 'rush' || e.mode === 'rest') (e.mode = 'walk'), (e.modeT = walk)
    }
    if (e.mode === 'walk') {
      if (type === 'B') {
        // B: at Mano, weaving smoothly left and right of her direction (close
        // by, straight at her)
        const B = T.B
        const [ux, uy] = toward(e, run.player.x, run.player.y)
        const far = Math.min(1, Math.hypot(run.player.x - e.x, run.player.y - e.y) / 60)
        const w = B.weave * far * Math.sin((e.life * Math.PI * 2) / B.period + e.id)
        const c = Math.cos(w)
        const sn = Math.sin(w)
        e.x += (ux * c - uy * sn) * e.speed * dt
        e.y += (uy * c + ux * sn) * e.speed * dt
      } else MOVES.chase(run, e, dt)
    } else if (e.mode === 'charge') {
      if (!(e.left >= 0)) e.left = chargePath(run, e).len
      const d = Math.min(e.left, def.chargeSpeed * dt)
      e.x += e.dx * d
      e.y += e.dy * d
      e.left -= d
      if (e.left <= 1e-9) (e.mode = 'rest'), (e.modeT = def.restSeconds)
    } else if (e.mode === 'rush') {
      // fast, but it turns only so quickly: a step aside is enough
      const R = T.D
      const [ux, uy] = toward(e, run.player.x, run.player.y)
      const cur = Math.atan2(e.dy, e.dx)
      let diff = Math.atan2(uy, ux) - cur
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      const a = cur + Math.max(-R.turn * dt, Math.min(R.turn * dt, diff))
      e.dx = Math.cos(a)
      e.dy = Math.sin(a)
      e.x += e.dx * e.speed * R.mul * dt
      e.y += e.dy * e.speed * R.mul * dt
    }
  },
}

// the charge path while it winds up: exactly where the charge will go (a band
// as wide as its body), cut short by the field's walls like the charge itself
export function chargePath(run, e) {
  const def = run.D.balance.enemies[e.type]
  const [x0, y0, x1, y1] = monsterBox(run)
  let len = def.chargeSpeed * def.chargeSeconds
  if (e.dx > 0) len = Math.min(len, (x1 - e.r - e.x) / e.dx)
  if (e.dx < 0) len = Math.min(len, (x0 + e.r - e.x) / e.dx)
  if (e.dy > 0) len = Math.min(len, (y1 - e.r - e.y) / e.dy)
  if (e.dy < 0) len = Math.min(len, (y0 + e.r - e.y) / e.dy)
  len = Math.max(0, len)
  return { x: e.x, y: e.y, dx: e.dx, dy: e.dy, len, half: e.r }
}

// where monsters may be: the whole field (on the phone that is the view); the
// extra special boss's fight, its area
const monsterBox = (run) => (run.extra && run.extra.box) || run.arena.bounds

function moveEnemies(run, dt) {
  const p = run.player
  const box = monsterBox(run)
  const rush = mobSpeed(run) // the boss has lived long: the ordinary ones run faster
  for (const e of run.enemies) {
    e.t += dt
    if (e.hitT > 0) e.hitT -= dt
    if (e.state === 'spawn') {
      if (e.t >= TELEGRAPH) (e.state = 'live'), (e.t = 0)
      continue
    }
    // a fallen elite (not the boss: its fall ends the chapter) fades away
    // once its death has played; nothing stays lying on the field
    if (e.state === 'down' && e !== run.boss && e.behavior !== 'extra' && e.t >= run.D.balance.enemies[e.type].downSeconds) (e.state = 'gone'), (e.t = 0)
    if (e.state !== 'live') continue
    // a blessing's hold: frozen stands still, slowed moves (and counts) slower
    let k = 1
    if (e.freezeT > 0) (e.freezeT -= dt), (k = 0)
    if (e.slowT > 0) (e.slowT -= dt), (k *= e.slowMul)
    if (k === 0) continue
    e.life += dt * k
    // (invaded chapters: its clock to turning; a turned one charging its
    // dark orb stands there, or circles Mano, facing her: corruption.js)
    if (e.cAt !== undefined && corruptTick(run, e, dt * k)) {
      e.pace = (e.pace || 0) * 0.8
      e.face = p.x > e.x ? 1 : -1
      continue
    }
    const ox = e.x
    const oy = e.y
    MOVES[e.behavior](run, e, dt * k * (e.rank ? 1 : rush))
    if (e.state !== 'live') continue
    // how fast it really goes (for its steps: a monster that stands still
    // does not walk), smoothed
    const v = Math.hypot(e.x - ox, e.y - oy) / dt
    e.pace = (e.pace || 0) * 0.8 + v * 0.2
    if (e.behavior === 'boss' && (e.mode === 'windup' || e.mode === 'aim' || e.mode === 'rushWind' || e.mode === 'skill')) continue
    if (e.behavior === 'extra' && e.atk) continue // its attack faced it
    // left or right: by where it is going, with a margin, so small sways and
    // pushes never flip it back and forth; standing, it looks at Mano
    e.vxs = (e.vxs || 0) * 0.8 + ((e.x - ox) / dt) * 0.2
    if (e.vxs * e.face < -FLIP_PACE) e.face = -e.face
    else if (Math.abs(e.vxs) < 2 && Math.abs(p.x - e.x) > 12 && e.behavior !== 'line') e.face = p.x > e.x ? 1 : -1
  }
  // a gentle push apart so they do not stack into one blob (the big ones are
  // too heavy to be pushed)
  // (a boss under the sand is out of reach: no ball, no touch)
  run.grid.rebuild(run.enemies.filter((e) => e.state === 'live' && !e.under))
  for (const e of run.enemies) {
    if (e.state !== 'live') continue
    if (e.behavior !== 'boss' && e.behavior !== 'extra') {
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
        const push = (min - d) * (o.behavior === 'boss' || o.behavior === 'extra' ? 1 : 0.5)
        px += (dx / d) * push
        py += (dy / d) * push
      })
      const lim = 30 * dt
      e.x += Math.max(-lim, Math.min(lim, px))
      e.y += Math.max(-lim, Math.min(lim, py))
    }
    // monsters keep to the field, not the view: on the PC one the camera
    // follows Mano and those she leaves behind stay put, out of sight
    const [lx0, ly0, lx1, ly1] = box
    const cx = Math.max(lx0 + e.r, Math.min(lx1 - e.r, e.x))
    const cy = Math.max(ly0 + e.r, Math.min(ly1 - e.r, e.y))
    // a straight runner that meets a wall ends its line there
    if ((cx !== e.x || cy !== e.y) && e.behavior === 'line' && e.mode === 'run') e.modeT = 0
    e.x = cx
    e.y = cy
  }
  run.grid.rebuild(run.enemies.filter((e) => e.state === 'live' && !e.under))
}

// ── Mano ────────────────────────────────────────────────────────────────────

function movePlayer(run, dt, input) {
  const p = run.player
  // (the extra special boss's fight is in the area on screen when it began)
  const [x0, y0, x1, y1] = (run.extra && run.extra.box) || run.arena.bounds
  let ix = input ? input.x : 0
  let iy = input ? input.y : 0
  const m = Math.hypot(ix, iy)
  // any angle; never faster on a diagonal; no sliding: she stops when the
  // stick is let go
  if (m > 1) (ix /= m), (iy /= m)
  // (on frost she is a little slower; a gust carries her a short way)
  const sp = p.speed * (p.slow || 1)
  p.vx = ix * sp + (p.push ? p.push.vx : 0)
  p.vy = iy * sp + (p.push ? p.push.vy : 0)
  p.moving = m > 0.001
  p.x = Math.max(x0 + p.hitR, Math.min(x1 - p.hitR, p.x + p.vx * dt))
  p.y = Math.max(y0 + p.hitR, Math.min(y1 - p.hitR, p.y + p.vy * dt))
  // regen: a share of the maximum HP each second, so it keeps its worth at any HP
  if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * p.maxHp * dt)
  if (p.inv > 0) p.inv -= dt
  if (p.hitT > 0) p.hitT -= dt
}

// what touching this enemy costs right now (a charging boss hits harder)
// (a frozen one cannot hurt)
const touchDamage = (run, e) =>
  e.freezeT > 0 || e.under
    ? 0
    : e.dash
      ? e.dash.damage
      : e.behavior === 'boss' && e.mode === 'charge'
        ? run.D.balance.enemies[e.type].chargeDamage * e.damageMul
        : e.blowCap
          ? Math.min(e.damage, e.blowCap * run.player.maxHp) // (the extra special boss's body too)
          : e.damage

// boss overtime hits harder and harder: a run that can no longer win ends
export const overtimeHit = (run) => {
  const o = run.D.balance.chapter.overtime
  return overtime(run) ? o.hitsHarder ** (Math.floor((run.t - o.after) / o.every) + 1) : 1
}

function hurtPlayer(run, dmg, from = 'touch') {
  const p = run.player
  // nothing hurts while the extra special boss is on its way
  if (run.extra && run.extra.phase !== 'fight') return
  const n = dmg * p.armor * overtimeHit(run)
  p.hp = Math.max(0, p.hp - n)
  p.inv = run.D.balance.player.contactInvulnerability
  p.hitT = HIT_ANIM
  run.stats.hurt += n
  run.events.push({ type: 'hurt', x: p.x, y: p.y, n, from })
  // 최후의 반격 (zyo.js): once a run she gets up instead
  if (p.hp <= 0 && revive(run)) return
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
  // (in the extra special boss's fight, how much of it was left)
  const b = run.extra && run.extra.boss ? run.extra.boss : run.boss
  return {
    cleared,
    time: run.t,
    kills: run.kills,
    coins: Math.floor(run.coins),
    level: run.level,
    elites: run.eliteKills,
    bossLeft: b ? Math.max(0, b.hp) / b.maxHp : null,
    extra: run.extra ? run.extra.id : null,
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
  const keep = []
  for (const o of run.orbs) {
    if (o.done) continue // picked up by a cat this step
    if (o.pop > 0) {
      // a 퍼센트 하트 still jumping out of a cat: not there to pick up yet
      o.pop -= dt
      keep.push(o)
      continue
    }
    // (what lies on the field stays there until Mano's magnet, pickupR, or a
    // cat reaches it: nothing flies to her by itself after a while)
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
  const [x0, y0, x1, y1] = run.arena.bounds
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
  const [x0, y0, x1, y1] = run.arena.bounds
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
    case 'catSummon':
    case 'catSize':
    case 'catSpeed':
    case 'catRate':
    case 'catClaw':
      return catPreview(run, id)
    case 'power':
      return run.cls ? powerPreview(run) : {}
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
export function drawChoices(run, not = []) {
  // a card with levels (냥냥 연금술) leaves the pool at its last level; the
  // cat cards other than 친구냥이 wait for a cat
  // (and zyo_'s class card, once a recipe is complete: zyo.js)
  let left = [...run.pool, ...zyoPool(run)].filter((id) => !maxed(run, id) && catCardOpen(run, id))
  // a redraw: other cards than those shown, while there are enough
  const others = left.filter((id) => !not.includes(id))
  if (not.length && others.length >= 3) left = others
  const out = []
  while (out.length < 3 && left.length) out.push(left.splice(Math.floor(run.rng() * left.length), 1)[0])
  return out
}

const levelsOf = (run, id) => (run.D.balance.upgrades.effects[id] || {}).levels
export const maxed = (run, id) => !!levelsOf(run, id) && (run.picks[id] || 0) >= levelsOf(run, id).length

function openChoice(run, not) {
  run.state = 'levelup'
  run.choices = drawChoices(run, not)
  run.choiceSeq++
  // a recipe just complete: its class card is among them this once, in the
  // place of a card that is not one
  for (const id of zyoSure(run)) {
    run.sure.push(id)
    if (run.choices.includes(id)) continue
    const free = run.choices.map((c, i) => (isClassCard(c) ? -1 : i)).filter((i) => i >= 0)
    if (free.length) run.choices[free[Math.floor(run.rng() * free.length)]] = id
    else run.choices.push(id)
  }
  // zyo_'s own card beside them, some of the time (zyo.js)
  run.choices.push(...zyoCards(run, run.choices, (id) => catCardOpen(run, id)))
  // she marks hers among them, if any came
  const marked = zyoMarks(run)
  run.zyoPick = marked.length ? { ids: marked, seq: run.choiceSeq } : null
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
  if (ch.cat) run.cat = ch.cat
  if (ch.cls) Object.assign(run.cls, { dmg: ch.cls.dmg, rate: ch.cls.rate })
}

// What choosing `id` n times in a row would make (pure: works on a copy).
// For the cards: n = 1, or Tizzzz's times for the card she rewrote.
export function previewTimes(run, id, n) {
  const tmp = { D: run.D, weapon: { ...run.weapon }, player: { ...run.player }, nyang: run.nyang, cat: { ...run.cat }, cls: run.cls && { ...run.cls }, picks: { ...run.picks }, level: run.level }
  // (each time counts as a pick, as in choose: a card that grows with its
  // picks grows between the times)
  for (let i = 0; i < n; i++) applyChange(tmp, applyPreview(tmp, id)), (tmp.picks[id] = (tmp.picks[id] || 0) + 1)
  const w = tmp.weapon
  const p = tmp.player
  return { ...w, ballSpeed: w.speed, maxHp: p.maxHp, hp: p.hp, speed: p.speed, pickupR: p.pickupR, coinMul: p.coinMul, regen: p.regen, armor: p.armor, xpMul: p.xpMul, nyang: tmp.nyang, cat: tmp.cat, cls: tmp.cls }
}

// Tizzzz's rewrite: the card can take her `times` (a card with levels needs
// that many levels left)
export function canEdit(run, id) {
  if (isClassCard(id)) return false
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
  if (isClassCard(id)) {
    // zyo_'s class change: once a run, the other recipes gone with it
    if (!run.cls) startClass(run, classOf(id))
    run.picks[id] = 1
    run.log.push(id)
  } else for (let i = 0; i < times; i++) {
    // (what it changes is kept, so a turret can take it back: turret.js)
    const before = snap(run)
    applyChange(run, applyPreview(run, id))
    recordPick(run, id, before)
    run.picks[id] = (run.picks[id] || 0) + 1
    run.log.push(id)
  }
  if (times > 1) run.stats.edited = (run.stats.edited || 0) + 1
  if (id === 'power' && run.cls) run.events.push({ type: 'powerUp', level: run.picks.power, x: run.player.x, y: run.player.y })
  syncFriends(run)
  run.pending--
  if (run.pending > 0) openChoice(run)
  else {
    run.state = 'play'
    run.choices = null
    run.choiceSeq++
  }
  return true
}

// Turrets made at a level-up (turret.js): `ids`, picks of this run's
// upgrades, `cost` a turret (one card twice, or two cards; several turrets'
// worth at once), are taken back and that many turrets stand on the field.
// The level-up is not spent: its cards stay to be chosen (a class card whose
// recipe is short now is drawn again). `seq` must be the one shown with the
// cards. Returns the turrets, or null (nothing is taken).
export function makeTurret(run, ids, seq) {
  if (run.state !== 'levelup' || seq !== run.choiceSeq || !run.turretOn || !fits(run, ids)) return null
  for (const id of ids) takeBack(run, id)
  const made = []
  for (let i = 0; i < ids.length / run.D.balance.turret.cost; i++) made.push(placeTurret(run))
  run.stats.turrets = (run.stats.turrets || 0) + made.length
  const ready = new Set(zyoPool(run))
  run.choices = run.choices.map((id) => (isClassCard(id) && !run.cls && !ready.has(id) ? drawChoices(run, run.choices)[0] || id : id))
  const marked = zyoMarks(run)
  run.zyoPick = marked.length ? { ids: marked, seq: run.choiceSeq } : null
  return made
}

// A redraw (the rerolls of chapter 5's reward): the cards on show are put
// back and three others drawn the same way (other than those, while the pool
// has enough). `seq` must be the one shown with the cards. Returns true once.
export function reroll(run, seq) {
  if (run.state !== 'levelup' || seq !== run.choiceSeq || !run.choices || run.rerolls <= 0) return false
  run.rerolls--
  run.stats.rerolls = (run.stats.rerolls || 0) + 1
  openChoice(run, run.choices)
  return true
}

// ── the chapter's clock ─────────────────────────────────────────────────────

function advanceClock(run) {
  const C = run.D.balance.chapter
  while (run.nextEvent < C.events.length && run.t >= C.events[run.nextEvent].at) spawnSpecial(run, C.events[run.nextEvent++])
  // cleared when the boss has fallen and lain down for a moment; where the
  // chapter has an extra special boss, that comes then, and the chapter is
  // cleared when it falls in its turn
  const b = run.boss
  if (!run.extra && b && b.state === 'down' && b.t >= run.D.balance.enemies[b.type].downSeconds) {
    run.bossDown = true
    if (extraOf(run.D, run.chapter)) startExtra(run)
    else {
      run.state = 'over'
      run.result = summary(run, true)
    }
  }
  if (run.extra) extraClock(run)
}

// ── the extra special boss ──────────────────────────────────────────────────
// Its turn: the field is cleared (the monsters fade away, every attack on the
// ground or in the air goes), a moment of quiet, WARNING! with its name and
// line (the page sounds the siren), then it comes in where Mano is not; only
// then the fight. Until then nothing can hurt Mano, and it cannot be hit
// before it stands. It comes once a run, every run (a cleared chapter too).
// The fight is in the play area as it is now (on the PC the camera holds).
function startExtra(run) {
  const id = extraOf(run.D, run.chapter)
  const S = extraSpec(run.D, id)
  run.extra = { id, phase: 'calm', t: 0, box: run.view.slice(), boss: null, final: !!S.final }
  // (the turrets outside its fight area are put inside it)
  relocateTurrets(run)
  // (the fallen boss has lain its time: it fades with the rest)
  for (const e of run.enemies) if (e.state !== 'gone') (e.state = 'gone'), (e.t = 0)
  run.hazards = []
  run.shots = []
  run.floors = []
  run.player.push = null
  run.events.push({ type: 'extraCalm', id, final: run.extra.final })
}

function extraClock(run) {
  const X = run.extra
  if (X.phase === 'done') return
  const S = extraSpec(run.D, X.id)
  const I = S.intro
  X.t = run.t - (X.t0 ??= run.t)
  if (X.phase === 'calm' && X.t >= I.calm) {
    X.phase = 'warn'
    run.events.push({ type: 'extraWarn', id: X.id, name: run.D.motion.characters[X.id].name, line: S.line, final: X.final })
  }
  if (X.phase === 'warn' && X.t >= I.calm + I.warn) {
    X.phase = 'appear'
    X.boss = spawnExtra(run, S, I.appear)
    run.events.push({ type: 'extraAppear', id: X.id, x: X.boss.x, y: X.boss.y, final: X.final })
  }
  if (X.phase === 'appear' && X.t >= I.calm + I.warn + I.appear) {
    X.phase = 'fight'
    run.player.inv = Math.max(run.player.inv, 0.5) // a moment to start moving
  }
  const e = X.boss
  if (X.phase === 'fight' && e && e.state === 'down' && e.t >= S.downSeconds) {
    X.phase = 'done'
    run.state = 'over'
    run.result = summary(run, true)
  }
}

// it comes in at the place of its area furthest from Mano (never on her)
function spawnExtra(run, S, appear) {
  const B = run.extra.box
  const p = run.player
  const W = B[2] - B[0]
  const H = B[3] - B[1]
  let best = null
  for (const [fx, fy] of [[0.28, 0.3], [0.72, 0.3], [0.28, 0.7], [0.72, 0.7], [0.5, 0.25], [0.5, 0.75]]) {
    const x = B[0] + W * fx
    const y = B[1] + H * fy
    const d = Math.hypot(x - p.x, y - p.y)
    if (!best || d > best.d) best = { x, y, d }
  }
  const base = run.boss // the chapter boss: its strength is the measure
  const e = spawn(run, 'boss', { x: best.x, y: best.y })
  const hp = base.maxHp * S.hpMul
  Object.assign(e, {
    behavior: 'extra',
    extra: run.extra.id,
    key: 'extra',
    skin: run.extra.id,
    look: S.look,
    r: S.radius,
    hp,
    maxHp: hp,
    speed: run.D.balance.extraBosses.speed,
    damage: base.damage,
    damageMul: base.damageMul,
    final: !!S.final,
    blowCap: S.blowCap,
    size: S.size,
    downSeconds: S.downSeconds,
    t: TELEGRAPH - appear, // its entry lasts `appear` s (no ball, no touch until it stands)
    enter: appear,
  })
  // from the boss guard's chapter on it has the guard too: never easier than
  // the boss it follows
  const G = run.D.balance.lateGame.bossGuard
  if (run.chapter >= G.fromChapter) Object.assign(e, { guard: true, guardLeft: hp * G.maxShare * G.burst, guardT: run.t })
  e.face = p.x > e.x ? 1 : -1
  run.elites.extra = e
  return e
}

function spawning(run, dt) {
  // the extra special boss is fought alone
  if (run.extra) return
  const B = run.D.balance
  const iv = spawnInterval(run)
  const alive = run.enemies.reduce((n, e) => n + (e.state === 'live' || e.state === 'spawn'), 0)
  run.spawnT += dt
  run.refillT = (run.refillT || 0) + dt
  if (alive >= B.performance.enemySoftLimit) {
    // full: wait, and do not save up spawns to pour out later
    run.spawnT = Math.min(run.spawnT, iv)
    return
  }
  if (run.spawnT >= iv) {
    // one pack per tick at most; a long frame never spawns a crowd at once
    if (spawnPack(run, B.performance.enemySoftLimit - alive)) run.spawnT -= iv
    run.spawnT = Math.min(run.spawnT, iv)
    return
  }
  // fewer than the phase's least around Mano (killed faster than they
  // come): another pack now, one every refillEvery s at most — the faster
  // she kills, the more come (and the more experience and coins). Spawning
  // held (spawnT below 0) holds this too
  const least = minAlive(run)
  if (least && run.spawnT >= 0 && run.refillT >= B.chapter.refillEvery && aliveNear(run) < least) {
    if (spawnPack(run, B.performance.enemySoftLimit - alive)) run.refillT = 0
  }
}

// the phase's least monsters around Mano (balance.json → chapter.phases →
// minAlive), × the chapter's spawn factor
export const minAlive = (run) => Math.round((phaseAt(run).minAlive || 0) * run.factor.spawn)

// the ordinary monsters standing around Mano: the whole field on the phone;
// on the PC (whose field is larger than its screen, and whose monsters stay
// where she left them) those in the box they come in on around her
export function aliveNear(run) {
  const box = run.arena.spawnBox
  const p = run.player
  let n = 0
  for (const e of run.enemies) {
    if (e.rank || (e.state !== 'live' && e.state !== 'spawn')) continue
    if (box && (Math.abs(e.x - p.x) > box[0] / 2 || Math.abs(e.y - p.y) > box[1] / 2)) continue
    n++
  }
  return n
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
  const [x0, y0, x1, y1] = run.view
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
  refillBlessings(run, dt)
  movePlayer(run, dt, input)
  follow(run)
  spawning(run, dt)
  moveEnemies(run, dt)
  updateHazards(run, dt, hurtPlayer)
  if (run.state !== 'play') return
  // after zyo_'s class change its attack is the only one (zyo.js)
  if (run.cls) updateClass(run, dt)
  else {
    run.behaviour.update(run, dt)
    updateFriends(run, dt)
  }
  updateTurrets(run, dt)
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
  // the fight is over: the friend cats leave with it
  if (run.state === 'over' && run.friends.length) run.friends = []
  return run.state
}

// summary of what was chosen this run, for the result screen
export function buildSummary(run) {
  const O = run.D.upgrades.options
  return Object.entries(run.picks)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, name: optionName(run, id), icon: O[id] ? O[id].icon : null, n }))
}
