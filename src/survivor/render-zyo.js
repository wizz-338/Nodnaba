// MANO SURVIVOR — drawing zyo_'s class change (zyo.js). Reads the run, never
// changes it.
//
// The change: what was out (balls, fighting cats) gathers to Mano, notes of
// many colours swirl in round her and meet, a flash, and the new attack is
// there (all in balance.json → zyo.fxSeconds, by the game's clock, so a pause
// stops it too). Then a few units drawn as the class's power, not as more of
// them: the giant balls in a glow with a trail, a turning shine and embers
// (A: the shield balls on a turning ring); the ninja cats never seen
// running: at each of their slashes a samurai cat with a sword and a long
// headband sweeps across the monster with a few afterimages and is gone, a
// crescent and a cross over it. The skill over the screen: 탱탱 메테오 (a mark on the ground,
// a burning ball falling on it, a blast) or 그림자 분신 (a shadow ninja out of
// a puff, a big X). The 전투력 level shows in the colours (red → gold →
// violet → all colours), the size (zyo.js growth) and more sparks; a level
// up rings round Mano with its number. The two warp holes (D), the blast of
// 최후의 반격 (B). Sparks come from one pool with a cap, fewer on a busy screen.

import { classLevel, growth } from './zyo.js'

const NOTE_COLORS = ['#ff5f8f', '#ffb547', '#6fd389', '#5fb8ff', '#b88bff', '#ff8a5c']
const WARP = ['rgba(120, 90, 255, ', 'rgba(70, 220, 255, ']
const SLASH = 0.24 // s a slash's crescent shows
const STRIKE = 0.32 // s a ninja's blow shows: the samurai cat sweeping past
const MAX_STRIKES = 14
const MAX_SLASHES = 16
const MAX_PARTS = 160
const MAX_IMPACTS = 10
const TAU = Math.PI * 2

