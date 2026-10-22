// MANO SURVIVOR — the story package's pictures (data/story-assets.json):
// their URLs (Vite fingerprints them and keeps them relative to the page,
// so they load the same on any deploy path), each loaded and decoded once,
// only when asked for, and kept. A picture that fails to load is null: the
// game goes on with its own art instead of stopping.
import { D } from './data.js'

const URLS = import.meta.glob('./assets/s84/**/*.webp', { eager: true, query: '?url', import: 'default' })
const BY_ID = Object.fromEntries(D.storyAssets.images.map((x) => [x.id, x]))

export const artInfo = (id) => BY_ID[id] || null
export function artUrl(id) {
  const x = BY_ID[id]
  return x ? URLS['./assets/s84/' + x.file] || null : null
}

const cache = new Map() // id → { img: HTMLImageElement | null, done: bool, wait: Promise }

// the picture, loaded and decoded (null if it cannot be had)
export function loadArt(id) {
  let c = cache.get(id)
  if (c) return c.wait
  const url = artUrl(id)
  c = { img: null, done: false, wait: null }
  cache.set(id, c)
  c.wait = new Promise((resolve) => {
    const finish = (img) => {
      c.img = img
      c.done = true
      resolve(img)
    }
    if (!url) return finish(null)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => (img.decode ? img.decode().then(() => finish(img), () => finish(img)) : finish(img))
    img.onerror = () => finish(null)
    img.src = url
  })
  return c.wait
}

// the picture if it is ready now (never waits, never starts a load)
export const artNow = (id) => {
  const c = cache.get(id)
  return c && c.img ? c.img : null
}

// what a region's fight needs: its ground and its monsters
export function regionArtIds(region) {
  return [region.background, ...new Set(Object.values(region.skins))]
}
export const preloadRegion = (region) => Promise.all(regionArtIds(region).map(loadArt))
