import Diagnostics from './Diagnostics'
import Logo from '../components/Logo'
import './visitor.css'

// Developer-only page (check.html). Not linked from the site; it shows the
// Supabase self-test and nothing a visitor would share.
export default function CheckPage() {
  return (
    <main className="visitor visitor--dev">
      <div className="visitor__inner">
        <p className="dev-banner">DEV ONLY · 개발용 진단 페이지 · 방문자에게 공유하지 마세요</p>
        <header className="visitor__title">
          <Logo className="visitor__logo" glitch={false} />
          <h1>
            SYSTEM <span>CHECK</span>
          </h1>
          <p>방명록 연결 상태를 점검해요.</p>
        </header>
        <Diagnostics />
        <a className="px-btn dev-back" href="./#/visitor">
          ◀ 방명록으로 돌아가기
        </a>
      </div>
    </main>
  )
}
