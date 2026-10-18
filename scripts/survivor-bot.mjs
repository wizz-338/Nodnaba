// A simple player for balance runs: keeps away from the crowd, drifts toward
// open space and loose XP, never touches the walls for long. Upgrade picks
// follow a policy:
//   A survival / utility first   B even spread   C count/damage/haste/split
import { createRun, step, choose, FIXED } from '../src/survivor/game.js'

export const POLICIES = {
  A: ['health', 'magnet', 'size', 'bounce', 'damage', 'haste', 'count', 'split'],
  B: null, // rotate through what is offered
  C: ['count', 'damage', 'haste', 'split', 'bounce', 'size', 'health', 'magnet'],
  natural: 'natural', // first card shown (cards are drawn by weight)
}

export function botInput(run) {
  const p = run.player
  const [x0, y0, x1, y1] = run.D.balance.logicalArena.bounds
  const live = run.enemies.filter((e) => e.state !== 'die')
  let best = null
  // try 16 directions (and standing still); look 0.45 s ahead
  for (let k = -1; k < 16; k++) {
    const a = (k * Math.PI) / 8
    const dx = k < 0 ? 0 : Math.cos(a)
    const dy = k < 0 ? 0 : Math.sin(a)
    const T = 0.45
    const nx = Math.max(x0 + 10, Math.min(x1 - 10, p.x + dx * p.speed * T))
    const ny = Math.max(y0 + 10, Math.min(y1 - 10, p.y + dy * p.speed * T))
    let danger = 0
    for (const e of live) {
      const ex = e.x + Math.sign(nx - e.x) * 0 // enemies keep coming; distance is enough
      const d = Math.hypot(nx - ex, ny - e.y) - e.r - p.hitR
      if (d < 70) danger += ((70 - Math.max(d, 0)) / 70) ** 2 * (e.damage / 9)
    }
    // corners and walls are traps; open middle is safe
    const wall = Math.min(nx - x0, x1 - nx, ny - y0, y1 - ny)
    danger += wall < 50 ? ((50 - wall) / 50) ** 2 * 1.5 : 0
    danger += 0.00002 * ((nx - (x0 + x1) / 2) ** 2 + (ny - (y0 + y1) / 2) ** 2)
    // loose XP close by is worth a small detour
    for (const o of run.orbs) {
      const d = Math.hypot(o.x - nx, o.y - ny)
      if (d < 60) danger -= 0.02 * (1 - d / 60) * Math.min(4, o.v)
    }
    if (!best || danger < best.danger) best = { danger, x: dx, y: dy }
  }
  return { x: best.x, y: best.y }
}

export function pick(run, policy, k) {
  const c = run.choices
  if (policy === 'natural') return c[0]
  if (!POLICIES[policy]) return c[k % c.length]
  for (const id of POLICIES[policy]) if (c.includes(id)) return id
  return c[0]
}

export function playRun(D, { policy = 'natural', seed = 1, chapter = 1, grade = 'D', maxTime = 400 } = {}) {
  const run = createRun(D, { chapter, weaponId: 'bouncy_ball', grade, seed })
  let k = 0
  let peak = { enemies: 0, balls: 0 }
  for (let t = 0; t < maxTime && run.state !== 'over'; t += FIXED) {
    if (run.state === 'levelup') choose(run, pick(run, policy, k++), run.choiceSeq)
    step(run, FIXED, botInput(run))
    run.events.length = 0
    peak.enemies = Math.max(peak.enemies, run.enemies.length)
    peak.balls = Math.max(peak.balls, run.balls.length)
  }
  return { run, peak }
}
