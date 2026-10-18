// MANO SURVIVOR balance runs (bot player, see survivor-bot.mjs).
//   node scripts/survivor-balance.mjs [runs per policy] [chapter]
// A survival/utility first · B even spread · C count/damage/haste/split ·
// natural = always the first card shown (cards are drawn by their weights).
// A bot is not a person: these numbers show trends, not win rates.
import { D } from './survivor-data.mjs'
import { playRun } from './survivor-bot.mjs'

const N = +process.argv[2] || 30
const chapter = +process.argv[3] || 1
console.log(`chapter ${chapter}, ${N} runs per policy`)
for (const policy of ['A', 'B', 'C', 'natural']) {
  const rows = []
  for (let s = 1; s <= N; s++) {
    const { run, peak } = playRun(D, { policy, seed: s * 7919 + chapter, chapter })
    rows.push({ wave: run.result ? run.result.wave : run.wave + 1, cleared: !!(run.result && run.result.cleared), t: run.t, lvl: run.level, kills: run.kills, peak })
  }
  const hist = [1, 2, 3, 4, 5, 6].map((w) => rows.filter((r) => !r.cleared && r.wave === w).length)
  const cl = rows.filter((r) => r.cleared).length
  const avg = (f) => (rows.reduce((a, r) => a + f(r), 0) / N).toFixed(1)
  console.log(`${policy.padEnd(7)} cleared ${String(cl).padStart(2)}/${N}  died in wave 1-6: ${hist.join(' ')}  avg level ${avg((r) => r.lvl)}  avg kills ${avg((r) => r.kills)}  peak enemies ${Math.max(...rows.map((r) => r.peak.enemies))} balls ${Math.max(...rows.map((r) => r.peak.balls))}`)
}
