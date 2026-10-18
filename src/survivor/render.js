// MANO SURVIVOR — drawing one frame of the battle. Reads the run, never
// changes it. Everything is drawn in the 360 × 640 logical screen.
//
// Mano: the baked sheets as delivered (128 px cells, rows S SW W NW N NE E SE),
// drawn half size with the foot point [64, 115.5] on her ground position, so
// she stands where she is and never floats. She is never rotated: only the
// row (one of eight facings) changes, with a 6° margin so the facing does not
// flicker on a boundary, and the walking step carries on across a turn.

const DIRS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']
const DIR_ANGLE = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: -135, N: -90, NE: -45 }
const MANO_SCALE = 0.5 // 128 px cell → 64 logical px (Mano about 50 px tall)
const BALL_LIFT = 9 // balls fly a little above the ground (their shadow stays on it)
const MAX_FX = 80
const MAX_NUMBERS = 40

export const IMAGES = {
  walk: new URL('./assets/mano/sheets/walk.png', import.meta.url).href,
  idle: new URL('./assets/mano/sheets/idle.png', import.meta.url).href,
  hit: new URL('./assets/mano/sheets/hit.png', import.meta.url).href,
  down: new URL('./assets/mano/sheets/down.png', import.meta.url).href,
  'jaw-move': new URL('./assets/enemies/jaw-move.png', import.meta.url).href,
  'jaw-hit': new URL('./assets/enemies/jaw-hit.png', import.meta.url).href,
  'jaw-die': new URL('./assets/enemies/jaw-die.png', import.meta.url).href,
  'hunter-move': new URL('./assets/enemies/hunter-move.png', import.meta.url).href,
  'hunter-hit': new URL('./assets/enemies/hunter-hit.png', import.meta.url).href,
  'hunter-die': new URL('./assets/enemies/hunter-die.png', import.meta.url).href,
  'armor-move': new URL('./assets/enemies/armor-move.png', import.meta.url).href,
  'armor-hit': new URL('./assets/enemies/armor-hit.png', import.meta.url).href,
  'armor-die': new URL('./assets/enemies/armor-die.png', import.meta.url).href,
  ball: new URL('./assets/icons/ball.png', import.meta.url).href,
  xp: new URL('./assets/icons/xp.png', import.meta.url).href,
  coin: new URL('./assets/icons/coin.png', import.meta.url).href,
  impact: new URL('./assets/fx/impact.png', import.meta.url).href,
  dust: new URL('./assets/fx/dust.png', import.meta.url).href,
  ground: new URL('./assets/environment/ground.jpg', import.meta.url).href,
}

const load = (src) =>
  new Promise((ok, fail) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => ok(img)
    img.onerror = () => fail(new Error('이미지를 불러오지 못했어요: ' + src))
    img.src = src
  })

let loading = null
export function loadImages() {
  loading ??= Promise.all(Object.entries(IMAGES).map(async ([k, src]) => [k, await load(src)]))
    .then((list) => Object.fromEntries(list))
    .catch((e) => {
      loading = null
      throw e
    })
  return loading
}

// the box (in a 128 px cell) that any of a sheet's n frames draws on
const used = new Map()
function usedBox(img, n) {
  let b = used.get(img.src)
  if (b) return b
  const c = document.createElement('canvas')
  c.width = 128 * n
  c.height = 128
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0, 128 * n, 128, 0, 0, 128 * n, 128)
  const a = g.getImageData(0, 0, 128 * n, 128).data
  let x0 = 128
  let y0 = 128
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128 * n; x++)
      if (a[(y * 128 * n + x) * 4 + 3] > 0) {
        const cx = x % 128
        if (cx < x0) x0 = cx
        if (cx > x1) x1 = cx
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  // a pixel of room each side keeps the smoothing from clipping the edge
  b = x1 < 0 ? { x0: 0, y0: 0, w: 128, h: 128 } : { x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1), w: Math.min(128, x1 + 2) - Math.max(0, x0 - 1), h: Math.min(128, y1 + 2) - Math.max(0, y0 - 1) }
  used.set(img.src, b)
  return b
}

