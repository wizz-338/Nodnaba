import { useCallback, useEffect, useRef, useState } from 'react'
import { D } from './data.js'
import { createRun, step, choose, applyPreview, buildSummary, gradeMul, weaponDef } from './game.js'
import { browserStorage, canFuse, createProgress } from './progress.js'
import { createRenderer, drawIdlePreview, loadImages } from './render.js'
import { GAMES } from '../data/games.js'
import pauseSvg from './assets/ui/pause.svg'
import iconBall from './assets/icons/ball.png'
import iconCoin from './assets/icons/coin.png'
import iconChest from './assets/icons/chest.png'
import iconFusion from './assets/icons/fusion.png'
import iconCount from './assets/icons/upgrade_count.png'
import iconBounce from './assets/icons/upgrade_bounce.png'
import iconSplit from './assets/icons/upgrade_split.png'
import iconSize from './assets/icons/upgrade_size.png'
import iconPower from './assets/icons/upgrade_power.png'
import iconHaste from './assets/icons/upgrade_haste.png'
import iconMagnet from './assets/icons/upgrade_magnet.png'
import iconHealth from './assets/icons/upgrade_health.png'
import './survivor.css'

const ICON = {
  upgrade_count: iconCount,
  upgrade_bounce: iconBounce,
  upgrade_split: iconSplit,
  upgrade_size: iconSize,
  upgrade_power: iconPower,
  upgrade_haste: iconHaste,
  upgrade_magnet: iconMagnet,
  upgrade_health: iconHealth,
}
const WEAPON_ICON = { bouncy_ball: iconBall }
const OPTIONS = Object.fromEntries(D.upgrades.options.map((o) => [o.id, o]))
const GRADES = D.progression.grades
const GRADE_COLOR = D.ui.grades
const JOY = D.ui.joystick
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString()

// one line of numbers for a card: what it is now → what it becomes
function change(run, id) {
  const w = run.weapon
  const p = run.player
  const n = applyPreview(run, id)
  switch (id) {
    case 'count':
      return `공 ${w.count}개 → ${n.count}개`
    case 'damage':
      return `피해 ${fmt(w.damage)} → ${fmt(n.damage)}`
    case 'bounce':
      return `반사 ${w.bounces}회 → ${n.bounces}회`
    case 'split':
      return `분열 ${Math.round(w.splitChance * 100)}% → ${Math.round(n.splitChance * 100)}%`
    case 'haste':
      return `발사 간격 ${fmt(w.interval, 2)}초 → ${fmt(n.interval, 2)}초`
    case 'size':
      return `크기 ${fmt(w.radius)} → ${fmt(n.radius)} · 피해 ${fmt(w.damage)} → ${fmt(n.damage)}`
    case 'magnet':
      return `획득 반경 ${Math.round(p.pickupR)} → ${Math.round(n.pickupR)} · 속도 ${Math.round(p.speed)} → ${Math.round(n.speed)}`
    case 'health':
      return `최대 체력 ${Math.round(p.maxHp)} → ${Math.round(n.maxHp)} · 체력 +35`
    default:
      return ''
  }
}

const weaponName = (id) => (weaponDef(D, id) || { name: id }).name
const damageOf = (item) => {
  const def = weaponDef(D, item.weaponId)
  return def ? def.base.damage * gradeMul(D, item.grade) : 0
}

function Grade({ g }) {
  return (
    <span className="ms-grade" style={{ '--g': GRADE_COLOR[g] }}>
      {g}
    </span>
  )
}

