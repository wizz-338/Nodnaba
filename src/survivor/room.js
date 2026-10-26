// MANO SURVIVOR — 마노의 방: the 마노 강화 screen's room (data/room.json).
//
// The room fills with the coin stats' levels added up: each piece comes at
// its own total and stays (the room is always rebuilt from the save's levels;
// nothing of it is stored, nothing of it changes a number in the game). The
// pieces are pixel art drawn here, one small picture each, in the colours of
// the game's sprites; Mano (the v3 sheets and her profile poses) and the
// three cats (their sprite sheet) live in it on their own: Mano wanders,
// runs her zoomies, sits, naps on her cushion or bed, rolls on the bed, hits
// the sandbag, plays with the ball, lifts the dumbbell; the cats wander, sit,
// sleep, eat at the bowl, play with the yarn, perch on the tower and now and
// then come to Mano for a pat. A coin stat bought: Mano hops, waves and says
// a line; a piece that comes pops in with sparkles.
//
// Which pieces are there: room-items.js (pure, tested); here the drawing.

import { FRAMES, animFrame } from './sprites.js'
import { roomItems } from './room-items.js'

// ── the pieces' pictures ────────────────────────────────────────────────────

const OUT = '#3b2a22' // outline, as the sprites'
const C = {
  wood: '#b9784a',
  woodD: '#8e5634',
  woodL: '#d89a66',
  cream: '#f6ead2',
  creamD: '#e2cfae',
  red: '#e2564b',
  redD: '#b43a33',
  pink: '#f4a3a8',
  blue: '#7fb6e6',
  blueD: '#4f86bd',
  sky: '#bfe4fb',
  green: '#6cbf6a',
  greenD: '#3f8f4a',
  gold: '#f2c14e',
  goldD: '#c8902a',
  grey: '#9aa3ad',
  greyD: '#6b737d',
  white: '#ffffff',
  violet: '#a98be0',
}

