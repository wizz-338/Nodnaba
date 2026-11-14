import { useEffect, useState } from 'react'

// Addresses inside PROJECT ZERO (the site's hash routing, under #/project-zero):
//   #/project-zero                         title
//   #/project-zero/access                  investigator sign-on
//   #/project-zero/cases                   case list
//   #/project-zero/case/001[/evidence|/puzzles|/notes]
//   #/project-zero/case/001/evidence/E02   one document
//   #/project-zero/case/001/puzzle/P01     one puzzle
//   #/project-zero/case/001/complete       closing report
export const PZ_HASH = '#/project-zero'

const ID = /^[A-Za-z0-9-]{1,16}$/

export function parsePz(hash = location.hash) {
  if (!hash.startsWith(PZ_HASH)) return { name: 'notfound' }
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
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
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
