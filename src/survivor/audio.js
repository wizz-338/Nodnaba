// MANO SURVIVOR — music and sound effects.
//
// One AudioContext, made at the first touch (browsers only let sound start
// after one). Music: the menu tune off the battle, the battle tune in it, each
// an <audio> pair routed through the context, so iOS takes its volume too and
// a track loops by crossfading into a fresh copy of itself (no click, no gap
// at the seam). A track keeps its place when it is switched away from and
// carries on from there when it comes back; switching fades out and in.
// Effects are made on the spot (no sound files), short and quiet, and never
// pile up: the same effect at most every 45 ms, at most 4 at once.
// Volumes live in this browser only (nodnaba:survivor:audio), apart from the
// game's save; the effects on/off switch is the save's `sound`.

// AAC (.m4a) where the browser plays it (Safari, iOS, Chrome, Edge), Opus
// (.webm) where it does not (some Linux builds)
const AAC = { menu: new URL('./assets/audio/bgm_menu.m4a', import.meta.url).href, battle: new URL('./assets/audio/bgm_battle.m4a', import.meta.url).href }
const OPUS = { menu: new URL('./assets/audio/bgm_menu.webm', import.meta.url).href, battle: new URL('./assets/audio/bgm_battle.webm', import.meta.url).href }
const tuneUrl = (name) => {
  const probe = new Audio()
  return (probe.canPlayType('audio/mp4; codecs="mp4a.40.2"') ? AAC : OPUS)[name]
}
const PREFS_KEY = 'nodnaba:survivor:audio'
const FADE_OUT = 0.4 // s, switching tunes
const FADE_IN = 0.6
const SEAM = 1.2 // s of crossfade where a tune meets its own start
// the battle tune sits under the effects; the menu tune a little louder
const TRACK_GAIN = { menu: 0.55, battle: 0.42 }
const DUCK = 0.35 // the battle tune while the game is paused

let ctx = null
let musicBus = null
let sfxBus = null
const tracks = {}
let want = null // the tune that should be playing: 'menu' | 'battle' | null
let ducked = false
let sfxOn = true
let hidden = false
let prefs = readPrefs()

function readPrefs() {
  const base = { music: 0.7, sfx: 0.8, musicOn: true }
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    const vol = (v, d) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d)
    return { music: vol(p.music, base.music), sfx: vol(p.sfx, base.sfx), musicOn: p.musicOn !== false }
  } catch {
    return base
  }
}
function writePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* only this visit keeps it */
  }
}

const now = () => ctx.currentTime
function ramp(param, to, secs) {
  const t = now()
  param.cancelScheduledValues(t)
  param.setValueAtTime(param.value, t)
  param.linearRampToValueAtTime(to, t + Math.max(0.01, secs))
}

// a tune: two <audio> copies; the one on air hands over to the other at the
// end, both fading across SEAM seconds
function makeTrack(name, url) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(musicBus)
  const copies = [0, 1].map(() => {
    const el = new Audio()
    el.src = url
    el.preload = 'auto'
    el.loop = false
    el.playsInline = true
    el.setAttribute('playsinline', '')
    const g = ctx.createGain()
    g.gain.value = 0
    ctx.createMediaElementSource(el).connect(g).connect(out)
    return { el, g }
  })
  const T = { name, out, copies, on: 0, playing: false, seamAt: 0, timer: 0 }
  T.tick = () => {
    const c = T.copies[T.on]
    const d = c.el.duration
    if (!T.playing || !d || !isFinite(d)) return
    if (d - c.el.currentTime <= SEAM && performance.now() > T.seamAt) {
      // the seam: the other copy starts from the top, the two cross
      const n = T.copies[1 - T.on]
      T.seamAt = performance.now() + SEAM * 1000 + 300
      n.el.currentTime = 0
      ramp(n.g.gain, 0, 0.001)
      n.el.play().catch(() => {})
      ramp(n.g.gain, 1, SEAM)
      ramp(c.g.gain, 0, SEAM)
      const old = c
      setTimeout(() => {
        if (T.copies[T.on] !== old) old.el.pause()
      }, SEAM * 1000 + 50)
      T.on = 1 - T.on
    }
  }
  return T
}

