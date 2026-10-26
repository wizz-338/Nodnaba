// MANO SURVIVOR — 마노의 방 (room.js): which stage the room is at. Pure.
//
// The room grows in six stages with the coin stats' levels added up
// (data/room.json → stages): each stage at its own total. Nothing of it is
// stored: it is always worked out again from the save's levels.

// the coin stats' levels added up
export const roomTotal = (perma = {}) => Object.values(perma).reduce((a, n) => a + (Number.isFinite(n) && n > 0 ? n : 0), 0)

// the stage at a total (0 … 5)
export function roomStage(D, total) {
  const S = D.room.stages
  let i = 0
  while (i + 1 < S.length && total >= S[i + 1].need) i++
  return i
}

// where the room is on its way: its stage, the next one (null once the room
// is complete), the levels still wanted and the share of the way done from
// this stage to the next (1 when complete)
export function roomProgress(D, total) {
  const S = D.room.stages
  const i = roomStage(D, total)
  const next = S[i + 1] || null
  if (!next) return { stage: i, next: null, left: 0, share: 1 }
  const from = S[i].need
  return { stage: i, next, left: next.need - total, share: Math.max(0, Math.min(1, (total - from) / (next.need - from))) }
}
