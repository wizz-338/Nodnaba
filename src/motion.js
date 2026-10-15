// Shared motion state: one rAF loop feeds both CSS custom properties and
// the WebGL background, so scroll/pointer/glitch stay in sync everywhere.
export const motion = {
  scroll: 0, // px
  vel: 0, // smoothed scroll velocity, -1..1
  px: 0, // pointer in shader space (centered, min-side normalised)
  py: 0,
  lastPointer: -1e9,
  glitch: 0, // 0..1 while a glitch burst is active
  reduced: false,
}

let started = false

export function startMotion() {
  if (started) return
  started = true

  const root = document.documentElement
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  motion.reduced = mq.matches
  mq.addEventListener?.('change', (e) => (motion.reduced = e.matches))

  const onPointer = (x, y) => {
    const m = Math.min(innerWidth, innerHeight)
    motion.px = (x - innerWidth / 2) / m
    motion.py = -(y - innerHeight / 2) / m
    motion.lastPointer = performance.now()
  }
  addEventListener('pointermove', (e) => onPointer(e.clientX, e.clientY), { passive: true })
  addEventListener('touchmove', (e) => onPointer(e.touches[0].clientX, e.touches[0].clientY), { passive: true })
  addEventListener('pointerdown', (e) => onPointer(e.clientX, e.clientY), { passive: true })

  let last = scrollY
  const tick = () => {
    const y = scrollY
    const raw = Math.max(-1, Math.min(1, (y - last) / 60))
    last = y
    motion.scroll = y
    motion.vel += (raw - motion.vel) * 0.12
    if (Math.abs(motion.vel) < 0.001) motion.vel = 0
    const vh = innerHeight || 1
    root.style.setProperty('--vel', motion.vel.toFixed(3))
    root.style.setProperty('--hero', Math.min(1, y / vh).toFixed(3))
    root.style.setProperty('--scroll-n', (y / vh).toFixed(3))
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  // Moderate, irregular glitch bursts.
  const burst = (len = 160 + Math.random() * 220) => {
    if (motion.reduced) return
    motion.glitch = 1
    root.classList.add('is-glitching')
    setTimeout(() => {
      motion.glitch = 0
      root.classList.remove('is-glitching')
    }, len)
  }
  const schedule = () => {
    setTimeout(() => {
      if (!document.hidden) burst()
      schedule()
    }, 3200 + Math.random() * 5200)
  }
  schedule()
  motion.burst = burst
}

export function glitchNow(len) {
  motion.burst?.(len)
}
