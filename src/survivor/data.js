// MANO SURVIVOR — the game data. balance.json is the balanceConfig: every
// number (difficulty, drops, rewards, chests, grades, coin stats, upgrades)
// in one file. weapons.json describes the weapons, upgrades.json names the
// upgrade cards, ui.json lays out the screen, assets-v3.json is the art
// package's frame table exactly as delivered. cats.json names the three cat
// companions and holds their story; cats-frames.json cuts their sheet;
// tizzzz.json holds the writer Tizzzz's story and texts. motion.json: the
// monsters' animation frames (move / attack / death, the motion package).
import balance from './data/balance.json'
import weapons from './data/weapons.json'
import upgrades from './data/upgrades.json'
import ui from './data/ui.json'
import art from './data/assets-v3.json'
import cats from './data/cats.json'
import catFrames from './data/cats-frames.json'
import tizzzz from './data/tizzzz.json'
import story from './data/story.json'
import storyAssets from './data/story-assets.json'
import motion from './data/motion.json'

export const D = { balance, weapons, upgrades, ui, art, cats, catFrames, tizzzz, story, storyAssets, motion }
