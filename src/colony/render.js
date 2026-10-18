// MANO COLONY — drawing the village. Reads the game state, never changes it.
//
// Ground: only the tiles on screen are drawn, each from a small pre-made
// canvas (grass variants, water with sand rims, floors with grass fringes for
// every combination of neighbours), so there are no seams and no per-frame
// image processing. Everything standing is sorted by where it touches the
// ground (the middle of its footprint), back to front.

import { BUILDINGS, CAMP_SIZE, DECOR, FLOOR_TYPES, FLOORS, GATHER, MAP, NODES, PLAY, RES_LABEL, START, TH, TW, ZONES, ZONE_IDS } from './config.js'
import { fromIso, hash, idx, inMap, iso, nodeOf } from './world.js'
import { buildWork } from './sim.js'
import { ANIMS, EFFECTS, PLAY_ANIMS, SLEEPY, playFrame } from './assets.js'

const FONT = "'Galmuri11', 'IBM Plex Sans KR', sans-serif"
const RES_COLOR = { wood: '#a0612d', stone: '#5d6a82', stardust: '#b26be0' }
const ANCHOR_DOWN = 0.72 // sprites stand this far from footprint centre to its front corner

// ── small canvas helpers ────────────────────────────────────────────────────

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function frameCanvas(A, atlas, name, flip = false) {
  const a = A[atlas]
  const f = a.frames[name]
  const [c, g] = canvas(f.w, f.h)
  if (flip) {
    g.translate(f.w, 0)
    g.scale(-1, 1)
  }
  g.drawImage(a.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h)
  return c
}

// diamond corners inside a tile canvas (atlas tiles are 132×68 with 2px bleed)
const T = { w: 132, h: 68, top: [66, 2], right: [130, 34], bottom: [66, 66], left: [2, 34], c: [66, 34] }
// edge bits: 1 = toward y-1 (upper right), 2 = x+1 (lower right), 4 = y+1 (lower left), 8 = x-1 (upper left)
const EDGES = [
  [1, T.top, T.right],
  [2, T.right, T.bottom],
  [4, T.bottom, T.left],
  [8, T.left, T.top],
]

// a band along one diamond edge, with a wobbly inner border
function band(g, p, q, depth, wobble, seed) {
  const n = 10
  const inner = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = p[0] + (q[0] - p[0]) * t
    const y = p[1] + (q[1] - p[1]) * t
    const d = depth * (0.75 + 0.25 * Math.sin(t * 9 + seed)) + wobble * Math.sin(t * 23 + seed * 3)
    inner.push([x + (T.c[0] - x) * d, y + (T.c[1] - y) * d])
  }
  g.beginPath()
  g.moveTo(p[0], p[1])
  g.lineTo(q[0], q[1])
  for (let i = n; i >= 0; i--) g.lineTo(inner[i][0], inner[i][1])
  g.closePath()
  return inner
}

function tileSet(A) {
  const base = {}
  for (const name of Object.keys(A.tiles.frames)) {
    base[name] = frameCanvas(A, 'tiles', name)
    base[name + '~'] = frameCanvas(A, 'tiles', name, true)
  }
  // water with a sand rim on the sides that touch land
  const shore = []
  for (let mask = 0; mask < 16; mask++) {
    const [c, g] = canvas(T.w, T.h)
    g.drawImage(base.water_0, 0, 0)
    for (const [bit, p, q] of EDGES) {
      if (!(mask & bit)) continue
      g.save()
      const inner = band(g, p, q, 0.3, 0.012, bit)
      g.clip()
      g.drawImage(base.sand_1, 0, 0)
      g.restore()
      // wet line and foam along the waterline
      g.strokeStyle = 'rgba(255, 255, 255, 0.55)'
      g.lineWidth = 1.6
      g.beginPath()
      inner.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
    }
    shore.push(c)
  }
  // floors with a soft grass fringe where the neighbour is something else
  const fringe = {}
  for (const type of FLOOR_TYPES) {
    const tex = base[FLOORS[type].tex]
    fringe[type] = []
    for (let mask = 0; mask < 16; mask++) {
      const [c, g] = canvas(T.w, T.h)
      g.drawImage(tex, 0, 0)
      for (const [bit, p, q] of EDGES) {
        if (!(mask & bit)) continue
        g.save()
        band(g, p, q, 0.12, 0.05, bit * 7)
        g.clip()
        g.drawImage(base.grass_1, 0, 0)
        g.restore()
      }
      fringe[type].push(c)
    }
  }
  return { base, shore, fringe }
}

