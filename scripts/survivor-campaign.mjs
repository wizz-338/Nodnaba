// MANO SURVIVOR — whole campaigns played by bots, with the real save code:
// chapters 1 → 5 in order, retrying a lost chapter; after every run the bot
// opens its chests, fuses what it can for its weapon, equips the best grade
// and spends its coins on the coin stats (always the cheapest one next).
// Reports, per chapter, how often the FIRST attempt clears (first arrival)
// and how many attempts a clear took.
//   node scripts/survivor-campaign.mjs [campaigns] [skill] [policy] [maxChapter]
// A bot is not a person: these numbers show trends, not win rates.
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import os from 'os'

const MAX_TRIES = 8

async function campaign(seed, skill, policy, maxCh) {
  const { D } = await import('./survivor-data.mjs')
  const { playRun } = await import('./survivor-bot.mjs')
  const { createProgress, canFuse, statPrice, statMaxLevel, STATS } = await import('../src/survivor/progress.js')
  const mem = new Map()
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
  const P = createProgress(D, store)
  P.boot()
  const out = []
  let n = 0
  for (let ch = 1; ch <= maxCh; ch++) {
    let cleared = false
    let tries = 0
    let first = null
    while (!cleared && tries < MAX_TRIES) {
      tries++
      const s = P.startRun(ch)
      const { run } = playRun(D, { policy, skill, seed: seed * 1009 + ++n, chapter: ch, grade: s.weapon.grade, perma: s.perma })
      for (const key of run.awards) P.award(s.runId, ch, key)
      const r = run.result || { cleared: false, coins: Math.floor(run.coins), time: run.t }
      P.finishRun(s.runId, ch, r)
      if (!first) first = { cleared: r.cleared, time: run.t, bossLeft: r.bossLeft, grade: s.weapon.grade, perma: { ...s.perma }, coins: r.coins, level: run.level, kills: run.kills }
      cleared = r.cleared
      // between runs: chests, fusion, the best weapon, coin stats
      P.openAll()
      for (let again = true; again; ) {
        again = false
        const d = P.get()
        for (const g of D.balance.grades) {
          const same = d.inventory.filter((it) => it.weaponId === 'bouncy_ball' && it.grade === g)
          if (same.length >= 3 && canFuse(D, d, same.slice(0, 3).map((it) => it.id)).ok) {
            P.fuse(same.slice(0, 3).map((it) => it.id))
            again = true
            break
          }
        }
      }
      const d = P.get()
      const best = d.inventory.slice().sort((a, b) => D.balance.grades.indexOf(b.grade) - D.balance.grades.indexOf(a.grade))[0]
      P.equip(best.id)
      for (;;) {
        const d2 = P.get()
        const opts = STATS.filter((k) => d2.perma[k] < statMaxLevel(D, k)).map((k) => ({ k, price: statPrice(D, k, d2.perma[k]) })).sort((a, b) => a.price - b.price)
        if (!opts.length || opts[0].price > d2.currency) break
        P.buyStat(opts[0].k, d2.perma[opts[0].k])
      }
    }
    out.push({ ch, first, tries, cleared })
    if (!cleared) break
  }
  return out
}

if (!isMainThread) {
  const res = []
  for (const s of workerData.seeds) res.push(await campaign(s, workerData.skill, workerData.policy, workerData.maxCh))
  parentPort.postMessage(res)
} else {
  const N = +process.argv[2] || 24
  const skill = process.argv[3] || 'good'
  const policy = process.argv[4] || 'core'
  const maxCh = +process.argv[5] || 5
  const T = os.cpus().length
  const parts = Array.from({ length: T }, (_, i) => Array.from({ length: N }, (_, s) => s + 1).filter((s) => s % T === i))
  const t0 = Date.now()
  const all = (await Promise.all(parts.map((seeds) => new Promise((ok, fail) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { seeds, skill, policy, maxCh } })
    w.once('message', ok)
    w.once('error', fail)
  })))).flat()
  console.log(`${N} campaigns, ${skill} movement, ${policy} picks (first arrival = the first try at a chapter)`)
  for (let ch = 1; ch <= maxCh; ch++) {
    const rows = all.map((c) => c.find((x) => x.ch === ch)).filter(Boolean)
    if (!rows.length) break
    const firstClear = rows.filter((r) => r.first.cleared).length
    const done = rows.filter((r) => r.cleared)
    const avg = (f, list = rows) => (list.length ? list.reduce((a, r) => a + f(r), 0) / list.length : 0)
    const lost = rows.filter((r) => !r.first.cleared)
    const atBoss = lost.filter((r) => r.first.time >= 210).length
    const permaSum = (r) => Object.values(r.first.perma).reduce((a, b) => a + b, 0)
    const grades = {}
    for (const r of rows) grades[r.first.grade] = (grades[r.first.grade] || 0) + 1
    console.log(`ch${ch}: reached ${rows.length}, first try cleared ${firstClear} (${((100 * firstClear) / rows.length).toFixed(0)}%), lost at the boss ${atBoss}/${lost.length}; cleared within ${MAX_TRIES} tries ${done.length}, avg tries ${avg((r) => r.tries, done).toFixed(1)}; first try: level ${avg((r) => r.first.level).toFixed(1)}, kills ${avg((r) => r.first.kills).toFixed(0)}; on arrival: coin-stat levels ${avg(permaSum).toFixed(1)}, grade ${JSON.stringify(grades)}`)
  }
  console.log(((Date.now() - t0) / 1000).toFixed(0) + ' s')
}
