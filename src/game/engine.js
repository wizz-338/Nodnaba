// MANO RUN — game rules and physics, no rendering.
//
// Units are logical pixels and seconds. x grows to the right, y grows UP from
// the ground (y = 0 is the ground line). The world scrolls left at `speed`
// while Mano stays at a fixed x. Physics runs on a fixed 1/120 s tick, so the
// game behaves the same at any frame rate.

export const TICK = 1 / 120

// Mano
export const MANO_X = 22 // left edge of the 50×60 sprite
export const SPRITE_W = 50
export const SPRITE_H = 60
// Forgiving hitboxes (sprite-relative, y measured up from the feet).
// The swinging tail and the paws are not solid.
const MANO_BOXES = [
  { x0: 15, x1: 43, y0: 29, y1: 55 }, // hood + face
  { x0: 15, x1: 35, y0: 2, y1: 29 }, // body + legs
]

// Jump: full hold ≈ 80 px apex, 0.61 s in the air. Releasing early cuts it short.
export const GRAVITY = 1700
export const JUMP_V = 520
const CUT_V = 250
const JUMP_BUFFER = 0.1 // a tap just before landing still jumps
export const AIR_TIME = (2 * JUMP_V) / GRAVITY

// Speed: brisk from the first second, ramps up and levels off so it stays dodgeable.
const V0 = 250
const VMAX = 490
const TAU = 60

// Obstacles. y0 = height of the bottom above the ground, vx = extra speed.
export const TYPES = {
  box: { w: 14, h: 12, y0: 0, vx: 0 },
  crate: { w: 18, h: 17, y0: 0, vx: 0 },
  pillar: { w: 8, h: 30, y0: 0, vx: 0 },
  box2: { w: 28, h: 12, y0: 0, vx: 0 },
  box3: { w: 42, h: 12, y0: 0, vx: 0 },
  yarn: { w: 12, h: 12, y0: 0, vx: 50 },
  birdLow: { w: 17, h: 11, y0: 16, vx: 0 }, // jump over it
  birdHigh: { w: 17, h: 11, y0: 62, vx: 0 }, // stay on the ground, it flies over
}

// Which obstacles can appear, by score. Weights grow the mix as you go.
const STAGES = [
  { from: 0, mix: { box: 4, crate: 3, pillar: 2 } },
  { from: 150, mix: { box: 3, crate: 3, pillar: 3, box2: 2 } },
  { from: 260, mix: { box: 2, crate: 3, pillar: 3, box2: 2, yarn: 2 } },
  { from: 420, mix: { box: 2, crate: 2, pillar: 3, box2: 2, yarn: 2, birdLow: 2, box3: 1 } },
  { from: 620, mix: { box: 1, crate: 2, pillar: 3, box2: 2, yarn: 2, birdLow: 2, box3: 2, birdHigh: 2 } },
]

// Small deterministic RNG kept in the state (plain data), so a run can be
// replayed or copied exactly.
function rand(g) {
  let s = g.seed
  s ^= s << 13
  s ^= s >>> 17
  s ^= s << 5
  g.seed = s >>> 0
  return g.seed / 2 ** 32
}

export function createGame({ seed, viewW = 300 } = {}) {
  return {
    seed: (seed ?? (Math.random() * 2 ** 32)) >>> 0 || 1,
    viewW,
    phase: 'ready', // ready → run → dead
    t: 0,
    speed: V0,
    dist: 0,
    score: 0,
    mano: { x: MANO_X, y: 0, vy: 0, ground: true, held: false, buffer: 0, angle: 0, vx: 0 },
    obstacles: [],
    nextIn: 140, // distance until the next obstacle spawns
    nextType: null,
    lastType: null,
    deadT: 0,
    events: [], // jump / land / crash, consumed by the renderer
    acc: 0,
  }
}

export function speedAt(t) {
  return V0 + (VMAX - V0) * (1 - Math.exp(-t / TAU))
}

function pick(g) {
  const stage = STAGES.filter((s) => g.score >= s.from).pop()
  const entries = Object.entries(stage.mix)
  const total = entries.reduce((a, [, w]) => a + w, 0)
  let r = rand(g) * total
  for (const [type, w] of entries) {
    if ((r -= w) < 0) return type
  }
  return entries[0][0]
}

