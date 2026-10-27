import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { D } from './data.js'
import { createRun, step, choose, reroll, makeTurret, previewTimes, isEdited, buildSummary, weaponDef, overtime, regionOf, enemyName, monsterName, lastChapter } from './game.js'
import { catDamage, catInterval, catSpeed, catSwipe, packMul } from './friends.js'
import { isClassCard, classOf, classDps, firepower, recipes, zyoTargets, bonusOf, classLevel, optionName, powerMul } from './zyo.js'
import { artUrl, artNow, artInfo, loadArt, preloadRegion } from './story-art.js'
import { browserStorage, canFuse, createProgress, exportName, fuseAllPreview, parseBackup, statPrice, statValue, statMaxLevel, STATS, NEWS_EP01, NEWS_EP02, NEWS_EP03, NEWS_EP04, NEWS_BALLS } from './progress.js'
import { createRenderer, short } from './render.js'
import { materials, canMake, sunk } from './turret.js'
import { extraOf } from './bosses.js'
import { PLATFORMS, MOVE_KEYS, keyVector, touchOnly } from './platform.js'
import { FRAMES, ART, SHEET_URLS, loadImages, spriteStyle } from './sprites.js'
import { createRoom } from './room.js'
import { roomTotal, roomProgress } from './room-items.js'
import { testerStorage, setupTest, testTick, testPhase, skipPhase, testBosses, TEST_BUILDS, TEST_TIMES, TEST_PERMA, TEST_LEVEL, TEST_POWER } from './tester.js'
import { GAMES } from '../data/games.js'
import * as audio from './audio.js'
import './survivor.css'
import './survivor-theme.css'
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

// 전체 화면 (the PC game), in 설정: on and off; nothing where the browser
// has none. While it is on, Esc is kept for the game where the browser allows
// it (Chrome, Edge: holding Esc still leaves full screen); elsewhere Esc
// leaves full screen, and a battle then pauses (see Battle)
const canLockEsc = () => typeof navigator !== 'undefined' && !!(navigator.keyboard && navigator.keyboard.lock)

// an on/off setting: two buttons, 켜짐 and 꺼짐, the one in force lit; a press
// sets that one (asked for: a single button showing the state read as what
// it would do, so it was pressed the wrong way round)
function OnOff({ on, set, label }) {
  return (
    <div className="ms-onoff" role="group" aria-label={label}>
      <button type="button" className={`ms-btn ms-btn--small${on ? ' ms-btn--primary' : ''}`} aria-pressed={on} onClick={() => !on && set(true)}>
        켜짐
      </button>
      <button type="button" className={`ms-btn ms-btn--small${on ? '' : ' ms-btn--primary'}`} aria-pressed={!on} onClick={() => on && set(false)}>
        꺼짐
      </button>
    </div>
  )
}
// full screen now, and a way to turn it on or off (null: none here — the
// phone game, or a browser without it)
function useFullscreen() {
  const pf = usePlatform()
  const [on, setOn] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  if (pf.id !== 'pc' || !document.fullscreenEnabled) return [on, null]
  const set = (want) => {
    if (want === !!document.fullscreenElement) return
    const p = want ? document.documentElement.requestFullscreen() : document.exitFullscreen()
    if (p && p.then) p.then(() => document.fullscreenElement && canLockEsc() && navigator.keyboard.lock(['Escape']).catch(() => {})).catch(() => {})
  }
  return [on, set]
}
function FullscreenSetting() {
  const [on, set] = useFullscreen()
  if (!set) return null
  return (
    <section className="ms-panel">
      <div className="ms-row">
        <span className="ms-sub">전체 화면</span>
        <OnOff on={on} set={set} label="전체 화면" />
      </div>
      <p className="ms-dim">{canLockEsc() ? '켜져 있을 때 Esc를 길게 누르면 전체 화면이 꺼져요. 짧게 누르면 전투가 멈추고, 한 번 더 누르면 이어져요.' : '켜져 있을 때 Esc를 누르면 전체 화면이 꺼지고 전투가 멈춰요.'}</p>
    </section>
  )
}
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString()
const pctOf = (v) => `${fmt(v * 100, 1)}%`

// what a card really does: its effect straight from the balanceConfig (the
// same numbers the game applies), then what it is now → what it becomes
// (n: how many times it applies — Tizzzz's rewritten card does it more than once)
const effectTag = (id, n = 1, run = null) => {
  if (isClassCard(id)) return D.zyo.classBadge
  const e = EFFECTS[id]
  if (id === 'power') {
    // (the later in the run, the more: see powerMul)
    let m = 1
    for (let i = 0; i < n; i++) {
      const pm = run && run.cls ? powerMul(run) : { dmg: e.damageMul, rate: e.rateMul }
      m *= pm.dmg * pm.rate
    }
    return `화력 ×${fmt(m, 2)}`
  }
  if (id === 'crit' || id === 'split') return `+${fmt(e.add * n * 100)}%p`
  // a shorter gap: how much more often (+43%), never "×0.7"
  if (id === 'interval' || id === 'catRate') return `+${fmt((e.mul ** -n - 1) * 100, 0)}%`
  if (id === 'regen') return `최대 체력의 +${fmt(e.addMaxHpShare * n * 100)}%/초`
  if (id === 'nyang') return n > 1 ? `고양이 Lv.+${n}` : '고양이'
  if (id === 'critDamage') return `+${fmt(e.add * n)}배`
  if (id === 'catSummon') return `+${e.add * n}마리`
  if (id === 'catSize') return `범위 +${fmt((e.rangeMul ** n - 1) * 100, 0)}%`
  // ×2 and more as it is; a little more or less as a percent
  const m = e.mul ** n
  return m >= 2 ? `×${fmt(m, 2)}` : m > 1 ? `+${fmt((m - 1) * 100, 0)}%` : `-${fmt((1 - m) * 100, 0)}%`
}
// coins: whole, with separators up to 99,999, then short (123K, 4.5M …)
const money = (n) => (n < 1e5 ? Math.floor(n).toLocaleString('ko-KR') : short(n))
// the picks so far as dots, the one this card adds ringed (a long run of
// picks: a number instead)
const MAX_PIPS = 9
function Pips({ n }) {
  if (n >= MAX_PIPS) return <em className="ms-card__stack">{n}번 고름</em>
  return (
    <span className="ms-card__pips" aria-label={n ? `${n}번 고름` : '처음'}>
      {Array.from({ length: n + 1 }, (_, i) => (
        <i key={i} className={i < n ? 'is-on' : 'is-new'} />
      ))}
    </span>
  )
}
// a gap as how many times a second (more is better: never "0.25초마다")
const perSec = (gap) => fmt(1 / gap, 1)
const big = (n) => (n >= 1e6 ? n.toExponential(2).replace('+', '') : Math.round(n).toLocaleString('ko-KR'))
function change(run, id, times = 1) {
  if (isClassCard(id)) return classText(run, classOf(id))
  const w = run.weapon
  const p = run.player
  const n = previewTimes(run, id, times)
  switch (id) {
    case 'count':
      return `한 번에 던지는 개수\n${big(w.count)}개 → ${big(n.count)}개`
    case 'interval':
      return `1초에 던지는 횟수\n${perSec(w.interval)}번 → ${perSec(n.interval)}번`
    case 'damage':
      return `한 방 피해\n${big(w.damage)} → ${big(n.damage)}`
    case 'bounce':
      return `튕기는 횟수\n${big(w.bounces)}번 → ${big(n.bounces)}번`
    case 'maxHp':
      return `최대 체력\n${big(p.maxHp)} → ${big(n.maxHp)}\n지금 체력 +${big(n.hp - p.hp)}`
    case 'move':
      return `걷는 속도\n${Math.round(p.speed)} → ${Math.round(n.speed)}`
    case 'crit':
      return `치명타 확률\n${pctOf(w.critChance)} → ${pctOf(n.critChance)}`
    case 'critDamage':
      return `치명타 한 방\n보통의 ${fmt(w.critMul)}배 → ${fmt(n.critMul)}배`
    case 'ballSpeed':
      return `날아가는 속도\n${Math.round(w.speed)} → ${Math.round(n.ballSpeed)}`
    case 'size':
      return `탱탱볼 크기\n${fmt(w.radius * 2)} → ${fmt(n.radius * 2)}`
    case 'pickup':
      return `끌어오는 거리\n${Math.round(p.pickupR)} → ${Math.round(n.pickupR)}`
    case 'split':
      return `분열 ${pctOf(w.splitChance)} → ${pctOf(n.splitChance)}`
    case 'luck':
      return `코인\n${fmt(p.coinMul, 2)}배 → ${fmt(n.coinMul, 2)}배`
    case 'regen':
      return `1초에 차는 체력\n${big(p.regen * p.maxHp)} → ${big(n.regen * p.maxHp)} (최대 체력의 ${pctOf(n.regen)})`
    case 'armor':
      return `받는 피해 (적게 받을수록 좋아요)\n${pctOf(p.armor)} → ${pctOf(n.armor)}`
    case 'xpGain':
      return `경험치\n${fmt(p.xpMul, 2)}배 → ${fmt(n.xpMul, 2)}배`
    case 'nyang':
      return times > 1 ? nyangJump(run.nyang, run.nyang + times) : nyangText(run.nyang + 1)
    case 'power':
      return run.cls ? `1초 피해\n${big(classDps(run))} → ${big(classDps(run, n.cls))}\n한 방 +${fmt((n.cls.dmg / run.cls.dmg - 1) * 100, 0)}% · 횟수 +${fmt((n.cls.rate / run.cls.rate - 1) * 100, 0)}%` : ''
    // the friend cats: what one cat does now → after (catNow: the same
    // numbers friends.js fights with)
    case 'catSummon': {
      const a = catNow(run)
      const b = catNow({ ...run, cat: n.cat })
      return `친구냥이\n${run.cat.n}마리 → ${n.cat.n}마리\n${run.cat.n ? `할퀴기 한 방 ${big(a.dmg)} → ${big(b.dmg)}` : `할퀴기 한 방 ${big(b.dmg)} · 1초에 ${perSec(b.gap)}번`}`
    }
    case 'catSize':
      return `할퀴는 넓이\n${fmt(catNow(run).swipe * 2)} → ${fmt(catNow({ ...run, cat: n.cat }).swipe * 2)}`
    case 'catSpeed':
      return `달리는 속도\n${Math.round(catNow(run).speed)} → ${Math.round(catNow({ ...run, cat: n.cat }).speed)}`
    case 'catRate':
      return `1초에 할퀴는 횟수\n${perSec(catNow(run).gap)}번 → ${perSec(catNow({ ...run, cat: n.cat }).gap)}번`
    case 'catClaw':
      return `할퀴기 한 방\n${big(catNow(run).dmg)} → ${big(catNow({ ...run, cat: n.cat }).dmg)}`
    default:
      return ''
  }
}

