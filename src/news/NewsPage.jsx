import { useEffect, useRef, useState } from 'react'
import { NEWS } from '../data/newsData'
import sheet from '../game/mano.png'
import './news.css'

const PAGE = 10

// newest first, by KST date + time
const at = (n) => Date.parse(`${n.date}T${n.time}:00+09:00`)
const SORTED = [...NEWS].sort((a, b) => at(b) - at(a))

// Mano's run cycle from MANO RUN (transparent sheet, 8 frames of 50×60).
// Each one runs at its own speed (px/s, the same on any screen width so the
// feet never slide), with its own stride time and start: `at` is how far
// along it already is when the page opens, `wait` holds one back a moment.
// `y` lifts it a little for depth.
const MANOS = [
  { speed: 64, step: 0.52, at: 0.62, y: 0 },
  { speed: 82, step: 0.44, at: 0.3, y: 7 },
  { speed: 54, step: 0.58, at: 0.05, y: 3 },
  { speed: 72, step: 0.48, wait: 1.4, y: 10 },
]

function Runners() {
  const ref = useRef(null)
  const [w, setW] = useState(() => (typeof innerWidth === 'number' ? innerWidth : 390))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    // stop the animation while the strip is scrolled out of view
    const io = new IntersectionObserver(([e]) => el.classList.toggle('is-paused', !e.isIntersecting))
    io.observe(el)
    return () => {
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  return (
    <div className="news-run" ref={ref} aria-hidden="true">
      {MANOS.map((m, i) => {
        const dur = (w + 64) / m.speed
        const delay = m.wait ?? -m.at * dur
        const style = {
          '--dur': `${dur.toFixed(2)}s`,
          '--delay': `${delay.toFixed(2)}s`,
          '--step': `${m.step}s`,
          '--y': `${m.y}px`,
          '--n': i,
          zIndex: 10 - m.y,
        }
        return (
          <div key={i} className="news-mano" style={style}>
            <span className="news-mano__shadow" />
            <span className="news-mano__sprite">
              <img src={sheet} width="500" height="60" alt="" decoding="async" />
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Item({ n, i }) {
  const external = /^https?:/.test(n.link || '')
  return (
    <li className="news-item" style={{ '--i': Math.min(i, 6) }}>
      <p className="news-item__meta mono">
        <time dateTime={`${n.date}T${n.time}+09:00`}>
          {n.date.replaceAll('-', '.')} {n.time} KST
        </time>
        <span className="news-item__cat">{n.category}</span>
      </p>
      <h2 className="news-item__title">{n.title}</h2>
      <p className="news-item__desc">{n.description}</p>
      {n.link && (
        <a
          className="news-item__link mono"
          href={n.link}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {n.linkText || 'VIEW'} {external ? '↗' : '→'}
        </a>
      )}
    </li>
  )
}

export default function NewsPage() {
  const [count, setCount] = useState(PAGE)
  return (
    <main className="news">
      <h1 className="news__title glitch" data-text="NEWS">
        NEWS
      </h1>
      <Runners />
      <ol className="news__list">
        {SORTED.slice(0, count).map((n, i) => (
          <Item key={`${n.date} ${n.time} ${n.title}`} n={n} i={i % PAGE} />
        ))}
      </ol>
      {count < SORTED.length && (
        <button type="button" className="news__more mono" onClick={() => setCount((c) => c + PAGE)}>
          MORE
        </button>
      )}
    </main>
  )
}
