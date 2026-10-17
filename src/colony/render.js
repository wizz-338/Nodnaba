// Mano Colony — drawing the village on a canvas. Reads the game state, never
// changes it. The ground is painted once into an offscreen canvas; each frame
// draws that, then every object sorted by where it touches the ground.

import { COLS, DECOR, GATHER, LOTS, NODES, PATHS, RES_LABEL, ROWS, START, TILE, WATER_ROW, ZONES, ZONE_IDS } from './config.js'
import { LOT, NODE, zoneOfRow } from './world.js'
import { buildWork } from './sim.js'
import { ANIMS, EFFECTS } from './assets.js'

const WW = COLS * TILE
const WH = ROWS * TILE
const GS = 2 // ground canvas pixels per world px
const FONT = "'Galmuri11', 'IBM Plex Sans KR', sans-serif"
const RES_COLOR = { wood: '#a0612d', stone: '#5d6a82', stardust: '#b26be0' }

// ── ground ───────────────────────────────────────────────────────────────────

// soft, organic-edged mask from rectangles (in world px); pixel-stepped edge
function blobMask(rects, circles, blur, cut = 0.5) {
  const c = document.createElement('canvas')
  c.width = WW
  c.height = WH
  const g = c.getContext('2d')
  g.filter = `blur(${blur}px)`
  g.fillStyle = '#000'
  for (const [x, y, w, h] of rects) g.fillRect(x, y, w, h)
  for (const [x, y, r] of circles) {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  g.filter = 'none'
  // threshold the blur → crisp, rounded shapes with pixel edges
  const d = g.getImageData(0, 0, WW, WH)
  const a = d.data
  const k = cut * 255
  for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= k ? 255 : 0
  g.putImageData(d, 0, 0)
  return c
}

function paint(g, mask, texture, alpha = 1) {
  const c = document.createElement('canvas')
  c.width = WW * GS
  c.height = WH * GS
  const x = c.getContext('2d')
  x.imageSmoothingEnabled = false
  x.drawImage(mask, 0, 0, WW * GS, WH * GS)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = x.createPattern(texture, 'repeat')
  x.fillRect(0, 0, c.width, c.height)
  g.globalAlpha = alpha
  g.drawImage(c, 0, 0)
  g.globalAlpha = 1
  return c
}

function rim(g, mask, color, grow) {
  // a thin darker edge just outside a shape
  const c = document.createElement('canvas')
  c.width = WW * GS
  c.height = WH * GS
  const x = c.getContext('2d')
  x.imageSmoothingEnabled = false
  for (const [dx, dy] of [[-grow, 0], [grow, 0], [0, -grow], [0, grow]]) x.drawImage(mask, dx * GS, dy * GS, WW * GS, WH * GS)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = color
  x.fillRect(0, 0, c.width, c.height)
  x.globalCompositeOperation = 'destination-out'
  x.drawImage(mask, 0, 0, WW * GS, WH * GS)
  g.drawImage(c, 0, 0)
}

function buildGround(A) {
  const c = document.createElement('canvas')
  c.width = WW * GS
  c.height = WH * GS
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  g.fillStyle = g.createPattern(A.textures.grass, 'repeat')
  g.fillRect(0, 0, c.width, c.height)

  // lighter grass in a few soft patches (fixed layout, same every visit)
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const patches = Array.from({ length: 16 }, () => [r() * WW, r() * WH, 40 + r() * 70])
  paint(g, blobMask([], patches, 18), A.textures.grassLight, 0.75)

  // dirt paths and the camp plaza
  const pathRects = PATHS.map(([x0, y0, x1, y1]) => [x0 * TILE + 6, y0 * TILE + 6, (x1 - x0 + 1) * TILE - 12, (y1 - y0 + 1) * TILE - 12])
  const plaza = [[(START.camp.x + 0.5) * TILE, (START.camp.y + 1) * TILE, TILE * 2.4]]
  const dirtMask = blobMask(pathRects, plaza, 6)
  rim(g, dirtMask, 'rgba(96, 120, 50, 0.45)', 1)
  paint(g, dirtMask, A.textures.dirt)

  // the stream with sandy banks
  const y = WATER_ROW * TILE
  const bank = blobMask([[-20, y - 6, WW + 40, TILE + 12]], [], 5)
  paint(g, bank, A.textures.sand)
  const streamMask = blobMask([[-20, y + 3, WW + 40, TILE - 6]], [], 4)
  rim(g, streamMask, 'rgba(70, 120, 140, 0.5)', 1)
  paint(g, streamMask, A.textures.water)
  return c
}

// ── sprite helpers ───────────────────────────────────────────────────────────

function sprite(ctx, sheet, name, x, y, { flip = false, alpha = 1, scaleY = 1 } = {}) {
  const f = sheet.frames[name]
  if (!f) return
  const s = sheet.scale
  const w = f.w / s
  const h = f.h / s
  if (alpha !== 1) ctx.globalAlpha = alpha
  if (flip || scaleY !== 1) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(flip ? -1 : 1, scaleY)
    ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h, -f.ax / s, -f.ay / s, w, h)
    ctx.restore()
  } else {
    ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h, x - f.ax / s, y - f.ay / s, w, h)
  }
  if (alpha !== 1) ctx.globalAlpha = 1
}