// Tizzzz's rewrite: her pen underlines what it gives — the number after the
// first → (the card's main one), on its own line
function Marked({ text }) {
  const i = text.indexOf('→ ')
  if (i < 0) return text
  const end = text.indexOf('\n', i)
  const j = end < 0 ? text.length : end
  return (
    <>
      {text.slice(0, i + 2)}
      <span className="ms-card__mark">
        {text.slice(i + 2, j)}
        <span className="ms-pen" aria-hidden="true">
          <Pen />
        </span>
        <svg className="ms-card__scribble" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
          <path d="M2 6 Q 12 1 22 6 T 42 6 T 62 6 T 82 6 T 98 5" />
        </svg>
      </span>
      {text.slice(j)}
    </>
  )
}

// one friend cat's numbers in a run (or in a run with other cat numbers)
const catNow = (run) => ({ dmg: catDamage(run), gap: catInterval(run), speed: catSpeed(run), swipe: catSwipe(run), pack: packMul(run) })

// a class card: what goes, what comes (the class's one-target damage a
// second against what the ball and the cats deal now, counted the same way)
function classText(run, k) {
  const R = D.balance.zyo.recipes[k]
  const now = firepower(run)
  return `탱탱볼·냥이 대신 ${D.zyo.forms[R.form]}\n1초 피해 ${big(now)} → ${big(now * bonusOf(D, k))}`
}

