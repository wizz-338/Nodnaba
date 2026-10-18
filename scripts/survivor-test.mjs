// MANO SURVIVOR rule and save tests (no browser; storage is an in-memory stand-in).
//   node scripts/survivor-test.mjs
import { D } from './survivor-data.mjs'
import { createRun, step, choose, drawChoices, capped, applyPreview, nextNeed, FIXED } from '../src/survivor/game.js'
import { BEHAVIORS, ballTtl, fanAngles, implemented } from '../src/survivor/weapons.js'
import { createProgress, canFuse, rollGrade, KEY } from '../src/survivor/progress.js'
import { playRun } from './survivor-bot.mjs'

let fails = 0
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m)
  if (!c) fails++
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
class Mem {
  constructor() { this.m = new Map() }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null }
  setItem(k, v) { this.m.set(k, String(v)) }
  removeItem(k) { this.m.delete(k) }
}
const newRun = (o = {}) => createRun(D, { chapter: 1, weaponId: 'bouncy_ball', grade: 'D', seed: 11, ...o })
const enemy = (run, x, y, hp = 1e9, r = 11) => {
  const e = { id: run.nextId++, type: 'jaw', x, y, r, hp, maxHp: hp, speed: 0, damage: 9, xp: 3, state: 'live', t: 0, hitT: 0, face: 1 }
  run.enemies.push(e)
  run.grid.rebuild(run.enemies.filter((o) => o.state === 'live'))
  return e
}
const ball = (run, x, y, vx, vy, extra = {}) => {
  const b = { id: run.nextId++, x, y, vx, vy, r: 4.5, damage: 14, bounces: 2, ttl: 3, canSplit: true, hitAny: false, locks: [], trail: [], age: 0, ...extra }
  run.balls.push(b)
  return b
}
const upd = (run, dt) => {
  run.t += dt
  run.fireT = 99
  BEHAVIORS.bounce_projectile.update(run, dt)
}

// ── movement ────────────────────────────────────────────────────────────────
{
  const run = newRun()
  run.spawnT = -1e9
  const p = run.player
  const x0 = p.x, y0 = p.y
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
}

// ── the bouncy ball ─────────────────────────────────────────────────────────
{
  // wall bounce uses budget; budget gone → the ball is removed
  const run = newRun()
  const [x0] = D.balance.logicalArena.bounds
  const b = ball(run, x0 + 20, 300, -260, 0, { bounces: 1 })
  for (let i = 0; i < 12; i++) upd(run, FIXED)
  ok(b.vx > 0 && b.bounces === 0 && run.balls.includes(b), 'a wall reflects the ball and spends one bounce')
  const r2 = newRun()
  const b2 = ball(r2, x0 + 20, 300, -260, 0, { bounces: 0 })
  for (let i = 0; i < 12; i++) upd(r2, FIXED)
  ok(!r2.balls.includes(b2), 'with no bounces left the next collision removes the ball')
}
{
  // enemy hit: damage, reflect, pushed out; bounces=2 → at most 3 collisions
  const run = newRun()
  const e = enemy(run, 200, 300)
  const b = ball(run, 170, 300, 260, 0)
  for (let i = 0; i < 10; i++) upd(run, FIXED)
  ok(run.stats.hits === 1 && e.hp < 1e9 && b.vx < 0 && Math.hypot(b.x - e.x, b.y - e.y) >= e.r + b.r, 'first hit: damage, the ball bounces back and leaves the enemy')
  ok(b.bounces === 1, 'the first hit spends one of the two bounces')
}
{
  // a fast ball with a big step never passes through an enemy
  const run = newRun()
  enemy(run, 200, 300, 1e9, 6)
  ball(run, 100, 300, 3000, 0, { r: 2 })
  run.t += 0.1
  run.fireT = 99
  BEHAVIORS.bounce_projectile.update(run, 0.1)
  ok(run.stats.hits === 1, 'a ball moving 300 px in one step still hits a small enemy (no tunnelling)')
}
{
  // the same enemy cannot be hit twice within 0.18 s
  const run = newRun()
  enemy(run, 200, 300, 1e9, 14)
  ball(run, 180, 300, 260, 0, { bounces: 10 })
  ball(run, 220, 300, -260, 0, { bounces: 10, id: 999 })
  for (let i = 0; i < 4; i++) upd(run, FIXED)
  const firstHits = run.stats.hits
  ok(firstHits === 2, 'two balls from both sides each hit once')
  ok(run.balls.every((b) => b.locks.length === 1), 'each ball now ignores that enemy for 0.18 s')
}
{
  // ttl and fan
  const w = { ttl: 3.2, bounces: 2 }
  ok(near(ballTtl(w), 3.2) && near(ballTtl({ ttl: 3.2, bounces: 16 }), 5.3), 'ball life 3.2 s, longer with bounces, 5.3 s at most')
  const f = fanAngles(10)
  ok(near(f[9] - f[0], Math.PI / 3), 'ten balls fan out over 60°, not all around')
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
      regrand += run.balls.filter((b) => b.canSplit).length
    }
    ok(near(kids / N, expect[p], 0.12) && regrand === 0, `split chance ${p}: ${(kids / N).toFixed(2)} children per first hit (expected ${expect[p]})`)
  }
  // children never split again, and do not split on walls
  const run = newRun({ seed: 3 })
  run.weapon.splitChance = 2
  const e = enemy(run, 200, 300)
  const e2 = enemy(run, 260, 300)
  ball(run, 180, 300, 260, 0, { bounces: 6 })
  for (let i = 0; i < 120; i++) upd(run, FIXED)
  ok(run.stats.splits === 2 && run.stats.children === 4, 'only the parent splits, only at its first enemy hit (p=2 → 4 children)')
  const r2 = newRun({ seed: 3 })
  r2.weapon.splitChance = 2
  ball(r2, D.balance.logicalArena.bounds[0] + 10, 300, -260, 0)
  for (let i = 0; i < 10; i++) upd(r2, FIXED)
  ok(r2.stats.children === 0, 'hitting a wall never splits')
}

