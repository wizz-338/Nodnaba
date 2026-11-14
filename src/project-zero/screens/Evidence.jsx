import { useEffect, useState } from 'react'
import { useGame } from '../ProjectZeroPage'
import { evidenceOpen, openEvidence, puzzleOpen } from '../progress'
import { pz } from '../routes'
import { Btn, Icon, Panel, Tag, Title, cx } from '../ui'

export function EvidenceList({ c }) {
  const g = useGame()
  const solved = g.solvedOf(c.id)
  const viewed = g.local(c.id).viewed
  const open = openEvidence(c, solved)

  return (
    <div data-testid="pz-evidence-list">
      <Title aside={<span className="pz-mono pz-xs pz-mute">{open.length}/{c.evidence.length} 해제</span>}>증거 문서</Title>
      <ul>
        {c.evidence.map((e) =>
          evidenceOpen(solved, e) ? (
            <li key={e.id}>
              <a href={pz.evidence(c.id, e.id)} className="pz-item" data-testid={`pz-ev-${e.id}`}>
                <div className="pz-grow">
                  <div className="pz-row" style={{ gap: 8 }}>
                    <span className="pz-item__id">{e.id}</span>
                    <Tag>{e.category}</Tag>
                    {!viewed.includes(e.id) && <Tag tone="alert">NEW</Tag>}
                  </div>
                  <div className="pz-item__t">{e.title}</div>
                  <div className="pz-item__s">{e.summary}</div>
                </div>
                <Icon name="chevron" className="pz-mute" />
              </a>
            </li>
          ) : (
            <li key={e.id} className="pz-item pz-item--locked" data-testid={`pz-ev-locked-${e.id}`}>
              <Icon name="lock" />
              <div className="pz-grow">
                <div className="pz-mono pz-xs">{e.id} · 암호화됨</div>
                <div className="pz-mono pz-small">████████ ███</div>
              </div>
              <Tag>{e.unlockedBy} 해결 시</Tag>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

const ZOOMS = [0.875, 1, 1.125, 1.25, 1.5, 1.75]
const ZOOM_KEY = 'nodnaba:project-zero:zoom'

export function EvidenceDetail({ c, ev }) {
  const g = useGame()
  const solved = g.solvedOf(c.id)
  const [zoom, setZoom] = useState(() => {
    try {
      const v = Number(localStorage.getItem(ZOOM_KEY))
      return ZOOMS.includes(v) ? v : 1
    } catch {
      return 1
    }
  })
  const [wrap, setWrap] = useState(true)
  const { view } = g

  useEffect(() => {
    view(c.id, ev.id)
  }, [c.id, ev.id, view])

  const change = (d) => {
    const z = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom) + d))]
    setZoom(z)
    try {
      localStorage.setItem(ZOOM_KEY, String(z))
    } catch {
      /* ignore */
    }
  }

  const open = openEvidence(c, solved)
  const i = open.findIndex((e) => e.id === ev.id)
  const prev = i > 0 ? open[i - 1] : null
  const next = i >= 0 && i < open.length - 1 ? open[i + 1] : null
  const related = c.puzzles.filter((p) => p.evidenceIds.includes(ev.id) && puzzleOpen(c, solved, p.id))

  return (
    <article data-testid="pz-evidence">
      <div className="pz-row" style={{ gap: 8 }}>
        <span className="pz-item__id">{ev.id}</span>
        <Tag>{ev.category}</Tag>
      </div>
      <h1 className="pz-h1" style={{ fontSize: 20, marginTop: 4 }}>{ev.title}</h1>
      <p className="pz-mono pz-xs pz-mute">{ev.source}</p>

      <div className="pz-doc-tools">
        <div className="pz-row" style={{ gap: 4 }} role="group" aria-label="글자 크기">
          <Btn kind="subtle" onClick={() => change(-1)} disabled={zoom === ZOOMS[0]} aria-label="축소" data-testid="pz-zoom-out" style={{ padding: '0 10px' }}>
            <Icon name="zoomOut" />
          </Btn>
          <span className="pz-mono pz-xs pz-soft" style={{ width: 44, textAlign: 'center' }} data-testid="pz-zoom">{Math.round(zoom * 100)}%</span>
          <Btn kind="subtle" onClick={() => change(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="확대" data-testid="pz-zoom-in" style={{ padding: '0 10px' }}>
            <Icon name="zoomIn" />
          </Btn>
        </div>
        <Btn kind="subtle" className="pz-small" onClick={() => setWrap((w) => !w)} aria-pressed={wrap} style={{ padding: '0 8px' }}>
          로그 줄바꿈 {wrap ? 'ON' : 'OFF'}
        </Btn>
      </div>

      <div className="pz-doc" style={{ fontSize: `${zoom}rem` }} data-testid="pz-evidence-body">
        {ev.blocks.map((b, k) => (
          <Block key={k} b={b} wrap={wrap} />
        ))}
      </div>

      {related.length > 0 && (
        <Panel className="pz-rise pz-mt" testId="pz-related-puzzles">
          <Title>이 증거가 필요한 퍼즐</Title>
          <div className="pz-links">
            {related.map((p) => (
              <a key={p.id} href={pz.puzzle(c.id, p.id)} className="pz-link">
                <span className="pz-item__id">{p.id}</span> {p.title}
              </a>
            ))}
          </div>
        </Panel>
      )}

      <div className="pz-pager">
        {prev && (
          <a href={pz.evidence(c.id, prev.id)}>
            <Icon name="back" /> <span className="pz-trunc">{prev.id} {prev.title}</span>
          </a>
        )}
        {next && (
          <a href={pz.evidence(c.id, next.id)} className="pz-next" data-testid="pz-ev-next">
            <span className="pz-trunc">{next.id} {next.title}</span> <Icon name="chevron" />
          </a>
        )}
      </div>
    </article>
  )
}

const TONE = { accent: 'pz-tone-accent', alert: 'pz-tone-alert', muted: 'pz-tone-muted' }

// Document blocks come from the database: render as text only (React escapes it), never as HTML.
function Block({ b, wrap }) {
  switch (b?.type) {
    case 'heading':
      return <h3>{b.text}</h3>
    case 'para':
      return <p className="pz-p">{b.text}</p>
    case 'kv':
      return (
        <dl className="pz-dl">
          {(b.rows || []).map((r) => (
            <div key={r.k}>
              <dt>{r.k}</dt>
              <dd className={TONE[r.tone] || ''}>{r.v}</dd>
            </div>
          ))}
        </dl>
      )
    case 'log':
      return (
        <figure>
          {b.caption && <figcaption className="pz-cap">{b.caption}</figcaption>}
          <div className={cx('pz-scroll pz-log', wrap && 'pz-log--wrap')} tabIndex={0} aria-label={b.caption || '로그'}>
            <pre>{(b.lines || []).map((l, k) => <div key={k}>{l}</div>)}</pre>
          </div>
        </figure>
      )
    case 'table':
      return (
        <figure>
          {b.caption && <figcaption className="pz-cap">{b.caption}</figcaption>}
          <div className="pz-scroll pz-table" tabIndex={0} aria-label={b.caption || '표'}>
            <table>
              <thead>
                <tr>{(b.columns || []).map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(b.rows || []).map((row, k) => (
                  <tr key={k}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {(b.columns || []).length > 3 && <p className="pz-mute" style={{ fontSize: '0.7em', marginTop: 4 }}>표가 화면보다 넓으면 옆으로 밀어서 보세요.</p>}
        </figure>
      )
    case 'note':
      return (
        <p className={cx('pz-note', b.tone === 'warn' && 'pz-note--warn')}>
          <Icon name={b.tone === 'warn' ? 'alert' : 'file'} />
          <span>{b.text}</span>
        </p>
      )
    case 'quote':
      return (
        <blockquote className="pz-quote">
          {(b.lines || []).map((l) => <p key={l}>{l}</p>)}
          {b.by && <footer>— {b.by}</footer>}
        </blockquote>
      )
    default:
      return null
  }
}
