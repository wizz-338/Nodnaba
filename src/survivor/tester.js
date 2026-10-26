// MANO SURVIVOR — the special-boss tester (#/game/mano-survivor-test, and
// -pc-test): the game as it is, set up to try the extra special bosses'
// patterns at once. Nothing of it touches the real save: the tester's
// progress lives in memory only (testerStorage) and is gone with the page.
//
// A test: Mano with high coin stats (이동 속도 and 치명타 확률 at their top),
// an SSS ball, every companion; a class change already made (one of the four:
// two of the ball, two of the cats) at about level 15; the chosen boss's
// chapter run straight to its boss, which falls at once, so the special boss
// comes as it would. Its fight lasts about the chosen time (its guard: it
// loses at most 1/seconds of its HP a second; and its HP made what the build
// takes in that time, once its first seconds have shown how hard the build
// hits), and the tester's bar can
// jump it to its next phase, make Mano unhurtable, or end the test.
// Pure, but for the storage.

import { fresh, KEY } from './progress.js'
import { choose } from './game.js'
import { CLASS_CARDS } from './zyo.js'

// the coin stats of the test: high, 이동 속도 and 치명타 확률 at their top
export const TEST_PERMA = { hp: 120, damage: 120, move: 40, interval: 120, crit: 101, coins: 0 }
// the class changes to try: two of the red ball, two of the cats
export const TEST_BUILDS = ['A', 'B', 'C', 'D']
// how long a special boss lasts at least (s; 0: it never falls)
export const TEST_TIMES = [60, 120, 180, 0]

// the bosses to try, in the story's order: { chapter, id }
export function testBosses(D) {
  return Object.entries(D.balance.extraBosses.chapters)
    .map(([ch, id]) => ({ chapter: +ch, id }))
    .sort((a, b) => a.chapter - b.chapter)
}

// the tester's save: everything open and earned, the stories seen
export function testerSave(D) {
  const d = fresh(D)
  const last = D.story.regions[D.story.regions.length - 1].to
  d.unlockedChapter = last
  d.firstCleared = Array.from({ length: last }, (_, i) => i + 1)
  d.perma = { ...TEST_PERMA }
  d.currency = 0
  d.inventory = [{ id: 'w1', weaponId: 'bouncy_ball', grade: 'SSS' }]
  d.equippedInstanceId = 'w1'
  d.nextSeq = 2
  d.seenHelp = true
  for (const k of ['cats', 'tizzzz']) d[k] = { unlocked: true, eventSeen: true, rewardGiven: true }
  d.zyo = { ...d.zyo, unlocked: true }
  d.turret = { ...d.turret, unlocked: true }
  d.blessings = Object.fromEntries(Object.keys(d.blessings).map((k) => [k, true]))
  d.story = { ...d.story, seen: D.story.cutscenes.groups.map((g) => g.id), news: [] }
  return d
}

// a storage in memory holding the tester's save (the real one is never read
// or written)
export function testerStorage(D) {
  const m = new Map([[KEY, JSON.stringify(testerSave(D))]])
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

// one level-up's card, chosen as a player would
function pick(run, id) {
  run.state = 'levelup'
  run.pending = 1
  run.choices = [id]
  run.choiceSeq++
  choose(run, id, run.choiceSeq)
}

// the picks a build takes: for a cat class one 친구냥이 first, then its two
// cards to the recipe's need by turns, then its class card
export function buildPicks(D, k) {
  const R = D.balance.zyo.recipes[k]
  const out = R.form === 'ninja' ? ['catSummon'] : []
  for (let i = 0; i < D.balance.zyo.need; i++) out.push(...R.mats)
  out.push(CLASS_CARDS[k])
  return out
}
// the lowest level a build stands at once it is made
export const buildLevel = (D, k) => 1 + buildPicks(D, k).length

// A run set up for the test: the build made (the class change done), the
// class's growth card for the levels above that, the clock at the boss.
// test: { k, level, seconds, god }
export function setupTest(run, test) {
  const D = run.D
  for (const id of buildPicks(D, test.k)) pick(run, id)
  const at = buildLevel(D, test.k)
  for (let L = at; L < test.level; L++) if (run.pool.includes('power')) pick(run, 'power')
  run.level = Math.max(at, test.level)
  run.state = 'play'
  run.pending = 0
  run.choices = null
  // straight to the chapter's boss (the elites before it skipped)
  run.t = Math.max(run.t, D.balance.chapter.events.find((e) => e.key === 'boss').at - 0.01)
  run.nextEvent = D.balance.chapter.events.findIndex((e) => e.key === 'boss')
  run.test = { ...test, killed: false, set: false }
  return run
}

// Each frame of a test: the chapter's boss falls as soon as it stands; the
// special boss, when it comes, gets the test's guard (or never falls); Mano
// unhurtable if asked. Returns what happened ('boss', 'extra') or null.
export function testTick(run) {
  const T = run.test
  if (!T) return null
  if (T.god) run.player.hp = run.player.maxHp
  if (!T.killed && run.boss && run.boss.state === 'live') {
    T.killed = true
    const b = run.boss
    b.guard = false
    b.hp = 1
    run.hurt(b, 1e9, b.x, b.y)
    return 'boss'
  }
  const x = run.extra && run.extra.boss
  if (x && !T.set) {
    T.set = true
    // it loses at most 1/seconds of its HP a second, so it lasts at least
    // that long (0: it never falls, the phases are walked with the bar)
    Object.assign(x, { guard: true, guardShare: T.seconds > 0 ? 1 / T.seconds : 0, guardLeft: 0, guardT: run.t })
    return 'extra'
  }
  // and no much longer either: after FIT s of its fight its HP is made what
  // the build takes in about `seconds` (a build too weak for a late chapter
  // would otherwise never see its last phases)
  if (x && T.seconds > 0 && !T.fit && x.state === 'live') {
    T.from ??= { t: run.t, hp: x.hp }
    if (run.t - T.from.t >= FIT) {
      T.fit = true
      const dps = (T.from.hp - x.hp) / (run.t - T.from.t)
      const want = dps * T.seconds
      if (want > 0 && want < x.maxHp) {
        const f = x.hp / x.maxHp
        x.maxHp = want
        x.hp = want * f
      }
      return 'fit'
    }
  }
  return null
}
const FIT = 6

// the special boss's phase now (1 …) and how many it has
export function testPhase(run) {
  const x = run.extra && run.extra.boss
  if (!x) return null
  const P = run.D.balance.extraBosses.bosses[x.extra].phases
  const f = x.hp / x.maxHp
  let i = P.findIndex((ph) => f > ph.above)
  if (i < 0) i = P.length - 1
  return { i, n: P.length }
}

// the tester's bar: the special boss to just inside its next phase (the last
// phase: nearly down; it never falls this way)
export function skipPhase(run) {
  const x = run.extra && run.extra.boss
  const ph = testPhase(run)
  if (!x || !ph || x.state !== 'live') return false
  const P = run.D.balance.extraBosses.bosses[x.extra].phases
  const to = ph.i + 1 < P.length ? P[ph.i].above - 0.005 : 0.01
  x.hp = Math.max(1, x.maxHp * to)
  return true
}