// each piece: [width, height, foot x in it, draw(g)] (room pixels)
const ART = {
  window: [44, 34, 22, (g) => {
    box(g, 0, 0, 44, 34, C.woodL)
    px(g, 3, 3, 38, 26, C.sky)
    px(g, 8, 8, 9, 3, C.white)
    px(g, 6, 10, 14, 3, C.white)
    px(g, 26, 14, 10, 3, C.white)
    px(g, 21, 3, 2, 26, C.woodL)
    px(g, 3, 15, 38, 2, C.woodL)
    // curtains
    px(g, 0, 0, 6, 34, C.pink)
    px(g, 38, 0, 6, 34, C.pink)
    px(g, 2, 2, 1, 30, C.red)
    px(g, 41, 2, 1, 30, C.red)
    px(g, -1, 32, 46, 2, C.woodD)
  }],
  cushion: [26, 9, 13, (g) => {
    oval(g, 0, 1, 26, 8, C.red)
    oval(g, 4, 2, 18, 3, '#f07a6f', null)
    px(g, 12, 4, 2, 2, C.gold)
  }],
  bowl: [16, 8, 8, (g) => {
    box(g, 0, 2, 16, 6, C.blue)
    px(g, 2, 1, 12, 2, '#a0703d')
    px(g, 3, 0, 3, 2, '#c08a4f')
    px(g, 9, 0, 3, 2, '#c08a4f')
    px(g, 6, 4, 4, 2, C.white)
  }],
  lamp: [14, 40, 7, (g) => {
    px(g, 6, 12, 2, 26, OUT)
    box(g, 2, 36, 10, 4, C.woodD)
    box(g, 0, 0, 14, 13, C.gold)
    px(g, 2, 2, 10, 3, '#fbe39a')
  }],
  rug: [92, 22, 46, (g) => {
    oval(g, 0, 0, 92, 22, C.violet)
    oval(g, 6, 3, 80, 16, '#c4adf0', null)
    oval(g, 18, 6, 56, 10, C.violet, null)
    oval(g, 34, 8, 24, 6, '#c4adf0', null)
  }],
  ball: [10, 10, 5, (g) => {
    oval(g, 0, 0, 10, 10, C.red)
    px(g, 2, 2, 3, 2, '#ff9a90')
  }],
  bed: [58, 30, 29, (g) => {
    box(g, 0, 0, 8, 30, C.wood)
    box(g, 50, 8, 8, 22, C.wood)
    box(g, 4, 12, 50, 14, C.cream)
    px(g, 5, 13, 48, 4, C.white)
    box(g, 8, 8, 14, 8, C.white)
    box(g, 20, 14, 34, 12, C.blue)
    px(g, 22, 16, 30, 2, '#a5d0f2')
    px(g, 4, 25, 50, 3, C.woodD)
  }],
  sandbag: [18, 38, 9, (g) => {
    px(g, 8, 0, 2, 6, OUT)
    box(g, 2, 5, 14, 27, C.red)
    px(g, 4, 7, 3, 22, '#f07a6f')
    px(g, 2, 12, 14, 2, C.redD)
    px(g, 2, 24, 14, 2, C.redD)
    box(g, 0, 33, 18, 5, C.greyD)
  }],
  yarn: [12, 10, 6, (g) => {
    oval(g, 0, 0, 11, 10, C.pink)
    px(g, 2, 3, 7, 1, '#e07c8e')
    px(g, 3, 6, 6, 1, '#e07c8e')
    px(g, 10, 7, 2, 1, '#e07c8e')
  }],
  tower: [24, 52, 12, (g) => {
    box(g, 9, 6, 6, 44, C.creamD)
    for (let y = 10; y < 46; y += 5) px(g, 10, y, 4, 1, '#c9b48c')
    box(g, 0, 0, 24, 7, C.wood)
    box(g, 2, 22, 20, 6, C.wood)
    box(g, 0, 46, 24, 6, C.woodD)
    px(g, 3, 1, 18, 2, C.woodL)
  }],
  plant: [18, 26, 9, (g) => {
    box(g, 3, 16, 12, 10, C.wood)
    px(g, 5, 18, 8, 2, C.woodL)
    oval(g, 1, 4, 8, 13, C.green)
    oval(g, 9, 2, 8, 15, C.green)
    oval(g, 5, 0, 8, 12, '#83d27f')
    px(g, 8, 8, 2, 9, C.greenD)
  }],
  books: [30, 36, 15, (g) => {
    box(g, 0, 0, 30, 36, C.wood)
    px(g, 2, 2, 26, 32, C.woodD)
    px(g, 2, 12, 26, 2, C.wood)
    px(g, 2, 23, 26, 2, C.wood)
    const cs = [C.red, C.blue, C.gold, C.green, C.violet, C.pink]
    for (let r = 0; r < 3; r++)
      for (let i = 0; i < 6; i++) {
        const h = 7 + ((i + r) % 3)
        px(g, 3 + i * 4, 2 + r * 11 + (10 - h), 3, h, cs[(i + r * 2) % 6])
      }
  }],
  frame: [24, 20, 12, (g) => {
    box(g, 0, 0, 24, 20, C.gold)
    px(g, 2, 2, 20, 16, C.cream)
    // a little drawing of Mano: hood, face, ears
    px(g, 7, 6, 10, 9, '#5b6a8f')
    px(g, 7, 4, 3, 3, '#5b6a8f')
    px(g, 14, 4, 3, 3, '#5b6a8f')
    px(g, 9, 9, 6, 5, '#f7d9c4')
    px(g, 10, 10, 1, 1, OUT)
    px(g, 13, 10, 1, 1, OUT)
    px(g, 4, 15, 4, 2, C.green)
    px(g, 16, 14, 4, 3, C.red)
  }],
  shelf: [40, 16, 20, (g) => {
    box(g, 0, 12, 40, 4, C.wood)
    px(g, 3, 15, 2, 1, C.woodD)
    px(g, 35, 15, 2, 1, C.woodD)
    box(g, 3, 4, 7, 9, C.blue)
    oval(g, 13, 6, 8, 7, C.gold)
    box(g, 24, 0, 5, 13, C.red)
    box(g, 30, 2, 5, 11, C.green)
  }],
  clock: [16, 16, 8, (g) => {
    oval(g, 0, 0, 16, 16, C.woodL)
    oval(g, 2, 2, 12, 12, C.cream)
    px(g, 7, 4, 2, 5, OUT)
    px(g, 7, 7, 4, 2, OUT)
  }],
  lights: [228, 14, 114, (g) => {
    const cs = [C.red, C.gold, C.blue, C.green, C.pink]
    for (let x = 0; x < 228; x += 2) px(g, x, 2 + Math.round(4 * Math.sin((x / 228) * Math.PI * 4) ** 2), 2, 1, OUT)
    for (let i = 0; i < 19; i++) {
      const x = 4 + i * 12
      const y = 3 + Math.round(4 * Math.sin((x / 228) * Math.PI * 4) ** 2)
      box(g, x, y + 1, 5, 6, cs[i % cs.length])
    }
  }],
  dumbbell: [22, 8, 11, (g) => {
    px(g, 4, 3, 14, 2, C.greyD)
    box(g, 0, 0, 6, 8, C.grey)
    box(g, 16, 0, 6, 8, C.grey)
  }],
  trophy: [18, 26, 9, (g) => {
    box(g, 2, 20, 14, 6, C.woodD)
    px(g, 7, 13, 4, 8, C.goldD)
    box(g, 2, 0, 14, 14, C.gold)
    px(g, 0, 2, 3, 6, C.gold)
    px(g, 15, 2, 3, 6, C.gold)
    px(g, 5, 2, 3, 8, '#fbe39a')
  }],
  mobile: [32, 30, 16, (g) => {
    px(g, 15, 0, 2, 8, OUT)
    px(g, 2, 8, 28, 2, C.woodD)
    const st = (x, y, c) => {
      px(g, x + 2, y, 2, 6, c)
      px(g, x, y + 2, 6, 2, c)
      px(g, x + 1, y + 1, 4, 4, c)
    }
    for (const [x, y, c, l] of [[1, 16, C.gold, 6], [13, 22, C.pink, 12], [25, 14, C.blue, 4]]) {
      px(g, x + 3, 10, 1, l, OUT)
      st(x, y, c)
    }
  }],
}

