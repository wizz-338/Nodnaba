// MANO SURVIVOR — drawing zyo_'s class change (zyo.js). Reads the run, never
// changes it.
//
// The change: what was out (balls, fighting cats) gathers to Mano, notes of
// many colours swirl in round her and meet, a flash, and the new attack is
// there (all in balance.json → zyo.fxSeconds, by the game's clock, so a pause
// stops it too). Then: the giant balls (the red ball, big, with a shadow),
// the shield balls round Mano (A), the ninja cats (the friend cat with a red
// headband, a short afterimage and a crescent at each slash), the two warp
// holes (D) and the blast of 최후의 반격 (B). A handful of things at most,
// whatever the build.

const NOTE_COLORS = ['#ff5f8f', '#ffb547', '#6fd389', '#5fb8ff', '#b88bff', '#ff8a5c']
const WARP = ['rgba(120, 90, 255, ', 'rgba(70, 220, 255, ']
const CRESCENT = 0.18 // s a slash's crescent shows
const MAX_CRESCENTS = 12

export function createZyoFx({ ctx, world, put, shadow, drawFriend, lift, font }) {
  const crescents = [] // { x, y, r, a, t }
  const rings = [] // { x, y, r, t, life, c }
  const words = [] // { x, y, text, t, life, c }

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
      ctx.ellipse(hx, 0, 3.4, 2.5, -0.4, 0, Math.PI * 2)
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
    // the notes: they come in on a spiral and meet over her head
    const N = 14
    for (let i = 0; i < N; i++) {
      const start = (i / N) * 0.45
      const q = (k - start) / 0.5
      if (q <= 0 || q >= 1.05) continue
      const a = (i / N) * Math.PI * 2 + q * 3.2
      const R = 120 * (1 - q) + 6
      const x = p.x + Math.cos(a) * R
      const y = p.y - 16 + Math.sin(a) * R * 0.75
      ctx.globalAlpha = Math.min(1, q * 4) * (q > 0.9 ? Math.max(0, (1.05 - q) / 0.15) : 1)
      note(x, y, 1.3 + 0.5 * Math.sin(now / 120 + i), NOTE_COLORS[i % NOTE_COLORS.length], Math.sin(now / 200 + i) * 0.35, i % 3 === 0)
    }
    ctx.globalAlpha = 1
    // the meeting: a bright burst of colour
    if (k > 0.82) {
      const f = Math.min(1, (k - 0.82) / 0.18)
      const r = 10 + f * 70
      const grd = ctx.createRadialGradient(p.x, p.y - 14, 2, p.x, p.y - 14, r)
      grd.addColorStop(0, `rgba(255, 255, 255, ${0.9 * (1 - f)})`)
      grd.addColorStop(0.5, `rgba(255, 200, 120, ${0.5 * (1 - f)})`)
      grd.addColorStop(1, 'rgba(180, 120, 255, 0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(p.x, p.y - 14, r, 0, Math.PI * 2)
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
      ctx.ellipse(h.x, h.y, R, R * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // the shadows of what it has out (before the ground's shadows are laid)
  function shadows(run) {
    const C = run.cls
    if (!C || run.t < C.fxEnd) return
    for (const u of C.units) shadow(u.x, u.y, C.form === 'ball' ? run.D.balance.zyo.ball.radius * 0.9 : 8, C.form === 'ball' ? 7 : 2.6, 0.22)
    for (const s of C.shield) shadow(s.x, s.y, run.D.balance.zyo.shield.radius * 0.9, 6, 0.18)
  }

  // under the standing things: the warp holes
  function under(run, now) {
    const C = run.cls
    if (C && C.k === 'D') drawWarps(run, now)
  }

  // the units, over the monsters
  function over(run, now, dt) {
    const C = run.cls
    if (C) {
      const Z = run.D.balance.zyo
      if (run.t >= C.fxEnd) {
        if (C.form === 'ball') {
          const s = (Z.ball.radius * 2) / 24
          for (const u of C.units) put('ball', u.x, u.y - lift, s)
        } else
          for (const u of C.units) {
            // the afterimage: a few faint copies where it just was
            for (let i = 0; i + 1 < u.trail.length; i += 2) {
              ctx.globalAlpha = 0.12 + (0.2 * i) / u.trail.length
              drawFriend({ x: u.trail[i], y: u.trail[i + 1], size: 1.1, mode: 'move', step: 0, moving: true, dir: 'e', face: u.face, id: u.id, rec: 0 }, now)
            }
            ctx.globalAlpha = 1
            const moving = u.trail.length > 0
            drawFriend({ x: u.x, y: u.y, size: 1.1, mode: u.slash > 0 ? 'attack' : 'move', atk: 0.16 - u.slash, atkDur: 0.16, step: now / 8, moving, dir: 'e', face: u.face, id: u.id, rec: 0 }, now)
            // the ninja's headband: a red band with its two tails flying back
            world()
            ctx.strokeStyle = '#d23a3a'
            ctx.lineWidth = 2
            const hx = u.x + u.face * 1
            const hy = u.y - 15
            ctx.beginPath()
            ctx.moveTo(hx - 5, hy)
            ctx.lineTo(hx + 5, hy)
            ctx.moveTo(hx - u.face * 5, hy)
            ctx.quadraticCurveTo(hx - u.face * 11, hy - 3 + Math.sin(now / 90 + u.id) * 2, hx - u.face * 16, hy + 1)
            ctx.stroke()
          }
        if (C.shield.length) {
          const s = (Z.shield.radius * 2) / 24
          world()
          const p = run.player
          ctx.strokeStyle = 'rgba(255, 120, 120, 0.25)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y - 6, Z.shield.orbit, 0, Math.PI * 2)
          ctx.stroke()
          for (const sb of C.shield) put('ball', sb.x, sb.y - lift, s)
        }
      }
      drawChange(run, now)
    }
    // crescents, rings and words from the events
    world()
    for (let i = crescents.length - 1; i >= 0; i--) {
      const c = crescents[i]
      c.t += dt
      if (c.t >= CRESCENT) {
        crescents.splice(i, 1)
        continue
      }
      const k = c.t / CRESCENT
      ctx.globalAlpha = 1 - k
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3.2 * (1 - k) + 0.8
      ctx.beginPath()
      ctx.arc(c.x, c.y - 8, c.r * (0.8 + 0.4 * k), c.a - 1.1, c.a + 1.1)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(140, 90, 255, 0.8)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(c.x, c.y - 8, c.r * (0.7 + 0.4 * k), c.a - 0.9, c.a + 0.9)
      ctx.stroke()
    }
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
      ctx.lineWidth = 8 * (1 - k) + 2
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r * (0.15 + 0.85 * Math.sqrt(k)), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.textAlign = 'center'
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i]
      w.t += dt
      if (w.t >= w.life) {
        words.splice(i, 1)
        continue
      }
      const k = w.t / w.life
      ctx.globalAlpha = Math.min(1, (1 - k) * 3)
      ctx.font = font
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(255, 248, 232, 0.95)'
      const y = w.y - k * 16
      ctx.strokeText(w.text, w.x, y)
      ctx.fillStyle = w.c
      ctx.fillText(w.text, w.x, y)
    }
    ctx.globalAlpha = 1
  }

  function event(run, ev) {
    if (ev.type === 'slash') {
      if (crescents.length < MAX_CRESCENTS) crescents.push({ x: ev.x, y: ev.y, r: ev.r, a: Math.random() * Math.PI * 2, t: 0 })
    } else if (ev.type === 'classReady') {
      const D = run.D
      const C = run.cls
      rings.push({ x: ev.x, y: ev.y - 10, r: 90, t: 0, life: 0.5, c: 'rgba(255, 190, 90, 0.9)' })
      words.push({ x: ev.x, y: ev.y - 46, text: `${D.zyo.forms[C.form]} 전직!`, t: 0, life: 1.6, c: '#8a3fd1' })
    } else if (ev.type === 'revive') {
      rings.push({ x: ev.x, y: ev.y - 8, r: ev.r, t: 0, life: 0.7, c: 'rgba(255, 140, 40, 0.95)' })
      rings.push({ x: ev.x, y: ev.y - 8, r: ev.r * 0.6, t: 0, life: 0.5, c: 'rgba(255, 240, 180, 0.95)' })
      words.push({ x: ev.x, y: ev.y - 50, text: `${run.D.zyo.classes.B.special}!`, t: 0, life: 1.6, c: '#d2452a' })
    } else if (ev.type === 'warp') {
      rings.push({ x: ev.from.x, y: ev.from.y, r: 30, t: 0, life: 0.35, c: 'rgba(120, 90, 255, 0.9)' })
      rings.push({ x: ev.to.x, y: ev.to.y, r: 40, t: 0, life: 0.45, c: 'rgba(70, 220, 255, 0.9)' })
    }
  }

  return { shadows, under, over, event, reset: () => ((crescents.length = 0), (rings.length = 0), (words.length = 0)) }
}