// ── upgrades ────────────────────────────────────────────────────────────────
{
  const run = newRun()
  const base = { ...run.weapon }
  const pick = (id) => {
    run.state = 'levelup'
    run.pending = 1
    run.choices = [id, 'health', 'magnet']
    run.choiceSeq++
    return choose(run, id, run.choiceSeq)
  }
  pick('damage'); pick('damage'); pick('damage')
  ok(near(run.weapon.damage, base.damage * 1.3 ** 3), `damage ×3 = base × 1.3³ (${run.weapon.damage.toFixed(2)})`)
  pick('haste'); pick('haste')
  ok(near(run.weapon.interval, base.interval * 0.85 ** 2), `haste ×2 = base × 0.85² (${run.weapon.interval.toFixed(3)})`)
  pick('count'); pick('count')
  ok(run.weapon.count === 3, 'count ×2 = 3 balls a volley')
  const hp0 = run.player.maxHp
  pick('health')
  ok(run.player.maxHp === hp0 + 20, 'health: +20 max HP')
  // a stale or doubled tap does nothing
  run.state = 'levelup'; run.pending = 1; run.choices = ['damage', 'health', 'count']; run.choiceSeq++
  const seq = run.choiceSeq
  const d0 = run.weapon.damage
  ok(choose(run, 'damage', seq) && !choose(run, 'damage', seq) && near(run.weapon.damage, d0 * 1.3), 'tapping a card twice applies it once')
  // caps
  for (let i = 0; i < 20; i++) pick('count')
  ok(run.weapon.count === 10 && capped(run, 'count'), 'count stops at 10')
  for (let i = 0; i < 40; i++) pick('haste')
  ok(near(run.weapon.interval, 0.15) && capped(run, 'haste'), 'interval stops at 0.15 s')
  let seen = new Set()
  for (let i = 0; i < 300; i++) for (const id of drawChoices(run)) seen.add(id)
  ok(!seen.has('count') && !seen.has('haste') && seen.has('damage'), 'capped options are never offered again')
}
{
  // three different cards; options picked before come back
  const run = newRun({ seed: 5 })
  let distinct = true
  let back = 0
  let last = null
  for (let i = 0; i < 500; i++) {
    const c = drawChoices(run)
    if (new Set(c).size !== 3) distinct = false
    if (last && c.includes(last)) back++
    last = c[0]
  }
  ok(distinct, 'every level offers three different cards')
  ok(back > 100, `an option taken last level shows up again later (${back} of 500)`)
}

// ── XP and level-ups ────────────────────────────────────────────────────────
{
  const run = newRun()
  run.spawnT = -1e9
  ok(nextNeed(10) === 15 && nextNeed(15) === 21, 'XP needed: 10 → 15 → 21')
  run.orbs.push({ kind: 'xp', x: run.player.x, y: run.player.y, v: 30, vx: 0, vy: 0, pull: false })
  step(run, FIXED * 2, { x: 0, y: 0 })
  ok(run.state === 'levelup' && run.pending === 2 && run.xp === 5 && run.level === 3, '30 XP at once: two level-ups queued, 5 XP carried over')
  const t0 = run.t
  const e = enemy(run, run.player.x + 40, run.player.y)
  e.speed = 50
  const ex = e.x
  step(run, 1, { x: 1, y: 0 })
  ok(run.t === t0 && e.x === ex && run.balls.length === 0, 'while choosing, time, enemies, firing and Mano all stand still')
  choose(run, run.choices[0], run.choiceSeq)
  ok(run.state === 'levelup' && run.pending === 1, 'the second choice opens right after the first')
  choose(run, run.choices[0], run.choiceSeq)
  ok(run.state === 'play' && run.pending === 0, 'then the battle goes on')
}

