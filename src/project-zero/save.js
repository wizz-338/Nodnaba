// This phone's own PROJECT ZERO record: investigator name, documents read, hints shown,
// wrong answers, notes and times. Which puzzles are solved is NOT kept here — the server
// (pz_case_state) is the only source for that, so it survives a refresh or another device.

export const SAVE_KEY = 'nodnaba:project-zero:save'
export const BACKUP_KEY = 'nodnaba:project-zero:save:backup'
export const SAVE_VERSION = 1
export const NOTES_MAX = 5000
export const NICK_MAX = 16

export function emptyCase() {
  return { viewed: [], hints: {}, wrong: {}, notes: '', startedAt: null, completedAt: null }
}

export function emptySave(uid = null) {
  return { version: SAVE_VERSION, uid, nickname: null, cases: {} }
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const counts = (v) => isObj(v) && Object.values(v).every((n) => Number.isInteger(n) && n >= 0)
const numOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v))

export function validSave(raw) {
  if (!isObj(raw) || raw.version !== SAVE_VERSION || !isObj(raw.cases)) return null
  if (raw.uid !== null && typeof raw.uid !== 'string') return null
  if (raw.nickname !== null && (typeof raw.nickname !== 'string' || !raw.nickname.trim())) return null
  const cases = {}
  for (const [id, c] of Object.entries(raw.cases)) {
    if (!isObj(c) || !Array.isArray(c.viewed) || !c.viewed.every((x) => typeof x === 'string')) return null
    if (!counts(c.hints) || !counts(c.wrong) || typeof c.notes !== 'string') return null
    if (!numOrNull(c.startedAt) || !numOrNull(c.completedAt)) return null
    cases[id] = { viewed: [...new Set(c.viewed)], hints: c.hints, wrong: c.wrong, notes: c.notes.slice(0, NOTES_MAX), startedAt: c.startedAt, completedAt: c.completedAt }
  }
  return { version: SAVE_VERSION, uid: raw.uid, nickname: raw.nickname ? raw.nickname.trim().slice(0, NICK_MAX) : null, cases }
}

function storage() {
  try {
    const ls = window.localStorage
    ls.setItem('__pz__', '1')
    ls.removeItem('__pz__')
    return ls
  } catch {
    return null
  }
}

/** { save, status: 'fresh' | 'loaded' | 'reset' } for this signed-in account. */
export function loadSave(uid) {
  const ls = storage()
  const raw = ls?.getItem(SAVE_KEY) ?? null
  if (raw === null) return { save: emptySave(uid), status: 'fresh' }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  const save = validSave(parsed)
  if (save && save.uid === uid) return { save, status: 'loaded' }
  if (save && save.uid !== uid) return { save: emptySave(uid), status: 'fresh' } // another account's record: start clean
  try {
    ls?.setItem(BACKUP_KEY, raw)
  } catch {
    /* ignore */
  }
  return { save: emptySave(uid), status: 'reset' }
}

export function writeSave(save) {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    /* full or blocked: play goes on in memory */
  }
}

export function clearSave() {
  try {
    storage()?.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}
