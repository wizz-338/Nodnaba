import { useState } from 'react'
import * as api from '../api'
import { PZ_EXIT } from '../routes'
import { Btn, LinkBtn, Panel } from '../ui'

// Everything shown before an admin is confirmed. No case text lives in this file.

function Shell({ children, testId }) {
  return (
    <main className="pz-screen pz-grid" data-testid={testId}>
      <div className="pz-wrap pz-topline">
        <a href={PZ_EXIT}>← ARTIST</a>
        <span className="pz-mono pz-xs pz-mute">PROJECT ZERO</span>
      </div>
      <div className="pz-wrap pz-screen__body">{children}</div>
    </main>
  )
}

export function Gate({ phase, user, onRetry, onSignedIn }) {
  if (phase.name === 'checking') {
    return (
      <Shell testId="pz-checking">
        <p className="pz-mono pz-mute pz-center" aria-busy="true">
          VERIFYING ACCESS<span className="pz-caret">_</span>
        </p>
      </Shell>
    )
  }

  if (phase.name === 'unconfigured' || phase.name === 'not_ready') {
    return (
      <Shell testId="pz-not-ready">
        <Panel className="pz-rise">
          <p className="pz-eyebrow">STANDBY</p>
          <h1 className="pz-h1" style={{ marginTop: 4 }}>준비 중입니다</h1>
          <p className="pz-soft pz-small" style={{ marginTop: 8 }}>
            PROJECT ZERO 기록보관소가 아직 열리지 않았습니다. 잠시 후 다시 확인해 주세요.
          </p>
          <div className="pz-stack-s" style={{ marginTop: 16 }}>
            <Btn className="pz-btn--block" onClick={onRetry}>다시 확인</Btn>
            <LinkBtn href={PZ_EXIT} kind="subtle" className="pz-btn--block">ARTIST로 돌아가기</LinkBtn>
          </div>
        </Panel>
      </Shell>
    )
  }

  if (phase.name === 'denied') {
    return (
      <Shell testId="pz-denied">
        <Panel className="pz-rise">
          <p className="pz-eyebrow pz-eyebrow--alert">ACCESS DENIED</p>
          <h1 className="pz-h1" style={{ marginTop: 4 }}>접근 권한이 없습니다</h1>
          <p className="pz-soft pz-small" style={{ marginTop: 8 }}>
            {user?.email ? `${user.email} 계정은 ` : ''}이 기록보관소의 열람 권한이 없습니다.
          </p>
          <div className="pz-stack-s" style={{ marginTop: 16 }}>
            <Btn
              className="pz-btn--block"
              onClick={async () => {
                await api.signOut()
                onRetry()
              }}
            >
              로그아웃
            </Btn>
            <LinkBtn href={PZ_EXIT} kind="subtle" className="pz-btn--block">ARTIST로 돌아가기</LinkBtn>
          </div>
        </Panel>
      </Shell>
    )
  }

  if (phase.name === 'login') return <Login note={phase.note} onSignedIn={onSignedIn} />

  return (
    <Shell testId="pz-error">
      <Panel className="pz-rise">
        <p className="pz-eyebrow pz-eyebrow--alert">SIGNAL LOST</p>
        <h1 className="pz-h1" style={{ marginTop: 4 }}>연결하지 못했습니다</h1>
        <p className="pz-soft pz-small" style={{ marginTop: 8 }}>네트워크를 확인하고 다시 시도해 주세요.</p>
        {phase.detail && <p className="pz-mono pz-xs pz-mute" style={{ marginTop: 8 }}>{phase.detail}</p>}
        <Btn kind="primary" className="pz-btn--block" style={{ marginTop: 16 }} onClick={onRetry}>
          다시 시도
        </Btn>
      </Panel>
    </Shell>
  )
}

function Login({ note, onSignedIn }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      await api.signIn(email.trim(), pw)
      setPw('')
      onSignedIn()
    } catch (e2) {
      setErr(e2?.kind === 'unconfigured' ? '준비 중입니다.' : '로그인에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell testId="pz-login">
      <Panel className="pz-rise">
        <p className="pz-eyebrow">RESTRICTED ARCHIVE</p>
        <h1 className="pz-h1" style={{ marginTop: 4 }}>관리자 인증이 필요합니다</h1>
        <p className="pz-soft pz-small" style={{ marginTop: 8 }}>
          PROJECT ZERO는 비공개 테스트 중입니다. NODNABA 관리자 계정으로 인증한 사람만 플레이할 수 있습니다.
        </p>
        {note && <p className="pz-msg pz-msg--warn">{note}</p>}
        <form onSubmit={submit} className="pz-stack-s" style={{ marginTop: 16 }}>
          <label>
            <span className="pz-label">이메일</span>
            <input className="pz-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" enterKeyHint="next" data-testid="pz-email" required />
          </label>
          <label>
            <span className="pz-label">비밀번호</span>
            <input className="pz-input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" enterKeyHint="go" data-testid="pz-password" required />
          </label>
          <Btn type="submit" kind="primary" className="pz-btn--block pz-btn--tall" disabled={busy} data-testid="pz-login-btn">
            {busy ? '확인 중…' : '관리자 로그인'}
          </Btn>
          {err && <p className="pz-msg pz-msg--bad" data-testid="pz-login-err">{err}</p>}
        </form>
        <LinkBtn href={PZ_EXIT} kind="subtle" className="pz-btn--block">ARTIST로 돌아가기</LinkBtn>
      </Panel>
    </Shell>
  )
}
