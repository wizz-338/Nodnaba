import { useEffect, useRef } from 'react'
import { LOGO_PATH } from './Logo'

function Warp({ id, freq = 0.012, scale = 18, children }) {
  return (
    <>
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves="2" seed="3" result="n">
            <animate attributeName="baseFrequency" dur="14s" values={`${freq};${freq * 1.8};${freq}`} repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>{children}</g>
    </>
  )
}

const ARTS = [
  // 01 — the mark, adrift
  () => (
    <svg viewBox="0 0 300 400">
      <defs>
        <linearGradient id="a1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b1046" />
          <stop offset="1" stopColor="#2a3bd1" />
        </linearGradient>
      </defs>
      <rect width="300" height="400" fill="url(#a1)" />
      <Warp id="w1" freq={0.01} scale={22}>
        <g transform="translate(40 70) scale(0.165)" fill="none" strokeWidth="70">
          <path d={LOGO_PATH} stroke="#ff4fae" transform="translate(-30 0)" opacity="0.8" />
          <path d={LOGO_PATH} stroke="#5ff2ff" transform="translate(30 0)" opacity="0.8" />
          <path d={LOGO_PATH} stroke="#fff" />
        </g>
      </Warp>
    </svg>
  ),
  // 02 — checkered stairs
  () => (
    <svg viewBox="0 0 300 400">
      <defs>
        <pattern id="chk" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#e9e6f5" />
          <rect width="20" height="20" fill="#14163a" />
          <rect x="20" y="20" width="20" height="20" fill="#14163a" />
        </pattern>
      </defs>
      <rect width="300" height="400" fill="#0a0b26" />
      <Warp id="w2" freq={0.008} scale={26}>
        <g transform="translate(150 250) skewX(-28) rotate(-12)">
          <rect x="-200" y="-40" width="400" height="260" fill="url(#chk)" />
        </g>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={50 + i * 30} y={190 - i * 26} width="70" height="16" fill="#f3c8de" stroke="#14163a" strokeWidth="2" />
        ))}
        <rect x="200" y="40" width="54" height="80" rx="27" fill="#ffb15e" opacity="0.9" />
      </Warp>
    </svg>
  ),
  // 03 — orbit garden
  () => (
    <svg viewBox="0 0 300 400">
      <defs>
        <radialGradient id="ball" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#8fa0ff" />
          <stop offset="0.35" stopColor="#1b1f6e" />
          <stop offset="1" stopColor="#05051a" />
        </radialGradient>
      </defs>
      <rect width="300" height="400" fill="#0d1250" />
      <Warp id="w3" freq={0.014} scale={14}>
        {[
          [90, 120, 46],
          [210, 210, 30],
          [120, 300, 22],
          [230, 330, 14],
        ].map(([x, y, r], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill="url(#ball)" stroke="#fff" strokeWidth="2" />
            <ellipse cx={x} cy={y} rx={r * 1.7} ry={r * 0.38} fill="none" stroke="#e8c48a" strokeWidth="2.5" transform={`rotate(-16 ${x} ${y})`} />
          </g>
        ))}
        <path d="M-20 380 Q150 250 320 300" fill="none" stroke="#ff7fbf" strokeWidth="10" />
        <path d="M-20 360 Q150 230 320 280" fill="none" stroke="#fff" strokeWidth="5" />
      </Warp>
    </svg>
  ),
  // 04 — sakura static
  () => (
    <svg viewBox="0 0 300 400">
      <rect width="300" height="400" fill="#111018" />
      {Array.from({ length: 40 }, (_, i) => (
        <rect key={i} x="0" y={i * 10} width="300" height="1" fill="#fff" opacity={0.04 + ((i * 37) % 10) / 120} />
      ))}
      <Warp id="w4" freq={0.02} scale={30}>
        {[
          [70, 90, 1.1],
          [200, 150, 0.8],
          [120, 250, 1.4],
          [230, 320, 0.9],
          [50, 340, 0.7],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            {[0, 72, 144, 216, 288].map((r) => (
              <ellipse key={r} rx="10" ry="18" cy="-16" fill="#ffa9cc" transform={`rotate(${r})`} />
            ))}
            <circle r="5" fill="#ff4f8e" />
          </g>
        ))}
        <rect x="0" y="180" width="300" height="14" fill="#5ff2ff" opacity="0.35" />
        <rect x="40" y="198" width="260" height="6" fill="#ff4fae" opacity="0.5" />
      </Warp>
    </svg>
  ),
]

const ITEMS = [
  ['01', 'UNFINISHED STAR', '미완의 별'],
  ['02', 'CHECKERED STAIRS', '끝나지 않는 계단'],
  ['03', 'ORBIT GARDEN', '궤도의 정원'],
  ['04', 'SAKURA STATIC', '벚꽃 노이즈'],
]

export default function Fragments() {
  const rail = useRef(null)

  useEffect(() => {
    const el = rail.current
    let raf
    const update = () => {
      const r = el.getBoundingClientRect()
      const mid = r.left + r.width / 2
      for (const card of el.children) {
        const c = card.getBoundingClientRect()
        const off = Math.max(-1.5, Math.min(1.5, (c.left + c.width / 2 - mid) / r.width))
        card.style.setProperty('--off', off.toFixed(3))
        card.style.setProperty('--aoff', Math.abs(off).toFixed(3))
      }
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <section id="fragments" className="section fragments">
      <h2 className="label mono">
        <span>03</span> FRAGMENTS
      </h2>
      <p className="fragments__lead">곧 열릴 조각들. 옆으로 밀어 공간을 넘겨 보세요.</p>
      <div className="rail" ref={rail}>
        {ITEMS.map(([n, en, ko], i) => {
          const Art = ARTS[i]
          return (
            <article className="card" key={n} tabIndex={0}>
              <div className="card__art">
                <Art />
              </div>
              <div className="card__info">
                <span className="mono">FRAGMENT {n}</span>
                <h3 className="glitch" data-text={en}>{en}</h3>
                <p>{ko}</p>
                <span className="card__soon mono">COMING SOON</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
