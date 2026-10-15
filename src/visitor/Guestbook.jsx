import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MAX_MESSAGE, MAX_NICK, PAGE_SIZE, checkAdmin, deleteEntry, errorText, fetchPage, postEntry } from './guestbookApi'

const COOLDOWN_KEY = 'nodnaba:gb:last'
const MIN_FILL_MS = 2500 // bots submit instantly

const fmt = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatDate(iso) {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

function readCooldown() {
  try {
    return Number(localStorage.getItem(COOLDOWN_KEY)) || 0
  } catch {
    return 0
  }
}

function Window({ title, children, className = '' }) {
  return (
    <section className={`pxwin ${className}`}>
      <header className="pxwin__bar">
        <span>{title}</span>
        <i aria-hidden="true" />
      </header>
      <div className="pxwin__body">{children}</div>
    </section>
  )
}

function Composer({ onPosted }) {
  const [nick, setNick] = useState('')
  const [msg, setMsg] = useState('')
  const [status, setStatus] = useState(null) // { type: 'ok' | 'err', text }
  const [sending, setSending] = useState(false)
  const openedAt = useRef(Date.now())
  const trap = useRef(null)

  const submit = async (e) => {
    e.preventDefault()
    if (sending) return
    const n = nick.trim()
    const m = msg.trim()
    if (!n || !m) return setStatus({ type: 'err', text: '닉네임과 메시지를 모두 적어 주세요.' })
    // honeypot / too-fast submissions are dropped silently
    if (trap.current?.value || Date.now() - openedAt.current < MIN_FILL_MS) {
      return setStatus({ type: 'err', text: '잠시 후 다시 시도해 주세요.' })
    }
    const wait = 30000 - (Date.now() - readCooldown())
    if (wait > 0) return setStatus({ type: 'err', text: `조금 천천히! ${Math.ceil(wait / 1000)}초 뒤에 다시 남길 수 있어요.` })

    setSending(true)
    setStatus(null)
    try {
      await postEntry(n, m)
      try {
        localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
      } catch {
        /* storage unavailable — the server still rate-limits */
      }
      setMsg('')
      setStatus({ type: 'ok', text: '흔적이 기록됐어요.' })
      onPosted()
    } catch (err) {
      setStatus({ type: 'err', text: errorText(err) })
    } finally {
      setSending(false)
    }
  }

  return (
    <Window title="NEW ENTRY" className="composer">
      <form onSubmit={submit} noValidate>
        <label className="px-label" htmlFor="gb-nick">닉네임</label>
        <input
          id="gb-nick"
          className="px-input"
          value={nick}
          maxLength={MAX_NICK}
          autoComplete="nickname"
          onChange={(e) => setNick(e.target.value)}
          placeholder="이름을 남겨 주세요"
        />
        <label className="px-label" htmlFor="gb-msg">
          메시지
          <span className={`px-count ${msg.length >= MAX_MESSAGE ? 'is-full' : ''}`}>
            {msg.length}/{MAX_MESSAGE}
          </span>
        </label>
        <textarea
          id="gb-msg"
          className="px-input px-textarea"
          value={msg}
          maxLength={MAX_MESSAGE}
          rows={4}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="이곳에 흔적을 남겨 주세요"
        />
        {/* honeypot: hidden from people, tempting to bots */}
        <input ref={trap} className="px-trap" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
        <div className="composer__foot">
          <p className={`px-status ${status ? `is-${status.type}` : ''}`} role="status" aria-live="polite">
            {status?.text}
          </p>
          <button className="px-btn px-btn--primary" type="submit" disabled={sending}>
            {sending ? '전송 중…' : '▶ 등록'}
          </button>
        </div>
      </form>
    </Window>
  )
}

function AdminPanel({ admin, onChange }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const login = async (e) => {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) return setErr('로그인에 실패했어요.')
    setPw('')
    onChange()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    onChange()
  }

  if (admin.user) {
    return (
      <Window title="ADMIN" className="admin">
        <p className="admin__who">
          {admin.user.email} · {admin.isAdmin ? '관리자 권한 있음' : '관리자 권한 없음'}
        </p>
        <button className="px-btn" type="button" onClick={logout}>로그아웃</button>
      </Window>
    )
  }

  return (
    <Window title="ADMIN LOGIN" className="admin">
      <form onSubmit={login} className="admin__form">
        <input className="px-input" type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input className="px-input" type="password" placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        <button className="px-btn" type="submit">로그인</button>
        {err && <p className="px-status is-err">{err}</p>}
      </form>
    </Window>
  )
}

