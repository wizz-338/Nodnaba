// MANO SURVIVOR — the phone field against the PC field: the same human-like
// bot, seeds and loadouts on each, so the two platforms can be compared.
// Prints, per chapter, how often the chapter is cleared and how long runs last.
//   node scripts/survivor-platform-parity.mjs [seeds=16]
// PC_VARIANTS='{"name": {…fields over balance.logicalArenaPc}}' tries other
// PC settings beside the real one (e.g. {"more": {"spawnMul": 1.3}}).
// A bot is not a person: these numbers show trends, not win rates.
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import os from 'os'

const CHAPTERS = [1, 3, 5, 8]
// what a player has when they reach the chapter (about what survivor-campaign.mjs's bots have)
const LOAD = {
  1: { grade: 'D', perma: {} },
  3: { grade: 'B', perma: { hp: 5, damage: 6, interval: 5, crit: 2, move: 1 } },
  5: { grade: 'A', perma: { hp: 11, damage: 12, interval: 12, crit: 6, move: 2, coins: 2 } },
  8: { grade: 'S', perma: { hp: 24, damage: 26, interval: 26, crit: 14, move: 5, coins: 4 } },
}

if (!isMainThread) {
  const { D } = await import('./survivor-data.mjs')
  const { playRun } = await import('./survivor-bot.mjs')
  const out = []
  for (const j of workerData.jobs) {
    const v = workerData.variants[j.v]
    const arena = v === 'mobile' ? D.balance.logicalArena : { ...D.balance.logicalArenaPc, ...v }
    const { run } = playRun(D, { policy: 'human', seed: j.s * 7907 + j.ch, chapter: j.ch, ...LOAD[j.ch], arena, maxTime: 330 })
    out.push({ ...j, t: run.t, clear: !!(run.result && run.result.cleared) })
  }
  parentPort.postMessage(out)
} else {
  const seeds = +process.argv[2] || 16
  const variants = { mobile: 'mobile', pc: {}, ...JSON.parse(process.env.PC_VARIANTS || '{}') }
  const jobs = []
  for (const v of Object.keys(variants)) for (const ch of CHAPTERS) for (let s = 1; s <= seeds; s++) jobs.push({ v, ch, s })
  const T = os.cpus().length
  const parts = Array.from({ length: T }, (_, i) => jobs.filter((_, k) => k % T === i))
  const res = (await Promise.all(parts.map((p) => new Promise((ok, no) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { jobs: p, variants } })
    w.once('message', ok)
    w.once('error', no)
  })))).flat()
  console.log(`${seeds} runs per chapter, human-like bot; cleared % and average length (runs stop at 330 s)`)
  for (const v of Object.keys(variants)) {
    const row = CHAPTERS.map((ch) => {
      const r = res.filter((x) => x.v === v && x.ch === ch)
      return `ch${ch} ${Math.round((100 * r.filter((x) => x.clear).length) / r.length)}% ${Math.round(r.reduce((a, x) => a + x.t, 0) / r.length)} s`
    })
    console.log(v.padEnd(8), row.join(' | '))
  }
}
