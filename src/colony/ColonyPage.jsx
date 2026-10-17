import { useEffect, useRef, useState } from 'react'
import {
  BUILDINGS,
  BUILDING_TYPES,
  LOTS,
  MANO,
  OFFLINE,
  RESOURCES,
  RES_LABEL,
  SAVE,
  START,
  TILE,
  TUTORIAL,
  ZONES,
  ZONE_IDS,
} from './config.js'
import { createWorld, refresh, zoneOfRow } from './world.js'
import {
  activity,
  buildWork,
  canPlace,
  canUnlock,
  canUpgrade,
  caps,
  homes,
  lotFree,
  lotOpen,
  newGame,
  place,
  tick,
  unlock,
  upgrade,
} from './sim.js'
import { applyOffline, elapsed, hasNews } from './offline.js'
import { browserStorage, createStore, exportName, exportText, KEYS, parse } from './save.js'
import { createRenderer } from './render.js'
import { ICONS, loadAssets } from './assets.js'
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

function effectText(type, level) {
  const l = BUILDINGS[type].levels[level - 1]
  if (type === 'house') return `주민 ${l.homes}명이 살 수 있어요`
  if (type === 'storage') return `보관 한도 나무·돌 +${l.cap.wood}, 별가루 +${l.cap.stardust}`
  const what = type === 'lumber' ? '나무' : '돌'
  return `${what} 채집 ${Math.round((l.speed - 1) * 100)}% 빠르게, 한 번에 ${l.carry}개 더`
}

