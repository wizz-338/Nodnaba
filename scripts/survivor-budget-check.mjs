// Does the ball budget change the fight? The same dense moment (chapter 3,
// 180 s on) is played twice from the same seed: with the budget, and with no
// budget (every ball really flies). Compares damage dealt, kills and time.
//   node scripts/survivor-budget-check.mjs
import { D } from './survivor-data.mjs'
import { createRun, step, choose, FIXED } from '../src/survivor/game.js'
import { botInput, SKILLS } from './survivor-bot.mjs'

function play(budget, build, seed, seconds = 25) {
  const DD = { ...D, balance: { ...D.balance, performance: { ...D.balance.performance, ballBudget: budget } } }
  const run = createRun(DD, { chapter: 3, weaponId: 'bouncy_ball', grade: 'B', seed })
  for (const [id, n] of Object.entries(build)) for (let i = 0; i < n; i++) {
    run.state = 'levelup'; run.pending = 1; run.choices = [id, 'maxHp', 'pickup']; run.choiceSeq++
    choose(run, id, run.choiceSeq)
  }
  run.player.hp = run.player.maxHp = 1e12
  run.xp = -1e15
  run.t = 150
  run.nextEvent = 3 // no elites or boss: the crowd only
  const mem = {}
  const t0 = Date.now()
  for (let i = 0; i < seconds * 60; i++) {
    step(run, FIXED, botInput(run, SKILLS.good, mem))
    run.events.length = 0
  }
  return { damage: run.stats.damage, kills: run.kills, shots: run.stats.shots, launched: run.stats.launched, peak: run.stats.peakBalls, ms: Date.now() - t0 }
}

const builds = {
  'lucky (64 balls, 0.24 s)': { count: 6, interval: 4, damage: 2, bounce: 3 },
  'extreme (1024 balls, 0.028 s)': { count: 10, interval: 10, damage: 2, bounce: 4 },
}
for (const [name, build] of Object.entries(builds)) {
  const rows = []
  for (const seed of [1, 2, 3]) rows.push([play(D.balance.performance.ballBudget, build, seed), play(1e9, build, seed, 25)])
  const sum = (i, k) => rows.reduce((a, r) => a + r[i][k], 0)
  console.log(`${name}: with budget ${D.balance.performance.ballBudget} vs no budget (3 seeds × 25 s of chapter 3's crowd)`)
  console.log(`  damage ${Math.round(sum(0, 'damage'))} vs ${Math.round(sum(1, 'damage'))} (${((100 * sum(0, 'damage')) / sum(1, 'damage')).toFixed(1)}%), kills ${sum(0, 'kills')} vs ${sum(1, 'kills')} (${((100 * sum(0, 'kills')) / sum(1, 'kills')).toFixed(1)}%)`)
  console.log(`  balls on screen at most ${Math.max(...rows.map((r) => r[0].peak))} vs ${Math.max(...rows.map((r) => r[1].peak))}; logical balls ${sum(0, 'shots')} vs ${sum(1, 'shots')}; simulation time ${sum(0, 'ms')} ms vs ${sum(1, 'ms')} ms`)
}
