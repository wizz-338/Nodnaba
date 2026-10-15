// MANO RUN — drawing. Everything is drawn in logical pixels with a whole-number
// scale and smoothing off, so the pixel art stays sharp on any screen.

import { MANO_X, SPRITE_W, SPRITE_H, DEAD_SETTLE } from './engine'
import { LOGO_PATH } from '../components/Logo'

const C = {
  ink: '#2a1830',
  skyTop: '#f6d3e2',
  skyBottom: '#fff4ec',
  cloud: '#ffffff',
  cloudShade: '#f6dfe8',
  hillFar: '#ecd3ea',
  hillNear: '#e0b8d8',
  bush: '#cf97c3',
  bushDark: '#b97fae',
  grass: '#f48fb6',
  grassDark: '#d96e9a',
  dirt: '#ecc9a8',
  dirtDark: '#d7aa86',
  dirtLight: '#f6dcc3',
  box: '#d9985b',
  boxLight: '#ecb479',
  boxDark: '#b47843',
  tape: '#f6dcae',
  pink: '#ff5f8f',
  pinkLight: '#ffa3bc',
  cyan: '#46d9d6',
  white: '#ffffff',
  crow: '#3b2b4a',
  crowLight: '#5a4670',
}

export const GROUND_DEPTH = 14 // dirt rows under the ground line inside the canvas

// mano.png: 8 run frames (one stride, from the reference GIF) + 2 crying frames
const RUN_FRAMES = 8
const AIR_FRAME = 1 // legs tucked
const CRY = [8, 9]
const RUN_FPS = 16 // at starting speed; scales with speed

// ── tiny pixel helpers ───────────────────────────────────────────────────────

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  return [c, g]
}

const px = (g, color, x, y, w = 1, h = 1) => {
  g.fillStyle = color
  g.fillRect(x, y, w, h)
}

// ── obstacle sprites ─────────────────────────────────────────────────────────

function boxSprite(w, h, ears = false) {
  const [c, g] = canvas(w, h)
  const top = ears ? 3 : 0
  px(g, C.ink, 0, top, w, h - top)
  px(g, C.box, 1, top + 1, w - 2, h - top - 2)
  px(g, C.boxLight, 1, top + 1, w - 2, 2)
  px(g, C.boxDark, w - 3, top + 3, 2, h - top - 4)
  px(g, C.ink, 1, top + 3, w - 2, 1)
  px(g, C.tape, Math.floor(w / 2) - 1, top + 1, 2, h - top - 2)
  if (ears) {
    // a cat is hiding in the big box
    for (const ex of [3, w - 7]) {
      px(g, C.ink, ex, 0, 4, 4)
      px(g, C.ink, ex + 1, -1, 2, 1)
      px(g, C.crowLight, ex + 1, 1, 2, 3)
      px(g, C.pinkLight, ex + 1, 2, 1, 1)
    }
  }
  return c
}

function multiBox(n) {
  const [c, g] = canvas(14 * n, 12)
  const one = boxSprite(14, 12)
  for (let i = 0; i < n; i++) g.drawImage(one, i * 14, 0)
  return c
}

function pillarSprites() {
  // NODNABA glitch pillar: dark block with an RGB split that flickers
  return [0, 1].map((f) => {
    const [c, g] = canvas(10, 30)
    px(g, C.cyan, f ? 0 : 1, 0, 8, 30)
    px(g, C.pink, f ? 2 : 1, 0, 8, 30)
    px(g, C.ink, 1, 0, 8, 30)
    px(g, '#3d2847', 2, 1, 6, 28)
    for (let y = 3; y < 28; y += 5) px(g, '#5c3f6a', 2, y, 6, 1)
    px(g, C.white, 3, 4 + f * 9, 2, 1)
    px(g, C.pinkLight, 5, 17 - f * 6, 1, 2)
    px(g, C.cyan, 3, 24 - f * 4, 1, 1)
    return c
  })
}

