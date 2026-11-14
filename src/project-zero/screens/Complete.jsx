import { Redirect, useGame } from '../ProjectZeroPage'
import { allSolved, stats } from '../progress'
import { pz } from '../routes'
import { Icon, LinkBtn, Panel, Title } from '../ui'

function duration(ms) {
  if (ms == null || ms < 0) return '—'
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}

export function Complete({ caseId }) {
  const g = useGame()
  const c = g.caseOf(caseId)
  const solved = g.solvedOf(caseId)
  if (!c) return <Redirect to={pz.cases()} />
  if (!allSolved(c, solved)) return <Redirect to={pz.case(caseId)} />

  const s = stats(c, solved, g.local(caseId))
  const epilogue = g.epilogueOf(caseId) ?? []

  return (
    <main className="pz-grid pz-wrap" style={{ paddingTop: 'calc(32px + env(safe-area-inset-top))', paddingBottom: 48 }} data-testid="pz-complete">
      <div className="pz-center">
        <p className="pz-eyebrow">{c.code} · CASE CLOSED</p>
        <h1 className="pz-h1" style={{ fontSize: 30, marginTop: 8 }}>사건 해결</h1>
        <p className="pz-soft">{c.title}</p>
        <div className="pz-rank" data-testid="pz-rank">{s.rank}</div>
        <p className="pz-mono pz-xs pz-mute" style={{ marginTop: 8 }}>조사 등급</p>
      </div>

      <div className="pz-stats pz-stats--4" style={{ marginTop: 24 }}>
        <div className="pz-stat"><b>{s.solved}/{s.total}</b><span>해결 퍼즐</span></div>
        <div className="pz-stat"><b>{s.hints}</b><span>사용 힌트</span></div>
        <div className="pz-stat"><b>{s.wrong}</b><span>오답</span></div>
        <div className="pz-stat"><b>{duration(s.durationMs)}</b><span>소요 시간</span></div>
      </div>

      <div className="pz-stack" style={{ marginTop: 20 }}>
        <Panel testId="pz-epilogue">
          <Title>종결 보고</Title>
          <div className="pz-stack-s pz-soft" style={{ fontSize: 15, lineHeight: 1.8 }}>
            {epilogue.map((p) => <p key={p}>{p}</p>)}
          </div>
        </Panel>

        <Panel>
          <Title>획득한 단서</Title>
          <ol>
            {c.puzzles.map((p) => (
              <li key={p.id} className="pz-goal">
                <Icon name="check" className="pz-tone-accent" />
                <div>
                  <div className="pz-item__id">{p.id} {p.title}</div>
                  <p className="pz-small pz-soft">{solved[p.id]}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        {c.next && (
          <section className="pz-next-case" data-testid="pz-next-case">
            <div className="pz-row pz-row--between">
              <p className="pz-eyebrow pz-eyebrow--alert">NEXT · {c.next.code}</p>
              <span className="pz-mono pz-xs pz-mute pz-row" style={{ gap: 4 }}><Icon name="lock" /> 준비 중</span>
            </div>
            <h2 style={{ fontSize: 20, marginTop: 4 }}>{c.next.title}</h2>
            <p className="pz-small pz-soft" style={{ marginTop: 4 }}>{c.next.text}</p>
          </section>
        )}

        <LinkBtn href={pz.cases()} kind="primary" className="pz-btn--block pz-btn--tall" testId="pz-back-cases">사건 목록으로</LinkBtn>
        <LinkBtn href={pz.case(caseId)} className="pz-btn--block">사건 기록 다시 보기</LinkBtn>
      </div>
    </main>
  )
}
