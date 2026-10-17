import { useEffect, useState } from 'react'
import Logo from './Logo'
import { useClock } from '../hooks'
import { glitchNow } from '../motion'
import { ARTIST_HASH, MANO_RUN_HASH, NEWS_HASH, VISITOR_HASH } from '../route'

// menu order: MAIN · NEWS · ARTIST · GAME (MANO RUN) · VISITOR
const LINKS = [
  ['01', 'MAIN', '#/', 'main'],
  ['02', 'NEWS', NEWS_HASH, 'news'],
  ['03', 'ARTIST', ARTIST_HASH, 'artist'],
]
const LINKS_AFTER_GAME = [['05', 'VISITOR', VISITOR_HASH, 'visitor']]

// GAME opens on hover where a mouse can hover, and on tap/click everywhere
const canHover = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches

export default function Header({ page = 'main' }) {
  const [open, setOpen] = useState(false)
  const [gameOpen, setGameOpen] = useState(false)
  const now = useClock()
  const time = now.toLocaleTimeString('en-GB', { hour12: false })

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  const item = ([n, label, href, id], i) => (
    <li key={href} style={{ '--i': i }}>
      <a
        href={href}
        tabIndex={open ? 0 : -1}
        aria-current={page === id ? 'page' : undefined}
        onClick={() => setOpen(false)}
      >
        <span className="menu__n mono">{n}</span>
        <span className="glitch" data-text={label}>{label}</span>
      </a>
    </li>
  )

  return (
    <>
      <header className={`header ${page === 'main' ? '' : 'header--bar'}`}>
        <a className="header__brand" href="#/" aria-label="NODNABA home" onClick={() => setOpen(false)}>
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
          {LINKS.map((link, i) => item(link, i))}
          <li
            style={{ '--i': LINKS.length }}
            onMouseEnter={() => canHover() && setGameOpen(true)}
            onMouseLeave={() => canHover() && setGameOpen(false)}
          >
            <button
              type="button"
              className="menu__group"
              tabIndex={open ? 0 : -1}
              aria-expanded={gameOpen}
              aria-controls="menu-game"
              onClick={() => setGameOpen((v) => (canHover() ? true : !v))}
            >
              <span className="menu__n mono">04</span>
              <span className="glitch" data-text="GAME">GAME</span>
              <span className="menu__toggle mono" aria-hidden="true">{gameOpen ? '−' : '+'}</span>
            </button>
            <div id="menu-game" className={`menu__sub ${gameOpen ? 'menu__sub--open' : ''}`}>
              <div>
                <a href={MANO_RUN_HASH} tabIndex={open && gameOpen ? 0 : -1} onClick={() => setOpen(false)}>
                  <span className="menu__n mono">└</span>
                  <span className="glitch" data-text="MANO RUN">MANO RUN</span>
                </a>
              </div>
            </div>
          </li>
          {LINKS_AFTER_GAME.map((link, i) => item(link, LINKS.length + 1 + i))}
        </ul>
      </nav>
    </>
  )
}