function yarnSprites() {
  return [0, 1, 2].map((f) => {
    const [c, g] = canvas(12, 12)
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 12; x++) {
        const d = Math.hypot(x - 5.5, y - 5.5)
        if (d < 6) px(g, d > 4.9 ? C.ink : C.pink, x, y)
      }
    // wound threads, rotating
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI + f * 0.55
      for (let t = -3.5; t <= 3.5; t += 0.5) {
        const x = Math.round(5.5 + Math.cos(a) * t + Math.sin(a) * (i - 1) * 1.6)
        const y = Math.round(5.5 + Math.sin(a) * t - Math.cos(a) * (i - 1) * 1.6)
        if (Math.hypot(x - 5.5, y - 5.5) < 4.6) px(g, C.pinkLight, x, y)
      }
    }
    px(g, C.white, 3, 3, 2, 1)
    return c
  })
}

function crowSprites() {
  return [0, 1].map((f) => {
    const [c, g] = canvas(17, 11)
    // body
    px(g, C.ink, 4, 4, 10, 5)
    px(g, C.crow, 5, 5, 8, 3)
    px(g, C.ink, 12, 3, 4, 4)
    px(g, C.crow, 13, 4, 2, 2)
    px(g, C.pink, 16, 5, 1, 1) // beak
    px(g, C.white, 14, 4, 1, 1) // eye
    px(g, C.ink, 1, 5, 4, 2) // tail
    // wings flap
    if (f) {
      px(g, C.ink, 6, 0, 5, 5)
      px(g, C.crowLight, 7, 1, 3, 3)
    } else {
      px(g, C.ink, 6, 8, 5, 3)
      px(g, C.crowLight, 7, 8, 3, 2)
    }
    px(g, C.cyan, 3, 6, 1, 1)
    return c
  })
}

// The unfinished NODNABA star as a pixel sun, cut from the logo path.
function starSprite(size) {
  const [c, g] = canvas(size, size)
  const [t, tg] = canvas(size, size)
  tg.imageSmoothingEnabled = true
  const s = size / 1488
  tg.setTransform(s, 0, 0, s, (size - 1328 * s) / 2, 0)
  tg.lineWidth = 110
  tg.lineJoin = 'round'
  tg.strokeStyle = '#000'
  tg.stroke(new Path2D(LOGO_PATH))
  const d = tg.getImageData(0, 0, size, size).data
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (d[(y * size + x) * 4 + 3] > 110) px(g, C.white, x, y)
  // soft pink rim
  const [o, og] = canvas(size + 2, size + 2)
  og.fillStyle = C.pinkLight
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) og.drawImage(c, dx, dy)
  og.globalCompositeOperation = 'source-in'
  og.fillRect(0, 0, size + 2, size + 2)
  og.globalCompositeOperation = 'source-over'
  og.drawImage(c, 1, 1)
  return o
}

function tinted(img, color) {
  const [c, g] = canvas(img.width, img.height)
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

// Mano tumbling in exact quarter turns: lossless for pixel art (no stray
// pixels) and reads like a classic pixel-game tumble.
function rolls(sheet) {
  const out = []
  const size = 64
  for (let i = 0; i < 4; i++) {
    const [c, g] = canvas(size, size)
    g.translate(size / 2, size / 2)
    g.rotate((i * Math.PI) / 2)
    g.drawImage(sheet, SPRITE_W * CRY[0], 0, SPRITE_W, SPRITE_H, -SPRITE_W / 2, -SPRITE_H / 2, SPRITE_W, SPRITE_H)
    out.push(c)
  }
  return out
}

export function buildAssets(sheet) {
  return {
    sheet,
    ghostPink: tinted(sheet, C.pink),
    ghostCyan: tinted(sheet, C.cyan),
    rolls: rolls(sheet),
    obstacles: {
      box: [boxSprite(14, 12)],
      crate: [boxSprite(18, 17, true)],
      box2: [multiBox(2)],
      box3: [multiBox(3)],
      pillar: pillarSprites(),
      yarn: yarnSprites(),
      birdLow: crowSprites(),
      birdHigh: crowSprites(),
    },
    star: starSprite(30),
  }
}

// ── effects state (purely visual) ────────────────────────────────────────────

export function createFx() {
  return { particles: [], trail: [], trailT: 0, runT: 0, frame: 0, squash: 0, t: 0, tearT: 0, quarter: null, quarterT: 0 }
}

function dust(fx, x, y, n, speed) {
  for (let i = 0; i < n; i++)
    fx.particles.push({
      x: x + Math.random() * 6,
      y,
      vx: -speed * (0.25 + Math.random() * 0.35),
      vy: 20 + Math.random() * 45,
      life: 0.35 + Math.random() * 0.2,
      color: Math.random() < 0.5 ? C.dirtLight : C.dirtDark,
      size: Math.random() < 0.3 ? 2 : 1,
    })
}

function sparks(fx, x, y, n) {
  for (let i = 0; i < n; i++)
    fx.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 120,
      vy: 60 + Math.random() * 90,
      life: 0.6,
      color: Math.random() < 0.5 ? C.pink : C.pinkLight,
      plus: true,
      size: 1,
    })
}