// Half / quarter size copies, made once with good filtering. Drawing from the
// copy nearest the size on screen keeps zoomed-out views smooth and sharp
// with cheap (bilinear) scaling.
const mipCache = new WeakMap()
function mip(src, lv) {
  if (!lv) return src
  let m = mipCache.get(src)
  if (!m) mipCache.set(src, (m = []))
  if (!m[lv]) {
    const prev = mip(src, lv - 1)
    const pw = prev.naturalWidth || prev.width
    const ph = prev.naturalHeight || prev.height
    const [c, g] = canvas(Math.max(1, Math.ceil(pw / 2)), Math.max(1, Math.ceil(ph / 2)))
    g.imageSmoothingQuality = 'high'
    g.drawImage(prev, 0, 0, c.width, c.height)
    m[lv] = c
  }
  return m[lv]
}
const levelFor = (s) => (s < 0.3 ? 2 : s < 0.6 ? 1 : 0) // s = screen px per stored px

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

const nodeSprite = (n, amount) => {
  const f = amount / NODES[n.kind].max
  if (n.kind === 'tree') return f > 0.5 ? n.v : f >= 0.2 ? 'sapling' : 'stump'
  const stage = f > 0.5 ? 3 : f >= 0.2 ? 2 : 1
  return `${n.kind}_${stage}`
}

// where a footprint's drawing stands (world px)
export function standPoint(x0, y0, w, h) {
  const c = iso(x0 + w / 2, y0 + h / 2)
  const b = iso(x0 + w, y0 + h)
  return { X: c.X + (b.X - c.X) * ANCHOR_DOWN, Y: c.Y + (b.Y - c.Y) * ANCHOR_DOWN }
}

export function decorSprite(type, dir) {
  const def = DECOR[type]
  if (def.dirs) return def.dirs[(dir || 0) % def.dirs.length]
  return { atlas: def.atlas, sprite: def.sprite }
}

// ── the renderer ───────────────────────────────────────────────────────────