// Minimum clear distance after an obstacle so a full jump over it always
// lands with time to react before the next one — whatever the next one is.
function gapAfter(g, nextType) {
  const v = g.speed * 1.04 // speed keeps rising while the gap scrolls in
  const extra = TYPES[nextType].vx
  const rel = v + extra
  const travel = (g.viewW + 16 - MANO_X) / v
  const min = rel * (AIR_TIME + 0.24) + extra * travel
  const progress = Math.min(1, g.t / 90)
  const spread = v * (0.95 - 0.55 * progress) * rand(g)
  return min + spread
}

function spawn(g, type) {
  const T = TYPES[type]
  const x = g.viewW + 16
  g.obstacles.push({ type, x, y0: T.y0, w: T.w, h: T.h, vx: T.vx, phase: rand(g) })
  g.lastType = type
  return { type, w: T.w }
}

function overlaps(m, o) {
  for (const b of MANO_BOXES) {
    const ax0 = m.x + b.x0
    const ax1 = m.x + b.x1
    const ay0 = m.y + b.y0
    const ay1 = m.y + b.y1
    // 1 px of grace on every obstacle edge
    if (ax0 < o.x + o.w - 1 && ax1 > o.x + 1 && ay0 < o.y0 + o.h - 1 && ay1 > o.y0 + 1) return true
  }
  return false
}

export function tick(g, input) {
  const m = g.mano
  const dt = TICK

  if (g.phase === 'dead') {
    g.deadT += dt
    // Mano bounces off and rolls forward (대굴대굴), crying, until she stops
    m.vy -= GRAVITY * dt
    m.y += m.vy * dt
    if (m.y <= 0) {
      m.y = 0
      m.vy = m.vy < -120 ? -m.vy * 0.4 : 0
      m.vx = Math.max(0, m.vx - ROLL_FRICTION * dt)
    }
    m.x += m.vx * dt
    m.angle += (m.vx / 6) * dt
    if (m.vx === 0 && m.y === 0 && !m.stopped) {
      m.stopped = true
      g.stopT = g.deadT
    }
    return
  }

  if (g.phase !== 'run') return

  g.t += dt
  g.speed = speedAt(g.t)
  const step = g.speed * dt
  g.dist += step
  g.score = Math.floor(g.dist / 25)

  // input → jump
  if (input.pressed) m.buffer = JUMP_BUFFER
  m.held = input.held
  if (m.buffer > 0) {
    if (m.ground) {
      m.vy = JUMP_V
      m.ground = false
      m.buffer = 0
      g.events.push('jump')
    } else m.buffer -= dt
  }
  if (!m.ground) {
    if (!m.held && m.vy > CUT_V) m.vy = CUT_V
    m.vy -= GRAVITY * dt
    m.y += m.vy * dt
    if (m.y <= 0) {
      m.y = 0
      m.vy = 0
      m.ground = true
      g.events.push('land')
    }
  }

  // obstacles
  for (const o of g.obstacles) o.x -= step + o.vx * dt
  g.obstacles = g.obstacles.filter((o) => o.x + o.w > -40)

  g.nextIn -= step
  if (g.nextIn <= 0) {
    const { w } = spawn(g, g.nextType || pick(g))
    // decide the following obstacle now, so its gap is sized for it
    g.nextType = pick(g)
    g.nextIn = w + gapAfter(g, g.nextType)
  }

  for (const o of g.obstacles) {
    if (overlaps(m, o)) {
      g.phase = 'dead'
      g.deadT = 0
      g.hit = o
      m.vx = ROLL_SPEED
      m.vy = 300
      m.stopped = false
      m.ground = false
      g.events.push('crash')
      break
    }
  }
}

// Advance by real elapsed time; `pressed` is consumed on the first tick.
export function update(g, dt, input) {
  g.acc = Math.min(g.acc + dt, 0.25)
  let pressed = input.pressed
  while (g.acc >= TICK) {
    tick(g, { held: input.held, pressed })
    pressed = false
    g.acc -= TICK
  }
}

export function start(g) {
  g.phase = 'run'
}

// Crash: roll ~1.5 s, then sit up and cry; the result panel waits until 2.3 s
const ROLL_SPEED = 110
const ROLL_FRICTION = 95
export const DEAD_SETTLE = 2.3