// ── contact damage, death, waves ────────────────────────────────────────────
{
  const run = newRun()
  run.spawnT = -1e9
  const p = run.player
  for (let i = 0; i < 6; i++) enemy(run, p.x + i * 0.5, p.y + 1)
  step(run, FIXED * 2, { x: 0, y: 0 })
  ok(p.hp === 100 - 9, 'six enemies touching at once: one hit of 9, not six')
  const hp = p.hp
  step(run, 0.3, { x: 0, y: 0 })
  ok(p.hp === hp, 'no damage again during the 0.65 s after a hit')
  p.hp = 1
  p.inv = 0
  step(run, FIXED * 3, { x: 0, y: 0 })
  ok(run.state === 'dying' && run.result && !run.result.cleared, 'HP 0: the run is locked as lost')
  for (let i = 0; i < 60; i++) step(run, FIXED, { x: 0, y: 0 })
  ok(run.state === 'over', 'after the fall animation the run is over')
}
{
  const run = newRun()
  run.spawnT = -1e9
  run.player.hp = 50
  run.waveT = D.balance.waves[0].seconds - 0.01
  step(run, FIXED * 2, { x: 0, y: 0 })
  ok(run.wave === 1 && run.player.hp === 65, 'surviving a wave: next wave, +15 HP')
  run.wave = D.balance.waves.length - 1
  run.waveT = D.balance.waves[run.wave].seconds - 0.01
  step(run, FIXED * 2, { x: 0, y: 0 })
  ok(run.state === 'over' && run.result.cleared, 'surviving wave 6 clears the chapter')
}
{
  // spawning: never inside 60 px of Mano, at most one per tick, stops at the soft limit
  const run = newRun({ seed: 9 })
  let tooClose = 0
  for (let i = 0; i < 3000; i++) {
    run.player.inv = 99
    run.spawnT = 99
    step(run, FIXED, { x: 0, y: 0 })
    for (const e of run.enemies) if (e.t === 0 && e.state === 'spawn' && Math.hypot(e.x - run.player.x, e.y - run.player.y) < 60) tooClose++
    run.balls = []
    run.fireT = 99
  }
  ok(tooClose === 0, 'no enemy appears within 60 px of Mano')
  ok(run.enemies.length <= D.balance.performance.enemySoftLimit, `enemies stop at the soft limit (${run.enemies.length})`)
}

// ── weapons registry ────────────────────────────────────────────────────────
{
  ok(D.weapons.registry.every((w) => implemented(w)), 'every weapon in the registry has a behaviour')
  ok(!implemented({ behaviorId: 'summon_cats' }), 'a weapon without a behaviour (churu) is not usable yet')
  let threw = false
  try { createRun(D, { weaponId: 'churu' }) } catch { threw = true }
  ok(threw, 'a run with an unknown weapon is refused')
}

