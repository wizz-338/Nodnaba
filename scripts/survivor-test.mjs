// MANO SURVIVOR rule and save tests (no browser; storage is an in-memory stand-in).
//   node scripts/survivor-test.mjs
import { D } from './survivor-data.mjs'
import { createRun, step, choose, reroll, makeTurret, spawnAt, drawChoices, chapterCoins, maxed, lateGame, previewTimes, canEdit, isEdited, applyPreview, nextNeed, chargePath, overtime, overtimeHit, mobSpeed, spawnInterval, gradeMul, regionOf, enemyName, lastChapter, FIXED } from '../src/survivor/game.js'
import { BEHAVIORS, ballTtl, fanAngles, volley, critCount, implemented } from '../src/survivor/weapons.js'
import { createProgress, canFuse, fuseAllPreview, parseBackup, exportName, BEFORE_IMPORT_KEY, BEFORE_RESET_KEY, rollGrade, statPrice, statValue, statMaxLevel, KEY, SCHEMA } from '../src/survivor/progress.js'
import { playRun, pick } from './survivor-bot.mjs'
import { MOVE_KEYS, keyVector } from '../src/survivor/keys.js'
import { extraOf, touchesAt, inGap, reachesAt, bossSkills, bossSkill, tierOf, startAttack, tickAttack } from '../src/survivor/bosses.js'
import { catDamage, catInterval, catSpeed, catSwipe, packMul } from '../src/survivor/friends.js'
import { growth, classLevel, zyoMarks, zyoTargets, firepower, recipes } from '../src/survivor/zyo.js'
import { materials, materialCount, canMake, turretHit, turretBase, relocateTurrets, sunk } from '../src/survivor/turret.js'
import { migrateStory } from '../src/survivor/progress.js'
import { roomTotal, roomStage, roomProgress } from '../src/survivor/room-items.js'
import { corruptionOf } from '../src/survivor/corruption.js'
import { testerStorage, testerSave, setupTest, testTick, testPhase, skipPhase, TEST_PERMA, TEST_LEVEL, TEST_POWER } from '../src/survivor/tester.js'

let fails = 0
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) fails++
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e
const fmt2 = (v) => Math.round(v * 1e4) / 1e4
class Mem {
  constructor() { this.m = new Map() }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null }
  setItem(k, v) { this.m.set(k, String(v)) }
  removeItem(k) { this.m.delete(k) }
}
const B = D.balance
const BASE = D.weapons.registry[0].base
const newRun = (o = {}) => createRun(D, { chapter: 1, weaponId: 'bouncy_ball', grade: 'D', seed: 11, ...o })
const enemy = (run, x, y, hp = 1e9, r = 11) => {
  const e = { id: run.nextId++, type: 'imp', behavior: 'chase', x, y, r, hp, maxHp: hp, speed: 0, damage: 9, xp: 3, state: 'live', t: 0, hitT: 0, face: 1, mode: null, modeT: 0, dx: 0, dy: 0, life: 0 }
  run.enemies.push(e)
  run.grid.rebuild(run.enemies.filter((o) => o.state === 'live'))
  return e
}
const ball = (run, x, y, vx, vy, extra = {}) => {
  const b = { id: run.nextId++, x, y, vx, vy, r: 3.5, damage: 14, bounces: 2, ttl: 3, gen: 0, hitAny: false, locks: [], trail: [], age: 0, ...extra }
  run.balls.push(b)
  return b
}
const upd = (run, dt) => {
  run.t += dt
  run.fireT = 99
  BEHAVIORS.bounce_projectile.update(run, dt)
}
// choose an upgrade as if it had been one of the three cards shown
const pickIn = (run, id) => {
  run.state = 'levelup'
  run.pending = 1
  run.choices = [id, ...run.pool.filter((x) => x !== id).slice(0, 2)]
  run.choiceSeq++
  return choose(run, id, run.choiceSeq)
}
const still = { x: 0, y: 0 }

// ── movement ────────────────────────────────────────────────────────────────
{
  const run = newRun()
  run.spawnT = -1e9
  const p = run.player
  const x0 = p.x
  step(run, 0.5, { x: 1, y: 0 })
  const dx = p.x - x0
  const r2 = newRun()
  r2.spawnT = -1e9
  const a = r2.player.x, b = r2.player.y
  step(r2, 0.5, { x: 0.7071, y: 0.7071 })
  ok(near(Math.hypot(r2.player.x - a, r2.player.y - b), dx, 0.01), `a diagonal is as fast as a straight line (${dx.toFixed(2)} px in 0.5 s)`)
  const r3 = newRun()
  r3.spawnT = -1e9
  const c = [r3.player.x, r3.player.y]
  step(r3, 0.5, { x: Math.cos(0.3), y: Math.sin(0.3) })
  ok(near(Math.atan2(r3.player.y - c[1], r3.player.x - c[0]), 0.3, 1e-3), 'movement follows any angle (17°), not 8 fixed directions')
  const x1 = r3.player.x
  step(r3, 0.2, still)
  ok(r3.player.x === x1 && !r3.player.moving, 'let go of the stick: Mano stops on the spot (no sliding)')
}

// ── the bouncy ball ─────────────────────────────────────────────────────────
{
  const run = newRun()
  const [x0] = B.logicalArena.bounds
  const b = ball(run, x0 + 20, 300, -260, 0, { bounces: 1 })
  for (let i = 0; i < 12; i++) upd(run, FIXED)
  ok(b.vx > 0 && b.bounces === 0 && run.balls.includes(b), 'a wall reflects the ball (by its real velocity) and spends one bounce')
  const r2 = newRun()
  const b2 = ball(r2, x0 + 20, 300, -260, 0, { bounces: 0 })
  for (let i = 0; i < 12; i++) upd(r2, FIXED)
  ok(!r2.balls.includes(b2), 'with no bounces left the next collision removes the ball')
}
{
  const run = newRun()
  const e = enemy(run, 200, 300)
  const b = ball(run, 170, 300, 260, 0)
  for (let i = 0; i < 10; i++) upd(run, FIXED)
  ok(run.stats.hits === 1 && e.hp < 1e9 && b.vx < 0 && Math.hypot(b.x - e.x, b.y - e.y) >= e.r + b.r, 'an enemy hit: damage, the ball reflects on the contact normal and leaves the enemy')
  const r2 = newRun()
  enemy(r2, 200, 300, 1e9, 6)
  ball(r2, 100, 300, 3000, 0, { r: 2 })
  r2.t += 0.1
  r2.fireT = 99
  BEHAVIORS.bounce_projectile.update(r2, 0.1)
  ok(r2.stats.hits === 1, 'a ball moving 300 px in one step still hits a small enemy (no tunnelling)')
  const r3 = newRun()
  enemy(r3, 200, 300, 1e9, 14)
  ball(r3, 180, 300, 260, 0, { bounces: 10 })
  ball(r3, 220, 300, -260, 0, { bounces: 10 })
  for (let i = 0; i < 4; i++) upd(r3, FIXED)
  ok(r3.stats.hits === 2 && r3.balls.every((x) => x.locks.length === 1), 'the same ball cannot hit the same enemy again for 0.18 s')
}
{
  ok(near(ballTtl(BASE), BASE.ttl) && near(ballTtl({ ...BASE, bounces: 1024 }), BASE.ttlMax), `ball life ${BASE.ttl} s, longer with more bounces, ${BASE.ttlMax} s at most`)
  const f = fanAngles(4)
  ok(near(f[3] - f[0], (33 * Math.PI) / 180), 'four balls fan out 11° apart (33°)')
  const g = fanAngles(64)
  ok(near(g[63] - g[0], 2 * Math.PI * (1 - 1 / 64)) && new Set(g.map((a) => a.toFixed(6))).size === 64, '64 balls spread all the way round, each its own direction')
}

// ── the core four: real multiplication, no cap ──────────────────────────────
{
  const run = newRun()
  const w = run.weapon
  const counts = [w.count]
  for (let i = 0; i < 5; i++) counts.push((pickIn(run, 'count'), w.count))
  ok(counts.join() === '1,2,4,8,16,32', `balls per volley: ${counts.join(' → ')}`)
  const iv = [w.interval]
  for (let i = 0; i < 4; i++) iv.push((pickIn(run, 'interval'), w.interval))
  ok(near(w.interval, 0.2401, 1e-12), `gap between volleys: ${iv.map((x) => +x.toFixed(4)).join(' → ')} s`)
  const d0 = w.damage
  pickIn(run, 'damage'); pickIn(run, 'damage'); pickIn(run, 'damage')
  ok(near(w.damage, d0 * 1.5 ** 3), `damage three times: ${d0} × 1.5³ = ${w.damage}`)
  const bs = [w.bounces]
  for (let i = 0; i < 4; i++) bs.push((pickIn(run, 'bounce'), w.bounces))
  ok(bs.join() === '1,2,4,8,16', `bounce limit: ${bs.join(' → ')}`)
  for (let i = 0; i < 5; i++) pickIn(run, 'count')
  for (let i = 0; i < 36; i++) pickIn(run, 'interval')
  ok(w.count === 1024 && near(w.interval, 0.7 ** 40), `no cap: 1024 balls a volley, a volley every ${w.interval.toExponential(2)} s`)
  const seen = new Set()
  for (let i = 0; i < 400; i++) for (const id of drawChoices(run)) seen.add(id)
  ok(seen.size === 15, `after all that every one of the 15 cards still comes up (${seen.size})`)
  // the log formula of the plan
  const n = { count: 10, interval: 40, damage: 3, bounce: 4 }
  ok(w.count === BASE.count * 2 ** n.count && near(w.interval, BASE.interval * 0.7 ** n.interval) && near(w.damage, BASE.damage * 1.5 ** n.damage) && w.bounces === BASE.bounces * 2 ** n.bounce, 'every value = base × factor ^ times chosen')
  const r2 = newRun()
  const pv = applyPreview(r2, 'count')
  pickIn(r2, 'count')
  ok(pv.count === r2.weapon.count, 'the card shows the same number the game then uses')
}
{
  // a gap shorter than one game step: every due volley fires, none is lost
  const run = newRun()
  run.weapon.interval = 0.001
  run.weapon.count = 3
  enemy(run, run.player.x + 150, run.player.y)
  run.fireT = 0
  for (let i = 0; i < 60; i++) {
    run.t += FIXED
    BEHAVIORS.bounce_projectile.update(run, FIXED)
  }
  ok(Math.abs(run.stats.volleys - 1000) <= 1 && run.stats.shots === run.stats.volleys * 3, `one second at a 0.001 s gap: ${run.stats.volleys} volleys, ${run.stats.shots} balls (count × volleys)`)
  ok(JSON.stringify(volley(4, 0, 480)) === JSON.stringify({ n: 4, mult: 1 }), 'under the budget every ball flies')
  const v = volley(64, 470, 480)
  ok(v.n === 10 && near(v.n * v.mult, 64), 'near the budget: 10 balls fly, each carrying 6.4 balls of damage (64 in all)')
  const r2 = newRun()
  r2.weapon.count = 1024
  enemy(r2, r2.player.x + 120, r2.player.y)
  r2.fireT = 0
  BEHAVIORS.bounce_projectile.update(r2, FIXED)
  const sum = r2.balls.reduce((a, b) => a + b.damage, 0)
  ok(r2.balls.length === B.performance.ballBudget && near(sum, 1024 * r2.weapon.damage, 1e-6 * sum) && r2.balls.every((b) => b.heavy), `a volley of 1024: ${r2.balls.length} balls on screen (golden), total damage still 1024 × ${r2.weapon.damage}`)
}
{
  ok(critCount(0, 0.5) === 0 && critCount(0.3, 0.2) === 1 && critCount(0.3, 0.4) === 0 && critCount(1.25, 0.9) === 1 && critCount(1.25, 0.1) === 2, 'crit chance 30% → sometimes; 125% → always, sometimes double')
  const run = newRun()
  run.weapon.critChance = 1
  enemy(run, 200, 300)
  ball(run, 180, 300, 260, 0, { bounces: 0 })
  upd(run, FIXED); upd(run, FIXED)
  ok(near(run.stats.damage, 14 * B.player.critMultiplier) && run.stats.crits === 1, `a crit hits for ×${B.player.critMultiplier}`)
}

// ── splitting ───────────────────────────────────────────────────────────────
{
  const expect = { 0: 0, 0.25: 0.5, 1: 2, 1.25: 2.5, 2: 4 }
  for (const p of [0, 0.25, 1, 1.25, 2]) {
    let kids = 0
    let regrand = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      const run = newRun({ seed: 100 + i })
      run.weapon.splitChance = p
      enemy(run, 200, 300)
      ball(run, 180, 300, 260, 0, { bounces: 0 })
      upd(run, FIXED)
      upd(run, FIXED)
      kids += run.stats.children
      regrand += run.balls.filter((b) => b.gen > 0 && b.gen < run.weapon.split.generations).length
    }
    ok(near(kids / N, expect[p], 0.12) && regrand === 0, `split chance ${p}: ${(kids / N).toFixed(2)} children per first hit (expected ${expect[p]})`)
  }
  const r2 = newRun({ seed: 3 })
  r2.weapon.splitChance = 2
  ball(r2, B.logicalArena.bounds[0] + 10, 300, -260, 0)
  for (let i = 0; i < 10; i++) upd(r2, FIXED)
  ok(r2.stats.children === 0, 'hitting a wall never splits')
}

// ── the card draw: 16 cards, same chance, three different each time ─────────
{
  const run = newRun({ seed: 5 })
  ok(run.pool.length === 15 && new Set(run.pool).size === 15 && !run.pool.includes('split') && run.pool.slice(0, 4).join() === D.weapons.registry[0].core.join(), `15 cards: the weapon's core four (${run.pool.slice(0, 4).join(', ')}) and 11 general ones (쪼개지는 행운 taken out)`)
  const N = 60000
  const seen = Object.fromEntries(run.pool.map((id) => [id, 0]))
  let distinct = true
  let back = 0
  let last = null
  for (let i = 0; i < N; i++) {
    const c = drawChoices(run)
    if (new Set(c).size !== 3) distinct = false
    for (const id of c) seen[id]++
    if (last && c.includes(last)) back++
    last = c[0]
  }
  const exp = (N * 3) / 15
  const worst = Math.max(...Object.values(seen).map((n) => Math.abs(n / exp - 1)))
  ok(distinct, 'every level offers three different cards')
  ok(worst < 0.03, `each card comes up 3/15 of the time (largest gap from that: ${(worst * 100).toFixed(1)}%)`)
  ok(back / N > 0.15, `a card taken last level shows up again (${((back / N) * 100).toFixed(1)}% of levels, 3/16 = 18.75%)`)
  // the same seed gives the same cards
  const a = newRun({ seed: 42 })
  const b = newRun({ seed: 42 })
  ok(JSON.stringify(Array.from({ length: 18 }, () => drawChoices(a))) === JSON.stringify(Array.from({ length: 18 }, () => drawChoices(b))), 'a fixed seed gives the same 18 sets of cards')
}

// ── XP and level-ups; coins are not XP ──────────────────────────────────────
{
  const run = newRun()
  run.spawnT = -1e9
  const n0 = B.xp.startThreshold
  const n1 = nextNeed(D, n0)
  ok(run.need === n0 && n1 === Math.round(n0 * B.xp.growth + B.xp.add), `XP needed: ${n0} → ${n1} → ${nextNeed(D, n1)}`)
  run.orbs.push({ kind: 'xp', x: run.player.x, y: run.player.y, v: n0 + n1 + 1, pull: false })
  step(run, FIXED * 2, still)
  ok(run.state === 'levelup' && run.pending === 2 && run.xp === 1 && run.level === 3 && run.coins === 0, `${n0 + n1 + 1} XP: two level-ups queued, 1 XP carried over, no coins`)
  const t0 = run.t
  const e = enemy(run, run.player.x + 40, run.player.y)
  e.speed = 50
  const ex = e.x
  step(run, 1, { x: 1, y: 0 })
  ok(run.t === t0 && e.x === ex && run.balls.length === 0, 'while choosing, time, enemies, firing and Mano all stand still')
  choose(run, run.choices[0], run.choiceSeq)
  ok(run.state === 'levelup' && run.pending === 1, 'the second choice opens right after the first')
  choose(run, run.choices[0], run.choiceSeq)
  const xp = run.xp
  run.orbs.push({ kind: 'coin', x: run.player.x, y: run.player.y, v: 1, pull: false })
  step(run, FIXED * 2, still)
  ok(run.coins === 1 && run.xp === xp, 'a coin is a coin: it adds no XP')
}
// nothing flies to Mano by itself after a while (asked for: taken out); her
// magnet is much bigger instead: what lies within it comes, what lies past
// it stays
{
  const run = newRun()
  run.spawnT = -1e9
  const p = run.player
  const R = B.player.pickupRadius
  const far = { x: p.x + R + 40, y: p.y }
  const near = { x: p.x, y: p.y + R - 10 }
  run.orbs.push({ kind: 'xp', ...far, v: 1, pull: false }, { kind: 'xp', ...near, v: 1, pull: false })
  for (let t = 0; t < 10; t += FIXED) step(run, FIXED, still)
  ok(R >= 120 && B.xp.pullAfter === undefined && run.xp === 1 && run.orbs.length === 1 && run.orbs[0].x === far.x, `Mano's magnet reaches ${R} px (from 55): a gem ${R - 10} px off comes; one past it still lies there 10 s later (nothing comes by itself)`)
}

// ── monsters come in packs ──────────────────────────────────────────────────
{
  const run = newRun({ seed: 5 })
  run.nextEvent = 9 // no elites or boss
  for (const ph of B.chapter.phases) {
    run.t = ph.from + 0.01
    run.enemies = []
    run.spawnT = 1e3
    step(run, FIXED, still)
    const n = run.enemies.length
    const one = run.enemies.every((e) => e.type === run.enemies[0].type)
    const spread = Math.max(...run.enemies.map((e) => Math.hypot(e.x - run.enemies[0].x, e.y - run.enemies[0].y)))
    const away = run.enemies.every((e) => Math.hypot(e.x - run.player.x, e.y - run.player.y) >= 60)
    ok(n >= 1 && n <= ph.pack && one && spread < 120 && away, `from ${ph.from} s: a pack of up to ${ph.pack} of one kind, bunched, away from Mano (${n} ${run.enemies[0]?.type})`)
    const xpm = ph.xpMultiplier ?? 1
    ok(run.enemies.every((e) => near(e.xp, B.enemies[e.type].xp * xpm)), `from ${ph.from} s: each is worth ×${xpm} experience`)
  }
  // the opening is busier than it was (0.83 then 1.9 monsters a second), each
  // monster weaker and worth a little less
  const [p0, p1] = B.chapter.phases
  ok(p0.pack / p0.spawnInterval >= 1.2 && p1.pack / p1.spawnInterval >= 2.4 && p0.xpMultiplier < 1 && p1.xpMultiplier < 1, `the first 70 s: ${(p0.pack / p0.spawnInterval).toFixed(2)} then ${(p1.pack / p1.spawnInterval).toFixed(2)} monsters a second, worth ×${p0.xpMultiplier} / ×${p1.xpMultiplier} experience`)
  // elites and the boss keep their whole experience
  const er = newRun({ seed: 4 })
  er.t = 0.5
  const th = spawnAt(er, 'thief', { x: 180, y: 200 })
  ok(th.xp === B.enemies.thief.xp, `the thief keeps its whole experience (${th.xp}) in the opening`)
}

// regen heals a share of the maximum HP each second, whatever the HP is
{
  const share = B.upgrades.effects.regen.addMaxHpShare
  for (const maxHp of [100, 10000]) {
    const run = newRun()
    run.spawnT = -1e9
    run.state = 'levelup'; run.pending = 1; run.choices = ['regen', 'maxHp', 'pickup']; run.choiceSeq++
    choose(run, 'regen', run.choiceSeq)
    run.player.maxHp = maxHp
    run.player.hp = maxHp / 2
    for (let t = 0; t < 1 - 1e-9; t += FIXED) step(run, FIXED, still)
    ok(near(run.player.hp, maxHp / 2 + share * maxHp, 1e-6 * maxHp + 0.01), `regen card at max HP ${maxHp}: +${share * maxHp} in one second (${run.player.hp.toFixed(2)})`)
  }
}

// ── contact damage, death ───────────────────────────────────────────────────
{
  const run = newRun()
  run.spawnT = -1e9
  const p = run.player
  for (let i = 0; i < 6; i++) enemy(run, p.x + i * 0.5, p.y + 1)
  step(run, FIXED * 2, still)
  ok(p.hp === 100 - 9, 'six enemies touching at once: one hit of 9, not six')
  const hp = p.hp
  step(run, 0.3, still)
  ok(p.hp === hp, 'no damage again during the 0.65 s after a hit')
  p.hp = 1
  p.inv = 0
  step(run, FIXED * 3, still)
  ok(run.state === 'dying' && run.result && !run.result.cleared, 'HP 0: the run is locked as lost')
  for (let i = 0; i < 60; i++) step(run, FIXED, still)
  ok(run.state === 'over', 'after the fall the run is over')
}

// ── the chapter: elites at 70 s and 145 s, the boss at 210 s ────────────────
{
  const run = newRun({ seed: 4 })
  run.spawnT = -1e9
  run.player.hp = run.player.maxHp = 1e9
  const when = {}
  for (let i = 0; i < 230 * 60; i++) {
    run.player.inv = 1e9
    run.fireT = 1e9
    step(run, FIXED, still)
    for (const k of ['elite1', 'elite2', 'boss']) if (run.elites[k] && when[k] === undefined) when[k] = Math.round(run.t)
    run.events.length = 0
    run.enemies = run.enemies.filter((e) => e.rank)
  }
  ok(when.elite1 === 70 && when.elite2 === 145 && when.boss === 210, `elite 1 at ${when.elite1} s, elite 2 at ${when.elite2} s, the boss at ${when.boss} s`)
  ok(run.elites.elite1.type !== run.elites.elite2.type && run.elites.elite1.behavior !== run.elites.elite2.behavior, `the two elites differ (${run.elites.elite1.type}: ${run.elites.elite1.behavior}, ${run.elites.elite2.type}: ${run.elites.elite2.behavior})`)
  const iv = spawnInterval(run)
  for (let i = 0; i < 40 * 60; i++) {
    run.player.inv = 1e9
    run.fireT = 1e9
    step(run, FIXED, still)
    run.events.length = 0
  }
  ok(run.state === 'play' && overtime(run) && !run.result, `past 240 s with the boss standing: boss overtime, no clear (t = ${run.t.toFixed(0)} s)`)
  ok(spawnInterval(run) < iv, `in overtime monsters come faster (every ${spawnInterval(run).toFixed(2)} s instead of ${iv.toFixed(2)} s)`)
  {
    const o = B.chapter.overtime
    const steps = Math.floor((run.t - o.after) / o.every) + 1
    const hp0 = run.player.hp
    run.player.inv = 0
    run.player.hp = run.player.maxHp = 1e12
    ok(near(overtimeHit(run), o.hitsHarder ** steps) && overtimeHit(run) > 1, `in overtime monsters hit ×${overtimeHit(run).toFixed(2)} harder (×${o.hitsHarder} each ${o.every} s), so a run that can no longer win ends`)
    run.player.hp = hp0
  }
  const b = run.boss
  b.hp = 1
  run.hurt(b, 5, b.x, b.y)
  ok(b.state === 'down' && run.awards.includes('boss'), 'the boss falls: its reward is earned at once')
  for (let i = 0; i < 120; i++) {
    run.player.inv = 1e9
    if (run.state === 'levelup') choose(run, run.choices[0], run.choiceSeq)
    step(run, FIXED, still)
  }
  ok(run.state === 'over' && run.result.cleared, 'after it lies down the chapter is cleared')
}
{
  const run = newRun({ seed: 6 })
  run.spawnT = -1e9
  run.t = 69.99
  step(run, FIXED * 2, still)
  const thief = run.elites.elite1
  thief.state = 'live'
  thief.hp = 1
  run.player.hp = 50
  run.hurt(thief, 5, thief.x, thief.y)
  ok(run.awards.join() === 'elite1' && run.eliteKills === 1 && run.player.hp === 50 + B.chapter.eliteHeal, `the thief caught: reward earned, +${B.chapter.eliteHeal} HP`)
  const r2 = newRun({ seed: 6 })
  r2.spawnT = -1e9
  r2.t = 69.99
  step(r2, FIXED * 2, still)
  for (let i = 0; i < (B.enemies.thief.staySeconds + 2) * 60; i++) {
    r2.player.inv = 1e9
    r2.fireT = 1e9
    step(r2, FIXED, still)
  }
  ok(r2.elites.elite1.state !== 'live' && !r2.awards.length, 'left alone, the thief gets away (no reward)')
}
{
  const run = newRun({ seed: 4 })
  run.spawnT = -1e9
  run.player.hp = run.player.maxHp = 1e6
  run.t = 209.99
  run.nextEvent = 2
  step(run, FIXED * 2, still)
  const b = run.boss
  ok(b && near(b.maxHp, B.enemies.boss.hp * B.chapters[0].hp), `the boss comes with its own HP × the chapter's (${b && b.maxHp})`)
  b.btype = 'A' // the charger
  for (let i = 0; i < 600 && b.mode !== 'windup'; i++) step(run, FIXED, still)
  const path = chargePath(run, b)
  const start = [b.x, b.y]
  ok(b.mode === 'windup' && path.len > 0 && path.half === b.r, `it stops and shows where it will charge (${Math.round(path.len)} px long, as wide as its body)`)
  for (let i = 0; i < 400 && b.mode !== 'rest'; i++) {
    run.player.x = 20
    run.player.y = 600
    step(run, FIXED, still)
  }
  const along = (b.x - start[0]) * path.dx + (b.y - start[1]) * path.dy
  const off = Math.abs((b.x - start[0]) * -path.dy + (b.y - start[1]) * path.dx)
  ok(near(along, path.len, 0.01) && off < 0.01, `the charge goes exactly where it was shown (${along.toFixed(2)} of ${path.len.toFixed(2)} px)`)
}


// ── the boss lives long: the ordinary monsters run faster, by steps ────────
{
  const M = B.chapter.overtime.mobSpeed
  const run = newRun({ seed: 9 })
  run.player.hp = run.player.maxHp = 1e12
  run.t = 209.99
  run.nextEvent = 2
  step(run, FIXED * 2, still)
  for (let i = 0; i < 60 && run.boss.state !== 'live'; i++) step(run, FIXED, still)
  const at = (t) => {
    run.t = run.bossAt + t
    return mobSpeed(run)
  }
  const t0 = run.t
  ok(at(0) === 1 && at(M.after - 0.01) === 1, `the first ${M.after} s after the boss comes: monsters at their own speed`)
  ok(near(at(M.after), 1 + M.step) && near(at(M.after + M.every - 0.01), 1 + M.step) && near(at(M.after + M.every), 1 + 2 * M.step), `then ×${1 + M.step}, ×${1 + 2 * M.step} … one step every ${M.every} s (not every frame)`)
  ok(at(1e6) === M.max, `never past ×${M.max}`)
  // the speed is really used: a monster walks that much faster
  run.t = run.bossAt + M.after + M.every * 3 + 0.5
  const k = mobSpeed(run)
  run.enemies = run.enemies.filter((e) => e === run.boss)
  const m = enemy(run, 40, 300)
  m.speed = 20
  m.behavior = 'chase'
  run.player.x = 300
  run.player.y = 300
  const x0 = m.x
  run.player.inv = 1e9
  run.fireT = 1e9
  step(run, FIXED, still)
  const bossSpeed = run.boss.speed
  ok(near((m.x - x0) / FIXED, 20 * k, 0.5), `a monster runs ×${k.toFixed(2)} (${((m.x - x0) / FIXED).toFixed(1)} px/s for its 20); the boss keeps its own (${bossSpeed})`)
  run.boss.hp = 1
  run.hurt(run.boss, 5, run.boss.x, run.boss.y)
  ok(mobSpeed(run) === 1, 'the boss falls: back to ×1 at once')
  ok(mobSpeed(newRun({ seed: 9 })) === 1, 'a new run starts at ×1')
  void t0
}

