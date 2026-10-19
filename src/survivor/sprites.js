// MANO SURVIVOR — the v3 art package: nine sheets and the frame table
// (data/assets-v3.json) exactly as delivered. A frame is a rect in a sheet,
// a pivot (the point that sits on the ground position, in cell pixels) and
// contentBounds (where the picture is inside the cell). Frames are cut by
// their rect, never by splitting a sheet evenly or trimming each frame.

import art from './data/assets-v3.json'

export const ART = art
export const FRAMES = art.frames

export const SHEET_URLS = {
  '01_mano_run.png': new URL('./assets/v3/01_mano_run.png', import.meta.url).href,
  '02_mano_states.png': new URL('./assets/v3/02_mano_states.png', import.meta.url).href,
  '03_enemies.png': new URL('./assets/v3/03_enemies.png', import.meta.url).href,
  '04_elites.png': new URL('./assets/v3/04_elites.png', import.meta.url).href,
  '05_items.png': new URL('./assets/v3/05_items.png', import.meta.url).href,
  '06_upgrades_fx.png': new URL('./assets/v3/06_upgrades_fx.png', import.meta.url).href,
  '07_ui.png': new URL('./assets/v3/07_ui.png', import.meta.url).href,
  '08_profile.png': new URL('./assets/v3/08_profile.png', import.meta.url).href,
  '09_ground.png': new URL('./assets/v3/09_ground.png', import.meta.url).href,
}

const load = (src) =>
  new Promise((ok, fail) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => ok(img)
    img.onerror = () => fail(new Error('이미지를 불러오지 못했어요: ' + src))
    img.src = src
  })

let loading = null
// every sheet, by file name; resolves once all nine are in
export function loadImages() {
  loading ??= Promise.all(Object.entries(SHEET_URLS).map(async ([k, src]) => [k, await load(src)]))
    .then((list) => Object.fromEntries(list))
    .catch((e) => {
      loading = null
      throw e
    })
  return loading
}

// frame names of an animation, and the frame to show `ms` into it
export const anim = (name) => art.animations[name]
export function animFrame(name, ms, loop = true) {
  const a = art.animations[name]
  const i = Math.floor(ms / a.frameMs)
  const n = a.frames.length
  return a.frames[loop && a.loop !== false ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))]
}

// CSS for showing one frame (its content box, unless `whole`) as a DOM box
// `size` px tall (or wide, for wide frames), pixels kept square
export function spriteStyle(name, size, { whole = false, flip = false } = {}) {
  const f = FRAMES[name]
  const sheet = art.sheets[f.sheet]
  const b = whole ? { x: 0, y: 0, w: f.rect.w, h: f.rect.h } : f.contentBounds
  const s = size / Math.max(b.w, b.h)
  return {
    width: `${b.w * s}px`,
    height: `${b.h * s}px`,
    backgroundImage: `url(${SHEET_URLS[f.sheet]})`,
    backgroundSize: `${sheet.width * s}px ${sheet.height * s}px`,
    backgroundPosition: `${-(f.rect.x + b.x) * s}px ${-(f.rect.y + b.y) * s}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    transform: flip ? 'scaleX(-1)' : undefined,
  }
}