function ManoPreview({ img }) {
  const ref = useRef(null)
  useEffect(() => {
    let raf
    const t0 = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (ref.current && img) drawIdlePreview(ref.current, img, D, (now - t0) / 1000)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [img])
  return <canvas ref={ref} className="ms-preview" width="192" height="192" aria-label="마노" />
}

export default function SurvivorPage({ exitHref = '#/' }) {
  const P = useRef(null)
  const [img, setImg] = useState(null)
  const [error, setError] = useState('')
  const [screen, setScreen] = useState('loading') // loading | equip | battle | fusion
  const [save, setSave] = useState(null)
  const [notice, setNotice] = useState('')
  const [chapter, setChapter] = useState(1)
  const [modal, setModal] = useState(null) // { kind: 'pause' | 'quit' | 'result' | 'chest' | 'help' }
  const [, setBeat] = useState(0)
  const G = useRef({ run: null, runId: null, input: { x: 0, y: 0 }, paid: false, choosing: false })

  const refresh = useCallback(() => setSave(P.current.get()), [])

  // boot: images and the saved pocket
  useEffect(() => {
    P.current = createProgress(D, browserStorage())
    const b = P.current.boot()
    setSave(b.data)
    setChapter(Math.max(1, Math.min(b.data.unlockedChapter, 99)))
    if (b.lostRun) setNotice('지난 판은 끝나지 않은 채 닫혀서 보상 없이 종료되었어요. 무기와 받은 보상은 그대로예요.')
    else if (!P.current.available) setNotice('이 브라우저에서는 저장할 수 없어요. 플레이는 가능하지만 진행이 남지 않아요.')
    loadImages()
      .then((i) => {
        setImg(i)
        setScreen('equip')
      })
      .catch((e) => setError(e.message))
    // the page behind does not scroll while the game is open
    const root = document.documentElement
    const prev = [root.style.overflow, document.body.style.overflow]
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      ;[root.style.overflow, document.body.style.overflow] = prev
    }
  }, [])

  const equipped = save && (save.inventory.find((it) => it.id === save.equippedInstanceId) || save.inventory[0])

  const start = (ch = chapter) => {
    const r = P.current.startRun(ch)
    if (!r.weapon) return setNotice('장착할 무기가 없어요.')
    const g = G.current
    g.runId = r.runId
    g.chapter = ch
    g.paid = false
    g.choosing = false
    g.input = { x: 0, y: 0 }
    g.run = createRun(D, { chapter: ch, weaponId: r.weapon.weaponId, grade: r.weapon.grade, seed: (Math.random() * 2 ** 31) | 0, runId: r.runId })
    g.reward = null
    setModal(null)
    setScreen('battle')
    refresh()
  }

  // ── chest ──
  const openChest = (chestId) => {
    const g = G.current
    if (g.opening) return
    g.opening = true
    const item = P.current.openChest(chestId)
    g.opening = false
    if (g.reward && g.reward.chest && g.reward.chest.id === chestId) g.reward.chest = null
    refresh()
    // after the chest, back to whatever was showing (the result, say)
    if (item) setModal((m) => ({ kind: 'chest', item, after: m }))
  }

  if (error)
    return (
      <div className="ms ms--screen">
        <p>{error}</p>
        <a className="ms-btn" href={exitHref}>
          사이트로 돌아가기
        </a>
      </div>
    )

  return (
    <div className="ms">
      {screen === 'loading' && <div className="ms-loading">마노가 주머니를 챙기는 중…</div>}
      {screen === 'equip' && save && (
        <Equip
          img={img}
          save={save}
          equipped={equipped}
          chapter={chapter}
          setChapter={setChapter}
          notice={notice}
          onNotice={() => setNotice('')}
          onEquip={(id) => {
            P.current.equip(id)
            refresh()
          }}
          onStart={() => start()}
          onFusion={() => setScreen('fusion')}
          onChest={() => save.chests[0] && openChest(save.chests[0].id)}
          exitHref={exitHref}
          saveError={P.current && P.current.error()}
        />
      )}
      {screen === 'fusion' && save && (
        <Fusion
          save={save}
          onBack={() => setScreen('equip')}
          onFuse={(ids) => {
            const r = P.current.fuse(ids)
            refresh()
            return r
          }}
        />
      )}
      {screen === 'battle' && G.current.run && (
        <Battle
          key={G.current.runId}
          img={img}
          G={G}
          P={P}
          firstTime={save && !save.seenHelp}
          modal={modal}
          setModal={setModal}
          onRetry={() => start(G.current.chapter)}
          onEquip={() => {
            setModal(null)
            setScreen('equip')
            refresh()
          }}
          onChest={openChest}
          refresh={refresh}
          rerender={() => setBeat((x) => x + 1)}
        />
      )}
      {modal && modal.kind === 'chest' && (
        <div className="ms-modal" role="dialog" aria-modal="true">
          <div className="ms-panel ms-chest">
            <h2 className="ms-h">상자 열기</h2>
            <img className="ms-chest__img" src={iconChest} alt="" />
            <p className="ms-chest__item">
              <img src={WEAPON_ICON[modal.item.weaponId]} alt="" />
              {weaponName(modal.item.weaponId)} <Grade g={modal.item.grade} />
            </p>
            <p className="ms-dim">무기가 주머니에 들어갔어요. 장착 칸이 늘어나지는 않아요.</p>
            <button type="button" className="ms-btn ms-btn--primary" onClick={() => setModal(modal.after || null)}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── equipment ────────────────────────────────────────────────────────────────

function Equip({ img, save, equipped, chapter, setChapter, notice, onNotice, onEquip, onStart, onFusion, onChest, exitHref, saveError }) {
  const groups = {}
  for (const it of save.inventory) {
    const k = it.weaponId + ':' + it.grade
    ;(groups[k] = groups[k] || []).push(it)
  }
  const best = save.bestResults[chapter]
  const rows = Object.entries(groups).sort((a, b) => GRADES.indexOf(b[1][0].grade) - GRADES.indexOf(a[1][0].grade))
  return (
    <div className="ms-page">
      <header className="ms-top">
        <a className="ms-exit" href={exitHref}>
          ◀ 나가기
        </a>
        <span className="ms-coins">
          <img src={iconCoin} alt="재화" />
          {save.currency}
        </span>
      </header>
      <h1 className="ms-title">{GAMES.survivor.title}</h1>
      <h2 className="ms-h">마노의 주머니</h2>
      {notice && (
        <p className="ms-notice" onClick={onNotice}>
          {notice}
        </p>
      )}
      {saveError && <p className="ms-notice">저장되지 않았어요. (브라우저가 저장을 막았거나 공간이 부족해요)</p>}
      <section className="ms-panel ms-equip">
        <ManoPreview img={img} />
        <div className="ms-slot">
          <span className="ms-slot__label">무기 슬롯</span>
          {equipped ? (
            <div className="ms-slot__item" style={{ '--g': GRADE_COLOR[equipped.grade] }}>
              <img src={WEAPON_ICON[equipped.weaponId]} alt="" />
              <div>
                <p className="ms-slot__name">
                  {weaponName(equipped.weaponId)} <Grade g={equipped.grade} />
                </p>
                <p className="ms-dim">피해 {fmt(damageOf(equipped))} · 장착 중</p>
              </div>
            </div>
          ) : (
            <p className="ms-dim">비어 있어요</p>
          )}
        </div>
      </section>

      <section className="ms-panel">
        <div className="ms-row">
          <h3 className="ms-sub">보유 무기</h3>
          <button type="button" className="ms-btn ms-btn--small" onClick={onFusion}>
            <img src={iconFusion} alt="" /> 합성
          </button>
        </div>
        <ul className="ms-inv">
          {rows.map(([k, items]) =>
            items.map((it) => (
              <li key={it.id}>
                <button type="button" className={`ms-inv__item ${it.id === save.equippedInstanceId ? 'is-on' : ''}`} style={{ '--g': GRADE_COLOR[it.grade] }} onClick={() => onEquip(it.id)} aria-pressed={it.id === save.equippedInstanceId}>
                  <img src={WEAPON_ICON[it.weaponId]} alt="" />
                  <span>
                    {weaponName(it.weaponId)} <Grade g={it.grade} />
                  </span>
                  <small>{it.id === save.equippedInstanceId ? '장착 중' : '장착'}</small>
                </button>
              </li>
            )),
          )}
        </ul>
        {save.chests.length > 0 && (
          <button type="button" className="ms-btn ms-chestbtn" onClick={onChest}>
            <img src={iconChest} alt="" /> 상자 열기 ({save.chests.length})
          </button>
        )}
      </section>

      <section className="ms-panel ms-go">
        <div className="ms-chapters" role="group" aria-label="챕터">
          {Array.from({ length: save.unlockedChapter }, (_, i) => i + 1).map((c) => (
            <button key={c} type="button" className={`ms-chip ${c === chapter ? 'is-on' : ''}`} onClick={() => setChapter(c)} aria-pressed={c === chapter}>
              챕터 {c}
            </button>
          ))}
        </div>
        <p className="ms-dim">{best ? `최고 기록: 웨이브 ${best.wave} · 처치 ${best.kills}${best.cleared ? ' · 클리어' : ''}` : '6웨이브를 버티면 챕터 클리어, 상자 1개를 받아요.'}</p>
        <button type="button" className="ms-btn ms-btn--primary ms-btn--big" onClick={onStart} disabled={!equipped}>
          출발
        </button>
      </section>
    </div>
  )
}

// ── fusion ───────────────────────────────────────────────────────────────────

function Fusion({ save, onBack, onFuse }) {
  const [sel, setSel] = useState([])
  const [done, setDone] = useState(null)
  const busy = useRef(false)
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s))
  const check = sel.length === 3 ? canFuse(D, save, sel) : { ok: false, reason: '같은 무기·같은 등급 3개를 골라 주세요.' }
  const first = save.inventory.find((it) => it.id === sel[0])
  const next = first && GRADES[GRADES.indexOf(first.grade) + 1]
  const includesEquipped = sel.includes(save.equippedInstanceId)
  const items = save.inventory.slice().sort((a, b) => GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade))
  return (
    <div className="ms-page">
      <header className="ms-top">
        <button type="button" className="ms-exit" onClick={onBack}>
          ◀ 주머니로
        </button>
      </header>
      <h2 className="ms-h">합성</h2>
      <p className="ms-dim ms-center">같은 무기 3개를 모아 더 높게</p>
      <section className="ms-panel ms-fuse">
        <div className="ms-fuse__row">
          {[0, 1, 2].map((i) => {
            const it = save.inventory.find((x) => x.id === sel[i])
            return (
              <span key={i} className="ms-fuse__slot" style={it ? { '--g': GRADE_COLOR[it.grade] } : undefined}>
                {it ? <img src={WEAPON_ICON[it.weaponId]} alt="" /> : '+'}
                {it && <Grade g={it.grade} />}
              </span>
            )
          })}
          <span className="ms-fuse__arrow">→</span>
          <span className="ms-fuse__slot ms-fuse__slot--out" style={check.ok ? { '--g': GRADE_COLOR[next] } : undefined}>
            {check.ok ? <img src={WEAPON_ICON[first.weaponId]} alt="" /> : '?'}
            {check.ok && <Grade g={next} />}
          </span>
        </div>
        {!check.ok && <p className="ms-why">{check.reason}</p>}
        {check.ok && includesEquipped && <p className="ms-dim">장착 중인 무기가 포함되어 있어요. 합성하면 새 무기를 장착해요.</p>}
        <button
          type="button"
          className="ms-btn ms-btn--primary"
          disabled={!check.ok || busy.current}
          onClick={() => {
            if (busy.current) return
            busy.current = true
            const r = onFuse(sel)
            setSel([])
            setDone(r.ok ? r : null)
            busy.current = false
          }}
        >
          합성
        </button>
        {done && (
          <p className="ms-ok">
            {weaponName(done.item.weaponId)} <Grade g={done.item.grade} /> 완성!{done.equipped ? ' (장착했어요)' : ''}
          </p>
        )}
      </section>
      <section className="ms-panel">
        <h3 className="ms-sub">보유 무기 (눌러서 고르기)</h3>
        <ul className="ms-inv">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" className={`ms-inv__item ${sel.includes(it.id) ? 'is-sel' : ''}`} style={{ '--g': GRADE_COLOR[it.grade] }} onClick={() => toggle(it.id)} aria-pressed={sel.includes(it.id)}>
                <img src={WEAPON_ICON[it.weaponId]} alt="" />
                <span>
                  {weaponName(it.weaponId)} <Grade g={it.grade} />
                </span>
                <small>{it.id === save.equippedInstanceId ? '장착 중' : sel.includes(it.id) ? '선택됨' : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ── battle ───────────────────────────────────────────────────────────────────

function Battle({ img, G, P, firstTime, modal, setModal, onRetry, onEquip, onChest, refresh, rerender }) {
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const joyRef = useRef(null)
  const knobRef = useRef(null)
  const [hint, setHint] = useState(firstTime)
  const modalRef = useRef(modal)
  modalRef.current = modal

  useEffect(() => {
    const g = G.current
    const stage = stageRef.current
    const R = createRenderer(canvasRef.current, img, D)
    const fit = () => {
      const r = stage.getBoundingClientRect()
      R.resize(r.width, r.height, devicePixelRatio)
      g.k = r.width / 360
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(stage)

    // ── joystick: one finger, wherever it lands in the lower half ──
    const joy = { id: null, ox: 0, oy: 0 }
    const show = (on, x = 0, y = 0, kx = 0, ky = 0) => {
      const el = joyRef.current
      if (!el) return
      el.style.display = on ? 'block' : 'none'
      el.style.transform = `translate(${x}px, ${y}px)`
      knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`
    }
    const release = () => {
      joy.id = null
      g.input = { x: 0, y: 0 }
      show(false)
    }
    g.releaseInput = release
    const local = (e) => {
      const r = stage.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e) => {
      if (joy.id !== null || modalRef.current || g.run.state !== 'play') return
      if (e.target.closest('button, a')) return
      const p = local(e)
      const [, ry, , rh] = JOY.activationRegion
      if (p.y / g.k < ry || p.y / g.k > ry + rh) return
      joy.id = e.pointerId
      joy.ox = p.x
      joy.oy = p.y
      stage.setPointerCapture?.(e.pointerId)
      show(true, p.x, p.y)
      e.preventDefault()
    }
    const onMove = (e) => {
      if (e.pointerId !== joy.id) return
      const p = local(e)
      const R0 = JOY.radius * g.k
      let dx = p.x - joy.ox
      let dy = p.y - joy.oy
      const d = Math.hypot(dx, dy)
      if (d > R0) (dx *= R0 / d), (dy *= R0 / d)
      const m = Math.min(1, d / R0)
      // dead zone, then the full range again from its edge
      const s = m < JOY.deadzone ? 0 : (m - JOY.deadzone) / (1 - JOY.deadzone)
      g.input = d > 0 ? { x: (dx / Math.hypot(dx, dy)) * s, y: (dy / Math.hypot(dx, dy)) * s } : { x: 0, y: 0 }
      show(true, joy.ox, joy.oy, dx, dy)
    }
    const onUp = (e) => {
      if (e.pointerId === joy.id) release()
    }
    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)
    stage.addEventListener('lostpointercapture', onUp)
    // leaving the app or the tab: let go of the stick, pause the battle
    const away = () => {
      release()
      if (g.run && g.run.state === 'play' && !modalRef.current) setModal({ kind: 'pause' })
    }
    const onVis = () => document.hidden && away()
    addEventListener('blur', away)
    document.addEventListener('visibilitychange', onVis)
    const onKey = (e) => {
      if (e.key === 'Escape' && !modalRef.current && g.run.state === 'play') away()
    }
    addEventListener('keydown', onKey)

    // ── the loop ──
    let raf
    let last = performance.now()
    let hudT = 0
    let shownLevel = null
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const run = g.run
      const paused = modalRef.current && modalRef.current.kind !== 'result' && modalRef.current.kind !== 'chest'
      if (!paused && run.state !== 'over') step(run, dt, g.input)
      R.draw(run, paused || run.state === 'levelup' ? 0 : dt)
      // a level-up opens its cards (input let go, so the stick never sticks)
      if (run.state === 'levelup' && shownLevel !== run.choiceSeq) {
        shownLevel = run.choiceSeq
        g.choosing = false
        release()
        rerender()
      }
      if (run.state === 'over' && !g.paid) {
        g.paid = true
        release()
        const reward = P.current.finishRun(g.runId, g.chapter, run.result)
        g.reward = reward
        refresh()
        setModal({ kind: 'result' })
      }
      hudT += dt
      if (hudT > 0.1) {
        hudT = 0
        rerender()
      }
    }
    raf = requestAnimationFrame(frame)
    if (firstTime) {
      setTimeout(() => setHint(false), 3000)
      P.current.seenHelp()
    }

    if (import.meta.env.DEV) {
      window.__survivor = {
        get run() {
          return g.run
        },
        get progress() {
          return P.current.get()
        },
        setInput: (x, y) => (g.input = { x, y }),
        R,
      }
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      release()
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('lostpointercapture', onUp)
      removeEventListener('blur', away)
      document.removeEventListener('visibilitychange', onVis)
      removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // modals always let go of the stick
  useEffect(() => {
    if (modal && G.current.releaseInput) G.current.releaseInput()
  }, [modal, G])

  const run = G.current.run
  const p = run.player
  const waves = D.balance.waves
  const left = Math.max(0, Math.ceil(waves[run.wave].seconds - run.waveT))
  const pct = (v) => `${(v * 100).toFixed(2)}%`
  const box = ([x, y, w, h]) => ({ left: pct(x / 360), top: pct(y / 640), width: pct(w / 360), height: pct(h / 640) })
  const H = D.ui.hud

  return (
    <div className="ms-stage" ref={stageRef}>
      <canvas ref={canvasRef} className="ms-canvas" aria-label="전투 화면" />
      {/* top bar: health, XP, level, wave and time, coins, pause */}
      <div className="ms-hud">
        <div className="ms-bar ms-bar--hp" style={box(H.health)}>
          <span style={{ width: pct(Math.max(0, Math.min(1, p.hp / p.maxHp))) }} />
          <em>
            {Math.ceil(p.hp)} / {Math.round(p.maxHp)}
          </em>
        </div>
        <div className="ms-bar ms-bar--xp" style={box(H.xp)}>
          <span style={{ width: pct(Math.max(0, Math.min(1, run.xp / run.need))) }} />
        </div>
        <div className="ms-lv" style={{ left: pct(12 / 360), top: pct(38 / 640) }}>
          LV {run.level}
        </div>
        <div className="ms-wave" style={box(H.wave)}>
          WAVE {run.wave + 1}/{waves.length}
        </div>
        <div className="ms-time" style={box(H.timer)}>
          {left}초
        </div>
        <div className="ms-cur" style={box(H.currency)}>
          <img src={iconCoin} alt="재화" /> {run.coins}
        </div>
        <button type="button" className="ms-pause" style={box(H.pause)} onClick={() => setModal({ kind: 'pause' })} aria-label="일시정지" disabled={run.state !== 'play' || !!modal}>
          <img src={pauseSvg} alt="" />
        </button>
      </div>
      {hint && <p className="ms-hint">아래쪽 화면을 누른 채 움직이면 마노가 걸어요. 공격은 자동이에요.</p>}
      <div className="ms-joy" ref={joyRef} aria-hidden="true">
        <span className="ms-joy__base" style={{ width: JOY.radius * 2 * (G.current.k || 1), height: JOY.radius * 2 * (G.current.k || 1) }} />
        <span className="ms-joy__knob" ref={knobRef} style={{ width: JOY.knobRadius * 2 * (G.current.k || 1), height: JOY.knobRadius * 2 * (G.current.k || 1) }} />
      </div>

      {run.state === 'levelup' && run.choices && !modal && (
        <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true" aria-label="강화 선택">
          <div className="ms-level">
            <h2 className="ms-h">이번 판의 행운은?</h2>
            <p className="ms-dim ms-center">하나를 골라 주세요{run.pending > 1 ? ` (남은 선택 ${run.pending})` : ''}</p>
            {run.choices.map((id) => {
              const o = OPTIONS[id]
              return (
                <button
                  key={id + run.choiceSeq}
                  type="button"
                  className="ms-card"
                  onClick={() => {
                    const g = G.current
                    if (g.choosing) return
                    g.choosing = true
                    choose(run, id, run.choiceSeq)
                    g.choosing = false
                    rerender()
                  }}
                >
                  <img src={ICON[o.icon]} alt="" />
                  <span className="ms-card__body">
                    <span className="ms-card__name">
                      {o.name}
                      {run.picks[id] ? <em className="ms-card__stack">×{run.picks[id]}</em> : null}
                    </span>
                    <span className="ms-card__num">{change(run, id)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {modal && modal.kind === 'pause' && (
        <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true">
          <div className="ms-panel ms-menu">
            <h2 className="ms-h">잠깐 쉬어가기</h2>
            <button type="button" className="ms-btn ms-btn--primary" onClick={() => setModal(null)}>
              계속하기
            </button>
            <button type="button" className="ms-btn" onClick={() => setModal({ kind: 'quit' })}>
              장비로
            </button>
          </div>
        </div>
      )}
      {modal && modal.kind === 'quit' && (
        <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true">
          <div className="ms-panel ms-menu">
            <h2 className="ms-h">전투를 포기할까요?</h2>
            <p className="ms-dim ms-center">이번 판의 강화와 보상은 사라져요. 무기는 그대로예요.</p>
            <button type="button" className="ms-btn" onClick={() => setModal({ kind: 'pause' })}>
              계속하기
            </button>
            <button
              type="button"
              className="ms-btn ms-btn--danger"
              onClick={() => {
                const g = G.current
                g.paid = true
                P.current.abandonRun(g.runId)
                onEquip()
              }}
            >
              포기하고 장비로
            </button>
          </div>
        </div>
      )}
      {modal && modal.kind === 'result' && run.result && (
        <Result run={run} reward={G.current.reward} onRetry={onRetry} onEquip={onEquip} onChest={onChest} setModal={setModal} />
      )}
    </div>
  )
}

function Result({ run, reward, onRetry, onEquip, onChest, setModal }) {
  const r = run.result
  const build = buildSummary(run)
  const busy = useRef(false)
  const once = (fn) => () => {
    if (busy.current) return
    busy.current = true
    fn()
  }
  return (
    <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true">
      <div className="ms-panel ms-result">
        <h2 className="ms-h">{r.cleared ? '마노가 해냈다!' : '한 번 더 도전할까?'}</h2>
        <dl className="ms-stats">
          <div>
            <dt>챕터</dt>
            <dd>{run.chapter}</dd>
          </div>
          <div>
            <dt>웨이브</dt>
            <dd>
              {r.wave}/{D.balance.waves.length}
            </dd>
          </div>
          <div>
            <dt>처치</dt>
            <dd>{r.kills}</dd>
          </div>
          <div>
            <dt>재화</dt>
            <dd>
              <img src={iconCoin} alt="" /> {r.coins}
            </dd>
          </div>
        </dl>
        {build.length > 0 && (
          <ul className="ms-build" aria-label="선택한 강화">
            {build.map((b) => (
              <li key={b.id}>
                <img src={ICON[b.icon]} alt="" />
                {b.name} ×{b.n}
              </li>
            ))}
          </ul>
        )}
        {reward && reward.chest && (
          <button type="button" className="ms-btn ms-chestbtn" onClick={() => onChest(reward.chest.id)}>
            <img src={iconChest} alt="" /> 상자 열기
          </button>
        )}
        <div className="ms-row ms-row--two">
          <button type="button" className="ms-btn" onClick={once(onEquip)}>
            장비로
          </button>
          <button type="button" className="ms-btn ms-btn--primary" onClick={once(onRetry)}>
            다시 도전
          </button>
        </div>
      </div>
    </div>
  )
}

