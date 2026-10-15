import { useEffect, useState } from 'react'
import Logo from './Logo'

export default function Boot({ onDone }) {
  const [pct, setPct] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const total = reduced ? 200 : 1500
    const from = performance.now()
    let raf
    const step = (now) => {
      const p = Math.min(1, (now - from) / total)
      // stutter a little, like a signal locking on
      setPct(Math.floor((p < 0.9 ? p + Math.sin(p * 40) * 0.02 : p) * 100))
      if (p < 1) raf = requestAnimationFrame(step)
      else {
        setLeaving(true)
        setTimeout(onDone, reduced ? 0 : 650)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [onDone])

  return (
    <div className={`boot ${leaving ? 'boot--out' : ''}`} role="status" aria-live="polite">
      <Logo className="boot__logo" draw />
      <p className="boot__sign" aria-hidden="true">Nodnaba</p>
      <p className="boot__text mono">
        TUNING SIGNAL <span>{String(Math.max(0, pct)).padStart(3, '0')}%</span>
      </p>
    </div>
  )
}
