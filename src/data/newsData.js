import { ARTIST_HASH, MANO_COLONY_HASH, MANO_RUN_HASH, VISITOR_HASH } from '../route'
import { GAMES } from './games'

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
export const NEWS = [
  {
    date: '2026-10-19',
    time: '08:00',
    category: 'GAME',
    title: `${GAMES.survivor.title} (DEMO) 공개`,
    description: '마노가 탱탱볼 하나로 몰려오는 괴물을 버텨 내는 세로형 액션 게임의 데모 버전이 공개되었습니다.',
    link: GAMES.survivor.href,
    linkText: 'PLAY',
  },
  {
    date: '2026-10-18',
    time: '01:42',
    category: 'GAME',
    title: 'MANO COLONY (DEMO) 공개',
    description: '마노들이 작은 마을을 건설하는 방치형 타이쿤 게임의 데모 버전이 공개되었습니다.',
    link: MANO_COLONY_HASH,
    linkText: 'PLAY',
  },
  {
    date: '2026-10-17',
    time: '17:30',
    category: 'UPDATE',
    title: 'ARTIST 페이지 공개',
    description: 'NODNABA의 아티스트 MANO와 zyo_를 소개합니다.',
    link: ARTIST_HASH,
    linkText: 'VIEW',
  },
  {
    date: '2026-10-17',
    time: '15:40',
    category: 'MUSIC',
    title: 'zyo_ — 다락 공개',
    description: 'zyo_의 첫 번째 싱글 《다락》이 YouTube에 공개되었습니다.',
    link: 'https://youtu.be/Yoepw1Lgt4Y',
    linkText: 'LISTEN',
  },
  {
    date: '2026-10-16',
    time: '19:20',
    category: 'GAME',
    title: 'MANO RUN 출시',
    description: '마노의 첫 번째 미니게임 MANO RUN이 공개되었습니다.',
    link: MANO_RUN_HASH,
    linkText: 'PLAY',
  },
  {
    date: '2026-10-16',
    time: '14:10',
    category: 'UPDATE',
    title: 'VISITOR 오픈',
    description: 'NODNABA에 방문자의 흔적을 남길 수 있는 공간이 열렸습니다.',
    link: VISITOR_HASH,
    linkText: 'VISIT',
  },
  {
    date: '2026-10-15',
    time: '22:30',
    category: 'NOTICE',
    title: 'NODNABA 공개',
    description: 'NODNABA 공식 웹사이트가 공개되었습니다.',
    link: '#/',
    linkText: 'HOME',
  },
]
