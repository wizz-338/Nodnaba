import { PROJECT_ZERO_HASH } from '../route'
import './entry-card.css'

// The way into PROJECT ZERO from ARTIST → Tizzzz (its large view). Public: only the
// title and subtitle; the case itself loads after the admin check on the next screen.
export default function ProjectZeroCard() {
  return (
    <a className="pz-entry" href={PROJECT_ZERO_HASH} aria-label="PROJECT ZERO — 2036 최후의 거래 (관리자 전용, 열기)" data-testid="pz-entry-card">
      <span className="pz-entry__top mono">
        <span>CASE FILE · CLASSIFIED</span>
        <span className="pz-entry__lock">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" />
          </svg>
          ADMIN
        </span>
      </span>
      <span className="pz-entry__title">
        PROJECT ZER<span className="pz-entry__zero">0</span>
      </span>
      <span className="pz-entry__sub">2036 — 최후의 거래</span>
      <span className="pz-entry__redact" aria-hidden="true">
        <i style={{ width: '82%' }} />
        <i style={{ width: '58%' }} />
      </span>
      <span className="pz-entry__foot mono">
        <span className="pz-entry__stamp">TOP SECRET</span>
        <span className="pz-entry__go">열람 ▶</span>
      </span>
    </a>
  )
}
