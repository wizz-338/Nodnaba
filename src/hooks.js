import { useEffect, useRef, useState } from 'react'

const GLYPHS = '▓▒░<>/\\_=+*#01NODABX✦'

// Scrambles toward `target` whenever it changes.
export function useScramble(target, { duration = 700, enabled = true } = {}) {
  const [text, setText] = useState(enabled ? '' : target)
  useEffect(() => {
    if (!enabled) return
    const from = performance.now()
    let raf
    const step = (now) => {
      const p = Math.min(1, (now - from) / duration)
      const fixed = Math.floor(p * target.length)
      let out = target.slice(0, fixed)
      for (let i = fixed; i < target.length; i++) {
        out += target[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]
      }
      setText(out)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, enabled])
  return text
}

// Adds `.is-in` once the element enters the viewport.
export function useReveal(threshold = 0.2) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('is-in')
          io.disconnect()
        }
      },
      { threshold }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return ref
}

export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
