// MANO SURVIVOR — what stays between runs: owned weapons and their grades,
// the one equipped weapon, coins and the coin stats bought with them,
// chapters, unopened chests.
//
// Saved under its own key (nodnaba:survivor:save); MANO COLONY and MANO RUN
// keys are never read or written. Every change reads the latest saved copy,
// applies one change and writes it back, and every reward carries a key that
// is spent once (run id + what earned it): a double tap, a second tab or a
// reload never pays twice. Rewards earned during a run (an elite, the boss)
// are saved the moment they are earned, so a later loss keeps them.

export const KEY = 'nodnaba:survivor:save'
export const CORRUPT_KEY = 'nodnaba:survivor:corrupt'
export const SCHEMA = 2
const KEEP_KEYS = 400
export const STATS = ['hp', 'damage', 'move', 'interval', 'crit', 'coins']

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

const zeroPerma = () => Object.fromEntries(STATS.map((s) => [s, 0]))

export function fresh(D) {
  const inv = []
  let seq = 1
  for (const s of D.balance.startingInventory) for (let i = 0; i < s.count; i++) inv.push({ id: 'w' + seq++, weaponId: s.weaponId, grade: s.grade })
  return {
    schemaVersion: SCHEMA,
    inventory: inv,
    equippedInstanceId: inv[0] ? inv[0].id : null,
    currency: 0,
    unlockedChapter: 1,
    firstCleared: [],
    awarded: [],
    bestResults: {},
    chests: [],
    nextSeq: seq,
    activeRun: null,
    seenHelp: false,
    perma: zeroPerma(),
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const int = (v) => Number.isInteger(v)
const num = (v) => typeof v === 'number' && Number.isFinite(v)

// a saved copy, checked field by field; anything unknown is dropped. A save
// from the first version (schema 1) is brought forward: weapons, coins,
// chapters, chests and records are kept, coin stats start at 0.
function validate(D, d) {
  if (!isObj(d) || (d.schemaVersion !== SCHEMA && d.schemaVersion !== 1)) throw new Error('형식이 맞지 않아요')
  const v1 = d.schemaVersion === 1
  const grades = D.balance.grades
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
  out.currency = num(d.currency) && d.currency >= 0 ? Math.floor(d.currency) : 0
  out.unlockedChapter = int(d.unlockedChapter) && d.unlockedChapter >= 1 ? Math.min(d.unlockedChapter, 99) : 1
  const keys = v1 ? (Array.isArray(d.lastAwardedRunIds) ? d.lastAwardedRunIds.map((id) => id + ':end') : []) : d.awarded
  out.awarded = Array.isArray(keys) ? keys.filter((x) => typeof x === 'string').slice(-KEEP_KEYS) : []
  out.bestResults = {}
  if (isObj(d.bestResults))
    for (const [ch, b] of Object.entries(d.bestResults))
      if (int(+ch) && isObj(b)) out.bestResults[ch] = { cleared: !!b.cleared, kills: num(b.kills) ? b.kills : 0, time: num(b.time) ? b.time : 0, elites: num(b.elites) ? b.elites : 0 }
  const fc = v1 ? Object.keys(out.bestResults).filter((ch) => out.bestResults[ch].cleared).map(Number) : d.firstCleared
  out.firstCleared = Array.isArray(fc) ? [...new Set(fc.filter((x) => int(x) && x >= 1))] : []
  out.chests = Array.isArray(d.chests) ? d.chests.filter((c) => isObj(c) && typeof c.id === 'string').map((c) => ({ id: c.id, chapter: int(c.chapter) ? c.chapter : 1 })) : []
  out.nextSeq = int(d.nextSeq) && d.nextSeq > 0 ? d.nextSeq : inventory.length + 1
  out.activeRun = isObj(d.activeRun) && typeof d.activeRun.runId === 'string' ? { runId: d.activeRun.runId, chapter: int(d.activeRun.chapter) ? d.activeRun.chapter : 1 } : null
  out.seenHelp = d.seenHelp === true
  if (isObj(d.perma)) for (const s of STATS) out.perma[s] = int(d.perma[s]) && d.perma[s] >= 0 ? d.perma[s] : 0
  // ids must keep growing past every id in use
  for (const it of inventory) {
    const n = +String(it.id).slice(1)
    if (int(n) && n >= out.nextSeq) out.nextSeq = n + 1
  }
  return out
}

// ── coin stats (pure) ───────────────────────────────────────────────────────

// the price of the next level of a stat bought `level` times already
export const statPrice = (D, stat, level) => Math.floor(D.balance.perma.stats[stat].price * D.balance.perma.priceGrowth ** level)
export const statMaxLevel = (D, stat) => {
  const s = D.balance.perma.stats[stat]
  if (s.maxLevel) return s.maxLevel
  if (s.add && s.max) return Math.round(s.max / s.add)
  return Infinity
}
// the multiplier (or the added amount, for crit) a stat gives at a level
export function statValue(D, stat, level) {
  const s = D.balance.perma.stats[stat]
  const L = Math.min(level, statMaxLevel(D, stat))
  if (s.add) return Math.min(s.max ?? Infinity, s.add * L)
  return s.mul ** L
}
// everything the coin stats change at the start of a run
export const permaEffects = (D, perma = {}) => Object.fromEntries(STATS.map((s) => [s, statValue(D, s, perma[s] || 0)]))

// ── the save ────────────────────────────────────────────────────────────────

// storage: an object with getItem / setItem (localStorage or a test double),
// or null when the browser does not allow saving (then nothing is kept)
export function createProgress(D, storage) {
  let memory = null // the copy used when saving is impossible
  let lastError = null
  const R = D.balance.rewards

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

  // reward coins for a chapter, with the coin stat
  const rewardCoins = (d, base, chapter) => Math.round(base * (1 + R.coinsPerChapter * (chapter - 1)) * statValue(D, 'coins', d.perma.coins))

  // spend a key once; false if it was spent before
  function spend(d, key) {
    if (d.awarded.includes(key)) return false
    d.awarded = [...d.awarded, key].slice(-KEEP_KEYS)
    return true
  }

  function addChests(d, runId, key, n, chapter) {
    const out = []
    for (let i = 0; i < n; i++) {
      const c = { id: `c${runId}:${key}:${i}`, chapter }
      d.chests.push(c)
      out.push(c)
    }
    return out
  }

  return {
    get: read,
    error: () => lastError,
    available: !!storage,

    // On opening the game: a run that never finished (page closed) ends;
    // everything already earned stays.
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

    // A new run gets an id now; each of its rewards can be paid only once.
    startRun(chapter) {
      return change((d) => {
        const runId = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
        d.activeRun = { runId, chapter }
        const eq = d.inventory.find((it) => it.id === d.equippedInstanceId) || d.inventory[0]
        return { runId, weapon: eq ? { ...eq } : null, perma: { ...d.perma } }
      })
    },

    // An elite or the boss fell: its chests and coins are saved at once.
    // key: 'elite1' | 'elite2' | 'boss'
    award(runId, chapter, key) {
      return change((d) => {
        if (!R[key] || !spend(d, `${runId}:${key}`)) return { already: true, chests: [], coins: 0 }
        const coins = rewardCoins(d, R[key].coins, chapter)
        d.currency += coins
        return { already: false, chests: addChests(d, runId, key, R[key].chests, chapter), coins }
      })
    },

    // The end of a run, won or lost: the coins picked up are kept; a clear
    // adds the clear reward, and the first clear of a chapter a bonus (and,
    // for some chapters, a C weapon of the kind equipped). Paid once.
    finishRun(runId, chapter, result) {
      return change((d) => {
        if (d.activeRun && d.activeRun.runId === runId) d.activeRun = null
        const out = { already: false, coins: 0, chests: [], firstClear: false, gift: null }
        if (!spend(d, `${runId}:end`)) return { ...out, already: true }
        out.coins = Math.max(0, Math.floor(result.coins || 0))
        if (result.cleared) {
          out.coins += rewardCoins(d, R.clear.coins, chapter)
          out.chests.push(...addChests(d, runId, 'clear', R.clear.chests, chapter))
          if (!d.firstCleared.includes(chapter)) {
            d.firstCleared.push(chapter)
            out.firstClear = true
            out.chests.push(...addChests(d, runId, 'first', R.firstClear.chests, chapter))
            const g = R.firstClearWeapon[chapter]
            if (g) {
              const eq = d.inventory.find((it) => it.id === d.equippedInstanceId) || d.inventory[0]
              const item = { id: 'w' + d.nextSeq++, weaponId: eq ? eq.weaponId : D.weapons.initialWeaponId, grade: g }
              d.inventory.push(item)
              out.gift = item
            }
          }
          d.unlockedChapter = Math.max(d.unlockedChapter, chapter + 1)
        }
        d.currency += out.coins
        const best = d.bestResults[chapter] || { cleared: false, kills: 0, time: 0, elites: 0 }
        d.bestResults[chapter] = {
          cleared: best.cleared || !!result.cleared,
          kills: Math.max(best.kills, result.kills || 0),
          time: Math.max(best.time, result.time || 0),
          elites: Math.max(best.elites, result.elites || 0),
        }
        return out
      })
    },

    // Leaving a run from the pause menu: it ends; the coins picked up so far
    // are kept (like a loss), nothing else is paid for it.
    abandonRun(runId, coins = 0) {
      return change((d) => {
        if (d.activeRun && d.activeRun.runId === runId) d.activeRun = null
        if (!spend(d, `${runId}:end`)) return 0
        const c = Math.max(0, Math.floor(coins))
        d.currency += c
        return c
      })
    },

    // Open a chest: it leaves the list and what it holds arrives, in one
    // write. What it holds comes from the chest's own id, so opening the same
    // chest twice (double tap, reload, two tabs) can never roll twice. Only
    // weapons that can really be played are rolled.
    openChest(chestId) {
      return change((d) => openOne(D, d, chestId))
    },

    // every chest at once (each still from its own id)
    openAll() {
      return change((d) => d.chests.slice().map((c) => openOne(D, d, c.id)).filter(Boolean))
    },

    // Three of the same weapon and grade become one of the next grade. All
    // checks first; nothing is removed unless the new weapon is made in the
    // same write.
    fuse(ids) {
      return change((d) => {
        const check = canFuse(D, d, ids)
        if (!check.ok) return check
        const items = ids.map((id) => d.inventory.find((it) => it.id === id))
        const grades = D.balance.grades
        const item = { id: 'w' + d.nextSeq++, weaponId: items[0].weaponId, grade: grades[grades.indexOf(items[0].grade) + 1] }
        d.inventory = d.inventory.filter((it) => !ids.includes(it.id))
        d.inventory.push(item)
        const wasEquipped = ids.includes(d.equippedInstanceId)
        if (wasEquipped) d.equippedInstanceId = item.id
        return { ok: true, item, equipped: wasEquipped }
      })
    },

    // Buy the next level of a coin stat. `fromLevel` is the level shown on
    // the button: a second tap (or a stale screen) finds the level moved on
    // and buys nothing.
    buyStat(stat, fromLevel) {
      return change((d) => {
        if (!STATS.includes(stat)) return { ok: false, reason: '없는 능력치예요.' }
        const L = d.perma[stat]
        if (L !== fromLevel) return { ok: false, reason: '이미 반영됐어요.' }
        if (L >= statMaxLevel(D, stat)) return { ok: false, reason: '최대 단계예요.' }
        const price = statPrice(D, stat, L)
        if (d.currency < price) return { ok: false, reason: '코인이 모자라요.' }
        d.currency -= price
        d.perma[stat] = L + 1
        return { ok: true, level: L + 1, price }
      })
    },
  }
}

function openOne(D, d, chestId) {
  const i = d.chests.findIndex((c) => c.id === chestId)
  if (i < 0) return null
  d.chests.splice(i, 1)
  const C = D.balance.chest
  const pool = D.weapons.registry.map((w) => w.id)
  const rolls = pool.length >= 4 ? C.rollsWhenFourWeapons : C.rollsPerChest
  const items = []
  for (let k = 0; k < rolls; k++) {
    const weaponId = pool[Math.floor(unitHash(chestId + ':w' + k) * pool.length)] || pool[0]
    const item = { id: 'w' + d.nextSeq++, weaponId, grade: rollGrade(D, unitHash(chestId + ':g' + k)) }
    d.inventory.push(item)
    items.push(item)
  }
  const coins = Math.round(C.coinsPerChest * statValue(D, 'coins', d.perma.coins))
  d.currency += coins
  return { chestId, items, coins }
}

export function canFuse(D, d, ids) {
  const grades = D.balance.grades
  if (!Array.isArray(ids) || ids.length !== D.balance.fusion.inputs || new Set(ids).size !== ids.length) return { ok: false, reason: '같은 무기 3개를 골라 주세요.' }
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
  const w = D.balance.chest.gradeWeights
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  let x = r * total
  for (const [g, n] of Object.entries(w)) {
    x -= n
    if (x < 0) return g
  }
  return Object.keys(w)[0]
}
