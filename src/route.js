import { useEffect, useState } from 'react'

// Hash routes keep GitHub Pages happy (no server rewrites needed).
//   '#/visitor'        guestbook (the only VISITOR address the menu uses)
//   '#/visitor/admin'  guestbook + admin login
//   '#/news'           NEWS: activity log
//   '#/artist'         ARTIST: the NODNABA artists
//   '#/game/mano-run'  MANO RUN mini game
//   '#/game/mano-colony'  MANO COLONY (DEMO) village game
//   '#/game/mano-survivor'  MANO SURVIVOR (DEMO) action game, the phone version (9:16)
//   '#/game/mano-survivor-pc'  the same game, the PC version (16:9, keyboard)
// Anything else is the main page, so in-page anchors like '#vision' keep working.
// The developer system check lives in its own document, check.html.
export const VISITOR_HASH = '#/visitor'
export const MANO_RUN_HASH = '#/game/mano-run'
export const MANO_COLONY_HASH = '#/game/mano-colony'
export const MANO_SURVIVOR_HASH = '#/game/mano-survivor'
export const MANO_SURVIVOR_PC_HASH = '#/game/mano-survivor-pc'
export const ARTIST_HASH = '#/artist'
export const NEWS_HASH = '#/news'

export function parseRoute(hash = location.hash) {
  if (hash.startsWith('#/game')) {
    // (the PC address starts with the phone one, so it is looked at first)
    const game = hash.startsWith(MANO_COLONY_HASH) ? 'colony' : hash.startsWith(MANO_SURVIVOR_PC_HASH) ? 'survivor-pc' : hash.startsWith(MANO_SURVIVOR_HASH) ? 'survivor' : 'run'
    return { page: 'game', admin: false, game }
  }
  if (hash.startsWith(NEWS_HASH)) return { page: 'news', admin: false }
  if (hash.startsWith(ARTIST_HASH)) return { page: 'artist', admin: false }
  if (hash.startsWith(VISITOR_HASH)) return { page: 'visitor', admin: hash.startsWith('#/visitor/admin') }
  return { page: 'main', admin: false }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute())
  useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return route
}