// a run that has the friend cats among its cards
const hasCats = (run) => run.pool.includes('catSummon')
// the red ball's own cards: the cats never get them
const BALL_ONLY = new Set(['count', 'interval', 'damage', 'bounce', 'ballSpeed', 'size', 'split'])
// a line under a card in a run with the cats: what it does (or not) for
// them, as friends.js counts it
function cardHint(run, id) {
  if (run.cls && (id === 'crit' || id === 'critDamage')) return '전직 공격에도 같이 적용돼요'
  if (run.cls && id === 'power') return `Lv.${classLevel(run)} → ${classLevel(run) + 1} · 더 세고 자주, 더 크게 · ${D.zyo.skills[run.cls.form].replace('!', '')} ${Math.min(D.balance.zyo.skill.max, D.balance.zyo.skill.count + Math.floor((classLevel(run) + 1) / D.balance.zyo.skill.perLevels))}발`
  if (isClassCard(id)) return `${D.zyo.classes[classOf(id)].text} · 한 판에 한 번`
  const zr = run.zyo && !run.cls && recipes(run).find((r) => r.mats.includes(id))
  if (zr) {
    // (as a sum: 왕 탱탱볼 3/7 + 탱탱볼 개수 5/7 = 거대 탱탱볼▪회전 방어막)
    const need = D.balance.zyo.need
    return `전직 재료: ${zr.mats.map((m, i) => `${OPTIONS[m].name} ${Math.min(need, zr.picks[i])}/${need}`).join(' + ')}\n= ${OPTIONS['cls' + zr.k].name}`
  }
  if (!hasCats(run)) return null
  if (id === 'crit' || id === 'critDamage') return '친구냥이 할퀴기에도 같이 적용돼요'
  if (BALL_ONLY.has(id)) return '탱탱볼에만 적용돼요 (친구냥이는 그대로)'
  if (id === 'catSummon' && !run.cat.n) return '할퀴기 피해·간격은 장착한 탱탱볼과 마노 강화에 비례해요'
  return null
}
// how the cats' numbers come from Mano's (the run stats' note)
const CAT_RULES = [
  `할퀴기 피해 = 출발할 때 탱탱볼 피해(장착 등급 · 마노 강화 공격 피해 포함)의 ${D.balance.friendCats.damageCoef}배 × 발톱 갈기 × 냥이 수 보너스`,
  `할퀴기 간격 = ${D.balance.friendCats.interval}초 × 마노 강화 공격 주기 × 빠르게 할퀴기`,
  '치명타 확률 · 치명타 피해는 마노와 같아요 (전투 중 고른 카드도 같이 적용)',
  '탱탱볼 강화 카드(개수 · 공격 주기 · 공격 피해 · 반사 등)는 냥이에게 적용되지 않아요',
]

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
  if (run.cls) {
    const C = run.cls
    rows.push(['전직', OPTIONS['cls' + C.k].name], ['전직 초당 피해', big(classDps(run))], ['전직 레벨', `Lv.${classLevel(run)} · 공격 ×${fmt(C.dmg, 2)} · 빈도 ×${fmt(C.rate, 2)}`])
    if (C.k === 'B') rows.push(['최후의 반격', `${C.revives}회 남음`])
    if (C.k === 'C') rows.push(['흡혈로 회복', big(C.healed)])
  } else if (run.zyo) for (const r of recipes(run)) if (r.mats.every((m) => run.pool.includes(m))) rows.push([`전직 ${D.zyo.classes[r.k].special}`, r.mats.map((m, i) => `${OPTIONS[m].name} ${Math.min(D.balance.zyo.need, r.picks[i])}`).join(' · ')])
  if (run.cat.n > 0 && !run.cls) {
    const c = catNow(run)
    rows.push(['친구냥이', `${run.cat.n}마리`], ['할퀴기 피해', big(c.dmg)], ['할퀴기 간격', `${fmt(c.gap, 3)}초`], ['할퀴기 범위', fmt(c.swipe * 2)], ['고양이 달리기', Math.round(c.speed)])
  }
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
      {run.cat.n > 0 && !run.cls && (
        <ul className="ms-runstats__note" aria-label="친구냥이 능력치">
          {CAT_RULES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {build.length > 0 && (
        <ul className="ms-build" aria-label="이번 판에 고른 강화">
          {build.map((b) => (
            <li key={b.id}>
              {OPTIONS[b.id] && OPTIONS[b.id].art ? <Art id={OPTIONS[b.id].art} className="ms-build__art" /> : <Sprite name={b.icon} size={18} />}
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

// the turret as it stands in the fight, facing us (its frames' atlas,
// ep04-assets.json → turret), fitted into a square box of `size` px
const TURRET_ATLAS = D.storyAssets.images.find((x) => x.id === 'turret')
function TurretIcon({ size = 48, className = '' }) {
  const src = artUrl('turret')
  if (!src || !TURRET_ATLAS) return <Art id="reward_turret" className={className} />
  const [x, y, w, h] = TURRET_ATLAS.frames.S
  const k = size / Math.max(w, h)
  return (
    <span
      className={`ms-turreticon ${className}`}
      aria-hidden="true"
      style={{ width: size, height: size, backgroundImage: `url(${src})`, backgroundSize: `${TURRET_ATLAS.out[0] * k}px ${TURRET_ATLAS.out[1] * k}px`, backgroundPosition: `${-x * k + (size - w * k) / 2}px ${-y * k + (size - h * k) / 2}px` }}
    />
  )
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
          <CardIcon o={fx.o} />
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
// an upgrade card's icon: its own picture (the cat cards'), else its sprite
function CardIcon({ o, size = 36 }) {
  if (o.art) return <Art id={o.art} className="ms-card__art" />
  return <Sprite name={o.icon} size={size} />
}

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
    case 'armor':
      return [`받는 피해 ${pctOf(v(L))}`, pctOf(v(L + 1))]
    case 'regen': {
      // (0.05% a level: two decimals)
      const pct2 = (x) => `${fmt(x * 100, 2)}%`
      return [`초당 ${pct2(v(L))}`, pct2(Math.min(s.max, v(L + 1)))]
    }
    default:
      return ['', '']
  }
}

// platform: 'mobile' (#/game/mano-survivor) or 'pc' (#/game/mano-survivor-pc)
// tester: the special-boss tester (tester.js): its own save in memory only
export default function SurvivorPage({ platform = 'mobile', exitHref = '#/', tester = false }) {
  const pf = PLATFORMS[platform] || PLATFORMS.mobile
  return (
    <PlatformCtx.Provider value={pf}>
      <Game exitHref={exitHref} tester={tester} />
    </PlatformCtx.Provider>
  )
}

function Game({ exitHref, tester }) {
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
    // (the tester: a save in memory, never the real one)
    P.current = createProgress(D, tester ? testerStorage(D) : browserStorage())
    const b = P.current.boot()
    setSave(b.data)
    // rewards a save from before the story got for chapters it had cleared
    const news = b.data.story.news
    // (and a save that cleared chapter 5 before it brought the cats and the
    // rerolls: they come now, the S ball it already has)
    // (and the red balls for episodes, room stages and crit's top that
    // came after they were reached)
    const lateBalls = ['skulltown', 'desert', 'snow', 'sky'].filter((rid) => b.data.story.rewards.includes(rid)).map((rid) => `${D.story.rewards[rid].ball}급`)
    if (news.length || b.gifts.length) {
      const told = news.filter((rid) => rid !== NEWS_EP01 && rid !== NEWS_EP02 && rid !== NEWS_EP03 && rid !== NEWS_EP04 && rid !== NEWS_BALLS)
      setNotice(
        [
          news.includes(NEWS_EP01) && `5장 클리어 보상이 바뀌었어요: 단추·호두·모루 합류 · 강화 리롤 ${b.data.rerolls}회 (S급 탱탱볼은 이미 받았어요)`,
          news.includes(NEWS_EP02) && `Tizzzz는 이제 10장 클리어 보상이에요: ${D.balance.tizzzz.activeFromChapter}장부터 선택지를 고쳐 써 줘요 · 강화 리롤 ${b.data.rerolls}회 (SS급 탱탱볼은 이미 받았어요)`,
          news.includes(NEWS_EP03) && `15장 클리어 보상에 ${D.zyo.name}가 합류했어요: ${D.balance.zyo.activeFromChapter}장부터 한 판에 한 번 전직할 수 있어요 · 강화 리롤 ${b.data.rerolls}회`,
          news.includes(NEWS_EP04) && `20장 클리어 보상에 포탑 제작이 생겼어요: ${D.balance.turret.activeFromChapter}장부터 레벨업 때 강화 2회분을 포탑 1개로 바꿀 수 있어요 · 강화 리롤 ${b.data.rerolls}회`,
          told.length && `이미 깬 장의 이야기 보상을 받았어요: ${told.map((rid) => D.story.rewards[rid].lines[0].replace(/[!.]$/, '')).join(' · ')}`,
          news.includes(NEWS_BALLS) && `에피소드 클리어 보상에 탱탱볼이 생겼어요. 이미 깬 에피소드의 탱탱볼을 받았어요: ${lateBalls.join(' · ')}`,
          b.gifts.length > 0 && `마노의 방·치명타 확률 선물로 탱탱볼을 받았어요: ${b.gifts.map((g) => `${g.item.grade}급`).join(' · ')}`,
        ]
          .filter(Boolean)
          .join(' / '),
      )
      if (news.length) P.current.clearNews()
    }
    setChapter(Math.max(1, Math.min(b.data.unlockedChapter, LAST_CHAPTER)))
    // (a run left unfinished — the page closed mid-fight — simply ends; what
    // it earned stays: progress.js. Nothing needs saying about it)
    if (!P.current.available && !tester) setNotice('이 브라우저에서는 저장할 수 없어요. 플레이는 가능하지만 진행이 남지 않아요.')
    // the game's fonts (survivor.css): asked for now, so the battle's numbers
    // (drawn on the canvas) have them from the first fight
    document.fonts?.load?.("16px 'Jua'").catch(() => {})
    loadImages()
      .then((i) => {
        setImg(i)
        setScreen('lobby')
        // the opening (story.json → when: launch), the first time the game
        // is opened; then a chapter's clear cutscene that was cut short (the
        // page closed in the middle): its reward was given with the clear
        const d = P.current.get()
        const left = [...openingCuts(d), ...leftoverCuts(d)]
        if (left.length) setModal({ kind: 'cut', groups: left.map((g) => g.id), then: firstVisit(d) ? () => start(1) : null })
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
    g.run = createRun(D, { chapter: ch, weaponId: r.weapon.weaponId, grade: r.weapon.grade, seed: (Math.random() * 2 ** 31) | 0, runId: r.runId, perma: r.perma, cats: r.cats, tizzzz: r.tizzzz, zyo: r.zyo, turret: r.turret, blessings: r.blessings, rerolls: r.rerolls, arena: pf.arena, bossBag: BOSS_BAG })
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
    // (and the chapter's extra special boss, if it has one)
    if (extraOf(D, ch)) loadArt('motion:' + extraOf(D, ch))
    // (and the friend cats' frames and scratches, and the ninja cats' a cat
    // class turns them into, in a run that can have them)
    if (g.run.pool.includes('catSummon')) for (const id of ['friend_cat', 'fx_cat_slash', 'fx_cat_slash_power', 'ninja_cat']) loadArt(id)
    // (and the turret's frames, in a run that can make one)
    if (g.run.turretOn) loadArt('turret')
    // the episodes' opening cutscenes (play: false) are kept but never played
    const enter = CUT_GROUPS.filter((c) => c.chapter === ch && c.when === 'enter' && c.play !== false && !seen.has(c.id))
    setModal(enter.length ? { kind: 'cut', groups: enter.map((c) => c.id) } : null)
    setScreen('battle')
    refresh()
  }

  // the tester: a run of the boss's chapter, set up for it (tester.js)
  const startTest = (opts) => {
    const ch = opts.chapter
    const r = P.current.startRun(ch)
    const g = G.current
    g.test = opts
    g.runId = r.runId
    g.chapter = ch
    g.paid = false
    g.choosing = false
    g.input = { x: 0, y: 0 }
    g.run = createRun(D, { chapter: ch, weaponId: r.weapon.weaponId, grade: r.weapon.grade, seed: (Math.random() * 2 ** 31) | 0, runId: r.runId, perma: r.perma, cats: r.cats, tizzzz: r.tizzzz, zyo: r.zyo, turret: r.turret, blessings: r.blessings, rerolls: r.rerolls, arena: pf.arena, bossBag: BOSS_BAG })
    setupTest(g.run, opts)
    g.saved = 0
    g.earned = { chests: 0, coins: 0 }
    g.reward = null
    g.seen = new Set(P.current.get().story.seen)
    preloadRegion(g.run.region, pf.background)
    loadArt('motion:' + extraOf(D, ch))
    for (const id of ['friend_cat', 'fx_cat_slash', 'fx_cat_slash_power', 'ninja_cat']) loadArt(id)
    loadArt('turret')
    setModal(null)
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
      {screen === 'lobby' && save && tester && <TesterLobby save={save} exitHref={exitHref} last={G.current.test} onStart={startTest} />}
      {screen === 'lobby' && save && !tester && (
        <Lobby
          tab={tab}
          setTab={setTab}
          save={save}
          img={img}
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
          refresh={refresh}
          onImported={(data) => {
            setSave(data)
            setChapter(Math.max(1, Math.min(data.unlockedChapter, LAST_CHAPTER)))
            // (reset to the first visit, or a backup from before the opening:
            // the opening plays, and on a first visit chapter 1 begins)
            const intro = openingCuts(data)
            if (intro.length) setModal({ kind: 'cut', groups: intro.map((g) => g.id), then: firstVisit(data) ? () => start(1) : null })
          }}
          onChests={openChests}
          onBuy={(stat, level) => {
            const r = P.current.buyStat(stat, level)
            refresh()
            // a room stage or crit's top reached: its red ball, told at once
            if (r.ok && r.gifts.length) setModal({ kind: 'gift', gifts: r.gifts })
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
          onRetry={() => (tester ? startTest(G.current.test) : leaveResult(() => start(G.current.chapter)))}
          onNext={() => (tester ? (setModal(null), setScreen('lobby')) : leaveResult(() => start(nextChapter(G.current.chapter))))}
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
      {screen === 'battle' && tester && G.current.run && G.current.run.test && <TesterBar run={G.current.run} onEnd={() => (setModal(null), setScreen('lobby'))} onRetry={() => startTest(G.current.test)} />}
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
      {modal && modal.kind === 'gift' && <GiftModal gifts={modal.gifts} save={save} onClose={() => setModal(null)} />}
    </div>
  )
}

// a red ball given for a room stage or for crit's top (progress.js →
// grantGifts): what was reached, the ball, and for crit what it now means
function GiftModal({ gifts, save, onClose }) {
  return (
    <div className="ms-modal ms-modal--in" role="dialog" aria-modal="true" aria-label="선물">
      <div className="ms-panel ms-chest ms-gift">
        <h2 className="ms-h">선물을 받았어요!</h2>
        <Art id="ball_ss" className="ms-gift__art" />
        <ul className="ms-loot">
          {gifts.map(({ key, item }) => (
            <li key={key}>
              <p className="ms-gift__why">{key === 'critMax' ? `치명타 확률 최대 달성! (${pctOf(D.balance.perma.stats.crit.max)})` : `마노의 방이 「${D.room.stages[+key.slice(4)].name}」(으)로 자랐어요!`}</p>
              {key === 'critMax' && <p className="ms-dim ms-center">이제 판 안의 강화 선택지에 치명타 확률 카드가 더 이상 나오지 않아요.</p>}
              <span className="ms-loot__item">
                <Sprite name={weaponIcon(item.weaponId)} size={24} />
                {weaponName(item.weaponId)} <Grade g={item.grade} />
                {save && save.equippedInstanceId === item.id ? ' (장착했어요)' : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="ms-dim">탱탱볼은 주머니에 들어갔어요. 같은 무기·같은 등급 3개면 합성할 수 있어요.</p>
        <button type="button" className="ms-btn ms-btn--primary" onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  )
}

// ── lobby: go · gear · Mano's stats ─────────────────────────────────────────

// ── the special-boss tester (tester.js; #/game/mano-survivor-test) ─────────

const TEST_TIME_NAMES = { 60: '약 1분', 120: '약 2분', 180: '약 3분', 0: '안 쓰러짐' }
const testClassName = (k) => `${D.zyo.forms[D.balance.zyo.recipes[k].form]} ▪ ${D.zyo.classes[k].special}`

// what to try: the boss, the build, its level, how long the boss lasts,
// Mano unhurtable or not
function TesterLobby({ save, exitHref, last, onStart }) {
  const pf = usePlatform()
  const bosses = testBosses(D)
  const [o, setO] = useState(() => last || { chapter: bosses[0].chapter, k: 'C', seconds: 120, god: false })
  const set = (p) => setO((x) => ({ ...x, ...p }))
  const other = pf.id === 'pc' ? '#/game/mano-survivor-test' : '#/game/mano-survivor-pc-test'
  const P = TEST_PERMA
  const stat = (k) => D.balance.perma.stats[k].name
  return (
    <section className="ms-lobby ms-tester">
      <div className="ms-tester__head">
        <a className="ms-btn ms-btn--small" href={exitHref}>
          ◀ 나가기
        </a>
        <h2 className="ms-h">특수보스 테스트</h2>
        <a className="ms-btn ms-btn--small" href={other}>
          {pf.id === 'pc' ? '모바일 버전으로' : 'PC 버전으로'}
        </a>
      </div>
      <p className="ms-dim">테스트 전용이에요. 여기서 한 건 저장되지 않고, 실제 진행과도 섞이지 않아요.</p>
      <div className="ms-panel">
        <p className="ms-sub">1. 특수보스</p>
        <div className="ms-tester__grid">
          {bosses.map((b) => (
            <button key={b.id} type="button" className={`ms-btn ms-btn--small ${o.chapter === b.chapter ? 'ms-btn--primary' : ''}`} aria-pressed={o.chapter === b.chapter} onClick={() => set({ chapter: b.chapter })}>
              {b.chapter}장 · {D.motion.characters[b.id].name}
            </button>
          ))}
        </div>
      </div>
      <div className="ms-panel">
        <p className="ms-sub">2. 전직</p>
        <div className="ms-tester__grid ms-tester__grid--two">
          {TEST_BUILDS.map((k) => (
            <button key={k} type="button" className={`ms-btn ms-btn--small ${o.k === k ? 'ms-btn--primary' : ''}`} aria-pressed={o.k === k} onClick={() => set({ k })}>
              {D.balance.zyo.recipes[k].form === 'ball' ? '탱탱볼 전직' : '냥이 전직'} · {testClassName(k)}
            </button>
          ))}
        </div>
        <p className="ms-dim">
          전직 후 전직 카드(전투력)를 {TEST_POWER}번 고른 상태, 마노 Lv.{TEST_LEVEL}이에요 (나머지 레벨업은 치명타 피해·체력·방어·회복 등). 카드 고르는 과정 없이 시작하자마자 WARNING이 뜨고 바로 특수보스전이에요.
        </p>
      </div>
      <div className="ms-panel">
        <p className="ms-sub">3. 보스 버티는 시간</p>
        <div className="ms-tester__grid ms-tester__grid--four">
          {TEST_TIMES.map((t) => (
            <button key={t} type="button" className={`ms-btn ms-btn--small ${o.seconds === t ? 'ms-btn--primary' : ''}`} aria-pressed={o.seconds === t} onClick={() => set({ seconds: t })}>
              {TEST_TIME_NAMES[t]}
            </button>
          ))}
        </div>
        <label className="ms-reset__check">
          <input type="checkbox" checked={o.god} onChange={(e) => set({ god: e.target.checked })} /> 마노 무적 (맞아도 체력이 줄지 않아요: 패턴 구경용)
        </label>
        <p className="ms-dim">
          마노 강화: {stat('hp')}·{stat('damage')}·{stat('interval')} Lv.{P.hp} · {stat('move')} Lv.{P.move} (최대) · {stat('crit')} Lv.{P.crit} (100%) · SSS 탱탱볼 · 친구냥이·Tizzzz·포탑·축복 모두 있음
        </p>
        <p className="ms-dim">보스 체력은 고른 시간쯤 버티도록 맞춰져요. 싸우는 중에는 위쪽 테스트 막대로 다음 단계로 넘기거나 무적을 켜고 끌 수 있어요.</p>
      </div>
      <button type="button" className="ms-btn ms-btn--primary ms-startbtn" onClick={() => onStart(o)}>
        {o.chapter}장 특수보스 테스트 시작
      </button>
    </section>
  )
}

// over the fight: which phase the special boss is in, and the tester's
// buttons (next phase, Mano unhurtable, again, back)
function TesterBar({ run, onEnd, onRetry }) {
  const ph = testPhase(run)
  const x = run.extra && run.extra.boss
  const T = run.test
  const [, beat] = useState(0)
  const where = !run.extra ? '보스로 가는 중…' : !x || run.extra.phase !== 'fight' ? '특수보스 등장 중…' : `${D.motion.characters[x.extra].name} ${ph.i + 1}/${ph.n}단계`
  return (
    <div className="ms-testbar" onPointerDown={(e) => e.stopPropagation()}>
      <span className="ms-testbar__where">{where}</span>
      <button type="button" className="ms-btn ms-btn--small" disabled={!x || x.state !== 'live'} onClick={() => (skipPhase(run), beat((n) => n + 1))}>
        다음 단계▶
      </button>
      <button type="button" className={`ms-btn ms-btn--small ${T.god ? 'ms-btn--primary' : ''}`} aria-pressed={T.god} onClick={() => ((T.god = !T.god), beat((n) => n + 1))}>
        무적 {T.god ? 'ON' : 'OFF'}
      </button>
      <button type="button" className="ms-btn ms-btn--small" onClick={onRetry}>
        다시
      </button>
      <button type="button" className="ms-btn ms-btn--small" onClick={onEnd}>
        나가기
      </button>
    </div>
  )
}

function Lobby({ tab, setTab, save, img, equipped, chapter, setChapter, notice, onNotice, onEquip, onStart, onFusion, onFuseAll, onChests, onBuy, P, refresh, onImported, onReplay, exitHref, saveError }) {
  const pf = usePlatform()
  const region = regionOf(D, chapter)
  // after chapter 1's first clear, once: a bubble on 마노의 방 saying the
  // coins are spent there (gone for good when that tab is opened or a
  // fight is started from here)
  const coinTip = save.firstCleared.includes(1) && !save.seenCoinTip
  const tipDone = () => {
    if (!coinTip) return
    P.seenCoinTip()
    refresh()
  }
  const pickTab = (k) => {
    if (k === 'stats') tipDone()
    setTab(k)
  }
  const go = () => {
    if (coinTip) P.seenCoinTip()
    onStart()
  }
  const tabs = [
    ['go', '출발'],
    ['gear', '장비'],
    ['stats', '마노의 방'],
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
          <span className="ms-coins" aria-label={`코인 ${save.currency}`}>
            <Sprite name="coin" size={20} />
            {money(save.currency)}
          </span>
        </header>
        <h1 className="ms-title">{GAMES.survivor.title}</h1>
        <nav className="ms-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ms-tab ${tab === k ? 'is-on' : ''}`} onClick={() => pickTab(k)}>
              {label}
              {k === 'gear' && save.chests.length > 0 ? <em className="ms-tab__dot">{save.chests.length}</em> : null}
              {k === 'stats' && coinTip && tab !== 'stats' && (
                <span className="ms-cointip" role="note">
                  <Sprite name="coin" size={18} />
                  <span>
                    모은 코인은 <b>마노의 방</b>에서 써요!
                    <br />
                    체력·공격력 같은 능력치를 영구히 올릴 수 있어요.
                  </span>
                </span>
              )}
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
        {tab === 'go' && <Go save={save} equipped={equipped} chapter={chapter} setChapter={setChapter} onStart={go} />}
        {tab === 'gear' && <Gear save={save} equipped={equipped} onEquip={onEquip} onFusion={onFusion} onFuseAll={onFuseAll} onChests={onChests} />}
        {tab === 'stats' && <Stats save={save} img={img} onBuy={onBuy} />}
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
// the chapter's boss, and the extra special boss that comes after it in the
// chapters that have one
const chapterBoss = (region, ch) => {
  const x = extraOf(D, ch)
  return x ? (
    <>
      {enemyName(D, region, 'boss')}
      <small className="ms-epinfo__extra">+ {D.motion.characters[x].name}</small>
    </>
  ) : (
    enemyName(D, region, 'boss')
  )
}
// at most this many health bars of elites and bosses at once
const MAX_BARS = 4
// below this share of health the screen's edges pulse red
const LOW_HP = 0.3
// an elite or a boss falling holds the fight this long (the hit-stop)
const HIT_STOP_MS = 90
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
  const zy = save.zyo.unlocked
  const zyOn = chapter >= D.balance.zyo.activeFromChapter
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
          {(cats || tz || zy) && (
            <p className="ms-epinfo__crew">
              {cats &&
                D.cats.companions.map((c) => (
                  <span key={c.id} className="ms-crew__cat">
                    <Art id={c.image} alt={c.name} />
                  </span>
                ))}
              {tz && <Art id="tizzzz_face" className="ms-crew__face" alt={D.tizzzz.name} />}
              {zy && <Art id="zyo_face" className="ms-crew__face" alt={D.zyo.name} />}
              <span>
                {[cats && (catsOn ? '고양이들이 함께해요' : `고양이들은 ${D.balance.cats.activeFromChapter}장부터`), save.rerolls > 0 && chapter >= D.balance.rerolls.fromChapter && `리롤 ${save.rerolls}회`, tz && (tzOn ? `${D.tizzzz.name}가 선택지를 고쳐 써 줘요` : `${D.tizzzz.name}는 ${D.balance.tizzzz.activeFromChapter}장부터`), zy && (zyOn ? `${D.zyo.name}와 전직할 수 있어요` : `${D.zyo.name}의 전직은 ${D.balance.zyo.activeFromChapter}장부터`)].filter(Boolean).join(' · ')}
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
    b.id === 'cats' ? save.cats.unlocked : b.id === 'reroll' ? save.rerolls > 0 : b.id === 'tizzzz' ? save.tizzzz.unlocked : b.id === 'zyo' ? save.zyo.unlocked : b.id === 'turret' ? save.turret.unlocked : b.id === 'spring' ? save.story.rewards.includes('snow') : !!save.blessings[b.id]
  return (
    <section className="ms-panel">
      <h3 className="ms-sub">축복과 보물</h3>
      <ul className="ms-bless">
        {D.story.blessings.list.map((b) => {
          const on = owned(b)
          return (
            <li key={b.id} className={on ? 'is-on' : ''}>
              {b.id === 'turret' ? <TurretIcon size={44} className="ms-bless__img" /> : <Art id={b.image} className="ms-bless__img" />}
              <div>
                <p className="ms-bless__name">{b.name}</p>
                <p className="ms-dim">{on ? b.text : `${D.story.rewards[b.from].chapter}장을 깨면 얻어요`}</p>
                {on && b.id === 'zyo' && <RecipeList />}
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

// the pause's own few settings, at its foot: full screen (PC), music and
// sound effects on or off (the same ones as in 설정)
function PauseSettings({ save, P, refresh }) {
  const [full, setFull] = useFullscreen()
  const [snd, setSnd] = useState(audio.getPrefs)
  return (
    <div className="ms-pauseset">
      {setFull && (
        <div className="ms-row">
          <span className="ms-sub">전체 화면</span>
          <OnOff on={full} set={setFull} label="전체 화면" />
        </div>
      )}
      <div className="ms-row">
        <span className="ms-sub">배경음악</span>
        <OnOff
          on={snd.musicOn}
          set={(v) => {
            audio.setPrefs({ musicOn: v })
            setSnd(audio.getPrefs())
          }}
          label="배경음악"
        />
      </div>
      <div className="ms-row">
        <span className="ms-sub">효과음</span>
        <OnOff
          on={save.sound !== false}
          set={(v) => {
            P.setSound(v)
            refresh()
          }}
          label="효과음"
        />
      </div>
    </div>
  )
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
      <FullscreenSetting />
      <section className="ms-panel ms-sound">
        <div className="ms-row">
          <span className="ms-sub">배경음악</span>
          <OnOff on={snd.musicOn} set={(v) => setAudio({ musicOn: v })} label="배경음악" />
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
          <OnOff
            on={save.sound !== false}
            set={(v) => {
              P.setSound(v)
              onImported(P.get())
            }}
            label="효과음"
          />
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
      <ResetProgress save={save} P={P} onImported={onImported} />
    </>
  )
}

// 진행 초기화: everything back to the first visit, after a warning and a
// second, deliberate press (the progress replaced is kept aside in the
// browser: progress.js → resetAll)
function ResetProgress({ save, P, onImported }) {
  const [open, setOpen] = useState(false)
  const [sure, setSure] = useState(false)
  const [msg, setMsg] = useState(null)
  const close = () => (setOpen(false), setSure(false))
  return (
    <section className="ms-panel ms-reset">
      <div className="ms-row">
        <span className="ms-sub">진행 초기화</span>
        {!open && (
          <button type="button" className="ms-btn ms-btn--small ms-btn--danger" onClick={() => (setOpen(true), setMsg(null))}>
            초기화
          </button>
        )}
      </div>
      {!open && <p className="ms-dim">처음 시작한 상태로 되돌려요. 누르면 주의사항이 먼저 나와요.</p>}
      {open && (
        <div className="ms-confirm ms-reset__warn" role="alertdialog" aria-label="진행 초기화 주의사항">
          <p className="ms-sub">⚠ 정말 처음부터 다시 할까요?</p>
          <ul className="ms-reset__list">
            <li>
              지금 진행이 <b>모두 지워져요</b>: 코인 {money(save.currency)} · {save.unlockedChapter}장까지 연 기록 · 무기 {save.inventory.length}개 · 상자 {save.chests.length}개 · 마노 강화 레벨 · 최고 기록
            </li>
            <li>친구냥이·Tizzzz·전직·포탑 같은 합류와 보상, 본 스토리도 처음으로 돌아가요. 마노의 방도 1단계부터예요.</li>
            <li>
              <b>되돌리기 버튼은 없어요.</b> 나중에 돌아오고 싶다면 먼저 백업 파일을 내보내 두세요.
            </li>
            <li>소리 설정은 그대로 남아요.</li>
          </ul>
          <button type="button" className="ms-btn ms-btn--small" onClick={() => (download(P.exportText(), exportName()), setMsg({ text: '백업 파일을 내보냈어요.' }))}>
            지금 진행 백업 내보내기
          </button>
          <label className="ms-reset__check">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> 위 내용을 확인했고, 모든 진행을 지워도 괜찮아요
          </label>
          <div className="ms-row ms-row--two">
            <button type="button" className="ms-btn" onClick={close}>
              취소
            </button>
            <button
              type="button"
              className="ms-btn ms-btn--danger"
              disabled={!sure}
              onClick={() => {
                const ok = P.resetAll()
                close()
                onImported(P.get())
                setMsg(ok ? { text: '처음 상태로 초기화했어요.' } : { text: '초기화했지만 저장하지 못했어요. 이 브라우저에서는 저장이 막혀 있어요.', bad: true })
              }}
            >
              모두 지우고 처음부터
            </button>
          </div>
        </div>
      )}
      {msg && <p className={msg.bad ? 'ms-why' : 'ms-ok'}>{msg.text}</p>}
    </section>
  )
}

// the cutscenes already seen, region by region, to watch again (nothing is
// given or saved by watching)
function StoryReplay({ save, onReplay }) {
  // (a group with no cuts is only a reward: nothing to watch)
  const seen = CUT_GROUPS.filter((g) => g.cuts.length && save.story.seen.includes(g.id))
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

// 마노의 방 (room.js): the room above the coin stats, filling as they go up
function Room({ save, img, roomRef }) {
  const ref = useRef(null)
  const total = roomTotal(save.perma)
  const cats = !!save.cats.unlocked
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !img) return
    const room = createRoom(canvas, img, D, { cats, total, font: "'Jua', system-ui, sans-serif" })
    roomRef.current = room
    if (import.meta.env.DEV) window.__room = room
    const fit = () => room.resize(canvas.clientWidth || 240)
    fit()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    ro?.observe(canvas)
    return () => {
      ro?.disconnect()
      room.destroy()
      roomRef.current = null
    }
    // (made once; the levels and the cats come in below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img])
  useEffect(() => roomRef.current?.setTotal(total), [total, roomRef])
  useEffect(() => roomRef.current?.setCats(cats), [cats, roomRef])
  // its growth: the stage it is at, and how far on to the next
  const P = roomProgress(D, total)
  const S = D.room.stages
  return (
    <div className="ms-room">
      <div className="ms-room__head">
        <span className="ms-room__stage">
          성장 단계 {P.stage + 1} / {S.length}
        </span>
        <span className="ms-room__name">{S[P.stage].name}</span>
      </div>
      <canvas ref={ref} className="ms-room__canvas" aria-label={`마노의 방, 성장 단계 ${P.stage + 1}`} />
      <div className="ms-room__grow" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(P.share * 100)} aria-label="다음 성장 단계까지">
        <span style={{ width: `${P.share * 100}%` }} />
      </div>
      <p className="ms-room__next">{P.next ? `다음 단계 「${P.next.name}」까지 강화 ${P.left}번 더 (모든 능력치 강화 횟수 합 ${total} / ${P.next.need})` : `${D.room.completeLine} (모든 능력치 강화 횟수 합 ${total})`}</p>
    </div>
  )
}

// what each coin stat reaches in a fight (game.js, friends.js): the ball and
// the cats share 공격 피해, 공격 주기 and 치명타 확률, in the same proportion
const STAT_REACH = {
  hp: [['idle_s_0', '마노 체력']],
  damage: [['ball', '탱탱볼 피해'], ['cat', '냥이 할퀴기 피해']],
  move: [['idle_s_0', '마노 걷는 속도']],
  interval: [['ball', '탱탱볼 던지는 간격'], ['cat', '냥이 할퀴는 간격']],
  crit: [['ball', '탱탱볼'], ['cat', '냥이']],
  coins: [['coin', '판에서 받는 코인']],
  armor: [['idle_s_0', '마노가 받는 피해 줄이기']],
  regen: [['idle_s_0', '마노 체력 저절로 회복 (최대 체력의 %)']],
}

// what the coin stats reach (under the list; on the PC under the room, where
// there is room for it: survivor.css shows the one for the platform)
function ReachGuide({ save, className = '' }) {
  return (
    <div className={`ms-reachguide ${className}`}>
      <p className="ms-reachguide__title">마노 강화는 어디에 들어가요?</p>
      <ul>
        <li>
          <b>공격 피해 · 공격 주기 · 치명타 확률</b>은 <Sprite name="ball" size={14} /> 탱탱볼과 <Sprite name="cat_hodu_r_0" size={14} /> 친구냥이에 <b>같은 비율로 함께</b> 들어가요. 예) 공격 피해 ×{D.balance.perma.stats.damage.mul} → 탱탱볼도 냥이도 {Math.round((D.balance.perma.stats.damage.mul - 1) * 100)}% 더 아프게
        </li>
        <li>
          <b>판 안의 카드는 따로</b>예요. 탱탱볼 카드는 탱탱볼만, 냥이 카드는 냥이만 세져요.
        </li>
        <li>
          <b>전직</b>하면 그때까지의 탱탱볼 + 냥이 힘이 전직 공격으로 넘어가요. 그래서 마노 강화는 전직 뒤에도 그대로 도움이 돼요.
        </li>
        {!save.cats.unlocked && <li>친구냥이는 5장을 처음 깨면 합류해요. 그 전에는 냥이 쪽 효과가 쓰이지 않아요.</li>}
      </ul>
    </div>
  )
}

function Stats({ save, img, onBuy }) {
  const last = useRef(0)
  const room = useRef(null)
  const [msg, setMsg] = useState('')
  return (
    <section className="ms-panel ms-stats-room">
      <div className="ms-stats-room__room">
        <h3 className="ms-sub">마노의 방</h3>
        <Room save={save} img={img} roomRef={room} />
        <p className="ms-dim">어느 능력치든 강화할 때마다 방이 조금씩 자라요. 방은 꾸미기일 뿐, 능력치는 그대로예요.</p>
        <ReachGuide save={save} className="ms-reachguide--room" />
      </div>
      <div className="ms-stats-room__shop">
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
                <p className="ms-dim">{atMax ? (k === 'crit' ? `${now} (최대 · 판 안 강화 선택지에 더 안 나와요)` : `${now} (최대)`) : `${now} → ${next}`}</p>
                <p className="ms-reach">
                  {STAT_REACH[k].map(([icon, text], i) => (
                    <span key={icon} className={icon === 'cat' && !save.cats.unlocked ? 'is-off' : ''}>
                      {i > 0 && <b>+</b>}
                      <Sprite name={icon === 'cat' ? 'cat_hodu_r_0' : icon} size={14} />
                      {text}
                    </span>
                  ))}
                </p>
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
                  setMsg(r.ok ? (k === 'crit' && r.level >= max ? `${s.name} 최대! 이제 판 안 강화 선택지에 치명타 확률 카드가 나오지 않아요.` : `${s.name} Lv.${r.level}!`) : r.reason)
                  if (r.ok) audio.sfx('confirm'), popButton(e.currentTarget), room.current?.react(k)
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
      <ReachGuide save={save} className="ms-reachguide--shop" />
      <p className="ms-dim">
        치명타 확률은 최대 {pctOf(D.balance.perma.stats.crit.max)}, 이동 속도는 {D.balance.perma.stats.move.maxLevel}단계, 방어력은 {D.balance.perma.stats.armor.maxLevel}단계, 회복은 초당 최대 {pctOf(D.balance.perma.stats.regen.max)}까지 올릴 수 있어요. 치명타 확률이 {pctOf(D.balance.perma.stats.crit.max)}가 되면 판 안에서 치명타 확률 카드가 더는 나오지 않아요.
      </p>
      </div>
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

// the turret's making (turret.js): this run's upgrades that can go into it,
// how many picks of each are left, the cost picks chosen with − and +, what
// is left after; 제작하기 takes them back and puts a turret on the field
// zyo_'s class changes as sums: card + card = class (balance.json → zyo
// recipes); with a run, how far it is (n/7), else how many it takes
function RecipeList({ run, only }) {
  const need = D.balance.zyo.need
  const list = run ? recipes(run) : Object.entries(D.balance.zyo.recipes).map(([k, r]) => ({ k, mats: r.mats, picks: null, ready: false }))
  return (
    <ul className="ms-recipes">
      {list
        .filter((r) => !only || only.includes(r.k))
        .map((r) => (
          <li key={r.k} className={r.ready ? 'is-ready' : ''}>
            {r.mats.map((m, i) => (
              <span key={m} className="ms-recipes__mat">
                {i > 0 && <b className="ms-recipes__op">+</b>}
                {OPTIONS[m].name} <small>{r.picks ? `${Math.min(need, r.picks[i])}/${need}` : `${need}번`}</small>
              </span>
            ))}
            <span className="ms-recipes__cls">
              <b className="ms-recipes__op">=</b> {OPTIONS['cls' + r.k].name}
            </span>
          </li>
        ))}
    </ul>
  )
}

// the level-up's guide to the class change: the recipe this run is closest
// to (all four on the PC, or when asked), and when one is complete
function RecipeGuide({ run }) {
  const pf = usePlatform()
  const [all, setAll] = useState(pf.id === 'pc')
  const need = D.balance.zyo.need
  const ready = recipes(run).filter((r) => r.ready)
  // (all those level at the top: 5/7 + 5/7 and 5/7 + 5/7 both)
  const near = ready.length ? ready : zyoTargets(run)
  return (
    <div className="ms-guide">
      <p className="ms-guide__title">
        {ready.some((r) => run.choices && run.choices.includes('cls' + r.k))
          ? '전직 카드가 나왔어요! 고르면 전직해요'
          : ready.length
            ? '전직 준비 끝! 전직 카드가 나오면 고르세요'
            : `전직: 같은 계열 강화 2종을 ${need}번씩 모으면 전직 카드가 나와요 (다 모으면 다음 레벨업에 꼭 나와요)`}
        <button type="button" className="ms-guide__more" onClick={() => setAll((v) => !v)}>
          {all ? '접기' : '레시피 전체'}
        </button>
      </p>
      {(all || near.length > 0) && <RecipeList run={run} only={all ? null : near.map((r) => r.k)} />}
    </div>
  )
}

function TurretCraft({ run, pick, setPick, onCancel, onMake }) {
  const cost = D.balance.turret.cost
  const have = materials(run)
  // (after the class change the picks that do nothing now come first: free)
  const ids = Object.keys(have).sort((a, b) => sunk(run, b) - sunk(run, a) || have[b] - have[a] || a.localeCompare(b))
  const chosen = Object.values(pick).reduce((a, n) => a + n, 0)
  const gone = run.cls ? D.balance.zyo.recipes[run.cls.k].mats : null
  const set = (id, n) => {
    const next = { ...pick, [id]: n }
    if (!n) delete next[id]
    setPick(next)
  }
  // several turrets at once: every `cost` picks chosen make one
  const turrets = Math.floor(chosen / cost)
  // (after the class change: every pick that does nothing now, at one tap;
  // an odd one out stays)
  const free = ids.filter((id) => sunk(run, id))
  const freeAll = () => {
    const next = {}
    let left = Math.floor(free.reduce((a, id) => a + have[id], 0) / cost) * cost
    for (const id of free) if (left > 0) (next[id] = Math.min(have[id], left)), (left -= next[id])
    setPick(next)
  }
  return (
    <div className="ms-craft">
      <h2 className="ms-h">{D.turret.craftTitle}</h2>
      <p className="ms-sub ms-center">
        강화 {chosen}개 골랐어요 → 포탑 {turrets}개{chosen % cost ? ` (${cost - (chosen % cost)}개 더 고르면 1개 더)` : ''}
      </p>
      <p className="ms-dim ms-center">{D.turret.craftHint}</p>
      {free.reduce((a, id) => a + have[id], 0) >= cost && (
        <button type="button" className="ms-btn ms-btn--small ms-craft__all" onClick={freeAll}>
          {D.turret.freeAll}
        </button>
      )}
      <ul className="ms-craft__list">
        {ids.map((id) => {
          const n = pick[id] || 0
          const o = OPTIONS[id]
          return (
            <li key={id} className={`${n ? 'is-on' : ''}${sunk(run, id) ? ' is-free' : ''}`}>
              <span className="ms-card__icon ms-craft__icon">
                <CardIcon o={o} size={28} />
              </span>
              <span className="ms-craft__name">
                {optionName(run, id)}
                <small>
                  {have[id]}회{n ? ` → ${have[id] - n}회` : ''}
                  {sunk(run, id) && <em> · {D.turret.free}</em>}
                </small>
              </span>
              <button type="button" className="ms-btn ms-btn--small" aria-label={`${optionName(run, id)} 빼기`} disabled={!n} onClick={() => set(id, n - 1)}>
                −
              </button>
              <b className="ms-craft__n">{n}</b>
              <button type="button" className="ms-btn ms-btn--small" aria-label={`${optionName(run, id)} 더하기`} disabled={n >= have[id]} onClick={() => set(id, n + 1)}>
                +
              </button>
            </li>
          )
        })}
      </ul>
      {gone && <p className="ms-dim ms-center">{gone.map((m) => OPTIONS[m].name).join('·')}: {D.turret.classMats.replace('{n}', D.balance.zyo.need)}</p>}
      <div className="ms-row ms-row--two">
        <button type="button" className="ms-btn" onClick={onCancel}>
          {D.turret.craftCancel}
        </button>
        <button type="button" className="ms-btn ms-btn--primary" disabled={!turrets || chosen % cost !== 0} onClick={() => onMake(Object.entries(pick).flatMap(([id, n]) => Array(n).fill(id)))}>
          {chosen % cost ? `${cost - (chosen % cost)}개 더 골라 주세요` : turrets ? `포탑 ${turrets}개 ${D.turret.craftGo}` : D.turret.craftGo}
        </button>
      </div>
    </div>
  )
}

function Battle({ img, G, P, save, firstTime, modal, setModal, onRetry, onNext, onEquip, onChests, refresh, rerender }) {
  const pf = usePlatform()
  const [SW, SH] = pf.screen
  const stageRef = useRef(null)
  // the level-up's "my stats" box: stays open or shut across a run's level-ups
  const [showStats, setShowStats] = useState(false)
  // the turret's making screen (turret.js), for the cards on show: { seq, pick: { id: n } }
  const [craft, setCraft] = useState(null)
  const canvasRef = useRef(null)
  const joyRef = useRef(null)
  const knobRef = useRef(null)
  const [hint, setHint] = useState(firstTime)
  const [toast, setToast] = useState(null)
  const [warning, setWarning] = useState(null) // the extra special boss's WARNING!: { key, name, line, final }
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
    // Esc: the pause, and Esc again: back to the fight (from 포기할까요?,
    // back to the pause). While a card is being chosen too: the pause shows
    // over it, and closing it brings the cards back as they were
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.repeat) return
      const m = modalRef.current
      if (!m) {
        if (g.run.state === 'play' || g.run.state === 'levelup') {
          release()
          setModal({ kind: 'pause' })
        }
      } else if (m.kind === 'pause') setModal(null)
      else if (m.kind === 'quit') setModal({ kind: 'pause' })
    }
    addEventListener('keydown', onKey)
    // leaving full screen (where the browser takes Esc for that) pauses too
    const onFull = () => !document.fullscreenElement && away()
    document.addEventListener('fullscreenchange', onFull)

    // short notices over the battle
    let toastTimer
    const say = (text, ms = 2200) => {
      setToast(text)
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => setToast(null), ms)
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
      // (a hit-stop: an elite or a boss just fell, the fight holds a moment)
      const held = now < (g.holdUntil || 0)
      if (!paused && !held && run.state !== 'over') step(run, dt, g.input)
      // (the special-boss tester's own doings: tester.js)
      if (run.test && run.state !== 'over') testTick(run)
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
      // the fight's sounds: one of each kind a frame at most
      let hits = 0
      let crits = 0
      let kills = 0
      let big = false
      for (const ev of run.events) {
        if (ev.type === 'hit') ev.crit ? crits++ : hits++
        else if (ev.type === 'die') D.balance.enemies[ev.kind] && D.balance.enemies[ev.kind].rank ? (big = true) : kills++
        else if (ev.type === 'hurt') audio.sfx('hurt')
        else if (ev.type === 'skillHit') audio.sfx(ev.kind === 'ball' ? 'boom' : 'slash')
        else if (ev.type === 'turretShot') audio.sfx('turret')
        else if (ev.type === 'bossShot') audio.sfx('bossShot')
        else if (ev.type === 'bossRage') audio.sfx('rage')
        else if (ev.type === 'corrupt') audio.sfx('corrupt')
        else if (ev.type === 'voidShot') audio.sfx('voidShot')
      }
      if (big) {
        audio.sfx('bigkill')
        g.holdUntil = now + HIT_STOP_MS
      } else if (crits) audio.sfx('crit')
      else if (hits) audio.sfx('hit')
      if (kills) audio.sfx('kill')
      for (const ev of run.events) {
        // the extra special boss's turn: the music hushes, then WARNING!
        // with its name and line and the siren, then the fight
        if (ev.type === 'extraCalm') audio.duck(true)
        else if (ev.type === 'extraWarn') {
          setWarning({ key: run.t, name: ev.name, line: ev.line, final: ev.final })
          audio.siren(ev.final)
        } else if (ev.type === 'extraAppear') audio.duck(false)
        // zyo_'s class change (its notes are drawn by render-zyo.js)
        else if (ev.type === 'classChange') audio.sfx('transform')
        else if (ev.type === 'classReady') say(`${OPTIONS['cls' + ev.k].name} 전직 완료!`)
        else if (ev.type === 'warp') audio.sfx('warp')
        else if (ev.type === 'skillCast') audio.sfx(ev.kind === 'ball' ? 'meteor' : 'shadow')
        else if (ev.type === 'powerUp') audio.sfx('powerup')
        else if (ev.type === 'revive') audio.sfx('revive'), say(`${D.zyo.classes.B.special}! 체력을 모두 채우고 일어났어요`)
        if (ev.type === 'elite' && ev.flee) say(`${ev.name} 등장! ${ev.flee}초 안에 잡지 못하면 달아나요!`, 4000)
        else if (ev.type === 'elite') say(`${ev.name} 등장!`)
        else if (ev.type === 'boss') say(run.boss && run.boss.guard ? `${ev.name} 등장! 수호를 두르고 있어 쉽게 쓰러지지 않아요` : `${ev.name} 등장! 쓰러뜨려야 클리어예요`)
        else if (ev.type === 'escape') say('보물 도둑이 달아났어요')
      }
      if (overtime(run) && !g.overtimeSaid) {
        g.overtimeSaid = true
        say('보스전 연장! 몬스터가 점점 많아지고 빨라져요')
      }
      R.draw(run, paused || held || run.state === 'levelup' ? 0 : dt)
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
      audio.stopSiren()
      audio.duck(false)
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
      document.removeEventListener('fullscreenchange', onFull)
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
  const thief = run.enemies.find((e) => e.behavior === 'flee' && e.state === 'live')
  const ot = overtime(run)
  // where the chapter is: the waves before the boss (n/6), the time left
  // until the boss comes, then the boss fight; a track with the elites and
  // the boss on it
  const C = D.balance.chapter
  const bossAt = C.events.find((e) => e.key === 'boss').at
  const waves = C.phases.filter((ph) => ph.from < bossAt)
  const waveNo = waves.filter((ph) => ph.from <= run.t).length
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
  const stageText = run.extra ? '특별 보스전' : run.boss ? (ot ? '보스전 연장' : '보스전') : `${waveNo}/${waves.length} 웨이브`
  const timeText = run.boss ? clock(run.t) : `보스 ${clock(Math.max(0, Math.ceil(bossAt - run.t)))}`
  const R0 = JOY.radius * k

  return (
    <div className="ms-stage" ref={stageRef}>
      <canvas ref={canvasRef} className="ms-canvas" aria-label="전투 화면" />
      {run.state === 'play' && p.hp > 0 && p.hp / p.maxHp < LOW_HP && <i className="ms-lowhp" aria-hidden="true" />}
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
          {money(Math.ceil(p.hp))} / {money(Math.round(p.maxHp))}
        </div>
        <div className="ms-hudrow" style={box(H.xp)}>
          <Bar w={H.xp[2] * k} h={H.xp[3] * k} fill="exp_full" value={run.xp / run.need} label="경험치" />
        </div>
        <div className="ms-hudtext ms-hudtext--level" style={box(H.level)}>
          <b>LV.{run.level}</b>
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
        {thief &&
          (() => {
            // the treasure thief's time: under the health bars, running out
            const [x, y, w, h] = H.bossBar
            const f = bars.length > 1 ? 0.8 : 1
            const stay = D.balance.enemies[thief.type].staySeconds
            const left = Math.max(0, stay - thief.life)
            return (
              <div className={`ms-thieftime${left < 8 ? ' is-late' : ''}`} style={box([x, y + bars.length * h * f + h * 0.1, w, h * 0.8])} role="timer" aria-label={`보물 도둑이 달아나기까지 ${Math.ceil(left)}초`}>
                <span className="ms-thieftime__text">도둑이 달아나기까지 {Math.ceil(left)}초</span>
                <span className="ms-thieftime__bar">
                  <i style={{ width: `${(left / stay) * 100}%` }} />
                </span>
              </div>
            )
          })()}
        <div className="ms-wslot" style={box(H.weaponSlot)} aria-label={`장착: ${weaponName(run.weaponDef.id)} ${run.grade}`}>
          <Sprite name="weapon_slot" size={H.weaponSlot[2] * k} />
          <Sprite name={weaponIcon(run.weaponDef.id)} size={H.weaponSlot[2] * 0.55 * k} className="ms-wslot__icon" />
          <span className="ms-wslot__g" style={{ '--g': GRADE_COLOR[run.grade] }}>
            {run.grade}
          </span>
        </div>
      </div>
      {toast && <p className="ms-toast">{toast}</p>}
      {warning && (
        <div key={warning.key} className={`ms-xwarn${warning.final ? ' is-final' : ''}`} role="alert" onAnimationEnd={(e) => e.target === e.currentTarget && setWarning(null)}>
          <i className="ms-xwarn__band ms-xwarn__band--top" />
          {warning.final && <i className="ms-xwarn__eclipse" />}
          <p className="ms-xwarn__word">WARNING!</p>
          <p className="ms-xwarn__name">{warning.name}</p>
          <p className="ms-xwarn__line">{warning.line}</p>
          <i className="ms-xwarn__band ms-xwarn__band--bottom" />
        </div>
      )}
      {hint && <p className="ms-hint">{pf.input === 'keys' ? 'WASD나 방향키로 마노가 달려요. 공격은 자동이에요. Esc: 일시정지 · 다시 Esc: 계속' : '화면 아무 곳이나 누른 채 움직이면 마노가 달려요. 공격은 자동이에요.'}</p>}
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
          <div className={`ms-level${run.choices.length > 3 ? ' ms-level--four' : ''}`}>
            {/* (the turret's making screen has its own title) */}
            {!(craft && craft.seq === run.choiceSeq) && (
              <>
                <h2 className="ms-h">이번 판의 행운은?</h2>
                <p className="ms-dim ms-center">하나를 골라 주세요{run.pending > 1 ? ` (남은 선택 ${run.pending})` : ''}</p>
                <button type="button" className="ms-btn ms-btn--small ms-runstats__toggle" aria-expanded={showStats} onClick={() => setShowStats((v) => !v)}>
                  {showStats ? '능력치 닫기' : '내 능력치 보기'}
                </button>
                {showStats && <RunStats run={run} />}
                {run.zyo && !run.cls && <RecipeGuide run={run} />}
                {run.cls && run.turretOn && Object.keys(materials(run)).some((id) => sunk(run, id)) && (
                  <div className="ms-guide">
                    <p className="ms-guide__title">{D.turret.sunkNote}</p>
                  </div>
                )}
              </>
            )}
            {craft && craft.seq === run.choiceSeq ? (
              <TurretCraft
                run={run}
                pick={craft.pick}
                setPick={(pick) => setCraft({ ...craft, pick })}
                onCancel={() => setCraft(null)}
                onMake={(ids) => {
                  const g = G.current
                  if (g.choosing || performance.now() - (g.cardsAt || 0) < TAP_GAP) return
                  if (makeTurret(run, ids, run.choiceSeq)) {
                    audio.sfx('fuse')
                    g.cardsAt = performance.now()
                    setCraft(null)
                    rerender()
                  }
                }}
              />
            ) : (
            <>
            {run.choices.map((id) => {
              // (the class's growth card wears the class's own name and picture)
              const o = id === 'power' && run.cls ? { ...OPTIONS[id], ...OPTIONS['cls' + run.cls.k] } : OPTIONS[id]
              // Tizzzz's rewrite: the pen crosses the card, the old number is
              // struck out and the stronger one pops in (CSS only, ~1.2 s; the
              // card can be chosen at once, it is stronger from the start)
              const ed = isEdited(run, id, run.choiceSeq)
              const zy = !!run.zyoPick && run.zyoPick.seq === run.choiceSeq && run.zyoPick.ids.includes(id)
              const T = D.balance.tizzzz.times
              return (
                <button
                  key={id + run.choiceSeq}
                  type="button"
                  data-sfx="none"
                  className={`ms-card${ed ? ' is-edited' : ''}${zy ? ' is-zyo' : ''}${isClassCard(id) ? ' is-class' : ''}`}
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
                    g.fx = { key, x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height, o, name: optionName(run, id), tag: effectTag(id, n, run), text: change(run, id, n) }
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
                    <CardIcon o={o} />
                  </span>
                  <span className="ms-card__body">
                    <span className="ms-card__name">{optionName(run, id)}</span>
                    {!isClassCard(id) && id !== 'power' && <Pips n={run.picks[id] || 0} />}
                    {o.text && <span className="ms-card__what">{o.text}</span>}
                    {ed ? (
                      <span className="ms-card__num">
                        <s className="ms-card__old">{effectTag(id, 1, run)}</s> <b className="ms-card__new">{effectTag(id, T, run)}</b>{' '}
                        <span className="ms-card__new">
                          <Marked text={change(run, id, T)} />
                        </span>
                      </span>
                    ) : (
                      <span className="ms-card__num">
                        <b>{effectTag(id, 1, run)}</b> {change(run, id)}
                      </span>
                    )}
                    {cardHint(run, id) && <span className="ms-card__hint">{cardHint(run, id)}</span>}
                  </span>
                  {zy && <em className="ms-card__badge ms-card__badge--zyo">{isClassCard(id) ? D.zyo.classBadge : D.zyo.badge}</em>}
                  {ed && (
                    <>
                      <em className="ms-card__badge">
                        <Pen /> {D.tizzzz.edit.badge}
                      </em>
                    </>
                  )}
                </button>
              )
            })}
            {/* the turret (chapter 20's reward): two picks of this run's upgrades become a turret */}
            {canMake(run) && (
              <button
                type="button"
                className="ms-turretopt"
                onClick={() => {
                  const g = G.current
                  if (g.choosing || performance.now() - (g.cardsAt || 0) < TAP_GAP) return
                  audio.sfx('tick')
                  setCraft({ seq: run.choiceSeq, pick: {} })
                }}
              >
                <TurretIcon size={48} className="ms-turretopt__art" />
                <span className="ms-turretopt__body">
                  <b>{D.turret.option}</b>
                  <span>{D.turret.optionText}</span>
                  <small>
                    바꿀 수 있는 강화 {Object.values(materials(run)).reduce((a, n) => a + n, 0)}회{run.turrets.length ? ` · 설치된 포탑 ${run.turrets.length}개` : ''}
                  </small>
                </span>
              </button>
            )}
            {/* the rerolls (chapter 5's reward): three other cards, while any are left this run */}
            {(run.rerolls > 0 || run.stats.rerolls > 0) && (
              <button
                type="button"
                className="ms-btn ms-btn--small ms-reroll"
                disabled={run.rerolls <= 0}
                onClick={() => {
                  const g = G.current
                  if (g.choosing || performance.now() - (g.cardsAt || 0) < TAP_GAP) return
                  if (reroll(run, run.choiceSeq)) {
                    audio.sfx('pick')
                    g.cardsAt = performance.now()
                    rerender()
                  }
                }}
              >
                <Art id="reward_reroll" className="ms-reroll__art" />
                {run.rerolls > 0 ? `다시 뽑기 (${run.rerolls}회 남음)` : '다시 뽑기를 다 썼어요'}
              </button>
            )}
            </>
            )}
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
              계속하기{pf.input === 'keys' ? ' (Esc)' : ''}
            </button>
            <button type="button" className="ms-btn" onClick={() => setModal({ kind: 'quit' })}>
              장비로
            </button>
            <PauseSettings save={save} P={P.current} refresh={refresh} />
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
// a cut's line; {next}: the next region's name (story.json → regions) with
// its particle, 로 or 으로 (a final consonant other than ㄹ takes 으로)
function cutText(cut) {
  if (!cut.text.includes('{next}')) return cut.text
  const g = CUT_GROUPS.find((x) => x.id === cut.group)
  const R = D.story.regions
  const next = R[Math.min(R.length - 1, R.indexOf(regionOf(D, g.chapter)) + 1)].name
  const code = next.charCodeAt(next.length - 1) - 0xac00
  const fin = code >= 0 && code < 11172 ? code % 28 : 0
  return cut.text.replace('{next}', next + (fin && fin !== 8 ? '으로' : '로'))
}

// what each of chapter 5's reward pictures stands for (under the picture)
const REWARD_CAPTION = {
  reward_cats: () => D.cats.companions.map((c) => c.name).join('·'),
  reward_s_ball: (R) => `${R.ball}급 탱탱볼`,
  ball_ss: (R) => `${R.ball}급 탱탱볼`,
  blessing_tizzzz: () => `${D.tizzzz.name} 선택지 수정`,
  reward_zyo: () => `${D.zyo.name} 전직`,
  reward_turret: () => D.turret.name,
  reward_reroll: (R) => (R.rerolls > 2 ? `리롤 +2 (총 ${R.rerolls}회)` : `리롤 ${R.rerolls}회`),
}

const leftoverCuts = (save) => CUT_GROUPS.filter((g) => g.when === 'clear' && save.firstCleared.includes(g.chapter) && !save.story.seen.includes(g.id))
// the opening (story.json → when: launch) not yet seen: played as soon as the
// game opens; on a first visit (nothing played yet) chapter 1 begins right
// after it, with no lobby between (asked for)
const openingCuts = (save) => CUT_GROUPS.filter((g) => g.when === 'launch' && !save.story.seen.includes(g.id))
const firstVisit = (save) => save.firstCleared.length === 0 && save.unlockedChapter <= 1

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
  // (a group that is only a reward, with no cuts, counts as seen at once)
  useEffect(() => {
    for (const g of list) if (!g.cuts.length) mark(g.id)
  }, [])
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
                {REWARD_CAPTION[id] && <small>{REWARD_CAPTION[id](R)}</small>}
              </span>
            ))}
          </div>
          <div className="ms-cut__words">
            {R.lines.map((t) => (
              <p key={t} className="ms-cut__line">
                {t}
              </p>
            ))}
            {R.cats && <p className="ms-dim ms-center">{D.balance.cats.activeFromChapter}장부터 함께 다니며 코인과 경험치를 주워 와요. 강화 선택지에 친구냥이도 나와요.</p>}
            {R.rerolls && <p className="ms-dim ms-center">{D.balance.rerolls.fromChapter}장부터 한 판에 {R.rerolls}번, 강화 선택지를 새로 뽑을 수 있어요.</p>}
            {R.tizzzz && <p className="ms-dim ms-center">{D.balance.tizzzz.activeFromChapter}장부터 선택지를 고쳐 써 줘요.</p>}
            {R.turret && <p className="ms-dim ms-center">{D.balance.turret.activeFromChapter}장부터 레벨업 때: 이번 판 강화 {D.balance.turret.cost}개 = 포탑 1개. 포탑은 알아서 쏴요.</p>}
            {R.zyo && <p className="ms-dim ms-center">{D.balance.zyo.activeFromChapter}장부터 같은 계열 강화 2종을 {D.balance.zyo.need}번씩 모으면 전직 카드가 나와요 (한 판에 한 번).</p>}
            {R.zyo && <RecipeList />}
            <button type="button" className="ms-btn ms-btn--primary" onClick={() => setI(i + 1)}>
              확인
            </button>
          </div>
        </div>
      </div>
    )
  }
  const cut = cuts[i]
  // a wide (16:9) picture fills the screen on the PC, the words over its foot
  // (every cut is wide now: story.json)
  const info = artInfo(cut.image)
  const wide = !!(info && info.out && info.out[0] > info.out[1])
  return (
    <div className={`ms-modal ms-cut${wide ? ' ms-cut--wide' : ''}`} role="dialog" aria-modal="true" aria-label="이야기">
      {/* a system line across the top (작가 Tizzzz가 나타났다!) */}
      {cut.banner && (
        <p key={'banner' + i} className="ms-cut__banner">
          {cut.banner}
        </p>
      )}
      <div className="ms-cut__pic" onClick={next}>
        {/* the group's pictures stay in place, only one shown: changing cuts never flashes */}
        {cuts.map((c, k) => (
          <Art key={c.image} id={c.image} className={k === i ? 'is-on' : ''} />
        ))}
      </div>
      <div className="ms-cut__box">
        <p className="ms-cut__text">
          <span className="ms-cut__who">{cut.who || D.story.cutscenes.speaker}</span>
          {cutText(cut)}
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
          {/* a chapter's reward with no cutscene to show it (chapter 15: its rerolls) */}
          {rw.story && !CUT_GROUPS.some((g) => g.reward === rw.story.reward) &&
            D.story.rewards[rw.story.reward].lines.map((t) => (
              <p key={t}>
                <Art id={D.story.rewards[rw.story.reward].images[0]} className="ms-reward__art" /> {t}
              </p>
            ))}
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
