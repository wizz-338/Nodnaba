import { useEffect, useRef, useState } from 'react'
import { useGame } from '../ProjectZeroPage'
import { evidenceOpen, isSolved, puzzleOpen, unlockedBy } from '../progress'
import { pz } from '../routes'
import { Btn, Icon, LinkBtn, Panel, Tag, Title, cx } from '../ui'

export function PuzzleList({ c }) {
  const g = useGame()
  const solved = g.solvedOf(c.id)
  return (
    <div data-testid="pz-puzzle-list">
      <Title>퍼즐 · 순서대로 해제</Title>
      <ul>
        {c.puzzles.map((p) => {
          const ok = isSolved(solved, p.id)
          if (!puzzleOpen(c, solved, p.id)) {
            return (
              <li key={p.id} className="pz-item pz-item--locked" aria-disabled="true" data-testid={`pz-pz-${p.id}`}>
                <Icon name="lock" />
                <div className="pz-grow">
                  <div className="pz-mono pz-xs">{p.id}</div>
                  <div>잠김 — 이전 퍼즐을 해결하세요</div>
                </div>
              </li>
            )
          }
          return (
            <li key={p.id}>
              <a href={pz.puzzle(c.id, p.id)} className={cx('pz-item', !ok && 'pz-item--live')} data-testid={`pz-pz-${p.id}`}>
                <span className={cx('pz-num', ok && 'pz-num--done')}>{ok ? <Icon name="check" /> : p.order}</span>
                <div className="pz-grow">
                  <div className="pz-mono pz-xs pz-mute">{p.id}</div>
                  <div className="pz-item__t">{p.title}</div>
                </div>
                <Tag tone={ok ? 'signal' : 'warn'}>{ok ? '해결' : '진행 가능'}</Tag>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const WRONG = ['기록과 맞지 않는다. 증거를 다시 대조하라.', '불일치. 다른 문서와 비교해 보라.', '접근 거부. 추론을 점검하라.']

export function PuzzleDetail({ c, puzzle }) {
  const g = useGame()
  const solved = g.solvedOf(c.id)
  const loc = g.local(c.id)
  const done = isSolved(solved, puzzle.id)
  const hintsUsed = loc.hints[puzzle.id] ?? 0
  const wrong = loc.wrong[puzzle.id] ?? 0
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [fb, setFb] = useState(null)
  const [solvedInput, setSolvedInput] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    setInput('')
    setFb(null)
    setSolvedInput(null)
  }, [puzzle.id])

  const i = c.puzzles.findIndex((p) => p.id === puzzle.id)
  const prevP = i > 0 ? c.puzzles[i - 1] : null
  const nextP = c.puzzles[i + 1] ?? null
  const caseDone = c.puzzles.every((p) => isSolved(solved, p.id))

  const submit = async (e) => {
    e.preventDefault()
    if (busy || done || !input.trim()) return
    setBusy(true)
    const typed = input.trim()
    const res = await g.submit(c.id, puzzle.id, typed)
    setBusy(false)
    if (res.status === 'correct') {
      ref.current?.blur()
      setSolvedInput(typed)
      g.toast(`${puzzle.id} 해결 — 새로운 기록이 해제되었습니다`, 'ok')
    } else if (res.status === 'wrong') {
      setFb({ tone: 'wrong', text: res.message || WRONG[wrong % WRONG.length] })
    } else {
      setFb({ tone: 'invalid', text: res.message })
    }
  }

  return (
    <article data-testid="pz-puzzle">
      <div className="pz-row" style={{ gap: 8 }}>
        <span className="pz-item__id">{puzzle.id}</span>
        {done ? <Tag tone="signal">해결</Tag> : <Tag tone="warn">조사 중</Tag>}
      </div>
      <h1 className="pz-h1" style={{ marginTop: 4 }}>{puzzle.title}</h1>
      <p className="pz-soft" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.8 }}>{puzzle.question}</p>

      <div style={{ marginTop: 16 }}>
        <Title>관련 증거</Title>
        <div className="pz-links">
          {puzzle.evidenceIds.map((id) => {
            const ev = c.evidence.find((e) => e.id === id)
            if (!ev || !evidenceOpen(solved, ev)) return null
            return (
              <a key={id} href={pz.evidence(c.id, id)} className="pz-link" data-testid={`pz-rel-${id}`}>
                <span className="pz-item__id">{id}</span>
                <span className="pz-trunc">{ev.title}</span>
                {!loc.viewed.includes(id) && <span className="pz-dot" style={{ background: 'var(--pz-alert)', width: 6, height: 6 }} aria-label="미열람" />}
              </a>
            )
          })}
        </div>
      </div>

      {!done ? (
        <Panel className="pz-mt">
          <form onSubmit={submit} noValidate>
            <label htmlFor="pz-answer" className="pz-label">
              답 입력 <span className="pz-mute">· {puzzle.format}</span>
            </label>
            <div className="pz-answer">
              <input
                id="pz-answer"
                ref={ref}
                className={cx('pz-input', fb?.tone === 'wrong' && 'pz-input--bad')}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setFb(null)
                }}
                onFocus={(e) => {
                  // keep the field above the phone keyboard once it has opened
                  const el = e.currentTarget
                  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
                }}
                placeholder={puzzle.placeholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize={puzzle.answerKind === 'code' ? 'characters' : 'off'}
                spellCheck={false}
                enterKeyHint="done"
                maxLength={60}
                aria-invalid={fb ? true : undefined}
                aria-describedby="pz-feedback"
                data-testid="pz-answer"
              />
              <Btn type="submit" kind="primary" disabled={busy || !input.trim()} data-testid="pz-submit" style={{ flexShrink: 0, minHeight: 48 }}>
                {busy ? '확인 중' : '확인'}
              </Btn>
            </div>
            <div id="pz-feedback" aria-live="assertive" style={{ minHeight: 24 }}>
              {fb && (
                <p className={cx('pz-msg pz-rise', fb.tone === 'wrong' ? 'pz-msg--bad' : 'pz-msg--warn')} data-testid="pz-feedback" data-tone={fb.tone}>
                  {fb.text}
                </p>
              )}
            </div>
            {wrong > 0 && <p className="pz-mono pz-xs pz-mute" style={{ marginTop: 4 }}>오답 {wrong}회</p>}
          </form>
        </Panel>
      ) : (
        <Panel className="pz-panel--signal pz-mt pz-rise" testId="pz-solved">
          <p className="pz-eyebrow">VERIFIED</p>
          {solvedInput && <p className="pz-solved-in" data-testid="pz-solved-input">{solvedInput}</p>}
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.8 }} data-testid="pz-clue">{solved[puzzle.id]}</p>
          {unlockedBy(c, puzzle.id).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Title>해제된 증거</Title>
              <div className="pz-links">
                {unlockedBy(c, puzzle.id).map((e) => (
                  <a key={e.id} href={pz.evidence(c.id, e.id)} className="pz-link pz-link--signal" data-testid={`pz-unlocked-${e.id}`}>
                    <span className="pz-item__id">{e.id}</span> {e.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            {caseDone && !nextP ? (
              <LinkBtn href={pz.complete(c.id)} kind="primary" className="pz-btn--block pz-btn--tall" testId="pz-to-complete">
                사건 종결 보고서 보기
              </LinkBtn>
            ) : (
              nextP && (
                <LinkBtn href={pz.puzzle(c.id, nextP.id)} kind="primary" className="pz-btn--block pz-btn--tall" testId="pz-next-puzzle">
                  다음 퍼즐 · {nextP.id} {nextP.title}
                </LinkBtn>
              )
            )}
          </div>
        </Panel>
      )}

      <Panel className="pz-mt" testId="pz-hints">
        <Title aside={<span className="pz-mono pz-xs pz-mute">{hintsUsed}/{puzzle.hints.length}</span>}>힌트</Title>
        {hintsUsed === 0 && <p className="pz-small pz-mute">막히면 힌트를 한 단계씩 열 수 있습니다. 사용한 힌트는 종결 보고서에 기록됩니다.</p>}
        <ol>
          {puzzle.hints.slice(0, hintsUsed).map((h, k) => (
            <li key={k} className="pz-hint pz-rise" data-testid={`pz-hint-${k + 1}`}>
              <b>{k + 1}단계</b>
              <span>{h}</span>
            </li>
          ))}
        </ol>
        {hintsUsed < puzzle.hints.length && (
          <Btn className="pz-btn--block" style={{ marginTop: 12 }} onClick={() => g.showHint(c.id, puzzle.id)} data-testid="pz-hint-btn">
            <Icon name="bulb" />
            힌트 {hintsUsed + 1}단계 보기
          </Btn>
        )}
      </Panel>

      <div className="pz-pager">
        {prevP && (
          <a href={pz.puzzle(c.id, prevP.id)}>
            <Icon name="back" /> <span className="pz-trunc">{prevP.id} {prevP.title}</span>
          </a>
        )}
        {nextP && puzzleOpen(c, solved, nextP.id) && (
          <a href={pz.puzzle(c.id, nextP.id)} className="pz-next">
            <span className="pz-trunc">{nextP.id} {nextP.title}</span> <Icon name="chevron" />
          </a>
        )}
      </div>
    </article>
  )
}
