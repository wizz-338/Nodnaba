import { useEffect, useRef } from 'react'
import { motion } from '../motion'
import { vert, frag } from '../shaders'

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
  return s
}

export default function VoidCanvas() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) {
      canvas.classList.add('void--fallback')
      return
    }

    let prog
    try {
      prog = gl.createProgram()
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vert))
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag))
      gl.linkProgram(prog)
      gl.useProgram(prog)
    } catch (err) {
      console.warn(err)
      canvas.classList.add('void--fallback')
      return
    }

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = {}
    for (const n of ['u_res', 'u_time', 'u_scroll', 'u_vel', 'u_pointer', 'u_glitch']) u[n] = gl.getUniformLocation(prog, n)

    // Render below native resolution: the scene is soft by nature and this
    // keeps phones cool.
    let lastW = 0
    let lastH = 0
    const resize = () => {
      const w = innerWidth
      const h = innerHeight
      // ignore small height jumps from mobile URL bars
      if (w === lastW && Math.abs(h - lastH) < 120) return
      lastW = w
      lastH = h
      const scale = Math.min(devicePixelRatio || 1, 2) * 0.5
      canvas.width = Math.max(1, Math.floor(w * scale))
      canvas.height = Math.max(1, Math.floor(h * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    addEventListener('resize', resize)

    const start = performance.now()
    let px = 0
    let py = 0
    let g = 0
    let raf
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const t = (now - start) / 1000
      const time = motion.reduced ? t * 0.15 : t

      // idle drift when nobody is touching the screen
      const idle = now - motion.lastPointer > 2500
      const tx = idle ? Math.sin(t * 0.3) * 0.35 : motion.px
      const ty = idle ? Math.cos(t * 0.23) * 0.25 : motion.py
      px += (tx - px) * 0.05
      py += (ty - py) * 0.05
      g += (motion.glitch - g) * 0.5

      gl.uniform2f(u.u_res, canvas.width, canvas.height)
      gl.uniform1f(u.u_time, time)
      gl.uniform1f(u.u_scroll, motion.scroll / (innerHeight || 1))
      gl.uniform1f(u.u_vel, motion.vel)
      gl.uniform2f(u.u_pointer, px, py)
      gl.uniform1f(u.u_glitch, g)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="void" aria-hidden="true" />
}
