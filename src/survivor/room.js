// MANO SURVIVOR — 마노의 방: the 마노 강화 tab's room (data/room.json).
//
// The room is one of six whole pictures (Astra's growth set, made by
// scripts/survivor-room-assets.py), chosen by the coin stats' levels added up
// (room-items.js) and faded into the next when a stage is reached; nothing
// of it is stored and nothing of it changes a number in the game. Over it,
// in the picture's own pixels (1672 × 941), Mano and the three cats live on
// their own: they walk with their sprites from the fight (the same pictures
// and colours as there) and rest in a still pose each (Mano with her ball;
// 단추 with a paw up, 호두 on her back on a rug, 모루 asleep on a cushion).
// Mano wanders, looks out of the window and at what the room has (the desk,
// the plant, the books …), hits the training dummy and the sandbag, rests on
// the bed, sits with her ball, runs her zoomies and pats the cats; the cats
// wander, eat, chase each other, 모루 plays with the red ball. A coin stat
// bought: Mano hops, waves and says a line.
//
// A picture that does not load leaves a plain room behind them: the page
// and the shop work on either way.

import { FRAMES, animFrame } from './sprites.js'
import { roomStage } from './room-items.js'

const ART_URLS = {
  'room/stage_1.webp': new URL('./assets/room/stage_1.webp', import.meta.url).href,
  'room/stage_2.webp': new URL('./assets/room/stage_2.webp', import.meta.url).href,
  'room/stage_3.webp': new URL('./assets/room/stage_3.webp', import.meta.url).href,
  'room/stage_4.webp': new URL('./assets/room/stage_4.webp', import.meta.url).href,
  'room/stage_5.webp': new URL('./assets/room/stage_5.webp', import.meta.url).href,
  'room/stage_6.webp': new URL('./assets/room/stage_6.webp', import.meta.url).href,
  'room/mano_sit.webp': new URL('./assets/room/mano_sit.webp', import.meta.url).href,
  'room/danchu_play.webp': new URL('./assets/room/danchu_play.webp', import.meta.url).href,
  'room/hodu_belly.webp': new URL('./assets/room/hodu_belly.webp', import.meta.url).href,
  'room/moru_sleep.webp': new URL('./assets/room/moru_sleep.webp', import.meta.url).href,
}

// pictures load once for the page; a failed one is remembered as failed
const pics = new Map() // file → { img, ok, failed }
function pic(file) {
  let p = pics.get(file)
  if (p) return p
  p = { img: new Image(), ok: false, failed: false }
  p.img.decoding = 'async'
  p.img.onload = () => (p.ok = true)
  p.img.onerror = () => (p.failed = true)
  if (ART_URLS[file]) p.img.src = ART_URLS[file]
  else p.failed = true
  pics.set(file, p)
  return p
}

