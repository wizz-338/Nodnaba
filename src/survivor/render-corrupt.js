// MANO SURVIVOR — drawing 마계 침공 (corruption.js): chapters 26–30, the sky
// invaded by the demon world. Reads the run, never changes it.
//
// The monsters' three looks (render.js draws the sprite, this the rest):
//   clean  — the sky monster as it is (white, gold, sky blue);
//   warn   — violet cracks over its body, a dark violet cast flickering in
//            and deepening, a violet pool under it with a ring round it
//            filling as the turn nears, a violet crack-mark blinking over its
//            head; in the warning's last fifth it trembles: it is about to
//            turn;
//   full   — recoloured black-violet (its light parts lilac), a little
//            bigger, its cracks glowing, a dark aura under it, a broken
//            violet halo turning over its head and smoke rising off it.
//            Charging a shot: a dark orb swelling at its front and a dashed
//            violet line where it will fly.
// Its dark orbs (shot kind 'abyss', drawn in render.js's drawShot), the
// burst when one turns, and the ground: violet rifts and dark stains in the
// clouds, more each chapter (corruption.rift), and a violet edge round the
// screen that deepens with the turned ones on the field.

import { corruptLook } from './corruption.js'

const TAU = Math.PI * 2
const MAX_PARTS = 120

// a picture's black-violet copy: by its lightness, dark violet → violet →
// lilac (a little of its own colour kept), its outline and alpha as they were
export function voidOf(src) {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(src, 0, 0)
  if (!c.width || !c.height) return c
  const im = g.getImageData(0, 0, c.width, c.height)
  const d = im.data
  const stop = (L) => (L < 0.55 ? mix([20, 6, 32], [92, 34, 146], L / 0.55) : mix([92, 34, 146], [222, 182, 255], (L - 0.55) / 0.45))
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const L = ((0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255) ** 1.3
    const m = stop(L)
    d[i] = m[0] * 0.85 + d[i] * 0.15 * 0.6
    d[i + 1] = m[1] * 0.85 + d[i + 1] * 0.15 * 0.6
    d[i + 2] = m[2] * 0.85 + d[i + 2] * 0.15 * 0.6
  }
  g.putImageData(im, 0, 0)
  return c
}
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

// cracks over a picture, only where it is drawn: a few jagged violet lines
// (the same pattern for every frame of one look, so they hold still)
export function cracksOf(src, seed = 1) {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const g = c.getContext('2d')
  const rnd = rng(seed)
  const W = c.width
  const H = c.height
  const w = Math.max(1, W / 34)
  const paths = []
  for (let n = 0; n < 5; n++) {
    const pts = [[W * (0.25 + 0.5 * rnd()), H * (0.2 + 0.6 * rnd())]]
    let a = rnd() * TAU
    for (let i = 0; i < 5; i++) {
      a += (rnd() - 0.5) * 1.4
      const [x, y] = pts[pts.length - 1]
      const l = (W + H) * (0.04 + 0.05 * rnd())
      pts.push([x + Math.cos(a) * l, y + Math.sin(a) * l])
    }
    paths.push(pts)
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const [col, lw] of [
    ['rgba(30, 6, 46, 0.95)', w * 2.2],
    ['rgba(196, 120, 255, 1)', w],
  ]) {
    g.strokeStyle = col
    g.lineWidth = lw
    for (const pts of paths) {
      g.beginPath()
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
    }
  }
  // (only on the body)
  g.globalCompositeOperation = 'destination-in'
  g.drawImage(src, 0, 0)
  return c
}

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