function play(T) {
  const c = T.copies[T.on]
  T.playing = true
  ramp(c.g.gain, 1, 0.01)
  c.el.play().catch(() => {})
  ramp(T.out.gain, level(T.name), FADE_IN)
  clearInterval(T.timer)
  T.timer = setInterval(T.tick, 200)
}
function stop(T, secs = FADE_OUT) {
  if (!T.playing) return
  T.playing = false
  clearInterval(T.timer)
  ramp(T.out.gain, 0, secs)
  const was = T.copies.map((c) => c)
  setTimeout(() => {
    // still off: pause where it is (it carries on from here next time)
    if (!T.playing) for (const c of was) c.el.pause()
  }, secs * 1000 + 40)
}
const level = (name) => TRACK_GAIN[name] * (name === 'battle' && ducked ? DUCK : 1)

function apply() {
  if (!ctx) return
  musicBus.gain.value = prefs.musicOn ? prefs.music : 0
  sfxBus.gain.value = prefs.sfx
  const on = prefs.musicOn && !hidden ? want : null
  for (const name of Object.keys(tracks)) if (name !== on) stop(tracks[name])
  if (on) {
    tracks[on] ??= makeTrack(on, tuneUrl(on))
    const T = tracks[on]
    if (!T.playing) play(T)
    else ramp(T.out.gain, level(on), 0.25)
  }
}

// the first touch: make the context, wake it, and start what should play.
// Every copy is started once here, inside the touch, so iOS lets the game
// start it again later on its own.
export function unlock() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      musicBus = ctx.createGain()
      sfxBus = ctx.createGain()
      musicBus.connect(ctx.destination)
      sfxBus.connect(ctx.destination)
      tracks.menu = makeTrack('menu', tuneUrl('menu'))
      tracks.battle = makeTrack('battle', tuneUrl('battle'))
      for (const T of Object.values(tracks))
        for (const c of T.copies) {
          const p = c.el.play()
          // only the copy on air may keep going
          if (p) p.then(() => !(T.playing && T.copies[T.on] === c) && c.el.pause()).catch(() => {})
        }
    }
    if (ctx.state === 'suspended') ctx.resume()
    apply()
  } catch {
    /* no sound in this browser: the game plays on silently */
  }
}

// which tune: 'menu' (lobby, gear, fusion, results), 'battle', or null
export function music(name) {
  if (want === name) return
  want = name
  if (name !== 'battle') ducked = false
  apply()
}

// the pause menu lowers the battle tune; back to the fight brings it up
export function duck(on) {
  if (ducked === !!on) return
  ducked = !!on
  apply()
}

// leaving the game page: everything fades and stops (and stays where it was)
export function stopAll() {
  stopSiren()
  want = null
  apply()
}

export function setSfxOn(on) {
  sfxOn = !!on
}
export const getPrefs = () => ({ ...prefs })
export function setPrefs(p) {
  prefs = { ...prefs, ...p }
  writePrefs()
  apply()
}

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden
    apply()
  })

// ── effects ─────────────────────────────────────────────────────────────────

const last = {}
let voices = 0
function voice(name, secs, make) {
  if (!ctx || !sfxOn || prefs.sfx <= 0 || ctx.state !== 'running') return
  const t = performance.now()
  if (t - (last[name] || 0) < 45 || voices >= 4) return
  last[name] = t
  voices++
  setTimeout(() => voices--, secs * 1000 + 30)
  if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined') (window.__survivorSfx ||= []).push(name)
  try {
    make(now())
  } catch {
    /* a sound that cannot be made is skipped */
  }
}

// a short tone: type, frequency from → to over `glide`, peak gain, length
function tone(t, { type = 'triangle', f0, f1 = f0, glide = 0.05, peak, len, at = 0, lowpass = 0 }) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t + at)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + at + glide)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t + at)
  g.gain.exponentialRampToValueAtTime(peak, t + at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + at + len)
  let node = o.connect(g)
  if (lowpass) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lowpass
    node = node.connect(f)
  }
  node.connect(sfxBus)
  o.start(t + at)
  o.stop(t + at + len + 0.02)
}

// a burst of soft noise through a band (the pen's scratch, the fusion's pop)
function noise(t, { len, freq, q, peak, at = 0, wobble = 0 }) {
  const n = Math.floor(ctx.sampleRate * len)
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (wobble ? 0.6 + 0.4 * Math.sin(i / wobble) : 1)
  const s = ctx.createBufferSource()
  s.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t + at)
  g.gain.exponentialRampToValueAtTime(peak, t + at + Math.min(0.03, len / 4))
  g.gain.exponentialRampToValueAtTime(0.0001, t + at + len)
  s.connect(f).connect(g).connect(sfxBus)
  s.start(t + at)
}