// ── the ordinary bosses' four types (balance.json → bossTypes) ─────────────
{
  const T = B.bossTypes
  // one type each, out of a shuffled bag: every four in a row are all four
  const run = newRun({ seed: 21 })
  const got = []
  for (let k = 0; k < 12; k++) {
    const r = newRun({ seed: 21 + k, bossBag: run.bossBag })
    r.t = 209.99
    r.nextEvent = 2
    step(r, FIXED * 2, still)
    got.push(r.boss.btype)
  }
  const rounds = [0, 4, 8].map((i) => got.slice(i, i + 4).sort().join(''))
  ok(rounds.every((x) => x === 'ABCD'), `bosses one after another (the page's bag): ${got.join(' ')} — each four all of A B C D`)
  // an extra special boss chapter's own boss is an ordinary boss with a type too
  {
    const r = newRun({ chapter: 3, seed: 2 })
    r.t = 209.99
    r.nextEvent = 2
    step(r, FIXED * 2, still)
    ok(r.boss.behavior === 'boss' && 'ABCD'.includes(r.boss.btype) && r.boss.skin === regionOf(D, 3).skins.boss, `chapter 3: its own boss comes as usual (${r.boss.skin}, type ${r.boss.btype})`)
  }
  const bossOf = (type, seed = 7) => {
    const r = newRun({ seed })
    r.spawnT = -1e9
    r.player.hp = r.player.maxHp = 1e9
    r.t = 209.99
    r.nextEvent = 2
    step(r, FIXED * 2, still)
    r.boss.btype = type
    for (let i = 0; i < 30 && r.boss.state !== 'live'; i++) step(r, FIXED, still)
    return r
  }
  const tick = (r, n = 1) => {
    for (let i = 0; i < n; i++) {
      r.enemies = r.enemies.filter((e) => e === r.boss)
      r.player.inv = 1e9
      r.fireT = 1e9
      if (r.state === 'levelup') choose(r, r.choices[0], r.choiceSeq)
      step(r, FIXED, still)
      r.events.length = 0
    }
  }
  // B: weaves left and right of Mano's direction, at its own speed, never a jump
  {
    const r = bossOf('B')
    const b = r.boss
    r.player.x = 180
    r.player.y = 600
    b.x = 180
    b.y = 160
    let side = new Set()
    let maxStep = 0
    let px = b.x
    let py = b.y
    for (let i = 0; i < 60 * 3; i++) {
      tick(r)
      maxStep = Math.max(maxStep, Math.hypot(b.x - px, b.y - py) / FIXED)
      // (Mano is straight below: any sideways step is the weave)
      if (Math.abs(b.x - px) / FIXED > 5) side.add(Math.sign(b.x - px))
      px = b.x
      py = b.y
    }
    ok(side.size === 2 && maxStep <= b.speed * 1.01 && b.mode === 'walk', `B: weaves left and right on the way, never faster than its speed (${maxStep.toFixed(1)} ≤ ${b.speed.toFixed(1)} px/s)`)
  }
  // C: stops, shows three lanes for aim s, then three shots along them, then on
  {
    const r = bossOf('C')
    const b = r.boss
    for (let i = 0; i < 60 * 5 && b.mode !== 'aim'; i++) tick(r)
    const lanes = r.hazards.filter((h) => h.owner === b.id && h.kind === 'ray')
    const at = [b.x, b.y]
    const warn = lanes.length ? lanes[0].at - lanes[0].born : 0
    let shots = []
    for (let i = 0; i < 120 && !shots.length; i++) {
      tick(r)
      shots = r.shots.filter((s) => s.owner === b.id)
    }
    const along = shots.every((s) => lanes.some((l) => Math.abs((s.x - l.x) * -l.dy + (s.y - l.y) * l.dx) < 0.5 && (s.x - l.x) * l.dx + (s.y - l.y) * l.dy > 0))
    ok(lanes.length === 3 && shots.length === 3 && along && warn >= 0.75 && near(at[0], b.x) && near(at[1], b.y), `C: stands, three lanes shown ${warn.toFixed(2)} s, then three shots exactly along them`)
    for (let i = 0; i < 120 && b.mode !== 'walk'; i++) tick(r)
    ok(b.mode === 'walk', 'C: then it walks again')
  }
  // D: shown first (it waits warn s), runs at mul× for seconds s, then walks
  {
    const r = bossOf('D')
    const b = r.boss
    for (let i = 0; i < 60 * 5 && b.mode !== 'rushWind'; i++) tick(r)
    let wind = 0
    while (b.mode === 'rushWind' && wind < 5) (tick(r), (wind += FIXED))
    let run_ = 0
    let fast = 0
    let px = b.x
    let py = b.y
    while (b.mode === 'rush' && run_ < 5) {
      tick(r)
      run_ += FIXED
      fast = Math.max(fast, Math.hypot(b.x - px, b.y - py) / FIXED)
      px = b.x
      py = b.y
    }
    ok(near(wind, T.D.warn, 0.03) && near(run_, T.D.seconds, 0.03) && near(fast, b.speed * T.D.mul, 1) && b.mode === 'walk', `D: ${wind.toFixed(2)} s shown, then ${run_.toFixed(2)} s at ${(fast / b.speed).toFixed(2)}× speed, then back to walking`)
  }
  // a boss that falls takes its lanes and shots with it
  {
    const r = bossOf('C')
    const b = r.boss
    for (let i = 0; i < 60 * 5 && b.mode !== 'aim'; i++) tick(r)
    b.hp = 1
    r.hurt(b, 5, b.x, b.y)
    ok(!r.hazards.some((h) => h.owner === b.id) && !r.shots.some((s) => s.owner === b.id), 'C: falling mid-aim, its lanes go with it')
  }
}

// ── weapons registry ────────────────────────────────────────────────────────
{
  ok(D.weapons.registry.every((w) => implemented(w)), 'every weapon in the registry has a behaviour')
  ok(!implemented({ behaviorId: 'summon_cats' }), 'a weapon without a behaviour (churu) is not usable yet')
  let threw = false
  try { createRun(D, { weaponId: 'churu' }) } catch { threw = true }
  ok(threw, 'a run with an unknown weapon is refused')
}

// ── grades and coin stats at the start of a run ─────────────────────────────
{
  const run = createRun(D, { weaponId: 'bouncy_ball', grade: 'A', seed: 1, perma: { hp: 3, damage: 2, move: 4, interval: 5, crit: 10, coins: 1 } })
  ok(near(gradeMul(D, 'A'), 1.65) && near(gradeMul(D, 'EX'), 7), 'grade multipliers D ×1 … A ×1.65 … EX ×7')
  const S = B.perma.stats
  ok(near(run.weapon.damage, BASE.damage * 1.65 * S.damage.mul ** 2), `A grade with damage Lv.2: ${BASE.damage} × 1.65 × ${S.damage.mul}² = ${run.weapon.damage.toFixed(3)}`)
  ok(near(run.player.maxHp, B.player.hp * S.hp.mul ** 3) && near(run.weapon.interval, BASE.interval * S.interval.mul ** 5) && near(run.weapon.critChance, S.crit.add * 10) && near(run.player.speed, B.player.speed * S.move.mul ** 4) && near(run.player.coinMul, S.coins.mul), `coin stats: HP ×${S.hp.mul}^L, gap ×${S.interval.mul}^L, crit +${S.crit.add * 100}%p×L, speed ×${S.move.mul}^L, coins ×${S.coins.mul}^L`)
  pickIn(run, 'damage')
  ok(near(run.weapon.damage, BASE.damage * 1.65 * S.damage.mul ** 2 * 1.5), 'an in-run upgrade multiplies on top')
  const r2 = createRun(D, { weaponId: 'bouncy_ball', grade: 'A', seed: 2, perma: { damage: 2 } })
  ok(near(r2.weapon.damage, BASE.damage * 1.65 * S.damage.mul ** 2) && r2.weapon.count === 1, 'the next run starts again from the grade and coin stats (upgrades reset)')
  ok(near(statValue(D, 'crit', 1000), 1) && statValue(D, 'move', 999) === 1.015 ** 40, 'coin stat caps: crit 100%, speed 40 levels')
  // crit: as it always was up to 50% (level 67), then 1.5% a level (×1.05 the price) up to 100%
  const oldCrit = (L) => Math.min(0.5, 0.0075 * L)
  const same = Array.from({ length: 68 }, (_, L) => L).every((L) => near(statValue(D, 'crit', L), oldCrit(L), 1e-12) && statPrice(D, 'crit', L) === Math.floor(200 * B.perma.priceGrowth ** L))
  ok(same && near(statValue(D, 'crit', 68), 0.515) && near(statValue(D, 'crit', 101), 1) && statValue(D, 'crit', 100) < 1 && statPrice(D, 'crit', 68) === Math.floor(200 * B.perma.priceGrowth ** 67 * 1.05), 'coin stat 치명타 확률: levels 0–67 (up to 50%) and their prices as before; then +1.5% a level, the price ×1.05; 100% at level 101')
  // 방어력 and 회복 (added later, asked for): moderate, with a top; the run's
  // cards add on top of them
  const ar = createRun(D, { weaponId: 'bouncy_ball', grade: 'D', seed: 3, perma: { armor: 10, regen: 4 } })
  ok(near(ar.player.armor, S.armor.mul ** 10) && near(ar.player.regen, S.regen.add * 4) && createRun(D, { weaponId: 'bouncy_ball', grade: 'D', seed: 3 }).player.armor === 1, `coin stats 방어력 ×${S.armor.mul}^L on the damage she takes and 회복 +${S.regen.add * 100}% of her max HP a second a level`)
  ok(near(statValue(D, 'armor', 999), S.armor.mul ** S.armor.maxLevel) && statValue(D, 'armor', 999) > 0.6 && near(statValue(D, 'regen', 999), S.regen.max) && S.regen.max <= 0.01, `their tops: 방어력 ${S.armor.maxLevel} levels (×${statValue(D, 'armor', 999).toFixed(3)}: never near unhurtable), 회복 ${S.regen.max * 100}% a second`)
  pickIn(ar, 'armor')
  pickIn(ar, 'regen')
  ok(near(ar.player.armor, S.armor.mul ** 10 * B.upgrades.effects.armor.mul) && near(ar.player.regen, S.regen.add * 4 + B.upgrades.effects.regen.addMaxHpShare), 'the run\'s 방어력 and 회복 cards add on top of the coin stats')
}

