// Bot players for balance runs. Movement comes in two skills:
//   good    re-decides every step, looks 0.45 s ahead, keeps out of warnings
//   casual  re-decides only every 0.25 s, looks 0.25 s ahead, drifts a little
//           and notices the boss's warnings late
// Upgrade picks follow a policy:
//   core     the attached simulator's order: count > interval > damage >
//            bounce > whatever comes first
//   survival hp / armor / regen / move first
//   human    a person's order (see POLICIES.human), Tizzzz's card when it is one
//   natural  the first card shown (cards come in random order)
//   ballFocus / catFocus  the red ball's cards first / the friend cats' cards
//            first, then crit and staying alive; they redraw (the rerolls)
//            cards that have none of their line
//   unlucky  the first card shown and never a redraw (see survivor-cats-dps.mjs)
//   mixed    the ball's and the cats' cards in turn
//   zyoA … zyoD  go for zyo_'s recipe (balance.json → zyo.recipes): its two
//            cards first (one 친구냥이 first for the cats' recipes), then a
//            person's order; they redraw for them and take only their own
//            class card
// Every policy takes a class card (zyo_'s class change) when it is offered,
// and 전투력 comes first after it.
import { createRun, step, choose, reroll, makeTurret, chargePath, FIXED } from '../src/survivor/game.js'
import { touches, inGap, reachesAt } from '../src/survivor/bosses.js'

export const POLICIES = {
  core: ['count', 'interval', 'damage', 'bounce'],
  survival: ['maxHp', 'armor', 'regen', 'move', 'pickup'],
  // how a person played chapter 28 (a screenshot of the picks at the boss):
  // damage first and most, then count, then crit / HP / hood / coins / XP,
  // then the rest; pickup, split and move only when nothing else is there
  human: ['power', 'damage', 'count', 'crit', 'maxHp', 'armor', 'luck', 'xpGain', 'interval', 'regen', 'bounce', 'nyang', 'critDamage', 'ballSpeed', 'size'],
  natural: [],
  ballFocus: ['count', 'damage', 'interval', 'bounce', 'crit', 'critDamage', 'maxHp', 'armor', 'regen', 'split', 'size', 'ballSpeed', 'move', 'nyang'],
  catFocus: ['catSummon', 'catClaw', 'catRate', 'catSize', 'catSpeed', 'crit', 'critDamage', 'maxHp', 'armor', 'regen', 'move', 'nyang'],
  unlucky: [],
  // both lines taken turn about (survivor-cats-dps.mjs: does mixing blow up?)
  mixed: ['catSummon', 'count', 'catClaw', 'damage', 'interval', 'catRate', 'bounce', 'catSize', 'catSpeed', 'crit', 'critDamage', 'maxHp', 'armor', 'regen'],
}
const ZYO = { A: ['size', 'count'], B: ['interval', 'ballSpeed'], C: ['catSize', 'catRate'], D: ['catSpeed', 'catClaw'] }
for (const [k, m] of Object.entries(ZYO)) POLICIES['zyo' + k] = [...(k >= 'C' ? ['catSummon'] : []), ...m, ...POLICIES.human]
// the line a policy redraws for
const LINE = { ballFocus: ['count', 'damage', 'interval', 'bounce'], catFocus: ['catSummon', 'catClaw', 'catRate', 'catSize', 'catSpeed'], ...Object.fromEntries(Object.entries(ZYO).map(([k, m]) => ['zyo' + k, m])) }

export const SKILLS = {
  good: { every: 0, look: 0.45, warnSeen: 0, noise: 0 },
  casual: { every: 0.25, look: 0.25, warnSeen: 0.45, noise: 0.35 },
}

