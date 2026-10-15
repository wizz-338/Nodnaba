import { useEffect, useRef, useState } from 'react'
import { createGame, start, update } from './engine'
import { buildAssets, createFx, draw } from './render'
import sheetUrl from './mano.png'
import './game.css'

const BEST_KEY = 'nodnaba:manorun:best'
const pad = (n) => String(n).padStart(6, '0')

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(n) {
  try {
    localStorage.setItem(BEST_KEY, String(n))
  } catch {
    /* private mode: the record just lasts for this visit */
  }
}

export default function GamePage({ exitHref = '#/' }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const scoreRef = useRef(null)
  const bestRef = useRef(null)
  const api = useRef({})
  const [screen, setScreen] = useState('ready') // ready | run | over | paused
  const [result, setResult] = useState({ score: 0, best: readBest(), record: false })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    // the world is drawn at its own pixel size, then scaled up without smoothing
    const buf = document.createElement('canvas')
    const bctx = buf.getContext('2d')
    let game = createGame({ viewW: 300 })
    let fx = createFx()
    let assets = null
    let best = readBest()
    let shownScore = -1
    let shownBest = -1
    let held = false
    let pressed = false
    let overShown = false
    let paused = false
    let raf
    const view = { W: 300, H: 400, k: 1, s: 1 }

    // stop the page from scrolling / bouncing while the game is open
    const root = document.documentElement
    const prev = [root.style.overflow, document.body.style.overflow, root.style.overscrollBehavior]
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    root.style.overscrollBehavior = 'none'

    const img = new Image()
    img.onload = () => (assets = buildAssets(img))
    img.src = sheetUrl

    // ~300 world pixels across a portrait phone (Mano ≈ 1/4 of the height of
    // the action), at least ~175 tall; snap to a whole-number scale when close
    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const dw = Math.max(1, Math.round(r.width * dpr))
      const dh = Math.max(1, Math.round(r.height * dpr))
      canvas.width = dw
      canvas.height = dh
      let s = Math.max(1, Math.min(dw / 300, dh / 175))
      if (s - Math.floor(s) < 0.2) s = Math.floor(s)
      view.s = s
      view.W = dw / s
      view.H = dh / s
      buf.width = Math.ceil(view.W)
      buf.height = Math.ceil(view.H)
      game.viewW = Math.ceil(view.W)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    const newRun = () => {
      game = createGame({ viewW: Math.ceil(view.W) })
      fx = createFx()
      overShown = false
      shownScore = -1
      start(game)
      setScreen('run')
    }

    const press = () => {
      if (paused) {
        paused = false
        setScreen('run')
        return
      }
      if (game.phase === 'ready') {
        newRun()
        return
      }
      if (game.phase === 'run') {
        pressed = true
        held = true
      }
    }
    const release = () => {
      held = false
    }
    api.current = { press, release, retry: newRun }
    // dev-server only: lets browser tests read the live game state
    if (import.meta.env.DEV) window.__manoRun = () => game

    const onKeyDown = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault()
        if (e.repeat) return
        if (game.phase === 'dead') {
          if (overShown) newRun()
          return
        }
        press()
      } else if (e.code === 'Enter' && game.phase === 'dead' && overShown) newRun()
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') release()
    }
    addEventListener('keydown', onKeyDown)
    addEventListener('keyup', onKeyUp)

    const onHide = () => {
      if (document.hidden && game.phase === 'run') {
        paused = true
        held = false
        setScreen('paused')
      }
    }
    document.addEventListener('visibilitychange', onHide)

    let last = performance.now()
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!assets) return
      if (!paused) {
        update(game, dt, { held, pressed })
        pressed = false
      }
      const settled = draw(bctx, view, game, fx, assets, paused ? 0 : dt)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(buf, 0, 0, buf.width * view.s, buf.height * view.s)

      // HUD (written straight to the DOM, no React re-render per frame)
      if (game.score !== shownScore) {
        shownScore = game.score
        scoreRef.current.textContent = pad(shownScore)
      }
      const liveBest = Math.max(best, game.score)
      if (liveBest !== shownBest) {
        shownBest = liveBest
        bestRef.current.textContent = pad(liveBest)
        bestRef.current.classList.toggle('is-new', game.score > best && best > 0)
      }

      if (settled && !overShown) {
        overShown = true
        const record = game.score > best
        if (record) {
          best = game.score
          saveBest(best)
        }
        setResult({ score: game.score, best, record })
        setScreen('over')
      }
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onHide)
      ;[root.style.overflow, document.body.style.overflow, root.style.overscrollBehavior] = prev
    }
  }, [])

  const down = (e) => {
    if (e.target.closest('button, a')) return
    e.preventDefault()
    api.current.press?.()
  }
  const up = () => api.current.release?.()

  return (
    <div className="mr" aria-label="MANO RUN">
      <header className="mr-hud">
        <a className="mr-exit" href={exitHref} aria-label="게임 나가기">
          ◀ EXIT
        </a>
        <h1 className="mr-title">
          MANO <span>RUN</span>
        </h1>
        <dl className="mr-scores">
          <div>
            <dt>SCORE</dt>
            <dd ref={scoreRef}>000000</dd>
          </div>
          <div>
            <dt>BEST</dt>
            <dd ref={bestRef}>{pad(result.best)}</dd>
          </div>
        </dl>
      </header>

      <div className="mr-play" onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
        <div className="mr-stage" ref={wrapRef}>
          <canvas ref={canvasRef} className="mr-canvas" />

          {screen === 'ready' && (
            <div className="mr-overlay mr-overlay--ready">
              <p className="mr-big">MANO RUN</p>
              <p className="mr-blink">TAP TO START</p>
              <p className="mr-hint">PC: SPACE</p>
            </div>
          )}
          {screen === 'paused' && (
            <div className="mr-overlay">
              <p className="mr-big">PAUSED</p>
              <p className="mr-blink">TAP TO RESUME</p>
            </div>
          )}
          {screen === 'over' && (
            <div className="mr-overlay mr-overlay--over">
              <div className="mr-panel" role="dialog" aria-label="GAME OVER">
                <p className="mr-big">GAME OVER</p>
                {result.record && <p className="mr-record">NEW BEST!</p>}
                <dl className="mr-result">
                  <div>
                    <dt>SCORE</dt>
                    <dd>{pad(result.score)}</dd>
                  </div>
                  <div>
                    <dt>BEST</dt>
                    <dd>{pad(result.best)}</dd>
                  </div>
                </dl>
                <button className="mr-retry" type="button" onClick={() => api.current.retry?.()} autoFocus>
                  ▶ RETRY
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mr-pad" aria-hidden="true">
          <span>TAP TO JUMP</span>
          <small>길게 누르면 더 높이</small>
        </div>
      </div>
    </div>
  )
}
