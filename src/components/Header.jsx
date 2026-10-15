import { useEffect, useState } from 'react'
import Logo from './Logo'
import { useClock } from '../hooks'
import { glitchNow } from '../motion'
import { X_URL } from './Footer'

const LINKS = [
  ['01', 'ORIGIN', '#top'],
  ['02', 'VISION', '#vision'],
  ['03', 'X ↗', X_URL],
]

export default function Header() {
  const [open, setOpen] = useState(false)
  const now = useClock()
  const time = now.toLocaleTimeString('en-GB', { hour12: false })

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <header className="header">
        <a className="header__brand" href="#top" aria-label="NODNABA home" onClick={() => setOpen(false)}>
          <Logo className="header__logo" glitch={false} />
          <span className="header__name">NODNABA</span>
        </a>
        <span className="header__clock mono" aria-hidden="true">{time}</span>
        <button
          className={`burger ${open ? 'burger--open' : ''}`}
          aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={open}
          aria-controls="menu"
          onClick={() => {
            glitchNow(200)
            setOpen((v) => !v)
          }}
        >
          <span />
          <span />
        </button>
      </header>

      <nav id="menu" className={`menu ${open ? 'menu--open' : ''}`} aria-hidden={!open}>
        <ul>
          {LINKS.map(([n, label, href], i) => (
            <li key={href} style={{ '--i': i }}>
              <a
                href={href}
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className="menu__n mono">{n}</span>
                <span className="glitch" data-text={label}>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