// ── progress: rewards, chests, fusion ───────────────────────────────────────
{
  const mem = new Mem()
  mem.setItem('nodnaba:colony:save', 'COLONY')
  mem.setItem('nodnaba:manorun:best', '777')
  const P = createProgress(D, mem)
  const d0 = P.boot().data
  ok(d0.inventory.length === 1 && d0.inventory[0].grade === 'D' && d0.equippedInstanceId === d0.inventory[0].id, 'start: one D bouncy ball, equipped')
  const { runId } = P.startRun(1)
  const r1 = P.finishRun(runId, 1, { cleared: true, wave: 6, kills: 300, coins: 25 })
  const r2 = P.finishRun(runId, 1, { cleared: true, wave: 6, kills: 300, coins: 25 })
  const d1 = P.get()
  ok(!r1.already && r2.already && d1.currency === 25 && d1.chests.length === 1, 'a run pays once: 25 coins and one chest, the second call pays nothing')
  ok(d1.unlockedChapter === 2, 'clearing chapter 1 opens chapter 2')
  const lost = P.startRun(2)
  P.finishRun(lost.runId, 2, { cleared: false, wave: 3, kills: 50, coins: 4 })
  ok(P.get().chests.length === 1 && P.get().currency === 29, 'a lost run: coins only, no chest')
  const chest = d1.chests[0]
  const a = P.openChest(chest.id)
  const b = P.openChest(chest.id)
  ok(a && b === null && P.get().inventory.length === 2 && P.get().chests.length === 0, 'a chest opens once: one weapon, opening again gives nothing')
  // unfinished run is ended on the next visit
  P.startRun(1)
  const again = createProgress(D, mem).boot()
  ok(again.lostRun && again.data.activeRun === null && again.data.inventory.length === 2, 'a run left unfinished (page closed) ends without reward; weapons kept')
  ok(mem.getItem('nodnaba:colony:save') === 'COLONY' && mem.getItem('nodnaba:manorun:best') === '777', "other games' saves untouched")
  // grades from chests follow the weights
  const counts = { D: 0, C: 0, B: 0 }
  for (let i = 0; i < 20000; i++) counts[rollGrade(D, i / 20000)]++
  ok(Math.abs(counts.D - 18000) < 20 && Math.abs(counts.C - 1800) < 20 && Math.abs(counts.B - 200) < 20, `chest grades D90 / C9 / B1 (${counts.D}/${counts.C}/${counts.B})`)
}
{
  const mem = new Mem()
  const P = createProgress(D, mem)
  P.boot()
  // give four D balls and one C
  const d = P.get()
  d.inventory.push({ id: 'w2', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w3', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w4', weaponId: 'bouncy_ball', grade: 'D' }, { id: 'w5', weaponId: 'bouncy_ball', grade: 'C' })
  d.nextSeq = 6
  mem.setItem(KEY, JSON.stringify(d))
  ok(!canFuse(D, P.get(), ['w2', 'w3', 'w5']).ok, 'different grades cannot be fused')
  ok(!canFuse(D, P.get(), ['w2', 'w3']).ok, 'two are not enough')
  const before = P.get().inventory.length
  const bad = P.fuse(['w2', 'w3', 'w5'])
  ok(!bad.ok && P.get().inventory.length === before, 'a refused fusion removes nothing')
  const f = P.fuse(['w1', 'w2', 'w3'])
  const f2 = P.fuse(['w1', 'w2', 'w3'])
  const after = P.get()
  ok(f.ok && f.item.grade === 'C' && !f2.ok && after.inventory.length === before - 2, 'three D → one C; doing it again (double tap) changes nothing')
  ok(f.equipped && after.equippedInstanceId === f.item.id, 'the equipped ball was chosen for fusion: the new C ball is equipped instead')
  const ex = { ...after, inventory: [1, 2, 3].map((i) => ({ id: 'x' + i, weaponId: 'bouncy_ball', grade: 'EX' })) }
  ok(!canFuse(D, ex, ['x1', 'x2', 'x3']).ok, 'EX cannot be fused')
}
{
  // a run takes the grade bonus; upgrades never reach the saved weapon
  const run = createRun(D, { weaponId: 'bouncy_ball', grade: 'B', seed: 1 })
  ok(near(run.weapon.damage, 14 * 1.32), 'grade B ball starts at 14 × 1.32 damage')
  const def = D.weapons.registry[0]
  run.state = 'levelup'; run.pending = 1; run.choices = ['damage', 'count', 'health']; run.choiceSeq++
  choose(run, 'damage', run.choiceSeq)
  ok(def.base.damage === 14, 'upgrades in a run never change the weapon data')
}
{
  // corrupt save: set aside, new start
  const mem = new Mem()
  mem.setItem(KEY, '{broken')
  const P = createProgress(D, mem)
  const r = P.boot()
  ok(r.data.inventory.length === 1 && mem.getItem('nodnaba:survivor:corrupt') === '{broken', 'an unreadable save is kept aside and a new one starts')
  const N = createProgress(D, null)
  ok(N.boot().data.inventory.length === 1 && !N.available, 'with no storage the game still plays (nothing is kept, and it says so)')
}

// ── balance (bot, a few runs; full numbers come from scripts/survivor-balance.mjs) ─
{
  const res = []
  for (const policy of ['A', 'C']) {
    let cleared = 0
    let waves = 0
    for (let s = 1; s <= 4; s++) {
      const { run } = playRun(D, { policy, seed: s * 7919 })
      cleared += run.result && run.result.cleared ? 1 : 0
      waves += run.result ? run.result.wave : 0
    }
    res.push({ policy, cleared, waves: waves / 4 })
  }
  ok(res[1].waves > res[0].waves, `a focused build (count/damage/haste/split) gets further than a survival build (${res[1].waves} vs ${res[0].waves} waves)`)
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
process.exit(fails ? 1 : 0)
