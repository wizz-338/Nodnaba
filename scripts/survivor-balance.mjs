// MANO SURVIVOR balance runs (bot players, see survivor-bot.mjs).
//   node scripts/survivor-balance.mjs [runs] [chapter] [skill]
// One chapter from scratch (no coin stats, grade D) for each pick policy.
// A bot is not a person: these numbers show trends, not win rates.
import { D } from './survivor-data.mjs'
import { playRun } from './survivor-bot.mjs'

const N = +process.argv[2] || 30
const chapter = +process.argv[3] || 1
const skill = process.argv[4] || 'good'
console.log(`chapter ${chapter}, ${N} runs per policy, ${skill} movement`)
for (const policy of ['core', 'natural', 'survival']) {
  const rows = []
  for (let s = 1; s <= N; s++) {
    const { run } = playRun(D, { policy, skill, seed: s * 7919 + chapter, chapter })
    rows.push({ cleared: !!(run.result && run.result.cleared), t: run.t, lvl: run.level, kills: run.kills, coins: run.result ? run.result.coins : 0, elites: run.eliteKills, bossLeft: run.result ? run.result.bossLeft : null, peak: run.stats.peakBalls, count: run.weapon.count })
  }
  const cl = rows.filter((r) => r.cleared).length
  const avg = (f) => (rows.reduce((a, r) => a + f(r), 0) / N).toFixed(1)
  const died = rows.filter((r) => !r.cleared)
  const before = (t) => died.filter((r) => r.t < t).length
  console.log(`${policy.padEnd(8)} cleared ${String(cl).padStart(2)}/${N}  lost before elite1 ${before(70)}, before elite2 ${before(145) - before(70)}, before boss ${before(210) - before(145)}, at the boss ${died.length - before(210)}  avg level ${avg((r) => r.lvl)} kills ${avg((r) => r.kills)} coins ${avg((r) => r.coins)} elites ${avg((r) => r.elites)} time ${avg((r) => r.t)}s  peak balls ${Math.max(...rows.map((r) => r.peak))}, balls/volley up to ${Math.max(...rows.map((r) => r.count))}`)
}