export default function Guestbook({ adminRoute }) {
  const [page, setPage] = useState(0)
  const [state, setState] = useState({ loading: true, rows: [], total: 0, error: null })
  const [admin, setAdmin] = useState({ user: null, isAdmin: false })
  const listTop = useRef(null)

  const load = useCallback(async (p) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { rows, total } = await fetchPage(p)
      setState({ loading: false, rows, total, error: null })
    } catch {
      setState((s) => ({ ...s, loading: false, error: '방명록을 불러오지 못했어요.' }))
    }
  }, [])

  const refreshAdmin = useCallback(() => {
    checkAdmin().then(setAdmin).catch(() => setAdmin({ user: null, isAdmin: false }))
  }, [])

  useEffect(() => {
    if (supabase) load(page)
  }, [page, load])

  useEffect(() => {
    if (supabase) refreshAdmin()
  }, [refreshAdmin])

  if (!supabase) {
    return (
      <Window title="OFFLINE" className="offline">
        <p>방명록 서버가 아직 연결되지 않았어요.</p>
        <p className="offline__hint">관리자: README의 “방명록(Supabase) 설정”을 완료하면 바로 열립니다.</p>
      </Window>
    )
  }

  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE))
  const go = (p) => {
    setPage(p)
    listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const remove = async (id) => {
    if (!confirm(`No.${id} 글을 삭제할까요?`)) return
    try {
      await deleteEntry(id)
      load(page)
    } catch {
      alert('삭제하지 못했어요. 관리자 권한을 확인해 주세요.')
    }
  }

  return (
    <>
      {(adminRoute || admin.user) && <AdminPanel admin={admin} onChange={refreshAdmin} />}
      <Composer
        onPosted={() => {
          if (page === 0) load(0)
          else setPage(0)
        }}
      />

      <div className="log" ref={listTop}>
        <div className="log__head">
          <h2>LOG</h2>
          <span>{state.total} ENTRIES</span>
        </div>

        {state.error && (
          <p className="px-status is-err log__msg">
            {state.error} <button className="px-link" onClick={() => load(page)}>다시 시도</button>
          </p>
        )}
        {state.loading && !state.rows.length && <p className="log__msg blink">LOADING…</p>}
        {!state.loading && !state.error && !state.rows.length && <p className="log__msg">아직 아무도 다녀가지 않았어요. 첫 흔적을 남겨 주세요.</p>}

        <ol className={`entries ${state.loading ? 'is-loading' : ''}`}>
          {state.rows.map((r) => (
            <li key={r.id} className="entry">
              <div className="entry__meta">
                <span className="entry__no">No.{r.id}</span>
                <strong className="entry__nick">{r.nickname}</strong>
                <time dateTime={r.created_at}>{formatDate(r.created_at)}</time>
              </div>
              <p className="entry__msg">{r.message}</p>
              {admin.isAdmin && (
                <button className="px-btn px-btn--danger entry__del" type="button" onClick={() => remove(r.id)}>
                  삭제
                </button>
              )}
            </li>
          ))}
        </ol>

        {pages > 1 && (
          <nav className="pager" aria-label="방명록 페이지">
            <button className="px-btn" type="button" disabled={page === 0} onClick={() => go(page - 1)}>
              ◀ 최근 글
            </button>
            <span>
              {page + 1} / {pages}
            </span>
            <button className="px-btn" type="button" disabled={page >= pages - 1} onClick={() => go(page + 1)}>
              이전 글 ▶
            </button>
          </nav>
        )}
      </div>
    </>
  )
}
