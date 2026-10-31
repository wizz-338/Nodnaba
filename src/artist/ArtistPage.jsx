import manoImg from '../assets/artist/mano.webp'
import zyoImg from '../assets/artist/zyo.webp'
import tizzzzImg from '../assets/artist/tizzzz.webp'
import peachyImg from '../assets/artist/peachy.webp'
import jinxieImg from '../assets/artist/jinxie.webp'
import lavvvImg from '../assets/artist/lavvv.webp'
import { MANO_COLONY_HASH, MANO_RUN_HASH } from '../route'
import { GAMES } from '../data/games'
import { YOUTUBE_URL } from '../components/Footer'
import './artist.css'

const external = { target: '_blank', rel: 'noopener noreferrer' }

// Names are official spellings — zyo_ keeps its trailing underscore.
// links can be empty until there is something to link to.
const ARTISTS = [
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
  {
    id: 'tizzzz',
    name: 'Tizzzz',
    img: tizzzzImg,
    w: 1024,
    h: 1536,
    links: [],
  },
  {
    id: 'peachy',
    name: 'PEACHY',
    img: peachyImg,
    w: 1024,
    h: 1487,
    links: [],
  },
  {
    id: 'jinxie',
    name: 'Jinxie',
    img: jinxieImg,
    w: 1024,
    h: 1487,
    links: [],
  },
  {
    id: 'lavvv',
    name: 'lavvv',
    img: lavvvImg,
    w: 1024,
    h: 1487,
    links: [],
  },
]

function Card({ a, i }) {
  return (
    <article className={`artist-card artist-card--${a.id}`} style={{ '--i': i }}>
      <div className="artist-card__frame">
        <img
          className="artist-card__img"
          src={a.img}
          alt={`${a.name} 대표 이미지`}
          width={a.w}
          height={a.h}
          loading={i ? 'lazy' : 'eager'}
          decoding="async"
        />
        {/* RGB-split copies that only show during the hover glitch */}
        <span className="artist-card__ghost artist-card__ghost--c" style={{ backgroundImage: `url(${a.img})` }} aria-hidden="true" />
        <span className="artist-card__ghost artist-card__ghost--m" style={{ backgroundImage: `url(${a.img})` }} aria-hidden="true" />
        <span className="artist-card__crt" aria-hidden="true" />
      </div>
      <div className="artist-card__body">
        <h2 className="artist-card__name glitch" data-text={a.name}>
          {a.name}
        </h2>
        {a.links.length > 0 && (
          <ul className="artist-card__links">
            {a.links.map(({ label, small, icon, ...l }) => (
              <li key={label}>
                <a className={`artist-link mono ${small ? 'artist-link--small' : ''}`} {...l}>
                  {icon && (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9l5.8 3.1-5.8 3.1Z" />
                    </svg>
                  )}
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

export default function ArtistPage() {
  return (
    <main className="artist">
      <h1 className="artist__title glitch" data-text="ARTIST">
        ARTIST
      </h1>
      <div className="artist__grid">
        {ARTISTS.map((a, i) => (
          <Card key={a.id} a={a} i={i} />
        ))}
      </div>
    </main>
  )
}
