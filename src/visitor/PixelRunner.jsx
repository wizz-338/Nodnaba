import { useEffect, useRef } from 'react'
import sheetUrl from '../assets/visitor/cat-run.png'

// Sprite sheet: 4 run frames, 50×57 px each, facing right.
const FW = 50
const FH = 57
const FRAMES = 4
const AIR_FRAME = 1 // eyes shut, legs tucked — reads well mid-jump

const SPEED = 62 // css px / s
const GRAVITY = 1100
const STAGE_H = 132
const GROUND = 18 // px from the bottom of the stage

function tinted(img, color) {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  return c
}

export default function PixelRunner() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf
    let w = 0
    let dpr = 1
    let k = 2 // device px per sprite px

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 3)
      w = canvas.clientWidth
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(STAGE_H * dpr)
      // keep sprite pixels on whole device pixels; small on screen (~60 css px)
      k = Math.max(1, Math.round(1.05 * dpr))
    }
    resize()
    addEventListener('resize', resize)

    const img = new Image()
    img.src = sheetUrl
    let ghostRed
    let ghostCyan
    img.onload = () => {
      ghostRed = tinted(img, '#ff3355')
      ghostCyan = tinted(img, '#4fe3e0')
    }

    const s = {
      x: 40,
      dir: 1,
      y: 0, // height above ground (css px)
      vy: 0,
      t: 0,
      frame: 0,
      nextHop: 0.8,
      hops: 0,
      squash: 0,
      trail: [],
      trailT: 0,
      sparks: [],
    }

    const jump = (power = 1) => {
      if (s.y > 0) return
      s.vy = 300 * power
    }

    const onTap = (e) => {
      const r = canvas.getBoundingClientRect()
      const px = (e.clientX ?? 0) - r.left
      const sw = (FW * k) / dpr
      if (Math.abs(px - s.x) < sw) jump(1.15)
    }
    canvas.addEventListener('pointerdown', onTap)

    let last = performance.now()
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!img.complete || !ghostRed) return

      const sw = (FW * k) / dpr

      if (!reduced) {
        s.t += dt
        // run, turning at the edges
        s.x += s.dir * SPEED * dt
        if (s.x > w - sw / 2 - 6) {
          s.x = w - sw / 2 - 6
          s.dir = -1
        } else if (s.x < sw / 2 + 6) {
          s.x = sw / 2 + 6
          s.dir = 1
        }

        // bouncy hops: bursts of 1–3 jumps every couple of seconds
        s.nextHop -= dt
        if (s.y === 0 && s.nextHop <= 0) {
          jump(0.75 + Math.random() * 0.45)
          if (s.hops > 0) {
            s.hops -= 1
            s.nextHop = 0.05
          } else {
            s.hops = Math.random() < 0.5 ? Math.floor(Math.random() * 3) : 0
            s.nextHop = 1.4 + Math.random() * 2.2
          }
        }

        // physics
        if (s.y > 0 || s.vy > 0) {
          s.vy -= GRAVITY * dt
          s.y = Math.max(0, s.y + s.vy * dt)
          if (s.y === 0) {
            s.vy = 0
            s.squash = 0.09
            for (let i = 0; i < 4; i++) {
              s.sparks.push({ x: s.x - s.dir * (sw * 0.2) + (Math.random() - 0.5) * 18, y: 2, life: 0.5, vy: 20 + Math.random() * 25 })
            }
          }
        }
        s.squash = Math.max(0, s.squash - dt)
        s.frame = s.y > 0 ? AIR_FRAME : Math.floor(s.t * 9) % FRAMES

        // afterimage trail
        s.trailT -= dt
        if (s.trailT <= 0) {
          s.trailT = 0.07
          s.trail.unshift({ x: s.x, y: s.y, frame: s.frame, dir: s.dir })
          s.trail.length = Math.min(s.trail.length, 5)
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false

      const groundY = (STAGE_H - GROUND) * dpr
      const draw = (src, frame, x, y, dir, alpha, sy = 1, dx = 0) => {
        const dw = FW * k
        const dh = Math.round(FH * k * sy)
        const cx = Math.round(x * dpr + dx)
        const top = Math.round(groundY - y * dpr - dh)
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(cx, 0)
        ctx.scale(dir, 1)
        ctx.drawImage(src, frame * FW, 0, FW, FH, -Math.round(dw / 2), top, dw, dh)
        ctx.restore()
      }

      // shadow
      const shadowW = Math.max(10, sw * 0.55 * (1 - Math.min(s.y, 60) / 120))
      ctx.fillStyle = 'rgba(255, 51, 85, 0.22)'
      ctx.fillRect(Math.round((s.x - shadowW / 2) * dpr), groundY - Math.round(2 * dpr), Math.round(shadowW * dpr), Math.round(3 * dpr))

      // faint glitch afterimages
      s.trail.forEach((g, i) => {
        if (i === 0) return
        const a = 0.13 - i * 0.022
        if (a <= 0) return
        draw(i % 2 ? ghostRed : ghostCyan, g.frame, g.x, g.y, g.dir, a, 1, (i % 2 ? 2 : -2) * dpr)
      })

      // landing sparkles (pink pixel plus signs)
      ctx.fillStyle = '#ffa3bc'
      s.sparks = s.sparks.filter((p) => (p.life -= dt) > 0)
      s.sparks.forEach((p) => {
        p.y += p.vy * dt
        const u = Math.max(1, Math.round(1.5 * dpr))
        const px = Math.round(p.x * dpr)
        const py = Math.round(groundY - p.y * dpr)
        ctx.globalAlpha = Math.min(1, p.life * 2.5)
        ctx.fillRect(px - u, py, u * 3, u)
        ctx.fillRect(px, py - u, u, u * 3)
      })
      ctx.globalAlpha = 1

      draw(img, s.frame, s.x, s.y, s.dir, 1, 1 - s.squash)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onTap)
    }
  }, [])

  return <canvas ref={ref} className="runner" style={{ height: STAGE_H }} aria-label="뛰어다니는 NODNABA 픽셀 캐릭터" role="img" />
}
