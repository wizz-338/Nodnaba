// MANO SURVIVOR — the coin stats' numbers (balance.json → perma), shared by
// the shop (progress.js) and the run (game.js). Pure.
//
// A stat at level L (from 0): mul^L, or add × L (crit) up to its max. A stat
// may have a `past` step: from level past.from on, each level adds past.add
// to the value it had there (past.at) and its price grows by past.priceGrowth
// a level instead of the shop's priceGrowth (crit: 0.75% a level and ×1.2
// up to 50% as it always was, then 1.5% a level and ×1.05 up to 100%).

// the multiplier (or the added amount, for crit) a stat gives at a level
export function permaValue(s, level) {
  const L = Math.min(level, permaMaxLevel(s))
  if (!s.add) return s.mul ** L
  const P = s.past
  const v = P && L > P.from ? P.at + P.add * (L - P.from) : Math.min(P ? P.at : Infinity, s.add * L)
  return Math.min(s.max ?? Infinity, v)
}

// the last level a stat can be bought to (Infinity: none)
export function permaMaxLevel(s) {
  if (s.maxLevel) return s.maxLevel
  if (s.add && s.max) return s.past ? s.past.from + Math.ceil((s.max - s.past.at) / s.past.add - 1e-9) : Math.round(s.max / s.add)
  return Infinity
}

// the price of the next level of a stat bought `level` times already
// (growth: the shop's priceGrowth)
export function permaPrice(s, level, growth) {
  const P = s.past
  if (P && level >= P.from) return Math.floor(s.price * growth ** P.from * P.priceGrowth ** (level - P.from))
  return Math.floor(s.price * growth ** level)
}
