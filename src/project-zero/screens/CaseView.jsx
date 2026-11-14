import { useEffect } from 'react'
import { Redirect, useGame } from '../ProjectZeroPage'
import { evidenceOpen, isSolved, nextPuzzle, openEvidence, puzzleOpen, stats } from '../progress'
import { pz } from '../routes'
import { Bar, Icon, LinkBtn, Panel, Title, cx } from '../ui'
import { EvidenceDetail, EvidenceList } from './Evidence'
import { PuzzleDetail, PuzzleList } from './Puzzles'
import { Notes } from './Notes'

export function CaseView({ route }) {
  const g = useGame()
  const c = g.caseOf(route.caseId)
  const solved = g.solvedOf(route.caseId)
  const puzzle = route.name === 'puzzle' ? c?.puzzles.find((p) => p.id === route.puzzleId) : null
  const ev = route.name === 'evidence' ? c?.evidence.find((e) => e.id === route.evidenceId) : null

  let redirect = null
  if (!c || (route.name === 'puzzle' && !puzzle) || (route.name === 'evidence' && !ev)) redirect = pz.cases()
  else if (puzzle && !puzzleOpen(c, solved, puzzle.id)) redirect = pz.case(c.id, 'puzzles')
  else if (ev && !evidenceOpen(solved, ev)) redirect = pz.case(c.id, 'evidence')

  useEffect(() => {
    if (redirect && c) g.toast('아직 잠겨 있는 기록입니다. 앞선 퍼즐을 먼저 해결하세요.', 'alert')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirect])
  if (redirect) return <Redirect to={redirect} />

  const tab = route.name === 'evidence' ? 'evidence' : route.name === 'puzzle' ? 'puzzles' : route.tab
  const loc = g.local(c.id)
  const s = stats(c, solved, loc)
  const fresh = openEvidence(c, solved).filter((e) => !loc.viewed.includes(e.id)).length
  const pending = nextPuzzle(c, solved)
  const back =
    route.name === 'evidence'
      ? { href: pz.case(c.id, 'evidence'), label: '증거 목록' }
      : route.name === 'puzzle'
        ? { href: pz.case(c.id, 'puzzles'), label: '퍼즐 목록' }
        : { href: pz.cases(), label: '사건 목록' }

  let body
  if (ev) body = <EvidenceDetail c={c} ev={ev} />
  else if (puzzle) body = <PuzzleDetail c={c} puzzle={puzzle} />
  else if (tab === 'evidence') body = <EvidenceList c={c} />
  else if (tab === 'puzzles') body = <PuzzleList c={c} />
  else if (tab === 'notes') body = <Notes c={c} />
  else body = <Overview c={c} />

  const nav = [
    ['overview', '개요', 'case'],
    ['evidence', '증거', 'file', fresh || null],
    ['puzzles', '퍼즐', 'key', pending ? 'dot' : null],
    ['notes', '노트', 'note'],
  ]

  return (
    <div>
      <header className="pz-head">
        <div className="pz-head__in">
          <a href={back.href} className="pz-head__back" data-testid="pz-back" aria-label={back.label}>
            <Icon name="back" />
          </a>
          <div className="pz-grow" style={{ padding: '8px 8px 8px 0' }}>
            <div className="pz-row" style={{ gap: 8, alignItems: 'baseline' }}>
              <span className="pz-head__code">{c.code}</span>
              <span className="pz-head__name pz-trunc">{c.title}</span>
            </div>
            <div className="pz-row" style={{ gap: 8, marginTop: 4 }}>
              <Bar value={s.solved} total={s.total} label="사건 진행도" />
              <span className="pz-mono pz-xs pz-mute" data-testid="pz-progress">{s.solved}/{s.total}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="pz-main">{body}</main>

      <nav className="pz-nav" aria-label="사건 메뉴">
        <ul>
          {nav.map(([id, label, icon, badge]) => (
            <li key={id}>
              <a href={pz.case(c.id, id)} aria-current={tab === id ? 'page' : undefined} data-testid={`pz-nav-${id}`}>
                <span className="pz-nav__ico">
                  <Icon name={icon} />
                  {badge === 'dot' && <span className="pz-badge pz-badge--dot" />}
                  {typeof badge === 'number' && <span className="pz-badge">{badge}</span>}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function Overview({ c }) {
  const g = useGame()
  const solved = g.solvedOf(c.id)
  const s = stats(c, solved, g.local(c.id))
  const next = nextPuzzle(c, solved)
  const done = s.solved === s.total

  return (
    <div className="pz-stack" data-testid="pz-overview">
      <Panel>
        <p className="pz-eyebrow pz-eyebrow--alert">BRIEFING · 기밀</p>
        <h1 className="pz-h1" style={{ marginTop: 4 }}>{c.title}</h1>
        <div className="pz-stack-s pz-soft" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.8 }}>
          {c.briefing.map((p) => <p key={p}>{p}</p>)}
        </div>
      </Panel>

      <div className="pz-stats">
        <div className="pz-stat"><b>{s.solved}/{s.total}</b><span>해결한 퍼즐</span></div>
        <div className="pz-stat"><b>{s.viewed}/{s.open}</b><span>열람한 증거</span></div>
        <div className="pz-stat"><b>{s.hints}</b><span>사용한 힌트</span></div>
      </div>

      <Panel>
        <Title>조사 목표</Title>
        <ol>
          {c.puzzles.map((p, i) => {
            const ok = isSolved(solved, p.id)
            return (
              <li key={p.id} className={cx('pz-goal', ok && 'pz-goal--done')}>
                <span className="pz-goal__n">{ok ? <Icon name="check" /> : i + 1}</span>
                <span className="pz-goal__t">{c.objectives[i] ?? p.title}</span>
              </li>
            )
          })}
        </ol>
      </Panel>

      {done ? (
        <LinkBtn href={pz.complete(c.id)} kind="primary" className="pz-btn--block pz-btn--tall" testId="pz-to-complete">
          사건 종결 보고서 보기
        </LinkBtn>
      ) : (
        next && (
          <LinkBtn href={pz.puzzle(c.id, next.id)} kind="primary" className="pz-btn--block pz-btn--tall" testId="pz-continue">
            {s.solved === 0 ? '첫 퍼즐 시작' : '조사 계속'} · {next.id} {next.title}
          </LinkBtn>
        )
      )}
      <LinkBtn href={pz.case(c.id, 'evidence')} className="pz-btn--block">증거 문서 보기</LinkBtn>
    </div>
  )
}

