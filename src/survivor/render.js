// MANO SURVIVOR — drawing one frame of the battle. Reads the run, never
// changes it. The world is the 360 × 640 logical screen; sprites are the v3
// pixel art (see sprites.js), placed by their pivot on the ground point and
// drawn with smoothing off so pixels stay square.
//
// Mano: one of eight facings picked from her direction of travel (with a 6°
// margin so it never flickers on a boundary); she moves at any angle and is
// never rotated. Left-hand rows are already in the sheet (mirrored when the
// art was made), so run frames are never flipped again here. Her step carries
// on through a turn; she stops on the spot when the stick is let go.

import { FRAMES, ART, animFrame } from './sprites.js'
import { chargePath } from './game.js'

// a damage number short enough to read over the fight: 9876, 12.3K, 456K, 7.8M …
const UNITS = ['', 'K', 'M', 'B', 'T']
export function short(n) {
  n = Math.round(n)
  if (n < 1e4) return String(n)
  let u = 0
  while (n >= 1000 && u < UNITS.length - 1) (n /= 1000), u++
  if (n >= 1000) return n.toExponential(1).replace('+', '') + UNITS[u]
  return (n < 100 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.floor(n))) + UNITS[u]
}

const DIRS = ['S', 'SE', 'E', 'NE', 'N', 'SW', 'W', 'NW']
const DIR_ANGLE = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: -135, N: -90, NE: -45 }
const MANO_SCALE = 0.9 // a 50 px tall frame → 45 logical px
const BALL_LIFT = 7 // balls fly a little above the ground (their shadow stays on it)
const MAX_FX = 80
const MAX_NUMBERS = 40
const ENEMY_DIE = 0.28

// idle frames there are: S/SE/E two, NE/N one; the left side mirrors the right
const IDLE = { S: ['idle_s', false], SE: ['idle_se', false], E: ['idle_e', false], NE: ['idle_ne', false], N: ['idle_n', false], SW: ['idle_se', true], W: ['idle_e', true], NW: ['idle_ne', true] }
// hit frames there are: S and SE (SW mirrors SE); other facings keep their
// frame and flash instead of turning to face the viewer
const HIT = { S: ['hit_s', false], SE: ['hit_se', false], SW: ['hit_se', true] }

// facing from a direction of travel, kept unless the angle moves 6° past the
// edge of the current 45° slice
export function facing(prev, vx, vy) {
  const a = (Math.atan2(vy, vx) * 180) / Math.PI
  const diff = (d) => Math.abs(((a - DIR_ANGLE[d] + 540) % 360) - 180)
  if (prev && diff(prev) <= 22.5 + 6) return prev
  let best = 'S'
  for (const d of DIRS) if (diff(d) < diff(best)) best = d
  return best
}