// The ground of an invaded chapter, painted once into its cached picture
// (g: its context, already in logical px; w × h: the area): a violet cast,
// dark stains in the clouds and violet rifts, more of them as the chapter
// goes deeper into the invasion (rift 0 … 1)
export function paintRifts(g, run, w, h) {
  const C = run.corrupt
  if (!C) return
  const k = C.rift
  const rnd = rng(run.chapter * 7919)
  g.save()
  g.fillStyle = `rgba(52, 16, 82, ${0.04 + 0.12 * k})`
  g.fillRect(0, 0, w, h)
  // (the field is larger on the PC: as many rifts for as much ground)
  const area = (w * h) / (360 * 640)
  const stains = Math.round((1 + 5 * k) * area)
  for (let i = 0; i < stains; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = 40 + 60 * rnd()
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(48, 10, 76, ${0.16 + 0.22 * k})`)
    gr.addColorStop(1, 'rgba(48, 10, 76, 0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.fill()
  }
  const n = Math.round((2 + 7 * k) * area)
  const rifts = []
  for (let i = 0; i < n; i++) {
    const make = (x, y, a, segs, len) => {
      const pts = [[x, y]]
      for (let j = 0; j < segs; j++) {
        a += (rnd() - 0.5) * 1.2
        const [px, py] = pts[pts.length - 1]
        const l = len * (0.6 + 0.8 * rnd())
        pts.push([px + Math.cos(a) * l, py + Math.sin(a) * l])
        if (rnd() < 0.25 && segs > 3) rifts.push(make(px, py, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + 0.6 * rnd()), 3, len * 0.6))
      }
      return pts
    }
    rifts.push(make(rnd() * w, rnd() * h, rnd() * TAU, 6 + Math.floor(rnd() * 5), 9 + 6 * k))
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const [col, lw] of [
    [`rgba(150, 70, 230, ${0.12 + 0.12 * k})`, 9],
    ['rgba(34, 8, 54, 0.85)', 3.2],
    [`rgba(206, 146, 255, ${0.55 + 0.4 * k})`, 1.1],
  ]) {
    g.strokeStyle = col
    g.lineWidth = lw
    for (const pts of rifts) {
      g.beginPath()
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
    }
  }
  g.restore()
}

export function createCorruptFx({ ctx, world, device, screen }) {
  const parts = [] // { x, y, vx, vy, t, life, s, c }
  const rings = [] // { x, y, r, t, life, w }

  const spark = (x, y, vx, vy, life, s, c) => {
    if (parts.length < MAX_PARTS) parts.push({ x, y, vx, vy, t: 0, life, s, c })
  }

  // under the monster's sprite: a thin smoke ring (warn) or a dark aura (full)
  // x, y: its feet; mid: its body's middle (y)
  function under(run, e, L, mid, now) {
    world()
    if (L.stage === 1) {
      // a violet pool under it, and round it a ring filling as the turn
      // nears (the time left to kill it, read at a glance)
      const p = 0.5 + 0.5 * Math.sin(now / (110 - 60 * L.k) + e.id)
      const rx = e.r * 1.5
      const ry = e.r * 0.62
      ctx.fillStyle = `rgba(110, 36, 190, ${0.16 + 0.22 * L.k * p})`
      ctx.beginPath()
      ctx.ellipse(e.x, e.y + 1, rx, ry, 0, 0, TAU)
      ctx.fill()
      ctx.lineWidth = 2.6
      ctx.strokeStyle = 'rgba(30, 6, 46, 0.55)'
      ctx.beginPath()
      ctx.ellipse(e.x, e.y + 1, rx, ry, 0, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = 2
      ctx.strokeStyle = `rgba(196, 120, 255, ${0.75 + 0.25 * p})`
      ctx.beginPath()
      ctx.ellipse(e.x, e.y + 1, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * L.k)
      ctx.stroke()
      return
    }
    const R = e.r * 2.3
    const g = ctx.createRadialGradient(e.x, mid, e.r * 0.3, e.x, mid, R)
    g.addColorStop(0, 'rgba(70, 14, 110, 0.5)')
    g.addColorStop(0.6, 'rgba(70, 14, 110, 0.2)')
    g.addColorStop(1, 'rgba(70, 14, 110, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(e.x, mid, R, 0, TAU)
    ctx.fill()
  }

  // over the sprite: the broken halo, the smoke rising, the charging orb and
  // its line (top: the top of its sprite, y)
  function over(run, e, L, top, mid, now) {
    world()
    if (L.stage === 1) {
      // a violet crack-mark over its head, blinking faster as the turn nears
      // (and at its brightest in the warning's last fifth)
      const blink = L.k > 0.8 ? Math.floor(now / 70) % 2 : 0.6 + 0.4 * Math.sin(now / (160 - 100 * L.k))
      const y = top - 7
      ctx.globalAlpha = 0.45 + 0.55 * blink
      ctx.fillStyle = '#1e0830'
      ctx.beginPath()
      ctx.moveTo(e.x, y - 6)
      ctx.lineTo(e.x + 4.5, y)
      ctx.lineTo(e.x, y + 6)
      ctx.lineTo(e.x - 4.5, y)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#c47aff'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(e.x - 1, y - 3.5)
      ctx.lineTo(e.x + 1.2, y - 0.5)
      ctx.lineTo(e.x - 0.8, y + 0.8)
      ctx.lineTo(e.x + 0.6, y + 3.5)
      ctx.stroke()
      ctx.globalAlpha = 1
      return
    }
    // the halo, broken: arcs of a dark violet ring, tilted, with spikes
    const hx = e.x
    const hy = top - 4
    const hr = Math.max(7, e.r * 0.8)
    const spin = now / 700 + e.id
    ctx.lineCap = 'round'
    ctx.lineWidth = 2.6
    ctx.strokeStyle = 'rgba(30, 6, 46, 0.9)'
    for (let i = 0; i < 3; i++) {
      const a0 = spin + (i * TAU) / 3
      ctx.beginPath()
      ctx.ellipse(hx, hy, hr, hr * 0.32, 0, a0, a0 + 1.4)
      ctx.stroke()
    }
    ctx.lineWidth = 1.2
    ctx.strokeStyle = 'rgba(190, 110, 255, 0.95)'
    for (let i = 0; i < 3; i++) {
      const a0 = spin + (i * TAU) / 3
      ctx.beginPath()
      ctx.ellipse(hx, hy, hr, hr * 0.32, 0, a0, a0 + 1.4)
      ctx.stroke()
      // a spike off its broken end
      const ex = hx + Math.cos(a0 + 1.4) * hr
      const ey = hy + Math.sin(a0 + 1.4) * hr * 0.32
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex + Math.cos(a0 + 1.4) * 3, ey - 4)
      ctx.stroke()
    }
    // smoke rising off it (three wisps on a loop, no state kept)
    for (let i = 0; i < 3; i++) {
      const q = ((now / 1100 + i / 3 + e.id * 0.137) % 1 + 1) % 1
      const x = e.x + Math.sin(q * 6 + i * 2 + e.id) * e.r * 0.6
      const y = mid - q * e.r * 2.4
      ctx.fillStyle = `rgba(60, 14, 96, ${0.45 * (1 - q)})`
      ctx.beginPath()
      ctx.arc(x, y, 2 + 3 * q, 0, TAU)
      ctx.fill()
    }
    ctx.lineCap = 'butt'
    // charging: the orb swelling at its front, the line it will fly
    if (L.aim > 0) {
      const a = e.cAimA ?? 0
      const ox = e.x + Math.cos(a) * e.r * 0.8
      const oy = mid + Math.sin(a) * e.r * 0.8
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = `rgba(180, 100, 255, ${0.25 + 0.55 * L.aim})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ox + Math.cos(a) * (40 + 50 * L.aim), oy + Math.sin(a) * (40 + 50 * L.aim))
      ctx.stroke()
      ctx.setLineDash([])
      const r = 2 + 5 * L.aim
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 2.2)
      g.addColorStop(0, 'rgba(200, 130, 255, 0.9)')
      g.addColorStop(1, 'rgba(120, 40, 200, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(ox, oy, r * 2.2, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#1a0626'
      ctx.beginPath()
      ctx.arc(ox, oy, r, 0, TAU)
      ctx.fill()
    }
  }

  // the bursts (a turn, a warning beginning, a shot), the screen's edge
  function frame(run, now, dt) {
    world()
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.t += dt
      if (r.t >= r.life) {
        rings.splice(i, 1)
        continue
      }
      const k = r.t / r.life
      ctx.strokeStyle = `rgba(170, 90, 255, ${0.8 * (1 - k)})`
      ctx.lineWidth = r.w * (1 - k) + 0.5
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r * (0.3 + 0.7 * Math.sqrt(k)), 0, TAU)
      ctx.stroke()
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const s = parts[i]
      s.t += dt
      if (s.t >= s.life) {
        parts.splice(i, 1)
        continue
      }
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.vx *= 0.94
      s.vy *= 0.94
      const k = 1 - s.t / s.life
      ctx.fillStyle = s.c
      ctx.globalAlpha = k
      ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s)
    }
    ctx.globalAlpha = 1
    // the screen's edge: violet, deeper with the chapter and with every
    // turned monster on the field (breathing slowly)
    const C = run.corrupt
    if (!C) return
    let n = 0
    for (const e of run.enemies) if (e.state === 'live' && e.cStage === 2) n++
    const a = (0.06 + 0.1 * C.rift + 0.035 * Math.min(6, n)) * (0.85 + 0.15 * Math.sin(now / 900))
    const [W, H] = screen()
    device()
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55)
    g.addColorStop(0, 'rgba(60, 10, 96, 0)')
    g.addColorStop(1, `rgba(60, 10, 96, ${a})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  function event(run, ev) {
    if (ev.type === 'corrupt') {
      // the turn: a dark flash, violet shards flying out, two rings
      rings.push({ x: ev.x, y: ev.y - 10, r: ev.big ? 90 : 46, t: 0, life: 0.5, w: 4 })
      rings.push({ x: ev.x, y: ev.y - 10, r: ev.big ? 60 : 28, t: 0, life: 0.35, w: 3 })
      const n = ev.big ? 28 : 14
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU
        const v = 60 + Math.random() * (ev.big ? 200 : 120)
        spark(ev.x, ev.y - 10, Math.cos(a) * v, Math.sin(a) * v - 20, 0.45 + Math.random() * 0.3, 2 + Math.random() * 2.5, i % 3 ? '#9a4dff' : '#1e0830')
      }
    } else if (ev.type === 'corruptWarn') {
      rings.push({ x: ev.x, y: ev.y - 8, r: 24, t: 0, life: 0.4, w: 2 })
    } else if (ev.type === 'voidShot') {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * TAU
        spark(ev.x, ev.y - 8, Math.cos(a) * 50, Math.sin(a) * 50, 0.3, 2, '#b06cff')
      }
    }
  }

  return { under, over, frame, event, look: corruptLook }
}