export function createRenderer(cvs, A) {
  const ctx = cvs.getContext('2d')
  const tiles = tileSet(A)
  const view = { x: 0, y: 0, zoom: 0.9, w: 1, h: 1, dpr: 1 }
  const fx = []
  const anim = new Map()
  let drawn = [] // sprites drawn last frame (for tapping), front-most last
  let time = 0

  function resize(w, h) {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2)
    view.w = w
    view.h = h
    cvs.width = Math.max(1, Math.round(w * view.dpr))
    cvs.height = Math.max(1, Math.round(h * view.dpr))
    clamp()
  }

  // keep the centre of the view on the map, zoom within limits
  function clamp() {
    view.zoom = Math.min(1.8, Math.max(0.4, view.zoom))
    const t = fromIso(view.x, view.y)
    const x = Math.min(MAP - 1, Math.max(1, t.x))
    const y = Math.min(MAP - 1, Math.max(1, t.y))
    const p = iso(x, y)
    view.x = p.X
    view.y = p.Y
  }
  const toWorld = (sx, sy) => ({ X: view.x + (sx - view.w / 2) / view.zoom, Y: view.y + (sy - view.h / 2) / view.zoom })
  const toScreen = (X, Y) => ({ x: (X - view.x) * view.zoom + view.w / 2, y: (Y - view.y) * view.zoom + view.h / 2 })
  const tileAt = (sx, sy) => {
    const p = toWorld(sx, sy)
    const t = fromIso(p.X, p.Y)
    return { x: Math.floor(t.x), y: Math.floor(t.y), fx: t.x, fy: t.y }
  }
  function pan(dx, dy) {
    view.x -= dx / view.zoom
    view.y -= dy / view.zoom
    clamp()
  }
  // zoom keeping the point under (sx, sy) where it is
  function zoomAt(k, sx = view.w / 2, sy = view.h / 2) {
    const before = toWorld(sx, sy)
    view.zoom = Math.min(1.8, Math.max(0.4, view.zoom * k))
    const after = toWorld(sx, sy)
    view.x += before.X - after.X
    view.y += before.Y - after.Y
    clamp()
  }
  function lookAtTile(x, y) {
    const p = iso(x, y)
    view.x = p.X
    view.y = p.Y
    clamp()
  }

  // Once the zoom has settled, each drawing is scaled once to its size on
  // screen and from then on copied pixel for pixel: with 200 Manos on screen,
  // resampling every sprite every frame is the biggest cost after the ground.
  const sized = new Map()
  let sizedK = 0
  let viewTX = 0
  let viewTY = 0
  function blit(key, X, Y, w, h, ax, ay, paint) {
    const kd = view.dpr * view.zoom
    if (kd !== sizedK || sized.size > 600) {
      sized.clear()
      sizedK = kd
    }
    let e = sized.get(key)
    if (!e) {
      const ox = Math.ceil(ax * kd) + 1
      const oy = Math.ceil(ay * kd) + 1
      const [c, g] = canvas(Math.ceil(w * kd) + 3, Math.ceil(h * kd) + 3)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.setTransform(kd, 0, 0, kd, ox, oy) // anchor at (ox, oy)
      paint(g)
      sized.set(key, (e = { c, ox, oy }))
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(e.c, Math.round(X * kd + viewTX - e.ox), Math.round(Y * kd + viewTY - e.oy))
    ctx.setTransform(kd, 0, 0, kd, viewTX, viewTY)
  }
  const settled = () => time - zoomT > 0.25

  function shadow(X, Y) {
    if (settled())
      return blit('shadow', X, Y, 28, 12, 14, 6, (g) => {
        g.fillStyle = 'rgba(40, 30, 30, 0.22)'
        g.beginPath()
        g.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2)
        g.fill()
      })
    ctx.fillStyle = 'rgba(40, 30, 30, 0.22)'
    ctx.beginPath()
    ctx.ellipse(X, Y, 13, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  function spr(atlas, name, X, Y, { flip = false, alpha = 1, scaleX = 1, filter = null } = {}) {
    const a = A[atlas]
    const f = a && a.frames[name]
    if (!f) return null
    const k = f.k
    const w = f.w / k
    const h = f.h / k
    const ax = f.ax / k
    const ay = f.ay / k
    const lv = levelFor((view.zoom * view.dpr) / k)
    const img = mip(a.img, lv)
    const d = 2 ** lv
    if (alpha !== 1) ctx.globalAlpha = alpha
    if (scaleX === 1 && !filter && settled()) {
      blit(atlas + '/' + name + (flip ? '~' : ''), X, Y, w, h, flip ? w - ax : ax, ay, (g) => {
        if (flip) g.scale(-1, 1)
        g.drawImage(img, f.x / d, f.y / d, f.w / d, f.h / d, -ax, -ay, w, h)
      })
    } else {
      // selected (glowing), a gate swinging open, or a pinch still zooming
      if (filter) ctx.filter = filter
      ctx.save()
      ctx.translate(X, Y)
      ctx.scale(flip ? -scaleX : scaleX, 1)
      ctx.drawImage(img, f.x / d, f.y / d, f.w / d, f.h / d, -ax, -ay, w, h)
      ctx.restore()
      if (filter) ctx.filter = 'none'
    }
    if (alpha !== 1) ctx.globalAlpha = 1
    const left = flip ? X - (w - ax) : X - ax
    return { x: left, y: Y - ay, w, h }
  }

  function diamond(x, y) {
    const t = iso(x, y)
    ctx.beginPath()
    ctx.moveTo(t.X, t.Y)
    ctx.lineTo(t.X + TW / 2, t.Y + TH / 2)
    ctx.lineTo(t.X, t.Y + TH)
    ctx.lineTo(t.X - TW / 2, t.Y + TH / 2)
    ctx.closePath()
  }

  function visibleRange() {
    const pts = [toWorld(0, 0), toWorld(view.w, 0), toWorld(0, view.h), toWorld(view.w, view.h)].map((p) => fromIso(p.X, p.Y))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return {
      x0: Math.max(0, Math.floor(Math.min(...xs)) - 2),
      x1: Math.min(MAP - 1, Math.ceil(Math.max(...xs)) + 2),
      y0: Math.max(0, Math.floor(Math.min(...ys)) - 2),
      y1: Math.min(MAP - 1, Math.ceil(Math.max(...ys)) + 3),
    }
  }
  const onScreen = (X, Y, m = 120) => {
    const p = toScreen(X, Y)
    return p.x > -m * view.zoom && p.x < view.w + m * view.zoom && p.y > -m * view.zoom && p.y < view.h + (m + 60) * view.zoom
  }

  // ── the ground layer ──
  // Grass, water, paths and the edit grid change only when the map changes,
  // the view moves past the painted margin, the zoom changes or the water
  // ripples (every 0.9 s, only if water is in view). Otherwise last frame's
  // painting is copied as it is. While a pinch is zooming, the old painting
  // is stretched and repainted once the zoom settles.
  const ground = { cvs: null, ctx: null, key: '', X0: 0, Y0: 0, W: 0, H: 0, zoom: 0, water: false }
  let lastZoom = 0
  let zoomT = -1
  const MARGIN = 120 // css px painted beyond each screen edge

  function groundLayer(world, ui) {
    const k = view.dpr * view.zoom
    if (view.zoom !== lastZoom) {
      lastZoom = view.zoom
      zoomT = time
    }
    const left = view.x - view.w / 2 / view.zoom
    const top = view.y - view.h / 2 / view.zoom
    const right = left + view.w / view.zoom
    const bottom = top + view.h / view.zoom
    const waterFrame = Math.floor(time / 0.9) % 4
    const base = [view.dpr, view.w, view.h, world.version, ui.grid ? 1 : 0, ground.water ? waterFrame : -1].join()
    const inside = left >= ground.X0 && top >= ground.Y0 && right <= ground.X0 + ground.W && bottom <= ground.Y0 + ground.H
    const settling = time - zoomT < 0.2 && ground.cvs && Math.abs(view.zoom / ground.zoom - 1) < 0.5
    if (!(ground.key === base + ',' + view.zoom && inside) && !(settling && ground.key.startsWith(base + ',') && inside)) {
      paintGround(world, ui, k, left - MARGIN / view.zoom, top - MARGIN / view.zoom, (view.w + 2 * MARGIN) / view.zoom, (view.h + 2 * MARGIN) / view.zoom, waterFrame)
      ground.key = [view.dpr, view.w, view.h, world.version, ui.grid ? 1 : 0, ground.water ? waterFrame : -1].join() + ',' + view.zoom
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const s = k / (view.dpr * ground.zoom) // 1 unless a pinch is still settling
    ctx.drawImage(ground.cvs, Math.round((ground.X0 - left) * k), Math.round((ground.Y0 - top) * k), ground.cvs.width * s, ground.cvs.height * s)
  }

  function paintGround(world, ui, k, X0, Y0, W, H, waterFrame) {
    const cw = Math.ceil(W * k)
    const ch = Math.ceil(H * k)
    if (!ground.cvs) [ground.cvs, ground.ctx] = canvas(cw, ch)
    if (ground.cvs.width !== cw || ground.cvs.height !== ch) {
      ground.cvs.width = cw
      ground.cvs.height = ch
    }
    Object.assign(ground, { X0, Y0, W, H, zoom: view.zoom, water: false })
    const g = ground.ctx
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = '#273526'
    g.fillRect(0, 0, cw, ch)
    g.setTransform(k, 0, 0, k, -X0 * k, -Y0 * k)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'low'
    const tileLv = levelFor((view.zoom * view.dpr) / 2)
    const { water } = world.gen
    // the map diamond in grass colour first, so the hairline where four
    // tiles meet never shows the dark outside
    const corners = [iso(0, 0), iso(MAP, 0), iso(MAP, MAP), iso(0, MAP)]
    g.fillStyle = '#bcc673'
    g.beginPath()
    corners.forEach((c, i) => (i ? g.lineTo(c.X, c.Y) : g.moveTo(c.X, c.Y)))
    g.closePath()
    g.fill()
    const pts = [fromIso(X0, Y0), fromIso(X0 + W, Y0), fromIso(X0, Y0 + H), fromIso(X0 + W, Y0 + H)]
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((q) => q.x))) - 1)
    const x1 = Math.min(MAP - 1, Math.ceil(Math.max(...pts.map((q) => q.x))) + 1)
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((q) => q.y))) - 1)
    const y1 = Math.min(MAP - 1, Math.ceil(Math.max(...pts.map((q) => q.y))) + 1)
    const seen = (c) => c.X > X0 - 40 && c.X < X0 + W + 40 && c.Y > Y0 - 20 && c.Y < Y0 + H + 20
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = iso(x + 0.5, y + 0.5)
        if (!seen(c)) continue
        const i = idx(x, y)
        let img
        if (water[i]) {
          ground.water = true
          let mask = 0
          if (y > 0 && !water[i - MAP]) mask |= 1
          if (x < MAP - 1 && !water[i + 1]) mask |= 2
          if (y < MAP - 1 && !water[i + MAP]) mask |= 4
          if (x > 0 && !water[i - 1]) mask |= 8
          img = mask ? tiles.shore[mask] : tiles.base['water_' + ((waterFrame + Math.floor(hash(x, y, 3) * 4)) % 4)]
        } else {
          const h = hash(x, y)
          img = tiles.base['grass_' + Math.floor(h * 4) + (hash(x, y, 1) < 0.5 ? '~' : '')]
        }
        g.drawImage(mip(img, tileLv), c.X - 33, c.Y - 17, 66, 34)
        const f = world.floor[i]
        if (f) {
          const t = FLOOR_TYPES[f - 1]
          let mask = 0
          if (y > 0 && world.floor[i - MAP] !== f) mask |= 1
          if (x < MAP - 1 && world.floor[i + 1] !== f) mask |= 2
          if (y < MAP - 1 && world.floor[i + MAP] !== f) mask |= 4
          if (x > 0 && world.floor[i - 1] !== f) mask |= 8
          g.drawImage(mip(tiles.fringe[t][mask], tileLv), c.X - 33, c.Y - 17, 66, 34)
        }
      }
    }
    // the edit grid: every open tile's outline in one stroke
    if (ui.grid) {
      g.lineWidth = 1 / view.zoom
      g.strokeStyle = 'rgba(255, 255, 255, 0.16)'
      g.beginPath()
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (!world.open[idx(x, y)] || !seen(iso(x + 0.5, y + 0.5))) continue
          const q = iso(x, y)
          g.moveTo(q.X, q.Y)
          g.lineTo(q.X + TW / 2, q.Y + TH / 2)
          g.lineTo(q.X, q.Y + TH)
          g.lineTo(q.X - TW / 2, q.Y + TH / 2)
          g.closePath()
        }
      g.stroke()
    }
  }

  // ── one frame ──
  function draw(s, world, ui, dt) {
    time += dt
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#273526'
    ctx.fillRect(0, 0, cvs.width, cvs.height)
    const k = view.dpr * view.zoom
    ctx.setTransform(k, 0, 0, k, (view.w / 2 - view.x * view.zoom) * view.dpr, (view.h / 2 - view.y * view.zoom) * view.dpr)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'low' // see mip(): sharper results come from the pre-shrunk copies
    const R = visibleRange()

    // 1. ground: painted into its own canvas only when it changes (see
    // groundLayer), then copied — most frames the ground costs one copy
    groundLayer(world, ui)
    viewTX = (view.w / 2 - view.x * view.zoom) * view.dpr
    viewTY = (view.h / 2 - view.y * view.zoom) * view.dpr
    ctx.setTransform(k, 0, 0, k, viewTX, viewTY)

    // 2. flat things: bridges, blankets, petals, stepping stones
    for (const b of world.gen.bridges) {
      const p = standPoint(b.x, b.y, 2, 2)
      if (onScreen(p.X, p.Y)) spr('water', 'bridge', p.X, p.Y + 6)
    }
    const flat = []
    const standing = []
    for (const d of s.decor) {
      const def = DECOR[d.type]
      const [w, h] = def.size || [1, 1]
      const p = standPoint(d.x, d.y, w, h)
      if (!onScreen(p.X, p.Y, 160)) continue
      if (def.flat || def.bridge) flat.push({ d, p })
      else if (d.type !== 'fence' && d.type !== 'gate') standing.push({ d, p, depth: d.x + w / 2 + d.y + h / 2 })
    }
    for (const { d, p } of flat) {
      const sp = decorSprite(d.type, d.dir)
      const box = spr(sp.atlas, sp.sprite, p.X, p.Y + (DECOR[d.type].bridge ? 6 : 0), { flip: sp.flip, alpha: ui.moving === d.id ? 0.35 : 1, filter: ui.selected === d.id ? GLOW : null })
      if (box) drawnNow.push({ box, id: d.id })
    }

    // 3. edit grid and placement cells
    if (ui.cells) {
      for (const [x, y, good] of ui.cells) {
        if (!inMap(x, y)) continue
        diamond(x, y)
        ctx.fillStyle = good ? 'rgba(90, 210, 130, 0.42)' : 'rgba(235, 80, 80, 0.48)'
        ctx.fill()
        ctx.strokeStyle = good ? 'rgba(220, 255, 230, 0.8)' : 'rgba(255, 210, 210, 0.85)'
        ctx.lineWidth = 1.2 / view.zoom
        ctx.stroke()
      }
    }

    // 4. everything standing, back to front
    const items = []
    for (const n of world.gen.nodes) {
      if (n.x < R.x0 || n.x > R.x1 || n.y < R.y0 || n.y > R.y1) continue
      const p = standPoint(n.x, n.y, 1, 1)
      if (!onScreen(p.X, p.Y)) continue
      items.push({ depth: n.x + n.y + 1, id: n.id, d: () => spr('nature', nodeSprite(n, s.nodes[n.id] ?? NODES[n.kind].max), p.X, p.Y, { filter: ui.selected === n.id ? GLOW : null }) })
    }
    {
      const c = START.camp
      const p = standPoint(c.x, c.y, CAMP_SIZE[0], CAMP_SIZE[1])
      if (onScreen(p.X, p.Y)) items.push({ depth: c.x + c.y + 2, id: 'camp', d: () => spr('nature', 'camp_crate', p.X, p.Y, { filter: ui.selected === 'camp' ? GLOW : null }) })
    }
    for (const b of s.buildings) {
      const p = standPoint(b.x, b.y, 3, 3)
      if (!onScreen(p.X, p.Y, 220)) continue
      items.push({ depth: b.x + b.y + 3, id: b.id, d: () => drawBuilding(b, p, ui) })
    }
    for (const { d, p, depth } of standing) {
      const sp = decorSprite(d.type, d.dir)
      items.push({ depth, id: d.id, d: () => spr(sp.atlas, sp.sprite, p.X, p.Y, { flip: sp.flip, alpha: ui.moving === d.id ? 0.35 : fade(depth, p), filter: ui.selected === d.id ? GLOW : null }) })
    }
    // fences: posts at tile centres, joined toward +x and +y neighbours
    const manoTiles = new Set(s.manos.map((m) => idx(Math.floor(m.x), Math.floor(m.y))))
    for (const d of s.decor) {
      if (d.type !== 'fence' && d.type !== 'gate') continue
      if (d.x < R.x0 - 1 || d.x > R.x1 + 1 || d.y < R.y0 - 1 || d.y > R.y1 + 1) continue
      fenceItems(world, d, items, manoTiles, ui)
    }
    // two friends playing together are one drawing; while it shows, the two
    // residents are not drawn on their own (see play.js)
    const together = new Set()
    for (const j of s._joints || []) {
      if (j.state !== 'play') continue
      together.add(j.a).add(j.b)
      const cx = (j.spots[0][0] + j.spots[1][0]) / 2 + 0.5
      const cy = (j.spots[0][1] + j.spots[1][1]) / 2 + 0.5
      const p = iso(cx, cy)
      if (!onScreen(p.X, p.Y)) continue
      items.push({ depth: cx + cy, id: j.id, d: () => drawPair(s, j, p, ui.selected === j.id) })
    }
    for (const m of s.manos) {
      if (together.has(m.id)) continue
      const p = iso(m.x, m.y)
      if (!onScreen(p.X, p.Y)) continue
      const seated = m.task && m.task.kind === 'play' && m.task.seat && m.task.phase === 'play'
      items.push({ depth: m.x + m.y + (seated ? 0.02 : 0), id: 'm' + m.id, d: () => drawMano(s, world, m, p, dt, ui.selected === 'm' + m.id) })
    }
    if (ui.ghost) {
      const g = ui.ghost
      items.push({ depth: g.depth + 0.01, d: () => spr(g.atlas, g.sprite, g.X, g.Y, { flip: g.flip, alpha: g.ok ? 0.72 : 0.5, filter: g.ok ? null : 'saturate(0.4) brightness(1.1)' }) })
    }
    items.sort((a, b) => a.depth - b.depth)
    const now = []
    for (const it of items) {
      const box = it.d()
      if (box && it.id) now.push({ box, id: it.id })
    }
    drawn = drawnNow.concat(now)
    drawnNow.length = 0

    // 5. effects
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]
      e.t += dt
      const p = iso(e.x, e.y)
      if (e.kind === 'text') {
        const life = 1.4
        if (e.t > life) {
          fx.splice(i, 1)
          continue
        }
        ctx.globalAlpha = Math.min(1, (life - e.t) * 2.5)
        ctx.font = `bold 13px ${FONT}`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(255, 250, 240, 0.95)'
        ctx.strokeText(e.text, p.X, p.Y - 46 - e.t * 18)
        ctx.fillStyle = e.color
        ctx.fillText(e.text, p.X, p.Y - 46 - e.t * 18)
        ctx.globalAlpha = 1
        continue
      }
      const def = EFFECTS[e.kind]
      const f = Math.floor(e.t * def.fps)
      if (f >= def.frames.length) {
        fx.splice(i, 1)
        continue
      }
      spr('effects', def.frames[f], p.X, p.Y + (e.dy || 0), { alpha: e.alpha || 1 })
    }

    // 6. locked zones: a veil and the zone's name (screen space)
    // (one shape per locked zone: zones are rectangles of tiles)
    ctx.fillStyle = 'rgba(30, 22, 40, 0.5)'
    ctx.beginPath()
    for (const z of ZONE_IDS) {
      if (s.zones[z]) continue
      const [x0, y0, x1, y1] = ZONES[z].rect
      const corners = [iso(x0, y0), iso(x1 + 1, y0), iso(x1 + 1, y1 + 1), iso(x0, y1 + 1)]
      corners.forEach((c, i) => (i ? ctx.lineTo(c.X, c.Y) : ctx.moveTo(c.X, c.Y)))
      ctx.closePath()
    }
    ctx.fill()
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
    for (const z of ZONE_IDS) {
      if (s.zones[z]) continue
      const [x0, y0, x1, y1] = ZONES[z].rect
      const c = iso((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2)
      const p = toScreen(c.X, c.Y)
      if (p.x < -120 || p.x > view.w + 120 || p.y < -40 || p.y > view.h + 40) continue
      const open = ZONES[z].needs.some((n) => s.zones[n])
      label(p.x, p.y - 10, `${ZONES[z].name} · 잠김`, 15)
      label(p.x, p.y + 12, open ? `눌러서 확장 · ${Object.entries(ZONES[z].cost).map(([r, n]) => `${RES_LABEL[r]} ${n}`).join(' · ')}` : '옆 구역을 먼저 열어요', 11)
    }
  }
  const drawnNow = []
  const GLOW = 'drop-shadow(0 0 2px #fff) drop-shadow(0 0 5px #ff8fb1)'

  // things in front of what is being placed fade, so the spot stays visible
  function fade(depth, p) {
    const g = drawPreview
    if (!g) return 1
    if (depth <= g.depth) return 1
    return Math.abs(p.X - g.X) < 110 && p.Y > g.Y - 30 && p.Y < g.Y + 200 ? 0.38 : 1
  }
  let drawPreview = null

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

  function bar(X, Y, f) {
    const w = 56
    ctx.fillStyle = 'rgba(58, 40, 30, 0.85)'
    ctx.fillRect(X - w / 2 - 2, Y - 2, w + 4, 9)
    ctx.fillStyle = '#fff1df'
    ctx.fillRect(X - w / 2, Y, w, 5)
    ctx.fillStyle = '#ff8fb1'
    ctx.fillRect(X - w / 2, Y, Math.max(2, w * Math.min(1, f)), 5)
  }

  function drawBuilding(b, p, ui) {
    const depth = b.x + b.y + 3
    const alpha = ui.moving === b.id ? 0.35 : fade(depth, p)
    const filter = ui.selected === b.id ? GLOW : null
    let box
    if (b.level === 0) {
      const f = b.build.progress / buildWork(b)
      box = spr('water', 'site_plot', p.X, p.Y + 4, { alpha, filter })
      if (f > 0.02) spr('water', 'site_frame', p.X + 2, p.Y - 4, { alpha: alpha * Math.min(1, 0.4 + f), filter })
      spr('water', 'lumber_pile', p.X - 62, p.Y - 8, { alpha })
    } else {
      box = spr('buildings', `${b.type}_${b.level}`, p.X, p.Y, { alpha, filter })
      if (b.build) spr('water', 'scaffold', p.X + 70, p.Y - 10, { alpha })
    }
    if (b.build && box) bar(p.X, box.y - 12, b.build.progress / buildWork(b))
    return box
  }

  function fenceItems(world, d, items, manoTiles, ui) {
    const isF = (x, y) => inMap(x, y) && (world.fence[idx(x, y)] || world.gate[idx(x, y)])
    const isFence = (x, y) => inMap(x, y) && world.fence[idx(x, y)]
    const selected = ui.selected === d.id
    const filter = selected ? GLOW : null
    if (d.type === 'gate') {
      const alongY = isF(d.x, d.y - 1) || isF(d.x, d.y + 1)
      const alongX = isF(d.x - 1, d.y) || isF(d.x + 1, d.y)
      const y = alongY && !alongX
      const a = y ? iso(d.x + 0.5, d.y) : iso(d.x, d.y + 0.5)
      const open = manoTiles.has(idx(d.x, d.y))
      items.push({ depth: d.x + d.y + 1, id: d.id, d: () => spr('street', 'gate', a.X, a.Y, { flip: y, scaleX: open ? 0.3 : 1, filter }) })
      return
    }
    // a fence piece: half-segments toward each fence neighbour, or a post
    let any = false
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      if (!isF(d.x + dx, d.y + dy)) continue
      any = true
      // draw the half from this tile's centre toward the neighbour; the
      // neighbour draws its own half (gates draw their whole span)
      const from = { x: d.x + 0.5, y: d.y + 0.5 }
      const mid = { x: d.x + 0.5 + dx / 2, y: d.y + 0.5 + dy / 2 }
      const flip = dy !== 0
      // the segment art runs down-right / down-left from its first post
      const start = dx < 0 || dy < 0 ? mid : from
      const p = iso(start.x, start.y)
      items.push({ depth: (from.x + mid.x) / 2 + (from.y + mid.y) / 2, id: d.id, d: () => spr('street', 'fence_seg', p.X, p.Y, { flip, filter }) })
    }
    if (!any || !isFence(d.x, d.y)) {
      const p = iso(d.x + 0.5, d.y + 0.5)
      items.push({ depth: d.x + d.y + 1, id: d.id, d: () => spr('street', 'fence_post', p.X, p.Y + 2, { filter }) })
    }
  }

  // two residents in one picture, standing where the two of them stand
  function drawPair(s, j, p, glow) {
    const a = PLAY_ANIMS[j.act]
    const i = playFrame(a, j.t)
    shadow(p.X - 14, p.Y + 4)
    shadow(p.X + 14, p.Y - 4)
    const bob = SLEEPY.has(j.act) ? Math.round(Math.sin(j.t * 1.6)) * 0.5 : 0
    return spr(a.atlas, a.frames[i], p.X, p.Y + 4 + bob, { filter: glow ? GLOW : null })
  }

  function drawMano(s, world, m, p, dt, glow) {
    let a = anim.get(m.id)
    if (!a) anim.set(m.id, (a = { t: Math.random() * 2, key: '', face: 1, hit: -1 }))
    const t = m.task
    if (t && t.kind === 'play' && t.phase === 'play') {
      // playing alone: the action's own frames, timed from when it began
      const pa = PLAY_ANIMS[t.act]
      const i = playFrame(pa, t.at || 0)
      const lift = t.seat ? PLAY.seatLift : 0
      if (!lift) shadow(p.X, p.Y)
      const bob = SLEEPY.has(t.act) ? Math.round(Math.sin((t.at || 0) * 1.6)) * 0.5 : 0
      return spr(pa.atlas, pa.frames[i], p.X, p.Y + 1 - lift + bob, { flip: t.flip, filter: glow ? GLOW : null })
    }
    let name = 'stand'
    let flip = false
    if (m._goal) {
      const sx = (m._vx || 0) - (m._vy || 0)
      const sy = ((m._vx || 0) + (m._vy || 0)) / 2
      if (Math.abs(sx) > 0.05) a.face = sx > 0 ? 1 : -1
      if (m.carry) {
        name = 'carry_' + m.carry.res
        flip = a.face < 0
      } else name = sy >= 0 ? (a.face > 0 ? 'walk_se' : 'walk_sw') : a.face > 0 ? 'walk_ne' : 'walk_nw'
    } else if (t && t.phase === 'work') {
      if (m._face) a.face = m._face > 0 ? 1 : -1
      const n = t.kind === 'gather' ? nodeOf(world, t.node) : null
      name = t.kind === 'build' ? 'hammer' : n ? GATHER[NODES[n.kind].res].anim : 'stand'
      flip = a.face < 0
    } else if (t && t.kind === 'rest') name = t.pose === 'happy' ? 'happy' : t.pose || 'sit'
    if (name !== a.key) {
      a.key = name
      a.t = 0
    }
    a.t += dt
    const def = ANIMS[name] || ANIMS.stand
    const i = frameOf(def, a.t)
    // dust from the hammer / pick when it lands
    if (def.hit !== undefined && i === def.hit && a.hit !== i && s.settings.effects && Math.random() < 0.5) {
      fx.push({ kind: 'dust', x: m.x + (a.face > 0 ? 0.35 : -0.35), y: m.y - (a.face > 0 ? 0.35 : -0.35), t: 0, alpha: 0.75, dy: 4 })
      if (fx.length > 120) fx.shift()
    }
    a.hit = i
    const bob = name === 'sleep' ? Math.sin(time * 2 + m.id) * 0.5 : 0
    shadow(p.X, p.Y)
    return spr('mano', def.frames[i], p.X, p.Y + 1 + bob, { flip, filter: glow ? GLOW : null })
  }

  function events(list, effectsOn) {
    for (const e of list) {
      if (e.type === 'deliver' && e.n > 0) fx.push({ kind: 'text', text: `+${e.n}`, color: RES_COLOR[e.res], x: e.x, y: e.y, t: 0 })
      if (e.type === 'deliver' && e.lost > 0) fx.push({ kind: 'text', text: '가득!', color: '#e0662f', x: e.x + 0.3, y: e.y, t: 0 })
      if (!effectsOn) continue
      if (e.type === 'gather' && e.res === 'stardust') fx.push({ kind: 'sparkle', x: e.x, y: e.y, t: 0, dy: -30 })
      if (e.type === 'built') fx.push({ kind: 'poof', x: e.x, y: e.y, t: 0 }, { kind: 'sparkle', x: e.x, y: e.y, t: 0, dy: -80 })
      if (e.type === 'arrive') fx.push({ kind: 'hearts', x: e.x, y: e.y, t: 0, dy: -50 })
      if (e.type === 'cheer') fx.push({ kind: 'hearts', x: e.x, y: e.y, t: 0, dy: -55, alpha: 0.85 })
      if (e.type === 'place') fx.push({ kind: 'poof', x: e.x, y: e.y, t: 0 })
    }
    if (fx.length > 120) fx.splice(0, fx.length - 120)
  }

  // what was tapped: the tile's occupant, else a drawing covering the point
  function hit(world, sx, sy) {
    const t = tileAt(sx, sy)
    const p = toWorld(sx, sy)
    // a Mano (or two playing together) in front of whatever stands on the tile
    for (let i = drawn.length - 1; i >= 0; i--) {
      const { box, id } = drawn[i]
      if ((id[0] === 'm' || id[0] === 'j') && p.X >= box.x + box.w * 0.15 && p.X <= box.x + box.w * 0.85 && p.Y >= box.y + box.h * 0.1 && p.Y <= box.y + box.h)
        return { id, kind: id[0] === 'm' ? 'mano' : 'pair', tile: [t.x, t.y] }
    }
    if (inMap(t.x, t.y)) {
      const o = world.occ[idx(t.x, t.y)]
      if (o) return { id: o.id, kind: o.kind, tile: [t.x, t.y] }
    }
    for (let i = drawn.length - 1; i >= 0; i--) {
      const { box, id } = drawn[i]
      if (p.X >= box.x && p.X <= box.x + box.w && p.Y >= box.y && p.Y <= box.y + box.h * 0.85) {
        const kind = id === 'camp' ? 'camp' : { b: 'building', d: 'decor', m: 'mano', j: 'pair', n: 'node' }[id[0]]
        return { id, kind, tile: [t.x, t.y] }
      }
    }
    return { tile: [t.x, t.y] }
  }

  return {
    view,
    resize,
    draw: (s, world, ui, dt) => {
      drawPreview = ui.ghost || null
      draw(s, world, ui, dt)
    },
    pan,
    zoomAt,
    lookAtTile,
    tileAt,
    toScreen,
    hit,
    events,
    clamp,
  }
}

export const BUILDING_NAMES = Object.fromEntries(Object.entries(BUILDINGS).map(([k, v]) => [k, v.name]))