const SOUNDS = {
  // a button: a soft, low "tok"
  tap: [0.07, (t) => tone(t, { f0: 520, f1: 380, glide: 0.05, peak: 0.07, len: 0.07, lowpass: 2400 })],
  // a chapter arrow: a light tick
  tick: [0.04, (t) => tone(t, { type: 'sine', f0: 1500, f1: 1200, glide: 0.03, peak: 0.045, len: 0.04 })],
  // a level-up card: a bright rising "ti-ring"
  pick: [0.16, (t) => (tone(t, { f0: 700, f1: 1050, glide: 0.07, peak: 0.07, len: 0.12 }), tone(t, { type: 'sine', f0: 1575, peak: 0.03, len: 0.1, at: 0.06 }))],
  // start a chapter: two quick notes up
  go: [0.2, (t) => (tone(t, { f0: 523, peak: 0.07, len: 0.09 }), tone(t, { f0: 784, peak: 0.075, len: 0.13, at: 0.07 }))],
  // a stat bought: a short, clean confirmation
  confirm: [0.15, (t) => (tone(t, { f0: 660, peak: 0.06, len: 0.08 }), tone(t, { type: 'sine', f0: 990, peak: 0.05, len: 0.1, at: 0.05 }))],
  // a fusion: a soft "pop" and a little glitter on top
  fuse: [
    0.32,
    (t) => {
      noise(t, { len: 0.09, freq: 900, q: 0.9, peak: 0.12 })
      tone(t, { type: 'sine', f0: 240, f1: 120, glide: 0.08, peak: 0.09, len: 0.1 })
      tone(t, { type: 'sine', f0: 1760, f1: 2640, glide: 0.12, peak: 0.03, len: 0.2, at: 0.08 })
      tone(t, { type: 'sine', f0: 2350, peak: 0.02, len: 0.16, at: 0.15 })
    },
  ],
  // a button that cannot be used: small, low and dull
  deny: [0.1, (t) => tone(t, { type: 'square', f0: 150, f1: 120, glide: 0.06, peak: 0.035, len: 0.09, lowpass: 600 })],
  // Tizzzz's pen across a card
  scribble: [0.22, (t) => noise(t, { len: 0.22, freq: 3200, q: 1.4, peak: 0.09, wobble: 90 })],
}

export function sfx(name) {
  const s = SOUNDS[name]
  if (s) voice(name, s[0], s[1])
}

// the extra special boss's alarm: "삐이— 삐이—", two falling square-wave
// wails (the last boss's a little lower and longer). It follows the effects'
// switch and volume, and stopSiren() cuts it off (a run ended or restarted).
let sirenNodes = []
export function siren(final = false) {
  stopSiren()
  if (!ctx || !sfxOn || prefs.sfx <= 0 || ctx.state !== 'running') return
  if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined') (window.__survivorSfx ||= []).push(final ? 'siren-final' : 'siren')
  try {
    const t = now()
    const len = final ? 0.6 : 0.5
    const [hi, lo] = final ? [820, 560] : [1040, 760]
    for (let i = 0; i < 2; i++) {
      const at = t + i * (len + 0.16)
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(hi, at)
      o.frequency.linearRampToValueAtTime(lo, at + len)
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 2200
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.06, at + 0.03)
      g.gain.setValueAtTime(0.06, at + len - 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, at + len)
      o.connect(f).connect(g).connect(sfxBus)
      o.start(at)
      o.stop(at + len + 0.02)
      sirenNodes.push(o)
    }
  } catch {
    /* no alarm: the warning still shows */
  }
}
export function stopSiren() {
  for (const o of sirenNodes) {
    try {
      o.stop()
    } catch {
      /* already over */
    }
  }
  sirenNodes = []
}

// development only: what is playing, for the browser checks
if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined')
  window.__survivorAudio = () => ({
    ctx: ctx && ctx.state,
    want,
    ducked,
    prefs: { ...prefs },
    tracks: Object.fromEntries(
      Object.entries(tracks).map(([k, T]) => [
        k,
        { playing: T.playing, on: T.on, gain: +T.out.gain.value.toFixed(3), time: T.copies.map((c) => +c.el.currentTime.toFixed(2)), paused: T.copies.map((c) => c.el.paused), duration: T.copies[0].el.duration },
      ]),
    ),
  })
if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined')
  window.__survivorAudioSeek = (name, t) => {
    const T = tracks[name]
    if (T) T.copies[T.on].el.currentTime = t
  }
