// Pixel-dissolve curtain played between MAIN and VISITOR.
const COLS = 8
const ROWS = 14

export default function PageTransition({ active }) {
  return (
    <div className={`warp ${active ? 'warp--on' : ''}`} aria-hidden="true">
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const x = i % COLS
        const y = Math.floor(i / COLS)
        // sweep diagonally with a little noise
        const d = (x + y) / (COLS + ROWS) + ((i * 37) % 11) / 60
        return <span key={i} style={{ '--d': d.toFixed(3) }} />
      })}
    </div>
  )
}
