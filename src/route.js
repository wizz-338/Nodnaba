import { useEffect, useState } from 'react'

// Hash routes keep GitHub Pages happy (no server rewrites needed).
// '#/visitor' (plus '#/visitor/admin', '#/visitor/check') → visitor; anything
// else → main, so in-page anchors like '#vision' keep working there.
export function parseRoute(hash = location.hash) {
  if (hash.startsWith('#/visitor')) {
    return { page: 'visitor', admin: hash.startsWith('#/visitor/admin'), check: hash.startsWith('#/visitor/check') }
  }
  return { page: 'main', admin: false, check: false }
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
