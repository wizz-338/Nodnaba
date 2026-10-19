// MANO SURVIVOR — the two checks of the plan, run on the game's own code:
//  1. upgrades: N runs of 18 level-ups, three cards each from the real
//     drawChoices (16 cards, same chance), picks in the plan's order (count >
//     interval > damage > bounce > the first card). Prints the same "power
//     index" P = 2^a × 1.5^d ÷ 0.7^c × H(2^r)/H(1) as mano_balance_simulator.py,
//     its quantiles and how often a card stacks. An index, not a win rate.
//  2. chests: the real save code opens the chests of four first clears and
//     fuses; how often the chosen weapon reaches A. Today (the bouncy ball
//     only, one roll a chest) and the planned four-weapon setup.
//   node scripts/survivor-sims.mjs [runs=200000] [campaigns=20000] [level-ups=18]
import { D } from './survivor-data.mjs'
import { drawChoices, rng32 } from '../src/survivor/game.js'
import { createProgress } from '../src/survivor/progress.js'

const N = +process.argv[2] || 200000
const M = +process.argv[3] || 20000
const LEVELS = +process.argv[4] || 18
// P(X ≥ k) for X ~ Binomial(n, p)
const binomAtLeast = (n, p, k) => {
  let c = 1
  let sum = 0
  for (let i = 0; i <= n; i++) {
    if (i >= k) sum += c * p ** i * (1 - p) ** (n - i)
    c = (c * (n - i)) / (i + 1)
  }
  return sum
}
const order = ['count', 'interval', 'damage', 'bounce']
const H = (b) => 1 + 7 * (1 - Math.exp(-b / 7))
const pool = [...D.weapons.registry[0].core, ...D.balance.upgrades.pool.filter((id) => !order.includes(id))]
const E = D.balance.upgrades.effects

const P = new Float64Array(N)
const offered = new Uint8Array(N)
const picked = { count: new Uint8Array(N) }
for (let i = 0; i < N; i++) {
  const run = { pool, rng: rng32(20261019 + i) }
  const n = { count: 0, interval: 0, damage: 0, bounce: 0 }
  for (let l = 0; l < LEVELS; l++) {
    const c = drawChoices(run)
    if (c.includes('count')) offered[i]++
    const pick = order.find((id) => c.includes(id))
    if (pick) n[pick]++
  }
  picked.count[i] = n.count
  P[i] = E.count.mul ** n.count * E.damage.mul ** n.damage / E.interval.mul ** n.interval * H(E.bounce.mul ** n.bounce) / H(1)
}
const sorted = Float64Array.from(P).sort()
const q = (p) => sorted[Math.min(N - 1, Math.floor((p / 100) * N))]
console.log(`--- upgrades: ${N.toLocaleString()} runs × ${LEVELS} level-ups, 3 of ${pool.length} cards each (game code) ---`)
for (const p of [5, 25, 50, 75, 90, 95, 99]) console.log(`${String(p).padStart(2)}th percentile power index ${q(p).toFixed(1).padStart(8)}×`)
const share = (f) => ((100 * Array.prototype.filter.call(P, f).length) / N).toFixed(1) + '%'
console.log(`index ≥ 550: ${share((x) => x >= 550)} (×1.25: ${share((x) => x * 1.25 >= 550)}, ×1.5: ${share((x) => x * 1.5 >= 550)})`)
console.log(`'count ×2' offered 6 or more times: ${((100 * offered.filter((x) => x >= 6).length) / N).toFixed(2)}% (binomial ${LEVELS}, 3/16: ${(100 * binomAtLeast(LEVELS, 3 / 16, 6)).toFixed(2)}%)`)
const dist = Array.from({ length: 9 }, (_, k) => ((100 * picked.count.filter((x) => x === k).length) / N).toFixed(1))
console.log(`'count ×2' picked 0..8 times: ${dist.join(' / ')} %  → balls per volley 1 … 256`)

// ── chests ──
function lootCampaign(seed, fourWeapons) {
  const mem = new Map()
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
  const DD = fourWeapons ? { ...D, weapons: { ...D.weapons, registry: ['bouncy_ball', 'churu', 'bubble', 'rattle'].map((id) => ({ ...D.weapons.registry[0], id })) } } : D
  const Pg = createProgress(DD, store)
  Pg.boot()
  for (let ch = 1; ch <= 4; ch++) {
    const r = Pg.startRun(ch)
    const id = `s${seed}c${ch}`
    for (const k of ['elite1', 'elite2', 'boss']) Pg.award(id, ch, k)
    Pg.finishRun(id, ch, { cleared: true, coins: 0 })
    void r
  }
  Pg.openAll()
  // fuse the chosen weapon (the bouncy ball) as far as it goes
  for (let again = true; again; ) {
    again = false
    const d = Pg.get()
    for (const g of DD.balance.grades) {
      const same = d.inventory.filter((it) => it.weaponId === 'bouncy_ball' && it.grade === g)
      if (same.length >= 3 && Pg.fuse(same.slice(0, 3).map((it) => it.id)).ok) {
        again = true
        break
      }
    }
  }
  const gi = (g) => DD.balance.grades.indexOf(g)
  return Math.max(...Pg.get().inventory.filter((it) => it.weaponId === 'bouncy_ball').map((it) => gi(it.grade)))
}
for (const four of [false, true]) {
  const best = []
  for (let s = 0; s < M; s++) best.push(lootCampaign(s, four))
  const a = best.filter((g) => g >= D.balance.grades.indexOf('A')).length
  const hist = {}
  for (const g of best) hist[D.balance.grades[g]] = (hist[D.balance.grades[g]] || 0) + 1
  console.log(`\n--- chests of four first clears (32), real save code, ${M.toLocaleString()} campaigns: ${four ? 'planned 4 weapons, 3 rolls a chest' : 'today: bouncy ball only, 1 roll a chest'} ---`)
  console.log(`bouncy ball reaches A or better: ${((100 * a) / M).toFixed(1)}%   best grade: ${JSON.stringify(hist)}  (start D + C gifts at chapters 2 and 4 included)`)
}