const TAU = Math.PI * 2
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
// how big the sprites are in the room (room pixels a sheet pixel): Mano about
// 180 tall standing; her profile poses in the same proportion; the cats
// CAT_ROOM of their size beside her in the fight (render.js: Mano 0.9, the
// cats balance.cats.scale), so about half her height (asked for: smaller)
const MANO_K = 3.9
const PROFILE_K = MANO_K * (46 / 224)
const MANO_H = 180
const CAT_ROOM = 0.72
const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']
const dirOf = (vx, vy) => DIRS[((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8]
// her standing frames by where she looks (the west ones: the east ones turned)
const IDLE = { n: 'idle_n', ne: 'idle_ne', nw: 'idle_ne', e: 'idle_e', w: 'idle_e', s: 'idle_s', se: 'idle_se', sw: 'idle_se' }
const CATS = [
  { id: 'cat_danchu', name: 'danchu', pose: 'danchu_play' },
  { id: 'cat_hodu', name: 'hodu', pose: 'hodu_belly' },
  { id: 'cat_moru', name: 'moru', pose: 'moru_sleep' },
]

export function createRoom(canvas, img, D, { cats = false, total = 0, font = 'sans-serif' } = {}) {
  const R = D.room
  const [W, H] = R.size
  const A = R.art
  const ctx = canvas.getContext('2d')
  const catK = MANO_K * (D.balance.cats.scale / 0.9) * CAT_ROOM
  let k = 0.5 // device pixels a room pixel
  let ui = 2 // room pixels a CSS pixel
  let stage = roomStage(D, total)
  let fade = null // { from, t } a stage fading in over the last
  const parts = [] // sparkles, hearts, notes, Z's
  let bubble = null // { text, t, life }: Mano's line
  let toast = null // { text, t }: the room grew
  let last = performance.now()
  let now = 0
  let raf = 0
  let gone = false
  // (the pictures this room shows: its stage now, the poses)
  pic(A.stages[stage].file)
  for (const p of Object.values(A.poses)) pic(p.file)

  const spots = () => Object.entries(R.spots).filter(([, s]) => s.from <= stage + 1)
  const has = (id) => R.spots[id] && R.spots[id].from <= stage + 1
  const [wx0, wy0, wx1, wy1] = R.walk[0]
  const floorPt = () => [rnd(wx0, wx1), rnd(wy0, wy1)]
  const clampFloor = (x, y) => [Math.max(wx0, Math.min(wx1, x)), Math.max(wy0, Math.min(wy1, y))]

  // ── the people ──
  const mano = { x: 900, y: 640, vx: 0, vy: 0, dir: 's', act: null, phase: 0, hop: 0, door: null }
  const kitties = []
  const setCats = (on) => {
    if (on && !kitties.length) CATS.forEach((c, i) => kitties.push({ ...c, x: 700 + i * 180, y: 700 - i * 40, vx: 0, vy: 0, face: i % 2 ? -1 : 1, act: null, step: 0, hop: 0, door: null }))
    if (!on) kitties.length = 0
  }
  setCats(cats)
  const ball = { x: R.ball[0], y: R.ball[1], vx: 0, vy: 0, held: false }

  // a walk along `path` (its last point: where it goes) at `speed`, then
  // `then` (a pose for a while); from a spot off the open floor (the bed, a
  // cushion, the rug) it steps back onto the floor first
  function go(who, path, speed, then) {
    const p = who.door ? [who.door, ...path] : path
    who.door = then && then.door ? then.door : null
    who.act = { kind: 'go', path: p, speed, then }
  }
  // (one cat at a time at the bowl, on the cushion)
  const taken = (pose, c, spot) => kitties.some((o) => o !== c && o.act && ((o.act.then && o.act.then.pose === pose && o.act.then.spot === spot) || (o.act.kind === 'do' && o.act.pose === pose && o.act.spot === spot)))
  const deep = (c) => c.act && c.act.kind === 'do' && (c.act.pose === 'rest' || c.act.pose === 'eat')

  function weighted(list) {
    let r = Math.random() * list.reduce((a, [, w]) => a + w, 0)
    for (const [name, w] of list) if ((r -= w) <= 0) return name
    return list[0][0]
  }

  // what Mano does next: the more the room has, the more she finds to do
  function manoNext(force) {
    const look = spots().filter(([, s]) => s.line && !s.punch)
    const hit = spots().filter(([, s]) => s.punch)
    const ch = [['wander', 3], ['look', 1.2 + 0.5 * look.length], ['bed', 1.6], ['ball', ball.held ? 0 : 1.4], ['zoomies', 0.9]]
    if (hit.length) ch.push(['punch', 1.5])
    if (kitties.length) ch.push(['pet', 1.1])
    const live = ch.filter(([, w]) => w > 0)
    const kind = force && live.some(([n]) => n === force) ? force : weighted(live)
    const [x, y] = floorPt()
    switch (kind) {
      case 'look': {
        const [, s] = pick(look)
        return go(mano, [s.at], 120, { pose: 'look', dur: rnd(2.2, 3.2), face: s.face, line: s.line })
      }
      case 'punch': {
        const [, s] = pick(hit)
        return go(mano, [s.at], 120, { pose: 'punch', dur: rnd(2.4, 3.4), face: s.face, line: s.line })
      }
      case 'bed': {
        const s = R.spots.bed
        return go(mano, [s.door, s.at], 120, { pose: 'sleep', dur: rnd(4, 6), door: s.door })
      }
      case 'ball':
        return go(mano, [clampFloor(ball.x - 10, ball.y + 4)], 120, { pose: 'sit', dur: rnd(3.5, 5.5), ball: true })
      case 'zoomies':
        mano.laps = 3 + Math.floor(Math.random() * 3)
        for (const c of kitties) if (Math.random() < 0.6 && !deep(c)) (c.act = { kind: 'chase', target: mano, t: 0, dur: 4 }), (c.door = null)
        return go(mano, [[x, y]], 330, { pose: 'zoom' })
      case 'pet': {
        // she calls one over and pats it
        const c = pick(kitties)
        const [px, py] = clampFloor(c.x, c.y)
        go(c, [[Math.min(wx1, px + 70), py]], 160, { pose: 'sit', dur: 3, faceTo: mano })
        return go(mano, [[px - 10, py]], 120, { pose: 'pet', dur: 2.6, cat: c })
      }
      default:
        return go(mano, [[x, y]], 110, { pose: 'idle', dur: rnd(1, 2.4) })
    }
  }

  function catNext(c) {
    const ch = [['wander', 3], ['sit', 1.5], ['rest', 2.2]]
    if (has('bowl')) ch.push(['eat', 1])
    if (kitties.length > 1) ch.push(['play', 1.4])
    if (c.name === 'moru' && !ball.held) ch.push(['ball', 2])
    const kind = weighted(ch)
    const [x, y] = floorPt()
    switch (kind) {
      case 'rest': {
        // each its own way to rest: 단추 sits up with a paw raised, 호두
        // rolls on her back on a rug, 모루 sleeps on the cushion
        if (c.name === 'moru' && !taken('rest', c, 'cushion')) {
          const s = R.spots.cushion
          return go(c, [s.door, s.at], 150, { pose: 'rest', dur: rnd(6, 9), door: s.door, spot: 'cushion' })
        }
        if (c.name === 'hodu') {
          const rugs = ['rug', 'rug2'].filter((id) => has(id) && !taken('rest', c, id))
          if (rugs.length) {
            const id = pick(rugs)
            const s = R.spots[id]
            return go(c, s.door ? [s.door, s.at] : [s.at], 150, { pose: 'rest', dur: rnd(5, 8), door: s.door, spot: id })
          }
        }
        return go(c, [[x, y]], 150, { pose: 'rest', dur: rnd(4, 7) })
      }
      case 'eat':
        if (!taken('eat', c, 'bowl')) return go(c, [R.spots.bowl.at], 150, { pose: 'eat', dur: rnd(3, 5), spot: 'bowl' })
        break
      case 'play': {
        // two of them chase round the floor, then face each other
        const o = pick(kitties.filter((q) => q !== c && !deep(q)))
        if (!o) break
        o.act = { kind: 'chase', target: c, t: 0, dur: 3.2 }
        o.door = null
        return go(c, [[x, y], floorPt()], 260, { pose: c.name === 'danchu' ? 'rest' : 'sit', dur: 2.2, faceTo: o })
      }
      case 'ball':
        c.nudges = 3
        return go(c, [clampFloor(ball.x + 34, ball.y + 2)], 160, { pose: 'nudge' })
      case 'sit':
        return go(c, [[x, y]], 150, { pose: 'sit', dur: rnd(2, 4) })
    }
    return go(c, [[x, y]], 150, { pose: 'sit', dur: rnd(1, 2.5) })
  }

  // one step along someone's path; true at its end
  function walk(who, dt) {
    const a = who.act
    let left = a.speed * dt
    while (left > 0 && a.path.length) {
      const [tx, ty] = a.path[0]
      const dx = tx - who.x
      const dy = ty - who.y
      const d = Math.hypot(dx, dy)
      if (d <= left) {
        who.x = tx
        who.y = ty
        left -= d
        who.step = (who.step || 0) + d
        a.path.shift()
        continue
      }
      who.vx = (dx / d) * a.speed
      who.vy = (dy / d) * a.speed
      who.x += (dx / d) * left
      who.y += (dy / d) * left
      who.step = (who.step || 0) + left
      left = 0
    }
    return !a.path.length
  }

  function updateMano(dt) {
    const m = mano
    m.hop = Math.max(0, m.hop - dt)
    if (!m.act) manoNext()
    const a = m.act
    if (a.kind === 'go') {
      if (!walk(m, dt)) {
        m.dir = dirOf(m.vx, m.vy)
        m.phase += dt * 1000 * (a.speed > 200 ? 1.6 : 0.8)
        if (a.speed > 200 && Math.random() < dt * 14) puff(m.x, m.y)
        return
      }
      const then = a.then
      if (then.pose === 'zoom' && m.laps-- > 0) return go(m, [floorPt()], 330, then)
      if (then.ball) ball.held = true
      m.act = { kind: 'do', ...then, t: 0, dur: then.dur ?? 1 }
      if (then.face) m.dir = then.face
      if (then.line) say(then.line, 2)
      return
    }
    a.t += dt
    m.vx = m.vy = 0
    if (a.pose === 'sleep' && Math.random() < dt * 1.2) parts.push({ x: m.x + 30, y: m.y - 80, vx: 18, vy: -26, t: 0, life: 1.8, kind: 'z' })
    if (a.pose === 'sit' && Math.random() < dt * 0.8) parts.push({ x: m.x + rnd(-30, 30), y: m.y - 130, vx: rnd(-10, 10), vy: -30, t: 0, life: 1.2, kind: 'note' })
    if (a.pose === 'punch') {
      a.hit = (a.hit || 0) - dt
      if (a.hit <= 0) {
        a.hit = 0.34
        const fx = m.x + (m.dir === 'nw' || m.dir === 'w' ? -36 : 36)
        sparkle(fx, m.y - 110, 3)
        parts.push({ x: fx, y: m.y - 140, vx: 0, vy: -40, t: 0, life: 0.5, kind: 'pow' })
      }
    }
    if (a.pose === 'pet' && Math.random() < dt * 2.5) parts.push({ x: m.x + 40, y: m.y - 120, vx: rnd(-10, 10), vy: -40, t: 0, life: 1, kind: 'heart' })
    if (a.t >= a.dur) {
      if (a.ball) {
        // she puts the ball down and gives it a little push
        ball.held = false
        Object.assign(ball, { x: m.x + 30, y: m.y + 6, vx: rnd(80, 160), vy: rnd(-60, 60) })
      }
      m.act = null
    }
  }

  function updateCat(c, dt) {
    c.hop = Math.max(0, c.hop - dt)
    if (!c.act) catNext(c)
    const a = c.act
    if (a.kind === 'chase') {
      // after someone, a step behind
      a.t += dt
      const T = a.target
      const dx = T.x - 50 * Math.sign(T.vx || 1) - c.x
      const dy = T.y + 10 - c.y
      const d = Math.hypot(dx, dy) || 1
      const s = Math.min(d, 300 * dt)
      c.vx = (dx / d) * 300
      c.vy = (dy / d) * 300
      c.x += (dx / d) * s
      c.y += (dy / d) * s
      c.step += s
      if (Math.abs(c.vx) > 1) c.face = Math.sign(c.vx)
      const running = T.act && T.act.kind === 'go'
      if (a.t >= a.dur || (!running && a.t > 0.6)) {
        c.act = { kind: 'do', pose: 'sit', t: 0, dur: 1.5 }
        c.face = T.x >= c.x ? 1 : -1
      }
      return
    }
    if (a.kind === 'go') {
      if (!walk(c, dt)) {
        if (Math.abs(c.vx) > 1) c.face = Math.sign(c.vx)
        return
      }
      const then = a.then
      if (then.pose === 'nudge') {
        // 모루 bats the ball away and goes after it
        if (ball.held) return (c.act = null)
        const dir = Math.random() < 0.5 ? -1 : 1
        Object.assign(ball, { vx: dir * rnd(140, 220), vy: rnd(-80, 80) })
        c.face = dir
        c.hop = 0.3
        sparkle(ball.x, ball.y - 10, 3, '#ff6b5b')
        c.act = { kind: 'do', pose: 'sit', t: 0, dur: c.nudges-- > 0 ? 0.6 : 1.4, again: c.nudges >= 0 }
        return
      }
      c.act = { kind: 'do', ...then, t: 0 }
      if (then.faceTo) c.face = then.faceTo.x >= c.x ? 1 : -1
      return
    }
    a.t += dt
    if (a.pose === 'rest' && c.name === 'moru' && Math.random() < dt * 0.8) parts.push({ x: c.x + 40, y: c.y - 60, vx: 14, vy: -22, t: 0, life: 1.6, kind: 'z' })
    if (a.t >= a.dur) {
      c.act = null
      if (a.again && !ball.held) go(c, [clampFloor(ball.x - 34 * Math.sign(ball.vx || 1), ball.y + 2)], 180, { pose: 'nudge' })
    }
  }

  // ── little things in the air ──
  function sparkle(x, y, n, c = '#ffd257') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU
      parts.push({ x, y, vx: Math.cos(a) * rnd(40, 110), vy: Math.sin(a) * rnd(40, 110) - 30, t: 0, life: rnd(0.4, 0.8), kind: 'spark', c })
    }
  }
  function puff(x, y) {
    parts.push({ x: x + rnd(-14, 14), y: y - 2, vx: rnd(-30, 30), vy: -14, t: 0, life: 0.45, kind: 'dust' })
  }
  function say(text, life = 1.8) {
    bubble = { text, t: 0, life }
  }

  // ── drawing (in the room's pixels; ctx is scaled to the canvas) ──
  // a frame of the fight's sheets, kk room pixels a sheet pixel, its feet at
  // (x, y) (bottom: the picture's own bottom middle, for her profile poses)
  function sheet(name, x, y, kk, { flip = false, bottom = false } = {}) {
    const f = FRAMES[name]
    const im = f && img && img[f.sheet]
    if (!im) return
    const b = f.contentBounds
    const pivX = bottom ? b.x + b.w / 2 : f.pivot[0]
    const pivY = bottom ? b.y + b.h : f.pivot[1]
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.translate(x, y)
    ctx.scale(flip ? -kk : kk, kk)
    ctx.drawImage(im, f.rect.x + b.x, f.rect.y + b.y, b.w, b.h, b.x - pivX, b.y - pivY, b.w, b.h)
    ctx.restore()
  }
  // one of the room's own poses, its feet (bottom middle) at (x, y); false
  // while its picture is not there
  function pose(name, x, y, flip = false) {
    const P = A.poses[name]
    const p = pic(P.file)
    if (!p.ok) return false
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(x, y)
    ctx.scale(flip ? -1 : 1, 1)
    ctx.drawImage(p.img, -P.w / 2, -P.h, P.w, P.h)
    ctx.restore()
    return true
  }
  function shadow(x, y, w) {
    ctx.fillStyle = 'rgba(70, 35, 15, 0.22)'
    ctx.beginPath()
    ctx.ellipse(x, y, w, w * 0.28, 0, 0, TAU)
    ctx.fill()
  }

  function drawMano() {
    const m = mano
    const a = m.act
    const lift = m.hop > 0 ? Math.sin((Math.PI * (0.6 - m.hop)) / 0.6) * 40 : 0
    const doing = a && a.kind === 'do' ? a.pose : null
    if (doing === 'sleep') return sheet('menu_sleep', m.x, m.y, PROFILE_K, { bottom: true })
    shadow(m.x, m.y, 46)
    if (a && a.kind === 'go') return sheet(animFrame('run_' + m.dir, m.phase), m.x, m.y, MANO_K)
    if (doing === 'wave') return sheet('menu_wave', m.x, m.y - lift, PROFILE_K, { bottom: true })
    if (doing === 'sit') {
      // her own pose with the ball (the room's picture of her); her sitting
      // sprite while that picture is not there
      if (!pose('mano_sit', m.x, m.y + 6)) sheet('down_3', m.x, m.y, MANO_K)
      return
    }
    if (doing === 'punch') {
      const kq = Math.max(0, a.hit || 0) / 0.34
      const run = m.dir === 'nw' ? 'run_nw' : m.dir === 'n' ? 'run_n' : 'run_ne'
      return sheet(animFrame(run, now * 1.6), m.x + (1 - kq) * (m.dir === 'nw' ? -10 : 10), m.y, MANO_K)
    }
    if (doing === 'pet') return sheet(animFrame('idle_e', now), m.x, m.y, MANO_K, { flip: !!a.cat && a.cat.x < m.x })
    const dir = doing === 'look' ? m.dir : 's'
    sheet(animFrame(IDLE[dir], now), m.x, m.y - lift, MANO_K, { flip: dir === 'nw' || dir === 'w' || dir === 'sw' })
  }

  function drawCat(c) {
    const a = c.act
    const lift = c.hop > 0 ? Math.sin((Math.PI * (0.3 - c.hop)) / 0.3) * 18 : 0
    // its own resting pose (단추's picture looks right, the others' left:
    // turned to where it faces)
    if (a && a.kind === 'do' && a.pose === 'rest' && pose(c.pose, c.x, c.y + 4, c.name === 'danchu' ? c.face < 0 : c.face > 0)) return
    shadow(c.x, c.y, 25)
    let f = Math.floor(now / 450 + c.x) % 2
    let sy = 1
    if (a && (a.kind === 'go' || a.kind === 'chase')) f = Math.floor(c.step / 26) % 4
    else if (a && a.pose === 'eat') {
      f = 2
      sy = 1 - 0.08 * Math.abs(Math.sin(now / 70))
    } else if (a && a.pose === 'rest') (f = 0), (sy = 0.72)
    const F = FRAMES[`${c.id}_${c.face > 0 ? 'r' : 'l'}_${f}`]
    const im = F && img && img[F.sheet]
    if (!im) return
    const b = F.contentBounds
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.translate(c.x, c.y - lift)
    ctx.scale(catK, catK * sy)
    ctx.drawImage(im, F.rect.x + b.x, F.rect.y + b.y, b.w, b.h, b.x - F.pivot[0], b.y - F.pivot[1], b.w, b.h)
    ctx.restore()
  }

  function drawBall() {
    if (ball.held) return
    shadow(ball.x, ball.y, 14)
    sheet('ball', ball.x, ball.y - 14, 0.9)
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
      ctx.globalAlpha = Math.min(1, (1 - p.t / p.life) * 2)
      if (p.kind === 'spark') {
        ctx.fillStyle = p.c
        ctx.fillRect(p.x - 3 * ui, p.y - 3 * ui, 6 * ui, 6 * ui)
      } else if (p.kind === 'dust') {
        ctx.fillStyle = '#ead6b0'
        ctx.fillRect(p.x - 7, p.y - 4, 14, 8)
      } else {
        ctx.font = `${Math.round((p.kind === 'pow' ? 15 : 13) * ui)}px ${font}`
        ctx.textAlign = 'center'
        ctx.lineWidth = 3 * ui
        ctx.strokeStyle = 'rgba(255, 250, 240, 0.85)'
        const text = p.kind === 'heart' ? '♥' : p.kind === 'note' ? '♪' : p.kind === 'pow' ? '퍽!' : 'z'
        ctx.strokeText(text, p.x, p.y)
        ctx.fillStyle = p.kind === 'heart' ? '#ff6f8f' : p.kind === 'note' ? '#c0544a' : p.kind === 'pow' ? '#e2564b' : '#6c7fb0'
        ctx.fillText(text, p.x, p.y)
      }
    }
    ctx.globalAlpha = 1
  }

  // a speech bubble, its size in CSS pixels whatever the room's scale
  function label(x, y, text) {
    ctx.font = `${Math.round(13 * ui)}px ${font}`
    const w = ctx.measureText(text).width + 14 * ui
    const h = 22 * ui
    const bx = Math.max(6 * ui, Math.min(W - w - 6 * ui, x - w / 2))
    const by = Math.max(4 * ui, y - h)
    ctx.fillStyle = '#fffaf0'
    ctx.strokeStyle = '#3b2a22'
    ctx.lineWidth = 2 * ui
    ctx.beginPath()
    ctx.roundRect(bx, by, w, h, 8 * ui)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#3b2a22'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, bx + w / 2, by + h / 2 + ui)
    ctx.textBaseline = 'alphabetic'
  }

  function drawBackground(dt) {
    // the stage's picture (fading in over the last one when the room grows)
    const cur = pic(A.stages[stage].file)
    if (fade) {
      const from = pic(A.stages[fade.from].file)
      if (from.ok) ctx.drawImage(from.img, 0, 0, W, H)
      if (cur.ok || cur.failed) fade.t += dt
      if (cur.ok) {
        ctx.globalAlpha = Math.min(1, fade.t / 0.9)
        ctx.drawImage(cur.img, 0, 0, W, H)
        ctx.globalAlpha = 1
      }
      if (fade.t >= 0.9) fade = null
      if (from.ok) return
    }
    if (cur.ok) return ctx.drawImage(cur.img, 0, 0, W, H)
    // not there (yet, or at all): a plain room
    ctx.fillStyle = '#3a2a22'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#efe0c4'
    ctx.fillRect(110, 60, W - 220, 330)
    ctx.fillStyle = '#c48a52'
    ctx.fillRect(40, 390, W - 80, 440)
    if (cur.failed) {
      ctx.font = `${Math.round(13 * ui)}px ${font}`
      ctx.fillStyle = '#5b4030'
      ctx.textAlign = 'center'
      ctx.fillText('방 그림을 불러오지 못했어요', W / 2, 230)
    }
  }

  function frame(t) {
    if (gone) return
    const dt = Math.min(0.05, (t - last) / 1000)
    last = t
    now = t
    // the ball rolling to a stop on the open floor
    if (!ball.held) {
      ball.x += ball.vx * dt
      ball.y += ball.vy * dt
      ball.vx *= Math.max(0, 1 - 2.2 * dt)
      ball.vy *= Math.max(0, 1 - 2.2 * dt)
      if (ball.x <= wx0 || ball.x >= wx1) ball.vx = -ball.vx
      if (ball.y <= wy0 || ball.y >= wy1) ball.vy = -ball.vy
      ;[ball.x, ball.y] = clampFloor(ball.x, ball.y)
    }
    updateMano(dt)
    for (const c of kitties) updateCat(c, dt)
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.clearRect(0, 0, W, H)
    drawBackground(dt)
    // everyone back to front by their feet
    const list = [[mano.y + 0.1, 0, mano], [ball.y, 1, ball]]
    for (const c of kitties) list.push([c.y, 2, c])
    list.sort((a, b) => a[0] - b[0])
    for (const [, kind, o] of list) kind === 0 ? drawMano() : kind === 1 ? drawBall() : drawCat(o)
    drawParts(dt)
    if (bubble) {
      bubble.t += dt
      if (bubble.t >= bubble.life) bubble = null
      else label(mano.x, mano.y - (mano.act && mano.act.pose === 'sleep' ? 110 : MANO_H + 10), bubble.text)
    }
    if (toast) {
      toast.t += dt
      if (toast.t >= 3) toast = null
      else {
        ctx.globalAlpha = Math.min(1, (3 - toast.t) * 3)
        label(W / 2, 34 * ui, toast.text)
        ctx.globalAlpha = 1
      }
    }
    raf = requestAnimationFrame(frame)
  }

  // the levels now: the room's stage (a higher one fades in, with a word)
  function setTotal(t) {
    const s = roomStage(D, t)
    if (s === stage) return
    const up = s > stage
    pic(A.stages[s].file)
    if (up) {
      fade = { from: stage, t: 0 }
      toast = { text: s === R.stages.length - 1 ? R.completeLine : R.stageUp.replace('{name}', R.stages[s].name), t: 0 }
      for (let i = 0; i < 5; i++) sparkle(rnd(200, W - 200), rnd(150, 600), 6, pick(['#ffd257', '#ff9ab0', '#9ad0ff']))
    }
    stage = s
    // (fewer levels only with another save read in: everyone starts afresh)
    if (!up) for (const who of [mano, ...kitties]) (who.act = null), (who.door = null), ([who.x, who.y] = clampFloor(who.x, who.y))
  }

  function resize(cssW) {
    // as many device pixels as the canvas shows (at most the picture's own)
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(160, Math.min(W, Math.round(cssW * dpr)))
    canvas.width = w
    canvas.height = Math.round((w * H) / W)
    k = w / W
    ui = dpr / k
  }

  raf = requestAnimationFrame(frame)
  return {
    resize,
    setTotal,
    setCats,
    // a coin stat bought: a hop, a wave and her line
    react(stat) {
      mano.hop = 0.6
      if (mano.act && mano.act.ball) ball.held = false
      mano.act = { kind: 'do', pose: 'wave', t: 0, dur: 1.4 }
      mano.door = null
      ;[mano.x, mano.y] = clampFloor(mano.x, mano.y)
      say(R.reactions[stat] || '좋아!', 1.6)
      sparkle(mano.x, mano.y - MANO_H / 2, 8)
      for (let i = 0; i < 3; i++) parts.push({ x: mano.x + rnd(-30, 30), y: mano.y - MANO_H, vx: rnd(-20, 20), vy: -60, t: 0, life: 1, kind: 'heart' })
    },
    // (the dev page's hook: Mano does this next)
    play(kind) {
      mano.act = null
      manoNext(kind)
    },
    stage: () => stage,
    destroy() {
      gone = true
      cancelAnimationFrame(raf)
    },
  }
}