function px(g, x, y, w, h, c) {
  g.fillStyle = c
  g.fillRect(x, y, w, h)
}
function box(g, x, y, w, h, fill) {
  px(g, x, y, w, h, OUT)
  px(g, x + 1, y + 1, w - 2, h - 2, fill)
}
function oval(g, x, y, w, h, fill, line = OUT) {
  // a pixel oval, row by row: outlined (line), or only filled (line null)
  const rx = w / 2
  const ry = h / 2
  for (let j = 0; j < h; j++) {
    const dy = (j + 0.5 - ry) / ry
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy)))
    if (!line) {
      px(g, Math.round(x + rx - half), y + j, half * 2, 1, fill)
      continue
    }
    px(g, Math.round(x + rx - half), y + j, half * 2, 1, line)
    if (half > 1 && j > 0 && j < h - 1) px(g, Math.round(x + rx - half + 1), y + j, half * 2 - 2, 1, fill)
  }
}

// a piece's picture, made once (room pixels)
const pictures = new Map()
function picture(id) {
  let c = pictures.get(id)
  if (c) return c
  const [w, h, , draw] = ART[id]
  c = document.createElement('canvas')
  c.width = w + 2
  c.height = h + 2
  const g = c.getContext('2d')
  g.translate(1, 1)
  draw(g)
  pictures.set(id, c)
  return c
}

