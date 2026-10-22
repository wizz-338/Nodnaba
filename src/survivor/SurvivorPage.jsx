import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { D } from './data.js'
import { createRun, step, choose, previewTimes, isEdited, buildSummary, weaponDef, overtime, regionOf, enemyName, monsterName, lastChapter } from './game.js'
import { artUrl, artNow, loadArt, preloadRegion } from './story-art.js'
import { browserStorage, canFuse, createProgress, exportName, fuseAllPreview, parseBackup, statPrice, statValue, statMaxLevel, STATS } from './progress.js'
import { createRenderer, short } from './render.js'
import { specialOf } from './bosses.js'
import { PLATFORMS, MOVE_KEYS, keyVector, touchOnly } from './platform.js'
import { FRAMES, ART, SHEET_URLS, loadImages, spriteStyle } from './sprites.js'
import { GAMES } from '../data/games.js'
import * as audio from './audio.js'
import './survivor.css'
import saveIcon from '../colony/assets/ui/save.png'

// the weapon's picture in the sheet (data/weapons.json names it)
const weaponIcon = (id) => (weaponDef(D, id) || {}).icon || 'weapon_ball'
const OPTIONS = D.upgrades.options
const EFFECTS = D.balance.upgrades.effects
const GRADES = D.balance.grades
const GRADE_COLOR = D.ui.grades
const JOY = D.ui.joystick
// the platform this page is played on (platform.js): the phone game or the PC
// game. The screens below are the same for both; only how they are laid out
// (.ms--mobile / .ms--pc), the battle's screen, field and HUD, its input and
// its backgrounds come from here.
const PlatformCtx = createContext(PLATFORMS.mobile)
const usePlatform = () => useContext(PlatformCtx)

// 전체 화면 (the PC game): on and off; nothing where the browser has none
function FullscreenButton() {
  const pf = usePlatform()
  const [on, setOn] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  if (pf.id !== 'pc' || !document.fullscreenEnabled) return null
  const toggle = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    if (p && p.catch) p.catch(() => {})
  }
  return (
    <button type="button" className="ms-btn ms-btn--small ms-fullbtn" onClick={toggle} aria-pressed={on}>
      {on ? '전체 화면 끝내기' : '전체 화면'}
    </button>
  )
}
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString()
const pctOf = (v) => `${fmt(v * 100, 1)}%`

// what a card really does: its effect straight from the balanceConfig (the
// same numbers the game applies), then what it is now → what it becomes
// (n: how many times it applies — Tizzzz's rewritten card does it more than once)
const effectTag = (id, n = 1) => {
  const e = EFFECTS[id]
  if (id === 'crit' || id === 'split') return `+${fmt(e.add * n * 100)}%p`
  if (id === 'regen') return `최대 체력의 +${fmt(e.addMaxHpShare * n * 100)}%/초`
  if (id === 'nyang') return n > 1 ? `고양이 Lv.+${n}` : '고양이'
  if (id === 'critDamage') return `+${fmt(e.add * n)}배`
  return `×${fmt(e.mul ** n, 4)}`
}
// coins: whole, with separators up to 99,999, then short (123K, 4.5M …)
const money = (n) => (n < 1e5 ? Math.floor(n).toLocaleString('ko-KR') : short(n))
const big = (n) => (n >= 1e6 ? n.toExponential(2).replace('+', '') : Math.round(n).toLocaleString('ko-KR'))
function change(run, id, times = 1) {
  const w = run.weapon
  const p = run.player
  const n = previewTimes(run, id, times)
  switch (id) {
    case 'count':
      return `한 번에 ${big(w.count)}개 → ${big(n.count)}개`
    case 'interval':
      return `${fmt(w.interval, 4)}초마다 → ${fmt(n.interval, 4)}초마다`
    case 'damage':
      return `피해 ${big(w.damage)} → ${big(n.damage)}`
    case 'bounce':
      return `반사 ${big(w.bounces)}회 → ${big(n.bounces)}회`
    case 'maxHp':
      return `최대 체력 ${Math.round(p.maxHp)} → ${Math.round(n.maxHp)} · 체력 +${Math.round(n.hp - p.hp)}`
    case 'move':
      return `이동 속도 ${Math.round(p.speed)} → ${Math.round(n.speed)}`
    case 'crit':
      return `치명타 ${pctOf(w.critChance)} → ${pctOf(n.critChance)}`
    case 'critDamage':
      return `치명타 피해 ×${fmt(w.critMul)} → ×${fmt(n.critMul)}`
    case 'ballSpeed':
      return `공 속도 ${Math.round(w.speed)} → ${Math.round(n.ballSpeed)}`
    case 'size':
      return `공 지름 ${fmt(w.radius * 2)} → ${fmt(n.radius * 2)}`
    case 'pickup':
      return `획득 반경 ${Math.round(p.pickupR)} → ${Math.round(n.pickupR)}`
    case 'split':
      return `분열 ${pctOf(w.splitChance)} → ${pctOf(n.splitChance)}`
    case 'luck':
      return `코인 획득 ×${fmt(p.coinMul, 2)} → ×${fmt(n.coinMul, 2)}`
    case 'regen':
      return `초당 최대 체력의 ${pctOf(p.regen)} → ${pctOf(n.regen)} (${big(p.regen * p.maxHp)} → ${big(n.regen * p.maxHp)})`
    case 'armor':
      return `받는 피해 ${pctOf(p.armor)} → ${pctOf(n.armor)}`
    case 'xpGain':
      return `경험치 ×${fmt(p.xpMul, 2)} → ×${fmt(n.xpMul, 2)}`
    case 'nyang':
      return times > 1 ? nyangJump(run.nyang, run.nyang + times) : nyangText(run.nyang + 1)
    default:
      return ''
  }
}

