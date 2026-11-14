import { useGame } from '../ProjectZeroPage'
import { stats } from '../progress'
import { pz } from '../routes'
import { Bar, Icon, Tag } from '../ui'

// CASE 001 is the only playable case in v0.1.0; 002–010 are shown locked.
const SLOTS = ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010']

export function Cases() {
  const g = useGame()
  const first = g.cases[0]
  const firstDone = !!first && Object.keys(g.solvedOf(first.id)).length === first.puzzles.length

  return (
    <main className="pz-wrap" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingBottom: 40 }} data-testid="pz-cases">
      <div className="pz-row pz-row--between">
        <div className="pz-grow">
          <p className="pz-eyebrow">CASE FILES</p>
          <h1 className="pz-h1">사건 선택</h1>
        </div>
        <a href={pz.access()} className="pz-chip" aria-label="조사관 정보">
          <span className="pz-dot" />
          <span className="pz-trunc" data-testid="pz-nick-chip">{g.save?.nickname}</span>
        </a>
      </div>

      <ul style={{ marginTop: 20 }} className="pz-stack-s">
        {SLOTS.map((id) => {
          const c = g.caseOf(id)
          if (c) {
            const solved = g.solvedOf(id)
            const loc = g.local(id)
            const s = stats(c, solved, loc)
            const done = s.solved === s.total
            const status = done ? '해결됨' : s.solved > 0 || loc.viewed.length ? '조사 중' : '조사 가능'
            return (
              <li key={id}>
                <a href={pz.case(id)} className="pz-card pz-card--live" data-testid={`pz-case-${id}`}>
                  <div className="pz-row pz-row--between">
                    <span className="pz-mono pz-xs" style={{ color: 'var(--pz-signal)', letterSpacing: '0.15em' }}>{c.code}</span>
                    <Tag tone={done ? 'signal' : 'warn'}>{status}</Tag>
                  </div>
                  <h3>{c.title}</h3>
                  {c.tagline && <p className="pz-soft pz-small">{c.tagline}</p>}
                  <div className="pz-row" style={{ marginTop: 12 }}>
                    <Bar value={s.solved} total={s.total} />
                    <span className="pz-mono pz-xs pz-mute">{s.solved}/{s.total}</span>
                  </div>
                </a>
              </li>
            )
          }
          const title = id === '002' && firstDone && first.next?.title ? first.next.title : '[기밀]'
          return (
            <li key={id}>
              <div className="pz-card pz-card--locked" aria-disabled="true" data-testid={`pz-case-${id}`}>
                <Icon name="lock" />
                <div className="pz-grow">
                  <div className="pz-mono pz-xs" style={{ letterSpacing: '0.15em' }}>CASE {id}</div>
                  <div className="pz-trunc">{title}</div>
                </div>
                <Tag>잠금</Tag>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="pz-xs pz-mute pz-center" style={{ marginTop: 24 }}>잠긴 사건은 이후 업데이트에서 순차 공개됩니다.</p>
      <div className="pz-center" style={{ marginTop: 8 }}>
        <a href="#/" className="pz-btn pz-btn--subtle pz-small">NODNABA 홈으로</a>
      </div>
    </main>
  )
}
