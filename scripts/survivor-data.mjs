// The game data for Node scripts (the page imports the same JSON files through Vite).
import fs from 'fs'
const dir = new URL('../src/survivor/data/', import.meta.url)
const read = (n) => JSON.parse(fs.readFileSync(new URL(n + '.json', dir), 'utf8'))
export const D = {
  balance: read('balance'),
  weapons: read('weapons'),
  upgrades: read('upgrades'),
  progression: read('progression'),
  mano: read('mano'),
  ui: read('ui'),
  enemiesArt: read('enemies-art'),
  icons: read('icons'),
}
