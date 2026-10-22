import { MANO_SURVIVOR_HASH, MANO_SURVIVOR_PC_HASH } from '../route'

// One place for a game's name and link, so the GAME menu, NEWS, the ARTIST
// profile and the game itself always agree.
export const GAMES = {
  survivor: {
    title: 'MANO SURVIVOR',
    demo: true,
    href: MANO_SURVIVOR_HASH,
    platform: '모바일 전용 9:16',
  },
  // the same game (the same content, save and updates), played on a PC
  survivorPc: {
    title: 'MANO SURVIVOR',
    demo: true,
    href: MANO_SURVIVOR_PC_HASH,
    platform: 'PC 전용 16:9',
  },
}