function tear(fx, x, y, dir) {
  fx.particles.push({
    x,
    y,
    vx: dir * (40 + Math.random() * 50),
    vy: 70 + Math.random() * 60,
    life: 0.55,
    color: Math.random() < 0.7 ? '#7acdff' : '#cdf0ff',
    size: 2,
    keep: true,
  })
}

// ── per-frame drawing ────────────────────────────────────────────────────────

const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

// Ground line height on screen: about 3/4 down, never leaving less than
// 175 px of sky for the jump and never closer than GROUND_DEPTH to the bottom.
export function groundY(H) {
  return Math.floor(Math.min(H - GROUND_DEPTH, Math.max(175, H * 0.76)))
}

export function draw(ctx, view, g, fx, assets, dt) {
  const { W, H } = view
  const gy = groundY(H) // ground line (screen y, from top)
  const m = g.mano
  const speed = g.phase === 'run' ? g.speed : 0
  const dist = g.dist
  fx.t += dt

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false

  // events → effects
  for (const e of g.events) {
    if (e === 'jump') dust(fx, MANO_X + 18, 1, 5, g.speed)
    if (e === 'land') {
      dust(fx, MANO_X + 16, 1, 7, g.speed)
      sparks(fx, MANO_X + 6, 4, 3)
      fx.squash = 0.08
    }
    if (e === 'crash') sparks(fx, MANO_X + 40, 30, 10)
  }
  g.events.length = 0

  // sky: soft retro bands
  const bands = 7
  for (let i = 0; i < bands; i++) {
    const y0 = Math.floor((gy * i) / bands)
    const y1 = Math.floor((gy * (i + 1)) / bands)
    ctx.fillStyle = mix(C.skyTop, C.skyBottom, i / (bands - 1))
    ctx.fillRect(0, y0, W, y1 - y0)
  }

  // the NODNABA star, barely moving
  const star = assets.star
  ctx.drawImage(star, Math.floor(W - star.width - 18 - ((dist * 0.01) % 8)), Math.max(10, Math.floor(gy - 210)))

  // clouds
  for (let i = 0; i < 5; i++) {
    const span = W + 80
    const x = Math.floor(((hash(i) * span - dist * (0.05 + i * 0.012)) % span + span) % span) - 40
    const y = Math.floor(gy - 120 - hash(i + 9) * Math.min(260, gy - 160))
    cloud(ctx, x, y, 10 + Math.floor(hash(i + 3) * 10))
  }

  // speed lines appear as it gets fast (behind everything that matters)
  const fast = Math.max(0, (speed - 360) / 180)
  if (fast > 0) {
    ctx.fillStyle = C.white
    for (let i = 0; i < 9; i++) {
      const len = 10 + Math.floor(hash(i + 40) * 26)
      const x = Math.floor(W - (((fx.t * speed * (1.4 + hash(i) * 0.8) + hash(i + 2) * W * 3) % (W + len * 2)) - len))
      const y = Math.floor(gy - 90 - hash(i + 20) * 150)
      ctx.globalAlpha = Math.min(0.8, fast) * (0.35 + hash(i + 7) * 0.4)
      ctx.fillRect(x, y, len, 1)
    }
    ctx.globalAlpha = 1
  }

  // parallax hills
  hills(ctx, W, gy, dist * 0.12, 44, 0.012, C.hillFar, 5)
  hills(ctx, W, gy, dist * 0.3, 20, 0.029, C.hillNear, 11)
  bushes(ctx, W, gy, dist * 0.55)

  // ground
  ctx.fillStyle = C.ink
  ctx.fillRect(0, gy, W, 1)
  ctx.fillStyle = C.grass
  ctx.fillRect(0, gy + 1, W, 2)
  ctx.fillStyle = C.dirt
  ctx.fillRect(0, gy + 3, W, H - gy)
  // grass tufts and pebbles scroll with the ground; deeper rows a bit slower
  const depth = Math.floor(H) - gy
  for (let row = 0; row * 12 < depth; row++) {
    const scroll = dist * (1 - row * 0.06)
    const off = scroll % 8
    for (let x = -8; x < W + 8; x += 8) {
      const n = Math.floor((x + scroll) / 8) * 31 + row * 977
      if (row === 0 && hash(n) > 0.55) {
        ctx.fillStyle = C.grassDark
        ctx.fillRect(Math.floor(x - off), gy + 1, 2, 1)
      }
      if (hash(n + 11) > 0.62) {
        ctx.fillStyle = hash(n + 5) > 0.5 ? C.dirtDark : C.dirtLight
        ctx.fillRect(Math.floor(x - off + hash(n + 3) * 6), gy + 5 + row * 12 + Math.floor(hash(n + 1) * 8), hash(n + 2) > 0.7 ? 2 : 1, 1)
      }
    }
  }

  // obstacles
  for (const o of g.obstacles) {
    const frames = assets.obstacles[o.type]
    let f = 0
    if (o.type === 'pillar') f = Math.floor(fx.t * 6 + o.phase * 4) % 2
    if (o.type === 'yarn') f = Math.floor((dist + o.x) / 9) % 3
    if (o.type === 'birdLow' || o.type === 'birdHigh') f = Math.floor(fx.t * 7 + o.phase * 4) % 2
    const img = frames[f % frames.length]
    const ox = o.type === 'pillar' ? Math.round(o.x) - 1 : Math.round(o.x)
    const oy = gy - o.y0 - img.height + (o.type === 'crate' ? 0 : 0)
    if (o.y0 > 0) {
      // a soft shadow under flying crows so their height reads clearly
      ctx.globalAlpha = 0.18
      ctx.fillStyle = C.ink
      ctx.fillRect(ox + 3, gy - 1, o.w - 6, 1)
      ctx.globalAlpha = 1
    }
    ctx.drawImage(img, ox, oy)
    if (o.type === 'yarn') {
      // a loose thread trailing behind
      ctx.fillStyle = C.pink
      ctx.fillRect(ox + 12, gy - 2, 6, 1)
    }
  }

  // Mano
  const sheet = assets.sheet
  const baseY = gy - SPRITE_H
  if (g.phase === 'dead') {
    const cx = m.x + SPRITE_W / 2
    fx.tearT -= dt
    const drawRoll = (q, lift) => {
      const roll = assets.rolls[((q % 4) + 4) % 4]
      // sideways frames are shorter: keep the body resting on the ground
      const half = q % 2 ? SPRITE_W / 2 : SPRITE_H / 2
      ctx.drawImage(roll, Math.round(cx - roll.width / 2), Math.round(gy - half - roll.height / 2 - lift))
    }
    if (!m.stopped) {
      // 대굴대굴 — rolling forward in quarter turns, tears flying off
      fx.quarter = Math.floor(m.angle / (Math.PI / 2))
      drawRoll(fx.quarter, m.y)
      if (fx.tearT <= 0) {
        fx.tearT = 0.07
        tear(fx, cx + (Math.random() - 0.5) * 20, m.y + 26 + Math.random() * 10, Math.random() < 0.5 ? -1 : 1)
      }
    } else if (fx.quarter % 4 !== 0) {
      // finish the turn until she is upright again
      fx.quarterT += dt
      if (fx.quarterT > 0.09) {
        fx.quarterT = 0
        fx.quarter++
      }
      drawRoll(fx.quarter, 0)
    } else {
      {
        const sob = Math.floor(fx.t * 3.5) % 2
        const hop = sob ? 0 : 1
        ctx.drawImage(sheet, CRY[sob] * SPRITE_W, 0, SPRITE_W, SPRITE_H, Math.round(m.x), baseY - hop, SPRITE_W, SPRITE_H)
        if (fx.tearT <= 0) {
          fx.tearT = 0.11
          // tears spring sideways from both eyes
          tear(fx, m.x + 27, SPRITE_H - 33, -1)
          tear(fx, m.x + 41, SPRITE_H - 33, 1)
        }
      }
    }
  } else {
    if (g.phase === 'run') {
      // run cycle speeds up with the world
      fx.runT += dt * (speed / 250)
      fx.frame = m.ground ? Math.floor(fx.runT * RUN_FPS) % RUN_FRAMES : AIR_FRAME
      // short-lived after-images trailing behind
      fx.trailT -= dt
      if (fx.trailT <= 0) {
        fx.trailT = 0.05
        fx.trail.unshift({ y: m.y, frame: fx.frame })
        fx.trail.length = Math.min(fx.trail.length, 3)
      }
      if (m.ground && Math.random() < dt * 9) dust(fx, MANO_X + 12, 1, 1, speed)
    } else {
      fx.runT += dt * 0.5
      fx.frame = Math.floor(fx.runT * RUN_FPS) % RUN_FRAMES
    }
    const strength = g.phase === 'run' ? 0.12 + Math.min(0.12, Math.max(0, speed - 300) / 1500) : 0
    fx.trail.forEach((t, i) => {
      if (i === 0 || !strength) return
      ctx.globalAlpha = strength - i * 0.03
      ctx.drawImage(i % 2 ? assets.ghostPink : assets.ghostCyan, t.frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, MANO_X - i * 4, Math.round(baseY - t.y), SPRITE_W, SPRITE_H)
    })
    ctx.globalAlpha = 1
    fx.squash = Math.max(0, fx.squash - dt)
    const sq = fx.squash > 0 ? 3 : 0
    const bob = g.phase === 'ready' ? Math.round(Math.sin(fx.t * 5) * 1) : 0
    ctx.drawImage(sheet, fx.frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, MANO_X, Math.round(baseY - m.y) + sq + bob, SPRITE_W, SPRITE_H - sq)
  }

  // particles
  fx.particles = fx.particles.filter((p) => (p.life -= dt) > 0)
  for (const p of fx.particles) {
    p.x += p.vx * dt
    p.vy -= 260 * dt
    p.y = Math.max(0, p.y + p.vy * dt)
    ctx.globalAlpha = Math.min(1, p.life * 3)
    ctx.fillStyle = p.color
    const x = Math.round(p.x)
    const y = Math.round(gy - p.y)
    if (p.plus) {
      ctx.fillRect(x - 1, y, 3, 1)
      ctx.fillRect(x, y - 1, 1, 3)
    } else ctx.fillRect(x, y - p.size, p.size, p.size)
  }
  ctx.globalAlpha = 1

  return g.phase === 'dead' && g.deadT >= DEAD_SETTLE
}

