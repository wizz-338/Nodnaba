// MANO RUN fairness test: a bot that only sees obstacles already on screen
// plays many random runs. Whenever it is on the ground it searches every jump
// timing (and follow-up jumps) for one that survives what is visible. If no
// such plan exists, the generator produced an unavoidable situation and the
// test fails with the seed and time so it can be replayed.
//
//   node scripts/mano-run-fairness.mjs [runs=40] [seconds=240] [viewW=390]

import { createGame, start, tick, TICK, MANO_X, SPRITE_W } from '../src/game/engine.js'

const RUNS = +(process.argv[2] || 40)
const SECONDS = +(process.argv[3] || 240)
const VIEW_W = +(process.argv[4] || 390)
const STEP = 2 // bot decides every 2 ticks (60 Hz), like a frame-based player

const clone = (g) => {
  const c = { ...g, mano: { ...g.mano }, obstacles: g.obstacles.map((o) => ({ ...o })), events: [] }
  c.nextIn = Infinity // the bot only knows what is on screen
  return c
}

const run = (g, n, held) => {
  for (let i = 0; i < n; i++) {
    tick(g, { held, pressed: false })
    if (g.phase === 'dead') return false
  }
  return true
}

// ticks until every visible obstacle is behind Mano
const horizon = (g) => {
  let far = 0
  for (const o of g.obstacles) far = Math.max(far, o.x + o.w - MANO_X)
  return Math.ceil(far / ((g.speed + 50) * TICK)) + 2
}

const jumpAndLand = (g) => {
  tick(g, { held: true, pressed: true })
  let guard = 400
  while (!g.mano.ground && g.phase !== 'dead' && guard--) tick(g, { held: true, pressed: false })
  return g.phase !== 'dead'
}

function feasible(g, depth) {
  if (g.phase === 'dead') return false
  const H = horizon(g)
  if (H <= 2) return true
  for (let k = 0; k <= H; k += STEP) {
    const w = clone(g)
    if (!run(w, k, false)) return false // waiting this long already kills
    if (!w.mano.ground) continue
    const j = clone(w)
    if (jumpAndLand(j) && (depth === 0 || feasible(j, depth - 1))) return true
  }
  const w = clone(g)
  return run(w, H, false)
}

let fails = 0
let totalScore = 0
let jumps = 0
const types = {}
const t0 = Date.now()
for (let r = 0; r < RUNS; r++) {
  const seed = 1000 + r * 7919
  const g = createGame({ seed, viewW: VIEW_W })
  start(g)
  let ok = true
  while (g.t < SECONDS) {
    for (const o of g.obstacles) if (!o.counted) (o.counted = true), (types[o.type] = (types[o.type] || 0) + 1)
    if (g.mano.ground) {
      const wait = clone(g)
      const canWait = run(wait, STEP, false) && feasible(wait, 3)
      if (!canWait) {
        const jump = clone(g)
        if (!(jumpAndLand(jump) && feasible(jump, 3))) {
          ok = false
          const vis = g.obstacles.map((o) => `${o.type}@${Math.round(o.x)}`).join(' ')
          console.log(`UNAVOIDABLE seed=${seed} t=${g.t.toFixed(2)}s speed=${g.speed.toFixed(0)} score=${g.score} visible: ${vis}`)
          break
        }
        jumps++
        tick(g, { held: true, pressed: true })
        while (!g.mano.ground && g.phase !== 'dead') tick(g, { held: true, pressed: false })
        continue
      }
    }
    for (let i = 0; i < STEP; i++) tick(g, { held: true, pressed: false })
    if (g.phase === 'dead') {
      ok = false
      console.log(`BOT DIED seed=${seed} t=${g.t.toFixed(2)}`)
      break
    }
  }
  if (!ok) fails++
  totalScore += g.score
  if (ok) process.stdout.write(`run ${r + 1}/${RUNS}: survived ${SECONDS}s, score ${g.score}, final speed ${g.speed.toFixed(0)}\n`)
}
console.log(`\nview ${VIEW_W}px · ${RUNS} runs × ${SECONDS}s · jumps ${jumps} · obstacles seen ${JSON.stringify(types)}`)
console.log(`avg score ${Math.round(totalScore / RUNS)} · unavoidable situations: ${fails} · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(fails ? 1 : 0)
