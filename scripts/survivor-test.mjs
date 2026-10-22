// MANO SURVIVOR rule and save tests (no browser; storage is an in-memory stand-in).
//   node scripts/survivor-test.mjs
import { D } from './survivor-data.mjs'
import { createRun, step, choose, drawChoices, chapterCoins, maxed, lateGame, previewTimes, canEdit, isEdited, applyPreview, nextNeed, chargePath, overtime, overtimeHit, spawnInterval, gradeMul, regionOf, enemyName, lastChapter, FIXED } from '../src/survivor/game.js'
import { BEHAVIORS, ballTtl, fanAngles, volley, critCount, implemented } from '../src/survivor/weapons.js'
import { createProgress, canFuse, fuseAllPreview, parseBackup, exportName, BEFORE_IMPORT_KEY, rollGrade, statPrice, statValue, KEY, SCHEMA } from '../src/survivor/progress.js'
import { playRun, pick } from './survivor-bot.mjs'
import { MOVE_KEYS, keyVector } from '../src/survivor/keys.js'

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
  ok(seen.size === 16, `after all that every one of the 16 cards still comes up (${seen.size})`)
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
  ok(run.pool.length === 16 && new Set(run.pool).size === 16 && run.pool.slice(0, 4).join() === D.weapons.registry[0].core.join(), `16 cards: the weapon's core four (${run.pool.slice(0, 4).join(', ')}) and 12 general ones`)
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
  const exp = (N * 3) / 16
  const worst = Math.max(...Object.values(seen).map((n) => Math.abs(n / exp - 1)))
  ok(distinct, 'every level offers three different cards')
  ok(worst < 0.03, `each card comes up 3/16 of the time (largest gap from that: ${(worst * 100).toFixed(1)}%)`)
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
// experience left lying comes by itself after a while; coins do not
{
  const run = newRun()
  run.spawnT = -1e9
  const p = run.player
  const far = { x: p.x + 150, y: p.y + 150 }
  run.orbs.push({ kind: 'xp', ...far, v: 1, pull: false }, { kind: 'coin', ...far, v: 1, pull: false })
  for (let t = 0; t < B.xp.pullAfter - 0.2; t += FIXED) step(run, FIXED, still)
  ok(run.orbs.length === 2 && run.orbs.every((o) => o.x === far.x), `before ${B.xp.pullAfter} s the experience stays where it fell`)
  for (let t = 0; t < 1.5; t += FIXED) step(run, FIXED, still)
  ok(run.xp === 1 && run.orbs.length === 1 && run.orbs[0].kind === 'coin' && run.coins === 0, 'then it flies to Mano by itself; the coin stays to be picked up')
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
  }
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
  for (let i = 0; i < 120; i++) step(run, FIXED, still)
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
  for (let i = 0; i < 600 && b.mode !== 'stompWind'; i++) {
    run.player.x = 20
    run.player.y = 600
    step(run, FIXED, still)
  }
  ok(b.mode === 'stompWind', 'then it winds up a slam (a different attack)')
  const S = B.enemies.boss
  run.player.x = Math.min(B.logicalArena.bounds[2] - 10, b.x + S.stompRadius + run.player.hitR + 3)
  run.player.y = b.y
  const outside = Math.hypot(run.player.x - b.x, run.player.y - b.y) > S.stompRadius + run.player.hitR
  run.player.inv = 0
  const hpA = run.player.hp
  for (let i = 0; i < 120 && b.mode === 'stompWind'; i++) {
    run.player.x = Math.min(B.logicalArena.bounds[2] - 10, b.x + S.stompRadius + run.player.hitR + 3)
    run.player.y = b.y
    step(run, FIXED, still)
  }
  ok(outside && run.player.hp === hpA, 'standing just outside the circle: the slam misses')
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
  ok(near(statValue(D, 'crit', 1000), 0.5) && statValue(D, 'move', 999) === 1.015 ** 40, 'coin stat caps: crit 50%, speed 40 levels')
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
// last chapter, in that same write; the cats at 10, Tizzzz at 15
{
  const S = D.story
  const mem = new Mem()
  mem.setItem('nodnaba:colony:save', 'COLONY')
  const P = createProgress(D, mem)
  const b0 = P.boot()
  ok(b0.supplied.length === 0 && b0.data.story.v === 1 && b0.data.story.seen.length === 0, 'a new save starts in the story: nothing seen yet (the prologue plays at chapter 1), nothing to make up')
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
  const d = P.get()
  const balls = (g, tag) => d.inventory.filter((it) => it.grade === g && (tag ? it.tag === tag : !it.tag)).length
  ok(got[5].item.grade === 'S' && got[15].item.grade === 'SS' && got[35].item.grade === 'EX' && got[35].item.tag === 'demon', '5: the red ball grows to S; 15: to SS; 35: 마왕의 탱탱볼 (EX)')
  ok(d.cats.unlocked && d.tizzzz.unlocked && d.blessings.phoenix && d.blessings.snow && d.blessings.thunder && d.blessings.final, '10: the cats; 15: Tizzzz; 20, 25, 30: the phoenix gem, the snow and thunder blessings; 35: the last strengthening')
  ok(d.equippedInstanceId === got[35].item.id, '마왕의 탱탱볼 is equipped (it beats the SS)')
  ok(d.story.rewards.length === 7 && d.story.seen.length === 0, 'the rewards are recorded apart from the cutscenes (none seen here: skipping or closing never costs a reward)')
  const before = JSON.stringify([balls('S'), balls('SS'), balls('EX', 'demon')])
  for (const ch of [5, 10, 15, 35]) ok(!clear(ch).story, `clearing chapter ${ch} again gives nothing more`)
  ok(JSON.stringify([balls('S'), balls('SS'), balls('EX', 'demon')]) === before, 'still one S, one SS, one 마왕의 탱탱볼 from the story')
  P.markSeen('forest_3')
  P.markSeen('forest_3')
  const again = createProgress(D, mem)
  const re = again.boot()
  ok(re.supplied.length === 0 && re.data.story.seen.join() === 'forest_3' && re.data.blessings.thunder && re.data.inventory.some((it) => it.tag === 'demon'), 'after a reload: one seen mark, the blessings and 마왕의 탱탱볼 kept, nothing given again')
  const s35 = again.startRun(35)
  ok(s35.cats && s35.tizzzz && s35.blessings.phoenix && s35.blessings.snow && s35.blessings.thunder && s35.blessings.final, 'a run started now brings the cats, Tizzzz and every blessing')
  const bk = parseBackup(D, again.exportText()).data
  ok(bk.blessings.snow && bk.story.rewards.length === 7 && bk.inventory.some((it) => it.tag === 'demon'), 'a backup keeps the story, the blessings and 마왕의 탱탱볼')
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
  ok(b.supplied.join() === 'desert,snow' && n.story.news.join() === 'desert,snow', `it is given what chapters 20 and 25 now bring (${b.supplied.join(', ')}), and told so once`)
  ok(n.blessings.phoenix && n.blessings.snow && !n.blessings.thunder && !n.blessings.final, 'the phoenix gem and the snow blessing; not yet thunder (chapter 30)')
  ok(n.inventory.length === d.inventory.length && n.equippedInstanceId === 'w91', 'no ball given again (its S and SS came from the old stories); its equipped SS stays')
  ok(n.cats.unlocked && n.tizzzz.unlocked, 'the cats and Tizzzz stay')
  ok(['prologue', 'forest_3', 'deepforest_3', 'skulltown_3', 'desert_4', 'snow_3', 'sky_1', 'sky_2', 'sky_3'].every((id) => n.story.seen.includes(id)) && !n.story.seen.includes('sky_4') && !n.story.seen.includes('castle_1'), 'what it already played counts as seen (watchable in 설정); chapter 30 and on wait for it')
  P2.clearNews()
  const third = createProgress(D, mem).boot()
  ok(third.supplied.length === 0 && third.data.story.news.length === 0 && third.data.inventory.length === n.inventory.length, 'the next visit gives and tells nothing more')
}
// an even older save (from before the cats), past chapter 12: the S ball and
// the cats are made up; Tizzzz waits for chapter 15
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
  ok(b.supplied.join() === 'forest,deepforest' && b.data.inventory.filter((it) => it.grade === 'S').length === 1 && b.data.cats.unlocked && !b.data.tizzzz.unlocked, 'it gets the S ball and the cats once; Tizzzz comes with chapter 15')
  ok(b.data.story.seen.includes('skulltown_1') && !b.data.story.seen.includes('skulltown_2') && !b.data.story.seen.includes('skulltown_3') && b.data.story.seen.includes('deepforest_3'), 'what it played (to chapter 12) counts as seen; chapter 15\'s cutscenes still play')
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
  ok(!r6.pool.includes('pickup') && r6.pool.includes('nyang') && r6.pool.length === r6n.pool.length, `the magnet's place goes to 냥냥 연금술 (still ${r6.pool.length} cards, 3 shown)`)
  let shown = 0
  let seen = 0
  for (let i = 0; i < 4000; i++) {
    const c = drawChoices(r6)
    if (c.length !== 3 || new Set(c).size !== 3 || c.includes('pickup')) shown++
    if (c.includes('nyang')) seen++
  }
  ok(shown === 0 && Math.abs(seen / 4000 - 3 / 16) < 0.03, `three different cards, never the magnet; 냥냥 연금술 comes up like any card (${((seen / 4000) * 100).toFixed(1)}%)`)
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
  ok(byCats / dropped > 0.85 && lying <= 2 && waits[waits.length >> 1] < 1, `90 s with Mano standing still: the cats took ${((100 * byCats) / dropped).toFixed(0)}% of ${dropped} coins and gems (the rest fell next to Mano), half within ${waits[waits.length >> 1].toFixed(2)} s; ${lying} left lying over 2 s`)
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
  const fromPackage = A.filter((x) => !['backdrop', 'portrait', 'background-wide', 'backdrop-wide'].includes(x.kind))
  const kinds = (k) => fromPackage.filter((x) => x.kind === k).length
  ok(fromPackage.length === 84 && new Set(fromPackage.map((x) => x.source)).size === 84, `the map holds all 84 originals once (${kinds('monster')} monsters, ${kinds('cutscene')} cutscenes, ${kinds('background')} backgrounds, ${kinds('reward')} rewards, ${kinds('companion')} companions)`)
  ok(kinds('monster') === 35 && kinds('cutscene') === 29 && kinds('background') === 7 && kinds('reward') === 10 && kinds('companion') === 3, '35 / 29 / 7 / 10 / 3, as the package says')
  const missing = A.filter((x) => !fs.existsSync(new URL('../src/survivor/assets/s84/' + x.file, import.meta.url)))
  ok(missing.length === 0, `every game file the map names is there (${A.length} files)${missing.length ? ': missing ' + missing.map((x) => x.file).join(', ') : ''}`)
  const ids = new Set(A.map((x) => x.id))
  const S = D.story
  const used = S.cutscenes.groups.flatMap((g) => g.cuts.map((c) => c.image))
  ok(used.length === 29 && new Set(used).size === 29 && used.every((id) => ids.has(id) && A.find((x) => x.id === id).kind === 'cutscene'), 'each of the 29 cutscenes is placed once')
  const per = S.regions.map((r) => S.cutscenes.groups.filter((g) => regionOf(D, g.chapter).id === r.id).reduce((n, g) => n + g.cuts.length, 0))
  ok(per.join() === '5,4,3,4,4,5,4' && S.cutscenes.groups[0].id === 'prologue' && S.cutscenes.groups[0].cuts.length === 2, `per region (the prologue opens 작은 숲): ${per.join(', ')}`)
  ok(S.cutscenes.groups.every((g) => g.when !== 'time' || (g.at > 0 && g.at < 210)) && S.cutscenes.groups.every((g) => ['enter', 'time', 'boss', 'clear'].includes(g.when)), 'every cutscene has its moment: before the fight, a time in it, the boss, or the clear')
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
  // monsters come in near her (the spawn box) and stay in the view; the balls bounce off it
  const r2 = newRun({ arena: PC, seed: 8 })
  r2.player.hp = r2.player.maxHp = 1e9
  let far = 0
  let outView = 0
  let ballsOut = 0
  const seen = new Set()
  for (let i = 0; i < 60 * 40; i++) {
    step(r2, FIXED, { x: Math.sin(i / 200), y: Math.cos(i / 300) })
    const [vx0, vy0, vx1, vy1] = r2.view
    for (const e of r2.enemies) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        if (PC.spawnBox && (Math.abs(e.x - r2.player.x) > PC.spawnBox[0] / 2 + 40 || Math.abs(e.y - r2.player.y) > PC.spawnBox[1] / 2 + 40)) far++
      }
      if (e.state === 'live' && (e.x < vx0 - 0.01 || e.x > vx1 + 0.01 || e.y < vy0 - 0.01 || e.y > vy1 + 0.01)) outView++
    }
    for (const b of r2.balls) if (b.x < vx0 - 0.01 || b.x > vx1 + 0.01 || b.y < vy0 - 0.01 || b.y > vy1 + 0.01) ballsOut++
    if (r2.state === 'levelup') choose(r2, r2.choices[0], r2.choiceSeq)
  }
  ok(seen.size > 20 && far === 0, `40 s walking about the PC field: ${seen.size} monsters came in, ${PC.spawnBox ? `all within the ${PC.spawnBox.join(' × ')} spawn box around Mano` : 'all at the view'}${far ? ` (${far} farther)` : ''}`)
  ok(outView === 0 && ballsOut === 0, `no monster and no ball ever left the view${outView || ballsOut ? ` (${outView} monster-steps, ${ballsOut} ball-steps)` : ''}`)
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
