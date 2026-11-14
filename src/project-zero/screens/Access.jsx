import { useEffect, useState } from 'react'
import { randomNick, useGame } from '../ProjectZeroPage'
import { pz } from '../routes'
import { NICK_MAX } from '../save'
import { Btn, LinkBtn, Panel } from '../ui'

const LINES = [
  'ARCHIVE-B2 보안 터미널 연결 중',
  '세계 기록보관소 · 노드 확인 완료',
  '관리자 인증 확인 — 임시 조사관 권한 발급',
  '사건 파일 복호화 키 수신',
  '접속 승인',
]

export function Access() {
  const g = useGame()
  const existing = g.save?.nickname ?? null
  const [phase, setPhase] = useState(existing ? 'connecting' : 'form')
  const [name, setName] = useState('')
  const [suggest] = useState(randomNick)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (phase !== 'connecting') return
    if (shown >= LINES.length) return setPhase('granted')
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 200 : 380)
    return () => clearTimeout(t)
  }, [phase, shown])

  const submit = (e) => {
    e.preventDefault()
    g.setNickname(name || suggest)
    setShown(0)
    setPhase('connecting')
  }

  return (
    <main className="pz-screen pz-grid" data-testid="pz-access">
      <div className="pz-wrap pz-topline">
        <a href={pz.home()}>PROJECT ZERO</a>
        <span className="pz-mono pz-xs pz-mute">ARCHIVE-B2</span>
      </div>
      <div className="pz-wrap pz-screen__body">
        {phase === 'form' && (
          <Panel className="pz-rise">
            <p className="pz-eyebrow">ACCESS REQUEST</p>
            <h1 className="pz-h1" style={{ marginTop: 4 }}>조사관 접속</h1>
            <p className="pz-soft pz-small" style={{ marginTop: 8 }}>
              기록에 남길 조사관 이름을 정하세요. 비워 두면 임시 이름이 배정됩니다.
            </p>
            <form onSubmit={submit} className="pz-stack-s" style={{ marginTop: 16 }}>
              <label>
                <span className="pz-label">조사관 이름</span>
                <input className="pz-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={NICK_MAX} placeholder={suggest} autoComplete="nickname" enterKeyHint="go" data-testid="pz-nickname" />
              </label>
              <Btn type="submit" kind="primary" className="pz-btn--block" data-testid="pz-connect">접속</Btn>
            </form>
          </Panel>
        )}

        {phase !== 'form' && (
          <div className="pz-rise">
            <div className="pz-terminal" data-testid="pz-terminal">
              {existing && <p>조사관 {existing} 재접속 요청</p>}
              {LINES.slice(0, shown).map((l, i) => (
                <p key={l} className={i === LINES.length - 1 ? 'pz-final pz-glow' : ''}>
                  <span className="pz-mute">&gt; </span>
                  {l}
                  {i < LINES.length - 1 && <span className="pz-ok"> ··· OK</span>}
                </p>
              ))}
              {phase === 'connecting' && <span className="pz-caret">_</span>}
            </div>
            {phase === 'connecting' && (
              <Btn kind="subtle" className="pz-btn--block" style={{ marginTop: 12 }} onClick={() => setPhase('granted')}>
                건너뛰기
              </Btn>
            )}
            {phase === 'granted' && (
              <Panel className="pz-panel--signal pz-rise" testId="pz-granted">
                <p className="pz-eyebrow">ACCESS GRANTED</p>
                <h1 className="pz-h1" style={{ marginTop: 4 }}>접속 승인</h1>
                <dl className="pz-stack-s" style={{ marginTop: 12 }}>
                  <div className="pz-kv"><dt>조사관</dt><dd data-testid="pz-investigator">{g.save?.nickname}</dd></div>
                  <div className="pz-kv"><dt>권한</dt><dd>임시 조사관 · LEVEL 1</dd></div>
                  <div className="pz-kv"><dt>열람 가능</dt><dd>{g.cases.map((c) => c.code).join(', ')}</dd></div>
                </dl>
                <LinkBtn href={pz.cases()} kind="primary" className="pz-btn--block pz-btn--tall" testId="pz-to-cases">
                  사건 파일 열기
                </LinkBtn>
                {existing && (
                  <Btn kind="subtle" className="pz-btn--block pz-small" onClick={() => { setName(''); setPhase('form') }}>
                    조사관 이름 변경
                  </Btn>
                )}
              </Panel>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