// where Mano stands in this run (for the level-up cards): every number a
// card can change, as it is now, then the cards picked so far
function RunStats({ run }) {
  const w = run.weapon
  const p = run.player
  const rows = [
    ['체력', `${big(p.hp)} / ${big(p.maxHp)}`],
    ['피해', big(w.damage)],
    ['공 개수', `${big(w.count)}개`],
    ['발사 간격', `${fmt(w.interval, 4)}초`],
    ['반사', `${big(w.bounces)}회`],
    ['치명타', pctOf(w.critChance)],
    ['치명타 피해', `×${fmt(w.critMul)}`],
    ['분열', pctOf(w.splitChance)],
    ['공 속도', Math.round(w.speed)],
    ['공 지름', fmt(w.radius * 2)],
    ['이동 속도', Math.round(p.speed)],
    ['획득 반경', Math.round(p.pickupR)],
    ['받는 피해', pctOf(p.armor)],
    ['초당 회복', `${pctOf(p.regen)} (${big(p.regen * p.maxHp)})`],
    ['코인', `×${fmt(p.coinMul, 2)}`],
    ['경험치', `×${fmt(p.xpMul, 2)}`],
  ]
  if (run.nyang > 0) rows.push(['냥냥 연금술', `Lv.${run.nyang}`])
  const build = buildSummary(run)
  return (
    <div className="ms-runstats">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {build.length > 0 && (
        <ul className="ms-build" aria-label="이번 판에 고른 강화">
          {build.map((b) => (
            <li key={b.id}>
              <Sprite name={b.icon} size={18} />
              {b.name} ×{b.n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 냥냥 연금술: what level L brings, from the table in balance.json
function nyangText(L) {
  const T = EFFECTS.nyang.levels
  const now = T[L - 1]
  const pct = (v) => `${fmt(v * 100)}%`
  if (L === 1) return `Lv.1 · 고양이가 일반 하트를 먹고 ${pct(now.share)} 회복 하트 ${now.hearts}개를 생성합니다.`
  const was = T[L - 2]
  const parts = []
  if (now.hearts !== was.hearts) parts.push(`퍼센트 하트 생성량이 ${now.hearts}개로`)
  if (now.share !== was.share) parts.push(`퍼센트 하트 회복량이 ${pct(now.share)}로`)
  return `Lv.${L} · ${parts.join(', ')} 증가합니다.`
}

// the lobby's sticker of Mano and her red ball (cut from the lobby mockup)
const LOBBY_IMG = {
  mano: new URL('./assets/lobby/mano_ball.webp', import.meta.url).href,
}

// a picture of the story package by its id (story-assets.json); loads when
// shown, the browser keeps it
function Art({ id, className = '', alt = '' }) {
  const src = artUrl(id)
  return src ? <img className={className} src={src} alt={alt} draggable="false" decoding="async" /> : null
}

// the red ball's picture for a weapon item: plain up to A, with a gold band
// at S, with stars from SS, the demon king's for 마왕의 탱탱볼
const ballArt = (it) => (it.tag === 'demon' ? 'ball_demon' : GRADES.indexOf(it.grade) >= GRADES.indexOf('SS') ? 'ball_ss' : it.grade === 'S' ? 'ball_s' : 'ball_base')
const itemName = (it) => (it.tag === 'demon' ? '마왕의 탱탱볼' : weaponName(it.weaponId))
function ItemIcon({ item, size }) {
  if (item.weaponId !== D.weapons.initialWeaponId) return <Sprite name={weaponIcon(item.weaponId)} size={size} />
  return <img className="ms-ballart" src={artUrl(ballArt(item))} alt="" style={{ width: size, height: size }} draggable="false" decoding="async" />
}

// 냥냥 연금술 several levels at once (Tizzzz's rewrite)
function nyangJump(from, to) {
  const L = EFFECTS.nyang.levels[to - 1]
  return `Lv.${from} → Lv.${to} · 일반 하트 1개 → ${fmt(L.share * 100)}% 회복 하트 ${L.hearts}개`
}


// the best record's crown (drawn here: the art package has none)
function Crown() {
  return (
    <svg className="ms-crown" viewBox="0 0 24 18" aria-hidden="true">
      <path d="M2 15h20l1.5-11-6 4.5L12 1 6.5 8.5.5 4z" fill="#d9a441" stroke="#2f2537" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

// Tizzzz's pen (drawn here: the art package has no pen)
function Pen() {
  return (
    <svg className="ms-penicon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 21l3.5-1 12-12-2.5-2.5-12 12z" fill="#2f2537" />
      <path d="M15.5 5.5l2.5 2.5 2-2a1.77 1.77 0 0 0-2.5-2.5z" fill="#c93c86" />
      <path d="M3 21l1-3.5 2.5 2.5z" fill="#f2c14e" />
    </svg>
  )
}

// the picked card, drawn once more where it was, over the battle that has
// already gone on: it swells to 110%, a small flash and six sparks leave its
// middle, its effect lights up, and all of it is gone within 0.5 s (CSS only,
// never takes a tap)
const PICK_FX_MS = 500
function PickFx({ fx }) {
  return (
    <div className="ms-pickfx" style={{ left: fx.x, top: fx.y, width: fx.w, height: fx.h }} aria-hidden="true">
      <div className="ms-card ms-pickfx__card">
        <span className="ms-card__icon">
          <Sprite name={fx.icon} size={36} />
        </span>
        <span className="ms-card__body">
          <span className="ms-card__name">{fx.name}</span>
          <span className="ms-card__num">
            <b className="ms-pickfx__tag">{fx.tag}</b> {fx.text}
          </span>
        </span>
      </div>
      <span className="ms-pickfx__flash" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <span key={a} className="ms-pickfx__spark" style={{ '--a': `${a + 30}deg` }} />
      ))}
    </div>
  )
}

// a fusion lands (already saved; this only shows it): the pieces fly in to
// the new one from `from` (px from its middle), a small flash, the new one
// swells to 115% and settles — 0.42 s, never takes a tap. The new one stays.
const FUSE_FX_MS = 450
function FuseBurst({ icon, grade, from, size = 40 }) {
  return (
    <span className="ms-burst" style={{ '--g': GRADE_COLOR[grade] }} aria-hidden="true">
      {from.map((p, i) => (
        <span key={i} className="ms-burst__in" style={{ '--x': `${p.x}px`, '--y': `${p.y}px` }}>
          <Sprite name={icon} size={Math.round(size * 0.7)} />
        </span>
      ))}
      <span className="ms-burst__flash" />
      {[18, 90, 162, 234, 306].map((a) => (
        <span key={a} className="ms-burst__spark" style={{ '--a': `${a}deg` }} />
      ))}
      <span className="ms-burst__out">
        <Sprite name={icon} size={size} />
      </span>
    </span>
  )
}

// an important button that worked: a short ring of light around it
function popButton(el) {
  if (!el) return
  el.classList.remove('is-pop')
  void el.offsetWidth // restart the animation on a quick second tap
  el.classList.add('is-pop')
}

// one frame of the art as a DOM box `size` px on its long side
function Sprite({ name, size, flip, whole, className = '' }) {
  return <span className={`ms-sprite ${className}`} style={spriteStyle(name, size, { whole, flip })} aria-hidden="true" />
}

// A bar from the UI sheet `w` × `h` px: its two ends drawn as they are and
// only the middle stretched (sideways), so the frame keeps its shape at any
// length. Every bar frame is cut by the empty bar's box, so they line up.
const BAR_BOX = FRAMES.hp_empty.contentBounds
const CAP = 12 // art px at each end that are never stretched
function barLayer(name, w, h) {
  const f = FRAMES[name]
  const sh = ART.sheets[f.sheet]
  const s = h / BAR_BOX.h
  const cap = CAP * s
  const mid = Math.max(0, w - 2 * cap)
  const sx = mid / (BAR_BOX.w - 2 * CAP)
  const x0 = f.rect.x + BAR_BOX.x
  const y0 = (f.rect.y + BAR_BOX.y) * s
  const url = `url(${SHEET_URLS[f.sheet]})`
  const part = (left, width, ax, scaleX) => ({
    left,
    width,
    height: h,
    backgroundImage: url,
    backgroundSize: `${sh.width * scaleX}px ${sh.height * s}px`,
    backgroundPosition: `${-ax * scaleX}px ${-y0}px`,
  })
  return [part(0, cap, x0, s), part(cap, mid, x0 + CAP, sx), part(cap + mid, cap, x0 + BAR_BOX.w - CAP, s)]
}
function Bar({ w, h, fill, value, label }) {
  const v = Math.max(0, Math.min(1, value))
  // the full bar is cut off where the value ends, inside the frame's own ends
  const cap = CAP * (h / BAR_BOX.h)
  const right = w - (cap * 0.6 + (w - cap * 1.2) * v)
  return (
    <span className="ms-bar" style={{ width: w, height: h }} role="meter" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {barLayer('hp_empty', w, h).map((st, i) => (
        <i key={i} style={st} />
      ))}
      <span className="ms-bar__fill" style={{ clipPath: `inset(0 ${Math.max(0, right)}px 0 0)` }}>
        {barLayer(fill, w, h).map((st, i) => (
          <i key={i} style={st} />
        ))}
      </span>
    </span>
  )
}

const weaponName = (id) => (weaponDef(D, id) || { name: id }).name

function Grade({ g }) {
  return (
    <span className="ms-grade" style={{ '--g': GRADE_COLOR[g] }}>
      {g}
    </span>
  )
}

// the weapons owned, by kind and grade, with how many of each
function groupInventory(save) {
  const groups = new Map()
  for (const it of save.inventory) {
    // 마왕의 탱탱볼 is its own line, never with the plain EX ones
    const k = it.weaponId + ':' + it.grade + ':' + (it.tag || '')
    if (!groups.has(k)) groups.set(k, { weaponId: it.weaponId, grade: it.grade, tag: it.tag, key: k, items: [] })
    groups.get(k).items.push(it)
  }
  return [...groups.values()].sort((a, b) => GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade) || !!b.tag - !!a.tag)
}

// what a coin stat shows: its value now and after one more level
// a multiplier that can grow without end: ×1.082, then ×1,234, then ×1.23e6
const times = (x) => `×${x < 1000 ? fmt(x, 3) : big(x)}`
const secs = (x) => `${x >= 0.001 ? fmt(x, 3) : x.toExponential(1)}초`

function statText(stat, L) {
  const s = D.balance.perma.stats[stat]
  const v = (l) => statValue(D, stat, l)
  const P = D.balance.player
  const w = D.weapons.registry[0].base
  switch (stat) {
    case 'hp':
      return [big(P.hp * v(L)), big(P.hp * v(L + 1))]
    case 'damage':
      return [times(v(L)), times(v(L + 1))]
    case 'move':
      return [`${fmt(P.speed * v(L))}`, `${fmt(P.speed * v(L + 1))}`]
    case 'interval':
      return [secs(w.interval * v(L)), secs(w.interval * v(L + 1))]
    case 'crit':
      return [pctOf(v(L)), pctOf(Math.min(s.max, v(L + 1)))]
    case 'coins':
      return [times(v(L)), times(v(L + 1))]
    default:
      return ['', '']
  }
}

// platform: 'mobile' (#/game/mano-survivor) or 'pc' (#/game/mano-survivor-pc)
export default function SurvivorPage({ platform = 'mobile', exitHref = '#/' }) {
  const pf = PLATFORMS[platform] || PLATFORMS.mobile
  return (
    <PlatformCtx.Provider value={pf}>
      <Game exitHref={exitHref} />
    </PlatformCtx.Provider>
  )
}

function Game({ exitHref }) {
  const pf = usePlatform()
  const P = useRef(null)
  const [img, setImg] = useState(null)
  const [error, setError] = useState('')
  const [screen, setScreen] = useState('loading') // loading | lobby | battle | fusion
  const [tab, setTab] = useState('go') // go | gear | stats
  const [save, setSave] = useState(null)
  const [notice, setNotice] = useState('')
  const [chapter, setChapter] = useState(1)
  const [modal, setModal] = useState(null) // { kind: 'pause' | 'quit' | 'result' | 'chest' }
  const [, setBeat] = useState(0)
  const G = useRef({ run: null, runId: null, input: { x: 0, y: 0 }, paid: false, choosing: false })
  // the PC game's menus are laid out at one size (1280 × 720) and scaled to
  // the window as a whole (CSS zoom: text stays sharp at any size)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    if (!pf.design) return
    const [dw, dh] = pf.design
    const fit = () => setZoom(Math.min(innerWidth / dw, innerHeight / dh))
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [pf])
  // the PC game on a phone or tablet: it needs a keyboard, the phone game is
  // the one to play there (it may still go on)
  const [touchNote, setTouchNote] = useState(() => pf.input === 'keys' && touchOnly())

  const refresh = useCallback(() => setSave(P.current.get()), [])

  // boot: images and the saved pocket
  useEffect(() => {
    P.current = createProgress(D, browserStorage())
    const b = P.current.boot()
    setSave(b.data)
    // rewards a save from before the story got for chapters it had cleared
    const news = b.data.story.news
    if (news.length) {
      setNotice(`이미 깬 장의 이야기 보상을 받았어요: ${news.map((rid) => D.story.rewards[rid].lines[0].replace(/[!.]$/, '')).join(' · ')}`)
      P.current.clearNews()
    }
    setChapter(Math.max(1, Math.min(b.data.unlockedChapter, LAST_CHAPTER)))
    if (b.lostRun) setNotice('지난 판은 끝나지 않은 채 닫혔어요. 그때까지 받은 엘리트·보스 보상은 그대로예요.')
    else if (!P.current.available) setNotice('이 브라우저에서는 저장할 수 없어요. 플레이는 가능하지만 진행이 남지 않아요.')
    // the game's fonts (survivor.css): asked for now, so the battle's numbers
    // (drawn on the canvas) have them from the first fight
    document.fonts?.load?.("16px 'Jua'").catch(() => {})
    loadImages()
      .then((i) => {
        setImg(i)
        setScreen('lobby')
        // a chapter's clear cutscene that was cut short (the page closed in
        // the middle) plays now; its reward was given with the clear
        const left = leftoverCuts(P.current.get())
        if (left.length) setModal({ kind: 'cut', groups: left.map((g) => g.id) })
      })
      .catch((e) => setError(e.message))
    // the page behind does not scroll while the game is open
    const root = document.documentElement
    const prev = [root.style.overflow, document.body.style.overflow]
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    // sound may start only after a touch: the first one (and any later one,
    // after the phone put the page to sleep) wakes it
    const wake = () => audio.unlock()
    addEventListener('pointerdown', wake, true)
    addEventListener('keydown', wake, true)
    return () => {
      ;[root.style.overflow, document.body.style.overflow] = prev
      removeEventListener('pointerdown', wake, true)
      removeEventListener('keydown', wake, true)
      audio.stopAll()
    }
  }, [])

  // the music: the battle tune while a fight is on, the menu tune everywhere
  // else (lobby, gear, fusion, the result); the pause menu lowers the battle tune
  const fighting = screen === 'battle' && G.current.run && G.current.run.state !== 'over'
  const tune = screen === 'loading' ? null : fighting ? 'battle' : 'menu'
  useEffect(() => audio.music(tune), [tune])
  const paused = fighting && !!modal && (modal.kind === 'pause' || modal.kind === 'quit')
  useEffect(() => audio.duck(paused), [paused])
  useEffect(() => audio.setSfxOn(!save || save.sound !== false), [save])

  const equipped = save && (save.inventory.find((it) => it.id === save.equippedInstanceId) || save.inventory[0])

  const start = (ch = chapter) => {
    // the lobby shows the next locked chapter, but never starts it
    if (ch > P.current.get().unlockedChapter || ch > LAST_CHAPTER) return
    const r = P.current.startRun(ch)
    if (!r.weapon) return setNotice('장착할 무기가 없어요.')
    const g = G.current
    g.runId = r.runId
    g.chapter = ch
    g.paid = false
    g.choosing = false
    g.input = { x: 0, y: 0 }
    g.run = createRun(D, { chapter: ch, weaponId: r.weapon.weaponId, grade: r.weapon.grade, seed: (Math.random() * 2 ** 31) | 0, runId: r.runId, perma: r.perma, cats: r.cats, tizzzz: r.tizzzz, blessings: r.blessings, arena: pf.arena, bossBag: BOSS_BAG })
    g.saved = 0 // rewards of this run already saved
    g.earned = { chests: 0, coins: 0 } // what the elites and the boss gave
    g.reward = null
    // the story: what this chapter still has to show (seen ones never again).
    // Only before the fight (enter) and after it (clear): nothing stops a
    // fight once it has begun (the story's 'time' and 'boss' groups are kept
    // in the data but not played; a special boss is announced by WARNING!)
    const seen = new Set(P.current.get().story.seen)
    g.seen = seen
    preloadRegion(g.run.region, pf.background)
    const enter = CUT_GROUPS.filter((c) => c.chapter === ch && c.when === 'enter' && !seen.has(c.id))
    setModal(enter.length ? { kind: 'cut', groups: enter.map((c) => c.id) } : null)
    setScreen('battle')
    refresh()
  }

  // the chapter after a cleared one (it is open now), or the same at the last
  const nextChapter = (ch) => {
    const n = Math.min(LAST_CHAPTER, ch + 1)
    return n <= P.current.get().unlockedChapter ? n : ch
  }
  // leaving a fight's end: after a clear the lobby has the next chapter
  // chosen (its card, picture and start button); the chapter's clear
  // cutscene (once ever) plays first, after the rewards were shown
  const leaveResult = (then) => {
    const g = G.current
    const groups = g.clearCuts || []
    g.clearCuts = null
    if (g.run && g.run.result && g.run.result.cleared) setChapter(nextChapter(g.chapter))
    if (groups.length) setModal({ kind: 'cut', groups, then })
    else then()
  }

  // ── chests: one, or all at once; the results show, then back ──
  const openChests = (all) => {
    const g = G.current
    if (g.opening) return
    g.opening = true
    const d = P.current.get()
    const results = all ? P.current.openAll() : d.chests[0] ? [P.current.openChest(d.chests[0].id)].filter(Boolean) : []
    g.opening = false
    refresh()
    if (results.length) setModal((m) => ({ kind: 'chest', results, after: m && m.kind !== 'chest' ? m : m && m.after }))
  }

  if (error)
    return (
      <div className={`ms ms--${pf.id} ms--screen`}>
        <p>{error}</p>
        <a className="ms-btn" href={exitHref}>
          사이트로 돌아가기
        </a>
      </div>
    )

  // every button answers with a short sound (data-sfx picks which; "none"
  // when the button makes its own), a button that cannot be used with a dull one
  const onClickCapture = (e) => {
    const b = e.target.closest && e.target.closest('button, a.ms-btn, a.ms-exit')
    if (!b || b.disabled) return
    const name = b.dataset.sfx || 'tap'
    if (name !== 'none') audio.sfx(name)
  }
  // (a disabled button lets the touch through to what is under it — browsers
  // send it nothing — so the one under the finger is found by its box)
  const onPointerDownCapture = (e) => {
    for (const b of e.currentTarget.querySelectorAll('button:disabled')) {
      const r = b.getBoundingClientRect()
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        if (b.offsetParent) audio.sfx('deny')
        return
      }
    }
  }

  return (
    <div className={`ms ms--${pf.id}`} style={pf.design ? { '--z': zoom } : undefined} onClickCapture={onClickCapture} onPointerDownCapture={onPointerDownCapture}>
      {screen === 'loading' && <div className="ms-loading">마노가 주머니를 챙기는 중…</div>}
      {touchNote && screen !== 'battle' && (
        <div className="ms-modal ms-touchnote" role="dialog" aria-modal="true" aria-label="PC 전용">
          <div className="ms-panel ms-menu">
            <h2 className="ms-h">PC 전용 데모예요</h2>
            <p className="ms-dim ms-center">키보드(WASD·방향키)로 움직이는 버전이에요. 휴대폰·태블릿에서는 모바일 버전을 플레이해 주세요.</p>
            <a className="ms-btn ms-btn--primary" href={GAMES.survivor.href}>
              모바일 버전으로 가기
            </a>
            <button type="button" className="ms-btn" onClick={() => setTouchNote(false)}>
              그래도 계속
            </button>
          </div>
        </div>
      )}
      {screen === 'lobby' && save && (
        <Lobby
          tab={tab}
          setTab={setTab}
          save={save}
          onReplay={(groups) => setModal({ kind: 'cut', groups, replay: true })}
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
          onFuseAll={() => {
            const r = P.current.fuseAll()
            refresh()
            return r
          }}
          P={P.current}
          onImported={(data) => {
            setSave(data)
            setChapter(Math.max(1, Math.min(data.unlockedChapter, LAST_CHAPTER)))
          }}
          onChests={openChests}
          onBuy={(stat, level) => {
            const r = P.current.buyStat(stat, level)
            refresh()
            return r
          }}
          exitHref={exitHref}
          saveError={P.current && P.current.error()}
        />
      )}
      {screen === 'fusion' && save && (
        <Fusion
          save={save}
          onBack={() => setScreen('lobby')}
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
          save={save}
          firstTime={save && !save.seenHelp}
          modal={modal}
          setModal={setModal}
          onRetry={() => leaveResult(() => start(G.current.chapter))}
          onNext={() => leaveResult(() => start(nextChapter(G.current.chapter)))}
          onEquip={() =>
            leaveResult(() => {
              setModal(null)
              setScreen('lobby')
              refresh()
            })
          }
          onChests={openChests}
          refresh={refresh}
          rerender={() => setBeat((x) => x + 1)}
        />
      )}
      {modal && modal.kind === 'cut' && (
        <Cutscene
          key={modal.groups.join(',')}
          groups={modal.groups}
          replay={!!modal.replay}
          onSeen={(id) => {
            P.current.markSeen(id)
            if (G.current.seen) G.current.seen.add(id)
          }}
          onDone={() => {
            refresh()
            setModal(modal.after || null)
            if (modal.then) modal.then()
          }}
        />
      )}
      {modal && modal.kind === 'chest' && (
        <div className="ms-modal" role="dialog" aria-modal="true">
          <div className="ms-panel ms-chest">
            <h2 className="ms-h">상자 {modal.results.length}개를 열었어요</h2>
            <Sprite name="chest_open" size={72} className="ms-chest__img" />
            <ul className="ms-loot">
              {modal.results.map((r) => (
                <li key={r.chestId}>
                  {r.items.map((it) => (
                    <span key={it.id} className="ms-loot__item">
                      <Sprite name={weaponIcon(it.weaponId)} size={24} />
                      {weaponName(it.weaponId)} <Grade g={it.grade} />
                    </span>
                  ))}
                  <span className="ms-loot__coins">
                    <Sprite name="coin" size={14} /> +{money(r.coins)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="ms-dim">무기는 주머니에 들어갔어요. 같은 무기·같은 등급 3개면 합성할 수 있어요.</p>
            {save && save.chests.length > 0 && (
              <button type="button" className="ms-btn" onClick={() => openChests(true)}>
                남은 상자 {save.chests.length}개 모두 열기
              </button>
            )}
            <button type="button" className="ms-btn ms-btn--primary" onClick={() => setModal(modal.after || null)}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── lobby: go · gear · Mano's stats ─────────────────────────────────────────

function Lobby({ tab, setTab, save, equipped, chapter, setChapter, notice, onNotice, onEquip, onStart, onFusion, onFuseAll, onChests, onBuy, P, onImported, onReplay, exitHref, saveError }) {
  const pf = usePlatform()
  const region = regionOf(D, chapter)
  const tabs = [
    ['go', '출발'],
    ['gear', '장비'],
    ['stats', '마노 강화'],
    ['settings', '설정'],
  ]
  return (
    <div className="ms-page ms-page--lobby" style={{ '--bg': `url(${artUrl(region.cover) || artUrl(pf.backdrop(region.background))})` }}>
      {/* the PC game: a rail at the left (these three) and the tab's own
          content beside it; on the phone neither wrapper is a box at all */}
      <div className="ms-lobby__rail">
        <header className="ms-top">
          <a className="ms-exit" href={exitHref}>
            ◀ 나가기
          </a>
          <FullscreenButton />
          <span className="ms-coins" aria-label={`코인 ${save.currency}`}>
            <Sprite name="coin" size={20} />
            {money(save.currency)}
          </span>
        </header>
        <h1 className="ms-title">{GAMES.survivor.title}</h1>
        <nav className="ms-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ms-tab ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>
              {label}
              {k === 'gear' && save.chests.length > 0 ? <em className="ms-tab__dot">{save.chests.length}</em> : null}
            </button>
          ))}
        </nav>
      </div>
      {/* notices: on the PC a layer over the top of the content (they never
          push it down: the page has a fixed height); on the phone in line */}
      {(notice || saveError) && (
        <div className="ms-notices" role="status">
          {notice && (
            <p className="ms-notice" onClick={onNotice}>
              {notice}
            </p>
          )}
          {saveError && <p className="ms-notice">저장되지 않았어요. (브라우저가 저장을 막았거나 공간이 부족해요)</p>}
        </div>
      )}
      <div className={`ms-lobby__body ms-lobby__body--${tab}`}>
        {tab === 'go' && <Go save={save} equipped={equipped} chapter={chapter} setChapter={setChapter} onStart={onStart} />}
        {tab === 'gear' && <Gear save={save} equipped={equipped} onEquip={onEquip} onFusion={onFusion} onFuseAll={onFuseAll} onChests={onChests} />}
        {tab === 'stats' && <Stats save={save} onBuy={onBuy} />}
        {tab === 'settings' && <Settings save={save} P={P} onImported={onImported} onReplay={onReplay} />}
      </div>
    </div>
  )
}

// 출발: the story's regions as episode cards (‹ › or a swipe to the one
// before or after; a card to pick it), the chosen one's line, record and
// chapters below, and the start button. The next locked chapter can be seen,
// never started. The story ends at the last region's last chapter (35).
const LAST_CHAPTER = lastChapter(D)
// the boss a chapter ends with: its special boss (an episode's 3rd and 5th
// chapters), else the region's boss
const chapterBoss = (region, ch) => {
  const sp = specialOf(D, region, ch)
  return sp ? D.story.monsters[sp.id].name : enemyName(D, region, 'boss')
}
// at most this many health bars of elites and bosses at once
const MAX_BARS = 4
// the ordinary bosses' types still to come, kept from one run to the next
// while the game is open (so in a row they go round all four)
const BOSS_BAG = { order: [] }
const REGIONS = D.story.regions
const rangeText = (r) => `${r.from}~${r.to}장`
// a chapter's picture in the strip: the region's monsters in turn, its boss last
const STRIP_ROLES = ['imp', 'spider', 'slime', 'brute', 'boss']
const stripArt = (r, n) => r.skins[n === r.to ? 'boss' : STRIP_ROLES[(n - r.from) % 4]]
const clock2 = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function Go({ save, equipped, chapter, setChapter, onStart }) {
  const pf = usePlatform()
  const best = save.bestResults[chapter]
  const unlocked = save.unlockedChapter
  const furthest = Math.min(LAST_CHAPTER, unlocked + 1)
  const locked = chapter > unlocked
  const swipe = useRef(null)
  const tapped = useRef(0) // when the fan last picked a card itself (its click is then not needed)
  const region = regionOf(D, chapter)
  const ep = REGIONS.indexOf(region)
  // this region's pictures start loading while its card is on show
  useEffect(() => {
    preloadRegion(region, pf.background)
  }, [region.id])
  // an episode: where it is played from now (its furthest open chapter; a
  // locked one shows its first)
  const pickEpisode = (i) => {
    const r = REGIONS[Math.max(0, Math.min(REGIONS.length - 1, i))]
    if (r === region) return
    setChapter(r.from > unlocked ? r.from : Math.min(r.to, unlocked))
  }
  const go = (n) => setChapter(Math.max(1, Math.min(furthest, n)))
  const regionDone = (r) => save.firstCleared.includes(r.to)
  // the strip: the region's chapters
  const strip = Array.from({ length: region.to - region.from + 1 }, (_, k) => region.from + k)
  const cats = save.cats.unlocked
  const catsOn = chapter >= D.balance.cats.activeFromChapter
  const tz = save.tizzzz.unlocked
  const tzOn = chapter >= D.balance.tizzzz.activeFromChapter
  return (
    <>
      <section
        className="ms-eps"
        aria-label="에피소드"
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY, card: e.target.closest('.ms-ep') })}
        onPointerUp={(e) => {
          const s1 = swipe.current
          swipe.current = null
          if (!s1) return
          const dx = e.clientX - s1.x
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s1.y) * 1.5) {
            const to = ep + (dx < 0 ? 1 : -1)
            if (to >= 0 && to < REGIONS.length) audio.sfx('tick')
            pickEpisode(to)
            return
          }
          // a tap or a click on the fan picks the card it went down on (a
          // little wobble while pressing does not change it): the card the
          // browser found there, else the one whose box holds that point
          // (the front one first; some browsers' hit test is off for tilted
          // cards in a zoomed page)
          if (Math.abs(dx) > 10 || Math.abs(e.clientY - s1.y) > 10 || e.target.closest('.ms-arrow')) return
          const cards = [...e.currentTarget.querySelectorAll('.ms-ep')]
          const at = s1.card ? { i: cards.indexOf(s1.card) } : null
          const hit =
            at && at.i >= 0
              ? at
              : cards
                  .map((c, i) => ({ i, r: c.getBoundingClientRect(), a: Math.abs(i - ep), seen: getComputedStyle(c).opacity !== '0' }))
                  .filter((c) => c.seen && s1.x >= c.r.left && s1.x <= c.r.right && s1.y >= c.r.top && s1.y <= c.r.bottom)
                  .sort((x, y) => x.a - y.a)[0]
          if (hit && hit.i !== ep) {
            audio.sfx('tick')
            tapped.current = performance.now()
            pickEpisode(hit.i)
          }
        }}
      >
        <div className="ms-eps__track">
          {REGIONS.map((r, i) => {
            const shut = r.from > unlocked
            return (
              <button
                key={r.id}
                type="button"
                data-sfx="none"
                className={`ms-ep is-a${Math.min(4, Math.abs(i - ep))}${i === ep ? ' is-on' : ''}${shut ? ' is-locked' : ''}`}
                style={{ '--d': i - ep, '--a': Math.abs(i - ep) }}
                aria-current={i === ep}
                aria-label={`에피소드 ${i + 1} ${r.name}${shut ? ' (잠김)' : ''}`}
                onClick={() => {
                  // (Enter / Space on a card, or a click the fan did not take)
                  if (performance.now() - tapped.current < 400 || i === ep) return
                  audio.sfx('tick')
                  pickEpisode(i)
                }}
              >
                <Art id={r.cover} className="ms-ep__art" />
                <span className="ms-ep__head">
                  <small>에피소드 {i + 1}</small>
                  <b>{r.name}</b>
                  <small>{rangeText(r)}</small>
                </span>
                {shut && <span className="ms-ep__tag">잠김</span>}
                {!shut && regionDone(r) && <span className="ms-ep__tag ms-ep__tag--done">클리어</span>}
              </button>
            )
          })}
        </div>
        <button type="button" className="ms-arrow ms-arrow--prev" data-sfx="tick" aria-label="이전 에피소드" disabled={ep <= 0} onClick={() => pickEpisode(ep - 1)}>
          ‹
        </button>
        <button type="button" className="ms-arrow ms-arrow--next" data-sfx="tick" aria-label="다음 에피소드" disabled={ep >= REGIONS.length - 1} onClick={() => pickEpisode(ep + 1)}>
          ›
        </button>
      </section>
      <section className="ms-epinfo">
        <div className="ms-epinfo__text">
          <p className="ms-epinfo__ep">
            에피소드 {ep + 1} · {rangeText(region)}
          </p>
          <h2 className="ms-epinfo__name">{region.name}</h2>
          <p className="ms-epinfo__blurb">{region.blurb}</p>
          {(cats || tz) && (
            <p className="ms-epinfo__crew">
              {cats &&
                D.cats.companions.map((c) => (
                  <span key={c.id} className="ms-crew__cat">
                    <Art id={c.image} alt={c.name} />
                  </span>
                ))}
              {tz && <Art id="tizzzz_face" className="ms-crew__face" alt={D.tizzzz.name} />}
              <span>
                {[cats && (catsOn ? '고양이들이 함께해요' : `고양이들은 ${D.balance.cats.activeFromChapter}장부터`), tz && (tzOn ? `${D.tizzzz.name}가 선택지를 고쳐 써 줘요` : `${D.tizzzz.name}는 ${D.balance.tizzzz.activeFromChapter}장부터`)].filter(Boolean).join(' · ')}
              </span>
            </p>
          )}
        </div>
        <dl className="ms-epinfo__rec">
          <div>
            <dt>
              <Crown /> 최고 기록
            </dt>
            <dd>{best ? (best.cleared ? '클리어' : `${clock2(best.time)} 버팀`) : '-'}</dd>
          </div>
          <div>
            <dt>처치</dt>
            <dd>{best ? best.kills : '-'}</dd>
          </div>
          <div>
            <dt>엘리트</dt>
            <dd>{best ? best.elites : '-'}</dd>
          </div>
          <div>
            <dt>보스</dt>
            <dd>{chapterBoss(region, chapter)}</dd>
          </div>
        </dl>
        <div className="ms-epinfo__go">
          <img className="ms-lobbymano" src={LOBBY_IMG.mano} alt="" draggable="false" />
          <button type="button" className="ms-btn ms-btn--primary ms-btn--big ms-startbtn" data-sfx="go" onClick={onStart} disabled={!equipped || locked}>
            {locked ? `${chapter - 1}장을 깨면 열려요` : `${chapter}장 출발`}
          </button>
        </div>
      </section>
      <section className="ms-chapters" aria-label={`${region.name}의 장`}>
        {strip.map((n) => {
          const open = n <= furthest
          return (
            <button
              key={n}
              type="button"
              data-sfx="tick"
              className={`ms-chapter${n === chapter ? ' is-on' : ''}${n > unlocked ? ' is-locked' : ''}`}
              style={{ '--ground': `url(${artUrl(pf.background(region.background))})` }}
              disabled={!open}
              aria-current={n === chapter}
              onClick={() => go(n)}
            >
              <span className="ms-chapter__no">{n}장</span>
              <Art id={stripArt(region, n)} className="ms-chapter__art" />
              {save.firstCleared.includes(n) && <span className="ms-chapter__done">✓</span>}
            </button>
          )
        })}
      </section>
    </>
  )
}

// "C 9개 · B 3개 · A 1개", highest grade last
const madeText = (made) =>
  GRADES.filter((g) => made[g])
    .map((g) => `${g} ${made[g]}개`)
    .join(' · ')

function Gear({ save, equipped, onEquip, onFusion, onFuseAll, onChests }) {
  const groups = groupInventory(save)
  const [fused, setFused] = useState(null)
  const [popped, setPopped] = useState(null) // the item just equipped: its icon hops once
  const plan = fuseAllPreview(D, save)
  return (
    <>
      {save.chests.length > 0 && (
        <section className="ms-panel ms-row ms-chests">
          <Sprite name="chest_closed" size={40} />
          <span className="ms-sub">상자 {save.chests.length}개</span>
          <button type="button" className="ms-btn ms-btn--small" onClick={() => onChests(false)}>
            하나 열기
          </button>
          <button type="button" className="ms-btn ms-btn--small ms-btn--primary" onClick={() => onChests(true)}>
            모두 열기
          </button>
        </section>
      )}
      <section className="ms-panel">
        <div className="ms-row">
          <h3 className="ms-sub">보유 무기</h3>
          <span className="ms-row">
            <button type="button" className="ms-btn ms-btn--small" onClick={onFusion}>
              합성
            </button>
            <button
              type="button"
              className="ms-btn ms-btn--small ms-btn--primary"
              data-sfx="none"
              disabled={!plan.ok}
              onClick={(e) => {
                // a second tap finds nothing left to fuse
                const r = onFuseAll()
                if (r.ok) {
                  audio.sfx('fuse')
                  popButton(e.currentTarget)
                  setFused({ ...r, key: performance.now() })
                } else audio.sfx('deny')
              }}
            >
              모두 합성
            </button>
          </span>
        </div>
        {plan.ok && <p className="ms-dim">모두 합성하면: {madeText(plan.made)}</p>}
        {fused && (
          <div className="ms-fused">
            <span className="ms-fused__icon">
              <FuseBurst
                key={fused.key}
                icon={weaponIcon(fused.equipped ? fused.equipped.weaponId : 'bouncy_ball')}
                grade={fused.equipped ? fused.equipped.grade : GRADES.filter((g) => fused.made[g]).pop()}
                from={[
                  { x: -46, y: 6 },
                  { x: 0, y: -30 },
                  { x: 46, y: 6 },
                ]}
                size={34}
              />
            </span>
            <p className="ms-ok">
              {madeText(fused.made)} 완성!{fused.equipped ? ` ${weaponName(fused.equipped.weaponId)} ${fused.equipped.grade} 장착!` : ''}
            </p>
          </div>
        )}
        <ul className="ms-inv">
          {groups.map((g) => {
            const on = equipped && g.items.some((it) => it.id === equipped.id)
            return (
              <li key={g.key}>
                <button
                  type="button"
                  className={`ms-inv__item ${on ? 'is-on' : ''}`}
                  style={{ '--g': GRADE_COLOR[g.grade] }}
                  onClick={() => {
                    if (!on) setPopped({ id: g.key, key: performance.now() })
                    onEquip(g.items[0].id)
                  }}
                  aria-pressed={on}
                >
                  <span key={popped && popped.id === g.key ? popped.key : 'still'} className={popped && popped.id === g.key ? 'ms-hop' : undefined}>
                    <ItemIcon item={g.items[0]} size={30} />
                  </span>
                  <span>
                    {itemName(g.items[0])} <Grade g={g.grade} />
                  </span>
                  <small>
                    ×{g.items.length}
                    <br />
                    {on ? '장착 중' : '장착'}
                  </small>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="ms-dim">같은 무기·같은 등급 3개를 합성하면 다음 등급 1개가 돼요. 모두 합성은 낮은 등급부터 3개씩 계속 합쳐 올려요. 등급은 출발할 때의 기본 피해를 높여요 (D ×1 … EX ×{D.balance.gradeMultipliers[D.balance.gradeMultipliers.length - 1]}).</p>
      </section>
      <Blessings save={save} />
    </>
  )
}

// the story's blessings and keepsakes: those earned in colour, the others
// greyed with the chapter that brings them
function Blessings({ save }) {
  const owned = (b) =>
    b.id === 'cats' ? save.cats.unlocked : b.id === 'tizzzz' ? save.tizzzz.unlocked : b.id === 'spring' ? save.story.rewards.includes('snow') : !!save.blessings[b.id]
  return (
    <section className="ms-panel">
      <h3 className="ms-sub">축복과 보물</h3>
      <ul className="ms-bless">
        {D.story.blessings.list.map((b) => {
          const on = owned(b)
          return (
            <li key={b.id} className={on ? 'is-on' : ''}>
              <Art id={b.image} className="ms-bless__img" />
              <div>
                <p className="ms-bless__name">{b.name}</p>
                <p className="ms-dim">{on ? b.text : `${D.story.rewards[b.from].chapter}장을 깨면 얻어요`}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── settings: when it last saved, backup files ──────────────────────────────

const STORAGE_NOTICE =
  '진행 상황은 현재 기기와 브라우저에만 저장됩니다. 다른 기기·브라우저에서는 자동으로 이어지지 않습니다. 브라우저 데이터 삭제 전 백업을 내보내세요.'
const SAVE_ERRORS = {
  unavailable: '이 브라우저에서는 저장할 수 없어요 (사생활 보호 모드이거나 저장이 막혀 있어요).',
  full: '브라우저 저장 공간이 가득 차서 저장하지 못했어요.',
  blocked: '브라우저가 저장을 막았어요.',
}
const clock = (t) => new Date(t).toLocaleTimeString('ko-KR')

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

function Settings({ save, P, onImported, onReplay }) {
  const file = useRef(null)
  const [snd, setSnd] = useState(audio.getPrefs)
  const setAudio = (p) => {
    audio.setPrefs(p)
    setSnd(audio.getPrefs())
  }
  const [msg, setMsg] = useState(null) // { text, bad }
  const [pending, setPending] = useState(null) // a checked backup waiting for "불러오기"
  const err = P.error()
  const at = P.savedAt()
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    let text = ''
    try {
      text = await f.text()
    } catch {
      return setMsg({ text: '파일을 읽지 못했어요.', bad: true })
    }
    const r = parseBackup(D, text)
    setPending(r.ok ? r : null)
    setMsg(r.ok ? null : { text: r.error, bad: true })
  }
  return (
    <>
      <section className={`ms-panel ms-savebox ${err ? 'is-bad' : ''}`}>
        <img src={saveIcon} alt="" />
        <div>
          <p className="ms-sub">{err ? '저장 불가' : at ? `자동 저장됨 · ${clock(at)}` : '자동 저장'}</p>
          <p className="ms-dim">
            {err
              ? `${SAVE_ERRORS[err] || '저장하지 못했어요.'} 진행을 잃지 않도록 백업 파일을 내보내 두세요.`
              : '보상·상자·합성·강화·장착 직후에 바로 저장해요.'}
          </p>
        </div>
      </section>
      <section className="ms-panel">
        <p className="ms-text">{STORAGE_NOTICE}</p>
        <div className="ms-row ms-row--two">
          <button
            type="button"
            className="ms-btn ms-btn--primary"
            onClick={() => {
              download(P.exportText(), exportName())
              setMsg({ text: '백업 파일을 내보냈어요.' })
            }}
          >
            백업 내보내기
          </button>
          <button type="button" className="ms-btn" onClick={() => file.current && file.current.click()}>
            백업 불러오기
          </button>
        </div>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={onFile} />
        {pending && (
          <div className="ms-confirm">
            <p className="ms-sub">이 백업을 불러올까요?</p>
            <p className="ms-dim">
              {pending.exportedAt ? `${new Date(pending.exportedAt).toLocaleString('ko-KR')}에 내보낸 백업 · ` : ''}
              코인 {money(pending.summary.coins)} · {pending.summary.chapter}장까지 · 무기 {pending.summary.weapons}개 (최고 {pending.summary.best}) · 상자 {pending.summary.chests}개
            </p>
            <p className="ms-dim">
              지금 진행(코인 {money(save.currency)} · {save.unlockedChapter}장까지)은 이 백업으로 바뀌어요. 지금 진행은 브라우저에 따로 보관해 둬요.
            </p>
            <div className="ms-row ms-row--two">
              <button type="button" className="ms-btn" onClick={() => setPending(null)}>
                취소
              </button>
              <button
                type="button"
                className="ms-btn ms-btn--primary"
                onClick={() => {
                  const ok = P.importBackup(pending.data)
                  setPending(null)
                  onImported(P.get())
                  setMsg(ok ? { text: '백업을 불러왔어요.' } : { text: '불러왔지만 저장하지 못했어요. 이 브라우저에서는 저장이 막혀 있어요.', bad: true })
                }}
              >
                불러오기
              </button>
            </div>
          </div>
        )}
        {msg && <p className={msg.bad ? 'ms-why' : 'ms-ok'}>{msg.text}</p>}
      </section>
      <StoryReplay save={save} onReplay={onReplay} />
      <section className="ms-panel ms-sound">
        <div className="ms-row">
          <span className="ms-sub">배경음악</span>
          <button type="button" className="ms-btn ms-btn--small" aria-pressed={snd.musicOn} onClick={() => setAudio({ musicOn: !snd.musicOn })}>
            {snd.musicOn ? '켜짐' : '꺼짐'}
          </button>
        </div>
        <input
          type="range"
          className="ms-volume"
          min="0"
          max="100"
          step="5"
          value={Math.round(snd.music * 100)}
          aria-label="배경음악 크기"
          disabled={!snd.musicOn}
          onChange={(e) => setAudio({ music: +e.target.value / 100 })}
        />
        <div className="ms-row">
          <span className="ms-sub">효과음</span>
          <button
            type="button"
            className="ms-btn ms-btn--small"
            aria-pressed={save.sound}
            onClick={() => {
              P.setSound(!save.sound)
              onImported(P.get())
            }}
          >
            {save.sound ? '켜짐' : '꺼짐'}
          </button>
        </div>
        <input
          type="range"
          className="ms-volume"
          min="0"
          max="100"
          step="5"
          value={Math.round(snd.sfx * 100)}
          aria-label="효과음 크기"
          disabled={!save.sound}
          onChange={(e) => setAudio({ sfx: +e.target.value / 100 })}
          onPointerUp={() => audio.sfx('tap')}
        />
        <p className="ms-dim">소리는 화면을 처음 누른 뒤부터 나와요 (브라우저 규칙). 음악 크기는 이 브라우저에만 저장돼요.</p>
      </section>
    </>
  )
}

// the cutscenes already seen, region by region, to watch again (nothing is
// given or saved by watching)
function StoryReplay({ save, onReplay }) {
  const seen = CUT_GROUPS.filter((g) => save.story.seen.includes(g.id))
  const byRegion = D.story.regions.map((r) => ({ r, groups: seen.filter((g) => regionOf(D, g.chapter).id === r.id) })).filter((x) => x.groups.length)
  return (
    <section className="ms-panel">
      <h3 className="ms-sub">이야기 다시 보기</h3>
      {byRegion.length ? (
        <div className="ms-replay">
          {byRegion.map(({ r, groups }) => (
            <button key={r.id} type="button" className="ms-btn ms-btn--small" onClick={() => onReplay(groups.map((g) => g.id))}>
              {r.name} ({groups.reduce((n, g) => n + g.cuts.length, 0)}컷)
            </button>
          ))}
        </div>
      ) : (
        <p className="ms-dim">본 이야기가 여기에 모여요.</p>
      )}
    </section>
  )
}

// taps closer together than this count as one (a double tap)
const TAP_GAP = 350

function Stats({ save, onBuy }) {
  const last = useRef(0)
  const [msg, setMsg] = useState('')
  return (
    <section className="ms-panel">
      <h3 className="ms-sub">마노 강화 (코인으로 영구 강화)</h3>
      <p className="ms-dim">능력치마다 따로 올려요. 한 번 올릴 때마다 다음 가격이 ×{D.balance.perma.priceGrowth}가 돼요. 판 안의 강화와는 따로 쌓여요.</p>
      <ul className="ms-stats-list">
        {STATS.map((k) => {
          const s = D.balance.perma.stats[k]
          const L = save.perma[k]
          const max = statMaxLevel(D, k)
          const atMax = L >= max
          const price = statPrice(D, k, L)
          const [now, next] = statText(k, L)
          return (
            <li key={k} className="ms-stat">
              <div>
                <p className="ms-stat__name">
                  {s.name} <small>Lv.{L}</small>
                </p>
                <p className="ms-dim">{atMax ? `${now} (최대)` : `${now} → ${next}`}</p>
              </div>
              <button
                type="button"
                className="ms-btn ms-btn--small ms-btn--primary"
                data-sfx="none"
                disabled={atMax || save.currency < price}
                onClick={(e) => {
                  // a double tap buys one level, not two
                  const now = performance.now()
                  if (now - last.current < TAP_GAP) return
                  last.current = now
                  const r = onBuy(k, L)
                  setMsg(r.ok ? `${s.name} Lv.${r.level}!` : r.reason)
                  if (r.ok) audio.sfx('confirm'), popButton(e.currentTarget)
                  else audio.sfx('deny')
                }}
              >
                {atMax ? '최대' : (
                  <>
                    <Sprite name="coin" size={14} /> {money(price)}
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {msg && <p className="ms-ok">{msg}</p>}
      <p className="ms-dim">치명타 확률은 최대 {pctOf(D.balance.perma.stats.crit.max)}, 이동 속도는 {D.balance.perma.stats.move.maxLevel}단계까지 올릴 수 있어요.</p>
    </section>
  )
}

// ── fusion ───────────────────────────────────────────────────────────────────

function Fusion({ save, onBack, onFuse }) {
  const [sel, setSel] = useState([])
  const [done, setDone] = useState(null)
  const busy = useRef(false)
  const slots = useRef([])
  const out = useRef(null)
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
              <span key={i} ref={(el) => (slots.current[i] = el)} className="ms-fuse__slot" style={it ? { '--g': GRADE_COLOR[it.grade] } : undefined}>
                {it ? <Sprite name={weaponIcon(it.weaponId)} size={34} /> : '+'}
                {it && <Grade g={it.grade} />}
              </span>
            )
          })}
          <span className="ms-fuse__arrow">→</span>
          <span ref={out} className="ms-fuse__slot ms-fuse__slot--out" style={check.ok ? { '--g': GRADE_COLOR[next] } : !sel.length && done ? { '--g': GRADE_COLOR[done.item.grade] } : undefined}>
            {check.ok ? (
              <Sprite name={weaponIcon(first.weaponId)} size={40} />
            ) : !sel.length && done ? (
              <FuseBurst key={done.key} icon={weaponIcon(done.item.weaponId)} grade={done.item.grade} from={done.from} />
            ) : (
              '?'
            )}
            {check.ok ? <Grade g={next} /> : !sel.length && done ? <Grade g={done.item.grade} /> : null}
          </span>
        </div>
        {!check.ok && <p className="ms-why">{check.reason}</p>}
        {check.ok && includesEquipped && <p className="ms-dim">장착 중인 무기가 포함되어 있어요. 합성하면 새 무기를 장착해요.</p>}
        <button
          type="button"
          className="ms-btn ms-btn--primary"
          data-sfx="none"
          disabled={!check.ok || busy.current}
          onClick={(e) => {
            if (busy.current) return
            busy.current = true
            // where the three pieces sit, seen from the result: they fly in from there
            const o = out.current.getBoundingClientRect()
            const from = slots.current.map((el) => {
              const r = el.getBoundingClientRect()
              return { x: r.left + r.width / 2 - (o.left + o.width / 2), y: r.top + r.height / 2 - (o.top + o.height / 2) }
            })
            const r = onFuse(sel)
            setSel([])
            setDone(r.ok ? { ...r, from, key: performance.now() } : null)
            if (r.ok) audio.sfx('fuse'), popButton(e.currentTarget)
            else audio.sfx('deny')
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
                <Sprite name={weaponIcon(it.weaponId)} size={28} />
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

function Battle({ img, G, P, save, firstTime, modal, setModal, onRetry, onNext, onEquip, onChests, refresh, rerender }) {
  const pf = usePlatform()
  const [SW, SH] = pf.screen
  const stageRef = useRef(null)
  // the level-up's "my stats" box: stays open or shut across a run's level-ups
  const [showStats, setShowStats] = useState(false)
  const canvasRef = useRef(null)
  const joyRef = useRef(null)
  const knobRef = useRef(null)
  const [hint, setHint] = useState(firstTime)
  const [toast, setToast] = useState(null)
  const [warning, setWarning] = useState(null) // when the last WARNING! came (its key)
  const modalRef = useRef(modal)
  modalRef.current = modal

  useEffect(() => {
    const g = G.current
    const stage = stageRef.current
    const R = createRenderer(canvasRef.current, img, D, { now: artNow }, { screen: pf.screen, bg: pf.background, inset: pf.inset })
    const fit = () => {
      const r = stage.getBoundingClientRect()
      R.resize(r.width, r.height, Math.min(devicePixelRatio, g.dprCap || 2))
      g.k = r.width / SW
    }
    fit()

    // ── keys (the PC game): WASD and the arrows, alone or mixed; Mano runs
    // the way the keys held right now say, so letting go stops her at once ──
    const held = new Set()
    const onKeyDown = (e) => {
      if (!MOVE_KEYS[e.code] && e.code !== 'Space') return
      // the arrows and Space never scroll anything while the game is open
      if (!(e.target.closest && e.target.closest('input, textarea, select'))) e.preventDefault()
      if (e.code === 'Space' || e.ctrlKey || e.metaKey || e.altKey) return
      held.add(e.code)
      g.input = keyVector(held)
    }
    const onKeyUp = (e) => {
      if (held.delete(e.code)) g.input = keyVector(held)
    }

    // ── joystick: a finger anywhere on the battle (buttons aside) puts the
    // stick right there and steers from it; at rest it waits, faint, at the
    // bottom left ──
    const joy = { id: null, ox: 0, oy: 0 }
    const home = () => ({ x: JOY.center[0] * g.k, y: JOY.center[1] * g.k })
    const show = (on, x, y, kx = 0, ky = 0) => {
      const el = joyRef.current
      if (!el) return
      el.classList.toggle('is-on', on)
      el.style.transform = `translate(${x}px, ${y}px)`
      knobRef.current.style.transform = `translate(${kx}px, ${ky}px)`
    }
    const release = () => {
      joy.id = null
      held.clear()
      g.input = { x: 0, y: 0 }
      const h = home()
      show(false, h.x, h.y)
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
      const [rx, ry, rw, rh] = JOY.activationRegion
      if (p.x / g.k < rx || p.x / g.k > rx + rw || p.y / g.k < ry || p.y / g.k > ry + rh) return
      // the stick goes where the finger is, kept whole inside the screen
      const R0 = JOY.radius * g.k
      const r = stage.getBoundingClientRect()
      joy.id = e.pointerId
      joy.ox = Math.max(R0, Math.min(r.width - R0, p.x))
      joy.oy = Math.max(R0, Math.min(r.height - R0, p.y))
      stage.setPointerCapture?.(e.pointerId)
      e.preventDefault()
      onMove(e)
    }
    function onMove(e) {
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
    release()
    // a new size: the HUD and the stick follow (a held stick is let go)
    const ro = new ResizeObserver(() => {
      fit()
      release()
      rerender()
    })
    ro.observe(stage)
    const onUp = (e) => {
      if (e.pointerId === joy.id) release()
    }
    if (pf.input === 'touch') {
      stage.addEventListener('pointerdown', onDown)
      stage.addEventListener('pointermove', onMove)
      stage.addEventListener('pointerup', onUp)
      stage.addEventListener('pointercancel', onUp)
      stage.addEventListener('lostpointercapture', onUp)
    } else {
      addEventListener('keydown', onKeyDown)
      addEventListener('keyup', onKeyUp)
    }
    // leaving the app, the tab or the window: let go of the stick and the
    // keys (a key let go elsewhere is never heard), pause the battle
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

    // short notices over the battle
    let toastTimer
    const say = (text) => {
      setToast(text)
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => setToast(null), 2200)
    }

    // ── the loop ──
    let raf
    let slow = 0
    let lastDrop = 0
    let last = performance.now()
    let hudT = 0
    let shownLevel = null
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const run = g.run
      const paused = modalRef.current && modalRef.current.kind !== 'result' && modalRef.current.kind !== 'chest'
      const w0 = performance.now()
      if (!paused && run.state !== 'over') step(run, dt, g.input)
      // an elite or the boss fell: its reward is saved now, once
      while (g.saved < run.awards.length) {
        const key = run.awards[g.saved++]
        const r = P.current.award(g.runId, g.chapter, key)
        if (!r.already) {
          g.earned.chests += r.chests.length
          g.earned.coins += r.coins
          const who = run.elites[key]
          say(`${who ? monsterName(D, run.region, who) : enemyName(D, run.region, key === 'boss' ? 'boss' : key === 'elite1' ? 'thief' : 'brute')} 처치! 상자 ${r.chests.length}개 · 코인 ${money(r.coins)}`)
        }
        refresh()
      }
      for (const ev of run.events) {
        // a special boss (an episode's 3rd and 5th chapters): WARNING! over
        // the fight, which goes on under it
        if (ev.type === 'boss' && ev.special) setWarning(run.t)
        if (ev.type === 'elite') say(`${ev.name} 등장!`)
        else if (ev.type === 'boss') say(run.boss && run.boss.guard ? `${ev.name} 등장! 수호를 두르고 있어 쉽게 쓰러지지 않아요` : `${ev.name} 등장! 쓰러뜨려야 클리어예요`)
        else if (ev.type === 'escape') say('보물 도둑이 달아났어요')
      }
      if (overtime(run) && !g.overtimeSaid) {
        g.overtimeSaid = true
        say('보스전 연장! 몬스터가 점점 많아지고 빨라져요')
      }
      R.draw(run, paused || run.state === 'levelup' ? 0 : dt)
      // telemetry: how long this frame's work took (simulation + drawing)
      if (run.state === 'play') {
        const ms = performance.now() - w0
        run.stats.frames++
        run.stats.frameMs += ms
        if (ms > run.stats.frameMsMax) run.stats.frameMsMax = ms
        // a phone that cannot keep up gets a sharper-than-needed canvas
        // made smaller (2 → 1.5 → 1 pixel per CSS pixel); the battle itself
        // (balls, hits, damage) never changes
        slow = slow * 0.97 + (dt > 1 / 40 ? 0.03 : 0)
        if (slow > 0.6 && (g.dprCap || 2) > 1 && now - lastDrop > 3000) {
          g.dprCap = (g.dprCap || 2) === 2 ? 1.5 : 1
          lastDrop = now
          slow = 0
          fit()
        }
      }
      // a level-up opens its cards (input let go, so the stick never sticks)
      if (run.state === 'levelup' && shownLevel !== run.choiceSeq) {
        shownLevel = run.choiceSeq
        g.choosing = false
        // new cards take no tap for a moment: the second tap of a double tap
        // must not pick from the next set
        g.cardsAt = performance.now()
        release()
        rerender()
        if (run.edit && run.edit.seq === run.choiceSeq) setTimeout(() => audio.sfx('scribble'), 250)
      }
      if (run.state === 'over' && !g.paid) {
        g.paid = true
        release()
        const reward = P.current.finishRun(g.runId, g.chapter, run.result)
        g.reward = { ...reward, earned: { ...g.earned } }
        // the result (its rewards) first, then the chapter's clear cutscene
        // (once) on the way out; a region's reward was given in that same
        // save, whatever the cutscene does (one closed before it was seen
        // plays when the game is next opened)
        g.clearCuts = run.result.cleared ? CUT_GROUPS.filter((c) => c.chapter === g.chapter && c.when === 'clear' && !g.seen.has(c.id)).map((c) => c.id) : []
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
        choose,
        R,
      }
    }

    return () => {
      clearTimeout(toastTimer)
      cancelAnimationFrame(raf)
      ro.disconnect()
      release()
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
      stage.removeEventListener('lostpointercapture', onUp)
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
      removeEventListener('blur', away)
      document.removeEventListener('visibilitychange', onVis)
      removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // modals always let go of the stick and the keys
  useEffect(() => {
    if (modal && G.current.releaseInput) G.current.releaseInput()
  }, [modal, G])

  const run = G.current.run
  const p = run.player
  const k = G.current.k || 1
  const pct = (v) => `${(v * 100).toFixed(2)}%`
  const box = ([x, y, w, h]) => ({ left: pct(x / SW), top: pct(y / SH), width: pct(w / SW), height: pct(h / SH) })
  const H = pf.hud
  // every elite and boss standing, each its own health bar (by its id): the
  // chapter's boss first, then the others in the order they came
  const bars = run.enemies.filter((e) => e.rank && e.state === 'live').sort((a, b) => (b === run.boss) - (a === run.boss) || a.id - b.id).slice(0, MAX_BARS)
  const ot = overtime(run)
  // where the chapter is: the waves before the boss (n/6), the time left
  // until the boss comes, then the boss fight; a track with the elites and
  // the boss on it
  const C = D.balance.chapter
  const bossAt = C.events.find((e) => e.key === 'boss').at
  const waves = C.phases.filter((ph) => ph.from < bossAt)
  const waveNo = waves.filter((ph) => ph.from <= run.t).length
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
  const stageText = run.boss ? (ot ? '보스전 연장' : '보스전') : `${waveNo}/${waves.length} 웨이브`
  const timeText = run.boss ? clock(run.t) : `보스 ${clock(Math.max(0, Math.ceil(bossAt - run.t)))}`
  const R0 = JOY.radius * k

  return (
    <div className="ms-stage" ref={stageRef}>
      <canvas ref={canvasRef} className="ms-canvas" aria-label="전투 화면" />
      {/* top bar: chapter · wave and time, pause; health, experience and
          level; coins. The one weapon sits just below, on the right. */}
      <div className="ms-hud">
        <div className="ms-hudbar" style={{ height: pct(H.height / SH) }} />
        <div className="ms-stagename" style={box(H.stage)}>
          {run.chapter}장 · {stageText}
        </div>
        <div className="ms-time" style={box(H.timer)}>
          {timeText}
        </div>
        <div className="ms-track" style={box(H.track)} aria-hidden="true">
          <span className="ms-track__fill" style={{ width: pct(Math.min(1, run.t / bossAt)) }} />
          {C.events.map((ev) => (
            <span key={ev.key} className={`ms-track__mark ms-track__mark--${ev.key === 'boss' ? 'boss' : 'elite'} ${run.t >= ev.at ? 'is-past' : ''}`} style={{ left: pct(ev.at / bossAt) }} />
          ))}
        </div>
        <button type="button" className="ms-pause" style={box(H.pause)} onClick={() => setModal({ kind: 'pause' })} aria-label="일시정지" disabled={run.state !== 'play' || !!modal}>
          <Sprite name="pause" size={H.pause[2] * k} />
        </button>
        <div className="ms-hudrow" style={box(H.health)}>
          <Bar w={H.health[2] * k} h={H.health[3] * k} fill="hp_full" value={p.hp / p.maxHp} label="체력" />
        </div>
        <div className="ms-hudtext" style={box(H.healthText)}>
          {Math.ceil(p.hp)} / {Math.round(p.maxHp)}
        </div>
        <div className="ms-hudrow" style={box(H.xp)}>
          <Bar w={H.xp[2] * k} h={H.xp[3] * k} fill="exp_full" value={run.xp / run.need} label="경험치" />
        </div>
        <div className="ms-hudtext" style={box(H.level)}>
          LV. {run.level}
        </div>
        <div className="ms-cur" style={box(H.currency)}>
          <Sprite name="coin" size={((H.currency[3] * 13) / 15) * k} /> {money(run.coins)}
        </div>
        {bars.map((e, i) => {
          // one under the other; with more than one, each a little slimmer
          const [x, y, w, h] = H.bossBar
          const f = bars.length > 1 ? 0.8 : 1
          const name = monsterName(D, run.region, e)
          return (
            <div key={e.id} className="ms-bossbar" style={box([x, y + i * h * f, w, h * f])}>
              <span className="ms-bossbar__name">
                {name}
                {e.guard ? ` · 수호 (초당 최대 ${Math.round(D.balance.lateGame.bossGuard.maxShare * 100)}%)` : ''}
                <span className="ms-bossbar__hp">
                  {short(Math.max(0, e.hp))} / {short(e.maxHp)}
                </span>
              </span>
              <Bar w={w * k} h={((h * 10) / 26) * k * f} fill="hp_full" value={e.hp / e.maxHp} label={`${name} 체력`} />
            </div>
          )
        })}
        <div className="ms-wslot" style={box(H.weaponSlot)} aria-label={`장착: ${weaponName(run.weaponDef.id)} ${run.grade}`}>
          <Sprite name="weapon_slot" size={H.weaponSlot[2] * k} />
          <Sprite name={weaponIcon(run.weaponDef.id)} size={H.weaponSlot[2] * 0.55 * k} className="ms-wslot__icon" />
          <span className="ms-wslot__g" style={{ '--g': GRADE_COLOR[run.grade] }}>
            {run.grade}
          </span>
        </div>
      </div>
      {toast && <p className="ms-toast">{toast}</p>}
      {warning !== null && (
        <p key={warning} className="ms-warning" aria-live="assertive" onAnimationEnd={() => setWarning(null)}>
          WARNING!
        </p>
      )}
      {hint && <p className="ms-hint">{pf.input === 'keys' ? 'WASD나 방향키로 마노가 달려요. 공격은 자동이에요. Esc: 일시정지' : '화면 아무 곳이나 누른 채 움직이면 마노가 달려요. 공격은 자동이에요.'}</p>}
      {pf.input === 'touch' && (
        <div className="ms-joy" ref={joyRef} aria-hidden="true">
          <span className="ms-joy__base">
            <Sprite name="joystick_base" size={R0 * 2} />
          </span>
          <span className="ms-joy__knob" ref={knobRef}>
            <Sprite name="joystick_thumb" size={JOY.knobRadius * 2 * k} />
          </span>
        </div>
      )}

      {run.state === 'levelup' && run.choices && !modal && (
        <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true" aria-label="강화 선택">
          <div className="ms-level">
            <h2 className="ms-h">이번 판의 행운은?</h2>
            <p className="ms-dim ms-center">하나를 골라 주세요{run.pending > 1 ? ` (남은 선택 ${run.pending})` : ''}</p>
            <button type="button" className="ms-btn ms-btn--small ms-runstats__toggle" aria-expanded={showStats} onClick={() => setShowStats((v) => !v)}>
              {showStats ? '능력치 닫기' : '내 능력치 보기'}
            </button>
            {showStats && <RunStats run={run} />}
            {run.choices.map((id) => {
              const o = OPTIONS[id]
              // Tizzzz's rewrite: the pen crosses the card, the old number is
              // struck out and the stronger one pops in (CSS only, ~1.2 s; the
              // card can be chosen at once, it is stronger from the start)
              const ed = isEdited(run, id, run.choiceSeq)
              const T = D.balance.tizzzz.times
              return (
                <button
                  key={id + run.choiceSeq}
                  type="button"
                  data-sfx="none"
                  className={`ms-card${ed ? ' is-edited' : ''}`}
                  style={ed ? { '--pen': `${D.balance.tizzzz.penSeconds}s` } : undefined}
                  onClick={(e) => {
                    const g = G.current
                    if (g.choosing || performance.now() - (g.cardsAt || 0) < TAP_GAP) return
                    g.choosing = true
                    // the pick's flourish, measured before the cards go away;
                    // the pick itself is made right now and the fight goes on
                    const r = e.currentTarget.getBoundingClientRect()
                    const st = stageRef.current.getBoundingClientRect()
                    const n = ed ? T : 1
                    const key = `${run.choiceSeq}:${id}`
                    g.fx = { key, x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height, icon: o.icon, name: o.name, tag: effectTag(id, n), text: change(run, id, n) }
                    setTimeout(() => {
                      if (g.fx && g.fx.key === key) (g.fx = null), rerender()
                    }, PICK_FX_MS)
                    audio.sfx('pick')
                    choose(run, id, run.choiceSeq)
                    g.cardsAt = performance.now()
                    g.choosing = false
                    rerender()
                  }}
                >
                  <span className="ms-card__icon">
                    <Sprite name={o.icon} size={36} />
                  </span>
                  <span className="ms-card__body">
                    <span className="ms-card__name">
                      {o.name}
                      {run.picks[id] ? <em className="ms-card__stack">{run.picks[id]}번 고름</em> : null}
                    </span>
                    {ed ? (
                      <span className="ms-card__num">
                        <s className="ms-card__old">{effectTag(id)}</s> <b className="ms-card__new">{effectTag(id, T)}</b>{' '}
                        <span className="ms-card__new">{change(run, id, T)}</span>
                      </span>
                    ) : (
                      <span className="ms-card__num">
                        <b>{effectTag(id)}</b> {change(run, id)}
                      </span>
                    )}
                  </span>
                  {ed && (
                    <>
                      <em className="ms-card__badge">
                        <Pen /> {D.tizzzz.edit.badge}
                      </em>
                      <span className="ms-pen" aria-hidden="true">
                        <Pen />
                      </span>
                      <svg className="ms-card__scribble" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                        <path d="M2 6 Q 12 1 22 6 T 42 6 T 62 6 T 82 6 T 98 5" />
                      </svg>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {G.current.fx && <PickFx key={G.current.fx.key} fx={G.current.fx} />}

      {modal && modal.kind === 'pause' && (
        <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true">
          <div className="ms-panel ms-menu">
            <Sprite name="menu_sleep" size={92} className="ms-mascot" />
            <h2 className="ms-h">잠깐 쉬어가기</h2>
            <button type="button" className="ms-btn ms-btn--primary" onClick={() => setModal(null)}>
              계속하기
            </button>
            <button type="button" className="ms-btn" onClick={() => setModal({ kind: 'quit' })}>
              장비로
            </button>
            <FullscreenButton />
          </div>
        </div>
      )}
      {modal && modal.kind === 'quit' && (
        <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true">
          <div className="ms-panel ms-menu">
            <h2 className="ms-h">전투를 포기할까요?</h2>
            <p className="ms-dim ms-center">이번 판의 강화는 사라져요. 주운 코인과 이미 받은 엘리트·보스 보상은 남아요.</p>
            <button type="button" className="ms-btn" onClick={() => setModal({ kind: 'pause' })}>
              계속하기
            </button>
            <button
              type="button"
              className="ms-btn ms-btn--danger"
              onClick={() => {
                const g = G.current
                g.paid = true
                // coins picked up so far are kept; the rewards already earned stay too
                P.current.abandonRun(g.runId, run.coins)
                onEquip()
              }}
            >
              포기하고 장비로
            </button>
          </div>
        </div>
      )}
      {modal && modal.kind === 'result' && run.result && (
        <Result run={run} reward={G.current.reward} save={save} onRetry={onRetry} onNext={onNext} onEquip={onEquip} onChests={onChests} />
      )}
    </div>
  )
}

// ── the story's cutscenes (story.json → cutscenes) ──────────────────────────

const CUT_GROUPS = D.story.cutscenes.groups

// clear cutscenes of chapters already cleared that were never seen to the
// end (the page closed in the middle): played when the game opens
const leftoverCuts = (save) => CUT_GROUPS.filter((g) => g.when === 'clear' && save.firstCleared.includes(g.chapter) && !save.story.seen.includes(g.id))

// Cutscenes: the picture whole (never cut; the space left over is dark), a
// line or two under it, 다음 (or a tap, Enter, Space) and 건너뛰기. A group
// counts as seen when its last cut has been passed or it was skipped. Then
// the region reward of the groups that have one (it was given with the clear,
// so skipping loses nothing). replay: watched again from 설정 (nothing saved).
function Cutscene({ groups, replay, onSeen, onDone }) {
  const list = groups.map((id) => CUT_GROUPS.find((g) => g.id === id)).filter(Boolean)
  const cuts = list.flatMap((g) => g.cuts.map((c, i) => ({ ...c, group: g.id, last: i === g.cuts.length - 1 })))
  const rewards = list.filter((g) => g.reward).map((g) => g.reward)
  const [i, setI] = useState(0)
  const last = useRef(0)
  const marked = useRef(new Set())
  const mark = (id) => {
    if (replay || marked.current.has(id)) return
    marked.current.add(id)
    onSeen(id)
  }
  const atCut = i < cuts.length
  const r = i - cuts.length // which reward card, once the cuts are over
  const done = !atCut && r >= rewards.length
  useEffect(() => {
    if (done) onDone()
  }, [done])
  // the next pictures are fetched while this one is shown
  useEffect(() => {
    for (const c of cuts.slice(i, i + 2)) loadArt(c.image)
  }, [i])
  const next = () => {
    const now = performance.now()
    if (now - last.current < 250) return // a double tap moves one step
    last.current = now
    if (atCut && cuts[i].last) mark(cuts[i].group)
    setI(i + 1)
  }
  const skip = () => {
    for (const g of list) mark(g.id)
    setI(cuts.length)
  }
  useEffect(() => {
    const key = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      next()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  if (done) return null
  if (!atCut) {
    const R = D.story.rewards[rewards[r]]
    return (
      <div className="ms-modal ms-cut ms-cut--reward" role="dialog" aria-modal="true" aria-label="보상">
        <div className="ms-panel ms-cut__reward">
          <div className="ms-cut__props">
            {R.images.map((id) => (
              <span key={id} className="ms-cut__prop">
                <Art id={id} />
                {R.cats && D.cats.companions.find((c) => c.image === id) && <small>{D.cats.companions.find((c) => c.image === id).name}</small>}
              </span>
            ))}
          </div>
          <div className="ms-cut__words">
            {R.lines.map((t) => (
              <p key={t} className="ms-cut__line">
                {t}
              </p>
            ))}
            {R.cats && <p className="ms-dim ms-center">{D.balance.cats.activeFromChapter}장부터 함께 싸워요.</p>}
            {R.tizzzz && <p className="ms-dim ms-center">{D.balance.tizzzz.activeFromChapter}장부터 선택지를 고쳐 써 줘요.</p>}
            <button type="button" className="ms-btn ms-btn--primary" onClick={() => setI(i + 1)}>
              확인
            </button>
          </div>
        </div>
      </div>
    )
  }
  const cut = cuts[i]
  return (
    <div className="ms-modal ms-cut" role="dialog" aria-modal="true" aria-label="이야기">
      <div className="ms-cut__pic" onClick={next}>
        {/* the group's pictures stay in place, only one shown: changing cuts never flashes */}
        {cuts.map((c, k) => (
          <Art key={c.image} id={c.image} className={k === i ? 'is-on' : ''} />
        ))}
      </div>
      <div className="ms-cut__box">
        <p className="ms-cut__text">
          <span className="ms-cut__who">{cut.who || D.story.cutscenes.speaker}</span>
          {cut.text}
        </p>
        <div className="ms-cut__row">
          <span className="ms-cut__count">
            {i + 1} / {cuts.length}
          </span>
          <button type="button" className="ms-btn ms-btn--small ms-btn--primary" onClick={next}>
            다음
          </button>
        </div>
      </div>
      <button type="button" className="ms-cut__skip" onClick={skip}>
        건너뛰기
      </button>
    </div>
  )
}

function Result({ run, reward, save, onRetry, onNext, onEquip, onChests }) {
  const r = run.result
  const build = buildSummary(run)
  const busy = useRef(false)
  const once = (fn) => () => {
    if (busy.current) return
    busy.current = true
    fn()
  }
  const rw = reward || { chests: [], coins: 0, earned: { chests: 0, coins: 0 } }
  const next = r.cleared && run.chapter < LAST_CHAPTER
  const chests = rw.chests.length + rw.earned.chests
  const coins = rw.coins + rw.earned.coins
  const time = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`
  return (
    <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true">
      <div className="ms-panel ms-result">
        <Sprite name={r.cleared ? 'portrait_happy' : 'portrait_cry'} size={76} className="ms-mascot" />
        <h2 className="ms-h">{r.cleared ? '마노가 해냈다!' : '한 번 더 도전할까?'}</h2>
        <dl className="ms-stats">
          <div>
            <dt>{run.chapter}장</dt>
            <dd>{time}</dd>
          </div>
          <div>
            <dt>처치</dt>
            <dd>{r.kills}</dd>
          </div>
          <div>
            <dt>엘리트</dt>
            <dd>{r.elites}/2</dd>
          </div>
          <div>
            <dt>보스</dt>
            <dd>{r.cleared ? '처치' : r.bossLeft === null ? '-' : `${Math.ceil(r.bossLeft * 100)}%`}</dd>
          </div>
        </dl>
        <div className="ms-reward">
          <p>
            <Sprite name="chest_closed" size={22} /> 상자 {chests}개
            {rw.firstClear ? ' (첫 클리어 보너스 포함)' : ''}
          </p>
          <p>
            <Sprite name="coin" size={16} /> 코인 +{money(coins)}
          </p>
          {rw.gift && (
            <p>
              <Sprite name={weaponIcon(rw.gift.weaponId)} size={18} /> 첫 클리어 선물: {weaponName(rw.gift.weaponId)} <Grade g={rw.gift.grade} />
            </p>
          )}
        </div>
        {build.length > 0 && (
          <ul className="ms-build" aria-label="선택한 강화">
            {build.map((b) => (
              <li key={b.id}>
                <Sprite name={b.icon} size={18} />
                {b.name} ×{b.n}
              </li>
            ))}
          </ul>
        )}
        {save && save.chests.length > 0 && (
          <button type="button" className="ms-btn ms-chestbtn" onClick={() => onChests(true)}>
            <Sprite name="chest_closed" size={24} /> 상자 {save.chests.length}개 모두 열기
          </button>
        )}
        <div className="ms-row ms-row--two">
          <button type="button" className="ms-btn" onClick={once(onEquip)}>
            로비로
          </button>
          {/* cleared: on to the next chapter (the last one: again) */}
          <button type="button" className="ms-btn ms-btn--primary" onClick={once(next ? onNext : onRetry)}>
            {next ? `다음 장 (${run.chapter + 1}장)` : '다시 도전'}
          </button>
        </div>
      </div>
    </div>
  )
}