// why an action cannot happen right now, in one short line
function reasonText(r) {
  if (r.ok) return ''
  if (r.over) return `보관 한도가 부족해요 (${Object.entries(r.over).map(([k, v]) => `${RES_LABEL[k]} 최대 ${v}`).join(', ')})`
  if (r.missing) return Object.entries(r.missing).map(([k, v]) => `${RES_LABEL[k]} ${v}`).join(', ') + ' 부족'
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

function Cost({ cost, s }) {
  const c = caps(s)
  return (
    <span className="mc-costs">
      {RESOURCES.filter((r) => cost[r]).map((r) => (
        <span key={r} className={`mc-cost ${s.res[r] < cost[r] ? 'is-lack' : ''} ${c[r] < cost[r] ? 'is-over' : ''}`}>
          <img src={ICONS[r]} alt={RES_LABEL[r]} />
          {cost[r]}
        </span>
      ))}
    </span>
  )
}

// ── the page ─────────────────────────────────────────────────────────────────

export default function ColonyPage({ exitHref = '#/' }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const fileRef = useRef(null)
  const G = useRef(null) // the running game: state, world, store, renderer…
  const ui = useRef({ placing: null, selected: null })
  const [phase, setPhase] = useState('loading') // loading | locked | corrupt | future | error | play
  const [info, setInfo] = useState({})
  const [, setBeat] = useState(0)
  const [sheet, setSheet] = useState(null)
  const [placing, setPlacing] = useState(null)
  const [modal, setModal] = useState(null)
  const [toasts, setToasts] = useState([])
  const [saveState, setSaveState] = useState({ ok: true, at: 0 })

  ui.current.placing = placing
  ui.current.selected = sheet && sheet.building ? sheet.building : null

  const toast = (text, key = text, kind = '') => {
    const id = Math.random()
    setToasts((t) => [...t.filter((x) => x.key !== key), { id, key, text, kind }].slice(-3))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }

  // ── boot: images, one-tab lock, save ──
  useEffect(() => {
    let cancelled = false
    const store = createStore(browserStorage())
    const g = {
      store,
      tabId: Math.random().toString(36).slice(2) + Date.now().toString(36),
      active: false,
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

    g.play = (s, notes = []) => {
      const now = Date.now()
      s.cap = caps(s)
      g.s = s
      g.world = createWorld()
      refresh(g.world, s)
      // time away: one calculation, saved right away together with its time
      const el = elapsed(s.clock.simAt, now)
      if (el.seconds > 0) {
        const rep = applyOffline(s, g.world, el.seconds)
        if (el.seconds >= OFFLINE.minNotice) setModal({ kind: 'offline', rep, capped: el.capped, full: !hasNews(rep) && RESOURCES.every((r) => s.res[r] >= caps(s)[r] - 1) })
      }
      s.clock.simAt = now
      g.active = true
      g.wasFull = s.manos.length >= homes(s)
      setSheet(null)
      setPlacing(null)
      setPhase('play')
      if (store.available) g.save()
      else setSaveState({ ok: false, error: 'unavailable' })
      for (const n of notes) toast(n, n, 'info')
    }

    g.fromStorage = () => {
      if (cancelled) return
      const r = store.load()
      const notes = []
      if (r.status === 'corrupt') {
        setInfo({ error: r.error, raw: r.raw })
        setPhase('corrupt')
        return
      }
      if (r.status === 'future') {
        setInfo({ raw: r.raw, version: r.version })
        setPhase('future')
        return
      }
      // the short guide is for the first visit only: a returning player who
      // already saw part of it (or built something) is not shown it again
      if (r.data && (r.data.tutorial.step > 0 || r.data.buildings.length)) r.data.tutorial.done = true
      if (r.status === 'restored') notes.push('저장본이 손상되어 직전 백업으로 복구했어요.')
      if (r.status === 'migrated') notes.push('예전 저장 형식을 새 형식으로 옮겼어요. 진행은 그대로예요.')
      g.play(r.data || newGame(Date.now()), notes)
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
        if (!store.available) return g.play(newGame(Date.now()))
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
    R.view.zoom = Math.min(1.5, Math.max(0.8, R.view.w / (12.5 * TILE)))
    R.lookAt(10 * TILE, (START.camp.y - 1.5) * TILE)
    const ro = new ResizeObserver(fit)
    ro.observe(stage)

    const handle = (events) => {
      for (const e of events) {
        if (e.type === 'built') {
          const b = g.s.buildings.find((x) => x.id === e.b)
          if (b) toast(`${BUILDINGS[b.type].name} Lv${e.level} 완성!`, 'built' + e.b, 'good')
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
        if (el.seconds >= OFFLINE.minNotice) setModal({ kind: 'offline', rep, capped: el.capped, full: !hasNews(rep) && RESOURCES.every((r) => s.res[r] >= caps(s)[r] - 1) })
        g.save()
      } else if (gap > 0) {
        for (let left = gap; left > 1e-6; left -= 0.05) tick(s, g.world, Math.min(0.05, left), events)
        s.clock.simAt = now
      } else s.clock.simAt = now // clock went back: carry on from here, nothing negative
      const dt = Math.min(0.1, (pnow - last) / 1000)
      last = pnow
      R.events(events, s.settings.effects)
      handle(events)
      R.draw(s, ui.current, dt)
      hudT += dt
      if (hudT > 0.25) {
        hudT = 0
        setBeat((x) => x + 1)
      }
      if (now - g.lastSave > SAVE.every * 1000) g.save()
    }
    raf = requestAnimationFrame(frame)

    // map: drag to look around, pinch / wheel to zoom, tap to pick
    const pts = new Map()
    let down = null
    let moved = false
    let pinch = null
    const pos = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e) => {
      canvas.setPointerCapture?.(e.pointerId)
      const p = pos(e)
      pts.set(e.pointerId, p)
      if (pts.size === 1) {
        down = { ...p, t: performance.now() }
        moved = false
      }
    }
    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return
      const p = pos(e)
      const prev = pts.get(e.pointerId)
      pts.set(e.pointerId, p)
      if (pts.size === 1) {
        if (!moved && Math.hypot(p.x - down.x, p.y - down.y) > 8) moved = true
        if (moved) R.pan(p.x - prev.x, p.y - prev.y)
      } else if (pts.size === 2) {
        moved = true
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
      if (pts.size === 0 && !moved && down && performance.now() - down.t < 600) tap(pos(e))
    }
    const onWheel = (e) => {
      e.preventDefault()
      const p = pos(e)
      R.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y)
    }
    const tap = ({ x, y }) => {
      const s = g.s
      const h = R.hit(s, x, y)
      if (ui.current.placing) {
        if (h && h.lot && lotFree(s, h.lot) && lotOpen(s, h.lot)) setPlacing((p) => p && { ...p, lot: h.lot })
        return
      }
      if (!h) return setSheet(null)
      if (h.building) return setSheet({ building: h.building })
      if (h.lot) return lotFree(s, h.lot) ? setSheet({ lot: h.lot }) : null
      if (h.zone) return setSheet({ zone: h.zone })
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

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
        setPlacing(null)
        setSheet(null)
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
        world: g.world,
        store: g.store,
        save: g.save,
        R,
        fast(sec) {
          const ev = []
          for (let t = 0; t < sec; t += 0.05) tick(g.s, g.world, 0.05, ev)
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
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
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

  const confirmPlace = () => {
    const r = place(g.s, g.world, placing.type, placing.lot)
    if (!r.ok) return toast(reasonText(r), 'place', 'warn')
    g.R.events([{ type: 'place', lot: placing.lot }], g.s.settings.effects)
    if (!g.s.tutorial.done && g.s.tutorial.step < 2) g.s.tutorial.step = 2
    g.save()
    toast('공사를 시작했어요! 마노들이 와서 지어요.', 'placed', 'good')
    setPlacing(null)
  }
  const doUpgrade = (id) => {
    const r = upgrade(g.s, id)
    if (!r.ok) return toast(reasonText(r), 'up', 'warn')
    g.save()
    toast(`${BUILDINGS[r.building.type].name} Lv${r.building.level + 1} 공사를 시작했어요.`, 'up', 'good')
  }
  const doUnlock = (z) => {
    const r = unlock(g.s, g.world, z)
    if (!r.ok) return toast(reasonText(r), 'zone', 'warn')
    g.save()
    const [r0, r1] = ZONES[z].rows
    g.R.lookAt(10 * TILE, ((r0 + r1 + 1) / 2) * TILE)
    setSheet(null)
    toast(`${ZONES[z].name}이(가) 열렸어요!`, 'zone', 'good')
  }
  const startPlacing = (type, lot) => {
    setSheet(null)
    setPlacing({ type, lot: lot || null })
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
      return setModal({ kind: 'importError', error: '파일을 읽지 못했어요.' })
    }
    const r = parse(text)
    if (!r.ok) {
      const why = r.kind === 'future' ? '더 새로운 버전의 게임에서 만든 백업이에요. 페이지를 새로고침한 뒤 다시 시도해 주세요.' : r.error
      return setModal({ kind: 'importError', error: why })
    }
    setModal({ kind: 'importConfirm', r })
  }
  const applyImport = (r) => {
    const data = r.data
    // an import restores the village as it was; time since the file was made does not count
    data.clock.simAt = Date.now()
    if (phase === 'play') {
      g.save()
      g.store.backupNow() // the progress being replaced stays in the backup slot
    } else if (info.raw) g.store.keepCorrupt(info.raw)
    setModal(null)
    g.play(data, ['백업을 불러왔어요.'])
  }
  const doReset = () => {
    g.store.reset()
    setModal(null)
    g.play(newGame(Date.now()), ['새 마을을 시작했어요.'])
  }
  const takeOver = () => {
    setPhase('loading')
    g.claim(700)
  }

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
              <button type="button" className="mc-btn mc-btn--danger" onClick={() => setModal({ kind: 'freshFromCorrupt' })}>
                새 마을 시작하기
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
        {modal && <Modal modal={modal} onClose={() => setModal(null)} onImport={applyImport} onFresh={() => {
          g.store.keepCorrupt(info.raw)
          setModal(null)
          g.play(newGame(Date.now()), ['새 마을을 시작했어요. 손상된 데이터는 따로 보관해 두었어요.'])
        }} />}
      </div>
    )
  }

  // ── playing ──
  const cap = caps(s)
  const pop = s.manos.length
  const room = homes(s)
  const freeLots = LOTS.filter((l) => lotOpen(s, l.id) && lotFree(s, l.id))
  const tutorialOn = !s.tutorial.done && !sheet && !placing && !modal

  const toggle = (name) => {
    setPlacing(null)
    setSheet((cur) => (cur === name ? null : name))
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
            onClick={() => setSheet('settings')}
            title={saveState.ok ? `저장됨 ${fmtClock(saveState.at)}` : SAVE_ERRORS[saveState.error]}
          >
            {saveState.ok ? '저장됨' : '저장 불가'}
          </button>
        </div>
        <div className="mc-res">
          {RESOURCES.map((r) => (
            <span key={r} className={`mc-chip ${s.res[r] >= cap[r] ? 'is-full' : ''}`} title={RES_LABEL[r]}>
              <img src={ICONS[r]} alt={RES_LABEL[r]} />
              <b>{Math.floor(s.res[r])}</b>
              <small>/{cap[r]}</small>
            </span>
          ))}
          <span className={`mc-chip ${pop >= room ? 'is-full' : ''}`} title="주민 / 수용 인원">
            <img src={ICONS.mano} alt="주민" />
            <b>{pop}</b>
            <small>/{room}</small>
          </span>
        </div>
      </header>

      <div className="mc-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="mc-canvas" aria-label="마노 마을 지도" />

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
                  setBeat((x) => x + 1)
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
                  setBeat((x) => x + 1)
                }}
              >
                건너뛰기
              </button>
            </div>
          </div>
        )}

        {placing && <PlaceBar s={s} placing={placing} onCancel={() => setPlacing(null)} onConfirm={confirmPlace} />}

        {sheet && (
          <Sheet onClose={() => setSheet(null)}>
            {(sheet === 'build' || sheet.lot) && (
              <BuildList s={s} lot={sheet.lot} freeLots={freeLots} onPick={startPlacing} onUnlock={doUnlock} />
            )}
            {sheet === 'upgrade' && <UpgradeList s={s} onUpgrade={doUpgrade} onPick={(id) => setSheet({ building: id })} />}
            {sheet.building && <BuildingInfo s={s} id={sheet.building} onUpgrade={doUpgrade} />}
            {sheet.zone && <ZoneInfo s={s} z={sheet.zone} onUnlock={doUnlock} />}
            {sheet === 'mano' && <ManoList s={s} />}
            {sheet === 'settings' && (
              <Settings
                s={s}
                saveState={saveState}
                onSave={() => {
                  g.save()
                  toast('저장했어요.', 'saved')
                }}
                onExport={exportBackup}
                onImport={() => fileRef.current.click()}
                onReset={() => setModal({ kind: 'reset' })}
                onEffects={() => {
                  s.settings.effects = !s.settings.effects
                  g.save()
                  setBeat((x) => x + 1)
                }}
                exitHref={exitHref}
              />
            )}
          </Sheet>
        )}
      </div>

      <nav className="mc-bar" aria-label="게임 메뉴">
        {[
          ['build', '건설', ICONS.hammer],
          ['upgrade', '업그레이드', ICONS.upgrade],
          ['mano', '마노', ICONS.mano],
          ['settings', '설정', ICONS.settings],
        ].map(([id, label, icon]) => (
          <button key={id} type="button" className={`mc-bar__btn ${sheet === id ? 'is-on' : ''}`} onClick={() => toggle(id)} aria-pressed={sheet === id}>
            <img src={icon} alt="" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      {modal && (
        <Modal
          modal={modal}
          s={s}
          onClose={() => setModal(null)}
          onImport={applyImport}
          onReset={doReset}
          onExport={exportBackup}
        />
      )}
    </div>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Sheet({ children, onClose }) {
  return (
    <section className="mc-sheet" role="dialog">
      <button type="button" className="mc-sheet__close" onClick={onClose} aria-label="닫기">
        ✕
      </button>
      {children}
    </section>
  )
}

function PlaceBar({ s, placing, onCancel, onConfirm }) {
  const def = BUILDINGS[placing.type]
  if (!placing.lot) {
    return (
      <div className="mc-place">
        <p>
          <b>{def.name}</b>을(를) 지을 부지를 눌러 주세요 <span className="mc-dim">(분홍색 칸)</span>
        </p>
        <div className="mc-row">
          <button type="button" className="mc-btn mc-btn--small mc-btn--ghost" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    )
  }
  const r = canPlace(s, placing.type, placing.lot)
  return (
    <div className="mc-place">
      <p className="mc-place__head">
        <img src={ICONS[def.icon]} alt="" />
        <b>{def.name} Lv1</b>
        <span className="mc-dim">부지 {placing.lot}</span>
      </p>
      <p className="mc-place__fx">{effectText(placing.type, 1)}</p>
      <div className="mc-row">
        <Cost cost={def.levels[0].cost} s={s} />
      </div>
      {!r.ok && <p className="mc-why">{reasonText(r)}</p>}
      <div className="mc-row">
        <button type="button" className="mc-btn mc-btn--small mc-btn--ghost" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="mc-btn mc-btn--small mc-btn--primary" disabled={!r.ok} onClick={onConfirm}>
          건설하기
        </button>
      </div>
    </div>
  )
}

function BuildList({ s, lot, freeLots, onPick, onUnlock }) {
  return (
    <>
      <h2 className="mc-sheet__title">{lot ? `부지 ${lot}에 건설` : '건설'}</h2>
      {!lot && !freeLots.length && <p className="mc-why">빈 부지가 없어요. 아래에서 구역을 넓혀 보세요.</p>}
      <ul className="mc-list">
        {BUILDING_TYPES.map((type) => {
          const def = BUILDINGS[type]
          const r = lot ? canPlace(s, type, lot) : freeLots.length ? canPlace(s, type, freeLots[0].id) : { ok: false, reason: '빈 부지가 없어요' }
          return (
            <li key={type} className="mc-card">
              <img className="mc-card__icon" src={ICONS[def.icon]} alt="" />
              <div className="mc-card__body">
                <p className="mc-card__name">{def.name}</p>
                <p className="mc-card__text">{effectText(type, 1)}</p>
                <Cost cost={def.levels[0].cost} s={s} />
                {!r.ok && <p className="mc-why">{reasonText(r)}</p>}
              </div>
              <button type="button" className="mc-btn mc-btn--small mc-btn--primary" disabled={!r.ok} onClick={() => onPick(type, lot)}>
                {lot ? '미리보기' : '부지 고르기'}
              </button>
            </li>
          )
        })}
      </ul>
      {!lot && (
        <>
          <h3 className="mc-sheet__sub">구역 확장</h3>
          <ul className="mc-list">
            {ZONE_IDS.filter((z) => ZONES[z].cost).map((z) => (
              <ZoneRow key={z} s={s} z={z} onUnlock={onUnlock} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function ZoneRow({ s, z, onUnlock }) {
  const zone = ZONES[z]
  const open = s.zones[z]
  const r = canUnlock(s, z)
  const lots = LOTS.filter((l) => zoneOfRow(l.y) === z).length
  return (
    <li className="mc-card">
      <img className="mc-card__icon" src={open ? ICONS.map : ICONS.lock} alt="" />
      <div className="mc-card__body">
        <p className="mc-card__name">{zone.name}</p>
        <p className="mc-card__text">{open ? '열린 구역이에요.' : `새 부지 ${lots}곳과 자원이 있어요.`}</p>
        {!open && <Cost cost={zone.cost} s={s} />}
        {!open && !r.ok && <p className="mc-why">{reasonText(r)}</p>}
      </div>
      {!open && (
        <button type="button" className="mc-btn mc-btn--small mc-btn--primary" disabled={!r.ok} onClick={() => onUnlock(z)}>
          확장하기
        </button>
      )}
    </li>
  )
}

function ZoneInfo({ s, z, onUnlock }) {
  return (
    <>
      <h2 className="mc-sheet__title">구역 확장</h2>
      <ul className="mc-list">
        <ZoneRow s={s} z={z} onUnlock={onUnlock} />
      </ul>
    </>
  )
}

function BuildingCard({ s, b, onUpgrade, onPick }) {
  const def = BUILDINGS[b.type]
  const r = canUpgrade(s, b.id)
  return (
    <li className="mc-card" onClick={onPick ? () => onPick(b.id) : undefined}>
      <img className="mc-card__icon" src={ICONS[def.icon]} alt="" />
      <div className="mc-card__body">
        <p className="mc-card__name">
          {def.name} <span className="mc-lv">Lv{b.level}</span> <span className="mc-dim">{b.lot}</span>
        </p>
        {b.level > 0 && <p className="mc-card__text">지금: {effectText(b.type, b.level)}</p>}
        {b.build && (
          <div className="mc-progress" aria-label="공사 진행">
            <span style={{ width: `${Math.min(100, (b.build.progress / buildWork(b)) * 100)}%` }} />
            <em>{b.level === 0 ? '건설' : `Lv${b.build.to} 공사`} 중 {Math.floor((b.build.progress / buildWork(b)) * 100)}%</em>
          </div>
        )}
        {!b.build && b.level < 3 && (
          <>
            <p className="mc-card__text">다음 Lv{b.level + 1}: {effectText(b.type, b.level + 1)}</p>
            <Cost cost={def.levels[b.level].cost} s={s} />
            {!r.ok && <p className="mc-why">{reasonText(r)}</p>}
          </>
        )}
        {b.level >= 3 && !b.build && <p className="mc-card__text">최고 레벨이에요.</p>}
      </div>
      {!b.build && b.level < 3 && (
        <button
          type="button"
          className="mc-btn mc-btn--small mc-btn--primary"
          disabled={!r.ok}
          onClick={(e) => {
            e.stopPropagation()
            onUpgrade(b.id)
          }}
        >
          업그레이드
        </button>
      )}
    </li>
  )
}

function UpgradeList({ s, onUpgrade, onPick }) {
  return (
    <>
      <h2 className="mc-sheet__title">업그레이드</h2>
      {!s.buildings.length && <p className="mc-card__text">아직 건물이 없어요. [건설]에서 첫 건물을 지어 보세요.</p>}
      <ul className="mc-list">
        {s.buildings.map((b) => (
          <BuildingCard key={b.id} s={s} b={b} onUpgrade={onUpgrade} onPick={onPick} />
        ))}
      </ul>
    </>
  )
}

function BuildingInfo({ s, id, onUpgrade }) {
  const b = s.buildings.find((x) => x.id === id)
  if (!b) return null
  const def = BUILDINGS[b.type]
  return (
    <>
      <h2 className="mc-sheet__title">{def.name}</h2>
      <p className="mc-card__text">{def.about}</p>
      {def.gathers && <p className="mc-dim mc-note">같은 건물을 여러 개 지으면 가장 높은 레벨의 효과가 적용되고, 내려놓을 곳이 늘어나요.</p>}
      <ul className="mc-list">
        <BuildingCard s={s} b={b} onUpgrade={onUpgrade} />
      </ul>
    </>
  )
}

function ManoList({ s }) {
  const room = homes(s)
  const pop = s.manos.length
  return (
    <>
      <h2 className="mc-sheet__title">
        마노 {pop} / {room}
      </h2>
      <p className="mc-card__text">
        {pop < room
          ? `빈집이 있어요. 새 마노가 ${Math.max(1, Math.ceil(MANO.arriveEvery - s.arrivalT))}초 뒤에 이사 와요.`
          : '빈집이 없어요. 마노 집을 짓거나 업그레이드하면 새 마노가 와요.'}
      </p>
      <ul className="mc-list mc-list--plain">
        {s.manos.map((m) => (
          <li key={m.id} className="mc-mano">
            <b>마노 #{m.id}</b>
            <span>{activity(m)}</span>
            {m.carry && (
              <span className="mc-carry">
                <img src={ICONS[m.carry.res]} alt="" />
                {m.carry.n}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Settings({ s, saveState, onSave, onExport, onImport, onReset, onEffects, exitHref }) {
  return (
    <>
      <h2 className="mc-sheet__title">설정</h2>
      <div className={`mc-savebox ${saveState.ok ? '' : 'is-bad'}`}>
        <img src={ICONS.save} alt="" />
        <div>
          <p className="mc-card__name">{saveState.ok ? `자동 저장됨 · ${fmtClock(saveState.at)}` : '저장 불가'}</p>
          <p className="mc-card__text">
            {saveState.ok
              ? '10초마다, 그리고 건설·업그레이드·확장 직후에 저장해요.'
              : `${SAVE_ERRORS[saveState.error] || '저장하지 못했어요.'} 진행을 잃지 않도록 백업 파일을 내보내 두세요.`}
          </p>
        </div>
      </div>
      <p className="mc-note">이 기기와 브라우저에 저장됩니다. 브라우저 데이터 삭제 전 백업을 내보내세요.</p>
      <div className="mc-grid">
        <button type="button" className="mc-btn" onClick={onSave}>
          지금 저장
        </button>
        <button type="button" className="mc-btn mc-btn--primary" onClick={onExport}>
          백업 내보내기
        </button>
        <button type="button" className="mc-btn" onClick={onImport}>
          백업 불러오기
        </button>
        <button type="button" className="mc-btn" onClick={onEffects} aria-pressed={s.settings.effects}>
          효과 {s.settings.effects ? '켜짐' : '꺼짐'}
        </button>
      </div>
      <p className="mc-note mc-dim">
        <img className="mc-inline" src={ICONS.clock} alt="" /> 게임을 닫아 둔 동안에도 일하던 마노들이 조금씩 자원을 모아요 (최대 {OFFLINE.maxSeconds / 3600}시간).
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

function Modal({ modal, s, onClose, onImport, onReset, onExport, onFresh }) {
  let body = null
  if (modal.kind === 'offline') {
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
              <img src={ICONS[BUILDINGS[b.type].icon]} alt="" /> {BUILDINGS[b.type].name} Lv{b.level} 완성
            </li>
          ))}
          {rep.arrived > 0 && (
            <li className="mc-gain">
              <img src={ICONS.mano} alt="" /> 새 마노 {rep.arrived}명 이사
            </li>
          )}
        </ul>
        <p className="mc-note mc-dim">
          {capped ? '8시간이 넘게 지나서 최대 8시간까지만 계산했어요. ' : ''}실제로 일하던 마노 기준으로, 조금 보수적으로 계산해요. 보관 한도를 넘는 양은 받지 않아요.
        </p>
        <button type="button" className="mc-btn mc-btn--primary" onClick={onClose}>
          확인
        </button>
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
        <p className="mc-card__text">
          {RESOURCES.map((r) => `${RES_LABEL[r]} ${Math.floor(d.res[r])}`).join(' · ')}
        </p>
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
        <p className="mc-card__text">
          이 마을의 저장 데이터(현재 저장본과 백업)가 지워지고 새 마을이 시작돼요. 사이트의 다른 데이터는 그대로예요.
        </p>
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