export function botInput(run, skill = SKILLS.good, mem = {}) {
  if (skill.every && mem.t !== undefined && run.t - mem.t < skill.every && mem.input) return mem.input
  const p = run.player
  const [x0, y0, x1, y1] = (run.extra && run.extra.box) || run.arena.bounds
  const live = run.enemies.filter((e) => e.state === 'live' || e.state === 'spawn')
  const def = (e) => run.D.balance.enemies[e.type]
  // warnings it has noticed (a casual player sees them a moment late)
  const seen = (e, total) => total - e.modeT >= skill.warnSeen
  const paths = live.filter((e) => e.behavior === 'boss' && e.mode === 'windup' && seen(e, def(e).windupSeconds)).map((e) => chargePath(run, e))
  // a boss about to run (type D) or running: keep well clear of it
  const rings = live.filter((e) => e.mode === 'rush' || (e.mode === 'rushWind' && seen(e, run.D.balance.bossTypes.D.warn))).map((e) => ({ x: e.x, y: e.y, r: e.r + 30 }))
  let best = null
  // try 16 directions (and standing still)
  for (let k = -1; k < 16; k++) {
    const a = (k * Math.PI) / 8
    const dx = k < 0 ? 0 : Math.cos(a)
    const dy = k < 0 ? 0 : Math.sin(a)
    const T = skill.look
    const nx = Math.max(x0 + 10, Math.min(x1 - 10, p.x + dx * p.speed * T))
    const ny = Math.max(y0 + 10, Math.min(y1 - 10, p.y + dy * p.speed * T))
    let danger = 0
    for (const e of live) {
      const d = Math.hypot(nx - e.x, ny - e.y) - e.r - p.hitR
      if (d < 70) danger += ((70 - Math.max(d, 0)) / 70) ** 2 * (e.damage / 9)
    }
    for (const c of paths) {
      const t = Math.max(0, Math.min(c.len, (nx - c.x) * c.dx + (ny - c.y) * c.dy))
      const off = Math.hypot(nx - (c.x + c.dx * t), ny - (c.y + c.dy * t))
      if (off < c.half + p.hitR + 8) danger += 6
    }
    for (const c of rings) if (Math.hypot(nx - c.x, ny - c.y) < c.r + p.hitR + 8) danger += 6
    // a special boss's warnings (the sooner they land, the worse) and shots
    // (where they will be by then), as a person sees them on the ground
    for (const h of run.hazards) {
      // a ring or a band on its way: be in one of its gaps (or where it will
      // not reach) before its front comes; judged after a longer stride too
      if (h.kind === 'wave' || h.kind === 'band') {
        if (run.t > h.until || h.hit) continue
        for (const [x, y, w] of [
          [nx, ny, 1],
          [Math.max(x0 + 10, Math.min(x1 - 10, p.x + dx * p.speed * 0.9)), Math.max(y0 + 10, Math.min(y1 - 10, p.y + dy * p.speed * 0.9)), 0.5],
        ]) {
          const t2 = reachesAt(h, x, y)
          if (t2 === null || t2 > h.until || t2 < run.t - 0.1 || t2 - run.t > 3) continue
          if (!inGap(h, x, y, p.hitR + 4)) danger += w * (40 + 20 / Math.max(0.2, t2 - run.t))
        }
        continue
      }
      // the aim lines of a volley about to fly: their lanes are where the shots go
      if (h.kind === 'ray' && h.at - run.t < 0.8) {
        const t = (nx - h.x) * h.dx + (ny - h.y) * h.dy
        if (t > 0 && Math.abs((nx - h.x) * -h.dy + (ny - h.y) * h.dx) < p.hitR + 12) danger += 12
        continue
      }
      const charging = h.dash && h.done // the path of a charge under way
      if ((h.harmless && !h.dash) || (h.done && !charging) || h.at - run.t > 2.5) continue
      // a blow that is coming outweighs merely being near a monster; it is
      // judged where she would be after a longer stride too (a person runs
      // clear of a warning, not just to its edge)
      const fx = Math.max(x0 + 10, Math.min(x1 - 10, p.x + dx * p.speed * 0.9))
      const fy = Math.max(y0 + 10, Math.min(y1 - 10, p.y + dy * p.speed * 0.9))
      const until = h.at - run.t
      if (touches(h, nx, ny, p.hitR + 6)) danger += 40 + 20 / Math.max(0.2, until)
      if (until > 0.45 && touches(h, fx, fy, p.hitR + 6)) danger += 20
    }
    for (const s2 of run.shots) {
      const sx = s2.x + s2.vx * T * 0.6
      const sy = s2.y + s2.vy * T * 0.6
      const d2 = Math.hypot(nx - sx, ny - sy)
      if (d2 < s2.r + p.hitR + 14) danger += 5 * (1 - d2 / (s2.r + p.hitR + 14)) + 2
    }
    for (const f of run.floors) if (Math.hypot(nx - f.x, ny - f.y) < f.r) danger += 0.6
    // corners and walls are traps; open middle is safe
    const wall = Math.min(nx - x0, x1 - nx, ny - y0, y1 - ny)
    danger += wall < 50 ? ((50 - wall) / 50) ** 2 * 1.5 : 0
    danger += 0.00002 * ((nx - (x0 + x1) / 2) ** 2 + (ny - (y0 + y1) / 2) ** 2)
    // loose XP close by is worth a small detour
    for (const o of run.orbs) {
      const d = Math.hypot(o.x - nx, o.y - ny)
      if (d < 60) danger -= 0.02 * (1 - d / 60) * Math.min(4, o.v)
    }
    // the PC thief out of sight: a person follows the arrow toward it
    for (const e of live) {
      if (!e.roam) continue
      const [vx0, vy0, vx1, vy1] = run.view
      if (e.x > vx0 && e.x < vx1 && e.y > vy0 && e.y < vy1) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y) || 1
      danger -= 0.5 * Math.max(0, (dx * (e.x - p.x) + dy * (e.y - p.y)) / d)
    }
    if (skill.noise) danger += run.rng() * skill.noise
    // keeping on the way it was going (a person does not dither)
    if (mem.input && k >= 0 && dx * mem.input.x + dy * mem.input.y > 0.7) danger -= 0.15
    if (!best || danger < best.danger) best = { danger, x: dx, y: dy }
  }
  mem.t = run.t
  mem.input = { x: best.x, y: best.y }
  return mem.input
}

