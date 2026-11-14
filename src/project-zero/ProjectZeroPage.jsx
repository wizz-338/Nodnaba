import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import './pz.css'
import * as api from './api'
import { allSolved } from './progress'
import { go, pz, usePzRoute } from './routes'
import { NICK_MAX, NOTES_MAX, clearSave, emptyCase, loadSave, writeSave } from './save'
import { Gate } from './screens/Gate'
import { Intro } from './screens/Intro'
import { Access } from './screens/Access'
import { Cases } from './screens/Cases'
import { CaseView } from './screens/CaseView'
import { Complete } from './screens/Complete'
import { LinkBtn, cx } from './ui'

const Ctx = createContext(null)
export const useGame = () => useContext(Ctx)

export const randomNick = () => `조사관-${1000 + Math.floor(Math.random() * 9000)}`

export default function ProjectZeroPage() {
  // phase: checking → login | denied | not_ready | unconfigured | error | ready
  const [phase, setPhase] = useState({ name: 'checking' })
  const [user, setUser] = useState(null)
  const [cases, setCases] = useState([])
  const [server, setServer] = useState({}) // caseId → { solved: {P01: clue}, epilogue }
  const [save, setSave] = useState(null)
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)
  const { route, hash } = usePzRoute()

  const toast = useCallback((text, tone = 'info') => {
    const id = ++toastId.current
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const fail = useCallback((e) => {
    const kind = e instanceof api.PzError ? e.kind : 'server'
    if (kind === 'denied' || kind === 'signed_out') setPhase({ name: 'login', note: '로그인이 만료되었거나 권한이 없습니다.' })
    else setPhase({ name: kind === 'network' ? 'error' : kind, detail: e?.detail || e?.message })
  }, [])

  // who is signed in, and load the case only for an admin
  const boot = useCallback(async () => {
    setPhase({ name: 'checking' })
    try {
      const who = await api.getAdmin()
      if (!who.user) return setPhase({ name: 'login' })
      setUser(who.user)
      if (!who.isAdmin) return setPhase({ name: 'denied' })
      const list = await api.loadCases()
      const states = {}
      for (const c of list) states[c.id] = await api.loadState(c.id)
      const local = loadSave(who.user.id)
      setCases(list)
      setServer(states)
      setSave(local.save)
      setPhase({ name: 'ready' })
      if (local.status === 'reset') toast('이 기기의 저장 기록이 손상되어 초기화했습니다. (원본은 백업됨)', 'alert')
    } catch (e) {
      fail(e)
    }
  }, [fail, toast])

  useEffect(() => {
    boot()
  }, [boot])

  // keep this phone's record
  useEffect(() => {
    if (save) writeSave(save)
  }, [save])

  // screens change → top of the page; fixed bars must not cover a focused field
  useEffect(() => {
    scrollTo({ top: 0, behavior: 'instant' })
  }, [hash])
  useEffect(() => {
    const el = document.documentElement
    const prev = [el.style.scrollPaddingTop, el.style.scrollPaddingBottom]
    el.style.scrollPaddingTop = '80px'
    el.style.scrollPaddingBottom = 'calc(96px + env(safe-area-inset-bottom))'
    return () => {
      el.style.scrollPaddingTop = prev[0]
      el.style.scrollPaddingBottom = prev[1]
    }
  }, [])

  const local = useCallback((caseId) => save?.cases[caseId] ?? emptyCase(), [save])
  const patchCase = useCallback((caseId, fn) => {
    setSave((s) => {
      if (!s) return s
      const cur = s.cases[caseId] ?? emptyCase()
      const next = fn(cur)
      return next === cur ? s : { ...s, cases: { ...s.cases, [caseId]: next } }
    })
  }, [])
  const started = (c) => (c.startedAt ? c : { ...c, startedAt: Date.now() })

  const api2 = useMemo(() => {
    const caseOf = (id) => cases.find((c) => c.id === id)
    const solvedOf = (id) => server[id]?.solved ?? {}
    return {
      user,
      cases,
      save,
      toast,
      caseOf,
      solvedOf,
      epilogueOf: (id) => server[id]?.epilogue ?? null,
      local,
      setNickname(name) {
        const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NICK_MAX) || randomNick()
        setSave((s) => (s ? { ...s, nickname: clean } : s))
        return clean
      },
      view: (caseId, eid) =>
        patchCase(caseId, (c) => (c.viewed.includes(eid) ? c : started({ ...c, viewed: [...c.viewed, eid] }))),
      showHint(caseId, pid) {
        const p = caseOf(caseId)?.puzzles.find((x) => x.id === pid)
        if (!p) return
        patchCase(caseId, (c) => ((c.hints[pid] ?? 0) >= p.hints.length ? c : { ...c, hints: { ...c.hints, [pid]: (c.hints[pid] ?? 0) + 1 } }))
      },
      setNotes: (caseId, notes) =>
        patchCase(caseId, (c) => (c.notes === notes ? c : { ...c, notes: notes.slice(0, NOTES_MAX) })),
      async submit(caseId, pid, input) {
        try {
          const res = await api.verifyAnswer(caseId, pid, input)
          if (res.status === 'correct') {
            const solved = { ...solvedOf(caseId), [pid]: res.clue }
            const c = caseOf(caseId)
            const done = c && allSolved(c, solved)
            setServer((s) => ({ ...s, [caseId]: { ...(s[caseId] ?? {}), solved } }))
            patchCase(caseId, (x) => {
              const y = started(x)
              return done && !y.completedAt ? { ...y, completedAt: Date.now() } : y
            })
            if (done) {
              const st = await api.loadState(caseId)
              setServer((s) => ({ ...s, [caseId]: st }))
            }
          } else if (res.status === 'wrong') {
            patchCase(caseId, (x) => started({ ...x, wrong: { ...x.wrong, [pid]: (x.wrong[pid] ?? 0) + 1 } }))
          }
          return res
        } catch (e) {
          if (e instanceof api.PzError && e.kind === 'too_fast') return { status: 'invalid', message: '너무 빠르게 입력하고 있다. 잠시 후 다시 시도하라.' }
          if (e instanceof api.PzError && e.kind === 'network') return { status: 'invalid', message: '서버에 닿지 못했다. 연결을 확인하고 다시 시도하라.' }
          fail(e)
          return { status: 'invalid', message: '확인할 수 없다.' }
        }
      },
      async resetCase(caseId) {
        await api.resetCase(caseId)
        setServer((s) => ({ ...s, [caseId]: { solved: {}, epilogue: null } }))
        patchCase(caseId, () => emptyCase())
      },
      async signOut() {
        await api.signOut()
        clearSave()
        setUser(null)
        setSave(null)
        setCases([])
        setServer({})
        go(pz.home(), true)
        setPhase({ name: 'login' })
      },
    }
  }, [user, cases, save, server, toast, local, patchCase, fail])

  let screen
  if (phase.name !== 'ready') {
    screen = <Gate phase={phase} user={user} onRetry={boot} onSignedIn={boot} />
  } else {
    const needsNick = route.name !== 'home' && route.name !== 'access' && route.name !== 'notfound'
    if (needsNick && !save?.nickname) {
      screen = <Redirect to={pz.access()} />
    } else if (route.name === 'home') screen = <Intro />
    else if (route.name === 'access') screen = <Access />
    else if (route.name === 'cases') screen = <Cases />
    else if (route.name === 'complete') screen = <Complete caseId={route.caseId} />
    else if (route.name === 'case' || route.name === 'evidence' || route.name === 'puzzle') screen = <CaseView route={route} />
    else screen = <NotFound />
  }

  return (
    <Ctx.Provider value={api2}>
      <div className="pz" data-testid="pz-root">
        {screen}
        <div className="pz-toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={cx('pz-toast', t.tone === 'ok' && 'pz-toast--ok', t.tone === 'alert' && 'pz-toast--alert')}>
              {t.text}
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  )
}

export function Redirect({ to }) {
  useEffect(() => {
    go(to, true)
  }, [to])
  return null
}

function NotFound() {
  return (
    <main className="pz-screen pz-wrap pz-center" style={{ justifyContent: 'center' }}>
      <p className="pz-eyebrow pz-eyebrow--alert">ERROR 404</p>
      <h1 className="pz-h1" style={{ marginTop: 8 }}>존재하지 않는 기록입니다</h1>
      <LinkBtn href={pz.home()} kind="primary" className="pz-btn--block" testId="pz-home">
        처음으로
      </LinkBtn>
    </main>
  )
}