// ── the room ────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
// how big Mano and the cats are in the room: room pixels a sheet pixel, in
// the game's own proportions (render.js: Mano 0.9, the cats balance.cats.scale)
const MANO_K = 0.62 // her 64-px cells: about 30 room pixels tall
const MANO_H = 30
const PROFILE_K = 0.13 // her 256-px profile poses (08_profile)
// how a facing comes from a direction (Mano's eight run cycles)
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']
const dirOf = (vx, vy) => DIRS[((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8]
const CAT_IDS = ['cat_danchu', 'cat_hodu', 'cat_moru']

export function createRoom(canvas, img, D, { cats = false, total = 0, font = 'sans-serif' } = {}) {
  const R = D.room
  const catK = MANO_K * (D.balance.cats.scale / 0.9)
  const [W, H] = R.size
  const FY = R.floorY
  const ctx = canvas.getContext('2d')
  let S = 2 // device pixels a room pixel
  const items = new Map() // id → { it, born } (born: when it popped in, or -1)
  const parts = [] // sparkles, hearts, notes, Z's: { x, y, vx, vy, t, life, kind, c }
  const bubbles = [] // { who, text, t, life }
  let toast = null // { text, t }
  let last = performance.now()
  let raf = 0
  let now = 0
  const spot = (id) => {
    const it = items.get(id)
    return it ? it.it.at : null
  }
  const has = (id) => items.has(id)
  const floorPt = () => [rnd(24, W - 24), rnd(FY + 22, H - 8)]

  // ── the people ──
  const mano = { x: W * 0.45, y: H - 22, vx: 0, vy: 0, dir: 's', act: null, t: 0, phase: 0, hop: 0 }
  const kitties = []
  const setCats = (on) => {
    if (on && !kitties.length) CAT_IDS.forEach((id, i) => kitties.push({ id, x: 60 + i * 50, y: H - 14 - i * 6, vx: 0, vy: 0, face: i % 2 ? -1 : 1, act: null, t: 0, step: 0, hop: 0 }))
    if (!on) kitties.length = 0
  }
  setCats(cats)

  // a walk to (x, y) at `speed`, then `then` (a pose for a while)
  const go = (who, x, y, speed, then) => (who.act = { kind: 'go', x, y, speed, then })
  // what Mano does next: a few things, the more the room has the more
  function manoNext(force) {
    const ch = [['wander', 4], ['sit', 2], ['zoomies', 1.2]]
    if (has('cushion')) ch.push(['nap', 1.5])
    if (has('bed')) ch.push(['roll', 2], ['sleep', 1.5])
    if (has('sandbag')) ch.push(['punch', 2.5])
    if (has('ball')) ch.push(['ball', 2])
    if (has('dumbbell')) ch.push(['lift', 1.5])
    if (kitties.length) ch.push(['pet', 1.2])
    let r = Math.random() * ch.reduce((a, [, w]) => a + w, 0)
    let k = ch[0][0]
    for (const [name, w] of ch) if ((r -= w) <= 0) {
      k = name
      break
    }
    if (force && ch.some(([name]) => name === force)) k = force
    const [x, y] = floorPt()
    const at = (id, dx = 0, dy = 0) => [spot(id)[0] + dx, spot(id)[1] + dy]
    switch (k) {
      case 'wander':
        return go(mano, x, y, 42, { pose: 'idle', dur: rnd(1, 2.5) })
      case 'sit':
        return go(mano, x, y, 42, { pose: 'sit', dur: rnd(2, 3.5) })
      case 'zoomies':
        mano.laps = 3 + Math.floor(Math.random() * 3)
        for (const c of kitties) if (Math.random() < 0.6) c.act = { kind: 'chase', t: 0, dur: 3 }
        return go(mano, x, y, 110, { pose: 'zoom' })
      case 'nap':
        return go(mano, ...at('cushion', 0, 0), 42, { pose: 'sleep', dur: rnd(3.5, 5) })
      case 'sleep':
        return go(mano, ...at('bed', 4, -8), 42, { pose: 'sleep', dur: rnd(3.5, 5), on: 'bed' })
      case 'roll':
        return go(mano, ...at('bed', 4, -8), 42, { pose: 'roll', dur: rnd(2.5, 3.5), on: 'bed' })
      case 'punch':
        return go(mano, ...at('sandbag', -22, 2), 42, { pose: 'punch', dur: rnd(2.5, 3.5) })
      case 'ball':
        mano.kicks = 3
        return go(mano, ballPos.x - 8, ballPos.y, 44, { pose: 'kick' })
      case 'lift':
        return go(mano, ...at('dumbbell', -2, -2), 42, { pose: 'lift', dur: rnd(2.5, 3.5) })
      case 'pet': {
        const c = pick(kitties)
        c.act = { kind: 'go', x: x + 12, y, speed: 50, then: { pose: 'sit', dur: 2.6 } }
        return go(mano, x, y, 42, { pose: 'pet', dur: 2.4, cat: c })
      }
    }
  }
  const ballPos = { x: 150, y: 120, vx: 0, vy: 0 }

  function catNext(c) {
    const ch = [['wander', 4], ['sit', 2.5], ['sleep', 1.5]]
    if (has('bowl')) ch.push(['eat', 1.2])
    if (has('yarn')) ch.push(['yarn', 1.5])
    if (has('tower')) ch.push(['perch', 1.2])
    if (has('rug')) ch.push(['rug', 1.2])
    let r = Math.random() * ch.reduce((a, [, w]) => a + w, 0)
    let k = ch[0][0]
    for (const [name, w] of ch) if ((r -= w) <= 0) {
      k = name
      break
    }
    const [x, y] = floorPt()
    // (one cat at a spot: the bowl, the tower, the yarn)
    const free = (pose) => !kitties.some((o) => o !== c && o.act && o.act.then && o.act.then.pose === pose)
    switch (k) {
      case 'eat':
        if (free('eat')) return go(c, spot('bowl')[0] - 10, spot('bowl')[1], 40, { pose: 'eat', dur: rnd(2.5, 4) })
        break
      case 'yarn':
        if (free('yarn')) return go(c, spot('yarn')[0] + 10, spot('yarn')[1], 40, { pose: 'yarn', dur: rnd(2.5, 4) })
        break
      case 'perch':
        if (free('perch')) return go(c, spot('tower')[0], spot('tower')[1], 40, { pose: 'perch', dur: rnd(4, 6) })
        break
      case 'rug':
        return go(c, spot('rug')[0] + rnd(-30, 30), spot('rug')[1] - rnd(2, 8), 40, { pose: 'sleep', dur: rnd(4, 6) })
      case 'sleep':
        return go(c, x, y, 40, { pose: 'sleep', dur: rnd(3, 6) })
      case 'sit':
        return go(c, x, y, 40, { pose: 'sit', dur: rnd(2, 4) })
    }
    return go(c, x, y, 40, { pose: 'sit', dur: rnd(0.8, 2) })
  }

  // one step of someone's walk; true when there
  function walk(who, dt) {
    const a = who.act
    const dx = a.x - who.x
    const dy = a.y - who.y
    const d = Math.hypot(dx, dy)
    const s = a.speed * dt
    if (d <= s) {
      who.x = a.x
      who.y = a.y
      who.vx = who.vy = 0
      return true
    }
    who.vx = (dx / d) * a.speed
    who.vy = (dy / d) * a.speed
    who.x += (dx / d) * s
    who.y += (dy / d) * s
    return false
  }

  function updateMano(dt) {
    const m = mano
    m.hop = Math.max(0, m.hop - dt)
    if (!m.act) manoNext()
    const a = m.act
    if (a.kind === 'go') {
      if (!walk(m, dt)) {
        m.dir = dirOf(m.vx, m.vy)
        m.phase += dt * 1000 * (a.speed > 80 ? 1.8 : 1)
        if (a.speed > 80 && Math.random() < dt * 14) puff(m.x, m.y)
        return
      }
      const then = a.then
      if (then.pose === 'zoom' && m.laps-- > 0) {
        const [x, y] = floorPt()
        return go(m, x, y, 110, then)
      }
      if (then.pose === 'kick') {
        // a kick: the ball rolls off somewhere, she runs after it
        const [x, y] = floorPt()
        ballPos.vx = (x - ballPos.x) * 1.6
        ballPos.vy = (y - ballPos.y) * 1.6
        sparkle(ballPos.x, ballPos.y - 4, 3, C.gold)
        if (m.kicks-- > 0) return go(m, x - 8, y, 44, then)
        m.act = { kind: 'do', pose: 'idle', t: 0, dur: 1 }
        return
      }
      m.act = { kind: 'do', ...then, t: 0, dur: then.dur ?? 1 }
      return
    }
    a.t += dt
    m.vx = m.vy = 0
    if (a.pose === 'sleep' && Math.random() < dt * 1.2) parts.push({ x: m.x + 8, y: m.y - 22, vx: 6, vy: -9, t: 0, life: 1.8, kind: 'z' })
    if (a.pose === 'roll' && Math.random() < dt * 2) parts.push({ x: m.x + rnd(-10, 10), y: m.y - 24, vx: rnd(-5, 5), vy: -12, t: 0, life: 1.2, kind: 'note', c: pick([C.red, C.blue, C.gold]) })
    if (a.pose === 'punch') {
      a.hit = (a.hit || 0) - dt
      if (a.hit <= 0) {
        a.hit = 0.32
        swing = 1
        const s = spot('sandbag')
        sparkle(s[0] - 6, s[1] - 22, 3, C.gold)
        parts.push({ x: s[0] - 4, y: s[1] - 30, vx: 0, vy: -14, t: 0, life: 0.5, kind: 'pow' })
      }
    }
    if (a.pose === 'pet' && Math.random() < dt * 2.5) parts.push({ x: m.x + 8, y: m.y - 22, vx: rnd(-4, 4), vy: -14, t: 0, life: 1, kind: 'heart' })
    if (a.t >= a.dur) m.act = null
  }

  function updateCat(c, dt) {
    c.hop = Math.max(0, c.hop - dt)
    if (!c.act) catNext(c)
    const a = c.act
    if (a.kind === 'chase') {
      // after Mano in her zoomies, a step behind
      a.t += dt
      const dx = mano.x - 14 * Math.sign(mano.vx || 1) - c.x
      const dy = mano.y + 4 - c.y
      const d = Math.hypot(dx, dy) || 1
      const s = Math.min(d, 100 * dt)
      c.vx = (dx / d) * 100
      c.vy = (dy / d) * 100
      c.x += (dx / d) * s
      c.y += (dy / d) * s
      c.step += s
      if (Math.abs(c.vx) > 1) c.face = Math.sign(c.vx)
      if (a.t >= a.dur || !(mano.act && mano.act.speed > 80)) c.act = null
      return
    }
    if (a.kind === 'go') {
      const before = [c.x, c.y]
      if (!walk(c, dt)) {
        c.step += Math.hypot(c.x - before[0], c.y - before[1])
        if (Math.abs(c.vx) > 1) c.face = Math.sign(c.vx)
        return
      }
      c.act = { kind: 'do', ...a.then, t: 0 }
      if (a.then.pose === 'perch') c.hop = 0.3
      return
    }
    a.t += dt
    if (a.pose === 'sleep' && Math.random() < dt * 0.8) parts.push({ x: c.x + 6, y: c.y - 12, vx: 5, vy: -8, t: 0, life: 1.6, kind: 'z' })
    if (a.pose === 'yarn' && Math.random() < dt * 1.6) {
      c.hop = 0.3
      c.face = -c.face
    }
    if (a.t >= a.dur) c.act = null
  }

  // ── little things in the air ──
  function sparkle(x, y, n, c = C.gold) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      parts.push({ x, y, vx: Math.cos(a) * rnd(10, 30), vy: Math.sin(a) * rnd(10, 30) - 10, t: 0, life: rnd(0.4, 0.8), kind: 'spark', c })
    }
  }
  function puff(x, y) {
    parts.push({ x: x + rnd(-4, 4), y: y - 1, vx: rnd(-8, 8), vy: -4, t: 0, life: 0.4, kind: 'dust' })
  }
  let swing = 0 // the sandbag's swing after a hit

  // ── drawing ──
  function picDraw(id, x, y, k = 1) {
    // a piece's picture with its foot at (x, y), grown by k (its pop)
    const pic = picture(id)
    const [w, h, fx] = ART[id]
    const dw = (w + 2) * S * k
    const dh = (h + 2) * S * k
    ctx.drawImage(pic, Math.round((x - (fx + 1) * k) * S), Math.round((y - (h + 1) * k) * S), Math.round(dw), Math.round(dh))
  }
  const popK = (it) => {
    if (it.born < 0) return 1
    const t = (now - it.born) / 1000
    if (t >= 0.5) return 1
    // up from nothing past full size and back
    return t < 0.3 ? (t / 0.3) * 1.15 : 1.15 - (0.15 * (t - 0.3)) / 0.2
  }
  function sprite(name, x, y, k, { flip = false, alpha = 1, sy = 1, rot = 0, bottom = false } = {}) {
    // a frame of the game's sheets, k room pixels a sheet pixel, its feet at
    // (x, y) (bottom: the picture's own bottom middle, for the profile poses)
    const f = FRAMES[name]
    const im = f && img && img[f.sheet]
    if (!im) return
    const b = f.contentBounds
    const s = k * S
    const pivX = bottom ? b.x + b.w / 2 : f.pivot[0]
    const pivY = bottom ? b.y + b.h : f.pivot[1]
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(Math.round(x * S), Math.round(y * S))
    if (rot) ctx.rotate(rot)
    ctx.scale(flip ? -s : s, s * sy)
    ctx.drawImage(im, f.rect.x + b.x, f.rect.y + b.y, b.w, b.h, b.x - pivX, b.y - pivY, b.w, b.h)
    ctx.restore()
  }

  function drawMano() {
    const m = mano
    const a = m.act
    const lift = m.hop > 0 ? Math.sin((Math.PI * (0.6 - m.hop)) / 0.6) * 8 : 0
    ctx.fillStyle = 'rgba(60, 35, 25, 0.18)'
    ctx.fillRect(Math.round((m.x - 9) * S), Math.round((m.y - 1) * S), 18 * S, 2 * S)
    if (a && a.kind === 'go') {
      const run = 'run_' + m.dir
      return sprite(animFrame(run, m.phase), m.x, m.y, MANO_K)
    }
    const pose = a ? a.pose : 'idle'
    if (pose === 'wave') return sprite('menu_wave', m.x, m.y - lift, PROFILE_K, { bottom: true })
    if (pose === 'sleep') return sprite('menu_sleep', m.x, m.y, PROFILE_K, { bottom: true })
    if (pose === 'roll') return sprite('menu_roll', m.x, m.y, PROFILE_K, { bottom: true, rot: Math.sin(now / 160) * 0.25 })
    if (pose === 'sit') return sprite('down_3', m.x, m.y, MANO_K)
    if (pose === 'punch') {
      const k = Math.max(0, a.hit || 0) / 0.32
      return sprite(animFrame('run_e', now * 1.6), m.x + (1 - k) * 3, m.y, MANO_K)
    }
    if (pose === 'lift') {
      // curls: the dumbbell up and down in front of her
      sprite(animFrame('idle_s', now), m.x, m.y, MANO_K)
      const up = Math.abs(Math.sin(now / 300)) * 7
      picDraw('dumbbell', m.x, m.y - 6 - up, 0.8)
      return
    }
    if (pose === 'pet') return sprite(animFrame('idle_e', now), m.x, m.y, MANO_K)
    sprite(animFrame('idle_s', now), m.x, m.y - lift, MANO_K)
  }

  function drawCat(c) {
    const a = c.act
    const side = c.face > 0 ? 'r' : 'l'
    const lift = c.hop > 0 ? Math.sin((Math.PI * (0.3 - c.hop)) / 0.3) * 4 : 0
    let y = c.y
    if (a && a.pose === 'perch' && a.kind === 'do') y = spot('tower')[1] - 46
    ctx.fillStyle = 'rgba(60, 35, 25, 0.16)'
    if (!(a && a.pose === 'perch' && a.kind === 'do')) ctx.fillRect(Math.round((c.x - 6) * S), Math.round((c.y - 1) * S), 12 * S, 2 * S)
    let f = Math.floor(now / 450 + c.x) % 2
    let sy = 1
    if (a && (a.kind === 'go' || a.kind === 'chase')) f = Math.floor(c.step / 6) % 4
    else if (a && a.pose === 'eat') {
      f = 2
      sy = 1 - 0.08 * Math.abs(Math.sin(now / 70))
    } else if (a && a.pose === 'sleep') {
      f = 0
      sy = 0.72
    }
    sprite(`${c.id}_${side}_${f}`, c.x, y - lift, catK, { sy })
  }

  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.t += dt
      if (p.t >= p.life) {
        parts.splice(i, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      const k = 1 - p.t / p.life
      ctx.globalAlpha = Math.min(1, k * 2)
      const X = Math.round(p.x * S)
      const Y = Math.round(p.y * S)
      if (p.kind === 'spark') {
        ctx.fillStyle = p.c
        ctx.fillRect(X, Y, 2 * S, 2 * S)
      } else if (p.kind === 'dust') {
        ctx.fillStyle = '#e6d3b5'
        ctx.fillRect(X, Y, 3 * S, 2 * S)
      } else {
        ctx.font = `${Math.round((p.kind === 'pow' ? 9 : 8) * S)}px ${font}`
        ctx.textAlign = 'center'
        ctx.fillStyle = p.kind === 'heart' ? '#ff6f8f' : p.kind === 'note' ? p.c : p.kind === 'pow' ? '#e2564b' : '#7d8fb8'
        ctx.fillText(p.kind === 'heart' ? '♥' : p.kind === 'note' ? '♪' : p.kind === 'pow' ? '퍽!' : 'z', X, Y)
      }
    }
    ctx.globalAlpha = 1
  }

  function bubble(x, y, text) {
    ctx.font = `${Math.round(8 * S)}px ${font}`
    const w = ctx.measureText(text).width + 8 * S
    const h = 13 * S
    const bx = Math.max(2 * S, Math.min(W * S - w - 2 * S, x * S - w / 2))
    const by = y * S - h
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = OUT
    ctx.lineWidth = Math.max(1, S * 0.8)
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 4 * S)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = OUT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, bx + w / 2, by + h / 2 + S * 0.5)
    ctx.textBaseline = 'alphabetic'
  }

  function drawRoom(dt) {
    // the wall and the floor
    ctx.fillStyle = C.cream
    ctx.fillRect(0, 0, W * S, FY * S)
    ctx.fillStyle = C.creamD
    for (let x = 6; x < W; x += 14) ctx.fillRect(x * S, 0, 2 * S, FY * S)
    ctx.fillStyle = '#ead9bb'
    ctx.fillRect(0, (FY - 16) * S, W * S, 14 * S)
    ctx.fillStyle = C.woodD
    ctx.fillRect(0, (FY - 3) * S, W * S, 4 * S)
    ctx.fillStyle = C.wood
    ctx.fillRect(0, (FY + 1) * S, W * S, (H - FY) * S)
    ctx.fillStyle = '#a96b40'
    for (let y = FY + 9; y < H; y += 9) ctx.fillRect(0, y * S, W * S, S)
    for (let y = FY + 1, r = 0; y < H; y += 9, r++) for (let x = (r % 2) * 22 + 10; x < W; x += 44) ctx.fillRect(x * S, y * S, S, 9 * S)
    // the window's light on the floor
    if (has('window')) {
      ctx.fillStyle = 'rgba(255, 246, 214, 0.22)'
      ctx.beginPath()
      ctx.moveTo(150 * S, (FY + 1) * S)
      ctx.lineTo(192 * S, (FY + 1) * S)
      ctx.lineTo(206 * S, H * S)
      ctx.lineTo(160 * S, H * S)
      ctx.fill()
    }
    // the lamp's glow
    if (has('lamp')) {
      const [lx, ly] = spot('lamp')
      const g = ctx.createRadialGradient(lx * S, (ly - 34) * S, 2 * S, lx * S, (ly - 34) * S, 40 * S)
      g.addColorStop(0, 'rgba(255, 228, 140, 0.45)')
      g.addColorStop(1, 'rgba(255, 228, 140, 0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W * S, H * S)
    }
    // on the wall
    for (const [id, o] of items)
      if (!o.it.wall) continue
      else if (id === 'mobile') {
        // the mobile sways from its string
        const [x, y] = o.it.at
        ctx.save()
        ctx.translate(x * S, (y - 30) * S)
        ctx.rotate(Math.sin(now / 900) * 0.08)
        ctx.translate(-x * S, -(y - 30) * S)
        picDraw(id, x, y, popK(o))
        ctx.restore()
      } else picDraw(id, o.it.at[0], o.it.at[1], popK(o))
    if (has('lights')) {
      // the little bulbs twinkle
      for (let i = 0; i < 19; i++) {
        const x = 6 + 4 + i * 12 + 2
        const y = 12 - 14 + 3 + Math.round(4 * Math.sin(((x - 6) / 228) * Math.PI * 4) ** 2) + 4
        const on = Math.sin(now / 300 + i * 1.7) > 0.2
        if (on) {
          ctx.fillStyle = 'rgba(255, 245, 190, 0.55)'
          ctx.fillRect((x - 2) * S, (y - 1) * S, 5 * S, 5 * S)
        }
      }
    }
    // the rug flat on the floor, under everyone
    if (has('rug')) picDraw('rug', spot('rug')[0], spot('rug')[1], popK(items.get('rug')))
    // standing things and people, back to front by their feet
    const list = []
    for (const [id, o] of items) if (!o.it.wall && id !== 'rug' && id !== 'ball') list.push([o.it.at[1], 'item', id, o])
    if (has('ball')) list.push([ballPos.y, 'ball'])
    // (on the bed: in front of it)
    list.push([mano.act && mano.act.kind === 'do' && mano.act.on === 'bed' ? spot('bed')[1] + 0.5 : mano.y + 0.1, 'mano'])
    for (const c of kitties) list.push([c.act && c.act.pose === 'perch' && c.act.kind === 'do' ? spot('tower')[1] + 0.2 : c.y, 'cat', c])
    list.sort((a, b) => a[0] - b[0])
    for (const e of list) {
      if (e[1] === 'item') {
        if (e[2] === 'sandbag' && swing > 0) {
          // swinging after a hit
          const [x, y] = e[3].it.at
          ctx.save()
          ctx.translate(x * S, (y - 38) * S)
          ctx.rotate(Math.sin(swing * 12) * swing * 0.25)
          ctx.translate(-x * S, -(y - 38) * S)
          picDraw('sandbag', x, y)
          ctx.restore()
        } else if (e[2] === 'dumbbell' && mano.act && mano.act.pose === 'lift' && mano.act.kind === 'do') continue
        else picDraw(e[2], e[3].it.at[0], e[3].it.at[1], popK(e[3]))
      } else if (e[1] === 'ball') picDraw('ball', ballPos.x, ballPos.y, popK(items.get('ball')))
      else if (e[1] === 'mano') drawMano()
      else drawCat(e[2])
    }
    swing = Math.max(0, swing - dt * 1.6)
    drawParts(dt)
    // words: Mano's line, the newest piece
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      b.t += dt
      if (b.t >= b.life) {
        bubbles.splice(i, 1)
        continue
      }
      bubble(mano.x, mano.y - MANO_H - 4, b.text)
    }
    if (toast) {
      toast.t += dt
      if (toast.t >= 2.6) toast = null
      else {
        ctx.globalAlpha = Math.min(1, (2.6 - toast.t) * 3)
        bubble(W / 2, 22, toast.text)
        ctx.globalAlpha = 1
      }
    }
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t
    now = t
    // the ball rolling to a stop
    ballPos.x += ballPos.vx * dt
    ballPos.y += ballPos.vy * dt
    ballPos.vx *= Math.max(0, 1 - 3 * dt)
    ballPos.vy *= Math.max(0, 1 - 3 * dt)
    ballPos.x = Math.max(12, Math.min(W - 12, ballPos.x))
    ballPos.y = Math.max(FY + 14, Math.min(H - 6, ballPos.y))
    updateMano(dt)
    for (const c of kitties) updateCat(c, dt)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawRoom(dt)
    raf = requestAnimationFrame(frame)
  }

  // the pieces at a total: the new ones pop in (not the first time)
  function setTotal(t, first = false) {
    const have = roomItems(D, t)
    let fresh = null
    for (const it of have)
      if (!items.has(it.id)) {
        items.set(it.id, { it, born: first ? -1 : performance.now() })
        if (!first) {
          fresh = it
          const [x, y] = it.at
          sparkle(x, y - (ART[it.id][1] / 2), 10, pick([C.gold, C.pink, C.blue]))
        }
      }
    let gone = false
    for (const id of [...items.keys()])
      if (!have.some((it) => it.id === id)) {
        items.delete(id)
        gone = true
      }
    // (fewer levels only with another save read in: everyone starts afresh)
    if (gone) for (const who of [mano, ...kitties]) who.act = null
    if (fresh) toast = { text: have.length === R.items.length ? R.completeLine : R.newItem.replace('{name}', fresh.name), t: 0 }
    if (first && has('ball')) Object.assign(ballPos, { x: spot('ball')[0], y: spot('ball')[1] })
  }
  setTotal(total, true)

  function resize(cssW) {
    // whole device pixels a room pixel, so the pixels stay square
    const dpr = window.devicePixelRatio || 1
    S = Math.max(1, Math.round((cssW * dpr) / W))
    canvas.width = W * S
    canvas.height = H * S
  }

  raf = requestAnimationFrame(frame)
  return {
    resize,
    setTotal,
    setCats,
    // a coin stat bought: a hop, a wave and her line
    react(stat) {
      mano.hop = 0.6
      mano.act = { kind: 'do', pose: 'wave', t: 0, dur: 1.4, on: mano.act && mano.act.kind === 'do' ? mano.act.on : undefined }
      bubbles.length = 0
      bubbles.push({ text: R.reactions[stat] || '좋아!', t: 0, life: 1.6 })
      sparkle(mano.x, mano.y - MANO_H / 2, 8, C.gold)
      for (let i = 0; i < 3; i++) parts.push({ x: mano.x + rnd(-8, 8), y: mano.y - MANO_H, vx: rnd(-6, 6), vy: -16, t: 0, life: 1, kind: 'heart' })
    },
    // (the dev page's hook: Mano does this next)
    play(k) {
      manoNext(k)
    },
    destroy() {
      cancelAnimationFrame(raf)
    },
  }
}