export function pick(run, policy) {
  const c = run.choices
  // (a recipe hunter takes its own class card; any other policy the first one)
  const cls = c.find((id) => /^cls[A-D]$/.test(id) && (!policy.startsWith('zyo') || id === 'cls' + policy.slice(3)))
  if (cls) return cls
  let want = POLICIES[policy] || []
  // a recipe hunter: one 친구냥이 is enough before the cats' cards; past ten a card is done
  if (policy.startsWith('zyo')) want = want.filter((id) => !(id === 'catSummon' && run.cat.n > 0) && !(ZYO[policy.slice(3)].includes(id) && (run.picks[id] || 0) >= run.D.balance.zyo.need))
  const edited = run.edit && run.edit.seq === run.choiceSeq && c.includes(run.edit.id) ? run.edit.id : null
  // a person weighs Tizzzz's card: worth a couple of places in their order,
  // not more (an edited HP card does not beat plain damage)
  if (policy === 'human') {
    const score = (id) => (want.includes(id) ? want.indexOf(id) : 99) - (id === edited ? 2.5 : 0)
    return c.slice().sort((a, b) => score(a) - score(b))[0]
  }
  // the other bots take a card Tizzzz rewrote whenever it is one they want at all
  if (edited && want.includes(edited)) return edited
  for (const id of want) if (c.includes(id)) return id
  return c[0]
}

// one chapter. opts: { policy, skill, seed, chapter, grade, perma, cats, tizzzz, blessings, rerolls, arena, maxTime, turret, craft }
export function playRun(D, { policy = 'natural', skill = 'good', seed = 1, chapter = 1, grade = 'D', perma = {}, cats = false, tizzzz = false, zyo = false, blessings = {}, rerolls = 0, arena, maxTime = 600, turret = false, craft } = {}) {
  const run = createRun(D, { chapter, weaponId: 'bouncy_ball', grade, seed, perma, cats, tizzzz, zyo, blessings, rerolls, arena, turret })
  const mem = {}
  const S = SKILLS[skill]
  for (let t = 0; t < maxTime && run.state !== 'over'; t += FIXED) {
    // (craft(run): the picks to spend on a turret now, or none)
    if (run.state === 'levelup' && craft) {
      const ids = craft(run)
      if (ids) makeTurret(run, ids, run.choiceSeq)
    }
    if (run.state === 'levelup') {
      // (a cats' recipe needs a cat before its cards come: 친구냥이 first)
      const line = policy.startsWith('zyo') && ZYO[policy.slice(3)][0].startsWith('cat') && run.cat.n === 0 ? ['catSummon'] : LINE[policy]
      while (line && !run.cls && run.rerolls > 0 && !run.choices.some((id) => line.includes(id))) reroll(run, run.choiceSeq)
      choose(run, pick(run, policy), run.choiceSeq)
    }
    step(run, FIXED, botInput(run, S, mem))
    run.events.length = 0
  }
  return { run, peak: { balls: run.stats.peakBalls } }
}
