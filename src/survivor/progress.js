// MANO SURVIVOR — what stays between runs: owned weapons and their grades,
// the one equipped weapon, coins, chapters, unopened chests.
//
// Saved under its own key (nodnaba:survivor:save); MANO COLONY and MANO RUN
// keys are never read or written. Every change reads the latest saved copy,
// applies one change and writes it back, and every reward carries an id that
// is spent once: a double tap, a second tab or a reload never pays twice.

export const KEY = 'nodnaba:survivor:save'
export const CORRUPT_KEY = 'nodnaba:survivor:corrupt'
export const SCHEMA = 1
const KEEP_RUN_IDS = 60

export function browserStorage() {
  try {
    const ls = window.localStorage
    const k = 'nodnaba:survivor:probe'
    ls.setItem(k, '1')
    ls.removeItem(k)
    return ls
  } catch {
    return null
  }
}

export function fresh(D) {
  const inv = []
  let seq = 1
  for (const s of D.progression.startingInventory) for (let i = 0; i < s.count; i++) inv.push({ id: 'w' + seq++, weaponId: s.weaponId, grade: s.grade })
  return {
    schemaVersion: SCHEMA,
    inventory: inv,
    equippedInstanceId: inv[0] ? inv[0].id : null,
    currency: 0,
    unlockedChapter: 1,
    lastAwardedRunIds: [],
    bestResults: {},
    chests: [],
    nextSeq: seq,
    activeRun: null,
    seenHelp: false,
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const int = (v) => Number.isInteger(v)

// a saved copy, checked field by field; anything unknown is dropped
function validate(D, d) {
  if (!isObj(d) || d.schemaVersion !== SCHEMA) throw new Error('형식이 맞지 않아요')
  const grades = D.progression.grades
  const known = new Set(D.weapons.registry.map((w) => w.id))
  if (!Array.isArray(d.inventory)) throw new Error('무기 목록이 없어요')
  const ids = new Set()
  const inventory = []
  for (const it of d.inventory) {
    if (!isObj(it) || typeof it.id !== 'string' || ids.has(it.id) || !known.has(it.weaponId) || !grades.includes(it.grade)) continue
    ids.add(it.id)
    inventory.push({ id: it.id, weaponId: it.weaponId, grade: it.grade })
  }
  const out = fresh(D)
  out.inventory = inventory
  out.equippedInstanceId = ids.has(d.equippedInstanceId) ? d.equippedInstanceId : inventory[0] ? inventory[0].id : null
  out.currency = int(d.currency) && d.currency >= 0 ? d.currency : 0
  out.unlockedChapter = int(d.unlockedChapter) && d.unlockedChapter >= 1 ? Math.min(d.unlockedChapter, 99) : 1
  out.lastAwardedRunIds = Array.isArray(d.lastAwardedRunIds) ? d.lastAwardedRunIds.filter((x) => typeof x === 'string').slice(-KEEP_RUN_IDS) : []
  out.bestResults = isObj(d.bestResults) ? d.bestResults : {}
  out.chests = Array.isArray(d.chests) ? d.chests.filter((c) => isObj(c) && typeof c.id === 'string') : []
  out.nextSeq = int(d.nextSeq) && d.nextSeq > 0 ? d.nextSeq : inventory.length + 1
  out.activeRun = isObj(d.activeRun) && typeof d.activeRun.runId === 'string' ? { runId: d.activeRun.runId, chapter: int(d.activeRun.chapter) ? d.activeRun.chapter : 1 } : null
  out.seenHelp = d.seenHelp === true
  // ids must keep growing past every id in use
  for (const it of inventory) {
    const n = +String(it.id).slice(1)
    if (int(n) && n >= out.nextSeq) out.nextSeq = n + 1
  }
  return out
}

// storage: an object with getItem / setItem (localStorage or a test double),
// or null when the browser does not allow saving (then nothing is kept)
export function createProgress(D, storage) {
  let memory = null // the copy used when saving is impossible
  let lastError = null

  function read() {
    if (!storage) return memory || (memory = fresh(D))
    let raw = null
    try {
      raw = storage.getItem(KEY)
    } catch {
      return memory || (memory = fresh(D))
    }
    if (!raw) return fresh(D)
    try {
      return validate(D, JSON.parse(raw))
    } catch {
      // unreadable: keep it aside (never deleted), start over
      try {
        storage.setItem(CORRUPT_KEY, raw)
      } catch {
        /* nowhere to keep it */
      }
      return fresh(D)
    }
  }

  function write(d) {
    memory = d
    if (!storage) {
      lastError = 'unavailable'
      return false
    }
    try {
      storage.setItem(KEY, JSON.stringify(d))
      lastError = null
      return true
    } catch (e) {
      lastError = e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'full' : 'blocked'
      return false
    }
  }

  // read the latest, change, write back; fn returns the result to hand out
  function change(fn) {
    const d = read()
    const r = fn(d)
    write(d)
    return r
  }

  return {
    get: read,
    error: () => lastError,
    available: !!storage,

    // On opening the game: a run that never finished (page closed) ends
    // without reward; everything already earned stays.
    boot() {
      return change((d) => {
        const lost = d.activeRun
        d.activeRun = null
        return { data: d, lostRun: !!lost }
      })
    },

    equip(id) {
      return change((d) => {
        if (!d.inventory.some((it) => it.id === id)) return false
        d.equippedInstanceId = id
        return true
      })
    },

    seenHelp() {
      return change((d) => {
        d.seenHelp = true
      })
    },

    // A new run gets an id now; its reward can be paid only once.
    startRun(chapter) {
      return change((d) => {
        const runId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
        d.activeRun = { runId, chapter }
        const eq = d.inventory.find((it) => it.id === d.equippedInstanceId) || d.inventory[0]
        return { runId, weapon: eq ? { ...eq } : null }
      })
    },

    // Pay out a finished run (coins; a chest for a cleared chapter). The same
    // runId twice pays nothing the second time.
    finishRun(runId, chapter, result) {
      return change((d) => {
        if (d.activeRun && d.activeRun.runId === runId) d.activeRun = null
        if (d.lastAwardedRunIds.includes(runId)) return { already: true, coins: 0, chest: null }
        d.lastAwardedRunIds = [...d.lastAwardedRunIds, runId].slice(-KEEP_RUN_IDS)
        d.currency += Math.max(0, Math.floor(result.coins || 0))
        let chest = null
        if (result.cleared) {
          for (let i = 0; i < D.progression.chestPerChapterClear; i++) {
            chest = { id: 'c' + runId + (i ? '-' + i : ''), runId, chapter }
            d.chests.push(chest)
          }
          d.unlockedChapter = Math.max(d.unlockedChapter, chapter + 1)
        }
        const best = d.bestResults[chapter] || { wave: 0, kills: 0, cleared: false }
        d.bestResults[chapter] = {
          wave: Math.max(best.wave, result.wave),
          kills: Math.max(best.kills, result.kills),
          cleared: best.cleared || !!result.cleared,
        }
        return { already: false, coins: Math.floor(result.coins || 0), chest }
      })
    },

    // Leaving a run from the pause menu: it ends, nothing is paid for it.
    abandonRun(runId) {
      return change((d) => {
        if (d.activeRun && d.activeRun.runId === runId) d.activeRun = null
        if (!d.lastAwardedRunIds.includes(runId)) d.lastAwardedRunIds = [...d.lastAwardedRunIds, runId].slice(-KEEP_RUN_IDS)
        return true
      })
    },

    // Open a chest: it leaves the list and one weapon arrives, in one write.
    // The grade comes from the chest's own id, so opening the same chest
    // twice (double tap, reload, two tabs) can never roll twice.
    openChest(chestId) {
      return change((d) => {
        const i = d.chests.findIndex((c) => c.id === chestId)
        if (i < 0) return null
        d.chests.splice(i, 1)
        const pool = D.progression.chestWeaponPool.filter((id) => D.weapons.registry.some((w) => w.id === id))
        const r = unitHash(chestId)
        const weaponId = pool[Math.floor(unitHash(chestId + ':w') * pool.length)] || pool[0]
        const grade = rollGrade(D, r)
        const item = { id: 'w' + d.nextSeq++, weaponId, grade }
        d.inventory.push(item)
        return item
      })
    },

    // Three of the same weapon and grade become one of the next grade. All
    // checks first; nothing is removed unless the new weapon is made in the
    // same write.
    fuse(ids) {
      return change((d) => {
        const check = canFuse(D, d, ids)
        if (!check.ok) return check
        const items = ids.map((id) => d.inventory.find((it) => it.id === id))
        const grades = D.progression.grades
        const item = { id: 'w' + d.nextSeq++, weaponId: items[0].weaponId, grade: grades[grades.indexOf(items[0].grade) + 1] }
        d.inventory = d.inventory.filter((it) => !ids.includes(it.id))
        d.inventory.push(item)
        const wasEquipped = ids.includes(d.equippedInstanceId)
        if (wasEquipped) d.equippedInstanceId = item.id
        return { ok: true, item, equipped: wasEquipped }
      })
    },
  }
}

export function canFuse(D, d, ids) {
  const grades = D.progression.grades
  if (!Array.isArray(ids) || ids.length !== D.progression.fusion.inputs || new Set(ids).size !== ids.length) return { ok: false, reason: '같은 무기 3개를 골라 주세요.' }
  const items = ids.map((id) => d.inventory.find((it) => it.id === id))
  if (items.some((it) => !it)) return { ok: false, reason: '없는 무기가 있어요.' }
  if (items.some((it) => it.weaponId !== items[0].weaponId)) return { ok: false, reason: '같은 무기끼리만 합성할 수 있어요.' }
  if (items.some((it) => it.grade !== items[0].grade)) return { ok: false, reason: '같은 등급끼리만 합성할 수 있어요.' }
  if (items[0].grade === grades[grades.length - 1]) return { ok: false, reason: 'EX 등급은 더 합성할 수 없어요.' }
  return { ok: true }
}

// stable number in [0, 1) from a string
export function unitHash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

export function rollGrade(D, r) {
  const w = D.progression.chestGradeWeights
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  let x = r * total
  for (const [g, n] of Object.entries(w)) {
    x -= n
    if (x < 0) return g
  }
  return Object.keys(w)[0]
}
