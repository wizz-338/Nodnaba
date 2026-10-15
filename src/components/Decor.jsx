// Sakura petals drifting down and a few four-point sparkles.
const SPARKS = [
  [8, 14, 12, 0], [86, 9, 18, 1.2], [72, 31, 9, 2.1], [14, 46, 14, 0.6],
  [92, 58, 10, 1.8], [30, 74, 8, 2.6], [64, 86, 16, 0.3],
]

// left %, size px, duration s, delay s, sway px
const PETALS = [
  [6, 14, 11, 0, 40], [18, 10, 14, -6, -30], [33, 16, 12, -3, 50], [47, 11, 16, -9, -40],
  [61, 13, 13, -1, 35], [74, 9, 15, -7, -45], [86, 15, 12, -4, 30], [95, 10, 17, -11, -25],
]

export function Sparkle({ size = 16, className = '', style }) {
  return (
    <svg className={`sparkle ${className}`} style={style} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 0 C10.8 7 13 9.2 20 10 C13 10.8 10.8 13 10 20 C9.2 13 7 10.8 0 10 C7 9.2 9.2 7 10 0Z" />
    </svg>
  )
}

export default function Decor() {
  return (
    <div className="decor" aria-hidden="true">
      {SPARKS.map(([x, y, s, delay], i) => (
        <Sparkle
          key={i}
          size={s}
          className={i % 2 === 0 ? 'sparkle--pink' : ''}
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
        />
      ))}
      {PETALS.map(([x, s, dur, delay, sway], i) => (
        <span
          key={i}
          className="petal"
          style={{ left: `${x}%`, '--s': `${s}px`, '--sway': `${sway}px`, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
        >
          <svg viewBox="0 0 20 24">
            <path d="M10 24 C2 18 0 9 4 3 C6 0 8 2 10 5 C12 2 14 0 16 3 C20 9 18 18 10 24Z" />
          </svg>
        </span>
      ))}
    </div>
  )
}
