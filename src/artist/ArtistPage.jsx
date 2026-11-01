import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ARTISTS } from '../data/artists'
import './artist.css'

const pad = (n) => String(n).padStart(2, '0')

function Links({ links }) {
  if (!links.length) return null
  return (
    <ul className="artist-links">
      {links.map(({ label, small, icon, ...l }) => (
        <li key={label}>
          <a className={`artist-link mono ${small ? 'artist-link--small' : ''}`} {...l}>
            {icon && (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9l5.8 3.1-5.8 3.1Z" />
              </svg>
            )}
            {label}
          </a>
        </li>
      ))}
    </ul>
  )
}

// one artist in the grid: the picture and its name; opens the large view
function Tile({ a, i, onOpen }) {
  return (
    <li className={`artist-tile artist-tile--${a.id}`} style={{ '--i': Math.min(i, 12) }}>
      <button type="button" className="artist-tile__btn" onClick={() => onOpen(i)} aria-label={`${a.name} 크게 보기`}>
        <span className="artist-tile__frame">
          <img className="artist-tile__img" src={a.img} alt="" width={a.w} height={a.h} loading={i < 4 ? 'eager' : 'lazy'} decoding="async" />
          {/* RGB-split copies that only show during the hover glitch */}
          <span className="artist-tile__ghost artist-tile__ghost--c" style={{ backgroundImage: `url(${a.img})` }} aria-hidden="true" />
          <span className="artist-tile__ghost artist-tile__ghost--m" style={{ backgroundImage: `url(${a.img})` }} aria-hidden="true" />
          <span className="artist-tile__crt" aria-hidden="true" />
        </span>
        {a.links.length > 0 && (
          <span className="artist-tile__more mono" aria-hidden="true">
            LINK {a.links.length}
          </span>
        )}
        <span className="artist-tile__name glitch" data-text={a.name}>
          {a.name}
        </span>
      </button>
    </li>
  )
}

// the large view: the whole picture, the name and links; ← → (or a swipe)
// to the next one, Esc or the backdrop to close (put on <body>: the page's
// own layer would keep it under the site's header)
function Viewer({ i, onClose, onStep }) {
  const a = ARTISTS[i]
  const box = useRef(null)
  const touch = useRef(null)
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onStep(1)
      else if (e.key === 'ArrowLeft') onStep(-1)
    }
    addEventListener('keydown', key)
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      removeEventListener('keydown', key)
      document.body.style.overflow = was
    }
  }, [onClose, onStep])
  useEffect(() => {
    box.current && box.current.focus()
  }, [i])
  return createPortal(
    <div
      className="artist-view"
      role="dialog"
      aria-modal="true"
      aria-label={a.name}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return
        const dx = e.changedTouches[0].clientX - touch.current
        touch.current = null
        if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1)
      }}
    >
      <div className="artist-view__box" ref={box} tabIndex={-1} key={a.id}>
        <div className="artist-view__frame">
          <img className="artist-view__img" src={a.img} alt={`${a.name} 대표 이미지`} width={a.w} height={a.h} />
          <span className="artist-tile__crt" aria-hidden="true" />
        </div>
        <div className="artist-view__body">
          <p className="artist-view__no mono">
            {pad(i + 1)} / {pad(ARTISTS.length)}
          </p>
          <h2 className="artist-view__name glitch" data-text={a.name}>
            {a.name}
          </h2>
          <Links links={a.links} />
        </div>
      </div>
      {ARTISTS.length > 1 && (
        <>
          <button type="button" className="artist-view__step artist-view__step--prev mono" onClick={() => onStep(-1)} aria-label="이전 아티스트">
            ‹
          </button>
          <button type="button" className="artist-view__step artist-view__step--next mono" onClick={() => onStep(1)} aria-label="다음 아티스트">
            ›
          </button>
        </>
      )}
      <button type="button" className="artist-view__close mono" onClick={onClose} aria-label="닫기">
        ✕
      </button>
    </div>,
    document.body,
  )
}

// The large view has its own step in the browser's history (the address does
// not change, so the site's hash routing never sees it): the browser's back
// button (or a phone's back gesture) closes the view instead of leaving the
// page, and closing it with ✕ / Esc takes that step back.
const VIEW_STATE = 'artist-view'
const inView = () => history.state && history.state[VIEW_STATE] === true

export default function ArtistPage() {
  const [open, setOpen] = useState(null)
  const openAt = useCallback((i) => {
    if (!inView()) history.pushState({ ...(history.state || {}), [VIEW_STATE]: true }, '')
    setOpen(i)
  }, [])
  const close = useCallback(() => (inView() ? history.back() : setOpen(null)), [])
  const step = useCallback((d) => setOpen((i) => (i == null ? i : (i + d + ARTISTS.length) % ARTISTS.length)), [])
  useEffect(() => {
    // (back on the page after a link from the view: its step is left over)
    if (inView()) history.replaceState({ ...history.state, [VIEW_STATE]: false }, '')
    const pop = () => !inView() && setOpen(null)
    addEventListener('popstate', pop)
    return () => removeEventListener('popstate', pop)
  }, [])
  return (
    <main className="artist">
      <header className="artist__head">
        <h1 className="artist__title glitch" data-text="ARTIST">
          ARTIST
        </h1>
        <p className="artist__count mono">{pad(ARTISTS.length)} ARTISTS</p>
      </header>
      <ul className="artist__grid">
        {ARTISTS.map((a, i) => (
          <Tile key={a.id} a={a} i={i} onOpen={openAt} />
        ))}
      </ul>
      {open != null && <Viewer i={open} onClose={close} onStep={step} />}
    </main>
  )
}
