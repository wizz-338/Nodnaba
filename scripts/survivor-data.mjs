// The game data for Node scripts (the page imports the same JSON files through Vite).
import fs from 'fs'
const dir = new URL('../src/survivor/data/', import.meta.url)
const read = (n) => JSON.parse(fs.readFileSync(new URL(n + '.json', dir), 'utf8'))
export const D = {
  balance: read('balance'),
  weapons: read('weapons'),
  upgrades: read('upgrades'),
  ui: read('ui'),
  art: read('assets-v3'),
  cats: read('cats'),
  catFrames: read('cats-frames'),
  tizzzz: read('tizzzz'),
  zyo: read('zyo'),
  turret: read('turret'),
  story: read('story'),
  storyAssets: (() => {
    const a = read('story-assets')
    return { ...a, images: [...a.images, ...read('ep01-assets').images, ...read('ep02-assets').images, ...read('ep03-assets').images, ...read('ep04-assets').images] }
  })(),
  friendCat: read('ep01-assets').friendCat,
  motion: (() => {
    const m = read('motion')
    return { ...m, characters: { ...m.characters, ...read('extra-motion').characters } }
  })(),
}
