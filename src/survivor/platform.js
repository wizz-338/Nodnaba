// MANO SURVIVOR — the two ways the one game is played.
//
// Everything about the game itself is shared: the fight (game.js, weapons.js),
// the save (progress.js), the data (data/*.json: monsters, stages, cards,
// story, rewards), the pictures and sounds, the drawing (render.js) and the
// screens (SurvivorPage.jsx). A platform only says how it is shown and played:
// its logical screen and field, where the HUD sits, how Mano is moved, which
// backgrounds it draws, and its CSS layout (.ms--mobile / .ms--pc).
// See PLATFORMS.md for what goes where when the game is patched.
import { D } from './data.js'
export { MOVE_KEYS, keyVector } from './keys.js'

export const PLATFORMS = {
  // the phone game: portrait 9:16, a touch stick anywhere on the screen
  mobile: {
    id: 'mobile',
    screen: D.ui.logicalViewport, // [360, 640]
    arena: D.balance.logicalArena,
    hud: D.ui.hud,
    input: 'touch',
    background: (id) => id, // the portrait pictures as they are
    backdrop: (id) => id + '_soft',
  },
  // the PC game: landscape 16:9, WASD / arrow keys, the mouse for the menus
  pc: {
    id: 'pc',
    screen: D.ui.pc.logicalViewport, // [640, 360]
    arena: D.balance.logicalArenaPc,
    hud: D.ui.pc.hud,
    input: 'keys',
    design: D.ui.pc.design, // [1280, 720]: the menus' layout size, scaled to the window
    background: (id) => id + '_wide',
    backdrop: (id) => id + '_wide_soft',
  },
}

// a device that has only touch (a phone or tablet) — the PC game says so
export const touchOnly = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