// the level's colour: [r, g, b] (all colours turning from level 9)
function tierColor(L, now) {
  if (L >= 9) {
    const h = (now / 6) % 360
    const c = (n) => {
      const k = (n + h / 30) % 12
      return Math.round(255 * (0.55 + 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
    }
    return [c(0), c(8), c(4)]
  }
  if (L >= 6) return [196, 92, 255]
  if (L >= 3) return [240, 150, 30]
  return [255, 92, 70]
}
// 탱탱 메테오, like a spin dash: the ball shows FALL_H px up and FALL_DX px
// to the right SPINUP s before it falls, spinning in place (SPIN rad/s) as it
// swells, then shoots down in FALL s (the mark shows the whole wait); where
// it lands the ground cracks (glowing a moment) and a scorch stays SCORCH s
const SPINUP = 0.1
const FALL = 0.09
const FALL_H = 300
const FALL_DX = 110
const SPIN = 70
const SCORCH = 0.9
const CRACK_GLOW = 0.3
const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`

export function createZyoFx({ ctx, world, put, shadow, drawFriend, lift, font }) {
  const slashes = [] // { x, y, r, a, t, c }
  const strikes = [] // the ninjas' blows: { x, y, face, reach, t, c, L, G, id }
  const rings = [] // { x, y, r, t, life, c, w }
  const words = [] // { x, y, text, t, life, c, big }
  const parts = [] // { x, y, vx, vy, t, life, s, c, g }
  const meteors = [] // { x, y, r, t, land }
  const clones = [] // { x, y, r, t, land, face }
  const flashes = [] // { x, y, r, t, life }
  const scorches = [] // { x, y, r, t, cracks } where a meteor landed
  const puffs = [] // { x, y, vx, vy, r, t, life } dust off the ground
  const trails = new Map() // a giant ball's last places
  let impacts = 0
  let budget = 1
  let flashT = 0 // the units flash a moment at a level up

  const spark = (x, y, vx, vy, life, s, c, g = 0) => {
    if (parts.length < MAX_PARTS * budget) parts.push({ x, y, vx, vy, t: 0, life, s, c, g })
  }
  const burst = (x, y, n, speed, c, life = 0.45, s = 2) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      const v = speed * (0.4 + Math.random() * 0.8)
      spark(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * 0.2, life * (0.6 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.8), c, 120)
    }
  }

  // the cracks a meteor leaves: jagged lines out of the middle, flattened to
  // the ground ([x, y] points from its middle)
  const cracks = (r) => {
    const out = []
    const n = 6 + Math.floor(Math.random() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (Math.random() - 0.5) * 0.5
      const len = r * (1.1 + Math.random() * 0.9)
      const line = []
      for (let j = 1; j <= 3; j++) {
        const d = (len * j) / 3
        const w = (Math.random() - 0.5) * r * 0.35
        line.push([Math.cos(a) * d - Math.sin(a) * w, (Math.sin(a) * d + Math.cos(a) * w) * 0.5])
      }
      out.push(line)
    }
    return out
  }

  // a note: a head, a stem and a flag (two heads joined for ♫)
  function note(x, y, s, c, a, twin) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.scale(s, s)
    ctx.fillStyle = c
    ctx.strokeStyle = c
    ctx.lineWidth = 1.6
    const head = (hx) => {
      ctx.beginPath()
      ctx.ellipse(hx, 0, 3.4, 2.5, -0.4, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(hx + 3, -0.5)
      ctx.lineTo(hx + 3, -11)
      ctx.stroke()
    }
    head(0)
    if (twin) {
      head(7)
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(3, -11)
      ctx.lineTo(10, -12.5)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(3, -11)
      ctx.quadraticCurveTo(8, -8, 7, -4)
      ctx.stroke()
    }
    ctx.restore()
  }

  // a soft glow: a radial gradient disc
  function glow(x, y, r, c, a) {
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r)
    g.addColorStop(0, rgba(c, a))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }

  // the change's moment: k from 0 to 1 over fxSeconds
  function drawChange(run, now) {
    const C = run.cls
    const Z = run.D.balance.zyo
    const T = run.t - C.at
    if (T > Z.fxSeconds + 0.5) return
    const p = run.player
    const k = Math.min(1, T / Z.fxSeconds)
    world()
    // what was out gathers to her and fades (the first third)
    const g = Math.min(1, T / (Z.fxSeconds * 0.35))
    if (g < 1)
      for (const o of C.gather) {
        const e = g * g
        const x = o.x + (p.x - o.x) * e
        const y = o.y + (p.y - 10 - o.y) * e
        ctx.globalAlpha = 1 - g
        if (o.kind === 'ball') put('ball', x, y, Math.max(0.3, ((o.r || 6) * 2) / 24) * (1 - g * 0.6))
        else put('xp_gem', x, y, 0.6)
      }
    ctx.globalAlpha = 1
    world()
    // a ring of light grows under her while the notes come
    glow(p.x, p.y - 10, 30 + 60 * k, [255, 220, 150], 0.25 + 0.25 * k)
    // the notes: they come in on a spiral and meet over her head
    const N = 18
    for (let i = 0; i < N; i++) {
      const start = (i / N) * 0.45
      const q = (k - start) / 0.5
      if (q <= 0 || q >= 1.05) continue
      const a = (i / N) * TAU + q * 3.2
      const R = 140 * (1 - q) + 6
      const x = p.x + Math.cos(a) * R
      const y = p.y - 16 + Math.sin(a) * R * 0.75
      ctx.globalAlpha = Math.min(1, q * 4) * (q > 0.9 ? Math.max(0, (1.05 - q) / 0.15) : 1)
      note(x, y, 1.4 + 0.6 * Math.sin(now / 120 + i), NOTE_COLORS[i % NOTE_COLORS.length], Math.sin(now / 200 + i) * 0.35, i % 3 === 0)
    }
    ctx.globalAlpha = 1
    // the meeting: a bright burst of colour
    if (k > 0.82) {
      const f = Math.min(1, (k - 0.82) / 0.18)
      const r = 10 + f * 90
      const grd = ctx.createRadialGradient(p.x, p.y - 14, 2, p.x, p.y - 14, r)
      grd.addColorStop(0, `rgba(255, 255, 255, ${0.95 * (1 - f)})`)
      grd.addColorStop(0.5, `rgba(255, 200, 120, ${0.55 * (1 - f)})`)
      grd.addColorStop(1, 'rgba(180, 120, 255, 0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(p.x, p.y - 14, r, 0, TAU)
      ctx.fill()
    }
  }

  // D: the two holes, the same colours, turning (on the ground)
  function drawWarps(run, now) {
    const C = run.cls
    if (!C.warps) return
    world()
    const R = run.D.balance.zyo.warp.radius
    const locked = C.warpLock
    for (let i = 0; i < 2; i++) {
      const h = C.warps[i]
      const dim = locked === i || C.warpCd > 0 ? 0.55 : 1
      glow(h.x, h.y, R * 2.2, [140, 100, 255], 0.25 * dim)
      for (let j = 0; j < 3; j++) {
        const a = now / (500 - j * 90) + j * 2.1 + i
        const rr = R * (1.1 - j * 0.28)
        ctx.strokeStyle = WARP[j % 2] + 0.85 * dim + ')'
        ctx.lineWidth = 3 - j * 0.6
        ctx.beginPath()
        ctx.ellipse(h.x, h.y, rr, rr * 0.55, 0, a, a + Math.PI * 1.4)
        ctx.stroke()
      }
      const grd = ctx.createRadialGradient(h.x, h.y, 1, h.x, h.y, R)
      grd.addColorStop(0, `rgba(30, 10, 60, ${0.75 * dim})`)
      grd.addColorStop(1, 'rgba(90, 60, 200, 0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.ellipse(h.x, h.y, R, R * 0.55, 0, 0, TAU)
      ctx.fill()
    }
  }

  // the shadows of what it has out (before the ground's shadows are laid)
  function shadows(run) {
    const C = run.cls
    if (!C || run.t < C.fxEnd) return
    const G = growth(run)
    for (const u of C.units) shadow(u.x, u.y, C.form === 'ball' ? run.D.balance.zyo.ball.radius * 0.9 * G : 8, C.form === 'ball' ? 7 * G : 2.6, 0.22)
    for (const s of C.shield) shadow(s.x, s.y, run.D.balance.zyo.shield.radius * 0.9 * G, 6, 0.18)
  }

  // under the standing things: the warp holes, the skill's marks, auras
  function under(run, now) {
    const C = run.cls
    if (!C) return
    if (C.k === 'D') drawWarps(run, now)
    world()
    // where meteors fell: a dark scorch, fading
    for (let i = scorches.length - 1; i >= 0; i--) {
      const sc = scorches[i]
      if (sc.t >= SCORCH) {
        scorches.splice(i, 1)
        continue
      }
      const fade = 1 - sc.t / SCORCH
      ctx.fillStyle = `rgba(40, 20, 10, ${0.32 * fade})`
      ctx.beginPath()
      ctx.ellipse(sc.x, sc.y, sc.r * 0.9, sc.r * 0.5, 0, 0, TAU)
      ctx.fill()
      // the cracks out of it, glowing hot a moment
      ctx.lineJoin = 'round'
      for (const [col, w, a] of [
        ['60, 28, 12', 3, 0.75 * fade],
        ['255, 170, 60', 1.6, Math.max(0, 1 - sc.t / CRACK_GLOW)],
      ]) {
        if (a <= 0) continue
        ctx.strokeStyle = `rgba(${col}, ${a})`
        ctx.lineWidth = w
        ctx.beginPath()
        for (const line of sc.cracks) {
          ctx.moveTo(sc.x, sc.y)
          for (const [x, y] of line) ctx.lineTo(sc.x + x, sc.y + y)
        }
        ctx.stroke()
      }
    }
    // a meteor's mark: a ring that closes in fast, a cross in it
    for (const m of meteors) {
      const k = Math.min(1, m.t / m.land)
      const rr = m.r * (1.5 - 0.5 * k * k)
      ctx.strokeStyle = `rgba(255, 70, 50, ${0.4 + 0.5 * k})`
      ctx.lineWidth = 2 + 1.5 * k
      ctx.setLineDash([6, 5])
      ctx.lineDashOffset = -now / 16
      ctx.beginPath()
      ctx.ellipse(m.x, m.y, rr, rr * 0.55, 0, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = `rgba(255, 80, 40, ${0.12 + 0.18 * k})`
      ctx.beginPath()
      ctx.ellipse(m.x, m.y, m.r, m.r * 0.55, 0, 0, TAU)
      ctx.fill()
    }
    if (run.t < C.fxEnd) return
    const L = classLevel(run)
    const c = tierColor(L, now)
    const G = growth(run)
    // (faint over Mano: giant() below)
    const p = run.player
    const R = run.D.balance.zyo.ball.radius * G
    if (C.form !== 'ninja') for (const u of C.units) glow(u.x, u.y - lift, R * 2, c, (0.28 + 0.08 * Math.sin(now / 120 + u.id)) * (Math.hypot(u.x - p.x, u.y - p.y) < R + 26 ? 0.3 : 1))
  }

  // one giant ball: its trail, its glow, the ball, a turning shine, embers.
  // Over Mano it is see-through, so she and the warnings round her are
  // always seen (asked for: a ball by her hid her in a boss's pattern)
  function giant(run, u, r, now, c, L, key) {
    const p = run.player
    const A = Math.hypot(u.x - p.x, u.y - p.y) < r + 26 ? 0.3 : 1
    let tr = trails.get(key)
    if (!tr) trails.set(key, (tr = []))
    tr.push(u.x, u.y)
    if (tr.length > 14) tr.splice(0, 2)
    for (let i = 0; i + 1 < tr.length - 2; i += 2) {
      const k = i / tr.length
      ctx.globalAlpha = (0.1 + 0.35 * k) * A
      ctx.fillStyle = rgba(c, 1)
      ctx.beginPath()
      ctx.arc(tr[i], tr[i + 1] - lift, r * (0.45 + 0.5 * k), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = A
    put('ball', u.x, u.y - lift, (r * 2) / 24, { alpha: A })
    world()
    ctx.globalAlpha = A
    // the shine: a bright arc turning over the ball
    const a = now / 140 + (u.id || 0)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.lineWidth = Math.max(2, r * 0.14)
    ctx.beginPath()
    ctx.arc(u.x, u.y - lift, r * 0.72, a, a + 0.9)
    ctx.stroke()
    // its edge in the level's colour, flashing at a level up
    ctx.strokeStyle = rgba(c, 0.6 + 0.4 * Math.min(1, flashT * 3))
    ctx.lineWidth = 2 + flashT * 6
    ctx.beginPath()
    ctx.arc(u.x, u.y - lift, r * 1.05, 0, TAU)
    ctx.stroke()
    // sparks round it from level 3, more with the level
    const n = L >= 3 ? Math.min(6, 2 + Math.floor(L / 3)) : 0
    for (let i = 0; i < n; i++) {
      const b = now / 260 + (i / n) * TAU
      const x = u.x + Math.cos(b) * r * 1.35
      const y = u.y - lift + Math.sin(b) * r * 0.8
      ctx.fillStyle = rgba(c, 0.95)
      ctx.beginPath()
      ctx.arc(x, y, 2.2, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    if (A === 1 && Math.random() < 0.35 * budget) spark(u.x + (Math.random() - 0.5) * r, u.y - lift + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 30, -20 - Math.random() * 30, 0.5, 2 + L * 0.15, c, -20)
  }

  // the units, over the monsters
  function over(run, now, dt) {
    budget = run.balls.length > 0 || run.enemies.length > 120 ? 0.6 : 1
    flashT = Math.max(0, flashT - dt)
    for (const sc of scorches) sc.t += dt
    const C = run.cls
    if (C) {
      const Z = run.D.balance.zyo
      const L = classLevel(run)
      const c = tierColor(L, now)
      const G = growth(run)
      if (run.t >= C.fxEnd) {
        if (C.form === 'ball') for (const u of C.units) giant(run, u, Z.ball.radius * G, now, c, L, 'u' + u.id)
        // (the ninja cats are never seen running: each of their blows shows
        // as a samurai cat sweeping past the monster, below)
        if (C.shield.length) {
          world()
          const p = run.player
          const R = Z.shield.orbit
          // the ring: a turning band of light
          ctx.lineWidth = 3
          for (let i = 0; i < 3; i++) {
            const a = now / 300 + (i / 3) * TAU
            ctx.strokeStyle = rgba(c, 0.55)
            ctx.beginPath()
            ctx.arc(p.x, p.y - 6, R, a, a + 1.2)
            ctx.stroke()
          }
          ctx.strokeStyle = rgba(c, 0.18)
          ctx.lineWidth = 8
          ctx.beginPath()
          ctx.arc(p.x, p.y - 6, R, 0, TAU)
          ctx.stroke()
          C.shield.forEach((sb, i) => giant(run, sb, Z.shield.radius * G, now, c, L, 's' + i))
        }
      }
      drawChange(run, now)
    } else if (trails.size) trails.clear()
    world()
    // the meteors falling: a burning ball and its fiery tail
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]
      m.t += dt
      if (m.t >= m.land) {
        meteors.splice(i, 1)
        continue
      }
      // up high it spins in place, swelling, then it shoots down steeply,
      // faster and faster, with a streak as long as it is fast
      const t0 = m.land - FALL
      if (m.t < t0 - SPINUP) continue
      const up = m.t < t0
      const f = up ? 0 : Math.min(1, (m.t - t0) / FALL)
      const k = f ** 1.6
      const swell = up ? 0.55 + 0.45 * ((m.t - (t0 - SPINUP)) / SPINUP) : 1
      const x = m.x + FALL_DX * (1 - k)
      const y = m.y - lift - FALL_H * (1 - k)
      const len = up ? 0 : 40 + 220 * f
      const ux = FALL_DX / Math.hypot(FALL_DX, FALL_H)
      const uy = FALL_H / Math.hypot(FALL_DX, FALL_H)
      const tail = ctx.createLinearGradient(x, y, x + ux * (len || 1), y - uy * (len || 1))
      tail.addColorStop(0, 'rgba(255, 255, 230, 0.95)')
      tail.addColorStop(0.25, 'rgba(255, 170, 70, 0.8)')
      tail.addColorStop(1, 'rgba(255, 70, 40, 0)')
      ctx.strokeStyle = tail
      ctx.lineWidth = m.r * 0.85
      ctx.lineCap = 'round'
      if (len) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + ux * len, y - uy * len)
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
      const R = m.r * swell
      glow(x, y, R * 1.6, [255, 200, 120], 0.75)
      // afterimages along the way it came
      if (!up)
        for (let j = 3; j >= 1; j--) {
          const back = j * m.r * 0.9 * (0.4 + k)
          put('ball', x + ux * back, y - uy * back, (m.r * 1.15) / 24, { alpha: 0.4 - j * 0.1 })
        }
      put('ball', x, y, (R * 1.15) / 24)
      world()
      // the spin: bright arcs whirling round it, and inside it
      const spin = m.t * SPIN + m.x
      ctx.lineCap = 'round'
      for (let j = 0; j < 3; j++) {
        const a0 = spin + (j * TAU) / 3
        ctx.strokeStyle = j ? 'rgba(255, 210, 120, 0.85)' : 'rgba(255, 255, 255, 0.95)'
        ctx.lineWidth = 3.5
        ctx.beginPath()
        ctx.arc(x, y, R * 1.35, a0, a0 + 1.6)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, R * 0.6, -spin, -spin + 2.2)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
    // the shadow ninjas: out of a puff beside the monster, a moment there
    for (let i = clones.length - 1; i >= 0; i--) {
      const cl = clones[i]
      cl.t += dt
      if (cl.t >= cl.land + 0.25) {
        clones.splice(i, 1)
        continue
      }
      if (cl.t < cl.land - 0.3) continue
      const k = (cl.t - (cl.land - 0.3)) / 0.55
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 4, (1 - k) * 4)) * 0.85
      glow(cl.x - cl.face * 18, cl.y - 6, 20, [110, 40, 200], 0.6)
      drawFriend({ x: cl.x - cl.face * (18 - 20 * Math.min(1, k * 2)), y: cl.y, size: 1.1, mode: k > 0.5 ? 'attack' : 'move', atk: (k - 0.5) * 0.3, atkDur: 0.16, step: 0, moving: k <= 0.5, dir: 'e', face: cl.face, id: 7, rec: 0 }, now)
      ctx.globalAlpha = 1
      world()
    }
    // the ninjas' blows: a samurai cat sweeping across the monster, sword
    // swinging, a few afterimages behind it, there a moment and gone
    for (let i = strikes.length - 1; i >= 0; i--) {
      const st = strikes[i]
      st.t += dt
      if (st.t >= STRIKE) {
        strikes.splice(i, 1)
        continue
      }
      const k = st.t / STRIKE
      // (across it fast, then a short pose, fading)
      const at = (q) => st.x + st.face * st.reach * (Math.min(1, Math.max(0, q) / 0.45) * 2 - 1)
      const fade = k < 0.12 ? k / 0.12 : k > 0.6 ? (1 - k) / 0.4 : 1
      for (let j = 3; j >= 0; j--) {
        const q = k - j * 0.07
        if (q < 0) continue
        ctx.globalAlpha = fade * (j ? 0.32 - j * 0.08 : 1)
        drawFriend({ x: at(q), y: st.y, size: 1.15 * st.G, mode: 'attack', atk: Math.min(0.15, q * 0.4), atkDur: 0.16, step: 0, moving: false, dir: 'e', face: st.face, id: st.id, rec: 0 }, now)
      }
      world()
      // the sword: a long blade from its paws, swung through the monster
      const x = at(k)
      const y = st.y - 12 * st.G
      const sw = -1.1 + 2.0 * Math.min(1, k / 0.5)
      const a = st.face > 0 ? sw : Math.PI - sw
      const L = 30 * st.G
      ctx.globalAlpha = fade
      ctx.lineCap = 'round'
      ctx.strokeStyle = rgba(st.c, 0.55)
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L)
      ctx.stroke()
      ctx.strokeStyle = '#f4f6ff'
      ctx.lineWidth = 2.4
      ctx.stroke()
      ctx.strokeStyle = '#3a2a1e'
      ctx.lineWidth = 3.4
      ctx.beginPath()
      ctx.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5)
      ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3)
      ctx.stroke()
      // its headband, the tails flying behind
      ctx.strokeStyle = rgba(st.L >= 3 ? st.c : [214, 58, 58], 1)
      ctx.lineWidth = 2.2
      const hx = x
      const hy = st.y - 15 * st.G
      ctx.beginPath()
      ctx.moveTo(hx - 5, hy)
      ctx.lineTo(hx + 5, hy)
      ctx.moveTo(hx - st.face * 5, hy)
      ctx.quadraticCurveTo(hx - st.face * 14, hy - 4, hx - st.face * 22, hy + 1)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
    ctx.globalAlpha = 1
    // the slashes: a bright crescent and a crossing one
    for (let i = slashes.length - 1; i >= 0; i--) {
      const s = slashes[i]
      s.t += dt
      if (s.t >= SLASH) {
        slashes.splice(i, 1)
        continue
      }
      const k = s.t / SLASH
      ctx.globalAlpha = 1 - k
      for (const [da, col, w] of [
        [0, '#ffffff', 4.5],
        [Math.PI / 2, rgba(s.c, 1), 3],
      ]) {
        ctx.strokeStyle = col
        ctx.lineWidth = w * (1 - k) + 1
        ctx.beginPath()
        ctx.arc(s.x, s.y - 8, s.r * (0.8 + 0.5 * k), s.a + da - 1.2, s.a + da + 1.2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    // the big ones: an X across the monster (그림자 분신), a blast (메테오)
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]
      f.t += dt
      if (f.t >= f.life) {
        flashes.splice(i, 1)
        continue
      }
      const k = f.t / f.life
      if (f.kind === 'x') {
        const len = f.r * (0.6 + 1.2 * Math.min(1, k * 3))
        ctx.globalAlpha = 1 - k
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          for (const [col, w] of [
            ['rgba(130, 60, 255, 0.9)', 9],
            ['#ffffff', 4],
          ]) {
            ctx.strokeStyle = col
            ctx.lineWidth = w * (1 - k * 0.7)
            ctx.beginPath()
            ctx.moveTo(f.x - Math.cos(a) * len, f.y - 8 - Math.sin(a) * len)
            ctx.lineTo(f.x + Math.cos(a) * len, f.y - 8 + Math.sin(a) * len)
            ctx.stroke()
          }
        }
      } else {
        ctx.globalAlpha = 1 - k
        glow(f.x, f.y - 6, f.r * (0.8 + 0.8 * k), [255, 240, 200], 0.9)
        glow(f.x, f.y - 6, f.r * (1 + k), [255, 120, 40], 0.6)
      }
    }
    ctx.globalAlpha = 1
    // sparks
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]
      q.t += dt
      if (q.t >= q.life) {
        parts.splice(i, 1)
        continue
      }
      q.vy += q.g * dt
      q.x += q.vx * dt
      q.y += q.vy * dt
      ctx.globalAlpha = 1 - q.t / q.life
      ctx.fillStyle = rgba(q.c, 1)
      ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s)
    }
    ctx.globalAlpha = 1
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.t += dt
      if (r.t >= r.life) {
        rings.splice(i, 1)
        continue
      }
      const k = r.t / r.life
      ctx.globalAlpha = 1 - k
      ctx.strokeStyle = r.c
      ctx.lineWidth = (r.w || 8) * (1 - k) + 2
      ctx.beginPath()
      const rr = r.r * (0.15 + 0.85 * Math.sqrt(k))
      if (r.ground) ctx.ellipse(r.x, r.y, rr, rr * 0.45, 0, 0, TAU)
      else ctx.arc(r.x, r.y, rr, 0, TAU)
      ctx.stroke()
    }
    impacts = rings.length
    // dust off the ground: soft puffs rolling out, swelling, fading
    for (let i = puffs.length - 1; i >= 0; i--) {
      const q = puffs[i]
      q.t += dt
      if (q.t >= q.life) {
        puffs.splice(i, 1)
        continue
      }
      const k = q.t / q.life
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vx *= 1 - 4 * dt
      q.vy *= 1 - 4 * dt
      ctx.globalAlpha = 0.55 * (1 - k)
      ctx.fillStyle = '#b39a7f'
      ctx.beginPath()
      ctx.arc(q.x, q.y - 4, q.r * (1 + k * 1.4), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.textAlign = 'center'
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i]
      w.t += dt
      if (w.t >= w.life) {
        words.splice(i, 1)
        continue
      }
      const k = w.t / w.life
      const pop = w.t < 0.15 ? 0.6 + (w.t / 0.15) * 0.6 : w.t < 0.3 ? 1.2 - ((w.t - 0.15) / 0.15) * 0.2 : 1
      ctx.globalAlpha = Math.min(1, (1 - k) * 3)
      ctx.font = font
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(255, 248, 232, 0.95)'
      ctx.save()
      ctx.translate(w.x, w.y - k * 16)
      ctx.scale(pop * (w.big ? 1.35 : 1), pop * (w.big ? 1.35 : 1))
      ctx.strokeText(w.text, 0, 0)
      ctx.fillStyle = w.c
      ctx.fillText(w.text, 0, 0)
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  function event(run, ev) {
    const C = run.cls
    const now = performance.now()
    if (ev.type === 'slash') {
      if (slashes.length < MAX_SLASHES) slashes.push({ x: ev.x, y: ev.y, r: ev.r, a: Math.random() * TAU, t: 0, c: tierColor(classLevel(run), now) })
      if (strikes.length < MAX_STRIKES * budget) strikes.push({ x: ev.x, y: ev.y, face: ev.face || 1, reach: ev.r * 0.9 + 10, t: 0, c: tierColor(classLevel(run), now), L: classLevel(run), G: growth(run), id: strikes.length })
      burst(ev.x, ev.y - 8, 4, 90, [200, 160, 255], 0.3)
    } else if (ev.type === 'hit' && (ev.by === 'giant' || ev.by === 'shield') && impacts < MAX_IMPACTS) {
      // a giant ball's blow: a small shock ring and sparks
      if (Math.random() < 0.5) {
        const c = tierColor(classLevel(run), now)
        rings.push({ x: ev.x, y: ev.y, r: 26, t: 0, life: 0.22, c: rgba(c, 0.9), w: 4 })
        burst(ev.x, ev.y, 3, 110, c, 0.3)
      }
    } else if (ev.type === 'skillCast' && C) {
      for (const s of ev.list) {
        if (ev.kind === 'ball') meteors.push({ x: s.x, y: s.y, r: s.r, t: 0, land: s.at })
        else clones.push({ x: s.x, y: s.y, r: s.r, t: 0, land: s.at, face: Math.random() < 0.5 ? 1 : -1 })
      }
      words.push({ x: ev.x, y: ev.y - 58, text: run.D.zyo.skills[ev.kind], t: 0, life: 0.9, c: ev.kind === 'ball' ? '#d2452a' : '#7a3fd1' })
    } else if (ev.type === 'skillHit') {
      if (ev.kind === 'ball') {
        // the landing: a white-hot flash, a fast shock ring and a wider
        // faint one, sparks and grit thrown out, a scorch left behind
        flashes.push({ x: ev.x, y: ev.y, r: ev.r * 1.25, t: 0, life: 0.22, kind: 'blast' })
        rings.push({ x: ev.x, y: ev.y - 4, r: ev.r * 2, t: 0, life: 0.22, c: 'rgba(255, 245, 210, 1)', w: 9 })
        rings.push({ x: ev.x, y: ev.y - 4, r: ev.r * 2.8, t: 0, life: 0.38, c: 'rgba(255, 130, 50, 0.7)', w: 5 })
        burst(ev.x, ev.y - 6, 14, 340, [255, 200, 90], 0.32, 3)
        burst(ev.x, ev.y - 6, 7, 180, [110, 80, 70], 0.45, 3.5)
        // on the ground: flattened shock rings, cracks, dust rolling out
        rings.push({ x: ev.x, y: ev.y, r: ev.r * 3.2, t: 0, life: 0.32, c: 'rgba(255, 235, 190, 0.95)', w: 7, ground: true })
        rings.push({ x: ev.x, y: ev.y, r: ev.r * 2.2, t: 0, life: 0.5, c: 'rgba(150, 110, 80, 0.8)', w: 10, ground: true })
        if (scorches.length < 24) scorches.push({ x: ev.x, y: ev.y, r: ev.r, t: 0, cracks: cracks(ev.r) })
        for (let j = 0; j < 9 && puffs.length < 90; j++) {
          const a = (j / 9) * TAU + Math.random() * 0.4
          const v = 90 + Math.random() * 80
          puffs.push({ x: ev.x + Math.cos(a) * ev.r * 0.6, y: ev.y + Math.sin(a) * ev.r * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.45 - 20, r: 5 + Math.random() * 5, t: 0, life: 0.5 + Math.random() * 0.2 })
        }
      } else {
        flashes.push({ x: ev.x, y: ev.y, r: ev.r, t: 0, life: 0.32, kind: 'x' })
        burst(ev.x, ev.y - 8, 10, 200, [190, 140, 255], 0.4, 2.5)
        burst(ev.x, ev.y - 8, 5, 90, [60, 30, 90], 0.5, 4)
      }
    } else if (ev.type === 'classReady') {
      rings.push({ x: ev.x, y: ev.y - 10, r: 110, t: 0, life: 0.6, c: 'rgba(255, 190, 90, 0.95)', w: 12 })
      burst(ev.x, ev.y - 10, 24, 240, [255, 220, 140], 0.7, 3)
      words.push({ x: ev.x, y: ev.y - 50, text: `${run.D.upgrades.options['cls' + ev.k].name}!`, t: 0, life: 1.8, c: '#8a3fd1', big: true })
    } else if (ev.type === 'powerUp' && C) {
      const c = tierColor(ev.level, now)
      flashT = 0.5
      rings.push({ x: ev.x, y: ev.y - 10, r: 120, t: 0, life: 0.6, c: rgba(c, 0.95), w: 12 })
      rings.push({ x: ev.x, y: ev.y - 10, r: 70, t: 0, life: 0.45, c: 'rgba(255, 255, 255, 0.9)', w: 6 })
      burst(ev.x, ev.y - 10, 20, 220, c, 0.6, 3)
      for (const u of C.units) burst(u.x, u.y - 8, 8, 140, c, 0.5, 3)
      words.push({ x: ev.x, y: ev.y - 52, text: `${run.D.upgrades.options['cls' + C.k].name} Lv.${ev.level}!`, t: 0, life: 1.4, c: rgba(c, 1), big: true })
    } else if (ev.type === 'revive') {
      rings.push({ x: ev.x, y: ev.y - 8, r: ev.r, t: 0, life: 0.7, c: 'rgba(255, 140, 40, 0.95)', w: 14 })
      rings.push({ x: ev.x, y: ev.y - 8, r: ev.r * 0.6, t: 0, life: 0.5, c: 'rgba(255, 240, 180, 0.95)' })
      flashes.push({ x: ev.x, y: ev.y, r: ev.r * 0.7, t: 0, life: 0.5, kind: 'blast' })
      burst(ev.x, ev.y - 8, 30, 320, [255, 170, 70], 0.7, 3.5)
      words.push({ x: ev.x, y: ev.y - 50, text: `${run.D.zyo.classes.B.special}!`, t: 0, life: 1.6, c: '#d2452a', big: true })
    } else if (ev.type === 'warp') {
      rings.push({ x: ev.from.x, y: ev.from.y, r: 36, t: 0, life: 0.35, c: 'rgba(120, 90, 255, 0.9)' })
      rings.push({ x: ev.to.x, y: ev.to.y, r: 50, t: 0, life: 0.45, c: 'rgba(70, 220, 255, 0.9)' })
      burst(ev.to.x, ev.to.y - 8, 14, 180, [120, 200, 255], 0.45, 2.5)
    }
  }

  const reset = () => {
    for (const a of [slashes, strikes, rings, words, parts, meteors, clones, flashes, scorches, puffs]) a.length = 0
    trails.clear()
  }
  return { shadows, under, over, event, reset }
}
