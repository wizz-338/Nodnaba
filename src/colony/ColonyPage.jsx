import { useEffect, useRef, useState } from 'react'
import {
  BUILDINGS,
  BUILDING_TYPES,
  CATEGORIES,
  DECOR,
  DECOR_TYPES,
  FLOORS,
  FLOOR_TYPES,
  MANO,
  NODES,
  OFFLINE,
  RESOURCES,
  RES_LABEL,
  SAVE,
  START,
  STORAGE_NOTICE,
  TUTORIAL,
  ZONES,
  ZONE_IDS,
} from './config.js'
import { idx, inMap } from './world.js'
import * as sim from './sim.js'
import {
  activity,
  buildWork,
  canBuild,
  canDecorate,
  canMove,
  canUnlock,
  canUpgrade,
  caps,
  homes,
  lineCells,
  maxCrew,
  newGame,
  planFence,
  planFloors,
  rectCells,
  siteEta,
  tick,
  worldFor,
} from './sim.js'
import { applyOffline, elapsed, hasNews } from './offline.js'
import { browserStorage, createStore, exportName, exportText, KEYS, parse } from './save.js'
import { createRenderer, decorSprite, standPoint } from './render.js'
import { ICONS, loadAssets } from './assets.js'
import { josa } from './text.js'
import './colony.css'

// ── small helpers ────────────────────────────────────────────────────────────