function cloud(ctx, x, y, s) {
  ctx.fillStyle = C.cloudShade
  ctx.fillRect(x + 2, y + 4, s * 2 - 2, 4)
  ctx.fillStyle = C.cloud
  ctx.fillRect(x, y + 2, s * 2, 4)
  ctx.fillRect(x + 4, y, s - 2, 3)
  ctx.fillRect(x + s, y - 2, s - 4, 4)
}

function hills(ctx, W, gy, scroll, amp, freq, color, seed) {
  ctx.fillStyle = color
  for (let x = 0; x < W + 2; x += 2) {
    const wx = x + scroll
    const h = Math.floor(
      amp * (0.55 + 0.3 * Math.sin(wx * freq + seed) + 0.15 * Math.sin(wx * freq * 2.7 + seed * 3))
    )
    const hq = h - (h % 2)
    ctx.fillRect(x, gy - hq, 2, hq)
  }
}

function bushes(ctx, W, gy, scroll) {
  const step = 46
  const first = Math.floor(scroll / step) - 1
  for (let i = first; i < first + Math.ceil(W / step) + 3; i++) {
    if (hash(i + 77) < 0.45) continue
    const x = Math.floor(i * step - scroll + hash(i) * 20)
    const r = 4 + Math.floor(hash(i + 5) * 4)
    ctx.fillStyle = C.bushDark
    ctx.fillRect(x - r, gy - r, r * 2 + 2, r)
    ctx.fillStyle = C.bush
    ctx.fillRect(x - r + 1, gy - r - 2, r * 2 - 2, r)
    ctx.fillRect(x - r + 3, gy - r - 4, r * 2 - 6, 2)
  }
}

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r1, g1, b1] = p(a)
  const [r2, g2, b2] = p(b)
  const f = (x, y) => Math.round(x + (y - x) * t)
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`
}
