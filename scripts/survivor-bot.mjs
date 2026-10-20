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
import { createRun, step, choose, chargePath, FIXED } from '../src/survivor/game.js'

export const POLICIES = {
  core: ['count', 'interval', 'damage', 'bounce'],
  survival: ['maxHp', 'armor', 'regen', 'move', 'pickup'],
  // how a person played chapter 28 (a screenshot of the picks at the boss):
  // damage first and most, then count, then crit / HP / hood / coins / XP,
  // then the rest; pickup, split and move only when nothing else is there
  human: ['damage', 'count', 'crit', 'maxHp', 'armor', 'luck', 'xpGain', 'interval', 'regen', 'bounce', 'nyang', 'critDamage', 'ballSpeed', 'size'],
  natural: [],
}

export const SKILLS = {
  good: { every: 0, look: 0.45, warnSeen: 0, noise: 0 },
  casual: { every: 0.25, look: 0.25, warnSeen: 0.45, noise: 0.35 },
}

export function botInput(run, skill = SKILLS.good, mem = {}) {
  if (skill.every && mem.t !== undefined && run.t - mem.t < skill.every && mem.input) return mem.input
  const p = run.player
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  const live = run.enemies.filter((e) => e.state === 'live' || e.state === 'spawn')
  const def = (e) => run.D.balance.enemies[e.type]
  // warnings it has noticed (a casual player sees them a moment late)
  const seen = (e, total) => total - e.modeT >= skill.warnSeen
  const paths = live.filter((e) => e.behavior === 'boss' && e.mode === 'windup' && seen(e, def(e).windupSeconds)).map((e) => chargePath(run, e))
  const rings = live.filter((e) => e.mode === 'stompWind' && seen(e, def(e).stompWindup)).map((e) => ({ x: e.x, y: e.y, r: def(e).stompRadius }))
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
    // corners and walls are traps; open middle is safe
    const wall = Math.min(nx - x0, x1 - nx, ny - y0, y1 - ny)
    danger += wall < 50 ? ((50 - wall) / 50) ** 2 * 1.5 : 0
    danger += 0.00002 * ((nx - (x0 + x1) / 2) ** 2 + (ny - (y0 + y1) / 2) ** 2)
    // loose XP close by is worth a small detour
    for (const o of run.orbs) {
      const d = Math.hypot(o.x - nx, o.y - ny)
      if (d < 60) danger -= 0.02 * (1 - d / 60) * Math.min(4, o.v)
    }
    if (skill.noise) danger += run.rng() * skill.noise
    if (!best || danger < best.danger) best = { danger, x: dx, y: dy }
  }
  mem.t = run.t
  mem.input = { x: best.x, y: best.y }
  return mem.input
}

export function pick(run, policy) {
  const c = run.choices
  const want = POLICIES[policy] || []
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

// one chapter. opts: { policy, skill, seed, chapter, grade, perma, cats, tizzzz, maxTime }
export function playRun(D, { policy = 'natural', skill = 'good', seed = 1, chapter = 1, grade = 'D', perma = {}, cats = false, tizzzz = false, maxTime = 600 } = {}) {
  const run = createRun(D, { chapter, weaponId: 'bouncy_ball', grade, seed, perma, cats, tizzzz })
  const mem = {}
  const S = SKILLS[skill]
  for (let t = 0; t < maxTime && run.state !== 'over'; t += FIXED) {
    if (run.state === 'levelup') choose(run, pick(run, policy), run.choiceSeq)
    step(run, FIXED, botInput(run, S, mem))
    run.events.length = 0
  }
  return { run, peak: { balls: run.stats.peakBalls } }
}
