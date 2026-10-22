// MANO SURVIVOR — the phone field against the PC field: the same bots, seeds
// and loadouts on each, so the two platforms can be seen to be the same fight.
//   node scripts/survivor-platform-parity.mjs [seeds]
import { D } from './survivor-data.mjs'
import { playRun } from './survivor-bot.mjs'

const SEEDS = +process.argv[2] || 8
// a loadout a player has when they reach the chapter (like survivor-campaign.mjs's)
const CASES = [
  { chapter: 1, grade: 'D', perma: {} },
  { chapter: 3, grade: 'D', perma: { hp: 3, damage: 3 } },
  { chapter: 5, grade: 'C', perma: { hp: 6, damage: 6, interval: 3 } },
  { chapter: 11, grade: 'A', perma: { hp: 25, damage: 25, interval: 20, crit: 10, move: 8 }, cats: true },
  { chapter: 16, grade: 'S', perma: { hp: 40, damage: 40, interval: 35, crit: 25, move: 15 }, cats: true, tizzzz: true },
  { chapter: 28, grade: 'SS', perma: { hp: 80, damage: 80, interval: 75, crit: 55, move: 30 }, cats: true, tizzzz: true, blessings: { phoenix: true, snow: true } },
]
const fields = { mobile: D.balance.logicalArena, pc: D.balance.logicalArenaPc }
for (const c of CASES) {
  const out = {}
  for (const [name, arena] of Object.entries(fields)) {
    let clear = 0
    let t = 0
    let kills = 0
    let hurt = 0
    for (let s = 1; s <= SEEDS; s++) {
      const { run } = playRun(D, { policy: 'human', seed: s * 7907 + c.chapter, ...c, arena })
      clear += run.result && run.result.cleared ? 1 : 0
      t += run.t
      kills += run.kills
      hurt += run.stats.hurt
    }
    out[name] = `clear ${clear}/${SEEDS}, ${(t / SEEDS).toFixed(0)} s, kills ${(kills / SEEDS).toFixed(0)}, hurt ${(hurt / SEEDS).toFixed(0)}`
  }
  console.log(`ch${c.chapter}  phone: ${out.mobile}  |  PC: ${out.pc}`)
}
