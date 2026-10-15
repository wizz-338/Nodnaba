// Floating ringed orbs and four-point sparkles drifting over the void.
const SPARKS = [
  [8, 14, 14, 0], [86, 9, 22, 1.2], [72, 31, 10, 2.1], [14, 46, 18, 0.6],
  [92, 58, 12, 1.8], [30, 74, 9, 2.6], [64, 86, 20, 0.3], [6, 92, 11, 1.4],
  [48, 22, 8, 3.1], [80, 76, 9, 2.4],
]

const ORBS = [
  { x: 82, y: 18, s: 54, d: 0.35, tilt: -18 },
  { x: 6, y: 62, s: 34, d: 0.6, tilt: 12 },
  { x: 74, y: 88, s: 26, d: 0.9, tilt: -30 },
]

export function Sparkle({ size = 16, className = '', style }) {
  return (
    <svg className={`sparkle ${className}`} style={style} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 0 C10.8 7 13 9.2 20 10 C13 10.8 10.8 13 10 20 C9.2 13 7 10.8 0 10 C7 9.2 9.2 7 10 0Z" />
    </svg>
  )
}

export function Orb({ size = 40, tilt = 0, className = '', style }) {
  return (
    <div className={`orb ${className}`} style={{ '--s': `${size}px`, '--tilt': `${tilt}deg`, ...style }} aria-hidden="true">
      <span className="orb__ring orb__ring--back" />
      <span className="orb__ball" />
      <span className="orb__ring orb__ring--front" />
    </div>
  )
}

export default function Decor() {
  return (
    <div className="decor" aria-hidden="true">
      {SPARKS.map(([x, y, s, delay], i) => (
        <Sparkle
          key={i}
          size={s}
          className={i % 3 === 0 ? 'sparkle--pink' : ''}
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
        />
      ))}
      {ORBS.map((o, i) => (
        <div key={i} className="decor__orb" style={{ left: `${o.x}%`, top: `${o.y}%`, '--d': o.d }}>
          <Orb size={o.s} tilt={o.tilt} />
        </div>
      ))}
    </div>
  )
}
