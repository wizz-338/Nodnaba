// MANO SURVIVOR — drawing one frame of the battle. Reads the run, never
// changes it. The world is the platform's logical screen (360 × 640 on
// mobile, 640 × 360 on PC; see platform.js); sprites are the v3
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
import { createExtraFx } from './render-extra.js'
import { createZyoFx } from './render-zyo.js'

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
// Mano's ↘ / ↙ run frames are drawn about a fifth smaller in the sheet (her
// head and body 39.5 px tall against 49.3 px in every other direction):
// those two get this one fixed correction, always the same, around her feet
// (never a fit frame by frame)
const MANO_FIX = { run_se: 49.3 / 39.5, run_sw: 49.3 / 39.5 }
const BALL_LIFT = 7 // balls fly a little above the ground (their shadow stays on it)
const CAT_STRIDE = 7 // logical px run per leg frame
const POP = 0.35 // s a 퍼센트 하트 takes to jump out of a cat

// A 퍼센트 하트 (the art package has none): a pixel heart brighter pink than
// the normal one, with a magenta edge, a light shine and a small white % in it
const HEART_W = 13
const HEART_H = 12
const PERCENT = ['ww..w', 'ww.w.', '..w..', '.w.ww', 'w..ww']
const MAX_FX = 80
const MAX_NUMBERS = 40
const MAX_SLASH = 24 // friend cats' scratches on screen at once (a busy screen: a third)
const SLASH = 0.2 // s a scratch shows
const CRIT_COLOR = '#e5303a'
// the numbers: white with a dark edge (the hits), red (Mano hurt), green
// (healed), pink (the cats' words)
const NUM_COLOR = '#ffffff'
const NUM_EDGE = 'rgba(26, 21, 48, 0.92)'
const HURT_COLOR = '#ff4d5a'
const HEAL_COLOR = '#5ff07f'
const CAT_COLOR = '#ff7cc4'
// a monster that falls throws a few sparks (an elite or a boss many, and a
// ring); a busy screen fewer
const MAX_SPARKS = 140
const SPARK = 0.42 // s a spark lives
const SPARK_COLORS = ['#fff6c2', '#ffd84a', '#ff9a3d', '#ffffff']
// the screen shakes (never with reduced motion): Mano hurt, a meteor
// landing, an elite or a boss falling — px and s of each
const KICK = { hurt: [3, 0.18], meteor: [4.5, 0.18], slash: [1.6, 0.1], big: [7, 0.32] }
// a monster hit jolts: it swells a little, squashed, and is pushed a few px
// away from Mano, for its hit flash's 0.12 s
const PUNCH = 0.12
const PUNCH_SCALE = 0.16
const PUNCH_PX = 3
// the turrets (turret.js): drawn in code (a stone block and a white-and-blue
// cannon with a red mouth, as in chapter 20's cutscene), turned to what it
// shoots; its shot a little red ball, flying SHOT s
const TURRET_H = 16 // the cannon's height over the ground (the turret drawn in code)
const TURRET_DRAW_H = 40 // the turret's picture's height (field px)
// its eight ways, by its aim's angle (0: east, then clockwise on the screen)
const TURRET_WAYS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
const AIMS = 32 // the cannon's pictures, one for each of these angles
const GUN_R = 20 // half the side of a cannon's picture (its longest reach is 19)
const SHOT = 0.12
const FLASH = 0.09 // a turret's muzzle flash (s)
const MAX_SHOTS = 60
// Mano's own health bar under her feet (logical px)
const HPBAR_W = 30
const HPBAR_H = 4.5
// the game's round font (survivor.css loads it; until it is in, the system's)
const GAME_FONT = "'Jua', system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif"
const NUM_FONT = '12px ' + GAME_FONT
// an ordinary boss getting ready to strike (its own moves, or a skill's
// warning: bosses.js), and striking
const winding = (e) => e.mode === 'windup' || e.mode === 'aim' || e.mode === 'rushWind' || (e.mode === 'skill' && (e.stage === 'ready' || e.stage === 'charge'))
const striking = (e) => e.mode === 'charge' || e.mode === 'rush' || (e.mode === 'skill' && (e.stage === 'strike' || !!e.dash))
const CRIT_FONT = '14px ' + GAME_FONT // about 17% larger
// a critical number's size over time: in quickly a little large, settles, stays
// how far a number has risen t s in: 26 px, quickly at first
const rise = (t) => 26 * (1 - (1 - Math.min(1, t / 0.6)) ** 3)
const critPop = (t) => (t < 0.08 ? 0.75 + (t / 0.08) * 0.5 : t < 0.18 ? 1.25 - ((t - 0.08) / 0.1) * 0.25 : 1)
const ENEMY_DIE = 0.28
const BOLT = 0.18 // s a lightning stroke stays
const MAX_BOLTS = 12
// how far a monster's entry has gone (0 → 1): 0.35 s for most; the extra
// special boss's lasts its own `enter` s
const spawnK = (e) => {
  const d = e.enter || 0.35
  return Math.max(0, Math.min(1, (e.t + d - 0.35) / d))
}
const MOVE_PACE = 6 // px/s: slower than this a walking monster stands (its feet stop)
const DANGER = '214, 58, 58' // the colour of a blow to come
// the special bosses' shots: core and glow
const SHOT_LOOK = { seed: ['#7a5a2a', '#cbe58a'], spark: ['#fff6b0', '#ffd23f'], bone: ['#f4ecd8', '#9c8f7a'], crystal: ['#e9fbff', '#7fd4f0'], ice: ['#f2fbff', '#9fdcff'], void: ['#e6c8ff', '#7a3fc4'] }

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

