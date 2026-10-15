import { useEffect, useRef } from 'react'
import { motion } from '../motion'
import { vert, frag } from '../shaders'
import bgUrl from '../assets/banner.webp'

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
  return s
}

function fallback(canvas) {
  canvas.classList.add('void--fallback')
  canvas.style.backgroundImage = `url(${bgUrl})`
}

export default function VoidCanvas() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) {
      fallback(canvas)
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
      fallback(canvas)
      return
    }

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = {}
    for (const n of ['u_tex', 'u_img', 'u_res', 'u_time', 'u_pan', 'u_vel', 'u_pointer', 'u_glitch', 'u_dim', 'u_fade'])
      u[n] = gl.getUniformLocation(prog, n)

    const tex = gl.createTexture()
    let img = null
    let loadedAt = 0
    const image = new Image()
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      // NPOT-safe sampling for WebGL1
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.uniform1i(u.u_tex, 0)
      img = [image.naturalWidth, image.naturalHeight]
      loadedAt = performance.now()
    }
    image.src = bgUrl

    // Render a little below native resolution to keep phones cool.
    let lastW = 0
    let lastH = 0
    const resize = () => {
      const w = innerWidth
      const h = innerHeight
      // ignore small height jumps from mobile URL bars
      if (w === lastW && Math.abs(h - lastH) < 120) return
      lastW = w
      lastH = h
      const scale = Math.min(devicePixelRatio || 1, 2) * 0.75
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
      if (!img) return

      const vh = innerHeight || 1
      const max = Math.max(1, document.documentElement.scrollHeight - vh)
      // dark behind the hero, opening up once you scroll past it
      const open = Math.min(1, Math.max(0, (motion.scroll / vh - 0.25) / 0.6))

      gl.uniform2f(u.u_img, img[0], img[1])
      gl.uniform2f(u.u_res, canvas.width, canvas.height)
      gl.uniform1f(u.u_time, time)
      gl.uniform1f(u.u_pan, motion.scroll / max)
      gl.uniform1f(u.u_dim, 0.42 + open * 0.5)
      gl.uniform1f(u.u_fade, Math.min(1, (now - loadedAt) / 1200))
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