export function createRenderer(canvas, img, D) {
  const ctx = canvas.getContext('2d')
  const view = { w: 360, h: 640, dpr: 1, k: 1 }
  const mano = { dir: 'S', phase: 0, idleT: 0, hitT: 0, downT: 0, prevHit: 0 }
  const fx = []
  const numbers = []
  let field = null // the ground, painted once per screen size
  const shade = new Map() // shadows wait here and go down together, one fill per darkness
  const small = new Map() // smoothed copies of frames drawn smaller than their pixels
  const tints = new Map() // white / red silhouettes of each sheet, for flashes
  const E = D.balance.enemies

  function resize(cssW, cssH, dpr) {
    // past 2 the art has no more detail to show, only more pixels to fill
    view.dpr = Math.min(dpr || 1, 2)
    view.w = cssW
    view.h = cssH
    view.k = cssW / 360
    canvas.width = Math.round(cssW * view.dpr)
    canvas.height = Math.round(cssH * view.dpr)
    field = null
    small.clear()
  }
  const kd = () => view.k * view.dpr
  const world = () => ctx.setTransform(kd(), 0, 0, kd(), 0, 0)
  const device = () => ctx.setTransform(1, 0, 0, 1, 0, 0)

  function tinted(sheet, color) {
    const key = sheet + color
    let c = tints.get(key)
    if (c) return c
    const im = img[sheet]
    c = document.createElement('canvas')
    c.width = im.width
    c.height = im.height
    const g = c.getContext('2d')
    g.drawImage(im, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, c.width, c.height)
    tints.set(key, c)
    return c
  }

  // One frame with its pivot on (x, y) at scale s (logical px per art px).
  // When an art pixel covers at least one screen pixel it is drawn square and
  // sharp (smoothing off, snapped to whole pixels); smaller than that (tiny
  // balls, gems) a smoothed copy is made once so no pixel simply vanishes.
  function put(name, x, y, s, { flip = false, alpha = 1, flash = 0, flashColor = '#ffffff' } = {}) {
    const f = FRAMES[name]
    const r = f.rect
    const b = f.contentBounds
    const [px, py] = f.pivot
    const K = kd()
    const dw = Math.max(1, Math.round(b.w * s * K))
    const dh = Math.max(1, Math.round(b.h * s * K))
    const left = flip ? x - (b.x + b.w - px) * s : x - (px - b.x) * s
    const dx = Math.round(left * K)
    const dy = Math.round((y - (py - b.y) * s) * K)
    let src = img[f.sheet]
    let sx = r.x + b.x
    let sy = r.y + b.y
    let sw = b.w
    let sh = b.h
    if (s * K < 1) {
      const key = name + '|' + dw + 'x' + dh
      let c = small.get(key)
      if (!c) {
        c = document.createElement('canvas')
        c.width = dw
        c.height = dh
        const g = c.getContext('2d')
        g.imageSmoothingEnabled = true
        g.imageSmoothingQuality = 'high'
        g.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh)
        small.set(key, c)
      }
      src = c
      sx = 0
      sy = 0
      sw = dw
      sh = dh
    }
    ctx.imageSmoothingEnabled = false
    if (flip) ctx.setTransform(-1, 0, 0, 1, dx + dw, 0)
    else device()
    const ox = flip ? 0 : dx
    if (alpha !== 1) ctx.globalAlpha = alpha
    ctx.drawImage(src, sx, sy, sw, sh, ox, dy, dw, dh)
    if (flash > 0 && src === img[f.sheet]) {
      ctx.globalAlpha = alpha * flash
      ctx.drawImage(tinted(f.sheet, flashColor), sx, sy, sw, sh, ox, dy, dw, dh)
    }
    ctx.globalAlpha = 1
  }

  function shadow(x, y, rx, ry, a = 0.2) {
    let q = shade.get(a)
    if (!q) shade.set(a, (q = []))
    q.push(x, y, rx, ry)
  }

  // all shadows lie on the ground, under everything standing or flying
  function drawShadows() {
    world()
    for (const [a, q] of shade) {
      if (!q.length) continue
      ctx.fillStyle = `rgba(30, 38, 30, ${a})`
      ctx.beginPath()
      for (let i = 0; i < q.length; i += 4) {
        ctx.moveTo(q[i] + q[i + 2], q[i + 1])
        ctx.ellipse(q[i], q[i + 1], q[i + 2], q[i + 3], 0, 0, Math.PI * 2)
      }
      ctx.fill()
      q.length = 0
    }
  }

  // the ground tile laid edge to edge, every other one mirrored so the edges
  // always meet (the tile is not assumed to be seamless)
  function paintField() {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    const g = c.getContext('2d')
    const K = kd()
    const tile = img['09_ground.png']
    const T = tile.width // one art pixel per logical pixel
    g.imageSmoothingEnabled = false
    for (let j = 0; j * T < 640; j++)
      for (let i = 0; i * T < 360; i++) {
        const fx = i % 2 === 1
        const fy = j % 2 === 1
        g.setTransform(fx ? -K : K, 0, 0, fy ? -K : K, (fx ? (i + 1) * T : i * T) * K, (fy ? (j + 1) * T : j * T) * K)
        g.drawImage(tile, 0, 0)
      }
    g.setTransform(K, 0, 0, K, 0, 0)
    const [x0, y0, x1, y1] = D.balance.logicalArena.bounds
    // the edge of the field: a soft darker band and a thin line (the balls
    // bounce here, Mano stops here)
    g.fillStyle = 'rgba(30, 38, 30, 0.18)'
    g.fillRect(0, 0, 360, y0)
    g.fillRect(0, y1, 360, 640 - y1)
    g.fillRect(0, y0, x0, y1 - y0)
    g.fillRect(x1, y0, 360 - x1, y1 - y0)
    g.strokeStyle = 'rgba(30, 38, 30, 0.28)'
    g.lineWidth = 1.5
    g.strokeRect(x0, y0, x1 - x0, y1 - y0)
    return c
  }

  // ── Mano ──
  function drawMano(run, dt) {
    const p = run.player
    if (p.moving && run.state === 'play') mano.dir = facing(mano.dir, p.vx, p.vy)
    const dir = mano.dir
    if (p.hitT > 0 && mano.prevHit <= 0) mano.hitT = 0.12 // two hit frames of 60 ms
    mano.prevHit = p.hitT
    const blink = p.inv > 0 && run.state === 'play' && Math.floor(p.inv * 14) % 2 === 0
    const opt = { alpha: blink ? 0.55 : 1, flash: 0, flashColor: '#ff5a5a' }
    if (run.state === 'dying' || (run.state === 'over' && run.result && !run.result.cleared)) {
      mano.downT += dt
      put(animFrame('down', mano.downT * 1000, false), p.x, p.y, MANO_SCALE)
      return
    }
    mano.downT = 0
    let name
    let flip = false
    if (mano.hitT > 0) {
      mano.hitT -= dt
      opt.flash = 0.55
      const h = HIT[dir]
      if (h) {
        ;[name, flip] = h
        name = animFrame(name, (0.12 - mano.hitT) * 1000, false)
      }
    }
    if (!name && p.moving && run.state === 'play') {
      // step rate follows her real speed (faster after speed upgrades)
      const rate = Math.max(0.75, Math.min(1.4, Math.hypot(p.vx, p.vy) / p.baseSpeed))
      mano.phase += dt * 1000 * rate
      name = animFrame('run_' + dir.toLowerCase(), mano.phase)
    }
    if (!name) {
      mano.idleT += run.state === 'play' ? dt : 0
      const [a, f] = IDLE[dir]
      name = animFrame(a, mano.idleT * 1000)
      flip = f
    }
    put(name, p.x, p.y, MANO_SCALE, { ...opt, flip })
  }

  // ── monsters ──
  function drawEnemy(run, e) {
    const def = E[e.type]
    const s = def.scale
    const art = def.art // which pictures it wears (the mid-boss wears the boss's)
    const flip = e.face < 0
    let name
    let alpha = 1
    let flash = e.hitT > 0 ? Math.min(1, e.hitT / 0.12) * 0.8 : 0
    if (e.behavior === 'boss') {
      if (e.state === 'down') (name = 'boss_down'), (flash = 0)
      else if (e.mode === 'windup' || e.mode === 'stompWind') name = 'boss_windup'
      else if (e.mode === 'charge') name = 'boss_charge'
      else if (e.hitT > 0) name = 'boss_hit'
      else name = animFrame('boss_run', e.life * 1000)
    } else name = animFrame(art + '_run', e.life * 1000 + e.id * 37)
    if (e.state === 'spawn') alpha = 0.25 + 0.6 * Math.min(1, e.t / 0.35)
    else if (e.state === 'die') (alpha = Math.max(0, 1 - e.t / ENEMY_DIE)), (flash = 0.9)
    else if (e.state === 'gone') alpha = Math.max(0, 1 - e.t / ENEMY_DIE)
    put(name, e.x, e.y, s, { flip, alpha, flash })
  }

  // where the boss will charge: the real band its body sweeps (a capsule as
  // wide as it is), on the ground under everyone
  function drawWarning(run, e) {
    const c = chargePath(run, e)
    const def = E[e.type]
    const k = 1 - e.modeT / def.windupSeconds // 0 → 1 as the charge nears
    world()
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(Math.atan2(c.dy, c.dx))
    ctx.beginPath()
    ctx.moveTo(0, -c.half)
    ctx.lineTo(c.len, -c.half)
    ctx.arc(c.len, 0, c.half, -Math.PI / 2, Math.PI / 2)
    ctx.lineTo(0, c.half)
    ctx.arc(0, 0, c.half, Math.PI / 2, -Math.PI / 2)
    ctx.closePath()
    ctx.fillStyle = `rgba(214, 58, 58, ${0.14 + 0.16 * k})`
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = `rgba(214, 58, 58, ${0.45 + 0.4 * k})`
    ctx.setLineDash([5, 4])
    ctx.stroke()
    ctx.setLineDash([])
    // how close it is: a bar filling along the band
    ctx.fillStyle = 'rgba(214, 58, 58, 0.35)'
    ctx.fillRect(0, -2, c.len * k, 4)
    ctx.restore()
  }

  // the slam: the real circle it will hit, on the ground
  function drawRing(run, e) {
    const def = E[e.type]
    const k = 1 - e.modeT / def.stompWindup
    world()
    ctx.beginPath()
    ctx.arc(e.x, e.y, def.stompRadius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(214, 58, 58, ${0.12 + 0.16 * k})`
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = `rgba(214, 58, 58, ${0.45 + 0.4 * k})`
    ctx.setLineDash([5, 4])
    ctx.stroke()
    ctx.setLineDash([])
    // how close it is: a ring closing in from the edge
    ctx.beginPath()
    ctx.arc(e.x, e.y, def.stompRadius * Math.max(0.05, k), 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(214, 58, 58, 0.5)'
    ctx.stroke()
  }

  function drawBall(b, trails) {
    const name = b.gen > 0 ? 'ball_child' : b.heavy ? 'ball_gold' : 'ball'
    const s = (b.r * 2) / 24
    const sp = Math.hypot(b.vx, b.vy)
    if (trails && sp > 1) {
      // the short trail: 8–16 px behind the ball, along where it is going
      const f = FRAMES.trail
      const cb = f.contentBounds
      const len = Math.max(8, Math.min(16, sp * 0.045))
      const K = kd()
      ctx.imageSmoothingEnabled = true
      ctx.setTransform(K, 0, 0, K, b.x * K, (b.y - BALL_LIFT) * K)
      ctx.rotate(Math.atan2(b.vy, b.vx))
      ctx.globalAlpha = 0.65
      const th = Math.max(2, b.r * 1.3)
      ctx.drawImage(img[f.sheet], f.rect.x + cb.x, f.rect.y + cb.y, cb.w, cb.h, -len, -th / 2, len, th)
      ctx.globalAlpha = 1
    }
    put(name, b.x, b.y - BALL_LIFT, s)
  }

  function drawOrb(o, now) {
    const bob = Math.sin(now / 260 + o.x) * 1.2
    if (o.kind === 'xp') put('xp_gem', o.x, o.y - 5 + bob, (9 + Math.min(5, Math.sqrt(o.v))) / 24)
    else if (o.kind === 'coin') put('coin', o.x, o.y - 5 + bob, 10 / 24)
    else if (o.kind === 'heal') put('heal', o.x, o.y - 6 + bob, 13 / 24)
  }

  // ── one frame ──
  function draw(run, dt) {
    const now = performance.now()
    if (!field) field = paintField()
    device()
    ctx.drawImage(field, 0, 0)

    // the ground first: shadows, the boss's warning, pickups; then standing
    // things back to front by their feet; then balls and hits in the air
    const p = run.player
    shadow(p.x, p.y, 13, 4.5)
    for (const e of run.enemies) {
      const w = e.r * 1.15
      if (e.state === 'spawn') {
        const f = Math.min(1, e.t / 0.35)
        shadow(e.x, e.y, w * f, e.r * 0.42 * f, 0.3)
      } else if (e.state === 'live' || e.state === 'down') shadow(e.x, e.y, w, e.r * 0.42)
    }
    // a busy screen sheds decoration first (never balls, hits or damage):
    // ball shadows and trails go, and fewer numbers and sparks are drawn
    const busy = run.balls.length > D.balance.performance.trailsUpTo
    if (!busy) for (const b of run.balls) shadow(b.x, b.y, b.r * 0.9, b.r * 0.35, 0.16)
    drawShadows()
    for (const e of run.enemies) {
      if (e.behavior !== 'boss' || e.state !== 'live') continue
      if (e.mode === 'windup') drawWarning(run, e)
      else if (e.mode === 'stompWind') drawRing(run, e)
    }
    for (const o of run.orbs) drawOrb(o, now)
    const list = []
    for (const e of run.enemies) list.push([e.y, 0, e])
    list.push([p.y + 0.01, 1, p])
    list.sort((a, b) => a[0] - b[0])
    for (const [, kind, o] of list) (kind ? drawMano(run, dt) : drawEnemy(run, o))
    for (const b of run.balls) drawBall(b, !busy)
    const maxFx = busy ? MAX_FX / 3 : MAX_FX
    const maxNumbers = busy ? MAX_NUMBERS / 4 : MAX_NUMBERS

    // effects from this frame's events
    for (const ev of run.events) {
      if (ev.type === 'hit') {
        if (fx.length < maxFx) fx.push({ anim: 'impact', x: ev.x, y: ev.y - BALL_LIFT, t: 0, s: 0.6 })
        if (numbers.length < maxNumbers) numbers.push({ x: ev.x, y: ev.y - 18, text: short(ev.n), t: 0, color: '#2f2537' })
      } else if (ev.type === 'die') {
        const big = E[ev.kind].rank ? 2.2 : 1
        if (fx.length < MAX_FX || big > 1) fx.push({ anim: 'dust', x: ev.x, y: ev.y - 4, t: 0, s: 0.9 * big })
      } else if (ev.type === 'stomp') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          fx.push({ anim: 'dust', x: ev.x + Math.cos(a) * ev.r * 0.7, y: ev.y + Math.sin(a) * ev.r * 0.7, t: 0, s: 1.3 })
        }
      } else if (ev.type === 'hurt') {
        if (numbers.length < MAX_NUMBERS) numbers.push({ x: ev.x, y: ev.y - 52, text: `-${Math.round(ev.n)}`, t: 0, color: '#d9524a' })
      } else if (ev.type === 'heal') {
        numbers.push({ x: ev.x, y: ev.y - 52, text: `+${Math.round(ev.n)}`, t: 0, color: '#3f9d5a' })
      }
    }
    run.events.length = 0
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]
      f.t += dt
      const a = f.anim && ART.animations[f.anim]
      const d = f.d || a.frames.length * (a.frameMs / 1000)
      if (f.t >= d) {
        fx.splice(i, 1)
        continue
      }
      put(f.frame || animFrame(f.anim, f.t * 1000, false), f.x, f.y, f.s, { alpha: f.frame ? Math.min(1, (d - f.t) * 4) : 1 })
    }
    world()
    ctx.textAlign = 'center'
    ctx.font = '700 11px system-ui, -apple-system, sans-serif'
    ctx.lineWidth = 3
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i]
      n.t += dt
      if (n.t > 0.6) {
        numbers.splice(i, 1)
        continue
      }
      const y = n.y - n.t * 22
      ctx.globalAlpha = Math.min(1, (0.6 - n.t) * 4)
      ctx.strokeStyle = 'rgba(252, 235, 205, 0.9)'
      ctx.strokeText(n.text, n.x, y)
      ctx.fillStyle = n.color
      ctx.fillText(n.text, n.x, y)
    }
    ctx.globalAlpha = 1
  }

  return { resize, draw, view, mano, reset: () => Object.assign(mano, { dir: 'S', phase: 0, idleT: 0, hitT: 0, downT: 0, prevHit: 0 }) }
}
