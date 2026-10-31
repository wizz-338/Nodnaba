import { ARTIST_HASH, MANO_COLONY_HASH, MANO_RUN_HASH, VISITOR_HASH } from '../route'
import { GAMES } from './games'
import tizzzzImg from '../assets/artist/tizzzz.webp'
import bannerImg from '../assets/banner.webp'
import darakImg from '../assets/news/darak.webp'
import eotteonImg from '../assets/news/eotteon.webp'
import artistsImg from '../assets/news/artists.webp'
import survivorImg from '../assets/news/mano-survivor.webp'
import colonyImg from '../assets/news/mano-colony.webp'
import runImg from '../assets/news/mano-run.webp'
import visitorImg from '../assets/news/visitor.webp'

// NEWS — NODNABA activity log.
//
// To post news, add one object anywhere in this list. The page sorts by
// date + time (newest first) on its own; the newest 10 show first and MORE
// reveals older ones.
//
//   date        'YYYY-MM-DD' (KST)
//   time        'HH:MM' (KST, 24-hour)
//   category    short label, e.g. UPDATE · MUSIC · GAME · NOTICE
//   title       one line
//   description one or two short sentences
//   link        optional. '#/…' opens a page of this site, 'https://…' opens
//               in a new tab. Leave it out for news without a link.
//   linkText    optional button label, e.g. VIEW · LISTEN · PLAY
//   img         optional picture shown with the news, with its size in
//   imgW, imgH  pixels (it keeps its own shape: tall, square or wide)
export const NEWS = [
  {
    date: '2026-11-01',
    time: '08:40',
    category: 'MUSIC',
    title: 'zyo_ — 어떤 (Some) 공개',
    description: 'zyo_의 두 번째 싱글 《어떤 (Some)》이 YouTube에 공개되었습니다.',
    link: 'https://youtu.be/gbPtsSWSiA4',
    linkText: 'LISTEN',
    img: eotteonImg,
    imgW: 800,
    imgH: 800,
  },
  {
    date: '2026-10-19',
    time: '18:30',
    category: 'NOTICE',
    title: 'NODNABA, 신규 작가 Tizzzz 합류',
    description: 'NODNABA에 새로운 작가 Tizzzz가 합류했습니다.',
    link: ARTIST_HASH,
    linkText: 'VIEW',
    img: tizzzzImg,
    imgW: 1024,
    imgH: 1536,
  },
  {
    date: '2026-10-19',
    time: '08:00',
    category: 'GAME',
    title: `${GAMES.survivor.title} (DEMO) 공개`,
    description: '마노가 탱탱볼 하나로 몰려오는 괴물을 버텨 내는 세로형 액션 게임의 데모 버전이 공개되었습니다.',
    link: GAMES.survivor.href,
    linkText: 'PLAY',
    img: survivorImg,
    imgW: 540,
    imgH: 960,
  },
  {
    date: '2026-10-18',
    time: '01:42',
    category: 'GAME',
    title: 'MANO COLONY (DEMO) 공개',
    description: '마노들이 작은 마을을 건설하는 방치형 타이쿤 게임의 데모 버전이 공개되었습니다.',
    link: MANO_COLONY_HASH,
    linkText: 'PLAY',
    img: colonyImg,
    imgW: 780,
    imgH: 530,
  },
  {
    date: '2026-10-17',
    time: '17:30',
    category: 'UPDATE',
    title: 'ARTIST 페이지 공개',
    description: 'NODNABA의 아티스트 MANO와 zyo_를 소개합니다.',
    link: ARTIST_HASH,
    linkText: 'VIEW',
    img: artistsImg,
    imgW: 1024,
    imgH: 768,
  },
  {
    date: '2026-10-17',
    time: '15:40',
    category: 'MUSIC',
    title: 'zyo_ — 다락 (Attic) 공개',
    description: 'zyo_의 첫 번째 싱글 《다락 (Attic)》이 YouTube에 공개되었습니다.',
    link: 'https://youtu.be/Yoepw1Lgt4Y',
    linkText: 'LISTEN',
    img: darakImg,
    imgW: 800,
    imgH: 800,
  },
  {
    date: '2026-10-16',
    time: '19:20',
    category: 'GAME',
    title: 'MANO RUN 출시',
    description: '마노의 첫 번째 미니게임 MANO RUN이 공개되었습니다.',
    link: MANO_RUN_HASH,
    linkText: 'PLAY',
    img: runImg,
    imgW: 600,
    imgH: 769,
  },
  {
    date: '2026-10-16',
    time: '14:10',
    category: 'UPDATE',
    title: 'VISITOR 오픈',
    description: 'NODNABA에 방문자의 흔적을 남길 수 있는 공간이 열렸습니다.',
    link: VISITOR_HASH,
    linkText: 'VISIT',
    img: visitorImg,
    imgW: 780,
    imgH: 410,
  },
  {
    date: '2026-10-15',
    time: '22:30',
    category: 'NOTICE',
    title: 'NODNABA 공개',
    description: 'NODNABA 공식 웹사이트가 공개되었습니다.',
    link: '#/',
    linkText: 'HOME',
    img: bannerImg,
    imgW: 2448,
    imgH: 816,
  },
]