function frameOf(anim, t) {
  if (anim.durs) {
    const total = anim.durs.reduce((a, b) => a + b, 0)
    let k = t % total
    for (let i = 0; i < anim.durs.length; i++) {
      if (k < anim.durs[i]) return i
      k -= anim.durs[i]
    }
    return 0
  }
  return Math.floor(t * anim.fps) % anim.frames.length
}

const nodeSprite = (kind, amount) => {
  const f = amount / NODES[kind].max
  const stage = f > 0.5 ? 3 : f >= 0.2 ? 2 : 1
  return `${kind}_${stage}`
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ── the renderer ────────────────────────────────────────────────────────────

export function createRenderer(canvas, A) {
  const ctx = canvas.getContext('2d')
  const ground = buildGround(A)
  const view = { x: (START.camp.x + 0.5) * TILE, y: (START.camp.y - 1) * TILE, zoom: 1, w: 1, h: 1, dpr: 1 }
  const fx = [] // effects and floating numbers
  const anim = new Map() // per-Mano animation clocks
  let time = 0

  function resize(w, h) {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2)
    view.w = w
    view.h = h
    canvas.width = Math.max(1, Math.round(w * view.dpr))
    canvas.height = Math.max(1, Math.round(h * view.dpr))
    clamp()
  }

  const minZoom = () => Math.max(0.45, Math.min(view.w / WW, 1))
  function clamp() {
    view.zoom = Math.min(2.2, Math.max(minZoom(), view.zoom))
    const hw = view.w / 2 / view.zoom
    const hh = view.h / 2 / view.zoom
    view.x = hw * 2 >= WW ? WW / 2 : Math.min(WW - hw, Math.max(hw, view.x))
    view.y = hh * 2 >= WH ? WH / 2 : Math.min(WH - hh, Math.max(hh, view.y))
  }

  const toWorld = (sx, sy) => ({ x: view.x + (sx - view.w / 2) / view.zoom, y: view.y + (sy - view.h / 2) / view.zoom })
  const toScreen = (wx, wy) => ({ x: (wx - view.x) * view.zoom + view.w / 2, y: (wy - view.y) * view.zoom + view.h / 2 })

  function pan(dx, dy) {
    view.x -= dx / view.zoom
    view.y -= dy / view.zoom
    clamp()
  }
  function zoomAt(k, sx, sy) {
    const before = toWorld(sx, sy)
    view.zoom *= k
    clamp()
    const after = toWorld(sx, sy)
    view.x += before.x - after.x
    view.y += before.y - after.y
    clamp()
  }
  function lookAt(wx, wy) {
    view.x = wx
    view.y = wy
    clamp()
  }

  function addFx(e) {
    fx.push({ ...e, t: 0 })
    if (fx.length > 80) fx.shift()
  }

  // ── draw one frame ──
  function draw(s, ui, dt) {
    time += dt
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#2b3a2a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const k = view.dpr * view.zoom
    ctx.setTransform(k, 0, 0, k, (view.w / 2 - view.x * view.zoom) * view.dpr, (view.h / 2 - view.y * view.zoom) * view.dpr)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // ground: only the visible part
    const tl = toWorld(0, 0)
    const sx = Math.max(0, Math.floor(tl.x))
    const sy = Math.max(0, Math.floor(tl.y))
    const sw = Math.min(WW - sx, Math.ceil(view.w / view.zoom) + 2)
    const sh = Math.min(WH - sy, Math.ceil(view.h / view.zoom) + 2)
    if (sw > 0 && sh > 0) ctx.drawImage(ground, sx * GS, sy * GS, sw * GS, sh * GS, sx, sy, sw, sh)

    const P = A.sheets.props
    const B = A.sheets.buildings

    // wooden deck across the stream (flat, under everything)
    sprite(ctx, P, 'dock', 10 * TILE, (WATER_ROW + 1) * TILE + 2)

    // empty lots (and lots to choose while placing)
    for (const l of LOTS) {
      if (!s.zones[zoneOfRow(l.y)] || s.buildings.some((b) => b.lot === l.id)) continue
      const x = l.x * TILE + 3
      const y = l.y * TILE + 3
      const choosing = ui.placing && !ui.placing.lot
      const chosen = ui.placing && ui.placing.lot === l.id
      const pulse = 0.5 + 0.5 * Math.sin(time * 5)
      ctx.lineWidth = chosen ? 2.5 : 1.5
      ctx.setLineDash(chosen ? [] : [5, 4])
      ctx.strokeStyle = choosing ? `rgba(255, 120, 160, ${0.55 + 0.45 * pulse})` : chosen ? '#ff7aa2' : 'rgba(255, 248, 232, 0.75)'
      ctx.fillStyle = choosing ? `rgba(255, 160, 190, ${0.12 + 0.12 * pulse})` : 'rgba(255, 248, 232, 0.14)'
      roundRect(ctx, x, y, TILE * 2 - 6, TILE * 2 - 6, 6)
      ctx.fill()
      ctx.stroke()
      ctx.setLineDash([])
      if (!chosen) {
        ctx.fillStyle = choosing ? '#ff7aa2' : 'rgba(255, 248, 232, 0.9)'
        ctx.fillRect(x + TILE - 3 - 1.5, y + TILE - 3 - 7, 3, 14)
        ctx.fillRect(x + TILE - 3 - 7, y + TILE - 3 - 1.5, 14, 3)
      }
    }

    // everything that stands on the ground, sorted by its feet
    const items = []
    for (const n of Object.values(NODE)) {
      items.push({ y: (n.y + 1) * TILE - 4, d: () => sprite(ctx, P, nodeSprite(n.kind, s.nodes[n.id]), (n.x + 0.5) * TILE, (n.y + 1) * TILE - 2) })
    }
    for (const [name, x, y] of DECOR) items.push({ y: (y + 1) * TILE - 6, d: () => sprite(ctx, P, name, (x + 0.5) * TILE, (y + 1) * TILE - 3) })
    items.push({ y: (START.camp.y + 1) * TILE - 4, d: () => sprite(ctx, P, 'camp_crate', (START.camp.x + 0.5) * TILE, (START.camp.y + 1) * TILE - 2) })

    for (const b of s.buildings) {
      const l = LOT[b.lot]
      const cx = (l.x + 1) * TILE
      const by = (l.y + 2) * TILE
      items.push({
        y: by - 6,
        d: () => {
          if (ui.selected === b.id) {
            ctx.fillStyle = 'rgba(255, 210, 225, 0.55)'
            ctx.beginPath()
            ctx.ellipse(cx, by - 8, TILE * 1.35, TILE * 0.55, 0, 0, Math.PI * 2)
            ctx.fill()
          }
          if (b.level === 0) {
            sprite(ctx, P, 'plot', cx, by + 2)
            if (b.build.progress > 0) sprite(ctx, P, 'scaffold', cx + 4, by - 6)
            sprite(ctx, P, 'lumber_pile', cx - 22, by + 4)
          } else {
            sprite(ctx, B, `${b.type}_${b.level}`, cx, by + 4)
            if (b.build) sprite(ctx, P, 'scaffold', cx + 26, by + 2, { alpha: 0.95 })
          }
          if (b.build) bar(cx, by - (b.level ? 74 + b.level * 6 : 62), b.build.progress / buildWork(b))
        },
      })
    }

    // placement preview
    if (ui.placing && ui.placing.lot) {
      const l = LOT[ui.placing.lot]
      items.push({ y: (l.y + 2) * TILE - 6, d: () => sprite(ctx, B, `${ui.placing.type}_1`, (l.x + 1) * TILE, (l.y + 2) * TILE + 4, { alpha: 0.6 + 0.15 * Math.sin(time * 4) }) })
    }

    for (const m of s.manos) items.push({ y: m.y, d: () => drawMano(m, dt) })
    items.sort((a, b) => a.y - b.y)
    for (const it of items) it.d()

    // locked zones: a veil with the zone's name
    for (const z of ZONE_IDS) {
      if (s.zones[z]) continue
      const [r0, r1] = ZONES[z].rows
      ctx.fillStyle = 'rgba(34, 26, 44, 0.55)'
      ctx.fillRect(0, r0 * TILE, WW, (r1 - r0 + 1) * TILE)
    }

    // effects
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]
      e.t += dt
      if (e.kind === 'text') {
        const life = 1.3
        if (e.t > life) {
          fx.splice(i, 1)
          continue
        }
        ctx.globalAlpha = Math.min(1, (life - e.t) * 2.5)
        ctx.font = `bold 11px ${FONT}`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(255, 250, 240, 0.95)'
        ctx.strokeText(e.text, e.x, e.y - e.t * 18)
        ctx.fillStyle = e.color
        ctx.fillText(e.text, e.x, e.y - e.t * 18)
        ctx.globalAlpha = 1
        continue
      }
      const def = EFFECTS[e.kind]
      const f = Math.floor(e.t * def.fps)
      if (f >= def.frames.length) {
        fx.splice(i, 1)
        continue
      }
      sprite(ctx, A.sheets.effects, def.frames[f], e.x, e.y)
    }

    // labels on locked zones, in screen space so they stay crisp
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
    for (const z of ZONE_IDS) {
      if (s.zones[z]) continue
      const [r0, r1] = ZONES[z].rows
      const p = toScreen(WW / 2, ((r0 + r1 + 1) / 2) * TILE)
      if (p.y < -40 || p.y > view.h + 40) continue
      const cost = Object.entries(ZONES[z].cost).map(([r, n]) => `${RES_LABEL[r]} ${n}`).join(' · ')
      const ready = s.zones[ZONES[z].needs]
      const title = `${ZONES[z].name} · 잠김`
      ctx.font = `15px ${FONT}`
      const tw = ctx.measureText(title).width
      ctx.drawImage(A.textures.lock, p.x - tw / 2 - 26, p.y - 21, 22, 22)
      label(p.x, p.y - 10, title, 15)
      label(p.x, p.y + 12, ready ? `눌러서 확장 · ${cost}` : `${ZONES[ZONES[z].needs].name}을(를) 먼저 열어요`, 11)
    }
  }

  function label(x, y, text, size) {
    ctx.font = `${size}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(40, 28, 46, 0.9)'
    ctx.strokeText(text, x, y)
    ctx.fillStyle = '#fff4e6'
    ctx.fillText(text, x, y)
    ctx.textBaseline = 'alphabetic'
  }

  function bar(cx, y, f) {
    const w = 40
    ctx.fillStyle = 'rgba(58, 40, 30, 0.85)'
    roundRect(ctx, cx - w / 2 - 1.5, y - 1.5, w + 3, 8, 3)
    ctx.fill()
    ctx.fillStyle = '#fff1df'
    roundRect(ctx, cx - w / 2, y, w, 5, 2)
    ctx.fill()
    ctx.fillStyle = '#ff8fb1'
    roundRect(ctx, cx - w / 2, y, Math.max(2, w * Math.min(1, f)), 5, 2)
    ctx.fill()
  }

  function drawMano(m, dt) {
    let a = anim.get(m.id)
    if (!a) anim.set(m.id, (a = { t: Math.random() * 2, face: 1, key: '' }))
    const t = m.task
    let name
    let flip = false
    let bob = 0
    const moving = !!m._goal
    if (moving) {
      const vx = m._vx || 0
      const vy = m._vy || 0
      if (Math.abs(vx) > 0.15) a.face = vx > 0 ? 1 : -1
      if (m.carry) name = 'carry_' + m.carry.res
      else name = Math.abs(vx) >= Math.abs(vy) * 0.7 ? 'walk_r' : vy > 0 ? 'walk_d' : 'walk_u'
      flip = (name === 'walk_r' || m.carry) && a.face < 0
    } else if (t && t.phase === 'work') {
      a.face = m._face || a.face
      name = t.kind === 'build' ? 'hammer' : GATHER[NODES[NODE[t.node].kind].res].anim
      flip = a.face < 0
    } else if (t && t.kind === 'rest') {
      name = t.pose
      if (t.pose === 'sleep') bob = Math.sin(time * 2 + m.id) * 0.6
    } else name = 'idle'
    if (name !== a.key) {
      a.key = name
      a.t = 0
    }
    a.t += dt
    const def = ANIMS[name] || ANIMS.idle
    const i = frameOf(def, a.t)
    // a small hop on the hit frame of a swing
    const hit = def.hit !== undefined && i === def.hit ? 1 : 0
    // shadow (the Mano frames have none of their own)
    ctx.fillStyle = 'rgba(60, 40, 40, 0.2)'
    ctx.beginPath()
    ctx.ellipse(m.x, m.y - 1, 9, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    sprite(ctx, A.sheets.mano, def.frames[i], m.x, m.y - 1 + bob + hit, { flip })
    if (t && t.kind === 'rest' && t.pose === 'sleep') {
      ctx.font = `9px ${FONT}`
      ctx.fillStyle = 'rgba(80, 70, 120, 0.85)'
      ctx.textAlign = 'center'
      ctx.fillText('z', m.x + 10, m.y - 34 - ((time * 6) % 6))
    }
  }

  // react to what the simulation reported this frame
  function events(list, effectsOn) {
    for (const e of list) {
      if (e.type === 'deliver' && e.n > 0) addFx({ kind: 'text', text: `+${e.n}`, color: RES_COLOR[e.res], x: e.x, y: e.y })
      if (e.type === 'deliver' && e.lost > 0) addFx({ kind: 'text', text: '가득!', color: '#e0662f', x: e.x + 14, y: e.y - 8 })
      if (!effectsOn) continue
      if (e.type === 'gather' && e.res === 'stardust') addFx({ kind: 'sparkle', x: e.x, y: e.y })
      if (e.type === 'built') {
        const l = LOT[e.lot]
        addFx({ kind: 'stars', x: (l.x + 1) * TILE, y: (l.y + 1.6) * TILE })
      }
      if (e.type === 'arrive') addFx({ kind: 'hearts', x: e.x, y: e.y - 24 })
      if (e.type === 'place') {
        const l = LOT[e.lot]
        addFx({ kind: 'poof', x: (l.x + 1) * TILE, y: (l.y + 2) * TILE })
      }
    }
  }

  // what is under a screen point: building, empty lot, locked zone
  function hit(s, sx, sy) {
    const p = toWorld(sx, sy)
    const sorted = [...s.buildings].sort((a, b) => LOT[b.lot].y - LOT[a.lot].y)
    for (const b of sorted) {
      const l = LOT[b.lot]
      if (p.x >= l.x * TILE - 8 && p.x <= (l.x + 2) * TILE + 8 && p.y >= (l.y - 1) * TILE && p.y <= (l.y + 2) * TILE) return { building: b.id }
    }
    const tx = Math.floor(p.x / TILE)
    const ty = Math.floor(p.y / TILE)
    if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return null
    const z = zoneOfRow(ty)
    if (!s.zones[z]) return { zone: z }
    for (const l of LOTS) if (tx >= l.x && tx < l.x + 2 && ty >= l.y && ty < l.y + 2) return { lot: l.id }
    return null
  }

  return { view, resize, draw, pan, zoomAt, lookAt, hit, events, addFx, toScreen, clamp }
}