const fmtDuration = (sec) => {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}시간${m ? ` ${m}분` : ''}`
  if (m) return `${m}분${s % 60 ? ` ${s % 60}초` : ''}`
  return `${s}초`
}
const fmtClock = (t) => (t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '')
const resText = (c) =>
  RESOURCES.filter((r) => c[r])
    .map((r) => `${RES_LABEL[r]} ${c[r]}`)
    .join(' · ')

const MAX_LINE = 160 // tiles in one drawn line or area

function newSeed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1
  } catch {
    return (Date.now() % 2147483647) + 1
  }
}

function effectText(type, level) {
  const l = BUILDINGS[type].levels[level - 1]
  if (type === 'house') return `주민 ${l.homes}명이 살 수 있어요`
  if (type === 'storage') return `보관 한도 나무·돌 +${l.cap.wood}, 별가루 +${l.cap.stardust}`
  const what = type === 'lumber' ? '나무' : '돌'
  return `${what} 채집 ${Math.round((l.speed - 1) * 100)}% 빠르게, 한 번에 ${l.carry}개 더`
}

// why an action cannot happen right now, in one short line
function reasonText(r) {
  if (!r || r.ok) return ''
  if (r.over) return `보관 한도가 부족해요 (${Object.entries(r.over).map(([k, v]) => `${RES_LABEL[k]} 최대 ${v}`).join(', ')})`
  if (r.missing && Object.keys(r.missing).length) return Object.entries(r.missing).map(([k, v]) => `${RES_LABEL[k]} ${v}`).join(', ') + ' 부족'
  return r.reason
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const SAVE_ERRORS = {
  unavailable: '이 브라우저에서는 저장할 수 없어요 (사생활 보호 모드이거나 저장이 막혀 있어요).',
  full: '브라우저 저장 공간이 가득 차서 저장하지 못했어요.',
  blocked: '브라우저가 저장을 막았어요.',
  verify: '저장이 제대로 되지 않았어요.',
}

// the drawing used for a catalog entry
function thumbOf(item) {
  if (item.kind === 'building') return { atlas: 'buildings', sprite: `${item.type}_${item.level || 1}` }
  if (item.kind === 'floor') return { atlas: 'tiles', sprite: FLOORS[item.type].tex }
  if (item.kind === 'erase') return { atlas: 'tiles', sprite: 'grass_0' }
  const def = DECOR[item.type]
  if (def.icon) return { atlas: def.icon[0], sprite: def.icon[1] }
  return decorSprite(item.type, 0)
}

function Thumb({ A, atlas, sprite, flip, size = 52 }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    const a = A && A[atlas]
    const f = a && a.frames[sprite]
    if (!c || !f) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = size * dpr
    c.height = size * dpr
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    const k = Math.min((size * dpr) / f.w, (size * dpr) / f.h)
    const w = f.w * k
    const h = f.h * k
    g.save()
    if (flip) {
      g.translate(c.width, 0)
      g.scale(-1, 1)
    }
    g.imageSmoothingQuality = 'high'
    g.drawImage(a.img, f.x, f.y, f.w, f.h, (c.width - w) / 2, (c.height - h) / 2, w, h)
    g.restore()
  }, [A, atlas, sprite, flip, size])
  return <canvas ref={ref} className="mc-thumb" style={{ width: size, height: size }} aria-hidden="true" />
}

function Cost({ cost, s, free }) {
  if (free) return <span className="mc-costs mc-free">보관함에서 · 무료</span>
  const c = caps(s)
  const rs = RESOURCES.filter((r) => cost[r])
  if (!rs.length) return <span className="mc-costs mc-free">무료</span>
  return (
    <span className="mc-costs">
      {rs.map((r) => (
        <span key={r} className={`mc-cost ${s.res[r] < cost[r] ? 'is-lack' : ''} ${c[r] < cost[r] ? 'is-over' : ''}`}>
          <img src={ICONS[r]} alt={RES_LABEL[r]} />
          {cost[r]}
        </span>
      ))}
    </span>
  )
}

// ── what the current mode would do (cached; also drawn every frame) ─────────

function sizeOf(obj, type) {
  return obj === 'building' ? BUILDINGS[type].size : DECOR[type].size || [1, 1]
}

function evalMode(g, mode) {
  const { s, world: w } = g
  const key = JSON.stringify([mode, w.version, RESOURCES.map((r) => Math.floor(s.res[r])), s.inventory])
  if (g.pc && g.pc.key === key) return g.pc.val
  let val = { cells: null, ghost: null, check: null, plan: null }
  if (mode.kind === 'place' || mode.kind === 'move') {
    let check
    let level = 1
    let dir = mode.dir || 0
    if (mode.kind === 'move') {
      check = canMove(s, w, mode.id, mode.x, mode.y)
      const o = sim.findObj(s, mode.id)
      if (o && mode.obj === 'building') level = Math.max(1, o.level)
    } else if (mode.obj === 'building') {
      check = canBuild(s, w, mode.type, mode.x, mode.y, mode.stored ?? null)
      if (mode.stored != null && s.stored[mode.stored]) level = Math.max(1, s.stored[mode.stored].level)
    } else check = canDecorate(s, w, mode.type, mode.x, mode.y)
    const [sw, sh] = sizeOf(mode.obj, mode.type)
    const p = standPoint(mode.x, mode.y, sw, sh)
    const spr =
      mode.obj === 'building'
        ? { atlas: 'buildings', sprite: `${mode.type}_${level}` }
        : DECOR[mode.type].icon
          ? { atlas: DECOR[mode.type].icon[0], sprite: DECOR[mode.type].icon[1] }
          : decorSprite(mode.type, dir)
    val = {
      check,
      cells: check.cells || null,
      ghost: { ...spr, X: p.X, Y: p.Y, ok: check.ok, depth: mode.x + sw / 2 + mode.y + sh / 2 },
    }
  } else if (mode.kind === 'paint' && mode.a) {
    const b = mode.b || mode.a
    let cells = mode.shape === 'rect' ? rectCells(mode.a, b) : lineCells(mode.a, b)
    const tooLong = cells.length > MAX_LINE
    if (tooLong) cells = cells.slice(0, MAX_LINE)
    const plan = mode.tool === 'fence' ? planFence(s, w, cells) : planFloors(s, w, mode.tool === 'erase' ? null : mode.type, cells)
    val = { plan, cells: plan.cells, tooLong }
  }
  g.pc = { key, val }
  return val
}

// ── the page ─────────────────────────────────────────────────────────────────

export default function ColonyPage({ exitHref = '#/' }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const fileRef = useRef(null)
  const G = useRef(null) // the running game: state, world, store, renderer…
  const ui = useRef({ mode: null, sel: null })
  const [phase, setPhase] = useState('loading') // loading | locked | corrupt | future | migrate | error | play
  const [info, setInfo] = useState({})
  const [, setBeat] = useState(0)
  const [panel, setPanel] = useState(null) // build | storage | mano | settings
  const [cat, setCat] = useState('build')
  const [folded, setFolded] = useState(false)
  const [mode, setMode] = useState(null)
  const [sel, setSel] = useState(null)
  const [modals, setModals] = useState([])
  const [toasts, setToasts] = useState([])
  const [saveState, setSaveState] = useState({ ok: true, at: 0 })

  ui.current.mode = mode
  ui.current.sel = sel
  const rerender = () => setBeat((x) => x + 1)
  const pushModal = (m) => setModals((q) => [...q, m])
  const closeModal = () => setModals((q) => q.slice(1))

  const toast = (text, key = text, kind = '') => {
    const id = Math.random()
    setToasts((t) => [...t.filter((x) => x.key !== key), { id, key, text, kind }].slice(-3))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400)
  }

  // ── boot: images, one-tab lock, save ──
  useEffect(() => {
    let cancelled = false
    const store = createStore(browserStorage())
    const g = {
      store,
      tabId: Math.random().toString(36).slice(2) + Date.now().toString(36),
      active: false,
      perf: { tick: 0, draw: 0, frames: 0 }, // time spent per part (read by browser tests)
      lastSave: 0,
      wasFull: false,
      fullToast: {},
    }
    G.current = g

    g.save = () => {
      if (!g.s || (!g.active && !g.handover)) return
      if (g.store.available && !g.handover) {
        const l = g.store.readLock()
        if (l && l.id !== g.tabId) return // another tab plays now; never write over it
      }
      g.lastSave = Date.now()
      const r = g.store.save(g.s, g.lastSave)
      setSaveState(r.ok ? { ok: true, at: r.at } : { ok: false, error: r.error })
    }

    g.play = (s, notes = [], noteTitle = '') => {
      const now = Date.now()
      s.cap = caps(s)
      g.s = s
      g.world = worldFor(s)
      g.pc = null
      const queue = []
      // time away: one calculation, saved right away together with its time
      const el = elapsed(s.clock.simAt, now)
      if (el.seconds > 0) {
        const rep = applyOffline(s, g.world, el.seconds)
        if (el.seconds >= OFFLINE.minNotice) queue.push({ kind: 'offline', rep, capped: el.capped, full: !hasNews(rep) && RESOURCES.every((r) => s.res[r] >= caps(s)[r] - 1) })
      }
      s.clock.simAt = now
      g.active = true
      g.wasFull = s.manos.length >= homes(s)
      if (!s.notice.storage) queue.unshift({ kind: 'notice', first: true })
      // things to read go in a box; a short confirmation is a toast
      if (notes.length && noteTitle) queue.push({ kind: 'notes', title: noteTitle, notes })
      setModals(queue)
      setSel(null)
      setMode(null)
      setPanel(null)
      setPhase('play')
      if (store.available) g.save()
      else setSaveState({ ok: false, error: 'unavailable' })
      g.lookHome?.()
      if (!noteTitle) setTimeout(() => notes.forEach((n) => toast(n, n, 'info')), 50)
    }

    g.fromStorage = () => {
      if (cancelled) return
      const r = store.load()
      if (r.status === 'corrupt') {
        setInfo({ error: r.error, raw: r.raw })
        return setPhase('corrupt')
      }
      if (r.status === 'future') {
        setInfo({ raw: r.raw, version: r.version })
        return setPhase('future')
      }
      if (r.status === 'migrate-failed') {
        setInfo({ raw: r.raw, error: r.error, version: r.version })
        return setPhase('migrate')
      }
      // the short guide is for the first visit only
      if (r.data && (r.data.tutorial.step > 0 || r.data.buildings.length)) r.data.tutorial.done = true
      const notes = []
      let title = ''
      if (r.status === 'restored') {
        title = '저장 데이터 복구'
        notes.push('저장본이 손상되어 직전 백업으로 복구했어요. 손상된 데이터는 따로 보관해 두었어요.')
      }
      if (r.status === 'migrated' || (r.status === 'restored' && r.from < SAVE.version)) {
        title = '새 마을 지도로 옮겼어요'
        notes.push('예전 저장을 새 대각선 지도로 옮겼어요. 자원·주민·건물 레벨과 공사 진행은 그대로예요.', ...(r.notes || []))
      }
      g.play(r.data || newGame(Date.now(), newSeed()), notes, title)
    }

    // take the game in this tab; wait a moment so a tab that is handing
    // over can finish its last save first
    g.claim = (wait) => {
      store.claimLock(g.tabId)
      setTimeout(() => {
        if (cancelled) return
        const l = store.readLock()
        if (l && l.id !== g.tabId) return setPhase('locked')
        g.fromStorage()
      }, wait)
    }

    loadAssets()
      .then((A) => {
        if (cancelled) return
        g.A = A
        if (!store.available) return g.play(newGame(Date.now(), newSeed()))
        const l = store.readLock()
        if (!store.lockFree(g.tabId)) return setPhase('locked')
        g.claim(l && l.id !== g.tabId ? 600 : 60)
      })
      .catch((e) => {
        if (cancelled) return
        setInfo({ error: e.message })
        setPhase('error')
      })

    return () => {
      cancelled = true
      if (g.active) g.save()
      g.active = false
      store.releaseLock(g.tabId)
    }
  }, [])

  // ── running: loop, input, autosave, lock heartbeat ──
  useEffect(() => {
    if (phase !== 'play') return
    const g = G.current
    const canvas = canvasRef.current
    const stage = stageRef.current
    const R = createRenderer(canvas, g.A)
    g.R = R

    const fit = () => {
      const r = stage.getBoundingClientRect()
      R.resize(r.width, r.height)
    }
    fit()
    g.lookHome = () => {
      R.view.zoom = 0.9
      R.lookAtTile(START.camp.x + 1, START.camp.y + 2)
    }
    g.lookHome()
    const ro = new ResizeObserver(fit)
    ro.observe(stage)
    const onTurn = () => setTimeout(fit, 250)
    addEventListener('orientationchange', onTurn)

    const handle = (events) => {
      for (const e of events) {
        if (e.type === 'built') {
          const b = g.s.buildings.find((x) => x.id === e.b)
          if (b) toast(`${BUILDINGS[b.type].name} Lv${e.level} 완성!`, 'built' + e.b, 'good')
          g.save()
        }
        if (e.type === 'arrive') toast('새 마노가 이사 왔어요!', 'arrive', 'good')
        if (e.type === 'deliver' && e.lost > 0) {
          const now = Date.now()
          if (!g.fullToast[e.res] || now - g.fullToast[e.res] > 25000) {
            g.fullToast[e.res] = now
            toast(`${RES_LABEL[e.res]} 보관 한도가 가득 찼어요. 저장소를 짓거나 올려 주세요.`, 'full' + e.res, 'warn')
          }
        }
      }
      const full = g.s.manos.length >= homes(g.s)
      if (full && !g.wasFull) toast('빈집이 없어요. 마노 집을 지으면 새 마노가 와요.', 'homes', 'warn')
      g.wasFull = full
    }

    let raf
    let last = performance.now()
    let hudT = 0
    const frame = (pnow) => {
      raf = requestAnimationFrame(frame)
      if (!g.active) return
      const s = g.s
      const now = Date.now()
      const gap = (now - s.clock.simAt) / 1000
      const events = []
      if (gap > OFFLINE.gap) {
        // back from the background (or the clock jumped): same path as a reload
        const el = elapsed(s.clock.simAt, now)
        const rep = applyOffline(s, g.world, el.seconds)
        s.clock.simAt = now
        if (el.seconds >= OFFLINE.minNotice) pushModal({ kind: 'offline', rep, capped: el.capped, full: !hasNews(rep) && RESOURCES.every((r) => s.res[r] >= caps(s)[r] - 1) })
        g.save()
      } else if (gap > 0) {
        const t0 = performance.now()
        for (let left = gap; left > 1e-6; left -= 0.05) tick(s, g.world, Math.min(0.05, left), events)
        g.perf.tick += performance.now() - t0
        s.clock.simAt = now
      } else s.clock.simAt = now // clock went back: carry on from here, nothing negative
      const dt = Math.min(0.1, (pnow - last) / 1000)
      last = pnow
      R.events(events, s.settings.effects)
      handle(events)
      const m = ui.current.mode
      const view = { selected: ui.current.sel && ui.current.sel.id, grid: !!m, moving: m && m.kind === 'move' ? m.id : null, cells: null, ghost: null }
      if (m) {
        const p = evalMode(g, m)
        view.cells = p.cells
        view.ghost = p.ghost
      }
      const t1 = performance.now()
      R.draw(s, g.world, view, dt)
      g.perf.draw += performance.now() - t1
      g.perf.frames++
      hudT += dt
      if (hudT > 0.25) {
        hudT = 0
        rerender()
      }
      if (now - g.lastSave > SAVE.every * 1000) g.save()
    }
    raf = requestAnimationFrame(frame)

    // ── map input ──
    // no mode: one finger drags the map, two pinch; a tap selects.
    // placing / moving: a tap (or dragging the preview) sets the spot.
    // drawing paths and fences: one finger draws, two fingers move the map
    // (or switch the bar to "지도 이동").
    const pts = new Map()
    let down = null
    let moved = false
    let pinch = null
    let gesture = null // pan | ghost | draw
    const pos = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const centred = (m, t) => {
      const [w, h] = sizeOf(m.obj, m.type)
      return { x: t.x - Math.floor((w - 1) / 2), y: t.y - Math.floor((h - 1) / 2) }
    }
    const inGhost = (m, t) => {
      const [w, h] = sizeOf(m.obj, m.type)
      return t.x >= m.x - 1 && t.x <= m.x + w && t.y >= m.y - 1 && t.y <= m.y + h
    }
    const clampTile = (t) => ({ x: Math.max(0, Math.min(95, t.x)), y: Math.max(0, Math.min(95, t.y)) })
    const reset = () => {
      pts.clear()
      pinch = null
      down = null
      gesture = null
    }
    const onDown = (e) => {
      if (e.button !== undefined && e.button > 0) return
      canvas.setPointerCapture?.(e.pointerId)
      const p = pos(e)
      pts.set(e.pointerId, p)
      const m = ui.current.mode
      if (pts.size === 1) {
        const t = R.tileAt(p.x, p.y)
        down = { ...p, t: performance.now(), tile: t }
        moved = false
        gesture = 'pan'
        if (m && (m.kind === 'place' || m.kind === 'move') && inGhost(m, t)) gesture = 'ghost'
        if (m && m.kind === 'paint' && !m.pan) gesture = 'draw'
      } else {
        // a second finger: always the map
        if (gesture === 'draw' && moved) setMode((cur) => cur && cur.kind === 'paint' && { ...cur, a: down.before?.a ?? null, b: down.before?.b ?? null })
        gesture = 'pan'
        moved = true
      }
    }
    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return
      const p = pos(e)
      const prev = pts.get(e.pointerId)
      pts.set(e.pointerId, p)
      if (pts.size === 1 && down) {
        if (!moved && Math.hypot(p.x - down.x, p.y - down.y) > 8) {
          moved = true
          if (gesture === 'draw') {
            down.before = ui.current.mode
            const a = clampTile(down.tile)
            setMode((cur) => cur && { ...cur, a, b: a })
          }
        }
        if (!moved) return
        if (gesture === 'pan') R.pan(p.x - prev.x, p.y - prev.y)
        else if (gesture === 'ghost') {
          const t = R.tileAt(p.x, p.y)
          setMode((cur) => {
            if (!cur) return cur
            const c = centred(cur, t)
            return c.x === cur.x && c.y === cur.y ? cur : { ...cur, ...c }
          })
        } else if (gesture === 'draw') {
          const b = clampTile(R.tileAt(p.x, p.y))
          setMode((cur) => (cur && cur.b && cur.b.x === b.x && cur.b.y === b.y ? cur : cur && { ...cur, b }))
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (pinch) {
          R.zoomAt(d / pinch.d, mid.x, mid.y)
          R.pan(mid.x - pinch.mid.x, mid.y - pinch.mid.y)
        }
        pinch = { d, mid }
      }
    }
    const onUp = (e) => {
      if (!pts.has(e.pointerId)) return
      pts.delete(e.pointerId)
      if (pts.size < 2) pinch = null
      if (pts.size === 0) {
        if (!moved && down && performance.now() - down.t < 700) tap(pos(e))
        down = null
        gesture = null
      }
    }
    const onCancel = (e) => {
      pts.delete(e.pointerId)
      if (!pts.size) reset()
    }
    const onWheel = (e) => {
      e.preventDefault()
      const p = pos(e)
      R.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y)
    }
    const tap = ({ x, y }) => {
      const s = g.s
      const m = ui.current.mode
      const t = R.tileAt(x, y)
      if (m && (m.kind === 'place' || m.kind === 'move')) {
        const c = centred(m, t)
        return setMode((cur) => cur && { ...cur, ...c })
      }
      if (m && m.kind === 'paint') {
        const tt = clampTile(t)
        return setMode((cur) => {
          if (!cur) return cur
          // first tap: start; second tap: end; a third starts again
          if (!cur.a || cur.b) return { ...cur, a: tt, b: null }
          return { ...cur, b: tt }
        })
      }
      const h = R.hit(g.world, x, y)
      if (h.id) return setSel({ id: h.id, kind: h.kind })
      if (inMap(t.x, t.y) && !g.world.open[idx(t.x, t.y)]) {
        const z = ZONE_IDS.find((k) => {
          const [x0, y0, x1, y1] = ZONES[k].rect
          return t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1
        })
        if (z && !s.zones[z]) return setSel({ zone: z })
      }
      setSel(null)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('lostpointercapture', onCancel)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    addEventListener('blur', reset)

    // one active tab: keep the lock fresh; if another tab takes over, hand off
    const beat = setInterval(() => {
      if (!g.active || !g.store.available) return
      const l = g.store.readLock()
      if (l && l.id !== g.tabId && !g.store.lockFree(g.tabId)) return lost()
      g.store.claimLock(g.tabId)
    }, SAVE.lockBeat * 1000)
    const lost = () => {
      g.handover = true
      g.save()
      g.handover = false
      g.active = false
      setPhase('locked')
    }
    const onStorage = (e) => {
      if (e.key !== KEYS.lock || !g.active) return
      const l = g.store.readLock()
      if (l && l.id !== g.tabId) lost()
    }
    const onVis = () => {
      if (document.hidden) g.save()
      else if (g.store.available) {
        const l = g.store.readLock()
        if (l && l.id !== g.tabId && !g.store.lockFree(g.tabId)) lost()
        else g.store.claimLock(g.tabId)
      }
    }
    const onLeave = () => {
      g.save()
      g.store.releaseLock(g.tabId)
    }
    addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVis)
    addEventListener('pagehide', onLeave)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMode(null)
        setSel(null)
      }
    }
    addEventListener('keydown', onKey)

    // stop the page behind from scrolling while the game is open
    const root = document.documentElement
    const prev = [root.style.overflow, document.body.style.overflow, root.style.overscrollBehavior]
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    root.style.overscrollBehavior = 'none'

    // dev server only: lets browser tests look inside and fast-forward
    if (import.meta.env.DEV) {
      window.__colony = {
        get s() {
          return g.s
        },
        get world() {
          return g.world
        },
        store: g.store,
        save: g.save,
        perf: g.perf,
        sim,
        R,
        fast(sec) {
          const ev = []
          for (let t = 0; t < sec; t += 0.05) tick(g.s, g.world, 0.05, ev)
          g.s.clock.simAt = Date.now()
          handle(ev)
          return ev.length
        },
      }
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      clearInterval(beat)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('lostpointercapture', onCancel)
      canvas.removeEventListener('wheel', onWheel)
      removeEventListener('blur', reset)
      removeEventListener('orientationchange', onTurn)
      removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVis)
      removeEventListener('pagehide', onLeave)
      removeEventListener('keydown', onKey)
      ;[root.style.overflow, document.body.style.overflow, root.style.overscrollBehavior] = prev
    }
  }, [phase])

  // ── actions ──
  const g = G.current
  const s = g && g.s

  const poof = (x, y) => g.R && g.R.events([{ type: 'place', x, y }], g.s.settings.effects)
  const tutorialStep = (n) => {
    if (!g.s.tutorial.done && g.s.tutorial.step < n) g.s.tutorial.step = n
  }

  // start placing something new (or from the storage box) at the view centre
  const startPlace = (item) => {
    const c = g.R.tileAt(g.R.view.w / 2, g.R.view.h / 2)
    setSel(null)
    setPanel(null)
    if (item.kind === 'floor' || item.kind === 'erase' || item.kind === 'fence') {
      return setMode({ kind: 'paint', tool: item.kind, type: item.type || null, shape: 'line', a: null, b: null, pan: false })
    }
    const obj = item.kind === 'building' ? 'building' : 'decor'
    const [w, h] = sizeOf(obj, item.type)
    setMode({ kind: 'place', obj, type: item.type, stored: item.stored ?? null, x: c.x - Math.floor((w - 1) / 2), y: c.y - Math.floor((h - 1) / 2), dir: 0 })
  }
  const startMove = (id) => {
    const o = sim.findObj(g.s, id)
    if (!o) return
    const obj = id[0] === 'b' ? 'building' : 'decor'
    const c = canMove(g.s, g.world, id, o.x, o.y)
    if (!c.ok && c.reason && !c.cells) return toast(c.reason, 'move', 'warn')
    setMode({ kind: 'move', id, obj, type: o.type, x: o.x, y: o.y, dir: o.dir || 0 })
    setSel(null)
  }

  const confirmMode = () => {
    const m = mode
    if (!m) return
    const S = g.s
    const W = g.world
    if (m.kind === 'move') {
      const r = sim.move(S, W, m.id, m.x, m.y, m.obj === 'decor' ? m.dir : null)
      if (!r.ok) return toast(reasonText(r), 'move', 'warn')
      const [w, h] = sizeOf(m.obj, m.type)
      poof(m.x + w / 2, m.y + h / 2)
      g.save()
      toast('옮겼어요.', 'moved', 'good')
      setMode(null)
      return setSel({ id: m.id, kind: m.obj })
    }
    if (m.kind === 'place') {
      if (m.obj === 'building') {
        const r = sim.build(S, W, m.type, m.x, m.y, m.stored ?? null)
        if (!r.ok) return toast(reasonText(r), 'place', 'warn')
        poof(m.x + 1.5, m.y + 1.5)
        tutorialStep(2)
        g.save()
        toast(r.building.build ? '공사를 시작했어요! 마노들이 와서 지어요.' : '보관함에서 꺼내 놓았어요.', 'placed', 'good')
        setMode(null)
        return setSel({ id: r.building.id, kind: 'building' })
      }
      const r = sim.decorate(S, W, m.type, m.x, m.y, m.dir || 0)
      if (!r.ok) return toast(reasonText(r), 'place', 'warn')
      const [w, h] = sizeOf('decor', m.type)
      poof(m.x + w / 2, m.y + h / 2)
      tutorialStep(2)
      g.save()
      toast(r.fromBox ? `${DECOR[m.type].name}: 보관함에서 꺼냈어요.` : `${josa(DECOR[m.type].name, '을', '를')} 놓았어요.`, 'placed', 'good')
      // keep placing the same thing while there is more of it to place
      return
    }
    if (m.kind === 'paint') {
      const p = evalMode(g, m)
      if (!p.plan) return
      const cells = p.plan.cells.map(([x, y]) => [x, y])
      const r = m.tool === 'fence' ? sim.placeFence(S, W, cells) : sim.paintFloors(S, W, m.tool === 'erase' ? null : m.type, cells)
      if (!r.ok) return toast(reasonText(r), 'paint', 'warn')
      g.save()
      toast(m.tool === 'erase' ? `${r.count}칸을 지웠어요.` : m.tool === 'fence' ? `울타리 ${r.count}칸을 놓았어요.` : `${r.count}칸을 깔았어요.`, 'paint', 'good')
      setMode({ ...m, a: null, b: null })
    }
  }

  const doUpgrade = (id) => {
    const r = sim.upgrade(g.s, id)
    if (!r.ok) return toast(reasonText(r), 'up', 'warn')
    g.save()
    toast(`${BUILDINGS[r.building.type].name} Lv${r.building.level + 1} 공사를 시작했어요.`, 'up', 'good')
  }
  const doCrew = (id, n) => {
    sim.setCrew(g.s, g.world, id, n)
    g.save()
    rerender()
  }
  const askDemolish = (id) => {
    const p = sim.demolishPreview(g.s, id)
    if (p) pushModal({ kind: 'demolish', id, p })
  }
  const doDemolish = (id) => {
    const b = g.s.buildings.find((x) => x.id === id)
    const r = sim.demolish(g.s, g.world, id)
    closeModal()
    if (!r.ok) return toast(reasonText(r), 'demolish', 'warn')
    if (b) poof(b.x + 1.5, b.y + 1.5)
    g.save()
    setSel(null)
    const back = resText(r.refund)
    toast(`${r.kind === 'cancel' ? '공사를 취소했어요' : '철거했어요'}${back ? ` · ${back} 돌려받음` : ''}`, 'demolish', 'good')
  }
  const doCancelUpgrade = (id) => {
    const r = sim.cancelUpgrade(g.s, g.world, id)
    if (!r.ok) return toast(reasonText(r), 'cu', 'warn')
    g.save()
    toast(`업그레이드를 취소했어요 · ${resText(r.refund) || '돌려받을 자원 없음'}`, 'cu', 'good')
  }
  const doStow = (id) => {
    const d = g.s.decor.find((x) => x.id === id)
    const r = sim.stow(g.s, g.world, id)
    if (!r.ok) return toast(reasonText(r), 'stow', 'warn')
    if (d) poof(d.x + 0.5, d.y + 0.5)
    g.save()
    setSel(null)
    toast(`${josa(DECOR[r.type].name, '을', '를')} 보관함에 넣었어요. 언제든 무료로 다시 놓을 수 있어요.`, 'stow', 'good')
  }
  const doTurn = (id) => {
    const r = sim.turn(g.s, g.world, id)
    if (!r.ok) return toast(r.reason, 'turn', 'warn')
    g.save()
    rerender()
  }
  const doUnlock = (z) => {
    const r = sim.unlock(g.s, g.world, z)
    if (!r.ok) return toast(reasonText(r), 'zone', 'warn')
    g.save()
    const [x0, y0, x1, y1] = ZONES[z].rect
    g.R.lookAtTile((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2)
    setSel(null)
    setPanel(null)
    toast(`${ZONES[z].name} 구역이 열렸어요!`, 'zone', 'good')
  }

  const exportBackup = () => {
    g.save()
    download(exportText(g.s), exportName())
    toast('백업 파일을 내보냈어요.', 'export', 'good')
  }
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    let text = ''
    try {
      text = await file.text()
    } catch {
      return pushModal({ kind: 'importError', error: '파일을 읽지 못했어요.' })
    }
    const r = parse(text)
    if (!r.ok) {
      const why = r.kind === 'future' ? '더 새로운 버전의 게임에서 만든 백업이에요. 페이지를 새로고침한 뒤 다시 시도해 주세요.' : r.error
      return pushModal({ kind: 'importError', error: why })
    }
    pushModal({ kind: 'importConfirm', r })
  }
  const applyImport = (r) => {
    const data = r.data
    // an import restores the village as it was; time since the file was made does not count
    data.clock.simAt = Date.now()
    if (phase === 'play') {
      g.save()
      g.store.backupNow() // the progress being replaced stays in the backup slot
    } else if (info.raw) g.store.keepCorrupt(info.raw)
    data.notice.storage = true
    g.play(data, r.migrated ? ['백업을 불러왔어요.', ...r.notes] : ['백업을 불러왔어요.'], r.migrated ? '백업 불러오기' : '')
  }
  const doReset = () => {
    g.store.reset()
    const ns = newGame(Date.now(), newSeed())
    ns.notice.storage = true
    g.play(ns, ['새 마을을 시작했어요. 지형도 새로 만들어졌어요.'])
  }
  const takeOver = () => {
    setPhase('loading')
    g.claim(700)
  }

  const modal = modals[0]
  const modalView =
    modal &&
    (
      <Modal
        modal={modal}
        s={s}
        onClose={closeModal}
        onImport={applyImport}
        onReset={doReset}
        onExport={exportBackup}
        onPickFile={() => fileRef.current.click()}
        onDemolish={doDemolish}
        onNoticeOk={() => {
          g.s.notice.storage = true
          g.save()
          closeModal()
        }}
        onFresh={() => {
          g.store.keepCorrupt(info.raw)
          const ns = newGame(Date.now(), newSeed())
          g.play(ns, ['새 마을을 시작했어요. 손상된 데이터는 따로 보관해 두었어요.'])
        }}
      />
    )

  // ── screens before play ──
  if (phase !== 'play') {
    return (
      <div className="mc mc--screen">
        <div className="mc-screen">
          <h1 className="mc-screen__title">마노 마을</h1>
          {phase === 'loading' && <p className="mc-screen__text">마을을 불러오는 중…</p>}
          {phase === 'error' && (
            <>
              <p className="mc-screen__text">게임 이미지를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.</p>
              <p className="mc-screen__small">{info.error}</p>
            </>
          )}
          {phase === 'locked' && (
            <>
              <p className="mc-screen__text">다른 탭이나 창에서 마노 마을이 열려 있어요.</p>
              <p className="mc-screen__small">진행이 서로 덮어써지지 않도록 한 곳에서만 플레이할 수 있어요.</p>
              <button type="button" className="mc-btn mc-btn--primary" onClick={takeOver}>
                이 탭에서 계속하기
              </button>
            </>
          )}
          {phase === 'corrupt' && (
            <>
              <p className="mc-screen__text">저장 데이터를 읽을 수 없어요.</p>
              <p className="mc-screen__small">원인: {info.error}. 기존 데이터는 지우지 않았어요.</p>
              {info.raw && (
                <button type="button" className="mc-btn" onClick={() => download(info.raw, 'mano-colony-damaged.json')}>
                  손상된 데이터 내려받기
                </button>
              )}
              <button type="button" className="mc-btn" onClick={() => fileRef.current.click()}>
                백업 파일 불러오기
              </button>
              <button type="button" className="mc-btn mc-btn--danger" onClick={() => pushModal({ kind: 'freshFromCorrupt' })}>
                새 마을 시작하기
              </button>
            </>
          )}
          {phase === 'migrate' && (
            <>
              <p className="mc-screen__text">예전 저장 데이터를 새 지도로 옮기지 못했어요.</p>
              <p className="mc-screen__small">
                원인: {info.error}. 저장 데이터는 덮어쓰지 않고 그대로 두었어요. 다시 시작할 필요는 없어요. 데이터를 내려받아 두시면
                다음 업데이트에서 옮길 수 있어요.
              </p>
              <button type="button" className="mc-btn mc-btn--primary" onClick={() => download(info.raw, 'mano-colony-save-old.json')}>
                저장 데이터 내려받기
              </button>
              <button type="button" className="mc-btn" onClick={() => fileRef.current.click()}>
                백업 파일 불러오기
              </button>
            </>
          )}
          {phase === 'future' && (
            <>
              <p className="mc-screen__text">더 새로운 버전의 게임에서 저장된 데이터예요.</p>
              <p className="mc-screen__small">덮어쓰지 않고 그대로 두었어요. 페이지를 새로고침해서 최신 버전으로 열어 주세요.</p>
              <button type="button" className="mc-btn" onClick={() => download(info.raw, 'mano-colony-save.json')}>
                저장 데이터 내려받기
              </button>
            </>
          )}
          <a className="mc-btn mc-btn--ghost" href={exitHref}>
            사이트로 돌아가기
          </a>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        {modalView}
      </div>
    )
  }

  // ── playing ──
  const cap = caps(s)
  const pop = s.manos.length
  const room = homes(s)
  const tutorialOn = s.notice.storage && !s.tutorial.done && !panel && !mode && !sel && !modal

  const toggle = (name) => {
    setMode(null)
    setSel(null)
    setFolded(false)
    if (name === 'storage') setCat('storage')
    setPanel((cur) => (cur === name ? null : name))
  }

  return (
    <div className="mc">
      <header className="mc-top">
        <div className="mc-top__row">
          <a className="mc-exit" href={exitHref} aria-label="사이트로 돌아가기">
            ◀ 나가기
          </a>
          <h1 className="mc-title">마노 마을</h1>
          <button
            type="button"
            className={`mc-savechip ${saveState.ok ? '' : 'is-bad'}`}
            onClick={() => toggle('settings')}
            title={saveState.ok ? `저장됨 ${fmtClock(saveState.at)}` : SAVE_ERRORS[saveState.error]}
          >
            {saveState.ok ? '저장됨' : '저장 불가'}
          </button>
        </div>
        <div className="mc-res">
          {RESOURCES.map((r) => {
            const over = s.res[r] > cap[r]
            return (
              <span
                key={r}
                className={`mc-chip ${s.res[r] >= cap[r] ? 'is-full' : ''} ${over ? 'is-over' : ''}`}
                title={over ? `${RES_LABEL[r]}: 보관 한도를 넘었어요. 넘친 만큼은 그대로 있고, 한도 아래로 내려갈 때까지 새로 모으지 않아요.` : RES_LABEL[r]}
              >
                <img src={ICONS[r]} alt={RES_LABEL[r]} />
                <b>{Math.floor(s.res[r])}</b>
                <small>/{cap[r]}</small>
              </span>
            )
          })}
          <span className={`mc-chip ${pop >= room ? 'is-full' : ''} ${pop > room ? 'is-over' : ''}`} title="주민 / 집">
            <img src={ICONS.mano} alt="주민" />
            <b>{pop}</b>
            <small>/{room}</small>
          </span>
        </div>
      </header>

      <div className={`mc-stage ${mode ? 'is-editing' : ''}`} ref={stageRef}>
        <canvas ref={canvasRef} className="mc-canvas" aria-label="마노 마을 지도" />

        <div className="mc-zoom">
          <button type="button" className="mc-round" onClick={() => g.R.zoomAt(1.25)} aria-label="확대">
            +
          </button>
          <button type="button" className="mc-round" onClick={() => g.R.zoomAt(0.8)} aria-label="축소">
            −
          </button>
          <button type="button" className="mc-round mc-round--home" onClick={() => g.lookHome()} aria-label="마을 중심으로">
            ⌂
          </button>
        </div>

        <div className="mc-toasts" aria-live="polite">
          {toasts.map((t) => (
            <p key={t.id} className={`mc-toast ${t.kind ? 'mc-toast--' + t.kind : ''}`}>
              {t.text}
            </p>
          ))}
        </div>

        {tutorialOn && (
          <div className="mc-tutorial">
            <p>{TUTORIAL[s.tutorial.step] || TUTORIAL[0]}</p>
            <div className="mc-row">
              <span className="mc-tutorial__n">
                {Math.min(s.tutorial.step + 1, TUTORIAL.length)} / {TUTORIAL.length}
              </span>
              <button
                type="button"
                className="mc-btn mc-btn--small mc-btn--primary"
                onClick={() => {
                  if (s.tutorial.step >= TUTORIAL.length - 1) s.tutorial.done = true
                  else s.tutorial.step++
                  g.save()
                  rerender()
                }}
              >
                {s.tutorial.step >= TUTORIAL.length - 1 ? '알겠어요' : '다음'}
              </button>
              <button
                type="button"
                className="mc-btn mc-btn--small mc-btn--ghost"
                onClick={() => {
                  s.tutorial.done = true
                  g.save()
                  rerender()
                }}
              >
                건너뛰기
              </button>
            </div>
          </div>
        )}

        {mode && (
          <ModeBar
            g={g}
            s={s}
            mode={mode}
            setMode={setMode}
            onCancel={() => {
              const m = mode
              setMode(null)
              if (m.kind === 'move') setSel({ id: m.id, kind: m.obj })
            }}
            onConfirm={confirmMode}
          />
        )}

        {!mode && sel && (
          <SelCard
            g={g}
            s={s}
            sel={sel}
            onClose={() => setSel(null)}
            onUpgrade={doUpgrade}
            onMove={startMove}
            onDemolish={askDemolish}
            onCancelUpgrade={doCancelUpgrade}
            onCrew={doCrew}
            onStow={doStow}
            onTurn={doTurn}
            onUnlock={doUnlock}
          />
        )}

        {!mode && panel && (
          <Panel title={panel === 'build' ? '건설·꾸미기' : panel === 'storage' ? '보관함' : panel === 'mano' ? '마노' : '설정'} folded={folded} onFold={() => setFolded((f) => !f)} onClose={() => setPanel(null)}>
            {(panel === 'build' || panel === 'storage') && <Catalog g={g} s={s} cat={panel === 'storage' ? 'storage' : cat} setCat={setCat} onlyStorage={panel === 'storage'} onPick={startPlace} onUnlock={doUnlock} />}
            {panel === 'mano' && <ManoList g={g} s={s} onPick={(m) => g.R.lookAtTile(m.x, m.y)} />}
            {panel === 'settings' && (
              <Settings
                s={s}
                saveState={saveState}
                onSave={() => {
                  g.save()
                  toast('저장했어요.', 'saved')
                }}
                onExport={exportBackup}
                onImport={() => fileRef.current.click()}
                onReset={() => pushModal({ kind: 'reset' })}
                onNotice={() => pushModal({ kind: 'notice' })}
                onEffects={() => {
                  s.settings.effects = !s.settings.effects
                  g.save()
                  rerender()
                }}
                exitHref={exitHref}
              />
            )}
          </Panel>
        )}
      </div>

      <nav className="mc-bar" aria-label="게임 메뉴">
        {[
          ['build', '건설', ICONS.build],
          ['storage', '보관함', ICONS.storage],
          ['mano', '마노', ICONS.mano],
          ['settings', '설정', ICONS.settings],
        ].map(([id, label, icon]) => (
          <button key={id} type="button" className={`mc-bar__btn ${panel === id ? 'is-on' : ''}`} onClick={() => toggle(id)} aria-pressed={panel === id}>
            <img src={icon} alt="" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      {modalView}
    </div>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Panel({ title, folded, onFold, onClose, children }) {
  return (
    <section className={`mc-sheet ${folded ? 'is-folded' : ''}`} role="dialog" aria-label={title}>
      <header className="mc-sheet__head">
        <h2 className="mc-sheet__title">{title}</h2>
        <button type="button" className="mc-iconbtn" onClick={onFold} aria-label={folded ? '펼치기' : '접기'} aria-expanded={!folded}>
          {folded ? '▲' : '▼'}
        </button>
        <button type="button" className="mc-iconbtn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </header>
      {!folded && <div className="mc-sheet__body">{children}</div>}
    </section>
  )
}

// catalog entries for one category
function itemsOf(s, cat) {
  if (cat === 'build') return BUILDING_TYPES.map((type) => ({ kind: 'building', type }))
  if (cat === 'floor') return [...FLOOR_TYPES.map((type) => ({ kind: 'floor', type })), { kind: 'erase' }]
  if (cat === 'storage') {
    const out = []
    s.stored.forEach((b, i) => out.push({ kind: 'building', type: b.type, level: b.level, stored: i }))
    for (const type of DECOR_TYPES) if (s.inventory[type] > 0) out.push({ kind: type === 'fence' ? 'fence' : 'decor', type, count: s.inventory[type] })
    return out
  }
  return DECOR_TYPES.filter((t) => DECOR[t].cat === cat).map((type) => ({ kind: type === 'fence' ? 'fence' : 'decor', type }))
}

function itemName(it) {
  if (it.kind === 'building') return BUILDINGS[it.type].name + (it.level ? ` Lv${it.level}` : '')
  if (it.kind === 'floor') return FLOORS[it.type].name
  if (it.kind === 'erase') return '길 지우기'
  return DECOR[it.type].name
}

function itemText(it) {
  if (it.kind === 'building') return it.stored != null ? '보관 중인 건물이에요. 무료로 다시 놓아요.' : effectText(it.type, 1)
  if (it.kind === 'floor') return '끌어서 한 줄로 깔아요. 같은 길을 다시 칠하면 무료예요.'
  if (it.kind === 'erase') return '깔아 둔 길을 지워요. 낸 비용은 돌려받아요.'
  const def = DECOR[it.type]
  if (it.kind === 'fence') return '끌어서 이어 놓아요. 마노는 지나갈 수 없어요.'
  if (def.gate) return '울타리 위에 놓으면 문이 돼요. 마노가 지나갈 수 있어요.'
  if (def.bridge) return '물을 건너는 다리예요.'
  if (def.waterOnly) return '물 위에만 놓을 수 있어요.'
  if (def.seats) return '쉬는 마노가 앉아요.'
  return def.blocks ? '' : '마노가 밟고 지나갈 수 있어요.'
}

function Catalog({ g, s, cat, setCat, onlyStorage, onPick, onUnlock }) {
  const items = itemsOf(s, cat)
  return (
    <>
      {!onlyStorage && (
        <div className="mc-chips" role="tablist">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={`mc-catchip ${cat === c.id ? 'is-on' : ''}`} onClick={() => setCat(c.id)}>
              <img src={ICONS[c.icon]} alt="" />
              {c.name}
            </button>
          ))}
        </div>
      )}
      {cat === 'storage' && !items.length && <p className="mc-card__text mc-pad">보관함이 비어 있어요. 장식을 눌러 [보관함에 넣기]를 하면 여기에 모여요.</p>}
      <ul className="mc-items">
        {items.map((it, i) => {
          const th = thumbOf(it)
          const def = it.kind === 'building' ? BUILDINGS[it.type] : it.kind === 'floor' ? FLOORS[it.type] : it.kind === 'erase' ? null : DECOR[it.type]
          const box = it.kind === 'decor' || it.kind === 'fence' ? sim.owned(s, it.type) : 0
          const cost = it.kind === 'building' ? def.levels[0].cost : def ? def.cost : {}
          const free = it.stored != null || box > 0
          const miss = sim.lacking(s, cost)
          const why = !free && Object.keys(miss).length ? reasonText({ ok: false, missing: miss }) : ''
          return (
            <li key={it.kind + it.type + i} className="mc-item">
              <button type="button" className="mc-item__btn" onClick={() => onPick(it)}>
                <Thumb A={g.A} {...th} />
                <span className="mc-item__body">
                  <span className="mc-item__name">
                    {itemName(it)}
                    {box > 0 && <em className="mc-badge">보관 {box}</em>}
                  </span>
                  <span className="mc-item__text">{itemText(it)}</span>
                  {it.kind !== 'erase' && <Cost cost={cost} s={s} free={free} />}
                  {why && <span className="mc-why">{why}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {cat === 'build' && (
        <>
          <h3 className="mc-sheet__sub">구역 확장</h3>
          <ul className="mc-list">
            {ZONE_IDS.filter((z) => ZONES[z].cost && !s.zones[z]).map((z) => (
              <ZoneRow key={z} s={s} z={z} onUnlock={onUnlock} />
            ))}
            {ZONE_IDS.every((z) => s.zones[z]) && <li className="mc-card__text">모든 구역이 열렸어요.</li>}
          </ul>
        </>
      )}
    </>
  )
}

function ZoneRow({ s, z, onUnlock }) {
  const zone = ZONES[z]
  const r = canUnlock(s, z)
  return (
    <li className="mc-card">
      <div className="mc-card__body">
        <p className="mc-card__name">{zone.name}</p>
        <Cost cost={zone.cost} s={s} />
        {!r.ok && <p className="mc-why">{reasonText(r)}</p>}
      </div>
      <button type="button" className="mc-btn mc-btn--small mc-btn--primary" disabled={!r.ok} onClick={() => onUnlock(z)}>
        확장하기
      </button>
    </li>
  )
}

function ModeBar({ g, s, mode, setMode, onCancel, onConfirm }) {
  const p = evalMode(g, mode)
  if (mode.kind === 'paint') {
    const name = mode.tool === 'fence' ? DECOR.fence.name : mode.tool === 'erase' ? '길 지우기' : FLOORS[mode.type].name
    const plan = p.plan
    let line = '시작할 칸을 누르거나, 한 손가락으로 끌어서 그려요.'
    if (plan) {
      const back = resText(plan.refund || {})
      const cost = resText(plan.cost || {})
      if (mode.tool === 'fence') line = `${plan.count}칸 · ${plan.fromBox ? `보관함 ${plan.fromBox}개 + ` : ''}${cost || '무료'}`
      else if (mode.tool === 'erase') line = `${plan.count}칸 지우기${back ? ` · ${back} 돌려받음` : ''}`
      else line = `${plan.count}칸 · ${cost || '무료'}${back ? ` · ${back} 돌려받음` : ''}`
      if (!mode.b) line += ' · 끝 칸을 누르세요'
    }
    const why = plan && !plan.ok ? reasonText(plan) : p.tooLong ? `한 번에 ${MAX_LINE}칸까지 그릴 수 있어요.` : ''
    return (
      <div className="mc-mode">
        <p className="mc-mode__head">
          <b>{name}</b>
          <span>{line}</span>
        </p>
        {why && <p className="mc-why">{why}</p>}
        <div className="mc-row mc-row--wrap">
          <div className="mc-seg" role="group" aria-label="손가락 동작">
            <button type="button" className={!mode.pan ? 'is-on' : ''} onClick={() => setMode({ ...mode, pan: false })} aria-pressed={!mode.pan}>
              ✏ 그리기
            </button>
            <button type="button" className={mode.pan ? 'is-on' : ''} onClick={() => setMode({ ...mode, pan: true })} aria-pressed={mode.pan}>
              ✋ 지도 이동
            </button>
          </div>
          {mode.tool !== 'fence' && (
            <div className="mc-seg" role="group" aria-label="모양">
              <button type="button" className={mode.shape === 'line' ? 'is-on' : ''} onClick={() => setMode({ ...mode, shape: 'line' })}>
                선
              </button>
              <button type="button" className={mode.shape === 'rect' ? 'is-on' : ''} onClick={() => setMode({ ...mode, shape: 'rect' })}>
                네모
              </button>
            </div>
          )}
        </div>
        <div className="mc-row">
          <button type="button" className="mc-btn mc-btn--small mc-btn--ghost" onClick={onCancel}>
            끝내기
          </button>
          <button type="button" className="mc-btn mc-btn--small" disabled={!mode.a} onClick={() => setMode({ ...mode, a: null, b: null })}>
            다시 그리기
          </button>
          <button type="button" className="mc-btn mc-btn--small mc-btn--primary" disabled={!plan || !plan.ok} onClick={onConfirm}>
            확정
          </button>
        </div>
      </div>
    )
  }
  const c = p.check || {}
  const def = mode.obj === 'building' ? BUILDINGS[mode.type] : DECOR[mode.type]
  const dirs = mode.obj === 'decor' && DECOR[mode.type].dirs
  let costLine = null
  if (mode.kind === 'move') costLine = <span className="mc-costs mc-free">옮기기 · 무료</span>
  else if (mode.obj === 'building') costLine = <Cost cost={def.levels[0].cost} s={s} free={mode.stored != null} />
  else costLine = <Cost cost={def.cost} s={s} free={sim.owned(s, mode.type) > 0} />
  return (
    <div className="mc-mode">
      <p className="mc-mode__head">
        <b>
          {mode.kind === 'move' ? '옮기기: ' : ''}
          {def.name}
        </b>
        {costLine}
      </p>
      <p className={c.ok ? 'mc-okline' : 'mc-why'}>{c.ok ? '여기에 놓을 수 있어요. 지도를 누르거나 끌어서 위치를 바꿔요.' : reasonText(c)}</p>
      <div className="mc-row">
        <button type="button" className="mc-btn mc-btn--small mc-btn--ghost" onClick={onCancel}>
          취소
        </button>
        {dirs && (
          <button type="button" className="mc-btn mc-btn--small" onClick={() => setMode({ ...mode, dir: ((mode.dir || 0) + 1) % dirs.length })}>
            방향 바꾸기
          </button>
        )}
        <button type="button" className="mc-btn mc-btn--small mc-btn--primary" disabled={!c.ok} onClick={onConfirm}>
          {mode.kind === 'move' ? '여기로 옮기기' : '확정'}
        </button>
      </div>
    </div>
  )
}

function SelCard({ g, s, sel, onClose, onUpgrade, onMove, onDemolish, onCancelUpgrade, onCrew, onStow, onTurn, onUnlock }) {
  let body = null
  if (sel.zone) {
    body = (
      <>
        <p className="mc-sel__title">잠긴 구역</p>
        <ul className="mc-list">
          <ZoneRow s={s} z={sel.zone} onUnlock={onUnlock} />
        </ul>
      </>
    )
  } else if (sel.kind === 'building') {
    const b = s.buildings.find((x) => x.id === sel.id)
    if (!b) return null
    const def = BUILDINGS[b.type]
    const up = canUpgrade(s, b.id)
    const moveOk = !b.build
    body = (
      <>
        <p className="mc-sel__title">
          {def.name} <span className="mc-lv">{b.level ? `Lv${b.level}` : '공사장'}</span>
        </p>
        <p className="mc-card__text">{b.level ? `지금: ${effectText(b.type, b.level)}` : def.about}</p>
        {b.build && <Site g={g} s={s} b={b} onCrew={onCrew} />}
        {!b.build && b.level < 3 && (
          <div className="mc-upline">
            <span className="mc-card__text">
              다음 Lv{b.level + 1}: {effectText(b.type, b.level + 1)}
            </span>
            <Cost cost={def.levels[b.level].cost} s={s} />
            {!up.ok && <span className="mc-why">{reasonText(up)}</span>}
          </div>
        )}
        {!b.build && b.level >= 3 && <p className="mc-card__text mc-dim">최고 레벨이에요.</p>}
        {!moveOk && <p className="mc-dim mc-small">{b.level === 0 ? '공사 중인 건물은 옮길 수 없어요. 완성된 뒤에 옮겨 주세요.' : '업그레이드 중에는 옮길 수 없어요.'}</p>}
        <div className="mc-actions">
          {!b.build && b.level < 3 && (
            <button type="button" className="mc-act mc-act--primary" disabled={!up.ok} onClick={() => onUpgrade(b.id)}>
              <img src={ICONS.upgrade} alt="" />
              업그레이드
            </button>
          )}
          {b.build && b.level > 0 && (
            <button type="button" className="mc-act" onClick={() => onCancelUpgrade(b.id)}>
              <img src={ICONS.upgrade} alt="" />
              업그레이드 취소
            </button>
          )}
          <button type="button" className="mc-act" disabled={!moveOk} onClick={() => onMove(b.id)}>
            <img src={ICONS.move} alt="" />
            옮기기
          </button>
          <button type="button" className="mc-act mc-act--danger" onClick={() => onDemolish(b.id)}>
            <img src={ICONS.demolish} alt="" />
            {b.level === 0 ? '공사 취소' : '철거'}
          </button>
        </div>
      </>
    )
  } else if (sel.kind === 'decor') {
    const d = s.decor.find((x) => x.id === sel.id)
    if (!d) return null
    const def = DECOR[d.type]
    body = (
      <>
        <p className="mc-sel__title">{def.name}</p>
        <p className="mc-card__text">{itemText({ kind: d.type === 'fence' ? 'fence' : 'decor', type: d.type }) || '마을을 꾸며 주는 장식이에요.'}</p>
        <div className="mc-actions">
          <button type="button" className="mc-act" onClick={() => onMove(d.id)}>
            <img src={ICONS.move} alt="" />
            옮기기
          </button>
          {def.dirs && (
            <button type="button" className="mc-act" onClick={() => onTurn(d.id)}>
              ↻ 방향 바꾸기
            </button>
          )}
          <button type="button" className="mc-act" onClick={() => onStow(d.id)}>
            <img src={ICONS.storage} alt="" />
            보관함에 넣기
          </button>
        </div>
      </>
    )
  } else if (sel.kind === 'node') {
    const n = g.world.gen.nodes[+sel.id.slice(1)]
    if (!n) return null
    const k = NODES[n.kind]
    const left = Math.floor(s.nodes[n.id] ?? k.max)
    body = (
      <>
        <p className="mc-sel__title">{{ tree: '나무', rock: '바위', crystal: '별빛 수정' }[n.kind]}</p>
        <p className="mc-card__text">
          남은 {RES_LABEL[k.res]} {left} / {k.max} · 마노들이 알아서 모으고, 시간이 지나면 다시 자라요.
        </p>
      </>
    )
  } else if (sel.kind === 'camp') {
    body = (
      <>
        <p className="mc-sel__title">공용 상자</p>
        <p className="mc-card__text">마을의 시작점이에요. 마노들이 모든 자원을 여기에 내려놓아요.</p>
      </>
    )
  }
  return (
    <section className="mc-sel" aria-label="선택한 것">
      <button type="button" className="mc-iconbtn mc-sel__close" onClick={onClose} aria-label="닫기">
        ✕
      </button>
      {body}
    </section>
  )
}

// a building site: crew, progress, time left
function Site({ g, s, b, onCrew }) {
  const work = buildWork(b)
  const f = Math.min(1, b.build.progress / work)
  const most = maxCrew(s, g.world, b)
  const active = b.build.active || 0
  const eta = siteEta(b)
  return (
    <div className="mc-site">
      <div className="mc-progress" aria-label="공사 진행">
        <span style={{ width: `${f * 100}%` }} />
        <em>
          {b.level === 0 ? '건설' : `Lv${b.build.to} 공사`} {Math.floor(f * 100)}%
        </em>
      </div>
      <div className="mc-crew">
        <button type="button" className="mc-round mc-round--small" onClick={() => onCrew(b.id, b.build.crew - 1)} disabled={b.build.crew <= 0} aria-label="일꾼 줄이기">
          −
        </button>
        <span className="mc-crew__n">
          배정 {b.build.crew} / 작업 중 {active}
        </span>
        <button type="button" className="mc-round mc-round--small" onClick={() => onCrew(b.id, b.build.crew + 1)} disabled={b.build.crew >= most} aria-label="일꾼 늘리기">
          +
        </button>
      </div>
      <p className="mc-small mc-dim">
        {eta !== null ? `남은 시간 약 ${fmtDuration(eta)} (일하는 마노 ${active}명 기준)` : b.build.crew ? '마노가 공사장으로 가는 중이에요.' : '배정된 마노가 없어서 멈춰 있어요.'}
        {' · '}최대 {most}명 (자리 {BUILDINGS[b.type].levels[b.build.to - 1].slots}곳, 주민 {s.manos.length}명)
      </p>
    </div>
  )
}

function ManoList({ g, s, onPick }) {
  const room = homes(s)
  const pop = s.manos.length
  return (
    <>
      <p className="mc-card__text mc-pad">
        {pop > room
          ? '집보다 주민이 많아요. 아무도 떠나지 않지만, 집이 늘 때까지 새 마노는 오지 않아요.'
          : pop < room
            ? `빈집이 있어요. 새 마노가 ${Math.max(1, Math.ceil(MANO.arriveEvery - s.arrivalT))}초 뒤에 이사 와요.`
            : '빈집이 없어요. 마노 집을 짓거나 업그레이드하면 새 마노가 와요.'}
      </p>
      <ul className="mc-list mc-list--plain">
        {s.manos.map((m) => (
          <li key={m.id}>
            <button type="button" className="mc-mano" onClick={() => onPick(m)}>
              <b>마노 #{m.id}</b>
              <span>{activity(s, g.world, m)}</span>
              {m.carry && (
                <span className="mc-carry">
                  <img src={ICONS[m.carry.res]} alt="" />
                  {m.carry.n}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Settings({ s, saveState, onSave, onExport, onImport, onReset, onNotice, onEffects, exitHref }) {
  return (
    <>
      <div className={`mc-savebox ${saveState.ok ? '' : 'is-bad'}`}>
        <img src={ICONS.save} alt="" />
        <div>
          <p className="mc-card__name">{saveState.ok ? `자동 저장됨 · ${fmtClock(saveState.at)}` : '저장 불가'}</p>
          <p className="mc-card__text">
            {saveState.ok
              ? '10초마다, 그리고 짓기·옮기기·철거·꾸미기 직후에 저장해요.'
              : `${SAVE_ERRORS[saveState.error] || '저장하지 못했어요.'} 진행을 잃지 않도록 백업 파일을 내보내 두세요.`}
          </p>
        </div>
      </div>
      <div className="mc-notice">
        <p>{STORAGE_NOTICE}</p>
        <div className="mc-grid">
          <button type="button" className="mc-btn mc-btn--primary" onClick={onExport}>
            백업 내보내기
          </button>
          <button type="button" className="mc-btn" onClick={onImport}>
            백업 불러오기
          </button>
        </div>
      </div>
      <div className="mc-grid">
        <button type="button" className="mc-btn" onClick={onSave}>
          지금 저장
        </button>
        <button type="button" className="mc-btn" onClick={onEffects} aria-pressed={s.settings.effects}>
          효과 {s.settings.effects ? '켜짐' : '꺼짐'}
        </button>
        <button type="button" className="mc-btn" onClick={onNotice}>
          저장 안내 다시 보기
        </button>
      </div>
      <p className="mc-note mc-dim">
        <img className="mc-inline" src={ICONS.clock} alt="" /> 게임을 닫아 둔 동안에도 일하던 마노들이 조금씩 자원을 모아요 (최대 {OFFLINE.maxSeconds / 3600}시간). 공사는 그때
        망치질하던 마노만큼만 진행돼요.
      </p>
      <div className="mc-grid">
        <a className="mc-btn mc-btn--ghost" href={exitHref}>
          사이트로 돌아가기
        </a>
        <button type="button" className="mc-btn mc-btn--danger" onClick={onReset}>
          처음부터 다시 하기
        </button>
      </div>
    </>
  )
}

function Modal({ modal, s, onClose, onImport, onReset, onExport, onPickFile, onDemolish, onNoticeOk, onFresh }) {
  let body = null
  if (modal.kind === 'notice') {
    body = (
      <>
        <h2 className="mc-modal__title">저장 안내</h2>
        <p className="mc-card__text mc-notice__text">{STORAGE_NOTICE}</p>
        <div className="mc-grid">
          <button type="button" className="mc-btn" onClick={onExport}>
            백업 내보내기
          </button>
          <button type="button" className="mc-btn" onClick={onPickFile}>
            백업 불러오기
          </button>
        </div>
        <button type="button" className="mc-btn mc-btn--primary" onClick={modal.first ? onNoticeOk : onClose}>
          확인했어요
        </button>
      </>
    )
  } else if (modal.kind === 'notes') {
    body = (
      <>
        <h2 className="mc-modal__title">{modal.title}</h2>
        <ul className="mc-notes">
          {modal.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        <button type="button" className="mc-btn mc-btn--primary" onClick={onClose}>
          확인
        </button>
      </>
    )
  } else if (modal.kind === 'offline') {
    const { rep, capped, full } = modal
    body = (
      <>
        <h2 className="mc-modal__title">다녀오셨어요!</h2>
        <p className="mc-card__text">
          {hasNews(rep)
            ? `자리를 비운 ${fmtDuration(rep.seconds)} 동안 마노들이 일했어요.`
            : full
              ? `자리를 비운 ${fmtDuration(rep.seconds)} 동안 보관 한도가 가득 차 있어서 더 모으지 못했어요. 저장소를 짓거나 올려 보세요.`
              : `자리를 비운 ${fmtDuration(rep.seconds)} 동안 모은 자원이 없어요. (그때 일하던 마노가 없었어요)`}
        </p>
        <ul className="mc-list mc-list--plain">
          {RESOURCES.filter((r) => rep.gains[r] > 0).map((r) => (
            <li key={r} className="mc-gain">
              <img src={ICONS[r]} alt="" /> {RES_LABEL[r]} +{rep.gains[r]}
            </li>
          ))}
          {rep.built.map((b, i) => (
            <li key={'b' + i} className="mc-gain">
              <img src={ICONS.build} alt="" /> {BUILDINGS[b.type].name} Lv{b.level} 완성
            </li>
          ))}
          {rep.progressed > 0 && !rep.built.length && (
            <li className="mc-gain">
              <img src={ICONS.build} alt="" /> 공사 진행 +{Math.floor(rep.progressed)}
            </li>
          )}
        </ul>
        <p className="mc-note mc-dim">
          {capped ? '8시간이 넘게 지나서 최대 8시간까지만 계산했어요. ' : ''}그때 일하던 마노 기준으로, 조금 보수적으로 계산해요. 보관 한도를 넘는 양은 받지 않고, 새 공사나 이사는
          시작되지 않아요.
        </p>
        <button type="button" className="mc-btn mc-btn--primary" onClick={onClose}>
          확인
        </button>
      </>
    )
  } else if (modal.kind === 'demolish') {
    const { p, id } = modal
    const cancel = p.kind === 'cancel'
    const b = s.buildings.find((x) => x.id === id)
    const name = b ? BUILDINGS[b.type].name : '건물'
    const capLost = RESOURCES.filter((r) => p.after.cap[r] < p.before.cap[r])
    const overAfter = RESOURCES.filter((r) => p.res[r] + (p.refund[r] || 0) > p.after.cap[r])
    body = (
      <>
        <h2 className="mc-modal__title">{cancel ? `${name} 공사를 취소할까요?` : `${josa(name, '을', '를')} 철거할까요?`}</h2>
        <p className="mc-card__text">
          돌려받는 자원: <b>{resText(p.refund) || '없음'}</b>
          {cancel ? ' (낸 비용 전부)' : b && b.build ? ' (쓴 비용의 절반 + 진행 중인 업그레이드 비용 전부)' : ' (쓴 비용의 절반)'}
        </p>
        {p.after.homes !== p.before.homes && (
          <p className="mc-card__text">
            집: {p.before.homes}명 → {p.after.homes}명
            {p.pop > p.after.homes ? ' · 주민은 아무도 떠나지 않아요. 집이 늘 때까지 새 마노만 오지 않아요.' : ''}
          </p>
        )}
        {capLost.length > 0 && (
          <p className="mc-card__text">
            보관 한도: {capLost.map((r) => `${RES_LABEL[r]} ${p.before.cap[r]} → ${p.after.cap[r]}`).join(', ')}
          </p>
        )}
        {overAfter.length > 0 && (
          <p className="mc-note">
            {josa(overAfter.map((r) => RES_LABEL[r]).join('·'), '이', '가')} 한도를 넘게 돼요. 넘친 자원은 사라지지 않고, 한도 아래로 내려갈 때까지 그 자원만 잠시 모으지 않아요.
          </p>
        )}
        <div className="mc-row">
          <button type="button" className="mc-btn mc-btn--ghost" onClick={onClose}>
            그만두기
          </button>
          <button type="button" className="mc-btn mc-btn--danger" onClick={() => onDemolish(id)}>
            {cancel ? '공사 취소' : '철거하기'}
          </button>
        </div>
      </>
    )
  } else if (modal.kind === 'importConfirm') {
    const d = modal.r.data
    body = (
      <>
        <h2 className="mc-modal__title">이 백업으로 바꿀까요?</h2>
        <p className="mc-card__text">
          {modal.r.savedAt ? `${new Date(modal.r.savedAt).toLocaleString('ko-KR')}에 만든 백업 · ` : ''}건물 {d.buildings.length}채 · 주민 {d.manos.length}명
        </p>
        <p className="mc-card__text">{RESOURCES.map((r) => `${RES_LABEL[r]} ${Math.floor(d.res[r])}`).join(' · ')}</p>
        <p className="mc-note">지금 진행은 이 백업으로 바뀌어요. 바꾸기 전 진행은 백업 칸에 한 번 보관해요.</p>
        <div className="mc-row">
          <button type="button" className="mc-btn mc-btn--ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="mc-btn mc-btn--primary" onClick={() => onImport(modal.r)}>
            불러오기
          </button>
        </div>
      </>
    )
  } else if (modal.kind === 'importError') {
    body = (
      <>
        <h2 className="mc-modal__title">불러오지 못했어요</h2>
        <p className="mc-card__text">{modal.error}</p>
        <p className="mc-note">지금 진행은 그대로예요.</p>
        <button type="button" className="mc-btn mc-btn--primary" onClick={onClose}>
          확인
        </button>
      </>
    )
  } else if (modal.kind === 'reset') {
    body = (
      <>
        <h2 className="mc-modal__title">처음부터 다시 할까요?</h2>
        <p className="mc-card__text">이 마을의 저장 데이터(현재 저장본과 백업)가 지워지고 새 마을이 시작돼요. 사이트의 다른 데이터는 그대로예요.</p>
        <p className="mc-note">지우기 전에 백업 파일을 내보내 둘 수 있어요.</p>
        <div className="mc-grid">
          <button type="button" className="mc-btn" onClick={onExport}>
            백업 먼저 내보내기
          </button>
          <button type="button" className="mc-btn mc-btn--ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="mc-btn mc-btn--danger" onClick={onReset}>
            지우고 새로 시작
          </button>
        </div>
      </>
    )
  } else if (modal.kind === 'freshFromCorrupt') {
    body = (
      <>
        <h2 className="mc-modal__title">새 마을을 시작할까요?</h2>
        <p className="mc-card__text">읽을 수 없는 데이터는 지우지 않고 따로 보관해 둔 뒤 새로 시작해요.</p>
        <div className="mc-row">
          <button type="button" className="mc-btn mc-btn--ghost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="mc-btn mc-btn--danger" onClick={onFresh}>
            새로 시작
          </button>
        </div>
      </>
    )
  }
  return (
    <div className="mc-modal" role="dialog" aria-modal="true">
      <div className="mc-modal__box">{body}</div>
    </div>
  )
}