// height of the drawing inside a 128 px cell (for sizing monsters by their real height)
function drawnBox(img, cellX = 0, cell = 128) {
  const c = document.createElement('canvas')
  c.width = cell
  c.height = cell
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, cellX, 0, cell, cell, 0, 0, cell, cell)
  const a = g.getImageData(0, 0, cell, cell).data
  let x0 = cell
  let y0 = cell
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < cell; y++)
    for (let x = 0; x < cell; x++)
      if (a[(y * cell + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

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
  const M = D.mano
  const [AX, AY] = M.groundAnchor
  const CELL = M.cell[0]
  const view = { w: 360, h: 640, dpr: 1, k: 1 }
  const enemySize = {}
  for (const t of ['jaw', 'hunter', 'armor']) {
    const box = drawnBox(img[t + '-move'])
    enemySize[t] = D.balance.enemies[t].drawHeight / box.h
  }
  const ballBox = drawnBox(img.ball)
  const xpBox = drawnBox(img.xp)
  const coinBox = drawnBox(img.coin)
  // Mano's look: kept between frames
  const mano = { dir: 'S', phase: 0, idleT: 0, hitT: 0, downT: 0, prevHit: 0 }
  const fx = []
  const numbers = []
  // the field, painted once per screen size (one copy per frame after that)
  let field = null
  // shadows wait here and go down together, one fill per darkness
  const shade = new Map()
  // sprites shrunk once to their size on screen (again after a resize), so a
  // frame copies pixels 1:1 instead of resampling the big sheets each time
  const shrunk = new Map()

  function resize(cssW, cssH, dpr) {
    // past 2 the 128px art has no more detail to show, only more pixels to fill
    view.dpr = Math.min(dpr || 1, 2)
    view.w = cssW
    view.h = cssH
    view.k = cssW / 360
    canvas.width = Math.round(cssW * view.dpr)
    canvas.height = Math.round(cssH * view.dpr)
    field = null
    shrunk.clear()
  }

  // a 128 px-cell sheet at scale s (in field units), optionally mirrored cell
  // by cell; only the part any frame draws on is kept (most of a cell is empty)
  function shrunkSheet(sheet, s, flip) {
    const key = sheet.src + '|' + s + (flip ? '|f' : '')
    let c = shrunk.get(key)
    if (c) return c
    const n = Math.max(1, Math.round(sheet.width / 128))
    const box = usedBox(sheet, n)
    const q = s * view.k * view.dpr
    const w = Math.max(1, Math.round(box.w * q))
    const h = Math.max(1, Math.round(box.h * q))
    c = document.createElement('canvas')
    c.width = w * n
    c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    for (let i = 0; i < n; i++) {
      g.setTransform(flip ? -1 : 1, 0, 0, 1, flip ? (i + 1) * w : i * w, 0)
      g.drawImage(sheet, i * 128 + box.x0, box.y0, box.w, box.h, 0, 0, w, h)
    }
    Object.assign(c, { w, h, q, box })
    shrunk.set(key, c)
    return c
  }

  // the ball at one size in device pixels (only a few sizes ever occur)
  function shrunkBall(w, h) {
    const key = 'ball|' + w + 'x' + h
    let c = shrunk.get(key)
    if (c) return c
    c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(img.ball, ballBox.x0, ballBox.y0, ballBox.w, ballBox.h, 0, 0, w, h)
    shrunk.set(key, c)
    return c
  }

  function frame(sheet, col, row, x, y, s, alpha = 1) {
    if (alpha !== 1) ctx.globalAlpha = alpha
    ctx.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, x - AX * s, y - AY * s, CELL * s, CELL * s)
    if (alpha !== 1) ctx.globalAlpha = 1
  }

  function shadow(x, y, rx, ry, a = 0.17) {
    let q = shade.get(a)
    if (!q) shade.set(a, (q = []))
    q.push(x, y, rx, ry)
  }

  // all shadows lie on the ground, under everything standing or flying
  function drawShadows() {
    for (const [a, q] of shade) {
      if (!q.length) continue
      ctx.fillStyle = `rgba(38, 49, 62, ${a})`
      ctx.beginPath()
      for (let i = 0; i < q.length; i += 4) {
        ctx.moveTo(q[i] + q[i + 2], q[i + 1])
        ctx.ellipse(q[i], q[i + 1], q[i + 2], q[i + 3], 0, 0, Math.PI * 2)
      }
      ctx.fill()
      q.length = 0
    }
  }

  function paintField() {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    const f = c.getContext('2d')
    const k = view.k * view.dpr
    f.setTransform(k, 0, 0, k, 0, 0)
    f.imageSmoothingEnabled = true
    f.imageSmoothingQuality = 'high'
    // one ground picture covering the screen, softened
    const g = img.ground
    const cover = Math.max(360 / g.width, 640 / g.height)
    f.fillStyle = '#d8ccb8'
    f.fillRect(0, 0, 360, 640)
    f.globalAlpha = 0.6
    f.drawImage(g, (360 - g.width * cover) / 2, (640 - g.height * cover) / 2, g.width * cover, g.height * cover)
    f.globalAlpha = 1
    const [x0, y0, x1, y1] = D.balance.logicalArena.bounds
    // outside the field (behind the top bar): a little darker
    f.fillStyle = 'rgba(38, 49, 62, 0.16)'
    f.fillRect(0, 0, 360, y0)
    f.fillRect(0, y1, 360, 640 - y1)
    f.fillRect(0, y0, x0, y1 - y0)
    f.fillRect(x1, y0, 360 - x1, y1 - y0)
    f.strokeStyle = 'rgba(38, 49, 62, 0.25)'
    f.lineWidth = 1.5
    f.strokeRect(x0, y0, x1 - x0, y1 - y0)
    return c
  }

  // ── Mano ──
  function drawMano(run, dt) {
    const p = run.player
    const st = M.states
    if (p.moving) mano.dir = facing(mano.dir, p.vx, p.vy)
    const row = DIRS.indexOf(mano.dir)
    if (p.hitT > 0 && mano.prevHit <= 0) mano.hitT = st.hit.durationSeconds
    mano.prevHit = p.hitT
    let sheet
    let col
    if (run.state === 'dying' || run.state === 'over') {
      if (!run.result || !run.result.cleared) {
        mano.downT = Math.min(st.down.durationSeconds, mano.downT + dt)
        sheet = img.down
        col = Math.min(st.down.framesPerDirection - 1, Math.floor((mano.downT / st.down.durationSeconds) * st.down.framesPerDirection))
      }
    } else mano.downT = 0
    if (!sheet && mano.hitT > 0) {
      mano.hitT -= dt
      sheet = img.hit
      col = Math.min(st.hit.framesPerDirection - 1, Math.floor((1 - mano.hitT / st.hit.durationSeconds) * st.hit.framesPerDirection))
    }
    if (!sheet && p.moving && run.state === 'play') {
      // the step goes on through a turn: one phase, whatever the facing
      const rate = Math.max(0.7, Math.min(1.5, Math.hypot(p.vx, p.vy) / D.balance.player.speed))
      mano.phase = (mano.phase + (dt / st.walk.durationSeconds) * rate) % 1
      sheet = img.walk
      col = Math.floor(mano.phase * st.walk.framesPerDirection) % st.walk.framesPerDirection
    }
    if (!sheet) {
      mano.idleT += run.state === 'play' ? dt : 0
      sheet = img.idle
      col = Math.floor(((mano.idleT % st.idle.durationSeconds) / st.idle.durationSeconds) * st.idle.framesPerDirection)
    }
    // blink while she cannot be hurt
    const blink = p.inv > 0 && run.state === 'play' && Math.floor(p.inv * 14) % 2 === 0
    frame(sheet, col, row, p.x, p.y, MANO_SCALE, blink ? 0.45 : 1)
  }

  // ── monsters ──
  function drawEnemy(e) {
    const art = D.enemiesArt[e.type]
    const s = enemySize[e.type]
    const [ax, ay] = art.anchor
    let sheet
    let col
    let alpha = 1
    if (e.state === 'spawn') {
      // where it will appear: a shadow growing in, the body fading in
      const f = Math.min(1, e.t / 0.35)
      alpha = 0.25 + 0.45 * f
      sheet = img[e.type + '-move']
      col = 0
    } else if (e.state === 'die') {
      const d = art.states.die
      sheet = img[e.type + '-die']
      col = Math.min(d.frames - 1, Math.floor((e.t / d.durationSeconds) * d.frames))
    } else if (e.hitT > 0) {
      const h = art.states.hit
      sheet = img[e.type + '-hit']
      col = Math.min(h.frames - 1, Math.floor((1 - e.hitT / h.durationSeconds) * h.frames))
    } else {
      const m = art.states.move
      sheet = img[e.type + '-move']
      col = Math.floor((((e.t + e.id * 0.137) % m.durationSeconds) / m.durationSeconds) * m.frames)
    }
    // the feet stay on the anchor; mirrored, the kept box mirrors around it
    const c = shrunkSheet(sheet, s, e.face < 0)
    const { w, h, q, box } = c
    const kd = view.k * view.dpr
    const dx = e.face < 0 ? ax - box.x0 - box.w : box.x0 - ax
    if (alpha !== 1) ctx.globalAlpha = alpha
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(c, col * w, 0, w, h, Math.round(e.x * kd + dx * q), Math.round(e.y * kd + (box.y0 - ay) * q), w, h)
    ctx.setTransform(kd, 0, 0, kd, 0, 0)
    if (alpha !== 1) ctx.globalAlpha = 1
  }

  // (drawn in device pixels: the caller has set the identity transform)
  function drawBall(b, kd) {
    const d = b.r * 2 * kd
    // a short tail: where it was a few hundredths of a second ago, faint
    const t = b.trail
    if (t.length > 3) {
      const tw = Math.max(1, Math.round(d * 0.8))
      const tail = shrunkBall(tw, tw)
      for (let i = 0; i + 2 < t.length - 3; i += 3) {
        ctx.globalAlpha = 0.12 + 0.1 * (i / t.length)
        ctx.drawImage(tail, Math.round(t[i + 1] * kd - tw / 2), Math.round((t[i + 2] - BALL_LIFT) * kd - tw / 2))
      }
      ctx.globalAlpha = 1
    }
    const w = Math.max(1, Math.round(d))
    const h = Math.max(1, Math.round((d * ballBox.h) / ballBox.w))
    ctx.drawImage(shrunkBall(w, h), Math.round(b.x * kd - w / 2), Math.round((b.y - BALL_LIFT) * kd - w / 2))
  }

  function drawOrb(o) {
    const box = o.kind === 'xp' ? xpBox : coinBox
    const size = o.kind === 'xp' ? 9 + Math.min(6, Math.sqrt(o.v)) : 11
    const bob = Math.sin(performance.now() / 260 + o.x) * 1.2
    ctx.drawImage(o.kind === 'xp' ? img.xp : img.coin, box.x0, box.y0, box.w, box.h, o.x - size / 2, o.y - size - 1 + bob, size, (size * box.h) / box.w)
  }

  // ── one frame ──
  function draw(run, dt) {
    const k = view.k * view.dpr
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (!field) field = paintField()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(field, 0, 0)
    ctx.setTransform(k, 0, 0, k, 0, 0)

    // shadows first (all on the ground), then pickups, then standing things
    // back to front, then balls in the air
    const p = run.player
    shadow(p.x, p.y, 15, 5)
    for (const e of run.enemies) {
      if (e.state === 'spawn') {
        const f = Math.min(1, e.t / 0.35)
        shadow(e.x, e.y, e.r * 1.2 * f, e.r * 0.45 * f, 0.28)
      } else shadow(e.x, e.y, e.r * 1.15, e.r * 0.42)
    }
    for (const b of run.balls) shadow(b.x, b.y, b.r * 0.9, b.r * 0.35, 0.16)
    drawShadows()
    for (const o of run.orbs) drawOrb(o)
    const list = []
    for (const e of run.enemies) list.push([e.y, 0, e])
    list.push([run.player.y, 1, run.player])
    list.sort((a, b) => a[0] - b[0])
    for (const [, kind, o] of list) (kind ? drawMano(run, dt) : drawEnemy(o))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (const b of run.balls) drawBall(b, k)
    ctx.setTransform(k, 0, 0, k, 0, 0)

    // effects from this frame's events
    for (const ev of run.events) {
      if (ev.type === 'hit') {
        if (fx.length < MAX_FX) fx.push({ kind: 'impact', x: ev.x, y: ev.y - BALL_LIFT, t: 0, d: 0.16, size: 20 })
        if (numbers.length < MAX_NUMBERS) numbers.push({ x: ev.x, y: ev.y - 18, n: Math.round(ev.n), t: 0, hurt: false })
      } else if (ev.type === 'die') {
        if (fx.length < MAX_FX) fx.push({ kind: 'dust', x: ev.x, y: ev.y - 8, t: 0, d: 0.3, size: ev.kind === 'armor' ? 56 : 36 })
      } else if (ev.type === 'hurt') {
        if (numbers.length < MAX_NUMBERS) numbers.push({ x: ev.x, y: ev.y - 52, n: Math.round(ev.n), t: 0, hurt: true })
      }
    }
    run.events.length = 0
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]
      f.t += dt
      if (f.t >= f.d) {
        fx.splice(i, 1)
        continue
      }
      const col = Math.min(3, Math.floor((f.t / f.d) * 4))
      ctx.drawImage(img[f.kind], col * 128, 0, 128, 128, f.x - f.size / 2, f.y - f.size / 2, f.size, f.size)
    }
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
      ctx.strokeStyle = 'rgba(255, 243, 220, 0.9)'
      ctx.strokeText(n.hurt ? `-${n.n}` : String(n.n), n.x, y)
      ctx.fillStyle = n.hurt ? '#d9524a' : '#26313e'
      ctx.fillText(n.hurt ? `-${n.n}` : String(n.n), n.x, y)
    }
    ctx.globalAlpha = 1
  }

  return { resize, draw, view, mano, reset: () => Object.assign(mano, { dir: 'S', phase: 0, idleT: 0, hitT: 0, downT: 0, prevHit: 0 }) }
}

// a small looping Mano for the equipment screen (idle, facing the viewer)
export function drawIdlePreview(canvas, img, D, t, dir = 'S') {
  const g = canvas.getContext('2d')
  const st = D.mano.states.idle
  const col = Math.floor(((t % st.durationSeconds) / st.durationSeconds) * st.framesPerDirection)
  const row = DIRS.indexOf(dir)
  g.clearRect(0, 0, canvas.width, canvas.height)
  g.imageSmoothingQuality = 'high'
  const s = canvas.height / 128
  g.drawImage(img.idle, col * 128, row * 128, 128, 128, (canvas.width - 128 * s) / 2, 0, 128 * s, 128 * s)
}
