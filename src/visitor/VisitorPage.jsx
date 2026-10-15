import PixelRunner from './PixelRunner'
import Guestbook from './Guestbook'
import Diagnostics from './Diagnostics'
import Logo from '../components/Logo'
import './visitor.css'

export default function VisitorPage({ admin, check }) {
  return (
    <main className="visitor">
      <div className="visitor__stage">
        <PixelRunner />
      </div>
      <div className="visitor__inner">
        <header className="visitor__title">
          <Logo className="visitor__logo" glitch={false} />
          <h1>
            VISITOR <span>LOG</span>
          </h1>
          <p>다녀간 흔적을 남겨 주세요.</p>
        </header>
        {check && <Diagnostics />}
        <Guestbook adminRoute={admin} />
      </div>
    </main>
  )
}
