import { useEffect, useRef, useState } from 'react'
import { useGame } from '../ProjectZeroPage'
import { isSolved } from '../progress'
import { go, pz } from '../routes'
import { NOTES_MAX } from '../save'
import { Btn, Panel, Title } from '../ui'

export function Notes({ c }) {
  const g = useGame()
  const solved = g.solvedOf(c.id)
  const [text, setText] = useState(() => g.local(c.id).notes)
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const latest = useRef(text)
  latest.current = text
  const { setNotes } = g

  // saved half a second after typing stops, and when the screen is left
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => {
      setNotes(c.id, latest.current)
      setDirty(false)
    }, 500)
    return () => clearTimeout(t)
  }, [text, dirty, c.id, setNotes])
  useEffect(() => {
    const id = c.id
    return () => setNotes(id, latest.current)
  }, [c.id, setNotes])

  const clues = c.puzzles.filter((p) => isSolved(solved, p.id))

  return (
    <div className="pz-stack" data-testid="pz-notes">
      <Panel>
        <Title aside={<span className="pz-mono pz-xs pz-mute">{clues.length}/{c.puzzles.length}</span>}>획득한 단서</Title>
        {clues.length === 0 ? (
          <p className="pz-small pz-mute">퍼즐을 해결하면 단서가 자동으로 기록됩니다.</p>
        ) : (
          <ol data-testid="pz-clues">
            {clues.map((p) => (
              <li key={p.id} className="pz-clue">
                <div className="pz-item__id">{p.id} · {p.title}</div>
                <p className="pz-soft" style={{ fontSize: 15, lineHeight: 1.75 }}>{solved[p.id]}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel>
        <Title aside={<span className="pz-mono pz-xs pz-mute" data-testid="pz-notes-state">{dirty ? '입력 중…' : '저장됨'}</span>}>조사 노트</Title>
        <textarea
          className="pz-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, NOTES_MAX))
            setDirty(true)
          }}
          onBlur={() => {
            setNotes(c.id, latest.current)
            setDirty(false)
          }}
          rows={10}
          placeholder={'예) 문서마다 시각 기준이 다른가?\n의심 가는 계정·코드 메모'}
          aria-label="조사 노트"
          data-testid="pz-notes-input"
        />
        <p className="pz-mono pz-xs pz-mute" style={{ textAlign: 'right', marginTop: 4 }}>{text.length}/{NOTES_MAX}</p>
      </Panel>

      <Panel>
        <Title>처음부터 다시</Title>
        <p className="pz-small pz-mute">해결 기록(서버)과 이 기기의 힌트·열람·노트 기록을 지우고 CASE {c.id}을 처음부터 다시 시작합니다.</p>
        <Btn
          kind="danger"
          className="pz-btn--block"
          style={{ marginTop: 12 }}
          data-testid="pz-reset"
          onClick={async () => {
            if (!confirm) return setConfirm(true)
            setConfirm(false)
            try {
              await g.resetCase(c.id)
              setText('')
              g.toast('사건을 처음 상태로 되돌렸습니다.')
              go(pz.case(c.id))
            } catch {
              g.toast('초기화하지 못했습니다. 다시 시도해 주세요.', 'alert')
            }
          }}
        >
          {confirm ? '한 번 더 누르면 초기화됩니다' : '사건 초기화'}
        </Btn>
      </Panel>
    </div>
  )
}
