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
  story: read('story'),
  storyAssets: read('story-assets'),
  motion: read('motion'),
}