// art: the story package's pictures, { now(id) → image or null } (a picture
// not loaded yet, or that failed, falls back to the game's own art)
// screen: the platform's logical screen — [360, 640] on mobile, [1152, 648]
// on PC — bg: which background a region uses there (its id → the id drawn;
// the PC game has wide ones), and inset: [left, top, right, bottom] of the
// screen around its play area, for a field larger than the screen (the PC
// game's): the camera then shows the run's view there. Everything else is
// drawn the same.
export function createRenderer(canvas, img, D, art = { now: () => null }, { screen = [360, 640], bg = (id) => id, inset = null } = {}) {
  const [SW, SH] = screen
  const ctx = canvas.getContext('2d')
  const view = { w: SW, h: SH, dpr: 1, k: 1 }
  const cam = { x: 0, y: 0 } // the world point at the screen's top left (0, 0 without a camera)
  const mano = { dir: 'S', phase: 0, idleT: 0, hitT: 0, downT: 0, prevHit: 0 }
  const fx = []
  const numbers = []
  const sparks = []
  const shots = [] // the turrets' balls in flight
  const flashes = [] // their muzzle flashes
  const rings = [] // a bright ring where an elite or boss fell
  let shakeT = 0
  let shakeDur = 1
  let shakeAmp = 0
  let shaken = false
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let glow = null // the soft light under an experience gem, made once
  let field = null // the ground, painted once per screen size
  const shade = new Map() // shadows wait here and go down together, one fill per darkness
  const small = new Map() // smoothed copies of frames drawn smaller than their pixels
  const tints = new Map() // white / red silhouettes of each sheet, for flashes
  const skins = new Map() // the story's monsters, scaled once per size: { base, white, ice }
  const motions = new Map() // their animation frames, scaled once per size (see motionSet)
  const MOTION = D.motion.characters
  let xfx = null // the extra special bosses' attacks (render-extra.js)
  let zfx = null // zyo_'s class change (render-zyo.js)
  const bolts = [] // lightning of the thunder blessing, a moment each
  const E = D.balance.enemies
  const CATS = D.balance.cats
  let pheart = null // the 퍼센트 하트 bitmap, made once
  // the friend cats (friends.js): their atlas scaled once per size, scratches
  const FC = D.friendCat
  // the turret's picture: its frames and mouths (ep04-assets.json → turret)
  const TURRET_ART = (() => {
    const e = D.storyAssets.images.find((x) => x.id === 'turret')
    return e && { frames: e.frames, muzzle: e.muzzle, h: Math.max(...Object.values(e.frames).map((f) => f[5])) }
  })()
  const FCB = D.balance.friendCats
  const fcScaled = new Map()
  const slashes = []

  function makeHeart() {
    // inside the heart curve (x² + y² − 1)³ − x²y³ ≤ 0, on a 13 × 12 grid
    const inside = (i, j) => {
      if (i < 0 || j < 0 || i >= HEART_W || j >= HEART_H) return false
      const x = ((i + 0.5) / HEART_W - 0.5) * 2.5
      const y = (0.5 - (j + 0.5) / HEART_H) * 2.5 + 0.2
      return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0
    }
    const c = document.createElement('canvas')
    c.width = HEART_W
    c.height = HEART_H
    const g = c.getContext('2d')
    for (let j = 0; j < HEART_H; j++)
      for (let i = 0; i < HEART_W; i++) {
        if (!inside(i, j)) continue
        const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1)
        g.fillStyle = edge ? '#c93c86' : i < 5 && j < 4 ? '#ffd0e8' : '#ff8cc6'
        g.fillRect(i, j, 1, 1)
      }
    g.fillStyle = '#ffffff'
    PERCENT.forEach((row, y) => [...row].forEach((ch, x) => ch === 'w' && g.fillRect(4 + x, 3 + y, 1, 1)))
    return c
  }

  function resize(cssW, cssH, dpr) {
    // past 2 the art has no more detail to show, only more pixels to fill
    view.dpr = Math.min(dpr || 1, 2)
    view.w = cssW
    view.h = cssH
    view.k = cssW / SW
    canvas.width = Math.round(cssW * view.dpr)
    canvas.height = Math.round(cssH * view.dpr)
    field = null
    small.clear()
    skins.clear()
    motions.clear()
    fcScaled.clear()
  }
  const kd = () => view.k * view.dpr
  const world = () => ctx.setTransform(kd(), 0, 0, kd(), -cam.x * kd(), -cam.y * kd())
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
    const dx = Math.round((left - cam.x) * K)
    const dy = Math.round((y - cam.y - (py - b.y) * s) * K)
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

  // The ground, painted once per screen size (and once more when the
  // region's picture arrives): the region's background covering the whole
  // 360 × 640 screen (cut evenly at the sides, never stretched, a little
  // dimmed so monsters, the ball and pickups stand out); until it is there,
  // or if it fails, the ground tile laid edge to edge, every other one
  // mirrored so the edges always meet. The field's walls are the game's, not
  // the picture's: nothing in the picture is solid.
  const fieldKey = (run) => {
    const id = run.region && bg(run.region.background)
    return id && art.now(id) ? id : 'tile'
  }
  function paintField(run) {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    const g = c.getContext('2d')
    const K = kd()
    c.key = fieldKey(run)
    const pic = c.key !== 'tile' && art.now(c.key)
    if (pic) {
      const s = Math.max(SW / pic.width, SH / pic.height)
      const w = pic.width * s
      const h = pic.height * s
      g.setTransform(K, 0, 0, K, 0, 0)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(pic, (SW - w) / 2, (SH - h) / 2, w, h)
      g.fillStyle = 'rgba(24, 18, 28, 0.16)'
      g.fillRect(0, 0, SW, SH)
    } else {
      const tile = img['09_ground.png']
      const T = tile.width // one art pixel per logical pixel
      g.imageSmoothingEnabled = false
      for (let j = 0; j * T < SH; j++)
        for (let i = 0; i * T < SW; i++) {
          const fx = i % 2 === 1
          const fy = j % 2 === 1
          g.setTransform(fx ? -K : K, 0, 0, fy ? -K : K, (fx ? (i + 1) * T : i * T) * K, (fy ? (j + 1) * T : j * T) * K)
          g.drawImage(tile, 0, 0)
        }
    }
    g.setTransform(K, 0, 0, K, 0, 0)
    const [x0, y0, x1, y1] = run.arena.bounds
    // the edge of the field: a soft darker band and a thin line (the balls
    // bounce here, Mano stops here)
    g.fillStyle = 'rgba(30, 38, 30, 0.18)'
    g.fillRect(0, 0, SW, y0)
    g.fillRect(0, y1, SW, SH - y1)
    g.fillRect(0, y0, x0, y1 - y0)
    g.fillRect(x1, y0, SW - x1, y1 - y0)
    g.strokeStyle = 'rgba(30, 38, 30, 0.28)'
    g.lineWidth = 1.5
    g.strokeRect(x0, y0, x1 - x0, y1 - y0)
    return c
  }

  // A field larger than the screen (the PC game): the region's picture
  // covers the whole field and the screen's margin around it (never
  // stretched; until it is there, a plain ground colour), a little dimmed like
  // the phone's. It is painted once per size at the screen's resolution, and
  // each frame copies the camera's part of it; then the margin around the
  // play area — the view, where the monsters stay and the balls bounce — gets
  // a darker band and a thin line, as on the phone.
  let ground = null
  function paintGround(run) {
    const [x0, y0, x1, y1] = run.arena.bounds
    const [l, t, r, b] = inset
    const K = kd()
    const c = document.createElement('canvas')
    c.key = fieldKey(run) + '|' + K
    c.gx = x0 - l
    c.gy = y0 - t
    const gw = x1 - x0 + l + r
    const gh = y1 - y0 + t + b
    c.width = Math.ceil(gw * K)
    c.height = Math.ceil(gh * K)
    const g = c.getContext('2d')
    const pic = !c.key.startsWith('tile|') && art.now(fieldKey(run))
    g.setTransform(K, 0, 0, K, 0, 0)
    if (pic) {
      const s = Math.max(gw / pic.width, gh / pic.height)
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(pic, (gw - pic.width * s) / 2, (gh - pic.height * s) / 2, pic.width * s, pic.height * s)
      g.fillStyle = 'rgba(24, 18, 28, 0.16)'
    } else g.fillStyle = '#6d7356'
    g.fillRect(0, 0, gw, gh)
    return c
  }
  function drawGround(run) {
    const K = kd()
    if (!ground || ground.key !== fieldKey(run) + '|' + K) ground = paintGround(run)
    device()
    const sx = Math.round((cam.x - ground.gx) * K)
    const sy = Math.round((cam.y - ground.gy) * K)
    ctx.drawImage(ground, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
    // the play area's frame, in screen units
    const [l, t, r, b] = inset
    ctx.setTransform(K, 0, 0, K, 0, 0)
    ctx.fillStyle = 'rgba(30, 38, 30, 0.18)'
    ctx.fillRect(0, 0, SW, t)
    ctx.fillRect(0, SH - b, SW, b)
    ctx.fillRect(0, t, l, SH - t - b)
    ctx.fillRect(SW - r, t, r, SH - t - b)
    ctx.strokeStyle = 'rgba(30, 38, 30, 0.28)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(l, t, SW - l - r, SH - t - b)
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
    let fix = 1
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
      const anim = 'run_' + dir.toLowerCase()
      name = animFrame(anim, mano.phase)
      fix = MANO_FIX[anim] || 1
    }
    if (!name) {
      mano.idleT += run.state === 'play' ? dt : 0
      const [a, f] = IDLE[dir]
      name = animFrame(a, mano.idleT * 1000)
      flip = f
    }
    put(name, p.x, p.y, MANO_SCALE * fix, { ...opt, flip })
  }

  // ── monsters ──
  // a story monster's picture at one size, made once: as it is, a white
  // silhouette (hit flash) and a pale blue one (frozen)
  function skinSet(id, pic, px) {
    const key = id + '|' + px
    let c = skins.get(key)
    if (c) return c
    const s = px / Math.max(pic.width, pic.height)
    const w = Math.max(1, Math.round(pic.width * s))
    const h = Math.max(1, Math.round(pic.height * s))
    const make = (color) => {
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(pic, 0, 0, w, h)
      if (color) {
        g.globalCompositeOperation = 'source-in'
        g.fillStyle = color
        g.fillRect(0, 0, w, h)
      }
      return cv
    }
    c = { base: make(null), white: make('#ffffff'), ice: make('#bfeaff') }
    skins.set(key, c)
    return c
  }

  // A story monster: its still picture, feet on its spot, with life added in
  // code (no frames exist): a small hop and sway as it goes, a shake before
  // the boss charges, a lean in the charge, flashes when hit, pale blue and
  // still when frozen.
  function drawSkin(run, e, pic) {
    const meta = D.story.monsters[e.skin] || {}
    const size = meta.size || D.story.roleSize[e.type] || 32
    const K = kd()
    const long = Math.max(pic.width, pic.height)
    const w = (pic.width / long) * size
    const h = (pic.height / long) * size
    const set = skinSet(e.skin, pic, Math.max(8, Math.round(size * K)))
    const boss = e.behavior === 'boss'
    const frozen = e.freezeT > 0
    let bob = 0
    let rot = 0
    let dx = 0
    let alpha = 1
    let flash = e.hitT > 0 ? Math.min(1, e.hitT / 0.12) * 0.8 : 0
    if (e.state === 'live' && !frozen) {
      const t = e.life
      bob = -Math.abs(Math.sin(t * (boss ? 4 : 7.5) + e.id)) * (boss ? 2 : 1.6)
      rot = Math.sin(t * (boss ? 2.4 : 5) + e.id) * (boss ? 0.025 : 0.06)
      if (boss && winding(e)) dx = Math.sin(performance.now() / 22) * 1.3
      else if (boss && striking(e)) rot = 0.12 * (e.face >= 0 ? 1 : -1)
    }
    if (e.state === 'down') (rot = 0.45), (alpha = 0.85), (flash = 0)
    else if (e.state === 'spawn') alpha = 0.25 + 0.6 * spawnK(e)
    else if (e.state === 'die') (alpha = Math.max(0, 1 - e.t / ENEMY_DIE)), (flash = 0.9)
    else if (e.state === 'gone') alpha = Math.max(0, 1 - e.t / ENEMY_DIE)
    const flip = meta.faces === 'right' && e.face < 0
    const pu = punch(run, e)
    ctx.setTransform(flip ? -K : K, 0, 0, K, (e.x + dx + pu.ox - cam.x) * K, (e.y + 3 + bob + pu.oy - cam.y) * K)
    if (rot) ctx.rotate(flip ? -rot : rot)
    if (pu !== still) ctx.scale(pu.sx, pu.sy)
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = alpha
    ctx.drawImage(set.base, -w / 2, -h, w, h)
    if (frozen) {
      ctx.globalAlpha = alpha * 0.55
      ctx.drawImage(set.ice, -w / 2, -h, w, h)
    }
    if (flash > 0) {
      ctx.globalAlpha = alpha * flash
      ctx.drawImage(set.white, -w / 2, -h, w, h)
    }
    ctx.globalAlpha = 1
  }

  // ── the animated monsters (data/motion.json) ──
  // One scale for every frame of a character (its size over the long side of
  // its first walking pose), each frame's pivot (feet; a flyer's body centre)
  // on its spot, turned round about that pivot. Frames are cut out of the
  // atlas and scaled once per size, each into its own canvas with a clear
  // edge (so a neighbour never bleeds in), with white and pale-blue copies
  // for the hit flash and the frost.
  const sizeOf = (e) => e.size || (D.story.monsters[e.skin] || {}).size || D.story.roleSize[e.type] || 32
  function motionSet(id, atlas, size) {
    const m = MOTION[id]
    const s = size / m.refLong
    const q = Math.min(1, s * kd()) // canvas px per atlas px (never more than the atlas has)
    const key = id + '|' + size + '|' + q.toFixed(4)
    let set = motions.get(key)
    if (set) return set
    const make = (f, color) => {
      const c = document.createElement('canvas')
      c.width = Math.ceil(f[2] * q) + 2
      c.height = Math.ceil(f[3] * q) + 2
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(atlas, f[0], f[1], f[2], f[3], 1, 1, f[2] * q, f[3] * q)
      if (color) {
        g.globalCompositeOperation = 'source-in'
        g.fillStyle = color
        g.fillRect(0, 0, c.width, c.height)
      }
      return c
    }
    const f0 = m.frames[m.animations.move.frames[0]]
    set = {
      s,
      q,
      // a flyer hangs its body centre this far above its spot (its first
      // pose's bottom on the ground), the same for every frame
      lift: m.fly ? (f0[3] - f0[5]) * s : 0,
      frames: m.frames.map((f) => ({ f, base: make(f, null), white: make(f, '#ffffff'), ice: make(f, '#bfeaff') })),
    }
    motions.set(key, set)
    return set
  }

  // which frame of an animation plays ms into it (looped, or held on its last)
  function frameAt(m, name, ms, loop) {
    const fr = m.animations[name].frames
    let total = 0
    for (const i of fr) total += m.durations[i]
    let t = loop ? ms % total : Math.min(ms, total - 1)
    for (const i of fr) if ((t -= m.durations[i]) < 0) return i
    return fr[fr.length - 1]
  }

  // its attack pose now (0 getting ready, 1 the blow, 2 coming back; the
  // extra special bosses have four: ready, charge, strike, recover), or -1
  function attackPose(e) {
    if (e.behavior === 'extra') return e.stage === 'ready' ? 0 : e.stage === 'charge' ? 1 : e.stage === 'strike' ? 2 : e.stage === 'recover' ? 3 : -1
    if (e.behavior !== 'boss') return -1
    return winding(e) ? 0 : striking(e) ? 1 : e.mode === 'rest' || (e.mode === 'skill' && e.stage === 'recover') ? 2 : -1
  }

  // A monster from its frames: walking (four frames by time; a walker that
  // stands still stands on its first, a flyer keeps flapping), its attack's
  // three poses with the attack's own stages, its death once (bosses and
  // mid-bosses: then held, then faded), an ordinary monster's end a flash
  // and a fade on the pose it had. Burrowed, it is not drawn.
  function drawMotion(run, e, m, atlas) {
    if (e.under) return
    const set = motionSet(e.skin, atlas, sizeOf(e))
    const A = m.animations
    const big = e.behavior === 'boss' || e.behavior === 'extra'
    const walking = m.fly || (e.pace || 0) > MOVE_PACE
    const step = () => (walking ? frameAt(m, 'move', e.life * 1000 + e.id * 37, true) : A.move.frames[0])
    let i
    let alpha = 1
    let flash = e.hitT > 0 ? Math.min(1, e.hitT / 0.12) * 0.8 : 0
    if (e.state === 'spawn') (i = A.move.frames[0]), (alpha = 0.25 + 0.6 * spawnK(e))
    else if (e.state === 'live') {
      const pose = A.attack ? attackPose(e) : -1
      i = pose >= 0 ? A.attack.frames[pose] : step()
    } else if (e.state === 'down') {
      flash = 0
      if (A.death) {
        i = frameAt(m, 'death', e.t * 1000, false)
        // the chapter's boss: held a while, then faded as the chapter ends
        // (a mid-boss lies until its own fade, below)
        if (e === run.boss || e.behavior === 'extra') {
          const end = e.downSeconds ?? E[e.type].downSeconds
          alpha = Math.max(0, Math.min(1, (end - e.t) / (end / 3)))
        }
      } else (i = A.move.frames[0]), (alpha = 0.85)
    } else if (e.state === 'die') (i = step()), (alpha = Math.max(0, 1 - e.t / ENEMY_DIE)), (flash = 0.9)
    else if (e.state === 'gone') (i = big && A.death ? A.death.frames[A.death.frames.length - 1] : step()), (alpha = Math.max(0, 1 - e.t / ENEMY_DIE)), (flash = 0)
    if (alpha <= 0) return
    const fr = set.frames[i]
    const [, , fw, fh, px, py] = fr.f
    const { s, q } = set
    const K = kd()
    const pad = s / q // one canvas px, in logical px
    const flip = e.face < 0 // the art faces right
    const pu = punch(run, e)
    ctx.setTransform(flip ? -K : K, 0, 0, K, (e.x + pu.ox - cam.x) * K, (e.y + 3 - set.lift + pu.oy - cam.y) * K)
    if (pu !== still) ctx.scale(pu.sx, pu.sy)
    ctx.imageSmoothingEnabled = true
    const x = -px * s - pad
    const y = -py * s - pad
    const w = fr.base.width * pad
    const h = fr.base.height * pad
    ctx.globalAlpha = alpha
    ctx.drawImage(fr.base, x, y, w, h)
    if (e.freezeT > 0) {
      ctx.globalAlpha = alpha * 0.55
      ctx.drawImage(fr.ice, x, y, w, h)
    }
    if (flash > 0) {
      ctx.globalAlpha = alpha * flash
      ctx.drawImage(fr.white, x, y, w, h)
    }
    ctx.globalAlpha = 1
  }

  function drawEnemy(run, e) {
    const m = e.skin && MOTION[e.skin]
    const atlas = m && art.now('motion:' + e.skin)
    if (atlas) return drawMotion(run, e, m, atlas)
    const pic = e.skin && art.now(e.skin)
    if (pic) return drawSkin(run, e, pic)
    const def = E[e.type]
    const s = def.scale
    const look = def.art // which pictures it wears (the mid-boss wears the boss's)
    const flip = e.face < 0
    let name
    let alpha = 1
    let flash = e.hitT > 0 ? Math.min(1, e.hitT / 0.12) * 0.8 : 0
    if (e.behavior === 'boss') {
      if (e.state === 'down') (name = 'boss_down'), (flash = 0)
      else if (winding(e)) name = 'boss_windup'
      else if (striking(e)) name = 'boss_charge'
      else if (e.hitT > 0) name = 'boss_hit'
      else name = animFrame('boss_run', e.life * 1000)
    } else name = animFrame(look + '_run', e.life * 1000 + e.id * 37)
    if (e.state === 'spawn') alpha = 0.25 + 0.6 * spawnK(e)
    else if (e.state === 'die') (alpha = Math.max(0, 1 - e.t / ENEMY_DIE)), (flash = 0.9)
    else if (e.state === 'gone') alpha = Math.max(0, 1 - e.t / ENEMY_DIE)
    // frozen (snow blessing): a pale blue cast
    const pu = punch(run, e)
    if (e.freezeT > 0 && !flash) put(name, e.x, e.y, s, { flip, alpha, flash: 0.5, flashColor: '#bfeaff' })
    else put(name, e.x + pu.ox, e.y + pu.oy, s * pu.sx, { flip, alpha, flash })
  }

  // a stroke of lightning: a few jagged steps from above the hit to the one struck
  function drawBolt(b) {
    const k = 1 - b.t / BOLT
    world()
    ctx.beginPath()
    ctx.moveTo(b.x0, b.y0)
    for (let i = 1; i < 4; i++) {
      const f = i / 4
      ctx.lineTo(b.x0 + (b.x1 - b.x0) * f + b.j[i - 1], b.y0 + (b.y1 - b.y0) * f)
    }
    ctx.lineTo(b.x1, b.y1 - 6)
    ctx.lineCap = 'round'
    ctx.strokeStyle = `rgba(255, 236, 130, ${0.35 * k})`
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 255, 235, ${0.95 * k})`
    ctx.lineWidth = 1.8
    ctx.stroke()
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

  // type D about to run: a ring round it, closing in as the run nears, and
  // an arrow at Mano
  // an enraged ordinary boss (bosses.js → bossSkills.enrage): a red glow
  // pulsing under it
  function drawRage(e, now) {
    world()
    const k = 0.5 + 0.5 * Math.sin(now / 140)
    const g = ctx.createRadialGradient(e.x, e.y, e.r * 0.4, e.x, e.y, e.r * 2.1)
    g.addColorStop(0, `rgba(255, 70, 50, ${0.32 + 0.18 * k})`)
    g.addColorStop(1, 'rgba(255, 70, 50, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * 2.1, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawRush(run, e) {
    const k = 1 - e.modeT / D.balance.bossTypes.D.warn
    const r = e.r + 10
    world()
    ctx.beginPath()
    ctx.arc(e.x, e.y, r + 14 * (1 - k), 0, Math.PI * 2)
    ctx.lineWidth = 3.5
    ctx.strokeStyle = 'rgba(30, 20, 25, 0.3)'
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = `rgba(${DANGER}, ${0.55 + 0.4 * k})`
    ctx.stroke()
    const a = Math.atan2(run.player.y - e.y, run.player.x - e.x)
    const ax = e.x + Math.cos(a) * (r + 10)
    const ay = e.y + Math.sin(a) * (r + 10)
    ctx.beginPath()
    ctx.moveTo(ax + Math.cos(a) * 9, ay + Math.sin(a) * 9)
    ctx.lineTo(ax + Math.cos(a + 2.4) * 7, ay + Math.sin(a + 2.4) * 7)
    ctx.lineTo(ax + Math.cos(a - 2.4) * 7, ay + Math.sin(a - 2.4) * 7)
    ctx.closePath()
    ctx.fillStyle = `rgba(${DANGER}, ${0.6 + 0.4 * k})`
    ctx.fill()
  }

  // ── the special bosses' attacks ──
  // Warnings are their real shapes: under everyone, a fill that darkens as
  // the blow nears; over everything (balls, pickups, monsters), their edge
  // and order number, so a warning is never hidden. A blow flashes where it
  // landed. Green: a safe spot; blue: frost; pale: wind; purple: a summoning.
  function shape(h, grow = 1) {
    ctx.beginPath()
    if (h.kind === 'circle' || h.kind === 'safe') ctx.arc(h.x, h.y, h.r * grow, 0, Math.PI * 2)
    else if (h.kind === 'cone') {
      ctx.moveTo(h.x, h.y)
      ctx.arc(h.x, h.y, h.range * grow, h.dir - h.angle / 2, h.dir + h.angle / 2)
      ctx.closePath()
    } else if (h.kind === 'line') {
      const nx = -h.dy * h.half
      const ny = h.dx * h.half
      const ex = h.x + h.dx * h.len * grow
      const ey = h.y + h.dy * h.len * grow
      ctx.moveTo(h.x + nx, h.y + ny)
      ctx.lineTo(ex + nx, ey + ny)
      ctx.arc(ex, ey, h.half, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true)
      ctx.lineTo(h.x - nx, h.y - ny)
      ctx.arc(h.x, h.y, h.half, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true)
      ctx.closePath()
    }
  }
  const hazardColor = (h) => (h.kind === 'safe' ? '72, 176, 96' : h.frost ? '110, 190, 240' : h.wind ? '200, 225, 240' : h.summon ? '150, 90, 200' : h.bolt ? '240, 140, 20' : DANGER)
  const nearing = (run, h) => Math.max(0, Math.min(1, (run.t - h.born) / Math.max(0.01, h.at - h.born)))

  function drawHazardsUnder(run) {
    if (!run.hazards.length && !run.floors.length) return
    world()
    // frost on the ground: fades in, and out at its end
    for (const f of run.floors) {
      const a = Math.min(1, (run.t - f.from) / 0.2, (f.until - run.t) / 0.5)
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(190, 232, 255, ${0.42 * a})`
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = `rgba(120, 196, 240, ${0.8 * a})`
      ctx.stroke()
    }
    const xid = run.extra && run.extra.boss ? run.extra.boss.id : -1
    for (const h of run.hazards) {
      if (h.kind === 'ray' || h.owner === xid) continue
      const c = hazardColor(h)
      // (a boss gathering itself: only its dashed ring, drawn over)
      if (h.thread && h.kind === 'circle') continue
      if (run.t < h.at) {
        const k = nearing(run, h)
        shape(h)
        ctx.fillStyle = `rgba(${c}, ${0.18 + 0.2 * k})`
        ctx.fill()
        // how close it is: the same shape growing from the middle
        if (!h.harmless || h.frost) {
          shape(h, Math.max(0.04, k))
          ctx.fillStyle = `rgba(${c}, 0.16)`
          ctx.fill()
        }
      } else if (h.dash) {
        // the charge's path while it charges along it
        shape(h)
        ctx.fillStyle = `rgba(${c}, 0.16)`
        ctx.fill()
      } else if (!h.harmless) {
        // the blow: a bright flash where it landed
        const k = 1 - (run.t - h.at) / h.linger
        shape(h)
        ctx.fillStyle = `rgba(255, 240, 200, ${0.55 * k})`
        ctx.fill()
      }
    }
  }

  function drawHazardsOver(run) {
    if (!run.hazards.length && !run.shots.length) return
    world()
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    const xid = run.extra && run.extra.boss ? run.extra.boss.id : -1
    for (const h of run.hazards) {
      if (h.owner === xid) continue
      const c = hazardColor(h)
      if (h.kind === 'ray') {
        // a shot's lane: from the boss out, solid while it is coming, then fading
        const a = run.t < h.at ? 0.45 + 0.4 * nearing(run, h) : Math.max(0, 0.5 * (1 - (run.t - h.at) / (h.keep || 1)))
        ctx.beginPath()
        ctx.moveTo(h.x, h.y)
        ctx.lineTo(h.x + h.dx * h.len, h.y + h.dy * h.len)
        ctx.strokeStyle = `rgba(${c}, ${a})`
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.lineWidth = 1.5
        continue
      }
      if (run.t >= h.at && !h.dash) continue
      const k = nearing(run, h)
      // a dark edge under the coloured one: seen on light ground and in a crowd
      shape(h)
      ctx.lineWidth = 3.5
      ctx.strokeStyle = 'rgba(30, 20, 25, 0.3)'
      ctx.stroke()
      ctx.lineWidth = 2
      ctx.strokeStyle = `rgba(${c}, ${0.65 + 0.35 * k})`
      ctx.stroke()
    }
    ctx.setLineDash([])
    // the order the blows come in
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '13px ' + GAME_FONT
    ctx.lineWidth = 3
    for (const h of run.hazards) {
      if (!h.order || run.t >= h.at || h.owner === xid) continue
      const y = h.kind === 'line' ? h.y + h.dy * h.len * 0.6 : h.y
      const x = h.kind === 'line' ? h.x + h.dx * h.len * 0.6 : h.x
      ctx.strokeStyle = 'rgba(255, 250, 240, 0.9)'
      ctx.strokeText(h.order, x, y)
      ctx.fillStyle = `rgb(${hazardColor(h)})`
      ctx.fillText(h.order, x, y)
    }
    ctx.textBaseline = 'alphabetic'
    // shots, over the warnings
    for (const sh of run.shots) {
      const [core, glow] = SHOT_LOOK[sh.kind] || SHOT_LOOK.seed
      ctx.beginPath()
      ctx.arc(sh.x, sh.y, sh.r + 2, 0, Math.PI * 2)
      ctx.fillStyle = glow
      ctx.globalAlpha = 0.55
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2)
      ctx.fillStyle = core
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(40, 30, 40, 0.6)'
      ctx.stroke()
    }
  }

  // the PC game: an elite or a boss out of sight (monsters live in the whole
  // field) has an arrow at the edge of the play area pointing at it
  function drawArrows(run, now) {
    const [x0, y0, x1, y1] = run.view
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    let any = false
    for (const e of run.enemies) {
      if (!e.rank || (e.state !== 'live' && e.state !== 'spawn')) continue
      if (e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1) continue
      if (!any) world(), (any = true)
      const dx = e.x - cx
      const dy = e.y - cy
      const m = 18
      // where the line from the middle to it leaves the play area (less m)
      const k = Math.min(Math.abs((x1 - x0) / 2 - m) / Math.max(1e-6, Math.abs(dx)), Math.abs((y1 - y0) / 2 - m) / Math.max(1e-6, Math.abs(dy)))
      const ax = cx + dx * k
      const ay = cy + dy * k
      const a = Math.atan2(dy, dx)
      const pulse = 1 + 0.12 * Math.sin(now / 160)
      const r = 11 * pulse
      ctx.beginPath()
      ctx.moveTo(ax + Math.cos(a) * r, ay + Math.sin(a) * r)
      ctx.lineTo(ax + Math.cos(a + 2.5) * r, ay + Math.sin(a + 2.5) * r)
      ctx.lineTo(ax + Math.cos(a) * -r * 0.35, ay + Math.sin(a) * -r * 0.35)
      ctx.lineTo(ax + Math.cos(a - 2.5) * r, ay + Math.sin(a - 2.5) * r)
      ctx.closePath()
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(47, 37, 55, 0.85)'
      ctx.stroke()
      ctx.fillStyle = e.behavior === 'flee' ? '#ffd84a' : '#ff6a5a'
      ctx.fill()
    }
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
      ctx.setTransform(K, 0, 0, K, (b.x - cam.x) * K, (b.y - BALL_LIFT - cam.y) * K)
      ctx.rotate(Math.atan2(b.vy, b.vx))
      ctx.globalAlpha = 0.65
      const th = Math.max(2, b.r * 1.3)
      ctx.drawImage(img[f.sheet], f.rect.x + cb.x, f.rect.y + cb.y, cb.w, cb.h, -len, -th / 2, len, th)
      ctx.globalAlpha = 1
    }
    put(name, b.x, b.y - BALL_LIFT, s)
  }

  // a soft cyan light, made once and drawn under each gem (not on a busy screen)
  let gemGlow = null
  function makeGlow() {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16)
    gr.addColorStop(0, 'rgba(160, 255, 250, 0.75)')
    gr.addColorStop(0.45, 'rgba(90, 220, 255, 0.3)')
    gr.addColorStop(1, 'rgba(90, 220, 255, 0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 32, 32)
    return c
  }

  // Mano's health under her feet: a dark slot, green going yellow then red
  function drawManoBar(run) {
    const p = run.player
    if (run.state !== 'play' && run.state !== 'levelup') return
    const v = Math.max(0, Math.min(1, p.hp / p.maxHp))
    const x = p.x - HPBAR_W / 2
    const y = p.y + 6
    world()
    ctx.fillStyle = 'rgba(18, 15, 42, 0.85)'
    ctx.fillRect(x - 1, y - 1, HPBAR_W + 2, HPBAR_H + 2)
    ctx.fillStyle = v > 0.5 ? '#4fdc6a' : v > 0.3 ? '#ffc93c' : '#ff4d5a'
    ctx.fillRect(x, y, HPBAR_W * v, HPBAR_H)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.fillRect(x, y, HPBAR_W * v, 1.2)
  }

  // a turret: its picture turned the nearest of eight ways to its aim
  // (turret.webp, scripts/survivor-turret-assets.py), standing on its foot,
  // kicked back and squashed a little as it fires; drawn in code until the
  // picture has come
  function drawTurret(run, t) {
    const atlas = TURRET_ART && art.now('turret')
    if (!atlas) return drawTurretCode(run, t)
    const T = run.D.balance.turret
    const kick = t.kick > 0 ? t.kick / T.kick : 0
    const way = TURRET_WAYS[(((Math.round(t.aim / (Math.PI / 4)) % 8) + 8) % 8)]
    const f = TURRET_ART.frames[way]
    const s = TURRET_DRAW_H / TURRET_ART.h
    const K = kd()
    // (a hard kick back along the aim, squashed down and out, springing back)
    const back = kick * 5
    const ox = (t.x - Math.cos(t.aim) * back - cam.x) * K
    const oy = (t.y - Math.sin(t.aim) * back * 0.5 - cam.y) * K
    const sy = s * (1 - kick * 0.16)
    const sx = s * (1 + kick * 0.1)
    ctx.imageSmoothingEnabled = true
    ctx.setTransform(1, 0, 0, 1, ox, oy)
    ctx.drawImage(atlas, f[0], f[1], f[2], f[3], -f[4] * sx * K, -f[5] * sy * K, f[2] * sx * K, f[3] * sy * K)
  }

  // where a turret's ball leaves: its mouth, the way it points
  function muzzle(x, y, aim) {
    if (!TURRET_ART || !art.now('turret')) return [x, y - TURRET_H]
    const m = TURRET_ART.muzzle[TURRET_WAYS[(((Math.round(aim / (Math.PI / 4)) % 8) + 8) % 8)]]
    const s = TURRET_DRAW_H / TURRET_ART.h
    return [x + m[0] * s, y + m[1] * s]
  }

  function drawTurretCode(run, t) {
    const sp = turretArt(kd())
    world()
    // the stone block, then the cannon turned to its aim (one of AIMS
    // pictures, never rotated as it is drawn) and kicked back as it fires
    const T = run.D.balance.turret
    const back = t.kick > 0 ? (t.kick / T.kick) * 3 : 0
    const i = ((Math.round((t.aim / (Math.PI * 2)) * AIMS) % AIMS) + AIMS) % AIMS
    const a = (i / AIMS) * Math.PI * 2
    ctx.drawImage(sp.block, t.x - 15, t.y - 16, 30, 19)
    ctx.drawImage(sp.guns[i], t.x - Math.cos(a) * back - GUN_R, t.y - TURRET_H - Math.sin(a) * back - GUN_R, GUN_R * 2, GUN_R * 2)
  }

  // the turret's pictures, drawn in code once for the screen's scale: the
  // stone block, and the cannon (with its gold pivot) at AIMS angles
  let turretSprites = null
  function turretArt(k) {
    if (turretSprites && turretSprites.k === k) return turretSprites
    const make = (w, h, ox, oy, draw) => {
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.ceil(w * k))
      c.height = Math.max(1, Math.ceil(h * k))
      const g = c.getContext('2d')
      g.scale(c.width / w, c.height / h)
      g.translate(ox, oy)
      g.lineWidth = 1.5
      g.strokeStyle = '#4a3a28'
      draw(g)
      return c
    }
    const gun = (a) => (g) => {
      g.save()
      g.rotate(a)
      g.fillStyle = '#f2efe6'
      g.beginPath()
      g.roundRect(-8, -5.5, 19, 11, 5)
      g.fill()
      g.stroke()
      g.fillStyle = '#5b7fba'
      g.fillRect(-1, -5.5, 5, 11)
      g.strokeRect(-1, -5.5, 5, 11)
      g.fillStyle = '#e2453b'
      g.beginPath()
      g.roundRect(10, -6.5, 5, 13, 2)
      g.fill()
      g.stroke()
      g.restore()
      g.fillStyle = '#e9b949'
      g.beginPath()
      g.arc(0, 0, 2.6, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    turretSprites = {
      k,
      // (block: x −15…15, y −16…3 around its foot)
      block: make(30, 19, 15, 16, (g) => {
        g.fillStyle = '#c9ad7c'
        g.fillRect(-13, -9, 26, 10)
        g.strokeRect(-13, -9, 26, 10)
        g.fillStyle = '#ead6aa'
        g.fillRect(-13, -14, 26, 6)
        g.strokeRect(-13, -14, 26, 6)
      }),
      // (cannon: a square of GUN_R around its pivot)
      guns: Array.from({ length: AIMS }, (_, i) => make(GUN_R * 2, GUN_R * 2, GUN_R, GUN_R, gun((i / AIMS) * Math.PI * 2))),
    }
    return turretSprites
  }

  // the turrets' shots: a muzzle flash (a burst and three rays along the aim)
  // for FLASH s, then the red ball flying SHOT s with a streak behind it,
  // then a pop, sparks and a small ring where it lands
  function drawShots(dt) {
    world()
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]
      f.t += dt
      if (f.t >= FLASH) {
        flashes.splice(i, 1)
        continue
      }
      const k = f.t / FLASH
      ctx.globalAlpha = 1 - k
      ctx.fillStyle = '#fff6c8'
      ctx.beginPath()
      ctx.arc(f.x, f.y, 4 + 7 * (1 - k), 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffb02e'
      ctx.lineWidth = 3 * (1 - k) + 1
      ctx.beginPath()
      for (const d of [-0.5, 0, 0.5]) {
        const a = f.a + d
        const r = (d ? 9 : 15) * (0.6 + k)
        ctx.moveTo(f.x + Math.cos(a) * 3, f.y + Math.sin(a) * 3)
        ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r)
      }
      ctx.stroke()
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const b = shots[i]
      b.t += dt
      if (b.t >= SHOT) {
        shots.splice(i, 1)
        if (fx.length < MAX_FX) fx.push({ anim: 'impact', x: b.x1, y: b.y1, t: 0, s: 0.85 })
        if (rings.length < 24) rings.push({ x: b.x1, y: b.y1, r: 13, t: 0 })
        addSparks(b.x1, b.y1, 3, 120)
        continue
      }
      const k = b.t / SHOT
      const x = b.x0 + (b.x1 - b.x0) * k
      const y = b.y0 + (b.y1 - b.y0) * k
      // (the streak: from where it was a third of the way back)
      const k0 = Math.max(0, k - 0.35)
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = '#ff5a4a'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(b.x0 + (b.x1 - b.x0) * k0, b.y0 + (b.y1 - b.y0) * k0)
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.globalAlpha = 1
      put('ball', x, y, 11 / 24)
    }
    ctx.globalAlpha = 1
  }

  function addSparks(x, y, n, speed) {
    for (let i = 0; i < n && sparks.length < MAX_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.5 + Math.random() * 0.7)
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35, t: 0, c: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0], s: 1.6 + Math.random() * 1.6 })
    }
  }

  function drawSparks(dt) {
    world()
    for (let i = sparks.length - 1; i >= 0; i--) {
      const k = sparks[i]
      k.t += dt
      if (k.t >= SPARK) {
        sparks.splice(i, 1)
        continue
      }
      k.x += k.vx * dt
      k.y += k.vy * dt
      k.vy += 260 * dt
      k.vx *= 1 - 3 * dt
      const f = 1 - k.t / SPARK
      ctx.globalAlpha = f
      ctx.fillStyle = k.c
      const r = k.s * (0.5 + f * 0.5)
      ctx.fillRect(k.x - r, k.y - r, r * 2, r * 2)
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i]
      g.t += dt
      if (g.t >= 0.35) {
        rings.splice(i, 1)
        continue
      }
      const f = g.t / 0.35
      ctx.globalAlpha = 1 - f
      ctx.strokeStyle = '#fff3b0'
      ctx.lineWidth = 4 * (1 - f) + 1
      ctx.beginPath()
      ctx.arc(g.x, g.y, g.r * (0.4 + f), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // a shake, the stronger of it and the one going on
  function kick([px, secs]) {
    if (calm) return
    if (shakeT <= 0 || (shakeAmp * shakeT) / shakeDur < px) (shakeAmp = px), (shakeT = shakeDur = secs)
  }

  // a monster's jolt now: { sx, sy, ox, oy } (1, 1, 0, 0 when not hit)
  const still = { sx: 1, sy: 1, ox: 0, oy: 0 }
  function punch(run, e) {
    if (!(e.hitT > 0) || e.state !== 'live') return still
    const k = Math.min(1, e.hitT / PUNCH)
    const p = run.player
    const d = Math.hypot(e.x - p.x, e.y - p.y) || 1
    const push = (e.behavior === 'boss' || e.behavior === 'extra' ? PUNCH_PX / 3 : PUNCH_PX) * k
    return { sx: 1 + PUNCH_SCALE * k, sy: 1 - PUNCH_SCALE * 0.5 * k, ox: ((e.x - p.x) / d) * push, oy: ((e.y - p.y) / d) * push * 0.6 }
  }

  // the shake moves the whole picture (the canvas element), so the ground
  // and everything on it go together
  function shake(dt) {
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt)
      const a = (shakeAmp * shakeT) / shakeDur
      if (canvas.style) canvas.style.transform = `translate(${((Math.random() - 0.5) * 2 * a).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * a).toFixed(1)}px) scale(1.02)`
      shaken = true
    } else if (shaken) {
      if (canvas.style) canvas.style.transform = ''
      shaken = false
    }
  }

  function drawOrb(o, now) {
    const bob = Math.sin(now / 260 + o.x) * 1.2
    if (o.kind === 'xp') {
      if (gemGlow) {
        const r = 7 + Math.min(4, Math.sqrt(o.v))
        world()
        ctx.drawImage(gemGlow, o.x - r, o.y - 9 + bob - r, r * 2, r * 2)
      }
      put('xp_gem', o.x, o.y - 5 + bob, (9 + Math.min(5, Math.sqrt(o.v))) / 24)
    }
    else if (o.kind === 'coin') put('coin', o.x, o.y - 5 + bob, 10 / 24)
    else if (o.kind === 'heal') put('heal', o.x, o.y - 6 + bob, 13 / 24)
    else if (o.kind === 'pheal') drawPHeart(o, now, bob)
  }

  // a 퍼센트 하트: jumps out of the cat in a little arc, then lies there with
  // a small twinkle
  function drawPHeart(o, now, bob) {
    pheart ??= makeHeart()
    let x = o.x
    let y = o.y - 6 + bob
    if (o.pop > 0) {
      const k = 1 - o.pop / POP
      x = o.fromX + (o.x - o.fromX) * k
      y = o.fromY + (o.y - o.fromY) * k - 6 - Math.sin(Math.PI * k) * 12
    }
    // whole screen pixels per heart pixel (about 1.25 logical px), so it stays sharp
    const K = kd()
    const n = Math.max(1, Math.round(1.25 * K))
    const s = n / K
    device()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(pheart, Math.round((x - cam.x - (HEART_W * s) / 2) * K), Math.round((y - cam.y - HEART_H * s) * K), HEART_W * n, HEART_H * n)
    // twinkle: a tiny four-point sparkle that comes and goes
    const tw = (Math.sin(now / 180 + o.x * 0.7) + 1) / 2
    if (tw > 0.55) {
      world()
      const sx = x + 6
      const sy = y - HEART_H * s
      const r = 1 + (tw - 0.55) * 4
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.fillRect(sx - r, sy - 0.5, r * 2, 1)
      ctx.fillRect(sx - 0.5, sy - r, 1, r * 2)
    }
  }

  // ── the cats ──
  // legs follow the distance run; sitting, the first two frames take turns
  // (tail and paws going); a hop lifts it a little; eating, it bobs in place
  function drawCat(c, now) {
    const side = c.face > 0 ? 'r' : 'l'
    let f
    let lift = 0
    let squash = 1
    if (c.mode === 'eat') {
      f = 2
      squash = 1 - 0.08 * Math.abs(Math.sin(now / 70))
    } else if (Math.hypot(c.vx, c.vy) > 1) f = Math.floor(c.step / CAT_STRIDE) % 4
    else f = Math.floor(now / 450 + c.eats + c.x) % 2
    if (c.hop > 0) lift = Math.sin((Math.PI * (0.3 - c.hop)) / 0.3) * 7
    const name = `${c.frames}_${side}_${f}`
    if (squash !== 1) {
      // squashed from the feet up while it munches
      const K = kd()
      ctx.setTransform(K, 0, 0, K * squash, -cam.x * K, (c.y * (1 - squash) - cam.y) * K)
      putWorld(name, c.x, c.y, CATS.scale)
      return
    }
    put(name, c.x, c.y - lift, CATS.scale)
  }

  // ── the friend cats ──
  // Pixel art in the collector cats' style (ep01-assets.json → friendCat; a
  // frame is a rect of its atlas with its pivot on the cat's feet), drawn
  // the way put() draws the collectors: square pixels when a pixel covers a
  // screen pixel or more (뚱냥이 grown big), else a smoothed smaller copy of
  // the atlas, made once per size so no pixel simply vanishes. Facing west:
  // the east frames mirrored. Scratching: the attack poses through the
  // scratch, then the paw coming back; running: the legs follow the
  // distance run; else idle.
  function friendAtlas(q) {
    const atlas = art.now('friend_cat')
    if (!atlas || q >= 1) return atlas
    let c = fcScaled.get(q)
    if (c) return c
    c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(atlas.width * q))
    c.height = Math.max(1, Math.round(atlas.height * q))
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(atlas, 0, 0, c.width, c.height)
    if (fcScaled.size > 8) fcScaled.clear()
    fcScaled.set(q, c)
    return c
  }

  function drawFriend(c, now) {
    const s = (FCB.drawH / FC.idleH) * c.size // field px per art px
    const K = kd()
    const q = Math.min(1, Math.ceil(s * K * 20) / 20)
    const atlas = friendAtlas(q)
    if (!atlas) return
    let anim = 'idle'
    let i
    if (c.mode === 'attack') (anim = 'attack'), (i = Math.min(3, Math.floor((4 * c.atk) / Math.max(0.01, c.atkDur))))
    else if (c.rec > 0 && !c.moving) (anim = 'recover'), (i = Math.min(3, Math.floor(4 * (1 - c.rec / FCB.recoverSeconds))))
    else if (c.moving) (anim = 'move'), (i = Math.floor(c.step / (9 * c.size)) % 4)
    else i = Math.floor(now / FC.ms.idle + c.id * 1.7) % 4
    const f = FC.animations[anim][c.dir][i]
    const flip = c.face < 0
    const ox = Math.round((c.x - cam.x) * K)
    const oy = Math.round((c.y - cam.y) * K)
    ctx.imageSmoothingEnabled = q < 1
    if (flip) ctx.setTransform(-1, 0, 0, 1, ox, oy)
    else ctx.setTransform(1, 0, 0, 1, ox, oy)
    ctx.drawImage(atlas, f[0] * q, f[1] * q, f[2] * q, f[3] * q, Math.round(-f[4] * s * K), Math.round(-f[5] * s * K), Math.round(f[2] * s * K), Math.round(f[3] * s * K))
  }

  // a scratch: the claw marks across where it landed, turned the way the
  // cat struck, fading fast; golden once 발톱 갈기 has grown the claws a lot
  function drawSlash(sl) {
    const pic = art.now(sl.power ? 'fx_cat_slash_power' : 'fx_cat_slash')
    if (!pic) return
    const K = kd()
    const k = sl.t / SLASH
    const size = sl.r * 1.9 * (0.85 + 0.3 * k)
    const w = size * K
    const h = (size * pic.height) / pic.width * K
    ctx.globalAlpha = Math.max(0, 1 - k * k)
    ctx.setTransform(1, 0, 0, 1, (sl.x - cam.x) * K, (sl.y - cam.y) * K)
    ctx.rotate(sl.a)
    if (sl.face < 0) ctx.scale(1, -1) // struck to the west: the marks mirrored, not upside down
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(pic, -w / 2, -h / 2, w, h)
    ctx.globalAlpha = 1
  }

  // put() for a frame under a world transform already set (used for squash)
  function putWorld(name, x, y, s) {
    const f = FRAMES[name]
    const b = f.contentBounds
    const [px, py] = f.pivot
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(img[f.sheet], f.rect.x + b.x, f.rect.y + b.y, b.w, b.h, x - (px - b.x) * s, y - (py - b.y) * s, b.w * s, b.h * s)
  }

  // ── one frame ──
  // a region's monsters made at their sizes as soon as their pictures are
  // in, so the first mid-boss or boss never pays for it in the middle of a fight
  let warmed = ''
  let warmedMotion = ''
  function warm(run) {
    const R = run.region
    if (R && warmedMotion !== R.id + run.chapter + kd()) {
      // their frames too (each once, and only when all are in)
      // (at every size they come in: a mid-boss chapter's boss wears the
      // mid-boss's look, its second elite the bone beast's)
      // (and the chapter's extra special boss, at its own size)
      const X = D.balance.extraBosses
      const xid = X.chapters[String(run.chapter)]
      const ids = [...Object.entries(R.skins), ['boss', R.skins.brute], ['brute', R.skins.bone_beast]].filter(([, id]) => MOTION[id])
      if (xid) ids.push(['boss', xid, X.bosses[xid].size ?? X.size])
      if (ids.every(([, id]) => art.now('motion:' + id))) {
        for (const [role, id, size] of ids) motionSet(id, art.now('motion:' + id), sizeOf({ skin: id, type: role, size }))
        warmedMotion = R.id + run.chapter + kd()
      }
    }
    if (!R || warmed === R.id + kd()) return
    const roles = Object.entries(R.skins)
    if (!roles.every(([, id]) => art.now(id))) return
    for (const [role, id] of roles) {
      const size = (D.story.monsters[id] || {}).size || D.story.roleSize[role] || 32
      skinSet(id, art.now(id), Math.max(8, Math.round(size * kd())))
    }
    warmed = R.id + kd()
  }

  function draw(run, dt) {
    // a canvas with no size yet (or for a moment while the screen changes):
    // nothing to draw on, and a picture of no size cannot be copied
    if (!canvas.width || !canvas.height) {
      run.events.length = 0
      return
    }
    const now = performance.now()
    warm(run)
    if (inset && run.arena.view) {
      // the camera: the run's view at the screen's play area
      cam.x = run.view[0] - inset[0]
      cam.y = run.view[1] - inset[1]
      drawGround(run)
    } else {
      cam.x = cam.y = 0
      if (!field || field.key !== fieldKey(run)) field = paintField(run)
      device()
      ctx.drawImage(field, 0, 0)
    }

    // the ground first: shadows, the boss's warning, pickups; then standing
    // things back to front by their feet; then balls and hits in the air
    const p = run.player
    shadow(p.x, p.y, 13, 4.5)
    for (const c of run.cats) shadow(c.x, c.y, 10 - (c.hop > 0 ? 2 : 0), 3.2)
    // (the friend cats: only those on screen are drawn at all)
    const [vx0, vy0, vx1, vy1] = run.view
    const seen = run.friends.filter((c) => c.x > vx0 - 40 && c.x < vx1 + 40 && c.y > vy0 - 20 && c.y < vy1 + 60)
    for (const c of seen) shadow(c.x, c.y, 8 * c.size, 2.6 * c.size)
    for (const t of run.turrets) if (t.x > vx0 - 30 && t.x < vx1 + 30 && t.y > vy0 - 20 && t.y < vy1 + 40) shadow(t.x, t.y - 1, 17, 5.5)
    for (const e of run.enemies) {
      const w = e.r * 1.15
      if (e.state === 'spawn') {
        const f = spawnK(e)
        shadow(e.x, e.y, w * f, e.r * 0.42 * f, 0.3)
      } else if ((e.state === 'live' && !e.under) || e.state === 'down') shadow(e.x, e.y, w, e.r * 0.42)
    }
    // a busy screen sheds decoration first (never balls, hits or damage):
    // ball shadows and trails go, and fewer numbers and sparks are drawn
    const busy = run.balls.length > D.balance.performance.trailsUpTo
    if (!busy) for (const b of run.balls) shadow(b.x, b.y, b.r * 0.9, b.r * 0.35, 0.16)
    zfx ??= createZyoFx({ ctx, world, put, shadow, drawFriend, lift: BALL_LIFT, font: '16px ' + GAME_FONT })
    zfx.shadows(run)
    drawShadows()
    for (const e of run.enemies) {
      if (e.behavior !== 'boss' || e.state !== 'live') continue
      if (e.enraged) drawRage(e, now)
      if (e.mode === 'windup') drawWarning(run, e)
      else if (e.mode === 'rushWind') drawRush(run, e)
    }
    drawHazardsUnder(run)
    xfx ??= createExtraFx({ ctx, world })
    xfx.under(run, now, busy)
    zfx.under(run, now)
    gemGlow = busy || run.orbs.length > 160 ? null : (glow ??= makeGlow())
    for (const o of run.orbs) drawOrb(o, now)
    const list = []
    for (const e of run.enemies) list.push([e.y, 0, e])
    list.push([p.y + 0.01, 1, p])
    for (const c of run.cats) list.push([c.y, 2, c])
    for (const c of seen) list.push([c.y, 3, c])
    // (turrets off the screen are not drawn: on the PC the field is wider)
    for (const t of run.turrets) if (t.x > vx0 - 30 && t.x < vx1 + 30 && t.y > vy0 - 20 && t.y < vy1 + 40) list.push([t.y, 4, t])
    list.sort((a, b) => a[0] - b[0])
    for (const [, kind, o] of list) (kind === 1 ? drawMano(run, dt) : kind === 2 ? drawCat(o, now) : kind === 3 ? drawFriend(o, now) : kind === 4 ? drawTurret(run, o) : drawEnemy(run, o))
    drawManoBar(run)
    for (const b of run.balls) drawBall(b, !busy)
    zfx.over(run, now, dt)
    drawHazardsOver(run)
    xfx.over(run, now, dt, busy)
    if (inset) drawArrows(run, now)
    const maxFx = busy ? MAX_FX / 3 : MAX_FX
    const maxNumbers = busy ? MAX_NUMBERS / 4 : MAX_NUMBERS

    // effects from this frame's events
    for (const ev of run.events) {
      xfx.event(run, ev)
      zfx.event(run, ev)
      if (ev.type === 'skillHit') kick(ev.kind === 'ball' ? KICK.meteor : KICK.slash)
      if (ev.type === 'turretShot' && shots.length < MAX_SHOTS) {
        const a = Math.atan2(ev.ty - ev.y, ev.tx - ev.x)
        const [x0, y0] = muzzle(ev.x, ev.y, a)
        shots.push({ x0, y0, x1: ev.tx, y1: ev.ty - 8, t: 0 })
        if (flashes.length < MAX_SHOTS) flashes.push({ x: x0, y: y0, a, t: 0 })
        if (!busy) addSparks(x0, y0, 3, 90)
      }
      if (ev.type === 'turretMade') {
        rings.push({ x: ev.x, y: ev.y - 8, r: 40, t: 0 })
        addSparks(ev.x, ev.y - 10, 12, 140)
        fx.push({ anim: 'dust', x: ev.x, y: ev.y - 2, t: 0, s: 1.1 })
        if (!ev.moved) numbers.push({ x: ev.x, y: ev.y - 40, text: D.turret.made, t: 0, color: '#ffd84a' })
      }
      if (ev.type === 'hit') {
        // (a cat's scratch has its own claw marks, not the ball's impact)
        if (ev.by !== 'cat' && fx.length < maxFx) fx.push({ anim: 'impact', x: ev.x, y: ev.y - BALL_LIFT, t: 0, s: ev.crit ? 0.95 : 0.75 })
        if (ev.crit && !busy && rings.length < 24) rings.push({ x: ev.x, y: ev.y - BALL_LIFT, r: 18, t: 0 })
        if (numbers.length < maxNumbers) numbers.push({ x: ev.x + (Math.random() - 0.5) * 12, y: ev.y - 18, text: short(ev.n), t: 0, color: ev.crit ? CRIT_COLOR : NUM_COLOR, crit: ev.crit })
      } else if (ev.type === 'die') {
        const big = E[ev.kind].rank ? 2.2 : 1
        if (fx.length < MAX_FX || big > 1) fx.push({ anim: 'dust', x: ev.x, y: ev.y - 4, t: 0, s: 0.9 * big })
        if (big > 1) {
          addSparks(ev.x, ev.y - 14, 22, 190)
          rings.push({ x: ev.x, y: ev.y - 10, r: 56, t: 0 })
          kick(KICK.big)
        } else addSparks(ev.x, ev.y - 8, busy ? 2 : 5, 120)
      } else if (ev.type === 'blast') {
        if (fx.length < MAX_FX) fx.push({ anim: 'dust', x: ev.x, y: ev.y - 4, t: 0, s: Math.max(0.7, ev.r / 28) })
      } else if (ev.type === 'bossRage') {
        // an ordinary boss enraged: a burst of dust round it and a shake
        rings.push({ x: ev.x, y: ev.y - 10, r: 70, t: 0 })
        addSparks(ev.x, ev.y - 14, 18, 170)
        kick(KICK.big)
      } else if (ev.type === 'phase') {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          fx.push({ anim: 'dust', x: ev.x + Math.cos(a) * 34, y: ev.y + Math.sin(a) * 34, t: 0, s: 1.3 })
        }
      } else if (ev.type === 'stomp') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          fx.push({ anim: 'dust', x: ev.x + Math.cos(a) * ev.r * 0.7, y: ev.y + Math.sin(a) * ev.r * 0.7, t: 0, s: 1.3 })
        }
      } else if (ev.type === 'hurt') {
        if (numbers.length < MAX_NUMBERS) numbers.push({ x: ev.x, y: ev.y - 52, text: `-${Math.round(ev.n)}`, t: 0, color: HURT_COLOR })
        kick(KICK.hurt)
      } else if (ev.type === 'catSlash') {
        // many cats on one monster: one set of claw marks there at a time
        const twin = slashes.some((o) => o.t < SLASH * 0.6 && Math.abs(o.x - ev.x) < ev.r * 0.6 && Math.abs(o.y - ev.y) < ev.r * 0.6)
        if (!twin && slashes.length < (busy ? MAX_SLASH / 3 : MAX_SLASH)) slashes.push({ ...ev, t: 0 })
      } else if (ev.type === 'catSummon') {
        fx.push({ anim: 'dust', x: ev.x, y: ev.y - 4, t: 0, s: 0.8 })
        numbers.push({ x: ev.x, y: ev.y - 26, text: '냥!', t: 0, color: CAT_COLOR })
      } else if (ev.type === 'catEat') {
        numbers.push({ x: ev.x, y: ev.y - 30, text: '냠!', t: 0, color: CAT_COLOR })
      } else if (ev.type === 'catSpit') {
        fx.push({ anim: 'dust', x: ev.x, y: ev.y - 4, t: 0, s: 0.5 })
      } else if (ev.type === 'bolt') {
        if (bolts.length < MAX_BOLTS) bolts.push({ ...ev, t: 0, j: [0, 1, 2].map(() => (Math.random() - 0.5) * 14) })
      } else if (ev.type === 'heal') {
        numbers.push({ x: ev.x, y: ev.y - 52, text: `+${Math.round(ev.n)}`, t: 0, color: HEAL_COLOR })
      }
    }
    run.events.length = 0
    for (let i = slashes.length - 1; i >= 0; i--) {
      const sl = slashes[i]
      sl.t += dt
      if (sl.t >= SLASH) slashes.splice(i, 1)
      else drawSlash(sl)
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]
      b.t += dt
      if (b.t >= BOLT) bolts.splice(i, 1)
      else drawBolt(b)
    }
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
    drawShots(dt)
    drawSparks(dt)
    shake(dt)
    // damage and the like rising and fading; critical hits after the rest,
    // in red, a size larger, with a short pop (one font change for all of them)
    world()
    ctx.textAlign = 'center'
    ctx.font = NUM_FONT
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = NUM_EDGE
    let crits = 0
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i]
      n.t += dt
      if (n.t > 0.6) {
        numbers.splice(i, 1)
        continue
      }
      if (n.crit) {
        crits++
        continue
      }
      // up fast, then slowing; a quick pop as it comes
      const y = n.y - rise(n.t)
      const ps = n.t < 0.09 ? 1.35 - (n.t / 0.09) * 0.35 : 1
      ctx.globalAlpha = Math.min(1, (0.6 - n.t) * 4)
      if (ps !== 1) {
        const K = kd()
        ctx.setTransform(K * ps, 0, 0, K * ps, (n.x - cam.x) * K, (y - cam.y) * K)
        ctx.strokeText(n.text, 0, 0)
        ctx.fillStyle = n.color
        ctx.fillText(n.text, 0, 0)
        world()
        continue
      }
      ctx.strokeText(n.text, n.x, y)
      ctx.fillStyle = n.color
      ctx.fillText(n.text, n.x, y)
    }
    if (crits) {
      ctx.font = CRIT_FONT
      ctx.lineWidth = 3.4
      ctx.strokeStyle = 'rgba(255, 244, 228, 0.95)'
      ctx.fillStyle = CRIT_COLOR
      const K = kd()
      for (const n of numbers) {
        if (!n.crit) continue
        const y = n.y - rise(n.t)
        const s = critPop(n.t)
        ctx.globalAlpha = Math.min(1, (0.6 - n.t) * 4)
        ctx.setTransform(K * s, 0, 0, K * s, (n.x - cam.x) * K, (y - cam.y) * K)
        ctx.strokeText(n.text, 0, 0)
        ctx.fillText(n.text, 0, 0)
      }
    }
    ctx.globalAlpha = 1
  }

  return {
    resize,
    draw,
    view,
    mano,
    reset: () => {
      if (xfx) xfx.reset()
      if (zfx) zfx.reset()
      Object.assign(mano, { dir: 'S', phase: 0, idleT: 0, hitT: 0, downT: 0, prevHit: 0 })
      sparks.length = rings.length = shots.length = flashes.length = 0
      shakeT = shakeAmp = 0
      shake(0)
    },
  }
}
