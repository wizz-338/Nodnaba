import { useEffect, useState } from 'react'

// Hash routes keep GitHub Pages happy (no server rewrites needed).
//   '#/visitor'        guestbook (the only VISITOR address the menu uses)
//   '#/visitor/admin'  guestbook + admin login
//   '#/game/mano-run'  MANO RUN mini game
// Anything else is the main page, so in-page anchors like '#vision' keep working.
// The developer system check lives in its own document, check.html.
export const VISITOR_HASH = '#/visitor'
export const MANO_RUN_HASH = '#/game/mano-run'

export function parseRoute(hash = location.hash) {
  if (hash.startsWith('#/game')) return { page: 'game', admin: false }
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
