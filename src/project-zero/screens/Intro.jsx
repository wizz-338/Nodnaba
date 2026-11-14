import { useGame } from '../ProjectZeroPage'
import { PZ_EXIT, pz } from '../routes'
import { LinkBtn } from '../ui'

// Title screen (shown only after the admin check; its lines come from the database)
export function Intro() {
  const g = useGame()
  const c = g.cases[0]
  const receipt = c?.evidence.find((e) => e.unlockedBy == null)?.blocks.find((b) => b.type === 'kv')?.rows ?? []
  const pick = (k) => receipt.find((r) => r.k === k)?.v ?? '—'
  const [first, second] = c?.intro ?? []

  return (
    <main className="pz-screen pz-grid" data-testid="pz-intro">
      <div className="pz-wrap pz-topline">
        <a href={PZ_EXIT}>← ARTIST</a>
        <button type="button" className="pz-btn pz-btn--subtle pz-small" onClick={g.signOut} data-testid="pz-signout">
          로그아웃
        </button>
      </div>
      <div className="pz-wrap pz-screen__body">
        <p className="pz-eyebrow pz-rise">CLASSIFIED ARCHIVE · 2036</p>
        <h1 className="pz-logo pz-rise" data-testid="pz-logo">
          PROJECT
          <br />
          <span className="pz-logo__zero pz-glow">
            ZER<span className="pz-slash">0</span>
          </span>
        </h1>
        <p className="pz-mono pz-small pz-soft" style={{ marginTop: 12 }}>2036 — {c?.title}</p>
        {first && (
          <div className="pz-hook pz-rise">
            <p>{first}</p>
            {second && <p>{second}</p>}
          </div>
        )}
        <div className="pz-receipt pz-rise">
          <div><span>TX</span><b>{pick('거래 번호')}</b></div>
          <div><span>AMOUNT</span><b className="pz-red">{pick('금액')}</b></div>
          <div><span>FROM</span><b>{pick('송금자')}</b></div>
          <div><span>TO</span><b>{pick('수취인')}</b></div>
        </div>
      </div>
      <div className="pz-wrap pz-screen__foot">
        <LinkBtn href={pz.access()} kind="primary" className="pz-btn--block pz-btn--tall" testId="pz-start">
          조사 시작
        </LinkBtn>
        <p className="pz-mono pz-xs pz-mute pz-center" style={{ marginTop: 16, letterSpacing: '0.2em' }} data-testid="pz-version">
          v0.1.0 TEST
        </p>
      </div>
    </main>
  )
}