// ── progress: rewards, chests, fusion, coin stats, saves ────────────────────
{
  const mem = new Mem()
  mem.setItem('nodnaba:colony:save', 'COLONY')
  mem.setItem('nodnaba:manorun:best', '777')
  const P = createProgress(D, mem)
  const d0 = P.boot().data
  ok(d0.schemaVersion === SCHEMA && d0.inventory.length === 1 && d0.inventory[0].grade === 'D' && d0.equippedInstanceId === d0.inventory[0].id, 'start: one D bouncy ball, equipped')
  const r = P.startRun(1)
  const e1 = P.award(r.runId, 1, 'elite1')
  const e1b = P.award(r.runId, 1, 'elite1')
  const e2 = P.award(r.runId, 1, 'elite2')
  const bo = P.award(r.runId, 1, 'boss')
  const end = P.finishRun(r.runId, 1, { cleared: true, coins: 40, kills: 300, time: 230, elites: 2 })
  const end2 = P.finishRun(r.runId, 1, { cleared: true, coins: 40, kills: 300, time: 230, elites: 2 })
  const firstTotal = e1.chests.length + e2.chests.length + bo.chests.length + end.chests.length
  ok(firstTotal === 8 && P.get().chests.length === 8, `first clear with both elites: ${e1.chests.length} + ${e2.chests.length} + ${bo.chests.length} + ${end.chests.length} = ${firstTotal} chests`)
  ok(e1b.already && end2.already && P.get().chests.length === 8, 'the same reward twice (double tap, reload) pays nothing the second time')
  const coins1 = P.get().currency
  const R = B.rewards
  ok(coins1 === 40 + R.elite1.coins + R.elite2.coins + R.boss.coins + R.clear.coins, `coins: picked up 40 + elites ${R.elite1.coins} + ${R.elite2.coins} + boss ${R.boss.coins} + clear ${R.clear.coins} = ${coins1}`)
  ok(P.get().unlockedChapter === 2 && end.firstClear, 'chapter 2 opens; it was a first clear')
  const r2 = P.startRun(1)
  for (const k of ['elite1', 'elite2', 'boss']) P.award(r2.runId, 1, k)
  const again = P.finishRun(r2.runId, 1, { cleared: true, coins: 0, kills: 1, time: 1, elites: 2 })
  ok(P.get().chests.length === 14 && !again.firstClear, 'a repeat clear with both elites: 6 more chests (14)')
  const r3 = P.startRun(2)
  P.award(r3.runId, 2, 'elite1')
  const lost = P.finishRun(r3.runId, 2, { cleared: false, coins: 12, kills: 50, time: 100, elites: 1 })
  ok(lost.chests.length === 0 && P.get().chests.length === 15 && lost.coins === 12, 'lost in chapter 2: the elite chest and the 12 coins picked up stay, no clear reward')
  const r4 = P.startRun(1)
  const q1 = P.abandonRun(r4.runId, 9.7)
  const q2 = P.abandonRun(r4.runId, 9.7)
  ok(q1 === 9 && q2 === 0, 'quitting keeps the coins picked up (once)')
  const before = P.get().inventory.length
  const cur0 = P.get().currency
  const chestCoins = P.get().chests.reduce((a, c) => a + Math.round(B.chest.coinsPerChest * chapterCoins(D, c.chapter)), 0)
  const all = P.openAll()
  const again2 = P.openAll()
  ok(all.length === 15 && again2.length === 0 && P.get().inventory.length === before + 15 && P.get().chests.length === 0, '15 chests opened at once: one bouncy ball each, then none are left')
  ok(P.get().currency === cur0 + chestCoins && chestCoins > 15 * B.chest.coinsPerChest, `each chest also gives ${B.chest.coinsPerChest} coins × its chapter's coin value (${chestCoins} for 14 from chapter 1 and 1 from chapter 2)`)
  ok(all.every((x) => x.items.every((it) => it.weaponId === 'bouncy_ball')), 'only weapons that can be played come out of chests')
  const r5 = P.startRun(2)
  const c2 = P.finishRun(r5.runId, 2, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
  ok(c2.gift && c2.gift.grade === 'C' && c2.gift.weaponId === 'bouncy_ball', 'first clear of chapter 2: a C bouncy ball as a gift')
  const r6 = P.startRun(3)
  ok(!P.finishRun(r6.runId, 3, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 }).gift, 'chapter 3: no gift')
  P.startRun(1)
  const again3 = createProgress(D, mem).boot()
  ok(again3.lostRun && again3.data.activeRun === null, 'a run left unfinished (page closed) ends; what it earned stays')
  ok(mem.getItem('nodnaba:colony:save') === 'COLONY' && mem.getItem('nodnaba:manorun:best') === '777', "other games' saves untouched")
  ok(near(chapterCoins(D, 1), 1) && near(chapterCoins(D, 3), R.coinGrowth ** 2) && near(chapterCoins(D, 35) / chapterCoins(D, 34), R.coinGrowth), `every chapter's coins are worth ×${R.coinGrowth} the one before (chapter 10: ×${chapterCoins(D, 10).toFixed(0)})`)
  const r3b = P.startRun(3)
  const e3 = P.award(r3b.runId, 3, 'elite1')
  ok(e3.coins === Math.round(R.elite1.coins * chapterCoins(D, 3)), `the thief in chapter 3 pays ${R.elite1.coins} × ${R.coinGrowth}² = ${e3.coins}`)
  P.finishRun(r3b.runId, 3, { cleared: false, coins: 0, kills: 1, time: 1, elites: 1 })
  const counts = { D: 0, C: 0, B: 0 }
  for (let i = 0; i < 20000; i++) counts[rollGrade(D, i / 20000)]++
  ok(Math.abs(counts.D - 17000) < 20 && Math.abs(counts.C - 2400) < 20 && Math.abs(counts.B - 600) < 20, `chest grades D85 / C12 / B3 (${counts.D}/${counts.C}/${counts.B})`)
}
{
  const prices = [0, 1, 2, 3, 4].map((L) => statPrice(D, 'hp', L))
  ok(prices.every((p, L) => p === Math.floor(B.perma.stats.hp.price * B.perma.priceGrowth ** L)) && prices[1] > prices[0], `HP prices ${prices.join(' → ')} (×${B.perma.priceGrowth} a level)`)
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.currency = 300
  mem.setItem(KEY, JSON.stringify(d))
  const a = P.buyStat('hp', 0)
  const b = P.buyStat('hp', 0)
  ok(a.ok && !b.ok && P.get().perma.hp === 1 && P.get().currency === 200, 'buying HP Lv.1 for 100; the second tap of the same button buys nothing')
  const c = P.buyStat('damage', 0)
  ok(c.ok && P.get().perma.damage === 1 && P.get().perma.hp === 1 && P.get().currency === 50, 'each stat has its own level and price')
  ok(!P.buyStat('hp', 1).ok && P.get().currency === 50, 'not enough coins: nothing happens')
  const reload = createProgress(D, mem).boot().data
  ok(reload.perma.hp === 1 && reload.perma.damage === 1 && reload.currency === 50, 'coin stats survive a reload')
}
{
  // red balls for 마노의 방's stages and crit's top (balance.json → gifts), each once
  const G = B.gifts
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.currency = 1e12
  d.perma.hp = 29
  mem.setItem(KEY, JSON.stringify(d))
  const r = P.buyStat('hp', 29)
  ok(r.ok && r.gifts.length === 1 && r.gifts[0].key === 'room1' && r.gifts[0].item.grade === G.room[1], `the room's 2nd stage (30 levels): one ${G.room[1]} ball`)
  ok(P.buyStat('hp', 30).gifts.length === 0, 'the next level in the same stage: no ball')
  ok(createProgress(D, mem).boot().gifts.length === 0, 'a reload gives it again: no')
  const e = P.get()
  const max = statMaxLevel(D, 'crit')
  e.perma.crit = max - 1
  mem.setItem(KEY, JSON.stringify(e))
  const c = P.buyStat('crit', max - 1)
  ok(c.ok && c.gifts.some((g) => g.key === 'critMax' && g.item.grade === G.critMax), `치명타 확률 at its top: one ${G.critMax} ball`)
  ok(P.get().gifts.filter((k) => k === 'critMax').length === 1 && createProgress(D, mem).boot().gifts.length === 0, 'once only')
  // a save already past stages (from before the gifts): its balls at the next boot, once
  const m2 = new Mem()
  const P2 = createProgress(D, m2)
  P2.boot()
  const old = P2.get()
  old.perma.hp = 120
  old.perma.damage = 100
  delete old.gifts
  m2.setItem(KEY, JSON.stringify(old))
  const b2 = createProgress(D, m2).boot()
  ok(b2.gifts.map((g) => g.item.grade).join() === [1, 2, 3].map((i) => G.room[i]).join() && b2.data.gifts.join() === 'room1,room2,room3', `220 levels (stage 4) before the gifts: the balls of stages 2-4 now (${b2.gifts.map((g) => g.item.grade).join(', ')})`)
  ok(createProgress(D, m2).boot().gifts.length === 0, 'and never again')
  // story v 5: the balls the rewards of 15-30 bring now, to a save that had those rewards
  const m3 = new Mem()
  const P3 = createProgress(D, m3)
  P3.boot()
  const s5 = P3.get()
  s5.story.v = 5
  s5.story.rewards = ['forest', 'deepforest', 'skulltown', 'desert']
  s5.firstCleared = Array.from({ length: 22 }, (_, i) => i + 1)
  m3.setItem(KEY, JSON.stringify(s5))
  const b3 = createProgress(D, m3).boot()
  const add = b3.data.inventory.slice(s5.inventory.length).map((it) => it.grade)
  ok(add.join() === 'SS,SS' && b3.data.story.news.includes('balls') && b3.supplied.length === 0 && b3.data.story.v === 6, 'a story-v5 save with the rewards of 15 and 20: their two SS balls now, told once')
  createProgress(D, m3).clearNews()
  const b4 = createProgress(D, m3).boot()
  ok(b4.data.inventory.length === b3.data.inventory.length && !b4.data.story.news.length, 'the next visit: nothing given or told again')
}
{
  // 마노의 방's coin bubble in the lobby: once, kept across a reload
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  ok(P.get().seenCoinTip === false, 'a new save has not seen the coin bubble')
  P.seenCoinTip()
  ok(createProgress(D, mem).boot().data.seenCoinTip === true, 'the coin bubble, once seen, stays seen after a reload')
  ok(B.drops.coinChance === 0.6 && Math.abs(B.drops.coinChance * B.drops.coinAmount - 0.24) < 1e-9, 'monsters drop coins 5× as often, each worth 1/5 (the same coins on average)')
}
{
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.inventory.push({ id: 'w2', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w3', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w4', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w5', weaponId: 'bouncy_ball', grade: 'C' })
  d.nextSeq = 6
  mem.setItem(KEY, JSON.stringify(d))
  ok(!canFuse(D, P.get(), ['w2', 'w3', 'w5']).ok && !canFuse(D, P.get(), ['w2', 'w3']).ok, 'different grades, or only two, cannot be fused')
  const before = P.get().inventory.length
  const bad = P.fuse(['w2', 'w3', 'w5'])
  ok(!bad.ok && P.get().inventory.length === before, 'a refused fusion removes nothing')
  const f = P.fuse(['w1', 'w2', 'w3'])
  const f2 = P.fuse(['w1', 'w2', 'w3'])
  const after = P.get()
  ok(f.ok && f.item.grade === 'C' && !f2.ok && after.inventory.length === before - 2, 'three D → one C (3 gone, 1 new); a double tap changes nothing')
  ok(f.equipped && after.equippedInstanceId === f.item.id, 'the equipped ball was fused: the new C ball is equipped')
  const ex = { ...after, inventory: [1, 2, 3].map((i) => ({ id: 'x' + i, weaponId: 'bouncy_ball', grade: 'EX' })) }
  ok(!canFuse(D, ex, ['x1', 'x2', 'x3']).ok, 'EX cannot be fused')
}
// backup files: export, check, import
{
  const mem = new Mem()
  mem.setItem('nodnaba:colony:save', 'COLONY')
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.currency = 4321
  d.unlockedChapter = 7
  d.inventory.push({ id: 'w2', weaponId: 'bouncy_ball', grade: 'A' })
  d.nextSeq = 3
  d.perma.damage = 5
  mem.setItem(KEY, JSON.stringify(d))
  const text = P.exportText(Date.UTC(2026, 9, 19))
  const r = parseBackup(D, text)
  ok(r.ok && r.summary.coins === 4321 && r.summary.chapter === 7 && r.summary.weapons === 2 && r.summary.best === 'A' && r.data.perma.damage === 5, `an exported backup reads back whole (${JSON.stringify(r.summary)})`)
  ok(/^mano-survivor-backup-\d{8}-\d{4}\.json$/.test(exportName()), `file name ${exportName()}`)
  ok(!parseBackup(D, 'not json').ok && !parseBackup(D, '{"game":"mano-colony","save":{}}').ok && !parseBackup(D, '{"hello":1}').ok, 'broken text, another game\'s backup and other JSON are refused')
  ok(/새로운 버전/.test(parseBackup(D, JSON.stringify({ game: 'mano-survivor', save: { ...d, schemaVersion: 99 } })).error), 'a backup from a newer version is refused with its reason')
  ok(parseBackup(D, JSON.stringify(d)).ok, 'a bare save (no envelope) is accepted too')
  // import into a different progress: what it replaces is kept aside
  const mem2 = new Mem()
  const P2 = createProgress(D, mem2)
  P2.boot()
  P2.startRun(1)
  const before = mem2.getItem(KEY)
  ok(P2.importBackup(r.data) && P2.get().currency === 4321 && P2.get().unlockedChapter === 7 && P2.get().activeRun === null, 'importing replaces the progress (no run left open)')
  ok(mem2.getItem(BEFORE_IMPORT_KEY) === before, 'the replaced progress is kept aside, not deleted')
  ok(mem.getItem('nodnaba:colony:save') === 'COLONY', "exporting never touches the other games' saves")
  ok(P2.savedAt() > 0, 'the last save time is known')
}

// 설정 → 진행 초기화: back to the first visit, the old progress kept aside
{
  const mem = new Mem()
  mem.setItem('nodnaba:colony:save', 'COLONY')
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  Object.assign(d, { currency: 98765, unlockedChapter: 21, sound: false })
  d.perma.damage = 40
  d.cats.unlocked = true
  mem.setItem(KEY, JSON.stringify(d))
  const before = mem.getItem(KEY)
  const ok1 = P.resetAll()
  const now = P.get()
  const first = createProgress(D, new Mem()).boot().data
  ok(ok1 && now.currency === 0 && now.unlockedChapter === 1 && now.perma.damage === 0 && !now.cats.unlocked && now.inventory.length === first.inventory.length && now.sound === false, 'reset: coins, chapters, coin stats, the cats … all as on the first visit; only the sound setting kept')
  ok(mem.getItem(BEFORE_RESET_KEY) === before && mem.getItem('nodnaba:colony:save') === 'COLONY', "reset: the progress it replaced is kept aside, not deleted; the other games' saves are untouched")
  const again = createProgress(D, mem).boot().data
  ok(again.currency === 0 && again.unlockedChapter === 1, 'reset: it stays reset after a reload')
}

// fuse everything at once
{
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  // 28 D (w1 is the equipped one) + 2 C
  d.inventory = [...Array.from({ length: 28 }, (_, i) => ({ id: 'w' + (i + 1), weaponId: 'bouncy_ball', grade: 'D' })), { id: 'w29', weaponId: 'bouncy_ball', grade: 'C' }, { id: 'w30', weaponId: 'bouncy_ball', grade: 'C' }]
  d.equippedInstanceId = 'w1'
  d.nextSeq = 31
  mem.setItem(KEY, JSON.stringify(d))
  const plan = fuseAllPreview(D, P.get())
  ok(P.get().inventory.length === 30 && plan.ok && plan.made.C === 9 && plan.made.B === 3 && plan.made.A === 1, `the preview counts what would be made (${JSON.stringify(plan.made)}) and changes nothing`)
  const r = P.fuseAll()
  const after = P.get()
  const count = (g) => after.inventory.filter((it) => it.grade === g).length
  ok(r.ok && JSON.stringify(r.made) === JSON.stringify(plan.made), 'fuse all makes what the preview said')
  // 28 D → 9 C (1 D left), 9 + 2 = 11 C → 3 B (2 C left), 3 B → 1 A
  ok(count('D') === 1 && count('C') === 2 && count('B') === 0 && count('A') === 1 && after.inventory.length === 4, '28 D + 2 C → 1 A, with 1 D and 2 C left over')
  ok(after.inventory.find((it) => it.id === after.equippedInstanceId).grade === 'A' && r.equipped.grade === 'A', 'afterwards the best ball (the new A) is equipped')
  const again = P.fuseAll()
  ok(!again.ok && P.get().inventory.length === 4, 'a second tap finds nothing to fuse and changes nothing')
  const d2 = P.get()
  d2.inventory = Array.from({ length: 3 }, (_, i) => ({ id: 'e' + i, weaponId: 'bouncy_ball', grade: 'D' }))
  d2.equippedInstanceId = 'e0'
  mem.setItem(KEY, JSON.stringify(d2))
  const r2 = P.fuseAll()
  ok(r2.ok && P.get().inventory.length === 1 && P.get().equippedInstanceId === P.get().inventory[0].id && r2.equipped.grade === 'C', 'when the equipped one has to go in, its result is equipped')
  const d3 = P.get()
  d3.inventory = Array.from({ length: 3 }, (_, i) => ({ id: 'x' + i, weaponId: 'bouncy_ball', grade: 'EX' }))
  mem.setItem(KEY, JSON.stringify(d3))
  ok(!P.fuseAll().ok && P.get().inventory.length === 3, 'EX is never fused')
}
{
  const mem = new Mem()
  mem.setItem(KEY, JSON.stringify({ schemaVersion: 1, inventory: [{ id: 'w1', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w7', weaponId: 'bouncy_ball', grade: 'C' }], equippedInstanceId: 'w7', currency: 321, unlockedChapter: 3, lastAwardedRunIds: ['rOld'], bestResults: { 1: { wave: 6, kills: 400, cleared: true }, 2: { wave: 6, kills: 300, cleared: true } }, chests: [{ id: 'crOld', runId: 'rOld', chapter: 2 }], nextSeq: 8, activeRun: null, seenHelp: true }))
  const P = createProgress(D, mem)
  const d = P.boot().data
  ok(d.schemaVersion === 2 && d.currency === 321 && d.unlockedChapter === 3 && d.inventory.length === 2 && d.equippedInstanceId === 'w7' && d.chests.length === 1 && d.seenHelp, 'an old save keeps its weapons, coins, chapters, chest and settings')
  ok(d.firstCleared.join() === '1,2' && Object.values(d.perma).every((v) => v === 0), 'chapters cleared before count as cleared (no second first-clear bonus); coin stats start at 0')
  ok(P.finishRun('rOld', 2, { cleared: true, coins: 99 }).already, 'a run paid before the update is still paid only once')
}
{
  const mem = new Mem()
  mem.setItem(KEY, '{broken')
  const P = createProgress(D, mem)
  const r = P.boot()
  ok(r.data.inventory.length === 1 && mem.getItem('nodnaba:survivor:corrupt') === '{broken', 'an unreadable save is kept aside and a new one starts')
  const N = createProgress(D, null)
  ok(N.boot().data.inventory.length === 1 && !N.available, 'with no storage the game still plays (nothing is kept, and it says so)')
}

// ── the story (story.json): region rewards, cutscenes seen, old saves ──────
// a new save: each region's reward comes once with the first clear of its
// last chapter, in that same write; the cats (with the S ball and the
// rerolls) at 5, Tizzzz (with the SS ball and 2 more rerolls) at 10; 15 only
// 2 more rerolls
{
  const S = D.story
  const mem = new Mem()
  mem.setItem('nodnaba:colony:save', 'COLONY')
  const P = createProgress(D, mem)
  const b0 = P.boot()
  ok(b0.supplied.length === 0 && b0.data.story.v === 6 && b0.data.story.seen.length === 0, 'a new save starts in the story: nothing seen yet (the prologue plays at chapter 1), nothing to make up')
  const clear = (ch) => {
    const r = P.startRun(ch)
    return P.finishRun(r.runId, ch, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
  }
  const got = {}
  for (let ch = 1; ch <= 35; ch++) {
    const r = clear(ch)
    if (r.story) got[ch] = r.story
  }
  const chapters = Object.keys(got).map(Number)
  ok(chapters.join() === '5,10,15,20,25,30,35', `rewards come at the clears of ${chapters.join(', ')}, nowhere else`)
  ok(got[5].reward === 'forest' && got[5].item.grade === 'S' && got[10].reward === 'deepforest' && got[10].item.grade === 'SS' && got[15].reward === 'skulltown' && got[15].item.grade === 'SS' && got[20].item.grade === 'SS' && got[25].item.grade === 'SSS' && got[30].item.grade === 'SSS', '5: the cats, an S ball and rerolls; 10: Tizzzz, an SS ball and rerolls; 15, 20: an SS ball each; 25, 30: an SSS ball each')
  ok(P.get().cats.unlocked && P.get().tizzzz.unlocked && P.get().turret.unlocked && P.get().rerolls === 8, `rerolls: 2 at 5, 4 at 10, 6 at 15, 8 at 20 (${P.get().rerolls}); 20 opens the turret`)
  const d = P.get()
  const balls = (g, tag) => d.inventory.filter((it) => it.grade === g && (tag ? it.tag === tag : !it.tag)).length
  ok(got[35].item.grade === 'EX' && got[35].item.tag === 'demon' && balls('SS') === 3 && balls('SSS') === 2, '5: an S ball; 10, 15, 20: an SS each; 25, 30: an SSS each; 35: 마왕의 탱탱볼 (EX)')
  ok(d.cats.unlocked && d.tizzzz.unlocked && d.blessings.phoenix && d.blessings.snow && d.blessings.thunder && d.blessings.final, '5: the cats; 10: Tizzzz; 20, 25, 30: the phoenix gem, the snow and thunder blessings; 35: the last strengthening')
  ok(d.equippedInstanceId === got[35].item.id, '마왕의 탱탱볼 is equipped (it beats the SS)')
  ok(d.story.rewards.length === 7 && d.story.seen.length === 0, 'the rewards are recorded apart from the cutscenes (none seen here: skipping or closing never costs a reward)')
  const before = JSON.stringify([balls('S'), balls('SS'), balls('EX', 'demon')])
  for (const ch of [5, 10, 15, 20, 35]) ok(!clear(ch).story && P.get().rerolls === 8, `clearing chapter ${ch} again gives nothing more`)
  ok(JSON.stringify([balls('S'), balls('SS'), balls('EX', 'demon')]) === before, 'still one S, one SS, one 마왕의 탱탱볼 from the story')
  P.markSeen('ep01_clear')
  P.markSeen('ep01_clear')
  const again = createProgress(D, mem)
  const re = again.boot()
  ok(re.supplied.length === 0 && re.data.story.seen.join() === 'ep01_clear' && re.data.blessings.thunder && re.data.inventory.some((it) => it.tag === 'demon'), 'after a reload: one seen mark, the blessings and 마왕의 탱탱볼 kept, nothing given again')
  const s35 = again.startRun(35)
  ok(s35.cats && s35.tizzzz && s35.blessings.phoenix && s35.blessings.snow && s35.blessings.thunder && s35.blessings.final, 'a run started now brings the cats, Tizzzz and every blessing')
  const bk = parseBackup(D, again.exportText()).data
  ok(bk.blessings.snow && bk.story.rewards.length === 7 && bk.rerolls === 8 && bk.turret.unlocked && bk.inventory.some((it) => it.tag === 'demon'), 'a backup keeps the story, the blessings and 마왕의 탱탱볼')
  ok(mem.getItem('nodnaba:colony:save') === 'COLONY', "the other games' saves are untouched")
  ok(!canFuse(D, again.get(), again.get().inventory.filter((it) => it.grade === 'EX').slice(0, 3).map((it) => it.id)).ok, '마왕의 탱탱볼 never goes into a fusion')
}
// a save from before the story (the first versions: cats and their S ball at
// chapter 5, Tizzzz and her SS ball at chapter 10), at chapter 28: nothing is
// taken back, nothing given twice; what it cleared since is made up once
{
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.firstCleared = Array.from({ length: 28 }, (_, i) => i + 1)
  d.unlockedChapter = 29
  d.inventory.push({ id: 'w90', weaponId: 'bouncy_ball', grade: 'S' }, { id: 'w91', weaponId: 'bouncy_ball', grade: 'SS' })
  d.equippedInstanceId = 'w91'
  d.cats = { unlocked: true, eventSeen: true, rewardGiven: true }
  d.tizzzz = { unlocked: true, eventSeen: true, rewardGiven: true }
  delete d.story
  delete d.blessings
  mem.setItem(KEY, JSON.stringify(d))
  const P2 = createProgress(D, mem)
  const b = P2.boot()
  const n = b.data
  ok(b.supplied.join() === 'skulltown,desert,snow' && n.story.news.join() === 'skulltown,desert,snow', `it is given what chapters 15, 20 and 25 now bring (${b.supplied.join(', ')}), and told so once`)
  ok(n.blessings.phoenix && n.blessings.snow && !n.blessings.thunder && !n.blessings.final, 'the phoenix gem and the snow blessing; not yet thunder (chapter 30)')
  const late = n.inventory.slice(d.inventory.length)
  ok(late.map((it) => it.grade).join() === 'SS,SS,SSS' && n.inventory.slice(0, d.inventory.length).every((it, i) => it.id === d.inventory[i].id), 'no ball of 5 or 10 given again (its S and SS came from the old stories); the balls of 15, 20 and 25 come (SS, SS, SSS)')
  ok(n.equippedInstanceId === late[2].id, 'the SSS ball beats its equipped SS and is equipped')
  ok(n.cats.unlocked && n.tizzzz.unlocked && n.turret.unlocked && n.rerolls === 8 && n.story.rewards.includes('deepforest'), 'the cats and Tizzzz stay (its old Tizzzz event counts as chapter 10\'s reward); the rerolls of 5, 10, 15 and 20 come, and the turret')
  ok(['ep01_clear', 'ep02_clear', 'ep03_clear', 'ep04_clear', 'snow_3'].every((id) => n.story.seen.includes(id)) && !n.story.seen.includes('sky_4') && !n.story.seen.includes('intro'), 'what it already played counts as seen (watchable in 설정); chapter 30 and on wait for it, and the opening plays to it once')
  P2.clearNews()
  const third = createProgress(D, mem).boot()
  ok(third.supplied.length === 0 && third.data.story.news.length === 0 && third.data.inventory.length === n.inventory.length, 'the next visit gives and tells nothing more')
}
// an even older save (from before the cats), past chapter 12: the S ball and
// the cats (chapter 5), Tizzzz and the SS ball (chapter 10) are made up
{
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.firstCleared = Array.from({ length: 12 }, (_, i) => i + 1)
  d.unlockedChapter = 13
  delete d.cats
  delete d.tizzzz
  delete d.story
  mem.setItem(KEY, JSON.stringify(d))
  const b = createProgress(D, mem).boot()
  ok(b.supplied.join() === 'forest,deepforest' && b.data.inventory.filter((it) => it.grade === 'S').length === 1 && b.data.inventory.filter((it) => it.grade === 'SS').length === 1 && b.data.cats.unlocked && b.data.tizzzz.unlocked && b.data.rerolls === 4, 'it gets the S ball, the cats (5), Tizzzz, the SS ball (10) and 4 rerolls, once')
  ok(b.data.story.seen.includes('ep01_clear') && b.data.story.seen.includes('ep02_clear') && !b.data.story.seen.includes('ep03_clear'), 'what it played (to chapter 12) counts as seen; chapter 15\'s cutscenes still play')
}
// in battle: from their chapter on, with the cats; the magnet makes room for 냥냥 연금술
{
  const C = B.cats
  const r5 = newRun({ chapter: B.cats.activeFromChapter - 1, cats: true })
  ok(r5.cats.length === 0 && r5.pool.includes('pickup') && !r5.pool.includes('nyang'), `chapter ${B.cats.activeFromChapter - 1} (cats unlocked): no cats yet, the magnet card is there`)
  const r6n = newRun({ chapter: B.cats.activeFromChapter, cats: false })
  ok(r6n.cats.length === 0 && r6n.pool.includes('pickup'), `chapter ${B.cats.activeFromChapter} without the cats: unchanged`)
  const r6 = newRun({ chapter: B.cats.activeFromChapter, cats: true, seed: 21 })
  ok(r6.cats.length === 3 && r6.cats.map((c) => c.id).join() === D.cats.companions.map((c) => c.id).join(), `chapter ${C.activeFromChapter} with the cats: ${D.cats.companions.map((c) => c.name).join(', ')} come along`)
  ok(!r6.pool.includes('pickup') && r6.pool.includes('nyang') && r6.pool.length === r6n.pool.length + 5, `the magnet's place goes to 냥냥 연금술, and the five cat cards join (${r6.pool.length} cards, 3 shown)`)
  let shown = 0
  let seen = 0
  for (let i = 0; i < 4000; i++) {
    const c = drawChoices(r6)
    if (c.length !== 3 || new Set(c).size !== 3 || c.includes('pickup')) shown++
    if (c.includes('nyang')) seen++
  }
  // (with no friend cat yet, four of the cat cards wait: 17 can come up)
  ok(shown === 0 && Math.abs(seen / 4000 - 3 / 17) < 0.03, `three different cards, never the magnet; 냥냥 연금술 comes up like any card (${((seen / 4000) * 100).toFixed(1)}%)`)
  // its five levels, from the table
  const T = B.upgrades.effects.nyang.levels
  for (let L = 1; L <= T.length; L++) {
    r6.state = 'levelup'; r6.pending = 1; r6.choices = ['nyang', 'count', 'damage']; r6.choiceSeq++
    choose(r6, 'nyang', r6.choiceSeq)
  }
  ok(r6.nyang === T.length && maxed(r6, 'nyang'), `냥냥 연금술 goes up to Lv.${T.length}`)
  let after = 0
  for (let i = 0; i < 2000; i++) if (drawChoices(r6).includes('nyang')) after++
  ok(after === 0, 'at its last level it no longer comes up')
}
// the cats fetch coins and experience: run there, picked up as by Mano
{
  const run = newRun({ chapter: B.cats.activeFromChapter, cats: true, seed: 5 })
  run.spawnT = -1e9
  run.nextEvent = 9
  run.xp = -1e15 // no level-up pauses
  const p = run.player
  p.pickupR = 0 // Mano picks nothing up herself
  const far = [[40, 120], [320, 120], [40, 600], [320, 600], [180, 110], [180, 610]]
  // (the experience is kept from flying to Mano by itself, to see the cats at work)
  for (const [x, y] of far) run.orbs.push({ kind: 'coin', x, y, v: 5, pull: false }, { kind: 'xp', x: x + 4, y, v: 7, pull: false, age: -1e9 })
  const coins0 = run.coins
  const xp0 = run.xp
  let distinct = true
  let t = 0
  for (; t < 20 && run.orbs.some((o) => o.kind === 'coin' || o.kind === 'xp'); t += FIXED) {
    step(run, FIXED, still)
    const tg = run.cats.map((c) => c.target).filter(Boolean)
    if (new Set(tg).size !== tg.length) distinct = false
  }
  ok(!run.orbs.some((o) => o.kind === 'coin' || o.kind === 'xp') && run.stats.catPicks === 12, `the cats ran to all 12 pickups across the field and took them (${t.toFixed(1)} s; Mano stood still)`)
  ok(near(run.coins - coins0, 6 * 5 * p.coinMul) && near(run.xp - xp0, 6 * 7 * p.xpMul), 'coins and experience count exactly as when Mano picks them up')
  ok(distinct, 'never two cats after the same pickup')
  ok(Math.hypot(p.x - 180, p.y - (B.logicalArena.bounds[1] + B.logicalArena.bounds[3]) / 2 - 40) < 1e-9 && p.hp === p.maxHp, 'Mano was not moved or hurt by them')
  ok(run.cats.every((c) => !('hp' in c)), 'cats have no HP: nothing can hurt them')
}
// a pile goes in one sweep: everything within a cat's magnet flies to it
{
  const run = newRun({ chapter: B.cats.activeFromChapter, cats: true, seed: 8 })
  run.spawnT = -1e9
  run.nextEvent = 9
  run.xp = -1e15
  run.player.pickupR = 0
  for (let i = 0; i < 30; i++) run.orbs.push({ kind: i % 3 ? 'xp' : 'coin', x: 300 + (i % 6) * 6, y: 140 + Math.floor(i / 6) * 6, v: 1, pull: false, age: -1e9 })
  run.orbs.push({ kind: 'heal', x: 320, y: 150, v: 20, pull: false })
  let t = 0
  for (; t < 10 && run.orbs.some((o) => o.kind === 'coin' || o.kind === 'xp'); t += FIXED) step(run, FIXED, still)
  ok(!run.orbs.some((o) => o.kind === 'coin' || o.kind === 'xp') && run.stats.catPicks === 30 && t < 3, `a pile of 30 is swept up in ${t.toFixed(1)} s (one run there, not 30 trips)`)
  ok(run.orbs.some((o) => o.kind === 'heal'), 'a heart is never pulled in (without 냥냥 연금술 it stays where it is)')
}
// 냥냥 연금술: a normal heart becomes 퍼센트 하트; those are never turned again
{
  const T = B.upgrades.effects.nyang.levels
  const heartRun = (L) => {
    const run = newRun({ chapter: B.cats.activeFromChapter, cats: true, seed: 9 })
    run.spawnT = -1e9
    run.nextEvent = 9
    run.xp = -1e15
    run.player.pickupR = 0
    for (let i = 0; i < L; i++) {
      run.state = 'levelup'; run.pending = 1; run.choices = ['nyang', 'count', 'damage']; run.choiceSeq++
      choose(run, 'nyang', run.choiceSeq)
    }
    run.orbs.push({ kind: 'heal', x: 60, y: 140, v: B.drops.healAmount, pull: false })
    for (let t = 0; t < 6; t += FIXED) step(run, FIXED, still)
    return run
  }
  const r0 = heartRun(0)
  ok(r0.orbs.some((o) => o.kind === 'heal') && !r0.orbs.some((o) => o.kind === 'pheal'), 'without 냥냥 연금술 the cats leave hearts alone')
  for (let L = 1; L <= T.length; L++) {
    const r = heartRun(L)
    const ph = r.orbs.filter((o) => o.kind === 'pheal')
    const apart = ph.every((a, i) => ph.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > 6))
    ok(!r.orbs.some((o) => o.kind === 'heal') && ph.length === T[L - 1].hearts && ph.every((o) => o.v === T[L - 1].share) && apart, `Lv.${L}: one heart eaten → ${T[L - 1].hearts} 퍼센트 하트 of ${T[L - 1].share * 100}% each, not on top of each other`)
  }
  // 퍼센트 하트 lying around for a long time: no cat ever eats or carries them
  const r = heartRun(T.length)
  const n0 = r.orbs.filter((o) => o.kind === 'pheal').length
  for (let t = 0; t < 30; t += FIXED) step(r, FIXED, still)
  ok(r.orbs.filter((o) => o.kind === 'pheal').length === n0 && r.stats.catEats === 1, `30 s later the same ${n0} 퍼센트 하트 lie there: never turned again, never picked up by a cat`)
  // Mano picks one up: a share of her maximum HP, never past it
  for (const maxHp of [1000, 10000]) {
    const run = newRun({ chapter: B.cats.activeFromChapter, cats: true })
    run.spawnT = -1e9
    run.player.maxHp = maxHp
    run.player.hp = maxHp / 2
    run.orbs.push({ kind: 'pheal', x: run.player.x, y: run.player.y, v: 0.02, pull: false })
    step(run, FIXED * 2, still)
    ok(near(run.player.hp, maxHp / 2 + maxHp * 0.02, 1e-6), `a 2% 퍼센트 하트 at max HP ${maxHp} heals ${maxHp * 0.02}`)
  }
  const full = newRun({ chapter: B.cats.activeFromChapter, cats: true })
  full.spawnT = -1e9
  full.orbs.push({ kind: 'pheal', x: full.player.x, y: full.player.y, v: 0.04, pull: false })
  step(full, FIXED * 2, still)
  ok(full.player.hp === full.player.maxHp, 'at full HP it heals nothing past the maximum')
  ok(B.drops.healChance === 0.005, 'the normal heart drop chance is unchanged')
}
// Mano can stand still: the cats bring in nearly everything, and fast (their
// way of fetching, measured at chapter 8 where it was tuned: they are let in
// there for this check only)
{
  const from = B.cats.activeFromChapter
  B.cats.activeFromChapter = 6
  const run = newRun({ chapter: 8, cats: true, grade: 'SS', seed: 4, perma: { hp: 40, damage: 50, interval: 50, crit: 40 } })
  B.cats.activeFromChapter = from
  run.player.hp = run.player.maxHp = 1e15
  const born = new Map()
  let dropped = 0
  let byCats = 0
  const waits = []
  for (let i = 0; i < 90 * 60; i++) {
    if (run.state === 'levelup') choose(run, run.choices[0], run.choiceSeq)
    for (const o of run.orbs) if ((o.kind === 'xp' || o.kind === 'coin') && !born.has(o)) born.set(o, run.t), dropped++
    const before = run.orbs.slice()
    step(run, FIXED, still)
    for (const o of before) if (o.byCat && born.has(o) && !run.orbs.includes(o)) byCats++, waits.push(run.t - born.get(o)), born.delete(o)
  }
  waits.sort((a, b) => a - b)
  const lying = run.orbs.filter((o) => (o.kind === 'xp' || o.kind === 'coin') && run.t - born.get(o) > 2).length
  // (since Mano's magnet grew to pickupRadius, asked for, she takes most of
  // what falls near her herself; the cats fetch the rest, the far ones)
  ok(byCats / dropped > 0.08 && lying <= 2 && waits[waits.length >> 1] < 1, `90 s with Mano standing still: the cats took ${((100 * byCats) / dropped).toFixed(0)}% of ${dropped} coins and gems (Mano's magnet the rest), half within ${waits[waits.length >> 1].toFixed(2)} s; ${lying} left lying over 2 s`)
}
// later chapters: the middle and end of a run push harder, coming in step by step
{
  const L = B.lateGame
  const W = L.writer
  // Tizzzz's answer counts from her chapter on
  const wOn = (ch, m) => (ch >= W.fromChapter ? m : 1)
  const wl = W.hp.length - 1
  const at = (chapter, t) => {
    const run = newRun({ chapter })
    run.t = t
    return lateGame(run)
  }
  const last = B.chapter.phases[B.chapter.phases.length - 1].from + 1
  ok(at(L.fromChapter - 1, last).hp === 1 && at(1, last).damage === 1, `before chapter ${L.fromChapter}: nothing changes`)
  const mid = at(L.fromChapter + 2, last)
  const full = at(L.fullAtChapter, last)
  const later = at(L.fullAtChapter + 10, last)
  ok(mid.hp > 1 && mid.hp < full.hp && near(full.hp, L.hp[L.hp.length - 1] * wOn(L.fullAtChapter, W.hp[wl])) && near(later.hp, L.hp[L.hp.length - 1] * wOn(L.fullAtChapter + 10, W.hp[wl])) && near(full.specialHp('boss'), L.specialHp.boss * wOn(L.fullAtChapter, W.specialHp.boss)), `the end of a run: monster HP ×${mid.hp.toFixed(1)} at chapter ${L.fromChapter + 2}, ×${full.hp} from chapter ${L.fullAtChapter} on (boss ×${full.specialHp('boss')}, mid-boss ×${full.specialHp('brute')}, thief only ×${full.specialHp('thief')})`)
  const run = newRun({ chapter: L.fullAtChapter, seed: 3 })
  run.spawnT = -1e9
  run.t = last
  run.nextEvent = 2
  step(run, FIXED * 2, still)
  const boss = run.boss
  ok(boss && near(boss.maxHp, B.enemies.boss.hp * run.factor.hp * L.specialHp.boss * wOn(L.fullAtChapter, W.specialHp.boss), 1e-6 * boss.maxHp) && near(boss.damage, B.enemies.boss.damage * run.factor.damage * L.damage[L.damage.length - 1] * wOn(L.fullAtChapter, W.damage[wl]) * (L.fullAtChapter >= L.bossGuard.fromChapter ? L.bossGuard.hits : 1), 1e-9 * boss.damage), 'the boss there: its own HP and hit times the late push (and its guard\'s harder hits)')
  // Tizzzz's answer: from her chapter on, once more per phase on top
  const k = Math.min(1, (W.fromChapter - L.fromChapter + 1) / (L.fullAtChapter - L.fromChapter + 1))
  const before = at(W.fromChapter - 1, last)
  const from = at(W.fromChapter, last)
  const k0 = Math.min(1, (W.fromChapter - L.fromChapter) / (L.fullAtChapter - L.fromChapter + 1))
  ok(near(before.hp, L.hp[wl] ** k0) && near(from.hp, L.hp[wl] ** k * W.hp[wl]) && near(from.damage, L.damage[wl] ** k * W.damage[wl]) && near(from.specialHp('boss'), L.specialHp.boss ** k * W.specialHp.boss) && from.specialHp('thief') === before.specialHp('thief') * W.specialHp.thief, `from chapter ${W.fromChapter} (Tizzzz) the end of a run gets ×${W.hp[wl]} HP and ×${W.damage[wl]} hits more, boss and mid-boss ×${W.specialHp.boss}, the thief ×${W.specialHp.thief}; chapter ${W.fromChapter - 1} has none of it`)
  const early = at(W.fromChapter, 0)
  ok(near(early.hp, L.hp[0] ** k * W.hp[0]) && W.hp[0] === 1, 'the first seconds of a run are left as they were')
}
// the skull king's guard: from its chapter on it loses at most maxShare of its
// HP a second, whatever hits it, and hits harder; never before that chapter
{
  const G = B.lateGame.bossGuard
  const kingAt = (chapter) => {
    const run = newRun({ chapter, seed: 5 })
    run.spawnT = -1e9
    run.t = B.chapter.phases[B.chapter.phases.length - 1].from + 0.5
    run.nextEvent = 2
    step(run, FIXED * 2, still)
    run.boss.state = 'live'
    return run
  }
  const run = kingAt(G.fromChapter)
  const b = run.boss
  run.hurt(b, b.maxHp * 100, b.x, b.y)
  const first = 1 - b.hp / b.maxHp
  run.hurt(b, b.maxHp * 100, b.x, b.y)
  const again = 1 - b.hp / b.maxHp
  run.t += 1
  run.hurt(b, b.maxHp * 100, b.x, b.y)
  const later = 1 - b.hp / b.maxHp
  ok(near(first, G.maxShare * G.burst, 1e-9) && near(again, first, 1e-9) && near(later, first + G.maxShare, 1e-9) && b.state === 'live', `chapter ${G.fromChapter}: a hit of 100× its HP takes ${(first * 100).toFixed(1)}% off the skull king, the next in the same instant nothing, one a second later ${(G.maxShare * 100).toFixed(0)}% more (a fight of at least ${(1 / G.maxShare).toFixed(0)} s)`)
  const plain = kingAt(G.fromChapter - 1)
  const pb = plain.boss
  const hitOf = (r) => r.boss.damage / (B.enemies.boss.damage * r.factor.damage * lateGame(r).damage)
  const mulOf = (r) => r.boss.damageMul / (r.factor.damage * lateGame(r).damage)
  ok(near(hitOf(run), G.hits) && near(mulOf(run), G.hits) && near(hitOf(plain), 1) && near(mulOf(plain), 1), `from chapter ${G.fromChapter} the king hits ×${G.hits} harder (body, charge, slam); chapter ${G.fromChapter - 1} as before`)
  plain.hurt(pb, pb.maxHp * 100, pb.x, pb.y)
  ok(!pb.guard && pb.state === 'down', `chapter ${G.fromChapter - 1}: no guard, a big enough hit fells it`)
}
// the 'human' bot weighs Tizzzz's card: an edited HP card does not beat
// plain damage, but it beats a plain card a few places lower
{
  const run = newRun({ chapter: 12, seed: 2 })
  run.state = 'levelup'
  run.choiceSeq = 7
  run.choices = ['maxHp', 'damage', 'size']
  run.edit = { id: 'maxHp', seq: 7 }
  const a = pick(run, 'human')
  run.choices = ['maxHp', 'interval', 'size']
  const b2 = pick(run, 'human')
  ok(a === 'damage' && b2 === 'maxHp', `human picks: plain damage over edited HP (${a}); edited HP over plain interval (${b2})`)
}

// ── the writer Tizzzz ───────────────────────────────────────────────────────
// her rewrite: from her chapter on, at every level-up, one card does its effect twice
{
  const T = B.tizzzz
  ok(!newRun({ chapter: T.activeFromChapter - 1, tizzzz: true }).writer && !newRun({ chapter: T.activeFromChapter, tizzzz: false }).writer && newRun({ chapter: T.activeFromChapter, tizzzz: true }).writer, `she rewrites from chapter ${T.activeFromChapter}, once she has joined`)
  const run = newRun({ chapter: T.activeFromChapter, tizzzz: true, cats: true, seed: 12 })
  run.spawnT = -1e9
  let sets = 0
  let marked = 0
  let inChoices = true
  for (let i = 0; i < 300; i++) {
    run.orbs.push({ kind: 'xp', x: run.player.x, y: run.player.y, v: run.need, pull: false })
    step(run, FIXED * 2, still)
    if (run.state !== 'levelup') continue
    sets++
    if (run.edit && run.edit.seq === run.choiceSeq) marked++
    if (run.edit && !run.choices.includes(run.edit.id)) inChoices = false
    // pick a card that is not the rewritten one, so its normal effect is checked too
    choose(run, run.choices.find((c) => !isEdited(run, c, run.choiceSeq)) || run.choices[0], run.choiceSeq)
  }
  ok(sets > 50 && marked === sets && inChoices, `every level-up (${sets}): one of its three cards is rewritten`)
  // the rewritten card applies the same calculation twice, both on the card and in the run
  const E = B.upgrades.effects
  const check = (id, read) => {
    const r = newRun({ chapter: T.activeFromChapter, tizzzz: true, seed: 2 })
    r.state = 'levelup'; r.pending = 1; r.choices = [id, 'maxHp', 'pickup']; r.choiceSeq++
    r.edit = { id, seq: r.choiceSeq }
    const before = read(r)
    const preview = previewTimes(r, id, T.times)
    choose(r, id, r.choiceSeq)
    return { before, after: read(r), preview, picks: r.picks[id] }
  }
  const c = check('count', (r) => r.weapon.count)
  ok(c.after === c.before * E.count.mul ** 2 && c.preview.count === c.after && c.picks === 2, `탱탱볼 개수: ×${E.count.mul} rewritten → ×${E.count.mul ** 2} (${c.before} → ${c.after}), counted as two picks`)
  const iv = check('interval', (r) => r.weapon.interval)
  ok(near(iv.after, iv.before * E.interval.mul ** 2) && near(iv.preview.interval, iv.after), `공격 주기: ×${E.interval.mul} → ×${fmt2(E.interval.mul ** 2)}`)
  const dm = check('damage', (r) => r.weapon.damage)
  ok(near(dm.after, dm.before * E.damage.mul ** 2), `공격 피해: ×${E.damage.mul} → ×${E.damage.mul ** 2}`)
  const cr = check('crit', (r) => r.weapon.critChance)
  ok(near(cr.after, cr.before + E.crit.add * 2), `치명타: +${E.crit.add * 100}%p → +${E.crit.add * 200}%p`)
  const hp = check('maxHp', (r) => r.player.maxHp)
  ok(near(hp.after, hp.before * E.maxHp.mul ** 2), `최대 체력: ×${E.maxHp.mul} → ×${fmt2(E.maxHp.mul ** 2)}`)
  // a card not rewritten works as before, and a stale tap never gets the rewrite
  const r2 = newRun({ chapter: T.activeFromChapter, tizzzz: true, seed: 2 })
  r2.state = 'levelup'; r2.pending = 1; r2.choices = ['count', 'damage', 'pickup']; r2.choiceSeq++
  r2.edit = { id: 'damage', seq: r2.choiceSeq }
  choose(r2, 'count', r2.choiceSeq)
  ok(r2.weapon.count === E.count.mul && r2.picks.count === 1, 'the other cards keep their normal effect')
  // a card with levels too close to its last is never rewritten; none left: no rewrite, no error
  const r3 = newRun({ chapter: T.activeFromChapter, tizzzz: true, cats: true, seed: 2 })
  r3.picks.nyang = B.upgrades.effects.nyang.levels.length - 1
  ok(!canEdit(r3, 'nyang') && canEdit(r3, 'count'), '냥냥 연금술 one level from its last cannot be rewritten')
  r3.pool = ['nyang']
  r3.picks.nyang = B.upgrades.effects.nyang.levels.length - 1
  r3.orbs.push({ kind: 'xp', x: r3.player.x, y: r3.player.y, v: r3.need, pull: false })
  r3.spawnT = -1e9
  step(r3, FIXED * 2, still)
  ok(r3.state === 'levelup' && r3.edit === null, 'with nothing that can be rewritten the cards just show as they are')
}

// the cats cost little with a full screen
{
  const make = (cats) => {
    const run = newRun({ chapter: B.cats.activeFromChapter, cats, seed: 33 })
    run.player.hp = run.player.maxHp = 1e12
    run.xp = -1e15
    run.t = 185
    run.nextEvent = 9
    for (let i = 0; i < 300; i++) run.orbs.push({ kind: i % 2 ? 'xp' : 'coin', x: 20 + ((i * 37) % 320), y: 100 + ((i * 53) % 500), v: 1, pull: false })
    for (let i = 0; i < 8; i++) run.orbs.push({ kind: 'heal', x: 30 + i * 40, y: 300, v: 20, pull: false })
    return run
  }
  const time = (cats) => {
    const run = make(cats)
    if (cats) run.nyang = 5
    const t0 = performance.now()
    for (let i = 0; i < 600; i++) step(run, FIXED, still)
    return { ms: (performance.now() - t0) / 600, run }
  }
  time(true)
  const a = time(false)
  const b = time(true)
  ok(b.ms < a.ms + 0.5, `10 s with 300 pickups and a full screen: ${a.ms.toFixed(3)} ms a step without cats, ${b.ms.toFixed(3)} ms with them (${b.run.enemies.length} monsters, ${b.run.stats.catPicks || 0} pickups fetched)`)
}

// ── the 84-image story package: the map, the regions, the blessings ─────────
{
  const fs = await import('fs')
  const A = D.storyAssets.images
  // (the soft lobby copies, Tizzzz's face and the PC game's wide grounds are
  // made from these originals, not originals of their own)
  // (MANO_EP01's, MANO_CH10_CUTSCENES', MANO_CH15_CUTSCENES' and
  // MANO_CH20_CUTSCENES' pictures, ep01–ep04-assets.json, are merged in: they
  // are apart)
  // (and the opening's wide pictures, made from four of these: intro_*)
  const fromPackage = A.filter((x) => !['backdrop', 'portrait', 'background-wide', 'backdrop-wide'].includes(x.kind) && !x.file.startsWith('ep01/') && !x.file.startsWith('ep02/') && !x.file.startsWith('ep03/') && !x.file.startsWith('ep04/') && !x.id.startsWith('intro_'))
  const kinds = (k) => fromPackage.filter((x) => x.kind === k).length
  ok(fromPackage.length === 84 && new Set(fromPackage.map((x) => x.source)).size === 84, `the map holds all 84 originals once (${kinds('monster')} monsters, ${kinds('cutscene')} cutscenes, ${kinds('background')} backgrounds, ${kinds('reward')} rewards, ${kinds('companion')} companions)`)
  ok(kinds('monster') === 35 && kinds('cutscene') === 29 && kinds('background') === 7 && kinds('reward') === 10 && kinds('companion') === 3, '35 / 29 / 7 / 10 / 3, as the package says')
  const missing = A.filter((x) => !fs.existsSync(new URL('../src/survivor/assets/s84/' + x.file, import.meta.url)))
  ok(missing.length === 0, `every game file the map names is there (${A.length} files)${missing.length ? ': missing ' + missing.map((x) => x.file).join(', ') : ''}`)
  const ids = new Set(A.map((x) => x.id))
  const S = D.story
  // only wide (16:9) cuts are played (asked for: the tall ones taken out);
  // the opening is the first four of 작은 숲, made wide
  const used = S.cutscenes.groups.flatMap((g) => g.cuts.map((c) => c.image))
  const wideCut = (id) => {
    const x = A.find((y) => y.id === id)
    return x && x.kind === 'cutscene' && x.out[0] / x.out[1] > 1.7
  }
  ok(used.length === 24 && new Set(used).size === 24 && used.every(wideCut), `every cutscene played is wide (16:9), each once: the opening's 4 and chapters 5, 10, 15 and 20's five each (${used.length})`)
  const intro = S.cutscenes.groups[0]
  ok(intro.id === 'intro' && intro.when === 'launch' && intro.cuts.map((c) => c.image).join() === 'intro_1,intro_2,intro_3,intro_4' && intro.cuts.map((c) => A.find((x) => x.id === c.image).name).join() === '창밖으로날아간공,모험출발,숲속친구들,숲의괴물등장' && intro.cuts.every((c) => c.text && A.find((x) => x.id === c.image).width / A.find((x) => x.id === c.image).height > 1.7), "the opening (played as the game first opens): 작은 숲's first four cuts, painted wide, with Mano's lines")
  ok(near(B.chapters[0].hp, 0.4) && B.chapters[0].hp < B.chapters[1].hp / 3, `chapter 1's monsters: HP ×${B.chapters[0].hp} (halved, asked for)`)
  ok(S.cutscenes.groups.filter((g) => !g.cuts.length).map((g) => `${g.id}:${g.reward}`).join() === 'snow_3:snow,sky_4:sky,castle_3:castle' && S.cutscenes.groups.filter((g) => !g.cuts.length).every((g) => g.when === 'clear'), "chapters 25, 30 and 35 lost their tall cuts but keep their reward's popup after the clear")
  ok(S.cutscenes.groups.every((g) => ['launch', 'clear'].includes(g.when)) && !S.cutscenes.groups.some((g) => g.cuts.some((c) => c.layout)), 'every cutscene is the opening or a clear; none keeps its words apart (every wide cut fills the screen)')
  const rr = S.regions.map((r) => `${r.from}-${r.to}`).join()
  ok(rr === '1-5,6-10,11-15,16-20,21-25,26-30,31-35' && S.regions.every((r) => ids.has(r.background) && A.find((x) => x.id === r.background).region === r.id), `7 regions of 5 chapters (${rr}), each with its own background`)
  const roles = ['imp', 'spider', 'slime', 'bone_beast', 'brute', 'boss']
  ok(S.regions.every((r) => roles.every((k) => r.skins[k] && ids.has(r.skins[k]) && A.find((x) => x.id === r.skins[k]).region === r.id)), 'every role in every region wears a monster of that region')
  const placed = new Set(S.regions.flatMap((r) => [...Object.values(r.skins), ...(r.friends || [])]))
  ok(A.filter((x) => x.kind === 'monster').every((x) => placed.has(x.id)), 'all 35 monsters are placed (33 as enemies, the phoenix and the snow guardian as friends)')
  ok(!Object.values(S.regions.find((r) => r.id === 'snow').skins).includes('snowguardian'), 'the snow guardian never fights Mano')
  ok(regionOf(D, 1).id === 'forest' && regionOf(D, 5).id === 'forest' && regionOf(D, 6).id === 'deepforest' && regionOf(D, 35).id === 'castle' && regionOf(D, 60).id === 'castle', 'chapters 1–5 are 작은 숲 … 31–35 마왕성; past 35 the fight goes on in 마왕성')
  ok(Object.values(S.rewards).filter((r) => r.chapter).every((r) => r.images.every((id) => ids.has(id))), 'every reward picture is in the map')
  // in battle: monsters wear their region's look, the fight's numbers are the role's
  const r1 = newRun({ chapter: 3, seed: 3 })
  const r28 = newRun({ chapter: 28, seed: 3 })
  for (let i = 0; i < 180; i++) step(r1, FIXED, still), step(r28, FIXED, still), (r1.events.length = r28.events.length = 0)
  const e1 = r1.enemies.find((e) => e.type === 'imp')
  const e28 = r28.enemies.find((e) => e.type === 'imp')
  ok(e1 && e28 && e1.skin === 'sprout' && e28.skin === 'griffin' && e1.r === e28.r && e1.r === B.enemies.imp.radius, `an imp is a 새싹요정 in 작은 숲 and a 그리핀 in the sky, with the same hit circle (${e1 && e1.r})`)
  ok(enemyName(D, regionOf(D, 15), 'boss') === '해골 왕' && enemyName(D, regionOf(D, 35), 'boss') === '마왕' && enemyName(D, regionOf(D, 3), 'thief') === B.enemies.thief.name, 'the boss is named by its region; the thief keeps its own art and name')
}
// the blessings: slow, freeze (never the boss), lightning that never chains,
// and at most perSecond of each however many balls fly
{
  const G = B.blessings
  const all = { phoenix: true, snow: true, thunder: true }
  const none = newRun({ chapter: 20, seed: 7 })
  ok(Object.keys(none.bless).length === 0 && !newRun({ chapter: 20, seed: 7, blessings: { phoenix: true } }).bless.snow, 'only what is owned is in the run')
  const run = newRun({ chapter: 20, seed: 7, blessings: all })
  run.rng = () => 0 // every chance comes up
  run.spawnT = -1e9
  const mk = (x, y, type = 'imp') => {
    const e = { id: run.nextId++, type, behavior: B.enemies[type].behavior, rank: B.enemies[type].rank || null, x, y, r: 10, hp: 1e9, maxHp: 1e9, speed: 40, damage: 5, damageMul: 1, state: 'live', t: 0, life: 0, hitT: 0, face: 1, mode: null, modeT: 0 }
    run.enemies.push(e)
    return e
  }
  const a = mk(100, 300)
  const b2 = mk(130, 300)
  const c = mk(160, 300)
  const far = mk(340, 600)
  run.grid.rebuild(run.enemies)
  const hp0 = b2.hp
  run.blessHit(a, 1000, a.x, a.y)
  ok(a.slowT > 0 && a.slowMul === G.phoenix.slow && a.freezeT > 0, `a hit slows (×${G.phoenix.slow} for ${G.phoenix.seconds} s) and freezes (${G.snow.seconds} s)`)
  ok(b2.hp < hp0 && c.hp < c.maxHp && far.hp === far.maxHp, `lightning strikes the nearest ${G.thunder.targets} within ${G.thunder.radius} px, not the far one`)
  const hits = run.stats.hits
  const x0 = a.x
  for (let i = 0; i < 30; i++) step(run, FIXED, still)
  ok(a.x === x0 || a.freezeT <= 0, 'frozen, it does not move')
  ok(run.stats.hits === hits, 'the lightning set off nothing more (no chain)')
  // a screen of balls: 5000 hits in one second
  const r2 = newRun({ chapter: 20, seed: 8, blessings: all })
  r2.rng = () => 0
  const e = (() => {
    const o = { id: 1, type: 'imp', behavior: 'chase', x: 100, y: 300, r: 10, hp: 1e30, maxHp: 1e30, speed: 40, damage: 5, damageMul: 1, state: 'live', t: 0, life: 0, hitT: 0, face: 1, mode: null, modeT: 0 }
    r2.enemies.push(o)
    return o
  })()
  r2.grid.rebuild(r2.enemies)
  let bolts = 0
  for (let i = 0; i < 60; i++) {
    for (let k = 0; k < 84; k++) r2.blessHit(e, 10, e.x, e.y)
    bolts += r2.events.filter((ev) => ev.type === 'bolt').length
    r2.events.length = 0
    r2.t += FIXED
    e.frozenAgain = 0
    r2.bless.thunder.tokens = Math.min(r2.bless.thunder.perSecond, r2.bless.thunder.tokens + r2.bless.thunder.perSecond * FIXED)
  }
  ok(bolts <= 2 * G.thunder.perSecond, `5040 hits in a second, every chance coming up: ${bolts} lightning strikes (at most about ${G.thunder.perSecond} a second)`)
  // the boss: never frozen, slowed instead
  const r3 = newRun({ chapter: 20, seed: 9, blessings: { snow: true } })
  r3.rng = () => 0
  const boss = { id: 1, type: 'boss', behavior: 'boss', rank: 'boss', x: 100, y: 300, r: 24, hp: 1e9, maxHp: 1e9, speed: 30, damage: 5, damageMul: 1, state: 'live', t: 0, life: 0, hitT: 0, face: 1, mode: null, modeT: 0 }
  r3.enemies.push(boss)
  r3.blessHit(boss, 10, boss.x, boss.y)
  ok(!(boss.freezeT > 0) && boss.slowT > 0 && boss.slowMul === G.snow.bossSlow, `the boss is never frozen: slowed ×${G.snow.bossSlow} for ${G.snow.bossSeconds} s instead`)
  ok(near(newRun({ chapter: 35, seed: 1, blessings: { ...all, final: true } }).bless.thunder.chance, G.thunder.chance * G.final.chanceMul), `마왕의 탱탱볼: every chance ×${G.final.chanceMul}`)
}

// ── the story ends at chapter 35 ────────────────────────────────────────────
{
  const L = lastChapter(D)
  ok(L === 35 && regionOf(D, 35).id === 'castle', `the last chapter is ${L}, the end of 마왕성`)
  // an old save that had gone past it: kept up to 35, nothing past it
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.unlockedChapter = 50
  d.firstCleared = Array.from({ length: 49 }, (_, i) => i + 1)
  d.bestResults = { 34: { cleared: true, time: 230, kills: 900, elites: 2 }, 40: { cleared: true, time: 230, kills: 990, elites: 2 } }
  d.currency = 1234
  mem.setItem(KEY, JSON.stringify(d))
  const b = createProgress(D, mem).boot().data
  ok(b.unlockedChapter === 35 && Math.max(...b.firstCleared) === 35 && b.firstCleared.length === 35 && !b.bestResults[40] && b.bestResults[34].kills === 900 && b.currency === 1234, 'a save past chapter 35 keeps chapters 1–35, its records and coins; chapters 36+ are gone')
  // clearing 35 opens nothing more
  const mem2 = new Mem()
  const P2 = createProgress(D, mem2)
  P2.boot()
  const d2 = P2.get()
  d2.unlockedChapter = 35
  d2.firstCleared = Array.from({ length: 34 }, (_, i) => i + 1)
  mem2.setItem(KEY, JSON.stringify(d2))
  const r = P2.startRun(35)
  P2.finishRun(r.runId, 35, { cleared: true, coins: 0, kills: 1, time: 230, elites: 2 })
  ok(P2.get().unlockedChapter === 35 && P2.get().firstCleared.includes(35), 'clearing chapter 35 marks it cleared and opens no chapter 36')
}

// ── the PC game: a field larger than its screen, a camera, the keys ─────────
{
  const M = D.balance.logicalArena
  const PC = D.balance.logicalArenaPc
  const U = D.ui.pc
  const [SW, SH] = U.logicalViewport
  const [l, t, r0, b0] = U.inset
  ok(PC.view[0] === SW - l - r0 && PC.view[1] === SH - t - b0, `the PC view is its ${SW} × ${SH} screen's play area (${PC.view.join(' × ')}), below the HUD bar (${U.hud.height} < ${t})`)
  const [px0, py0, px1, py1] = PC.bounds
  ok(px1 - px0 > PC.view[0] * 1.3 && py1 - py0 > PC.view[1] * 1.3, `the PC field (${px1 - px0} × ${py1 - py0}) is well larger than its view: the camera has room both ways`)
  const outside = Object.entries(U.hud).filter(([, b]) => Array.isArray(b) && (b[0] < 0 || b[1] < 0 || b[0] + b[2] > SW || b[1] + b[3] > SH))
  ok(outside.length === 0, `every PC HUD box is on the screen${outside.length ? ': ' + outside.map(([k]) => k).join(', ') : ''}`)
  // the keys: each alone, mixed, diagonals no faster, opposite keys cancel
  const len = (v) => Math.hypot(v.x, v.y)
  ok(Object.keys(MOVE_KEYS).every((k) => near(len(keyVector([k])), 1)), 'W A S D and the four arrows each move at full speed')
  const d = keyVector(['KeyW', 'KeyD'])
  ok(near(len(d), 1) && near(d.x, Math.SQRT1_2) && near(d.y, -Math.SQRT1_2), 'W+D: up-right, no faster than one key (normalized)')
  ok(near(len(keyVector(['KeyW', 'ArrowRight'])), 1) && keyVector(['KeyW', 'ArrowUp']).y === -1, 'arrows and WASD mix (W+→ diagonal; W+↑ is still one up)')
  const z = keyVector(['KeyA', 'KeyD'])
  ok(z.x === 0 && z.y === 0 && keyVector([]).x === 0 && keyVector(['KeyQ', 'Space']).x === 0, 'A+D cancel; no keys or other keys: standing still')
  // the phone: the view is the field, always (nothing moves)
  const m = newRun({ seed: 5 })
  ok(m.arena === M && m.view.join() === M.bounds.join() && m.player.x === (M.bounds[0] + M.bounds[2]) / 2, 'without a platform field it is the phone field, and the view is all of it')
  for (let i = 0; i < 300; i++) step(m, FIXED, { x: 1, y: -1 })
  ok(m.view.join() === M.bounds.join(), 'on the phone the view never moves')
  // the PC: the view centred on Mano, the camera following her, kept inside the field
  const r = newRun({ arena: PC, seed: 5 })
  const centred = (run) => near(run.view[0] + PC.view[0] / 2, run.player.x) && near(run.view[1] + PC.view[1] / 2, run.player.y)
  ok(r.player.x === PC.start[0] && r.player.y === PC.start[1] && centred(r), `Mano starts at the PC field's start (${PC.start}), the view around her`)
  for (let i = 0; i < 30; i++) step(r, FIXED, { x: 1, y: 0 })
  ok(centred(r), 'the view follows her')
  r.player.hp = r.player.maxHp = 1e9
  for (let i = 0; i < 1200; i++) {
    step(r, FIXED, { x: 1, y: -1 })
    if (r.state === 'levelup') choose(r, r.choices[0], r.choiceSeq)
  }
  ok(r.player.x > px1 - 20 && r.player.y < py0 + 20 && r.view[2] === px1 && r.view[1] === py0, `held up-right: she stops in the field's corner (${r.player.x.toFixed(1)}, ${r.player.y.toFixed(1)}), the view stops at its edges`)
  // monsters come in near her (the spawn box) and keep to the field (they may
  // be left out of sight); the balls bounce off the field's edges, not the
  // screen's (they fly on past it as the monsters stand there)
  const r2 = newRun({ arena: PC, seed: 8 })
  r2.player.hp = r2.player.maxHp = 1e9
  let far = 0
  let outField = 0
  let ballsOut = 0
  let ballsPastView = 0
  const seen = new Set()
  for (let i = 0; i < 60 * 40; i++) {
    step(r2, FIXED, { x: Math.sin(i / 200), y: Math.cos(i / 300) })
    const [vx0, vy0, vx1, vy1] = r2.view
    for (const e of r2.enemies) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        if (PC.spawnBox && (Math.abs(e.x - r2.player.x) > PC.spawnBox[0] / 2 + 40 || Math.abs(e.y - r2.player.y) > PC.spawnBox[1] / 2 + 40)) far++
      }
      if (e.state === 'live' && (e.x < px0 + e.r - 0.01 || e.x > px1 - e.r + 0.01 || e.y < py0 + e.r - 0.01 || e.y > py1 - e.r + 0.01)) outField++
    }
    for (const b of r2.balls) {
      if (b.x < px0 - 0.01 || b.x > px1 + 0.01 || b.y < py0 - 0.01 || b.y > py1 + 0.01) ballsOut++
      if (b.x < vx0 - 0.01 || b.x > vx1 + 0.01 || b.y < vy0 - 0.01 || b.y > vy1 + 0.01) ballsPastView++
    }
    if (r2.state === 'levelup') choose(r2, r2.choices[0], r2.choiceSeq)
  }
  ok(seen.size > 20 && far === 0, `40 s walking about the PC field: ${seen.size} monsters came in, ${PC.spawnBox ? `all within the ${PC.spawnBox.join(' × ')} spawn box around Mano` : 'all at the view'}${far ? ` (${far} farther)` : ''}`)
  ok(outField === 0 && ballsOut === 0 && ballsPastView > 0, `no monster and no ball ever left the field; balls flew on past the screen's edge (${ballsPastView} ball-steps), not bounced off it${outField || ballsOut ? ` (${outField} monster-steps, ${ballsOut} ball-steps out)` : ''}`)
  // walking away, the monsters stay where they are in the field (they used
  // to be held in the view, so the camera dragged them after her)
  const r3 = newRun({ arena: PC, seed: 3 })
  r3.player.hp = r3.player.maxHp = 1e9
  r3.player.inv = 1e9
  r3.spawnT = -1e9
  r3.player.x = 500
  step(r3, FIXED, still)
  const left = spawnAt(r3, 'imp', { x: r3.view[0] + 30, y: r3.player.y })
  let moved = 0
  for (let i = 0; i < 60 * 4; i++) {
    r3.fireT = 1e9
    const x = left.x
    step(r3, FIXED, { x: 1, y: 0 })
    moved = Math.max(moved, left.x - x)
  }
  const pace = B.enemies.imp.speed * B.chapter.phases[0].speedMultiplier * FIXED
  ok(left.state === 'live' && left.x < r3.view[0] - 100 && moved < pace + 0.6, `PC: Mano walks away right; a monster at the view's left edge is left behind out of sight (${(r3.view[0] - left.x).toFixed(0)} px past the edge), never pulled faster than its own pace`)
  const m3 = newRun({ seed: 3 })
  const ml = spawnAt(m3, 'imp', { x: M.bounds[0] + 20, y: M.bounds[3] - 20 })
  for (let i = 0; i < 30; i++) (m3.fireT = 1e9), step(m3, FIXED, still)
  ok(ml.x >= M.bounds[0] + ml.r && ml.y <= M.bounds[3] - ml.r, 'on the phone the field is the view: monsters still keep inside it')
}
// the PC thief: comes from any side, a little past the view, may roam out of
// sight but never out of the field
{
  const PC = B.logicalArenaPc
  const sides = new Set()
  let inField = true
  let outside = 0
  let mobileTop = true
  for (let seed = 1; seed <= 24; seed++) {
    const r = createRun(D, { chapter: 1, weaponId: 'bouncy_ball', grade: 'D', seed, arena: PC })
    r.player.hp = r.player.maxHp = 1e12
    r.t = 69.99
    r.nextEvent = 0
    step(r, FIXED * 2, still)
    const th = r.elites.elite1
    const [vx0, vy0, vx1, vy1] = r.view
    const a = Math.atan2(th.y - r.player.y, th.x - r.player.x)
    sides.add(Math.round((a / Math.PI) * 2 + 4) % 4)
    if (th.x < vx0 || th.x > vx1 || th.y < vy0 || th.y > vy1) outside++
    for (let i = 0; i < 60 * 25; i++) {
      r.fireT = 1e9
      r.player.inv = 1e9
      step(r, FIXED, { x: Math.sin(i / 90), y: Math.cos(i / 130) })
      if (r.state === 'levelup') choose(r, r.choices[0], r.choiceSeq)
      const [bx0, by0, bx1, by1] = PC.bounds
      if (th.state === 'live' && (th.x < bx0 + th.r - 0.01 || th.x > bx1 - th.r + 0.01 || th.y < by0 + th.r - 0.01 || th.y > by1 - th.r + 0.01)) inField = false
    }
    const m = createRun(D, { chapter: 1, weaponId: 'bouncy_ball', grade: 'D', seed })
    m.t = 69.99
    m.nextEvent = 0
    step(m, FIXED * 2, still)
    if (m.elites.elite1.y > m.view[1] + 60) mobileTop = false
  }
  ok(sides.size === 4 && outside >= 18, `PC: the thief comes from every side of Mano (${sides.size} of 4 quarters), past the view's edge (${outside}/24)`)
  ok(inField, 'PC: roaming out of sight, it never leaves the field (always reachable)')
  ok(mobileTop, 'the phone: the thief still comes in at the top, as before')
}

// ── 마계 침공 (chapters 26–30): the sky's monsters left alive turn ─────────
{
  const C = B.corruption
  const chs = [26, 27, 28, 29, 30]
  const S = chs.map((ch) => corruptionOf(D, ch))
  ok(!corruptionOf(D, 25) && !corruptionOf(D, 31) && S.every(Boolean) && regionOf(D, 26).id === 'sky' && regionOf(D, 30).id === 'sky', 'the invasion: chapters 26–30 only (the sky), none before or after')
  const up = (f) => S.every((c, i) => !i || f(c) >= f(S[i - 1]))
  const down = (f) => S.every((c, i) => !i || f(c) <= f(S[i - 1]))
  ok(up((c) => c.share) && up((c) => c.cap) && up((c) => c.rift) && down((c) => c.after) && down((c) => c.warn) && S[0].share < S[4].share && S[0].after > S[4].after && S[4].bosses && !S.slice(0, 4).some((c) => c.bosses), `chapter by chapter it presses harder: more can turn (${S.map((c) => c.share).join(' → ')}), sooner (${S.map((c) => c.after).join(' → ')} s), more at once (${S.map((c) => c.cap).join(' → ')}); chapter 30's mid-boss and boss turn too`)
  // (an orb leaves at least `near` px from her, aimed where she is then: a
  // step aside of its radius and hers, at her base speed, is done before it
  // can arrive, even at that distance; its charge is seen before that)
  const dodge = (C.shot.r + B.player.hitRadius) / B.player.speed
  const arrive = (C.shot.near - C.shot.r - B.player.hitRadius) / C.shot.speed
  ok(S.every((c) => c.share < 1 && c.cap <= 20 && c.warn >= 1.5 && c.maxShots <= 20) && dodge < arrive && C.shot.windup >= 0.5 && C.shot.near >= 50, `never all of them, never too many at once (at most ${S[4].cap}), a warning of ${S[4].warn} s at least; an orb (${C.shot.speed} px/s) can always be stepped out of: ${dodge.toFixed(2)} s to step aside against ${arrive.toFixed(2)} s for it to arrive from ${C.shot.near} px, after ${C.shot.windup} s of charging seen`)

  // a run of chapter 30: monsters placed round Mano, the run played on
  const r = createRun(D, { chapter: 30, weaponId: 'bouncy_ball', grade: 'D', seed: 7 })
  r.fireT = 1e9
  const c = r.corrupt
  const p = r.player
  const mobs = []
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const e = spawnAt(r, ['imp', 'spider', 'slime', 'bone_beast'][i % 4], { x: p.x + Math.cos(a) * 150, y: p.y + Math.sin(a) * 150 })
    if (e) mobs.push(e)
  }
  const can = mobs.filter((e) => e.cAt !== undefined)
  const before = new Map(can.map((e) => [e.id, { speed: e.speed, damage: e.damage, hp: e.hp }]))
  let most = 0
  let warnShort = 0
  const seenWarn = new Map()
  let shotHurt = 0
  let peakOrbs = 0
  const fast = []
  for (let i = 0; i < 60 * 40; i++) {
    r.spawnT = -1e9 // (only the placed ones)
    p.armor = 0 // (her hurts are counted, not felt: chapter 30 would end it at once)
    // she walks a circle round the middle, never stopping
    step(r, FIXED, { x: Math.cos(i / 70), y: Math.sin(i / 70) })
    if (r.state === 'levelup') choose(r, r.choices[0], r.choiceSeq)
    let n = 0
    for (const e of r.enemies) {
      if (e.state !== 'live' || !e.cStage) continue
      n++
      if (e.cStage === 1 && !seenWarn.has(e.id)) seenWarn.set(e.id, r.t)
      if (e.cStage === 2 && !fast.includes(e)) {
        fast.push(e)
        if (!seenWarn.has(e.id) || r.t - seenWarn.get(e.id) < c.warn - 0.02) warnShort++
      }
    }
    most = Math.max(most, n)
    peakOrbs = Math.max(peakOrbs, r.shots.filter((x) => x.kind === 'abyss').length)
    for (const ev of r.events) if (ev.type === 'hurt' && ev.from === 'shot') shotHurt++
    r.events.length = 0
  }
  const M = C.mul
  const grew = fast.every((e) => {
    const b = before.get(e.id)
    return b && near(e.speed, b.speed * M.speed, 1e-6) && near(e.damage, b.damage * M.damage, 1e-6)
  })
  ok(can.length > 5 && can.length < mobs.length, `only some can turn: ${can.length} of ${mobs.length} placed (chapter 30's share ${c.share})`)
  ok(fast.length > 0 && most <= c.cap, `never more than ${c.cap} turning or turned at once (most seen ${most}; ${fast.length} turned in 40 s)`)
  ok(warnShort === 0, `each turned only after its warning (${c.warn} s of cracks) had run its time: ${fast.length} of ${fast.length}`)
  ok(grew, `a turned one is ${M.speed}× as fast and hits ${M.damage}× as hard (and has ${M.hp}× the HP)`)
  ok(r.stats.corrupt.shots > 0 && peakOrbs <= c.maxShots, `turned ones shoot (${r.stats.corrupt.shots} dark orbs), never more than ${c.maxShots} in the air (most ${peakOrbs})`)
  ok(shotHurt <= Math.max(1, r.stats.corrupt.shots * 0.1), `Mano walking on (a circle, never dodging on purpose) is seldom hit by them: ${shotHurt} of ${r.stats.corrupt.shots}`)
  // (and standing still she is: they are a real danger, not a decoration)
  {
    const s3 = createRun(D, { chapter: 30, weaponId: 'bouncy_ball', grade: 'D', seed: 7 })
    s3.fireT = 1e9
    const q3 = s3.player
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2
      spawnAt(s3, ['imp', 'spider', 'slime', 'bone_beast'][i % 4], { x: q3.x + Math.cos(a) * 150, y: q3.y + Math.sin(a) * 150 })
    }
    let hits = 0
    for (let i = 0; i < 60 * 40; i++) {
      s3.spawnT = -1e9
      q3.armor = 0
      q3.inv = 0 // (every orb that reaches her counts)
      step(s3, FIXED, { x: 0, y: 0 })
      if (s3.state === 'levelup') choose(s3, s3.choices[0], s3.choiceSeq)
      for (const ev of s3.events) if (ev.type === 'hurt' && ev.from === 'shot') hits++
      s3.events.length = 0
    }
    ok(hits >= s3.stats.corrupt.shots * 0.4, `standing still, she is hit by many of them (${hits} of ${s3.stats.corrupt.shots}): leaving them alive costs`)
  }

  // no invasion elsewhere; a frozen monster's clock stands still; never the thief
  const q = createRun(D, { chapter: 25, weaponId: 'bouncy_ball', grade: 'D', seed: 3 })
  const e25 = spawnAt(q, 'imp', { x: q.player.x + 120, y: q.player.y })
  const r2 = createRun(D, { chapter: 30, weaponId: 'bouncy_ball', grade: 'D', seed: 11 })
  r2.fireT = 1e9
  let fz = null
  for (let i = 0; i < 40 && !fz; i++) {
    const e = spawnAt(r2, 'slime', { x: r2.player.x + 140, y: r2.player.y })
    if (e && e.cAt !== undefined) fz = e
  }
  const th = spawnAt(r2, 'thief', { x: r2.player.x - 140, y: r2.player.y })
  for (let i = 0; i < 60 * 12; i++) {
    r2.spawnT = -1e9
    r2.player.armor = 0
    if (fz.state === 'live') (fz.freezeT = 1), (fz.x = r2.player.x + 140), (fz.y = r2.player.y)
    step(r2, FIXED, { x: 0, y: 0 })
    r2.events.length = 0
  }
  // chapter 30's boss turns on time, even with the field's turned ones at
  // their cap; it keeps its HP (its fight is no longer), runs and hits harder
  // and fires its fan of orbs
  const r3 = createRun(D, { chapter: 30, weaponId: 'bouncy_ball', grade: 'D', seed: 5 })
  r3.fireT = 1e9
  const filled = []
  for (let i = 0; i < 60 && filled.length < r3.corrupt.cap; i++) {
    const e = spawnAt(r3, 'slime', { x: r3.player.x + 100 + (i % 6) * 20, y: r3.player.y - 120 + Math.floor(i / 6) * 25 })
    if (e && e.cAt !== undefined) filled.push(e), (e.cT = e.cAt)
  }
  const boss = spawnAt(r3, 'boss', { x: r3.player.x - 150, y: r3.player.y })
  const b0 = { speed: boss.speed, damage: boss.damage, hp: boss.hp }
  let bossFan = 0
  for (let i = 0; i < 60 * (r3.corrupt.bossAfter + r3.corrupt.warn + 6); i++) {
    r3.spawnT = -1e9
    r3.player.armor = 0
    for (const e of filled) if (e.state === 'live') e.hp = e.maxHp
    boss.hp = boss.maxHp
    step(r3, FIXED, { x: 0, y: 0 })
    if (r3.state === 'levelup') choose(r3, r3.choices[0], r3.choiceSeq)
    bossFan = Math.max(bossFan, r3.shots.filter((x) => x.kind === 'abyss' && x.owner === boss.id).length)
    r3.events.length = 0
  }
  ok(filled.length === r3.corrupt.cap && boss.cStage === 2 && near(boss.speed, b0.speed * C.mul.bossSpeed, 1e-6) && near(boss.damage, b0.damage * C.mul.bossDamage, 1e-6) && boss.maxHp === b0.hp && bossFan >= C.shot.bossShots, `chapter 30's boss turns after ${r3.corrupt.bossAfter} s though ${filled.length} turned ones fill the field's cap: ${C.mul.bossSpeed}× its speed, ${C.mul.bossDamage}× its hits, its HP as it was, and a fan of ${C.shot.bossShots} orbs`)
  ok(e25.cAt === undefined && !q.corrupt, 'chapter 25: no monster ever turns')
  ok(fz && fz.cT === 0 && !fz.cStage && th.cAt === undefined, 'a frozen monster does not turn while it is held; the thief never turns')
}

// ── no swinging beam (it could not be dodged: asked for); the crossfire that
// replaced it can be got out of, but only by going well between two lines ──
{
  const all = []
  const walk = (a) => (a.type === 'combo' ? a.parts.forEach(walk) : all.push(a))
  for (const b of Object.values(B.extraBosses.bosses)) for (const ph of b.phases) ph.attacks.forEach(walk)
  for (const k of Object.keys(B.bossSkills.skills)) all.push(bossSkill(D, k, 35, B.enemies.boss))
  const cf = all.filter((a) => a.type === 'crossfire')
  // (from the crossing, along the middle between two lines: clear of both
  // at (half width + Mano) / sin(the half angle between them))
  const need = (a) => (a.width / 2 + B.player.hitRadius) / Math.sin(Math.PI / (2 * a.lines))
  const can = (a) => a.warn * B.player.speed
  ok(!all.some((a) => a.type === 'beam' || a.type === 'lances') && cf.length > 0 && cf.every((a) => can(a) > need(a) + 10 && a.step >= a.warn), `no swinging beam left anywhere; ${cf.length} crossfire attacks, each escapable, one star at a time (${Math.max(...cf.map(need)).toFixed(0)} px out at most, ${Math.min(...cf.map(can)).toFixed(0)} px of walking in its warning at least)`)
  // and really: Mano walking straight out between two lines in time is not hit
  const run = createRun(D, { chapter: 35, weaponId: 'bouncy_ball', grade: 'D', seed: 4, perma: {} })
  run.spawnT = -1e9
  const e = enemy(run, 60, 60)
  e.behavior = 'chase'
  e.damageMul = 1
  run.player.x = 300
  run.player.y = 500
  run.player.hp = run.player.maxHp = 1e9
  const spec = cf.find((a) => a.lines === 4)
  startAttack(run, e, spec)
  let hits = 0
  let walked = false
  for (let i = 0; i < 60 * 4; i++) {
    run.enemies = [e]
    run.fireT = 1e9
    e.speed = 0
    const hs = run.hazards.filter((h) => h.owner === e.id && run.t < h.at)
    const hp = run.player.hp
    if (hs.length && !walked) {
      // straight out between two lines of this wave: the gap with the most
      // room before the area's edge (a player does not walk into a wall)
      const [x0, y0, x1, y1] = run.arena.bounds
      const p = run.player
      const room = (a) => Math.min(...[Math.cos(a) > 0 ? (x1 - p.x) / Math.cos(a) : Math.cos(a) < 0 ? (x0 - p.x) / Math.cos(a) : 1e9, Math.sin(a) > 0 ? (y1 - p.y) / Math.sin(a) : Math.sin(a) < 0 ? (y0 - p.y) / Math.sin(a) : 1e9])
      const a0 = Math.atan2(hs[0].dy, hs[0].dx)
      let best = a0 + Math.PI / (2 * spec.lines)
      for (let k = 1; k < 2 * spec.lines; k++) {
        const a = a0 + ((2 * k + 1) * Math.PI) / (2 * spec.lines)
        if (room(a) > room(best)) best = a
      }
      walked = { x: Math.cos(best), y: Math.sin(best) }
    }
    step(run, FIXED, walked ? { x: walked.x, y: walked.y } : still)
    tickAttack(run, e, FIXED)
    if (run.player.hp < hp) hits++
    if (!run.hazards.some((h) => h.owner === e.id && run.t < h.at)) walked = false
  }
  ok(hits === 0, `crossfire of ${spec.lines} lines, ${spec.waves} waves: walking out between two lines each wave, Mano is never hit`)
}

// ── the ordinary bosses' skills (balance.json → bossSkills) ──────────────
{
  const S = B.bossSkills
  const counts = [1, 6, 11, 16, 21, 26, 31].map((ch) => bossSkills(D, 'A', 'boss', ch).length)
  const brute = [1, 6, 11, 16, 21, 26, 31].map((ch) => bossSkills(D, 'C', 'brute', ch).length)
  ok(counts.join() === S.count.boss.join() && brute.join() === S.count.brute.join() && counts.every((n, i) => !i || n >= counts[i - 1]) && tierOf(5) === 0 && tierOf(6) === 1 && tierOf(35) === 6, `skills by episode: the boss ${counts.join(' → ')}, the mid-boss ${brute.join(' → ')}`)
  ok('ABCD'.split('').every((t) => S.byType[t].every((k) => S.skills[k])) && new Set(Object.values(S.byType).flat()).size === Object.keys(S.skills).length, 'every skill a boss way lists exists, and every skill is used by some way')
  const early = bossSkill(D, 'rain', 1, B.enemies.boss)
  const late = bossSkill(D, 'rain', 35, B.enemies.boss)
  ok(late.count > early.count && late.warn < early.warn && late.warn >= S.minWarn && early.damage === B.enemies.boss.chargeDamage * S.skills.rain.hit, `a skill grows with the episode: rain ${early.count} circles warned ${early.warn} s → ${late.count} warned ${late.warn} s (never under ${S.minWarn} s)`)
  // a boss of each way in the last chapter: its skills come by turns, every
  // blow warned; under half HP it is enraged once and its skills pair up
  const bossAt = (ch, type, key = 'boss', seed = 3) => {
    const r = createRun(D, { chapter: ch, weaponId: 'bouncy_ball', grade: 'D', seed, perma: {} })
    r.spawnT = -1e9
    r.player.hp = r.player.maxHp = 1e12
    r.t = 209.99
    r.nextEvent = B.chapter.events.findIndex((e) => e.key === key)
    step(r, FIXED * 2, still)
    const b = r.enemies.find((e) => e.behavior === 'boss')
    b.btype = type
    return [r, b]
  }
  for (const type of 'ABCD') {
    const [r, b] = bossAt(35, type)
    const want = new Set(bossSkills(D, type, 'boss', 35).map((k) => S.skills[k].type))
    const seen = new Set()
    let early = 0
    let blows = 0
    let shots = 0
    let rage = 0
    let combos = 0
    const hz = new Set()
    for (let i = 0; i < 60 * 90; i++) {
      if (i === 60 * 60) b.hp = b.maxHp * 0.4
      r.enemies = r.enemies.filter((e) => e === b)
      r.player.inv = 1e9
      r.fireT = 1e9
      if (r.state === 'levelup') choose(r, r.choices[0], r.choiceSeq)
      step(r, FIXED, still)
      for (const e of r.events) if (e.type === 'bossRage') rage++
      r.events.length = 0
      if (b.atk) {
        if (b.atk.spec.type === 'combo') combos++, b.atk.spec.parts.forEach((q) => seen.add(q.type))
        else seen.add(b.atk.spec.type)
      }
      for (const h of r.hazards) {
        if (h.owner !== b.id || hz.has(h) || h.harmless) continue
        hz.add(h)
        blows++
        if (h.at - h.born < S.minWarn - 1e-9) early++
      }
      shots = Math.max(shots, r.shots.filter((x) => x.owner === b.id).length)
    }
    ok([...want].every((t) => seen.has(t)) && !early && rage === 1 && b.enraged && combos > 0, `chapter 35, a boss of way ${type}: its skills ${[...want].join(' ')} all come (${blows} warned blows, every one ≥ ${S.minWarn} s; up to ${shots} shots in the air); under half HP enraged once, its skills in pairs`)
    // it falls: nothing of its skills stays
    for (let i = 0; i < 600 && !b.atk; i++) step(r, FIXED, still)
    b.hp = 1
    b.guard = false
    r.hurt(b, 5, b.x, b.y)
    ok(!r.hazards.some((h) => h.owner === b.id) && !r.shots.some((x) => x.owner === b.id), `way ${type}: it falls mid-skill, and its warnings and shots go with it`)
  }
  // chapter 1: one skill, no rage
  {
    const [r, b] = bossAt(1, 'B')
    b.hp = b.maxHp * 0.3
    const seen = new Set()
    let rage = 0
    for (let i = 0; i < 60 * 40; i++) {
      r.enemies = r.enemies.filter((e) => e === b)
      r.player.inv = 1e9
      r.fireT = 1e9
      step(r, FIXED, still)
      for (const e of r.events) if (e.type === 'bossRage') rage++
      r.events.length = 0
      if (b.atk) seen.add(b.atk.spec.type)
    }
    ok([...seen].join() === S.skills[S.byType.B[0]].type && !rage && !b.enraged, `chapter 1: the boss has one skill (${[...seen].join()}), and is never enraged`)
  }
}

// ── the extra special bosses (balance.json → extraBosses) ─────────────────
{
  const X = B.extraBosses
  const WANT = { 3: 'x_snail', 5: 'x_moth', 8: 'x_toad', 10: 'x_spider', 13: 'x_bellkeeper', 15: 'x_organ', 18: 'x_scarab', 20: 'x_sultan', 23: 'x_jelly', 25: 'x_peacock', 28: 'x_ray', 30: 'x_clock', 33: 'x_queen', 35: 'x_eclipse' }
  const got = {}
  for (let ch = 1; ch <= lastChapter(D); ch++) if (extraOf(D, ch)) got[ch] = extraOf(D, ch)
  ok(JSON.stringify(got) === JSON.stringify(WANT), `extra special bosses in chapters ${Object.keys(got).join(', ')} (${Object.values(got).length} of them)`)

  // a run brought to its chapter boss, which then falls at once
  const toBoss = (ch, seed = 5, o = {}) => {
    const run = createRun(D, { chapter: ch, weaponId: 'bouncy_ball', grade: 'D', seed, perma: {}, ...o })
    run.player.hp = run.player.maxHp = 1e12
    run.t = 209.99
    run.nextEvent = B.chapter.events.findIndex((e) => e.key === 'boss')
    return run
  }
  const tick = (run, n = 1, f) => {
    for (let i = 0; i < n && run.state !== 'over'; i++) {
      if (run.state === 'levelup') choose(run, run.choices[0], run.choiceSeq)
      run.fireT = f?.noFire ? 1e9 : run.fireT
      step(run, FIXED, still)
      if (f?.each) f.each(run)
      run.events.length = 0
    }
  }
  const killBoss = (run) => {
    for (let i = 0; i < 120 && !(run.boss && run.boss.state === 'live'); i++) tick(run)
    const b = run.boss
    b.hp = 1
    b.guard = false
    ball(run, b.x, b.y, 1, 0, { damage: 50 })
  }

  // every listed chapter: its own boss first, then, after a pause, the extra
  // one once; nothing early, nothing twice; the field cleared; Mano safe
  // during the warning; its attacks over the whole area, every one warned,
  // a gap always within reach; its fall ends the chapter, once
  for (const ch of Object.keys(WANT).map(Number)) {
    const run = toBoss(ch)
    const ev = []
    const seenTypes = new Set()
    let early = 0
    let noGap = 0
    let farGap = 0
    let hurtInIntro = 0
    let extras = 0
    let clearedAtCalm = null
    let spawnGap = Infinity
    let hitWhileComing = false
    let span = 0 // how far across the area its blows reached (share of the area's size)
    const circ = [Infinity, Infinity, -Infinity, -Infinity, 0] // the circles' spread
    killBoss(run)
    const seen = new Set()
    const each = (r) => {
      for (const e of r.events) {
        if (e.type === 'extraCalm' || e.type === 'extraWarn' || e.type === 'extraAppear') ev.push(e.type)
        if (e.type === 'extraCalm') clearedAtCalm = !r.enemies.some((m) => m.state === 'live' || m.state === 'spawn') && !r.hazards.length && !r.shots.length
        if (e.type === 'hurt' && r.extra && r.extra.phase !== 'fight') hurtInIntro++
      }
      if (r.extra && r.extra.boss && !seen.has(r.extra.boss)) {
        seen.add(r.extra.boss)
        extras++
        spawnGap = Math.hypot(r.extra.boss.x - r.player.x, r.extra.boss.y - r.player.y)
      }
      const xb = r.extra && r.extra.boss
      if (xb && xb.state === 'spawn' && !hitWhileComing) {
        // a ball on it while it comes in: no damage
        const hp = xb.hp
        r.hurt(xb, 1e30, xb.x, xb.y)
        hitWhileComing = xb.hp !== hp
      }
      if (xb && xb.atk) seenTypes.add(xb.atk.spec.type)
      for (const h of r.hazards) {
        if (!xb || h.owner !== xb.id || seen.has(h)) continue
        seen.add(h)
        if (h.harmless) continue
        // (a ring or a band: its own shorter warning, waveWarn)
        if (h.at - h.born < (h.kind === 'wave' || h.kind === 'band' ? X.waveWarn : X.minWarn) - 1e-9) early++
        const Bx = r.extra.box
        const size = Math.max(Bx[2] - Bx[0], Bx[3] - Bx[1])
        if (h.kind === 'wave') span = Math.max(span, (h.speed * (h.until - h.at)) / size)
        else if (h.kind === 'band') span = Math.max(span, 1)
        else if (h.kind === 'line') span = Math.max(span, Math.min(1, (2 * h.half + h.len) / size))
        else if (h.kind === 'cone') span = Math.max(span, Math.min(1, h.range / size))
        else if (h.kind === 'circle') {
          circ[0] = Math.min(circ[0], h.x)
          circ[1] = Math.min(circ[1], h.y)
          circ[2] = Math.max(circ[2], h.x)
          circ[3] = Math.max(circ[3], h.y)
          circ[4] = h.r
          span = Math.max(span, Math.max((circ[2] - circ[0] + 2 * circ[4]) / (Bx[2] - Bx[0]), (circ[3] - circ[1] + 2 * circ[4]) / (Bx[3] - Bx[1])))
        }
        if (h.kind === 'wave' || h.kind === 'band') {
          if (!h.gaps.length) noGap++
          // the nearest gap: reachable at base speed before the front comes
          const p = r.player
          const t = reachesAt(h, p.x, p.y)
          const time = (t ?? h.until) - r.t
          let best = Infinity
          for (let a = 0; a < 64; a++)
            for (let d = 0; d <= 125 * time; d += 10) {
              const x = p.x + Math.cos((a / 64) * Math.PI * 2) * d
              const y = p.y + Math.sin((a / 64) * Math.PI * 2) * d
              if (x < Bx[0] || x > Bx[2] || y < Bx[1] || y > Bx[3]) continue
              const t2 = reachesAt(h, x, y)
              if (inGap(h, x, y, p.hitR + 2) || t2 === null || t2 > h.until) best = Math.min(best, d)
            }
          if (best > 125 * time) farGap++
        }
      }
    }
    tick(run, 60 * 6, { each, noFire: true })
    const order = ev.join('>')
    const notYet = run.state === 'play' && run.extra && run.extra.phase === 'fight'
    // its fight: Mano cannot die here, the boss cannot be hurt (to see its attacks)
    tick(run, 60 * 40, { each, noFire: true })
    const b = run.extra.boss
    ok(
      order === 'extraCalm>extraWarn>extraAppear' && notYet && extras === 1 && clearedAtCalm && !hurtInIntro && !hitWhileComing && spawnGap > 100 && b.skin === WANT[ch] && run.awards.filter((a) => a === 'boss').length === 1 && !run.awards.includes('extra'),
      `ch${ch}: its own boss falls, the chapter goes on: field cleared, quiet, WARNING!, ${WANT[ch]} comes in ${spawnGap.toFixed(0)} px from Mano (not hurt, not hittable while it comes), once; the boss's reward once`,
    )
    const want = new Set((X.bosses[WANT[ch]].attacks || X.bosses[WANT[ch]].phases[0].attacks).map((a) => a.type))
    ok([...want].every((t) => seenTypes.has(t)) && !early && !noGap && !farGap && span >= 0.85, `ch${ch} ${WANT[ch]}: ${[...seenTypes].join(' ')} over ${Math.round(span * 100)}% of the area, every blow warned ≥ ${X.minWarn} s (rings and bands ≥ ${X.waveWarn} s)${early ? ` (${early} early)` : ''}, a gap within reach every time${noGap || farGap ? ` (${noGap} without, ${farGap} out of reach)` : ''}`)
    // now it falls: its attacks go with it, then the clear (once)
    b.hp = 1
    run.hurt(b, 5, b.x, b.y)
    const left = run.hazards.filter((h) => h.owner === b.id).length + run.shots.filter((s) => s.owner === b.id).length
    let hurtAfter = 0
    let overs = 0
    for (let i = 0; i < 60 * 4; i++) {
      run.player.x = b.x
      run.player.y = b.y
      run.player.inv = 0
      const was = run.state
      const hp = run.player.hp
      tick(run)
      if (run.player.hp < hp) hurtAfter++
      if (was !== 'over' && run.state === 'over') overs++
    }
    ok(!left && !hurtAfter && run.state === 'over' && run.result.cleared && overs === 1 && run.result.extra === WANT[ch], `ch${ch}: it falls: nothing of its attack stays, no touch while it lies, then the chapter is cleared once`)
  }

  // every phase of every one (held there a while): every blow still warned
  // at least minWarn, and each phase's own attacks all come
  {
    const bad = []
    let blows = 0
    const shotsOf = {} // boss → its shots' looks and ways of flying seen
    for (const ch of Object.keys(WANT).map(Number)) {
      const run = toBoss(ch, 9)
      killBoss(run)
      tick(run, 60 * 6)
      const b = run.extra.boss
      const P = X.bosses[WANT[ch]].phases
      const seenH = new Set()
      P.forEach((ph, k) => {
        const share = k === 0 ? 0.95 : (ph.above + P[k - 1].above) / 2
        const kinds = new Set()
        tick(run, 60 * Math.max(24, 7 * ph.attacks.length), {
          noFire: true,
          each: (r) => {
            b.hp = b.maxHp * share
            r.player.inv = 1e9
            for (const sh of r.shots) if (sh.owner === b.id && !sh.turn) (shotsOf[WANT[ch]] ??= new Set()).add(sh.kind + ':' + (sh.mv ? sh.mv.type : 'plain'))
            if (b.atk && b.phase === k) kinds.add(b.atk.spec.type === 'combo' ? b.atk.spec.parts.map((q) => q.type).join('+') : b.atk.spec.type)
            for (const h of r.hazards) {
              if (h.owner !== b.id || seenH.has(h)) continue
              seenH.add(h)
              if (h.harmless) continue
              blows++
              if (h.at - h.born < (h.kind === 'wave' || h.kind === 'band' ? X.waveWarn : X.minWarn) - 1e-9) bad.push(`ch${ch} phase ${k + 1}: ${(h.at - h.born).toFixed(2)} s`)
            }
          },
        })
        const want = ph.attacks.map((a) => (a.type === 'combo' ? a.parts.map((q) => q.type).join('+') : a.type))
        if (!want.every((w) => kinds.has(w))) bad.push(`ch${ch} phase ${k + 1}: only ${[...kinds].join(', ')}`)
      })
    }
    // each its own shots: their look, and a way of flying of its own (asked
    // for: not the same white balls, only faster)
    const own = Object.entries(WANT).map(([, id]) => {
      const B = X.bosses[id]
      const types = B.shotMove.type === 'mix' ? B.shotMove.of.map((m) => m.type) : [B.shotMove.type]
      const got = [...(shotsOf[id] || [])]
      return { id, ok: got.length > 0 && got.every((g) => g.startsWith(B.shot + ':') && (types.includes(g.split(':')[1]) || g.endsWith(':plain'))) && got.some((g) => !g.endsWith(':plain')), shot: B.shot, types }
    })
    const looks = new Set(own.map((o) => o.shot))
    ok(own.every((o) => o.ok) && looks.size === own.length, `the special bosses' shots: ${own.map((o) => `${o.shot} (${o.types.join('/')})`).join(', ')} — ${looks.size} looks, each its own${own.some((o) => !o.ok) ? ' — wrong: ' + own.filter((o) => !o.ok).map((o) => o.id + ' ' + [...(shotsOf[o.id] || [])].join(',')).join('; ') : ''}`)
    ok(!bad.length, `every special boss in each of its phases: all its attacks come, ${blows} blows, every one warned ≥ ${X.minWarn} s (rings and bands ≥ ${X.waveWarn} s)${bad.length ? ' — ' + bad.slice(0, 6).join('; ') : ''}`)
  }

  // an ordinary chapter: cleared when its boss falls, no warning
  {
    const run = toBoss(4)
    killBoss(run)
    const warned = []
    tick(run, 60 * 4, { each: (r) => r.events.forEach((e) => e.type.startsWith('extra') && warned.push(e.type)) })
    ok(run.state === 'over' && run.result.cleared && !warned.length && !run.extra, 'chapter 4: cleared when its boss falls, no extra boss, no warning')
  }
  // falling to the extra boss: not cleared; how much of it was left
  {
    const run = toBoss(3)
    killBoss(run)
    tick(run, 60 * 4)
    run.player.hp = run.player.maxHp = 10
    for (let i = 0; i < 60 * 30 && run.state !== 'over' && run.state !== 'dying'; i++) {
      run.player.x = run.extra.boss.x
      run.player.y = run.extra.boss.y
      tick(run)
    }
    for (let i = 0; i < 120; i++) tick(run)
    ok(run.state === 'over' && !run.result.cleared && run.result.bossLeft > 0 && run.result.extra === 'x_snail', `lost to the extra boss: not cleared (${Math.round(run.result.bossLeft * 100)}% of it left)`)
  }
  // every run has it, the first or the tenth
  {
    let n = 0
    for (let k = 0; k < 3; k++) {
      const run = toBoss(5, 40 + k)
      killBoss(run)
      tick(run, 60 * 4)
      if (run.extra && run.extra.boss) n++
    }
    ok(n === 3, 'it comes every run of its chapter (not only before the first clear)')
  }
  // a strong build ends it quickly: no shield, no cap, no forced show
  {
    const run = toBoss(10)
    killBoss(run)
    tick(run, 60 * 6)
    const b = run.extra.boss
    // every hit counts in full, at any moment (no guard, no cap, no shield
    // between phases): two big hits end it
    const hp0 = b.hp
    run.hurt(b, b.maxHp * 0.55, b.x, b.y)
    const full = near(hp0 - b.hp, b.maxHp * 0.55, 1e-6 * b.maxHp)
    run.hurt(b, b.maxHp * 0.55, b.x, b.y)
    ok(full && b.state === 'down' && !b.guard, `chapter 10: a strong build ends it as fast as it hits: every hit counts in full (no guard before chapter ${B.lateGame.bossGuard.fromChapter}, no cap, no shield)`)
    ok(near(b.maxHp, run.boss.maxHp * X.hpMul, 1e-9 * b.maxHp) && X.hpMul > 1, `it has ${X.hpMul}× the chapter boss's HP: tougher than the boss it follows`)
  }
  // chapters 3 and 5 (the first episode): far less HP than the others (asked
  // for: an early build needed minutes), still more than the boss before them
  {
    const hp = (ch) => {
      const run = toBoss(ch)
      killBoss(run)
      tick(run, 60 * 6)
      return [run.extra.boss.maxHp / run.boss.maxHp, extraOf(D, ch)]
    }
    const [m3, id3] = hp(3)
    const [m5, id5] = hp(5)
    const [m8] = hp(8)
    ok(id3 === 'x_snail' && id5 === 'x_moth' && near(m3, 6, 1e-9) && near(m5, 5, 1e-9) && near(m8, X.hpMul, 1e-9) && m3 > 1 && m5 > 1, `chapters 3 and 5's special bosses have ${m3}× and ${m5}× the chapter boss's HP (the others ${m8}×)`)
  }
  // from the boss guard's chapter on it has the guard too
  {
    const G = B.lateGame.bossGuard
    const ch = +Object.keys(X.chapters).find((c) => +c >= G.fromChapter)
    const run = toBoss(ch)
    killBoss(run)
    tick(run, 60 * 6)
    const b = run.extra.boss
    tick(run, 60 * 3, { noFire: true })
    const hp0 = b.hp
    run.hurt(b, b.maxHp, b.x, b.y)
    const lost = (hp0 - b.hp) / b.maxHp
    ok(b.guard && b.state === 'live' && lost <= G.maxShare * G.burst + 1e-9, `chapter ${ch}: the boss's guard (one huge hit takes ${(lost * 100).toFixed(0)}% of its HP, at most ${G.maxShare * G.burst * 100}%)`)
  }
  // the last one: its phases by HP, the combos only later, nothing made up
  {
    const run = toBoss(35)
    killBoss(run)
    tick(run, 60 * 6)
    const b = run.extra.boss
    const used = [new Set(), new Set(), new Set(), new Set(), new Set()]
    for (let i = 0; i < 60 * 100; i++) {
      if (i === 60 * 20) b.hp = b.maxHp * 0.6
      if (i === 60 * 40) b.hp = b.maxHp * 0.4
      if (i === 60 * 60) b.hp = b.maxHp * 0.2
      if (i === 60 * 80) b.hp = b.maxHp * 0.05
      tick(run, 1, { noFire: true })
      if (b.atk) used[b.phase].add(b.atk.spec.type)
    }
    ok(['ringwave', 'sweep', 'volley', 'nova', 'spiral', 'dash'].every((t) => used[0].has(t)) && !used[0].has('combo') && used.slice(1).every((u) => u.has('combo')) && b.core, `the last boss: ${used.map((u) => [...u].join('+')).join(' → ')}; its core lights at the end`)
    const pX = B.extraBosses.bosses.x_eclipse
    const others = Object.entries(B.extraBosses.bosses).filter(([id]) => id !== 'x_eclipse')
    const kinds = (o) => new Set(o.phases.flatMap((ph) => ph.attacks.flatMap((a) => (a.type === 'combo' ? a.parts.map((q) => q.type) : [a.type]))))
    const triples = (ph) => ph.attacks.every((a) => a.type === 'combo' && a.parts.length === 3)
    const varied = others.every(([, o]) => o.phases.length === 4 && new Set(o.phases[0].attacks.map((a) => a.type)).size >= 4 && kinds(o).size >= 6 && o.phases[1].attacks.some((a) => a.type === 'combo') && triples(o.phases[3]) && o.phases.every((ph, i) => !i || ph.walk < o.phases[i - 1].walk))
    const last = kinds(pX)
    ok((pX.hpMul ?? X.hpMul) > X.hpMul && pX.phases.length === 5 && last.size >= 11 && triples(pX.phases[4]) && varied, `every special boss: four phases by HP, four kinds of attack from the start and six in all, combos from the second phase, only three-part combos in the last, faster each phase; the last is the hardest (HP ×${pX.hpMul} against ×${X.hpMul}, five phases, ${last.size} kinds of attack, only three-part combos at the end)`)
  }

  // the animation data: every monster has its frames; the old motion set's
  // bosses attack and die on 3, the extra bosses on 4 each
  const M = D.motion.characters
  const skins = new Set(D.story.regions.flatMap((r) => Object.values(r.skins)))
  const bad = []
  for (const id of skins) {
    const m = M[id]
    if (!m) bad.push(id + ' (none)')
    else if (m.animations.move.frames.length !== 4 || !(m.refLong > 0) || m.durations.length !== m.frames.length) bad.push(id)
  }
  for (const id of Object.values(WANT)) {
    const m = M[id]
    if (!m || m.role !== 'extra' || m.animations.move.frames.length !== 4 || m.animations.attack.frames.length !== 4 || m.animations.death.frames.length !== 4 || m.animations.death.loop || m.frames.length !== 12) bad.push(id)
  }
  ok(!bad.length && Object.keys(M).length === 49, `motion: 35 of the old set and 14 extra bosses (move, attack, death: 4 frames each)${bad.length ? ' — ' + bad.join(', ') : ''}`)
}

// ── chapter 5's first clear (MANO_EP01): the story, its reward, old saves ──
{
  const S = D.story
  const g = S.cutscenes.groups.find((x) => x.id === 'ep01_clear')
  const lines = g ? g.cuts.map((c) => c.text) : []
  ok(g && g.chapter === 5 && g.when === 'clear' && g.reward === 'forest' && g.cuts.map((c) => c.image).join() === 'ep01_clear_01,ep01_clear_02,ep01_clear_03,ep01_clear_04,ep01_clear_05', "chapter 5's clear: the five new cuts in order, then chapter 5's reward")
  ok(lines.join('|') === '어? 단추? 호두? 모루?|나 따라온 거야??|어어? 탱탱볼??|탱탱볼!!!|좋아! 이번엔 {next} 가볼까!' && S.regions[1].from === 6 && S.regions[1].name === '깊은 숲', `Mano's five lines; the last names the region of chapters 6–10 from the data (${S.regions[1].name})`)
  ok(D.storyAssets.images.filter((x) => x.id.startsWith('ep01_clear_')).every((x) => x.kind === 'cutscene' && x.out[0] / x.out[1] > 1.7), 'the five pictures are wide (16:9), whole')
  ok(!S.cutscenes.groups.some((x) => x.id === 'deepforest_3') && !S.rewards.deepforest.cats && S.cutscenes.groups.filter((x) => x.chapter === 10).map((x) => x.id).join() === 'ep02_clear', "chapter 10: the old cat event is gone (its clear is now Tizzzz's)")
  const R = S.rewards.forest
  ok(R.chapter === 5 && R.ball === 'S' && R.cats && R.rerolls === 2 && R.images.join() === 'reward_cats,reward_s_ball,reward_reroll', "chapter 5's reward: the cats, one S ball, 2 rerolls (one popup, three pictures)")
  // a new save through chapter 11
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const clear = (ch) => {
    const r = P.startRun(ch)
    return P.finishRun(r.runId, ch, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
  }
  for (let ch = 1; ch <= 4; ch++) clear(ch)
  const pre = P.startRun(5)
  P.finishRun(pre.runId, 5, { cleared: false, coins: 0, kills: 1, time: 1, elites: 0 })
  ok(!P.get().cats.unlocked && P.get().rerolls === 0, 'before chapter 5 is cleared: no cats, no rerolls')
  const c5 = clear(5)
  const d5 = P.get()
  ok(c5.story && c5.story.reward === 'forest' && d5.cats.unlocked && d5.rerolls === 2 && d5.inventory.filter((it) => it.grade === 'S').length === 1, 'first clear of 5: the cats, the S ball (once) and the rerolls, in the same write as the clear')
  const again = clear(5)
  ok(!again.story && P.get().inventory.filter((it) => it.grade === 'S').length === 1 && P.get().rerolls === 2, 'clearing 5 again: nothing more (no second S ball)')
  for (let ch = 6; ch <= 10; ch++) clear(ch)
  const d10 = P.get()
  ok(d10.unlockedChapter === 11 && d10.firstCleared.includes(10) && d10.story.rewards.join() === 'forest,deepforest', "clearing 10: chapter 11 opens, chapter 10's reward (Tizzzz's) comes")
  const r11 = P.startRun(11)
  ok(r11.cats && r11.rerolls === 4, 'a run from then on starts with the cats and 4 rerolls')
}
// saves from the version before (story v 1: chapter 5 gave the S ball, chapter 10 the cats)
{
  const v1 = (cleared, extra = {}) => {
    const mem = new Mem()
    const P = createProgress(D, mem)
    P.boot()
    const d = P.get()
    d.firstCleared = Array.from({ length: cleared }, (_, i) => i + 1)
    d.unlockedChapter = cleared + 1
    d.story = { v: 1, seen: ['prologue', 'forest_1', 'forest_3'], rewards: cleared >= 5 ? ['forest'] : [], news: [] }
    if (cleared >= 5) d.inventory.push({ id: 'w50', weaponId: 'bouncy_ball', grade: 'S' })
    const { story, ...rest } = extra
    Object.assign(d, rest)
    if (story) Object.assign(d.story, story)
    mem.setItem(KEY, JSON.stringify(d))
    return { mem, b: createProgress(D, mem).boot() }
  }
  const a = v1(7).b.data
  ok(a.cats.unlocked && a.rerolls === 2 && a.inventory.filter((it) => it.grade === 'S').length === 1 && a.story.news.includes('ep01') && a.story.seen.includes('ep01_clear'), 'cleared 5, not 10 (no cats yet): the cats and the rerolls now, no second S ball, told once, the new cutscene not forced on it')
  const b = v1(12, { cats: { unlocked: true, eventSeen: true, rewardGiven: false }, story: { rewards: ['forest', 'deepforest'], seen: ['prologue', 'forest_3', 'deepforest_3'] } }).b.data
  ok(b.cats.unlocked && b.rerolls === 4 && b.inventory.filter((it) => it.grade === 'S').length === 1 && b.story.rewards.join() === 'forest,deepforest' && !b.story.seen.includes('deepforest_3') && b.tizzzz.unlocked && b.inventory.filter((it) => it.grade === 'SS').length === 1, "cleared 10 (had the cats from the old event): keeps them, no second S ball, the old chapter-10 marks are dropped; chapter 10's new reward (Tizzzz, SS ball, rerolls to 4) comes")
  const c = v1(3).b.data
  ok(!c.cats.unlocked && c.rerolls === 0 && !c.story.news.length, 'not yet at 5: nothing changes (chapter 5 brings it all)')
  const { mem } = v1(8)
  const P2 = createProgress(D, mem)
  P2.clearNews()
  const third = createProgress(D, mem).boot()
  ok(third.data.rerolls === 2 && third.data.inventory.filter((it) => it.grade === 'S').length === 1 && !third.data.story.news.length && third.supplied.length === 0, 'the next visit: nothing given or told again')
  // a save of the very first version (cats + S ball at the old chapter-5 event)
  const mem2 = new Mem()
  const P = createProgress(D, mem2)
  P.boot()
  const d = P.get()
  d.firstCleared = [1, 2, 3, 4, 5, 6]
  d.unlockedChapter = 7
  d.cats = { unlocked: true, eventSeen: true, rewardGiven: true }
  d.inventory.push({ id: 'w60', weaponId: 'bouncy_ball', grade: 'S' })
  delete d.story
  mem2.setItem(KEY, JSON.stringify(d))
  const o = createProgress(D, mem2).boot().data
  ok(o.cats.unlocked && o.rerolls === 2 && o.inventory.filter((it) => it.grade === 'S').length === 1 && o.story.rewards.includes('forest'), 'a first-version save (its S ball from the old cat event): the rerolls, no second S ball')
}

// ── chapter 10's first clear (MANO_CH10_CUTSCENES): Tizzzz moves from 15 to 10 ──
{
  const S = D.story
  const g = S.cutscenes.groups.find((x) => x.id === 'ep02_clear')
  ok(g && g.chapter === 10 && g.when === 'clear' && g.reward === 'deepforest' && g.cuts.map((c) => c.image).join() === 'ep02_clear_01,ep02_clear_02,ep02_clear_03,ep02_clear_04,ep02_clear_05', "chapter 10's clear: the five Tizzzz cuts in order, then chapter 10's reward")
  ok(g.cuts.map((c) => c.text).join('|') === '어!! Tizzzz!!|으헤헤헤...|어? 뭐야?|우와! 고마워!!|좋아! 이번엔 {next} 가볼까!' && g.cuts[0].banner === '작가 Tizzzz가 나타났다!' && g.cuts.filter((c) => c.banner || c.layout).length === 1, "Mano's lines; the first cut's banner")
  ok(S.regions[2].from === 11 && S.regions[2].name === '해골마을', `the last line names the region of chapters 11–15 from the data (${S.regions[2].name})`)
  ok(S.cutscenes.groups.filter((x) => x.chapter === 15 && x.when === 'clear').map((x) => x.id).join() === 'ep03_clear' && !S.cutscenes.groups.some((x) => x.id === 'skulltown_3') && !S.cutscenes.groups.some((x) => x.chapter === 11 || x.chapter === 16), "chapter 15: no Tizzzz cutscene; its clear is zyo_'s (below); chapters 11 and 16 have none")
  const R10 = S.rewards.deepforest
  const R15 = S.rewards.skulltown
  ok(R10.chapter === 10 && R10.tizzzz && R10.ball === 'SS' && R10.rerolls === 4 && !R10.cats, "chapter 10's reward: Tizzzz, one SS ball, rerolls to 4")
  ok(R15.chapter === 15 && R15.rerolls === 6 && R15.zyo && !R15.tizzzz && R15.ball === 'SS' && !R15.blessing, "chapter 15's: zyo_, 2 more rerolls (6) and an SS ball, no Tizzzz")
  ok(B.tizzzz.activeFromChapter === 11 && B.tizzzz.penSeconds <= 0.5, `Tizzzz rewrites from chapter ${B.tizzzz.activeFromChapter}; her pen takes ${B.tizzzz.penSeconds} s`)
  // a new save through chapter 16
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const clear = (ch) => {
    const r = P.startRun(ch)
    return P.finishRun(r.runId, ch, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
  }
  for (let ch = 1; ch <= 9; ch++) clear(ch)
  ok(!P.get().tizzzz.unlocked && P.get().rerolls === 2 && !P.startRun(9).tizzzz, 'before chapter 10: no Tizzzz, 2 rerolls')
  const SS = () => P.get().inventory.filter((it) => it.grade === 'SS').length
  const c10 = clear(10)
  ok(c10.story && c10.story.reward === 'deepforest' && c10.story.item.grade === 'SS' && SS() === 1 && P.get().tizzzz.unlocked && P.get().rerolls === 4, 'first clear of 10: Tizzzz, exactly one SS ball, rerolls to 4 — in the same write as the clear')
  ok(!clear(10).story && SS() === 1 && P.get().rerolls === 4, 'clearing 10 again: nothing more')
  const s11 = P.startRun(11)
  ok(s11.tizzzz && s11.rerolls === 4 && newRun({ chapter: 11, tizzzz: s11.tizzzz, rerolls: s11.rerolls }).writer && newRun({ chapter: 11, rerolls: s11.rerolls }).rerolls === 4 && !newRun({ chapter: 10, tizzzz: true }).writer, 'from chapter 11: she rewrites, 4 rerolls every run (chapter 10 itself: not yet)')
  for (let ch = 11; ch <= 14; ch++) clear(ch)
  const c15 = clear(15)
  ok(c15.story && c15.story.reward === 'skulltown' && c15.story.item.grade === 'SS' && SS() === 2 && P.get().rerolls === 6 && P.get().zyo.unlocked && P.get().unlockedChapter === 16, 'first clear of 15: zyo_, rerolls to 6, an SS ball; chapter 16 opens')
  ok(P.startRun(16).rerolls === 6 && P.startRun(16).zyo, 'a run from then on: 6 rerolls, zyo_ along')
}
// her rewrite: one card of those shown (however many), its own effect twice,
// only when chosen; a redraw rewrites one of the new ones afresh
{
  const run = newRun({ chapter: 11, tizzzz: true, rerolls: 4, seed: 41 })
  let one = 0
  let ok2 = 0
  for (let i = 0; i < 200; i++) {
    run.state = 'play'
    run.pending = 1
    run.xp = 0
    run.state = 'levelup'
    run.choices = drawChoices(run)
    run.choiceSeq++
    run.edit = null
    // (as openChoice: one of them, at random)
    const ok3 = run.choices.filter((id) => canEdit(run, id))
    if (ok3.length) run.edit = { id: ok3[Math.floor(run.rng() * ok3.length)], seq: run.choiceSeq }
    if (run.edit && run.choices.includes(run.edit.id)) one++
    reroll(run, run.choiceSeq)
    if (run.edit && run.edit.seq === run.choiceSeq && run.choices.includes(run.edit.id)) ok2++
    run.rerolls = 4
  }
  ok(one === 200 && ok2 === 200, 'one card rewritten among those shown; after a redraw one of the new cards (never one put back), one only')
  const r = newRun({ chapter: 11, tizzzz: true, seed: 3 })
  r.state = 'levelup'
  r.pending = 1
  r.choices = ['damage', 'count', 'interval']
  r.choiceSeq++
  r.edit = { id: 'damage', seq: r.choiceSeq }
  const d0 = r.weapon.damage
  const c0 = r.weapon.count
  choose(r, 'count', r.choiceSeq)
  ok(r.weapon.damage === d0 && r.weapon.count === c0 * 2, 'a rewritten card not chosen does nothing (the plain card picked: ×2 once)')
  r.state = 'levelup'
  r.pending = 1
  r.choices = ['damage', 'count', 'crit']
  r.choiceSeq++
  r.edit = { id: 'crit', seq: r.choiceSeq }
  const k0 = r.weapon.critChance
  choose(r, 'crit', r.choiceSeq)
  ok(near(r.weapon.critChance, k0 + 2 * B.upgrades.effects.crit.add, 1e-9) && r.picks.crit === 2, `the rewritten card chosen: its effect twice (치명타 +${B.upgrades.effects.crit.add * 100}%p → +${2 * B.upgrades.effects.crit.add * 100}%p), counted as two picks`)
}
// saves from before this change (Tizzzz at chapter 15 with the SS ball)
{
  const v2 = (cleared, extra = {}) => {
    const mem = new Mem()
    const P = createProgress(D, mem)
    P.boot()
    const d = P.get()
    d.firstCleared = Array.from({ length: cleared }, (_, i) => i + 1)
    d.unlockedChapter = cleared + 1
    d.story = { v: 2, seen: ['prologue', 'forest_1', 'ep01_clear'], rewards: [], news: [] }
    if (cleared >= 5) (d.story.rewards.push('forest'), d.inventory.push({ id: 'w50', weaponId: 'bouncy_ball', grade: 'S' }), (d.cats = { unlocked: true, eventSeen: true, rewardGiven: false }), (d.rerolls = 2))
    if (cleared >= 15) (d.story.rewards.push('skulltown'), d.story.seen.push('skulltown_3'), d.inventory.push({ id: 'w51', weaponId: 'bouncy_ball', grade: 'SS' }), (d.tizzzz = { unlocked: true, eventSeen: true, rewardGiven: false }))
    const { story, ...rest } = extra
    Object.assign(d, rest)
    if (story) Object.assign(d.story, story)
    mem.setItem(KEY, JSON.stringify(d))
    return { mem, b: createProgress(D, mem).boot() }
  }
  const SS = (d) => d.inventory.filter((it) => it.grade === 'SS').length
  const a = v2(8).b.data
  ok(!a.tizzzz.unlocked && SS(a) === 0 && a.rerolls === 2 && !a.story.rewards.includes('deepforest'), '1) chapter 10 not yet cleared: nothing changes (chapter 10 brings it)')
  const b = v2(12)
  ok(b.b.data.tizzzz.unlocked && SS(b.b.data) === 1 && b.b.data.rerolls === 4 && b.b.supplied.join() === 'deepforest' && b.b.data.story.seen.includes('ep02_clear'), '2) chapter 10 cleared, 15 not: Tizzzz, the SS ball and rerolls to 4 now (told once); the new cutscene not forced on it')
  const c = v2(18)
  ok(c.b.data.tizzzz.unlocked && SS(c.b.data) === 2 && c.b.data.rerolls === 6 && c.b.supplied.length === 0 && c.b.data.story.news.includes('ep02') && !c.b.data.story.seen.includes('skulltown_3') && c.b.data.story.rewards.includes('deepforest'), "3/4) the old chapter-15 Tizzzz event done (Tizzzz on, its SS ball owned): chapter 10's reward counts as given — no second SS ball for it, Tizzzz once — rerolls to 6, and chapter 15's own new SS ball (story v 6); the old cutscene's mark is dropped")
  const d = v2(12, { inventory: [{ id: 'w1', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w60', weaponId: 'bouncy_ball', grade: 'SS' }], equippedInstanceId: 'w60' }).b.data
  ok(SS(d) === 2 && d.story.rewards.includes('deepforest'), '5) an SS ball owned (from chests or fusion) is not the reward: the reward comes (judged by the record, not the pocket)')
  const e = v2(18, { tizzzz: { unlocked: true, eventSeen: true, rewardGiven: false } })
  const P2 = createProgress(D, e.mem)
  P2.clearNews()
  const again = createProgress(D, e.mem).boot()
  ok(again.supplied.length === 0 && SS(again.data) === 2 && again.data.rerolls === 6 && !again.data.story.news.length, 'the next visit: nothing given or told again')
  // the first version (Tizzzz and her SS ball at the old chapter-10 event)
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const o = P.get()
  o.firstCleared = Array.from({ length: 11 }, (_, i) => i + 1)
  o.unlockedChapter = 12
  o.tizzzz = { unlocked: true, eventSeen: true, rewardGiven: true }
  o.inventory.push({ id: 'w70', weaponId: 'bouncy_ball', grade: 'SS' })
  delete o.story
  mem.setItem(KEY, JSON.stringify(o))
  const f = createProgress(D, mem).boot().data
  ok(f.tizzzz.unlocked && SS(f) === 1 && f.rerolls === 4 && f.story.rewards.includes('deepforest'), 'a first-version save (its SS ball from the old chapter-10 Tizzzz event): no second SS ball, rerolls to 4')
}

// ── 친구냥이: the fighting cats (friends.js) ────────────────────────────────
{
  const F = B.friendCats
  const catRun = (o = {}) => {
    const r = newRun({ chapter: 6, cats: true, grade: 'S', seed: 5, ...o })
    r.spawnT = -1e9
    r.nextEvent = 1e9
    return r
  }
  // the ball held back, nothing else coming: only the cats fight
  const fight = (r, secs, each) => {
    for (let t = 0; t < secs; t += FIXED) {
      r.fireT = 1e9
      r.spawnT = -1e9
      r.player.hp = r.player.maxHp
      step(r, FIXED, still)
      r.events.length = 0
      if (each) each()
    }
  }
  const cat = (r, k = 1) => {
    for (let i = 0; i < k; i++) pickIn(r, 'catSummon')
  }
  const r0 = catRun()
  ok(r0.pool.filter((id) => id.startsWith('cat')).join() === 'catSummon,catSize,catSpeed,catRate,catClaw' && r0.cat.n === 0 && r0.friends.length === 0, 'a run with the cats (chapter 6 on): the five cat cards are in the pool, no friend cat yet')
  ok(!newRun({ chapter: 5, cats: true }).pool.some((id) => id.startsWith('cat')) && !newRun({ chapter: 8, cats: false }).pool.some((id) => id.startsWith('cat')), 'no cat cards before chapter 6, nor without the cats')
  let early = 0
  let summon = 0
  for (let i = 0; i < 3000; i++) {
    const c = drawChoices(r0)
    if (c.some((id) => id !== 'catSummon' && id.startsWith('cat'))) early++
    if (c.includes('catSummon')) summon++
  }
  ok(early === 0 && Math.abs(summon / 3000 - 3 / 17) < 0.03, `with no cat yet only 친구냥이 can come up (${((summon / 3000) * 100).toFixed(1)}%, like any card); the four others wait`)
  const counts = []
  for (let i = 0; i < 4; i++) cat(r0), counts.push(r0.friends.length)
  ok(counts.join() === '1,2,3,4' && r0.cat.n === 4, `친구냥이: +1 cat a pick (${counts.join(' → ')}), never doubled`)
  ok(previewTimes(r0, 'catSummon', 2).cat.n === 6, "Tizzzz's rewrite of it: +2 (the card twice), not ×2")
  let later = 0
  for (let i = 0; i < 3000; i++) if (drawChoices(r0).some((id) => ['catSize', 'catSpeed', 'catRate', 'catClaw'].includes(id))) later++
  ok(later > 1000, 'with a cat, the four other cat cards come up too')
  ok(r0.friends.every((c) => Math.hypot(c.x - r0.player.x, c.y - r0.player.y) < 30), 'they come out next to Mano')

  // finds, runs to, scratches, and goes for the next when one falls
  {
    const r = catRun()
    cat(r)
    const p = r.player
    const hp = catDamage(r) * 0.9
    const a = enemy(r, p.x + 110, p.y, hp)
    const b = enemy(r, p.x - 100, p.y + 60, hp)
    const c0 = { x: r.friends[0].x, y: r.friends[0].y }
    let firstAt = null
    fight(r, 6, () => {
      if (firstAt === null && a.state !== 'live') firstAt = r.t
    })
    const S = r.stats.by.cat || {}
    ok(a.state !== 'live' && b.state !== 'live' && S.kills === 2, `one cat: runs to the nearest, scratches it down, then goes for the other (both fallen, ${S.kills} kills, first at ${firstAt && firstAt.toFixed(2)} s)`)
    ok(Math.hypot(r.friends[0].x - c0.x, r.friends[0].y - c0.y) > 60, 'it really ran there (no hit from afar)')
  }
  // choosing: a small one another cat is about to finish is left to it, the
  // second cat takes the other; a boss alone gets every cat
  {
    const r = catRun()
    cat(r, 2)
    const p = r.player
    for (const c of r.friends) (c.x = p.x + 20), (c.y = p.y), (c.cd = 0)
    const hp = catDamage(r) * 0.5
    const a = enemy(r, p.x + 60, p.y, hp)
    const b = enemy(r, p.x + 60, p.y + 70, hp)
    let both = 0
    fight(r, 3, () => {
      if (r.friends.filter((c) => c.target === a).length > 1) both++
    })
    const S = r.stats.by.cat || {}
    ok(a.state !== 'live' && b.state !== 'live' && S.kills === 2 && S.hits === 2, `two cats, two small monsters (one scratch each): they split — 2 scratches, 2 kills, none spent twice (${S.hits} hits)`)
    const rb = catRun()
    cat(rb, 6)
    const boss = enemy(rb, rb.player.x + 80, rb.player.y, 1e12, 24)
    boss.behavior = 'boss'
    fight(rb, 2)
    ok(rb.friends.every((c) => c.target === boss) && (rb.stats.by.cat || {}).boss > 0, 'a boss alone: all six cats go at it (its HP is never covered)')
  }
  // only monsters on screen and near Mano
  {
    const r = catRun()
    cat(r)
    const p = r.player
    const far = enemy(r, p.x, p.y - F.leash - 60)
    fight(r, 3)
    ok(!(r.stats.by.cat && r.stats.by.cat.hits) && far.hp === far.maxHp && Math.hypot(r.friends[0].x - p.x, r.friends[0].y - p.y) < F.homeRadius * 2.2, `a monster past ${F.leash} px from Mano is left alone; the cat keeps near her`)
  }
  // the four cards, each measured where it shows
  const swingRun = (cards, secs = 6, place = (r) => [enemy(r, r.player.x + 40, r.player.y)]) => {
    const r = catRun()
    cat(r)
    for (const id of cards) pickIn(r, id)
    place(r)
    fight(r, secs)
    return r
  }
  {
    const base = swingRun([])
    const fast = swingRun(['catRate', 'catRate'])
    const k = fast.stats.catSwings / base.stats.catSwings
    ok(near(catInterval(fast), catInterval(base) * 0.49, 1e-9) && k > 1.7 && k < 2.4, `빠르게 할퀴기 ×2: the gap ${catInterval(base).toFixed(3)} → ${catInterval(fast).toFixed(3)} s, really ${base.stats.catSwings} → ${fast.stats.catSwings} scratches in 6 s (×${k.toFixed(2)})`)
  }
  {
    const r = catRun()
    cat(r)
    const d0 = catDamage(r)
    pickIn(r, 'catClaw')
    const hits = []
    const e = enemy(r, r.player.x + 30, r.player.y)
    for (let t = 0; t < 3; t += FIXED) {
      r.fireT = 1e9
      r.weapon.critChance = 0
      step(r, FIXED, still)
      for (const ev of r.events) if (ev.type === 'hit' && ev.by === 'cat') hits.push(ev.n)
      r.events.length = 0
    }
    ok(hits.length > 0 && hits.every((n) => near(n, d0 * B.upgrades.effects.catClaw.mul, 1e-6)) && e.hp < e.maxHp, `발톱 갈기: every scratch hurts ×${B.upgrades.effects.catClaw.mul} (${Math.round(d0)} → ${Math.round(hits[0])}, ${hits.length} scratches)`)
  }
  {
    // a pack of 7 in a ring: 뚱냥이 reaches more of them with each scratch
    const ring = (r) => {
      const c = { x: r.player.x + 60, y: r.player.y }
      const out = [enemy(r, c.x, c.y)]
      for (let i = 0; i < 6; i++) out.push(enemy(r, c.x + Math.cos(i) * 30, c.y + Math.sin(i) * 30))
      return out
    }
    const base = swingRun([], 4, ring)
    const fat = swingRun(['catSize', 'catSize', 'catSize'], 4, ring)
    const per = (r) => r.stats.by.cat.hits / r.stats.catSwings
    ok(near(catSwipe(fat), catSwipe(base) * B.upgrades.effects.catSize.rangeMul ** 3, 1e-9) && per(fat) > per(base) * 1.5, `뚱냥이 ×3: the scratch's circle ${(catSwipe(base) * 2).toFixed(0)} → ${(catSwipe(fat) * 2).toFixed(0)} px, monsters hit a scratch ${per(base).toFixed(2)} → ${per(fat).toFixed(2)} (the hit area itself, not only the picture)`)
    ok(fat.friends[0].size > base.friends[0].size, `and drawn larger (×${fat.friends[0].size.toFixed(2)})`)
  }
  {
    const reach = (cards) => {
      const r = catRun()
      cat(r)
      for (const id of cards) pickIn(r, id)
      const e = enemy(r, r.player.x, r.player.y - 200)
      let at = null
      fight(r, 4, () => {
        if (at === null && e.hp < e.maxHp) at = r.t
      })
      return { at, sp: catSpeed(r) }
    }
    const a = reach([])
    const b = reach(['catSpeed', 'catSpeed'])
    ok(b.at < a.at && near(b.sp, a.sp * B.upgrades.effects.catSpeed.mul ** 2, 1e-9), `스피드냥이 ×2: runs ${Math.round(a.sp)} → ${Math.round(b.sp)} px/s, first scratch on one 200 px away at ${a.at.toFixed(2)} → ${b.at.toFixed(2)} s`)
  }
  // Mano's crit applies (no cat crit cards), lobby stats apply once, the two lines stay apart
  {
    const r = catRun()
    cat(r)
    r.weapon.critChance = 1
    pickIn(r, 'critDamage')
    const want = catDamage(r) * r.weapon.critMul
    const hits = []
    enemy(r, r.player.x + 30, r.player.y)
    fight(r, 2, () => {})
    for (let t = 0; t < 2; t += FIXED) {
      r.fireT = 1e9
      step(r, FIXED, still)
      for (const ev of r.events) if (ev.type === 'hit' && ev.by === 'cat') hits.push(ev)
      r.events.length = 0
    }
    ok(hits.length > 0 && hits.every((h) => h.crit && near(h.n, want, 1e-6)), `Mano's 치명타 확률 and 치명타 피해 (the in-run card too) are the cats' (×${r.weapon.critMul} → ${Math.round(want)})`)
    ok(!Object.keys(B.upgrades.effects).some((id) => id.startsWith('cat') && /crit/i.test(id)), 'no crit card of the cats\' own')
  }
  {
    const plain = catRun()
    const L = { damage: 10, interval: 10 }
    const rich = catRun({ perma: L })
    const gm = gradeMul(D, 'S')
    ok(near(plain.catBase, BASE.damage * gm * F.damageCoef, 1e-9) && near(rich.catBase, BASE.damage * gm * B.perma.stats.damage.mul ** 10 * F.damageCoef, 1e-9), `a scratch's base = the ball's damage at the start (base ${BASE.damage} × grade S ${gm} × coin stat 공격 피해) × ${F.damageCoef}; the coin stat counted once (${Math.round(plain.catBase)} → ${Math.round(rich.catBase)})`)
    ok(near(catInterval(rich), F.interval * B.perma.stats.interval.mul ** 10, 1e-9), `the coin stat 공격 주기 shortens the scratch gap too (${F.interval} → ${catInterval(rich).toFixed(3)} s)`)
    cat(rich)
    const d0 = catDamage(rich)
    const g0 = catInterval(rich)
    const w0 = { damage: rich.weapon.damage, interval: rich.weapon.interval, count: rich.weapon.count }
    for (const id of ['damage', 'interval', 'count', 'bounce', 'size', 'ballSpeed', 'split']) pickIn(rich, id)
    ok(near(catDamage(rich), d0, 1e-9) && near(catInterval(rich), g0, 1e-9), "the ball's in-run cards never touch the cats")
    const w1 = { damage: rich.weapon.damage, interval: rich.weapon.interval, count: rich.weapon.count }
    for (const id of ['catClaw', 'catRate', 'catSize', 'catSpeed', 'catSummon']) pickIn(rich, id)
    ok(JSON.stringify(w1) === JSON.stringify({ damage: rich.weapon.damage, interval: rich.weapon.interval, count: rich.weapon.count }) && w1.damage > w0.damage, "and the cats' cards never touch the ball")
    ok(near(packMul(rich), 1 + F.packBonus * (rich.cat.n - 1), 1e-9), `the pack: with ${rich.cat.n} cats each scratch ×${packMul(rich)} (1 + ${F.packBonus} per cat beyond the first)`)
  }
  // the fight's end: they leave with it
  {
    const r = catRun()
    cat(r, 3)
    r.player.hp = 0.001
    r.player.inv = 0
    r.state = 'over'
    step(r, FIXED, still)
    ok(r.friends.length === 0, 'the fight over: the friend cats are gone')
  }
  // many cats, a full screen: no cap on cats, the step stays cheap
  {
    const time = (n) => {
      const r = newRun({ chapter: 10, cats: true, grade: 'S', seed: 9 })
      r.nextEvent = 1e9
      r.t = 150 // the late phase: a full screen
      r.fireT = 1e9
      for (let i = 0; i < n; i++) pickIn(r, 'catSummon')
      let ms = 0
      let k = 0
      for (let t = 0; t < 12; t += FIXED) {
        r.player.hp = r.player.maxHp
        r.state = 'play'
        r.fireT = 1e9
        for (const e of r.enemies) if (e.state === 'live') e.hp = e.maxHp // they stay: the screen stays full
        const a = performance.now()
        step(r, FIXED, still)
        if (t > 4) (ms += performance.now() - a), k++
        r.events.length = 0
      }
      return { ms: ms / k, cats: r.friends.length, mobs: r.enemies.length }
    }
    const a = time(0)
    const b = time(40)
    ok(b.cats === 40 && b.ms < 2, `40 friend cats (never capped) among ${b.mobs} monsters: ${b.ms.toFixed(3)} ms a step (${a.ms.toFixed(3)} ms without)`)
  }
}

// ── the rerolls ─────────────────────────────────────────────────────────────
{
  ok(newRun({ chapter: 5, rerolls: 2 }).rerolls === 0 && newRun({ chapter: 6, rerolls: 2 }).rerolls === 2 && newRun({ chapter: 6 }).rerolls === 0, `2 a run from chapter ${B.rerolls.fromChapter} on (with chapter 5's reward), none before`)
  const r = newRun({ chapter: 6, rerolls: 2, cats: true, seed: 3 })
  r.pending = 1
  r.state = 'levelup'
  r.choices = drawChoices(r)
  r.choiceSeq++
  const first = r.choices.slice()
  const seq = r.choiceSeq
  ok(reroll(r, seq) && r.rerolls === 1 && r.choices.length === 3 && !r.choices.some((id) => first.includes(id)) && r.state === 'levelup', `a redraw: three other cards (${first.join(', ')} → ${r.choices.join(', ')}), one left`)
  ok(!reroll(r, seq) && r.rerolls === 1, 'a tap on cards already redrawn does nothing')
  ok(reroll(r, r.choiceSeq) && r.rerolls === 0 && !reroll(r, r.choiceSeq), 'the second, then no more this run')
  ok(choose(r, r.choices[0], r.choiceSeq) && r.state === 'play', 'and a card is chosen as usual')
  let seen = 0
  const rr = newRun({ chapter: 6, rerolls: 1e6, seed: 4 })
  rr.state = 'levelup'
  rr.pending = 1
  rr.choices = drawChoices(rr)
  for (let i = 0; i < 3000; i++) {
    reroll(rr, rr.choiceSeq)
    if (rr.choices.includes('count')) seen++
  }
  ok(Math.abs(seen / 3000 - 3 / 13) < 0.04, `redrawn cards keep the equal chances (a card comes up ${((seen / 3000) * 100).toFixed(1)}% of redraws: 3 of the 13 not just shown)`)
  const w = newRun({ chapter: 16, rerolls: 2, tizzzz: true, seed: 8 })
  w.pending = 1
  w.state = 'levelup'
  w.choices = drawChoices(w)
  w.choiceSeq++
  reroll(w, w.choiceSeq)
  ok(!w.edit || (w.edit.seq === w.choiceSeq && w.choices.includes(w.edit.id)), "Tizzzz rewrites one of the new cards (never one put back)")
}


// ── zyo_ (chapter 15's first clear): the class change (zyo.js) ──────────────
{
  const S = D.story
  const g = S.cutscenes.groups.find((x) => x.id === 'ep03_clear')
  ok(g && g.chapter === 15 && g.when === 'clear' && g.reward === 'skulltown' && g.cuts.map((c) => c.image).join() === 'ep03_clear_01,ep03_clear_02,ep03_clear_03,ep03_clear_04,ep03_clear_05', "chapter 15's clear: the five zyo_ cuts in order, then chapter 15's reward")
  ok(g.cuts.map((c) => c.text).join('|') === '어!! zyo_!!|어? 그거 내 건데?|어어어??|우와!! 엄청 커!!|좋아! 이번엔 {next} 가볼까!' && g.cuts[0].banner === '아티스트 zyo_가 나타났다!' && !g.cuts.some((c) => c.layout), "Mano's lines; the banner keeps the underscore; every cut fills the screen")
  ok(S.regions[3].from === 16 && !S.cutscenes.groups.some((x) => x.chapter === 16), `the last line names chapter 16–20's region (${S.regions[3].name}); chapter 16 has no cutscene`)
  const R15 = S.rewards.skulltown
  ok(R15.lines.join('|') === 'zyo_ 전직 해금!|리롤 +2 (총 6회)|SS급 탱탱볼을 받았어요!' && R15.images.includes('reward_zyo') && D.storyAssets.images.some((x) => x.id === 'reward_zyo') && D.storyAssets.images.some((x) => x.id === 'zyo_face'), 'the reward popup: zyo_ 전직 해금!, 리롤 +2 (총 6회) and the SS ball, with its pictures')
  const Z = B.zyo
  ok(Z.activeFromChapter === 16 && Z.need === 7 && Object.values(Z.recipes).map((r) => r.mats.join('+')).join() === 'size+count,interval+ballSpeed,catSize+catRate,catSpeed+catClaw', 'four recipes, two cards ×7 each, from chapter 16')
  ok(Object.values(Z.recipes).every((r) => r.mats.every((m) => !B.upgrades.effects[m].levels)), 'every recipe card has no last level: ten picks are always possible')
}
// the recipe: zyo_'s card, then the class card; nothing before her chapter or without her
{
  const give = (run, id, n) => {
    for (let i = 0; i < n; i++) {
      run.state = 'levelup'
      run.pending = 1
      run.choices = [id]
      choose(run, id, run.choiceSeq)
    }
    run.state = 'play'
  }
  const levelUp = (run) => {
    run.orbs.push({ kind: 'xp', x: run.player.x, y: run.player.y, v: run.need * 1.01, pull: true })
    for (let i = 0; i < 10 && run.state !== 'levelup'; i++) step(run, FIXED, still)
  }
  const fresh = (o = {}) => {
    const run = newRun({ chapter: 16, grade: 'SS', cats: true, zyo: true, seed: 21, ...o })
    run.player.hp = run.player.maxHp = 1e12
    return run
  }
  ok(!newRun({ chapter: 15, zyo: true }).zyo && !newRun({ chapter: 16 }).zyo && newRun({ chapter: 16, zyo: true }).zyo, 'zyo_ is in a run from chapter 16, and only with her')
  const N = B.zyo.need
  for (const [k, R] of Object.entries(B.zyo.recipes)) {
    const run = fresh({ seed: 30 + k.charCodeAt(0) })
    if (R.form === 'ninja') give(run, 'catSummon', 2)
    give(run, R.mats[0], N)
    give(run, R.mats[1], N - 1)
    // one short: never a class card, never a fourth card; her recipe's card
    // when it comes (at random, as any other) is marked
    let before = 0
    let four = 0
    let marked = 0
    let seen = 0
    for (let i = 0; i < 40; i++) {
      levelUp(run)
      if (run.choices.some((id) => /^cls/.test(id))) before++
      if (run.choices.length !== 3) four++
      if (run.choices.includes(R.mats[1])) seen++, run.zyoPick && run.zyoPick.ids.includes(R.mats[1]) && marked++
      choose(run, run.choices.find((id) => !R.mats.includes(id)) || run.choices[0], run.choiceSeq)
      while (run.state === 'levelup') choose(run, run.choices.find((id) => !R.mats.includes(id)) || run.choices[0], run.choiceSeq)
    }
    give(run, R.mats[1], 1)
    // complete: its class card is drawn at random among the others
    let offered = 0
    let others = 0
    for (let i = 0; i < 60 && !offered; i++) {
      levelUp(run)
      if (run.choices.length !== 3) four++
      if (run.choices.includes('cls' + k)) offered++, run.zyoPick && run.zyoPick.ids.includes('cls' + k) ? 0 : (marked = -99)
      for (const o of Object.keys(B.zyo.recipes)) if (o !== k && run.choices.includes('cls' + o)) others++
      if (!offered) while (run.state === 'levelup') choose(run, run.choices.find((id) => !/^cls/.test(id)) || run.choices[0], run.choiceSeq)
    }
    choose(run, 'cls' + k, run.choiceSeq)
    while (run.state === 'levelup') choose(run, run.choices[0], run.choiceSeq)
    const changed = run.cls && run.cls.k === k && run.balls.length === 0 && run.friends.length === 0
    let later = 0
    let grow = 0
    let growMarked = 0
    for (let i = 0; i < 30; i++) {
      levelUp(run)
      if (run.choices.length !== 3) four++
      if (run.choices.some((id) => /^cls/.test(id) || Object.values(B.zyo.recipes).some((r) => r.mats.includes(id)))) later++
      if (run.choices.includes('power')) grow++, run.zyoPick && run.zyoPick.ids.join() === 'power' && growMarked++
      choose(run, run.choices.find((id) => id !== 'power') || run.choices[0], run.choiceSeq)
    }
    ok(before === 0 && four === 0 && seen > 0 && marked === seen && offered && others === 0 && changed && later === 0 && grow > 0 && grow < 30 && growMarked === grow && run.pool.join() === [...B.zyo.keep, 'power'].join(), `${k} (${R.mats.join(' + ')}): at ${N} + ${N - 1} no class card; never a fourth card (zyo_ adds none); her recipe's card, when it comes at random, is marked (${marked}/${seen}); at ${N} + ${N} the class card comes at random among the three, marked; taken, the ball and the cats stop, no recipe or class card again, the class's growth card comes now and then (${grow} of 30) and is marked`)
  }
  // the class is never by itself: complete, it waits for the player
  const r = fresh({ seed: 50 })
  give(r, 'size', B.zyo.need)
  give(r, 'count', B.zyo.need)
  for (let i = 0; i < 60 * 3; i++) step(r, FIXED, still)
  ok(!r.cls, 'a complete recipe changes nothing until its card is chosen')
  // the class's floor: a weak build changing late starts from a usual build's
  // firepower at its level, never from less
  {
    const w = fresh({ seed: 53 })
    give(w, 'size', B.zyo.need)
    give(w, 'count', B.zyo.need)
    w.level = 45
    const fp = firepower(w)
    const floor = w.fp0 * Math.exp(B.zyo.floor.perLevel * 44)
    give(w, 'clsA', 1)
    ok(w.fp0 > 0 && fp < floor && near(w.cls.base, floor), `a weak build at level 45 (firepower ${fp.toExponential(2)}) starts its class from the floor ${floor.toExponential(2)} (its start × e^(${B.zyo.floor.perLevel} × 44))`)
  }
  // once a run: a second class card is refused
  give(r, 'clsA', 1)
  r.state = 'levelup'
  r.pending = 1
  r.choices = ['clsB']
  choose(r, 'clsB', r.choiceSeq)
  ok(r.cls.k === 'A' && !r.picks.clsB === false && r.cls.revives === 0, 'once a run: a second class card does nothing (it stays 거대 탱탱볼 · 회전 방어막)')
  // Tizzzz: a rewritten recipe card counts as two picks; she never rewrites a class card
  const t = fresh({ tizzzz: true, seed: 51 })
  t.state = 'levelup'
  t.pending = 1
  t.choices = ['size', 'count', 'damage']
  t.choiceSeq++
  t.edit = { id: 'size', seq: t.choiceSeq }
  choose(t, 'size', t.choiceSeq)
  ok(t.picks.size === 2 && !canEdit(t, 'clsA') && canEdit(t, 'size'), 'a card Tizzzz rewrote counts as two steps of its recipe; a class card is never rewritten')
  // the collectors stay; the fighting cats never come back
  const c = fresh({ seed: 52 })
  give(c, 'catSummon', 3)
  give(c, 'catSize', B.zyo.need)
  give(c, 'catRate', B.zyo.need)
  give(c, 'clsC', 1)
  for (let i = 0; i < 60 * 3; i++) step(c, FIXED, still)
  ok(c.friends.length === 0 && c.cats.length === 3 && c.cls.units.length === B.zyo.ninja.count, `after it: ${B.zyo.ninja.count} ninja cats, no fighting cat; 단추·호두·모루 still pick things up`)
}
// the attacks and the specials
{
  const make = (k, o = {}) => {
    const run = newRun({ chapter: 16, grade: 'SS', cats: true, zyo: true, seed: 61, ...o })
    run.player.hp = run.player.maxHp = 1000
    run.spawnT = -1e9
    run.nextEvent = 1e9
    if (B.zyo.recipes[k].form === 'ninja') {
      run.cat.n = 3
      run.picks.catSummon = 3
    }
    run.state = 'levelup'
    run.pending = 1
    run.choices = ['cls' + k]
    choose(run, 'cls' + k, run.choiceSeq)
    for (let i = 0; i < 60 * (B.zyo.fxSeconds + 0.1); i++) step(run, FIXED, still)
    return run
  }
  const fx = make('A')
  ok(fx.cls.units.length === B.zyo.ball.count && fx.cls.shield.length === B.zyo.shield.count, `거대 탱탱볼: ${B.zyo.ball.count} giant balls and (회전 방어막) ${B.zyo.shield.count} more round Mano, however big the build`)
  // the shield turns round her and pushes monsters out of its ring
  const a0 = fx.cls.shield[0].a
  const e = spawnAt(fx, 'imp', { x: fx.player.x + 20, y: fx.player.y })
  e.hp = e.maxHp = 1e30
  for (let i = 0; i < 60; i++) step(fx, FIXED, still)
  const d = Math.hypot(e.x - fx.player.x, e.y - fx.player.y)
  ok(fx.cls.shield[0].a > a0 + 2 && d >= B.zyo.shield.orbit && fx.stats.by.shield && fx.stats.by.shield.hits > 0, `the shield turns and hits; a monster next to her is pushed out to ${d.toFixed(0)} px (its ring: ${B.zyo.shield.orbit + B.zyo.shield.radius})`)
  // the giant balls chase and hit, on a boss too
  const gb = make('B')
  const boss = spawnAt(gb, 'boss', { x: gb.player.x + 150, y: gb.player.y - 30 })
  boss.hp = boss.maxHp = 1e30
  for (let i = 0; i < 60 * 3; i++) step(gb, FIXED, still)
  ok(gb.stats.by.giant && gb.stats.by.giant.boss > 0, 'the giant balls go for the boss on screen and hit it')
  // 최후의 반격: once, the blast, full HP, a moment safe; the next fall is the end
  const rb = make('B')
  const near1 = spawnAt(rb, 'imp', { x: rb.player.x + 60, y: rb.player.y })
  near1.hp = near1.maxHp = rb.cls.base // (one the blast fells)
  const bigb = spawnAt(rb, 'boss', { x: rb.player.x - 90, y: rb.player.y })
  for (let i = 0; i < 30; i++) step(rb, FIXED, still)
  // (a boss the blast alone would fell twice over, behind a spent guard)
  bigb.hp = bigb.maxHp = (rb.cls.base * rb.cls.bonus * B.zyo.revive.seconds) / 2
  Object.assign(bigb, { guard: true, guardLeft: 0, guardT: rb.t })
  const p = rb.player
  p.hp = 1
  p.inv = 0
  spawnAt(rb, 'imp', { x: p.x, y: p.y })
  let bossLost = 0
  for (let i = 0; i < 60 && rb.state === 'play' && rb.cls.revives > 0; i++) {
    const before = bigb.hp
    step(rb, FIXED, still)
    if (rb.cls.revives === 0) bossLost = (before - bigb.hp) / bigb.maxHp
  }
  // (what the blast fells may bring a level-up: she is up either way)
  const blew = rb.cls.revives === 0 && (rb.state === 'play' || rb.state === 'levelup') && p.hp === p.maxHp && p.inv > 1.5 && near1.state !== 'live'
  while (rb.state === 'levelup') choose(rb, rb.choices[0], rb.choiceSeq)
  ok(blew && bossLost > 0 && bossLost <= B.zyo.revive.bossCap + 1e-9, `최후의 반격: she gets up with full HP and ${B.zyo.revive.inv} s safe; the blast fells what is near and takes ${(bossLost * 100).toFixed(0)}% of a guarded boss (at most ${B.zyo.revive.bossCap * 100}%)`)
  p.inv = 0
  p.hp = 1
  for (let i = 0; i < 60 * 3 && rb.state === 'play'; i++) (p.inv = 0), step(rb, FIXED, still)
  ok(rb.state !== 'play', 'once a run: the next fall is the end')
  // 닌자냥이: dash to a monster and slash; 흡혈 heals by the HP taken, never past full, no overkill
  const nc = make('C')
  nc.player.hp = 500
  const m = spawnAt(nc, 'imp', { x: nc.player.x + 140, y: nc.player.y })
  m.hp = m.maxHp = 1e30
  for (let i = 0; i < 60 * 3; i++) step(nc, FIXED, still)
  const healed = nc.cls.healed
  ok(nc.stats.by.ninja && nc.stats.by.ninja.hits > 0 && healed === 0, 'the ninja cats dash to a monster and slash it; a monster that loses no share of its HP heals nothing')
  const m2 = spawnAt(nc, 'boss', { x: nc.player.x + 120, y: nc.player.y })
  for (let i = 0; i < 20; i++) step(nc, FIXED, still)
  m2.hp = m2.maxHp = nc.cls.base * 400
  const hp0 = nc.player.hp
  let over = false
  for (let i = 0; i < 60 * 4; i++) {
    nc.player.inv = 1 // (nothing hurts her here: only the healing counts)
    step(nc, FIXED, still)
    if (nc.player.hp > nc.player.maxHp) over = true
  }
  const gain = nc.player.hp - hp0
  ok(gain > 0 && !over && gain <= B.zyo.lifesteal.perSecond * nc.player.maxHp * 5 + 1e-6, `흡혈: slashing a boss heals ${gain.toFixed(0)} in 4 s (never past full, at most ${B.zyo.lifesteal.perSecond * 100}% of her HP a second, and one second's worth kept in store)`)
  // 쌍둥이 워프홀: two holes far apart; in one, out of the other, never back at once
  const wd = make('D')
  const [h0, h1] = wd.cls.warps
  const [bx0, by0, bx1, by1] = wd.arena.bounds
  const far = Math.hypot(h1.x - h0.x, h1.y - h0.y)
  wd.player.x = h0.x + 40
  wd.player.y = h0.y
  let warps = 0
  for (let i = 0; i < 60; i++) step(wd, FIXED, { x: -1, y: 0 })
  warps = wd.stats.warps || 0
  const at1 = Math.abs(wd.player.y - h1.y) < 1 && wd.player.x < h1.x + 1
  for (let i = 0; i < 30; i++) step(wd, FIXED, still)
  ok(far > Math.min(bx1 - bx0, by1 - by0) * 0.5 && warps === 1 && at1 && (wd.stats.warps || 0) === 1, `warp holes ${far.toFixed(0)} px apart; walking into one she comes out of the other and stays (no bouncing back)`)
  for (let i = 0; i < 120 && (wd.stats.warps || 0) < 2; i++) step(wd, FIXED, { x: 1, y: 0 })
  ok((wd.stats.warps || 0) === 2 && Math.hypot(wd.player.x - h0.x, wd.player.y - h0.y) < 3, 'out of it and back in: she goes back the other way')
  const mon = spawnAt(wd, 'imp', { x: h0.x, y: h0.y })
  for (let i = 0; i < 60; i++) step(wd, FIXED, still)
  ok(Math.hypot(mon.x - h1.x, mon.y - h1.y) > 100, 'monsters never use the holes')
  // 전투력: damage and rate, rewritten by Tizzzz twice over; the units stay as many
  const pw = make('A', { tizzzz: true })
  const n0 = pw.cls.units.length
  const E = B.upgrades.effects.power
  pw.level = (E.damageMulFrom || 0) + 10
  const m0 = (E.damageMul + (E.damageMulPerLevel || 0) * 10) ** (E.pow || 1)
  const m1 = m0
  pw.state = 'levelup'
  pw.pending = 1
  pw.choices = ['power', 'crit']
  pw.choiceSeq++
  pw.edit = { id: 'power', seq: pw.choiceSeq }
  choose(pw, 'power', pw.choiceSeq)
  ok(near(pw.cls.dmg, m0 * m1) && near(pw.cls.rate, E.rateMul ** (2 * (E.pow || 1))) && pw.cls.units.length === n0 && pw.picks.power === 2, `전투력 (Tizzzz: twice): damage ×${m0.toFixed(3)} twice (at level ${pw.level}: (${E.damageMul} + ${E.damageMulPerLevel} × 10)^${E.pow || 1}), rate ×${E.rateMul}^${2 * (E.pow || 1)}; still ${n0} giant balls`)
}
// the skill over the screen, and what 전투력 levels change (never more units)
{
  for (const k of ['A', 'C']) {
    const run = newRun({ chapter: 16, grade: 'SS', cats: true, zyo: true, seed: 81 })
    run.player.hp = run.player.maxHp = 1e12
    run.spawnT = -1e9
    run.nextEvent = 1e9
    if (k === 'C') (run.cat.n = 3), (run.picks.catSummon = 3)
    run.state = 'levelup'
    run.pending = 1
    run.choices = ['cls' + k]
    choose(run, 'cls' + k, run.choiceSeq)
    // monsters far apart over the screen, out of the units' reach
    const [vx0, vy0, vx1, vy1] = run.view
    const far = [[vx0 + 30, vy0 + 30], [vx1 - 30, vy0 + 30], [vx0 + 30, vy1 - 30], [vx1 - 30, vy1 - 30]].map(([x, y]) => {
      const e = spawnAt(run, 'imp', { x, y })
      e.hp = e.maxHp = 1e30
      e.speed = 0
      return e
    })
    let casts = 0
    let hits = 0
    const struck = new Set()
    for (let i = 0; i < 60 * 8; i++) {
      step(run, FIXED, still)
      for (const ev of run.events) {
        casts += ev.type === 'skillCast'
        if (ev.type !== 'skillHit') continue
        hits++
        for (const e of far) if (Math.hypot(e.x - ev.x, e.y - ev.y) < 12) struck.add(e.id)
      }
      run.events.length = 0
      for (const e of far) e.hp = e.maxHp
    }
    // (the four corners, far from the units: every one struck)
    ok(casts >= 2 && hits >= (casts - 1) * B.zyo.skill.count && run.stats.by.skill.eff > 0 && struck.size === 4, `${B.zyo.recipes[k].form === 'ball' ? '탱탱 메테오' : '그림자 분신'}: ${casts} casts in 8 s, ${hits} strikes on monsters all over the screen`)
  }
  const run = newRun({ chapter: 16, grade: 'SS', cats: true, zyo: true, tizzzz: true, seed: 82 })
  run.state = 'levelup'
  run.pending = 1
  run.choices = ['clsB']
  choose(run, 'clsB', run.choiceSeq)
  for (let i = 0; i < 60 * 2; i++) step(run, FIXED, still)
  const g0 = growth(run)
  const n0 = run.cls.units.length
  for (let i = 0; i < 6; i++) {
    run.state = 'levelup'
    run.pending = 1
    run.choices = ['power']
    choose(run, 'power', run.choiceSeq)
  }
  ok(classLevel(run) === 6 && near(growth(run), 1 + 6 * B.zyo.growth.perLevel) && growth(run) > g0 && run.cls.units.length === n0, `전투력 Lv.6: the giant balls and their hit areas ×${growth(run).toFixed(2)}, still ${n0} of them`)
  // zyo_ marks the drawn cards of her recipe (the ones it still needs)
  const z = newRun({ chapter: 16, cats: true, zyo: true, seed: 83 })
  z.picks.catSummon = 1
  z.cat.n = 1
  z.picks.catSize = 2
  z.picks.catRate = 1
  z.state = 'levelup'
  z.choices = ['catRate', 'crit', 'catSize']
  z.choiceSeq++
  const marks = zyoMarks(z)
  ok(marks.includes('catRate') && marks.includes('catSize') && !marks.includes('crit'), 'zyo_ marks the drawn cards of her recipe')
}
// saves: chapter 15 cleared before zyo_ came (story v3), and older
{
  const save = (cleared, v, extra = {}) => {
    const mem = new Mem()
    const P = createProgress(D, mem)
    P.boot()
    // (the balls of 15 on came with story v 6: an older save never had them)
    const late = new Set()
    for (let ch = 1; ch <= cleared; ch++) {
      const r = P.startRun(ch)
      const f = P.finishRun(r.runId, ch, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
      if (f.story && ch >= 15 && f.story.item) late.add(f.story.item.id)
    }
    const d = P.get()
    d.inventory = d.inventory.filter((it) => !late.has(it.id))
    d.story.v = v
    d.zyo = { unlocked: false }
    Object.assign(d, extra)
    mem.setItem(KEY, JSON.stringify(d))
    return createProgress(D, mem).boot().data
  }
  const a = save(15, 3)
  ok(a.zyo.unlocked && a.rerolls === 6 && a.story.news.includes('ep03') && a.story.seen.includes('ep03_clear') && a.inventory.filter((it) => it.grade === 'SS').length === 2 && a.story.news.includes('balls'), 'a save that cleared 15 before zyo_: she comes now (news once), 6 rerolls, her cutscene counted as seen, and chapter 15\'s new SS ball (story v 6)')
  const b = save(12, 3)
  ok(!b.zyo.unlocked && !b.story.news.includes('ep03') && !b.story.seen.includes('ep03_clear'), 'one that has not cleared 15: no zyo_ yet, her cutscene still to come')
  const c = save(15, 2)
  ok(c.zyo.unlocked && c.tizzzz.unlocked && c.rerolls === 6, 'an older one (Tizzzz once at 15): Tizzzz stays (chapter 10), zyo_ comes')
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  for (let ch = 1; ch <= 14; ch++) {
    const r = P.startRun(ch)
    P.finishRun(r.runId, ch, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
  }
  const r15 = P.startRun(15)
  const f = P.finishRun(r15.runId, 15, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
  const r15b = P.startRun(15)
  const f2 = P.finishRun(r15b.runId, 15, { cleared: true, coins: 0, kills: 1, time: 1, elites: 0 })
  ok(f.story && f.story.reward === 'skulltown' && P.get().zyo.unlocked && !f2.story && P.get().rerolls === 6, 'first clear of 15: zyo_ for good; again: nothing more')
}
// the class keeps the screen clear: a few units, cheap steps
{
  const run = newRun({ chapter: 18, grade: 'SS', cats: true, zyo: true, seed: 71 })
  run.player.hp = run.player.maxHp = 1e15
  run.nextEvent = 1e9
  run.t = 150
  for (let i = 0; i < 10; i++) {
    run.state = 'levelup'
    run.pending = 1
    run.choices = ['count']
    choose(run, 'count', run.choiceSeq)
  }
  run.state = 'levelup'
  run.pending = 1
  run.choices = ['clsA']
  choose(run, 'clsA', run.choiceSeq)
  for (let i = 0; i < 140; i++) spawnAt(run, i % 2 ? 'imp' : 'slime', { x: 30 + ((i * 37) % 300), y: 120 + ((i * 53) % 480) })
  for (let i = 0; i < 120; i++) step(run, FIXED, still)
  const t0 = performance.now()
  for (let i = 0; i < 600; i++) step(run, FIXED, still)
  const ms = (performance.now() - t0) / 600
  ok(run.cls.units.length + run.cls.shield.length <= 5 && run.balls.length === 0 && ms < 2, `after the change (1024 balls a volley before): ${run.cls.units.length + run.cls.shield.length} giant balls, ${ms.toFixed(3)} ms a step with 140 monsters`)
}

// ── chapter 20: its clear cutscene, the turret's unlock, the turret ─────────
{
  const S = D.story
  const g = S.cutscenes.groups.find((x) => x.id === 'ep04_clear')
  ok(g && g.chapter === 20 && g.when === 'clear' && g.reward === 'desert' && g.play !== false && g.cuts.map((c) => c.image).join() === 'ep04_clear_01,ep04_clear_02,ep04_clear_03,ep04_clear_04,ep04_clear_05', "chapter 20's clear: the five new cuts in order, then its reward")
  ok(g.cuts.map((c) => c.text).join('|') === '흐음...|에잇!|어?|오ㅋㅋㅋ 또 해봐!!|좋아! {next} 가자!' && S.regions[4].from === 21 && S.regions[4].name === '눈 덮인 산', `Mano's five lines; the last names the region of chapters 21–25 from the data (${S.regions[4].name})`)
  ok(D.storyAssets.images.filter((x) => x.id.startsWith('ep04_clear_')).every((x) => x.kind === 'cutscene' && x.out[0] / x.out[1] > 1.7) && D.storyAssets.images.some((x) => x.id === 'reward_turret'), 'the five pictures are wide (16:9), whole; the turret\'s reward picture is there')
  const TA = D.storyAssets.images.find((x) => x.id === 'turret')
  ok((await import('fs')).existsSync(new URL('../src/survivor/assets/s84/' + (TA ? TA.file : 'x'), import.meta.url)) && TA && TA.kind === 'atlas' && ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'].every((w) => TA.frames[w] && TA.frames[w][0] + TA.frames[w][2] <= TA.out[0] && TA.muzzle[w]), "the turret's picture: eight ways, each with its foot and mouth, inside the atlas")
  const NA = D.storyAssets.images.find((x) => x.id === 'ninja_cat')
  const inAtlas = (f) => f[0] + f[2] <= NA.out[0] && f[1] + f[3] <= NA.out[1] && f[4] > 0 && f[4] < f[2] && f[5] > 0 && f[5] <= f[3]
  ok((await import('fs')).existsSync(new URL('../src/survivor/assets/s84/' + (NA ? NA.file : 'x'), import.meta.url)) && NA && NA.kind === 'atlas' && NA.bodyH > 0 && ['dash', 'slash', 'air', 'land'].every((a) => NA.frames[a] && NA.frames[a].length && NA.frames[a].every(inAtlas)) && NA.frames.slash.length === 6, "the ninja cats' picture: dash, six blows, the leap and the landing, each inside the atlas with its foot")
  const R = S.rewards.desert
  ok(R.turret && R.rerolls === 8 && R.blessing === 'phoenix' && R.lines[0] === '포탑 제작 해금!' && R.lines[1] === '리롤 +2 (총 8회)', 'the popup: 포탑 제작 해금! and 리롤 +2 (총 8회) (the phoenix gem stays chapter 20\'s)')
  ok(S.cutscenes.groups.filter((x) => x.chapter === 21 && x.play !== false).length === 0, 'no cutscene at the start of chapter 21')
  // a save: 15 cleared, then 20
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const clear = (ch) => {
    const r = P.startRun(ch)
    return P.finishRun(r.runId, ch, { cleared: true, time: 200, kills: 1, coins: 0, level: 10, elites: 2, bossLeft: 0 })
  }
  for (let ch = 1; ch <= 19; ch++) clear(ch)
  const before = P.get()
  ok(!before.turret.unlocked && before.rerolls === 6 && !P.startRun(20).turret, 'before chapter 20: no turret, 6 rerolls')
  const c20 = clear(20)
  const after = P.get()
  ok(c20.story && c20.story.reward === 'desert' && after.turret.unlocked && after.rerolls === 8 && after.blessings.phoenix, "chapter 20's first clear: the turret, 8 rerolls, the phoenix gem")
  ok(!clear(20).story && P.get().rerolls === 8, 'clearing chapter 20 again gives nothing more')
  const s21 = P.startRun(21)
  ok(s21.turret && s21.rerolls === 8, 'a run started now: the turret and 8 rerolls')
  ok(createRun(D, { chapter: 21, weaponId: 'bouncy_ball', grade: 'SS', seed: 1, turret: true, rerolls: 8 }).turretOn && !createRun(D, { chapter: 20, weaponId: 'bouncy_ball', grade: 'SS', seed: 1, turret: true }).turretOn && createRun(D, { chapter: 21, weaponId: 'bouncy_ball', grade: 'SS', seed: 1, rerolls: 8 }).rerolls === 8, 'the turret from chapter 21, with it only; 8 rerolls a run')
  // an older save (story v4) that cleared chapter 20 before: told once
  const old = JSON.parse(JSON.stringify(before))
  old.story.v = 4
  old.story.rewards = [...old.story.rewards, 'desert']
  old.firstCleared = [...old.firstCleared, 20]
  old.blessings.phoenix = true
  const got = migrateStory(D, old)
  ok(old.turret.unlocked && old.rerolls === 8 && old.story.news.includes('ep04') && got.length === 0 && old.story.seen.includes('ep04_clear') && old.story.v === 6, 'a save that cleared chapter 20 before: the turret and 8 rerolls now, told once; its new cutscene counts as seen')
  const young = JSON.parse(JSON.stringify(before))
  young.story.v = 4
  migrateStory(D, young)
  ok(!young.turret.unlocked && young.rerolls === 6, 'one that has not: nothing')
}
// the turret: two picks of the run's upgrades taken back, one turret
{
  const T = B.turret
  const fresh = (o = {}) => {
    const run = newRun({ chapter: 21, grade: 'SS', turret: true, seed: 91, ...o })
    run.player.hp = run.player.maxHp = 1e12
    run.spawnT = -1e9
    run.nextEvent = 1e9
    return run
  }
  const give = (run, id, n) => {
    for (let i = 0; i < n; i++) {
      run.state = 'levelup'
      run.pending = 1
      run.choices = [id]
      choose(run, id, run.choiceSeq)
    }
    run.state = 'play'
  }
  const atLevelUp = (run) => {
    run.state = 'levelup'
    run.pending = 1
    run.choices = ['crit', 'move', 'luck']
    run.choiceSeq++
  }
  const run = fresh()
  const w0 = { ...run.weapon }
  give(run, 'damage', 6)
  give(run, 'interval', 4)
  give(run, 'bounce', 4)
  const E = B.upgrades.effects
  ok(near(run.weapon.damage, w0.damage * E.damage.mul ** 6, 1e-6 * w0.damage * 20) && materialCount(run) === 14 && canMake(run), '공격 피해 ×6, 공격 주기 ×4, 최대 반사 ×4: 14 picks, a turret can be made')
  ok(!makeTurret(run, ['damage'], run.choiceSeq) && !makeTurret(run, ['damage', 'damage'], run.choiceSeq), 'nothing outside a level-up, nor one pick')
  atLevelUp(run)
  ok(!makeTurret(run, ['damage', 'count'], run.choiceSeq) && run.state === 'levelup' && run.picks.damage === 6, 'never a pick the run does not have')
  const plans = [['damage', 'damage'], ['damage', 'interval'], ['interval', 'interval'], ['bounce', 'bounce'], ['damage', 'bounce'], ['damage', 'interval'], ['damage', 'bounce']]
  let exact = true
  const spots = []
  for (const ids of plans) {
    atLevelUp(run)
    const shown = run.choices.join()
    const t = makeTurret(run, ids, run.choiceSeq)
    // (the level-up is not spent: its cards stay to be chosen)
    if (!t || t.length !== 1 || run.state !== 'levelup' || run.choices.join() !== shown) exact = false
    spots.push(t)
    const want = {
      damage: w0.damage * E.damage.mul ** (run.picks.damage || 0),
      interval: w0.interval * E.interval.mul ** (run.picks.interval || 0),
      bounces: Math.round(w0.bounces * E.bounce.mul ** (run.picks.bounce || 0)),
    }
    if (!near(run.weapon.damage, want.damage, want.damage * 1e-9) || !near(run.weapon.interval, want.interval, 1e-12) || run.weapon.bounces !== want.bounces) exact = false
  }
  ok(exact && run.turrets.length === 7 && materialCount(run) === 0 && !canMake(run) && !run.picks.damage && !run.picks.interval && !run.picks.bounce, `14 picks → 7 turrets, each pair taken back exactly (damage, gap, bounces back to the start: ${run.weapon.damage.toFixed(1)} / ${w0.damage.toFixed(1)})`)
  const [x0, y0, x1, y1] = run.arena.bounds
  const apart = run.turrets.every((t, i) => run.turrets.every((u, j) => i === j || Math.hypot(t.x - u.x, t.y - u.y) >= T.place.apart * 0.5))
  ok(run.turrets.every((t) => t.x >= x0 + T.place.margin - 1e-9 && t.x <= x1 - T.place.margin + 1e-9 && t.y >= y0 + T.place.margin - 1e-9 && t.y <= y1 - T.place.margin + 1e-9) && apart && new Set(run.turrets.map((t) => Object.keys(t).sort().join())).size === 1, 'every turret inside the field, apart from the others, all the same kind')
  // several at once, then the level-up's card as ever
  const sev = fresh({ seed: 99 })
  give(sev, 'move', 4)
  give(sev, 'luck', 3)
  atLevelUp(sev)
  const odd = makeTurret(sev, ['move', 'move', 'luck'], sev.choiceSeq)
  const three = makeTurret(sev, ['move', 'move', 'move', 'move', 'luck', 'luck'], sev.choiceSeq)
  const card = sev.choices[0]
  const picked = choose(sev, card, sev.choiceSeq)
  ok(!odd && three && three.length === 3 && sev.turrets.length === 3 && !sev.picks.move && sev.picks.luck === 1 + (card === 'luck' ? 1 : 0) && picked && sev.state === 'play', `six picks at once: three turrets; an odd one (three picks) makes none; then the level-up's card (${card}) is chosen as ever`)
  // a class card shown whose recipe a turret breaks is drawn again
  const cc = fresh({ zyo: true, seed: 100 })
  give(cc, 'size', B.zyo.need)
  give(cc, 'count', B.zyo.need)
  atLevelUp(cc)
  cc.choices = ['clsA', 'move', 'crit']
  makeTurret(cc, ['size', 'count'], cc.choiceSeq)
  ok(!cc.choices.includes('clsA') && cc.choices.length === 3 && cc.state === 'levelup', `a turret of recipe cards while their class card is shown: it goes, another card in its place (${cc.choices.join(', ')})`)
  // it shoots the nearest monster in range; the field shrinks: they move in
  const shot = fresh({ seed: 92 })
  give(shot, 'move', 2)
  atLevelUp(shot)
  const [t] = makeTurret(shot, ['move', 'move'], shot.choiceSeq)
  shot.state = 'play'
  const m = spawnAt(shot, 'slime', { x: t.x + 60, y: t.y })
  m.hp = m.maxHp = 1e30
  m.speed = 0
  let shots = 0
  for (let i = 0; i < 60 * 3; i++) {
    step(shot, FIXED, still)
    shots += shot.events.filter((e) => e.type === 'turretShot').length
    shot.events.length = 0
  }
  const by = shot.stats.by.turret
  ok(shots >= 3 && by && by.hits === shots && near(by.raw / by.hits, turretHit(shot), turretHit(shot) * 1e-6), `a turret shoots the monster near it (${shots} shots in 3 s, each ${turretHit(shot).toExponential(2)})`)
  shot.extra = { box: [100, 100, 260, 300] }
  for (const u of shot.turrets) (u.x = 900), (u.y = 900)
  relocateTurrets(shot)
  ok(shot.turrets.every((u) => u.x >= 100 && u.x <= 260 && u.y >= 100 && u.y <= 300), 'an extra special boss\'s fight area: the turrets are put inside it, at random')
  const bare = fresh({ seed: 93, perma: { hp: 66, damage: 68, interval: 68, crit: 40, move: 10, coins: 8 }, cats: true, tizzzz: true, zyo: true, blessings: { phoenix: true, snow: true } })
  ok(bare.turrets.length === 0 && materialCount(bare) === 0 && !canMake(bare), 'a new run starts with none, and nothing to make one of: the lobby\'s stats, the weapon, the blessings are never material')
  // the class: its recipe cards are gone; the others stay material
  const z = fresh({ zyo: true, seed: 94 })
  give(z, 'size', B.zyo.need)
  give(z, 'count', B.zyo.need)
  give(z, 'damage', 5)
  give(z, 'armor', 1)
  give(z, 'clsA', 1)
  const mz = materials(z)
  ok(z.cls && !mz.size && !mz.count && mz.damage === 5 && mz.armor === 1 && !mz.clsA, 'after the class change its recipe cards are no turret material; the other picks are')
  // an 8th pick of a recipe card: the change used 7, the 8th is material
  const z8 = fresh({ zyo: true, seed: 98 })
  give(z8, 'size', B.zyo.need + 1)
  give(z8, 'count', B.zyo.need)
  give(z8, 'clsA', 1)
  const m8 = materials(z8)
  ok(m8.size === 1 && !m8.count && sunk(z8, 'size'), `a recipe card picked ${B.zyo.need + 1} times: after the change ${B.zyo.need} went to the class, 1 is left as turret material (and costs nothing: the ball is gone)`)
  give(z8, 'move', 1)
  atLevelUp(z8)
  ok(makeTurret(z8, ['size', 'move'], z8.choiceSeq) && z8.picks.size === B.zyo.need && !materials(z8).size && z8.cls.k === 'A', 'a turret of it: 7 left, the class stays')
  give(z, 'power', 2)
  // the ball is gone: its picks do nothing now (a turret of them costs nothing)
  const zc = z.cls.base * z.cls.dmg * z.cls.rate
  const hit0 = turretHit(z)
  ok(sunk(z, 'damage') && !sunk(z, 'armor') && !sunk(z, 'power') && near(turretBase(z), zc, zc * 1e-12) && near(hit0, B.turret.power * zc * B.turret.interval, hit0 * 1e-12), "after the change: 공격 피해 is sunk (the ball is gone), 단단한 후드 and 전투력 are not; the turrets' blow follows the class (its strength at the change × 전투력), not the dead ball")
  const cls0 = { ...z.cls }
  atLevelUp(z)
  makeTurret(z, ['damage', 'damage'], z.choiceSeq)
  ok(z.turrets.length === 1 && z.cls.dmg === cls0.dmg && z.cls.base === cls0.base && near(turretHit(z), hit0, hit0 * 1e-12), 'a turret of two sunk picks: the class and every turret\'s blow stay as they were')
  const dmg0 = z.cls.dmg
  atLevelUp(z)
  makeTurret(z, ['power', 'damage'], z.choiceSeq)
  ok(z.cls && z.cls.k === 'A' && z.picks.power === 1 && z.cls.dmg < dmg0 && z.turrets.length === 2 && turretHit(z) < hit0, 'a turret of the class\'s growth card and a damage pick: the class stays, one growth level less (the turrets\' blow too)')
  ok(!sunk(fresh({ seed: 97 }), 'damage'), 'before a class change no pick is sunk')
  // before it: a turret of a recipe card puts the class card off again
  const y = fresh({ zyo: true, seed: 95 })
  give(y, 'size', B.zyo.need)
  give(y, 'count', B.zyo.need)
  const ready = drawChoices(y).length >= 0 && recipes(y).find((r) => r.k === 'A').ready
  atLevelUp(y)
  makeTurret(y, ['size', 'count'], y.choiceSeq)
  ok(ready && !recipes(y).find((r) => r.k === 'A').ready && !y.cls, 'a turret of recipe cards before the change: the recipe is short again (the class card waits)')
  // many turrets stay cheap
  const many = fresh({ seed: 96 })
  give(many, 'move', 80)
  for (let i = 0; i < 40; i++) {
    atLevelUp(many)
    makeTurret(many, ['move', 'move'], many.choiceSeq)
  }
  for (let i = 0; i < 140; i++) spawnAt(many, i % 2 ? 'imp' : 'slime', { x: 30 + ((i * 37) % 300), y: 120 + ((i * 53) % 480) })
  for (const e of many.enemies) e.hp = e.maxHp = 1e30
  for (let i = 0; i < 60; i++) step(many, FIXED, still)
  const t0 = performance.now()
  for (let i = 0; i < 600; i++) step(many, FIXED, still), (many.events.length = 0)
  const ms = (performance.now() - t0) / 600
  ok(many.turrets.length === 40 && ms < 2, `40 turrets and 140 monsters: ${ms.toFixed(3)} ms a step`)
}

// ── a recipe just complete: its class card for sure, once; ties both marked ──
{
  const N = B.zyo.need
  let sureFirst = 0
  let laterAll = 0
  const TRIES = 20
  for (let seed = 1; seed <= TRIES; seed++) {
    const run = newRun({ chapter: 16, grade: 'SS', zyo: true, seed: 300 + seed })
    run.rerolls = 100
    run.picks.size = N
    run.picks.count = N
    run.state = 'levelup'
    run.choices = ['crit', 'move', 'luck']
    reroll(run, run.choiceSeq) // (a level-up's draw: openChoice)
    if (run.choices.includes('clsA') && run.choices.length === 3) sureFirst++
    let all = true
    for (let i = 0; i < 6; i++) {
      reroll(run, run.choiceSeq)
      if (!run.choices.includes('clsA')) all = false
    }
    if (all) laterAll++
  }
  ok(sureFirst === TRIES && laterAll < TRIES / 2, `a recipe just complete: the next level-up has its class card for sure (${sureFirst}/${TRIES}), still three cards; after that at random again (always there after: ${laterAll}/${TRIES})`)
  const t = newRun({ chapter: 16, grade: 'SS', zyo: true, seed: 330 })
  t.picks.size = t.picks.count = 5
  t.picks.interval = t.picks.ballSpeed = 5
  t.state = 'levelup'
  t.choices = ['size', 'ballSpeed', 'crit']
  t.choiceSeq++
  const tm = zyoMarks(t)
  ok(zyoTargets(t).map((r) => r.k).join() === 'A,B' && tm.includes('size') && tm.includes('ballSpeed') && !tm.includes('crit'), 'two recipes level (5/7 + 5/7 and 5/7 + 5/7): zyo_ marks the cards of both')
  t.picks.interval = 6
  ok(zyoTargets(t).map((r) => r.k).join() === 'B', 'one ahead (6/7 + 5/7): only that one')
}

// ── the coin stat 치명타 확률 at 100%: no crit card in a run ───────────────
{
  const full = newRun({ chapter: 21, grade: 'SS', perma: { crit: 101 }, cats: true, tizzzz: true, zyo: true, seed: 401 })
  const less = newRun({ chapter: 21, grade: 'SS', perma: { crit: 100 }, cats: true, tizzzz: true, zyo: true, seed: 401 })
  let crit = 0
  let three = true
  full.rerolls = 400
  full.state = 'levelup'
  full.choices = ['move', 'luck', 'armor']
  for (let i = 0; i < 300; i++) {
    reroll(full, full.choiceSeq)
    if (full.choices.includes('crit')) crit++
    if (full.choices.length < 3) three = false
  }
  let seenLess = 0
  for (let i = 0; i < 300; i++) if (drawChoices(less).includes('crit')) seenLess++
  ok(full.critFull && !full.pool.includes('crit') && full.pool.includes('critDamage') && crit === 0 && three && !less.critFull && seenLess > 0 && near(full.weapon.critChance, B.player.critChance + 1), `치명타 확률 100% (level 101): the crit card never comes, in 300 redraws none (three cards each time; 치명타 피해 stays); at 99.5% it still comes (${seenLess} of 300)`)
  // after zyo_'s class change too
  full.state = 'levelup'
  full.pending = 1
  full.choices = ['clsA']
  full.choiceSeq++
  choose(full, 'clsA', full.choiceSeq)
  ok(full.cls && !full.pool.includes('crit') && full.pool.includes('critDamage'), 'after the class change: still no crit card')
}

// ── 마노의 방: the room follows the coin stats' levels, nothing else ────────
{
  const R = D.room
  const needs = R.stages.map((st) => st.need)
  ok(R.stages.length === 6 && needs[0] === 0 && needs.every((n, i) => !i || n > needs[i - 1]) && R.art.stages.length === 6, `room: six stages, at ${needs.join(' / ')} levels in all, a picture each`)
  ok(roomStage(D, 0) === 0 && roomStage(D, needs[1] - 1) === 0 && roomStage(D, needs[1]) === 1 && roomStage(D, needs[5]) === 5 && roomStage(D, 1e9) === 5, 'room: the stage follows the levels in all (exactly at each step, never past the sixth)')
  const p0 = roomProgress(D, 0)
  const pm = roomProgress(D, (needs[2] + needs[3]) / 2)
  const pe = roomProgress(D, needs[5] + 40)
  ok(p0.stage === 0 && p0.left === needs[1] && p0.share === 0 && pm.stage === 2 && near(pm.share, 0.5) && pm.left === needs[3] - (needs[2] + needs[3]) / 2 && pe.next === null && pe.share === 1, `room: the way to the next stage (a new save: ${p0.left} levels to go; halfway: ${Math.round(pm.share * 100)}%); complete: no next stage`)
  const [W, H] = R.size
  const inside = ([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H
  ok(Object.values(R.spots).every((sp) => inside(sp.at) && (!sp.door || inside(sp.door)) && sp.from >= 1 && sp.from <= 6) && R.walk.every(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1 && inside([x0, y0]) && inside([x1, y1])) && inside(R.ball), 'room: every spot, door and the open floor inside the picture; every spot from one of the six stages')
  ok(['mano_sit', 'danchu_play', 'hodu_belly', 'moru_sleep'].every((n) => R.art.poses[n] && R.art.poses[n].w > 0 && R.art.poses[n].h > 0), 'room: the four poses are there (Mano with her ball, 단추, 호두, 모루)')
  ok(Object.keys(B.perma.stats).every((k) => R.reactions[k]), 'room: Mano has a line for every coin stat')
  ok(roomTotal({}) === 0 && roomTotal({ hp: 3, damage: 2, crit: 0, junk: -4, bad: NaN }) === 5, 'room: the levels added up (bad numbers count as 0)')
  // an old save with levels: its stage at once
  ok(roomStage(D, roomTotal({ hp: 66, damage: 68, move: 10, interval: 68, crit: 40, coins: 8 })) === 3 && roomStage(D, 400) === 4 && roomStage(D, 509) === 4, 'room: a save that already has 260 levels opens on stage 4; 400 levels (about chapter 25) is stage 5, not yet complete')
  // the room is made from the save, never kept in it, and changes no number
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  const d = P.get()
  d.currency = 1e6
  mem.setItem(KEY, JSON.stringify(d))
  const before = Object.keys(P.get()).sort().join()
  const t0 = roomTotal(P.get().perma)
  for (const k of Object.keys(B.perma.stats)) P.buyStat(k, P.get().perma[k])
  const t1 = roomTotal(P.get().perma)
  const reload = createProgress(D, mem).boot().data
  ok(t1 === t0 + Object.keys(B.perma.stats).length && Object.keys(reload).sort().join() === before && !JSON.stringify(reload).includes('room'), `room: buying a level of each stat adds ${t1 - t0} to the room's count; the save has the same keys as before and nothing of the room`)
}

// ── the special-boss tester (tester.js): its own save, a set-up fight ───────
{
  const S = testerSave(D)
  ok(S.perma.move === B.perma.stats.move.maxLevel && S.perma.crit === 101 && S.perma.hp === TEST_PERMA.hp && S.unlockedChapter === lastChapter(D) && S.cats.unlocked && S.zyo.unlocked && S.turret.unlocked, `tester: its save has the coin stats high (이동 속도 Lv.${S.perma.move} and 치명타 확률 Lv.${S.perma.crit}: their top), every chapter and companion`)
  const store = testerStorage(D)
  const P = createProgress(D, store)
  P.boot()
  ok(P.get().perma.damage === TEST_PERMA.damage && store.getItem('nodnaba:survivor:corrupt') === null, 'tester: its progress is in memory, read and written there (never the real save)')
  const fight = (k, ch, seconds) => {
    const s = P.startRun(ch)
    const run = createRun(D, { chapter: ch, weaponId: s.weapon.weaponId, grade: s.weapon.grade, seed: 7, perma: s.perma, cats: s.cats, tizzzz: s.tizzzz, zyo: s.zyo, turret: s.turret, blessings: s.blessings, rerolls: s.rerolls })
    setupTest(run, { k, seconds, god: true })
    return run
  }
  for (const k of ['A', 'D']) {
    const run = fight(k, 10, 60)
    const lv = run.level
    const power = run.picks.power || 0
    const atOnce = run.extra && run.extra.phase === 'calm' && run.state === 'play' && !run.choices
    const seen = []
    const phases = new Set()
    let start = null
    let onBoss = false
    for (let i = 0; i < 60 * 120 && run.state !== 'over'; i++) {
      if (run.state === 'levelup') choose(run, run.choices[0], run.choiceSeq)
      step(run, FIXED, still)
      const e = testTick(run)
      if (e) seen.push(e)
      if (run.extra && run.extra.phase === 'fight' && start === null) start = run.t
      // (a few seconds in, Mano far from it: every unit is at the boss)
      if (start !== null && run.t - start > 4 && run.t - start < 4 + FIXED) {
        const x = run.extra.boss
        run.player.x = x.x < (run.extra.box[0] + run.extra.box[2]) / 2 ? run.extra.box[2] - 20 : run.extra.box[0] + 20
        for (let j = 0; j < 60; j++) step(run, FIXED, still)
        onBoss = run.cls.units.length > 1 && run.cls.units.every((u) => u.target === x)
      }
      const ph = testPhase(run)
      if (ph) phases.add(ph.i)
      run.events.length = 0
    }
    const took = run.t - start
    ok(run.cls && run.cls.k === k && lv === TEST_LEVEL && power === TEST_POWER && atOnce && onBoss && seen.join() === 'extra,fit' && phases.size === 4 && run.result.cleared && took > 50 && took < 90, `tester: class ${k}, its growth card picked ${power} times, Mano Lv.${lv}; the special boss's turn has begun when the test starts (no card to choose), it comes and lasts ${took.toFixed(0)} s (asked: 60), through all ${phases.size} phases, then the clear; with nothing else to hit, all its ${run.cls.units.length} ${run.cls.form === 'ball' ? 'giant balls' : 'ninjas'} go at the boss (none left idling by Mano)`)
  }
  {
    const run = fight('C', 35, 0)
    for (let i = 0; i < 60 * 30 && !(run.extra && run.extra.boss && run.extra.phase === 'fight'); i++) {
      if (run.state === 'levelup') choose(run, run.choices[0], run.choiceSeq)
      step(run, FIXED, still)
      testTick(run)
    }
    const x = run.extra.boss
    for (let i = 0; i < 60 * 5; i++) (step(run, FIXED, still), testTick(run))
    const full = x.hp === x.maxHp
    const got = []
    for (let i = 0; i < 6; i++) (skipPhase(run), got.push(testPhase(run).i))
    ok(full && got.join() === '1,2,3,4,4,4' && x.state === 'live', `tester: 안 쓰러짐 — the boss takes nothing; the bar's 다음 단계 walks its phases (${got.map((n) => n + 1).join(' → ')}), never felling it`)
  }
}

// ── balance smoke test (full numbers: survivor-campaign.mjs) ────────────────
{
  let core = 0
  let natural = 0
  for (let s = 1; s <= 3; s++) {
    core += playRun(D, { policy: 'core', seed: s * 7919 }).run.t
    natural += playRun(D, { policy: 'natural', seed: s * 7919 }).run.t
  }
  ok(core >= natural, `core picks last at least as long as random ones in chapter 1 (${(core / 3).toFixed(0)} s vs ${(natural / 3).toFixed(0)} s)`)
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
