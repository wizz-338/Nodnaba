import { useEffect, useState } from 'react'
import Logo from './Logo'
import { useClock } from '../hooks'
import { glitchNow } from '../motion'

const LINKS = [
  ['01', 'ORIGIN', '#top'],
  ['02', 'MANIFESTO', '#manifesto'],
  ['03', 'FRAGMENTS', '#fragments'],
  ['04', 'DIVE', '#dive'],
  ['05', 'SIGNAL', '#signal'],
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
              <a href={href} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
                <span className="menu__n mono">{n}</span>
                <span className="glitch" data-text={label}>{label}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="menu__foot mono">네 개의 선, 미완의 별 — FOUR LINES, AN UNFINISHED STAR</p>
      </nav>
    </>
  )
}
