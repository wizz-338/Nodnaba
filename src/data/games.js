import { MANO_SURVIVOR_HASH } from '../route'
import survivorImg from '../assets/games/mano-survivor.webp'

// One place for how a game is introduced around the site, so the GAME menu,
// NEWS and the ARTIST profile always show the same name, picture, line of
// description and link.
export const GAMES = {
  survivor: {
    title: 'MANO SURVIVOR',
    demo: true,
    nameKo: '마노 서바이버',
    description: '탱탱볼 하나로 몰려오는 괴물을 버텨 내는 세로형 액션 게임. 조작은 이동뿐, 공격은 자동이에요.',
    href: MANO_SURVIVOR_HASH,
    img: survivorImg,
  },
}
