import manoImg from '../assets/artist/mano.webp'
import zyoImg from '../assets/artist/zyo.webp'
import tizzzzImg from '../assets/artist/tizzzz.webp'
import peachyImg from '../assets/artist/peachy.webp'
import jinxieImg from '../assets/artist/jinxie.webp'
import hazeImg from '../assets/artist/haze.webp'
import sunnyImg from '../assets/artist/sunny.webp'
import daisyImg from '../assets/artist/daisy.webp'
import { MANO_COLONY_HASH, MANO_RUN_HASH } from '../route'
import { GAMES } from './games'
import { YOUTUBE_URL } from '../components/Footer'

const external = { target: '_blank', rel: 'noopener noreferrer' }

// The ARTIST page's list, in the order shown. To add one: put the picture in
// src/assets/artist/ (a ~2:3 portrait, webp, about 1024 px wide), import it
// above and add an entry at the end:
//   { id, name, img, w, h, links: [] }
// id: lower case, unique (the picture's file name). name: its official
// spelling, shown as is (never upper-cased: "zyo_" keeps its underscore).
// w, h: the picture's size. links: { label, href } buttons in its large view
// (external ones with ...external; small: a quiet text link; icon: YouTube).
export const ARTISTS = [
  {
    id: 'mano',
    name: 'MANO',
    img: manoImg,
    w: 832,
    h: 1216,
    links: [
      { label: '▶ MANO RUN', href: MANO_RUN_HASH },
      { label: '▶ MANO COLONY (DEMO)', href: MANO_COLONY_HASH },
      { label: `▶ ${GAMES.survivor.title} (DEMO)`, href: GAMES.survivor.href },
      { label: `▶ ${GAMES.survivor.title} (DEMO · PC)`, href: GAMES.survivorPc.href },
    ],
  },
  {
    id: 'zyo',
    name: 'zyo_',
    img: zyoImg,
    w: 1024,
    h: 1536,
    links: [
      { label: 'YouTube ↗', href: YOUTUBE_URL, ...external, icon: true },
      { label: '다락 (Attic) ↗', href: 'https://youtu.be/Yoepw1Lgt4Y', ...external, small: true },
    ],
  },
  { id: 'tizzzz', name: 'Tizzzz', img: tizzzzImg, w: 1024, h: 1536, links: [] },
  { id: 'peachy', name: 'PEACHY', img: peachyImg, w: 1024, h: 1487, links: [] },
  { id: 'jinxie', name: 'Jinxie', img: jinxieImg, w: 1024, h: 1487, links: [] },
  { id: 'haze', name: 'Haze', img: hazeImg, w: 1024, h: 1487, links: [] },
  { id: 'sunny', name: 'Sunny', img: sunnyImg, w: 832, h: 1216, links: [] },
  { id: 'daisy', name: 'Daisy', img: daisyImg, w: 1024, h: 1487, links: [] },
]
