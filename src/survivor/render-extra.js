// MANO SURVIVOR — drawing the extra special bosses' attacks (bosses.js) over
// the whole play area. Reads the run, never changes it.
//
// Every attack in three beats: the warning (its exact shape on the ground in
// the boss's colours, the safe ground in mint with a bright edge, where a
// ring or a band will travel), the blow (the shape bright, a ring or a band
// running across the area) and the after-glow (sparks and a fading trace,
// which never hurt). The danger is always the outlined shape; decoration
// stays inside it or is faint. Each boss has its own colours and pattern
// (a bell's rings, petals, spores, a rune web, ghosts, a staff, the sun, a
// sand curtain, a snowflake, ice crystals, wind, a clock dial, a chessboard,
// an eclipse). Sparks come from one pool with a cap, fewer on a busy screen;
// warnings and safe ground are never thinned.
import { frontAt } from './bosses.js'

// each boss's colours: c the attack, g its glow, d a dark accent
const THEMES = {
  bell: { c: [242, 168, 52], g: [255, 226, 140], d: [110, 70, 20] },
  flower: { c: [255, 110, 168], g: [255, 220, 120], d: [140, 40, 90] },
  spore: { c: [156, 92, 214], g: [120, 230, 200], d: [60, 30, 90] },
  web: { c: [56, 206, 170], g: [245, 205, 110], d: [20, 80, 70] },
  ghost: { c: [72, 224, 208], g: [190, 255, 250], d: [40, 40, 110] },
  organ: { c: [176, 92, 255], g: [242, 226, 194], d: [60, 20, 90] },
  sun: { c: [255, 170, 40], g: [255, 244, 190], d: [150, 80, 10] },
  sand: { c: [228, 176, 80], g: [255, 234, 170], d: [120, 80, 30] },
  snow: { c: [120, 205, 255], g: [240, 250, 255], d: [40, 90, 150] },
  ice: { c: [70, 160, 255], g: [225, 245, 255], d: [20, 60, 140] },
  storm: { c: [110, 190, 255], g: [235, 248, 255], d: [40, 70, 130] },
  clock: { c: [80, 120, 255], g: [246, 210, 110], d: [20, 30, 90] },
  chess: { c: [220, 36, 60], g: [255, 170, 180], d: [40, 10, 20] },
  eclipse: { c: [226, 32, 64], g: [246, 196, 90], d: [42, 14, 48] },
}
const SAFE = '125, 255, 176'
const rgb = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`
const MAX_PARTS = 160

export function createExtraFx({ ctx, world }) {
  const parts = [] // sparks: { x, y, vx, vy, t, life, s, c, kind }
  const rings = [] // shock rings: { x, y, t, life, r, c }
  let budget = 1 // 1, or less on a busy screen
  let board = null // the chessboard, painted once per area

  const theme = (look) => THEMES[look] || THEMES.eclipse
  function emit(x, y, n, look, { spd = 60, life = 0.7, s = 2.2, up = 0, kind = 'dot' } = {}) {
    const T = theme(look)
    n = Math.round(n * budget)
    for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
      const a = Math.random() * Math.PI * 2
      const v = spd * (0.4 + Math.random() * 0.8)
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, t: 0, life: life * (0.6 + Math.random() * 0.6), s: s * (0.6 + Math.random() * 0.8), col: rgb(Math.random() < 0.5 ? T.c : T.g, 1), kind })
    }
  }

  const nearing = (run, h) => Math.max(0, Math.min(1, (run.t - h.born) / Math.max(0.01, h.at - h.born)))

  // the exact shape of a still hazard
  function shape(h, grow = 1) {
    ctx.beginPath()
    if (h.kind === 'circle') ctx.arc(h.x, h.y, h.r * grow, 0, Math.PI * 2)
    else if (h.kind === 'cone') {
      const r0 = h.inner || 0
      ctx.arc(h.x, h.y, r0 + (h.range - r0) * grow, h.dir - h.angle / 2, h.dir + h.angle / 2)
      ctx.arc(h.x, h.y, r0, h.dir + h.angle / 2, h.dir - h.angle / 2, true)
      ctx.closePath()
    } else if (h.kind === 'line') {
      const nx = -h.dy * h.half
      const ny = h.dx * h.half
      ctx.moveTo(h.x + nx, h.y + ny)
      ctx.lineTo(h.x + h.dx * h.len + nx, h.y + h.dy * h.len + ny)
      ctx.lineTo(h.x + h.dx * h.len - nx, h.y + h.dy * h.len - ny)
      ctx.lineTo(h.x - nx, h.y - ny)
      ctx.closePath()
    }
  }

  // the arcs of a ring between its gaps (added to the path under way if `more`)
  function ringArcs(h, r, more = false) {
    const gaps = h.gaps.map(([g, half]) => [g - half, g + half]).sort((a, b) => a[0] - b[0])
    if (!more) ctx.beginPath()
    if (!gaps.length) {
      ctx.moveTo(h.x + r, h.y)
      return ctx.arc(h.x, h.y, r, 0, Math.PI * 2)
    }
    for (let i = 0; i < gaps.length; i++) {
      const from = gaps[i][1]
      let to = gaps[(i + 1) % gaps.length][0]
      while (to <= from) to += Math.PI * 2
      ctx.moveTo(h.x + Math.cos(from) * r, h.y + Math.sin(from) * r)
      ctx.arc(h.x, h.y, r, from, to)
    }
  }
  function wedge(x, y, a, half, r) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.arc(x, y, r, a - half, a + half)
    ctx.closePath()
  }
  // a band's rectangle pieces between its gaps, from front - w/2 to front + w/2
  function bandPieces(h, front, w, fn) {
    const [lo, hi] = h.span
    const cuts = [...h.gaps].sort((a, b) => a[0] - b[0])
    let at = lo
    const piece = (a, b) => {
      if (b <= a) return
      if (h.axis === 'x') fn(front - w / 2, a, w, b - a)
      else fn(a, front - w / 2, b - a, w)
    }
    for (const [g0, g1] of cuts) {
      piece(at, g0)
      at = g1
    }
    piece(at, hi)
  }
  function gapRects(h, B, fn) {
    for (const [g0, g1] of h.gaps) {
      if (h.axis === 'x') fn(B[0], g0, B[2] - B[0], g1 - g0)
      else fn(g0, B[1], g1 - g0, B[3] - B[1])
    }
  }

  // the chessboard over the area (painted once per area and size)
  function chessboard(B, cols, rows, T) {
    const key = B.join(',') + cols + rows
    if (board && board.key === key) return board.c
    const c = document.createElement('canvas')
    c.width = cols
    c.height = rows
    const g = c.getContext('2d')
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        g.fillStyle = (i + j) % 2 ? rgb(T.d, 1) : rgb(T.g, 1)
        g.fillRect(i, j, 1, 1)
      }
    board = { key, c }
    return c
  }

  // ── under everyone: the warnings, the safe ground, the boss's pattern ──
  function under(run, now, busy = false) {
    const X = run.extra
    if (!X || !X.boss) return
    world()
    const B = X.box
    const e = X.boss
    const T = theme(e.look)
    const live = e.state === 'live'
    // (all of it inside the fight's area: nothing spills over the edge)
    ctx.save()
    ctx.beginPath()
    ctx.rect(B[0], B[1], B[2] - B[0], B[3] - B[1])
    ctx.clip()
    // the pattern under it while it gathers itself
    if (live && (e.stage === 'ready' || e.stage === 'charge')) aura(run, e, T, now)
    if (e.look === 'clock' && live) dial(B, T, now, 0.18)
    for (const h of run.hazards) {
      if (h.owner !== e.id) continue
      const k = nearing(run, h)
      if (h.kind === 'wave') {
        if (run.t < h.at) {
          // where it will run: rings over the whole area (one path, one
          // stroke), and its gaps
          ctx.lineWidth = 2
          ctx.strokeStyle = rgb(T.c, 0.14 + 0.18 * k)
          const reach = Math.hypot(Math.max(h.x - B[0], B[2] - h.x), Math.max(h.y - B[1], B[3] - h.y))
          ctx.beginPath()
          for (let r = 50; r < reach; r += 70) ringArcs(h, r, true)
          ctx.stroke()
        } else if (!busy) {
          // the trace it leaves (shed on a busy screen)
          const r = frontAt(h, run.t)
          ctx.lineWidth = 22
          ctx.strokeStyle = rgb(T.c, 0.12)
          ringArcs(h, Math.max(1, r - 24))
          ctx.stroke()
        }
        // its gaps, safe all the way out
        for (const [g, half] of h.gaps) {
          wedge(h.x, h.y, g, half, h.speed * (h.until - h.at))
          ctx.fillStyle = `rgba(${SAFE}, ${0.06 + 0.05 * k})`
          ctx.fill()
        }
        continue
      }
      if (h.kind === 'band') {
        gapRects(h, B, (x, y, w, hh) => {
          ctx.fillStyle = `rgba(${SAFE}, ${0.07 + 0.05 * k})`
          ctx.fillRect(x, y, w, hh)
        })
        if (run.t < h.at) {
          // where it starts, and chevrons along its way
          const f = frontAt(h, h.at)
          const dir = Math.sign(h.speed)
          ctx.fillStyle = rgb(T.c, 0.18 + 0.2 * k)
          bandPieces(h, f + (dir * h.width) / 2, h.width, (x, y, w, hh) => ctx.fillRect(x, y, w, hh))
          ctx.strokeStyle = rgb(T.c, 0.3 + 0.3 * k)
          ctx.lineWidth = 2
          const [lo, hi] = h.axis === 'x' ? [B[0], B[2]] : [B[1], B[3]]
          for (let s = lo + 40; s < hi; s += 70) {
            bandPieces(h, s, 0.1, (x, y, w, hh) => {
              const mx = x + w / 2
              const my = y + hh / 2
              const L = 9
              ctx.beginPath()
              if (h.axis === 'x') {
                for (let yy = y + 14; yy < y + hh - 8; yy += 36) {
                  ctx.moveTo(mx - dir * L, yy - L)
                  ctx.lineTo(mx, yy)
                  ctx.lineTo(mx - dir * L, yy + L)
                }
              } else {
                for (let xx = x + 14; xx < x + w - 8; xx += 36) {
                  ctx.moveTo(xx - L, my - dir * L)
                  ctx.lineTo(xx, my)
                  ctx.lineTo(xx + L, my - dir * L)
                }
              }
              ctx.stroke()
            })
          }
        }
        continue
      }
      if (h.kind === 'board') {
        if (run.t < h.at + (h.keep || 0)) {
          ctx.globalAlpha = 0.1 + 0.07 * k
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(chessboard(h.box, h.cols, h.rows, T), h.box[0], h.box[1], h.box[2] - h.box[0], h.box[3] - h.box[1])
          ctx.globalAlpha = 1
        }
        continue
      }
      // a still hazard
      if (h.safe || h.idle) {
        if (run.t < h.at + 0.2) {
          shape(h)
          ctx.fillStyle = `rgba(${SAFE}, ${h.idle ? 0.06 : 0.12})`
          ctx.fill()
        }
        continue
      }
      if (h.thread) {
        // the web: thin threads, harmless
        shape(h)
        ctx.fillStyle = rgb(T.g, 0.35)
        ctx.fill()
        continue
      }
      if (run.t < h.at) {
        shape(h)
        ctx.fillStyle = rgb(T.c, 0.16 + 0.2 * k)
        ctx.fill()
        // how close it is: the shape filling from its middle out (a busy
        // screen keeps the shape and its edge, without this)
        if (!busy) {
          shape(h, Math.max(0.04, k))
          ctx.fillStyle = rgb(T.c, 0.18)
          ctx.fill()
        }
        inside(h, T, k, false)
      } else {
        // the blow: bright, then fading
        const f = 1 - (run.t - h.at) / h.linger
        shape(h)
        ctx.fillStyle = rgb(T.g, 0.6 * f)
        ctx.fill()
        inside(h, T, f, true)
      }
    }
    ctx.restore()
  }

  // each boss's own pattern inside its still shapes (never past their edge)
  function inside(h, T, k, struck) {
    if (h.puff) {
      // a mushroom cap: dots in a ring
      ctx.fillStyle = rgb(struck ? T.g : T.d, 0.35 + 0.3 * k)
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(h.x + Math.cos(a) * h.r * 0.55, h.y + Math.sin(a) * h.r * 0.55, h.r * 0.12, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (h.petal) {
      // a petal's vein
      ctx.strokeStyle = rgb(T.g, 0.35 + 0.4 * k)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(h.x + Math.cos(h.dir) * (h.inner || 0), h.y + Math.sin(h.dir) * (h.inner || 0))
      ctx.lineTo(h.x + Math.cos(h.dir) * h.range * 0.6, h.y + Math.sin(h.dir) * h.range * 0.6)
      ctx.stroke()
    } else if (h.arm) {
      // a snowflake's arm: its spine and side twigs
      ctx.strokeStyle = rgb(T.g, 0.4 + 0.4 * k)
      ctx.lineWidth = 2
      ctx.beginPath()
      const L = Math.min(h.range, 420)
      ctx.moveTo(h.x + Math.cos(h.dir) * 24, h.y + Math.sin(h.dir) * 24)
      ctx.lineTo(h.x + Math.cos(h.dir) * L, h.y + Math.sin(h.dir) * L)
      for (let d = 70; d < L; d += 70) {
        const bx = h.x + Math.cos(h.dir) * d
        const by = h.y + Math.sin(h.dir) * d
        const tw = Math.min(16, d * Math.tan(h.angle / 2) * 0.6)
        for (const s of [-1, 1]) {
          ctx.moveTo(bx, by)
          ctx.lineTo(bx + Math.cos(h.dir + s * 0.7) * tw, by + Math.sin(h.dir + s * 0.7) * tw)
        }
      }
      ctx.stroke()
    } else if (h.pillar && struck) {
      // an ice crystal rising
      ctx.fillStyle = rgb(T.g, 0.8 * k)
      ctx.beginPath()
      ctx.moveTo(h.x, h.y - h.r * 1.3)
      ctx.lineTo(h.x + h.r * 0.45, h.y)
      ctx.lineTo(h.x, h.y + h.r * 0.35)
      ctx.lineTo(h.x - h.r * 0.45, h.y)
      ctx.closePath()
      ctx.fill()
    } else if (h.row) {
      // ghost pipes rising along the row
      ctx.fillStyle = rgb(struck ? T.g : T.c, (struck ? 0.55 : 0.18) * k + 0.05)
      const top = h.y - h.half
      for (let x = h.x + 30; x < h.x + h.len - 20; x += 46) ctx.fillRect(x, top + h.half * 0.25, 12, h.half * 1.5)
    } else if (h.blade && struck) {
      // the cut: a jagged crack along it
      ctx.strokeStyle = rgb(T.g, 0.9 * k)
      ctx.lineWidth = 2.5
      ctx.beginPath()
      const nx = -h.dy
      const ny = h.dx
      for (let d = 0; d <= h.len; d += 18) {
        const j = (d / 18) % 2 ? 6 : -6
        const x = h.x + h.dx * d + nx * j
        const y = h.y + h.dy * d + ny * j
        if (d) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
      ctx.stroke()
    } else if (h.sector) {
      // the clock's hand along the hour
      ctx.strokeStyle = rgb(T.g, 0.5 + 0.4 * k)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(h.x + Math.cos(h.dir) * h.inner, h.y + Math.sin(h.dir) * h.inner)
      ctx.lineTo(h.x + Math.cos(h.dir) * Math.min(h.range, 600), h.y + Math.sin(h.dir) * Math.min(h.range, 600))
      ctx.stroke()
    }
  }

  // the boss gathering itself: its pattern round it
  function aura(run, e, T, now) {
    const k = e.stage === 'charge' ? 1 : 0.55
    const pulse = 0.5 + 0.5 * Math.sin(now / 120)
    if (e.look === 'bell' || e.look === 'ghost') {
      for (let i = 0; i < 3; i++) {
        const r = e.r + 20 + ((now / 8 + i * 40) % 120)
        ctx.beginPath()
        ctx.arc(e.x, e.y - e.r * 0.4, r, 0, Math.PI * 2)
        ctx.strokeStyle = rgb(T.g, 0.35 * k * (1 - (r - e.r - 20) / 120))
        ctx.lineWidth = 3
        ctx.stroke()
      }
    } else if (e.look === 'eclipse') {
      // the last boss: a turning magic circle under it, an eclipse over it
      magicCircle(e.x, e.y, (e.core ? 150 : 120) * (0.85 + 0.15 * k), T, (0.35 + 0.35 * k) * (e.core ? 1.3 : 1), now)
      const R = e.r * 1.6
      ctx.save()
      ctx.translate(e.x, e.y - e.r * 1.4)
      ctx.beginPath()
      ctx.arc(0, 0, R + 10 + pulse * 6, 0, Math.PI * 2)
      ctx.fillStyle = rgb(T.g, 0.22 * k)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.fillStyle = rgb(T.d, 0.8 * k)
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = rgb(T.g, 0.8 * k)
      ctx.stroke()
      ctx.restore()
    } else if (e.look === 'sun') {
      // a disc and rays (the eclipse: a dark disc in a gold crown)
      const R = e.r * (e.final ? 2 : 1.4)
      ctx.save()
      ctx.translate(e.x, e.y - e.r)
      ctx.rotate(now / 1400)
      ctx.strokeStyle = rgb(T.g, 0.45 * k)
      ctx.lineWidth = 3
      ctx.beginPath()
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R)
        ctx.lineTo(Math.cos(a) * (R + 18 + pulse * 10), Math.sin(a) * (R + 18 + pulse * 10))
      }
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.fillStyle = e.look === 'eclipse' ? rgb(T.d, 0.55 * k) : rgb(T.g, 0.25 * k)
      ctx.fill()
      ctx.lineWidth = 4
      ctx.strokeStyle = rgb(T.g, 0.6 * k)
      ctx.stroke()
      ctx.restore()
    } else if (e.look === 'flower') {
      ctx.strokeStyle = rgb(T.c, 0.4 * k)
      ctx.lineWidth = 2.5
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + now / 2000
        ctx.beginPath()
        ctx.ellipse(e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, 52, 22, a, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else if (e.look === 'web') {
      ctx.strokeStyle = rgb(T.c, 0.4 * k)
      ctx.lineWidth = 1.5
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath()
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 2
          const r = ring * 46
          if (i) ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r)
          else ctx.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r)
        }
        ctx.stroke()
      }
    } else {
      ctx.beginPath()
      ctx.arc(e.x, e.y - e.r * 0.5, e.r * 1.6 + pulse * 8, 0, Math.PI * 2)
      ctx.strokeStyle = rgb(T.g, 0.4 * k)
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }

  // a magic circle: two rings, a star and runes, turning
  function magicCircle(x, y, R, T, a, now) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, 0.55) // lying on the ground
    ctx.rotate(now / 2400)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = rgb(T.g, a)
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.moveTo(R * 0.8, 0)
    ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2)
    // a seven-pointed star
    for (let i = 0; i <= 7; i++) {
      const ang = ((i * 3) / 7) * Math.PI * 2
      if (i) ctx.lineTo(Math.cos(ang) * R * 0.8, Math.sin(ang) * R * 0.8)
      else ctx.moveTo(Math.cos(ang) * R * 0.8, Math.sin(ang) * R * 0.8)
    }
    ctx.stroke()
    ctx.fillStyle = rgb(T.c, a)
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2
      ctx.fillRect(Math.cos(ang) * R * 0.9 - 3, Math.sin(ang) * R * 0.9 - 3, 6, 6)
    }
    ctx.restore()
  }

  // the clock's dial over the whole area
  function dial(B, T, now, a) {
    const cx = (B[0] + B[2]) / 2
    const cy = (B[1] + B[3]) / 2
    const R = Math.min(B[2] - B[0], B[3] - B[1]) * 0.46
    ctx.lineWidth = 2
    ctx.strokeStyle = rgb(T.g, a)
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2)
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2
      ctx.moveTo(cx + Math.cos(ang) * R * 0.82, cy + Math.sin(ang) * R * 0.82)
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R)
    }
    ctx.stroke()
  }

  // ── over everything: the edges of the danger, the safe edges, the moving
  // fronts, the order of the blows, the sparks ──
  function over(run, now, dt, busy) {
    budget = busy ? 0.4 : 1
    const X = run.extra
    if (X && X.boss) {
      world()
      const e = X.boss
      const T = theme(e.look)
      const B = X.box
      ctx.save()
      ctx.beginPath()
      ctx.rect(B[0], B[1], B[2] - B[0], B[3] - B[1])
      ctx.clip()
      for (const h of run.hazards) {
        if (h.owner !== e.id) continue
        const k = nearing(run, h)
        if (h.kind === 'wave') {
          for (const [g, half] of h.gaps) {
            wedge(h.x, h.y, g, half, h.speed * (h.until - h.at))
            ctx.lineWidth = 2
            ctx.strokeStyle = `rgba(${SAFE}, 0.75)`
            ctx.stroke()
          }
          if (run.t >= h.at && run.t <= h.until) {
            const r = frontAt(h, run.t)
            ringArcs(h, r)
            if (!busy) {
              ctx.lineWidth = h.width * 1.9
              ctx.strokeStyle = rgb(T.c, 0.14)
              ctx.stroke()
            }
            ctx.lineWidth = h.width
            // (the eclipse: a dark band in a gold crown)
            ctx.strokeStyle = e.look === 'eclipse' ? rgb(T.d, 0.7) : rgb(T.c, 0.5)
            ctx.stroke()
            if (e.look === 'eclipse') {
              ringArcs(h, r + h.width / 2)
              ctx.lineWidth = 3
              ctx.strokeStyle = rgb(T.g, 0.9)
              ctx.stroke()
              ringArcs(h, Math.max(1, r - h.width / 2))
              ctx.strokeStyle = rgb(T.c, 0.9)
              ctx.stroke()
            }
            ctx.lineWidth = 3
            ctx.strokeStyle = rgb(T.g, 0.95)
            ctx.stroke()
            // sparks along it (not in the gaps)
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * Math.PI * 2
              if (h.gaps.some(([g, half]) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < half)) continue
              const x = h.x + Math.cos(a) * r
              const y = h.y + Math.sin(a) * r
              if (x > B[0] && x < B[2] && y > B[1] && y < B[3]) emit(x, y, 1, e.look, { spd: 40, life: 0.6 })
            }
          } else if (run.t < h.at) {
            // gathering at its source
            ringArcs(h, 10 + 40 * k)
            ctx.lineWidth = 4
            ctx.strokeStyle = rgb(T.g, 0.5 + 0.4 * k)
            ctx.stroke()
          }
          continue
        }
        if (h.kind === 'band') {
          gapRects(h, B, (x, y, w, hh) => {
            ctx.lineWidth = 2
            ctx.strokeStyle = `rgba(${SAFE}, 0.7)`
            ctx.strokeRect(x, y, w, hh)
          })
          if (run.t >= h.at && run.t <= h.until) {
            const f = frontAt(h, run.t)
            // a glow round it, the band itself with dark edges (seen on any ground)
            if (!busy) {
              ctx.fillStyle = rgb(T.c, 0.14)
              bandPieces(h, f, h.width + 24, (x, y, w, hh) => ctx.fillRect(x, y, w, hh))
            }
            ctx.fillStyle = rgb(T.c, 0.55)
            bandPieces(h, f, h.width, (x, y, w, hh) => ctx.fillRect(x, y, w, hh))
            ctx.lineWidth = 2
            ctx.strokeStyle = rgb(T.d, 0.55)
            bandPieces(h, f, h.width, (x, y, w, hh) => ctx.strokeRect(x, y, w, hh))
            if (e.look === 'eclipse') {
              // the rift: a jagged gold crack down its middle
              ctx.strokeStyle = rgb(T.g, 0.95)
              ctx.lineWidth = 2.5
              bandPieces(h, f, h.width, (x, y, w, hh) => {
                ctx.beginPath()
                const along = h.axis === 'x' ? hh : w
                for (let d = 0; d <= along; d += 14) {
                  const j = ((d / 14) % 2 ? 1 : -1) * 7
                  const px = h.axis === 'x' ? x + w / 2 + j : x + d
                  const py = h.axis === 'x' ? y + d : y + hh / 2 + j
                  if (d) ctx.lineTo(px, py)
                  else ctx.moveTo(px, py)
                }
                ctx.stroke()
              })
            }
            // its leading edge, bright, and a fading trail behind
            const dir = Math.sign(h.speed)
            ctx.fillStyle = rgb(T.g, 0.9)
            bandPieces(h, f + (dir * h.width) / 2 - dir * 2, 4, (x, y, w, hh) => ctx.fillRect(x, y, w, hh))
            if (!busy) {
              ctx.fillStyle = rgb(T.c, 0.14)
              bandPieces(h, f - dir * h.width, h.width, (x, y, w, hh) => ctx.fillRect(x, y, w, hh))
            }
            if (e.look === 'sand' || e.look === 'storm' || e.look === 'ghost' || e.look === 'eclipse')
              bandPieces(h, f, h.width, (x, y, w, hh) => {
                if (Math.random() < 0.6) emit(x + Math.random() * w, y + Math.random() * hh, 1, e.look, { spd: 30, life: 0.5, s: e.look === 'sand' ? 1.6 : 2.4 })
              })
          } else if (run.t < h.at) {
            const f = frontAt(h, h.at)
            ctx.lineWidth = 2
            ctx.setLineDash([8, 6])
            ctx.strokeStyle = rgb(T.c, 0.6 + 0.4 * k)
            bandPieces(h, f + (Math.sign(h.speed) * h.width) / 2, h.width, (x, y, w, hh) => ctx.strokeRect(x, y, w, hh))
            ctx.setLineDash([])
          }
          continue
        }
        if (h.kind === 'board' || h.thread) continue
        if (h.safe || h.idle) {
          if (run.t < h.at + 0.2) {
            shape(h)
            ctx.lineWidth = 2
            ctx.strokeStyle = `rgba(${SAFE}, 0.7)`
            ctx.stroke()
          }
          continue
        }
        if (run.t >= h.at) continue
        // the exact edge of a still blow to come: dark under, coloured over
        shape(h)
        ctx.lineWidth = 3.5
        ctx.strokeStyle = 'rgba(25, 15, 25, 0.35)'
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.strokeStyle = rgb(T.c, 0.7 + 0.3 * k)
        ctx.stroke()
      }
      // the order the blows come in
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3
      for (const h of run.hazards) {
        if (h.owner !== e.id || !h.order || run.t >= h.at) continue
        const x = h.kind === 'line' ? h.x + h.dx * h.len * 0.5 : h.kind === 'cone' ? h.x + Math.cos(h.dir) * ((h.inner || 0) + 60) : h.x
        const y = h.kind === 'line' ? h.y + h.dy * h.len * 0.5 : h.kind === 'cone' ? h.y + Math.sin(h.dir) * ((h.inner || 0) + 60) : h.y
        ctx.strokeStyle = 'rgba(255, 250, 240, 0.9)'
        ctx.strokeText(h.order, x, y)
        ctx.fillStyle = rgb(T.d, 1)
        ctx.fillText(h.order, x, y)
      }
      ctx.textBaseline = 'alphabetic'
      ctx.restore()
      // the last boss's core: brighter as it weakens, out when it falls
      if (e.final) core(e, T, now)
    }
    // shock rings and sparks
    if (rings.length || parts.length) world()
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.t += dt
      if (r.t >= r.life) {
        rings.splice(i, 1)
        continue
      }
      const f = r.t / r.life
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r * (0.15 + 0.85 * f), 0, Math.PI * 2)
      ctx.lineWidth = 10 * (1 - f) + 2
      ctx.strokeStyle = rgb(r.c, 0.7 * (1 - f))
      ctx.stroke()
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.t += dt
      if (p.t >= p.life) {
        parts.splice(i, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.96
      p.vy *= 0.96
      ctx.globalAlpha = 1 - p.t / p.life
      ctx.fillStyle = p.col
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s)
    }
    ctx.globalAlpha = 1
  }

  function core(e, T, now) {
    let k = e.state === 'live' ? (e.core ? 1 : 0.5) : e.state === 'down' ? Math.max(0, 1 - e.t / 1.2) : 0.3
    if (e.stage === 'charge' || e.stage === 'strike') k = Math.min(1.3, k + 0.4)
    if (k <= 0) return
    const pulse = 0.75 + 0.25 * Math.sin(now / 90)
    const y = e.y - e.r * 1.1
    ctx.beginPath()
    ctx.arc(e.x, y, 10 + 16 * k * pulse, 0, Math.PI * 2)
    ctx.fillStyle = rgb(T.c, 0.25 * k)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(e.x, y, 5 + 5 * k * pulse, 0, Math.PI * 2)
    ctx.fillStyle = rgb(T.g, 0.7 * k)
    ctx.fill()
  }

  // what this frame's events start
  function event(run, ev) {
    if (ev.type === 'extraAppear') {
      const T = theme(run.extra && run.extra.boss && run.extra.boss.look)
      rings.push({ x: ev.x, y: ev.y, t: 0, life: ev.final ? 0.9 : 0.6, r: ev.final ? 340 : 220, c: T.g })
      if (ev.final) rings.push({ x: ev.x, y: ev.y, t: -0.15, life: 0.9, r: 260, c: T.c })
      emit(ev.x, ev.y, ev.final ? 40 : 24, run.extra && run.extra.boss && run.extra.boss.look, { spd: 160, life: 0.8, s: 3 })
    } else if (ev.type === 'blast' && ev.look) {
      emit(ev.x, ev.y, ev.kind === 'circle' ? 10 : 4, ev.look, { spd: 70, life: 0.7, up: 20 })
    } else if (ev.type === 'phase' && ev.core) {
      const T = theme('eclipse')
      rings.push({ x: ev.x, y: ev.y, t: 0, life: 0.8, r: 260, c: T.g })
    }
  }

  return { under, over, event, reset: () => ((parts.length = 0), (rings.length = 0)) }
}
