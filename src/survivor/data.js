// MANO SURVIVOR — the game data. balance.json is the balanceConfig: every
// number (difficulty, drops, rewards, chests, grades, coin stats, upgrades)
// in one file. weapons.json describes the weapons, upgrades.json names the
// upgrade cards, ui.json lays out the screen, assets-v3.json is the art
// package's frame table exactly as delivered.
import balance from './data/balance.json'
import weapons from './data/weapons.json'
import upgrades from './data/upgrades.json'
import ui from './data/ui.json'
import art from './data/assets-v3.json'

export const D = { balance, weapons, upgrades, ui, art }
