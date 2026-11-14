import { useEffect, useState } from 'react'
import { PROJECT_ZERO_HASH, PROJECT_ZERO_OLD_HASH } from '../route'

// Addresses inside PROJECT ZERO (the site's hash routing; base #/artist/tizzzz/project-zero,
// entered from the card in Tizzzz's large view on ARTIST):
//   <base>                         title
//   <base>/access                  investigator sign-on
//   <base>/cases                   case list
//   <base>/case/001[/evidence|/puzzles|/notes]
//   <base>/case/001/evidence/E02   one document
//   <base>/case/001/puzzle/P01     one puzzle
//   <base>/case/001/complete       closing report
// The first base, #/project-zero/…, is moved to the same place under the new one.
export const PZ_HASH = PROJECT_ZERO_HASH
// where the page's own "back to the site" links go: the ARTIST page (Tizzzz is in its grid)
export const PZ_EXIT = '#/artist'

const ID = /^[A-Za-z0-9-]{1,16}$/

/** The old #/project-zero/… address → the same place under the new base (else null). */
export function moved(hash) {
  if (hash !== PROJECT_ZERO_OLD_HASH && !hash.startsWith(`${PROJECT_ZERO_OLD_HASH}/`)) return null
  return PZ_HASH + hash.slice(PROJECT_ZERO_OLD_HASH.length)
}

export function parsePz(hash = location.hash) {
  if (hash !== PZ_HASH && !hash.startsWith(`${PZ_HASH}/`)) return { name: 'notfound' }
  const rest = hash.slice(PZ_HASH.length).replace(/^\/+|\/+$/g, '')
  if (!rest) return { name: 'home' }
  const parts = rest.split('/')
  if (parts.some((p) => !ID.test(p))) return { name: 'notfound' }
  const [a, caseId, b, c] = parts
  if (parts.length === 1 && a === 'access') return { name: 'access' }
  if (parts.length === 1 && a === 'cases') return { name: 'cases' }
  if (a !== 'case' || !caseId) return { name: 'notfound' }
  if (parts.length === 2) return { name: 'case', caseId, tab: 'overview' }
  if (parts.length === 3) {
    if (b === 'evidence' || b === 'puzzles' || b === 'notes') return { name: 'case', caseId, tab: b }
    if (b === 'complete') return { name: 'complete', caseId }
  }
  if (parts.length === 4 && b === 'evidence') return { name: 'evidence', caseId, evidenceId: c }
  if (parts.length === 4 && b === 'puzzle') return { name: 'puzzle', caseId, puzzleId: c }
  return { name: 'notfound' }
}

export const pz = {
  home: () => PZ_HASH,
  access: () => `${PZ_HASH}/access`,
  cases: () => `${PZ_HASH}/cases`,
  case: (id, tab = 'overview') => (tab === 'overview' ? `${PZ_HASH}/case/${id}` : `${PZ_HASH}/case/${id}/${tab}`),
  evidence: (id, eid) => `${PZ_HASH}/case/${id}/evidence/${eid}`,
  puzzle: (id, pid) => `${PZ_HASH}/case/${id}/puzzle/${pid}`,
  complete: (id) => `${PZ_HASH}/case/${id}/complete`,
}

export function usePzRoute() {
  const [hash, setHash] = useState(() => {
    const to = moved(location.hash)
    if (to) history.replaceState(history.state, '', to) // old link: same place, new address, no extra back step
    return location.hash
  })
  useEffect(() => {
    const on = () => {
      const to = moved(location.hash)
      if (to) history.replaceState(history.state, '', to)
      setHash(location.hash)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return { hash, route: parsePz(hash) }
}

/** Go somewhere; replace=true keeps the browser's back button from returning to a blocked address. */
export function go(to, replace = false) {
  if (replace) {
    history.replaceState(history.state, '', to)
    dispatchEvent(new HashChangeEvent('hashchange'))
  } else if (location.hash !== to) {
    location.hash = to
  }
}
